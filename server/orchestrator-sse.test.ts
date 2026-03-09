/**
 * Tests for Orchestrator SSE Event Bus
 * 
 * Tests the event emission functions and the OrchestratorEventBus.
 * Client management is handled internally via Express endpoints,
 * so we test the bus + emit helpers directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  orchestratorBus,
  emitStateChanged,
  emitCycleStart,
  emitCyclePhase,
  emitCycleComplete,
  emitCycleError,
  emitTaskQueued,
  emitTaskStarted,
  emitTaskCompleted,
  emitTaskFailed,
  emitDecisionMade,
  emitMetricsUpdate,
  emitSubsystemUpdate,
  getSSEClientCount,
  type OrchestratorEvent,
} from "./orchestrator-sse";

describe("Orchestrator SSE Event Bus", () => {
  // Helper: listen for the next sse_event
  function captureNextEvent(): Promise<OrchestratorEvent> {
    return new Promise((resolve) => {
      orchestratorBus.once("sse_event", (event: OrchestratorEvent) => {
        resolve(event);
      });
    });
  }

  describe("Event Emission via Bus", () => {
    it("should emit state_changed events", async () => {
      const promise = captureNextEvent();
      emitStateChanged("running", { message: "Started" });
      const event = await promise;

      expect(event.type).toBe("state_changed");
      expect(event.data.state).toBe("running");
      expect(event.data.message).toBe("Started");
      expect(event.timestamp).toBeDefined();
      expect(typeof event.timestamp).toBe("number");
    });

    it("should emit state_changed without details", async () => {
      const promise = captureNextEvent();
      emitStateChanged("stopped");
      const event = await promise;

      expect(event.type).toBe("state_changed");
      expect(event.data.state).toBe("stopped");
    });

    it("should emit cycle_start events", async () => {
      const promise = captureNextEvent();
      emitCycleStart(5);
      const event = await promise;

      expect(event.type).toBe("cycle_start");
      expect(event.data.cycle).toBe(5);
    });

    it("should emit cycle_phase events", async () => {
      const promise = captureNextEvent();
      emitCyclePhase(3, "observe", { message: "Collecting world state..." });
      const event = await promise;

      expect(event.type).toBe("cycle_phase");
      expect(event.data.cycle).toBe(3);
      expect(event.data.phase).toBe("observe");
      expect(event.data.message).toBe("Collecting world state...");
    });

    it("should emit cycle_complete events", async () => {
      const promise = captureNextEvent();
      emitCycleComplete(7, { duration: 15.5, decisionsCount: 3, tasksCreated: 5 });
      const event = await promise;

      expect(event.type).toBe("cycle_complete");
      expect(event.data.cycle).toBe(7);
      expect(event.data.duration).toBe(15.5);
      expect(event.data.decisionsCount).toBe(3);
      expect(event.data.tasksCreated).toBe(5);
    });

    it("should emit cycle_error events", async () => {
      const promise = captureNextEvent();
      emitCycleError(2, "Connection timeout");
      const event = await promise;

      expect(event.type).toBe("cycle_error");
      expect(event.data.cycle).toBe(2);
      expect(event.data.error).toBe("Connection timeout");
    });

    it("should emit task_queued events", async () => {
      const promise = captureNextEvent();
      emitTaskQueued({ taskId: 101, taskType: "seo_optimize", priority: "high", title: "Optimize domain" });
      const event = await promise;

      expect(event.type).toBe("task_queued");
      expect(event.data.taskId).toBe(101);
      expect(event.data.taskType).toBe("seo_optimize");
      expect(event.data.priority).toBe("high");
    });

    it("should emit task_started events", async () => {
      const promise = captureNextEvent();
      emitTaskStarted(101, "seo_optimize");
      const event = await promise;

      expect(event.type).toBe("task_started");
      expect(event.data.taskId).toBe(101);
      expect(event.data.taskType).toBe("seo_optimize");
    });

    it("should emit task_completed events", async () => {
      const promise = captureNextEvent();
      emitTaskCompleted(101, "seo_optimize", { success: true });
      const event = await promise;

      expect(event.type).toBe("task_completed");
      expect(event.data.taskId).toBe(101);
      expect(event.data.taskType).toBe("seo_optimize");
      expect(event.data.success).toBe(true);
    });

    it("should emit task_failed events", async () => {
      const promise = captureNextEvent();
      emitTaskFailed(102, "attack_deploy", "Target unreachable");
      const event = await promise;

      expect(event.type).toBe("task_failed");
      expect(event.data.taskId).toBe(102);
      expect(event.data.taskType).toBe("attack_deploy");
      expect(event.data.error).toBe("Target unreachable");
    });

    it("should emit decision_made events", async () => {
      const promise = captureNextEvent();
      emitDecisionMade({ subsystem: "seo", action: "optimize_content", confidence: 85, reasoning: "Content needs refresh" });
      const event = await promise;

      expect(event.type).toBe("decision_made");
      expect(event.data.subsystem).toBe("seo");
      expect(event.data.action).toBe("optimize_content");
      expect(event.data.confidence).toBe(85);
      expect(event.data.reasoning).toBe("Content needs refresh");
    });

    it("should emit metrics_update events", async () => {
      const promise = captureNextEvent();
      emitMetricsUpdate({ totalTasks: 50, successRate: 0.92 });
      const event = await promise;

      expect(event.type).toBe("metrics_update");
      expect(event.data.totalTasks).toBe(50);
      expect(event.data.successRate).toBe(0.92);
    });

    it("should emit subsystem_update events", async () => {
      const promise = captureNextEvent();
      emitSubsystemUpdate("pbn", { activeSites: 12, postsToday: 5 });
      const event = await promise;

      expect(event.type).toBe("subsystem_update");
      expect(event.data.subsystem).toBe("pbn");
      expect(event.data.activeSites).toBe(12);
      expect(event.data.postsToday).toBe(5);
    });
  });

  describe("Recent Events Buffer", () => {
    it("should store recent events in the bus buffer", () => {
      const before = orchestratorBus.getRecentEvents().length;
      emitStateChanged("running");
      emitCycleStart(1);
      const after = orchestratorBus.getRecentEvents().length;

      expect(after).toBeGreaterThanOrEqual(before + 2);
    });

    it("should return copies of recent events (not mutable references)", () => {
      const events1 = orchestratorBus.getRecentEvents();
      const events2 = orchestratorBus.getRecentEvents();
      expect(events1).not.toBe(events2); // Different array instances
    });
  });

  describe("Event Data Integrity", () => {
    it("should include timestamp in all events", async () => {
      const before = Date.now();
      const promise = captureNextEvent();
      emitStateChanged("running");
      const event = await promise;
      const after = Date.now();

      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(after);
    });

    it("should have correct event structure", async () => {
      const promise = captureNextEvent();
      emitCyclePhase(10, "decide", { message: "Analyzing..." });
      const event = await promise;

      // Verify structure
      expect(event).toHaveProperty("type");
      expect(event).toHaveProperty("timestamp");
      expect(event).toHaveProperty("data");
      expect(typeof event.type).toBe("string");
      expect(typeof event.timestamp).toBe("number");
      expect(typeof event.data).toBe("object");
    });
  });

  describe("Client Count", () => {
    it("should return a number for client count", () => {
      const count = getSSEClientCount();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Full OODA Cycle Event Sequence", () => {
    it("should emit events in correct order for a complete cycle", async () => {
      const events: OrchestratorEvent[] = [];
      const handler = (event: OrchestratorEvent) => events.push(event);
      orchestratorBus.on("sse_event", handler);

      // Simulate a full OODA cycle
      emitCycleStart(1);
      emitCyclePhase(1, "observe", { message: "Collecting data" });
      emitCyclePhase(1, "orient", { message: "Analyzing" });
      emitCyclePhase(1, "decide", { message: "Making decisions" });
      emitDecisionMade({ subsystem: "seo", action: "optimize", confidence: 90, reasoning: "Low rank" });
      emitCyclePhase(1, "act", { message: "Executing tasks" });
      emitTaskQueued({ taskId: 1, taskType: "seo_optimize", priority: "high" });
      emitTaskStarted(1, "seo_optimize");
      emitTaskCompleted(1, "seo_optimize", { success: true });
      emitCycleComplete(1, { duration: 12, decisionsCount: 1, tasksCreated: 1 });

      orchestratorBus.off("sse_event", handler);

      expect(events.length).toBe(10);
      expect(events[0].type).toBe("cycle_start");
      expect(events[1].type).toBe("cycle_phase");
      expect(events[1].data.phase).toBe("observe");
      expect(events[2].data.phase).toBe("orient");
      expect(events[3].data.phase).toBe("decide");
      expect(events[4].type).toBe("decision_made");
      expect(events[5].data.phase).toBe("act");
      expect(events[6].type).toBe("task_queued");
      expect(events[7].type).toBe("task_started");
      expect(events[8].type).toBe("task_completed");
      expect(events[9].type).toBe("cycle_complete");
    });
  });
});
