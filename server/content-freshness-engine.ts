/**
 * Content Freshness Engine — Auto-update Content for Google Freshness Signals
 *
 * Google rewards fresh content with higher rankings. This engine:
 *   - Tracks content age and staleness across all deployed pages
 *   - AI rewrites/expands existing content with new data, stats, trends
 *   - Updates Telegraph pages via editPage API
 *   - Refreshes meta descriptions, dates, and adds new sections
 *   - Prioritizes highest-ranking pages (protect rankings)
 *   - Auto-triggers rapid indexing after each refresh
 *   - Runs on a 2-3 day cycle per content piece
 */

import { invokeLLM } from "./_core/llm";
import { sendTelegramNotification } from "./telegram-notifier";
import { rapidIndexUrl } from "./rapid-indexing-engine";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface TrackedContent {
  id: string;
  url: string;
  title: string;
  keyword: string;
  platform: "telegraph" | "web2.0" | "target" | "other";
  originalContent: string;
  currentContent: string;
  telegraphToken?: string; // access_token for Telegraph editPage
  telegraphPath?: string;  // path for Telegraph editPage
  domain: string;
  deployedAt: Date;
  lastRefreshedAt: Date;
  refreshCount: number;
  currentRank: number | null;
  stalenessScore: number; // 0-100 (100 = most stale)
  priority: number; // 1-10 (10 = highest priority to refresh)
  status: "fresh" | "aging" | "stale" | "refreshing" | "error";
}

export interface RefreshResult {
  contentId: string;
  url: string;
  keyword: string;
  previousContent: string;
  newContent: string;
  sectionsAdded: number;
  wordsAdded: number;
  dateUpdated: boolean;
  metaRefreshed: boolean;
  reindexTriggered: boolean;
  refreshedAt: Date;
  success: boolean;
  error?: string;
}

export interface FreshnessConfig {
  domain: string;
  refreshIntervalHours: number; // default 48-72 hours
  maxRefreshesPerCycle: number;
  prioritizeRanking: boolean; // refresh highest-ranking pages first
  addNewSections: boolean;
  updateDates: boolean;
  refreshMetaDescriptions: boolean;
  expandWordCount: boolean;
  minWordsToAdd: number;
  maxWordsToAdd: number;
  language: string;
  niche: string;
}

export interface FreshnessCycleReport {
  cycleId: string;
  domain: string;
  totalTracked: number;
  staleCount: number;
  refreshed: number;
  failed: number;
  totalWordsAdded: number;
  totalSectionsAdded: number;
  reindexed: number;
  startedAt: Date;
  completedAt: Date;
  results: RefreshResult[];
}

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════

const trackedContent = new Map<string, TrackedContent>();
const refreshHistory: RefreshResult[] = [];
const cycleReports: FreshnessCycleReport[] = [];

// ═══════════════════════════════════════════════
//  GETTERS
// ═══════════════════════════════════════════════

export function getTrackedContent(domain?: string): TrackedContent[] {
  const all = Array.from(trackedContent.values());
  if (domain) return all.filter(c => c.domain === domain);
  return all;
}

export function getStaleContent(domain?: string): TrackedContent[] {
  return getTrackedContent(domain).filter(c =>
    c.stalenessScore >= 50 || c.status === "stale" || c.status === "aging"
  );
}

export function getFreshnessSummary(): {
  totalTracked: number;
  fresh: number;
  aging: number;
  stale: number;
  totalRefreshes: number;
  avgStaleness: number;
  lastCycleAt: Date | null;
} {
  const all = Array.from(trackedContent.values());
  const totalStaleness = all.reduce((sum, c) => sum + c.stalenessScore, 0);

  return {
    totalTracked: all.length,
    fresh: all.filter(c => c.status === "fresh").length,
    aging: all.filter(c => c.status === "aging").length,
    stale: all.filter(c => c.status === "stale").length,
    totalRefreshes: refreshHistory.length,
    avgStaleness: all.length > 0 ? totalStaleness / all.length : 0,
    lastCycleAt: cycleReports.length > 0 ? cycleReports[cycleReports.length - 1].completedAt : null,
  };
}

export function getCycleReports(): FreshnessCycleReport[] {
  return cycleReports;
}

// ═══════════════════════════════════════════════
//  CONTENT TRACKING
// ═══════════════════════════════════════════════

/**
 * Register content for freshness tracking
 */
export function trackContent(content: {
  url: string;
  title: string;
  keyword: string;
  platform: TrackedContent["platform"];
  originalContent: string;
  domain: string;
  telegraphToken?: string;
  telegraphPath?: string;
  currentRank?: number | null;
}): TrackedContent {
  const id = `fc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tracked: TrackedContent = {
    id,
    url: content.url,
    title: content.title,
    keyword: content.keyword,
    platform: content.platform,
    originalContent: content.originalContent,
    currentContent: content.originalContent,
    telegraphToken: content.telegraphToken,
    telegraphPath: content.telegraphPath,
    domain: content.domain,
    deployedAt: new Date(),
    lastRefreshedAt: new Date(),
    refreshCount: 0,
    currentRank: content.currentRank ?? null,
    stalenessScore: 0,
    priority: content.currentRank && content.currentRank <= 20 ? 9 : 5,
    status: "fresh",
  };

  trackedContent.set(id, tracked);
  return tracked;
}

/**
 * Update rank for tracked content (called by rank tracker)
 */
export function updateContentRank(contentId: string, rank: number | null): void {
  const content = trackedContent.get(contentId);
  if (content) {
    content.currentRank = rank;
    // Higher priority for ranking content
    if (rank !== null && rank <= 10) content.priority = 10;
    else if (rank !== null && rank <= 20) content.priority = 8;
    else if (rank !== null && rank <= 50) content.priority = 6;
    else content.priority = 4;
  }
}

// ═══════════════════════════════════════════════
//  STALENESS CALCULATION
// ═══════════════════════════════════════════════

/**
 * Calculate staleness score for all tracked content
 */
export function calculateStaleness(): void {
  const now = new Date();

  Array.from(trackedContent.values()).forEach(content => {
    const hoursSinceRefresh = (now.getTime() - content.lastRefreshedAt.getTime()) / (1000 * 60 * 60);

    // Base staleness: 0-100 based on hours since last refresh
    // 0 hours = 0, 48 hours = 50, 72 hours = 75, 96+ hours = 100
    let staleness = Math.min(100, (hoursSinceRefresh / 96) * 100);

    // Boost staleness for content that hasn't been refreshed much
    if (content.refreshCount === 0 && hoursSinceRefresh > 24) {
      staleness = Math.min(100, staleness * 1.2);
    }

    // Reduce staleness for recently ranking content (it's working, be careful)
    if (content.currentRank !== null && content.currentRank <= 10) {
      staleness = Math.max(0, staleness * 0.8); // 20% less stale if ranking well
    }

    content.stalenessScore = Math.round(staleness);

    // Update status
    if (staleness < 30) content.status = "fresh";
    else if (staleness < 60) content.status = "aging";
    else content.status = "stale";
  });
}

// ═══════════════════════════════════════════════
//  AI CONTENT REFRESH
// ═══════════════════════════════════════════════

/**
 * AI generates refreshed content with new sections, updated data, and trends
 */
export async function generateRefreshedContent(
  content: TrackedContent,
  config: FreshnessConfig,
): Promise<{
  newContent: string;
  newTitle: string;
  newMetaDescription: string;
  sectionsAdded: number;
  wordsAdded: number;
}> {
  const currentWordCount = content.currentContent.split(/\s+/).length;
  const targetAddition = Math.min(
    config.maxWordsToAdd,
    Math.max(config.minWordsToAdd, Math.round(currentWordCount * 0.15)),
  );

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an SEO content refresher. Your job is to update existing content to send freshness signals to Google. You must:
1. Add 1-2 new sections with current trends, updated statistics, or new insights
2. Update any outdated information
3. Add a "Last Updated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}" note
4. Refresh the meta description
5. Keep the same tone and style
6. Add approximately ${targetAddition} new words
7. Language: ${config.language}
8. Niche: ${config.niche}

Return JSON with: newContent (full HTML), newTitle, newMetaDescription, sectionsAdded (number), wordsAdded (number)`,
        },
        {
          role: "user",
          content: `Refresh this content for keyword "${content.keyword}":\n\nTitle: ${content.title}\n\nCurrent content (first 2000 chars):\n${content.currentContent.slice(0, 2000)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "refreshed_content",
          strict: true,
          schema: {
            type: "object",
            properties: {
              newContent: { type: "string", description: "Full refreshed HTML content" },
              newTitle: { type: "string", description: "Updated title" },
              newMetaDescription: { type: "string", description: "New meta description (150-160 chars)" },
              sectionsAdded: { type: "integer", description: "Number of new sections added" },
              wordsAdded: { type: "integer", description: "Approximate words added" },
            },
            required: ["newContent", "newTitle", "newMetaDescription", "sectionsAdded", "wordsAdded"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const text = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent) || "{}";
    const parsed = JSON.parse(text);

    return {
      newContent: parsed.newContent || content.currentContent,
      newTitle: parsed.newTitle || content.title,
      newMetaDescription: parsed.newMetaDescription || "",
      sectionsAdded: parsed.sectionsAdded || 0,
      wordsAdded: parsed.wordsAdded || 0,
    };
  } catch (err: any) {
    console.error(`[FreshnessEngine] AI refresh failed for ${content.keyword}:`, err.message);
    // Fallback: add a simple "Last Updated" section
    const updateNote = `\n<p><strong>Last Updated:</strong> ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>`;
    return {
      newContent: content.currentContent + updateNote,
      newTitle: content.title,
      newMetaDescription: "",
      sectionsAdded: 0,
      wordsAdded: 5,
    };
  }
}

// ═══════════════════════════════════════════════
//  TELEGRAPH UPDATER
// ═══════════════════════════════════════════════

/**
 * Update a Telegraph page with refreshed content
 */
export async function updateTelegraphPage(
  content: TrackedContent,
  newHtml: string,
  newTitle: string,
): Promise<boolean> {
  if (!content.telegraphToken || !content.telegraphPath) {
    console.warn(`[FreshnessEngine] No Telegraph token/path for ${content.url}`);
    return false;
  }

  try {
    // Convert HTML to Telegraph nodes
    const nodes = htmlToSimpleNodes(newHtml);

    const res = await fetch("https://api.telegra.ph/editPage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: content.telegraphToken,
        path: content.telegraphPath,
        title: newTitle,
        content: nodes,
        return_content: false,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json() as any;
    if (data.ok) {
      console.log(`[FreshnessEngine] Telegraph updated: ${content.telegraphPath}`);
      return true;
    } else {
      console.error(`[FreshnessEngine] Telegraph edit failed:`, data.error);
      return false;
    }
  } catch (err: any) {
    console.error(`[FreshnessEngine] Telegraph update error:`, err.message);
    return false;
  }
}

/**
 * Convert HTML to simple Telegraph node format
 */
function htmlToSimpleNodes(html: string): any[] {
  const nodes: any[] = [];

  // Split by paragraphs and headings
  const parts = html.split(/<\/?(?:p|h[1-6]|div|ul|ol|li|blockquote)[^>]*>/gi).filter(p => p.trim());

  for (const part of parts) {
    const cleanText = part.replace(/<[^>]+>/g, "").trim();
    if (cleanText) {
      // Check if it was a heading
      if (part.match(/<h[1-3]/i)) {
        nodes.push({ tag: "h3", children: [cleanText] });
      } else if (part.match(/<li/i)) {
        nodes.push({ tag: "li", children: [cleanText] });
      } else if (part.match(/<blockquote/i)) {
        nodes.push({ tag: "blockquote", children: [{ tag: "p", children: [cleanText] }] });
      } else {
        nodes.push({ tag: "p", children: [cleanText] });
      }
    }
  }

  // Ensure at least one node
  if (nodes.length === 0) {
    nodes.push({ tag: "p", children: [html.replace(/<[^>]+>/g, "").trim() || "Updated content"] });
  }

  return nodes;
}

// ═══════════════════════════════════════════════
//  REFRESH SINGLE CONTENT
// ═══════════════════════════════════════════════

/**
 * Refresh a single tracked content piece
 */
export async function refreshContent(
  contentId: string,
  config: FreshnessConfig,
): Promise<RefreshResult> {
  const content = trackedContent.get(contentId);
  if (!content) {
    return {
      contentId,
      url: "",
      keyword: "",
      previousContent: "",
      newContent: "",
      sectionsAdded: 0,
      wordsAdded: 0,
      dateUpdated: false,
      metaRefreshed: false,
      reindexTriggered: false,
      refreshedAt: new Date(),
      success: false,
      error: "Content not found",
    };
  }

  content.status = "refreshing";

  try {
    // 1. Generate refreshed content
    const refreshed = await generateRefreshedContent(content, config);

    // 2. Update Telegraph page if applicable
    let platformUpdated = false;
    if (content.platform === "telegraph" && content.telegraphToken) {
      platformUpdated = await updateTelegraphPage(content, refreshed.newContent, refreshed.newTitle);
    }

    // 3. Trigger rapid indexing
    let reindexed = false;
    try {
      await rapidIndexUrl({
        url: content.url,
        domain: content.domain,
        contentType: content.platform === "telegraph" ? "parasite" : "page",
        priority: content.priority >= 8 ? "high" : "normal",
      });
      reindexed = true;
    } catch {
      // Non-critical
    }

    // 4. Update tracked content state
    const previousContent = content.currentContent;
    content.currentContent = refreshed.newContent;
    content.title = refreshed.newTitle;
    content.lastRefreshedAt = new Date();
    content.refreshCount++;
    content.stalenessScore = 0;
    content.status = "fresh";

    const result: RefreshResult = {
      contentId,
      url: content.url,
      keyword: content.keyword,
      previousContent: previousContent.slice(0, 200),
      newContent: refreshed.newContent.slice(0, 200),
      sectionsAdded: refreshed.sectionsAdded,
      wordsAdded: refreshed.wordsAdded,
      dateUpdated: config.updateDates,
      metaRefreshed: config.refreshMetaDescriptions,
      reindexTriggered: reindexed,
      refreshedAt: new Date(),
      success: true,
    };

    refreshHistory.push(result);
    return result;
  } catch (err: any) {
    content.status = "error";
    const result: RefreshResult = {
      contentId,
      url: content.url,
      keyword: content.keyword,
      previousContent: "",
      newContent: "",
      sectionsAdded: 0,
      wordsAdded: 0,
      dateUpdated: false,
      metaRefreshed: false,
      reindexTriggered: false,
      refreshedAt: new Date(),
      success: false,
      error: err.message,
    };
    refreshHistory.push(result);
    return result;
  }
}

// ═══════════════════════════════════════════════
//  FRESHNESS CYCLE
// ═══════════════════════════════════════════════

/**
 * Run a full freshness refresh cycle for a domain
 */
export async function runFreshnessCycle(
  config: FreshnessConfig,
): Promise<FreshnessCycleReport> {
  const cycleId = `cycle_${Date.now()}`;
  console.log(`[FreshnessEngine] Starting freshness cycle ${cycleId} for ${config.domain}`);

  // 1. Calculate staleness for all content
  calculateStaleness();

  // 2. Get stale content for this domain
  let staleContent = getStaleContent(config.domain);

  // 3. Sort by priority (highest first)
  if (config.prioritizeRanking) {
    staleContent.sort((a, b) => {
      // First by priority (descending)
      if (b.priority !== a.priority) return b.priority - a.priority;
      // Then by staleness (most stale first)
      return b.stalenessScore - a.stalenessScore;
    });
  } else {
    staleContent.sort((a, b) => b.stalenessScore - a.stalenessScore);
  }

  // 4. Limit to max refreshes per cycle
  staleContent = staleContent.slice(0, config.maxRefreshesPerCycle);

  // 5. Refresh each content piece
  const results: RefreshResult[] = [];
  let totalWordsAdded = 0;
  let totalSectionsAdded = 0;
  let reindexed = 0;
  let failed = 0;

  for (const content of staleContent) {
    try {
      const result = await refreshContent(content.id, config);
      results.push(result);

      if (result.success) {
        totalWordsAdded += result.wordsAdded;
        totalSectionsAdded += result.sectionsAdded;
        if (result.reindexTriggered) reindexed++;
      } else {
        failed++;
      }

      // Rate limit between refreshes
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err: any) {
      console.error(`[FreshnessEngine] Refresh failed for ${content.url}:`, err.message);
      failed++;
    }
  }

  const report: FreshnessCycleReport = {
    cycleId,
    domain: config.domain,
    totalTracked: getTrackedContent(config.domain).length,
    staleCount: getStaleContent(config.domain).length,
    refreshed: results.filter(r => r.success).length,
    failed,
    totalWordsAdded,
    totalSectionsAdded,
    reindexed,
    startedAt: new Date(parseInt(cycleId.split("_")[1])),
    completedAt: new Date(),
    results,
  };

  cycleReports.push(report);

  // Telegram notification
  try {
    await sendTelegramNotification({
      type: "success",
      targetUrl: config.domain,
      details: `FRESHNESS CYCLE COMPLETE\nRefreshed: ${report.refreshed}/${staleContent.length}\nWords added: ${totalWordsAdded}\nSections added: ${totalSectionsAdded}\nRe-indexed: ${reindexed}\nFailed: ${failed}`,
    });
  } catch {
    // Non-critical
  }

  console.log(`[FreshnessEngine] Cycle complete: ${report.refreshed} refreshed, ${totalWordsAdded} words added`);

  return report;
}

// ═══════════════════════════════════════════════
//  DEFAULT CONFIG
// ═══════════════════════════════════════════════

export function createDefaultFreshnessConfig(
  domain: string,
  niche: string = "gambling",
  language: string = "th",
): FreshnessConfig {
  return {
    domain,
    refreshIntervalHours: 48, // every 2 days
    maxRefreshesPerCycle: 10,
    prioritizeRanking: true,
    addNewSections: true,
    updateDates: true,
    refreshMetaDescriptions: true,
    expandWordCount: true,
    minWordsToAdd: 50,
    maxWordsToAdd: 300,
    language,
    niche,
  };
}

// ═══════════════════════════════════════════════
//  DAEMON TICK
// ═══════════════════════════════════════════════

/**
 * Called by daemon/orchestrator on schedule to check and refresh stale content
 */
export async function freshnessTick(domain: string): Promise<FreshnessCycleReport | null> {
  calculateStaleness();

  const stale = getStaleContent(domain);
  if (stale.length === 0) {
    console.log(`[FreshnessEngine] No stale content for ${domain}`);
    return null;
  }

  const config = createDefaultFreshnessConfig(domain);
  return runFreshnessCycle(config);
}
