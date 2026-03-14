/**
 * SEO Homepage Content Generator
 * 
 * Generates keyword-spam-heavy, bot-optimized homepage HTML
 * designed to serve Googlebot with maximum SEO signals.
 * 
 * Features:
 * - Category-specific content (slots/lottery/baccarat)
 * - Heavy keyword density (3-5%)
 * - Full Schema.org markup (GamblingService, FAQPage, BreadcrumbList, Article, WebSite, Organization)
 * - H1-H6 heading hierarchy with keywords
 * - FAQ section with 15+ keyword-rich Q&A
 * - Long-form SEO article (2500-3000 words)
 * - Internal linking with keyword-rich anchors
 * - Meta tags, canonical, OG, Twitter cards
 * - Breadcrumb navigation
 * - Table of contents
 * - Related articles sidebar
 * - Footer sitemap-style keyword links
 */

import { THEME_SPECS, type ThemeSpec } from "./theme-engine";

// ═══════════════════════════════════════════════
// Keyword Databases per Category
// ═══════════════════════════════════════════════

export interface KeywordSet {
  primary: string[];
  secondary: string[];
  lsi: string[];
  longTail: string[];
  questions: string[];
  brands: string[];
  locations: string[];
}

const SLOTS_KEYWORDS: KeywordSet = {
  primary: [
    "สล็อตออนไลน์", "สล็อตเว็บตรง", "เว็บสล็อต", "สล็อต PG", "สล็อตแตกง่าย",
    "สล็อต ฝากถอนไม่มีขั้นต่ำ", "สล็อตเว็บตรง แตกง่าย", "เกมสล็อต",
    "slot online", "สล็อตทดลองเล่น", "สล็อตเว็บตรง ไม่ผ่านเอเย่นต์",
    "สล็อตแตกหนัก", "สล็อต 2026", "สล็อตใหม่ล่าสุด", "สล็อตค่ายใหญ่",
  ],
  secondary: [
    "สล็อต PG Soft", "สล็อต Pragmatic Play", "สล็อต Joker", "สล็อต JILI",
    "สล็อตค่าย PP", "สล็อตค่าย PG", "สล็อตค่าย CQ9", "สล็อตค่าย Habanero",
    "สล็อต Spadegaming", "สล็อตค่าย Microgaming", "สล็อตค่าย NetEnt",
    "สล็อตค่าย Red Tiger", "สล็อตค่าย Blueprint", "สล็อตค่าย Nolimit City",
    "สล็อตค่าย Relax Gaming", "สล็อตค่าย Play'n GO",
  ],
  lsi: [
    "ฟรีสปิน", "โบนัสสล็อต", "แจ็คพอต", "RTP สูง", "วอเลท",
    "ฝากถอนออโต้", "ทดลองเล่นฟรี", "สล็อตมือถือ", "เครดิตฟรี",
    "โปรโมชั่นสล็อต", "สมัครสมาชิก", "เว็บตรง ไม่มีขั้นต่ำ",
    "สล็อตแตกบ่อย", "สล็อตโบนัสแตก", "สล็อตทุนน้อย", "สล็อตแจกหนัก",
    "สล็อตเว็บใหญ่", "สล็อตลิขสิทธิ์แท้", "สล็อตปั่นฟรี", "สล็อตรวมค่าย",
  ],
  longTail: [
    "สล็อตเว็บตรง แตกง่าย 2026 ฝากถอนไม่มีขั้นต่ำ",
    "สล็อต PG เว็บตรง ทดลองเล่นฟรี ไม่ต้องฝากก่อน",
    "เว็บสล็อตออนไลน์ อันดับ 1 ฝากถอนออโต้ วอเลท",
    "สล็อตแตกง่าย ได้เงินจริง ถอนไม่อั้น 2026",
    "สล็อตเว็บตรง ไม่ผ่านเอเย่นต์ ไม่มีขั้นต่ำ รวมทุกค่าย",
    "สล็อต PG Soft แตกง่าย ทุนน้อยก็เล่นได้",
    "เว็บสล็อต ฝากถอนวอเลท ไม่มีขั้นต่ำ 2026",
    "สล็อตออนไลน์ เว็บตรง ลิขสิทธิ์แท้ ปลอดภัย 100%",
  ],
  questions: [
    "สล็อตเว็บตรงคืออะไร",
    "สล็อตเว็บไหนแตกง่ายที่สุด 2026",
    "สล็อต PG เล่นยังไงให้ได้เงิน",
    "สล็อตฝากถอนไม่มีขั้นต่ำ เว็บไหนดี",
    "ทดลองเล่นสล็อตฟรี ไม่ต้องสมัคร ได้ที่ไหน",
    "สล็อตค่ายไหน RTP สูงสุด",
    "สล็อตแตกง่าย ทุนน้อย เล่นยังไง",
    "เว็บสล็อตเว็บตรง ไม่ผ่านเอเย่นต์ มีที่ไหนบ้าง",
    "สล็อตออนไลน์ปลอดภัยไหม",
    "สล็อตเว็บตรง วอเลท ฝากถอนยังไง",
    "สล็อต PG Soft เกมไหนแตกง่ายสุด",
    "สล็อตเว็บตรง โบนัสแตกบ่อย จริงไหม",
    "สมัครสล็อตเว็บตรง ต้องทำยังไง",
    "สล็อตเว็บตรง กับ เว็บเอเย่นต์ ต่างกันยังไง",
    "สล็อตแจ็คพอตแตก ได้เงินจริงไหม",
  ],
  brands: [
    "Sweet Bonanza", "Gates of Olympus", "Starlight Princess", "Wild West Gold",
    "Mahjong Ways", "Fortune Tiger", "Lucky Neko", "Dragon Hatch",
    "Aztec Gems", "Great Rhino", "Sugar Rush", "Big Bass Bonanza",
    "Wisdom of Athena", "Fruit Party", "Dog House Megaways",
  ],
  locations: [
    "ไทย", "ประเทศไทย", "เอเชีย", "กรุงเทพ", "เชียงใหม่",
    "พัทยา", "ภูเก็ต", "หาดใหญ่", "ขอนแก่น", "นครราชสีมา",
  ],
};

const LOTTERY_KEYWORDS: KeywordSet = {
  primary: [
    "หวยออนไลน์", "แทงหวย", "หวยเว็บตรง", "เว็บหวย", "หวยรัฐบาล",
    "หวยลาว", "หวยฮานอย", "หวยยี่กี", "หวยหุ้น", "เลขเด็ด",
    "ผลหวย", "ตรวจหวย", "หวย 2026", "หวยออนไลน์ จ่ายจริง",
    "lotto online", "หวยมาเลย์", "หวยพิเศษ",
  ],
  secondary: [
    "หวยรัฐบาลไทย", "หวยลาวพัฒนา", "หวยฮานอยพิเศษ", "หวยฮานอย VIP",
    "หวยยี่กี 5 นาที", "หวยหุ้นไทย", "หวยหุ้นต่างประเทศ",
    "หวยจีน", "หวยเกาหลี", "หวยญี่ปุ่น", "หวยอินเดีย",
    "หวยมาเลย์ 4D", "หวยสิงคโปร์", "หวยฮานอยปกติ",
    "หวยลาวสตาร์", "หวยลาว VIP",
  ],
  lsi: [
    "จ่ายบาทละ 900", "แทงหวยขั้นต่ำ 1 บาท", "หวยจ่ายเยอะ",
    "หวยออนไลน์ จ่ายจริง ไม่โกง", "สมัครหวยออนไลน์",
    "เลขเด็ดวันนี้", "เลขดัง", "หวยเด็ด", "สูตรหวย",
    "ฝันเห็นเลข", "ทำนายฝัน", "เลขมงคล", "ดวงหวย",
    "หวยฟรี", "เครดิตฟรีหวย", "โปรโมชั่นหวย",
    "หวยออนไลน์ ฝากถอนออโต้", "หวยออนไลน์ วอเลท",
    "ผลหวยล่าสุด", "ตรวจผลหวย", "สถิติหวย",
  ],
  longTail: [
    "หวยออนไลน์ จ่ายจริง ฝากถอนไม่มีขั้นต่ำ 2026",
    "แทงหวยออนไลน์ บาทละ 900 เว็บตรง ไม่ผ่านเอเย่นต์",
    "เว็บหวยออนไลน์ อันดับ 1 จ่ายเยอะที่สุด",
    "หวยรัฐบาลไทย ออนไลน์ แทงขั้นต่ำ 1 บาท",
    "หวยฮานอย วันนี้ ผลออกกี่โมง ดูที่ไหน",
    "หวยยี่กี 5 นาที สมัครยังไง เล่นที่ไหน",
    "ตรวจหวยรัฐบาล งวดล่าสุด ผลออกวันไหน",
    "สูตรหวยยี่กี แม่นๆ 2026 ใช้ได้จริง",
  ],
  questions: [
    "หวยออนไลน์คืออะไร แทงยังไง",
    "เว็บหวยออนไลน์ เว็บไหนจ่ายจริง 2026",
    "หวยรัฐบาล ออกวันไหน กี่โมง",
    "หวยฮานอย มีกี่รอบ ออกกี่โมง",
    "หวยยี่กี คืออะไร เล่นยังไง",
    "แทงหวยออนไลน์ ขั้นต่ำเท่าไหร่",
    "หวยออนไลน์ จ่ายบาทละเท่าไหร่",
    "สมัครหวยออนไลน์ ต้องทำยังไง",
    "หวยลาว กับ หวยฮานอย ต่างกันยังไง",
    "ตรวจหวย ดูผลหวย ได้ที่ไหน",
    "หวยออนไลน์ ฝากถอนวอเลท ได้ไหม",
    "เลขเด็ดวันนี้ ดูจากไหน",
    "สูตรหวย ใช้ได้จริงไหม",
    "หวยออนไลน์ ปลอดภัยไหม โดนจับไหม",
    "หวยหุ้น คืออะไร เล่นยังไง",
  ],
  brands: [
    "หวยรัฐบาลไทย", "หวยลาว", "หวยฮานอย", "หวยยี่กี",
    "หวยมาเลย์", "หวยหุ้นไทย", "หวยจีน", "หวยเกาหลี",
    "หวยญี่ปุ่น", "หวยฮานอย VIP", "หวยลาวพัฒนา",
    "หวยลาวสตาร์", "หวยฮานอยพิเศษ", "หวยอินเดีย", "หวยสิงคโปร์",
  ],
  locations: [
    "ไทย", "ลาว", "เวียดนาม", "มาเลเซีย", "สิงคโปร์",
    "จีน", "เกาหลี", "ญี่ปุ่น", "อินเดีย", "กัมพูชา",
  ],
};

const BACCARAT_KEYWORDS: KeywordSet = {
  primary: [
    "บาคาร่าออนไลน์", "บาคาร่าเว็บตรง", "เว็บบาคาร่า", "บาคาร่า 2026",
    "บาคาร่า SA", "บาคาร่า Sexy", "คาสิโนออนไลน์", "คาสิโนสด",
    "baccarat online", "บาคาร่าสด", "บาคาร่า ฝากถอนไม่มีขั้นต่ำ",
    "เสือมังกร", "ไฮโล", "รูเล็ต", "แบล็คแจ็ค",
  ],
  secondary: [
    "บาคาร่า SA Gaming", "บาคาร่า Sexy Gaming", "บาคาร่า WM Casino",
    "บาคาร่า Dream Gaming", "บาคาร่า Evolution", "บาคาร่า Allbet",
    "บาคาร่า Pretty Gaming", "บาคาร่า Ebet", "บาคาร่า Asia Gaming",
    "คาสิโน SA", "คาสิโน Sexy", "คาสิโน WM", "คาสิโน DG",
    "ถ่ายทอดสดบาคาร่า", "บาคาร่าถ่ายทอดสด",
  ],
  lsi: [
    "สูตรบาคาร่า", "สูตร AI บาคาร่า", "บาคาร่าได้เงินจริง",
    "บาคาร่าทดลองเล่น", "บาคาร่าฟรี", "เครดิตฟรีบาคาร่า",
    "บาคาร่าขั้นต่ำ 10 บาท", "บาคาร่ามือถือ", "บาคาร่า wallet",
    "สมัครบาคาร่า", "โปรโมชั่นบาคาร่า", "บาคาร่าแจกเครดิตฟรี",
    "บาคาร่าเว็บใหญ่", "บาคาร่าลิขสิทธิ์แท้", "บาคาร่า VIP",
    "ห้องบาคาร่า", "โต๊ะบาคาร่า", "ดีลเลอร์สด",
  ],
  longTail: [
    "บาคาร่าออนไลน์ เว็บตรง ไม่ผ่านเอเย่นต์ 2026",
    "บาคาร่า SA Gaming ทดลองเล่นฟรี ไม่ต้องสมัคร",
    "เว็บบาคาร่า ฝากถอนไม่มีขั้นต่ำ วอเลท",
    "สูตรบาคาร่า AI แม่นๆ 2026 ใช้ได้จริง",
    "บาคาร่าเว็บตรง ขั้นต่ำ 10 บาท ได้เงินจริง",
    "คาสิโนออนไลน์ เว็บตรง ถ่ายทอดสด 24 ชม",
    "บาคาร่า Sexy Gaming เล่นผ่านมือถือ ฝากถอนออโต้",
    "เว็บคาสิโนออนไลน์ อันดับ 1 ในไทย 2026",
  ],
  questions: [
    "บาคาร่าออนไลน์คืออะไร เล่นยังไง",
    "บาคาร่าเว็บไหนดีที่สุด 2026",
    "สูตรบาคาร่า AI ใช้ได้จริงไหม",
    "บาคาร่า SA กับ Sexy ต่างกันยังไง",
    "บาคาร่าฝากถอนไม่มีขั้นต่ำ มีจริงไหม",
    "บาคาร่าเว็บตรง ปลอดภัยไหม",
    "เล่นบาคาร่ายังไงให้ได้เงิน",
    "บาคาร่าขั้นต่ำ 10 บาท เว็บไหนดี",
    "คาสิโนออนไลน์ ถ่ายทอดสด ดูที่ไหน",
    "บาคาร่าทดลองเล่นฟรี ไม่ต้องสมัคร ได้ที่ไหน",
    "สมัครบาคาร่า ต้องทำยังไง",
    "บาคาร่า wallet ฝากถอนยังไง",
    "บาคาร่าเว็บตรง กับ เว็บเอเย่นต์ ต่างกันยังไง",
    "เสือมังกรออนไลน์ เล่นยังไง",
    "บาคาร่า VIP สิทธิพิเศษมีอะไรบ้าง",
  ],
  brands: [
    "SA Gaming", "Sexy Gaming", "WM Casino", "Dream Gaming",
    "Evolution Gaming", "Allbet Gaming", "Pretty Gaming", "Ebet",
    "Asia Gaming", "Gold Deluxe", "Pragmatic Live", "Ezugi",
    "Playtech Live", "Microgaming Live", "BG Gaming",
  ],
  locations: [
    "ไทย", "กัมพูชา", "ฟิลิปปินส์", "มาเก๊า", "สิงคโปร์",
    "มาเลเซีย", "เวียดนาม", "เมียนมาร์", "ลาว", "เอเชีย",
  ],
};

export function getKeywordsForCategory(category: string): KeywordSet {
  switch (category) {
    case "lottery": return LOTTERY_KEYWORDS;
    case "baccarat": return BACCARAT_KEYWORDS;
    default: return SLOTS_KEYWORDS;
  }
}

// ═══════════════════════════════════════════════
// Content Generation Functions
// ═══════════════════════════════════════════════

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generateFAQSection(keywords: KeywordSet, siteName: string, category: string): string {
  const faqs = keywords.questions.map((q, i) => {
    const answer = generateFAQAnswer(q, keywords, siteName, category, i);
    return { question: q, answer };
  });

  const faqSchemaItems = faqs.map(f => `{
    "@type": "Question",
    "name": "${f.question.replace(/"/g, '\\"')}",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "${f.answer.replace(/"/g, '\\"').replace(/\n/g, ' ')}"
    }
  }`).join(",\n");

  const faqHTML = faqs.map((f, i) => `
    <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
      <h3 class="faq-question" itemprop="name">${f.question}</h3>
      <div class="faq-answer" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <div itemprop="text">${f.answer}</div>
      </div>
    </div>
  `).join("\n");

  return `
    <section class="section faq-section" id="faq" itemscope itemtype="https://schema.org/FAQPage">
      <h2 class="section-title">คำถามที่พบบ่อย — ${siteName} FAQ</h2>
      <p class="section-subtitle">รวมคำตอบทุกข้อสงสัยเกี่ยวกับ${category === "lottery" ? "หวยออนไลน์" : category === "baccarat" ? "บาคาร่าออนไลน์" : "สล็อตออนไลน์"}</p>
      ${faqHTML}
    </section>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [${faqSchemaItems}]
    }
    </script>
  `;
}

function generateFAQAnswer(question: string, kw: KeywordSet, siteName: string, category: string, index: number): string {
  const mainKw = kw.primary[index % kw.primary.length];
  const secondKw = kw.secondary[index % kw.secondary.length];
  const lsiKw = kw.lsi[index % kw.lsi.length];
  const brand = kw.brands[index % kw.brands.length];
  
  const categoryName = category === "lottery" ? "หวยออนไลน์" : category === "baccarat" ? "บาคาร่าออนไลน์" : "สล็อตออนไลน์";
  
  const templates = [
    `${siteName} เป็นเว็บ${categoryName}ชั้นนำ ให้บริการ${mainKw}ครบวงจร รวมถึง${secondKw}จากค่ายดังทั่วโลก ระบบ${lsiKw}ที่ทันสมัย สมัครง่าย ฝากถอนไม่มีขั้นต่ำ รองรับวอเลท ปลอดภัย 100% มีใบอนุญาตถูกกฎหมาย`,
    `สำหรับ${mainKw} ${siteName} แนะนำ${brand}ที่มี RTP สูง เล่นง่าย ได้เงินจริง ระบบ${lsiKw}อัตโนมัติ ฝากถอนภายใน 30 วินาที ไม่ต้องรอนาน ${secondKw}ให้เลือกเล่นมากกว่า 1,000 เกม`,
    `${mainKw}ที่${siteName} เป็นเว็บตรง ไม่ผ่านเอเย่นต์ จ่ายจริง ไม่มีโกง มี${secondKw}ให้เลือกครบทุกค่าย พร้อม${lsiKw}สำหรับสมาชิกใหม่ สมัครวันนี้รับโบนัสทันที`,
    `ที่${siteName} คุณสามารถเล่น${mainKw}ได้ตลอด 24 ชั่วโมง รองรับทุกอุปกรณ์ ทั้ง iOS และ Android มี${secondKw}จากค่ายชั้นนำ เช่น ${brand} พร้อมระบบ${lsiKw}ที่ปลอดภัย`,
    `${mainKw}ที่ดีที่สุดต้อง${siteName} เว็บตรงลิขสิทธิ์แท้ มี${secondKw}ให้เลือกเล่นมากที่สุด ระบบ${lsiKw}ทันสมัย ฝากถอนออโต้ วอเลท ไม่มีขั้นต่ำ การันตีจ่ายจริงทุกยอด`,
  ];
  
  return templates[index % templates.length];
}

function generateArticleContent(keywords: KeywordSet, siteName: string, category: string, domain: string): string {
  const categoryName = category === "lottery" ? "หวยออนไลน์" : category === "baccarat" ? "บาคาร่าออนไลน์" : "สล็อตออนไลน์";
  const categoryNameEn = category === "lottery" ? "Online Lottery" : category === "baccarat" ? "Online Baccarat" : "Online Slots";
  const year = "2026";
  const pk = keywords.primary;
  const sk = keywords.secondary;
  const lsi = keywords.lsi;
  const lt = keywords.longTail;
  const brands = keywords.brands;

  // Generate massive long-form content
  const sections: string[] = [];

  // Section 1: Introduction
  sections.push(`
    <article class="seo-article" itemscope itemtype="https://schema.org/Article">
      <meta itemprop="headline" content="${pk[0]} ${siteName} — ${categoryName} อันดับ 1 ${year}" />
      <meta itemprop="datePublished" content="${year}-01-01" />
      <meta itemprop="dateModified" content="${year}-03-14" />
      <meta itemprop="author" content="${siteName}" />
      
      <h2 class="section-title" id="intro">${pk[0]} — ${siteName} เว็บ${categoryName}อันดับ 1 ของไทย ${year}</h2>
      
      <div class="aeo-block">
        <div class="aeo-label">คำตอบด่วน</div>
        <p><strong>${siteName}</strong> คือเว็บ<strong>${pk[0]}</strong>ชั้นนำอันดับ 1 ของประเทศไทย ให้บริการ${pk[1]}ครบวงจร รวม${sk[0]}และ${sk[1]}จากค่ายดังทั่วโลก ระบบ${lsi[0]}อัตโนมัติ ${lsi[1]}ภายใน 30 วินาที สมัครง่าย ปลอดภัย 100%</p>
      </div>

      <p>${siteName} เป็นเว็บ${pk[0]}ที่ได้รับความนิยมสูงสุดในประเทศไทย ปี ${year} ให้บริการ${pk[2]}ครบทุกรูปแบบ ไม่ว่าจะเป็น${sk[0]}, ${sk[1]}, ${sk[2]} หรือ${sk[3]} ทุกเกมเป็นลิขสิทธิ์แท้จากค่ายผู้พัฒนาโดยตรง ไม่ผ่านเอเย่นต์ การันตีความปลอดภัยและความยุติธรรมในทุกการเดิมพัน</p>

      <p>ด้วยระบบ${lsi[0]}ที่ทันสมัยที่สุด ${siteName} ให้บริการ${lsi[1]}ตลอด 24 ชั่วโมง ไม่มีวันหยุด รองรับ${lsi[2]}ทุกรูปแบบ ทั้งธนาคาร, วอเลท, คริปโต ฝากถอนไม่มีขั้นต่ำ ประมวลผลภายใน 30 วินาที ไม่ต้องรอนาน</p>

      <p>สำหรับผู้เล่นที่กำลังมองหา<strong>${lt[0]}</strong> ${siteName} คือคำตอบที่ดีที่สุด เพราะเราเป็น${pk[4]}ที่มีใบอนุญาตถูกกฎหมาย ผ่านการรับรองจากหน่วยงานกำกับดูแลระดับสากล มีผู้ใช้งานมากกว่า 500,000 คนทั่วประเทศไทย</p>
  `);

  // Section 2: Why Choose Us
  sections.push(`
      <h2 id="why-choose">${pk[0]} ทำไมต้อง ${siteName} — 10 เหตุผลที่ต้องเลือกเรา</h2>
      
      <p>การเลือก${pk[2]}ที่ดีเป็นสิ่งสำคัญมากสำหรับผู้เล่น${categoryName}ทุกคน ${siteName} เป็น${pk[3]}ที่ตอบโจทย์ทุกความต้องการ ด้วยเหตุผลดังต่อไปนี้:</p>

      <h3 id="reason-1">1. ${pk[0]} เว็บตรง ไม่ผ่านเอเย่นต์</h3>
      <p>${siteName} เป็น${pk[4]}แท้ ไม่ผ่านตัวแทน ไม่มีคนกลาง ทำให้ผู้เล่นได้รับอัตราจ่ายที่ดีที่สุด ไม่ถูกหักค่าคอมมิชชั่น เงินรางวัลเข้ากระเป๋าเต็มจำนวน ${sk[0]}และ${sk[1]}ทุกเกมเป็นลิขสิทธิ์แท้จากค่ายโดยตรง</p>

      <h3 id="reason-2">2. ระบบ${lsi[0]}อัตโนมัติ</h3>
      <p>ระบบ${lsi[0]}ของ${siteName} ใช้เทคโนโลยี AI ประมวลผลอัตโนมัติ ${lsi[1]}ภายใน 30 วินาที ไม่ต้องรอแอดมิน ไม่มีขั้นต่ำ รองรับทุกธนาคาร, TrueMoney Wallet, PromptPay และคริปโตเคอเรนซี</p>

      <h3 id="reason-3">3. ${sk[0]} — ค่ายชั้นนำระดับโลก</h3>
      <p>${siteName} รวม${sk[0]}, ${sk[1]}, ${sk[2]}, ${sk[3]} และอีกกว่า 20 ค่ายดัง มากกว่า 1,000 เกมให้เลือกเล่น ทุกเกมมี RTP สูง แตกง่าย ได้เงินจริง เช่น ${brands[0]}, ${brands[1]}, ${brands[2]}, ${brands[3]}</p>

      <h3 id="reason-4">4. ${lsi[2]} — ทดลองเล่นฟรี</h3>
      <p>ผู้เล่นสามารถ${lsi[2]}ได้ฟรี ไม่ต้องสมัครสมาชิก ไม่ต้องฝากเงิน ทดลองเล่นได้ทุกเกมจากทุกค่าย เพื่อศึกษาเกมก่อนเดิมพันจริง ${pk[0]}ที่${siteName} ให้โอกาสทดลองเล่นฟรีไม่จำกัด</p>

      <h3 id="reason-5">5. โปรโมชั่น${categoryName}สุดคุ้ม</h3>
      <p>${siteName} มี${lsi[3]}มากมาย ทั้งโบนัสสมาชิกใหม่ 100%, คืนยอดเสีย 10%, โบนัสฝากรายวัน, ${lsi[4]}ทุกวัน และโปรแนะนำเพื่อน รับค่าคอมมิชชั่นตลอดชีพ</p>

      <h3 id="reason-6">6. รองรับ${lsi[5]}ทุกอุปกรณ์</h3>
      <p>เล่น${pk[0]}ได้ทุกที่ทุกเวลา ผ่านมือถือ แท็บเล็ต หรือคอมพิวเตอร์ รองรับทั้ง iOS, Android, Windows ไม่ต้องดาวน์โหลดแอป เล่นผ่านเว็บบราวเซอร์ได้เลย</p>

      <h3 id="reason-7">7. ปลอดภัย 100% — SSL 256-bit</h3>
      <p>${siteName} ใช้ระบบรักษาความปลอดภัยระดับธนาคาร SSL 256-bit เข้ารหัสข้อมูลทุกการทำธุรกรรม ป้องกันการโจรกรรมข้อมูลส่วนบุคคล ${pk[0]}ที่ปลอดภัยที่สุดในประเทศไทย</p>

      <h3 id="reason-8">8. บริการลูกค้า 24 ชั่วโมง</h3>
      <p>ทีมงาน${siteName} พร้อมให้บริการตลอด 24 ชั่วโมง ผ่าน Live Chat, LINE, Telegram สอบถามปัญหาหรือขอความช่วยเหลือได้ตลอดเวลา ตอบไว ใส่ใจทุกปัญหา</p>

      <h3 id="reason-9">9. ${lsi[6]} — VIP สุดพิเศษ</h3>
      <p>สมาชิก VIP ของ${siteName} ได้รับสิทธิพิเศษมากมาย ทั้งโบนัสพิเศษ, อัตราจ่ายที่สูงกว่า, ผู้จัดการส่วนตัว, ของขวัญวันเกิด และสิทธิ์เข้าร่วมกิจกรรมพิเศษ</p>

      <h3 id="reason-10">10. ${pk[0]} อัพเดทเกมใหม่ทุกวัน</h3>
      <p>${siteName} อัพเดท${pk[5]}ใหม่ล่าสุดทุกวัน ไม่ว่าจะเป็น${brands[4]}, ${brands[5]}, ${brands[6]} หรือเกมใหม่จากทุกค่ายดัง ไม่มีเบื่อ มีเกมใหม่ให้เล่นทุกวัน</p>
  `);

  // Section 3: How to play guide
  sections.push(`
      <h2 id="how-to">${pk[0]} — วิธีสมัครและเริ่มเล่นที่ ${siteName}</h2>
      
      <div class="aeo-block">
        <div class="aeo-label">ขั้นตอนง่ายๆ</div>
        <p>สมัครสมาชิก${siteName} ง่ายเพียง 3 ขั้นตอน: 1) กดสมัครสมาชิก 2) กรอกข้อมูล 3) ฝากเงินและเริ่มเล่น${pk[0]}ได้ทันที ใช้เวลาไม่ถึง 1 นาที</p>
      </div>

      <h3 id="step-1">ขั้นตอนที่ 1: สมัครสมาชิก${siteName}</h3>
      <p>เข้าเว็บไซต์ ${domain} กดปุ่ม "สมัครสมาชิก" กรอกเบอร์โทรศัพท์ ตั้งรหัสผ่าน เลือกธนาคาร กรอกเลขบัญชี เพียงเท่านี้ก็สมัครเสร็จ พร้อมเล่น${pk[0]}ได้ทันที</p>

      <h3 id="step-2">ขั้นตอนที่ 2: ฝากเงิน</h3>
      <p>ฝากเงินเข้าระบบ${siteName} ผ่านช่องทางที่สะดวก ทั้งโอนผ่านธนาคาร, TrueMoney Wallet, PromptPay ไม่มีขั้นต่ำ ระบบ${lsi[0]}อัตโนมัติ เงินเข้าภายใน 30 วินาที</p>

      <h3 id="step-3">ขั้นตอนที่ 3: เลือกเกมและเริ่มเล่น</h3>
      <p>เลือกเกม${categoryName}ที่ชอบ ไม่ว่าจะเป็น${sk[0]}, ${sk[1]}, ${sk[2]} หรือเกมยอดนิยมอย่าง ${brands[0]}, ${brands[1]} เริ่มเดิมพันได้เลย ${pk[0]}ที่${siteName} เล่นง่าย ได้เงินจริง</p>
  `);

  // Section 4: Game providers / brands
  sections.push(`
      <h2 id="providers">${pk[0]} — รวมค่ายเกมชั้นนำที่ ${siteName}</h2>
      
      <p>${siteName} รวบรวม${pk[2]}จากค่ายเกมชั้นนำระดับโลกมากกว่า 20 ค่าย ทุกค่ายเป็นลิขสิทธิ์แท้ ผ่านการรับรองจากหน่วยงานกำกับดูแลระดับสากล ได้แก่:</p>

      <div class="provider-grid">
        ${sk.slice(0, 12).map(s => `<div class="provider-card"><h4>${s}</h4><p>เล่น${s}ที่${siteName} เกมครบ แตกง่าย ได้เงินจริง ฝากถอนไม่มีขั้นต่ำ</p></div>`).join("\n")}
      </div>

      <h3 id="top-games">เกมยอดนิยมที่ ${siteName}</h3>
      <p>เกม${categoryName}ที่ได้รับความนิยมสูงสุดที่${siteName} ได้แก่:</p>
      <ul>
        ${brands.map(b => `<li><strong>${b}</strong> — เล่น${b}ที่${siteName} ${pk[0]} แตกง่าย ได้เงินจริง</li>`).join("\n")}
      </ul>
  `);

  // Section 5: Promotions
  sections.push(`
      <h2 id="promotions">${pk[0]} โปรโมชั่น ${siteName} — โบนัสสุดคุ้ม ${year}</h2>
      
      <p>${siteName} มีโปรโมชั่น${categoryName}มากมาย สำหรับทั้งสมาชิกใหม่และสมาชิกเก่า:</p>

      <h3>โบนัสสมาชิกใหม่ 100%</h3>
      <p>สมัครสมาชิก${siteName}วันนี้ รับโบนัส${categoryName} 100% สูงสุด 5,000 บาท ฝากครั้งแรกรับโบนัสทันที ทำเทิร์นเพียง 5 เท่า ถอนได้ไม่จำกัด ${pk[0]}ที่ให้โบนัสเยอะที่สุด</p>

      <h3>คืนยอดเสีย 10% ทุกสัปดาห์</h3>
      <p>${siteName} คืนยอดเสีย 10% ทุกสัปดาห์ ไม่มีขั้นต่ำ ไม่ต้องทำเทิร์น ถอนได้ทันที เล่น${pk[0]}ไม่มีวันขาดทุน เพราะ${siteName}ดูแลทุกยอดเสีย</p>

      <h3>${lsi[3]}ทุกวัน</h3>
      <p>รับ${lsi[3]}ทุกวันที่${siteName} เพียงฝากเงินขั้นต่ำ 100 บาท รับโบนัสเพิ่ม 20% ทุกวัน ไม่จำกัดจำนวนครั้ง เล่น${pk[0]}ได้ทุกเกม</p>

      <h3>โปรแนะนำเพื่อน — รับค่าคอมตลอดชีพ</h3>
      <p>แนะนำเพื่อนมาสมัคร${siteName} รับค่าคอมมิชชั่น 5% จากยอดเล่นของเพื่อนตลอดชีพ ไม่มีวันหมดอายุ ยิ่งแนะนำมาก ยิ่งได้มาก ${pk[0]}ที่ให้ค่าคอมเยอะที่สุด</p>
  `);

  // Section 6: Tips & Strategies
  sections.push(`
      <h2 id="tips">เทคนิค${pk[0]} — สูตรเล่น${categoryName}ให้ได้เงิน ${year}</h2>
      
      <p>สำหรับผู้เล่น${pk[0]}ที่ต้องการเพิ่มโอกาสชนะ ${siteName} มีเทคนิคและสูตรดังนี้:</p>

      <h3>1. เลือกเกมที่มี RTP สูง</h3>
      <p>RTP (Return to Player) คืออัตราการจ่ายคืนผู้เล่น ยิ่ง RTP สูง ยิ่งมีโอกาสชนะมาก ${pk[0]}ที่${siteName} ทุกเกมแสดง RTP ชัดเจน แนะนำเลือกเกมที่มี RTP 96% ขึ้นไป เช่น ${brands[0]} (RTP 96.48%), ${brands[1]} (RTP 96.50%)</p>

      <h3>2. ตั้งงบประมาณและเป้าหมาย</h3>
      <p>ก่อนเล่น${pk[0]} ควรตั้งงบประมาณที่ยอมรับได้ และเป้าหมายกำไร เมื่อถึงเป้าหมายให้หยุดเล่น ไม่โลภ ไม่ไล่ตาม ${siteName} แนะนำตั้งเป้ากำไร 30-50% ของทุน</p>

      <h3>3. ใช้โปรโมชั่นให้เป็นประโยชน์</h3>
      <p>${siteName} มีโปรโมชั่น${categoryName}มากมาย ใช้โบนัสเพิ่มทุน เล่น${pk[0]}ได้นานขึ้น โอกาสชนะมากขึ้น อย่าลืมรับโบนัสทุกครั้งที่ฝากเงิน</p>

      <h3>4. ${lsi[2]}ก่อนเดิมพันจริง</h3>
      <p>${siteName} ให้${lsi[2]}ฟรีทุกเกม ใช้โหมดทดลองเล่นเพื่อศึกษาเกม เข้าใจฟีเจอร์ ก่อนเดิมพันด้วยเงินจริง ${pk[0]}ที่ให้ทดลองเล่นฟรีไม่จำกัด</p>
  `);

  // Close article
  sections.push(`
      <h2 id="conclusion">สรุป — ${siteName} ${pk[0]} อันดับ 1 ของไทย ${year}</h2>
      
      <p><strong>${siteName}</strong> คือ${pk[0]}อันดับ 1 ของประเทศไทย ปี ${year} ให้บริการ${pk[2]}ครบทุกค่าย ทั้ง${sk[0]}, ${sk[1]}, ${sk[2]} และอีกกว่า 1,000 เกม ระบบ${lsi[0]}อัตโนมัติ ฝากถอนไม่มีขั้นต่ำ ปลอดภัย 100% สมัครวันนี้ที่ <a href="https://${domain}">${domain}</a> รับโบนัสสมาชิกใหม่ 100% ทันที!</p>

      <p><strong>${lt[0]}</strong> — ${siteName} คือคำตอบ! เว็บ${pk[0]}ที่ดีที่สุด จ่ายจริง ไม่มีโกง มีผู้ใช้งานมากกว่า 500,000 คน การันตีคุณภาพ สมัครเลยวันนี้!</p>
    </article>
  `);

  return sections.join("\n");
}

// ═══════════════════════════════════════════════
// Main Homepage Generator
// ═══════════════════════════════════════════════

export interface HomepageGeneratorInput {
  domain: string;
  siteName: string;
  category: "slots" | "lottery" | "baccarat";
  themeSlug?: string;
  customKeywords?: string[];
  targetLanguage?: string;
}

export interface GeneratedHomepage {
  html: string;
  title: string;
  metaDescription: string;
  keywords: string[];
  wordCount: number;
  keywordDensity: number;
  schemaTypes: string[];
  headingCount: { h1: number; h2: number; h3: number; h4: number };
}

export function generateSeoHomepage(input: HomepageGeneratorInput): GeneratedHomepage {
  const { domain, siteName, category, themeSlug, customKeywords } = input;
  
  // Get theme spec
  const theme = THEME_SPECS.find(t => t.slug === themeSlug) || THEME_SPECS.find(t => t.category === category) || THEME_SPECS[0];
  
  // Get keywords
  const keywords = getKeywordsForCategory(category);
  
  // Add custom keywords
  if (customKeywords?.length) {
    keywords.primary.unshift(...customKeywords);
  }

  const categoryName = category === "lottery" ? "หวยออนไลน์" : category === "baccarat" ? "บาคาร่าออนไลน์" : "สล็อตออนไลน์";
  const categoryNameEn = category === "lottery" ? "Online Lottery" : category === "baccarat" ? "Online Baccarat" : "Online Slots";
  const year = "2026";

  // Generate title
  const title = `${keywords.primary[0]} ${siteName} — ${categoryName} เว็บตรง อันดับ 1 ${year} | ฝากถอนไม่มีขั้นต่ำ`;
  const metaDescription = `${siteName} ${keywords.primary[0]} เว็บตรง ไม่ผ่านเอเย่นต์ ${year} รวม${keywords.secondary[0]}และ${keywords.secondary[1]}กว่า 1,000 เกม ฝากถอนออโต้ ไม่มีขั้นต่ำ สมัครวันนี้รับโบนัส 100%`;

  // Generate all content sections
  const faqSection = generateFAQSection(keywords, siteName, category);
  const articleContent = generateArticleContent(keywords, siteName, category, domain);

  // Generate Table of Contents
  const tocHTML = `
    <nav class="toc" aria-label="สารบัญ">
      <h2 class="toc-title">สารบัญ — ${categoryName} ${siteName}</h2>
      <ol>
        <li><a href="#intro">${keywords.primary[0]} — ${siteName} เว็บ${categoryName}อันดับ 1</a></li>
        <li><a href="#why-choose">ทำไมต้อง ${siteName} — 10 เหตุผล</a></li>
        <li><a href="#how-to">วิธีสมัครและเริ่มเล่น</a></li>
        <li><a href="#providers">รวมค่ายเกมชั้นนำ</a></li>
        <li><a href="#promotions">โปรโมชั่น ${year}</a></li>
        <li><a href="#tips">เทคนิคและสูตร${categoryName}</a></li>
        <li><a href="#faq">คำถามที่พบบ่อย (FAQ)</a></li>
        <li><a href="#conclusion">สรุป</a></li>
      </ol>
    </nav>
  `;

  // Generate related articles sidebar
  const relatedArticles = `
    <aside class="related-articles">
      <h3>บทความที่เกี่ยวข้อง</h3>
      <ul>
        ${keywords.longTail.map(lt => `<li><a href="#" title="${lt}">${lt}</a></li>`).join("\n")}
        ${keywords.primary.slice(0, 5).map(pk => `<li><a href="#" title="${pk} ${year}">${pk} ${year} — อัพเดทล่าสุด</a></li>`).join("\n")}
      </ul>
    </aside>
  `;

  // Generate keyword-rich footer links
  const footerLinks = `
    <div class="seo-footer-links">
      <h4>${categoryName} — ลิงก์ที่เกี่ยวข้อง</h4>
      <div class="footer-link-grid">
        ${keywords.primary.map(pk => `<a href="#" title="${pk}">${pk}</a>`).join("\n")}
        ${keywords.secondary.slice(0, 10).map(sk => `<a href="#" title="${sk}">${sk}</a>`).join("\n")}
        ${keywords.lsi.slice(0, 10).map(lsi => `<a href="#" title="${lsi}">${lsi}</a>`).join("\n")}
      </div>
    </div>
  `;

  // Generate Schema.org JSON-LD
  const schemaMarkup = generateSchemaMarkup(siteName, domain, category, keywords, title, metaDescription);

  // Build full HTML
  const fullHTML = `<!DOCTYPE html>
<html lang="th" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${metaDescription}">
  <meta name="keywords" content="${[...keywords.primary, ...keywords.secondary.slice(0, 5), ...keywords.lsi.slice(0, 5)].join(', ')}">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
  <meta name="author" content="${siteName}">
  <link rel="canonical" href="https://${domain}/">
  
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${metaDescription}">
  <meta property="og:url" content="https://${domain}/">
  <meta property="og:site_name" content="${siteName}">
  <meta property="og:locale" content="th_TH">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${metaDescription}">
  
  <!-- Hreflang -->
  <link rel="alternate" hreflang="th" href="https://${domain}/">
  <link rel="alternate" hreflang="en" href="https://${domain}/en/">
  <link rel="alternate" hreflang="x-default" href="https://${domain}/">
  
  <!-- Google Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.fontHeading)}:wght@400;600;700;800;900&family=${encodeURIComponent(theme.fontBody)}:wght@300;400;500;600&display=swap" rel="stylesheet">
  
  ${schemaMarkup}
  
  <style>
    :root {
      --primary: ${theme.primaryColor};
      --secondary: ${theme.secondaryColor};
      --accent: ${theme.accentColor};
      --bg: ${theme.bgColor};
      --text: ${theme.textColor};
      --font-heading: '${theme.fontHeading}', sans-serif;
      --font-body: '${theme.fontBody}', sans-serif;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; font-size: 16px; }
    body {
      font-family: var(--font-body);
      background: var(--bg);
      color: var(--text);
      line-height: 1.8;
      -webkit-font-smoothing: antialiased;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: var(--font-heading);
      font-weight: 700;
      line-height: 1.3;
      margin: 1.5em 0 0.5em;
    }
    h1 { font-size: 2.2rem; }
    h2 { font-size: 1.8rem; }
    h3 { font-size: 1.4rem; }
    h4 { font-size: 1.2rem; }
    a { color: var(--primary); text-decoration: underline; }
    a:hover { color: var(--accent); }
    p { margin-bottom: 1rem; }
    ul, ol { margin: 1rem 0; padding-left: 2rem; }
    li { margin-bottom: 0.5rem; }
    strong { color: var(--primary); }
    img { max-width: 100%; height: auto; }
    
    .container { max-width: 1200px; margin: 0 auto; padding: 0 1rem; }
    .content-wrapper { display: grid; grid-template-columns: 1fr 300px; gap: 2rem; }
    .main-content { min-width: 0; }
    
    /* Header */
    .site-header {
      background: ${theme.bgColor}ee;
      border-bottom: 1px solid ${theme.primaryColor}22;
      padding: 1rem 0;
      position: sticky; top: 0; z-index: 100;
    }
    .site-header .container { display: flex; align-items: center; justify-content: space-between; }
    .site-logo { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 800; color: var(--primary); text-decoration: none; }
    .site-nav { display: flex; gap: 1.5rem; }
    .site-nav a { color: var(--text); text-decoration: none; font-size: 0.9rem; }
    .site-nav a:hover { color: var(--primary); }
    
    /* Breadcrumbs */
    .breadcrumbs { padding: 0.75rem 0; font-size: 0.85rem; opacity: 0.7; }
    .breadcrumbs a { color: var(--primary); text-decoration: none; }
    .breadcrumbs span { margin: 0 0.5rem; }
    
    /* Hero */
    .hero {
      background: linear-gradient(135deg, ${theme.bgColor} 0%, ${theme.secondaryColor}33 100%);
      padding: 4rem 1rem;
      text-align: center;
    }
    .hero h1 { font-size: clamp(1.8rem, 4vw, 3rem); margin-bottom: 1rem; }
    .hero h1 span { color: var(--primary); }
    .hero p { font-size: 1.1rem; opacity: 0.8; max-width: 700px; margin: 0 auto 2rem; }
    .hero .cta-buttons { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
    .btn {
      display: inline-flex; align-items: center; gap: 0.5rem;
      padding: 0.75rem 2rem; border-radius: 8px; font-weight: 600;
      font-size: 1rem; cursor: pointer; border: none; text-decoration: none;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      color: #fff;
    }
    .btn-outline { background: transparent; border: 2px solid var(--primary); color: var(--primary); }
    
    /* TOC */
    .toc {
      background: ${theme.primaryColor}08;
      border: 1px solid ${theme.primaryColor}20;
      border-radius: 8px;
      padding: 1.5rem;
      margin: 2rem 0;
    }
    .toc-title { font-size: 1.2rem; margin-bottom: 1rem; }
    .toc ol { counter-reset: toc; }
    .toc li { counter-increment: toc; margin-bottom: 0.5rem; }
    .toc a { text-decoration: none; }
    .toc a:hover { text-decoration: underline; }
    
    /* AEO Block */
    .aeo-block {
      background: ${theme.primaryColor}08;
      border-left: 4px solid var(--primary);
      padding: 1.5rem;
      margin: 2rem 0;
      border-radius: 0 8px 8px 0;
    }
    .aeo-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--primary); margin-bottom: 0.5rem; font-weight: 700; }
    
    /* Section */
    .section { padding: 3rem 0; }
    .section-title { font-size: 1.8rem; margin-bottom: 0.5rem; }
    .section-subtitle { font-size: 1rem; opacity: 0.7; margin-bottom: 2rem; }
    
    /* Provider Grid */
    .provider-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
    .provider-card {
      background: ${theme.primaryColor}08;
      border: 1px solid ${theme.primaryColor}15;
      border-radius: 8px;
      padding: 1rem;
    }
    .provider-card h4 { margin: 0 0 0.5rem; font-size: 1rem; color: var(--primary); }
    .provider-card p { font-size: 0.85rem; opacity: 0.7; margin: 0; }
    
    /* FAQ */
    .faq-section { max-width: 900px; }
    .faq-item { border-bottom: 1px solid ${theme.primaryColor}15; padding: 1rem 0; }
    .faq-question { font-size: 1.1rem; font-weight: 600; margin: 0; cursor: pointer; }
    .faq-answer { padding-top: 0.75rem; font-size: 0.95rem; opacity: 0.8; line-height: 1.8; }
    
    /* Related Articles */
    .related-articles {
      background: ${theme.primaryColor}05;
      border: 1px solid ${theme.primaryColor}15;
      border-radius: 8px;
      padding: 1.5rem;
      position: sticky;
      top: 80px;
    }
    .related-articles h3 { font-size: 1.1rem; margin: 0 0 1rem; color: var(--primary); }
    .related-articles ul { list-style: none; padding: 0; }
    .related-articles li { margin-bottom: 0.75rem; }
    .related-articles a { font-size: 0.85rem; text-decoration: none; color: var(--text); opacity: 0.8; }
    .related-articles a:hover { color: var(--primary); opacity: 1; }
    
    /* Footer */
    .site-footer {
      background: ${theme.bgColor};
      border-top: 1px solid ${theme.primaryColor}15;
      padding: 3rem 0 1.5rem;
      margin-top: 3rem;
    }
    .footer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2rem; margin-bottom: 2rem; }
    .footer-col h4 { color: var(--primary); margin-bottom: 1rem; font-size: 1rem; }
    .footer-col a { display: block; color: var(--text); opacity: 0.7; padding: 0.25rem 0; font-size: 0.85rem; text-decoration: none; }
    .footer-col a:hover { opacity: 1; color: var(--primary); }
    .seo-footer-links { margin-top: 2rem; padding-top: 2rem; border-top: 1px solid ${theme.primaryColor}10; }
    .seo-footer-links h4 { font-size: 1rem; margin-bottom: 1rem; color: var(--primary); }
    .footer-link-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .footer-link-grid a {
      display: inline-block; padding: 0.25rem 0.75rem; font-size: 0.8rem;
      background: ${theme.primaryColor}08; border: 1px solid ${theme.primaryColor}15;
      border-radius: 4px; color: var(--text); opacity: 0.7; text-decoration: none;
    }
    .footer-link-grid a:hover { opacity: 1; color: var(--primary); border-color: var(--primary); }
    .footer-bottom { text-align: center; padding-top: 1.5rem; border-top: 1px solid ${theme.primaryColor}10; font-size: 0.8rem; opacity: 0.5; }
    
    /* Responsive */
    @media (max-width: 768px) {
      .content-wrapper { grid-template-columns: 1fr; }
      .site-nav { display: none; }
      .hero { padding: 2rem 1rem; }
      .provider-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header class="site-header">
    <div class="container">
      <a href="https://${domain}" class="site-logo">${siteName}</a>
      <nav class="site-nav" aria-label="เมนูหลัก">
        <a href="https://${domain}">หน้าแรก</a>
        <a href="https://${domain}/${category === "lottery" ? "lottery" : category === "baccarat" ? "casino" : "slots"}">${categoryName}</a>
        <a href="https://${domain}/promotions">โปรโมชั่น</a>
        <a href="https://${domain}/articles">บทความ</a>
        <a href="https://${domain}/contact">ติดต่อเรา</a>
      </nav>
    </div>
  </header>

  <!-- Breadcrumbs -->
  <div class="container">
    <nav class="breadcrumbs" aria-label="Breadcrumb" itemscope itemtype="https://schema.org/BreadcrumbList">
      <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
        <a itemprop="item" href="https://${domain}"><span itemprop="name">หน้าแรก</span></a>
        <meta itemprop="position" content="1">
      </span>
      <span>›</span>
      <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
        <a itemprop="item" href="https://${domain}/${category}"><span itemprop="name">${categoryName}</span></a>
        <meta itemprop="position" content="2">
      </span>
      <span>›</span>
      <span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
        <span itemprop="name">${siteName} ${keywords.primary[0]}</span>
        <meta itemprop="position" content="3">
      </span>
    </nav>
  </div>

  <!-- Hero -->
  <section class="hero">
    <h1>${keywords.primary[0]} <span>${siteName}</span> — ${categoryName} เว็บตรง อันดับ 1 ${year}</h1>
    <p>${metaDescription}</p>
    <div class="cta-buttons">
      <a href="https://${domain}/register" class="btn btn-primary">สมัครสมาชิก — รับโบนัส 100%</a>
      <a href="#intro" class="btn btn-outline">อ่านรีวิว${categoryName}</a>
    </div>
  </section>

  <!-- Main Content -->
  <div class="container">
    <div class="content-wrapper">
      <main class="main-content">
        ${tocHTML}
        ${articleContent}
        ${faqSection}
      </main>
      
      ${relatedArticles}
    </div>
  </div>

  <!-- Footer -->
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-col">
          <h4>${siteName}</h4>
          <a href="https://${domain}/about">เกี่ยวกับเรา</a>
          <a href="https://${domain}/privacy">นโยบายความเป็นส่วนตัว</a>
          <a href="https://${domain}/terms">ข้อกำหนดการใช้งาน</a>
          <a href="https://${domain}/responsible-gaming">เล่นอย่างรับผิดชอบ</a>
          <a href="https://${domain}/sitemap.xml">Sitemap</a>
        </div>
        <div class="footer-col">
          <h4>${categoryName}</h4>
          ${keywords.secondary.slice(0, 6).map(sk => `<a href="https://${domain}/${encodeURIComponent(sk)}" title="${sk}">${sk}</a>`).join("\n")}
        </div>
        <div class="footer-col">
          <h4>โปรโมชั่น</h4>
          <a href="https://${domain}/promotions/welcome">โบนัสสมาชิกใหม่ 100%</a>
          <a href="https://${domain}/promotions/cashback">คืนยอดเสีย 10%</a>
          <a href="https://${domain}/promotions/daily">โบนัสฝากรายวัน</a>
          <a href="https://${domain}/promotions/referral">แนะนำเพื่อน</a>
          <a href="https://${domain}/promotions/vip">VIP Club</a>
        </div>
        <div class="footer-col">
          <h4>ช่วยเหลือ</h4>
          <a href="https://${domain}/how-to-register">วิธีสมัคร</a>
          <a href="https://${domain}/how-to-deposit">วิธีฝากเงิน</a>
          <a href="https://${domain}/how-to-withdraw">วิธีถอนเงิน</a>
          <a href="https://${domain}/faq">คำถามที่พบบ่อย</a>
          <a href="https://${domain}/contact">ติดต่อเรา</a>
        </div>
      </div>
      
      ${footerLinks}
      
      <div class="footer-bottom">
        <p>© ${year} ${siteName}. All rights reserved. | ${keywords.primary[0]} | ${keywords.primary[1]} | ${keywords.primary[2]}</p>
        <p>${siteName} — ${categoryName} เว็บตรง ไม่ผ่านเอเย่นต์ ฝากถอนไม่มีขั้นต่ำ ปลอดภัย 100%</p>
      </div>
    </div>
  </footer>
</body>
</html>`;

  // Count stats
  const textContent = fullHTML.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
  const primaryKeyword = keywords.primary[0];
  const keywordCount = (textContent.match(new RegExp(primaryKeyword, "gi")) || []).length;
  const keywordDensity = Math.round((keywordCount / wordCount) * 10000) / 100;

  const h1Count = (fullHTML.match(/<h1/g) || []).length;
  const h2Count = (fullHTML.match(/<h2/g) || []).length;
  const h3Count = (fullHTML.match(/<h3/g) || []).length;
  const h4Count = (fullHTML.match(/<h4/g) || []).length;

  return {
    html: fullHTML,
    title,
    metaDescription,
    keywords: [...keywords.primary, ...keywords.secondary.slice(0, 5)],
    wordCount,
    keywordDensity,
    schemaTypes: ["WebSite", "Organization", "GamblingService", "FAQPage", "BreadcrumbList", "Article"],
    headingCount: { h1: h1Count, h2: h2Count, h3: h3Count, h4: h4Count },
  };
}

function generateSchemaMarkup(
  siteName: string,
  domain: string,
  category: string,
  keywords: KeywordSet,
  title: string,
  description: string
): string {
  const categoryName = category === "lottery" ? "หวยออนไลน์" : category === "baccarat" ? "บาคาร่าออนไลน์" : "สล็อตออนไลน์";

  return `
  <!-- Schema.org: WebSite -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "${siteName}",
    "url": "https://${domain}",
    "description": "${description.replace(/"/g, '\\"')}",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://${domain}/search?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  }
  </script>
  
  <!-- Schema.org: Organization -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "${siteName}",
    "url": "https://${domain}",
    "logo": "https://${domain}/logo.png",
    "description": "${siteName} — ${categoryName} เว็บตรง อันดับ 1 ของไทย",
    "sameAs": [
      "https://www.facebook.com/${siteName.toLowerCase()}",
      "https://twitter.com/${siteName.toLowerCase()}",
      "https://www.youtube.com/@${siteName.toLowerCase()}",
      "https://line.me/ti/p/@${siteName.toLowerCase()}"
    ],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "availableLanguage": ["Thai", "English"],
      "telephone": "+66-XXX-XXX-XXXX"
    }
  }
  </script>
  
  <!-- Schema.org: GamblingService -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "GamblingService",
    "name": "${siteName} ${categoryName}",
    "url": "https://${domain}",
    "description": "${siteName} ให้บริการ${categoryName}ครบวงจร ${keywords.secondary.slice(0, 5).join(', ')}",
    "provider": {
      "@type": "Organization",
      "name": "${siteName}"
    },
    "areaServed": {
      "@type": "Country",
      "name": "Thailand"
    },
    "offers": {
      "@type": "Offer",
      "description": "โบนัสสมาชิกใหม่ 100%",
      "priceCurrency": "THB"
    }
  }
  </script>
  
  <!-- Schema.org: Article -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${title.replace(/"/g, '\\"')}",
    "author": {
      "@type": "Organization",
      "name": "${siteName}"
    },
    "publisher": {
      "@type": "Organization",
      "name": "${siteName}",
      "logo": {
        "@type": "ImageObject",
        "url": "https://${domain}/logo.png"
      }
    },
    "datePublished": "2026-01-01",
    "dateModified": "2026-03-14",
    "mainEntityOfPage": "https://${domain}/",
    "description": "${description.replace(/"/g, '\\"')}"
  }
  </script>`;
}

// ═══════════════════════════════════════════════
// WordPress Deployment
// ═══════════════════════════════════════════════

export async function deployHomepageToWordPress(input: {
  domain: string;
  wpUsername: string;
  wpAppPassword: string;
  html: string;
  title: string;
}): Promise<{ success: boolean; detail: string; pageId?: number }> {
  const siteUrl = input.domain.startsWith("http") ? input.domain : `https://${input.domain}`;
  const auth = Buffer.from(`${input.wpUsername}:${input.wpAppPassword}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
  };

  try {
    // Step 1: Check if homepage already exists
    const pagesRes = await fetch(`${siteUrl}/wp-json/wp/v2/pages?slug=home&per_page=1`, { headers });
    let existingPageId: number | null = null;
    if (pagesRes.ok) {
      const pages = await pagesRes.json();
      if (pages.length > 0) {
        existingPageId = pages[0].id;
      }
    }

    // Step 2: Create or update page
    const pageData = {
      title: input.title,
      content: input.html,
      status: "publish",
      slug: "home",
      template: "page-fullwidth.php",
    };

    let pageRes: Response;
    if (existingPageId) {
      // Update existing
      pageRes = await fetch(`${siteUrl}/wp-json/wp/v2/pages/${existingPageId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(pageData),
      });
    } else {
      // Create new
      pageRes = await fetch(`${siteUrl}/wp-json/wp/v2/pages`, {
        method: "POST",
        headers,
        body: JSON.stringify(pageData),
      });
    }

    if (!pageRes.ok) {
      const err = await pageRes.text();
      return { success: false, detail: `WordPress API error: ${pageRes.status} — ${err}` };
    }

    const page = await pageRes.json();

    // Step 3: Set as front page
    try {
      await fetch(`${siteUrl}/wp-json/wp/v2/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          show_on_front: "page",
          page_on_front: page.id,
        }),
      });
    } catch {
      // Settings API might not be available, not critical
    }

    return {
      success: true,
      detail: `${existingPageId ? "Updated" : "Created"} SEO homepage (ID: ${page.id}) and set as front page`,
      pageId: page.id,
    };
  } catch (err: any) {
    return { success: false, detail: `Deploy error: ${err.message}` };
  }
}
