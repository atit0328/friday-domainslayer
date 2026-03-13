/**
 * WordPress Casino Theme Engine
 * Generates 10 unique casino themes (4 Slots, 3 Lottery, 3 Baccarat)
 * Full SEO 2026 compliance + mobile-responsive
 */

// ═══════════════════════════════════════════════
// Theme Definitions — 10 Unique Casino Themes
// ═══════════════════════════════════════════════

export interface ThemeSpec {
  slug: string;
  name: string;
  category: "slots" | "lottery" | "baccarat";
  description: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
  fontHeading: string;
  fontBody: string;
  layoutStyle: string;
  heroStyle: string;
  mobileNavStyle: string;
  seoSchemaTypes: string[];
  seoFeatures: string[];
  mobileFeatures: string[];
  tags: string[];
  designNotes: string;
}

export const THEME_SPECS: ThemeSpec[] = [
  // ═══ SLOTS (4 themes) ═══
  {
    slug: "neon-jackpot",
    name: "Neon Jackpot",
    category: "slots",
    description: "ธีมสล็อตสไตล์ Cyberpunk Neon สีสันจัดจ้าน แสงนีออนเรืองรอง เหมาะกับเว็บสล็อตออนไลน์ที่ต้องการความทันสมัยและดึงดูดสายตา",
    primaryColor: "#00f0ff",
    secondaryColor: "#ff00e5",
    accentColor: "#ffea00",
    bgColor: "#0a0a1a",
    textColor: "#e0e0ff",
    fontHeading: "Orbitron",
    fontBody: "Inter",
    layoutStyle: "fullwidth",
    heroStyle: "animated-particles",
    mobileNavStyle: "bottom-tab",
    seoSchemaTypes: ["GamblingService", "FAQ", "Review", "BreadcrumbList", "WebSite"],
    seoFeatures: ["aeo-blocks", "topic-clusters", "rich-snippets", "voice-search", "schema-gambling"],
    mobileFeatures: ["pwa", "touch-gestures", "bottom-nav", "swipe-cards", "haptic-feedback"],
    tags: ["slots", "neon", "cyberpunk", "dark-theme", "animated"],
    designNotes: "Neon glow effects on buttons/cards, particle.js background, gradient borders, pulsing jackpot counter",
  },
  {
    slug: "royal-spin",
    name: "Royal Spin",
    category: "slots",
    description: "ธีมสล็อตหรูหราสไตล์ Royal Gold คลาสสิกแต่ทันสมัย สีทองและแดงเข้ม เหมาะกับเว็บสล็อตพรีเมียม",
    primaryColor: "#d4af37",
    secondaryColor: "#8b0000",
    accentColor: "#ffd700",
    bgColor: "#1a0a0a",
    textColor: "#f5e6c8",
    fontHeading: "Playfair Display",
    fontBody: "Lora",
    layoutStyle: "boxed",
    heroStyle: "slider",
    mobileNavStyle: "hamburger",
    seoSchemaTypes: ["GamblingService", "FAQ", "Review", "BreadcrumbList", "Organization"],
    seoFeatures: ["aeo-blocks", "rich-snippets", "internal-linking", "breadcrumbs"],
    mobileFeatures: ["pwa", "touch-gestures", "swipe-slider", "pull-to-refresh"],
    tags: ["slots", "royal", "gold", "luxury", "premium"],
    designNotes: "Gold gradient text, ornamental borders, crown icons, velvet texture backgrounds, elegant card designs",
  },
  {
    slug: "cyber-slots",
    name: "Cyber Slots",
    category: "slots",
    description: "ธีมสล็อตสไตล์ Sci-Fi Futuristic โทนสีน้ำเงินเข้มกับเขียวเรืองแสง เหมาะกับเว็บสล็อตที่เน้นเทคโนโลยีและนวัตกรรม",
    primaryColor: "#00e676",
    secondaryColor: "#2979ff",
    accentColor: "#76ff03",
    bgColor: "#0d1117",
    textColor: "#c9d1d9",
    fontHeading: "Rajdhani",
    fontBody: "Source Sans 3",
    layoutStyle: "fullwidth",
    heroStyle: "video-bg",
    mobileNavStyle: "slide-drawer",
    seoSchemaTypes: ["GamblingService", "FAQ", "SoftwareApplication", "BreadcrumbList"],
    seoFeatures: ["aeo-blocks", "topic-clusters", "voice-search", "amp-pages"],
    mobileFeatures: ["pwa", "touch-gestures", "bottom-nav", "offline-mode", "push-notifications"],
    tags: ["slots", "cyber", "sci-fi", "futuristic", "tech"],
    designNotes: "Matrix-style code rain, holographic card effects, glitch text animations, circuit board patterns",
  },
  {
    slug: "lucky-fortune",
    name: "Lucky Fortune",
    category: "slots",
    description: "ธีมสล็อตสไตล์จีนมงคล สีแดงทอง ลายมังกร เหมาะกับเว็บสล็อตที่เน้นตลาดเอเชียและความเป็นสิริมงคล",
    primaryColor: "#ff1744",
    secondaryColor: "#ff6d00",
    accentColor: "#ffd600",
    bgColor: "#1a0000",
    textColor: "#ffe0b2",
    fontHeading: "Noto Serif Thai",
    fontBody: "Sarabun",
    layoutStyle: "fullwidth",
    heroStyle: "static-hero",
    mobileNavStyle: "bottom-tab",
    seoSchemaTypes: ["GamblingService", "FAQ", "Review", "BreadcrumbList", "Event"],
    seoFeatures: ["aeo-blocks", "rich-snippets", "multi-language", "hreflang"],
    mobileFeatures: ["pwa", "touch-gestures", "bottom-nav", "swipe-cards"],
    tags: ["slots", "chinese", "fortune", "lucky", "asian", "dragon"],
    designNotes: "Dragon motifs, Chinese lantern decorations, fortune coin animations, red envelope promotions, gold embossed elements",
  },

  // ═══ LOTTERY (3 themes) ═══
  {
    slug: "golden-lottery",
    name: "Golden Lottery",
    category: "lottery",
    description: "ธีมหวยสไตล์ทองคำหรูหรา เน้นตัวเลขและผลรางวัล สีทองบนพื้นดำ เหมาะกับเว็บหวยออนไลน์ที่ต้องการความน่าเชื่อถือ",
    primaryColor: "#ffc107",
    secondaryColor: "#ff9800",
    accentColor: "#ffeb3b",
    bgColor: "#121212",
    textColor: "#fafafa",
    fontHeading: "Kanit",
    fontBody: "Prompt",
    layoutStyle: "boxed",
    heroStyle: "static-hero",
    mobileNavStyle: "bottom-tab",
    seoSchemaTypes: ["GamblingService", "FAQ", "BreadcrumbList", "WebSite", "Event"],
    seoFeatures: ["aeo-blocks", "rich-snippets", "live-results", "structured-data-event"],
    mobileFeatures: ["pwa", "push-notifications", "bottom-nav", "number-picker"],
    tags: ["lottery", "gold", "numbers", "thai-lottery", "results"],
    designNotes: "Large number displays, lottery ball animations, gold gradient backgrounds, result tables, countdown timers",
  },
  {
    slug: "mega-draw",
    name: "Mega Draw",
    category: "lottery",
    description: "ธีมหวยสไตล์ Modern Minimal สีม่วงน้ำเงิน สะอาดตา เน้น UX ง่ายต่อการใช้งาน เหมาะกับเว็บหวยที่เน้นความทันสมัย",
    primaryColor: "#7c4dff",
    secondaryColor: "#448aff",
    accentColor: "#18ffff",
    bgColor: "#0f0f23",
    textColor: "#e8e8f0",
    fontHeading: "Space Grotesk",
    fontBody: "DM Sans",
    layoutStyle: "fullwidth",
    heroStyle: "animated-particles",
    mobileNavStyle: "slide-drawer",
    seoSchemaTypes: ["GamblingService", "FAQ", "BreadcrumbList", "HowTo"],
    seoFeatures: ["aeo-blocks", "topic-clusters", "voice-search", "how-to-schema"],
    mobileFeatures: ["pwa", "touch-gestures", "swipe-cards", "shake-to-random", "bottom-nav"],
    tags: ["lottery", "modern", "minimal", "purple", "clean"],
    designNotes: "Glassmorphism cards, floating number orbs, gradient mesh backgrounds, smooth animations, clean data tables",
  },
  {
    slug: "lucky-numbers",
    name: "Lucky Numbers",
    category: "lottery",
    description: "ธีมหวยสไตล์ Retro Pop สีสดใส สนุกสนาน เหมาะกับเว็บหวยที่เน้นความสนุกและเข้าถึงง่าย ดึงดูดผู้เล่นรุ่นใหม่",
    primaryColor: "#e91e63",
    secondaryColor: "#9c27b0",
    accentColor: "#00e5ff",
    bgColor: "#1a1a2e",
    textColor: "#eaeaea",
    fontHeading: "Bungee",
    fontBody: "Nunito",
    layoutStyle: "fullwidth",
    heroStyle: "slider",
    mobileNavStyle: "bottom-tab",
    seoSchemaTypes: ["GamblingService", "FAQ", "BreadcrumbList", "Review"],
    seoFeatures: ["aeo-blocks", "rich-snippets", "gamified-content", "engagement-signals"],
    mobileFeatures: ["pwa", "touch-gestures", "bottom-nav", "lottery-wheel", "confetti-effects"],
    tags: ["lottery", "retro", "pop", "colorful", "fun", "young"],
    designNotes: "Lottery wheel spinner, confetti animations, bold typography, pop art elements, scratch card interactions",
  },

  // ═══ BACCARAT (3 themes) ═══
  {
    slug: "vip-baccarat",
    name: "VIP Baccarat",
    category: "baccarat",
    description: "ธีมบาคาร่าสไตล์ VIP Room สีดำทอง หรูหราเหนือระดับ เหมาะกับเว็บบาคาร่าที่เน้นลูกค้า High Roller",
    primaryColor: "#c9a84c",
    secondaryColor: "#1a1a2e",
    accentColor: "#e8d5a3",
    bgColor: "#0a0a14",
    textColor: "#d4c5a0",
    fontHeading: "Cormorant Garamond",
    fontBody: "EB Garamond",
    layoutStyle: "boxed",
    heroStyle: "video-bg",
    mobileNavStyle: "hamburger",
    seoSchemaTypes: ["GamblingService", "FAQ", "Review", "BreadcrumbList", "Organization"],
    seoFeatures: ["aeo-blocks", "rich-snippets", "expert-reviews", "trust-signals"],
    mobileFeatures: ["pwa", "touch-gestures", "swipe-cards", "live-stream-pip"],
    tags: ["baccarat", "vip", "luxury", "gold", "black", "high-roller"],
    designNotes: "Marble textures, gold foil accents, playing card motifs, VIP badge system, live dealer preview cards",
  },
  {
    slug: "monaco-elite",
    name: "Monaco Elite",
    category: "baccarat",
    description: "ธีมบาคาร่าสไตล์ Monaco Casino สีเขียวเข้มกับทอง คลาสสิกแบบคาสิโนยุโรป เหมาะกับเว็บบาคาร่าที่เน้นความเป็นสากล",
    primaryColor: "#00695c",
    secondaryColor: "#004d40",
    accentColor: "#b8860b",
    bgColor: "#0d1f1c",
    textColor: "#e0f2f1",
    fontHeading: "Cinzel",
    fontBody: "Crimson Text",
    layoutStyle: "sidebar-right",
    heroStyle: "static-hero",
    mobileNavStyle: "hamburger",
    seoSchemaTypes: ["GamblingService", "FAQ", "Review", "BreadcrumbList", "Place"],
    seoFeatures: ["aeo-blocks", "rich-snippets", "geo-targeting", "multi-language"],
    mobileFeatures: ["pwa", "touch-gestures", "live-chat", "card-flip-animation"],
    tags: ["baccarat", "monaco", "european", "classic", "green", "elegant"],
    designNotes: "Casino felt green tables, chip stack visuals, European roulette accents, chandelier decorations, card dealing animations",
  },
  {
    slug: "dragon-tiger",
    name: "Dragon Tiger",
    category: "baccarat",
    description: "ธีมบาคาร่าสไตล์ Dragon Tiger เอเชียนฟิวชั่น สีแดงดำทอง ผสมผสานมังกรกับเสือ เหมาะกับเว็บบาคาร่าตลาดเอเชีย",
    primaryColor: "#d32f2f",
    secondaryColor: "#f57f17",
    accentColor: "#ff6f00",
    bgColor: "#120808",
    textColor: "#ffccbc",
    fontHeading: "Noto Sans Thai",
    fontBody: "Mitr",
    layoutStyle: "fullwidth",
    heroStyle: "animated-particles",
    mobileNavStyle: "bottom-tab",
    seoSchemaTypes: ["GamblingService", "FAQ", "Review", "BreadcrumbList", "Event"],
    seoFeatures: ["aeo-blocks", "rich-snippets", "multi-language", "hreflang", "live-results"],
    mobileFeatures: ["pwa", "touch-gestures", "bottom-nav", "card-reveal", "dragon-animation"],
    tags: ["baccarat", "dragon", "tiger", "asian", "red", "gold", "fusion"],
    designNotes: "Dragon and tiger illustrations, fire/smoke particle effects, Asian ornamental borders, card reveal animations, scoreboard road maps",
  },
];

// ═══════════════════════════════════════════════
// WordPress Theme File Generator
// ═══════════════════════════════════════════════

export function generateStyleCSS(theme: ThemeSpec): string {
  return `/*
Theme Name: ${theme.name}
Theme URI: https://domainslayer.ai/themes/${theme.slug}
Author: FridayAI x DomainSlayer
Author URI: https://domainslayer.ai
Description: ${theme.description}
Version: 1.0.0
License: GNU General Public License v2 or later
License URI: http://www.gnu.org/licenses/gpl-2.0.html
Tags: ${theme.tags.join(", ")}
Text Domain: ${theme.slug}
Requires at least: 6.4
Tested up to: 6.7
Requires PHP: 8.1
*/

/* ═══ CSS Variables ═══ */
:root {
  --primary: ${theme.primaryColor};
  --secondary: ${theme.secondaryColor};
  --accent: ${theme.accentColor};
  --bg: ${theme.bgColor};
  --text: ${theme.textColor};
  --font-heading: '${theme.fontHeading}', sans-serif;
  --font-body: '${theme.fontBody}', sans-serif;
  --radius: 12px;
  --shadow: 0 4px 24px rgba(0,0,0,0.3);
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ═══ Reset & Base ═══ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; font-size: 16px; }
body {
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--text);
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
h1, h2, h3, h4, h5, h6 { font-family: var(--font-heading); font-weight: 700; line-height: 1.2; }
a { color: var(--primary); text-decoration: none; transition: var(--transition); }
a:hover { color: var(--accent); }
img { max-width: 100%; height: auto; display: block; }

/* ═══ Layout ═══ */
.container { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 1rem; }
.site-header {
  position: sticky; top: 0; z-index: 100;
  background: ${theme.bgColor}ee;
  backdrop-filter: blur(20px);
  border-bottom: 1px solid ${theme.primaryColor}22;
  padding: 0.75rem 0;
}
.site-header .container {
  display: flex; align-items: center; justify-content: space-between;
}
.site-logo { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 800; color: var(--primary); }
.site-nav { display: flex; gap: 1.5rem; align-items: center; }
.site-nav a { color: var(--text); font-size: 0.9rem; font-weight: 500; position: relative; }
.site-nav a:hover { color: var(--primary); }
.site-nav a::after {
  content: ''; position: absolute; bottom: -4px; left: 0; width: 0; height: 2px;
  background: var(--primary); transition: width 0.3s;
}
.site-nav a:hover::after { width: 100%; }

/* ═══ Hero Section ═══ */
.hero {
  min-height: 80vh; display: flex; align-items: center; justify-content: center;
  text-align: center; position: relative; overflow: hidden;
  background: linear-gradient(135deg, ${theme.bgColor} 0%, ${theme.secondaryColor}33 100%);
  padding: 4rem 1rem;
}
.hero::before {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(circle at 30% 50%, ${theme.primaryColor}15 0%, transparent 60%),
              radial-gradient(circle at 70% 50%, ${theme.secondaryColor}15 0%, transparent 60%);
}
.hero-content { position: relative; z-index: 2; max-width: 800px; }
.hero h1 { font-size: clamp(2rem, 5vw, 4rem); margin-bottom: 1rem; }
.hero h1 span { color: var(--primary); }
.hero p { font-size: clamp(1rem, 2vw, 1.25rem); opacity: 0.8; margin-bottom: 2rem; }

/* ═══ Buttons ═══ */
.btn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.75rem 2rem; border-radius: var(--radius); font-weight: 600;
  font-size: 1rem; cursor: pointer; border: none; transition: var(--transition);
  text-transform: uppercase; letter-spacing: 0.5px;
}
.btn-primary {
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  color: ${theme.bgColor}; box-shadow: 0 4px 15px ${theme.primaryColor}40;
}
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 25px ${theme.primaryColor}60; }
.btn-outline {
  background: transparent; border: 2px solid var(--primary); color: var(--primary);
}
.btn-outline:hover { background: var(--primary); color: var(--bg); }

/* ═══ Cards ═══ */
.card {
  background: ${theme.bgColor}cc;
  border: 1px solid ${theme.primaryColor}20;
  border-radius: var(--radius);
  padding: 1.5rem;
  transition: var(--transition);
}
.card:hover {
  transform: translateY(-4px);
  border-color: ${theme.primaryColor}50;
  box-shadow: 0 8px 30px ${theme.primaryColor}15;
}
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; }

/* ═══ Game Grid ═══ */
.game-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
.game-card {
  border-radius: var(--radius); overflow: hidden; position: relative;
  aspect-ratio: 3/4; cursor: pointer; transition: var(--transition);
}
.game-card img { width: 100%; height: 100%; object-fit: cover; }
.game-card:hover { transform: scale(1.05); box-shadow: 0 8px 30px ${theme.primaryColor}30; }
.game-card .overlay {
  position: absolute; inset: 0;
  background: linear-gradient(to top, ${theme.bgColor}ee 0%, transparent 60%);
  display: flex; flex-direction: column; justify-content: flex-end; padding: 1rem;
}
.game-card .game-name { font-weight: 700; font-size: 0.9rem; }
.game-card .game-provider { font-size: 0.75rem; opacity: 0.7; }

/* ═══ Sections ═══ */
.section { padding: 4rem 0; }
.section-title {
  font-size: clamp(1.5rem, 3vw, 2.5rem); margin-bottom: 0.5rem;
  position: relative; display: inline-block;
}
.section-title::after {
  content: ''; display: block; width: 60px; height: 3px;
  background: var(--primary); margin-top: 0.5rem;
}
.section-subtitle { font-size: 1rem; opacity: 0.7; margin-bottom: 2rem; }

/* ═══ Promotions ═══ */
.promo-banner {
  background: linear-gradient(135deg, ${theme.primaryColor}20, ${theme.secondaryColor}20);
  border: 1px solid ${theme.primaryColor}30;
  border-radius: var(--radius); padding: 2rem; text-align: center;
}
.promo-badge {
  display: inline-block; padding: 0.25rem 0.75rem; border-radius: 20px;
  background: var(--primary); color: var(--bg); font-size: 0.75rem; font-weight: 700;
}

/* ═══ Footer ═══ */
.site-footer {
  background: ${theme.bgColor}; border-top: 1px solid ${theme.primaryColor}15;
  padding: 3rem 0 1.5rem;
}
.footer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2rem; margin-bottom: 2rem; }
.footer-col h4 { color: var(--primary); margin-bottom: 1rem; font-size: 1rem; }
.footer-col a { display: block; color: var(--text); opacity: 0.7; padding: 0.25rem 0; font-size: 0.9rem; }
.footer-col a:hover { opacity: 1; color: var(--primary); }
.footer-bottom { text-align: center; padding-top: 1.5rem; border-top: 1px solid ${theme.primaryColor}10; font-size: 0.8rem; opacity: 0.5; }

/* ═══ Trust Badges ═══ */
.trust-badges { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; padding: 2rem 0; }
.trust-badge {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem;
  border: 1px solid ${theme.primaryColor}20; border-radius: 8px; font-size: 0.8rem;
}

/* ═══ SEO: Breadcrumbs ═══ */
.breadcrumbs { padding: 0.75rem 0; font-size: 0.85rem; opacity: 0.7; }
.breadcrumbs a { color: var(--primary); }
.breadcrumbs span { margin: 0 0.5rem; }

/* ═══ SEO: FAQ Accordion ═══ */
.faq-section { max-width: 800px; margin: 0 auto; }
.faq-item { border-bottom: 1px solid ${theme.primaryColor}15; }
.faq-question {
  width: 100%; padding: 1.25rem 0; background: none; border: none;
  color: var(--text); font-size: 1rem; font-weight: 600; text-align: left;
  cursor: pointer; display: flex; justify-content: space-between; align-items: center;
}
.faq-answer { padding: 0 0 1.25rem; font-size: 0.95rem; opacity: 0.8; line-height: 1.8; }

/* ═══ AEO Block (Answer Engine Optimization) ═══ */
.aeo-block {
  background: ${theme.primaryColor}08; border-left: 4px solid var(--primary);
  padding: 1.5rem; margin: 2rem 0; border-radius: 0 var(--radius) var(--radius) 0;
}
.aeo-block .aeo-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--primary); margin-bottom: 0.5rem; }

/* ═══ Live Results (Lottery) ═══ */
.live-results {
  background: ${theme.primaryColor}10; border: 1px solid ${theme.primaryColor}20;
  border-radius: var(--radius); padding: 2rem; text-align: center;
}
.result-number {
  display: inline-flex; align-items: center; justify-content: center;
  width: 60px; height: 60px; border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  color: var(--bg); font-size: 1.5rem; font-weight: 800; margin: 0.5rem;
}

/* ═══ Baccarat Scoreboard ═══ */
.scoreboard { display: grid; grid-template-columns: repeat(auto-fill, minmax(24px, 1fr)); gap: 2px; }
.score-dot {
  width: 24px; height: 24px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 700;
}
.score-banker { background: #d32f2f; color: white; }
.score-player { background: #1565c0; color: white; }
.score-tie { background: #2e7d32; color: white; }

/* ═══ Responsive: Tablet ═══ */
@media (max-width: 1024px) {
  .hero { min-height: 60vh; }
  .game-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
}

/* ═══ Responsive: Mobile ═══ */
@media (max-width: 768px) {
  .site-nav { display: none; }
  .mobile-nav { display: flex; }
  .hero { min-height: 50vh; padding: 2rem 1rem; }
  .hero h1 { font-size: 1.75rem; }
  .section { padding: 2rem 0; }
  .card-grid { grid-template-columns: 1fr; }
  .game-grid { grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
  .footer-grid { grid-template-columns: repeat(2, 1fr); }
}

/* ═══ Mobile Bottom Navigation ═══ */
.mobile-nav {
  display: none; position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
  background: ${theme.bgColor}f5; backdrop-filter: blur(20px);
  border-top: 1px solid ${theme.primaryColor}20;
  padding: 0.5rem; padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
}
.mobile-nav-items { display: flex; justify-content: space-around; }
.mobile-nav-item {
  display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
  color: var(--text); opacity: 0.6; font-size: 0.65rem; padding: 0.25rem;
  text-decoration: none; transition: var(--transition);
}
.mobile-nav-item.active, .mobile-nav-item:hover { opacity: 1; color: var(--primary); }
@media (max-width: 768px) { .mobile-nav { display: block; } body { padding-bottom: 70px; } }

/* ═══ Animations ═══ */
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
@keyframes glow { 0%, 100% { box-shadow: 0 0 5px ${theme.primaryColor}40; } 50% { box-shadow: 0 0 20px ${theme.primaryColor}80; } }
.animate-fadeInUp { animation: fadeInUp 0.6s ease-out; }
.animate-pulse { animation: pulse 2s infinite; }
.animate-glow { animation: glow 2s infinite; }

/* ═══ Print Styles ═══ */
@media print { .site-header, .site-footer, .mobile-nav, .btn { display: none; } body { background: white; color: black; } }
`;
}

export function generateFunctionsPHP(theme: ThemeSpec): string {
  return `<?php
/**
 * ${theme.name} - WordPress Casino Theme
 * Category: ${theme.category}
 * SEO 2026 Optimized + Mobile-First
 */

if (!defined('ABSPATH')) exit;

define('THEME_VERSION', '1.0.0');
define('THEME_SLUG', '${theme.slug}');

// ═══ Theme Setup ═══
function ${theme.slug.replace(/-/g, '_')}_setup() {
    // Theme supports
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('custom-logo', ['width' => 300, 'height' => 100, 'flex-height' => true, 'flex-width' => true]);
    add_theme_support('html5', ['search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script']);
    add_theme_support('responsive-embeds');
    add_theme_support('wp-block-styles');
    add_theme_support('editor-styles');
    add_theme_support('custom-header');
    add_theme_support('custom-background');

    // Register nav menus
    register_nav_menus([
        'primary' => __('Primary Menu', '${theme.slug}'),
        'footer' => __('Footer Menu', '${theme.slug}'),
        'mobile' => __('Mobile Menu', '${theme.slug}'),
    ]);

    // Image sizes
    add_image_size('game-thumb', 360, 480, true);
    add_image_size('promo-banner', 1200, 400, true);
    add_image_size('hero-bg', 1920, 1080, true);
}
add_action('after_setup_theme', '${theme.slug.replace(/-/g, '_')}_setup');

// ═══ Enqueue Styles & Scripts ═══
function ${theme.slug.replace(/-/g, '_')}_scripts() {
    // Google Fonts
    wp_enqueue_style('google-fonts', 'https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.fontHeading)}:wght@400;600;700;800&family=${encodeURIComponent(theme.fontBody)}:wght@300;400;500;600&display=swap', [], null);

    // Theme stylesheet
    wp_enqueue_style('theme-style', get_stylesheet_uri(), [], THEME_VERSION);

    // Theme scripts
    wp_enqueue_script('theme-main', get_template_directory_uri() . '/assets/js/main.js', [], THEME_VERSION, true);

    // Localize script for AJAX
    wp_localize_script('theme-main', 'themeData', [
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'nonce' => wp_create_nonce('theme_nonce'),
        'siteUrl' => home_url('/'),
    ]);
}
add_action('wp_enqueue_scripts', '${theme.slug.replace(/-/g, '_')}_scripts');

// ═══ SEO 2026: Schema.org Structured Data ═══
function ${theme.slug.replace(/-/g, '_')}_schema_output() {
    $schema = [
        '@context' => 'https://schema.org',
        '@graph' => [],
    ];

    // WebSite schema
    $schema['@graph'][] = [
        '@type' => 'WebSite',
        '@id' => home_url('/#website'),
        'url' => home_url('/'),
        'name' => get_bloginfo('name'),
        'description' => get_bloginfo('description'),
        'potentialAction' => [
            '@type' => 'SearchAction',
            'target' => ['@type' => 'EntryPoint', 'urlTemplate' => home_url('/?s={search_term_string}')],
            'query-input' => 'required name=search_term_string',
        ],
    ];

    // Organization schema
    $schema['@graph'][] = [
        '@type' => 'Organization',
        '@id' => home_url('/#organization'),
        'name' => get_bloginfo('name'),
        'url' => home_url('/'),
        'logo' => ['@type' => 'ImageObject', 'url' => get_site_icon_url()],
    ];

    // GamblingService schema (SEO 2026)
    $schema['@graph'][] = [
        '@type' => 'GamblingService',
        'name' => get_bloginfo('name'),
        'url' => home_url('/'),
        'description' => get_bloginfo('description'),
        'areaServed' => ['@type' => 'Country', 'name' => 'Thailand'],
        'serviceType' => '${theme.category === "slots" ? "Online Slots" : theme.category === "lottery" ? "Online Lottery" : "Online Baccarat"}',
    ];

    // BreadcrumbList schema
    if (!is_front_page()) {
        $breadcrumbs = [
            ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => home_url('/')],
        ];
        if (is_single() || is_page()) {
            $breadcrumbs[] = ['@type' => 'ListItem', 'position' => 2, 'name' => get_the_title(), 'item' => get_permalink()];
        }
        $schema['@graph'][] = [
            '@type' => 'BreadcrumbList',
            'itemListElement' => $breadcrumbs,
        ];
    }

    echo '<script type="application/ld+json">' . wp_json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . '</script>' . "\\n";
}
add_action('wp_head', '${theme.slug.replace(/-/g, '_')}_schema_output', 1);

// ═══ SEO 2026: Core Web Vitals Optimization ═══
function ${theme.slug.replace(/-/g, '_')}_cwv_optimization() {
    // Preconnect to Google Fonts
    echo '<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>' . "\\n";
    echo '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' . "\\n";

    // DNS Prefetch
    echo '<link rel="dns-prefetch" href="//www.google-analytics.com">' . "\\n";
    echo '<link rel="dns-prefetch" href="//www.googletagmanager.com">' . "\\n";

    // Preload critical font
    echo '<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.fontHeading)}:wght@700;800&display=swap">' . "\\n";

    // Meta viewport for mobile
    echo '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">' . "\\n";

    // Theme color
    echo '<meta name="theme-color" content="${theme.primaryColor}">' . "\\n";
    echo '<meta name="msapplication-TileColor" content="${theme.primaryColor}">' . "\\n";
}
add_action('wp_head', '${theme.slug.replace(/-/g, '_')}_cwv_optimization', 0);

// ═══ SEO 2026: Open Graph & Twitter Cards ═══
function ${theme.slug.replace(/-/g, '_')}_social_meta() {
    echo '<meta property="og:type" content="website">' . "\\n";
    echo '<meta property="og:title" content="' . esc_attr(wp_get_document_title()) . '">' . "\\n";
    echo '<meta property="og:description" content="' . esc_attr(get_bloginfo('description')) . '">' . "\\n";
    echo '<meta property="og:url" content="' . esc_url(get_permalink()) . '">' . "\\n";
    echo '<meta property="og:site_name" content="' . esc_attr(get_bloginfo('name')) . '">' . "\\n";
    if (has_post_thumbnail()) {
        echo '<meta property="og:image" content="' . esc_url(get_the_post_thumbnail_url(null, 'large')) . '">' . "\\n";
    }
    echo '<meta name="twitter:card" content="summary_large_image">' . "\\n";
    echo '<meta name="twitter:title" content="' . esc_attr(wp_get_document_title()) . '">' . "\\n";
}
add_action('wp_head', '${theme.slug.replace(/-/g, '_')}_social_meta');

// ═══ Performance: Lazy Load & Defer ═══
function ${theme.slug.replace(/-/g, '_')}_performance_tweaks() {
    // Add loading="lazy" to images
    add_filter('wp_get_attachment_image_attributes', function($attr) {
        if (!isset($attr['loading'])) $attr['loading'] = 'lazy';
        return $attr;
    });

    // Defer non-critical JS
    add_filter('script_loader_tag', function($tag, $handle) {
        if (is_admin()) return $tag;
        if (in_array($handle, ['theme-main'])) {
            return str_replace(' src', ' defer src', $tag);
        }
        return $tag;
    }, 10, 2);

    // Remove unnecessary WP head items
    remove_action('wp_head', 'wp_generator');
    remove_action('wp_head', 'wlwmanifest_link');
    remove_action('wp_head', 'rsd_link');
    remove_action('wp_head', 'wp_shortlink_wp_head');
    remove_action('wp_head', 'print_emoji_detection_script', 7);
    remove_action('wp_print_styles', 'print_emoji_styles');
}
add_action('init', '${theme.slug.replace(/-/g, '_')}_performance_tweaks');

// ═══ Widget Areas ═══
function ${theme.slug.replace(/-/g, '_')}_widgets_init() {
    register_sidebar([
        'name' => __('Sidebar', '${theme.slug}'),
        'id' => 'sidebar-1',
        'before_widget' => '<div class="widget card">',
        'after_widget' => '</div>',
        'before_title' => '<h3 class="widget-title">',
        'after_title' => '</h3>',
    ]);
    register_sidebar([
        'name' => __('Footer 1', '${theme.slug}'),
        'id' => 'footer-1',
        'before_widget' => '<div class="footer-widget">',
        'after_widget' => '</div>',
        'before_title' => '<h4>',
        'after_title' => '</h4>',
    ]);
    register_sidebar([
        'name' => __('Footer 2', '${theme.slug}'),
        'id' => 'footer-2',
        'before_widget' => '<div class="footer-widget">',
        'after_widget' => '</div>',
        'before_title' => '<h4>',
        'after_title' => '</h4>',
    ]);
}
add_action('widgets_init', '${theme.slug.replace(/-/g, '_')}_widgets_init');

// ═══ Custom Post Type: Games ═══
function ${theme.slug.replace(/-/g, '_')}_register_cpt() {
    register_post_type('game', [
        'labels' => [
            'name' => __('Games', '${theme.slug}'),
            'singular_name' => __('Game', '${theme.slug}'),
        ],
        'public' => true,
        'has_archive' => true,
        'rewrite' => ['slug' => 'games'],
        'supports' => ['title', 'editor', 'thumbnail', 'excerpt', 'custom-fields'],
        'menu_icon' => 'dashicons-games',
        'show_in_rest' => true,
    ]);

    register_taxonomy('game_category', 'game', [
        'labels' => ['name' => __('Game Categories', '${theme.slug}')],
        'hierarchical' => true,
        'rewrite' => ['slug' => 'game-category'],
        'show_in_rest' => true,
    ]);

    register_post_type('promotion', [
        'labels' => [
            'name' => __('Promotions', '${theme.slug}'),
            'singular_name' => __('Promotion', '${theme.slug}'),
        ],
        'public' => true,
        'has_archive' => true,
        'rewrite' => ['slug' => 'promotions'],
        'supports' => ['title', 'editor', 'thumbnail', 'excerpt'],
        'menu_icon' => 'dashicons-megaphone',
        'show_in_rest' => true,
    ]);
}
add_action('init', '${theme.slug.replace(/-/g, '_')}_register_cpt');

// ═══ SEO: Canonical URL ═══
function ${theme.slug.replace(/-/g, '_')}_canonical_url() {
    if (is_singular()) {
        echo '<link rel="canonical" href="' . esc_url(get_permalink()) . '">' . "\\n";
    } elseif (is_home() || is_front_page()) {
        echo '<link rel="canonical" href="' . esc_url(home_url('/')) . '">' . "\\n";
    }
}
add_action('wp_head', '${theme.slug.replace(/-/g, '_')}_canonical_url');

// ═══ PWA: Web App Manifest ═══
function ${theme.slug.replace(/-/g, '_')}_pwa_manifest() {
    echo '<link rel="manifest" href="' . get_template_directory_uri() . '/manifest.json">' . "\\n";
    echo '<meta name="apple-mobile-web-app-capable" content="yes">' . "\\n";
    echo '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' . "\\n";
}
add_action('wp_head', '${theme.slug.replace(/-/g, '_')}_pwa_manifest');

// ═══ Responsible Gambling Notice ═══
function ${theme.slug.replace(/-/g, '_')}_responsible_gambling() {
    echo '<div class="responsible-gambling" style="text-align:center;padding:1rem;font-size:0.8rem;opacity:0.6;">';
    echo '<p>🔞 เว็บไซต์นี้สำหรับผู้ที่มีอายุ 18 ปีขึ้นไปเท่านั้น | เล่นอย่างรับผิดชอบ</p>';
    echo '</div>';
}
add_action('wp_footer', '${theme.slug.replace(/-/g, '_')}_responsible_gambling');
`;
}

export function generateHeaderPHP(theme: ThemeSpec): string {
  return `<?php
/**
 * Header template — ${theme.name}
 */
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<header class="site-header" role="banner">
  <div class="container">
    <a href="<?php echo esc_url(home_url('/')); ?>" class="site-logo" aria-label="<?php bloginfo('name'); ?>">
      <?php if (has_custom_logo()): the_custom_logo(); else: bloginfo('name'); endif; ?>
    </a>
    <nav class="site-nav" role="navigation" aria-label="Primary Navigation">
      <?php wp_nav_menu(['theme_location' => 'primary', 'container' => false, 'items_wrap' => '%3$s']); ?>
    </nav>
    <button class="mobile-menu-toggle" aria-label="Toggle Menu" aria-expanded="false">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
    </button>
  </div>
</header>

<!-- Breadcrumbs (SEO 2026) -->
<?php if (!is_front_page()): ?>
<nav class="breadcrumbs" aria-label="Breadcrumb">
  <div class="container">
    <a href="<?php echo esc_url(home_url('/')); ?>">Home</a>
    <span>›</span>
    <?php if (is_single()): ?>
      <a href="<?php echo esc_url(get_post_type_archive_link(get_post_type())); ?>"><?php echo esc_html(get_post_type_object(get_post_type())->labels->name); ?></a>
      <span>›</span>
    <?php endif; ?>
    <span aria-current="page"><?php the_title(); ?></span>
  </div>
</nav>
<?php endif; ?>
`;
}

export function generateFooterPHP(theme: ThemeSpec): string {
  return `<?php
/**
 * Footer template — ${theme.name}
 */
?>

<footer class="site-footer" role="contentinfo">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-col">
        <h4><?php bloginfo('name'); ?></h4>
        <p style="font-size:0.9rem;opacity:0.7;"><?php bloginfo('description'); ?></p>
      </div>
      <?php if (is_active_sidebar('footer-1')): ?>
      <div class="footer-col"><?php dynamic_sidebar('footer-1'); ?></div>
      <?php endif; ?>
      <?php if (is_active_sidebar('footer-2')): ?>
      <div class="footer-col"><?php dynamic_sidebar('footer-2'); ?></div>
      <?php endif; ?>
      <div class="footer-col">
        <h4>ติดต่อเรา</h4>
        <?php wp_nav_menu(['theme_location' => 'footer', 'container' => false, 'fallback_cb' => false]); ?>
      </div>
    </div>

    <!-- Trust Badges (E-E-A-T) -->
    <div class="trust-badges">
      <div class="trust-badge">🔒 SSL Secured</div>
      <div class="trust-badge">🔞 18+ Only</div>
      <div class="trust-badge">🎮 Fair Play Certified</div>
      <div class="trust-badge">💬 24/7 Support</div>
    </div>

    <div class="footer-bottom">
      <p>&copy; <?php echo date('Y'); ?> <?php bloginfo('name'); ?>. All rights reserved.</p>
    </div>
  </div>
</footer>

<!-- Mobile Bottom Navigation -->
<nav class="mobile-nav" role="navigation" aria-label="Mobile Navigation">
  <div class="mobile-nav-items">
    <a href="<?php echo esc_url(home_url('/')); ?>" class="mobile-nav-item active">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
      <span>Home</span>
    </a>
    <a href="<?php echo esc_url(get_post_type_archive_link('game')); ?>" class="mobile-nav-item">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>
      <span>Games</span>
    </a>
    <a href="<?php echo esc_url(get_post_type_archive_link('promotion')); ?>" class="mobile-nav-item">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      <span>Promos</span>
    </a>
    <a href="#" class="mobile-nav-item" onclick="document.getElementById('live-chat-widget')?.click()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      <span>Chat</span>
    </a>
  </div>
</nav>

<?php wp_footer(); ?>
</body>
</html>
`;
}

export function generateIndexPHP(theme: ThemeSpec): string {
  const categoryContent = theme.category === "slots" ? `
    <!-- Game Grid -->
    <section class="section">
      <div class="container">
        <h2 class="section-title">เกมสล็อตยอดนิยม</h2>
        <p class="section-subtitle">รวมสล็อตออนไลน์จากค่ายชั้นนำ เล่นง่าย จ่ายจริง</p>
        <div class="game-grid">
          <?php
          $games = new WP_Query(['post_type' => 'game', 'posts_per_page' => 12, 'orderby' => 'date', 'order' => 'DESC']);
          if ($games->have_posts()): while ($games->have_posts()): $games->the_post(); ?>
          <article class="game-card">
            <?php if (has_post_thumbnail()): the_post_thumbnail('game-thumb'); endif; ?>
            <div class="overlay">
              <span class="game-name"><?php the_title(); ?></span>
              <span class="game-provider"><?php echo get_post_meta(get_the_ID(), 'provider', true); ?></span>
            </div>
            <a href="<?php the_permalink(); ?>" class="stretched-link" aria-label="<?php the_title(); ?>"></a>
          </article>
          <?php endwhile; wp_reset_postdata(); endif; ?>
        </div>
      </div>
    </section>` : theme.category === "lottery" ? `
    <!-- Live Results -->
    <section class="section">
      <div class="container">
        <h2 class="section-title">ผลหวยล่าสุด</h2>
        <p class="section-subtitle">อัพเดทผลรางวัลแบบเรียลไทม์</p>
        <div class="live-results">
          <h3>งวดล่าสุด</h3>
          <div style="margin: 1.5rem 0;">
            <span class="result-number">--</span>
            <span class="result-number">--</span>
            <span class="result-number">--</span>
            <span class="result-number">--</span>
            <span class="result-number">--</span>
            <span class="result-number">--</span>
          </div>
          <p style="opacity:0.7;font-size:0.9rem;">อัพเดทอัตโนมัติเมื่อมีผลรางวัลใหม่</p>
        </div>
      </div>
    </section>` : `
    <!-- Baccarat Tables -->
    <section class="section">
      <div class="container">
        <h2 class="section-title">โต๊ะบาคาร่าสด</h2>
        <p class="section-subtitle">เลือกโต๊ะที่ใช่ เล่นกับดีลเลอร์สดจากสตูดิโอระดับโลก</p>
        <div class="card-grid">
          <?php
          $games = new WP_Query(['post_type' => 'game', 'posts_per_page' => 6, 'orderby' => 'date', 'order' => 'DESC']);
          if ($games->have_posts()): while ($games->have_posts()): $games->the_post(); ?>
          <article class="card">
            <?php if (has_post_thumbnail()): the_post_thumbnail('game-thumb'); endif; ?>
            <h3 style="margin-top:1rem;"><?php the_title(); ?></h3>
            <p style="opacity:0.7;font-size:0.9rem;"><?php the_excerpt(); ?></p>
            <a href="<?php the_permalink(); ?>" class="btn btn-primary" style="margin-top:1rem;">เข้าเล่น</a>
          </article>
          <?php endwhile; wp_reset_postdata(); endif; ?>
        </div>
      </div>
    </section>`;

  return `<?php
/**
 * Main template — ${theme.name}
 */
get_header(); ?>

<!-- Hero Section -->
<section class="hero" role="banner">
  <div class="hero-content animate-fadeInUp">
    <h1><?php bloginfo('name'); ?></h1>
    <p><?php bloginfo('description'); ?></p>
    <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
      <a href="<?php echo esc_url(get_post_type_archive_link('game')); ?>" class="btn btn-primary">เริ่มเล่นเลย</a>
      <a href="<?php echo esc_url(get_post_type_archive_link('promotion')); ?>" class="btn btn-outline">โปรโมชั่น</a>
    </div>
  </div>
</section>

<!-- AEO Block: Quick Answer (SEO 2026) -->
<section class="section">
  <div class="container">
    <div class="aeo-block">
      <div class="aeo-label">Quick Answer</div>
      <p><?php bloginfo('name'); ?> คือเว็บ${theme.category === "slots" ? "สล็อตออนไลน์" : theme.category === "lottery" ? "หวยออนไลน์" : "บาคาร่าออนไลน์"}ชั้นนำ ให้บริการ${theme.category === "slots" ? "เกมสล็อตจากค่ายดังกว่า 1,000 เกม" : theme.category === "lottery" ? "หวยไทย หวยลาว หวยฮานอย และหวยต่างประเทศ" : "บาคาร่าสดจากสตูดิโอระดับโลก"} พร้อมระบบฝาก-ถอนอัตโนมัติ รองรับทุกอุปกรณ์</p>
    </div>
  </div>
</section>

${categoryContent}

<!-- Promotions Section -->
<section class="section" style="background:${theme.primaryColor}08;">
  <div class="container">
    <h2 class="section-title">โปรโมชั่นพิเศษ</h2>
    <p class="section-subtitle">รับโบนัสและสิทธิพิเศษมากมาย</p>
    <div class="card-grid">
      <?php
      $promos = new WP_Query(['post_type' => 'promotion', 'posts_per_page' => 3]);
      if ($promos->have_posts()): while ($promos->have_posts()): $promos->the_post(); ?>
      <article class="card promo-banner">
        <span class="promo-badge">โปรโมชั่น</span>
        <h3 style="margin-top:1rem;"><?php the_title(); ?></h3>
        <p style="opacity:0.7;"><?php the_excerpt(); ?></p>
        <a href="<?php the_permalink(); ?>" class="btn btn-outline" style="margin-top:1rem;">ดูรายละเอียด</a>
      </article>
      <?php endwhile; wp_reset_postdata(); endif; ?>
    </div>
  </div>
</section>

<!-- FAQ Section (SEO 2026: FAQ Schema) -->
<section class="section">
  <div class="container">
    <h2 class="section-title">คำถามที่พบบ่อย</h2>
    <div class="faq-section" itemscope itemtype="https://schema.org/FAQPage">
      <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
        <button class="faq-question" itemprop="name">สมัครสมาชิกอย่างไร?</button>
        <div class="faq-answer" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
          <div itemprop="text">คลิกปุ่มสมัครสมาชิก กรอกข้อมูลเพียงไม่กี่ขั้นตอน ใช้เวลาไม่ถึง 1 นาที พร้อมรับโบนัสต้อนรับทันที</div>
        </div>
      </div>
      <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
        <button class="faq-question" itemprop="name">ฝาก-ถอนขั้นต่ำเท่าไหร่?</button>
        <div class="faq-answer" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
          <div itemprop="text">ฝากขั้นต่ำเพียง 1 บาท ถอนขั้นต่ำ 100 บาท ระบบอัตโนมัติ ดำเนินการภายใน 30 วินาที</div>
        </div>
      </div>
      <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
        <button class="faq-question" itemprop="name">รองรับมือถือไหม?</button>
        <div class="faq-answer" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
          <div itemprop="text">รองรับทุกอุปกรณ์ ทั้ง iOS, Android, PC และ Tablet ไม่ต้องดาวน์โหลดแอป เล่นผ่านเว็บเบราว์เซอร์ได้เลย</div>
        </div>
      </div>
    </div>
  </div>
</section>

<?php get_footer(); ?>
`;
}

export function generateManifestJSON(theme: ThemeSpec): string {
  return JSON.stringify({
    name: theme.name,
    short_name: theme.slug,
    description: theme.description,
    start_url: "/",
    display: "standalone",
    background_color: theme.bgColor,
    theme_color: theme.primaryColor,
    icons: [
      { src: "/wp-content/themes/" + theme.slug + "/assets/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/wp-content/themes/" + theme.slug + "/assets/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }, null, 2);
}

export function generateMainJS(theme: ThemeSpec): string {
  return `/**
 * ${theme.name} — Main JavaScript
 * Mobile-first, SEO 2026 optimized
 */
(function() {
  'use strict';

  // ═══ Mobile Menu Toggle ═══
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  const siteNav = document.querySelector('.site-nav');
  if (menuToggle && siteNav) {
    menuToggle.addEventListener('click', function() {
      const expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', !expanded);
      siteNav.classList.toggle('is-open');
    });
  }

  // ═══ FAQ Accordion ═══
  document.querySelectorAll('.faq-question').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const answer = this.nextElementSibling;
      const isOpen = answer.style.display === 'block';
      // Close all
      document.querySelectorAll('.faq-answer').forEach(function(a) { a.style.display = 'none'; });
      // Toggle current
      answer.style.display = isOpen ? 'none' : 'block';
    });
  });

  // ═══ Intersection Observer: Animate on Scroll ═══
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-fadeInUp');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.card, .section-title, .game-card').forEach(function(el) {
      observer.observe(el);
    });
  }

  // ═══ Smooth Scroll for Anchor Links ═══
  document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
    anchor.addEventListener('click', function(e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ═══ Mobile Bottom Nav: Active State ═══
  var currentPath = window.location.pathname;
  document.querySelectorAll('.mobile-nav-item').forEach(function(item) {
    item.classList.remove('active');
    if (item.getAttribute('href') === currentPath || (currentPath === '/' && item.getAttribute('href') === '/')) {
      item.classList.add('active');
    }
  });

  // ═══ Lazy Load Images (fallback for older browsers) ═══
  if (!('loading' in HTMLImageElement.prototype)) {
    var lazyImages = document.querySelectorAll('img[loading="lazy"]');
    var lazyObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          img.src = img.dataset.src || img.src;
          lazyObserver.unobserve(img);
        }
      });
    });
    lazyImages.forEach(function(img) { lazyObserver.observe(img); });
  }
})();
`;
}

// ═══════════════════════════════════════════════
// Generate Complete Theme Package
// ═══════════════════════════════════════════════

export interface ThemePackage {
  slug: string;
  name: string;
  category: string;
  files: Record<string, string>;
}

export function generateThemePackage(theme: ThemeSpec): ThemePackage {
  return {
    slug: theme.slug,
    name: theme.name,
    category: theme.category,
    files: {
      "style.css": generateStyleCSS(theme),
      "functions.php": generateFunctionsPHP(theme),
      "header.php": generateHeaderPHP(theme),
      "footer.php": generateFooterPHP(theme),
      "index.php": generateIndexPHP(theme),
      "manifest.json": generateManifestJSON(theme),
      "assets/js/main.js": generateMainJS(theme),
      "screenshot.png": "", // placeholder — will be generated
    },
  };
}

// ═══════════════════════════════════════════════
// Generate Preview HTML (for in-app preview)
// ═══════════════════════════════════════════════

export function generatePreviewHTML(theme: ThemeSpec): string {
  const css = generateStyleCSS(theme);
  const categorySection = theme.category === "slots"
    ? `<section class="section"><div class="container">
        <h2 class="section-title">เกมสล็อตยอดนิยม</h2>
        <p class="section-subtitle">รวมสล็อตออนไลน์จากค่ายชั้นนำ เล่นง่าย จ่ายจริง</p>
        <div class="game-grid">
          ${Array.from({length: 8}, (_, i) => `<div class="game-card" style="background:linear-gradient(135deg, ${theme.primaryColor}30, ${theme.secondaryColor}30);"><div class="overlay"><span class="game-name">Slot Game ${i+1}</span><span class="game-provider">Provider ${i+1}</span></div></div>`).join('')}
        </div></div></section>`
    : theme.category === "lottery"
    ? `<section class="section"><div class="container">
        <h2 class="section-title">ผลหวยล่าสุด</h2>
        <p class="section-subtitle">อัพเดทผลรางวัลแบบเรียลไทม์</p>
        <div class="live-results">
          <h3>งวดล่าสุด</h3>
          <div style="margin:1.5rem 0;">
            ${Array.from({length: 6}, (_, i) => `<span class="result-number">${Math.floor(Math.random()*10)}</span>`).join('')}
          </div>
        </div></div></section>`
    : `<section class="section"><div class="container">
        <h2 class="section-title">โต๊ะบาคาร่าสด</h2>
        <p class="section-subtitle">เลือกโต๊ะที่ใช่ เล่นกับดีลเลอร์สดจากสตูดิโอระดับโลก</p>
        <div class="card-grid">
          ${Array.from({length: 6}, (_, i) => `<div class="card"><h3>Table ${i+1}</h3><p style="opacity:0.7;">Live Dealer • Min ฿100</p><a href="#" class="btn btn-primary" style="margin-top:1rem;">เข้าเล่น</a></div>`).join('')}
        </div></div></section>`;

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${theme.name} — Preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.fontHeading)}:wght@400;600;700;800&family=${encodeURIComponent(theme.fontBody)}:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<header class="site-header">
  <div class="container">
    <a href="#" class="site-logo">${theme.name}</a>
    <nav class="site-nav">
      <a href="#">หน้าแรก</a>
      <a href="#">เกม</a>
      <a href="#">โปรโมชั่น</a>
      <a href="#">ติดต่อ</a>
      <a href="#" class="btn btn-primary" style="padding:0.5rem 1.5rem;">สมัครสมาชิก</a>
    </nav>
  </div>
</header>

<section class="hero">
  <div class="hero-content animate-fadeInUp">
    <h1><span>${theme.name}</span></h1>
    <p>${theme.description}</p>
    <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
      <a href="#" class="btn btn-primary">เริ่มเล่นเลย</a>
      <a href="#" class="btn btn-outline">โปรโมชั่น</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="aeo-block">
      <div class="aeo-label">Quick Answer</div>
      <p>${theme.name} คือเว็บ${theme.category === "slots" ? "สล็อตออนไลน์" : theme.category === "lottery" ? "หวยออนไลน์" : "บาคาร่าออนไลน์"}ชั้นนำ ให้บริการครบวงจร พร้อมระบบฝาก-ถอนอัตโนมัติ รองรับทุกอุปกรณ์</p>
    </div>
  </div>
</section>

${categorySection}

<section class="section" style="background:${theme.primaryColor}08;">
  <div class="container">
    <h2 class="section-title">โปรโมชั่นพิเศษ</h2>
    <div class="card-grid">
      <div class="card promo-banner"><span class="promo-badge">โปรโมชั่น</span><h3 style="margin-top:1rem;">โบนัสต้อนรับ 100%</h3><p style="opacity:0.7;">สมัครวันนี้ รับโบนัส 100% สูงสุด 10,000 บาท</p></div>
      <div class="card promo-banner"><span class="promo-badge">โปรโมชั่น</span><h3 style="margin-top:1rem;">คืนยอดเสีย 10%</h3><p style="opacity:0.7;">รับเงินคืนทุกสัปดาห์ ไม่มีเงื่อนไข</p></div>
      <div class="card promo-banner"><span class="promo-badge">โปรโมชั่น</span><h3 style="margin-top:1rem;">แนะนำเพื่อน รับ 500</h3><p style="opacity:0.7;">ชวนเพื่อนสมัคร รับค่าแนะนำทันที</p></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <h2 class="section-title">คำถามที่พบบ่อย</h2>
    <div class="faq-section">
      <div class="faq-item"><button class="faq-question">สมัครสมาชิกอย่างไร?</button><div class="faq-answer" style="display:none;"><p>คลิกปุ่มสมัครสมาชิก กรอกข้อมูลเพียงไม่กี่ขั้นตอน ใช้เวลาไม่ถึง 1 นาที</p></div></div>
      <div class="faq-item"><button class="faq-question">ฝาก-ถอนขั้นต่ำเท่าไหร่?</button><div class="faq-answer" style="display:none;"><p>ฝากขั้นต่ำเพียง 1 บาท ถอนขั้นต่ำ 100 บาท ระบบอัตโนมัติ</p></div></div>
      <div class="faq-item"><button class="faq-question">รองรับมือถือไหม?</button><div class="faq-answer" style="display:none;"><p>รองรับทุกอุปกรณ์ ทั้ง iOS, Android, PC และ Tablet</p></div></div>
    </div>
  </div>
</section>

<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-col"><h4>${theme.name}</h4><p style="font-size:0.9rem;opacity:0.7;">${theme.description.substring(0, 100)}...</p></div>
      <div class="footer-col"><h4>เกม</h4><a href="#">สล็อต</a><a href="#">บาคาร่า</a><a href="#">หวย</a><a href="#">กีฬา</a></div>
      <div class="footer-col"><h4>ข้อมูล</h4><a href="#">เกี่ยวกับเรา</a><a href="#">นโยบายความเป็นส่วนตัว</a><a href="#">เงื่อนไขการใช้งาน</a></div>
      <div class="footer-col"><h4>ติดต่อ</h4><a href="#">LINE: @${theme.slug}</a><a href="#">support@${theme.slug}.com</a></div>
    </div>
    <div class="trust-badges">
      <div class="trust-badge">🔒 SSL Secured</div>
      <div class="trust-badge">🔞 18+ Only</div>
      <div class="trust-badge">🎮 Fair Play</div>
      <div class="trust-badge">💬 24/7 Support</div>
    </div>
    <div class="footer-bottom"><p>&copy; 2026 ${theme.name}. All rights reserved.</p></div>
  </div>
</footer>

<nav class="mobile-nav">
  <div class="mobile-nav-items">
    <a href="#" class="mobile-nav-item active"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg><span>Home</span></a>
    <a href="#" class="mobile-nav-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg><span>Games</span></a>
    <a href="#" class="mobile-nav-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg><span>Promos</span></a>
    <a href="#" class="mobile-nav-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><span>Chat</span></a>
  </div>
</nav>

<script>
document.querySelectorAll('.faq-question').forEach(function(btn){btn.addEventListener('click',function(){var a=this.nextElementSibling;var o=a.style.display==='block';document.querySelectorAll('.faq-answer').forEach(function(x){x.style.display='none';});a.style.display=o?'none':'block';});});
</script>
</body>
</html>`;
}
