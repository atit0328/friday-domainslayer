/**
 * Scan Scheduler — Automated Periodic Vulnerability Scanning
 * 
 * Features:
 * 1. Cron-based scheduling (daily, weekly, biweekly, monthly)
 * 2. Runs comprehensive attack vectors against target domains
 * 3. Compares results with previous scan to detect NEW vulnerabilities
 * 4. Sends Telegram alerts when critical/high severity vulns are found
 * 5. Stores full scan history for trend analysis
 * 
 * Checks every 15 minutes if any scans are due.
 */
import { getDb } from "./db";
import { scheduledScans, scanResults } from "../drizzle/schema";
import { eq, and, lte, isNull, or } from "drizzle-orm";
import { runComprehensiveAttackVectors, type AttackVectorResult, type AttackVectorConfig } from "./comprehensive-attack-vectors";
import { sendTelegramNotification } from "./telegram-notifier";

const SCHEDULER_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

// ═══════════════════════════════════════════════
//  SCHEDULER LIFECYCLE
// ═══════════════════════════════════════════════

export function startScanScheduler() {
  if (schedulerTimer) return;
  console.log("[ScanScheduler] เริ่มต้น — ตรวจสอบทุก 15 นาที");

  // Run immediately on start, then every 15 minutes
  runDueScans().catch(err =>
    console.error("[ScanScheduler] Error on initial run:", err.message)
  );

  schedulerTimer = setInterval(() => {
    runDueScans().catch(err =>
      console.error("[ScanScheduler] Error:", err.message)
    );
  }, SCHEDULER_INTERVAL_MS);
}

export function stopScanScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[ScanScheduler] Stopped");
  }
}

// ═══════════════════════════════════════════════
//  FIND & RUN DUE SCANS
// ═══════════════════════════════════════════════

async function runDueScans() {
  const database = await getDb();
  if (!database) return;

  const now = new Date();

  // Find all enabled scans that are due (nextRunAt <= now)
  const dueScans = await database
    .select()
    .from(scheduledScans)
    .where(
      and(
        eq(scheduledScans.enabled, true),
        or(
          lte(scheduledScans.nextRunAt, now),
          isNull(scheduledScans.nextRunAt),
        ),
      ),
    );

  if (dueScans.length === 0) return;

  console.log(`[ScanScheduler] พบ ${dueScans.length} scans ที่ต้องรัน`);

  // Run scans sequentially to avoid overloading
  for (const scan of dueScans) {
    try {
      await executeScan(scan);
    } catch (err) {
      console.error(`[ScanScheduler] Error running scan ${scan.id} (${scan.domain}):`, err instanceof Error ? err.message : String(err));
      // Update status to failed
      await database.update(scheduledScans).set({
        lastRunStatus: "failed",
        lastRunAt: now,
        nextRunAt: calculateNextRun(scan.frequency, scan.scheduleDays as number[] | null, scan.scheduleHour),
      }).where(eq(scheduledScans.id, scan.id));
    }
  }
}

// ═══════════════════════════════════════════════
//  EXECUTE SINGLE SCAN
// ═══════════════════════════════════════════════

import type { ScheduledScan, ScanResult } from "../drizzle/schema";

async function executeScan(scan: ScheduledScan) {
  const database = await getDb();
  if (!database) return;

  const startTime = Date.now();
  console.log(`[ScanScheduler] ▶ Running scan: ${scan.domain} (ID: ${scan.id})`);

  // Mark as running
  await database.update(scheduledScans).set({
    lastRunStatus: "running",
  }).where(eq(scheduledScans.id, scan.id));

  try {
    // Build attack config
    const targetUrl = scan.domain.startsWith("http") ? scan.domain : `https://${scan.domain}`;
    const config: AttackVectorConfig = {
      targetUrl,
      timeout: 15000,
      onProgress: (vector, detail) => {
        console.log(`[ScanScheduler] [${scan.domain}] ${vector}: ${detail}`);
      },
    };

    // Run comprehensive attack vectors
    const findings = await runComprehensiveAttackVectors(config);
    const durationMs = Date.now() - startTime;

    // Count by severity
    const criticalCount = findings.filter(f => f.severity === "critical" && f.success).length;
    const highCount = findings.filter(f => f.severity === "high" && f.success).length;
    const mediumCount = findings.filter(f => f.severity === "medium" && f.success).length;
    const lowCount = findings.filter(f => f.severity === "low" && f.success).length;
    const infoCount = findings.filter(f => f.severity === "info" || !f.success).length;
    const exploitableCount = findings.filter(f => f.exploitable).length;
    const totalFindings = findings.filter(f => f.success).length;

    // Get previous scan results for comparison
    const previousResults = await database
      .select()
      .from(scanResults)
      .where(eq(scanResults.scanId, scan.id))
      .orderBy(scanResults.createdAt)
      .limit(1);

    const previousFindings = previousResults.length > 0
      ? (previousResults[0].findings as AttackVectorResult[] || [])
      : [];

    // Compare: find NEW and RESOLVED vulnerabilities
    const { newVulns, resolvedVulns } = compareFindings(
      previousFindings.filter(f => f.success),
      findings.filter(f => f.success),
    );

    // Store scan result
    const [insertResult] = await database.insert(scanResults).values({
      scanId: scan.id,
      userId: scan.userId,
      domain: scan.domain,
      totalTests: findings.length,
      totalFindings,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      infoCount,
      exploitableCount,
      findings: findings as any,
      newFindings: newVulns.length,
      resolvedFindings: resolvedVulns.length,
      newFindingsDetail: newVulns as any,
      resolvedFindingsDetail: resolvedVulns as any,
      durationMs,
      status: "completed",
      telegramSent: false,
    });

    // Update scheduled scan
    await database.update(scheduledScans).set({
      lastRunStatus: "success",
      lastRunAt: new Date(),
      nextRunAt: calculateNextRun(scan.frequency, scan.scheduleDays as number[] | null, scan.scheduleHour),
      totalRuns: (scan.totalRuns || 0) + 1,
    }).where(eq(scheduledScans.id, scan.id));

    console.log(`[ScanScheduler] ✓ Scan complete: ${scan.domain} — ${totalFindings} findings (${newVulns.length} new, ${resolvedVulns.length} resolved) in ${Math.round(durationMs / 1000)}s`);

    // Send Telegram alert if needed
    if (scan.telegramAlert && shouldAlert(newVulns, scan.alertMinSeverity)) {
      const alertSent = await sendScanAlert(scan, {
        totalFindings,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        exploitableCount,
        newVulns,
        resolvedVulns,
        durationMs,
      });

      // Update telegram sent status
      if (alertSent && insertResult.insertId) {
        await database.update(scanResults).set({
          telegramSent: true,
        }).where(eq(scanResults.id, Number(insertResult.insertId)));
      }
    }

  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Store failed result
    await database.insert(scanResults).values({
      scanId: scan.id,
      userId: scan.userId,
      domain: scan.domain,
      totalTests: 0,
      totalFindings: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      infoCount: 0,
      exploitableCount: 0,
      findings: [] as any,
      newFindings: 0,
      resolvedFindings: 0,
      durationMs,
      status: "failed",
      errorMessage: errorMsg,
    });

    // Update scan status
    await database.update(scheduledScans).set({
      lastRunStatus: "failed",
      lastRunAt: new Date(),
      nextRunAt: calculateNextRun(scan.frequency, scan.scheduleDays as number[] | null, scan.scheduleHour),
      totalRuns: (scan.totalRuns || 0) + 1,
    }).where(eq(scheduledScans.id, scan.id));

    console.error(`[ScanScheduler] ✗ Scan failed: ${scan.domain} — ${errorMsg}`);
  }
}

// ═══════════════════════════════════════════════
//  COMPARE FINDINGS (NEW vs RESOLVED)
// ═══════════════════════════════════════════════

function compareFindings(
  previous: AttackVectorResult[],
  current: AttackVectorResult[],
): { newVulns: AttackVectorResult[]; resolvedVulns: AttackVectorResult[] } {
  // Create fingerprints for comparison
  const fingerprint = (f: AttackVectorResult) =>
    `${f.vector}::${f.category}::${f.severity}::${f.detail.substring(0, 100)}`;

  const prevSet = new Set(previous.map(fingerprint));
  const currSet = new Set(current.map(fingerprint));

  // New = in current but not in previous
  const newVulns = current.filter(f => !prevSet.has(fingerprint(f)));

  // Resolved = in previous but not in current
  const resolvedVulns = previous.filter(f => !currSet.has(fingerprint(f)));

  return { newVulns, resolvedVulns };
}

// ═══════════════════════════════════════════════
//  SEVERITY CHECK FOR ALERTS
// ═══════════════════════════════════════════════

const SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"] as const;

function shouldAlert(
  newVulns: AttackVectorResult[],
  minSeverity: string,
): boolean {
  if (newVulns.length === 0) return false;
  const minIdx = SEVERITY_ORDER.indexOf(minSeverity as typeof SEVERITY_ORDER[number]);
  if (minIdx === -1) return newVulns.length > 0;
  return newVulns.some(v => SEVERITY_ORDER.indexOf(v.severity) >= minIdx);
}

// ═══════════════════════════════════════════════
//  TELEGRAM ALERT
// ═══════════════════════════════════════════════

interface ScanAlertData {
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  exploitableCount: number;
  newVulns: AttackVectorResult[];
  resolvedVulns: AttackVectorResult[];
  durationMs: number;
}

async function sendScanAlert(scan: ScheduledScan, data: ScanAlertData): Promise<boolean> {
  try {
    // Build alert message
    const severityEmoji = (s: string) => {
      switch (s) {
        case "critical": return "🔴";
        case "high": return "🟠";
        case "medium": return "🟡";
        case "low": return "🔵";
        default: return "⚪";
      }
    };

    let message = `🛡️ <b>Scheduled Vulnerability Scan Report</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `🌐 <b>Domain:</b> ${scan.domain}\n`;
    message += `⏱ <b>Duration:</b> ${Math.round(data.durationMs / 1000)}s\n`;
    message += `📊 <b>Total Findings:</b> ${data.totalFindings}\n\n`;

    // Severity breakdown
    if (data.criticalCount > 0) message += `🔴 Critical: ${data.criticalCount}\n`;
    if (data.highCount > 0) message += `🟠 High: ${data.highCount}\n`;
    if (data.mediumCount > 0) message += `🟡 Medium: ${data.mediumCount}\n`;
    if (data.lowCount > 0) message += `🔵 Low: ${data.lowCount}\n`;
    if (data.exploitableCount > 0) message += `💥 Exploitable: ${data.exploitableCount}\n`;

    // New vulnerabilities
    if (data.newVulns.length > 0) {
      message += `\n⚠️ <b>NEW Vulnerabilities (${data.newVulns.length}):</b>\n`;
      for (const v of data.newVulns.slice(0, 10)) {
        message += `${severityEmoji(v.severity)} <b>${v.vector}</b> [${v.severity.toUpperCase()}]\n`;
        message += `   ${v.detail.substring(0, 120)}\n`;
      }
      if (data.newVulns.length > 10) {
        message += `   ... and ${data.newVulns.length - 10} more\n`;
      }
    }

    // Resolved vulnerabilities
    if (data.resolvedVulns.length > 0) {
      message += `\n✅ <b>Resolved (${data.resolvedVulns.length}):</b>\n`;
      for (const v of data.resolvedVulns.slice(0, 5)) {
        message += `   ✓ ${v.vector} [${v.severity}]\n`;
      }
      if (data.resolvedVulns.length > 5) {
        message += `   ... and ${data.resolvedVulns.length - 5} more\n`;
      }
    }

    if (data.newVulns.length === 0 && data.resolvedVulns.length === 0) {
      message += `\n✅ No changes since last scan.`;
    }

    message += `\n━━━━━━━━━━━━━━━━━━━━━━━`;
    message += `\n🤖 FridayAI Scheduled Scan`;

    const result = await sendTelegramNotification({
      type: "info",
      targetUrl: scan.domain,
      details: message,
    });

    if (result.success) {
      console.log(`[ScanScheduler] 📨 Telegram alert sent for ${scan.domain}`);
    }
    return result.success;
  } catch (err) {
    console.error(`[ScanScheduler] Failed to send Telegram alert:`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

// ═══════════════════════════════════════════════
//  CALCULATE NEXT RUN TIME
// ═══════════════════════════════════════════════

export function calculateNextRun(
  frequency: string,
  scheduleDays: number[] | null,
  scheduleHour: number,
): Date {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(scheduleHour);

  switch (frequency) {
    case "daily":
      // Next day at scheduleHour
      if (now.getHours() >= scheduleHour) {
        next.setDate(next.getDate() + 1);
      }
      break;

    case "weekly":
      // Find next matching day
      if (scheduleDays && scheduleDays.length > 0) {
        const sortedDays = [...scheduleDays].sort((a, b) => a - b);
        const currentDay = now.getDay();
        const currentHour = now.getHours();

        // Find next day that's after current day (or same day but later hour)
        let found = false;
        for (const day of sortedDays) {
          if (day > currentDay || (day === currentDay && currentHour < scheduleHour)) {
            const daysUntil = day - currentDay;
            next.setDate(now.getDate() + daysUntil);
            found = true;
            break;
          }
        }
        // If no day found this week, use first day next week
        if (!found) {
          const daysUntil = 7 - currentDay + sortedDays[0];
          next.setDate(now.getDate() + daysUntil);
        }
      } else {
        // Default: same day next week
        next.setDate(next.getDate() + 7);
      }
      break;

    case "biweekly":
      next.setDate(next.getDate() + 14);
      break;

    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;

    default:
      next.setDate(next.getDate() + 7);
  }

  return next;
}

// ═══════════════════════════════════════════════
//  RUN SCAN NOW (manual trigger)
// ═══════════════════════════════════════════════

export async function runScanNow(scanId: number): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const [scan] = await database
    .select()
    .from(scheduledScans)
    .where(eq(scheduledScans.id, scanId));

  if (!scan) throw new Error(`Scan ${scanId} not found`);

  await executeScan(scan);
}
