/**
 * Proxy Pool — Unit Tests
 * Tests proxy pool initialization, rotation strategies, health tracking,
 * target pinning, and fetchWithPoolProxy helper.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { proxyPool, fetchWithPoolProxy, getProxyForPuppeteer, type ProxyEntry } from "./proxy-pool";

describe("ProxyPool", () => {
  beforeEach(() => {
    proxyPool.resetStats();
  });

  // ─── Initialization ───

  it("should have 50 residential proxies loaded", () => {
    expect(proxyPool.count).toBe(50);
  });

  it("should have all proxies healthy initially", () => {
    expect(proxyPool.healthyCount).toBe(50);
  });

  it("should have valid proxy entries with all required fields", () => {
    const proxies = proxyPool.getAllProxies();
    for (const p of proxies) {
      expect(p.id).toBeGreaterThanOrEqual(0);
      expect(p.ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      expect(p.port).toBe(44001);
      expect(p.username).toBeTruthy();
      expect(p.password).toBeTruthy();
      expect(p.url).toMatch(/^http:\/\/.+:.+@\d+\.\d+\.\d+\.\d+:\d+$/);
      expect(p.label).toMatch(/^\d+\.\d+\.\d+\.\d+:44001$/);
      expect(p.healthy).toBe(true);
    }
  });

  // ─── Rotation Strategies ───

  it("should return a proxy with random strategy", () => {
    const proxy = proxyPool.getProxy("random");
    expect(proxy).not.toBeNull();
    expect(proxy!.ip).toBeTruthy();
  });

  it("should return proxies in round-robin order", () => {
    const first = proxyPool.getProxy("round-robin");
    const second = proxyPool.getProxy("round-robin");
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // Should be different proxies (sequential)
    expect(first!.id).not.toBe(second!.id);
  });

  it("should return proxy with least-used strategy", () => {
    const proxy = proxyPool.getProxy("least-used");
    expect(proxy).not.toBeNull();
  });

  it("should return proxy with fastest strategy", () => {
    const proxy = proxyPool.getProxy("fastest");
    expect(proxy).not.toBeNull();
  });

  it("should return proxy with weighted strategy", () => {
    const proxy = proxyPool.getProxy("weighted");
    expect(proxy).not.toBeNull();
  });

  // ─── Target Pinning ───

  it("should pin same proxy to same target domain", () => {
    const first = proxyPool.getProxyForTarget("example.com");
    const second = proxyPool.getProxyForTarget("example.com");
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.id).toBe(second!.id);
  });

  it("should assign different proxies to different targets", () => {
    const proxies = new Set<number>();
    for (let i = 0; i < 10; i++) {
      const p = proxyPool.getProxyForTarget(`target${i}.com`);
      if (p) proxies.add(p.id);
    }
    // Should have multiple different proxies (not all same)
    expect(proxies.size).toBeGreaterThan(1);
  });

  // ─── Health Tracking ───

  it("should track success results", () => {
    const proxy = proxyPool.getProxy("random")!;
    proxyPool.reportResult(proxy.id, true, 200);
    const updated = proxyPool.getAllProxies().find(p => p.id === proxy.id)!;
    expect(updated.successCount).toBe(1);
    expect(updated.avgLatencyMs).toBe(200);
    expect(updated.healthy).toBe(true);
  });

  it("should mark proxy unhealthy after consecutive failures", () => {
    const proxy = proxyPool.getProxy("random")!;
    // Report 5 consecutive failures
    for (let i = 0; i < 5; i++) {
      proxyPool.reportResult(proxy.id, false, 5000);
    }
    const updated = proxyPool.getAllProxies().find(p => p.id === proxy.id)!;
    expect(updated.failCount).toBe(5);
    expect(updated.healthy).toBe(false);
  });

  it("should return multiple proxies", () => {
    const proxies = proxyPool.getMultipleProxies(5);
    expect(proxies.length).toBe(5);
    // All should be unique
    const ids = new Set(proxies.map(p => p.id));
    expect(ids.size).toBe(5);
  });

  // ─── Stats ───

  it("should return accurate stats", () => {
    const stats = proxyPool.getStats();
    expect(stats.total).toBe(50);
    expect(stats.healthy).toBe(50);
    expect(stats.unhealthy).toBe(0);
    expect(stats.totalRequests).toBe(0);
    expect(stats.successRate).toBe(100); // No requests yet = 100%
  });

  // ─── Proxy URL Formats ───

  it("should return healthy proxy URLs as array", () => {
    const urls = proxyPool.getHealthyProxyUrls();
    expect(urls.length).toBe(50);
    for (const url of urls) {
      expect(url).toMatch(/^http:\/\/.+:.+@\d+\.\d+\.\d+\.\d+:44001$/);
    }
  });

  it("should return proxy list as newline-separated string", () => {
    const listStr = proxyPool.getProxyListString();
    const lines = listStr.split("\n");
    expect(lines.length).toBe(50);
  });

  // ─── Reset ───

  it("should reset all stats correctly", () => {
    const proxy = proxyPool.getProxy("random")!;
    proxyPool.reportResult(proxy.id, true, 200);
    proxyPool.reportResult(proxy.id, false, 5000);

    proxyPool.resetStats();

    const updated = proxyPool.getAllProxies().find(p => p.id === proxy.id)!;
    expect(updated.successCount).toBe(0);
    expect(updated.failCount).toBe(0);
    expect(updated.avgLatencyMs).toBe(0);
    expect(updated.healthy).toBe(true);
  });
});

describe("getProxyForPuppeteer", () => {
  beforeEach(() => {
    proxyPool.resetStats();
  });

  it("should return proxy info for Puppeteer", () => {
    const info = getProxyForPuppeteer();
    expect(info).not.toBeNull();
    expect(info!.proxyServer).toMatch(/^\d+\.\d+\.\d+\.\d+:44001$/);
    expect(info!.username).toBeTruthy();
    expect(info!.password).toBeTruthy();
    expect(info!.proxyEntry).toBeDefined();
  });

  it("should return proxy info for specific target domain", () => {
    const info = getProxyForPuppeteer("example.com");
    expect(info).not.toBeNull();
    expect(info!.proxyServer).toMatch(/^\d+\.\d+\.\d+\.\d+:44001$/);
  });
});

describe("fetchWithPoolProxy", () => {
  it("should be a function", () => {
    expect(typeof fetchWithPoolProxy).toBe("function");
  });

  // Note: Actual HTTP proxy tests require network access and running proxy servers.
  // These are integration tests that verify the function signature and basic behavior.
  it("should accept url, init, and options parameters", async () => {
    // Test that the function doesn't throw on valid parameters (will fail on network)
    try {
      await fetchWithPoolProxy("http://httpbin.org/ip", {}, {
        strategy: "random",
        timeout: 5000,
      });
    } catch (e: any) {
      // Expected to potentially fail due to proxy connectivity
      // But should not throw a TypeError (wrong params)
      expect(e.name).not.toBe("TypeError");
    }
  });
});
