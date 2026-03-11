/**
 * Redirect Verification Engine
 * 
 * Verifies that deployed URLs and redirect targets are actually working
 * before allowing Telegram notifications to be sent.
 * 
 * Checks:
 * 1. Deployed URL is accessible (HTTP 200/301/302/307/308)
 * 2. Redirect chain leads to expected destination
 * 3. Final destination matches the configured redirect URL
 * 4. Handles edge cases: timeouts, SSL errors, WAF blocks, JS redirects
 */

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface RedirectHop {
  url: string;
  statusCode: number;
  headers: Record<string, string>;
}

export interface VerificationResult {
  /** Overall verification status */
  status: "verified" | "redirect_mismatch" | "dead_url" | "timeout" | "error" | "waf_blocked" | "partial";
  /** The deployed URL that was checked */
  deployedUrl: string;
  /** Expected redirect destination */
  expectedDestination: string | null;
  /** Actual final destination after following redirects */
  actualDestination: string | null;
  /** Full redirect chain */
  redirectChain: RedirectHop[];
  /** HTTP status code of the final response */
  finalStatusCode: number | null;
  /** Whether the redirect matches the expected destination */
  redirectMatches: boolean;
  /** Whether the deployed URL is accessible */
  isAccessible: boolean;
  /** Response time in ms */
  responseTimeMs: number;
  /** Human-readable details */
  details: string;
  /** Error message if any */
  error?: string;
}

export interface BatchVerificationResult {
  /** Total URLs checked */
  totalChecked: number;
  /** Number of verified URLs */
  verified: number;
  /** Number of dead/failed URLs */
  dead: number;
  /** Number of redirect mismatches */
  mismatched: number;
  /** Number of timeouts */
  timedOut: number;
  /** Individual results */
  results: VerificationResult[];
  /** Overall pass rate (0-100) */
  passRate: number;
  /** Summary text for Telegram */
  summary: string;
}

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const VERIFICATION_TIMEOUT = 15000; // 15 seconds per URL
const MAX_REDIRECTS = 10;
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

// WAF / security page indicators
const WAF_INDICATORS = [
  "attention required",
  "checking your browser",
  "just a moment",
  "cloudflare",
  "ddos protection",
  "access denied",
  "403 forbidden",
  "security check",
  "captcha",
  "challenge-platform",
  "ray id",
  "sucuri",
  "wordfence",
  "imunify360",
];

// ═══════════════════════════════════════════════════════
//  CORE: Verify Single URL
// ═══════════════════════════════════════════════════════

/**
 * Verify a single deployed URL by following its redirect chain
 * and checking if it reaches the expected destination.
 * 
 * Uses native fetch with redirect: "manual" to capture each hop.
 */
export async function verifyDeployedUrl(
  deployedUrl: string,
  expectedRedirectUrl?: string | null,
): Promise<VerificationResult> {
  const startTime = Date.now();
  const redirectChain: RedirectHop[] = [];
  let currentUrl = deployedUrl;
  let finalStatusCode: number | null = null;
  let isAccessible = false;
  let actualDestination: string | null = null;

  try {
    // Follow redirect chain manually to capture each hop
    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT);
      
      let response: Response;
      try {
        response = await fetch(currentUrl, {
          method: "GET",
          headers: {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
            "Referer": "https://www.google.com/",
          },
          redirect: "manual", // Don't auto-follow — we want to capture each hop
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const status = response.status;
      const location = response.headers.get("location") || "";
      const relevantHeaders: Record<string, string> = {};
      
      // Capture relevant headers
      for (const key of ["location", "content-type", "server", "x-redirect-by"]) {
        const val = response.headers.get(key);
        if (val) relevantHeaders[key] = val;
      }

      redirectChain.push({
        url: currentUrl,
        statusCode: status,
        headers: relevantHeaders,
      });

      finalStatusCode = status;

      // Check if this is a redirect (3xx)
      if (status >= 300 && status < 400 && location) {
        // Resolve relative URLs
        const nextUrl = location.startsWith("http") 
          ? location 
          : new URL(location, currentUrl).toString();
        currentUrl = nextUrl;
        continue;
      }

      // Not a redirect — this is the final destination
      isAccessible = status >= 200 && status < 400;
      actualDestination = currentUrl;

      // Check for WAF/security pages in the response body
      if (status === 200) {
        try {
          const bodyText = await response.text();
          const bodyLower = bodyText.toLowerCase().substring(0, 5000); // Only check first 5KB
          
          const isWafPage = WAF_INDICATORS.some(indicator => bodyLower.includes(indicator));
          if (isWafPage && bodyText.length < 10000) {
            // Small page with WAF indicators — likely a challenge page, not real content
            return {
              status: "waf_blocked",
              deployedUrl,
              expectedDestination: expectedRedirectUrl || null,
              actualDestination: currentUrl,
              redirectChain,
              finalStatusCode: status,
              redirectMatches: false,
              isAccessible: false,
              responseTimeMs: Date.now() - startTime,
              details: `WAF/security page detected at ${currentUrl}`,
            };
          }

          // Check for meta refresh or JS redirect in HTML
          const metaRefreshMatch = bodyText.match(/meta[^>]*http-equiv=["']refresh["'][^>]*content=["']\d+;\s*url=([^"']+)/i);
          const jsRedirectMatch = bodyText.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i) 
            || bodyText.match(/location\.replace\(["']([^"']+)["']\)/i);
          
          const softRedirect = metaRefreshMatch?.[1] || jsRedirectMatch?.[1];
          if (softRedirect) {
            // Found a JS/meta redirect — add to chain and record the target
            redirectChain.push({
              url: currentUrl,
              statusCode: 200,
              headers: { "x-redirect-type": metaRefreshMatch ? "meta-refresh" : "javascript" },
            });
            actualDestination = softRedirect.startsWith("http") 
              ? softRedirect 
              : new URL(softRedirect, currentUrl).toString();
            // Don't follow further — just record the JS redirect target
          }
        } catch {
          // Body read failed — still consider it accessible
        }
      }

      break; // Not a redirect, we're done
    }

    // If we exhausted max redirects
    if (redirectChain.length >= MAX_REDIRECTS && !actualDestination) {
      return {
        status: "error",
        deployedUrl,
        expectedDestination: expectedRedirectUrl || null,
        actualDestination: currentUrl,
        redirectChain,
        finalStatusCode,
        redirectMatches: false,
        isAccessible: false,
        responseTimeMs: Date.now() - startTime,
        details: `Too many redirects (${MAX_REDIRECTS}+ hops)`,
      };
    }

    // Determine if redirect matches expected destination
    const redirectMatches = checkRedirectMatch(actualDestination, expectedRedirectUrl);

    // Determine overall status
    let status: VerificationResult["status"];
    let details: string;

    if (!isAccessible) {
      status = "dead_url";
      details = `URL returned HTTP ${finalStatusCode} — not accessible`;
    } else if (expectedRedirectUrl && !redirectMatches) {
      status = "redirect_mismatch";
      details = `Expected redirect to ${expectedRedirectUrl} but got ${actualDestination}`;
    } else if (isAccessible && (!expectedRedirectUrl || redirectMatches)) {
      status = "verified";
      if (redirectChain.length > 1) {
        details = `Verified: ${redirectChain.length - 1} redirect(s) → ${actualDestination}`;
      } else {
        details = `Verified: Direct access, HTTP ${finalStatusCode}`;
      }
    } else {
      status = "partial";
      details = `Accessible but redirect verification inconclusive`;
    }

    return {
      status,
      deployedUrl,
      expectedDestination: expectedRedirectUrl || null,
      actualDestination,
      redirectChain,
      finalStatusCode,
      redirectMatches,
      isAccessible,
      responseTimeMs: Date.now() - startTime,
      details,
    };

  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    const isTimeout = error.name === "AbortError" || error.name === "TimeoutError" || elapsed >= VERIFICATION_TIMEOUT - 500;
    
    return {
      status: isTimeout ? "timeout" : "error",
      deployedUrl,
      expectedDestination: expectedRedirectUrl || null,
      actualDestination: null,
      redirectChain,
      finalStatusCode: null,
      redirectMatches: false,
      isAccessible: false,
      responseTimeMs: elapsed,
      details: isTimeout 
        ? `Timeout after ${Math.round(elapsed / 1000)}s — URL may be slow or blocked`
        : `Error: ${error.message}`,
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════
//  BATCH VERIFICATION
// ═══════════════════════════════════════════════════════

/**
 * Verify multiple deployed URLs in parallel.
 * Returns aggregated results with pass rate.
 */
export async function verifyDeployedUrls(
  urls: string[],
  expectedRedirectUrl?: string | null,
  concurrency: number = 3,
): Promise<BatchVerificationResult> {
  const results: VerificationResult[] = [];
  
  // Process in batches to avoid overwhelming the network
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(url => verifyDeployedUrl(url, expectedRedirectUrl))
    );
    
    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push({
          status: "error",
          deployedUrl: batch[j] || "unknown",
          expectedDestination: expectedRedirectUrl || null,
          actualDestination: null,
          redirectChain: [],
          finalStatusCode: null,
          redirectMatches: false,
          isAccessible: false,
          responseTimeMs: 0,
          details: `Verification failed: ${result.reason?.message || "unknown error"}`,
          error: result.reason?.message,
        });
      }
    }
  }

  const verified = results.filter(r => r.status === "verified").length;
  const dead = results.filter(r => r.status === "dead_url").length;
  const mismatched = results.filter(r => r.status === "redirect_mismatch").length;
  const timedOut = results.filter(r => r.status === "timeout").length;
  const passRate = results.length > 0 ? Math.round((verified / results.length) * 100) : 0;

  // Build summary
  const summaryParts: string[] = [];
  if (verified > 0) summaryParts.push(`✅ ${verified} verified`);
  if (dead > 0) summaryParts.push(`💀 ${dead} dead`);
  if (mismatched > 0) summaryParts.push(`⚠️ ${mismatched} mismatch`);
  if (timedOut > 0) summaryParts.push(`⏱ ${timedOut} timeout`);
  
  const summary = summaryParts.length > 0 
    ? summaryParts.join(" | ") 
    : "No URLs to verify";

  return {
    totalChecked: results.length,
    verified,
    dead,
    mismatched,
    timedOut,
    results,
    passRate,
    summary,
  };
}

// ═══════════════════════════════════════════════════════
//  QUICK VERIFICATION (for Telegram filter)
// ═══════════════════════════════════════════════════════

/**
 * Quick verification for the Telegram notification filter.
 * Checks if at least one deployed URL is working and redirects correctly.
 * Returns true if the notification should be sent, false if it should be blocked.
 */
export async function shouldSendNotification(
  deployedUrls: string[],
  redirectUrl?: string | null,
): Promise<{
  shouldSend: boolean;
  verifiedCount: number;
  totalCount: number;
  verificationSummary: string;
  redirectChainText: string;
  results: VerificationResult[];
}> {
  if (!deployedUrls || deployedUrls.length === 0) {
    return {
      shouldSend: false,
      verifiedCount: 0,
      totalCount: 0,
      verificationSummary: "No deployed URLs to verify",
      redirectChainText: "",
      results: [],
    };
  }

  // Verify all deployed URLs (max 5 to keep it fast)
  const urlsToCheck = deployedUrls.slice(0, 5);
  const batchResult = await verifyDeployedUrls(urlsToCheck, redirectUrl, 3);

  // Build redirect chain text for Telegram message
  const chainTexts: string[] = [];
  for (const result of batchResult.results) {
    if (result.status === "verified" && result.redirectChain.length > 0) {
      const chain = result.redirectChain
        .map(hop => `${hop.statusCode}`)
        .join(" → ");
      const dest = result.actualDestination || "unknown";
      chainTexts.push(`${result.deployedUrl} [${chain}] → ${dest}`);
    }
  }

  // Decision: Send if at least 1 URL is verified
  const shouldSend = batchResult.verified > 0;

  return {
    shouldSend,
    verifiedCount: batchResult.verified,
    totalCount: batchResult.totalChecked,
    verificationSummary: batchResult.summary,
    redirectChainText: chainTexts.join("\n"),
    results: batchResult.results,
  };
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Check if the actual destination matches the expected redirect URL.
 * Uses fuzzy matching to handle trailing slashes, www prefixes, etc.
 */
export function checkRedirectMatch(
  actualDestination: string | null,
  expectedRedirectUrl?: string | null,
): boolean {
  if (!expectedRedirectUrl || !actualDestination) return false;

  const normalizeUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      // Normalize: lowercase host, remove trailing slash, remove www
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      const path = parsed.pathname.replace(/\/$/, "") || "/";
      return `${host}${path}`;
    } catch {
      return url.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    }
  };

  const normalActual = normalizeUrl(actualDestination);
  const normalExpected = normalizeUrl(expectedRedirectUrl);

  // Exact match after normalization
  if (normalActual === normalExpected) return true;

  // Check if actual contains expected domain (e.g., redirect to homepage with extra path)
  const expectedDomain = normalExpected.split("/")[0];
  const actualDomain = normalActual.split("/")[0];
  if (actualDomain === expectedDomain) return true;

  return false;
}
