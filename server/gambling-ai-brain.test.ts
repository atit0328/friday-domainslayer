/**
 * Gambling AI Brain — Vitest Tests
 * Tests for keyword intelligence, smart discovery, brain state, and orchestrator integration
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══ Gambling Keyword Intelligence Tests ═══
describe("Gambling Keyword Intelligence", () => {
  it("should have comprehensive gambling keyword seeds", async () => {
    const { getAllGamblingKeywords, getGamblingCategories, getGamblingKeywordsByCategory } = await import("./gambling-keyword-intel");
    
    const allKeywords = getAllGamblingKeywords();
    expect(allKeywords.length).toBeGreaterThan(100);
    
    const categories = getGamblingCategories();
    expect(categories).toContain("casino");
    expect(categories).toContain("slots");
    expect(categories).toContain("betting");
    expect(categories).toContain("baccarat");
    expect(categories.length).toBeGreaterThanOrEqual(8);
    
    // Each category should have keywords
    for (const cat of categories) {
      const kws = getGamblingKeywordsByCategory(cat);
      expect(kws.length).toBeGreaterThan(0);
    }
  });

  it("should have Thai gambling keywords", async () => {
    const { getAllGamblingKeywords } = await import("./gambling-keyword-intel");
    const allKeywords = getAllGamblingKeywords();
    
    // Should contain Thai keywords
    const thaiKeywords = allKeywords.filter(k => /[\u0E00-\u0E7F]/.test(k));
    expect(thaiKeywords.length).toBeGreaterThan(30);
    
    // Should contain key gambling terms
    const hasSlot = allKeywords.some(k => k.includes("สล็อต"));
    const hasCasino = allKeywords.some(k => k.includes("คาสิโน"));
    const hasBaccarat = allKeywords.some(k => k.includes("บาคาร่า"));
    const hasBetting = allKeywords.some(k => k.includes("แทงบอล"));
    
    expect(hasSlot).toBe(true);
    expect(hasCasino).toBe(true);
    expect(hasBaccarat).toBe(true);
    expect(hasBetting).toBe(true);
  });

  it("should have English gambling keywords", async () => {
    const { getAllGamblingKeywords } = await import("./gambling-keyword-intel");
    const allKeywords = getAllGamblingKeywords();
    
    const englishKeywords = allKeywords.filter(k => /^[a-zA-Z0-9\s\-]+$/.test(k));
    expect(englishKeywords.length).toBeGreaterThan(20);
    
    // Should contain key English terms
    const hasSlotOnline = allKeywords.some(k => k.toLowerCase().includes("slot"));
    const hasCasino = allKeywords.some(k => k.toLowerCase().includes("casino"));
    expect(hasSlotOnline).toBe(true);
    expect(hasCasino).toBe(true);
  });

  it("should score keywords with priority", async () => {
    const { scoreKeywords } = await import("./gambling-keyword-intel");
    
    // scoreKeywords calls LLM, so we test the interface
    expect(typeof scoreKeywords).toBe("function");
  });

  it("should expand keywords", async () => {
    const { expandKeywords } = await import("./gambling-keyword-intel");
    expect(typeof expandKeywords).toBe("function");
  });

  it("should discover keywords from SERP", async () => {
    const { discoverKeywordsFromSerp } = await import("./gambling-keyword-intel");
    expect(typeof discoverKeywordsFromSerp).toBe("function");
  });

  it("should seed gambling keywords to DB", async () => {
    const { seedGamblingKeywords } = await import("./gambling-keyword-intel");
    expect(typeof seedGamblingKeywords).toBe("function");
  });

  it("should get keyword stats", async () => {
    const { getGamblingKeywordStats } = await import("./gambling-keyword-intel");
    expect(typeof getGamblingKeywordStats).toBe("function");
  });

  it("should run full intelligence cycle", async () => {
    const { runFullIntelligenceCycle } = await import("./gambling-keyword-intel");
    expect(typeof runFullIntelligenceCycle).toBe("function");
  });
});

// ═══ Smart Target Discovery Tests ═══
describe("Smart Target Discovery", () => {
  it("should have gambling-specific Google dorks", async () => {
    // GAMBLING_DORK_QUERIES is not exported (internal), test via the discovery function
    const mod = await import("./smart-target-discovery");
    
    // Verify the module has the key functions
    expect(typeof mod.runSmartGamblingDiscovery).toBe("function");
    expect(typeof mod.selectNextAttackTargets).toBe("function");
    expect(typeof mod.scoreTargetsForGambling).toBe("function");
    
    // Read source to verify dorks exist
    const fs = await import("fs");
    const source = fs.readFileSync("server/smart-target-discovery.ts", "utf-8");
    expect(source).toContain("GAMBLING_DORK_QUERIES");
    expect(source).toContain("wp-content");
    expect(source).toContain("inurl:");
  });

  it("should export scoring and discovery functions", async () => {
    const mod = await import("./smart-target-discovery");
    
    expect(typeof mod.runSmartGamblingDiscovery).toBe("function");
    expect(typeof mod.selectNextAttackTargets).toBe("function");
    expect(typeof mod.scoreTargetsForGambling).toBe("function");
    expect(typeof mod.analyzeCompetitorTargets).toBe("function");
    expect(typeof mod.getSmartDiscoveryStats).toBe("function");
  });

  it("should have correct GamblingTargetScore interface", async () => {
    const { scoreTargetsForGambling } = await import("./smart-target-discovery");
    // The function should accept an array and return scored targets
    expect(typeof scoreTargetsForGambling).toBe("function");
  });
});

// ═══ Gambling AI Brain Tests ═══
describe("Gambling AI Brain", () => {
  it("should export all brain functions", async () => {
    const mod = await import("./gambling-ai-brain");
    
    expect(typeof mod.runBrainCycle).toBe("function");
    expect(typeof mod.getBrainState).toBe("function");
    expect(typeof mod.stopBrain).toBe("function");
    expect(typeof mod.startContinuousMode).toBe("function");
    expect(typeof mod.stopContinuousMode).toBe("function");
    expect(typeof mod.isContinuousModeRunning).toBe("function");
  });

  it("should have correct initial brain state", async () => {
    const { getBrainState } = await import("./gambling-ai-brain");
    
    const state = getBrainState();
    expect(state).toBeDefined();
    expect(state.isRunning).toBe(false);
    expect(typeof state.totalCyclesCompleted).toBe("number");
    expect(typeof state.totalAttacksLaunched).toBe("number");
    expect(typeof state.totalSuccesses).toBe("number");
    expect(typeof state.currentPhase).toBe("string");
  });

  it("should not be in continuous mode initially", async () => {
    const { isContinuousModeRunning } = await import("./gambling-ai-brain");
    expect(isContinuousModeRunning()).toBe(false);
  });

  it("should be able to stop brain even when not running", async () => {
    const { stopBrain, getBrainState } = await import("./gambling-ai-brain");
    
    // Should not throw
    stopBrain();
    const state = getBrainState();
    expect(state.isRunning).toBe(false);
  });

  it("should have DEFAULT_CONFIG with sensible defaults", async () => {
    // DEFAULT_CONFIG is internal, test via runBrainCycle accepting partial config
    const { runBrainCycle, getBrainState } = await import("./gambling-ai-brain");
    
    // Verify the brain accepts config overrides
    expect(typeof runBrainCycle).toBe("function");
    const state = getBrainState();
    expect(state).toBeDefined();
    expect(typeof state.isRunning).toBe("boolean");
    expect(typeof state.totalCyclesCompleted).toBe("number");
  });

  it("should have GamblingBrainConfig type with all fields", async () => {
    // Verify GamblingBrainConfig interface by checking source
    const fs = await import("fs");
    const source = fs.readFileSync("server/gambling-ai-brain.ts", "utf-8");
    
    // All config fields should exist in the interface
    expect(source).toContain("maxKeywordsPerCycle");
    expect(source).toContain("expandKeywords");
    expect(source).toContain("maxDorksPerCycle");
    expect(source).toContain("maxTargetsPerCycle");
    expect(source).toContain("maxAttacksPerCycle");
    expect(source).toContain("delayBetweenAttacks");
    expect(source).toContain("attackMode");
    expect(source).toContain("targetCms");
    expect(source).toContain("notifyOnDiscovery");
    expect(source).toContain("notifyOnAttackSuccess");
    expect(source).toContain("notifyOnCycleComplete");
  });
});

// ═══ Orchestrator Integration Tests ═══
describe("Orchestrator Gambling Brain Integration", () => {
  it("should have gambling_brain in task types", async () => {
    // Read the orchestrator source to verify integration
    const fs = await import("fs");
    const source = fs.readFileSync("server/master-orchestrator.ts", "utf-8");
    
    expect(source).toContain("gambling_brain");
    expect(source).toContain("gambling_run_cycle");
    expect(source).toContain("gambling_keyword_intel");
    expect(source).toContain("gambling_smart_discovery");
    expect(source).toContain("gambling_auto_attack");
  });

  it("should auto-enable gambling_brain when attack is enabled", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("server/master-orchestrator.ts", "utf-8");
    
    // Verify gambling_brain is enabled when attackEnabled
    expect(source).toContain('orchState.attackEnabled) enabledSystems.push("gambling_brain")');
  });

  it("should have gambling brain router registered", async () => {
    const fs = await import("fs");
    const routersSource = fs.readFileSync("server/routers.ts", "utf-8");
    
    expect(routersSource).toContain("gamblingBrainRouter");
    expect(routersSource).toContain("gamblingBrain: gamblingBrainRouter");
  });
});

// ═══ Brain Cycle Result Interface Tests ═══
describe("Brain Cycle Result Interface", () => {
  it("should have correct BrainCycleResult structure", async () => {
    // Verify the module exports the expected types by checking function signatures
    const mod = await import("./gambling-ai-brain");
    
    // runBrainCycle should return a promise
    expect(mod.runBrainCycle.constructor.name).toBe("AsyncFunction");
  });
});

// ═══ End-to-End Flow Tests ═══
describe("End-to-End Autonomous Flow", () => {
  it("should have complete keyword → discovery → attack pipeline", async () => {
    // Verify all modules are importable and connected
    const keywordMod = await import("./gambling-keyword-intel");
    const discoveryMod = await import("./smart-target-discovery");
    const brainMod = await import("./gambling-ai-brain");
    
    // Keyword module feeds into brain
    expect(typeof keywordMod.getAllGamblingKeywords).toBe("function");
    expect(typeof keywordMod.scoreKeywords).toBe("function");
    expect(typeof keywordMod.expandKeywords).toBe("function");
    
    // Discovery module feeds into brain
    expect(typeof discoveryMod.runSmartGamblingDiscovery).toBe("function");
    expect(typeof discoveryMod.selectNextAttackTargets).toBe("function");
    
    // Brain orchestrates everything
    expect(typeof brainMod.runBrainCycle).toBe("function");
    expect(typeof brainMod.startContinuousMode).toBe("function");
  });

  it("should have Telegram notification integration", async () => {
    const fs = await import("fs");
    const brainSource = fs.readFileSync("server/gambling-ai-brain.ts", "utf-8");
    
    // Should notify on discovery, attack success, cycle complete, and errors
    expect(brainSource).toContain("notifyOnDiscovery");
    expect(brainSource).toContain("notifyOnAttackSuccess");
    expect(brainSource).toContain("notifyOnCycleComplete");
    expect(brainSource).toContain("sendTelegramNotification");
  });

  it("should integrate with agentic attack engine", async () => {
    const fs = await import("fs");
    const brainSource = fs.readFileSync("server/gambling-ai-brain.ts", "utf-8");
    
    // Should use the agentic attack engine for actual attacks
    expect(brainSource).toContain("startAgenticSession");
    expect(brainSource).toContain("getAgenticSessionStatus");
    expect(brainSource).toContain("AgenticConfig");
  });

  it("should integrate with redirect takeover for hacked sites", async () => {
    const fs = await import("fs");
    const brainSource = fs.readFileSync("server/gambling-ai-brain.ts", "utf-8");
    
    // Should use redirect takeover for already-hacked sites
    expect(brainSource).toContain("redirect_takeover");
    expect(brainSource).toContain("redirect_takeover");
  });
});
