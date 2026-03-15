/**
 * SEO Internal Linking + FAQ + Schema Engine
 * 
 * Handles:
 * 1. Internal linking strategy — silo structure, contextual links, anchor text optimization
 * 2. FAQ section generation — schema-ready Q&A from keyword research
 * 3. Comprehensive schema markup — Organization, WebSite, WebPage, FAQPage,
 *    BreadcrumbList, Article, LocalBusiness, SiteNavigationElement
 * 4. Link injection into existing content
 * 5. Orphan page detection
 */

import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface InternalLinkingInput {
  siteUrl: string;
  username: string;
  appPassword: string;
  primaryKeyword: string;
  secondaryKeywords?: string[];
  brandName?: string;
  language?: string;
  niche?: string;
}

export interface SiteLink {
  fromPageId: number;
  fromPageTitle: string;
  fromPageUrl: string;
  toPageId: number;
  toPageTitle: string;
  toPageUrl: string;
  anchorText: string;
  context: string;
  linkType: "contextual" | "navigation" | "footer" | "sidebar" | "cta";
}

export interface InternalLinkingReport {
  totalPages: number;
  totalPosts: number;
  existingLinks: number;
  newLinksAdded: number;
  orphanPages: { id: number; title: string; url: string }[];
  siloStructure: SiloGroup[];
  linkMap: SiteLink[];
  recommendations: string[];
}

export interface SiloGroup {
  name: string;
  hubPage: { id: number; title: string; url: string };
  childPages: { id: number; title: string; url: string }[];
  keyword: string;
}

export interface FaqInput {
  primaryKeyword: string;
  secondaryKeywords?: string[];
  niche?: string;
  brandName?: string;
  language?: string;
  existingFaqs?: { question: string; answer: string }[];
  count?: number;
}

export interface GeneratedFaq {
  question: string;
  answer: string;
  answerHtml: string;
  keyword: string;
  searchIntent: "informational" | "navigational" | "transactional";
}

export interface FaqResult {
  faqs: GeneratedFaq[];
  faqHtml: string;
  faqSchema: string;
}

export interface SchemaInput {
  siteUrl: string;
  brandName: string;
  primaryKeyword: string;
  niche?: string;
  language?: string;
  pageType: "homepage" | "article" | "service" | "category" | "faq" | "about" | "contact";
  pageTitle: string;
  pageDescription: string;
  pageUrl: string;
  breadcrumbs?: { name: string; url: string }[];
  faqs?: { question: string; answer: string }[];
  organization?: {
    name: string;
    logoUrl?: string;
    phone?: string;
    email?: string;
    address?: string;
    socialProfiles?: string[];
  };
  article?: {
    authorName: string;
    datePublished: string;
    dateModified: string;
    imageUrl?: string;
  };
}

export interface SchemaResult {
  schemas: Record<string, any>[];
  schemaHtml: string;
  validationIssues: string[];
}

// ═══════════════════════════════════════════════
// Internal Linking Engine
// ═══════════════════════════════════════════════

/**
 * Analyze site structure and build internal linking strategy
 */
export async function buildInternalLinkingStrategy(input: InternalLinkingInput): Promise<InternalLinkingReport> {
  const { siteUrl, username, appPassword, primaryKeyword, secondaryKeywords = [], language = "th" } = input;
  const url = siteUrl.replace(/\/$/, "");
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");

  console.log(`[SEO-Linking] 🔗 Building internal linking strategy for ${siteUrl}`);

  // Fetch all pages and posts
  const allPages: any[] = [];
  const allPosts: any[] = [];

  try {
    let page = 1;
    while (true) {
      const res = await fetch(`${url}/wp-json/wp/v2/pages?per_page=100&page=${page}&status=publish`, {
        headers: { "Authorization": `Basic ${auth}` },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) break;
      const data = await res.json() as any[];
      if (data.length === 0) break;
      allPages.push(...data);
      page++;
      if (data.length < 100) break;
    }

    page = 1;
    while (true) {
      const res = await fetch(`${url}/wp-json/wp/v2/posts?per_page=100&page=${page}&status=publish`, {
        headers: { "Authorization": `Basic ${auth}` },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) break;
      const data = await res.json() as any[];
      if (data.length === 0) break;
      allPosts.push(...data);
      page++;
      if (data.length < 100) break;
    }
  } catch (err: any) {
    console.error(`[SEO-Linking] Failed to fetch content: ${err.message}`);
  }

  const allContent = [...allPages, ...allPosts];
  console.log(`[SEO-Linking] Found ${allPages.length} pages, ${allPosts.length} posts`);

  // Analyze existing internal links
  let existingLinks = 0;
  const pageLinks = new Map<number, Set<string>>();

  for (const item of allContent) {
    const content = item.content?.rendered || "";
    const linkMatches = content.match(/<a[^>]*href=["']([^"']*?)["'][^>]*>/gi) || [];
    const internalLinks = linkMatches.filter((l: string) => {
      const href = l.match(/href=["']([^"']*?)["']/i)?.[1] || "";
      return href.startsWith("/") || href.includes(siteUrl.replace(/^https?:\/\//, ""));
    });
    existingLinks += internalLinks.length;
    pageLinks.set(item.id, new Set(internalLinks.map((l: string) => {
      const href = l.match(/href=["']([^"']*?)["']/i)?.[1] || "";
      return href;
    })));
  }

  // Detect orphan pages (no incoming internal links)
  const linkedUrls = new Set<string>();
  for (const links of Array.from(pageLinks.values())) {
    for (const link of Array.from(links)) {
      linkedUrls.add(link);
    }
  }

  const orphanPages = allContent
    .filter(item => {
      const itemUrl = item.link || "";
      const itemSlug = item.slug || "";
      return !linkedUrls.has(itemUrl) && 
             !linkedUrls.has(`/${itemSlug}/`) && 
             !linkedUrls.has(`/${itemSlug}`);
    })
    .map(item => ({
      id: item.id,
      title: item.title?.rendered || "Untitled",
      url: item.link || "",
    }));

  // Build silo structure using AI
  const siloStructure = await buildSiloStructure(allContent, primaryKeyword, secondaryKeywords, language);

  // Generate new internal links
  const linkMap = await generateInternalLinks(allContent, siloStructure, primaryKeyword, language);

  const recommendations: string[] = [];
  if (orphanPages.length > 0) {
    recommendations.push(`${orphanPages.length} orphan pages found — add internal links to these pages`);
  }
  if (existingLinks < allContent.length * 2) {
    recommendations.push("Low internal link density — aim for 3-5 internal links per page");
  }
  if (siloStructure.length === 0) {
    recommendations.push("No clear silo structure — organize content into topic clusters");
  }

  console.log(`[SEO-Linking] ✅ Strategy complete: ${linkMap.length} new links, ${orphanPages.length} orphans`);

  return {
    totalPages: allPages.length,
    totalPosts: allPosts.length,
    existingLinks,
    newLinksAdded: linkMap.length,
    orphanPages,
    siloStructure,
    linkMap,
    recommendations,
  };
}

async function buildSiloStructure(
  allContent: any[],
  primaryKeyword: string,
  secondaryKeywords: string[],
  language: string,
): Promise<SiloGroup[]> {
  if (allContent.length < 3) return [];

  try {
    const contentSummary = allContent.slice(0, 30).map(item => ({
      id: item.id,
      title: item.title?.rendered || "",
      slug: item.slug || "",
      url: item.link || "",
      type: item.type || "page",
    }));

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an SEO silo structure expert. Analyze the given pages and organize them into topic silos.
Language: ${language === "th" ? "Thai" : "English"}

Rules:
- Each silo has a hub page (pillar content) and child pages (supporting content)
- Hub pages should target broader keywords
- Child pages should target long-tail variations
- Group by topical relevance, not just URL structure
- Maximum 5 silos

Respond in JSON format.`,
        },
        {
          role: "user",
          content: `Primary keyword: "${primaryKeyword}"
Secondary keywords: ${secondaryKeywords.join(", ")}
Pages: ${JSON.stringify(contentSummary)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "silo_structure",
          strict: true,
          schema: {
            type: "object",
            properties: {
              silos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    keyword: { type: "string" },
                    hubPageId: { type: "number" },
                    childPageIds: { type: "array", items: { type: "number" } },
                  },
                  required: ["name", "keyword", "hubPageId", "childPageIds"],
                  additionalProperties: false,
                },
              },
            },
            required: ["silos"],
            additionalProperties: false,
          },
        },
      },
    });

    const result = JSON.parse(String(response.choices[0].message.content) || "{}");
    const contentMap = new Map(allContent.map(c => [c.id, c]));

    return (result.silos || []).map((silo: any) => {
      const hub = contentMap.get(silo.hubPageId);
      return {
        name: silo.name,
        keyword: silo.keyword,
        hubPage: hub ? {
          id: hub.id,
          title: hub.title?.rendered || "",
          url: hub.link || "",
        } : { id: 0, title: "Unknown", url: "" },
        childPages: (silo.childPageIds || [])
          .map((id: number) => contentMap.get(id))
          .filter(Boolean)
          .map((c: any) => ({
            id: c.id,
            title: c.title?.rendered || "",
            url: c.link || "",
          })),
      };
    }).filter((s: SiloGroup) => s.hubPage.id !== 0);
  } catch (err: any) {
    console.error(`[SEO-Linking] Silo structure generation failed: ${err.message}`);
    return [];
  }
}

async function generateInternalLinks(
  allContent: any[],
  siloStructure: SiloGroup[],
  primaryKeyword: string,
  language: string,
): Promise<SiteLink[]> {
  const links: SiteLink[] = [];

  // Link from each child to its hub
  for (const silo of siloStructure) {
    for (const child of silo.childPages) {
      links.push({
        fromPageId: child.id,
        fromPageTitle: child.title,
        fromPageUrl: child.url,
        toPageId: silo.hubPage.id,
        toPageTitle: silo.hubPage.title,
        toPageUrl: silo.hubPage.url,
        anchorText: silo.keyword,
        context: "contextual link to hub page",
        linkType: "contextual",
      });
    }

    // Link from hub to each child
    for (const child of silo.childPages) {
      links.push({
        fromPageId: silo.hubPage.id,
        fromPageTitle: silo.hubPage.title,
        fromPageUrl: silo.hubPage.url,
        toPageId: child.id,
        toPageTitle: child.title,
        toPageUrl: child.url,
        anchorText: child.title,
        context: "contextual link from hub to child",
        linkType: "contextual",
      });
    }

    // Cross-link between siblings (max 2 per child)
    for (let i = 0; i < silo.childPages.length; i++) {
      const from = silo.childPages[i];
      const targets = silo.childPages.filter((_, j) => j !== i).slice(0, 2);
      for (const to of targets) {
        links.push({
          fromPageId: from.id,
          fromPageTitle: from.title,
          fromPageUrl: from.url,
          toPageId: to.id,
          toPageTitle: to.title,
          toPageUrl: to.url,
          anchorText: to.title,
          context: "sibling cross-link",
          linkType: "contextual",
        });
      }
    }
  }

  return links;
}

/**
 * Inject internal links into WordPress page content
 */
export async function injectInternalLinks(
  siteUrl: string,
  username: string,
  appPassword: string,
  links: SiteLink[],
): Promise<{ updated: number; failed: number; errors: string[] }> {
  const url = siteUrl.replace(/\/$/, "");
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  // Group links by source page
  const linksByPage = new Map<number, SiteLink[]>();
  for (const link of links) {
    const existing = linksByPage.get(link.fromPageId) || [];
    existing.push(link);
    linksByPage.set(link.fromPageId, existing);
  }

  for (const [pageId, pageLinks] of Array.from(linksByPage.entries())) {
    try {
      // Fetch current content
      const pageType = pageLinks[0].fromPageUrl.includes("/category/") ? "posts" : "pages";
      const getRes = await fetch(`${url}/wp-json/wp/v2/${pageType}/${pageId}`, {
        headers: { "Authorization": `Basic ${auth}` },
        signal: AbortSignal.timeout(15000),
      });

      if (!getRes.ok) {
        // Try posts if pages failed
        const altRes = await fetch(`${url}/wp-json/wp/v2/posts/${pageId}`, {
          headers: { "Authorization": `Basic ${auth}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!altRes.ok) {
          failed++;
          errors.push(`Cannot fetch page ${pageId}`);
          continue;
        }
      }

      let fetchRes = getRes;
      if (!getRes.ok) {
        fetchRes = await fetch(`${url}/wp-json/wp/v2/posts/${pageId}`, {
          headers: { "Authorization": `Basic ${auth}` },
          signal: AbortSignal.timeout(15000),
        });
      }
      const pageData = await fetchRes.json() as any;

      let content = pageData.content?.rendered || pageData.content?.raw || "";

      // Add links at the end of content (before closing tags)
      let linksHtml = "";
      for (const link of pageLinks.slice(0, 5)) { // Max 5 links per page
        // Check if link already exists
        if (content.includes(link.toPageUrl)) continue;

        linksHtml += `<p><a href="${link.toPageUrl}" title="${link.toPageTitle}">${link.anchorText}</a></p>\n`;
      }

      if (linksHtml) {
        content = content + "\n" + linksHtml;

        // Update the page
        const endpoint = pageData.type === "post" ? "posts" : "pages";
        const updateRes = await fetch(`${url}/wp-json/wp/v2/${endpoint}/${pageId}`, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content }),
          signal: AbortSignal.timeout(20000),
        });

        if (updateRes.ok) {
          updated++;
        } else {
          failed++;
          errors.push(`Failed to update page ${pageId}: HTTP ${updateRes.status}`);
        }
      }
    } catch (err: any) {
      failed++;
      errors.push(`Error processing page ${pageId}: ${err.message}`);
    }
  }

  console.log(`[SEO-Linking] ✅ Injected links: ${updated} pages updated, ${failed} failed`);
  return { updated, failed, errors };
}

// ═══════════════════════════════════════════════
// FAQ Generation Engine
// ═══════════════════════════════════════════════

/**
 * Generate SEO-optimized FAQ section with schema markup
 */
export async function generateFaqSection(input: FaqInput): Promise<FaqResult> {
  const {
    primaryKeyword,
    secondaryKeywords = [],
    niche = "gambling",
    brandName = primaryKeyword,
    language = "th",
    existingFaqs = [],
    count = 8,
  } = input;

  console.log(`[SEO-FAQ] ❓ Generating ${count} FAQs for "${primaryKeyword}"`);

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an SEO FAQ generator for ${niche} websites. Generate FAQs that:
- Target "People Also Ask" and featured snippet positions
- Cover different search intents (informational, navigational, transactional)
- Use natural language that matches how people actually search
- Include the primary keyword naturally in questions and answers
- Answers should be 50-150 words, informative, and actionable
- Include secondary keywords where natural
- For gambling niche: cover registration, deposits, games, bonuses, safety, legality
- Language: ${language === "th" ? "Thai" : "English"}
- Brand: ${brandName}

${existingFaqs.length > 0 ? `Existing FAQs (do NOT duplicate): ${existingFaqs.map(f => f.question).join("; ")}` : ""}

Respond in JSON format.`,
        },
        {
          role: "user",
          content: `Generate ${count} FAQs for:
Primary keyword: "${primaryKeyword}"
Secondary keywords: ${secondaryKeywords.join(", ")}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "faq_list",
          strict: true,
          schema: {
            type: "object",
            properties: {
              faqs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question: { type: "string" },
                    answer: { type: "string" },
                    keyword: { type: "string" },
                    searchIntent: { type: "string" },
                  },
                  required: ["question", "answer", "keyword", "searchIntent"],
                  additionalProperties: false,
                },
              },
            },
            required: ["faqs"],
            additionalProperties: false,
          },
        },
      },
    });

    const result = JSON.parse(String(response.choices[0].message.content) || "{}");
    const faqs: GeneratedFaq[] = (result.faqs || []).map((f: any) => ({
      question: f.question,
      answer: f.answer,
      answerHtml: `<p>${f.answer}</p>`,
      keyword: f.keyword,
      searchIntent: f.searchIntent as GeneratedFaq["searchIntent"],
    }));

    // Generate FAQ HTML section
    const faqHtml = generateFaqHtml(faqs);

    // Generate FAQ schema
    const faqSchema = generateFaqSchema(faqs);

    console.log(`[SEO-FAQ] ✅ Generated ${faqs.length} FAQs`);
    return { faqs, faqHtml, faqSchema };
  } catch (err: any) {
    console.error(`[SEO-FAQ] FAQ generation failed: ${err.message}`);
    return { faqs: [], faqHtml: "", faqSchema: "" };
  }
}

function generateFaqHtml(faqs: GeneratedFaq[]): string {
  if (faqs.length === 0) return "";

  let html = `<section class="faq-section" itemscope itemtype="https://schema.org/FAQPage">\n`;
  html += `<h2>คำถามที่พบบ่อย (FAQ)</h2>\n`;

  for (const faq of faqs) {
    html += `<div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">\n`;
    html += `  <h3 itemprop="name">${faq.question}</h3>\n`;
    html += `  <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">\n`;
    html += `    <div itemprop="text">${faq.answerHtml}</div>\n`;
    html += `  </div>\n`;
    html += `</div>\n`;
  }

  html += `</section>`;
  return html;
}

function generateFaqSchema(faqs: GeneratedFaq[]): string {
  if (faqs.length === 0) return "";

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(faq => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

// ═══════════════════════════════════════════════
// Comprehensive Schema Markup Engine
// ═══════════════════════════════════════════════

/**
 * Generate comprehensive schema markup for a page
 */
export function generateComprehensiveSchema(input: SchemaInput): SchemaResult {
  const schemas: Record<string, any>[] = [];
  const validationIssues: string[] = [];

  // 1. Organization schema (always include on homepage)
  if (input.pageType === "homepage" || input.organization) {
    const org = input.organization || { name: input.brandName };
    const orgSchema: Record<string, any> = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: org.name,
      url: input.siteUrl,
    };
    if (org.logoUrl) orgSchema.logo = org.logoUrl;
    if (org.phone) orgSchema.telephone = org.phone;
    if (org.email) orgSchema.email = org.email;
    if (org.address) {
      orgSchema.address = {
        "@type": "PostalAddress",
        streetAddress: org.address,
      };
    }
    if (org.socialProfiles?.length) {
      orgSchema.sameAs = org.socialProfiles;
    }
    schemas.push(orgSchema);
  }

  // 2. WebSite schema (homepage)
  if (input.pageType === "homepage") {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: input.brandName,
      url: input.siteUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: `${input.siteUrl}/?s={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    });
  }

  // 3. WebPage schema (all pages)
  const webPageSchema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": input.pageType === "article" ? "Article" : "WebPage",
    name: input.pageTitle,
    description: input.pageDescription,
    url: input.pageUrl,
    isPartOf: {
      "@type": "WebSite",
      name: input.brandName,
      url: input.siteUrl,
    },
  };

  if (input.article) {
    webPageSchema["@type"] = "Article";
    webPageSchema.headline = input.pageTitle;
    webPageSchema.author = {
      "@type": "Person",
      name: input.article.authorName,
    };
    webPageSchema.datePublished = input.article.datePublished;
    webPageSchema.dateModified = input.article.dateModified;
    if (input.article.imageUrl) {
      webPageSchema.image = input.article.imageUrl;
    }
    webPageSchema.publisher = {
      "@type": "Organization",
      name: input.brandName,
      url: input.siteUrl,
    };
  }
  schemas.push(webPageSchema);

  // 4. BreadcrumbList schema
  if (input.breadcrumbs && input.breadcrumbs.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: input.breadcrumbs.map((bc, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: bc.name,
        item: bc.url,
      })),
    });
  } else {
    // Auto-generate breadcrumbs
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
          name: input.pageTitle,
          item: input.pageUrl,
        },
      ],
    });
  }

  // 5. FAQPage schema
  if (input.faqs && input.faqs.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: input.faqs.map(faq => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    });
  }

  // 6. SiteNavigationElement (homepage)
  if (input.pageType === "homepage") {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "SiteNavigationElement",
      name: "Main Navigation",
      url: input.siteUrl,
    });
  }

  // 7. GamblingService schema (for gambling niche)
  if (input.niche === "gambling" || input.niche === "casino") {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: input.brandName,
      url: input.siteUrl,
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "THB",
      },
    });
  }

  // Validate schemas
  for (const schema of schemas) {
    if (!schema["@context"]) validationIssues.push(`Schema missing @context: ${schema["@type"]}`);
    if (!schema["@type"]) validationIssues.push("Schema missing @type");
    if (schema["@type"] === "Article" && !schema.headline) {
      validationIssues.push("Article schema missing headline");
    }
    if (schema["@type"] === "Organization" && !schema.name) {
      validationIssues.push("Organization schema missing name");
    }
  }

  // Generate HTML
  const schemaHtml = schemas
    .map(s => `<script type="application/ld+json">${JSON.stringify(s, null, 0)}</script>`)
    .join("\n");

  console.log(`[SEO-Schema] ✅ Generated ${schemas.length} schema types, ${validationIssues.length} issues`);

  return { schemas, schemaHtml, validationIssues };
}

/**
 * Deploy schema markup to WordPress page
 */
export async function deploySchemaToWP(
  siteUrl: string,
  username: string,
  appPassword: string,
  pageId: number,
  schemaHtml: string,
  contentType: "page" | "post" = "page",
): Promise<{ success: boolean; error?: string }> {
  const url = siteUrl.replace(/\/$/, "");
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const endpoint = contentType === "page" ? "pages" : "posts";

  try {
    // Get current content
    const getRes = await fetch(`${url}/wp-json/wp/v2/${endpoint}/${pageId}`, {
      headers: { "Authorization": `Basic ${auth}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!getRes.ok) {
      return { success: false, error: `Cannot fetch ${contentType} ${pageId}: HTTP ${getRes.status}` };
    }

    const pageData = await getRes.json() as any;
    let content = pageData.content?.rendered || pageData.content?.raw || "";

    // Remove existing schema scripts
    content = content.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, "");

    // Append new schema
    content = content.trim() + "\n\n" + schemaHtml;

    // Update
    const updateRes = await fetch(`${url}/wp-json/wp/v2/${endpoint}/${pageId}`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(20000),
    });

    if (!updateRes.ok) {
      return { success: false, error: `Failed to update: HTTP ${updateRes.status}` };
    }

    console.log(`[SEO-Schema] ✅ Deployed schema to ${contentType} ${pageId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Deploy FAQ section to WordPress page
 */
export async function deployFaqToWP(
  siteUrl: string,
  username: string,
  appPassword: string,
  pageId: number,
  faqHtml: string,
  faqSchema: string,
  contentType: "page" | "post" = "page",
): Promise<{ success: boolean; error?: string }> {
  const url = siteUrl.replace(/\/$/, "");
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const endpoint = contentType === "page" ? "pages" : "posts";

  try {
    const getRes = await fetch(`${url}/wp-json/wp/v2/${endpoint}/${pageId}`, {
      headers: { "Authorization": `Basic ${auth}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!getRes.ok) {
      return { success: false, error: `Cannot fetch ${contentType} ${pageId}` };
    }

    const pageData = await getRes.json() as any;
    let content = pageData.content?.rendered || pageData.content?.raw || "";

    // Remove existing FAQ section
    content = content.replace(/<section class="faq-section"[\s\S]*?<\/section>/gi, "");

    // Add FAQ before closing content + schema
    content = content.trim() + "\n\n" + faqHtml + "\n\n" + faqSchema;

    const updateRes = await fetch(`${url}/wp-json/wp/v2/${endpoint}/${pageId}`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(20000),
    });

    if (!updateRes.ok) {
      return { success: false, error: `Failed to update: HTTP ${updateRes.status}` };
    }

    console.log(`[SEO-FAQ] ✅ Deployed FAQ to ${contentType} ${pageId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
