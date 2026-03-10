/**
 * Background Daemon Manager — Persistent Task Queue
 *
 * Core system that keeps ALL tasks running even after user disconnects.
 * Tasks are DB-backed so they survive server restarts.
 *
 * Features:
 *   1. DB-persisted task queue (aiTaskQueue table)
 *   2. Auto-resume incomplete tasks on server startup
 *   3. Concurrency control per task type
 *   4. Heartbeat system — detect and recover stale tasks
 *   5. Task lifecycle: queued → running → completed/failed/cancelled
 *   6. Retry with exponential backoff
 *   7. Event logging for real-time monitoring
 */
import { getDb } from "./db";
import { aiTaskQueue, type InsertAiTaskQueue, type AiTaskQueueRow } from "../drizzle/schema";
import { eq, and, inArray, sql, lt, desc, asc } from "drizzle-orm";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export type TaskType =
  | "attack_session"
  | "seo_daily"
  | "seo_scan"
  | "vuln_scan"
  | "learning_cycle"
  | "research_cycle"
  | "cve_update"
  | "proxy_health"
  | "orchestrator_cycle"
  | "keyword_discovery"
  | "gambling_brain_cycle"
  | "cms_scan"
  | "custom";

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "skipped";

export interface DaemonTask {
  id: number;
  taskType: TaskType;
  subsystem: string;
  title: string;
  description?: string;
  targetDomain?: string;
  projectId?: number;
  priority: "critical" | "high" | "medium" | "low";
  status: TaskStatus;
  config: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: string | null;
  retryCount: number;
  maxRetries: number;
  scheduledFor?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
}

export interface TaskExecutor {
  (task: DaemonTask, signal: AbortSignal): Promise<{
    success: boolean;
    result?: Record<string, unknown>;
    error?: string;
  }>;
}

export interface DaemonConfig {
  maxConcurrentPerType: Record<string, number>;
  defaultMaxRetries: number;
  heartbeatIntervalMs: number;
  staleTaskTimeoutMs: number;
  pollIntervalMs: number;
}

interface RunningTaskState {
  taskId: number;
  abortController: AbortController;
  startedAt: number;
  lastHeartbeat: number;
}

// ═══════════════════════════════════════════════
//  DEFAULT CONFIG
// ═══════════════════════════════════════════════

const DEFAULT_CONFIG: DaemonConfig = {
  maxConcurrentPerType: {
    attack_session: 3,
    seo_daily: 2,
    seo_scan: 2,
    vuln_scan: 3,
    learning_cycle: 1,
    research_cycle: 1,
    cve_update: 1,
    proxy_health: 1,
    orchestrator_cycle: 1,
    keyword_discovery: 1,
    gambling_brain_cycle: 1,
    cms_scan: 2,
    custom: 2,
  },
  defaultMaxRetries: 3,
  heartbeatIntervalMs: 30_000,      // 30s heartbeat
  staleTaskTimeoutMs: 15 * 60_000,  // 15 min stale threshold
  pollIntervalMs: 10_000,           // Poll queue every 10s
};

// ═══════════════════════════════════════════════
//  DAEMON STATE
// ═══════════════════════════════════════════════

let daemonRunning = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
const runningTasks = new Map<number, RunningTaskState>();
const executorRegistry = new Map<string, TaskExecutor>();
let config: DaemonConfig = { ...DEFAULT_CONFIG };

// Event listeners for real-time monitoring
type DaemonEventType = "task_started" | "task_completed" | "task_failed" | "task_cancelled" | "task_retried" | "stale_recovered" | "daemon_started" | "daemon_stopped";
type DaemonEventListener = (event: { type: DaemonEventType; taskId?: number; data?: Record<string, unknown> }) => void;
const eventListeners: DaemonEventListener[] = [];

// ═══════════════════════════════════════════════
//  EXECUTOR REGISTRY
// ═══════════════════════════════════════════════

/**
 * Register an executor function for a task type.
 * The executor receives the task and an AbortSignal for cancellation.
 */
export function registerExecutor(taskType: string, executor: TaskExecutor) {
  executorRegistry.set(taskType, executor);
  console.log(`[Daemon] Registered executor for task type: ${taskType}`);
}

/**
 * Unregister an executor
 */
export function unregisterExecutor(taskType: string) {
  executorRegistry.delete(taskType);
}

// ═══════════════════════════════════════════════
//  TASK QUEUE OPERATIONS
// ═══════════════════════════════════════════════

/**
 * Enqueue a new background task — persisted to DB immediately
 */
export async function enqueueTask(params: {
  taskType: TaskType;
  subsystem: string;
  title: string;
  description?: string;
  targetDomain?: string;
  projectId?: number;
  priority?: "critical" | "high" | "medium" | "low";
  config?: Record<string, unknown>;
  maxRetries?: number;
  scheduledFor?: Date;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [inserted] = await db.insert(aiTaskQueue).values({
    taskType: params.taskType,
    subsystem: params.subsystem,
    title: params.title,
    description: params.description || null,
    targetDomain: params.targetDomain || null,
    projectId: params.projectId || null,
    priority: params.priority || "medium",
    status: "queued",
    result: params.config || {},
    maxRetries: params.maxRetries ?? config.defaultMaxRetries,
    scheduledFor: params.scheduledFor || null,
  });

  const taskId = inserted.insertId;
  console.log(`[Daemon] Task #${taskId} enqueued: ${params.title} (${params.taskType})`);
  return taskId;
}

/**
 * Cancel a task — if running, abort it; if queued, mark cancelled
 */
export async function cancelTask(taskId: number): Promise<boolean> {
  const running = runningTasks.get(taskId);
  if (running) {
    running.abortController.abort();
    runningTasks.delete(taskId);
  }

  const db = await getDb();
  if (!db) return false;

  await db.update(aiTaskQueue)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(and(
      eq(aiTaskQueue.id, taskId),
      inArray(aiTaskQueue.status, ["queued", "running"]),
    ));

  emitDaemonEvent({ type: "task_cancelled", taskId });
  console.log(`[Daemon] Task #${taskId} cancelled`);
  return true;
}

/**
 * Get task status by ID
 */
export async function getTaskById(taskId: number): Promise<DaemonTask | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select().from(aiTaskQueue).where(eq(aiTaskQueue.id, taskId)).limit(1);
  if (rows.length === 0) return null;
  return rowToTask(rows[0]);
}

/**
 * List tasks with optional filters
 */
export async function listTasks(filters?: {
  status?: TaskStatus | TaskStatus[];
  taskType?: TaskType;
  subsystem?: string;
  limit?: number;
}): Promise<DaemonTask[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];
  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(inArray(aiTaskQueue.status, filters.status));
    } else {
      conditions.push(eq(aiTaskQueue.status, filters.status));
    }
  }
  if (filters?.taskType) {
    conditions.push(eq(aiTaskQueue.taskType, filters.taskType));
  }
  if (filters?.subsystem) {
    conditions.push(eq(aiTaskQueue.subsystem, filters.subsystem));
  }

  const query = db.select().from(aiTaskQueue);
  const rows = conditions.length > 0
    ? await query.where(and(...conditions)).orderBy(desc(aiTaskQueue.createdAt)).limit(filters?.limit || 50)
    : await query.orderBy(desc(aiTaskQueue.createdAt)).limit(filters?.limit || 50);

  return rows.map(rowToTask);
}

/**
 * Get daemon stats
 */
export async function getDaemonStats(): Promise<{
  isRunning: boolean;
  runningTaskCount: number;
  runningTasksByType: Record<string, number>;
  queuedCount: number;
  completedToday: number;
  failedToday: number;
  registeredExecutors: string[];
  uptime: number;
}> {
  const db = await getDb();

  const runningByType: Record<string, number> = {};
    for (const [, state] of Array.from(runningTasks.entries())) {
      const task = await getTaskById(state.taskId);
      if (task) {
        runningByType[task.taskType] = (runningByType[task.taskType] || 0) + 1;
      }
    }

  let queuedCount = 0;
  let completedToday = 0;
  let failedToday = 0;

  if (db) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [queuedResult] = await db.select({ count: sql<number>`count(*)` })
      .from(aiTaskQueue)
      .where(eq(aiTaskQueue.status, "queued"));
    queuedCount = queuedResult?.count || 0;

    const [completedResult] = await db.select({ count: sql<number>`count(*)` })
      .from(aiTaskQueue)
      .where(and(
        eq(aiTaskQueue.status, "completed"),
        sql`${aiTaskQueue.completedAt} >= ${today}`,
      ));
    completedToday = completedResult?.count || 0;

    const [failedResult] = await db.select({ count: sql<number>`count(*)` })
      .from(aiTaskQueue)
      .where(and(
        eq(aiTaskQueue.status, "failed"),
        sql`${aiTaskQueue.completedAt} >= ${today}`,
      ));
    failedToday = failedResult?.count || 0;
  }

  return {
    isRunning: daemonRunning,
    runningTaskCount: runningTasks.size,
    runningTasksByType: runningByType,
    queuedCount,
    completedToday,
    failedToday,
    registeredExecutors: Array.from(executorRegistry.keys()),
    uptime: daemonRunning ? Date.now() - (daemonStartTime || Date.now()) : 0,
  };
}

let daemonStartTime: number | null = null;

// ═══════════════════════════════════════════════
//  TASK EXECUTION
// ═══════════════════════════════════════════════

async function executeTask(task: DaemonTask) {
  const executor = executorRegistry.get(task.taskType);
  if (!executor) {
    console.warn(`[Daemon] No executor registered for task type: ${task.taskType}, skipping task #${task.id}`);
    await updateTaskStatus(task.id, "skipped", undefined, "No executor registered");
    return;
  }

  // Check concurrency limit
  const currentRunning = countRunningByType(task.taskType);
  const maxConcurrent = config.maxConcurrentPerType[task.taskType] || 2;
  if (currentRunning >= maxConcurrent) {
    return; // Will be picked up next poll
  }

  const abortController = new AbortController();
  const state: RunningTaskState = {
    taskId: task.id,
    abortController,
    startedAt: Date.now(),
    lastHeartbeat: Date.now(),
  };
  runningTasks.set(task.id, state);

  // Mark as running in DB
  await updateTaskStatus(task.id, "running");
  const db = await getDb();
  if (db) {
    await db.update(aiTaskQueue)
      .set({ startedAt: new Date() })
      .where(eq(aiTaskQueue.id, task.id));
  }

  emitDaemonEvent({ type: "task_started", taskId: task.id, data: { taskType: task.taskType, title: task.title } });
  console.log(`[Daemon] ▶ Task #${task.id} started: ${task.title} (${task.taskType})`);

  try {
    const result = await executor(task, abortController.signal);

    if (result.success) {
      await updateTaskStatus(task.id, "completed", result.result);
      emitDaemonEvent({ type: "task_completed", taskId: task.id, data: { ...result.result, _taskType: task.taskType, _title: task.title } });
      console.log(`[Daemon] ✅ Task #${task.id} completed: ${task.title}`);
    } else {
      throw new Error(result.error || "Executor returned failure");
    }
  } catch (err: any) {
    const errorMsg = err.message || "Unknown error";
    console.error(`[Daemon] ❌ Task #${task.id} failed: ${errorMsg}`);

    // Check if we should retry
    if (task.retryCount < task.maxRetries && !abortController.signal.aborted) {
      const nextRetry = task.retryCount + 1;
      const backoffMs = Math.min(nextRetry * 30_000, 5 * 60_000); // 30s, 60s, 90s... max 5min
      const scheduledFor = new Date(Date.now() + backoffMs);

      if (db) {
        await db.update(aiTaskQueue).set({
          status: "queued",
          retryCount: nextRetry,
          error: errorMsg,
          scheduledFor,
        }).where(eq(aiTaskQueue.id, task.id));
      }

      emitDaemonEvent({ type: "task_retried", taskId: task.id, data: { retryCount: nextRetry, nextRetryAt: scheduledFor.toISOString() } });
      console.log(`[Daemon] 🔄 Task #${task.id} will retry (#${nextRetry}) at ${scheduledFor.toISOString()}`);
    } else {
      await updateTaskStatus(task.id, "failed", undefined, errorMsg);
      emitDaemonEvent({ type: "task_failed", taskId: task.id, data: { error: errorMsg, _taskType: task.taskType, _title: task.title } });
    }
  } finally {
    runningTasks.delete(task.id);
  }
}

// ═══════════════════════════════════════════════
//  QUEUE POLLING
// ═══════════════════════════════════════════════

async function pollQueue() {
  if (!daemonRunning) return;

  try {
    const db = await getDb();
    if (!db) return;

    // Fetch queued tasks ordered by priority + creation time
    const priorityOrder = sql`FIELD(${aiTaskQueue.priority}, 'critical', 'high', 'medium', 'low')`;
    const now = new Date();

    const queuedTasks = await db.select().from(aiTaskQueue)
      .where(and(
        eq(aiTaskQueue.status, "queued"),
        sql`(${aiTaskQueue.scheduledFor} IS NULL OR ${aiTaskQueue.scheduledFor} <= ${now})`,
      ))
      .orderBy(priorityOrder, asc(aiTaskQueue.createdAt))
      .limit(10);

    for (const row of queuedTasks) {
      const task = rowToTask(row);
      const currentRunning = countRunningByType(task.taskType);
      const maxConcurrent = config.maxConcurrentPerType[task.taskType] || 2;

      if (currentRunning < maxConcurrent && executorRegistry.has(task.taskType)) {
        // Fire and forget — executeTask manages its own lifecycle
        executeTask(task).catch(err =>
          console.error(`[Daemon] Unexpected error executing task #${task.id}:`, err.message)
        );
      }
    }
  } catch (err: any) {
    console.error(`[Daemon] Poll error: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════
//  HEARTBEAT & STALE RECOVERY
// ═══════════════════════════════════════════════

async function heartbeatCheck() {
  if (!daemonRunning) return;

  try {
    const db = await getDb();
    if (!db) return;

    // Update heartbeat for running tasks
    for (const [taskId, state] of Array.from(runningTasks.entries())) {
      state.lastHeartbeat = Date.now();
    }

    // Find stale tasks in DB (running but no active handler)
    const staleTasks = await db.select().from(aiTaskQueue)
      .where(and(
        eq(aiTaskQueue.status, "running"),
        lt(aiTaskQueue.updatedAt, new Date(Date.now() - config.staleTaskTimeoutMs)),
      ))
      .limit(10);

    for (const row of staleTasks) {
      if (!runningTasks.has(row.id)) {
        // This task is marked running in DB but has no active handler — recover it
        console.warn(`[Daemon] 🔧 Recovering stale task #${row.id}: ${row.title}`);

        const retryCount = (row.retryCount || 0) + 1;
        if (retryCount <= (row.maxRetries || 3)) {
          await db.update(aiTaskQueue).set({
            status: "queued",
            retryCount,
            error: "Recovered from stale state (no active handler)",
          }).where(eq(aiTaskQueue.id, row.id));

          emitDaemonEvent({ type: "stale_recovered", taskId: row.id });
        } else {
          await db.update(aiTaskQueue).set({
            status: "failed",
            completedAt: new Date(),
            error: "Max retries exceeded after stale recovery",
          }).where(eq(aiTaskQueue.id, row.id));
        }
      }
    }
  } catch (err: any) {
    console.error(`[Daemon] Heartbeat error: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════
//  AUTO-RESUME ON STARTUP
// ═══════════════════════════════════════════════

async function autoResumeIncompleteTasks() {
  try {
    const db = await getDb();
    if (!db) return;

    // Reset all "running" tasks back to "queued" (server restarted, they lost their handler)
    const result = await db.update(aiTaskQueue)
      .set({
        status: "queued",
        error: "Auto-resumed after server restart",
      })
      .where(eq(aiTaskQueue.status, "running"));

    // Count how many were reset
    const resetTasks = await db.select({ count: sql<number>`count(*)` })
      .from(aiTaskQueue)
      .where(and(
        eq(aiTaskQueue.status, "queued"),
        sql`${aiTaskQueue.error} = 'Auto-resumed after server restart'`,
      ));

    const count = resetTasks[0]?.count || 0;
    if (count > 0) {
      console.log(`[Daemon] 🔄 Auto-resumed ${count} incomplete tasks from previous session`);
    }
  } catch (err: any) {
    console.error(`[Daemon] Auto-resume error: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════
//  DAEMON LIFECYCLE
// ═══════════════════════════════════════════════

/**
 * Start the Background Daemon — begins polling queue and processing tasks
 */
export async function startDaemon(customConfig?: Partial<DaemonConfig>) {
  if (daemonRunning) {
    console.log("[Daemon] Already running, ignoring duplicate start");
    return;
  }

  if (customConfig) {
    config = { ...DEFAULT_CONFIG, ...customConfig };
  }

  daemonRunning = true;
  daemonStartTime = Date.now();

  console.log("[Daemon] 🚀 Background Daemon starting...");

  // Auto-resume incomplete tasks from previous session
  await autoResumeIncompleteTasks();

  // Start polling
  pollTimer = setInterval(() => {
    pollQueue().catch(err => console.error(`[Daemon] Poll error: ${err.message}`));
  }, config.pollIntervalMs);

  // Start heartbeat
  heartbeatTimer = setInterval(() => {
    heartbeatCheck().catch(err => console.error(`[Daemon] Heartbeat error: ${err.message}`));
  }, config.heartbeatIntervalMs);

  // Initial poll
  await pollQueue();

  emitDaemonEvent({ type: "daemon_started" });
  console.log(`[Daemon] ✅ Background Daemon running (poll: ${config.pollIntervalMs / 1000}s, heartbeat: ${config.heartbeatIntervalMs / 1000}s)`);
}

/**
 * Stop the Background Daemon — cancels all running tasks
 */
export async function stopDaemon() {
  if (!daemonRunning) return;

  daemonRunning = false;

  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }

  // Abort all running tasks
  for (const [taskId, state] of Array.from(runningTasks.entries())) {
    state.abortController.abort();
    console.log(`[Daemon] Aborting task #${taskId}`);
  }
  runningTasks.clear();

  emitDaemonEvent({ type: "daemon_stopped" });
  console.log("[Daemon] ⏹ Background Daemon stopped");
}

/**
 * Check if daemon is running
 */
export function isDaemonRunning(): boolean {
  return daemonRunning;
}

// ═══════════════════════════════════════════════
//  EVENT SYSTEM
// ═══════════════════════════════════════════════

export function onDaemonEvent(listener: DaemonEventListener) {
  eventListeners.push(listener);
  return () => {
    const idx = eventListeners.indexOf(listener);
    if (idx >= 0) eventListeners.splice(idx, 1);
  };
}

function emitDaemonEvent(event: { type: DaemonEventType; taskId?: number; data?: Record<string, unknown> }) {
  for (const listener of eventListeners) {
    try { listener(event); } catch { /* best-effort */ }
  }
}

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

function countRunningByType(taskType: string): number {
  let count = 0;
  // We need to check the actual task type from DB, but for performance we track in-memory
  // For now, count all running tasks (simplified)
  return runningTasks.size; // TODO: track by type in RunningTaskState
}

async function updateTaskStatus(
  taskId: number,
  status: TaskStatus,
  result?: Record<string, unknown>,
  error?: string,
) {
  const db = await getDb();
  if (!db) return;

  const updates: Record<string, any> = { status };
  if (result !== undefined) updates.result = result;
  if (error !== undefined) updates.error = error;
  if (status === "completed" || status === "failed" || status === "cancelled") {
    updates.completedAt = new Date();
  }

  await db.update(aiTaskQueue).set(updates).where(eq(aiTaskQueue.id, taskId));
}

function rowToTask(row: AiTaskQueueRow): DaemonTask {
  return {
    id: row.id,
    taskType: row.taskType as TaskType,
    subsystem: row.subsystem,
    title: row.title,
    description: row.description || undefined,
    targetDomain: row.targetDomain || undefined,
    projectId: row.projectId || undefined,
    priority: row.priority as "critical" | "high" | "medium" | "low",
    status: row.status as TaskStatus,
    config: (row.result as Record<string, unknown>) || {},
    result: row.result as Record<string, unknown> | null,
    error: row.error || null,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    scheduledFor: row.scheduledFor || null,
    startedAt: row.startedAt || null,
    completedAt: row.completedAt || null,
    createdAt: row.createdAt,
  };
}
