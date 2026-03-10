/**
 * Background Daemon & Orchestrator tRPC Router
 *
 * Provides endpoints for:
 *   - Daemon status, task queue management
 *   - Orchestrator control (start/stop/configure agents)
 *   - Research engine trigger and results
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  enqueueTask,
  cancelTask,
  getDaemonStats,
  listTasks,
  getTaskById,
  type TaskType,
} from "../background-daemon";
import {
  getOrchestratorStatus,
  startOrchestrator,
  stopOrchestrator,
  updateAgentConfig,
  triggerAgentNow,
  resetAgentFailures,
} from "../agentic-auto-orchestrator";
import {
  runResearchCycle,
  type ResearchTarget,
} from "../autonomous-research-engine";

export const daemonRouter = router({
  // ═══════════════════════════════════════════════
  //  DAEMON ENDPOINTS
  // ═══════════════════════════════════════════════

  /** Get daemon stats (running tasks, queue size, etc.) */
  getDaemonStats: protectedProcedure.query(async () => {
    return await getDaemonStats();
  }),

  /** Get recent tasks with optional filter */
  getRecentTasks: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      status: z.enum(["queued", "running", "completed", "failed", "cancelled"]).optional(),
      taskType: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await listTasks({
        limit: input?.limit || 50,
        status: input?.status,
        taskType: input?.taskType as TaskType | undefined,
      });
    }),

  /** Get a specific task by ID */
  getTask: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      return await getTaskById(input.taskId);
    }),

  /** Enqueue a new task manually */
  enqueueTask: protectedProcedure
    .input(z.object({
      taskType: z.enum([
        "attack_session", "seo_daily", "vuln_scan",
        "research_cycle", "learning_cycle", "cve_update",
        "one_click_deploy", "autonomous_deploy", "custom",
      ]),
      title: z.string(),
      description: z.string().optional(),
      priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
      targetDomain: z.string().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const taskId = await enqueueTask({
        taskType: input.taskType as TaskType,
        subsystem: "manual",
        title: input.title,
        description: input.description,
        priority: input.priority,
        targetDomain: input.targetDomain,
        config: input.config,
      });
      return { taskId, message: `Task #${taskId} enqueued` };
    }),

  /** Cancel a task */
  cancelTask: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ input }) => {
      await cancelTask(input.taskId);
      return { success: true, message: `Task #${input.taskId} cancelled` };
    }),

  /** Retry a failed task — re-enqueue with same config */
  retryTask: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ input }) => {
      const task = await getTaskById(input.taskId);
      if (!task) throw new Error(`Task #${input.taskId} not found`);
      const newTaskId = await enqueueTask({
        taskType: task.taskType as TaskType,
        subsystem: task.subsystem || "retry",
        title: `Retry: ${task.title}`,
        description: task.description || undefined,
        targetDomain: task.targetDomain || undefined,
        config: (task.config as Record<string, unknown>) || undefined,
        priority: (task.priority as any) || "medium",
      });
      return { newTaskId, message: `Task #${input.taskId} retried as #${newTaskId}` };
    }),

  // ═══════════════════════════════════════════════
  //  ORCHESTRATOR ENDPOINTS
  // ═══════════════════════════════════════════════

  /** Get orchestrator status with all agent details */
  getOrchestratorStatus: protectedProcedure.query(async () => {
    return getOrchestratorStatus();
  }),

  /** Start the orchestrator */
  startOrchestrator: protectedProcedure.mutation(async () => {
    startOrchestrator();
    return { success: true, message: "Orchestrator started" };
  }),

  /** Stop the orchestrator */
  stopOrchestrator: protectedProcedure.mutation(async () => {
    stopOrchestrator();
    return { success: true, message: "Orchestrator stopped" };
  }),

  /** Update an agent's configuration */
  updateAgent: protectedProcedure
    .input(z.object({
      agentName: z.string(),
      enabled: z.boolean().optional(),
      intervalMs: z.number().min(60000).optional(),
    }))
    .mutation(async ({ input }) => {
      const updates: Record<string, unknown> = {};
      if (input.enabled !== undefined) updates.enabled = input.enabled;
      if (input.intervalMs !== undefined) updates.intervalMs = input.intervalMs;
      updateAgentConfig(input.agentName, updates as any);
      return { success: true, message: `Agent '${input.agentName}' updated` };
    }),

  /** Trigger an agent immediately */
  triggerAgent: protectedProcedure
    .input(z.object({ agentName: z.string() }))
    .mutation(async ({ input }) => {
      triggerAgentNow(input.agentName);
      return { success: true, message: `Agent '${input.agentName}' triggered` };
    }),

  /** Reset agent failure count */
  resetAgentFailures: protectedProcedure
    .input(z.object({ agentName: z.string() }))
    .mutation(async ({ input }) => {
      resetAgentFailures(input.agentName);
      return { success: true, message: `Agent '${input.agentName}' failures reset` };
    }),

  // ═══════════════════════════════════════════════
  //  RESEARCH ENDPOINTS
  // ═══════════════════════════════════════════════

  /** Trigger a research cycle for a specific target */
  triggerResearch: protectedProcedure
    .input(z.object({
      domain: z.string(),
      cms: z.string().optional(),
      cmsVersion: z.string().optional(),
      serverType: z.string().optional(),
      phpVersion: z.string().optional(),
      waf: z.string().optional(),
      plugins: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const target: ResearchTarget = {
        domain: input.domain,
        cms: input.cms || null,
        cmsVersion: input.cmsVersion || null,
        serverType: input.serverType || null,
        phpVersion: input.phpVersion || null,
        waf: input.waf || null,
        plugins: input.plugins || [],
      };

      // Enqueue as background task
      const taskId = await enqueueTask({
        taskType: "research_cycle",
        subsystem: "manual_research",
        title: `Research: ${input.domain}`,
        description: `AI research cycle for ${input.domain} (${input.cms || "unknown"} CMS)`,
        priority: "high",
        targetDomain: input.domain,
        config: target as any,
      });

      return { taskId, message: `Research task #${taskId} enqueued for ${input.domain}` };
    }),
});
