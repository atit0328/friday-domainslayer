/**
 * SEO Agent Router — Agentic AI procedures
 * Handles AI plan generation, task execution, and agent status
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { generateAgentPlan, executeAgentTask, runDailyTasks } from "../seo-agent";

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
      // Get content
      const contents = await db.getProjectContent(0, 1); // We need a getContentById helper
      // For now, use a simpler approach
      throw new Error("Not implemented yet — use WP integration directly");
    }),
});
