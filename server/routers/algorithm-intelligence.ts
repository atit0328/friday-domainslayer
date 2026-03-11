/**
 * Google Algorithm Intelligence Router
 * tRPC endpoints for the algorithm knowledge base
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  RANKING_FACTORS,
  FAST_RANKING_STRATEGIES,
  PENALTY_RULES,
  scoreContent,
  analyzeLinkProfile,
  analyzeKeywordStrategy,
  generateOptimizedContentPrompt,
  calculateLinkVelocity,
  generateAnchorTextPlan,
  getFactorsByCategory,
  getExploitableFactors,
  getCriticalFactors,
  getFastRankFactors,
  getAllStrategies,
  getAllPenaltyRules,
  type FactorCategory,
} from "../google-algorithm-intelligence";

export const algorithmIntelligenceRouter = router({
  // Get all ranking factors
  getFactors: publicProcedure
    .input(z.object({
      category: z.enum([
        "domain", "page_level", "site_level", "backlink",
        "user_interaction", "special_algorithm", "brand_signal",
        "on_site_spam", "off_site_spam",
      ]).optional(),
      exploitableOnly: z.boolean().optional(),
      minFastRankRelevance: z.number().optional(),
    }).optional())
    .query(({ input }) => {
      let factors = [...RANKING_FACTORS];
      if (input?.category) {
        factors = getFactorsByCategory(input.category as FactorCategory);
      }
      if (input?.exploitableOnly) {
        factors = factors.filter(f => f.exploitable);
      }
      if (input?.minFastRankRelevance) {
        factors = factors.filter(f => f.fastRankRelevance >= input.minFastRankRelevance!);
      }
      return {
        factors,
        total: factors.length,
        categories: Array.from(new Set(factors.map(f => f.category))),
      };
    }),

  // Get fast-ranking factors
  getFastRankFactors: publicProcedure
    .input(z.object({ minRelevance: z.number().default(7) }).optional())
    .query(({ input }) => {
      return getFastRankFactors(input?.minRelevance || 7);
    }),

  // Get exploitable factors
  getExploitable: publicProcedure.query(() => {
    return getExploitableFactors();
  }),

  // Get critical factors
  getCritical: publicProcedure.query(() => {
    return getCriticalFactors();
  }),

  // Get all strategies
  getStrategies: publicProcedure.query(() => {
    return getAllStrategies();
  }),

  // Get penalty rules
  getPenaltyRules: publicProcedure.query(() => {
    return getAllPenaltyRules();
  }),

  // Score content against ranking factors
  scoreContent: publicProcedure
    .input(z.object({
      title: z.string(),
      content: z.string(),
      keyword: z.string(),
      metaDescription: z.string().optional(),
      hasSchema: z.boolean().optional(),
      hasImages: z.boolean().optional(),
      hasTOC: z.boolean().optional(),
      publishDate: z.date().optional(),
      lastUpdated: z.date().optional(),
    }))
    .mutation(({ input }) => {
      return scoreContent(input);
    }),

  // Analyze link profile
  analyzeLinkProfile: publicProcedure
    .input(z.object({
      links: z.array(z.object({
        anchorText: z.string(),
        sourceDomain: z.string(),
        sourceDA: z.number(),
        linkType: z.string(),
        createdAt: z.date(),
      })),
    }))
    .mutation(({ input }) => {
      return analyzeLinkProfile(input.links);
    }),

  // AI-powered keyword strategy analysis
  analyzeKeyword: publicProcedure
    .input(z.object({
      keyword: z.string(),
      niche: z.string().default("gambling"),
    }))
    .mutation(async ({ input }) => {
      return analyzeKeywordStrategy(input.keyword, input.niche);
    }),

  // Generate optimized content prompt
  getContentPrompt: publicProcedure
    .input(z.object({
      keyword: z.string(),
      niche: z.string().default("gambling"),
      language: z.string().default("Thai"),
      targetWordCount: z.number().default(1800),
      includeSchema: z.boolean().default(true),
    }))
    .query(({ input }) => {
      return {
        prompt: generateOptimizedContentPrompt(input),
        keyword: input.keyword,
        guidelines: {
          minWords: input.targetWordCount,
          language: input.language,
          niche: input.niche,
        },
      };
    }),

  // Calculate safe link velocity
  calculateLinkVelocity: publicProcedure
    .input(z.object({
      competitionLevel: z.enum(["low", "medium", "high", "extreme"]),
      existingLinks: z.number().default(0),
      domainAge: z.number().default(365),
      isParasiteSEO: z.boolean().default(true),
    }))
    .query(({ input }) => {
      return calculateLinkVelocity(input);
    }),

  // Generate anchor text plan
  getAnchorTextPlan: publicProcedure
    .input(z.object({
      keyword: z.string(),
      brandName: z.string(),
      targetUrl: z.string(),
      totalLinks: z.number(),
    }))
    .query(({ input }) => {
      return generateAnchorTextPlan(input);
    }),

  // Get algorithm overview stats
  getOverview: publicProcedure.query(() => {
    const totalFactors = RANKING_FACTORS.length;
    const exploitable = RANKING_FACTORS.filter(f => f.exploitable).length;
    const critical = RANKING_FACTORS.filter(f => f.impact === "critical").length;
    const highFastRank = RANKING_FACTORS.filter(f => f.fastRankRelevance >= 8).length;
    
    const categoryBreakdown = Object.entries(
      RANKING_FACTORS.reduce((acc, f) => {
        acc[f.category] = (acc[f.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([category, count]) => ({ category, count }));

    const impactBreakdown = Object.entries(
      RANKING_FACTORS.reduce((acc, f) => {
        acc[f.impact] = (acc[f.impact] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    ).map(([impact, count]) => ({ impact, count }));

    return {
      totalFactors,
      exploitable,
      critical,
      highFastRank,
      strategies: FAST_RANKING_STRATEGIES.length,
      penaltyRules: PENALTY_RULES.length,
      categoryBreakdown,
      impactBreakdown,
    };
  }),
});
