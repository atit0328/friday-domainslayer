/**
 * Schema Markup Injector — Auto-inject Structured Data for Rich Snippets
 *
 * Generates and injects JSON-LD structured data into deployed content to maximize
 * Google rich snippet appearance. Supports:
 *   - FAQPage schema (AI-generated Q&A pairs)
 *   - HowTo schema (step-by-step detection)
 *   - Article/NewsArticle schema
 *   - BreadcrumbList schema
 *   - Organization schema
 *   - LocalBusiness schema (geo-targeting)
 *   - Sitelinks SearchAction schema
 *   - WebPage schema
 *
 * All schemas follow Google's structured data guidelines for maximum rich result eligibility.
 */

import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export type SchemaType =
  | "FAQPage"
  | "HowTo"
  | "Article"
  | "NewsArticle"
  | "BreadcrumbList"
  | "Organization"
  | "LocalBusiness"
  | "SearchAction"
  | "WebPage"
  | "Product"
  | "Review";

export interface SchemaMarkup {
  id: string;
  type: SchemaType;
  jsonLd: Record<string, any>;
  targetUrl: string;
  keyword: string;
  generatedAt: Date;
  validated: boolean;
  validationErrors: string[];
}

export interface SchemaInjectionConfig {
  domain: string;
  keywords: string[];
  brandName: string;
  brandDescription?: string;
  brandLogo?: string;
  brandUrl?: string;
  locale?: string;
  geo?: {
    latitude?: number;
    longitude?: number;
    region?: string;
    city?: string;
  };
  enableFAQ: boolean;
  enableHowTo: boolean;
  enableArticle: boolean;
  enableBreadcrumb: boolean;
  enableOrganization: boolean;
  enableLocalBusiness: boolean;
  enableSearchAction: boolean;
}

export interface SchemaInjectionReport {
  domain: string;
  totalGenerated: number;
  byType: Record<SchemaType, number>;
  validated: number;
  failed: number;
  schemas: SchemaMarkup[];
  generatedAt: Date;
}

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════

const activeSchemas = new Map<string, SchemaMarkup[]>();
const injectionHistory: SchemaInjectionReport[] = [];

// ═══════════════════════════════════════════════
//  GETTERS
// ═══════════════════════════════════════════════

export function getActiveSchemas(domain?: string): SchemaMarkup[] {
  if (domain) {
    return activeSchemas.get(domain) || [];
  }
  const all: SchemaMarkup[] = [];
  Array.from(activeSchemas.values()).forEach(schemas => all.push(...schemas));
  return all;
}

export function getInjectionHistory(): SchemaInjectionReport[] {
  return [...injectionHistory];
}

export function getSchemaSummary(): {
  totalSchemas: number;
  byType: Record<string, number>;
  domains: number;
  validated: number;
} {
  const all = getActiveSchemas();
  const byType: Record<string, number> = {};
  let validated = 0;

  for (const s of all) {
    byType[s.type] = (byType[s.type] || 0) + 1;
    if (s.validated) validated++;
  }

  return {
    totalSchemas: all.length,
    byType,
    domains: activeSchemas.size,
    validated,
  };
}

// ═══════════════════════════════════════════════
//  SCHEMA GENERATORS
// ═══════════════════════════════════════════════

/**
 * Generate FAQPage schema — AI creates Q&A pairs from keyword/content
 */
export async function generateFAQSchema(
  keyword: string,
  targetUrl: string,
  niche: string = "gambling",
  count: number = 5,
): Promise<SchemaMarkup> {
  const id = `faq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an SEO expert. Generate ${count} FAQ question-answer pairs for the keyword "${keyword}" in the ${niche} niche. Each answer should be 2-3 sentences, informative, and naturally incorporate the keyword. Return JSON array with objects having "question" and "answer" fields.`,
        },
        {
          role: "user",
          content: `Generate ${count} FAQ pairs for: "${keyword}"\nTarget URL: ${targetUrl}\nMake questions natural and search-friendly.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "faq_pairs",
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
                  },
                  required: ["question", "answer"],
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

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent) || "{}";
    const parsed = JSON.parse(content);
    const faqs = parsed.faqs || [];

    const jsonLd: Record<string, any> = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((faq: any) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    };

    const schema: SchemaMarkup = {
      id,
      type: "FAQPage",
      jsonLd,
      targetUrl,
      keyword,
      generatedAt: new Date(),
      validated: true,
      validationErrors: [],
    };

    // Validate
    const errors = validateFAQSchema(jsonLd);
    schema.validated = errors.length === 0;
    schema.validationErrors = errors;

    return schema;
  } catch (err: any) {
    return {
      id,
      type: "FAQPage",
      jsonLd: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] },
      targetUrl,
      keyword,
      generatedAt: new Date(),
      validated: false,
      validationErrors: [`Generation failed: ${err.message}`],
    };
  }
}

/**
 * Generate HowTo schema — AI creates step-by-step instructions
 */
export async function generateHowToSchema(
  keyword: string,
  targetUrl: string,
  niche: string = "gambling",
): Promise<SchemaMarkup> {
  const id = `howto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an SEO expert. Generate a HowTo guide for the keyword "${keyword}" in the ${niche} niche. Create 5-8 clear steps. Return JSON with "name" (title), "description" (brief intro), "totalTime" (ISO 8601 duration like PT30M), and "steps" array with "name" and "text" fields.`,
        },
        {
          role: "user",
          content: `Generate HowTo steps for: "${keyword}"\nMake it practical and search-friendly.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "howto_guide",
          strict: true,
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              totalTime: { type: "string" },
              steps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    text: { type: "string" },
                  },
                  required: ["name", "text"],
                  additionalProperties: false,
                },
              },
            },
            required: ["name", "description", "totalTime", "steps"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent) || "{}";
    const parsed = JSON.parse(content);

    const jsonLd: Record<string, any> = {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: parsed.name || `How to ${keyword}`,
      description: parsed.description || "",
      totalTime: parsed.totalTime || "PT30M",
      step: (parsed.steps || []).map((step: any, i: number) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: step.name,
        text: step.text,
        url: `${targetUrl}#step-${i + 1}`,
      })),
    };

    const errors = validateHowToSchema(jsonLd);
    return {
      id,
      type: "HowTo",
      jsonLd,
      targetUrl,
      keyword,
      generatedAt: new Date(),
      validated: errors.length === 0,
      validationErrors: errors,
    };
  } catch (err: any) {
    return {
      id,
      type: "HowTo",
      jsonLd: { "@context": "https://schema.org", "@type": "HowTo", name: keyword, step: [] },
      targetUrl,
      keyword,
      generatedAt: new Date(),
      validated: false,
      validationErrors: [`Generation failed: ${err.message}`],
    };
  }
}

/**
 * Generate Article schema for deployed content
 */
export async function generateArticleSchema(
  title: string,
  description: string,
  targetUrl: string,
  keyword: string,
  authorName: string = "Editorial Team",
  publisherName?: string,
  publisherLogo?: string,
  datePublished?: Date,
): Promise<SchemaMarkup> {
  const id = `article_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = datePublished || new Date();

  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title.slice(0, 110), // Google recommends < 110 chars
    description: description.slice(0, 300),
    url: targetUrl,
    datePublished: now.toISOString(),
    dateModified: now.toISOString(),
    author: {
      "@type": "Person",
      name: authorName,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": targetUrl,
    },
  };

  if (publisherName) {
    jsonLd.publisher = {
      "@type": "Organization",
      name: publisherName,
    };
    if (publisherLogo) {
      jsonLd.publisher.logo = {
        "@type": "ImageObject",
        url: publisherLogo,
      };
    }
  }

  const errors = validateArticleSchema(jsonLd);
  return {
    id,
    type: "Article",
    jsonLd,
    targetUrl,
    keyword,
    generatedAt: new Date(),
    validated: errors.length === 0,
    validationErrors: errors,
  };
}

/**
 * Generate BreadcrumbList schema
 */
export function generateBreadcrumbSchema(
  breadcrumbs: Array<{ name: string; url: string }>,
  targetUrl: string,
  keyword: string,
): SchemaMarkup {
  const id = `breadcrumb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };

  return {
    id,
    type: "BreadcrumbList",
    jsonLd,
    targetUrl,
    keyword,
    generatedAt: new Date(),
    validated: breadcrumbs.length > 0,
    validationErrors: breadcrumbs.length === 0 ? ["Empty breadcrumb list"] : [],
  };
}

/**
 * Generate Organization schema
 */
export function generateOrganizationSchema(
  config: SchemaInjectionConfig,
): SchemaMarkup {
  const id = `org_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: config.brandName,
    url: config.brandUrl || `https://${config.domain}`,
  };

  if (config.brandDescription) {
    jsonLd.description = config.brandDescription;
  }
  if (config.brandLogo) {
    jsonLd.logo = {
      "@type": "ImageObject",
      url: config.brandLogo,
    };
  }

  return {
    id,
    type: "Organization",
    jsonLd,
    targetUrl: config.brandUrl || `https://${config.domain}`,
    keyword: config.brandName,
    generatedAt: new Date(),
    validated: true,
    validationErrors: [],
  };
}

/**
 * Generate LocalBusiness schema for geo-targeted content
 */
export function generateLocalBusinessSchema(
  config: SchemaInjectionConfig,
  businessType: string = "EntertainmentBusiness",
): SchemaMarkup {
  const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": businessType,
    name: config.brandName,
    url: config.brandUrl || `https://${config.domain}`,
  };

  if (config.brandDescription) {
    jsonLd.description = config.brandDescription;
  }
  if (config.geo) {
    if (config.geo.latitude && config.geo.longitude) {
      jsonLd.geo = {
        "@type": "GeoCoordinates",
        latitude: config.geo.latitude,
        longitude: config.geo.longitude,
      };
    }
    if (config.geo.region || config.geo.city) {
      jsonLd.address = {
        "@type": "PostalAddress",
        addressRegion: config.geo.region || "",
        addressLocality: config.geo.city || "",
      };
    }
  }

  return {
    id,
    type: "LocalBusiness",
    jsonLd,
    targetUrl: config.brandUrl || `https://${config.domain}`,
    keyword: config.brandName,
    generatedAt: new Date(),
    validated: true,
    validationErrors: [],
  };
}

/**
 * Generate Sitelinks SearchAction schema
 */
export function generateSearchActionSchema(
  domain: string,
  searchUrlTemplate: string = `https://${domain}/search?q={search_term_string}`,
): SchemaMarkup {
  const id = `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: `https://${domain}`,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: searchUrlTemplate,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return {
    id,
    type: "SearchAction",
    jsonLd,
    targetUrl: `https://${domain}`,
    keyword: domain,
    generatedAt: new Date(),
    validated: true,
    validationErrors: [],
  };
}

/**
 * Generate WebPage schema
 */
export function generateWebPageSchema(
  title: string,
  description: string,
  targetUrl: string,
  keyword: string,
): SchemaMarkup {
  const id = `webpage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: targetUrl,
    datePublished: new Date().toISOString(),
    dateModified: new Date().toISOString(),
    inLanguage: "th",
  };

  return {
    id,
    type: "WebPage",
    jsonLd,
    targetUrl,
    keyword,
    generatedAt: new Date(),
    validated: true,
    validationErrors: [],
  };
}

// ═══════════════════════════════════════════════
//  VALIDATORS
// ═══════════════════════════════════════════════

function validateFAQSchema(jsonLd: Record<string, any>): string[] {
  const errors: string[] = [];
  if (!jsonLd["@context"]) errors.push("Missing @context");
  if (jsonLd["@type"] !== "FAQPage") errors.push("Invalid @type");
  if (!Array.isArray(jsonLd.mainEntity)) errors.push("mainEntity must be array");
  if (Array.isArray(jsonLd.mainEntity)) {
    for (let i = 0; i < jsonLd.mainEntity.length; i++) {
      const q = jsonLd.mainEntity[i];
      if (!q.name) errors.push(`Q${i + 1}: missing question text`);
      if (!q.acceptedAnswer?.text) errors.push(`Q${i + 1}: missing answer text`);
    }
  }
  return errors;
}

function validateHowToSchema(jsonLd: Record<string, any>): string[] {
  const errors: string[] = [];
  if (!jsonLd["@context"]) errors.push("Missing @context");
  if (jsonLd["@type"] !== "HowTo") errors.push("Invalid @type");
  if (!jsonLd.name) errors.push("Missing name");
  if (!Array.isArray(jsonLd.step) || jsonLd.step.length === 0) errors.push("Must have at least 1 step");
  return errors;
}

function validateArticleSchema(jsonLd: Record<string, any>): string[] {
  const errors: string[] = [];
  if (!jsonLd["@context"]) errors.push("Missing @context");
  if (!jsonLd.headline) errors.push("Missing headline");
  if (jsonLd.headline && jsonLd.headline.length > 110) errors.push("Headline exceeds 110 chars");
  if (!jsonLd.datePublished) errors.push("Missing datePublished");
  if (!jsonLd.author) errors.push("Missing author");
  return errors;
}

/**
 * Validate any schema markup
 */
export function validateSchema(schema: SchemaMarkup): string[] {
  const jsonLd = schema.jsonLd;
  const errors: string[] = [];

  if (!jsonLd["@context"]) errors.push("Missing @context");
  if (!jsonLd["@type"]) errors.push("Missing @type");

  switch (schema.type) {
    case "FAQPage":
      errors.push(...validateFAQSchema(jsonLd));
      break;
    case "HowTo":
      errors.push(...validateHowToSchema(jsonLd));
      break;
    case "Article":
    case "NewsArticle":
      errors.push(...validateArticleSchema(jsonLd));
      break;
  }

  return errors;
}

// ═══════════════════════════════════════════════
//  BULK INJECTION
// ═══════════════════════════════════════════════

/**
 * Generate all applicable schemas for a content piece
 */
export async function generateSchemasForContent(
  config: SchemaInjectionConfig,
  contentUrl: string,
  contentTitle: string,
  contentDescription: string,
  keyword: string,
): Promise<SchemaMarkup[]> {
  const schemas: SchemaMarkup[] = [];

  // FAQ Schema
  if (config.enableFAQ) {
    try {
      const faq = await generateFAQSchema(keyword, contentUrl);
      schemas.push(faq);
    } catch (err: any) {
      console.error(`[SchemaInjector] FAQ generation failed for ${keyword}:`, err.message);
    }
  }

  // HowTo Schema
  if (config.enableHowTo) {
    try {
      const howTo = await generateHowToSchema(keyword, contentUrl);
      schemas.push(howTo);
    } catch (err: any) {
      console.error(`[SchemaInjector] HowTo generation failed for ${keyword}:`, err.message);
    }
  }

  // Article Schema
  if (config.enableArticle) {
    const article = await generateArticleSchema(
      contentTitle,
      contentDescription,
      contentUrl,
      keyword,
      "Editorial Team",
      config.brandName,
      config.brandLogo,
    );
    schemas.push(article);
  }

  // Breadcrumb Schema
  if (config.enableBreadcrumb) {
    const breadcrumbs = [
      { name: "Home", url: `https://${config.domain}` },
      { name: keyword, url: contentUrl },
    ];
    schemas.push(generateBreadcrumbSchema(breadcrumbs, contentUrl, keyword));
  }

  // Organization Schema (once per domain)
  if (config.enableOrganization) {
    const existing = getActiveSchemas(config.domain).find(s => s.type === "Organization");
    if (!existing) {
      schemas.push(generateOrganizationSchema(config));
    }
  }

  // LocalBusiness Schema
  if (config.enableLocalBusiness && config.geo) {
    const existing = getActiveSchemas(config.domain).find(s => s.type === "LocalBusiness");
    if (!existing) {
      schemas.push(generateLocalBusinessSchema(config));
    }
  }

  // SearchAction Schema (once per domain)
  if (config.enableSearchAction) {
    const existing = getActiveSchemas(config.domain).find(s => s.type === "SearchAction");
    if (!existing) {
      schemas.push(generateSearchActionSchema(config.domain));
    }
  }

  // WebPage Schema
  schemas.push(generateWebPageSchema(contentTitle, contentDescription, contentUrl, keyword));

  // Store
  const domainSchemas = activeSchemas.get(config.domain) || [];
  domainSchemas.push(...schemas);
  activeSchemas.set(config.domain, domainSchemas);

  return schemas;
}

/**
 * Convert schema to injectable HTML script tag
 */
export function schemaToHtml(schema: SchemaMarkup): string {
  return `<script type="application/ld+json">\n${JSON.stringify(schema.jsonLd, null, 2)}\n</script>`;
}

/**
 * Convert multiple schemas to a single injectable HTML block
 */
export function schemasToHtml(schemas: SchemaMarkup[]): string {
  return schemas.map(s => schemaToHtml(s)).join("\n");
}

/**
 * Inject schemas into HTML content (adds before </head> or at end)
 */
export function injectSchemasIntoHtml(html: string, schemas: SchemaMarkup[]): string {
  const scriptBlock = schemasToHtml(schemas);

  // Try to inject before </head>
  if (html.includes("</head>")) {
    return html.replace("</head>", `${scriptBlock}\n</head>`);
  }

  // Try to inject before </body>
  if (html.includes("</body>")) {
    return html.replace("</body>", `${scriptBlock}\n</body>`);
  }

  // Append at end
  return html + "\n" + scriptBlock;
}

// ═══════════════════════════════════════════════
//  FULL INJECTION PIPELINE
// ═══════════════════════════════════════════════

/**
 * Run full schema injection for a domain's content
 */
export async function runSchemaInjection(
  config: SchemaInjectionConfig,
  contentPages: Array<{
    url: string;
    title: string;
    description: string;
    keyword: string;
  }>,
): Promise<SchemaInjectionReport> {
  console.log(`[SchemaInjector] Starting injection for ${config.domain} — ${contentPages.length} pages`);

  const allSchemas: SchemaMarkup[] = [];
  const byType: Record<SchemaType, number> = {} as any;
  let validated = 0;
  let failed = 0;

  for (const page of contentPages) {
    try {
      const schemas = await generateSchemasForContent(
        config,
        page.url,
        page.title,
        page.description,
        page.keyword,
      );

      for (const s of schemas) {
        allSchemas.push(s);
        byType[s.type] = (byType[s.type] || 0) + 1;
        if (s.validated) validated++;
        else failed++;
      }
    } catch (err: any) {
      console.error(`[SchemaInjector] Failed for ${page.url}:`, err.message);
      failed++;
    }
  }

  const report: SchemaInjectionReport = {
    domain: config.domain,
    totalGenerated: allSchemas.length,
    byType,
    validated,
    failed,
    schemas: allSchemas,
    generatedAt: new Date(),
  };

  injectionHistory.push(report);
  console.log(`[SchemaInjector] Done: ${allSchemas.length} schemas (${validated} valid, ${failed} failed)`);

  return report;
}

/**
 * Create default config for a domain
 */
export function createDefaultConfig(
  domain: string,
  brandName: string,
  keywords: string[],
): SchemaInjectionConfig {
  return {
    domain,
    keywords,
    brandName,
    enableFAQ: true,
    enableHowTo: true,
    enableArticle: true,
    enableBreadcrumb: true,
    enableOrganization: true,
    enableLocalBusiness: false,
    enableSearchAction: true,
  };
}
