/**
 * tRPC Router — SerpAPI Keyword Target Discovery
 * 
 * Endpoints:
 *   - getStats: Get keyword discovery statistics
 *   - getKeywords: List all keywords with pagination
 *   - addKeywords: Add new keywords
 *   - removeKeyword: Remove a keyword
 *   - toggleKeyword: Enable/disable a keyword
 *   - seedDefaults: Seed default lottery keywords
 *   - runDiscovery: Trigger a keyword search run
 *   - getTargets: List discovered targets with pagination/filter
 *   - getSearchRuns: List search run history
 *   - getQueuedTargets: Get targets ready for attack
 *   - markTargetsQueued: Mark targets as queued for attack
 *   - getSerpApiAccount: Get SerpAPI account info (remaining searches)
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getKeywordDiscoveryStats,
  getKeywords,
  addKeywords,
  removeKeyword,
  toggleKeyword,
  seedDefaultKeywords,
  runKeywordDiscovery,
  getDiscoveredTargets,
  getSearchRuns,
  getQueuedTargets,
  markTargetsQueued,
} from "../keyword-target-discovery";
import { getAccountInfo } from "../serp-api";

export const keywordDiscoveryRouter = router({
  // ─── Stats ───
  getStats: protectedProcedure.query(async () => {
    return getKeywordDiscoveryStats();
  }),

  // ─── Keywords CRUD ───
  getKeywords: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(500).default(100),
    }).optional())
    .query(async ({ input }) => {
      return getKeywords(input?.page ?? 1, input?.limit ?? 100);
    }),

  addKeywords: protectedProcedure
    .input(z.object({
      keywords: z.array(z.string().min(1)).min(1),
      category: z.string().default("lottery"),
    }))
    .mutation(async ({ input }) => {
      return addKeywords(input.keywords, input.category);
    }),

  removeKeyword: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return removeKeyword(input.id);
    }),

  toggleKeyword: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      return toggleKeyword(input.id, input.isActive);
    }),

  seedDefaults: protectedProcedure
    .mutation(async () => {
      return seedDefaultKeywords();
    }),

  // ─── Discovery Run ───
  runDiscovery: protectedProcedure
    .input(z.object({
      maxKeywords: z.number().min(1).max(100).default(20),
    }).optional())
    .mutation(async ({ input }) => {
      return runKeywordDiscovery({
        maxKeywords: input?.maxKeywords ?? 20,
        triggeredBy: "manual",
      });
    }),

  // ─── Targets ───
  getTargets: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(200).default(50),
      status: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return getDiscoveredTargets(
        input?.page ?? 1,
        input?.limit ?? 50,
        input?.status,
      );
    }),

  getQueuedTargets: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(async ({ input }) => {
      return getQueuedTargets(input?.limit ?? 50);
    }),

  markQueued: protectedProcedure
    .input(z.object({ targetIds: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      await markTargetsQueued(input.targetIds);
      return { success: true, count: input.targetIds.length };
    }),

  // ─── Search Runs ───
  getSearchRuns: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ input }) => {
      return getSearchRuns(input?.limit ?? 20);
    }),

  // ─── SerpAPI Account ───
  getSerpApiAccount: protectedProcedure.query(async () => {
    return getAccountInfo();
  }),
});
