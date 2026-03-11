/**
 * Competitor Gap Analyzer tRPC Router
 * Enhanced with Algorithm Intelligence integration
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  runGapAnalysis,
  createDefaultGapConfig,
  getAnalysis,
  getAllAnalyses,
  getGapSummary,
  analyzeCompetitorFactorGaps,
  compareContentScores,
  generateOutrankPrompt,
} from "../competitor-gap-analyzer";

export const competitorGapRouter = router({
  /** Get gap analysis summary */
  getSummary: protectedProcedure.query(async () => {
    return getGapSummary();
  }),

  /** Get all analyses */
  getAll: protectedProcedure.query(async () => {
    return getAllAnalyses();
  }),

  /** Get analysis for a specific domain */
  getAnalysis: protectedProcedure
    .input(z.object({ domain: z.string() }))
    .query(async ({ input }) => {
      return getAnalysis(input.domain);
    }),

  /** Run full gap analysis */
  runAnalysis: protectedProcedure
    .input(z.object({
      domain: z.string(),
      targetUrl: z.string().url(),
      seedKeywords: z.array(z.string()).min(1),
      niche: z.string().default("gambling"),
      language: z.string().default("th"),
      maxCompetitors: z.number().min(1).max(10).default(5),
      maxGapsToFill: z.number().min(0).max(50).default(10),
      minOpportunityScore: z.number().min(0).max(100).default(60),
      autoDeployContent: z.boolean().default(true),
      autoIndex: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const config = {
        ...createDefaultGapConfig(input.domain, input.targetUrl, input.seedKeywords, input.niche, input.language),
        maxCompetitors: input.maxCompetitors,
        maxGapsToFill: input.maxGapsToFill,
        minOpportunityScore: input.minOpportunityScore,
        autoDeployContent: input.autoDeployContent,
        autoIndex: input.autoIndex,
      };
      return runGapAnalysis(config);
    }),

  /** Analyze competitor against 222 ranking factors */
  analyzeFactorGaps: protectedProcedure
    .input(z.object({
      competitorDomain: z.string(),
      targetKeyword: z.string(),
      niche: z.string().default("gambling"),
    }))
    .mutation(async ({ input }) => {
      return analyzeCompetitorFactorGaps(input.competitorDomain, input.targetKeyword, input.niche);
    }),

  /** Compare content scores (ours vs competitor) */
  compareScores: protectedProcedure
    .input(z.object({
      ourContent: z.string(),
      competitorUrl: z.string(),
      keyword: z.string(),
    }))
    .mutation(async ({ input }) => {
      return compareContentScores(input.ourContent, input.competitorUrl, input.keyword);
    }),

  /** Generate algorithm-optimized outranking prompt */
  generateOutrankPrompt: protectedProcedure
    .input(z.object({
      competitorDomain: z.string(),
      keyword: z.string(),
      weakFactors: z.array(z.string()),
    }))
    .query(async ({ input }) => {
      return { prompt: generateOutrankPrompt(input.competitorDomain, input.keyword, input.weakFactors) };
    }),
});
