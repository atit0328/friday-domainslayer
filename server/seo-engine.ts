/**
 * Enterprise SEO Automation Engine
 * 
 * AI-powered full-cycle SEO automation:
 * 1. Domain Analysis — audit current state, BL profile, content
 * 2. Strategy Generation — AI creates grey/black hat SEO plan
 * 3. Keyword Research — find target keywords with volume/difficulty
 * 4. On-Page Audit — title, meta, schema, internal linking recommendations
 * 5. Backlink Strategy — PBN, guest post, web 2.0, tiered links
 * 6. Content Generation — AI writes SEO-optimized content
 * 7. Link Building — execute BL building via PBN network
 * 8. Monitoring — track ranks, BL, adjust strategy
 * 9. Algorithm Analysis — detect Google/AI Search patterns
 */

import { invokeLLM } from "./_core/llm";
import { scrapeWebsite, extractKeywordsFromContent, type ScrapedContent } from "./web-scraper";

// ═══ Types ═══

export interface DomainAnalysis {
  domain: string;
  currentState: {
    estimatedDA: number;
    estimatedDR: number;
    estimatedSpamScore: number;
    estimatedBacklinks: number;
    estimatedReferringDomains: number;
    estimatedTrustFlow: number;
    estimatedCitationFlow: number;
    estimatedOrganicTraffic: number;
    estimatedOrganicKeywords: number;
    domainAge: string;
    tld: string;
    isIndexed: boolean;
  };
  contentAudit: {
    hasContent: boolean;
    contentQuality: "none" | "thin" | "moderate" | "good" | "excellent";
    estimatedPages: number;
    topicRelevance: number; // 0-100
  };
  backlinkProfile: {
    quality: "toxic" | "poor" | "mixed" | "clean" | "strong";
    dofollowRatio: number; // 0-100
    anchorTextDistribution: { type: string; percentage: number }[];
    riskFactors: string[];
  };
  competitorInsights: {
    nicheCompetition: "low" | "medium" | "high" | "extreme";
    topCompetitors: string[];
    avgCompetitorDA: number;
  };
  overallHealth: number; // 0-100
  riskLevel: "low" | "medium" | "high" | "critical";
  aiSummary: string;
}

export interface SEOStrategy {
  phases: {
    phase: number;
    name: string;
    description: string;
    actions: string[];
    estimatedDuration: string;
    priority: "critical" | "high" | "medium" | "low";
  }[];
  backlinkPlan: {
    tier1: { type: string; count: number; targetDA: number }[];
    tier2: { type: string; count: number }[];
    monthlyTarget: number;
  };
  contentPlan: {
    articles: { title: string; targetKeyword: string; wordCount: number }[];
    frequency: string;
  };
  riskAssessment: {
    penaltyRisk: "low" | "medium" | "high";
    detectionRisk: "low" | "medium" | "high";
    mitigationSteps: string[];
  };
  expectedTimeline: {
    month1: string;
    month3: string;
    month6: string;
    month12: string;
  };
  aiRecommendation: string;
}

export interface KeywordResearch {
  primaryKeywords: {
    keyword: string;
    searchVolume: number;
    difficulty: number;
    cpc: number;
    intent: "informational" | "commercial" | "transactional" | "navigational";
    priority: number;
  }[];
  longTailKeywords: {
    keyword: string;
    searchVolume: number;
    difficulty: number;
    parentKeyword: string;
  }[];
  contentGaps: string[];
  aiInsights: string;
}

export interface RankAnalysis {
  overallTrend: "improving" | "stable" | "declining" | "critical";
  keywordPerformance: {
    keyword: string;
    currentPosition: number | null;
    previousPosition: number | null;
    change: number;
    trend: "rising" | "stable" | "falling" | "new" | "lost";
    insight: string;
  }[];
  algorithmImpact: {
    recentUpdates: string[];
    impactAssessment: string;
    recommendations: string[];
  };
  competitorMovements: string[];
  aiSummary: string;
  nextActions: string[];
}

export interface BacklinkAnalysis {
  profileHealth: number; // 0-100
  trend: "growing" | "stable" | "declining";
  newBacklinks: number;
  lostBacklinks: number;
  toxicLinks: number;
  anchorTextDistribution: { anchor: string; count: number; percentage: number }[];
  typeDistribution: { type: string; count: number; percentage: number }[];
  recommendations: string[];
  aiSummary: string;
}

// ═══ Core Functions ═══

/**
 * Full domain analysis — scrapes the actual website first, then feeds real data to AI
 */
export async function analyzeDomain(domain: string, niche?: string): Promise<DomainAnalysis & { scrapedContent?: ScrapedContent; extractedKeywords?: string[] }> {
  // Step 1: Scrape the actual website
  let scraped: ScrapedContent | null = null;
  let extractedKeywords: string[] = [];
  try {
    scraped = await scrapeWebsite(domain);
    extractedKeywords = extractKeywordsFromContent(scraped);
  } catch (err) {
    console.warn(`[analyzeDomain] Scraping failed for ${domain}:`, err);
  }

  // Build context from scraped data
  const scrapedContext = scraped && scraped.statusCode > 0 ? `

=== REAL SCRAPED DATA FROM THE WEBSITE ===
URL: ${scraped.url}
Status Code: ${scraped.statusCode}
Load Time: ${scraped.loadTimeMs}ms
SSL: ${scraped.hasSSL}
Server: ${scraped.serverHeader}
Detected Language: ${scraped.detectedLanguage}

Title: ${scraped.title}
Meta Description: ${scraped.metaDescription}
Meta Keywords: ${scraped.metaKeywords.join(", ") || "none"}
Canonical: ${scraped.canonical}

H1 Headings: ${scraped.headings.h1.join(" | ") || "none"}
H2 Headings: ${scraped.headings.h2.slice(0, 10).join(" | ") || "none"}
H3 Headings: ${scraped.headings.h3.slice(0, 10).join(" | ") || "none"}

Bold/Strong Text: ${[...scraped.boldTexts, ...scraped.strongTexts].slice(0, 20).join(" | ") || "none"}

Links: ${scraped.links.internal} internal, ${scraped.links.external} external, ${scraped.links.nofollow} nofollow
Images: ${scraped.images.total} total (${scraped.images.withAlt} with alt, ${scraped.images.withoutAlt} without alt)
Word Count: ${scraped.wordCount}

Extracted Keywords from Content: ${extractedKeywords.slice(0, 20).join(", ") || "none"}

First 1500 chars of visible text:
${scraped.textContent.slice(0, 1500)}
=== END SCRAPED DATA ===` : "\n\n[Note: Could not scrape the website directly. Use your best knowledge to estimate.]";

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert SEO analyst specializing in grey hat and black hat SEO strategies.
You analyze domains for their SEO potential, backlink profiles, and ranking opportunities.
You must return a JSON object matching the exact schema provided.

IMPORTANT RULES:
1. Use the REAL SCRAPED DATA provided to make accurate assessments
2. If the website content is in Thai or other non-English language, reflect that in your analysis
3. Base your metrics estimates on the actual content quality, structure, and technical setup you see
4. Be realistic — use scraped data signals (word count, heading structure, link count, server type) to estimate DA/DR/BL
5. For gambling/casino sites, expect higher spam scores and specific backlink patterns
6. ALWAYS write aiSummary in THAI language (ภาษาไทย), keep it SHORT (2-3 sentences max), focus on key findings only
7. Example aiSummary format: "โดเมนนี้เป็นเว็บพนันภาษาไทย DA ต่ำ Spam Score สูง ความเสี่ยงสูงจากการใช้ black hat SEO"`
      },
      {
        role: "user",
        content: `Analyze this domain for SEO potential: "${domain}"
${niche ? `Niche/Industry: ${niche}` : ""}${scrapedContext}

Based on the scraped data above, provide a comprehensive analysis including:
1. Current estimated SEO metrics (DA, DR, Spam Score, Backlinks, etc.) — use the scraped signals to estimate
2. Content audit assessment — based on actual content found
3. Backlink profile quality estimation
4. Competitor landscape in this niche
5. Overall health score and risk level

Return ONLY valid JSON matching this schema:
{
  "domain": "string",
  "currentState": {
    "estimatedDA": number (0-100),
    "estimatedDR": number (0-100),
    "estimatedSpamScore": number (0-100),
    "estimatedBacklinks": number,
    "estimatedReferringDomains": number,
    "estimatedTrustFlow": number (0-100),
    "estimatedCitationFlow": number (0-100),
    "estimatedOrganicTraffic": number,
    "estimatedOrganicKeywords": number,
    "domainAge": "string",
    "tld": "string",
    "isIndexed": boolean
  },
  "contentAudit": {
    "hasContent": boolean,
    "contentQuality": "none"|"thin"|"moderate"|"good"|"excellent",
    "estimatedPages": number,
    "topicRelevance": number (0-100)
  },
  "backlinkProfile": {
    "quality": "toxic"|"poor"|"mixed"|"clean"|"strong",
    "dofollowRatio": number (0-100),
    "anchorTextDistribution": [{"type": "string", "percentage": number}],
    "riskFactors": ["string"]
  },
  "competitorInsights": {
    "nicheCompetition": "low"|"medium"|"high"|"extreme",
    "topCompetitors": ["string"],
    "avgCompetitorDA": number
  },
  "overallHealth": number (0-100),
  "riskLevel": "low"|"medium"|"high"|"critical",
  "aiSummary": "string — ตอบเป็นภาษาไทย สั้นๆ 2-3 ประโยค เน้นจุดสำคัญ"
}
`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "domain_analysis",        strict: true,
        schema: {
          type: "object",
          properties: {
            domain: { type: "string" },
            currentState: {
              type: "object",
              properties: {
                estimatedDA: { type: "number" },
                estimatedDR: { type: "number" },
                estimatedSpamScore: { type: "number" },
                estimatedBacklinks: { type: "number" },
                estimatedReferringDomains: { type: "number" },
                estimatedTrustFlow: { type: "number" },
                estimatedCitationFlow: { type: "number" },
                estimatedOrganicTraffic: { type: "number" },
                estimatedOrganicKeywords: { type: "number" },
                domainAge: { type: "string" },
                tld: { type: "string" },
                isIndexed: { type: "boolean" },
              },
              required: ["estimatedDA", "estimatedDR", "estimatedSpamScore", "estimatedBacklinks", "estimatedReferringDomains", "estimatedTrustFlow", "estimatedCitationFlow", "estimatedOrganicTraffic", "estimatedOrganicKeywords", "domainAge", "tld", "isIndexed"],
              additionalProperties: false,
            },
            contentAudit: {
              type: "object",
              properties: {
                hasContent: { type: "boolean" },
                contentQuality: { type: "string", enum: ["none", "thin", "moderate", "good", "excellent"] },
                estimatedPages: { type: "number" },
                topicRelevance: { type: "number" },
              },
              required: ["hasContent", "contentQuality", "estimatedPages", "topicRelevance"],
              additionalProperties: false,
            },
            backlinkProfile: {
              type: "object",
              properties: {
                quality: { type: "string", enum: ["toxic", "poor", "mixed", "clean", "strong"] },
                dofollowRatio: { type: "number" },
                anchorTextDistribution: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { type: { type: "string" }, percentage: { type: "number" } },
                    required: ["type", "percentage"],
                    additionalProperties: false,
                  },
                },
                riskFactors: { type: "array", items: { type: "string" } },
              },
              required: ["quality", "dofollowRatio", "anchorTextDistribution", "riskFactors"],
              additionalProperties: false,
            },
            competitorInsights: {
              type: "object",
              properties: {
                nicheCompetition: { type: "string", enum: ["low", "medium", "high", "extreme"] },
                topCompetitors: { type: "array", items: { type: "string" } },
                avgCompetitorDA: { type: "number" },
              },
              required: ["nicheCompetition", "topCompetitors", "avgCompetitorDA"],
              additionalProperties: false,
            },
            overallHealth: { type: "number" },
            riskLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
            aiSummary: { type: "string" },
          },
          required: ["domain", "currentState", "contentAudit", "backlinkProfile", "competitorInsights", "overallHealth", "riskLevel", "aiSummary"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const analysis = JSON.parse(text) as DomainAnalysis;
  return {
    ...analysis,
    scrapedContent: scraped || undefined,
    extractedKeywords: extractedKeywords.length > 0 ? extractedKeywords : undefined,
  };
}

/**
 * Generate SEO strategy based on domain analysis
 */
export async function generateStrategy(
  domain: string,
  analysis: DomainAnalysis,
  strategy: string,
  aggressiveness: number,
  niche?: string,
): Promise<SEOStrategy> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a black hat/grey hat SEO strategist. You create aggressive SEO campaigns 
that push boundaries while managing risk. You specialize in PBN networks, tiered link building, 
parasite SEO, and AI-generated content strategies. You understand Google's algorithm deeply 
and know how to exploit weaknesses while minimizing detection risk.
Strategy type: ${strategy} | Aggressiveness: ${aggressiveness}/10
Return ONLY valid JSON.`
      },
      {
        role: "user",
        content: `Create a comprehensive SEO strategy for: "${domain}"
${niche ? `Niche: ${niche}` : ""}
Current metrics: DA=${analysis.currentState.estimatedDA}, DR=${analysis.currentState.estimatedDR}, BL=${analysis.currentState.estimatedBacklinks}
Health: ${analysis.overallHealth}/100, Risk: ${analysis.riskLevel}
Backlink quality: ${analysis.backlinkProfile.quality}
Competition: ${analysis.competitorInsights.nicheCompetition}

Create a phased strategy with:
1. Detailed phases (6-10 phases) with specific actions
2. Tiered backlink building plan (Tier 1 + Tier 2)
3. Content creation plan
4. Risk assessment and mitigation
5. Expected timeline milestones

Return JSON:
{
  "phases": [{"phase": number, "name": "string", "description": "string", "actions": ["string"], "estimatedDuration": "string", "priority": "critical"|"high"|"medium"|"low"}],
  "backlinkPlan": {
    "tier1": [{"type": "pbn"|"guest_post"|"web2"|"edu"|"gov"|"press_release", "count": number, "targetDA": number}],
    "tier2": [{"type": "string", "count": number}],
    "monthlyTarget": number
  },
  "contentPlan": {
    "articles": [{"title": "string", "targetKeyword": "string", "wordCount": number}],
    "frequency": "string"
  },
  "riskAssessment": {
    "penaltyRisk": "low"|"medium"|"high",
    "detectionRisk": "low"|"medium"|"high",
    "mitigationSteps": ["string"]
  },
  "expectedTimeline": {
    "month1": "string",
    "month3": "string",
    "month6": "string",
    "month12": "string"
  },
  "aiRecommendation": "string — ตอบเป็นภาษาไทย สั้นๆ 2-3 ประโยค"
}`
      }
    ],
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  // Parse, handling potential markdown code blocks
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned) as SEOStrategy;
  } catch {
    const { parseLLMJson } = await import("./llm-json");
    return parseLLMJson<SEOStrategy>(cleaned);
  }
}

/**
 * AI Keyword Research — scrapes website first for real content-based keyword research
 */
export async function researchKeywords(
  domain: string,
  niche: string,
  existingKeywords?: string[],
): Promise<KeywordResearch> {
  // Step 1: Scrape website for real content
  let scraped: ScrapedContent | null = null;
  let contentKeywords: string[] = [];
  try {
    scraped = await scrapeWebsite(domain);
    contentKeywords = extractKeywordsFromContent(scraped);
  } catch (err) {
    console.warn(`[researchKeywords] Scraping failed for ${domain}:`, err);
  }

  const scrapedContext = scraped && scraped.statusCode > 0 ? `

=== REAL CONTENT FROM WEBSITE ===
Detected Language: ${scraped.detectedLanguage}
Title: ${scraped.title}
Meta Description: ${scraped.metaDescription}
Meta Keywords: ${scraped.metaKeywords.join(", ") || "none"}
H1: ${scraped.headings.h1.join(" | ") || "none"}
H2: ${scraped.headings.h2.slice(0, 10).join(" | ") || "none"}
H3: ${scraped.headings.h3.slice(0, 10).join(" | ") || "none"}
Bold/Strong: ${[...scraped.boldTexts, ...scraped.strongTexts].slice(0, 15).join(" | ") || "none"}
Extracted Keywords: ${contentKeywords.slice(0, 20).join(", ") || "none"}
First 1000 chars: ${scraped.textContent.slice(0, 1000)}
=== END ===` : "";

  const languageHint = scraped?.detectedLanguage === "th" 
    ? "\n\nIMPORTANT: This website is in THAI language. You MUST include Thai keywords (ภาษาไทย) in your research. Mix Thai and English keywords based on what Thai users actually search for."
    : scraped?.detectedLanguage && scraped.detectedLanguage !== "en"
    ? `\n\nIMPORTANT: This website is in ${scraped.detectedLanguage} language. Include keywords in that language as well as English.`
    : "";

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert SEO keyword researcher specializing in finding profitable, 
rankable keywords. You understand search intent, keyword difficulty, and how to find 
low-competition gems that grey/black hat SEO can exploit quickly.

IMPORTANT RULES:
1. Use the REAL SCRAPED CONTENT to identify actual keywords the site targets
2. Include keywords in the SAME LANGUAGE as the website content
3. For Thai websites, include Thai keywords (e.g., สล็อต, คาสิโน, เกมออนไลน์)
4. Mix branded keywords (domain name variations) with generic niche keywords
5. Include keywords found in H1, H2, H3, bold text, and meta tags
Return ONLY valid JSON.`
      },
      {
        role: "user",
        content: `Research keywords for: "${domain}" in the "${niche}" niche.${languageHint}
${existingKeywords?.length ? `Already targeting: ${existingKeywords.join(", ")}` : ""}${scrapedContext}

Based on the actual website content above, find:
1. 10-15 primary keywords (include keywords in the website's language + English)
2. 15-20 long-tail keywords (low difficulty, quick wins, in the website's language)
3. Content gaps and opportunities
4. Strategic insights

Return JSON:
{
  "primaryKeywords": [{"keyword": "string", "searchVolume": number, "difficulty": number (0-100), "cpc": number, "intent": "informational"|"commercial"|"transactional"|"navigational", "priority": number (1-10)}],
  "longTailKeywords": [{"keyword": "string", "searchVolume": number, "difficulty": number, "parentKeyword": "string"}],
  "contentGaps": ["string"],
  "aiInsights": "string — ตอบเป็นภาษาไทย สั้นๆ 2-3 ประโยค"
}`
      }
    ],
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned) as KeywordResearch;
  } catch {
    const { parseLLMJson } = await import("./llm-json");
    return parseLLMJson<KeywordResearch>(cleaned);
  }
}

/**
 * AI Rank Analysis — analyze ranking trends and algorithm impact
 */
export async function analyzeRankings(
  domain: string,
  rankings: { keyword: string; position: number | null; previousPosition: number | null }[],
  recentAlgoUpdates?: string,
): Promise<RankAnalysis> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a Google algorithm expert and rank analysis specialist. You understand 
core updates, spam updates, helpful content updates, and how they affect grey/black hat SEO.
You analyze ranking patterns to detect algorithm impacts and recommend counter-strategies.
Return ONLY valid JSON.`
      },
      {
        role: "user",
        content: `Analyze ranking performance for "${domain}":

Current rankings:
${rankings.map(r => `- "${r.keyword}": position ${r.position ?? "not ranked"} (was: ${r.previousPosition ?? "new"})`).join("\n")}

${recentAlgoUpdates ? `Recent algorithm updates: ${recentAlgoUpdates}` : ""}

Analyze:
1. Overall trend direction
2. Per-keyword performance and insights
3. Algorithm impact assessment
4. Competitor movements
5. Recommended next actions

Return JSON:
{
  "overallTrend": "improving"|"stable"|"declining"|"critical",
  "keywordPerformance": [{"keyword": "string", "currentPosition": number|null, "previousPosition": number|null, "change": number, "trend": "rising"|"stable"|"falling"|"new"|"lost", "insight": "string"}],
  "algorithmImpact": {
    "recentUpdates": ["string"],
    "impactAssessment": "string",
    "recommendations": ["string"]
  },
  "competitorMovements": ["string"],
  "aiSummary": "string — ตอบเป็นภาษาไทย สั้นๆ 2-3 ประโยค",
  "nextActions": ["string"]
}`
      }
    ],
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned) as RankAnalysis;
  } catch {
    const { parseLLMJson } = await import("./llm-json");
    return parseLLMJson<RankAnalysis>(cleaned);
  }
}

/**
 * AI Backlink Profile Analysis
 */
export async function analyzeBacklinks(
  domain: string,
  backlinks: { sourceDomain: string; sourceDA?: number; anchorText?: string; linkType: string; sourceType: string; status: string }[],
): Promise<BacklinkAnalysis> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a backlink analysis expert. You evaluate link profiles for quality, 
toxicity, and growth patterns. You specialize in grey/black hat link building and understand 
how to maintain a "natural-looking" profile while using PBN and other aggressive techniques.
Return ONLY valid JSON.`
      },
      {
        role: "user",
        content: `Analyze backlink profile for "${domain}":

Backlinks (${backlinks.length} total):
${backlinks.slice(0, 50).map(bl => `- ${bl.sourceDomain} (DA:${bl.sourceDA || "?"}) → anchor:"${bl.anchorText || "?"}" [${bl.linkType}] [${bl.sourceType}] [${bl.status}]`).join("\n")}
${backlinks.length > 50 ? `... and ${backlinks.length - 50} more` : ""}

Analyze:
1. Profile health score
2. Growth trend
3. Toxic link count
4. Anchor text distribution
5. Link type distribution
6. Recommendations

Return JSON:
{
  "profileHealth": number (0-100),
  "trend": "growing"|"stable"|"declining",
  "newBacklinks": number,
  "lostBacklinks": number,
  "toxicLinks": number,
  "anchorTextDistribution": [{"anchor": "string", "count": number, "percentage": number}],
  "typeDistribution": [{"type": "string", "count": number, "percentage": number}],
  "recommendations": ["string"],
  "aiSummary": "string — ตอบเป็นภาษาไทย สั้นๆ 2-3 ประโยค"
}`
      }
    ],
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned) as BacklinkAnalysis;
  } catch {
    const { parseLLMJson } = await import("./llm-json");
    return parseLLMJson<BacklinkAnalysis>(cleaned);
  }
}

/**
 * Generate AI content for SEO
 */
export async function generateSEOContent(
  keyword: string,
  domain: string,
  niche: string,
  wordCount: number = 1500,
): Promise<{ title: string; content: string; metaDescription: string; targetKeyword: string }> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert SEO content writer. You create high-quality, keyword-optimized 
content that ranks well in Google. You understand E-E-A-T, semantic SEO, and how to naturally 
incorporate keywords while maintaining readability. Write content that appears human-written 
and authoritative. Include proper heading structure (H2, H3), internal linking suggestions, 
and schema markup recommendations.`
      },
      {
        role: "user",
        content: `Write an SEO-optimized article for "${domain}" targeting the keyword "${keyword}" in the "${niche}" niche.

Requirements:
- Approximately ${wordCount} words
- Natural keyword placement (1-2% density)
- Proper H2/H3 heading structure
- Include LSI keywords naturally
- Write in an authoritative, expert tone
- Include a compelling meta description (150-160 chars)

Return JSON:
{
  "title": "string (SEO-optimized title with keyword)",
  "content": "string (full article in markdown format)",
  "metaDescription": "string (150-160 chars)",
  "targetKeyword": "string"
}`
      }
    ],
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  
  // Use robust parser with fallback
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    // Fallback: use llmStructuredContent which uses response_format
    const { llmStructuredContent } = await import("./llm-json");
    return llmStructuredContent(keyword, domain, niche, wordCount);
  }
}

/**
 * AI Algorithm Intelligence — analyze recent Google updates
 */
export async function analyzeAlgorithm(
  domains: { domain: string; rankChanges: number; backlinkChanges: number }[],
): Promise<{
  detectedPatterns: string[];
  updateType: string;
  impactLevel: "none" | "minor" | "moderate" | "major" | "critical";
  affectedFactors: string[];
  recommendations: string[];
  aiAnalysis: string;
}> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a Google algorithm analysis expert. You detect patterns in ranking changes 
across multiple domains to identify algorithm updates and their characteristics. You understand 
core updates, spam updates, helpful content updates, link spam updates, and AI-related changes.
You provide actionable intelligence for grey/black hat SEO practitioners.
Return ONLY valid JSON.`
      },
      {
        role: "user",
        content: `Analyze potential algorithm changes based on these domain metrics:

${domains.map(d => `- ${d.domain}: rank change=${d.rankChanges > 0 ? "+" : ""}${d.rankChanges}, BL change=${d.backlinkChanges > 0 ? "+" : ""}${d.backlinkChanges}`).join("\n")}

Detect:
1. Algorithm update patterns
2. What type of update (core, spam, HCU, link spam, etc.)
3. Impact level
4. Affected ranking factors
5. Recommended actions

Return JSON:
{
  "detectedPatterns": ["string"],
  "updateType": "string",
  "impactLevel": "none"|"minor"|"moderate"|"major"|"critical",
  "affectedFactors": ["string"],
  "recommendations": ["string"],
  "aiAnalysis": "string — ตอบเป็นภาษาไทย สั้นๆ 2-3 ประโยค"
}`
      }
    ],
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  
  // Use robust parser
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    const { parseLLMJson } = await import("./llm-json");
    return parseLLMJson(text);
  }
}
