/**
 * LeakCheck Enterprise API Client
 * 
 * Supports: email, username, domain, keyword, password, hash, phone, origin, stealer logs
 * API: https://leakcheck.io/api/v2
 * Rate limit: 3 RPS (Enterprise)
 */

import { ENV } from "./_core/env";

// ─── Types ───────────────────────────────────────────────

export type LeakCheckSearchType = 
  | "auto" | "email" | "domain" | "keyword" 
  | "username" | "phone" | "hash" | "phash" 
  | "origin" | "password";

export interface LeakCheckSource {
  name: string;
  breach_date?: string;
  unverified?: number;
  passwordless?: number;
  compilation?: number;
}

export interface LeakCheckResult {
  email?: string;
  username?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  dob?: string;
  address?: string;
  zip?: string;
  phone?: string;
  source: LeakCheckSource;
  fields: string[];
}

export interface LeakCheckResponse {
  success: boolean;
  found: number;
  quota: number;
  result: LeakCheckResult[];
}

export interface LeakCheckError {
  success: false;
  error: string;
}

export interface LeakCheckSearchOptions {
  query: string;
  type?: LeakCheckSearchType;
  limit?: number;
  offset?: number;
}

export interface LeakCheckSummary {
  totalFound: number;
  uniqueEmails: string[];
  uniqueUsernames: string[];
  uniquePasswords: string[];
  sources: { name: string; breach_date?: string; count: number }[];
  hasPasswords: boolean;
  hasSensitiveData: boolean;
  quotaRemaining: number;
}

// ─── Rate limiter (3 RPS) ────────────────────────────────

let lastRequestTime = 0;
const MIN_INTERVAL_MS = 340; // ~3 RPS

async function rateLimitWait(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// ─── Core API call ───────────────────────────────────────

export async function leakCheckSearch(
  options: LeakCheckSearchOptions
): Promise<LeakCheckResponse> {
  const apiKey = ENV.leakcheckApiKey;
  if (!apiKey) {
    throw new Error("LEAKCHECK_API_KEY not configured");
  }

  await rateLimitWait();

  const params = new URLSearchParams();
  if (options.type) params.set("type", options.type);
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));

  const qs = params.toString();
  const url = `https://leakcheck.io/api/v2/query/${encodeURIComponent(options.query)}${qs ? `?${qs}` : ""}`;

  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (resp.status === 429) {
    // Rate limited — wait and retry once
    await new Promise(r => setTimeout(r, 2000));
    lastRequestTime = Date.now();
    const retryResp = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!retryResp.ok) {
      const err = await retryResp.json().catch(() => ({ error: `HTTP ${retryResp.status}` }));
      throw new Error(`LeakCheck API error: ${(err as any).error || retryResp.status}`);
    }
    return retryResp.json();
  }

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(`LeakCheck API error: ${(err as any).error || resp.status}`);
  }

  return resp.json();
}

// ─── High-level search functions ─────────────────────────

/** Search by email address */
export async function searchByEmail(email: string, limit = 100): Promise<LeakCheckResponse> {
  return leakCheckSearch({ query: email, type: "email", limit });
}

/** Search by domain — find all leaked credentials for a domain */
export async function searchByDomain(domain: string, limit = 1000): Promise<LeakCheckResponse> {
  return leakCheckSearch({ query: domain, type: "domain", limit });
}

/** Search by username */
export async function searchByUsername(username: string, limit = 100): Promise<LeakCheckResponse> {
  return leakCheckSearch({ query: username, type: "username", limit });
}

/** Search by keyword (Enterprise) */
export async function searchByKeyword(keyword: string, limit = 100): Promise<LeakCheckResponse> {
  return leakCheckSearch({ query: keyword, type: "keyword", limit });
}

/** Reverse search by password (Enterprise only) */
export async function searchByPassword(password: string, limit = 100): Promise<LeakCheckResponse> {
  return leakCheckSearch({ query: password, type: "password", limit });
}

/** Search by origin/stealer logs (Enterprise only) */
export async function searchByOrigin(origin: string, limit = 100): Promise<LeakCheckResponse> {
  return leakCheckSearch({ query: origin, type: "origin", limit });
}

/** Search by phone number */
export async function searchByPhone(phone: string, limit = 100): Promise<LeakCheckResponse> {
  return leakCheckSearch({ query: phone, type: "phone", limit });
}

// ─── Summarize results ───────────────────────────────────

export function summarizeResults(response: LeakCheckResponse): LeakCheckSummary {
  const emails = new Set<string>();
  const usernames = new Set<string>();
  const passwords = new Set<string>();
  const sourceMap = new Map<string, { name: string; breach_date?: string; count: number }>();

  for (const r of response.result) {
    if (r.email) emails.add(r.email);
    if (r.username) usernames.add(r.username);
    if (r.password) passwords.add(r.password);

    const srcKey = r.source.name;
    const existing = sourceMap.get(srcKey);
    if (existing) {
      existing.count++;
    } else {
      sourceMap.set(srcKey, { name: r.source.name, breach_date: r.source.breach_date, count: 1 });
    }
  }

  return {
    totalFound: response.found,
    uniqueEmails: Array.from(emails),
    uniqueUsernames: Array.from(usernames),
    uniquePasswords: Array.from(passwords),
    sources: Array.from(sourceMap.values()).sort((a, b) => b.count - a.count),
    hasPasswords: passwords.size > 0,
    hasSensitiveData: passwords.size > 0 || emails.size > 0,
    quotaRemaining: response.quota,
  };
}

// ─── Format for Telegram ─────────────────────────────────

export function formatLeakCheckForTelegram(
  query: string,
  response: LeakCheckResponse,
  options?: { showPasswords?: boolean; maxResults?: number }
): string {
  const showPasswords = options?.showPasswords ?? true;
  const maxResults = options?.maxResults ?? 20;
  const summary = summarizeResults(response);

  if (response.found === 0) {
    return `🔍 <b>LeakCheck: ${escapeHtml(query)}</b>\n\n✅ ไม่พบข้อมูลรั่วไหล\n📊 Quota: ${response.quota.toLocaleString()}`;
  }

  let msg = `🔍 <b>LeakCheck: ${escapeHtml(query)}</b>\n`;
  msg += `📊 พบ <b>${response.found.toLocaleString()}</b> รายการ\n`;
  msg += `🗄️ จาก <b>${summary.sources.length}</b> แหล่งข้อมูล\n`;
  if (summary.hasPasswords) msg += `🔑 พบ <b>${summary.uniquePasswords.length}</b> รหัสผ่าน\n`;
  msg += `📧 อีเมล: <b>${summary.uniqueEmails.length}</b> | 👤 Username: <b>${summary.uniqueUsernames.length}</b>\n`;
  msg += `\n`;

  // Sources
  msg += `<b>📁 แหล่งข้อมูลรั่วไหล:</b>\n`;
  for (const src of summary.sources.slice(0, 10)) {
    msg += `  • ${escapeHtml(src.name)}${src.breach_date ? ` (${src.breach_date})` : ""} — ${src.count} รายการ\n`;
  }
  if (summary.sources.length > 10) {
    msg += `  ... +${summary.sources.length - 10} แหล่งอื่น\n`;
  }

  // Results
  msg += `\n<b>📋 ข้อมูลที่พบ:</b>\n`;
  const results = response.result.slice(0, maxResults);
  for (const r of results) {
    const parts: string[] = [];
    if (r.email) parts.push(`📧 ${escapeHtml(r.email)}`);
    if (r.username) parts.push(`👤 ${escapeHtml(r.username)}`);
    if (r.password && showPasswords) {
      // Mask middle of password for security
      const masked = r.password.length > 4
        ? r.password.slice(0, 2) + "***" + r.password.slice(-2)
        : "****";
      parts.push(`🔑 ${escapeHtml(masked)}`);
    }
    if (r.phone) parts.push(`📱 ${escapeHtml(r.phone)}`);
    if (r.first_name || r.last_name) {
      parts.push(`🏷️ ${escapeHtml([r.first_name, r.last_name].filter(Boolean).join(" "))}`);
    }
    msg += `  ${parts.join(" | ")}\n`;
    msg += `    └─ ${escapeHtml(r.source.name)}${r.source.breach_date ? ` (${r.source.breach_date})` : ""}\n`;
  }

  if (response.found > maxResults) {
    msg += `\n  ... +${response.found - maxResults} รายการเพิ่มเติม\n`;
  }

  msg += `\n💰 Quota: ${response.quota.toLocaleString()}`;

  return msg;
}

/** Format a compact summary for use in attack pipeline */
export function formatLeakCheckCompact(query: string, response: LeakCheckResponse): string {
  if (response.found === 0) return `❌ ไม่พบ leak สำหรับ ${query}`;
  
  const summary = summarizeResults(response);
  let msg = `✅ พบ ${response.found} leaks`;
  if (summary.hasPasswords) msg += ` (${summary.uniquePasswords.length} passwords)`;
  msg += ` จาก ${summary.sources.length} sources`;
  
  // Show top 3 credentials for attack use
  const creds = response.result
    .filter(r => r.email && r.password)
    .slice(0, 3);
  if (creds.length > 0) {
    msg += `\n🔑 Credentials:`;
    for (const c of creds) {
      msg += `\n  ${c.email} : ${c.password}`;
    }
  }
  
  return msg;
}

// ─── Helpers ─────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Domain credential extraction for attack pipeline ────

export interface ExtractedCredential {
  email: string;
  username?: string;
  password: string;
  source: string;
  breach_date?: string;
}

/**
 * Extract usable credentials from a domain's leak data.
 * Used by the attack pipeline to try leaked creds for WP/FTP/cPanel login.
 */
export async function extractDomainCredentials(
  domain: string,
  options?: { limit?: number; includeRelated?: boolean }
): Promise<{
  credentials: ExtractedCredential[];
  totalFound: number;
  quotaRemaining: number;
}> {
  const limit = options?.limit ?? 500;
  
  // Search by domain
  const domainResults = await searchByDomain(domain, limit);
  
  const credentials: ExtractedCredential[] = [];
  
  for (const r of domainResults.result) {
    if (r.password && (r.email || r.username)) {
      credentials.push({
        email: r.email || "",
        username: r.username,
        password: r.password,
        source: r.source.name,
        breach_date: r.source.breach_date,
      });
    }
  }

  // Also search by origin (stealer logs) if Enterprise
  if (options?.includeRelated !== false) {
    try {
      const originResults = await searchByOrigin(domain, Math.min(limit, 200));
      for (const r of originResults.result) {
        if (r.password && (r.email || r.username)) {
          // Avoid duplicates
          const isDupe = credentials.some(
            c => c.email === r.email && c.password === r.password
          );
          if (!isDupe) {
            credentials.push({
              email: r.email || "",
              username: r.username,
              password: r.password,
              source: `${r.source.name} (stealer)`,
              breach_date: r.source.breach_date,
            });
          }
        }
      }
    } catch (e) {
      // Origin search might not be available — skip
      console.warn("LeakCheck origin search failed:", (e as Error).message);
    }
  }

  // Sort: most recent breaches first, then by password complexity
  credentials.sort((a, b) => {
    if (a.breach_date && b.breach_date) return b.breach_date.localeCompare(a.breach_date);
    if (a.breach_date) return -1;
    if (b.breach_date) return 1;
    return b.password.length - a.password.length;
  });

  return {
    credentials,
    totalFound: domainResults.found,
    quotaRemaining: domainResults.quota,
  };
}
