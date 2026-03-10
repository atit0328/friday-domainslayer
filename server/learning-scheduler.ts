/**
 * Learning Scheduler — Periodic Adaptive Learning Cycle Runner
 *
 * Runs the adaptive learning cycle periodically to:
 *   1. Aggregate attack outcome logs into learned_patterns
 *   2. Rebuild CMS attack profiles from historical data
 *   3. Evolve new strategies from failure/success patterns
 *   4. Log results and send Telegram notification on significant changes
 *
 * Features:
 *   - Configurable interval (default 2h, adjustable via updateLearningInterval)
 *   - Incremental learning: auto-trigger after every N attacks
 *   - Enhanced cycle includes strategy evolution
 */
import { runLearningCycle, runEnhancedLearningCycle, getAdaptiveLearningStats } from "./adaptive-learning";
import { sendTelegramNotification } from "./telegram-notifier";

// ═══════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════

/** Default: Run learning cycle every 1 hour for faster adaptation */
let currentIntervalMs = 1 * 60 * 60 * 1000; // 1 hour

/** Minimum outcomes needed before running a learning cycle */
const MIN_OUTCOMES_FOR_CYCLE = 3;

/** Notify via Telegram when patterns change significantly */
const NOTIFY_ON_SIGNIFICANT_CHANGE = true;

/** Threshold: notify if more than N patterns were updated */
const SIGNIFICANT_PATTERN_THRESHOLD = 5;

/** Incremental learning: trigger after every N attack outcomes (lowered for faster adaptation) */
const INCREMENTAL_TRIGGER_EVERY_N = 5;

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastRunAt: Date | null = null;
let lastResult: { patternsUpdated: number; profilesUpdated: number; strategiesEvolved?: number } | null = null;
let totalCyclesRun = 0;
let totalCyclesFailed = 0;
let consecutiveFailures = 0;
let attacksSinceLastLearn = 0;

// ═══════════════════════════════════════════════
//  CORE CYCLE
// ═══════════════════════════════════════════════

/**
 * Execute one learning cycle — aggregate patterns + rebuild profiles + evolve strategies
 */
export async function executeLearningCycle(): Promise<{
  success: boolean;
  patternsUpdated: number;
  profilesUpdated: number;
  strategiesEvolved: number;
  durationMs: number;
  skipped: boolean;
  skipReason?: string;
}> {
  if (isRunning) {
    console.log("[Learning Scheduler] ⏭ Cycle already running, skipping...");
    return { success: true, patternsUpdated: 0, profilesUpdated: 0, strategiesEvolved: 0, durationMs: 0, skipped: true, skipReason: "already_running" };
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
        strategiesEvolved: 0,
        durationMs: Date.now() - startTime,
        skipped: true,
        skipReason: `insufficient_data (${stats.totalOutcomesRecorded}/${MIN_OUTCOMES_FOR_CYCLE})`,
      };
    }

    console.log(`[Learning Scheduler] 🧠 Starting learning cycle #${totalCyclesRun + 1}...`);
    console.log(`[Learning Scheduler]   Total outcomes: ${stats.totalOutcomesRecorded} | Success rate: ${stats.overallSuccessRate.toFixed(1)}%`);

    // Run the enhanced learning cycle (includes strategy evolution)
    const result = await runEnhancedLearningCycle();
    const durationMs = Date.now() - startTime;

    // Update state
    lastRunAt = new Date();
    lastResult = result;
    totalCyclesRun++;
    consecutiveFailures = 0;
    attacksSinceLastLearn = 0; // Reset incremental counter

    console.log(`[Learning Scheduler] ✅ Cycle #${totalCyclesRun} complete in ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`[Learning Scheduler]   Patterns: ${result.patternsUpdated} | Profiles: ${result.profilesUpdated} | Strategies: ${result.strategiesEvolved}`);

    // Send Telegram notification for significant changes
    if (NOTIFY_ON_SIGNIFICANT_CHANGE && (result.patternsUpdated >= SIGNIFICANT_PATTERN_THRESHOLD || result.profilesUpdated >= 3 || result.strategiesEvolved > 0)) {
      try {
        await sendTelegramNotification({
          type: "info",
          targetUrl: "adaptive-learning",
          details:
            `🧠 Adaptive Learning Cycle #${totalCyclesRun}\n\n` +
            `📊 Patterns updated: ${result.patternsUpdated}\n` +
            `🎯 CMS profiles updated: ${result.profilesUpdated}\n` +
            `🧬 Strategies evolved: ${result.strategiesEvolved}\n` +
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

    if (consecutiveFailures >= 3) {
      console.error(`[Learning Scheduler] ⚠️ ${consecutiveFailures} consecutive failures — check DB connection and adaptive-learning module`);
    }

    return { success: false, patternsUpdated: 0, profilesUpdated: 0, strategiesEvolved: 0, durationMs, skipped: false };
  } finally {
    isRunning = false;
  }
}

// ═══════════════════════════════════════════════
//  INCREMENTAL LEARNING
// ═══════════════════════════════════════════════

/**
 * Notify the scheduler that an attack just completed.
 * After every N attacks, auto-trigger a learning cycle.
 */
export function notifyAttackCompleted() {
  attacksSinceLastLearn++;
  if (attacksSinceLastLearn >= INCREMENTAL_TRIGGER_EVERY_N) {
    console.log(`[Learning Scheduler] 🔄 ${attacksSinceLastLearn} attacks since last learn — triggering incremental learning...`);
    executeLearningCycle().catch(err =>
      console.error("[Learning Scheduler] Incremental learning error:", (err as Error).message)
    );
  }
}

// ═══════════════════════════════════════════════
//  SCHEDULER LIFECYCLE
// ═══════════════════════════════════════════════

/**
 * Start the learning scheduler — runs every 2 hours by default
 * First run is delayed 3 minutes after server start
 */
export function startLearningScheduler() {
  if (schedulerTimer) {
    console.log("[Learning Scheduler] Already running, ignoring duplicate start");
    return;
  }

  console.log(`[Learning Scheduler] 🚀 Started — learning cycle every ${currentIntervalMs / (60 * 60 * 1000)}h`);

  // Delay first run by 3 minutes to let server fully initialize
  const INITIAL_DELAY_MS = 3 * 60 * 1000;
  setTimeout(() => {
    console.log("[Learning Scheduler] Running initial learning cycle...");
    executeLearningCycle().catch(err =>
      console.error("[Learning Scheduler] Error on initial run:", (err as Error).message)
    );
  }, INITIAL_DELAY_MS);

  // Then run at configured interval
  schedulerTimer = setInterval(() => {
    executeLearningCycle().catch(err =>
      console.error("[Learning Scheduler] Error on scheduled run:", (err as Error).message)
    );
  }, currentIntervalMs);
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
 * Update the learning interval (in hours) and restart the scheduler
 */
export function updateLearningInterval(hours: number) {
  const newIntervalMs = hours * 60 * 60 * 1000;
  const wasRunning = schedulerTimer !== null;

  console.log(`[Learning Scheduler] ⚙️ Updating interval: ${currentIntervalMs / (60 * 60 * 1000)}h → ${hours}h`);
  currentIntervalMs = newIntervalMs;

  if (wasRunning) {
    stopLearningScheduler();
    // Restart with new interval (no initial delay since we're just changing interval)
    schedulerTimer = setInterval(() => {
      executeLearningCycle().catch(err =>
        console.error("[Learning Scheduler] Error on scheduled run:", (err as Error).message)
      );
    }, currentIntervalMs);
    console.log(`[Learning Scheduler] 🔄 Restarted with ${hours}h interval`);
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
    intervalMs: currentIntervalMs,
    intervalHuman: `${currentIntervalMs / (60 * 60 * 1000)}h`,
    minOutcomesForCycle: MIN_OUTCOMES_FOR_CYCLE,
    attacksSinceLastLearn,
    incrementalTriggerEvery: INCREMENTAL_TRIGGER_EVERY_N,
  };
}
