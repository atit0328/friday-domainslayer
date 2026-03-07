/**
 * GoDaddy API Client
 * Handles domain search, suggestions, and availability checks
 * Docs: https://developer.godaddy.com/doc/endpoint/domains
 */

const GODADDY_BASE_URL = "https://api.godaddy.com";

function getAuthHeader(): string | null {
  const key = process.env.GODADDY_API_KEY;
  const secret = process.env.GODADDY_API_SECRET;
  if (!key || !secret) return null;
  return `sso-key ${key}:${secret}`;
}

export function isGoDaddyConfigured(): boolean {
  return !!process.env.GODADDY_API_KEY && !!process.env.GODADDY_API_SECRET;
}

export interface GoDaddySuggestion {
  domain: string;
}

export interface GoDaddyAvailability {
  available: boolean;
  domain: string;
  definitive: boolean;
  price: number;
  currency: string;
  period: number;
}

export interface GoDaddyDomainResult {
  domain: string;
  available: boolean;
  price: number;
  currency: string;
  period: number;
  provider: string;
  source: "godaddy";
}

/**
 * Suggest alternate domain names based on a keyword/seed domain
 * GET /v1/domains/suggest
 */
export async function suggestDomains(options: {
  query: string;
  tlds?: string[];
  limit?: number;
  sources?: string[];
  lengthMax?: number;
  lengthMin?: number;
  waitMs?: number;
}): Promise<GoDaddySuggestion[]> {
  const auth = getAuthHeader();
  if (!auth) throw new Error("GoDaddy API not configured");

  const params = new URLSearchParams();
  params.set("query", options.query);
  if (options.limit) params.set("limit", String(options.limit));
  if (options.waitMs) params.set("waitMs", String(options.waitMs));
  if (options.lengthMax) params.set("lengthMax", String(options.lengthMax));
  if (options.lengthMin) params.set("lengthMin", String(options.lengthMin));
  if (options.tlds && options.tlds.length > 0) {
    options.tlds.forEach(tld => params.append("tlds", tld.replace(/^\./, "")));
  }
  if (options.sources && options.sources.length > 0) {
    options.sources.forEach(s => params.append("sources", s));
  }

  const url = `${GODADDY_BASE_URL}/v1/domains/suggest?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`GoDaddy suggest API error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Check availability of a single domain
 * GET /v1/domains/available
 */
export async function checkAvailability(domain: string, checkType: "FAST" | "FULL" = "FAST"): Promise<GoDaddyAvailability> {
  const auth = getAuthHeader();
  if (!auth) throw new Error("GoDaddy API not configured");

  const params = new URLSearchParams({ domain, checkType });
  const url = `${GODADDY_BASE_URL}/v1/domains/available?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`GoDaddy available API error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Bulk check availability of multiple domains
 * POST /v1/domains/available
 */
export async function bulkCheckAvailability(domains: string[]): Promise<{
  domains: GoDaddyAvailability[];
}> {
  const auth = getAuthHeader();
  if (!auth) throw new Error("GoDaddy API not configured");

  const url = `${GODADDY_BASE_URL}/v1/domains/available`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(domains),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`GoDaddy bulk available API error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Combined search: suggest domains + check availability + pricing
 * This is the main function used by the Marketplace
 */
export async function searchMarketplace(options: {
  keyword: string;
  tld?: string;
  limit?: number;
}): Promise<GoDaddyDomainResult[]> {
  const limit = options.limit || 20;

  // Step 1: Get domain suggestions
  const tlds = options.tld ? [options.tld.replace(/^\./, "")] : undefined;
  const suggestions = await suggestDomains({
    query: options.keyword,
    tlds,
    limit,
    waitMs: 3000,
    sources: ["EXTENSION", "KEYWORD_SPIN"],
  });

  if (!suggestions || suggestions.length === 0) {
    return [];
  }

  // Step 2: Check availability for each suggested domain
  const domainNames = suggestions.map(s => s.domain);

  // Use individual checks since bulk may not return pricing
  const results: GoDaddyDomainResult[] = [];

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < domainNames.length; i += batchSize) {
    const batch = domainNames.slice(i, i + batchSize);
    const checks = await Promise.allSettled(
      batch.map(domain => checkAvailability(domain, "FAST"))
    );

    for (const check of checks) {
      if (check.status === "fulfilled" && check.value) {
        const avail = check.value;
        results.push({
          domain: avail.domain,
          available: avail.available,
          price: avail.price ? avail.price / 1000000 : 0, // GoDaddy returns price in micro-units
          currency: avail.currency || "USD",
          period: avail.period || 1,
          provider: "godaddy",
          source: "godaddy",
        });
      }
    }
  }

  return results;
}

/**
 * Get legal agreements required for domain purchase
 * GET /v1/domains/agreements
 */
export async function getAgreements(tlds: string[], privacy = false): Promise<any[]> {
  const auth = getAuthHeader();
  if (!auth) throw new Error("GoDaddy API not configured");

  const params = new URLSearchParams();
  tlds.forEach(tld => params.append("tlds", tld.replace(/^\./, "")));
  params.set("privacy", String(privacy));

  const url = `${GODADDY_BASE_URL}/v1/domains/agreements?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: auth, Accept: "application/json" },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`GoDaddy agreements API error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Validate a domain purchase request
 * POST /v1/domains/purchase/validate
 */
export async function validatePurchase(purchaseBody: any): Promise<{ valid: boolean; errors?: any[] }> {
  const auth = getAuthHeader();
  if (!auth) throw new Error("GoDaddy API not configured");

  const url = `${GODADDY_BASE_URL}/v1/domains/purchase/validate`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(purchaseBody),
  });

  if (response.ok) return { valid: true };

  const errorBody = await response.json().catch(() => ({ message: "Unknown error" }));
  return { valid: false, errors: errorBody.fields || [errorBody] };
}

/**
 * Purchase and register a domain
 * POST /v1/domains/purchase
 */
export async function purchaseDomain(purchaseBody: any): Promise<{
  orderId: number;
  itemCount: number;
  total: number;
  currency: string;
}> {
  const auth = getAuthHeader();
  if (!auth) throw new Error("GoDaddy API not configured");

  const url = `${GODADDY_BASE_URL}/v1/domains/purchase`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(purchaseBody),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`GoDaddy purchase API error ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Validate GoDaddy API credentials by calling the TLDs endpoint
 * GET /v1/domains/tlds (lightweight, no domain-count requirement)
 */
export async function validateCredentials(): Promise<{ valid: boolean; message: string }> {
  const auth = getAuthHeader();
  if (!auth) {
    return { valid: false, message: "GoDaddy API credentials not configured" };
  }

  try {
    const url = `${GODADDY_BASE_URL}/v1/domains/tlds`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: auth,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      return { valid: true, message: "GoDaddy API credentials are valid" };
    }

    if (response.status === 401) {
      return { valid: false, message: "Invalid GoDaddy API credentials (401 Unauthorized)" };
    }

    return { valid: false, message: `GoDaddy API returned status ${response.status}` };
  } catch (error: any) {
    return { valid: false, message: `Connection error: ${error.message}` };
  }
}
