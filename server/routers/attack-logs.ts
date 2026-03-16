/**
 * Attack Logs Router — tRPC endpoints for viewing attack pipeline logs
 * Admin/superadmin sees ALL users' data
 */
import { z } from "zod";
import { router, protectedProcedure, isAdminUser } from "../_core/trpc";
import {
  getAttackLogs,
  getAttackLogStats,
  getRecentAttackLogs,
  getBufferedLogs,
  cleanupOldLogs,
} from "../attack-logger";
import { getDb } from "../db";
import { attackLogs, deployHistory, strategyOutcomeLogs } from "../../drizzle/schema";
import { eq, sql, desc, and, gte, lte, count, or, like } from "drizzle-orm";

/** Build userId condition: admin sees all, regular user sees own + legacy(0) */
function userLogCondition(userId: number, admin: boolean) {
  if (admin) return undefined; // no filter
  return or(eq(attackLogs.userId, userId), eq(attackLogs.userId, 0));
}
function userDeployCondition(userId: number, admin: boolean) {
  if (admin) return undefined;
  return eq(deployHistory.userId, userId);
}

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
   * Admin sees all logs, regular user sees own + legacy
   */
  recent: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      if (isAdminUser(ctx.user)) {
        // Admin: get all recent logs without userId filter
        const db = await getDb();
        if (!db) return [];
        return db.select().from(attackLogs)
          .orderBy(desc(attackLogs.timestamp))
          .limit(input.limit);
      }
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
   * Attack Timeline — list all attacks with per-method breakdown for timeline view
   * Returns deploys with their associated strategy outcome logs (method-level detail)
   */
  timeline: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(365).default(30),
      domain: z.string().optional(),
      status: z.enum(["running", "success", "partial", "failed"]).optional(),
      limit: z.number().min(1).max(100).default(30),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { attacks: [], total: 0 };

      const admin = isAdminUser(ctx.user);
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      // Build conditions
      const conditions: any[] = [gte(deployHistory.createdAt, since)];
      const udc = userDeployCondition(ctx.user!.id, admin);
      if (udc) conditions.push(udc);
      if (input.domain) conditions.push(like(deployHistory.targetDomain, `%${input.domain}%`));
      if (input.status) conditions.push(eq(deployHistory.status, input.status));

      // Get total count
      const totalResult = await db.select({ cnt: count() }).from(deployHistory).where(and(...conditions));
      const total = Number(totalResult[0]?.cnt || 0);

      // Get deploys
      const deploys = await db.select({
        id: deployHistory.id,
        domain: deployHistory.targetDomain,
        targetUrl: deployHistory.targetUrl,
        redirectUrl: deployHistory.redirectUrl,
        status: deployHistory.status,
        cms: deployHistory.cms,
        serverType: deployHistory.serverType,
        wafDetected: deployHistory.wafDetected,
        altMethodUsed: deployHistory.altMethodUsed,
        techniqueUsed: deployHistory.techniqueUsed,
        bypassMethod: deployHistory.bypassMethod,
        preScreenScore: deployHistory.preScreenScore,
        preScreenRisk: deployHistory.preScreenRisk,
        filesDeployed: deployHistory.filesDeployed,
        filesAttempted: deployHistory.filesAttempted,
        shellUploaded: deployHistory.shellUploaded,
        redirectActive: deployHistory.redirectActive,
        duration: deployHistory.duration,
        errorBreakdown: deployHistory.errorBreakdown,
        aiAnalysis: deployHistory.aiAnalysis,
        deployedUrls: deployHistory.deployedUrls,
        startedAt: deployHistory.startedAt,
        completedAt: deployHistory.completedAt,
        createdAt: deployHistory.createdAt,
      })
      .from(deployHistory)
      .where(and(...conditions))
      .orderBy(desc(deployHistory.createdAt))
      .limit(input.limit)
      .offset(input.offset);

      // For each deploy, get strategy outcome logs (method-level breakdown)
      const attacks = await Promise.all(deploys.map(async (deploy) => {
        const methods = await db.select({
          id: strategyOutcomeLogs.id,
          method: strategyOutcomeLogs.method,
          exploitType: strategyOutcomeLogs.exploitType,
          success: strategyOutcomeLogs.success,
          httpStatus: strategyOutcomeLogs.httpStatus,
          errorCategory: strategyOutcomeLogs.errorCategory,
          errorMessage: strategyOutcomeLogs.errorMessage,
          durationMs: strategyOutcomeLogs.durationMs,
          filesPlaced: strategyOutcomeLogs.filesPlaced,
          redirectVerified: strategyOutcomeLogs.redirectVerified,
          attemptNumber: strategyOutcomeLogs.attemptNumber,
          isRetry: strategyOutcomeLogs.isRetry,
          wafBypassUsed: strategyOutcomeLogs.wafBypassUsed,
          aiFailureCategory: strategyOutcomeLogs.aiFailureCategory,
          aiReasoning: strategyOutcomeLogs.aiReasoning,
          aiConfidence: strategyOutcomeLogs.aiConfidence,
          createdAt: strategyOutcomeLogs.createdAt,
        })
        .from(strategyOutcomeLogs)
        .where(eq(strategyOutcomeLogs.targetDomain, deploy.domain))
        .orderBy(desc(strategyOutcomeLogs.createdAt))
        .limit(20);

        // Get log count for this deploy
        const logCountResult = await db.select({ cnt: count() })
          .from(attackLogs)
          .where(deploy.id ? eq(attackLogs.deployId, deploy.id) : eq(attackLogs.domain, deploy.domain));

        return {
          ...deploy,
          methods,
          logCount: Number(logCountResult[0]?.cnt || 0),
        };
      }));

      return { attacks, total };
    }),

  /**
   * Attack Detail — full log timeline for a single deploy
   */
  attackDetail: protectedProcedure
    .input(z.object({
      deployId: z.number(),
      limit: z.number().min(1).max(500).default(200),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      // Get the deploy
      const [deploy] = await db.select().from(deployHistory).where(eq(deployHistory.id, input.deployId)).limit(1);
      if (!deploy) return null;

      // Get all logs for this deploy
      const logs = await db.select()
        .from(attackLogs)
        .where(eq(attackLogs.deployId, input.deployId))
        .orderBy(attackLogs.timestamp)
        .limit(input.limit);

      // Get method outcomes
      const methods = await db.select()
        .from(strategyOutcomeLogs)
        .where(eq(strategyOutcomeLogs.targetDomain, deploy.targetDomain))
        .orderBy(strategyOutcomeLogs.createdAt)
        .limit(50);

      // Build phase timeline
      const phases: Record<string, { phase: string; startTime: Date | null; endTime: Date | null; logs: typeof logs; status: string }> = {};
      for (const log of logs) {
        if (!phases[log.phase]) {
          phases[log.phase] = { phase: log.phase, startTime: log.timestamp, endTime: log.timestamp, logs: [], status: "info" };
        }
        phases[log.phase].logs.push(log);
        phases[log.phase].endTime = log.timestamp;
        if (log.severity === "error" || log.severity === "critical") phases[log.phase].status = "error";
        else if (log.severity === "success" && phases[log.phase].status !== "error") phases[log.phase].status = "success";
      }

      return {
        deploy,
        logs,
        methods,
        phaseTimeline: Object.values(phases),
      };
    }),

  /**
   * Method Success Rate — aggregate method performance across all attacks
   */
  methodStats: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const rows = await db.select({
        method: strategyOutcomeLogs.method,
        total: count(),
        successes: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
        avgDuration: sql<number>`AVG(${strategyOutcomeLogs.durationMs})`,
        avgConfidence: sql<number>`AVG(${strategyOutcomeLogs.aiConfidence})`,
      })
      .from(strategyOutcomeLogs)
      .where(gte(strategyOutcomeLogs.createdAt, since))
      .groupBy(strategyOutcomeLogs.method)
      .orderBy(desc(count()));

      return rows.map(r => ({
        method: r.method,
        total: Number(r.total),
        successes: Number(r.successes || 0),
        successRate: Number(r.total) > 0 ? Math.round((Number(r.successes || 0) / Number(r.total)) * 100) : 0,
        avgDurationMs: Math.round(Number(r.avgDuration || 0)),
        avgConfidence: Math.round(Number(r.avgConfidence || 0)),
      }));
    }),

  /**
   * Dashboard aggregate stats — success rates, failure patterns, best methods
   * Admin sees all data, regular user sees own + legacy
   */
  dashboardStats: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const admin = isAdminUser(ctx.user);
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      // 1. Total deploys and success rate from deploy_history
      const deployConditions: any[] = [gte(deployHistory.createdAt, since)];
      const udc = userDeployCondition(ctx.user!.id, admin);
      if (udc) deployConditions.push(udc);

      const deploys = await db
        .select({
          status: deployHistory.status,
          cnt: count(),
        })
        .from(deployHistory)
        .where(and(...deployConditions))
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
      const logConditions: any[] = [gte(attackLogs.timestamp, since)];
      const ulc = userLogCondition(ctx.user!.id, admin);
      if (ulc) logConditions.push(ulc);

      const severityRows = await db
        .select({
          severity: attackLogs.severity,
          cnt: count(),
        })
        .from(attackLogs)
        .where(and(...logConditions))
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
        .where(and(...logConditions))
        .groupBy(attackLogs.phase);

      const phaseStats: Record<string, number> = {};
      for (const r of phaseRows) {
        phaseStats[r.phase] = Number(r.cnt);
      }

      // 4. Top failure methods
      const failureConditions = [
        ...logConditions,
        sql`${attackLogs.severity} IN ('error', 'critical')`,
        sql`${attackLogs.method} IS NOT NULL`,
      ];

      const failureRows = await db
        .select({
          method: attackLogs.method,
          phase: attackLogs.phase,
          cnt: count(),
        })
        .from(attackLogs)
        .where(and(...failureConditions))
        .groupBy(attackLogs.method, attackLogs.phase)
        .orderBy(desc(count()))
        .limit(10);

      const topFailures = failureRows.map(r => ({
        method: r.method || "unknown",
        phase: r.phase,
        count: Number(r.cnt),
      }));

      // 5. Top success methods (from deploy_history altMethodUsed)
      const successConditions: any[] = [
        gte(deployHistory.createdAt, since),
        sql`${deployHistory.status} IN ('success', 'partial')`,
        sql`${deployHistory.altMethodUsed} IS NOT NULL`,
      ];
      if (udc) successConditions.push(udc);

      const successRows = await db
        .select({
          altMethodUsed: deployHistory.altMethodUsed,
          cnt: count(),
        })
        .from(deployHistory)
        .where(and(...successConditions))
        .groupBy(deployHistory.altMethodUsed)
        .orderBy(desc(count()))
        .limit(10);

      const topSuccessMethods = successRows.map(r => ({
        method: r.altMethodUsed || "standard",
        count: Number(r.cnt),
      }));

      // 6. Recent deploys timeline
      const recentDeployConditions: any[] = [gte(deployHistory.createdAt, since)];
      if (udc) recentDeployConditions.push(udc);

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
        .where(and(...recentDeployConditions))
        .orderBy(desc(deployHistory.createdAt))
        .limit(20);

      // 7. Domains attacked
      const domainSubquery = admin
        ? sql`(SELECT deployStatus FROM deploy_history dh2 WHERE dh2.targetDomain = ${deployHistory.targetDomain} ORDER BY dh2.createdAt DESC LIMIT 1)`
        : sql`(SELECT deployStatus FROM deploy_history dh2 WHERE dh2.targetDomain = ${deployHistory.targetDomain} AND dh2.userId = ${ctx.user!.id} ORDER BY dh2.createdAt DESC LIMIT 1)`;

      const domainRows = await db
        .select({
          domain: deployHistory.targetDomain,
          cnt: count(),
          lastStatus: domainSubquery,
        })
        .from(deployHistory)
        .where(and(...recentDeployConditions))
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
        .where(and(...logConditions));

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
