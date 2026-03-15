/**
 * SEO On-Page Optimizer (Full Pipeline)
 * 
 * Orchestrates the complete on-page SEO optimization:
 * 1. Title tag, meta description, H1 validation
 * 2. Keyword placement optimization (title, meta, H1, intro, body, CTA)
 * 3. Semantic keyword expansion, natural bolding
 * 4. Image alt generation
 * 5. Duplicate heading/content detection
 * 6. Keyword cannibalization prevention
 * 7. Readability improvements
 * 8. Indexability checks
 * 
 * This wraps the existing ai-onpage-seo-optimizer.ts with additional
 * intelligence and connects it to the theme analyzer and layout rebuilder.
 */

import { invokeLLM } from "./_core/llm";
import { runSeoAudit, generateOptimizedPage, type SeoOptimizationInput, type OptimizedPage, type SeoCheckResult } from "./ai-onpage-seo-optimizer";

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface FullOnPageInput {
  /** WordPress site URL */
  siteUrl: string;
  /** WP credentials */
  username: string;
  appPassword: string;
  /** Primary keyword */
  primaryKeyword: string;
  /** Secondary keywords */
  secondaryKeywords?: string[];
  /** Niche */
  niche?: string;
  /** Brand name */
  brandName?: string;
  /** Language */
  language?: string;
  /** Existing page HTML (for optimization) */
  existingHtml?: string;
  /** Page ID (for updating existing page) */
  pageId?: number;
  /** Content type */
  contentType?: "page" | "post";
}

export interface OnPageOptimizationResult {
  /** Optimized page data */
  optimizedPage: OptimizedPage;
  /** SEO audit before optimization */
  auditBefore?: { score: number; checks: SeoCheckResult[] };
  /** SEO audit after optimization */
  auditAfter: { score: number; checks: SeoCheckResult[] };
  /** Keyword placement report */
  keywordPlacement: KeywordPlacementReport;
  /** Semantic expansion keywords used */
  semanticKeywords: string[];
  /** Duplicate detection results */
  duplicateCheck: DuplicateCheckResult;
  /** Cannibalization check */
  cannibalizationCheck: CannibalizationResult;
  /** Readability metrics */
  readability: ReadabilityMetrics;
  /** Indexability checks */
  indexability: IndexabilityCheck;
  /** Changes made */
  changes: string[];
}

export interface KeywordPlacementReport {
  title: { present: boolean; position: "start" | "middle" | "end" | "missing" };
  metaDescription: { present: boolean; count: number };
  h1: { present: boolean; position: "start" | "middle" | "end" | "missing" };
  firstParagraph: { present: boolean; withinFirst100Words: boolean };
  h2Headings: { total: number; withKeyword: number };
  bodyContent: { count: number; density: number; naturalPlacement: boolean };
  imageAlts: { total: number; withKeyword: number };
  url: { present: boolean };
  lastParagraph: { present: boolean };
  score: number; // 0-100
}

export interface DuplicateCheckResult {
  duplicateHeadings: { heading: string; count: number }[];
  duplicateParagraphs: { text: string; count: number }[];
  hasDuplicateIssues: boolean;
}

export interface CannibalizationResult {
  potentialConflicts: {
    keyword: string;
    pages: { title: string; url: string }[];
    severity: "high" | "medium" | "low";
    recommendation: string;
  }[];
  hasCannibalization: boolean;
}

export interface ReadabilityMetrics {
  avgSentenceLength: number;
  avgParagraphLength: number;
  shortSentenceRatio: number;
  longSentenceRatio: number;
  passiveVoiceRatio: number;
  transitionWordRatio: number;
  readabilityScore: number; // 0-100
  suggestions: string[];
}

export interface IndexabilityCheck {
  hasRobotsNoindex: boolean;
  hasCanonical: boolean;
  canonicalUrl: string;
  hasHreflang: boolean;
  hasSitemap: boolean;
  hasRobotsTxt: boolean;
  httpStatus: number;
  redirectChain: string[];
  isIndexable: boolean;
  issues: string[];
}

// ═══════════════════════════════════════════════
// Keyword Placement Analyzer
// ═══════════════════════════════════════════════

function analyzeKeywordPlacement(page: OptimizedPage, primaryKeyword: string): KeywordPlacementReport {
  const kwLower = primaryKeyword.toLowerCase();
  
  // Title
  const titleLower = (page.title || "").toLowerCase();
  const titlePresent = titleLower.includes(kwLower);
  let titlePosition: "start" | "middle" | "end" | "missing" = "missing";
  if (titlePresent) {
    const idx = titleLower.indexOf(kwLower);
    if (idx < titleLower.length * 0.3) titlePosition = "start";
    else if (idx > titleLower.length * 0.7) titlePosition = "end";
    else titlePosition = "middle";
  }

  // Meta description
  const metaLower = (page.metaDescription || "").toLowerCase();
  const metaPresent = metaLower.includes(kwLower);
  const metaCount = (metaLower.match(new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;

  // H1
  const h1Lower = (page.h1 || "").toLowerCase();
  const h1Present = h1Lower.includes(kwLower);
  let h1Position: "start" | "middle" | "end" | "missing" = "missing";
  if (h1Present) {
    const idx = h1Lower.indexOf(kwLower);
    if (idx < h1Lower.length * 0.3) h1Position = "start";
    else if (idx > h1Lower.length * 0.7) h1Position = "end";
    else h1Position = "middle";
  }

  // First paragraph
  const contentLower = (page.content || "").toLowerCase();
  const firstParagraphMatch = contentLower.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const firstParagraph = firstParagraphMatch ? firstParagraphMatch[1] : contentLower.slice(0, 500);
  const firstParaPresent = firstParagraph.includes(kwLower);
  const first100Words = contentLower.replace(/<[^>]+>/g, " ").split(/\s+/).slice(0, 100).join(" ");
  const withinFirst100 = first100Words.includes(kwLower);

  // H2 headings
  const h2Headings = page.headings.filter(h => h.level === 2);
  const h2WithKeyword = h2Headings.filter(h => h.text.toLowerCase().includes(kwLower));

  // Body content
  const bodyText = contentLower.replace(/<[^>]+>/g, " ");
  const bodyWords = bodyText.split(/\s+/).filter(w => w.length > 1);
  const bodyKwCount = (bodyText.match(new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  const bodyDensity = bodyWords.length > 0 ? Math.round((bodyKwCount / bodyWords.length) * 10000) / 100 : 0;

  // Image alts
  const imageAltsWithKw = page.images.filter(img => img.alt.toLowerCase().includes(kwLower));

  // URL
  const urlPresent = (page.slug || "").toLowerCase().includes(kwLower.replace(/\s+/g, "-"));

  // Last paragraph
  const paragraphs = contentLower.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
  const lastParagraph = paragraphs.length > 0 ? paragraphs[paragraphs.length - 1] : "";
  const lastParaPresent = lastParagraph.includes(kwLower);

  // Calculate score
  let score = 0;
  if (titlePresent) score += 15;
  if (titlePosition === "start") score += 5;
  if (metaPresent) score += 10;
  if (h1Present) score += 15;
  if (h1Position === "start") score += 5;
  if (firstParaPresent) score += 10;
  if (withinFirst100) score += 5;
  if (h2WithKeyword.length > 0) score += 10;
  if (bodyDensity >= 0.5 && bodyDensity <= 2.5) score += 10;
  if (imageAltsWithKw.length > 0) score += 5;
  if (urlPresent) score += 5;
  if (lastParaPresent) score += 5;

  return {
    title: { present: titlePresent, position: titlePosition },
    metaDescription: { present: metaPresent, count: metaCount },
    h1: { present: h1Present, position: h1Position },
    firstParagraph: { present: firstParaPresent, withinFirst100Words: withinFirst100 },
    h2Headings: { total: h2Headings.length, withKeyword: h2WithKeyword.length },
    bodyContent: { count: bodyKwCount, density: bodyDensity, naturalPlacement: bodyDensity >= 0.5 && bodyDensity <= 2.5 },
    imageAlts: { total: page.images.length, withKeyword: imageAltsWithKw.length },
    url: { present: urlPresent },
    lastParagraph: { present: lastParaPresent },
    score,
  };
}

// ═══════════════════════════════════════════════
// Duplicate Detection
// ═══════════════════════════════════════════════

function checkDuplicates(page: OptimizedPage): DuplicateCheckResult {
  // Check duplicate headings
  const headingTexts = page.headings.map(h => h.text.toLowerCase().trim());
  const headingCounts = new Map<string, number>();
  for (const text of headingTexts) {
    headingCounts.set(text, (headingCounts.get(text) || 0) + 1);
  }
  const duplicateHeadings = Array.from(headingCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([heading, count]) => ({ heading, count }));

  // Check duplicate paragraphs
  const paragraphs = (page.content || "").match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  const paraTexts = paragraphs.map(p => p.replace(/<[^>]+>/g, "").trim().toLowerCase()).filter(p => p.length > 50);
  const paraCounts = new Map<string, number>();
  for (const text of paraTexts) {
    paraCounts.set(text, (paraCounts.get(text) || 0) + 1);
  }
  const duplicateParagraphs = Array.from(paraCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([text, count]) => ({ text: text.slice(0, 100), count }));

  return {
    duplicateHeadings,
    duplicateParagraphs,
    hasDuplicateIssues: duplicateHeadings.length > 0 || duplicateParagraphs.length > 0,
  };
}

// ═══════════════════════════════════════════════
// Cannibalization Check
// ═══════════════════════════════════════════════

async function checkCannibalization(
  siteUrl: string,
  username: string,
  appPassword: string,
  primaryKeyword: string,
  currentPageId?: number,
): Promise<CannibalizationResult> {
  const url = siteUrl.replace(/\/$/, "");
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const conflicts: CannibalizationResult["potentialConflicts"] = [];

  try {
    // Fetch existing pages and posts
    const [pagesRes, postsRes] = await Promise.all([
      fetch(`${url}/wp-json/wp/v2/pages?per_page=50&status=publish`, {
        headers: { "Authorization": `Basic ${auth}` },
        signal: AbortSignal.timeout(15000),
      }),
      fetch(`${url}/wp-json/wp/v2/posts?per_page=50&status=publish`, {
        headers: { "Authorization": `Basic ${auth}` },
        signal: AbortSignal.timeout(15000),
      }),
    ]);

    const pages = pagesRes.ok ? (await pagesRes.json() as any[]) : [];
    const posts = postsRes.ok ? (await postsRes.json() as any[]) : [];
    const allContent = [...pages, ...posts].filter(p => p.id !== currentPageId);

    const kwLower = primaryKeyword.toLowerCase();

    for (const item of allContent) {
      const title = (item.title?.rendered || "").toLowerCase();
      const content = (item.content?.rendered || "").toLowerCase().replace(/<[^>]+>/g, " ");
      const slug = (item.slug || "").toLowerCase();

      // Check if this page targets the same keyword
      const titleMatch = title.includes(kwLower);
      const slugMatch = slug.includes(kwLower.replace(/\s+/g, "-"));
      const contentDensity = content.split(kwLower).length - 1;

      if (titleMatch || slugMatch || contentDensity > 5) {
        const severity = titleMatch && slugMatch ? "high" : titleMatch || slugMatch ? "medium" : "low";
        conflicts.push({
          keyword: primaryKeyword,
          pages: [{ title: item.title?.rendered || "Untitled", url: item.link || "" }],
          severity,
          recommendation: severity === "high"
            ? `Consider merging content or differentiating keyword focus. Page "${item.title?.rendered}" targets the same keyword.`
            : `Monitor for cannibalization. Page "${item.title?.rendered}" has some keyword overlap.`,
        });
      }
    }
  } catch (err: any) {
    console.error(`[SEO-Optimizer] Cannibalization check failed: ${err.message}`);
  }

  return {
    potentialConflicts: conflicts,
    hasCannibalization: conflicts.some(c => c.severity === "high"),
  };
}

// ═══════════════════════════════════════════════
// Readability Analysis
// ═══════════════════════════════════════════════

function analyzeReadability(content: string): ReadabilityMetrics {
  const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const paragraphs = content.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
  
  const avgSentenceLength = sentences.length > 0
    ? Math.round(sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length)
    : 0;
  
  const avgParagraphLength = paragraphs.length > 0
    ? Math.round(paragraphs.reduce((sum, p) => {
        const pText = p.replace(/<[^>]+>/g, "").trim();
        return sum + pText.split(/\s+/).length;
      }, 0) / paragraphs.length)
    : 0;
  
  const shortSentences = sentences.filter(s => s.trim().split(/\s+/).length < 10);
  const longSentences = sentences.filter(s => s.trim().split(/\s+/).length > 25);
  
  const shortSentenceRatio = sentences.length > 0 ? Math.round((shortSentences.length / sentences.length) * 100) : 0;
  const longSentenceRatio = sentences.length > 0 ? Math.round((longSentences.length / sentences.length) * 100) : 0;
  
  // Simple passive voice detection (Thai doesn't have passive voice in the same way)
  const passivePatterns = /ถูก|ได้รับ|โดน/g;
  const passiveCount = (text.match(passivePatterns) || []).length;
  const passiveVoiceRatio = sentences.length > 0 ? Math.round((passiveCount / sentences.length) * 100) : 0;
  
  // Transition words
  const transitionWords = /นอกจากนี้|อย่างไรก็ตาม|ดังนั้น|เพราะฉะนั้น|ในขณะที่|อีกทั้ง|ยิ่งไปกว่านั้น|สรุปแล้ว|กล่าวคือ|ตัวอย่างเช่น|furthermore|however|therefore|moreover|additionally|consequently|in addition|for example/gi;
  const transitionCount = (text.match(transitionWords) || []).length;
  const transitionWordRatio = sentences.length > 0 ? Math.round((transitionCount / sentences.length) * 100) : 0;
  
  // Calculate readability score
  let readabilityScore = 70; // Base score
  if (avgSentenceLength > 20) readabilityScore -= 10;
  if (avgSentenceLength < 8) readabilityScore -= 5;
  if (longSentenceRatio > 30) readabilityScore -= 15;
  if (shortSentenceRatio > 60) readabilityScore -= 5;
  if (transitionWordRatio < 20) readabilityScore -= 10;
  if (avgParagraphLength > 100) readabilityScore -= 10;
  if (paragraphs.length < 3) readabilityScore -= 10;
  readabilityScore = Math.max(0, Math.min(100, readabilityScore));
  
  const suggestions: string[] = [];
  if (avgSentenceLength > 20) suggestions.push("Shorten sentences — aim for 15-20 words average");
  if (longSentenceRatio > 30) suggestions.push(`${longSentenceRatio}% of sentences are too long (>25 words)`);
  if (transitionWordRatio < 20) suggestions.push("Add more transition words for better flow");
  if (avgParagraphLength > 100) suggestions.push("Break up long paragraphs — aim for 50-80 words");
  if (paragraphs.length < 3) suggestions.push("Add more paragraphs for better readability");
  
  return {
    avgSentenceLength,
    avgParagraphLength,
    shortSentenceRatio,
    longSentenceRatio,
    passiveVoiceRatio,
    transitionWordRatio,
    readabilityScore,
    suggestions,
  };
}

// ═══════════════════════════════════════════════
// Indexability Check
// ═══════════════════════════════════════════════

async function checkIndexability(siteUrl: string): Promise<IndexabilityCheck> {
  const result: IndexabilityCheck = {
    hasRobotsNoindex: false,
    hasCanonical: false,
    canonicalUrl: "",
    hasHreflang: false,
    hasSitemap: false,
    hasRobotsTxt: false,
    httpStatus: 0,
    redirectChain: [],
    isIndexable: true,
    issues: [],
  };

  try {
    // Check the page
    const res = await fetch(siteUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    result.httpStatus = res.status;

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) result.redirectChain.push(location);
    }

    if (res.status === 200) {
      const html = await res.text();
      
      // Check robots meta
      if (/meta[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)) {
        result.hasRobotsNoindex = true;
        result.isIndexable = false;
        result.issues.push("Page has noindex meta tag");
      }
      
      // Check canonical
      const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
      if (canonicalMatch) {
        result.hasCanonical = true;
        result.canonicalUrl = canonicalMatch[1];
      } else {
        result.issues.push("Missing canonical tag");
      }
      
      // Check hreflang
      result.hasHreflang = /hreflang/i.test(html);
    } else if (res.status >= 400) {
      result.isIndexable = false;
      result.issues.push(`Page returns HTTP ${res.status}`);
    }
  } catch (err: any) {
    result.issues.push(`Cannot access page: ${err.message}`);
  }

  // Check robots.txt
  try {
    const robotsRes = await fetch(`${siteUrl.replace(/\/$/, "")}/robots.txt`, {
      signal: AbortSignal.timeout(10000),
    });
    result.hasRobotsTxt = robotsRes.ok;
    if (robotsRes.ok) {
      const robotsTxt = await robotsRes.text();
      if (/Disallow:\s*\/\s*$/m.test(robotsTxt)) {
        result.isIndexable = false;
        result.issues.push("robots.txt blocks all crawlers");
      }
    }
  } catch {}

  // Check sitemap
  try {
    const sitemapRes = await fetch(`${siteUrl.replace(/\/$/, "")}/sitemap.xml`, {
      signal: AbortSignal.timeout(10000),
    });
    result.hasSitemap = sitemapRes.ok;
    if (!sitemapRes.ok) {
      result.issues.push("No sitemap.xml found");
    }
  } catch {}

  return result;
}

// ═══════════════════════════════════════════════
// Semantic Keyword Expansion
// ═══════════════════════════════════════════════

async function expandSemanticKeywords(
  primaryKeyword: string,
  secondaryKeywords: string[],
  niche: string,
  language: string,
): Promise<string[]> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an SEO keyword researcher. Generate semantically related keywords (LSI keywords) for the given primary keyword. Language: ${language === "th" ? "Thai" : "English"}. Niche: ${niche}.

Return 10-15 semantically related keywords that:
- Are naturally related to the primary keyword
- Cover different search intents (informational, navigational, transactional)
- Include entity-related terms
- Include long-tail variations
- Are NOT just the primary keyword with modifiers

Respond in JSON format.`,
        },
        {
          role: "user",
          content: `Primary: "${primaryKeyword}"\nSecondary: ${secondaryKeywords.join(", ")}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "semantic_keywords",
          strict: true,
          schema: {
            type: "object",
            properties: {
              keywords: { type: "array", items: { type: "string" } },
            },
            required: ["keywords"],
            additionalProperties: false,
          },
        },
      },
    });

    const result = JSON.parse(String(response.choices[0].message.content) || "{}");
    return result.keywords || [];
  } catch (err: any) {
    console.error(`[SEO-Optimizer] Semantic expansion failed: ${err.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════
// Main Full On-Page Optimization
// ═══════════════════════════════════════════════

export async function runFullOnPageOptimization(input: FullOnPageInput): Promise<OnPageOptimizationResult> {
  const {
    siteUrl,
    username,
    appPassword,
    primaryKeyword,
    secondaryKeywords = [],
    niche = "gambling",
    brandName = primaryKeyword,
    language = "th",
    existingHtml,
    pageId,
  } = input;

  console.log(`[SEO-Optimizer] 🔧 Starting full on-page optimization for "${primaryKeyword}" on ${siteUrl}`);
  const changes: string[] = [];

  // Step 1: Expand semantic keywords
  console.log(`[SEO-Optimizer] Step 1: Expanding semantic keywords...`);
  const semanticKeywords = await expandSemanticKeywords(primaryKeyword, secondaryKeywords, niche, language);
  const allKeywords = [...secondaryKeywords, ...semanticKeywords];
  changes.push(`Expanded to ${semanticKeywords.length} semantic keywords`);

  // Step 2: Run existing audit on current content (if available)
  let auditBefore: { score: number; checks: SeoCheckResult[] } | undefined;
  if (existingHtml) {
    console.log(`[SEO-Optimizer] Step 2: Running pre-optimization audit...`);
    // Extract basic data from existing HTML for audit
    const titleMatch = existingHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const h1Match = existingHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const metaDescMatch = existingHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*?)["']/i);
    const headingsRaw = existingHtml.match(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi) || [];
    const headings = headingsRaw.map(h => {
      const levelMatch = h.match(/<h(\d)/i);
      const textMatch = h.match(/<h\d[^>]*>([\s\S]*?)<\/h\d>/i);
      return {
        level: parseInt(levelMatch?.[1] || "2"),
        text: (textMatch?.[1] || "").replace(/<[^>]+>/g, "").trim(),
      };
    });

    auditBefore = runSeoAudit({
      title: titleMatch?.[1]?.trim() || "",
      metaDescription: metaDescMatch?.[1] || "",
      h1: h1Match?.[1]?.replace(/<[^>]+>/g, "").trim() || "",
      headings,
      content: existingHtml,
      slug: "",
      primaryKeyword,
      secondaryKeywords: allKeywords,
      schemas: [],
      images: [],
      internalLinks: [],
      wordCount: existingHtml.replace(/<[^>]+>/g, " ").split(/\s+/).length,
    });
    changes.push(`Pre-optimization SEO score: ${auditBefore.score}/100`);
  }

  // Step 3: Generate optimized page using existing engine
  console.log(`[SEO-Optimizer] Step 3: Generating optimized page...`);
  const optimizationInput: SeoOptimizationInput = {
    domain: siteUrl,
    primaryKeyword,
    secondaryKeywords: allKeywords.slice(0, 10),
    language,
    country: language === "th" ? "TH" : "US",
    niche,
    brandName,
    existingContent: existingHtml,
  };

  const optimizedPage = await generateOptimizedPage(optimizationInput);
  changes.push(`Generated optimized page: "${optimizedPage.title}" (${optimizedPage.wordCount} words)`);

  // Step 4: Analyze keyword placement
  console.log(`[SEO-Optimizer] Step 4: Analyzing keyword placement...`);
  const keywordPlacement = analyzeKeywordPlacement(optimizedPage, primaryKeyword);
  changes.push(`Keyword placement score: ${keywordPlacement.score}/100`);

  // Step 5: Check for duplicates
  console.log(`[SEO-Optimizer] Step 5: Checking for duplicates...`);
  const duplicateCheck = checkDuplicates(optimizedPage);
  if (duplicateCheck.hasDuplicateIssues) {
    changes.push(`Found ${duplicateCheck.duplicateHeadings.length} duplicate headings, ${duplicateCheck.duplicateParagraphs.length} duplicate paragraphs`);
  }

  // Step 6: Check cannibalization
  console.log(`[SEO-Optimizer] Step 6: Checking keyword cannibalization...`);
  const cannibalizationCheck = await checkCannibalization(siteUrl, username, appPassword, primaryKeyword, pageId);
  if (cannibalizationCheck.hasCannibalization) {
    changes.push(`⚠️ Keyword cannibalization detected with ${cannibalizationCheck.potentialConflicts.length} pages`);
  }

  // Step 7: Analyze readability
  console.log(`[SEO-Optimizer] Step 7: Analyzing readability...`);
  const readability = analyzeReadability(optimizedPage.content);
  changes.push(`Readability score: ${readability.readabilityScore}/100`);

  // Step 8: Check indexability
  console.log(`[SEO-Optimizer] Step 8: Checking indexability...`);
  const indexability = await checkIndexability(siteUrl);
  if (!indexability.isIndexable) {
    changes.push(`⚠️ Page is NOT indexable: ${indexability.issues.join(", ")}`);
  }

  // Step 9: Run post-optimization audit
  console.log(`[SEO-Optimizer] Step 9: Running post-optimization audit...`);
  const auditAfter = runSeoAudit({
    title: optimizedPage.title,
    metaDescription: optimizedPage.metaDescription,
    h1: optimizedPage.h1,
    headings: optimizedPage.headings,
    content: optimizedPage.content,
    slug: optimizedPage.slug,
    primaryKeyword,
    secondaryKeywords: allKeywords,
    schemas: optimizedPage.schemas,
    images: optimizedPage.images.map(i => ({ alt: i.alt, src: i.src })),
    internalLinks: optimizedPage.internalLinks,
    wordCount: optimizedPage.wordCount,
  });
  changes.push(`Post-optimization SEO score: ${auditAfter.score}/100`);

  if (auditBefore) {
    const improvement = auditAfter.score - auditBefore.score;
    changes.push(`SEO score improvement: +${improvement} points`);
  }

  console.log(`[SEO-Optimizer] ✅ Full on-page optimization complete`);
  console.log(`[SEO-Optimizer] SEO: ${auditAfter.score}/100, Keywords: ${keywordPlacement.score}/100, Readability: ${readability.readabilityScore}/100`);

  return {
    optimizedPage,
    auditBefore,
    auditAfter,
    keywordPlacement,
    semanticKeywords,
    duplicateCheck,
    cannibalizationCheck,
    readability,
    indexability,
    changes,
  };
}
