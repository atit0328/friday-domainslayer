/**
 * SEO Theme Analyzer
 * 
 * Analyzes an installed WordPress theme's structure for SEO readiness.
 * Runs immediately after theme installation to detect:
 * - DOM/content block structure
 * - Heading hierarchy issues
 * - Section ordering problems
 * - CTA clutter
 * - Navigation clarity
 * - Footer structure
 * - Mobile layout issues
 * - Hidden/weak content areas
 * - Decorative sections that reduce SEO clarity
 * - Areas where template structure hurts crawlability
 * 
 * Outputs a ThemeAnalysisReport with scores and actionable recommendations.
 */

import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface ThemeAnalysisInput {
  /** WordPress site URL */
  siteUrl: string;
  /** WP REST API credentials */
  username: string;
  appPassword: string;
  /** Active theme slug */
  themeSlug?: string;
  /** Primary target keyword */
  primaryKeyword?: string;
  /** Niche/category */
  niche?: string;
  /** Raw HTML of the homepage (if already fetched) */
  rawHtml?: string;
}

export interface HeadingIssue {
  level: string; // "h1", "h2", etc.
  text: string;
  issue: string; // "duplicate", "missing", "wrong_order", "generic", "keyword_missing"
  severity: "critical" | "warning" | "info";
}

export interface SectionAnalysis {
  name: string;
  type: "hero" | "content" | "cta" | "navigation" | "footer" | "sidebar" | "decorative" | "faq" | "testimonial" | "unknown";
  seoValue: "high" | "medium" | "low" | "negative";
  hasContent: boolean;
  hasHeading: boolean;
  headingLevel?: string;
  headingText?: string;
  wordCount: number;
  issues: string[];
  recommendation: string;
}

export interface NavigationAnalysis {
  hasMainNav: boolean;
  navItemCount: number;
  hasFooterNav: boolean;
  footerLinkCount: number;
  hasBreadcrumbs: boolean;
  hasSitemap: boolean;
  internalLinkCount: number;
  externalLinkCount: number;
  brokenLinks: string[];
  issues: string[];
}

export interface MobileAnalysis {
  hasViewportMeta: boolean;
  hasResponsiveDesign: boolean;
  hasMobileNav: boolean;
  hasLargeClickTargets: boolean;
  fontSizeReadable: boolean;
  issues: string[];
}

export interface SchemaAnalysis {
  existingSchemas: string[];
  missingSchemas: string[];
  schemaErrors: string[];
}

export interface ThemeAnalysisReport {
  /** Overall crawlability score (0-100) */
  crawlabilityScore: number;
  /** Overall SEO readiness score (0-100) */
  seoReadinessScore: number;
  /** Content structure score (0-100) */
  contentStructureScore: number;
  /** Mobile readiness score (0-100) */
  mobileScore: number;
  
  /** Theme metadata */
  themeName: string;
  themeSlug: string;
  
  /** Heading analysis */
  headings: {
    h1Count: number;
    h2Count: number;
    h3Count: number;
    h4Count: number;
    h5Count: number;
    h6Count: number;
    issues: HeadingIssue[];
    hierarchy: string[]; // ordered list of headings
  };
  
  /** Section-by-section analysis */
  sections: SectionAnalysis[];
  
  /** Navigation analysis */
  navigation: NavigationAnalysis;
  
  /** Mobile analysis */
  mobile: MobileAnalysis;
  
  /** Schema analysis */
  schema: SchemaAnalysis;
  
  /** Content metrics */
  contentMetrics: {
    totalWordCount: number;
    uniqueWordCount: number;
    keywordDensity: number;
    readabilityScore: number;
    contentToCodeRatio: number;
    imageCount: number;
    imagesWithAlt: number;
    imagesWithoutAlt: number;
  };
  
  /** Meta tags analysis */
  metaTags: {
    hasTitle: boolean;
    titleLength: number;
    titleText: string;
    hasMetaDescription: boolean;
    metaDescriptionLength: number;
    metaDescriptionText: string;
    hasCanonical: boolean;
    canonicalUrl: string;
    hasOgTags: boolean;
    hasTwitterCards: boolean;
    hasRobotsMeta: boolean;
    robotsContent: string;
  };
  
  /** Critical issues that MUST be fixed */
  criticalIssues: string[];
  /** Warnings that SHOULD be fixed */
  warnings: string[];
  /** Informational notes */
  infoNotes: string[];
  
  /** AI-generated rebuild recommendations */
  rebuildPlan: {
    sectionsToRemove: string[];
    sectionsToAdd: string[];
    sectionsToReorder: string[];
    headingChanges: { from: string; to: string; reason: string }[];
    contentGaps: string[];
    internalLinkingPlan: string[];
    schemaRecommendations: string[];
  };
  
  /** Raw data for before/after comparison */
  rawSnapshot: {
    html: string;
    headingsRaw: { level: string; text: string }[];
    sectionsRaw: string[];
    metaTagsRaw: Record<string, string>;
    timestamp: number;
  };
}

// ═══════════════════════════════════════════════
// HTML Fetcher
// ═══════════════════════════════════════════════

async function fetchHomepageHtml(siteUrl: string): Promise<string> {
  const url = siteUrl.endsWith("/") ? siteUrl : siteUrl + "/";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "th,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err: any) {
    // Fallback with normal user agent
    const res2 = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
    return await res2.text();
  }
}

// ═══════════════════════════════════════════════
// HTML Parsers (regex-based, no DOM dependency)
// ═══════════════════════════════════════════════

function extractHeadings(html: string): { level: string; text: string }[] {
  const headings: { level: string; text: string }[] = [];
  const regex = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = match[2]
      .replace(/<[^>]+>/g, "") // strip inner HTML tags
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      headings.push({ level: match[1].toLowerCase(), text });
    }
  }
  return headings;
}

function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  
  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) meta["title"] = titleMatch[1].trim();
  
  // Meta tags
  const metaRegex = /<meta\s+([^>]*?)>/gi;
  let match;
  while ((match = metaRegex.exec(html)) !== null) {
    const attrs = match[1];
    const nameMatch = attrs.match(/(?:name|property)=["']([^"']+)["']/i);
    const contentMatch = attrs.match(/content=["']([^"']*?)["']/i);
    if (nameMatch && contentMatch) {
      meta[nameMatch[1].toLowerCase()] = contentMatch[1];
    }
  }
  
  // Canonical
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  if (canonicalMatch) meta["canonical"] = canonicalMatch[1];
  
  // Robots
  const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i);
  if (robotsMatch) meta["robots"] = robotsMatch[1];
  
  return meta;
}

function extractImages(html: string): { src: string; alt: string; hasAlt: boolean }[] {
  const images: { src: string; alt: string; hasAlt: boolean }[] = [];
  const regex = /<img\s+([^>]*?)>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const attrs = match[1];
    const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
    const altMatch = attrs.match(/alt=["']([^"']*?)["']/i);
    if (srcMatch) {
      images.push({
        src: srcMatch[1],
        alt: altMatch ? altMatch[1] : "",
        hasAlt: !!altMatch && altMatch[1].trim().length > 0,
      });
    }
  }
  return images;
}

function extractLinks(html: string): { href: string; text: string; isInternal: boolean }[] {
  const links: { href: string; text: string; isInternal: boolean }[] = [];
  const regex = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const attrs = match[1];
    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
    if (hrefMatch) {
      const text = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const href = hrefMatch[1];
      const isInternal = href.startsWith("/") || href.startsWith("#") || !href.startsWith("http");
      links.push({ href, text, isInternal });
    }
  }
  return links;
}

function extractSchemaMarkup(html: string): string[] {
  const schemas: string[] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (data["@type"]) {
        schemas.push(Array.isArray(data["@type"]) ? data["@type"].join(", ") : data["@type"]);
      }
      if (data["@graph"]) {
        for (const item of data["@graph"]) {
          if (item["@type"]) {
            schemas.push(Array.isArray(item["@type"]) ? item["@type"].join(", ") : item["@type"]);
          }
        }
      }
    } catch {}
  }
  return schemas;
}

function countWords(html: string): { total: number; unique: number } {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(/\s+/).filter(w => w.length > 1);
  return { total: words.length, unique: new Set(words).size };
}

function calculateContentToCodeRatio(html: string): number {
  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (html.length === 0) return 0;
  return Math.round((textContent.length / html.length) * 100);
}

function detectSections(html: string): string[] {
  const sections: string[] = [];
  // Match semantic HTML5 sections
  const sectionRegex = /<(section|article|aside|nav|header|footer|main|div)\s+([^>]*?)>/gi;
  let match;
  while ((match = sectionRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const classMatch = attrs.match(/class=["']([^"']+)["']/i);
    const idMatch = attrs.match(/id=["']([^"']+)["']/i);
    const identifier = idMatch ? `#${idMatch[1]}` : classMatch ? `.${classMatch[1].split(/\s+/)[0]}` : "";
    sections.push(`<${tag}${identifier ? ` ${identifier}` : ""}>`);
  }
  return sections;
}

function hasViewportMeta(html: string): boolean {
  return /meta[^>]*name=["']viewport["']/i.test(html);
}

function hasResponsiveCSS(html: string): boolean {
  return /@media/i.test(html) || /responsive/i.test(html);
}

// ═══════════════════════════════════════════════
// Heading Analysis
// ═══════════════════════════════════════════════

function analyzeHeadings(headings: { level: string; text: string }[], primaryKeyword?: string): {
  h1Count: number;
  h2Count: number;
  h3Count: number;
  h4Count: number;
  h5Count: number;
  h6Count: number;
  issues: HeadingIssue[];
  hierarchy: string[];
} {
  const counts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  const issues: HeadingIssue[] = [];
  const hierarchy: string[] = [];
  
  for (const h of headings) {
    counts[h.level as keyof typeof counts]++;
    hierarchy.push(`${h.level}: ${h.text}`);
  }
  
  // Check H1
  if (counts.h1 === 0) {
    issues.push({ level: "h1", text: "", issue: "missing", severity: "critical" });
  } else if (counts.h1 > 1) {
    issues.push({ level: "h1", text: `${counts.h1} H1 tags found`, issue: "duplicate", severity: "critical" });
  }
  
  // Check H1 contains keyword
  if (primaryKeyword && counts.h1 > 0) {
    const h1Text = headings.find(h => h.level === "h1")?.text || "";
    if (!h1Text.toLowerCase().includes(primaryKeyword.toLowerCase())) {
      issues.push({ level: "h1", text: h1Text, issue: "keyword_missing", severity: "warning" });
    }
  }
  
  // Check heading order
  let lastLevel = 0;
  for (const h of headings) {
    const level = parseInt(h.level.replace("h", ""));
    if (level > lastLevel + 1 && lastLevel > 0) {
      issues.push({ level: h.level, text: h.text, issue: "wrong_order", severity: "warning" });
    }
    lastLevel = level;
  }
  
  // Check for generic headings
  const genericPatterns = [
    /^(welcome|home|page|section|block|widget|title|heading|header)$/i,
    /^(lorem ipsum|sample|test|placeholder|untitled)$/i,
    /^(click here|read more|learn more|see more)$/i,
  ];
  for (const h of headings) {
    for (const pattern of genericPatterns) {
      if (pattern.test(h.text.trim())) {
        issues.push({ level: h.level, text: h.text, issue: "generic", severity: "warning" });
        break;
      }
    }
  }
  
  // Check for duplicate headings
  const seen = new Set<string>();
  for (const h of headings) {
    const key = `${h.level}:${h.text.toLowerCase().trim()}`;
    if (seen.has(key)) {
      issues.push({ level: h.level, text: h.text, issue: "duplicate", severity: "warning" });
    }
    seen.add(key);
  }
  
  return {
    h1Count: counts.h1,
    h2Count: counts.h2,
    h3Count: counts.h3,
    h4Count: counts.h4,
    h5Count: counts.h5,
    h6Count: counts.h6,
    issues,
    hierarchy,
  };
}

// ═══════════════════════════════════════════════
// Section Classification (AI-powered)
// ═══════════════════════════════════════════════

async function classifySections(html: string, niche?: string): Promise<SectionAnalysis[]> {
  // Extract major sections from the HTML
  const sectionBlocks: string[] = [];
  
  // Split by major section markers
  const sectionRegex = /<(section|article|main|div)\s+[^>]*(?:class|id)=["'][^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;
  let match;
  const htmlCopy = html;
  while ((match = sectionRegex.exec(htmlCopy)) !== null) {
    if (match[0].length < 50000) { // Skip huge blocks
      sectionBlocks.push(match[0].slice(0, 2000)); // Truncate for LLM
    }
  }
  
  // If no sections found, split by heading
  if (sectionBlocks.length === 0) {
    const headingSplits = html.split(/<h[1-3][^>]*>/i);
    for (let i = 1; i < headingSplits.length && i <= 15; i++) {
      sectionBlocks.push(headingSplits[i].slice(0, 1500));
    }
  }
  
  if (sectionBlocks.length === 0) {
    return [{
      name: "Full Page",
      type: "unknown",
      seoValue: "low",
      hasContent: true,
      hasHeading: false,
      wordCount: countWords(html).total,
      issues: ["Cannot detect distinct sections — page lacks semantic structure"],
      recommendation: "Rebuild with clear <section> elements and semantic headings",
    }];
  }
  
  // Use AI to classify sections
  try {
    const sectionSummaries = sectionBlocks.slice(0, 12).map((block, i) => {
      const headings = extractHeadings(block);
      const words = countWords(block);
      const links = extractLinks(block);
      return `Section ${i + 1}:\nHeadings: ${headings.map(h => `${h.level}: ${h.text}`).join(", ") || "none"}\nWord count: ${words.total}\nLinks: ${links.length} (${links.filter(l => l.isInternal).length} internal)\nHTML preview: ${block.slice(0, 500)}`;
    }).join("\n\n---\n\n");
    
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an SEO expert analyzing website sections. For each section, classify its type, SEO value, and provide recommendations. Respond in JSON format.
          
Niche: ${niche || "gambling/casino"}

Section types: hero, content, cta, navigation, footer, sidebar, decorative, faq, testimonial, unknown
SEO value: high (core content, keyword-rich), medium (supporting content), low (minimal SEO value), negative (hurts SEO - cluttered, distracting)`,
        },
        {
          role: "user",
          content: `Analyze these ${sectionBlocks.length} sections from a ${niche || "gambling"} website:\n\n${sectionSummaries}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "section_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    type: { type: "string" },
                    seoValue: { type: "string" },
                    issues: { type: "array", items: { type: "string" } },
                    recommendation: { type: "string" },
                  },
                  required: ["name", "type", "seoValue", "issues", "recommendation"],
                  additionalProperties: false,
                },
              },
            },
            required: ["sections"],
            additionalProperties: false,
          },
        },
      },
    });
    
    const parsed = JSON.parse(String(response.choices[0].message.content) || "{}");
    return (parsed.sections || []).map((s: any, i: number) => {
      const block = sectionBlocks[i] || "";
      const headings = extractHeadings(block);
      const words = countWords(block);
      return {
        name: s.name || `Section ${i + 1}`,
        type: s.type || "unknown",
        seoValue: s.seoValue || "low",
        hasContent: words.total > 20,
        hasHeading: headings.length > 0,
        headingLevel: headings[0]?.level,
        headingText: headings[0]?.text,
        wordCount: words.total,
        issues: s.issues || [],
        recommendation: s.recommendation || "",
      } as SectionAnalysis;
    });
  } catch (err: any) {
    console.error(`[SEO-Analyzer] Section classification failed: ${err.message}`);
    // Fallback: basic classification
    return sectionBlocks.slice(0, 12).map((block, i) => {
      const headings = extractHeadings(block);
      const words = countWords(block);
      return {
        name: `Section ${i + 1}`,
        type: "unknown" as const,
        seoValue: words.total > 100 ? "medium" as const : "low" as const,
        hasContent: words.total > 20,
        hasHeading: headings.length > 0,
        headingLevel: headings[0]?.level,
        headingText: headings[0]?.text,
        wordCount: words.total,
        issues: [],
        recommendation: "Manual review needed",
      };
    });
  }
}

// ═══════════════════════════════════════════════
// AI Rebuild Plan Generator
// ═══════════════════════════════════════════════

async function generateRebuildPlan(
  report: Partial<ThemeAnalysisReport>,
  primaryKeyword?: string,
  niche?: string,
): Promise<ThemeAnalysisReport["rebuildPlan"]> {
  try {
    const summary = `
Theme: ${report.themeName} (${report.themeSlug})
Crawlability Score: ${report.crawlabilityScore}/100
SEO Readiness: ${report.seoReadinessScore}/100
Content Structure: ${report.contentStructureScore}/100

Headings: H1=${report.headings?.h1Count}, H2=${report.headings?.h2Count}, H3=${report.headings?.h3Count}
Heading Issues: ${report.headings?.issues.map(i => `${i.level}: ${i.issue} - "${i.text}"`).join("; ") || "none"}

Sections: ${report.sections?.map(s => `${s.name} (${s.type}, SEO: ${s.seoValue})`).join("; ") || "none"}
Section Issues: ${report.sections?.flatMap(s => s.issues).join("; ") || "none"}

Critical Issues: ${report.criticalIssues?.join("; ") || "none"}
Warnings: ${report.warnings?.join("; ") || "none"}

Content: ${report.contentMetrics?.totalWordCount} words, ${report.contentMetrics?.contentToCodeRatio}% content-to-code ratio
Images: ${report.contentMetrics?.imageCount} total, ${report.contentMetrics?.imagesWithoutAlt} missing alt
Internal Links: ${report.navigation?.internalLinkCount}
Schemas: ${report.schema?.existingSchemas.join(", ") || "none"}
Missing Schemas: ${report.schema?.missingSchemas.join(", ") || "none"}
    `.trim();

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an SEO architect. Based on the theme analysis, generate a concrete rebuild plan to maximize Googlebot crawlability and ranking potential.

Target niche: ${niche || "online gambling (casino/slots/lottery/baccarat)"}
Primary keyword: ${primaryKeyword || "N/A"}
Language: Thai

The rebuild plan must prioritize:
1. Clear semantic structure for Googlebot
2. Strong heading hierarchy with keywords
3. Topical relevance and keyword coverage
4. Clean internal linking
5. Minimal structural clutter
6. Schema markup completeness

Respond in JSON format.`,
        },
        {
          role: "user",
          content: `Generate a rebuild plan based on this analysis:\n\n${summary}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "rebuild_plan",
          strict: true,
          schema: {
            type: "object",
            properties: {
              sectionsToRemove: { type: "array", items: { type: "string" } },
              sectionsToAdd: { type: "array", items: { type: "string" } },
              sectionsToReorder: { type: "array", items: { type: "string" } },
              headingChanges: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["from", "to", "reason"],
                  additionalProperties: false,
                },
              },
              contentGaps: { type: "array", items: { type: "string" } },
              internalLinkingPlan: { type: "array", items: { type: "string" } },
              schemaRecommendations: { type: "array", items: { type: "string" } },
            },
            required: ["sectionsToRemove", "sectionsToAdd", "sectionsToReorder", "headingChanges", "contentGaps", "internalLinkingPlan", "schemaRecommendations"],
            additionalProperties: false,
          },
        },
      },
    });

       return JSON.parse(String(response.choices[0].message.content) || "{}");
  } catch (err: any) {
    console.error(`[SEO-Analyzer] Rebuild plan generation failed: ${err.message}`);
    return {
      sectionsToRemove: [],
      sectionsToAdd: ["Hero with primary keyword", "Benefits/Services section", "FAQ section", "Structured footer"],
      sectionsToReorder: [],
      headingChanges: [],
      contentGaps: ["Missing primary keyword in H1", "No FAQ section", "Weak internal linking"],
      internalLinkingPlan: ["Add links from homepage to key service pages", "Add footer navigation links"],
      schemaRecommendations: ["Add GamblingService schema", "Add FAQPage schema", "Add BreadcrumbList schema"],
    };
  }
}

// ═══════════════════════════════════════════════
// Score Calculators
// ═══════════════════════════════════════════════

function calculateCrawlabilityScore(report: Partial<ThemeAnalysisReport>): number {
  let score = 100;
  
  // Heading issues (-5 each critical, -2 each warning)
  for (const issue of report.headings?.issues || []) {
    score -= issue.severity === "critical" ? 10 : issue.severity === "warning" ? 3 : 1;
  }
  
  // Missing H1 is critical
  if (report.headings?.h1Count === 0) score -= 15;
  if ((report.headings?.h1Count || 0) > 1) score -= 10;
  
  // Meta tags
  if (!report.metaTags?.hasTitle) score -= 10;
  if (!report.metaTags?.hasMetaDescription) score -= 8;
  if (!report.metaTags?.hasCanonical) score -= 5;
  
  // Content-to-code ratio
  const ratio = report.contentMetrics?.contentToCodeRatio || 0;
  if (ratio < 10) score -= 15;
  else if (ratio < 20) score -= 8;
  else if (ratio < 30) score -= 3;
  
  // Mobile
  if (!report.mobile?.hasViewportMeta) score -= 10;
  
  // Schema
  if ((report.schema?.existingSchemas.length || 0) === 0) score -= 8;
  
  // Navigation
  if (!report.navigation?.hasMainNav) score -= 5;
  if ((report.navigation?.internalLinkCount || 0) < 3) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

function calculateSeoReadinessScore(report: Partial<ThemeAnalysisReport>): number {
  let score = 100;
  
  // Title optimization
  if (!report.metaTags?.hasTitle) score -= 12;
  else if ((report.metaTags?.titleLength || 0) < 30 || (report.metaTags?.titleLength || 0) > 65) score -= 5;
  
  // Meta description
  if (!report.metaTags?.hasMetaDescription) score -= 10;
  else if ((report.metaTags?.metaDescriptionLength || 0) < 120 || (report.metaTags?.metaDescriptionLength || 0) > 160) score -= 4;
  
  // Heading structure
  if (report.headings?.h1Count !== 1) score -= 10;
  if ((report.headings?.h2Count || 0) < 2) score -= 5;
  
  // Content
  if ((report.contentMetrics?.totalWordCount || 0) < 300) score -= 15;
  else if ((report.contentMetrics?.totalWordCount || 0) < 1000) score -= 8;
  
  // Images
  if ((report.contentMetrics?.imagesWithoutAlt || 0) > 0) {
    score -= Math.min(10, (report.contentMetrics?.imagesWithoutAlt || 0) * 2);
  }
  
  // Schema
  const requiredSchemas = ["WebSite", "Organization", "GamblingService", "FAQPage", "BreadcrumbList"];
  const existing = report.schema?.existingSchemas || [];
  const missing = requiredSchemas.filter(s => !existing.some(e => e.includes(s)));
  score -= missing.length * 3;
  
  // Internal linking
  if ((report.navigation?.internalLinkCount || 0) < 5) score -= 8;
  
  // OG tags
  if (!report.metaTags?.hasOgTags) score -= 3;
  
  return Math.max(0, Math.min(100, score));
}

function calculateContentStructureScore(report: Partial<ThemeAnalysisReport>): number {
  let score = 100;
  
  // Sections with negative SEO value
  const negativeSections = (report.sections || []).filter(s => s.seoValue === "negative");
  score -= negativeSections.length * 8;
  
  // Sections without headings
  const noHeadingSections = (report.sections || []).filter(s => !s.hasHeading && s.type !== "navigation" && s.type !== "footer");
  score -= noHeadingSections.length * 4;
  
  // Decorative sections
  const decorativeSections = (report.sections || []).filter(s => s.type === "decorative");
  score -= decorativeSections.length * 6;
  
  // Low content sections
  const lowContentSections = (report.sections || []).filter(s => s.wordCount < 20 && s.type === "content");
  score -= lowContentSections.length * 5;
  
  // Missing key sections
  const types = new Set((report.sections || []).map(s => s.type));
  if (!types.has("hero")) score -= 8;
  if (!types.has("faq")) score -= 8;
  if (!types.has("content")) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

function calculateMobileScore(report: Partial<ThemeAnalysisReport>): number {
  let score = 100;
  
  if (!report.mobile?.hasViewportMeta) score -= 25;
  if (!report.mobile?.hasResponsiveDesign) score -= 20;
  if (!report.mobile?.hasMobileNav) score -= 10;
  if (!report.mobile?.hasLargeClickTargets) score -= 10;
  if (!report.mobile?.fontSizeReadable) score -= 10;
  
  for (const issue of report.mobile?.issues || []) {
    score -= 5;
  }
  
  return Math.max(0, Math.min(100, score));
}

// ═══════════════════════════════════════════════
// Main Analysis Function
// ═══════════════════════════════════════════════

export async function analyzeInstalledTheme(input: ThemeAnalysisInput): Promise<ThemeAnalysisReport> {
  console.log(`[SEO-Analyzer] 🔍 Starting theme analysis for ${input.siteUrl}`);
  
  // 1. Fetch homepage HTML
  const html = input.rawHtml || await fetchHomepageHtml(input.siteUrl);
  console.log(`[SEO-Analyzer] Fetched ${html.length} bytes of HTML`);
  
  // 2. Extract data
  const headingsRaw = extractHeadings(html);
  const metaTagsRaw = extractMetaTags(html);
  const images = extractImages(html);
  const links = extractLinks(html);
  const schemas = extractSchemaMarkup(html);
  const words = countWords(html);
  const contentToCodeRatio = calculateContentToCodeRatio(html);
  const sectionsRaw = detectSections(html);
  
  // 3. Analyze headings
  const headings = analyzeHeadings(headingsRaw, input.primaryKeyword);
  
  // 4. Classify sections (AI-powered)
  const sections = await classifySections(html, input.niche);
  
  // 5. Navigation analysis
  const internalLinks = links.filter(l => l.isInternal);
  const externalLinks = links.filter(l => !l.isInternal);
  const navigation: NavigationAnalysis = {
    hasMainNav: /<nav/i.test(html),
    navItemCount: (html.match(/<nav[\s\S]*?<\/nav>/i)?.[0] || "").split(/<a\s/gi).length - 1,
    hasFooterNav: /<footer[\s\S]*?<a\s/i.test(html),
    footerLinkCount: (html.match(/<footer[\s\S]*?<\/footer>/i)?.[0] || "").split(/<a\s/gi).length - 1,
    hasBreadcrumbs: /breadcrumb/i.test(html),
    hasSitemap: /sitemap/i.test(html),
    internalLinkCount: internalLinks.length,
    externalLinkCount: externalLinks.length,
    brokenLinks: [],
    issues: [],
  };
  
  if (!navigation.hasMainNav) navigation.issues.push("No <nav> element found");
  if (navigation.internalLinkCount < 3) navigation.issues.push("Too few internal links (< 3)");
  if (!navigation.hasBreadcrumbs) navigation.issues.push("No breadcrumb navigation detected");
  if (!navigation.hasFooterNav) navigation.issues.push("No footer navigation links");
  
  // 6. Mobile analysis
  const mobile: MobileAnalysis = {
    hasViewportMeta: hasViewportMeta(html),
    hasResponsiveDesign: hasResponsiveCSS(html),
    hasMobileNav: /mobile-nav|hamburger|toggle-menu|menu-toggle/i.test(html),
    hasLargeClickTargets: true, // assume true unless detected otherwise
    fontSizeReadable: !/font-size:\s*(8|9|10)px/i.test(html),
    issues: [],
  };
  
  if (!mobile.hasViewportMeta) mobile.issues.push("Missing viewport meta tag");
  if (!mobile.hasResponsiveDesign) mobile.issues.push("No responsive CSS detected");
  if (!mobile.hasMobileNav) mobile.issues.push("No mobile navigation pattern detected");
  
  // 7. Schema analysis
  const requiredSchemas = ["WebSite", "Organization", "GamblingService", "FAQPage", "BreadcrumbList"];
  const missingSchemas = requiredSchemas.filter(s => !schemas.some(e => e.includes(s)));
  const schema: SchemaAnalysis = {
    existingSchemas: schemas,
    missingSchemas,
    schemaErrors: [],
  };
  
  // 8. Meta tags analysis
  const titleText = metaTagsRaw["title"] || "";
  const metaDesc = metaTagsRaw["description"] || "";
  const metaTags = {
    hasTitle: !!titleText,
    titleLength: titleText.length,
    titleText,
    hasMetaDescription: !!metaDesc,
    metaDescriptionLength: metaDesc.length,
    metaDescriptionText: metaDesc,
    hasCanonical: !!metaTagsRaw["canonical"],
    canonicalUrl: metaTagsRaw["canonical"] || "",
    hasOgTags: !!metaTagsRaw["og:title"] || !!metaTagsRaw["og:description"],
    hasTwitterCards: !!metaTagsRaw["twitter:card"],
    hasRobotsMeta: !!metaTagsRaw["robots"],
    robotsContent: metaTagsRaw["robots"] || "",
  };
  
  // 9. Content metrics
  const contentMetrics = {
    totalWordCount: words.total,
    uniqueWordCount: words.unique,
    keywordDensity: 0,
    readabilityScore: 0,
    contentToCodeRatio,
    imageCount: images.length,
    imagesWithAlt: images.filter(i => i.hasAlt).length,
    imagesWithoutAlt: images.filter(i => !i.hasAlt).length,
  };
  
  // Calculate keyword density if keyword provided
  if (input.primaryKeyword) {
    const text = html.replace(/<[^>]+>/g, " ").toLowerCase();
    const kwLower = input.primaryKeyword.toLowerCase();
    const kwCount = (text.match(new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    contentMetrics.keywordDensity = words.total > 0 ? Math.round((kwCount / words.total) * 10000) / 100 : 0;
  }
  
  // 10. Build partial report for scoring
  const partialReport: Partial<ThemeAnalysisReport> = {
    themeName: input.themeSlug || "unknown",
    themeSlug: input.themeSlug || "unknown",
    headings,
    sections,
    navigation,
    mobile,
    schema,
    metaTags,
    contentMetrics,
  };
  
  // 11. Calculate scores
  const crawlabilityScore = calculateCrawlabilityScore(partialReport);
  const seoReadinessScore = calculateSeoReadinessScore(partialReport);
  const contentStructureScore = calculateContentStructureScore(partialReport);
  const mobileScore = calculateMobileScore(partialReport);
  
  // 12. Collect issues
  const criticalIssues: string[] = [];
  const warnings: string[] = [];
  const infoNotes: string[] = [];
  
  // Heading issues
  for (const issue of headings.issues) {
    if (issue.severity === "critical") criticalIssues.push(`${issue.level}: ${issue.issue} — "${issue.text}"`);
    else if (issue.severity === "warning") warnings.push(`${issue.level}: ${issue.issue} — "${issue.text}"`);
    else infoNotes.push(`${issue.level}: ${issue.issue} — "${issue.text}"`);
  }
  
  // Meta issues
  if (!metaTags.hasTitle) criticalIssues.push("Missing <title> tag");
  if (!metaTags.hasMetaDescription) criticalIssues.push("Missing meta description");
  if (metaTags.titleLength > 65) warnings.push(`Title too long (${metaTags.titleLength} chars, max 65)`);
  if (metaTags.titleLength < 30 && metaTags.hasTitle) warnings.push(`Title too short (${metaTags.titleLength} chars, min 30)`);
  if (!metaTags.hasCanonical) warnings.push("Missing canonical URL");
  if (!metaTags.hasOgTags) warnings.push("Missing Open Graph tags");
  
  // Content issues
  if (contentMetrics.totalWordCount < 300) criticalIssues.push(`Very low word count: ${contentMetrics.totalWordCount} (min 300)`);
  else if (contentMetrics.totalWordCount < 1000) warnings.push(`Low word count: ${contentMetrics.totalWordCount} (recommended 1000+)`);
  if (contentMetrics.contentToCodeRatio < 15) warnings.push(`Low content-to-code ratio: ${contentMetrics.contentToCodeRatio}%`);
  if (contentMetrics.imagesWithoutAlt > 0) warnings.push(`${contentMetrics.imagesWithoutAlt} images missing alt text`);
  
  // Navigation issues
  for (const issue of navigation.issues) warnings.push(`Navigation: ${issue}`);
  
  // Mobile issues
  for (const issue of mobile.issues) {
    if (issue.includes("viewport")) criticalIssues.push(`Mobile: ${issue}`);
    else warnings.push(`Mobile: ${issue}`);
  }
  
  // Schema issues
  if (missingSchemas.length > 0) warnings.push(`Missing schemas: ${missingSchemas.join(", ")}`);
  
  // Section issues
  const negativeSections = sections.filter(s => s.seoValue === "negative");
  if (negativeSections.length > 0) {
    warnings.push(`${negativeSections.length} sections with negative SEO value: ${negativeSections.map(s => s.name).join(", ")}`);
  }
  
  // 13. Generate AI rebuild plan
  const fullPartialReport = {
    ...partialReport,
    crawlabilityScore,
    seoReadinessScore,
    contentStructureScore,
    mobileScore,
    criticalIssues,
    warnings,
    infoNotes,
  };
  
  const rebuildPlan = await generateRebuildPlan(fullPartialReport, input.primaryKeyword, input.niche);
  
  console.log(`[SEO-Analyzer] ✅ Analysis complete — Crawlability: ${crawlabilityScore}/100, SEO: ${seoReadinessScore}/100, Structure: ${contentStructureScore}/100, Mobile: ${mobileScore}/100`);
  console.log(`[SEO-Analyzer] Critical: ${criticalIssues.length}, Warnings: ${warnings.length}, Info: ${infoNotes.length}`);
  
  return {
    crawlabilityScore,
    seoReadinessScore,
    contentStructureScore,
    mobileScore,
    themeName: input.themeSlug || "unknown",
    themeSlug: input.themeSlug || "unknown",
    headings,
    sections,
    navigation,
    mobile,
    schema,
    contentMetrics,
    metaTags,
    criticalIssues,
    warnings,
    infoNotes,
    rebuildPlan,
    rawSnapshot: {
      html,
      headingsRaw,
      sectionsRaw,
      metaTagsRaw,
      timestamp: Date.now(),
    },
  };
}

// ═══════════════════════════════════════════════
// Quick Analysis (lightweight, no AI calls)
// ═══════════════════════════════════════════════

export function quickAnalyzeHtml(html: string, primaryKeyword?: string): Omit<ThemeAnalysisReport, "sections" | "rebuildPlan" | "rawSnapshot"> {
  const headingsRaw = extractHeadings(html);
  const metaTagsRaw = extractMetaTags(html);
  const images = extractImages(html);
  const links = extractLinks(html);
  const schemas = extractSchemaMarkup(html);
  const words = countWords(html);
  const contentToCodeRatio = calculateContentToCodeRatio(html);
  
  const headings = analyzeHeadings(headingsRaw, primaryKeyword);
  
  const internalLinks = links.filter(l => l.isInternal);
  const externalLinks = links.filter(l => !l.isInternal);
  
  const navigation: NavigationAnalysis = {
    hasMainNav: /<nav/i.test(html),
    navItemCount: 0,
    hasFooterNav: /<footer[\s\S]*?<a\s/i.test(html),
    footerLinkCount: 0,
    hasBreadcrumbs: /breadcrumb/i.test(html),
    hasSitemap: /sitemap/i.test(html),
    internalLinkCount: internalLinks.length,
    externalLinkCount: externalLinks.length,
    brokenLinks: [],
    issues: [],
  };
  
  const mobile: MobileAnalysis = {
    hasViewportMeta: hasViewportMeta(html),
    hasResponsiveDesign: hasResponsiveCSS(html),
    hasMobileNav: /mobile-nav|hamburger/i.test(html),
    hasLargeClickTargets: true,
    fontSizeReadable: true,
    issues: [],
  };
  
  const requiredSchemas = ["WebSite", "Organization", "GamblingService", "FAQPage", "BreadcrumbList"];
  const missingSchemas = requiredSchemas.filter(s => !schemas.some(e => e.includes(s)));
  const schema: SchemaAnalysis = {
    existingSchemas: schemas,
    missingSchemas,
    schemaErrors: [],
  };
  
  const titleText = metaTagsRaw["title"] || "";
  const metaDesc = metaTagsRaw["description"] || "";
  const metaTags = {
    hasTitle: !!titleText,
    titleLength: titleText.length,
    titleText,
    hasMetaDescription: !!metaDesc,
    metaDescriptionLength: metaDesc.length,
    metaDescriptionText: metaDesc,
    hasCanonical: !!metaTagsRaw["canonical"],
    canonicalUrl: metaTagsRaw["canonical"] || "",
    hasOgTags: !!metaTagsRaw["og:title"],
    hasTwitterCards: !!metaTagsRaw["twitter:card"],
    hasRobotsMeta: !!metaTagsRaw["robots"],
    robotsContent: metaTagsRaw["robots"] || "",
  };
  
  const contentMetrics = {
    totalWordCount: words.total,
    uniqueWordCount: words.unique,
    keywordDensity: 0,
    readabilityScore: 0,
    contentToCodeRatio,
    imageCount: images.length,
    imagesWithAlt: images.filter(i => i.hasAlt).length,
    imagesWithoutAlt: images.filter(i => !i.hasAlt).length,
  };
  
  const partialReport = { headings, navigation, mobile, schema, metaTags, contentMetrics };
  
  return {
    crawlabilityScore: calculateCrawlabilityScore(partialReport),
    seoReadinessScore: calculateSeoReadinessScore(partialReport),
    contentStructureScore: 50, // can't calculate without section classification
    mobileScore: calculateMobileScore(partialReport),
    themeName: "unknown",
    themeSlug: "unknown",
    headings,
    navigation,
    mobile,
    schema,
    contentMetrics,
    metaTags,
    criticalIssues: [],
    warnings: [],
    infoNotes: [],
  };
}
