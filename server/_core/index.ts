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
import { registerTelegramWebhook, startTelegramPolling, startDailySummaryScheduler } from "../telegram-ai-agent";

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
  // Telegram AI Chat Agent webhook (disabled at startup — only register when webhook URL is explicitly set via tRPC)
  // registerTelegramWebhook(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
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
      
      // ═══ PRODUCTION-ONLY: Telegram bot + AI agents ═══
      // Wait 30s before starting to let old instance die during deploy
      const TELEGRAM_STARTUP_DELAY = 30_000;
      console.log(`[Server] ⏳ PRODUCTION — Waiting ${TELEGRAM_STARTUP_DELAY / 1000}s before starting Telegram bot and autonomous agents...`);
      setTimeout(() => {
        startOrchestrator();
        console.log("[Server] 🤖 Agentic Auto Orchestrator initialized");
        startSeoOrchestrator();
        console.log("[Server] 🧠 SEO Orchestrator brain initialized");
        startTelegramPolling();
        console.log("[Server] 💬 Telegram AI Chat Agent initialized");
        startDailySummaryScheduler();
        console.log("[Server] 📅 Daily Summary Scheduler initialized");
      }, TELEGRAM_STARTUP_DELAY);
    }
  });
}

startServer().catch(console.error);

// Graceful shutdown — stop polling on tsx watch restart to prevent duplicate instances
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, cleaning up...");
  import("../telegram-ai-agent").then(m => {
    m.stopTelegramPolling();
    m.stopDailySummaryScheduler();
  }).catch(() => {});
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("[Server] SIGINT received, cleaning up...");
  import("../telegram-ai-agent").then(m => {
    m.stopTelegramPolling();
    m.stopDailySummaryScheduler();
  }).catch(() => {});
  process.exit(0);
});
