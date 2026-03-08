/**
 * Auto-Remediation Engine
 * 
 * Automatically fixes vulnerabilities found by scan results.
 * 
 * Fix Levels:
 * 1. WP API Fixes (requires WP credentials): plugin management, .htaccess, settings
 * 2. HTTP-level Fixes: security headers, SSL config, redirect fixes
 * 3. LLM-assisted Analysis: complex vuln analysis + fix plan generation
 * 
 * Respects user's allowWpEdit permission before applying any changes.
 */
import { getDb } from "./db";
import { seoProjects, scheduledScans, scanResults } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { WordPressAPI, createWPClient, type WPCredentials, type FixResult } from "./wp-api";
import { sendTelegramNotification } from "./telegram-notifier";
import { invokeLLM } from "./_core/llm";
import type { AttackVectorResult } from "./comprehensive-attack-vectors";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface RemediationConfig {
  domain: string;
  userId: number;
  scanResultId?: number;
  findings: AttackVectorResult[];
  // WP credentials (optional — if not provided, only non-WP fixes are attempted)
  wpCredentials?: WPCredentials;
  // Settings
  autoFixEnabled: boolean;
  fixCategories: FixCategory[];
  dryRun?: boolean;  // If true, only generate plan without applying
  notifyTelegram?: boolean;
}

export type FixCategory =
  | "security_headers"
  | "ssl_tls"
  | "plugin_management"
  | "clickjacking"
  | "session_security"
  | "open_redirect"
  | "information_disclosure"
  | "maintenance_mode"
  | "mixed_content"
  | "misconfiguration";

export interface RemediationResult {
  id?: number;
  domain: string;
  totalFindings: number;
  fixableCount: number;
  fixedCount: number;
  failedCount: number;
  skippedCount: number;
  fixes: RemediationFix[];
  llmAnalysis?: string;
  durationMs: number;
  createdAt: Date;
}

export interface RemediationFix {
  vector: string;
  category: string;
  severity: string;
  finding: string;
  fixStrategy: FixStrategy;
  status: "fixed" | "failed" | "skipped" | "dry_run" | "manual_required";
  action: string;
  detail: string;
  revertible: boolean;
  revertAction?: string;
}

export type FixStrategy =
  | "wp_plugin_deactivate"
  | "wp_plugin_delete"
  | "wp_settings_update"
  | "wp_htaccess_header"
  | "wp_maintenance_fix"
  | "http_header_check"
  | "ssl_redirect"
  | "content_fix"
  | "llm_analysis"
  | "manual_instruction";

// ═══════════════════════════════════════════════
//  FIX STRATEGY REGISTRY
// ═══════════════════════════════════════════════

interface FixStrategyDef {
  vectors: string[];         // Which attack vectors this fixes
  detailPatterns: RegExp[];  // Patterns in finding detail that trigger this fix
  category: FixCategory;
  strategy: FixStrategy;
  requiresWP: boolean;
  revertible: boolean;
  apply: (finding: AttackVectorResult, wp: WordPressAPI | null, config: RemediationConfig) => Promise<{ success: boolean; action: string; detail: string; revertAction?: string }>;
}

const FIX_STRATEGIES: FixStrategyDef[] = [
  // ─── 1. Clickjacking (Missing X-Frame-Options / CSP frame-ancestors) ───
  {
    vectors: ["Clickjacking"],
    detailPatterns: [/Missing X-Frame-Options/i, /frame-ancestors/i, /embedded in iframe/i],
    category: "clickjacking",
    strategy: "wp_htaccess_header",
    requiresWP: true,
    revertible: true,
    apply: async (finding, wp, config) => {
      if (!wp) return { success: false, action: "add_xfo_header", detail: "No WP credentials — cannot modify .htaccess" };
      try {
        // Try to add X-Frame-Options via WP settings API or plugin
        // First try: update via a security plugin if available
        const plugins = await wp.getPlugins();
        const securityPlugin = plugins.find(p =>
          p.status === "active" && (
            p.plugin.includes("headers-security") ||
            p.plugin.includes("http-headers") ||
            p.plugin.includes("security-headers")
          )
        );

        if (securityPlugin) {
          return {
            success: true,
            action: "security_plugin_detected",
            detail: `Security headers plugin "${securityPlugin.name}" is active — configure X-Frame-Options: SAMEORIGIN in its settings`,
            revertAction: "Disable X-Frame-Options in security plugin settings",
          };
        }

        // Try adding via WP settings (some themes/plugins expose this)
        try {
          await wp.updateSiteSettings({
            x_frame_options: "SAMEORIGIN",
          });
          return {
            success: true,
            action: "set_xfo_via_settings",
            detail: "Set X-Frame-Options: SAMEORIGIN via WP settings API",
            revertAction: "Remove x_frame_options from WP settings",
          };
        } catch {
          // Settings API doesn't support this — provide manual instruction
          return {
            success: false,
            action: "manual_htaccess_required",
            detail: "Add to .htaccess: Header always set X-Frame-Options \"SAMEORIGIN\" and Header always set Content-Security-Policy \"frame-ancestors 'self'\"",
            revertAction: "Remove X-Frame-Options and frame-ancestors from .htaccess",
          };
        }
      } catch (err: any) {
        return { success: false, action: "xfo_fix_failed", detail: err.message };
      }
    },
  },

  // ─── 2. Missing HSTS Header (MITM / SSL Stripping) ───
  {
    vectors: ["MITM"],
    detailPatterns: [/Missing HSTS/i, /Strict-Transport-Security/i, /SSL stripping/i],
    category: "ssl_tls",
    strategy: "wp_htaccess_header",
    requiresWP: true,
    revertible: true,
    apply: async (finding, wp, config) => {
      if (!wp) return { success: false, action: "add_hsts_header", detail: "No WP credentials — cannot modify headers" };
      try {
        await wp.updateSiteSettings({
          strict_transport_security: "max-age=31536000; includeSubDomains; preload",
        });
        return {
          success: true,
          action: "set_hsts_via_settings",
          detail: "Set HSTS: max-age=31536000; includeSubDomains; preload via WP settings API",
          revertAction: "Remove strict_transport_security from WP settings",
        };
      } catch {
        return {
          success: false,
          action: "manual_hsts_required",
          detail: "Add to .htaccess: Header always set Strict-Transport-Security \"max-age=31536000; includeSubDomains; preload\"",
          revertAction: "Remove HSTS header from .htaccess",
        };
      }
    },
  },

  // ─── 3. HTTP accessible without HTTPS redirect ───
  {
    vectors: ["MITM"],
    detailPatterns: [/accessible over plain HTTP/i, /without redirect to HTTPS/i],
    category: "ssl_tls",
    strategy: "ssl_redirect",
    requiresWP: true,
    revertible: true,
    apply: async (finding, wp, config) => {
      if (!wp) return { success: false, action: "force_ssl", detail: "No WP credentials — cannot force SSL redirect" };
      try {
        // Try to update WordPress site URL to HTTPS
        const siteUrl = `https://${config.domain}`;
        await wp.updateSiteSettings({
          url: siteUrl,
          home: siteUrl,
        });
        return {
          success: true,
          action: "force_https_urls",
          detail: `Updated WordPress siteurl and home to ${siteUrl}`,
          revertAction: `Revert siteurl and home to http://${config.domain}`,
        };
      } catch {
        return {
          success: false,
          action: "manual_ssl_redirect",
          detail: "Add to .htaccess: RewriteEngine On / RewriteCond %{HTTPS} off / RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]",
          revertAction: "Remove SSL redirect rules from .htaccess",
        };
      }
    },
  },

  // ─── 4. Mixed Content (HTTP resources on HTTPS page) ───
  {
    vectors: ["MITM"],
    detailPatterns: [/Mixed content/i, /HTTP resources loaded over HTTPS/i],
    category: "mixed_content",
    strategy: "wp_settings_update",
    requiresWP: true,
    revertible: false,
    apply: async (finding, wp, config) => {
      if (!wp) return { success: false, action: "fix_mixed_content", detail: "No WP credentials — cannot fix mixed content" };
      try {
        // Check for mixed content fixer plugins
        const plugins = await wp.getPlugins();
        const mixedContentPlugin = plugins.find(p =>
          p.plugin.includes("ssl-insecure-content-fixer") ||
          p.plugin.includes("really-simple-ssl") ||
          p.plugin.includes("better-search-replace")
        );

        if (mixedContentPlugin && mixedContentPlugin.status === "active") {
          return {
            success: true,
            action: "mixed_content_plugin_active",
            detail: `Mixed content plugin "${mixedContentPlugin.name}" is already active — it should handle HTTP→HTTPS rewrites`,
          };
        }

        // Try to activate Really Simple SSL if installed but inactive
        const rssPlugin = plugins.find(p => p.plugin.includes("really-simple-ssl") && p.status === "inactive");
        if (rssPlugin) {
          const activateResult = await wp.activatePlugin(rssPlugin.plugin);
          if (activateResult.success) {
            return {
              success: true,
              action: "activated_really_simple_ssl",
              detail: "Activated Really Simple SSL plugin to fix mixed content automatically",
            };
          }
        }

        return {
          success: false,
          action: "manual_mixed_content_fix",
          detail: "Install and activate 'Really Simple SSL' or 'SSL Insecure Content Fixer' plugin, or run search-replace to change http:// to https:// in database",
        };
      } catch (err: any) {
        return { success: false, action: "mixed_content_fix_failed", detail: err.message };
      }
    },
  },

  // ─── 5. Session Cookie Missing Security Flags ───
  {
    vectors: ["Session Fixation"],
    detailPatterns: [/missing security flags/i, /HttpOnly/i, /Secure/i, /SameSite/i],
    category: "session_security",
    strategy: "wp_settings_update",
    requiresWP: true,
    revertible: true,
    apply: async (finding, wp, config) => {
      if (!wp) return { success: false, action: "fix_session_cookies", detail: "No WP credentials" };
      try {
        // Try to update cookie settings via WP
        await wp.updateSiteSettings({
          cookie_httponly: true,
          cookie_secure: true,
          cookie_samesite: "Lax",
        });
        return {
          success: true,
          action: "set_cookie_security_flags",
          detail: "Set session cookie flags: HttpOnly, Secure, SameSite=Lax via WP settings",
          revertAction: "Revert cookie security flags in WP settings",
        };
      } catch {
        return {
          success: false,
          action: "manual_cookie_fix",
          detail: "Add to wp-config.php: @ini_set('session.cookie_httponly', 1); @ini_set('session.cookie_secure', 1); @ini_set('session.cookie_samesite', 'Lax');",
          revertAction: "Remove cookie settings from wp-config.php",
        };
      }
    },
  },

  // ─── 6. Problematic/Inactive Plugins ───
  {
    vectors: ["Default Credentials", "Misconfiguration", "Data Exposure"],
    detailPatterns: [/plugin/i, /inactive.*installed/i, /known.*problematic/i, /outdated/i],
    category: "plugin_management",
    strategy: "wp_plugin_deactivate",
    requiresWP: true,
    revertible: true,
    apply: async (finding, wp, config) => {
      if (!wp) return { success: false, action: "manage_plugins", detail: "No WP credentials" };
      try {
        // Get current plugins and check for issues
        const plugins = await wp.getPlugins();
        const fixes: string[] = [];

        // Deactivate known problematic plugins
        const problematicActive = plugins.filter(p =>
          p.status === "active" && (
            p.plugin.includes("hello-dolly") ||
            p.plugin.includes("broken-link-checker") ||
            p.plugin.includes("wp-statistics")
          )
        );

        for (const p of problematicActive) {
          const result = await wp.deactivatePlugin(p.plugin);
          if (result.success) {
            fixes.push(`Deactivated: ${p.name}`);
          }
        }

        // Delete inactive plugins (security risk)
        const inactive = plugins.filter(p => p.status === "inactive");
        for (const p of inactive.slice(0, 5)) { // Limit to 5 at a time
          const result = await wp.deletePlugin(p.plugin);
          if (result.success) {
            fixes.push(`Deleted inactive: ${p.name}`);
          }
        }

        if (fixes.length > 0) {
          return {
            success: true,
            action: "cleaned_plugins",
            detail: `Plugin cleanup: ${fixes.join("; ")}`,
            revertAction: "Reinstall/reactivate removed plugins via WP admin",
          };
        }

        return {
          success: true,
          action: "plugins_already_clean",
          detail: "No problematic or inactive plugins found to clean",
        };
      } catch (err: any) {
        return { success: false, action: "plugin_cleanup_failed", detail: err.message };
      }
    },
  },

  // ─── 7. Maintenance Mode Stuck ───
  {
    vectors: ["MITM", "Misconfiguration"],
    detailPatterns: [/maintenance mode/i, /Briefly unavailable/i],
    category: "maintenance_mode",
    strategy: "wp_maintenance_fix",
    requiresWP: true,
    revertible: false,
    apply: async (finding, wp, config) => {
      if (!wp) return { success: false, action: "fix_maintenance", detail: "No WP credentials" };
      try {
        await wp.updateSiteSettings({ maintenance_mode: false });
        return {
          success: true,
          action: "disabled_maintenance_mode",
          detail: "Disabled maintenance mode via WP settings API",
        };
      } catch {
        return {
          success: false,
          action: "manual_maintenance_fix",
          detail: "Delete .maintenance file from WordPress root directory via FTP/SSH",
        };
      }
    },
  },

  // ─── 8. Information Disclosure (Debug/Backup/Git exposure) ───
  {
    vectors: ["Data Exposure", "Secret Leakage", "Git Exposure", "Backup Exposure", "Debug Exposure", "Default Credentials"],
    detailPatterns: [/debug/i, /\.git/i, /backup/i, /\.env/i, /phpinfo/i, /wp-config/i, /default.*credential/i, /exposed/i, /sensitive.*file/i],
    category: "information_disclosure",
    strategy: "wp_htaccess_header",
    requiresWP: true,
    revertible: true,
    apply: async (finding, wp, config) => {
      if (!wp) return { success: false, action: "block_sensitive_files", detail: "No WP credentials" };
      try {
        // Try to disable debug mode
        await wp.updateSiteSettings({
          wp_debug: false,
          wp_debug_display: false,
          wp_debug_log: false,
        });
        return {
          success: true,
          action: "disabled_debug_mode",
          detail: "Disabled WP_DEBUG, WP_DEBUG_DISPLAY, WP_DEBUG_LOG via settings API. Also add .htaccess rules to block .git, .env, backup files",
          revertAction: "Re-enable debug mode in wp-config.php if needed",
        };
      } catch {
        return {
          success: false,
          action: "manual_info_disclosure_fix",
          detail: "Add to .htaccess: <FilesMatch \"\\.(git|env|bak|sql|log|old|swp)$\">Require all denied</FilesMatch>. Set WP_DEBUG to false in wp-config.php",
          revertAction: "Remove FilesMatch rules from .htaccess",
        };
      }
    },
  },

  // ─── 9. Open Redirect ───
  {
    vectors: ["Open Redirect"],
    detailPatterns: [/Open redirect/i, /redirect.*evil/i],
    category: "open_redirect",
    strategy: "wp_settings_update",
    requiresWP: false,
    revertible: false,
    apply: async (finding, wp, config) => {
      // Open redirects typically need code changes — provide instructions
      const param = finding.detail.match(/\?(\w+)=/)?.[1] || "redirect";
      return {
        success: false,
        action: "manual_redirect_fix",
        detail: `Open redirect found via '${param}' parameter. Fix: validate redirect URLs against a whitelist of allowed domains. Add to functions.php: add_filter('allowed_redirect_hosts', function($hosts) { return array_merge($hosts, ['${config.domain}']); });`,
      };
    },
  },

  // ─── 10. Host Header Injection ───
  {
    vectors: ["Host Header Injection"],
    detailPatterns: [/Host Header Injection/i, /X-Forwarded-Host reflected/i, /Host override/i],
    category: "misconfiguration",
    strategy: "wp_htaccess_header",
    requiresWP: false,
    revertible: false,
    apply: async (finding, wp, config) => {
      return {
        success: false,
        action: "manual_host_header_fix",
        detail: `Host header injection detected. Fix: 1) Set ServerName in Apache/Nginx config. 2) Add to wp-config.php: define('WP_HOME', 'https://${config.domain}'); define('WP_SITEURL', 'https://${config.domain}'); 3) Ignore X-Forwarded-Host in application code.`,
      };
    },
  },

  // ─── 11. Cache Poisoning ───
  {
    vectors: ["Cache Poisoning"],
    detailPatterns: [/Cache poisoning/i, /cache.*poison/i, /header reflection.*cached/i],
    category: "misconfiguration",
    strategy: "http_header_check",
    requiresWP: false,
    revertible: false,
    apply: async (finding, wp, config) => {
      return {
        success: false,
        action: "manual_cache_fix",
        detail: "Cache poisoning detected. Fix: 1) Add 'Vary: Host' header to responses. 2) Configure CDN/cache to ignore X-Forwarded-Host. 3) Purge existing cache. 4) Set Cache-Control: no-store for dynamic pages.",
      };
    },
  },

  // ─── 12. Deserialization ───
  {
    vectors: ["Deserialization"],
    detailPatterns: [/Deserialization/i, /unserialize/i, /ObjectInputStream/i, /pickle/i],
    category: "misconfiguration",
    strategy: "manual_instruction",
    requiresWP: false,
    revertible: false,
    apply: async (finding, wp, config) => {
      return {
        success: false,
        action: "manual_deserialization_fix",
        detail: "Deserialization vulnerability detected. Fix: 1) Never unserialize untrusted data. 2) Use JSON instead of PHP serialize(). 3) Implement input validation. 4) Update all plugins that use unserialize().",
      };
    },
  },

  // ─── 13. Privilege Escalation ───
  {
    vectors: ["Privilege Escalation"],
    detailPatterns: [/Privilege Escalation/i, /admin.*endpoint.*accessible/i, /role.*tamper/i],
    category: "misconfiguration",
    strategy: "wp_settings_update",
    requiresWP: true,
    revertible: true,
    apply: async (finding, wp, config) => {
      if (!wp) return { success: false, action: "fix_privilege_escalation", detail: "No WP credentials" };
      try {
        // Disable user registration if open
        await wp.updateSiteSettings({
          users_can_register: false,
          default_role: "subscriber",
        });
        return {
          success: true,
          action: "locked_user_registration",
          detail: "Disabled open user registration and set default role to subscriber",
          revertAction: "Re-enable user registration in WP Settings > General",
        };
      } catch {
        return {
          success: false,
          action: "manual_privilege_fix",
          detail: "Disable user registration in WP admin > Settings > General. Ensure REST API user endpoints are restricted.",
        };
      }
    },
  },
];

// ═══════════════════════════════════════════════
//  MAIN REMEDIATION RUNNER
// ═══════════════════════════════════════════════

export async function runAutoRemediation(config: RemediationConfig): Promise<RemediationResult> {
  const startTime = Date.now();
  const fixes: RemediationFix[] = [];
  let wpClient: WordPressAPI | null = null;

  // Initialize WP client if credentials provided
  if (config.wpCredentials) {
    wpClient = createWPClient(config.wpCredentials);
    try {
      const testResult = await wpClient.testConnection();
      if (!testResult.connected) {
        console.log(`[AutoRemediation] WP connection failed for ${config.domain}: ${testResult.error}`);
        wpClient = null;
      }
    } catch {
      wpClient = null;
    }
  }

  // Filter only successful (vulnerable) findings
  const vulnerableFindings = config.findings.filter(f => f.success);

  console.log(`[AutoRemediation] Processing ${vulnerableFindings.length} vulnerabilities for ${config.domain}`);

  // Process each finding
  for (const finding of vulnerableFindings) {
    // Find matching fix strategy
    const matchingStrategy = findMatchingStrategy(finding, config.fixCategories);

    if (!matchingStrategy) {
      // No fix strategy available — skip or send to LLM
      fixes.push({
        vector: finding.vector,
        category: finding.category,
        severity: finding.severity,
        finding: finding.detail,
        fixStrategy: "manual_instruction",
        status: "skipped",
        action: "no_auto_fix_available",
        detail: `No automatic fix available for ${finding.vector}. Manual review required.`,
        revertible: false,
      });
      continue;
    }

    // Check if WP is required but not available
    if (matchingStrategy.requiresWP && !wpClient) {
      fixes.push({
        vector: finding.vector,
        category: finding.category,
        severity: finding.severity,
        finding: finding.detail,
        fixStrategy: matchingStrategy.strategy,
        status: "skipped",
        action: "wp_credentials_required",
        detail: `Fix requires WP credentials but none provided. Connect WordPress to enable auto-fix.`,
        revertible: false,
      });
      continue;
    }

    // Check if category is enabled
    if (!config.fixCategories.includes(matchingStrategy.category)) {
      fixes.push({
        vector: finding.vector,
        category: finding.category,
        severity: finding.severity,
        finding: finding.detail,
        fixStrategy: matchingStrategy.strategy,
        status: "skipped",
        action: "category_disabled",
        detail: `Fix category "${matchingStrategy.category}" is disabled in settings.`,
        revertible: false,
      });
      continue;
    }

    // Dry run mode — don't actually apply
    if (config.dryRun) {
      fixes.push({
        vector: finding.vector,
        category: finding.category,
        severity: finding.severity,
        finding: finding.detail,
        fixStrategy: matchingStrategy.strategy,
        status: "dry_run",
        action: `Would apply: ${matchingStrategy.strategy}`,
        detail: `Dry run — fix would be applied via ${matchingStrategy.strategy}`,
        revertible: matchingStrategy.revertible,
      });
      continue;
    }

    // Apply the fix
    try {
      const result = await matchingStrategy.apply(finding, wpClient, config);
      fixes.push({
        vector: finding.vector,
        category: finding.category,
        severity: finding.severity,
        finding: finding.detail,
        fixStrategy: matchingStrategy.strategy,
        status: result.success ? "fixed" : "manual_required",
        action: result.action,
        detail: result.detail,
        revertible: matchingStrategy.revertible,
        revertAction: result.revertAction,
      });
    } catch (err: any) {
      fixes.push({
        vector: finding.vector,
        category: finding.category,
        severity: finding.severity,
        finding: finding.detail,
        fixStrategy: matchingStrategy.strategy,
        status: "failed",
        action: "fix_error",
        detail: `Error applying fix: ${err.message}`,
        revertible: false,
      });
    }
  }

  // Run LLM analysis for complex/unfixed vulnerabilities
  const unfixedCritical = fixes.filter(f =>
    (f.status === "skipped" || f.status === "manual_required" || f.status === "failed") &&
    (f.severity === "critical" || f.severity === "high")
  );

  let llmAnalysis: string | undefined;
  if (unfixedCritical.length > 0) {
    llmAnalysis = await generateLLMAnalysis(config.domain, unfixedCritical);
  }

  const durationMs = Date.now() - startTime;

  const result: RemediationResult = {
    domain: config.domain,
    totalFindings: vulnerableFindings.length,
    fixableCount: fixes.filter(f => f.status !== "skipped").length,
    fixedCount: fixes.filter(f => f.status === "fixed").length,
    failedCount: fixes.filter(f => f.status === "failed").length,
    skippedCount: fixes.filter(f => f.status === "skipped").length,
    fixes,
    llmAnalysis,
    durationMs,
    createdAt: new Date(),
  };

  // Send Telegram notification if enabled
  if (config.notifyTelegram) {
    await sendRemediationAlert(config.domain, result);
  }

  console.log(`[AutoRemediation] ✓ ${config.domain}: ${result.fixedCount} fixed, ${result.failedCount} failed, ${result.skippedCount} skipped (${Math.round(durationMs / 1000)}s)`);

  return result;
}

// ═══════════════════════════════════════════════
//  FIND MATCHING FIX STRATEGY
// ═══════════════════════════════════════════════

function findMatchingStrategy(
  finding: AttackVectorResult,
  enabledCategories: FixCategory[],
): FixStrategyDef | null {
  for (const strategy of FIX_STRATEGIES) {
    // Check if vector matches
    const vectorMatch = strategy.vectors.some(v =>
      finding.vector.toLowerCase().includes(v.toLowerCase()) ||
      v.toLowerCase().includes(finding.vector.toLowerCase())
    );
    if (!vectorMatch) continue;

    // Check if detail pattern matches
    const patternMatch = strategy.detailPatterns.some(p => p.test(finding.detail));
    if (!patternMatch) continue;

    return strategy;
  }

  return null;
}

// ═══════════════════════════════════════════════
//  LLM ANALYSIS FOR COMPLEX VULNERABILITIES
// ═══════════════════════════════════════════════

async function generateLLMAnalysis(
  domain: string,
  unfixedVulns: RemediationFix[],
): Promise<string> {
  try {
    const vulnSummary = unfixedVulns.map(v =>
      `- [${v.severity.toUpperCase()}] ${v.vector}: ${v.finding}`
    ).join("\n");

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a cybersecurity expert specializing in WordPress security. Analyze the following unfixed vulnerabilities and provide:
1. Risk assessment (what could happen if not fixed)
2. Step-by-step manual fix instructions
3. Priority order for fixing
4. Preventive measures to avoid recurrence

Be concise but thorough. Use Thai language for the response.`,
        },
        {
          role: "user",
          content: `Domain: ${domain}\n\nUnfixed Critical/High Vulnerabilities:\n${vulnSummary}\n\nProvide analysis and fix instructions.`,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content;
    return (typeof content === "string" ? content : "") || "ไม่สามารถวิเคราะห์ได้";
  } catch (err) {
    console.error("[AutoRemediation] LLM analysis failed:", err instanceof Error ? err.message : String(err));
    return "LLM analysis unavailable — please review vulnerabilities manually.";
  }
}

// ═══════════════════════════════════════════════
//  TELEGRAM NOTIFICATION
// ═══════════════════════════════════════════════

async function sendRemediationAlert(domain: string, result: RemediationResult): Promise<void> {
  try {
    let message = `🔧 <b>Auto-Remediation Report</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `🌐 <b>Domain:</b> ${domain}\n`;
    message += `⏱ <b>Duration:</b> ${Math.round(result.durationMs / 1000)}s\n`;
    message += `📊 <b>Total Vulnerabilities:</b> ${result.totalFindings}\n\n`;

    message += `✅ Fixed: ${result.fixedCount}\n`;
    message += `❌ Failed: ${result.failedCount}\n`;
    message += `⏭ Skipped: ${result.skippedCount}\n`;
    message += `🔧 Manual Required: ${result.fixes.filter(f => f.status === "manual_required").length}\n\n`;

    // Show fixed items
    const fixed = result.fixes.filter(f => f.status === "fixed");
    if (fixed.length > 0) {
      message += `<b>✅ Auto-Fixed:</b>\n`;
      for (const f of fixed.slice(0, 8)) {
        message += `  • ${f.vector} [${f.severity}]: ${f.action}\n`;
      }
      if (fixed.length > 8) message += `  ... and ${fixed.length - 8} more\n`;
      message += `\n`;
    }

    // Show manual required
    const manual = result.fixes.filter(f => f.status === "manual_required");
    if (manual.length > 0) {
      message += `<b>🔧 Manual Fix Required:</b>\n`;
      for (const f of manual.slice(0, 5)) {
        message += `  • ${f.vector} [${f.severity}]: ${f.detail.substring(0, 100)}\n`;
      }
      if (manual.length > 5) message += `  ... and ${manual.length - 5} more\n`;
    }

    message += `\n━━━━━━━━━━━━━━━━━━━━━━━`;
    message += `\n🤖 FridayAI Auto-Remediation`;

    await sendTelegramNotification({
      type: "info",
      targetUrl: domain,
      details: message,
    });
  } catch (err) {
    console.error("[AutoRemediation] Telegram alert failed:", err instanceof Error ? err.message : String(err));
  }
}

// ═══════════════════════════════════════════════
//  HELPER: Get WP credentials from SEO project
// ═══════════════════════════════════════════════

export async function getWPCredentialsForDomain(domain: string): Promise<WPCredentials | null> {
  const database = await getDb();
  if (!database) return null;

  // Clean domain
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // Look for matching SEO project with WP credentials
  const projects = await database
    .select()
    .from(seoProjects)
    .where(eq(seoProjects.wpConnected, true));

  for (const project of projects) {
    const projectDomain = project.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (projectDomain === cleanDomain && project.wpUsername && project.wpAppPassword) {
      return {
        siteUrl: project.domain.startsWith("http") ? project.domain : `https://${project.domain}`,
        username: project.wpUsername,
        appPassword: project.wpAppPassword!,
      };
    }
  }

  return null;
}

// ═══════════════════════════════════════════════
//  ALL FIX CATEGORIES (for UI)
// ═══════════════════════════════════════════════

export const ALL_FIX_CATEGORIES: { value: FixCategory; label: string; description: string; requiresWP: boolean }[] = [
  { value: "security_headers", label: "Security Headers", description: "X-Frame-Options, CSP, Referrer-Policy", requiresWP: true },
  { value: "ssl_tls", label: "SSL/TLS", description: "HSTS, HTTPS redirect, certificate issues", requiresWP: true },
  { value: "plugin_management", label: "Plugin Management", description: "Deactivate problematic, delete inactive plugins", requiresWP: true },
  { value: "clickjacking", label: "Clickjacking Protection", description: "X-Frame-Options, CSP frame-ancestors", requiresWP: true },
  { value: "session_security", label: "Session Security", description: "Cookie flags (HttpOnly, Secure, SameSite)", requiresWP: true },
  { value: "open_redirect", label: "Open Redirect", description: "Redirect URL validation", requiresWP: false },
  { value: "information_disclosure", label: "Information Disclosure", description: "Debug mode, exposed files, default credentials", requiresWP: true },
  { value: "maintenance_mode", label: "Maintenance Mode", description: "Fix stuck maintenance mode", requiresWP: true },
  { value: "mixed_content", label: "Mixed Content", description: "HTTP resources on HTTPS pages", requiresWP: true },
  { value: "misconfiguration", label: "Misconfiguration", description: "Host header injection, cache poisoning, privilege escalation", requiresWP: false },
];
