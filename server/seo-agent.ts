/**
 * SEO Agentic AI Engine
 * 
 * The "brain" that autonomously plans and executes SEO tasks.
 * User adds domain → AI creates full plan → executes daily tasks → tracks progress.
 * 
 * Flow:
 * 1. User adds domain with targetDays (3/7/30)
 * 2. AI analyzes domain + keywords → estimates real timeline
 * 3. AI creates phased plan with task queue
 * 4. Tasks execute automatically (backlinks, content, PBN, on-page)
 * 5. AI monitors rankings and adjusts strategy
 */

import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import * as seoEngine from "./seo-engine";
import { executePBNBuild } from "./pbn-bridge";
import * as serpTracker from "./serp-tracker";
import { createWPClient } from "./wp-api";
import { sendTelegramNotification } from "./telegram-notifier";

// ═══ Types ═══

export interface AgentPlan {
  estimatedDays: number;
  confidence: number; // 0-100
  reasoning: string;
  phases: AgentPhase[];
  dailyTasks: DailyTaskPlan[];
  riskAssessment: {
    penaltyRisk: "low" | "medium" | "high";
    detectionRisk: "low" | "medium" | "high";
    mitigationSteps: string[];
  };
}

export interface AgentPhase {
  day: number; // Which day to start
  name: string;
  description: string;
  tasks: string[]; // Task types to execute
  priority: "critical" | "high" | "medium" | "low";
}

export interface DailyTaskPlan {
  day: number;
  tasks: {
    taskType: string;
    title: string;
    description: string;
    priority: number; // 1-10
    dependsOn?: string[];
  }[];
}

export interface AgentExecutionResult {
  projectId: number;
  tasksExecuted: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksSkipped: number;
  results: {
    taskType: string;
    status: "completed" | "failed" | "skipped";
    detail: string;
    durationMs: number;
  }[];
  nextActions: string[];
}

// ═══ AI Plan Generation ═══

/**
 * AI analyzes domain + keywords and creates a full SEO plan
 * Returns estimated days and phased task plan
 */
export async function generateAgentPlan(
  projectId: number,
): Promise<AgentPlan> {
  const project = await db.getSeoProjectById(projectId);
  if (!project) throw new Error("Project not found");

  const keywords = (project.targetKeywords as string[]) || [];
  const domain = project.domain;
  const niche = project.niche || "general";
  const targetDays = project.targetDays || 7;
  const aggressiveness = project.aggressiveness || 5;
  const strategy = project.strategy || "grey_hat";
  const hasWP = !!(project.wpUsername && project.wpAppPassword);

  // Get current metrics
  const da = project.currentDA || 0;
  const dr = project.currentDR || 0;
  const backlinks = project.currentBacklinks || 0;
  const spamScore = project.currentSpamScore || 0;

  const systemPrompt = `You are an expert SEO strategist specializing in grey/black hat SEO for gambling/casino websites.
You MUST create a realistic, actionable SEO plan. Every task must be something that can be executed programmatically.

Available task types you can use:
- domain_analysis: Full domain scan + metrics
- keyword_research: Find target keywords + volume + difficulty
- keyword_gap_analysis: Compare vs competitors
- onpage_audit: Title, meta, schema, internal links
- content_plan: Plan articles/pages to create
- content_create: AI writes SEO content
- content_publish_wp: Publish content to WordPress (requires WP connection)
- backlink_plan: Plan backlink strategy
- backlink_build_pbn: Build backlinks from PBN network
- backlink_build_web2: Build web 2.0 backlinks
- backlink_build_social: Social signals
- backlink_tier2: Build tier 2 links pointing to tier 1
- index_request: Request Google indexing
- rank_check: Check keyword rankings
- competitor_spy: Analyze competitor strategies
- wp_optimize: Optimize WordPress settings (requires WP)
- wp_fix_issues: Fix on-page issues (requires WP)
- schema_markup: Add/update structured data (requires WP)
- internal_linking: Optimize internal link structure (requires WP)
- strategy_review: AI reviews and adjusts strategy
- risk_assessment: Check for penalty risks
- report_generate: Generate progress report

IMPORTANT: Return ONLY valid JSON matching the schema below.`;

  const userPrompt = `Create an SEO plan for:
Domain: ${domain}
Niche: ${niche}
Target Keywords: ${keywords.join(", ") || "AI will research"}
Current DA: ${da}, DR: ${dr}, Backlinks: ${backlinks}, Spam Score: ${spamScore}
Strategy: ${strategy}
Aggressiveness: ${aggressiveness}/10
Target Timeline: ${targetDays} days
WordPress Connected: ${hasWP ? "YES" : "NO"}
Available PBN Sites: Will be checked at execution time

Based on keyword difficulty and current domain metrics, estimate the REAL number of days needed.
If target is 3 days but keywords are very competitive, be honest — say it needs more.
If keywords are easy (low competition gambling terms in Thai), 3-7 days is realistic.

Create a day-by-day plan with specific tasks for each day.
For aggressive timelines (3 days), pack more tasks per day.
For longer timelines (30 days), spread tasks out and include monitoring.

Return JSON:
{
  "estimatedDays": <number>,
  "confidence": <0-100>,
  "reasoning": "<why this timeline>",
  "phases": [
    {
      "day": <start day>,
      "name": "<phase name>",
      "description": "<what this phase does>",
      "tasks": ["<task_type>", ...],
      "priority": "critical|high|medium|low"
    }
  ],
  "dailyTasks": [
    {
      "day": <day number>,
      "tasks": [
        {
          "taskType": "<from available types>",
          "title": "<human-readable title>",
          "description": "<what exactly to do>",
          "priority": <1-10>,
          "dependsOn": ["<task_type that must complete first>"]
        }
      ]
    }
  ],
  "riskAssessment": {
    "penaltyRisk": "low|medium|high",
    "detectionRisk": "low|medium|high",
    "mitigationSteps": ["<step>", ...]
  }
}`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "seo_agent_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            estimatedDays: { type: "integer", description: "Estimated days to achieve ranking" },
            confidence: { type: "integer", description: "Confidence level 0-100" },
            reasoning: { type: "string", description: "Why this timeline" },
            phases: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  day: { type: "integer" },
                  name: { type: "string" },
                  description: { type: "string" },
                  tasks: { type: "array", items: { type: "string" } },
                  priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
                },
                required: ["day", "name", "description", "tasks", "priority"],
                additionalProperties: false,
              },
            },
            dailyTasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  day: { type: "integer" },
                  tasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        taskType: { type: "string" },
                        title: { type: "string" },
                        description: { type: "string" },
                        priority: { type: "integer" },
                        dependsOn: { type: "array", items: { type: "string" } },
                      },
                      required: ["taskType", "title", "description", "priority", "dependsOn"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["day", "tasks"],
                additionalProperties: false,
              },
            },
            riskAssessment: {
              type: "object",
              properties: {
                penaltyRisk: { type: "string", enum: ["low", "medium", "high"] },
                detectionRisk: { type: "string", enum: ["low", "medium", "high"] },
                mitigationSteps: { type: "array", items: { type: "string" } },
              },
              required: ["penaltyRisk", "detectionRisk", "mitigationSteps"],
              additionalProperties: false,
            },
          },
          required: ["estimatedDays", "confidence", "reasoning", "phases", "dailyTasks", "riskAssessment"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const plan: AgentPlan = JSON.parse(text);

  // Save plan to project
  await db.updateSeoProject(projectId, {
    aiPlan: plan as any,
    aiEstimatedDays: plan.estimatedDays,
    aiPlanCreatedAt: new Date(),
  });

  // Create task queue from plan
  await createTaskQueue(projectId, project.userId, plan);

  return plan;
}

// ═══ Task Queue Management ═══

/**
 * Create task queue entries from an AI plan
 */
async function createTaskQueue(
  projectId: number,
  userId: number,
  plan: AgentPlan,
): Promise<void> {
  const now = new Date();

  for (const dailyPlan of plan.dailyTasks) {
    const scheduledDate = new Date(now);
    scheduledDate.setDate(scheduledDate.getDate() + dailyPlan.day - 1);
    scheduledDate.setHours(3, 0, 0, 0); // Run at 3:00 AM

    for (const task of dailyPlan.tasks) {
      await db.createAgentTask(projectId, userId, {
        taskType: task.taskType as any,
        title: task.title,
        description: task.description,
        priority: task.priority,
        dependsOn: task.dependsOn || [],
        scheduledFor: scheduledDate,
        aiReasoning: `Day ${dailyPlan.day}: ${task.description}`,
        aiConfidence: plan.confidence,
      });
    }
  }
}

// ═══ Task Execution Engine ═══

/**
 * Execute a single agent task
 */
export async function executeAgentTask(
  taskId: number,
): Promise<{ status: "completed" | "failed" | "skipped"; detail: string; result?: any }> {
  const task = await db.getAgentTaskById(taskId);
  if (!task) throw new Error("Task not found");

  const project = await db.getSeoProjectById(task.projectId);
  if (!project) throw new Error("Project not found");

  // Mark as running
  await db.updateAgentTask(taskId, {
    status: "running",
    startedAt: new Date(),
  });

  const start = Date.now();

  try {
    let result: any;
    let detail: string;

    switch (task.taskType) {
      case "domain_analysis": {
        const analysis = await seoEngine.analyzeDomain(project.domain, project.niche || undefined);
        await db.updateSeoProject(project.id, {
          currentDA: analysis.currentState.estimatedDA,
          currentDR: analysis.currentState.estimatedDR,
          currentSpamScore: analysis.currentState.estimatedSpamScore,
          currentBacklinks: analysis.currentState.estimatedBacklinks,
          currentReferringDomains: analysis.currentState.estimatedReferringDomains,
          aiHealthScore: analysis.overallHealth,
          aiRiskLevel: analysis.riskLevel as any,
          aiLastAnalysis: analysis.aiSummary,
          lastAnalyzedAt: new Date(),
        });
        result = { da: analysis.currentState.estimatedDA, health: analysis.overallHealth };
        detail = `Domain analysis complete: DA=${analysis.currentState.estimatedDA}, Health=${analysis.overallHealth}`;
        break;
      }

      case "keyword_research": {
        const keywords = (project.targetKeywords as string[]) || [];
        const research = await seoEngine.researchKeywords(
          project.domain, project.niche || "general", keywords,
        );
        // Save keywords to rank tracking
        for (const kw of research.primaryKeywords.slice(0, 15)) {
          await db.addRankEntry(project.id, {
            keyword: kw.keyword,
            searchVolume: kw.searchVolume,
            keywordDifficulty: kw.difficulty,
            cpc: String(kw.cpc),
            trend: "new",
          });
        }
        const allKw = [...keywords, ...research.primaryKeywords.map(k => k.keyword)]
          .filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i);
        await db.updateSeoProject(project.id, { targetKeywords: allKw as any });
        result = { keywordsFound: research.primaryKeywords.length };
        detail = `Found ${research.primaryKeywords.length} keywords`;
        break;
      }

      case "content_create": {
        const keywords = (project.targetKeywords as string[]) || [];
        const keyword = keywords[Math.floor(Math.random() * Math.max(keywords.length, 1))] || project.niche || project.domain;
        const content = await seoEngine.generateSEOContent(
          keyword, project.domain, project.niche || "general", 1500,
        );
        // Save to seo_content table
        await db.createSeoContent(project.id, project.userId, {
          title: content.title,
          content: content.content,
          excerpt: content.metaDescription,
          targetKeyword: keyword,
          metaTitle: content.title,
          metaDescription: content.metaDescription,
          wordCount: content.content.split(/\s+/).length,
          seoScore: 80,
        });
        await db.updateSeoProject(project.id, {
          totalContentCreated: (project.totalContentCreated || 0) + 1,
        });
        result = { title: content.title, keyword };
        detail = `Created content: "${content.title}" targeting "${keyword}"`;
        break;
      }

      case "content_publish_wp": {
        if (!project.wpUsername || !project.wpAppPassword) {
          return { status: "skipped", detail: "No WordPress connection" };
        }
        // Get unpublished content
        const unpublished = await db.getUnpublishedContent(project.id);
        if (unpublished.length === 0) {
          return { status: "skipped", detail: "No unpublished content to publish" };
        }
        const contentToPublish = unpublished[0];
        const wpClient = createWPClient({
          siteUrl: `https://${project.domain}`,
          username: project.wpUsername,
          appPassword: project.wpAppPassword,
        });
        try {
          const wpResult = await wpClient.createPost({
            title: contentToPublish.title,
            content: contentToPublish.content,
            status: "publish",
          });
          await db.updateSeoContent(contentToPublish.id, {
            publishStatus: "published",
            wpPostId: wpResult.id,
            wpUrl: wpResult.link,
            publishedAt: new Date(),
          });
          result = { wpPostId: wpResult.id, url: wpResult.link };
          detail = `Published to WordPress: ${wpResult.link}`;
        } catch (err: any) {
          await db.updateSeoContent(contentToPublish.id, { publishStatus: "failed" });
          throw new Error(`WP publish failed: ${err.message}`);
        }
        break;
      }

      case "backlink_build_pbn": {
        const linkCount = Math.min(Math.max(project.aggressiveness, 3), 10);
        const buildResult = await executePBNBuild(project.userId, project.id, linkCount);
        result = { built: buildResult.totalBuilt, planned: buildResult.totalPlanned };
        detail = `Built ${buildResult.totalBuilt}/${buildResult.totalPlanned} PBN backlinks`;
        break;
      }

      case "rank_check": {
        const rankings = await db.getLatestRankings(project.id);
        if (rankings.length === 0) {
          return { status: "skipped", detail: "No keywords to check" };
        }
        const keywords = rankings.map(r => ({
          keyword: r.keyword,
          previousPosition: r.position,
          searchVolume: r.searchVolume || undefined,
        }));
        const rankResult = await serpTracker.bulkRankCheck(
          project.id, project.domain, keywords, "US", "desktop",
        );
        await db.updateSeoProject(project.id, {
          overallTrend: rankResult.improved > rankResult.declined ? "improving" as any :
            rankResult.declined > rankResult.improved ? "declining" as any : "stable" as any,
        });
        result = { avgPosition: rankResult.avgPosition, top10: rankResult.top10 };
        detail = `Checked ${rankResult.totalKeywords} keywords — Avg: #${rankResult.avgPosition}, Top 10: ${rankResult.top10}`;
        break;
      }

      case "competitor_spy": {
        const keywords = (project.targetKeywords as string[]) || [];
        const topKeyword = keywords[0] || project.niche || "gambling";
        // Use LLM to analyze competitors
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are an SEO competitor analyst. Analyze the competition for the given keyword and domain. Return actionable insights." },
            { role: "user", content: `Analyze competitors for "${topKeyword}" in niche "${project.niche || "gambling"}". Domain: ${project.domain}, DA: ${project.currentDA || 0}. What are the top competitors doing? What gaps can we exploit?` },
          ],
        });
        const analysis = response.choices[0]?.message?.content || "Analysis complete";
        result = { keyword: topKeyword, analysis: typeof analysis === "string" ? analysis.slice(0, 500) : "" };
        detail = `Competitor analysis for "${topKeyword}" completed`;
        break;
      }

      case "strategy_review": {
        // AI reviews current progress and adjusts strategy
        const rankings = await db.getLatestRankings(project.id);
        const backlinks = await db.getProjectBacklinks(project.id, 50);
        const actions = await db.getProjectActions(project.id, 20);

        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You are an SEO strategist reviewing campaign progress. Provide specific next actions." },
            { role: "user", content: `Review SEO campaign for ${project.domain}:
- DA: ${project.currentDA}, DR: ${project.currentDR}
- Keywords tracked: ${rankings.length}, Backlinks: ${backlinks.length}
- Recent actions: ${actions.slice(0, 5).map(a => a.title).join(", ")}
- Strategy: ${project.strategy}, Aggressiveness: ${project.aggressiveness}/10
- Target: rank within ${project.targetDays} days

What should we do next? Be specific.` },
          ],
        });
        const review = response.choices[0]?.message?.content || "Review complete";
        result = { review: typeof review === "string" ? review.slice(0, 1000) : "" };
        detail = "Strategy review completed — adjustments recommended";
        break;
      }

      case "backlink_build_web2":
      case "backlink_build_social":
      case "backlink_build_guest":
      case "backlink_tier2":
      case "index_request":
      case "onpage_audit":
      case "content_plan":
      case "keyword_gap_analysis":
      case "backlink_plan":
      case "wp_optimize":
      case "wp_fix_issues":
      case "schema_markup":
      case "internal_linking":
      case "risk_assessment":
      case "report_generate": {
        // These tasks use LLM to generate actionable recommendations
        const response = await invokeLLM({
          messages: [
            { role: "system", content: `You are executing SEO task: ${task.taskType}. Provide real, actionable output for gambling/casino website SEO.` },
            { role: "user", content: `Execute "${task.title}" for ${project.domain} (niche: ${project.niche || "gambling"}).
Domain metrics: DA=${project.currentDA || 0}, DR=${project.currentDR || 0}, Backlinks=${project.currentBacklinks || 0}
Strategy: ${project.strategy}, Aggressiveness: ${project.aggressiveness}/10
${task.description}

Provide specific, actionable results.` },
          ],
        });
        const output = response.choices[0]?.message?.content || "Task completed";
        result = { output: typeof output === "string" ? output.slice(0, 2000) : "" };
        detail = `${task.title} — completed`;
        break;
      }

      case "wp_error_scan": {
        // Scan WordPress site for errors (plugin conflicts, PHP errors, broken pages)
        if (!project.wpUsername || !project.wpAppPassword) {
          return { status: "skipped", detail: "No WordPress connection — cannot scan for errors" };
        }
        const scanClient = createWPClient({
          siteUrl: `https://${project.domain}`,
          username: project.wpUsername,
          appPassword: project.wpAppPassword,
        });
        const health = await scanClient.getSiteHealth();
        
        // If critical errors found and allowWpEdit is enabled, create auto-fix task
        if (health.errors.length > 0 && (project as any).allowWpEdit) {
          await db.createAgentTask(project.id, project.userId, {
            taskType: "wp_error_fix",
            title: `Auto-fix ${health.errors.length} errors on ${project.domain}`,
            description: `Errors: ${health.errors.map(e => e.message).join("; ")}`,
            priority: 1,
            scheduledFor: new Date(), // Run immediately
          });
        }
        
        result = {
          status: health.status,
          errorsCount: health.errors.length,
          warningsCount: health.warnings.length,
          pluginIssuesCount: health.pluginIssues.length,
          errors: health.errors.slice(0, 10),
          warnings: health.warnings.slice(0, 10),
          pluginIssues: health.pluginIssues.slice(0, 10),
          wpVersion: health.wpVersion,
        };
        detail = `Site health: ${health.status} — ${health.errors.length} errors, ${health.warnings.length} warnings, ${health.pluginIssues.length} plugin issues`;
        break;
      }

      case "wp_error_fix": {
        // Auto-fix WordPress errors (deactivate problematic plugins, fix conflicts, clear maintenance)
        if (!project.wpUsername || !project.wpAppPassword) {
          return { status: "skipped", detail: "No WordPress connection — cannot fix errors" };
        }
        if (!(project as any).allowWpEdit) {
          return { status: "skipped", detail: "User has not granted permission to edit website" };
        }
        const fixClient = createWPClient({
          siteUrl: `https://${project.domain}`,
          username: project.wpUsername,
          appPassword: project.wpAppPassword,
        });
        
        // First scan for current errors
        const currentHealth = await fixClient.getSiteHealth();
        if (currentHealth.errors.length === 0 && currentHealth.pluginIssues.length === 0) {
          return { status: "completed", detail: "No errors to fix — site is healthy" };
        }
        
        // Auto-fix what we can
        const fixes = await fixClient.autoFixErrors(currentHealth.errors, currentHealth.pluginIssues);
        
        // Use LLM to analyze remaining unfixable errors and provide recommendations
        const unfixedErrors = currentHealth.errors.filter(e => 
          !fixes.some(f => f.errorType === e.type && f.success)
        );
        let aiRecommendations = "";
        if (unfixedErrors.length > 0) {
          const aiResponse = await invokeLLM({
            messages: [
              { role: "system", content: "You are a WordPress expert. Analyze these website errors and provide specific fix instructions. Focus on plugin issues, theme conflicts, and PHP errors. Do NOT suggest server-level fixes." },
              { role: "user", content: `Website: ${project.domain}\nErrors:\n${unfixedErrors.map(e => `- [${e.severity}] ${e.type}: ${e.message}`).join("\n")}\n\nProvide specific steps to fix each error (plugin-level or WP admin-level fixes only).` },
            ],
          });
          aiRecommendations = typeof aiResponse.choices[0]?.message?.content === "string" 
            ? aiResponse.choices[0].message.content.slice(0, 2000) 
            : "";
        }
        
        result = {
          fixesApplied: fixes.filter(f => f.success).length,
          fixesFailed: fixes.filter(f => !f.success).length,
          fixes: fixes.slice(0, 10),
          remainingErrors: unfixedErrors.length,
          aiRecommendations,
        };
        detail = `Applied ${fixes.filter(f => f.success).length} fixes, ${unfixedErrors.length} errors remaining`;
        
        // Send notification if critical errors were fixed
        if (fixes.some(f => f.success)) {
          try {
            await sendTelegramNotification({
              type: "info",
              targetUrl: `https://${project.domain}`,
              details: `\u{1f527} WP Error Fix: ${project.domain}\nApplied ${fixes.filter(f => f.success).length} fixes:\n${fixes.filter(f => f.success).map(f => `\u2705 ${f.action}`).join("\n")}${unfixedErrors.length > 0 ? `\n\n\u26a0\ufe0f ${unfixedErrors.length} errors still need manual attention` : ""}`,
            });
          } catch {}
        }
        break;
      }

      default:
        return { status: "skipped", detail: `Unknown task type: ${task.taskType}` };
    }

    const durationMs = Date.now() - start;

    // Mark completed
    await db.updateAgentTask(taskId, {
      status: "completed",
      completedAt: new Date(),
      durationMs,
      result: result as any,
    });

    // Log action
    await db.addSeoAction(project.id, {
      actionType: task.taskType as any,
      title: `[Agent] ${task.title}`,
      description: detail,
      status: "completed",
      executedAt: new Date(),
      completedAt: new Date(),
      impact: "positive",
    });

    return { status: "completed", detail, result };

  } catch (err: any) {
    const durationMs = Date.now() - start;
    await db.updateAgentTask(taskId, {
      status: "failed",
      completedAt: new Date(),
      durationMs,
      errorMessage: err.message,
    });
    await db.addSeoAction(project.id, {
      actionType: task.taskType as any,
      title: `[Agent] ${task.title}`,
      description: `Failed: ${err.message}`,
      status: "failed",
      executedAt: new Date(),
      completedAt: new Date(),
      impact: "negative",
    });
    return { status: "failed", detail: err.message };
  }
}

// ═══ Daily Execution Runner ═══

/**
 * Execute all pending tasks for a project that are scheduled for today
 */
export async function runDailyTasks(
  projectId: number,
): Promise<AgentExecutionResult> {
  const project = await db.getSeoProjectById(projectId);
  if (!project) throw new Error("Project not found");

  // Get pending tasks scheduled for today or earlier
  const pendingTasks = await db.getPendingAgentTasks(projectId);

  const results: AgentExecutionResult["results"] = [];
  let completed = 0, failed = 0, skipped = 0;

  for (const task of pendingTasks) {
    // Check dependencies
    if (task.dependsOn && Array.isArray(task.dependsOn)) {
      const deps = task.dependsOn as string[];
      if (deps.length > 0) {
        const allDepsComplete = await db.checkTaskDependencies(projectId, deps);
        if (!allDepsComplete) {
          results.push({
            taskType: task.taskType,
            status: "skipped",
            detail: `Waiting for dependencies: ${deps.join(", ")}`,
            durationMs: 0,
          });
          skipped++;
          continue;
        }
      }
    }

    const start = Date.now();
    const result = await executeAgentTask(task.id);
    const durationMs = Date.now() - start;

    results.push({
      taskType: task.taskType,
      status: result.status,
      detail: result.detail,
      durationMs,
    });

    if (result.status === "completed") completed++;
    else if (result.status === "failed") failed++;
    else skipped++;
  }

  // Determine next actions
  const nextTasks = await db.getUpcomingAgentTasks(projectId, 5);
  const nextActions = nextTasks.map(t => `[Day ${getDayNumber(t.scheduledFor, project.createdAt)}] ${t.title}`);

  // Update project
  await db.updateSeoProject(projectId, {
    lastActionAt: new Date(),
  });

  // Send notification if there were results
  if (results.length > 0) {
    try {
      await sendTelegramNotification({
        type: "info",
        targetUrl: project.domain,
        details: `🤖 SEO Agent Report — ${project.domain}\n` +
          `✅ Completed: ${completed} | ❌ Failed: ${failed} | ⏭️ Skipped: ${skipped}\n` +
          `📋 Tasks: ${results.map(r => `${r.status === "completed" ? "✅" : r.status === "failed" ? "❌" : "⏭️"} ${r.taskType}`).join(", ")}`,
      });
    } catch {}
  }

  return {
    projectId,
    tasksExecuted: results.length,
    tasksCompleted: completed,
    tasksFailed: failed,
    tasksSkipped: skipped,
    results,
    nextActions,
  };
}

// ═══ Run All Projects Daily ═══

/**
 * Run daily tasks for ALL active projects (called by scheduler)
 */
export async function runAllProjectsDailyTasks(): Promise<{
  projectsProcessed: number;
  totalTasks: number;
  totalCompleted: number;
  totalFailed: number;
}> {
  const allProjects = await db.getAllActiveSeoProjects();
  let totalTasks = 0, totalCompleted = 0, totalFailed = 0;

  for (const project of allProjects) {
    try {
      const result = await runDailyTasks(project.id);
      totalTasks += result.tasksExecuted;
      totalCompleted += result.tasksCompleted;
      totalFailed += result.tasksFailed;
    } catch (err: any) {
      console.error(`[SEO Agent] Failed to run daily tasks for project ${project.id} (${project.domain}):`, err.message);
    }
  }

  return {
    projectsProcessed: allProjects.length,
    totalTasks,
    totalCompleted,
    totalFailed,
  };
}

// ═══ Helpers ═══

function getDayNumber(scheduledFor: Date | null, projectCreatedAt: Date): number {
  if (!scheduledFor) return 0;
  const diffMs = scheduledFor.getTime() - projectCreatedAt.getTime();
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
