/**
 * AI Learning Loop — Learn from Deploy History
 *
 * Queries past deploy_history records to find patterns:
 * - What methods worked on similar server types / CMS / WAF
 * - Success rates per technique
 * - Common failure patterns
 * - Recommendations based on historical data
 */

import { getDb } from "./db";
import { deployHistory } from "../drizzle/schema";
import { eq, desc, and, sql, like, or, isNotNull } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

export interface DeployLearnings {
  totalPastDeploys: number;
  successRate: number;           // 0-100
  bestMethod: string | null;     // most successful technique
  bestBypass: string | null;     // most successful bypass method
  avgDuration: number;           // avg duration in ms
  commonFailures: string[];      // top failure reasons
  recommendations: string[];     // AI-generated recommendations
  similarTargets: {
    domain: string;
    status: string;
    technique: string | null;
    cms: string | null;
    waf: string | null;
    serverType: string | null;
    preScreenScore: number | null;
    duration: number | null;
  }[];
}

/**
 * Get learnings from past deploys for a target domain.
 * Searches for:
 * 1. Same domain (exact match)
 * 2. Same server type / CMS / WAF (similar targets)
 * 3. General success patterns
 */
export async function getDeployLearnings(targetDomain: string): Promise<DeployLearnings> {
  const db = await getDb();
  if (!db) {
    return emptyLearnings();
  }

  try {
    // 1. Get all past deploys (up to 500 most recent)
    const allDeploys = await db.select({
      id: deployHistory.id,
      targetDomain: deployHistory.targetDomain,
      status: deployHistory.status,
      techniqueUsed: deployHistory.techniqueUsed,
      bypassMethod: deployHistory.bypassMethod,
      cms: deployHistory.cms,
      serverType: deployHistory.serverType,
      wafDetected: deployHistory.wafDetected,
      preScreenScore: deployHistory.preScreenScore,
      duration: deployHistory.duration,
      errorBreakdown: deployHistory.errorBreakdown,
      altMethodUsed: deployHistory.altMethodUsed,
      filesDeployed: deployHistory.filesDeployed,
      redirectActive: deployHistory.redirectActive,
    })
      .from(deployHistory)
      .orderBy(desc(deployHistory.startedAt))
      .limit(500);

    if (allDeploys.length === 0) return emptyLearnings();

    // 2. Find deploys to the same domain
    const sameDomain = allDeploys.filter(d =>
      d.targetDomain === targetDomain || d.targetDomain === targetDomain.replace(/^www\./, "")
    );

    // 3. Calculate overall success rate
    const successCount = allDeploys.filter(d => d.status === "success").length;
    const partialCount = allDeploys.filter(d => d.status === "partial").length;
    const successRate = allDeploys.length > 0
      ? Math.round(((successCount + partialCount * 0.5) / allDeploys.length) * 100)
      : 0;

    // 4. Find best technique (most successful)
    const techniqueStats = new Map<string, { success: number; total: number }>();
    for (const d of allDeploys) {
      const tech = d.techniqueUsed || "unknown";
      const stat = techniqueStats.get(tech) || { success: 0, total: 0 };
      stat.total++;
      if (d.status === "success") stat.success++;
      techniqueStats.set(tech, stat);
    }
    let bestMethod: string | null = null;
    let bestMethodRate = 0;
    for (const [tech, stat] of Array.from(techniqueStats.entries())) {
      const rate = stat.total > 0 ? stat.success / stat.total : 0;
      if (rate > bestMethodRate && stat.total >= 2) {
        bestMethodRate = rate;
        bestMethod = tech;
      }
    }

    // 5. Find best bypass method
    const bypassStats = new Map<string, { success: number; total: number }>();
    for (const d of allDeploys) {
      if (!d.bypassMethod) continue;
      const stat = bypassStats.get(d.bypassMethod) || { success: 0, total: 0 };
      stat.total++;
      if (d.status === "success") stat.success++;
      bypassStats.set(d.bypassMethod, stat);
    }
    let bestBypass: string | null = null;
    let bestBypassRate = 0;
    for (const [bypass, stat] of Array.from(bypassStats.entries())) {
      const rate = stat.total > 0 ? stat.success / stat.total : 0;
      if (rate > bestBypassRate && stat.total >= 2) {
        bestBypassRate = rate;
        bestBypass = bypass;
      }
    }

    // 6. Average duration
    const durations = allDeploys.filter(d => d.duration && d.duration > 0).map(d => d.duration!);
    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    // 7. Common failure patterns
    const failureReasons: string[] = [];
    const failedDeploys = allDeploys.filter(d => d.status === "failed");
    const errorCounts = new Map<string, number>();
    for (const d of failedDeploys) {
      const breakdown = d.errorBreakdown as Record<string, number> | null;
      if (breakdown) {
        for (const [reason, count] of Object.entries(breakdown)) {
          if (typeof count === "number" && count > 0) {
            errorCounts.set(reason, (errorCounts.get(reason) || 0) + count);
          }
        }
      }
    }
    const sortedErrors = Array.from(errorCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [reason] of sortedErrors.slice(0, 5)) {
      failureReasons.push(reason);
    }

    // 8. Build similar targets list
    const similarTargets = sameDomain.slice(0, 10).map(d => ({
      domain: d.targetDomain,
      status: d.status,
      technique: d.techniqueUsed,
      cms: d.cms,
      waf: d.wafDetected,
      serverType: d.serverType,
      preScreenScore: d.preScreenScore,
      duration: d.duration,
    }));

    // 9. Generate AI recommendations based on patterns
    const recommendations = generateRecommendations(
      allDeploys.length,
      successRate,
      bestMethod,
      bestBypass,
      failureReasons,
      sameDomain,
    );

    return {
      totalPastDeploys: allDeploys.length,
      successRate,
      bestMethod,
      bestBypass,
      avgDuration,
      commonFailures: failureReasons,
      recommendations,
      similarTargets,
    };
  } catch (e) {
    console.error("[AI Learning] Error querying deploy history:", e);
    return emptyLearnings();
  }
}

/**
 * Generate AI-powered recommendations based on deploy history patterns
 */
function generateRecommendations(
  totalDeploys: number,
  successRate: number,
  bestMethod: string | null,
  bestBypass: string | null,
  commonFailures: string[],
  sameDomainDeploys: any[],
): string[] {
  const recs: string[] = [];

  // Same domain history
  if (sameDomainDeploys.length > 0) {
    const lastDeploy = sameDomainDeploys[0];
    if (lastDeploy.status === "success") {
      recs.push(`Previous deploy to this domain succeeded using "${lastDeploy.techniqueUsed || "hybrid"}" — recommend same approach`);
    } else if (lastDeploy.status === "failed") {
      recs.push(`Previous deploy to this domain failed — try different technique or bypass method`);
      if (lastDeploy.wafDetected) {
        recs.push(`WAF "${lastDeploy.wafDetected}" was detected last time — enable stealth browser for bypass`);
      }
    }
  }

  // Best method recommendation
  if (bestMethod && totalDeploys >= 5) {
    recs.push(`"${bestMethod}" has the highest success rate across ${totalDeploys} deploys`);
  }

  // Bypass recommendation
  if (bestBypass) {
    recs.push(`"${bestBypass}" bypass technique has shown best results`);
  }

  // Common failure warnings
  if (commonFailures.includes("waf")) {
    recs.push("WAF blocks are common — enable stealth browser and proxy rotation");
  }
  if (commonFailures.includes("timeout")) {
    recs.push("Timeouts are frequent — consider increasing retry count and using slower timing");
  }
  if (commonFailures.includes("permission")) {
    recs.push("Permission errors are common — try alternative upload methods (FTP, WebDAV)");
  }

  // Success rate based
  if (successRate < 30 && totalDeploys >= 10) {
    recs.push("Overall success rate is low — consider using proxy rotation and stealth browser");
  } else if (successRate > 70 && totalDeploys >= 10) {
    recs.push("High success rate — current strategies are working well");
  }

  return recs;
}

/**
 * Get AI-enhanced strategy recommendations using LLM analysis of deploy history
 * Called during pre-screening to provide more intelligent strategy selection
 */
export async function getAIEnhancedStrategy(
  targetDomain: string,
  serverType: string | null,
  cms: string | null,
  waf: string | null,
  learnings: DeployLearnings,
): Promise<{
  recommendedApproach: string;
  adjustedProbability: number;
  reasoning: string;
} | null> {
  if (learnings.totalPastDeploys < 3) return null; // Not enough data

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an AI deploy strategist. Based on historical deploy data, recommend the best approach for a new target. Be concise and data-driven. Respond in JSON.`,
        },
        {
          role: "user",
          content: `New target: ${targetDomain}
Server: ${serverType || "Unknown"}, CMS: ${cms || "Unknown"}, WAF: ${waf || "None"}

Historical data from ${learnings.totalPastDeploys} past deploys:
- Overall success rate: ${learnings.successRate}%
- Best method: ${learnings.bestMethod || "N/A"}
- Best bypass: ${learnings.bestBypass || "N/A"}
- Common failures: ${learnings.commonFailures.join(", ") || "N/A"}
- Similar target history: ${learnings.similarTargets.map(t => `${t.domain}: ${t.status} (${t.technique})`).join("; ") || "No similar targets"}

Recommend the best approach. Respond as JSON:
{ "recommendedApproach": "direct_upload|shell_first|hybrid|stealth", "adjustedProbability": 0-100, "reasoning": "..." }`,
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
              recommendedApproach: { type: "string" },
              adjustedProbability: { type: "number" },
              reasoning: { type: "string" },
            },
            required: ["recommendedApproach", "adjustedProbability", "reasoning"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      return JSON.parse(content);
    }
  } catch (e) {
    // Non-critical
  }
  return null;
}

function emptyLearnings(): DeployLearnings {
  return {
    totalPastDeploys: 0,
    successRate: 0,
    bestMethod: null,
    bestBypass: null,
    avgDuration: 0,
    commonFailures: [],
    recommendations: [],
    similarTargets: [],
  };
}
