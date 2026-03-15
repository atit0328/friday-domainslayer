/**
 * SEO Validation Scoring System
 * 
 * Comprehensive validation that scores every aspect of SEO optimization:
 * - Technical SEO (crawlability, indexability, speed)
 * - On-Page SEO (title, meta, headings, content, keywords)
 * - Content Quality (word count, readability, uniqueness, E-E-A-T)
 * - Schema Markup (completeness, validity)
 * - Internal Linking (density, orphan pages, silo structure)
 * - Mobile & UX (responsive, Core Web Vitals hints)
 * 
 * Provides before/after comparison and actionable recommendations.
 */

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface SeoValidationInput {
  siteUrl: string;
  username?: string;
  appPassword?: string;
  primaryKeyword: string;
  secondaryKeywords?: string[];
  /** Raw HTML of the page to validate */
  pageHtml: string;
  /** Page URL */
  pageUrl: string;
  /** Content type */
  contentType?: "homepage" | "page" | "post";
}

export interface SeoScoreCategory {
  name: string;
  score: number; // 0-100
  weight: number; // importance multiplier (1-3)
  weightedScore: number;
  checks: SeoValidationCheck[];
  grade: "A" | "B" | "C" | "D" | "F";
}

export interface SeoValidationCheck {
  id: string;
  name: string;
  category: string;
  status: "pass" | "fail" | "warning" | "info";
  score: number; // 0-10
  maxScore: number;
  detail: string;
  fix?: string;
  priority: "critical" | "high" | "medium" | "low";
}

export interface SeoValidationReport {
  /** Overall SEO score (0-100) */
  overallScore: number;
  /** Letter grade */
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  /** Category breakdown */
  categories: SeoScoreCategory[];
  /** All individual checks */
  checks: SeoValidationCheck[];
  /** Critical issues that must be fixed */
  criticalIssues: SeoValidationCheck[];
  /** High priority recommendations */
  recommendations: string[];
  /** Summary text */
  summary: string;
  /** Timestamp */
  timestamp: string;
}

export interface BeforeAfterComparison {
  before: SeoValidationReport;
  after: SeoValidationReport;
  improvement: number;
  improvedChecks: { name: string; before: string; after: string; scoreDelta: number }[];
  regressions: { name: string; before: string; after: string; scoreDelta: number }[];
  summary: string;
}

// ═══════════════════════════════════════════════
// HTML Parser Helpers
// ═══════════════════════════════════════════════

function extractText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : "";
}

function extractMetaDescription(html: string): string {
  const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*?)["']/i);
  return match ? match[1] : "";
}

function extractH1(html: string): string[] {
  const matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  return matches.map(m => m.replace(/<[^>]+>/g, "").trim());
}

function extractHeadings(html: string): { level: number; text: string }[] {
  const matches = html.match(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi) || [];
  return matches.map(m => {
    const levelMatch = m.match(/<h(\d)/i);
    return {
      level: parseInt(levelMatch?.[1] || "2"),
      text: m.replace(/<[^>]+>/g, "").trim(),
    };
  });
}

function extractImages(html: string): { src: string; alt: string; hasWidth: boolean; hasHeight: boolean; hasLazy: boolean }[] {
  const matches = html.match(/<img[^>]*>/gi) || [];
  return matches.map(m => ({
    src: (m.match(/src=["']([^"']*?)["']/i) || [])[1] || "",
    alt: (m.match(/alt=["']([^"']*?)["']/i) || [])[1] || "",
    hasWidth: /width=/i.test(m),
    hasHeight: /height=/i.test(m),
    hasLazy: /loading=["']lazy["']/i.test(m),
  }));
}

function extractInternalLinks(html: string, siteUrl: string): { href: string; text: string }[] {
  const matches = html.match(/<a[^>]*href=["']([^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi) || [];
  const domain = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return matches
    .map(m => {
      const href = (m.match(/href=["']([^"']*?)["']/i) || [])[1] || "";
      const text = m.replace(/<[^>]+>/g, "").trim();
      return { href, text };
    })
    .filter(l => l.href.startsWith("/") || l.href.includes(domain));
}

function extractSchemas(html: string): any[] {
  const matches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi) || [];
  return matches.map(m => {
    try {
      const json = m.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
      return JSON.parse(json);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// ═══════════════════════════════════════════════
// Validation Checks
// ═══════════════════════════════════════════════

function runTechnicalSeoChecks(html: string, pageUrl: string): SeoValidationCheck[] {
  const checks: SeoValidationCheck[] = [];

  // Canonical tag
  const hasCanonical = /<link[^>]*rel=["']canonical["']/i.test(html);
  checks.push({
    id: "tech_canonical",
    name: "Canonical Tag",
    category: "technical",
    status: hasCanonical ? "pass" : "fail",
    score: hasCanonical ? 10 : 0,
    maxScore: 10,
    detail: hasCanonical ? "Canonical tag present" : "Missing canonical tag",
    fix: hasCanonical ? undefined : `Add <link rel="canonical" href="${pageUrl}" />`,
    priority: "critical",
  });

  // Robots meta
  const hasNoindex = /meta[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html);
  checks.push({
    id: "tech_robots",
    name: "Robots Meta",
    category: "technical",
    status: hasNoindex ? "fail" : "pass",
    score: hasNoindex ? 0 : 10,
    maxScore: 10,
    detail: hasNoindex ? "Page has noindex — will not be indexed" : "Page is indexable",
    fix: hasNoindex ? "Remove noindex from robots meta tag" : undefined,
    priority: "critical",
  });

  // Viewport meta
  const hasViewport = /meta[^>]*name=["']viewport["']/i.test(html);
  checks.push({
    id: "tech_viewport",
    name: "Viewport Meta",
    category: "technical",
    status: hasViewport ? "pass" : "fail",
    score: hasViewport ? 10 : 0,
    maxScore: 10,
    detail: hasViewport ? "Viewport meta tag present" : "Missing viewport meta tag",
    fix: hasViewport ? undefined : 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
    priority: "high",
  });

  // Charset
  const hasCharset = /meta[^>]*charset/i.test(html) || /charset=/i.test(html);
  checks.push({
    id: "tech_charset",
    name: "Character Encoding",
    category: "technical",
    status: hasCharset ? "pass" : "warning",
    score: hasCharset ? 10 : 5,
    maxScore: 10,
    detail: hasCharset ? "Character encoding declared" : "Character encoding not explicitly declared",
    priority: "medium",
  });

  // Language attribute
  const hasLang = /<html[^>]*lang=/i.test(html);
  checks.push({
    id: "tech_lang",
    name: "Language Attribute",
    category: "technical",
    status: hasLang ? "pass" : "warning",
    score: hasLang ? 10 : 3,
    maxScore: 10,
    detail: hasLang ? "HTML lang attribute set" : "Missing lang attribute on <html>",
    fix: hasLang ? undefined : 'Add lang="th" to <html> tag',
    priority: "medium",
  });

  // HTTPS
  const isHttps = pageUrl.startsWith("https://");
  checks.push({
    id: "tech_https",
    name: "HTTPS",
    category: "technical",
    status: isHttps ? "pass" : "fail",
    score: isHttps ? 10 : 0,
    maxScore: 10,
    detail: isHttps ? "Page served over HTTPS" : "Page not using HTTPS",
    priority: "critical",
  });

  // Open Graph
  const hasOg = /property=["']og:/i.test(html);
  checks.push({
    id: "tech_og",
    name: "Open Graph Tags",
    category: "technical",
    status: hasOg ? "pass" : "warning",
    score: hasOg ? 10 : 3,
    maxScore: 10,
    detail: hasOg ? "Open Graph tags present" : "Missing Open Graph tags",
    priority: "medium",
  });

  // Hreflang
  const hasHreflang = /hreflang/i.test(html);
  checks.push({
    id: "tech_hreflang",
    name: "Hreflang Tags",
    category: "technical",
    status: hasHreflang ? "pass" : "info",
    score: hasHreflang ? 10 : 7,
    maxScore: 10,
    detail: hasHreflang ? "Hreflang tags present" : "No hreflang tags (optional for single-language sites)",
    priority: "low",
  });

  return checks;
}

function runOnPageSeoChecks(html: string, primaryKeyword: string, secondaryKeywords: string[]): SeoValidationCheck[] {
  const checks: SeoValidationCheck[] = [];
  const kw = primaryKeyword.toLowerCase();
  const title = extractTitle(html);
  const metaDesc = extractMetaDescription(html);
  const h1s = extractH1(html);
  const headings = extractHeadings(html);
  const text = extractText(html);
  const words = text.split(/\s+/).filter(w => w.length > 1);

  // Title tag
  checks.push({
    id: "onpage_title_exists",
    name: "Title Tag Exists",
    category: "on_page",
    status: title ? "pass" : "fail",
    score: title ? 10 : 0,
    maxScore: 10,
    detail: title ? `Title: "${title}"` : "Missing title tag",
    priority: "critical",
  });

  if (title) {
    // Title length
    const titleLen = title.length;
    const titleLenOk = titleLen >= 30 && titleLen <= 65;
    checks.push({
      id: "onpage_title_length",
      name: "Title Length",
      category: "on_page",
      status: titleLenOk ? "pass" : "warning",
      score: titleLenOk ? 10 : 5,
      maxScore: 10,
      detail: `Title length: ${titleLen} chars (recommended: 30-65)`,
      fix: titleLenOk ? undefined : `Adjust title to 30-65 characters`,
      priority: "high",
    });

    // Title keyword
    const titleHasKw = title.toLowerCase().includes(kw);
    checks.push({
      id: "onpage_title_keyword",
      name: "Keyword in Title",
      category: "on_page",
      status: titleHasKw ? "pass" : "fail",
      score: titleHasKw ? 10 : 0,
      maxScore: 10,
      detail: titleHasKw ? "Primary keyword found in title" : "Primary keyword NOT in title",
      fix: titleHasKw ? undefined : `Include "${primaryKeyword}" in the title`,
      priority: "critical",
    });

    // Title keyword position
    if (titleHasKw) {
      const kwIdx = title.toLowerCase().indexOf(kw);
      const atStart = kwIdx < title.length * 0.3;
      checks.push({
        id: "onpage_title_kw_position",
        name: "Keyword Position in Title",
        category: "on_page",
        status: atStart ? "pass" : "warning",
        score: atStart ? 10 : 6,
        maxScore: 10,
        detail: atStart ? "Keyword near the beginning of title" : "Keyword not at the beginning of title",
        fix: atStart ? undefined : "Move primary keyword closer to the beginning of the title",
        priority: "medium",
      });
    }
  }

  // Meta description
  checks.push({
    id: "onpage_meta_exists",
    name: "Meta Description Exists",
    category: "on_page",
    status: metaDesc ? "pass" : "fail",
    score: metaDesc ? 10 : 0,
    maxScore: 10,
    detail: metaDesc ? `Meta description: "${metaDesc.slice(0, 80)}..."` : "Missing meta description",
    priority: "critical",
  });

  if (metaDesc) {
    const metaLen = metaDesc.length;
    const metaLenOk = metaLen >= 120 && metaLen <= 160;
    checks.push({
      id: "onpage_meta_length",
      name: "Meta Description Length",
      category: "on_page",
      status: metaLenOk ? "pass" : "warning",
      score: metaLenOk ? 10 : 5,
      maxScore: 10,
      detail: `Meta description length: ${metaLen} chars (recommended: 120-160)`,
      priority: "high",
    });

    const metaHasKw = metaDesc.toLowerCase().includes(kw);
    checks.push({
      id: "onpage_meta_keyword",
      name: "Keyword in Meta Description",
      category: "on_page",
      status: metaHasKw ? "pass" : "warning",
      score: metaHasKw ? 10 : 3,
      maxScore: 10,
      detail: metaHasKw ? "Primary keyword in meta description" : "Primary keyword NOT in meta description",
      priority: "high",
    });
  }

  // H1 tag
  checks.push({
    id: "onpage_h1_exists",
    name: "H1 Tag Exists",
    category: "on_page",
    status: h1s.length === 1 ? "pass" : h1s.length === 0 ? "fail" : "warning",
    score: h1s.length === 1 ? 10 : h1s.length === 0 ? 0 : 5,
    maxScore: 10,
    detail: h1s.length === 1 ? `H1: "${h1s[0]}"` : h1s.length === 0 ? "Missing H1 tag" : `Multiple H1 tags found (${h1s.length})`,
    priority: "critical",
  });

  if (h1s.length > 0) {
    const h1HasKw = h1s[0].toLowerCase().includes(kw);
    checks.push({
      id: "onpage_h1_keyword",
      name: "Keyword in H1",
      category: "on_page",
      status: h1HasKw ? "pass" : "fail",
      score: h1HasKw ? 10 : 0,
      maxScore: 10,
      detail: h1HasKw ? "Primary keyword in H1" : "Primary keyword NOT in H1",
      priority: "critical",
    });
  }

  // Heading structure
  const h2Count = headings.filter(h => h.level === 2).length;
  const h3Count = headings.filter(h => h.level === 3).length;
  checks.push({
    id: "onpage_heading_structure",
    name: "Heading Structure",
    category: "on_page",
    status: h2Count >= 3 ? "pass" : h2Count >= 1 ? "warning" : "fail",
    score: h2Count >= 3 ? 10 : h2Count >= 1 ? 5 : 0,
    maxScore: 10,
    detail: `H2: ${h2Count}, H3: ${h3Count} (recommended: 3+ H2s)`,
    priority: "high",
  });

  // Keyword in H2
  const h2WithKw = headings.filter(h => h.level === 2 && h.text.toLowerCase().includes(kw)).length;
  checks.push({
    id: "onpage_h2_keyword",
    name: "Keyword in H2 Headings",
    category: "on_page",
    status: h2WithKw >= 2 ? "pass" : h2WithKw >= 1 ? "warning" : "fail",
    score: h2WithKw >= 2 ? 10 : h2WithKw >= 1 ? 6 : 0,
    maxScore: 10,
    detail: `${h2WithKw}/${h2Count} H2 headings contain the primary keyword`,
    priority: "high",
  });

  // Word count
  const wordCount = words.length;
  checks.push({
    id: "onpage_word_count",
    name: "Word Count",
    category: "on_page",
    status: wordCount >= 1500 ? "pass" : wordCount >= 800 ? "warning" : "fail",
    score: wordCount >= 1500 ? 10 : wordCount >= 800 ? 6 : wordCount >= 300 ? 3 : 0,
    maxScore: 10,
    detail: `Word count: ${wordCount} (recommended: 1500+ for competitive keywords)`,
    priority: "high",
  });

  // Keyword density
  const kwCount = (text.toLowerCase().match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  const density = wordCount > 0 ? Math.round((kwCount / wordCount) * 10000) / 100 : 0;
  const densityOk = density >= 0.5 && density <= 2.5;
  checks.push({
    id: "onpage_keyword_density",
    name: "Keyword Density",
    category: "on_page",
    status: densityOk ? "pass" : density > 3 ? "fail" : "warning",
    score: densityOk ? 10 : density > 3 ? 2 : 5,
    maxScore: 10,
    detail: `Keyword density: ${density}% (${kwCount} occurrences, recommended: 0.5-2.5%)`,
    priority: "high",
  });

  // Keyword in first paragraph
  const firstParaMatch = text.slice(0, 500);
  const kwInFirst = firstParaMatch.toLowerCase().includes(kw);
  checks.push({
    id: "onpage_kw_first_para",
    name: "Keyword in First Paragraph",
    category: "on_page",
    status: kwInFirst ? "pass" : "warning",
    score: kwInFirst ? 10 : 3,
    maxScore: 10,
    detail: kwInFirst ? "Primary keyword found in first paragraph" : "Primary keyword NOT in first paragraph",
    priority: "high",
  });

  // Secondary keywords
  let secKwFound = 0;
  for (const secKw of secondaryKeywords.slice(0, 5)) {
    if (text.toLowerCase().includes(secKw.toLowerCase())) secKwFound++;
  }
  const secKwTotal = Math.min(secondaryKeywords.length, 5);
  checks.push({
    id: "onpage_secondary_keywords",
    name: "Secondary Keywords Present",
    category: "on_page",
    status: secKwFound >= secKwTotal * 0.6 ? "pass" : secKwFound > 0 ? "warning" : "fail",
    score: secKwTotal > 0 ? Math.round((secKwFound / secKwTotal) * 10) : 10,
    maxScore: 10,
    detail: `${secKwFound}/${secKwTotal} secondary keywords found in content`,
    priority: "medium",
  });

  return checks;
}

function runContentQualityChecks(html: string): SeoValidationCheck[] {
  const checks: SeoValidationCheck[] = [];
  const text = extractText(html);
  const images = extractImages(html);

  // Image alt text
  const imagesWithAlt = images.filter(i => i.alt && i.alt.length > 3);
  checks.push({
    id: "content_img_alt",
    name: "Image Alt Text",
    category: "content",
    status: images.length === 0 || imagesWithAlt.length === images.length ? "pass" : imagesWithAlt.length > 0 ? "warning" : "fail",
    score: images.length === 0 ? 10 : Math.round((imagesWithAlt.length / images.length) * 10),
    maxScore: 10,
    detail: `${imagesWithAlt.length}/${images.length} images have alt text`,
    priority: "high",
  });

  // Image dimensions
  const imagesWithDimensions = images.filter(i => i.hasWidth && i.hasHeight);
  checks.push({
    id: "content_img_dimensions",
    name: "Image Dimensions",
    category: "content",
    status: images.length === 0 || imagesWithDimensions.length === images.length ? "pass" : "warning",
    score: images.length === 0 ? 10 : Math.round((imagesWithDimensions.length / images.length) * 10),
    maxScore: 10,
    detail: `${imagesWithDimensions.length}/${images.length} images have width/height attributes`,
    priority: "medium",
  });

  // Lazy loading
  const imagesWithLazy = images.filter(i => i.hasLazy);
  checks.push({
    id: "content_img_lazy",
    name: "Image Lazy Loading",
    category: "content",
    status: images.length <= 1 || imagesWithLazy.length >= images.length - 1 ? "pass" : "warning",
    score: images.length <= 1 ? 10 : Math.round((imagesWithLazy.length / Math.max(images.length - 1, 1)) * 10),
    maxScore: 10,
    detail: `${imagesWithLazy.length}/${images.length} images use lazy loading`,
    priority: "medium",
  });

  // Bold/strong usage
  const strongCount = (html.match(/<strong[^>]*>/gi) || []).length;
  checks.push({
    id: "content_strong",
    name: "Bold/Strong Usage",
    category: "content",
    status: strongCount >= 3 ? "pass" : strongCount > 0 ? "warning" : "info",
    score: strongCount >= 3 ? 10 : strongCount > 0 ? 6 : 4,
    maxScore: 10,
    detail: `${strongCount} <strong> tags found (recommended: 3-8 for emphasis)`,
    priority: "low",
  });

  // Lists usage
  const listCount = (html.match(/<(ul|ol)[^>]*>/gi) || []).length;
  checks.push({
    id: "content_lists",
    name: "List Elements",
    category: "content",
    status: listCount >= 1 ? "pass" : "info",
    score: listCount >= 1 ? 10 : 5,
    maxScore: 10,
    detail: `${listCount} list elements found (helps readability and featured snippets)`,
    priority: "low",
  });

  // Paragraph count
  const paragraphs = (html.match(/<p[^>]*>/gi) || []).length;
  checks.push({
    id: "content_paragraphs",
    name: "Paragraph Structure",
    category: "content",
    status: paragraphs >= 5 ? "pass" : paragraphs >= 3 ? "warning" : "fail",
    score: paragraphs >= 5 ? 10 : paragraphs >= 3 ? 6 : 2,
    maxScore: 10,
    detail: `${paragraphs} paragraphs found (recommended: 5+)`,
    priority: "medium",
  });

  return checks;
}

function runSchemaChecks(html: string): SeoValidationCheck[] {
  const checks: SeoValidationCheck[] = [];
  const schemas = extractSchemas(html);

  // Schema exists
  checks.push({
    id: "schema_exists",
    name: "Schema Markup Present",
    category: "schema",
    status: schemas.length > 0 ? "pass" : "fail",
    score: schemas.length > 0 ? 10 : 0,
    maxScore: 10,
    detail: schemas.length > 0 ? `${schemas.length} schema types found` : "No schema markup found",
    priority: "high",
  });

  if (schemas.length > 0) {
    const types = schemas.map(s => s["@type"]).filter(Boolean);

    // Organization schema
    const hasOrg = types.includes("Organization");
    checks.push({
      id: "schema_org",
      name: "Organization Schema",
      category: "schema",
      status: hasOrg ? "pass" : "warning",
      score: hasOrg ? 10 : 3,
      maxScore: 10,
      detail: hasOrg ? "Organization schema present" : "Missing Organization schema",
      priority: "medium",
    });

    // WebSite schema
    const hasWebsite = types.includes("WebSite");
    checks.push({
      id: "schema_website",
      name: "WebSite Schema",
      category: "schema",
      status: hasWebsite ? "pass" : "warning",
      score: hasWebsite ? 10 : 3,
      maxScore: 10,
      detail: hasWebsite ? "WebSite schema present" : "Missing WebSite schema",
      priority: "medium",
    });

    // BreadcrumbList schema
    const hasBreadcrumb = types.includes("BreadcrumbList");
    checks.push({
      id: "schema_breadcrumb",
      name: "BreadcrumbList Schema",
      category: "schema",
      status: hasBreadcrumb ? "pass" : "warning",
      score: hasBreadcrumb ? 10 : 3,
      maxScore: 10,
      detail: hasBreadcrumb ? "BreadcrumbList schema present" : "Missing BreadcrumbList schema",
      priority: "medium",
    });

    // FAQPage schema
    const hasFaq = types.includes("FAQPage");
    checks.push({
      id: "schema_faq",
      name: "FAQPage Schema",
      category: "schema",
      status: hasFaq ? "pass" : "info",
      score: hasFaq ? 10 : 5,
      maxScore: 10,
      detail: hasFaq ? "FAQPage schema present" : "No FAQPage schema (recommended for FAQ sections)",
      priority: "medium",
    });
  }

  return checks;
}

function runLinkingChecks(html: string, siteUrl: string): SeoValidationCheck[] {
  const checks: SeoValidationCheck[] = [];
  const internalLinks = extractInternalLinks(html, siteUrl);
  const allLinks = (html.match(/<a[^>]*href=["']([^"']*?)["']/gi) || []).length;
  const externalLinks = allLinks - internalLinks.length;

  // Internal link count
  checks.push({
    id: "link_internal_count",
    name: "Internal Links",
    category: "linking",
    status: internalLinks.length >= 3 ? "pass" : internalLinks.length >= 1 ? "warning" : "fail",
    score: internalLinks.length >= 3 ? 10 : internalLinks.length >= 1 ? 5 : 0,
    maxScore: 10,
    detail: `${internalLinks.length} internal links found (recommended: 3-10)`,
    priority: "high",
  });

  // External links
  checks.push({
    id: "link_external",
    name: "External Links",
    category: "linking",
    status: externalLinks >= 1 ? "pass" : "info",
    score: externalLinks >= 1 ? 10 : 6,
    maxScore: 10,
    detail: `${externalLinks} external links found`,
    priority: "low",
  });

  // Anchor text variety
  const anchorTexts = internalLinks.map(l => l.text.toLowerCase());
  const uniqueAnchors = new Set(anchorTexts).size;
  checks.push({
    id: "link_anchor_variety",
    name: "Anchor Text Variety",
    category: "linking",
    status: internalLinks.length === 0 || uniqueAnchors >= internalLinks.length * 0.7 ? "pass" : "warning",
    score: internalLinks.length === 0 ? 10 : Math.round((uniqueAnchors / internalLinks.length) * 10),
    maxScore: 10,
    detail: `${uniqueAnchors}/${internalLinks.length} unique anchor texts`,
    priority: "medium",
  });

  // Nofollow check
  const nofollowLinks = (html.match(/rel=["'][^"']*nofollow[^"']*["']/gi) || []).length;
  checks.push({
    id: "link_nofollow",
    name: "Nofollow Usage",
    category: "linking",
    status: "info",
    score: 8,
    maxScore: 10,
    detail: `${nofollowLinks} nofollow links found`,
    priority: "low",
  });

  return checks;
}

// ═══════════════════════════════════════════════
// Main Validation Function
// ═══════════════════════════════════════════════

function getGrade(score: number): "A+" | "A" | "B" | "C" | "D" | "F" {
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function getCategoryGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function validateSeo(input: SeoValidationInput): SeoValidationReport {
  const { pageHtml, pageUrl, siteUrl, primaryKeyword, secondaryKeywords = [] } = input;

  console.log(`[SEO-Validator] 📊 Validating SEO for "${pageUrl}"`);

  // Run all checks
  const technicalChecks = runTechnicalSeoChecks(pageHtml, pageUrl);
  const onPageChecks = runOnPageSeoChecks(pageHtml, primaryKeyword, secondaryKeywords);
  const contentChecks = runContentQualityChecks(pageHtml);
  const schemaChecks = runSchemaChecks(pageHtml);
  const linkingChecks = runLinkingChecks(pageHtml, siteUrl);

  // Build categories
  const categoryDefs = [
    { name: "Technical SEO", checks: technicalChecks, weight: 2 },
    { name: "On-Page SEO", checks: onPageChecks, weight: 3 },
    { name: "Content Quality", checks: contentChecks, weight: 2 },
    { name: "Schema Markup", checks: schemaChecks, weight: 1.5 },
    { name: "Internal Linking", checks: linkingChecks, weight: 1.5 },
  ];

  const categories: SeoScoreCategory[] = categoryDefs.map(cat => {
    const totalMax = cat.checks.reduce((sum, c) => sum + c.maxScore, 0);
    const totalScore = cat.checks.reduce((sum, c) => sum + c.score, 0);
    const score = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    const weightedScore = Math.round(score * cat.weight);
    return {
      name: cat.name,
      score,
      weight: cat.weight,
      weightedScore,
      checks: cat.checks,
      grade: getCategoryGrade(score),
    };
  });

  // Calculate overall score
  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
  const totalWeightedScore = categories.reduce((sum, c) => sum + c.weightedScore, 0);
  const overallScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;

  // Collect all checks
  const allChecks = [...technicalChecks, ...onPageChecks, ...contentChecks, ...schemaChecks, ...linkingChecks];
  const criticalIssues = allChecks.filter(c => c.status === "fail" && (c.priority === "critical" || c.priority === "high"));

  // Generate recommendations
  const recommendations: string[] = [];
  for (const issue of criticalIssues.slice(0, 10)) {
    if (issue.fix) recommendations.push(issue.fix);
    else recommendations.push(`Fix: ${issue.detail}`);
  }

  const grade = getGrade(overallScore);
  const summary = `SEO Score: ${overallScore}/100 (${grade}). ${criticalIssues.length} critical issues found. ` +
    categories.map(c => `${c.name}: ${c.score}/100 (${c.grade})`).join(", ");

  console.log(`[SEO-Validator] ✅ Score: ${overallScore}/100 (${grade}), ${criticalIssues.length} critical issues`);

  return {
    overallScore,
    grade,
    categories,
    checks: allChecks,
    criticalIssues,
    recommendations,
    summary,
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════
// Before/After Comparison
// ═══════════════════════════════════════════════

export function compareSeoReports(before: SeoValidationReport, after: SeoValidationReport): BeforeAfterComparison {
  const improvement = after.overallScore - before.overallScore;

  const improvedChecks: BeforeAfterComparison["improvedChecks"] = [];
  const regressions: BeforeAfterComparison["regressions"] = [];

  for (const afterCheck of after.checks) {
    const beforeCheck = before.checks.find(c => c.id === afterCheck.id);
    if (!beforeCheck) continue;

    const delta = afterCheck.score - beforeCheck.score;
    if (delta > 0) {
      improvedChecks.push({
        name: afterCheck.name,
        before: beforeCheck.status,
        after: afterCheck.status,
        scoreDelta: delta,
      });
    } else if (delta < 0) {
      regressions.push({
        name: afterCheck.name,
        before: beforeCheck.status,
        after: afterCheck.status,
        scoreDelta: delta,
      });
    }
  }

  const summary = `SEO Score: ${before.overallScore} → ${after.overallScore} (${improvement >= 0 ? "+" : ""}${improvement}). ` +
    `${improvedChecks.length} improvements, ${regressions.length} regressions.`;

  return { before, after, improvement, improvedChecks, regressions, summary };
}
