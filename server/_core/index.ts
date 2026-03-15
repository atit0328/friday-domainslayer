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
    // Start SEO scheduler for weekly auto-run
    startScheduler();
    // Start proxy health check scheduler (every 30 minutes)
    startProxyScheduler(30 * 60 * 1000);
    // Start vulnerability scan scheduler (every 15 minutes)
    startScanScheduler();
    // Start CVE auto-update scheduler (daily at 03:00 UTC)
    startCveScheduler();
    // Start adaptive learning scheduler (every 6 hours)
    startLearningScheduler();
    // Start background daemon (persistent task queue)
    startDaemon();
    // Start agentic auto orchestrator (attack agent is DISABLED by default — use /daemon on attack to enable)
    setTimeout(() => {
      startOrchestrator();
      console.log("[Server] 🤖 Agentic Auto Orchestrator initialized");
      // Start SEO Orchestrator brain (autonomous 7-day sprint engine)
      startSeoOrchestrator();
      console.log("[Server] 🧠 SEO Orchestrator brain initialized");
      // Start Telegram AI Chat Agent (polling mode)
      startTelegramPolling();
      console.log("[Server] 💬 Telegram AI Chat Agent initialized");
      // Start Daily Summary Scheduler (8:00 AM Bangkok time)
      startDailySummaryScheduler();
      console.log("[Server] 📅 Daily Summary Scheduler initialized");
    }, 10_000); // 10s delay to let other services stabilize
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
