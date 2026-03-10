/**
 * Gambling AI Brain Router — tRPC endpoints for the autonomous gambling SEO brain
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  runBrainCycle,
  getBrainState,
  stopBrain,
  startContinuousMode,
  stopContinuousMode,
  isContinuousModeRunning,
  type GamblingBrainConfig,
} from "../gambling-ai-brain";
import {
  getAllGamblingKeywords,
  getGamblingCategories,
  getGamblingKeywordsByCategory,
  scoreKeywords,
  expandKeywords,
  discoverKeywordsFromSerp,
  seedGamblingKeywords,
  getGamblingKeywordStats,
  runFullIntelligenceCycle,
} from "../gambling-keyword-intel";
import {
  getSmartDiscoveryStats,
  analyzeCompetitorTargets,
} from "../smart-target-discovery";

export const gamblingBrainRouter = router({
  // ═══ BRAIN STATE ═══
  getState: protectedProcedure.query(async () => {
    return getBrainState();
  }),

  // ═══ RUN SINGLE CYCLE ═══
  runCycle: protectedProcedure
    .input(z.object({
      maxKeywordsPerCycle: z.number().min(1).max(100).default(20),
      expandKeywords: z.boolean().default(true),
      maxDorksPerCycle: z.number().min(1).max(20).default(8),
      maxTargetsPerCycle: z.number().min(1).max(100).default(30),
      maxAttacksPerCycle: z.number().min(0).max(20).default(5),
      attackMode: z.enum(["full_auto", "discovery_and_attack", "discovery_only"]).default("full_auto"),
      targetCms: z.array(z.string()).default(["wordpress"]),
      competitorDomains: z.array(z.string()).default([]),
      delayBetweenAttacks: z.number().min(5000).max(300000).default(30000),
    }).partial())
    .mutation(async ({ input }) => {
      const state = getBrainState();
      if (state.isRunning) {
        return { started: false, error: "Brain is already running a cycle" };
      }
      
      // Run in background (don't await)
      runBrainCycle(input as Partial<GamblingBrainConfig>).catch(e => {
        console.error("[GamblingBrain Router] Cycle error:", e);
      });
      
      return { started: true, cycleId: getBrainState().currentCycleId };
    }),

  // ═══ STOP BRAIN ═══
  stop: protectedProcedure.mutation(async () => {
    stopBrain();
    return { stopped: true };
  }),

  // ═══ CONTINUOUS MODE ═══
  startContinuous: protectedProcedure
    .input(z.object({
      intervalMinutes: z.number().min(15).max(1440).default(60),
      maxAttacksPerCycle: z.number().min(0).max(20).default(5),
      attackMode: z.enum(["full_auto", "discovery_and_attack", "discovery_only"]).default("full_auto"),
      competitorDomains: z.array(z.string()).default([]),
    }).partial())
    .mutation(async ({ input }) => {
      if (isContinuousModeRunning()) {
        return { started: false, error: "Continuous mode is already running" };
      }
      
      const intervalMs = (input?.intervalMinutes || 60) * 60 * 1000;
      await startContinuousMode(input as Partial<GamblingBrainConfig>, intervalMs);
      return { started: true, intervalMinutes: input?.intervalMinutes || 60 };
    }),

  stopContinuous: protectedProcedure.mutation(async () => {
    stopContinuousMode();
    return { stopped: true };
  }),

  isContinuousRunning: protectedProcedure.query(async () => {
    return { running: isContinuousModeRunning() };
  }),

  // ═══ KEYWORD INTELLIGENCE ═══
  getKeywords: protectedProcedure.query(async () => {
    const categories = getGamblingCategories();
    const keywordsByCategory: Record<string, string[]> = {};
    for (const cat of categories) {
      keywordsByCategory[cat] = getGamblingKeywordsByCategory(cat);
    }
    return {
      total: getAllGamblingKeywords().length,
      categories,
      keywordsByCategory,
    };
  }),

  scoreKeywords: protectedProcedure
    .input(z.object({
      keywords: z.array(z.string()).min(1).max(50),
    }))
    .mutation(async ({ input }) => {
      return await scoreKeywords(input.keywords);
    }),

  expandKeywords: protectedProcedure
    .input(z.object({
      seedKeywords: z.array(z.string()).min(1).max(10),
      maxNew: z.number().min(5).max(100).default(30),
    }))
    .mutation(async ({ input }) => {
      return await expandKeywords(input.seedKeywords, input.maxNew);
    }),

  discoverFromSerp: protectedProcedure
    .input(z.object({
      keyword: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      return await discoverKeywordsFromSerp(input.keyword);
    }),

  seedKeywords: protectedProcedure.mutation(async () => {
    return await seedGamblingKeywords();
  }),

  getKeywordStats: protectedProcedure.query(async () => {
    return await getGamblingKeywordStats();
  }),

  runIntelligenceCycle: protectedProcedure.mutation(async () => {
    return await runFullIntelligenceCycle();
  }),

  // ═══ DISCOVERY STATS ═══
  getDiscoveryStats: protectedProcedure.query(async () => {
    return await getSmartDiscoveryStats();
  }),

  // ═══ COMPETITOR ANALYSIS ═══
  analyzeCompetitor: protectedProcedure
    .input(z.object({
      domain: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      return await analyzeCompetitorTargets(input.domain);
    }),
});
