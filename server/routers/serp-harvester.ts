/**
 * SERP Harvester Router
 * tRPC endpoints for Google Thailand SERP Harvester
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  runHarvestCycle,
  getNiches,
  getEnabledNiches,
  toggleNiche,
  addNiche,
  getHarvestHistory,
  getHarvestStats,
  generateKeywordsForNiche,
  scrapeGoogleThailand,
  type HarvesterNiche,
} from "../serp-harvester";

export const serpHarvesterRouter = router({
  /**
   * Start a harvest cycle (manual trigger)
   */
  startHarvest: protectedProcedure
    .input(z.object({
      nicheIds: z.array(z.string()).optional(),
      keywordsPerNiche: z.number().min(1).max(20).optional().default(8),
      maxResultsPerKeyword: z.number().min(1).max(10).optional().default(10),
      autoQueueForAttack: z.boolean().optional().default(true),
    }).optional())
    .mutation(async ({ input }) => {
      const result = await runHarvestCycle({
        nicheIds: input?.nicheIds,
        keywordsPerNiche: input?.keywordsPerNiche ?? 8,
        maxResultsPerKeyword: input?.maxResultsPerKeyword ?? 10,
        autoQueueForAttack: input?.autoQueueForAttack ?? true,
        telegramNotify: true,
        triggeredBy: "manual",
      });
      return result;
    }),

  /**
   * Preview: generate keywords for a niche without searching
   */
  previewKeywords: protectedProcedure
    .input(z.object({
      nicheId: z.string(),
      count: z.number().min(1).max(20).optional().default(10),
    }))
    .mutation(async ({ input }) => {
      const niches = getNiches();
      const niche = niches.find(n => n.id === input.nicheId);
      if (!niche) throw new Error(`Niche "${input.nicheId}" not found`);

      const keywords = await generateKeywordsForNiche(niche, input.count);
      return { nicheId: input.nicheId, keywords };
    }),

  /**
   * Preview: search a single keyword on Google.co.th
   */
  searchKeyword: protectedProcedure
    .input(z.object({
      keyword: z.string().min(1),
      maxResults: z.number().min(1).max(10).optional().default(10),
    }))
    .mutation(async ({ input }) => {
      const result = await scrapeGoogleThailand(input.keyword, "manual", input.maxResults);
      return result;
    }),

  /**
   * Get all niches
   */
  getNiches: protectedProcedure
    .query(async () => {
      return getNiches();
    }),

  /**
   * Get enabled niches only
   */
  getEnabledNiches: protectedProcedure
    .query(async () => {
      return getEnabledNiches();
    }),

  /**
   * Toggle niche enabled/disabled
   */
  toggleNiche: protectedProcedure
    .input(z.object({
      nicheId: z.string(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const success = toggleNiche(input.nicheId, input.enabled);
      return { success };
    }),

  /**
   * Add a custom niche
   */
  addNiche: protectedProcedure
    .input(z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      nameEn: z.string().min(1),
      description: z.string().min(1),
      seedKeywords: z.array(z.string()).min(1),
      language: z.string().optional().default("th"),
      country: z.string().optional().default("th"),
    }))
    .mutation(async ({ input }) => {
      const niche: HarvesterNiche = {
        ...input,
        enabled: true,
      };
      const success = addNiche(niche);
      return { success };
    }),

  /**
   * Get harvest history
   */
  history: protectedProcedure
    .query(async () => {
      return getHarvestHistory();
    }),

  /**
   * Get harvest stats
   */
  stats: protectedProcedure
    .query(async () => {
      return getHarvestStats();
    }),
});
