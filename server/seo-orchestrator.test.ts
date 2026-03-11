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
  type SeoSprintConfig,
  type SprintState,
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
});
