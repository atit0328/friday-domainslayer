/**
 * Agentic Auto Orchestrator — Vitest Tests
 *
 * Tests the master coordinator that manages all autonomous agents
 * (attack, SEO, scan, research, learning, CVE) as continuous background processes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock all agent dependencies ───
vi.mock("./background-daemon", () => ({
  enqueueTask: vi.fn().mockResolvedValue(1),
  registerExecutor: vi.fn(),
  isDaemonRunning: vi.fn().mockReturnValue(true),
}));

vi.mock("./agentic-attack-engine", () => ({
  runAgenticLoop: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("./seo-scheduler", () => ({
  runScheduledJobs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./scan-scheduler", () => ({
  runPendingScans: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./autonomous-research-engine", () => ({
  runResearchCycle: vi.fn().mockResolvedValue({
    vectorsDiscovered: 3,
    exploitsGenerated: 2,
    exploitsTested: 2,
    successfulExploits: 1,
  }),
}));

vi.mock("./adaptive-learning", () => ({
  runLearningCycle: vi.fn().mockResolvedValue({
    patternsUpdated: 5,
    profilesUpdated: 2,
  }),
}));

vi.mock("./cve-scheduler", () => ({
  runCveUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  }),
}));

vi.mock("../drizzle/schema", () => ({
  agenticSessions: { id: "id" },
  seoProjects: { id: "id" },
  domains: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  desc: vi.fn((col: any) => col),
  sql: vi.fn(),
  count: vi.fn(),
}));

describe("Agentic Auto Orchestrator — Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Module Exports", () => {
    it("should export all required functions", async () => {
      const mod = await import("./agentic-auto-orchestrator");
      expect(mod.startOrchestrator).toBeDefined();
      expect(mod.stopOrchestrator).toBeDefined();
      expect(mod.getOrchestratorStatus).toBeDefined();
      expect(mod.updateAgentConfig).toBeDefined();
      expect(mod.triggerAgentNow).toBeDefined();
      expect(mod.resetAgentFailures).toBeDefined();
    });

    it("should export functions with correct types", async () => {
      const mod = await import("./agentic-auto-orchestrator");
      expect(typeof mod.startOrchestrator).toBe("function");
      expect(typeof mod.stopOrchestrator).toBe("function");
      expect(typeof mod.getOrchestratorStatus).toBe("function");
      expect(typeof mod.updateAgentConfig).toBe("function");
      expect(typeof mod.triggerAgentNow).toBe("function");
      expect(typeof mod.resetAgentFailures).toBe("function");
    });
  });

  describe("getOrchestratorStatus", () => {
    it("should return status object with expected fields", async () => {
      const mod = await import("./agentic-auto-orchestrator");
      const status = mod.getOrchestratorStatus();
      expect(status).toHaveProperty("isRunning");
      expect(status).toHaveProperty("agentDetails");
      expect(status).toHaveProperty("cycleCount");
      expect(typeof status.isRunning).toBe("boolean");
      expect(Array.isArray(status.agentDetails)).toBe(true);
      expect(typeof status.cycleCount).toBe("number");
    });

    it("should include all 6 agents in agentDetails", async () => {
      const mod = await import("./agentic-auto-orchestrator");
      mod.startOrchestrator();
      const status = mod.getOrchestratorStatus();
      expect(status.agentDetails.length).toBe(6);
      const agentNames = status.agentDetails.map((a: any) => a.name);
      expect(agentNames).toContain("attack");
      expect(agentNames).toContain("seo");
      expect(agentNames).toContain("scan");
      expect(agentNames).toContain("research");
      expect(agentNames).toContain("learning");
      expect(agentNames).toContain("cve");
      mod.stopOrchestrator();
    });

    it("should show agent details with correct structure", async () => {
      const mod = await import("./agentic-auto-orchestrator");
      mod.startOrchestrator();
      const status = mod.getOrchestratorStatus();
      const agent = status.agentDetails[0];
      expect(agent).toHaveProperty("name");
      expect(agent).toHaveProperty("enabled");
      expect(agent).toHaveProperty("intervalMinutes");
      expect(agent).toHaveProperty("totalRuns");
      expect(agent).toHaveProperty("consecutiveFailures");
      expect(agent).toHaveProperty("healthStatus");
      expect(typeof agent.enabled).toBe("boolean");
      expect(typeof agent.intervalMinutes).toBe("number");
      mod.stopOrchestrator();
    });
  });

  describe("startOrchestrator / stopOrchestrator", () => {
    it("should start and report running", async () => {
      const mod = await import("./agentic-auto-orchestrator");
      mod.startOrchestrator();
      const status = mod.getOrchestratorStatus();
      expect(status.isRunning).toBe(true);
      mod.stopOrchestrator();
    });

    it("should stop and report not running", async () => {
      const mod = await import("./agentic-auto-orchestrator");
      mod.startOrchestrator();
      mod.stopOrchestrator();
      const status = mod.getOrchestratorStatus();
      expect(status.isRunning).toBe(false);
    });

    it("should handle multiple start calls gracefully", async () => {
      const mod = await import("./agentic-auto-orchestrator");
      mod.startOrchestrator();
      mod.startOrchestrator(); // Should not throw
      const status = mod.getOrchestratorStatus();
      expect(status.isRunning).toBe(true);
      mod.stopOrchestrator();
    });
  });

  describe("updateAgentConfig", () => {
    it("should update agent enabled state", async () => {
      const mod = await import("./agentic-auto-orchestrator");
      mod.startOrchestrator();
      mod.updateAgentConfig("attack", { enabled: false });
      const status = mod.getOrchestratorStatus();
      const attackAgent = status.agentDetails.find((a: any) => a.name === "attack");
      expect(attackAgent?.enabled).toBe(false);
      mod.stopOrchestrator();
    });

    it("should throw for unknown agent name", async () => {
      const mod = await import("./agentic-auto-orchestrator");
      mod.startOrchestrator();
      expect(() => mod.updateAgentConfig("nonexistent", { enabled: false })).toThrow();
      mod.stopOrchestrator();
    });
  });

  describe("triggerAgentNow", () => {
    it("should trigger an agent without error", async () => {
      const mod = await import("./agentic-auto-orchestrator");
      mod.startOrchestrator();
      expect(() => mod.triggerAgentNow("learning")).not.toThrow();
      mod.stopOrchestrator();
    });
  });

  describe("resetAgentFailures", () => {
    it("should reset failure count", async () => {
      const mod = await import("./agentic-auto-orchestrator");
      mod.startOrchestrator();
      mod.resetAgentFailures("attack");
      const status = mod.getOrchestratorStatus();
      const attackAgent = status.agentDetails.find((a: any) => a.name === "attack");
      expect(attackAgent?.consecutiveFailures).toBe(0);
      mod.stopOrchestrator();
    });
  });

  describe("Agent Health Status", () => {
    it("should report healthy when no failures", async () => {
      const mod = await import("./agentic-auto-orchestrator");
      mod.startOrchestrator();
      mod.resetAgentFailures("attack");
      const status = mod.getOrchestratorStatus();
      const attackAgent = status.agentDetails.find((a: any) => a.name === "attack");
      expect(attackAgent?.healthStatus).toBe("healthy");
      mod.stopOrchestrator();
    });
  });
});
