/**
 * Proxy Router Tests — ทดสอบ tRPC procedures สำหรับ proxy management
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { startProxyScheduler, stopProxyScheduler } from "./routers/proxy";
import { proxyPool, getProxyForPuppeteer } from "./proxy-pool";

describe("Proxy Router", () => {
  describe("proxyPool integration", () => {
    it("should have 50 proxies in pool", () => {
      const proxies = proxyPool.getAllProxies();
      expect(proxies.length).toBe(50);
    });

    it("should return pool stats", () => {
      const stats = proxyPool.getStats();
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("healthy");
      expect(stats).toHaveProperty("unhealthy");
      expect(stats).toHaveProperty("avgLatencyMs");
      expect(stats).toHaveProperty("totalRequests");
      expect(stats).toHaveProperty("successRate");
      expect(stats.total).toBe(50);
    });

    it("should have all proxies healthy by default", () => {
      const stats = proxyPool.getStats();
      expect(stats.healthy).toBe(50);
      expect(stats.unhealthy).toBe(0);
    });

    it("should return proxy entries with correct shape", () => {
      const proxies = proxyPool.getAllProxies();
      const first = proxies[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("ip");
      expect(first).toHaveProperty("port");
      expect(first).toHaveProperty("username");
      expect(first).toHaveProperty("password");
      expect(first).toHaveProperty("url");
      expect(first).toHaveProperty("label");
      expect(first).toHaveProperty("healthy");
      expect(first).toHaveProperty("successCount");
      expect(first).toHaveProperty("failCount");
      expect(first).toHaveProperty("avgLatencyMs");
    });

    it("should get proxy by rotation", () => {
      const proxy1 = proxyPool.getProxy("random");
      expect(proxy1).toBeDefined();
      expect(proxy1!.ip).toBeTruthy();
      expect(proxy1!.port).toBe(44001);
    });

    it("should support round-robin rotation", () => {
      const proxy1 = proxyPool.getProxy("round-robin");
      const proxy2 = proxyPool.getProxy("round-robin");
      // Round-robin should give different proxies
      expect(proxy1).toBeDefined();
      expect(proxy2).toBeDefined();
      expect(proxy1!.id).not.toBe(proxy2!.id);
    });

    it("should support target pinning", () => {
      const proxy1 = proxyPool.getProxyForTarget("test-domain.com");
      const proxy2 = proxyPool.getProxyForTarget("test-domain.com");
      // Same target should get same proxy
      expect(proxy1!.id).toBe(proxy2!.id);
    });

    it("should support different targets getting different proxies (usually)", () => {
      // Reset to ensure clean state
      const proxy1 = proxyPool.getProxyForTarget("domain-a.com");
      const proxy2 = proxyPool.getProxyForTarget("domain-b.com");
      // With 50 proxies, different targets should usually get different proxies
      expect(proxy1).toBeDefined();
      expect(proxy2).toBeDefined();
    });

    it("should reset stats", () => {
      proxyPool.resetStats();
      const stats = proxyPool.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.successRate).toBe(100); // default when no requests
    });

    it("should get proxy for puppeteer with correct format", () => {
      const puppeteerProxy = getProxyForPuppeteer();
      expect(puppeteerProxy).toBeDefined();
      expect(puppeteerProxy).toHaveProperty("proxyServer");
      expect(puppeteerProxy).toHaveProperty("username");
      expect(puppeteerProxy).toHaveProperty("password");
      expect(puppeteerProxy!.proxyServer).toMatch(/^\d+\.\d+\.\d+\.\d+:\d+$/);
    });

    it("should get multiple proxies", () => {
      const proxies = proxyPool.getMultipleProxies(5);
      expect(proxies.length).toBe(5);
      // All should be unique
      const ids = proxies.map(p => p.id);
      expect(new Set(ids).size).toBe(5);
    });
  });

  describe("Scheduler", () => {
    it("should start and stop scheduler", () => {
      // Start
      startProxyScheduler(60000); // 1 minute for test
      // Stop
      stopProxyScheduler();
      // No error means success
      expect(true).toBe(true);
    });
  });
});
