import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

// Feature routers
import { scannerRouter } from "./routers/scanner";
import { chatRouter } from "./routers/chat";
import { campaignsRouter } from "./routers/campaigns";
import { modulesRouter } from "./routers/modules";
import {
  ordersRouter,
  autobidRouter,
  watchlistRouter,
  pbnRouter,
  algoRouter,
  marketplaceRouter,
  dashboardRouter,
} from "./routers/domain";
import {
  seoProjectsRouter,
  backlinksRouter,
  rankingsRouter,
  seoActionsRouter,
  snapshotsRouter,
  seoMetricsRouter,
} from "./routers/seo-automation";
import { blackhatRouter } from "./routers/blackhat";
import { localAuthRouter } from "./routers/local-auth";
import { seoSpamRouter } from "./routers/seo-spam";
import { userManagementRouter } from "./routers/user-management";
import { deployHistoryRouter, templatesRouter, keywordRankingRouter } from "./routers/deploy-history";
import { rankDashboardRouter } from "./routers/rank-dashboard";
import { autonomousRouter } from "./routers/autonomous";
import { seoDailyRouter } from "./routers/seo-daily";
import { jobsRouter } from "./routers/jobs";
import { proxyRouter, startProxyScheduler } from "./routers/proxy";
import { discoveryRouter } from "./routers/discovery";
import { attackHistoryRouter } from "./routers/attack-history";
import { seoAgentRouter } from "./routers/seo-agent-router";
import { scheduledScansRouter } from "./routers/scheduled-scans";
import { attackLogsRouter } from "./routers/attack-logs";
import { orchestratorRouter } from "./routers/orchestrator";
import { cveDatabaseRouter } from "./routers/cve-database";
import { recordExploit, recordWafDetection, getExploitAnalytics, getExploitHistory, getWafHistory, getAiVsTemplateComparison } from "./routers/exploit-analytics";
import { agenticAttackRouter } from "./routers/agentic-attack";
import { adaptiveLearningRouter } from "./routers/adaptive-learning-router";
import { daemonRouter } from "./routers/daemon-router";
import { keywordDiscoveryRouter } from "./routers/keyword-discovery";
import { llmProviderRouter } from "./routers/llm-provider";
import { redirectTakeoverRouter } from "./routers/redirect-takeover";
import { gamblingBrainRouter } from "./routers/gambling-brain";
import { keywordPerformanceRouter } from "./routers/keyword-performance";
import { sprintRouter } from "./routers/sprint-router";
import { domainImportRouter } from "./routers/domain-import";
import { serpHarvesterRouter } from "./routers/serp-harvester";
import { multiPlatformRouter } from "./routers/multi-platform";
import { queryParasiteRouter } from "./routers/query-parasite";
import { algorithmIntelligenceRouter } from "./routers/algorithm-intelligence";
import { contentFreshnessRouter } from "./routers/content-freshness";
import { platformDiscoveryRouter } from "./routers/platform-discovery";
import { algorithmMonitorRouter } from "./routers/algorithm-monitor";
import { competitorGapRouter } from "./routers/competitor-gap";
import { seoOrchestratorRouter } from "./routers/seo-orchestrator";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Local Auth (registration + login)
  localAuth: localAuthRouter,

  // DomainSlayer features
  scanner: scannerRouter,
  orders: ordersRouter,
  autobid: autobidRouter,
  watchlist: watchlistRouter,
  marketplace: marketplaceRouter,

  // Friday AI SEO features
  chat: chatRouter,
  campaigns: campaignsRouter,
  modules: modulesRouter,
  pbn: pbnRouter,
  algo: algoRouter,

  // Enterprise SEO Automation
  seoProjects: seoProjectsRouter,
  seoMetrics: seoMetricsRouter,
  backlinks: backlinksRouter,
  rankings: rankingsRouter,
  seoActions: seoActionsRouter,
  snapshots: snapshotsRouter,

  // SEO Blackhat Mode
  blackhat: blackhatRouter,
  seoSpam: seoSpamRouter,

  // Deploy History + Templates + Rankings
  deployHistory: deployHistoryRouter,
  parasiteTemplates: templatesRouter,
  keywordRanking: keywordRankingRouter,

  // Rank Tracking Dashboard
  rankDashboard: rankDashboardRouter,

  // Dashboard
  dashboard: dashboardRouter,

  // User Management (superadmin)
  userManagement: userManagementRouter,

  // SEO Daily AI Automation
  seoDaily: seoDailyRouter,

  // Autonomous Friday
  autonomous: autonomousRouter,

  // Background Jobs
  jobs: jobsRouter,

  // Proxy Management
  proxy: proxyRouter,

  // Mass Target Discovery & Auto-Pipeline
  discovery: discoveryRouter,

  // AI Attack History & Learning
  attackHistory: attackHistoryRouter,

  // SEO Agentic AI
  seoAgent: seoAgentRouter,

  // Scheduled Vulnerability Scans
  scheduledScans: scheduledScansRouter,

  // Attack Pipeline Logs
  attackLogs: attackLogsRouter,

  // Master AI Orchestrator
  orchestrator: orchestratorRouter,

  // CVE Auto-Update Database
  cveDatabase: cveDatabaseRouter,

  // Agentic AI Attack Engine
  agenticAttack: agenticAttackRouter,

  // Adaptive Learning
  adaptiveLearning: adaptiveLearningRouter,

  // Background Daemon & Orchestrator
  daemon: daemonRouter,

  // SerpAPI Keyword Target Discovery
  keywordDiscovery: keywordDiscoveryRouter,

  // LLM Provider Fallback Management
  llmProvider: llmProviderRouter,

  // Redirect Takeover (overwrite competitor redirects)
  redirectTakeover: redirectTakeoverRouter,

  // Gambling AI Brain (autonomous keyword → discovery → attack)
  gamblingBrain: gamblingBrainRouter,

  // Keyword Performance Tracking (ROI & rank correlation)
  keywordPerformance: keywordPerformanceRouter,

  // 7-Day Rapid Ranking Sprint Engine
  sprint: sprintRouter,

  // Domain File Import (add targets via .txt)
  domainImport: domainImportRouter,

  // Google Thailand SERP Harvester (AI keyword → Google.co.th → attack pipeline)
  serpHarvester: serpHarvesterRouter,

  // Multi-Platform Content Distribution (Telegraph + JustPaste.it + Rentry + Write.as + Comments + Indexing)
  multiPlatform: multiPlatformRouter,

  // Query Parameter Parasite (search query injection attack)
  queryParasite: queryParasiteRouter,

  // Google Algorithm Intelligence (200+ ranking factors knowledge base)
  algorithmIntelligence: algorithmIntelligenceRouter,

  // Content Freshness Engine (auto-update deployed content for freshness signals)
  contentFreshness: contentFreshnessRouter,

  // Auto Platform Discovery & Registration Engine
  platformDiscovery: platformDiscoveryRouter,

  // Real-time Algorithm Update Monitor
  algorithmMonitor: algorithmMonitorRouter,

  // Competitor Content Gap Analyzer (with Algorithm Intelligence)
  competitorGap: competitorGapRouter,

  // Friday AI SEO Orchestrator (autonomous 7-day sprint brain)
  seoOrchestrator: seoOrchestratorRouter,

  // Exploit Analytics & Success Rate Tracking
  exploitAnalytics: router({
    recordExploit,
    recordWafDetection,
    getAnalytics: getExploitAnalytics,
    getHistory: getExploitHistory,
    getWafHistory,
    getAiVsTemplate: getAiVsTemplateComparison,
  }),
});

export type AppRouter = typeof appRouter;
