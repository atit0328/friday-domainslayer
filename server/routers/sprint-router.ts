/**
 * 7-Day Sprint Router
 * tRPC endpoints for the Rapid Ranking Engine
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  initializeSprint,
  executeSprintDay,
  runNextSprintDay,
  quickStartSprint,
  orchestratorTick,
  getActiveSprints,
  getSprintState,
  getSprintSummary,
  type SprintConfig,
} from "../seven-day-sprint";
import {
  rapidIndexUrl,
  rapidIndexBulk,
} from "../rapid-indexing-engine";
import {
  findLowCompetitionKeywords,
  clusterKeywords,
  generateVelocityPlan,
  calculatePlanTotals,
} from "../keyword-sniper-engine";

export const sprintRouter = router({
  /** Initialize a new 7-day sprint */
  initSprint: protectedProcedure
    .input(z.object({
      domain: z.string(),
      targetUrl: z.string(),
      niche: z.string(),
      seedKeywords: z.array(z.string()),
      language: z.string().default("th"),
      aggressiveness: z.enum(["extreme", "aggressive", "moderate"]).default("aggressive"),
      maxKeywords: z.number().default(10),
      telegraphPerKeyword: z.number().default(10),
      enableEntityStack: z.boolean().default(true),
      enableBacklinks: z.boolean().default(true),
      enableParasite: z.boolean().default(true),
      enableRankTracking: z.boolean().default(true),
      telegramNotify: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const state = await initializeSprint(input as SprintConfig);
      return {
        success: true,
        sprintId: state.id,
        keywords: state.keywords.length,
        clusters: state.clusters.length,
        velocityPlan: calculatePlanTotals(state.velocityPlan),
      };
    }),

  /** Quick start: init + run Day 1 */
  quickStart: protectedProcedure
    .input(z.object({
      domain: z.string(),
      targetUrl: z.string(),
      niche: z.string(),
      seedKeywords: z.array(z.string()),
      language: z.string().default("th"),
      aggressiveness: z.enum(["extreme", "aggressive", "moderate"]).default("aggressive"),
    }))
    .mutation(async ({ input }) => {
      const config: SprintConfig = {
        ...input,
        maxKeywords: 10,
        telegraphPerKeyword: 10,
        enableEntityStack: true,
        enableBacklinks: true,
        enableParasite: true,
        enableRankTracking: true,
        telegramNotify: true,
      };
      const { state, day1Report } = await quickStartSprint(config);
      return {
        success: true,
        sprintId: state.id,
        keywords: state.keywords.length,
        day1: day1Report,
      };
    }),

  /** Execute a specific day */
  executeDay: protectedProcedure
    .input(z.object({
      sprintId: z.string(),
      day: z.number().min(1).max(7).optional(),
    }))
    .mutation(async ({ input }) => {
      const report = await executeSprintDay(input.sprintId, input.day);
      return { success: true, report };
    }),

  /** Run next day for a sprint */
  runNextDay: protectedProcedure
    .input(z.object({ sprintId: z.string() }))
    .mutation(async ({ input }) => {
      const report = await runNextSprintDay(input.sprintId);
      return { success: !!report, report };
    }),

  /** Get all active sprints */
  getActive: protectedProcedure
    .query(() => {
      const sprints = getActiveSprints();
      return sprints.map(s => ({
        id: s.id,
        domain: s.config.domain,
        status: s.status,
        currentDay: s.currentDay,
        keywords: s.keywords.length,
        totalContent: s.totalContentDeployed,
        totalLinks: s.totalLinksBuilt,
        firstPageKeywords: s.firstPageKeywords,
        bestRank: s.bestRankAchieved,
        startedAt: s.startedAt,
      }));
    }),

  /** Get sprint details */
  getDetail: protectedProcedure
    .input(z.object({ sprintId: z.string() }))
    .query(({ input }) => {
      const state = getSprintState(input.sprintId);
      if (!state) return null;
      return {
        ...state,
        velocityTotals: calculatePlanTotals(state.velocityPlan),
      };
    }),

  /** Get summary across all sprints */
  getSummary: protectedProcedure
    .query(() => getSprintSummary()),

  /** Rapid index a URL */
  rapidIndex: protectedProcedure
    .input(z.object({
      url: z.string(),
      domain: z.string(),
      keywords: z.array(z.string()).optional(),
      priority: z.enum(["critical", "high", "normal", "low"]).default("high"),
    }))
    .mutation(async ({ input }) => {
      const results = await rapidIndexUrl(input);
      return {
        success: results.filter(r => r.success).length,
        total: results.length,
        results,
      };
    }),

  /** Find low-competition keywords */
  findKeywords: protectedProcedure
    .input(z.object({
      domain: z.string(),
      niche: z.string(),
      seedKeywords: z.array(z.string()),
      language: z.string().default("th"),
      maxResults: z.number().default(50),
    }))
    .mutation(async ({ input }) => {
      const keywords = await findLowCompetitionKeywords(
        input.domain, input.niche, input.seedKeywords, input.language, input.maxResults
      );
      return { keywords, count: keywords.length };
    }),

  /** Generate velocity plan preview */
  previewVelocity: protectedProcedure
    .input(z.object({
      keyword: z.string(),
      difficulty: z.number().default(30),
      aggressiveness: z.enum(["extreme", "aggressive", "moderate"]).default("aggressive"),
    }))
    .query(({ input }) => {
      const plan = generateVelocityPlan(input.keyword, input.difficulty, input.aggressiveness);
      return {
        plan,
        totals: calculatePlanTotals(plan),
      };
    }),

  /** Orchestrator tick — advance all active sprints */
  tick: protectedProcedure
    .mutation(async () => {
      const result = await orchestratorTick();
      return result;
    }),
});
