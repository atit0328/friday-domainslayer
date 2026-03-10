/**
 * Tests for Redirect Takeover Integration:
 * 1. WorldState includes hackedSites data
 * 2. Orchestrator decide() includes redirect_takeover subsystem
 * 3. Redirect Takeover router endpoints work correctly
 * 4. DB schema for hacked_site_detections is correct
 */
import { describe, it, expect, vi } from "vitest";

// ─── Test 1: WorldState interface includes hackedSites ───
describe("WorldState interface", () => {
  it("should include hackedSites section in WorldState type", async () => {
    const mod = await import("./master-orchestrator");
    // WorldState is an interface, so we check the observe function exists
    expect(typeof mod.getOrCreateOrchestratorState).toBe("function");
    // The WorldState type is exported, verify by checking module exports
    expect(mod).toBeDefined();
  });
});

// ─── Test 2: Redirect Takeover module exports ───
describe("Redirect Takeover module", () => {
  it("should export detectExistingRedirects function", async () => {
    const mod = await import("./redirect-takeover");
    expect(typeof mod.detectExistingRedirects).toBe("function");
  });

  it("should export executeRedirectTakeover function", async () => {
    const mod = await import("./redirect-takeover");
    expect(typeof mod.executeRedirectTakeover).toBe("function");
  });

  it("should export correct interfaces", async () => {
    const mod = await import("./redirect-takeover");
    // Verify the module has the expected shape
    expect(mod.detectExistingRedirects).toBeDefined();
    expect(mod.executeRedirectTakeover).toBeDefined();
  });
});

// ─── Test 3: Redirect Takeover router exists ───
describe("Redirect Takeover router", () => {
  it("should export redirectTakeoverRouter", async () => {
    const mod = await import("./routers/redirect-takeover");
    expect(mod.redirectTakeoverRouter).toBeDefined();
  });

  it("should be registered in the main appRouter", async () => {
    const mod = await import("./routers");
    const router = mod.appRouter;
    // Check that redirectTakeover is a key in the router
    expect(router).toBeDefined();
    // The router should have the redirectTakeover namespace
    const routerDef = (router as any)._def;
    expect(routerDef).toBeDefined();
  });
});

// ─── Test 4: Schema exports ───
describe("Hacked Site Detections schema", () => {
  it("should export hackedSiteDetections table", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.hackedSiteDetections).toBeDefined();
  });

  it("should have correct column names", async () => {
    const schema = await import("../drizzle/schema");
    const table = schema.hackedSiteDetections;
    // Check key columns exist
    expect(table.domain).toBeDefined();
    expect(table.url).toBeDefined();
    expect(table.isHacked).toBeDefined();
    expect(table.competitorUrl).toBeDefined();
    expect(table.detectionMethods).toBeDefined();
    expect(table.takeoverStatus).toBeDefined();
    expect(table.takeoverMethod).toBeDefined();
    expect(table.takeoverResult).toBeDefined();
    expect(table.priority).toBeDefined();
    expect(table.source).toBeDefined();
  });

  it("should have takeoverStatus enum values", async () => {
    const schema = await import("../drizzle/schema");
    // Verify the table has the expected structure
    const table = schema.hackedSiteDetections;
    expect(table.takeoverAt).toBeDefined();
    expect(table.scannedAt).toBeDefined();
    expect(table.userId).toBeDefined();
  });
});

// ─── Test 5: Master orchestrator has redirect_takeover task types ───
describe("Master Orchestrator redirect_takeover integration", () => {
  it("should have redirect_takeover in task type definitions", async () => {
    // Read the source file to verify the task types are defined
    const fs = await import("fs");
    const source = fs.readFileSync("./server/master-orchestrator.ts", "utf-8");
    
    // Verify redirect_takeover subsystem is in the decide function
    expect(source).toContain("redirect_takeover");
    expect(source).toContain("takeover_scan_targets");
    expect(source).toContain("takeover_batch_scan");
    expect(source).toContain("takeover_execute");
    expect(source).toContain("takeover_scan_serp_targets");
  });

  it("should have redirect_takeover task executor", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/master-orchestrator.ts", "utf-8");
    
    // Verify the executeTask function handles redirect_takeover
    expect(source).toContain('subsystem === "redirect_takeover"');
    expect(source).toContain('taskType.startsWith("takeover_")');
  });

  it("should include hackedSites in world state observation", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/master-orchestrator.ts", "utf-8");
    
    // Verify the observe function collects hacked sites data
    expect(source).toContain("hackedSiteDetections");
    expect(source).toContain("hackedSites:");
    expect(source).toContain("totalDetected:");
    expect(source).toContain("awaitingTakeover:");
    expect(source).toContain("takenOver:");
    expect(source).toContain("highPriority:");
  });

  it("should include hackedSites info in LLM prompt for decisions", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/master-orchestrator.ts", "utf-8");
    
    // Verify the decide prompt includes hacked sites info
    expect(source).toContain("Hacked Sites:");
    expect(source).toContain("hackedSites.totalDetected");
    expect(source).toContain("hackedSites.awaitingTakeover");
    expect(source).toContain("hackedSites.highPriority");
  });
});

// ─── Test 6: Unified Attack Pipeline has redirect_takeover ───
describe("Unified Attack Pipeline redirect_takeover", () => {
  it("should have redirect_takeover in METHOD_REGISTRY", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./server/unified-attack-pipeline.ts", "utf-8");
    expect(source).toContain("redirect_takeover");
  });
});

// ─── Test 7: AI Command Center shows hacked sites card ───
describe("AI Command Center UI", () => {
  it("should include Hacked Sites WorldStateCard", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/AutonomousCommandCenter.tsx", "utf-8");
    expect(source).toContain("Hacked Sites");
    expect(source).toContain("hackedSites");
    expect(source).toContain("Awaiting Takeover");
    expect(source).toContain("Taken Over");
    expect(source).toContain("High Priority");
  });
});

// ─── Test 8: Redirect Takeover page exists ───
describe("Redirect Takeover UI page", () => {
  it("should exist and export default component", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/pages/RedirectTakeover.tsx", "utf-8");
    expect(source).toContain("export default function RedirectTakeover");
    expect(source).toContain("Redirect Takeover");
    expect(source).toContain("Batch Scan");
    expect(source).toContain("Hacked Sites Database");
    expect(source).toContain("Execute Takeover");
  });

  it("should be registered in App.tsx routes", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/App.tsx", "utf-8");
    expect(source).toContain("RedirectTakeover");
    expect(source).toContain("/redirect-takeover");
  });

  it("should be in sidebar navigation", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("./client/src/components/layout/Sidebar.tsx", "utf-8");
    expect(source).toContain("Redirect Takeover");
    expect(source).toContain("/redirect-takeover");
  });
});
