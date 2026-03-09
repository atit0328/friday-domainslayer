import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  worldStateCache,
  subsystemCache,
  CacheKeys,
  CacheTTL,
  invalidateOrchestratorCache,
  invalidateTaskCache,
  invalidateSubsystemCache,
  getAllCacheStats,
} from "./cache";

describe("MemoryCache", () => {
  beforeEach(() => {
    worldStateCache.clear();
    subsystemCache.clear();
  });

  it("should store and retrieve values", () => {
    worldStateCache.set("test:key", { value: 42 }, 10_000);
    const result = worldStateCache.get<{ value: number }>("test:key");
    expect(result).toEqual({ value: 42 });
  });

  it("should return undefined for missing keys", () => {
    const result = worldStateCache.get("nonexistent");
    expect(result).toBeUndefined();
  });

  it("should expire entries after TTL", async () => {
    worldStateCache.set("test:expire", "data", 50); // 50ms TTL
    expect(worldStateCache.get("test:expire")).toBe("data");
    
    await new Promise(r => setTimeout(r, 100)); // Wait for expiry
    expect(worldStateCache.get("test:expire")).toBeUndefined();
  });

  it("should compute and cache values with getOrCompute", async () => {
    let callCount = 0;
    const factory = async () => {
      callCount++;
      return { computed: true };
    };

    const result1 = await worldStateCache.getOrCompute("test:compute", 10_000, factory);
    const result2 = await worldStateCache.getOrCompute("test:compute", 10_000, factory);

    expect(result1).toEqual({ computed: true });
    expect(result2).toEqual({ computed: true });
    expect(callCount).toBe(1); // Factory called only once
  });

  it("should invalidate specific keys", () => {
    worldStateCache.set("test:a", "a", 10_000);
    worldStateCache.set("test:b", "b", 10_000);
    
    worldStateCache.invalidate("test:a");
    
    expect(worldStateCache.get("test:a")).toBeUndefined();
    expect(worldStateCache.get("test:b")).toBe("b");
  });

  it("should invalidate keys by prefix", () => {
    worldStateCache.set("orch:state", "s1", 10_000);
    worldStateCache.set("orch:tasks", "s2", 10_000);
    worldStateCache.set("other:key", "s3", 10_000);
    
    worldStateCache.invalidatePrefix("orch:");
    
    expect(worldStateCache.get("orch:state")).toBeUndefined();
    expect(worldStateCache.get("orch:tasks")).toBeUndefined();
    expect(worldStateCache.get("other:key")).toBe("s3");
  });

  it("should clear all entries", () => {
    worldStateCache.set("a", 1, 10_000);
    worldStateCache.set("b", 2, 10_000);
    
    worldStateCache.clear();
    
    expect(worldStateCache.get("a")).toBeUndefined();
    expect(worldStateCache.get("b")).toBeUndefined();
  });
});

describe("CacheKeys", () => {
  it("should generate correct orchestrator state key", () => {
    expect(CacheKeys.orchestratorState()).toBe("orch:state");
  });

  it("should generate correct task queue key", () => {
    expect(CacheKeys.taskQueue()).toBe("orch:tasks");
  });

  it("should generate correct task stats key", () => {
    expect(CacheKeys.taskStats()).toBe("orch:taskStats");
  });

  it("should generate correct metrics key with days", () => {
    expect(CacheKeys.metrics(7)).toBe("orch:metrics:7");
    expect(CacheKeys.metrics(30)).toBe("orch:metrics:30");
  });

  it("should generate correct subsystem detail key", () => {
    expect(CacheKeys.subsystemDetail("seo")).toBe("sub:seo");
    expect(CacheKeys.subsystemDetail("attack")).toBe("sub:attack");
  });
});

describe("CacheTTL", () => {
  it("should have correct TTL values", () => {
    expect(CacheTTL.ORCHESTRATOR_STATE).toBe(10_000);
    expect(CacheTTL.TASK_QUEUE).toBe(5_000);
    expect(CacheTTL.TASK_STATS).toBe(5_000);
    expect(CacheTTL.DECISIONS).toBe(15_000);
    expect(CacheTTL.METRICS).toBe(30_000);
    expect(CacheTTL.SUBSYSTEM_DETAIL).toBe(10_000);
  });
});

describe("Invalidation helpers", () => {
  beforeEach(() => {
    worldStateCache.clear();
    subsystemCache.clear();
  });

  it("invalidateOrchestratorCache should clear all orch: keys", () => {
    worldStateCache.set("orch:state", "s1", 10_000);
    worldStateCache.set("orch:tasks", "s2", 10_000);
    worldStateCache.set("orch:taskStats", "s3", 10_000);
    
    invalidateOrchestratorCache();
    
    expect(worldStateCache.get("orch:state")).toBeUndefined();
    expect(worldStateCache.get("orch:tasks")).toBeUndefined();
    expect(worldStateCache.get("orch:taskStats")).toBeUndefined();
  });

  it("invalidateTaskCache should clear task-related keys", () => {
    worldStateCache.set(CacheKeys.taskQueue(), "q", 10_000);
    worldStateCache.set(CacheKeys.taskStats(), "s", 10_000);
    worldStateCache.set(CacheKeys.orchestratorState(), "state", 10_000);
    
    invalidateTaskCache();
    
    expect(worldStateCache.get(CacheKeys.taskQueue())).toBeUndefined();
    expect(worldStateCache.get(CacheKeys.taskStats())).toBeUndefined();
    expect(worldStateCache.get(CacheKeys.orchestratorState())).toBe("state"); // Not invalidated
  });

  it("invalidateSubsystemCache should clear specific subsystem", () => {
    subsystemCache.set("sub:seo", "data1", 10_000);
    subsystemCache.set("sub:attack", "data2", 10_000);
    
    invalidateSubsystemCache("seo");
    
    expect(subsystemCache.get("sub:seo")).toBeUndefined();
    expect(subsystemCache.get("sub:attack")).toBe("data2");
  });

  it("invalidateSubsystemCache without arg should clear all subsystems", () => {
    subsystemCache.set("sub:seo", "data1", 10_000);
    subsystemCache.set("sub:attack", "data2", 10_000);
    
    invalidateSubsystemCache();
    
    expect(subsystemCache.get("sub:seo")).toBeUndefined();
    expect(subsystemCache.get("sub:attack")).toBeUndefined();
  });
});

describe("getAllCacheStats", () => {
  beforeEach(() => {
    worldStateCache.clear();
    subsystemCache.clear();
  });

  it("should return stats for all cache instances", () => {
    worldStateCache.set("a", 1, 10_000);
    worldStateCache.get("a"); // hit
    worldStateCache.get("b"); // miss
    
    const stats = getAllCacheStats();
    
    expect(stats.worldState).toBeDefined();
    expect(stats.worldState.size).toBe(1);
    expect(stats.worldState.hits).toBeGreaterThanOrEqual(1);
    expect(stats.subsystem).toBeDefined();
  });
});
