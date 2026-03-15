/**
 * SEO Transform Pipeline Router
 * Exposes the SEO-first transformation pipeline via tRPC
 */
import { z } from "zod";
import { router, protectedProcedure, isAdminUser } from "../_core/trpc";
import { runSeoTransformPipeline, type SeoTransformResult } from "../seo-transform-pipeline";
import { analyzeInstalledTheme } from "../seo-theme-analyzer";
import { validateSeo } from "../seo-validation-scorer";
import { sendTelegramNotification } from "../telegram-notifier";

export const seoTransformRouter = router({
  /**
   * Run the full SEO transformation pipeline
   */
  runPipeline: protectedProcedure
    .input(z.object({
      siteUrl: z.string().url(),
      username: z.string(),
      appPassword: z.string(),
      primaryKeyword: z.string(),
      secondaryKeywords: z.array(z.string()).default([]),
      niche: z.string().default("gambling"),
      brandName: z.string().default(""),
      language: z.string().default("th"),
      country: z.string().default("TH"),
      themeSlug: z.string().optional(),
      autoPublish: z.boolean().default(true),
      chatId: z.string().optional(),
      homepageId: z.number().optional(),
      projectId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await runSeoTransformPipeline(input);
      return result;
    }),

  /**
   * Analyze theme only (Step 1 standalone)
   */
  analyzeTheme: protectedProcedure
    .input(z.object({
      siteUrl: z.string().url(),
      username: z.string(),
      appPassword: z.string(),
      themeSlug: z.string().optional(),
      primaryKeyword: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const report = await analyzeInstalledTheme({
        siteUrl: input.siteUrl,
        username: input.username,
        appPassword: input.appPassword,
        themeSlug: input.themeSlug,
        primaryKeyword: input.primaryKeyword,
      });
      return report;
    }),

  /**
   * Validate SEO score for a page (standalone check)
   */
  validatePage: protectedProcedure
    .input(z.object({
      siteUrl: z.string().url(),
      username: z.string(),
      appPassword: z.string(),
      pageId: z.number().optional(),
      primaryKeyword: z.string(),
      secondaryKeywords: z.array(z.string()).default([]),
    }))
    .mutation(async ({ input }) => {
      const url = input.siteUrl.replace(/\/$/, "");
      const auth = Buffer.from(`${input.username}:${input.appPassword}`).toString("base64");

      let pageHtml = "";
      let pageUrl = input.siteUrl;

      if (input.pageId) {
        const res = await fetch(`${url}/wp-json/wp/v2/pages/${input.pageId}`, {
          headers: { "Authorization": `Basic ${auth}` },
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const data = await res.json() as any;
          pageHtml = data.content?.rendered || data.content?.raw || "";
          pageUrl = data.link || `${url}/?p=${input.pageId}`;
        }
      } else {
        // Fetch homepage
        const res = await fetch(input.siteUrl, {
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          pageHtml = await res.text();
        }
      }

      const report = validateSeo({
        siteUrl: input.siteUrl,
        primaryKeyword: input.primaryKeyword,
        secondaryKeywords: input.secondaryKeywords,
        pageHtml,
        pageUrl,
      });

      return report;
    }),
});
