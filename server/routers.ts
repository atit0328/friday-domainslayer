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
});

export type AppRouter = typeof appRouter;
