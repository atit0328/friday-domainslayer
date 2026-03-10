/**
 * Learning Scheduler — Vitest Tests
 *
 * Tests the scheduled learning cycle:
 *   1. executeLearningCycle — runs a full cycle and returns results
 *   2. startLearningScheduler / stopLearningScheduler — lifecycle management
 *   3. getLearningSchedulerStatus — status reporting
 *   4. Edge cases — insufficient data, concurrent runs, failures
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock adaptive-learning ───
vi.mock("./adaptive-learning", () => ({
  runLearningCycle: vi.fn().mockResolvedValue({
    patternsUpdated: 10,
    profilesUpdated: 3,
  }),
  getAdaptiveLearningStats: vi.fn().mockResolvedValue({
    totalOutcomesRecorded: 50,
    totalSuccesses: 20,
    totalFailures: 30,
    overallSuccessRate: 40.0,
    totalLearnedPatterns: 15,
    totalCmsProfiles: 5,
    topMethods: [],
    recentTrend: {
      last24h: { attempts: 10, successes: 4, rate: 40 },
      last7d: { attempts: 30, successes: 12, rate: 40 },
      last30d: { attempts: 50, successes: 20, rate: 40 },
    },
    mostAttackedCms: [],
  }),
}));

// ─── Mock telegram-notifier ───
vi.mock("./telegram-notifier", () => ({
  sendTelegramNotification: vi.fn().mockResolvedValue({ success: true }),
}));

// ─── Import module under test (AFTER mocks) ───
import {
  executeLearningCycle,
  startLearningScheduler,
  stopLearningScheduler,
  getLearningSchedulerStatus,
} from "./learning-scheduler";
import { runLearningCycle, getAdaptiveLearningStats } from "./adaptive-learning";
import { sendTelegramNotification } from "./telegram-notifier";

describe("Learning Scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset scheduler state by stopping it
    stopLearningScheduler();
    // Use fake timers for scheduler tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopLearningScheduler();
    vi.useRealTimers();
  });

  describe("executeLearningCycle", () => {
    it("should run a learning cycle and return results", async () => {
      const result = await executeLearningCycle();

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.patternsUpdated).toBe(10);
      expect(result.profilesUpdated).toBe(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should call getAdaptiveLearningStats to check data sufficiency", async () => {
      await executeLearningCycle();
      expect(getAdaptiveLearningStats).toHaveBeenCalled();
    });

    it("should call runLearningCycle when enough data exists", async () => {
      await executeLearningCycle();
      expect(runLearningCycle).toHaveBeenCalled();
    });

    it("should skip when insufficient data", async () => {
      (getAdaptiveLearningStats as any).mockResolvedValueOnce({
        totalOutcomesRecorded: 1, // Less than MIN_OUTCOMES_FOR_CYCLE (3)
        totalSuccesses: 0,
        totalFailures: 1,
        overallSuccessRate: 0,
        totalLearnedPatterns: 0,
        totalCmsProfiles: 0,
        topMethods: [],
        recentTrend: {
          last24h: { attempts: 1, successes: 0, rate: 0 },
          last7d: { attempts: 1, successes: 0, rate: 0 },
          last30d: { attempts: 1, successes: 0, rate: 0 },
        },
        mostAttackedCms: [],
      });

      const result = await executeLearningCycle();

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain("insufficient_data");
      expect(runLearningCycle).not.toHaveBeenCalled();
    });

    it("should send Telegram notification for significant changes", async () => {
      await executeLearningCycle();

      // 10 patterns updated >= 5 threshold, so notification should be sent
      expect(sendTelegramNotification).toHaveBeenCalled();
    });

    it("should NOT send Telegram for minor changes", async () => {
      (runLearningCycle as any).mockResolvedValueOnce({
        patternsUpdated: 2, // Below threshold of 5
        profilesUpdated: 1, // Below threshold of 3
      });

      await executeLearningCycle();

      expect(sendTelegramNotification).not.toHaveBeenCalled();
    });

    it("should handle runLearningCycle failure gracefully", async () => {
      (runLearningCycle as any).mockRejectedValueOnce(new Error("DB connection failed"));

      const result = await executeLearningCycle();

      expect(result.success).toBe(false);
      expect(result.patternsUpdated).toBe(0);
      expect(result.profilesUpdated).toBe(0);
    });

    it("should handle Telegram notification failure gracefully", async () => {
      (sendTelegramNotification as any).mockRejectedValueOnce(new Error("Telegram API down"));

      // Should not throw even if notification fails
      const result = await executeLearningCycle();
      expect(result.success).toBe(true);
    });
  });

  describe("getLearningSchedulerStatus", () => {
    it("should return scheduler status when not started", () => {
      const status = getLearningSchedulerStatus();

      expect(status.isActive).toBe(false);
      expect(status.isRunning).toBe(false);
      expect(status.totalCyclesRun).toBeGreaterThanOrEqual(0);
      expect(typeof status.intervalMs).toBe("number");
      expect(typeof status.intervalHuman).toBe("string");
      expect(typeof status.minOutcomesForCycle).toBe("number");
    });

    it("should show isActive=true after starting", () => {
      startLearningScheduler();
      const status = getLearningSchedulerStatus();
      expect(status.isActive).toBe(true);
    });

    it("should show isActive=false after stopping", () => {
      startLearningScheduler();
      stopLearningScheduler();
      const status = getLearningSchedulerStatus();
      expect(status.isActive).toBe(false);
    });
  });

  describe("startLearningScheduler / stopLearningScheduler", () => {
    it("should not create duplicate schedulers on double start", () => {
      startLearningScheduler();
      startLearningScheduler(); // Should be ignored
      const status = getLearningSchedulerStatus();
      expect(status.isActive).toBe(true);
    });

    it("should safely handle stop when not started", () => {
      // Should not throw
      expect(() => stopLearningScheduler()).not.toThrow();
    });

    it("should run initial cycle after 5 minute delay", async () => {
      startLearningScheduler();

      // Advance past the 5 minute initial delay
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);

      expect(getAdaptiveLearningStats).toHaveBeenCalled();
    });
  });
});
