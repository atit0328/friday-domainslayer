/**
 * Attack Logger — Captures every pipeline event and writes to DB + in-memory buffer
 * 
 * Features:
 * - Real-time event capture from unified-attack-pipeline
 * - Severity classification (info, success, warning, error, critical)
 * - DB persistence via attack_logs table
 * - In-memory buffer for SSE streaming
 * - Log retrieval by deployId, domain, phase, severity
 * - Smart fallback recommendations based on failure patterns
 */
import { getDb } from "./db";
import { attackLogs } from "../drizzle/schema";
import { eq, desc, and, gte, sql, or } from "drizzle-orm";
import type { PipelineEvent } from "./unified-attack-pipeline";
import type { AttackLogRow } from "../drizzle/schema";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface AttackLogEntry {
  id?: number;
  deployId: number | null;
  userId: number;
  domain: string;
  phase: string;
  step: string;
  detail: string;
  severity: "info" | "success" | "warning" | "error" | "critical";
  progress: number;
  data?: any;
  method?: string;
  httpStatus?: number;
  responseTime?: number;
  timestamp: Date;
}

export interface LogFilter {
  deployId?: number;
  domain?: string;
  phase?: string;
  severity?: string;
  limit?: number;
  offset?: number;
  since?: Date;
}

export interface FailurePattern {
  phase: string;
  method: string;
  failCount: number;
  lastError: string;
  httpStatuses: number[];
}

export interface SmartFallbackRecommendation {
  skipMethods: string[];
  prioritizeMethods: string[];
  reason: string;
  failurePatterns: FailurePattern[];
}

// ═══════════════════════════════════════════════
//  IN-MEMORY LOG BUFFER (for real-time SSE)
// ═══════════════════════════════════════════════

// Buffer per deployId — keeps last 500 events in memory for SSE streaming
const logBuffers = new Map<number, AttackLogEntry[]>();
const MAX_BUFFER_SIZE = 500;
const BUFFER_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 min

// Cleanup old buffers periodically
setInterval(() => {
  const cutoff = Date.now() - BUFFER_CLEANUP_INTERVAL;
  const keys = Array.from(logBuffers.keys());
  for (const key of keys) {
    const bufEntries = logBuffers.get(key);
    if (bufEntries && bufEntries.length > 0 && bufEntries[bufEntries.length - 1].timestamp.getTime() < cutoff) {
      logBuffers.delete(key);
    }
  }
}, BUFFER_CLEANUP_INTERVAL);

// ═══════════════════════════════════════════════
//  SEVERITY CLASSIFIER
// ═══════════════════════════════════════════════

/**
 * Classify severity from a PipelineEvent based on content patterns
 */
export function classifySeverity(event: PipelineEvent): "info" | "success" | "warning" | "error" | "critical" {
  const detail = event.detail.toLowerCase();
  const phase = event.phase;
  const step = event.step;

  // Critical: pipeline-level failures
  if (phase === "error" && step === "global_timeout") return "critical";
  if (detail.includes("pipeline ล้มเหลว") || detail.includes("pipeline failed")) return "critical";
  
  // Error: individual method failures
  if (detail.startsWith("❌") || detail.includes("ล้มเหลว") || detail.includes("failed") || detail.includes("error")) {
    if (phase === "complete" && step === "failed") return "critical";
    return "error";
  }
  
  // Warning: partial success or skipped phases
  if (detail.startsWith("⚠️") || detail.includes("skip") || detail.includes("ข้าม") || detail.includes("timeout")) {
    return "warning";
  }
  
  // Success: confirmed working results
  if (detail.startsWith("✅") || detail.startsWith("🎉") || detail.includes("สำเร็จ") || detail.includes("success")) {
    return "success";
  }
  if (phase === "complete" && (step === "success" || step === "partial")) return "success";
  
  return "info";
}

/**
 * Extract HTTP status from event detail if present
 */
function extractHttpStatus(detail: string): number | undefined {
  const match = detail.match(/HTTP\s*(\d{3})/i) || detail.match(/status[:\s]*(\d{3})/i);
  return match ? parseInt(match[1]) : undefined;
}

/**
 * Extract method name from event
 */
function extractMethod(event: PipelineEvent): string | undefined {
  if (event.step.includes("oneclick")) return "oneClickDeploy";
  if (event.step.includes("all_methods")) return "tryAllUploadMethods";
  if (event.step.includes("parallel")) return "multiVectorParallel";
  if (event.step.includes("smart_retry")) return "smartRetryUpload";
  if (event.step.includes("waf_bypass") || event.phase === "waf_bypass") return "waf_bypass";
  if (event.step.includes("alt_upload") || event.phase === "alt_upload") return "alt_upload";
  if (event.step.includes("indirect") || event.phase === "indirect") return "indirect_attack";
  if (event.step.includes("dns") || event.phase === "dns_attack") return "dns_attack";
  if (event.step.includes("config") || event.phase === "config_exploit") return "config_exploit";
  if (event.step.includes("wp_admin") || event.phase === "wp_admin") return "wp_admin_takeover";
  if (event.step.includes("wp_db") || event.phase === "wp_db_inject") return "wp_db_injection";
  if (event.step.includes("shellless") || event.phase === "shellless") return "shellless";
  if (event.step.includes("ai_commander") || event.step.includes("ai_cmd")) return "ai_commander";
  if (event.step.includes("cf_bypass") || event.phase === "cf_bypass") return "cf_origin_bypass";
  if (event.step.includes("brute_force") || event.phase === "wp_brute_force") return "wp_brute_force";
  if (event.step.includes("comprehensive") || event.phase === "comprehensive") return "comprehensive";
  if (event.step.includes("nonwp")) return "non_wp_exploits";
  if (event.step.includes("post_upload") || event.phase === "post_upload") return "post_upload";
  return undefined;
}

// ═══════════════════════════════════════════════
//  CORE LOGGER
// ═══════════════════════════════════════════════

/**
 * Create an AttackLogger instance for a specific deploy
 */
export function createAttackLogger(initialDeployId: number | null, userId: number, domain: string) {
  let deployId = initialDeployId;
  const entries: AttackLogEntry[] = [];
  
  // Initialize buffer for this deploy
  if (deployId) {
    logBuffers.set(deployId, []);
  }

  /**
   * Log a pipeline event — writes to memory buffer and DB
   */
  async function log(event: PipelineEvent): Promise<void> {
    const entry: AttackLogEntry = {
      deployId,
      userId,
      domain,
      phase: event.phase,
      step: event.step,
      detail: event.detail,
      severity: classifySeverity(event),
      progress: event.progress,
      data: event.data || undefined,
      method: extractMethod(event),
      httpStatus: extractHttpStatus(event.detail),
      timestamp: new Date(),
    };

    // Add to local buffer
    entries.push(entry);

    // Add to shared buffer (for SSE streaming)
    if (deployId) {
      const buffer = logBuffers.get(deployId);
      if (buffer) {
        buffer.push(entry);
        if (buffer.length > MAX_BUFFER_SIZE) {
          buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
        }
      }
    }

    // Write to DB (non-blocking)
    persistLog(entry).catch(() => {
      // Silently fail DB writes — don't break the pipeline
    });
  }

  /**
   * Log a custom message (not from pipeline event)
   */
  async function logMessage(
    phase: string,
    step: string,
    detail: string,
    severity: AttackLogEntry["severity"] = "info",
    data?: any,
  ): Promise<void> {
    return log({
      phase: phase as any,
      step,
      detail,
      progress: 0,
      data,
    });
  }

  /**
   * Get all entries for this deploy
   */
  function getEntries(): AttackLogEntry[] {
    return [...entries];
  }

  /**
   * Get entries filtered by severity
   */
  function getEntriesBySeverity(severity: AttackLogEntry["severity"]): AttackLogEntry[] {
    return entries.filter(e => e.severity === severity);
  }

  /**
   * Get failure patterns — analyze what methods failed and why
   */
  function getFailurePatterns(): FailurePattern[] {
    const patterns = new Map<string, FailurePattern>();

    for (const entry of entries) {
      if (entry.severity !== "error" && entry.severity !== "critical") continue;
      if (!entry.method) continue;

      const key = `${entry.phase}:${entry.method}`;
      const existing = patterns.get(key) || {
        phase: entry.phase,
        method: entry.method,
        failCount: 0,
        lastError: "",
        httpStatuses: [],
      };

      existing.failCount++;
      existing.lastError = entry.detail;
      if (entry.httpStatus) existing.httpStatuses.push(entry.httpStatus);

      patterns.set(key, existing);
    }

    return Array.from(patterns.values()).sort((a, b) => b.failCount - a.failCount);
  }

  /**
   * Generate smart fallback recommendations based on failure patterns
   */
  function getSmartFallbackRecommendation(): SmartFallbackRecommendation {
    const patterns = getFailurePatterns();
    const skipMethods: string[] = [];
    const prioritizeMethods: string[] = [];
    const reasons: string[] = [];

    // Analyze patterns
    const allFailed = patterns.filter(p => p.failCount >= 2);
    const has403 = patterns.some(p => p.httpStatuses.includes(403));
    const has404 = patterns.some(p => p.httpStatuses.includes(404));
    const hasTimeout = entries.some(e => e.detail.toLowerCase().includes("timeout"));
    const hasWaf = entries.some(e => e.detail.toLowerCase().includes("waf") || e.detail.toLowerCase().includes("cloudflare"));
    const noWritablePaths = entries.some(e => e.detail.includes("0 writable paths") || e.detail.includes("Found 0 writable"));
    const phpNotExecuting = entries.some(e => e.detail.includes("PHP ไม่ execute") || e.detail.includes("PHP not executing"));

    // Rule 1: No writable paths → skip all file upload methods
    if (noWritablePaths) {
      skipMethods.push("oneClickDeploy", "tryAllUploadMethods", "multiVectorParallel", "smartRetryUpload");
      prioritizeMethods.push("shellless", "indirect_attack", "wp_db_injection", "comprehensive");
      reasons.push("ไม่พบ writable paths — ข้ามการ upload ไฟล์ทั้งหมด ใช้ shellless/indirect แทน");
    }

    // Rule 2: WAF detected → prioritize WAF bypass and indirect
    if (hasWaf) {
      prioritizeMethods.push("waf_bypass", "cf_origin_bypass", "indirect_attack");
      reasons.push("ตรวจพบ WAF — ใช้ WAF bypass techniques และ indirect attacks");
    }

    // Rule 3: All 403 → server blocks uploads
    if (has403 && !hasWaf) {
      skipMethods.push("oneClickDeploy", "tryAllUploadMethods");
      prioritizeMethods.push("wp_admin_takeover", "wp_brute_force", "config_exploit");
      reasons.push("Server return 403 — ลองเข้าถึงผ่าน WP admin หรือ config exploitation");
    }

    // Rule 4: PHP not executing → skip PHP shells
    if (phpNotExecuting) {
      reasons.push("PHP ไม่ execute — ใช้ .htaccess, HTML redirect, หรือ shellless methods");
    }

    // Rule 5: Methods that failed 3+ times → skip
    for (const p of allFailed) {
      if (p.failCount >= 3 && !skipMethods.includes(p.method)) {
        skipMethods.push(p.method);
        reasons.push(`${p.method} ล้มเหลว ${p.failCount} ครั้ง — ข้าม`);
      }
    }

    return {
      skipMethods: Array.from(new Set(skipMethods)),
      prioritizeMethods: Array.from(new Set(prioritizeMethods)),
      reason: reasons.join("; "),
      failurePatterns: patterns,
    };
  }

  /**
   * Generate a text log file content
   */
  function exportAsText(): string {
    const lines: string[] = [
      `═══════════════════════════════════════════════`,
      `  ATTACK LOG — ${domain}`,
      `  Deploy ID: ${deployId || "N/A"}`,
      `  Total Events: ${entries.length}`,
      `  Generated: ${new Date().toISOString()}`,
      `═══════════════════════════════════════════════`,
      "",
    ];

    // Summary stats
    const byPhase = new Map<string, number>();
    const bySeverity = new Map<string, number>();
    for (const e of entries) {
      byPhase.set(e.phase, (byPhase.get(e.phase) || 0) + 1);
      bySeverity.set(e.severity, (bySeverity.get(e.severity) || 0) + 1);
    }

    lines.push("── Summary ──");
    lines.push(`  Phases: ${Array.from(byPhase.entries()).map(([k, v]) => `${k}(${v})`).join(", ")}`);
    lines.push(`  Severity: ${Array.from(bySeverity.entries()).map(([k, v]) => `${k}(${v})`).join(", ")}`);
    lines.push("");

    // Failure analysis
    const patterns = getFailurePatterns();
    if (patterns.length > 0) {
      lines.push("── Failure Patterns ──");
      for (const p of patterns) {
        lines.push(`  [${p.phase}] ${p.method}: ${p.failCount}x failed | HTTP: ${p.httpStatuses.join(",") || "N/A"}`);
        lines.push(`    Last error: ${p.lastError.slice(0, 200)}`);
      }
      lines.push("");
    }

    // Smart recommendations
    const rec = getSmartFallbackRecommendation();
    if (rec.reason) {
      lines.push("── AI Recommendations ──");
      if (rec.skipMethods.length > 0) lines.push(`  Skip: ${rec.skipMethods.join(", ")}`);
      if (rec.prioritizeMethods.length > 0) lines.push(`  Prioritize: ${rec.prioritizeMethods.join(", ")}`);
      lines.push(`  Reason: ${rec.reason}`);
      lines.push("");
    }

    // Full log
    lines.push("── Full Event Log ──");
    for (const e of entries) {
      const ts = e.timestamp.toISOString().replace("T", " ").slice(0, 19);
      const sev = e.severity.toUpperCase().padEnd(8);
      const method = e.method ? ` [${e.method}]` : "";
      const http = e.httpStatus ? ` HTTP:${e.httpStatus}` : "";
      lines.push(`[${ts}] ${sev} [${e.phase}/${e.step}]${method}${http} ${e.detail}`);
    }

    return lines.join("\n");
  }

  return {
    log,
    logMessage,
    getEntries,
    getEntriesBySeverity,
    getFailurePatterns,
    getSmartFallbackRecommendation,
    exportAsText,
    get deployId() { return deployId; },
    setDeployId(id: number) { deployId = id; if (!logBuffers.has(id)) logBuffers.set(id, []); },
  };
}

export type AttackLogger = ReturnType<typeof createAttackLogger>;

// ═══════════════════════════════════════════════
//  DB PERSISTENCE
// ═══════════════════════════════════════════════

/**
 * Persist a single log entry to DB
 */
async function persistLog(entry: AttackLogEntry): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(attackLogs).values({
    deployId: entry.deployId,
    userId: entry.userId,
    domain: entry.domain,
    phase: entry.phase,
    step: entry.step,
    detail: entry.detail,
    severity: entry.severity,
    progress: entry.progress,
    data: entry.data,
    method: entry.method,
    httpStatus: entry.httpStatus,
    responseTime: entry.responseTime,
    timestamp: entry.timestamp,
  });
}

/**
 * Batch persist multiple log entries
 */
export async function persistLogBatch(entries: AttackLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await getDb();
  if (!db) return;

  // Insert in batches of 50
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    await db.insert(attackLogs).values(
      batch.map(e => ({
        deployId: e.deployId,
        userId: e.userId,
        domain: e.domain,
        phase: e.phase,
        step: e.step,
        detail: e.detail,
        severity: e.severity,
        progress: e.progress,
        data: e.data,
        method: e.method,
        httpStatus: e.httpStatus,
        responseTime: e.responseTime,
        timestamp: e.timestamp,
      })),
    );
  }
}

// ═══════════════════════════════════════════════
//  LOG RETRIEVAL
// ═══════════════════════════════════════════════

/**
 * Get logs from DB with filters
 */
export async function getAttackLogs(filter: LogFilter): Promise<AttackLogRow[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];
  if (filter.deployId) conditions.push(eq(attackLogs.deployId, filter.deployId));
  if (filter.domain) conditions.push(eq(attackLogs.domain, filter.domain));
  if (filter.phase) conditions.push(eq(attackLogs.phase, filter.phase));
  if (filter.severity) conditions.push(eq(attackLogs.severity, filter.severity as any));
  if (filter.since) conditions.push(gte(attackLogs.timestamp, filter.since));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(attackLogs)
    .where(where)
    .orderBy(desc(attackLogs.timestamp))
    .limit(filter.limit || 200)
    .offset(filter.offset || 0);

  return rows;
}

/**
 * Get logs from in-memory buffer (for real-time SSE)
 */
export function getBufferedLogs(deployId: number, sinceIndex?: number): AttackLogEntry[] {
  const buffer = logBuffers.get(deployId);
  if (!buffer) return [];
  if (sinceIndex !== undefined && sinceIndex >= 0) {
    return buffer.slice(sinceIndex);
  }
  return [...buffer];
}

/**
 * Get log stats for a deploy
 */
export async function getAttackLogStats(deployId: number): Promise<{
  total: number;
  bySeverity: Record<string, number>;
  byPhase: Record<string, number>;
  failurePatterns: FailurePattern[];
}> {
  const db = await getDb();
  if (!db) return { total: 0, bySeverity: {}, byPhase: {}, failurePatterns: [] };

  const rows = await db
    .select()
    .from(attackLogs)
    .where(eq(attackLogs.deployId, deployId))
    .orderBy(attackLogs.timestamp);

  const bySeverity: Record<string, number> = {};
  const byPhase: Record<string, number> = {};
  const failureMap = new Map<string, FailurePattern>();

  for (const row of rows) {
    bySeverity[row.severity] = (bySeverity[row.severity] || 0) + 1;
    byPhase[row.phase] = (byPhase[row.phase] || 0) + 1;

    if ((row.severity === "error" || row.severity === "critical") && row.method) {
      const key = `${row.phase}:${row.method}`;
      const existing = failureMap.get(key) || {
        phase: row.phase,
        method: row.method,
        failCount: 0,
        lastError: "",
        httpStatuses: [],
      };
      existing.failCount++;
      existing.lastError = row.detail;
      if (row.httpStatus) existing.httpStatuses.push(row.httpStatus);
      failureMap.set(key, existing);
    }
  }

  return {
    total: rows.length,
    bySeverity,
    byPhase,
    failurePatterns: Array.from(failureMap.values()).sort((a, b) => b.failCount - a.failCount),
  };
}

/**
 * Get recent attack logs across all deploys (for dashboard)
 */
export async function getRecentAttackLogs(userId: number, limit = 50): Promise<AttackLogRow[]> {
  const db = await getDb();
  if (!db) return [];

  // Include logs from this user OR legacy logs with userId=0 (before userId tracking was fixed)
  return db
    .select()
    .from(attackLogs)
    .where(or(eq(attackLogs.userId, userId), eq(attackLogs.userId, 0)))
    .orderBy(desc(attackLogs.timestamp))
    .limit(limit);
}

/**
 * Delete old logs (cleanup)
 */
export async function cleanupOldLogs(daysOld = 30): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(attackLogs)
    .where(sql`${attackLogs.timestamp} < ${cutoff}`);

  return (result as any)[0]?.affectedRows || 0;
}

// ═══════════════════════════════════════════════
//  CONTINUOUS REPORTING SYSTEM
// ═══════════════════════════════════════════════

/**
 * Continuous Report — generates a summary report for ongoing/completed attacks
 * Used by the dashboard to show real-time progress without timeout limits
 */
export interface ContinuousReport {
  deployId: number | null;
  domain: string;
  status: "running" | "success" | "partial" | "failed";
  startedAt: Date;
  lastUpdate: Date;
  duration: number;
  totalEvents: number;
  phaseBreakdown: {
    phase: string;
    events: number;
    successes: number;
    errors: number;
    lastDetail: string;
  }[];
  methodsAttempted: {
    method: string;
    attempts: number;
    success: boolean;
    lastError?: string;
  }[];
  currentPhase: string;
  currentStep: string;
  progress: number;
  successfulUploads: string[];
  redirectVerified: boolean;
  failureRecommendation: SmartFallbackRecommendation | null;
}

// Active report trackers
const activeReports = new Map<string, ContinuousReport>();

/**
 * Create or update a continuous report for a domain
 */
export function updateContinuousReport(
  domain: string,
  deployId: number | null,
  event: PipelineEvent,
): void {
  const key = deployId ? `deploy:${deployId}` : `domain:${domain}`;
  let report = activeReports.get(key);

  if (!report) {
    report = {
      deployId,
      domain,
      status: "running",
      startedAt: new Date(),
      lastUpdate: new Date(),
      duration: 0,
      totalEvents: 0,
      phaseBreakdown: [],
      methodsAttempted: [],
      currentPhase: event.phase,
      currentStep: event.step,
      progress: event.progress,
      successfulUploads: [],
      redirectVerified: false,
      failureRecommendation: null,
    };
    activeReports.set(key, report);
  }

  report.lastUpdate = new Date();
  report.duration = report.lastUpdate.getTime() - report.startedAt.getTime();
  report.totalEvents++;
  report.currentPhase = event.phase;
  report.currentStep = event.step;
  report.progress = event.progress;

  // Update phase breakdown
  let phase = report.phaseBreakdown.find(p => p.phase === event.phase);
  if (!phase) {
    phase = { phase: event.phase, events: 0, successes: 0, errors: 0, lastDetail: "" };
    report.phaseBreakdown.push(phase);
  }
  phase.events++;
  phase.lastDetail = event.detail;

  const severity = classifySeverity(event);
  if (severity === "success") phase.successes++;
  if (severity === "error" || severity === "critical") phase.errors++;

  // Track successful uploads
  if (event.detail.includes("upload") && severity === "success") {
    const urlMatch = event.detail.match(/https?:\/\/[^\s]+/);
    if (urlMatch) report.successfulUploads.push(urlMatch[0]);
  }

  // Track redirect verification
  if (event.detail.includes("redirect") && event.detail.includes("verified") && severity === "success") {
    report.redirectVerified = true;
  }

  // Detect completion
  if (event.phase === "complete") {
    if (event.step === "success" || event.step === "partial") {
      report.status = event.step as "success" | "partial";
    } else if (event.step === "failed") {
      report.status = "failed";
    }
  }
}

/**
 * Get continuous report for a domain or deploy
 */
export function getContinuousReport(deployId?: number, domain?: string): ContinuousReport | null {
  if (deployId) {
    return activeReports.get(`deploy:${deployId}`) || null;
  }
  if (domain) {
    return activeReports.get(`domain:${domain}`) || null;
  }
  return null;
}

/**
 * Get all active (running) reports
 */
export function getActiveReports(): ContinuousReport[] {
  return Array.from(activeReports.values()).filter(r => r.status === "running");
}

/**
 * Get all reports (active + completed)
 */
export function getAllReports(limit = 50): ContinuousReport[] {
  const reports = Array.from(activeReports.values());
  reports.sort((a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime());
  return reports.slice(0, limit);
}

/**
 * Cleanup old completed reports (keep running ones)
 */
export function cleanupReports(maxAge = 60 * 60 * 1000): void {
  const cutoff = Date.now() - maxAge;
  const keys = Array.from(activeReports.keys());
  for (const key of keys) {
    const report = activeReports.get(key);
    if (report && report.status !== "running" && report.lastUpdate.getTime() < cutoff) {
      activeReports.delete(key);
    }
  }
}

// Auto-cleanup old reports every 30 minutes
setInterval(() => cleanupReports(), 30 * 60 * 1000);
