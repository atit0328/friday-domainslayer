/**
 * Vitest tests for Content Freshness Engine + Competitor Gap Analyzer
 * Unit tests only (no LLM/network calls) for fast CI execution
 */
import { describe, it, expect, beforeEach } from "vitest";

// ═══════════════════════════════════════════════
//  Content Freshness Engine Tests
// ═══════════════════════════════════════════════

describe("Content Freshness Engine", () => {
  let freshnessEngine: typeof import("./content-freshness-engine");

  beforeEach(async () => {
    freshnessEngine = await import("./content-freshness-engine");
  });

  it("should track content and return tracked items", () => {
    const tracked = freshnessEngine.trackContent({
      url: "https://telegra.ph/test-freshness-article",
      title: "Test Freshness Article",
      keyword: "test keyword",
      platform: "telegraph",
      originalContent: "This is the original content for testing freshness.",
      domain: "test-freshness.com",
    });

    expect(tracked).toBeTruthy();
    expect(tracked.id).toBeTruthy();
    expect(typeof tracked.id).toBe("string");
    expect(tracked.url).toBe("https://telegra.ph/test-freshness-article");
    expect(tracked.keyword).toBe("test keyword");
    expect(tracked.platform).toBe("telegraph");
    expect(tracked.domain).toBe("test-freshness.com");
    expect(tracked.status).toBe("fresh");
    expect(tracked.refreshCount).toBe(0);

    const allTracked = freshnessEngine.getTrackedContent("test-freshness.com");
    const found = allTracked.find(t => t.id === tracked.id);
    expect(found).toBeTruthy();
  });

  it("should calculate staleness scores correctly", () => {
    freshnessEngine.trackContent({
      url: "https://telegra.ph/stale-test-1",
      title: "Stale Test 1",
      keyword: "stale keyword",
      platform: "telegraph",
      originalContent: "Content that will become stale.",
      domain: "stale-test.com",
    });

    freshnessEngine.calculateStaleness();

    const tracked = freshnessEngine.getTrackedContent("stale-test.com");
    expect(tracked.length).toBeGreaterThan(0);
    expect(tracked[0].stalenessScore).toBeDefined();
    expect(typeof tracked[0].stalenessScore).toBe("number");
  });

  it("should return stale content filtered by domain", () => {
    freshnessEngine.trackContent({
      url: "https://telegra.ph/domain-a-1",
      title: "Domain A Content",
      keyword: "domain a keyword",
      platform: "telegraph",
      originalContent: "Content for domain A.",
      domain: "domain-a.com",
    });

    freshnessEngine.trackContent({
      url: "https://telegra.ph/domain-b-1",
      title: "Domain B Content",
      keyword: "domain b keyword",
      platform: "telegraph",
      originalContent: "Content for domain B.",
      domain: "domain-b.com",
    });

    const domainAContent = freshnessEngine.getTrackedContent("domain-a.com");
    const domainBContent = freshnessEngine.getTrackedContent("domain-b.com");

    expect(domainAContent.every(c => c.domain === "domain-a.com")).toBe(true);
    expect(domainBContent.every(c => c.domain === "domain-b.com")).toBe(true);
  });

  it("should create default freshness config with correct values", () => {
    const config = freshnessEngine.createDefaultFreshnessConfig(
      "example.com",
      "gambling",
      "th"
    );

    expect(config.domain).toBe("example.com");
    expect(config.niche).toBe("gambling");
    expect(config.language).toBe("th");
    expect(config.maxRefreshesPerCycle).toBeGreaterThan(0);
    expect(config.refreshIntervalHours).toBeGreaterThan(0);
    expect(config.minWordsToAdd).toBeGreaterThan(0);
    expect(config.maxWordsToAdd).toBeGreaterThan(0);
    expect(config.prioritizeRanking).toBe(true);
    expect(config.addNewSections).toBe(true);
    expect(config.updateDates).toBe(true);
    expect(config.refreshMetaDescriptions).toBe(true);
    expect(config.expandWordCount).toBe(true);
  });

  it("should return freshness summary with correct structure", () => {
    const summary = freshnessEngine.getFreshnessSummary();

    expect(summary).toHaveProperty("totalTracked");
    expect(summary).toHaveProperty("fresh");
    expect(summary).toHaveProperty("aging");
    expect(summary).toHaveProperty("stale");
    expect(summary).toHaveProperty("totalRefreshes");
    expect(summary).toHaveProperty("avgStaleness");
    expect(summary).toHaveProperty("lastCycleAt");
    expect(typeof summary.totalTracked).toBe("number");
    expect(typeof summary.fresh).toBe("number");
    expect(typeof summary.stale).toBe("number");
    expect(typeof summary.avgStaleness).toBe("number");
  });

  it("should update content rank", () => {
    const tracked = freshnessEngine.trackContent({
      url: "https://telegra.ph/rank-test",
      title: "Rank Test",
      keyword: "rank keyword",
      platform: "telegraph",
      originalContent: "Content for rank testing.",
      domain: "rank-test.com",
    });

    freshnessEngine.updateContentRank(tracked.id, 5);

    const allTracked = freshnessEngine.getTrackedContent("rank-test.com");
    const found = allTracked.find(t => t.id === tracked.id);
    expect(found).toBeTruthy();
    expect(found!.currentRank).toBe(5);
  });

  it("should return cycle reports as array", () => {
    const reports = freshnessEngine.getCycleReports();
    expect(Array.isArray(reports)).toBe(true);
  });

  it("should track content with telegraph token and path", () => {
    const tracked = freshnessEngine.trackContent({
      url: "https://telegra.ph/test-with-token",
      title: "Token Test",
      keyword: "token keyword",
      platform: "telegraph",
      originalContent: "Content with telegraph token.",
      domain: "token-test.com",
      telegraphToken: "test-token-123",
      telegraphPath: "test-with-token",
    });

    expect(tracked.telegraphToken).toBe("test-token-123");
    expect(tracked.telegraphPath).toBe("test-with-token");
  });

  it("should track content with initial rank and set priority", () => {
    const highRank = freshnessEngine.trackContent({
      url: "https://telegra.ph/high-rank",
      title: "High Rank",
      keyword: "high rank keyword",
      platform: "telegraph",
      originalContent: "High ranking content.",
      domain: "priority-test.com",
      currentRank: 5,
    });

    const lowRank = freshnessEngine.trackContent({
      url: "https://telegra.ph/low-rank",
      title: "Low Rank",
      keyword: "low rank keyword",
      platform: "telegraph",
      originalContent: "Low ranking content.",
      domain: "priority-test.com",
      currentRank: 50,
    });

    // Rank <= 20 should get priority 9, otherwise 5
    expect(highRank.priority).toBe(9);
    expect(lowRank.priority).toBe(5);
  });

  it("should get all tracked content without domain filter", () => {
    freshnessEngine.trackContent({
      url: "https://telegra.ph/no-filter-1",
      title: "No Filter 1",
      keyword: "no filter",
      platform: "telegraph",
      originalContent: "Content 1.",
      domain: "filter-test-a.com",
    });

    freshnessEngine.trackContent({
      url: "https://telegra.ph/no-filter-2",
      title: "No Filter 2",
      keyword: "no filter",
      platform: "telegraph",
      originalContent: "Content 2.",
      domain: "filter-test-b.com",
    });

    const all = freshnessEngine.getTrackedContent();
    expect(all.length).toBeGreaterThanOrEqual(2);
    const domains = new Set(all.map(c => c.domain));
    expect(domains.size).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════
//  Competitor Gap Analyzer Tests
// ═══════════════════════════════════════════════

describe("Competitor Gap Analyzer", () => {
  let gapAnalyzer: typeof import("./competitor-gap-analyzer");

  beforeEach(async () => {
    gapAnalyzer = await import("./competitor-gap-analyzer");
  });

  it("should create default gap config with correct values", () => {
    const config = gapAnalyzer.createDefaultGapConfig(
      "mysite.com",
      "https://mysite.com",
      ["keyword1", "keyword2"],
      "gambling",
      "th"
    );

    expect(config.domain).toBe("mysite.com");
    expect(config.targetUrl).toBe("https://mysite.com");
    expect(config.seedKeywords).toEqual(["keyword1", "keyword2"]);
    expect(config.niche).toBe("gambling");
    expect(config.language).toBe("th");
    expect(config.maxCompetitors).toBeGreaterThan(0);
    expect(config.maxGapsToFill).toBeGreaterThan(0);
    expect(config.minOpportunityScore).toBeGreaterThan(0);
  });

  it("should return gap summary with correct structure", () => {
    const summary = gapAnalyzer.getGapSummary();

    expect(summary).toHaveProperty("totalDomains");
    expect(summary).toHaveProperty("totalGaps");
    expect(summary).toHaveProperty("filled");
    expect(summary).toHaveProperty("highOpportunity");
    expect(summary).toHaveProperty("ranking");
    expect(summary).toHaveProperty("avgOpportunityScore");
    expect(typeof summary.totalDomains).toBe("number");
    expect(typeof summary.totalGaps).toBe("number");
    expect(typeof summary.filled).toBe("number");
    expect(typeof summary.highOpportunity).toBe("number");
    expect(typeof summary.avgOpportunityScore).toBe("number");
  });

  it("should return all analyses as array", () => {
    const analyses = gapAnalyzer.getAllAnalyses();
    expect(Array.isArray(analyses)).toBe(true);
  });

  it("should return null for non-existent domain analysis", () => {
    const analysis = gapAnalyzer.getAnalysis("nonexistent-domain-xyz.com");
    expect(analysis).toBeNull();
  });

  it("should create config with different niches", () => {
    const gamblingConfig = gapAnalyzer.createDefaultGapConfig(
      "site1.com", "https://site1.com", ["kw1"], "gambling", "th"
    );
    const techConfig = gapAnalyzer.createDefaultGapConfig(
      "site2.com", "https://site2.com", ["kw2"], "technology", "en"
    );

    expect(gamblingConfig.niche).toBe("gambling");
    expect(techConfig.niche).toBe("technology");
    expect(gamblingConfig.language).toBe("th");
    expect(techConfig.language).toBe("en");
  });

  it("should handle empty seed keywords in config", () => {
    const config = gapAnalyzer.createDefaultGapConfig(
      "empty-kw.com",
      "https://empty-kw.com",
      [],
      "gambling",
      "th"
    );

    expect(config.seedKeywords).toEqual([]);
    expect(config.domain).toBe("empty-kw.com");
  });

  it("should return zero values in summary when no analyses exist", () => {
    const summary = gapAnalyzer.getGapSummary();
    // Without any analyses run, all counts should be 0
    expect(summary.avgOpportunityScore).toBe(0);
  });
});
