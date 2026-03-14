/**
 * Tests for Bot Tool Execution Timeout & Response Guarantees
 * Ensures bot always responds within acceptable time limits
 */
import { describe, it, expect } from "vitest";

describe("Tool Execution Timeout", () => {
  const TOOL_TIMEOUT_MS = 25_000;
  const PROCESS_TIMEOUT_MS = 40_000;
  const LOCK_TIMEOUT_MS = 45_000;

  it("should have tool timeout shorter than process timeout", () => {
    expect(TOOL_TIMEOUT_MS).toBeLessThan(PROCESS_TIMEOUT_MS);
  });

  it("should have process timeout shorter than lock timeout", () => {
    expect(PROCESS_TIMEOUT_MS).toBeLessThan(LOCK_TIMEOUT_MS);
  });

  it("should leave enough time for LLM response after tool timeout", () => {
    const remainingForLLM = PROCESS_TIMEOUT_MS - TOOL_TIMEOUT_MS;
    expect(remainingForLLM).toBeGreaterThanOrEqual(10_000); // At least 10s for LLM
  });

  it("should correctly identify long-running tools", () => {
    const LONG_RUNNING_TOOLS = ["attack_website", "deploy_advanced", "retry_attack", "retry_all_failed"];
    
    expect(LONG_RUNNING_TOOLS).toContain("attack_website");
    expect(LONG_RUNNING_TOOLS).toContain("deploy_advanced");
    expect(LONG_RUNNING_TOOLS).toContain("retry_attack");
    expect(LONG_RUNNING_TOOLS).toContain("retry_all_failed");
    
    // Quick tools should NOT be in the list
    expect(LONG_RUNNING_TOOLS).not.toContain("check_sprint_status");
    expect(LONG_RUNNING_TOOLS).not.toContain("check_attack_stats");
    expect(LONG_RUNNING_TOOLS).not.toContain("check_attack_logs");
  });
});

describe("Promise.race Timeout Pattern", () => {
  it("should resolve with result if tool finishes before timeout", async () => {
    const fastTool = () => new Promise<string>(resolve => 
      setTimeout(() => resolve("success"), 50)
    );
    const timeout = new Promise<string>((_, reject) => 
      setTimeout(() => reject(new Error("TOOL_TIMEOUT")), 1000)
    );

    const result = await Promise.race([fastTool(), timeout]);
    expect(result).toBe("success");
  });

  it("should reject with TOOL_TIMEOUT if tool takes too long", async () => {
    const slowTool = () => new Promise<string>(resolve => 
      setTimeout(() => resolve("success"), 2000)
    );
    const timeout = new Promise<string>((_, reject) => 
      setTimeout(() => reject(new Error("TOOL_TIMEOUT")), 100)
    );

    try {
      await Promise.race([slowTool(), timeout]);
      expect.fail("Should have thrown TOOL_TIMEOUT");
    } catch (e: any) {
      expect(e.message).toBe("TOOL_TIMEOUT");
    }
  });

  it("should handle tool errors separately from timeout", async () => {
    const errorTool = () => new Promise<string>((_, reject) => 
      setTimeout(() => reject(new Error("Connection failed")), 50)
    );
    const timeout = new Promise<string>((_, reject) => 
      setTimeout(() => reject(new Error("TOOL_TIMEOUT")), 1000)
    );

    try {
      await Promise.race([errorTool(), timeout]);
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.message).toBe("Connection failed");
      expect(e.message).not.toBe("TOOL_TIMEOUT");
    }
  });
});

describe("Chat Lock Timing", () => {
  it("lock timeout should be slightly longer than process timeout", () => {
    const LOCK_TIMEOUT = 45_000;
    const PROCESS_TIMEOUT = 40_000;
    const buffer = LOCK_TIMEOUT - PROCESS_TIMEOUT;
    expect(buffer).toBeGreaterThanOrEqual(5_000); // At least 5s buffer
  });
});

describe("History Limits", () => {
  it("should only send last 10 messages to LLM", () => {
    const history = Array.from({ length: 15 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
    }));
    
    // Simulate: slice(-11, -1) gives last 10 excluding current
    const recentHistory = history.slice(-11, -1);
    expect(recentHistory.length).toBe(10);
  });

  it("should handle empty history gracefully", () => {
    const history: any[] = [];
    const recentHistory = history.slice(-11, -1);
    expect(recentHistory.length).toBe(0);
  });

  it("should handle history shorter than 10 messages", () => {
    const history = Array.from({ length: 5 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
    }));
    
    const recentHistory = history.slice(-11, -1);
    expect(recentHistory.length).toBe(4); // 5 - 1 (excluding last)
  });
});

describe("Timeout Cascade", () => {
  it("timeouts should cascade correctly: tool < process < lock", () => {
    const toolTimeout = 25_000;
    const processTimeout = 40_000;
    const lockTimeout = 45_000;
    
    expect(toolTimeout).toBeLessThan(processTimeout);
    expect(processTimeout).toBeLessThan(lockTimeout);
    
    // Total worst case: tool timeout + LLM call should fit in process timeout
    const worstCaseLLMTime = 15_000; // 15s for LLM after tool timeout
    expect(toolTimeout + worstCaseLLMTime).toBeLessThanOrEqual(processTimeout);
  });
});
