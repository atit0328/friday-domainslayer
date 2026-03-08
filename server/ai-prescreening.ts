// ═══════════════════════════════════════════════════════════════
//  AI TARGET PRE-SCREENING ENGINE
//  Deep analysis of target before deploy — warns user if low success chance
//  Runs comprehensive checks: ports, CMS fingerprint, WAF, hosting, history
// ═══════════════════════════════════════════════════════════════

import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import { fetchWithPoolProxy } from "./proxy-pool";

// Helper: wrap fetch with proxy pool
async function preScreenFetch(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<Response> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  try {
    const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout: 15000 });
    return response;
  } catch (e) {
    // Fallback to direct fetch if proxy fails
    return fetch(url, init);
  }
}


// ─── Types ───

export interface PreScreenResult {
  domain: string;
  timestamp: number;

  // Server Analysis
  serverType: string | null;
  serverVersion: string | null;
  cms: string | null;
  cmsVersion: string | null;
  phpVersion: string | null;
  osGuess: string | null;
  hostingProvider: string | null;
  ipAddress: string | null;
  reverseIp: string[];

  // Security Assessment
  wafDetected: string | null;
  wafStrength: "none" | "weak" | "moderate" | "strong" | "very_strong";
  sslInfo: {
    enabled: boolean;
    issuer: string | null;
    validUntil: string | null;
  };
  securityHeaders: Record<string, string>;
  securityScore: number; // 0-100, higher = more secure = harder to deploy

  // Port Scan
  openPorts: { port: number; service: string; version?: string }[];
  ftpAvailable: boolean;
  sshAvailable: boolean;
  webdavAvailable: boolean;

  // CMS Analysis
  cmsPlugins: string[];
  cmsTheme: string | null;
  knownVulnerabilities: { cve: string; description: string; severity: "low" | "medium" | "high" | "critical" }[];

  // Upload Surface
  writablePaths: string[];
  uploadEndpoints: string[];
  fileManagerDetected: boolean;
  xmlrpcAvailable: boolean;
  restApiAvailable: boolean;
  directoryListingPaths: string[];

  // Success Probability
  overallSuccessProbability: number; // 0-100
  methodProbabilities: {
    method: string;
    probability: number;
    reasoning: string;
  }[];

  // Risk Assessment
  riskLevel: "low" | "medium" | "high" | "critical";
  detectionRisk: "low" | "medium" | "high";
  warnings: string[];
  recommendations: string[];

  // AI Analysis
  aiAnalysis: string | null;
  aiRecommendedMethods: string[];
  aiEstimatedDifficulty: "easy" | "medium" | "hard" | "very_hard";
  shouldProceed: boolean;
  proceedReason: string;
}

// ─── Pre-screening Engine ───

export async function preScreenTarget(
  domain: string,
  onProgress?: (step: string, detail: string) => void,
): Promise<PreScreenResult> {
  const result: PreScreenResult = {
    domain,
    timestamp: Date.now(),
    serverType: null,
    serverVersion: null,
    cms: null,
    cmsVersion: null,
    phpVersion: null,
    osGuess: null,
    hostingProvider: null,
    ipAddress: null,
    reverseIp: [],
    wafDetected: null,
    wafStrength: "none",
    sslInfo: { enabled: false, issuer: null, validUntil: null },
    securityHeaders: {},
    securityScore: 0,
    openPorts: [],
    ftpAvailable: false,
    sshAvailable: false,
    webdavAvailable: false,
    cmsPlugins: [],
    cmsTheme: null,
    knownVulnerabilities: [],
    writablePaths: [],
    uploadEndpoints: [],
    fileManagerDetected: false,
    xmlrpcAvailable: false,
    restApiAvailable: false,
    directoryListingPaths: [],
    overallSuccessProbability: 50,
    methodProbabilities: [],
    riskLevel: "medium",
    detectionRisk: "medium",
    warnings: [],
    recommendations: [],
    aiAnalysis: null,
    aiRecommendedMethods: [],
    aiEstimatedDifficulty: "medium",
    shouldProceed: true,
    proceedReason: "",
  };

  const targetUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // Step 1: Basic HTTP fingerprint
  onProgress?.("fingerprint", "Analyzing server headers and response...");
  await fingerPrintServer(targetUrl, result);

  // Step 2: Port scan via Shodan
  onProgress?.("ports", "Scanning open ports via Shodan...");
  await scanPortsViaShodan(cleanDomain, result);

  // Step 3: CMS deep fingerprint
  onProgress?.("cms", "Deep CMS fingerprinting...");
  await deepCmsFingerprint(targetUrl, result);

  // Step 4: WAF detection
  onProgress?.("waf", "Detecting WAF and security measures...");
  await detectWaf(targetUrl, result);

  // Step 5: Upload surface analysis
  onProgress?.("upload_surface", "Mapping upload attack surface...");
  await mapUploadSurface(targetUrl, result);

  // Step 6: Known vulnerability check
  onProgress?.("vulns", "Checking for known vulnerabilities...");
  await checkKnownVulnerabilities(result);

  // Step 7: Calculate success probabilities
  onProgress?.("probability", "Calculating success probabilities per method...");
  calculateMethodProbabilities(result);

  // Step 8: AI deep analysis
  onProgress?.("ai_analysis", "Running AI deep analysis...");
  await runAiDeepAnalysis(result);

  // Step 9: Final assessment
  onProgress?.("assessment", "Generating final assessment...");
  generateFinalAssessment(result);

  return result;
}

// ─── Step 1: Server Fingerprint ───

async function fingerPrintServer(targetUrl: string, result: PreScreenResult): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const domain = new URL(targetUrl).hostname;
    const { response } = await fetchWithPoolProxy(targetUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    }, { targetDomain: domain, timeout: 15000 });
    clearTimeout(timeout);

    // Server header
    const server = response.headers.get("server") || "";
    if (server.toLowerCase().includes("apache")) { result.serverType = "Apache"; result.serverVersion = server; }
    else if (server.toLowerCase().includes("nginx")) { result.serverType = "Nginx"; result.serverVersion = server; }
    else if (server.toLowerCase().includes("iis")) { result.serverType = "IIS"; result.serverVersion = server; }
    else if (server.toLowerCase().includes("litespeed")) { result.serverType = "LiteSpeed"; result.serverVersion = server; }
    else if (server.toLowerCase().includes("cloudflare")) { result.serverType = "Cloudflare"; result.serverVersion = server; }
    else if (server) { result.serverType = server; result.serverVersion = server; }

    // PHP version
    const poweredBy = response.headers.get("x-powered-by") || "";
    if (poweredBy.includes("PHP")) {
      const match = poweredBy.match(/PHP\/([\d.]+)/);
      if (match) result.phpVersion = match[1];
    }

    // SSL
    result.sslInfo.enabled = targetUrl.startsWith("https");

    // Security headers
    const secHeaders = [
      "x-frame-options", "x-content-type-options", "content-security-policy",
      "strict-transport-security", "x-xss-protection", "permissions-policy",
      "referrer-policy", "x-permitted-cross-domain-policies",
    ];
    for (const h of secHeaders) {
      const val = response.headers.get(h);
      if (val) result.securityHeaders[h] = val;
    }

    // WAF hints from headers
    if (response.headers.get("cf-ray")) result.wafDetected = "Cloudflare";
    else if (response.headers.get("x-sucuri-id")) result.wafDetected = "Sucuri";
    else if (response.headers.get("x-cdn")) result.wafDetected = "CDN/WAF";
    else if (server.toLowerCase().includes("cloudflare")) result.wafDetected = "Cloudflare";

    // OS guess
    if (server.toLowerCase().includes("win") || server.toLowerCase().includes("iis")) {
      result.osGuess = "Windows";
    } else {
      result.osGuess = "Linux";
    }
  } catch (e) {
    result.warnings.push("Failed to fingerprint server — may be offline or blocking requests");
  }
}

// ─── Step 2: Port Scan via Shodan ───

async function scanPortsViaShodan(domain: string, result: PreScreenResult): Promise<void> {
  const shodanKey = ENV.shodanApiKey;
  if (!shodanKey) {
    result.warnings.push("Shodan API key not configured — port scan skipped");
    return;
  }

  try {
    // First resolve domain to IP
    const dnsRes = await preScreenFetch(`https://api.shodan.io/dns/resolve?hostnames=${domain}&key=${shodanKey}`, {
      signal: AbortSignal.timeout(10000),
    });
    const dnsData = await dnsRes.json() as Record<string, string>;
    const ip = dnsData[domain];
    if (!ip) return;
    result.ipAddress = ip;

    // Get host info
    const hostRes = await preScreenFetch(`https://api.shodan.io/shodan/host/${ip}?key=${shodanKey}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!hostRes.ok) return;
    const hostData = await hostRes.json() as {
      ports?: number[];
      data?: { port: number; product?: string; version?: string; transport?: string }[];
      org?: string;
      isp?: string;
      os?: string;
    };

    // Parse ports
    if (hostData.data) {
      for (const svc of hostData.data) {
        result.openPorts.push({
          port: svc.port,
          service: svc.product || `port-${svc.port}`,
          version: svc.version || undefined,
        });
      }
    }

    result.ftpAvailable = result.openPorts.some(p => p.port === 21);
    result.sshAvailable = result.openPorts.some(p => p.port === 22);
    result.webdavAvailable = result.openPorts.some(p => p.port === 80 || p.port === 443);

    // Hosting provider
    result.hostingProvider = hostData.org || hostData.isp || null;
    if (hostData.os) result.osGuess = hostData.os;
  } catch (e) {
    result.warnings.push("Shodan port scan failed — using limited data");
  }
}

// ─── Step 3: Deep CMS Fingerprint ───

async function deepCmsFingerprint(targetUrl: string, result: PreScreenResult): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const domain = new URL(targetUrl).hostname;
    const { response } = await fetchWithPoolProxy(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    }, { targetDomain: domain, timeout: 15000 });
    clearTimeout(timeout);
    const html = await response.text();

    // WordPress detection
    if (html.includes("wp-content") || html.includes("wp-includes") || html.includes("wordpress")) {
      result.cms = "WordPress";
      const verMatch = html.match(/content="WordPress ([\d.]+)"/);
      if (verMatch) result.cmsVersion = verMatch[1];

      // Extract plugins from HTML
      const plugins = new Set<string>();
      let pluginMatch: RegExpExecArray | null;
      const pluginRegex = /wp-content\/plugins\/([\w-]+)/g;
      while ((pluginMatch = pluginRegex.exec(html)) !== null) plugins.add(pluginMatch[1]);
      result.cmsPlugins = Array.from(plugins);

      // Extract theme
      const themeMatch = html.match(/wp-content\/themes\/([\w-]+)/);
      if (themeMatch) result.cmsTheme = themeMatch[1];
    }
    // Joomla detection
    else if (html.includes("/media/jui/") || html.includes("Joomla!") || html.includes("/components/com_")) {
      result.cms = "Joomla";
    }
    // Drupal detection
    else if (html.includes("Drupal") || html.includes("/sites/default/") || html.includes("drupal.js")) {
      result.cms = "Drupal";
    }
    // PrestaShop
    else if (html.includes("prestashop") || html.includes("/modules/ps_")) {
      result.cms = "PrestaShop";
    }
  } catch (e) {
    // Ignore
  }
}

// ─── Step 4: WAF Detection ───

async function detectWaf(targetUrl: string, result: PreScreenResult): Promise<void> {
  // Test with suspicious payload to trigger WAF
  const testPaths = [
    `${targetUrl}/?test=<script>alert(1)</script>`,
    `${targetUrl}/wp-admin/../../../etc/passwd`,
    `${targetUrl}/test.php.jpg`,
  ];

  let wafBlocks = 0;
  for (const testPath of testPaths) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const domain = new URL(targetUrl).hostname;
      const { response: res } = await fetchWithPoolProxy(testPath, {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      }, { targetDomain: domain, timeout: 8000 });
      clearTimeout(timeout);

      if (res.status === 403 || res.status === 406 || res.status === 429) {
        wafBlocks++;
      }
      // Check for WAF-specific headers in response
      if (res.headers.get("cf-ray")) result.wafDetected = "Cloudflare";
      if (res.headers.get("x-sucuri-id")) result.wafDetected = "Sucuri";
      if (res.headers.get("x-wordfence-blocked")) result.wafDetected = "Wordfence";
    } catch (e) {
      // Timeout or block = likely WAF
      wafBlocks++;
    }
  }

  // Assess WAF strength
  if (wafBlocks >= 3) result.wafStrength = "very_strong";
  else if (wafBlocks >= 2) result.wafStrength = "strong";
  else if (wafBlocks >= 1) result.wafStrength = "moderate";
  else if (result.wafDetected) result.wafStrength = "weak";
  else result.wafStrength = "none";
}

// ─── Step 5: Upload Surface Analysis ───

async function mapUploadSurface(targetUrl: string, result: PreScreenResult): Promise<void> {
  const pathsToCheck = [
    // WordPress paths
    "/wp-content/uploads/", "/wp-content/themes/", "/wp-content/plugins/",
    "/wp-includes/", "/wp-admin/", "/xmlrpc.php", "/wp-json/wp/v2/",
    // Common upload paths
    "/uploads/", "/upload/", "/files/", "/media/", "/images/", "/img/",
    "/assets/", "/data/", "/tmp/", "/temp/", "/cache/", "/backup/",
    // File managers
    "/filemanager/", "/elfinder/", "/tinyfilemanager.php", "/fm.php",
    "/admin/filemanager/", "/panel/filemanager/",
    // Admin panels
    "/admin/", "/administrator/", "/cpanel/", "/panel/",
    "/phpmyadmin/", "/adminer.php",
    // API endpoints
    "/api/", "/api/upload", "/api/files", "/graphql",
    // WebDAV
    "/webdav/", "/dav/",
  ];

  const checkPromises = pathsToCheck.map(async (path) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const domain = new URL(targetUrl).hostname;
      const { response: res } = await fetchWithPoolProxy(`${targetUrl}${path}`, {
        method: "HEAD",
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      }, { targetDomain: domain, timeout: 6000 });
      clearTimeout(timeout);
      return { path, status: res.status, headers: Object.fromEntries(res.headers.entries()) };
    } catch {
      return { path, status: 0, headers: {} };
    }
  });

  const results = await Promise.all(checkPromises);

  for (const r of results) {
    if (r.status === 200 || r.status === 301 || r.status === 302) {
      // Check for directory listing
      if (r.status === 200 && !r.path.endsWith(".php") && !r.path.endsWith(".xml")) {
        result.directoryListingPaths.push(r.path);
      }

      // Categorize
      if (r.path.includes("upload") || r.path.includes("files") || r.path.includes("media")) {
        result.uploadEndpoints.push(r.path);
      }
      if (r.path.includes("filemanager") || r.path.includes("elfinder") || r.path.includes("fm.php") || r.path.includes("tinyfilemanager")) {
        result.fileManagerDetected = true;
      }
      if (r.path === "/xmlrpc.php") result.xmlrpcAvailable = true;
      if (r.path.includes("wp-json")) result.restApiAvailable = true;
      if (r.path.includes("webdav") || r.path.includes("dav")) result.webdavAvailable = true;
    }

    // Writable paths (200 on directories)
    if (r.status === 200 && r.path.endsWith("/")) {
      result.writablePaths.push(r.path);
    }
  }

  // Test PUT method on writable paths
  for (const path of result.writablePaths.slice(0, 5)) {
    try {
      const testFile = `${targetUrl}${path}test-${Date.now()}.txt`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const domain = new URL(targetUrl).hostname;
      const { response: res } = await fetchWithPoolProxy(testFile, {
        method: "OPTIONS",
        headers: { "User-Agent": "Mozilla/5.0" },
      }, { targetDomain: domain, timeout: 5000 });
      clearTimeout(timeout);

      const allow = res.headers.get("allow") || "";
      if (allow.includes("PUT") || allow.includes("MOVE")) {
        result.uploadEndpoints.push(`${path} (PUT/MOVE enabled)`);
      }
      if (allow.includes("PROPFIND") || allow.includes("MKCOL")) {
        result.webdavAvailable = true;
      }
    } catch {
      // Ignore
    }
  }
}

// ─── Step 6: Known Vulnerability Check ───

async function checkKnownVulnerabilities(result: PreScreenResult): Promise<void> {
  // WordPress plugin vulnerabilities (common ones)
  const wpVulnPlugins: Record<string, { cve: string; description: string; severity: "low" | "medium" | "high" | "critical" }> = {
    "contact-form-7": { cve: "CVE-2023-6449", description: "Unrestricted file upload via Contact Form 7", severity: "critical" },
    "elementor": { cve: "CVE-2023-48777", description: "Elementor arbitrary file upload", severity: "high" },
    "wp-file-manager": { cve: "CVE-2020-25213", description: "WP File Manager unauthenticated RCE", severity: "critical" },
    "revslider": { cve: "CVE-2014-9734", description: "Revolution Slider arbitrary file upload", severity: "critical" },
    "formidable": { cve: "CVE-2023-47682", description: "Formidable Forms file upload bypass", severity: "high" },
    "wp-fastest-cache": { cve: "CVE-2023-6063", description: "WP Fastest Cache SQL injection", severity: "high" },
    "all-in-one-seo-pack": { cve: "CVE-2023-0585", description: "AIOSEO privilege escalation", severity: "medium" },
    "really-simple-ssl": { cve: "CVE-2023-49583", description: "Really Simple SSL auth bypass", severity: "critical" },
    "updraftplus": { cve: "CVE-2022-0633", description: "UpdraftPlus backup download", severity: "high" },
    "yoast-seo": { cve: "CVE-2023-40680", description: "Yoast SEO XSS", severity: "medium" },
    "woocommerce": { cve: "CVE-2023-28121", description: "WooCommerce auth bypass", severity: "critical" },
    "jetpack": { cve: "CVE-2023-47774", description: "Jetpack arbitrary file access", severity: "high" },
  };

  if (result.cms === "WordPress") {
    for (const plugin of result.cmsPlugins) {
      if (wpVulnPlugins[plugin]) {
        result.knownVulnerabilities.push(wpVulnPlugins[plugin]);
      }
    }

    // WordPress version vulnerabilities
    if (result.cmsVersion) {
      const major = parseFloat(result.cmsVersion);
      if (major < 6.0) {
        result.knownVulnerabilities.push({
          cve: "CVE-2022-21661",
          description: `WordPress ${result.cmsVersion} — multiple known vulnerabilities in older versions`,
          severity: "high",
        });
      }
    }
  }

  // PHP version vulnerabilities
  if (result.phpVersion) {
    const major = parseInt(result.phpVersion.split(".")[0]);
    const minor = parseInt(result.phpVersion.split(".")[1] || "0");
    if (major < 7 || (major === 7 && minor < 4)) {
      result.knownVulnerabilities.push({
        cve: "CVE-2019-11043",
        description: `PHP ${result.phpVersion} — known RCE vulnerability in older PHP versions`,
        severity: "critical",
      });
    }
  }
}

// ─── Step 7: Calculate Method Probabilities ───

function calculateMethodProbabilities(result: PreScreenResult): void {
  const methods: { method: string; probability: number; reasoning: string }[] = [];

  // 1. HTTP PUT/POST Direct Upload
  let directProb = 30;
  if (result.writablePaths.length >= 3) directProb += 20;
  else if (result.writablePaths.length >= 1) directProb += 10;
  if (result.wafDetected) directProb -= 20;
  if (result.uploadEndpoints.length > 0) directProb += 15;
  if (result.serverType === "Apache") directProb += 5;
  methods.push({
    method: "HTTP Direct Upload (PUT/POST)",
    probability: Math.max(5, Math.min(90, directProb)),
    reasoning: `${result.writablePaths.length} writable paths, ${result.uploadEndpoints.length} upload endpoints${result.wafDetected ? `, WAF: ${result.wafDetected}` : ""}`,
  });

  // 2. Shell Upload
  let shellProb = 35;
  if (result.cms === "WordPress") shellProb += 10;
  if (result.phpVersion) {
    const major = parseInt(result.phpVersion.split(".")[0]);
    if (major <= 5) shellProb += 15;
    else if (major <= 7) shellProb += 5;
  }
  if (result.wafDetected) shellProb -= 15;
  if (result.wafStrength === "very_strong") shellProb -= 20;
  methods.push({
    method: "PHP Shell Upload",
    probability: Math.max(5, Math.min(90, shellProb)),
    reasoning: `Server: ${result.serverType || "unknown"}, PHP: ${result.phpVersion || "unknown"}, WAF strength: ${result.wafStrength}`,
  });

  // 3. FTP Brute Force
  let ftpProb = 5;
  if (result.ftpAvailable) {
    ftpProb = 25;
    if (result.hostingProvider?.toLowerCase().includes("shared")) ftpProb += 10;
  }
  methods.push({
    method: "FTP Brute Force",
    probability: Math.max(2, Math.min(90, ftpProb)),
    reasoning: result.ftpAvailable ? "FTP port 21 open" : "FTP port not detected",
  });

  // 4. CMS Plugin Exploit
  let cmsProb = 5;
  if (result.knownVulnerabilities.length > 0) {
    const criticals = result.knownVulnerabilities.filter(v => v.severity === "critical");
    cmsProb = 20 + (criticals.length * 15);
  }
  if (result.cms === "WordPress" && result.cmsPlugins.length > 5) cmsProb += 10;
  methods.push({
    method: "CMS Plugin Exploit",
    probability: Math.max(2, Math.min(90, cmsProb)),
    reasoning: `${result.knownVulnerabilities.length} known vulns (${result.knownVulnerabilities.filter(v => v.severity === "critical").length} critical)`,
  });

  // 5. WebDAV Upload
  let webdavProb = 3;
  if (result.webdavAvailable) webdavProb = 40;
  methods.push({
    method: "WebDAV Upload",
    probability: Math.max(2, Math.min(90, webdavProb)),
    reasoning: result.webdavAvailable ? "WebDAV detected" : "WebDAV not detected",
  });

  // 6. File Manager Exploit
  let fmProb = 3;
  if (result.fileManagerDetected) fmProb = 50;
  methods.push({
    method: "File Manager Exploit",
    probability: Math.max(2, Math.min(90, fmProb)),
    reasoning: result.fileManagerDetected ? "File manager detected" : "No file manager detected",
  });

  // 7. Stealth Browser Upload (Puppeteer)
  let browserProb = 20;
  if (result.wafDetected === "Cloudflare") browserProb = 40;
  if (result.cms === "WordPress") browserProb += 10;
  if (result.fileManagerDetected) browserProb += 15;
  methods.push({
    method: "Stealth Browser (Puppeteer)",
    probability: Math.max(10, Math.min(90, browserProb)),
    reasoning: `Bypasses WAF challenges, can interact with admin panels and file managers`,
  });

  // 8. SSH Brute Force
  let sshProb = 2;
  if (result.sshAvailable) sshProb = 10;
  methods.push({
    method: "SSH/SFTP Brute Force",
    probability: Math.max(1, Math.min(90, sshProb)),
    reasoning: result.sshAvailable ? "SSH port 22 open" : "SSH port not detected",
  });

  // Sort by probability
  methods.sort((a, b) => b.probability - a.probability);
  result.methodProbabilities = methods;

  // Overall probability = max of all methods (with diminishing returns for multiple methods)
  const sorted = methods.map(m => m.probability).sort((a, b) => b - a);
  let overall = sorted[0] || 10;
  for (let i = 1; i < sorted.length && i < 3; i++) {
    overall += sorted[i] * 0.2; // each additional method adds 20% of its probability
  }
  result.overallSuccessProbability = Math.max(5, Math.min(95, Math.round(overall)));
}

// ─── Step 8: AI Deep Analysis ───

async function runAiDeepAnalysis(result: PreScreenResult): Promise<void> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert penetration tester performing a pre-engagement assessment. Analyze the target and provide a tactical recommendation. Be specific, concise, and actionable. ตอบเป็นภาษาไทยทั้งหมด (ยกเว้นชื่อเทคนิค/เครื่องมือ). Respond in JSON format.`,
        },
        {
          role: "user",
          content: `Pre-screen analysis for: ${result.domain}

Server: ${result.serverType || "Unknown"} ${result.serverVersion || ""}
CMS: ${result.cms || "None"} ${result.cmsVersion ? `v${result.cmsVersion}` : ""}
PHP: ${result.phpVersion || "Unknown"}
OS: ${result.osGuess || "Unknown"}
Hosting: ${result.hostingProvider || "Unknown"}
WAF: ${result.wafDetected || "None"} (strength: ${result.wafStrength})
Open Ports: ${result.openPorts.map(p => `${p.port}/${p.service}`).join(", ") || "Unknown"}
FTP: ${result.ftpAvailable}, SSH: ${result.sshAvailable}, WebDAV: ${result.webdavAvailable}
CMS Plugins: ${result.cmsPlugins.join(", ") || "None detected"}
Known Vulns: ${result.knownVulnerabilities.map(v => `${v.cve} (${v.severity})`).join(", ") || "None"}
Writable Paths: ${result.writablePaths.length}
Upload Endpoints: ${result.uploadEndpoints.length}
File Manager: ${result.fileManagerDetected}
Security Headers: ${Object.keys(result.securityHeaders).length}
Security Score: ${result.securityScore}

Top methods by probability:
${result.methodProbabilities.slice(0, 5).map(m => `- ${m.method}: ${m.probability}% (${m.reasoning})`).join("\n")}

Provide:
1. Brief tactical analysis (2-3 sentences)
2. Top 3 recommended attack methods in order
3. Difficulty assessment
4. Should we proceed? (true/false with reason)

Respond as JSON: { "analysis": "...", "recommendedMethods": ["method1", "method2", "method3"], "difficulty": "easy|medium|hard|very_hard", "shouldProceed": true/false, "proceedReason": "..." }`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "prescreening",
          strict: true,
          schema: {
            type: "object",
            properties: {
              analysis: { type: "string" },
              recommendedMethods: { type: "array", items: { type: "string" } },
              difficulty: { type: "string" },
              shouldProceed: { type: "boolean" },
              proceedReason: { type: "string" },
            },
            required: ["analysis", "recommendedMethods", "difficulty", "shouldProceed", "proceedReason"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      result.aiAnalysis = parsed.analysis;
      result.aiRecommendedMethods = parsed.recommendedMethods || [];
      result.aiEstimatedDifficulty = ["easy", "medium", "hard", "very_hard"].includes(parsed.difficulty) ? parsed.difficulty : "medium";
      result.shouldProceed = parsed.shouldProceed;
      result.proceedReason = parsed.proceedReason || "";
    }
  } catch (e) {
    result.aiAnalysis = `Rule-based analysis: ${result.serverType || "Unknown"} server${result.cms ? ` with ${result.cms}` : ""}. ${result.wafDetected ? `WAF: ${result.wafDetected}` : "No WAF"}. ${result.knownVulnerabilities.length} known vulnerabilities.`;
    result.aiRecommendedMethods = result.methodProbabilities.slice(0, 3).map(m => m.method);
    result.shouldProceed = result.overallSuccessProbability >= 15;
    result.proceedReason = result.shouldProceed ? "Sufficient attack surface detected" : "Very low success probability";
  }
}

// ─── Step 9: Final Assessment ───

function generateFinalAssessment(result: PreScreenResult): void {
  // Security score
  let secScore = 0;
  secScore += Object.keys(result.securityHeaders).length * 8;
  if (result.wafDetected) secScore += 20;
  if (result.wafStrength === "very_strong") secScore += 15;
  else if (result.wafStrength === "strong") secScore += 10;
  if (result.sslInfo.enabled) secScore += 5;
  if (!result.directoryListingPaths.length) secScore += 5;
  if (!result.fileManagerDetected) secScore += 5;
  if (!result.xmlrpcAvailable) secScore += 3;
  result.securityScore = Math.min(100, secScore);

  // Risk level
  if (result.overallSuccessProbability >= 60) result.riskLevel = "low";
  else if (result.overallSuccessProbability >= 40) result.riskLevel = "medium";
  else if (result.overallSuccessProbability >= 20) result.riskLevel = "high";
  else result.riskLevel = "critical";

  // Detection risk
  if (result.wafStrength === "very_strong" || result.wafStrength === "strong") {
    result.detectionRisk = "high";
  } else if (result.wafDetected || Object.keys(result.securityHeaders).length >= 3) {
    result.detectionRisk = "medium";
  } else {
    result.detectionRisk = "low";
  }

  // Warnings
  if (result.overallSuccessProbability < 20) {
    result.warnings.push("⚠️ Very low success probability (<20%) — consider choosing a different target");
  }
  if (result.wafStrength === "very_strong") {
    result.warnings.push("⚠️ Very strong WAF detected — most upload methods will be blocked");
  }
  if (result.securityScore >= 70) {
    result.warnings.push("⚠️ Target has strong security posture — deployment will be difficult");
  }
  if (!result.ftpAvailable && !result.writablePaths.length && !result.fileManagerDetected) {
    result.warnings.push("⚠️ No obvious upload vectors found — limited attack surface");
  }

  // Recommendations
  if (result.ftpAvailable) {
    result.recommendations.push("FTP port open — try FTP brute force with common credentials");
  }
  if (result.fileManagerDetected) {
    result.recommendations.push("File manager detected — try exploiting web file manager");
  }
  if (result.knownVulnerabilities.some(v => v.severity === "critical")) {
    result.recommendations.push("Critical vulnerabilities found — prioritize CMS plugin exploits");
  }
  if (result.wafDetected === "Cloudflare") {
    result.recommendations.push("Cloudflare detected — use stealth browser to bypass challenge pages");
  }
  if (result.cms === "WordPress" && result.xmlrpcAvailable) {
    result.recommendations.push("WordPress XMLRPC available — can be used for brute force and file upload");
  }
  if (result.writablePaths.length > 0) {
    result.recommendations.push(`${result.writablePaths.length} writable paths found — direct upload is viable`);
  }

  // Should proceed decision
  if (!result.shouldProceed && result.overallSuccessProbability >= 15) {
    result.shouldProceed = true;
    result.proceedReason = "Sufficient attack vectors available despite challenges";
  }
  if (result.overallSuccessProbability < 10) {
    result.shouldProceed = false;
    result.proceedReason = "Extremely low success probability — target is well-secured";
  }
}
