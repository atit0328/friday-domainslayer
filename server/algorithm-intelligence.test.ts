import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  RANKING_FACTORS,
  scoreContent,
  generateOptimizedContentPrompt,
  calculateLinkVelocity,
  FAST_RANKING_STRATEGIES,
  PENALTY_RULES,
  type ContentScore,
} from "./google-algorithm-intelligence";

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

  // ═══════════════════════════════════════════════
  //  EXPANDED RANKING FACTORS (222 total)
  // ═══════════════════════════════════════════════

  describe("expanded ranking factors database", () => {
    it("has 200+ ranking factors after expansion", () => {
      expect(RANKING_FACTORS.length).toBeGreaterThanOrEqual(200);
    });

    it("covers all 9 factor categories", () => {
      const categories = new Set(RANKING_FACTORS.map(f => f.category));
      expect(categories.size).toBe(9);
      expect(categories.has("domain")).toBe(true);
      expect(categories.has("page_level")).toBe(true);
      expect(categories.has("site_level")).toBe(true);
      expect(categories.has("backlink")).toBe(true);
      expect(categories.has("user_interaction")).toBe(true);
      expect(categories.has("special_algorithm")).toBe(true);
      expect(categories.has("brand_signal")).toBe(true);
      expect(categories.has("on_site_spam")).toBe(true);
      expect(categories.has("off_site_spam")).toBe(true);
    });

    it("each factor has all required fields", () => {
      for (const factor of RANKING_FACTORS) {
        expect(typeof factor.id).toBe("number");
        expect(typeof factor.name).toBe("string");
        expect(factor.name.length).toBeGreaterThan(0);
        expect(typeof factor.description).toBe("string");
        expect(factor.description.length).toBeGreaterThan(0);
        expect(typeof factor.category).toBe("string");
        expect(typeof factor.impact).toBe("string");
        expect(["critical", "high", "medium", "low", "minimal"]).toContain(factor.impact);
        expect(typeof factor.exploitable).toBe("boolean");
        expect(typeof factor.fastRankRelevance).toBe("number");
        expect(factor.fastRankRelevance).toBeGreaterThanOrEqual(1);
        expect(factor.fastRankRelevance).toBeLessThanOrEqual(10);
        expect(typeof factor.confirmed).toBe("boolean");
      }
    });

    it("has significant number of exploitable factors", () => {
      const exploitable = RANKING_FACTORS.filter(f => f.exploitable);
      expect(exploitable.length).toBeGreaterThan(30);
    });

    it("has critical and high impact factors", () => {
      const critical = RANKING_FACTORS.filter(f => f.impact === "critical");
      const high = RANKING_FACTORS.filter(f => f.impact === "high");
      expect(critical.length).toBeGreaterThan(5);
      expect(high.length).toBeGreaterThan(10);
    });

    it("has factors with exploit tactics", () => {
      const withTactics = RANKING_FACTORS.filter(f => f.exploitTactics && f.exploitTactics.length > 0);
      expect(withTactics.length).toBeGreaterThan(20);
    });

    it("has factors with penalty triggers", () => {
      const withPenalties = RANKING_FACTORS.filter(f => f.penaltyTriggers && f.penaltyTriggers.length > 0);
      expect(withPenalties.length).toBeGreaterThan(10);
    });

    it("has factors with evasion tips", () => {
      const withEvasion = RANKING_FACTORS.filter(f => f.evasionTips && f.evasionTips.length > 0);
      expect(withEvasion.length).toBeGreaterThan(10);
    });

    it("has high fast-rank relevance factors (>=8)", () => {
      const fastRank = RANKING_FACTORS.filter(f => f.fastRankRelevance >= 8);
      expect(fastRank.length).toBeGreaterThan(10);
    });

    it("has no duplicate factor IDs", () => {
      const ids = RANKING_FACTORS.map(f => f.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  // ═══════════════════════════════════════════════
  //  CONTENT SCORING ENGINE
  // ═══════════════════════════════════════════════

  describe("scoreContent", () => {
    it("scores well-optimized content highly", () => {
      const score = scoreContent({
        title: "คาสิโนออนไลน์ - คู่มือสมบูรณ์สำหรับผู้เริ่มต้น 2026",
        content: `<h1>คาสิโนออนไลน์ คู่มือสมบูรณ์</h1>
          <p>คาสิโนออนไลน์ เป็นรูปแบบความบันเทิงที่ได้รับความนิยมอย่างมากในปัจจุบัน บทความนี้จะพาคุณทำความรู้จักกับคาสิโนออนไลน์อย่างละเอียด</p>
          <h2>ทำไมต้องเล่นคาสิโนออนไลน์</h2>
          <p>คาสิโนออนไลน์ มีข้อดีหลายประการ ทั้งความสะดวกสบาย ความปลอดภัย และโบนัสที่หลากหลาย</p>
          <h2>วิธีเลือกคาสิโนออนไลน์ที่ดี</h2>
          <p>การเลือกคาสิโนออนไลน์ที่ดีนั้นต้องพิจารณาหลายปัจจัย</p>
          <ul><li>ใบอนุญาต</li><li>ความปลอดภัย</li><li>โบนัส</li></ul>
          ${"<p>เนื้อหาเพิ่มเติมเกี่ยวกับคาสิโนออนไลน์ที่ครอบคลุมทุกแง่มุม</p>".repeat(50)}
          <h2>คำถามที่พบบ่อย</h2>
          <p>Q: คาสิโนออนไลน์ปลอดภัยไหม? A: ปลอดภัยหากเลือกเว็บที่มีใบอนุญาต</p>`,
        keyword: "คาสิโนออนไลน์",
        metaDescription: "คู่มือคาสิโนออนไลน์ฉบับสมบูรณ์ 2026 รวมทุกเรื่องที่ต้องรู้ วิธีเลือกเว็บ โบนัส และเคล็ดลับจากผู้เชี่ยวชาญ",
        hasSchema: true,
        hasImages: true,
        hasTOC: true,
      });

      expect(score.overall).toBeGreaterThan(50);
      expect(score.titleOptimization).toBeGreaterThan(0);
      expect(score.keywordPlacement).toBeGreaterThan(0);
      expect(score.contentLength).toBeGreaterThan(0);
      expect(Array.isArray(score.recommendations)).toBe(true);
      expect(Array.isArray(score.penaltyRisks)).toBe(true);
    });

    it("scores thin content low", () => {
      const score = scoreContent({
        title: "Test",
        content: "<p>Short content.</p>",
        keyword: "คาสิโนออนไลน์",
      });

      expect(score.overall).toBeLessThan(30);
      expect(score.recommendations.length).toBeGreaterThan(0);
    });

    it("detects keyword stuffing as penalty risk", () => {
      const keyword = "casino";
      const stuffedContent = Array(100).fill(`${keyword} ${keyword} ${keyword}`).join(" ");
      const score = scoreContent({
        title: `${keyword} ${keyword} ${keyword}`,
        content: stuffedContent,
        keyword,
      });

      expect(score.penaltyRisks.length).toBeGreaterThan(0);
    });

    it("returns all score components", () => {
      const score = scoreContent({
        title: "Test Title with Keyword",
        content: "<p>Some content about the keyword topic with enough words to analyze.</p>".repeat(10),
        keyword: "keyword",
      });

      expect(typeof score.overall).toBe("number");
      expect(typeof score.titleOptimization).toBe("number");
      expect(typeof score.keywordPlacement).toBe("number");
      expect(typeof score.contentLength).toBe("number");
      expect(typeof score.topicDepth).toBe("number");
      expect(typeof score.freshness).toBe("number");
      expect(typeof score.schemaMarkup).toBe("number");
      expect(typeof score.readability).toBe("number");
      expect(typeof score.uniqueness).toBe("number");
      expect(typeof score.eAtSignals).toBe("number");
    });
  });

  // ═══════════════════════════════════════════════
  //  OPTIMIZED CONTENT PROMPT GENERATOR
  // ═══════════════════════════════════════════════

  describe("generateOptimizedContentPrompt", () => {
    it("generates a comprehensive prompt with all ranking factor requirements", () => {
      const prompt = generateOptimizedContentPrompt({
        keyword: "คาสิโนออนไลน์",
        niche: "online gambling",
        language: "Thai",
        targetWordCount: 2000,
      });

      expect(prompt.length).toBeGreaterThan(500);
      expect(prompt).toContain("คาสิโนออนไลน์");
      expect(prompt).toContain("2000");
      expect(prompt).toContain("TITLE");
      expect(prompt).toContain("KEYWORD");
      expect(prompt).toContain("E-A-T");
      expect(prompt).toContain("PENALTY");
      expect(prompt).toContain("Thai");
    });

    it("includes schema markup instructions when enabled", () => {
      const withSchema = generateOptimizedContentPrompt({
        keyword: "test",
        niche: "gambling",
        language: "English",
        includeSchema: true,
      });
      const withoutSchema = generateOptimizedContentPrompt({
        keyword: "test",
        niche: "gambling",
        language: "English",
        includeSchema: false,
      });

      expect(withSchema).toContain("SCHEMA");
      expect(withoutSchema).not.toContain("SCHEMA");
    });
  });

  // ═══════════════════════════════════════════════
  //  LINK VELOCITY CALCULATOR
  // ═══════════════════════════════════════════════

  describe("calculateLinkVelocity", () => {
    it("returns safe link velocity for parasite SEO", () => {
      const velocity = calculateLinkVelocity({
        competitionLevel: "high",
        existingLinks: 50,
        domainAge: 365,
        isParasiteSEO: true,
      });

      expect(Array.isArray(velocity.daily)).toBe(true);
      expect(velocity.daily.length).toBe(7);
      expect(typeof velocity.total).toBe("number");
      expect(velocity.total).toBeGreaterThan(0);
      expect(typeof velocity.maxPerDay).toBe("number");
      expect(velocity.maxPerDay).toBeGreaterThan(0);
    });

    it("returns lower velocity for new domains", () => {
      const newDomain = calculateLinkVelocity({
        competitionLevel: "medium",
        existingLinks: 0,
        domainAge: 7,
        isParasiteSEO: false,
      });
      const oldDomain = calculateLinkVelocity({
        competitionLevel: "medium",
        existingLinks: 1000,
        domainAge: 3650,
        isParasiteSEO: false,
      });

      expect(newDomain.total).toBeLessThanOrEqual(oldDomain.total);
    });
  });

  // ═══════════════════════════════════════════════
  //  STRATEGIES & PENALTY RULES
  // ═══════════════════════════════════════════════

  describe("strategies and penalty rules", () => {
    it("has ranking strategies with valid structure", () => {
      expect(FAST_RANKING_STRATEGIES.length).toBeGreaterThan(0);
      for (const strategy of FAST_RANKING_STRATEGIES) {
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
      }
    });

    it("has penalty rules with valid structure", () => {
      expect(PENALTY_RULES.length).toBeGreaterThan(0);
      for (const rule of PENALTY_RULES) {
        expect(typeof rule.name).toBe("string");
        expect(typeof rule.description).toBe("string");
        expect(typeof rule.severity).toBe("string");
        expect(["critical", "high", "medium"]).toContain(rule.severity);
        expect(Array.isArray(rule.triggers)).toBe(true);
        expect(rule.triggers.length).toBeGreaterThan(0);
        expect(Array.isArray(rule.avoidance)).toBe(true);
        expect(rule.avoidance.length).toBeGreaterThan(0);
        expect(Array.isArray(rule.relatedFactors)).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════
  //  tRPC ROUTER TESTS
  // ═══════════════════════════════════════════════

  describe("tRPC getOverview", () => {
    it("returns overview with 200+ total factors", async () => {
      const result = await caller.algorithmIntelligence.getOverview();

      expect(result).toBeDefined();
      expect(result.totalFactors).toBeGreaterThanOrEqual(200);
      expect(result.exploitable).toBeGreaterThan(0);
      expect(result.critical).toBeGreaterThan(0);
      expect(result.highFastRank).toBeGreaterThan(0);
      expect(result.strategies).toBeGreaterThan(0);
      expect(result.penaltyRules).toBeGreaterThan(0);
      expect(result.categoryBreakdown.length).toBe(9);
      expect(result.impactBreakdown.length).toBeGreaterThan(0);
    });
  });

  describe("tRPC getFactors", () => {
    it("returns 200+ factors", async () => {
      const result = await caller.algorithmIntelligence.getFactors();
      expect(result.factors.length).toBeGreaterThanOrEqual(200);
      expect(result.total).toBe(result.factors.length);
    });

    it("filters by category correctly", async () => {
      const result = await caller.algorithmIntelligence.getFactors({ category: "backlink" });
      expect(result.factors.length).toBeGreaterThan(0);
      for (const factor of result.factors) {
        expect(factor.category).toBe("backlink");
      }
    });

    it("filters exploitable only", async () => {
      const result = await caller.algorithmIntelligence.getFactors({ exploitableOnly: true });
      expect(result.factors.length).toBeGreaterThan(0);
      for (const factor of result.factors) {
        expect(factor.exploitable).toBe(true);
      }
    });

    it("filters by minFastRankRelevance", async () => {
      const result = await caller.algorithmIntelligence.getFactors({ minFastRankRelevance: 8 });
      expect(result.factors.length).toBeGreaterThan(0);
      for (const factor of result.factors) {
        expect(factor.fastRankRelevance).toBeGreaterThanOrEqual(8);
      }
    });
  });

  describe("tRPC getFastRankFactors", () => {
    it("returns factors sorted by fast-rank relevance", async () => {
      const result = await caller.algorithmIntelligence.getFastRankFactors({ minScore: 7 });
      expect(result.length).toBeGreaterThan(0);
      for (const factor of result) {
        expect(factor.fastRankRelevance).toBeGreaterThanOrEqual(7);
      }
      for (let i = 1; i < result.length; i++) {
        expect(result[i].fastRankRelevance).toBeLessThanOrEqual(result[i - 1].fastRankRelevance);
      }
    });
  });

  describe("tRPC getStrategies", () => {
    it("returns attack strategies", async () => {
      const result = await caller.algorithmIntelligence.getStrategies();
      expect(result.length).toBeGreaterThan(0);
      const strategy = result[0];
      expect(typeof strategy.name).toBe("string");
      expect(typeof strategy.riskLevel).toBe("number");
      expect(Array.isArray(strategy.steps)).toBe(true);
    });
  });

  describe("tRPC getPenaltyRules", () => {
    it("returns penalty avoidance rules", async () => {
      const result = await caller.algorithmIntelligence.getPenaltyRules();
      expect(result.length).toBeGreaterThan(0);
      const rule = result[0];
      expect(typeof rule.name).toBe("string");
      expect(["critical", "high", "medium"]).toContain(rule.severity);
      expect(rule.triggers.length).toBeGreaterThan(0);
      expect(rule.avoidance.length).toBeGreaterThan(0);
    });
  });

  describe("tRPC getExploitable", () => {
    it("returns only exploitable factors", async () => {
      const result = await caller.algorithmIntelligence.getExploitable();
      expect(result.length).toBeGreaterThan(0);
      for (const factor of result) {
        expect(factor.exploitable).toBe(true);
      }
    });
  });

  describe("tRPC getCritical", () => {
    it("returns only critical impact factors", async () => {
      const result = await caller.algorithmIntelligence.getCritical();
      expect(result.length).toBeGreaterThan(0);
      for (const factor of result) {
        expect(factor.impact).toBe("critical");
      }
    });
  });
});
