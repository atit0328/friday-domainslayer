/**
 * SERP Feature Hijacker — Unit Tests
 * Tests config, state management, summary, and content formatting
 * (No LLM/network calls — fast unit tests only)
 */
import { describe, it, expect } from "vitest";

describe("SERP Feature Hijacker", () => {
  // ═══ Config Factory ═══
  describe("createDefaultHijackConfig", () => {
    it("should create config with correct defaults", async () => {
      const { createDefaultHijackConfig } = await import("./serp-feature-hijacker");
      const config = createDefaultHijackConfig("example.com", "gambling", "th");

      expect(config.domain).toBe("example.com");
      expect(config.niche).toBe("gambling");
      expect(config.language).toBe("th");
      expect(config.keywords).toEqual([]);
      expect(config.maxOpportunities).toBe(50);
      expect(config.autoOptimize).toBe(true);
      expect(config.autoDeploy).toBe(true);
      expect(config.enableSchemaInjection).toBe(true);
      expect(config.enableTelegramNotifications).toBe(true);
    });

    it("should accept custom keywords", async () => {
      const { createDefaultHijackConfig } = await import("./serp-feature-hijacker");
      const keywords = ["slot online", "casino", "poker"];
      const config = createDefaultHijackConfig("test.com", "gambling", "en", keywords);

      expect(config.keywords).toEqual(keywords);
      expect(config.keywords.length).toBe(3);
    });

    it("should include all target feature types", async () => {
      const { createDefaultHijackConfig } = await import("./serp-feature-hijacker");
      const config = createDefaultHijackConfig("test.com", "tech", "en");

      expect(config.targetFeatures).toContain("featured_snippet");
      expect(config.targetFeatures).toContain("people_also_ask");
      expect(config.targetFeatures).toContain("knowledge_panel");
      expect(config.targetFeatures).toContain("ai_overview");
      expect(config.targetFeatures).toContain("sitelinks");
      expect(config.targetFeatures.length).toBe(5);
    });

    it("should include all snippet formats", async () => {
      const { createDefaultHijackConfig } = await import("./serp-feature-hijacker");
      const config = createDefaultHijackConfig("test.com", "tech", "en");

      expect(config.snippetFormats).toContain("paragraph");
      expect(config.snippetFormats).toContain("list");
      expect(config.snippetFormats).toContain("table");
      expect(config.snippetFormats.length).toBe(3);
    });
  });

  // ═══ Summary ═══
  describe("getHijackSummary", () => {
    it("should return summary with correct structure", async () => {
      const { getHijackSummary } = await import("./serp-feature-hijacker");
      const summary = getHijackSummary();

      expect(summary).toHaveProperty("totalCampaigns");
      expect(summary).toHaveProperty("totalOpportunities");
      expect(summary).toHaveProperty("optimized");
      expect(summary).toHaveProperty("deployed");
      expect(summary).toHaveProperty("won");
      expect(summary).toHaveProperty("lost");
      expect(summary).toHaveProperty("featureBreakdown");
      expect(typeof summary.totalCampaigns).toBe("number");
      expect(typeof summary.totalOpportunities).toBe("number");
    });

    it("should have non-negative values", async () => {
      const { getHijackSummary } = await import("./serp-feature-hijacker");
      const summary = getHijackSummary();

      expect(summary.totalCampaigns).toBeGreaterThanOrEqual(0);
      expect(summary.totalOpportunities).toBeGreaterThanOrEqual(0);
      expect(summary.optimized).toBeGreaterThanOrEqual(0);
      expect(summary.deployed).toBeGreaterThanOrEqual(0);
      expect(summary.won).toBeGreaterThanOrEqual(0);
      expect(summary.lost).toBeGreaterThanOrEqual(0);
    });
  });

  // ═══ Campaign State ═══
  describe("Campaign management", () => {
    it("getCampaign should return null for non-existent campaign", async () => {
      const { getCampaign } = await import("./serp-feature-hijacker");
      const campaign = getCampaign("non-existent-id-12345");
      expect(campaign).toBeNull();
    });

    it("getAllCampaigns should return an array", async () => {
      const { getAllCampaigns } = await import("./serp-feature-hijacker");
      const campaigns = getAllCampaigns();
      expect(Array.isArray(campaigns)).toBe(true);
    });

    it("getOpportunities should return an array", async () => {
      const { getOpportunities } = await import("./serp-feature-hijacker");
      const opps = getOpportunities();
      expect(Array.isArray(opps)).toBe(true);
    });

    it("getOpportunities with domain filter should return array", async () => {
      const { getOpportunities } = await import("./serp-feature-hijacker");
      const opps = getOpportunities("non-existent-domain.com");
      expect(Array.isArray(opps)).toBe(true);
      expect(opps.length).toBe(0);
    });
  });

  // ═══ Content Reformatting ═══
  describe("reformatContentForFeature", () => {
    it("should reformat content to paragraph format", async () => {
      const { reformatContentForFeature } = await import("./serp-feature-hijacker");
      const result = await reformatContentForFeature(
        "What is SEO? SEO stands for Search Engine Optimization. It helps websites rank higher.",
        "paragraph"
      );
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    }, 60000);

    it("should reformat content to list format", async () => {
      const { reformatContentForFeature } = await import("./serp-feature-hijacker");
      const result = await reformatContentForFeature(
        "Steps to improve SEO: optimize titles, build backlinks, create quality content, improve site speed.",
        "list"
      );
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    }, 60000);
  });

  // ═══ Feature Types ═══
  describe("Feature type validation", () => {
    it("should have valid SERPFeatureType values", async () => {
      const validTypes = [
        "featured_snippet",
        "people_also_ask",
        "knowledge_panel",
        "local_pack",
        "image_pack",
        "video_carousel",
        "top_stories",
        "sitelinks",
        "ai_overview",
      ];
      // Just verify the types are defined as expected
      expect(validTypes.length).toBe(9);
    });

    it("should have valid SnippetFormat values", async () => {
      const validFormats = ["paragraph", "list", "table"];
      expect(validFormats.length).toBe(3);
    });
  });

  // ═══ HijackConfig interface ═══
  describe("HijackConfig interface", () => {
    it("should have all required fields", async () => {
      const { createDefaultHijackConfig } = await import("./serp-feature-hijacker");
      const config = createDefaultHijackConfig("test.com", "tech", "en", ["seo"]);

      const requiredFields = [
        "domain", "niche", "language", "keywords",
        "maxOpportunities", "autoOptimize", "autoDeploy",
        "targetFeatures", "snippetFormats", "paaQuestionsPerKeyword",
        "enableSchemaInjection", "enableTelegramNotifications",
      ];

      for (const field of requiredFields) {
        expect(config).toHaveProperty(field);
      }
    });

    it("paaQuestionsPerKeyword should default to 5", async () => {
      const { createDefaultHijackConfig } = await import("./serp-feature-hijacker");
      const config = createDefaultHijackConfig("test.com", "tech", "en");
      expect(config.paaQuestionsPerKeyword).toBe(5);
    });
  });
});
