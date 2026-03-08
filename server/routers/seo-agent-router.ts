/**
 * SEO Agent Router — Agentic AI procedures
 * Handles AI plan generation, task execution, and agent status
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { generateAgentPlan, executeAgentTask, runDailyTasks } from "../seo-agent";
import { seoAgentTasks } from "../../drizzle/schema";
import { eq, sql, and, gte } from "drizzle-orm";

export const seoAgentRouter = router({
  // Get AI agent status for a project
  getStatus: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");
      // User isolation: only owner or admin can see
      if (project.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }
      const tasks = await db.getProjectAgentTasks(input.projectId, 50);
      const pendingTasks = await db.getPendingAgentTasks(input.projectId);
      const upcomingTasks = await db.getUpcomingAgentTasks(input.projectId, 5);

      return {
        status: project.aiAgentStatus || "idle",
        lastAction: project.aiAgentLastAction,
        nextAction: project.aiAgentNextAction,
        error: project.aiAgentError,
        plan: project.aiPlan,
        planCreatedAt: project.aiPlanCreatedAt,
        estimatedDays: project.aiEstimatedDays,
        targetDays: project.targetDays,
        tasks,
        pendingTasks: pendingTasks.length,
        upcomingTasks,
        stats: {
          totalBacklinksBuilt: project.totalBacklinksBuilt || 0,
          totalContentCreated: project.totalContentCreated || 0,
          totalWpChanges: project.totalWpChanges || 0,
          totalActionsExecuted: project.totalActionsExecuted || 0,
        },
      };
    }),

  // Generate AI plan for a project
  generatePlan: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");
      if (project.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }

      // Update status to planning
      await db.updateSeoProject(input.projectId, {
        aiAgentStatus: "planning",
        aiAgentError: null,
      });

      try {
        const plan = await generateAgentPlan(input.projectId);

        return {
          success: true,
          plan,
          estimatedDays: plan.estimatedDays,
          confidence: plan.confidence,
          totalTasks: plan.dailyTasks.reduce((sum, d) => sum + d.tasks.length, 0),
        };
      } catch (err: any) {
        await db.updateSeoProject(input.projectId, {
          aiAgentStatus: "failed",
          aiAgentError: err.message,
        });
        throw err;
      }
    }),

  // Run pending tasks for a project
  runTasks: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      maxTasks: z.number().min(1).max(20).default(5),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");
      if (project.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }

      // Update status
      await db.updateSeoProject(input.projectId, {
        aiAgentStatus: "executing",
        aiAgentError: null,
      });

      try {
        const result = await runDailyTasks(input.projectId);
        return result;
      } catch (err: any) {
        await db.updateSeoProject(input.projectId, {
          aiAgentStatus: "failed",
          aiAgentError: err.message,
        });
        throw err;
      }
    }),

  // Get task queue for a project
  getTaskQueue: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");
      if (project.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }
      return db.getProjectAgentTasks(input.projectId, input.limit);
    }),

  // Execute a single specific task
  executeTask: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const task = await db.getAgentTaskById(input.taskId);
      if (!task) throw new Error("Task not found");
      const project = await db.getSeoProjectById(task.projectId);
      if (!project) throw new Error("Project not found");
      if (project.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }

      return executeAgentTask(input.taskId);
    }),

  // Skip a task
  skipTask: protectedProcedure
    .input(z.object({ taskId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const task = await db.getAgentTaskById(input.taskId);
      if (!task) throw new Error("Task not found");
      const project = await db.getSeoProjectById(task.projectId);
      if (!project) throw new Error("Project not found");
      if (project.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }

      await db.updateAgentTask(input.taskId, {
        status: "skipped",
        result: { reason: input.reason || "Manually skipped by user" } as any,
        completedAt: new Date(),
      });
      return { success: true };
    }),

  // Get content created by AI agent
  getContent: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");
      if (project.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Access denied");
      }
      return db.getProjectContent(input.projectId, input.limit);
    }),

  // Publish content to WordPress
  publishContent: protectedProcedure
    .input(z.object({ contentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const contents = await db.getProjectContent(0, 1);
      throw new Error("Not implemented yet — use WP integration directly");
    }),

  // ═══ Progress Dashboard ═══
  // Get progress overview for all user's domains
  getProgressDashboard: protectedProcedure
    .query(async ({ ctx }) => {
      const isAdmin = ctx.user.role === "admin";
      const projects = await db.getUserScopesSeoProjects(ctx.user.id, isAdmin);
      const database = await db.getDb();
      if (!database) return { projects: [], overall: { totalDomains: 0, activeCampaigns: 0, tasksToday: 0, tasksCompleted: 0, tasksFailed: 0, totalBacklinks: 0, totalContent: 0 }, recentActivity: [] };

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get task stats for each project
      const projectProgress = await Promise.all(
        projects.map(async (project) => {
          const allTasks = await db.getProjectAgentTasks(project.id, 500);
          const pendingTasks = allTasks.filter(t => t.status === "queued");
          const runningTasks = allTasks.filter(t => t.status === "running");
          const completedTasks = allTasks.filter(t => t.status === "completed");
          const failedTasks = allTasks.filter(t => t.status === "failed");
          const skippedTasks = allTasks.filter(t => t.status === "skipped");

          // Tasks completed today
          const todayCompleted = completedTasks.filter(t => t.completedAt && new Date(t.completedAt) >= today);
          const todayFailed = failedTasks.filter(t => t.completedAt && new Date(t.completedAt) >= today);

          // Calculate progress percentage
          const totalTasks = allTasks.length;
          const doneOrSkipped = completedTasks.length + skippedTasks.length;
          const progressPercent = totalTasks > 0 ? Math.round((doneOrSkipped / totalTasks) * 100) : 0;

          // Parse AI plan for phase info
          let currentPhase = "";
          let totalPhases = 0;
          let completedPhases = 0;
          try {
            const plan = project.aiPlan as any;
            if (plan?.phases) {
              totalPhases = plan.phases.length;
              completedPhases = plan.phases.filter((p: any) => p.status === "completed").length;
              const activePhase = plan.phases.find((p: any) => p.status === "active" || p.status === "in_progress");
              currentPhase = activePhase?.name || plan.phases[completedPhases]?.name || "";
            }
          } catch {}

          return {
            id: project.id,
            domain: project.domain,
            niche: project.niche,
            status: project.status,
            agentStatus: project.aiAgentStatus || "idle",
            targetDays: project.targetDays,
            estimatedDays: project.aiEstimatedDays,
            progressPercent,
            currentPhase,
            totalPhases,
            completedPhases,
            stats: {
              totalTasks,
              pending: pendingTasks.length,
              running: runningTasks.length,
              completed: completedTasks.length,
              failed: failedTasks.length,
              skipped: skippedTasks.length,
              todayCompleted: todayCompleted.length,
              todayFailed: todayFailed.length,
            },
            metrics: {
              da: project.currentDA || 0,
              dr: project.currentDR || 0,
              backlinks: project.totalBacklinksBuilt || 0,
              content: project.totalContentCreated || 0,
              wpChanges: project.totalWpChanges || 0,
            },
            autoRunEnabled: project.autoRunEnabled,
            nextAutoRunAt: project.nextAutoRunAt,
            lastAutoRunAt: project.lastAutoRunAt,
            createdAt: project.createdAt,
          };
        })
      );

      // Overall stats
      const overall = {
        totalDomains: projects.length,
        activeCampaigns: projects.filter(p => ["active", "analyzing"].includes(p.status)).length,
        tasksToday: projectProgress.reduce((sum, p) => sum + p.stats.todayCompleted + p.stats.todayFailed, 0),
        tasksCompleted: projectProgress.reduce((sum, p) => sum + p.stats.completed, 0),
        tasksFailed: projectProgress.reduce((sum, p) => sum + p.stats.failed, 0),
        totalBacklinks: projectProgress.reduce((sum, p) => sum + p.metrics.backlinks, 0),
        totalContent: projectProgress.reduce((sum, p) => sum + p.metrics.content, 0),
      };

      // Recent activity — last 20 completed/failed tasks across all projects
      const projectIds = projects.map(p => p.id);
      let recentActivity: any[] = [];
      if (projectIds.length > 0) {
        const allRecentTasks = await Promise.all(
          projectIds.slice(0, 20).map(pid => db.getProjectAgentTasks(pid, 10))
        );
        recentActivity = allRecentTasks
          .flat()
          .filter(t => t.status === "completed" || t.status === "failed")
          .sort((a, b) => {
            const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
            const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
            return bTime - aTime;
          })
          .slice(0, 20)
          .map(t => {
            const project = projects.find(p => p.id === t.projectId);
            return {
              id: t.id,
              projectId: t.projectId,
              domain: project?.domain || "unknown",
              taskType: t.taskType,
              status: t.status,
              description: t.description,
              completedAt: t.completedAt,
              aiReasoning: t.aiReasoning,
            };
          });
      }

      return { projects: projectProgress, overall, recentActivity };
    }),
});
