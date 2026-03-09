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
      size: this.store.size,
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: this.hitCount + this.missCount > 0
        ? Math.round((this.hitCount / (this.hitCount + this.missCount)) * 100)
        : 0,
    };
  }
}

// ─── Singleton Cache Instances ───────────────────────────────────
// Separate caches for different data domains

/** Cache for orchestrator world state queries (state, tasks, decisions) */
export const worldStateCache = new MemoryCache();

/** Cache for subsystem detail queries */
export const subsystemCache = new MemoryCache();

// ─── Cache Key Builders ─────────────────────────────────────────
export const CacheKeys = {
  orchestratorState: () => "orch:state",
  taskQueue: () => "orch:tasks",
  taskStats: () => "orch:taskStats",
  recentDecisions: () => "orch:decisions",
  metrics: (days: number) => `orch:metrics:${days}`,
  subsystemDetail: (subsystem: string) => `sub:${subsystem}`,
} as const;

// ─── TTL Constants (milliseconds) ───────────────────────────────
export const CacheTTL = {
  ORCHESTRATOR_STATE: 10_000,  // 10s — state changes infrequently
  TASK_QUEUE: 5_000,           // 5s — tasks change more often
  TASK_STATS: 5_000,           // 5s — aggregate stats
  DECISIONS: 15_000,           // 15s — decisions are append-only
  METRICS: 30_000,             // 30s — daily metrics rarely change
  SUBSYSTEM_DETAIL: 10_000,    // 10s — subsystem overview
} as const;

// ─── Invalidation Helpers ───────────────────────────────────────
export function invalidateOrchestratorCache(): void {
  worldStateCache.invalidatePrefix("orch:");
}

export function invalidateTaskCache(): void {
  worldStateCache.invalidate(CacheKeys.taskQueue());
  worldStateCache.invalidate(CacheKeys.taskStats());
}

export function invalidateSubsystemCache(subsystem?: string): void {
  if (subsystem) {
    subsystemCache.invalidate(CacheKeys.subsystemDetail(subsystem));
  } else {
    subsystemCache.invalidatePrefix("sub:");
  }
}

// ─── Get All Cache Stats ────────────────────────────────────────
export function getAllCacheStats() {
  return {
    worldState: worldStateCache.stats(),
    subsystem: subsystemCache.stats(),
  };
}
