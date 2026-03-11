/**
 * Algorithm Update Monitor tRPC Router
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  checkForUpdates,
  analyzeUpdateImpact,
  getMonitorStatus,
  getAllUpdates,
  getUpdateById,
  getUpdatesByCategory,
  getVolatilityHistory,
  getUpdateTimeline,
  type UpdateCategory,
} from "../algorithm-update-monitor";

export const algorithmMonitorRouter = router({
  /** Get monitor status overview */
  getStatus: protectedProcedure.query(async () => {
    return getMonitorStatus();
  }),

  /** Get all known algorithm updates */
  getAllUpdates: protectedProcedure.query(async () => {
    return getAllUpdates();
  }),

  /** Get update by ID */
  getUpdate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getUpdateById(input.id);
    }),

  /** Get updates by category */
  getByCategory: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ input }) => {
      return getUpdatesByCategory(input.category as UpdateCategory);
    }),

  /** Get volatility history */
  getVolatility: protectedProcedure.query(async () => {
    return getVolatilityHistory();
  }),

  /** Get update timeline */
  getTimeline: protectedProcedure.query(async () => {
    return getUpdateTimeline();
  }),

  /** Check for new algorithm updates (AI-powered) */
  checkForUpdates: protectedProcedure.mutation(async () => {
    return checkForUpdates();
  }),

  /** Analyze impact of a specific update */
  analyzeImpact: protectedProcedure
    .input(z.object({ updateId: z.string() }))
    .mutation(async ({ input }) => {
      return analyzeUpdateImpact(input.updateId);
    }),
});
