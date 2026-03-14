import { describe, expect, it } from "vitest";

/**
 * Test the ETA estimation and progress helper functions.
 * We import them indirectly by testing the logic patterns since the functions
 * are defined inside telegram-ai-agent.ts (not exported).
 * We replicate the logic here to verify correctness.
 */

// ═══════════════════════════════════════════════════════
//  Replicated logic from telegram-ai-agent.ts for testing
// ═══════════════════════════════════════════════════════

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

const METHOD_ETA_MS: Record<string, { min: number; max: number; label: string }> = {
  scan_only:           { min: 30_000,  max: 120_000,  label: "~30s - 2 min" },
  redirect_only:       { min: 60_000,  max: 300_000,  label: "~1 - 5 min" },
  full_chain:          { min: 120_000, max: 480_000,  label: "~2 - 8 min" },
  agentic_auto:        { min: 120_000, max: 600_000,  label: "~2 - 10 min" },
  advanced_all:        { min: 60_000,  max: 420_000,  label: "~1 - 7 min" },
  deploy_advanced_all: { min: 120_000, max: 480_000,  label: "~2 - 8 min" },
};

function getMethodEta(method: string): { min: number; max: number; label: string } {
  if (METHOD_ETA_MS[method]) return METHOD_ETA_MS[method];
  if (method.startsWith("deploy_advanced_")) return METHOD_ETA_MS.deploy_advanced_all;
  if (method.startsWith("advanced_")) return METHOD_ETA_MS.advanced_all;
  return { min: 60_000, max: 300_000, label: "~1 - 5 min" };
}

function formatEtaRemaining(startedAt: number, eta: { min: number; max: number }): string {
  const elapsed = Date.now() - startedAt;
  const estimatedTotal = (eta.min + eta.max) / 2;
  const remaining = Math.max(0, estimatedTotal - elapsed);
  if (remaining <= 0) return "เกือบเสร็จแล้ว...";
  return `~${formatDuration(remaining)}`;
}

function buildAnimatedSpinner(elapsed: number): string {
  const frames = ["\u25D0", "\u25D3", "\u25D1", "\u25D2"];
  const idx = Math.floor(elapsed / 500) % frames.length;
  return frames[idx];
}

function buildProgressText(
  domain: string,
  method: string,
  currentStep: number,
  totalSteps: number,
  stepTimings: Array<{ step: string; ms: number; ok: boolean }>,
  status: "running" | "done" | "failed",
  startedAt?: number,
): string {
  const barLen = Math.max(totalSteps, 10);
  const filledLen = Math.round((currentStep / totalSteps) * barLen);
  const bar = "\u2588".repeat(filledLen) + "\u2591".repeat(barLen - filledLen);
  const pct = Math.round((currentStep / totalSteps) * 100);

  const eta = getMethodEta(method);
  const elapsed = startedAt ? Date.now() - startedAt : stepTimings.reduce((sum, t) => sum + t.ms, 0);

  let text = `\u2694\uFE0F Attack: ${domain}\nMethod: ${method}\n`;
  text += `ETA: ${eta.label}\n\n`;
  text += `[${bar}] ${pct}%\n`;
  text += `\u23F1 Elapsed: ${formatDuration(elapsed)}`;

  if (status === "running" && startedAt) {
    const remaining = formatEtaRemaining(startedAt, eta);
    text += ` | Remaining: ${remaining}`;
  }
  text += `\n\n`;

  for (const t of stepTimings) {
    const icon = t.ok ? "\u2705" : "\u274C";
    text += `${icon} ${t.step} (${formatDuration(t.ms)})\n`;
  }

  if (status === "running" && currentStep < totalSteps) {
    const PROGRESS_PHASES = [
      { emoji: "\uD83D\uDD0D", name: "Scanning target" },
      { emoji: "\uD83D\uDCA3", name: "Web Compromise & Injection" },
    ];
    const phase = PROGRESS_PHASES[Math.min(currentStep, PROGRESS_PHASES.length - 1)];
    const spinner = buildAnimatedSpinner(elapsed);
    text += `\n${spinner} ${phase.emoji} ${phase.name}...`;
  } else if (status === "done") {
    const totalMs = startedAt ? Date.now() - startedAt : stepTimings.reduce((sum, t) => sum + t.ms, 0);
    const successCount = stepTimings.filter((t) => t.ok).length;
    text += `\n\u2705 เสร็จสิ้น! ${successCount}/${totalSteps} steps สำเร็จ (${formatDuration(totalMs)})`;
  } else if (status === "failed") {
    const totalMs = startedAt ? Date.now() - startedAt : stepTimings.reduce((sum, t) => sum + t.ms, 0);
    text += `\n\u274C โจมตีล้มเหลว (${formatDuration(totalMs)})`;
  }

  return text;
}

// ═══════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════

describe("formatDuration", () => {
  it("formats milliseconds", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(0)).toBe("0ms");
  });

  it("formats seconds", () => {
    expect(formatDuration(5000)).toBe("5.0s");
    expect(formatDuration(30500)).toBe("30.5s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
    expect(formatDuration(125000)).toBe("2m 5s");
    expect(formatDuration(600000)).toBe("10m 0s");
  });
});

describe("getMethodEta", () => {
  it("returns correct ETA for known methods", () => {
    expect(getMethodEta("scan_only")).toEqual({ min: 30_000, max: 120_000, label: "~30s - 2 min" });
    expect(getMethodEta("agentic_auto")).toEqual({ min: 120_000, max: 600_000, label: "~2 - 10 min" });
    expect(getMethodEta("full_chain")).toEqual({ min: 120_000, max: 480_000, label: "~2 - 8 min" });
    expect(getMethodEta("redirect_only")).toEqual({ min: 60_000, max: 300_000, label: "~1 - 5 min" });
  });

  it("returns correct ETA for advanced_ prefix methods", () => {
    expect(getMethodEta("advanced_seo")).toEqual(METHOD_ETA_MS.advanced_all);
    expect(getMethodEta("advanced_xss")).toEqual(METHOD_ETA_MS.advanced_all);
  });

  it("returns correct ETA for deploy_advanced_ prefix methods", () => {
    expect(getMethodEta("deploy_advanced_seo")).toEqual(METHOD_ETA_MS.deploy_advanced_all);
    expect(getMethodEta("deploy_advanced_redirect")).toEqual(METHOD_ETA_MS.deploy_advanced_all);
  });

  it("returns default ETA for unknown methods", () => {
    const result = getMethodEta("unknown_method");
    expect(result.min).toBe(60_000);
    expect(result.max).toBe(300_000);
    expect(result.label).toBe("~1 - 5 min");
  });
});

describe("formatEtaRemaining", () => {
  it("returns remaining time when attack just started", () => {
    const startedAt = Date.now();
    const eta = { min: 60_000, max: 300_000 };
    const result = formatEtaRemaining(startedAt, eta);
    // Midpoint is 180s, so remaining should be ~3m
    expect(result).toMatch(/^~\d+m \d+s$/);
  });

  it("returns 'เกือบเสร็จแล้ว...' when past estimated time", () => {
    const startedAt = Date.now() - 400_000; // 400s ago
    const eta = { min: 60_000, max: 300_000 }; // midpoint 180s
    const result = formatEtaRemaining(startedAt, eta);
    expect(result).toBe("เกือบเสร็จแล้ว...");
  });

  it("returns reasonable time for mid-progress", () => {
    const eta = { min: 120_000, max: 600_000 }; // midpoint 360s
    const startedAt = Date.now() - 180_000; // 180s ago, half of midpoint
    const result = formatEtaRemaining(startedAt, eta);
    expect(result).toMatch(/^~\d+m \d+s$/);
  });
});

describe("buildAnimatedSpinner", () => {
  it("cycles through spinner frames", () => {
    const frames = ["\u25D0", "\u25D3", "\u25D1", "\u25D2"];
    for (let i = 0; i < 4; i++) {
      expect(buildAnimatedSpinner(i * 500)).toBe(frames[i]);
    }
    // Should cycle back
    expect(buildAnimatedSpinner(2000)).toBe(frames[0]);
  });
});

describe("buildProgressText", () => {
  it("includes domain, method, and ETA in output", () => {
    const text = buildProgressText("example.com", "scan_only", 1, 3, [
      { step: "Scan", ms: 5000, ok: true },
    ], "running");
    expect(text).toContain("example.com");
    expect(text).toContain("scan_only");
    expect(text).toContain("ETA: ~30s - 2 min");
  });

  it("shows progress bar with correct percentage", () => {
    const text = buildProgressText("test.com", "full_chain", 3, 7, [], "running");
    expect(text).toContain("43%"); // 3/7 = 42.8 -> 43
  });

  it("shows elapsed time", () => {
    const text = buildProgressText("test.com", "scan_only", 1, 3, [
      { step: "Step 1", ms: 15000, ok: true },
    ], "running");
    expect(text).toContain("Elapsed:");
  });

  it("shows remaining time when startedAt is provided", () => {
    const startedAt = Date.now() - 10_000; // 10s ago
    const text = buildProgressText("test.com", "scan_only", 1, 3, [], "running", startedAt);
    expect(text).toContain("Remaining:");
  });

  it("shows success count on done status", () => {
    const text = buildProgressText("test.com", "scan_only", 3, 3, [
      { step: "Step 1", ms: 5000, ok: true },
      { step: "Step 2", ms: 3000, ok: true },
      { step: "Step 3", ms: 2000, ok: false },
    ], "done");
    expect(text).toContain("เสร็จสิ้น! 2/3 steps สำเร็จ");
  });

  it("shows failure message on failed status", () => {
    const text = buildProgressText("test.com", "scan_only", 1, 3, [], "failed");
    expect(text).toContain("โจมตีล้มเหลว");
  });

  it("shows step timings with icons", () => {
    const text = buildProgressText("test.com", "scan_only", 2, 3, [
      { step: "Scan complete", ms: 5000, ok: true },
      { step: "Upload failed", ms: 3000, ok: false },
    ], "running");
    expect(text).toContain("\u2705 Scan complete");
    expect(text).toContain("\u274C Upload failed");
  });

  it("shows ETA for agentic_auto method", () => {
    const text = buildProgressText("target.com", "agentic_auto", 2, 5, [], "running");
    expect(text).toContain("ETA: ~2 - 10 min");
  });
});
