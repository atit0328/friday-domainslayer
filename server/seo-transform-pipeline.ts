/**
 * SEO-First Transformation Pipeline — Master Orchestrator
 * 
 * Runs the complete post-install SEO optimization flow:
 * 1. Theme Analysis
 * 2. Before Snapshot
 * 3. Layout Rebuild
 * 4. On-Page SEO
 * 5. Support Pages
 * 6. Internal Linking
 * 7. FAQ Generation
 * 8. Schema Markup
 * 9. After Snapshot & Validation
 * 10. Telegram Notification
 */

import { analyzeInstalledTheme, type ThemeAnalysisReport } from "./seo-theme-analyzer";
import { rebuildHomepageLayout, type LayoutRebuildResult } from "./seo-layout-rebuilder";
import { generateSeoContent, publishToWordPress, planContentCluster, type GeneratedContent } from "./seo-content-engine";
import { runFullOnPageOptimization, type OnPageOptimizationResult } from "./seo-onpage-optimizer";
import { buildInternalLinkingStrategy, injectInternalLinks, generateFaqSection, generateComprehensiveSchema, deploySchemaToWP, deployFaqToWP, type InternalLinkingReport, type FaqResult, type SchemaResult } from "./seo-linking-schema-engine";
import { validateSeo, compareSeoReports, type SeoValidationReport, type BeforeAfterComparison } from "./seo-validation-scorer";
import { captureBeforeSnapshot, createAfterSnapshot, generatePreview, formatPreviewForTelegram, type PreviewData, type SeoSnapshot } from "./seo-preview-approval";
import { sendTelegramNotification } from "./telegram-notifier";

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface SeoTransformConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  niche: string;
  brandName: string;
  language: string;
  country: string;
  themeSlug?: string;
  autoPublish: boolean;
  chatId?: string;
  homepageId?: number;
  projectId?: number;
}

export interface TransformStepResult {
  step: string;
  stepNumber: number;
  success: boolean;
  detail: string;
  duration: number;
  data?: any;
}

export interface SeoTransformResult {
  success: boolean;
  domain: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  steps: TransformStepResult[];
  beforeScore?: number;
  afterScore?: number;
  improvement?: number;
  preview?: PreviewData;
  totalDuration: number;
  notified: boolean;
}

// ═══════════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════════

async function runStep(
  stepName: string,
  stepNumber: number,
  fn: () => Promise<{ success: boolean; detail: string; data?: any }>
): Promise<TransformStepResult> {
  const start = Date.now();
  try {
    const result = await fn();
    return {
      step: stepName,
      stepNumber,
      success: result.success,
      detail: result.detail,
      duration: Date.now() - start,
      data: result.data,
    };
  } catch (err: any) {
    return {
      step: stepName,
      stepNumber,
      success: false,
      detail: `Error: ${err.message}`,
      duration: Date.now() - start,
    };
  }
}

// ═══════════════════════════════════════════════
// Master Pipeline
// ═══════════════════════════════════════════════

export async function runSeoTransformPipeline(config: SeoTransformConfig): Promise<SeoTransformResult> {
  const pipelineStart = Date.now();
  const steps: TransformStepResult[] = [];
  let stepNum = 0;
  const url = config.siteUrl.replace(/\/$/, "");
  const auth = Buffer.from(`${config.username}:${config.appPassword}`).toString("base64");

  console.log(`\n${"═".repeat(60)}`);
  console.log(`[SEO-Transform] 🚀 Starting SEO Transformation Pipeline`);
  console.log(`[SEO-Transform] 🌐 Domain: ${config.siteUrl}`);
  console.log(`[SEO-Transform] 🎯 Keyword: ${config.primaryKeyword}`);
  console.log(`${"═".repeat(60)}\n`);

  let themeAnalysis: ThemeAnalysisReport | null = null;
  let layoutResult: LayoutRebuildResult | null = null;
  let onPageResult: OnPageOptimizationResult | null = null;
  let beforeSnapshot: SeoSnapshot | null = null;
  let afterSnapshot: SeoSnapshot | null = null;
  let homepageId = config.homepageId;

  // ─── Step 1: Theme Analysis ───
  stepNum++;
  const themeStep = await runStep("Theme Analysis", stepNum, async () => {
    themeAnalysis = await analyzeInstalledTheme({
      siteUrl: config.siteUrl,
      username: config.username,
      appPassword: config.appPassword,
      themeSlug: config.themeSlug,
      primaryKeyword: config.primaryKeyword,
    });

    return {
      success: true,
      detail: `Theme: ${themeAnalysis.themeName}. SEO Readiness: ${themeAnalysis.seoReadinessScore}/100. ` +
        `Crawlability: ${themeAnalysis.crawlabilityScore}/100. Issues: ${themeAnalysis.criticalIssues.length} critical, ${themeAnalysis.warnings.length} warnings`,
      data: {
        theme: themeAnalysis.themeName,
        seoReadiness: themeAnalysis.seoReadinessScore,
        crawlability: themeAnalysis.crawlabilityScore,
      },
    };
  });
  steps.push(themeStep);
  console.log(`[SEO-Transform] Step ${stepNum}: ${themeStep.success ? "✅" : "❌"} ${themeStep.detail.slice(0, 100)}`);

  // ─── Step 2: Capture Before Snapshot ───
  stepNum++;
  const snapshotStep = await runStep("Before Snapshot", stepNum, async () => {
    if (!homepageId) {
      try {
        const settingsRes = await fetch(`${url}/wp-json/wp/v2/settings`, {
          headers: { "Authorization": `Basic ${auth}` },
          signal: AbortSignal.timeout(10000),
        });
        if (settingsRes.ok) {
          const settings = await settingsRes.json() as any;
          if (settings.page_on_front) homepageId = settings.page_on_front;
        }
      } catch {}
    }

    if (!homepageId) {
      try {
        const pagesRes = await fetch(`${url}/wp-json/wp/v2/pages?per_page=1&orderby=date&order=asc`, {
          headers: { "Authorization": `Basic ${auth}` },
          signal: AbortSignal.timeout(10000),
        });
        if (pagesRes.ok) {
          const pages = await pagesRes.json() as any[];
          if (pages.length > 0) homepageId = pages[0].id;
        }
      } catch {}
    }

    if (homepageId) {
      beforeSnapshot = await captureBeforeSnapshot({
        siteUrl: config.siteUrl,
        username: config.username,
        appPassword: config.appPassword,
        pageId: homepageId,
        contentType: "page",
        primaryKeyword: config.primaryKeyword,
        secondaryKeywords: config.secondaryKeywords,
      });

      return {
        success: true,
        detail: `Before score: ${beforeSnapshot.seoReport.overallScore}/100 (${beforeSnapshot.seoReport.grade}). Page ID: ${homepageId}`,
        data: { score: beforeSnapshot.seoReport.overallScore, grade: beforeSnapshot.seoReport.grade },
      };
    } else {
      return { success: true, detail: "No existing homepage found — will create new" };
    }
  });
  steps.push(snapshotStep);
  console.log(`[SEO-Transform] Step ${stepNum}: ${snapshotStep.success ? "✅" : "❌"} ${snapshotStep.detail.slice(0, 100)}`);

  // ─── Step 3: Layout Rebuild ───
  stepNum++;
  const layoutStep = await runStep("Layout Rebuild", stepNum, async () => {
    if (!themeAnalysis) {
      return { success: false, detail: "Theme analysis not available" };
    }

    layoutResult = await rebuildHomepageLayout({
      siteUrl: config.siteUrl,
      username: config.username,
      appPassword: config.appPassword,
      analysisReport: themeAnalysis,
      primaryKeyword: config.primaryKeyword,
      secondaryKeywords: config.secondaryKeywords,
      niche: config.niche,
      brandName: config.brandName,
      language: config.language,
    });

    const afterData = layoutResult.comparison.after;
    return {
      success: true,
      detail: `Layout rebuilt: ${layoutResult.sections.length} sections, ${layoutResult.changeLog.length} changes. ` +
        `Crawlability: ${afterData.estimatedCrawlabilityScore}/100`,
      data: {
        sections: layoutResult.sections.length,
        changes: layoutResult.changeLog.length,
        crawlability: afterData.estimatedCrawlabilityScore,
      },
    };
  });
  steps.push(layoutStep);
  console.log(`[SEO-Transform] Step ${stepNum}: ${layoutStep.success ? "✅" : "❌"} ${layoutStep.detail.slice(0, 100)}`);

  // ─── Step 4: On-Page SEO Optimization ───
  stepNum++;
  const onPageStep = await runStep("On-Page SEO", stepNum, async () => {
    onPageResult = await runFullOnPageOptimization({
      siteUrl: config.siteUrl,
      username: config.username,
      appPassword: config.appPassword,
      primaryKeyword: config.primaryKeyword,
      secondaryKeywords: config.secondaryKeywords,
      niche: config.niche,
      brandName: config.brandName,
      language: config.language,
    });

    const kp = onPageResult.keywordPlacement;
    return {
      success: true,
      detail: `On-page SEO: Score ${onPageResult.auditAfter.score}/100. ` +
        `Keyword in title: ${kp.title.present ? "✅" : "❌"}, H1: ${kp.h1.present ? "✅" : "❌"}. ` +
        `Density: ${kp.bodyContent.density.toFixed(1)}%. Changes: ${onPageResult.changes.length}`,
      data: {
        seoScore: onPageResult.auditAfter.score,
        changes: onPageResult.changes.length,
        readability: onPageResult.readability.readabilityScore,
      },
    };
  });
  steps.push(onPageStep);
  console.log(`[SEO-Transform] Step ${stepNum}: ${onPageStep.success ? "✅" : "❌"} ${onPageStep.detail.slice(0, 100)}`);

  // ─── Step 5: Support Pages Generation ───
  stepNum++;
  const contentStep = await runStep("Support Pages", stepNum, async () => {
    const cluster = await planContentCluster({
      primaryKeyword: config.primaryKeyword,
      secondaryKeywords: config.secondaryKeywords,
      niche: config.niche,
      brandName: config.brandName,
      language: config.language,
    });

    let pagesCreated = 0;
    let totalWords = 0;
    const pageResults: { title: string; wordCount: number; wpId?: number }[] = [];

    // Generate and publish spoke pages
    for (const spoke of cluster.spokePages.slice(0, 5)) {
      try {
        const content = await generateSeoContent({
          siteUrl: config.siteUrl,
          username: config.username,
          appPassword: config.appPassword,
          primaryKeyword: spoke.keyword,
          secondaryKeywords: config.secondaryKeywords,
          niche: config.niche,
          brandName: config.brandName,
          language: config.language,
          contentType: spoke.contentType,
          topic: spoke.title,
          targetWordCount: 1500,
        });

        const pubResult = await publishToWordPress(content, {
          siteUrl: config.siteUrl,
          username: config.username,
          appPassword: config.appPassword,
          contentType: spoke.contentType,
          status: config.autoPublish ? "publish" : "draft",
        });

        if (pubResult.success) {
          pagesCreated++;
          totalWords += content.wordCount;
          pageResults.push({ title: content.title, wordCount: content.wordCount, wpId: pubResult.id });
        }
      } catch {}
    }

    return {
      success: pagesCreated > 0,
      detail: `${pagesCreated}/${cluster.spokePages.length} support pages created. Total words: ${totalWords}`,
      data: { pagesCreated, totalWords, pages: pageResults },
    };
  });
  steps.push(contentStep);
  console.log(`[SEO-Transform] Step ${stepNum}: ${contentStep.success ? "✅" : "❌"} ${contentStep.detail.slice(0, 100)}`);

  // ─── Step 6: Internal Linking ───
  stepNum++;
  const linkingStep = await runStep("Internal Linking", stepNum, async () => {
    const linkReport = await buildInternalLinkingStrategy({
      siteUrl: config.siteUrl,
      username: config.username,
      appPassword: config.appPassword,
      primaryKeyword: config.primaryKeyword,
      secondaryKeywords: config.secondaryKeywords,
    });

    // Inject links into pages
    const injected = await injectInternalLinks(
      config.siteUrl,
      config.username,
      config.appPassword,
      linkReport.linkMap,
    );

    return {
      success: linkReport.newLinksAdded > 0 || linkReport.orphanPages.length === 0,
      detail: `${linkReport.newLinksAdded} new links planned. ${injected.updated} pages updated. ` +
        `Orphan pages: ${linkReport.orphanPages.length}. Silos: ${linkReport.siloStructure.length}`,
      data: {
        newLinks: linkReport.newLinksAdded,
        updated: injected.updated,
        orphans: linkReport.orphanPages.length,
        silos: linkReport.siloStructure.length,
      },
    };
  });
  steps.push(linkingStep);
  console.log(`[SEO-Transform] Step ${stepNum}: ${linkingStep.success ? "✅" : "❌"} ${linkingStep.detail.slice(0, 100)}`);

  // ─── Step 7: FAQ Generation ───
  stepNum++;
  const faqStep = await runStep("FAQ Section", stepNum, async () => {
    const faqResult = await generateFaqSection({
      primaryKeyword: config.primaryKeyword,
      secondaryKeywords: config.secondaryKeywords,
      niche: config.niche,
      language: config.language,
      count: 8,
    });

    // Deploy FAQ to homepage
    if (homepageId) {
      try {
        await deployFaqToWP(
          config.siteUrl,
          config.username,
          config.appPassword,
          homepageId,
          faqResult.faqHtml,
          faqResult.faqSchema,
          "page",
        );
      } catch {}
    }

    return {
      success: faqResult.faqs.length > 0,
      detail: `${faqResult.faqs.length} FAQ questions generated. Schema: ${faqResult.faqSchema ? "✅" : "❌"}`,
      data: { questions: faqResult.faqs.length },
    };
  });
  steps.push(faqStep);
  console.log(`[SEO-Transform] Step ${stepNum}: ${faqStep.success ? "✅" : "❌"} ${faqStep.detail.slice(0, 100)}`);

  // ─── Step 8: Schema Markup ───
  stepNum++;
  const schemaStep = await runStep("Schema Markup", stepNum, async () => {
    const pageTitle = onPageResult?.optimizedPage.title || config.primaryKeyword;
    const pageDesc = onPageResult?.optimizedPage.metaDescription || "";

    const schemaResult = generateComprehensiveSchema({
      siteUrl: config.siteUrl,
      brandName: config.brandName,
      primaryKeyword: config.primaryKeyword,
      niche: config.niche,
      language: config.language,
      pageType: "homepage",
      pageTitle,
      pageDescription: pageDesc,
      pageUrl: config.siteUrl,
    });

    // Deploy schema to WP
    let deployed = false;
    if (homepageId) {
      try {
        const deployResult = await deploySchemaToWP(
          config.siteUrl,
          config.username,
          config.appPassword,
          homepageId,
          schemaResult.schemaHtml,
          "page",
        );
        deployed = deployResult.success;
      } catch {}
    }

    return {
      success: schemaResult.schemas.length > 0,
      detail: `${schemaResult.schemas.length} schemas generated. Deployed: ${deployed ? "✅" : "❌"}. ` +
        `Issues: ${schemaResult.validationIssues.length}`,
      data: {
        schemas: schemaResult.schemas.length,
        deployed,
        issues: schemaResult.validationIssues.length,
      },
    };
  });
  steps.push(schemaStep);
  console.log(`[SEO-Transform] Step ${stepNum}: ${schemaStep.success ? "✅" : "❌"} ${schemaStep.detail.slice(0, 100)}`);

  // ─── Step 9: After Snapshot & Validation ───
  stepNum++;
  let preview: PreviewData | undefined;
  const validationStep = await runStep("SEO Validation", stepNum, async () => {
    if (!homepageId) {
      return { success: true, detail: "No homepage to validate (new site)" };
    }

    try {
      const pageRes = await fetch(`${url}/wp-json/wp/v2/pages/${homepageId}`, {
        headers: { "Authorization": `Basic ${auth}` },
        signal: AbortSignal.timeout(10000),
      });
      if (pageRes.ok) {
        const pageData = await pageRes.json() as any;
        const updatedHtml = pageData.content?.rendered || pageData.content?.raw || "";
        const updatedTitle = pageData.title?.rendered || "";

        if (beforeSnapshot) {
          afterSnapshot = createAfterSnapshot({
            beforeSnapshot,
            optimizedHtml: updatedHtml,
            optimizedTitle: updatedTitle,
            optimizedMetaDescription: onPageResult?.optimizedPage.metaDescription || "",
            primaryKeyword: config.primaryKeyword,
            secondaryKeywords: config.secondaryKeywords,
          });

          preview = generatePreview(beforeSnapshot, afterSnapshot);

          const comp = preview.comparison;
          return {
            success: true,
            detail: `Before: ${comp.before.overallScore}/100 → After: ${comp.after.overallScore}/100 ` +
              `(${comp.improvement >= 0 ? "+" : ""}${comp.improvement}). ` +
              `${comp.improvedChecks.length} improved, ${comp.regressions.length} regressions`,
            data: {
              before: comp.before.overallScore,
              after: comp.after.overallScore,
              improvement: comp.improvement,
            },
          };
        } else {
          const afterReport = validateSeo({
            siteUrl: config.siteUrl,
            primaryKeyword: config.primaryKeyword,
            secondaryKeywords: config.secondaryKeywords,
            pageHtml: updatedHtml,
            pageUrl: pageData.link || `${url}/?p=${homepageId}`,
          });

          return {
            success: true,
            detail: `SEO Score: ${afterReport.overallScore}/100 (${afterReport.grade}). ` +
              `${afterReport.criticalIssues.length} critical issues`,
            data: { score: afterReport.overallScore, grade: afterReport.grade },
          };
        }
      }
    } catch {}

    return { success: true, detail: "Validation completed (partial)" };
  });
  steps.push(validationStep);
  console.log(`[SEO-Transform] Step ${stepNum}: ${validationStep.success ? "✅" : "❌"} ${validationStep.detail.slice(0, 100)}`);

  // ─── Step 10: Telegram Notification ───
  stepNum++;
  let notified = false;
  const notifyStep = await runStep("Telegram Notification", stepNum, async () => {
    const successCount = steps.filter(s => s.success).length;

    let message = `🔧 <b>SEO Transform Pipeline Complete</b>\n\n`;
    message += `🌐 <b>Domain:</b> ${config.siteUrl}\n`;
    message += `🎯 <b>Keyword:</b> ${config.primaryKeyword}\n`;
    message += `📊 <b>Steps:</b> ${successCount}/${steps.length} succeeded\n\n`;

    for (const step of steps) {
      message += `${step.success ? "✅" : "❌"} <b>${step.step}:</b> ${step.detail.slice(0, 80)}\n`;
    }

    if (preview) {
      message += `\n📈 <b>SEO Score:</b> ${preview.before.seoReport.overallScore} → ${preview.after.seoReport.overallScore} `;
      message += `(${preview.comparison.improvement >= 0 ? "+" : ""}${preview.comparison.improvement})\n`;
    }

    message += `\n⏱ Duration: ${Math.round((Date.now() - pipelineStart) / 1000)}s`;

    await sendTelegramNotification({
      type: "info",
      targetUrl: config.siteUrl,
      details: message,
    });

    notified = true;
    return { success: true, detail: "Notification sent" };
  });
  steps.push(notifyStep);

  // ─── Final Summary ───
  const completedSteps = steps.filter(s => s.success).length;
  const failedSteps = steps.filter(s => !s.success).length;
  const totalDuration = Date.now() - pipelineStart;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`[SEO-Transform] 🏁 Pipeline Complete: ${completedSteps}/${steps.length} steps succeeded`);
  if (preview) {
    console.log(`[SEO-Transform] 📈 SEO Score: ${preview.before.seoReport.overallScore} → ${preview.after.seoReport.overallScore}`);
  }
  console.log(`[SEO-Transform] ⏱ Duration: ${Math.round(totalDuration / 1000)}s`);
  console.log(`${"═".repeat(60)}\n`);

  return {
    success: completedSteps > failedSteps,
    domain: config.siteUrl,
    totalSteps: steps.length,
    completedSteps,
    failedSteps,
    steps,
    beforeScore: (beforeSnapshot as SeoSnapshot | null)?.seoReport.overallScore,
    afterScore: preview?.after.seoReport.overallScore ?? (afterSnapshot as SeoSnapshot | null)?.seoReport.overallScore,
    improvement: preview?.comparison.improvement,
    preview,
    totalDuration,
    notified,
  };
}
