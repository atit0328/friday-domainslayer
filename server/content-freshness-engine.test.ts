import { describe, expect, it, vi, beforeEach } from "vitest";

// ═══════════════════════════════════════════════
// Mock the DB module before importing the engine
// ═══════════════════════════════════════════════

const mockUpsertTrackedContent = vi.fn().mockResolvedValue(42);
const mockGetAllTrackedContent = vi.fn().mockResolvedValue([]);
const mockGetStaleTrackedContent = vi.fn().mockResolvedValue([]);
const mockUpdateTrackedContentStaleness = vi.fn().mockResolvedValue(undefined);
const mockUpdateTrackedContentAfterRefresh = vi.fn().mockResolvedValue(undefined);
const mockUpdateTrackedContentRank = vi.fn().mockResolvedValue(undefined);
const mockGetTrackedContentCount = vi.fn().mockResolvedValue(0);
const mockGetTrackedContentById = vi.fn().mockResolvedValue(null);

vi.mock("./db", () => ({
  upsertTrackedContent: (...args: any[]) => mockUpsertTrackedContent(...args),
  getAllTrackedContent: (...args: any[]) => mockGetAllTrackedContent(...args),
  getStaleTrackedContent: (...args: any[]) => mockGetStaleTrackedContent(...args),
  updateTrackedContentStaleness: (...args: any[]) => mockUpdateTrackedContentStaleness(...args),
  updateTrackedContentAfterRefresh: (...args: any[]) => mockUpdateTrackedContentAfterRefresh(...args),
  updateTrackedContentRank: (...args: any[]) => mockUpdateTrackedContentRank(...args),
  getTrackedContentCount: (...args: any[]) => mockGetTrackedContentCount(...args),
  getTrackedContentById: (...args: any[]) => mockGetTrackedContentById(...args),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          newContent: "<p>Updated content</p>",
          newTitle: "Updated Title",
          newMetaDescription: "Updated meta",
          sectionsAdded: 1,
          wordsAdded: 50,
        }),
      },
    }],
  }),
}));

vi.mock("./telegram-notifier", () => ({
  sendTelegramNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock("./rapid-indexing-engine", () => ({
  rapidIndexUrl: vi.fn().mockResolvedValue({ success: true }),
}));

import {
  trackContent,
  getTrackedContent,
  getStaleContent,
  calculateStaleness,
  updateContentRank,
  getFreshnessSummary,
  freshnessTick,
  createDefaultFreshnessConfig,
  refreshContent,
} from "./content-freshness-engine";

describe("Content Freshness Engine (DB-backed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("trackContent", () => {
    it("should call upsertTrackedContent with correct data and return TrackedContent", async () => {
      mockUpsertTrackedContent.mockResolvedValue(42);

      const result = await trackContent({
        url: "https://telegra.ph/test-page",
        title: "Test Page",
        keyword: "test keyword",
        platform: "telegraph",
        originalContent: "<p>Test content</p>",
        domain: "example.com",
        telegraphToken: "abc123",
        telegraphPath: "test-page",
        sourceEngine: "parasite-blitz",
        projectId: 1,
      });

      expect(mockUpsertTrackedContent).toHaveBeenCalledOnce();
      expect(mockUpsertTrackedContent).toHaveBeenCalledWith(expect.objectContaining({
        url: "https://telegra.ph/test-page",
        title: "Test Page",
        keyword: "test keyword",
        platform: "telegraph",
        domain: "example.com",
        telegraphToken: "abc123",
        telegraphPath: "test-page",
        sourceEngine: "parasite-blitz",
        projectId: 1,
      }));

      expect(result.id).toBe(42);
      expect(result.url).toBe("https://telegra.ph/test-page");
      expect(result.platform).toBe("telegraph");
      expect(result.status).toBe("fresh");
      expect(result.stalenessScore).toBe(0);
    });

    it("should set high priority for ranking content (rank <= 20)", async () => {
      mockUpsertTrackedContent.mockResolvedValue(10);

      const result = await trackContent({
        url: "https://telegra.ph/ranking-page",
        title: "Ranking Page",
        keyword: "ranking keyword",
        platform: "telegraph",
        originalContent: "content",
        domain: "example.com",
        currentRank: 5,
      });

      expect(result.priority).toBe(9);
    });

    it("should set default priority for non-ranking content", async () => {
      mockUpsertTrackedContent.mockResolvedValue(11);

      const result = await trackContent({
        url: "https://telegra.ph/normal-page",
        title: "Normal Page",
        keyword: "normal keyword",
        platform: "telegraph",
        originalContent: "content",
        domain: "example.com",
      });

      expect(result.priority).toBe(5);
    });
  });

  describe("getTrackedContent", () => {
    it("should return mapped TrackedContent from DB rows", async () => {
      const now = new Date();
      mockGetAllTrackedContent.mockResolvedValue([
        {
          id: 1,
          url: "https://telegra.ph/page1",
          title: "Page 1",
          keyword: "kw1",
          platform: "telegraph",
          originalContent: "original",
          currentContent: "current",
          telegraphToken: "tok1",
          telegraphPath: "page1",
          domain: "example.com",
          deployedAt: now,
          lastRefreshedAt: now,
          refreshCount: 2,
          currentRank: 8,
          stalenessScore: 30,
          priority: 8,
          status: "aging",
        },
      ]);

      const result = await getTrackedContent("example.com");

      expect(mockGetAllTrackedContent).toHaveBeenCalledWith("example.com");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
      expect(result[0].status).toBe("aging");
      expect(result[0].currentRank).toBe(8);
    });

    it("should return empty array when no content tracked", async () => {
      mockGetAllTrackedContent.mockResolvedValue([]);
      const result = await getTrackedContent();
      expect(result).toEqual([]);
    });
  });

  describe("getStaleContent", () => {
    it("should return stale content from DB", async () => {
      mockGetStaleTrackedContent.mockResolvedValue([
        {
          id: 2,
          url: "https://telegra.ph/stale",
          title: "Stale Page",
          keyword: "stale kw",
          platform: "telegraph",
          originalContent: "old",
          currentContent: "old",
          domain: "example.com",
          deployedAt: new Date(Date.now() - 96 * 60 * 60 * 1000),
          lastRefreshedAt: new Date(Date.now() - 96 * 60 * 60 * 1000),
          refreshCount: 0,
          currentRank: null,
          stalenessScore: 100,
          priority: 5,
          status: "stale",
        },
      ]);

      const result = await getStaleContent("example.com");
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("stale");
      expect(result[0].stalenessScore).toBe(100);
    });
  });

  describe("calculateStaleness", () => {
    it("should calculate and persist staleness scores for all tracked content", async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);

      mockGetAllTrackedContent.mockResolvedValue([
        {
          id: 1,
          url: "https://telegra.ph/fresh",
          title: "Fresh",
          keyword: "kw",
          platform: "telegraph",
          originalContent: "c",
          currentContent: "c",
          domain: "example.com",
          deployedAt: twoHoursAgo,
          lastRefreshedAt: twoHoursAgo,
          refreshCount: 1,
          currentRank: null,
          stalenessScore: 0,
          priority: 5,
          status: "fresh",
        },
        {
          id: 2,
          url: "https://telegra.ph/stale",
          title: "Stale",
          keyword: "kw2",
          platform: "telegraph",
          originalContent: "c",
          currentContent: "c",
          domain: "example.com",
          deployedAt: threeDaysAgo,
          lastRefreshedAt: threeDaysAgo,
          refreshCount: 0,
          currentRank: null,
          stalenessScore: 0,
          priority: 5,
          status: "fresh",
        },
      ]);

      await calculateStaleness();

      // Should have been called twice (once per content)
      expect(mockUpdateTrackedContentStaleness).toHaveBeenCalledTimes(2);

      // First call: fresh content (2 hours old) — low staleness
      const firstCall = mockUpdateTrackedContentStaleness.mock.calls[0];
      expect(firstCall[0]).toBe(1);
      expect(firstCall[1].stalenessScore).toBeLessThan(10);
      expect(firstCall[1].status).toBe("fresh");

      // Second call: stale content (72 hours old, 0 refreshes) — high staleness
      const secondCall = mockUpdateTrackedContentStaleness.mock.calls[1];
      expect(secondCall[0]).toBe(2);
      expect(secondCall[1].stalenessScore).toBeGreaterThan(60);
      expect(secondCall[1].status).toBe("stale");
    });

    it("should reduce staleness for well-ranking content", async () => {
      const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

      mockGetAllTrackedContent.mockResolvedValue([
        {
          id: 3,
          url: "https://telegra.ph/ranking",
          title: "Ranking",
          keyword: "kw",
          platform: "telegraph",
          originalContent: "c",
          currentContent: "c",
          domain: "example.com",
          deployedAt: threeDaysAgo,
          lastRefreshedAt: threeDaysAgo,
          refreshCount: 1,
          currentRank: 5, // Ranking in top 10
          stalenessScore: 0,
          priority: 10,
          status: "fresh",
        },
      ]);

      await calculateStaleness();

      const call = mockUpdateTrackedContentStaleness.mock.calls[0];
      // With rank <= 10, staleness should be reduced by 20%
      expect(call[1].stalenessScore).toBeLessThan(75); // Without rank bonus it would be ~75
    });
  });

  describe("updateContentRank", () => {
    it("should delegate to DB updateTrackedContentRank", async () => {
      await updateContentRank(42, 3);
      expect(mockUpdateTrackedContentRank).toHaveBeenCalledWith(42, 3);
    });
  });

  describe("getFreshnessSummary", () => {
    it("should return summary stats from DB", async () => {
      mockGetAllTrackedContent.mockResolvedValue([
        { id: 1, status: "fresh", stalenessScore: 10, url: "", title: "", keyword: "", platform: "telegraph", originalContent: "", currentContent: "", domain: "", deployedAt: new Date(), lastRefreshedAt: new Date(), refreshCount: 0, currentRank: null, priority: 5 },
        { id: 2, status: "aging", stalenessScore: 45, url: "", title: "", keyword: "", platform: "telegraph", originalContent: "", currentContent: "", domain: "", deployedAt: new Date(), lastRefreshedAt: new Date(), refreshCount: 0, currentRank: null, priority: 5 },
        { id: 3, status: "stale", stalenessScore: 90, url: "", title: "", keyword: "", platform: "telegraph", originalContent: "", currentContent: "", domain: "", deployedAt: new Date(), lastRefreshedAt: new Date(), refreshCount: 0, currentRank: null, priority: 5 },
      ]);

      const summary = await getFreshnessSummary();
      expect(summary.totalTracked).toBe(3);
      expect(summary.fresh).toBe(1);
      expect(summary.aging).toBe(1);
      expect(summary.stale).toBe(1);
      expect(summary.avgStaleness).toBeCloseTo(48.33, 0);
    });
  });

  describe("freshnessTick", () => {
    it("should return null when no stale content exists", async () => {
      mockGetAllTrackedContent.mockResolvedValue([]);
      mockGetStaleTrackedContent.mockResolvedValue([]);
      mockGetTrackedContentCount.mockResolvedValue(5);

      const result = await freshnessTick("example.com");
      expect(result).toBeNull();
    });
  });

  describe("refreshContent", () => {
    it("should return error result when content not found", async () => {
      mockGetTrackedContentById.mockResolvedValue(null);

      const config = createDefaultFreshnessConfig("example.com");
      const result = await refreshContent(999, config);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Content not found");
    });

    it("should refresh content and update DB when content exists", async () => {
      const now = new Date();
      mockGetTrackedContentById.mockResolvedValue({
        id: 1,
        url: "https://telegra.ph/test",
        title: "Test",
        keyword: "test kw",
        platform: "other", // not telegraph, so no editPage
        originalContent: "original",
        currentContent: "current content here",
        telegraphToken: null,
        telegraphPath: null,
        domain: "example.com",
        deployedAt: now,
        lastRefreshedAt: now,
        refreshCount: 0,
        currentRank: null,
        stalenessScore: 80,
        priority: 5,
        status: "stale",
      });

      const config = createDefaultFreshnessConfig("example.com");
      const result = await refreshContent(1, config);

      expect(result.success).toBe(true);
      expect(result.contentId).toBe(1);
      expect(mockUpdateTrackedContentStaleness).toHaveBeenCalled(); // mark as refreshing
      expect(mockUpdateTrackedContentAfterRefresh).toHaveBeenCalledWith(1, expect.objectContaining({
        currentContent: expect.any(String),
        title: expect.any(String),
      }));
    });
  });

  describe("createDefaultFreshnessConfig", () => {
    it("should return correct defaults", () => {
      const config = createDefaultFreshnessConfig("example.com", "gambling", "th");
      expect(config.domain).toBe("example.com");
      expect(config.refreshIntervalHours).toBe(48);
      expect(config.maxRefreshesPerCycle).toBe(10);
      expect(config.prioritizeRanking).toBe(true);
      expect(config.language).toBe("th");
      expect(config.niche).toBe("gambling");
    });
  });
});
