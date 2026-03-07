import { describe, it, expect } from "vitest";

/**
 * Tests for the critical bug fix: DeployResult.success field
 * 
 * Bug: DeployResult interface was missing `success` field, causing:
 * - unified-attack-pipeline.ts to always treat oneClickDeploy as failed
 * - oneclick-sse.ts to always trigger alt upload fallback
 * - Deploy status always reported as "failed" even when files were deployed
 */

describe("DeployResult success field fix", () => {
  it("DeployResult has success field in interface", async () => {
    const mod = await import("./one-click-deploy");
    // Run against non-existent domain to get a result structure
    const result = await mod.oneClickDeploy(
      "http://nonexistent-test-deploy-success-1.invalid",
      "http://redirect-test.invalid",
      { maxRetries: 0 }
    );

    // The critical fix: result MUST have a `success` property (boolean)
    expect(result).toHaveProperty("success");
    expect(typeof result.success).toBe("boolean");
  }, 60000);

  it("success is false when deploy fails (non-existent domain)", async () => {
    const mod = await import("./one-click-deploy");
    const result = await mod.oneClickDeploy(
      "http://nonexistent-test-deploy-success-2.invalid",
      "http://redirect-test.invalid",
      { maxRetries: 0 }
    );

    // Against a non-existent domain, success should be false
    expect(result.success).toBe(false);
    // Summary should also reflect failure
    expect(result.summary.totalFilesDeployed).toBe(0);
    expect(result.summary.redirectActive).toBe(false);
  }, 60000);

  it("success field is consistent with summary.redirectActive and totalFilesDeployed", async () => {
    const mod = await import("./one-click-deploy");
    const result = await mod.oneClickDeploy(
      "http://nonexistent-test-deploy-success-3.invalid",
      "http://redirect-test.invalid",
      { maxRetries: 0 }
    );

    // success should be true if redirectActive OR totalFilesDeployed > 0
    const expectedSuccess = result.summary.redirectActive || result.summary.totalFilesDeployed > 0;
    expect(result.success).toBe(expectedSuccess);
  }, 60000);

  it("onProgress complete event uses result.success for status", async () => {
    const mod = await import("./one-click-deploy");
    const events: any[] = [];
    const result = await mod.oneClickDeploy(
      "http://nonexistent-test-deploy-success-4.invalid",
      "http://redirect-test.invalid",
      { maxRetries: 0, onProgress: (e: any) => events.push(e) }
    );

    // Find the complete event
    const completeEvent = events.find(e => e.type === "complete");
    expect(completeEvent).toBeDefined();

    // Complete event status should match result.success
    if (result.success) {
      expect(completeEvent.status).toBe("success");
    } else {
      expect(completeEvent.status).toBe("failed");
    }
  }, 60000);
});

describe("DeployResult structure completeness", () => {
  it("has all required top-level fields", async () => {
    const mod = await import("./one-click-deploy");
    const result = await mod.oneClickDeploy(
      "http://nonexistent-test-deploy-structure.invalid",
      "http://redirect-test.invalid",
      { maxRetries: 0 }
    );

    // All required fields must exist
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("timestamp");
    expect(result).toHaveProperty("targetDomain");
    expect(result).toHaveProperty("redirectUrl");
    expect(result).toHaveProperty("steps");
    expect(result).toHaveProperty("deployedFiles");
    expect(result).toHaveProperty("shellInfo");
    expect(result).toHaveProperty("directUploadInfo");
    expect(result).toHaveProperty("redirectInfo");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("report");

    // Type checks
    expect(typeof result.id).toBe("string");
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.timestamp).toBe("string");
    expect(typeof result.targetDomain).toBe("string");
    expect(typeof result.redirectUrl).toBe("string");
    expect(Array.isArray(result.steps)).toBe(true);
    expect(Array.isArray(result.deployedFiles)).toBe(true);
    expect(typeof result.report).toBe("string");
  }, 60000);
});
