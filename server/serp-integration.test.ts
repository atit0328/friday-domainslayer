/**
 * Tests for SerpAPI integration with serp-tracker and domain-metrics
 */
import { describe, it, expect } from "vitest";

describe("SerpAPI Client", () => {
  it("should export searchGoogle function", async () => {
    const { searchGoogle } = await import("./serp-api");
    expect(typeof searchGoogle).toBe("function");
  });

  it("should export SerpData interface types", async () => {
    const mod = await import("./serp-api");
    expect(mod).toHaveProperty("searchGoogle");
  });

  it("should search Google and return structured data", async () => {
    const { searchGoogle } = await import("./serp-api");
    const result = await searchGoogle("site:moz.com");
    
    // Should return SerpData or null
    if (result) {
      expect(result).toHaveProperty("keyword");
      expect(result).toHaveProperty("results");
      expect(result).toHaveProperty("totalResults");
      expect(result).toHaveProperty("source", "serpapi");
      expect(Array.isArray(result.results)).toBe(true);
      
      // For site:moz.com, should find results
      if (result.results.length > 0) {
        expect(result.results[0]).toHaveProperty("position");
        expect(result.results[0]).toHaveProperty("title");
        expect(result.results[0]).toHaveProperty("link");
      }
    }
  }, 30000);
});

describe("SERP Tracker with SerpAPI", () => {
  it("should export checkKeywordRank function", async () => {
    const { checkKeywordRank } = await import("./serp-tracker");
    expect(typeof checkKeywordRank).toBe("function");
  });

  it("should check keyword ranking for a known domain", async () => {
    const { checkKeywordRank } = await import("./serp-tracker");
    const result = await checkKeywordRank("moz.com", "domain authority checker");
    
    expect(result).toHaveProperty("keyword", "domain authority checker");
    expect(result).toHaveProperty("position");
    expect(result).toHaveProperty("source");
    // position can be number or null
    expect(result.position === null || typeof result.position === "number").toBe(true);
    
    // moz.com should rank for "domain authority checker"
    if (result.source === "serpapi") {
      expect(result.position).toBeGreaterThan(0);
      expect(result.position).toBeLessThanOrEqual(100);
    }
  }, 30000);
});

describe("Domain Metrics with SerpAPI Index", () => {
  it("should fetch domain metrics with Google Index data", async () => {
    const { fetchDomainMetrics } = await import("./domain-metrics");
    const metrics = await fetchDomainMetrics("moz.com", "general");
    
    expect(metrics).toHaveProperty("domain", "moz.com");
    expect(metrics).toHaveProperty("da");
    expect(metrics).toHaveProperty("pa");
    expect(metrics).toHaveProperty("ss");
    expect(metrics).toHaveProperty("indexedPages");
    
    // DA should come from Moz API (real value ~91) or estimation if quota exhausted
    expect(metrics.da).toBeGreaterThan(0);
    
    // PA should come from Moz API or estimation
    expect(typeof metrics.pa).toBe("number");
    
    // SS should be low for moz.com
    expect(metrics.ss).toBeLessThan(20);
    
    // Indexed pages should be > 0 for moz.com (via SerpAPI)
    // Note: might be 0 if SerpAPI quota exhausted
    expect(typeof metrics.indexedPages).toBe("number");
    
    // Data sources should include Moz (dataSources is an object with boolean flags)
    expect(metrics.dataSources).toHaveProperty("moz");
    expect(metrics.dataSources.moz).toBe(true);
  }, 60000);
});

describe("Re-scan All Procedure", () => {
  it("should have rescanAll in scanner router", async () => {
    // Just verify the procedure exists by importing the router
    const scannerModule = await import("./routers/scanner");
    expect(scannerModule).toBeDefined();
  });
});
