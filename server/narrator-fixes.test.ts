/**
 * Tests for TelegramNarrator fixes:
 * 1. Auto-complete previous running steps when new step is added
 * 2. Step pruning in buildStepsText (only show last N steps)
 * 3. MIN_EDIT_INTERVAL increased to 2000ms
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// We'll test the narrator logic by importing the class and mocking Telegram API
// Since TelegramNarrator uses fetch internally, we mock it

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

  describe("Fix 1: Auto-complete previous running steps", () => {
    it("should auto-complete previous running step when new step is added", async () => {
      await narrator.init();
      
      // Add first step (running)
      const step1 = await narrator.addStep("Step 1");
      
      // Add second step — step1 should be auto-completed
      const step2 = await narrator.addStep("Step 2");
      
      // Access internal steps via any cast
      const steps = (narrator as any).steps;
      
      // Step 1 should be "done" (auto-completed)
      // Note: step indices include the phase step from startPhase if called
      // Since we didn't call startPhase, steps[0] = "Step 1", steps[1] = "Step 2"
      expect(steps[0].status).toBe("done");
      expect(steps[1].status).toBe("running");
    });

    it("should only have at most 1 running step at a time", async () => {
      await narrator.init();
      
      // Add multiple steps rapidly
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
      
      // Simulate what fullVulnScan callback used to do (addStep for each stage)
      await narrator.addStep("🖥️ Fingerprint server");
      await narrator.addStep("💻 CMS detection");
      await narrator.addStep("📂 Writable paths");
      await narrator.addStep("🤖 AI analysis");
      
      const steps = (narrator as any).steps;
      
      // Only the last step should be running
      expect(steps[0].status).toBe("done");
      expect(steps[1].status).toBe("done");
      expect(steps[2].status).toBe("done");
      expect(steps[3].status).toBe("running");
    });
  });

  describe("Fix 2: Step pruning in buildStepsText", () => {
    it("should show summary when steps exceed MAX_VISIBLE_STEPS", async () => {
      await narrator.init();
      
      // Add 12 steps (more than MAX_VISIBLE_STEPS = 8)
      for (let i = 0; i < 12; i++) {
        await narrator.addStep(`Step ${i + 1}`, "done");
      }
      
      // Access buildStepsText via buildCurrentMessage
      const text = (narrator as any).buildCurrentMessage();
      
      // Should contain the summary line for hidden steps
      expect(text).toContain("ขั้นตอนก่อนหน้า");
      // Should contain recent steps
      expect(text).toContain("Step 12");
    });

    it("should not show summary when steps are within limit", async () => {
      await narrator.init();
      
      // Add 5 steps (less than MAX_VISIBLE_STEPS = 8)
      for (let i = 0; i < 5; i++) {
        await narrator.addStep(`Step ${i + 1}`, "done");
      }
      
      const text = (narrator as any).buildCurrentMessage();
      
      // Should NOT contain the summary line
      expect(text).not.toContain("ขั้นตอนก่อนหน้า");
      // Should contain all steps
      expect(text).toContain("Step 1");
      expect(text).toContain("Step 5");
    });

    it("should truncate long analysis text", async () => {
      await narrator.init();
      
      const longAnalysis = "A".repeat(200);
      const step = await narrator.addStep("Test step");
      await narrator.updateStep(step, "done", longAnalysis);
      
      const text = (narrator as any).buildCurrentMessage();
      
      // Analysis should be truncated (150 chars max + "...")
      expect(text).not.toContain("A".repeat(200));
      expect(text).toContain("...");
    });
  });

  describe("Fix 3: MIN_EDIT_INTERVAL", () => {
    it("should have MIN_EDIT_INTERVAL set to 2000ms", () => {
      // Access static property
      expect((TelegramNarrator as any).MIN_EDIT_INTERVAL).toBe(2000);
    });
  });

  describe("Message length safety", () => {
    it("should keep message under 4000 chars even with many steps", async () => {
      await narrator.init();
      
      // Add 30 steps with analysis
      for (let i = 0; i < 30; i++) {
        const step = await narrator.addStep(`Step ${i + 1}: ${("Detail ".repeat(5)).substring(0, 40)}`);
        await narrator.updateStep(step, "done", `Analysis for step ${i + 1}: ${"info ".repeat(10)}`);
      }
      
      const text = (narrator as any).buildCurrentMessage();
      
      // Should be under Telegram limit
      expect(text.length).toBeLessThan(4096);
    });
  });
});
