/**
 * Tests for SEO Daily Engine, Timeline Estimator, and Daily Router
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══ Timeline Estimator Tests (pure functions — no mocking needed) ═══
import { estimateKeywordTimeline } from "./seo-timeline-estimator";

describe("SEO Timeline Estimator", () => {
  describe("estimateKeywordTimeline", () => {
    it("should return a valid KeywordTimeline structure", () => {
      const result = estimateKeywordTimeline({
        keyword: "คาสิโนออนไลน์",
        searchVolume: 50000,
        currentPosition: null,
        currentDA: 10,
        niche: "gambling",
        strategy: "grey_hat",
        aggressiveness: 5,
      });

      expect(result).toHaveProperty("keyword", "คาสิโนออนไลน์");
      expect(result).toHaveProperty("difficulty");
      expect(result).toHaveProperty("estimatedDays");
      expect(result).toHaveProperty("estimatedRange");
      expect(result).toHaveProperty("confidence");
      expect(result).toHaveProperty("factors");
      expect(result).toHaveProperty("milestones");
      expect(result).toHaveProperty("requiredActions");
      expect(result).toHaveProperty("aiExplanation");
      expect(result.estimatedDays).toBeGreaterThanOrEqual(7);
      expect(result.estimatedRange.min).toBeLessThanOrEqual(result.estimatedDays);
      expect(result.estimatedRange.max).toBeGreaterThanOrEqual(result.estimatedDays);
    });

    it("should rate gambling keywords as very_hard or extreme", () => {
      const result = estimateKeywordTimeline({
        keyword: "แทงบอลออนไลน์",
        searchVolume: 100000,
        currentPosition: null,
        currentDA: 5,
        niche: "gambling",
        strategy: "grey_hat",
        aggressiveness: 5,
      });

      expect(["very_hard", "extreme"]).toContain(result.difficulty);
    });

    it("should estimate fewer days for keywords already close to page 1", () => {
      const farAway = estimateKeywordTimeline({
        keyword: "test keyword",
        searchVolume: 1000,
        currentPosition: null,
        currentDA: 20,
        niche: "gambling",
        strategy: "grey_hat",
        aggressiveness: 5,
      });

      const closeToPage1 = estimateKeywordTimeline({
        keyword: "test keyword",
        searchVolume: 1000,
        currentPosition: 15,
        currentDA: 20,
        niche: "gambling",
        strategy: "grey_hat",
        aggressiveness: 5,
      });

      expect(closeToPage1.estimatedDays).toBeLessThan(farAway.estimatedDays);
    });

    it("should estimate fewer days for black_hat strategy", () => {
      const greyHat = estimateKeywordTimeline({
        keyword: "test keyword",
        searchVolume: 5000,
        currentPosition: 50,
        currentDA: 15,
        niche: "gambling",
        strategy: "grey_hat",
        aggressiveness: 5,
      });

      const blackHat = estimateKeywordTimeline({
        keyword: "test keyword",
        searchVolume: 5000,
        currentPosition: 50,
        currentDA: 15,
        niche: "gambling",
        strategy: "black_hat",
        aggressiveness: 5,
      });

      expect(blackHat.estimatedDays).toBeLessThan(greyHat.estimatedDays);
    });

    it("should estimate fewer days for higher DA", () => {
      const lowDA = estimateKeywordTimeline({
        keyword: "test keyword",
        searchVolume: 5000,
        currentPosition: 50,
        currentDA: 5,
        niche: "gambling",
        strategy: "grey_hat",
        aggressiveness: 5,
      });

      const highDA = estimateKeywordTimeline({
        keyword: "test keyword",
        searchVolume: 5000,
        currentPosition: 50,
        currentDA: 45,
        niche: "gambling",
        strategy: "grey_hat",
        aggressiveness: 5,
      });

      expect(highDA.estimatedDays).toBeLessThan(lowDA.estimatedDays);
    });

    it("should include blackhat actions for gambling niche", () => {
      const result = estimateKeywordTimeline({
        keyword: "คาสิโน",
        searchVolume: 10000,
        currentPosition: null,
        currentDA: 10,
        niche: "casino gambling",
        strategy: "grey_hat",
        aggressiveness: 5,
      });

      const blackhatActions = result.requiredActions.filter(a => a.category === "blackhat");
      expect(blackhatActions.length).toBeGreaterThan(0);
    });

    it("should generate milestones", () => {
      const result = estimateKeywordTimeline({
        keyword: "test",
        searchVolume: 5000,
        currentPosition: null,
        currentDA: 10,
        niche: "gambling",
        strategy: "grey_hat",
        aggressiveness: 5,
      });

      expect(result.milestones.length).toBeGreaterThan(0);
      // Last milestone should be page 1
      const lastMilestone = result.milestones[result.milestones.length - 1];
      expect(lastMilestone.expectedPosition).toBe(10);
    });

    it("should have higher aggressiveness reduce estimated days", () => {
      const low = estimateKeywordTimeline({
        keyword: "test",
        searchVolume: 5000,
        currentPosition: 50,
        currentDA: 15,
        niche: "gambling",
        strategy: "grey_hat",
        aggressiveness: 2,
      });

      const high = estimateKeywordTimeline({
        keyword: "test",
        searchVolume: 5000,
        currentPosition: 50,
        currentDA: 15,
        niche: "gambling",
        strategy: "grey_hat",
        aggressiveness: 9,
      });

      expect(high.estimatedDays).toBeLessThan(low.estimatedDays);
    });

    it("should include factors with impact assessment", () => {
      const result = estimateKeywordTimeline({
        keyword: "test",
        searchVolume: 5000,
        currentPosition: 15,
        currentDA: 35,
        niche: "gambling",
        strategy: "grey_hat",
        aggressiveness: 5,
      });

      expect(result.factors.length).toBeGreaterThan(0);
      result.factors.forEach(f => {
        expect(["positive", "negative", "neutral"]).toContain(f.impact);
        expect(f.weight).toBeGreaterThanOrEqual(0);
        expect(f.weight).toBeLessThanOrEqual(100);
      });
    });
  });
});

// ═══ SEO Daily Engine Tests (mock LLM and DB) ═══
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      tasks: [
        { title: "Test Task", description: "Test", category: "on_page", priority: "high", estimatedMinutes: 15, aiReasoning: "Test" },
      ],
      aiStrategy: "Test strategy",
    }) } }],
  }),
}));

vi.mock("./db", () => ({
  getSeoProjectById: vi.fn().mockResolvedValue({
    id: 1,
    domain: "test.com",
    niche: "gambling",
    strategy: "grey_hat",
    aggressiveness: 5,
    currentDA: 15,
    targetKeywords: ["test keyword"],
    wpConnected: false,
    autoRunEnabled: true,
    autoRunDays: [1, 2, 3, 4, 5],
    autoRunHour: 3,
    autoRunCount: 0,
  }),
  getLatestRankings: vi.fn().mockResolvedValue([
    { keyword: "test keyword", position: 25, searchVolume: 5000 },
  ]),
  getProjectActions: vi.fn().mockResolvedValue([]),
  getBacklinkStats: vi.fn().mockResolvedValue({ total: 50, dofollow: 30, nofollow: 20 }),
  getProjectSnapshots: vi.fn().mockResolvedValue([]),
  addSeoAction: vi.fn().mockResolvedValue(1),
  updateSeoAction: vi.fn().mockResolvedValue(undefined),
  updateSeoProject: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  }),
}));

import { generateDailyPlan } from "./seo-daily-engine";

describe("SEO Daily Engine", () => {
  describe("generateDailyPlan", () => {
    it("should generate a daily plan with tasks", async () => {
      const plan = await generateDailyPlan(1);

      expect(plan).toHaveProperty("projectId", 1);
      expect(plan).toHaveProperty("date");
      expect(plan).toHaveProperty("tasks");
      expect(plan).toHaveProperty("totalTasks");
      expect(plan).toHaveProperty("aiStrategy");
      expect(plan.tasks.length).toBeGreaterThan(0);
    });

    it("should include task categories", async () => {
      const plan = await generateDailyPlan(1);

      plan.tasks.forEach(task => {
        expect(task).toHaveProperty("title");
        expect(task).toHaveProperty("category");
        expect(task).toHaveProperty("priority");
        expect(task).toHaveProperty("estimatedMinutes");
      });
    });
  });
});
