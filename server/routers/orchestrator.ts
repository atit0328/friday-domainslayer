/**
 * ═══════════════════════════════════════════════════════════════
 *  ORCHESTRATOR ROUTER — tRPC API for the Master AI Orchestrator
 * ═══════════════════════════════════════════════════════════════
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getOrCreateOrchestratorState,
  runOodaCycle,
  startOrchestrator,
  stopOrchestrator,
  pauseOrchestrator,
  isOrchestratorRunning,
} from "../master-orchestrator";
import { getDb } from "../db";
import {
  aiOrchestratorState,
  aiTaskQueue,
  aiDecisions,
  aiMetrics,
} from "../../drizzle/schema";
import { eq, desc, and, gte, count, sql } from "drizzle-orm";

// Admin-only guard
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "superadmin" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const orchestratorRouter = router({
  // ─── Get Orchestrator State ───
  getState: adminProcedure.query(async () => {
    const state = await getOrCreateOrchestratorState();
    return {
      ...state,
      isRunning: isOrchestratorRunning(),
    };
  }),

  // ─── Start Orchestrator ───
  start: adminProcedure.mutation(async () => {
    await startOrchestrator();
    return { success: true, message: "Orchestrator started" };
  }),

  // ─── Stop Orchestrator ───
  stop: adminProcedure.mutation(async () => {
    await stopOrchestrator();
    return { success: true, message: "Orchestrator stopped" };
  }),

  // ─── Pause Orchestrator ───
  pause: adminProcedure.mutation(async () => {
    await pauseOrchestrator();
    return { success: true, message: "Orchestrator paused" };
  }),

  // ─── Run Single OODA Cycle ───
  runCycle: adminProcedure.mutation(async () => {
    const result = await runOodaCycle();
    return result;
  }),

  // ─── Update Settings ───
  updateSettings: adminProcedure
    .input(z.object({
      cycleIntervalMinutes: z.number().min(5).max(1440).optional(),
      maxConcurrentTasks: z.number().min(1).max(50).optional(),
      maxDailyActions: z.number().min(1).max(10000).optional(),
      aggressiveness: z.enum(["conservative", "moderate", "aggressive", "maximum"]).optional(),
      seoEnabled: z.boolean().optional(),
      attackEnabled: z.boolean().optional(),
      pbnEnabled: z.boolean().optional(),
      discoveryEnabled: z.boolean().optional(),
      rankTrackingEnabled: z.boolean().optional(),
      autobidEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const state = await getOrCreateOrchestratorState();
      const db = (await getDb())!;
      await db.update(aiOrchestratorState)
        .set(input as any)
        .where(eq(aiOrchestratorState.id, state.id));
      return { success: true };
    }),

  // ─── Get Recent Decisions ───
  getDecisions: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      cycle: z.number().optional(),
      subsystem: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      let query = db.select().from(aiDecisions).orderBy(desc(aiDecisions.createdAt)).limit(input.limit);
      
      const conditions = [];
      if (input.cycle) conditions.push(eq(aiDecisions.cycle, input.cycle));
      if (input.subsystem) conditions.push(eq(aiDecisions.subsystem, input.subsystem));
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      return query;
    }),

  // ─── Get Task Queue ───
  getTaskQueue: adminProcedure
    .input(z.object({
      status: z.enum(["queued", "running", "completed", "failed", "cancelled"]).optional(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      let query = db.select().from(aiTaskQueue).orderBy(desc(aiTaskQueue.createdAt)).limit(input.limit);
      
      if (input.status) {
        query = query.where(eq(aiTaskQueue.status, input.status)) as any;
      }
      
      return query;
    }),

  // ─── Get Task Stats ───
  getTaskStats: adminProcedure.query(async () => {
    const db = (await getDb())!;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [queued] = await db.select({ count: count() }).from(aiTaskQueue).where(eq(aiTaskQueue.status, "queued"));
    const [running] = await db.select({ count: count() }).from(aiTaskQueue).where(eq(aiTaskQueue.status, "running"));
    const [completedToday] = await db.select({ count: count() }).from(aiTaskQueue)
      .where(and(eq(aiTaskQueue.status, "completed"), gte(aiTaskQueue.completedAt, todayStart)));
    const [failedToday] = await db.select({ count: count() }).from(aiTaskQueue)
      .where(and(eq(aiTaskQueue.status, "failed"), gte(aiTaskQueue.completedAt, todayStart)));
    const [totalCompleted] = await db.select({ count: count() }).from(aiTaskQueue).where(eq(aiTaskQueue.status, "completed"));
    const [totalFailed] = await db.select({ count: count() }).from(aiTaskQueue).where(eq(aiTaskQueue.status, "failed"));

    return {
      queued: queued?.count || 0,
      running: running?.count || 0,
      completedToday: completedToday?.count || 0,
      failedToday: failedToday?.count || 0,
      totalCompleted: totalCompleted?.count || 0,
      totalFailed: totalFailed?.count || 0,
    };
  }),

  // ─── Cancel Task ───
  cancelTask: adminProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(aiTaskQueue)
        .set({ status: "cancelled", completedAt: new Date() })
        .where(eq(aiTaskQueue.id, input.taskId));
      return { success: true };
    }),

  // ─── Get Metrics ───
  getMetrics: adminProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(7),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      
      return db.select()
        .from(aiMetrics)
        .where(gte(aiMetrics.metricDate, since))
        .orderBy(desc(aiMetrics.metricDate))
        .limit(500);
    }),

  // ─── Get World State (latest) ───
  getWorldState: adminProcedure.query(async () => {
    const state = await getOrCreateOrchestratorState();
    return state.aiWorldState;
  }),

  // ─── Get AI Learnings ───
  getLearnings: adminProcedure.query(async () => {
    const state = await getOrCreateOrchestratorState();
    return {
      learnings: state.aiLearnings,
      priorities: state.aiPriorities,
    };
  }),
});
