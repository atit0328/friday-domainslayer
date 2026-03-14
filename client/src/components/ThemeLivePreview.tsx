import { useState, useMemo } from "react";
import { X, Monitor, Tablet, Smartphone, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  fontHeading: string;
  fontBody: string;
}

interface ThemePreviewProps {
  open: boolean;
  onClose: () => void;
  themeName: string;
  themeSlug: string;
  designStyle?: string;
  category?: string;
  defaultColors?: ThemeColors;
  customColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    font?: string;
    headingFont?: string;
    radius?: string;
  };
}

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_SIZES: Record<Viewport, { width: string; label: string }> = {
  desktop: { width: "100%", label: "Desktop" },
  tablet: { width: "768px", label: "Tablet" },
  mobile: { width: "375px", label: "Mobile" },
};

// Generate realistic casino page HTML based on theme
function generatePreviewHTML(
  themeName: string,
  themeSlug: string,
  category: string,
  designStyle: string,
  colors: ThemeColors,
  customColors?: ThemePreviewProps["customColors"]
): string {
  const primary = customColors?.primary || colors.primary;
  const secondary = customColors?.secondary || colors.secondary;
  const accent = customColors?.accent || colors.accent;
  const headingFont = customColors?.headingFont || colors.fontHeading;
  const bodyFont = customColors?.font || colors.fontBody;
  const radius = customColors?.radius || "8px";

  // Theme-specific content
  const themeContent = getThemeContent(themeSlug, category);

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${themeName} — Live Preview</title>
  <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(headingFont)}:wght@400;600;700;800;900&family=${encodeURIComponent(bodyFont)}:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: ${primary};
      --secondary: ${secondary};
      --accent: ${accent};
      --radius: ${radius};
      --font-heading: '${headingFont}', sans-serif;
      --font-body: '${bodyFont}', sans-serif;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: var(--font-body);
      background: ${themeContent.bgColor};
      color: ${themeContent.textColor};
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }

    /* ===== HEADER ===== */
    .header {
      background: ${themeContent.headerBg};
      border-bottom: 1px solid ${themeContent.borderColor};
      padding: 0 24px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(20px);
    }
    .header .logo {
      font-family: var(--font-heading);
      font-size: 22px;
      font-weight: 800;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -0.5px;
    }
    .header nav {
      display: flex;
      gap: 24px;
      align-items: center;
    }
    .header nav a {
      color: ${themeContent.navColor};
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: color 0.2s;
      position: relative;
    }
    .header nav a:hover {
      color: var(--primary);
    }
    .header .cta-btn {
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      color: #fff;
      border: none;
      padding: 8px 20px;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .header .cta-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 20px ${primary}40;
    }

    /* ===== HERO ===== */
    .hero {
      position: relative;
      padding: 80px 24px;
      text-align: center;
      overflow: hidden;
      background: ${themeContent.heroBg};
      min-height: 480px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .hero::before {
      content: '';
      position: absolute;
      inset: 0;
      background: ${themeContent.heroOverlay};
      pointer-events: none;
    }
    .hero-content {
      position: relative;
      z-index: 2;
      max-width: 720px;
    }
    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: ${primary}20;
      border: 1px solid ${primary}40;
      color: var(--primary);
      padding: 6px 16px;
      border-radius: 100px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 24px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .hero h1 {
      font-family: var(--font-heading);
      font-size: clamp(32px, 5vw, 56px);
      font-weight: 900;
      line-height: 1.1;
      margin-bottom: 20px;
      background: ${themeContent.h1Gradient};
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero p {
      font-size: 17px;
      line-height: 1.7;
      color: ${themeContent.heroSubtext};
      max-width: 560px;
      margin: 0 auto 32px;
    }
    .hero-buttons {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      color: #fff;
      border: none;
      padding: 14px 32px;
      border-radius: var(--radius);
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.3s;
      box-shadow: 0 4px 24px ${primary}30;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 32px ${primary}50;
    }
    .btn-outline {
      background: transparent;
      color: var(--primary);
      border: 2px solid ${primary}60;
      padding: 12px 28px;
      border-radius: var(--radius);
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn-outline:hover {
      background: ${primary}15;
      border-color: var(--primary);
    }

    /* ===== FEATURES GRID ===== */
    .features {
      padding: 80px 24px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .features .section-title {
      text-align: center;
      margin-bottom: 48px;
    }
    .features .section-title h2 {
      font-family: var(--font-heading);
      font-size: 32px;
      font-weight: 800;
      margin-bottom: 12px;
      color: ${themeContent.headingColor};
    }
    .features .section-title p {
      color: ${themeContent.mutedColor};
      font-size: 15px;
    }
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }
    .feature-card {
      background: ${themeContent.cardBg};
      border: 1px solid ${themeContent.borderColor};
      border-radius: calc(var(--radius) * 1.5);
      padding: 28px;
      transition: all 0.3s;
      position: relative;
      overflow: hidden;
    }
    .feature-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--primary), var(--accent));
      opacity: 0;
      transition: opacity 0.3s;
    }
    .feature-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 40px ${primary}15;
      border-color: ${primary}40;
    }
    .feature-card:hover::before {
      opacity: 1;
    }
    .feature-icon {
      width: 48px;
      height: 48px;
      border-radius: var(--radius);
      background: ${primary}15;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      margin-bottom: 16px;
    }
    .feature-card h3 {
      font-family: var(--font-heading);
      font-size: 17px;
      font-weight: 700;
      margin-bottom: 8px;
      color: ${themeContent.headingColor};
    }
    .feature-card p {
      font-size: 13px;
      line-height: 1.6;
      color: ${themeContent.mutedColor};
    }

    /* ===== GAMES SHOWCASE ===== */
    .games {
      padding: 80px 24px;
      background: ${themeContent.altBg};
    }
    .games-inner {
      max-width: 1200px;
      margin: 0 auto;
    }
    .games .section-title {
      text-align: center;
      margin-bottom: 48px;
    }
    .games .section-title h2 {
      font-family: var(--font-heading);
      font-size: 32px;
      font-weight: 800;
      margin-bottom: 12px;
      color: ${themeContent.headingColor};
    }
    .games-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }
    .game-card {
      background: ${themeContent.cardBg};
      border: 1px solid ${themeContent.borderColor};
      border-radius: var(--radius);
      overflow: hidden;
      transition: all 0.3s;
      cursor: pointer;
    }
    .game-card:hover {
      transform: translateY(-4px) scale(1.02);
      box-shadow: 0 12px 32px ${primary}20;
    }
    .game-thumb {
      width: 100%;
      aspect-ratio: 4/3;
      background: linear-gradient(135deg, ${primary}30, ${secondary}30);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
      position: relative;
    }
    .game-thumb .play-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .game-card:hover .play-overlay {
      opacity: 1;
    }
    .play-overlay span {
      background: var(--primary);
      color: #fff;
      padding: 8px 20px;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 600;
    }
    .game-info {
      padding: 12px;
    }
    .game-info h4 {
      font-size: 14px;
      font-weight: 600;
      color: ${themeContent.headingColor};
      margin-bottom: 4px;
    }
    .game-info .provider {
      font-size: 11px;
      color: ${themeContent.mutedColor};
    }
    .game-info .rtp {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--accent);
      font-weight: 600;
      margin-top: 4px;
    }

    /* ===== PROMO BANNER ===== */
    .promo {
      padding: 80px 24px;
      text-align: center;
    }
    .promo-inner {
      max-width: 800px;
      margin: 0 auto;
      background: ${themeContent.promoBg};
      border: 1px solid ${primary}30;
      border-radius: calc(var(--radius) * 2);
      padding: 60px 40px;
      position: relative;
      overflow: hidden;
    }
    .promo-inner::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, ${primary}08 0%, transparent 70%);
      animation: pulse-glow 4s ease-in-out infinite;
    }
    @keyframes pulse-glow {
      0%, 100% { opacity: 0.5; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.1); }
    }
    .promo h2 {
      font-family: var(--font-heading);
      font-size: 36px;
      font-weight: 900;
      margin-bottom: 16px;
      position: relative;
      color: ${themeContent.headingColor};
    }
    .promo .bonus-amount {
      font-size: 64px;
      font-weight: 900;
      background: linear-gradient(135deg, var(--accent), var(--primary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: block;
      margin: 16px 0;
      font-family: var(--font-heading);
    }
    .promo p {
      color: ${themeContent.mutedColor};
      font-size: 15px;
      margin-bottom: 28px;
      position: relative;
    }

    /* ===== FOOTER ===== */
    .footer {
      background: ${themeContent.footerBg};
      border-top: 1px solid ${themeContent.borderColor};
      padding: 48px 24px 24px;
    }
    .footer-inner {
      max-width: 1200px;
      margin: 0 auto;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 32px;
      margin-bottom: 32px;
    }
    .footer-col h4 {
      font-family: var(--font-heading);
      font-size: 14px;
      font-weight: 700;
      color: ${themeContent.headingColor};
      margin-bottom: 16px;
    }
    .footer-col a {
      display: block;
      color: ${themeContent.mutedColor};
      text-decoration: none;
      font-size: 13px;
      padding: 4px 0;
      transition: color 0.2s;
    }
    .footer-col a:hover {
      color: var(--primary);
    }
    .footer-bottom {
      border-top: 1px solid ${themeContent.borderColor};
      padding-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .footer-bottom span {
      font-size: 12px;
      color: ${themeContent.mutedColor};
    }
    .footer-badges {
      display: flex;
      gap: 8px;
    }
    .footer-badges span {
      background: ${primary}15;
      border: 1px solid ${primary}30;
      color: var(--primary);
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
    }

    /* ===== MOBILE ===== */
    @media (max-width: 768px) {
      .header nav { display: none; }
      .hero { padding: 60px 20px; min-height: 400px; }
      .hero h1 { font-size: 28px; }
      .features, .games, .promo { padding: 48px 16px; }
      .promo-inner { padding: 40px 24px; }
      .promo .bonus-amount { font-size: 40px; }
      .footer-grid { grid-template-columns: repeat(2, 1fr); }
    }

    /* ===== THEME-SPECIFIC EFFECTS ===== */
    ${themeContent.extraCSS}
  </style>
</head>
<body>
  <!-- HEADER -->
  <header class="header">
    <div class="logo">${themeContent.siteName}</div>
    <nav>
      <a href="#">หน้าแรก</a>
      <a href="#">เกมส์</a>
      <a href="#">โปรโมชั่น</a>
      <a href="#">บทความ</a>
      <a href="#">ติดต่อ</a>
    </nav>
    <button class="cta-btn">สมัครสมาชิก</button>
  </header>

  <!-- HERO -->
  <section class="hero">
    ${themeContent.heroParticles}
    <div class="hero-content">
      <div class="hero-badge">${themeContent.heroBadge}</div>
      <h1>${themeContent.heroTitle}</h1>
      <p>${themeContent.heroDesc}</p>
      <div class="hero-buttons">
        <button class="btn-primary">${themeContent.heroCTA}</button>
        <button class="btn-outline">ดูเกมทั้งหมด</button>
      </div>
    </div>
  </section>

  <!-- FEATURES -->
  <section class="features">
    <div class="section-title">
      <h2>${themeContent.featuresTitle}</h2>
      <p>${themeContent.featuresDesc}</p>
    </div>
    <div class="features-grid">
      ${themeContent.featureCards}
    </div>
  </section>

  <!-- GAMES -->
  <section class="games">
    <div class="games-inner">
      <div class="section-title">
        <h2>${themeContent.gamesTitle}</h2>
      </div>
      <div class="games-grid">
        ${themeContent.gameCards}
      </div>
    </div>
  </section>

  <!-- PROMO -->
  <section class="promo">
    <div class="promo-inner">
      <h2>${themeContent.promoTitle}</h2>
      <span class="bonus-amount">${themeContent.promoAmount}</span>
      <p>${themeContent.promoDesc}</p>
      <button class="btn-primary">${themeContent.promoCTA}</button>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-grid">
        <div class="footer-col">
          <h4>${themeContent.siteName}</h4>
          <a href="#">เกี่ยวกับเรา</a>
          <a href="#">นโยบายความเป็นส่วนตัว</a>
          <a href="#">ข้อกำหนดการใช้งาน</a>
          <a href="#">เล่นอย่างรับผิดชอบ</a>
        </div>
        <div class="footer-col">
          <h4>เกมยอดนิยม</h4>
          ${themeContent.footerGames}
        </div>
        <div class="footer-col">
          <h4>โปรโมชั่น</h4>
          <a href="#">โบนัสสมาชิกใหม่</a>
          <a href="#">คืนยอดเสีย</a>
          <a href="#">แนะนำเพื่อน</a>
          <a href="#">VIP Club</a>
        </div>
        <div class="footer-col">
          <h4>ช่วยเหลือ</h4>
          <a href="#">วิธีสมัคร</a>
          <a href="#">วิธีฝาก-ถอน</a>
          <a href="#">คำถามที่พบบ่อย</a>
          <a href="#">ติดต่อเรา</a>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© 2026 ${themeContent.siteName}. All rights reserved.</span>
        <div class="footer-badges">
          <span>🔒 SSL</span>
          <span>18+</span>
          <span>🎮 Fair Play</span>
        </div>
      </div>
    </div>
  </footer>
</body>
</html>`;
}

interface ThemeContentData {
  bgColor: string;
  textColor: string;
  headerBg: string;
  heroBg: string;
  heroOverlay: string;
  cardBg: string;
  altBg: string;
  footerBg: string;
  promoBg: string;
  borderColor: string;
  navColor: string;
  headingColor: string;
  mutedColor: string;
  heroSubtext: string;
  h1Gradient: string;
  siteName: string;
  heroBadge: string;
  heroTitle: string;
  heroDesc: string;
  heroCTA: string;
  heroParticles: string;
  featuresTitle: string;
  featuresDesc: string;
  featureCards: string;
  gamesTitle: string;
  gameCards: string;
  promoTitle: string;
  promoAmount: string;
  promoDesc: string;
  promoCTA: string;
  footerGames: string;
  extraCSS: string;
}

function getThemeContent(slug: string, category: string): ThemeContentData {
  const base: ThemeContentData = {
    bgColor: "#0a0a0f",
    textColor: "#e0e0e0",
    headerBg: "rgba(10,10,15,0.9)",
    heroBg: "linear-gradient(180deg, #0a0a1a 0%, #0f0f2a 100%)",
    heroOverlay: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)",
    cardBg: "rgba(255,255,255,0.04)",
    altBg: "rgba(0,0,0,0.3)",
    footerBg: "rgba(5,5,10,0.95)",
    promoBg: "linear-gradient(135deg, rgba(var(--primary),0.1), rgba(0,0,0,0.3))",
    borderColor: "rgba(255,255,255,0.08)",
    navColor: "rgba(255,255,255,0.7)",
    headingColor: "#ffffff",
    mutedColor: "rgba(255,255,255,0.5)",
    heroSubtext: "rgba(255,255,255,0.6)",
    h1Gradient: "linear-gradient(135deg, #fff, rgba(255,255,255,0.8))",
    siteName: "Casino",
    heroBadge: "🎰 เว็บตรง ลิขสิทธิ์แท้",
    heroTitle: "เล่นสล็อตออนไลน์",
    heroDesc: "รวมเกมสล็อตชั้นนำกว่า 1,000 เกม จากค่ายดังทั่วโลก",
    heroCTA: "เริ่มเล่นเลย",
    heroParticles: "",
    featuresTitle: "ทำไมต้องเลือกเรา",
    featuresDesc: "ระบบที่ดีที่สุดสำหรับผู้เล่นมืออาชีพ",
    featureCards: "",
    gamesTitle: "เกมยอดนิยม",
    gameCards: "",
    promoTitle: "โบนัสต้อนรับ",
    promoAmount: "100%",
    promoDesc: "รับโบนัสสูงสุด 100% สำหรับสมาชิกใหม่",
    promoCTA: "รับโบนัสเลย",
    footerGames: "",
    extraCSS: "",
  };

  // Feature cards common
  const featureIcons = ["⚡", "🔒", "💰", "🎁", "📱", "🏆"];
  const featureTitles = ["ฝาก-ถอนออโต้", "ปลอดภัย 100%", "จ่ายจริง ไม่มีโกง", "โบนัสทุกวัน", "รองรับมือถือ", "VIP สุดพิเศษ"];
  const featureDescs = [
    "ระบบฝาก-ถอนอัตโนมัติ ภายใน 30 วินาที ไม่มีขั้นต่ำ",
    "ระบบรักษาความปลอดภัยระดับธนาคาร SSL 256-bit",
    "การันตีจ่ายจริงทุกยอด ไม่มีเงื่อนไขซ่อน",
    "โปรโมชั่นพิเศษทุกวัน คืนยอดเสีย รับเครดิตฟรี",
    "เล่นได้ทุกที่ทุกเวลา รองรับ iOS และ Android",
    "สิทธิพิเศษสำหรับสมาชิก VIP ดูแลโดยทีมงานมืออาชีพ",
  ];
  base.featureCards = featureIcons.map((icon, i) => `
    <div class="feature-card">
      <div class="feature-icon">${icon}</div>
      <h3>${featureTitles[i]}</h3>
      <p>${featureDescs[i]}</p>
    </div>
  `).join("");

  // Game cards
  const slotGames = [
    { name: "Sweet Bonanza", provider: "Pragmatic Play", rtp: "96.48%", emoji: "🍬" },
    { name: "Gates of Olympus", provider: "Pragmatic Play", rtp: "96.50%", emoji: "⚡" },
    { name: "Starlight Princess", provider: "Pragmatic Play", rtp: "96.50%", emoji: "✨" },
    { name: "Wild West Gold", provider: "Pragmatic Play", rtp: "96.51%", emoji: "🤠" },
    { name: "Mahjong Ways 2", provider: "PG Soft", rtp: "96.95%", emoji: "🀄" },
    { name: "Fortune Tiger", provider: "PG Soft", rtp: "96.81%", emoji: "🐯" },
    { name: "Lucky Neko", provider: "PG Soft", rtp: "96.73%", emoji: "🐱" },
    { name: "Dragon Hatch", provider: "PG Soft", rtp: "96.83%", emoji: "🐉" },
  ];
  const lotteryGames = [
    { name: "หวยรัฐบาล", provider: "Thai Lottery", rtp: "—", emoji: "🎱" },
    { name: "หวยลาว", provider: "Lao Lottery", rtp: "—", emoji: "🇱🇦" },
    { name: "หวยฮานอย", provider: "Hanoi Lottery", rtp: "—", emoji: "🇻🇳" },
    { name: "หวยยี่กี", provider: "Yeekee", rtp: "—", emoji: "🎯" },
    { name: "หวยมาเลย์", provider: "Malay Lottery", rtp: "—", emoji: "🇲🇾" },
    { name: "หวยหุ้น", provider: "Stock Lottery", rtp: "—", emoji: "📈" },
  ];
  const baccaratGames = [
    { name: "SA Baccarat", provider: "SA Gaming", rtp: "98.76%", emoji: "🃏" },
    { name: "Sexy Baccarat", provider: "Sexy Gaming", rtp: "98.80%", emoji: "💃" },
    { name: "WM Baccarat", provider: "WM Casino", rtp: "98.90%", emoji: "🎴" },
    { name: "Dream Gaming", provider: "DG Casino", rtp: "98.85%", emoji: "💎" },
    { name: "Evolution", provider: "Evolution", rtp: "98.94%", emoji: "🌟" },
    { name: "Allbet", provider: "Allbet Gaming", rtp: "98.70%", emoji: "🏆" },
  ];

  const games = category === "lottery" ? lotteryGames : category === "baccarat" ? baccaratGames : slotGames;
  base.gameCards = games.map(g => `
    <div class="game-card">
      <div class="game-thumb">
        ${g.emoji}
        <div class="play-overlay"><span>เล่นเลย</span></div>
      </div>
      <div class="game-info">
        <h4>${g.name}</h4>
        <span class="provider">${g.provider}</span>
        ${g.rtp !== "—" ? `<div class="rtp">RTP: ${g.rtp}</div>` : ""}
      </div>
    </div>
  `).join("");

  base.footerGames = games.slice(0, 4).map(g => `<a href="#">${g.name}</a>`).join("");

  // Theme-specific overrides
  switch (slug) {
    case "neon-jackpot":
      base.siteName = "NeonSlot";
      base.bgColor = "#050510";
      base.headerBg = "rgba(5,5,16,0.92)";
      base.heroBg = "linear-gradient(180deg, #050510 0%, #0a0a2e 50%, #050510 100%)";
      base.heroOverlay = "radial-gradient(ellipse at 50% 30%, rgba(0,240,255,0.08) 0%, transparent 60%)";
      base.cardBg = "rgba(0,240,255,0.03)";
      base.borderColor = "rgba(0,240,255,0.12)";
      base.promoBg = "linear-gradient(135deg, rgba(0,240,255,0.05), rgba(255,0,229,0.05))";
      base.h1Gradient = "linear-gradient(135deg, #00f0ff, #ff00e5, #ffea00)";
      base.heroBadge = "⚡ NEON JACKPOT — เว็บสล็อตแห่งอนาคต";
      base.heroTitle = "สล็อตนีออน<br/>แจ็คพอตระเบิด";
      base.heroDesc = "สัมผัสประสบการณ์สล็อตสุดล้ำ กราฟิกนีออนเรืองรอง แจ็คพอตแตกง่าย ถอนไม่อั้น";
      base.heroCTA = "⚡ เริ่มเล่นเลย";
      base.featuresTitle = "ระบบสุดล้ำ";
      base.featuresDesc = "เทคโนโลยีที่ดีที่สุดสำหรับผู้เล่นยุคใหม่";
      base.gamesTitle = "🎰 สล็อตยอดฮิต";
      base.promoTitle = "⚡ NEON BONUS";
      base.promoAmount = "300%";
      base.promoDesc = "สมาชิกใหม่รับโบนัส 300% + ฟรีสปิน 50 ครั้ง";
      base.promoCTA = "⚡ รับโบนัสเลย";
      base.heroParticles = `<div style="position:absolute;inset:0;overflow:hidden;pointer-events:none;">
        <div style="position:absolute;width:4px;height:4px;background:#00f0ff;border-radius:50%;top:20%;left:15%;box-shadow:0 0 20px #00f0ff;animation:float 6s ease-in-out infinite;"></div>
        <div style="position:absolute;width:3px;height:3px;background:#ff00e5;border-radius:50%;top:40%;right:20%;box-shadow:0 0 15px #ff00e5;animation:float 8s ease-in-out infinite 1s;"></div>
        <div style="position:absolute;width:5px;height:5px;background:#ffea00;border-radius:50%;bottom:30%;left:25%;box-shadow:0 0 25px #ffea00;animation:float 7s ease-in-out infinite 2s;"></div>
        <div style="position:absolute;width:2px;height:2px;background:#00f0ff;border-radius:50%;top:60%;right:35%;box-shadow:0 0 10px #00f0ff;animation:float 5s ease-in-out infinite 0.5s;"></div>
      </div>`;
      base.extraCSS = `
        @keyframes float {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.6; }
          50% { transform: translateY(-30px) scale(1.5); opacity: 1; }
        }
        .feature-card:hover { box-shadow: 0 0 30px rgba(0,240,255,0.15), 0 12px 40px rgba(0,0,0,0.3); }
        .game-card:hover { box-shadow: 0 0 20px rgba(0,240,255,0.2); }
      `;
      break;

    case "royal-spin":
      base.siteName = "RoyalSpin";
      base.bgColor = "#0a0806";
      base.headerBg = "rgba(10,8,6,0.95)";
      base.heroBg = "linear-gradient(180deg, #0a0806 0%, #1a1008 50%, #0a0806 100%)";
      base.heroOverlay = "radial-gradient(ellipse at 50% 40%, rgba(212,175,55,0.06) 0%, transparent 60%)";
      base.cardBg = "rgba(212,175,55,0.03)";
      base.borderColor = "rgba(212,175,55,0.15)";
      base.promoBg = "linear-gradient(135deg, rgba(212,175,55,0.08), rgba(139,0,0,0.08))";
      base.h1Gradient = "linear-gradient(135deg, #ffd700, #d4af37, #b8860b)";
      base.heroBadge = "👑 ROYAL SPIN — คาสิโนระดับพรีเมียม";
      base.heroTitle = "สล็อตหรูหรา<br/>สไตล์ Royal";
      base.heroDesc = "สัมผัสความหรูหราระดับ VIP สล็อตพรีเมียมจากค่ายชั้นนำ บริการระดับ 5 ดาว";
      base.heroCTA = "👑 เข้าสู่ Royal Club";
      base.featuresTitle = "บริการระดับ Royal";
      base.featuresDesc = "ประสบการณ์ VIP ที่คุณสมควรได้รับ";
      base.gamesTitle = "👑 เกมพรีเมียม";
      base.promoTitle = "👑 ROYAL WELCOME";
      base.promoAmount = "200%";
      base.promoDesc = "ต้อนรับสมาชิกใหม่ด้วยโบนัส 200% + VIP Access ฟรี";
      base.promoCTA = "👑 รับสิทธิ์ Royal";
      base.extraCSS = `
        .feature-card { border-image: linear-gradient(135deg, rgba(212,175,55,0.2), transparent) 1; }
        .feature-card:hover { box-shadow: 0 12px 40px rgba(212,175,55,0.1); }
        .header .logo { text-shadow: 0 0 30px rgba(212,175,55,0.3); }
      `;
      break;

    case "cyber-slots":
      base.siteName = "CyberSlots";
      base.bgColor = "#060612";
      base.headerBg = "rgba(6,6,18,0.92)";
      base.heroBg = "linear-gradient(180deg, #060612 0%, #0c0c24 50%, #060612 100%)";
      base.heroOverlay = "radial-gradient(ellipse at 50% 30%, rgba(0,255,136,0.06) 0%, transparent 60%)";
      base.cardBg = "rgba(0,255,136,0.03)";
      base.borderColor = "rgba(0,255,136,0.12)";
      base.promoBg = "linear-gradient(135deg, rgba(0,255,136,0.05), rgba(0,200,255,0.05))";
      base.h1Gradient = "linear-gradient(135deg, #00ff88, #00c8ff, #8b5cf6)";
      base.heroBadge = "🤖 CYBER SLOTS — เทคโนโลยีแห่งอนาคต";
      base.heroTitle = "สล็อตไซเบอร์<br/>โลกอนาคต";
      base.heroDesc = "เกมสล็อตสุดล้ำด้วยเทคโนโลยี AI กราฟิกโฮโลแกรม เอฟเฟกต์สุดอลังการ";
      base.heroCTA = "🤖 เข้าสู่ Cyberspace";
      base.featuresTitle = "เทคโนโลยีสุดล้ำ";
      base.featuresDesc = "ระบบ AI อัจฉริยะสำหรับผู้เล่นยุคใหม่";
      base.gamesTitle = "🤖 Cyber Games";
      base.promoTitle = "🤖 CYBER BONUS";
      base.promoAmount = "250%";
      base.promoDesc = "โบนัสสุดล้ำ 250% + ฟรีสปิน 100 ครั้ง";
      base.promoCTA = "🤖 Activate Bonus";
      base.extraCSS = `
        .feature-card:hover { box-shadow: 0 0 30px rgba(0,255,136,0.12), 0 12px 40px rgba(0,0,0,0.3); }
        body::before { content: ''; position: fixed; inset: 0; background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.015) 2px, rgba(0,255,136,0.015) 4px); pointer-events: none; z-index: 9999; }
      `;
      break;

    case "lucky-fortune":
      base.siteName = "LuckyFortune";
      base.bgColor = "#0a0508";
      base.headerBg = "rgba(10,5,8,0.95)";
      base.heroBg = "linear-gradient(180deg, #0a0508 0%, #1a0a10 50%, #0a0508 100%)";
      base.heroOverlay = "radial-gradient(ellipse at 50% 40%, rgba(255,0,68,0.06) 0%, transparent 60%)";
      base.cardBg = "rgba(255,0,68,0.03)";
      base.borderColor = "rgba(255,0,68,0.12)";
      base.promoBg = "linear-gradient(135deg, rgba(255,0,68,0.08), rgba(255,215,0,0.05))";
      base.h1Gradient = "linear-gradient(135deg, #ff0044, #ff6600, #ffd700)";
      base.heroBadge = "🏮 LUCKY FORTUNE — โชคลาภมหาศาล";
      base.heroTitle = "โชคลาภ<br/>มหาเฮง";
      base.heroDesc = "คาสิโนสไตล์จีน เสริมดวง เสริมโชค เกมมงคลจากค่ายดังทั่วเอเชีย";
      base.heroCTA = "🏮 เริ่มเสี่ยงโชค";
      base.featuresTitle = "มงคลทุกด้าน";
      base.featuresDesc = "ระบบที่ออกแบบมาเพื่อความมั่งคั่ง";
      base.gamesTitle = "🏮 เกมมงคล";
      base.promoTitle = "🧧 FORTUNE BONUS";
      base.promoAmount = "888%";
      base.promoDesc = "อั่งเปาสมาชิกใหม่ 888% — ตัวเลขมงคลแห่งความร่ำรวย";
      base.promoCTA = "🧧 รับอั่งเปา";
      base.extraCSS = `
        .feature-card:hover { box-shadow: 0 12px 40px rgba(255,0,68,0.1); }
        .promo-inner { background: linear-gradient(135deg, rgba(255,0,68,0.08), rgba(255,215,0,0.05)); }
      `;
      break;

    case "golden-lottery":
      base.siteName = "GoldenLottery";
      base.bgColor = "#080806";
      base.headerBg = "rgba(8,8,6,0.95)";
      base.heroBg = "linear-gradient(180deg, #080806 0%, #141208 50%, #080806 100%)";
      base.heroOverlay = "radial-gradient(ellipse at 50% 40%, rgba(255,215,0,0.06) 0%, transparent 60%)";
      base.cardBg = "rgba(255,215,0,0.03)";
      base.borderColor = "rgba(255,215,0,0.12)";
      base.promoBg = "linear-gradient(135deg, rgba(255,215,0,0.08), rgba(184,134,11,0.05))";
      base.h1Gradient = "linear-gradient(135deg, #ffd700, #ffaa00, #b8860b)";
      base.heroBadge = "🎱 GOLDEN LOTTERY — หวยออนไลน์อันดับ 1";
      base.heroTitle = "หวยทองคำ<br/>จ่ายจริง ไม่อั้น";
      base.heroDesc = "แทงหวยออนไลน์ครบทุกประเภท จ่ายสูงสุดบาทละ 900 ถอนไม่มีขั้นต่ำ";
      base.heroCTA = "🎱 แทงหวยเลย";
      base.featuresTitle = "ทำไมต้อง Golden Lottery";
      base.featuresDesc = "ระบบหวยออนไลน์ที่ดีที่สุดในไทย";
      base.gamesTitle = "🎱 หวยทุกประเภท";
      base.promoTitle = "🎱 GOLDEN BONUS";
      base.promoAmount = "150%";
      base.promoDesc = "สมาชิกใหม่รับโบนัส 150% + แทงหวยฟรี 5 ใบ";
      base.promoCTA = "🎱 รับโบนัสเลย";
      base.extraCSS = `
        .feature-card:hover { box-shadow: 0 12px 40px rgba(255,215,0,0.1); }
      `;
      break;

    default:
      // mega-draw, jade-baccarat, etc.
      base.heroBadge = `🎰 ${slug.toUpperCase()} — คาสิโนออนไลน์`;
      base.heroTitle = "คาสิโนออนไลน์<br/>ครบวงจร";
      break;
  }

  return base;
}

export default function ThemeLivePreview({
  open,
  onClose,
  themeName,
  themeSlug,
  designStyle,
  category,
  defaultColors,
  customColors,
}: ThemePreviewProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const colors: ThemeColors = defaultColors || {
    primary: "#00f0ff",
    secondary: "#ff00e5",
    accent: "#ffea00",
    fontHeading: "Orbitron",
    fontBody: "Inter",
  };

  const previewHTML = useMemo(
    () => generatePreviewHTML(themeName, themeSlug, category || "slots", designStyle || "", colors, customColors),
    [themeName, themeSlug, category, designStyle, colors, customColors]
  );

  const srcDoc = useMemo(() => previewHTML, [previewHTML]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-card/95 backdrop-blur-md border-b border-border/30">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">{themeName}</h3>
          {designStyle && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {designStyle}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">Live Preview</span>
        </div>

        {/* Viewport Switcher */}
        <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-0.5">
          {(["desktop", "tablet", "mobile"] as Viewport[]).map((vp) => {
            const Icon = vp === "desktop" ? Monitor : vp === "tablet" ? Tablet : Smartphone;
            return (
              <button
                key={vp}
                onClick={() => setViewport(vp)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewport === vp
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{VIEWPORT_SIZES[vp].label}</span>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-8 w-8 p-0"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const blob = new Blob([previewHTML], { type: "text/html" });
              const url = URL.createObjectURL(blob);
              window.open(url, "_blank");
            }}
            className="h-8 w-8 p-0"
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Preview Frame */}
      <div className="flex-1 flex items-start justify-center overflow-auto bg-[#1a1a2e] p-4">
        <div
          className="bg-white rounded-lg overflow-hidden shadow-2xl transition-all duration-300 h-full"
          style={{
            width: VIEWPORT_SIZES[viewport].width,
            maxWidth: "100%",
            ...(isFullscreen ? { width: "100%", borderRadius: 0 } : {}),
          }}
        >
          <iframe
            srcDoc={srcDoc}
            className="w-full h-full border-0"
            title={`${themeName} Preview`}
            sandbox="allow-scripts"
          />
        </div>
      </div>
    </div>
  );
}
