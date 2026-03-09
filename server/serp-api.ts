/**
 * SerpAPI Client
 * 
 * Provides real Google SERP data for rank tracking.
 * 
 * API Docs: https://serpapi.com/search-api
 * Auth: api_key query parameter
 * 
 * Uses SERPAPI_KEY_DEV for all searches
 */

import { ENV } from "./_core/env";

const SERPAPI_BASE_URL = "https://serpapi.com/search.json";

export interface SerpResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
  displayedLink: string;
}

export interface SerpData {
  keyword: string;
  location: string;
  results: SerpResult[];
  totalResults: number | null;
  searchTime: number | null;
  relatedSearches: string[];
  source: "serpapi";
}

/**
 * Get the SerpAPI key
 */
function getApiKey(): string | null {
  return ENV.serpApiKey || null;
}

/**
 * Search Google via SerpAPI and get organic results
 */
export async function searchGoogle(
  keyword: string,
  options: {
    location?: string;
    gl?: string;      // country code (e.g., "th" for Thailand)
    hl?: string;      // language (e.g., "th" for Thai)
    num?: number;     // number of results (default 10, max 100)
    device?: "desktop" | "mobile" | "tablet";
  } = {},
): Promise<SerpData | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[SerpAPI] No API key available (SERPAPI_KEY_DEV)");
    return null;
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    engine: "google",
    q: keyword,
    num: String(options.num || 100),
  });

  if (options.location) params.set("location", options.location);
  if (options.gl) params.set("gl", options.gl);
  if (options.hl) params.set("hl", options.hl);
  if (options.device) params.set("device", options.device);

  try {
    const response = await fetch(`${SERPAPI_BASE_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[SerpAPI] HTTP ${response.status}: ${errorText.substring(0, 300)}`);
      return null;
    }

    const data = await response.json();

    const organicResults: SerpResult[] = (data.organic_results || []).map((r: any) => ({
      position: r.position ?? 0,
      title: r.title ?? "",
      link: r.link ?? "",
      snippet: r.snippet ?? "",
      displayedLink: r.displayed_link ?? "",
    }));

    const relatedSearches: string[] = (data.related_searches || []).map((r: any) => r.query || "");

    return {
      keyword,
      location: options.location || "global",
      results: organicResults,
      totalResults: data.search_information?.total_results ?? null,
      searchTime: data.search_information?.time_taken_displayed ?? null,
      relatedSearches,
      source: "serpapi",
    };
  } catch (err: any) {
    console.error(`[SerpAPI] Error searching "${keyword}": ${err.message}`);
    return null;
  }
}

/**
 * Find the rank position of a specific domain for a keyword
 */
export async function findDomainRank(
  keyword: string,
  domain: string,
  options: {
    location?: string;
    gl?: string;
    hl?: string;
    num?: number;
  } = {},
): Promise<{
  position: number | null;
  url: string | null;
  title: string | null;
  totalResults: number | null;
  topResults: SerpResult[];
} | null> {
  const serpData = await searchGoogle(keyword, { ...options, num: options.num || 100 });
  if (!serpData) return null;

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();

  // Find the domain in results
  const match = serpData.results.find(r => {
    const resultDomain = r.link.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    return resultDomain === cleanDomain || resultDomain.endsWith(`.${cleanDomain}`);
  });

  return {
    position: match?.position ?? null,
    url: match?.link ?? null,
    title: match?.title ?? null,
    totalResults: serpData.totalResults,
    topResults: serpData.results.slice(0, 10), // Return top 10 for context
  };
}

/**
 * Track multiple keywords for a domain
 */
export async function trackKeywords(
  domain: string,
  keywords: string[],
  options: {
    location?: string;
    gl?: string;
    hl?: string;
  } = {},
): Promise<{
  keyword: string;
  position: number | null;
  url: string | null;
  totalResults: number | null;
}[]> {
  const results: {
    keyword: string;
    position: number | null;
    url: string | null;
    totalResults: number | null;
  }[] = [];

  // Process sequentially to avoid rate limits
  for (const keyword of keywords) {
    const rank = await findDomainRank(keyword, domain, options);
    results.push({
      keyword,
      position: rank?.position ?? null,
      url: rank?.url ?? null,
      totalResults: rank?.totalResults ?? null,
    });

    // Small delay between requests to be respectful
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}

/**
 * Get SerpAPI account info (remaining searches, plan, etc.)
 */
export async function getAccountInfo(): Promise<{
  plan: string;
  searchesPerMonth: number;
  thisMonthUsage: number;
  remaining: number;
} | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetch(`https://serpapi.com/account.json?api_key=${apiKey}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return {
      plan: data.plan_name || "unknown",
      searchesPerMonth: data.searches_per_month ?? 0,
      thisMonthUsage: data.this_month_usage ?? 0,
      remaining: (data.searches_per_month ?? 0) - (data.this_month_usage ?? 0),
    };
  } catch {
    return null;
  }
}
