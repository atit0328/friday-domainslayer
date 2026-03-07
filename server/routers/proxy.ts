/**
 * Proxy Management Router — tRPC procedures for proxy pool management
 * 
 * Provides:
 * - getStats: Get pool statistics (total, healthy, unhealthy, latency, success rate)
 * - getAll: Get all proxy entries with full details
 * - healthCheckSample: Quick health check on a sample of proxies
 * - healthCheckAll: Full health check on all 50 proxies
 * - testSingle: Test a single proxy by ID
 * - resetStats: Reset all proxy statistics
 * - getSchedulerStatus: Get health check scheduler status
 */

import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { proxyPool, type ProxyEntry } from "../proxy-pool";
import { sendTelegramNotification } from "../telegram-notifier";

// ─── Scheduler State ───

interface SchedulerState {
  running: boolean;
  intervalMs: number;
  lastRun: number | null;
  nextRun: number | null;
  totalRuns: number;
  lastResult: {
    checked: number;
    healthy: number;
    unhealthy: number;
  } | null;
}

let schedulerState: SchedulerState = {
  running: false,
  intervalMs: 30 * 60 * 1000, // 30 minutes
  lastRun: null,
  nextRun: null,
  totalRuns: 0,
  lastResult: null,
};

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

// ─── Health Check Runner ───

async function runHealthCheck(sampleSize?: number): Promise<{
  checked: number;
  healthy: number;
  unhealthy: number;
  results: Array<{ label: string; ok: boolean; latencyMs: number; ip?: string }>;
}> {
  const result = await proxyPool.healthCheckAll(sampleSize);
  schedulerState.lastRun = Date.now();
  schedulerState.totalRuns++;
  schedulerState.lastResult = {
    checked: result.checked,
    healthy: result.healthy,
    unhealthy: result.unhealthy,
  };
  if (schedulerState.running) {
    schedulerState.nextRun = Date.now() + schedulerState.intervalMs;
  }
  return result;
}

// ─── Start/Stop Scheduler ───

export function startProxyScheduler(intervalMs = 30 * 60 * 1000) {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerState.intervalMs = intervalMs;
  schedulerState.running = true;
  schedulerState.nextRun = Date.now() + intervalMs;

  schedulerTimer = setInterval(async () => {
    console.log("[ProxyScheduler] Running scheduled health check...");
    try {
      const result = await runHealthCheck();
      console.log(`[ProxyScheduler] Health check complete: ${result.healthy}/${result.checked} healthy`);
      // Send Telegram alert if unhealthy proxies detected
      if (result.unhealthy > 0) {
        const unhealthyList = result.results.filter(r => !r.ok).map(r => r.label).join(", ");
        await sendTelegramNotification({
          type: "info",
          targetUrl: "proxy-health-check",
          details: `[Proxy Alert] ${result.unhealthy}/${result.checked} unhealthy\nHealthy: ${result.healthy} | Unhealthy: ${result.unhealthy}\nDown: ${unhealthyList}`,
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[ProxyScheduler] Health check failed:", err);
    }
  }, intervalMs);

  console.log(`[ProxyScheduler] Started — checking every ${intervalMs / 60000} minutes`);
}

export function stopProxyScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  schedulerState.running = false;
  schedulerState.nextRun = null;
  console.log("[ProxyScheduler] Stopped");
}

// ─── Router ───

export const proxyRouter = router({
  /**
   * Get pool statistics summary
   */
  getStats: adminProcedure.query(() => {
    return {
      ...proxyPool.getStats(),
      scheduler: schedulerState,
    };
  }),

  /**
   * Get all proxy entries with full details
   */
  getAll: adminProcedure.query(() => {
    return proxyPool.getAllProxies().map((p: ProxyEntry) => ({
      id: p.id,
      ip: p.ip,
      port: p.port,
      label: p.label,
      healthy: p.healthy,
      lastChecked: p.lastChecked,
      successCount: p.successCount,
      failCount: p.failCount,
      avgLatencyMs: p.avgLatencyMs,
      lastUsed: p.lastUsed,
      currentTarget: p.currentTarget,
      successRate: (p.successCount + p.failCount) > 0
        ? Math.round((p.successCount / (p.successCount + p.failCount)) * 100)
        : 100,
    }));
  }),

  /**
   * Quick health check on a sample of proxies (default 10)
   */
  healthCheckSample: adminProcedure
    .input(z.object({ sampleSize: z.number().min(1).max(50).default(10) }).optional())
    .mutation(async ({ input }) => {
      const sampleSize = input?.sampleSize ?? 10;
      return runHealthCheck(sampleSize);
    }),

  /**
   * Full health check on all 50 proxies
   */
  healthCheckAll: adminProcedure.mutation(async () => {
    return runHealthCheck();
  }),

  /**
   * Test a single proxy by ID
   */
  testSingle: adminProcedure
    .input(z.object({ proxyId: z.number() }))
    .mutation(async ({ input }) => {
      const proxy = proxyPool.getAllProxies().find(p => p.id === input.proxyId);
      if (!proxy) {
        return { ok: false, latencyMs: 0, ip: undefined as string | undefined };
      }
      const result = await proxyPool.checkProxy(proxy);
      return { ok: result.ok, latencyMs: result.latencyMs, ip: result.ip };
    }),

  /**
   * Reset all proxy statistics
   */
  resetStats: adminProcedure.mutation(() => {
    proxyPool.resetStats();
    return { success: true, message: "All proxy stats reset" };
  }),

  /**
   * Get scheduler status
   */
  getSchedulerStatus: adminProcedure.query(() => {
    return schedulerState;
  }),

  /**
   * Start/stop scheduler
   */
  toggleScheduler: adminProcedure
    .input(z.object({ enabled: z.boolean(), intervalMinutes: z.number().min(5).max(1440).optional() }))
    .mutation(({ input }) => {
      if (input.enabled) {
        const intervalMs = (input.intervalMinutes ?? 30) * 60 * 1000;
        startProxyScheduler(intervalMs);
        return { running: true, intervalMs };
      } else {
        stopProxyScheduler();
        return { running: false, intervalMs: 0 };
      }
    }),
});
