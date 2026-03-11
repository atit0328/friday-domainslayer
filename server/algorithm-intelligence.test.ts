import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "superadmin",
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
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("algorithmIntelligence", () => {
  const ctx = createAuthContext();
  const caller = appRouter.createCaller(ctx);

  describe("getOverview", () => {
    it("returns overview with all expected fields", async () => {
      const result = await caller.algorithmIntelligence.getOverview();

      expect(result).toBeDefined();
      expect(typeof result.totalFactors).toBe("number");
      expect(result.totalFactors).toBeGreaterThan(50);
      expect(typeof result.exploitable).toBe("number");
      expect(result.exploitable).toBeGreaterThan(0);
      expect(typeof result.critical).toBe("number");
      expect(typeof result.highFastRank).toBe("number");
      expect(typeof result.strategies).toBe("number");
      expect(typeof result.penaltyRules).toBe("number");
      expect(Array.isArray(result.categoryBreakdown)).toBe(true);
      expect(result.categoryBreakdown.length).toBeGreaterThan(0);
      expect(Array.isArray(result.impactBreakdown)).toBe(true);
      expect(result.impactBreakdown.length).toBeGreaterThan(0);
    });

    it("has category breakdown with valid categories", async () => {
      const result = await caller.algorithmIntelligence.getOverview();
      const validCategories = [
        "domain", "page_level", "site_level", "backlink",
        "user_interaction", "special_algorithm", "brand_signal",
        "on_site_spam", "off_site_spam",
      ];
      for (const cat of result.categoryBreakdown) {
        expect(validCategories).toContain(cat.category);
        expect(typeof cat.count).toBe("number");
        expect(cat.count).toBeGreaterThan(0);
      }
    });

    it("has impact breakdown with valid impact levels", async () => {
      const result = await caller.algorithmIntelligence.getOverview();
      const validImpacts = ["critical", "high", "medium", "low", "minimal"];
      for (const imp of result.impactBreakdown) {
        expect(validImpacts).toContain(imp.impact);
        expect(typeof imp.count).toBe("number");
      }
    });
  });

  describe("getFactors", () => {
    it("returns all ranking factors", async () => {
      const result = await caller.algorithmIntelligence.getFactors();

      expect(result).toBeDefined();
      expect(Array.isArray(result.factors)).toBe(true);
      expect(result.factors.length).toBeGreaterThan(50);
      expect(result.total).toBe(result.factors.length);
      expect(Array.isArray(result.categories)).toBe(true);
      expect(result.categories.length).toBeGreaterThan(0);
    });

    it("filters by category", async () => {
      const result = await caller.algorithmIntelligence.getFactors({ category: "backlink" });

      expect(result.factors.length).toBeGreaterThan(0);
      for (const factor of result.factors) {
        expect(factor.category).toBe("backlink");
      }
    });

    it("filters by minFastRankRelevance", async () => {
      const result = await caller.algorithmIntelligence.getFactors({ minFastRankRelevance: 8 });

      expect(result.factors.length).toBeGreaterThan(0);
      for (const factor of result.factors) {
        expect(factor.fastRankRelevance).toBeGreaterThanOrEqual(8);
      }
    });

    it("filters exploitable only", async () => {
      const result = await caller.algorithmIntelligence.getFactors({ exploitableOnly: true });

      expect(result.factors.length).toBeGreaterThan(0);
      for (const factor of result.factors) {
        expect(factor.exploitable).toBe(true);
      }
    });

    it("each factor has required fields", async () => {
      const result = await caller.algorithmIntelligence.getFactors();
      const factor = result.factors[0];

      expect(typeof factor.id).toBe("number");
      expect(typeof factor.name).toBe("string");
      expect(factor.name.length).toBeGreaterThan(0);
      expect(typeof factor.description).toBe("string");
      expect(typeof factor.category).toBe("string");
      expect(typeof factor.impact).toBe("string");
      expect(typeof factor.fastRankRelevance).toBe("number");
      expect(factor.fastRankRelevance).toBeGreaterThanOrEqual(1);
      expect(factor.fastRankRelevance).toBeLessThanOrEqual(10);
      expect(typeof factor.exploitable).toBe("boolean");
      expect(typeof factor.confirmed).toBe("boolean");
    });
  });

  describe("getFastRankFactors", () => {
    it("returns factors sorted by fast-rank relevance", async () => {
      const result = await caller.algorithmIntelligence.getFastRankFactors({ minScore: 7 });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Verify all have fastRankRelevance >= 7
      for (const factor of result) {
        expect(factor.fastRankRelevance).toBeGreaterThanOrEqual(7);
      }

      // Verify sorted descending
      for (let i = 1; i < result.length; i++) {
        expect(result[i].fastRankRelevance).toBeLessThanOrEqual(result[i - 1].fastRankRelevance);
      }
    });
  });

  describe("getStrategies", () => {
    it("returns attack strategies", async () => {
      const result = await caller.algorithmIntelligence.getStrategies();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const strategy = result[0];
      expect(typeof strategy.name).toBe("string");
      expect(typeof strategy.description).toBe("string");
      expect(typeof strategy.timeframe).toBe("string");
      expect(typeof strategy.riskLevel).toBe("number");
      expect(strategy.riskLevel).toBeGreaterThanOrEqual(1);
      expect(strategy.riskLevel).toBeLessThanOrEqual(10);
      expect(typeof strategy.successRate).toBe("string");
      expect(Array.isArray(strategy.exploitedFactors)).toBe(true);
      expect(Array.isArray(strategy.steps)).toBe(true);
      expect(strategy.steps.length).toBeGreaterThan(0);
    });
  });

  describe("getPenaltyRules", () => {
    it("returns penalty avoidance rules", async () => {
      const result = await caller.algorithmIntelligence.getPenaltyRules();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const rule = result[0];
      expect(typeof rule.name).toBe("string");
      expect(typeof rule.description).toBe("string");
      expect(typeof rule.severity).toBe("string");
      expect(["critical", "high", "medium"]).toContain(rule.severity);
      expect(Array.isArray(rule.triggers)).toBe(true);
      expect(rule.triggers.length).toBeGreaterThan(0);
      expect(Array.isArray(rule.avoidance)).toBe(true);
      expect(rule.avoidance.length).toBeGreaterThan(0);
      expect(Array.isArray(rule.relatedFactors)).toBe(true);
    });
  });

  describe("getExploitable", () => {
    it("returns only exploitable factors", async () => {
      const result = await caller.algorithmIntelligence.getExploitable();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      for (const factor of result) {
        expect(factor.exploitable).toBe(true);
      }
    });
  });

  describe("getCritical", () => {
    it("returns only critical impact factors", async () => {
      const result = await caller.algorithmIntelligence.getCritical();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      for (const factor of result) {
        expect(factor.impact).toBe("critical");
      }
    });
  });
});
