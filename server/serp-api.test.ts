import { describe, it, expect } from "vitest";
import { getAccountInfo, searchGoogle, findDomainRank } from "./serp-api";

describe("SerpAPI", () => {
  it("should get account info", async () => {
    const info = await getAccountInfo();
    
    if (info) {
      console.log("SerpAPI account:", JSON.stringify(info, null, 2));
      expect(info.plan).toBeTruthy();
      expect(info.searchesPerMonth).toBeGreaterThan(0);
    } else {
      console.warn("SerpAPI account info not available");
    }
  }, 15000);

  it("should search Google for 'SEO tools'", async () => {
    const results = await searchGoogle("SEO tools", { num: 10 });
    
    if (results) {
      console.log(`SerpAPI: Found ${results.results.length} results for "SEO tools"`);
      console.log("Top 3:", results.results.slice(0, 3).map(r => `#${r.position} ${r.displayedLink} — ${r.title}`));
      expect(results.results.length).toBeGreaterThan(0);
      expect(results.source).toBe("serpapi");
    } else {
      console.warn("SerpAPI search returned null — key may be invalid");
    }
  }, 30000);

  it("should find moz.com rank for 'domain authority checker'", async () => {
    const rank = await findDomainRank("domain authority checker", "moz.com", { num: 30 });
    
    if (rank) {
      console.log(`moz.com rank for "domain authority checker": position=${rank.position}`);
      if (rank.position) {
        expect(rank.position).toBeGreaterThan(0);
        expect(rank.position).toBeLessThanOrEqual(30);
      }
    }
  }, 30000);
});
