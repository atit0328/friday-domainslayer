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

  // ─── Get Subsystem Detail ───
  getSubsystemDetail: adminProcedure
    .input(z.object({
      subsystem: z.enum(["seo", "attack", "pbn", "discovery", "rank", "autobid"]),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Get recent tasks for this subsystem
      const recentTasks = await db.select()
        .from(aiTaskQueue)
        .where(eq(aiTaskQueue.subsystem, input.subsystem))
        .orderBy(desc(aiTaskQueue.createdAt))
        .limit(20);

      // Get recent decisions for this subsystem
      const recentDecisions = await db.select()
        .from(aiDecisions)
        .where(eq(aiDecisions.subsystem, input.subsystem))
        .orderBy(desc(aiDecisions.createdAt))
        .limit(10);

      // Task stats for this subsystem
      const [totalTasks] = await db.select({ count: count() }).from(aiTaskQueue)
        .where(eq(aiTaskQueue.subsystem, input.subsystem));
      const [completedTasks] = await db.select({ count: count() }).from(aiTaskQueue)
        .where(and(eq(aiTaskQueue.subsystem, input.subsystem), eq(aiTaskQueue.status, "completed")));
      const [failedTasks] = await db.select({ count: count() }).from(aiTaskQueue)
        .where(and(eq(aiTaskQueue.subsystem, input.subsystem), eq(aiTaskQueue.status, "failed")));
      const [todayTasks] = await db.select({ count: count() }).from(aiTaskQueue)
        .where(and(eq(aiTaskQueue.subsystem, input.subsystem), gte(aiTaskQueue.createdAt, todayStart)));

      // Subsystem-specific data
      let specificData: Record<string, any> = {};

      switch (input.subsystem) {
        case "seo": {
          const { seoProjects, seoContent, seoActions, rankTracking, backlinkLog } = await import("../../drizzle/schema");
          const projects = await db.select().from(seoProjects).orderBy(desc(seoProjects.createdAt)).limit(10);
          const recentContent = await db.select().from(seoContent).orderBy(desc(seoContent.createdAt)).limit(10);
          const recentActions = await db.select().from(seoActions).orderBy(desc(seoActions.createdAt)).limit(15);
          const recentBacklinks = await db.select().from(backlinkLog).orderBy(desc(backlinkLog.createdAt)).limit(10);
          const [totalKeywords] = await db.select({ count: count() }).from(rankTracking);
          const [improvedKeywords] = await db.select({ count: count() }).from(rankTracking)
            .where(sql`${rankTracking.position} < ${rankTracking.previousPosition}`);
          specificData = {
            projects: projects.map(p => ({ id: p.id, domain: p.domain, status: p.status, createdAt: p.createdAt })),
            recentContent: recentContent.map(c => ({ id: c.id, title: c.title, type: "content", status: c.publishStatus, createdAt: c.createdAt })),
            recentActions: recentActions.map(a => ({ id: a.id, type: a.actionType, domain: a.title, status: a.status, createdAt: a.createdAt })),
            recentBacklinks: recentBacklinks.map(b => ({ id: b.id, targetUrl: b.targetUrl, anchorText: b.anchorText, status: b.status, createdAt: b.createdAt })),
            totalKeywords: totalKeywords?.count || 0,
            improvedKeywords: improvedKeywords?.count || 0,
          };
          break;
        }
        case "attack": {
          const { deployHistory, autonomousDeploys, aiAttackHistory, scheduledScans } = await import("../../drizzle/schema");
          const recentDeploys = await db.select().from(deployHistory).orderBy(desc(deployHistory.createdAt)).limit(15);
          const [totalDeploys] = await db.select({ count: count() }).from(deployHistory);
          const [successDeploys] = await db.select({ count: count() }).from(deployHistory).where(eq(deployHistory.status, "success"));
          const recentAutoDeploys = await db.select().from(autonomousDeploys).orderBy(desc(autonomousDeploys.createdAt)).limit(10);
          const recentAttackHistory = await db.select().from(aiAttackHistory).orderBy(desc(aiAttackHistory.createdAt)).limit(10);
          const pendingScans = await db.select().from(scheduledScans).where(eq(scheduledScans.enabled, true)).limit(10);
          specificData = {
            recentDeploys: recentDeploys.map(d => ({ id: d.id, domain: d.targetDomain, method: null, status: d.status, createdAt: d.createdAt })),
            totalDeploys: totalDeploys?.count || 0,
            successDeploys: successDeploys?.count || 0,
            successRate: totalDeploys?.count ? Math.round(((successDeploys?.count || 0) / totalDeploys.count) * 100) : 0,
            recentAutoDeploys: recentAutoDeploys.map(a => ({ id: a.id, targetDomain: a.targetDomain, status: a.status, method: a.mode, createdAt: a.createdAt })),
            recentAttackHistory: recentAttackHistory.map(h => ({ id: h.id, targetDomain: h.targetDomain, success: h.success, method: h.method, createdAt: h.createdAt })),
            pendingScans: pendingScans.map(s => ({ id: s.id, domain: s.domain, status: s.enabled ? "active" : "disabled", createdAt: s.createdAt })),
          };
          break;
        }
        case "pbn": {
          const { pbnSites, pbnPosts } = await import("../../drizzle/schema");
          const sites = await db.select().from(pbnSites).orderBy(desc(pbnSites.createdAt)).limit(20);
          const recentPosts = await db.select().from(pbnPosts).orderBy(desc(pbnPosts.createdAt)).limit(15);
          const [totalSites] = await db.select({ count: count() }).from(pbnSites);
          const [activeSites] = await db.select({ count: count() }).from(pbnSites).where(eq(pbnSites.status, "active"));
          const [totalPosts] = await db.select({ count: count() }).from(pbnPosts);
          specificData = {
            sites: sites.map(s => ({ id: s.id, name: s.name, domain: s.url, status: s.status, lastPost: s.lastPost, createdAt: s.createdAt })),
            recentPosts: recentPosts.map(p => ({ id: p.id, title: p.title, siteId: p.siteId, status: p.status, createdAt: p.createdAt })),
            totalSites: totalSites?.count || 0,
            activeSites: activeSites?.count || 0,
            totalPosts: totalPosts?.count || 0,
          };
          break;
        }
        case "discovery": {
          const { pipelineEvents, scanResults, domainScans } = await import("../../drizzle/schema");
          const recentEvents = await db.select().from(pipelineEvents).orderBy(desc(pipelineEvents.createdAt)).limit(15);
          const recentScans = await db.select().from(domainScans).orderBy(desc(domainScans.createdAt)).limit(15);
          const [totalScanned] = await db.select({ count: count() }).from(domainScans);
          const [highScore] = await db.select({ count: count() }).from(domainScans)
            .where(sql`${domainScans.trustScore} >= 70`);
          specificData = {
            recentEvents: recentEvents.map(e => ({ id: e.id, type: e.phase, message: e.detail, createdAt: e.createdAt })),
            recentScans: recentScans.map(s => ({ id: s.id, domain: s.domain, trustScore: s.trustScore, grade: s.grade, status: s.status, createdAt: s.createdAt })),
            totalScanned: totalScanned?.count || 0,
            highScoreTargets: highScore?.count || 0,
          };
          break;
        }
        case "rank": {
          const { rankTracking, seoProjects } = await import("../../drizzle/schema");
          const rankings = await db.select().from(rankTracking).orderBy(desc(rankTracking.trackedAt)).limit(20);
          const [totalTracked] = await db.select({ count: count() }).from(rankTracking);
          const [improved] = await db.select({ count: count() }).from(rankTracking)
            .where(sql`${rankTracking.position} < ${rankTracking.previousPosition}`);
          const [declined] = await db.select({ count: count() }).from(rankTracking)
            .where(sql`${rankTracking.position} > ${rankTracking.previousPosition}`);
          specificData = {
            recentRankings: rankings.map(r => ({ id: r.id, keyword: r.keyword, position: r.position, previousPosition: r.previousPosition, engine: r.searchEngine, checkedAt: r.trackedAt })),
            totalTracked: totalTracked?.count || 0,
            improved: improved?.count || 0,
            declined: declined?.count || 0,
            unchanged: (totalTracked?.count || 0) - (improved?.count || 0) - (declined?.count || 0),
          };
          break;
        }
        case "autobid": {
          const { autobidRules, bidHistory } = await import("../../drizzle/schema");
          const rules = await db.select().from(autobidRules).orderBy(desc(autobidRules.createdAt)).limit(10);
          const recentBids = await db.select().from(bidHistory).orderBy(desc(bidHistory.createdAt)).limit(15);
          const [totalRules] = await db.select({ count: count() }).from(autobidRules);
          const [activeRules] = await db.select({ count: count() }).from(autobidRules).where(eq(autobidRules.status, "active"));
          const [totalBids] = await db.select({ count: count() }).from(bidHistory);
          specificData = {
            rules: rules.map(r => ({ id: r.id, name: r.name, status: r.status, maxBid: r.maxBidPerDomain, totalBudget: r.totalBudget, spent: r.spent, createdAt: r.createdAt })),
            recentBids: recentBids.map(b => ({ id: b.id, domain: b.domain, amount: b.bidAmount, status: b.action, createdAt: b.createdAt })),
            totalRules: totalRules?.count || 0,
            activeRules: activeRules?.count || 0,
            totalBids: totalBids?.count || 0,
          };
          break;
        }
      }

      return {
        subsystem: input.subsystem,
        taskStats: {
          total: totalTasks?.count || 0,
          completed: completedTasks?.count || 0,
          failed: failedTasks?.count || 0,
          today: todayTasks?.count || 0,
          successRate: totalTasks?.count ? Math.round(((completedTasks?.count || 0) / totalTasks.count) * 100) : 0,
        },
        recentTasks,
        recentDecisions,
        specificData,
      };
    }),
});
