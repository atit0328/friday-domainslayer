/**
 * Orchestrator SSE — Real-time event streaming for AI Command Center
 * 
 * Event Bus Pattern:
 *   orchestratorBus.emit("event_type", payload)  →  SSE stream  →  Browser EventSource
 * 
 * Endpoint: GET /api/sse/orchestrator
 * Auth: Cookie-based (same as tRPC)
 */
import type { Express, Request, Response } from "express";
import { EventEmitter } from "events";

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
  private readonly MAX_RECENT = 50;

  emit(type: string, data?: Record<string, unknown>): boolean {
    const event: OrchestratorEvent = {
      type: type as OrchestratorEventType,
      timestamp: Date.now(),
      data: data || {},
    };
    
    // Keep recent events buffer for new connections
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.MAX_RECENT) {
      this.recentEvents = this.recentEvents.slice(-this.MAX_RECENT);
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

// ─── SSE Client Management ──────────────────────────────────────
interface SSEClient {
  id: string;
  res: Response;
  connectedAt: number;
}

const clients = new Map<string, SSEClient>();

function generateClientId(): string {
  return `sse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function broadcastToClients(event: OrchestratorEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  const disconnected: string[] = [];
  
  clients.forEach((client, id) => {
    try {
      client.res.write(payload);
    } catch {
      disconnected.push(id);
    }
  });
  
  // Clean up disconnected clients
  disconnected.forEach(id => clients.delete(id));
}

// Listen for all events and broadcast
orchestratorBus.on("sse_event", (event: OrchestratorEvent) => {
  broadcastToClients(event);
});

// ─── Express SSE Endpoint ────────────────────────────────────────
export function registerOrchestratorSSE(app: Express): void {
  app.get("/api/sse/orchestrator", (req: Request, res: Response) => {
    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",     // Disable nginx buffering
      "Access-Control-Allow-Origin": "*",
    });

    const clientId = generateClientId();
    
    // Register client
    clients.set(clientId, {
      id: clientId,
      res,
      connectedAt: Date.now(),
    });

    // Send connection confirmation
    const connectEvent: OrchestratorEvent = {
      type: "state_changed",
      timestamp: Date.now(),
      data: {
        message: "Connected to AI Command Center stream",
        clientId,
        activeClients: clients.size,
      },
    };
    res.write(`data: ${JSON.stringify(connectEvent)}\n\n`);

    // Send recent events so new clients catch up
    const recent = orchestratorBus.getRecentEvents();
    if (recent.length > 0) {
      const replayEvent = {
        type: "metrics_update" as OrchestratorEventType,
        timestamp: Date.now(),
        data: {
          replay: true,
          events: recent.slice(-10), // Last 10 events only
        },
      };
      res.write(`data: ${JSON.stringify(replayEvent)}\n\n`);
    }

    // Heartbeat every 15s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeat);
        clients.delete(clientId);
      }
    }, 15_000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(clientId);
    });
  });

  // Stats endpoint for monitoring
  app.get("/api/sse/orchestrator/stats", (_req: Request, res: Response) => {
    res.json({
      activeClients: clients.size,
      recentEventsBuffered: orchestratorBus.getRecentEvents().length,
      clients: Array.from(clients.entries()).map(([, c]) => ({
        id: c.id,
        connectedAt: c.connectedAt,
        connectedFor: `${Math.round((Date.now() - c.connectedAt) / 1000)}s`,
      })),
    });
  });
}

// ─── Helper Functions for Emitting Events ────────────────────────
// These are called from master-orchestrator.ts

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
