/**
 * Query Parameter Parasite — tRPC Router
 * 
 * Exposes the query parameter injection attack as API endpoints:
 * - Scan domains for vulnerable search/query parameters
 * - Deploy keyword-injected URLs at scale
 * - Run full campaigns automatically
 * - Get campaign status and results
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";

export const queryParasiteRouter = router({
  /** Scan a single domain for vulnerable query parameters */
  scan: protectedProcedure
    .input(z.object({ domain: z.string() }))
    .mutation(async ({ input }) => {
      const { scanForQueryReflection } = await import("../query-param-parasite");
      const results = await scanForQueryReflection(input.domain);
      return { domain: input.domain, vulnerabilities: results };
    }),

  /** Deploy keyword-injected URLs to a vulnerable endpoint */
  deploy: protectedProcedure
    .input(z.object({
      domain: z.string(),
      baseUrl: z.string(),
      param: z.string(),
      keywords: z.array(z.string()),
      reflectsInTitle: z.boolean().default(true),
      reflectsInH1: z.boolean().default(false),
      reflectsInContent: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const { deployQueryParasite } = await import("../query-param-parasite");
      const target = {
        baseUrl: input.baseUrl,
        paramName: input.param,
        reflectsInTitle: input.reflectsInTitle,
        reflectsInH1: input.reflectsInH1,
        reflectsInContent: input.reflectsInContent,
        domain: input.domain,
      };
      const deployments = await deployQueryParasite(target, input.keywords);
      return {
        domain: input.domain,
        deployed: deployments.length,
        indexed: deployments.filter(d => d.indexed).length,
        results: deployments,
      };
    }),

  /** Run a full campaign across multiple domains */
  runCampaign: protectedProcedure
    .input(z.object({
      domains: z.array(z.string()),
      keywords: z.array(z.string()),
      niche: z.string().default("gambling"),
      language: z.string().default("th"),
      maxKeywordsPerTarget: z.number().default(15),
      notifyTelegram: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const { runQueryParasiteCampaign } = await import("../query-param-parasite");
      const campaign = await runQueryParasiteCampaign(input);
      return campaign;
    }),

  /** Get Google dork queries for finding vulnerable sites */
  getDorks: protectedProcedure
    .query(async () => {
      const { getQueryParasiteDorks } = await import("../query-param-parasite");
      return { dorks: getQueryParasiteDorks() };
    }),

  /** Generate AI-expanded keywords for parasite deployment */
  expandKeywords: protectedProcedure
    .input(z.object({
      baseKeywords: z.array(z.string()),
      niche: z.string().default("gambling"),
      language: z.string().default("th"),
      count: z.number().default(20),
    }))
    .mutation(async ({ input }) => {
      const { generateParasiteKeywords } = await import("../query-param-parasite");
      const keywords = await generateParasiteKeywords(
        input.baseKeywords,
        input.niche,
        input.language,
        input.count,
      );
      return { keywords, count: keywords.length };
    }),

  /** Run autonomous tick (used by orchestrator, but also callable manually) */
  tick: protectedProcedure
    .input(z.object({
      keywords: z.array(z.string()),
      targetDomains: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const { queryParasiteTick } = await import("../query-param-parasite");
      const result = await queryParasiteTick(input.keywords, input.targetDomains);
      return result;
    }),
});
