/**
 * useOrchestratorSSE — Real-time event hook for AI Command Center
 * 
 * Connects to /api/sse/orchestrator and provides:
 * - Live event stream from the orchestrator
 * - Connection status (connected/disconnected/reconnecting)
 * - Auto-reconnect with exponential backoff
 * - tRPC query invalidation on relevant events
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";

// ─── Types ─────────────────────────────────────────
export type OrchestratorEventType =
  | "state_changed"
  | "cycle_start"
  | "cycle_phase"
  | "cycle_complete"
  | "cycle_error"
  | "task_queued"
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "decision_made"
  | "metrics_update"
  | "subsystem_update";

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

export type SSEConnectionStatus = "connected" | "disconnected" | "reconnecting";

interface UseOrchestratorSSEOptions {
  /** Enable/disable the SSE connection */
  enabled?: boolean;
  /** Max number of events to keep in the buffer */
  maxEvents?: number;
  /** Callback for each event */
  onEvent?: (event: OrchestratorEvent) => void;
}

interface UseOrchestratorSSEReturn {
  /** Current connection status */
  status: SSEConnectionStatus;
  /** Buffer of recent events */
  events: OrchestratorEvent[];
  /** Latest event received */
  latestEvent: OrchestratorEvent | null;
  /** Current OODA cycle phase (if running) */
  currentPhase: string | null;
  /** Current cycle number */
  currentCycle: number | null;
  /** Whether an OODA cycle is currently running */
  isCycleRunning: boolean;
  /** Live activity feed messages */
  activityFeed: ActivityMessage[];
  /** Clear the event buffer */
  clearEvents: () => void;
}

export interface ActivityMessage {
  id: string;
  timestamp: number;
  type: "info" | "success" | "warning" | "error" | "phase";
  icon: string;
  message: string;
  details?: string;
}

// ─── Hook ──────────────────────────────────────────
export function useOrchestratorSSE(
  options: UseOrchestratorSSEOptions = {}
): UseOrchestratorSSEReturn {
  const { enabled = true, maxEvents = 100, onEvent } = options;

  const [status, setStatus] = useState<SSEConnectionStatus>("disconnected");
  const [events, setEvents] = useState<OrchestratorEvent[]>([]);
  const [latestEvent, setLatestEvent] = useState<OrchestratorEvent | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [currentCycle, setCurrentCycle] = useState<number | null>(null);
  const [isCycleRunning, setIsCycleRunning] = useState(false);
  const [activityFeed, setActivityFeed] = useState<ActivityMessage[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const utils = trpc.useUtils();

  // ─── Activity Feed Helper ───
  const addActivity = useCallback((msg: Omit<ActivityMessage, "id">) => {
    const activity: ActivityMessage = {
      ...msg,
      id: `${msg.timestamp}_${Math.random().toString(36).slice(2, 6)}`,
    };
    setActivityFeed(prev => {
      const next = [activity, ...prev];
      return next.length > 50 ? next.slice(0, 50) : next;
    });
  }, []);

  // ─── Event Handler ───
  const handleEvent = useCallback(
    (event: OrchestratorEvent) => {
      // Update event buffer
      setEvents(prev => {
        const next = [...prev, event];
        return next.length > maxEvents ? next.slice(-maxEvents) : next;
      });
      setLatestEvent(event);

      // Call external handler
      onEventRef.current?.(event);

      // Process event type
      switch (event.type) {
        case "state_changed": {
          const state = event.data.state as string;
          addActivity({
            timestamp: event.timestamp,
            type: state === "running" ? "success" : state === "error" ? "error" : "info",
            icon: state === "running" ? "🚀" : state === "stopped" ? "⏹" : state === "paused" ? "⏸" : "⚠️",
            message: `Orchestrator ${state}`,
            details: event.data.message as string,
          });
          // Invalidate state query
          utils.orchestrator.getState.invalidate();
          break;
        }

        case "cycle_start": {
          const cycle = event.data.cycle as number;
          setCurrentCycle(cycle);
          setIsCycleRunning(true);
          setCurrentPhase("observe");
          addActivity({
            timestamp: event.timestamp,
            type: "info",
            icon: "🔄",
            message: `OODA Cycle #${cycle} started`,
          });
          break;
        }

        case "cycle_phase": {
          const phase = event.data.phase as string;
          setCurrentPhase(phase);
          addActivity({
            timestamp: event.timestamp,
            type: "phase",
            icon: phase === "observe" ? "👁" : phase === "orient" ? "🧭" : phase === "decide" ? "🧠" : "⚡",
            message: `Phase: ${phase.toUpperCase()}`,
            details: event.data.message as string,
          });
          break;
        }

        case "cycle_complete": {
          setIsCycleRunning(false);
          setCurrentPhase(null);
          const { duration, tasksCreated, decisionsCount } = event.data;
          addActivity({
            timestamp: event.timestamp,
            type: "success",
            icon: "✅",
            message: `Cycle #${event.data.cycle} complete — ${decisionsCount} decisions, ${tasksCreated} tasks (${duration}s)`,
          });
          // Invalidate all queries to refresh data
          utils.orchestrator.getState.invalidate();
          utils.orchestrator.getTaskQueue.invalidate();
          utils.orchestrator.getDecisions.invalidate();
          utils.orchestrator.getMetrics.invalidate();
          break;
        }

        case "cycle_error": {
          setIsCycleRunning(false);
          setCurrentPhase(null);
          addActivity({
            timestamp: event.timestamp,
            type: "error",
            icon: "❌",
            message: `Cycle error: ${event.data.error}`,
          });
          utils.orchestrator.getState.invalidate();
          break;
        }

        case "task_queued":
          addActivity({
            timestamp: event.timestamp,
            type: "info",
            icon: "📋",
            message: `Task queued: ${event.data.title || event.data.taskType}`,
          });
          utils.orchestrator.getTaskQueue.invalidate();
          break;

        case "task_started":
          addActivity({
            timestamp: event.timestamp,
            type: "info",
            icon: "▶️",
            message: `Task started: ${event.data.taskType}`,
            details: `Task #${event.data.taskId}`,
          });
          utils.orchestrator.getTaskQueue.invalidate();
          break;

        case "task_completed":
          addActivity({
            timestamp: event.timestamp,
            type: "success",
            icon: "✔️",
            message: `Task completed: ${event.data.taskType}`,
            details: `Task #${event.data.taskId}`,
          });
          utils.orchestrator.getTaskQueue.invalidate();
          utils.orchestrator.getMetrics.invalidate();
          break;

        case "task_failed":
          addActivity({
            timestamp: event.timestamp,
            type: "error",
            icon: "💥",
            message: `Task failed: ${event.data.taskType}`,
            details: event.data.error as string,
          });
          utils.orchestrator.getTaskQueue.invalidate();
          break;

        case "decision_made":
          addActivity({
            timestamp: event.timestamp,
            type: "info",
            icon: "🧠",
            message: `Decision: [${event.data.subsystem}] ${event.data.action}`,
            details: `${event.data.confidence}% confidence — ${event.data.reasoning}`,
          });
          utils.orchestrator.getDecisions.invalidate();
          break;

        case "metrics_update":
          utils.orchestrator.getMetrics.invalidate();
          utils.orchestrator.getState.invalidate();
          break;

        case "subsystem_update":
          addActivity({
            timestamp: event.timestamp,
            type: "info",
            icon: "🔧",
            message: `Subsystem update: ${event.data.subsystem}`,
          });
          break;
      }
    },
    [maxEvents, addActivity, utils]
  );

  // ─── SSE Connection ───
  useEffect(() => {
    if (!enabled) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setStatus("disconnected");
      return;
    }

    function connect() {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource("/api/sse/orchestrator");
      eventSourceRef.current = es;

      es.onopen = () => {
        setStatus("connected");
        reconnectAttemptsRef.current = 0;
      };

      es.onmessage = (e) => {
        try {
          const event: OrchestratorEvent = JSON.parse(e.data);
          handleEvent(event);
        } catch {
          // Ignore parse errors (heartbeats, etc.)
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        setStatus("reconnecting");

        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      };
    }

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setStatus("disconnected");
    };
  }, [enabled, handleEvent]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLatestEvent(null);
    setActivityFeed([]);
  }, []);

  return {
    status,
    events,
    latestEvent,
    currentPhase,
    currentCycle,
    isCycleRunning,
    activityFeed,
    clearEvents,
  };
}
