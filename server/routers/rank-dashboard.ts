/**
 * Rank Tracking Dashboard Router
 * 
 * Standalone rank tracking dashboard with:
 * - Cross-project keyword overview
 * - Time-series chart data
 * - SerpAPI-powered live rank checks
 * - Keyword management (add/remove/bulk check)
 * - SerpAPI usage stats
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import * as serpApi from "../serp-api";
import * as serpTracker from "../serp-tracker";

export const rankDashboardRouter = router({
  // ═══ Dashboard Stats ═══
  stats: protectedProcedure
    .query(async () => {
      const stats = await db.getRankDashboardStats();
      return stats || {
        totalKeywords: 0, rankedKeywords: 0, notRanked: 0,
        avgPosition: 0, top3: 0, top10: 0, top20: 0, top50: 0,
        improved: 0, declined: 0, stable: 0, newKeywords: 0,
      };
    }),

  // ═══ SerpAPI Account Info ═══
  serpApiStatus: protectedProcedure
    .query(async () => {
      const info = await serpApi.getAccountInfo();
      return info || { plan: "unavailable", searchesPerMonth: 0, thisMonthUsage: 0, remaining: 0 };
    }),

  // ═══ Keyword List (unique keywords with latest positions) ═══
  keywords: protectedProcedure
    .query(async () => {
      const keywords = await db.getUniqueTrackedKeywords();
      // Also get project names for display
      const projects = await db.getUserSeoProjects();
      const projectMap = new Map(projects.map(p => [p.id, p]));

      return keywords.map(kw => ({
        ...kw,
        projectDomain: projectMap.get(kw.projectId)?.domain || "Unknown",
        projectName: projectMap.get(kw.projectId)?.name || projectMap.get(kw.projectId)?.domain || "Unknown",
      }));
    }),

  // ═══ Time-Series Data for a Keyword ═══
  timeSeries: protectedProcedure
    .input(z.object({
      keyword: z.string().min(1),
      projectId: z.number().optional(),
      days: z.number().default(90),
    }))
    .query(async ({ input }) => {
      return db.getKeywordRankTimeSeries(input.keyword, input.projectId, input.days);
    }),

  // ═══ Multi-Keyword Time-Series (for chart overlay) ═══
  multiTimeSeries: protectedProcedure
    .input(z.object({
      keywords: z.array(z.string()).min(1).max(10),
      projectId: z.number().optional(),
      days: z.number().default(90),
    }))
    .query(async ({ input }) => {
      const result: Record<string, { position: number | null; trackedAt: Date; projectId: number }[]> = {};
      for (const kw of input.keywords) {
        result[kw] = await db.getKeywordRankTimeSeries(kw, input.projectId, input.days);
      }
      return result;
    }),

  // ═══ Live Rank Check (single keyword via SerpAPI) ═══
  checkRank: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      keyword: z.string().min(1),
      country: z.string().default("US"),
      device: z.enum(["desktop", "mobile"]).default("desktop"),
    }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");

      // Get previous position
      const history = await db.getKeywordRankHistory(input.projectId, input.keyword);
      const prevPosition = history.length > 0 ? history[0].position : null;

      const result = await serpTracker.checkKeywordRank(
        project.domain, input.keyword, input.country, input.device, prevPosition,
      );

      // Save to DB
      await db.addRankEntry(input.projectId, {
        keyword: input.keyword,
        position: result.position,
        previousPosition: prevPosition,
        positionChange: result.change !== 0 ? result.change : undefined,
        searchEngine: result.searchEngine,
        country: result.country,
        device: result.device,
        searchVolume: result.searchVolume,
        keywordDifficulty: result.difficulty,
        cpc: String(result.cpc),
        serpUrl: result.url || undefined,
        serpTitle: result.title || undefined,
        serpSnippet: result.snippet || undefined,
        serpFeatures: result.serpFeatures.map(f => f.type) as any,
        trend: result.change > 0 ? "rising" : result.change < 0 ? "falling" : result.position === null ? "new" : "stable",
        bestPosition: prevPosition !== null && result.position !== null
          ? Math.min(prevPosition, result.position)
          : result.position ?? undefined,
      });

      return result;
    }),

  // ═══ Bulk Rank Check (all keywords for a project) ═══
  bulkCheck: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      country: z.string().default("US"),
      device: z.enum(["desktop", "mobile"]).default("desktop"),
    }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");

      const rankings = await db.getLatestRankings(input.projectId);
      if (rankings.length === 0) {
        throw new Error("No keywords tracked for this project. Add keywords first.");
      }

      const keywords = rankings.map(r => ({
        keyword: r.keyword,
        previousPosition: r.position,
        searchVolume: r.searchVolume || undefined,
      }));

      // Deduplicate keywords
      const seen = new Set<string>();
      const uniqueKeywords = keywords.filter(kw => {
        if (seen.has(kw.keyword)) return false;
        seen.add(kw.keyword);
        return true;
      });

      const result = await serpTracker.bulkRankCheck(
        input.projectId, project.domain, uniqueKeywords, input.country, input.device,
      );

      return result;
    }),

  // ═══ Add Keyword to Track ═══
  addKeyword: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      keyword: z.string().min(1),
      searchEngine: z.string().default("google"),
      country: z.string().default("US"),
      device: z.enum(["desktop", "mobile"]).default("desktop"),
    }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");

      return db.addRankEntry(input.projectId, {
        keyword: input.keyword,
        searchEngine: input.searchEngine,
        country: input.country,
        device: input.device,
        trend: "new",
      });
    }),

  // ═══ Add Multiple Keywords ═══
  addKeywords: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      keywords: z.array(z.string().min(1)).min(1).max(50),
      searchEngine: z.string().default("google"),
      country: z.string().default("US"),
      device: z.enum(["desktop", "mobile"]).default("desktop"),
    }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");

      const results = [];
      for (const keyword of input.keywords) {
        const entry = await db.addRankEntry(input.projectId, {
          keyword,
          searchEngine: input.searchEngine,
          country: input.country,
          device: input.device,
          trend: "new",
        });
        results.push(entry);
      }

      return { count: results.length };
    }),

  // ═══ Remove Keyword ═══
  removeKeyword: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      keyword: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      await db.deleteKeywordFromProject(input.projectId, input.keyword);
      return { success: true };
    }),

  // ═══ Projects List (for dropdown) ═══
  projects: protectedProcedure
    .query(async () => {
      const projects = await db.getUserSeoProjects();
      return projects.map(p => ({
        id: p.id,
        domain: p.domain,
        name: p.name || p.domain,
        status: p.status,
        currentDA: p.currentDA,
        currentDR: p.currentDR,
      }));
    }),

  // ═══ Position Distribution (for pie/bar chart) ═══
  positionDistribution: protectedProcedure
    .input(z.object({ projectId: z.number().optional() }))
    .query(async ({ input }) => {
      const keywords = await db.getUniqueTrackedKeywords();
      const filtered = input.projectId
        ? keywords.filter(k => k.projectId === input.projectId)
        : keywords;

      const ranked = filtered.filter(k => k.position !== null && k.position > 0);
      return {
        top3: ranked.filter(k => k.position! <= 3).length,
        top4to10: ranked.filter(k => k.position! >= 4 && k.position! <= 10).length,
        top11to20: ranked.filter(k => k.position! >= 11 && k.position! <= 20).length,
        top21to50: ranked.filter(k => k.position! >= 21 && k.position! <= 50).length,
        top51plus: ranked.filter(k => k.position! > 50).length,
        notRanked: filtered.length - ranked.length,
      };
    }),
});
