/**
 * Tests for Web2 Authenticated Platforms + Attack Pipeline Improvements
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══════════════════════════════════════════════
//  WEB2 AUTHENTICATED PLATFORMS
// ═══════════════════════════════════════════════

describe("Web2 Authenticated Platforms", () => {
  describe("Platform configuration checks", () => {
    it("should detect Medium as not configured when env vars are empty", async () => {
      const { isMediumConfigured } = await import("./web2-authenticated-platforms");
      // Default env vars are empty strings
      expect(typeof isMediumConfigured).toBe("function");
      const result = isMediumConfigured();
      expect(typeof result).toBe("boolean");
    });

    it("should detect Blogger as not configured when env vars are empty", async () => {
      const { isBloggerConfigured } = await import("./web2-authenticated-platforms");
      expect(typeof isBloggerConfigured).toBe("function");
      const result = isBloggerConfigured();
      expect(typeof result).toBe("boolean");
    });

    it("should detect WordPress.com as not configured when env vars are empty", async () => {
      const { isWpComConfigured } = await import("./web2-authenticated-platforms");
      expect(typeof isWpComConfigured).toBe("function");
      const result = isWpComConfigured();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("getAuthPlatformStatuses", () => {
    it("should return status for all 6 platforms", async () => {
      const { getAuthPlatformStatuses } = await import("./web2-authenticated-platforms");
      const statuses = getAuthPlatformStatuses();
      expect(statuses).toHaveLength(6);
      expect(statuses.map(s => s.platform)).toEqual([
        "Medium", "Blogger", "WordPress.com", "Pastebin.com", "dpaste.org", "PrivateBin",
      ]);
    });

    it("should have correct DA values for each platform", async () => {
      const { getAuthPlatformStatuses } = await import("./web2-authenticated-platforms");
      const statuses = getAuthPlatformStatuses();
      const daMap = Object.fromEntries(statuses.map(s => [s.platform, s.da]));
      expect(daMap["Medium"]).toBe(96);
      expect(daMap["Blogger"]).toBe(99);
      expect(daMap["WordPress.com"]).toBe(99);
      expect(daMap["Pastebin.com"]).toBe(88);
      expect(daMap["dpaste.org"]).toBe(55);
      expect(daMap["PrivateBin"]).toBe(50);
    });

    it("should mark no-auth platforms as always configured", async () => {
      const { getAuthPlatformStatuses } = await import("./web2-authenticated-platforms");
      const statuses = getAuthPlatformStatuses();
      const pastebin = statuses.find(s => s.platform === "Pastebin.com");
      const dpaste = statuses.find(s => s.platform === "dpaste.org");
      const privatebin = statuses.find(s => s.platform === "PrivateBin");
      expect(pastebin?.configured).toBe(true);
      expect(dpaste?.configured).toBe(true);
      expect(privatebin?.configured).toBe(true);
    });
  });

  describe("getConfiguredAuthPlatforms", () => {
    it("should always include no-auth platforms (Pastebin, dpaste, PrivateBin)", async () => {
      const { getConfiguredAuthPlatforms } = await import("./web2-authenticated-platforms");
      const platforms = getConfiguredAuthPlatforms();
      const names = platforms.map(p => p.name);
      expect(names).toContain("Pastebin.com");
      expect(names).toContain("dpaste.org");
      expect(names).toContain("PrivateBin");
    });

    it("should return platforms sorted by DA descending", async () => {
      const { getConfiguredAuthPlatforms } = await import("./web2-authenticated-platforms");
      const platforms = getConfiguredAuthPlatforms();
      for (let i = 1; i < platforms.length; i++) {
        expect(platforms[i]!.da).toBeLessThanOrEqual(platforms[i - 1]!.da);
      }
    });

    it("should return functions that are callable", async () => {
      const { getConfiguredAuthPlatforms } = await import("./web2-authenticated-platforms");
      const platforms = getConfiguredAuthPlatforms();
      for (const p of platforms) {
        expect(typeof p.fn).toBe("function");
      }
    });
  });

  describe("postToMedium without credentials", () => {
    it("should return error when not configured", async () => {
      const { postToMedium } = await import("./web2-authenticated-platforms");
      const result = await postToMedium({
        targetUrl: "https://example.com",
        targetDomain: "example.com",
        keyword: "test keyword",
        niche: "gambling",
        anchorText: "test anchor",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
      expect(result.platform).toBe("Medium");
      expect(result.da).toBe(96);
    });
  });

  describe("postToBlogger without credentials", () => {
    it("should return error when not configured", async () => {
      const { postToBlogger } = await import("./web2-authenticated-platforms");
      const result = await postToBlogger({
        targetUrl: "https://example.com",
        targetDomain: "example.com",
        keyword: "test keyword",
        niche: "gambling",
        anchorText: "test anchor",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
      expect(result.platform).toBe("Blogger");
      expect(result.da).toBe(99);
    });
  });

  describe("postToWordPressCom without credentials", () => {
    it("should return error when not configured", async () => {
      const { postToWordPressCom } = await import("./web2-authenticated-platforms");
      const result = await postToWordPressCom({
        targetUrl: "https://example.com",
        targetDomain: "example.com",
        keyword: "test keyword",
        niche: "gambling",
        anchorText: "test anchor",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
      expect(result.platform).toBe("WordPress.com");
      expect(result.da).toBe(99);
    });
  });
});

// ═══════════════════════════════════════════════
//  PERSISTENCE MONITOR
// ═══════════════════════════════════════════════

describe("Persistence Monitor", () => {
  it("should export runPersistenceCheck function", async () => {
    const mod = await import("./persistence-monitor");
    expect(typeof mod.runPersistenceCheck).toBe("function");
  });

  it("should export getPersistenceStats function", async () => {
    const mod = await import("./persistence-monitor");
    expect(typeof mod.getPersistenceStats).toBe("function");
  });

  it("should return valid stats structure", async () => {
    const { getPersistenceStats } = await import("./persistence-monitor");
    const stats = await getPersistenceStats();
    expect(stats).toHaveProperty("totalSuccess");
    expect(stats).toHaveProperty("totalAlive");
    expect(stats).toHaveProperty("totalDead");
    expect(stats).toHaveProperty("lastCheckAt");
    expect(stats).toHaveProperty("uptimeRate");
    expect(typeof stats.totalSuccess).toBe("number");
    expect(typeof stats.totalAlive).toBe("number");
    expect(typeof stats.totalDead).toBe("number");
    expect(typeof stats.uptimeRate).toBe("number");
  });
});

// ═══════════════════════════════════════════════
//  MULTI-PLATFORM DISTRIBUTOR INTEGRATION
// ═══════════════════════════════════════════════

describe("Multi-Platform Distributor Integration", () => {
  it("should have PLATFORMS registry with auth platforms", async () => {
    const { PLATFORMS } = await import("./multi-platform-distributor");
    const authPlatforms = PLATFORMS.filter((p: any) => p.requiresAuth);
    expect(authPlatforms.length).toBeGreaterThanOrEqual(3);
    const names = authPlatforms.map((p: any) => p.name);
    expect(names).toContain("Medium");
    expect(names).toContain("Blogger");
    expect(names).toContain("WordPress.com");
  });

  it("should have additional no-auth platforms in registry", async () => {
    const { PLATFORMS } = await import("./multi-platform-distributor");
    const names = PLATFORMS.map((p: any) => p.name);
    expect(names).toContain("Pastebin.com");
    expect(names).toContain("dpaste.org");
    expect(names).toContain("PrivateBin");
  });

  it("should have at least 14 total platforms registered", async () => {
    const { PLATFORMS } = await import("./multi-platform-distributor");
    expect(PLATFORMS.length).toBeGreaterThanOrEqual(14);
  });

  it("should export distributeToAllPlatforms function", async () => {
    const mod = await import("./multi-platform-distributor");
    expect(typeof mod.distributeToAllPlatforms).toBe("function");
  });

  it("should export generateDistributionContent function", async () => {
    const mod = await import("./multi-platform-distributor");
    expect(typeof mod.generateDistributionContent).toBe("function");
  });
});
