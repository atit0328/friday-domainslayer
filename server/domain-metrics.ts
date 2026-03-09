/**
 * Real Domain Metrics Fetcher
 * 
 * Fetches actual SEO metrics for domains using:
 * 1. SimilarWeb API (built-in) — real global rank, traffic, bounce rate
 * 2. Wayback Machine API — archive snapshots count + first/last capture
 * 3. Web scraping — check if site is live, SSL, headers, content quality
 * 4. DNS/WHOIS estimation — domain age from Wayback first capture
 * 5. Google Index check — estimate indexed pages
 * 6. Formula-based scoring — calculate DA/DR/SS from real signals (NOT AI guessing)
 * 
 * Key principle: Use REAL data from APIs. Where real data is unavailable,
 * use transparent formula-based calculations, NOT LLM guessing.
 */

import axios from "axios";
import { scrapeWebsite, type ScrapedContent } from "./web-scraper";
import { callDataApi } from "./_core/dataApi";
import { getMozMetrics } from "./moz-api";
import { getAhrefsDomainRating } from "./ahrefs-api";

// ═══ Types ═══

export interface DomainMetrics {
  domain: string;
  // Authority metrics — Moz API (real) with formula fallback
  da: number;          // Domain Authority (0-100) — Moz API real value
  pa: number;          // Page Authority (0-100) — Moz API real value
  ss: number;          // Spam Score (0-100, lower is better) — Moz API real value
  dr: number;          // Domain Rating (0-100) — Ahrefs or formula-based
  // Link metrics — Moz API (real) with formula fallback
  bl: number;          // Total Backlinks — Moz pages_to_root_domain or estimated
  rf: number;          // Referring Domains — Moz root_domains_to_root_domain or estimated
  tf: number;          // Trust Flow (0-100) — calculated from SSL + age + content quality
  cf: number;          // Citation Flow (0-100) — calculated from rank + traffic volume
  // Real API data
  globalRank: number;  // SimilarWeb global rank (real)
  totalVisits: number; // SimilarWeb total visits (real)
  bounceRate: number;  // SimilarWeb bounce rate (real)
  // Index metrics
  indexedPages: number; // Estimated indexed pages
  waybackSnapshots: number; // Wayback Machine snapshots (real)
  waybackFirstCapture: string | null; // First capture date (real)
  waybackLastCapture: string | null;  // Last capture date (real)
  // Domain info
  domainAge: string;   // Estimated age from Wayback
  domainAgeYears: number; // Numeric age in years
  tld: string;
  isLive: boolean;
  hasSSL: boolean;
  // Content metrics (from real scraping)
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  imagesTotal: number;
  imagesWithAlt: number;
  // Technical (from real scraping)
  loadTimeMs: number;
  serverHeader: string;
  statusCode: number;
  // Overall
  healthScore: number; // 0-100 — formula-based
  riskLevel: "low" | "medium" | "high" | "critical";
  // Data sources transparency
  dataSources: {
    moz: boolean;         // Did we get Moz API data? (DA, PA, SS, Backlinks)
    mozSpamScore: boolean; // true = SS from Moz API, false = formula estimate
    ahrefs: boolean;      // Did we get Ahrefs API data? (DR)
    similarweb: boolean;  // Did we get SimilarWeb data?
    wayback: boolean;     // Did we get Wayback data?
    scraping: boolean;    // Did we get scraping data?
    googleIndex: boolean; // Did we get Google index data?
  };
  // Raw data
  scrapedData: Partial<ScrapedContent> | null;
  fetchedAt: string;
}

export interface WaybackData {
  snapshots: number;
  firstCapture: string | null;
  lastCapture: string | null;
  available: boolean;
}

interface SimilarWebData {
  globalRank: number;
  totalVisits: number;
  bounceRate: number;
  available: boolean;
}

// ═══ SimilarWeb API (Real Data) ═══

async function fetchSimilarWebData(domain: string): Promise<SimilarWebData> {
  const defaultResult: SimilarWebData = { globalRank: 0, totalVisits: 0, bounceRate: 0, available: false };
  
  try {
    // Fetch global rank
    const rankResult = await callDataApi("Similarweb/get_global_rank", {
      pathParams: { domain },
      query: { main_domain_only: "false" },
    }) as any;
    
    let globalRank = 0;
    // Response format: { global_rank: [{ date: "2026-03", global_rank: 1 }] }
    if (rankResult?.global_rank && Array.isArray(rankResult.global_rank)) {
      const latest = rankResult.global_rank[rankResult.global_rank.length - 1];
      globalRank = latest?.global_rank || 0;
    } else if (typeof rankResult?.global_rank === "number") {
      globalRank = rankResult.global_rank;
    }

    // Fetch total visits
    let totalVisits = 0;
    try {
      const visitsResult = await callDataApi("Similarweb/get_visits_total", {
        pathParams: { domain },
        query: { 
          main_domain_only: "false",
          country: "world",
          granularity: "monthly",
        },
      }) as any;
      
      // Response format: { visits: [{ date: "2026-01-01", visits: 33719934410 }] }
      if (visitsResult?.visits && Array.isArray(visitsResult.visits)) {
        const latest = visitsResult.visits[visitsResult.visits.length - 1];
        totalVisits = Math.round(latest?.visits || 0);
      } else if (typeof visitsResult?.visits === "number") {
        totalVisits = Math.round(visitsResult.visits);
      }
    } catch (e: any) {
      console.log(`[DomainMetrics] SimilarWeb visits failed for ${domain}: ${e.message}`);
    }

    // Fetch bounce rate
    let bounceRate = 0;
    try {
      const bounceResult = await callDataApi("Similarweb/get_bounce_rate", {
        pathParams: { domain },
        query: { 
          main_domain_only: "false",
          country: "world",
          granularity: "monthly",
        },
      }) as any;
      
      // Response format: { bounce_rate: [{ date: "2026-01-01", bounce_rate: 0.28 }] }
      if (bounceResult?.bounce_rate && Array.isArray(bounceResult.bounce_rate)) {
        const latest = bounceResult.bounce_rate[bounceResult.bounce_rate.length - 1];
        bounceRate = latest?.bounce_rate || 0;
      } else if (typeof bounceResult?.bounce_rate === "number") {
        bounceRate = bounceResult.bounce_rate;
      }
    } catch (e: any) {
      console.log(`[DomainMetrics] SimilarWeb bounce rate failed for ${domain}: ${e.message}`);
    }

    return {
      globalRank,
      totalVisits,
      bounceRate,
      available: globalRank > 0 || totalVisits > 0,
    };
  } catch (error: any) {
    console.log(`[DomainMetrics] SimilarWeb fetch failed for ${domain}: ${error.message}`);
    return defaultResult;
  }
}

// ═══ Wayback Machine API (Real Data) ═══

export async function fetchWaybackData(domain: string): Promise<WaybackData> {
  try {
    const WAYBACK_TIMEOUT = 20000; // 20s timeout for Wayback (slow API)
    
    // Run all Wayback requests in parallel for speed
    const [availResponse, countResponse, firstResp, lastResp] = await Promise.allSettled([
      axios.get(`https://archive.org/wayback/available?url=${encodeURIComponent(domain)}`, { timeout: WAYBACK_TIMEOUT }),
      axios.get(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}/*&output=json&limit=0&showNumPages=true`, { timeout: WAYBACK_TIMEOUT }),
      axios.get(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&output=json&limit=1&fl=timestamp&sort=asc`, { timeout: WAYBACK_TIMEOUT }),
      axios.get(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&output=json&limit=1&fl=timestamp&sort=desc`, { timeout: WAYBACK_TIMEOUT }),
    ]);
    
    // Parse snapshot count
    // CDX API with output=json returns [["numpages"],["822"]] format
    // CDX API with output=text returns just "822"
    let snapshotCount = 0;
    if (countResponse.status === "fulfilled") {
      const d = countResponse.value.data;
      if (typeof d === "number") {
        snapshotCount = d;
      } else if (Array.isArray(d) && d.length >= 2 && Array.isArray(d[1])) {
        // JSON format: [["numpages"],["822"]]
        snapshotCount = parseInt(String(d[1][0]), 10) || 0;
      } else {
        snapshotCount = parseInt(String(d), 10) || 0;
      }
    }
    
    // Parse availability
    const snapshot = availResponse.status === "fulfilled" 
      ? availResponse.value.data?.archived_snapshots?.closest : null;
    
    // Parse first/last capture dates
    let firstCapture: string | null = null;
    let lastCapture: string | null = null;
    
    if (firstResp.status === "fulfilled" && Array.isArray(firstResp.value.data) && firstResp.value.data.length > 1) {
      const ts = firstResp.value.data[1]?.[0];
      if (ts) firstCapture = formatWaybackTimestamp(ts);
    }
    if (lastResp.status === "fulfilled" && Array.isArray(lastResp.value.data) && lastResp.value.data.length > 1) {
      const ts = lastResp.value.data[1]?.[0];
      if (ts) lastCapture = formatWaybackTimestamp(ts);
    }

    return {
      snapshots: snapshotCount,
      firstCapture,
      lastCapture,
      available: !!snapshot?.available,
    };
  } catch (error: any) {
    console.error(`[DomainMetrics] Wayback fetch failed for ${domain}:`, error.message);
    return { snapshots: 0, firstCapture: null, lastCapture: null, available: false };
  }
}

function formatWaybackTimestamp(ts: string): string {
  if (ts.length >= 8) {
    return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
  }
  return ts;
}

// ═══ Google Index Estimation ═══

async function estimateGoogleIndex(domain: string): Promise<number> {
  try {
    // Use SerpAPI for reliable Google index estimation
    const { searchGoogle } = await import("./serp-api");
    const serpData = await searchGoogle(`site:${domain}`);
    
    if (serpData && serpData.totalResults != null && serpData.totalResults > 0) {
      return serpData.totalResults;
    }
    
    // Fallback: count organic results as minimum
    if (serpData && serpData.results.length > 0) {
      return serpData.results.length;
    }
    
    return 0;
  } catch {
    // Fallback to direct Google scraping if SerpAPI fails
    try {
      const response = await axios.get(`https://www.google.com/search?q=site:${encodeURIComponent(domain)}&num=1`, {
        timeout: 15000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        maxRedirects: 3,
      });
      
      const html = typeof response.data === "string" ? response.data : "";
      const match = html.match(/About ([\d,]+) results/i) || html.match(/ประมาณ ([\d,]+) ผลลัพธ์/i);
      if (match) {
        return parseInt(match[1].replace(/,/g, ""), 10) || 0;
      }
      if (html.includes("did not match any documents") || html.includes("ไม่ตรงกับเอกสารใดๆ")) {
        return 0;
      }
      return -1;
    } catch {
      return -1;
    }
  }
}

// ═══ Domain Age Calculation ═══

function calculateDomainAge(waybackFirst: string | null): { text: string; years: number } {
  if (waybackFirst) {
    const firstDate = new Date(waybackFirst);
    const now = new Date();
    const years = (now.getTime() - firstDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years >= 1) {
      return { text: `~${Math.floor(years)} years (since ${waybackFirst})`, years: Math.floor(years) };
    }
    const months = Math.floor(years * 12);
    return { text: `~${months} months (since ${waybackFirst})`, years: years };
  }
  return { text: "Unknown", years: 0 };
}

// ═══ Formula-Based Metrics Calculation ═══
// These use REAL signals to calculate scores via transparent formulas.
// No LLM guessing — just math based on actual data.

function calculateDA(
  globalRank: number,
  totalVisits: number,
  domainAgeYears: number,
  waybackSnapshots: number,
  indexedPages: number,
  hasSSL: boolean,
): number {
  let score = 0;

  // Global rank contribution (0-40 points)
  // Rank 1 = 40pts, Rank 100 = 35pts, Rank 10K = 25pts, Rank 100K = 15pts, Rank 1M = 8pts, No rank = 1pt
  if (globalRank > 0) {
    if (globalRank <= 100) score += 40;
    else if (globalRank <= 1000) score += 35;
    else if (globalRank <= 10000) score += 30;
    else if (globalRank <= 50000) score += 25;
    else if (globalRank <= 100000) score += 20;
    else if (globalRank <= 500000) score += 15;
    else if (globalRank <= 1000000) score += 10;
    else score += 5;
  } else {
    score += 1; // No rank data
  }

  // Traffic contribution (0-25 points)
  if (totalVisits > 10000000) score += 25;
  else if (totalVisits > 1000000) score += 20;
  else if (totalVisits > 100000) score += 15;
  else if (totalVisits > 10000) score += 10;
  else if (totalVisits > 1000) score += 5;
  else if (totalVisits > 0) score += 2;

  // Domain age contribution (0-15 points)
  if (domainAgeYears >= 15) score += 15;
  else if (domainAgeYears >= 10) score += 12;
  else if (domainAgeYears >= 5) score += 9;
  else if (domainAgeYears >= 3) score += 6;
  else if (domainAgeYears >= 1) score += 3;
  else score += 1;

  // Wayback presence (0-10 points)
  if (waybackSnapshots > 10000) score += 10;
  else if (waybackSnapshots > 1000) score += 8;
  else if (waybackSnapshots > 100) score += 5;
  else if (waybackSnapshots > 10) score += 3;
  else if (waybackSnapshots > 0) score += 1;

  // Indexed pages (0-8 points)
  if (indexedPages > 100000) score += 8;
  else if (indexedPages > 10000) score += 6;
  else if (indexedPages > 1000) score += 4;
  else if (indexedPages > 100) score += 2;
  else if (indexedPages > 0) score += 1;

  // SSL bonus (0-2 points)
  if (hasSSL) score += 2;

  return Math.min(100, Math.max(0, score));
}

function calculateDR(
  globalRank: number,
  totalVisits: number,
  externalLinks: number,
  waybackSnapshots: number,
): number {
  let score = 0;

  // Similar to DA but weighted more toward link signals
  if (globalRank > 0) {
    if (globalRank <= 100) score += 45;
    else if (globalRank <= 1000) score += 38;
    else if (globalRank <= 10000) score += 30;
    else if (globalRank <= 50000) score += 22;
    else if (globalRank <= 100000) score += 16;
    else if (globalRank <= 500000) score += 10;
    else if (globalRank <= 1000000) score += 6;
    else score += 3;
  } else {
    score += 1;
  }

  // External links on page as proxy for backlink profile
  if (externalLinks > 50) score += 15;
  else if (externalLinks > 20) score += 10;
  else if (externalLinks > 10) score += 7;
  else if (externalLinks > 5) score += 4;
  else if (externalLinks > 0) score += 2;

  // Traffic as authority signal
  if (totalVisits > 1000000) score += 20;
  else if (totalVisits > 100000) score += 15;
  else if (totalVisits > 10000) score += 10;
  else if (totalVisits > 1000) score += 5;
  else if (totalVisits > 0) score += 2;

  // Wayback presence
  if (waybackSnapshots > 5000) score += 10;
  else if (waybackSnapshots > 500) score += 7;
  else if (waybackSnapshots > 50) score += 4;
  else if (waybackSnapshots > 0) score += 2;

  return Math.min(100, Math.max(0, score));
}

function calculateSpamScore(
  hasSSL: boolean,
  domainAgeYears: number,
  waybackSnapshots: number,
  isLive: boolean,
  wordCount: number,
  internalLinks: number,
  externalLinks: number,
  imagesWithAlt: number,
  imagesTotal: number,
  loadTimeMs: number,
  statusCode: number,
  tld: string,
  title: string,
  metaDescription: string,
  globalRank: number = 0,
  totalVisits: number = 0,
): number {
  // ═══ FORMULA-BASED SPAM SCORE (used when Moz SS is N/A) ═══
  // This is a FALLBACK estimate — keep it conservative (lower scores)
  // because we don't have authoritative data. Only flag truly suspicious signals.
  let spamPoints = 0;

  // ── CRITICAL spam signals (strong indicators) ──
  // Suspicious TLDs commonly used for spam (+8)
  const spamTLDs = ["xyz", "top", "click", "loan", "work", "gq", "cf", "tk", "ml", "ga", "pw", "cc"];
  if (spamTLDs.includes(tld.toLowerCase())) spamPoints += 8;

  // Site not live / unreachable (+6)
  if (!isLive) spamPoints += 6;

  // Non-200 status code when reachable (+4)
  if (statusCode !== 200 && statusCode !== 0 && isLive) spamPoints += 4;

  // ── MODERATE spam signals (contextual) ──
  // No SSL (+4) — many legitimate small sites still lack SSL
  if (!hasSSL) spamPoints += 4;

  // Very new domain < 6 months (+3)
  if (domainAgeYears < 0.5) spamPoints += 3;

  // No Wayback history at all (+3)
  if (waybackSnapshots === 0) spamPoints += 3;

  // Too many external links relative to content = link farm pattern (+5)
  if (wordCount > 0 && externalLinks > wordCount / 10) spamPoints += 5;
  else if (externalLinks > 200) spamPoints += 3;

  // ── MINOR quality signals (not spam per se, just low quality) ──
  // Thin content (+2) — only if site is live but has almost nothing
  if (isLive && wordCount < 30 && totalVisits < 50000) spamPoints += 2;

  // No title (+1)
  if (isLive && (!title || title.length < 3)) spamPoints += 1;

  // No meta description (+1)
  if (isLive && (!metaDescription || metaDescription.length < 5)) spamPoints += 1;

  // ═══ TRUST BONUS: Reduce score for established/popular sites ═══
  // SimilarWeb rank bonus
  if (globalRank > 0 && globalRank <= 100) spamPoints -= 20;
  else if (globalRank > 0 && globalRank <= 1000) spamPoints -= 15;
  else if (globalRank > 0 && globalRank <= 10000) spamPoints -= 10;
  else if (globalRank > 0 && globalRank <= 100000) spamPoints -= 7;
  else if (globalRank > 0 && globalRank <= 500000) spamPoints -= 4;
  else if (globalRank > 0) spamPoints -= 2; // Any rank = some legitimacy

  // Traffic bonus
  if (totalVisits > 10000000) spamPoints -= 10;
  else if (totalVisits > 1000000) spamPoints -= 7;
  else if (totalVisits > 100000) spamPoints -= 4;
  else if (totalVisits > 10000) spamPoints -= 2;

  // Domain age bonus — older domains are less likely spam
  if (domainAgeYears >= 10) spamPoints -= 5;
  else if (domainAgeYears >= 5) spamPoints -= 3;
  else if (domainAgeYears >= 2) spamPoints -= 1;

  // Wayback history bonus — well-archived sites are legitimate
  if (waybackSnapshots > 1000) spamPoints -= 3;
  else if (waybackSnapshots > 100) spamPoints -= 2;
  else if (waybackSnapshots > 10) spamPoints -= 1;

  // SSL bonus
  if (hasSSL) spamPoints -= 1;

  return Math.min(100, Math.max(0, spamPoints));
}

function calculateTrustFlow(
  hasSSL: boolean,
  domainAgeYears: number,
  waybackSnapshots: number,
  globalRank: number,
  bounceRate: number,
): number {
  let score = 0;

  // SSL = trust (+15)
  if (hasSSL) score += 15;

  // Domain age = trust
  if (domainAgeYears >= 10) score += 25;
  else if (domainAgeYears >= 5) score += 20;
  else if (domainAgeYears >= 3) score += 15;
  else if (domainAgeYears >= 1) score += 8;
  else score += 2;

  // Wayback presence = established
  if (waybackSnapshots > 5000) score += 20;
  else if (waybackSnapshots > 500) score += 15;
  else if (waybackSnapshots > 50) score += 10;
  else if (waybackSnapshots > 5) score += 5;

  // Good rank = trusted
  if (globalRank > 0 && globalRank <= 10000) score += 25;
  else if (globalRank > 0 && globalRank <= 100000) score += 18;
  else if (globalRank > 0 && globalRank <= 500000) score += 12;
  else if (globalRank > 0) score += 5;

  // Low bounce rate = quality content
  if (bounceRate > 0 && bounceRate < 0.3) score += 15;
  else if (bounceRate > 0 && bounceRate < 0.5) score += 10;
  else if (bounceRate > 0 && bounceRate < 0.7) score += 5;

  return Math.min(100, Math.max(0, score));
}

function calculateCitationFlow(
  globalRank: number,
  totalVisits: number,
  externalLinks: number,
  waybackSnapshots: number,
): number {
  let score = 0;

  // Rank = visibility
  if (globalRank > 0 && globalRank <= 1000) score += 35;
  else if (globalRank > 0 && globalRank <= 10000) score += 28;
  else if (globalRank > 0 && globalRank <= 100000) score += 20;
  else if (globalRank > 0 && globalRank <= 1000000) score += 12;
  else if (globalRank > 0) score += 5;

  // Traffic volume
  if (totalVisits > 10000000) score += 30;
  else if (totalVisits > 1000000) score += 22;
  else if (totalVisits > 100000) score += 15;
  else if (totalVisits > 10000) score += 8;
  else if (totalVisits > 0) score += 3;

  // External links as citation proxy
  if (externalLinks > 50) score += 15;
  else if (externalLinks > 20) score += 10;
  else if (externalLinks > 5) score += 5;

  // Wayback = established presence
  if (waybackSnapshots > 1000) score += 10;
  else if (waybackSnapshots > 100) score += 6;
  else if (waybackSnapshots > 10) score += 3;

  return Math.min(100, Math.max(0, score));
}

function estimateBacklinks(
  globalRank: number,
  totalVisits: number,
  externalLinks: number,
  indexedPages: number,
): number {
  // Rough estimation based on rank and traffic correlation
  // This is an estimate, not exact data
  let estimate = 0;

  if (globalRank > 0) {
    // Inverse relationship: lower rank = more backlinks
    if (globalRank <= 100) estimate = 50000000;
    else if (globalRank <= 1000) estimate = 5000000;
    else if (globalRank <= 10000) estimate = 500000;
    else if (globalRank <= 50000) estimate = 50000;
    else if (globalRank <= 100000) estimate = 10000;
    else if (globalRank <= 500000) estimate = 2000;
    else if (globalRank <= 1000000) estimate = 500;
    else estimate = 100;
  }

  // Adjust based on traffic
  if (totalVisits > 1000000) estimate = Math.max(estimate, 100000);
  else if (totalVisits > 100000) estimate = Math.max(estimate, 10000);
  else if (totalVisits > 10000) estimate = Math.max(estimate, 1000);

  // Minimum based on indexed pages
  if (indexedPages > 1000) estimate = Math.max(estimate, indexedPages * 2);
  else if (indexedPages > 100) estimate = Math.max(estimate, indexedPages);

  return Math.max(0, estimate);
}

function estimateReferringDomains(backlinks: number): number {
  // Typically referring domains are 5-20% of total backlinks
  if (backlinks > 1000000) return Math.round(backlinks * 0.05);
  if (backlinks > 100000) return Math.round(backlinks * 0.08);
  if (backlinks > 10000) return Math.round(backlinks * 0.1);
  if (backlinks > 1000) return Math.round(backlinks * 0.15);
  return Math.round(backlinks * 0.2);
}

function calculateHealthScore(
  isLive: boolean,
  hasSSL: boolean,
  loadTimeMs: number,
  wordCount: number,
  title: string,
  metaDescription: string,
  imagesWithAlt: number,
  imagesTotal: number,
  internalLinks: number,
  spamScore: number,
): number {
  let score = 0;

  // Site is live (+20)
  if (isLive) score += 20;

  // SSL (+15)
  if (hasSSL) score += 15;

  // Load time (+15)
  if (loadTimeMs > 0 && loadTimeMs < 1000) score += 15;
  else if (loadTimeMs > 0 && loadTimeMs < 3000) score += 10;
  else if (loadTimeMs > 0 && loadTimeMs < 5000) score += 5;

  // Content quality (+15)
  if (wordCount > 1000) score += 15;
  else if (wordCount > 500) score += 10;
  else if (wordCount > 200) score += 5;

  // Title present (+10)
  if (title && title.length >= 10 && title.length <= 70) score += 10;
  else if (title && title.length > 0) score += 5;

  // Meta description (+10)
  if (metaDescription && metaDescription.length >= 50 && metaDescription.length <= 160) score += 10;
  else if (metaDescription && metaDescription.length > 0) score += 5;

  // Image alt text (+5)
  if (imagesTotal > 0) {
    const altRatio = imagesWithAlt / imagesTotal;
    if (altRatio >= 0.8) score += 5;
    else if (altRatio >= 0.5) score += 3;
  } else {
    score += 3; // No images is neutral
  }

  // Internal links (+5)
  if (internalLinks > 10) score += 5;
  else if (internalLinks > 3) score += 3;

  // Spam penalty (-points)
  if (spamScore > 50) score -= 15;
  else if (spamScore > 30) score -= 10;
  else if (spamScore > 15) score -= 5;

  return Math.min(100, Math.max(0, score));
}

function determineRiskLevel(spamScore: number, healthScore: number): "low" | "medium" | "high" | "critical" {
  if (spamScore >= 60 || healthScore < 20) return "critical";
  if (spamScore >= 40 || healthScore < 40) return "high";
  if (spamScore >= 20 || healthScore < 60) return "medium";
  return "low";
}

// ═══ Main: Fetch All Domain Metrics ═══

export async function fetchDomainMetrics(domain: string): Promise<DomainMetrics> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const tld = cleanDomain.split(".").pop() || "";
  const fetchedAt = new Date().toISOString();

  console.log(`[DomainMetrics] Fetching real metrics for ${cleanDomain}...`);

  // Run ALL fetches in parallel — Moz + Ahrefs + SimilarWeb + Wayback + Scraping + Google Index
  const [mozData, ahrefsData, similarWebData, waybackData, scrapedResult, indexedPages] = await Promise.all([
    getMozMetrics(cleanDomain).catch(() => null),
    getAhrefsDomainRating(cleanDomain).catch(() => null),
    fetchSimilarWebData(cleanDomain),
    fetchWaybackData(cleanDomain),
    scrapeWebsite(`https://${cleanDomain}`).catch(() => 
      scrapeWebsite(`http://${cleanDomain}`).catch(() => null)
    ),
    estimateGoogleIndex(cleanDomain),
  ]);

  const scraped = scrapedResult as ScrapedContent | null;

  // Calculate domain age from Wayback data
  const domainAge = calculateDomainAge(waybackData.firstCapture);
  
  // Extract real scraped values
  const isLive = scraped?.statusCode === 200;
  const hasSSL = scraped?.hasSSL ?? false;
  const wordCount = scraped?.wordCount ?? 0;
  const internalLinks = scraped?.links?.internal ?? 0;
  const externalLinks = scraped?.links?.external ?? 0;
  const imagesTotal = scraped?.images?.total ?? 0;
  const imagesWithAlt = scraped?.images?.withAlt ?? 0;
  const loadTimeMs = scraped?.loadTimeMs ?? 0;
  const title = scraped?.title ?? "";
  const metaDescription = scraped?.metaDescription ?? "";
  const realIndexedPages = indexedPages === -1 ? 0 : indexedPages;

  // ═══ Use REAL Moz API data when available, formula as fallback ═══
  const hasMoz = mozData !== null;
  const hasAhrefs = ahrefsData !== null;

  // DA: Moz API (real) → formula fallback
  const da = hasMoz ? mozData.domainAuthority : calculateDA(
    similarWebData.globalRank, similarWebData.totalVisits,
    domainAge.years, waybackData.snapshots, realIndexedPages, hasSSL
  );

  // PA: Moz API (real) → 0 fallback
  const pa = hasMoz ? mozData.pageAuthority : 0;

  // SS: Moz API (real) → formula fallback
  // Moz spam_score is 1-100 or -1 (N/A)
  const mozSpamValid = hasMoz && mozData.spamScore >= 0;
  const ss = mozSpamValid ? mozData.spamScore : calculateSpamScore(
    hasSSL, domainAge.years, waybackData.snapshots, isLive,
    wordCount, internalLinks, externalLinks, imagesWithAlt, imagesTotal,
    loadTimeMs, scraped?.statusCode ?? 0, tld, title, metaDescription,
    similarWebData.globalRank, similarWebData.totalVisits
  );

  // DR: Ahrefs API (real) → formula fallback
  const dr = hasAhrefs ? ahrefsData.domainRating : calculateDR(
    similarWebData.globalRank, similarWebData.totalVisits,
    externalLinks, waybackData.snapshots
  );

  // BL: Moz pages_to_root_domain (real) → formula fallback
  const bl = hasMoz && mozData.pagesToRootDomain > 0 
    ? mozData.pagesToRootDomain 
    : estimateBacklinks(similarWebData.globalRank, similarWebData.totalVisits, externalLinks, realIndexedPages);

  // RF: Moz root_domains_to_root_domain (real) → formula fallback
  const rf = hasMoz && mozData.rootDomainsToRootDomain > 0
    ? mozData.rootDomainsToRootDomain
    : estimateReferringDomains(bl);

  const tf = calculateTrustFlow(
    hasSSL, domainAge.years, waybackData.snapshots,
    similarWebData.globalRank, similarWebData.bounceRate
  );

  const cf = calculateCitationFlow(
    similarWebData.globalRank, similarWebData.totalVisits,
    externalLinks, waybackData.snapshots
  );

  const healthScore = calculateHealthScore(
    isLive, hasSSL, loadTimeMs, wordCount, title, metaDescription,
    imagesWithAlt, imagesTotal, internalLinks, ss
  );

  const riskLevel = determineRiskLevel(ss, healthScore);

  const sourceLabel = (s: string, real: boolean) => real ? `${s}(real)` : `${s}(est)`;
  console.log(`[DomainMetrics] ${cleanDomain}: DA=${da}${sourceLabel(" Moz", hasMoz)} PA=${pa} DR=${dr}${sourceLabel(" Ahrefs", hasAhrefs)} SS=${ss}${sourceLabel(" Moz", mozSpamValid)} BL=${bl} RF=${rf} Rank=${similarWebData.globalRank} Visits=${similarWebData.totalVisits}`);

  return {
    domain: cleanDomain,
    da,
    pa,
    dr,
    ss,
    bl,
    rf,
    tf,
    cf,
    globalRank: similarWebData.globalRank,
    totalVisits: similarWebData.totalVisits,
    bounceRate: similarWebData.bounceRate,
    indexedPages: realIndexedPages,
    waybackSnapshots: waybackData.snapshots,
    waybackFirstCapture: waybackData.firstCapture,
    waybackLastCapture: waybackData.lastCapture,
    domainAge: domainAge.text,
    domainAgeYears: domainAge.years,
    tld,
    isLive,
    hasSSL,
    wordCount,
    internalLinks,
    externalLinks,
    imagesTotal,
    imagesWithAlt,
    loadTimeMs,
    serverHeader: scraped?.serverHeader ?? "",
    statusCode: scraped?.statusCode ?? 0,
    healthScore,
    riskLevel,
    dataSources: {
      moz: hasMoz,
      mozSpamScore: mozSpamValid, // true = SS from Moz API, false = formula estimate
      ahrefs: hasAhrefs,
      similarweb: similarWebData.available,
      wayback: waybackData.snapshots > 0 || waybackData.available,
      scraping: scraped !== null,
      googleIndex: indexedPages >= 0,
    },
    scrapedData: scraped ? {
      title: scraped.title,
      metaDescription: scraped.metaDescription,
      metaKeywords: scraped.metaKeywords,
      headings: scraped.headings,
      language: scraped.language,
    } : null,
    fetchedAt,
  };
}
