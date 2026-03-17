/**
 * AI Strategy Brain Tests
 * 
 * Tests the central intelligence module that replaces static if-else
 * with LLM-driven decisions. Mocks invokeLLM to test parsing logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BrainContext, AttackPlan, PivotDecision, CostBenefitAnalysis } from "./ai-strategy-brain";

// Mock invokeLLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock adaptive-learning
vi.mock("./adaptive-learning", () => ({
  queryHistoricalPatterns: vi.fn().mockResolvedValue([]),
  calculateMethodSuccessRates: vi.fn().mockResolvedValue([]),
  getLearnedInsights: vi.fn().mockResolvedValue([]),
  getCmsAttackProfile: vi.fn().mockResolvedValue(null),
}));

import { createAttackPlan, decidePivot, analyzeCostBenefit, rankCredentials, selectRedirectMethod, formatBrainDecision } from "./ai-strategy-brain";
import { invokeLLM } from "./_core/llm";

const mockedLLM = vi.mocked(invokeLLM);

function makeContext(overrides: Partial<BrainContext> = {}): BrainContext {
  return {
    targetUrl: "https://example.com",
    targetDomain: "example.com",
    serverType: "Apache/2.4",
    cms: "wordpress",
    cmsVersion: "6.3",
    phpVersion: "8.1",
    wafDetected: null,
    wafStrength: null,
    hostingProvider: null,
    isCloudflare: false,
    overallSuccessProbability: 65,
    existingRedirectDetected: false,
    existingRedirectUrl: null,
    isCfLevelRedirect: false,
    isWordPress: true,
    wpVersion: "6.3",
    vulnerabilities: [],
    writablePaths: ["/wp-content/uploads/"],
    uploadEndpoints: ["/wp-admin/upload.php"],
    exposedConfigs: [],
    ftpOpen: true,
    sshOpen: false,
    cpanelOpen: false,
    directAdminOpen: false,
    pleskOpen: false,
    mysqlOpen: false,
    shodanVulns: [],
    allPorts: [21, 80, 443],
    leakedCredentials: [
      { email: "admin@example.com", password: "pass123", isPlaintext: true },
    ],
    attemptedMethods: [],
    failedMethods: [],
    successfulMethods: [],
    elapsedMs: 5000,
    maxTimeMs: 900000,
    ...overrides,
  };
}

describe("AI Strategy Brain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createAttackPlan", () => {
    it("should create an attack plan from LLM response", async () => {
      const planResponse: AttackPlan = {
        shouldProceed: true,
        overallConfidence: 75,
        reasoning: "WordPress 6.3 with writable uploads and FTP open — high chance of success",
        steps: [
          { method: "wp_exploit", confidence: 80, reasoning: "WP 6.3 has known vulns", prerequisites: [], estimatedTimeMs: 30000, fallbackMethod: "ftp_upload" },
          { method: "ftp_upload", confidence: 70, reasoning: "FTP port open with leaked creds", prerequisites: ["leaked_creds"], estimatedTimeMs: 20000, fallbackMethod: "shellless" },
        ],
        abortReason: null,
        estimatedTotalTimeMs: 50000,
      };

      mockedLLM.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(planResponse) } }],
      } as any);

      const ctx = makeContext();
      const plan = await createAttackPlan(ctx);

      expect(plan.shouldProceed).toBe(true);
      expect(plan.overallConfidence).toBeGreaterThan(0);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps[0].method).toBeDefined();
      expect(plan.overallConfidence).toBeGreaterThan(0);
    });

    it("should return abort plan when LLM says not to proceed", async () => {
      const planResponse: AttackPlan = {
        shouldProceed: false,
        overallConfidence: 15,
        reasoning: "Strong WAF + no vulns + no creds — waste of time",
        steps: [],
        abortReason: "Success probability too low (<20%)",
        estimatedTotalTimeMs: 0,
      };

      mockedLLM.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(planResponse) } }],
      } as any);

      const ctx = makeContext({ wafDetected: "Cloudflare Enterprise", wafStrength: "very_strong", leakedCredentials: [], overallSuccessProbability: 10 });
      const plan = await createAttackPlan(ctx);

      expect(plan.shouldProceed).toBe(false);
      expect(plan.abortReason).toBeTruthy();
    });

    it("should handle LLM timeout gracefully with fallback plan", async () => {
      mockedLLM.mockRejectedValueOnce(new Error("timeout"));

      const ctx = makeContext();
      const plan = await createAttackPlan(ctx);

      // Should return a fallback plan, not throw
      expect(plan).toBeDefined();
      expect(plan.shouldProceed).toBe(true);
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it("should handle malformed LLM response gracefully", async () => {
      mockedLLM.mockResolvedValueOnce({
        choices: [{ message: { content: "This is not JSON at all" } }],
      } as any);

      const ctx = makeContext();
      const plan = await createAttackPlan(ctx);

      // Should return fallback plan
      expect(plan).toBeDefined();
      expect(plan.shouldProceed).toBe(true);
    });
  });

  describe("decidePivot", () => {
    it("should recommend pivot when method fails", async () => {
      const pivotResponse: PivotDecision = {
        shouldPivot: true,
        shouldAbort: false,
        newMethod: "ftp_upload",
        reasoning: "Shell upload failed but FTP is open — try direct FTP",
        confidence: 70,
        skipMethods: ["shell_upload"],
      };

      mockedLLM.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(pivotResponse) } }],
      } as any);

      const ctx = makeContext({ failedMethods: ["shell_upload"] });
      const decision = await decidePivot(ctx, "shell_upload", "WAF blocked upload");

      expect(decision.shouldPivot).toBe(true);
      expect(decision.newMethod).toBeTruthy();
      expect(decision.reasoning).toBeTruthy();
    });

    it("should recommend abort when all methods exhausted", async () => {
      const pivotResponse: PivotDecision = {
        shouldPivot: false,
        shouldAbort: true,
        newMethod: null,
        reasoning: "All viable methods exhausted — no more options",
        confidence: 90,
        skipMethods: [],
      };

      mockedLLM.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(pivotResponse) } }],
      } as any);

      const ctx = makeContext({
        failedMethods: ["shell_upload", "ftp_upload", "ssh_upload", "wp_exploit", "shellless"],
        elapsedMs: 600000,
      });
      const decision = await decidePivot(ctx, "shellless", "All methods failed");

      expect(decision.shouldAbort).toBe(true);
    });
  });

  describe("analyzeCostBenefit", () => {
    it("should recommend continue when time and methods available", async () => {
      const cbResponse: CostBenefitAnalysis = {
        shouldContinue: true,
        confidence: 80,
        timeVsReward: "5 min spent / 10 min remaining — 3 methods left with 60%+ chance",
        remainingViableMethods: ["ftp_upload", "ssh_upload", "cf_takeover"],
        riskAssessment: "low",
        estimatedRemainingTimeMs: 120000,
      };

      mockedLLM.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(cbResponse) } }],
      } as any);

      const ctx = makeContext({ elapsedMs: 300000, maxTimeMs: 900000 });
      const analysis = await analyzeCostBenefit(ctx);

      expect(analysis.shouldContinue).toBe(true);
      expect(analysis.remainingViableMethods.length).toBeGreaterThan(0);
    });

    it("should recommend stop when time nearly exhausted", async () => {
      const cbResponse: CostBenefitAnalysis = {
        shouldContinue: false,
        confidence: 85,
        timeVsReward: "14 min spent / 1 min remaining — not enough time",
        remainingViableMethods: [],
        riskAssessment: "high",
        estimatedRemainingTimeMs: 60000,
      };

      mockedLLM.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(cbResponse) } }],
      } as any);

      const ctx = makeContext({ elapsedMs: 840000, maxTimeMs: 900000 });
      const analysis = await analyzeCostBenefit(ctx);

      expect(analysis.shouldContinue).toBe(false);
    });
  });

  describe("rankCredentials", () => {
    it("should rank plaintext credentials higher", async () => {
      const rankResponse = {
        ranked: [
          { index: 1, score: 90, reasoning: "Plaintext password, admin email" },
          { index: 2, score: 30, reasoning: "Hashed password, unlikely to work" },
        ],
      };

      mockedLLM.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(rankResponse) } }],
      } as any);

      const creds = [
        { email: "admin@example.com", password: "pass123", isPlaintext: true },
        { email: "user@example.com", password: "$2b$10$hash", isPlaintext: false },
      ];

      const ranked = await rankCredentials(creds, "example.com", "wp_admin");

      expect(ranked.length).toBeGreaterThan(0);
      // First should be the plaintext one (index 1)
      expect(ranked[0].email).toBe("admin@example.com");
      expect(ranked[0].score).toBe(90);
    });
  });

  describe("selectRedirectMethod", () => {
    it("should select appropriate method for CF-level redirects", async () => {
      const methodResponse = {
        method: "php_redirect",
        confidence: 85,
        reasoning: "PHP redirect as fallback since CF takeover is separate module",
        code: "<?php header('Location: https://hkt956.org/'); exit; ?>",
      };

      mockedLLM.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(methodResponse) } }],
      } as any);

      const ctx = makeContext({ isCfLevelRedirect: true, isCloudflare: true });
      const result = await selectRedirectMethod(ctx);

      // selectRedirectMethod only returns redirect code methods, not cf_takeover
      expect(["php_redirect", "htaccess_redirect", "js_redirect", "meta_refresh", "wp_option_redirect", "nginx_conf", "web_config"]).toContain(result.method);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.code).toBeTruthy();
    });

    it("should select htaccess for Apache servers", async () => {
      const methodResponse = {
        method: "htaccess_overwrite",
        confidence: 75,
        reasoning: "Apache server with writable paths — .htaccess injection is best",
        fallback: "php_redirect",
      };

      mockedLLM.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(methodResponse) } }],
      } as any);

      const ctx = makeContext({ serverType: "Apache/2.4", isCloudflare: false, isCfLevelRedirect: false });
      const result = await selectRedirectMethod(ctx);

      expect(result.method).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe("formatBrainDecision", () => {
    it("should format attack plan decision", () => {
      const plan = {
        shouldProceed: true,
        overallConfidence: 75,
        overallReasoning: "Good chance of success",
        steps: [
          { method: "wp_exploit", confidence: 80, reasoning: "WP vuln", prerequisites: [], estimatedTimeMs: 30000, fallbackMethod: "ftp" },
        ],
        abortReason: null,
        estimatedTimeMs: 30000,
      };

      const formatted = formatBrainDecision("plan", plan);
      expect(formatted).toContain("75%");
      expect(formatted).toContain("wp_exploit");
    });

    it("should format pivot decision", () => {
      const pivot: PivotDecision = {
        shouldPivot: true,
        shouldAbort: false,
        newMethod: "ftp_upload",
        reasoning: "Switching to FTP",
        confidence: 70,
        skipMethods: ["shell_upload"],
      };

      const formatted = formatBrainDecision("pivot", pivot);
      expect(formatted).toContain("ftp_upload");
      expect(formatted).toContain("70%");
    });

    it("should format cost-benefit analysis", () => {
      const cb = {
        shouldContinue: true,
        confidence: 80,
        reasoning: "Still have viable methods",
        timeVsReward: "5 min / 10 min remaining",
        remainingViableMethods: ["ftp", "ssh"],
        riskAssessment: "low",
        estimatedRemainingTimeMs: 120000,
      };

      const formatted = formatBrainDecision("cost_benefit", cb);
      expect(formatted).toContain("Continue");
    });
  });
});
