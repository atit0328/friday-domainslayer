/**
 * Domain File Importer — Import target domains from .txt files
 * 
 * Reads domain lists from uploaded .txt files and feeds them into
 * the attack pipeline via serpDiscoveredTargets table.
 * 
 * Supported formats:
 * - One domain per line: example.com
 * - With protocol: https://example.com
 * - With path: https://example.com/some/path
 * - Comments: # this is a comment
 * - Empty lines are skipped
 * - Comma-separated: example.com, example2.com
 * - Tab-separated: example.com\texample2.com
 * - With port: example.com:8080
 */

import { getDb } from "./db";
import { serpDiscoveredTargets } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import { sendTelegramNotification } from "./telegram-notifier";

// ═══════════════════════════════════════════════════════
//  INTERFACES
// ═══════════════════════════════════════════════════════

export interface ImportResult {
  totalParsed: number;
  totalImported: number;
  totalDuplicate: number;
  totalInvalid: number;
  totalBlacklisted: number;
  importedDomains: string[];
  duplicateDomains: string[];
  invalidEntries: string[];
  blacklistedDomains: string[];
  importId: string;
  importedAt: number;
}

export interface ImportConfig {
  /** Keywords to associate with imported targets (for SEO tracking) */
  keywords?: string[];
  /** Source label for tracking where these targets came from */
  source?: string;
  /** Whether to auto-queue for immediate attack (default: true) */
  autoQueue?: boolean;
  /** Custom keyword to tag all imports */
  tagKeyword?: string;
  /** Skip CMS detection (faster import, default: false) */
  skipCmsDetection?: boolean;
  /** Notify via Telegram on import completion (default: true) */
  telegramNotify?: boolean;
}

// ═══════════════════════════════════════════════════════
//  DOMAIN BLACKLIST — Never attack these
// ═══════════════════════════════════════════════════════

const DOMAIN_BLACKLIST = new Set([
  "google.com", "google.co.th", "facebook.com", "twitter.com", "x.com",
  "youtube.com", "instagram.com", "linkedin.com", "github.com",
  "microsoft.com", "apple.com", "amazon.com", "cloudflare.com",
  "manus.im", "manus.space", "domainslayer.ai",
  "localhost", "127.0.0.1", "0.0.0.0",
]);

function isBlacklisted(domain: string): boolean {
  const lower = domain.toLowerCase();
  const blArr = Array.from(DOMAIN_BLACKLIST);
  for (const bl of blArr) {
    if (lower === bl || lower.endsWith(`.${bl}`)) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════
//  DOMAIN PARSER — Extract valid domains from text
// ═══════════════════════════════════════════════════════

/**
 * Parse a raw text string and extract valid domains
 */
export function parseDomainList(rawText: string): { domains: string[]; invalid: string[] } {
  const domains: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  // Split by newlines first
  const lines = rawText.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;

    // Split by comma or tab for multi-domain lines
    const parts = line.split(/[,\t]+/).map(p => p.trim()).filter(Boolean);

    for (const part of parts) {
      const domain = extractDomain(part);
      if (domain) {
        const lower = domain.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          domains.push(lower);
        }
      } else {
        invalid.push(part);
      }
    }
  }

  return { domains, invalid };
}

/**
 * Extract a clean domain from various input formats
 */
function extractDomain(input: string): string | null {
  let cleaned = input.trim();

  // Remove surrounding quotes
  cleaned = cleaned.replace(/^["']|["']$/g, "");

  // Remove protocol
  cleaned = cleaned.replace(/^https?:\/\//i, "");

  // Remove www.
  cleaned = cleaned.replace(/^www\./i, "");

  // Remove path, query, fragment
  cleaned = cleaned.split("/")[0];
  cleaned = cleaned.split("?")[0];
  cleaned = cleaned.split("#")[0];

  // Remove port
  cleaned = cleaned.split(":")[0];

  // Remove trailing dots
  cleaned = cleaned.replace(/\.+$/, "");

  // Validate domain format
  if (!isValidDomain(cleaned)) return null;

  return cleaned;
}

/**
 * Basic domain validation
 */
function isValidDomain(domain: string): boolean {
  if (!domain || domain.length < 3 || domain.length > 253) return false;

  // Must have at least one dot
  if (!domain.includes(".")) return false;

  // Domain regex: alphanumeric + hyphens, separated by dots
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(domain)) {
    // Also allow IP addresses
    const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    return ipRegex.test(domain);
  }

  return true;
}

// ═══════════════════════════════════════════════════════
//  IMPORT ENGINE — Insert domains into attack pipeline
// ═══════════════════════════════════════════════════════

/**
 * Import domains from raw text content (from .txt file)
 */
export async function importDomainsFromText(
  rawText: string,
  config: ImportConfig = {},
): Promise<ImportResult> {
  const {
    keywords = ["manual-import"],
    source = "file-import",
    autoQueue = true,
    tagKeyword = "manual-import",
    telegramNotify = true,
  } = config;

  const importId = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result: ImportResult = {
    totalParsed: 0,
    totalImported: 0,
    totalDuplicate: 0,
    totalInvalid: 0,
    totalBlacklisted: 0,
    importedDomains: [],
    duplicateDomains: [],
    invalidEntries: [],
    blacklistedDomains: [],
    importId,
    importedAt: Date.now(),
  };

  // Step 1: Parse domains from text
  const { domains, invalid } = parseDomainList(rawText);
  result.totalParsed = domains.length + invalid.length;
  result.invalidEntries = invalid;
  result.totalInvalid = invalid.length;

  if (domains.length === 0) {
    console.log(`[DomainImporter] No valid domains found in import`);
    return result;
  }

  console.log(`[DomainImporter] Parsed ${domains.length} valid domains from text`);

  // Step 2: Check blacklist
  const safeDomains: string[] = [];
  for (const domain of domains) {
    if (isBlacklisted(domain)) {
      result.blacklistedDomains.push(domain);
      result.totalBlacklisted++;
    } else {
      safeDomains.push(domain);
    }
  }

  if (safeDomains.length === 0) {
    console.log(`[DomainImporter] All domains are blacklisted`);
    return result;
  }

  // Step 3: Check for duplicates in DB
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Get existing domains in batches of 100
  const existingDomains = new Set<string>();
  for (let i = 0; i < safeDomains.length; i += 100) {
    const batch = safeDomains.slice(i, i + 100);
    const existing = await db.select({ domain: serpDiscoveredTargets.domain })
      .from(serpDiscoveredTargets)
      .where(inArray(serpDiscoveredTargets.domain, batch));
    for (const row of existing) {
      existingDomains.add(row.domain.toLowerCase());
    }
  }

  // Step 4: Insert new domains
  const newDomains = safeDomains.filter(d => !existingDomains.has(d));
  const dupDomains = safeDomains.filter(d => existingDomains.has(d));

  result.duplicateDomains = dupDomains;
  result.totalDuplicate = dupDomains.length;

  if (newDomains.length === 0) {
    console.log(`[DomainImporter] All ${safeDomains.length} domains already exist in DB`);
    return result;
  }

  // Insert in batches of 50
  for (let i = 0; i < newDomains.length; i += 50) {
    const batch = newDomains.slice(i, i + 50);
    const values = batch.map(domain => ({
      domain,
      url: `https://${domain}`,
      keyword: tagKeyword,
      status: autoQueue ? "queued" as const : "discovered" as const,
      title: `[Imported] ${domain}`,
      snippet: `Manually imported from ${source}`,
    }));

    await db.insert(serpDiscoveredTargets).values(values);
  }

  result.importedDomains = newDomains;
  result.totalImported = newDomains.length;

  console.log(`[DomainImporter] Imported ${newDomains.length} new domains (${dupDomains.length} duplicates skipped)`);

  // Step 5: Telegram notification
  if (telegramNotify && newDomains.length > 0) {
    try {
      const domainPreview = newDomains.slice(0, 10).join(", ");
      const moreText = newDomains.length > 10 ? ` +${newDomains.length - 10} more` : "";

      await sendTelegramNotification({
        type: "info",
        targetUrl: `import://${importId}`,
        details: [
          `DOMAIN IMPORT COMPLETE`,
          ``,
          `Source: ${source}`,
          `Total parsed: ${result.totalParsed}`,
          `Imported: ${result.totalImported}`,
          `Duplicates skipped: ${result.totalDuplicate}`,
          `Blacklisted: ${result.totalBlacklisted}`,
          `Invalid: ${result.totalInvalid}`,
          ``,
          `Domains: ${domainPreview}${moreText}`,
          ``,
          `Status: ${autoQueue ? "Queued for attack" : "Discovered (pending)"}`,
        ].join("\n"),
      });
    } catch (e: any) {
      console.warn(`[DomainImporter] Telegram notification failed: ${e.message}`);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════
//  IMPORT HISTORY — Track imports
// ═══════════════════════════════════════════════════════

const importHistory: ImportResult[] = [];

/**
 * Get import history
 */
export function getImportHistory(): ImportResult[] {
  return [...importHistory].reverse(); // Newest first
}

/**
 * Import and track in history
 */
export async function importAndTrack(
  rawText: string,
  config: ImportConfig = {},
): Promise<ImportResult> {
  const result = await importDomainsFromText(rawText, config);
  importHistory.push(result);
  // Keep only last 100 imports
  if (importHistory.length > 100) importHistory.splice(0, importHistory.length - 100);
  return result;
}

// ═══════════════════════════════════════════════════════
//  QUICK IMPORT — Convenience functions
// ═══════════════════════════════════════════════════════

/**
 * Quick import from a list of domain strings
 */
export async function quickImportDomains(
  domains: string[],
  config: ImportConfig = {},
): Promise<ImportResult> {
  const text = domains.join("\n");
  return importAndTrack(text, config);
}

/**
 * Get import stats summary
 */
export function getImportSummary(): {
  totalImports: number;
  totalDomainsImported: number;
  totalDuplicatesSkipped: number;
  totalInvalid: number;
  lastImportAt: number | null;
} {
  const total = importHistory.reduce((acc, r) => ({
    totalDomainsImported: acc.totalDomainsImported + r.totalImported,
    totalDuplicatesSkipped: acc.totalDuplicatesSkipped + r.totalDuplicate,
    totalInvalid: acc.totalInvalid + r.totalInvalid,
  }), { totalDomainsImported: 0, totalDuplicatesSkipped: 0, totalInvalid: 0 });

  return {
    totalImports: importHistory.length,
    ...total,
    lastImportAt: importHistory.length > 0 ? importHistory[importHistory.length - 1].importedAt : null,
  };
}
