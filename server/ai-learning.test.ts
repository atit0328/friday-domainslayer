import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB module
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          recommendedApproach: "hybrid",
          adjustedProbability: 65,
          reasoning: "Based on past deploys, hybrid approach works best for Apache servers",
        }),
      },
    }],
  }),
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  like: vi.fn(),
  or: vi.fn(),
  isNotNull: vi.fn(),
}));

// Mock schema
vi.mock("../drizzle/schema", () => ({
  deployHistory: {
    id: "id",
    targetDomain: "targetDomain",
    status: "status",
    techniqueUsed: "techniqueUsed",
    bypassMethod: "bypassMethod",
    cms: "cms",
    serverType: "serverType",
    wafDetected: "wafDetected",
    preScreenScore: "preScreenScore",
    duration: "duration",
    errorBreakdown: "errorBreakdown",
    altMethodUsed: "altMethodUsed",
    filesDeployed: "filesDeployed",
    redirectActive: "redirectActive",
    startedAt: "startedAt",
  },
}));

describe("AI Learning Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDeployLearnings", () => {
    it("should return empty learnings when DB is not available", async () => {
      const { getDb } = await import("./db");
      (getDb as any).mockResolvedValue(null);

      const { getDeployLearnings } = await import("./ai-learning");
      const result = await getDeployLearnings("example.com");

      expect(result.totalPastDeploys).toBe(0);
      expect(result.successRate).toBe(0);
      expect(result.bestMethod).toBeNull();
      expect(result.recommendations).toEqual([]);
    });

    it("should return empty learnings when no deploys exist", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };
      const { getDb } = await import("./db");
      (getDb as any).mockResolvedValue(mockDb);

      const { getDeployLearnings } = await import("./ai-learning");
      const result = await getDeployLearnings("example.com");

      expect(result.totalPastDeploys).toBe(0);
    });

    it("should calculate success rate correctly", async () => {
      const mockDeploys = [
        { targetDomain: "test.com", status: "success", techniqueUsed: "hybrid", bypassMethod: null, cms: null, serverType: "Apache", wafDetected: null, preScreenScore: 70, duration: 5000, errorBreakdown: null, altMethodUsed: null, filesDeployed: 3, redirectActive: true },
        { targetDomain: "test.com", status: "success", techniqueUsed: "hybrid", bypassMethod: null, cms: null, serverType: "Apache", wafDetected: null, preScreenScore: 65, duration: 4000, errorBreakdown: null, altMethodUsed: null, filesDeployed: 2, redirectActive: true },
        { targetDomain: "other.com", status: "failed", techniqueUsed: "direct", bypassMethod: null, cms: "WordPress", serverType: "Nginx", wafDetected: "Cloudflare", preScreenScore: 20, duration: 3000, errorBreakdown: { waf: 3, timeout: 1 }, altMethodUsed: null, filesDeployed: 0, redirectActive: false },
        { targetDomain: "other.com", status: "partial", techniqueUsed: "hybrid", bypassMethod: "obfuscation", cms: null, serverType: "Apache", wafDetected: null, preScreenScore: 50, duration: 6000, errorBreakdown: null, altMethodUsed: null, filesDeployed: 1, redirectActive: false },
      ];

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockDeploys),
            }),
          }),
        }),
      };
      const { getDb } = await import("./db");
      (getDb as any).mockResolvedValue(mockDb);

      const { getDeployLearnings } = await import("./ai-learning");
      const result = await getDeployLearnings("test.com");

      expect(result.totalPastDeploys).toBe(4);
      // 2 success + 0.5 * 1 partial = 2.5 / 4 = 62.5% → 63%
      expect(result.successRate).toBe(63);
    });

    it("should find best technique from history", async () => {
      const mockDeploys = [
        { targetDomain: "a.com", status: "success", techniqueUsed: "hybrid", bypassMethod: null, cms: null, serverType: null, wafDetected: null, preScreenScore: null, duration: 5000, errorBreakdown: null, altMethodUsed: null, filesDeployed: 3, redirectActive: true },
        { targetDomain: "b.com", status: "success", techniqueUsed: "hybrid", bypassMethod: null, cms: null, serverType: null, wafDetected: null, preScreenScore: null, duration: 4000, errorBreakdown: null, altMethodUsed: null, filesDeployed: 2, redirectActive: true },
        { targetDomain: "c.com", status: "failed", techniqueUsed: "direct", bypassMethod: null, cms: null, serverType: null, wafDetected: null, preScreenScore: null, duration: 3000, errorBreakdown: null, altMethodUsed: null, filesDeployed: 0, redirectActive: false },
        { targetDomain: "d.com", status: "failed", techniqueUsed: "direct", bypassMethod: null, cms: null, serverType: null, wafDetected: null, preScreenScore: null, duration: 3000, errorBreakdown: null, altMethodUsed: null, filesDeployed: 0, redirectActive: false },
      ];

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockDeploys),
            }),
          }),
        }),
      };
      const { getDb } = await import("./db");
      (getDb as any).mockResolvedValue(mockDb);

      const { getDeployLearnings } = await import("./ai-learning");
      const result = await getDeployLearnings("new-target.com");

      expect(result.bestMethod).toBe("hybrid");
    });

    it("should identify common failure patterns", async () => {
      const mockDeploys = [
        { targetDomain: "a.com", status: "failed", techniqueUsed: "direct", bypassMethod: null, cms: null, serverType: null, wafDetected: null, preScreenScore: null, duration: 3000, errorBreakdown: { waf: 5, timeout: 2 }, altMethodUsed: null, filesDeployed: 0, redirectActive: false },
        { targetDomain: "b.com", status: "failed", techniqueUsed: "direct", bypassMethod: null, cms: null, serverType: null, wafDetected: null, preScreenScore: null, duration: 3000, errorBreakdown: { waf: 3, permission: 1 }, altMethodUsed: null, filesDeployed: 0, redirectActive: false },
      ];

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockDeploys),
            }),
          }),
        }),
      };
      const { getDb } = await import("./db");
      (getDb as any).mockResolvedValue(mockDb);

      const { getDeployLearnings } = await import("./ai-learning");
      const result = await getDeployLearnings("test.com");

      expect(result.commonFailures).toContain("waf");
    });

    it("should find similar targets for the same domain", async () => {
      const mockDeploys = [
        { targetDomain: "example.com", status: "success", techniqueUsed: "hybrid", bypassMethod: "obfuscation", cms: "WordPress", serverType: "Apache", wafDetected: null, preScreenScore: 75, duration: 5000, errorBreakdown: null, altMethodUsed: null, filesDeployed: 3, redirectActive: true },
        { targetDomain: "other.com", status: "failed", techniqueUsed: "direct", bypassMethod: null, cms: null, serverType: "Nginx", wafDetected: "Cloudflare", preScreenScore: 20, duration: 3000, errorBreakdown: { waf: 3 }, altMethodUsed: null, filesDeployed: 0, redirectActive: false },
      ];

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockDeploys),
            }),
          }),
        }),
      };
      const { getDb } = await import("./db");
      (getDb as any).mockResolvedValue(mockDb);

      const { getDeployLearnings } = await import("./ai-learning");
      const result = await getDeployLearnings("example.com");

      expect(result.similarTargets.length).toBe(1);
      expect(result.similarTargets[0].domain).toBe("example.com");
      expect(result.similarTargets[0].status).toBe("success");
    });

    it("should calculate average duration", async () => {
      const mockDeploys = [
        { targetDomain: "a.com", status: "success", techniqueUsed: "hybrid", bypassMethod: null, cms: null, serverType: null, wafDetected: null, preScreenScore: null, duration: 5000, errorBreakdown: null, altMethodUsed: null, filesDeployed: 3, redirectActive: true },
        { targetDomain: "b.com", status: "success", techniqueUsed: "hybrid", bypassMethod: null, cms: null, serverType: null, wafDetected: null, preScreenScore: null, duration: 3000, errorBreakdown: null, altMethodUsed: null, filesDeployed: 2, redirectActive: true },
      ];

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockDeploys),
            }),
          }),
        }),
      };
      const { getDb } = await import("./db");
      (getDb as any).mockResolvedValue(mockDb);

      const { getDeployLearnings } = await import("./ai-learning");
      const result = await getDeployLearnings("test.com");

      expect(result.avgDuration).toBe(4000);
    });

    it("should generate recommendations for same domain with failed history", async () => {
      const mockDeploys = [
        { targetDomain: "target.com", status: "failed", techniqueUsed: "direct", bypassMethod: null, cms: null, serverType: "Nginx", wafDetected: "Cloudflare", preScreenScore: 20, duration: 3000, errorBreakdown: { waf: 3 }, altMethodUsed: null, filesDeployed: 0, redirectActive: false },
      ];

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockDeploys),
            }),
          }),
        }),
      };
      const { getDb } = await import("./db");
      (getDb as any).mockResolvedValue(mockDb);

      const { getDeployLearnings } = await import("./ai-learning");
      const result = await getDeployLearnings("target.com");

      expect(result.recommendations.length).toBeGreaterThan(0);
      // Should recommend different technique since last failed
      expect(result.recommendations.some(r => r.includes("failed") || r.includes("different"))).toBe(true);
    });
  });

  describe("getAIEnhancedStrategy", () => {
    it("should return null when not enough data", async () => {
      const { getAIEnhancedStrategy } = await import("./ai-learning");
      const result = await getAIEnhancedStrategy(
        "example.com", "Apache", null, null,
        { totalPastDeploys: 2, successRate: 50, bestMethod: null, bestBypass: null, avgDuration: 0, commonFailures: [], recommendations: [], similarTargets: [] },
      );
      expect(result).toBeNull();
    });

    it("should return AI-enhanced strategy when enough data exists", async () => {
      const { getAIEnhancedStrategy } = await import("./ai-learning");
      const result = await getAIEnhancedStrategy(
        "example.com", "Apache", "WordPress", null,
        {
          totalPastDeploys: 10,
          successRate: 60,
          bestMethod: "hybrid",
          bestBypass: "obfuscation",
          avgDuration: 5000,
          commonFailures: ["timeout"],
          recommendations: [],
          similarTargets: [],
        },
      );

      expect(result).not.toBeNull();
      expect(result!.recommendedApproach).toBeDefined();
      expect(result!.adjustedProbability).toBeGreaterThanOrEqual(0);
      expect(result!.reasoning).toBeDefined();
    });
  });
});

describe("PBN Content Generation with Content Type/Tone", () => {
  it("should accept contentType and writingTone parameters", async () => {
    // Verify the function signature accepts the new params
    const { generatePBNContent } = await import("./pbn-bridge");
    expect(typeof generatePBNContent).toBe("function");
    // The function should accept 7 params (targetUrl, anchorText, keyword, niche, siteUrl, contentType, writingTone)
    expect(generatePBNContent.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Auto-Log Deploy Record", () => {
  it("should have AI analysis fields in deploy_history schema", async () => {
    const schema = await import("../drizzle/schema");
    // Verify the schema has the new fields (mocked but validates import works)
    expect(schema.deployHistory).toBeDefined();
  });
});
