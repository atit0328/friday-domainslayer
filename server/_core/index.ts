import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerOneClickSSE } from "../oneclick-sse";
import { registerAutonomousSSE } from "../autonomous-sse";
import { registerOrchestratorSSE } from "../orchestrator-sse";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startScheduler } from "../seo-scheduler";
import { startProxyScheduler } from "../routers/proxy";
import { startScanScheduler } from "../scan-scheduler";
import { startCveScheduler } from "../cve-scheduler";
import { startLearningScheduler } from "../learning-scheduler";
import { startDaemon } from "../background-daemon";
import { startOrchestrator } from "../agentic-auto-orchestrator";
import { startSeoOrchestrator } from "../seo-orchestrator";
import { registerTelegramWebhook, setupTelegramWebhook, startTelegramWebhookMode, startTelegramPolling, startDailySummaryScheduler, stopTelegramPolling, stopDailySummaryScheduler, getRunningAttacks, abortAllRunningAttacks, resumePendingAttacks } from "../telegram-ai-agent";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // SSE streaming for one-click deploy
  registerOneClickSSE(app);
  // SSE streaming for Autonomous Friday
  registerAutonomousSSE(app);
  // SSE streaming for AI Command Center (real-time orchestrator events)
  registerOrchestratorSSE(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  
  // ═══ Register Telegram webhook endpoint BEFORE SPA fallback ═══
  // This must come before serveStatic() which has a catch-all SPA fallback
  // that would intercept webhook POST requests
  if (process.env.NODE_ENV !== "development") {
    registerTelegramWebhook(app);
    console.log("[Server] 🔗 Telegram webhook endpoint registered (before SPA fallback)");
  }
  
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    
    // ═══════════════════════════════════════════════════════
    // ENVIRONMENT GUARD: Dev vs Production services
    // Dev server (sandbox) runs ONLY lightweight services (SEO scheduler, proxy check)
    // Production runs ALL services including Telegram bot, AI agents, heavy schedulers
    // This prevents: bot conflicts, LLM quota competition, duplicate background tasks
    // ═══════════════════════════════════════════════════════
    const isDev = process.env.NODE_ENV === "development";
    
    // Lightweight services — safe to run in both dev and production
    startScheduler();
    startProxyScheduler(30 * 60 * 1000);
    
    if (isDev) {
      console.log("[Server] ⚠️ DEV MODE — Running only lightweight services (SEO scheduler, proxy check)");
      console.log("[Server] ⚠️ DEV MODE — Skipping: Telegram bot, orchestrators, AI agents, CVE/Learning schedulers, Daemon");
    } else {
      // ═══ PRODUCTION-ONLY: Heavy background services ═══
      // These consume LLM quota and must not run in dev
      startScanScheduler();
      console.log("[Server] 🔍 Vulnerability Scan Scheduler initialized");
      startCveScheduler();
      console.log("[Server] 🛡️ CVE Auto-Update Scheduler initialized");
      startLearningScheduler();
      console.log("[Server] 🧠 Adaptive Learning Scheduler initialized");
      startDaemon();
      console.log("[Server] ⚙️ Background Daemon initialized");
      
      // ═══ PRODUCTION-ONLY: Telegram bot (WEBHOOK MODE) + AI agents ═══
      // Webhook mode = zero conflict risk, no polling loop, instant response
      // Telegram pushes updates to our /api/telegram/webhook endpoint
      const STARTUP_DELAY = 10_000; // 10s delay to let Express fully initialize
      console.log(`[Server] ⏳ PRODUCTION — Starting Telegram webhook + AI agents in ${STARTUP_DELAY / 1000}s...`);
      setTimeout(async () => {
        try {
          // Start orchestrators first (they don't conflict)
          startOrchestrator();
          console.log("[Server] 🤖 Agentic Auto Orchestrator initialized");
          startSeoOrchestrator();
          console.log("[Server] 🧠 SEO Orchestrator brain initialized");
          
          // Set webhook URL with Telegram API (endpoint already registered above)
          // This tells Telegram to push updates to our /api/telegram/webhook endpoint
          const WEBHOOK_DOMAINS = [
            "domainslayer.ai",
            "www.domainslayer.ai", 
            "fridayai-5qwxsxug.manus.space",
          ];
          const webhookUrl = `https://${WEBHOOK_DOMAINS[0]}/api/telegram/webhook`;
          console.log(`[Server] 🔗 Setting Telegram webhook to: ${webhookUrl}`);
          const webhookResult = await setupTelegramWebhook(webhookUrl);
          if (webhookResult.success) {
            console.log("[Server] 💬 Telegram AI Chat Agent initialized (WEBHOOK MODE)");
          } else {
            console.error(`[Server] ❌ Webhook setup failed: ${webhookResult.error}`);
            console.log("[Server] ⚠️ Webhook setup failed but endpoint is registered — webhook can be set manually from sandbox");
            // NO POLLING FALLBACK — polling causes 409 conflicts with webhook
            // If webhook setup fails, set it manually: node -e 'fetch("https://api.telegram.org/bot<TOKEN>/setWebhook", ...)'
          }
          
          startDailySummaryScheduler();
          console.log("[Server] 📅 Daily Summary Scheduler initialized");
          
          // Resume any pending attacks that were interrupted by SIGTERM
          setTimeout(async () => {
            try {
              await resumePendingAttacks();
            } catch (e: any) {
              console.warn(`[Server] ⚠️ Attack resume check failed: ${e.message}`);
            }
          }, 15_000); // Wait 15s after startup before checking
          
          console.log("[Server] ✅ All production services started successfully");
        } catch (err: any) {
          console.error(`[Server] ❌ Error starting production services: ${err.message}`);
        }
      }, STARTUP_DELAY);
    }
  });
}

startServer().catch(console.error);

// ═══ PROCESS-LEVEL CRASH HANDLERS ═══
// Catch unhandled rejections and uncaught exceptions to prevent silent crashes
// Send crash notification to Telegram so we know when the process dies
async function sendCrashNotification(type: string, error: any): Promise<void> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;
    
    const errMsg = error?.message || String(error);
    const stack = error?.stack?.substring(0, 500) || "no stack";
    const text = `🚨 PROCESS CRASH (${type})\n\n` +
      `⚠️ ${errMsg.substring(0, 200)}\n\n` +
      `📋 Stack:\n${stack}\n\n` +
      `🕐 ${new Date().toISOString()}`;
    
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* last resort — can't do anything */ }
}

process.on("unhandledRejection", async (reason: any) => {
  console.error("[Server] ⚠️ Unhandled Promise Rejection:", reason);
  await sendCrashNotification("unhandledRejection", reason);
  // Don't exit — let the process continue running
  // The attack might have failed but other functionality should keep working
});

process.on("uncaughtException", async (error: Error) => {
  console.error("[Server] 🚨 Uncaught Exception:", error);
  await sendCrashNotification("uncaughtException", error);
  // For uncaught exceptions, we should exit as the process state may be corrupted
  // But give time for the notification to send
  setTimeout(() => process.exit(1), 2000);
});

// Graceful shutdown — cleanup on process termination
process.on("SIGTERM", async () => {
  console.log("[Server] SIGTERM received, cleaning up...");
  
  // Abort all running attacks gracefully — this triggers their catch blocks
  // which will save partial results to DB and notify via Telegram
  const runningAttacks = getRunningAttacks();
  if (runningAttacks.length > 0) {
    console.log(`[Server] Aborting ${runningAttacks.length} running attacks before shutdown...`);
    abortAllRunningAttacks("SIGTERM");
    // Give attacks 3s to save their state before we exit
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  const mem = process.memoryUsage();
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  await sendCrashNotification("SIGTERM", new Error(
    `Process received SIGTERM — RSS: ${rssMB}MB, Heap: ${heapMB}MB` +
    (runningAttacks.length > 0 ? ` | ${runningAttacks.length} attacks aborted: ${runningAttacks.map(a => a.domain).join(", ")}` : " | No active attacks")
  ));
  stopTelegramPolling();
  stopDailySummaryScheduler();
  setTimeout(() => process.exit(0), 2000);
});
process.on("SIGINT", async () => {
  console.log("[Server] SIGINT received, cleaning up...");
  await sendCrashNotification("SIGINT", new Error("Process received SIGINT"));
  stopTelegramPolling();
  stopDailySummaryScheduler();
  setTimeout(() => process.exit(0), 2000);
});

// ═══ MEMORY MONITORING + AUTO-CLEANUP WATCHDOG ═══
// Log memory usage every 60s, auto-destroy native resources when RSS is high
let lastMemWarningTime = 0;
setInterval(async () => {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const externalMB = Math.round(mem.external / 1024 / 1024);
  
  // Log memory stats periodically
  console.log(`[Memory] RSS: ${rssMB}MB | Heap: ${heapUsedMB}/${heapTotalMB}MB | External: ${externalMB}MB`);
  
  // ═══ AGGRESSIVE MEMORY RELIEF AT 180MB RSS ═══
  // Platform kills at ~350MB. The #1 memory consumer is native TLS buffers
  // from undici ProxyAgent instances that GC cannot reclaim.
  // We must destroy them proactively even when no attack is running.
  // Lowered from 220 to 180 because baseline RSS is already ~200MB from 5.6MB bundle
  if (rssMB > 180) {
    try {
      const { destroyAllSharedAgents, getSharedAgentStats } = await import("../proxy-pool");
      const stats = getSharedAgentStats();
      if (stats.poolSize > 0) {
        const destroyed = await destroyAllSharedAgents();
        console.log(`[Memory] 🧹 Auto-destroyed ${destroyed} shared agents (RSS: ${rssMB}MB)`);
      }
    } catch (e) {
      // proxy-pool may not be loaded yet
    }
    
    // Force GC after destroying agents
    if (global.gc) {
      global.gc();
      await new Promise(r => setTimeout(r, 200));
      global.gc();
    }
    
    const afterCleanup = process.memoryUsage();
    const afterRSS = Math.round(afterCleanup.rss / 1024 / 1024);
    const freedMB = rssMB - afterRSS;
    if (freedMB > 2) {
      console.log(`[Memory] Cleanup freed ${freedMB}MB (RSS: ${afterRSS}MB)`);
    }
  }
  
  // Warn when RSS exceeds 280MB (lower threshold for earlier warning)
  if (rssMB > 280 && Date.now() - lastMemWarningTime > 120_000) {
    lastMemWarningTime = Date.now();
    console.warn(`[Memory] ⚠️ HIGH MEMORY: RSS ${rssMB}MB`);
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (token && chatId) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `⚠️ Memory Warning\n\nRSS: ${rssMB}MB\nHeap: ${heapUsedMB}/${heapTotalMB}MB\nExternal: ${externalMB}MB\n\n🧹 Auto-cleanup triggered: destroyed shared agents + forced GC`,
          }),
          signal: AbortSignal.timeout(5000),
        });
      }
    } catch {}
  }
}, 30_000); // Check every 30s instead of 60s for faster memory relief
