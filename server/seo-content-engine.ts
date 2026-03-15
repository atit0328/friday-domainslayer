/**
 * SEO Content Engine
 * 
 * Generates SEO-optimized content for WordPress pages and posts:
 * - Support pages (service pages, category pages)
 * - Blog posts (topical authority, long-tail keywords)
 * - Content aligned with primary/secondary keywords
 * - Satisfies search intent, readable, natural
 * - Avoids keyword stuffing
 * - Supports entity and topical relevance
 * - Generates content clusters for topical authority
 */

import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface ContentGenerationInput {
  /** WordPress site URL */
  siteUrl: string;
  /** WP REST API credentials */
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
  /** Content type */
  contentType: "page" | "post";
  /** Specific topic (if provided) */
  topic?: string;
  /** Target word count */
  targetWordCount?: number;
  /** Content cluster hub page URL (for internal linking) */
  hubPageUrl?: string;
  /** Related pages for internal linking */
  relatedPages?: { title: string; url: string }[];
}

export interface GeneratedContent {
  /** Page/post title */
  title: string;
  /** SEO-friendly slug */
  slug: string;
  /** Meta description */
  metaDescription: string;
  /** Full HTML content */
  contentHtml: string;
  /** Excerpt */
  excerpt: string;
  /** Focus keyword */
  focusKeyword: string;
  /** Tags */
  tags: string[];
  /** Categories */
  categories: string[];
  /** Internal links included */
  internalLinks: { text: string; url: string }[];
  /** Schema markup */
  schemaMarkup: string;
  /** Word count */
  wordCount: number;
  /** Keyword density */
  keywordDensity: number;
  /** Heading structure */
  headings: { level: string; text: string }[];
  /** Image suggestions */
  imageSuggestions: { alt: string; description: string; placement: string }[];
}

export interface ContentClusterPlan {
  /** Hub page (pillar content) */
  hubPage: {
    title: string;
    slug: string;
    keyword: string;
    description: string;
  };
  /** Spoke pages (supporting content) */
  spokePages: {
    title: string;
    slug: string;
    keyword: string;
    description: string;
    contentType: "page" | "post";
    priority: number;
  }[];
  /** Internal linking map */
  linkingMap: {
    from: string;
    to: string;
    anchorText: string;
  }[];
}

// ═══════════════════════════════════════════════
// Content Cluster Planner
// ═══════════════════════════════════════════════

export async function planContentCluster(config: {
  primaryKeyword: string;
  secondaryKeywords: string[];
  niche: string;
  brandName: string;
  language: string;
  existingPages?: { title: string; url: string }[];
}): Promise<ContentClusterPlan> {
  console.log(`[SEO-Content] 📋 Planning content cluster for "${config.primaryKeyword}"`);

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an SEO content strategist specializing in ${config.niche} websites. Plan a content cluster (topic cluster) to build topical authority.

Language: ${config.language === "th" ? "Thai" : "English"}
Brand: ${config.brandName}

Rules:
- Hub page = pillar content targeting the primary keyword (2000-3000 words)
- 6-10 spoke pages targeting long-tail variations and related topics
- Each spoke should target a unique search intent
- Include a mix of pages (evergreen) and posts (timely/informational)
- Plan internal links from every spoke to the hub and between related spokes
- Slugs must be SEO-friendly (lowercase, hyphens, keyword-rich)
- Consider search volume and competition for keyword selection
- For gambling niche: cover games, strategies, guides, reviews, bonuses, payment methods

${config.existingPages?.length ? `Existing pages (avoid duplicating): ${config.existingPages.map(p => p.title).join(", ")}` : ""}

Respond in JSON.`,
        },
        {
          role: "user",
          content: `Plan a content cluster for:
Primary keyword: ${config.primaryKeyword}
Secondary keywords: ${config.secondaryKeywords.join(", ")}
Niche: ${config.niche}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "content_cluster",
          strict: true,
          schema: {
            type: "object",
            properties: {
              hubPage: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  slug: { type: "string" },
                  keyword: { type: "string" },
                  description: { type: "string" },
                },
                required: ["title", "slug", "keyword", "description"],
                additionalProperties: false,
              },
              spokePages: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    slug: { type: "string" },
                    keyword: { type: "string" },
                    description: { type: "string" },
                    contentType: { type: "string" },
                    priority: { type: "number" },
                  },
                  required: ["title", "slug", "keyword", "description", "contentType", "priority"],
                  additionalProperties: false,
                },
              },
              linkingMap: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    anchorText: { type: "string" },
                  },
                  required: ["from", "to", "anchorText"],
                  additionalProperties: false,
                },
              },
            },
            required: ["hubPage", "spokePages", "linkingMap"],
            additionalProperties: false,
          },
        },
      },
    });

    const plan = JSON.parse(String(response.choices[0].message.content) || "{}");
    console.log(`[SEO-Content] ✅ Cluster plan: 1 hub + ${plan.spokePages?.length || 0} spokes`);
    return plan;
  } catch (err: any) {
    console.error(`[SEO-Content] Cluster planning failed: ${err.message}`);
    return {
      hubPage: {
        title: config.primaryKeyword,
        slug: config.primaryKeyword.toLowerCase().replace(/\s+/g, "-"),
        keyword: config.primaryKeyword,
        description: `Hub page for ${config.primaryKeyword}`,
      },
      spokePages: config.secondaryKeywords.slice(0, 6).map((kw, i) => ({
        title: kw,
        slug: kw.toLowerCase().replace(/\s+/g, "-"),
        keyword: kw,
        description: `Supporting page for ${kw}`,
        contentType: i < 3 ? "page" as const : "post" as const,
        priority: i + 1,
      })),
      linkingMap: [],
    };
  }
}

// ═══════════════════════════════════════════════
// Single Content Generator
// ═══════════════════════════════════════════════

export async function generateSeoContent(input: ContentGenerationInput): Promise<GeneratedContent> {
  const {
    primaryKeyword,
    secondaryKeywords = [],
    niche = "gambling",
    brandName = primaryKeyword,
    language = "th",
    contentType,
    topic,
    targetWordCount = contentType === "page" ? 2000 : 1500,
    hubPageUrl,
    relatedPages = [],
  } = input;

  const targetTopic = topic || primaryKeyword;
  console.log(`[SEO-Content] ✍️ Generating ${contentType} for "${targetTopic}" (${targetWordCount} words)`);

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert SEO content writer for ${niche} websites. Write in ${language === "th" ? "Thai" : "English"}.

CONTENT RULES:
1. Write ${targetWordCount}+ words of high-quality, original content
2. Use proper heading hierarchy: H1 (title), H2 (main sections), H3 (sub-sections)
3. Include the focus keyword in: title, first paragraph, at least 2 H2s, meta description, conclusion
4. Keyword density: 1-2% for primary, 0.5-1% for secondary keywords
5. Use <strong> for important terms (3-5 times per article)
6. Include 2-3 internal links to related pages
7. Write for humans first — natural, engaging, informative
8. NO keyword stuffing, NO filler content, NO AI-sounding phrases
9. Include actionable information, statistics, or expert insights
10. End with a clear CTA section
11. Generate 3-5 image placement suggestions with descriptive alt text

STRUCTURE:
- Compelling H1 title with keyword
- Introduction (100-150 words, hook + keyword)
- 4-6 H2 sections with substantial content
- H3 sub-sections where appropriate
- Conclusion with CTA
- Use <p>, <h2>, <h3>, <ul>, <ol>, <strong>, <a> tags only

INTERNAL LINKING:
${hubPageUrl ? `- Link back to hub page: ${hubPageUrl}` : ""}
${relatedPages.length > 0 ? `- Link to related pages: ${relatedPages.map(p => `${p.title} (${p.url})`).join(", ")}` : ""}

Respond in JSON format.`,
        },
        {
          role: "user",
          content: `Write a ${contentType} about: "${targetTopic}"
Focus keyword: "${primaryKeyword}"
Secondary keywords: ${secondaryKeywords.slice(0, 5).join(", ")}
Brand: ${brandName}
Target words: ${targetWordCount}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "seo_content",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              slug: { type: "string" },
              metaDescription: { type: "string" },
              contentHtml: { type: "string" },
              excerpt: { type: "string" },
              focusKeyword: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              categories: { type: "array", items: { type: "string" } },
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
              headings: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    level: { type: "string" },
                    text: { type: "string" },
                  },
                  required: ["level", "text"],
                  additionalProperties: false,
                },
              },
              imageSuggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    alt: { type: "string" },
                    description: { type: "string" },
                    placement: { type: "string" },
                  },
                  required: ["alt", "description", "placement"],
                  additionalProperties: false,
                },
              },
            },
            required: ["title", "slug", "metaDescription", "contentHtml", "excerpt", "focusKeyword", "tags", "categories", "internalLinks", "headings", "imageSuggestions"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = JSON.parse(String(response.choices[0].message.content) || "{}");

    // Calculate word count and keyword density
    const textContent = (content.contentHtml || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = textContent.split(/\s+/).filter((w: string) => w.length > 1);
    const wordCount = words.length;
    const kwLower = primaryKeyword.toLowerCase();
    const kwCount = (textContent.toLowerCase().match(new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    const keywordDensity = wordCount > 0 ? Math.round((kwCount / wordCount) * 10000) / 100 : 0;

    // Generate schema markup
    const schemaMarkup = generateContentSchema(content, input);

    console.log(`[SEO-Content] ✅ Generated: "${content.title}" (${wordCount} words, KD: ${keywordDensity}%)`);

    return {
      ...content,
      wordCount,
      keywordDensity,
      schemaMarkup,
    };
  } catch (err: any) {
    console.error(`[SEO-Content] Content generation failed: ${err.message}`);
    throw new Error(`Content generation failed for "${targetTopic}": ${err.message}`);
  }
}

// ═══════════════════════════════════════════════
// Batch Content Generator
// ═══════════════════════════════════════════════

export async function generateContentBatch(
  cluster: ContentClusterPlan,
  baseConfig: Omit<ContentGenerationInput, "contentType" | "topic" | "hubPageUrl">,
  onProgress?: (completed: number, total: number, title: string) => void,
): Promise<{ hub: GeneratedContent; spokes: GeneratedContent[] }> {
  const total = 1 + cluster.spokePages.length;
  let completed = 0;

  console.log(`[SEO-Content] 📦 Batch generating ${total} content pieces`);

  // Generate hub page first
  const hub = await generateSeoContent({
    ...baseConfig,
    contentType: "page",
    topic: cluster.hubPage.title,
    primaryKeyword: cluster.hubPage.keyword,
    targetWordCount: 2500,
    relatedPages: cluster.spokePages.map(s => ({
      title: s.title,
      url: `/${s.slug}/`,
    })),
  });
  completed++;
  onProgress?.(completed, total, hub.title);

  // Generate spoke pages
  const spokes: GeneratedContent[] = [];
  for (const spoke of cluster.spokePages.sort((a, b) => a.priority - b.priority)) {
    try {
      const content = await generateSeoContent({
        ...baseConfig,
        contentType: spoke.contentType as "page" | "post",
        topic: spoke.title,
        primaryKeyword: spoke.keyword,
        targetWordCount: spoke.contentType === "page" ? 1800 : 1200,
        hubPageUrl: `/${cluster.hubPage.slug}/`,
        relatedPages: [
          { title: cluster.hubPage.title, url: `/${cluster.hubPage.slug}/` },
          ...cluster.spokePages
            .filter(s => s.slug !== spoke.slug)
            .slice(0, 3)
            .map(s => ({ title: s.title, url: `/${s.slug}/` })),
        ],
      });
      spokes.push(content);
      completed++;
      onProgress?.(completed, total, content.title);
    } catch (err: any) {
      console.error(`[SEO-Content] Failed to generate spoke "${spoke.title}": ${err.message}`);
      completed++;
      onProgress?.(completed, total, `FAILED: ${spoke.title}`);
    }
  }

  console.log(`[SEO-Content] ✅ Batch complete: ${completed}/${total} generated`);
  return { hub, spokes };
}

// ═══════════════════════════════════════════════
// WordPress Publisher
// ═══════════════════════════════════════════════

export async function publishToWordPress(
  content: GeneratedContent,
  config: {
    siteUrl: string;
    username: string;
    appPassword: string;
    contentType: "page" | "post";
    status?: "publish" | "draft";
    parentId?: number;
  },
): Promise<{ id: number; url: string; success: boolean; error?: string }> {
  const url = config.siteUrl.replace(/\/$/, "");
  const endpoint = config.contentType === "page" ? "pages" : "posts";
  const auth = Buffer.from(`${config.username}:${config.appPassword}`).toString("base64");

  try {
    // Create categories first (for posts)
    let categoryIds: number[] = [];
    if (config.contentType === "post" && content.categories.length > 0) {
      for (const catName of content.categories.slice(0, 3)) {
        try {
          const catRes = await fetch(`${url}/wp-json/wp/v2/categories`, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${auth}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: catName }),
            signal: AbortSignal.timeout(15000),
          });
          if (catRes.ok) {
            const cat = await catRes.json() as any;
            categoryIds.push(cat.id);
          } else if (catRes.status === 400) {
            // Category might already exist, try to find it
            const searchRes = await fetch(`${url}/wp-json/wp/v2/categories?search=${encodeURIComponent(catName)}`, {
              headers: { "Authorization": `Basic ${auth}` },
              signal: AbortSignal.timeout(10000),
            });
            if (searchRes.ok) {
              const cats = await searchRes.json() as any[];
              const existing = cats.find((c: any) => c.name.toLowerCase() === catName.toLowerCase());
              if (existing) categoryIds.push(existing.id);
            }
          }
        } catch {}
      }
    }

    // Create tags (for posts)
    let tagIds: number[] = [];
    if (config.contentType === "post" && content.tags.length > 0) {
      for (const tagName of content.tags.slice(0, 5)) {
        try {
          const tagRes = await fetch(`${url}/wp-json/wp/v2/tags`, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${auth}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: tagName }),
            signal: AbortSignal.timeout(15000),
          });
          if (tagRes.ok) {
            const tag = await tagRes.json() as any;
            tagIds.push(tag.id);
          } else if (tagRes.status === 400) {
            const searchRes = await fetch(`${url}/wp-json/wp/v2/tags?search=${encodeURIComponent(tagName)}`, {
              headers: { "Authorization": `Basic ${auth}` },
              signal: AbortSignal.timeout(10000),
            });
            if (searchRes.ok) {
              const tags = await searchRes.json() as any[];
              const existing = tags.find((t: any) => t.name.toLowerCase() === tagName.toLowerCase());
              if (existing) tagIds.push(existing.id);
            }
          }
        } catch {}
      }
    }

    // Prepare content with schema markup
    const fullContent = content.schemaMarkup
      ? `${content.contentHtml}\n\n${content.schemaMarkup}`
      : content.contentHtml;

    // Create the page/post
    const body: any = {
      title: content.title,
      content: fullContent,
      slug: content.slug,
      excerpt: content.excerpt,
      status: config.status || "publish",
      meta: {
        _yoast_wpseo_focuskw: content.focusKeyword,
        _yoast_wpseo_metadesc: content.metaDescription,
        _yoast_wpseo_title: content.title,
      },
    };

    if (config.contentType === "post") {
      if (categoryIds.length > 0) body.categories = categoryIds;
      if (tagIds.length > 0) body.tags = tagIds;
    }

    if (config.parentId) body.parent = config.parentId;

    const res = await fetch(`${url}/wp-json/wp/v2/${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { id: 0, url: "", success: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const result = await res.json() as any;
    console.log(`[SEO-Content] ✅ Published ${config.contentType}: "${content.title}" → ${result.link}`);
    return { id: result.id, url: result.link, success: true };
  } catch (err: any) {
    return { id: 0, url: "", success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════
// Schema Generator for Content
// ═══════════════════════════════════════════════

function generateContentSchema(content: any, input: ContentGenerationInput): string {
  const schemas: any[] = [];

  // Article schema
  if (input.contentType === "post") {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: content.title,
      description: content.metaDescription || content.excerpt,
      author: {
        "@type": "Organization",
        name: input.brandName || input.primaryKeyword,
      },
      publisher: {
        "@type": "Organization",
        name: input.brandName || input.primaryKeyword,
      },
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `${input.siteUrl}/${content.slug}/`,
      },
    });
  }

  // WebPage schema for pages
  if (input.contentType === "page") {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: content.title,
      description: content.metaDescription || content.excerpt,
      url: `${input.siteUrl}/${content.slug}/`,
    });
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
        item: input.siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: content.title,
        item: `${input.siteUrl}/${content.slug}/`,
      },
    ],
  });

  return schemas
    .map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`)
    .join("\n");
}

// ═══════════════════════════════════════════════
// Content Quality Checker
// ═══════════════════════════════════════════════

export interface ContentQualityReport {
  score: number;
  issues: { type: "critical" | "warning" | "info"; message: string }[];
  metrics: {
    wordCount: number;
    keywordDensity: number;
    headingCount: number;
    internalLinkCount: number;
    imageCount: number;
    readabilityScore: number;
    uniquenessScore: number;
  };
}

export function checkContentQuality(content: GeneratedContent, primaryKeyword: string): ContentQualityReport {
  const issues: ContentQualityReport["issues"] = [];
  let score = 100;

  // Word count
  if (content.wordCount < 300) {
    issues.push({ type: "critical", message: `Word count too low: ${content.wordCount} (min 300)` });
    score -= 20;
  } else if (content.wordCount < 800) {
    issues.push({ type: "warning", message: `Word count below recommended: ${content.wordCount} (recommended 800+)` });
    score -= 8;
  }

  // Keyword density
  if (content.keywordDensity > 3) {
    issues.push({ type: "critical", message: `Keyword density too high: ${content.keywordDensity}% (max 3%)` });
    score -= 15;
  } else if (content.keywordDensity < 0.5) {
    issues.push({ type: "warning", message: `Keyword density too low: ${content.keywordDensity}% (min 0.5%)` });
    score -= 8;
  }

  // Title
  if (!content.title.toLowerCase().includes(primaryKeyword.toLowerCase())) {
    issues.push({ type: "warning", message: "Primary keyword not found in title" });
    score -= 10;
  }
  if (content.title.length > 65) {
    issues.push({ type: "warning", message: `Title too long: ${content.title.length} chars (max 65)` });
    score -= 5;
  }

  // Meta description
  if (!content.metaDescription) {
    issues.push({ type: "critical", message: "Missing meta description" });
    score -= 12;
  } else if (content.metaDescription.length > 160) {
    issues.push({ type: "warning", message: `Meta description too long: ${content.metaDescription.length} chars (max 160)` });
    score -= 3;
  }

  // Headings
  if (content.headings.length < 3) {
    issues.push({ type: "warning", message: `Too few headings: ${content.headings.length} (min 3)` });
    score -= 8;
  }

  // Internal links
  if (content.internalLinks.length < 2) {
    issues.push({ type: "warning", message: `Too few internal links: ${content.internalLinks.length} (min 2)` });
    score -= 5;
  }

  // Images
  if (content.imageSuggestions.length === 0) {
    issues.push({ type: "info", message: "No image suggestions — consider adding visual content" });
    score -= 3;
  }

  // Slug
  if (content.slug.length > 60) {
    issues.push({ type: "warning", message: `Slug too long: ${content.slug.length} chars (max 60)` });
    score -= 3;
  }

  const headingCount = content.headings.length;
  const imageCount = content.imageSuggestions.length;

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    metrics: {
      wordCount: content.wordCount,
      keywordDensity: content.keywordDensity,
      headingCount,
      internalLinkCount: content.internalLinks.length,
      imageCount,
      readabilityScore: 75, // Placeholder — could integrate readability library
      uniquenessScore: 90, // Placeholder — could integrate plagiarism checker
    },
  };
}
