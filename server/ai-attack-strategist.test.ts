/**
 * Tests for AI Attack Strategist — LLM-Powered Auto-Retry Brain
 */
import { describe, it, expect, vi } from "vitest";

// ─── Module Exports ───
describe("AI Attack Strategist - Exports", () => {
  it("should export all core functions", async () => {
    const mod = await import("./ai-attack-strategist");
    expect(typeof mod.analyzeFailure).toBe("function");
    expect(typeof mod.generateRetryStrategy).toBe("function");
    expect(typeof mod.adaptPayload).toBe("function");
    expect(typeof mod.selectNextTarget).toBe("function");
    expect(typeof mod.evaluateAttackSurface).toBe("function");
    expect(typeof mod.shouldContinueRetrying).toBe("function");
    expect(typeof mod.orchestrateRetry).toBe("function");
  });

  it("should export ALL_ATTACK_METHODS constant", async () => {
    const mod = await import("./ai-attack-strategist");
    expect(Array.isArray(mod.ALL_ATTACK_METHODS)).toBe(true);
    expect(mod.ALL_ATTACK_METHODS.length).toBeGreaterThan(10);
    expect(mod.ALL_ATTACK_METHODS).toContain("cve_exploit");
    expect(mod.ALL_ATTACK_METHODS).toContain("wp_brute_force");
    expect(mod.ALL_ATTACK_METHODS).toContain("ai_generated_exploit");
    expect(mod.ALL_ATTACK_METHODS).toContain("sql_injection");
    expect(mod.ALL_ATTACK_METHODS).toContain("lfi_rce");
    expect(mod.ALL_ATTACK_METHODS).toContain("ssrf");
  });

  it("should export correct TypeScript types", async () => {
    const mod = await import("./ai-attack-strategist");
    const targetCtx: import("./ai-attack-strategist").TargetContext = {
      domain: "test.com",
      cms: "wordpress",
      cmsVersion: "5.9.0",
      serverType: "Apache",
      phpVersion: "7.4",
      wafDetected: null,
      wafStrength: null,
      vulnScore: 75,
      hasOpenUpload: true,
      hasExposedConfig: false,
      hasExposedAdmin: true,
      hasWritableDir: false,
      hasVulnerableCms: true,
      hasWeakAuth: false,
      knownCves: ["CVE-2024-1234"],
      previousAttempts: [],
    };
    expect(targetCtx.domain).toBe("test.com");
    expect(targetCtx.cms).toBe("wordpress");
  });
});

// ─── Type Structures ───
describe("AI Attack Strategist - Type Structures", () => {
  it("AttackAttemptRecord should have all required fields", async () => {
    const record: import("./ai-attack-strategist").AttackAttemptRecord = {
      attemptNumber: 1,
      method: "cve_exploit",
      exploitType: "rce",
      wafDetected: "Cloudflare",
      httpStatus: 403,
      responseSnippet: "Access Denied",
      errorMessage: "WAF blocked request",
      duration: 5000,
      timestamp: Date.now(),
    };
    expect(record.attemptNumber).toBe(1);
    expect(record.method).toBe("cve_exploit");
    expect(record.wafDetected).toBe("Cloudflare");
    expect(record.httpStatus).toBe(403);
  });

  it("FailureAnalysis should support all failure categories", () => {
    const categories: import("./ai-attack-strategist").FailureAnalysis["failureCategory"][] = [
      "waf_block", "patched_vuln", "wrong_cms", "auth_required",
      "rate_limited", "timeout", "network_error", "file_not_writable",
      "exploit_failed", "detection_blocked", "unknown",
    ];
    expect(categories).toHaveLength(11);
  });

  it("RetryStrategy should have all required fields", () => {
    const strategy: import("./ai-attack-strategist").RetryStrategy = {
      shouldRetry: true,
      nextMethod: "file_upload_spray",
      nextExploitType: "php_shell",
      payloadModifications: ["base64_encode", "null_byte"],
      wafBypassTechniques: ["chunked_encoding"],
      attackPath: "Upload via media library",
      reasoning: "Previous CVE exploit was patched",
      estimatedSuccessRate: 45,
      priority: 7,
      alternativeTargetSuggested: false,
    };
    expect(strategy.shouldRetry).toBe(true);
    expect(strategy.nextMethod).toBe("file_upload_spray");
    expect(strategy.estimatedSuccessRate).toBe(45);
  });

  it("AdaptedPayload should support all obfuscation levels", () => {
    const levels: import("./ai-attack-strategist").AdaptedPayload["obfuscationLevel"][] = [
      "none", "light", "medium", "heavy",
    ];
    expect(levels).toHaveLength(4);
  });

  it("AttackVector should support all difficulty levels", () => {
    const difficulties: import("./ai-attack-strategist").AttackVector["difficulty"][] = [
      "easy", "medium", "hard", "very_hard",
    ];
    expect(difficulties).toHaveLength(4);
  });

  it("ContinueDecision should support all suggested actions", () => {
    const actions: import("./ai-attack-strategist").ContinueDecision["suggestedAction"][] = [
      "retry_same_target", "try_different_method", "skip_target", "abort_session",
    ];
    expect(actions).toHaveLength(4);
  });
});

// ─── shouldContinueRetrying Hard Limit ───
describe("AI Attack Strategist - shouldContinueRetrying", () => {
  it("should return false when max retries reached (hard limit)", async () => {
    const { shouldContinueRetrying } = await import("./ai-attack-strategist");
    const target: import("./ai-attack-strategist").TargetContext = {
      domain: "hardened-site.com",
      cms: "wordpress",
      cmsVersion: "6.0",
      serverType: "Nginx",
      phpVersion: "8.1",
      wafDetected: "Cloudflare",
      wafStrength: "very_strong",
      vulnScore: 20,
      hasOpenUpload: false,
      hasExposedConfig: false,
      hasExposedAdmin: false,
      hasWritableDir: false,
      hasVulnerableCms: false,
      hasWeakAuth: false,
      knownCves: [],
      previousAttempts: Array.from({ length: 5 }, (_, i) => ({
        attemptNumber: i + 1,
        method: `method_${i}`,
        exploitType: "test",
        wafDetected: "Cloudflare",
        httpStatus: 403,
        responseSnippet: "Blocked",
        errorMessage: "WAF blocked",
        duration: 3000,
        timestamp: Date.now(),
      })),
    };

    const result = await shouldContinueRetrying(target, 5, {
      totalTargets: 10,
      remainingTargets: 5,
      successRate: 20,
      avgTimePerTarget: 30000,
    });

    expect(result.shouldContinue).toBe(false);
    expect(result.confidence).toBe(100);
    expect(result.suggestedAction).toBe("skip_target");
    expect(result.maxMoreRetries).toBe(0);
    expect(result.reasoning).toContain("Hard limit");
  });

  it("should return false when max retries is 0 and attempts is 0", async () => {
    const { shouldContinueRetrying } = await import("./ai-attack-strategist");
    const target: import("./ai-attack-strategist").TargetContext = {
      domain: "test.com",
      cms: null,
      cmsVersion: null,
      serverType: null,
      phpVersion: null,
      wafDetected: null,
      wafStrength: null,
      vulnScore: 50,
      hasOpenUpload: false,
      hasExposedConfig: false,
      hasExposedAdmin: false,
      hasWritableDir: false,
      hasVulnerableCms: false,
      hasWeakAuth: false,
      knownCves: [],
      previousAttempts: [],
    };

    const result = await shouldContinueRetrying(target, 0, {
      totalTargets: 1,
      remainingTargets: 0,
      successRate: 0,
      avgTimePerTarget: 0,
    });

    expect(result.shouldContinue).toBe(false);
    expect(result.maxMoreRetries).toBe(0);
  });
});

// ─── orchestrateRetry ───
describe("AI Attack Strategist - orchestrateRetry", () => {
  it("should return null strategy when no previous attempts exist", async () => {
    const { orchestrateRetry, ALL_ATTACK_METHODS } = await import("./ai-attack-strategist");
    const target: import("./ai-attack-strategist").TargetContext = {
      domain: "fresh-target.com",
      cms: "wordpress",
      cmsVersion: null,
      serverType: null,
      phpVersion: null,
      wafDetected: null,
      wafStrength: null,
      vulnScore: 60,
      hasOpenUpload: false,
      hasExposedConfig: false,
      hasExposedAdmin: false,
      hasWritableDir: false,
      hasVulnerableCms: false,
      hasWeakAuth: false,
      knownCves: [],
      previousAttempts: [],
    };

    const result = await orchestrateRetry(
      target,
      5,
      { totalTargets: 10, remainingTargets: 5, successRate: 0, avgTimePerTarget: 0 },
      Array.from(ALL_ATTACK_METHODS),
    );

    expect(result.strategy).toBeNull();
    expect(result.failureAnalysis).toBeNull();
    expect(result.continueDecision.shouldContinue).toBe(false);
    expect(result.aiReasoning).toContain("No previous attempts");
  });
});

// ─── ALL_ATTACK_METHODS ───
describe("AI Attack Strategist - Attack Methods", () => {
  it("should contain all expected attack methods", async () => {
    const { ALL_ATTACK_METHODS } = await import("./ai-attack-strategist");
    const expectedMethods = [
      "cve_exploit", "wp_brute_force", "cms_plugin_exploit", "file_upload_spray",
      "config_exploit", "xmlrpc_attack", "rest_api_exploit", "ftp_brute",
      "webdav_upload", "htaccess_overwrite", "wp_admin_takeover", "shellless_redirect",
      "ai_generated_exploit", "waf_bypass_upload", "sql_injection", "lfi_rce",
      "ssrf", "deserialization",
    ];
    for (const method of expectedMethods) {
      expect(ALL_ATTACK_METHODS).toContain(method);
    }
    expect(ALL_ATTACK_METHODS).toHaveLength(expectedMethods.length);
  });

  it("should have no duplicate methods", async () => {
    const { ALL_ATTACK_METHODS } = await import("./ai-attack-strategist");
    const unique = new Set(ALL_ATTACK_METHODS);
    expect(unique.size).toBe(ALL_ATTACK_METHODS.length);
  });
});

// ─── Integration with Agentic Engine ───
describe("AI Attack Strategist - Agentic Engine Integration", () => {
  it("agentic engine should have maxRetriesPerTarget config", async () => {
    const config: import("./agentic-attack-engine").AgenticConfig = {
      userId: 1,
      mode: "full_auto",
      maxRetriesPerTarget: 5,
    };
    expect(config.maxRetriesPerTarget).toBe(5);
  });

  it("agentic engine should import ai-attack-strategist functions", async () => {
    const strategist = await import("./ai-attack-strategist");
    expect(typeof strategist.orchestrateRetry).toBe("function");
    expect(typeof strategist.evaluateAttackSurface).toBe("function");
    expect(typeof strategist.analyzeFailure).toBe("function");
    expect(typeof strategist.generateRetryStrategy).toBe("function");
    expect(typeof strategist.adaptPayload).toBe("function");
    expect(typeof strategist.selectNextTarget).toBe("function");
    expect(typeof strategist.shouldContinueRetrying).toBe("function");
  });
});
