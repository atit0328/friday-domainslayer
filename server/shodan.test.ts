import { describe, it, expect } from "vitest";

describe("Shodan API Key Validation", () => {
  it("should have SHODAN_API_KEY set", () => {
    const key = process.env.SHODAN_API_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBeGreaterThan(10);
  });

  it("should be able to query Shodan API info endpoint", async () => {
    const key = process.env.SHODAN_API_KEY;
    if (!key) {
      console.warn("SHODAN_API_KEY not set, skipping API test");
      return;
    }
    const res = await fetch(`https://api.shodan.io/api-info?key=${key}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    // Shodan API info returns plan, query_credits, scan_credits etc.
    expect(data).toHaveProperty("query_credits");
  });
});
