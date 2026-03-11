/**
 * Auto-Sprint Trigger
 * 
 * Automatically starts a 7-day sprint campaign when a new SEO project is created.
 * Integrates with the project creation flow to:
 * 
 * 1. Detect new project creation
 * 2. Wait for initial analysis to complete (keywords available)
 * 3. Auto-configure sprint based on project settings
 * 4. Launch sprint + CTR campaign simultaneously
 * 5. Wire sprint into daemon for daily execution
 * 
 * This makes the entire flow fully autonomous:
 * User adds domain → AI scans → AI plans → Sprint auto-starts → 7 days later = results
 */

import {
  initializeSprint,
  quickStartSprint,
  getActiveSprints,
  type SprintConfig,
  type SprintState,
} from "./seven-day-sprint";
import {
  initializeCTRCampaign,
  type CTRCampaignConfig,
  type SocialPlatform,
} from "./ctr-manipulation-engine";
import { sendTelegramNotification } from "./telegram-notifier";
import * as db from "./db";
import {
  createSprint as createOrchestratorSprint,
  getSeoSprintByProject,
  type SeoSprintConfig,
} from "./seo-orchestrator";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface AutoSprintConfig {
  /** Minimum number of keywords required before starting sprint */
  minKeywordsRequired: number;
  /** Maximum wait time (ms) for keywords to be available before starting anyway */
  maxWaitForKeywords: number;
  /** Default aggressiveness mapping from project aggressiveness (1-10) */
  aggressivenessMapping: Record<string, "extreme" | "aggressive" | "moderate">;
  /** Enable CTR campaign alongside sprint */
  enableCTR: boolean;
  /** Default platforms for CTR */
  ctrPlatforms: SocialPlatform[];
  /** Auto-start sprint for all new projects */
  autoStartEnabled: boolean;
  /** Strategies that should trigger sprint */
  eligibleStrategies: string[];
}

export interface SprintTriggerResult {
  triggered: boolean;
  sprintId?: string;
  orchestratorSprintId?: string;
  ctrCampaignId?: string;
  reason: string;
  projectId: number;
  domain: string;
}

// ═══════════════════════════════════════════════
//  DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════

const DEFAULT_CONFIG: AutoSprintConfig = {
  minKeywordsRequired: 3,
  maxWaitForKeywords: 60_000, // 60 seconds
  aggressivenessMapping: {
    "1": "moderate",
    "2": "moderate",
    "3": "moderate",
    "4": "moderate",
    "5": "aggressive",
    "6": "aggressive",
    "7": "aggressive",
    "8": "extreme",
    "9": "extreme",
    "10": "extreme",
  },
  enableCTR: true,
  ctrPlatforms: ["reddit", "twitter", "pinterest", "quora", "linkedin"],
  autoStartEnabled: true,
  eligibleStrategies: [
    "grey_hat",
    "black_hat",
    "aggressive_grey",
    "pbn_focused",
    "tiered_links",
    "parasite_seo",
  ],
};

let currentConfig = { ...DEFAULT_CONFIG };

// Track which projects have had sprints triggered
const triggeredProjects = new Set<number>();

// ═══════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════

export function getAutoSprintConfig(): AutoSprintConfig {
  return { ...currentConfig };
}

export function updateAutoSprintConfig(updates: Partial<AutoSprintConfig>): AutoSprintConfig {
  currentConfig = { ...currentConfig, ...updates };
  return { ...currentConfig };
}

export function isAutoSprintEnabled(): boolean {
  return currentConfig.autoStartEnabled;
}

export function setAutoSprintEnabled(enabled: boolean): void {
  currentConfig.autoStartEnabled = enabled;
  console.log(`[AutoSprint] Auto-sprint ${enabled ? "enabled" : "disabled"}`);
}

// ═══════════════════════════════════════════════
//  SPRINT TRIGGER LOGIC
// ═══════════════════════════════════════════════

/**
 * Determine sprint aggressiveness from project aggressiveness (1-10)
 */
function mapAggressiveness(projectLevel: number): "extreme" | "aggressive" | "moderate" {
  const key = String(Math.min(10, Math.max(1, projectLevel)));
  return currentConfig.aggressivenessMapping[key] || "aggressive";
}

/**
 * Wait for keywords to become available for a project
 */
async function waitForKeywords(
  projectId: number,
  maxWait: number = currentConfig.maxWaitForKeywords,
): Promise<string[]> {
  const startTime = Date.now();
  const pollInterval = 5_000; // Check every 5 seconds
  
  while (Date.now() - startTime < maxWait) {
    try {
      const project = await db.getSeoProjectById(projectId);
      if (!project) return [];
      
      const keywords = (project.targetKeywords as string[]) || [];
      if (keywords.length >= currentConfig.minKeywordsRequired) {
        return keywords;
      }
    } catch {}
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  // Return whatever we have after timeout
  try {
    const project = await db.getSeoProjectById(projectId);
    return ((project?.targetKeywords as string[]) || []);
  } catch {
    return [];
  }
}

/**
 * Build SprintConfig from SEO project data
 */
function buildSprintConfig(
  project: {
    id: number;
    domain: string;
    niche: string | null;
    strategy: string;
    aggressiveness: number;
    targetKeywords: string[] | unknown;
  },
  keywords: string[],
): SprintConfig {
  const aggressiveness = mapAggressiveness(project.aggressiveness);
  
  return {
    domain: project.domain,
    targetUrl: `https://${project.domain}`,
    niche: project.niche || "general",
    seedKeywords: keywords.slice(0, 10),
    language: "th", // Default to Thai for gambling niche
    aggressiveness,
    maxKeywords: aggressiveness === "extreme" ? 20 : aggressiveness === "aggressive" ? 15 : 10,
    telegraphPerKeyword: aggressiveness === "extreme" ? 8 : aggressiveness === "aggressive" ? 5 : 3,
    enableEntityStack: true,
    enableBacklinks: true,
    enableParasite: true,
    enableRankTracking: true,
    telegramNotify: true,
  };
}

/**
 * Build CTR campaign config from SEO project data
 */
function buildCTRConfig(
  project: {
    id: number;
    domain: string;
    niche: string | null;
    aggressiveness: number;
  },
  keywords: string[],
): CTRCampaignConfig {
  const aggressiveness = mapAggressiveness(project.aggressiveness);
  
  return {
    domain: project.domain,
    targetUrl: `https://${project.domain}`,
    targetKeywords: keywords.slice(0, 10),
    niche: project.niche || "general",
    language: "th",
    platforms: currentConfig.ctrPlatforms,
    dailyPostLimit: aggressiveness === "extreme" ? 15 : aggressiveness === "aggressive" ? 10 : 5,
    aggressiveness,
    enableViralHooks: true,
    enableCommunitySeeding: true,
    enableBrandedSearch: true,
    enableContentRepurposing: true,
    projectId: project.id,
  };
}

/**
 * Main trigger function — called after a new SEO project is created
 * This is the core auto-sprint logic
 */
export async function triggerAutoSprint(projectId: number): Promise<SprintTriggerResult> {
  // Check if auto-sprint is enabled
  if (!currentConfig.autoStartEnabled) {
    return {
      triggered: false,
      reason: "Auto-sprint is disabled",
      projectId,
      domain: "",
    };
  }
  
  // Check if already triggered for this project
  if (triggeredProjects.has(projectId)) {
    return {
      triggered: false,
      reason: "Sprint already triggered for this project",
      projectId,
      domain: "",
    };
  }
  
  // Get project data
  const project = await db.getSeoProjectById(projectId);
  if (!project) {
    return {
      triggered: false,
      reason: "Project not found",
      projectId,
      domain: "",
    };
  }
  
  // Check if strategy is eligible
  if (!currentConfig.eligibleStrategies.includes(project.strategy)) {
    return {
      triggered: false,
      reason: `Strategy "${project.strategy}" is not eligible for auto-sprint`,
      projectId,
      domain: project.domain,
    };
  }
  
  // Check if there's already an active sprint for this domain
  const existingSprints = getActiveSprints();
  const domainSprint = existingSprints.find(
    s => s.config.domain === project.domain && s.status !== "completed" && s.status !== "failed"
  );
  if (domainSprint) {
    return {
      triggered: false,
      reason: `Active sprint already exists for ${project.domain} (${domainSprint.id})`,
      projectId,
      domain: project.domain,
    };
  }
  
  console.log(`[AutoSprint] 🎯 Triggering auto-sprint for project #${projectId} (${project.domain})`);
  
  // Wait for keywords to be available
  const keywords = await waitForKeywords(projectId);
  
  if (keywords.length === 0) {
    // Use domain-based seed keywords as fallback
    const domainParts = project.domain.replace(/\.(com|net|org|io|co|ai)$/i, "").split(/[-_.]/);
    keywords.push(...domainParts.filter(p => p.length > 2));
    if (project.niche) keywords.push(project.niche);
    console.log(`[AutoSprint] No keywords found, using fallback seeds: ${keywords.join(", ")}`);
  }
  
  // Mark as triggered
  triggeredProjects.add(projectId);
  
  let sprintId: string | undefined;
  let ctrCampaignId: string | undefined;
  
  try {
    // Build sprint config
    const sprintConfig = buildSprintConfig(project, keywords);
    
    // Start sprint with Day 1 immediately
    console.log(`[AutoSprint] 🚀 Starting 7-day sprint for ${project.domain}...`);
    const { state, day1Report } = await quickStartSprint(sprintConfig);
    sprintId = state.id;
    
    console.log(`[AutoSprint] ✅ Sprint ${state.id} started — Day 1: ${day1Report.contentDeployed} content, T1=${day1Report.linksBuilt.tier1} links, ${day1Report.pagesIndexed} indexed`);
    
    // ═══ SEO ORCHESTRATOR SPRINT: Also create an orchestrator-managed sprint ═══
    let orchestratorSprintId: string | undefined;
    try {
      // Check if orchestrator sprint already exists
      const existingOrcSprint = getSeoSprintByProject(projectId);
      if (!existingOrcSprint) {
        const orcConfig: SeoSprintConfig = {
          projectId,
          domain: project.domain,
          targetKeywords: keywords.slice(0, 15),
          niche: project.niche || "gambling",
          aggressiveness: project.aggressiveness,
          maxPbnLinks: sprintConfig.aggressiveness === "extreme" ? 20 : sprintConfig.aggressiveness === "aggressive" ? 15 : 10,
          maxExternalLinks: sprintConfig.aggressiveness === "extreme" ? 40 : sprintConfig.aggressiveness === "aggressive" ? 25 : 15,
          enablePbn: true,
          enableExternalBl: true,
          enableContentGen: true,
          enableRankTracking: true,
          scheduleDays: [0, 1, 2, 3, 4, 5, 6], // Every day
        };
        const orcState = await createOrchestratorSprint(orcConfig);
        orchestratorSprintId = orcState.id;
        console.log(`[AutoSprint] 🧠 SEO Orchestrator sprint ${orcState.id} created for ${project.domain}`);
      } else {
        orchestratorSprintId = existingOrcSprint.id;
        console.log(`[AutoSprint] 🧠 SEO Orchestrator sprint already exists: ${existingOrcSprint.id}`);
      }
    } catch (orcErr: any) {
      console.error(`[AutoSprint] SEO Orchestrator sprint failed:`, orcErr.message);
    }

    // Start CTR campaign if enabled
    if (currentConfig.enableCTR) {
      try {
        const ctrConfig = buildCTRConfig(project, keywords);
        const ctrState = await initializeCTRCampaign(ctrConfig);
        ctrCampaignId = ctrState.id;
        console.log(`[AutoSprint] 📱 CTR campaign ${ctrState.id} started — ${ctrState.communities.length} communities, ${ctrState.brandedSignals.length} branded signals`);
      } catch (err: any) {
        console.error(`[AutoSprint] CTR campaign failed:`, err.message);
      }
    }
    
    // Log action in project
    try {
      await db.addSeoAction(projectId, {
        actionType: "social_signal",
        title: `🚀 7-Day Sprint Auto-Started`,
        description: `Sprint ${sprintId} launched automatically.\n` +
          `Day 1: ${day1Report.contentDeployed} content deployed, ${day1Report.linksBuilt.tier1} T1 links, ${day1Report.pagesIndexed} pages indexed.\n` +
          `CTR campaign: ${ctrCampaignId || "disabled"}
` +
          `SEO Orchestrator: ${orchestratorSprintId || "not started"}`,
        status: "completed",
        executedAt: new Date(),
        completedAt: new Date(),
        result: {
          sprintId,
          orchestratorSprintId,
          ctrCampaignId,
          day1Report,
        } as any,
        impact: "positive",
      });
    } catch {}
    
    // Send Telegram notification
    try {
      await sendTelegramNotification({
        type: "success",
        targetUrl: project.domain,
        details: `🚀 Auto-Sprint Triggered!\n` +
          `Domain: ${project.domain}\n` +
          `Sprint ID: ${sprintId}\n` +
          `Keywords: ${keywords.slice(0, 5).join(", ")}${keywords.length > 5 ? "..." : ""}\n` +
          `Aggressiveness: ${sprintConfig.aggressiveness}\n` +
          `Day 1 Results:\n` +
          `  Content: ${day1Report.contentDeployed}\n` +
          `  Links: T1=${day1Report.linksBuilt.tier1}\n` +
          `  Indexed: ${day1Report.pagesIndexed}\n` +
          `CTR Campaign: ${ctrCampaignId ? "✅ Active" : "❌ Disabled"}\n` +
          `🧠 SEO Orchestrator: ${orchestratorSprintId ? "✅ Active" : "❌ Not started"}\n` +
          `📅 Next 6 days will run automatically via daemon + orchestrator`,
      });
    } catch {}
    
    return {
      triggered: true,
      sprintId,
      orchestratorSprintId,
      ctrCampaignId,
      reason: "Sprint auto-started successfully",
      projectId,
      domain: project.domain,
    };
    
  } catch (err: any) {
    console.error(`[AutoSprint] Failed to trigger sprint for ${project.domain}:`, err.message);
    
    // Remove from triggered set so it can be retried
    triggeredProjects.delete(projectId);
    
    try {
      await sendTelegramNotification({
        type: "failure",
        targetUrl: project.domain,
        details: `❌ Auto-Sprint Failed!\nDomain: ${project.domain}\nError: ${err.message}`,
      });
    } catch {}
    
    return {
      triggered: false,
      reason: `Sprint trigger failed: ${err.message}`,
      projectId,
      domain: project.domain,
    };
  }
}

// ═══════════════════════════════════════════════
//  BATCH TRIGGER — For existing projects
// ═══════════════════════════════════════════════

/**
 * Scan all active projects and trigger sprints for those without one
 */
export async function triggerSprintsForExistingProjects(): Promise<SprintTriggerResult[]> {
  const results: SprintTriggerResult[] = [];
  
  try {
    const projects = await db.getAllActiveSeoProjects();
    const activeProjects = projects.filter(
      (p: { id: number; status: string; domain: string }) => p.status === "active" && !triggeredProjects.has(p.id)
    );
    
    console.log(`[AutoSprint] Scanning ${activeProjects.length} active projects for sprint eligibility...`);
    
    for (const project of activeProjects) {
      try {
        const result = await triggerAutoSprint(project.id);
        results.push(result);
        
        if (result.triggered) {
          // Add delay between sprint starts to avoid overwhelming
          await new Promise(resolve => setTimeout(resolve, 10_000));
        }
      } catch (err: any) {
        results.push({
          triggered: false,
          reason: err.message,
          projectId: project.id,
          domain: project.domain,
        });
      }
    }
  } catch (err: any) {
    console.error(`[AutoSprint] Batch trigger failed:`, err.message);
  }
  
  return results;
}

// ═══════════════════════════════════════════════
//  STATUS & REPORTING
// ═══════════════════════════════════════════════

export function getAutoSprintStatus(): {
  enabled: boolean;
  triggeredCount: number;
  triggeredProjectIds: number[];
  config: AutoSprintConfig;
} {
  return {
    enabled: currentConfig.autoStartEnabled,
    triggeredCount: triggeredProjects.size,
    triggeredProjectIds: Array.from(triggeredProjects),
    config: { ...currentConfig },
  };
}

/**
 * Reset triggered projects tracking (useful for re-triggering)
 */
export function resetTriggeredProjects(projectIds?: number[]): void {
  if (projectIds) {
    for (const id of projectIds) {
      triggeredProjects.delete(id);
    }
  } else {
    triggeredProjects.clear();
  }
  console.log(`[AutoSprint] Reset triggered projects: ${projectIds ? projectIds.join(", ") : "all"}`);
}
