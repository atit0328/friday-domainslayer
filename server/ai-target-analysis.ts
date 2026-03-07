/**
 * AI Target Analysis — Deep intelligence gathering before attack
 * 
 * This module runs BEFORE the attack pipeline and provides:
 * 1. Real HTTP fingerprinting (server, CMS, WAF, headers)
 * 2. Moz DA/PA/SS metrics (real API call)
 * 3. DNS record analysis
 * 4. Technology stack detection
 * 5. LLM-powered strategic analysis
 * 6. Attack vector recommendation with probabilities
 * 
 * All results are streamed step-by-step to the frontend.
 */

import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import { getMozMetrics, type MozMetrics } from "./moz-api";
import { fetchWithPoolProxy } from "./proxy-pool";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface AiTargetAnalysis {
  domain: string;
  analyzedAt: number;
  duration: number;

  // HTTP Fingerprint
  httpFingerprint: {
    serverType: string | null;
    serverVersion: string | null;
    phpVersion: string | null;
    osGuess: string | null;
    responseTime: number;
    statusCode: number;
    redirectChain: string[];
    finalUrl: string;
    poweredBy: string | null;
  };

  // DNS & Network
  dnsInfo: {
    ipAddress: string | null;
    ipv6: string | null;
    nameservers: string[];
    mxRecords: string[];
    txtRecords: string[];
    hostingProvider: string | null;
    cdnDetected: string | null;
    cloudflareProxied: boolean;
  };

  // Technology Stack
  techStack: {
    cms: string | null;
    cmsVersion: string | null;
    framework: string | null;
    jsLibraries: string[];
    plugins: string[];
    theme: string | null;
    analytics: string[];
    ecommerce: string | null;
    caching: string | null;
  };

  // Security Assessment
  security: {
    wafDetected: string | null;
    wafStrength: "none" | "weak" | "moderate" | "strong" | "very_strong";
    sslEnabled: boolean;
    sslIssuer: string | null;
    securityHeaders: Record<string, string>;
    securityScore: number; // 0-100
    httpOnly: boolean;
    hsts: boolean;
    csp: boolean;
    xFrameOptions: boolean;
  };

  // SEO Metrics (Moz)
  seoMetrics: {
    domainAuthority: number;
    pageAuthority: number;
    spamScore: number;
    backlinks: number;
    referringDomains: number;
    mozAvailable: boolean;
  };

  // Upload Surface
  uploadSurface: {
    writablePaths: string[];
    uploadEndpoints: string[];
    fileManagerDetected: boolean;
    xmlrpcAvailable: boolean;
    restApiAvailable: boolean;
    directoryListingPaths: string[];
    openPorts: { port: number; service: string }[];
    ftpAvailable: boolean;
    sshAvailable: boolean;
    webdavAvailable: boolean;
  };

  // Vulnerability Assessment
  vulnerabilities: {
    knownCVEs: { cve: string; description: string; severity: string }[];
    misconfigurations: string[];
    exposedFiles: string[];
    totalRiskScore: number;
  };

  // AI Strategic Analysis
  aiStrategy: {
    overallSuccessProbability: number;
    difficulty: "easy" | "medium" | "hard" | "very_hard";
    riskLevel: "low" | "medium" | "high" | "critical";
    detectionRisk: "low" | "medium" | "high";
    shouldProceed: boolean;
    proceedReason: string;
    tacticalAnalysis: string;
    recommendedMethods: {
      method: string;
      probability: number;
      reasoning: string;
      priority: number;
    }[];
    warnings: string[];
    recommendations: string[];
    estimatedTime: string;
    bestApproach: string;
  };
}

export type AnalysisStepCallback = (step: AnalysisStep) => void;

export interface AnalysisStep {
  stepId: string;
  stepName: string;
  status: "running" | "complete" | "error" | "skipped";
  detail: string;
  progress: number; // 0-100
  data?: any;
  duration?: number;
}

// ═══════════════════════════════════════════════════════
//  MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════

const ANALYSIS_STEPS = [
  { id: "http_fingerprint", name: "HTTP Fingerprinting", weight: 15 },
  { id: "dns_lookup", name: "DNS & Network Analysis", weight: 10 },
  { id: "tech_detection", name: "Technology Stack Detection", weight: 15 },
  { id: "security_scan", name: "Security Assessment", weight: 15 },
  { id: "moz_metrics", name: "SEO Metrics (Moz DA/PA)", weight: 10 },
  { id: "upload_surface", name: "Upload Surface Mapping", weight: 15 },
  { id: "vuln_check", name: "Vulnerability Assessment", weight: 10 },
  { id: "ai_strategy", name: "AI Strategic Analysis", weight: 10 },
] as const;

export async function runAiTargetAnalysis(
  domain: string,
  onStep: AnalysisStepCallback = () => {},
): Promise<AiTargetAnalysis> {
  const startTime = Date.now();
  const targetUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // Initialize result
  const result: AiTargetAnalysis = {
    domain: cleanDomain,
    analyzedAt: Date.now(),
    duration: 0,
    httpFingerprint: {
      serverType: null, serverVersion: null, phpVersion: null, osGuess: null,
      responseTime: 0, statusCode: 0, redirectChain: [], finalUrl: targetUrl,
      poweredBy: null,
    },
    dnsInfo: {
      ipAddress: null, ipv6: null, nameservers: [], mxRecords: [], txtRecords: [],
      hostingProvider: null, cdnDetected: null, cloudflareProxied: false,
    },
    techStack: {
      cms: null, cmsVersion: null, framework: null, jsLibraries: [],
      plugins: [], theme: null, analytics: [], ecommerce: null, caching: null,
    },
    security: {
      wafDetected: null, wafStrength: "none", sslEnabled: targetUrl.startsWith("https"),
      sslIssuer: null, securityHeaders: {}, securityScore: 0,
      httpOnly: false, hsts: false, csp: false, xFrameOptions: false,
    },
    seoMetrics: {
      domainAuthority: 0, pageAuthority: 0, spamScore: 0,
      backlinks: 0, referringDomains: 0, mozAvailable: false,
    },
    uploadSurface: {
      writablePaths: [], uploadEndpoints: [], fileManagerDetected: false,
      xmlrpcAvailable: false, restApiAvailable: false, directoryListingPaths: [],
      openPorts: [], ftpAvailable: false, sshAvailable: false, webdavAvailable: false,
    },
    vulnerabilities: {
      knownCVEs: [], misconfigurations: [], exposedFiles: [], totalRiskScore: 0,
    },
    aiStrategy: {
      overallSuccessProbability: 50, difficulty: "medium", riskLevel: "medium",
      detectionRisk: "medium", shouldProceed: true, proceedReason: "",
      tacticalAnalysis: "", recommendedMethods: [], warnings: [], recommendations: [],
      estimatedTime: "2-5 minutes", bestApproach: "",
    },
  };

  let progressAccum = 0;

  // ─── Step 1: HTTP Fingerprinting ───
  const step1Start = Date.now();
  onStep({ stepId: "http_fingerprint", stepName: "HTTP Fingerprinting", status: "running", detail: "กำลังวิเคราะห์ HTTP headers, server type, response time...", progress: 0 });
  try {
    await httpFingerprint(targetUrl, cleanDomain, result);
    progressAccum += 15;
    onStep({
      stepId: "http_fingerprint", stepName: "HTTP Fingerprinting", status: "complete",
      detail: `Server: ${result.httpFingerprint.serverType || "Unknown"} | PHP: ${result.httpFingerprint.phpVersion || "N/A"} | Response: ${result.httpFingerprint.responseTime}ms | Status: ${result.httpFingerprint.statusCode}`,
      progress: progressAccum,
      data: result.httpFingerprint,
      duration: Date.now() - step1Start,
    });
  } catch (e: any) {
    progressAccum += 15;
    onStep({ stepId: "http_fingerprint", stepName: "HTTP Fingerprinting", status: "error", detail: `ล้มเหลว: ${e.message}`, progress: progressAccum, duration: Date.now() - step1Start });
  }

  // ─── Step 2: DNS & Network Analysis ───
  const step2Start = Date.now();
  onStep({ stepId: "dns_lookup", stepName: "DNS & Network Analysis", status: "running", detail: "กำลังค้นหา DNS records, IP, nameservers, hosting...", progress: progressAccum });
  try {
    await dnsAnalysis(cleanDomain, result);
    progressAccum += 10;
    onStep({
      stepId: "dns_lookup", stepName: "DNS & Network Analysis", status: "complete",
      detail: `IP: ${result.dnsInfo.ipAddress || "N/A"} | Hosting: ${result.dnsInfo.hostingProvider || "Unknown"} | CDN: ${result.dnsInfo.cdnDetected || "None"} | CF Proxied: ${result.dnsInfo.cloudflareProxied ? "Yes" : "No"}`,
      progress: progressAccum,
      data: result.dnsInfo,
      duration: Date.now() - step2Start,
    });
  } catch (e: any) {
    progressAccum += 10;
    onStep({ stepId: "dns_lookup", stepName: "DNS & Network Analysis", status: "error", detail: `ล้มเหลว: ${e.message}`, progress: progressAccum, duration: Date.now() - step2Start });
  }

  // ─── Step 3: Technology Stack Detection ───
  const step3Start = Date.now();
  onStep({ stepId: "tech_detection", stepName: "Technology Stack Detection", status: "running", detail: "กำลังตรวจจับ CMS, framework, plugins, theme...", progress: progressAccum });
  try {
    await detectTechStack(targetUrl, cleanDomain, result);
    progressAccum += 15;
    const techSummary = [
      result.techStack.cms ? `CMS: ${result.techStack.cms}${result.techStack.cmsVersion ? ` v${result.techStack.cmsVersion}` : ""}` : null,
      result.techStack.framework ? `Framework: ${result.techStack.framework}` : null,
      result.techStack.plugins.length > 0 ? `Plugins: ${result.techStack.plugins.length}` : null,
      result.techStack.theme ? `Theme: ${result.techStack.theme}` : null,
    ].filter(Boolean).join(" | ");
    onStep({
      stepId: "tech_detection", stepName: "Technology Stack Detection", status: "complete",
      detail: techSummary || "ไม่พบ CMS/framework ที่รู้จัก",
      progress: progressAccum,
      data: result.techStack,
      duration: Date.now() - step3Start,
    });
  } catch (e: any) {
    progressAccum += 15;
    onStep({ stepId: "tech_detection", stepName: "Technology Stack Detection", status: "error", detail: `ล้มเหลว: ${e.message}`, progress: progressAccum, duration: Date.now() - step3Start });
  }

  // ─── Step 4: Security Assessment ───
  const step4Start = Date.now();
  onStep({ stepId: "security_scan", stepName: "Security Assessment", status: "running", detail: "กำลังตรวจสอบ WAF, security headers, SSL...", progress: progressAccum });
  try {
    await securityAssessment(targetUrl, cleanDomain, result);
    progressAccum += 15;
    onStep({
      stepId: "security_scan", stepName: "Security Assessment", status: "complete",
      detail: `WAF: ${result.security.wafDetected || "None"} (${result.security.wafStrength}) | Security Score: ${result.security.securityScore}/100 | HSTS: ${result.security.hsts ? "Yes" : "No"} | CSP: ${result.security.csp ? "Yes" : "No"}`,
      progress: progressAccum,
      data: result.security,
      duration: Date.now() - step4Start,
    });
  } catch (e: any) {
    progressAccum += 15;
    onStep({ stepId: "security_scan", stepName: "Security Assessment", status: "error", detail: `ล้มเหลว: ${e.message}`, progress: progressAccum, duration: Date.now() - step4Start });
  }

  // ─── Step 5: SEO Metrics (Moz) ───
  const step5Start = Date.now();
  onStep({ stepId: "moz_metrics", stepName: "SEO Metrics (Moz DA/PA)", status: "running", detail: "กำลังดึง Domain Authority, Page Authority, Spam Score จาก Moz API...", progress: progressAccum });
  try {
    const mozMetrics = await getMozMetrics(cleanDomain);
    progressAccum += 10;
    if (mozMetrics) {
      result.seoMetrics = {
        domainAuthority: mozMetrics.domainAuthority,
        pageAuthority: mozMetrics.pageAuthority,
        spamScore: mozMetrics.spamScore,
        backlinks: mozMetrics.externalPagesToRootDomain,
        referringDomains: mozMetrics.rootDomainsToRootDomain,
        mozAvailable: true,
      };
      onStep({
        stepId: "moz_metrics", stepName: "SEO Metrics (Moz DA/PA)", status: "complete",
        detail: `DA: ${mozMetrics.domainAuthority} | PA: ${mozMetrics.pageAuthority} | Spam Score: ${mozMetrics.spamScore} | Backlinks: ${mozMetrics.externalPagesToRootDomain.toLocaleString()} | Referring Domains: ${mozMetrics.rootDomainsToRootDomain.toLocaleString()}`,
        progress: progressAccum,
        data: result.seoMetrics,
        duration: Date.now() - step5Start,
      });
    } else {
      onStep({
        stepId: "moz_metrics", stepName: "SEO Metrics (Moz DA/PA)", status: "complete",
        detail: "Moz API ไม่พร้อมใช้งาน — ข้ามขั้นตอนนี้",
        progress: progressAccum,
        duration: Date.now() - step5Start,
      });
    }
  } catch (e: any) {
    progressAccum += 10;
    onStep({ stepId: "moz_metrics", stepName: "SEO Metrics (Moz DA/PA)", status: "error", detail: `ล้มเหลว: ${e.message}`, progress: progressAccum, duration: Date.now() - step5Start });
  }

  // ─── Step 6: Upload Surface Mapping ───
  const step6Start = Date.now();
  onStep({ stepId: "upload_surface", stepName: "Upload Surface Mapping", status: "running", detail: "กำลังสแกน writable paths, upload endpoints, file managers...", progress: progressAccum });
  try {
    await mapUploadSurface(targetUrl, cleanDomain, result);
    progressAccum += 15;
    onStep({
      stepId: "upload_surface", stepName: "Upload Surface Mapping", status: "complete",
      detail: `Writable: ${result.uploadSurface.writablePaths.length} | Upload Endpoints: ${result.uploadSurface.uploadEndpoints.length} | File Manager: ${result.uploadSurface.fileManagerDetected ? "Yes" : "No"} | XMLRPC: ${result.uploadSurface.xmlrpcAvailable ? "Yes" : "No"} | REST API: ${result.uploadSurface.restApiAvailable ? "Yes" : "No"}`,
      progress: progressAccum,
      data: result.uploadSurface,
      duration: Date.now() - step6Start,
    });
  } catch (e: any) {
    progressAccum += 15;
    onStep({ stepId: "upload_surface", stepName: "Upload Surface Mapping", status: "error", detail: `ล้มเหลว: ${e.message}`, progress: progressAccum, duration: Date.now() - step6Start });
  }

  // ─── Step 7: Vulnerability Assessment ───
  const step7Start = Date.now();
  onStep({ stepId: "vuln_check", stepName: "Vulnerability Assessment", status: "running", detail: "กำลังตรวจสอบ known CVEs, misconfigurations, exposed files...", progress: progressAccum });
  try {
    await vulnerabilityCheck(targetUrl, cleanDomain, result);
    progressAccum += 10;
    const criticals = result.vulnerabilities.knownCVEs.filter(v => v.severity === "critical").length;
    const highs = result.vulnerabilities.knownCVEs.filter(v => v.severity === "high").length;
    onStep({
      stepId: "vuln_check", stepName: "Vulnerability Assessment", status: "complete",
      detail: `CVEs: ${result.vulnerabilities.knownCVEs.length} (${criticals} critical, ${highs} high) | Misconfigs: ${result.vulnerabilities.misconfigurations.length} | Exposed Files: ${result.vulnerabilities.exposedFiles.length} | Risk Score: ${result.vulnerabilities.totalRiskScore}/100`,
      progress: progressAccum,
      data: result.vulnerabilities,
      duration: Date.now() - step7Start,
    });
  } catch (e: any) {
    progressAccum += 10;
    onStep({ stepId: "vuln_check", stepName: "Vulnerability Assessment", status: "error", detail: `ล้มเหลว: ${e.message}`, progress: progressAccum, duration: Date.now() - step7Start });
  }

  // ─── Step 8: AI Strategic Analysis (LLM) ───
  const step8Start = Date.now();
  onStep({ stepId: "ai_strategy", stepName: "AI Strategic Analysis", status: "running", detail: "กำลังใช้ AI วิเคราะห์กลยุทธ์โจมตีที่เหมาะสม...", progress: progressAccum });
  try {
    await aiStrategicAnalysis(result);
    progressAccum = 100;
    onStep({
      stepId: "ai_strategy", stepName: "AI Strategic Analysis", status: "complete",
      detail: `โอกาสสำเร็จ: ${result.aiStrategy.overallSuccessProbability}% | ความยาก: ${result.aiStrategy.difficulty} | ความเสี่ยง: ${result.aiStrategy.riskLevel} | วิธีแนะนำ: ${result.aiStrategy.recommendedMethods.slice(0, 3).map(m => m.method).join(", ")}`,
      progress: 100,
      data: result.aiStrategy,
      duration: Date.now() - step8Start,
    });
  } catch (e: any) {
    progressAccum = 100;
    // Fallback to rule-based analysis
    calculateRuleBasedStrategy(result);
    onStep({
      stepId: "ai_strategy", stepName: "AI Strategic Analysis", status: "complete",
      detail: `(Rule-based) โอกาสสำเร็จ: ${result.aiStrategy.overallSuccessProbability}% | ความยาก: ${result.aiStrategy.difficulty}`,
      progress: 100,
      data: result.aiStrategy,
      duration: Date.now() - step8Start,
    });
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ═══════════════════════════════════════════════════════
//  STEP IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════

async function httpFingerprint(targetUrl: string, domain: string, result: AiTargetAnalysis): Promise<void> {
  const startMs = Date.now();
  const { response } = await fetchWithPoolProxy(targetUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  }, { targetDomain: domain, timeout: 20000 });

  result.httpFingerprint.responseTime = Date.now() - startMs;
  result.httpFingerprint.statusCode = response.status;
  result.httpFingerprint.finalUrl = response.url || targetUrl;

  // Server header
  const server = response.headers.get("server") || "";
  if (server) {
    result.httpFingerprint.serverVersion = server;
    if (server.toLowerCase().includes("apache")) result.httpFingerprint.serverType = "Apache";
    else if (server.toLowerCase().includes("nginx")) result.httpFingerprint.serverType = "Nginx";
    else if (server.toLowerCase().includes("iis")) result.httpFingerprint.serverType = "IIS";
    else if (server.toLowerCase().includes("litespeed")) result.httpFingerprint.serverType = "LiteSpeed";
    else if (server.toLowerCase().includes("cloudflare")) result.httpFingerprint.serverType = "Cloudflare";
    else result.httpFingerprint.serverType = server.split("/")[0];
  }

  // PHP version
  const poweredBy = response.headers.get("x-powered-by") || "";
  result.httpFingerprint.poweredBy = poweredBy || null;
  const phpMatch = poweredBy.match(/PHP\/([\d.]+)/);
  if (phpMatch) result.httpFingerprint.phpVersion = phpMatch[1];

  // OS guess
  if (server.toLowerCase().includes("win") || server.toLowerCase().includes("iis")) {
    result.httpFingerprint.osGuess = "Windows";
  } else {
    result.httpFingerprint.osGuess = "Linux";
  }
}

async function dnsAnalysis(domain: string, result: AiTargetAnalysis): Promise<void> {
  // DNS resolution via public DNS API
  try {
    const dnsRes = await fetch(`https://dns.google/resolve?name=${domain}&type=A`, {
      signal: AbortSignal.timeout(10000),
    });
    if (dnsRes.ok) {
      const data = await dnsRes.json() as { Answer?: { data: string; type: number }[] };
      if (data.Answer) {
        const aRecords = data.Answer.filter(a => a.type === 1);
        if (aRecords.length > 0) result.dnsInfo.ipAddress = aRecords[0].data;
      }
    }
  } catch { /* ignore */ }

  // NS records
  try {
    const nsRes = await fetch(`https://dns.google/resolve?name=${domain}&type=NS`, {
      signal: AbortSignal.timeout(10000),
    });
    if (nsRes.ok) {
      const data = await nsRes.json() as { Answer?: { data: string; type: number }[] };
      if (data.Answer) {
        result.dnsInfo.nameservers = data.Answer.filter(a => a.type === 2).map(a => a.data.replace(/\.$/, ""));
      }
    }
  } catch { /* ignore */ }

  // MX records
  try {
    const mxRes = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`, {
      signal: AbortSignal.timeout(10000),
    });
    if (mxRes.ok) {
      const data = await mxRes.json() as { Answer?: { data: string; type: number }[] };
      if (data.Answer) {
        result.dnsInfo.mxRecords = data.Answer.filter(a => a.type === 15).map(a => a.data.replace(/\.$/, ""));
      }
    }
  } catch { /* ignore */ }

  // TXT records (SPF, DMARC, etc.)
  try {
    const txtRes = await fetch(`https://dns.google/resolve?name=${domain}&type=TXT`, {
      signal: AbortSignal.timeout(10000),
    });
    if (txtRes.ok) {
      const data = await txtRes.json() as { Answer?: { data: string; type: number }[] };
      if (data.Answer) {
        result.dnsInfo.txtRecords = data.Answer.filter(a => a.type === 16).map(a => a.data.replace(/^"|"$/g, ""));
      }
    }
  } catch { /* ignore */ }

  // Detect CDN/hosting from nameservers
  const nsJoined = result.dnsInfo.nameservers.join(" ").toLowerCase();
  if (nsJoined.includes("cloudflare")) {
    result.dnsInfo.cdnDetected = "Cloudflare";
    result.dnsInfo.cloudflareProxied = true;
  } else if (nsJoined.includes("awsdns")) {
    result.dnsInfo.hostingProvider = "AWS";
  } else if (nsJoined.includes("google")) {
    result.dnsInfo.hostingProvider = "Google Cloud";
  } else if (nsJoined.includes("azure")) {
    result.dnsInfo.hostingProvider = "Azure";
  } else if (nsJoined.includes("hostgator")) {
    result.dnsInfo.hostingProvider = "HostGator";
  } else if (nsJoined.includes("godaddy") || nsJoined.includes("domaincontrol")) {
    result.dnsInfo.hostingProvider = "GoDaddy";
  } else if (nsJoined.includes("namecheap")) {
    result.dnsInfo.hostingProvider = "Namecheap";
  }

  // Shodan IP lookup for ports
  if (result.dnsInfo.ipAddress && ENV.shodanApiKey) {
    try {
      const hostRes = await fetch(`https://api.shodan.io/shodan/host/${result.dnsInfo.ipAddress}?key=${ENV.shodanApiKey}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (hostRes.ok) {
        const hostData = await hostRes.json() as {
          data?: { port: number; product?: string }[];
          org?: string; isp?: string;
        };
        if (hostData.data) {
          result.uploadSurface.openPorts = hostData.data.map(d => ({
            port: d.port,
            service: d.product || `port-${d.port}`,
          }));
          result.uploadSurface.ftpAvailable = hostData.data.some(d => d.port === 21);
          result.uploadSurface.sshAvailable = hostData.data.some(d => d.port === 22);
        }
        if (hostData.org) result.dnsInfo.hostingProvider = hostData.org;
      }
    } catch { /* ignore */ }
  }
}

async function detectTechStack(targetUrl: string, domain: string, result: AiTargetAnalysis): Promise<void> {
  const { response } = await fetchWithPoolProxy(targetUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  }, { targetDomain: domain, timeout: 20000 });
  const html = await response.text();
  const htmlLower = html.toLowerCase();

  // WordPress
  if (htmlLower.includes("wp-content") || htmlLower.includes("wp-includes") || htmlLower.includes("wordpress")) {
    result.techStack.cms = "WordPress";
    const verMatch = html.match(/content="WordPress ([\d.]+)"/);
    if (verMatch) result.techStack.cmsVersion = verMatch[1];

    // Plugins
    const plugins = new Set<string>();
    const pluginRegex = /wp-content\/plugins\/([\w-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = pluginRegex.exec(html)) !== null) plugins.add(m[1]);
    result.techStack.plugins = Array.from(plugins);

    // Theme
    const themeMatch = html.match(/wp-content\/themes\/([\w-]+)/);
    if (themeMatch) result.techStack.theme = themeMatch[1];
  }
  // Joomla
  else if (htmlLower.includes("/media/jui/") || htmlLower.includes("joomla") || htmlLower.includes("/components/com_")) {
    result.techStack.cms = "Joomla";
  }
  // Drupal
  else if (htmlLower.includes("drupal") || htmlLower.includes("/sites/default/")) {
    result.techStack.cms = "Drupal";
  }
  // PrestaShop
  else if (htmlLower.includes("prestashop") || htmlLower.includes("/modules/ps_")) {
    result.techStack.cms = "PrestaShop";
  }
  // Magento
  else if (htmlLower.includes("magento") || htmlLower.includes("mage/cookies")) {
    result.techStack.cms = "Magento";
  }

  // JS Libraries
  if (htmlLower.includes("jquery")) result.techStack.jsLibraries.push("jQuery");
  if (htmlLower.includes("react")) result.techStack.jsLibraries.push("React");
  if (htmlLower.includes("vue.js") || htmlLower.includes("vue.min.js")) result.techStack.jsLibraries.push("Vue.js");
  if (htmlLower.includes("angular")) result.techStack.jsLibraries.push("Angular");
  if (htmlLower.includes("bootstrap")) result.techStack.jsLibraries.push("Bootstrap");

  // Analytics
  if (htmlLower.includes("google-analytics") || htmlLower.includes("gtag")) result.techStack.analytics.push("Google Analytics");
  if (htmlLower.includes("facebook.com/tr") || htmlLower.includes("fbq(")) result.techStack.analytics.push("Facebook Pixel");
  if (htmlLower.includes("hotjar")) result.techStack.analytics.push("Hotjar");

  // E-commerce
  if (htmlLower.includes("woocommerce")) result.techStack.ecommerce = "WooCommerce";
  else if (htmlLower.includes("shopify")) result.techStack.ecommerce = "Shopify";

  // Caching
  const cacheHeaders = response.headers.get("x-cache") || "";
  const viaHeader = response.headers.get("via") || "";
  if (cacheHeaders.includes("HIT") || htmlLower.includes("wp-super-cache")) result.techStack.caching = "Server Cache";
  if (viaHeader.includes("varnish")) result.techStack.caching = "Varnish";

  // Framework detection
  if (htmlLower.includes("laravel") || response.headers.get("set-cookie")?.includes("laravel")) result.techStack.framework = "Laravel";
  else if (htmlLower.includes("django") || response.headers.get("set-cookie")?.includes("csrftoken")) result.techStack.framework = "Django";
  else if (htmlLower.includes("next.js") || htmlLower.includes("__next")) result.techStack.framework = "Next.js";
}

async function securityAssessment(targetUrl: string, domain: string, result: AiTargetAnalysis): Promise<void> {
  // Get headers from a clean request
  const { response } = await fetchWithPoolProxy(targetUrl, {
    method: "HEAD",
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  }, { targetDomain: domain, timeout: 15000 });

  // Security headers
  const secHeaders = [
    "x-frame-options", "x-content-type-options", "content-security-policy",
    "strict-transport-security", "x-xss-protection", "permissions-policy",
    "referrer-policy", "x-permitted-cross-domain-policies",
  ];
  for (const h of secHeaders) {
    const val = response.headers.get(h);
    if (val) result.security.securityHeaders[h] = val;
  }

  result.security.hsts = !!response.headers.get("strict-transport-security");
  result.security.csp = !!response.headers.get("content-security-policy");
  result.security.xFrameOptions = !!response.headers.get("x-frame-options");
  result.security.httpOnly = (response.headers.get("set-cookie") || "").includes("HttpOnly");

  // WAF detection from headers
  if (response.headers.get("cf-ray")) {
    result.security.wafDetected = "Cloudflare";
    result.dnsInfo.cloudflareProxied = true;
  } else if (response.headers.get("x-sucuri-id")) {
    result.security.wafDetected = "Sucuri";
  } else if (response.headers.get("x-wordfence-blocked")) {
    result.security.wafDetected = "Wordfence";
  }

  // SSL issuer from response
  result.security.sslEnabled = targetUrl.startsWith("https");

  // WAF strength test — send suspicious payloads
  let wafBlocks = 0;
  const testPaths = [
    `${targetUrl}/?test=<script>alert(1)</script>`,
    `${targetUrl}/wp-admin/../../../etc/passwd`,
    `${targetUrl}/test.php.jpg`,
  ];

  for (const testPath of testPaths) {
    try {
      const { response: res } = await fetchWithPoolProxy(testPath, {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0" },
      }, { targetDomain: domain, timeout: 8000 });
      if (res.status === 403 || res.status === 406 || res.status === 429) wafBlocks++;
      if (res.headers.get("cf-ray")) result.security.wafDetected = "Cloudflare";
      if (res.headers.get("x-sucuri-id")) result.security.wafDetected = "Sucuri";
      if (res.headers.get("x-wordfence-blocked")) result.security.wafDetected = "Wordfence";
    } catch {
      wafBlocks++;
    }
  }

  if (wafBlocks >= 3) result.security.wafStrength = "very_strong";
  else if (wafBlocks >= 2) result.security.wafStrength = "strong";
  else if (wafBlocks >= 1) result.security.wafStrength = "moderate";
  else if (result.security.wafDetected) result.security.wafStrength = "weak";
  else result.security.wafStrength = "none";

  // Security score
  let score = 0;
  score += Object.keys(result.security.securityHeaders).length * 8;
  if (result.security.wafDetected) score += 20;
  if (result.security.wafStrength === "very_strong") score += 15;
  else if (result.security.wafStrength === "strong") score += 10;
  if (result.security.sslEnabled) score += 5;
  if (result.security.hsts) score += 5;
  if (result.security.csp) score += 10;
  result.security.securityScore = Math.min(100, score);
}

async function mapUploadSurface(targetUrl: string, domain: string, result: AiTargetAnalysis): Promise<void> {
  const pathsToCheck = [
    "/wp-content/uploads/", "/wp-content/themes/", "/wp-content/plugins/",
    "/wp-includes/", "/wp-admin/", "/xmlrpc.php", "/wp-json/wp/v2/",
    "/uploads/", "/upload/", "/files/", "/media/", "/images/",
    "/assets/", "/data/", "/tmp/", "/temp/", "/cache/", "/backup/",
    "/filemanager/", "/elfinder/", "/tinyfilemanager.php", "/fm.php",
    "/admin/", "/administrator/", "/cpanel/", "/panel/",
    "/phpmyadmin/", "/adminer.php",
    "/api/", "/api/upload", "/graphql",
    "/webdav/", "/dav/",
  ];

  const checks = await Promise.allSettled(
    pathsToCheck.map(async (path) => {
      try {
        const { response: res } = await fetchWithPoolProxy(`${targetUrl}${path}`, {
          method: "HEAD",
          redirect: "manual",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        }, { targetDomain: domain, timeout: 6000 });
        return { path, status: res.status };
      } catch {
        return { path, status: 0 };
      }
    })
  );

  for (const check of checks) {
    if (check.status !== "fulfilled") continue;
    const r = check.value;
    if (r.status === 200 || r.status === 301 || r.status === 302) {
      if (r.status === 200 && !r.path.endsWith(".php") && !r.path.endsWith(".xml") && r.path.endsWith("/")) {
        result.uploadSurface.directoryListingPaths.push(r.path);
      }
      if (r.path.includes("upload") || r.path.includes("files") || r.path.includes("media")) {
        result.uploadSurface.uploadEndpoints.push(r.path);
      }
      if (r.path.includes("filemanager") || r.path.includes("elfinder") || r.path.includes("fm.php") || r.path.includes("tinyfilemanager")) {
        result.uploadSurface.fileManagerDetected = true;
      }
      if (r.path === "/xmlrpc.php") result.uploadSurface.xmlrpcAvailable = true;
      if (r.path.includes("wp-json")) result.uploadSurface.restApiAvailable = true;
      if (r.path.includes("webdav") || r.path.includes("dav")) result.uploadSurface.webdavAvailable = true;
    }
    if (r.status === 200 && r.path.endsWith("/")) {
      result.uploadSurface.writablePaths.push(r.path);
    }
  }
}

async function vulnerabilityCheck(targetUrl: string, domain: string, result: AiTargetAnalysis): Promise<void> {
  // WordPress plugin CVEs
  const wpVulnPlugins: Record<string, { cve: string; description: string; severity: string }> = {
    "contact-form-7": { cve: "CVE-2023-6449", description: "Unrestricted file upload via Contact Form 7", severity: "critical" },
    "elementor": { cve: "CVE-2023-48777", description: "Elementor arbitrary file upload", severity: "high" },
    "wp-file-manager": { cve: "CVE-2020-25213", description: "WP File Manager unauthenticated RCE", severity: "critical" },
    "revslider": { cve: "CVE-2014-9734", description: "Revolution Slider arbitrary file upload", severity: "critical" },
    "formidable": { cve: "CVE-2023-47682", description: "Formidable Forms file upload bypass", severity: "high" },
    "wp-fastest-cache": { cve: "CVE-2023-6063", description: "WP Fastest Cache SQL injection", severity: "high" },
    "really-simple-ssl": { cve: "CVE-2023-49583", description: "Really Simple SSL auth bypass", severity: "critical" },
    "updraftplus": { cve: "CVE-2022-0633", description: "UpdraftPlus backup download", severity: "high" },
    "woocommerce": { cve: "CVE-2023-28121", description: "WooCommerce auth bypass", severity: "critical" },
  };

  if (result.techStack.cms === "WordPress") {
    for (const plugin of result.techStack.plugins) {
      if (wpVulnPlugins[plugin]) {
        result.vulnerabilities.knownCVEs.push(wpVulnPlugins[plugin]);
      }
    }
    if (result.techStack.cmsVersion) {
      const major = parseFloat(result.techStack.cmsVersion);
      if (major < 6.0) {
        result.vulnerabilities.knownCVEs.push({
          cve: "CVE-2022-21661", description: `WordPress ${result.techStack.cmsVersion} — multiple known vulnerabilities`, severity: "high",
        });
      }
    }
  }

  // PHP version vulnerabilities
  if (result.httpFingerprint.phpVersion) {
    const major = parseInt(result.httpFingerprint.phpVersion.split(".")[0]);
    const minor = parseInt(result.httpFingerprint.phpVersion.split(".")[1] || "0");
    if (major < 7 || (major === 7 && minor < 4)) {
      result.vulnerabilities.knownCVEs.push({
        cve: "CVE-2019-11043", description: `PHP ${result.httpFingerprint.phpVersion} — known RCE vulnerability`, severity: "critical",
      });
    }
  }

  // Check for exposed sensitive files
  const sensitiveFiles = [
    ".env", ".git/config", "wp-config.php.bak", "wp-config.php~",
    ".htaccess.bak", "phpinfo.php", "info.php", "test.php",
    "backup.sql", "database.sql", "dump.sql",
  ];

  const fileChecks = await Promise.allSettled(
    sensitiveFiles.map(async (file) => {
      try {
        const { response: res } = await fetchWithPoolProxy(`${targetUrl}/${file}`, {
          method: "HEAD",
          redirect: "manual",
          headers: { "User-Agent": "Mozilla/5.0" },
        }, { targetDomain: domain, timeout: 5000 });
        return { file, status: res.status };
      } catch {
        return { file, status: 0 };
      }
    })
  );

  for (const check of fileChecks) {
    if (check.status !== "fulfilled") continue;
    const r = check.value;
    if (r.status === 200) {
      result.vulnerabilities.exposedFiles.push(r.file);
      result.vulnerabilities.misconfigurations.push(`Exposed file: ${r.file}`);
    }
  }

  // Calculate risk score
  let riskScore = 0;
  riskScore += result.vulnerabilities.knownCVEs.filter(v => v.severity === "critical").length * 25;
  riskScore += result.vulnerabilities.knownCVEs.filter(v => v.severity === "high").length * 15;
  riskScore += result.vulnerabilities.exposedFiles.length * 10;
  riskScore += result.vulnerabilities.misconfigurations.length * 5;
  result.vulnerabilities.totalRiskScore = Math.min(100, riskScore);
}

// ═══════════════════════════════════════════════════════
//  AI STRATEGIC ANALYSIS (LLM)
// ═══════════════════════════════════════════════════════

async function aiStrategicAnalysis(result: AiTargetAnalysis): Promise<void> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an elite offensive security specialist with 15+ years of experience in web application exploitation, specializing in:

**Core Expertise:**
- PHP webshell upload bypass: double extension (.php.jpg), null byte injection, content-type spoofing, .htaccess override, polyglot files (GIF89a header + PHP), EXIF metadata injection, ZIP slip, phar deserialization
- WAF evasion: chunked transfer encoding, unicode normalization, HTTP parameter pollution, multipart boundary manipulation, case alternation, comment injection, URL encoding chains
- WordPress exploitation: plugin/theme upload via wp-admin, XMLRPC multicall brute-force, REST API content injection, wp-cron abuse, user enumeration (author archives, REST users endpoint), application password exploitation, mu-plugins directory write
- File manager exploitation: elfinder RCE, wp-file-manager arbitrary upload, adminer.php SQL injection
- Redirect injection: PHP header() redirect, JavaScript window.location, meta refresh, iframe injection, .htaccess RewriteRule, wp_redirect hook, 301/302 chain redirect
- Cloaking: geo-IP based content switching (PHP + JS), user-agent detection (Googlebot vs real users), referrer-based cloaking, cookie-based cloaking, JavaScript obfuscation (base64, eval, charCode)
- Server-specific: Apache mod_rewrite bypass, Nginx alias traversal, LiteSpeed .htaccess tricks, IIS web.config manipulation

**Analysis Rules:**
1. เมื่อเห็น WordPress → ต้องวิเคราะห์ทุก plugin ว่ามี CVE หรือ exploit path ไหม
2. เมื่อเห็น Apache/PHP → ต้องแนะนำ .htaccess override + double extension technique
3. เมื่อเห็น Cloudflare → ต้องแนะนำ origin IP bypass + direct IP access
4. เมื่อเห็น XMLRPC available → ต้องแนะนำ multicall brute-force
5. เมื่อเห็น REST API available → ต้องแนะนำ content injection + user enumeration
6. เมื่อเห็น file manager → ต้องแนะนำ elfinder/wp-file-manager exploit
7. ต้องวิเคราะห์ว่า redirect จะทำงานได้ 100% ด้วยวิธีไหน (JS vs PHP vs .htaccess)
8. ต้องแนะนำ cloaking strategy ที่เหมาะกับ target (geo-IP + user-agent + referrer)
9. ต้องประเมินว่า shell จะอยู่รอดได้นานแค่ไหน (persistence analysis)
10. ต้องแนะนำ backup attack path ถ้าวิธีหลักล้มเหลว

วิเคราะห์อย่างละเอียด ตอบเป็นภาษาไทยทั้งหมด (ยกเว้นชื่อเทคนิค/เครื่องมือ). Respond in JSON format.`,
      },
      {
        role: "user",
        content: `Target: ${result.domain}

=== HTTP Fingerprint ===
Server: ${result.httpFingerprint.serverType || "Unknown"} (${result.httpFingerprint.serverVersion || "N/A"})
PHP: ${result.httpFingerprint.phpVersion || "Unknown"}
OS: ${result.httpFingerprint.osGuess || "Unknown"}
Response Time: ${result.httpFingerprint.responseTime}ms
Status: ${result.httpFingerprint.statusCode}

=== DNS & Network ===
IP: ${result.dnsInfo.ipAddress || "Unknown"}
Hosting: ${result.dnsInfo.hostingProvider || "Unknown"}
CDN: ${result.dnsInfo.cdnDetected || "None"}
Cloudflare Proxied: ${result.dnsInfo.cloudflareProxied}
Nameservers: ${result.dnsInfo.nameservers.join(", ") || "Unknown"}

=== Technology Stack ===
CMS: ${result.techStack.cms || "None"} ${result.techStack.cmsVersion ? `v${result.techStack.cmsVersion}` : ""}
Framework: ${result.techStack.framework || "None"}
Plugins: ${result.techStack.plugins.join(", ") || "None"}
Theme: ${result.techStack.theme || "Unknown"}

=== Security ===
WAF: ${result.security.wafDetected || "None"} (strength: ${result.security.wafStrength})
Security Score: ${result.security.securityScore}/100
HSTS: ${result.security.hsts}, CSP: ${result.security.csp}
Security Headers: ${Object.keys(result.security.securityHeaders).join(", ") || "None"}

=== SEO Metrics ===
DA: ${result.seoMetrics.domainAuthority} | PA: ${result.seoMetrics.pageAuthority} | Spam Score: ${result.seoMetrics.spamScore}
Backlinks: ${result.seoMetrics.backlinks} | Referring Domains: ${result.seoMetrics.referringDomains}

=== Upload Surface ===
Writable Paths: ${result.uploadSurface.writablePaths.length} (${result.uploadSurface.writablePaths.slice(0, 5).join(", ")})
Upload Endpoints: ${result.uploadSurface.uploadEndpoints.length}
File Manager: ${result.uploadSurface.fileManagerDetected}
XMLRPC: ${result.uploadSurface.xmlrpcAvailable}
REST API: ${result.uploadSurface.restApiAvailable}
FTP: ${result.uploadSurface.ftpAvailable} | SSH: ${result.uploadSurface.sshAvailable}
Open Ports: ${result.uploadSurface.openPorts.map(p => `${p.port}/${p.service}`).join(", ") || "Unknown"}

=== Vulnerabilities ===
Known CVEs: ${result.vulnerabilities.knownCVEs.map(v => `${v.cve} (${v.severity}): ${v.description}`).join("; ") || "None"}
Misconfigurations: ${result.vulnerabilities.misconfigurations.join(", ") || "None"}
Exposed Files: ${result.vulnerabilities.exposedFiles.join(", ") || "None"}
Risk Score: ${result.vulnerabilities.totalRiskScore}/100

Provide a comprehensive tactical analysis with:
1. Overall success probability (0-100) — โอกาสที่จะวางไฟล์ได้ 100% พร้อม redirect ทำงาน
2. Difficulty assessment
3. Risk level for the attacker
4. Detection risk
5. Should proceed (true/false with reason)
6. Tactical analysis (4-6 sentences in Thai) — ต้องระบุว่าจะใช้ technique ไหนในการ upload shell, วิธี bypass WAF, วิธี inject redirect, และวิธี cloak
7. Top 5-8 recommended attack methods with probability and reasoning — แต่ละวิธีต้องระบุว่า:
   - จะ upload ด้วยเทคนิคไหน (double ext, polyglot, .htaccess, etc.)
   - จะ bypass WAF ด้วยวิธีไหน
   - redirect จะทำงานด้วยวิธีไหน (JS, PHP header, .htaccess, meta refresh)
   - cloaking จะใช้แบบไหน (geo-IP, user-agent, referrer)
8. Warnings and recommendations
9. Estimated time to complete
10. Best overall approach summary — ต้องระบุขั้นตอนทั้งหมดตั้งแต่ upload → verify → inject redirect → cloak → persistence

Respond as JSON:
{
  "overallSuccessProbability": number,
  "difficulty": "easy|medium|hard|very_hard",
  "riskLevel": "low|medium|high|critical",
  "detectionRisk": "low|medium|high",
  "shouldProceed": boolean,
  "proceedReason": "string",
  "tacticalAnalysis": "string (Thai)",
  "recommendedMethods": [{"method": "string", "probability": number, "reasoning": "string (Thai)", "priority": number}],
  "warnings": ["string (Thai)"],
  "recommendations": ["string (Thai)"],
  "estimatedTime": "string",
  "bestApproach": "string (Thai)"
}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "attack_strategy",
        strict: true,
        schema: {
          type: "object",
          properties: {
            overallSuccessProbability: { type: "number" },
            difficulty: { type: "string" },
            riskLevel: { type: "string" },
            detectionRisk: { type: "string" },
            shouldProceed: { type: "boolean" },
            proceedReason: { type: "string" },
            tacticalAnalysis: { type: "string" },
            recommendedMethods: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  method: { type: "string" },
                  probability: { type: "number" },
                  reasoning: { type: "string" },
                  priority: { type: "number" },
                },
                required: ["method", "probability", "reasoning", "priority"],
                additionalProperties: false,
              },
            },
            warnings: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } },
            estimatedTime: { type: "string" },
            bestApproach: { type: "string" },
          },
          required: ["overallSuccessProbability", "difficulty", "riskLevel", "detectionRisk", "shouldProceed", "proceedReason", "tacticalAnalysis", "recommendedMethods", "warnings", "recommendations", "estimatedTime", "bestApproach"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (content && typeof content === "string") {
    const parsed = JSON.parse(content);
    result.aiStrategy = {
      overallSuccessProbability: Math.max(0, Math.min(100, parsed.overallSuccessProbability || 50)),
      difficulty: ["easy", "medium", "hard", "very_hard"].includes(parsed.difficulty) ? parsed.difficulty : "medium",
      riskLevel: ["low", "medium", "high", "critical"].includes(parsed.riskLevel) ? parsed.riskLevel : "medium",
      detectionRisk: ["low", "medium", "high"].includes(parsed.detectionRisk) ? parsed.detectionRisk : "medium",
      shouldProceed: parsed.shouldProceed ?? true,
      proceedReason: parsed.proceedReason || "",
      tacticalAnalysis: parsed.tacticalAnalysis || "",
      recommendedMethods: (parsed.recommendedMethods || []).map((m: any, i: number) => ({
        method: m.method || `Method ${i + 1}`,
        probability: Math.max(0, Math.min(100, m.probability || 0)),
        reasoning: m.reasoning || "",
        priority: m.priority || i + 1,
      })),
      warnings: parsed.warnings || [],
      recommendations: parsed.recommendations || [],
      estimatedTime: parsed.estimatedTime || "2-5 minutes",
      bestApproach: parsed.bestApproach || "",
    };
  }
}

function calculateRuleBasedStrategy(result: AiTargetAnalysis): void {
  // Fallback rule-based calculation
  let prob = 30;
  if (result.uploadSurface.writablePaths.length >= 3) prob += 20;
  else if (result.uploadSurface.writablePaths.length >= 1) prob += 10;
  if (result.security.wafDetected) prob -= 15;
  if (result.security.wafStrength === "very_strong") prob -= 20;
  if (result.uploadSurface.uploadEndpoints.length > 0) prob += 15;
  if (result.techStack.cms === "WordPress") prob += 10;
  if (result.vulnerabilities.knownCVEs.some(v => v.severity === "critical")) prob += 20;
  if (result.uploadSurface.fileManagerDetected) prob += 15;
  prob = Math.max(5, Math.min(95, prob));

  result.aiStrategy.overallSuccessProbability = prob;
  result.aiStrategy.difficulty = prob >= 60 ? "easy" : prob >= 40 ? "medium" : prob >= 20 ? "hard" : "very_hard";
  result.aiStrategy.riskLevel = prob >= 60 ? "low" : prob >= 40 ? "medium" : "high";
  result.aiStrategy.shouldProceed = prob >= 15;
  result.aiStrategy.proceedReason = prob >= 15 ? "มี attack surface เพียงพอ" : "โอกาสสำเร็จต่ำมาก";
  result.aiStrategy.tacticalAnalysis = `Rule-based analysis: ${result.httpFingerprint.serverType || "Unknown"} server${result.techStack.cms ? ` with ${result.techStack.cms}` : ""}. ${result.security.wafDetected ? `WAF: ${result.security.wafDetected}` : "No WAF"}. ${result.vulnerabilities.knownCVEs.length} known vulnerabilities.`;

  // Build method recommendations
  const methods: AiTargetAnalysis["aiStrategy"]["recommendedMethods"] = [];
  if (result.uploadSurface.writablePaths.length > 0) {
    methods.push({ method: "HTTP Direct Upload", probability: Math.min(90, 30 + result.uploadSurface.writablePaths.length * 10), reasoning: `${result.uploadSurface.writablePaths.length} writable paths`, priority: 1 });
  }
  if (result.techStack.cms === "WordPress") {
    methods.push({ method: "WordPress Plugin Exploit", probability: Math.min(90, 20 + result.vulnerabilities.knownCVEs.filter(v => v.severity === "critical").length * 15), reasoning: `${result.techStack.plugins.length} plugins detected`, priority: 2 });
  }
  if (result.uploadSurface.fileManagerDetected) {
    methods.push({ method: "File Manager Exploit", probability: 50, reasoning: "File manager detected", priority: 3 });
  }
  methods.push({ method: "PHP Shell Upload", probability: Math.max(10, prob - 10), reasoning: "Standard shell upload", priority: methods.length + 1 });
  result.aiStrategy.recommendedMethods = methods.sort((a, b) => b.probability - a.probability);
}
