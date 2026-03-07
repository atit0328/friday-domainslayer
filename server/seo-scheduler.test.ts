import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db module — chain: db.select().from().where().orderBy()
const mockDbResults: any[] = [];
const mockOrderBy = vi.fn().mockImplementation(() => Promise.resolve(mockDbResults));
const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelectFn = vi.fn().mockReturnValue({ from: mockFrom });

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: () => mockSelectFn(),
  }),
  getScheduledProjects: vi.fn(),
  updateSeoProject: vi.fn(),
  addSeoAction: vi.fn().mockResolvedValue({ id: 1 }),
  updateSeoAction: vi.fn(),
  getLatestRankings: vi.fn().mockResolvedValue([]),
  getSeoProjectById: vi.fn(),
}));

// Mock seo-engine
vi.mock("./seo-engine", () => ({
  generateStrategy: vi.fn().mockResolvedValue({
    aiRecommendation: "Test strategy",
    phases: [{ name: "Phase 1" }],
  }),
  generateSEOContent: vi.fn().mockResolvedValue({
    title: "Test Article",
    content: "Test content",
  }),
}));

// Mock serp-tracker
vi.mock("./serp-tracker", () => ({
  bulkRankCheck: vi.fn().mockResolvedValue({
    totalKeywords: 5,
    top10: 2,
    avgPosition: 15,
    improved: 2,
    declined: 1,
    results: [],
  }),
}));

// Mock pbn-bridge
vi.mock("./pbn-bridge", () => ({
  executePBNBuild: vi.fn().mockResolvedValue({
    totalBuilt: 3,
    totalPlanned: 5,
    links: [],
  }),
}));

// Mock calculateNextRun
vi.mock("./routers/seo-automation", () => ({
  calculateNextRun: vi.fn().mockReturnValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  calculateNextRunMultiDay: vi.fn().mockReturnValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
}));

import { runScheduledJobs, startScheduler, stopScheduler } from "./seo-scheduler";
import { updateSeoProject, addSeoAction } from "./db";

/**
 * Helper: set the data that getScheduledProjects() (via getDb chain) returns
 */
function setScheduledProjects(data: any[]) {
  mockOrderBy.mockResolvedValue(data);
}

describe("SEO Scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain mocks
    mockOrderBy.mockResolvedValue([]);
  });

  describe("runScheduledJobs", () => {
    it("should return empty results when no projects are scheduled", async () => {
      setScheduledProjects([]);

      const result = await runScheduledJobs();

      expect(result.checked).toBe(0);
      expect(result.executed).toBe(0);
      expect(result.results).toEqual([]);
    });

    it("should skip projects that are not due yet", async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      setScheduledProjects([
        {
          id: 1,
          domain: "test.com",
          status: "active",
          nextAutoRunAt: futureDate,
          autoRunDay: 1,
          autoRunHour: 3,
          aggressiveness: 5,
          userId: "user1",
        },
      ]);

      const result = await runScheduledJobs();

      expect(result.checked).toBe(1);
      expect(result.executed).toBe(0);
    });

    it("should skip projects with inactive status", async () => {
      const pastDate = new Date(Date.now() - 1000);
      setScheduledProjects([
        {
          id: 1,
          domain: "test.com",
          status: "paused",
          nextAutoRunAt: pastDate,
          autoRunDay: 1,
          autoRunHour: 3,
          aggressiveness: 5,
          userId: "user1",
        },
      ]);

      const result = await runScheduledJobs();

      expect(result.checked).toBe(1);
      expect(result.executed).toBe(0);
    });

    it("should execute automation for due projects", async () => {
      const pastDate = new Date(Date.now() - 1000);
      setScheduledProjects([
        {
          id: 1,
          domain: "test.com",
          status: "active",
          nextAutoRunAt: pastDate,
          autoRunDay: 1,
          autoRunHour: 3,
          aggressiveness: 5,
          userId: "user1",
          currentDA: 20,
          currentDR: 15,
          currentSpamScore: 10,
          currentBacklinks: 100,
          currentReferringDomains: 50,
          currentTrustFlow: 30,
          currentCitationFlow: 25,
          currentOrganicTraffic: 500,
          currentOrganicKeywords: 50,
          aiHealthScore: 60,
          aiRiskLevel: "medium",
          strategy: "balanced",
          niche: "tech",
          targetKeywords: ["seo tools"],
          totalContentCreated: 5,
          autoRunCount: 2,
        },
      ]);

      const result = await runScheduledJobs();

      expect(result.checked).toBe(1);
      expect(result.executed).toBe(1);
      expect(result.results[0].status).toBe("completed");
      expect(result.results[0].domain).toBe("test.com");

      // New daily engine uses addSeoAction at least once
      expect(addSeoAction).toHaveBeenCalled();

      // Should have updated next run time
      expect(updateSeoProject).toHaveBeenCalled();
    });

    it("should handle errors gracefully and still update next run time", async () => {
      const pastDate = new Date(Date.now() - 1000);
      setScheduledProjects([
        {
          id: 1,
          domain: "error.com",
          status: "active",
          nextAutoRunAt: pastDate,
          autoRunDay: 1,
          autoRunHour: 3,
          aggressiveness: 5,
          userId: "user1",
        },
      ]);

      // Make addSeoAction throw on first call (master action)
      (addSeoAction as any).mockRejectedValueOnce(new Error("DB error"));

      const result = await runScheduledJobs();

      expect(result.checked).toBe(1);
      expect(result.results[0].status).toBe("failed");
      expect(result.results[0].detail).toContain("DB error");

      // Should still update next run time
      expect(updateSeoProject).toHaveBeenCalled();
    });
  });

  describe("startScheduler / stopScheduler", () => {
    it("should start and stop the scheduler without errors", () => {
      startScheduler();
      stopScheduler();
      expect(true).toBe(true);
    });

    it("should not start multiple schedulers", () => {
      startScheduler();
      startScheduler(); // Should be no-op
      stopScheduler();
    });
  });

  describe("calculateNextRun integration", () => {
    it("should use calculateNextRun to set next run time", async () => {
      const pastDate = new Date(Date.now() - 1000);
      setScheduledProjects([
        {
          id: 1,
          domain: "test.com",
          status: "active",
          nextAutoRunAt: pastDate,
          autoRunDay: 3,
          autoRunHour: 10,
          aggressiveness: 5,
          userId: "user1",
          currentDA: 20,
          strategy: "balanced",
          autoRunCount: 0,
        },
      ]);

      await runScheduledJobs();

      const updateCalls = (updateSeoProject as any).mock.calls;
      const nextRunCall = updateCalls.find(
        (c: any[]) => c[1]?.nextAutoRunAt !== undefined
      );
      expect(nextRunCall).toBeDefined();
    });
  });
});
