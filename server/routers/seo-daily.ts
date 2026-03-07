/**
 * SEO Daily Router — Daily AI Tasks, Timeline, Verification, Auto-Start
 * 
 * Procedures:
 * - dailyPlan: Generate AI daily task plan
 * - runDaily: Execute full daily automation
 * - timeline: Get keyword ranking timeline estimation
 * - actionLog: Get action log with proof-of-work
 * - autoStartAfterScan: Trigger auto-start
 * - updateSchedule: Update daily schedule settings
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { generateDailyPlan, runDailyAutomation, type DailyPlan, type DailyReport } from "../seo-daily-engine";
import { estimateProjectTimeline, estimateKeywordTimeline, type ProjectTimeline } from "../seo-timeline-estimator";
import { autoStartAfterScan } from "../seo-scheduler";
import { calculateNextRunMultiDay } from "./seo-automation";

export const seoDailyRouter = router({
  /**
   * Generate AI daily task plan (preview — does not execute)
   */
  generatePlan: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }): Promise<DailyPlan> => {
      return generateDailyPlan(input.projectId);
    }),

  /**
   * Execute full daily AI automation
   */
  runDaily: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }): Promise<DailyReport> => {
      return runDailyAutomation(input.projectId);
    }),

  /**
   * Get keyword ranking timeline estimation
   */
  timeline: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }): Promise<ProjectTimeline> => {
      return estimateProjectTimeline(input.projectId);
    }),

  /**
   * Estimate single keyword timeline
   */
  keywordTimeline: protectedProcedure
    .input(z.object({
      keyword: z.string(),
      searchVolume: z.number().default(1000),
      currentPosition: z.number().nullable().default(null),
      currentDA: z.number().default(0),
      niche: z.string().default("gambling"),
      strategy: z.string().default("grey_hat"),
      aggressiveness: z.number().default(5),
    }))
    .query(({ input }) => {
      return estimateKeywordTimeline(input);
    }),

  /**
   * Get action log with proof-of-work verification
   */
  verificationLog: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      limit: z.number().default(50),
      category: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const actions = await db.getProjectActions(input.projectId, input.limit);
      
      // Filter by category if specified
      const filtered = input.category
        ? actions.filter(a => a.actionType === input.category)
        : actions;

      // Enrich with verification status
      return filtered.map(action => ({
        ...action,
        hasProof: !!(action.result && typeof action.result === "object" && "proof" in (action.result as any)),
        proofType: (action.result as any)?.proof?.type || null,
        proofUrl: (action.result as any)?.proof?.url || null,
        proofData: (action.result as any)?.proof?.data || null,
        verifiedAt: (action.result as any)?.proof?.verifiedAt || null,
      }));
    }),

  /**
   * Trigger auto-start SEO after scan
   */
  autoStart: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }) => {
      // Run in background (don't await — it takes a while)
      autoStartAfterScan(input.projectId).catch(err =>
        console.error("[Auto-Start] Error:", err.message)
      );
      return { started: true, message: "เริ่มทำ SEO อัตโนมัติแล้ว — ระบบกำลังทำงานอยู่เบื้องหลัง" };
    }),

  /**
   * Update daily schedule settings
   */
  updateSchedule: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      enabled: z.boolean(),
      days: z.array(z.number().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
      hour: z.number().min(0).max(23).default(3),
    }))
    .mutation(async ({ input }) => {
      const nextRun = input.enabled
        ? calculateNextRunMultiDay(input.days, input.hour)
        : null;

      await db.updateSeoProject(input.projectId, {
        autoRunEnabled: input.enabled,
        autoRunDays: input.days as any,
        autoRunDay: input.days[0] ?? 1,
        autoRunHour: input.hour,
        nextAutoRunAt: nextRun,
      });

      return {
        enabled: input.enabled,
        days: input.days,
        hour: input.hour,
        nextRunAt: nextRun?.toISOString() || null,
      };
    }),

  /**
   * Get daily automation status for a project
   */
  status: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");

      const recentActions = await db.getProjectActions(input.projectId, 10);
      const lastDailyRun = recentActions.find(a => a.title?.includes("[Daily"));

      return {
        autoRunEnabled: project.autoRunEnabled,
        autoRunDays: project.autoRunDays as number[] | null,
        autoRunHour: project.autoRunHour,
        nextAutoRunAt: project.nextAutoRunAt?.toISOString() || null,
        lastAutoRunAt: project.lastAutoRunAt?.toISOString() || null,
        autoRunCount: project.autoRunCount ?? 0,
        lastAutoRunResult: project.lastAutoRunResult,
        lastDailyAction: lastDailyRun ? {
          id: lastDailyRun.id,
          title: lastDailyRun.title,
          status: lastDailyRun.status,
          executedAt: lastDailyRun.executedAt,
          completedAt: lastDailyRun.completedAt,
          result: lastDailyRun.result,
        } : null,
      };
    }),
});
