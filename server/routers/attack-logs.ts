/**
 * Attack Logs Router — tRPC endpoints for viewing attack pipeline logs
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getAttackLogs,
  getAttackLogStats,
  getRecentAttackLogs,
  getBufferedLogs,
  cleanupOldLogs,
} from "../attack-logger";
import { getDb } from "../db";
import { attackLogs } from "../../drizzle/schema";
import { deployHistory } from "../../drizzle/schema";
import { eq, sql, desc, and, gte, count, or } from "drizzle-orm";

export const attackLogsRouter = router({
  /**
   * Get logs for a specific deploy
   */
  getByDeploy: protectedProcedure
    .input(z.object({
      deployId: z.number(),
      phase: z.string().optional(),
      severity: z.string().optional(),
      limit: z.number().min(1).max(1000).default(200),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const logs = await getAttackLogs({
        deployId: input.deployId,
        phase: input.phase,
        severity: input.severity,
        limit: input.limit,
        offset: input.offset,
      });
      return logs;
    }),

  /**
   * Get logs by domain
   */
  getByDomain: protectedProcedure
    .input(z.object({
      domain: z.string(),
      limit: z.number().min(1).max(1000).default(200),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      return getAttackLogs({
        domain: input.domain,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Get log statistics for a deploy
   */
  stats: protectedProcedure
    .input(z.object({ deployId: z.number() }))
    .query(async ({ input }) => {
      return getAttackLogStats(input.deployId);
    }),

  /**
   * Get recent logs across all deploys (for dashboard)
   */
  recent: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      return getRecentAttackLogs(ctx.user!.id, input.limit);
    }),

  /**
   * Get buffered logs for real-time streaming (in-memory)
   */
  buffered: protectedProcedure
    .input(z.object({
      deployId: z.number(),
      sinceIndex: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      return getBufferedLogs(input.deployId, input.sinceIndex);
    }),

  /**
   * Export logs as text for a deploy
   */
  exportText: protectedProcedure
    .input(z.object({ deployId: z.number() }))
    .query(async ({ input }) => {
      const logs = await getAttackLogs({
        deployId: input.deployId,
        limit: 1000,
      });

      // Build text export
      const lines: string[] = [
        `═══════════════════════════════════════════════`,
        `  ATTACK LOG — Deploy #${input.deployId}`,
        `  Total Events: ${logs.length}`,
        `  Generated: ${new Date().toISOString()}`,
        `═══════════════════════════════════════════════`,
        "",
      ];

      for (const log of logs.reverse()) {
        const ts = log.timestamp ? new Date(log.timestamp).toISOString().replace("T", " ").slice(0, 19) : "N/A";
        const sev = log.severity.toUpperCase().padEnd(8);
        const method = log.method ? ` [${log.method}]` : "";
        const http = log.httpStatus ? ` HTTP:${log.httpStatus}` : "";
        lines.push(`[${ts}] ${sev} [${log.phase}/${log.step}]${method}${http} ${log.detail}`);
      }

      return lines.join("\n");
    }),

  /**
   * Cleanup old logs (admin only)
   */
  cleanup: protectedProcedure
    .input(z.object({ daysOld: z.number().min(1).max(365).default(30) }))
    .mutation(async ({ input }) => {
      const deleted = await cleanupOldLogs(input.daysOld);
      return { deleted };
    }),

  /**
   * Dashboard aggregate stats — success rates, failure patterns, best methods
   */
  dashboardStats: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      // 1. Total deploys and success rate from deploy_history
      const deploys = await db
        .select({
          status: deployHistory.status,
          cnt: count(),
        })
        .from(deployHistory)
        .where(and(
          eq(deployHistory.userId, ctx.user!.id),
          gte(deployHistory.createdAt, since),
        ))
        .groupBy(deployHistory.status);

      const deployStats = {
        total: 0,
        success: 0,
        partial: 0,
        failed: 0,
        running: 0,
      };
      for (const d of deploys) {
        const c = Number(d.cnt);
        deployStats.total += c;
        if (d.status === "success") deployStats.success = c;
        else if (d.status === "partial") deployStats.partial = c;
        else if (d.status === "failed") deployStats.failed = c;
        else if (d.status === "running") deployStats.running = c;
      }

      // 2. Log severity breakdown
      const severityRows = await db
        .select({
          severity: attackLogs.severity,
          cnt: count(),
        })
        .from(attackLogs)
        .where(and(
          or(eq(attackLogs.userId, ctx.user!.id), eq(attackLogs.userId, 0)),
          gte(attackLogs.timestamp, since),
        ))
        .groupBy(attackLogs.severity);

      const severityStats: Record<string, number> = {};
      for (const r of severityRows) {
        severityStats[r.severity] = Number(r.cnt);
      }

      // 3. Phase breakdown
      const phaseRows = await db
        .select({
          phase: attackLogs.phase,
          cnt: count(),
        })
        .from(attackLogs)
        .where(and(
          or(eq(attackLogs.userId, ctx.user!.id), eq(attackLogs.userId, 0)),
          gte(attackLogs.timestamp, since),
        ))
        .groupBy(attackLogs.phase);

      const phaseStats: Record<string, number> = {};
      for (const r of phaseRows) {
        phaseStats[r.phase] = Number(r.cnt);
      }

      // 4. Top failure methods
      const failureRows = await db
        .select({
          method: attackLogs.method,
          phase: attackLogs.phase,
          cnt: count(),
        })
        .from(attackLogs)
        .where(and(
          or(eq(attackLogs.userId, ctx.user!.id), eq(attackLogs.userId, 0)),
          gte(attackLogs.timestamp, since),
          sql`${attackLogs.severity} IN ('error', 'critical')`,
          sql`${attackLogs.method} IS NOT NULL`,
        ))
        .groupBy(attackLogs.method, attackLogs.phase)
        .orderBy(desc(count()))
        .limit(10);

      const topFailures = failureRows.map(r => ({
        method: r.method || "unknown",
        phase: r.phase,
        count: Number(r.cnt),
      }));

      // 5. Top success methods (from deploy_history altMethodUsed)
      const successRows = await db
        .select({
          altMethodUsed: deployHistory.altMethodUsed,
          cnt: count(),
        })
        .from(deployHistory)
        .where(and(
          eq(deployHistory.userId, ctx.user!.id),
          gte(deployHistory.createdAt, since),
          sql`${deployHistory.status} IN ('success', 'partial')`,
          sql`${deployHistory.altMethodUsed} IS NOT NULL`,
        ))
        .groupBy(deployHistory.altMethodUsed)
        .orderBy(desc(count()))
        .limit(10);

      const topSuccessMethods = successRows.map(r => ({
        method: r.altMethodUsed || "standard",
        count: Number(r.cnt),
      }));

      // 6. Recent deploys timeline
      const recentDeploys = await db
        .select({
          id: deployHistory.id,
          domain: deployHistory.targetDomain,
          status: deployHistory.status,
          createdAt: deployHistory.createdAt,
          altMethodUsed: deployHistory.altMethodUsed,
          duration: deployHistory.duration,
        })
        .from(deployHistory)
        .where(and(
          eq(deployHistory.userId, ctx.user!.id),
          gte(deployHistory.createdAt, since),
        ))
        .orderBy(desc(deployHistory.createdAt))
        .limit(20);

      // 7. Domains attacked
      const domainRows = await db
        .select({
          domain: deployHistory.targetDomain,
          cnt: count(),
          lastStatus: sql<string>`(SELECT status FROM deploy_history dh2 WHERE dh2.domain = ${deployHistory.targetDomain} AND dh2.user_id = ${ctx.user!.id} ORDER BY dh2.created_at DESC LIMIT 1)`,
        })
        .from(deployHistory)
        .where(and(
          eq(deployHistory.userId, ctx.user!.id),
          gte(deployHistory.createdAt, since),
        ))
        .groupBy(deployHistory.targetDomain)
        .orderBy(desc(count()))
        .limit(20);

      const domainStats = domainRows.map(r => ({
        domain: r.domain,
        attempts: Number(r.cnt),
        lastStatus: r.lastStatus || "unknown",
      }));

      // 8. Total log events
      const totalLogsResult = await db
        .select({ cnt: count() })
        .from(attackLogs)
        .where(and(
          or(eq(attackLogs.userId, ctx.user!.id), eq(attackLogs.userId, 0)),
          gte(attackLogs.timestamp, since),
        ));

      return {
        period: { days: input.days, since: since.toISOString() },
        deployStats,
        successRate: deployStats.total > 0 
          ? Math.round(((deployStats.success + deployStats.partial) / deployStats.total) * 100) 
          : 0,
        totalLogEvents: Number(totalLogsResult[0]?.cnt || 0),
        severityStats,
        phaseStats,
        topFailures,
        topSuccessMethods,
        recentDeploys,
        domainStats,
      };
    }),
});
