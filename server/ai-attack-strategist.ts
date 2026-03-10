/**
 * AI Attack Strategist — LLM-Powered Auto-Retry Brain
 *
 * ALL decisions are made by the LLM, not hardcoded rules:
 *   1. analyzeFailure()         — LLM analyzes WHY an attack failed
 *   2. generateRetryStrategy()  — LLM decides WHAT to try next
 *   3. adaptPayload()           — LLM modifies exploit payload based on response
 *   4. selectNextTarget()       — LLM prioritizes targets by success probability
 *   5. evaluateAttackSurface()  — LLM maps all possible attack vectors
 *   6. shouldContinueRetrying() — LLM decides if more retries are worthwhile
 *
 * The strategist maintains a memory of all attempts per target,
 * feeding the full history to the LLM for contextual decisions.
 */
import { invokeLLM } from "./_core/llm";
import {
  queryHistoricalPatterns,
  calculateMethodSuccessRates,
  getLearnedInsights,
  getCmsAttackProfile,
  recordAttackOutcome,
  type AttackOutcome,
} from "./adaptive-learning";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface AttackAttemptRecord {
  attemptNumber: number;
  method: string;
  exploitType: string;
  wafDetected: string | null;
  httpStatus: number | null;
  responseSnippet: string;
  errorMessage: string | null;
  duration: number;
  timestamp: number;
}

export interface TargetContext {
  domain: string;
  cms: string | null;
  cmsVersion: string | null;
  serverType: string | null;
  phpVersion: string | null;
  wafDetected: string | null;
  wafStrength: string | null;
  vulnScore: number;
  hasOpenUpload: boolean;
  hasExposedConfig: boolean;
  hasExposedAdmin: boolean;
  hasWritableDir: boolean;
  hasVulnerableCms: boolean;
  hasWeakAuth: boolean;
  knownCves: string[];
  previousAttempts: AttackAttemptRecord[];
}

export interface FailureAnalysis {
  failureCategory:
    | "waf_block"
    | "patched_vuln"
    | "wrong_cms"
    | "auth_required"
    | "rate_limited"
    | "timeout"
    | "network_error"
    | "file_not_writable"
    | "exploit_failed"
    | "detection_blocked"
    | "unknown";
  rootCause: string;
  confidence: number;
  wafInvolved: boolean;
  detailedAnalysis: string;
  suggestedApproach: string;
}

export interface RetryStrategy {
  shouldRetry: boolean;
  nextMethod: string;
  nextExploitType: string;
  payloadModifications: string[];
  wafBypassTechniques: string[];
  attackPath: string;
  reasoning: string;
  estimatedSuccessRate: number;
  priority: number;
  alternativeTargetSuggested: boolean;
}

export interface AdaptedPayload {
  originalPayload: string;
  adaptedPayload: string;
  encodingUsed: string;
  obfuscationLevel: "none" | "light" | "medium" | "heavy";
  wafBypassApplied: string[];
  changesSummary: string;
  expectedBehavior: string;
}

export interface AttackSurfaceEvaluation {
  totalVectors: number;
  vectors: AttackVector[];
  recommendedOrder: string[];
  overallAssessment: string;
  estimatedOverallSuccess: number;
  timeEstimate: string;
}

export interface AttackVector {
  method: string;
  exploitType: string;
  description: string;
  successProbability: number;
  difficulty: "easy" | "medium" | "hard" | "very_hard";
  requiresAuth: boolean;
  wafBypassNeeded: boolean;
  prerequisites: string[];
  notes: string;
}

export interface TargetPrioritization {
  rankedTargets: Array<{
    domain: string;
    score: number;
    reasoning: string;
    suggestedMethod: string;
  }>;
  reasoning: string;
}

export interface ContinueDecision {
  shouldContinue: boolean;
  reasoning: string;
  confidence: number;
  suggestedAction:
    | "retry_same_target"
    | "try_different_method"
    | "skip_target"
    | "abort_session";
  maxMoreRetries: number;
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

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.substring(0, n) + "...";
}

// ═══════════════════════════════════════════════════════
//  1. ANALYZE FAILURE
// ═══════════════════════════════════════════════════════

export async function analyzeFailure(
  target: TargetContext,
  lastAttempt: AttackAttemptRecord
): Promise<FailureAnalysis> {
  try {
    const res = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are an expert penetration tester AI analyzing why a web exploitation attempt failed. " +
            "Given target information and the failed attempt details, determine the root cause. " +
            "Analyze HTTP status codes, response content, error messages, and WAF behavior. " +
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
              knownCves: target.knownCves.slice(0, 10),
            },
            failedAttempt: {
              method: lastAttempt.method,
              exploitType: lastAttempt.exploitType,
              httpStatus: lastAttempt.httpStatus,
              responseSnippet: truncate(lastAttempt.responseSnippet, 500),
              errorMessage: lastAttempt.errorMessage,
              duration: lastAttempt.duration,
            },
            previousAttempts: target.previousAttempts.slice(-5).map((a) => ({
              method: a.method,
              exploitType: a.exploitType,
              httpStatus: a.httpStatus,
              errorMessage: a.errorMessage,
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
              failureCategory: {
                type: "string",
                enum: [
                  "waf_block", "patched_vuln", "wrong_cms", "auth_required",
                  "rate_limited", "timeout", "network_error", "file_not_writable",
                  "exploit_failed", "detection_blocked", "unknown",
                ],
              },
              rootCause: { type: "string" },
              confidence: { type: "integer" },
              wafInvolved: { type: "boolean" },
              detailedAnalysis: { type: "string" },
              suggestedApproach: { type: "string" },
            },
            required: [
              "failureCategory", "rootCause", "confidence",
              "wafInvolved", "detailedAnalysis", "suggestedApproach",
            ],
            additionalProperties: false,
          },
        },
      },
    });
    return safeParse<FailureAnalysis>(extractContent(res), {
      failureCategory: "unknown",
      rootCause: "LLM analysis unavailable",
      confidence: 0,
      wafInvolved: false,
      detailedAnalysis: "Could not analyze failure",
      suggestedApproach: "Try a different attack method",
    });
  } catch (e: any) {
    console.error(`[AI Strategist] analyzeFailure error: ${e.message}`);
    return {
      failureCategory: "unknown",
      rootCause: `Analysis error: ${e.message}`,
      confidence: 0,
      wafInvolved: false,
      detailedAnalysis: "LLM call failed",
      suggestedApproach: "Retry with different method",
    };
  }
}

// ═══════════════════════════════════════════════════════
//  2. GENERATE RETRY STRATEGY
// ═══════════════════════════════════════════════════════

export async function generateRetryStrategy(
  target: TargetContext,
  failureAnalysis: FailureAnalysis,
  availableMethods: string[]
): Promise<RetryStrategy> {
  const usedMethods = target.previousAttempts.map((a) => a.method);
  const unusedMethods = availableMethods.filter((m) => !usedMethods.includes(m));

  try {
    const res = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are an expert penetration tester AI deciding the next attack strategy after a failed attempt. " +
            "Based on the failure analysis and target context, decide the optimal next attack method. " +
            "Consider: what failed, why it failed, what hasn't been tried, and what's most likely to succeed. " +
            `Available methods: ${availableMethods.join(", ")}. ` +
            `Already tried: ${usedMethods.join(", ")}. ` +
            `Not yet tried: ${unusedMethods.join(", ")}. ` +
            "You also have access to HISTORICAL DATA from past attacks against similar targets. " +
            "Use this data to prioritize methods with proven success rates. " +
            "If no more viable methods exist, set shouldRetry to false. Return JSON.",
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
              hasExposedConfig: target.hasExposedConfig,
              hasExposedAdmin: target.hasExposedAdmin,
              hasWritableDir: target.hasWritableDir,
              hasVulnerableCms: target.hasVulnerableCms,
              hasWeakAuth: target.hasWeakAuth,
              knownCves: target.knownCves.slice(0, 10),
            },
            failureAnalysis: {
              category: failureAnalysis.failureCategory,
              rootCause: failureAnalysis.rootCause,
              wafInvolved: failureAnalysis.wafInvolved,
              suggestedApproach: failureAnalysis.suggestedApproach,
            },
            attemptHistory: target.previousAttempts.map((a) => ({
              method: a.method,
              exploitType: a.exploitType,
              httpStatus: a.httpStatus,
              errorMessage: a.errorMessage,
            })),
            retryNumber: target.previousAttempts.length + 1,
            historicalData: await getHistoricalContext(target, availableMethods),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "retry_strategy",
          strict: true,
          schema: {
            type: "object",
            properties: {
              shouldRetry: { type: "boolean" },
              nextMethod: { type: "string" },
              nextExploitType: { type: "string" },
              payloadModifications: { type: "array", items: { type: "string" } },
              wafBypassTechniques: { type: "array", items: { type: "string" } },
              attackPath: { type: "string" },
              reasoning: { type: "string" },
              estimatedSuccessRate: { type: "integer" },
              priority: { type: "integer" },
              alternativeTargetSuggested: { type: "boolean" },
            },
            required: [
              "shouldRetry", "nextMethod", "nextExploitType",
              "payloadModifications", "wafBypassTechniques", "attackPath",
              "reasoning", "estimatedSuccessRate", "priority",
              "alternativeTargetSuggested",
            ],
            additionalProperties: false,
          },
        },
      },
    });
    return safeParse<RetryStrategy>(extractContent(res), {
      shouldRetry: unusedMethods.length > 0,
      nextMethod: unusedMethods[0] || "ai_generated_exploit",
      nextExploitType: "multi_step",
      payloadModifications: [],
      wafBypassTechniques: [],
      attackPath: "Fallback: try next untried method",
      reasoning: "LLM unavailable, using sequential fallback",
      estimatedSuccessRate: 10,
      priority: 5,
      alternativeTargetSuggested: false,
    });
  } catch (e: any) {
    console.error(`[AI Strategist] generateRetryStrategy error: ${e.message}`);
    return {
      shouldRetry: unusedMethods.length > 0,
      nextMethod: unusedMethods[0] || "shellless_redirect",
      nextExploitType: "http_request",
      payloadModifications: [],
      wafBypassTechniques: [],
      attackPath: "Sequential fallback due to LLM error",
      reasoning: `LLM error: ${e.message}`,
      estimatedSuccessRate: 5,
      priority: 5,
      alternativeTargetSuggested: false,
    };
  }
}

// ═══════════════════════════════════════════════════════
//  3. ADAPT PAYLOAD
// ═══════════════════════════════════════════════════════

export async function adaptPayload(
  target: TargetContext,
  originalPayload: string,
  failureAnalysis: FailureAnalysis
): Promise<AdaptedPayload> {
  try {
    const res = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are an expert exploit developer specializing in WAF evasion and payload obfuscation. " +
            "Given a failed exploit payload and the failure analysis, modify the payload to bypass defenses. " +
            "Apply encoding, obfuscation, fragmentation, or alternative syntax. " +
            "Techniques: URL/double/Unicode encoding, PHP alt syntax, SQL comment injection, " +
            "polyglot files, null byte injection, double extensions, MIME spoofing, " +
            "XSS event handlers/SVG/template injection, path traversal encoding, " +
            "command injection IFS/brace/base64. Return JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({
            target: {
              domain: target.domain,
              cms: target.cms,
              wafDetected: target.wafDetected,
              wafStrength: target.wafStrength,
              serverType: target.serverType,
              phpVersion: target.phpVersion,
            },
            originalPayload: truncate(originalPayload, 2000),
            failureReason: failureAnalysis.rootCause,
            failureCategory: failureAnalysis.failureCategory,
            wafInvolved: failureAnalysis.wafInvolved,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "adapted_payload",
          strict: true,
          schema: {
            type: "object",
            properties: {
              originalPayload: { type: "string" },
              adaptedPayload: { type: "string" },
              encodingUsed: { type: "string" },
              obfuscationLevel: {
                type: "string",
                enum: ["none", "light", "medium", "heavy"],
              },
              wafBypassApplied: { type: "array", items: { type: "string" } },
              changesSummary: { type: "string" },
              expectedBehavior: { type: "string" },
            },
            required: [
              "originalPayload", "adaptedPayload", "encodingUsed",
              "obfuscationLevel", "wafBypassApplied", "changesSummary",
              "expectedBehavior",
            ],
            additionalProperties: false,
          },
        },
      },
    });
    return safeParse<AdaptedPayload>(extractContent(res), {
      originalPayload,
      adaptedPayload: originalPayload,
      encodingUsed: "none",
      obfuscationLevel: "none",
      wafBypassApplied: [],
      changesSummary: "LLM unavailable, using original payload",
      expectedBehavior: "Same as original",
    });
  } catch (e: any) {
    console.error(`[AI Strategist] adaptPayload error: ${e.message}`);
    return {
      originalPayload,
      adaptedPayload: originalPayload,
      encodingUsed: "none",
      obfuscationLevel: "none",
      wafBypassApplied: [],
      changesSummary: `LLM error: ${e.message}`,
      expectedBehavior: "Using original payload as fallback",
    };
  }
}

// ═══════════════════════════════════════════════════════
//  4. SELECT NEXT TARGET
// ═══════════════════════════════════════════════════════

export async function selectNextTarget(
  targets: Array<{
    domain: string;
    cms: string | null;
    vulnScore: number;
    wafDetected: string | null;
    previousAttempts: number;
    lastFailureReason: string | null;
  }>,
  sessionStats: {
    totalAttacked: number;
    totalSucceeded: number;
    totalFailed: number;
    avgAttackDuration: number;
  }
): Promise<TargetPrioritization> {
  try {
    const res = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are an expert penetration tester AI prioritizing targets for attack. " +
            "Rank targets by likelihood of successful exploitation. " +
            "Consider: vulnerability score, CMS type, WAF presence, previous failures, session patterns. " +
            "Return JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({ targets: targets.slice(0, 20), sessionStats }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "target_prioritization",
          strict: true,
          schema: {
            type: "object",
            properties: {
              rankedTargets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    domain: { type: "string" },
                    score: { type: "integer" },
                    reasoning: { type: "string" },
                    suggestedMethod: { type: "string" },
                  },
                  required: ["domain", "score", "reasoning", "suggestedMethod"],
                  additionalProperties: false,
                },
              },
              reasoning: { type: "string" },
            },
            required: ["rankedTargets", "reasoning"],
            additionalProperties: false,
          },
        },
      },
    });
    return safeParse<TargetPrioritization>(extractContent(res), {
      rankedTargets: targets.map((t) => ({
        domain: t.domain,
        score: t.vulnScore,
        reasoning: "Fallback: sorted by vuln score",
        suggestedMethod: "cve_exploit",
      })),
      reasoning: "LLM unavailable, using vuln score ranking",
    });
  } catch (e: any) {
    console.error(`[AI Strategist] selectNextTarget error: ${e.message}`);
    return {
      rankedTargets: targets
        .sort((a, b) => b.vulnScore - a.vulnScore)
        .map((t) => ({
          domain: t.domain,
          score: t.vulnScore,
          reasoning: "Sorted by vulnerability score (LLM fallback)",
          suggestedMethod: "cve_exploit",
        })),
      reasoning: `LLM error: ${e.message}`,
    };
  }
}

// ═══════════════════════════════════════════════════════
//  5. EVALUATE ATTACK SURFACE
// ═══════════════════════════════════════════════════════

export async function evaluateAttackSurface(
  target: TargetContext
): Promise<AttackSurfaceEvaluation> {
  try {
    const res = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are an expert penetration tester AI evaluating a target's complete attack surface. " +
            "Enumerate ALL possible attack vectors with success probability estimates. " +
            "Order by likelihood of success. Be thorough. Return JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({
            domain: target.domain,
            cms: target.cms,
            cmsVersion: target.cmsVersion,
            serverType: target.serverType,
            phpVersion: target.phpVersion,
            wafDetected: target.wafDetected,
            wafStrength: target.wafStrength,
            vulnScore: target.vulnScore,
            hasOpenUpload: target.hasOpenUpload,
            hasExposedConfig: target.hasExposedConfig,
            hasExposedAdmin: target.hasExposedAdmin,
            hasWritableDir: target.hasWritableDir,
            hasVulnerableCms: target.hasVulnerableCms,
            hasWeakAuth: target.hasWeakAuth,
            knownCves: target.knownCves.slice(0, 15),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "attack_surface",
          strict: true,
          schema: {
            type: "object",
            properties: {
              totalVectors: { type: "integer" },
              vectors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    method: { type: "string" },
                    exploitType: { type: "string" },
                    description: { type: "string" },
                    successProbability: { type: "integer" },
                    difficulty: {
                      type: "string",
                      enum: ["easy", "medium", "hard", "very_hard"],
                    },
                    requiresAuth: { type: "boolean" },
                    wafBypassNeeded: { type: "boolean" },
                    prerequisites: { type: "array", items: { type: "string" } },
                    notes: { type: "string" },
                  },
                  required: [
                    "method", "exploitType", "description", "successProbability",
                    "difficulty", "requiresAuth", "wafBypassNeeded",
                    "prerequisites", "notes",
                  ],
                  additionalProperties: false,
                },
              },
              recommendedOrder: { type: "array", items: { type: "string" } },
              overallAssessment: { type: "string" },
              estimatedOverallSuccess: { type: "integer" },
              timeEstimate: { type: "string" },
            },
            required: [
              "totalVectors", "vectors", "recommendedOrder",
              "overallAssessment", "estimatedOverallSuccess", "timeEstimate",
            ],
            additionalProperties: false,
          },
        },
      },
    });
    return safeParse<AttackSurfaceEvaluation>(extractContent(res), {
      totalVectors: 0,
      vectors: [],
      recommendedOrder: ["cve_exploit", "cms_plugin_exploit", "file_upload_spray"],
      overallAssessment: "LLM unavailable",
      estimatedOverallSuccess: 20,
      timeEstimate: "unknown",
    });
  } catch (e: any) {
    console.error(`[AI Strategist] evaluateAttackSurface error: ${e.message}`);
    return {
      totalVectors: 0,
      vectors: [],
      recommendedOrder: [
        "cve_exploit", "cms_plugin_exploit", "file_upload_spray",
        "ai_generated_exploit",
      ],
      overallAssessment: `LLM error: ${e.message}`,
      estimatedOverallSuccess: 15,
      timeEstimate: "unknown",
    };
  }
}

// ═══════════════════════════════════════════════════════
//  6. SHOULD CONTINUE RETRYING
// ═══════════════════════════════════════════════════════

export async function shouldContinueRetrying(
  target: TargetContext,
  maxRetries: number,
  sessionStats: {
    totalTargets: number;
    remainingTargets: number;
    successRate: number;
    avgTimePerTarget: number;
  }
): Promise<ContinueDecision> {
  const attemptCount = target.previousAttempts.length;

  // Hard limit
  if (attemptCount >= maxRetries) {
    return {
      shouldContinue: false,
      reasoning: `Hard limit reached: ${attemptCount}/${maxRetries} retries exhausted`,
      confidence: 100,
      suggestedAction: "skip_target",
      maxMoreRetries: 0,
    };
  }

  try {
    const res = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are an expert penetration tester AI deciding whether to continue attacking a target. " +
            "Consider: attempts so far, failure types, remaining methods, WAF strength, " +
            "time spent vs remaining targets, session success rate. " +
            "Be strategic — sometimes skip hardened targets for easier ones. Return JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({
            target: {
              domain: target.domain,
              cms: target.cms,
              wafDetected: target.wafDetected,
              wafStrength: target.wafStrength,
              vulnScore: target.vulnScore,
            },
            attempts: target.previousAttempts.map((a) => ({
              method: a.method,
              errorMessage: a.errorMessage,
              httpStatus: a.httpStatus,
            })),
            attemptCount,
            maxRetries,
            sessionStats,
            uniqueMethodsTried: Array.from(
              new Set(target.previousAttempts.map((a) => a.method))
            ).length,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "continue_decision",
          strict: true,
          schema: {
            type: "object",
            properties: {
              shouldContinue: { type: "boolean" },
              reasoning: { type: "string" },
              confidence: { type: "integer" },
              suggestedAction: {
                type: "string",
                enum: [
                  "retry_same_target", "try_different_method",
                  "skip_target", "abort_session",
                ],
              },
              maxMoreRetries: { type: "integer" },
            },
            required: [
              "shouldContinue", "reasoning", "confidence",
              "suggestedAction", "maxMoreRetries",
            ],
            additionalProperties: false,
          },
        },
      },
    });
    return safeParse<ContinueDecision>(extractContent(res), {
      shouldContinue: attemptCount < maxRetries,
      reasoning: "LLM unavailable, using attempt count check",
      confidence: 50,
      suggestedAction:
        attemptCount < maxRetries ? "try_different_method" : "skip_target",
      maxMoreRetries: Math.max(0, maxRetries - attemptCount),
    });
  } catch (e: any) {
    console.error(`[AI Strategist] shouldContinueRetrying error: ${e.message}`);
    return {
      shouldContinue: attemptCount < maxRetries,
      reasoning: `LLM error: ${e.message}, falling back to attempt count`,
      confidence: 30,
      suggestedAction:
        attemptCount < maxRetries ? "try_different_method" : "skip_target",
      maxMoreRetries: Math.max(0, maxRetries - attemptCount),
    };
  }
}

// ═══════════════════════════════════════════════════════
//  ORCHESTRATOR — Full retry loop for one target
// ═══════════════════════════════════════════════════════

export async function orchestrateRetry(
  target: TargetContext,
  maxRetries: number,
  sessionStats: {
    totalTargets: number;
    remainingTargets: number;
    successRate: number;
    avgTimePerTarget: number;
  },
  availableMethods: string[],
  onEvent?: (event: { type: string; detail: string; data?: any }) => void
): Promise<{
  strategy: RetryStrategy | null;
  failureAnalysis: FailureAnalysis | null;
  continueDecision: ContinueDecision;
  aiReasoning: string;
}> {
  const emit = (type: string, detail: string, data?: any) => {
    onEvent?.({ type, detail, data });
  };

  const lastAttempt =
    target.previousAttempts[target.previousAttempts.length - 1];
  if (!lastAttempt) {
    return {
      strategy: null,
      failureAnalysis: null,
      continueDecision: {
        shouldContinue: false,
        reasoning: "No previous attempts to analyze",
        confidence: 100,
        suggestedAction: "skip_target",
        maxMoreRetries: 0,
      },
      aiReasoning: "No previous attempts found",
    };
  }

  // Step 0: Fetch historical intelligence
  emit("learning", "📚 AI กำลังดึงข้อมูลจาก Adaptive Learning DB...");
  const historicalContext = await getHistoricalContext(target, availableMethods);
  if (historicalContext.totalHistoricalSamples > 0) {
    emit(
      "learned",
      `📊 พบข้อมูลจากการโจมตีในอดีต ${historicalContext.totalHistoricalSamples} ครั้ง — Best method: ${historicalContext.cmsProfile?.bestMethod || "N/A"}`,
      { historicalContext }
    );
  }

  // Step 1: Analyze the failure
  emit(
    "analyzing",
    `🧠 AI กำลังวิเคราะห์ว่าทำไม ${lastAttempt.method} ล้มเหลว...`
  );
  const analysis = await analyzeFailure(target, lastAttempt);
  emit(
    "analyzed",
    `📊 สาเหตุ: ${analysis.failureCategory} — ${analysis.rootCause}`,
    { analysis }
  );

  // Step 2: Should we continue?
  emit("deciding", "🤔 AI กำลังตัดสินใจว่าควรลองอีกหรือไม่...");
  const continueDecision = await shouldContinueRetrying(
    target,
    maxRetries,
    sessionStats
  );
  emit(
    "decided",
    `${continueDecision.shouldContinue ? "✅" : "⏹️"} ${continueDecision.reasoning}`,
    { continueDecision }
  );

  if (!continueDecision.shouldContinue) {
    return {
      strategy: null,
      failureAnalysis: analysis,
      continueDecision,
      aiReasoning: `AI decided to stop: ${continueDecision.reasoning}`,
    };
  }

  // Step 3: Generate new strategy
  emit("strategizing", "🎯 AI กำลังวางแผนกลยุทธ์ใหม่...");
  const strategy = await generateRetryStrategy(
    target,
    analysis,
    availableMethods
  );
  emit(
    "strategy_ready",
    `⚔️ กลยุทธ์ใหม่: ${strategy.nextMethod} (${strategy.estimatedSuccessRate}% chance) — ${strategy.reasoning}`,
    { strategy }
  );

  const aiReasoning = [
    `Failure: ${analysis.failureCategory} — ${analysis.rootCause}`,
    `Decision: ${continueDecision.suggestedAction} (confidence: ${continueDecision.confidence}%)`,
    `Strategy: ${strategy.nextMethod} via ${strategy.attackPath}`,
    `Reasoning: ${strategy.reasoning}`,
    `Est. Success: ${strategy.estimatedSuccessRate}%`,
  ].join("\n");

  return { strategy, failureAnalysis: analysis, continueDecision, aiReasoning };
}

// ═══════════════════════════════════════════════════════
//  AVAILABLE ATTACK METHODS
// ═══════════════════════════════════════════════════════

export const ALL_ATTACK_METHODS = [
  // Core upload methods (unified pipeline)
  "oneclick", "try_all", "parallel", "smart_retry",
  // WordPress-specific
  "wp_admin", "wp_db", "wp_brute_force", "cve_exploit", "cms_plugin_exploit",
  // Alternative upload vectors
  "alt_upload", "file_upload_spray", "xmlrpc_attack", "rest_api_exploit",
  "ftp_brute", "webdav_upload", "htaccess_overwrite",
  // Advanced evasion
  "waf_bypass", "waf_bypass_upload", "config_exploit",
  // Non-upload attacks
  "indirect", "dns", "shellless_redirect",
  // Comprehensive attack vectors (AI-evolved)
  "ssti_injection", "nosql_injection", "sql_injection", "lfi_rce", "ssrf",
  "deserialization", "open_redirect_chain", "cache_poisoning",
  "host_header_injection", "jwt_abuse", "race_condition",
  "mass_assignment", "prototype_pollution",
  // Legacy names (backward compat)
  "wp_admin_takeover",
  // AI-generated
  "ai_generated_exploit", "comprehensive",
] as const;

export type AttackMethod = (typeof ALL_ATTACK_METHODS)[number];

// ═══════════════════════════════════════════════════════
//  HISTORICAL CONTEXT HELPER
//  Fetches relevant data from Adaptive Learning DB
// ═══════════════════════════════════════════════════════

async function getHistoricalContext(
  target: TargetContext,
  availableMethods: string[]
): Promise<{
  cmsPatterns: Array<{ method: string; successRate: number; attempts: number }>;
  wafPatterns: Array<{ method: string; successRate: number; attempts: number }>;
  globalMethodRates: Array<{ method: string; successRate: number; attempts: number }>;
  cmsProfile: { bestMethod: string | null; overallSuccessRate: number; methodRankings: any[] } | null;
  learnedInsights: Array<{ key: string; insight: string; recommendation: string; successRate: number }>;
  totalHistoricalSamples: number;
}> {
  try {
    const [cmsPatterns, wafPatterns, globalRates] = await Promise.all([
      target.cms ? queryHistoricalPatterns({ cms: target.cms }) : Promise.resolve([]),
      target.wafDetected ? queryHistoricalPatterns({ waf: target.wafDetected }) : Promise.resolve([]),
      calculateMethodSuccessRates({ minAttempts: 2 }),
    ]);

    let cmsProfile = null;
    if (target.cms) {
      const profile = await getCmsAttackProfile(target.cms);
      if (profile) {
        cmsProfile = {
          bestMethod: profile.bestMethod,
          overallSuccessRate: Number(profile.overallSuccessRate),
          methodRankings: (profile.methodRankings as any[])?.slice(0, 8) || [],
        };
      }
    }

    const insights = await getLearnedInsights({
      cms: target.cms || undefined,
      waf: target.wafDetected || undefined,
      limit: 5,
    });

    const totalHistoricalSamples =
      cmsPatterns.reduce((s, p) => s + p.totalAttempts, 0) +
      wafPatterns.reduce((s, p) => s + p.totalAttempts, 0);

    return {
      cmsPatterns: cmsPatterns.slice(0, 8).map((p) => ({
        method: p.method,
        successRate: p.successRate,
        attempts: p.totalAttempts,
      })),
      wafPatterns: wafPatterns.slice(0, 8).map((p) => ({
        method: p.method,
        successRate: p.successRate,
        attempts: p.totalAttempts,
      })),
      globalMethodRates: globalRates.slice(0, 10).map((r) => ({
        method: r.method,
        successRate: r.successRate,
        attempts: r.attempts,
      })),
      cmsProfile,
      learnedInsights: insights.slice(0, 5).map((i) => ({
        key: i.patternKey,
        insight: i.insight,
        recommendation: i.recommendation,
        successRate: i.successRate,
      })),
      totalHistoricalSamples,
    };
  } catch (e: any) {
    console.error(`[AI Strategist] getHistoricalContext error: ${e.message}`);
    return {
      cmsPatterns: [],
      wafPatterns: [],
      globalMethodRates: [],
      cmsProfile: null,
      learnedInsights: [],
      totalHistoricalSamples: 0,
    };
  }
}

// ═══════════════════════════════════════════════════════
//  RE-EXPORT for convenience
// ═══════════════════════════════════════════════════════
export { recordAttackOutcome, type AttackOutcome };
