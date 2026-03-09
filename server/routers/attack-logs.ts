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
});
