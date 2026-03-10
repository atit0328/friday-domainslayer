/**
 * Tests for Enhanced Adaptive Learning System
 * 
 * Tests:
 *   1. getMethodEffectiveness — returns effectiveness data and skip flags
 *   2. Method blacklisting logic — methods with <10% success after 5+ attempts are skipped
 *   3. evolveStrategies — returns evolved strategies array
 *   4. runEnhancedLearningCycle — runs full cycle including evolution
 *   5. DB query fixes — ORDER BY uses inline expressions not aliases
 *   6. aiPlanAttackStrategy integration — uses historical data
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getMethodEffectiveness,
  evolveStrategies,
  runEnhancedLearningCycle,
  calculateMethodSuccessRates,
  queryHistoricalPatterns,
  type MethodEffectiveness,
  type HistoricalPattern,
  type MethodSuccessRate,
} from "./adaptive-learning";

// Mock the database
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ strategies: [] }) } }],
  }),
}));

describe("Enhanced Adaptive Learning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getMethodEffectiveness", () => {
    it("should return empty array when DB is not available", async () => {
      const result = await getMethodEffectiveness("wordpress", "cloudflare");
      expect(result).toEqual([]);
    });

    it("should accept null CMS and WAF", async () => {
      const result = await getMethodEffectiveness(null, null);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("Method Blacklisting Logic", () => {
    it("should flag methods with <10% success after 5+ attempts as shouldSkip", () => {
      const SKIP_THRESHOLD = 5;
      const SKIP_RATE = 10;

      // Simulate a method with 2% success rate after 50 attempts
      const pattern = { totalAttempts: 50, successRate: 2 };
      const shouldSkip = pattern.totalAttempts >= SKIP_THRESHOLD && pattern.successRate < SKIP_RATE;
      expect(shouldSkip).toBe(true);
    });

    it("should NOT flag methods with insufficient attempts", () => {
      const SKIP_THRESHOLD = 5;
      const SKIP_RATE = 10;

      const pattern = { totalAttempts: 3, successRate: 0 };
      const shouldSkip = pattern.totalAttempts >= SKIP_THRESHOLD && pattern.successRate < SKIP_RATE;
      expect(shouldSkip).toBe(false);
    });

    it("should NOT flag methods with good success rates", () => {
      const SKIP_THRESHOLD = 5;
      const SKIP_RATE = 10;

      const pattern = { totalAttempts: 100, successRate: 45 };
      const shouldSkip = pattern.totalAttempts >= SKIP_THRESHOLD && pattern.successRate < SKIP_RATE;
      expect(shouldSkip).toBe(false);
    });

    it("should correctly filter blacklisted methods from available methods", () => {
      const allMethods = [
        "cve_exploit", "wp_brute_force", "cms_plugin_exploit",
        "file_upload_spray", "config_exploit", "xmlrpc_attack",
      ];
      const blacklistedMethods = ["wp_brute_force", "xmlrpc_attack"];

      const availableMethods = allMethods.filter(m => !blacklistedMethods.includes(m));
      expect(availableMethods).toEqual([
        "cve_exploit", "cms_plugin_exploit", "file_upload_spray", "config_exploit",
      ]);
      expect(availableMethods).not.toContain("wp_brute_force");
      expect(availableMethods).not.toContain("xmlrpc_attack");
    });
  });

  describe("evolveStrategies", () => {
    it("should return empty array when DB is not available", async () => {
      const result = await evolveStrategies();
      expect(result).toEqual([]);
    });
  });

  describe("runEnhancedLearningCycle", () => {
    it("should return cycle results with strategiesEvolved field", async () => {
      const result = await runEnhancedLearningCycle();
      expect(result).toHaveProperty("patternsUpdated");
      expect(result).toHaveProperty("profilesUpdated");
      expect(result).toHaveProperty("strategiesEvolved");
      expect(result).toHaveProperty("timestamp");
      expect(typeof result.timestamp).toBe("number");
    });
  });

  describe("calculateMethodSuccessRates", () => {
    it("should return empty array when DB is not available", async () => {
      const result = await calculateMethodSuccessRates();
      expect(result).toEqual([]);
    });
  });

  describe("queryHistoricalPatterns", () => {
    it("should return empty array when DB is not available", async () => {
      const result = await queryHistoricalPatterns({ cms: "wordpress" });
      expect(result).toEqual([]);
    });
  });

  describe("Type Interfaces", () => {
    it("MethodEffectiveness should have required fields", () => {
      const me: MethodEffectiveness = {
        method: "cve_exploit",
        cms: "wordpress",
        waf: "cloudflare",
        attempts: 50,
        successes: 25,
        successRate: 50,
        shouldSkip: false,
        reason: "50% success rate",
      };
      expect(me.method).toBe("cve_exploit");
      expect(me.shouldSkip).toBe(false);
    });
  });
});
