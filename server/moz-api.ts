/**
 * Moz Links API V2 Client
 * 
 * Provides real Domain Authority, Page Authority, Spam Score,
 * and link metrics from Moz's index.
 * 
 * API Docs: https://moz.com/help/links-api/making-calls/url-metrics
 * Endpoint: POST https://lsapi.seomoz.com/v2/url_metrics
 * Auth: Basic Auth (Access ID : Secret Key)
 */

import { ENV } from "./_core/env";

const MOZ_API_URL = "https://lsapi.seomoz.com/v2/url_metrics";

export interface MozMetrics {
  domainAuthority: number;       // 1-100
  pageAuthority: number;         // 1-100
  spamScore: number;             // 1-100 or -1 if N/A
  rootDomainsToRootDomain: number;
  externalPagesToRootDomain: number;
  pagesToRootDomain: number;
  linkPropensity: number;
  lastCrawled: string | null;
  source: "moz";
}

export interface MozApiResponse {
  results: {
    page: string;
    subdomain: string;
    root_domain: string;
    title: string;
    last_crawled: string;
    http_code: number;
    domain_authority: number;
    page_authority: number;
    spam_score: number;
    link_propensity: number;
    root_domains_to_root_domain: number;
    external_pages_to_root_domain: number;
    pages_to_root_domain: number;
    root_domains_to_page: number;
    pages_to_page: number;
    nofollow_pages_to_page: number;
    redirect_pages_to_page: number;
    deleted_pages_to_page: number;
    nofollow_root_domains_to_page: number;
    [key: string]: any;
  }[];
}

/**
 * Fetch URL metrics from Moz API for a single domain
 */
export async function getMozMetrics(domain: string): Promise<MozMetrics | null> {
  const accessId = ENV.mozAccessId;
  const secretKey = ENV.mozSecretKey;

  if (!accessId || !secretKey) {
    console.warn("[Moz API] Missing credentials (MOZ_ACCESS_ID / MOZ_SECRET_KEY)");
    return null;
  }

  // Clean domain — Moz expects just the domain, no protocol
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  try {
    const authHeader = "Basic " + Buffer.from(`${accessId}:${secretKey}`).toString("base64");

    const response = await fetch(MOZ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify({
        targets: [cleanDomain],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`[Moz API] HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      return null;
    }

    const data = (await response.json()) as MozApiResponse;

    if (!data.results || data.results.length === 0) {
      console.warn(`[Moz API] No results for ${cleanDomain}`);
      return null;
    }

    const result = data.results[0];

    return {
      domainAuthority: result.domain_authority ?? 0,
      pageAuthority: result.page_authority ?? 0,
      spamScore: result.spam_score ?? -1,
      rootDomainsToRootDomain: result.root_domains_to_root_domain ?? 0,
      externalPagesToRootDomain: result.external_pages_to_root_domain ?? 0,
      pagesToRootDomain: result.pages_to_root_domain ?? 0,
      linkPropensity: result.link_propensity ?? 0,
      lastCrawled: result.last_crawled ?? null,
      source: "moz",
    };
  } catch (err: any) {
    console.error(`[Moz API] Error for ${cleanDomain}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch URL metrics from Moz API for multiple domains (batch)
 * Moz supports up to 50 targets per request
 */
export async function getMozMetricsBatch(domains: string[]): Promise<Map<string, MozMetrics>> {
  const accessId = ENV.mozAccessId;
  const secretKey = ENV.mozSecretKey;
  const results = new Map<string, MozMetrics>();

  if (!accessId || !secretKey) {
    console.warn("[Moz API] Missing credentials for batch request");
    return results;
  }

  // Process in chunks of 50 (Moz limit)
  const chunks: string[][] = [];
  for (let i = 0; i < domains.length; i += 50) {
    chunks.push(domains.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    const cleanDomains = chunk.map(d => d.replace(/^https?:\/\//, "").replace(/\/+$/, ""));

    try {
      const authHeader = "Basic " + Buffer.from(`${accessId}:${secretKey}`).toString("base64");

      const response = await fetch(MOZ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          targets: cleanDomains,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) continue;

      const data = (await response.json()) as MozApiResponse;

      if (data.results) {
        for (let i = 0; i < data.results.length; i++) {
          const r = data.results[i];
          const originalDomain = chunk[i] || cleanDomains[i];
          results.set(originalDomain, {
            domainAuthority: r.domain_authority ?? 0,
            pageAuthority: r.page_authority ?? 0,
            spamScore: r.spam_score ?? -1,
            rootDomainsToRootDomain: r.root_domains_to_root_domain ?? 0,
            externalPagesToRootDomain: r.external_pages_to_root_domain ?? 0,
            pagesToRootDomain: r.pages_to_root_domain ?? 0,
            linkPropensity: r.link_propensity ?? 0,
            lastCrawled: r.last_crawled ?? null,
            source: "moz",
          });
        }
      }
    } catch (err: any) {
      console.error(`[Moz API] Batch error: ${err.message}`);
    }
  }

  return results;
}
