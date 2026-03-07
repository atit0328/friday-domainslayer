import { describe, it, expect } from "vitest";

describe("Shodan API Key Validation", () => {
  it("should have SHODAN_API_KEY environment variable set", () => {
    const key = process.env.SHODAN_API_KEY;
    expect(key).toBeDefined();
    expect(key).not.toBe("");
    expect(typeof key).toBe("string");
    expect(key!.length).toBeGreaterThan(10);
  });

  it("should authenticate with Shodan API using the provided key", async () => {
    const key = process.env.SHODAN_API_KEY;
    if (!key) {
      throw new Error("SHODAN_API_KEY not set");
    }

    // Use the /api-info endpoint which is lightweight and validates the key
    const response = await fetch(`https://api.shodan.io/api-info?key=${key}`);
    const data = await response.json();

    // If key is valid, we get 200 with plan info
    // If key is invalid, we get 401 or error
    expect(response.status).toBe(200);
    expect(data).toHaveProperty("plan");
    console.log("Shodan API validation result:", {
      plan: data.plan,
      queryCredits: data.query_credits,
      scanCredits: data.scan_credits,
    });
  }, 15000);
});
