/**
 * Attack Dashboard Router — Unified attack analytics, deploy history, and payload management
 * Combines data from ai_attack_history + deploy_history for comprehensive view
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { aiAttackHistory, deployHistory } from "../../drizzle/schema";
import {
  getMethodStats,
  getMethodSuccessRates,
  getMethodStatsOverview,
  resetMethodStats,
  getBestMethodsForTarget,
} from "../attack-method-tracker";
import { desc, eq, and, like, gte, lte, sql, count } from "drizzle-orm";

export const attackDashboardRouter = router({
  // ═══ Overview Stats ═══
  overview: protectedProcedure
    .input(z.object({
      period: z.enum(["today", "week", "month", "all"]).default("week"),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const period = input?.period || "week";
      
      const periodStart = new Date();
      if (period === "today") periodStart.setHours(0, 0, 0, 0);
      else if (period === "week") periodStart.setDate(periodStart.getDate() - 7);
      else if (period === "month") periodStart.setDate(periodStart.getDate() - 30);
      else periodStart.setFullYear(2020);

      // Attack history stats
      const [attackStats] = await db.select({
        total: sql<number>`COUNT(*)`,
        success: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = 1 THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = 0 THEN 1 ELSE 0 END)`,
        avgDuration: sql<number>`AVG(${aiAttackHistory.durationMs})`,
        uniqueDomains: sql<number>`COUNT(DISTINCT ${aiAttackHistory.targetDomain})`,
      }).from(aiAttackHistory)
        .where(gte(aiAttackHistory.createdAt, periodStart));

      // Deploy history stats
      const [deployStats] = await db.select({
        total: sql<number>`COUNT(*)`,
        success: sql<number>`SUM(CASE WHEN ${deployHistory.status} = 'success' THEN 1 ELSE 0 END)`,
        partial: sql<number>`SUM(CASE WHEN ${deployHistory.status} = 'partial' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${deployHistory.status} = 'failed' THEN 1 ELSE 0 END)`,
        running: sql<number>`SUM(CASE WHEN ${deployHistory.status} = 'running' THEN 1 ELSE 0 END)`,
        totalFiles: sql<number>`COALESCE(SUM(${deployHistory.filesDeployed}), 0)`,
        totalRedirects: sql<number>`SUM(CASE WHEN ${deployHistory.redirectActive} = 1 THEN 1 ELSE 0 END)`,
        avgDuration: sql<number>`AVG(${deployHistory.duration})`,
      }).from(deployHistory)
        .where(gte(deployHistory.createdAt, periodStart));

      return {
        attacks: {
          total: attackStats?.total || 0,
          success: attackStats?.success || 0,
          failed: attackStats?.failed || 0,
          successRate: attackStats?.total ? Math.round(((attackStats?.success || 0) / attackStats.total) * 100) : 0,
          avgDuration: Math.round(attackStats?.avgDuration || 0),
          uniqueDomains: attackStats?.uniqueDomains || 0,
        },
        deploys: {
          total: deployStats?.total || 0,
          success: deployStats?.success || 0,
          partial: deployStats?.partial || 0,
          failed: deployStats?.failed || 0,
          running: deployStats?.running || 0,
          totalFiles: deployStats?.totalFiles || 0,
          totalRedirects: deployStats?.totalRedirects || 0,
          avgDuration: Math.round(deployStats?.avgDuration || 0),
        },
        period,
      };
    }),

  // ═══ Success Rate by Method ═══
  methodStats: protectedProcedure
    .input(z.object({
      period: z.enum(["today", "week", "month", "all"]).default("month"),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const period = input?.period || "month";
      
      const periodStart = new Date();
      if (period === "today") periodStart.setHours(0, 0, 0, 0);
      else if (period === "week") periodStart.setDate(periodStart.getDate() - 7);
      else if (period === "month") periodStart.setDate(periodStart.getDate() - 30);
      else periodStart.setFullYear(2020);

      const methods = await db.select({
        method: aiAttackHistory.method,
        total: sql<number>`COUNT(*)`,
        success: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = 1 THEN 1 ELSE 0 END)`,
        avgDuration: sql<number>`AVG(${aiAttackHistory.durationMs})`,
      }).from(aiAttackHistory)
        .where(gte(aiAttackHistory.createdAt, periodStart))
        .groupBy(aiAttackHistory.method)
        .orderBy(sql`SUM(CASE WHEN ${aiAttackHistory.success} = 1 THEN 1 ELSE 0 END) DESC`);

      return methods.map(m => ({
        method: m.method,
        total: m.total,
        success: m.success,
        successRate: m.total ? Math.round((m.success / m.total) * 100) : 0,
        avgDuration: Math.round(m.avgDuration || 0),
      }));
    }),

  // ═══ Daily Attack Timeline ═══
  timeline: protectedProcedure
    .input(z.object({
      days: z.number().default(14),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const days = input?.days || 14;
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const timeline = await db.select({
        date: sql<string>`DATE(${aiAttackHistory.createdAt})`,
        total: sql<number>`COUNT(*)`,
        success: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = 1 THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = 0 THEN 1 ELSE 0 END)`,
      }).from(aiAttackHistory)
        .where(gte(aiAttackHistory.createdAt, startDate))
        .groupBy(sql`DATE(${aiAttackHistory.createdAt})`)
        .orderBy(sql`DATE(${aiAttackHistory.createdAt})`);

      return timeline;
    }),

  // ═══ Top Targeted Domains ═══
  topDomains: protectedProcedure
    .input(z.object({
      limit: z.number().default(10),
      period: z.enum(["week", "month", "all"]).default("month"),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const limit = input?.limit || 10;
      const period = input?.period || "month";
      
      const periodStart = new Date();
      if (period === "week") periodStart.setDate(periodStart.getDate() - 7);
      else if (period === "month") periodStart.setDate(periodStart.getDate() - 30);
      else periodStart.setFullYear(2020);

      const domains = await db.select({
        domain: aiAttackHistory.targetDomain,
        total: sql<number>`COUNT(*)`,
        success: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = 1 THEN 1 ELSE 0 END)`,
        lastAttack: sql<string>`MAX(${aiAttackHistory.createdAt})`,
        methods: sql<string>`GROUP_CONCAT(DISTINCT ${aiAttackHistory.method})`,
      }).from(aiAttackHistory)
        .where(gte(aiAttackHistory.createdAt, periodStart))
        .groupBy(aiAttackHistory.targetDomain)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(limit);

      return domains.map(d => ({
        domain: d.domain,
        total: d.total,
        success: d.success,
        successRate: d.total ? Math.round((d.success / d.total) * 100) : 0,
        lastAttack: d.lastAttack,
        methods: d.methods ? d.methods.split(",") : [],
      }));
    }),

  // ═══ Recent Attacks (combined view) ═══
  recentAttacks: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      domain: z.string().optional(),
      method: z.string().optional(),
      status: z.enum(["success", "failed", "all"]).default("all"),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      
      const page = input?.page || 1;
      const limit = input?.limit || 20;
      const conditions = [];

      if (input?.domain) {
        conditions.push(like(aiAttackHistory.targetDomain, `%${input.domain}%`));
      }
      if (input?.method) {
        conditions.push(like(aiAttackHistory.method, `%${input.method}%`));
      }
      if (input?.status === "success") {
        conditions.push(eq(aiAttackHistory.success, true));
      } else if (input?.status === "failed") {
        conditions.push(eq(aiAttackHistory.success, false));
      }
      if (input?.dateFrom) {
        conditions.push(gte(aiAttackHistory.createdAt, new Date(input.dateFrom)));
      }
      if (input?.dateTo) {
        conditions.push(lte(aiAttackHistory.createdAt, new Date(input.dateTo)));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRow] = await db.select({ cnt: count() })
        .from(aiAttackHistory)
        .where(whereClause);

      const items = await db.select()
        .from(aiAttackHistory)
        .where(whereClause)
        .orderBy(desc(aiAttackHistory.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);

      return {
        items,
        total: totalRow?.cnt || 0,
        page,
        totalPages: Math.ceil((totalRow?.cnt || 0) / limit),
      };
    }),

  // ═══ Recent Deploys ═══
  recentDeploys: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      domain: z.string().optional(),
      status: z.enum(["running", "success", "partial", "failed", "all"]).default("all"),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      
      const page = input?.page || 1;
      const limit = input?.limit || 20;
      const conditions = [];

      if (input?.domain) {
        conditions.push(like(deployHistory.targetDomain, `%${input.domain}%`));
      }
      if (input?.status && input.status !== "all") {
        conditions.push(eq(deployHistory.status, input.status));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRow] = await db.select({ cnt: count() })
        .from(deployHistory)
        .where(whereClause);

      const items = await db.select()
        .from(deployHistory)
        .where(whereClause)
        .orderBy(desc(deployHistory.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);

      return {
        items,
        total: totalRow?.cnt || 0,
        page,
        totalPages: Math.ceil((totalRow?.cnt || 0) / limit),
      };
    }),

  // ═══ WAF Detection Stats ═══
  wafStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    
    const stats = await db.select({
      waf: aiAttackHistory.waf,
      total: sql<number>`COUNT(*)`,
      success: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = 1 THEN 1 ELSE 0 END)`,
    }).from(aiAttackHistory)
      .where(sql`${aiAttackHistory.waf} IS NOT NULL AND ${aiAttackHistory.waf} != ''`)
      .groupBy(aiAttackHistory.waf)
      .orderBy(sql`COUNT(*) DESC`);

    return stats.map(s => ({
      waf: s.waf || "Unknown",
      total: s.total,
      success: s.success,
      bypassRate: s.total ? Math.round((s.success / s.total) * 100) : 0,
    }));
  }),

  // ═══ Retry Stats ═══
  retryStats: protectedProcedure.query(async () => {
    try {
      const { getRetryStats } = await import("../auto-retry-engine");
      return await getRetryStats();
    } catch {
      return { totalFailed: 0, retriable: 0, exhausted: 0, recentRetries: [] };
    }
  }),

  // ═══ Trigger Retry (single domain) ═══
  triggerRetry: protectedProcedure
    .input(z.object({
      domain: z.string(),
      method: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { retryDomain } = await import("../auto-retry-engine");
      return await retryDomain(input.domain, input.method);
    }),

  // ═══ Trigger Retry All ═══
  triggerRetryAll: protectedProcedure
    .input(z.object({
      maxRetries: z.number().default(20),
    }).optional())
    .mutation(async ({ input }) => {
      const { retryAllFailed } = await import("../auto-retry-engine");
      return await retryAllFailed({ maxRetries: input?.maxRetries || 20 });
    }),

  // ═══ Failed Domains (for retry) ═══
  failedDomains: protectedProcedure
    .input(z.object({
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const limit = input?.limit || 20;

      // Get domains that have only failed (no success)
      const failed = await db.select({
        domain: aiAttackHistory.targetDomain,
        attempts: sql<number>`COUNT(*)`,
        lastAttempt: sql<string>`MAX(${aiAttackHistory.createdAt})`,
        methods: sql<string>`GROUP_CONCAT(DISTINCT ${aiAttackHistory.method})`,
        lastError: sql<string>`(SELECT errorMessage FROM ai_attack_history a2 WHERE a2.targetDomain = ${aiAttackHistory.targetDomain} ORDER BY historyCreatedAt DESC LIMIT 1)`,
        waf: sql<string>`(SELECT waf FROM ai_attack_history a3 WHERE a3.targetDomain = ${aiAttackHistory.targetDomain} AND a3.waf IS NOT NULL ORDER BY historyCreatedAt DESC LIMIT 1)`,
      }).from(aiAttackHistory)
        .groupBy(aiAttackHistory.targetDomain)
        .having(sql`SUM(CASE WHEN ${aiAttackHistory.success} = 1 THEN 1 ELSE 0 END) = 0`)
        .orderBy(sql`MAX(${aiAttackHistory.createdAt}) DESC`)
        .limit(limit);

      return failed.map(f => ({
        domain: f.domain,
        attempts: f.attempts,
        lastAttempt: f.lastAttempt,
        methodsTried: f.methods ? f.methods.split(",") : [],
        lastError: f.lastError,
        waf: f.waf,
      }));
    }),

  // ═══ Attack Method Stats (aggregated) ═══
  methodStatsAggregated: protectedProcedure
    .input(z.object({
      methodId: z.string().optional(),
      cmsType: z.string().optional(),
      wafType: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return await getMethodStats(input || {});
    }),

  // ═══ Method Success Rate Rankings ═══
  methodRankings: protectedProcedure.query(async () => {
    return await getMethodSuccessRates();
  }),

  // ═══ Method Stats Overview ═══
  methodStatsOverview: protectedProcedure.query(async () => {
    return await getMethodStatsOverview();
  }),

  // ═══ Best Methods for Target ═══
  bestMethodsForTarget: protectedProcedure
    .input(z.object({
      cmsType: z.string().nullable(),
      wafType: z.string().nullable(),
      minAttempts: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await getBestMethodsForTarget(
        input.cmsType,
        input.wafType,
        input.minAttempts || 3,
      );
    }),

  // ═══ Reset Method Stats ═══
  resetMethodStats: protectedProcedure
    .input(z.object({
      methodId: z.string().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      const deleted = await resetMethodStats(input?.methodId);
      return { deleted, methodId: input?.methodId || "all" };
    }),
});
