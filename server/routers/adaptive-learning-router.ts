/**
 * Adaptive Learning Router — tRPC endpoints for learning insights, stats, and manual triggers
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAdaptiveLearningStats,
  calculateMethodSuccessRates,
  queryHistoricalPatterns,
  getLearnedInsights,
  getCmsAttackProfile,
  suggestBestStrategy,
  runLearningCycle,
  runEnhancedLearningCycle,
  updateCmsProfiles,
  updateLearnedPatterns,
  getMethodEffectiveness,
  evolveStrategies,
} from "../adaptive-learning";
import { getLearningSchedulerStatus, executeLearningCycle, updateLearningInterval } from "../learning-scheduler";
import { getDb } from "../db";
import { learnedPatterns } from "../../drizzle/schema";
import { eq, desc, sql, and } from "drizzle-orm";

export const adaptiveLearningRouter = router({
  // ═══ Dashboard Stats ═══
  getStats: protectedProcedure.query(async () => {
    return await getAdaptiveLearningStats();
  }),

  // ═══ Method Success Rates ═══
  getMethodRates: protectedProcedure
    .input(z.object({
      cms: z.string().optional(),
      waf: z.string().optional(),
      serverType: z.string().optional(),
      minAttempts: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await calculateMethodSuccessRates(input || {});
    }),

  // ═══ Historical Patterns ═══
  getPatterns: protectedProcedure
    .input(z.object({
      cms: z.string().optional(),
      waf: z.string().optional(),
      serverType: z.string().optional(),
      method: z.string().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await queryHistoricalPatterns(input || {});
    }),

  // ═══ Learned Insights ═══
  getInsights: protectedProcedure
    .input(z.object({
      cms: z.string().optional(),
      waf: z.string().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await getLearnedInsights(input || {});
    }),

  // ═══ CMS Attack Profile ═══
  getCmsProfile: protectedProcedure
    .input(z.object({ cms: z.string() }))
    .query(async ({ input }) => {
      return await getCmsAttackProfile(input.cms);
    }),

  // ═══ AI Strategy Suggestion ═══
  suggestStrategy: protectedProcedure
    .input(z.object({
      domain: z.string(),
      cms: z.string().nullable(),
      cmsVersion: z.string().nullable(),
      serverType: z.string().nullable(),
      wafDetected: z.string().nullable(),
      wafStrength: z.string().nullable(),
      vulnScore: z.number(),
      hasOpenUpload: z.boolean(),
      hasExposedAdmin: z.boolean(),
      hasVulnerableCms: z.boolean(),
      knownCves: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      const ALL_METHODS = [
        "cve_exploit", "wp_brute_force", "cms_plugin_exploit", "file_upload_spray",
        "config_exploit", "xmlrpc_attack", "rest_api_exploit", "ftp_brute",
        "webdav_upload", "htaccess_overwrite", "wp_admin_takeover", "shellless_redirect",
        "ai_generated_exploit", "waf_bypass_upload", "sql_injection", "lfi_rce",
        "ssrf", "deserialization",
      ];
      return await suggestBestStrategy(input, ALL_METHODS);
    }),

  // ═══ Manual Learning Cycle Trigger ═══
  runLearning: protectedProcedure.mutation(async () => {
    return await executeLearningCycle();
  }),

  // ═══ Enhanced Learning Cycle (with strategy evolution) ═══
  runEnhancedLearning: protectedProcedure.mutation(async () => {
    return await runEnhancedLearningCycle();
  }),

  // ═══ Scheduler Status ═══
  getSchedulerStatus: protectedProcedure.query(async () => {
    return getLearningSchedulerStatus();
  }),

  // ═══ Update Learning Interval ═══
  updateInterval: protectedProcedure
    .input(z.object({ intervalHours: z.number().min(0.5).max(24) }))
    .mutation(async ({ input }) => {
      updateLearningInterval(input.intervalHours);
      return { success: true, newIntervalHours: input.intervalHours };
    }),

  // ═══ Method Effectiveness per CMS/WAF ═══
  getMethodEffectiveness: protectedProcedure
    .input(z.object({
      cms: z.string().nullable().optional(),
      waf: z.string().nullable().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await getMethodEffectiveness(
        input?.cms ?? null,
        input?.waf ?? null,
      );
    }),

  // ═══ Evolve New Strategies ═══
  evolveStrategies: protectedProcedure.mutation(async () => {
    const strategies = await evolveStrategies();
    return { strategiesEvolved: strategies.length, strategies };
  }),

  // ═══ Get Evolved Strategies from DB ═══
  getEvolvedStrategies: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(learnedPatterns)
      .where(eq(learnedPatterns.patternType, "evolved_strategy"))
      .orderBy(desc(learnedPatterns.updatedAt))
      .limit(50);
    return rows.map(r => ({
      id: r.id,
      name: r.patternKey.replace("evolved:", "").replace(/_/g, " "),
      description: r.aiInsight,
      approach: r.aiRecommendation,
      confidence: r.confidenceScore,
      attempts: r.totalAttempts,
      successes: r.totalSuccesses,
      successRate: Number(r.successRate),
      updatedAt: r.updatedAt,
    }));
  }),

  // ═══ Get Blacklisted Methods ═══
  getBlacklistedMethods: protectedProcedure
    .input(z.object({
      cms: z.string().nullable().optional(),
      waf: z.string().nullable().optional(),
    }).optional())
    .query(async ({ input }) => {
      const effectiveness = await getMethodEffectiveness(
        input?.cms ?? null,
        input?.waf ?? null,
      );
      return effectiveness.filter(m => m.shouldSkip);
    }),

  // ═══ Update Patterns Only ═══
  updatePatterns: protectedProcedure.mutation(async () => {
    const count = await updateLearnedPatterns();
    return { patternsUpdated: count };
  }),

  // ═══ Update CMS Profiles Only ═══
  updateCmsProfiles: protectedProcedure.mutation(async () => {
    const count = await updateCmsProfiles();
    return { profilesUpdated: count };
  }),
});
