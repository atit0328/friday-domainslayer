/**
 * Adaptive Learning Engine — AI Strategy Memory & Evolution
 *
 * Records every attack outcome, aggregates patterns, and feeds
 * historical intelligence back to the AI Attack Strategist.
 *
 * Core functions:
 *   1. recordAttackOutcome()       — Save full attack context + result to DB
 *   2. queryHistoricalPatterns()   — Find similar past attacks by CMS/WAF/server/method
 *   3. calculateMethodSuccessRates() — Per-method success rates by CMS, WAF, server type
 *   4. getLearnedInsights()        — LLM synthesizes patterns from historical data
 *   5. suggestBestStrategy()       — Recommend optimal strategy based on learned patterns
 *   6. updateLearnedPatterns()     — Aggregate logs into learned_patterns table
 *   7. getCmsAttackProfile()       — Get learned attack profile for specific CMS
 *   8. updateCmsProfiles()         — Rebuild CMS attack profiles from outcome logs
 *   9. getAdaptiveLearningStats()  — Dashboard stats for the learning system
 */
import { getDb } from "./db";
import {
  strategyOutcomeLogs, InsertStrategyOutcomeLog,
  learnedPatterns, InsertLearnedPattern,
  cmsAttackProfiles, InsertCmsAttackProfile,
} from "../drizzle/schema";
import { eq, desc, and, sql, like, or, count, avg } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface AttackOutcome {
  targetDomain: string;
  cms: string | null;
  cmsVersion: string | null;
  serverType: string | null;
  phpVersion: string | null;
  wafDetected: string | null;
  wafStrength: string | null;
  vulnScore: number | null;
  method: string;
  exploitType: string | null;
  payloadType: string | null;
  wafBypassUsed: string[];
  payloadModifications: string[];
  attackPath: string | null;
  attemptNumber: number;
  isRetry: boolean;
  previousMethodsTried: string[];
  success: boolean;
  httpStatus: number | null;
  errorCategory: string | null;
  errorMessage: string | null;
  filesPlaced: number;
  redirectVerified: boolean;
  durationMs: number | null;
  aiFailureCategory: string | null;
  aiReasoning: string | null;
  aiConfidence: number | null;
  aiEstimatedSuccess: number | null;
  sessionId: number | null;
  agenticSessionId: number | null;
}

export interface HistoricalPattern {
  method: string;
  totalAttempts: number;
  totalSuccesses: number;
  successRate: number;
  avgDuration: number;
  commonErrors: string[];
  bestPayloadMods: string[];
  bestWafBypasses: string[];
}

export interface MethodSuccessRate {
  method: string;
  attempts: number;
  successes: number;
  successRate: number;
  avgDuration: number;
  lastSuccess: Date | null;
}

export interface LearnedInsight {
  patternType: string;
  patternKey: string;
  insight: string;
  recommendation: string;
  confidence: number;
  successRate: number;
  sampleSize: number;
}

export interface StrategyRecommendation {
  recommendedMethod: string;
  estimatedSuccessRate: number;
  reasoning: string;
  payloadModifications: string[];
  wafBypassTechniques: string[];
  attackPath: string;
  confidence: number;
  basedOnSamples: number;
  alternativeMethods: Array<{
    method: string;
    successRate: number;
    reason: string;
  }>;
}

export interface AdaptiveLearningStats {
  totalOutcomesRecorded: number;
  totalSuccesses: number;
  totalFailures: number;
  overallSuccessRate: number;
  totalLearnedPatterns: number;
  totalCmsProfiles: number;
  topMethods: MethodSuccessRate[];
  recentTrend: {
    last24h: { attempts: number; successes: number; rate: number };
    last7d: { attempts: number; successes: number; rate: number };
    last30d: { attempts: number; successes: number; rate: number };
  };
  mostAttackedCms: Array<{ cms: string; count: number; successRate: number }>;
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function extractContent(response: any): string | null {
  try {
    const c = response?.choices?.[0]?.message?.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      const t = c.find((p: any) => p.type === "text");
      if (t && typeof t.text === "string") return t.text;
    }
    return null;
  } catch {
    return null;
  }
}

function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════
//  1. RECORD ATTACK OUTCOME
// ═══════════════════════════════════════════════════════

export async function recordAttackOutcome(outcome: AttackOutcome): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[AdaptiveLearning] DB not available, skipping outcome recording");
      return null;
    }

    const insert: InsertStrategyOutcomeLog = {
      targetDomain: outcome.targetDomain,
      cms: outcome.cms,
      cmsVersion: outcome.cmsVersion,
      serverType: outcome.serverType,
      phpVersion: outcome.phpVersion,
      wafDetected: outcome.wafDetected,
      wafStrength: outcome.wafStrength,
      vulnScore: outcome.vulnScore,
      method: outcome.method,
      exploitType: outcome.exploitType,
      payloadType: outcome.payloadType,
      wafBypassUsed: outcome.wafBypassUsed,
      payloadModifications: outcome.payloadModifications,
      attackPath: outcome.attackPath,
      attemptNumber: outcome.attemptNumber,
      isRetry: outcome.isRetry,
      previousMethodsTried: outcome.previousMethodsTried,
      success: outcome.success,
      httpStatus: outcome.httpStatus,
      errorCategory: outcome.errorCategory,
      errorMessage: outcome.errorMessage,
      filesPlaced: outcome.filesPlaced,
      redirectVerified: outcome.redirectVerified,
      durationMs: outcome.durationMs,
      aiFailureCategory: outcome.aiFailureCategory,
      aiReasoning: outcome.aiReasoning,
      aiConfidence: outcome.aiConfidence,
      aiEstimatedSuccess: outcome.aiEstimatedSuccess,
      sessionId: outcome.sessionId,
      agenticSessionId: outcome.agenticSessionId,
    };

    const result = await db.insert(strategyOutcomeLogs).values(insert);
    const insertId = (result as any)[0]?.insertId ?? null;
    console.log(`[AdaptiveLearning] Recorded outcome #${insertId} for ${outcome.targetDomain} — ${outcome.method}: ${outcome.success ? "SUCCESS" : "FAIL"}`);
    return insertId;
  } catch (e: any) {
    console.error(`[AdaptiveLearning] recordAttackOutcome error: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
//  2. QUERY HISTORICAL PATTERNS
// ═══════════════════════════════════════════════════════

export async function queryHistoricalPatterns(filters: {
  cms?: string;
  waf?: string;
  serverType?: string;
  method?: string;
  limit?: number;
}): Promise<HistoricalPattern[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const conditions: any[] = [];
    if (filters.cms) conditions.push(eq(strategyOutcomeLogs.cms, filters.cms));
    if (filters.waf) conditions.push(eq(strategyOutcomeLogs.wafDetected, filters.waf));
    if (filters.serverType) conditions.push(eq(strategyOutcomeLogs.serverType, filters.serverType));
    if (filters.method) conditions.push(eq(strategyOutcomeLogs.method, filters.method));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        method: strategyOutcomeLogs.method,
        totalAttempts: count(),
        totalSuccesses: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
        avgDuration: avg(strategyOutcomeLogs.durationMs),
      })
      .from(strategyOutcomeLogs)
      .where(whereClause)
      .groupBy(strategyOutcomeLogs.method)
      .orderBy(desc(sql`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`))
      .limit(filters.limit || 20);

    // For each method, also get common errors and best payload mods
    const patterns: HistoricalPattern[] = [];
    for (const row of rows) {
      const attempts = Number(row.totalAttempts) || 0;
      const successes = Number(row.totalSuccesses) || 0;

      // Get common errors for this method
      const errorRows = await db
        .select({ errorCategory: strategyOutcomeLogs.errorCategory })
        .from(strategyOutcomeLogs)
        .where(and(
          eq(strategyOutcomeLogs.method, row.method),
          eq(strategyOutcomeLogs.success, false),
          ...(whereClause ? [whereClause] : []),
        ))
        .limit(50);
      const errorCounts: Record<string, number> = {};
      for (const er of errorRows) {
        const cat = er.errorCategory || "unknown";
        errorCounts[cat] = (errorCounts[cat] || 0) + 1;
      }
      const commonErrors = Object.entries(errorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k]) => k);

      // Get best payload mods from successful attacks
      const successRows = await db
        .select({
          payloadModifications: strategyOutcomeLogs.payloadModifications,
          wafBypassUsed: strategyOutcomeLogs.wafBypassUsed,
        })
        .from(strategyOutcomeLogs)
        .where(and(
          eq(strategyOutcomeLogs.method, row.method),
          eq(strategyOutcomeLogs.success, true),
          ...(whereClause ? [whereClause] : []),
        ))
        .limit(20);

      const payloadModCounts: Record<string, number> = {};
      const bypassCounts: Record<string, number> = {};
      for (const sr of successRows) {
        const mods = sr.payloadModifications as string[] | null;
        if (mods) for (const m of mods) payloadModCounts[m] = (payloadModCounts[m] || 0) + 1;
        const bypasses = sr.wafBypassUsed as string[] | null;
        if (bypasses) for (const b of bypasses) bypassCounts[b] = (bypassCounts[b] || 0) + 1;
      }

      patterns.push({
        method: row.method,
        totalAttempts: attempts,
        totalSuccesses: successes,
        successRate: attempts > 0 ? Math.round((successes / attempts) * 100) : 0,
        avgDuration: Math.round(Number(row.avgDuration) || 0),
        commonErrors,
        bestPayloadMods: Object.entries(payloadModCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k]) => k),
        bestWafBypasses: Object.entries(bypassCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k]) => k),
      });
    }

    return patterns;
  } catch (e: any) {
    console.error(`[AdaptiveLearning] queryHistoricalPatterns error: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
//  3. CALCULATE METHOD SUCCESS RATES
// ═══════════════════════════════════════════════════════

export async function calculateMethodSuccessRates(filters?: {
  cms?: string;
  waf?: string;
  serverType?: string;
  minAttempts?: number;
}): Promise<MethodSuccessRate[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const conditions: any[] = [];
    if (filters?.cms) conditions.push(eq(strategyOutcomeLogs.cms, filters.cms));
    if (filters?.waf) conditions.push(eq(strategyOutcomeLogs.wafDetected, filters.waf));
    if (filters?.serverType) conditions.push(eq(strategyOutcomeLogs.serverType, filters.serverType));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        method: strategyOutcomeLogs.method,
        attempts: count(),
        successes: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
        avgDuration: avg(strategyOutcomeLogs.durationMs),
        lastSuccess: sql<Date>`MAX(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN ${strategyOutcomeLogs.createdAt} ELSE NULL END)`,
      })
      .from(strategyOutcomeLogs)
      .where(whereClause)
      .groupBy(strategyOutcomeLogs.method)
      .orderBy(desc(sql`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`));

    const minAttempts = filters?.minAttempts || 0;
    return rows
      .map((r) => ({
        method: r.method,
        attempts: Number(r.attempts) || 0,
        successes: Number(r.successes) || 0,
        successRate: Number(r.attempts) > 0
          ? Math.round((Number(r.successes) / Number(r.attempts)) * 100)
          : 0,
        avgDuration: Math.round(Number(r.avgDuration) || 0),
        lastSuccess: r.lastSuccess || null,
      }))
      .filter((r) => r.attempts >= minAttempts);
  } catch (e: any) {
    console.error(`[AdaptiveLearning] calculateMethodSuccessRates error: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
//  4. GET LEARNED INSIGHTS (LLM-Synthesized)
// ═══════════════════════════════════════════════════════

export async function getLearnedInsights(filters?: {
  cms?: string;
  waf?: string;
  limit?: number;
}): Promise<LearnedInsight[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const conditions: any[] = [];
    if (filters?.cms) {
      conditions.push(
        or(
          like(learnedPatterns.patternKey, `${filters.cms}:%`),
          eq(learnedPatterns.patternKey, filters.cms),
        )
      );
    }
    if (filters?.waf) {
      conditions.push(
        or(
          like(learnedPatterns.patternKey, `${filters.waf}:%`),
          eq(learnedPatterns.patternKey, filters.waf),
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(learnedPatterns)
      .where(whereClause)
      .orderBy(desc(learnedPatterns.confidenceScore))
      .limit(filters?.limit || 50);

    return rows.map((r) => ({
      patternType: r.patternType,
      patternKey: r.patternKey,
      insight: r.aiInsight || "",
      recommendation: r.aiRecommendation || "",
      confidence: r.confidenceScore,
      successRate: Number(r.successRate) || 0,
      sampleSize: r.totalAttempts,
    }));
  } catch (e: any) {
    console.error(`[AdaptiveLearning] getLearnedInsights error: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
//  5. SUGGEST BEST STRATEGY (AI + Historical Data)
// ═══════════════════════════════════════════════════════

export async function suggestBestStrategy(target: {
  domain: string;
  cms: string | null;
  cmsVersion: string | null;
  serverType: string | null;
  wafDetected: string | null;
  wafStrength: string | null;
  vulnScore: number;
  hasOpenUpload: boolean;
  hasExposedAdmin: boolean;
  hasVulnerableCms: boolean;
  knownCves: string[];
}, availableMethods: string[]): Promise<StrategyRecommendation> {
  const fallback: StrategyRecommendation = {
    recommendedMethod: availableMethods[0] || "cve_exploit",
    estimatedSuccessRate: 30,
    reasoning: "No historical data available — using default strategy",
    payloadModifications: [],
    wafBypassTechniques: [],
    attackPath: "Standard attack path",
    confidence: 10,
    basedOnSamples: 0,
    alternativeMethods: [],
  };

  try {
    // Gather historical data for this target profile
    const [cmsPatterns, wafPatterns, globalRates] = await Promise.all([
      target.cms ? queryHistoricalPatterns({ cms: target.cms }) : Promise.resolve([]),
      target.wafDetected ? queryHistoricalPatterns({ waf: target.wafDetected }) : Promise.resolve([]),
      calculateMethodSuccessRates({ minAttempts: 3 }),
    ]);

    // Get CMS profile if available
    let cmsProfile = null;
    if (target.cms) {
      cmsProfile = await getCmsAttackProfile(target.cms);
    }

    // Get relevant learned patterns
    const insights = await getLearnedInsights({
      cms: target.cms || undefined,
      waf: target.wafDetected || undefined,
      limit: 10,
    });

    const historicalContext = {
      cmsPatterns: cmsPatterns.slice(0, 10),
      wafPatterns: wafPatterns.slice(0, 10),
      globalMethodRates: globalRates.slice(0, 15),
      cmsProfile: cmsProfile ? {
        bestMethod: cmsProfile.bestMethod,
        overallSuccessRate: Number(cmsProfile.overallSuccessRate),
        methodRankings: (cmsProfile.methodRankings as any[])?.slice(0, 8),
        commonWafs: cmsProfile.commonWafs,
      } : null,
      learnedInsights: insights.slice(0, 5).map((i) => ({
        key: i.patternKey,
        insight: i.insight,
        recommendation: i.recommendation,
        successRate: i.successRate,
      })),
    };

    const totalSamples = cmsPatterns.reduce((s, p) => s + p.totalAttempts, 0)
      + wafPatterns.reduce((s, p) => s + p.totalAttempts, 0);

    if (totalSamples === 0 && globalRates.length === 0) {
      return fallback;
    }

    // Ask LLM to synthesize the best strategy
    const res = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are an expert penetration tester AI with access to a historical database of attack outcomes. " +
            "Based on the target profile and historical success/failure data, recommend the optimal attack strategy. " +
            "Prioritize methods with proven high success rates for similar targets. " +
            "Consider CMS type, WAF presence, server type, and known vulnerabilities. " +
            "Return JSON matching the schema.",
        },
        {
          role: "user",
          content: JSON.stringify({
            target: {
              domain: target.domain,
              cms: target.cms,
              cmsVersion: target.cmsVersion,
              serverType: target.serverType,
              wafDetected: target.wafDetected,
              wafStrength: target.wafStrength,
              vulnScore: target.vulnScore,
              hasOpenUpload: target.hasOpenUpload,
              hasExposedAdmin: target.hasExposedAdmin,
              hasVulnerableCms: target.hasVulnerableCms,
              knownCves: target.knownCves.slice(0, 10),
            },
            availableMethods,
            historicalData: historicalContext,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "strategy_recommendation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              recommendedMethod: { type: "string" },
              estimatedSuccessRate: { type: "integer" },
              reasoning: { type: "string" },
              payloadModifications: { type: "array", items: { type: "string" } },
              wafBypassTechniques: { type: "array", items: { type: "string" } },
              attackPath: { type: "string" },
              confidence: { type: "integer" },
              alternativeMethods: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    method: { type: "string" },
                    successRate: { type: "integer" },
                    reason: { type: "string" },
                  },
                  required: ["method", "successRate", "reason"],
                  additionalProperties: false,
                },
              },
            },
            required: [
              "recommendedMethod", "estimatedSuccessRate", "reasoning",
              "payloadModifications", "wafBypassTechniques", "attackPath",
              "confidence", "alternativeMethods",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = safeParse<StrategyRecommendation>(extractContent(res), fallback);
    parsed.basedOnSamples = totalSamples;
    return parsed;
  } catch (e: any) {
    console.error(`[AdaptiveLearning] suggestBestStrategy error: ${e.message}`);
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════
//  6. UPDATE LEARNED PATTERNS (Periodic Aggregation)
// ═══════════════════════════════════════════════════════

export async function updateLearnedPatterns(): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;

    let patternsUpdated = 0;

    // A) Aggregate cms:method patterns
    const cmsMethodRows = await db
      .select({
        cms: strategyOutcomeLogs.cms,
        method: strategyOutcomeLogs.method,
        totalAttempts: count(),
        totalSuccesses: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
        avgDuration: avg(strategyOutcomeLogs.durationMs),
      })
      .from(strategyOutcomeLogs)
      .where(sql`${strategyOutcomeLogs.cms} IS NOT NULL`)
      .groupBy(strategyOutcomeLogs.cms, strategyOutcomeLogs.method)
      .having(sql`COUNT(*) >= 2`);

    for (const row of cmsMethodRows) {
      const key = `${row.cms}:${row.method}`;
      const attempts = Number(row.totalAttempts) || 0;
      const successes = Number(row.totalSuccesses) || 0;
      const rate = attempts > 0 ? (successes / attempts) * 100 : 0;

      // Get sample contexts
      const successSamples = await db
        .select({
          payloadModifications: strategyOutcomeLogs.payloadModifications,
          wafBypassUsed: strategyOutcomeLogs.wafBypassUsed,
          attackPath: strategyOutcomeLogs.attackPath,
          wafDetected: strategyOutcomeLogs.wafDetected,
        })
        .from(strategyOutcomeLogs)
        .where(and(
          eq(strategyOutcomeLogs.cms, row.cms!),
          eq(strategyOutcomeLogs.method, row.method),
          eq(strategyOutcomeLogs.success, true),
        ))
        .orderBy(desc(strategyOutcomeLogs.createdAt))
        .limit(5);

      const failSamples = await db
        .select({
          errorCategory: strategyOutcomeLogs.errorCategory,
          errorMessage: strategyOutcomeLogs.errorMessage,
          wafDetected: strategyOutcomeLogs.wafDetected,
          httpStatus: strategyOutcomeLogs.httpStatus,
        })
        .from(strategyOutcomeLogs)
        .where(and(
          eq(strategyOutcomeLogs.cms, row.cms!),
          eq(strategyOutcomeLogs.method, row.method),
          eq(strategyOutcomeLogs.success, false),
        ))
        .orderBy(desc(strategyOutcomeLogs.createdAt))
        .limit(5);

      // Collect best payload mods and bypasses from successes
      const payloadModCounts: Record<string, number> = {};
      const bypassCounts: Record<string, number> = {};
      const pathCounts: Record<string, number> = {};
      for (const s of successSamples) {
        const mods = s.payloadModifications as string[] | null;
        if (mods) for (const m of mods) payloadModCounts[m] = (payloadModCounts[m] || 0) + 1;
        const bypasses = s.wafBypassUsed as string[] | null;
        if (bypasses) for (const b of bypasses) bypassCounts[b] = (bypassCounts[b] || 0) + 1;
        if (s.attackPath) pathCounts[s.attackPath] = (pathCounts[s.attackPath] || 0) + 1;
      }

      const bestMods = Object.entries(payloadModCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
      const bestBypasses = Object.entries(bypassCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
      const bestPaths = Object.entries(pathCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);

      // Generate AI insight for patterns with enough data
      let aiInsight = "";
      let aiRecommendation = "";
      let confidence = Math.min(Math.round(rate), 100);

      if (attempts >= 5) {
        try {
          const insightRes = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "You are an AI analyzing attack pattern data. Given statistics about a specific CMS + attack method combination, " +
                  "provide a brief insight (1-2 sentences) about why this pattern succeeds or fails, and a recommendation (1-2 sentences) " +
                  "for how to best use this method against this CMS. Return JSON with 'insight' and 'recommendation' fields.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  cms: row.cms,
                  method: row.method,
                  successRate: Math.round(rate),
                  attempts,
                  successes,
                  commonSuccessPayloads: bestMods,
                  commonSuccessBypasses: bestBypasses,
                  commonFailErrors: failSamples.map((f) => f.errorCategory).filter(Boolean),
                }),
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "pattern_insight",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    insight: { type: "string" },
                    recommendation: { type: "string" },
                  },
                  required: ["insight", "recommendation"],
                  additionalProperties: false,
                },
              },
            },
          });
          const parsed = safeParse<{ insight: string; recommendation: string }>(
            extractContent(insightRes),
            { insight: "", recommendation: "" }
          );
          aiInsight = parsed.insight;
          aiRecommendation = parsed.recommendation;
        } catch {
          // LLM unavailable — skip insight generation
        }
      }

      // Upsert the pattern
      const existing = await db
        .select({ id: learnedPatterns.id })
        .from(learnedPatterns)
        .where(and(
          eq(learnedPatterns.patternType, "cms_method"),
          eq(learnedPatterns.patternKey, key),
        ))
        .limit(1);

      const patternData: Partial<InsertLearnedPattern> = {
        totalAttempts: attempts,
        totalSuccesses: successes,
        successRate: rate.toFixed(2),
        avgDurationMs: Math.round(Number(row.avgDuration) || 0),
        confidenceScore: confidence,
        sampleSuccessContexts: successSamples as any[],
        sampleFailureContexts: failSamples as any[],
        bestPayloadMods: bestMods,
        bestWafBypasses: bestBypasses,
        bestAttackPaths: bestPaths,
        ...(aiInsight ? { aiInsight } : {}),
        ...(aiRecommendation ? { aiRecommendation } : {}),
      };

      if (existing.length > 0) {
        await db.update(learnedPatterns)
          .set(patternData)
          .where(eq(learnedPatterns.id, existing[0].id));
      } else {
        await db.insert(learnedPatterns).values({
          patternType: "cms_method",
          patternKey: key,
          ...patternData,
        } as InsertLearnedPattern);
      }
      patternsUpdated++;
    }

    // B) Aggregate waf:bypass patterns
    const wafRows = await db
      .select({
        waf: strategyOutcomeLogs.wafDetected,
        method: strategyOutcomeLogs.method,
        totalAttempts: count(),
        totalSuccesses: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
        avgDuration: avg(strategyOutcomeLogs.durationMs),
      })
      .from(strategyOutcomeLogs)
      .where(sql`${strategyOutcomeLogs.wafDetected} IS NOT NULL`)
      .groupBy(strategyOutcomeLogs.wafDetected, strategyOutcomeLogs.method)
      .having(sql`COUNT(*) >= 2`);

    for (const row of wafRows) {
      const key = `${row.waf}:${row.method}`;
      const attempts = Number(row.totalAttempts) || 0;
      const successes = Number(row.totalSuccesses) || 0;
      const rate = attempts > 0 ? (successes / attempts) * 100 : 0;

      const existing = await db
        .select({ id: learnedPatterns.id })
        .from(learnedPatterns)
        .where(and(
          eq(learnedPatterns.patternType, "waf_bypass"),
          eq(learnedPatterns.patternKey, key),
        ))
        .limit(1);

      const patternData: Partial<InsertLearnedPattern> = {
        totalAttempts: attempts,
        totalSuccesses: successes,
        successRate: rate.toFixed(2),
        avgDurationMs: Math.round(Number(row.avgDuration) || 0),
        confidenceScore: Math.min(Math.round(rate), 100),
      };

      if (existing.length > 0) {
        await db.update(learnedPatterns)
          .set(patternData)
          .where(eq(learnedPatterns.id, existing[0].id));
      } else {
        await db.insert(learnedPatterns).values({
          patternType: "waf_bypass",
          patternKey: key,
          ...patternData,
        } as InsertLearnedPattern);
      }
      patternsUpdated++;
    }

    console.log(`[AdaptiveLearning] Updated ${patternsUpdated} learned patterns`);
    return patternsUpdated;
  } catch (e: any) {
    console.error(`[AdaptiveLearning] updateLearnedPatterns error: ${e.message}`);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════
//  7. GET CMS ATTACK PROFILE
// ═══════════════════════════════════════════════════════

export async function getCmsAttackProfile(cms: string) {
  try {
    const db = await getDb();
    if (!db) return null;

    const rows = await db
      .select()
      .from(cmsAttackProfiles)
      .where(eq(cmsAttackProfiles.cms, cms))
      .limit(1);

    return rows[0] || null;
  } catch (e: any) {
    console.error(`[AdaptiveLearning] getCmsAttackProfile error: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
//  8. UPDATE CMS PROFILES (Periodic Rebuild)
// ═══════════════════════════════════════════════════════

export async function updateCmsProfiles(): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;

    let profilesUpdated = 0;

    // Get all CMS types with enough data
    const cmsRows = await db
      .select({
        cms: strategyOutcomeLogs.cms,
        totalAttacks: count(),
        totalSuccesses: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(strategyOutcomeLogs)
      .where(sql`${strategyOutcomeLogs.cms} IS NOT NULL`)
      .groupBy(strategyOutcomeLogs.cms)
      .having(sql`COUNT(*) >= 3`);

    for (const cmsRow of cmsRows) {
      const cms = cmsRow.cms!;
      const totalAttacks = Number(cmsRow.totalAttacks) || 0;
      const totalSuccesses = Number(cmsRow.totalSuccesses) || 0;
      const overallRate = totalAttacks > 0 ? (totalSuccesses / totalAttacks) * 100 : 0;

      // Method rankings for this CMS
      const methodRows = await db
        .select({
          method: strategyOutcomeLogs.method,
          attempts: count(),
          successes: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
          avgDuration: avg(strategyOutcomeLogs.durationMs),
        })
        .from(strategyOutcomeLogs)
        .where(eq(strategyOutcomeLogs.cms, cms))
        .groupBy(strategyOutcomeLogs.method)
        .orderBy(desc(sql`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`));

      const methodRankings = methodRows.map((r) => ({
        method: r.method,
        successRate: Number(r.attempts) > 0
          ? Math.round((Number(r.successes) / Number(r.attempts)) * 100)
          : 0,
        attempts: Number(r.attempts) || 0,
        avgDuration: Math.round(Number(r.avgDuration) || 0),
      })).sort((a, b) => b.successRate - a.successRate);

      // Common WAFs for this CMS
      const wafRows = await db
        .select({
          waf: strategyOutcomeLogs.wafDetected,
          frequency: count(),
          successes: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(strategyOutcomeLogs)
        .where(and(
          eq(strategyOutcomeLogs.cms, cms),
          sql`${strategyOutcomeLogs.wafDetected} IS NOT NULL`,
        ))
        .groupBy(strategyOutcomeLogs.wafDetected);

      const commonWafs = wafRows.map((r) => ({
        waf: r.waf!,
        frequency: Number(r.frequency) || 0,
        bestBypass: null as string | null,
        bypassSuccessRate: Number(r.frequency) > 0
          ? Math.round((Number(r.successes) / Number(r.frequency)) * 100)
          : 0,
      }));

      const bestMethod = methodRankings[0]?.method || null;
      const bestMethodRate = methodRankings[0]?.successRate || 0;
      const worstMethod = methodRankings.length > 1
        ? methodRankings[methodRankings.length - 1]?.method || null
        : null;

      // Generate AI playbook for CMS with enough data
      let aiPlaybook = null;
      let aiPlaybookConfidence = 0;
      if (totalAttacks >= 10) {
        try {
          const playbookRes = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "You are an AI creating an attack playbook for a specific CMS based on historical data. " +
                  "Write a concise playbook (3-5 paragraphs) covering: best methods, common defenses, " +
                  "recommended approach order, and tips. Return JSON with 'playbook' and 'confidence' fields.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  cms,
                  totalAttacks,
                  overallSuccessRate: Math.round(overallRate),
                  methodRankings: methodRankings.slice(0, 8),
                  commonWafs,
                }),
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "cms_playbook",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    playbook: { type: "string" },
                    confidence: { type: "integer" },
                  },
                  required: ["playbook", "confidence"],
                  additionalProperties: false,
                },
              },
            },
          });
          const parsed = safeParse<{ playbook: string; confidence: number }>(
            extractContent(playbookRes),
            { playbook: "", confidence: 0 }
          );
          aiPlaybook = parsed.playbook || null;
          aiPlaybookConfidence = parsed.confidence;
        } catch {
          // LLM unavailable
        }
      }

      // Upsert CMS profile
      const existing = await db
        .select({ id: cmsAttackProfiles.id })
        .from(cmsAttackProfiles)
        .where(eq(cmsAttackProfiles.cms, cms))
        .limit(1);

      const profileData = {
        methodRankings,
        commonWafs,
        totalAttacks,
        overallSuccessRate: overallRate.toFixed(2),
        bestMethod,
        bestMethodSuccessRate: bestMethodRate.toFixed(2),
        worstMethod,
        ...(aiPlaybook ? { aiPlaybook, aiPlaybookConfidence } : {}),
      };

      if (existing.length > 0) {
        await db.update(cmsAttackProfiles)
          .set(profileData)
          .where(eq(cmsAttackProfiles.id, existing[0].id));
      } else {
        await db.insert(cmsAttackProfiles).values({
          cms,
          ...profileData,
        } as InsertCmsAttackProfile);
      }
      profilesUpdated++;
    }

    console.log(`[AdaptiveLearning] Updated ${profilesUpdated} CMS attack profiles`);
    return profilesUpdated;
  } catch (e: any) {
    console.error(`[AdaptiveLearning] updateCmsProfiles error: ${e.message}`);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════
//  9. GET ADAPTIVE LEARNING STATS
// ═══════════════════════════════════════════════════════

export async function getAdaptiveLearningStats(): Promise<AdaptiveLearningStats> {
  const empty: AdaptiveLearningStats = {
    totalOutcomesRecorded: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    overallSuccessRate: 0,
    totalLearnedPatterns: 0,
    totalCmsProfiles: 0,
    topMethods: [],
    recentTrend: {
      last24h: { attempts: 0, successes: 0, rate: 0 },
      last7d: { attempts: 0, successes: 0, rate: 0 },
      last30d: { attempts: 0, successes: 0, rate: 0 },
    },
    mostAttackedCms: [],
  };

  try {
    const db = await getDb();
    if (!db) return empty;

    // Total outcomes
    const [totalRow] = await db
      .select({
        total: count(),
        successes: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(strategyOutcomeLogs);

    const totalOutcomes = Number(totalRow?.total) || 0;
    const totalSuccesses = Number(totalRow?.successes) || 0;

    // Learned patterns count
    const [patternCountRow] = await db.select({ c: count() }).from(learnedPatterns);
    const totalPatterns = Number(patternCountRow?.c) || 0;

    // CMS profiles count
    const [cmsCountRow] = await db.select({ c: count() }).from(cmsAttackProfiles);
    const totalCmsProfiles = Number(cmsCountRow?.c) || 0;

    // Top methods
    const topMethods = await calculateMethodSuccessRates({ minAttempts: 1 });

    // Recent trends
    const now = new Date();
    const day = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const trendQuery = async (since: Date) => {
      const [row] = await db
        .select({
          attempts: count(),
          successes: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(strategyOutcomeLogs)
        .where(sql`${strategyOutcomeLogs.createdAt} >= ${since}`);
      const a = Number(row?.attempts) || 0;
      const s = Number(row?.successes) || 0;
      return { attempts: a, successes: s, rate: a > 0 ? Math.round((s / a) * 100) : 0 };
    };

    const [last24h, last7d, last30d] = await Promise.all([
      trendQuery(day),
      trendQuery(week),
      trendQuery(month),
    ]);

    // Most attacked CMS
    const cmsStats = await db
      .select({
        cms: strategyOutcomeLogs.cms,
        count: count(),
        successes: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(strategyOutcomeLogs)
      .where(sql`${strategyOutcomeLogs.cms} IS NOT NULL`)
      .groupBy(strategyOutcomeLogs.cms)
      .orderBy(desc(count()))
      .limit(10);

    return {
      totalOutcomesRecorded: totalOutcomes,
      totalSuccesses,
      totalFailures: totalOutcomes - totalSuccesses,
      overallSuccessRate: totalOutcomes > 0 ? Math.round((totalSuccesses / totalOutcomes) * 100) : 0,
      totalLearnedPatterns: totalPatterns,
      totalCmsProfiles,
      topMethods: topMethods.slice(0, 10),
      recentTrend: { last24h, last7d, last30d },
      mostAttackedCms: cmsStats.map((r) => ({
        cms: r.cms!,
        count: Number(r.count) || 0,
        successRate: Number(r.count) > 0
          ? Math.round((Number(r.successes) / Number(r.count)) * 100)
          : 0,
      })),
    };
  } catch (e: any) {
    console.error(`[AdaptiveLearning] getAdaptiveLearningStats error: ${e.message}`);
    return empty;
  }
}

// ═══════════════════════════════════════════════════════
//  PERIODIC LEARNING JOB
//  Call this periodically (e.g., every 30 minutes) to
//  aggregate new outcomes into learned patterns & CMS profiles
// ═══════════════════════════════════════════════════════

export async function runLearningCycle(): Promise<{
  patternsUpdated: number;
  profilesUpdated: number;
  timestamp: number;
}> {
  console.log("[AdaptiveLearning] 🧠 Starting learning cycle...");
  const start = Date.now();

  const patternsUpdated = await updateLearnedPatterns();
  const profilesUpdated = await updateCmsProfiles();

  const duration = Date.now() - start;
  console.log(`[AdaptiveLearning] ✅ Learning cycle complete in ${duration}ms — ${patternsUpdated} patterns, ${profilesUpdated} profiles updated`);

  return { patternsUpdated, profilesUpdated, timestamp: Date.now() };
}

// ═══════════════════════════════════════════════════════
//  10. METHOD EFFECTIVENESS TRACKER
//  Quickly check if a method should be skipped for a target profile
// ═══════════════════════════════════════════════════════

export interface MethodEffectiveness {
  method: string;
  cms: string | null;
  waf: string | null;
  attempts: number;
  successes: number;
  successRate: number;
  shouldSkip: boolean;
  reason: string;
}

/**
 * Get method effectiveness for a specific target profile.
 * Returns which methods to skip and which to prioritize.
 */
export async function getMethodEffectiveness(
  cms: string | null,
  waf: string | null,
): Promise<MethodEffectiveness[]> {
  const SKIP_THRESHOLD = 5;    // min attempts
  const SKIP_RATE = 10;        // skip if < 10% success
  const PRIORITIZE_RATE = 50;  // prioritize if > 50% success

  try {
    // Get CMS-specific patterns if available
    const patterns = cms
      ? await queryHistoricalPatterns({ cms })
      : await queryHistoricalPatterns({});

    // Also get WAF-specific patterns
    const wafPatterns = waf
      ? await queryHistoricalPatterns({ waf })
      : [];

    // Merge: CMS patterns take priority, WAF patterns fill gaps
    const methodMap = new Map<string, MethodEffectiveness>();

    for (const p of patterns) {
      methodMap.set(p.method, {
        method: p.method,
        cms,
        waf,
        attempts: p.totalAttempts,
        successes: p.totalSuccesses,
        successRate: p.successRate,
        shouldSkip: p.totalAttempts >= SKIP_THRESHOLD && p.successRate < SKIP_RATE,
        reason: p.totalAttempts >= SKIP_THRESHOLD && p.successRate < SKIP_RATE
          ? `${p.successRate}% success after ${p.totalAttempts} attempts on ${cms || "all"} targets`
          : p.successRate >= PRIORITIZE_RATE
            ? `High success: ${p.successRate}% on ${cms || "all"} targets`
            : `${p.successRate}% success rate`,
      });
    }

    // Add WAF patterns for methods not already covered
    for (const p of wafPatterns) {
      if (!methodMap.has(p.method)) {
        methodMap.set(p.method, {
          method: p.method,
          cms,
          waf,
          attempts: p.totalAttempts,
          successes: p.totalSuccesses,
          successRate: p.successRate,
          shouldSkip: p.totalAttempts >= SKIP_THRESHOLD && p.successRate < SKIP_RATE,
          reason: p.totalAttempts >= SKIP_THRESHOLD && p.successRate < SKIP_RATE
            ? `${p.successRate}% success after ${p.totalAttempts} attempts against ${waf} WAF`
            : `${p.successRate}% success rate against ${waf} WAF`,
        });
      }
    }

    return Array.from(methodMap.values())
      .sort((a, b) => b.successRate - a.successRate);
  } catch (e: any) {
    console.error(`[AdaptiveLearning] getMethodEffectiveness error: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
//  11. AI STRATEGY EVOLUTION
//  LLM analyzes failure patterns and proposes new attack approaches
// ═══════════════════════════════════════════════════════

export interface EvolvedStrategy {
  name: string;
  description: string;
  targetProfile: string;  // e.g. "wordpress + cloudflare"
  approach: string;       // detailed attack approach
  estimatedSuccessRate: number;
  basedOnPatterns: string[];
  confidence: number;
}

/**
 * AI analyzes failure patterns and evolves new attack strategies.
 * Called during learning cycles when enough failure data exists.
 */
export async function evolveStrategies(): Promise<EvolvedStrategy[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    // Get top failure patterns — methods that fail most often
    const failurePatterns = await db
      .select({
        method: strategyOutcomeLogs.method,
        cms: strategyOutcomeLogs.cms,
        waf: strategyOutcomeLogs.wafDetected,
        errorCategory: strategyOutcomeLogs.errorCategory,
        total: count(),
      })
      .from(strategyOutcomeLogs)
      .where(eq(strategyOutcomeLogs.success, false))
      .groupBy(
        strategyOutcomeLogs.method,
        strategyOutcomeLogs.cms,
        strategyOutcomeLogs.wafDetected,
        strategyOutcomeLogs.errorCategory,
      )
      .orderBy(desc(count()))
      .limit(20);

    if (failurePatterns.length < 3) {
      console.log("[AdaptiveLearning] Not enough failure data to evolve strategies");
      return [];
    }

    // Get success patterns for contrast
    const successPatterns = await db
      .select({
        method: strategyOutcomeLogs.method,
        cms: strategyOutcomeLogs.cms,
        waf: strategyOutcomeLogs.wafDetected,
        payloadMods: strategyOutcomeLogs.payloadModifications,
        wafBypass: strategyOutcomeLogs.wafBypassUsed,
        total: count(),
      })
      .from(strategyOutcomeLogs)
      .where(eq(strategyOutcomeLogs.success, true))
      .groupBy(
        strategyOutcomeLogs.method,
        strategyOutcomeLogs.cms,
        strategyOutcomeLogs.wafDetected,
        strategyOutcomeLogs.payloadModifications,
        strategyOutcomeLogs.wafBypassUsed,
      )
      .orderBy(desc(count()))
      .limit(20);

    // Ask LLM to analyze patterns and propose new strategies
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert penetration testing AI that evolves attack strategies based on historical data.

Analyze the failure and success patterns below. Your job is to:
1. Identify WHY certain methods fail on certain target profiles (CMS + WAF combinations)
2. Propose NEW or MODIFIED attack approaches that could succeed where current methods fail
3. Each strategy should be specific and actionable, not generic

Focus on:
- WAF bypass techniques that worked in successes but weren't used in failures
- Payload modifications that correlated with success
- Method combinations or sequences that could improve success
- Novel approaches based on common error patterns

Return JSON array of evolved strategies.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            failurePatterns: failurePatterns.map((f) => ({
              method: f.method,
              cms: f.cms,
              waf: f.waf,
              error: f.errorCategory,
              count: Number(f.total),
            })),
            successPatterns: successPatterns.map((s) => ({
              method: s.method,
              cms: s.cms,
              waf: s.waf,
              payloadMods: s.payloadMods,
              wafBypass: s.wafBypass,
              count: Number(s.total),
            })),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "evolved_strategies",
          strict: true,
          schema: {
            type: "object",
            properties: {
              strategies: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    targetProfile: { type: "string" },
                    approach: { type: "string" },
                    estimatedSuccessRate: { type: "integer" },
                    basedOnPatterns: { type: "array", items: { type: "string" } },
                    confidence: { type: "integer" },
                  },
                  required: ["name", "description", "targetProfile", "approach", "estimatedSuccessRate", "basedOnPatterns", "confidence"],
                  additionalProperties: false,
                },
              },
            },
            required: ["strategies"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      const strategies: EvolvedStrategy[] = parsed.strategies || [];

      // Store evolved strategies as learned patterns
      for (const strat of strategies) {
        try {
          await db.insert(learnedPatterns).values({
            patternType: "evolved_strategy",
            patternKey: `evolved:${strat.name.toLowerCase().replace(/\s+/g, "_")}`,
            totalAttempts: 0,
            totalSuccesses: 0,
            successRate: "0",
            avgDurationMs: 0,
            aiInsight: strat.description,
            aiRecommendation: strat.approach,
            confidenceScore: strat.confidence,
            sampleSuccessContexts: [],
            sampleFailureContexts: strat.basedOnPatterns.map((p) => ({ pattern: p })),
          }).onDuplicateKeyUpdate({
            set: {
              aiInsight: strat.description,
              aiRecommendation: strat.approach,
              confidenceScore: strat.confidence,
            },
          });
        } catch { /* best-effort storage */ }
      }

      console.log(`[AdaptiveLearning] 🧬 Evolved ${strategies.length} new strategies`);
      return strategies;
    }

    return [];
  } catch (e: any) {
    console.error(`[AdaptiveLearning] evolveStrategies error: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
//  12. ENHANCED LEARNING CYCLE (with strategy evolution)
// ═══════════════════════════════════════════════════════

/**
 * Full learning cycle including strategy evolution.
 * Replaces basic runLearningCycle when enough data exists.
 */
export async function runEnhancedLearningCycle(): Promise<{
  patternsUpdated: number;
  profilesUpdated: number;
  strategiesEvolved: number;
  timestamp: number;
}> {
  console.log("[AdaptiveLearning] 🧠 Starting enhanced learning cycle...");
  const start = Date.now();

  // Step 1: Aggregate patterns
  const patternsUpdated = await updateLearnedPatterns();

  // Step 2: Rebuild CMS profiles
  const profilesUpdated = await updateCmsProfiles();

  // Step 3: Evolve strategies (only if we have enough data)
  let strategiesEvolved = 0;
  try {
    const stats = await getAdaptiveLearningStats();
    if (stats.totalOutcomesRecorded >= 10) {
      const evolved = await evolveStrategies();
      strategiesEvolved = evolved.length;
    }
  } catch (e: any) {
    console.warn(`[AdaptiveLearning] Strategy evolution skipped: ${e.message}`);
  }

  const duration = Date.now() - start;
  console.log(
    `[AdaptiveLearning] ✅ Enhanced learning cycle complete in ${duration}ms — ` +
    `${patternsUpdated} patterns, ${profilesUpdated} profiles, ${strategiesEvolved} strategies evolved`
  );

  return { patternsUpdated, profilesUpdated, strategiesEvolved, timestamp: Date.now() };
}

// ═══════════════════════════════════════════════════════
//  13. ADAPTIVE METHOD ORDERING (Enhanced)
//  Uses domain-specific history, recency weight, confidence (Wilson score),
//  server-type filtering, and weighted merge with scan scores.
// ═══════════════════════════════════════════════════════

export interface AdaptiveMethodScore {
  method: string;
  /** Raw historical success rate (0-100) */
  rawSuccessRate: number;
  /** Wilson lower-bound confidence score (0-100) — penalizes low-sample methods */
  wilsonScore: number;
  /** Recency-weighted score (0-100) — recent successes count more */
  recencyScore: number;
  /** Final composite score (0-100) — used for ordering */
  compositeScore: number;
  /** Number of historical attempts */
  attempts: number;
  /** Number of historical successes */
  successes: number;
  /** Data source: "domain" | "cms" | "waf" | "server" | "global" */
  source: string;
  /** Whether this method should be skipped (0% success with 5+ attempts) */
  shouldSkip: boolean;
  /** Human-readable reason */
  reason: string;
}

/**
 * Wilson score lower bound — gives a confidence-adjusted success rate.
 * With 1 success out of 1 attempt → ~20% (low confidence)
 * With 50 successes out of 100 attempts → ~40% (high confidence)
 * z = 1.96 for 95% confidence interval
 */
function wilsonLowerBound(successes: number, attempts: number, z = 1.96): number {
  if (attempts === 0) return 0;
  const p = successes / attempts;
  const denominator = 1 + (z * z) / attempts;
  const centre = p + (z * z) / (2 * attempts);
  const adjustment = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * attempts)) / attempts);
  return Math.max(0, (centre - adjustment) / denominator);
}

/**
 * Get adaptive method ordering scores for a target.
 * Queries multiple data layers (domain → CMS → WAF → server → global)
 * and merges them with recency weighting and Wilson confidence scoring.
 */
export async function getAdaptiveMethodOrdering(params: {
  targetDomain: string;
  cms: string | null;
  waf: string | null;
  serverType: string | null;
  /** Current method IDs to score (from scan-based ordering) */
  methodIds: string[];
  /** Scan-based scores (method → score 0-100) — will be merged with historical */
  scanScores?: Map<string, number>;
}): Promise<{
  /** Methods ordered by composite score (highest first) */
  orderedMethods: string[];
  /** Full scoring details for each method */
  scores: AdaptiveMethodScore[];
  /** Methods recommended to skip */
  skipMethods: string[];
  /** Summary text for narrator */
  narratorSummary: string;
}> {
  const { targetDomain, cms, waf, serverType, methodIds, scanScores } = params;
  const scoreMap = new Map<string, AdaptiveMethodScore>();

  // Initialize all methods with zero scores
  for (const id of methodIds) {
    scoreMap.set(id, {
      method: id,
      rawSuccessRate: 0,
      wilsonScore: 0,
      recencyScore: 0,
      compositeScore: 0,
      attempts: 0,
      successes: 0,
      source: "none",
      shouldSkip: false,
      reason: "No historical data",
    });
  }

  try {
    const db = await getDb();
    if (!db) {
      return buildResult(scoreMap, methodIds, scanScores);
    }

    // ═══ Layer 1: Domain-specific history (highest priority) ═══
    const domainRows = await db
      .select({
        method: strategyOutcomeLogs.method,
        attempts: count(),
        successes: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
        lastSuccess: sql<string>`MAX(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN ${strategyOutcomeLogs.createdAt} ELSE NULL END)`,
        lastAttempt: sql<string>`MAX(${strategyOutcomeLogs.createdAt})`,
      })
      .from(strategyOutcomeLogs)
      .where(eq(strategyOutcomeLogs.targetDomain, targetDomain))
      .groupBy(strategyOutcomeLogs.method);

    for (const row of domainRows) {
      if (!scoreMap.has(row.method)) continue;
      const attempts = Number(row.attempts) || 0;
      const successes = Number(row.successes) || 0;
      const rate = attempts > 0 ? (successes / attempts) * 100 : 0;
      const wilson = wilsonLowerBound(successes, attempts) * 100;
      const recency = calculateRecencyScore(row.lastSuccess);

      scoreMap.set(row.method, {
        method: row.method,
        rawSuccessRate: Math.round(rate),
        wilsonScore: Math.round(wilson),
        recencyScore: recency,
        compositeScore: 0, // calculated later
        attempts,
        successes,
        source: "domain",
        shouldSkip: false, // NEVER skip — always try all methods (conditions change, WAF rules change, etc.)
        reason: attempts >= 3 && successes === 0
          ? `0% success after ${attempts} attempts on this domain (will still try)`
          : successes > 0
            ? `${Math.round(rate)}% success on this domain (${successes}/${attempts})`
            : `${attempts} attempts, no success yet`,
      });
    }

    // ═══ Layer 2: CMS-specific history ═══
    if (cms && cms !== "unknown") {
      const cmsRows = await db
        .select({
          method: strategyOutcomeLogs.method,
          attempts: count(),
          successes: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
          lastSuccess: sql<string>`MAX(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN ${strategyOutcomeLogs.createdAt} ELSE NULL END)`,
        })
        .from(strategyOutcomeLogs)
        .where(eq(strategyOutcomeLogs.cms, cms))
        .groupBy(strategyOutcomeLogs.method);

      for (const row of cmsRows) {
        if (!scoreMap.has(row.method)) continue;
        const existing = scoreMap.get(row.method)!;
        if (existing.source === "domain") continue; // domain data takes priority
        
        const attempts = Number(row.attempts) || 0;
        const successes = Number(row.successes) || 0;
        const rate = attempts > 0 ? (successes / attempts) * 100 : 0;
        const wilson = wilsonLowerBound(successes, attempts) * 100;
        const recency = calculateRecencyScore(row.lastSuccess);

        scoreMap.set(row.method, {
          method: row.method,
          rawSuccessRate: Math.round(rate),
          wilsonScore: Math.round(wilson),
          recencyScore: recency,
          compositeScore: 0,
          attempts,
          successes,
          source: "cms",
          shouldSkip: false, // NEVER skip — reorder only
          reason: `${Math.round(rate)}% success on ${cms} sites (${successes}/${attempts})`,
        });
      }
    }

    // ═══ Layer 3: WAF-specific history ═══
    if (waf) {
      const wafRows = await db
        .select({
          method: strategyOutcomeLogs.method,
          attempts: count(),
          successes: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
          lastSuccess: sql<string>`MAX(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN ${strategyOutcomeLogs.createdAt} ELSE NULL END)`,
        })
        .from(strategyOutcomeLogs)
        .where(eq(strategyOutcomeLogs.wafDetected, waf))
        .groupBy(strategyOutcomeLogs.method);

      for (const row of wafRows) {
        if (!scoreMap.has(row.method)) continue;
        const existing = scoreMap.get(row.method)!;
        if (existing.source === "domain" || existing.source === "cms") continue;
        
        const attempts = Number(row.attempts) || 0;
        const successes = Number(row.successes) || 0;
        const rate = attempts > 0 ? (successes / attempts) * 100 : 0;
        const wilson = wilsonLowerBound(successes, attempts) * 100;
        const recency = calculateRecencyScore(row.lastSuccess);

        scoreMap.set(row.method, {
          method: row.method,
          rawSuccessRate: Math.round(rate),
          wilsonScore: Math.round(wilson),
          recencyScore: recency,
          compositeScore: 0,
          attempts,
          successes,
          source: "waf",
          shouldSkip: false, // NEVER skip — reorder only
          reason: `${Math.round(rate)}% success against ${waf} WAF (${successes}/${attempts})`,
        });
      }
    }

    // ═══ Layer 4: Server-type history ═══
    if (serverType) {
      const serverRows = await db
        .select({
          method: strategyOutcomeLogs.method,
          attempts: count(),
          successes: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
          lastSuccess: sql<string>`MAX(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN ${strategyOutcomeLogs.createdAt} ELSE NULL END)`,
        })
        .from(strategyOutcomeLogs)
        .where(eq(strategyOutcomeLogs.serverType, serverType))
        .groupBy(strategyOutcomeLogs.method);

      for (const row of serverRows) {
        if (!scoreMap.has(row.method)) continue;
        const existing = scoreMap.get(row.method)!;
        if (existing.source !== "none") continue; // only fill gaps
        
        const attempts = Number(row.attempts) || 0;
        const successes = Number(row.successes) || 0;
        const rate = attempts > 0 ? (successes / attempts) * 100 : 0;
        const wilson = wilsonLowerBound(successes, attempts) * 100;
        const recency = calculateRecencyScore(row.lastSuccess);

        scoreMap.set(row.method, {
          method: row.method,
          rawSuccessRate: Math.round(rate),
          wilsonScore: Math.round(wilson),
          recencyScore: recency,
          compositeScore: 0,
          attempts,
          successes,
          source: "server",
          shouldSkip: false, // NEVER skip — reorder only
          reason: `${Math.round(rate)}% success on ${serverType} servers (${successes}/${attempts})`,
        });
      }
    }

    // ═══ Layer 5: Global fallback (all targets) ═══
    const globalRows = await db
      .select({
        method: strategyOutcomeLogs.method,
        attempts: count(),
        successes: sql<number>`SUM(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END)`,
        lastSuccess: sql<string>`MAX(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN ${strategyOutcomeLogs.createdAt} ELSE NULL END)`,
      })
      .from(strategyOutcomeLogs)
      .groupBy(strategyOutcomeLogs.method);

    for (const row of globalRows) {
      if (!scoreMap.has(row.method)) continue;
      const existing = scoreMap.get(row.method)!;
      if (existing.source !== "none") continue; // only fill gaps
      
      const attempts = Number(row.attempts) || 0;
      const successes = Number(row.successes) || 0;
      const rate = attempts > 0 ? (successes / attempts) * 100 : 0;
      const wilson = wilsonLowerBound(successes, attempts) * 100;
      const recency = calculateRecencyScore(row.lastSuccess);

      scoreMap.set(row.method, {
        method: row.method,
        rawSuccessRate: Math.round(rate),
        wilsonScore: Math.round(wilson),
        recencyScore: recency,
        compositeScore: 0,
        attempts,
        successes,
        source: "global",
        shouldSkip: false, // NEVER skip — reorder only, let all methods run
        reason: `${Math.round(rate)}% global success rate (${successes}/${attempts})`,
      });
    }

  } catch (e: any) {
    console.error(`[AdaptiveLearning] getAdaptiveMethodOrdering error: ${e.message}`);
  }

  return buildResult(scoreMap, methodIds, scanScores);
}

/**
 * Calculate recency score (0-100) based on last success timestamp.
 * Recent successes (< 24h) → 100, older successes decay exponentially.
 * Half-life: 7 days.
 */
function calculateRecencyScore(lastSuccessStr: string | null): number {
  if (!lastSuccessStr) return 0;
  const lastSuccess = new Date(lastSuccessStr).getTime();
  if (isNaN(lastSuccess)) return 0;
  const ageMs = Date.now() - lastSuccess;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const halfLife = 7; // days
  return Math.round(100 * Math.pow(0.5, ageDays / halfLife));
}

/**
 * Build final result with composite scores and ordering.
 * Composite = 40% Wilson + 30% recency + 30% scan score (if available)
 */
function buildResult(
  scoreMap: Map<string, AdaptiveMethodScore>,
  originalOrder: string[],
  scanScores?: Map<string, number>,
): {
  orderedMethods: string[];
  scores: AdaptiveMethodScore[];
  skipMethods: string[];
  narratorSummary: string;
} {
  // Normalize scan scores to 0-100
  let maxScanScore = 0;
  if (scanScores) {
    for (const v of Array.from(scanScores.values())) {
      if (v > maxScanScore) maxScanScore = v;
    }
  }

  // Calculate composite scores
  for (const [id, score] of Array.from(scoreMap.entries())) {
    const scanNorm = scanScores && maxScanScore > 0
      ? ((scanScores.get(id) || 0) / maxScanScore) * 100
      : 0;

    if (scanScores && maxScanScore > 0) {
      // With scan data: 35% Wilson + 25% recency + 40% scan
      score.compositeScore = Math.round(
        score.wilsonScore * 0.35 +
        score.recencyScore * 0.25 +
        scanNorm * 0.40
      );
    } else {
      // Without scan data: 60% Wilson + 40% recency
      score.compositeScore = Math.round(
        score.wilsonScore * 0.60 +
        score.recencyScore * 0.40
      );
    }
  }

  // Separate skip methods
  const skipMethods: string[] = [];
  const activeMethods: string[] = [];
  for (const id of originalOrder) {
    const score = scoreMap.get(id);
    if (score?.shouldSkip) {
      skipMethods.push(id);
    } else {
      activeMethods.push(id);
    }
  }

  // Sort active methods by composite score (descending), preserve original order for ties
  const orderedMethods = [...activeMethods].sort((a, b) => {
    const scoreA = scoreMap.get(a)?.compositeScore || 0;
    const scoreB = scoreMap.get(b)?.compositeScore || 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    // Tie-break: preserve original order
    return activeMethods.indexOf(a) - activeMethods.indexOf(b);
  });

  // Build narrator summary
  const scores = Array.from(scoreMap.values()).sort((a, b) => b.compositeScore - a.compositeScore);
  const topMethods = scores.filter(s => !s.shouldSkip && s.compositeScore > 0).slice(0, 5);
  const hasData = topMethods.length > 0;

  let narratorSummary = "";
  if (hasData) {
    const sourceEmoji: Record<string, string> = {
      domain: "🎯", cms: "📦", waf: "🛡️", server: "🖥️", global: "🌐", none: "❓",
    };
    narratorSummary = `📊 Adaptive Ordering (${scores.filter(s => s.source !== "none").length} methods with history):\n`;
    narratorSummary += topMethods.map((s, i) =>
      `${i + 1}. ${s.method} — ${sourceEmoji[s.source] || "❓"} ${s.compositeScore}pts (${s.rawSuccessRate}% rate, ${s.attempts} attempts)`
    ).join("\n");
    if (skipMethods.length > 0) {
      narratorSummary += `\n⏭️ Skip ${skipMethods.length}: ${skipMethods.join(", ")}`;
    }
  } else {
    narratorSummary = `📊 No historical data — using scan-based ordering`;
  }

  return { orderedMethods, scores, skipMethods, narratorSummary };
}
