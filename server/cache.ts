/**
 * In-Memory Cache Layer
 * 
 * Reduces database load for frequently queried data.
 * Supports TTL-based expiration and manual invalidation.
 * Thread-safe for single-process Node.js.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private hitCount = 0;
  private missCount = 0;

  /**
   * Get a cached value, or return undefined if expired/missing
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.missCount++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.missCount++;
      return undefined;
    }
    this.hitCount++;
    return entry.data as T;
  }

  /**
   * Set a value with TTL in milliseconds
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
    });
  }

  /**
   * Get or compute — returns cached value or runs the factory function
   */
  async getOrCompute<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const data = await factory();
    this.set(key, data, ttlMs);
    return data;
  }

  /**
   * Invalidate a specific key
   */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Invalidate all keys matching a prefix
   */
  invalidatePrefix(prefix: string): void {
    const keysToDelete: string[] = [];
    this.store.forEach((_val, key) => {
      if (key.startsWith(prefix)) keysToDelete.push(key);
    });
    keysToDelete.forEach(k => this.store.delete(k));
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.store.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Get cache stats for monitoring
   */
  stats() {
    // Cleanup expired entries first
    const now = Date.now();
    const keysToDelete: string[] = [];
    this.store.forEach((entry, key) => {
      if (now > entry.expiresAt) keysToDelete.push(key);
    });
    keysToDelete.forEach(k => this.store.delete(k));

    return {
      entries: this.store.size,
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: this.hitCount + this.missCount > 0
        ? Math.round((this.hitCount / (this.hitCount + this.missCount)) * 100)
        : 0,
    };
  }
}

// ─── Singleton Cache Instances ──────────────────────────────────

/** Cache for world state data (orchestrator overview) — 15s TTL */
export const worldStateCache = new MemoryCache();

/** Cache for dashboard stats — 30s TTL */
export const dashboardCache = new MemoryCache();

/** Cache for subsystem detail data — 10s TTL */
export const subsystemCache = new MemoryCache();

/** General purpose cache — variable TTL */
export const generalCache = new MemoryCache();

// ─── Cache Key Builders ─────────────────────────────────────────

export const CacheKeys = {
  worldState: () => "orchestrator:worldState",
  orchestratorState: () => "orchestrator:state",
  taskQueue: () => "orchestrator:taskQueue",
  decisions: (limit: number) => `orchestrator:decisions:${limit}`,
  metrics: () => "orchestrator:metrics",
  subsystemDetail: (subsystem: string) => `subsystem:${subsystem}`,
  dashboardStats: (userId: number) => `dashboard:stats:${userId}`,
  seoProjects: (userId?: number) => `seo:projects:${userId ?? "all"}`,
  userList: () => "admin:users",
} as const;

// ─── Cache TTL Constants ────────────────────────────────────────

export const CacheTTL = {
  WORLD_STATE: 15_000,       // 15 seconds — orchestrator overview
  ORCHESTRATOR_STATE: 10_000, // 10 seconds — AI state
  TASK_QUEUE: 5_000,         // 5 seconds — active tasks change fast
  DECISIONS: 30_000,         // 30 seconds — decisions don't change often
  METRICS: 60_000,           // 1 minute — daily metrics
  SUBSYSTEM: 10_000,         // 10 seconds — subsystem details
  DASHBOARD: 30_000,         // 30 seconds — dashboard stats
  SEO_PROJECTS: 30_000,      // 30 seconds — SEO project list
  USER_LIST: 60_000,         // 1 minute — admin user list
} as const;

// ─── Invalidation Helpers ───────────────────────────────────────

/** Call after orchestrator state changes (start/stop/cycle) */
export function invalidateOrchestratorCache(): void {
  worldStateCache.invalidatePrefix("orchestrator:");
}

/** Call after task queue changes (new task, task completed) */
export function invalidateTaskCache(): void {
  worldStateCache.invalidate(CacheKeys.taskQueue());
  worldStateCache.invalidate(CacheKeys.worldState());
}

/** Call after subsystem data changes */
export function invalidateSubsystemCache(subsystem?: string): void {
  if (subsystem) {
    subsystemCache.invalidate(CacheKeys.subsystemDetail(subsystem));
  } else {
    subsystemCache.clear();
  }
  worldStateCache.invalidate(CacheKeys.worldState());
}

/** Call after SEO project changes */
export function invalidateSeoCache(): void {
  generalCache.invalidatePrefix("seo:");
  worldStateCache.invalidate(CacheKeys.worldState());
}

/** Get all cache stats for monitoring */
export function getAllCacheStats() {
  return {
    worldState: worldStateCache.stats(),
    dashboard: dashboardCache.stats(),
    subsystem: subsystemCache.stats(),
    general: generalCache.stats(),
  };
}
