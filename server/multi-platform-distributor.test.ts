/**
 * Multi-Platform Content Distribution Engine — Tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          title: "คู่มือคาสิโนออนไลน์ — แนะนำสำหรับผู้เริ่มต้น",
          content: '<h2>แนะนำคาสิโนออนไลน์</h2><p>บทความนี้จะพาคุณทำความรู้จัก</p><p>สำหรับข้อมูลเพิ่มเติม <a href="https://example.com">คาสิโนออนไลน์</a></p>',
          excerpt: "คู่มือคาสิโนออนไลน์สำหรับผู้เริ่มต้น",
          tags: ["casino", "online", "gambling", "review", "guide"],
        }),
      },
    }],
  }),
}));

vi.mock("./proxy-pool", () => ({
  fetchWithPoolProxy: vi.fn().mockRejectedValue(new Error("No proxy")),
}));

vi.mock("./rapid-indexing-engine", () => ({
  rapidIndexUrl: vi.fn().mockResolvedValue([
    { url: "https://example.com", method: "IndexNow", success: true, message: "Submitted" },
  ]),
}));

vi.mock("./telegram-notifier", () => ({
  sendTelegramNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock("./db", () => ({
  addBacklink: vi.fn().mockResolvedValue({ id: 1 }),
}));

import {
  generateDistributionContent,
  distributeToAllPlatforms,
  recordSession,
  getDistributionHistory,
  getDistributionStats,
  PLATFORMS,
  type DistributionTarget,
} from "./multi-platform-distributor";

const mockTarget: DistributionTarget = {
  targetUrl: "https://example-casino.com",
  targetDomain: "example-casino.com",
  keyword: "คาสิโนออนไลน์",
  niche: "gambling",
  anchorText: "คาสิโนออนไลน์ อันดับ 1",
  projectId: 1,
};

describe("Multi-Platform Content Distribution Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PLATFORMS registry", () => {
    it("should have multiple platforms defined", () => {
      expect(PLATFORMS.length).toBeGreaterThanOrEqual(8);
    });

    it("should have platforms with required fields", () => {
      for (const p of PLATFORMS) {
        expect(p.name).toBeTruthy();
        expect(p.domain).toBeTruthy();
        expect(p.da).toBeGreaterThan(0);
        expect(["dofollow", "nofollow"]).toContain(p.linkType);
        expect([1, 2, 3]).toContain(p.tier);
        expect(p.type).toBeTruthy();
      }
    });

    it("should include Telegraph as a platform", () => {
      const telegraph = PLATFORMS.find(p => p.name === "Telegraph");
      expect(telegraph).toBeDefined();
      expect(telegraph!.da).toBe(82);
      expect(telegraph!.linkType).toBe("dofollow");
      expect(telegraph!.requiresAuth).toBe(false);
    });

    it("should include multiple no-auth platforms", () => {
      const noAuth = PLATFORMS.filter(p => !p.requiresAuth);
      expect(noAuth.length).toBeGreaterThanOrEqual(6);
    });

    it("should include JustPaste.it", () => {
      const jp = PLATFORMS.find(p => p.name === "JustPaste.it");
      expect(jp).toBeDefined();
      expect(jp!.da).toBe(72);
    });

    it("should include Rentry.co", () => {
      const rentry = PLATFORMS.find(p => p.name === "Rentry.co");
      expect(rentry).toBeDefined();
    });

    it("should include Write.as", () => {
      const writeas = PLATFORMS.find(p => p.name === "Write.as");
      expect(writeas).toBeDefined();
      expect(writeas!.type).toBe("web2");
    });
  });

  describe("generateDistributionContent", () => {
    it("should generate HTML content with backlink", async () => {
      const content = await generateDistributionContent("Telegraph", mockTarget, "html", 500);
      expect(content.title).toBeTruthy();
      expect(content.content).toBeTruthy();
      expect(content.excerpt).toBeTruthy();
      expect(content.tags).toBeInstanceOf(Array);
      expect(content.tags.length).toBeGreaterThan(0);
    });

    it("should generate markdown content", async () => {
      const content = await generateDistributionContent("Rentry.co", mockTarget, "markdown", 400);
      expect(content.title).toBeTruthy();
      expect(content.content).toBeTruthy();
    });

    it("should generate plaintext content", async () => {
      const content = await generateDistributionContent("Paste.ee", mockTarget, "plaintext", 300);
      expect(content.title).toBeTruthy();
      expect(content.content).toBeTruthy();
    });

    it("should fallback to default content on LLM error", async () => {
      const { invokeLLM } = await import("./_core/llm");
      (invokeLLM as any).mockRejectedValueOnce(new Error("LLM unavailable"));

      const content = await generateDistributionContent("Telegraph", mockTarget, "html", 500);
      expect(content.title).toContain(mockTarget.keyword);
      expect(content.content).toContain(mockTarget.targetUrl);
    });
  });

  describe("Session history & stats", () => {
    beforeEach(() => {
      // Clear history by recording empty sessions
    });

    it("should record and retrieve sessions", () => {
      const session = {
        id: "test-session-1",
        target: mockTarget,
        startedAt: Date.now(),
        completedAt: Date.now() + 30000,
        results: [
          {
            platform: "Telegraph",
            platformType: "web2" as const,
            success: true,
            publishedUrl: "https://telegra.ph/test-article",
            da: 82,
            linkType: "dofollow" as const,
            indexed: true,
          },
          {
            platform: "JustPaste.it",
            platformType: "paste" as const,
            success: true,
            publishedUrl: "https://justpaste.it/abc123",
            da: 72,
            linkType: "dofollow" as const,
            indexed: false,
          },
          {
            platform: "Write.as",
            platformType: "web2" as const,
            success: false,
            error: "HTTP 429",
            da: 65,
            linkType: "dofollow" as const,
            indexed: false,
          },
        ],
        totalPlatforms: 3,
        successCount: 2,
        failCount: 1,
        indexedCount: 1,
        tier1Success: 2,
        tier2Success: 0,
        tier3Pings: 3,
      };

      recordSession(session);
      const history = getDistributionHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].id).toBe("test-session-1");
    });

    it("should calculate correct stats", () => {
      const session = {
        id: "test-session-2",
        target: mockTarget,
        startedAt: Date.now(),
        completedAt: Date.now() + 30000,
        results: [
          {
            platform: "Telegraph",
            platformType: "web2" as const,
            success: true,
            publishedUrl: "https://telegra.ph/test-2",
            da: 82,
            linkType: "dofollow" as const,
            indexed: true,
          },
          {
            platform: "Rentry.co",
            platformType: "paste" as const,
            success: true,
            publishedUrl: "https://rentry.co/test",
            da: 62,
            linkType: "dofollow" as const,
            indexed: false,
          },
        ],
        totalPlatforms: 2,
        successCount: 2,
        failCount: 0,
        indexedCount: 1,
        tier1Success: 2,
        tier2Success: 0,
        tier3Pings: 2,
      };

      recordSession(session);
      const stats = getDistributionStats();
      expect(stats.totalSessions).toBeGreaterThanOrEqual(1);
      expect(stats.totalPosts).toBeGreaterThanOrEqual(2);
      expect(stats.totalSuccess).toBeGreaterThanOrEqual(2);
      expect(stats.averageSuccessRate).toBeGreaterThan(0);
      expect(stats.platformBreakdown).toBeDefined();
    });

    it("should return history in reverse chronological order", () => {
      const history = getDistributionHistory();
      if (history.length >= 2) {
        expect(history[0].startedAt).toBeGreaterThanOrEqual(history[1].startedAt);
      }
    });
  });

  describe("distributeToAllPlatforms", () => {
    it("should return a valid session structure", async () => {
      // Mock global fetch for Telegraph API
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("telegra.ph/createAccount")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ok: true, result: { access_token: "test-token" } }),
          });
        }
        if (typeof url === "string" && url.includes("telegra.ph/createPage")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ok: true, result: { url: "https://telegra.ph/test-article-03-11" } }),
          });
        }
        // Default: fail for other platforms
        return Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve("Not found"),
          json: () => Promise.resolve({}),
          headers: new Headers(),
        });
      });

      try {
        const session = await distributeToAllPlatforms(mockTarget, {
          maxTier1: 3,
          maxComments: 0,
          enableIndexing: false,
          enableTelegram: false,
        });

        expect(session.id).toBeTruthy();
        expect(session.target).toEqual(mockTarget);
        expect(session.startedAt).toBeGreaterThan(0);
        expect(session.completedAt).toBeGreaterThan(0);
        expect(session.results).toBeInstanceOf(Array);
        expect(session.totalPlatforms).toBeGreaterThan(0);
        expect(typeof session.successCount).toBe("number");
        expect(typeof session.failCount).toBe("number");
        expect(typeof session.tier1Success).toBe("number");
        expect(typeof session.tier2Success).toBe("number");
        expect(typeof session.tier3Pings).toBe("number");
      } finally {
        globalThis.fetch = originalFetch;
      }
    }, 60000);

    it("should handle all platforms failing gracefully", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      try {
        const session = await distributeToAllPlatforms(mockTarget, {
          maxTier1: 2,
          maxComments: 0,
          enableIndexing: false,
          enableTelegram: false,
        });

        expect(session.id).toBeTruthy();
        expect(session.completedAt).toBeGreaterThan(0);
        // Should not throw even if all fail
      } finally {
        globalThis.fetch = originalFetch;
      }
    }, 60000);
  });

  describe("Platform diversity", () => {
    it("should have platforms from multiple tiers", () => {
      const tier1 = PLATFORMS.filter(p => p.tier === 1);
      const tier2 = PLATFORMS.filter(p => p.tier === 2);
      expect(tier1.length).toBeGreaterThanOrEqual(5);
      expect(tier2.length).toBeGreaterThanOrEqual(1);
    });

    it("should have both dofollow and nofollow platforms", () => {
      const dofollow = PLATFORMS.filter(p => p.linkType === "dofollow");
      const nofollow = PLATFORMS.filter(p => p.linkType === "nofollow");
      expect(dofollow.length).toBeGreaterThan(0);
      expect(nofollow.length).toBeGreaterThan(0);
    });

    it("should have platforms with DA > 60", () => {
      const highDA = PLATFORMS.filter(p => p.da > 60);
      expect(highDA.length).toBeGreaterThanOrEqual(3);
    });

    it("should have multiple platform types", () => {
      const types = new Set(PLATFORMS.map(p => p.type));
      expect(types.size).toBeGreaterThanOrEqual(2);
    });
  });
});
