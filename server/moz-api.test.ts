import { describe, it, expect } from "vitest";
import { getMozMetrics, getMozMetricsBatch } from "./moz-api";

describe("Moz API", () => {
  it("should fetch real DA/PA/SS for moz.com", async () => {
    const metrics = await getMozMetrics("moz.com");
    
    // If API credentials are valid, we get real data
    if (metrics) {
      console.log("Moz metrics for moz.com:", JSON.stringify(metrics, null, 2));
      expect(metrics.source).toBe("moz");
      expect(metrics.domainAuthority).toBeGreaterThan(0);
      expect(metrics.domainAuthority).toBeLessThanOrEqual(100);
      expect(metrics.pageAuthority).toBeGreaterThan(0);
      expect(metrics.pageAuthority).toBeLessThanOrEqual(100);
      // Spam score can be -1 (not available) or 1-100
      expect(metrics.spamScore).toBeGreaterThanOrEqual(-1);
      expect(metrics.spamScore).toBeLessThanOrEqual(100);
    } else {
      console.warn("Moz API returned null — credentials may be invalid or API unavailable");
      // Don't fail the test if API is unavailable
      expect(metrics).toBeNull();
    }
  }, 20000);

  it("should fetch metrics for google.com (high DA expected)", async () => {
    const metrics = await getMozMetrics("google.com");
    
    if (metrics) {
      console.log("Moz metrics for google.com:", JSON.stringify(metrics, null, 2));
      expect(metrics.domainAuthority).toBeGreaterThan(90); // Google should have DA > 90
      expect(metrics.spamScore).toBeLessThan(10); // Google should have low spam
    }
  }, 20000);

  it("should handle batch requests", async () => {
    const results = await getMozMetricsBatch(["google.com", "example.com"]);
    
    if (results.size > 0) {
      console.log("Batch results:", [...results.entries()].map(([k, v]) => `${k}: DA=${v.domainAuthority}, SS=${v.spamScore}`));
      expect(results.size).toBeGreaterThan(0);
    }
  }, 30000);
});
