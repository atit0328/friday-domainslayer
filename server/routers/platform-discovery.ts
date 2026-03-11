/**
 * Platform Discovery tRPC Router
 * Exposes auto platform discovery, registration, and posting endpoints
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  discoverNewPlatforms,
  getAllPlatforms,
  getPlatformStats,
  getPlatformLeaderboard,
  getPlatformsByType,
  getPlatformById,
  getPostHistory,
  getDiscoveryLog,
  autoPostToDiscoveredPlatforms,
  checkPlatformHealth,
  batchHealthCheck,
  addPlatformManually,
  type PlatformType,
} from "../platform-discovery-engine";

export const platformDiscoveryRouter = router({
  /** Get all discovered platforms */
  getAll: protectedProcedure.query(async () => {
    return getAllPlatforms();
  }),

  /** Get platform stats */
  getStats: protectedProcedure.query(async () => {
    return getPlatformStats();
  }),

  /** Get platform leaderboard (sorted by performance) */
  getLeaderboard: protectedProcedure.query(async () => {
    return getPlatformLeaderboard();
  }),

  /** Get platforms by type */
  getByType: protectedProcedure
    .input(z.object({ type: z.string() }))
    .query(async ({ input }) => {
      return getPlatformsByType(input.type as PlatformType);
    }),

  /** Get platform by ID */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getPlatformById(input.id);
    }),

  /** Get post history */
  getPostHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return getPostHistory(input.limit);
    }),

  /** Get discovery log */
  getDiscoveryLog: protectedProcedure.query(async () => {
    return getDiscoveryLog();
  }),

  /** Discover new platforms via AI */
  discover: protectedProcedure
    .input(z.object({
      niche: z.string().default("gambling"),
      count: z.number().min(1).max(50).default(10),
    }))
    .mutation(async ({ input }) => {
      return discoverNewPlatforms(undefined, input.niche);
    }),

  /** Auto-post to discovered platforms */
  autoPost: protectedProcedure
    .input(z.object({
      targetUrl: z.string().url(),
      targetDomain: z.string(),
      keyword: z.string(),
      anchorText: z.string(),
      niche: z.string().default("gambling"),
      maxPlatforms: z.number().min(1).max(30).default(10),
    }))
    .mutation(async ({ input }) => {
      const { maxPlatforms, ...target } = input;
      return autoPostToDiscoveredPlatforms(target, maxPlatforms);
    }),

  /** Check health of a specific platform */
  checkHealth: protectedProcedure
    .input(z.object({ platformId: z.string() }))
    .mutation(async ({ input }) => {
      return checkPlatformHealth(input.platformId);
    }),

  /** Batch health check all platforms */
  batchHealthCheck: protectedProcedure.mutation(async () => {
    return batchHealthCheck();
  }),

  /** Add a platform manually */
  addManual: protectedProcedure
    .input(z.object({
      name: z.string(),
      url: z.string().url(),
      type: z.string().default("paste"),
      estimatedDA: z.number().default(50),
    }))
    .mutation(async ({ input }) => {
      return addPlatformManually({
        name: input.name,
        url: input.url,
        type: input.type as PlatformType,
        estimatedDA: input.estimatedDA,
      });
    }),
});
