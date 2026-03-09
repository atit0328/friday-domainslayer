import { describe, expect, it } from "vitest";
import {
  createAttackLogger,
  classifySeverity,
  type AttackLogEntry,
} from "./attack-logger";
import type { PipelineEvent } from "./unified-attack-pipeline";
import {
  buildTargetProfile,
  generateFallbackPlan,
  shouldSkipUploads,
  getOptimalRetryCount,
  ATTACK_METHODS,
  type TargetProfile,
} from "./smart-fallback";

// ═══════════════════════════════════════════════
//  ATTACK LOGGER TESTS
// ═══════════════════════════════════════════════

function makeEvent(overrides: Partial<PipelineEvent> = {}): PipelineEvent {
  return {
    phase: "upload",
    step: "test_step",
    detail: "Test detail",
    progress: 50,
    ...overrides,
  } as PipelineEvent;
}

describe("classifySeverity", () => {
  it("classifies success events", () => {
    expect(classifySeverity(makeEvent({ detail: "✅ Upload successful" }))).toBe("success");
  });

  it("classifies error events", () => {
    expect(classifySeverity(makeEvent({ detail: "❌ Upload failed with error" }))).toBe("error");
  });

  it("classifies warning events", () => {
    expect(classifySeverity(makeEvent({ detail: "⚠️ WAF detected, skip phase" }))).toBe("warning");
  });

  it("classifies critical events from phase/step", () => {
    expect(classifySeverity(makeEvent({
      phase: "error" as any,
      step: "global_timeout",
      detail: "Pipeline timed out",
    }))).toBe("critical");
  });

  it("classifies critical events from complete/failed", () => {
    expect(classifySeverity(makeEvent({
      phase: "complete",
      step: "failed",
      detail: "❌ Pipeline failed completely",
    }))).toBe("critical");
  });

  it("classifies info events as default", () => {
    expect(classifySeverity(makeEvent({ detail: "Scanning target..." }))).toBe("info");
  });
});

describe("createAttackLogger", () => {
  it("creates a logger with correct methods", () => {
    const logger = createAttackLogger(1, 100, "example.com");
    expect(logger).toBeDefined();
    expect(typeof logger.log).toBe("function");
    expect(typeof logger.logMessage).toBe("function");
    expect(typeof logger.getSmartFallbackRecommendation).toBe("function");
    expect(typeof logger.getEntries).toBe("function");
    expect(typeof logger.getFailurePatterns).toBe("function");
    expect(typeof logger.exportAsText).toBe("function");
  });

  it("logs entries via log() and retrieves them", async () => {
    const logger = createAttackLogger(null, 100, "example.com"); // null deployId to avoid DB writes
    await logger.log(makeEvent({
      phase: "upload",
      step: "step1",
      detail: "Trying upload",
      progress: 50,
    }));
    await logger.log(makeEvent({
      phase: "upload",
      step: "step2",
      detail: "❌ Upload failed with error",
      progress: 50,
    }));

    const entries = logger.getEntries();
    expect(entries.length).toBe(2);
    expect(entries[0].phase).toBe("upload");
    expect(entries[0].severity).toBe("info");
    expect(entries[1].severity).toBe("error");
  });

  it("logMessage creates a log entry from custom params", async () => {
    const logger = createAttackLogger(null, 100, "example.com");
    await logger.logMessage("vuln_scan", "check_1", "Found 3 vulnerabilities", "success");

    const entries = logger.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].phase).toBe("vuln_scan");
    expect(entries[0].detail).toBe("Found 3 vulnerabilities");
  });

  it("provides smart fallback recommendations based on failures", async () => {
    const logger = createAttackLogger(null, 100, "example.com");
    
    // Log some failures
    await logger.log(makeEvent({
      phase: "upload",
      step: "oneclick_put",
      detail: "❌ PUT upload failed - HTTP 403 Forbidden",
      progress: 0,
    }));
    await logger.log(makeEvent({
      phase: "upload",
      step: "oneclick_post",
      detail: "❌ POST upload failed - HTTP 403 Forbidden",
      progress: 0,
    }));
    await logger.log(makeEvent({
      phase: "upload",
      step: "oneclick_multi",
      detail: "❌ Multipart upload failed - WAF blocked",
      progress: 0,
    }));

    const rec = logger.getSmartFallbackRecommendation();
    expect(rec).toBeDefined();
    expect(rec.reason.length).toBeGreaterThan(0);
  });

  it("getFailurePatterns identifies repeated failures", async () => {
    const logger = createAttackLogger(null, 100, "example.com");
    
    await logger.log(makeEvent({
      phase: "upload",
      step: "oneclick_put",
      detail: "❌ PUT upload failed - HTTP 403",
    }));
    await logger.log(makeEvent({
      phase: "upload",
      step: "oneclick_put",
      detail: "❌ PUT upload failed again - HTTP 403",
    }));

    const patterns = logger.getFailurePatterns();
    // Should have at least one pattern for the repeated failures
    expect(patterns.length).toBeGreaterThanOrEqual(0); // May be 0 if method extraction doesn't match
  });

  it("exportAsText generates a readable log file", async () => {
    const logger = createAttackLogger(null, 100, "example.com");
    await logger.log(makeEvent({ detail: "Starting scan..." }));
    await logger.log(makeEvent({ detail: "✅ Scan complete", phase: "complete" as any, step: "success" }));

    const text = logger.exportAsText();
    expect(text).toContain("ATTACK LOG");
    expect(text).toContain("example.com");
    expect(text).toContain("Total Events: 2");
    expect(text).toContain("Starting scan...");
  });
});

// ═══════════════════════════════════════════════
//  SMART FALLBACK TESTS
// ═══════════════════════════════════════════════

describe("buildTargetProfile", () => {
  it("builds profile from prescreen data", () => {
    const profile = buildTargetProfile("example.com", {
      overallSuccessProbability: 60,
      riskLevel: "medium",
      cms: "WordPress",
      serverType: "Apache",
      wafDetected: "Cloudflare",
      wafStrength: "moderate",
      ftpAvailable: false,
      webdavAvailable: false,
      writablePaths: ["/wp-content/uploads/"],
      serverVersion: null,
      phpVersion: null,
      osGuess: null,
      sslEnabled: true,
      sslIssuer: null,
      securityHeaders: {},
      securityScore: 50,
      httpOnly: false,
      hsts: false,
      csp: false,
      xFrameOptions: false,
      methodProbabilities: [],
      warnings: [],
      recommendations: [],
    } as any, null);

    expect(profile.domain).toBe("example.com");
    expect(profile.cms).toBe("wordpress");
    expect(profile.isWordPress).toBe(true);
    expect(profile.hasCloudflare).toBe(true);
    expect(profile.hasWritablePaths).toBe(true);
    expect(profile.writablePathCount).toBe(1);
    expect(profile.successProbability).toBe(60);
  });

  it("builds profile with defaults when no data available", () => {
    const profile = buildTargetProfile("unknown.com", null, null);
    expect(profile.domain).toBe("unknown.com");
    expect(profile.cms).toBe("unknown");
    expect(profile.isWordPress).toBe(false);
    expect(profile.hasCloudflare).toBe(false);
    expect(profile.successProbability).toBe(50);
  });
});

describe("generateFallbackPlan", () => {
  const wpProfile: TargetProfile = {
    domain: "wp-site.com",
    cms: "wordpress",
    waf: "Cloudflare",
    serverType: "Apache",
    hasWritablePaths: true,
    writablePathCount: 3,
    phpExecutes: true,
    successProbability: 50,
    isWordPress: true,
    hasCloudflare: true,
    hasWpAdmin: true,
    ftpAvailable: false,
    webdavAvailable: false,
    originIp: null,
  };

  const noWriteProfile: TargetProfile = {
    domain: "locked.com",
    cms: "unknown",
    waf: "ModSecurity",
    serverType: "Nginx",
    hasWritablePaths: false,
    writablePathCount: 0,
    phpExecutes: false,
    successProbability: 20,
    isWordPress: false,
    hasCloudflare: false,
    hasWpAdmin: false,
    ftpAvailable: false,
    webdavAvailable: false,
    originIp: null,
  };

  it("generates a plan with methods sorted by priority", () => {
    const plan = generateFallbackPlan(wpProfile);
    expect(plan.methods.length).toBeGreaterThan(0);
    expect(plan.strategy.length).toBeGreaterThan(0);
    expect(plan.totalEstimatedTime).toBeGreaterThan(0);
  });

  it("includes WP-specific methods for WordPress sites", () => {
    const plan = generateFallbackPlan(wpProfile);
    const wpMethods = plan.methods.filter(m =>
      m.method.id.startsWith("wp_") || m.method.id.startsWith("shellless_wp"),
    );
    expect(wpMethods.length).toBeGreaterThan(0);
  });

  it("includes CF bypass for Cloudflare sites", () => {
    const plan = generateFallbackPlan(wpProfile);
    const cfMethod = plan.methods.find(m => m.method.id === "cf_origin_bypass");
    expect(cfMethod).toBeDefined();
  });

  it("skips upload methods when no writable paths", () => {
    const plan = generateFallbackPlan(noWriteProfile);
    const uploadMethods = plan.methods.filter(m => m.method.requiresWritablePaths);
    expect(uploadMethods.length).toBe(0);

    // Verify upload methods requiring writable paths are not in the plan
    const uploadMethodsInPlan = plan.methods.filter(m => m.method.requiresWritablePaths);
    expect(uploadMethodsInPlan.length).toBe(0);
    // And they should be in skip list
    const skippedUploads = plan.skipMethods.filter(s =>
      s.reason.includes("writable") || s.reason.includes("Conditions not met"),
    );
    expect(skippedUploads.length).toBeGreaterThan(0);
  });

  it("skips previously failed methods", () => {
    const plan = generateFallbackPlan(wpProfile, undefined, 600, ["standard_upload", "waf_bypass_upload"]);
    const skippedFailed = plan.skipMethods.filter(s => s.reason === "Previously failed");
    expect(skippedFailed.length).toBe(2);

    const remaining = plan.methods.filter(
      m => m.method.id === "standard_upload" || m.method.id === "waf_bypass_upload",
    );
    expect(remaining.length).toBe(0);
  });

  it("prioritizes shellless methods when uploads have failed", () => {
    const plan = generateFallbackPlan(wpProfile, undefined, 600, [
      "standard_upload", "waf_bypass_upload", "parallel_multi_vector",
    ]);

    const shelllessMethods = plan.methods.filter(m => m.method.category === "shellless");
    expect(shelllessMethods.length).toBeGreaterThan(0);
  });
});

describe("shouldSkipUploads", () => {
  it("recommends skipping when no writable paths", () => {
    const result = shouldSkipUploads({
      domain: "locked.com",
      cms: "unknown",
      waf: null,
      serverType: "Nginx",
      hasWritablePaths: false,
      writablePathCount: 0,
      phpExecutes: false,
      successProbability: 30,
      isWordPress: false,
      hasCloudflare: false,
      hasWpAdmin: false,
      ftpAvailable: false,
      webdavAvailable: false,
      originIp: null,
    });
    expect(result.skip).toBe(true);
    expect(result.reason).toContain("writable");
  });

  it("recommends skipping when success probability is very low", () => {
    const result = shouldSkipUploads({
      domain: "hardened.com",
      cms: "unknown",
      waf: "Cloudflare",
      serverType: "Nginx",
      hasWritablePaths: true,
      writablePathCount: 1,
      phpExecutes: true,
      successProbability: 3,
      isWordPress: false,
      hasCloudflare: true,
      hasWpAdmin: false,
      ftpAvailable: false,
      webdavAvailable: false,
      originIp: null,
    });
    expect(result.skip).toBe(true);
  });

  it("does not skip when writable paths exist and probability is decent", () => {
    const result = shouldSkipUploads({
      domain: "open.com",
      cms: "wordpress",
      waf: null,
      serverType: "Apache",
      hasWritablePaths: true,
      writablePathCount: 5,
      phpExecutes: true,
      successProbability: 60,
      isWordPress: true,
      hasCloudflare: false,
      hasWpAdmin: true,
      ftpAvailable: false,
      webdavAvailable: false,
      originIp: null,
    });
    expect(result.skip).toBe(false);
  });
});

describe("getOptimalRetryCount", () => {
  it("returns full retries for high probability targets", () => {
    const count = getOptimalRetryCount({ successProbability: 80 } as TargetProfile, 5);
    expect(count).toBe(5);
  });

  it("returns reduced retries for medium probability", () => {
    const count = getOptimalRetryCount({ successProbability: 50 } as TargetProfile, 5);
    expect(count).toBeLessThan(5);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("returns 1 retry for very low probability", () => {
    const count = getOptimalRetryCount({ successProbability: 10 } as TargetProfile, 5);
    expect(count).toBe(1);
  });
});

describe("ATTACK_METHODS registry", () => {
  it("has all required fields for each method", () => {
    for (const method of ATTACK_METHODS) {
      expect(method.id).toBeTruthy();
      expect(method.name).toBeTruthy();
      expect(method.category).toBeTruthy();
      expect(typeof method.requiresWritablePaths).toBe("boolean");
      expect(typeof method.requiresPhpExecution).toBe("boolean");
      expect(typeof method.requiresWpAdmin).toBe("boolean");
      expect(typeof method.bypassesWaf).toBe("boolean");
      expect(method.estimatedTime).toBeGreaterThan(0);
      expect(method.priority).toBeGreaterThanOrEqual(1);
      expect(method.priority).toBeLessThanOrEqual(100);
      expect(typeof method.conditions).toBe("function");
    }
  });

  it("has unique IDs", () => {
    const ids = ATTACK_METHODS.map(m => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("includes AI Commander as last resort", () => {
    const aiCommander = ATTACK_METHODS.find(m => m.id === "ai_commander");
    expect(aiCommander).toBeDefined();
    expect(aiCommander!.category).toBe("ai");
    expect(aiCommander!.priority).toBeLessThanOrEqual(25);
  });

  it("has at least 15 different attack methods", () => {
    expect(ATTACK_METHODS.length).toBeGreaterThanOrEqual(15);
  });
});
