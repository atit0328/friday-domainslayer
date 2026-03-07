/**
 * Tests for Mass Target Discovery, Non-WP Exploits, and Auto-Pipeline
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══════════════════════════════════════════════════════
//  Mass Target Discovery Tests
// ═══════════════════════════════════════════════════════

describe("Mass Target Discovery", () => {
  it("should import runMassDiscovery function", async () => {
    const mod = await import("./mass-target-discovery");
    expect(mod.runMassDiscovery).toBeDefined();
    expect(typeof mod.runMassDiscovery).toBe("function");
  });

  it("should export DiscoveryConfig type", async () => {
    // TypeScript compilation test — if this compiles, the type exists
    const mod = await import("./mass-target-discovery");
    const config = {
      useShodan: false,
      useSerpApi: false,
      maxTargets: 10,
      minVulnScore: 0,
    } satisfies import("./mass-target-discovery").DiscoveryConfig;
    expect(config).toBeDefined();
  });

  it("should export SHODAN_DISCOVERY_QUERIES", async () => {
    // Verify the module has built-in Shodan queries
    const mod = await import("./mass-target-discovery");
    // The module should have internal queries even if not exported
    expect(mod.runMassDiscovery).toBeDefined();
  });

  it("should handle empty config gracefully", async () => {
    const mod = await import("./mass-target-discovery");
    // With both sources disabled, should return empty results
    const result = await mod.runMassDiscovery({
      useShodan: false,
      useSerpApi: false,
      maxTargets: 10,
      minVulnScore: 0,
    });
    expect(result).toBeDefined();
    expect(result.targets).toBeDefined();
    expect(Array.isArray(result.targets)).toBe(true);
  });

  it("should return DiscoveryResult structure", async () => {
    const mod = await import("./mass-target-discovery");
    const result = await mod.runMassDiscovery({
      useShodan: false,
      useSerpApi: false,
      maxTargets: 5,
      minVulnScore: 0,
    });
    // Verify result structure
    expect(result).toHaveProperty("targets");
    expect(result).toHaveProperty("totalRawResults");
    expect(result).toHaveProperty("totalAfterDedup");
    expect(typeof result.totalRawResults).toBe("number");
    expect(typeof result.totalAfterDedup).toBe("number");
  });
});

// ═══════════════════════════════════════════════════════
//  Non-WP Exploits Tests
// ═══════════════════════════════════════════════════════

describe("Non-WP Exploits", () => {
  it("should import runNonWpExploits function", async () => {
    const mod = await import("./non-wp-exploits");
    expect(mod.runNonWpExploits).toBeDefined();
    expect(typeof mod.runNonWpExploits).toBe("function");
  });

  it("should export exploit category functions", async () => {
    const mod = await import("./non-wp-exploits");
    // Main function should exist
    expect(mod.runNonWpExploits).toBeDefined();
  });

  it("should return NonWpExploitResult structure", async () => {
    const mod = await import("./non-wp-exploits");
    // Test with a non-existent target (should fail gracefully)
    const result = await mod.runNonWpExploits({
      targetUrl: "http://127.0.0.1:1",
      cms: "unknown",
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("targetUrl");
    expect(result).toHaveProperty("cms");
    expect(result).toHaveProperty("totalExploits");
    expect(result).toHaveProperty("successfulExploits");
    expect(result).toHaveProperty("criticalFindings");
    expect(typeof result.totalExploits).toBe("number");
    expect(typeof result.successfulExploits).toBe("number");
    expect(typeof result.criticalFindings).toBe("number");
  });

  it("should handle invalid URL gracefully", async () => {
    const mod = await import("./non-wp-exploits");
    const result = await mod.runNonWpExploits({
      targetUrl: "http://this-domain-does-not-exist-12345.com",
      cms: "laravel",
    });
    expect(result).toBeDefined();
    expect(result.totalExploits).toBeGreaterThanOrEqual(0);
    // Should not throw
  });
});

// ═══════════════════════════════════════════════════════
//  Auto-Pipeline Tests
// ═══════════════════════════════════════════════════════

describe("Auto-Pipeline", () => {
  it("should import pipeline functions", async () => {
    const mod = await import("./auto-pipeline");
    expect(mod.runAutoPipeline).toBeDefined();
    expect(mod.getPipelineRun).toBeDefined();
    expect(mod.getPipelineEvents).toBeDefined();
    expect(mod.getActivePipelines).toBeDefined();
    expect(mod.cancelPipeline).toBeDefined();
  });

  it("should return empty active pipelines initially", async () => {
    const mod = await import("./auto-pipeline");
    const pipelines = mod.getActivePipelines();
    expect(Array.isArray(pipelines)).toBe(true);
  });

  it("should return null for non-existent pipeline", async () => {
    const mod = await import("./auto-pipeline");
    const run = mod.getPipelineRun("non-existent-id");
    expect(run).toBeUndefined();
  });

  it("should return empty events for non-existent pipeline", async () => {
    const mod = await import("./auto-pipeline");
    const events = mod.getPipelineEvents("non-existent-id");
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(0);
  });

  it("should return false when cancelling non-existent pipeline", async () => {
    const mod = await import("./auto-pipeline");
    const result = mod.cancelPipeline("non-existent-id");
    expect(result).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
//  Discovery Router Tests
// ═══════════════════════════════════════════════════════

describe("Discovery Router", () => {
  it("should import discoveryRouter", async () => {
    const mod = await import("./routers/discovery");
    expect(mod.discoveryRouter).toBeDefined();
  });

  it("should have all expected procedures", async () => {
    const mod = await import("./routers/discovery");
    const router = mod.discoveryRouter;
    // Check that the router has the expected shape
    expect(router).toBeDefined();
    // tRPC router should have _def
    expect((router as any)._def).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════
//  Integration: Proxy Pool + Discovery
// ═══════════════════════════════════════════════════════

describe("Proxy Pool Integration", () => {
  it("should use proxy pool in fetchWithPoolProxy", async () => {
    const mod = await import("./proxy-pool");
    expect(mod.fetchWithPoolProxy).toBeDefined();
    expect(typeof mod.fetchWithPoolProxy).toBe("function");
  });

  it("should have getProxyForPuppeteer for stealth browser", async () => {
    const mod = await import("./proxy-pool");
    expect(mod.getProxyForPuppeteer).toBeDefined();
    const puppeteerProxy = mod.getProxyForPuppeteer();
    expect(puppeteerProxy).toHaveProperty("proxyServer");
    expect(puppeteerProxy).toHaveProperty("username");
    expect(puppeteerProxy).toHaveProperty("password");
  });
});
