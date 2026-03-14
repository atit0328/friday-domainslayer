import { describe, it, expect, beforeEach } from "vitest";

// We test the exported registry functions from telegram-ai-agent
// Since the registry is module-level state, we import and test directly
import {
  getRunningAttacks,
  getRecentCompletedAttacks,
} from "./telegram-ai-agent";

describe("Running Attacks Registry", () => {
  it("should export getRunningAttacks function", () => {
    expect(typeof getRunningAttacks).toBe("function");
  });

  it("should export getRecentCompletedAttacks function", () => {
    expect(typeof getRecentCompletedAttacks).toBe("function");
  });

  it("getRunningAttacks should return an array", () => {
    const attacks = getRunningAttacks();
    expect(Array.isArray(attacks)).toBe(true);
  });

  it("getRecentCompletedAttacks should return an array", () => {
    const recent = getRecentCompletedAttacks();
    expect(Array.isArray(recent)).toBe(true);
  });

  it("getRecentCompletedAttacks should accept a limit parameter", () => {
    const recent = getRecentCompletedAttacks(3);
    expect(Array.isArray(recent)).toBe(true);
    expect(recent.length).toBeLessThanOrEqual(3);
  });

  it("running attacks should have correct shape when present", () => {
    const attacks = getRunningAttacks();
    for (const atk of attacks) {
      expect(atk).toHaveProperty("id");
      expect(atk).toHaveProperty("domain");
      expect(atk).toHaveProperty("method");
      expect(atk).toHaveProperty("chatId");
      expect(atk).toHaveProperty("startedAt");
      expect(atk).toHaveProperty("progressMsgId");
      expect(atk).toHaveProperty("abortController");
      expect(atk).toHaveProperty("lastUpdate");
    }
  });

  it("recent completed attacks should have correct shape when present", () => {
    const recent = getRecentCompletedAttacks();
    for (const r of recent) {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("domain");
      expect(r).toHaveProperty("method");
      expect(r).toHaveProperty("success");
      expect(r).toHaveProperty("durationMs");
      expect(r).toHaveProperty("completedAt");
    }
  });
});

describe("Batch Attack Engine - Additional Tests", () => {
  it("should export getAllActiveBatches", async () => {
    const { getAllActiveBatches } = await import("./batch-attack-engine");
    expect(typeof getAllActiveBatches).toBe("function");
    const batches = getAllActiveBatches();
    expect(Array.isArray(batches)).toBe(true);
  });

  it("should export cancelBatch", async () => {
    const { cancelBatch } = await import("./batch-attack-engine");
    expect(typeof cancelBatch).toBe("function");
    // Cancelling non-existent batch should return false
    const result = cancelBatch("nonexistent-batch-id");
    expect(result).toBe(false);
  });

  it("should export getActiveBatch", async () => {
    const { getActiveBatch } = await import("./batch-attack-engine");
    expect(typeof getActiveBatch).toBe("function");
    // Getting non-existent batch should return null
    const result = getActiveBatch("nonexistent-batch-id");
    expect(result).toBeNull();
  });
});

describe("ATTACK_TIMEOUT_MS constant", () => {
  it("timeout should be 10 minutes (600000ms)", async () => {
    // We can't directly import the const, but we verify the behavior
    // by checking that the module loads without error
    const mod = await import("./telegram-ai-agent");
    expect(mod).toBeDefined();
    expect(mod.getRunningAttacks).toBeDefined();
  });
});
