/**
 * Adaptive Learning Engine — Vitest Tests
 *
 * Tests the core adaptive learning functions:
 *   1. recordAttackOutcome — saves outcomes to DB
 *   2. queryHistoricalPatterns — retrieves aggregated patterns
 *   3. calculateMethodSuccessRates — per-method success rates
 *   4. getAdaptiveLearningStats — dashboard stats
 *   5. updateLearnedPatterns — aggregation pipeline
 *   6. updateCmsProfiles — CMS profile builder
 *   7. runLearningCycle — full learning cycle
 *   8. getLearnedInsights — AI-synthesized insights
 *   9. suggestBestStrategy — AI strategy recommendation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB (factory must not reference outer variables) ───
vi.mock("./db", () => {
  const mockInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockImplementation((row: any) => {
      // Store inserted rows on the function itself for inspection
      (mockInsert as any).__lastRow = row;
      (mockInsert as any).__rows = (mockInsert as any).__rows || [];
      (mockInsert as any).__rows.push(row);
      return { execute: vi.fn().mockResolvedValue([{ insertId: 1 }]) };
    }),
  });

  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
        limit: vi.fn().mockResolvedValue([]),
      }),
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
      limit: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
        having: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
  });

  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  const mockDelete = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue([]),
    }),
  });

  const mockExecute = vi.fn().mockResolvedValue([[]]);

  const db = {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
    execute: mockExecute,
  };

  return {
    getDb: vi.fn().mockResolvedValue(db),
    __mockDb: db,
  };
});

// ─── Mock LLM ───
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          insights: [{
            patternType: "cms_method",
            patternKey: "wordpress:wp_brute_force",
            insight: "WordPress brute force is effective against weak admin passwords",
            recommendation: "Try wp_brute_force first for WordPress targets",
            confidence: 85,
            successRate: 42,
            sampleSize: 50,
          }],
        }),
      },
    }],
  }),
}));

// ─── Import module under test (AFTER mocks) ───
import {
  recordAttackOutcome,
  queryHistoricalPatterns,
  calculateMethodSuccessRates,
  getAdaptiveLearningStats,
  updateLearnedPatterns,
  updateCmsProfiles,
  runLearningCycle,
  getLearnedInsights,
  suggestBestStrategy,
  getCmsAttackProfile,
  type AttackOutcome,
} from "./adaptive-learning";
import { getDb } from "./db";

// ─── Test data factory ───
function createOutcome(overrides?: Partial<AttackOutcome>): AttackOutcome {
  return {
    targetDomain: "example.com",
    cms: "WordPress",
    cmsVersion: "6.4.2",
    serverType: "Apache",
    phpVersion: "8.1",
    wafDetected: "Cloudflare",
    wafStrength: "medium",
    vulnScore: 75,
    method: "wp_brute_force",
    exploitType: "credential_attack",
    payloadType: "dictionary",
    wafBypassUsed: ["header_rotation", "ip_rotation"],
    payloadModifications: ["base64_encode", "unicode_escape"],
    attackPath: "/wp-login.php",
    attemptNumber: 1,
    isRetry: false,
    previousMethodsTried: [],
    success: true,
    httpStatus: 200,
    errorCategory: null,
    errorMessage: null,
    filesPlaced: 3,
    redirectVerified: true,
    durationMs: 15000,
    aiFailureCategory: null,
    aiReasoning: null,
    aiConfidence: null,
    aiEstimatedSuccess: null,
    sessionId: 1,
    agenticSessionId: 1,
    ...overrides,
  };
}

// Helper to get the mock db
async function getMockDb() {
  return (await import("./db") as any).__mockDb;
}

// ─── Tests ───

describe("Adaptive Learning Engine", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const db = await getMockDb();
    if (db.insert.__rows) db.insert.__rows = [];
  });

  describe("recordAttackOutcome", () => {
    it("should call db.insert to save the outcome", async () => {
      const outcome = createOutcome({ success: true });
      await recordAttackOutcome(outcome);

      const db = await getMockDb();
      expect(db.insert).toHaveBeenCalled();
    });

    it("should save the correct domain and method", async () => {
      const outcome = createOutcome({
        targetDomain: "target.com",
        method: "file_upload_spray",
      });
      await recordAttackOutcome(outcome);

      const db = await getMockDb();
      const row = db.insert.__lastRow;
      expect(row.targetDomain).toBe("target.com");
      expect(row.method).toBe("file_upload_spray");
    });

    it("should save success=true for successful attacks", async () => {
      await recordAttackOutcome(createOutcome({ success: true }));
      const db = await getMockDb();
      expect(db.insert.__lastRow.success).toBe(true);
    });

    it("should save success=false for failed attacks", async () => {
      await recordAttackOutcome(createOutcome({
        success: false,
        httpStatus: 403,
        errorCategory: "waf_blocked",
        errorMessage: "Cloudflare blocked request",
        filesPlaced: 0,
        redirectVerified: false,
      }));
      const db = await getMockDb();
      const row = db.insert.__lastRow;
      expect(row.success).toBe(false);
      expect(row.httpStatus).toBe(403);
      expect(row.errorCategory).toBe("waf_blocked");
    });

    it("should store arrays for JSON columns", async () => {
      await recordAttackOutcome(createOutcome({
        wafBypassUsed: ["technique1", "technique2"],
        payloadModifications: ["mod1"],
        previousMethodsTried: ["method1", "method2"],
      }));
      const db = await getMockDb();
      const row = db.insert.__lastRow;
      // Drizzle JSON columns accept arrays directly
      expect(Array.isArray(row.wafBypassUsed)).toBe(true);
      expect(row.wafBypassUsed).toEqual(["technique1", "technique2"]);
      expect(row.payloadModifications).toEqual(["mod1"]);
    });

    it("should handle retry outcomes with previous methods", async () => {
      await recordAttackOutcome(createOutcome({
        attemptNumber: 3,
        isRetry: true,
        previousMethodsTried: ["cve_exploit", "file_upload_spray"],
      }));
      const db = await getMockDb();
      const row = db.insert.__lastRow;
      expect(row.attemptNumber).toBe(3);
      expect(row.isRetry).toBe(true);
    });

    it("should handle null optional fields", async () => {
      await recordAttackOutcome(createOutcome({
        cmsVersion: null,
        phpVersion: null,
        wafDetected: null,
        sessionId: null,
      }));
      const db = await getMockDb();
      const row = db.insert.__lastRow;
      expect(row.cmsVersion).toBeNull();
      expect(row.phpVersion).toBeNull();
      expect(row.wafDetected).toBeNull();
    });

    it("should handle empty arrays", async () => {
      await recordAttackOutcome(createOutcome({
        wafBypassUsed: [],
        payloadModifications: [],
        previousMethodsTried: [],
      }));
      const db = await getMockDb();
      const row = db.insert.__lastRow;
      expect(row.wafBypassUsed).toEqual([]);
      expect(row.payloadModifications).toEqual([]);
      expect(row.previousMethodsTried).toEqual([]);
    });
  });

  describe("queryHistoricalPatterns", () => {
    it("should return an array", async () => {
      const patterns = await queryHistoricalPatterns({});
      expect(Array.isArray(patterns)).toBe(true);
    });

    it("should accept CMS filter without error", async () => {
      const patterns = await queryHistoricalPatterns({ cms: "WordPress" });
      expect(Array.isArray(patterns)).toBe(true);
    });

    it("should accept WAF filter without error", async () => {
      const patterns = await queryHistoricalPatterns({ waf: "Cloudflare" });
      expect(Array.isArray(patterns)).toBe(true);
    });

    it("should accept combined filters without error", async () => {
      const patterns = await queryHistoricalPatterns({
        cms: "WordPress",
        waf: "Cloudflare",
        serverType: "Apache",
        method: "wp_brute_force",
      });
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe("calculateMethodSuccessRates", () => {
    it("should return an array", async () => {
      const rates = await calculateMethodSuccessRates({});
      expect(Array.isArray(rates)).toBe(true);
    });

    it("should accept optional filters", async () => {
      const rates = await calculateMethodSuccessRates({
        cms: "WordPress",
        minAttempts: 5,
      });
      expect(Array.isArray(rates)).toBe(true);
    });

    it("should work with no parameters", async () => {
      const rates = await calculateMethodSuccessRates();
      expect(Array.isArray(rates)).toBe(true);
    });
  });

  describe("getAdaptiveLearningStats", () => {
    it("should return a stats object with all required fields", async () => {
      const stats = await getAdaptiveLearningStats();
      expect(stats).toBeDefined();
      expect(typeof stats.totalOutcomesRecorded).toBe("number");
      expect(typeof stats.totalSuccesses).toBe("number");
      expect(typeof stats.totalFailures).toBe("number");
      expect(typeof stats.overallSuccessRate).toBe("number");
      expect(typeof stats.totalLearnedPatterns).toBe("number");
      expect(typeof stats.totalCmsProfiles).toBe("number");
      expect(stats.recentTrend).toBeDefined();
      expect(stats.recentTrend.last24h).toBeDefined();
      expect(stats.recentTrend.last7d).toBeDefined();
      expect(stats.recentTrend.last30d).toBeDefined();
      expect(Array.isArray(stats.topMethods)).toBe(true);
      expect(Array.isArray(stats.mostAttackedCms)).toBe(true);
    });
  });

  describe("updateLearnedPatterns", () => {
    it("should return a number >= 0", async () => {
      const count = await updateLearnedPatterns();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("updateCmsProfiles", () => {
    it("should return a number >= 0", async () => {
      const count = await updateCmsProfiles();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("runLearningCycle", () => {
    it("should return patternsUpdated and profilesUpdated", async () => {
      const result = await runLearningCycle();
      expect(result).toBeDefined();
      expect(typeof result.patternsUpdated).toBe("number");
      expect(typeof result.profilesUpdated).toBe("number");
    });
  });

  describe("getLearnedInsights", () => {
    it("should return an array", async () => {
      const insights = await getLearnedInsights({});
      expect(Array.isArray(insights)).toBe(true);
    });

    it("should accept CMS and WAF filters", async () => {
      const insights = await getLearnedInsights({
        cms: "WordPress",
        waf: "Cloudflare",
        limit: 5,
      });
      expect(Array.isArray(insights)).toBe(true);
    });
  });

  describe("getCmsAttackProfile", () => {
    it("should return null or object for unknown CMS", async () => {
      const profile = await getCmsAttackProfile("NonExistentCMS");
      expect(profile === null || typeof profile === "object").toBe(true);
    });
  });

  describe("suggestBestStrategy", () => {
    it("should return a strategy recommendation", async () => {
      const { invokeLLM } = await import("./_core/llm");
      (invokeLLM as any).mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              recommendedMethod: "wp_brute_force",
              estimatedSuccessRate: 65,
              reasoning: "WordPress targets are vulnerable to brute force",
              payloadModifications: ["base64_encode"],
              wafBypassTechniques: ["header_rotation"],
              attackPath: "/wp-login.php",
              confidence: 80,
              basedOnSamples: 50,
              alternativeMethods: [
                { method: "cms_plugin_exploit", successRate: 45, reason: "Plugin vulns common" },
              ],
            }),
          },
        }],
      });

      const target = {
        domain: "test.com",
        cms: "WordPress" as string | null,
        cmsVersion: "6.4" as string | null,
        serverType: "Apache" as string | null,
        wafDetected: "Cloudflare" as string | null,
        wafStrength: "medium" as string | null,
        vulnScore: 75,
        hasOpenUpload: false,
        hasExposedAdmin: true,
        hasVulnerableCms: true,
        knownCves: ["CVE-2024-1234"],
      };

      const methods = ["wp_brute_force", "cms_plugin_exploit", "file_upload_spray"];
      const strategy = await suggestBestStrategy(target, methods);

      expect(strategy).toBeDefined();
      expect(typeof strategy.recommendedMethod).toBe("string");
      expect(typeof strategy.estimatedSuccessRate).toBe("number");
      expect(typeof strategy.reasoning).toBe("string");
      expect(typeof strategy.confidence).toBe("number");
    });
  });

  describe("Edge cases", () => {
    it("should handle empty string CMS", async () => {
      await recordAttackOutcome(createOutcome({ cms: "" }));
      const db = await getMockDb();
      expect(db.insert).toHaveBeenCalled();
    });

    it("should handle very long error messages", async () => {
      const longError = "x".repeat(10000);
      await recordAttackOutcome(createOutcome({
        success: false,
        errorMessage: longError,
      }));
      const db = await getMockDb();
      expect(db.insert).toHaveBeenCalled();
    });

    it("should handle zero duration", async () => {
      await recordAttackOutcome(createOutcome({ durationMs: 0 }));
      const db = await getMockDb();
      expect(db.insert.__lastRow.durationMs).toBe(0);
    });
  });
});
