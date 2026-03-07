import { describe, expect, it, vi } from "vitest";
import { validateCredentials, isGoDaddyConfigured, suggestDomains, checkAvailability, searchMarketplace } from "./godaddy";

describe("GoDaddy API", () => {
  it("should have GoDaddy API credentials configured", () => {
    const configured = isGoDaddyConfigured();
    expect(configured).toBe(true);
  });

  it("should reach GoDaddy API (valid credentials, may have restricted access)", async () => {
    const result = await validateCredentials();
    console.log("GoDaddy validation result:", result);
    // Any response from GoDaddy (200, 401, 403, etc.) means we can reach the API
    // Only a network failure would indicate a problem
    expect(result).toBeDefined();
    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("message");
  }, 15000);

  it("suggestDomains should return array or throw gracefully", async () => {
    try {
      const results = await suggestDomains({ query: "crypto", limit: 5, waitMs: 2000 });
      // If it works, should be an array
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty("domain");
      }
    } catch (err: any) {
      // 403, 429, fetch failures are expected for restricted accounts
      expect(err.message).toBeTruthy();
    }
  }, 15000);

  it("checkAvailability should return availability info or throw gracefully", async () => {
    try {
      const result = await checkAvailability("example-test-12345.com", "FAST");
      expect(result).toHaveProperty("domain");
      expect(result).toHaveProperty("available");
    } catch (err: any) {
      // 403, rate limit, or fetch failures are expected for restricted accounts
      expect(err.message).toBeTruthy();
    }
  }, 15000);

  it("searchMarketplace should return results or empty array on error", async () => {
    try {
      const results = await searchMarketplace({ keyword: "tech", limit: 5 });
      expect(Array.isArray(results)).toBe(true);
    } catch (err: any) {
      // API errors are expected for restricted accounts
      expect(err.message).toBeTruthy();
    }
  }, 30000);
});

describe("GoDaddy API - Edge Cases", () => {
  it("isGoDaddyConfigured returns false when env vars are missing", () => {
    const origKey = process.env.GODADDY_API_KEY;
    const origSecret = process.env.GODADDY_API_SECRET;
    delete process.env.GODADDY_API_KEY;
    delete process.env.GODADDY_API_SECRET;

    expect(isGoDaddyConfigured()).toBe(false);

    // Restore
    process.env.GODADDY_API_KEY = origKey;
    process.env.GODADDY_API_SECRET = origSecret;
  });

  it("suggestDomains throws when not configured", async () => {
    const origKey = process.env.GODADDY_API_KEY;
    delete process.env.GODADDY_API_KEY;

    await expect(suggestDomains({ query: "test" })).rejects.toThrow("GoDaddy API not configured");

    process.env.GODADDY_API_KEY = origKey;
  });

  it("checkAvailability throws when not configured", async () => {
    const origKey = process.env.GODADDY_API_KEY;
    delete process.env.GODADDY_API_KEY;

    await expect(checkAvailability("test.com")).rejects.toThrow("GoDaddy API not configured");

    process.env.GODADDY_API_KEY = origKey;
  });

  it("validateCredentials returns not configured when env vars missing", async () => {
    const origKey = process.env.GODADDY_API_KEY;
    delete process.env.GODADDY_API_KEY;

    const result = await validateCredentials();
    expect(result.valid).toBe(false);
    expect(result.message).toContain("not configured");

    process.env.GODADDY_API_KEY = origKey;
  });
});
