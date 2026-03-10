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
  updateCmsProfiles,
  updateLearnedPatterns,
} from "../adaptive-learning";

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
    return await runLearningCycle();
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
