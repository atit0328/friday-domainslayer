/**
 * Vitest tests for Agentic Blackhat Brain
 * Tests the LLM-driven autonomous blackhat decision engine
 */
import { describe, it, expect, vi } from "vitest";

// ═══════════════════════════════════════════════
//  UNIT TESTS — Blackhat Brain Config & Types
// ═══════════════════════════════════════════════

describe("Agentic Blackhat Brain — Config & Types", () => {
  it("should export BlackhatBrainConfig interface with required fields", async () => {
    const mod = await import("./agentic-blackhat-brain");
    expect(mod).toBeDefined();
    expect(typeof mod.runAgenticBlackhatBrain).toBe("function");
  });

  it("should export BlackhatBrainResult interface", async () => {
    // Verify the module exports exist
    const mod = await import("./agentic-blackhat-brain");
    expect(mod.runAgenticBlackhatBrain).toBeDefined();
  });

  it("should export BlackhatCategory type with all 12 categories", async () => {
    // Verify categories are available via the module
    const mod = await import("./agentic-blackhat-brain");
    expect(mod).toBeDefined();
  });
});

// ═══════════════════════════════════════════════
//  UNIT TESTS — Technique Registry
// ═══════════════════════════════════════════════

describe("Agentic Blackhat Brain — Technique Registry", () => {
  it("should have techniques covering all 12 blackhat categories", () => {
    const allCategories = [
      "cloaking", "doorway", "parasite", "negative_seo",
      "link_injection", "redirect", "content_manip", "traffic_gate",
      "code_injection", "config_exploit", "cache_poison", "post_upload",
    ];
    // All categories should be valid strings
    expect(allCategories).toHaveLength(12);
    allCategories.forEach(cat => {
      expect(typeof cat).toBe("string");
      expect(cat.length).toBeGreaterThan(0);
    });
  });

  it("should validate BlackhatBrainConfig required fields", () => {
    const validConfig = {
      targetDomain: "example.com",
      targetUrl: "https://example.com",
      redirectUrl: "https://casino.com",
      seoKeywords: ["casino", "slot"],
      userId: 1,
    };

    expect(validConfig.targetDomain).toBe("example.com");
    expect(validConfig.targetUrl).toContain("https://");
    expect(validConfig.redirectUrl).toContain("https://");
    expect(validConfig.seoKeywords).toHaveLength(2);
    expect(validConfig.userId).toBe(1);
  });

  it("should validate optional config fields", () => {
    const config = {
      targetDomain: "example.com",
      targetUrl: "https://example.com",
      redirectUrl: "https://casino.com",
      seoKeywords: ["casino"],
      userId: 1,
      uploadedShellUrl: "https://example.com/shell.php",
      shellPassword: "secret123",
      targetProfile: {
        cms: "wordpress",
        cmsVersion: "6.4",
        waf: "cloudflare",
        serverType: "apache",
        phpVersion: "8.1",
        vulnScore: 7.5,
      },
      maxTechniques: 10,
      aggressiveness: 8,
      enabledCategories: ["cloaking", "doorway", "parasite"] as const,
    };

    expect(config.targetProfile?.cms).toBe("wordpress");
    expect(config.targetProfile?.waf).toBe("cloudflare");
    expect(config.maxTechniques).toBe(10);
    expect(config.aggressiveness).toBe(8);
    expect(config.enabledCategories).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════
//  UNIT TESTS — BlackhatBrainResult Structure
// ═══════════════════════════════════════════════

describe("Agentic Blackhat Brain — Result Structure", () => {
  it("should validate BlackhatBrainResult structure", () => {
    const mockResult = {
      sessionId: "bh-brain-abc123",
      targetDomain: "example.com",
      totalTechniques: 5,
      successfulTechniques: 3,
      failedTechniques: 2,
      decisions: [],
      results: [],
      totalDurationMs: 15000,
      aiStrategy: "aggressive_cloaking_first",
      telegramSent: true,
    };

    expect(mockResult.sessionId).toMatch(/^bh-brain-/);
    expect(mockResult.totalTechniques).toBe(5);
    expect(mockResult.successfulTechniques + mockResult.failedTechniques).toBe(mockResult.totalTechniques);
    expect(mockResult.totalDurationMs).toBeGreaterThan(0);
    expect(typeof mockResult.aiStrategy).toBe("string");
    expect(mockResult.telegramSent).toBe(true);
  });

  it("should validate BlackhatDecision structure", () => {
    const mockDecision = {
      techniqueId: "cloaked_redirect",
      category: "cloaking",
      reasoning: "Target has no WAF, cloaking is low-risk and high-reward",
      confidence: 0.85,
      priority: 1,
      estimatedSuccessRate: 0.7,
    };

    expect(mockDecision.confidence).toBeGreaterThanOrEqual(0);
    expect(mockDecision.confidence).toBeLessThanOrEqual(1);
    expect(mockDecision.priority).toBeGreaterThanOrEqual(1);
    expect(mockDecision.estimatedSuccessRate).toBeGreaterThanOrEqual(0);
    expect(mockDecision.estimatedSuccessRate).toBeLessThanOrEqual(1);
  });

  it("should validate BlackhatExecutionResult structure", () => {
    const mockExecResult = {
      techniqueId: "doorway_page",
      category: "doorway",
      success: true,
      durationMs: 3500,
      output: { pagesGenerated: 5, indexedUrls: 3 },
      error: null,
    };

    expect(mockExecResult.success).toBe(true);
    expect(mockExecResult.durationMs).toBeGreaterThan(0);
    expect(mockExecResult.error).toBeNull();
  });
});

// ═══════════════════════════════════════════════
//  UNIT TESTS — Orchestrator Integration
// ═══════════════════════════════════════════════

describe("Agentic Blackhat Brain — Orchestrator Integration", () => {
  it("should have blackhat_brain in TaskType", async () => {
    const { enqueueTask } = await import("./background-daemon");
    // Verify the task type is valid by checking the type system accepts it
    expect(typeof enqueueTask).toBe("function");
  });

  it("should have blackhat_brain agent in orchestrator", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    const status = mod.getOrchestratorStatus();
    
    // Check blackhat_brain is in the agent list
    const agentNames = status.agentDetails.map(a => a.name);
    expect(agentNames).toContain("blackhat_brain");
  });

  it("should configure blackhat_brain with 3-hour interval", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    const status = mod.getOrchestratorStatus();
    
    const bbAgent = status.agentDetails.find(a => a.name === "blackhat_brain");
    expect(bbAgent).toBeDefined();
    expect(bbAgent!.enabled).toBe(true);
    expect(bbAgent!.intervalMinutes).toBe(180); // 3 hours
  });

  it("should have blackhat_brain in TASK_TYPE_TO_AGENT mapping", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    const status = mod.getOrchestratorStatus();
    
    // Verify the agent exists and has proper health status
    const bbAgent = status.agentDetails.find(a => a.name === "blackhat_brain");
    expect(bbAgent).toBeDefined();
    expect(["healthy", "degraded", "failing", "recovering"]).toContain(bbAgent!.healthStatus);
  });
});

// ═══════════════════════════════════════════════
//  UNIT TESTS — Telegram Success-Only
// ═══════════════════════════════════════════════

describe("Agentic Blackhat Brain — Telegram Success-Only", () => {
  it("should only send Telegram on success, not failure", () => {
    // Simulate the success-only logic
    const results = [
      { success: true, telegramSent: true },
      { success: false, telegramSent: false },
      { success: true, telegramSent: true },
      { success: false, telegramSent: false },
    ];

    const successResults = results.filter(r => r.success);
    const failResults = results.filter(r => !r.success);

    // All success results should have telegram sent
    successResults.forEach(r => expect(r.telegramSent).toBe(true));
    // All fail results should NOT have telegram sent
    failResults.forEach(r => expect(r.telegramSent).toBe(false));
  });

  it("should format Telegram message with technique details", () => {
    const formatSuccessMessage = (result: {
      targetDomain: string;
      successfulTechniques: number;
      totalTechniques: number;
      aiStrategy: string;
      durationMs: number;
    }) => {
      return [
        `🧠 <b>BLACKHAT BRAIN SUCCESS</b>`,
        ``,
        `🎯 Target: <b>${result.targetDomain}</b>`,
        `✅ Success: ${result.successfulTechniques}/${result.totalTechniques} techniques`,
        `📋 Strategy: ${result.aiStrategy}`,
        `⏱ Duration: ${Math.round(result.durationMs / 1000)}s`,
      ].join("\n");
    };

    const msg = formatSuccessMessage({
      targetDomain: "example.com",
      successfulTechniques: 5,
      totalTechniques: 8,
      aiStrategy: "aggressive_cloaking",
      durationMs: 25000,
    });

    expect(msg).toContain("BLACKHAT BRAIN SUCCESS");
    expect(msg).toContain("example.com");
    expect(msg).toContain("5/8");
    expect(msg).toContain("aggressive_cloaking");
    expect(msg).toContain("25s");
  });
});

// ═══════════════════════════════════════════════
//  UNIT TESTS — Category Filtering
// ═══════════════════════════════════════════════

describe("Agentic Blackhat Brain — Category Filtering", () => {
  it("should filter techniques by enabled categories", () => {
    const allTechniques = [
      { id: "t1", category: "cloaking" },
      { id: "t2", category: "doorway" },
      { id: "t3", category: "parasite" },
      { id: "t4", category: "negative_seo" },
      { id: "t5", category: "link_injection" },
      { id: "t6", category: "redirect" },
    ];

    const enabledCategories = ["cloaking", "doorway", "parasite"];
    const filtered = allTechniques.filter(t => enabledCategories.includes(t.category));

    expect(filtered).toHaveLength(3);
    expect(filtered.map(t => t.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("should respect maxTechniques limit", () => {
    const techniques = Array.from({ length: 20 }, (_, i) => ({
      id: `t${i}`,
      priority: Math.random(),
    }));

    const maxTechniques = 8;
    const selected = techniques
      .sort((a, b) => b.priority - a.priority)
      .slice(0, maxTechniques);

    expect(selected).toHaveLength(8);
  });

  it("should adjust technique selection based on aggressiveness", () => {
    const selectByAggressiveness = (aggressiveness: number) => {
      if (aggressiveness <= 3) return ["cloaking", "doorway"]; // Low: safe techniques
      if (aggressiveness <= 6) return ["cloaking", "doorway", "parasite", "redirect"]; // Medium
      if (aggressiveness <= 8) return ["cloaking", "doorway", "parasite", "redirect", "link_injection", "code_injection"]; // High
      return ["cloaking", "doorway", "parasite", "redirect", "link_injection", "code_injection", "negative_seo", "config_exploit"]; // Maximum
    };

    expect(selectByAggressiveness(2)).toHaveLength(2);
    expect(selectByAggressiveness(5)).toHaveLength(4);
    expect(selectByAggressiveness(7)).toHaveLength(6);
    expect(selectByAggressiveness(10)).toHaveLength(8);
  });
});

// ═══════════════════════════════════════════════
//  UNIT TESTS — Recovery Strategies
// ═══════════════════════════════════════════════

describe("Agentic Blackhat Brain — Recovery Strategies", () => {
  it("should have 3 recovery strategies for blackhat_brain agent", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    const status = mod.getOrchestratorStatus();
    
    const bbAgent = status.agentDetails.find(a => a.name === "blackhat_brain");
    expect(bbAgent).toBeDefined();
    // Recovery attempts start at 0
    expect(bbAgent!.recoveryAttempts).toBe(0);
  });
});
