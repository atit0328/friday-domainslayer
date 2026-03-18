/**
 * Residential Proxy Pool — Centralized Proxy Management
 * 
 * Uses undici ProxyAgent for REAL proxy routing (not HTTP_PROXY env hack).
 * Node.js native fetch() does NOT respect HTTP_PROXY env variable,
 * so we use undici's fetch() + ProxyAgent for actual proxy connections.
 * 
 * Features:
 *   - 50 residential proxies with auto-rotation
 *   - Health checking & auto-disable unhealthy proxies
 *   - Round-robin, random, and weighted selection strategies
 *   - Per-target proxy pinning (same proxy for same target)
 *   - Proxy stats tracking (success/fail/latency)
 *   - Integration with all attack engine modules
 *   - Format: ip:port:user:pass → http://user:pass@ip:port
 */

import { ProxyAgent, fetch as undiciFetch } from "undici";
import type { RequestInit as UndiciRequestInit } from "undici";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface ProxyEntry {
  id: number;
  ip: string;
  port: number;
  username: string;
  password: string;
  url: string;           // http://user:pass@ip:port
  label: string;         // ip:port (for display)
  healthy: boolean;
  lastChecked: number;   // timestamp
  successCount: number;
  failCount: number;
  avgLatencyMs: number;
  lastUsed: number;      // timestamp
  currentTarget?: string; // pinned target domain
}

export interface ProxyStats {
  total: number;
  healthy: number;
  unhealthy: number;
  avgLatencyMs: number;
  totalRequests: number;
  successRate: number;
}

export type RotationStrategy = "round-robin" | "random" | "least-used" | "fastest" | "weighted";

// ═══════════════════════════════════════════════
//  PROXY LIST — 50 Residential Proxies
// ═══════════════════════════════════════════════

const RAW_PROXY_LIST = `
154.91.201.64:44001:ujk6929555692eb1:QFaweUht0yMm92zj8t
62.112.141.247:44001:leX68a3123f423e2:Oz1QnyM0a9vKufm7wD
62.112.140.202:44001:fQk693944a3949e9:m08iLaGXYWoMSqnH1N
62.112.140.52:44001:rNP69227b09ca64b:S3FIHAYVBsqyvdaWRZ
62.112.140.145:44001:mYn68fef2f3099bd:zMekDComOUXH7ZbR6f
62.112.140.182:44001:f7y69227b0a3ac2a:nrz5wXZEkh9ie3DURe
62.112.140.147:44001:fqo6915f84e4f8a3:Y3vSHfVX5yUmgcKe6U
62.112.141.27:44001:v8Q691de857ed872:KFBRw59Gzhv7bgae8P
62.112.140.175:44001:pOz69259916781d1:Ty7aYqCsROX6rjvdHb
62.112.141.121:44001:q8S690dfdbb67f87:csOLmvlKp7Ah01W9Df
154.91.201.147:44001:q2S694123170461f:A8fyq2rb9TBiJnwm6Z
62.112.141.115:44001:nxI6926b12b05d41:dniyRMfhIzHW2E4CPX
62.112.140.115:44001:jVV68da8656aa45b:4FEaqoY0b6kLHnpiJR
154.91.201.5:44001:ehX693053f65f660:PcvfQrL7EtS5WBOewc
154.91.201.203:44001:bGO693991fb43e70:kVbmYuE7azNCv91seb
154.91.201.105:44001:zWb6943708a82207:XjKLimr37A8HEZJTul
154.91.201.178:44001:lOq6943b806b8dfd:j8u9oHd65CJiXnOp3w
62.112.140.107:44001:qkz68f8ad7c0364d:tNFP7yAGjVHJnXO6dW
62.112.140.48:44001:mXf6926b2570b486:HosBVcFNX9wEjPfOYD
154.91.201.202:44001:wAg6947ab5a1fe6d:SBEqN7cpCrDIHvL8ZU
62.112.141.220:44001:vuS693944a39141f:HJSrDzuqx5Q914jawP
154.91.201.81:44001:oQz693ff7165d65a:swXzV8EfyDco75Ln9c
154.91.201.234:44001:qyS69422bef5f4ee:cMR1LWXNfOjT23ZJ8O
154.91.201.108:44001:n0t693cc06e4c95c:2P4dbERXJ6B8GWSqYC
62.112.140.29:44001:cTv693d2536a7bdd:XwOAk1QsZiNvbz30gL
62.112.141.213:44001:aUK6926617ac679c:EB5vYdXQc4IbOC1rGO
62.112.141.159:44001:nya6943e3633cafb:ZFbUORj9DanWctE1Jy
154.91.201.63:44001:ino693d12760dca0:yxlWTzb1kC2mpXS5ih
154.91.201.169:44001:mEx692eaa92d1b10:DkoYl9bFxQrIBnJvZa
154.91.201.164:44001:lzM693577facaed7:5EsytGXj1iJ2aenCDx
62.112.141.75:44001:aAr68f9c3378367f:JOKnTCfsFw3Y0Vtr1o
62.112.141.170:44001:qgy68fef2f329bb2:xsiL8QFPb6qmU4DMAX
62.112.140.128:44001:sSa69440b3aa2647:QygjiAdncolE9K1HZc
62.112.141.56:44001:ryn68a4085702508:wMzfTobjARmetDNxqC
62.112.140.183:44001:xjo6925f47e466c1:lAKPIt4YhCTEJnQs6u
154.91.201.246:44001:veM691e81db94064:WafG5A9XMQ1L3TUqdk
62.112.141.252:44001:fNB6944f91e9d441:EwVrXtp7FHKaIAhJub
62.112.140.53:44001:vAP68d51d2ee5fdd:41dDAQMNLyuxXt680j
154.91.201.223:44001:iPw69380bbf02e00:rNpDcxvKg841mUzIqg
62.112.140.176:44001:jFf69227b0ad4121:k6YCp9R4j1G5MorEZj
154.91.201.80:44001:cye6942d383a54bb:K52TpeyEPhn4DqvUta
62.112.141.94:44001:pNR69241c3ab4bbd:FXnz3JjpKc9A8HQDvn
62.112.141.45:44001:wHO692e71265763d:84WtB7R2NZgTUOfPcj
154.91.201.160:44001:cUX6937d5d651e48:pnxFtIMN5V9ga8XGDx
62.112.141.96:44001:knp6905cae716fce:x8iAuqQ9GRmU2ltZwo
62.112.141.15:44001:uGA6925496642502:MAnEuBHapCGVtLNlxO
62.112.140.185:44001:eNp6921609f12a89:u4NSqEGBk7YL1TMj9D
62.112.141.6:44001:dXn68fef2f2ed9f6:3dtsfcAGQh4pSaxOLV
62.112.141.162:44001:qNs692e9a2ac37e7:YXzFhSTMeKt58Dbgju
62.112.141.72:44001:ykE6900679bf380b:KIdpu27aUkqQTwVHlN
`.trim();

// ═══════════════════════════════════════════════
//  PROXY POOL SINGLETON
// ═══════════════════════════════════════════════

class ProxyPool {
  private proxies: ProxyEntry[] = [];
  private roundRobinIndex = 0;
  private targetPinMap = new Map<string, number>(); // domain → proxy id
  private initialized = false;

  constructor() {
    this.initialize();
  }

  /**
   * Parse raw proxy list and initialize pool
   */
  private initialize(): void {
    if (this.initialized) return;

    // Use env override if available, otherwise use built-in list
    const rawList = process.env.RESIDENTIAL_PROXIES || RAW_PROXY_LIST;

    const lines = rawList.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    this.proxies = lines.map((line, idx) => {
      const parts = line.split(":");
      if (parts.length < 4) return null;
      const [ip, portStr, username, password] = parts;
      const port = parseInt(portStr, 10);
      if (!ip || !port || !username || !password) return null;

      return {
        id: idx,
        ip,
        port,
        username,
        password,
        url: `http://${username}:${password}@${ip}:${port}`,
        label: `${ip}:${port}`,
        healthy: true, // assume healthy until proven otherwise
        lastChecked: 0,
        successCount: 0,
        failCount: 0,
        avgLatencyMs: 0,
        lastUsed: 0,
      } satisfies ProxyEntry;
    }).filter(Boolean) as ProxyEntry[];

    this.initialized = true;
    console.log(`[ProxyPool] Initialized with ${this.proxies.length} residential proxies (undici ProxyAgent)`);
  }

  // ─── Selection Strategies ───

  /**
   * Get next proxy using specified strategy
   */
  getProxy(strategy: RotationStrategy = "random"): ProxyEntry | null {
    const healthy = this.proxies.filter(p => p.healthy);
    if (healthy.length === 0) {
      // All unhealthy — reset and try again
      this.proxies.forEach(p => p.healthy = true);
      const all = this.proxies;
      if (all.length === 0) return null;
      return all[Math.floor(Math.random() * all.length)];
    }

    let selected: ProxyEntry;

    switch (strategy) {
      case "round-robin": {
        selected = healthy[this.roundRobinIndex % healthy.length];
        this.roundRobinIndex = (this.roundRobinIndex + 1) % healthy.length;
        break;
      }
      case "least-used": {
        selected = healthy.reduce((a, b) =>
          (a.successCount + a.failCount) <= (b.successCount + b.failCount) ? a : b
        );
        break;
      }
      case "fastest": {
        selected = healthy.reduce((a, b) => {
          const aLat = a.avgLatencyMs || 500;
          const bLat = b.avgLatencyMs || 500;
          return aLat <= bLat ? a : b;
        });
        break;
      }
      case "weighted": {
        const weights = healthy.map(p => {
          const total = p.successCount + p.failCount;
          if (total === 0) return 1;
          return Math.max(0.1, p.successCount / total);
        });
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let rand = Math.random() * totalWeight;
        let idx = 0;
        for (let i = 0; i < weights.length; i++) {
          rand -= weights[i];
          if (rand <= 0) { idx = i; break; }
        }
        selected = healthy[idx];
        break;
      }
      case "random":
      default: {
        selected = healthy[Math.floor(Math.random() * healthy.length)];
        break;
      }
    }

    selected.lastUsed = Date.now();
    return selected;
  }

  /**
   * Get proxy pinned to a specific target domain (consistent proxy per target)
   */
  getProxyForTarget(targetDomain: string, strategy: RotationStrategy = "random"): ProxyEntry | null {
    const existing = this.targetPinMap.get(targetDomain);
    if (existing !== undefined) {
      const proxy = this.proxies.find(p => p.id === existing);
      if (proxy && proxy.healthy) {
        proxy.lastUsed = Date.now();
        return proxy;
      }
      this.targetPinMap.delete(targetDomain);
    }
    const proxy = this.getProxy(strategy);
    if (proxy) {
      this.targetPinMap.set(targetDomain, proxy.id);
    }
    return proxy;
  }

  /**
   * Get N unique proxies (for parallel operations)
   */
  getMultipleProxies(count: number, strategy: RotationStrategy = "random"): ProxyEntry[] {
    const healthy = this.proxies.filter(p => p.healthy);
    if (healthy.length === 0) return [];
    const n = Math.min(count, healthy.length);
    const shuffled = [...healthy].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  }

  // ─── Stats Tracking ───

  /**
   * Report proxy usage result
   */
  reportResult(proxyId: number, success: boolean, latencyMs?: number): void {
    const proxy = this.proxies.find(p => p.id === proxyId);
    if (!proxy) return;

    if (success) {
      proxy.successCount++;
    } else {
      proxy.failCount++;
    }

    if (latencyMs !== undefined) {
      const total = proxy.successCount + proxy.failCount;
      proxy.avgLatencyMs = ((proxy.avgLatencyMs * (total - 1)) + latencyMs) / total;
    }

    // Auto-disable proxy after too many failures
    const total = proxy.successCount + proxy.failCount;
    if (total >= 5 && proxy.failCount / total > 0.8) {
      proxy.healthy = false;
      console.log(`[ProxyPool] Proxy ${proxy.label} marked unhealthy (${proxy.failCount}/${total} failures)`);
    }
  }

  /**
   * Report result by proxy URL
   */
  reportResultByUrl(proxyUrl: string, success: boolean, latencyMs?: number): void {
    const proxy = this.proxies.find(p => p.url === proxyUrl);
    if (proxy) {
      this.reportResult(proxy.id, success, latencyMs);
    }
  }

  // ─── Health Check (REAL via undici ProxyAgent) ───

  /**
   * Create undici ProxyAgent for a proxy entry
   */
  private createProxyAgent(proxy: ProxyEntry): ProxyAgent {
    return new ProxyAgent({
      uri: proxy.url,
      requestTls: {
        rejectUnauthorized: false,
      },
    });
  }

  /**
   * Check a single proxy connectivity using undici ProxyAgent (REAL proxy test)
   */
  async checkProxy(proxy: ProxyEntry, timeout = 10000): Promise<{ ok: boolean; latencyMs: number; ip?: string }> {
    const start = Date.now();
    let agent: ProxyAgent | null = null;
    try {
      agent = this.createProxyAgent(proxy);
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeout);

      const resp = await undiciFetch("http://httpbin.org/ip", {
        signal: controller.signal,
        dispatcher: agent,
      } as any);

      clearTimeout(t);
      const latencyMs = Date.now() - start;

      if (resp.ok) {
        const data = await resp.json().catch(() => ({})) as any;
        return { ok: true, latencyMs, ip: data.origin };
      }
      return { ok: false, latencyMs };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    } finally {
      if (agent) {
        try { await agent.close(); } catch { /* ignore */ }
      }
    }
  }

  /**
   * Health check all proxies (or a sample) — REAL connectivity test
   */
  async healthCheckAll(sampleSize?: number): Promise<{
    checked: number;
    healthy: number;
    unhealthy: number;
    results: Array<{ label: string; ok: boolean; latencyMs: number; ip?: string }>;
  }> {
    const toCheck = sampleSize
      ? this.proxies.sort(() => Math.random() - 0.5).slice(0, sampleSize)
      : this.proxies;

    const results: Array<{ label: string; ok: boolean; latencyMs: number; ip?: string }> = [];
    let healthy = 0;
    let unhealthy = 0;

    // Check in batches of 5 to avoid overwhelming
    for (let i = 0; i < toCheck.length; i += 5) {
      const batch = toCheck.slice(i, i + 5);
      const batchResults = await Promise.allSettled(
        batch.map(async (proxy) => {
          const result = await this.checkProxy(proxy);
          proxy.lastChecked = Date.now();
          proxy.healthy = result.ok;
          if (result.ok) {
            proxy.avgLatencyMs = result.latencyMs;
            healthy++;
          } else {
            unhealthy++;
          }
          return { label: proxy.label, ...result };
        })
      );
      for (const r of batchResults) {
        if (r.status === "fulfilled") {
          results.push(r.value);
        }
      }
    }

    return { checked: toCheck.length, healthy, unhealthy, results };
  }

  // ─── Getters ───

  getStats(): ProxyStats {
    const healthy = this.proxies.filter(p => p.healthy);
    const totalRequests = this.proxies.reduce((s, p) => s + p.successCount + p.failCount, 0);
    const totalSuccess = this.proxies.reduce((s, p) => s + p.successCount, 0);
    const avgLatency = healthy.length > 0
      ? healthy.reduce((s, p) => s + (p.avgLatencyMs || 0), 0) / healthy.length
      : 0;

    return {
      total: this.proxies.length,
      healthy: healthy.length,
      unhealthy: this.proxies.length - healthy.length,
      avgLatencyMs: Math.round(avgLatency),
      totalRequests,
      successRate: totalRequests > 0 ? Math.round((totalSuccess / totalRequests) * 100) : 100,
    };
  }

  getAllProxies(): ProxyEntry[] {
    return [...this.proxies];
  }

  getProxyListString(): string {
    return this.proxies.filter(p => p.healthy).map(p => p.url).join("\n");
  }

  getHealthyProxyUrls(): string[] {
    return this.proxies.filter(p => p.healthy).map(p => p.url);
  }

  get count(): number {
    return this.proxies.length;
  }

  get healthyCount(): number {
    return this.proxies.filter(p => p.healthy).length;
  }

  resetStats(): void {
    for (const p of this.proxies) {
      p.successCount = 0;
      p.failCount = 0;
      p.avgLatencyMs = 0;
      p.healthy = true;
      p.lastChecked = 0;
      p.lastUsed = 0;
    }
    this.targetPinMap.clear();
    this.roundRobinIndex = 0;
  }
}

// ═══════════════════════════════════════════════
//  SINGLETON INSTANCE
// ═══════════════════════════════════════════════

export const proxyPool = new ProxyPool();

// ═══════════════════════════════════════════════
//  SHARED PROXY AGENT POOL (MEMORY OPTIMIZATION)
//  Instead of creating new ProxyAgent per request (~3-5MB native memory each),
//  reuse agents from a small pool. This dramatically reduces RSS.
// ═══════════════════════════════════════════════

const MAX_SHARED_AGENTS = 3; // Only keep 3 agents alive at a time
const sharedAgentPool = new Map<number, { agent: ProxyAgent; lastUsed: number; useCount: number }>();
let agentCreationCount = 0;

/**
 * Get or create a shared ProxyAgent for a proxy entry.
 * Reuses existing agents to avoid native memory leak from TLS buffers.
 * Each ProxyAgent uses ~3-5MB native memory that GC cannot reclaim.
 */
export function getSharedAgent(proxy: ProxyEntry): ProxyAgent {
  const existing = sharedAgentPool.get(proxy.id);
  if (existing) {
    existing.lastUsed = Date.now();
    existing.useCount++;
    return existing.agent;
  }

  // Evict oldest if pool is full
  if (sharedAgentPool.size >= MAX_SHARED_AGENTS) {
    let oldestId = -1;
    let oldestTime = Infinity;
    for (const [id, entry] of Array.from(sharedAgentPool.entries())) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestId = id;
      }
    }
    if (oldestId >= 0) {
      const old = sharedAgentPool.get(oldestId);
      if (old) {
        old.agent.close().catch(() => {});
        sharedAgentPool.delete(oldestId);
      }
    }
  }

  const agent = new ProxyAgent({
    uri: proxy.url,
    requestTls: { rejectUnauthorized: false },
    connections: 2, // Limit connections per agent to reduce memory
  });
  agentCreationCount++;
  sharedAgentPool.set(proxy.id, { agent, lastUsed: Date.now(), useCount: 1 });
  return agent;
}

/**
 * Destroy ALL shared proxy agents to reclaim native memory.
 * Call this between attack methods to prevent RSS buildup.
 * Each agent holds ~3-5MB of native TLS buffers that GC cannot free.
 */
export async function destroyAllSharedAgents(): Promise<number> {
  const count = sharedAgentPool.size;
  const closePromises: Promise<void>[] = [];
  for (const [, entry] of Array.from(sharedAgentPool.entries())) {
    closePromises.push(entry.agent.close().catch(() => {}));
  }
  await Promise.allSettled(closePromises);
  sharedAgentPool.clear();
  console.log(`[ProxyPool] Destroyed ${count} shared agents (total created: ${agentCreationCount})`);
  return count;
}

/**
 * Get stats about the shared agent pool
 */
export function getSharedAgentStats(): { poolSize: number; maxSize: number; totalCreated: number } {
  return { poolSize: sharedAgentPool.size, maxSize: MAX_SHARED_AGENTS, totalCreated: agentCreationCount };
}

// ═══════════════════════════════════════════════
//  DOMAIN INTELLIGENCE CACHE
//  Remembers which domains block proxies (e.g. Cloudflare)
//  so we skip proxy attempts and go direct immediately.
// ═══════════════════════════════════════════════

interface DomainIntel {
  directOnly: boolean;        // true = skip proxy, go direct
  reason: string;             // why (e.g. "cloudflare_blocks_proxy")
  proxyFailCount: number;     // how many proxy attempts failed
  lastUpdated: number;        // timestamp
  ttlMs: number;              // how long to cache this intel
}

const domainIntelCache = new Map<string, DomainIntel>();
const DOMAIN_INTEL_DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
const PROXY_FAIL_THRESHOLD = 3; // After 3 proxy failures for same domain → mark as direct-only

/**
 * Check if a domain should skip proxy and go direct
 */
function shouldSkipProxy(domain: string): { skip: boolean; reason?: string } {
  const intel = domainIntelCache.get(domain);
  if (!intel) return { skip: false };
  
  // Check if intel has expired
  if (Date.now() - intel.lastUpdated > intel.ttlMs) {
    domainIntelCache.delete(domain);
    return { skip: false };
  }
  
  if (intel.directOnly) {
    return { skip: true, reason: intel.reason };
  }
  return { skip: false };
}

/**
 * Record a proxy failure for a domain — after threshold, mark as direct-only
 */
function recordProxyFailure(domain: string, reason: string = "proxy_blocked"): void {
  const existing = domainIntelCache.get(domain);
  const failCount = (existing?.proxyFailCount || 0) + 1;
  
  domainIntelCache.set(domain, {
    directOnly: failCount >= PROXY_FAIL_THRESHOLD,
    reason,
    proxyFailCount: failCount,
    lastUpdated: Date.now(),
    ttlMs: DOMAIN_INTEL_DEFAULT_TTL,
  });
  
  if (failCount >= PROXY_FAIL_THRESHOLD) {
    console.log(`[DomainIntel] ${domain} marked as DIRECT-ONLY (${failCount} proxy failures: ${reason})`);
  }
}

/**
 * Manually mark a domain as direct-only (e.g. after detecting Cloudflare)
 */
export function markDomainDirectOnly(domain: string, reason: string = "manual"): void {
  domainIntelCache.set(domain, {
    directOnly: true,
    reason,
    proxyFailCount: PROXY_FAIL_THRESHOLD,
    lastUpdated: Date.now(),
    ttlMs: DOMAIN_INTEL_DEFAULT_TTL,
  });
  console.log(`[DomainIntel] ${domain} manually marked as DIRECT-ONLY (${reason})`);
}

/**
 * Get domain intelligence stats
 */
export function getDomainIntelStats(): { total: number; directOnly: number; domains: Array<{ domain: string; directOnly: boolean; reason: string; failCount: number }> } {
  const domains: Array<{ domain: string; directOnly: boolean; reason: string; failCount: number }> = [];
  const entries = Array.from(domainIntelCache.entries());
  for (let i = 0; i < entries.length; i++) {
    const [d, intel] = entries[i];
    if (Date.now() - intel.lastUpdated <= intel.ttlMs) {
      domains.push({ domain: d, directOnly: intel.directOnly, reason: intel.reason, failCount: intel.proxyFailCount });
    }
  }
  return { total: domains.length, directOnly: domains.filter(d => d.directOnly).length, domains };
}

/**
 * Export pool stats as standalone function
 */
export function getPoolStats(): { total: number; healthy: number; dead: number; avgSuccessRate: number } {
  const stats = proxyPool.getStats();
  return {
    total: stats.total,
    healthy: stats.healthy,
    dead: stats.unhealthy,
    avgSuccessRate: stats.successRate / 100,
  };
}

// ═══════════════════════════════════════════════
//  THAI DOMAIN DETECTION
// ═══════════════════════════════════════════════

const THAI_TLDS = [".th", ".ac.th", ".go.th", ".co.th", ".or.th", ".in.th", ".mi.th", ".net.th"];

/**
 * Check if a domain is Thai (ends with .th TLD)
 */
function isThaiDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return THAI_TLDS.some(tld => d.endsWith(tld));
}

/**
 * Check if a response indicates the request was blocked (403, 406, 451, etc.)
 */
function isBlockedResponse(status: number): boolean {
  return status === 403 || status === 406 || status === 451 || status === 429;
}

// ═══════════════════════════════════════════════
//  HELPER: Fetch with proxy from pool (REAL proxy via undici)
// ═══════════════════════════════════════════════

/**
 * Fetch with automatic proxy rotation from the pool.
 * Uses undici ProxyAgent for REAL proxy routing.
 * 
 * RETRY STRATEGY:
 *   1. Try with selected proxy
 *   2. If proxy fails → try with a DIFFERENT proxy (up to maxRetries)
 *   3. If all proxies fail → fallback to DIRECT fetch (no proxy)
 *   4. Report all failures back to pool for smart routing
 * 
 * This ensures attacks NEVER fail just because proxies are dead.
 */
export async function fetchWithPoolProxy(
  url: string,
  init: RequestInit = {},
  options: {
    strategy?: RotationStrategy;
    targetDomain?: string;
    timeout?: number;
    maxRetries?: number;
    fallbackDirect?: boolean; // default true — fallback to direct if all proxies fail
  } = {},
): Promise<{ response: Response; proxyUsed: ProxyEntry | null; method: "proxy" | "direct" | "no-proxy" }> {
  const { 
    strategy = "weighted", 
    targetDomain, 
    timeout = 10000, // Reduced from 15s to 10s — faster failure = less memory held
    maxRetries = 1, // Reduced from 2 to 1 — each retry creates a new ProxyAgent (~3-5MB native memory)
    fallbackDirect = true 
  } = options;

  // ─── Domain Intelligence: skip proxy if domain is known to block them ───
  const domain = options.targetDomain || new URL(url).hostname;
  const thaiDomain = isThaiDomain(domain);
  const intelCheck = shouldSkipProxy(domain);
  if (intelCheck.skip) {
    // Check caller abort before attempting
    if (init.signal && (init.signal as AbortSignal).aborted) {
      throw new Error(`Fetch aborted by caller for ${url}`);
    }
    // Domain is known to block proxies — go direct immediately
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      
      // ─── AUTO-SWITCH: Direct returned 403/blocked for Thai domain → retry via proxy ───
      if (thaiDomain && isBlockedResponse(response.status)) {
        console.log(`[ProxyPool] 🇹🇭 Thai domain ${domain} returned ${response.status} on direct → auto-switching to proxy`);
        // Clear the direct-only intel so proxy is tried
        domainIntelCache.delete(domain);
        // Fall through to proxy logic below (don't return)
      } else {
        return { response, proxyUsed: null, method: "direct" as const };
      }
    } catch (directErr) {
      clearTimeout(t);
      // ─── AUTO-SWITCH: Direct fetch timeout/error for Thai domain → retry via proxy ───
      if (thaiDomain) {
        console.log(`[ProxyPool] 🇹🇭 Thai domain ${domain} direct fetch failed → auto-switching to proxy. Error: ${directErr instanceof Error ? directErr.message : String(directErr)}`);
        domainIntelCache.delete(domain);
        // Fall through to proxy logic below
      } else {
        throw new Error(
          `Direct fetch failed for ${url} (domain intel: ${intelCheck.reason}). ` +
          `Error: ${directErr instanceof Error ? directErr.message : String(directErr)}`
        );
      }
    } finally {
      clearTimeout(t);
    }
  }

  // Track which proxies we've tried to avoid repeats
  const triedProxyIds = new Set<number>();
  const errors: Array<{ proxyLabel: string; error: string; latencyMs: number }> = [];
  
  // Helper: check if caller's signal is aborted
  const isCallerAborted = () => !!(init.signal && (init.signal as AbortSignal).aborted);

  // ─── Attempt with proxies (try up to maxRetries different proxies) ───
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check caller abort before each retry
    if (isCallerAborted()) {
      throw new Error(`Fetch aborted by caller for ${url}`);
    }
    const proxy = targetDomain
      ? proxyPool.getProxyForTarget(targetDomain, strategy)
      : proxyPool.getProxy(strategy);

    if (!proxy || triedProxyIds.has(proxy.id)) {
      // No more untried proxies — try to get a different one
      const allHealthy = proxyPool.getAllProxies().filter(p => p.healthy && !triedProxyIds.has(p.id));
      if (allHealthy.length === 0) break; // No more proxies to try
      const altProxy = allHealthy[Math.floor(Math.random() * allHealthy.length)];
      if (!altProxy || triedProxyIds.has(altProxy.id)) break;
      triedProxyIds.add(altProxy.id);
      
      const result = await _tryProxyFetch(url, init, altProxy, timeout);
      if (result.success) {
        return { response: result.response!, proxyUsed: altProxy, method: "proxy" };
      }
      errors.push({ proxyLabel: altProxy.label, error: result.error!, latencyMs: result.latencyMs });
      continue;
    }

    triedProxyIds.add(proxy.id);
    if (isCallerAborted()) {
      throw new Error(`Fetch aborted by caller for ${url}`);
    }
    const result = await _tryProxyFetch(url, init, proxy, timeout);
    if (result.success) {
      return { response: result.response!, proxyUsed: proxy, method: "proxy" };
    }
    errors.push({ proxyLabel: proxy.label, error: result.error!, latencyMs: result.latencyMs });
  }

  // ─── All proxies failed → record domain intel + fallback to direct fetch ───
  if (errors.length > 0) {
    recordProxyFailure(domain, `${errors.length}_proxies_failed`);
  }
  if (fallbackDirect) {
    if (errors.length > 0) {
      console.log(`[ProxyPool] ${errors.length} proxies failed for ${url.substring(0, 80)} — falling back to direct fetch`);
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      
      // ─── AUTO-SWITCH: Direct fallback returned 403 for Thai domain → try MORE proxies ───
      if (thaiDomain && isBlockedResponse(response.status)) {
        console.log(`[ProxyPool] 🇹🇭 Thai domain ${domain} returned ${response.status} on direct fallback — trying remaining proxies`);
        // Try additional proxies that haven't been tried yet
        const untried = proxyPool.getAllProxies().filter(p => p.healthy && !triedProxyIds.has(p.id));
        for (const extraProxy of untried.slice(0, 3)) {
          if (isCallerAborted()) break;
          triedProxyIds.add(extraProxy.id);
          const extraResult = await _tryProxyFetch(url, init, extraProxy, timeout);
          if (extraResult.success && extraResult.response && !isBlockedResponse(extraResult.response.status)) {
            console.log(`[ProxyPool] 🇹🇭 ✅ Thai domain ${domain} succeeded via proxy ${extraProxy.label}`);
            return { response: extraResult.response, proxyUsed: extraProxy, method: "proxy" };
          }
        }
        // All extra proxies also failed — return the direct 403 response
        console.log(`[ProxyPool] 🇹🇭 All proxy+direct attempts returned blocked for ${domain}`);
      }
      
      return { response, proxyUsed: null, method: "direct" };
    } catch (directErr) {
      clearTimeout(t);
      
      // ─── AUTO-SWITCH: Direct fallback timeout for Thai domain → try MORE proxies ───
      if (thaiDomain) {
        console.log(`[ProxyPool] 🇹🇭 Thai domain ${domain} direct fallback timed out — trying remaining proxies`);
        if (isCallerAborted()) throw new Error(`Fetch aborted by caller for ${url}`);
        const untried = proxyPool.getAllProxies().filter(p => p.healthy && !triedProxyIds.has(p.id));
        for (const extraProxy of untried.slice(0, 3)) {
          if (isCallerAborted()) break;
          triedProxyIds.add(extraProxy.id);
          const extraResult = await _tryProxyFetch(url, init, extraProxy, timeout);
          if (extraResult.success) {
            console.log(`[ProxyPool] 🇹🇭 ✅ Thai domain ${domain} succeeded via proxy ${extraProxy.label} after direct timeout`);
            return { response: extraResult.response!, proxyUsed: extraProxy, method: "proxy" };
          }
        }
      }
      
      // Even direct fetch failed — this means the TARGET is unreachable
      const allErrors = errors.map(e => `${e.proxyLabel}: ${e.error} (${e.latencyMs}ms)`).join("; ");
      throw new Error(
        `All fetch attempts failed for ${url}. ` +
        `Proxy errors: [${allErrors}]. ` +
        `Direct error: ${directErr instanceof Error ? directErr.message : String(directErr)}`
      );
    } finally {
      clearTimeout(t);
    }
  }

  // No proxy available and no fallback — direct fetch
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { response, proxyUsed: null, method: "no-proxy" };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Internal: Try a single proxy fetch, return success/failure without throwing
 */
async function _tryProxyFetch(
  url: string,
  init: RequestInit,
  proxy: ProxyEntry,
  timeout: number,
): Promise<{ success: boolean; response?: Response; error?: string; latencyMs: number }> {
  const start = Date.now();
  // Use shared agent pool instead of creating new ProxyAgent per request
  // Each ProxyAgent uses ~3-5MB native memory (TLS buffers) that GC cannot reclaim
  // With 30+ files × 3 methods = 90+ agents = ~270-450MB native memory leak!
  const agent = getSharedAgent(proxy);

  try {
    const controller = new AbortController();
    // DON'T clear timeout until body is fully read — this was the root cause of hangs!
    const t = setTimeout(() => controller.abort(), timeout);

    // Also merge with caller's signal if present
    if (init.signal) {
      const callerSignal = init.signal as AbortSignal;
      if (callerSignal.aborted) {
        clearTimeout(t);
        controller.abort();
        return { success: false, error: "Caller aborted", latencyMs: Date.now() - start };
      }
      callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const undiciInit: any = {
      method: init.method || "GET",
      headers: init.headers as any,
      body: init.body as any,
      signal: controller.signal,
      dispatcher: agent,
    };
    if (!undiciInit.headers) delete undiciInit.headers;
    if (!undiciInit.body) delete undiciInit.body;

    const undiciResp = await undiciFetch(url, undiciInit);
    // NOTE: Do NOT clearTimeout here — body read can still hang!

    // Read body with the SAME abort controller (timeout still active)
    // Limit response body to 512KB to prevent memory bloat from large pages
    const MAX_BODY_SIZE = 512 * 1024; // 512KB
    const responseBody = await undiciResp.arrayBuffer();
    const trimmedBody = responseBody.byteLength > MAX_BODY_SIZE 
      ? responseBody.slice(0, MAX_BODY_SIZE) 
      : responseBody;
    clearTimeout(t); // NOW safe to clear — both headers and body are received

    const latencyMs = Date.now() - start;
    proxyPool.reportResult(proxy.id, true, latencyMs);

    // Convert undici Response to standard Response
    const standardResponse = new Response(trimmedBody, {
      status: undiciResp.status,
      statusText: undiciResp.statusText,
      headers: Object.fromEntries(undiciResp.headers.entries()),
    });

    return { success: true, response: standardResponse, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    proxyPool.reportResult(proxy.id, false, latencyMs);
    return { 
      success: false, 
      error: err instanceof Error ? err.message : String(err), 
      latencyMs 
    };
  }
  // NOTE: Do NOT close agent here — it's shared and managed by the pool
  // Call destroyAllSharedAgents() between attack methods to reclaim memory
}

/**
 * Fetch with proxy using undici directly (returns undici Response).
 * Use this when you need streaming or don't need standard Response compatibility.
 */
export async function fetchWithProxyRaw(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer | Uint8Array;
    timeout?: number;
  } = {},
  options: {
    strategy?: RotationStrategy;
    targetDomain?: string;
  } = {},
): Promise<{ response: Awaited<ReturnType<typeof undiciFetch>>; proxyUsed: ProxyEntry | null }> {
  const { strategy = "weighted", targetDomain } = options;
  const timeout = init.timeout || 10000; // Reduced from 15s to 10s

  const proxy = targetDomain
    ? proxyPool.getProxyForTarget(targetDomain, strategy)
    : proxyPool.getProxy(strategy);

  if (!proxy) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await undiciFetch(url, {
        method: init.method || "GET",
        headers: init.headers,
        body: init.body,
        signal: controller.signal,
      } as any);
      return { response, proxyUsed: null };
    } finally {
      clearTimeout(t);
    }
  }

  const start = Date.now();
  // Use shared agent pool to avoid native memory leak
  const agent = getSharedAgent(proxy);

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);

    const response = await undiciFetch(url, {
      method: init.method || "GET",
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
      dispatcher: agent,
    } as any);

    clearTimeout(t);
    const latency = Date.now() - start;
    proxyPool.reportResult(proxy.id, true, latency);

    return { response, proxyUsed: proxy };
  } catch (err) {
    const latency = Date.now() - start;
    proxyPool.reportResult(proxy.id, false, latency);
    throw err;
  }
  // NOTE: Do NOT close agent — it's shared. Call destroyAllSharedAgents() between methods.
}

/**
 * Get a proxy URL string for Puppeteer --proxy-server arg
 * Returns format: ip:port (without auth — auth handled via page.authenticate)
 */
export function getProxyForPuppeteer(targetDomain?: string): {
  proxyServer: string;  // ip:port for --proxy-server
  username: string;
  password: string;
  proxyEntry: ProxyEntry;
} | null {
  const proxy = targetDomain
    ? proxyPool.getProxyForTarget(targetDomain)
    : proxyPool.getProxy("random");

  if (!proxy) return null;

  return {
    proxyServer: `${proxy.ip}:${proxy.port}`,
    username: proxy.username,
    password: proxy.password,
    proxyEntry: proxy,
  };
}

// ═══════════════════════════════════════════════
//  SCHEDULED HEALTH CHECK
// ═══════════════════════════════════════════════

let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic health checks (every 6 hours by default)
 */
export function startProxyHealthScheduler(intervalMs = 6 * 60 * 60 * 1000): void {
  if (healthCheckInterval) return;

  console.log(`[ProxyScheduler] Starting health check scheduler (every ${Math.round(intervalMs / 60000)}min)`);

  healthCheckInterval = setInterval(async () => {
    console.log("[ProxyScheduler] Running scheduled health check...");
    try {
      const result = await proxyPool.healthCheckAll();
      console.log(`[ProxyScheduler] Health check complete: ${result.healthy}/${result.checked} healthy`);
    } catch (err) {
      console.error("[ProxyScheduler] Health check failed:", err);
    }
  }, intervalMs);
}

/**
 * Stop periodic health checks
 */
export function stopProxyHealthScheduler(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log("[ProxyScheduler] Health check scheduler stopped");
  }
}

// Auto-start scheduler
startProxyHealthScheduler();

// Run startup health check immediately (sample 5 proxies)
// This ensures we know which proxies are alive BEFORE any attack
(async () => {
  try {
    console.log("[ProxyPool] Running startup health check (5 proxy sample)...");
    const result = await proxyPool.healthCheckAll(5);
    console.log(`[ProxyPool] Startup check: ${result.healthy}/${result.checked} healthy`);
    if (result.healthy === 0) {
      console.warn("[ProxyPool] WARNING: No healthy proxies detected! All requests will use direct fetch fallback.");
    }
  } catch (err) {
    console.error("[ProxyPool] Startup health check failed:", err);
  }
})();
