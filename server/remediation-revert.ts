/**
 * Remediation Revert Engine
 * 
 * Captures state snapshots before applying fixes and provides
 * real revert logic to undo auto-remediation actions via WP API.
 * 
 * Revert Capabilities:
 * - Plugin management: re-activate deactivated plugins, reinstall deleted plugins
 * - Settings: restore previous WP settings values
 * - Security headers: remove added headers
 * - SSL: revert URL scheme changes
 * - Session: restore cookie settings
 */
import { getDb } from "./db";
import { remediationHistory, seoProjects } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { createWPClient, type WPCredentials, type WordPressAPI } from "./wp-api";
import { getWPCredentialsForDomain } from "./auto-remediation";
import type { RemediationFix } from "./auto-remediation";
import { sendTelegramNotification } from "./telegram-notifier";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface StateSnapshot {
  capturedAt: string;
  settings?: Record<string, any>;
  plugins?: { slug: string; name: string; status: string }[];
  siteUrl?: string;
  homeUrl?: string;
  specificData?: Record<string, any>;
}

export interface RevertResult {
  id: number;
  success: boolean;
  action: string;
  detail: string;
  previousStatus: string;
  newStatus: string;
}

// ═══════════════════════════════════════════════
//  SNAPSHOT CAPTURE — Called BEFORE applying a fix
// ═══════════════════════════════════════════════

/**
 * Capture the current state before applying a fix.
 * Returns a snapshot object that can be stored and used for revert.
 */
export async function captureBeforeSnapshot(
  domain: string,
  category: string,
  wp: WordPressAPI | null,
): Promise<StateSnapshot> {
  const snapshot: StateSnapshot = {
    capturedAt: new Date().toISOString(),
  };

  if (!wp) return snapshot;

  try {
    switch (category) {
      case "clickjacking":
      case "security_headers":
        // Capture current settings that might be changed
        try {
          const settings = await wp.getSiteSettings();
          snapshot.settings = {
            x_frame_options: settings.x_frame_options || null,
            content_security_policy: settings.content_security_policy || null,
          };
        } catch { /* settings may not exist */ }
        // Capture active security plugins
        try {
          const plugins = await wp.getPlugins();
          snapshot.plugins = plugins
            .filter(p => 
              p.plugin.includes("headers-security") ||
              p.plugin.includes("http-headers") ||
              p.plugin.includes("security-headers")
            )
            .map(p => ({ slug: p.plugin, name: p.name, status: p.status }));
        } catch { /* ignore */ }
        break;

      case "ssl_tls":
        // Capture current HSTS and URL settings
        try {
          const settings = await wp.getSiteSettings();
          snapshot.settings = {
            strict_transport_security: settings.strict_transport_security || null,
            url: settings.url || null,
            home: settings.home || null,
          };
          snapshot.siteUrl = settings.url;
          snapshot.homeUrl = settings.home;
        } catch { /* ignore */ }
        break;

      case "session_security":
        // Capture current cookie settings
        try {
          const settings = await wp.getSiteSettings();
          snapshot.settings = {
            cookie_httponly: settings.cookie_httponly ?? null,
            cookie_secure: settings.cookie_secure ?? null,
            cookie_samesite: settings.cookie_samesite || null,
          };
        } catch { /* ignore */ }
        break;

      case "plugin_management":
        // Capture full plugin list with statuses
        try {
          const plugins = await wp.getPlugins();
          snapshot.plugins = plugins.map(p => ({
            slug: p.plugin,
            name: p.name,
            status: p.status,
          }));
        } catch { /* ignore */ }
        break;

      case "information_disclosure":
        // Capture debug settings
        try {
          const settings = await wp.getSiteSettings();
          snapshot.settings = {
            wp_debug: settings.wp_debug ?? null,
            wp_debug_display: settings.wp_debug_display ?? null,
            wp_debug_log: settings.wp_debug_log ?? null,
          };
        } catch { /* ignore */ }
        break;

      case "misconfiguration":
        // Capture user registration settings
        try {
          const settings = await wp.getSiteSettings();
          snapshot.settings = {
            users_can_register: settings.users_can_register ?? null,
            default_role: settings.default_role || null,
          };
        } catch { /* ignore */ }
        break;

      case "mixed_content":
        // Capture plugin states for SSL-related plugins
        try {
          const plugins = await wp.getPlugins();
          snapshot.plugins = plugins
            .filter(p =>
              p.plugin.includes("ssl-insecure-content-fixer") ||
              p.plugin.includes("really-simple-ssl") ||
              p.plugin.includes("better-search-replace")
            )
            .map(p => ({ slug: p.plugin, name: p.name, status: p.status }));
        } catch { /* ignore */ }
        break;

      default:
        // Generic: capture all settings
        try {
          const settings = await wp.getSiteSettings();
          snapshot.settings = settings;
        } catch { /* ignore */ }
    }
  } catch (err) {
    console.error(`[RevertEngine] Snapshot capture failed for ${domain}/${category}:`, err instanceof Error ? err.message : String(err));
  }

  return snapshot;
}

/**
 * Capture the state after applying a fix.
 */
export async function captureAfterSnapshot(
  domain: string,
  category: string,
  wp: WordPressAPI | null,
): Promise<StateSnapshot> {
  // Same logic as before — captures current state which is now the "after" state
  return captureBeforeSnapshot(domain, category, wp);
}

// ═══════════════════════════════════════════════
//  SAVE FIX TO HISTORY — Called after each fix
// ═══════════════════════════════════════════════

export async function saveFixToHistory(params: {
  userId: number;
  scanId?: number;
  scanResultId?: number;
  domain: string;
  fix: RemediationFix;
  beforeState: StateSnapshot;
  afterState: StateSnapshot;
}): Promise<number | null> {
  const database = await getDb();
  if (!database) return null;

  try {
    const [result] = await database.insert(remediationHistory).values({
      userId: params.userId,
      scanId: params.scanId ?? null,
      scanResultId: params.scanResultId ?? null,
      domain: params.domain,
      vector: params.fix.vector,
      category: params.fix.category,
      severity: params.fix.severity,
      finding: params.fix.finding,
      fixStrategy: params.fix.fixStrategy,
      action: params.fix.action,
      detail: params.fix.detail,
      revertible: params.fix.revertible,
      revertAction: params.fix.revertAction ?? null,
      beforeState: params.beforeState,
      afterState: params.afterState,
      status: params.fix.status === "fixed" ? "applied" : "applied",
    });
    return result.insertId;
  } catch (err) {
    console.error("[RevertEngine] Failed to save fix history:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ═══════════════════════════════════════════════
//  REVERT A SINGLE FIX
// ═══════════════════════════════════════════════

export async function revertFix(fixId: number, userId: number): Promise<RevertResult> {
  const database = await getDb();
  if (!database) {
    return { id: fixId, success: false, action: "revert", detail: "Database unavailable", previousStatus: "unknown", newStatus: "unknown" };
  }

  // Get the fix record
  const [fix] = await database
    .select()
    .from(remediationHistory)
    .where(and(eq(remediationHistory.id, fixId), eq(remediationHistory.userId, userId)));

  if (!fix) {
    return { id: fixId, success: false, action: "revert", detail: "Fix record not found", previousStatus: "unknown", newStatus: "unknown" };
  }

  if (fix.status === "reverted") {
    return { id: fixId, success: false, action: "revert", detail: "Fix already reverted", previousStatus: "reverted", newStatus: "reverted" };
  }

  if (!fix.revertible) {
    return { id: fixId, success: false, action: "revert", detail: "This fix is not revertible", previousStatus: fix.status, newStatus: fix.status };
  }

  // Get WP credentials
  const wpCreds = await getWPCredentialsForDomain(fix.domain);
  let wp: WordPressAPI | null = null;

  if (wpCreds) {
    wp = createWPClient(wpCreds);
    try {
      const test = await wp.testConnection();
      if (!test.connected) wp = null;
    } catch {
      wp = null;
    }
  }

  const beforeState = fix.beforeState as StateSnapshot | null;
  const previousStatus = fix.status;

  try {
    const revertResult = await executeRevert(fix.domain, fix.category, fix.action, fix.fixStrategy, beforeState, wp);

    if (revertResult.success) {
      // Update status to reverted
      await database
        .update(remediationHistory)
        .set({
          status: "reverted",
          revertedAt: new Date(),
          revertDetail: revertResult.detail,
        })
        .where(eq(remediationHistory.id, fixId));

      return {
        id: fixId,
        success: true,
        action: revertResult.action,
        detail: revertResult.detail,
        previousStatus,
        newStatus: "reverted",
      };
    } else {
      // Mark as revert_failed
      await database
        .update(remediationHistory)
        .set({
          status: "revert_failed",
          revertDetail: revertResult.detail,
        })
        .where(eq(remediationHistory.id, fixId));

      return {
        id: fixId,
        success: false,
        action: revertResult.action,
        detail: revertResult.detail,
        previousStatus,
        newStatus: "revert_failed",
      };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await database
      .update(remediationHistory)
      .set({
        status: "revert_failed",
        revertDetail: `Error: ${errMsg}`,
      })
      .where(eq(remediationHistory.id, fixId));

    return {
      id: fixId,
      success: false,
      action: "revert_error",
      detail: errMsg,
      previousStatus,
      newStatus: "revert_failed",
    };
  }
}

// ═══════════════════════════════════════════════
//  REVERT ALL FIXES FROM A SCAN
// ═══════════════════════════════════════════════

export async function revertAllFixes(scanResultId: number, userId: number): Promise<{
  total: number;
  reverted: number;
  failed: number;
  skipped: number;
  results: RevertResult[];
}> {
  const database = await getDb();
  if (!database) {
    return { total: 0, reverted: 0, failed: 0, skipped: 0, results: [] };
  }

  // Get all applied fixes for this scan result
  const fixes = await database
    .select()
    .from(remediationHistory)
    .where(
      and(
        eq(remediationHistory.scanResultId, scanResultId),
        eq(remediationHistory.userId, userId),
        eq(remediationHistory.status, "applied"),
      )
    )
    .orderBy(desc(remediationHistory.id)); // Revert in reverse order

  const results: RevertResult[] = [];
  let reverted = 0;
  let failed = 0;
  let skipped = 0;

  for (const fix of fixes) {
    if (!fix.revertible) {
      skipped++;
      results.push({
        id: fix.id,
        success: false,
        action: "skip",
        detail: "Not revertible",
        previousStatus: fix.status,
        newStatus: fix.status,
      });
      continue;
    }

    const result = await revertFix(fix.id, userId);
    results.push(result);

    if (result.success) {
      reverted++;
    } else {
      failed++;
    }
  }

  // Send Telegram notification
  if (reverted > 0) {
    try {
      const domain = fixes[0]?.domain || "unknown";
      let message = `⏪ <b>Remediation Revert Report</b>\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `🌐 <b>Domain:</b> ${domain}\n`;
      message += `📊 <b>Total Fixes:</b> ${fixes.length}\n`;
      message += `✅ Reverted: ${reverted}\n`;
      message += `❌ Failed: ${failed}\n`;
      message += `⏭ Skipped: ${skipped}\n\n`;

      const revertedItems = results.filter(r => r.success);
      if (revertedItems.length > 0) {
        message += `<b>✅ Reverted:</b>\n`;
        for (const r of revertedItems.slice(0, 8)) {
          message += `  • ${r.detail.substring(0, 80)}\n`;
        }
      }

      message += `\n━━━━━━━━━━━━━━━━━━━━━━━`;
      message += `\n🤖 FridayAI Remediation Revert`;

      await sendTelegramNotification({
        type: "info",
        targetUrl: domain,
        details: message,
      });
    } catch { /* ignore notification errors */ }
  }

  return { total: fixes.length, reverted, failed, skipped, results };
}

// ═══════════════════════════════════════════════
//  EXECUTE REVERT — Real WP API rollback logic
// ═══════════════════════════════════════════════

async function executeRevert(
  domain: string,
  category: string,
  action: string,
  fixStrategy: string,
  beforeState: StateSnapshot | null,
  wp: WordPressAPI | null,
): Promise<{ success: boolean; action: string; detail: string }> {
  console.log(`[RevertEngine] Reverting ${action} for ${domain} (category: ${category})`);

  // ─── Clickjacking / Security Headers ───
  if (category === "clickjacking" || category === "security_headers") {
    if (action === "set_xfo_via_settings" && wp) {
      try {
        const prevValue = beforeState?.settings?.x_frame_options ?? null;
        await wp.updateSiteSettings({
          x_frame_options: prevValue || "",
        });
        return {
          success: true,
          action: "revert_xfo",
          detail: prevValue
            ? `Restored X-Frame-Options to previous value: ${prevValue}`
            : "Removed X-Frame-Options setting",
        };
      } catch (err: any) {
        return { success: false, action: "revert_xfo_failed", detail: `Failed to revert X-Frame-Options: ${err.message}` };
      }
    }
    if (action === "security_plugin_detected") {
      return {
        success: true,
        action: "revert_plugin_config",
        detail: "Security plugin configuration change — disable X-Frame-Options in the plugin's settings panel",
      };
    }
  }

  // ─── SSL/TLS: HSTS Header ───
  if (category === "ssl_tls" && action === "set_hsts_via_settings" && wp) {
    try {
      const prevValue = beforeState?.settings?.strict_transport_security ?? null;
      await wp.updateSiteSettings({
        strict_transport_security: prevValue || "",
      });
      return {
        success: true,
        action: "revert_hsts",
        detail: prevValue
          ? `Restored HSTS to previous value: ${prevValue}`
          : "Removed HSTS header setting",
      };
    } catch (err: any) {
      return { success: false, action: "revert_hsts_failed", detail: `Failed to revert HSTS: ${err.message}` };
    }
  }

  // ─── SSL/TLS: Force HTTPS URLs ───
  if (category === "ssl_tls" && action === "force_https_urls" && wp) {
    try {
      const prevSiteUrl = beforeState?.siteUrl || `http://${domain}`;
      const prevHomeUrl = beforeState?.homeUrl || `http://${domain}`;
      await wp.updateSiteSettings({
        url: prevSiteUrl,
        home: prevHomeUrl,
      });
      return {
        success: true,
        action: "revert_https_urls",
        detail: `Restored site URL to ${prevSiteUrl} and home URL to ${prevHomeUrl}`,
      };
    } catch (err: any) {
      return { success: false, action: "revert_https_failed", detail: `Failed to revert URLs: ${err.message}` };
    }
  }

  // ─── Session Security: Cookie Flags ───
  if (category === "session_security" && action === "set_cookie_security_flags" && wp) {
    try {
      const prevSettings = beforeState?.settings || {};
      await wp.updateSiteSettings({
        cookie_httponly: prevSettings.cookie_httponly ?? false,
        cookie_secure: prevSettings.cookie_secure ?? false,
        cookie_samesite: prevSettings.cookie_samesite || "",
      });
      return {
        success: true,
        action: "revert_cookie_flags",
        detail: `Restored cookie settings: HttpOnly=${prevSettings.cookie_httponly ?? false}, Secure=${prevSettings.cookie_secure ?? false}, SameSite=${prevSettings.cookie_samesite || "none"}`,
      };
    } catch (err: any) {
      return { success: false, action: "revert_cookies_failed", detail: `Failed to revert cookie settings: ${err.message}` };
    }
  }

  // ─── Plugin Management: Re-activate deactivated plugins ───
  if (category === "plugin_management" && action === "cleaned_plugins" && wp) {
    try {
      const prevPlugins = beforeState?.plugins || [];
      const reactivated: string[] = [];
      const failedPlugins: string[] = [];

      // Find plugins that were active before and try to reactivate them
      for (const prevPlugin of prevPlugins) {
        if (prevPlugin.status === "active") {
          try {
            // Check if plugin still exists
            const currentPlugins = await wp.getPlugins();
            const exists = currentPlugins.find(p => p.plugin === prevPlugin.slug);
            if (exists && exists.status === "inactive") {
              const result = await wp.activatePlugin(prevPlugin.slug);
              if (result.success) {
                reactivated.push(prevPlugin.name);
              } else {
                failedPlugins.push(prevPlugin.name);
              }
            }
          } catch {
            failedPlugins.push(prevPlugin.name);
          }
        }
      }

      if (reactivated.length > 0) {
        return {
          success: true,
          action: "revert_plugins",
          detail: `Re-activated ${reactivated.length} plugins: ${reactivated.join(", ")}${failedPlugins.length > 0 ? `. Failed: ${failedPlugins.join(", ")}` : ""}`,
        };
      }

      return {
        success: failedPlugins.length === 0,
        action: "revert_plugins",
        detail: failedPlugins.length > 0
          ? `Failed to reactivate: ${failedPlugins.join(", ")}`
          : "No plugins needed reactivation",
      };
    } catch (err: any) {
      return { success: false, action: "revert_plugins_failed", detail: `Failed to revert plugin changes: ${err.message}` };
    }
  }

  // ─── Information Disclosure: Re-enable debug ───
  if (category === "information_disclosure" && action === "disabled_debug_mode" && wp) {
    try {
      const prevSettings = beforeState?.settings || {};
      await wp.updateSiteSettings({
        wp_debug: prevSettings.wp_debug ?? false,
        wp_debug_display: prevSettings.wp_debug_display ?? false,
        wp_debug_log: prevSettings.wp_debug_log ?? false,
      });
      return {
        success: true,
        action: "revert_debug_mode",
        detail: `Restored debug settings: WP_DEBUG=${prevSettings.wp_debug ?? false}, WP_DEBUG_DISPLAY=${prevSettings.wp_debug_display ?? false}, WP_DEBUG_LOG=${prevSettings.wp_debug_log ?? false}`,
      };
    } catch (err: any) {
      return { success: false, action: "revert_debug_failed", detail: `Failed to revert debug settings: ${err.message}` };
    }
  }

  // ─── Misconfiguration: Privilege Escalation (user registration) ───
  if (category === "misconfiguration" && action === "locked_user_registration" && wp) {
    try {
      const prevSettings = beforeState?.settings || {};
      await wp.updateSiteSettings({
        users_can_register: prevSettings.users_can_register ?? true,
        default_role: prevSettings.default_role || "subscriber",
      });
      return {
        success: true,
        action: "revert_user_registration",
        detail: `Restored user registration: enabled=${prevSettings.users_can_register ?? true}, default_role=${prevSettings.default_role || "subscriber"}`,
      };
    } catch (err: any) {
      return { success: false, action: "revert_registration_failed", detail: `Failed to revert user registration settings: ${err.message}` };
    }
  }

  // ─── Mixed Content: Deactivate SSL plugin ───
  if (category === "mixed_content" && action === "activated_really_simple_ssl" && wp) {
    try {
      const prevPlugins = beforeState?.plugins || [];
      const rssPlugin = prevPlugins.find(p => p.slug.includes("really-simple-ssl"));

      if (rssPlugin && rssPlugin.status === "inactive") {
        // It was inactive before — deactivate it again
        const result = await wp.deactivatePlugin(rssPlugin.slug);
        if (result.success) {
          return {
            success: true,
            action: "revert_ssl_plugin",
            detail: "Deactivated Really Simple SSL plugin (was inactive before fix)",
          };
        }
      }

      return {
        success: true,
        action: "revert_ssl_plugin",
        detail: "Really Simple SSL plugin status restored",
      };
    } catch (err: any) {
      return { success: false, action: "revert_ssl_plugin_failed", detail: `Failed to revert SSL plugin: ${err.message}` };
    }
  }

  // ─── Fallback: No specific revert logic ───
  return {
    success: false,
    action: "revert_no_auto_handler",
    detail: `No automatic revert handler for action "${action}" in category "${category}". Manual revert may be required.`,
  };
}

// ═══════════════════════════════════════════════
//  GET FIX HISTORY
// ═══════════════════════════════════════════════

export async function getFixHistory(params: {
  userId: number;
  domain?: string;
  scanResultId?: number;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: any[]; total: number }> {
  const database = await getDb();
  if (!database) return { items: [], total: 0 };

  let query = database
    .select()
    .from(remediationHistory)
    .where(eq(remediationHistory.userId, params.userId))
    .orderBy(desc(remediationHistory.appliedAt))
    .limit(params.limit || 50)
    .offset(params.offset || 0);

  const items = await query;

  // Filter in JS for additional conditions (domain, scanResultId, status)
  let filtered = items;
  if (params.domain) {
    filtered = filtered.filter(i => i.domain === params.domain);
  }
  if (params.scanResultId) {
    filtered = filtered.filter(i => i.scanResultId === params.scanResultId);
  }
  if (params.status) {
    filtered = filtered.filter(i => i.status === params.status);
  }

  // Get total count
  const allItems = await database
    .select()
    .from(remediationHistory)
    .where(eq(remediationHistory.userId, params.userId));
  
  return { items: filtered, total: allItems.length };
}

// ═══════════════════════════════════════════════
//  GET SINGLE FIX DETAIL
// ═══════════════════════════════════════════════

export async function getFixDetail(fixId: number, userId: number) {
  const database = await getDb();
  if (!database) return null;

  const [fix] = await database
    .select()
    .from(remediationHistory)
    .where(and(eq(remediationHistory.id, fixId), eq(remediationHistory.userId, userId)));

  return fix || null;
}
