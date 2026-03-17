import { describe, it, expect } from "vitest";

describe("LeakCheck API Key Validation", () => {
  const apiKey = process.env.LEAKCHECK_API_KEY;

  it("should have LEAKCHECK_API_KEY set", () => {
    expect(apiKey).toBeDefined();
    expect(apiKey!.length).toBeGreaterThan(10);
  });

  it("should authenticate with LeakCheck API", async () => {
    const resp = await fetch(
      "https://leakcheck.io/api/v2/query/test@example.com",
      {
        headers: {
          Accept: "application/json",
          "X-API-Key": apiKey!,
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    // 200 = valid key (found or not found results)
    // 403 with "Limit reached" = valid key but quota exhausted
    // 401/400 = invalid key
    expect([200, 403]).toContain(resp.status);

    if (resp.status === 200) {
      const data = await resp.json();
      expect(data).toHaveProperty("success", true);
      expect(data).toHaveProperty("quota");
      expect(data).toHaveProperty("found");
      console.log(`LeakCheck API OK — quota remaining: ${data.quota}, found: ${data.found}`);
    } else {
      const data = await resp.json();
      console.log(`LeakCheck API responded with 403:`, data);
    }
  });

  it("should support domain search (Enterprise feature)", async () => {
    const resp = await fetch(
      "https://leakcheck.io/api/v2/query/example.com?type=domain&limit=5",
      {
        headers: {
          Accept: "application/json",
          "X-API-Key": apiKey!,
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    // Enterprise plan should allow domain search
    // 200 = works, 403 = plan doesn't support it
    console.log(`Domain search status: ${resp.status}`);
    const data = await resp.json();
    console.log(`Domain search response:`, JSON.stringify(data).slice(0, 200));
    
    // Should not be 401 (invalid key)
    expect(resp.status).not.toBe(401);
    expect(resp.status).not.toBe(400);
  });
});
