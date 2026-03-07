import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("rankDashboard router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    const ctx = createAuthContext();
    caller = appRouter.createCaller(ctx);
  });

  describe("stats", () => {
    it("returns dashboard stats with expected shape", async () => {
      const stats = await caller.rankDashboard.stats();
      expect(stats).toHaveProperty("totalKeywords");
      expect(stats).toHaveProperty("rankedKeywords");
      expect(stats).toHaveProperty("notRanked");
      expect(stats).toHaveProperty("avgPosition");
      expect(stats).toHaveProperty("top3");
      expect(stats).toHaveProperty("top10");
      expect(stats).toHaveProperty("top20");
      expect(stats).toHaveProperty("top50");
      expect(stats).toHaveProperty("improved");
      expect(stats).toHaveProperty("declined");
      expect(stats).toHaveProperty("stable");
      expect(stats).toHaveProperty("newKeywords");
      expect(typeof stats.totalKeywords).toBe("number");
      expect(typeof stats.avgPosition).toBe("number");
    });
  });

  describe("serpApiStatus", () => {
    it("returns SerpAPI account info with expected shape", async () => {
      const info = await caller.rankDashboard.serpApiStatus();
      expect(info).toHaveProperty("plan");
      expect(info).toHaveProperty("searchesPerMonth");
      expect(info).toHaveProperty("thisMonthUsage");
      expect(info).toHaveProperty("remaining");
      expect(typeof info.plan).toBe("string");
      expect(typeof info.searchesPerMonth).toBe("number");
    });
  });

  describe("keywords", () => {
    it("returns an array of tracked keywords", async () => {
      const keywords = await caller.rankDashboard.keywords();
      expect(Array.isArray(keywords)).toBe(true);
      // Each keyword should have projectDomain and projectName
      if (keywords.length > 0) {
        expect(keywords[0]).toHaveProperty("keyword");
        expect(keywords[0]).toHaveProperty("projectId");
        expect(keywords[0]).toHaveProperty("projectDomain");
        expect(keywords[0]).toHaveProperty("projectName");
        expect(keywords[0]).toHaveProperty("position");
        expect(keywords[0]).toHaveProperty("trend");
      }
    });
  });

  describe("timeSeries", () => {
    it("returns time series data for a keyword", async () => {
      const data = await caller.rankDashboard.timeSeries({
        keyword: "test keyword",
        days: 30,
      });
      expect(Array.isArray(data)).toBe(true);
      // Data may be empty if no history exists
    });
  });

  describe("multiTimeSeries", () => {
    it("returns multi-keyword time series data", async () => {
      const data = await caller.rankDashboard.multiTimeSeries({
        keywords: ["keyword1", "keyword2"],
        days: 30,
      });
      expect(data).toHaveProperty("keyword1");
      expect(data).toHaveProperty("keyword2");
      expect(Array.isArray(data["keyword1"])).toBe(true);
      expect(Array.isArray(data["keyword2"])).toBe(true);
    });
  });

  describe("projects", () => {
    it("returns list of projects for dropdown", async () => {
      const projects = await caller.rankDashboard.projects();
      expect(Array.isArray(projects)).toBe(true);
      if (projects.length > 0) {
        expect(projects[0]).toHaveProperty("id");
        expect(projects[0]).toHaveProperty("domain");
        expect(projects[0]).toHaveProperty("name");
        expect(projects[0]).toHaveProperty("status");
      }
    });
  });

  describe("positionDistribution", () => {
    it("returns position distribution data", async () => {
      const dist = await caller.rankDashboard.positionDistribution({});
      expect(dist).toHaveProperty("top3");
      expect(dist).toHaveProperty("top4to10");
      expect(dist).toHaveProperty("top11to20");
      expect(dist).toHaveProperty("top21to50");
      expect(dist).toHaveProperty("top51plus");
      expect(dist).toHaveProperty("notRanked");
      expect(typeof dist.top3).toBe("number");
    });

    it("accepts optional projectId filter", async () => {
      const dist = await caller.rankDashboard.positionDistribution({ projectId: 1 });
      expect(dist).toHaveProperty("top3");
    });
  });

  describe("addKeyword", () => {
    it("rejects invalid project", async () => {
      await expect(
        caller.rankDashboard.addKeyword({
          projectId: 999999,
          keyword: "test keyword",
        })
      ).rejects.toThrow("Project not found");
    });
  });

  describe("addKeywords", () => {
    it("rejects invalid project", async () => {
      await expect(
        caller.rankDashboard.addKeywords({
          projectId: 999999,
          keywords: ["keyword1", "keyword2"],
        })
      ).rejects.toThrow("Project not found");
    });
  });

  describe("checkRank", () => {
    it("rejects invalid project", async () => {
      await expect(
        caller.rankDashboard.checkRank({
          projectId: 999999,
          keyword: "test keyword",
        })
      ).rejects.toThrow("Project not found");
    });
  });

  describe("bulkCheck", () => {
    it("rejects invalid project", async () => {
      await expect(
        caller.rankDashboard.bulkCheck({
          projectId: 999999,
        })
      ).rejects.toThrow("Project not found");
    });
  });

  describe("removeKeyword", () => {
    it("succeeds even for non-existent keyword", async () => {
      const result = await caller.rankDashboard.removeKeyword({
        projectId: 1,
        keyword: "nonexistent-keyword-xyz",
      });
      expect(result).toEqual({ success: true });
    });
  });
});
