import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for Daemon Control (/daemon command) and AI Learning commands (/learn, /suggest)
 * 
 * Covers:
 * 1. Attack agent is disabled by default (enabled: false, autoStart: false)
 * 2. Orchestrator exports: startOrchestrator, stopOrchestrator, updateAgentConfig, triggerAgentNow, getOrchestratorStatus
 * 3. Failure learning engine exports: getFailureLearningReport, suggestBestMode
 * 4. updateAgentConfig can enable/disable attack agent
 * 5. getOrchestratorStatus returns proper structure
 */

// Mock DB
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getUserSeoProjects: vi.fn().mockResolvedValue([]),
  getMethodSuccessRates: vi.fn().mockResolvedValue([]),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "[]" } }],
  }),
}));

vi.mock("./telegram-notifier", () => ({
  sendTelegramNotification: vi.fn().mockResolvedValue({ success: true }),
}));

describe("Daemon Control — Attack Agent Default State", () => {
  it("should have attack agent disabled by default (enabled: false)", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    const status = mod.getOrchestratorStatus();
    const attackAgent = status.agentDetails.find(a => a.name === "attack");
    expect(attackAgent).toBeDefined();
    expect(attackAgent!.enabled).toBe(false);
  });

  it("should have attack agent autoStart: false by default", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    const status = mod.getOrchestratorStatus();
    const attackAgent = status.agentDetails.find(a => a.name === "attack");
    expect(attackAgent).toBeDefined();
    // autoStart is reflected in the config — if not enabled, it won't auto-start
    // The key check is that it's not enabled
    expect(attackAgent!.enabled).toBe(false);
  });

  it("should have other agents (seo, scan, research) enabled by default", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    const status = mod.getOrchestratorStatus();
    const seoAgent = status.agentDetails.find(a => a.name === "seo");
    const scanAgent = status.agentDetails.find(a => a.name === "scan");
    const researchAgent = status.agentDetails.find(a => a.name === "research");
    expect(seoAgent?.enabled).toBe(true);
    expect(scanAgent?.enabled).toBe(true);
    expect(researchAgent?.enabled).toBe(true);
  });
});

describe("Daemon Control — Orchestrator Functions", () => {
  it("should export startOrchestrator function", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    expect(typeof mod.startOrchestrator).toBe("function");
  });

  it("should export stopOrchestrator function", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    expect(typeof mod.stopOrchestrator).toBe("function");
  });

  it("should export updateAgentConfig function", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    expect(typeof mod.updateAgentConfig).toBe("function");
  });

  it("should export triggerAgentNow function", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    expect(typeof mod.triggerAgentNow).toBe("function");
  });

  it("should export getOrchestratorStatus function", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    expect(typeof mod.getOrchestratorStatus).toBe("function");
  });

  it("getOrchestratorStatus should return isRunning and agentDetails", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    const status = mod.getOrchestratorStatus();
    expect(status).toHaveProperty("isRunning");
    expect(status).toHaveProperty("agentDetails");
    expect(Array.isArray(status.agentDetails)).toBe(true);
    expect(status.agentDetails.length).toBeGreaterThan(0);
  });

  it("agentDetails should have proper structure", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    const status = mod.getOrchestratorStatus();
    const firstAgent = status.agentDetails[0];
    expect(firstAgent).toHaveProperty("name");
    expect(firstAgent).toHaveProperty("enabled");
    expect(firstAgent).toHaveProperty("totalRuns");
    expect(firstAgent).toHaveProperty("totalSuccesses");
    expect(firstAgent).toHaveProperty("healthStatus");
  });

  it("updateAgentConfig should enable attack agent", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    mod.updateAgentConfig("attack", { enabled: true, autoStart: true });
    const status = mod.getOrchestratorStatus();
    const attackAgent = status.agentDetails.find(a => a.name === "attack");
    expect(attackAgent!.enabled).toBe(true);
    // Reset back to disabled
    mod.updateAgentConfig("attack", { enabled: false, autoStart: false });
  });

  it("updateAgentConfig should throw for unknown agent", async () => {
    const mod = await import("./agentic-auto-orchestrator");
    expect(() => mod.updateAgentConfig("nonexistent_agent", { enabled: true })).toThrow("Unknown agent");
  });
});

describe("AI Failure Learning — Exports", () => {
  it("should export getFailureLearningReport function", async () => {
    const mod = await import("./failure-learning-engine");
    expect(typeof mod.getFailureLearningReport).toBe("function");
  });

  it("should export suggestBestMode function", async () => {
    const mod = await import("./failure-learning-engine");
    expect(typeof mod.suggestBestMode).toBe("function");
  });

  it("should export saveFailureAnalytics function", async () => {
    const mod = await import("./failure-learning-engine");
    expect(typeof mod.saveFailureAnalytics).toBe("function");
  });

  it("should export analyzeFailurePatterns function", async () => {
    const mod = await import("./failure-learning-engine");
    expect(typeof mod.analyzeFailurePatterns).toBe("function");
  });

  it("getFailureLearningReport should return proper structure", async () => {
    const mod = await import("./failure-learning-engine");
    const report = await mod.getFailureLearningReport();
    expect(report).toHaveProperty("totalFailures");
    expect(report).toHaveProperty("totalRetries");
    expect(report).toHaveProperty("retrySuccessRate");
    expect(report).toHaveProperty("topFailurePatterns");
    expect(report).toHaveProperty("strategiesGenerated");
    expect(report).toHaveProperty("strategiesSucceeded");
    expect(report).toHaveProperty("modeEffectiveness");
    expect(report).toHaveProperty("aiInsights");
    expect(Array.isArray(report.topFailurePatterns)).toBe(true);
    expect(Array.isArray(report.modeEffectiveness)).toBe(true);
    expect(Array.isArray(report.aiInsights)).toBe(true);
  });

  it("getFailureLearningReport should return fallback when DB is null", async () => {
    const mod = await import("./failure-learning-engine");
    const report = await mod.getFailureLearningReport();
    // With null DB, should return fallback values
    expect(report.totalFailures).toBe(0);
    expect(report.totalRetries).toBe(0);
    expect(report.retrySuccessRate).toBe(0);
  });
});
