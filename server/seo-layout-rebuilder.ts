/**
 * SEO Layout Rebuilder
 * 
 * Takes a ThemeAnalysisReport and rebuilds the WordPress homepage
 * with a Googlebot-first structure:
 * 
 * 1. Simplify content hierarchy — remove decorative/noisy sections
 * 2. Create clear semantic sections (Hero, Benefits, Services, FAQ, CTA, Footer)
 * 3. Adjust headings to reflect page intent with keyword placement
 * 4. Reorder sections by search intent priority
 * 5. Generate WordPress-compatible HTML for the rebuilt homepage
 */

import { invokeLLM } from "./_core/llm";
import type { ThemeAnalysisReport, SectionAnalysis } from "./seo-theme-analyzer";

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface LayoutRebuildInput {
  /** Domain URL */
  siteUrl: string;
  /** WP credentials */
  username: string;
  appPassword: string;
  /** Theme analysis report */
  analysisReport: ThemeAnalysisReport;
  /** Primary keyword */
  primaryKeyword: string;
  /** Secondary keywords */
  secondaryKeywords?: string[];
  /** Niche */
  niche?: string;
  /** Brand name */
  brandName?: string;
  /** Language (default: "th") */
  language?: string;
  /** Mode: safe (minimal changes), semi (moderate), full (aggressive rebuild) */
  mode?: "safe" | "semi" | "full";
}

export interface SeoSection {
  /** Section ID */
  id: string;
  /** Section type */
  type: "hero" | "about" | "services" | "benefits" | "features" | "games" | "promotions" | "how_to" | "faq" | "testimonials" | "cta" | "trust" | "footer_content";
  /** Section heading (H2 or H1 for hero) */
  heading: string;
  /** Heading level */
  headingLevel: "h1" | "h2" | "h3";
  /** Section content (HTML) */
  contentHtml: string;
  /** Keywords targeted in this section */
  targetKeywords: string[];
  /** Internal links in this section */
  internalLinks: { text: string; url: string }[];
  /** Schema type for this section */
  schemaType?: string;
  /** SEO priority (1 = highest) */
  priority: number;
  /** Word count */
  wordCount: number;
}

export interface LayoutRebuildResult {
  /** Full rebuilt homepage HTML */
  fullHtml: string;
  /** Individual sections */
  sections: SeoSection[];
  /** Changes made summary */
  changeLog: LayoutChange[];
  /** Before/after comparison data */
  comparison: {
    before: {
      sectionCount: number;
      wordCount: number;
      headingCount: number;
      crawlabilityScore: number;
      seoReadinessScore: number;
    };
    after: {
      sectionCount: number;
      wordCount: number;
      headingCount: number;
      estimatedCrawlabilityScore: number;
      estimatedSeoReadinessScore: number;
    };
  };
  /** Metadata */
  meta: {
    title: string;
    description: string;
    h1: string;
    canonicalUrl: string;
    ogTitle: string;
    ogDescription: string;
  };
}

export interface LayoutChange {
  type: "added" | "removed" | "modified" | "reordered";
  section: string;
  description: string;
  reason: string;
}

// ═══════════════════════════════════════════════
// Section Templates
// ═══════════════════════════════════════════════

/** Ideal section order for gambling/casino niche */
const GAMBLING_SECTION_ORDER: SeoSection["type"][] = [
  "hero",
  "services",      // Main services/games overview
  "benefits",      // Why choose us
  "games",         // Game categories
  "promotions",    // Current promotions
  "how_to",        // How to play/register
  "trust",         // Trust signals (licenses, security)
  "faq",           // FAQ section
  "testimonials",  // User reviews
  "cta",           // Final CTA
  "footer_content", // SEO footer content
];

/** Generic section order for other niches */
const GENERIC_SECTION_ORDER: SeoSection["type"][] = [
  "hero",
  "about",
  "services",
  "benefits",
  "features",
  "how_to",
  "faq",
  "testimonials",
  "trust",
  "cta",
  "footer_content",
];

function getSectionOrder(niche?: string): SeoSection["type"][] {
  const gamblingNiches = ["gambling", "casino", "slots", "lottery", "baccarat", "poker", "betting", "สล็อต", "คาสิโน", "บาคาร่า", "หวย", "พนัน"];
  if (niche && gamblingNiches.some(n => niche.toLowerCase().includes(n))) {
    return GAMBLING_SECTION_ORDER;
  }
  return GENERIC_SECTION_ORDER;
}

// ═══════════════════════════════════════════════
// AI Section Content Generator
// ═══════════════════════════════════════════════

async function generateSectionContent(
  sectionType: SeoSection["type"],
  config: {
    primaryKeyword: string;
    secondaryKeywords: string[];
    brandName: string;
    niche: string;
    language: string;
    existingContent?: string;
    mode: "safe" | "semi" | "full";
  },
): Promise<{ heading: string; contentHtml: string; internalLinks: { text: string; url: string }[] }> {
  const sectionPrompts: Record<SeoSection["type"], string> = {
    hero: `Create a hero section for a ${config.niche} website. The H1 heading MUST contain the primary keyword "${config.primaryKeyword}". Include a compelling subtitle and a brief intro paragraph (2-3 sentences). Brand: ${config.brandName}. The content should immediately communicate what the site offers and why users should stay.`,
    
    about: `Create an "About" section (H2) for ${config.brandName}. Focus on credibility, experience, and what makes this ${config.niche} brand unique. Include the keyword "${config.primaryKeyword}" naturally. 150-250 words.`,
    
    services: `Create a "Services/Products" section (H2) for a ${config.niche} website. List 4-6 main services/products with brief descriptions. Each should naturally include relevant keywords from: ${config.secondaryKeywords.join(", ")}. Use H3 for each service.`,
    
    benefits: `Create a "Why Choose Us" / "Benefits" section (H2) for ${config.brandName} (${config.niche}). List 4-6 key benefits with icons/emoji and brief descriptions. Focus on trust, value, and unique selling points. Include "${config.primaryKeyword}" naturally.`,
    
    features: `Create a "Features" section (H2) highlighting key features of ${config.brandName}. Include 4-6 features with H3 sub-headings. Each feature should be 2-3 sentences. Include keywords naturally.`,
    
    games: `Create a "Games/Categories" section (H2) for a ${config.niche} website. List 4-8 game categories (e.g., slots, baccarat, poker, lottery, sports betting) with brief descriptions. Use H3 for each category. Include relevant keywords.`,
    
    promotions: `Create a "Promotions" section (H2) for a ${config.niche} website. Include 3-4 promotional offers (welcome bonus, deposit bonus, cashback, etc.) with brief descriptions. Make it compelling but not spammy.`,
    
    how_to: `Create a "How to Get Started" / "วิธีสมัคร" section (H2) for ${config.brandName}. Include 3-5 clear steps with H3 sub-headings. Make it simple and actionable. Include "${config.primaryKeyword}" naturally.`,
    
    faq: `Create a FAQ section (H2) with 5-8 frequently asked questions about ${config.niche}. Each Q should be an H3. Answers should be 2-4 sentences each. Include "${config.primaryKeyword}" and related keywords naturally. Questions should match real search queries.`,
    
    testimonials: `Create a "Reviews/Testimonials" section (H2) with 3-4 user testimonials for a ${config.niche} website. Each should include a name, rating, and 2-3 sentence review. Make them realistic and varied.`,
    
    trust: `Create a "Trust & Security" section (H2) for a ${config.niche} website. Include licensing info, security measures, responsible gaming, payment methods. 150-200 words. Build confidence and authority.`,
    
    cta: `Create a final CTA section (H2) for ${config.brandName}. Include a compelling headline, brief text (2-3 sentences), and a clear call-to-action. Include "${config.primaryKeyword}" naturally.`,
    
    footer_content: `Create SEO footer content for a ${config.niche} website. Include a brief site description (3-4 sentences), important links placeholder, and a disclaimer. Include "${config.primaryKeyword}" naturally. This is for crawlability, not visual prominence.`,
  };

  const prompt = sectionPrompts[sectionType] || `Create content for a "${sectionType}" section for ${config.brandName} (${config.niche}).`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert SEO content writer specializing in ${config.niche} websites. Write in ${config.language === "th" ? "Thai" : "English"}.

Rules:
- Write clean, semantic HTML (no inline styles, no classes)
- Use proper heading hierarchy (H1 for hero only, H2 for section titles, H3 for sub-items)
- Include the primary keyword "${config.primaryKeyword}" naturally (1-2 times per section)
- Include secondary keywords where natural: ${config.secondaryKeywords.slice(0, 5).join(", ")}
- Write for humans first, search engines second
- NO keyword stuffing
- NO placeholder text
- Content must be factual and useful
- Use <strong> for important terms (1-2 per section)
- Include internal link placeholders as <a href="/[slug]">[anchor text]</a>

${config.mode === "safe" ? "Minimal changes — keep existing content structure where possible." : ""}
${config.mode === "full" ? "Full rebuild — create the best possible SEO content from scratch." : ""}

Respond in JSON format with heading, contentHtml, and internalLinks.`,
        },
        {
          role: "user",
          content: `${prompt}${config.existingContent ? `\n\nExisting content to improve:\n${config.existingContent.slice(0, 1000)}` : ""}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "section_content",
          strict: true,
          schema: {
            type: "object",
            properties: {
              heading: { type: "string", description: "Section heading text (without HTML tags)" },
              contentHtml: { type: "string", description: "Section content as clean semantic HTML" },
              internalLinks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    url: { type: "string" },
                  },
                  required: ["text", "url"],
                  additionalProperties: false,
                },
              },
            },
            required: ["heading", "contentHtml", "internalLinks"],
            additionalProperties: false,
          },
        },
      },
    });

    return JSON.parse(String(response.choices[0].message.content) || "{}");
  } catch (err: any) {
    console.error(`[SEO-Rebuilder] Content generation failed for ${sectionType}: ${err.message}`);
    return {
      heading: sectionType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      contentHtml: `<p>${config.brandName} — ${config.primaryKeyword}</p>`,
      internalLinks: [],
    };
  }
}

// ═══════════════════════════════════════════════
// Meta Tag Generator
// ═══════════════════════════════════════════════

async function generateMetaTags(config: {
  primaryKeyword: string;
  secondaryKeywords: string[];
  brandName: string;
  niche: string;
  siteUrl: string;
  language: string;
}): Promise<LayoutRebuildResult["meta"]> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an SEO expert. Generate optimized meta tags for a ${config.niche} website. Language: ${config.language === "th" ? "Thai" : "English"}.

Rules:
- Title: 50-60 chars, include primary keyword near the start, include brand name
- Description: 140-155 chars, include primary keyword, compelling CTA
- H1: Match the hero heading, include primary keyword
- OG title: Can be slightly different from title tag
- OG description: Can be slightly different from meta description

Respond in JSON.`,
        },
        {
          role: "user",
          content: `Brand: ${config.brandName}\nPrimary keyword: ${config.primaryKeyword}\nSecondary: ${config.secondaryKeywords.slice(0, 3).join(", ")}\nURL: ${config.siteUrl}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "meta_tags",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              h1: { type: "string" },
              ogTitle: { type: "string" },
              ogDescription: { type: "string" },
            },
            required: ["title", "description", "h1", "ogTitle", "ogDescription"],
            additionalProperties: false,
          },
        },
      },
    });

    const meta = JSON.parse(String(response.choices[0].message.content) || "{}");
    return {
      title: meta.title || `${config.primaryKeyword} | ${config.brandName}`,
      description: meta.description || `${config.brandName} - ${config.primaryKeyword}`,
      h1: meta.h1 || config.primaryKeyword,
      canonicalUrl: config.siteUrl.replace(/\/$/, ""),
      ogTitle: meta.ogTitle || meta.title,
      ogDescription: meta.ogDescription || meta.description,
    };
  } catch (err: any) {
    console.error(`[SEO-Rebuilder] Meta generation failed: ${err.message}`);
    return {
      title: `${config.primaryKeyword} | ${config.brandName}`,
      description: `${config.brandName} - ${config.primaryKeyword}`,
      h1: config.primaryKeyword,
      canonicalUrl: config.siteUrl.replace(/\/$/, ""),
      ogTitle: `${config.primaryKeyword} | ${config.brandName}`,
      ogDescription: `${config.brandName} - ${config.primaryKeyword}`,
    };
  }
}

// ═══════════════════════════════════════════════
// HTML Assembler
// ═══════════════════════════════════════════════

function assembleSectionsToHtml(sections: SeoSection[], meta: LayoutRebuildResult["meta"]): string {
  const parts: string[] = [];

  for (const section of sections) {
    const headingTag = section.headingLevel;
    const sectionId = section.id;

    parts.push(`<!-- Section: ${section.type} -->`);
    parts.push(`<section id="${sectionId}">`);
    
    if (section.type === "hero") {
      // Hero uses H1
      parts.push(`<${headingTag}>${section.heading}</${headingTag}>`);
    } else {
      parts.push(`<${headingTag}>${section.heading}</${headingTag}>`);
    }
    
    parts.push(section.contentHtml);
    parts.push(`</section>`);
    parts.push("");
  }

  return parts.join("\n");
}

function countWordsInHtml(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.split(/\s+/).filter(w => w.length > 1).length;
}

// ═══════════════════════════════════════════════
// Main Rebuild Function
// ═══════════════════════════════════════════════

export async function rebuildHomepageLayout(input: LayoutRebuildInput): Promise<LayoutRebuildResult> {
  const {
    analysisReport,
    primaryKeyword,
    secondaryKeywords = [],
    niche = "gambling",
    brandName = primaryKeyword,
    language = "th",
    mode = "full",
  } = input;

  console.log(`[SEO-Rebuilder] 🏗️ Starting layout rebuild for ${input.siteUrl} (mode: ${mode})`);
  console.log(`[SEO-Rebuilder] Primary keyword: "${primaryKeyword}", Niche: ${niche}`);

  const changeLog: LayoutChange[] = [];
  const sectionOrder = getSectionOrder(niche);

  // Determine which sections to build based on mode
  let sectionsToGenerate: SeoSection["type"][];
  
  if (mode === "safe") {
    // Safe mode: only add missing critical sections, keep existing content
    const existingTypes = new Set(analysisReport.sections.map(s => s.type));
    sectionsToGenerate = sectionOrder.filter(type => {
      if (type === "hero" || type === "faq" || type === "footer_content") return true;
      return !existingTypes.has(type as any);
    });
    console.log(`[SEO-Rebuilder] Safe mode: generating ${sectionsToGenerate.length} sections (keeping existing)`);
  } else if (mode === "semi") {
    // Semi mode: rebuild weak sections, add missing ones
    const weakSections = analysisReport.sections
      .filter(s => s.seoValue === "low" || s.seoValue === "negative")
      .map(s => s.type as string);
    const existingTypes = new Set(analysisReport.sections.map(s => s.type));
    sectionsToGenerate = sectionOrder.filter(type => {
      return weakSections.includes(type as string) || !existingTypes.has(type as any);
    });
    console.log(`[SEO-Rebuilder] Semi mode: generating ${sectionsToGenerate.length} sections`);
  } else {
    // Full mode: rebuild everything
    sectionsToGenerate = [...sectionOrder];
    console.log(`[SEO-Rebuilder] Full mode: generating all ${sectionsToGenerate.length} sections`);
  }

  // Log removed sections
  for (const section of analysisReport.sections) {
    if (section.seoValue === "negative") {
      changeLog.push({
        type: "removed",
        section: section.name,
        description: `Removed ${section.type} section with negative SEO value`,
        reason: section.issues.join("; ") || "Low SEO value, clutters page structure",
      });
    }
  }

  // Generate meta tags
  const meta = await generateMetaTags({
    primaryKeyword,
    secondaryKeywords,
    brandName,
    niche,
    siteUrl: input.siteUrl,
    language,
  });

  // Generate each section content
  const sections: SeoSection[] = [];
  let priority = 1;

  for (const sectionType of sectionsToGenerate) {
    console.log(`[SEO-Rebuilder] Generating section: ${sectionType} (${priority}/${sectionsToGenerate.length})`);
    
    // Find existing content for this section type
    const existingSection = analysisReport.sections.find(s => s.type === sectionType);
    const existingContent = (existingSection?.wordCount ?? 0) > 20 
      ? analysisReport.rawSnapshot.html.slice(0, 3000) // Provide some context
      : undefined;

    const content = await generateSectionContent(sectionType, {
      primaryKeyword,
      secondaryKeywords,
      brandName,
      niche,
      language,
      existingContent: mode === "full" ? undefined : existingContent,
      mode,
    });

    const seoSection: SeoSection = {
      id: `section-${sectionType}`,
      type: sectionType,
      heading: content.heading,
      headingLevel: sectionType === "hero" ? "h1" : "h2",
      contentHtml: content.contentHtml,
      targetKeywords: sectionType === "hero" 
        ? [primaryKeyword, ...secondaryKeywords.slice(0, 2)]
        : secondaryKeywords.slice(0, 3),
      internalLinks: content.internalLinks,
      schemaType: getSchemaTypeForSection(sectionType),
      priority,
      wordCount: countWordsInHtml(content.contentHtml),
    };

    sections.push(seoSection);

    // Log the change
    if (existingSection) {
      changeLog.push({
        type: "modified",
        section: sectionType,
        description: `Rebuilt ${sectionType} section with SEO-optimized content`,
        reason: `Previous SEO value: ${existingSection.seoValue}, issues: ${existingSection.issues.join("; ") || "none"}`,
      });
    } else {
      changeLog.push({
        type: "added",
        section: sectionType,
        description: `Added new ${sectionType} section`,
        reason: `Missing from original layout — essential for SEO completeness`,
      });
    }

    priority++;
  }

  // Assemble full HTML
  const fullHtml = assembleSectionsToHtml(sections, meta);

  // Calculate comparison
  const totalWordCount = sections.reduce((sum, s) => sum + s.wordCount, 0);
  const totalHeadings = sections.reduce((sum, s) => {
    const h3Count = (s.contentHtml.match(/<h3/gi) || []).length;
    return sum + 1 + h3Count; // 1 for the section heading + sub-headings
  }, 0);

  const comparison = {
    before: {
      sectionCount: analysisReport.sections.length,
      wordCount: analysisReport.contentMetrics.totalWordCount,
      headingCount: analysisReport.headings.h1Count + analysisReport.headings.h2Count + analysisReport.headings.h3Count,
      crawlabilityScore: analysisReport.crawlabilityScore,
      seoReadinessScore: analysisReport.seoReadinessScore,
    },
    after: {
      sectionCount: sections.length,
      wordCount: totalWordCount,
      headingCount: totalHeadings,
      estimatedCrawlabilityScore: Math.min(95, analysisReport.crawlabilityScore + 30),
      estimatedSeoReadinessScore: Math.min(95, analysisReport.seoReadinessScore + 35),
    },
  };

  console.log(`[SEO-Rebuilder] ✅ Layout rebuild complete`);
  console.log(`[SEO-Rebuilder] Sections: ${sections.length}, Words: ${totalWordCount}, Changes: ${changeLog.length}`);
  console.log(`[SEO-Rebuilder] Before: crawl=${comparison.before.crawlabilityScore}, seo=${comparison.before.seoReadinessScore}`);
  console.log(`[SEO-Rebuilder] After (est): crawl=${comparison.after.estimatedCrawlabilityScore}, seo=${comparison.after.estimatedSeoReadinessScore}`);

  return {
    fullHtml,
    sections,
    changeLog,
    comparison,
    meta,
  };
}

// ═══════════════════════════════════════════════
// Schema Type Mapping
// ═══════════════════════════════════════════════

function getSchemaTypeForSection(type: SeoSection["type"]): string | undefined {
  const mapping: Record<string, string> = {
    hero: "WebPage",
    about: "Organization",
    services: "Service",
    games: "GamblingService",
    faq: "FAQPage",
    how_to: "HowTo",
    testimonials: "Review",
    trust: "Organization",
  };
  return mapping[type];
}

// ═══════════════════════════════════════════════
// WordPress HTML Formatter
// ═══════════════════════════════════════════════

/**
 * Convert the rebuilt layout into WordPress Gutenberg block HTML
 * that can be published via WP REST API.
 */
export function toWordPressBlockHtml(result: LayoutRebuildResult): string {
  const blocks: string[] = [];

  for (const section of result.sections) {
    // Group block
    blocks.push(`<!-- wp:group {"layout":{"type":"constrained"}} -->`);
    blocks.push(`<div class="wp-block-group">`);

    // Heading block
    const level = parseInt(section.headingLevel.replace("h", ""));
    blocks.push(`<!-- wp:heading {"level":${level}} -->`);
    blocks.push(`<${section.headingLevel} class="wp-block-heading">${section.heading}</${section.headingLevel}>`);
    blocks.push(`<!-- /wp:heading -->`);

    // Content — wrap paragraphs in wp:paragraph blocks
    const contentParts = section.contentHtml.split(/(<h3[^>]*>[\s\S]*?<\/h3>|<p[^>]*>[\s\S]*?<\/p>|<ul[^>]*>[\s\S]*?<\/ul>|<ol[^>]*>[\s\S]*?<\/ol>)/gi);
    
    for (const part of contentParts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      
      if (trimmed.startsWith("<h3")) {
        blocks.push(`<!-- wp:heading {"level":3} -->`);
        blocks.push(trimmed.replace(/<h3[^>]*>/, '<h3 class="wp-block-heading">'));
        blocks.push(`<!-- /wp:heading -->`);
      } else if (trimmed.startsWith("<p")) {
        blocks.push(`<!-- wp:paragraph -->`);
        blocks.push(trimmed);
        blocks.push(`<!-- /wp:paragraph -->`);
      } else if (trimmed.startsWith("<ul") || trimmed.startsWith("<ol")) {
        blocks.push(`<!-- wp:list -->`);
        blocks.push(trimmed);
        blocks.push(`<!-- /wp:list -->`);
      } else if (trimmed.length > 10) {
        blocks.push(`<!-- wp:paragraph -->`);
        blocks.push(`<p>${trimmed}</p>`);
        blocks.push(`<!-- /wp:paragraph -->`);
      }
    }

    blocks.push(`</div>`);
    blocks.push(`<!-- /wp:group -->`);
    blocks.push("");
  }

  return blocks.join("\n");
}

/**
 * Generate JSON-LD schema markup for the rebuilt page
 */
export function generateSchemaMarkup(
  result: LayoutRebuildResult,
  config: { siteUrl: string; brandName: string; niche: string; primaryKeyword: string },
): string {
  const schemas: any[] = [];

  // WebSite schema
  schemas.push({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: config.brandName,
    url: config.siteUrl,
    description: result.meta.description,
    potentialAction: {
      "@type": "SearchAction",
      target: `${config.siteUrl}/?s={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  });

  // Organization schema
  schemas.push({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: config.brandName,
    url: config.siteUrl,
    description: result.meta.description,
  });

  // GamblingService schema (for gambling niche)
  const gamblingNiches = ["gambling", "casino", "slots", "lottery", "baccarat", "poker", "betting", "สล็อต", "คาสิโน"];
  if (gamblingNiches.some(n => config.niche.toLowerCase().includes(n))) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "GamblingService",
      name: config.brandName,
      url: config.siteUrl,
      description: result.meta.description,
    });
  }

  // FAQ schema
  const faqSection = result.sections.find(s => s.type === "faq");
  if (faqSection) {
    const faqItems: any[] = [];
    const qRegex = /<h3[^>]*>([\s\S]*?)<\/h3>\s*(?:<p[^>]*>)?([\s\S]*?)(?:<\/p>|(?=<h3|$))/gi;
    let match;
    while ((match = qRegex.exec(faqSection.contentHtml)) !== null) {
      const question = match[1].replace(/<[^>]+>/g, "").trim();
      const answer = match[2].replace(/<[^>]+>/g, "").trim();
      if (question && answer) {
        faqItems.push({
          "@type": "Question",
          name: question,
          acceptedAnswer: {
            "@type": "Answer",
            text: answer,
          },
        });
      }
    }
    if (faqItems.length > 0) {
      schemas.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems,
      });
    }
  }

  // HowTo schema
  const howToSection = result.sections.find(s => s.type === "how_to");
  if (howToSection) {
    const steps: any[] = [];
    const stepRegex = /<h3[^>]*>([\s\S]*?)<\/h3>\s*(?:<p[^>]*>)?([\s\S]*?)(?:<\/p>|(?=<h3|$))/gi;
    let match;
    let stepNum = 1;
    while ((match = stepRegex.exec(howToSection.contentHtml)) !== null) {
      const name = match[1].replace(/<[^>]+>/g, "").trim();
      const text = match[2].replace(/<[^>]+>/g, "").trim();
      if (name && text) {
        steps.push({
          "@type": "HowToStep",
          position: stepNum++,
          name,
          text,
        });
      }
    }
    if (steps.length > 0) {
      schemas.push({
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: howToSection.heading,
        step: steps,
      });
    }
  }

  // BreadcrumbList
  schemas.push({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "หน้าแรก",
        item: config.siteUrl,
      },
    ],
  });

  return schemas.map(s => `<script type="application/ld+json">${JSON.stringify(s, null, 2)}</script>`).join("\n");
}
