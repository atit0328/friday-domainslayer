/**
 * SEO Preview & Approval Flow
 * 
 * Handles:
 * 1. Before/after snapshot capture (HTML, screenshots, SEO scores)
 * 2. Preview generation for approval before publishing
 * 3. WordPress publish flow (draft → review → publish)
 * 4. Rollback capability (restore previous version)
 * 5. Change log tracking
 */

import { validateSeo, compareSeoReports, type SeoValidationReport, type BeforeAfterComparison } from "./seo-validation-scorer";

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface SeoSnapshot {
  /** Unique snapshot ID */
  id: string;
  /** Domain */
  domain: string;
  /** Page URL */
  pageUrl: string;
  /** Page ID in WordPress */
  wpPageId?: number;
  /** Content type */
  contentType: "page" | "post";
  /** Raw HTML content */
  html: string;
  /** Page title */
  title: string;
  /** Meta description */
  metaDescription: string;
  /** SEO validation report */
  seoReport: SeoValidationReport;
  /** Timestamp */
  timestamp: string;
  /** Snapshot type */
  type: "before" | "after";
  /** WordPress revision ID (for rollback) */
  wpRevisionId?: number;
}

export interface PreviewData {
  /** Before snapshot */
  before: SeoSnapshot;
  /** After snapshot */
  after: SeoSnapshot;
  /** SEO comparison */
  comparison: BeforeAfterComparison;
  /** Changes summary */
  changesSummary: string[];
  /** Approval status */
  status: "pending" | "approved" | "rejected" | "published" | "rolled_back";
  /** Created at */
  createdAt: string;
}

export interface PublishResult {
  success: boolean;
  pageId?: number;
  pageUrl?: string;
  revisionId?: number;
  error?: string;
}

export interface RollbackResult {
  success: boolean;
  restoredRevisionId?: number;
  error?: string;
}

// ═══════════════════════════════════════════════
// Snapshot Capture
// ═══════════════════════════════════════════════

/**
 * Capture a "before" snapshot of the current page state
 */
export async function captureBeforeSnapshot(config: {
  siteUrl: string;
  username: string;
  appPassword: string;
  pageId: number;
  contentType: "page" | "post";
  primaryKeyword: string;
  secondaryKeywords?: string[];
}): Promise<SeoSnapshot> {
  const { siteUrl, username, appPassword, pageId, contentType, primaryKeyword, secondaryKeywords = [] } = config;
  const url = siteUrl.replace(/\/$/, "");
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const endpoint = contentType === "page" ? "pages" : "posts";

  console.log(`[SEO-Preview] 📸 Capturing BEFORE snapshot for ${contentType} ${pageId}`);

  try {
    // Fetch current page content
    const res = await fetch(`${url}/wp-json/wp/v2/${endpoint}/${pageId}`, {
      headers: { "Authorization": `Basic ${auth}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Cannot fetch ${contentType} ${pageId}: HTTP ${res.status}`);
    }

    const pageData = await res.json() as any;
    const html = pageData.content?.rendered || pageData.content?.raw || "";
    const title = pageData.title?.rendered || "";
    const pageUrl = pageData.link || `${url}/?p=${pageId}`;

    // Extract meta description from Yoast or content
    let metaDescription = "";
    try {
      const pageRes = await fetch(pageUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)" },
        signal: AbortSignal.timeout(15000),
      });
      if (pageRes.ok) {
        const fullHtml = await pageRes.text();
        const metaMatch = fullHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*?)["']/i);
        metaDescription = metaMatch?.[1] || "";
      }
    } catch {}

    // Run SEO validation
    const seoReport = validateSeo({
      siteUrl,
      primaryKeyword,
      secondaryKeywords,
      pageHtml: html,
      pageUrl,
    });

    // Get latest revision ID for rollback
    let wpRevisionId: number | undefined;
    try {
      const revRes = await fetch(`${url}/wp-json/wp/v2/${endpoint}/${pageId}/revisions?per_page=1`, {
        headers: { "Authorization": `Basic ${auth}` },
        signal: AbortSignal.timeout(10000),
      });
      if (revRes.ok) {
        const revisions = await revRes.json() as any[];
        if (revisions.length > 0) {
          wpRevisionId = revisions[0].id;
        }
      }
    } catch {}

    const snapshot: SeoSnapshot = {
      id: `before_${pageId}_${Date.now()}`,
      domain: siteUrl,
      pageUrl,
      wpPageId: pageId,
      contentType,
      html,
      title,
      metaDescription,
      seoReport,
      timestamp: new Date().toISOString(),
      type: "before",
      wpRevisionId,
    };

    console.log(`[SEO-Preview] ✅ Before snapshot: SEO ${seoReport.overallScore}/100 (${seoReport.grade})`);
    return snapshot;
  } catch (err: any) {
    throw new Error(`Failed to capture before snapshot: ${err.message}`);
  }
}

/**
 * Create an "after" snapshot from optimized content
 */
export function createAfterSnapshot(config: {
  beforeSnapshot: SeoSnapshot;
  optimizedHtml: string;
  optimizedTitle: string;
  optimizedMetaDescription: string;
  primaryKeyword: string;
  secondaryKeywords?: string[];
}): SeoSnapshot {
  const { beforeSnapshot, optimizedHtml, optimizedTitle, optimizedMetaDescription, primaryKeyword, secondaryKeywords = [] } = config;

  console.log(`[SEO-Preview] 📸 Creating AFTER snapshot`);

  const seoReport = validateSeo({
    siteUrl: beforeSnapshot.domain,
    primaryKeyword,
    secondaryKeywords,
    pageHtml: optimizedHtml,
    pageUrl: beforeSnapshot.pageUrl,
  });

  const snapshot: SeoSnapshot = {
    id: `after_${beforeSnapshot.wpPageId}_${Date.now()}`,
    domain: beforeSnapshot.domain,
    pageUrl: beforeSnapshot.pageUrl,
    wpPageId: beforeSnapshot.wpPageId,
    contentType: beforeSnapshot.contentType,
    html: optimizedHtml,
    title: optimizedTitle,
    metaDescription: optimizedMetaDescription,
    seoReport,
    timestamp: new Date().toISOString(),
    type: "after",
  };

  console.log(`[SEO-Preview] ✅ After snapshot: SEO ${seoReport.overallScore}/100 (${seoReport.grade})`);
  return snapshot;
}

// ═══════════════════════════════════════════════
// Preview Generation
// ═══════════════════════════════════════════════

/**
 * Generate a before/after preview for approval
 */
export function generatePreview(before: SeoSnapshot, after: SeoSnapshot): PreviewData {
  console.log(`[SEO-Preview] 🔍 Generating before/after preview`);

  const comparison = compareSeoReports(before.seoReport, after.seoReport);

  const changesSummary: string[] = [];

  // Title change
  if (before.title !== after.title) {
    changesSummary.push(`Title: "${before.title}" → "${after.title}"`);
  }

  // Meta description change
  if (before.metaDescription !== after.metaDescription) {
    changesSummary.push(`Meta Description: changed`);
  }

  // Content length change
  const beforeWords = before.html.replace(/<[^>]+>/g, " ").split(/\s+/).length;
  const afterWords = after.html.replace(/<[^>]+>/g, " ").split(/\s+/).length;
  if (Math.abs(afterWords - beforeWords) > 50) {
    changesSummary.push(`Word count: ${beforeWords} → ${afterWords} (${afterWords > beforeWords ? "+" : ""}${afterWords - beforeWords})`);
  }

  // SEO score change
  changesSummary.push(`SEO Score: ${before.seoReport.overallScore} → ${after.seoReport.overallScore} (${comparison.improvement >= 0 ? "+" : ""}${comparison.improvement})`);

  // Category changes
  for (const cat of after.seoReport.categories) {
    const beforeCat = before.seoReport.categories.find(c => c.name === cat.name);
    if (beforeCat && Math.abs(cat.score - beforeCat.score) > 5) {
      changesSummary.push(`${cat.name}: ${beforeCat.score} → ${cat.score}`);
    }
  }

  // Improvements
  if (comparison.improvedChecks.length > 0) {
    changesSummary.push(`✅ ${comparison.improvedChecks.length} checks improved`);
  }

  // Regressions
  if (comparison.regressions.length > 0) {
    changesSummary.push(`⚠️ ${comparison.regressions.length} checks regressed`);
  }

  return {
    before,
    after,
    comparison,
    changesSummary,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════
// Publish Flow
// ═══════════════════════════════════════════════

/**
 * Publish optimized content to WordPress
 */
export async function publishOptimizedContent(config: {
  siteUrl: string;
  username: string;
  appPassword: string;
  pageId: number;
  contentType: "page" | "post";
  optimizedHtml: string;
  optimizedTitle: string;
  optimizedMetaDescription: string;
  optimizedSlug?: string;
  status?: "publish" | "draft";
}): Promise<PublishResult> {
  const { siteUrl, username, appPassword, pageId, contentType, optimizedHtml, optimizedTitle, optimizedMetaDescription, optimizedSlug, status = "publish" } = config;
  const url = siteUrl.replace(/\/$/, "");
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const endpoint = contentType === "page" ? "pages" : "posts";

  console.log(`[SEO-Preview] 🚀 Publishing optimized content to ${contentType} ${pageId}`);

  try {
    const body: any = {
      content: optimizedHtml,
      title: optimizedTitle,
      status,
    };

    if (optimizedSlug) body.slug = optimizedSlug;

    // Update Yoast meta if available
    body.meta = {
      _yoast_wpseo_metadesc: optimizedMetaDescription,
      _yoast_wpseo_title: optimizedTitle,
    };

    const res = await fetch(`${url}/wp-json/wp/v2/${endpoint}/${pageId}`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const result = await res.json() as any;

    // Get the new revision ID
    let revisionId: number | undefined;
    try {
      const revRes = await fetch(`${url}/wp-json/wp/v2/${endpoint}/${pageId}/revisions?per_page=1`, {
        headers: { "Authorization": `Basic ${auth}` },
        signal: AbortSignal.timeout(10000),
      });
      if (revRes.ok) {
        const revisions = await revRes.json() as any[];
        if (revisions.length > 0) revisionId = revisions[0].id;
      }
    } catch {}

    console.log(`[SEO-Preview] ✅ Published: ${result.link} (revision: ${revisionId})`);
    return {
      success: true,
      pageId: result.id,
      pageUrl: result.link,
      revisionId,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Publish as draft for review before going live
 */
export async function publishAsDraft(config: {
  siteUrl: string;
  username: string;
  appPassword: string;
  pageId: number;
  contentType: "page" | "post";
  optimizedHtml: string;
  optimizedTitle: string;
  optimizedMetaDescription: string;
}): Promise<PublishResult> {
  return publishOptimizedContent({ ...config, status: "draft" });
}

// ═══════════════════════════════════════════════
// Rollback Flow
// ═══════════════════════════════════════════════

/**
 * Rollback to a previous WordPress revision
 */
export async function rollbackToRevision(config: {
  siteUrl: string;
  username: string;
  appPassword: string;
  pageId: number;
  contentType: "page" | "post";
  revisionId: number;
}): Promise<RollbackResult> {
  const { siteUrl, username, appPassword, pageId, contentType, revisionId } = config;
  const url = siteUrl.replace(/\/$/, "");
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const endpoint = contentType === "page" ? "pages" : "posts";

  console.log(`[SEO-Preview] ⏪ Rolling back ${contentType} ${pageId} to revision ${revisionId}`);

  try {
    // Fetch the revision content
    const revRes = await fetch(`${url}/wp-json/wp/v2/${endpoint}/${pageId}/revisions/${revisionId}`, {
      headers: { "Authorization": `Basic ${auth}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!revRes.ok) {
      return { success: false, error: `Cannot fetch revision ${revisionId}: HTTP ${revRes.status}` };
    }

    const revision = await revRes.json() as any;

    // Restore the revision content
    const updateRes = await fetch(`${url}/wp-json/wp/v2/${endpoint}/${pageId}`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: revision.content?.rendered || revision.content?.raw || "",
        title: revision.title?.rendered || revision.title?.raw || "",
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!updateRes.ok) {
      return { success: false, error: `Failed to restore revision: HTTP ${updateRes.status}` };
    }

    console.log(`[SEO-Preview] ✅ Rolled back to revision ${revisionId}`);
    return { success: true, restoredRevisionId: revisionId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Rollback using a saved before-snapshot (restore original HTML directly)
 */
export async function rollbackToSnapshot(config: {
  siteUrl: string;
  username: string;
  appPassword: string;
  snapshot: SeoSnapshot;
}): Promise<RollbackResult> {
  const { siteUrl, username, appPassword, snapshot } = config;

  if (!snapshot.wpPageId) {
    return { success: false, error: "Snapshot has no WordPress page ID" };
  }

  // If we have a revision ID, use that
  if (snapshot.wpRevisionId) {
    return rollbackToRevision({
      siteUrl,
      username,
      appPassword,
      pageId: snapshot.wpPageId,
      contentType: snapshot.contentType,
      revisionId: snapshot.wpRevisionId,
    });
  }

  // Otherwise, restore the HTML directly
  const url = siteUrl.replace(/\/$/, "");
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const endpoint = snapshot.contentType === "page" ? "pages" : "posts";

  console.log(`[SEO-Preview] ⏪ Rolling back to snapshot ${snapshot.id}`);

  try {
    const res = await fetch(`${url}/wp-json/wp/v2/${endpoint}/${snapshot.wpPageId}`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: snapshot.html,
        title: snapshot.title,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      return { success: false, error: `Failed to restore snapshot: HTTP ${res.status}` };
    }

    console.log(`[SEO-Preview] ✅ Rolled back to snapshot ${snapshot.id}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════
// Telegram Preview Report
// ═══════════════════════════════════════════════

/**
 * Format preview data as a Telegram message
 */
export function formatPreviewForTelegram(preview: PreviewData): string {
  const { before, after, comparison } = preview;
  const emoji = comparison.improvement > 0 ? "📈" : comparison.improvement < 0 ? "📉" : "➡️";

  let msg = `${emoji} <b>SEO Optimization Preview</b>\n\n`;
  msg += `🌐 <b>Domain:</b> ${before.domain}\n`;
  msg += `📄 <b>Page:</b> ${before.pageUrl}\n\n`;

  msg += `<b>SEO Score:</b>\n`;
  msg += `  Before: ${before.seoReport.overallScore}/100 (${before.seoReport.grade})\n`;
  msg += `  After:  ${after.seoReport.overallScore}/100 (${after.seoReport.grade})\n`;
  msg += `  Change: ${comparison.improvement >= 0 ? "+" : ""}${comparison.improvement} points\n\n`;

  // Category breakdown
  msg += `<b>Category Scores:</b>\n`;
  for (const cat of after.seoReport.categories) {
    const beforeCat = before.seoReport.categories.find(c => c.name === cat.name);
    const beforeScore = beforeCat?.score || 0;
    const delta = cat.score - beforeScore;
    const deltaStr = delta !== 0 ? ` (${delta >= 0 ? "+" : ""}${delta})` : "";
    msg += `  ${cat.name}: ${beforeScore} → ${cat.score}${deltaStr}\n`;
  }

  msg += `\n<b>Changes:</b>\n`;
  for (const change of preview.changesSummary.slice(0, 8)) {
    msg += `  • ${change}\n`;
  }

  if (comparison.improvedChecks.length > 0) {
    msg += `\n<b>✅ Improved (${comparison.improvedChecks.length}):</b>\n`;
    for (const check of comparison.improvedChecks.slice(0, 5)) {
      msg += `  • ${check.name}: ${check.before} → ${check.after}\n`;
    }
  }

  if (comparison.regressions.length > 0) {
    msg += `\n<b>⚠️ Regressions (${comparison.regressions.length}):</b>\n`;
    for (const check of comparison.regressions.slice(0, 5)) {
      msg += `  • ${check.name}: ${check.before} → ${check.after}\n`;
    }
  }

  return msg;
}
