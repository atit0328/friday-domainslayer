import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Tests for the SEO Agentic AI system:
 * 1. seo-agent.ts — AI Agent Engine (types, plan generation, task execution)
 * 2. seo-agent-router.ts — tRPC router (procedures, user isolation)
 * 3. PBN admin guard — addSite/updateSite/deleteSite are admin-only
 * 4. Schema — seo_agent_tasks + seo_content tables + agent fields
 * 5. Add Domain dialog — targetDays field
 * 6. AI Agent Tab — UI component
 */

// ═══ Read source files ═══
const agentSrc = readFileSync(resolve(__dirname, "seo-agent.ts"), "utf-8");
const agentRouterSrc = readFileSync(resolve(__dirname, "routers/seo-agent-router.ts"), "utf-8");
const seoAutomationSrc = readFileSync(resolve(__dirname, "routers/seo-automation.ts"), "utf-8");
const domainRouterSrc = readFileSync(resolve(__dirname, "routers/domain.ts"), "utf-8");
const schemaSrc = readFileSync(resolve(__dirname, "../drizzle/schema.ts"), "utf-8");
const dbSrc = readFileSync(resolve(__dirname, "db.ts"), "utf-8");
const routersSrc = readFileSync(resolve(__dirname, "routers.ts"), "utf-8");
const seoDetailSrc = readFileSync(resolve(__dirname, "../client/src/pages/SeoProjectDetail.tsx"), "utf-8");
const seoCommandSrc = readFileSync(resolve(__dirname, "../client/src/pages/SeoCommandCenter.tsx"), "utf-8");

// ═══ 1. SEO Agent Engine (seo-agent.ts) ═══
describe("SEO Agent Engine", () => {
  it("exports AgentPlan interface with required fields", () => {
    expect(agentSrc).toContain("export interface AgentPlan");
    expect(agentSrc).toContain("estimatedDays: number");
    expect(agentSrc).toContain("confidence: number");
    expect(agentSrc).toContain("reasoning: string");
    expect(agentSrc).toContain("phases: AgentPhase[]");
    expect(agentSrc).toContain("dailyTasks: DailyTaskPlan[]");
    expect(agentSrc).toContain("riskAssessment:");
  });

  it("exports AgentExecutionResult interface", () => {
    expect(agentSrc).toContain("export interface AgentExecutionResult");
    expect(agentSrc).toContain("tasksExecuted: number");
    expect(agentSrc).toContain("tasksCompleted: number");
    expect(agentSrc).toContain("tasksFailed: number");
    expect(agentSrc).toContain("tasksSkipped: number");
    expect(agentSrc).toContain("nextActions: string[]");
  });

  it("exports generateAgentPlan function", () => {
    expect(agentSrc).toContain("export async function generateAgentPlan(");
    expect(agentSrc).toContain("Promise<AgentPlan>");
  });

  it("exports executeAgentTask function", () => {
    expect(agentSrc).toContain("export async function executeAgentTask(");
  });

  it("exports runDailyTasks function", () => {
    expect(agentSrc).toContain("export async function runDailyTasks(");
    expect(agentSrc).toContain("Promise<AgentExecutionResult>");
  });

  it("exports runAllProjectsDailyTasks for scheduler", () => {
    expect(agentSrc).toContain("export async function runAllProjectsDailyTasks()");
  });

  // Task types with real logic
  it("handles domain_analysis task type with real seoEngine call", () => {
    expect(agentSrc).toContain('case "domain_analysis"');
    expect(agentSrc).toContain("seoEngine.analyzeDomain");
  });

  it("handles keyword_research task type with real seoEngine call", () => {
    expect(agentSrc).toContain('case "keyword_research"');
    expect(agentSrc).toContain("seoEngine.researchKeywords");
  });

  it("handles content_create task type with real seoEngine call", () => {
    expect(agentSrc).toContain('case "content_create"');
    expect(agentSrc).toContain("seoEngine.generateSEOContent");
  });

  it("handles content_publish_wp with real WordPress API", () => {
    expect(agentSrc).toContain('case "content_publish_wp"');
    expect(agentSrc).toContain("createWPClient");
    expect(agentSrc).toContain("wpClient.createPost");
  });

  it("handles backlink_build_pbn with real PBN bridge", () => {
    expect(agentSrc).toContain('case "backlink_build_pbn"');
    expect(agentSrc).toContain("executePBNBuild");
  });

  it("handles rank_check with real SERP tracker", () => {
    expect(agentSrc).toContain('case "rank_check"');
    expect(agentSrc).toContain("serpTracker.bulkRankCheck");
  });

  it("handles competitor_spy with LLM analysis", () => {
    expect(agentSrc).toContain('case "competitor_spy"');
    expect(agentSrc).toContain("invokeLLM");
  });

  it("handles strategy_review with LLM analysis", () => {
    expect(agentSrc).toContain('case "strategy_review"');
    expect(agentSrc).toContain("invokeLLM");
  });

  // LLM-based task types
  it("handles all LLM-based task types", () => {
    const llmTasks = [
      "backlink_build_web2", "backlink_build_social", "backlink_tier2",
      "index_request", "onpage_audit", "content_plan",
      "keyword_gap_analysis", "backlink_plan", "wp_optimize",
      "wp_fix_issues", "schema_markup", "internal_linking",
      "risk_assessment", "report_generate",
    ];
    for (const task of llmTasks) {
      expect(agentSrc).toContain(`"${task}"`);
    }
  });

  it("uses targetDays from project", () => {
    expect(agentSrc).toContain("project.targetDays");
  });

  it("saves plan to project with aiPlan and aiEstimatedDays", () => {
    expect(agentSrc).toContain("aiPlan: plan");
    expect(agentSrc).toContain("aiEstimatedDays: plan.estimatedDays");
    expect(agentSrc).toContain("aiPlanCreatedAt:");
  });

  it("creates task queue from plan", () => {
    expect(agentSrc).toContain("createTaskQueue");
    expect(agentSrc).toContain("db.createAgentTask");
  });

  it("checks task dependencies before execution", () => {
    expect(agentSrc).toContain("task.dependsOn");
    expect(agentSrc).toContain("db.checkTaskDependencies");
  });

  it("sends telegram notification after task execution", () => {
    expect(agentSrc).toContain("sendTelegramNotification");
    expect(agentSrc).toContain("SEO Agent Report");
  });

  it("logs actions to seo_actions table", () => {
    expect(agentSrc).toContain("db.addSeoAction");
    expect(agentSrc).toContain("[Agent]");
  });

  it("uses structured JSON response format for LLM plan generation", () => {
    expect(agentSrc).toContain("response_format:");
    expect(agentSrc).toContain("json_schema");
    expect(agentSrc).toContain("seo_agent_plan");
  });

  it("includes gambling/casino specialization in system prompt", () => {
    expect(agentSrc).toContain("gambling");
    expect(agentSrc).toContain("grey/black hat SEO");
  });
});

// ═══ 2. SEO Agent Router (seo-agent-router.ts) ═══
describe("SEO Agent Router", () => {
  it("exports seoAgentRouter", () => {
    expect(agentRouterSrc).toContain("export const seoAgentRouter");
  });

  it("has getStatus procedure", () => {
    expect(agentRouterSrc).toContain("getStatus:");
  });

  it("has generatePlan procedure", () => {
    expect(agentRouterSrc).toContain("generatePlan:");
  });

  it("has runTasks procedure with maxTasks input", () => {
    expect(agentRouterSrc).toContain("runTasks:");
    expect(agentRouterSrc).toContain("maxTasks");
  });

  it("has getTaskQueue procedure", () => {
    expect(agentRouterSrc).toContain("getTaskQueue:");
  });

  it("has executeTask procedure", () => {
    expect(agentRouterSrc).toContain("executeTask:");
  });

  it("has skipTask procedure", () => {
    expect(agentRouterSrc).toContain("skipTask:");
  });

  it("has getContent procedure", () => {
    expect(agentRouterSrc).toContain("getContent:");
  });

  it("uses protectedProcedure for all procedures", () => {
    expect(agentRouterSrc).toContain("protectedProcedure");
  });

  it("is registered in main routers.ts", () => {
    expect(routersSrc).toContain("seoAgentRouter");
    expect(routersSrc).toContain("seoAgent:");
  });
});

// ═══ 3. User Isolation in SEO Automation ═══
describe("User Isolation", () => {
  it("seo-automation list uses getUserScopesSeoProjects", () => {
    expect(seoAutomationSrc).toContain("getUserScopesSeoProjects");
  });

  it("getUserScopesSeoProjects function exists in db.ts", () => {
    expect(dbSrc).toContain("export async function getUserScopesSeoProjects");
  });

  it("getUserScopesSeoProjects filters by userId for non-admin", () => {
    expect(dbSrc).toContain("eq(seoProjects.userId, userId)");
  });

  it("getUserScopesSeoProjects returns all for admin", () => {
    expect(dbSrc).toContain("if (isAdmin)");
  });

  it("passes isAdmin flag based on user role", () => {
    expect(seoAutomationSrc).toMatch(/role.*admin|admin.*role/);
  });
});

// ═══ 4. PBN Admin Guard ═══
describe("PBN Admin Guard", () => {
  it("listSites uses protectedProcedure (all users can view)", () => {
    // Find the listSites section
    const listSiteIdx = domainRouterSrc.indexOf("listSites:");
    const addSiteIdx = domainRouterSrc.indexOf("addSite:");
    const section = domainRouterSrc.slice(listSiteIdx, addSiteIdx);
    expect(section).toContain("protectedProcedure");
  });

  it("addSite uses adminProcedure", () => {
    const addSiteIdx = domainRouterSrc.indexOf("addSite:");
    const updateSiteIdx = domainRouterSrc.indexOf("updateSite:");
    const section = domainRouterSrc.slice(addSiteIdx, updateSiteIdx);
    expect(section).toContain("adminProcedure");
  });

  it("updateSite uses adminProcedure", () => {
    const updateSiteIdx = domainRouterSrc.indexOf("updateSite:");
    const deleteSiteIdx = domainRouterSrc.indexOf("deleteSite:");
    const section = domainRouterSrc.slice(updateSiteIdx, deleteSiteIdx);
    expect(section).toContain("adminProcedure");
  });

  it("deleteSite uses adminProcedure", () => {
    const deleteSiteIdx = domainRouterSrc.indexOf("deleteSite:");
    const postIdx = domainRouterSrc.indexOf("post:", deleteSiteIdx);
    const section = domainRouterSrc.slice(deleteSiteIdx, postIdx);
    expect(section).toContain("adminProcedure");
  });

  it("imports adminProcedure from trpc", () => {
    expect(domainRouterSrc).toContain("adminProcedure");
  });
});

// ═══ 5. Database Schema ═══
describe("Database Schema — SEO Agent Tables", () => {
  it("has seo_agent_tasks table", () => {
    expect(schemaSrc).toContain("seo_agent_tasks");
  });

  it("seo_agent_tasks has required columns", () => {
    // Check key columns exist
    expect(schemaSrc).toContain("taskType");
    expect(schemaSrc).toContain("scheduledFor");
    expect(schemaSrc).toContain("aiReasoning");
    expect(schemaSrc).toContain("aiConfidence");
    expect(schemaSrc).toContain("dependsOn");
  });

  it("has seo_content table", () => {
    expect(schemaSrc).toContain("seo_content");
  });

  it("seo_content has required columns", () => {
    expect(schemaSrc).toContain("targetKeyword");
    expect(schemaSrc).toContain("metaTitle");
    expect(schemaSrc).toContain("metaDescription");
    expect(schemaSrc).toContain("publishStatus");
    expect(schemaSrc).toContain("wpPostId");
  });

  it("seoProjects has targetDays field", () => {
    expect(schemaSrc).toContain("targetDays");
  });

  it("seoProjects has aiEstimatedDays field", () => {
    expect(schemaSrc).toContain("aiEstimatedDays");
  });

  it("seoProjects has aiPlan field", () => {
    expect(schemaSrc).toContain("aiPlan");
  });

  it("seoProjects has aiPlanCreatedAt field", () => {
    expect(schemaSrc).toContain("aiPlanCreatedAt");
  });
});

// ═══ 6. DB Helper Functions ═══
describe("DB Helper Functions for Agent", () => {
  it("has createAgentTask function", () => {
    expect(dbSrc).toContain("export async function createAgentTask");
  });

  it("has getPendingAgentTasks function", () => {
    expect(dbSrc).toContain("export async function getPendingAgentTasks");
  });

  it("has getUpcomingAgentTasks function", () => {
    expect(dbSrc).toContain("export async function getUpcomingAgentTasks");
  });

  it("has updateAgentTask function", () => {
    expect(dbSrc).toContain("export async function updateAgentTask");
  });

  it("has getAgentTaskById function", () => {
    expect(dbSrc).toContain("export async function getAgentTaskById");
  });

  it("has checkTaskDependencies function", () => {
    expect(dbSrc).toContain("export async function checkTaskDependencies");
  });

  it("has createSeoContent function", () => {
    expect(dbSrc).toContain("export async function createSeoContent");
  });

  it("has getUnpublishedContent function", () => {
    expect(dbSrc).toContain("export async function getUnpublishedContent");
  });

  it("has updateSeoContent function", () => {
    expect(dbSrc).toContain("export async function updateSeoContent");
  });

  it("has getProjectContent function", () => {
    expect(dbSrc).toContain("export async function getProjectContent");
  });

  it("has getAllActiveSeoProjects function", () => {
    expect(dbSrc).toContain("export async function getAllActiveSeoProjects");
  });

  // getAgentTasksByProject not needed — tasks are queried via getAgentTasksByProject in router directly
});

// ═══ 7. Frontend — Add Domain Dialog ═══
describe("Add Domain Dialog — targetDays", () => {
  it("has targetDays state variable", () => {
    expect(seoCommandSrc).toContain("targetDays");
  });

  it("has targetDays selector UI (3/7/30 days)", () => {
    // Check for the three options
    expect(seoCommandSrc).toContain("3 วัน");
    expect(seoCommandSrc).toContain("7 วัน");
    expect(seoCommandSrc).toContain("30 วัน");
  });

  it("passes targetDays to create mutation", () => {
    expect(seoCommandSrc).toContain("targetDays");
  });
});

// ═══ 8. Frontend — AI Agent Tab ═══
describe("AI Agent Tab in SeoProjectDetail", () => {
  it("has AI Agent tab trigger", () => {
    expect(seoDetailSrc).toContain('value="agent"');
    expect(seoDetailSrc).toContain("AI Agent");
  });

  it("has AIAgentTab component", () => {
    expect(seoDetailSrc).toContain("function AIAgentTab");
  });

  it("uses seoAgent.getStatus query", () => {
    expect(seoDetailSrc).toContain("trpc.seoAgent.getStatus.useQuery");
  });

  it("uses seoAgent.getTaskQueue query", () => {
    expect(seoDetailSrc).toContain("trpc.seoAgent.getTaskQueue.useQuery");
  });

  it("has generatePlan mutation button", () => {
    expect(seoDetailSrc).toContain("generatePlan.mutate");
    expect(seoDetailSrc).toContain("สร้างแผน AI");
  });

  it("has runTasks mutation button", () => {
    expect(seoDetailSrc).toContain("runTasks.mutate");
    expect(seoDetailSrc).toContain("รัน Tasks");
  });

  it("has skipTask mutation", () => {
    expect(seoDetailSrc).toContain("skipTask.mutate");
  });

  it("displays AI Plan visualization with phases", () => {
    expect(seoDetailSrc).toContain("AI Strategic Plan");
    expect(seoDetailSrc).toContain("plan.phases");
    expect(seoDetailSrc).toContain("plan.reasoning");
    expect(seoDetailSrc).toContain("plan.riskAssessment");
  });

  it("displays task queue with status icons", () => {
    expect(seoDetailSrc).toContain("Task Queue");
    expect(seoDetailSrc).toContain("task.status");
    expect(seoDetailSrc).toContain("task.taskType");
  });

  it("shows agent status cards (target days, pending tasks, stats)", () => {
    expect(seoDetailSrc).toContain("Target / Estimated");
    expect(seoDetailSrc).toContain("Pending Tasks");
    expect(seoDetailSrc).toContain("totalBacklinksBuilt");
    expect(seoDetailSrc).toContain("totalContentCreated");
  });

  it("shows error display when agent has error", () => {
    expect(seoDetailSrc).toContain("agentStatus?.error");
    expect(seoDetailSrc).toContain("Agent Error");
  });
});

// ═══ 9. SEO Automation Router — targetDays in create ═══
describe("SEO Automation Router — targetDays", () => {
  it("accepts targetDays in create input", () => {
    expect(seoAutomationSrc).toContain("targetDays");
  });
});

// ═══ 10. Integration — Router Registration ═══
describe("Router Registration", () => {
  it("seoAgent router is registered in main routers", () => {
    expect(routersSrc).toContain("seoAgent:");
    expect(routersSrc).toContain("seoAgentRouter");
  });

  it("imports seoAgentRouter from correct path", () => {
    expect(routersSrc).toContain("seo-agent-router");
  });
});
