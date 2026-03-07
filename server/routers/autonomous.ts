/**
 * Autonomous Friday Router
 * Deploy history CRUD + Batch operations
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { eq, desc, and, sql, count } from "drizzle-orm";
import { autonomousDeploys, autonomousBatches } from "../../drizzle/schema";

// ═══════════════════════════════════════════════
// Autonomous Deploy History Router
// ═══════════════════════════════════════════════

export const autonomousRouter = router({

  // ─── List all deploys (paginated) ───
  listDeploys: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: z.enum(["queued", "running", "success", "partial", "failed", "stopped"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0, page: input.page, limit: input.limit };

      const conditions = [eq(autonomousDeploys.userId, ctx.user.id)];
      if (input.status) {
        conditions.push(eq(autonomousDeploys.status, input.status));
      }

      const where = conditions.length === 1 ? conditions[0] : and(...conditions);

      const [items, [totalResult]] = await Promise.all([
        db.select().from(autonomousDeploys)
          .where(where as any)
          .orderBy(desc(autonomousDeploys.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ count: count() }).from(autonomousDeploys).where(where as any),
      ]);

      return {
        items,
        total: totalResult?.count || 0,
        page: input.page,
        limit: input.limit,
      };
    }),

  // ─── Get single deploy details ───
  getDeploy: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const [deploy] = await db.select().from(autonomousDeploys)
        .where(and(
          eq(autonomousDeploys.id, input.id),
          eq(autonomousDeploys.userId, ctx.user.id),
        ));

      return deploy || null;
    }),

  // ─── Delete deploy record ───
  deleteDeploy: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      await db.delete(autonomousDeploys)
        .where(and(
          eq(autonomousDeploys.id, input.id),
          eq(autonomousDeploys.userId, ctx.user.id),
        ));

      return { success: true };
    }),

  // ─── Deploy stats ───
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { total: 0, success: 0, partial: 0, failed: 0, running: 0 };

    const results = await db.select({
      status: autonomousDeploys.status,
      count: count(),
    })
      .from(autonomousDeploys)
      .where(eq(autonomousDeploys.userId, ctx.user.id))
      .groupBy(autonomousDeploys.status);

    const stats: Record<string, number> = { total: 0, success: 0, partial: 0, failed: 0, running: 0, queued: 0, stopped: 0 };
    for (const r of results) {
      stats[r.status] = r.count;
      stats.total += r.count;
    }

    return stats;
  }),

  // ─── List batches ───
  listBatches: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const [items, [totalResult]] = await Promise.all([
        db.select().from(autonomousBatches)
          .where(eq(autonomousBatches.userId, ctx.user.id))
          .orderBy(desc(autonomousBatches.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db.select({ count: count() }).from(autonomousBatches)
          .where(eq(autonomousBatches.userId, ctx.user.id)),
      ]);

      return { items, total: totalResult?.count || 0 };
    }),

  // ─── Get batch details with its deploys ───
  getBatch: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const [batch] = await db.select().from(autonomousBatches)
        .where(and(
          eq(autonomousBatches.id, input.id),
          eq(autonomousBatches.userId, ctx.user.id),
        ));

      if (!batch) return null;

      // Get all deploys for this batch
      const deploys = await db.select().from(autonomousDeploys)
        .where(eq(autonomousDeploys.batchId, input.id))
        .orderBy(desc(autonomousDeploys.createdAt));

      return { batch, deploys };
    }),

  // ─── Delete batch ───
  deleteBatch: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Delete all deploys in this batch
      await db.delete(autonomousDeploys)
        .where(eq(autonomousDeploys.batchId, input.id));

      // Delete the batch
      await db.delete(autonomousBatches)
        .where(and(
          eq(autonomousBatches.id, input.id),
          eq(autonomousBatches.userId, ctx.user.id),
        ));

      return { success: true };
    }),
});
