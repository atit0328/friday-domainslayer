/**
 * AI Attack Recommender — Quick recon + AI analysis → top 3 methods for user to choose
 * 
 * Flow: domain → quick fingerprint+CMS (15s) → AI ranks methods → present 3 choices
 * This replaces the old "AAA auto full_chain" that would hang on heavy vuln scan
 */

import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface QuickReconResult {
  server: string;
  waf: string | null;
  cdn: string | null;
  cms: string;
  cmsVersion: string;
  phpVersion: string;
  ssl: boolean;
  ip: string;
  adminUrl: string;
  exposedPanels: string[];
  openPorts: number[];
  hasWordPress: boolean;
  hasJoomla: boolean;
  hasDrupal: boolean;
  hasLaravel: boolean;
  isIIS: boolean;
  poweredBy: string;
  interestingHeaders: Record<string, string>;
  scanDurationMs: number;
}

export interface AttackRecommendation {
  id: string;
  name: string;
  icon: string;
  confidence: "high" | "medium" | "low";
  confidencePercent: number;
  reason: string;
  estimatedTime: string;
  technique: string;
}

export interface RecommendationResult {
  recon: QuickReconResult;
  recommendations: AttackRecommendation[];
  aiAnalysis: string;
  totalTimeMs: number;
}

// ═══════════════════════════════════════════════════════
//  QUICK RECON (15s max — no LLM, pure HTTP)
// ═══════════════════════════════════════════════════════

async function quickFetch(url: string, options: RequestInit = {}, timeoutMs = 6000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...options.headers,
      },
    });
    clearTimeout(timer);
    return resp;
  } catch {
    return null;
  }
}

export async function quickRecon(domain: string, targetUrl?: string): Promise<QuickReconResult> {
  const start = Date.now();
  const baseUrl = `https://${domain}`;
  // If user specified a full URL with path, also scan that path
  const hasSpecificPath = targetUrl && targetUrl !== baseUrl && targetUrl !== `${baseUrl}/`;
  
  const result: QuickReconResult = {
    server: "unknown",
    waf: null,
    cdn: null,
    cms: "unknown",
    cmsVersion: "",
    phpVersion: "",
    ssl: true,
    ip: "",
    adminUrl: "",
    exposedPanels: [],
    openPorts: [],
    hasWordPress: false,
    hasJoomla: false,
    hasDrupal: false,
    hasLaravel: false,
    isIIS: false,
    poweredBy: "",
    interestingHeaders: {},
    scanDurationMs: 0,
  };
  
  // ── Parallel quick checks (all within 6s timeout) ──
  const [mainResp, wpResp, joomlaResp, drupalResp, dnsResp] = await Promise.allSettled([
    quickFetch(baseUrl),
    quickFetch(`${baseUrl}/wp-login.php`, {}, 4000),
    quickFetch(`${baseUrl}/administrator/`, {}, 4000),
    quickFetch(`${baseUrl}/core/CHANGELOG.txt`, {}, 4000),
    quickFetch(`https://dns.google/resolve?name=${domain}&type=A`, {}, 3000),
  ]);
  
  // ── Parse main response headers ──
  if (mainResp.status === "fulfilled" && mainResp.value) {
    const resp = mainResp.value;
    const headers = Object.fromEntries(resp.headers.entries());
    result.server = headers["server"] || "unknown";
    result.poweredBy = headers["x-powered-by"] || "";
    result.phpVersion = (headers["x-powered-by"] || "").match(/PHP\/([\d.]+)/i)?.[1] || "";
    result.interestingHeaders = {};
    
    // WAF detection
    const serverLower = result.server.toLowerCase();
    if (headers["cf-ray"] || serverLower.includes("cloudflare")) result.waf = "Cloudflare";
    else if (serverLower.includes("sucuri")) result.waf = "Sucuri";
    else if (headers["x-sucuri-id"]) result.waf = "Sucuri";
    else if (serverLower.includes("akamai")) result.waf = "Akamai";
    else if (headers["x-cdn"] === "Incapsula") result.waf = "Incapsula";
    
    // CDN detection
    if (headers["cf-ray"]) result.cdn = "Cloudflare";
    else if (headers["x-cache"]?.includes("HIT")) result.cdn = headers["via"]?.split(" ").pop() || "CDN";
    
    // IIS detection
    if (serverLower.includes("microsoft-iis") || serverLower.includes("iis")) result.isIIS = true;
    
    // Laravel detection
    if (result.poweredBy.toLowerCase().includes("laravel") || headers["x-powered-by"]?.includes("Laravel")) {
      result.hasLaravel = true;
    }
    
    // Check body for CMS hints
    try {
      const body = await resp.text();
      if (body.includes("wp-content") || body.includes("wp-includes") || body.includes("wordpress")) {
        result.hasWordPress = true;
        result.cms = "wordpress";
        // Try to extract WP version
        const verMatch = body.match(/content="WordPress ([\d.]+)"/i) || body.match(/ver=([\d.]+)/);
        if (verMatch) result.cmsVersion = verMatch[1];
      }
      if (body.includes("/media/jui/") || body.includes("Joomla!")) {
        result.hasJoomla = true;
        if (result.cms === "unknown") result.cms = "joomla";
      }
      if (body.includes("Drupal.settings") || body.includes("drupal.js")) {
        result.hasDrupal = true;
        if (result.cms === "unknown") result.cms = "drupal";
      }
      if (body.includes("laravel") || body.includes("csrf-token")) {
        result.hasLaravel = true;
      }
      
      // Interesting headers for attack surface
      for (const [k, v] of Object.entries(headers)) {
        if (["x-debug", "x-runtime", "x-request-id", "x-aspnet-version", "x-aspnetmvc-version"].includes(k.toLowerCase())) {
          result.interestingHeaders[k] = v;
        }
      }
    } catch {}
  }
  
  // ── WordPress check ──
  if (wpResp.status === "fulfilled" && wpResp.value) {
    const status = wpResp.value.status;
    if (status === 200 || status === 302) {
      result.hasWordPress = true;
      result.cms = "wordpress";
      result.adminUrl = `${baseUrl}/wp-admin/`;
    }
  }
  
  // ── Joomla check ──
  if (joomlaResp.status === "fulfilled" && joomlaResp.value) {
    if (joomlaResp.value.status === 200) {
      result.hasJoomla = true;
      if (result.cms === "unknown") result.cms = "joomla";
      result.adminUrl = `${baseUrl}/administrator/`;
    }
  }
  
  // ── Drupal check ──
  if (drupalResp.status === "fulfilled" && drupalResp.value) {
    if (drupalResp.value.status === 200) {
      result.hasDrupal = true;
      if (result.cms === "unknown") result.cms = "drupal";
    }
  }
  
  // ── DNS IP ──
  if (dnsResp.status === "fulfilled" && dnsResp.value) {
    try {
      const dns = await dnsResp.value.json();
      if (dns.Answer && dns.Answer.length > 0) {
        result.ip = dns.Answer[dns.Answer.length - 1].data || "";
      }
    } catch {}
  }
  
  // ── Quick panel check (parallel, 3s each) ──
  const panelChecks = await Promise.allSettled([
    quickFetch(`https://${domain}:2083/`, {}, 3000),
    quickFetch(`https://${domain}:2087/`, {}, 3000),
    quickFetch(`https://${domain}:8443/`, {}, 3000),
    quickFetch(`${baseUrl}/phpmyadmin/`, {}, 3000),
    quickFetch(`${baseUrl}/cpanel`, {}, 3000),
  ]);
  
  const panelNames = ["cPanel:2083", "WHM:2087", "Plesk:8443", "phpMyAdmin", "cPanel-redirect"];
  panelChecks.forEach((p, i) => {
    if (p.status === "fulfilled" && p.value && (p.value.status === 200 || p.value.status === 301 || p.value.status === 302)) {
      result.exposedPanels.push(panelNames[i]);
    }
  });
  
  // ── Path-specific redirect check (if user specified a path like /events or /menus) ──
  if (hasSpecificPath) {
    try {
      const pathResp = await quickFetch(targetUrl!, { redirect: "manual" }, 5000);
      if (pathResp) {
        const status = pathResp.status;
        const location = pathResp.headers.get("location") || "";
        if (status >= 300 && status < 400 && location) {
          result.interestingHeaders["path_redirect_status"] = String(status);
          result.interestingHeaders["path_redirect_location"] = location;
          result.interestingHeaders["path_redirect_target"] = targetUrl!;
        } else if (status === 200) {
          // Check for meta/JS redirect in body
          try {
            const body = await pathResp.text();
            const metaRedirect = body.match(/meta\s+http-equiv=["']refresh["'][^>]*content=["']\d+;\s*url=([^"']+)/i);
            const jsRedirect = body.match(/(?:window\.location|location\.href|location\.replace)\s*[=\(]\s*["']([^"']+)/i);
            if (metaRedirect || jsRedirect) {
              result.interestingHeaders["path_redirect_type"] = metaRedirect ? "meta_refresh" : "javascript";
              result.interestingHeaders["path_redirect_dest"] = (metaRedirect?.[1] || jsRedirect?.[1] || "").substring(0, 200);
              result.interestingHeaders["path_redirect_target"] = targetUrl!;
            }
            // Check for gambling/casino content at path
            const gamblingKeywords = ["casino", "slot", "poker", "betting", "gambling", "หวย", "บาคาร่า", "สล็อต", "แทงหวย"];
            const bodyLower = body.toLowerCase();
            const foundGambling = gamblingKeywords.filter(kw => bodyLower.includes(kw));
            if (foundGambling.length >= 2) {
              result.interestingHeaders["path_gambling_content"] = foundGambling.join(",");
            }
          } catch {}
        }
      }
    } catch {}
  }
  
  result.scanDurationMs = Date.now() - start;
  return result;
}

// ═══════════════════════════════════════════════════════
//  AI ANALYSIS + RECOMMENDATION
// ═══════════════════════════════════════════════════════

const ATTACK_METHODS_DB: Array<{
  id: string;
  name: string;
  icon: string;
  applicableCms: string[];
  keywords: string[];
  baseConfidence: number;
  estimatedTime: string;
  technique: string;
}> = [
  { id: "full_chain", name: "Full Chain Attack (20 วิธี)", icon: "💥", applicableCms: ["*"], keywords: ["universal", "all"], baseConfidence: 70, estimatedTime: "5-15 นาที", technique: "รัน 20 วิธีโจมตีอัตโนมัติ ตั้งแต่ upload, inject, hijack, credential hunt" },
  { id: "pipeline", name: "Unified Attack Pipeline", icon: "🚀", applicableCms: ["*"], keywords: ["upload", "writable", "webdav", "put"], baseConfidence: 65, estimatedTime: "3-8 นาที", technique: "Upload redirect file ผ่าน HTTP PUT/POST, writable paths, form upload, FTP/SSH/cPanel" },
  { id: "cloaking", name: "PHP Cloaking Injection", icon: "💊", applicableCms: ["wordpress"], keywords: ["php", "functions.php", "htaccess"], baseConfidence: 60, estimatedTime: "2-5 นาที", technique: "Inject PHP redirect code ใน functions.php หรือ .htaccess ผ่าน WP vulnerabilities" },
  { id: "mu_plugins", name: "MU-Plugins Backdoor", icon: "💀", applicableCms: ["wordpress"], keywords: ["mu-plugin", "must-use", "auto-load"], baseConfidence: 55, estimatedTime: "2-4 นาที", technique: "Upload PHP file ไปที่ wp-content/mu-plugins/ ซึ่ง auto-load ทุก request" },
  { id: "db_siteurl", name: "DB siteurl/home Hijack", icon: "🗄️", applicableCms: ["wordpress"], keywords: ["database", "siteurl", "wp_options"], baseConfidence: 50, estimatedTime: "2-5 นาที", technique: "แก้ไข siteurl/home ใน wp_options ผ่าน SQL injection หรือ phpMyAdmin" },
  { id: "hijack", name: "Credential Hunt + Hijack", icon: "🔓", applicableCms: ["*"], keywords: ["credential", "brute", "ftp", "ssh", "cpanel", "phpmyadmin"], baseConfidence: 55, estimatedTime: "3-8 นาที", technique: "ค้นหา breach credentials แล้ว login FTP/SSH/cPanel/phpMyAdmin เพื่อ upload redirect" },
  { id: "redirect_only", name: "Redirect Takeover ตรง", icon: "🎯", applicableCms: ["*"], keywords: ["redirect", "301", "htaccess", "meta refresh"], baseConfidence: 45, estimatedTime: "1-3 นาที", technique: "Overwrite .htaccess, index.php, หรือ meta refresh redirect โดยตรง" },
  { id: "gtm_inject", name: "GTM/Header Inject", icon: "🏷️", applicableCms: ["wordpress"], keywords: ["gtm", "tag manager", "header", "footer", "wpcode"], baseConfidence: 50, estimatedTime: "2-4 นาที", technique: "Inject redirect ผ่าน Google Tag Manager, WPCode, หรือ header/footer plugins" },
  { id: "advanced", name: "Advanced Deploy (5 เทคนิค)", icon: "🚀", applicableCms: ["wordpress"], keywords: ["parasite", "doorway", "seo"], baseConfidence: 45, estimatedTime: "3-6 นาที", technique: "Parasite SEO, doorway pages, cloaked content injection" },
  { id: "agentic_auto", name: "AI Autonomous Attack", icon: "🤖", applicableCms: ["*"], keywords: ["ai", "autonomous", "adaptive"], baseConfidence: 60, estimatedTime: "5-10 นาที", technique: "AI วิเคราะห์และโจมตีอัตโนมัติ ปรับ strategy ตาม response แบบ real-time" },
  { id: "cpanel_full", name: "cPanel Full Control", icon: "🖥️", applicableCms: ["*"], keywords: ["cpanel", "whm", "file manager"], baseConfidence: 50, estimatedTime: "2-5 นาที", technique: "Login cPanel/WHM ด้วย breach creds แล้ว upload redirect ผ่าน File Manager" },
  { id: "joomla", name: "Joomla Exploits", icon: "🔴", applicableCms: ["joomla"], keywords: ["joomla", "com_fields", "com_content"], baseConfidence: 55, estimatedTime: "2-5 นาที", technique: "Exploit Joomla vulnerabilities: com_fields SQLi, template injection, API abuse" },
  { id: "drupal", name: "Drupal Exploits", icon: "🔵", applicableCms: ["drupal"], keywords: ["drupal", "drupalgeddon"], baseConfidence: 55, estimatedTime: "2-5 นาที", technique: "Exploit Drupal vulnerabilities: Drupalgeddon, theme injection, module abuse" },
  { id: "iis_aspnet", name: "IIS/ASP.NET Exploits", icon: "🪟", applicableCms: ["iis", "aspnet"], keywords: ["iis", "aspx", "web.config"], baseConfidence: 45, estimatedTime: "2-5 นาที", technique: "Exploit IIS/ASP.NET: web.config injection, .aspx upload, short filename" },
  { id: "laravel_inject", name: "Laravel Inject", icon: "🟥", applicableCms: ["laravel"], keywords: ["laravel", ".env", "ignition"], baseConfidence: 50, estimatedTime: "2-4 นาที", technique: "Exploit Laravel: .env leak, Ignition RCE, debug mode abuse" },
  { id: "deep_redirect_scan", name: "Deep Redirect Vulnerability Scan", icon: "🔍", applicableCms: ["*"], keywords: ["redirect", "open redirect", "cname", "php code", "cloaking", "geo-cloaking", "gambling"], baseConfidence: 70, estimatedTime: "1-3 นาที", technique: "สแกนลึก 10 ประเภท: Open Redirect, PHP code, cloaking, CNAME dangling, redirect chain, WP plugins, path-specific redirects, Geo-Cloaking (UA/GeoIP detection)" },
];

export async function getAttackRecommendations(
  domain: string,
  recon: QuickReconResult,
  targetUrl?: string,
): Promise<RecommendationResult> {
  const start = Date.now();
  
  // ── Fetch historical success rates from adaptive-learning (5s max) ──
  let historicalRates: Array<{ method: string; attempts: number; successes: number; successRate: number }> = [];
  let historicalSummary = "";
  try {
    const histResult = await Promise.race([
      (async () => {
        const { calculateMethodSuccessRates, queryHistoricalPatterns } = await import("./adaptive-learning");
        const rates: typeof historicalRates = [];
        let summary = "";
        
        // Get overall method success rates
        const allRates = await calculateMethodSuccessRates();
        if (allRates.length > 0) rates.push(...allRates);
        
        // Get CMS-specific rates if CMS is known (single query, skip if unknown)
        if (recon.cms !== "unknown") {
          const cmsRates = await calculateMethodSuccessRates({ cms: recon.cms, minAttempts: 1 });
          if (cmsRates.length > 0) {
            summary += `CMS (${recon.cms}): ` + cmsRates.slice(0, 5).map(r => `${r.method}:${r.successRate}%`).join(", ");
          }
        }
        
        return { rates, summary };
      })(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
    ]);
    
    if (histResult) {
      historicalRates = histResult.rates;
      historicalSummary = histResult.summary;
    } else {
      console.warn(`[AIRecommender] Historical data fetch timed out (5s) — skipping`);
    }
  } catch (err: any) {
    console.warn(`[AIRecommender] Historical data fetch failed: ${err.message}`);
  }
  
  // ── Build context for AI ──
  const reconSummary = [
    `Domain: ${domain}`,
    `Server: ${recon.server}`,
    `WAF: ${recon.waf || "none"}`,
    `CDN: ${recon.cdn || "none"}`,
    `CMS: ${recon.cms} ${recon.cmsVersion ? `v${recon.cmsVersion}` : ""}`.trim(),
    `PHP: ${recon.phpVersion || "unknown"}`,
    `IP: ${recon.ip || "unknown"}`,
    `SSL: ${recon.ssl}`,
    `IIS: ${recon.isIIS}`,
    `Laravel: ${recon.hasLaravel}`,
    `Exposed Panels: ${recon.exposedPanels.length > 0 ? recon.exposedPanels.join(", ") : "none"}`,
    `Admin URL: ${recon.adminUrl || "not found"}`,
    `Powered By: ${recon.poweredBy || "unknown"}`,
    targetUrl ? `Target URL: ${targetUrl}` : "",
  ].filter(Boolean).join("\n");

  // Add redirect hint if target URL has a path
  let redirectHint = "";
  if (targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.pathname && parsed.pathname !== "/") {
        redirectHint = `\n\nหมายเหตุ: เป้าหมายคือโจมตีที่ path ${parsed.pathname} โดยเฉพาะ — ให้ความสำคัญกับ deep_redirect_scan และวิธีที่เกี่ยวกับ redirect`;
      }
    } catch {}
  }
  
  // ── Filter applicable methods ──
  const applicableMethods = ATTACK_METHODS_DB.filter(m => {
    if (m.applicableCms.includes("*")) return true;
    if (m.applicableCms.includes(recon.cms)) return true;
    if (recon.cms === "unknown") return true; // unknown CMS → try everything
    if (m.id === "joomla" && !recon.hasJoomla) return false;
    if (m.id === "drupal" && !recon.hasDrupal) return false;
    if (m.id === "iis_aspnet" && !recon.isIIS) return false;
    if (m.id === "laravel_inject" && !recon.hasLaravel) return false;
    return false;
  });
  
  // ── Adjust confidence based on recon + historical data ──
  for (const m of applicableMethods) {
    // WAF penalty
    if (recon.waf) {
      if (m.id !== "hijack" && m.id !== "agentic_auto" && m.id !== "cpanel_full") {
        m.baseConfidence -= 15;
      }
    }
    // CMS match bonus
    if (recon.cms !== "unknown" && m.applicableCms.includes(recon.cms)) {
      m.baseConfidence += 10;
    }
    // Exposed panel bonus
    if (recon.exposedPanels.length > 0) {
      if (m.id === "hijack" || m.id === "cpanel_full") m.baseConfidence += 15;
      if (m.id === "db_siteurl" && recon.exposedPanels.some(p => p.includes("phpMyAdmin"))) m.baseConfidence += 20;
    }
    // Old PHP bonus
    if (recon.phpVersion && parseFloat(recon.phpVersion) < 8.0) {
      m.baseConfidence += 5;
    }
    
    // ── Historical success rate adjustment ──
    const histRate = historicalRates.find(r => r.method === m.id || m.keywords.some(k => r.method.includes(k)));
    if (histRate && histRate.attempts >= 3) {
      // Blend historical rate with base confidence (weight: 40% history, 60% base)
      const historicalWeight = Math.min(0.4, histRate.attempts / 50); // More data = more weight, max 40%
      m.baseConfidence = Math.round(
        m.baseConfidence * (1 - historicalWeight) + histRate.successRate * historicalWeight
      );
    }
    
    // Clamp
    m.baseConfidence = Math.max(5, Math.min(95, m.baseConfidence));
  }
  
  // ── Ask AI to rank and explain (with 10s timeout) ──
  let aiAnalysis = "";
  let aiRanking: string[] = [];
  
  try {
    const methodList = applicableMethods.map(m => 
      `- ${m.id}: ${m.name} (${m.icon}) — ${m.technique} [base: ${m.baseConfidence}%]`
    ).join("\n");
    
    const aiResponse = await Promise.race([
      invokeLLM({
        messages: [
          {
            role: "system",
            content: `คุณเป็น AI ผู้เชี่ยวชาญด้านการโจมตีเว็บไซต์ (penetration testing) วิเคราะห์ข้อมูล recon แล้วเลือก 3 วิธีโจมตีที่ดีที่สุดสำหรับเป้าหมายนี้

ตอบเป็น JSON เท่านั้น:
{
  "analysis": "วิเคราะห์สั้นๆ 2-3 ประโยค ว่าเว็บนี้มีจุดอ่อนอะไร",
  "top3": ["method_id_1", "method_id_2", "method_id_3"],
  "reasons": {
    "method_id_1": "เหตุผลสั้นๆ ว่าทำไมวิธีนี้น่าจะได้ผล",
    "method_id_2": "เหตุผล",
    "method_id_3": "เหตุผล"
  },
  "confidence_adjustments": {
    "method_id_1": 75,
    "method_id_2": 60,
    "method_id_3": 45
  }
}`
          },
          {
            role: "user",
            content: `ข้อมูล Recon:\n${reconSummary}\n\nวิธีโจมตีที่ใช้ได้:\n${methodList}${historicalSummary ? `\n\n=== Historical Attack Data (จากการโจมตีจริงในอดีต) ===\n${historicalSummary}\n\nให้น้ำหนักกับ historical data มาก — วิธีที่เคยสำเร็จบ่อยควรได้ confidence สูงกว่า` : ""}${redirectHint}\n\nเลือก 3 วิธีที่ดีที่สุด:`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "attack_recommendation",
            strict: true,
            schema: {
              type: "object",
              properties: {
                analysis: { type: "string" },
                top3: { type: "array", items: { type: "string" } },
                reasons: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                confidence_adjustments: {
                  type: "object",
                  additionalProperties: { type: "number" },
                },
              },
              required: ["analysis", "top3", "reasons", "confidence_adjustments"],
              additionalProperties: false,
            },
          },
        },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);
    
    if (aiResponse && aiResponse.choices?.[0]?.message?.content) {
      const rawContent = aiResponse.choices[0].message.content;
      const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
      const parsed = JSON.parse(contentStr);
      aiAnalysis = parsed.analysis || "";
      aiRanking = (parsed.top3 || []).filter((id: string) => applicableMethods.some(m => m.id === id));
      
      // Apply AI confidence adjustments
      if (parsed.confidence_adjustments) {
        for (const [id, conf] of Object.entries(parsed.confidence_adjustments)) {
          const method = applicableMethods.find(m => m.id === id);
          if (method && typeof conf === "number") {
            method.baseConfidence = Math.max(5, Math.min(95, conf as number));
          }
        }
      }
      
      // Apply AI reasons
      if (parsed.reasons) {
        for (const m of applicableMethods) {
          if (parsed.reasons[m.id]) {
            m.technique = parsed.reasons[m.id];
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`[AIRecommender] AI analysis failed: ${err.message}`);
  }
  
  // ── Build final recommendations ──
  // Use AI ranking if available, otherwise sort by confidence
  let topMethods: typeof applicableMethods;
  if (aiRanking.length >= 3) {
    topMethods = aiRanking
      .map(id => applicableMethods.find(m => m.id === id))
      .filter(Boolean) as typeof applicableMethods;
  } else {
    topMethods = [...applicableMethods]
      .sort((a, b) => b.baseConfidence - a.baseConfidence)
      .slice(0, 3);
  }
  
  // Ensure we always have 3 recommendations
  while (topMethods.length < 3 && applicableMethods.length > topMethods.length) {
    const remaining = applicableMethods.filter(m => !topMethods.includes(m));
    if (remaining.length > 0) {
      topMethods.push(remaining.sort((a, b) => b.baseConfidence - a.baseConfidence)[0]);
    } else break;
  }
  
  const recommendations: AttackRecommendation[] = topMethods.map(m => ({
    id: m.id,
    name: m.name,
    icon: m.icon,
    confidence: m.baseConfidence >= 65 ? "high" as const : m.baseConfidence >= 40 ? "medium" as const : "low" as const,
    confidencePercent: m.baseConfidence,
    reason: m.technique,
    estimatedTime: m.estimatedTime,
    technique: m.technique,
  }));
  
  // If no AI analysis, generate a simple one
  if (!aiAnalysis) {
    const parts: string[] = [];
    if (recon.cms !== "unknown") parts.push(`CMS: ${recon.cms.toUpperCase()}`);
    if (recon.waf) parts.push(`WAF: ${recon.waf} (ลดโอกาสสำเร็จ)`);
    if (recon.exposedPanels.length > 0) parts.push(`พบ panels: ${recon.exposedPanels.join(", ")}`);
    if (recon.phpVersion) parts.push(`PHP ${recon.phpVersion}`);
    aiAnalysis = parts.length > 0 
      ? `พบข้อมูล: ${parts.join(", ")}. แนะนำวิธีโจมตีตาม CMS และ attack surface ที่พบ.`
      : `ไม่พบข้อมูล CMS/panel ชัดเจน แนะนำใช้ Full Chain เพื่อลองทุกวิธี`;
  }
  
  return {
    recon,
    recommendations,
    aiAnalysis,
    totalTimeMs: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  FORMAT TELEGRAM MESSAGE
// ═══════════════════════════════════════════════════════

export function formatRecommendationMessage(
  domain: string,
  result: RecommendationResult,
): string {
  const { recon, recommendations, aiAnalysis } = result;
  
  const confidenceEmoji: Record<string, string> = { high: "🟢", medium: "🟡", low: "🔴" };
  
  let msg = `🔍 Quick Recon: ${domain}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🖥️ Server: ${recon.server}\n`;
  if (recon.waf) msg += `🛡️ WAF: ${recon.waf}\n`;
  if (recon.cms !== "unknown") msg += `💻 CMS: ${recon.cms.toUpperCase()}${recon.cmsVersion ? ` v${recon.cmsVersion}` : ""}\n`;
  if (recon.phpVersion) msg += `🐘 PHP: ${recon.phpVersion}\n`;
  if (recon.ip) msg += `🌐 IP: ${recon.ip}\n`;
  if (recon.exposedPanels.length > 0) msg += `🚪 Panels: ${recon.exposedPanels.join(", ")}\n`;
  msg += `⏱️ Scan: ${(recon.scanDurationMs / 1000).toFixed(1)}s\n`;
  msg += `\n`;
  msg += `🤖 AI วิเคราะห์:\n${aiAnalysis}\n`;
  msg += `\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🎯 เลือกวิธีโจมตี:\n\n`;
  
  recommendations.forEach((rec, i) => {
    msg += `${i + 1}. ${rec.icon} ${rec.name}\n`;
    msg += `   ${confidenceEmoji[rec.confidence]} ${rec.confidencePercent}% | ⏱️ ${rec.estimatedTime}\n`;
    msg += `   💡 ${rec.reason}\n\n`;
  });
  
  return msg;
}

export function buildRecommendationKeyboard(
  domain: string,
  recommendations: AttackRecommendation[],
): Array<Array<{ text: string; callback_data: string }>> {
  const confidenceEmoji: Record<string, string> = { high: "🟢", medium: "🟡", low: "🔴" };
  
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  
  // Telegram callback_data limit = 64 bytes
  // Truncate domain if needed to keep callback_data under limit
  const maxDomainLen = 30;
  const shortDomain = domain.length > maxDomainLen ? domain.substring(0, maxDomainLen) : domain;
  
  // Each recommendation gets its own row
  for (const rec of recommendations) {
    const cbData = `atk_confirm:${shortDomain}:${rec.id}`;
    // Safety: ensure under 64 bytes
    keyboard.push([{
      text: `${rec.icon} ${rec.name} ${confidenceEmoji[rec.confidence]} ${rec.confidencePercent}%`,
      callback_data: cbData.length <= 64 ? cbData : cbData.substring(0, 64),
    }]);
  }
  
  // Add "run all 3" row — use short method IDs to stay under 64 bytes
  // Format: atk_top3:domain:m1,m2,m3 (shorter prefix)
  const methodIds = recommendations.map(r => r.id).join(",");
  const top3CbData = `atk_top3:${shortDomain}:${methodIds}`;
  keyboard.push([{
    text: "🔥 รันทั้ง 3 วิธี",
    callback_data: top3CbData.length <= 64 ? top3CbData : `atk_top3:${shortDomain}:full_chain`,
  }]);
  
  // Add "Quick Attack (full chain)" and "cancel" row
  const fcCbData = `atk_confirm:${shortDomain}:full_chain`;
  keyboard.push([
    { text: "⚡ Quick Attack (20 วิธี)", callback_data: fcCbData.length <= 64 ? fcCbData : fcCbData.substring(0, 64) },
    { text: "❌ ยกเลิก", callback_data: "atk_cancel" },
  ]);
  
  return keyboard;
}
