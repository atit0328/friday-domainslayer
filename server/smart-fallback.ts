/**
 * Smart Fallback Strategy — Intelligent pipeline method selection
 * 
 * When file upload fails, this module analyzes WHY it failed and recommends
 * which alternative attack vectors to try next, instead of blindly retrying.
 * 
 * Key features:
 * - Failure pattern analysis (HTTP status, WAF, writable paths, PHP execution)
 * - Dynamic method prioritization based on target characteristics
 * - Skip methods with 0% chance of success
 * - Auto-escalation from basic → advanced → shellless → AI Commander
 * - Time budget management per phase
 */

import type { AttackLogger, SmartFallbackRecommendation } from "./attack-logger";
import type { PreScreenResult } from "./ai-prescreening";
import type { AiTargetAnalysis } from "./ai-target-analysis";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface TargetProfile {
  domain: string;
  cms: string;
  waf: string | null;
  serverType: string;
  hasWritablePaths: boolean;
  writablePathCount: number;
  phpExecutes: boolean;
  successProbability: number;
  isWordPress: boolean;
  hasCloudflare: boolean;
  hasWpAdmin: boolean;
  ftpAvailable: boolean;
  webdavAvailable: boolean;
  originIp: string | null;
}

export interface AttackMethod {
  id: string;
  name: string;
  category: "upload" | "exploit" | "shellless" | "indirect" | "brute" | "ai";
  requiresWritablePaths: boolean;
  requiresPhpExecution: boolean;
  requiresWpAdmin: boolean;
  bypassesWaf: boolean;
  estimatedTime: number; // seconds
  priority: number; // 1-100, higher = try first
  conditions: (profile: TargetProfile) => boolean;
}

export interface FallbackPlan {
  methods: Array<{
    method: AttackMethod;
    reason: string;
    estimatedSuccessRate: number;
    timeBudget: number; // seconds
  }>;
  skipMethods: Array<{
    method: string;
    reason: string;
  }>;
  totalEstimatedTime: number;
  strategy: string;
}

// ═══════════════════════════════════════════════
//  ALL ATTACK METHODS REGISTRY
// ═══════════════════════════════════════════════

export const ATTACK_METHODS: AttackMethod[] = [
  // ── Upload Methods ──
  {
    id: "standard_upload",
    name: "Standard File Upload (PUT/POST)",
    category: "upload",
    requiresWritablePaths: true,
    requiresPhpExecution: true,
    requiresWpAdmin: false,
    bypassesWaf: false,
    estimatedTime: 30,
    priority: 90,
    conditions: (p) => p.hasWritablePaths && p.phpExecutes,
  },
  {
    id: "waf_bypass_upload",
    name: "WAF Bypass Upload (header spoofing, chunked encoding)",
    category: "upload",
    requiresWritablePaths: true,
    requiresPhpExecution: true,
    requiresWpAdmin: false,
    bypassesWaf: true,
    estimatedTime: 45,
    priority: 85,
    conditions: (p) => p.hasWritablePaths && p.phpExecutes && !!p.waf,
  },
  {
    id: "parallel_multi_vector",
    name: "Multi-Vector Parallel Upload",
    category: "upload",
    requiresWritablePaths: true,
    requiresPhpExecution: true,
    requiresWpAdmin: false,
    bypassesWaf: true,
    estimatedTime: 60,
    priority: 80,
    conditions: (p) => p.hasWritablePaths,
  },
  {
    id: "alt_upload_ftp",
    name: "FTP Upload",
    category: "upload",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: true,
    estimatedTime: 20,
    priority: 75,
    conditions: (p) => p.ftpAvailable,
  },
  {
    id: "alt_upload_webdav",
    name: "WebDAV Upload",
    category: "upload",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: true,
    estimatedTime: 20,
    priority: 70,
    conditions: (p) => p.webdavAvailable,
  },
  // ── WordPress Exploits ──
  {
    id: "wp_admin_takeover",
    name: "WP Admin Takeover (plugin/theme editor)",
    category: "exploit",
    requiresWritablePaths: false,
    requiresPhpExecution: true,
    requiresWpAdmin: true,
    bypassesWaf: true,
    estimatedTime: 60,
    priority: 88,
    conditions: (p) => p.isWordPress && p.hasWpAdmin,
  },
  {
    id: "wp_brute_force",
    name: "WP Brute Force Login",
    category: "brute",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: true,
    bypassesWaf: false,
    estimatedTime: 120,
    priority: 60,
    conditions: (p) => p.isWordPress,
  },
  {
    id: "wp_db_injection",
    name: "WP Database Injection (wp_options, wp_posts)",
    category: "exploit",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: true,
    estimatedTime: 45,
    priority: 65,
    conditions: (p) => p.isWordPress,
  },
  {
    id: "wp_xmlrpc_exploit",
    name: "WP XML-RPC Exploit",
    category: "exploit",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: false,
    estimatedTime: 30,
    priority: 55,
    conditions: (p) => p.isWordPress,
  },
  // ── Non-WP CMS Exploits ──
  {
    id: "nonwp_cms_exploit",
    name: "Non-WP CMS Exploit (Joomla, Drupal, etc.)",
    category: "exploit",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: false,
    estimatedTime: 60,
    priority: 70,
    conditions: (p) => !p.isWordPress && p.cms !== "unknown",
  },
  // ── Indirect Attacks ──
  {
    id: "sqli_into_outfile",
    name: "SQL Injection INTO OUTFILE",
    category: "indirect",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: false,
    estimatedTime: 45,
    priority: 50,
    conditions: () => true,
  },
  {
    id: "lfi_log_poisoning",
    name: "LFI Log Poisoning",
    category: "indirect",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: false,
    estimatedTime: 30,
    priority: 45,
    conditions: () => true,
  },
  {
    id: "ssrf_internal",
    name: "SSRF Internal Service Exploitation",
    category: "indirect",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: true,
    estimatedTime: 30,
    priority: 40,
    conditions: () => true,
  },
  {
    id: "dns_rebinding",
    name: "DNS Rebinding Attack",
    category: "indirect",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: true,
    estimatedTime: 60,
    priority: 35,
    conditions: () => true,
  },
  {
    id: "config_exploit",
    name: "Config File Exploitation (.env, wp-config, etc.)",
    category: "exploit",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: false,
    estimatedTime: 20,
    priority: 55,
    conditions: () => true,
  },
  // ── Cloudflare Bypass ──
  {
    id: "cf_origin_bypass",
    name: "Cloudflare Origin IP Bypass",
    category: "exploit",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: true,
    estimatedTime: 30,
    priority: 82,
    conditions: (p) => p.hasCloudflare,
  },
  // ── Shellless Methods ──
  {
    id: "shellless_htaccess",
    name: "Shellless .htaccess Redirect",
    category: "shellless",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: false,
    estimatedTime: 15,
    priority: 72,
    conditions: () => true,
  },
  {
    id: "shellless_wp_options",
    name: "Shellless WP Options Redirect",
    category: "shellless",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: true,
    estimatedTime: 15,
    priority: 68,
    conditions: (p) => p.isWordPress,
  },
  {
    id: "shellless_js_inject",
    name: "Shellless JS Injection Redirect",
    category: "shellless",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: false,
    estimatedTime: 15,
    priority: 65,
    conditions: () => true,
  },
  {
    id: "shellless_meta_refresh",
    name: "Shellless Meta Refresh Redirect",
    category: "shellless",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: false,
    estimatedTime: 10,
    priority: 60,
    conditions: () => true,
  },
  {
    id: "shellless_dns_cname",
    name: "Shellless DNS CNAME Hijack",
    category: "shellless",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: true,
    estimatedTime: 30,
    priority: 50,
    conditions: () => true,
  },
  // ── Comprehensive / Advanced ──
  {
    id: "comprehensive_scan",
    name: "Comprehensive Vulnerability Scan (80+ vectors)",
    category: "exploit",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: false,
    estimatedTime: 120,
    priority: 30,
    conditions: () => true,
  },
  // ── AI Commander (Last Resort) ──
  {
    id: "ai_commander",
    name: "AI Commander — LLM Autonomous Attack",
    category: "ai",
    requiresWritablePaths: false,
    requiresPhpExecution: false,
    requiresWpAdmin: false,
    bypassesWaf: true,
    estimatedTime: 300,
    priority: 20,
    conditions: () => true,
  },
];

// ═══════════════════════════════════════════════
//  TARGET PROFILE BUILDER
// ═══════════════════════════════════════════════

/**
 * Build a TargetProfile from prescreen + AI analysis results
 */
export function buildTargetProfile(
  domain: string,
  prescreen: PreScreenResult | null,
  aiAnalysis: AiTargetAnalysis | null,
): TargetProfile {
  const cms = (prescreen?.cms || aiAnalysis?.techStack?.cms || "unknown").toLowerCase();
  const waf = prescreen?.wafDetected || aiAnalysis?.security?.wafDetected || null;
  const serverType = prescreen?.serverType || aiAnalysis?.httpFingerprint?.serverType || "unknown";
  const writablePaths = prescreen?.writablePaths || aiAnalysis?.uploadSurface?.writablePaths || [];
  const phpExecutes = true; // default true — prescreen doesn't have explicit phpExecutes field
  const isWordPress = cms === "wordpress" || cms === "wp";
  const hasCloudflare = (waf || "").toLowerCase().includes("cloudflare") ||
    (serverType || "").toLowerCase().includes("cloudflare");
  const hasWpAdmin = isWordPress; // Assume WP has admin
  const ftpAvailable = prescreen?.ftpAvailable || false;
  const webdavAvailable = prescreen?.webdavAvailable || false;
  const successProb = prescreen?.overallSuccessProbability || 
    aiAnalysis?.aiStrategy?.overallSuccessProbability || 50;

  return {
    domain,
    cms,
    waf,
    serverType,
    hasWritablePaths: writablePaths.length > 0,
    writablePathCount: writablePaths.length,
    phpExecutes,
    successProbability: successProb,
    isWordPress,
    hasCloudflare,
    hasWpAdmin,
    ftpAvailable,
    webdavAvailable,
    originIp: null,
  };
}

// ═══════════════════════════════════════════════
//  SMART FALLBACK PLANNER
// ═══════════════════════════════════════════════

/**
 * Generate a smart fallback plan based on target profile and past failures
 */
export function generateFallbackPlan(
  profile: TargetProfile,
  logger?: AttackLogger,
  totalTimeBudget = 600, // 10 minutes default
  failedMethods: string[] = [],
): FallbackPlan {
  const skipMethods: FallbackPlan["skipMethods"] = [];
  const selectedMethods: FallbackPlan["methods"] = [];

  // Get failure recommendations from logger if available
  let loggerRec: SmartFallbackRecommendation | null = null;
  if (logger) {
    loggerRec = logger.getSmartFallbackRecommendation();
  }

  // Combine skip lists
  const allSkipIds = new Set<string>(failedMethods);
  if (loggerRec) {
    for (const m of loggerRec.skipMethods) {
      allSkipIds.add(m);
    }
  }

  // Filter and score methods
  for (const method of ATTACK_METHODS) {
    // Skip if already failed
    if (allSkipIds.has(method.id)) {
      skipMethods.push({ method: method.id, reason: "Previously failed" });
      continue;
    }

    // Skip if conditions not met
    if (!method.conditions(profile)) {
      skipMethods.push({ method: method.id, reason: "Conditions not met for target" });
      continue;
    }

    // Skip upload methods if no writable paths
    if (method.requiresWritablePaths && !profile.hasWritablePaths) {
      skipMethods.push({ method: method.id, reason: "No writable paths found" });
      continue;
    }

    // Skip PHP-dependent methods if PHP doesn't execute
    if (method.requiresPhpExecution && !profile.phpExecutes) {
      skipMethods.push({ method: method.id, reason: "PHP not executing on target" });
      continue;
    }

    // Skip WP-specific methods for non-WP sites
    if (method.requiresWpAdmin && !profile.isWordPress) {
      skipMethods.push({ method: method.id, reason: "Not a WordPress site" });
      continue;
    }

    // Calculate estimated success rate
    let successRate = profile.successProbability;

    // Boost methods that bypass WAF when WAF is detected
    if (profile.waf && method.bypassesWaf) {
      successRate = Math.min(successRate + 15, 95);
    }

    // Boost shellless methods when upload fails
    if (method.category === "shellless" && failedMethods.length > 0) {
      successRate = Math.min(successRate + 10, 80);
    }

    // Boost CF bypass when Cloudflare detected
    if (method.id === "cf_origin_bypass" && profile.hasCloudflare) {
      successRate = Math.min(successRate + 20, 90);
    }

    // Boost WP-specific methods for WP sites
    if (profile.isWordPress && (method.id.startsWith("wp_") || method.id.startsWith("shellless_wp"))) {
      successRate = Math.min(successRate + 10, 85);
    }

    // Penalize methods that don't bypass WAF when WAF is detected
    if (profile.waf && !method.bypassesWaf) {
      successRate = Math.max(successRate - 20, 5);
    }

    // Build reason string
    let reason = `${method.name}`;
    if (method.bypassesWaf && profile.waf) reason += " (bypasses WAF)";
    if (method.category === "shellless") reason += " (no file upload needed)";
    if (method.category === "ai") reason += " (autonomous AI)";

    selectedMethods.push({
      method,
      reason,
      estimatedSuccessRate: Math.round(successRate),
      timeBudget: Math.min(method.estimatedTime, totalTimeBudget * 0.3),
    });
  }

  // Sort by: priority (desc) then success rate (desc)
  selectedMethods.sort((a, b) => {
    const scoreDiff = (b.method.priority + b.estimatedSuccessRate) - (a.method.priority + a.estimatedSuccessRate);
    return scoreDiff;
  });

  // Allocate time budgets
  let remainingTime = totalTimeBudget;
  for (const m of selectedMethods) {
    m.timeBudget = Math.min(m.method.estimatedTime, remainingTime * 0.25);
    remainingTime -= m.timeBudget;
    if (remainingTime <= 0) break;
  }

  // Generate strategy description
  const topMethods = selectedMethods.slice(0, 5).map(m => m.method.name).join(" → ");
  const strategy = profile.hasWritablePaths
    ? `Upload-first strategy: ${topMethods}`
    : failedMethods.length > 0
    ? `Fallback strategy (${failedMethods.length} methods failed): ${topMethods}`
    : `No writable paths — shellless/exploit strategy: ${topMethods}`;

  return {
    methods: selectedMethods,
    skipMethods,
    totalEstimatedTime: selectedMethods.reduce((sum, m) => sum + m.timeBudget, 0),
    strategy,
  };
}

// ═══════════════════════════════════════════════
//  PIPELINE INTEGRATION HELPERS
// ═══════════════════════════════════════════════

/**
 * Determine if upload methods should be skipped entirely
 */
export function shouldSkipUploads(profile: TargetProfile): { skip: boolean; reason: string } {
  if (!profile.hasWritablePaths && profile.writablePathCount === 0) {
    return {
      skip: true,
      reason: "ไม่พบ writable paths — ข้ามการ upload ไฟล์ ใช้ shellless/indirect/exploit แทน",
    };
  }
  if (profile.successProbability < 5) {
    return {
      skip: true,
      reason: `Success probability ต่ำมาก (${profile.successProbability}%) — ข้ามการ upload ใช้วิธีอื่น`,
    };
  }
  return { skip: false, reason: "" };
}

/**
 * Determine the optimal retry count based on success probability
 */
export function getOptimalRetryCount(profile: TargetProfile, defaultRetries = 3): number {
  if (profile.successProbability >= 70) return defaultRetries;
  if (profile.successProbability >= 40) return Math.max(2, Math.floor(defaultRetries * 0.7));
  if (profile.successProbability >= 20) return Math.max(1, Math.floor(defaultRetries * 0.5));
  return 1; // Very low probability — try once then move on
}

/**
 * Get the next best method to try after a failure
 */
export function getNextMethod(
  profile: TargetProfile,
  failedMethods: string[],
  logger?: AttackLogger,
): { method: AttackMethod; reason: string } | null {
  const plan = generateFallbackPlan(profile, logger, 600, failedMethods);
  const nextMethod = plan.methods.find(m => !failedMethods.includes(m.method.id));
  if (!nextMethod) return null;
  return {
    method: nextMethod.method,
    reason: nextMethod.reason,
  };
}

/**
 * Calculate time budget for a specific phase
 */
export function getTimeBudget(
  phase: string,
  totalBudget: number,
  profile: TargetProfile,
): number {
  const budgetMap: Record<string, number> = {
    ai_analysis: 0.1,
    prescreen: 0.05,
    vuln_scan: 0.1,
    shell_gen: 0.05,
    upload: profile.hasWritablePaths ? 0.25 : 0.05,
    verify: 0.05,
    waf_bypass: profile.waf ? 0.1 : 0.02,
    alt_upload: 0.1,
    indirect: profile.hasWritablePaths ? 0.05 : 0.15,
    shellless: profile.hasWritablePaths ? 0.05 : 0.2,
    wp_admin: profile.isWordPress ? 0.1 : 0.02,
    wp_db_inject: profile.isWordPress ? 0.05 : 0.02,
    comprehensive: 0.1,
    ai_commander: 0.2,
    cloaking: 0.05,
    post_upload: 0.05,
  };

  const fraction = budgetMap[phase] || 0.05;
  return Math.round(totalBudget * fraction);
}

/**
 * Format a fallback plan as a human-readable string (for logging)
 */
export function formatFallbackPlan(plan: FallbackPlan): string {
  const lines: string[] = [
    `Strategy: ${plan.strategy}`,
    `Total estimated time: ${Math.round(plan.totalEstimatedTime)}s`,
    `Methods to try (${plan.methods.length}):`,
  ];

  for (let i = 0; i < Math.min(plan.methods.length, 10); i++) {
    const m = plan.methods[i];
    lines.push(`  ${i + 1}. ${m.method.name} — ${m.estimatedSuccessRate}% chance, ${Math.round(m.timeBudget)}s budget`);
  }

  if (plan.skipMethods.length > 0) {
    lines.push(`Skipped methods (${plan.skipMethods.length}): ${plan.skipMethods.map(s => s.method).join(", ")}`);
  }

  return lines.join("\n");
}
