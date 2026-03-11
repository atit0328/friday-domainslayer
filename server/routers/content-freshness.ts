/**
 * Content Freshness Engine — tRPC Router
 * 
 * Dashboard endpoints for monitoring and managing content freshness:
 * - View tracked content and staleness status
 * - Trigger manual refresh cycles
 * - View freshness summary and cycle reports
 * - Update content rankings
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";

export const contentFreshnessRouter = router({
  /** Get all tracked content, optionally filtered by domain */
  getTracked: protectedProcedure
    .input(z.object({ domain: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const { getTrackedContent } = await import("../content-freshness-engine");
      const content = await getTrackedContent(input?.domain);
      return { content, total: content.length };
    }),

  /** Get stale content that needs refreshing */
  getStale: protectedProcedure
    .input(z.object({ domain: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const { getStaleContent } = await import("../content-freshness-engine");
      const content = await getStaleContent(input?.domain);
      return { content, total: content.length };
    }),

  /** Get freshness summary statistics */
  getSummary: protectedProcedure
    .query(async () => {
      const { getFreshnessSummary } = await import("../content-freshness-engine");
      return getFreshnessSummary();
    }),

  /** Get cycle reports history */
  getCycleReports: protectedProcedure
    .query(async () => {
      const { getCycleReports } = await import("../content-freshness-engine");
      return getCycleReports();
    }),

  /** Recalculate staleness scores for all tracked content */
  recalculate: protectedProcedure
    .mutation(async () => {
      const { calculateStaleness } = await import("../content-freshness-engine");
      await calculateStaleness();
      return { success: true };
    }),

  /** Manually trigger a freshness refresh cycle */
  runCycle: protectedProcedure
    .input(z.object({
      domain: z.string(),
      maxRefreshes: z.number().default(5),
      language: z.string().default("th"),
      niche: z.string().default("gambling"),
    }))
    .mutation(async ({ input }) => {
      const { runFreshnessCycle, createDefaultFreshnessConfig } = await import("../content-freshness-engine");
      const config = createDefaultFreshnessConfig(input.domain);
      config.maxRefreshesPerCycle = input.maxRefreshes;
      config.language = input.language;
      config.niche = input.niche;
      const report = await runFreshnessCycle(config);
      return report;
    }),

  /** Run a single freshness tick (used by orchestrator) */
  tick: protectedProcedure
    .input(z.object({ domain: z.string() }))
    .mutation(async ({ input }) => {
      const { freshnessTick } = await import("../content-freshness-engine");
      const report = await freshnessTick(input.domain);
      return report;
    }),

  /** Update content ranking */
  updateRank: protectedProcedure
    .input(z.object({
      contentId: z.number(),
      rank: z.number().nullable(),
    }))
    .mutation(async ({ input }) => {
      const { updateContentRank } = await import("../content-freshness-engine");
      await updateContentRank(input.contentId, input.rank);
      return { success: true };
    }),

  /** Track new content */
  trackContent: protectedProcedure
    .input(z.object({
      url: z.string(),
      title: z.string(),
      keyword: z.string(),
      platform: z.enum(["telegraph", "web2.0", "target", "other"]),
      content: z.string(),
      domain: z.string(),
      telegraphToken: z.string().optional(),
      telegraphPath: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { trackContent } = await import("../content-freshness-engine");
      const id = await trackContent({
        url: input.url,
        title: input.title,
        keyword: input.keyword,
        platform: input.platform,
        originalContent: input.content,
        domain: input.domain,
        telegraphToken: input.telegraphToken,
        telegraphPath: input.telegraphPath,
      });
      return { id, success: true };
    }),
});
