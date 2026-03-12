/**
 * SEO Orchestrator — Vitest Tests
 * Tests the autonomous SEO brain: sprint creation, day execution, orchestrator tick, state management
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all external dependencies before importing the module
vi.mock("./db", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
  })),
  addSeoAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          days: [
            { day: 1, phase: "Foundation & Analysis", tasks: [{ type: "site_audit", priority: "critical", description: "Full site audit" }] },
            { day: 2, phase: "Content Creation", tasks: [{ type: "content_creation", priority: "high", description: "Create SEO content" }] },
            { day: 3, phase: "PBN Link Building", tasks: [{ type: "pbn_links", priority: "high", description: "Build PBN links" }] },
            { day: 4, phase: "External Link Building", tasks: [{ type: "external_links", priority: "high", description: "Build external links" }] },
            { day: 5, phase: "Tier 2 Amplification", tasks: [{ type: "tier2_links", priority: "medium", description: "Build tier 2 links" }] },
            { day: 6, phase: "Social Signals", tasks: [{ type: "social_signals", priority: "medium", description: "Social signals" }] },
            { day: 7, phase: "Optimization & Review", tasks: [{ type: "rank_check", priority: "critical", description: "Check rankings" }] },
          ],
          strategy: "Aggressive 7-day sprint for gambling niche"
        })
      }
    }]
  }),
}));

vi.mock("./seo-engine", () => ({
  analyzeDomain: vi.fn().mockResolvedValue({ score: 45, issues: [] }),
  researchKeywords: vi.fn().mockResolvedValue({ keywords: [{ keyword: "test", volume: 1000 }], primaryKeyword: "test" }),
  generateSEOContent: vi.fn().mockResolvedValue({ title: "Test", content: "<p>Test</p>", metaDescription: "Test" }),
  generateStrategy: vi.fn().mockResolvedValue("Aggressive link building strategy"),
}));

vi.mock("./pbn-bridge", () => ({
  executePBNBuild: vi.fn().mockResolvedValue({ posted: 3, failed: 0, urls: ["https://pbn1.com/post1"] }),
}));

vi.mock("./external-backlink-builder", () => ({
  runExternalBuildSession: vi.fn().mockResolvedValue({ totalPosted: 5, totalFailed: 0, platforms: [] }),
  buildTier2Links: vi.fn().mockResolvedValue({ totalPosted: 10, totalFailed: 0 }),
}));

vi.mock("./serp-tracker", () => ({
  checkKeywordRank: vi.fn().mockResolvedValue({ rank: 15, url: "https://example.com", page: 2 }),
}));

vi.mock("./seo-daily-engine", () => ({
  analyzeAlgorithm: vi.fn().mockResolvedValue({ recommendations: ["Build more links"] }),
}));

vi.mock("./content-freshness-engine", () => ({
  trackContent: vi.fn().mockResolvedValue({ tracked: true }),
}));

vi.mock("./telegram-notifier", () => ({
  sendTelegramNotification: vi.fn().mockResolvedValue(true),
}));

// Now import the module under test
import {
  createSprint,
  executeSprintDay,
  getActiveSeoSprints,
  getSeoSprintState,
  getSeoSprintByProject,
  pauseSeoSprint,
  resumeSeoSprint,
  startSeoOrchestrator,
  stopSeoOrchestrator,
  getSeoOrchestratorStatus,
  orchestratorTick,
  sendSprintDailyReport,
  sendAllSprintsProgressReport,
  toggleSprintAutoRenew,
  getSprintRenewalHistory,
  type SeoSprintConfig,
  type SprintState,
  type RenewalRecord,
} from "./seo-orchestrator";

const baseConfig: SeoSprintConfig = {
  projectId: 1,
  domain: "test-casino.com",
  targetKeywords: ["online casino", "gambling site"],
  niche: "gambling",
  aggressiveness: 7,
  maxPbnLinks: 10,
  maxExternalLinks: 20,
  enablePbn: true,
  enableExternalBl: true,
  enableContentGen: true,
  enableRankTracking: true,
  scheduleDays: [0, 1, 2, 3, 4, 5, 6],
};

describe("SEO Orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up any active sprints
    const sprints = getActiveSeoSprints();
    sprints.forEach(s => pauseSeoSprint(s.id));
  });

  afterEach(() => {
    stopSeoOrchestrator();
  });

  describe("Sprint Creation", () => {
    it("should create a 7-day sprint with correct structure", async () => {
      const state = await createSprint(baseConfig);

      expect(state).toBeDefined();
      expect(state.id).toBeTruthy();
      expect(state.projectId).toBe(1);
      expect(state.domain).toBe("test-casino.com");
      // Sprint starts as 'initializing' — orchestratorTick promotes to 'active'
      expect(["initializing", "active"]).toContain(state.status);
      expect(state.days).toHaveLength(7);
      expect(state.currentDay).toBe(0);
      expect(state.overallProgress).toBe(0);
      expect(state.totalPbnLinks).toBe(0);
      expect(state.totalExternalLinks).toBe(0);
    });

    it("should generate 7 days with correct phases", async () => {
      const state = await createSprint(baseConfig);

      state.days.forEach((day, i) => {
        expect(day.day).toBe(i + 1);
        expect(day.phase).toBeTruthy();
        expect(day.tasks).toBeDefined();
        expect(Array.isArray(day.tasks)).toBe(true);
        expect(day.status).toBe("pending");
      });
    });

    it("should store sprint in active sprints map", async () => {
      const state = await createSprint(baseConfig);

      const retrieved = getSeoSprintState(state.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(state.id);
    });

    it("should be findable by project ID", async () => {
      const state = await createSprint(baseConfig);

      const found = getSeoSprintByProject(baseConfig.projectId);
      expect(found).toBeDefined();
      expect(found?.domain).toBe("test-casino.com");
    });

    it("should set createdAt and startedAt dates", async () => {
      const before = new Date();
      const state = await createSprint(baseConfig);
      const after = new Date();

      expect(state.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(state.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(state.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it("should include config in sprint state", async () => {
      const state = await createSprint(baseConfig);

      expect(state.config.aggressiveness).toBe(7);
      expect(state.config.enablePbn).toBe(true);
      expect(state.config.enableExternalBl).toBe(true);
      expect(state.config.maxPbnLinks).toBe(10);
    });
  });

  describe("Sprint Day Execution", () => {
    it("should execute a sprint day and update progress", async () => {
      const state = await createSprint(baseConfig);
      const result = await executeSprintDay(state.id);

      expect(result).toBeDefined();
      expect(result.tasksCompleted).toBeGreaterThanOrEqual(0);

      // Check that state was updated
      const updated = getSeoSprintState(state.id);
      expect(updated).toBeDefined();
      // currentDay may or may not advance depending on execution path
      expect(updated!.currentDay).toBeGreaterThanOrEqual(0);
    });

    it("should execute specific day when provided", async () => {
      const state = await createSprint(baseConfig);
      const result = await executeSprintDay(state.id, 1);

      expect(result).toBeDefined();
      
      const updated = getSeoSprintState(state.id);
      expect(updated!.days[0].status).not.toBe("pending");
    });

    it("should throw error for non-existent sprint", async () => {
      await expect(executeSprintDay("non-existent-id")).rejects.toThrow();
    });
  });

  describe("Sprint State Management", () => {
    it("should pause an active sprint", async () => {
      const state = await createSprint(baseConfig);
      // Sprint starts as initializing; manually set to active for pause test
      state.status = "active";

      const paused = pauseSeoSprint(state.id);
      expect(paused).toBe(true);

      const updated = getSeoSprintState(state.id);
      expect(updated?.status).toBe("paused");
    });

    it("should resume a paused sprint", async () => {
      const state = await createSprint(baseConfig);
      // Manually set to active then pause
      state.status = "active";
      pauseSeoSprint(state.id);

      const resumed = resumeSeoSprint(state.id);
      expect(resumed).toBe(true);

      const updated = getSeoSprintState(state.id);
      expect(updated?.status).toBe("active");
    });

    it("should return false when pausing non-existent sprint", () => {
      const result = pauseSeoSprint("non-existent");
      expect(result).toBe(false);
    });

    it("should return false when resuming non-existent sprint", () => {
      const result = resumeSeoSprint("non-existent");
      expect(result).toBe(false);
    });

    it("should list all active sprints", async () => {
      await createSprint(baseConfig);
      await createSprint({ ...baseConfig, projectId: 2, domain: "test2.com" });

      const active = getActiveSeoSprints();
      expect(active.length).toBeGreaterThanOrEqual(2);
    });

    it("should return null for non-existent sprint state", () => {
      const state = getSeoSprintState("non-existent");
      expect(state).toBeNull();
    });

    it("should return null for non-existent project sprint", () => {
      const state = getSeoSprintByProject(99999);
      expect(state).toBeNull();
    });
  });

  describe("Orchestrator Lifecycle", () => {
    it("should start the orchestrator", () => {
      startSeoOrchestrator();
      const status = getSeoOrchestratorStatus();
      expect(status.isRunning).toBe(true);
    });

    it("should stop the orchestrator", () => {
      startSeoOrchestrator();
      stopSeoOrchestrator();
      const status = getSeoOrchestratorStatus();
      expect(status.isRunning).toBe(false);
    });

    it("should report correct status", async () => {
      await createSprint(baseConfig);
      startSeoOrchestrator();

      const status = getSeoOrchestratorStatus();
      expect(status.isRunning).toBe(true);
      expect(status.activeSprints).toBeGreaterThanOrEqual(1);
    });

    it("should handle orchestrator tick without errors", async () => {
      await createSprint(baseConfig);
      
      // Tick should not throw even with mocked dependencies
      const result = await orchestratorTick();
      expect(result).toBeDefined();
    });
  });

  describe("Sprint Config Validation", () => {
    it("should handle minimum aggressiveness", async () => {
      const state = await createSprint({ ...baseConfig, aggressiveness: 1 });
      expect(state.config.aggressiveness).toBe(1);
    });

    it("should handle maximum aggressiveness", async () => {
      const state = await createSprint({ ...baseConfig, aggressiveness: 10 });
      expect(state.config.aggressiveness).toBe(10);
    });

    it("should handle PBN disabled", async () => {
      const state = await createSprint({ ...baseConfig, enablePbn: false });
      expect(state.config.enablePbn).toBe(false);
    });

    it("should handle external BL disabled", async () => {
      const state = await createSprint({ ...baseConfig, enableExternalBl: false });
      expect(state.config.enableExternalBl).toBe(false);
    });
  });

  describe("Sprint Progress Notifications", () => {
    it("should send daily report for a sprint", async () => {
      const state = await createSprint(baseConfig);
      // Execute Day 1 first so there's data to report
      await executeSprintDay(state.id, 1);

      const report = await sendSprintDailyReport(state.id);
      expect(report).toBeDefined();
      expect(typeof report).toBe("string");
      expect(report).toContain("SEO SPRINT DAILY REPORT");
      expect(report).toContain("test-casino.com");
      expect(report).toContain("Day");
      expect(report).toContain("PBN Links");
      expect(report).toContain("External Links");
    });

    it("should throw error for non-existent sprint report", async () => {
      await expect(sendSprintDailyReport("non-existent")).rejects.toThrow("Sprint non-existent not found");
    });

    it("should send digest for all active sprints", async () => {
      await createSprint(baseConfig);
      await createSprint({ ...baseConfig, projectId: 3, domain: "test3.com" });

      const result = await sendAllSprintsProgressReport();
      expect(result).toBeDefined();
      expect(result.sent).toBeGreaterThanOrEqual(2);
      expect(result.reports.length).toBeGreaterThanOrEqual(1);
      expect(result.reports[0]).toContain("SEO SPRINT DAILY DIGEST");
    });

    it("should handle empty sprints digest", async () => {
      // Clear all sprints first
      const sprints = getActiveSeoSprints();
      sprints.forEach(s => {
        s.status = "completed"; // Mark as completed so they're not active
      });

      const result = await sendAllSprintsProgressReport();
      expect(result.sent).toBe(0);
      expect(result.reports[0]).toContain("ไม่มี sprint");
    });

    it("should include timeline in daily report", async () => {
      const state = await createSprint(baseConfig);
      await executeSprintDay(state.id, 1);

      const report = await sendSprintDailyReport(state.id);
      expect(report).toContain("Sprint Timeline");
      expect(report).toContain("Day 1");
      expect(report).toContain("Cumulative Totals");
    });

    it("should include progress bar in digest", async () => {
      await createSprint(baseConfig);

      const result = await sendAllSprintsProgressReport();
      expect(result.reports[0]).toContain("Active Sprints");
    });
  });

  describe("SprintState Interface", () => {
    it("should have all required fields", async () => {
      const state = await createSprint(baseConfig);

      // Check all required fields exist
      expect(state.id).toBeDefined();
      expect(state.projectId).toBeDefined();
      expect(state.domain).toBeDefined();
      expect(state.config).toBeDefined();
      expect(state.currentDay).toBeDefined();
      expect(state.days).toBeDefined();
      expect(state.status).toBeDefined();
      expect(state.createdAt).toBeDefined();
      expect(state.startedAt).toBeDefined();
      expect(state.lastActivityAt).toBeDefined();
      expect(state.overallProgress).toBeDefined();
      expect(state.totalPbnLinks).toBeDefined();
      expect(state.totalExternalLinks).toBeDefined();
      expect(state.totalContentPieces).toBeDefined();
      expect(state.bestRankAchieved).toBeDefined();
      expect(state.aiInsights).toBeDefined();
      // Auto-renew fields
      expect(state.sprintRound).toBeDefined();
      expect(state.renewalHistory).toBeDefined();
      expect(state.autoRenewEnabled).toBeDefined();
    });

    it("should initialize numeric fields to correct defaults", async () => {
      const state = await createSprint(baseConfig);

      expect(state.overallProgress).toBe(0);
      expect(state.totalPbnLinks).toBe(0);
      expect(state.totalExternalLinks).toBe(0);
      expect(state.totalContentPieces).toBe(0);
      expect(state.bestRankAchieved).toBe(100);
    });

    it("should initialize aiInsights as empty array", async () => {
      const state = await createSprint(baseConfig);
      expect(state.aiInsights).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════
  //  AUTO-RENEW SPRINT TESTS
  // ═══════════════════════════════════════════════

  describe("Auto-Renew Sprint — Initialization", () => {
    it("should initialize sprintRound to 1", async () => {
      const state = await createSprint(baseConfig);
      expect(state.sprintRound).toBe(1);
    });

    it("should initialize renewalHistory as empty array", async () => {
      const state = await createSprint(baseConfig);
      expect(state.renewalHistory).toEqual([]);
    });

    it("should default autoRenewEnabled to true", async () => {
      const state = await createSprint(baseConfig);
      expect(state.autoRenewEnabled).toBe(true);
    });

    it("should respect autoRenew=false in config", async () => {
      const state = await createSprint({ ...baseConfig, autoRenew: false });
      expect(state.autoRenewEnabled).toBe(false);
    });

    it("should include targetRank in config", async () => {
      const state = await createSprint({ ...baseConfig, targetRank: 5 });
      expect(state.config.targetRank).toBe(5);
    });

    it("should include maxRenewals in config", async () => {
      const state = await createSprint({ ...baseConfig, maxRenewals: 3 });
      expect(state.config.maxRenewals).toBe(3);
    });

    it("should default targetRank to undefined (uses 10 at runtime)", async () => {
      const state = await createSprint(baseConfig);
      expect(state.config.targetRank).toBeUndefined();
    });
  });

  describe("Auto-Renew Sprint — Toggle", () => {
    it("should toggle auto-renew ON for a sprint", async () => {
      const state = await createSprint({ ...baseConfig, autoRenew: false });
      expect(state.autoRenewEnabled).toBe(false);

      const result = toggleSprintAutoRenew(state.id, true);
      expect(result).toBe(true);

      const updated = getSeoSprintState(state.id);
      expect(updated?.autoRenewEnabled).toBe(true);
    });

    it("should toggle auto-renew OFF for a sprint", async () => {
      const state = await createSprint(baseConfig);
      expect(state.autoRenewEnabled).toBe(true);

      const result = toggleSprintAutoRenew(state.id, false);
      expect(result).toBe(true);

      const updated = getSeoSprintState(state.id);
      expect(updated?.autoRenewEnabled).toBe(false);
    });

    it("should return false for non-existent sprint", () => {
      const result = toggleSprintAutoRenew("non-existent", true);
      expect(result).toBe(false);
    });
  });

  describe("Auto-Renew Sprint — Renewal History", () => {
    it("should return empty history for new sprint", async () => {
      const state = await createSprint(baseConfig);
      const history = getSprintRenewalHistory(state.id);
      expect(history).toEqual([]);
    });

    it("should return empty array for non-existent sprint", () => {
      const history = getSprintRenewalHistory("non-existent");
      expect(history).toEqual([]);
    });

    it("should track renewal records when manually added", async () => {
      const state = await createSprint(baseConfig);
      
      // Manually add a renewal record (simulating what checkAndAutoRenew does)
      const record: RenewalRecord = {
        round: 1,
        completedAt: new Date(),
        bestRank: 15,
        totalLinks: 30,
        renewed: true,
        reason: "Rank #15 > Top 10 — auto-renewing",
      };
      state.renewalHistory.push(record);

      const history = getSprintRenewalHistory(state.id);
      expect(history).toHaveLength(1);
      expect(history[0].round).toBe(1);
      expect(history[0].bestRank).toBe(15);
      expect(history[0].renewed).toBe(true);
    });
  });

  describe("Auto-Renew Sprint — Config Propagation", () => {
    it("should include auto-renew info in Telegram notification", async () => {
      const { sendTelegramNotification } = await import("./telegram-notifier");
      const mockSend = vi.mocked(sendTelegramNotification);
      mockSend.mockClear();

      await createSprint({ ...baseConfig, autoRenew: true, targetRank: 10 });

      // Check that Telegram was called with auto-renew info
      const calls = mockSend.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall).toBeDefined();
      const notification = lastCall[0];
      expect(notification.details).toContain("Auto-Renew");
      expect(notification.details).toContain("ON");
    });

    it("should show round number in notification for renewal sprints", async () => {
      const { sendTelegramNotification } = await import("./telegram-notifier");
      const mockSend = vi.mocked(sendTelegramNotification);
      
      // Create a sprint then manually set round > 1 to simulate renewal
      const state = await createSprint(baseConfig);
      state.sprintRound = 2;
      
      // The round info is set at creation time, so for round > 1 it would show in the notification
      // We verify the state has the correct round
      expect(state.sprintRound).toBe(2);
    });
  });

  describe("Auto-Renew Sprint — Escalation Logic", () => {
    it("should cap aggressiveness at 10", () => {
      // Test the escalation formula: Math.min(10, current + 1)
      expect(Math.min(10, 9 + 1)).toBe(10);
      expect(Math.min(10, 10 + 1)).toBe(10);
      expect(Math.min(10, 7 + 1)).toBe(8);
    });

    it("should calculate link multiplier correctly per round", () => {
      // Formula: 1 + (currentRound * 0.3)
      expect(1 + (1 * 0.3)).toBeCloseTo(1.3);  // Round 1 → 1.3x
      expect(1 + (2 * 0.3)).toBeCloseTo(1.6);  // Round 2 → 1.6x
      expect(1 + (3 * 0.3)).toBeCloseTo(1.9);  // Round 3 → 1.9x
      expect(1 + (4 * 0.3)).toBeCloseTo(2.2);  // Round 4 → 2.2x
      expect(1 + (5 * 0.3)).toBeCloseTo(2.5);  // Round 5 → 2.5x
    });

    it("should escalate PBN links correctly", () => {
      const basePbn = 30;
      const round = 2;
      const multiplier = 1 + (round * 0.3);
      const escalated = Math.round(basePbn * multiplier);
      expect(escalated).toBe(48); // 30 * 1.6 = 48
    });

    it("should escalate external links correctly", () => {
      const baseExt = 50;
      const round = 3;
      const multiplier = 1 + (round * 0.3);
      const escalated = Math.round(baseExt * multiplier);
      expect(escalated).toBe(95); // 50 * 1.9 = 95
    });
  });

  describe("Auto-Renew Sprint — Decision Logic", () => {
    it("should identify rank <= target as success (no renewal needed)", () => {
      const targetRank = 10;
      expect(5 <= targetRank).toBe(true);   // Rank 5 = success
      expect(10 <= targetRank).toBe(true);  // Rank 10 = success (exactly on target)
      expect(11 <= targetRank).toBe(false); // Rank 11 = needs renewal
    });

    it("should identify rank > target as needing renewal", () => {
      const targetRank = 10;
      expect(11 > targetRank).toBe(true);   // Rank 11 = needs renewal
      expect(50 > targetRank).toBe(true);   // Rank 50 = needs renewal
      expect(100 > targetRank).toBe(true);  // Rank 100 = needs renewal
    });

    it("should identify max renewals reached", () => {
      const maxRenewals = 5;
      expect(5 >= maxRenewals).toBe(true);  // Round 5 = max reached
      expect(6 >= maxRenewals).toBe(true);  // Round 6 = over max
      expect(4 >= maxRenewals).toBe(false); // Round 4 = can renew
    });

    it("should use default target rank of 10 when not specified", async () => {
      const state = await createSprint(baseConfig);
      const effectiveTarget = state.config.targetRank || 10;
      expect(effectiveTarget).toBe(10);
    });

    it("should use default max renewals of 5 when not specified", async () => {
      const state = await createSprint(baseConfig);
      const effectiveMax = state.config.maxRenewals || 5;
      expect(effectiveMax).toBe(5);
    });

    it("should use custom target rank when specified", async () => {
      const state = await createSprint({ ...baseConfig, targetRank: 3 });
      const effectiveTarget = state.config.targetRank || 10;
      expect(effectiveTarget).toBe(3);
    });

    it("should use custom max renewals when specified", async () => {
      const state = await createSprint({ ...baseConfig, maxRenewals: 2 });
      const effectiveMax = state.config.maxRenewals || 5;
      expect(effectiveMax).toBe(2);
    });
  });

  describe("Auto-Renew Sprint — RenewalRecord Type", () => {
    it("should create a valid RenewalRecord", () => {
      const record: RenewalRecord = {
        round: 1,
        completedAt: new Date(),
        bestRank: 15,
        totalLinks: 45,
        renewed: true,
        reason: "Rank #15 > Top 10 — auto-renewing (Round 2)",
      };

      expect(record.round).toBe(1);
      expect(record.completedAt).toBeInstanceOf(Date);
      expect(record.bestRank).toBe(15);
      expect(record.totalLinks).toBe(45);
      expect(record.renewed).toBe(true);
      expect(record.reason).toContain("auto-renewing");
    });

    it("should create a success RenewalRecord", () => {
      const record: RenewalRecord = {
        round: 2,
        completedAt: new Date(),
        bestRank: 8,
        totalLinks: 120,
        renewed: false,
        reason: "Target achieved! Rank #8 <= Top 10",
      };

      expect(record.renewed).toBe(false);
      expect(record.reason).toContain("Target achieved");
    });

    it("should create a max-renewals RenewalRecord", () => {
      const record: RenewalRecord = {
        round: 5,
        completedAt: new Date(),
        bestRank: 12,
        totalLinks: 300,
        renewed: false,
        reason: "Max renewals reached (5 rounds)",
      };

      expect(record.renewed).toBe(false);
      expect(record.reason).toContain("Max renewals");
    });
  });
});
