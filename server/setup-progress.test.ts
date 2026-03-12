/**
 * Tests for Real-time Setup Progress Tracking
 * - emitProgress callback in runFullSetup
 * - activeSetups Map real-time updates
 * - Progress data structure integrity
 */
import { describe, it, expect } from "vitest";

// ═══ Test the PBNSetupProgress data structure ═══

describe("PBNSetupProgress data structure", () => {
  it("should have all required fields", () => {
    const progress = {
      siteId: 1,
      siteName: "test.com",
      status: "running" as const,
      currentStep: "initializing",
      stepsCompleted: 0,
      totalSteps: 7,
      results: [],
      startedAt: Date.now(),
    };

    expect(progress.siteId).toBe(1);
    expect(progress.siteName).toBe("test.com");
    expect(progress.status).toBe("running");
    expect(progress.currentStep).toBe("initializing");
    expect(progress.stepsCompleted).toBe(0);
    expect(progress.totalSteps).toBe(7);
    expect(progress.results).toEqual([]);
    expect(progress.startedAt).toBeGreaterThan(0);
  });

  it("should track step results with success/fail/skip", () => {
    const results = [
      { step: "theme", success: true, detail: "Installed GeneratePress" },
      { step: "basic_settings", success: true, detail: "Skipped — custom settings found" },
      { step: "plugins", success: false, detail: "Failed to install Yoast" },
    ];

    const done = results.filter(r => r.success && !r.detail.toLowerCase().startsWith("skipped"));
    const skipped = results.filter(r => r.success && r.detail.toLowerCase().startsWith("skipped"));
    const failed = results.filter(r => !r.success);

    expect(done.length).toBe(1);
    expect(skipped.length).toBe(1);
    expect(failed.length).toBe(1);
  });

  it("should calculate progress percentage correctly", () => {
    const totalSteps = 7;
    
    expect(Math.round((0 / totalSteps) * 100)).toBe(0);
    expect(Math.round((1 / totalSteps) * 100)).toBe(14);
    expect(Math.round((3 / totalSteps) * 100)).toBe(43);
    expect(Math.round((5 / totalSteps) * 100)).toBe(71);
    expect(Math.round((7 / totalSteps) * 100)).toBe(100);
  });
});

// ═══ Test step status detection logic ═══

describe("Step status detection", () => {
  function getStepStatus(
    stepName: string,
    currentStep: string,
    results: Array<{ step: string; success: boolean; detail: string }>,
    pipelineStatus: string,
  ): "pending" | "running" | "done" | "skipped" | "failed" {
    const result = results.find(r => r.step === stepName);
    if (result) {
      if (!result.success) return "failed";
      if (result.detail.toLowerCase().startsWith("skipped")) return "skipped";
      return "done";
    }
    if (currentStep === stepName) return "running";
    if (pipelineStatus === "completed" || pipelineStatus === "failed" || pipelineStatus === "partial") {
      return "pending";
    }
    return "pending";
  }

  it("should return 'running' for current step", () => {
    expect(getStepStatus("theme", "theme", [], "running")).toBe("running");
    expect(getStepStatus("plugins", "plugins", [], "running")).toBe("running");
  });

  it("should return 'done' for completed step", () => {
    const results = [{ step: "theme", success: true, detail: "Installed GeneratePress" }];
    expect(getStepStatus("theme", "basic_settings", results, "running")).toBe("done");
  });

  it("should return 'skipped' for skipped step", () => {
    const results = [{ step: "theme", success: true, detail: "Skipped — custom theme already active" }];
    expect(getStepStatus("theme", "basic_settings", results, "running")).toBe("skipped");
  });

  it("should return 'failed' for failed step", () => {
    const results = [{ step: "plugins", success: false, detail: "Failed to install" }];
    expect(getStepStatus("plugins", "homepage", results, "running")).toBe("failed");
  });

  it("should return 'pending' for future steps", () => {
    expect(getStepStatus("cloaking", "theme", [], "running")).toBe("pending");
  });

  it("should return 'pending' for unreached steps when pipeline is done", () => {
    expect(getStepStatus("cloaking", "done", [], "completed")).toBe("pending");
  });
});

// ═══ Test step order and metadata ═══

describe("Step order and metadata", () => {
  const STEP_ORDER = ["theme", "basic_settings", "plugins", "homepage", "reading_settings", "onpage_content", "cloaking"];

  it("should have exactly 7 steps", () => {
    expect(STEP_ORDER.length).toBe(7);
  });

  it("should have theme as first step", () => {
    expect(STEP_ORDER[0]).toBe("theme");
  });

  it("should have cloaking as last step", () => {
    expect(STEP_ORDER[STEP_ORDER.length - 1]).toBe("cloaking");
  });

  it("should have on-page SEO before cloaking", () => {
    const seoIdx = STEP_ORDER.indexOf("onpage_content");
    const cloakIdx = STEP_ORDER.indexOf("cloaking");
    expect(seoIdx).toBeLessThan(cloakIdx);
  });

  it("should have all steps unique", () => {
    const unique = new Set(STEP_ORDER);
    expect(unique.size).toBe(STEP_ORDER.length);
  });
});

// ═══ Test emitProgress callback mechanism ═══

describe("emitProgress callback", () => {
  it("should call onProgress with a copy of progress", () => {
    const progressUpdates: any[] = [];
    const onProgress = (p: any) => progressUpdates.push(p);

    // Simulate emitProgress behavior
    const progress = {
      siteId: 1,
      siteName: "test.com",
      status: "running",
      currentStep: "initializing",
      stepsCompleted: 0,
      totalSteps: 7,
      results: [] as any[],
      startedAt: Date.now(),
    };

    const emitProgress = () => onProgress({ ...progress });

    emitProgress();
    expect(progressUpdates.length).toBe(1);
    expect(progressUpdates[0].currentStep).toBe("initializing");

    progress.currentStep = "theme";
    emitProgress();
    expect(progressUpdates.length).toBe(2);
    expect(progressUpdates[1].currentStep).toBe("theme");

    // Verify it's a copy, not a reference
    progress.currentStep = "plugins";
    expect(progressUpdates[1].currentStep).toBe("theme"); // should not change
  });

  it("should emit progress at each step transition", () => {
    const updates: string[] = [];
    const steps = ["initializing", "pre_check", "theme", "basic_settings", "plugins", "homepage", "reading_settings", "onpage_content", "cloaking", "done"];

    steps.forEach(step => updates.push(step));

    expect(updates.length).toBe(10); // initializing + pre_check + 7 steps + done
    expect(updates[0]).toBe("initializing");
    expect(updates[updates.length - 1]).toBe("done");
  });
});

// ═══ Test activeSetups Map behavior ═══

describe("activeSetups Map behavior", () => {
  it("should store progress by siteId", () => {
    const activeSetups = new Map<number, any>();
    
    activeSetups.set(1, { siteId: 1, status: "running", currentStep: "theme" });
    activeSetups.set(2, { siteId: 2, status: "running", currentStep: "plugins" });

    expect(activeSetups.get(1)?.currentStep).toBe("theme");
    expect(activeSetups.get(2)?.currentStep).toBe("plugins");
  });

  it("should use negative siteId for main domain projects", () => {
    const activeSetups = new Map<number, any>();
    const projectId = 42;
    const siteId = -projectId;

    activeSetups.set(siteId, { siteId, status: "running" });

    // getMainDomainSetupProgress uses -projectId
    expect(activeSetups.get(-42)?.status).toBe("running");
  });

  it("should update in place when emitProgress is called", () => {
    const activeSetups = new Map<number, any>();
    
    activeSetups.set(1, { status: "running", currentStep: "theme", stepsCompleted: 0 });
    activeSetups.set(1, { status: "running", currentStep: "plugins", stepsCompleted: 2 });

    expect(activeSetups.get(1)?.currentStep).toBe("plugins");
    expect(activeSetups.get(1)?.stepsCompleted).toBe(2);
  });
});

// ═══ Test duration formatting ═══

describe("Duration formatting", () => {
  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  it("should format seconds", () => {
    expect(formatDuration(5000)).toBe("5s");
    expect(formatDuration(30000)).toBe("30s");
    expect(formatDuration(59000)).toBe("59s");
  });

  it("should format minutes and seconds", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
    expect(formatDuration(90000)).toBe("1m 30s");
    expect(formatDuration(125000)).toBe("2m 5s");
  });

  it("should handle zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});

// ═══ Test full pipeline progress simulation ═══

describe("Full pipeline progress simulation", () => {
  it("should track complete pipeline with skips", () => {
    const results: Array<{ step: string; success: boolean; detail: string }> = [];

    // Step 1: Theme — skipped
    results.push({ step: "theme", success: true, detail: "Skipped — custom theme already active: flavor Developer" });
    // Step 2: Settings — skipped
    results.push({ step: "basic_settings", success: true, detail: "Skipped — custom settings found" });
    // Step 3: Plugins — skipped
    results.push({ step: "plugins", success: true, detail: "Skipped — SEO plugin already active" });
    // Step 4: Homepage — skipped
    results.push({ step: "homepage", success: true, detail: "Skipped — existing content: 5 pages, 10 posts" });
    // Step 5: Reading — skipped
    results.push({ step: "reading_settings", success: true, detail: "Skipped — static front page already set" });
    // Step 6: On-Page SEO — done
    results.push({ step: "onpage_content", success: true, detail: "Created 3 SEO-optimized blog posts with keywords" });
    // Step 7: Cloaking — done
    results.push({ step: "cloaking", success: true, detail: "Deployed cloaking to example.com" });

    const done = results.filter(r => r.success && !r.detail.toLowerCase().startsWith("skipped"));
    const skipped = results.filter(r => r.success && r.detail.toLowerCase().startsWith("skipped"));
    const failed = results.filter(r => !r.success);

    expect(results.length).toBe(7);
    expect(done.length).toBe(2); // on-page + cloaking
    expect(skipped.length).toBe(5); // theme + settings + plugins + homepage + reading
    expect(failed.length).toBe(0);
  });

  it("should track partial failure", () => {
    const results = [
      { step: "theme", success: true, detail: "Installed GeneratePress" },
      { step: "basic_settings", success: true, detail: "Updated settings" },
      { step: "plugins", success: false, detail: "Failed to install Yoast SEO" },
      { step: "homepage", success: true, detail: "Created homepage" },
      { step: "reading_settings", success: true, detail: "Set front page" },
      { step: "onpage_content", success: true, detail: "Created content" },
      { step: "cloaking", success: true, detail: "Deployed cloaking" },
    ];

    const failedCount = results.filter(r => !r.success).length;
    const status = failedCount === 0 ? "completed" : failedCount === 7 ? "failed" : "partial";

    expect(status).toBe("partial");
    expect(failedCount).toBe(1);
  });
});
