/**
 * Scheduled Scans Router — CRUD + Results + Run Now
 * Manages automated periodic vulnerability scanning
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { scheduledScans, scanResults } from "../../drizzle/schema";
import { desc, eq, and, count, sql } from "drizzle-orm";
import { calculateNextRun, runScanNow } from "../scan-scheduler";
import { runAutoRemediation, getWPCredentialsForDomain, ALL_FIX_CATEGORIES, type FixCategory } from "../auto-remediation";
import type { AttackVectorResult } from "../comprehensive-attack-vectors";

export const scheduledScansRouter = router({
  // ─── List all scheduled scans ─────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    const database = await getDb();
    if (!database) return [];

    return database
      .select()
      .from(scheduledScans)
      .where(eq(scheduledScans.userId, ctx.user.id))
      .orderBy(desc(scheduledScans.createdAt));
  }),

  // ─── Get single scan with latest result ───────────
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) return null;

      const [scan] = await database
        .select()
        .from(scheduledScans)
        .where(and(
          eq(scheduledScans.id, input.id),
          eq(scheduledScans.userId, ctx.user.id),
        ));

      if (!scan) return null;

      // Get latest result
      const [latestResult] = await database
        .select()
        .from(scanResults)
        .where(eq(scanResults.scanId, scan.id))
        .orderBy(desc(scanResults.createdAt))
        .limit(1);

      // Get total results count
      const [resultCount] = await database
        .select({ count: count() })
        .from(scanResults)
        .where(eq(scanResults.scanId, scan.id));

      return {
        ...scan,
        latestResult: latestResult || null,
        totalResults: resultCount?.count || 0,
      };
    }),

  // ─── Create new scheduled scan ────────────────────
  create: protectedProcedure
    .input(z.object({
      domain: z.string().min(1).max(255),
      frequency: z.enum(["daily", "weekly", "biweekly", "monthly"]),
      scheduleDays: z.array(z.number().min(0).max(6)).optional(),
      scheduleHour: z.number().min(0).max(23).default(3),
      attackTypes: z.array(z.string()).optional(),
      enableComprehensive: z.boolean().default(true),
      enableIndirect: z.boolean().default(true),
      enableShellless: z.boolean().default(true),
      enableDns: z.boolean().default(false),
      telegramAlert: z.boolean().default(true),
      alertMinSeverity: z.enum(["critical", "high", "medium", "low", "info"]).default("high"),
      // Auto-Remediation
      autoRemediationEnabled: z.boolean().default(false),
      autoRemediationCategories: z.array(z.string()).optional(),
      autoRemediationDryRun: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Clean domain
      const domain = input.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

      // Calculate first run time
      const nextRunAt = calculateNextRun(
        input.frequency,
        input.scheduleDays || null,
        input.scheduleHour,
      );

      const [result] = await database.insert(scheduledScans).values({
        userId: ctx.user.id,
        domain,
        frequency: input.frequency,
        scheduleDays: input.scheduleDays || null,
        scheduleHour: input.scheduleHour,
        attackTypes: input.attackTypes || null,
        enableComprehensive: input.enableComprehensive,
        enableIndirect: input.enableIndirect,
        enableShellless: input.enableShellless,
        enableDns: input.enableDns,
        telegramAlert: input.telegramAlert,
        alertMinSeverity: input.alertMinSeverity,
        autoRemediationEnabled: input.autoRemediationEnabled,
        autoRemediationCategories: input.autoRemediationCategories || null,
        autoRemediationDryRun: input.autoRemediationDryRun,
        enabled: true,
        nextRunAt,
      });

      return { id: Number(result.insertId), nextRunAt };
    }),

  // ─── Update scheduled scan ────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      domain: z.string().min(1).max(255).optional(),
      frequency: z.enum(["daily", "weekly", "biweekly", "monthly"]).optional(),
      scheduleDays: z.array(z.number().min(0).max(6)).optional(),
      scheduleHour: z.number().min(0).max(23).optional(),
      attackTypes: z.array(z.string()).optional(),
      enableComprehensive: z.boolean().optional(),
      enableIndirect: z.boolean().optional(),
      enableShellless: z.boolean().optional(),
      enableDns: z.boolean().optional(),
      telegramAlert: z.boolean().optional(),
      alertMinSeverity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
      // Auto-Remediation
      autoRemediationEnabled: z.boolean().optional(),
      autoRemediationCategories: z.array(z.string()).optional(),
      autoRemediationDryRun: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      const { id, ...updates } = input;

      // Verify ownership
      const [scan] = await database
        .select()
        .from(scheduledScans)
        .where(and(
          eq(scheduledScans.id, id),
          eq(scheduledScans.userId, ctx.user.id),
        ));

      if (!scan) throw new Error("Scan not found");

      // Recalculate next run if schedule changed
      const newFrequency = updates.frequency || scan.frequency;
      const newDays = updates.scheduleDays !== undefined ? updates.scheduleDays : scan.scheduleDays as number[] | null;
      const newHour = updates.scheduleHour !== undefined ? updates.scheduleHour : scan.scheduleHour;

      const updateData: Record<string, any> = {};
      if (updates.domain) updateData.domain = updates.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (updates.frequency) updateData.frequency = updates.frequency;
      if (updates.scheduleDays !== undefined) updateData.scheduleDays = updates.scheduleDays;
      if (updates.scheduleHour !== undefined) updateData.scheduleHour = updates.scheduleHour;
      if (updates.attackTypes !== undefined) updateData.attackTypes = updates.attackTypes;
      if (updates.enableComprehensive !== undefined) updateData.enableComprehensive = updates.enableComprehensive;
      if (updates.enableIndirect !== undefined) updateData.enableIndirect = updates.enableIndirect;
      if (updates.enableShellless !== undefined) updateData.enableShellless = updates.enableShellless;
      if (updates.enableDns !== undefined) updateData.enableDns = updates.enableDns;
      if (updates.telegramAlert !== undefined) updateData.telegramAlert = updates.telegramAlert;
      if (updates.alertMinSeverity !== undefined) updateData.alertMinSeverity = updates.alertMinSeverity;
      if (updates.autoRemediationEnabled !== undefined) updateData.autoRemediationEnabled = updates.autoRemediationEnabled;
      if (updates.autoRemediationCategories !== undefined) updateData.autoRemediationCategories = updates.autoRemediationCategories;
      if (updates.autoRemediationDryRun !== undefined) updateData.autoRemediationDryRun = updates.autoRemediationDryRun;

      // Recalculate next run
      if (updates.frequency || updates.scheduleDays !== undefined || updates.scheduleHour !== undefined) {
        updateData.nextRunAt = calculateNextRun(newFrequency, newDays, newHour);
      }

      await database.update(scheduledScans).set(updateData).where(eq(scheduledScans.id, id));

      return { success: true };
    }),

  // ─── Delete scheduled scan ────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Verify ownership
      const [scan] = await database
        .select()
        .from(scheduledScans)
        .where(and(
          eq(scheduledScans.id, input.id),
          eq(scheduledScans.userId, ctx.user.id),
        ));

      if (!scan) throw new Error("Scan not found");

      // Delete results first
      await database.delete(scanResults).where(eq(scanResults.scanId, input.id));
      // Delete scan
      await database.delete(scheduledScans).where(eq(scheduledScans.id, input.id));

      return { success: true };
    }),

  // ─── Toggle enable/disable ────────────────────────
  toggle: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      const [scan] = await database
        .select()
        .from(scheduledScans)
        .where(and(
          eq(scheduledScans.id, input.id),
          eq(scheduledScans.userId, ctx.user.id),
        ));

      if (!scan) throw new Error("Scan not found");

      const newEnabled = !scan.enabled;
      const updateData: Record<string, any> = { enabled: newEnabled };

      // If re-enabling, recalculate next run
      if (newEnabled) {
        updateData.nextRunAt = calculateNextRun(
          scan.frequency,
          scan.scheduleDays as number[] | null,
          scan.scheduleHour,
        );
      }

      await database.update(scheduledScans).set(updateData).where(eq(scheduledScans.id, input.id));

      return { enabled: newEnabled };
    }),

  // ─── Get scan results history ─────────────────────
  results: protectedProcedure
    .input(z.object({
      scanId: z.number(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) return { results: [], total: 0 };

      // Verify ownership
      const [scan] = await database
        .select()
        .from(scheduledScans)
        .where(and(
          eq(scheduledScans.id, input.scanId),
          eq(scheduledScans.userId, ctx.user.id),
        ));

      if (!scan) return { results: [], total: 0 };

      const offset = (input.page - 1) * input.limit;

      const results = await database
        .select()
        .from(scanResults)
        .where(eq(scanResults.scanId, input.scanId))
        .orderBy(desc(scanResults.createdAt))
        .limit(input.limit)
        .offset(offset);

      const [totalCount] = await database
        .select({ count: count() })
        .from(scanResults)
        .where(eq(scanResults.scanId, input.scanId));

      return {
        results,
        total: totalCount?.count || 0,
      };
    }),

  // ─── Get single result detail ─────────────────────
  resultDetail: protectedProcedure
    .input(z.object({ resultId: z.number() }))
    .query(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) return null;

      const [result] = await database
        .select()
        .from(scanResults)
        .where(and(
          eq(scanResults.id, input.resultId),
          eq(scanResults.userId, ctx.user.id),
        ));

      return result || null;
    }),

  // ─── Run scan immediately ─────────────────────────
  runNow: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Verify ownership
      const [scan] = await database
        .select()
        .from(scheduledScans)
        .where(and(
          eq(scheduledScans.id, input.id),
          eq(scheduledScans.userId, ctx.user.id),
        ));

      if (!scan) throw new Error("Scan not found");
      if (scan.lastRunStatus === "running") throw new Error("Scan is already running");

      // Run in background (don't await — it can take minutes)
      runScanNow(input.id).catch(err => {
        console.error(`[ScheduledScans] RunNow failed for scan ${input.id}:`, err.message);
      });

      return { success: true, message: "Scan started in background" };
    }),

  // ─── Run auto-remediation on latest scan result ───
  runRemediation: protectedProcedure
    .input(z.object({
      scanId: z.number(),
      dryRun: z.boolean().default(false),
      categories: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      // Verify ownership
      const [scan] = await database
        .select()
        .from(scheduledScans)
        .where(and(
          eq(scheduledScans.id, input.scanId),
          eq(scheduledScans.userId, ctx.user.id),
        ));

      if (!scan) throw new Error("Scan not found");

      // Get latest scan result
      const [latestResult] = await database
        .select()
        .from(scanResults)
        .where(eq(scanResults.scanId, input.scanId))
        .orderBy(desc(scanResults.createdAt))
        .limit(1);

      if (!latestResult || !latestResult.findings) {
        throw new Error("No scan results found. Run a scan first.");
      }

      const findings = latestResult.findings as AttackVectorResult[];
      const wpCreds = await getWPCredentialsForDomain(scan.domain);

      const result = await runAutoRemediation({
        domain: scan.domain,
        userId: ctx.user.id,
        scanResultId: latestResult.id,
        findings,
        wpCredentials: wpCreds || undefined,
        autoFixEnabled: true,
        fixCategories: (input.categories as FixCategory[]) || [
          "security_headers", "ssl_tls", "plugin_management", "clickjacking",
          "session_security", "information_disclosure", "maintenance_mode", "mixed_content",
        ],
        dryRun: input.dryRun,
        notifyTelegram: scan.telegramAlert,
      });

      // Update scan stats
      if (result.fixedCount > 0) {
        await database.update(scheduledScans).set({
          lastRemediationAt: new Date(),
          totalRemediations: (scan.totalRemediations || 0) + 1,
          totalFixesApplied: (scan.totalFixesApplied || 0) + result.fixedCount,
        }).where(eq(scheduledScans.id, input.scanId));
      }

      return result;
    }),

  // ─── Get available fix categories ─────────────────
  fixCategories: protectedProcedure.query(() => {
    return ALL_FIX_CATEGORIES;
  }),

  // ─── Dashboard stats ──────────────────────────────
  stats: protectedProcedure.query(async ({ ctx }) => {
    const database = await getDb();
    if (!database) return { totalScans: 0, activeScans: 0, totalResults: 0, totalFindings: 0 };

    const [totalScans] = await database
      .select({ count: count() })
      .from(scheduledScans)
      .where(eq(scheduledScans.userId, ctx.user.id));

    const [activeScans] = await database
      .select({ count: count() })
      .from(scheduledScans)
      .where(and(
        eq(scheduledScans.userId, ctx.user.id),
        eq(scheduledScans.enabled, true),
      ));

    const [totalResults] = await database
      .select({ count: count() })
      .from(scanResults)
      .where(eq(scanResults.userId, ctx.user.id));

    const [findingsSum] = await database
      .select({ total: sql<number>`COALESCE(SUM(${scanResults.totalFindings}), 0)` })
      .from(scanResults)
      .where(eq(scanResults.userId, ctx.user.id));

    return {
      totalScans: totalScans?.count || 0,
      activeScans: activeScans?.count || 0,
      totalResults: totalResults?.count || 0,
      totalFindings: Number(findingsSum?.total) || 0,
    };
  }),
});
