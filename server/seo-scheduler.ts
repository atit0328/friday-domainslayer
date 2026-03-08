/**
 * SEO Scheduler — Daily Cron Runner for AI-Driven SEO Automation
 * 
 * Features:
 * 1. Daily scheduling (ทำ SEO ทุกวันตามที่ user ตั้งค่า)
 * 2. Auto-start after scan (เริ่มทำ SEO ทันทีหลัง scan เสร็จ)
 * 3. Uses AI Daily Engine for intelligent task planning
 * 4. Supports multi-day scheduling (เลือกวันที่ต้องการ)
 * 5. Proof-of-work verification ทุก action
 * 
 * Checks every 30 minutes if any projects are due for their scheduled SEO automation.
 */
import {
  getDb,
  updateSeoProject,
  addSeoAction,
  updateSeoAction,
  getLatestRankings,
  getSeoProjectById,
} from "./db";
import { seoProjects } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { calculateNextRunMultiDay } from "./routers/seo-automation";
import { runAllProjectsDailyTasks } from "./seo-agent";
import { sendTelegramNotification } from "./telegram-notifier";

const SCHEDULER_INTERVAL_MS = 30 * 60 * 1000; // Check every 30 minutes (was 60 min)
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Get all projects with auto-run enabled
 * (inline query to avoid circular dependency with db.ts)
 */
async function getScheduledProjects() {
  const database = await getDb();
  if (!database) return [];
  return database.select().from(seoProjects)
    .where(eq(seoProjects.autoRunEnabled, true))
    .orderBy(seoProjects.nextAutoRunAt);
}

export function startScheduler() {
  if (schedulerTimer) return; // Already running
  console.log("[SEO Scheduler] เริ่มต้น — ตรวจสอบทุก 30 นาที (Daily AI Mode)");

  // Run immediately on start, then every 30 minutes
  runScheduledJobs().catch(err =>
    console.error("[SEO Scheduler] Error on initial run:", err.message)
  );

  schedulerTimer = setInterval(() => {
    runScheduledJobs().catch(err =>
      console.error("[SEO Scheduler] Error:", err.message)
    );
  }, SCHEDULER_INTERVAL_MS);
}

export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[SEO Scheduler] หยุดทำงาน");
  }
}

/**
 * Main job: find all projects with autoRunEnabled=true and nextAutoRunAt <= now
 * Then execute the AI daily automation pipeline for each
 */
export async function runScheduledJobs(): Promise<{
  checked: number;
  executed: number;
  results: { projectId: number; domain: string; status: string; detail: string }[];
  agentResult: { projectsProcessed: number; totalTasks: number; totalCompleted: number; totalFailed: number };
}> {
  const projects = await getScheduledProjects();
  const now = new Date();
  const results: { projectId: number; domain: string; status: string; detail: string }[] = [];

  let executed = 0;

  for (const project of projects) {
    // Skip if not due yet
    if (project.nextAutoRunAt && project.nextAutoRunAt > now) continue;

    // Skip if status is not active/analyzing
    if (!["active", "analyzing", "setup"].includes(project.status)) continue;

    console.log(`[SEO Scheduler] 🤖 เริ่ม Daily AI SEO: ${project.domain} (ID: ${project.id})`);

    try {
      // Use the new AI Daily Engine
      const { runDailyAutomation } = await import("./seo-daily-engine");
      const report = await runDailyAutomation(project.id);
      
      executed++;
      results.push({
        projectId: project.id,
        domain: project.domain,
        status: "completed",
        detail: `AI Daily: สำเร็จ ${report.summary.completed}/${report.summary.total} tasks (${Math.round(report.summary.totalDuration / 1000)}s)`,
      });
    } catch (err: any) {
      console.error(`[SEO Scheduler] Failed for ${project.domain}:`, err.message);
      
      // Fallback to legacy pipeline if daily engine fails
      try {
        const result = await executeLegacyAutoRun(project);
        executed++;
        results.push({
          projectId: project.id,
          domain: project.domain,
          status: "completed",
          detail: `Legacy fallback: สำเร็จ ${result.completed}/4 ขั้นตอน`,
        });
      } catch (fallbackErr: any) {
        results.push({
          projectId: project.id,
          domain: project.domain,
          status: "failed",
          detail: `Daily AI failed: ${err.message}, Legacy fallback failed: ${fallbackErr.message}`,
        });
      }
    }

    // Update next run time using multi-day logic
    const days = (project.autoRunDays as number[] | null) || [project.autoRunDay ?? 1];
    const hour = project.autoRunHour ?? 3;
    const nextRun = calculateNextRunMultiDay(days, hour);
    await updateSeoProject(project.id, {
      nextAutoRunAt: nextRun,
    });
  }

  if (executed > 0) {
    console.log(`[SEO Scheduler] ✅ รันเสร็จ ${executed}/${projects.length} โปรเจค`);
  }

  // ═══ Run AI Agent Tasks for ALL projects ═══
  let agentResult = { projectsProcessed: 0, totalTasks: 0, totalCompleted: 0, totalFailed: 0 };
  try {
    agentResult = await runAllProjectsDailyTasks();
    if (agentResult.totalTasks > 0) {
      console.log(`[SEO Scheduler] 🤖 AI Agent: ${agentResult.totalCompleted}/${agentResult.totalTasks} tasks สำเร็จ (${agentResult.projectsProcessed} projects)`);
      
      // Send daily summary notification
      try {
        await sendTelegramNotification({
          type: "info",
          targetUrl: "SEO Agent Daily Summary",
          details: `🤖 AI Agent Daily Report\n` +
            `📊 Projects: ${agentResult.projectsProcessed}\n` +
            `✅ Completed: ${agentResult.totalCompleted}/${agentResult.totalTasks}\n` +
            `❌ Failed: ${agentResult.totalFailed}\n` +
            `📅 Legacy SEO: ${executed}/${projects.length} projects`,
        });
      } catch {}
    }
  } catch (err: any) {
    console.error("[SEO Scheduler] AI Agent daily tasks failed:", err.message);
  }

  return { checked: projects.length, executed, results, agentResult };
}

/**
 * Auto-start SEO after scan completes
 * Called from the create project flow after analysis + keyword research finishes
 */
export async function autoStartAfterScan(projectId: number): Promise<void> {
  const project = await getSeoProjectById(projectId);
  if (!project) return;

  console.log(`[SEO Auto-Start] 🚀 เริ่มทำ SEO ทันทีหลัง scan เสร็จ: ${project.domain}`);

  // Log the auto-start
  await addSeoAction(projectId, {
    actionType: "analysis",
    title: `🚀 Auto-Start: เริ่มทำ SEO ทันทีหลัง scan เสร็จ`,
    description: "ระบบเริ่มทำ SEO อัตโนมัติทันทีหลังจาก domain analysis + keyword research เสร็จสมบูรณ์",
    status: "running",
    executedAt: new Date(),
  });

  try {
    // Run the AI daily automation immediately
    const { runDailyAutomation } = await import("./seo-daily-engine");
    const report = await runDailyAutomation(projectId);

    console.log(`[SEO Auto-Start] ✅ ${project.domain}: สำเร็จ ${report.summary.completed}/${report.summary.total} tasks`);

    // Enable auto-run if not already enabled (default: every day at 3 AM UTC)
    if (!project.autoRunEnabled) {
      const defaultDays = [0, 1, 2, 3, 4, 5, 6]; // Every day
      const defaultHour = 3; // 3 AM UTC = 10 AM ICT
      const nextRun = calculateNextRunMultiDay(defaultDays, defaultHour);
      
      await updateSeoProject(projectId, {
        autoRunEnabled: true,
        autoRunDays: defaultDays as any,
        autoRunDay: defaultDays[0],
        autoRunHour: defaultHour,
        nextAutoRunAt: nextRun,
      });

      await addSeoAction(projectId, {
        actionType: "analysis",
        title: `⏰ Auto-enabled: ตั้งค่า Daily SEO ทุกวัน เวลา 10:00 น. (ICT)`,
        description: "ระบบเปิด auto-run อัตโนมัติหลังจาก auto-start สำเร็จ",
        status: "completed",
        executedAt: new Date(),
        completedAt: new Date(),
        impact: "positive",
      });

      console.log(`[SEO Auto-Start] ⏰ Enabled daily auto-run for ${project.domain}`);
    }
  } catch (err: any) {
    console.error(`[SEO Auto-Start] Failed for ${project.domain}:`, err.message);
    
    await addSeoAction(projectId, {
      actionType: "analysis",
      title: `❌ Auto-Start ล้มเหลว`,
      description: err.message,
      status: "failed",
      executedAt: new Date(),
      completedAt: new Date(),
      errorMessage: err.message,
    });
  }
}

/**
 * Legacy auto-run pipeline (fallback if AI daily engine fails)
 * Same 4-step pipeline: Strategy → Backlinks → Content → Rankings
 */
async function executeLegacyAutoRun(project: any) {
  const stepResults: { step: string; status: string; detail: string }[] = [];
    // Legacy pipeline steps

  // Master action log
  const masterAction = await addSeoAction(project.id, {
    actionType: "analysis",
    title: `⏰ [Legacy Auto-Run] SEO Automation — ${project.domain}`,
    description: "Legacy fallback: Strategy → Backlinks → Content → Rankings",
    status: "running",
    executedAt: new Date(),
  });

  try {
    // STEP 1: Strategy
    try {
      const seoEngineModule = await import("./seo-engine");
      const analysis: any = {
        domain: project.domain,
        currentState: {
          estimatedDA: project.currentDA || 0,
          estimatedDR: project.currentDR || 0,
          estimatedSpamScore: project.currentSpamScore || 0,
          estimatedBacklinks: project.currentBacklinks || 0,
          estimatedReferringDomains: project.currentReferringDomains || 0,
          estimatedTrustFlow: project.currentTrustFlow || 0,
          estimatedCitationFlow: project.currentCitationFlow || 0,
          estimatedOrganicTraffic: project.currentOrganicTraffic || 0,
          estimatedOrganicKeywords: project.currentOrganicKeywords || 0,
          domainAge: "unknown",
          tld: project.domain.split(".").slice(1).join("."),
          isIndexed: true,
        },
        contentAudit: { hasContent: false, contentQuality: "none", estimatedPages: 0, topicRelevance: 0 },
        backlinkProfile: { quality: "mixed", dofollowRatio: 70, anchorTextDistribution: [], riskFactors: [] },
        competitorInsights: { nicheCompetition: "medium", topCompetitors: [], avgCompetitorDA: 30 },
        overallHealth: project.aiHealthScore || 50,
        riskLevel: project.aiRiskLevel || "medium",
        aiSummary: project.aiLastAnalysis || "",
      };

      const strategy = await seoEngineModule.generateStrategy(
        project.domain, analysis, project.strategy,
        project.aggressiveness, project.niche || undefined,
      );

      await updateSeoProject(project.id, {
        aiStrategy: strategy.aiRecommendation,
        aiNextActions: strategy.phases.slice(0, 3).map((p: any) => p.name) as any,
      });

      stepResults.push({ step: "strategy", status: "completed", detail: `สร้างกลยุทธ์ ${strategy.phases.length} เฟส` });
    } catch (err: any) {
      stepResults.push({ step: "strategy", status: "failed", detail: err.message });
    }

    // STEP 2: Backlinks
    try {
      const { executePBNBuild } = await import("./pbn-bridge");
      const linkCount = Math.min(Math.max(project.aggressiveness, 3), 10);
      const buildResult = await executePBNBuild(project.userId, project.id, linkCount);
      stepResults.push({
        step: "backlinks",
        status: buildResult.totalBuilt > 0 ? "completed" : "skipped",
        detail: `สร้าง ${buildResult.totalBuilt} backlinks`,
      });
    } catch (err: any) {
      stepResults.push({ step: "backlinks", status: "failed", detail: err.message });
    }

    // STEP 3: Content
    try {
      const { generateSEOContent } = await import("./seo-engine");
      const targetKeywords = (project.targetKeywords as string[]) || [];
      const topKeyword = targetKeywords[0] || project.niche || project.domain;
      const content = await generateSEOContent(topKeyword, project.domain, project.niche || "general", 1500);
      
      await updateSeoProject(project.id, {
        totalContentCreated: (project.totalContentCreated || 0) + 1,
        lastActionAt: new Date(),
      });

      stepResults.push({ step: "content", status: "completed", detail: `สร้างบทความ "${content.title}"` });
    } catch (err: any) {
      stepResults.push({ step: "content", status: "failed", detail: err.message });
    }

    // STEP 4: Rankings
    try {
      const rankings = await getLatestRankings(project.id);
      if (rankings.length === 0) {
        stepResults.push({ step: "rankings", status: "skipped", detail: "ยังไม่มี keywords ที่ track" });
      } else {
        const { bulkRankCheck } = await import("./serp-tracker");
        const keywords = rankings.map(r => ({
          keyword: r.keyword,
          previousPosition: r.position,
          searchVolume: r.searchVolume || undefined,
        }));
        const result = await bulkRankCheck(project.id, project.domain, keywords, "US", "desktop");
        stepResults.push({
          step: "rankings",
          status: "completed",
          detail: `ตรวจสอบ ${result.totalKeywords} keywords — เฉลี่ย: #${result.avgPosition}`,
        });
      }
    } catch (err: any) {
      stepResults.push({ step: "rankings", status: "failed", detail: err.message });
    }

    const completed = stepResults.filter(s => s.status === "completed").length;
    const failed = stepResults.filter(s => s.status === "failed").length;
    const skipped = stepResults.filter(s => s.status === "skipped").length;

    await updateSeoAction(masterAction.id, {
      status: failed === stepResults.length ? "failed" : "completed",
      completedAt: new Date(),
      result: { steps: stepResults } as any,
      impact: completed > failed ? "positive" : "neutral",
      description: `[Legacy] สำเร็จ ${completed}/4, ล้มเหลว ${failed}, ข้าม ${skipped}`,
    });

    await updateSeoProject(project.id, {
      lastAutoRunAt: new Date(),
      autoRunCount: (project.autoRunCount ?? 0) + 1,
      lastAutoRunResult: { type: "legacy", completed, failed, skipped, total: 4 } as any,
      lastActionAt: new Date(),
    });

    return { completed, failed, skipped };
  } catch (err: any) {
    await updateSeoAction(masterAction.id, {
      status: "failed",
      errorMessage: err.message,
      completedAt: new Date(),
    });
    throw err;
  }
}
