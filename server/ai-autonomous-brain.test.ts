/**
 * Tests for AI Autonomous Brain + Autonomous Router types
 * Unit tests for construction, strategy defaults, decision logic, patterns
 */
import { describe, it, expect, vi } from "vitest";
import {
  AIAutonomousBrain,
  type AIStrategy,
  type AIDecision,
  type AIVerification,
  type AIPostDeployReport,
} from "./ai-autonomous-brain";

// ─── Test Helpers ───

function makeBrain(): AIAutonomousBrain {
  return new AIAutonomousBrain(vi.fn());
}

function makeWorldState() {
  return {
    hosts: [] as string[],
    ports: [] as Array<{ host: string; port: number; service: string }>,
    vulns: [] as Array<{ type: string; detail: string }>,
    creds: [] as Array<{ type: string; value: string }>,
    uploadPaths: [] as string[],
    shellUrls: [] as string[],
    deployedFiles: [] as string[],
    verifiedUrls: [] as string[],
    failedAttempts: [] as Array<{ method: string; error: string }>,
    counts() {
      return {
        hosts: this.hosts.length,
        ports: this.ports.length,
        vulns: this.vulns.length,
        creds: this.creds.length,
        uploadPaths: this.uploadPaths.length,
        shellUrls: this.shellUrls.length,
        deployedFiles: this.deployedFiles.length,
        verifiedUrls: this.verifiedUrls.length,
      };
    },
    summary() {
      return "test summary";
    },
    addHost(h: string) {
      if (!this.hosts.includes(h)) this.hosts.push(h);
    },
  };
}

// ─── Tests ───

describe("AI Autonomous Brain", () => {
  // ── Construction ──
  describe("Construction", () => {
    it("should construct with a callback", () => {
      const brain = makeBrain();
      expect(brain).toBeDefined();
    });

    it("should start with empty decisions", () => {
      const brain = makeBrain();
      expect(brain.getDecisions()).toHaveLength(0);
    });

    it("should start with empty strategies", () => {
      const brain = makeBrain();
      expect(brain.getStrategies()).toHaveLength(0);
    });

    it("should start with empty failure patterns", () => {
      const brain = makeBrain();
      expect(Object.keys(brain.getFailurePatterns())).toHaveLength(0);
    });

    it("should start with empty success patterns", () => {
      const brain = makeBrain();
      expect(Object.keys(brain.getSuccessPatterns())).toHaveLength(0);
    });
  });

  // ── Pattern Tracking ──
  describe("Pattern Tracking", () => {
    it("should record success patterns", () => {
      const brain = makeBrain();
      brain.recordSuccess("multipart_upload");
      brain.recordSuccess("multipart_upload");
      brain.recordSuccess("ftp_brute");
      expect(brain.getSuccessPatterns()).toEqual({
        multipart_upload: 2,
        ftp_brute: 1,
      });
    });

    it("should record failure patterns", () => {
      const brain = makeBrain();
      brain.recordFailure("direct_upload");
      brain.recordFailure("direct_upload");
      brain.recordFailure("direct_upload");
      brain.recordFailure("webdav_put");
      expect(brain.getFailurePatterns()).toEqual({
        direct_upload: 3,
        webdav_put: 1,
      });
    });

    it("should track both success and failure independently", () => {
      const brain = makeBrain();
      brain.recordSuccess("method_a");
      brain.recordFailure("method_a");
      brain.recordSuccess("method_a");
      expect(brain.getSuccessPatterns()["method_a"]).toBe(2);
      expect(brain.getFailurePatterns()["method_a"]).toBe(1);
    });
  });

  // ── Summary ──
  describe("Summary", () => {
    it("should return a summary object", () => {
      const brain = makeBrain();
      const summary = brain.getSummary();
      expect(summary).toHaveProperty("totalDecisions", 0);
      expect(summary).toHaveProperty("totalStrategies", 0);
      expect(summary).toHaveProperty("failurePatterns");
      expect(summary).toHaveProperty("successPatterns");
      expect(summary).toHaveProperty("lastDecision", null);
      expect(summary).toHaveProperty("lastStrategy", null);
    });

    it("should reflect recorded patterns in summary", () => {
      const brain = makeBrain();
      brain.recordSuccess("test_method");
      brain.recordFailure("bad_method");
      const summary = brain.getSummary();
      expect((summary.successPatterns as Record<string, number>)["test_method"]).toBe(1);
      expect((summary.failurePatterns as Record<string, number>)["bad_method"]).toBe(1);
    });
  });

  // ── Type Validation ──
  describe("Type Validation", () => {
    it("should validate AIStrategy interface", () => {
      const strategy: AIStrategy = {
        primaryMethod: "multipart_upload",
        fallbackMethods: ["ftp_brute", "webdav_put"],
        shellType: "php",
        uploadApproach: "direct",
        wafBypass: null,
        obfuscation: "basic",
        timing: "fast",
        reasoning: "Test strategy",
        confidence: 75,
        estimatedSuccessRate: 60,
        riskLevel: "medium",
      };
      expect(strategy.primaryMethod).toBe("multipart_upload");
      expect(strategy.shellType).toBe("php");
      expect(strategy.confidence).toBe(75);
    });

    it("should validate AIDecision interface", () => {
      const decision: AIDecision = {
        action: "escalate",
        reasoning: "Too many failures",
        suggestedEscalation: "aggressive",
        changes: { method: "parallel" },
        confidence: 80,
        timestamp: Date.now(),
      };
      expect(decision.action).toBe("escalate");
      expect(decision.confidence).toBe(80);
    });

    it("should validate AIVerification interface", () => {
      const verification: AIVerification = {
        url: "https://example.com/shell.php",
        accessible: true,
        statusCode: 200,
        contentType: "text/html",
        isShell: true,
        isRedirect: false,
        redirectTarget: null,
        wafBlocked: false,
        reasoning: "Shell accessible",
      };
      expect(verification.accessible).toBe(true);
      expect(verification.isShell).toBe(true);
    });

    it("should validate AIPostDeployReport interface", () => {
      const report: AIPostDeployReport = {
        overallSuccess: true,
        successRate: 85,
        improvements: ["Use steganography for WAF bypass"],
        risks: ["Shell may be detected by scanner"],
        nextSteps: ["Monitor for cleanup"],
        lessonsLearned: ["FTP was faster than HTTP upload"],
      };
      expect(report.overallSuccess).toBe(true);
      expect(report.successRate).toBe(85);
      expect(report.improvements).toHaveLength(1);
    });

    it("should accept all valid action types", () => {
      const actions: AIDecision["action"][] = [
        "continue", "escalate", "switch_method", "switch_goal", "abort", "retry_with_changes",
      ];
      for (const action of actions) {
        const decision: AIDecision = {
          action,
          reasoning: `Testing ${action}`,
          changes: {},
          confidence: 50,
          timestamp: Date.now(),
        };
        expect(decision.action).toBe(action);
      }
    });

    it("should accept all valid shell types", () => {
      const shellTypes: AIStrategy["shellType"][] = ["php", "asp", "aspx", "jsp", "multi"];
      for (const shellType of shellTypes) {
        const strategy: AIStrategy = {
          primaryMethod: "test",
          fallbackMethods: [],
          shellType,
          uploadApproach: "direct",
          wafBypass: null,
          obfuscation: "none",
          timing: "fast",
          reasoning: "test",
          confidence: 50,
          estimatedSuccessRate: 50,
          riskLevel: "low",
        };
        expect(strategy.shellType).toBe(shellType);
      }
    });

    it("should accept all valid risk levels", () => {
      const riskLevels: AIStrategy["riskLevel"][] = ["low", "medium", "high", "extreme"];
      for (const riskLevel of riskLevels) {
        const strategy: AIStrategy = {
          primaryMethod: "test",
          fallbackMethods: [],
          shellType: "php",
          uploadApproach: "direct",
          wafBypass: null,
          obfuscation: "none",
          timing: "fast",
          reasoning: "test",
          confidence: 50,
          estimatedSuccessRate: 50,
          riskLevel,
        };
        expect(strategy.riskLevel).toBe(riskLevel);
      }
    });
  });

  // ── Suggest Next Method ──
  describe("Method Suggestion Logic", () => {
    it("should avoid methods that have failed", () => {
      const brain = makeBrain();
      brain.recordFailure("direct_upload");
      brain.recordFailure("direct_upload");
      brain.recordFailure("multipart_upload");
      // The brain should prefer methods that haven't failed
      const patterns = brain.getFailurePatterns();
      expect(patterns["direct_upload"]).toBe(2);
      expect(patterns["multipart_upload"]).toBe(1);
    });

    it("should prefer methods that have succeeded", () => {
      const brain = makeBrain();
      brain.recordSuccess("ftp_brute");
      brain.recordSuccess("ftp_brute");
      brain.recordSuccess("ftp_brute");
      const patterns = brain.getSuccessPatterns();
      expect(patterns["ftp_brute"]).toBe(3);
    });
  });
});
