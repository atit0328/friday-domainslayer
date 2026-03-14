/**
 * ═══════════════════════════════════════════════════════════════
 *  Backlink Verifier — Verify that created backlinks actually exist
 *  
 *  Checks:
 *  1. URL returns HTTP 200
 *  2. Page content contains the target domain/URL
 *  3. Link is dofollow (not nofollow)
 *  4. Page is indexed (optional)
 * ═══════════════════════════════════════════════════════════════
 */

import { fetchWithPoolProxy } from "./proxy-pool";

// ═══ Types ═══

export interface BacklinkToVerify {
  sourceUrl: string;
  targetDomain: string;
  platform: string;
  createdAt?: Date;
}

export interface VerificationResult {
  sourceUrl: string;
  platform: string;
  status: "verified" | "broken" | "nofollow" | "missing_link" | "timeout" | "error";
  httpStatus: number | null;
  hasTargetLink: boolean;
  isDofollow: boolean;
  responseTimeMs: number;
  detail: string;
  checkedAt: Date;
}

export interface BatchVerificationResult {
  total: number;
  verified: number;
  broken: number;
  nofollow: number;
  missingLink: number;
  timeout: number;
  error: number;
  results: VerificationResult[];
  summary: string;
}

// ═══ Single Backlink Verification ═══

export async function verifyBacklink(bl: BacklinkToVerify): Promise<VerificationResult> {
  const start = Date.now();
  const checkedAt = new Date();

  try {
    const domain = bl.sourceUrl.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
    const { response: res } = await fetchWithPoolProxy(
      bl.sourceUrl,
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FridayAI-Verifier/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(20000),
      },
      { targetDomain: domain, timeout: 20000 },
    );

    const responseTimeMs = Date.now() - start;
    const httpStatus = res.status;

    if (!res.ok) {
      return {
        sourceUrl: bl.sourceUrl,
        platform: bl.platform,
        status: "broken",
        httpStatus,
        hasTargetLink: false,
        isDofollow: false,
        responseTimeMs,
        detail: `HTTP ${httpStatus} — page not accessible`,
        checkedAt,
      };
    }

    const html = await res.text();
    const lowerHtml = html.toLowerCase();

    // Check if target domain/URL exists in the page
    const targetLower = bl.targetDomain.toLowerCase();
    const hasTargetLink = lowerHtml.includes(targetLower) ||
      lowerHtml.includes(`href="${targetLower}`) ||
      lowerHtml.includes(`href="https://${targetLower}`) ||
      lowerHtml.includes(`href="http://${targetLower}`);

    if (!hasTargetLink) {
      return {
        sourceUrl: bl.sourceUrl,
        platform: bl.platform,
        status: "missing_link",
        httpStatus,
        hasTargetLink: false,
        isDofollow: false,
        responseTimeMs,
        detail: `Page exists but no link to ${bl.targetDomain} found`,
        checkedAt,
      };
    }

    // Check if the link is dofollow
    // Find the specific <a> tag containing the target domain
    const linkRegex = new RegExp(
      `<a[^>]*href=["'][^"']*${escapeRegex(targetLower)}[^"']*["'][^>]*>`,
      "gi",
    );
    const linkMatches = html.match(linkRegex) || [];
    let isDofollow = true;

    if (linkMatches.length > 0) {
      // Check if any of the matching links have rel="nofollow"
      const hasNofollow = linkMatches.some(
        (link) => link.toLowerCase().includes('rel="nofollow"') ||
          link.toLowerCase().includes("rel='nofollow'") ||
          link.toLowerCase().includes("nofollow"),
      );
      isDofollow = !hasNofollow;
    }

    // Also check for page-level nofollow meta
    const metaNofollow = lowerHtml.includes('name="robots"') &&
      lowerHtml.includes("nofollow");
    if (metaNofollow) isDofollow = false;

    if (!isDofollow) {
      return {
        sourceUrl: bl.sourceUrl,
        platform: bl.platform,
        status: "nofollow",
        httpStatus,
        hasTargetLink: true,
        isDofollow: false,
        responseTimeMs,
        detail: `Link found but marked as nofollow`,
        checkedAt,
      };
    }

    return {
      sourceUrl: bl.sourceUrl,
      platform: bl.platform,
      status: "verified",
      httpStatus,
      hasTargetLink: true,
      isDofollow: true,
      responseTimeMs,
      detail: `✅ Verified: dofollow link to ${bl.targetDomain} found`,
      checkedAt,
    };
  } catch (err: any) {
    const responseTimeMs = Date.now() - start;
    const isTimeout = err.name === "AbortError" || err.message?.includes("timeout");

    return {
      sourceUrl: bl.sourceUrl,
      platform: bl.platform,
      status: isTimeout ? "timeout" : "error",
      httpStatus: null,
      hasTargetLink: false,
      isDofollow: false,
      responseTimeMs,
      detail: isTimeout ? "Request timed out (20s)" : `Error: ${err.message}`,
      checkedAt,
    };
  }
}

// ═══ Batch Verification ═══

export async function verifyBacklinks(
  backlinks: BacklinkToVerify[],
  concurrency: number = 3,
): Promise<BatchVerificationResult> {
  const results: VerificationResult[] = [];
  const queue = [...backlinks];

  // Process with concurrency limit
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const bl = queue.shift();
      if (!bl) break;
      const result = await verifyBacklink(bl);
      results.push(result);
    }
  });

  await Promise.all(workers);

  const verified = results.filter((r) => r.status === "verified").length;
  const broken = results.filter((r) => r.status === "broken").length;
  const nofollow = results.filter((r) => r.status === "nofollow").length;
  const missingLink = results.filter((r) => r.status === "missing_link").length;
  const timeout = results.filter((r) => r.status === "timeout").length;
  const error = results.filter((r) => r.status === "error").length;

  const total = results.length;
  const verifyRate = total > 0 ? Math.round((verified / total) * 100) : 0;

  return {
    total,
    verified,
    broken,
    nofollow,
    missingLink,
    timeout,
    error,
    results,
    summary: `Backlink Verification: ${verified}/${total} verified (${verifyRate}%)` +
      `${broken > 0 ? ` | ${broken} broken` : ""}` +
      `${nofollow > 0 ? ` | ${nofollow} nofollow` : ""}` +
      `${missingLink > 0 ? ` | ${missingLink} missing link` : ""}` +
      `${timeout > 0 ? ` | ${timeout} timeout` : ""}` +
      `${error > 0 ? ` | ${error} errors` : ""}`,
  };
}

// ═══ Format for Telegram ═══

export function formatVerificationForTelegram(result: BatchVerificationResult): string {
  let text = `🔍 *Backlink Verification Report*\n\n`;
  text += `📊 *Summary:* ${result.verified}/${result.total} verified (${result.total > 0 ? Math.round((result.verified / result.total) * 100) : 0}%)\n`;
  text += `✅ Verified: ${result.verified}\n`;
  if (result.broken > 0) text += `❌ Broken: ${result.broken}\n`;
  if (result.nofollow > 0) text += `🔗 Nofollow: ${result.nofollow}\n`;
  if (result.missingLink > 0) text += `⚠️ Missing Link: ${result.missingLink}\n`;
  if (result.timeout > 0) text += `⏱ Timeout: ${result.timeout}\n`;
  if (result.error > 0) text += `💥 Error: ${result.error}\n`;

  text += `\n📋 *Details:*\n`;
  for (const r of result.results.slice(0, 20)) {
    const icon = r.status === "verified" ? "✅" :
      r.status === "broken" ? "❌" :
        r.status === "nofollow" ? "🔗" :
          r.status === "missing_link" ? "⚠️" :
            r.status === "timeout" ? "⏱" : "💥";
    text += `${icon} [${r.platform}] ${r.sourceUrl.substring(0, 60)}${r.sourceUrl.length > 60 ? "..." : ""}\n`;
    text += `   ${r.detail} (${r.responseTimeMs}ms)\n`;
  }

  if (result.results.length > 20) {
    text += `\n... and ${result.results.length - 20} more\n`;
  }

  return text;
}

// ═══ Helpers ═══

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
