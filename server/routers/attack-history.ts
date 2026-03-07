import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getAttackStats, getSuccessfulMethods } from "../db";
import { getDb } from "../db";
import { aiAttackHistory } from "../../drizzle/schema";
import { desc, eq, and, like, count } from "drizzle-orm";

export const attackHistoryRouter = router({
  // Get attack statistics
  stats: protectedProcedure.query(async () => {
    return getAttackStats();
  }),

  // Get successful methods for a specific target profile
  successfulMethods: protectedProcedure
    .input(z.object({
      serverType: z.string().optional(),
      cms: z.string().optional(),
      language: z.string().optional(),
      waf: z.string().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return getSuccessfulMethods({
        serverType: input.serverType || null,
        cms: input.cms || null,
        language: input.language || null,
        waf: input.waf || null,
        limit: input.limit,
      });
    }),

  // Get recent attack history with pagination
  recent: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      targetDomain: z.string().optional(),
      successOnly: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions = [];
      if (input.targetDomain) {
        conditions.push(like(aiAttackHistory.targetDomain, `%${input.targetDomain}%`));
      }
      if (input.successOnly) {
        conditions.push(eq(aiAttackHistory.success, true));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRow] = await db
        .select({ cnt: count() })
        .from(aiAttackHistory)
        .where(whereClause);

      const items = await db
        .select()
        .from(aiAttackHistory)
        .where(whereClause)
        .orderBy(desc(aiAttackHistory.createdAt))
        .limit(input.limit)
        .offset((input.page - 1) * input.limit);

      return {
        items,
        total: totalRow?.cnt || 0,
      };
    }),

  // Get learning insights — what works for what platform
  insights: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { byPlatform: [], byMethod: [], byLanguage: [], byWaf: [] };

    try {
      // Success rate by platform (server type)
      const byPlatform = await db
        .select({
          platform: aiAttackHistory.serverType,
          total: count(),
          success: count(aiAttackHistory.success),
        })
        .from(aiAttackHistory)
        .groupBy(aiAttackHistory.serverType)
        .orderBy(desc(count()))
        .limit(15);

      // Success rate by method
      const byMethod = await db
        .select({
          method: aiAttackHistory.method,
          total: count(),
        })
        .from(aiAttackHistory)
        .where(eq(aiAttackHistory.success, true))
        .groupBy(aiAttackHistory.method)
        .orderBy(desc(count()))
        .limit(15);

      // Success rate by language
      const byLanguage = await db
        .select({
          language: aiAttackHistory.language,
          total: count(),
        })
        .from(aiAttackHistory)
        .where(eq(aiAttackHistory.success, true))
        .groupBy(aiAttackHistory.language)
        .orderBy(desc(count()))
        .limit(10);

      // Success rate by WAF
      const byWaf = await db
        .select({
          waf: aiAttackHistory.waf,
          total: count(),
        })
        .from(aiAttackHistory)
        .where(eq(aiAttackHistory.success, true))
        .groupBy(aiAttackHistory.waf)
        .orderBy(desc(count()))
        .limit(10);

      return { byPlatform, byMethod, byLanguage, byWaf };
    } catch (error) {
      console.warn("[Attack History] Failed to get insights:", error);
      return { byPlatform: [], byMethod: [], byLanguage: [], byWaf: [] };
    }
  }),
});
