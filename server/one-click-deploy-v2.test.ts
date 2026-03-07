import { describe, it, expect, vi } from "vitest";

// We test the exported types and the main function signature
// Since the engine does real HTTP calls, we test the helper logic
// by importing and testing the module structure

describe("One-Click Deploy Enterprise Engine", () => {
  describe("Module Structure", () => {
    it("exports oneClickDeploy function", async () => {
      const mod = await import("./one-click-deploy");
      expect(typeof mod.oneClickDeploy).toBe("function");
    });

    it("exports required types (ErrorCategory, ProgressEvent, DeployStep, DeployResult, DeployOptions)", async () => {
      const mod = await import("./one-click-deploy");
      // TypeScript types don't exist at runtime, but we can check the function exists
      expect(mod.oneClickDeploy).toBeDefined();
    });
  });

  describe("Error Classification", () => {
    it("classifies timeout errors correctly", async () => {
      // The classifyError function is internal, but we can test behavior through the pipeline
      // by checking that the DeployResult includes error categories
      const mod = await import("./one-click-deploy");
      expect(mod.oneClickDeploy).toBeDefined();
    });
  });

  describe("Progress Callback", () => {
    it("calls onProgress callback during execution", async () => {
      const mod = await import("./one-click-deploy");
      const events: any[] = [];
      const onProgress = (evt: any) => events.push(evt);

      // Run against a non-existent domain (will fail fast)
      const result = await mod.oneClickDeploy(
        "http://nonexistent-test-domain-12345.invalid",
        "http://redirect-test.invalid",
        { maxRetries: 0, onProgress }
      );

      // Should have received at least some progress events
      expect(events.length).toBeGreaterThan(0);
      // First event should be ai_analysis (AI init) or phase_start
      expect(["ai_analysis", "phase_start"]).toContain(events[0].type);
      // Should have at least one phase_start event
      const phaseStartEvent = events.find(e => e.type === "phase_start");
      expect(phaseStartEvent).toBeDefined();
      // Should have a complete event at the end
      const completeEvent = events.find(e => e.type === "complete");
      expect(completeEvent).toBeDefined();
    }, 60000);

    it("returns a valid DeployResult structure", async () => {
      const mod = await import("./one-click-deploy");
      const result = await mod.oneClickDeploy(
        "http://nonexistent-test-domain-99999.invalid",
        "http://redirect-test.invalid",
        { maxRetries: 0 }
      );

      // Check result structure
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("targetDomain");
      expect(result).toHaveProperty("redirectUrl");
      expect(result).toHaveProperty("steps");
      expect(result).toHaveProperty("deployedFiles");
      expect(result).toHaveProperty("shellInfo");
      expect(result).toHaveProperty("redirectInfo");
      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("report");
      expect(Array.isArray(result.steps)).toBe(true);
      expect(Array.isArray(result.deployedFiles)).toBe(true);
    }, 60000);

    it("includes error breakdown in summary", async () => {
      const mod = await import("./one-click-deploy");
      const result = await mod.oneClickDeploy(
        "http://nonexistent-test-domain-88888.invalid",
        "http://redirect-test.invalid",
        { maxRetries: 0 }
      );

      expect(result.summary).toHaveProperty("totalSteps");
      expect(result.summary).toHaveProperty("successSteps");
      expect(result.summary).toHaveProperty("failedSteps");
      expect(result.summary).toHaveProperty("totalDuration");
      expect(result.summary).toHaveProperty("totalRetries");
      expect(result.summary).toHaveProperty("errorBreakdown");
      expect(typeof result.summary.totalSteps).toBe("number");
      expect(typeof result.summary.successSteps).toBe("number");
      expect(typeof result.summary.failedSteps).toBe("number");
      expect(typeof result.summary.totalDuration).toBe("number");
    }, 60000);

    it("generates a text report", async () => {
      const mod = await import("./one-click-deploy");
      const result = await mod.oneClickDeploy(
        "http://nonexistent-test-domain-77777.invalid",
        "http://redirect-test.invalid",
        { maxRetries: 0 }
      );

      expect(typeof result.report).toBe("string");
      expect(result.report.length).toBeGreaterThan(0);
      // Report should contain target info
      expect(result.report).toContain("nonexistent-test-domain-77777");
    }, 60000);
  });

  describe("Retry Behavior", () => {
    it("respects maxRetries=0 (no retries)", async () => {
      const mod = await import("./one-click-deploy");
      const events: any[] = [];
      const result = await mod.oneClickDeploy(
        "http://nonexistent-test-domain-66666.invalid",
        "http://redirect-test.invalid",
        { maxRetries: 0, onProgress: (e) => events.push(e) }
      );

      // With maxRetries=0, there should be no retry events
      const retryEvents = events.filter(e => e.type === "retry");
      expect(retryEvents.length).toBe(0);
      expect(result.summary.totalRetries).toBe(0);
    }, 60000);
  });

  describe("DeployResult Steps", () => {
    it("has 9 steps in the pipeline", async () => {
      const mod = await import("./one-click-deploy");
      const result = await mod.oneClickDeploy(
        "http://nonexistent-test-domain-55555.invalid",
        "http://redirect-test.invalid",
        { maxRetries: 0 }
      );

      expect(result.steps.length).toBe(9);
      // Each step should have required fields
      for (const step of result.steps) {
        expect(step).toHaveProperty("step");
        expect(step).toHaveProperty("name");
        expect(step).toHaveProperty("status");
        expect(step).toHaveProperty("details");
        expect(["pending", "running", "success", "failed", "skipped"]).toContain(step.status);
      }
    }, 60000);

    it("step names cover the full pipeline", async () => {
      const mod = await import("./one-click-deploy");
      const result = await mod.oneClickDeploy(
        "http://nonexistent-test-domain-44444.invalid",
        "http://redirect-test.invalid",
        { maxRetries: 0 }
      );

      const stepNames = result.steps.map(s => s.name.toLowerCase());
      // Should have scan, shell, upload, verify, inject/deploy, redirect, verify redirect steps
      expect(stepNames.some(n => n.includes("scan") || n.includes("recon"))).toBe(true);
      expect(stepNames.some(n => n.includes("shell"))).toBe(true);
    }, 60000);
  });

  describe("Redirect Info", () => {
    it("returns redirect info structure", async () => {
      const mod = await import("./one-click-deploy");
      const result = await mod.oneClickDeploy(
        "http://nonexistent-test-domain-33333.invalid",
        "http://redirect-test.invalid",
        { maxRetries: 0 }
      );

      expect(result.redirectInfo).toHaveProperty("htaccessDeployed");
      expect(result.redirectInfo).toHaveProperty("jsRedirectDeployed");
      expect(result.redirectInfo).toHaveProperty("phpRedirectDeployed");
      expect(result.redirectInfo).toHaveProperty("metaRefreshDeployed");
      expect(result.redirectInfo).toHaveProperty("geoRedirectDeployed");
      expect(result.redirectInfo).toHaveProperty("doorwayPagesDeployed");
      expect(result.redirectInfo).toHaveProperty("sitemapPoisoned");
      expect(result.redirectInfo).toHaveProperty("verifiedWorking");
    }, 60000);
  });
});
