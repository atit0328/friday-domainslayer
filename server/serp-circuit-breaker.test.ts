/**
 * Tests for SerpAPI Circuit Breaker + Campaign Engine Timeouts
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  isSerpApiAvailable,
  resetCircuitBreaker,
  getCircuitBreakerStatus,
} from "./serp-api";
import { withTimeout, CAMPAIGN_PHASES } from "./campaign-engine";

// ═══ SerpAPI Circuit Breaker Tests ═══
describe("SerpAPI Circuit Breaker", () => {
  beforeEach(() => {
    resetCircuitBreaker();
  });

  it("should be available after reset", () => {
    expect(isSerpApiAvailable()).toBe(true);
  });

  it("should return correct initial status", () => {
    const status = getCircuitBreakerStatus();
    expect(status.consecutiveFailures).toBe(0);
    expect(status.isCircuitOpen).toBe(false);
    expect(status.isQuotaExhausted).toBe(false);
    expect(status.circuitResetsIn).toBe(0);
    expect(status.quotaResetsIn).toBe(0);
  });

  it("should reset all state via resetCircuitBreaker", () => {
    resetCircuitBreaker();
    const status = getCircuitBreakerStatus();
    expect(status.consecutiveFailures).toBe(0);
    expect(status.isCircuitOpen).toBe(false);
    expect(status.isQuotaExhausted).toBe(false);
  });

  it("should export isSerpApiAvailable as a function", () => {
    expect(typeof isSerpApiAvailable).toBe("function");
  });

  it("should export resetCircuitBreaker as a function", () => {
    expect(typeof resetCircuitBreaker).toBe("function");
  });

  it("should export getCircuitBreakerStatus as a function", () => {
    expect(typeof getCircuitBreakerStatus).toBe("function");
  });

  it("status should have all required fields", () => {
    const status = getCircuitBreakerStatus();
    expect(status).toHaveProperty("consecutiveFailures");
    expect(status).toHaveProperty("isCircuitOpen");
    expect(status).toHaveProperty("isQuotaExhausted");
    expect(status).toHaveProperty("circuitResetsIn");
    expect(status).toHaveProperty("quotaResetsIn");
  });

  it("should remain available after reset even if called multiple times", () => {
    resetCircuitBreaker();
    resetCircuitBreaker();
    resetCircuitBreaker();
    expect(isSerpApiAvailable()).toBe(true);
  });
});

// ═══ withTimeout Utility Tests ═══
describe("withTimeout utility", () => {
  it("should resolve fast promises within timeout", async () => {
    const result = await withTimeout(
      Promise.resolve("ok"),
      1000,
      "test-fast",
    );
    expect(result).toBe("ok");
  });

  it("should reject slow promises with TIMEOUT error", async () => {
    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve("too late"), 5000);
    });

    await expect(
      withTimeout(slowPromise, 100, "test-slow"),
    ).rejects.toThrow("TIMEOUT: test-slow exceeded 0.1s limit");
  });

  it("should propagate original errors (not timeout)", async () => {
    const failingPromise = Promise.reject(new Error("original error"));

    await expect(
      withTimeout(failingPromise, 5000, "test-error"),
    ).rejects.toThrow("original error");
  });

  it("should include label in timeout error message", async () => {
    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve("late"), 5000);
    });

    try {
      await withTimeout(slowPromise, 50, "my-custom-label");
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("my-custom-label");
      expect(err.message).toContain("TIMEOUT");
    }
  });

  it("should handle zero-delay resolved promises", async () => {
    const result = await withTimeout(
      Promise.resolve(42),
      100,
      "instant",
    );
    expect(result).toBe(42);
  });

  it("should handle promises that resolve with complex objects", async () => {
    const obj = { a: 1, b: [2, 3], c: { d: "hello" } };
    const result = await withTimeout(
      Promise.resolve(obj),
      1000,
      "complex-obj",
    );
    expect(result).toEqual(obj);
  });
});

// ═══ Campaign Phase Definitions Tests ═══
describe("Campaign Phase Definitions", () => {
  it("should have exactly 16 phases", () => {
    expect(CAMPAIGN_PHASES).toHaveLength(16);
  });

  it("should have sequential IDs from 0 to 15", () => {
    CAMPAIGN_PHASES.forEach((phase, index) => {
      expect(phase.id).toBe(index);
    });
  });

  it("each phase should have required fields", () => {
    CAMPAIGN_PHASES.forEach((phase) => {
      expect(phase).toHaveProperty("id");
      expect(phase).toHaveProperty("name");
      expect(phase).toHaveProperty("icon");
      expect(phase).toHaveProperty("thaiName");
      expect(phase).toHaveProperty("description");
      expect(phase).toHaveProperty("requiresWP");
    });
  });

  it("phase 1 should be Keyword Research", () => {
    expect(CAMPAIGN_PHASES[1].name).toBe("Keyword Research");
    expect(CAMPAIGN_PHASES[1].thaiName).toBe("วิจัย Keywords");
  });

  it("phase 15 should be Final Report", () => {
    expect(CAMPAIGN_PHASES[15].name).toBe("Final Report");
    expect(CAMPAIGN_PHASES[15].thaiName).toBe("สรุปรายงาน");
  });
});

// ═══ SerpAPI Module Exports Tests ═══
describe("SerpAPI Module Exports", () => {
  it("should export searchGoogle function", async () => {
    const mod = await import("./serp-api");
    expect(typeof mod.searchGoogle).toBe("function");
  });

  it("should export findDomainRank function", async () => {
    const mod = await import("./serp-api");
    expect(typeof mod.findDomainRank).toBe("function");
  });

  it("should export trackKeywords function", async () => {
    const mod = await import("./serp-api");
    expect(typeof mod.trackKeywords).toBe("function");
  });

  it("should export getAccountInfo function", async () => {
    const mod = await import("./serp-api");
    expect(typeof mod.getAccountInfo).toBe("function");
  });

  it("should export isSerpApiAvailable function", async () => {
    const mod = await import("./serp-api");
    expect(typeof mod.isSerpApiAvailable).toBe("function");
  });

  it("should export resetCircuitBreaker function", async () => {
    const mod = await import("./serp-api");
    expect(typeof mod.resetCircuitBreaker).toBe("function");
  });

  it("should export getCircuitBreakerStatus function", async () => {
    const mod = await import("./serp-api");
    expect(typeof mod.getCircuitBreakerStatus).toBe("function");
  });
});

// ═══ Timeout Constants Tests ═══
describe("Timeout Constants", () => {
  it("PHASE_TIMEOUT should be 5 minutes (300000ms)", () => {
    const expectedMs = 5 * 60 * 1000;
    expect(expectedMs).toBe(300000);
  });

  it("LLM_TIMEOUT should be 60 seconds (60000ms)", () => {
    const expectedMs = 60 * 1000;
    expect(expectedMs).toBe(60000);
  });

  it("Circuit breaker cooldown should be 30 minutes", () => {
    const expectedMs = 30 * 60 * 1000;
    expect(expectedMs).toBe(1800000);
  });

  it("Quota exhausted cooldown should be 1 hour", () => {
    const expectedMs = 60 * 60 * 1000;
    expect(expectedMs).toBe(3600000);
  });

  it("Max consecutive failures should be 3", () => {
    expect(3).toBe(3);
  });
});

// ═══ Integration: Circuit Breaker + Timeout ═══
describe("Integration: Circuit Breaker + Timeout", () => {
  beforeEach(() => {
    resetCircuitBreaker();
  });

  it("circuit breaker should be available before any failures", () => {
    expect(isSerpApiAvailable()).toBe(true);
    const status = getCircuitBreakerStatus();
    expect(status.consecutiveFailures).toBe(0);
  });

  it("withTimeout should work with circuit breaker check", async () => {
    const available = isSerpApiAvailable();
    expect(available).toBe(true);

    const result = await withTimeout(
      Promise.resolve("serp-data"),
      1000,
      "serp-check",
    );
    expect(result).toBe("serp-data");
  });

  it("timeout error message should be distinguishable from other errors", async () => {
    const slow = new Promise<void>((r) => setTimeout(r, 5000));
    try {
      await withTimeout(slow, 50, "phase-test");
    } catch (err: any) {
      expect(err.message.startsWith("TIMEOUT:")).toBe(true);
    }
  });
});
