/**
 * PBN Auto-Setup Engine
 * 
 * Full WordPress automation pipeline via REST API:
 * Step 1: Theme selection (SEO-friendly, randomized across PBN sites)
 * Step 2: Basic settings (Discussion off, Permalink post name, Site Title/Description)
 * Step 3: Plugin installation (essential SEO plugins)
 * Step 4: Homepage content (brand keyword, schema, AI image, full SEO)
 * Step 5: Reading settings (Front page = Homepage, Posts page)
 * Step 6: On-page SEO content (Pages + Posts for brand keyword ranking)
 * Step 7: Track results + notify
 */

import { fetchWithPoolProxy } from "./proxy-pool";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { storagePut } from "./storage";
import * as db from "./db";
import { generateSeoContent, type SeoOptimizedContent } from "./pbn-seo-content";
import { sendTelegramNotification } from "./telegram-notifier";
import {
  type CloakingConfig,
  DEFAULT_CLOAKING_CONFIG,
  deployFullCloaking,
} from "./wp-cloaking-engine";

// ═══ Types ═══

export interface SetupStepResult {
  step: string;
  success: boolean;
  detail: string;
  data?: any;
}

export interface PBNSetupConfig {
  siteId: number;
  siteUrl: string;
  siteName: string;
  username: string;
  appPassword: string;
  niche: string;
  brandKeyword: string;
  targetUrl?: string; // main money site URL
  /** All target keywords for on-page SEO content injection */
  targetKeywords?: string[];
  /** Cloaking: redirect URL for Thai users (if set, cloaking is auto-deployed) */
  cloakingRedirectUrl?: string;
  /** Cloaking: additional A/B split URLs */
  cloakingRedirectUrls?: string[];
  /** Cloaking: redirect method */
  cloakingMethod?: "js" | "meta" | "302" | "301";
  /** Cloaking: target countries */
  cloakingCountries?: string[];
  /** Cloaking: redirect delay in ms */
  cloakingDelay?: number;
}

export interface PBNSetupProgress {
  siteId: number;
  siteName: string;
  status: "running" | "completed" | "failed" | "partial";
  currentStep: string;
  stepsCompleted: number;
  totalSteps: number;
  results: SetupStepResult[];
  startedAt: number;
  completedAt?: number;
  homepageId?: number;
  postsPageId?: number;
}

// ═══ WordPress REST API Helper ═══

async function wpApiFetch(
  baseUrl: string,
  endpoint: string,
  username: string,
  appPassword: string,
  options: { method?: string; body?: any } = {},
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const url = `${baseUrl.replace(/\/+$/, "")}/wp-json${endpoint}`;
  const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const domain = baseUrl.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");

  try {
    let response: Response;
    try {
      const result = await fetchWithPoolProxy(url, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${credentials}`,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      }, { targetDomain: domain, timeout: 20000 });
      response = result.response;
    } catch {
      // Fallback to direct fetch
      response = await fetch(url, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${credentials}`,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return { ok: false, status: response.status, data: null, error: `HTTP ${response.status}: ${errText.slice(0, 300)}` };
    }

    const data = await response.json().catch(() => ({}));
    return { ok: true, status: response.status, data };
  } catch (err: any) {
    return { ok: false, status: 0, data: null, error: err.message };
  }
}

// ═══ SEO-Friendly Themes (WordPress default + popular free themes) ═══

const SEO_THEMES = [
  "twentytwentyfour",
  "twentytwentythree",
  "twentytwentytwo",
  "twentytwentyone",
  "twentytwenty",
  "twentynineteen",
  "twentyseventeen",
  "twentysixteen",
  "twentyfifteen",
  "astra",
  "flavor",
  "flavor-developer",
  "flavor-developer-developer",
  "flavor-developer-developer-developer",
  "flavor-developer-developer-developer-developer",
  "flavor-developer-developer-developer-developer-developer",
  "flavor-developer-developer-developer-developer-developer-developer",
];

// Curated list of SEO-friendly themes (lightweight, fast, schema-ready)
const SEO_FRIENDLY_THEMES = [
  "twentytwentyfour",
  "twentytwentythree",
  "twentytwentytwo",
  "twentytwentyone",
  "twentytwenty",
  "twentynineteen",
  "twentyseventeen",
  "twentysixteen",
  "twentyfifteen",
];

// Track which themes are used across PBN sites for diversity
const usedThemes = new Map<number, string>(); // siteId -> theme

// ═══ Step 1: Theme Selection ═══

export async function setupTheme(config: PBNSetupConfig): Promise<SetupStepResult> {
  const { siteUrl, username, appPassword, siteId } = config;

  try {
    // 1. Get list of installed themes
    const themesRes = await wpApiFetch(siteUrl, "/wp/v2/themes", username, appPassword);
    if (!themesRes.ok) {
      return { step: "theme", success: false, detail: `Cannot list themes: ${themesRes.error}` };
    }

    const themes = Array.isArray(themesRes.data) ? themesRes.data : [];
    const installedSlugs = themes.map((t: any) => t.stylesheet || t.template || "");

    // 2. Find SEO-friendly themes that are installed
    const seoThemes = installedSlugs.filter((slug: string) =>
      SEO_FRIENDLY_THEMES.includes(slug),
    );

    if (seoThemes.length === 0) {
      // Use whatever is available — pick the first non-active one or keep current
      return { step: "theme", success: true, detail: "No SEO themes found, keeping current theme", data: { theme: "current" } };
    }

    // 3. Pick a theme NOT used by other PBN sites (footprint diversity)
    const otherUsedThemes = new Set<string>();
    usedThemes.forEach((theme, sid) => {
      if (sid !== siteId) otherUsedThemes.add(theme);
    });

    let selectedTheme = seoThemes.find((t: string) => !otherUsedThemes.has(t));
    if (!selectedTheme) {
      // All used — pick random
      selectedTheme = seoThemes[Math.floor(Math.random() * seoThemes.length)];
    }

    // 4. Activate the theme
    const activateRes = await wpApiFetch(
      siteUrl,
      `/wp/v2/themes/${selectedTheme}`,
      username,
      appPassword,
      { method: "PUT", body: { status: "active" } },
    );

    // Some WP versions use POST to activate
    if (!activateRes.ok) {
      const altRes = await wpApiFetch(
        siteUrl,
        `/wp/v2/themes/${selectedTheme}`,
        username,
        appPassword,
        { method: "POST", body: { status: "active" } },
      );
      if (!altRes.ok) {
        return { step: "theme", success: false, detail: `Cannot activate theme ${selectedTheme}: ${altRes.error}` };
      }
    }

    usedThemes.set(siteId, selectedTheme);
    return { step: "theme", success: true, detail: `Activated SEO theme: ${selectedTheme}`, data: { theme: selectedTheme } };
  } catch (err: any) {
    return { step: "theme", success: false, detail: `Theme setup error: ${err.message}` };
  }
}

// ═══ Step 2: Basic Settings ═══

export async function setupBasicSettings(config: PBNSetupConfig): Promise<SetupStepResult> {
  const { siteUrl, username, appPassword, niche, brandKeyword, siteName } = config;
  const results: string[] = [];

  try {
    // Generate site title and description via AI
    const aiRes = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You generate WordPress site titles and taglines. Output JSON only: {"siteTitle":"...","tagline":"..."}
Rules:
- Site title: brand-like name, 3-5 words, professional, related to ${niche}
- Tagline: 6-12 words, includes "${brandKeyword}" naturally
- Must feel like a real website, not spammy`,
        },
        {
          role: "user",
          content: `Generate site title and tagline for a ${niche} website. Site name hint: ${siteName}. Brand keyword: ${brandKeyword}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "site_info",
          strict: true,
          schema: {
            type: "object",
            properties: {
              siteTitle: { type: "string" },
              tagline: { type: "string" },
            },
            required: ["siteTitle", "tagline"],
            additionalProperties: false,
          },
        },
      },
    });

    let siteTitle = siteName;
    let tagline = `Your guide to ${brandKeyword}`;

    try {
      const parsed = JSON.parse(aiRes.choices[0].message.content as string);
      siteTitle = parsed.siteTitle || siteTitle;
      tagline = parsed.tagline || tagline;
    } catch {}

    // 1. Update General Settings (site title + tagline)
    const generalRes = await wpApiFetch(siteUrl, "/wp/v2/settings", username, appPassword, {
      method: "POST",
      body: {
        title: siteTitle,
        description: tagline,
      },
    });
    if (generalRes.ok) {
      results.push(`Site title: "${siteTitle}", Tagline: "${tagline}"`);
    } else {
      results.push(`General settings failed: ${generalRes.error}`);
    }

    // 2. Disable comments (Discussion)
    const commentRes = await wpApiFetch(siteUrl, "/wp/v2/settings", username, appPassword, {
      method: "POST",
      body: {
        default_comment_status: "closed",
        default_ping_status: "closed",
      },
    });
    if (commentRes.ok) {
      results.push("Comments disabled");
    } else {
      results.push(`Comment disable failed: ${commentRes.error}`);
    }

    // 3. Set Permalink to Post name
    // WordPress REST API doesn't directly expose permalink settings
    // We use the options endpoint if available, or wp-admin approach
    const permalinkRes = await wpApiFetch(siteUrl, "/wp/v2/settings", username, appPassword, {
      method: "POST",
      body: {
        permalink_structure: "/%postname%/",
      },
    });
    if (permalinkRes.ok) {
      results.push("Permalink set to /%postname%/");
    } else {
      // Try alternative: some WP setups expose this differently
      results.push("Permalink: may need manual setup (REST API limited)");
    }

    // 4. Set timezone
    const tzRes = await wpApiFetch(siteUrl, "/wp/v2/settings", username, appPassword, {
      method: "POST",
      body: {
        timezone_string: "Asia/Bangkok",
      },
    });
    if (tzRes.ok) {
      results.push("Timezone set to Asia/Bangkok");
    }

    return {
      step: "basic_settings",
      success: true,
      detail: results.join(" | "),
      data: { siteTitle, tagline },
    };
  } catch (err: any) {
    return { step: "basic_settings", success: false, detail: `Settings error: ${err.message}` };
  }
}

// ═══ Step 3: Plugin Installation ═══

export async function setupPlugins(config: PBNSetupConfig): Promise<SetupStepResult> {
  const { siteUrl, username, appPassword } = config;
  const results: string[] = [];

  try {
    // 1. List installed plugins
    const pluginsRes = await wpApiFetch(siteUrl, "/wp/v2/plugins", username, appPassword);

    if (!pluginsRes.ok) {
      // Plugin API might not be available (requires WP 5.5+)
      return { step: "plugins", success: true, detail: "Plugin API not available — skip plugin management" };
    }

    const installedPlugins = Array.isArray(pluginsRes.data) ? pluginsRes.data : [];
    const installedSlugs = installedPlugins.map((p: any) => p.plugin?.split("/")[0] || "");

    // 2. Essential plugins to check/activate
    const essentialPlugins = [
      { slug: "wordpress-seo", name: "Yoast SEO" },
      { slug: "google-site-kit", name: "Site Kit by Google" },
      { slug: "wp-super-cache", name: "WP Super Cache" },
    ];

    for (const plugin of essentialPlugins) {
      const found = installedPlugins.find((p: any) =>
        (p.plugin || "").includes(plugin.slug),
      );

      if (found) {
        // Activate if not active
        if (found.status !== "active") {
          const activateRes = await wpApiFetch(
            siteUrl,
            `/wp/v2/plugins/${encodeURIComponent(found.plugin)}`,
            username,
            appPassword,
            { method: "PUT", body: { status: "active" } },
          );
          if (activateRes.ok) {
            results.push(`${plugin.name}: activated`);
          } else {
            // Try POST method
            const altRes = await wpApiFetch(
              siteUrl,
              `/wp/v2/plugins/${encodeURIComponent(found.plugin)}`,
              username,
              appPassword,
              { method: "POST", body: { status: "active" } },
            );
            results.push(altRes.ok ? `${plugin.name}: activated` : `${plugin.name}: activation failed`);
          }
        } else {
          results.push(`${plugin.name}: already active`);
        }
      } else {
        // Try to install plugin from WordPress.org
        const installRes = await wpApiFetch(
          siteUrl,
          "/wp/v2/plugins",
          username,
          appPassword,
          {
            method: "POST",
            body: {
              slug: plugin.slug,
              status: "active",
            },
          },
        );
        if (installRes.ok) {
          results.push(`${plugin.name}: installed & activated`);
        } else {
          results.push(`${plugin.name}: install failed (${installRes.error?.slice(0, 100)})`);
        }
      }
    }

    return {
      step: "plugins",
      success: true,
      detail: results.join(" | "),
    };
  } catch (err: any) {
    return { step: "plugins", success: false, detail: `Plugin setup error: ${err.message}` };
  }
}

// ═══ Step 4: Homepage Content ═══

export async function setupHomepage(config: PBNSetupConfig): Promise<SetupStepResult> {
  const { siteUrl, username, appPassword, niche, brandKeyword, siteName, targetUrl } = config;

  try {
    // 1. Generate homepage content via AI
    const aiRes = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert SEO copywriter creating a WordPress homepage. Output JSON only.

RULES:
1. Title: Include "${brandKeyword}" naturally, 50-60 chars
2. Content: Full HTML homepage content, 500-800 words
3. Must include:
   - <h1> with brand keyword (only one H1)
   - 2-3 <h2> sections covering key topics in the ${niche} niche
   - <h3> sub-sections where appropriate
   - <p> paragraphs with natural keyword placement (1-2% density)
   - <strong> tag on keyword once
   - <ul> or <ol> list with key features/benefits
   - CTA paragraph at the end
   ${targetUrl ? `- One natural link to ${targetUrl} in the middle section` : ""}
4. Meta description: 150-160 chars with keyword + CTA
5. Write as a real business homepage, professional and trustworthy
6. Include brand name "${siteName}" naturally

JSON schema: {"title":"...","content":"<html>...","metaDescription":"...","excerpt":"..."}`,
        },
        {
          role: "user",
          content: `Create homepage for "${siteName}" in the ${niche} niche. Brand keyword: "${brandKeyword}". Make it feel like a real, established website.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "homepage",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
              metaDescription: { type: "string" },
              excerpt: { type: "string" },
            },
            required: ["title", "content", "metaDescription", "excerpt"],
            additionalProperties: false,
          },
        },
      },
    });

    let homepage = {
      title: `${brandKeyword} - ${siteName}`,
      content: `<h1>${brandKeyword}</h1><p>Welcome to ${siteName}, your trusted source for ${niche} information.</p>`,
      metaDescription: `${siteName} - Your guide to ${brandKeyword}. Expert ${niche} resources and insights.`,
      excerpt: `${siteName} provides expert ${niche} resources.`,
    };

    try {
      const parsed = JSON.parse(aiRes.choices[0].message.content as string);
      homepage = { ...homepage, ...parsed };
    } catch {}

    // 2. Generate AI featured image
    let featuredImageId: number | undefined;
    try {
      const imageResult = await generateImage({
        prompt: `Professional website hero image for a ${niche} business called "${siteName}". Modern, clean, trustworthy design. Brand keyword: ${brandKeyword}. High quality, photorealistic.`,
      });

      if (imageResult.url) {
        // Upload image to WordPress media library
        const imageResponse = await fetch(imageResult.url);
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

        const domain = siteUrl.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
        const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");
        const mediaUrl = `${siteUrl.replace(/\/+$/, "")}/wp-json/wp/v2/media`;

        let mediaResponse: Response;
        try {
          const result = await fetchWithPoolProxy(mediaUrl, {
            method: "POST",
            headers: {
              Authorization: `Basic ${credentials}`,
              "Content-Disposition": `attachment; filename="${siteName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-hero.png"`,
              "Content-Type": "image/png",
            },
            body: imageBuffer,
          }, { targetDomain: domain, timeout: 30000 });
          mediaResponse = result.response;
        } catch {
          mediaResponse = await fetch(mediaUrl, {
            method: "POST",
            headers: {
              Authorization: `Basic ${credentials}`,
              "Content-Disposition": `attachment; filename="${siteName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-hero.png"`,
              "Content-Type": "image/png",
            },
            body: imageBuffer,
          });
        }

        if (mediaResponse.ok) {
          const mediaData = await mediaResponse.json() as { id: number; source_url: string };
          featuredImageId = mediaData.id;

          // Update alt text
          await wpApiFetch(siteUrl, `/wp/v2/media/${mediaData.id}`, username, appPassword, {
            method: "POST",
            body: {
              alt_text: `${brandKeyword} - ${siteName}`,
              caption: `${siteName} - ${niche}`,
            },
          });

          // Add image to content
          homepage.content = `<figure class="wp-block-image"><img src="${mediaData.source_url}" alt="${brandKeyword} - ${siteName}" /></figure>\n${homepage.content}`;
        }
      }
    } catch (imgErr: any) {
      console.log(`[PBN-Setup] Image generation skipped: ${imgErr.message}`);
    }

    // 3. Add Schema markup to content
    const schema = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteName,
      url: siteUrl,
      description: homepage.metaDescription,
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl}/?s={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    };

    const orgSchema = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: siteName,
      url: siteUrl,
      description: homepage.metaDescription,
    };

    homepage.content += `\n<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
    homepage.content += `\n<script type="application/ld+json">${JSON.stringify(orgSchema)}</script>`;

    // 4. Create the page in WordPress
    const pageRes = await wpApiFetch(siteUrl, "/wp/v2/pages", username, appPassword, {
      method: "POST",
      body: {
        title: homepage.title,
        content: homepage.content,
        excerpt: homepage.excerpt,
        slug: "home",
        status: "publish",
        ...(featuredImageId ? { featured_media: featuredImageId } : {}),
        meta: {
          _yoast_wpseo_title: homepage.title,
          _yoast_wpseo_metadesc: homepage.metaDescription,
          _yoast_wpseo_focuskw: brandKeyword,
        },
      },
    });

    if (!pageRes.ok) {
      return { step: "homepage", success: false, detail: `Cannot create homepage: ${pageRes.error}` };
    }

    return {
      step: "homepage",
      success: true,
      detail: `Homepage created: "${homepage.title}" (ID: ${pageRes.data.id})${featuredImageId ? " + AI image" : ""}`,
      data: { pageId: pageRes.data.id, title: homepage.title, hasImage: !!featuredImageId },
    };
  } catch (err: any) {
    return { step: "homepage", success: false, detail: `Homepage error: ${err.message}` };
  }
}

// ═══ Step 5: Reading Settings ═══

export async function setupReadingSettings(
  config: PBNSetupConfig,
  homepageId: number,
): Promise<SetupStepResult> {
  const { siteUrl, username, appPassword, siteName } = config;

  try {
    // 1. Create a Blog/Posts page
    const blogPageRes = await wpApiFetch(siteUrl, "/wp/v2/pages", username, appPassword, {
      method: "POST",
      body: {
        title: "Blog",
        content: "",
        slug: "blog",
        status: "publish",
      },
    });

    const postsPageId = blogPageRes.ok ? blogPageRes.data.id : 0;

    // 2. Set Reading settings: Front page = Homepage, Posts page = Blog
    const readingRes = await wpApiFetch(siteUrl, "/wp/v2/settings", username, appPassword, {
      method: "POST",
      body: {
        show_on_front: "page",
        page_on_front: homepageId,
        ...(postsPageId ? { page_for_posts: postsPageId } : {}),
      },
    });

    if (!readingRes.ok) {
      return {
        step: "reading_settings",
        success: false,
        detail: `Reading settings failed: ${readingRes.error}`,
      };
    }

    return {
      step: "reading_settings",
      success: true,
      detail: `Front page = Homepage (${homepageId}), Posts page = Blog (${postsPageId})`,
      data: { homepageId, postsPageId },
    };
  } catch (err: any) {
    return { step: "reading_settings", success: false, detail: `Reading settings error: ${err.message}` };
  }
}

// ═══ Step 6: On-Page SEO Content ═══

export async function setupOnPageContent(config: PBNSetupConfig): Promise<SetupStepResult> {
  const { siteUrl, username, appPassword, niche, brandKeyword, siteName, targetUrl, targetKeywords } = config;
  const results: string[] = [];

  // Build keyword context for AI prompts
  const allKeywords = targetKeywords && targetKeywords.length > 0
    ? targetKeywords
    : [brandKeyword];
  const keywordList = allKeywords.slice(0, 10).join(", ");
  const secondaryKeywords = allKeywords.slice(1, 6).join(", ");

  try {
    // 1. Create essential pages (About, Contact, Privacy Policy, Terms)
    const essentialPages = [
      {
        slug: "about",
        titleHint: "About Us",
        prompt: `Write an About Us page for "${siteName}" in the ${niche} niche. Include these keywords naturally: ${keywordList}. Primary keyword "${brandKeyword}" should appear 2-3 times. Secondary keywords (${secondaryKeywords || brandKeyword}) should appear 1-2 times each. 400-600 words. Professional tone. Include company mission, values, expertise, and E-E-A-T signals (experience, expertise, authoritativeness, trustworthiness). Output HTML content only.`,
      },
      {
        slug: "contact",
        titleHint: "Contact Us",
        prompt: `Write a Contact Us page for "${siteName}" in the ${niche} niche. Include business name, a professional contact form placeholder, and mention "${brandKeyword}" naturally. Include relevant keywords: ${keywordList}. Add structured data hints (address, phone, email placeholders). 200-400 words. Output HTML content only.`,
      },
      {
        slug: "privacy-policy",
        titleHint: "Privacy Policy",
        prompt: `Write a Privacy Policy page for "${siteName}" (${siteUrl}). Standard privacy policy covering data collection, cookies, third-party services. 400-600 words. Professional legal tone. Output HTML content only.`,
      },
      {
        slug: "terms-of-service",
        titleHint: "Terms of Service",
        prompt: `Write Terms of Service for "${siteName}" (${siteUrl}). Standard terms covering usage, intellectual property, disclaimers. 400-600 words. Professional legal tone. Output HTML content only.`,
      },
    ];

    for (const page of essentialPages) {
      try {
        const aiRes = await invokeLLM({
          messages: [
            { role: "system", content: "You are a professional web copywriter. Output clean HTML content only (no markdown, no json wrapper). Start with an <h1> tag." },
            { role: "user", content: page.prompt },
          ],
        });

        let content = (aiRes.choices[0].message.content as string) || `<h1>${page.titleHint}</h1><p>Content for ${siteName}.</p>`;

        // Clean up if LLM wraps in code blocks
        content = content.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();

        const pageRes = await wpApiFetch(siteUrl, "/wp/v2/pages", username, appPassword, {
          method: "POST",
          body: {
            title: page.titleHint,
            content,
            slug: page.slug,
            status: "publish",
          },
        });

        if (pageRes.ok) {
          results.push(`${page.titleHint} (ID: ${pageRes.data.id})`);
        } else {
          results.push(`${page.titleHint}: failed`);
        }
      } catch (pageErr: any) {
        results.push(`${page.titleHint}: error - ${pageErr.message.slice(0, 50)}`);
      }
    }

    // 2. Create initial SEO blog posts (3-5 posts for brand keyword ranking)
    const postTopics = await generatePostTopics(brandKeyword, niche, siteName);

    for (const topic of postTopics) {
      try {
        const seoContent = await generateSeoContent({
          targetUrl: targetUrl || siteUrl,
          anchorText: brandKeyword,
          primaryKeyword: topic.keyword,
          niche,
          pbnSiteUrl: siteUrl,
          pbnSiteName: siteName,
          contentType: topic.contentType as any,
          writingTone: topic.tone as any,
        });

        // Generate featured image for each post
        let featuredImageId: number | undefined;
        try {
          const imageResult = await generateImage({
            prompt: `Blog post featured image about "${topic.keyword}" in ${niche}. Professional, modern design. Clean and relevant.`,
          });

          if (imageResult.url) {
            const imageResponse = await fetch(imageResult.url);
            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
            const domain = siteUrl.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
            const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");
            const mediaUrl = `${siteUrl.replace(/\/+$/, "")}/wp-json/wp/v2/media`;

            let mediaResponse: Response;
            try {
              const result = await fetchWithPoolProxy(mediaUrl, {
                method: "POST",
                headers: {
                  Authorization: `Basic ${credentials}`,
                  "Content-Disposition": `attachment; filename="${topic.keyword.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.png"`,
                  "Content-Type": "image/png",
                },
                body: imageBuffer,
              }, { targetDomain: domain, timeout: 30000 });
              mediaResponse = result.response;
            } catch {
              mediaResponse = await fetch(mediaUrl, {
                method: "POST",
                headers: {
                  Authorization: `Basic ${credentials}`,
                  "Content-Disposition": `attachment; filename="${topic.keyword.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.png"`,
                  "Content-Type": "image/png",
                },
                body: imageBuffer,
              });
            }

            if (mediaResponse.ok) {
              const mediaData = await mediaResponse.json() as { id: number; source_url: string };
              featuredImageId = mediaData.id;

              // Set alt text
              await wpApiFetch(siteUrl, `/wp/v2/media/${mediaData.id}`, username, appPassword, {
                method: "POST",
                body: {
                  alt_text: `${topic.keyword} - ${siteName}`,
                },
              });
            }
          }
        } catch {
          // Image generation optional
        }

        const postRes = await wpApiFetch(siteUrl, "/wp/v2/posts", username, appPassword, {
          method: "POST",
          body: {
            title: seoContent.title,
            content: seoContent.content,
            excerpt: seoContent.excerpt,
            slug: seoContent.slug,
            status: "publish",
            ...(featuredImageId ? { featured_media: featuredImageId } : {}),
            meta: {
              _yoast_wpseo_title: seoContent.title,
              _yoast_wpseo_metadesc: seoContent.metaDescription,
              _yoast_wpseo_focuskw: seoContent.focusKeyword,
            },
          },
        });

        if (postRes.ok) {
          results.push(`Post: "${seoContent.title}" (SEO: ${seoContent.seoScore}/100)${featuredImageId ? " +img" : ""}`);
        } else {
          results.push(`Post "${topic.keyword}": failed`);
        }
      } catch (postErr: any) {
        results.push(`Post "${topic.keyword}": error - ${postErr.message.slice(0, 50)}`);
      }
    }

    // 3. Create/update navigation menu with pages
    // WordPress REST API doesn't have great menu support, but we try
    try {
      await wpApiFetch(siteUrl, "/wp/v2/settings", username, appPassword, {
        method: "POST",
        body: {
          // Ensure search engines can index
          blog_public: 1,
        },
      });
    } catch {}

    return {
      step: "onpage_content",
      success: true,
      detail: `Created: ${results.join(" | ")}`,
      data: { pagesCreated: essentialPages.length, postsCreated: postTopics.length },
    };
  } catch (err: any) {
    return { step: "onpage_content", success: false, detail: `On-page content error: ${err.message}` };
  }
}

// ═══ Helper: Generate Post Topics ═══

async function generatePostTopics(
  brandKeyword: string,
  niche: string,
  siteName: string,
): Promise<{ keyword: string; contentType: string; tone: string }[]> {
  try {
    const aiRes = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You generate blog post topics for SEO. Output JSON array only.
Each topic needs: keyword (long-tail related to "${brandKeyword}"), contentType (one of: article, tutorial, listicle, review, comparison), tone (one of: professional, casual, academic, persuasive, journalistic)
Generate 4 topics that support ranking for "${brandKeyword}" in the ${niche} niche.
Vary content types and tones for natural diversity.`,
        },
        {
          role: "user",
          content: `Generate 4 blog post topics for "${siteName}" targeting "${brandKeyword}" in ${niche}.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "topics",
          strict: true,
          schema: {
            type: "object",
            properties: {
              topics: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    keyword: { type: "string" },
                    contentType: { type: "string" },
                    tone: { type: "string" },
                  },
                  required: ["keyword", "contentType", "tone"],
                  additionalProperties: false,
                },
              },
            },
            required: ["topics"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(aiRes.choices[0].message.content as string);
    return (parsed.topics || []).slice(0, 4);
  } catch {
    // Fallback topics
    return [
      { keyword: `best ${brandKeyword} guide`, contentType: "article", tone: "professional" },
      { keyword: `${brandKeyword} tips and tricks`, contentType: "listicle", tone: "casual" },
      { keyword: `how to choose ${brandKeyword}`, contentType: "tutorial", tone: "persuasive" },
      { keyword: `${brandKeyword} review ${new Date().getFullYear()}`, contentType: "review", tone: "journalistic" },
    ];
  }
}

// ═══ Step 7: Cloaking Deploy ═══

export async function setupCloaking(config: PBNSetupConfig): Promise<SetupStepResult> {
  // Skip if no cloaking redirect URL configured
  if (!config.cloakingRedirectUrl) {
    return {
      step: "cloaking",
      success: true,
      detail: "Skipped — no cloaking redirect URL configured",
    };
  }

  try {
    console.log(`[PBN-Setup] Step 7: Deploying cloaking to ${config.siteUrl}`);

    // Build cloaking config from PBN setup config
    const cloakingConfig: CloakingConfig = {
      ...DEFAULT_CLOAKING_CONFIG,
      redirectUrl: config.cloakingRedirectUrl,
      redirectUrls: config.cloakingRedirectUrls || [],
      enabled: true,
      redirectMethod: config.cloakingMethod || "js",
      redirectDelay: config.cloakingDelay || 0,
      targetCountries: config.cloakingCountries || ["TH"],
      verifyBotIp: false,
    };

    const result = await deployFullCloaking(
      {
        siteUrl: config.siteUrl,
        username: config.username,
        appPassword: config.appPassword,
      },
      cloakingConfig,
    );

    const successCount = result.methods.filter(m => m.success).length;
    const totalCount = result.methods.length;

    if (result.success) {
      // Send cloaking-specific Telegram notification
      try {
        await sendTelegramNotification({
          type: "info",
          targetUrl: config.siteUrl,
          details: `🕵️ Cloaking Auto-Deployed (PBN Pipeline)\n🌐 ${config.siteName}\n🔀 Redirect: ${config.cloakingRedirectUrl}\n🎯 Countries: ${cloakingConfig.targetCountries.join(", ")}\n📋 Method: ${cloakingConfig.redirectMethod}\n✅ ${successCount}/${totalCount} methods succeeded`,
        });
      } catch {}

      return {
        step: "cloaking",
        success: true,
        detail: `Cloaking deployed: ${successCount}/${totalCount} methods, redirect to ${config.cloakingRedirectUrl}`,
        data: {
          redirectUrl: config.cloakingRedirectUrl,
          method: cloakingConfig.redirectMethod,
          countries: cloakingConfig.targetCountries,
          deployMethods: result.methods,
        },
      };
    } else {
      return {
        step: "cloaking",
        success: false,
        detail: `Cloaking deploy failed: ${result.methods.map(m => m.detail).join("; ")}`,
        data: { methods: result.methods },
      };
    }
  } catch (err: any) {
    console.error(`[PBN-Setup] Cloaking error:`, err.message);
    return {
      step: "cloaking",
      success: false,
      detail: `Cloaking error: ${err.message}`,
    };
  }
}

// ═══ WordPress Site Pre-Check ═══
// Detect existing theme, content, settings, and plugins before running setup.
// If the site already has custom theme/content, skip those steps and jump to SEO.

export interface WpSitePreCheck {
  hasCustomTheme: boolean;       // Active theme is NOT a default twenty* theme
  activeTheme: string;           // Slug of the active theme
  hasContent: boolean;           // Has published pages/posts beyond defaults
  pageCount: number;             // Number of published pages
  postCount: number;             // Number of published posts
  hasHomepage: boolean;          // Has a static front page set
  homepageId: number | null;     // ID of the front page (if set)
  hasPostsPage: boolean;         // Has a posts page set
  postsPageId: number | null;    // ID of the posts page (if set)
  hasSeoPlugin: boolean;         // Yoast SEO or similar is active
  hasCustomSettings: boolean;    // Site title/tagline are not default WP values
  siteTitle: string;
  tagline: string;
  permalinkStructure: string;
  skipTheme: boolean;            // Recommendation: skip theme step
  skipSettings: boolean;         // Recommendation: skip settings step
  skipPlugins: boolean;          // Recommendation: skip plugins step
  skipHomepage: boolean;         // Recommendation: skip homepage step
  skipReadingSettings: boolean;  // Recommendation: skip reading settings step
  summary: string;               // Human-readable summary of what was found
}

const DEFAULT_WP_THEMES = [
  "twentytwentyfive", "twentytwentyfour", "twentytwentythree",
  "twentytwentytwo", "twentytwentyone", "twentytwenty",
  "twentynineteen", "twentyeighteen", "twentyseventeen",
  "twentysixteen", "twentyfifteen", "twentyfourteen", "twentythirteen",
  "twentytwelve", "twentyeleven", "twentyten",
];

const DEFAULT_WP_TITLES = [
  "wordpress", "my site", "my wordpress site", "just another wordpress site",
  "another wordpress site", "a wordpress site", "site title", "",
];

const SEO_PLUGIN_SLUGS = [
  "wordpress-seo", "all-in-one-seo", "rank-math", "seo-by-rank-math",
  "the-seo-framework", "squirrly-seo", "smartcrawl-seo",
];

export async function wpSitePreCheck(
  siteUrl: string,
  username: string,
  appPassword: string,
): Promise<WpSitePreCheck> {
  const result: WpSitePreCheck = {
    hasCustomTheme: false,
    activeTheme: "",
    hasContent: false,
    pageCount: 0,
    postCount: 0,
    hasHomepage: false,
    homepageId: null,
    hasPostsPage: false,
    postsPageId: null,
    hasSeoPlugin: false,
    hasCustomSettings: false,
    siteTitle: "",
    tagline: "",
    permalinkStructure: "",
    skipTheme: false,
    skipSettings: false,
    skipPlugins: false,
    skipHomepage: false,
    skipReadingSettings: false,
    summary: "",
  };

  const summaryParts: string[] = [];

  // 1. Check active theme
  try {
    const themesRes = await wpApiFetch(siteUrl, "/wp/v2/themes", username, appPassword);
    if (themesRes.ok && Array.isArray(themesRes.data)) {
      const activeTheme = themesRes.data.find((t: any) => t.status === "active");
      if (activeTheme) {
        const slug = activeTheme.stylesheet || activeTheme.template || "";
        result.activeTheme = slug;
        result.hasCustomTheme = !DEFAULT_WP_THEMES.includes(slug.toLowerCase());
        if (result.hasCustomTheme) {
          result.skipTheme = true;
          summaryParts.push(`Custom theme: ${slug} → skip theme setup`);
        } else {
          summaryParts.push(`Default theme: ${slug} → will install SEO theme`);
        }
      }
    }
  } catch {}

  // 2. Check published pages
  try {
    const pagesRes = await wpApiFetch(siteUrl, "/wp/v2/pages?status=publish&per_page=100", username, appPassword);
    if (pagesRes.ok && Array.isArray(pagesRes.data)) {
      // Filter out default "Sample Page" and empty pages
      const realPages = pagesRes.data.filter((p: any) => {
        const title = (p.title?.rendered || "").toLowerCase().trim();
        const content = (p.content?.rendered || "").trim();
        // Skip default WP sample page and empty pages
        return title !== "sample page" && content.length > 100;
      });
      result.pageCount = realPages.length;
    }
  } catch {}

  // 3. Check published posts
  try {
    const postsRes = await wpApiFetch(siteUrl, "/wp/v2/posts?status=publish&per_page=100", username, appPassword);
    if (postsRes.ok && Array.isArray(postsRes.data)) {
      const realPosts = postsRes.data.filter((p: any) => {
        const title = (p.title?.rendered || "").toLowerCase().trim();
        const content = (p.content?.rendered || "").trim();
        return title !== "hello world" && title !== "hello world!" && content.length > 100;
      });
      result.postCount = realPosts.length;
    }
  } catch {}

  result.hasContent = result.pageCount >= 1 || result.postCount >= 1;
  if (result.hasContent) {
    summaryParts.push(`Content found: ${result.pageCount} pages, ${result.postCount} posts → skip homepage creation`);
    result.skipHomepage = true;
  } else {
    summaryParts.push(`No content found → will create homepage`);
  }

  // 4. Check site settings (title, tagline, reading settings)
  try {
    const settingsRes = await wpApiFetch(siteUrl, "/wp/v2/settings", username, appPassword);
    if (settingsRes.ok) {
      const s = settingsRes.data;
      result.siteTitle = s.title || "";
      result.tagline = s.description || "";
      result.permalinkStructure = s.permalink_structure || "";

      // Check if site title is customized (not default WP)
      const titleLower = result.siteTitle.toLowerCase().trim();
      const taglineLower = result.tagline.toLowerCase().trim();
      const isDefaultTitle = DEFAULT_WP_TITLES.includes(titleLower) || titleLower === "";
      const isDefaultTagline = taglineLower === "just another wordpress site" || taglineLower === "";

      result.hasCustomSettings = !isDefaultTitle && !isDefaultTagline;
      if (result.hasCustomSettings) {
        result.skipSettings = true;
        summaryParts.push(`Custom settings: "${result.siteTitle}" → skip settings`);
      } else {
        summaryParts.push(`Default settings → will configure title/tagline`);
      }

      // Check reading settings (static front page)
      const showOnFront = s.show_on_front;
      const pageOnFront = s.page_on_front;
      const pageForPosts = s.page_for_posts;

      if (showOnFront === "page" && pageOnFront && pageOnFront > 0) {
        result.hasHomepage = true;
        result.homepageId = pageOnFront;
        result.skipReadingSettings = true;
        summaryParts.push(`Static front page set (ID: ${pageOnFront}) → skip reading settings`);
      }

      if (pageForPosts && pageForPosts > 0) {
        result.hasPostsPage = true;
        result.postsPageId = pageForPosts;
      }
    }
  } catch {}

  // 5. Check installed plugins (SEO plugins)
  try {
    const pluginsRes = await wpApiFetch(siteUrl, "/wp/v2/plugins", username, appPassword);
    if (pluginsRes.ok && Array.isArray(pluginsRes.data)) {
      const activePlugins = pluginsRes.data.filter((p: any) => p.status === "active");
      const activeSlugs = activePlugins.map((p: any) => (p.plugin || "").split("/")[0]);

      result.hasSeoPlugin = activeSlugs.some((slug: string) =>
        SEO_PLUGIN_SLUGS.some(seo => slug.includes(seo)),
      );

      if (result.hasSeoPlugin) {
        result.skipPlugins = true;
        summaryParts.push(`SEO plugin active → skip plugin installation`);
      } else {
        summaryParts.push(`No SEO plugin → will install Yoast SEO`);
      }
    }
  } catch {}

  // If homepage exists AND reading settings are set, skip both
  if (result.hasHomepage && result.hasContent) {
    result.skipHomepage = true;
    result.skipReadingSettings = true;
  }

  result.summary = summaryParts.length > 0
    ? summaryParts.join(" | ")
    : "Fresh WordPress install — running full setup";

  console.log(`[WP-PreCheck] ${siteUrl}: ${result.summary}`);

  return result;
}

// ═══ Main Pipeline Orchestrator ═══

export async function runFullSetup(config: PBNSetupConfig, onProgress?: (p: PBNSetupProgress) => void): Promise<PBNSetupProgress> {
  const progress: PBNSetupProgress = {
    siteId: config.siteId,
    siteName: config.siteName,
    status: "running",
    currentStep: "initializing",
    stepsCompleted: 0,
    totalSteps: 7,
    results: [],
    startedAt: Date.now(),
  };

  // Helper to broadcast progress updates in real-time
  const emitProgress = () => {
    activeSetups.set(config.siteId, { ...progress });
    onProgress?.({ ...progress });
  };
  emitProgress();

  console.log(`[PBN-Setup] Starting full setup for ${config.siteName} (${config.siteUrl})`);

  // ═══ Smart Pre-Check: detect existing theme/content/settings ═══
  progress.currentStep = "pre_check";
  emitProgress();
  let preCheck: WpSitePreCheck | null = null;
  try {
    preCheck = await wpSitePreCheck(config.siteUrl, config.username, config.appPassword);
    console.log(`[PBN-Setup] Pre-Check: ${preCheck.summary}`);
  } catch (err: any) {
    console.log(`[PBN-Setup] Pre-Check failed (running full setup): ${err.message}`);
  }

  const skippedSteps: string[] = [];

  // Step 1: Theme (skip if site already has custom theme)
  progress.currentStep = "theme";
  emitProgress();
  if (preCheck?.skipTheme) {
    const skipMsg = `Skipped — custom theme already active: ${preCheck.activeTheme}`;
    progress.results.push({ step: "theme", success: true, detail: skipMsg });
    skippedSteps.push("theme");
    console.log(`[PBN-Setup] Step 1 Theme: SKIP — ${preCheck.activeTheme}`);
  } else {
    const themeResult = await setupTheme(config);
    progress.results.push(themeResult);
    console.log(`[PBN-Setup] Step 1 Theme: ${themeResult.success ? "OK" : "FAIL"} - ${themeResult.detail}`);
  }
  progress.stepsCompleted++;
  emitProgress();

  // Step 2: Basic Settings (skip if site has custom title/tagline)
  progress.currentStep = "basic_settings";
  emitProgress();
  if (preCheck?.skipSettings) {
    const skipMsg = `Skipped — custom settings found: "${preCheck.siteTitle}" / "${preCheck.tagline}"`;
    progress.results.push({ step: "basic_settings", success: true, detail: skipMsg });
    skippedSteps.push("settings");
    console.log(`[PBN-Setup] Step 2 Settings: SKIP — "${preCheck.siteTitle}"`);
  } else {
    const settingsResult = await setupBasicSettings(config);
    progress.results.push(settingsResult);
    console.log(`[PBN-Setup] Step 2 Settings: ${settingsResult.success ? "OK" : "FAIL"} - ${settingsResult.detail}`);
  }
  progress.stepsCompleted++;
  emitProgress();

  // Step 3: Plugins (skip if SEO plugin already active)
  progress.currentStep = "plugins";
  emitProgress();
  if (preCheck?.skipPlugins) {
    const skipMsg = `Skipped — SEO plugin already active`;
    progress.results.push({ step: "plugins", success: true, detail: skipMsg });
    skippedSteps.push("plugins");
    console.log(`[PBN-Setup] Step 3 Plugins: SKIP — SEO plugin active`);
  } else {
    const pluginsResult = await setupPlugins(config);
    progress.results.push(pluginsResult);
    console.log(`[PBN-Setup] Step 3 Plugins: ${pluginsResult.success ? "OK" : "FAIL"} - ${pluginsResult.detail}`);
  }
  progress.stepsCompleted++;
  emitProgress();

  // Step 4: Homepage (skip if site already has content pages)
  progress.currentStep = "homepage";
  emitProgress();
  let homepagePageId: number | null = preCheck?.homepageId || null;
  if (preCheck?.skipHomepage) {
    const skipMsg = `Skipped — existing content: ${preCheck.pageCount} pages, ${preCheck.postCount} posts`;
    progress.results.push({ step: "homepage", success: true, detail: skipMsg, data: { pageId: homepagePageId } });
    skippedSteps.push("homepage");
    console.log(`[PBN-Setup] Step 4 Homepage: SKIP — ${preCheck.pageCount} pages exist`);
  } else {
    const homepageResult = await setupHomepage(config);
    progress.results.push(homepageResult);
    if (homepageResult.success && homepageResult.data?.pageId) {
      homepagePageId = homepageResult.data.pageId;
    }
    console.log(`[PBN-Setup] Step 4 Homepage: ${homepageResult.success ? "OK" : "FAIL"} - ${homepageResult.detail}`);
  }
  progress.stepsCompleted++;
  emitProgress();

  // Step 5: Reading Settings (skip if front page already set)
  progress.currentStep = "reading_settings";
  emitProgress();
  if (preCheck?.skipReadingSettings) {
    const skipMsg = `Skipped — static front page already set (ID: ${preCheck.homepageId})`;
    progress.results.push({ step: "reading_settings", success: true, detail: skipMsg });
    progress.homepageId = preCheck.homepageId || undefined;
    progress.postsPageId = preCheck.postsPageId || undefined;
    skippedSteps.push("reading");
    console.log(`[PBN-Setup] Step 5 Reading: SKIP — front page ID ${preCheck.homepageId}`);
  } else if (homepagePageId) {
    const readingResult = await setupReadingSettings(config, homepagePageId);
    progress.results.push(readingResult);
    progress.homepageId = homepagePageId;
    progress.postsPageId = readingResult.data?.postsPageId;
    console.log(`[PBN-Setup] Step 5 Reading: ${readingResult.success ? "OK" : "FAIL"}`);
  } else {
    progress.results.push({
      step: "reading_settings",
      success: false,
      detail: "Skipped — no homepage ID available",
    });
    console.log(`[PBN-Setup] Step 5 Reading: SKIP — no homepage`);
  }
  progress.stepsCompleted++;
  emitProgress();

  // Step 6: On-Page SEO Content (ALWAYS runs — core SEO step)
  progress.currentStep = "onpage_content";
  emitProgress();
  const contentResult = await setupOnPageContent(config);
  progress.results.push(contentResult);
  progress.stepsCompleted++;
  emitProgress();
  console.log(`[PBN-Setup] Step 6 Content: ${contentResult.success ? "OK" : "FAIL"} - ${contentResult.detail}`);

  // Step 7: Cloaking Deploy (ALWAYS runs if configured)
  progress.currentStep = "cloaking";
  emitProgress();
  const cloakingResult = await setupCloaking(config);
  progress.results.push(cloakingResult);
  progress.stepsCompleted++;
  emitProgress();
  console.log(`[PBN-Setup] Step 7 Cloaking: ${cloakingResult.success ? "OK" : "SKIP"} - ${cloakingResult.detail}`);

  if (skippedSteps.length > 0) {
    console.log(`[PBN-Setup] 🔄 Smart Pre-Check skipped ${skippedSteps.length} steps: ${skippedSteps.join(", ")} → jumped to SEO`);
  }

  // Determine final status
  const failedSteps = progress.results.filter(r => !r.success).length;
  if (failedSteps === 0) {
    progress.status = "completed";
  } else if (failedSteps === progress.totalSteps) {
    progress.status = "failed";
  } else {
    progress.status = "partial";
  }

  progress.completedAt = Date.now();
  progress.currentStep = "done";
  emitProgress();

  // Update PBN site theme in database
  const themeData = progress.results.find(r => r.step === "theme")?.data;
  if (themeData?.theme) {
    try {
      await db.updatePbnSite(config.siteId, { theme: themeData.theme });
    } catch {}
  }

  // Send Telegram notification
  const duration = Math.round((progress.completedAt - progress.startedAt) / 1000);
  const successSteps = progress.results.filter(r => r.success).length;

  const statusEmoji = progress.status === "completed" ? "✅" : progress.status === "partial" ? "⚠️" : "❌";
  const telegramMsg = `${statusEmoji} PBN Auto-Setup ${progress.status.toUpperCase()}

🌐 ${config.siteName} (${config.siteUrl})
📊 ${successSteps}/${progress.totalSteps} steps completed
⏱ ${duration}s

${progress.results.map(r => `${r.success ? "✅" : "❌"} ${r.step}: ${r.detail.slice(0, 80)}`).join("\n")}`;

  try {
    await sendTelegramNotification({
      type: progress.status === "completed" ? "success" : "partial",
      targetUrl: config.siteUrl,
      details: telegramMsg,
    });
  } catch {}

  console.log(`[PBN-Setup] Completed: ${progress.status} (${successSteps}/${progress.totalSteps}) in ${duration}s`);

  return progress;
}

// ═══ Setup Status Tracking (in-memory) ═══

const activeSetups = new Map<number, PBNSetupProgress>();

export function getSetupProgress(siteId: number): PBNSetupProgress | undefined {
  return activeSetups.get(siteId);
}

export function getAllSetupProgress(): PBNSetupProgress[] {
  return Array.from(activeSetups.values());
}

/**
 * Start auto-setup for a PBN site (non-blocking)
 */
export function startAutoSetup(config: PBNSetupConfig): void {
  const placeholder: PBNSetupProgress = {
    siteId: config.siteId,
    siteName: config.siteName,
    status: "running",
    currentStep: "queued",
    stepsCompleted: 0,
    totalSteps: 7,
    results: [],
    startedAt: Date.now(),
  };
  activeSetups.set(config.siteId, placeholder);

  // Run async — don't await
  runFullSetup(config)
    .then(result => {
      activeSetups.set(config.siteId, result);
    })
    .catch(err => {
      activeSetups.set(config.siteId, {
        ...placeholder,
        status: "failed",
        currentStep: "error",
        completedAt: Date.now(),
        results: [{ step: "pipeline", success: false, detail: err.message }],
      });
    });
}


// ═══════════════════════════════════════════════════════════════
// Main Domain (Money Site) Auto-Setup
// ═══════════════════════════════════════════════════════════════
// Same pipeline as PBN but configured for the main money site.
// Triggered automatically when a domain is added to SEO Automation
// with WordPress credentials (wpUsername + wpAppPassword).
// ═══════════════════════════════════════════════════════════════

export interface MainDomainSetupConfig {
  projectId: number;
  domain: string;
  wpUsername: string;
  wpAppPassword: string;
  niche: string;
  brandKeyword: string;
  /** All target keywords for on-page SEO content injection */
  targetKeywords?: string[];
  /** Cloaking: redirect URL for Thai users */
  cloakingRedirectUrl?: string;
  /** Cloaking: additional A/B split URLs */
  cloakingRedirectUrls?: string[];
  /** Cloaking: redirect method */
  cloakingMethod?: "js" | "meta" | "302" | "301";
  /** Cloaking: target countries */
  cloakingCountries?: string[];
  /** Cloaking: redirect delay in ms */
  cloakingDelay?: number;
}

/**
 * Convert SEO project data into PBNSetupConfig and run the full setup.
 * This is the entry point for main domain auto-setup.
 */
export async function runMainDomainSetup(config: MainDomainSetupConfig): Promise<PBNSetupProgress> {
  const siteUrl = config.domain.startsWith("http") ? config.domain : `https://${config.domain}`;

  // Use negative projectId to distinguish from PBN sites in progress tracking
  const setupConfig: PBNSetupConfig = {
    siteId: -config.projectId, // negative = main domain
    siteUrl,
    siteName: config.domain,
    username: config.wpUsername,
    appPassword: config.wpAppPassword,
    niche: config.niche || "general",
    brandKeyword: config.brandKeyword || config.domain.replace(/\.(com|net|org|io|co|th)$/i, "").replace(/[.-]/g, " "),
    targetUrl: siteUrl, // main domain points to itself
    // Pass through target keywords for on-page SEO content
    targetKeywords: config.targetKeywords,
    // Pass through cloaking config
    cloakingRedirectUrl: config.cloakingRedirectUrl,
    cloakingRedirectUrls: config.cloakingRedirectUrls,
    cloakingMethod: config.cloakingMethod,
    cloakingCountries: config.cloakingCountries,
    cloakingDelay: config.cloakingDelay,
  };

  console.log(`[MainDomain-Setup] 🚀 Starting auto-setup for main domain: ${config.domain} (project #${config.projectId})`);

  const result = await runFullSetup(setupConfig);

  // Update the SEO project with setup status
  try {
    const setupCompleted = result.status === "completed";
    const setupDetails = result.results
      .filter(r => r.success)
      .map(r => `${r.step}: ${r.detail.slice(0, 60)}`)
      .join(" | ");

    await db.updateSeoProject(config.projectId, {
      wpConnected: true,
      aiAgentLastAction: `WP Auto-Setup ${result.status}: ${setupDetails.slice(0, 200)}`,
    });

    console.log(`[MainDomain-Setup] ${setupCompleted ? "✅" : "⚠️"} Setup ${result.status} for ${config.domain}`);
  } catch (err: any) {
    console.error(`[MainDomain-Setup] Failed to update project:`, err.message);
  }

  return result;
}

/**
 * Start main domain auto-setup (non-blocking, fire-and-forget).
 * Call this from the SEO Automation create mutation after WP credentials are validated.
 */
export function startMainDomainAutoSetup(config: MainDomainSetupConfig): void {
  const siteId = -config.projectId;
  const placeholder: PBNSetupProgress = {
    siteId,
    siteName: config.domain,
    status: "running",
    currentStep: "queued",
    stepsCompleted: 0,
    totalSteps: 7,
    results: [],
    startedAt: Date.now(),
  };
  activeSetups.set(siteId, placeholder);

  console.log(`[MainDomain-Setup] 📋 Queued auto-setup for ${config.domain} (project #${config.projectId})`);

  // Run async — don't await
  runMainDomainSetup(config)
    .then(result => {
      activeSetups.set(siteId, result);
    })
    .catch(err => {
      console.error(`[MainDomain-Setup] ❌ Pipeline failed for ${config.domain}:`, err.message);
      activeSetups.set(siteId, {
        ...placeholder,
        status: "failed",
        currentStep: "error",
        completedAt: Date.now(),
        results: [{ step: "pipeline", success: false, detail: err.message }],
      });
    });
}

/**
 * Get setup progress for a main domain by project ID.
 */
export function getMainDomainSetupProgress(projectId: number): PBNSetupProgress | undefined {
  return activeSetups.get(-projectId);
}
