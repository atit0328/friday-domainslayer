/**
 * Domain Import Router
 * tRPC endpoints for importing target domains from .txt files
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  importAndTrack,
  parseDomainList,
  getImportHistory,
  getImportSummary,
  quickImportDomains,
  type ImportConfig,
} from "../domain-file-importer";

export const domainImportRouter = router({
  /**
   * Import domains from raw text content (paste or file content)
   */
  importFromText: protectedProcedure
    .input(z.object({
      text: z.string().min(1, "Text content is required"),
      source: z.string().optional().default("web-upload"),
      tagKeyword: z.string().optional().default("manual-import"),
      autoQueue: z.boolean().optional().default(true),
      telegramNotify: z.boolean().optional().default(true),
    }))
    .mutation(async ({ input }) => {
      const config: ImportConfig = {
        source: input.source,
        tagKeyword: input.tagKeyword,
        autoQueue: input.autoQueue,
        telegramNotify: input.telegramNotify,
      };

      const result = await importAndTrack(input.text, config);
      return result;
    }),

  /**
   * Quick import a list of domains (array format)
   */
  importDomains: protectedProcedure
    .input(z.object({
      domains: z.array(z.string()).min(1, "At least one domain is required"),
      source: z.string().optional().default("api"),
      tagKeyword: z.string().optional().default("api-import"),
      autoQueue: z.boolean().optional().default(true),
    }))
    .mutation(async ({ input }) => {
      const result = await quickImportDomains(input.domains, {
        source: input.source,
        tagKeyword: input.tagKeyword,
        autoQueue: input.autoQueue,
      });
      return result;
    }),

  /**
   * Preview/validate domains without importing
   */
  preview: protectedProcedure
    .input(z.object({
      text: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const { domains, invalid } = parseDomainList(input.text);
      return {
        totalValid: domains.length,
        totalInvalid: invalid.length,
        validDomains: domains.slice(0, 100), // Preview up to 100
        invalidEntries: invalid.slice(0, 20),
        hasMore: domains.length > 100,
      };
    }),

  /**
   * Get import history
   */
  history: protectedProcedure
    .query(async () => {
      return getImportHistory();
    }),

  /**
   * Get import summary stats
   */
  summary: protectedProcedure
    .query(async () => {
      return getImportSummary();
    }),
});
