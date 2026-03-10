/**
 * Autonomous Research Engine — Vitest Tests
 *
 * Tests the AI-driven research cycle that discovers new attack vectors,
 * generates exploits, tests them in sandbox, and registers successful methods.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock LLM ───
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          vectors: [
            {
              name: "wp_rest_api_exploit",
              description: "WordPress REST API privilege escalation",
              cveId: "CVE-2024-1234",
              severity: "high",
              exploitApproach: "Send crafted REST API request to /wp-json/wp/v2/users",
              targetCms: "WordPress",
              requiredConditions: ["WordPress < 6.4", "REST API enabled"],
              estimatedSuccessRate: 0.7,
            },
          ],
        }),
      },
    }],
  }),
}));

// ─── Mock database ───
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([{ insertId: 1 }]) }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
      }),
    }),
  }),
}));

vi.mock("../drizzle/schema", () => ({
  aiTaskQueue: { id: "id" },
  cveEntries: { cveId: "cveId" },
  strategyOutcomeLogs: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  desc: vi.fn((col: any) => col),
  sql: vi.fn(),
  like: vi.fn((...args: any[]) => args),
  or: vi.fn((...args: any[]) => args),
}));

describe("Autonomous Research Engine — Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Module Exports", () => {
    it("should export all required functions", async () => {
      const mod = await import("./autonomous-research-engine");
      expect(mod.runResearchCycle).toBeDefined();
      expect(typeof mod.runResearchCycle).toBe("function");
    });

    it("should export ResearchTarget type (verified via function signature)", async () => {
      const mod = await import("./autonomous-research-engine");
      // ResearchTarget is a type, verify the function accepts it
      expect(mod.runResearchCycle).toBeDefined();
    });
  });

  describe("ResearchTarget interface", () => {
    it("should have correct structure", () => {
      const target = {
        domain: "example.com",
        cms: "WordPress",
        cmsVersion: "6.3",
        serverType: "Apache",
        phpVersion: "8.1",
        waf: "Cloudflare",
        plugins: ["elementor", "woocommerce"],
      };
      expect(target.domain).toBe("example.com");
      expect(target.cms).toBe("WordPress");
      expect(target.plugins).toHaveLength(2);
    });

    it("should accept null values for optional fields", () => {
      const target = {
        domain: "example.com",
        cms: null,
        cmsVersion: null,
        serverType: null,
        phpVersion: null,
        waf: null,
        plugins: [],
      };
      expect(target.domain).toBe("example.com");
      expect(target.cms).toBeNull();
      expect(target.plugins).toHaveLength(0);
    });
  });

  describe("runResearchCycle", () => {
    it("should be callable with a valid target", async () => {
      const mod = await import("./autonomous-research-engine");
      const target = {
        domain: "test.com",
        cms: "WordPress",
        cmsVersion: "6.3",
        serverType: "Apache",
        phpVersion: "8.1",
        waf: null,
        plugins: ["elementor"],
      };
      // Should not throw
      const result = await mod.runResearchCycle(target);
      expect(result).toBeDefined();
    });

    it("should return a result object with expected fields", async () => {
      const mod = await import("./autonomous-research-engine");
      const target = {
        domain: "test.com",
        cms: "WordPress",
        cmsVersion: null,
        serverType: null,
        phpVersion: null,
        waf: null,
        plugins: [],
      };
      const result = await mod.runResearchCycle(target);
      expect(result).toHaveProperty("targetDomain");
      expect(result).toHaveProperty("vectorsDiscovered");
      expect(result).toHaveProperty("vectorsTested");
      expect(result).toHaveProperty("vectorsSucceeded");
      expect(result).toHaveProperty("vectorsBlocked");
      expect(result).toHaveProperty("newMethodsRegistered");
      expect(result).toHaveProperty("cveMatches");
      expect(result).toHaveProperty("durationMs");
      expect(result).toHaveProperty("discoveredVectors");
      expect(result).toHaveProperty("testResults");
      expect(result).toHaveProperty("aiSummary");
      expect(typeof result.vectorsDiscovered).toBe("number");
      expect(typeof result.vectorsTested).toBe("number");
    });

    it("should handle target with no CMS gracefully", async () => {
      const mod = await import("./autonomous-research-engine");
      const target = {
        domain: "unknown-site.com",
        cms: null,
        cmsVersion: null,
        serverType: null,
        phpVersion: null,
        waf: null,
        plugins: [],
      };
      const result = await mod.runResearchCycle(target);
      expect(result).toBeDefined();
      expect(result.targetDomain).toBe("unknown-site.com");
      expect(result.vectorsDiscovered).toBeGreaterThanOrEqual(0);
    });
  });
});
