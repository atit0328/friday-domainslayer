/**
 * Competitor Gap Analyzer — Find & Fill Keyword Gaps Automatically
 *
 * Analyzes competitor rankings to find keywords they rank for but we don't,
 * then auto-generates and deploys content to fill those gaps.
 *
 * Features:
 *   - AI Competitor Discovery: identifies top competitors for niche
 *   - Keyword Gap Detection: finds keywords competitors rank for but we don't
 *   - Content Gap Mapping: maps missing topics/content types
 *   - Opportunity Scoring: ranks gaps by difficulty, volume, ROI
 *   - Auto-Content Generation: AI creates gap-filling content
 *   - Auto-Deploy: deploys to parasite platforms (Telegraph)
 *   - Gap Monitoring: tracks progress on filling gaps
 */

import { invokeLLM } from "./_core/llm";
import * as serpTracker from "./serp-tracker";
import { findLowCompetitionKeywords, type KeywordOpportunity } from "./keyword-sniper-engine";
import { deployTelegraphBlitz, type ParasiteDeployment } from "./parasite-seo-blitz";
import { rapidIndexBulk, type IndexingRequest } from "./rapid-indexing-engine";
import { sendTelegramNotification } from "./telegram-notifier";
import { scoreContent, getCriticalFactors, getFactorsByCategory, generateOptimizedContentPrompt, type FactorCategory } from "./google-algorithm-intelligence";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface Competitor {
  domain: string;
  estimatedDA: number;
  overlapKeywords: number;
  uniqueKeywords: number;
  discoveredAt: Date;
}

export interface KeywordGap {
  id: string;
  keyword: string;
  competitorDomain: string;
  competitorPosition: number;
  ourPosition: number | null; // null = not ranking
  difficulty: number; // 0-100
  estimatedVolume: number;
  opportunityScore: number; // 0-100 (higher = better opportunity)
  contentType: "informational" | "transactional" | "navigational" | "commercial";
  status: "discovered" | "content_created" | "deployed" | "ranking" | "ignored";
  contentUrl?: string;
  deployedAt?: Date;
  discoveredAt: Date;
}

export interface GapAnalysis {
  id: string;
  domain: string;
  niche: string;
  competitors: Competitor[];
  gaps: KeywordGap[];
  totalGaps: number;
  highOpportunityGaps: number; // score >= 70
  gapsFilled: number;
  gapsRanking: number;
  analyzedAt: Date;
  lastUpdatedAt: Date;
}

export interface GapFillingResult {
  gapId: string;
  keyword: string;
  contentGenerated: boolean;
  deployed: boolean;
  deploymentUrl?: string;
  indexed: boolean;
  error?: string;
}

export interface GapAnalyzerConfig {
  domain: string;
  targetUrl: string;
  niche: string;
  language: string;
  maxCompetitors: number;
  maxGapsToFill: number;
  minOpportunityScore: number;
  autoDeployContent: boolean;
  autoIndex: boolean;
  seedKeywords: string[];
}

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════

const analyses = new Map<string, GapAnalysis>();
const fillingHistory: GapFillingResult[] = [];

// ═══════════════════════════════════════════════
//  GETTERS
// ═══════════════════════════════════════════════

export function getAnalysis(domain: string): GapAnalysis | null {
  return analyses.get(domain) || null;
}

export function getAllAnalyses(): GapAnalysis[] {
  return Array.from(analyses.values());
}

export function getGapSummary(): {
  totalDomains: number;
  totalGaps: number;
  highOpportunity: number;
  filled: number;
  ranking: number;
  avgOpportunityScore: number;
} {
  let totalGaps = 0;
  let highOpp = 0;
  let filled = 0;
  let ranking = 0;
  let totalScore = 0;

  Array.from(analyses.values()).forEach(a => {
    totalGaps += a.gaps.length;
    highOpp += a.highOpportunityGaps;
    filled += a.gapsFilled;
    ranking += a.gapsRanking;
    totalScore += a.gaps.reduce((s, g) => s + g.opportunityScore, 0);
  });

  return {
    totalDomains: analyses.size,
    totalGaps,
    highOpportunity: highOpp,
    filled,
    ranking,
    avgOpportunityScore: totalGaps > 0 ? totalScore / totalGaps : 0,
  };
}

// ═══════════════════════════════════════════════
//  COMPETITOR DISCOVERY
// ═══════════════════════════════════════════════

/**
 * AI discovers top competitors for a domain/niche
 */
export async function discoverCompetitors(
  domain: string,
  niche: string,
  seedKeywords: string[],
  maxCompetitors: number = 5,
): Promise<Competitor[]> {
  console.log(`[GapAnalyzer] Discovering competitors for ${domain} in ${niche}...`);

  // Method 1: Use SERP data to find competitors
  const serpCompetitors = new Map<string, { positions: number[]; keywords: number }>();

  for (const keyword of seedKeywords.slice(0, 10)) {
    try {
      const rankData = await serpTracker.checkKeywordRank(domain, keyword);
      if (rankData && rankData.competitors) {
        for (const comp of rankData.competitors) {
          const cleanDomain = comp.domain.replace(/^www\./, "").toLowerCase();
          if (cleanDomain === domain.replace(/^www\./, "").toLowerCase()) continue;

          const existing = serpCompetitors.get(cleanDomain) || { positions: [], keywords: 0 };
          existing.positions.push(comp.position);
          existing.keywords++;
          serpCompetitors.set(cleanDomain, existing);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch {
      // Continue with next keyword
    }
  }

  // Method 2: AI suggests competitors if SERP data is limited
  let aiCompetitors: string[] = [];
  if (serpCompetitors.size < maxCompetitors) {
    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an SEO competitive analysis expert. Identify the top ${maxCompetitors} competitor domains for the given domain and niche. Return only domains that are real, active websites competing for the same keywords. Return JSON.`,
          },
          {
            role: "user",
            content: `Domain: ${domain}\nNiche: ${niche}\nSeed keywords: ${seedKeywords.join(", ")}\n\nList the top ${maxCompetitors} competitor domains.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "competitors",
            strict: true,
            schema: {
              type: "object",
              properties: {
                competitors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      domain: { type: "string" },
                      estimatedDA: { type: "integer" },
                      reason: { type: "string" },
                    },
                    required: ["domain", "estimatedDA", "reason"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["competitors"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content;
      const text = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent) || "{}";
      const parsed = JSON.parse(text);
      aiCompetitors = (parsed.competitors || []).map((c: any) => c.domain);
    } catch (err: any) {
      console.error("[GapAnalyzer] AI competitor discovery failed:", err.message);
    }
  }

  // Merge SERP + AI competitors
  const competitors: Competitor[] = [];

  // SERP-based competitors (most reliable)
  const sortedSerp = Array.from(serpCompetitors.entries())
    .sort((a, b) => b[1].keywords - a[1].keywords)
    .slice(0, maxCompetitors);

  for (const [compDomain, data] of sortedSerp) {
    const avgPosition = data.positions.reduce((a, b) => a + b, 0) / data.positions.length;
    competitors.push({
      domain: compDomain,
      estimatedDA: Math.max(10, Math.round(100 - avgPosition * 2)),
      overlapKeywords: data.keywords,
      uniqueKeywords: 0,
      discoveredAt: new Date(),
    });
  }

  // Add AI competitors not already in list
  for (const aiDomain of aiCompetitors) {
    if (competitors.length >= maxCompetitors) break;
    const clean = aiDomain.replace(/^www\./, "").toLowerCase();
    if (!competitors.find(c => c.domain === clean)) {
      competitors.push({
        domain: clean,
        estimatedDA: 50,
        overlapKeywords: 0,
        uniqueKeywords: 0,
        discoveredAt: new Date(),
      });
    }
  }

  console.log(`[GapAnalyzer] Found ${competitors.length} competitors: ${competitors.map(c => c.domain).join(", ")}`);
  return competitors.slice(0, maxCompetitors);
}

// ═══════════════════════════════════════════════
//  KEYWORD GAP DETECTION
// ═══════════════════════════════════════════════

/**
 * Find keywords competitors rank for but we don't
 */
export async function detectKeywordGaps(
  domain: string,
  competitors: Competitor[],
  seedKeywords: string[],
  niche: string,
): Promise<KeywordGap[]> {
  console.log(`[GapAnalyzer] Detecting keyword gaps for ${domain}...`);

  const gaps: KeywordGap[] = [];

  // 1. AI generates potential keywords competitors might rank for
  let competitorKeywords: string[] = [];
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an SEO keyword research expert. Given a niche and competitor domains, generate a list of 20-30 keywords that competitors likely rank for. Focus on:
1. Long-tail keywords (3-5 words)
2. Question-based keywords
3. Comparison keywords
4. "Best" and "Top" keywords
5. Niche-specific keywords
Return JSON with array of keywords.`,
        },
        {
          role: "user",
          content: `Niche: ${niche}\nOur domain: ${domain}\nCompetitors: ${competitors.map(c => c.domain).join(", ")}\nSeed keywords: ${seedKeywords.join(", ")}\n\nGenerate 20-30 potential competitor keywords.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "competitor_keywords",
          strict: true,
          schema: {
            type: "object",
            properties: {
              keywords: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["keywords"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const text = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent) || "{}";
    const parsed = JSON.parse(text);
    competitorKeywords = parsed.keywords || [];
  } catch (err: any) {
    console.error("[GapAnalyzer] AI keyword generation failed:", err.message);
    // Fallback: expand seed keywords
    competitorKeywords = seedKeywords.flatMap(k => [
      `best ${k}`,
      `top ${k}`,
      `${k} review`,
      `${k} guide`,
      `how to ${k}`,
    ]);
  }

  // 2. Check each keyword: where do competitors rank vs us?
  const keywordSet = new Set([...competitorKeywords, ...seedKeywords]);
  const allKeywords = Array.from(keywordSet);

  for (const keyword of allKeywords.slice(0, 30)) {
    try {
      const rankData = await serpTracker.checkKeywordRank(domain, keyword);

      if (rankData) {
        const ourPosition = rankData.position;

        // Check if any competitor ranks for this keyword
        for (const comp of competitors) {
          const compRank = rankData.competitors?.find(
            (c: any) => c.domain.replace(/^www\./, "").toLowerCase() === comp.domain.replace(/^www\./, "").toLowerCase()
          );

          if (compRank && compRank.position <= 30 && (ourPosition === null || ourPosition > 50)) {
            // Gap found! Competitor ranks but we don't
            const opportunityScore = calculateOpportunityScore(
              compRank.position,
              ourPosition,
              keyword,
            );

            gaps.push({
              id: `gap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              keyword,
              competitorDomain: comp.domain,
              competitorPosition: compRank.position,
              ourPosition,
              difficulty: Math.min(100, compRank.position * 3),
              estimatedVolume: estimateVolume(keyword),
              opportunityScore,
              contentType: classifyIntent(keyword),
              status: "discovered",
              discoveredAt: new Date(),
            });
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch {
      // Continue with next keyword
    }
  }

  // 3. Also use AI Keyword Sniper to find low-competition gaps
  try {
    const sniperResults = await findLowCompetitionKeywords(domain, niche, seedKeywords, "th", 10);
    for (const opp of sniperResults) {
      if (!gaps.find(g => g.keyword.toLowerCase() === opp.keyword.toLowerCase())) {
        gaps.push({
          id: `gap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          keyword: opp.keyword,
          competitorDomain: "ai-discovered",
          competitorPosition: 0,
          ourPosition: null,
          difficulty: opp.difficulty,
          estimatedVolume: opp.searchVolume,
          opportunityScore: opp.priorityScore,
          contentType: classifyIntent(opp.keyword),
          status: "discovered",
          discoveredAt: new Date(),
        });
      }
    }
  } catch {
    // Non-critical
  }

  // Sort by opportunity score (highest first)
  gaps.sort((a, b) => b.opportunityScore - a.opportunityScore);

  console.log(`[GapAnalyzer] Found ${gaps.length} keyword gaps (${gaps.filter(g => g.opportunityScore >= 70).length} high-opportunity)`);
  return gaps;
}

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

function calculateOpportunityScore(
  competitorPosition: number,
  ourPosition: number | null,
  keyword: string,
): number {
  let score = 50;

  // Competitor ranking well = higher opportunity
  if (competitorPosition <= 3) score += 30;
  else if (competitorPosition <= 10) score += 20;
  else if (competitorPosition <= 20) score += 10;

  // We're not ranking = bigger gap = higher opportunity
  if (ourPosition === null) score += 15;
  else if (ourPosition > 50) score += 10;

  // Long-tail keywords are easier
  const wordCount = keyword.split(/\s+/).length;
  if (wordCount >= 4) score += 10;
  else if (wordCount >= 3) score += 5;

  return Math.min(100, Math.max(0, score));
}

function estimateVolume(keyword: string): number {
  // Simple heuristic based on keyword length
  const wordCount = keyword.split(/\s+/).length;
  if (wordCount <= 2) return 5000;
  if (wordCount <= 3) return 2000;
  if (wordCount <= 4) return 800;
  return 300;
}

function classifyIntent(keyword: string): KeywordGap["contentType"] {
  const kw = keyword.toLowerCase();
  if (kw.includes("buy") || kw.includes("price") || kw.includes("discount") || kw.includes("สมัคร") || kw.includes("ฝาก")) {
    return "transactional";
  }
  if (kw.includes("best") || kw.includes("top") || kw.includes("review") || kw.includes("vs") || kw.includes("compare")) {
    return "commercial";
  }
  if (kw.includes("how") || kw.includes("what") || kw.includes("guide") || kw.includes("วิธี") || kw.includes("อะไร")) {
    return "informational";
  }
  return "informational";
}

// ═══════════════════════════════════════════════
//  GAP FILLING — AUTO CONTENT + DEPLOY
// ═══════════════════════════════════════════════

/**
 * Fill a single keyword gap with auto-generated content
 */
export async function fillGap(
  gap: KeywordGap,
  config: GapAnalyzerConfig,
): Promise<GapFillingResult> {
  console.log(`[GapAnalyzer] Filling gap: "${gap.keyword}" (score: ${gap.opportunityScore})`);

  try {
    // 1. Deploy content via Telegraph
    if (config.autoDeployContent) {
      const deployments = await deployTelegraphBlitz(
        gap.keyword,
        config.targetUrl,
        config.domain,
        1, // Deploy 1 article per gap
        config.language,
      );

      if (deployments.length > 0 && deployments[0].status === "deployed") {
        gap.status = "deployed";
        gap.contentUrl = deployments[0].url;
        gap.deployedAt = new Date();

        // 2. Rapid index the new content
        if (config.autoIndex) {
          try {
            await rapidIndexBulk(
              deployments.map(d => ({
                url: d.url,
                domain: config.domain,
                contentType: "parasite" as const,
                priority: "high" as const,
              })),
            );
          } catch {
            // Non-critical
          }
        }

        const result: GapFillingResult = {
          gapId: gap.id,
          keyword: gap.keyword,
          contentGenerated: true,
          deployed: true,
          deploymentUrl: deployments[0].url,
          indexed: config.autoIndex,
        };
        fillingHistory.push(result);
        return result;
      }
    }

    gap.status = "content_created";
    const result: GapFillingResult = {
      gapId: gap.id,
      keyword: gap.keyword,
      contentGenerated: true,
      deployed: false,
      indexed: false,
    };
    fillingHistory.push(result);
    return result;
  } catch (err: any) {
    console.error(`[GapAnalyzer] Gap filling failed for "${gap.keyword}":`, err.message);
    const result: GapFillingResult = {
      gapId: gap.id,
      keyword: gap.keyword,
      contentGenerated: false,
      deployed: false,
      indexed: false,
      error: err.message,
    };
    fillingHistory.push(result);
    return result;
  }
}

/**
 * Fill multiple gaps in batch
 */
export async function fillGapsBatch(
  gaps: KeywordGap[],
  config: GapAnalyzerConfig,
): Promise<GapFillingResult[]> {
  const results: GapFillingResult[] = [];

  for (const gap of gaps.slice(0, config.maxGapsToFill)) {
    if (gap.opportunityScore < config.minOpportunityScore) continue;
    if (gap.status !== "discovered") continue;

    const result = await fillGap(gap, config);
    results.push(result);

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  return results;
}

// ═══════════════════════════════════════════════
//  FULL ANALYSIS PIPELINE
// ═══════════════════════════════════════════════

/**
 * Run complete gap analysis: discover competitors → find gaps → fill gaps
 */
export async function runGapAnalysis(
  config: GapAnalyzerConfig,
): Promise<GapAnalysis> {
  console.log(`[GapAnalyzer] Starting full gap analysis for ${config.domain}...`);

  // 1. Discover competitors
  const competitors = await discoverCompetitors(
    config.domain,
    config.niche,
    config.seedKeywords,
    config.maxCompetitors,
  );

  // 2. Detect keyword gaps
  const gaps = await detectKeywordGaps(
    config.domain,
    competitors,
    config.seedKeywords,
    config.niche,
  );

  // 3. Create analysis record
  const analysis: GapAnalysis = {
    id: `analysis_${Date.now()}`,
    domain: config.domain,
    niche: config.niche,
    competitors,
    gaps,
    totalGaps: gaps.length,
    highOpportunityGaps: gaps.filter(g => g.opportunityScore >= 70).length,
    gapsFilled: 0,
    gapsRanking: 0,
    analyzedAt: new Date(),
    lastUpdatedAt: new Date(),
  };

  // 4. Auto-fill high-opportunity gaps
  if (config.autoDeployContent) {
    const highGaps = gaps.filter(g => g.opportunityScore >= config.minOpportunityScore);
    const fillResults = await fillGapsBatch(highGaps, config);

    analysis.gapsFilled = fillResults.filter(r => r.deployed).length;
  }

  analyses.set(config.domain, analysis);

  // 5. Telegram notification
  try {
    await sendTelegramNotification({
      type: "success",
      targetUrl: config.domain,
      details: `GAP ANALYSIS COMPLETE\nCompetitors: ${competitors.length}\nGaps found: ${gaps.length}\nHigh opportunity: ${analysis.highOpportunityGaps}\nGaps filled: ${analysis.gapsFilled}`,
      keywords: gaps.slice(0, 5).map(g => g.keyword),
    });
  } catch {
    // Non-critical
  }

  console.log(`[GapAnalyzer] Analysis complete: ${gaps.length} gaps found, ${analysis.gapsFilled} filled`);

  return analysis;
}

// ═══════════════════════════════════════════════
//  ALGORITHM-AWARE CONTENT GAP ANALYSIS
// ═══════════════════════════════════════════════

/**
 * Analyze competitor content against 222 ranking factors
 * Returns specific factors where competitor is weak and we can exploit
 */
export async function analyzeCompetitorFactorGaps(
  competitorDomain: string,
  targetKeyword: string,
  niche: string = "gambling",
): Promise<{
  competitorWeakFactors: Array<{ category: string; factorName: string; weakness: string; exploitStrategy: string; priority: number }>;
  ourAdvantages: string[];
  attackPlan: string[];
  overallOpportunityScore: number;
}> {
  const criticalFactors = getCriticalFactors();
  const categories: FactorCategory[] = ["domain", "page_level", "site_level", "backlink", "user_interaction", "special_algorithm", "brand_signal"];

  const factorSummary = categories.map(cat => {
    const factors = getFactorsByCategory(cat);
    return `${cat}: ${factors.slice(0, 8).map(f => `${f.name} (impact:${f.impact})`).join(", ")}`;
  }).join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a Google Algorithm expert analyzing competitor weaknesses against 222 ranking factors. Today is ${new Date().toISOString().split("T")[0]}.\n\nRanking Factor Categories:\n${factorSummary}\n\nCritical Factors: ${criticalFactors.slice(0, 15).map(f => f.name).join(", ")}`,
      },
      {
        role: "user",
        content: `Analyze competitor ${competitorDomain} for keyword "${targetKeyword}" in ${niche} niche.\n\nIdentify:\n1. 8-12 specific ranking factors where competitor is WEAK\n2. Our advantages we can exploit\n3. Step-by-step attack plan\n4. Overall opportunity score (0-100)\n\nReturn JSON.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "factor_gap_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            competitorWeakFactors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string" },
                  factorName: { type: "string" },
                  weakness: { type: "string" },
                  exploitStrategy: { type: "string" },
                  priority: { type: "number" },
                },
                required: ["category", "factorName", "weakness", "exploitStrategy", "priority"],
                additionalProperties: false,
              },
            },
            ourAdvantages: { type: "array", items: { type: "string" } },
            attackPlan: { type: "array", items: { type: "string" } },
            overallOpportunityScore: { type: "number" },
          },
          required: ["competitorWeakFactors", "ourAdvantages", "attackPlan", "overallOpportunityScore"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  let parsed: any = { competitorWeakFactors: [], ourAdvantages: [], attackPlan: [], overallOpportunityScore: 50 };
  try {
    if (content) parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  } catch {}

  return {
    competitorWeakFactors: parsed.competitorWeakFactors || [],
    ourAdvantages: parsed.ourAdvantages || [],
    attackPlan: parsed.attackPlan || [],
    overallOpportunityScore: parsed.overallOpportunityScore || 50,
  };
}

/**
 * Score our content vs competitor content using Algorithm Intelligence
 */
export async function compareContentScores(
  ourContent: string,
  competitorUrl: string,
  keyword: string,
): Promise<{
  ourScore: number;
  competitorEstimatedScore: number;
  advantage: number;
  improvements: string[];
}> {
  const ourScore = scoreContent({ title: "", content: ourContent, keyword });

  // Estimate competitor score via AI
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an SEO content quality scorer. Estimate the SEO score of a competitor's page based on its URL and the target keyword. Consider content quality, E-E-A-T, technical SEO, and user experience. Return a score 0-100.",
      },
      {
        role: "user",
        content: `Competitor URL: ${competitorUrl}\nTarget keyword: "${keyword}"\n\nEstimate their SEO content score (0-100) and list 3-5 improvements we should make.\n\nReturn JSON with: competitorScore (number), improvements (string array)`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "competitor_score",
        strict: true,
        schema: {
          type: "object",
          properties: {
            competitorScore: { type: "number" },
            improvements: { type: "array", items: { type: "string" } },
          },
          required: ["competitorScore", "improvements"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  let parsed: any = { competitorScore: 60, improvements: [] };
  try {
    if (content) parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  } catch {}

  return {
    ourScore: ourScore.overall,
    competitorEstimatedScore: parsed.competitorScore || 60,
    advantage: ourScore.overall - (parsed.competitorScore || 60),
    improvements: parsed.improvements || [],
  };
}

/**
 * Generate algorithm-optimized content specifically designed to outrank a competitor
 */
export function generateOutrankPrompt(
  competitorDomain: string,
  keyword: string,
  weakFactors: string[],
): string {
  const basePrompt = generateOptimizedContentPrompt({ keyword, niche: "gambling", language: "th" });
  return `${basePrompt}\n\nCOMPETITOR OUTRANKING STRATEGY:\nTarget: ${competitorDomain}\nExploit these weak factors: ${weakFactors.join(", ")}\n\nYour content MUST:\n1. Be significantly better than ${competitorDomain} on every weak factor\n2. Include more comprehensive coverage of the topic\n3. Have stronger E-E-A-T signals\n4. Be more engaging and user-friendly\n5. Include more internal/external authority links\n6. Have better structured data potential`;
}

// ═══════════════════════════════════════════════
//  DEFAULT CONFIG
// ═══════════════════════════════════════════════

export function createDefaultGapConfig(
  domain: string,
  targetUrl: string,
  seedKeywords: string[],
  niche: string = "gambling",
  language: string = "th",
): GapAnalyzerConfig {
  return {
    domain,
    targetUrl,
    niche,
    language,
    maxCompetitors: 5,
    maxGapsToFill: 10,
    minOpportunityScore: 60,
    autoDeployContent: true,
    autoIndex: true,
    seedKeywords,
  };
}

// ═══════════════════════════════════════════════
//  DAEMON TICK
// ═══════════════════════════════════════════════

/**
 * Called by daemon/orchestrator to run periodic gap analysis
 */
export async function gapAnalyzerTick(
  domain: string,
  targetUrl: string,
  seedKeywords: string[],
  niche: string = "gambling",
): Promise<GapAnalysis | null> {
  // Check if we already have a recent analysis (within 24 hours)
  const existing = analyses.get(domain);
  if (existing) {
    const hoursSinceAnalysis = (Date.now() - existing.analyzedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceAnalysis < 24) {
      console.log(`[GapAnalyzer] Recent analysis exists for ${domain} (${Math.round(hoursSinceAnalysis)}h ago), skipping`);
      return existing;
    }
  }

  const config = createDefaultGapConfig(domain, targetUrl, seedKeywords, niche);
  return runGapAnalysis(config);
}
