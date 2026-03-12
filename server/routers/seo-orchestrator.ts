/**
 * ═══════════════════════════════════════════════════════════════
 *  SEO ORCHESTRATOR ROUTER — tRPC procedures for the SEO Brain
 *  
 *  Exposes the autonomous SEO orchestrator to the frontend:
 *  - Create/manage 7-day sprints
 *  - Monitor sprint progress in real-time
 *  - View sprint history and performance
 *  - Control auto-run settings
 *  - Get AI insights and recommendations
 * ═══════════════════════════════════════════════════════════════
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createSprint,
  executeSprintDay,
  getSeoSprintState,
  getActiveSeoSprints,
  pauseSeoSprint,
  resumeSeoSprint,
  orchestratorTick,
  getSeoOrchestratorStatus,
  getSeoSprintByProject,
  sendSprintDailyReport,
  sendAllSprintsProgressReport,
  toggleSprintAutoRenew,
  getSprintRenewalHistory,
  type SeoSprintConfig,
  type SprintState,
  type RenewalRecord,
} from "../seo-orchestrator";
import { getDb } from "../db";
import { seoProjects, seoActions } from "../../drizzle/schema";
import { eq, desc, and, gte, sql, count } from "drizzle-orm";

export const seoOrchestratorRouter = router({
  // ═══ Create a new 7-day sprint ═══
  createSprint: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      aggressiveness: z.number().min(1).max(10).optional().default(7),
      enablePbn: z.boolean().optional().default(true),
      enableExternalBl: z.boolean().optional().default(true),
      maxPbnLinks: z.number().optional().default(30),
      maxExternalLinks: z.number().optional().default(50),
    }))
    .mutation(async ({ input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Get project details
      const [project] = await database.select().from(seoProjects).where(eq(seoProjects.id, input.projectId)).limit(1);
      if (!project) throw new Error("SEO Project not found");

      const keywords = (() => {
        try {
          const raw = project.targetKeywords;
          if (Array.isArray(raw)) return raw as string[];
          if (typeof raw === "string") return JSON.parse(raw) as string[];
          return [];
        } catch { return []; }
      })();

      if (keywords.length === 0) {
        throw new Error("No target keywords found. Please add keywords to the project first.");
      }

      const config: SeoSprintConfig = {
        projectId: input.projectId,
        domain: project.domain,
        targetKeywords: keywords,
        niche: project.niche || "gambling",
        aggressiveness: input.aggressiveness,
        wpUrl: undefined,
        wpUser: project.wpUsername || undefined,
        wpAppPassword: project.wpAppPassword || undefined,
        enablePbn: input.enablePbn,
        enableExternalBl: input.enableExternalBl,
        enableContentGen: true,
        enableRankTracking: true,
        scheduleDays: [0, 1, 2, 3, 4, 5, 6], // All days
        maxPbnLinks: input.maxPbnLinks,
        maxExternalLinks: input.maxExternalLinks,
        autoRenew: true,       // Default: auto-renew enabled
        maxRenewals: 5,        // Default: max 5 rounds
        targetRank: 10,        // Default: target Top 10
      };

      const state = await createSprint(config);
      return {
        sprintId: state.id,
        domain: state.domain,
        status: state.status,
        plan: state.days,
        createdAt: state.createdAt,
      };
    }),

  // ═══ Execute tasks for a specific day ═══
  executeDay: protectedProcedure
    .input(z.object({
      sprintId: z.string(),
      day: z.number().min(1).max(7).optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await executeSprintDay(input.sprintId, input.day);
      return result;
    }),

  // ═══ Get sprint state ═══
  getState: protectedProcedure
    .input(z.object({ sprintId: z.string() }))
    .query(async ({ input }) => {
      const state = getSeoSprintState(input.sprintId);
      if (!state) throw new Error("Sprint not found");
      return {
        id: state.id,
        projectId: state.projectId,
        domain: state.domain,
        status: state.status,
        currentDay: state.currentDay,
        plan: state.days,
        overallProgress: state.overallProgress,
        totalPbnLinks: state.totalPbnLinks,
        totalExternalLinks: state.totalExternalLinks,
        totalContentPieces: state.totalContentPieces,
        bestRankAchieved: state.bestRankAchieved,
        aiInsights: state.aiInsights,
        createdAt: state.createdAt,
        lastActivityAt: state.lastActivityAt,
        sprintRound: state.sprintRound,
        autoRenewEnabled: state.autoRenewEnabled,
        renewalHistory: state.renewalHistory,
        config: {
          aggressiveness: state.config.aggressiveness,
          enablePbn: state.config.enablePbn,
          enableExternalBl: state.config.enableExternalBl,
          maxPbnLinks: state.config.maxPbnLinks,
          maxExternalLinks: state.config.maxExternalLinks,
          targetRank: state.config.targetRank || 10,
          maxRenewals: state.config.maxRenewals || 5,
          autoRenew: state.config.autoRenew ?? true,
        },
      };
    }),

  // ═══ Get all active sprints ═══
  listActive: protectedProcedure
    .query(async () => {
      const sprints = getActiveSeoSprints();
      return sprints.map((s: SprintState) => ({
        id: s.id,
        projectId: s.projectId,
        domain: s.domain,
        status: s.status,
        currentDay: s.currentDay,
        overallProgress: s.overallProgress,
        totalPbnLinks: s.totalPbnLinks,
        totalExternalLinks: s.totalExternalLinks,
        bestRankAchieved: s.bestRankAchieved,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
        sprintRound: s.sprintRound,
        autoRenewEnabled: s.autoRenewEnabled,
      }));
    }),

  // ═══ Pause a sprint ═══
  pause: protectedProcedure
    .input(z.object({ sprintId: z.string() }))
    .mutation(async ({ input }) => {
      const success = pauseSeoSprint(input.sprintId);
      return { success };
    }),

  // ═══ Resume a sprint ═══
  resume: protectedProcedure
    .input(z.object({ sprintId: z.string() }))
    .mutation(async ({ input }) => {
      const success = resumeSeoSprint(input.sprintId);
      return { success };
    }),

  // ═══ Get orchestrator status ═══
  getOrchestratorStatus: protectedProcedure
    .query(async () => {
      return getSeoOrchestratorStatus();
    }),

  // ═══ Toggle auto-run for a project ═══
  toggleAutoRun: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      const nextRun = input.enabled ? new Date(Date.now() + 60000) : null; // Start in 1 minute
      await database.update(seoProjects)
        .set({
          autoRunEnabled: input.enabled,
          nextAutoRunAt: nextRun,
        })
        .where(eq(seoProjects.id, input.projectId));

      return { success: true, autoRunEnabled: input.enabled, nextAutoRunAt: nextRun };
    }),

  // ═══ Get project SEO stats (for orchestrator dashboard) ═══
  getProjectStats: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const database = await getDb();
      if (!database) return null;

      // Get project
      const [project] = await database.select().from(seoProjects).where(eq(seoProjects.id, input.projectId)).limit(1);
      if (!project) return null;

      // Get recent actions count
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [actionCount] = await database
        .select({ count: count() })
        .from(seoActions)
        .where(and(
          eq(seoActions.projectId, input.projectId),
          gte(seoActions.createdAt, sevenDaysAgo),
        ));

      // Get active sprint for this project
      const activeSprints = getActiveSeoSprints();
      const sprint = activeSprints.find((s: SprintState) => s.projectId === input.projectId);

      return {
        project: {
          id: project.id,
          domain: project.domain,
          niche: project.niche,
          autoRunEnabled: project.autoRunEnabled,
          nextAutoRunAt: project.nextAutoRunAt,
          aggressiveness: project.aggressiveness,
        },
        recentActionsCount: actionCount?.count || 0,
        activeSprint: sprint ? {
          id: sprint.id,
          status: sprint.status,
          currentDay: sprint.currentDay,
          overallProgress: sprint.overallProgress,
          bestRankAchieved: sprint.bestRankAchieved,
        } : null,
      };
    }),

  // ═══ Get all projects with orchestrator status ═══
  listProjects: protectedProcedure
    .query(async () => {
      const database = await getDb();
      if (!database) return [];

      const projects = await database.select().from(seoProjects).orderBy(desc(seoProjects.createdAt));
      const activeSprints = getActiveSeoSprints();

      return projects.map(p => {
        const sprint = activeSprints.find((s: SprintState) => s.projectId === p.id);
        const keywords = (() => {
          try {
            const raw = p.targetKeywords;
            if (Array.isArray(raw)) return raw as string[];
            if (typeof raw === "string") return JSON.parse(raw) as string[];
            return [];
          } catch { return []; }
        })();

        return {
          id: p.id,
          domain: p.domain,
          niche: p.niche,
          status: p.status,
          autoRunEnabled: p.autoRunEnabled,
          nextAutoRunAt: p.nextAutoRunAt,
          aggressiveness: p.aggressiveness,
          keywordCount: keywords.length,
          activeSprint: sprint ? {
            id: sprint.id,
            status: sprint.status,
            currentDay: sprint.currentDay,
            overallProgress: sprint.overallProgress,
            bestRankAchieved: sprint.bestRankAchieved,
            totalPbnLinks: sprint.totalPbnLinks,
            totalExternalLinks: sprint.totalExternalLinks,
          } : null,
          createdAt: p.createdAt,
        };
      });
    }),

  // ═══ Manually trigger orchestrator tick ═══
  triggerTick: protectedProcedure
    .mutation(async () => {
      const result = await orchestratorTick();
      return { success: true, ...result };
    }),

  // ═══ Send daily report for a specific sprint ═══
  sendDailyReport: protectedProcedure
    .input(z.object({ sprintId: z.string() }))
    .mutation(async ({ input }) => {
      const report = await sendSprintDailyReport(input.sprintId);
      return { success: true, report };
    }),

  // ═══ Send digest for all active sprints ═══
  sendDigest: protectedProcedure
    .mutation(async () => {
      const result = await sendAllSprintsProgressReport();
      return { success: true, ...result };
    }),

  // ═══ Toggle auto-renew for a sprint ═══
  toggleAutoRenew: protectedProcedure
    .input(z.object({
      sprintId: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const success = toggleSprintAutoRenew(input.sprintId, input.enabled);
      if (!success) throw new Error("Sprint not found");
      return { success, autoRenewEnabled: input.enabled };
    }),

  // ═══ Get renewal history for a sprint ═══
  getRenewalHistory: protectedProcedure
    .input(z.object({ sprintId: z.string() }))
    .query(async ({ input }) => {
      const history = getSprintRenewalHistory(input.sprintId);
      return history;
    }),

  // ═══ Get sprint history (from DB actions) ═══
  getHistory: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      limit: z.number().optional().default(50),
    }))
    .query(async ({ input }) => {
      const database = await getDb();
      if (!database) return [];

      const actions = await database
        .select()
        .from(seoActions)
        .where(eq(seoActions.projectId, input.projectId))
        .orderBy(desc(seoActions.createdAt))
        .limit(input.limit);

      return actions;
    }),
});
