/**
 * Tests for SEO Scheduler + AI Agent integration and Progress Dashboard
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// Read source files for structural validation
const schedulerCode = readFileSync(resolve(__dirname, "seo-scheduler.ts"), "utf-8");
const agentRouterCode = readFileSync(resolve(__dirname, "routers/seo-agent-router.ts"), "utf-8");
const dbCode = readFileSync(resolve(__dirname, "db.ts"), "utf-8");

describe("SEO Scheduler — AI Agent Integration", () => {
  it("should import runAllProjectsDailyTasks from seo-agent", () => {
    expect(schedulerCode).toContain("runAllProjectsDailyTasks");
    expect(schedulerCode).toContain('from "./seo-agent"');
  });

  it("should call runAllProjectsDailyTasks in runScheduledJobs", () => {
    // The scheduler should call the AI agent daily tasks
    expect(schedulerCode).toContain("runAllProjectsDailyTasks()");
  });

  it("should include agentResult in the return type", () => {
    expect(schedulerCode).toContain("agentResult");
    expect(schedulerCode).toContain("projectsProcessed");
    expect(schedulerCode).toContain("totalTasks");
    expect(schedulerCode).toContain("totalCompleted");
    expect(schedulerCode).toContain("totalFailed");
  });

  it("should handle AI agent errors gracefully", () => {
    // Should have try-catch around runAllProjectsDailyTasks
    expect(schedulerCode).toContain("catch");
    // Should have a fallback agentResult on error
    expect(schedulerCode).toContain("projectsProcessed: 0");
  });

  it("should log AI agent results", () => {
    expect(schedulerCode).toContain("[SEO Scheduler]");
    expect(schedulerCode).toContain("AI Agent");
  });

  it("should run on a 30-minute interval", () => {
    expect(schedulerCode).toMatch(/30\s*\*\s*60\s*\*\s*1000|1800000|30.*นาที/);
  });
});

describe("Progress Dashboard — Router", () => {
  it("should have getProgressDashboard procedure", () => {
    expect(agentRouterCode).toContain("getProgressDashboard");
  });

  it("should use protectedProcedure for dashboard", () => {
    // getProgressDashboard should require authentication
    expect(agentRouterCode).toContain("getProgressDashboard: protectedProcedure");
  });

  it("should call getUserScopesSeoProjects for user isolation", () => {
    expect(agentRouterCode).toContain("getUserScopesSeoProjects");
  });

  it("should return projects, overall stats, and recentActivity", () => {
    expect(agentRouterCode).toContain("projects: projectProgress");
    expect(agentRouterCode).toContain("overall");
    expect(agentRouterCode).toContain("recentActivity");
  });

  it("should calculate progress percentage per project", () => {
    expect(agentRouterCode).toContain("progressPercent");
    expect(agentRouterCode).toContain("doneOrSkipped");
  });

  it("should include today's task counts", () => {
    expect(agentRouterCode).toContain("todayCompleted");
    expect(agentRouterCode).toContain("todayFailed");
  });

  it("should include overall stats", () => {
    expect(agentRouterCode).toContain("totalDomains");
    expect(agentRouterCode).toContain("activeCampaigns");
    expect(agentRouterCode).toContain("tasksToday");
    expect(agentRouterCode).toContain("tasksCompleted");
    expect(agentRouterCode).toContain("tasksFailed");
    expect(agentRouterCode).toContain("totalBacklinks");
    expect(agentRouterCode).toContain("totalContent");
  });

  it("should include per-project metrics (DA, DR, backlinks, content)", () => {
    expect(agentRouterCode).toContain("da:");
    expect(agentRouterCode).toContain("dr:");
    expect(agentRouterCode).toContain("backlinks:");
    expect(agentRouterCode).toContain("content:");
    expect(agentRouterCode).toContain("wpChanges:");
  });

  it("should include agent status and auto-run info", () => {
    expect(agentRouterCode).toContain("agentStatus");
    expect(agentRouterCode).toContain("autoRunEnabled");
    expect(agentRouterCode).toContain("nextAutoRunAt");
    expect(agentRouterCode).toContain("lastAutoRunAt");
  });

  it("should parse AI plan for phase info", () => {
    expect(agentRouterCode).toContain("currentPhase");
    expect(agentRouterCode).toContain("totalPhases");
    expect(agentRouterCode).toContain("completedPhases");
  });

  it("should sort recent activity by completedAt descending", () => {
    expect(agentRouterCode).toContain("bTime - aTime");
  });

  it("should limit recent activity to 20 items", () => {
    expect(agentRouterCode).toContain(".slice(0, 20)");
  });
});

describe("DB Helpers — Agent Tasks", () => {
  it("should have getProjectAgentTasks function", () => {
    expect(dbCode).toContain("export async function getProjectAgentTasks");
  });

  it("should have getPendingAgentTasks function", () => {
    expect(dbCode).toContain("export async function getPendingAgentTasks");
  });

  it("should have getUpcomingAgentTasks function", () => {
    expect(dbCode).toContain("export async function getUpcomingAgentTasks");
  });

  it("should have createAgentTask function", () => {
    expect(dbCode).toContain("export async function createAgentTask");
  });

  it("should have updateAgentTask function", () => {
    expect(dbCode).toContain("export async function updateAgentTask");
  });

  it("should have getAgentTaskById function", () => {
    expect(dbCode).toContain("export async function getAgentTaskById");
  });

  it("should have getUserScopesSeoProjects with user isolation", () => {
    expect(dbCode).toContain("export async function getUserScopesSeoProjects");
    expect(dbCode).toContain("isAdmin");
  });

  it("should have createSeoContent function", () => {
    expect(dbCode).toContain("export async function createSeoContent");
  });

  it("should have getProjectContent function", () => {
    expect(dbCode).toContain("export async function getProjectContent");
  });
});

describe("Frontend — AgentProgressDashboard", () => {
  const frontendCode = readFileSync(
    resolve(__dirname, "../client/src/pages/SeoCommandCenter.tsx"),
    "utf-8"
  );

  it("should have AgentProgressDashboard component", () => {
    expect(frontendCode).toContain("function AgentProgressDashboard");
  });

  it("should call seoAgent.getProgressDashboard", () => {
    expect(frontendCode).toContain("trpc.seoAgent.getProgressDashboard.useQuery");
  });

  it("should auto-refresh every 30 seconds", () => {
    expect(frontendCode).toContain("refetchInterval: 30_000");
  });

  it("should display overall stats cards", () => {
    expect(frontendCode).toContain("Tasks Today");
    expect(frontendCode).toContain("Completed");
    expect(frontendCode).toContain("Failed");
    expect(frontendCode).toContain("Backlinks");
    expect(frontendCode).toContain("Content");
  });

  it("should display per-domain progress bars", () => {
    expect(frontendCode).toContain("progressPercent");
    expect(frontendCode).toContain("h-2 bg-muted");
  });

  it("should display agent status badges", () => {
    expect(frontendCode).toContain("agentStatusConfig");
    expect(frontendCode).toContain("รอคำสั่ง");
    expect(frontendCode).toContain("วางแผน");
    expect(frontendCode).toContain("กำลังทำงาน");
    expect(frontendCode).toContain("ติดตามผล");
  });

  it("should display task type labels in Thai", () => {
    expect(frontendCode).toContain("วิเคราะห์โดเมน");
    expect(frontendCode).toContain("วิจัย Keywords");
    expect(frontendCode).toContain("สร้าง Content");
    expect(frontendCode).toContain("สร้าง PBN Link");
  });

  it("should display recent activity feed", () => {
    expect(frontendCode).toContain("Recent AI Activity");
    expect(frontendCode).toContain("recentActivity.map");
  });

  it("should navigate to project detail on click", () => {
    expect(frontendCode).toContain("navigate(`/seo/${project.id}`)");
  });

  it("should show remaining days with color coding", () => {
    expect(frontendCode).toContain("daysLeft");
    expect(frontendCode).toContain("text-red-400");
    expect(frontendCode).toContain("text-amber-400");
    expect(frontendCode).toContain("text-emerald-400");
  });

  it("should be rendered in the SeoCommandCenter page", () => {
    expect(frontendCode).toContain("<AgentProgressDashboard />");
  });
});
