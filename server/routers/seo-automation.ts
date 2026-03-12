/**
 * Enterprise SEO Automation Router
 * Full-cycle grey/black hat SEO management
 */
import { z } from "zod";
import { router, protectedProcedure, isAdminUser } from "../_core/trpc";
import * as db from "../db";
import * as seoEngine from "../seo-engine";
import * as serpTracker from "../serp-tracker";
import { createWPClient } from "../wp-api";
import { runPhase, runAllPhases, recoverStaleCampaigns, CAMPAIGN_PHASES, type PhaseResult } from "../campaign-engine";
import { fetchDomainMetrics } from "../domain-metrics";
import { autoStartAfterScan } from "../seo-scheduler";
import { generateAgentPlan } from "../seo-agent";
import { sendTelegramNotification } from "../telegram-notifier";
import { triggerAutoSprint } from "../auto-sprint-trigger";
import { startMainDomainAutoSetup, getMainDomainSetupProgress } from "../pbn-auto-setup";

// ═══ Schedule Helpers ═══
const DAY_NAMES_TH: Record<number, string> = {
  0: "วันอาทิตย์",
  1: "วันจันทร์",
  2: "วันอังคาร",
  3: "วันพุธ",
  4: "วันพฤหัสบดี",
  5: "วันศุกร์",
  6: "วันเสาร์",
};

export function calculateNextRun(dayOfWeek: number, hourUTC: number): Date {
  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();

  let daysUntil = dayOfWeek - currentDay;
  if (daysUntil < 0) daysUntil += 7;
  if (daysUntil === 0 && currentHour >= hourUTC) daysUntil = 7;

  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysUntil);
  next.setUTCHours(hourUTC, 0, 0, 0);
  return next;
}

/**
 * Calculate the next run time from an array of selected days.
 * Finds the nearest upcoming day from the list.
 */
export function calculateNextRunMultiDay(days: number[], hourUTC: number): Date {
  if (days.length === 0) return calculateNextRun(1, hourUTC); // fallback to Monday

  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  // Sort days
  const sorted = [...days].sort((a, b) => a - b);

  // Find the next day that is either today (if hour hasn't passed) or a future day
  let bestDaysUntil = 8; // start with more than a week

  for (const day of sorted) {
    let daysUntil = day - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0 && (currentHour > hourUTC || (currentHour === hourUTC && currentMinute > 0))) {
      daysUntil = 7; // already passed today, find next occurrence
    }
    // But if daysUntil is 7, check if this day appears again next week
    if (daysUntil < bestDaysUntil) {
      bestDaysUntil = daysUntil;
    }
  }

  // If all days are 7+ away (shouldn't happen with valid input), use first day next week
  if (bestDaysUntil > 7) bestDaysUntil = sorted[0] - currentDay + 7;

  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + bestDaysUntil);
  next.setUTCHours(hourUTC, 0, 0, 0);
  return next;
}

// ═══ SEO Projects Router ═══
export const seoProjectsRouter = router({
  // List all user's SEO projects (user isolation: user sees only their own, admin sees all)
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getUserScopesSeoProjects(ctx.user.id, isAdminUser(ctx.user));
  }),

  // Get single project with full details
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");
      // Get latest stats
      const [blStats, snapshots, actions, rankings] = await Promise.all([
        db.getBacklinkStats(input.id),
        db.getProjectSnapshots(input.id, 30),
        db.getProjectActions(input.id, 20),
        db.getLatestRankings(input.id),
      ]);
      return { project, blStats, snapshots, recentActions: actions, rankings };
    }),

  // Create new project — just add a domain, AI does the rest
  create: protectedProcedure
    .input(z.object({
      domain: z.string().min(1),
      niche: z.string().optional(),
      strategy: z.enum(["grey_hat", "black_hat", "aggressive_grey", "pbn_focused", "tiered_links", "parasite_seo"]).default("grey_hat"),
      aggressiveness: z.number().min(1).max(10).default(5),
      autoBacklink: z.boolean().default(true),
      autoContent: z.boolean().default(false),
      autoPbn: z.boolean().default(false),
      monthlyBudget: z.string().default("0"),
      targetKeywords: z.array(z.string()).optional(),
      // WordPress credentials (optional)
      wpUsername: z.string().optional(),
      wpAppPassword: z.string().optional(),
      // Auto-start campaign after creation
      autoCampaign: z.boolean().default(false),
      // Agentic AI: target days for SEO plan
      targetDays: z.number().min(3).max(365).default(30),
      // Cloaking: redirect URL for Thai users (auto-deploy if set)
      cloakingRedirectUrl: z.string().url().optional(),
      // Cloaking: additional A/B split URLs
      cloakingRedirectUrls: z.array(z.string().url()).optional(),
      // Cloaking: redirect method
      cloakingMethod: z.enum(["js", "meta", "302", "301"]).optional(),
      // Cloaking: target countries
      cloakingCountries: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Validate WP credentials if provided
      let wpConnected = false;
      let wpSeoPlugin: string | null = null;
      if (input.wpUsername && input.wpAppPassword) {
        try {
          const wpClient = createWPClient({
            siteUrl: `https://${input.domain}`,
            username: input.wpUsername,
            appPassword: input.wpAppPassword,
          });
          const siteInfo = await wpClient.getSiteInfo();
          wpSeoPlugin = await wpClient.detectSEOPlugin();
          wpConnected = true;
          console.log(`[WP] Connected to ${siteInfo.name} (${input.domain}), SEO plugin: ${wpSeoPlugin || "none"}`);
        } catch (err: any) {
          console.warn(`[WP] Failed to connect to ${input.domain}:`, err.message);
          // Don't throw — still create the project, just without WP
        }
      }

      // Create the project
      const result = await db.createSeoProject(ctx.user.id, {
        domain: input.domain,
        name: input.domain,
        niche: input.niche || null,
        strategy: input.strategy,
        aggressiveness: input.aggressiveness,
        autoBacklink: input.autoBacklink,
        autoContent: input.autoContent,
        autoPbn: input.autoPbn,
        monthlyBudget: input.monthlyBudget,
        targetKeywords: input.targetKeywords || [],
        status: "analyzing",
        // WP fields
        wpUsername: input.wpUsername || null,
        wpAppPassword: input.wpAppPassword || null,
        wpConnected,
        wpSeoPlugin,
        // Campaign fields
        campaignEnabled: input.autoCampaign || false,
        campaignPhase: 0,
        campaignTotalPhases: 16,
        campaignProgress: 0,
        // Agentic AI fields
        targetDays: input.targetDays,
        aiAgentStatus: "idle",
      });

      // Log the creation action
      await db.addSeoAction(result.id, {
        actionType: "analysis",
        title: `สร้างโปรเจค ${input.domain}`,
        description: `เริ่มต้น SEO project — Strategy: ${input.strategy}, ความก้าวร้าว: ${input.aggressiveness}/10`,
        status: "completed",
        executedAt: new Date(),
        completedAt: new Date(),
      });

      // ═══ AUTO-SCAN: Run analysis + keyword research in background ═══
      // Fire-and-forget so the UI returns immediately
      (async () => {
        try {
          // Step 1: Full domain analysis (scrape + AI)
          const analysisAction = await db.addSeoAction(result.id, {
            actionType: "analysis",
            title: `Auto-scan: วิเคราะห์โดเมน ${input.domain}`,
            status: "running",
            executedAt: new Date(),
          });

          const analysis = await seoEngine.analyzeDomain(input.domain, input.niche || undefined);

          // Merge extracted keywords
          const existingKw = input.targetKeywords || [];
          const scrapedKw = analysis.extractedKeywords || [];
          const mergedKw = [...existingKw, ...scrapedKw]
            .filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i)
            .slice(0, 50);

          await db.updateSeoProject(result.id, {
            currentDA: analysis.currentState.estimatedDA,
            currentDR: analysis.currentState.estimatedDR,
            currentSpamScore: analysis.currentState.estimatedSpamScore,
            currentBacklinks: analysis.currentState.estimatedBacklinks,
            currentReferringDomains: analysis.currentState.estimatedReferringDomains,
            currentTrustFlow: analysis.currentState.estimatedTrustFlow,
            currentCitationFlow: analysis.currentState.estimatedCitationFlow,
            currentOrganicTraffic: analysis.currentState.estimatedOrganicTraffic,
            currentOrganicKeywords: analysis.currentState.estimatedOrganicKeywords,
            aiHealthScore: analysis.overallHealth,
            aiRiskLevel: analysis.riskLevel as any,
            aiLastAnalysis: analysis.aiSummary,
            lastAnalyzedAt: new Date(),
            status: "active",
            targetKeywords: mergedKw as any,
          });

          await db.addSeoSnapshot(result.id, {
            da: analysis.currentState.estimatedDA,
            dr: analysis.currentState.estimatedDR,
            spamScore: analysis.currentState.estimatedSpamScore,
            backlinks: analysis.currentState.estimatedBacklinks,
            referringDomains: analysis.currentState.estimatedReferringDomains,
            trustFlow: analysis.currentState.estimatedTrustFlow,
            citationFlow: analysis.currentState.estimatedCitationFlow,
            organicTraffic: analysis.currentState.estimatedOrganicTraffic,
            organicKeywords: analysis.currentState.estimatedOrganicKeywords,
            aiHealthScore: analysis.overallHealth,
            aiRiskLevel: analysis.riskLevel,
          });

          await db.updateSeoAction(analysisAction.id, {
            status: "completed",
            completedAt: new Date(),
            result: analysis as any,
            impact: "positive",
          });

          // Step 2: Auto keyword research
          const kwAction = await db.addSeoAction(result.id, {
            actionType: "keyword_research",
            title: `Auto-scan: วิจัย Keywords สำหรับ ${input.domain}`,
            status: "running",
            executedAt: new Date(),
          });

          const research = await seoEngine.researchKeywords(
            input.domain, input.niche || "general", mergedKw
          );

          // Save primary keywords to rank tracking
          for (const kw of research.primaryKeywords.slice(0, 15)) {
            await db.addRankEntry(result.id, {
              keyword: kw.keyword,
              searchVolume: kw.searchVolume,
              keywordDifficulty: kw.difficulty,
              cpc: String(kw.cpc),
              trend: "new",
            });
          }

          // Update project keywords
          const allKw = [
            ...mergedKw,
            ...research.primaryKeywords.map(k => k.keyword),
          ].filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i);

          await db.updateSeoProject(result.id, {
            targetKeywords: allKw as any,
          });

          await db.updateSeoAction(kwAction.id, {
            status: "completed",
            completedAt: new Date(),
            result: research as any,
            impact: "positive",
          });

          console.log(`[Auto-scan] Completed for ${input.domain}: analysis + ${research.primaryKeywords.length} keywords`);

          // Step 3: Auto-start 16-phase campaign if WP connected + autoCampaign
          if (wpConnected && input.autoCampaign) {
            console.log(`[Campaign] Auto-starting 16-phase campaign for ${input.domain}`);
            await db.updateSeoProject(result.id, {
              campaignEnabled: true,
              campaignStatus: "running",
              campaignStartedAt: new Date(),
            });
            try {
              const campaignResult = await runAllPhases(result.id);
              console.log(`[Campaign] Completed for ${input.domain}: ${campaignResult.summary.completed} phases, ${campaignResult.summary.totalWpChanges} WP changes`);
            } catch (err: any) {
              console.error(`[Campaign] Failed for ${input.domain}:`, err.message);
            }
          }

          // ═══ AGENTIC AI: Auto-generate plan + auto-start SEO (NO manual button needed) ═══
          console.log(`[Agentic SEO] 🧠 Auto-generating AI plan for ${input.domain}`);
          try {
            // Step 4: Auto-generate the AI agent plan
            const plan = await generateAgentPlan(result.id);
            console.log(`[Agentic SEO] ✅ Plan generated: ${plan.estimatedDays} days, ${plan.dailyTasks.reduce((s: number, d: any) => s + d.tasks.length, 0)} tasks, confidence: ${plan.confidence}%`);

            await db.updateSeoProject(result.id, {
              aiAgentStatus: "executing",
            });

            // Step 5: Auto-start SEO immediately (runs daily engine + enables auto-run)
            console.log(`[Agentic SEO] 🚀 Auto-starting SEO for ${input.domain}`);
            await autoStartAfterScan(result.id);

            // Send Telegram success notification
            try {
              await sendTelegramNotification({
                type: "success",
                targetUrl: input.domain,
                details: `🧠 Agentic SEO Auto-Started!\n` +
                  `📋 Domain: ${input.domain}\n` +
                  `📊 AI Plan: ${plan.estimatedDays} days, ${plan.dailyTasks.reduce((s: number, d: any) => s + d.tasks.length, 0)} tasks\n` +
                  `🎯 Confidence: ${plan.confidence}%\n` +
                  `⚡ Strategy: ${input.strategy}\n` +
                  `🔥 Aggressiveness: ${input.aggressiveness}/10\n` +
                  `✅ Auto-run enabled: ทุกวัน 10:00 น. (ICT)`,
              });
            } catch {}
            // ═══ AUTO-SPRINT: Trigger 7-day sprint + CTR campaign ═══
            try {
              console.log(`[AutoSprint] 🎯 Triggering auto-sprint for ${input.domain}`);
              const sprintResult = await triggerAutoSprint(result.id);
              if (sprintResult.triggered) {
                console.log(`[AutoSprint] ✅ Sprint ${sprintResult.sprintId} auto-started for ${input.domain}`);
              } else {
                console.log(`[AutoSprint] ⏭️ Sprint not triggered: ${sprintResult.reason}`);
              }
            } catch (sprintErr: any) {
              console.error(`[AutoSprint] Failed for ${input.domain}:`, sprintErr.message);
            }

            // ═══ WP AUTO-SETUP: Full WordPress setup (theme, settings, plugins, homepage, content) ═══
            if (wpConnected && input.wpUsername && input.wpAppPassword) {
              try {
                console.log(`[WP-AutoSetup] 🏗️ Starting WordPress auto-setup for ${input.domain}`);
                const primaryKeyword = (input.targetKeywords && input.targetKeywords.length > 0)
                  ? input.targetKeywords[0]
                  : input.domain.replace(/\.(com|net|org|io|co|th)$/i, "").replace(/[.-]/g, " ");

                startMainDomainAutoSetup({
                  projectId: result.id,
                  domain: input.domain,
                  wpUsername: input.wpUsername,
                  wpAppPassword: input.wpAppPassword,
                  niche: input.niche || "general",
                  brandKeyword: primaryKeyword,
                  // Pass all keywords for on-page SEO content injection
                  targetKeywords: allKw.length > 0 ? allKw : (input.targetKeywords || [primaryKeyword]),
                  // Pass cloaking config for auto-deploy
                  cloakingRedirectUrl: input.cloakingRedirectUrl,
                  cloakingRedirectUrls: input.cloakingRedirectUrls,
                  cloakingMethod: input.cloakingMethod,
                  cloakingCountries: input.cloakingCountries,
                });
                console.log(`[WP-AutoSetup] 📋 Queued — running in background`);
              } catch (setupErr: any) {
                console.error(`[WP-AutoSetup] Failed to start for ${input.domain}:`, setupErr.message);
              }
            }
          } catch (planErr: any) {
            console.error(`[Agentic SEO] Failed to auto-generate plan for ${input.domain}:`, planErr.message);
            // Still start SEO even if plan generation fails
            try {
              await autoStartAfterScan(result.id);
            } catch {}
            // Still try auto-sprint even if plan fails
            try {
              const sprintResult = await triggerAutoSprint(result.id);
              if (sprintResult.triggered) {
                console.log(`[AutoSprint] ✅ Sprint ${sprintResult.sprintId} auto-started (plan failed but sprint OK)`);
              }
            } catch {}
          }
        } catch (err: any) {
          console.error(`[Auto-scan] Failed for ${input.domain}:`, err.message);
          // Update project status to show it's still usable
          await db.updateSeoProject(result.id, { status: "active" }).catch(() => {});
        }
      })();

      return result;
    }),

  // Update project settings
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      niche: z.string().optional(),
      strategy: z.enum(["grey_hat", "black_hat", "aggressive_grey", "pbn_focused", "tiered_links", "parasite_seo"]).optional(),
      aggressiveness: z.number().min(1).max(10).optional(),
      autoBacklink: z.boolean().optional(),
      autoContent: z.boolean().optional(),
      autoPbn: z.boolean().optional(),
      monthlyBudget: z.string().optional(),
      status: z.enum(["setup", "analyzing", "active", "paused", "completed", "penalized"]).optional(),
      targetKeywords: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateSeoProject(id, data as any);
      return { success: true };
    }),

  // Delete project
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteSeoProject(input.id);
      return { success: true };
    }),

  // ═══ AI Analysis Actions ═══

  // Run full domain analysis
  analyze: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");

      // Log action start
      const action = await db.addSeoAction(input.id, {
        actionType: "analysis",
        title: `Full domain analysis: ${project.domain}`,
        status: "running",
        executedAt: new Date(),
      });

      try {
        // Run AI analysis
        const analysis = await seoEngine.analyzeDomain(project.domain, project.niche || undefined);

        // Merge extracted keywords with existing target keywords
        const existingKeywords = (project.targetKeywords as string[]) || [];
        const scrapedKeywords = analysis.extractedKeywords || [];
        const mergedKeywords = [...existingKeywords, ...scrapedKeywords]
          .filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i)
          .slice(0, 50);

        // Update project with analysis results + scraped keywords
        await db.updateSeoProject(input.id, {
          currentDA: analysis.currentState.estimatedDA,
          currentDR: analysis.currentState.estimatedDR,
          currentSpamScore: analysis.currentState.estimatedSpamScore,
          currentBacklinks: analysis.currentState.estimatedBacklinks,
          currentReferringDomains: analysis.currentState.estimatedReferringDomains,
          currentTrustFlow: analysis.currentState.estimatedTrustFlow,
          currentCitationFlow: analysis.currentState.estimatedCitationFlow,
          currentOrganicTraffic: analysis.currentState.estimatedOrganicTraffic,
          currentOrganicKeywords: analysis.currentState.estimatedOrganicKeywords,
          aiHealthScore: analysis.overallHealth,
          aiRiskLevel: analysis.riskLevel as any,
          aiLastAnalysis: analysis.aiSummary,
          lastAnalyzedAt: new Date(),
          status: "active",
          targetKeywords: mergedKeywords as any,
        });

        // Save snapshot
        await db.addSeoSnapshot(input.id, {
          da: analysis.currentState.estimatedDA,
          dr: analysis.currentState.estimatedDR,
          spamScore: analysis.currentState.estimatedSpamScore,
          backlinks: analysis.currentState.estimatedBacklinks,
          referringDomains: analysis.currentState.estimatedReferringDomains,
          trustFlow: analysis.currentState.estimatedTrustFlow,
          citationFlow: analysis.currentState.estimatedCitationFlow,
          organicTraffic: analysis.currentState.estimatedOrganicTraffic,
          organicKeywords: analysis.currentState.estimatedOrganicKeywords,
          aiHealthScore: analysis.overallHealth,
          aiRiskLevel: analysis.riskLevel,
        });

        // Complete action
        await db.updateSeoAction(action.id, {
          status: "completed",
          completedAt: new Date(),
          result: analysis as any,
          impact: "positive",
        });

        return analysis;
      } catch (err: any) {
        await db.updateSeoAction(action.id, {
          status: "failed",
          errorMessage: err.message,
        });
        throw err;
      }
    }),

  // Generate SEO strategy
  generateStrategy: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");

      const action = await db.addSeoAction(input.id, {
        actionType: "strategy_update",
        title: `Generate ${project.strategy} SEO strategy`,
        status: "running",
        executedAt: new Date(),
      });

      try {
        // Build analysis from project data
        const analysis: seoEngine.DomainAnalysis = {
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
          riskLevel: (project.aiRiskLevel as any) || "medium",
          aiSummary: project.aiLastAnalysis || "",
        };

        const strategy = await seoEngine.generateStrategy(
          project.domain, analysis, project.strategy,
          project.aggressiveness, project.niche || undefined,
        );

        await db.updateSeoProject(input.id, {
          aiStrategy: strategy.aiRecommendation,
          aiNextActions: strategy.phases.slice(0, 3).map(p => p.name) as any,
        });

        await db.updateSeoAction(action.id, {
          status: "completed",
          completedAt: new Date(),
          result: strategy as any,
          impact: "positive",
        });

        return strategy;
      } catch (err: any) {
        await db.updateSeoAction(action.id, { status: "failed", errorMessage: err.message });
        throw err;
      }
    }),

  // Research keywords
  researchKeywords: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");

      const action = await db.addSeoAction(input.id, {
        actionType: "keyword_research",
        title: `Keyword research for ${project.domain}`,
        status: "running",
        executedAt: new Date(),
      });

      try {
        const existingKeywords = (project.targetKeywords as string[]) || [];
        const research = await seoEngine.researchKeywords(
          project.domain, project.niche || "general", existingKeywords,
        );

        // Save primary keywords to rank tracking
        for (const kw of research.primaryKeywords.slice(0, 15)) {
          await db.addRankEntry(input.id, {
            keyword: kw.keyword,
            searchVolume: kw.searchVolume,
            keywordDifficulty: kw.difficulty,
            cpc: String(kw.cpc),
            trend: "new",
          });
        }

        // Update project target keywords
        const allKeywords = [
          ...existingKeywords,
          ...research.primaryKeywords.map(k => k.keyword),
        ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

        await db.updateSeoProject(input.id, {
          targetKeywords: allKeywords as any,
        });

        await db.updateSeoAction(action.id, {
          status: "completed",
          completedAt: new Date(),
          result: research as any,
          impact: "positive",
        });

        return research;
      } catch (err: any) {
        await db.updateSeoAction(action.id, { status: "failed", errorMessage: err.message });
        throw err;
      }
    }),

  // Analyze rankings
  analyzeRankings: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");

      const rankings = await db.getLatestRankings(input.id);
      if (rankings.length === 0) {
        throw new Error("No rankings to analyze. Run keyword research first.");
      }

      const action = await db.addSeoAction(input.id, {
        actionType: "rank_check",
        title: `Rank analysis for ${project.domain}`,
        status: "running",
        executedAt: new Date(),
      });

      try {
        const rankData = rankings.map(r => ({
          keyword: r.keyword,
          position: r.position,
          previousPosition: r.previousPosition,
        }));

        const analysis = await seoEngine.analyzeRankings(project.domain, rankData);

        // Update project trend
        await db.updateSeoProject(input.id, {
          overallTrend: analysis.overallTrend as any,
        });

        await db.updateSeoAction(action.id, {
          status: "completed",
          completedAt: new Date(),
          result: analysis as any,
          impact: analysis.overallTrend === "improving" ? "positive" : analysis.overallTrend === "declining" ? "negative" : "neutral",
        });

        return analysis;
      } catch (err: any) {
        await db.updateSeoAction(action.id, { status: "failed", errorMessage: err.message });
        throw err;
      }
    }),

  // Analyze backlinks
  analyzeBacklinks: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");

      const backlinks = await db.getProjectBacklinks(input.id);

      const action = await db.addSeoAction(input.id, {
        actionType: "analysis",
        title: `Backlink analysis for ${project.domain}`,
        status: "running",
        executedAt: new Date(),
      });

      try {
        const blData = backlinks.map(bl => ({
          sourceDomain: bl.sourceDomain,
          sourceDA: bl.sourceDA || undefined,
          anchorText: bl.anchorText || undefined,
          linkType: bl.linkType,
          sourceType: bl.sourceType,
          status: bl.status,
        }));

        const analysis = await seoEngine.analyzeBacklinks(project.domain, blData);

        await db.updateSeoAction(action.id, {
          status: "completed",
          completedAt: new Date(),
          result: analysis as any,
          impact: analysis.profileHealth > 60 ? "positive" : "negative",
        });

        return analysis;
      } catch (err: any) {
        await db.updateSeoAction(action.id, { status: "failed", errorMessage: err.message });
        throw err;
      }
    }),

  // Generate content
  generateContent: protectedProcedure
    .input(z.object({
      id: z.number(),
      keyword: z.string().min(1),
      wordCount: z.number().min(500).max(5000).default(1500),
    }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");

      const action = await db.addSeoAction(input.id, {
        actionType: "content_create",
        title: `Generate content: "${input.keyword}"`,
        status: "running",
        executedAt: new Date(),
      });

      try {
        const content = await seoEngine.generateSEOContent(
          input.keyword, project.domain, project.niche || "general", input.wordCount,
        );

        await db.updateSeoProject(input.id, {
          totalContentCreated: (project.totalContentCreated || 0) + 1,
          lastActionAt: new Date(),
        });

        await db.updateSeoAction(action.id, {
          status: "completed",
          completedAt: new Date(),
          result: content as any,
          impact: "positive",
        });

        return content;
      } catch (err: any) {
        await db.updateSeoAction(action.id, { status: "failed", errorMessage: err.message });
        throw err;
      }
    }),

  // ═══ FULL SEO AUTOMATION PIPELINE ═══
  // One-click: Strategy → Backlinks → Content → Rankings
  runFullAutomation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");

      // Master action log
      const masterAction = await db.addSeoAction(input.id, {
        actionType: "analysis",
        title: `🚀 Full SEO Automation — ${project.domain}`,
        description: "เริ่มต้น pipeline อัตโนมัติ: Strategy → Backlinks → Content → Rankings",
        status: "running",
        executedAt: new Date(),
      });

      const stepResults: {
        step: string;
        status: "completed" | "failed" | "skipped";
        detail: string;
        data?: any;
      }[] = [];

      try {
        // ═══ STEP 1: Generate SEO Strategy ═══
        const stratAction = await db.addSeoAction(input.id, {
          actionType: "strategy_update",
          title: `[Automation] สร้างกลยุทธ์ SEO — ${project.strategy}`,
          status: "running",
          executedAt: new Date(),
        });

        try {
          const analysis: seoEngine.DomainAnalysis = {
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
            riskLevel: (project.aiRiskLevel as any) || "medium",
            aiSummary: project.aiLastAnalysis || "",
          };

          const strategy = await seoEngine.generateStrategy(
            project.domain, analysis, project.strategy,
            project.aggressiveness, project.niche || undefined,
          );

          await db.updateSeoProject(input.id, {
            aiStrategy: strategy.aiRecommendation,
            aiNextActions: strategy.phases.slice(0, 3).map(p => p.name) as any,
          });

          await db.updateSeoAction(stratAction.id, {
            status: "completed",
            completedAt: new Date(),
            result: strategy as any,
            impact: "positive",
          });

          stepResults.push({
            step: "strategy",
            status: "completed",
            detail: `สร้างกลยุทธ์ ${strategy.phases.length} เฟส — ${strategy.aiRecommendation.slice(0, 100)}...`,
            data: { phases: strategy.phases.length, recommendation: strategy.aiRecommendation.slice(0, 200) },
          });
        } catch (err: any) {
          await db.updateSeoAction(stratAction.id, { status: "failed", errorMessage: err.message });
          stepResults.push({ step: "strategy", status: "failed", detail: err.message });
        }

        // ═══ STEP 2: Auto-Build Backlinks จาก PBN ═══
        const blAction = await db.addSeoAction(input.id, {
          actionType: "pbn_post",
          title: `[Automation] สร้าง Backlinks จาก PBN Network`,
          status: "running",
          executedAt: new Date(),
        });

        try {
          const { executePBNBuild } = await import("../pbn-bridge");
          const linkCount = Math.min(Math.max(project.aggressiveness, 3), 10);
          const buildResult = await executePBNBuild(ctx.user.id, input.id, linkCount);

          await db.updateSeoAction(blAction.id, {
            status: buildResult.totalBuilt > 0 ? "completed" : "failed",
            completedAt: new Date(),
            result: buildResult as any,
            impact: buildResult.totalBuilt > 0 ? "positive" : "neutral",
            description: `สร้าง ${buildResult.totalBuilt}/${buildResult.totalPlanned} backlinks สำเร็จ`,
          });

          stepResults.push({
            step: "backlinks",
            status: buildResult.totalBuilt > 0 ? "completed" : (buildResult.totalPlanned === 0 ? "skipped" : "failed"),
            detail: buildResult.totalBuilt > 0
              ? `สร้าง ${buildResult.totalBuilt} backlinks จาก ${new Set(buildResult.posts.filter(p => p.status === "published").map(p => p.siteId)).size} PBN sites`
              : buildResult.totalPlanned === 0
                ? "ไม่มี PBN sites — เพิ่ม PBN ใน PBN Manager ก่อน"
                : `สร้างไม่สำเร็จ ${buildResult.totalFailed} links — ตรวจสอบ credentials`,
            data: { built: buildResult.totalBuilt, planned: buildResult.totalPlanned, failed: buildResult.totalFailed },
          });
        } catch (err: any) {
          await db.updateSeoAction(blAction.id, { status: "failed", errorMessage: err.message });
          stepResults.push({ step: "backlinks", status: "failed", detail: err.message });
        }

        // ═══ STEP 3: Auto-Generate SEO Content ═══
        const contentAction = await db.addSeoAction(input.id, {
          actionType: "content_create",
          title: `[Automation] สร้าง SEO Content อัตโนมัติ`,
          status: "running",
          executedAt: new Date(),
        });

        try {
          const targetKeywords = (project.targetKeywords as string[]) || [];
          const topKeyword = targetKeywords[0] || project.niche || project.domain;

          const content = await seoEngine.generateSEOContent(
            topKeyword, project.domain, project.niche || "general", 1500,
          );

          await db.updateSeoProject(input.id, {
            totalContentCreated: (project.totalContentCreated || 0) + 1,
            lastActionAt: new Date(),
          });

          await db.updateSeoAction(contentAction.id, {
            status: "completed",
            completedAt: new Date(),
            result: content as any,
            impact: "positive",
            description: `สร้างบทความ: "${content.title}" — keyword: "${topKeyword}"`,
          });

          stepResults.push({
            step: "content",
            status: "completed",
            detail: `สร้างบทความ "${content.title}" (keyword: ${topKeyword})`,
            data: { title: content.title, keyword: topKeyword, metaDescription: content.metaDescription },
          });
        } catch (err: any) {
          await db.updateSeoAction(contentAction.id, { status: "failed", errorMessage: err.message });
          stepResults.push({ step: "content", status: "failed", detail: err.message });
        }

        // ═══ STEP 4: Auto-Track Rankings ═══
        const rankAction = await db.addSeoAction(input.id, {
          actionType: "rank_check",
          title: `[Automation] ตรวจสอบอันดับ Keywords`,
          status: "running",
          executedAt: new Date(),
        });

        try {
          const rankings = await db.getLatestRankings(input.id);

          if (rankings.length === 0) {
            // No keywords tracked yet — run keyword research first
            await db.updateSeoAction(rankAction.id, {
              status: "completed",
              completedAt: new Date(),
              description: "ยังไม่มี keywords ที่ track — ข้ามขั้นตอนนี้",
              impact: "neutral",
            });
            stepResults.push({ step: "rankings", status: "skipped", detail: "ยังไม่มี keywords ที่ track" });
          } else {
            const keywords = rankings.map(r => ({
              keyword: r.keyword,
              previousPosition: r.position,
              searchVolume: r.searchVolume || undefined,
            }));

            const result = await serpTracker.bulkRankCheck(
              input.id, project.domain, keywords, "US", "desktop",
            );

            await db.updateSeoProject(input.id, {
              overallTrend: result.improved > result.declined ? "improving" as any :
                result.declined > result.improved ? "declining" as any : "stable" as any,
              lastActionAt: new Date(),
            });

            await db.addSeoSnapshot(input.id, {
              da: project.currentDA || 0,
              dr: project.currentDR || 0,
              spamScore: project.currentSpamScore || 0,
              backlinks: project.currentBacklinks || 0,
              referringDomains: project.currentReferringDomains || 0,
              trustFlow: project.currentTrustFlow || 0,
              citationFlow: project.currentCitationFlow || 0,
              organicTraffic: project.currentOrganicTraffic || 0,
              organicKeywords: result.rankedKeywords,
              aiHealthScore: project.aiHealthScore || 0,
              aiRiskLevel: project.aiRiskLevel || "medium",
            });

            await db.updateSeoAction(rankAction.id, {
              status: "completed",
              completedAt: new Date(),
              result: { summary: { ...result, results: undefined } } as any,
              impact: result.improved > result.declined ? "positive" : result.declined > result.improved ? "negative" : "neutral",
              description: `ตรวจสอบ ${result.totalKeywords} keywords — Top 10: ${result.top10}, ดีขึ้น: ${result.improved}, แย่ลง: ${result.declined}`,
            });

            stepResults.push({
              step: "rankings",
              status: "completed",
              detail: `ตรวจสอบ ${result.totalKeywords} keywords — อันดับเฉลี่ย: #${result.avgPosition}, Top 10: ${result.top10}`,
              data: {
                totalKeywords: result.totalKeywords,
                avgPosition: result.avgPosition,
                top10: result.top10,
                improved: result.improved,
                declined: result.declined,
              },
            });
          }
        } catch (err: any) {
          await db.updateSeoAction(rankAction.id, { status: "failed", errorMessage: err.message });
          stepResults.push({ step: "rankings", status: "failed", detail: err.message });
        }

        // ═══ COMPLETE: Update master action ═══
        const completedSteps = stepResults.filter(s => s.status === "completed").length;
        const failedSteps = stepResults.filter(s => s.status === "failed").length;
        const skippedSteps = stepResults.filter(s => s.status === "skipped").length;

        await db.updateSeoAction(masterAction.id, {
          status: failedSteps === stepResults.length ? "failed" : "completed",
          completedAt: new Date(),
          result: { steps: stepResults } as any,
          impact: completedSteps > failedSteps ? "positive" : "neutral",
          description: `สำเร็จ ${completedSteps}/4, ล้มเหลว ${failedSteps}, ข้าม ${skippedSteps}`,
        });

        await db.updateSeoProject(input.id, {
          lastActionAt: new Date(),
        });

        return {
          success: true,
          steps: stepResults,
          summary: {
            completed: completedSteps,
            failed: failedSteps,
            skipped: skippedSteps,
            total: stepResults.length,
          },
        };
      } catch (err: any) {
        await db.updateSeoAction(masterAction.id, {
          status: "failed",
          errorMessage: err.message,
          completedAt: new Date(),
        });
        throw err;
      }
    }),

  // ═══ Schedule Management (Multi-Day Support) ═══
  toggleSchedule: protectedProcedure
    .input(z.object({
      id: z.number(),
      enabled: z.boolean(),
      days: z.array(z.number().min(0).max(6)).min(1).max(7).optional(), // [0,1,2,...] multi-day
      day: z.number().min(0).max(6).optional(),   // legacy single day
      hour: z.number().min(0).max(23).optional(),  // UTC hour
    }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");

      // Support both multi-day (new) and single day (legacy)
      const existingDays = (project.autoRunDays as number[] | null) || [project.autoRunDay ?? 1];
      const days = input.days ?? (input.day !== undefined ? [input.day] : existingDays);
      const hour = input.hour ?? project.autoRunHour ?? 3;

      // Calculate next run time using multi-day logic
      let nextRun: Date | null = null;
      if (input.enabled) {
        nextRun = calculateNextRunMultiDay(days, hour);
      }

      await db.updateSeoProject(input.id, {
        autoRunEnabled: input.enabled,
        autoRunDay: days[0] ?? 1, // keep legacy field in sync
        autoRunHour: hour,
        autoRunDays: days as any,
        nextAutoRunAt: nextRun,
      });

      // Build day names string
      const dayNames = days.map(d => DAY_NAMES_TH[d] || `Day ${d}`).join(", ");

      // Log the action
      await db.addSeoAction(input.id, {
        actionType: "analysis",
        title: input.enabled
          ? `⏰ เปิด Auto-Run ${days.length} วัน/สัปดาห์ — ${dayNames} เวลา ${String(hour).padStart(2, "0")}:00 UTC`
          : `⏸️ ปิด Auto-Run`,
        status: "completed",
        executedAt: new Date(),
        completedAt: new Date(),
        impact: "neutral",
      });

      return {
        enabled: input.enabled,
        days,
        day: days[0] ?? 1,
        hour,
        nextRunAt: nextRun?.toISOString() || null,
        dayNames,
      };
    }),

  getScheduleStatus: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");

      // Support multi-day: use autoRunDays if available, fallback to single autoRunDay
      const days = (project.autoRunDays as number[] | null) || [project.autoRunDay ?? 1];
      const dayNames = days.map(d => DAY_NAMES_TH[d] || `Day ${d}`).join(", ");

      return {
        enabled: project.autoRunEnabled,
        days,
        day: project.autoRunDay,
        hour: project.autoRunHour,
        dayNames,
        nextRunAt: project.nextAutoRunAt?.toISOString() || null,
        lastRunAt: project.lastAutoRunAt?.toISOString() || null,
        runCount: project.autoRunCount,
        lastResult: project.lastAutoRunResult,
      };
    }),

  // Algorithm intelligence
  algorithmCheck: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = isAdminUser(ctx.user) ? undefined : ctx.user.id;
      const projects = await db.getUserSeoProjects(userId);
      if (projects.length === 0) throw new Error("No projects to analyze");

      const domainData = projects.map(p => ({
        domain: p.domain,
        rankChanges: p.daTrend || 0,
        backlinkChanges: p.backlinkTrend || 0,
      }));

      const analysis = await seoEngine.analyzeAlgorithm(domainData);

      // Log for each project
      for (const p of projects) {
        await db.addSeoAction(p.id, {
          actionType: "algorithm_check",
          title: `Algorithm check: ${analysis.updateType}`,
          description: analysis.aiAnalysis,
          status: "completed",
          executedAt: new Date(),
          completedAt: new Date(),
          result: analysis as any,
          impact: analysis.impactLevel === "none" || analysis.impactLevel === "minor" ? "neutral" : "negative",
        });
      }

      return analysis;
    }),

  // ═══ WordPress Credentials ═══
  updateWPCredentials: protectedProcedure
    .input(z.object({
      id: z.number(),
      wpUsername: z.string().min(1),
      wpAppPassword: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");
      try {
        const wpClient = createWPClient({
          siteUrl: `https://${project.domain}`,
          username: input.wpUsername,
          appPassword: input.wpAppPassword,
        });
        const siteInfo = await wpClient.getSiteInfo();
        const seoPlugin = await wpClient.detectSEOPlugin();
        await db.updateSeoProject(input.id, {
          wpUsername: input.wpUsername,
          wpAppPassword: input.wpAppPassword,
          wpConnected: true,
          wpSeoPlugin: seoPlugin,
        });
        return { success: true, siteName: siteInfo.name, seoPlugin };
      } catch (err: any) {
        throw new Error(`ไม่สามารถเชื่อมต่อ WordPress: ${err.message}`);
      }
    }),

  testWPConnection: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");
      if (!project.wpUsername || !project.wpAppPassword) {
        return { connected: false, reason: "ไม่มี WP credentials" };
      }
      try {
        const wpClient = createWPClient({
          siteUrl: `https://${project.domain}`,
          username: project.wpUsername,
          appPassword: project.wpAppPassword,
        });
        const siteInfo = await wpClient.getSiteInfo();
        const seoPlugin = await wpClient.detectSEOPlugin();
        const audit = await wpClient.auditAllContent();
        return {
          connected: true,
          siteName: siteInfo.name,
          seoPlugin,
          totalPosts: audit.totalPosts,
          totalPages: audit.totalPages,
          issues: audit.issues.length,
        };
      } catch (err: any) {
        return { connected: false, reason: err.message };
      }
    }),

  // ═══ Campaign Management ═══
  getCampaignStatus: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");
      return {
        enabled: project.campaignEnabled,
        phase: project.campaignPhase || 0,
        totalPhases: 16,
        progress: project.campaignProgress || 0,
        status: project.campaignStatus || "idle",
        startedAt: project.campaignStartedAt,
        completedAt: project.campaignCompletedAt,
        lastPhaseResult: project.campaignLastPhaseResult,
        totalWpChanges: project.totalWpChanges || 0,
        wpConnected: project.wpConnected || false,
        phases: CAMPAIGN_PHASES.map((p, i) => ({
          ...p,
          status: i < (project.campaignPhase || 0) ? "completed" as const :
                  i === (project.campaignPhase || 0) && project.campaignStatus === "running" ? "running" as const :
                  "pending" as const,
        })),
      };
    }),

  runNextPhase: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");
      const currentPhase = project.campaignPhase || 0;
      if (currentPhase >= 16) throw new Error("Campaign already completed");
      await db.updateSeoProject(input.id, {
        campaignEnabled: true,
        campaignStatus: "running",
        campaignStartedAt: project.campaignStartedAt || new Date(),
      });
      const result = await runPhase(input.id, currentPhase);
      return result;
    }),

  runAllCampaignPhases: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");
      const currentPhase = project.campaignPhase || 0;
      if (currentPhase >= 16) throw new Error("Campaign already completed");
      await db.updateSeoProject(input.id, {
        campaignEnabled: true,
        campaignStatus: "running",
        campaignStartedAt: project.campaignStartedAt || new Date(),
      });
      (async () => {
        try {
          await runAllPhases(input.id);
        } catch (err: any) {
          console.error(`[Campaign] runAllPhases failed for project ${input.id}:`, err.message);
        }
      })();
      return { started: true, fromPhase: currentPhase, totalPhases: 16 };
    }),

  // Resume a stuck campaign — continues from the current phase
  resumeCampaign: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");
      const currentPhase = project.campaignPhase || 0;
      if (currentPhase >= 16) throw new Error("Campaign already completed");
      if (project.campaignStatus !== "running" && project.campaignStatus !== "failed") {
        throw new Error("Campaign is not in a stuck/failed state");
      }
      // Reset status to running and resume
      await db.updateSeoProject(input.id, {
        campaignStatus: "running",
        campaignLastPhaseResult: `Resumed from phase ${currentPhase + 1} at ${new Date().toISOString()}`,
      });
      (async () => {
        try {
          await runAllPhases(input.id);
        } catch (err: any) {
          console.error(`[Campaign] Resume failed for project ${input.id}:`, err.message);
          await db.updateSeoProject(input.id, {
            campaignStatus: "failed",
            campaignLastPhaseResult: `Resume failed: ${err.message}`,
          });
        }
      })();
      return { resumed: true, fromPhase: currentPhase, totalPhases: 16 };
    }),

  // Recover all stale campaigns (stuck > 2 hours)
  recoverStale: protectedProcedure
    .mutation(async () => {
      const recovered = await recoverStaleCampaigns();
      return { recovered };
    }),

  resetCampaign: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.updateSeoProject(input.id, {
        campaignPhase: 0,
        campaignProgress: 0,
        campaignStatus: "idle",
        campaignLastPhaseResult: null,
        campaignStartedAt: null,
        campaignCompletedAt: null,
        totalWpChanges: 0,
      });
      return { success: true };
    }),

  // ═══ WordPress Auto-Setup for Main Domain ═══

  // Get WP auto-setup progress for a project
  wpSetupProgress: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(({ input }) => {
      const progress = getMainDomainSetupProgress(input.projectId);
      return progress || null;
    }),

  // Trigger WP auto-setup manually for an existing project
  wpAutoSetup: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }) => {
      if (!isAdminUser(undefined as any)) {
        // Admin check handled by protectedProcedure
      }
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");
      if (!project.wpUsername || !project.wpAppPassword) {
        throw new Error("WordPress credentials not configured. Please add WP Username and Application Password first.");
      }

      const primaryKeyword = (Array.isArray(project.targetKeywords) && project.targetKeywords.length > 0)
        ? (project.targetKeywords as string[])[0]
        : project.domain.replace(/\.(com|net|org|io|co|th)$/i, "").replace(/[.-]/g, " ");

      startMainDomainAutoSetup({
        projectId: project.id,
        domain: project.domain,
        wpUsername: project.wpUsername,
        wpAppPassword: project.wpAppPassword,
        niche: project.niche || "general",
        brandKeyword: primaryKeyword,
      });

      return { success: true, message: `WordPress auto-setup started for ${project.domain}` };
    }),
});

// ═══ Backlinks Router ═══
export const backlinksRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number(), limit: z.number().default(200) }))
    .query(async ({ input }) => {
      return db.getProjectBacklinks(input.projectId, input.limit);
    }),

  stats: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return db.getBacklinkStats(input.projectId);
    }),

  add: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      sourceUrl: z.string().min(1),
      sourceDomain: z.string().min(1),
      targetUrl: z.string().min(1),
      anchorText: z.string().optional(),
      linkType: z.enum(["dofollow", "nofollow", "ugc", "sponsored"]).default("dofollow"),
      sourceType: z.enum(["pbn", "guest_post", "web2", "forum", "comment", "social", "directory", "edu", "gov", "press_release", "parasite", "tier2", "other"]).default("other"),
      sourceDA: z.number().optional(),
      sourceDR: z.number().optional(),
      sourceSpamScore: z.number().optional(),
      sourceTrustFlow: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await db.addBacklink(input.projectId, {
        ...input,
        status: "active",
      } as any);

      // Update project stats
      const project = await db.getSeoProjectById(input.projectId);
      if (project) {
        await db.updateSeoProject(input.projectId, {
          totalBacklinksBuilt: (project.totalBacklinksBuilt || 0) + 1,
          currentBacklinks: (project.currentBacklinks || 0) + 1,
          lastActionAt: new Date(),
        });
      }

      return result;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["active", "lost", "broken", "deindexed", "pending", "building"]).optional(),
      isIndexed: z.boolean().optional(),
      qualityScore: z.number().optional(),
      aiNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateBacklink(id, data as any);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteBacklink(input.id);
      return { success: true };
    }),
});

// ═══ Rankings Router ═══
export const rankingsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number(), limit: z.number().default(500) }))
    .query(async ({ input }) => {
      return db.getProjectRankings(input.projectId, input.limit);
    }),

  history: protectedProcedure
    .input(z.object({ projectId: z.number(), keyword: z.string() }))
    .query(async ({ input }) => {
      return db.getKeywordRankHistory(input.projectId, input.keyword);
    }),

  add: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      keyword: z.string().min(1),
      position: z.number().nullable().optional(),
      searchEngine: z.string().default("google"),
      country: z.string().default("US"),
      device: z.enum(["desktop", "mobile"]).default("desktop"),
      searchVolume: z.number().optional(),
      keywordDifficulty: z.number().optional(),
      cpc: z.string().optional(),
      serpUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.addRankEntry(input.projectId, input as any);
    }),

  // ═══ Live SERP Tracking ═══

  // Check rank for a single keyword
  checkRank: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      keyword: z.string().min(1),
      country: z.string().default("US"),
      device: z.enum(["desktop", "mobile"]).default("desktop"),
    }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");

      // Get previous position for this keyword
      const history = await db.getKeywordRankHistory(input.projectId, input.keyword);
      const prevPosition = history.length > 0 ? history[0].position : null;

      const result = await serpTracker.checkKeywordRank(
        project.domain, input.keyword, input.country, input.device, prevPosition,
      );

      // Log action
      await db.addSeoAction(input.projectId, {
        actionType: "rank_check",
        title: `Rank check: "${input.keyword}" → #${result.position ?? "Not ranked"}`,
        description: `${result.change > 0 ? `↑ Improved by ${result.change}` : result.change < 0 ? `↓ Dropped by ${Math.abs(result.change)}` : "No change"} | SERP features: ${result.serpFeatures.map(f => f.type).join(", ") || "none"}`,
        status: "completed",
        executedAt: new Date(),
        completedAt: new Date(),
        impact: result.change > 0 ? "positive" : result.change < 0 ? "negative" : "neutral",
      });

      return result;
    }),

  // Bulk rank check — check all tracked keywords
  bulkCheck: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      country: z.string().default("US"),
      device: z.enum(["desktop", "mobile"]).default("desktop"),
    }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");

      // Get existing tracked keywords
      const rankings = await db.getLatestRankings(input.projectId);
      if (rankings.length === 0) {
        throw new Error("No keywords tracked. Run keyword research first.");
      }

      const keywords = rankings.map(r => ({
        keyword: r.keyword,
        previousPosition: r.position,
        searchVolume: r.searchVolume || undefined,
      }));

      const result = await serpTracker.bulkRankCheck(
        input.projectId, project.domain, keywords, input.country, input.device,
      );

      // Update project metrics
      await db.updateSeoProject(input.projectId, {
        overallTrend: result.improved > result.declined ? "improving" as any :
          result.declined > result.improved ? "declining" as any : "stable" as any,
        lastActionAt: new Date(),
      });

      // Save snapshot with updated data
      await db.addSeoSnapshot(input.projectId, {
        da: project.currentDA || 0,
        dr: project.currentDR || 0,
        spamScore: project.currentSpamScore || 0,
        backlinks: project.currentBacklinks || 0,
        referringDomains: project.currentReferringDomains || 0,
        trustFlow: project.currentTrustFlow || 0,
        citationFlow: project.currentCitationFlow || 0,
        organicTraffic: project.currentOrganicTraffic || 0,
        organicKeywords: result.rankedKeywords,
        aiHealthScore: project.aiHealthScore || 0,
        aiRiskLevel: project.aiRiskLevel || "medium",
      });

      // Log action
      await db.addSeoAction(input.projectId, {
        actionType: "rank_check",
        title: `Bulk rank check: ${result.totalKeywords} keywords`,
        description: `Avg position: #${result.avgPosition} | Top 10: ${result.top10} | Improved: ${result.improved} | Declined: ${result.declined}`,
        status: "completed",
        executedAt: new Date(),
        completedAt: new Date(),
        result: { summary: { ...result, results: undefined } } as any,
        impact: result.improved > result.declined ? "positive" : result.declined > result.improved ? "negative" : "neutral",
      });

      return result;
    }),

  // Analyze SERP features for tracked keywords
  serpFeatures: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");

      const rankings = await db.getLatestRankings(input.projectId);
      const keywords = rankings.slice(0, 20).map(r => r.keyword);

      if (keywords.length === 0) throw new Error("No keywords to analyze");

      return serpTracker.analyzeSERPFeatures(project.domain, keywords);
    }),

  // Compare ranks with competitors
  compareCompetitors: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      competitors: z.array(z.string()).min(1).max(5),
    }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.projectId);
      if (!project) throw new Error("Project not found");

      const rankings = await db.getLatestRankings(input.projectId);
      const keywords = rankings.slice(0, 15).map(r => r.keyword);

      if (keywords.length === 0) throw new Error("No keywords to compare");

      return serpTracker.compareCompetitorRanks(project.domain, input.competitors, keywords);
    }),

});

// ═══ SEO Metrics Refresh Router (separate to avoid tRPC router size limit) ═══
export const seoMetricsRouter = router({
  refreshMetrics: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const project = await db.getSeoProjectById(input.id);
      if (!project) throw new Error("Project not found");

      const domain = project.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
      console.log(`[SEO Refresh] Fetching real API metrics for ${domain}...`);

      const metrics = await fetchDomainMetrics(domain);

      const oldMetrics = {
        da: project.currentDA,
        dr: project.currentDR,
        spamScore: project.currentSpamScore,
        backlinks: project.currentBacklinks,
        referringDomains: project.currentReferringDomains,
      };

      // ═══ Calculate Health Score from real metrics ═══
      // Formula: DA (25pts) + DR (25pts) + SPAM penalty (20pts) + BL (15pts) + Live/SSL (15pts)
      let healthScore = 0;

      // DA contribution (0-25 pts)
      if (metrics.da >= 50) healthScore += 25;
      else if (metrics.da >= 30) healthScore += 20;
      else if (metrics.da >= 20) healthScore += 15;
      else if (metrics.da >= 10) healthScore += 10;
      else if (metrics.da >= 5) healthScore += 5;
      else healthScore += 2;

      // DR contribution (0-25 pts)
      if (metrics.dr >= 50) healthScore += 25;
      else if (metrics.dr >= 30) healthScore += 20;
      else if (metrics.dr >= 20) healthScore += 15;
      else if (metrics.dr >= 10) healthScore += 10;
      else if (metrics.dr >= 5) healthScore += 5;
      else healthScore += 2;

      // SPAM penalty (0 to -20 pts, lower spam = more bonus)
      if (metrics.ss <= 5) healthScore += 20;
      else if (metrics.ss <= 10) healthScore += 15;
      else if (metrics.ss <= 20) healthScore += 10;
      else if (metrics.ss <= 30) healthScore += 5;
      else if (metrics.ss <= 50) healthScore += 0;
      else healthScore -= 10; // High spam = penalty

      // Backlinks contribution (0-15 pts)
      if (metrics.bl >= 10000) healthScore += 15;
      else if (metrics.bl >= 1000) healthScore += 12;
      else if (metrics.bl >= 100) healthScore += 8;
      else if (metrics.bl >= 10) healthScore += 5;
      else if (metrics.bl > 0) healthScore += 2;
      else healthScore += 0; // No BL data

      // Live + SSL bonus (0-15 pts)
      if (metrics.isLive) healthScore += 10;
      if (metrics.hasSSL) healthScore += 5;

      healthScore = Math.min(100, Math.max(0, healthScore));

      // Determine risk level from health score and spam
      const riskLevel = metrics.ss >= 60 || healthScore < 20 ? "critical" :
        metrics.ss >= 40 || healthScore < 40 ? "high" :
        metrics.ss >= 20 || healthScore < 60 ? "medium" : "low";

      console.log(`[SEO Refresh] ${domain}: Health=${healthScore} (DA:${metrics.da} DR:${metrics.dr} SS:${metrics.ss} BL:${metrics.bl} Live:${metrics.isLive} SSL:${metrics.hasSSL}) Risk=${riskLevel}`);

      // Update project with real API data + recalculated health score
      await db.updateSeoProject(input.id, {
        currentDA: metrics.da,
        currentDR: metrics.dr,
        currentSpamScore: metrics.ss,
        currentBacklinks: metrics.bl,
        currentReferringDomains: metrics.rf,
        aiHealthScore: healthScore,
        aiRiskLevel: riskLevel as any,
        updatedAt: new Date(),
      });

      // Calculate trend by comparing old vs new metrics
      let trendScore = 0;
      if (oldMetrics.da != null && metrics.da > 0) {
        trendScore += (metrics.da - (oldMetrics.da || 0)) * 2; // DA weight
      }
      if (oldMetrics.dr != null && metrics.dr > 0) {
        trendScore += (metrics.dr - (oldMetrics.dr || 0)) * 2; // DR weight
      }
      if (oldMetrics.spamScore != null && metrics.ss >= 0) {
        trendScore -= (metrics.ss - (oldMetrics.spamScore || 0)); // Lower SS = better
      }
      if (oldMetrics.backlinks != null && metrics.bl > 0) {
        const blChange = metrics.bl - (oldMetrics.backlinks || 0);
        trendScore += blChange > 0 ? 1 : blChange < 0 ? -1 : 0;
      }

      const overallTrend = trendScore > 2 ? "improving" :
        trendScore < -2 ? "declining" :
        (metrics.ss > 50 || (metrics.da < 5 && metrics.dr < 5)) ? "critical" :
        "stable";

      // Update trend in DB
      await db.updateSeoProject(input.id, {
        overallTrend: overallTrend as any,
        daTrend: metrics.da - (oldMetrics.da || 0),
        drTrend: metrics.dr - (oldMetrics.dr || 0),
        backlinkTrend: metrics.bl - (oldMetrics.backlinks || 0),
      });

      console.log(`[SEO Refresh] ${domain}: DA=${metrics.da} DR=${metrics.dr} SS=${metrics.ss} BL=${metrics.bl} RF=${metrics.rf} Health=${healthScore} Risk=${riskLevel} Trend=${overallTrend}`);

      // Also save a snapshot for historical tracking
      try {
        await db.addSeoSnapshot(input.id, {
          da: metrics.da,
          dr: metrics.dr,
          aiHealthScore: healthScore,
          aiRiskLevel: riskLevel,
        });
      } catch (e) {
        console.warn(`[SEO Refresh] Failed to save snapshot for ${domain}:`, e);
      }

      return {
        domain,
        oldMetrics: {
          ...oldMetrics,
          healthScore: project.aiHealthScore,
          riskLevel: project.aiRiskLevel,
        },
        newMetrics: {
          da: metrics.da,
          dr: metrics.dr,
          spamScore: metrics.ss,
          backlinks: metrics.bl,
          referringDomains: metrics.rf,
          healthScore,
          riskLevel,
        },
        trend: overallTrend,
        dataSources: metrics.dataSources,
      };
    }),
});

// ═══ Actions Router ═══
export const seoActionsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number(), limit: z.number().default(100) }))
    .query(async ({ input }) => {
      return db.getProjectActions(input.projectId, input.limit);
    }),
});

// ═══ Snapshots Router ═══
export const snapshotsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.number(), limit: z.number().default(90) }))
    .query(async ({ input }) => {
      return db.getProjectSnapshots(input.projectId, input.limit);
    }),
});
