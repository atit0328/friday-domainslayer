/**
 * Ahrefs API Client
 * 
 * Provides real Domain Rating (DR), Ahrefs Rank, Backlinks stats,
 * and organic search metrics.
 * 
 * API v3 Docs: https://docs.ahrefs.com/docs/api/reference/introduction
 * Auth: Bearer token
 * 
 * Endpoints used:
 * - GET /v3/site-explorer/domain-rating — DR + Ahrefs Rank
 * - GET /v3/site-explorer/backlinks-stats — Backlinks count, Referring Domains
 * - GET /v3/site-explorer/metrics — Organic traffic, keywords
 */

import { ENV } from "./_core/env";

const AHREFS_BASE_URL = "https://api.ahrefs.com/v3";

export interface AhrefsMetrics {
  domainRating: number;           // 0-100
  ahrefsRank: number | null;      // Global rank, #1 = strongest
  backlinks: number;
  referringDomains: number;
  followedBacklinks: number;
  followedReferringDomains: number;
  organicTraffic: number | null;
  organicKeywords: number | null;
  source: "ahrefs";
}

/**
 * Helper to make authenticated Ahrefs API requests
 */
async function ahrefsGet<T>(endpoint: string, params: Record<string, string>): Promise<T | null> {
  const token = ENV.ahrefsApiKey;
  if (!token) {
    console.warn("[Ahrefs API] Missing AHREFS_API_KEY");
    return null;
  }

  const url = new URL(`${AHREFS_BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[Ahrefs API] ${endpoint} HTTP ${response.status}: ${errorText.substring(0, 300)}`);
      return null;
    }

    return (await response.json()) as T;
  } catch (err: any) {
    console.error(`[Ahrefs API] ${endpoint} error: ${err.message}`);
    return null;
  }
}

/**
 * Get Domain Rating and Ahrefs Rank
 */
export async function getAhrefsDomainRating(domain: string): Promise<{ domainRating: number; ahrefsRank: number | null } | null> {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const data = await ahrefsGet<{
    domain_rating: {
      domain_rating: number;
      ahrefs_rank: number | null;
    };
  }>("/site-explorer/domain-rating", {
    target: cleanDomain,
    date: today,
    output: "json",
  });

  if (!data?.domain_rating) return null;

  return {
    domainRating: Math.round(data.domain_rating.domain_rating),
    ahrefsRank: data.domain_rating.ahrefs_rank,
  };
}

/**
 * Get Backlinks statistics
 */
export async function getAhrefsBacklinksStats(domain: string): Promise<{
  backlinks: number;
  referringDomains: number;
  followedBacklinks: number;
  followedReferringDomains: number;
} | null> {
  const today = new Date().toISOString().split("T")[0];
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const data = await ahrefsGet<{
    metrics: {
      live: number;
      all_time: number;
      live_refdomains: number;
      all_time_refdomains: number;
      [key: string]: any;
    };
  }>("/site-explorer/backlinks-stats", {
    target: cleanDomain,
    date: today,
    output: "json",
    mode: "subdomains",
  });

  if (!data?.metrics) return null;

  return {
    backlinks: data.metrics.live ?? 0,
    referringDomains: data.metrics.live_refdomains ?? 0,
    followedBacklinks: data.metrics.live ?? 0,
    followedReferringDomains: data.metrics.live_refdomains ?? 0,
  };
}

/**
 * Get organic search metrics (traffic, keywords)
 */
export async function getAhrefsOrganicMetrics(domain: string): Promise<{
  organicTraffic: number;
  organicKeywords: number;
} | null> {
  const today = new Date().toISOString().split("T")[0];
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const data = await ahrefsGet<{
    metrics: {
      org_traffic: number;
      org_keywords: number;
      [key: string]: any;
    };
  }>("/site-explorer/metrics", {
    target: cleanDomain,
    date: today,
    output: "json",
    mode: "subdomains",
  });

  if (!data?.metrics) return null;

  return {
    organicTraffic: data.metrics.org_traffic ?? 0,
    organicKeywords: data.metrics.org_keywords ?? 0,
  };
}

/**
 * Get all Ahrefs metrics for a domain in one call
 * Combines DR + Backlinks + Organic metrics
 */
export async function getAhrefsMetrics(domain: string): Promise<AhrefsMetrics | null> {
  // Run all three requests in parallel
  const [dr, bl, organic] = await Promise.all([
    getAhrefsDomainRating(domain),
    getAhrefsBacklinksStats(domain),
    getAhrefsOrganicMetrics(domain),
  ]);

  // If at least DR is available, return combined metrics
  if (!dr && !bl && !organic) return null;

  return {
    domainRating: dr?.domainRating ?? 0,
    ahrefsRank: dr?.ahrefsRank ?? null,
    backlinks: bl?.backlinks ?? 0,
    referringDomains: bl?.referringDomains ?? 0,
    followedBacklinks: bl?.followedBacklinks ?? 0,
    followedReferringDomains: bl?.followedReferringDomains ?? 0,
    organicTraffic: organic?.organicTraffic ?? null,
    organicKeywords: organic?.organicKeywords ?? null,
    source: "ahrefs",
  };
}
