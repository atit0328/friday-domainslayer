/**
 * AI Deep Vulnerability Analysis — LLM-powered pre-attack intelligence
 * 
 * Enhances the existing AI Target Analysis with:
 * 1. LLM-powered vulnerability classification (not just hardcoded CVE matching)
 * 2. Exploit Path Mapping — step-by-step exploitation chains
 * 3. Attack Surface Scoring — weighted risk assessment
 * 4. Pre-Attack Decision Gate — structured go/no-go recommendation
 * 5. Vulnerability-to-Method Mapping — which attack vectors exploit which vulns
 */
import { invokeLLM } from "./_core/llm";
import type { AiTargetAnalysis } from "./ai-target-analysis";
import type { VulnScanResult } from "./ai-vuln-analyzer";
import type { PreScreenResult } from "./ai-prescreening";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface DeepVulnAnalysis {
  target: string;
  analyzedAt: number;
  duration: number;

  // Vulnerability Classification
  vulnerabilities: ClassifiedVulnerability[];
  
  // Exploit Chains
  exploitChains: ExploitChain[];
  
  // Attack Surface Score
  attackSurface: AttackSurfaceScore;
  
  // Decision Gate
  decision: AttackDecision;
  
  // AI Narrative
  aiNarrative: string;
  
  // Method-to-Vulnerability Mapping
  methodVulnMap: MethodVulnMapping[];
}

export interface ClassifiedVulnerability {
  id: string;
  name: string;
  category: "file_upload" | "auth_bypass" | "rce" | "sqli" | "xss" | "ssrf" | "lfi" | "config_exposure" | "misconfiguration" | "outdated_software" | "default_creds" | "info_disclosure";
  severity: "critical" | "high" | "medium" | "low" | "info";
  cvss: number; // 0-10
  description: string;
  evidence: string;
  exploitable: boolean;
  exploitDifficulty: "trivial" | "easy" | "moderate" | "hard" | "very_hard";
  aiConfidence: number; // 0-100
  remediation: string;
}

export interface ExploitChain {
  id: string;
  name: string;
  steps: ExploitStep[];
  totalSuccessProbability: number;
  estimatedTime: string;
  requiredConditions: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  stealthLevel: "loud" | "moderate" | "quiet" | "silent";
  targetVulnerabilities: string[]; // vulnerability IDs
}

export interface ExploitStep {
  order: number;
  action: string;
  technique: string;
  target: string;
  expectedOutcome: string;
  fallbackAction: string;
  detectionRisk: "low" | "medium" | "high";
}

export interface AttackSurfaceScore {
  overall: number; // 0-100
  categories: {
    fileUpload: number;
    authentication: number;
    serverConfig: number;
    applicationLogic: number;
    networkExposure: number;
    informationLeakage: number;
  };
  weakestPoint: string;
  strongestDefense: string;
}

export interface AttackDecision {
  proceed: boolean;
  confidence: number; // 0-100
  reasoning: string;
  riskAssessment: string;
  estimatedSuccessRate: number;
  estimatedDuration: string;
  recommendedApproach: string;
  alternativeApproaches: string[];
  criticalWarnings: string[];
  prerequisites: string[];
}

export interface MethodVulnMapping {
  method: string;
  exploitsVulnerabilities: string[]; // vulnerability IDs
  successProbability: number;
  reasoning: string;
}

export type DeepVulnProgressCallback = (
  stage: string,
  detail: string,
  progress: number,
  data?: any,
) => void;

// ═══════════════════════════════════════════════════════
//  MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════

export async function runDeepVulnAnalysis(
  targetDomain: string,
  aiAnalysis: AiTargetAnalysis | null,
  vulnScan: VulnScanResult | null,
  prescreen: PreScreenResult | null,
  onProgress: DeepVulnProgressCallback = () => {},
): Promise<DeepVulnAnalysis> {
  const startTime = Date.now();
  
  onProgress("start", `🔬 เริ่ม Deep Vulnerability Analysis สำหรับ ${targetDomain}...`, 0);

  // ─── Stage 1: Collect all raw data ───
  onProgress("collect", "📋 รวบรวมข้อมูลจาก AI Analysis, Vuln Scan, และ Pre-screen...", 5);
  
  const rawData = collectRawData(targetDomain, aiAnalysis, vulnScan, prescreen);

  // ─── Stage 2: AI Vulnerability Classification ───
  onProgress("classify", "🧠 AI กำลังจำแนกช่องโหว่และประเมินความรุนแรง...", 15);
  
  const vulnerabilities = await classifyVulnerabilities(rawData, onProgress);
  
  onProgress("classify_done", `✅ จำแนกช่องโหว่เสร็จ — พบ ${vulnerabilities.length} ช่องโหว่`, 30, {
    total: vulnerabilities.length,
    critical: vulnerabilities.filter(v => v.severity === "critical").length,
    high: vulnerabilities.filter(v => v.severity === "high").length,
    exploitable: vulnerabilities.filter(v => v.exploitable).length,
  });

  // ─── Stage 3: Exploit Chain Mapping ───
  onProgress("chains", "🔗 AI กำลังสร้าง Exploit Chains — วิเคราะห์เส้นทางการโจมตี...", 40);
  
  const exploitChains = await mapExploitChains(rawData, vulnerabilities, onProgress);
  
  onProgress("chains_done", `✅ สร้าง Exploit Chains เสร็จ — ${exploitChains.length} เส้นทาง`, 55, {
    totalChains: exploitChains.length,
    bestChain: exploitChains[0]?.name || "N/A",
    bestProbability: exploitChains[0]?.totalSuccessProbability || 0,
  });

  // ─── Stage 4: Attack Surface Scoring ───
  onProgress("scoring", "📊 คำนวณ Attack Surface Score...", 60);
  
  const attackSurface = calculateAttackSurface(rawData, vulnerabilities);
  
  onProgress("scoring_done", `✅ Attack Surface Score: ${attackSurface.overall}/100 — จุดอ่อน: ${attackSurface.weakestPoint}`, 70, {
    score: attackSurface.overall,
    categories: attackSurface.categories,
  });

  // ─── Stage 5: Method-Vulnerability Mapping ───
  onProgress("mapping", "🎯 จับคู่วิธีโจมตีกับช่องโหว่ที่พบ...", 75);
  
  const methodVulnMap = mapMethodsToVulns(vulnerabilities, exploitChains, rawData);

  // ─── Stage 6: AI Decision Gate ───
  onProgress("decision", "🤖 AI กำลังตัดสินใจ — ประเมินว่าควรโจมตีหรือไม่...", 80);
  
  const decision = await makeAttackDecision(rawData, vulnerabilities, exploitChains, attackSurface, onProgress);
  
  onProgress("decision_done", `${decision.proceed ? "✅" : "❌"} การตัดสินใจ: ${decision.proceed ? "ดำเนินการ" : "ไม่แนะนำ"} — ความมั่นใจ ${decision.confidence}%`, 90, {
    proceed: decision.proceed,
    confidence: decision.confidence,
    successRate: decision.estimatedSuccessRate,
  });

  // ─── Stage 7: Generate AI Narrative ───
  onProgress("narrative", "📝 AI กำลังเขียนรายงานสรุป...", 95);
  
  const aiNarrative = generateNarrative(targetDomain, vulnerabilities, exploitChains, attackSurface, decision);

  const result: DeepVulnAnalysis = {
    target: targetDomain,
    analyzedAt: Date.now(),
    duration: Date.now() - startTime,
    vulnerabilities,
    exploitChains,
    attackSurface,
    decision,
    aiNarrative,
    methodVulnMap,
  };

  onProgress("complete", `✅ Deep Vulnerability Analysis เสร็จสมบูรณ์ — ${vulnerabilities.length} vulns, ${exploitChains.length} chains, score ${attackSurface.overall}/100`, 100, result);

  return result;
}

// ═══════════════════════════════════════════════════════
//  COLLECT RAW DATA
// ═══════════════════════════════════════════════════════

interface RawScanData {
  domain: string;
  server: string;
  os: string;
  php: string;
  cms: string;
  cmsVersion: string;
  waf: string;
  wafStrength: string;
  cdn: string;
  ssl: boolean;
  securityScore: number;
  securityHeaders: Record<string, string>;
  hsts: boolean;
  csp: boolean;
  xFrameOptions: boolean;
  plugins: string[];
  theme: string;
  writablePaths: string[];
  uploadEndpoints: string[];
  exposedFiles: string[];
  knownCVEs: { cve: string; description: string; severity: string }[];
  misconfigurations: string[];
  openPorts: { port: number; service: string }[];
  ftpAvailable: boolean;
  sshAvailable: boolean;
  webdavAvailable: boolean;
  xmlrpcAvailable: boolean;
  restApiAvailable: boolean;
  fileManagerDetected: boolean;
  directoryListingPaths: string[];
  domainAuthority: number;
  httpMethods: string[];
  prescreenScore: number;
  prescreenMethods: { method: string; probability: number }[];
}

function collectRawData(
  domain: string,
  ai: AiTargetAnalysis | null,
  vuln: VulnScanResult | null,
  pre: PreScreenResult | null,
): RawScanData {
  return {
    domain,
    server: ai?.httpFingerprint?.serverType || vuln?.serverInfo?.server || pre?.serverType || "Unknown",
    os: ai?.httpFingerprint?.osGuess || vuln?.serverInfo?.os || "Unknown",
    php: ai?.httpFingerprint?.phpVersion || vuln?.serverInfo?.phpVersion || "",
    cms: ai?.techStack?.cms || vuln?.cms?.type || pre?.cms || "Unknown",
    cmsVersion: ai?.techStack?.cmsVersion || vuln?.cms?.version || pre?.cmsVersion || "",
    waf: ai?.security?.wafDetected || vuln?.serverInfo?.waf || pre?.wafDetected || "",
    wafStrength: ai?.security?.wafStrength || "none",
    cdn: ai?.dnsInfo?.cdnDetected || vuln?.serverInfo?.cdn || "",
    ssl: ai?.security?.sslEnabled ?? true,
    securityScore: ai?.security?.securityScore || 0,
    securityHeaders: ai?.security?.securityHeaders || {},
    hsts: ai?.security?.hsts ?? false,
    csp: ai?.security?.csp ?? false,
    xFrameOptions: ai?.security?.xFrameOptions ?? false,
    plugins: ai?.techStack?.plugins || vuln?.cms?.plugins || [],
    theme: ai?.techStack?.theme || vuln?.cms?.themes?.[0] || "",
    writablePaths: [
      ...(ai?.uploadSurface?.writablePaths || []),
      ...(vuln?.writablePaths?.map(w => w.path) || []),
    ].filter((v, i, a) => a.indexOf(v) === i),
    uploadEndpoints: [
      ...(ai?.uploadSurface?.uploadEndpoints || []),
      ...(vuln?.uploadEndpoints?.map(e => e.url) || []),
    ].filter((v, i, a) => a.indexOf(v) === i),
    exposedFiles: ai?.vulnerabilities?.exposedFiles || [],
    knownCVEs: [
      ...(ai?.vulnerabilities?.knownCVEs || []),
      ...(vuln?.misconfigurations?.filter(m => m.severity === "critical" || m.severity === "high").map(m => ({
        cve: m.type || "MISC",
        description: m.detail,
        severity: m.severity,
      })) || []),
    ],
    misconfigurations: [
      ...(ai?.vulnerabilities?.misconfigurations || []),
      ...(vuln?.misconfigurations?.map(m => m.detail) || []),
    ].filter((v, i, a) => a.indexOf(v) === i),
    openPorts: ai?.uploadSurface?.openPorts || [],
    ftpAvailable: ai?.uploadSurface?.ftpAvailable || pre?.ftpAvailable || false,
    sshAvailable: ai?.uploadSurface?.sshAvailable || false,
    webdavAvailable: ai?.uploadSurface?.webdavAvailable || pre?.webdavAvailable || false,
    xmlrpcAvailable: ai?.uploadSurface?.xmlrpcAvailable || false,
    restApiAvailable: ai?.uploadSurface?.restApiAvailable || false,
    fileManagerDetected: ai?.uploadSurface?.fileManagerDetected || false,
    directoryListingPaths: ai?.uploadSurface?.directoryListingPaths || [],
    domainAuthority: ai?.seoMetrics?.domainAuthority || 0,
    httpMethods: vuln?.serverInfo?.httpMethods || [],
    prescreenScore: pre?.overallSuccessProbability || 0,
    prescreenMethods: pre?.methodProbabilities?.map(m => ({
      method: m.method,
      probability: m.probability,
    })) || [],
  };
}

// ═══════════════════════════════════════════════════════
//  STAGE 2: AI VULNERABILITY CLASSIFICATION
// ═══════════════════════════════════════════════════════

async function classifyVulnerabilities(
  data: RawScanData,
  onProgress: DeepVulnProgressCallback,
): Promise<ClassifiedVulnerability[]> {
  const vulns: ClassifiedVulnerability[] = [];

  // First: rule-based classification from known data
  vulns.push(...ruleBasedClassification(data));
  
  onProgress("classify_rules", `📋 Rule-based: พบ ${vulns.length} ช่องโหว่จากกฎ`, 20);

  // Then: LLM-powered deep classification
  try {
    const llmVulns = await llmClassifyVulnerabilities(data);
    
    // Merge LLM findings with rule-based (avoid duplicates)
    for (const lv of llmVulns) {
      const isDuplicate = vulns.some(v => 
        v.name.toLowerCase().includes(lv.name.toLowerCase().split(" ")[0]) ||
        (v.id === lv.id)
      );
      if (!isDuplicate) {
        vulns.push(lv);
      }
    }
    
    onProgress("classify_ai", `🧠 AI เพิ่มอีก ${llmVulns.length} ช่องโหว่จากการวิเคราะห์เชิงลึก`, 28);
  } catch (e: any) {
    onProgress("classify_ai_error", `⚠️ AI classification failed: ${e.message} — ใช้ rule-based เท่านั้น`, 28);
  }

  // Sort by CVSS score descending
  vulns.sort((a, b) => b.cvss - a.cvss);
  
  return vulns;
}

function ruleBasedClassification(data: RawScanData): ClassifiedVulnerability[] {
  const vulns: ClassifiedVulnerability[] = [];
  let id = 1;

  // Writable paths = file upload vulns
  for (const path of data.writablePaths) {
    vulns.push({
      id: `VULN-${id++}`,
      name: `Writable Directory: ${path}`,
      category: "file_upload",
      severity: "high",
      cvss: 7.5,
      description: `พบ directory ที่สามารถเขียนไฟล์ได้: ${path} — สามารถ upload shell ได้โดยตรง`,
      evidence: `HTTP PUT/POST to ${path} returns 2xx`,
      exploitable: true,
      exploitDifficulty: "easy",
      aiConfidence: 85,
      remediation: "ปิด write permission ของ directory นี้",
    });
  }

  // Upload endpoints
  for (const ep of data.uploadEndpoints) {
    vulns.push({
      id: `VULN-${id++}`,
      name: `Upload Endpoint: ${ep}`,
      category: "file_upload",
      severity: "high",
      cvss: 7.0,
      description: `พบ upload endpoint: ${ep} — อาจ bypass file type validation ได้`,
      evidence: `Endpoint responds to multipart/form-data`,
      exploitable: true,
      exploitDifficulty: "moderate",
      aiConfidence: 70,
      remediation: "เพิ่ม file type validation และ content-type checking",
    });
  }

  // Known CVEs
  for (const cve of data.knownCVEs) {
    vulns.push({
      id: `VULN-${id++}`,
      name: `${cve.cve}: ${cve.description}`,
      category: cve.description.toLowerCase().includes("upload") ? "file_upload"
        : cve.description.toLowerCase().includes("rce") ? "rce"
        : cve.description.toLowerCase().includes("sql") ? "sqli"
        : cve.description.toLowerCase().includes("auth") ? "auth_bypass"
        : "misconfiguration",
      severity: cve.severity as any,
      cvss: cve.severity === "critical" ? 9.5 : cve.severity === "high" ? 7.5 : 5.0,
      description: cve.description,
      evidence: `Known CVE: ${cve.cve}`,
      exploitable: true,
      exploitDifficulty: cve.severity === "critical" ? "easy" : "moderate",
      aiConfidence: 90,
      remediation: `อัพเดท component ที่มีช่องโหว่ ${cve.cve}`,
    });
  }

  // Exposed files
  for (const file of data.exposedFiles) {
    vulns.push({
      id: `VULN-${id++}`,
      name: `Exposed File: ${file}`,
      category: file.includes(".env") || file.includes("config") ? "config_exposure" : "info_disclosure",
      severity: file.includes(".env") || file.includes("config") ? "critical" : "medium",
      cvss: file.includes(".env") || file.includes("config") ? 9.0 : 5.0,
      description: `พบไฟล์ sensitive ที่เข้าถึงได้: ${file}`,
      evidence: `HTTP GET /${file} returns 200`,
      exploitable: true,
      exploitDifficulty: "trivial",
      aiConfidence: 95,
      remediation: `ปิดการเข้าถึงไฟล์ ${file} ผ่าน .htaccess หรือ server config`,
    });
  }

  // Outdated PHP
  if (data.php) {
    const major = parseInt(data.php.split(".")[0]);
    const minor = parseInt(data.php.split(".")[1] || "0");
    if (major < 7 || (major === 7 && minor < 4)) {
      vulns.push({
        id: `VULN-${id++}`,
        name: `Outdated PHP: ${data.php}`,
        category: "outdated_software",
        severity: major < 7 ? "critical" : "high",
        cvss: major < 7 ? 9.0 : 7.0,
        description: `PHP ${data.php} มีช่องโหว่ที่ทราบแล้ว — อาจถูก exploit ได้`,
        evidence: `X-Powered-By: PHP/${data.php}`,
        exploitable: true,
        exploitDifficulty: "moderate",
        aiConfidence: 85,
        remediation: `อัพเดท PHP เป็นเวอร์ชัน 8.x`,
      });
    }
  }

  // Weak WAF
  if (!data.waf || data.wafStrength === "none" || data.wafStrength === "weak") {
    vulns.push({
      id: `VULN-${id++}`,
      name: data.waf ? `Weak WAF: ${data.waf}` : "No WAF Detected",
      category: "misconfiguration",
      severity: "medium",
      cvss: 5.0,
      description: data.waf 
        ? `WAF ที่ตรวจพบ (${data.waf}) มีความแข็งแกร่งต่ำ — สามารถ bypass ได้`
        : "ไม่พบ WAF — server ไม่มีการป้องกัน request ที่เป็นอันตราย",
      evidence: data.waf ? `WAF: ${data.waf}, Strength: ${data.wafStrength}` : "No WAF headers detected",
      exploitable: true,
      exploitDifficulty: "easy",
      aiConfidence: 80,
      remediation: "ติดตั้ง WAF หรือเพิ่มความแข็งแกร่งของ WAF ที่มีอยู่",
    });
  }

  // Missing security headers
  if (!data.hsts) {
    vulns.push({
      id: `VULN-${id++}`,
      name: "Missing HSTS Header",
      category: "misconfiguration",
      severity: "low",
      cvss: 3.0,
      description: "ไม่มี Strict-Transport-Security header — เสี่ยงต่อ downgrade attack",
      evidence: "HSTS header not found",
      exploitable: false,
      exploitDifficulty: "hard",
      aiConfidence: 95,
      remediation: "เพิ่ม Strict-Transport-Security header",
    });
  }

  // FTP/SSH/WebDAV available
  if (data.ftpAvailable) {
    vulns.push({
      id: `VULN-${id++}`,
      name: "FTP Service Available",
      category: "file_upload",
      severity: "high",
      cvss: 7.5,
      description: "FTP service เปิดอยู่ — อาจ brute-force credentials หรือใช้ anonymous login ได้",
      evidence: "Port 21 open, FTP banner detected",
      exploitable: true,
      exploitDifficulty: "moderate",
      aiConfidence: 75,
      remediation: "ปิด FTP service หรือจำกัด IP ที่เข้าถึงได้",
    });
  }

  if (data.webdavAvailable) {
    vulns.push({
      id: `VULN-${id++}`,
      name: "WebDAV Enabled",
      category: "file_upload",
      severity: "high",
      cvss: 8.0,
      description: "WebDAV เปิดอยู่ — สามารถ upload ไฟล์ผ่าน PUT method ได้โดยตรง",
      evidence: "PROPFIND/OPTIONS returns WebDAV headers",
      exploitable: true,
      exploitDifficulty: "easy",
      aiConfidence: 85,
      remediation: "ปิด WebDAV หรือจำกัดการเข้าถึง",
    });
  }

  // XMLRPC available (WordPress)
  if (data.xmlrpcAvailable && data.cms.toLowerCase() === "wordpress") {
    vulns.push({
      id: `VULN-${id++}`,
      name: "WordPress XML-RPC Enabled",
      category: "auth_bypass",
      severity: "medium",
      cvss: 6.0,
      description: "XML-RPC เปิดอยู่ — สามารถ brute-force login หรือ DDoS amplification ได้",
      evidence: "POST /xmlrpc.php returns 200",
      exploitable: true,
      exploitDifficulty: "easy",
      aiConfidence: 90,
      remediation: "ปิด XML-RPC หรือจำกัดด้วย .htaccess",
    });
  }

  // Directory listing
  for (const dir of data.directoryListingPaths) {
    vulns.push({
      id: `VULN-${id++}`,
      name: `Directory Listing: ${dir}`,
      category: "info_disclosure",
      severity: "medium",
      cvss: 5.0,
      description: `Directory listing เปิดอยู่ที่ ${dir} — เปิดเผยโครงสร้างไฟล์`,
      evidence: `GET ${dir} returns directory index`,
      exploitable: true,
      exploitDifficulty: "trivial",
      aiConfidence: 95,
      remediation: "ปิด directory listing ใน server config",
    });
  }

  // File manager detected
  if (data.fileManagerDetected) {
    vulns.push({
      id: `VULN-${id++}`,
      name: "File Manager Plugin Detected",
      category: "file_upload",
      severity: "critical",
      cvss: 9.5,
      description: "พบ File Manager plugin — มีประวัติช่องโหว่ RCE ร้ายแรง (CVE-2020-25213)",
      evidence: "File Manager plugin detected in WordPress",
      exploitable: true,
      exploitDifficulty: "easy",
      aiConfidence: 90,
      remediation: "ลบ File Manager plugin ออก",
    });
  }

  return vulns;
}

async function llmClassifyVulnerabilities(data: RawScanData): Promise<ClassifiedVulnerability[]> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert penetration tester. Analyze the following scan data and identify additional vulnerabilities that rule-based scanning might miss. Focus on:
1. Logical vulnerabilities from the combination of technologies
2. Configuration weaknesses that enable attack chains
3. Version-specific exploits based on detected software versions
4. CMS-specific attack vectors based on plugins and themes
5. Network-level vulnerabilities from open ports and services

For each vulnerability, classify it with category, severity, CVSS score, and exploitation difficulty.
Respond in JSON with this schema:
{
  "vulnerabilities": [
    {
      "id": "string",
      "name": "string (Thai)",
      "category": "file_upload|auth_bypass|rce|sqli|xss|ssrf|lfi|config_exposure|misconfiguration|outdated_software|default_creds|info_disclosure",
      "severity": "critical|high|medium|low|info",
      "cvss": number (0-10),
      "description": "string (Thai, detailed)",
      "evidence": "string",
      "exploitable": boolean,
      "exploitDifficulty": "trivial|easy|moderate|hard|very_hard",
      "aiConfidence": number (0-100),
      "remediation": "string (Thai)"
    }
  ]
}
Only include vulnerabilities NOT already covered by: writable paths, upload endpoints, known CVEs, exposed files, outdated PHP, WAF status, security headers, FTP/WebDAV/XMLRPC, directory listing, file manager.`,
      },
      {
        role: "user",
        content: `Scan data for ${data.domain}:
Server: ${data.server} | OS: ${data.os} | PHP: ${data.php}
CMS: ${data.cms} ${data.cmsVersion} | Plugins: ${data.plugins.join(", ") || "none"}
Theme: ${data.theme || "unknown"} | WAF: ${data.waf || "none"} (${data.wafStrength})
CDN: ${data.cdn || "none"} | SSL: ${data.ssl}
Security Score: ${data.securityScore}/100
HTTP Methods: ${data.httpMethods.join(", ") || "unknown"}
Open Ports: ${data.openPorts.map(p => `${p.port}/${p.service}`).join(", ") || "unknown"}
REST API: ${data.restApiAvailable} | XMLRPC: ${data.xmlrpcAvailable}
Writable Paths: ${data.writablePaths.length} | Upload Endpoints: ${data.uploadEndpoints.length}
Misconfigurations: ${data.misconfigurations.join("; ") || "none"}
DA: ${data.domainAuthority}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "vulnerability_classification",
        strict: true,
        schema: {
          type: "object",
          properties: {
            vulnerabilities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  category: { type: "string" },
                  severity: { type: "string" },
                  cvss: { type: "number" },
                  description: { type: "string" },
                  evidence: { type: "string" },
                  exploitable: { type: "boolean" },
                  exploitDifficulty: { type: "string" },
                  aiConfidence: { type: "number" },
                  remediation: { type: "string" },
                },
                required: ["id", "name", "category", "severity", "cvss", "description", "evidence", "exploitable", "exploitDifficulty", "aiConfidence", "remediation"],
                additionalProperties: false,
              },
            },
          },
          required: ["vulnerabilities"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (content && typeof content === "string") {
    const parsed = JSON.parse(content);
    return (parsed.vulnerabilities || []).map((v: any) => ({
      ...v,
      cvss: Math.max(0, Math.min(10, v.cvss || 0)),
      aiConfidence: Math.max(0, Math.min(100, v.aiConfidence || 50)),
    }));
  }
  return [];
}

// ═══════════════════════════════════════════════════════
//  STAGE 3: EXPLOIT CHAIN MAPPING
// ═══════════════════════════════════════════════════════

async function mapExploitChains(
  data: RawScanData,
  vulns: ClassifiedVulnerability[],
  onProgress: DeepVulnProgressCallback,
): Promise<ExploitChain[]> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert penetration tester. Given a target's vulnerability profile, create detailed exploit chains — step-by-step attack paths that chain multiple vulnerabilities together to achieve file upload + redirect injection.

Each chain should be a complete attack path from initial access to final objective (uploading a redirect shell).

For each chain, provide:
1. A descriptive name (Thai)
2. Ordered steps with specific techniques
3. Success probability based on the vulnerabilities
4. Time estimate
5. Required conditions
6. Risk and stealth levels
7. Which vulnerability IDs are exploited

Respond in JSON:
{
  "chains": [
    {
      "id": "string",
      "name": "string (Thai)",
      "steps": [
        {
          "order": number,
          "action": "string (Thai, specific action)",
          "technique": "string (technical technique name)",
          "target": "string (target URL/path)",
          "expectedOutcome": "string (Thai)",
          "fallbackAction": "string (Thai)",
          "detectionRisk": "low|medium|high"
        }
      ],
      "totalSuccessProbability": number (0-100),
      "estimatedTime": "string",
      "requiredConditions": ["string (Thai)"],
      "riskLevel": "low|medium|high|critical",
      "stealthLevel": "loud|moderate|quiet|silent",
      "targetVulnerabilities": ["VULN-1", "VULN-2"]
    }
  ]
}

Create 3-6 chains, sorted by success probability. Each chain must have 3-8 steps.`,
        },
        {
          role: "user",
          content: `Target: ${data.domain}
Server: ${data.server} | CMS: ${data.cms} ${data.cmsVersion}
WAF: ${data.waf || "none"} (${data.wafStrength})

Vulnerabilities found:
${vulns.map(v => `- ${v.id}: ${v.name} [${v.severity}] CVSS:${v.cvss} Exploitable:${v.exploitable} Difficulty:${v.exploitDifficulty}`).join("\n")}

Writable Paths: ${data.writablePaths.join(", ") || "none"}
Upload Endpoints: ${data.uploadEndpoints.join(", ") || "none"}
FTP: ${data.ftpAvailable} | WebDAV: ${data.webdavAvailable} | SSH: ${data.sshAvailable}
HTTP Methods: ${data.httpMethods.join(", ") || "unknown"}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "exploit_chains",
          strict: true,
          schema: {
            type: "object",
            properties: {
              chains: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    steps: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          order: { type: "number" },
                          action: { type: "string" },
                          technique: { type: "string" },
                          target: { type: "string" },
                          expectedOutcome: { type: "string" },
                          fallbackAction: { type: "string" },
                          detectionRisk: { type: "string" },
                        },
                        required: ["order", "action", "technique", "target", "expectedOutcome", "fallbackAction", "detectionRisk"],
                        additionalProperties: false,
                      },
                    },
                    totalSuccessProbability: { type: "number" },
                    estimatedTime: { type: "string" },
                    requiredConditions: { type: "array", items: { type: "string" } },
                    riskLevel: { type: "string" },
                    stealthLevel: { type: "string" },
                    targetVulnerabilities: { type: "array", items: { type: "string" } },
                  },
                  required: ["id", "name", "steps", "totalSuccessProbability", "estimatedTime", "requiredConditions", "riskLevel", "stealthLevel", "targetVulnerabilities"],
                  additionalProperties: false,
                },
              },
            },
            required: ["chains"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      return (parsed.chains || [])
        .map((c: any) => ({
          ...c,
          totalSuccessProbability: Math.max(0, Math.min(100, c.totalSuccessProbability || 0)),
        }))
        .sort((a: ExploitChain, b: ExploitChain) => b.totalSuccessProbability - a.totalSuccessProbability);
    }
  } catch (e: any) {
    onProgress("chains_error", `⚠️ Exploit chain mapping failed: ${e.message}`, 50);
  }

  // Fallback: generate basic chains from vulnerabilities
  return generateBasicChains(data, vulns);
}

function generateBasicChains(data: RawScanData, vulns: ClassifiedVulnerability[]): ExploitChain[] {
  const chains: ExploitChain[] = [];
  
  // Chain 1: Direct upload if writable paths exist
  if (data.writablePaths.length > 0) {
    chains.push({
      id: "chain-direct-upload",
      name: "Direct File Upload ผ่าน Writable Directory",
      steps: [
        { order: 1, action: "สแกน writable directories", technique: "HTTP PUT/POST probe", target: data.writablePaths[0], expectedOutcome: "ยืนยัน directory ที่เขียนได้", fallbackAction: "ลอง directory อื่น", detectionRisk: "low" },
        { order: 2, action: "Upload PHP shell", technique: "Polymorphic shell upload", target: data.writablePaths[0], expectedOutcome: "Shell ถูก upload สำเร็จ", fallbackAction: "ใช้ double extension bypass", detectionRisk: "medium" },
        { order: 3, action: "Verify shell execution", technique: "HTTP GET + response check", target: `${data.writablePaths[0]}shell.php`, expectedOutcome: "Shell ทำงานได้", fallbackAction: "ลอง .htaccess override", detectionRisk: "low" },
        { order: 4, action: "Inject redirect code", technique: "PHP header redirect", target: "Uploaded shell", expectedOutcome: "Redirect ทำงาน", fallbackAction: "ใช้ JS redirect แทน", detectionRisk: "low" },
      ],
      totalSuccessProbability: 65,
      estimatedTime: "1-3 นาที",
      requiredConditions: ["Writable directory ต้องรองรับ PHP execution"],
      riskLevel: "medium",
      stealthLevel: "moderate",
      targetVulnerabilities: vulns.filter(v => v.category === "file_upload").map(v => v.id).slice(0, 3),
    });
  }

  // Chain 2: CMS exploit chain
  if (data.cms.toLowerCase() === "wordpress") {
    chains.push({
      id: "chain-wp-exploit",
      name: "WordPress Plugin Exploitation Chain",
      steps: [
        { order: 1, action: "ตรวจสอบ plugin versions", technique: "WordPress REST API enumeration", target: "/wp-json/wp/v2/plugins", expectedOutcome: "ได้ข้อมูล plugin ที่ vulnerable", fallbackAction: "ใช้ wpscan fingerprinting", detectionRisk: "low" },
        { order: 2, action: "Exploit vulnerable plugin", technique: "Known CVE exploit", target: "Vulnerable plugin endpoint", expectedOutcome: "ได้ authenticated access", fallbackAction: "ลอง plugin อื่น", detectionRisk: "medium" },
        { order: 3, action: "Upload shell ผ่าน media library", technique: "WordPress media upload API", target: "/wp-admin/async-upload.php", expectedOutcome: "Shell ถูก upload", fallbackAction: "ใช้ theme editor", detectionRisk: "high" },
        { order: 4, action: "Inject redirect", technique: ".htaccess modification", target: "/.htaccess", expectedOutcome: "Redirect ทำงาน", fallbackAction: "ใช้ wp_head hook", detectionRisk: "medium" },
      ],
      totalSuccessProbability: 45,
      estimatedTime: "3-8 นาที",
      requiredConditions: ["ต้องมี vulnerable plugin", "Plugin ต้องเปิดใช้งาน"],
      riskLevel: "high",
      stealthLevel: "moderate",
      targetVulnerabilities: vulns.filter(v => v.name.includes("WordPress") || v.name.includes("plugin")).map(v => v.id).slice(0, 3),
    });
  }

  // Chain 3: WebDAV/FTP chain
  if (data.ftpAvailable || data.webdavAvailable) {
    chains.push({
      id: "chain-protocol-upload",
      name: `${data.webdavAvailable ? "WebDAV" : "FTP"} Protocol Upload Chain`,
      steps: [
        { order: 1, action: `เชื่อมต่อ ${data.webdavAvailable ? "WebDAV" : "FTP"}`, technique: data.webdavAvailable ? "PROPFIND/PUT" : "FTP brute-force", target: data.domain, expectedOutcome: "เชื่อมต่อสำเร็จ", fallbackAction: "ลอง anonymous login", detectionRisk: "medium" },
        { order: 2, action: "Upload shell file", technique: data.webdavAvailable ? "WebDAV PUT" : "FTP STOR", target: "/public_html/", expectedOutcome: "Shell ถูก upload", fallbackAction: "ลอง directory อื่น", detectionRisk: "medium" },
        { order: 3, action: "Set file permissions", technique: data.webdavAvailable ? "PROPPATCH" : "FTP CHMOD", target: "Uploaded file", expectedOutcome: "File executable", fallbackAction: "ใช้ .htaccess", detectionRisk: "low" },
        { order: 4, action: "Verify and inject redirect", technique: "HTTP verification + redirect injection", target: "Uploaded shell URL", expectedOutcome: "Redirect ทำงาน", fallbackAction: "ใช้ meta refresh", detectionRisk: "low" },
      ],
      totalSuccessProbability: data.webdavAvailable ? 55 : 35,
      estimatedTime: "2-5 นาที",
      requiredConditions: [data.webdavAvailable ? "WebDAV ต้องอนุญาต PUT" : "FTP credentials ต้องถูกต้อง"],
      riskLevel: "medium",
      stealthLevel: "quiet",
      targetVulnerabilities: vulns.filter(v => v.name.includes("WebDAV") || v.name.includes("FTP")).map(v => v.id),
    });
  }

  chains.sort((a, b) => b.totalSuccessProbability - a.totalSuccessProbability);
  return chains;
}

// ═══════════════════════════════════════════════════════
//  STAGE 4: ATTACK SURFACE SCORING
// ═══════════════════════════════════════════════════════

function calculateAttackSurface(data: RawScanData, vulns: ClassifiedVulnerability[]): AttackSurfaceScore {
  const categories = {
    fileUpload: 0,
    authentication: 0,
    serverConfig: 0,
    applicationLogic: 0,
    networkExposure: 0,
    informationLeakage: 0,
  };

  // File Upload score
  categories.fileUpload = Math.min(100,
    data.writablePaths.length * 20 +
    data.uploadEndpoints.length * 15 +
    (data.webdavAvailable ? 25 : 0) +
    (data.ftpAvailable ? 20 : 0) +
    (data.fileManagerDetected ? 30 : 0)
  );

  // Authentication score
  categories.authentication = Math.min(100,
    (data.xmlrpcAvailable ? 25 : 0) +
    (data.restApiAvailable ? 15 : 0) +
    vulns.filter(v => v.category === "auth_bypass").length * 30 +
    vulns.filter(v => v.category === "default_creds").length * 25
  );

  // Server Config score
  categories.serverConfig = Math.min(100,
    (data.wafStrength === "none" ? 30 : data.wafStrength === "weak" ? 20 : 5) +
    (!data.hsts ? 10 : 0) +
    (!data.csp ? 10 : 0) +
    (!data.xFrameOptions ? 10 : 0) +
    (100 - data.securityScore) * 0.3 +
    data.misconfigurations.length * 10
  );

  // Application Logic score
  categories.applicationLogic = Math.min(100,
    vulns.filter(v => ["rce", "sqli", "xss", "ssrf", "lfi"].includes(v.category)).length * 25 +
    data.knownCVEs.filter(c => c.severity === "critical").length * 20
  );

  // Network Exposure score
  categories.networkExposure = Math.min(100,
    data.openPorts.length * 10 +
    (data.ftpAvailable ? 20 : 0) +
    (data.sshAvailable ? 15 : 0) +
    (data.webdavAvailable ? 20 : 0) +
    (!data.cdn ? 15 : 0)
  );

  // Information Leakage score
  categories.informationLeakage = Math.min(100,
    data.exposedFiles.length * 15 +
    data.directoryListingPaths.length * 10 +
    (data.php ? 10 : 0) + // PHP version exposed
    vulns.filter(v => v.category === "info_disclosure" || v.category === "config_exposure").length * 20
  );

  // Overall score (weighted average)
  const weights = {
    fileUpload: 0.30,
    authentication: 0.15,
    serverConfig: 0.20,
    applicationLogic: 0.15,
    networkExposure: 0.10,
    informationLeakage: 0.10,
  };

  const overall = Math.round(
    categories.fileUpload * weights.fileUpload +
    categories.authentication * weights.authentication +
    categories.serverConfig * weights.serverConfig +
    categories.applicationLogic * weights.applicationLogic +
    categories.networkExposure * weights.networkExposure +
    categories.informationLeakage * weights.informationLeakage
  );

  // Find weakest point and strongest defense
  const categoryNames: Record<string, string> = {
    fileUpload: "File Upload",
    authentication: "Authentication",
    serverConfig: "Server Configuration",
    applicationLogic: "Application Logic",
    networkExposure: "Network Exposure",
    informationLeakage: "Information Leakage",
  };

  const entries = Object.entries(categories) as [keyof typeof categories, number][];
  const weakest = entries.reduce((a, b) => a[1] > b[1] ? a : b);
  const strongest = entries.reduce((a, b) => a[1] < b[1] ? a : b);

  return {
    overall,
    categories,
    weakestPoint: categoryNames[weakest[0]] || weakest[0],
    strongestDefense: categoryNames[strongest[0]] || strongest[0],
  };
}

// ═══════════════════════════════════════════════════════
//  STAGE 5: METHOD-VULNERABILITY MAPPING
// ═══════════════════════════════════════════════════════

function mapMethodsToVulns(
  vulns: ClassifiedVulnerability[],
  chains: ExploitChain[],
  data: RawScanData,
): MethodVulnMapping[] {
  const mappings: MethodVulnMapping[] = [];

  // Map common attack methods to vulnerabilities
  const methodMap: Record<string, { vulnCategories: string[]; baseProb: number }> = {
    "Direct PUT Upload": { vulnCategories: ["file_upload"], baseProb: 60 },
    "Multipart Form Upload": { vulnCategories: ["file_upload"], baseProb: 50 },
    "WebDAV PUT": { vulnCategories: ["file_upload"], baseProb: 55 },
    "FTP Upload": { vulnCategories: ["file_upload"], baseProb: 40 },
    "WordPress Plugin Exploit": { vulnCategories: ["rce", "file_upload", "auth_bypass"], baseProb: 45 },
    "WordPress Theme Editor": { vulnCategories: ["auth_bypass", "file_upload"], baseProb: 35 },
    "WordPress XML-RPC Brute Force": { vulnCategories: ["auth_bypass"], baseProb: 25 },
    "WordPress REST API": { vulnCategories: ["auth_bypass", "file_upload"], baseProb: 30 },
    ".htaccess Override": { vulnCategories: ["misconfiguration", "file_upload"], baseProb: 40 },
    "PHP Double Extension": { vulnCategories: ["file_upload", "misconfiguration"], baseProb: 35 },
    "Image Steganography": { vulnCategories: ["file_upload"], baseProb: 30 },
    "Config File Exploitation": { vulnCategories: ["config_exposure"], baseProb: 50 },
    "SQL Injection → File Write": { vulnCategories: ["sqli"], baseProb: 35 },
    "LFI → Log Poisoning": { vulnCategories: ["lfi"], baseProb: 25 },
    "SSRF → Internal Upload": { vulnCategories: ["ssrf"], baseProb: 20 },
    "WAF Bypass + Upload": { vulnCategories: ["misconfiguration", "file_upload"], baseProb: 30 },
  };

  for (const [method, config] of Object.entries(methodMap)) {
    const matchingVulns = vulns.filter(v => 
      config.vulnCategories.includes(v.category) && v.exploitable
    );
    
    if (matchingVulns.length > 0) {
      // Adjust probability based on matching vulnerabilities
      const maxCvss = Math.max(...matchingVulns.map(v => v.cvss));
      const adjustedProb = Math.min(95, config.baseProb + (maxCvss * 3));
      
      mappings.push({
        method,
        exploitsVulnerabilities: matchingVulns.map(v => v.id),
        successProbability: Math.round(adjustedProb),
        reasoning: `ใช้ ${method} เพื่อ exploit ${matchingVulns.length} ช่องโหว่ (CVSS สูงสุด: ${maxCvss})`,
      });
    }
  }

  // Sort by success probability
  mappings.sort((a, b) => b.successProbability - a.successProbability);
  return mappings;
}

// ═══════════════════════════════════════════════════════
//  STAGE 6: AI DECISION GATE
// ═══════════════════════════════════════════════════════

async function makeAttackDecision(
  data: RawScanData,
  vulns: ClassifiedVulnerability[],
  chains: ExploitChain[],
  surface: AttackSurfaceScore,
  onProgress: DeepVulnProgressCallback,
): Promise<AttackDecision> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a senior penetration testing lead making a go/no-go decision for an attack engagement. Based on the vulnerability assessment, exploit chains, and attack surface analysis, provide a structured decision.

Consider:
1. Are there enough exploitable vulnerabilities?
2. Is the attack surface wide enough for success?
3. What is the detection risk?
4. What is the best approach given the findings?
5. Are there critical warnings?

Respond in JSON:
{
  "proceed": boolean,
  "confidence": number (0-100),
  "reasoning": "string (Thai, 3-5 sentences explaining the decision)",
  "riskAssessment": "string (Thai, 2-3 sentences about risks)",
  "estimatedSuccessRate": number (0-100),
  "estimatedDuration": "string",
  "recommendedApproach": "string (Thai, specific step-by-step approach)",
  "alternativeApproaches": ["string (Thai)"],
  "criticalWarnings": ["string (Thai)"],
  "prerequisites": ["string (Thai)"]
}`,
        },
        {
          role: "user",
          content: `Target: ${data.domain}
Attack Surface Score: ${surface.overall}/100
Weakest Point: ${surface.weakestPoint}
Strongest Defense: ${surface.strongestDefense}

Vulnerabilities: ${vulns.length} total
- Critical: ${vulns.filter(v => v.severity === "critical").length}
- High: ${vulns.filter(v => v.severity === "high").length}
- Exploitable: ${vulns.filter(v => v.exploitable).length}

Top Exploit Chains:
${chains.slice(0, 3).map(c => `- ${c.name}: ${c.totalSuccessProbability}% success, ${c.steps.length} steps`).join("\n")}

WAF: ${data.waf || "none"} (${data.wafStrength})
CMS: ${data.cms} ${data.cmsVersion}
Writable Paths: ${data.writablePaths.length}
Upload Endpoints: ${data.uploadEndpoints.length}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "attack_decision",
          strict: true,
          schema: {
            type: "object",
            properties: {
              proceed: { type: "boolean" },
              confidence: { type: "number" },
              reasoning: { type: "string" },
              riskAssessment: { type: "string" },
              estimatedSuccessRate: { type: "number" },
              estimatedDuration: { type: "string" },
              recommendedApproach: { type: "string" },
              alternativeApproaches: { type: "array", items: { type: "string" } },
              criticalWarnings: { type: "array", items: { type: "string" } },
              prerequisites: { type: "array", items: { type: "string" } },
            },
            required: ["proceed", "confidence", "reasoning", "riskAssessment", "estimatedSuccessRate", "estimatedDuration", "recommendedApproach", "alternativeApproaches", "criticalWarnings", "prerequisites"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      return {
        proceed: parsed.proceed ?? true,
        confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
        reasoning: parsed.reasoning || "",
        riskAssessment: parsed.riskAssessment || "",
        estimatedSuccessRate: Math.max(0, Math.min(100, parsed.estimatedSuccessRate || 0)),
        estimatedDuration: parsed.estimatedDuration || "Unknown",
        recommendedApproach: parsed.recommendedApproach || "",
        alternativeApproaches: parsed.alternativeApproaches || [],
        criticalWarnings: parsed.criticalWarnings || [],
        prerequisites: parsed.prerequisites || [],
      };
    }
  } catch (e: any) {
    onProgress("decision_error", `⚠️ AI decision failed: ${e.message} — using rule-based decision`, 88);
  }

  // Fallback: rule-based decision
  const exploitableVulns = vulns.filter(v => v.exploitable);
  const criticalVulns = vulns.filter(v => v.severity === "critical" && v.exploitable);
  const bestChain = chains[0];
  
  return {
    proceed: exploitableVulns.length > 0 || data.writablePaths.length > 0,
    confidence: Math.min(90, exploitableVulns.length * 15 + data.writablePaths.length * 20),
    reasoning: `พบ ${exploitableVulns.length} ช่องโหว่ที่ exploit ได้ (${criticalVulns.length} critical), ${data.writablePaths.length} writable paths, Attack Surface Score ${surface.overall}/100`,
    riskAssessment: data.waf ? `มี WAF (${data.waf}) ที่ต้อง bypass — ความเสี่ยงถูกตรวจจับ: ปานกลาง` : "ไม่มี WAF — ความเสี่ยงถูกตรวจจับ: ต่ำ",
    estimatedSuccessRate: bestChain?.totalSuccessProbability || data.prescreenScore || 30,
    estimatedDuration: bestChain?.estimatedTime || "3-10 นาที",
    recommendedApproach: bestChain?.name || "Direct upload ผ่าน writable directory",
    alternativeApproaches: chains.slice(1, 3).map(c => c.name),
    criticalWarnings: data.waf ? [`WAF detected: ${data.waf} — ต้อง bypass ก่อน`] : [],
    prerequisites: [],
  };
}

// ═══════════════════════════════════════════════════════
//  GENERATE NARRATIVE
// ═══════════════════════════════════════════════════════

function generateNarrative(
  domain: string,
  vulns: ClassifiedVulnerability[],
  chains: ExploitChain[],
  surface: AttackSurfaceScore,
  decision: AttackDecision,
): string {
  const critical = vulns.filter(v => v.severity === "critical");
  const high = vulns.filter(v => v.severity === "high");
  const exploitable = vulns.filter(v => v.exploitable);

  let narrative = `## 🔬 Deep Vulnerability Analysis — ${domain}\n\n`;
  narrative += `พบ **${vulns.length} ช่องโหว่** (${critical.length} critical, ${high.length} high) จากการวิเคราะห์เชิงลึก `;
  narrative += `โดย ${exploitable.length} ช่องโหว่สามารถ exploit ได้จริง\n\n`;
  narrative += `**Attack Surface Score:** ${surface.overall}/100 — จุดอ่อนที่สุด: ${surface.weakestPoint}\n\n`;
  
  if (chains.length > 0) {
    narrative += `**Exploit Chains:** ${chains.length} เส้นทางการโจมตี — `;
    narrative += `เส้นทางที่ดีที่สุด: "${chains[0].name}" (${chains[0].totalSuccessProbability}% success)\n\n`;
  }

  narrative += `**การตัดสินใจ:** ${decision.proceed ? "✅ ดำเนินการ" : "❌ ไม่แนะนำ"} `;
  narrative += `(ความมั่นใจ ${decision.confidence}%, โอกาสสำเร็จ ${decision.estimatedSuccessRate}%)\n\n`;
  narrative += decision.reasoning;

  return narrative;
}
