/**
 * Tests for TelegramNarrator fixes:
 * 1. Auto-complete previous running steps when new step is added
 * 2. Step pruning in buildStepsText (only show last N steps)
 * 3. MIN_EDIT_INTERVAL increased to 2000ms
 * 4. Heartbeat indicator — auto-update message every 30s
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock global fetch to prevent actual Telegram API calls
const mockFetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({ ok: true, result: { message_id: 12345 } }),
});
vi.stubGlobal("fetch", mockFetch);

import { TelegramNarrator } from "./telegram-narrator";

describe("TelegramNarrator Fixes", () => {
  let narrator: TelegramNarrator;

  beforeEach(() => {
    mockFetch.mockClear();
    narrator = new TelegramNarrator({
      domain: "test.com",
      method: "full_chain",
      botToken: "test-token",
      chatId: 123456,
      messageId: 99999,
    });
  });

  afterEach(() => {
    // Always stop heartbeat to prevent timer leaks between tests
    try { narrator.stopHeartbeat(); } catch {}
  });

  describe("Fix 1: Auto-complete previous running steps", () => {
    it("should auto-complete previous running step when new step is added", async () => {
      await narrator.init();
      const step1 = await narrator.addStep("Step 1");
      const step2 = await narrator.addStep("Step 2");
      const steps = (narrator as any).steps;
      expect(steps[0].status).toBe("done");
      expect(steps[1].status).toBe("running");
    });

    it("should only have at most 1 running step at a time", async () => {
      await narrator.init();
      await narrator.addStep("Step A");
      await narrator.addStep("Step B");
      await narrator.addStep("Step C");
      await narrator.addStep("Step D");
      const steps = (narrator as any).steps;
      const runningSteps = steps.filter((s: any) => s.status === "running");
      expect(runningSteps.length).toBe(1);
      expect(runningSteps[0].label).toBe("Step D");
    });

    it("should auto-complete running steps from scan callbacks", async () => {
      await narrator.init();
      await narrator.addStep("Fingerprint server");
      await narrator.addStep("CMS detection");
      await narrator.addStep("Writable paths");
      await narrator.addStep("AI analysis");
      const steps = (narrator as any).steps;
      expect(steps[0].status).toBe("done");
      expect(steps[1].status).toBe("done");
      expect(steps[2].status).toBe("done");
      expect(steps[3].status).toBe("running");
    });
  });

  describe("Fix 2: Step pruning in buildStepsText", () => {
    it("should show summary when steps exceed MAX_VISIBLE_STEPS", async () => {
      await narrator.init();
      for (let i = 0; i < 12; i++) {
        await narrator.addStep(`Step ${i + 1}`, "done");
      }
      const text = (narrator as any).buildCurrentMessage();
      expect(text).toContain("ขั้นตอนก่อนหน้า");
      expect(text).toContain("Step 12");
    });

    it("should not show summary when steps are within limit", async () => {
      await narrator.init();
      for (let i = 0; i < 5; i++) {
        await narrator.addStep(`Step ${i + 1}`, "done");
      }
      const text = (narrator as any).buildCurrentMessage();
      expect(text).not.toContain("ขั้นตอนก่อนหน้า");
      expect(text).toContain("Step 1");
      expect(text).toContain("Step 5");
    });

    it("should truncate long analysis text", async () => {
      await narrator.init();
      const longAnalysis = "A".repeat(200);
      const step = await narrator.addStep("Test step");
      await narrator.updateStep(step, "done", longAnalysis);
      const text = (narrator as any).buildCurrentMessage();
      expect(text).not.toContain("A".repeat(200));
      expect(text).toContain("...");
    });
  });

  describe("Fix 3: MIN_EDIT_INTERVAL", () => {
    it("should have MIN_EDIT_INTERVAL set to 2000ms", () => {
      expect((TelegramNarrator as any).MIN_EDIT_INTERVAL).toBe(2000);
    });
  });

  describe("Fix 4: Heartbeat indicator", () => {
    it("should start heartbeat timer on init", async () => {
      await narrator.init();
      expect((narrator as any).heartbeatTimer).not.toBeNull();
    });

    it("should have HEARTBEAT_INTERVAL set to 30000ms", () => {
      expect((TelegramNarrator as any).HEARTBEAT_INTERVAL).toBe(30000);
    });

    it("should stop heartbeat on complete", async () => {
      await narrator.init();
      expect((narrator as any).heartbeatTimer).not.toBeNull();
      await narrator.complete(true, "Test complete");
      expect((narrator as any).heartbeatTimer).toBeNull();
      expect((narrator as any).isCompleted).toBe(true);
    });

    it("should stop heartbeat on fail", async () => {
      await narrator.init();
      expect((narrator as any).heartbeatTimer).not.toBeNull();
      await narrator.fail("Test error");
      expect((narrator as any).heartbeatTimer).toBeNull();
      expect((narrator as any).isCompleted).toBe(true);
    });

    it("should include heartbeat footer in message when not completed", async () => {
      await narrator.init();
      await narrator.addStep("Test step");
      const text = (narrator as any).buildCurrentMessage();
      expect(text).toContain("ระบบทำงานอยู่");
      expect(text).toContain("⏱");
    });

    it("should NOT include heartbeat footer after completion", async () => {
      await narrator.init();
      (narrator as any).isCompleted = true;
      const footer = (narrator as any).buildHeartbeatFooter();
      expect(footer).toBe("");
    });

    it("should change pulse icon based on heartbeatCount", async () => {
      await narrator.init();
      (narrator as any).heartbeatCount = 0;
      const footer1 = (narrator as any).buildHeartbeatFooter();
      (narrator as any).heartbeatCount = 1;
      const footer2 = (narrator as any).buildHeartbeatFooter();
      expect(footer1).not.toBe(footer2);
    });

    it("should expose stopHeartbeat as public method", async () => {
      await narrator.init();
      expect((narrator as any).heartbeatTimer).not.toBeNull();
      narrator.stopHeartbeat();
      expect((narrator as any).heartbeatTimer).toBeNull();
    });
  });

  describe("Message length safety", () => {
    it("should keep message under 4000 chars even with many steps", async () => {
      await narrator.init();
      // Directly populate steps array to avoid rate-limit delays
      const steps = (narrator as any).steps;
      for (let i = 0; i < 30; i++) {
        steps.push({
          label: `Step ${i + 1}: ${("Detail ".repeat(5)).substring(0, 40)}`,
          status: "done" as const,
          analysis: `Analysis for step ${i + 1}: ${"info ".repeat(10)}`,
          durationMs: 1500,
        });
      }
      const text = (narrator as any).buildCurrentMessage();
      expect(text.length).toBeLessThan(4096);
    });
  });
});
