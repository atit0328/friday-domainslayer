/**
 * Residential Proxy Pool — Centralized Proxy Management
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

import { ENV } from "./_core/env";

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
    console.log(`[ProxyPool] Initialized with ${this.proxies.length} residential proxies`);
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
        // Prefer proxies with lower latency (0 = untested, treat as medium)
        selected = healthy.reduce((a, b) => {
          const aLat = a.avgLatencyMs || 500;
          const bLat = b.avgLatencyMs || 500;
          return aLat <= bLat ? a : b;
        });
        break;
      }
      case "weighted": {
        // Weight by success rate — more successful proxies get picked more
        const weights = healthy.map(p => {
          const total = p.successCount + p.failCount;
          if (total === 0) return 1; // untested = neutral weight
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
      // Pinned proxy is unhealthy — re-assign
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

    // Shuffle and take first N
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

  // ─── Health Check ───

  /**
   * Check a single proxy connectivity
   */
  async checkProxy(proxy: ProxyEntry, timeout = 10000): Promise<{ ok: boolean; latencyMs: number; ip?: string }> {
    const start = Date.now();
    try {
      // Set proxy env temporarily and test connectivity
      const originalHttp = process.env.HTTP_PROXY;
      const originalHttps = process.env.HTTPS_PROXY;
      try {
        process.env.HTTP_PROXY = proxy.url;
        process.env.HTTPS_PROXY = proxy.url;
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeout);
        const resp = await fetch("http://httpbin.org/ip", {
          signal: controller.signal,
        });
        clearTimeout(t);
        const latencyMs = Date.now() - start;
        if (resp.ok) {
          const data = await resp.json().catch(() => ({}));
          return { ok: true, latencyMs, ip: data.origin };
        }
        return { ok: false, latencyMs };
      } finally {
        if (originalHttp) process.env.HTTP_PROXY = originalHttp;
        else delete process.env.HTTP_PROXY;
        if (originalHttps) process.env.HTTPS_PROXY = originalHttps;
        else delete process.env.HTTPS_PROXY;
      }
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  /**
   * Health check all proxies (or a sample)
   */
  async healthCheckAll(sampleSize?: number): Promise<{ checked: number; healthy: number; unhealthy: number; results: Array<{ label: string; ok: boolean; latencyMs: number; ip?: string }> }> {
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

  /**
   * Get pool statistics
   */
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

  /**
   * Get all proxy entries (for display)
   */
  getAllProxies(): ProxyEntry[] {
    return [...this.proxies];
  }

  /**
   * Get all proxy URLs as newline-separated string (for pipeline config)
   */
  getProxyListString(): string {
    return this.proxies.filter(p => p.healthy).map(p => p.url).join("\n");
  }

  /**
   * Get all healthy proxy URLs as array
   */
  getHealthyProxyUrls(): string[] {
    return this.proxies.filter(p => p.healthy).map(p => p.url);
  }

  /**
   * Get proxy count
   */
  get count(): number {
    return this.proxies.length;
  }

  /**
   * Get healthy proxy count
   */
  get healthyCount(): number {
    return this.proxies.filter(p => p.healthy).length;
  }

  /**
   * Reset all proxy stats
   */
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
//  HELPER: Fetch with proxy from pool
// ═══════════════════════════════════════════════

/**
 * Fetch with automatic proxy rotation from the pool.
 * Reports success/failure back to the pool for smart routing.
 */
export async function fetchWithPoolProxy(
  url: string,
  init: RequestInit = {},
  options: {
    strategy?: RotationStrategy;
    targetDomain?: string;
    timeout?: number;
  } = {},
): Promise<{ response: Response; proxyUsed: ProxyEntry | null }> {
  const { strategy = "weighted", targetDomain, timeout = 15000 } = options;

  const proxy = targetDomain
    ? proxyPool.getProxyForTarget(targetDomain, strategy)
    : proxyPool.getProxy(strategy);

  if (!proxy) {
    // No proxy available — direct fetch
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      return { response, proxyUsed: null };
    } finally {
      clearTimeout(t);
    }
  }

  const start = Date.now();
  const originalHttp = process.env.HTTP_PROXY;
  const originalHttps = process.env.HTTPS_PROXY;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);

  try {
    process.env.HTTP_PROXY = proxy.url;
    process.env.HTTPS_PROXY = proxy.url;
    const response = await fetch(url, { ...init, signal: controller.signal });
    const latency = Date.now() - start;
    proxyPool.reportResult(proxy.id, true, latency);
    return { response, proxyUsed: proxy };
  } catch (err) {
    const latency = Date.now() - start;
    proxyPool.reportResult(proxy.id, false, latency);
    throw err;
  } finally {
    clearTimeout(t);
    if (originalHttp) process.env.HTTP_PROXY = originalHttp;
    else delete process.env.HTTP_PROXY;
    if (originalHttps) process.env.HTTPS_PROXY = originalHttps;
    else delete process.env.HTTPS_PROXY;
  }
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
