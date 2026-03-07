/**
 * Web Scraper — Extract real content from websites
 * 
 * Scrapes: title, meta description, H1-H6, bold/strong text, 
 * meta keywords, OG tags, canonical, language detection
 */

import axios from "axios";
import * as cheerio from "cheerio";

export interface ScrapedContent {
  url: string;
  title: string;
  metaDescription: string;
  metaKeywords: string[];
  ogTitle: string;
  ogDescription: string;
  canonical: string;
  language: string;
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
    h4: string[];
    h5: string[];
    h6: string[];
  };
  boldTexts: string[];
  strongTexts: string[];
  links: {
    internal: number;
    external: number;
    nofollow: number;
  };
  images: {
    total: number;
    withAlt: number;
    withoutAlt: number;
  };
  wordCount: number;
  textContent: string; // First 3000 chars of visible text
  detectedLanguage: "th" | "en" | "zh" | "ja" | "ko" | "other";
  statusCode: number;
  loadTimeMs: number;
  hasSSL: boolean;
  serverHeader: string;
  contentType: string;
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Detect language from text content
 */
function detectLanguage(text: string): ScrapedContent["detectedLanguage"] {
  // Thai characters: \u0E00-\u0E7F
  const thaiChars = (text.match(/[\u0E00-\u0E7F]/g) || []).length;
  // Chinese characters: \u4E00-\u9FFF
  const chineseChars = (text.match(/[\u4E00-\u9FFF]/g) || []).length;
  // Japanese: Hiragana + Katakana
  const japaneseChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
  // Korean: Hangul
  const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  // English/Latin
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;

  const total = thaiChars + chineseChars + japaneseChars + koreanChars + latinChars;
  if (total === 0) return "other";

  const thaiRatio = thaiChars / total;
  const chineseRatio = chineseChars / total;
  const japaneseRatio = japaneseChars / total;
  const koreanRatio = koreanChars / total;

  if (thaiRatio > 0.15) return "th";
  if (chineseRatio > 0.15) return "zh";
  if (japaneseRatio > 0.15) return "ja";
  if (koreanRatio > 0.15) return "ko";
  return "en";
}

/**
 * Extract keywords from text content (supports Thai and other languages)
 */
export function extractKeywordsFromContent(scraped: ScrapedContent): string[] {
  const keywords: string[] = [];

  // 1. Meta keywords
  if (scraped.metaKeywords.length > 0) {
    keywords.push(...scraped.metaKeywords);
  }

  // 2. Title words/phrases
  if (scraped.title) {
    keywords.push(scraped.title);
  }

  // 3. H1 headings (most important)
  for (const h1 of scraped.headings.h1) {
    if (h1.trim()) keywords.push(h1.trim());
  }

  // 4. H2 headings
  for (const h2 of scraped.headings.h2) {
    if (h2.trim()) keywords.push(h2.trim());
  }

  // 5. H3 headings
  for (const h3 of scraped.headings.h3) {
    if (h3.trim()) keywords.push(h3.trim());
  }

  // 6. Bold/Strong text (important emphasis)
  for (const bold of [...scraped.boldTexts, ...scraped.strongTexts]) {
    const trimmed = bold.trim();
    if (trimmed && trimmed.length > 2 && trimmed.length < 100) {
      keywords.push(trimmed);
    }
  }

  // 7. Meta description phrases
  if (scraped.metaDescription) {
    keywords.push(scraped.metaDescription);
  }

  // Deduplicate and clean
  const seen = new Set<string>();
  const result: string[] = [];
  for (const kw of keywords) {
    const clean = kw.trim().replace(/\s+/g, " ");
    if (clean && !seen.has(clean.toLowerCase()) && clean.length > 1) {
      seen.add(clean.toLowerCase());
      result.push(clean);
    }
  }

  return result.slice(0, 50); // Max 50 keywords
}

/**
 * Scrape a website and extract structured content
 */
export async function scrapeWebsite(domain: string): Promise<ScrapedContent> {
  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  const hasSSL = url.startsWith("https");
  const startTime = Date.now();

  let html = "";
  let statusCode = 0;
  let serverHeader = "";
  let contentType = "";

  // Try HTTPS first, then HTTP
  for (const protocol of [url, url.replace("https://", "http://")]) {
    try {
      const resp = await axios.get(protocol, {
        headers: {
          "User-Agent": randomUA(),
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
          "Accept-Encoding": "gzip, deflate",
          "Cache-Control": "no-cache",
        },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: () => true,
      });
      html = typeof resp.data === "string" ? resp.data : String(resp.data);
      statusCode = resp.status;
      serverHeader = resp.headers["server"] || "";
      contentType = resp.headers["content-type"] || "";
      break;
    } catch (err: any) {
      if (protocol === url.replace("https://", "http://")) {
        // Both failed
        return createEmptyResult(domain, url, err.message);
      }
    }
  }

  const loadTimeMs = Date.now() - startTime;
  const $ = cheerio.load(html);

  // Remove script and style tags for text extraction
  $("script, style, noscript, iframe").remove();

  // Extract title
  const title = $("title").first().text().trim() || $('meta[property="og:title"]').attr("content") || "";

  // Extract meta description
  const metaDescription = $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") || "";

  // Extract meta keywords
  const metaKeywordsRaw = $('meta[name="keywords"]').attr("content") || "";
  const metaKeywords = metaKeywordsRaw
    .split(",")
    .map(k => k.trim())
    .filter(k => k.length > 0);

  // Extract OG tags
  const ogTitle = $('meta[property="og:title"]').attr("content") || "";
  const ogDescription = $('meta[property="og:description"]').attr("content") || "";

  // Extract canonical
  const canonical = $('link[rel="canonical"]').attr("href") || "";

  // Detect language from html lang attribute or content
  const htmlLang = $("html").attr("lang") || "";

  // Extract headings
  const headings = {
    h1: $("h1").map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0),
    h2: $("h2").map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0),
    h3: $("h3").map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0),
    h4: $("h4").map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0),
    h5: $("h5").map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0),
    h6: $("h6").map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0),
  };

  // Extract bold and strong text
  const boldTexts = $("b").map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0);
  const strongTexts = $("strong").map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0);

  // Count links
  const allLinks = $("a[href]");
  const domainBase = domain.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
  let internalLinks = 0;
  let externalLinks = 0;
  let nofollowLinks = 0;
  allLinks.each((_: number, el: any) => {
    const href = $(el).attr("href") || "";
    const rel = $(el).attr("rel") || "";
    if (href.includes(domainBase) || href.startsWith("/") || href.startsWith("#")) {
      internalLinks++;
    } else if (href.startsWith("http")) {
      externalLinks++;
    }
    if (rel.includes("nofollow")) nofollowLinks++;
  });

  // Count images
  const allImages = $("img");
  let withAlt = 0;
  let withoutAlt = 0;
  allImages.each((_: number, el: any) => {
    const alt = $(el).attr("alt");
    if (alt && alt.trim().length > 0) withAlt++;
    else withoutAlt++;
  });

  // Extract visible text
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const textContent = bodyText.slice(0, 3000);
  const wordCount = bodyText.split(/\s+/).filter((w: string) => w.length > 0).length;

  // Detect language
  let detectedLanguage: ScrapedContent["detectedLanguage"] = "en";
  if (htmlLang.startsWith("th")) {
    detectedLanguage = "th";
  } else if (htmlLang.startsWith("zh")) {
    detectedLanguage = "zh";
  } else if (htmlLang.startsWith("ja")) {
    detectedLanguage = "ja";
  } else if (htmlLang.startsWith("ko")) {
    detectedLanguage = "ko";
  } else {
    detectedLanguage = detectLanguage(textContent);
  }

  return {
    url,
    title,
    metaDescription,
    metaKeywords,
    ogTitle,
    ogDescription,
    canonical,
    language: htmlLang || detectedLanguage,
    headings,
    boldTexts: boldTexts.slice(0, 30),
    strongTexts: strongTexts.slice(0, 30),
    links: { internal: internalLinks, external: externalLinks, nofollow: nofollowLinks },
    images: { total: allImages.length, withAlt, withoutAlt },
    wordCount,
    textContent,
    detectedLanguage,
    statusCode,
    loadTimeMs,
    hasSSL,
    serverHeader,
    contentType,
  };
}

function createEmptyResult(domain: string, url: string, error: string): ScrapedContent {
  return {
    url,
    title: "",
    metaDescription: "",
    metaKeywords: [],
    ogTitle: "",
    ogDescription: "",
    canonical: "",
    language: "",
    headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
    boldTexts: [],
    strongTexts: [],
    links: { internal: 0, external: 0, nofollow: 0 },
    images: { total: 0, withAlt: 0, withoutAlt: 0 },
    wordCount: 0,
    textContent: `[Scrape failed: ${error}]`,
    detectedLanguage: "other",
    statusCode: 0,
    loadTimeMs: 0,
    hasSSL: url.startsWith("https"),
    serverHeader: "",
    contentType: "",
  };
}
