/**
 * Orchestrator SSE — Real-time event streaming for AI Command Center
 * 
 * Performance optimizations:
 *   - Event throttling: batches events within 250ms window before sending
 *   - Connection limit: max 20 concurrent SSE clients (prevents resource exhaustion)
 *   - Per-user dedup: max 3 connections per user (prevents tab-spam)
 *   - Heartbeat: 30s interval (reduced from 15s to halve keep-alive traffic)
 *   - Event buffer: last 50 events for new client catch-up
 *   - Auto-cleanup: stale connections removed every 60s
 * 
 * Endpoint: GET /api/sse/orchestrator
 * Auth: Cookie-based (same as tRPC)
 */
import type { Express, Request, Response } from "express";
import { EventEmitter } from "events";

// ─── Configuration ──────────────────────────────────────────────
const SSE_CONFIG = {
  MAX_CLIENTS: 20,              // Max total concurrent SSE connections
  MAX_PER_USER: 3,              // Max connections per user (prevents tab spam)
  HEARTBEAT_INTERVAL: 30_000,   // 30s heartbeat (was 15s)
  THROTTLE_WINDOW: 250,         // Batch events within 250ms window
  MAX_RECENT_EVENTS: 50,        // Buffer for new client catch-up
  REPLAY_COUNT: 10,             // Events to replay on connect
  STALE_CHECK_INTERVAL: 60_000, // Check for stale connections every 60s
  STALE_TIMEOUT: 5 * 60_000,    // Consider connection stale after 5 min without write
} as const;

// ─── Event Types ─────────────────────────────────────────────────
export type OrchestratorEventType =
  | "state_changed"       // orchestrator started/stopped/paused
  | "cycle_start"         // OODA cycle begins
  | "cycle_phase"         // observe/orient/decide/act phase update
  | "cycle_complete"      // OODA cycle finished
  | "cycle_error"         // OODA cycle failed
  | "task_queued"         // new task added to queue
  | "task_started"        // task execution began
  | "task_completed"      // task finished successfully
  | "task_failed"         // task execution failed
  | "decision_made"       // AI made a decision
  | "metrics_update"      // periodic metrics refresh
  | "subsystem_update";   // subsystem status changed

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

// ─── Global Event Bus ────────────────────────────────────────────
class OrchestratorEventBus extends EventEmitter {
  private recentEvents: OrchestratorEvent[] = [];

  emit(type: string, data?: Record<string, unknown>): boolean {
    const event: OrchestratorEvent = {
      type: type as OrchestratorEventType,
      timestamp: Date.now(),
      data: data || {},
    };
    
    this.recentEvents.push(event);
    if (this.recentEvents.length > SSE_CONFIG.MAX_RECENT_EVENTS) {
      this.recentEvents = this.recentEvents.slice(-SSE_CONFIG.MAX_RECENT_EVENTS);
    }

    return super.emit("sse_event", event);
  }

  getRecentEvents(): OrchestratorEvent[] {
    return [...this.recentEvents];
  }

  clearRecent(): void {
    this.recentEvents = [];
  }
}

export const orchestratorBus = new OrchestratorEventBus();

// ─── SSE Client Management with Throttling ──────────────────────
interface SSEClient {
  id: string;
  userId?: string;
  res: Response;
  connectedAt: number;
  lastWriteAt: number;
  pendingEvents: OrchestratorEvent[];
  flushTimer: ReturnType<typeof setTimeout> | null;
}

const clients = new Map<string, SSEClient>();

function generateClientId(): string {
  return `sse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Count connections for a specific user
 */
function getUserConnectionCount(userId: string): number {
  let count = 0;
  clients.forEach(client => {
    if (client.userId === userId) count++;
  });
  return count;
}

/**
 * Evict oldest connection for a user if over limit
 */
function evictOldestUserConnection(userId: string): void {
  let oldest: { id: string; connectedAt: number } | null = null;
  clients.forEach((client, id) => {
    if (client.userId === userId) {
      if (!oldest || client.connectedAt < oldest.connectedAt) {
        oldest = { id, connectedAt: client.connectedAt };
      }
    }
  });
  if (oldest) {
    const client = clients.get((oldest as { id: string }).id);
    if (client) {
      try {
        client.res.end();
      } catch { /* ignore */ }
      if (client.flushTimer) clearTimeout(client.flushTimer);
      clients.delete((oldest as { id: string }).id);
    }
  }
}

/**
 * Flush pending events for a client (batched write)
 */
function flushClient(client: SSEClient): void {
  if (client.pendingEvents.length === 0) return;
  
  const events = client.pendingEvents.splice(0);
  
  // If multiple events, send as batch
  if (events.length > 1) {
    const batchPayload = `data: ${JSON.stringify({
      type: "metrics_update" as OrchestratorEventType,
      timestamp: Date.now(),
      data: { batch: true, events },
    })}\n\n`;
    try {
      client.res.write(batchPayload);
      client.lastWriteAt = Date.now();
    } catch { /* will be cleaned up */ }
  } else if (events.length === 1) {
    try {
      client.res.write(`data: ${JSON.stringify(events[0])}\n\n`);
      client.lastWriteAt = Date.now();
    } catch { /* will be cleaned up */ }
  }
  
  client.flushTimer = null;
}

/**
 * Queue an event for a client with throttling
 */
function queueEventForClient(client: SSEClient, event: OrchestratorEvent): void {
  client.pendingEvents.push(event);
  
  // If no flush timer, start one
  if (!client.flushTimer) {
    client.flushTimer = setTimeout(() => flushClient(client), SSE_CONFIG.THROTTLE_WINDOW);
  }
}

/**
 * Broadcast event to all clients with throttling
 */
function broadcastToClients(event: OrchestratorEvent): void {
  const disconnected: string[] = [];
  
  clients.forEach((client, id) => {
    try {
      queueEventForClient(client, event);
    } catch {
      disconnected.push(id);
    }
  });
  
  disconnected.forEach(id => {
    const client = clients.get(id);
    if (client?.flushTimer) clearTimeout(client.flushTimer);
    clients.delete(id);
  });
}

// Listen for all events and broadcast
orchestratorBus.on("sse_event", (event: OrchestratorEvent) => {
  broadcastToClients(event);
});

// ─── Stale Connection Cleanup ───────────────────────────────────
let staleCheckTimer: ReturnType<typeof setInterval> | null = null;

function startStaleCheck(): void {
  if (staleCheckTimer) return;
  staleCheckTimer = setInterval(() => {
    const now = Date.now();
    const stale: string[] = [];
    clients.forEach((client, id) => {
      if (now - client.lastWriteAt > SSE_CONFIG.STALE_TIMEOUT) {
        stale.push(id);
      }
    });
    stale.forEach(id => {
      const client = clients.get(id);
      if (client) {
        try { client.res.end(); } catch { /* ignore */ }
        if (client.flushTimer) clearTimeout(client.flushTimer);
        clients.delete(id);
      }
    });
  }, SSE_CONFIG.STALE_CHECK_INTERVAL);
}

// ─── Express SSE Endpoint ────────────────────────────────────────
export function registerOrchestratorSSE(app: Express): void {
  startStaleCheck();

  app.get("/api/sse/orchestrator", (req: Request, res: Response) => {
    // Extract user ID from cookie/session (best-effort)
    const userId = (req as any).cookies?.userId || req.ip || "anonymous";

    // ─── Connection Limits ───
    if (clients.size >= SSE_CONFIG.MAX_CLIENTS) {
      res.status(503).json({
        error: "Too many SSE connections",
        maxClients: SSE_CONFIG.MAX_CLIENTS,
        activeClients: clients.size,
      });
      return;
    }

    // Per-user limit: evict oldest if over limit
    if (getUserConnectionCount(userId) >= SSE_CONFIG.MAX_PER_USER) {
      evictOldestUserConnection(userId);
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    });

    const clientId = generateClientId();
    const now = Date.now();
    
    // Register client
    const client: SSEClient = {
      id: clientId,
      userId,
      res,
      connectedAt: now,
      lastWriteAt: now,
      pendingEvents: [],
      flushTimer: null,
    };
    clients.set(clientId, client);

    // Send connection confirmation
    const connectEvent: OrchestratorEvent = {
      type: "state_changed",
      timestamp: now,
      data: {
        message: "Connected to AI Command Center stream",
        clientId,
        activeClients: clients.size,
      },
    };
    res.write(`data: ${JSON.stringify(connectEvent)}\n\n`);

    // Replay recent events for catch-up
    const recent = orchestratorBus.getRecentEvents();
    if (recent.length > 0) {
      const replayEvent = {
        type: "metrics_update" as OrchestratorEventType,
        timestamp: now,
        data: {
          replay: true,
          events: recent.slice(-SSE_CONFIG.REPLAY_COUNT),
        },
      };
      res.write(`data: ${JSON.stringify(replayEvent)}\n\n`);
    }

    // Heartbeat (30s)
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
        client.lastWriteAt = Date.now();
      } catch {
        clearInterval(heartbeat);
        if (client.flushTimer) clearTimeout(client.flushTimer);
        clients.delete(clientId);
      }
    }, SSE_CONFIG.HEARTBEAT_INTERVAL);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      if (client.flushTimer) clearTimeout(client.flushTimer);
      clients.delete(clientId);
    });
  });

  // Stats endpoint for monitoring
  app.get("/api/sse/orchestrator/stats", (_req: Request, res: Response) => {
    const clientList: Array<{
      id: string;
      userId?: string;
      connectedAt: number;
      connectedFor: string;
      pendingEvents: number;
    }> = [];
    clients.forEach(c => {
      clientList.push({
        id: c.id,
        userId: c.userId,
        connectedAt: c.connectedAt,
        connectedFor: `${Math.round((Date.now() - c.connectedAt) / 1000)}s`,
        pendingEvents: c.pendingEvents.length,
      });
    });
    res.json({
      config: SSE_CONFIG,
      activeClients: clients.size,
      recentEventsBuffered: orchestratorBus.getRecentEvents().length,
      clients: clientList,
    });
  });
}

// ─── Helper Functions for Emitting Events ────────────────────────

export function emitStateChanged(state: string, details?: Record<string, unknown>): void {
  orchestratorBus.emit("state_changed", { state, ...details });
}

export function emitCycleStart(cycle: number): void {
  orchestratorBus.emit("cycle_start", { cycle });
}

export function emitCyclePhase(cycle: number, phase: string, details?: Record<string, unknown>): void {
  orchestratorBus.emit("cycle_phase", { cycle, phase, ...details });
}

export function emitCycleComplete(cycle: number, summary: Record<string, unknown>): void {
  orchestratorBus.emit("cycle_complete", { cycle, ...summary });
}

export function emitCycleError(cycle: number, error: string): void {
  orchestratorBus.emit("cycle_error", { cycle, error });
}

export function emitTaskQueued(task: Record<string, unknown>): void {
  orchestratorBus.emit("task_queued", task);
}

export function emitTaskStarted(taskId: number, taskType: string): void {
  orchestratorBus.emit("task_started", { taskId, taskType });
}

export function emitTaskCompleted(taskId: number, taskType: string, result?: Record<string, unknown>): void {
  orchestratorBus.emit("task_completed", { taskId, taskType, ...result });
}

export function emitTaskFailed(taskId: number, taskType: string, error: string): void {
  orchestratorBus.emit("task_failed", { taskId, taskType, error });
}

export function emitDecisionMade(decision: Record<string, unknown>): void {
  orchestratorBus.emit("decision_made", decision);
}

export function emitMetricsUpdate(metrics: Record<string, unknown>): void {
  orchestratorBus.emit("metrics_update", metrics);
}

export function emitSubsystemUpdate(subsystem: string, status: Record<string, unknown>): void {
  orchestratorBus.emit("subsystem_update", { subsystem, ...status });
}

// ─── Get Active Client Count ─────────────────────────────────────
export function getSSEClientCount(): number {
  return clients.size;
}
