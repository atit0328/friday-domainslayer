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
import { eq, desc, and, sql, like, or, count, avg, sum } from "drizzle-orm";
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
        totalSuccesses: sum(sql`CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END`),
        avgDuration: avg(strategyOutcomeLogs.durationMs),
      })
      .from(strategyOutcomeLogs)
      .where(whereClause)
      .groupBy(strategyOutcomeLogs.method)
      .orderBy(desc(sql`totalSuccesses`))
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
        successes: sum(sql`CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END`),
        avgDuration: avg(strategyOutcomeLogs.durationMs),
        lastSuccess: sql<Date>`MAX(CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN ${strategyOutcomeLogs.createdAt} ELSE NULL END)`,
      })
      .from(strategyOutcomeLogs)
      .where(whereClause)
      .groupBy(strategyOutcomeLogs.method)
      .orderBy(desc(sql`successes`));

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
        totalSuccesses: sum(sql`CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END`),
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
        totalSuccesses: sum(sql`CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END`),
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
        totalSuccesses: sum(sql`CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END`),
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
          successes: sum(sql`CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END`),
          avgDuration: avg(strategyOutcomeLogs.durationMs),
        })
        .from(strategyOutcomeLogs)
        .where(eq(strategyOutcomeLogs.cms, cms))
        .groupBy(strategyOutcomeLogs.method)
        .orderBy(desc(sql`successes`));

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
          successes: sum(sql`CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END`),
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
        successes: sum(sql`CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END`),
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
          successes: sum(sql`CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END`),
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
        successes: sum(sql`CASE WHEN ${strategyOutcomeLogs.success} = 1 THEN 1 ELSE 0 END`),
      })
      .from(strategyOutcomeLogs)
      .where(sql`${strategyOutcomeLogs.cms} IS NOT NULL`)
      .groupBy(strategyOutcomeLogs.cms)
      .orderBy(desc(sql`count`))
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
