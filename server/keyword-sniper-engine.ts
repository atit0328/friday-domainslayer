/**
 * Low-Competition Keyword Sniper + Aggressive Link Velocity Controller
 * 
 * AI-powered system that:
 * 1. Finds low-competition, high-value keywords that can rank in 7 days
 * 2. Clusters keywords by search intent for maximum topical authority
 * 3. Controls link building velocity (50-100+ backlinks in first 3 days)
 * 4. Manages tiered link building (T1 → T2 → T3) with proper velocity curves
 * 5. Auto-adjusts strategy based on daily rank changes
 */

import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import * as serpApi from "./serp-api";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface KeywordOpportunity {
  keyword: string;
  searchVolume: number;
  difficulty: number; // 0-100
  cpc: number;
  intent: "informational" | "transactional" | "navigational" | "commercial";
  competitorWeakness: string; // why this keyword is easy to rank for
  estimatedDaysToRank: number;
  priorityScore: number; // 0-100 (higher = better opportunity)
  cluster?: string;
  longTail: boolean;
  language: string;
}

export interface KeywordCluster {
  name: string;
  pillarKeyword: string;
  supportingKeywords: KeywordOpportunity[];
  totalSearchVolume: number;
  avgDifficulty: number;
  intent: string;
  contentStrategy: string;
}

export interface LinkVelocityPlan {
  day: number;
  tier1Links: number;
  tier2Links: number;
  tier3Links: number;
  tier1Types: string[]; // e.g., ["pbn", "web2", "guest_post"]
  tier2Types: string[]; // e.g., ["social_bookmark", "blog_comment", "forum"]
  tier3Types: string[]; // e.g., ["auto_generated", "profile", "wiki"]
  anchorDistribution: { exact: number; partial: number; branded: number; generic: number; naked: number };
}

export interface LinkVelocityReport {
  domain: string;
  keyword: string;
  day: number;
  totalLinksBuilt: number;
  tier1Built: number;
  tier2Built: number;
  tier3Built: number;
  indexedLinks: number;
  rankChange: number;
  nextDayPlan: LinkVelocityPlan;
}

export interface SniperCampaign {
  id: string;
  domain: string;
  targetKeywords: KeywordOpportunity[];
  clusters: KeywordCluster[];
  velocityPlan: LinkVelocityPlan[];
  startDate: Date;
  currentDay: number;
  status: "planning" | "executing" | "adjusting" | "completed";
  dailyReports: LinkVelocityReport[];
}

// ═══════════════════════════════════════════════
//  KEYWORD SNIPER: Find Easy-Win Keywords
// ═══════════════════════════════════════════════

/**
 * Use AI + SERP data to find low-competition keywords that can rank in 7 days
 */
export async function findLowCompetitionKeywords(
  domain: string,
  niche: string,
  seedKeywords: string[],
  language: string = "th",
  maxResults: number = 50
): Promise<KeywordOpportunity[]> {
  console.log(`[KeywordSniper] Finding low-competition keywords for ${domain} in niche: ${niche}`);
  
  // Step 1: Use AI to expand seed keywords into potential opportunities
  const expansionPrompt = `You are an expert SEO keyword researcher. Find low-competition keywords that a new website can rank for within 7 days.

Domain: ${domain}
Niche: ${niche}
Seed Keywords: ${seedKeywords.join(", ")}
Language: ${language === "th" ? "Thai" : "English"}

Find keywords that meet ALL these criteria:
1. Low competition (few strong competitors on page 1)
2. Reasonable search volume (100-10,000/month)
3. Clear search intent (informational or commercial)
4. Long-tail preferred (3-7 words)
5. Competitor weaknesses visible (thin content, low DA sites ranking, forums ranking, etc.)

For each keyword, analyze:
- Why it's easy to rank for (competitor weakness)
- Estimated days to reach page 1
- Search intent category
- Whether it's a long-tail variation

Return JSON array of objects with fields:
keyword, searchVolume (estimate), difficulty (0-100), cpc (estimate), intent, competitorWeakness, estimatedDaysToRank, priorityScore (0-100), longTail (boolean), language

Find at least 30 keywords. Focus on EASY WINS that can rank fast.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an SEO expert. Return ONLY valid JSON array." },
        { role: "user", content: expansionPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "keyword_opportunities",
          strict: true,
          schema: {
            type: "object",
            properties: {
              keywords: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    keyword: { type: "string" },
                    searchVolume: { type: "number" },
                    difficulty: { type: "number" },
                    cpc: { type: "number" },
                    intent: { type: "string" },
                    competitorWeakness: { type: "string" },
                    estimatedDaysToRank: { type: "number" },
                    priorityScore: { type: "number" },
                    longTail: { type: "boolean" },
                    language: { type: "string" },
                  },
                  required: ["keyword", "searchVolume", "difficulty", "cpc", "intent", "competitorWeakness", "estimatedDaysToRank", "priorityScore", "longTail", "language"],
                  additionalProperties: false,
                },
              },
            },
            required: ["keywords"],
            additionalProperties: false,
          },
        },
      },
    });
    
    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent) return [];
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    
    const parsed = JSON.parse(content);
    const keywords: KeywordOpportunity[] = (parsed.keywords || [])
      .filter((k: any) => k.difficulty <= 40 && k.priorityScore >= 50)
      .sort((a: any, b: any) => b.priorityScore - a.priorityScore)
      .slice(0, maxResults);
    
    console.log(`[KeywordSniper] Found ${keywords.length} low-competition keywords`);
    return keywords;
  } catch (err: any) {
    console.error(`[KeywordSniper] AI keyword expansion failed:`, err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════
//  KEYWORD CLUSTERING
// ═══════════════════════════════════════════════

/**
 * Cluster keywords by search intent and topical relevance
 */
export async function clusterKeywords(keywords: KeywordOpportunity[]): Promise<KeywordCluster[]> {
  if (keywords.length === 0) return [];
  
  console.log(`[KeywordSniper] Clustering ${keywords.length} keywords...`);
  
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an SEO expert specializing in keyword clustering and content strategy. Return ONLY valid JSON." },
        { role: "user", content: `Cluster these keywords by topical relevance and search intent. Each cluster should have a pillar keyword and supporting keywords.

Keywords:
${keywords.map(k => `- "${k.keyword}" (vol: ${k.searchVolume}, diff: ${k.difficulty}, intent: ${k.intent})`).join("\n")}

For each cluster, provide:
- name: cluster topic name
- pillarKeyword: the main keyword for this cluster
- supportingKeywordIndices: array of indices (0-based) of supporting keywords
- intent: dominant search intent
- contentStrategy: brief strategy for this cluster (e.g., "Create comprehensive guide + 5 supporting articles")

Return JSON with "clusters" array.` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "keyword_clusters",
          strict: true,
          schema: {
            type: "object",
            properties: {
              clusters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    pillarKeyword: { type: "string" },
                    supportingKeywordIndices: { type: "array", items: { type: "number" } },
                    intent: { type: "string" },
                    contentStrategy: { type: "string" },
                  },
                  required: ["name", "pillarKeyword", "supportingKeywordIndices", "intent", "contentStrategy"],
                  additionalProperties: false,
                },
              },
            },
            required: ["clusters"],
            additionalProperties: false,
          },
        },
      },
    });
    
    const rawContent2 = response.choices?.[0]?.message?.content;
    if (!rawContent2) return [];
    const content2 = typeof rawContent2 === "string" ? rawContent2 : JSON.stringify(rawContent2);
    
    const parsed = JSON.parse(content2);
    const clusters: KeywordCluster[] = (parsed.clusters || []).map((c: any) => {
      const supportingKws = (c.supportingKeywordIndices || [])
        .filter((i: number) => i >= 0 && i < keywords.length)
        .map((i: number) => keywords[i]);
      
      return {
        name: c.name,
        pillarKeyword: c.pillarKeyword,
        supportingKeywords: supportingKws,
        totalSearchVolume: supportingKws.reduce((sum: number, k: KeywordOpportunity) => sum + k.searchVolume, 0),
        avgDifficulty: supportingKws.length > 0 
          ? supportingKws.reduce((sum: number, k: KeywordOpportunity) => sum + k.difficulty, 0) / supportingKws.length 
          : 0,
        intent: c.intent,
        contentStrategy: c.contentStrategy,
      };
    });
    
    console.log(`[KeywordSniper] Created ${clusters.length} keyword clusters`);
    return clusters;
  } catch (err: any) {
    console.error(`[KeywordSniper] Clustering failed:`, err.message);
    // Fallback: group by intent
    const intentGroups = new Map<string, KeywordOpportunity[]>();
    for (const kw of keywords) {
      const group = intentGroups.get(kw.intent) || [];
      group.push(kw);
      intentGroups.set(kw.intent, group);
    }
    
    return Array.from(intentGroups.entries()).map(([intent, kws]) => ({
      name: `${intent} keywords`,
      pillarKeyword: kws[0].keyword,
      supportingKeywords: kws,
      totalSearchVolume: kws.reduce((sum, k) => sum + k.searchVolume, 0),
      avgDifficulty: kws.reduce((sum, k) => sum + k.difficulty, 0) / kws.length,
      intent,
      contentStrategy: `Create content targeting ${kws.length} ${intent} keywords`,
    }));
  }
}

// ═══════════════════════════════════════════════
//  LINK VELOCITY CONTROLLER
// ═══════════════════════════════════════════════

/**
 * Generate a 7-day link velocity plan
 * Day 1-3: Aggressive (50-100+ links/day)
 * Day 4-5: Moderate (20-40 links/day)
 * Day 6-7: Maintenance (10-20 links/day)
 * 
 * This follows the "burst then taper" pattern that mimics viral content
 */
export function generateVelocityPlan(
  keyword: string,
  difficulty: number,
  aggressiveness: "extreme" | "aggressive" | "moderate" = "aggressive"
): LinkVelocityPlan[] {
  // Base multiplier based on aggressiveness
  const multiplier = aggressiveness === "extreme" ? 2.0 : 
                     aggressiveness === "aggressive" ? 1.0 : 0.5;
  
  // Difficulty adjustment: harder keywords need more links
  const diffMultiplier = 1 + (difficulty / 100);
  
  const m = multiplier * diffMultiplier;
  
  const plan: LinkVelocityPlan[] = [
    // Day 1: Initial burst — establish authority signals
    {
      day: 1,
      tier1Links: Math.round(15 * m),
      tier2Links: Math.round(30 * m),
      tier3Links: Math.round(50 * m),
      tier1Types: ["web2", "telegraph", "pbn"],
      tier2Types: ["social_bookmark", "blog_comment", "forum_profile"],
      tier3Types: ["auto_generated", "wiki_link", "profile_link"],
      anchorDistribution: { exact: 30, partial: 25, branded: 20, generic: 15, naked: 10 },
    },
    // Day 2: Peak velocity — maximum link juice
    {
      day: 2,
      tier1Links: Math.round(20 * m),
      tier2Links: Math.round(40 * m),
      tier3Links: Math.round(60 * m),
      tier1Types: ["web2", "telegraph", "guest_post", "pbn"],
      tier2Types: ["social_bookmark", "blog_comment", "forum_profile", "directory"],
      tier3Types: ["auto_generated", "wiki_link", "profile_link", "rss_feed"],
      anchorDistribution: { exact: 25, partial: 30, branded: 20, generic: 15, naked: 10 },
    },
    // Day 3: Sustained high — diversify sources
    {
      day: 3,
      tier1Links: Math.round(18 * m),
      tier2Links: Math.round(35 * m),
      tier3Links: Math.round(50 * m),
      tier1Types: ["web2", "telegraph", "pbn", "article_directory"],
      tier2Types: ["social_bookmark", "blog_comment", "forum_profile"],
      tier3Types: ["auto_generated", "profile_link"],
      anchorDistribution: { exact: 20, partial: 30, branded: 25, generic: 15, naked: 10 },
    },
    // Day 4: Begin taper — shift to quality
    {
      day: 4,
      tier1Links: Math.round(12 * m),
      tier2Links: Math.round(25 * m),
      tier3Links: Math.round(30 * m),
      tier1Types: ["web2", "pbn", "guest_post"],
      tier2Types: ["social_bookmark", "blog_comment"],
      tier3Types: ["auto_generated", "profile_link"],
      anchorDistribution: { exact: 15, partial: 30, branded: 30, generic: 15, naked: 10 },
    },
    // Day 5: Moderate — focus on high-quality T1
    {
      day: 5,
      tier1Links: Math.round(10 * m),
      tier2Links: Math.round(20 * m),
      tier3Links: Math.round(20 * m),
      tier1Types: ["web2", "pbn"],
      tier2Types: ["social_bookmark", "blog_comment"],
      tier3Types: ["auto_generated"],
      anchorDistribution: { exact: 10, partial: 25, branded: 35, generic: 20, naked: 10 },
    },
    // Day 6: Maintenance — natural-looking growth
    {
      day: 6,
      tier1Links: Math.round(8 * m),
      tier2Links: Math.round(15 * m),
      tier3Links: Math.round(15 * m),
      tier1Types: ["web2", "telegraph"],
      tier2Types: ["social_bookmark"],
      tier3Types: ["auto_generated"],
      anchorDistribution: { exact: 10, partial: 20, branded: 40, generic: 20, naked: 10 },
    },
    // Day 7: Stabilize — ensure sustainability
    {
      day: 7,
      tier1Links: Math.round(5 * m),
      tier2Links: Math.round(10 * m),
      tier3Links: Math.round(10 * m),
      tier1Types: ["web2"],
      tier2Types: ["social_bookmark"],
      tier3Types: ["auto_generated"],
      anchorDistribution: { exact: 5, partial: 20, branded: 45, generic: 20, naked: 10 },
    },
  ];
  
  return plan;
}

/**
 * Calculate total links for a velocity plan
 */
export function calculatePlanTotals(plan: LinkVelocityPlan[]): {
  totalTier1: number;
  totalTier2: number;
  totalTier3: number;
  grandTotal: number;
  peakDay: number;
  peakLinks: number;
} {
  let totalTier1 = 0, totalTier2 = 0, totalTier3 = 0;
  let peakDay = 0, peakLinks = 0;
  
  for (const day of plan) {
    totalTier1 += day.tier1Links;
    totalTier2 += day.tier2Links;
    totalTier3 += day.tier3Links;
    const dayTotal = day.tier1Links + day.tier2Links + day.tier3Links;
    if (dayTotal > peakLinks) {
      peakLinks = dayTotal;
      peakDay = day.day;
    }
  }
  
  return {
    totalTier1,
    totalTier2,
    totalTier3,
    grandTotal: totalTier1 + totalTier2 + totalTier3,
    peakDay,
    peakLinks,
  };
}

// ═══════════════════════════════════════════════
//  ADAPTIVE VELOCITY ADJUSTMENT
// ═══════════════════════════════════════════════

/**
 * Adjust velocity plan based on ranking progress
 * If ranking is improving → maintain or slightly reduce
 * If ranking is stagnant → increase velocity
 * If ranking is dropping → change strategy
 */
export async function adjustVelocityPlan(
  currentPlan: LinkVelocityPlan[],
  currentDay: number,
  rankChange: number, // positive = improved
  currentPosition: number | null,
  keyword: string,
  domain: string
): Promise<{ adjustedPlan: LinkVelocityPlan[]; adjustment: string; reason: string }> {
  const remainingDays = currentPlan.filter(p => p.day > currentDay);
  
  if (remainingDays.length === 0) {
    return { adjustedPlan: currentPlan, adjustment: "none", reason: "Campaign completed" };
  }
  
  let adjustment = "none";
  let reason = "";
  
  if (currentPosition !== null && currentPosition <= 10) {
    // Already on page 1 — reduce velocity to maintain
    adjustment = "reduce";
    reason = `Already ranking #${currentPosition} — switching to maintenance mode`;
    for (const day of remainingDays) {
      day.tier1Links = Math.round(day.tier1Links * 0.3);
      day.tier2Links = Math.round(day.tier2Links * 0.3);
      day.tier3Links = Math.round(day.tier3Links * 0.3);
      // Shift to branded anchors
      day.anchorDistribution = { exact: 5, partial: 15, branded: 50, generic: 20, naked: 10 };
    }
  } else if (rankChange > 5) {
    // Strong improvement — maintain current velocity
    adjustment = "maintain";
    reason = `Rank improved by ${rankChange} positions — maintaining velocity`;
  } else if (rankChange >= 0 && rankChange <= 5) {
    // Slight improvement or stagnant — increase velocity by 30%
    adjustment = "increase_moderate";
    reason = `Rank change: ${rankChange} — increasing velocity by 30%`;
    for (const day of remainingDays) {
      day.tier1Links = Math.round(day.tier1Links * 1.3);
      day.tier2Links = Math.round(day.tier2Links * 1.3);
      day.tier3Links = Math.round(day.tier3Links * 1.3);
    }
  } else if (rankChange < 0) {
    // Ranking dropped — aggressive increase + strategy change
    adjustment = "increase_aggressive";
    reason = `Rank dropped by ${Math.abs(rankChange)} — aggressive velocity increase + strategy diversification`;
    for (const day of remainingDays) {
      day.tier1Links = Math.round(day.tier1Links * 1.8);
      day.tier2Links = Math.round(day.tier2Links * 1.5);
      day.tier3Links = Math.round(day.tier3Links * 1.5);
      // Add more link types
      if (!day.tier1Types.includes("guest_post")) day.tier1Types.push("guest_post");
      if (!day.tier2Types.includes("directory")) day.tier2Types.push("directory");
      // Reduce exact match anchors to avoid penalty
      day.anchorDistribution = { exact: 10, partial: 25, branded: 35, generic: 20, naked: 10 };
    }
  }
  
  console.log(`[LinkVelocity] Adjustment: ${adjustment} — ${reason}`);
  
  return { adjustedPlan: currentPlan, adjustment, reason };
}

// ═══════════════════════════════════════════════
//  SNIPER CAMPAIGN: Full 7-Day Campaign
// ═══════════════════════════════════════════════

/**
 * Create a complete 7-day sniper campaign
 */
export async function createSniperCampaign(
  domain: string,
  niche: string,
  seedKeywords: string[],
  language: string = "th",
  aggressiveness: "extreme" | "aggressive" | "moderate" = "aggressive"
): Promise<SniperCampaign> {
  console.log(`[KeywordSniper] Creating 7-day sniper campaign for ${domain}`);
  
  // Step 1: Find low-competition keywords
  const keywords = await findLowCompetitionKeywords(domain, niche, seedKeywords, language);
  
  // Step 2: Cluster keywords
  const clusters = await clusterKeywords(keywords);
  
  // Step 3: Generate velocity plan for the primary keyword
  const primaryKeyword = keywords[0] || { keyword: seedKeywords[0], difficulty: 30 };
  const velocityPlan = generateVelocityPlan(
    primaryKeyword.keyword,
    primaryKeyword.difficulty,
    aggressiveness
  );
  
  const campaign: SniperCampaign = {
    id: `sniper_${Date.now().toString(36)}`,
    domain,
    targetKeywords: keywords,
    clusters,
    velocityPlan,
    startDate: new Date(),
    currentDay: 0,
    status: "planning",
    dailyReports: [],
  };
  
  const totals = calculatePlanTotals(velocityPlan);
  console.log(`[KeywordSniper] Campaign created:
  - Keywords: ${keywords.length}
  - Clusters: ${clusters.length}
  - Total links planned: ${totals.grandTotal}
  - Peak day: Day ${totals.peakDay} (${totals.peakLinks} links)
  - T1: ${totals.totalTier1}, T2: ${totals.totalTier2}, T3: ${totals.totalTier3}`);
  
  return campaign;
}

/**
 * Get the execution plan for a specific day
 */
export function getDayPlan(campaign: SniperCampaign, day: number): LinkVelocityPlan | null {
  return campaign.velocityPlan.find(p => p.day === day) || null;
}

/**
 * Select anchor text based on distribution
 */
export function selectAnchorText(
  keyword: string,
  domain: string,
  distribution: { exact: number; partial: number; branded: number; generic: number; naked: number }
): string {
  const rand = Math.random() * 100;
  
  if (rand < distribution.exact) {
    return keyword; // Exact match
  } else if (rand < distribution.exact + distribution.partial) {
    // Partial match — add modifier
    const modifiers = ["best", "top", "guide", "review", "how to", "tips", "2026", "online"];
    const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
    return Math.random() > 0.5 ? `${mod} ${keyword}` : `${keyword} ${mod}`;
  } else if (rand < distribution.exact + distribution.partial + distribution.branded) {
    // Branded
    const brandVariants = [domain, domain.replace(/\.(com|net|org|io)$/, ""), `Visit ${domain}`];
    return brandVariants[Math.floor(Math.random() * brandVariants.length)];
  } else if (rand < distribution.exact + distribution.partial + distribution.branded + distribution.generic) {
    // Generic
    const generics = ["click here", "read more", "learn more", "visit site", "check this out", "see details", "more info", "official site"];
    return generics[Math.floor(Math.random() * generics.length)];
  } else {
    // Naked URL
    return `https://${domain}`;
  }
}
