/**
 * Cloaking Content Engine — AI-powered SEO gambling content generation
 * 
 * Generates:
 * 1. Full SEO-optimized gambling landing pages (Thai)
 * 2. Internal link pages for keyword coverage
 * 3. Doorway pages for different keyword clusters
 * 4. Parasite content for high-authority sites
 * 5. Auto-rotating content to avoid duplicate detection
 */
import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface ContentConfig {
  primaryKeyword: string;
  keywords: string[];
  brandName: string;
  redirectUrl: string;
  language: "th" | "en";
  contentType: "landing" | "article" | "doorway" | "parasite" | "review";
  wordCount?: number;
}

export interface GeneratedContent {
  title: string;
  metaDescription: string;
  metaKeywords: string;
  h1: string;
  body: string;
  faq: { question: string; answer: string }[];
  internalLinks: { text: string; slug: string }[];
  schemaMarkup: string;
  fullHtml: string;
}

export interface ContentPack {
  mainPage: GeneratedContent;
  doorwayPages: GeneratedContent[];
  sitemapXml: string;
}

type ProgressCallback = (detail: string) => void;

// ═══════════════════════════════════════════════════════
//  KEYWORD CLUSTER GENERATOR
// ═══════════════════════════════════════════════════════

export function generateKeywordClusters(primaryKeyword: string): Record<string, string[]> {
  const clusters: Record<string, string[]> = {
    main: [
      `${primaryKeyword}`,
      `${primaryKeyword} เว็บตรง`,
      `${primaryKeyword} ออนไลน์`,
      `${primaryKeyword} อันดับ 1`,
    ],
    signup: [
      `สมัคร ${primaryKeyword}`,
      `สมัครสมาชิก ${primaryKeyword}`,
      `${primaryKeyword} สมัครฟรี`,
      `วิธีสมัคร ${primaryKeyword}`,
    ],
    bonus: [
      `${primaryKeyword} โบนัส 100`,
      `${primaryKeyword} โปรโมชั่น`,
      `${primaryKeyword} เครดิตฟรี`,
      `${primaryKeyword} ฝาก 10 รับ 100`,
    ],
    play: [
      `${primaryKeyword} ทดลองเล่น`,
      `${primaryKeyword} เล่นฟรี`,
      `${primaryKeyword} ทดลองเล่นฟรี`,
      `เล่น ${primaryKeyword}`,
    ],
    deposit: [
      `${primaryKeyword} ฝากถอน ไม่มี ขั้นต่ำ`,
      `${primaryKeyword} ฝาก-ถอน ออโต้`,
      `${primaryKeyword} ฝากผ่าน true wallet`,
      `${primaryKeyword} ฝากขั้นต่ำ 1 บาท`,
    ],
    review: [
      `${primaryKeyword} รีวิว`,
      `${primaryKeyword} ดีไหม`,
      `${primaryKeyword} pantip`,
      `${primaryKeyword} เชื่อถือได้ไหม`,
    ],
    slot: [
      `สล็อต ${primaryKeyword}`,
      `สล็อตเว็บตรง ${primaryKeyword}`,
      `สล็อต pg ${primaryKeyword}`,
      `สล็อตแตกง่าย ${primaryKeyword}`,
    ],
  };

  return clusters;
}

// ═══════════════════════════════════════════════════════
//  AI CONTENT GENERATOR
// ═══════════════════════════════════════════════════════

export async function aiGenerateContent(
  config: ContentConfig,
  onProgress: ProgressCallback = () => {},
): Promise<GeneratedContent | null> {
  onProgress(`AI กำลังสร้าง ${config.contentType} content สำหรับ "${config.primaryKeyword}"...`);

  const contentTypePrompts: Record<string, string> = {
    landing: `Create a comprehensive landing page for an online gambling website. 
The page should be highly SEO-optimized with:
- Compelling headline with the primary keyword
- 6-8 detailed sections (each 150-200 words) covering: what it is, why choose us, how to sign up, popular games, promotions, deposit/withdrawal, customer service, security
- FAQ section with 5-8 questions
- Strong CTAs throughout
- Professional tone that builds trust`,

    article: `Write an informative article about online gambling/slots.
The article should be:
- 1500-2000 words
- Informative and engaging
- Include tips, strategies, and recommendations
- Natural keyword placement
- Include comparison tables
- Expert tone`,

    doorway: `Create a doorway page optimized for a specific keyword variation.
The page should:
- Focus heavily on the specific keyword
- Be 500-800 words
- Include relevant internal links
- Have a clear CTA
- Appear as a legitimate information page`,

    review: `Write a detailed review of an online gambling platform.
The review should:
- Be 1000-1500 words
- Include pros and cons
- Rating system
- Comparison with competitors
- User testimonials (generated)
- Detailed feature breakdown`,

    parasite: `Create content suitable for posting on high-authority websites.
The content should:
- Appear as a legitimate article/blog post
- Subtle keyword placement
- Include backlinks naturally
- Professional writing style
- 800-1200 words`,
  };

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert Thai SEO content writer specializing in online gambling websites.
${contentTypePrompts[config.contentType] || contentTypePrompts.landing}

IMPORTANT:
- All content MUST be in Thai language
- Primary keyword: "${config.primaryKeyword}"
- Brand name: "${config.brandName}"
- Target URL: "${config.redirectUrl}"
- Related keywords: ${config.keywords.join(", ")}

Return a JSON object with these fields:
{
  "title": "SEO-optimized page title",
  "metaDescription": "Meta description (150-160 chars)",
  "metaKeywords": "comma-separated keywords",
  "h1": "Main heading",
  "sections": [{"heading": "H2 heading", "content": "Section content"}],
  "faq": [{"question": "Q", "answer": "A"}],
  "internalLinks": [{"text": "anchor text", "slug": "url-slug"}]
}`,
        },
        {
          role: "user",
          content: `Generate ${config.contentType} content for: ${config.primaryKeyword}
Brand: ${config.brandName}
Keywords: ${config.keywords.join(", ")}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "seo_content",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              metaDescription: { type: "string" },
              metaKeywords: { type: "string" },
              h1: { type: "string" },
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    heading: { type: "string" },
                    content: { type: "string" },
                  },
                  required: ["heading", "content"],
                  additionalProperties: false,
                },
              },
              faq: {
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
              internalLinks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    slug: { type: "string" },
                  },
                  required: ["text", "slug"],
                  additionalProperties: false,
                },
              },
            },
            required: ["title", "metaDescription", "metaKeywords", "h1", "sections", "faq", "internalLinks"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent || typeof rawContent !== "string") return null;

    const parsed = JSON.parse(rawContent);
    onProgress("AI สร้าง content สำเร็จ — กำลังสร้าง HTML...");

    // Build full HTML from AI content
    const fullHtml = buildHtmlFromContent(parsed, config);

    // Build schema markup
    const schemaMarkup = buildSchemaMarkup(parsed, config);

    return {
      title: parsed.title,
      metaDescription: parsed.metaDescription,
      metaKeywords: parsed.metaKeywords,
      h1: parsed.h1,
      body: parsed.sections.map((s: { heading: string; content: string }) => `<h2>${s.heading}</h2>\n<p>${s.content}</p>`).join("\n"),
      faq: parsed.faq,
      internalLinks: parsed.internalLinks,
      schemaMarkup,
      fullHtml,
    };
  } catch (err) {
    onProgress(`AI content generation failed: ${err instanceof Error ? err.message : "unknown"}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
//  HTML BUILDER
// ═══════════════════════════════════════════════════════

function buildHtmlFromContent(
  parsed: {
    title: string;
    metaDescription: string;
    metaKeywords: string;
    h1: string;
    sections: { heading: string; content: string }[];
    faq: { question: string; answer: string }[];
    internalLinks: { text: string; slug: string }[];
  },
  config: ContentConfig,
): string {
  return `<!DOCTYPE html>
<html lang="${config.language}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${parsed.title}</title>
<meta name="description" content="${parsed.metaDescription}">
<meta name="keywords" content="${parsed.metaKeywords}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<link rel="canonical" href="${config.redirectUrl}">
<meta property="og:title" content="${parsed.title}">
<meta property="og:description" content="${parsed.metaDescription}">
<meta property="og:type" content="website">
<meta property="og:url" content="${config.redirectUrl}">
<meta property="og:site_name" content="${config.brandName}">
<meta property="og:locale" content="${config.language === "th" ? "th_TH" : "en_US"}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${parsed.title}">
<meta name="twitter:description" content="${parsed.metaDescription}">
${buildSchemaMarkup(parsed, config)}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:${config.language === "th" ? "'Sarabun','Noto Sans Thai'," : ""}system-ui,sans-serif;line-height:1.8;color:#2d3748;background:#fff}
.wrap{max-width:1100px;margin:0 auto;padding:0 20px}
.hero{background:linear-gradient(135deg,#0d1b2a 0%,#1b2838 50%,#2d4059 100%);color:#fff;padding:60px 20px;text-align:center}
.hero h1{font-size:2.4em;margin-bottom:15px;line-height:1.3}
.hero p{font-size:1.15em;opacity:0.9;max-width:700px;margin:0 auto 25px}
.btn{display:inline-block;background:#ff6b35;color:#fff;padding:14px 36px;border-radius:50px;text-decoration:none;font-size:1.1em;font-weight:700;transition:all 0.3s}
.btn:hover{background:#e55a2b;transform:translateY(-2px);box-shadow:0 6px 20px rgba(255,107,53,0.4)}
.main{padding:50px 0}
.sec{margin-bottom:35px;padding:28px;background:#f7fafc;border-radius:10px;border-left:4px solid #ff6b35}
.sec h2{font-size:1.6em;color:#1a202c;margin-bottom:12px}
.sec p{font-size:1.05em;color:#4a5568}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin:35px 0}
.card{background:#fff;padding:22px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.06);text-align:center}
.card h3{color:#2d4059;margin-bottom:8px}
.faq-wrap{margin:40px 0}
.faq-item{margin-bottom:12px;padding:18px;background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.04)}
.faq-item h3{color:#1a202c;margin-bottom:6px;font-size:1.05em}
.faq-item p{color:#718096}
.links{margin:30px 0}
.links ul{list-style:none;display:flex;flex-wrap:wrap;gap:8px}
.links a{display:inline-block;padding:7px 14px;background:#edf2f7;color:#2d4059;border-radius:18px;text-decoration:none;font-size:0.88em}
.links a:hover{background:#e2e8f0}
.ft{background:#1a202c;color:#fff;padding:25px 0;text-align:center;margin-top:40px}
.ft p{opacity:0.65;font-size:0.88em}
@media(max-width:768px){.hero h1{font-size:1.6em}.sec h2{font-size:1.3em}}
</style>
</head>
<body>
<header class="hero">
  <div class="wrap">
    <h1>${parsed.h1}</h1>
    <p>${parsed.metaDescription}</p>
    <a href="${config.redirectUrl}" class="btn">สมัครสมาชิก ${config.brandName}</a>
  </div>
</header>
<main class="main">
  <div class="wrap">
    <div class="grid">
      <div class="card"><h3>เว็บตรง ลิขสิทธิ์แท้</h3><p>ไม่ผ่านเอเย่นต์ มั่นคง ปลอดภัย 100%</p></div>
      <div class="card"><h3>ฝาก-ถอน ออโต้</h3><p>ไม่มีขั้นต่ำ รวดเร็วภายใน 30 วินาที</p></div>
      <div class="card"><h3>โบนัสสูงสุด 100%</h3><p>สมาชิกใหม่รับโบนัสทันที สูงสุด 5,000 บาท</p></div>
      <div class="card"><h3>1,000+ เกม</h3><p>PG Soft, Jili, Pragmatic Play และอีกมากมาย</p></div>
    </div>
    ${parsed.sections.map((s: { heading: string; content: string }) => `
    <div class="sec">
      <h2>${s.heading}</h2>
      <p>${s.content}</p>
    </div>`).join("")}
    <div class="faq-wrap">
      <h2>คำถามที่พบบ่อย</h2>
      ${parsed.faq.map((f: { question: string; answer: string }) => `
      <div class="faq-item">
        <h3>${f.question}</h3>
        <p>${f.answer}</p>
      </div>`).join("")}
    </div>
    <div class="links">
      <h2>หมวดหมู่ที่เกี่ยวข้อง</h2>
      <ul>
        ${parsed.internalLinks.map((l: { text: string; slug: string }) => `<li><a href="/${l.slug}/">${l.text}</a></li>`).join("\n        ")}
      </ul>
    </div>
    <div style="text-align:center;margin:30px 0">
      <a href="${config.redirectUrl}" class="btn">เข้าเล่น ${config.brandName} เลย</a>
    </div>
  </div>
</main>
<footer class="ft">
  <div class="wrap">
    <p>&copy; ${new Date().getFullYear()} ${config.brandName} - All Rights Reserved</p>
  </div>
</footer>
</body>
</html>`;
}

function buildSchemaMarkup(
  parsed: {
    title: string;
    metaDescription: string;
    faq: { question: string; answer: string }[];
  },
  config: ContentConfig,
): string {
  const faqSchema = parsed.faq.length > 0 ? `
<script type="application/ld+json">
{
  "@context":"https://schema.org",
  "@type":"FAQPage",
  "mainEntity":[${parsed.faq.map(f => `{"@type":"Question","name":"${f.question.replace(/"/g, '\\"')}","acceptedAnswer":{"@type":"Answer","text":"${f.answer.replace(/"/g, '\\"')}"}}`).join(",")}]
}
</script>` : "";

  return `${faqSchema}
<script type="application/ld+json">
{
  "@context":"https://schema.org",
  "@type":"WebSite",
  "name":"${config.brandName}",
  "url":"${config.redirectUrl}",
  "description":"${parsed.metaDescription.replace(/"/g, '\\"')}"
}
</script>`;
}

// ═══════════════════════════════════════════════════════
//  CONTENT PACK GENERATOR
// ═══════════════════════════════════════════════════════

export async function generateContentPack(
  config: ContentConfig,
  onProgress: ProgressCallback = () => {},
): Promise<ContentPack> {
  onProgress("กำลังสร้าง Content Pack...");

  // Generate main page
  const mainPage = await aiGenerateContent(config, onProgress);
  if (!mainPage) {
    throw new Error("Failed to generate main page content");
  }

  // Generate doorway pages for keyword clusters
  const clusters = generateKeywordClusters(config.primaryKeyword);
  const doorwayPages: GeneratedContent[] = [];

  for (const [clusterName, keywords] of Object.entries(clusters)) {
    if (clusterName === "main") continue; // Skip main cluster

    onProgress(`สร้าง doorway page: ${clusterName} (${keywords[0]})...`);
    const doorwayConfig: ContentConfig = {
      ...config,
      primaryKeyword: keywords[0],
      keywords,
      contentType: "doorway",
    };

    const page = await aiGenerateContent(doorwayConfig, onProgress);
    if (page) {
      doorwayPages.push(page);
    }
  }

  // Generate sitemap
  const sitemapUrls = [
    config.redirectUrl,
    ...doorwayPages.map((_, i) => {
      const slug = Object.keys(clusters)[i + 1] || `page-${i}`;
      return `${config.redirectUrl}/${slug}/`;
    }),
  ];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(url => `  <url>
    <loc>${url}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`).join("\n")}
</urlset>`;

  onProgress(`Content Pack สำเร็จ: 1 main page + ${doorwayPages.length} doorway pages`);

  return {
    mainPage,
    doorwayPages,
    sitemapXml,
  };
}

// ═══════════════════════════════════════════════════════
//  CONTENT ROTATION (Anti-Duplicate)
// ═══════════════════════════════════════════════════════

export function rotateContent(contents: GeneratedContent[]): GeneratedContent {
  // Pick random content from the pool
  const idx = Math.floor(Math.random() * contents.length);
  const base = { ...contents[idx] };

  // Shuffle sections
  const sections = base.body.split("</p>").filter(s => s.trim());
  for (let i = sections.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sections[i], sections[j]] = [sections[j], sections[i]];
  }
  base.body = sections.join("</p>") + (sections.length > 0 ? "</p>" : "");

  // Shuffle FAQ
  const faq = [...base.faq];
  for (let i = faq.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [faq[i], faq[j]] = [faq[j], faq[i]];
  }
  base.faq = faq;

  return base;
}
