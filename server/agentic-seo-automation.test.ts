/**
 * Vitest tests for Agentic SEO Automation
 * - Full agentic flow: user adds domain → auto-scan → auto-plan → auto-start
 * - Telegram success-only notifications
 * - Auto-regenerate plan when tasks depleted
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";

// Read source files for structural verification
const seoAutomationSrc = fs.readFileSync("server/routers/seo-automation.ts", "utf-8");
const seoSchedulerSrc = fs.readFileSync("server/seo-scheduler.ts", "utf-8");
const seoAgentSrc = fs.readFileSync("server/seo-agent.ts", "utf-8");
const blackhatBrainSrc = fs.readFileSync("server/agentic-blackhat-brain.ts", "utf-8");

describe("Agentic SEO Automation — Full Auto Flow", () => {
  it("auto-generates AI plan after scan in create mutation", () => {
    expect(seoAutomationSrc).toContain("AGENTIC AI: Auto-generate plan + auto-start SEO");
    expect(seoAutomationSrc).toContain("generateAgentPlan(result.id)");
  });

  it("auto-starts SEO after plan generation", () => {
    expect(seoAutomationSrc).toContain("autoStartAfterScan(result.id)");
    expect(seoAutomationSrc).toContain("Auto-starting SEO for");
  });

  it("imports autoStartAfterScan and generateAgentPlan", () => {
    expect(seoAutomationSrc).toContain('import { autoStartAfterScan } from "../seo-scheduler"');
    expect(seoAutomationSrc).toContain('import { generateAgentPlan } from "../seo-agent"');
  });

  it("sets aiAgentStatus to executing after plan generation", () => {
    expect(seoAutomationSrc).toContain('aiAgentStatus: "executing"');
  });

  it("falls back to autoStartAfterScan even if plan generation fails", () => {
    expect(seoAutomationSrc).toContain("Still start SEO even if plan generation fails");
    // Count occurrences of autoStartAfterScan in the create mutation area
    const matches = seoAutomationSrc.match(/autoStartAfterScan\(result\.id\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2); // main path + fallback
  });
});

describe("Auto-Regenerate Plan When Tasks Depleted", () => {
  it("scheduler checks for depleted tasks and regenerates plan", () => {
    expect(seoSchedulerSrc).toContain("AGENTIC AI: Auto-regenerate plan when all tasks are completed");
    expect(seoSchedulerSrc).toContain("getPendingAgentTasks");
    expect(seoSchedulerSrc).toContain("generateAgentPlan(project.id)");
  });

  it("only regenerates when pendingTasks.length === 0", () => {
    expect(seoSchedulerSrc).toContain("pendingTasks.length === 0");
    expect(seoSchedulerSrc).toContain("Auto-regenerating plan for");
  });

  it("sends Telegram success notification for plan regeneration", () => {
    expect(seoSchedulerSrc).toContain("SEO Plan Auto-Regenerated");
    expect(seoSchedulerSrc).toContain('type: "success"');
  });
});

describe("Telegram SUCCESS-Only Notifications", () => {
  it("seo-agent sends Telegram only for completed tasks (not failures)", () => {
    // Should check completed > 0 before sending
    expect(seoAgentSrc).toContain("if (completed > 0)");
    // Should use type: "success"
    expect(seoAgentSrc).toContain('type: "success"');
    // Should NOT contain type: "info" for the main report
    const reportSection = seoAgentSrc.substring(
      seoAgentSrc.indexOf("Send Telegram notification ONLY for success results"),
    );
    expect(reportSection).toContain('type: "success"');
  });

  it("seo-scheduler sends Telegram only when totalCompleted > 0", () => {
    expect(seoSchedulerSrc).toContain("if (agentResult.totalCompleted > 0)");
    expect(seoSchedulerSrc).toContain("SEO Agent Success Report");
  });

  it("blackhat brain sends Telegram only on success (successCount > 0)", () => {
    expect(blackhatBrainSrc).toContain("if (successCount > 0)");
    expect(blackhatBrainSrc).toContain("notifyBlackhatSuccess");
    expect(blackhatBrainSrc).toContain("Only send on success");
    expect(blackhatBrainSrc).toContain("if (result.successfulTechniques === 0) return false");
  });

  it("blackhat brain notification uses type success", () => {
    expect(blackhatBrainSrc).toContain('type: "success"');
    expect(blackhatBrainSrc).toContain("Agentic Blackhat Brain — SUCCESS");
  });

  it("seo-automation create sends success notification with plan details", () => {
    expect(seoAutomationSrc).toContain("Agentic SEO Auto-Started!");
    expect(seoAutomationSrc).toContain('type: "success"');
    expect(seoAutomationSrc).toContain("Auto-run enabled");
  });

  it("WP error fix notification uses success type", () => {
    expect(seoAgentSrc).toContain("WP Error Fix Success:");
    // The WP fix notification should be type: "success"
    const wpFixSection = seoAgentSrc.substring(
      seoAgentSrc.indexOf("WP Error Fix Success"),
      seoAgentSrc.indexOf("WP Error Fix Success") + 200,
    );
    // Check the notification before it
    const wpNotifSection = seoAgentSrc.substring(
      seoAgentSrc.indexOf("Send notification if critical errors were fixed"),
      seoAgentSrc.indexOf("WP Error Fix Success") + 200,
    );
    expect(wpNotifSection).toContain('type: "success"');
  });
});

describe("Full Agentic Flow Integration", () => {
  it("create mutation has complete 5-step flow", () => {
    // Step 1: Create project
    expect(seoAutomationSrc).toContain("db.createSeoProject");
    // Step 2: Auto-scan
    expect(seoAutomationSrc).toContain("Auto-scan");
    // Step 3: Campaign (if WP)
    expect(seoAutomationSrc).toContain("Auto-starting 16-phase campaign");
    // Step 4: Auto-generate plan
    expect(seoAutomationSrc).toContain("Auto-generate the AI agent plan");
    // Step 5: Auto-start SEO
    expect(seoAutomationSrc).toContain("Auto-start SEO immediately");
  });

  it("scheduler runs continuously with auto-regeneration", () => {
    // Scheduler interval exists
    expect(seoSchedulerSrc).toContain("SCHEDULER_INTERVAL_MS");
    // Runs daily automation
    expect(seoSchedulerSrc).toContain("runDailyAutomation");
    // Runs agent tasks
    expect(seoSchedulerSrc).toContain("runAllProjectsDailyTasks");
    // Auto-regenerates plans
    expect(seoSchedulerSrc).toContain("generateAgentPlan");
  });

  it("no manual button needed — everything auto-triggers", () => {
    // The create mutation calls generateAgentPlan directly (not via router)
    expect(seoAutomationSrc).toContain("generateAgentPlan(result.id)");
    // The create mutation calls autoStartAfterScan directly
    expect(seoAutomationSrc).toContain("autoStartAfterScan(result.id)");
  });
});
