/**
 * Tests for domain-metrics.ts — Real API + Formula-based scoring
 * Tests the formula calculations, data fetching, and integration
 */
import { describe, it, expect } from "vitest";

// ═══ Module Export Tests ═══
describe("Domain Metrics Module Exports", () => {
  it("should export fetchDomainMetrics function", async () => {
    const mod = await import("./domain-metrics");
    expect(mod.fetchDomainMetrics).toBeDefined();
    expect(typeof mod.fetchDomainMetrics).toBe("function");
  });

  it("should export fetchWaybackData function", async () => {
    const mod = await import("./domain-metrics");
    expect(mod.fetchWaybackData).toBeDefined();
    expect(typeof mod.fetchWaybackData).toBe("function");
  });

  it("should export DomainMetrics type", async () => {
    const mod = await import("./domain-metrics");
    const fn: (d: string) => Promise<import("./domain-metrics").DomainMetrics> = mod.fetchDomainMetrics;
    expect(fn).toBeDefined();
  });
});

// ═══ Wayback Machine API Tests ═══
describe("Wayback Machine API", () => {
  it("should return proper structure for google.com", async () => {
    const { fetchWaybackData } = await import("./domain-metrics");
    const result = await fetchWaybackData("google.com");
    expect(result).toBeDefined();
    expect(typeof result.snapshots).toBe("number");
    // google.com should have wayback data
    expect(typeof result.available).toBe("boolean");
    expect(result.firstCapture === null || typeof result.firstCapture === "string").toBe(true);
    expect(result.lastCapture === null || typeof result.lastCapture === "string").toBe(true);
  }, 60000);

  it("should handle non-existent domain gracefully", async () => {
    const { fetchWaybackData } = await import("./domain-metrics");
    const result = await fetchWaybackData("thisdomain-does-not-exist-xyz123abc.com");
    expect(result).toBeDefined();
    expect(typeof result.snapshots).toBe("number");
  }, 30000);
});

// ═══ Full Domain Metrics Integration Tests ═══
describe("fetchDomainMetrics Integration", () => {
  it("should return complete metrics for google.com with real SimilarWeb data", async () => {
    const { fetchDomainMetrics } = await import("./domain-metrics");
    const metrics = await fetchDomainMetrics("google.com");

    // Check required fields exist
    expect(metrics.domain).toBe("google.com");
    expect(typeof metrics.da).toBe("number");
    expect(typeof metrics.dr).toBe("number");
    expect(typeof metrics.ss).toBe("number");
    expect(typeof metrics.bl).toBe("number");
    expect(typeof metrics.rf).toBe("number");
    expect(typeof metrics.tf).toBe("number");
    expect(typeof metrics.cf).toBe("number");
    expect(typeof metrics.healthScore).toBe("number");
    expect(typeof metrics.isLive).toBe("boolean");
    expect(typeof metrics.hasSSL).toBe("boolean");

    // SimilarWeb should return real data for google.com
    expect(metrics.globalRank).toBe(1); // Google is #1
    expect(metrics.totalVisits).toBeGreaterThan(1000000000); // Billions of visits
    expect(metrics.bounceRate).toBeGreaterThan(0);
    expect(metrics.bounceRate).toBeLessThan(1);

    // With SimilarWeb data, DA should be very high
    expect(metrics.da).toBeGreaterThan(50);
    expect(metrics.dr).toBeGreaterThan(40);

    // Google should be live with SSL
    expect(metrics.isLive).toBe(true);
    expect(metrics.hasSSL).toBe(true);

    // Data sources should show SimilarWeb available
    expect(metrics.dataSources).toBeDefined();
    expect(metrics.dataSources.similarweb).toBe(true);

    // Fetched timestamp
    expect(metrics.fetchedAt).toBeTruthy();
    expect(metrics.tld).toBe("com");
  }, 90000);

  it("should return metrics with correct ranges", async () => {
    const { fetchDomainMetrics } = await import("./domain-metrics");
    const metrics = await fetchDomainMetrics("github.com");

    // All scores should be 0-100
    expect(metrics.da).toBeGreaterThanOrEqual(0);
    expect(metrics.da).toBeLessThanOrEqual(100);
    expect(metrics.dr).toBeGreaterThanOrEqual(0);
    expect(metrics.dr).toBeLessThanOrEqual(100);
    expect(metrics.ss).toBeGreaterThanOrEqual(0);
    expect(metrics.ss).toBeLessThanOrEqual(100);
    expect(metrics.tf).toBeGreaterThanOrEqual(0);
    expect(metrics.tf).toBeLessThanOrEqual(100);
    expect(metrics.cf).toBeGreaterThanOrEqual(0);
    expect(metrics.cf).toBeLessThanOrEqual(100);
    expect(metrics.healthScore).toBeGreaterThanOrEqual(0);
    expect(metrics.healthScore).toBeLessThanOrEqual(100);

    // Backlinks and referring domains should be non-negative
    expect(metrics.bl).toBeGreaterThanOrEqual(0);
    expect(metrics.rf).toBeGreaterThanOrEqual(0);
  }, 90000);

  it("should handle domain with https:// prefix", async () => {
    const { fetchDomainMetrics } = await import("./domain-metrics");
    const metrics = await fetchDomainMetrics("https://example.com");
    expect(metrics.domain).toBe("example.com");
  }, 60000);

  it("should handle domain with path", async () => {
    const { fetchDomainMetrics } = await import("./domain-metrics");
    const metrics = await fetchDomainMetrics("example.com/some/path");
    expect(metrics.domain).toBe("example.com");
  }, 60000);

  it("should return low scores for non-existent domain", async () => {
    const { fetchDomainMetrics } = await import("./domain-metrics");
    const metrics = await fetchDomainMetrics("nonexistent-domain-xyz123abc456.com");

    // Non-existent domain should have low authority
    expect(metrics.da).toBeLessThan(20);
    expect(metrics.dr).toBeLessThan(20);
    expect(metrics.isLive).toBe(false);
    expect(metrics.healthScore).toBeLessThan(30);
    // SimilarWeb should not have data
    expect(metrics.dataSources.similarweb).toBe(false);
  }, 90000);

  it("should correctly extract TLD", async () => {
    const { fetchDomainMetrics } = await import("./domain-metrics");
    const metrics = await fetchDomainMetrics("example.com");
    expect(metrics.tld).toBe("com");
  }, 60000);

  it("should return SimilarWeb data for small domain (may be unavailable)", async () => {
    const { fetchDomainMetrics } = await import("./domain-metrics");
    const metrics = await fetchDomainMetrics("ttos168.com");

    // Small domain may not have SimilarWeb data
    expect(typeof metrics.dataSources.similarweb).toBe("boolean");
    // Spam score should be reasonable (not the old AI-estimated 65)
    expect(typeof metrics.ss).toBe("number");
    expect(metrics.ss).toBeGreaterThanOrEqual(0);
    expect(metrics.ss).toBeLessThanOrEqual(100);
  }, 90000);
});

// ═══ Spam Score Sanity Tests ═══
describe("Spam Score Sanity", () => {
  it("should give low spam score to google.com (established domain)", async () => {
    const { fetchDomainMetrics } = await import("./domain-metrics");
    const metrics = await fetchDomainMetrics("google.com");
    // Google has SSL, old domain, lots of content — spam score should be low
    expect(metrics.ss).toBeLessThan(20);
  }, 90000);
});
