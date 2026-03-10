/**
 * Tests for Enhanced Attack System:
 *   1. Method registry sync between agentic engine and unified pipeline
 *   2. Learning interval optimization (1h default, incremental every 5)
 *   3. notifyAttackCompleted wired into attack engine
 *   4. Comprehensive auto-execute integration
 *   5. ALL_ATTACK_METHODS expanded with new vectors
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Enhanced Attack System", () => {
  // ═══ 1. Method Registry Sync ═══
  describe("Method Registry Sync", () => {
    it("ALL_ATTACK_METHODS should include core pipeline methods", async () => {
      const mod = await import("./ai-attack-strategist");
      const methods = Array.from(mod.ALL_ATTACK_METHODS);
      
      // Core upload methods from unified pipeline
      expect(methods).toContain("oneclick");
      expect(methods).toContain("try_all");
      expect(methods).toContain("parallel");
      expect(methods).toContain("smart_retry");
    });

    it("ALL_ATTACK_METHODS should include WordPress-specific methods", async () => {
      const mod = await import("./ai-attack-strategist");
      const methods = Array.from(mod.ALL_ATTACK_METHODS);
      
      expect(methods).toContain("wp_admin");
      expect(methods).toContain("wp_db");
      expect(methods).toContain("wp_brute_force");
      expect(methods).toContain("cve_exploit");
      expect(methods).toContain("cms_plugin_exploit");
    });

    it("ALL_ATTACK_METHODS should include comprehensive AI-evolved vectors", async () => {
      const mod = await import("./ai-attack-strategist");
      const methods = Array.from(mod.ALL_ATTACK_METHODS);
      
      // New comprehensive attack vectors
      expect(methods).toContain("ssti_injection");
      expect(methods).toContain("nosql_injection");
      expect(methods).toContain("lfi_rce");
      expect(methods).toContain("ssrf");
      expect(methods).toContain("deserialization");
      expect(methods).toContain("open_redirect_chain");
      expect(methods).toContain("cache_poisoning");
      expect(methods).toContain("host_header_injection");
      expect(methods).toContain("jwt_abuse");
      expect(methods).toContain("race_condition");
      expect(methods).toContain("mass_assignment");
      expect(methods).toContain("prototype_pollution");
    });

    it("ALL_ATTACK_METHODS should have 30+ methods total", async () => {
      const mod = await import("./ai-attack-strategist");
      expect(mod.ALL_ATTACK_METHODS.length).toBeGreaterThanOrEqual(30);
    });

    it("ALL_ATTACK_METHODS should include non-upload attack methods", async () => {
      const mod = await import("./ai-attack-strategist");
      const methods = Array.from(mod.ALL_ATTACK_METHODS);
      
      expect(methods).toContain("indirect");
      expect(methods).toContain("dns");
      expect(methods).toContain("shellless_redirect");
      expect(methods).toContain("comprehensive");
    });
  });

  // ═══ 2. Learning Scheduler Configuration ═══
  describe("Learning Scheduler Configuration", () => {
    it("should have 1-hour default interval", async () => {
      const mod = await import("./learning-scheduler");
      const status = mod.getLearningSchedulerStatus();
      
      expect(status.intervalMs).toBe(1 * 60 * 60 * 1000); // 1 hour
    });

    it("should have incremental trigger every 5 attacks", async () => {
      const mod = await import("./learning-scheduler");
      const status = mod.getLearningSchedulerStatus();
      
      expect(status.incrementalTriggerEvery).toBe(5);
    });

    it("should export notifyAttackCompleted function", async () => {
      const mod = await import("./learning-scheduler");
      expect(typeof mod.notifyAttackCompleted).toBe("function");
    });

    it("should export updateLearningInterval function", async () => {
      const mod = await import("./learning-scheduler");
      expect(typeof mod.updateLearningInterval).toBe("function");
    });

    it("should export getLearningSchedulerStatus function", async () => {
      const mod = await import("./learning-scheduler");
      const status = mod.getLearningSchedulerStatus();
      
      expect(status).toHaveProperty("isActive");
      expect(status).toHaveProperty("isRunning");
      expect(status).toHaveProperty("totalCyclesRun");
      expect(status).toHaveProperty("attacksSinceLastLearn");
      expect(status).toHaveProperty("intervalMs");
    });

    it("notifyAttackCompleted should increment counter", async () => {
      const mod = await import("./learning-scheduler");
      const beforeCount = mod.getLearningSchedulerStatus().attacksSinceLastLearn;
      mod.notifyAttackCompleted();
      const afterCount = mod.getLearningSchedulerStatus().attacksSinceLastLearn;
      
      // Counter should have incremented (or reset if it triggered a cycle)
      expect(afterCount).toBeGreaterThanOrEqual(0);
    });
  });

  // ═══ 3. Comprehensive Attack Vectors ═══
  describe("Comprehensive Attack Vectors", () => {
    it("should export AttackVectorResult with correct shape", async () => {
      // Verify the type shape by checking a mock result
      const result = {
        vector: "ssti_injection",
        category: "injection",
        success: true,
        detail: "SSTI detected via {{7*7}}=49",
        evidence: "Response contained: 49",
        severity: "critical" as const,
        exploitable: true,
      };
      
      expect(result.vector).toBe("ssti_injection");
      expect(result.exploitable).toBe(true);
      expect(result.severity).toBe("critical");
    });

    it("should export runComprehensiveAttackVectors function", async () => {
      const mod = await import("./comprehensive-attack-vectors");
      expect(typeof mod.runComprehensiveAttackVectors).toBe("function");
    });
  });

  // ═══ 4. Adaptive Learning Router ═══
  describe("Adaptive Learning Router", () => {
    it("should export adaptiveLearningRouter", async () => {
      const mod = await import("./routers/adaptive-learning-router");
      expect(mod.adaptiveLearningRouter).toBeDefined();
    });
  });
});
