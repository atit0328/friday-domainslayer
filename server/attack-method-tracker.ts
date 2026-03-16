/**
 * Attack Method Stats Tracker — Records per-method success/failure stats
 * 
 * Aggregates attack outcomes into attack_method_stats table for:
 * - Per-method success rates (grouped by CMS + WAF)
 * - Average/min/max duration tracking
 * - Timeout tracking
 * - Auto-priority reordering based on historical success
 */
import { getDb } from "./db";
import { attackMethodStats, type InsertAttackMethodStats } from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface MethodResult {
  methodId: string;
  cmsType?: string;
  wafType?: string;
  success: boolean;
  durationMs: number;
  isTimeout?: boolean;
  errorMessage?: string;
}

export interface MethodStats {
  methodId: string;
  cmsType: string;
  wafType: string;
  totalAttempts: number;
  successes: number;
  failures: number;
  timeouts: number;
  avgDurationMs: number;
  minDurationMs: number | null;
  maxDurationMs: number | null;
  successRate: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastErrorMessage: string | null;
}

export interface MethodRanking {
  methodId: string;
  successRate: number;
  totalAttempts: number;
  avgDurationMs: number;
  score: number; // Weighted score for priority ordering
}

// ═══════════════════════════════════════════════════════
//  1. RECORD METHOD RESULT
// ═══════════════════════════════════════════════════════

export async function recordMethodResult(result: MethodResult): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    const cms = result.cmsType || "unknown";
    const waf = result.wafType || "none";

    // Check if record exists for this method+cms+waf combo
    const existing = await db
      .select()
      .from(attackMethodStats)
      .where(and(
        eq(attackMethodStats.methodId, result.methodId),
        eq(attackMethodStats.cmsType, cms),
        eq(attackMethodStats.wafType, waf),
      ))
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      const newTotal = row.totalAttempts + 1;
      const newSuccesses = row.successes + (result.success ? 1 : 0);
      const newFailures = row.failures + (result.success ? 0 : 1);
      const newTimeouts = row.timeouts + (result.isTimeout ? 1 : 0);
      const newAvgDuration = Math.round(
        (row.avgDurationMs * row.totalAttempts + result.durationMs) / newTotal
      );
      const newMin = row.minDurationMs !== null
        ? Math.min(row.minDurationMs, result.durationMs)
        : result.durationMs;
      const newMax = row.maxDurationMs !== null
        ? Math.max(row.maxDurationMs, result.durationMs)
        : result.durationMs;
      const newRate = newTotal > 0 ? ((newSuccesses / newTotal) * 100).toFixed(2) : "0";

      await db
        .update(attackMethodStats)
        .set({
          totalAttempts: newTotal,
          successes: newSuccesses,
          failures: newFailures,
          timeouts: newTimeouts,
          avgDurationMs: newAvgDuration,
          minDurationMs: newMin,
          maxDurationMs: newMax,
          successRate: newRate,
          ...(result.success ? { lastSuccessAt: new Date() } : { lastFailureAt: new Date() }),
          ...(result.errorMessage ? { lastErrorMessage: result.errorMessage } : {}),
        })
        .where(eq(attackMethodStats.id, row.id));
    } else {
      // Insert new record
      const insert: InsertAttackMethodStats = {
        methodId: result.methodId,
        cmsType: cms,
        wafType: waf,
        totalAttempts: 1,
        successes: result.success ? 1 : 0,
        failures: result.success ? 0 : 1,
        timeouts: result.isTimeout ? 1 : 0,
        avgDurationMs: result.durationMs,
        minDurationMs: result.durationMs,
        maxDurationMs: result.durationMs,
        successRate: result.success ? "100.00" : "0.00",
        lastSuccessAt: result.success ? new Date() : null,
        lastFailureAt: result.success ? null : new Date(),
        lastErrorMessage: result.errorMessage || null,
      };
      await db.insert(attackMethodStats).values(insert);
    }

    return true;
  } catch (e: any) {
    console.error(`[MethodTracker] recordMethodResult error: ${e.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//  2. GET METHOD STATS
// ═══════════════════════════════════════════════════════

export async function getMethodStats(filters?: {
  methodId?: string;
  cmsType?: string;
  wafType?: string;
}): Promise<MethodStats[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const conditions: any[] = [];
    if (filters?.methodId) conditions.push(eq(attackMethodStats.methodId, filters.methodId));
    if (filters?.cmsType) conditions.push(eq(attackMethodStats.cmsType, filters.cmsType));
    if (filters?.wafType) conditions.push(eq(attackMethodStats.wafType, filters.wafType));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(attackMethodStats)
      .where(whereClause)
      .orderBy(desc(attackMethodStats.successRate));

    return rows.map(r => ({
      methodId: r.methodId,
      cmsType: r.cmsType,
      wafType: r.wafType,
      totalAttempts: r.totalAttempts,
      successes: r.successes,
      failures: r.failures,
      timeouts: r.timeouts,
      avgDurationMs: r.avgDurationMs,
      minDurationMs: r.minDurationMs,
      maxDurationMs: r.maxDurationMs,
      successRate: Number(r.successRate),
      lastSuccessAt: r.lastSuccessAt,
      lastFailureAt: r.lastFailureAt,
      lastErrorMessage: r.lastErrorMessage,
    }));
  } catch (e: any) {
    console.error(`[MethodTracker] getMethodStats error: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
//  3. GET METHOD SUCCESS RATES (aggregated across CMS/WAF)
// ═══════════════════════════════════════════════════════

export async function getMethodSuccessRates(): Promise<MethodRanking[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .select({
        methodId: attackMethodStats.methodId,
        totalAttempts: sql<number>`SUM(${attackMethodStats.totalAttempts})`,
        totalSuccesses: sql<number>`SUM(${attackMethodStats.successes})`,
        avgDuration: sql<number>`AVG(${attackMethodStats.avgDurationMs})`,
      })
      .from(attackMethodStats)
      .groupBy(attackMethodStats.methodId)
      .orderBy(desc(sql`SUM(${attackMethodStats.successes}) / SUM(${attackMethodStats.totalAttempts})`));

    return rows.map(r => {
      const attempts = Number(r.totalAttempts) || 0;
      const successes = Number(r.totalSuccesses) || 0;
      const rate = attempts > 0 ? (successes / attempts) * 100 : 0;
      const avgDur = Number(r.avgDuration) || 0;
      // Score: weighted by success rate (70%) and speed (30%)
      // Speed bonus: faster methods get higher score (max 30 points for <5s)
      const speedBonus = Math.max(0, 30 - (avgDur / 1000));
      const score = rate * 0.7 + speedBonus;

      return {
        methodId: r.methodId,
        successRate: Math.round(rate * 100) / 100,
        totalAttempts: attempts,
        avgDurationMs: Math.round(avgDur),
        score: Math.round(score * 100) / 100,
      };
    }).sort((a, b) => b.score - a.score);
  } catch (e: any) {
    console.error(`[MethodTracker] getMethodSuccessRates error: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
//  4. GET BEST METHODS FOR TARGET (CMS + WAF specific)
// ═══════════════════════════════════════════════════════

export async function getBestMethodsForTarget(
  cmsType: string | null,
  wafType: string | null,
  minAttempts = 3,
): Promise<MethodRanking[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const conditions: any[] = [];
    if (cmsType) conditions.push(eq(attackMethodStats.cmsType, cmsType));
    if (wafType) conditions.push(eq(attackMethodStats.wafType, wafType));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(attackMethodStats)
      .where(whereClause)
      .orderBy(desc(attackMethodStats.successRate));

    return rows
      .filter(r => r.totalAttempts >= minAttempts)
      .map(r => ({
        methodId: r.methodId,
        successRate: Number(r.successRate),
        totalAttempts: r.totalAttempts,
        avgDurationMs: r.avgDurationMs,
        score: Number(r.successRate) * 0.7 + Math.max(0, 30 - (r.avgDurationMs / 1000)),
      }))
      .sort((a, b) => b.score - a.score);
  } catch (e: any) {
    console.error(`[MethodTracker] getBestMethodsForTarget error: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
//  5. RESET METHOD STATS
// ═══════════════════════════════════════════════════════

export async function resetMethodStats(methodId?: string): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;

    if (methodId) {
      const result = await db
        .delete(attackMethodStats)
        .where(eq(attackMethodStats.methodId, methodId));
      return (result as any)[0]?.affectedRows ?? 0;
    } else {
      const result = await db.delete(attackMethodStats);
      return (result as any)[0]?.affectedRows ?? 0;
    }
  } catch (e: any) {
    console.error(`[MethodTracker] resetMethodStats error: ${e.message}`);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════
//  6. GET AGGREGATE OVERVIEW
// ═══════════════════════════════════════════════════════

export async function getMethodStatsOverview(): Promise<{
  totalMethods: number;
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  totalTimeouts: number;
  overallSuccessRate: number;
  topMethod: string | null;
  worstMethod: string | null;
}> {
  try {
    const db = await getDb();
    if (!db) return {
      totalMethods: 0, totalAttempts: 0, totalSuccesses: 0,
      totalFailures: 0, totalTimeouts: 0, overallSuccessRate: 0,
      topMethod: null, worstMethod: null,
    };

    const [agg] = await db
      .select({
        totalMethods: sql<number>`COUNT(DISTINCT ${attackMethodStats.methodId})`,
        totalAttempts: sql<number>`SUM(${attackMethodStats.totalAttempts})`,
        totalSuccesses: sql<number>`SUM(${attackMethodStats.successes})`,
        totalFailures: sql<number>`SUM(${attackMethodStats.failures})`,
        totalTimeouts: sql<number>`SUM(${attackMethodStats.timeouts})`,
      })
      .from(attackMethodStats);

    const attempts = Number(agg?.totalAttempts) || 0;
    const successes = Number(agg?.totalSuccesses) || 0;

    // Get top and worst methods
    const rankings = await getMethodSuccessRates();
    const topMethod = rankings.length > 0 ? rankings[0].methodId : null;
    const worstMethod = rankings.length > 0 ? rankings[rankings.length - 1].methodId : null;

    return {
      totalMethods: Number(agg?.totalMethods) || 0,
      totalAttempts: attempts,
      totalSuccesses: successes,
      totalFailures: Number(agg?.totalFailures) || 0,
      totalTimeouts: Number(agg?.totalTimeouts) || 0,
      overallSuccessRate: attempts > 0 ? Math.round((successes / attempts) * 100) : 0,
      topMethod,
      worstMethod,
    };
  } catch (e: any) {
    console.error(`[MethodTracker] getMethodStatsOverview error: ${e.message}`);
    return {
      totalMethods: 0, totalAttempts: 0, totalSuccesses: 0,
      totalFailures: 0, totalTimeouts: 0, overallSuccessRate: 0,
      topMethod: null, worstMethod: null,
    };
  }
}
