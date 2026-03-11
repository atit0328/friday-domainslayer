/**
 * SERP Feature Hijacker Engine
 * ═══════════════════════════════════════════════════════════════
 * Detects and hijacks Google SERP features:
 * - Featured Snippets (paragraph, list, table)
 * - People Also Ask (PAA) boxes
 * - Knowledge Panels
 * - Video Carousels
 * - Image Packs
 * - Rich Results (FAQ, HowTo, Review)
 * - Sitelinks
 * - AI Overviews
 *
 * Auto-optimizes content to win each feature type,
 * then deploys optimized content to parasite platforms.
 * ═══════════════════════════════════════════════════════════════
 */

import { invokeLLM } from "./_core/llm";
import { analyzeSERPFeatures, type SERPFeature } from "./serp-tracker";
import { generateParasiteContent, deployTelegraphBlitz } from "./parasite-seo-blitz";
import {
  generateFAQSchema,
  generateArticleSchema,
  schemasToHtml,
  type SchemaMarkup,
} from "./schema-markup-injector";
import { sendTelegramNotification } from "./telegram-notifier";

// ═══════════════════════════════════════════════
//  Types & Interfaces
// ═══════════════════════════════════════════════

export type SERPFeatureType =
  | "featured_snippet"
  | "people_also_ask"
  | "knowledge_panel"
  | "video_carousel"
  | "image_pack"
  | "local_pack"
  | "shopping"
  | "news"
  | "ai_overview"
  | "sitelinks";

export type SnippetFormat = "paragraph" | "list" | "table";

export interface FeatureOpportunity {
  keyword: string;
  featureType: SERPFeatureType;
  currentlyOwned: boolean;
  position: number;
  difficulty: "easy" | "medium" | "hard";
  strategy: string;
  optimizedContent?: string;
  deployedUrl?: string;
  status: "detected" | "optimizing" | "deployed" | "won" | "lost";
  detectedAt: number;
  lastCheckedAt: number;
}

export interface FeaturedSnippetContent {
  keyword: string;
  format: SnippetFormat;
  title: string;
  content: string; // formatted for snippet capture
  htmlContent: string; // full HTML with schema
  targetLength: number; // optimal word count for snippet
}

export interface PAAContent {
  keyword: string;
  questions: {
    question: string;
    answer: string;
    htmlAnswer: string;
  }[];
}

export interface KnowledgePanelData {
  entityName: string;
  entityType: string;
  description: string;
  attributes: Record<string, string>;
  socialProfiles: string[];
  officialSite: string;
  structuredData: Record<string, unknown>;
}

export interface HijackCampaign {
  id: string;
  domain: string;
  niche: string;
  language: string;
  keywords: string[];
  opportunities: FeatureOpportunity[];
  optimizedContents: FeaturedSnippetContent[];
  paaContents: PAAContent[];
  knowledgePanels: KnowledgePanelData[];
  schemas: SchemaMarkup[];
  deployedUrls: string[];
  stats: {
    totalOpportunities: number;
    optimized: number;
    deployed: number;
    won: number;
    lost: number;
  };
  startedAt: number;
  lastRunAt: number;
}

export interface HijackConfig {
  domain: string;
  niche: string;
  language: string;
  keywords: string[];
  maxOpportunities: number;
  autoOptimize: boolean;
  autoDeploy: boolean;
  targetFeatures: SERPFeatureType[];
  snippetFormats: SnippetFormat[];
  paaQuestionsPerKeyword: number;
  enableSchemaInjection: boolean;
  enableTelegramNotifications: boolean;
}

// ═══════════════════════════════════════════════
//  In-Memory State
// ═══════════════════════════════════════════════

const campaigns = new Map<string, HijackCampaign>();
const allOpportunities: FeatureOpportunity[] = [];

// ═══════════════════════════════════════════════
//  Config Factory
// ═══════════════════════════════════════════════

export function createDefaultHijackConfig(
  domain: string,
  niche: string,
  language: string,
  keywords: string[] = []
): HijackConfig {
  return {
    domain,
    niche,
    language,
    keywords,
    maxOpportunities: 50,
    autoOptimize: true,
    autoDeploy: true,
    targetFeatures: [
      "featured_snippet",
      "people_also_ask",
      "knowledge_panel",
      "ai_overview",
      "sitelinks",
    ],
    snippetFormats: ["paragraph", "list", "table"],
    paaQuestionsPerKeyword: 5,
    enableSchemaInjection: true,
    enableTelegramNotifications: true,
  };
}

// ═══════════════════════════════════════════════
//  SERP Feature Detection
// ═══════════════════════════════════════════════

/**
 * Detect SERP features for given keywords and identify hijack opportunities
 */
export async function detectFeatureOpportunities(
  config: HijackConfig
): Promise<FeatureOpportunity[]> {
  console.log(`[SERPHijacker] Detecting SERP feature opportunities for ${config.domain}...`);

  // Use existing analyzeSERPFeatures from serp-tracker
  const analysis = await analyzeSERPFeatures(config.domain, config.keywords);
  const opportunities: FeatureOpportunity[] = [];

  for (const featureResult of analysis.features) {
    for (const feature of featureResult.features) {
      if (!config.targetFeatures.includes(feature.type)) continue;

      const difficulty = assessDifficulty(feature);
      const strategy = getHijackStrategy(feature.type, difficulty);

      const opportunity: FeatureOpportunity = {
        keyword: featureResult.keyword,
        featureType: feature.type,
        currentlyOwned: feature.ownsFeature,
        position: feature.position,
        difficulty,
        strategy,
        status: "detected",
        detectedAt: Date.now(),
        lastCheckedAt: Date.now(),
      };

      opportunities.push(opportunity);
      allOpportunities.push(opportunity);
    }
  }

  // If no features detected from SERP, use LLM to predict opportunities
  if (opportunities.length === 0 && config.keywords.length > 0) {
    const predicted = await predictFeatureOpportunities(config);
    opportunities.push(...predicted);
    allOpportunities.push(...predicted);
  }

  console.log(`[SERPHijacker] Found ${opportunities.length} feature opportunities`);
  return opportunities;
}

function assessDifficulty(feature: SERPFeature): "easy" | "medium" | "hard" {
  if (feature.ownsFeature) return "easy"; // Already own it, just maintain
  if (feature.position <= 3) return "medium"; // Close to top
  return "hard";
}

function getHijackStrategy(type: SERPFeatureType, difficulty: string): string {
  const strategies: Record<SERPFeatureType, string> = {
    featured_snippet: `Format content as concise ${difficulty === "easy" ? "paragraph" : "list/table"} answer (40-60 words). Use question-answer format with clear heading.`,
    people_also_ask: "Generate 5-8 related Q&A pairs with concise answers (2-3 sentences each). Use FAQ schema markup.",
    knowledge_panel: "Build entity authority with consistent NAP data, social profiles, and structured data across platforms.",
    video_carousel: "Create video content with optimized titles, descriptions, and timestamps. Use VideoObject schema.",
    image_pack: "Optimize image alt text, filenames, and surrounding text. Use ImageObject schema with descriptive captions.",
    local_pack: "Optimize Google Business Profile with complete info, reviews, and LocalBusiness schema.",
    shopping: "Add Product schema with price, availability, and review data.",
    news: "Publish timely content with NewsArticle schema and proper author attribution.",
    ai_overview: "Create comprehensive, factual content that directly answers the query. Use structured headings and bullet points.",
    sitelinks: "Create clear site structure with descriptive navigation. Use BreadcrumbList and SiteNavigationElement schema.",
  };
  return strategies[type] || "Optimize content for this SERP feature.";
}

async function predictFeatureOpportunities(
  config: HijackConfig
): Promise<FeatureOpportunity[]> {
  console.log(`[SERPHijacker] Predicting feature opportunities via LLM...`);

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a SERP feature analyst. Predict which Google SERP features are likely to appear for given keywords and how difficult they are to capture. Return ONLY valid JSON.`,
      },
      {
        role: "user",
        content: `Domain: ${config.domain}
Niche: ${config.niche}
Keywords: ${config.keywords.join(", ")}

Predict SERP features for each keyword. Return JSON array:
[{
  "keyword": "string",
  "featureType": "featured_snippet"|"people_also_ask"|"knowledge_panel"|"ai_overview"|"sitelinks",
  "difficulty": "easy"|"medium"|"hard",
  "strategy": "string (brief optimization strategy)"
}]

Return 2-4 opportunities per keyword. Focus on featured_snippet and people_also_ask as highest ROI.`,
      },
    ],
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const predictions = JSON.parse(cleaned) as Array<{
      keyword: string;
      featureType: SERPFeatureType;
      difficulty: "easy" | "medium" | "hard";
      strategy: string;
    }>;

    return predictions.map((p) => ({
      keyword: p.keyword,
      featureType: p.featureType,
      currentlyOwned: false,
      position: 0,
      difficulty: p.difficulty,
      strategy: p.strategy,
      status: "detected" as const,
      detectedAt: Date.now(),
      lastCheckedAt: Date.now(),
    }));
  } catch {
    console.error("[SERPHijacker] Failed to parse LLM predictions");
    return config.keywords.map((kw) => ({
      keyword: kw,
      featureType: "featured_snippet" as SERPFeatureType,
      currentlyOwned: false,
      position: 0,
      difficulty: "medium" as const,
      strategy: "Create concise paragraph answer (40-60 words) targeting the featured snippet.",
      status: "detected" as const,
      detectedAt: Date.now(),
      lastCheckedAt: Date.now(),
    }));
  }
}

// ═══════════════════════════════════════════════
//  Featured Snippet Optimizer
// ═══════════════════════════════════════════════

/**
 * Generate content optimized to capture featured snippets
 */
export async function optimizeForFeaturedSnippet(
  keyword: string,
  niche: string,
  language: string,
  format: SnippetFormat = "paragraph"
): Promise<FeaturedSnippetContent> {
  console.log(`[SERPHijacker] Optimizing for featured snippet: "${keyword}" (${format})`);

  const formatInstructions: Record<SnippetFormat, string> = {
    paragraph: `Write a concise paragraph answer (40-60 words) that directly answers the query "${keyword}".
Start with a clear definition or direct answer. Use simple, authoritative language.
The paragraph should be self-contained and make sense without additional context.`,
    list: `Create a numbered or bulleted list that answers "${keyword}".
Include 5-8 items. Each item should be 5-15 words.
Start with a brief introductory sentence before the list.
Format: "1. Item one\\n2. Item two\\n..." or "- Item one\\n- Item two\\n..."`,
    table: `Create a comparison table that answers "${keyword}".
Include 4-6 rows and 2-3 columns. Use clear headers.
Format as HTML table with <table>, <thead>, <tbody>, <tr>, <th>, <td> tags.
Keep cell content concise (2-5 words per cell).`,
  };

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a featured snippet optimization expert for ${niche} niche.
Write content in ${language === "th" ? "Thai" : "English"} language.
Your goal is to create content that Google will select as a featured snippet.
Return ONLY valid JSON.`,
      },
      {
        role: "user",
        content: `${formatInstructions[format]}

Return JSON:
{
  "title": "H2 heading that contains the keyword (question format preferred)",
  "content": "The optimized snippet content",
  "targetLength": number (word count)
}`,
      },
    ],
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const result = JSON.parse(cleaned);
    const htmlContent = buildSnippetHtml(keyword, result.title, result.content, format);

    return {
      keyword,
      format,
      title: result.title,
      content: result.content,
      htmlContent,
      targetLength: result.targetLength || (format === "paragraph" ? 50 : 100),
    };
  } catch {
    const fallbackContent = `${keyword} is a comprehensive topic in ${niche}. This guide covers everything you need to know.`;
    return {
      keyword,
      format: "paragraph",
      title: keyword,
      content: fallbackContent,
      htmlContent: buildSnippetHtml(keyword, keyword, fallbackContent, "paragraph"),
      targetLength: 50,
    };
  }
}

function buildSnippetHtml(
  keyword: string,
  title: string,
  content: string,
  format: SnippetFormat
): string {
  let formattedContent = "";

  switch (format) {
    case "paragraph":
      formattedContent = `<p>${content}</p>`;
      break;
    case "list":
      if (content.includes("\n")) {
        const items = content
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => line.replace(/^[\d\-\*\.\)]+\s*/, "").trim());
        formattedContent = `<ol>${items.map((item) => `<li>${item}</li>`).join("\n")}</ol>`;
      } else {
        formattedContent = `<p>${content}</p>`;
      }
      break;
    case "table":
      // Content should already be HTML table
      formattedContent = content.includes("<table") ? content : `<p>${content}</p>`;
      break;
  }

  return `<article itemscope itemtype="https://schema.org/Article">
<h2 itemprop="headline">${title}</h2>
<div itemprop="articleBody">
${formattedContent}
</div>
<meta itemprop="keywords" content="${keyword}" />
<meta itemprop="dateModified" content="${new Date().toISOString()}" />
</article>`;
}

// ═══════════════════════════════════════════════
//  People Also Ask (PAA) Hijacker
// ═══════════════════════════════════════════════

/**
 * Generate Q&A content optimized for People Also Ask boxes
 */
export async function generatePAAContent(
  keyword: string,
  niche: string,
  language: string,
  numQuestions: number = 5
): Promise<PAAContent> {
  console.log(`[SERPHijacker] Generating PAA content for: "${keyword}" (${numQuestions} questions)`);

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a People Also Ask (PAA) optimization expert for ${niche} niche.
Generate questions that Google would show in PAA boxes for the given keyword.
Write in ${language === "th" ? "Thai" : "English"} language.
Each answer should be 2-3 sentences, concise and authoritative.
Return ONLY valid JSON.`,
      },
      {
        role: "user",
        content: `Generate ${numQuestions} PAA questions and answers for keyword: "${keyword}"

Return JSON:
{
  "questions": [
    {
      "question": "What is...?",
      "answer": "Concise 2-3 sentence answer"
    }
  ]
}

Questions should be:
- Natural language questions people actually ask
- Related to "${keyword}" but covering different aspects
- Start with What, How, Why, When, Where, Which, Is, Can, Does
- Progressively more specific`,
      },
    ],
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const result = JSON.parse(cleaned);
    const questions = (result.questions || []).map(
      (q: { question: string; answer: string }) => ({
        question: q.question,
        answer: q.answer,
        htmlAnswer: `<div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
<h3 itemprop="name">${q.question}</h3>
<div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
<p itemprop="text">${q.answer}</p>
</div>
</div>`,
      })
    );

    return { keyword, questions };
  } catch {
    return {
      keyword,
      questions: [
        {
          question: `What is ${keyword}?`,
          answer: `${keyword} is a key topic in ${niche}. It covers essential aspects that users need to understand.`,
          htmlAnswer: `<div><h3>What is ${keyword}?</h3><p>${keyword} is a key topic in ${niche}.</p></div>`,
        },
      ],
    };
  }
}

// ═══════════════════════════════════════════════
//  Knowledge Panel Builder
// ═══════════════════════════════════════════════

/**
 * Build structured data to trigger knowledge panel
 */
export async function buildKnowledgePanelData(
  entityName: string,
  niche: string,
  language: string,
  domain: string
): Promise<KnowledgePanelData> {
  console.log(`[SERPHijacker] Building knowledge panel data for: "${entityName}"`);

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a knowledge panel optimization expert.
Create structured entity data that helps Google build a knowledge panel.
Write in ${language === "th" ? "Thai" : "English"} language.
Return ONLY valid JSON.`,
      },
      {
        role: "user",
        content: `Create knowledge panel data for entity: "${entityName}"
Domain: ${domain}
Niche: ${niche}

Return JSON:
{
  "entityType": "Organization|Person|Product|Brand|WebSite",
  "description": "2-3 sentence description",
  "attributes": {
    "Founded": "year",
    "Headquarters": "location",
    "Industry": "industry",
    "CEO": "name",
    "Products": "list"
  },
  "socialProfiles": ["https://twitter.com/...", "https://facebook.com/..."]
}`,
      },
    ],
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const result = JSON.parse(cleaned);
    return {
      entityName,
      entityType: result.entityType || "Organization",
      description: result.description || `${entityName} is a leading entity in ${niche}.`,
      attributes: result.attributes || {},
      socialProfiles: result.socialProfiles || [],
      officialSite: `https://${domain}`,
      structuredData: buildKnowledgePanelSchema(entityName, result, domain),
    };
  } catch {
    return {
      entityName,
      entityType: "Organization",
      description: `${entityName} is a leading entity in ${niche}.`,
      attributes: { Industry: niche },
      socialProfiles: [],
      officialSite: `https://${domain}`,
      structuredData: buildKnowledgePanelSchema(
        entityName,
        { entityType: "Organization", description: `${entityName} in ${niche}` },
        domain
      ),
    };
  }
}

function buildKnowledgePanelSchema(
  entityName: string,
  data: Record<string, unknown>,
  domain: string
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": (data.entityType as string) || "Organization",
    name: entityName,
    url: `https://${domain}`,
    description: data.description,
    sameAs: (data.socialProfiles as string[]) || [],
  };
}

// ═══════════════════════════════════════════════
//  Content Reformatter for SERP Features
// ═══════════════════════════════════════════════

/**
 * Reformat existing content to optimize for specific SERP features
 */
export async function reformatContentForFeature(
  existingContent: string,
  keyword: string,
  featureType: SERPFeatureType,
  language: string
): Promise<string> {
  console.log(`[SERPHijacker] Reformatting content for ${featureType}: "${keyword}"`);

  const featureInstructions: Record<string, string> = {
    featured_snippet: `Rewrite the content to capture a featured snippet:
- Add a clear H2 heading as a question containing "${keyword}"
- Write a concise 40-60 word paragraph answer immediately after the heading
- Follow with a detailed explanation
- Include a numbered list of key points`,
    people_also_ask: `Rewrite the content as a FAQ format:
- Create 5 questions related to "${keyword}" as H3 headings
- Each answer should be 2-3 concise sentences
- Use FAQ schema-friendly structure`,
    ai_overview: `Rewrite the content for AI Overview optimization:
- Start with a comprehensive summary paragraph
- Use clear headings for each section
- Include bullet points for key facts
- Add statistics and specific data points
- Make content factual and easily extractable`,
    knowledge_panel: `Rewrite the content to support knowledge panel:
- Start with a clear entity definition
- Include key attributes (founded, location, industry)
- Add structured data markers
- Include social profile references`,
    sitelinks: `Rewrite the content with clear navigation structure:
- Use descriptive H2 headings for each section
- Add a table of contents at the top
- Make each section self-contained
- Use anchor links for navigation`,
  };

  const instruction = featureInstructions[featureType] || featureInstructions.featured_snippet;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a SERP feature optimization expert.
Reformat the given content to maximize chances of capturing the specified SERP feature.
Write in ${language === "th" ? "Thai" : "English"} language.
Return the reformatted content as HTML.`,
      },
      {
        role: "user",
        content: `${instruction}

Original content:
${existingContent.substring(0, 3000)}

Return the reformatted HTML content only (no JSON wrapper).`,
      },
    ],
  });

  const result = response.choices[0].message.content;
  return typeof result === "string" ? result : JSON.stringify(result);
}

// ═══════════════════════════════════════════════
//  Full Hijack Campaign
// ═══════════════════════════════════════════════

/**
 * Run a full SERP feature hijack campaign
 */
export async function runHijackCampaign(
  config: HijackConfig
): Promise<HijackCampaign> {
  const campaignId = `hijack-${config.domain}-${Date.now()}`;
  console.log(`[SERPHijacker] Starting hijack campaign: ${campaignId}`);

  const campaign: HijackCampaign = {
    id: campaignId,
    domain: config.domain,
    niche: config.niche,
    language: config.language,
    keywords: config.keywords,
    opportunities: [],
    optimizedContents: [],
    paaContents: [],
    knowledgePanels: [],
    schemas: [],
    deployedUrls: [],
    stats: {
      totalOpportunities: 0,
      optimized: 0,
      deployed: 0,
      won: 0,
      lost: 0,
    },
    startedAt: Date.now(),
    lastRunAt: Date.now(),
  };

  // Step 1: Detect opportunities
  const opportunities = await detectFeatureOpportunities(config);
  campaign.opportunities = opportunities;
  campaign.stats.totalOpportunities = opportunities.length;

  if (!config.autoOptimize) {
    campaigns.set(campaignId, campaign);
    return campaign;
  }

  // Step 2: Optimize for each feature type
  const snippetOpps = opportunities.filter(
    (o) => o.featureType === "featured_snippet" && !o.currentlyOwned
  );
  const paaOpps = opportunities.filter(
    (o) => o.featureType === "people_also_ask" && !o.currentlyOwned
  );
  const kpOpps = opportunities.filter(
    (o) => o.featureType === "knowledge_panel" && !o.currentlyOwned
  );

  // Optimize featured snippets
  for (const opp of snippetOpps.slice(0, 10)) {
    try {
      const format = selectBestFormat(opp.keyword);
      const snippetContent = await optimizeForFeaturedSnippet(
        opp.keyword,
        config.niche,
        config.language,
        format
      );
      campaign.optimizedContents.push(snippetContent);
      opp.optimizedContent = snippetContent.content;
      opp.status = "optimizing";
      campaign.stats.optimized++;
    } catch (err) {
      console.error(`[SERPHijacker] Failed to optimize snippet for "${opp.keyword}":`, err);
    }
  }

  // Generate PAA content
  for (const opp of paaOpps.slice(0, 10)) {
    try {
      const paaContent = await generatePAAContent(
        opp.keyword,
        config.niche,
        config.language,
        config.paaQuestionsPerKeyword
      );
      campaign.paaContents.push(paaContent);
      opp.status = "optimizing";
      campaign.stats.optimized++;
    } catch (err) {
      console.error(`[SERPHijacker] Failed to generate PAA for "${opp.keyword}":`, err);
    }
  }

  // Build knowledge panels
  for (const opp of kpOpps.slice(0, 3)) {
    try {
      const kpData = await buildKnowledgePanelData(
        opp.keyword,
        config.niche,
        config.language,
        config.domain
      );
      campaign.knowledgePanels.push(kpData);
      opp.status = "optimizing";
      campaign.stats.optimized++;
    } catch (err) {
      console.error(`[SERPHijacker] Failed to build KP for "${opp.keyword}":`, err);
    }
  }

  // Step 3: Generate schemas
  if (config.enableSchemaInjection) {
    for (const paa of campaign.paaContents) {
      try {
        const faqSchema = await generateFAQSchema(
          paa.keyword,
          `https://${config.domain}`,
          config.niche
        );
        campaign.schemas.push(faqSchema);
      } catch (err) {
        console.error(`[SERPHijacker] Failed to generate FAQ schema:`, err);
      }
    }

    for (const snippet of campaign.optimizedContents) {
      try {
        const articleSchema = await generateArticleSchema(
          snippet.title,
          snippet.content,
          `https://${config.domain}`,
          snippet.keyword
        );
        campaign.schemas.push(articleSchema);
      } catch (err) {
        console.error(`[SERPHijacker] Failed to generate article schema:`, err);
      }
    }
  }

  // Step 4: Deploy optimized content
  if (config.autoDeploy) {
    await deployOptimizedContent(campaign, config);
  }

  campaign.lastRunAt = Date.now();
  campaigns.set(campaignId, campaign);

  // Telegram notification
  if (config.enableTelegramNotifications) {
    try {
      await sendTelegramNotification({
        type: "success",
        targetUrl: config.domain,
        details: `SERP Feature Hijacker Campaign Complete\n\nOpportunities: ${campaign.stats.totalOpportunities}\nOptimized: ${campaign.stats.optimized}\nDeployed: ${campaign.stats.deployed}\nSnippets: ${campaign.optimizedContents.length}\nPAA: ${campaign.paaContents.length}\nKnowledge Panels: ${campaign.knowledgePanels.length}`,
        keywords: config.keywords,
      });
    } catch {
      // Silent fail for notifications
    }
  }

  console.log(
    `[SERPHijacker] Campaign complete: ${campaign.stats.optimized} optimized, ${campaign.stats.deployed} deployed`
  );

  return campaign;
}

function selectBestFormat(keyword: string): SnippetFormat {
  const lowerKw = keyword.toLowerCase();

  // List format for "how to", "steps", "ways", "tips", "types"
  if (/how to|steps|ways|tips|types|methods|best|top \d+/i.test(lowerKw)) {
    return "list";
  }

  // Table format for "vs", "comparison", "difference", "price"
  if (/vs\.?|comparison|difference|compare|price|cost|salary/i.test(lowerKw)) {
    return "table";
  }

  // Default to paragraph for definitions, "what is", etc.
  return "paragraph";
}

async function deployOptimizedContent(
  campaign: HijackCampaign,
  config: HijackConfig
): Promise<void> {
  console.log(`[SERPHijacker] Deploying optimized content...`);

  // Combine all optimized content into deployable articles
  for (const snippet of campaign.optimizedContents) {
    try {
      // Build full article with snippet-optimized content + PAA + schemas
      const relatedPAA = campaign.paaContents.find(
        (p) => p.keyword === snippet.keyword
      );

      let fullContent = snippet.htmlContent;

      // Add PAA section
      if (relatedPAA) {
        fullContent += `\n<section>\n<h2>Frequently Asked Questions</h2>\n`;
        for (const q of relatedPAA.questions) {
          fullContent += q.htmlAnswer + "\n";
        }
        fullContent += `</section>\n`;
      }

      // Add schema markup
      if (config.enableSchemaInjection && campaign.schemas.length > 0) {
      const relevantSchemas = campaign.schemas.filter(
        (s) =>
          s.keyword === snippet.keyword ||
          s.type === "FAQPage"
      );
        if (relevantSchemas.length > 0) {
          fullContent += schemasToHtml(relevantSchemas);
        }
      }

      // Deploy to Telegraph
      const deployResult = await deployTelegraphBlitz(
        snippet.keyword,
        `https://${config.domain}`,
        config.domain,
        1,
        config.language
      );

      if (deployResult.length > 0) {
        const url = deployResult[0].url;
        snippet.htmlContent = fullContent; // Store enriched version
        campaign.deployedUrls.push(url);
        campaign.stats.deployed++;

        // Update opportunity status
        const opp = campaign.opportunities.find(
          (o) => o.keyword === snippet.keyword && o.featureType === "featured_snippet"
        );
        if (opp) {
          opp.deployedUrl = url;
          opp.status = "deployed";
        }
      }
    } catch (err) {
      console.error(`[SERPHijacker] Failed to deploy snippet for "${snippet.keyword}":`, err);
    }
  }

  // Deploy PAA-only content (keywords without snippet optimization)
  for (const paa of campaign.paaContents) {
    const hasSnippet = campaign.optimizedContents.some(
      (s) => s.keyword === paa.keyword
    );
    if (hasSnippet) continue; // Already deployed with snippet

    try {
      let paaHtml = `<article>\n<h1>${paa.keyword}</h1>\n<section>\n<h2>Frequently Asked Questions</h2>\n`;
      for (const q of paa.questions) {
        paaHtml += q.htmlAnswer + "\n";
      }
      paaHtml += `</section>\n</article>`;

      const deployResult = await deployTelegraphBlitz(
        paa.keyword,
        `https://${config.domain}`,
        config.domain,
        1,
        config.language
      );

      if (deployResult.length > 0) {
        campaign.deployedUrls.push(deployResult[0].url);
        campaign.stats.deployed++;
      }
    } catch (err) {
      console.error(`[SERPHijacker] Failed to deploy PAA for "${paa.keyword}":`, err);
    }
  }
}

// ═══════════════════════════════════════════════
//  SERP Feature Tracker
// ═══════════════════════════════════════════════

/**
 * Check if we've won any SERP features since last check
 */
export async function checkFeatureWins(
  domain: string,
  keywords: string[]
): Promise<{
  wins: FeatureOpportunity[];
  losses: FeatureOpportunity[];
  unchanged: FeatureOpportunity[];
}> {
  console.log(`[SERPHijacker] Checking feature wins for ${domain}...`);

  const currentFeatures = await analyzeSERPFeatures(domain, keywords);
  const wins: FeatureOpportunity[] = [];
  const losses: FeatureOpportunity[] = [];
  const unchanged: FeatureOpportunity[] = [];

  for (const featureResult of currentFeatures.features) {
    for (const feature of featureResult.features) {
      // Find matching opportunity
      const existing = allOpportunities.find(
        (o) => o.keyword === featureResult.keyword && o.featureType === feature.type
      );

      if (existing) {
        const wasOwned = existing.currentlyOwned;
        existing.currentlyOwned = feature.ownsFeature;
        existing.lastCheckedAt = Date.now();

        if (!wasOwned && feature.ownsFeature) {
          existing.status = "won";
          wins.push(existing);
        } else if (wasOwned && !feature.ownsFeature) {
          existing.status = "lost";
          losses.push(existing);
        } else {
          unchanged.push(existing);
        }
      }
    }
  }

  // Update campaign stats
  Array.from(campaigns.values()).forEach((campaign) => {
    if (campaign.domain === domain) {
      campaign.stats.won = campaign.opportunities.filter(
        (o: FeatureOpportunity) => o.status === "won"
      ).length;
      campaign.stats.lost = campaign.opportunities.filter(
        (o: FeatureOpportunity) => o.status === "lost"
      ).length;
    }
  });

  console.log(
    `[SERPHijacker] Feature check: ${wins.length} wins, ${losses.length} losses, ${unchanged.length} unchanged`
  );

  return { wins, losses, unchanged };
}

// ═══════════════════════════════════════════════
//  Daemon Tick (for orchestrator integration)
// ═══════════════════════════════════════════════

/**
 * Periodic tick for SERP feature monitoring and optimization
 */
export async function serpFeatureTick(
  domain: string,
  keywords: string[],
  niche: string,
  language: string
): Promise<{
  newOpportunities: number;
  optimized: number;
  deployed: number;
  wins: number;
}> {
  console.log(`[SERPHijacker] Running periodic tick for ${domain}...`);

  const result = {
    newOpportunities: 0,
    optimized: 0,
    deployed: 0,
    wins: 0,
  };

  try {
    // Check for feature wins/losses
    const featureCheck = await checkFeatureWins(domain, keywords);
    result.wins = featureCheck.wins.length;

    // Notify on wins
    if (featureCheck.wins.length > 0) {
      try {
        await sendTelegramNotification({
          type: "success",
          targetUrl: domain,
          details: `SERP Feature WIN!\n\n${featureCheck.wins
            .map((w) => `${w.featureType}: "${w.keyword}"`)
            .join("\n")}`,
          keywords: featureCheck.wins.map((w) => w.keyword),
        });
      } catch {
        // Silent fail
      }
    }

    // Detect new opportunities
    const config = createDefaultHijackConfig(domain, niche, language, keywords);
    config.autoOptimize = true;
    config.autoDeploy = true;

    const newOpps = await detectFeatureOpportunities(config);
    const unoptimized = newOpps.filter(
      (o) => o.status === "detected" && !o.currentlyOwned
    );
    result.newOpportunities = unoptimized.length;

    // Optimize top 3 new opportunities
    for (const opp of unoptimized.slice(0, 3)) {
      try {
        if (opp.featureType === "featured_snippet") {
          const format = selectBestFormat(opp.keyword);
          await optimizeForFeaturedSnippet(opp.keyword, niche, language, format);
          result.optimized++;
        } else if (opp.featureType === "people_also_ask") {
          await generatePAAContent(opp.keyword, niche, language);
          result.optimized++;
        }
      } catch {
        // Continue with next
      }
    }
  } catch (err) {
    console.error(`[SERPHijacker] Tick error:`, err);
  }

  return result;
}

// ═══════════════════════════════════════════════
//  Getters & Summary
// ═══════════════════════════════════════════════

export function getCampaign(campaignId: string): HijackCampaign | null {
  return campaigns.get(campaignId) || null;
}

export function getAllCampaigns(): HijackCampaign[] {
  return Array.from(campaigns.values());
}

export function getOpportunities(domain?: string): FeatureOpportunity[] {
  if (domain) {
    return allOpportunities.filter((o) => {
      return Array.from(campaigns.values()).some(
        (campaign) => campaign.domain === domain && campaign.opportunities.includes(o)
      );
    });
  }
  return [...allOpportunities];
}

export function getHijackSummary(): {
  totalCampaigns: number;
  totalOpportunities: number;
  optimized: number;
  deployed: number;
  won: number;
  lost: number;
  featureBreakdown: Record<string, number>;
} {
  let totalOpportunities = 0;
  let optimized = 0;
  let deployed = 0;
  let won = 0;
  let lost = 0;
  const featureBreakdown: Record<string, number> = {};

  Array.from(campaigns.values()).forEach((campaign) => {
    totalOpportunities += campaign.stats.totalOpportunities;
    optimized += campaign.stats.optimized;
    deployed += campaign.stats.deployed;
    won += campaign.stats.won;
    lost += campaign.stats.lost;

    for (const opp of campaign.opportunities) {
      featureBreakdown[opp.featureType] =
        (featureBreakdown[opp.featureType] || 0) + 1;
    }
  });

  return {
    totalCampaigns: campaigns.size,
    totalOpportunities,
    optimized,
    deployed,
    won,
    lost,
    featureBreakdown,
  };
}
