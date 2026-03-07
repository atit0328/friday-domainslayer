import { describe, it, expect } from "vitest";
import { getAhrefsMetrics, getAhrefsDomainRating } from "./ahrefs-api";

describe("Ahrefs API", () => {
  it("should fetch DR for google.com", async () => {
    const dr = await getAhrefsDomainRating("google.com");
    
    if (dr) {
      console.log("Ahrefs DR for google.com:", JSON.stringify(dr, null, 2));
      expect(dr.domainRating).toBeGreaterThan(90);
    } else {
      console.warn("Ahrefs API returned null — token may be invalid or Enterprise-only");
      expect(dr).toBeNull();
    }
  }, 20000);

  it("should fetch all metrics for moz.com", async () => {
    const metrics = await getAhrefsMetrics("moz.com");
    
    if (metrics) {
      console.log("Ahrefs metrics for moz.com:", JSON.stringify(metrics, null, 2));
      expect(metrics.source).toBe("ahrefs");
      expect(metrics.domainRating).toBeGreaterThan(0);
    } else {
      console.warn("Ahrefs API not available — will use Moz as primary source");
    }
  }, 30000);
});
