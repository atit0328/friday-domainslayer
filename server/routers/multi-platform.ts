/**
 * Multi-Platform Content Distribution Router
 * tRPC endpoints for distributing SEO content to multiple platforms
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  distributeToAllPlatforms,
  getDistributionHistory,
  getDistributionStats,
  recordSession,
  PLATFORMS,
  type DistributionTarget,
} from "../multi-platform-distributor";

export const multiPlatformRouter = router({
  /**
   * Distribute content to all available platforms
   */
  distribute: protectedProcedure
    .input(z.object({
      targetUrl: z.string().url(),
      targetDomain: z.string(),
      keyword: z.string(),
      niche: z.string().default("gambling"),
      anchorText: z.string(),
      projectId: z.number().optional(),
      maxTier1: z.number().min(1).max(10).default(8),
      maxComments: z.number().min(0).max(10).default(3),
      enableIndexing: z.boolean().default(true),
      enableTelegram: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const target: DistributionTarget = {
        targetUrl: input.targetUrl,
        targetDomain: input.targetDomain,
        keyword: input.keyword,
        niche: input.niche,
        anchorText: input.anchorText,
        projectId: input.projectId,
      };

      const session = await distributeToAllPlatforms(target, {
        maxTier1: input.maxTier1,
        maxComments: input.maxComments,
        enableIndexing: input.enableIndexing,
        enableTelegram: input.enableTelegram,
      });

      recordSession(session);
      return session;
    }),

  /**
   * Get list of available platforms
   */
  getPlatforms: protectedProcedure.query(() => {
    return PLATFORMS.map(p => ({
      name: p.name,
      domain: p.domain,
      da: p.da,
      linkType: p.linkType,
      tier: p.tier,
      type: p.type,
      requiresAuth: p.requiresAuth,
      enabled: p.enabled,
    }));
  }),

  /**
   * Get distribution history
   */
  getHistory: protectedProcedure.query(() => {
    return getDistributionHistory();
  }),

  /**
   * Get distribution stats
   */
  getStats: protectedProcedure.query(() => {
    return getDistributionStats();
  }),
});
