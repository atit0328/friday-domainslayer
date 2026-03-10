import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  startTracking,
  startBatchTracking,
  processPendingChecks,
  getPerformanceStats,
  getKeywordROI,
  getRecentPerformance,
} from "../keyword-performance-tracker";

export const keywordPerformanceRouter = router({
  /** Start tracking a keyword after attack */
  track: protectedProcedure
    .input(z.object({
      keyword: z.string(),
      targetDomain: z.string(),
      parasiteDomain: z.string(),
      agenticSessionId: z.number().optional(),
      attackMethod: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await startTracking(input);
      return { success: !!id, id };
    }),

  /** Batch track keywords */
  batchTrack: protectedProcedure
    .input(z.object({
      entries: z.array(z.object({
        keyword: z.string(),
        targetDomain: z.string(),
        parasiteDomain: z.string(),
        agenticSessionId: z.number().optional(),
        attackMethod: z.string().optional(),
        category: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const ids = await startBatchTracking(input.entries);
      return { success: true, tracked: ids.length, ids };
    }),

  /** Process pending rank checks */
  processChecks: protectedProcedure
    .mutation(async () => {
      const results = await processPendingChecks();
      return {
        processed: results.length,
        improved: results.filter(r => r.isImproved).length,
        results,
      };
    }),

  /** Get performance stats */
  getStats: protectedProcedure
    .query(async () => {
      return getPerformanceStats();
    }),

  /** Get keyword ROI rankings */
  getROI: protectedProcedure
    .query(async () => {
      return getKeywordROI();
    }),

  /** Get recent performance entries */
  getRecent: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return getRecentPerformance(input?.limit || 50);
    }),
});
