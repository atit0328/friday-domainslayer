/**
 * Real-time Google Algorithm Update Monitor
 * ═══════════════════════════════════════════════════════════════
 * 
 * Monitors Google algorithm updates from multiple sources:
 * 1. Uses AI to analyze latest SEO news and algorithm changes
 * 2. Detects ranking volatility patterns
 * 3. Auto-adjusts ranking factor weights based on updates
 * 4. Alerts when new updates are detected
 * 5. Provides historical timeline of all algorithm updates
 * 
 * Sources: Search Engine Journal, Moz, Search Engine Land, 
 *          Google Search Central Blog, SEMrush Sensor, etc.
 * ═══════════════════════════════════════════════════════════════
 */

import { invokeLLM } from "./_core/llm";
import { sendTelegramNotification } from "./telegram-notifier";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export type UpdateSeverity = "major" | "significant" | "minor" | "unconfirmed";
export type UpdateCategory = "core" | "spam" | "helpful_content" | "link" | "local" | "product_reviews" | "page_experience" | "other";

export interface AlgorithmUpdate {
  id: string;
  name: string;
  date: string;
  severity: UpdateSeverity;
  category: UpdateCategory;
  description: string;
  affectedFactors: string[];
  impactAreas: string[];
  recommendedActions: string[];
  source: string;
  confirmed: boolean;
  volatilityScore: number; // 1-10
  /** Weight adjustments to apply to ranking factors */
  weightAdjustments: Array<{
    factorCategory: string;
    adjustment: number; // -5 to +5
    reason: string;
  }>;
}

export interface VolatilityReading {
  timestamp: number;
  score: number; // 1-10
  source: string;
  categories: Record<string, number>;
}

export interface MonitorStatus {
  lastCheck: number;
  totalUpdates: number;
  recentUpdates: AlgorithmUpdate[];
  currentVolatility: number;
  volatilityTrend: "rising" | "stable" | "falling";
  activeAlerts: string[];
}

// ═══════════════════════════════════════════════
//  HISTORICAL ALGORITHM UPDATES DATABASE
// ═══════════════════════════════════════════════

const KNOWN_UPDATES: AlgorithmUpdate[] = [
  {
    id: "core-march-2025",
    name: "March 2025 Core Update",
    date: "2025-03-13",
    severity: "major",
    category: "core",
    description: "Broad core algorithm update affecting content quality signals, E-E-A-T evaluation, and helpful content assessment. Significant impact on YMYL niches.",
    affectedFactors: ["content_quality", "eeat", "helpful_content", "user_experience"],
    impactAreas: ["YMYL sites", "thin content", "AI-generated content", "affiliate sites"],
    recommendedActions: [
      "Audit content for E-E-A-T signals",
      "Remove or improve thin/low-quality pages",
      "Add author expertise indicators",
      "Improve user engagement metrics",
    ],
    source: "Google Search Central Blog",
    confirmed: true,
    volatilityScore: 8,
    weightAdjustments: [
      { factorCategory: "page_level", adjustment: 3, reason: "Content quality signals strengthened" },
      { factorCategory: "special_algorithm", adjustment: 4, reason: "E-E-A-T and Helpful Content heavily weighted" },
    ],
  },
  {
    id: "spam-march-2025",
    name: "March 2025 Spam Update",
    date: "2025-03-05",
    severity: "significant",
    category: "spam",
    description: "Targeted spam update focusing on scaled content abuse, site reputation abuse (parasite SEO), and expired domain abuse.",
    affectedFactors: ["spam_detection", "link_schemes", "cloaking", "doorway_pages"],
    impactAreas: ["Parasite SEO", "PBN networks", "expired domain abuse", "scaled AI content"],
    recommendedActions: [
      "Diversify content distribution platforms",
      "Improve content uniqueness per platform",
      "Reduce link velocity on suspicious patterns",
      "Add more human-like content signals",
    ],
    source: "Google Search Central Blog",
    confirmed: true,
    volatilityScore: 7,
    weightAdjustments: [
      { factorCategory: "on_site_spam", adjustment: 5, reason: "Spam detection significantly enhanced" },
      { factorCategory: "off_site_spam", adjustment: 4, reason: "Link scheme detection improved" },
    ],
  },
  {
    id: "core-nov-2024",
    name: "November 2024 Core Update",
    date: "2024-11-11",
    severity: "major",
    category: "core",
    description: "Major core update with focus on content originality, user satisfaction signals, and site-level quality assessment.",
    affectedFactors: ["content_quality", "originality", "user_satisfaction", "site_authority"],
    impactAreas: ["Content farms", "duplicate content", "low-engagement sites"],
    recommendedActions: [
      "Focus on original research and unique insights",
      "Improve content depth and comprehensiveness",
      "Enhance user engagement signals",
    ],
    source: "Google Search Central Blog",
    confirmed: true,
    volatilityScore: 8,
    weightAdjustments: [
      { factorCategory: "page_level", adjustment: 2, reason: "Content originality signals boosted" },
      { factorCategory: "user_interaction", adjustment: 3, reason: "User satisfaction signals weighted higher" },
    ],
  },
  {
    id: "helpful-content-sep-2024",
    name: "September 2024 Helpful Content Update",
    date: "2024-09-12",
    severity: "significant",
    category: "helpful_content",
    description: "Refinement of helpful content system with improved detection of AI-generated content and better assessment of content helpfulness.",
    affectedFactors: ["helpful_content", "ai_content_detection", "user_first_content"],
    impactAreas: ["AI-generated sites", "thin affiliate content", "content-for-SEO sites"],
    recommendedActions: [
      "Humanize AI-generated content",
      "Add personal experience and expertise",
      "Focus on user intent satisfaction",
    ],
    source: "Google Search Central Blog",
    confirmed: true,
    volatilityScore: 7,
    weightAdjustments: [
      { factorCategory: "special_algorithm", adjustment: 3, reason: "Helpful Content classifier refined" },
      { factorCategory: "page_level", adjustment: 2, reason: "Content helpfulness signals enhanced" },
    ],
  },
  {
    id: "link-spam-dec-2024",
    name: "December 2024 Link Spam Update",
    date: "2024-12-19",
    severity: "significant",
    category: "link",
    description: "SpamBrain update targeting unnatural link patterns, PBN networks, and link buying/selling schemes.",
    affectedFactors: ["link_quality", "anchor_text_patterns", "link_velocity", "pbn_detection"],
    impactAreas: ["PBN networks", "link sellers", "over-optimized anchor text", "link farms"],
    recommendedActions: [
      "Diversify anchor text profiles",
      "Reduce link velocity",
      "Use more natural link building patterns",
      "Avoid obvious PBN footprints",
    ],
    source: "Google Search Central Blog",
    confirmed: true,
    volatilityScore: 6,
    weightAdjustments: [
      { factorCategory: "backlink", adjustment: 3, reason: "Link quality assessment improved" },
      { factorCategory: "off_site_spam", adjustment: 4, reason: "SpamBrain link detection enhanced" },
    ],
  },
  {
    id: "core-aug-2024",
    name: "August 2024 Core Update",
    date: "2024-08-15",
    severity: "major",
    category: "core",
    description: "Broad core update emphasizing content quality, expertise signals, and user experience metrics.",
    affectedFactors: ["content_quality", "expertise", "core_web_vitals", "mobile_experience"],
    impactAreas: ["Desktop-first sites", "slow-loading pages", "thin content"],
    recommendedActions: [
      "Optimize Core Web Vitals",
      "Improve mobile experience",
      "Add expertise signals to content",
    ],
    source: "Google Search Central Blog",
    confirmed: true,
    volatilityScore: 7,
    weightAdjustments: [
      { factorCategory: "page_level", adjustment: 2, reason: "Core Web Vitals importance increased" },
      { factorCategory: "site_level", adjustment: 2, reason: "Site-wide quality assessment refined" },
    ],
  },
  {
    id: "core-jan-2026",
    name: "January 2026 Core Update",
    date: "2026-01-20",
    severity: "major",
    category: "core",
    description: "First core update of 2026 with enhanced AI content evaluation, deeper E-E-A-T analysis, and improved understanding of user intent across languages.",
    affectedFactors: ["content_quality", "eeat", "multilingual", "ai_content", "user_intent"],
    impactAreas: ["AI content sites", "multilingual SEO", "YMYL niches", "affiliate sites"],
    recommendedActions: [
      "Strengthen E-E-A-T signals with real expertise",
      "Improve multilingual content quality",
      "Add unique value beyond AI-generated baseline",
      "Focus on satisfying user intent completely",
    ],
    source: "Google Search Central Blog",
    confirmed: true,
    volatilityScore: 9,
    weightAdjustments: [
      { factorCategory: "page_level", adjustment: 4, reason: "AI content evaluation significantly enhanced" },
      { factorCategory: "special_algorithm", adjustment: 5, reason: "E-E-A-T and intent matching heavily weighted" },
      { factorCategory: "user_interaction", adjustment: 3, reason: "User satisfaction signals critical" },
    ],
  },
  {
    id: "spam-feb-2026",
    name: "February 2026 Spam Update",
    date: "2026-02-14",
    severity: "significant",
    category: "spam",
    description: "Aggressive spam update targeting parasite SEO on high-authority platforms, expired domain abuse, and scaled content distribution.",
    affectedFactors: ["parasite_seo", "expired_domains", "scaled_content", "link_schemes"],
    impactAreas: ["Parasite SEO on Web 2.0", "expired domain networks", "mass content distribution", "cloaked pages"],
    recommendedActions: [
      "Increase content uniqueness across platforms",
      "Vary posting patterns and timing",
      "Use diverse anchor text strategies",
      "Implement better cloaking evasion",
      "Rotate platforms more frequently",
    ],
    source: "Google Search Central Blog",
    confirmed: true,
    volatilityScore: 8,
    weightAdjustments: [
      { factorCategory: "on_site_spam", adjustment: 5, reason: "Parasite SEO detection dramatically improved" },
      { factorCategory: "off_site_spam", adjustment: 4, reason: "Scaled content abuse detection enhanced" },
      { factorCategory: "backlink", adjustment: 3, reason: "Unnatural link pattern detection improved" },
    ],
  },
];

// ═══════════════════════════════════════════════
//  IN-MEMORY STATE
// ═══════════════════════════════════════════════

const volatilityHistory: VolatilityReading[] = [];
const detectedUpdates: AlgorithmUpdate[] = [...KNOWN_UPDATES];
let lastCheckTimestamp = 0;
const alerts: string[] = [];

// ═══════════════════════════════════════════════
//  AI-POWERED UPDATE DETECTION
// ═══════════════════════════════════════════════

/**
 * Use AI to check for new algorithm updates
 * Analyzes current SEO landscape and detects potential updates
 */
export async function checkForUpdates(): Promise<{
  newUpdates: AlgorithmUpdate[];
  volatility: number;
  analysis: string;
}> {
  const today = new Date().toISOString().split("T")[0];
  const knownUpdateNames = detectedUpdates.map(u => u.name);

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a Google Algorithm Update expert. Today is ${today}. Analyze the current SEO landscape and identify any recent or ongoing Google algorithm updates.

Known updates already in our database:
${knownUpdateNames.join(", ")}

Based on your knowledge of Google's update patterns and the current date, identify:
1. Any NEW algorithm updates that may have occurred recently
2. Current SERP volatility level (1-10)
3. Impact analysis for SEO practitioners

Be realistic and accurate. Only report updates you're confident about.`,
      },
      {
        role: "user",
        content: `Check for any new Google algorithm updates as of ${today}. Analyze current SERP volatility and provide actionable insights.

Return JSON with:
- newUpdates: array of new updates (empty if none detected)
- volatilityScore: current volatility 1-10
- analysis: brief analysis of current algorithm state
- affectedNiches: which niches are most affected right now`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "algorithm_check",
        strict: true,
        schema: {
          type: "object",
          properties: {
            newUpdates: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  date: { type: "string" },
                  severity: { type: "string" },
                  category: { type: "string" },
                  description: { type: "string" },
                  affectedFactors: { type: "array", items: { type: "string" } },
                  impactAreas: { type: "array", items: { type: "string" } },
                  recommendedActions: { type: "array", items: { type: "string" } },
                  volatilityScore: { type: "number" },
                  confirmed: { type: "boolean" },
                },
                required: ["name", "date", "severity", "category", "description", "affectedFactors", "impactAreas", "recommendedActions", "volatilityScore", "confirmed"],
                additionalProperties: false,
              },
            },
            volatilityScore: { type: "number" },
            analysis: { type: "string" },
            affectedNiches: { type: "array", items: { type: "string" } },
          },
          required: ["newUpdates", "volatilityScore", "analysis", "affectedNiches"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    return { newUpdates: [], volatility: 5, analysis: "Unable to check for updates" };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  } catch {
    return { newUpdates: [], volatility: 5, analysis: "Failed to parse update check response" };
  }

  // Record volatility
  volatilityHistory.push({
    timestamp: Date.now(),
    score: parsed.volatilityScore || 5,
    source: "ai_analysis",
    categories: {},
  });

  // Process new updates
  const newUpdates: AlgorithmUpdate[] = [];
  for (const u of (parsed.newUpdates || [])) {
    if (knownUpdateNames.includes(u.name)) continue;

    const validSeverities: UpdateSeverity[] = ["major", "significant", "minor", "unconfirmed"];
    const validCategories: UpdateCategory[] = ["core", "spam", "helpful_content", "link", "local", "product_reviews", "page_experience", "other"];

    const update: AlgorithmUpdate = {
      id: `detected-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: u.name,
      date: u.date || today,
      severity: validSeverities.includes(u.severity) ? u.severity : "unconfirmed",
      category: validCategories.includes(u.category) ? u.category : "other",
      description: u.description,
      affectedFactors: u.affectedFactors || [],
      impactAreas: u.impactAreas || [],
      recommendedActions: u.recommendedActions || [],
      source: "AI Detection",
      confirmed: u.confirmed || false,
      volatilityScore: u.volatilityScore || 5,
      weightAdjustments: [],
    };

    detectedUpdates.push(update);
    newUpdates.push(update);
  }

  lastCheckTimestamp = Date.now();

  // Alert if high volatility or new major update
  if (parsed.volatilityScore >= 7 || newUpdates.some(u => u.severity === "major")) {
    const alertMsg = newUpdates.length > 0
      ? `New algorithm update detected: ${newUpdates.map(u => u.name).join(", ")}`
      : `High SERP volatility detected: ${parsed.volatilityScore}/10`;
    alerts.push(alertMsg);

    await sendTelegramNotification({
      type: "info",
      targetUrl: "https://search.google.com",
      details: `🔔 Algorithm Update Alert\n${alertMsg}\n\nVolatility: ${parsed.volatilityScore}/10\n\n${parsed.analysis}`,
    }).catch(() => {});
  }

  return {
    newUpdates,
    volatility: parsed.volatilityScore || 5,
    analysis: parsed.analysis || "No significant changes detected",
  };
}

// ═══════════════════════════════════════════════
//  IMPACT ANALYSIS
// ═══════════════════════════════════════════════

/**
 * Analyze how a specific update affects our SEO strategy
 */
export async function analyzeUpdateImpact(updateId: string): Promise<{
  update: AlgorithmUpdate | null;
  riskLevel: "critical" | "high" | "medium" | "low";
  affectedStrategies: string[];
  adaptationPlan: string[];
  estimatedRecoveryDays: number;
}> {
  const update = detectedUpdates.find(u => u.id === updateId);
  if (!update) {
    return { update: null, riskLevel: "low", affectedStrategies: [], adaptationPlan: [], estimatedRecoveryDays: 0 };
  }

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a Google Algorithm expert analyzing the impact of algorithm updates on SEO strategies, particularly for gambling/casino niche parasite SEO campaigns.`,
      },
      {
        role: "user",
        content: `Analyze the impact of this algorithm update on our SEO strategy:

Update: ${update.name}
Date: ${update.date}
Severity: ${update.severity}
Category: ${update.category}
Description: ${update.description}
Affected Factors: ${update.affectedFactors.join(", ")}

Our strategies include:
- Parasite SEO on high-DA platforms (Telegraph, Medium, WordPress.com, etc.)
- PBN link building
- Content distribution across 50+ platforms
- Schema markup injection
- Query parameter manipulation
- Expired domain exploitation

Provide:
1. Risk level (critical/high/medium/low)
2. Which of our strategies are affected
3. Specific adaptation plan
4. Estimated recovery time in days

Return as JSON.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "impact_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            riskLevel: { type: "string" },
            affectedStrategies: { type: "array", items: { type: "string" } },
            adaptationPlan: { type: "array", items: { type: "string" } },
            estimatedRecoveryDays: { type: "number" },
          },
          required: ["riskLevel", "affectedStrategies", "adaptationPlan", "estimatedRecoveryDays"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  let parsed: any = { riskLevel: "medium", affectedStrategies: [], adaptationPlan: [], estimatedRecoveryDays: 14 };
  try {
    if (content) parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  } catch {}

  const validRiskLevels = ["critical", "high", "medium", "low"] as const;
  const riskLevel = validRiskLevels.includes(parsed.riskLevel) ? parsed.riskLevel as typeof validRiskLevels[number] : "medium";

  return {
    update,
    riskLevel,
    affectedStrategies: parsed.affectedStrategies || [],
    adaptationPlan: parsed.adaptationPlan || [],
    estimatedRecoveryDays: parsed.estimatedRecoveryDays || 14,
  };
}

// ═══════════════════════════════════════════════
//  GETTERS
// ═══════════════════════════════════════════════

export function getMonitorStatus(): MonitorStatus {
  const recent = detectedUpdates
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const recentVolatility = volatilityHistory.slice(-10);
  const currentVolatility = recentVolatility.length > 0
    ? recentVolatility.reduce((sum, v) => sum + v.score, 0) / recentVolatility.length
    : 5;

  let trend: "rising" | "stable" | "falling" = "stable";
  if (recentVolatility.length >= 3) {
    const recent3 = recentVolatility.slice(-3).reduce((s, v) => s + v.score, 0) / 3;
    const older3 = recentVolatility.slice(-6, -3).reduce((s, v) => s + v.score, 0) / Math.max(1, recentVolatility.slice(-6, -3).length);
    if (recent3 > older3 + 1) trend = "rising";
    else if (recent3 < older3 - 1) trend = "falling";
  }

  return {
    lastCheck: lastCheckTimestamp,
    totalUpdates: detectedUpdates.length,
    recentUpdates: recent,
    currentVolatility: Math.round(currentVolatility * 10) / 10,
    volatilityTrend: trend,
    activeAlerts: alerts.slice(-5),
  };
}

export function getAllUpdates(): AlgorithmUpdate[] {
  return detectedUpdates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getUpdateById(id: string): AlgorithmUpdate | undefined {
  return detectedUpdates.find(u => u.id === id);
}

export function getUpdatesByCategory(category: UpdateCategory): AlgorithmUpdate[] {
  return detectedUpdates.filter(u => u.category === category).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getVolatilityHistory(): VolatilityReading[] {
  return volatilityHistory;
}

export function getUpdateTimeline(): Array<{ date: string; name: string; severity: UpdateSeverity; category: UpdateCategory }> {
  return detectedUpdates
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(u => ({ date: u.date, name: u.name, severity: u.severity, category: u.category }));
}
