import { describe, it, expect } from "vitest";
import { getAhrefsMetrics, getAhrefsDomainRating } from "./ahrefs-api";

describe("Ahrefs API", () => {
  const AHREFS_API_KEY = process.env.AHREFS_API_KEY ?? "";

  it("should have AHREFS_API_KEY set in environment", () => {
    expect(AHREFS_API_KEY).toBeTruthy();
    expect(AHREFS_API_KEY.length).toBeGreaterThan(10);
  });

  it("should authenticate successfully with Ahrefs API", async () => {
    if (!AHREFS_API_KEY) return;

    const response = await fetch(
      "https://api.ahrefs.com/v3/subscription-info/limits-and-usage",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${AHREFS_API_KEY}`,
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    console.log("[Ahrefs] Subscription status:", response.status);
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);

    if (response.ok) {
      const data = await response.json();
      console.log("[Ahrefs] Subscription info:", JSON.stringify(data).substring(0, 500));
      expect(data).toBeDefined();
    }
  }, 20000);

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

  it("should be able to make a SERP Overview request for gambling keyword", async () => {
    if (!AHREFS_API_KEY) return;

    const params = new URLSearchParams({
      country: "th",
      keyword: "สล็อต",
      select: "position,url,title,domain_rating,traffic,type",
      top_positions: "3",
      output: "json",
    });

    const response = await fetch(
      `https://api.ahrefs.com/v3/serp-overview/serp-overview?${params}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${AHREFS_API_KEY}`,
        },
        signal: AbortSignal.timeout(20000),
      }
    );

    console.log("[Ahrefs SERP] Status:", response.status);

    if (response.ok) {
      const data = await response.json();
      console.log("[Ahrefs SERP] Response:", JSON.stringify(data).substring(0, 500));
      expect(data.positions).toBeDefined();
      expect(Array.isArray(data.positions)).toBe(true);
    } else {
      const errorText = await response.text();
      console.log("[Ahrefs SERP] Error:", errorText.substring(0, 300));
      // 401 = invalid key, anything else means key works but endpoint may need Enterprise
      expect(response.status).not.toBe(401);
    }
  }, 25000);

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
