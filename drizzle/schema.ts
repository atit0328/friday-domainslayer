import {
  int, mysqlEnum, mysqlTable, text, timestamp, varchar,
  boolean, decimal, json, bigint
} from "drizzle-orm/mysql-core";

// ═══════════════════════════════════════════════
// Core Users (Manus OAuth)
// ═══════════════════════════════════════════════
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "superadmin"]).default("user").notNull(),
  plan: varchar("plan", { length: 32 }).default("FREE").notNull(),
  company: text("company"),
  passwordHash: varchar("passwordHash", { length: 255 }),  // For local auth
  phone: varchar("phone", { length: 32 }),                 // Optional phone
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ═══════════════════════════════════════════════
// DomainSlayer: Domain Scans
// ═══════════════════════════════════════════════
export const domainScans = mysqlTable("domain_scans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  domain: varchar("domain", { length: 255 }).notNull(),
  useCase: varchar("useCase", { length: 64 }).default("hold_flip").notNull(),
  status: mysqlEnum("status", ["pending", "scanning", "completed", "failed"]).default("pending").notNull(),
  trustScore: int("trustScore"),
  grade: varchar("grade", { length: 2 }),
  verdict: varchar("verdict", { length: 32 }),
  riskLevel: varchar("riskLevel", { length: 16 }),
  explanations: json("explanations"),
  metrics: json("metrics"),
  rawSignals: json("rawSignals"),
  // Real SEO metrics
  da: int("da"),                    // Domain Authority 0-100 (Moz)
  pa: int("pa"),                    // Page Authority 0-100 (Moz)
  dr: int("dr"),                    // Domain Rating 0-100 (Ahrefs)
  ss: int("ss"),                    // Spam Score 0-100
  bl: int("bl"),                    // Total Backlinks
  rf: int("rf"),                    // Referring Domains
  tf: int("tf"),                    // Trust Flow 0-100
  cf: int("cf"),                    // Citation Flow 0-100
  indexedPages: int("indexedPages"), // Estimated indexed pages
  waybackSnapshots: int("waybackSnapshots"),
  waybackFirstCapture: varchar("waybackFirstCapture", { length: 32 }),
  waybackLastCapture: varchar("waybackLastCapture", { length: 32 }),
  domainAge: varchar("domainAge", { length: 128 }),
  isLive: boolean("isLive"),
  hasSSL: boolean("hasSSL"),
  loadTimeMs: int("loadTimeMs"),
  healthScore: int("healthScore"),
  globalRank: int("globalRank"),
  totalVisits: int("totalVisits"),
  bounceRate: varchar("bounceRate", { length: 16 }),
  aiAnalysis: text("aiAnalysis"),  // kept for backward compat, now stores data source info
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DomainScan = typeof domainScans.$inferSelect;

// ═══════════════════════════════════════════════
// DomainSlayer: Marketplace Searches
// ═══════════════════════════════════════════════
export const marketplaceSearches = mysqlTable("marketplace_searches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  keyword: varchar("keyword", { length: 255 }),
  tld: varchar("tld", { length: 32 }),
  minPrice: decimal("minPrice", { precision: 12, scale: 2 }),
  maxPrice: decimal("maxPrice", { precision: 12, scale: 2 }),
  providers: json("providers"),
  results: json("results"),
  resultCount: int("resultCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════
// DomainSlayer: Orders
// ═══════════════════════════════════════════════
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  domain: varchar("domain", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  action: mysqlEnum("orderAction", ["buy_now", "bid", "make_offer"]).default("buy_now").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).default("USD").notNull(),
  status: mysqlEnum("orderStatus", ["pending", "submitted", "accepted", "failed", "cancelled"]).default("pending").notNull(),
  providerRef: text("providerRef"),
  errorMessage: text("errorMessage"),
  autobidRuleId: int("autobidRuleId"),
  trustScore: int("trustScore"),
  grade: varchar("grade", { length: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;

// ═══════════════════════════════════════════════
// DomainSlayer: Auto-Bid Rules (with SEO criteria)
// ═══════════════════════════════════════════════
export const autobidRules = mysqlTable("autobid_rules", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).default("My Auto-Bid Rule").notNull(),
  status: mysqlEnum("autobidStatus", ["active", "paused", "completed", "exhausted"]).default("active").notNull(),
  keyword: varchar("keyword", { length: 255 }).default("").notNull(),
  tld: varchar("tld", { length: 32 }).default("").notNull(),
  providers: json("providers"),
  maxBidPerDomain: decimal("maxBidPerDomain", { precision: 12, scale: 2 }).default("100").notNull(),
  totalBudget: decimal("totalBudget", { precision: 12, scale: 2 }).default("1000").notNull(),
  spent: decimal("spent", { precision: 12, scale: 2 }).default("0").notNull(),
  // SEO Criteria — AI uses these to evaluate domains
  minDA: int("minDA").default(0).notNull(),          // Domain Authority (Moz) 0-100
  minDR: int("minDR").default(0).notNull(),          // Domain Rating (Ahrefs) 0-100
  maxSpamScore: int("maxSpamScore").default(30).notNull(), // Moz Spam Score 0-100 (lower=better)
  minBacklinks: int("minBacklinks").default(0).notNull(),  // Minimum backlink count
  minReferringDomains: int("minReferringDomains").default(0).notNull(),
  minTrustFlow: int("minTrustFlow").default(0).notNull(),  // Majestic Trust Flow 0-100
  minCitationFlow: int("minCitationFlow").default(0).notNull(), // Majestic Citation Flow 0-100
  maxDomainAge: int("maxDomainAge"),                  // Max age in years (null=no limit)
  minDomainAge: int("minDomainAge"),                  // Min age in years (null=no limit)
  preferredTLDs: json("preferredTLDs"),               // Array of preferred TLDs
  excludePatterns: json("excludePatterns"),           // Array of patterns to exclude
  // Link type filters
  requireWikiLink: boolean("requireWikiLink").default(false).notNull(), // Require Wikipedia backlinks
  linkTypeFilters: json("linkTypeFilters"),            // Array of link types to check: ["wiki", "edu", "gov", "news", "social", "forum"]
  checkRedirect: boolean("checkRedirect").default(false).notNull(),    // Check if domain redirects
  rejectRedirects: boolean("rejectRedirects").default(true).notNull(), // Reject domains that redirect
  // Legacy fields
  minTrustScore: int("minTrustScore").default(50).notNull(),
  minGrade: varchar("minGrade", { length: 2 }).default("C").notNull(),
  maxRisk: varchar("maxRisk", { length: 8 }).default("MED").notNull(),
  requiredVerdict: varchar("requiredVerdict", { length: 32 }).default("CONDITIONAL_BUY").notNull(),
  useCase: varchar("useCase", { length: 64 }).default("hold_flip").notNull(),
  bidStrategy: varchar("bidStrategy", { length: 32 }).default("conservative").notNull(),
  // Auto-purchase settings
  autoPurchase: boolean("autoPurchase").default(false).notNull(), // Actually buy or just recommend
  requireApproval: boolean("requireApproval").default(true).notNull(), // Require user approval before purchase
  // Stats
  domainsScanned: int("domainsScanned").default(0).notNull(),
  domainsBid: int("domainsBid").default(0).notNull(),
  domainsWon: int("domainsWon").default(0).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AutobidRule = typeof autobidRules.$inferSelect;

// ═══════════════════════════════════════════════
// DomainSlayer: Bid History (each domain evaluated/bid)
// ═══════════════════════════════════════════════
export const bidHistory = mysqlTable("bid_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ruleId: int("ruleId").notNull(),
  domain: varchar("domain", { length: 255 }).notNull(),
  action: mysqlEnum("bidAction", ["analyzed", "recommended", "approved", "purchased", "rejected", "failed"]).default("analyzed").notNull(),
  // Price info
  askPrice: decimal("askPrice", { precision: 12, scale: 2 }),
  bidAmount: decimal("bidAmount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 8 }).default("USD").notNull(),
  // AI SEO Analysis Results
  seoScore: int("seoScore"),              // Overall AI-computed SEO score 0-100
  estimatedDA: int("estimatedDA"),         // AI-estimated DA
  estimatedDR: int("estimatedDR"),         // AI-estimated DR
  estimatedSpamScore: int("estimatedSpamScore"),
  estimatedBacklinks: int("estimatedBacklinks"),
  estimatedReferringDomains: int("estimatedReferringDomains"),
  estimatedTrustFlow: int("estimatedTrustFlow"),
  estimatedCitationFlow: int("estimatedCitationFlow"),
  estimatedAge: varchar("estimatedAge", { length: 32 }),
  // AI Recommendation
  aiVerdict: mysqlEnum("aiVerdict", ["STRONG_BUY", "BUY", "CONDITIONAL_BUY", "HOLD", "PASS"]).default("HOLD").notNull(),
  aiConfidence: int("aiConfidence"),       // 0-100
  aiReasoning: text("aiReasoning"),        // Detailed AI explanation
  seoAnalysis: json("seoAnalysis"),        // Full analysis JSON
  // Purchase result
  purchaseOrderId: varchar("purchaseOrderId", { length: 64 }),
  purchaseStatus: varchar("purchaseStatus", { length: 32 }),
  errorMessage: text("errorMessage"),
  // GoDaddy data
  available: boolean("available"),
  provider: varchar("provider", { length: 64 }).default("godaddy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BidHistory = typeof bidHistory.$inferSelect;

// ═══════════════════════════════════════════════
// DomainSlayer: Watchlist
// ═══════════════════════════════════════════════
export const watchlist = mysqlTable("watchlist", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  domain: varchar("domain", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 64 }).default("").notNull(),
  listingType: varchar("listingType", { length: 32 }).default("fixed").notNull(),
  initialPrice: decimal("initialPrice", { precision: 12, scale: 2 }),
  currentPrice: decimal("currentPrice", { precision: 12, scale: 2 }),
  targetPrice: decimal("targetPrice", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 8 }).default("USD").notNull(),
  auctionEnd: timestamp("auctionEnd"),
  alertBeforeEndMinutes: int("alertBeforeEndMinutes").default(30).notNull(),
  status: mysqlEnum("watchlistStatus", ["watching", "alerted", "bought", "expired", "removed"]).default("watching").notNull(),
  trustScore: int("trustScore"),
  grade: varchar("grade", { length: 2 }),
  verdict: text("verdict"),
  providerUrl: text("providerUrl"),
  notes: text("notes"),
  priceAlertSent: boolean("priceAlertSent").default(false).notNull(),
  timeAlertSent: boolean("timeAlertSent").default(false).notNull(),
  lastCheckedAt: timestamp("lastCheckedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WatchlistItem = typeof watchlist.$inferSelect;

export const watchlistAlerts = mysqlTable("watchlist_alerts", {
  id: int("id").autoincrement().primaryKey(),
  watchlistId: int("watchlistId").notNull(),
  alertType: varchar("alertType", { length: 64 }).notNull(),
  message: text("message").notNull(),
  oldPrice: decimal("oldPrice", { precision: 12, scale: 2 }),
  newPrice: decimal("newPrice", { precision: 12, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════
// Friday AI: Chat Messages
// ═══════════════════════════════════════════════
export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  content: text("content").notNull(),
  provider: varchar("provider", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;

// ═══════════════════════════════════════════════
// Friday AI: SEO Campaigns
// ═══════════════════════════════════════════════
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  domain: varchar("domain", { length: 255 }).notNull(),
  niche: varchar("niche", { length: 255 }).notNull(),
  keywords: text("keywords"),
  brandName: varchar("brandName", { length: 255 }),
  targetGeo: varchar("targetGeo", { length: 64 }).default("global").notNull(),
  language: varchar("language", { length: 8 }).default("en").notNull(),
  aggressiveness: int("aggressiveness").default(7).notNull(),
  aiStrategy: varchar("aiStrategy", { length: 32 }).default("multi").notNull(),
  targetPosition: int("targetPosition").default(1).notNull(),
  status: mysqlEnum("campaignStatus", ["PENDING", "RUNNING", "PAUSED", "COMPLETED", "FAILED"]).default("PENDING").notNull(),
  currentPhase: int("currentPhase").default(0).notNull(),
  totalPhases: int("totalPhases").default(16).notNull(),
  progress: int("progress").default(0).notNull(),
  config: json("config"),
  algoScores: json("algoScores"),
  rankingData: json("rankingData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;

export const campaignLogs = mysqlTable("campaign_logs", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  phase: int("phase").notNull(),
  phaseName: varchar("phaseName", { length: 255 }).notNull(),
  status: varchar("status", { length: 32 }).default("started").notNull(),
  data: json("data"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ═══════════════════════════════════════════════
// Friday AI: PBN Sites
// ═══════════════════════════════════════════════
export const pbnSites = mysqlTable("pbn_sites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  username: varchar("username", { length: 255 }).notNull(),
  appPassword: text("appPassword").notNull(),
  status: mysqlEnum("pbnStatus", ["active", "inactive", "error", "down"]).default("active").notNull(),
  lastCheckedAt: timestamp("lastCheckedAt"),
  da: int("da"),
  dr: int("dr"),
  pa: int("pa"),
  spamScore: int("spamScore"),
  domainAge: varchar("domainAge", { length: 128 }),
  expireDate: varchar("expireDate", { length: 32 }),
  theme: varchar("theme", { length: 255 }),
  hostingProvider: varchar("hostingProvider", { length: 255 }),
  hostingName: varchar("hostingName", { length: 255 }),
  cpanelUrl: varchar("cpanelUrl", { length: 255 }),
  cpanelUser: varchar("cpanelUser", { length: 255 }),
  cpanelPass: text("cpanelPass"),
  domainRegistrar: varchar("domainRegistrar", { length: 255 }),
  registrarEmail: varchar("registrarEmail", { length: 255 }),
  registrarPass: text("registrarPass"),
  hostingEmail: varchar("hostingEmail", { length: 255 }),
  hostingPass: text("hostingPass"),
  wpAutomationKey: text("wpAutomationKey"),
  isBlog: boolean("isBlog").default(false).notNull(),
  parentSiteId: int("parentSiteId"),
  banned: text("banned"),
  notes: text("notes"),
  lastPost: timestamp("lastPost"),
  postCount: int("postCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PBNSite = typeof pbnSites.$inferSelect;

export const pbnPosts = mysqlTable("pbn_posts", {
  id: int("id").autoincrement().primaryKey(),
  siteId: int("siteId").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  targetUrl: text("targetUrl").notNull(),
  anchorText: varchar("anchorText", { length: 255 }).notNull(),
  keyword: varchar("keyword", { length: 255 }),
  wpPostId: int("wpPostId"),
  wpPostUrl: text("wpPostUrl"),
  status: mysqlEnum("pbnPostStatus", ["pending", "published", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PBNPost = typeof pbnPosts.$inferSelect;

// ═══════════════════════════════════════════════
// Friday AI: Algorithm Intelligence
// ═══════════════════════════════════════════════
export const algoIntel = mysqlTable("algo_intel", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  signals: json("signals").notNull(),
  analysis: text("analysis"),
  source: varchar("source", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AlgoIntel = typeof algoIntel.$inferSelect;

// ═══════════════════════════════════════════════
// Friday AI: Module Executions
// ═══════════════════════════════════════════════
export const moduleExecutions = mysqlTable("module_executions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  moduleName: varchar("moduleName", { length: 64 }).notNull(),
  domain: varchar("domain", { length: 255 }),
  niche: varchar("niche", { length: 255 }),
  keywords: text("keywords"),
  result: text("result"),
  provider: varchar("provider", { length: 32 }),
  status: mysqlEnum("moduleStatus", ["running", "completed", "failed"]).default("running").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModuleExecution = typeof moduleExecutions.$inferSelect;

// ═══════════════════════════════════════════════
// Enterprise SEO Automation: Projects
// ═══════════════════════════════════════════════
export const seoProjects = mysqlTable("seo_projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  domain: varchar("domain", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  niche: varchar("niche", { length: 255 }),
  targetKeywords: json("targetKeywords"),           // Array of target keywords
  strategy: mysqlEnum("seoStrategy", [
    "grey_hat", "black_hat", "aggressive_grey", "pbn_focused", "tiered_links", "parasite_seo"
  ]).default("grey_hat").notNull(),
  status: mysqlEnum("seoProjectStatus", [
    "setup", "analyzing", "active", "paused", "completed", "penalized"
  ]).default("setup").notNull(),
  // Current SEO metrics (latest snapshot)
  currentDA: int("currentDA"),
  currentDR: int("currentDR"),
  currentSpamScore: int("currentSpamScore"),
  currentBacklinks: int("currentBacklinks"),
  currentReferringDomains: int("currentReferringDomains"),
  currentTrustFlow: int("currentTrustFlow"),
  currentCitationFlow: int("currentCitationFlow"),
  currentOrganicTraffic: int("currentOrganicTraffic"),
  currentOrganicKeywords: int("currentOrganicKeywords"),
  // Trend indicators (-100 to +100, positive = improving)
  daTrend: int("daTrend").default(0),
  drTrend: int("drTrend").default(0),
  backlinkTrend: int("backlinkTrend").default(0),
  trafficTrend: int("trafficTrend").default(0),
  overallTrend: mysqlEnum("overallTrend", ["improving", "stable", "declining", "critical"]).default("stable"),
  // AI Analysis
  aiHealthScore: int("aiHealthScore"),              // 0-100 overall health
  aiRiskLevel: mysqlEnum("aiRiskLevel", ["low", "medium", "high", "critical"]).default("medium"),
  aiStrategy: text("aiStrategy"),                   // Current AI strategy description
  aiLastAnalysis: text("aiLastAnalysis"),            // Latest AI analysis report
  aiNextActions: json("aiNextActions"),              // Planned next actions
  // WordPress Integration (Application Password)
  wpUsername: varchar("wpUsername", { length: 255 }),
  wpAppPassword: text("wpAppPassword"),
  wpConnected: boolean("wpConnected").default(false).notNull(),
  wpSeoPlugin: varchar("wpSeoPlugin", { length: 32 }),  // yoast, rankmath, aioseo, none
  // Campaign Phase Tracking (merged from Campaigns)
  campaignEnabled: boolean("campaignEnabled").default(false).notNull(),
  campaignPhase: int("campaignPhase").default(0).notNull(),       // 0-15 (16 phases)
  campaignTotalPhases: int("campaignTotalPhases").default(16).notNull(),
  campaignStatus: mysqlEnum("campaignRunStatus", ["idle", "running", "paused", "completed", "failed"]).default("idle").notNull(),
  campaignProgress: int("campaignProgress").default(0).notNull(), // 0-100
  campaignLastPhaseResult: json("campaignLastPhaseResult"),
  campaignStartedAt: timestamp("campaignStartedAt"),
  campaignCompletedAt: timestamp("campaignCompletedAt"),
  // Agentic AI — Target & Plan
  targetDays: int("targetDays").default(7).notNull(),           // User-selected: 3, 7, or 30 days
  aiEstimatedDays: int("aiEstimatedDays"),                      // AI-estimated days to rank based on keyword difficulty
  aiPlan: json("aiPlan"),                                       // Full AI strategy plan JSON (phases, timeline, actions)
  aiPlanCreatedAt: timestamp("aiPlanCreatedAt"),                // When the plan was created
  aiAgentStatus: mysqlEnum("aiAgentStatus", ["idle", "planning", "executing", "waiting", "completed", "failed"]).default("idle").notNull(),
  aiAgentLastAction: text("aiAgentLastAction"),                 // Last action taken by AI agent
  aiAgentNextAction: text("aiAgentNextAction"),                 // Next planned action
  aiAgentError: text("aiAgentError"),                           // Last error if failed
  // Automation settings
  autoBacklink: boolean("autoBacklink").default(true).notNull(),
  autoContent: boolean("autoContent").default(false).notNull(),
  autoPbn: boolean("autoPbn").default(false).notNull(),
  aggressiveness: int("aggressiveness").default(5).notNull(), // 1-10
  monthlyBudget: decimal("monthlyBudget", { precision: 12, scale: 2 }).default("0"),
  // Schedule — Weekly Auto-Run
  autoRunEnabled: boolean("autoRunEnabled").default(false).notNull(),
  autoRunDay: int("autoRunDay").default(1).notNull(),          // 0=Sun, 1=Mon, ..., 6=Sat (legacy single day)
  autoRunHour: int("autoRunHour").default(3).notNull(),         // 0-23 (UTC)
  autoRunDays: json("autoRunDays"),                              // Array of days [1,2,4,5] — new multi-day support
  lastAutoRunAt: timestamp("lastAutoRunAt"),
  nextAutoRunAt: timestamp("nextAutoRunAt"),
  autoRunCount: int("autoRunCount").default(0).notNull(),
  lastAutoRunResult: json("lastAutoRunResult"),                 // Summary of last auto-run
  // Stats
  totalWpChanges: int("totalWpChanges").default(0),
  totalBacklinksBuilt: int("totalBacklinksBuilt").default(0),
  totalContentCreated: int("totalContentCreated").default(0),
  totalActionsExecuted: int("totalActionsExecuted").default(0),
  lastAnalyzedAt: timestamp("lastAnalyzedAt"),
  lastActionAt: timestamp("lastActionAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SEOProject = typeof seoProjects.$inferSelect;

// ═══════════════════════════════════════════════
// Enterprise SEO: Backlink Log
// ═══════════════════════════════════════════════
export const backlinkLog = mysqlTable("backlink_log", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  // Source info
  sourceUrl: text("sourceUrl").notNull(),
  sourceDomain: varchar("sourceDomain", { length: 255 }).notNull(),
  sourceDA: int("sourceDA"),
  sourceDR: int("sourceDR"),
  sourceSpamScore: int("sourceSpamScore"),
  sourceTrustFlow: int("sourceTrustFlow"),
  // Target info
  targetUrl: text("targetUrl").notNull(),
  anchorText: varchar("anchorText", { length: 500 }),
  // Link attributes
  linkType: mysqlEnum("linkType", [
    "dofollow", "nofollow", "ugc", "sponsored"
  ]).default("dofollow").notNull(),
  sourceType: mysqlEnum("blSourceType", [
    "pbn", "guest_post", "web2", "forum", "comment", "social", "directory", "edu", "gov", "press_release", "parasite", "tier2", "other"
  ]).default("other").notNull(),
  status: mysqlEnum("blStatus", [
    "active", "lost", "broken", "deindexed", "pending", "building"
  ]).default("active").notNull(),
  // Quality metrics
  qualityScore: int("qualityScore"),                // AI-computed 0-100
  isIndexed: boolean("isIndexed").default(false),
  indexedAt: timestamp("indexedAt"),
  // Tracking
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastCheckedAt: timestamp("lastCheckedAt"),
  lostAt: timestamp("lostAt"),
  // AI analysis
  aiNotes: text("aiNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BacklinkLog = typeof backlinkLog.$inferSelect;

// ═══════════════════════════════════════════════
// Enterprise SEO: Rank Tracking
// ═══════════════════════════════════════════════
export const rankTracking = mysqlTable("rank_tracking", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  keyword: varchar("keyword", { length: 500 }).notNull(),
  searchEngine: varchar("searchEngine", { length: 32 }).default("google").notNull(),
  country: varchar("country", { length: 8 }).default("US").notNull(),
  device: mysqlEnum("device", ["desktop", "mobile"]).default("desktop").notNull(),
  // Position data
  position: int("position"),                        // Current rank (null = not ranked)
  previousPosition: int("previousPosition"),        // Previous rank
  bestPosition: int("bestPosition"),                // Best ever rank
  positionChange: int("positionChange"),            // +/- change
  // SERP data
  serpUrl: text("serpUrl"),                          // URL that ranks
  serpTitle: text("serpTitle"),
  serpSnippet: text("serpSnippet"),
  serpFeatures: json("serpFeatures"),                // Featured snippet, PAA, etc.
  // Search volume & difficulty
  searchVolume: int("searchVolume"),
  keywordDifficulty: int("keywordDifficulty"),
  cpc: decimal("cpc", { precision: 8, scale: 2 }),
  // Trend
  trend: mysqlEnum("rankTrend", ["rising", "stable", "falling", "new", "lost"]).default("new"),
  // AI analysis
  aiInsight: text("aiInsight"),
  trackedAt: timestamp("trackedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RankTracking = typeof rankTracking.$inferSelect;

// ═══════════════════════════════════════════════
// Enterprise SEO: Actions Log (every AI action)
// ═══════════════════════════════════════════════
export const seoActions = mysqlTable("seo_actions", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  actionType: mysqlEnum("seoActionType", [
    "analysis", "keyword_research", "onpage_audit", "backlink_build",
    "content_create", "pbn_post", "tier2_build", "social_signal",
    "index_request", "disavow", "strategy_update", "rank_check",
    "competitor_analysis", "algorithm_check", "risk_assessment",
    "wp_fix", "campaign_phase", "schema_markup", "internal_linking"
  ]).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: mysqlEnum("seoActionStatus", ["pending", "running", "completed", "failed", "skipped"]).default("pending").notNull(),
  result: json("result"),                           // Action result data
  impact: mysqlEnum("actionImpact", ["positive", "neutral", "negative", "unknown"]).default("unknown"),
  // Execution details
  executedAt: timestamp("executedAt"),
  completedAt: timestamp("completedAt"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SEOAction = typeof seoActions.$inferSelect;

// ═══════════════════════════════════════════════
// Enterprise SEO: Daily Snapshots (metrics over time)
// ═══════════════════════════════════════════════
export const seoSnapshots = mysqlTable("seo_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  // Metrics at this point in time
  da: int("da"),
  dr: int("dr"),
  spamScore: int("spamScore"),
  backlinks: int("backlinks"),
  referringDomains: int("referringDomains"),
  trustFlow: int("trustFlow"),
  citationFlow: int("citationFlow"),
  organicTraffic: int("organicTraffic"),
  organicKeywords: int("organicKeywords"),
  // Backlink breakdown
  dofollowLinks: int("dofollowLinks"),
  nofollowLinks: int("nofollowLinks"),
  pbnLinks: int("pbnLinks"),
  guestPostLinks: int("guestPostLinks"),
  web2Links: int("web2Links"),
  otherLinks: int("otherLinks"),
  // AI health score at this snapshot
  aiHealthScore: int("aiHealthScore"),
  aiRiskLevel: varchar("aiRiskLevel", { length: 16 }),
  // Snapshot date
  snapshotDate: timestamp("snapshotDate").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SEOSnapshot = typeof seoSnapshots.$inferSelect;

// ═══════════════════════════════════════════════
// SEO Parasite: Deploy History
// ═══════════════════════════════════════════════
export const deployHistory = mysqlTable("deploy_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  targetDomain: varchar("targetDomain", { length: 255 }).notNull(),
  targetUrl: text("targetUrl").notNull(),
  redirectUrl: text("redirectUrl").notNull(),
  // Deploy config
  geoRedirect: boolean("geoRedirect").default(false).notNull(),
  keywords: json("keywords"),                          // Array of SEO keywords used
  proxyCount: int("proxyCount").default(0).notNull(),
  maxRetries: int("maxRetries").default(5).notNull(),
  parasiteEnabled: boolean("parasiteEnabled").default(false).notNull(),
  parasiteContentLength: varchar("parasiteContentLength", { length: 16 }).default("medium"),
  parasiteRedirectDelay: int("parasiteRedirectDelay").default(5),
  // Results
  status: mysqlEnum("deployStatus", ["running", "success", "partial", "failed"]).default("running").notNull(),
  totalSteps: int("totalSteps").default(9).notNull(),
  completedSteps: int("completedSteps").default(0).notNull(),
  filesDeployed: int("filesDeployed").default(0).notNull(),
  filesAttempted: int("filesAttempted").default(0).notNull(),
  shellUploaded: boolean("shellUploaded").default(false).notNull(),
  shellVerified: boolean("shellVerified").default(false).notNull(),
  redirectActive: boolean("redirectActive").default(false).notNull(),
  directUploadUsed: boolean("directUploadUsed").default(false).notNull(),
  // Deployed URLs
  deployedUrls: json("deployedUrls"),                  // Array of { url, type, verified }
  verifiedRedirectUrls: json("verifiedRedirectUrls"),  // Array of URLs that actually redirect
  shellUrl: text("shellUrl"),
  // Parasite pages
  parasitePages: json("parasitePages"),                // Array of { url, title, wordCount, seoScore }
  parasitePagesCount: int("parasitePagesCount").default(0).notNull(),
  // Error breakdown
  errorBreakdown: json("errorBreakdown"),              // { waf: n, timeout: n, 403: n, ... }
  successCount: int("successCount").default(0).notNull(),
  failedCount: int("failedCount").default(0).notNull(),
  retryCount: int("retryCount").default(0).notNull(),
  // Timing
  duration: int("duration"),                           // Duration in milliseconds
  report: text("report"),                              // Full text report
  // Technique stats
  techniqueUsed: varchar("techniqueUsed", { length: 64 }),
  bypassMethod: varchar("bypassMethod", { length: 64 }),
  cms: varchar("cms", { length: 32 }),
  // AI Intelligence data
  aiAnalysis: json("aiAnalysis"),                      // Full AI strategy + analysis JSON
  preScreenScore: int("preScreenScore"),                // Pre-screening success probability 0-100
  preScreenRisk: varchar("preScreenRisk", { length: 16 }),  // low/medium/high/critical
  serverType: varchar("serverType", { length: 64 }),
  wafDetected: varchar("wafDetected", { length: 64 }),
  altMethodUsed: varchar("altMethodUsed", { length: 64 }),  // FTP/CMS/WebDAV/API if alt method succeeded
  stealthBrowserUsed: boolean("stealthBrowserUsed").default(false).notNull(),
  // Timestamps
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeployHistory = typeof deployHistory.$inferSelect;
export type InsertDeployHistory = typeof deployHistory.$inferInsert;

// ═══════════════════════════════════════════════
// SEO Parasite: Parasite Templates
// ═══════════════════════════════════════════════
export const parasiteTemplates = mysqlTable("parasite_templates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),                               // null = system template
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull(),     // news, review, article, faq, product, comparison
  category: mysqlEnum("templateCategory", [
    "news", "review", "article", "faq", "product", "comparison", "landing", "blog", "custom"
  ]).default("article").notNull(),
  description: text("description"),
  // Template content
  htmlTemplate: text("htmlTemplate").notNull(),        // HTML with {{placeholders}}
  cssStyles: text("cssStyles"),                        // Inline CSS
  // SEO settings
  defaultRedirectDelay: int("defaultRedirectDelay").default(5).notNull(),
  seoScore: int("seoScore"),                           // Template SEO quality score 0-100
  hasSchemaMarkup: boolean("hasSchemaMarkup").default(true).notNull(),
  hasFaq: boolean("hasFaq").default(false).notNull(),
  hasBreadcrumb: boolean("hasBreadcrumb").default(true).notNull(),
  hasOpenGraph: boolean("hasOpenGraph").default(true).notNull(),
  // Stats
  timesUsed: int("timesUsed").default(0).notNull(),
  avgRankAchieved: int("avgRankAchieved"),
  isSystem: boolean("isSystem").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ParasiteTemplate = typeof parasiteTemplates.$inferSelect;
export type InsertParasiteTemplate = typeof parasiteTemplates.$inferInsert;

// ═══════════════════════════════════════════════
// SEO Parasite: Keyword Rankings (per parasite page)
// ═══════════════════════════════════════════════
export const parasiteKeywordRankings = mysqlTable("parasite_keyword_rankings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  deployHistoryId: int("deployHistoryId"),
  // Target info
  keyword: varchar("keyword", { length: 500 }).notNull(),
  parasitePageUrl: text("parasitePageUrl").notNull(),
  targetDomain: varchar("targetDomain", { length: 255 }).notNull(),
  redirectUrl: text("redirectUrl"),
  // Ranking data
  searchEngine: varchar("searchEngine", { length: 32 }).default("google").notNull(),
  country: varchar("country", { length: 8 }).default("TH").notNull(),
  device: mysqlEnum("rankDevice", ["desktop", "mobile"]).default("desktop").notNull(),
  position: int("position"),                           // Current rank (null = not ranked)
  previousPosition: int("previousPosition"),
  bestPosition: int("bestPosition"),
  positionChange: int("positionChange"),               // +/- change since last check
  // SERP info
  serpTitle: text("serpTitle"),
  serpSnippet: text("serpSnippet"),
  serpUrl: text("serpUrl"),                             // Actual URL in SERP
  isIndexed: boolean("isIndexed").default(false).notNull(),
  indexedAt: timestamp("indexedAt"),
  // Search metrics
  searchVolume: int("searchVolume"),
  keywordDifficulty: int("keywordDifficulty"),
  cpc: decimal("cpc", { precision: 8, scale: 2 }),
  // Status
  status: mysqlEnum("keywordRankStatus", [
    "tracking", "indexed", "ranked", "top10", "top3", "lost", "deindexed"
  ]).default("tracking").notNull(),
  trend: mysqlEnum("keywordRankTrend", ["rising", "stable", "falling", "new", "lost"]).default("new"),
  // Check history
  checkCount: int("checkCount").default(0).notNull(),
  lastCheckedAt: timestamp("lastCheckedAt"),
  nextCheckAt: timestamp("nextCheckAt"),
  checkInterval: int("checkInterval").default(86400).notNull(), // seconds between checks (default 24h)
  // AI insights
  aiInsight: text("aiInsight"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ParasiteKeywordRanking = typeof parasiteKeywordRankings.$inferSelect;
export type InsertParasiteKeywordRanking = typeof parasiteKeywordRankings.$inferInsert;

// ═══════════════════════════════════════════════
// SEO Parasite: Ranking History (snapshots over time)
// ═══════════════════════════════════════════════
export const parasiteRankingHistory = mysqlTable("parasite_ranking_history", {
  id: int("id").autoincrement().primaryKey(),
  keywordRankingId: int("keywordRankingId").notNull(),
  position: int("position"),                           // Rank at this point (null = not found)
  isIndexed: boolean("isIndexed").default(false).notNull(),
  serpTitle: text("serpTitle"),
  serpUrl: text("serpUrl"),
  checkedAt: timestamp("checkedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ParasiteRankingHistory = typeof parasiteRankingHistory.$inferSelect;

// ═══════════════════════════════════════════════
// Blackhat Mode: User Method Priority Settings
// ═══════════════════════════════════════════════
export const userMethodPriority = mysqlTable("user_method_priority", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // Ordered list of enabled method IDs (JSON array of strings)
  // e.g. ["multipart","put_direct","gif_stego","php_poly","asp_shell"]
  enabledMethods: json("enabledMethods").notNull(),
  // Full ordered list including disabled methods for UI state
  // e.g. [{ id: "multipart", enabled: true }, { id: "put_direct", enabled: false }]
  fullConfig: json("fullConfig"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserMethodPriority = typeof userMethodPriority.$inferSelect;
export type InsertUserMethodPriority = typeof userMethodPriority.$inferInsert;

// ═══════════════════════════════════════════════
// Autonomous Friday: Deploy Records
// ═══════════════════════════════════════════════
export const autonomousDeploys = mysqlTable("autonomous_deploys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  batchId: int("batchId"),                                // null = single deploy
  // Target
  targetDomain: varchar("targetDomain", { length: 255 }).notNull(),
  redirectUrl: text("redirectUrl").notNull(),
  // Config
  mode: mysqlEnum("autoMode", ["attack", "fixated", "emergent"]).default("emergent").notNull(),
  goal: varchar("goal", { length: 32 }).default("full_deploy").notNull(),
  maxIterations: int("maxIterations").default(15).notNull(),
  seoKeywords: json("seoKeywords"),                       // string[]
  geoRedirect: boolean("autoGeoRedirect").default(true).notNull(),
  parasiteContentLength: varchar("autoParasiteLen", { length: 16 }).default("medium"),
  parasiteRedirectDelay: int("autoParasiteDelay").default(5),
  // AI Brain
  aiStrategyUsed: json("aiStrategyUsed"),                 // AI's chosen strategy JSON
  aiDecisions: json("aiDecisions"),                       // Array of AI decisions made
  aiAdaptations: int("aiAdaptations").default(0).notNull(), // How many times AI adapted
  // Results
  status: mysqlEnum("autoStatus", ["queued", "running", "success", "partial", "failed", "stopped"]).default("queued").notNull(),
  // World state at completion
  hostsFound: int("hostsFound").default(0).notNull(),
  portsFound: int("portsFound").default(0).notNull(),
  vulnsFound: int("vulnsFound").default(0).notNull(),
  credsFound: int("credsFound").default(0).notNull(),
  uploadPathsFound: int("uploadPathsFound").default(0).notNull(),
  shellUrlsFound: int("shellUrlsFound").default(0).notNull(),
  filesDeployed: int("autoFilesDeployed").default(0).notNull(),
  filesVerified: int("filesVerified").default(0).notNull(),
  // URLs
  shellUrls: json("autoShellUrls"),                       // string[]
  deployedUrls: json("autoDeployedUrls"),                 // string[]
  verifiedUrls: json("autoVerifiedUrls"),                 // string[]
  // Emergent metrics
  epochs: int("epochs").default(0).notNull(),
  waves: int("waves").default(0).notNull(),
  cycles: int("cycles").default(0).notNull(),
  escalationLevel: varchar("autoEscLevel", { length: 32 }),
  driftCount: int("driftCount").default(0).notNull(),
  hackCount: int("hackCount").default(0).notNull(),
  runawayScore: int("runawayScore").default(0).notNull(),
  boundaryLevel: int("boundaryLevel").default(100).notNull(),
  goalDrifted: boolean("goalDrifted").default(false).notNull(),
  originalGoal: varchar("originalGoal", { length: 32 }),
  finalGoal: varchar("finalGoal", { length: 32 }),
  // Events log (compressed)
  eventsLog: json("eventsLog"),                           // Array of key events (not all)
  fullReport: json("fullReport"),                         // Complete result object
  errorMessage: text("autoErrorMessage"),
  // Timing
  duration: int("autoDuration"),                          // milliseconds
  startedAt: timestamp("autoStartedAt").defaultNow().notNull(),
  completedAt: timestamp("autoCompletedAt"),
  createdAt: timestamp("autoCreatedAt").defaultNow().notNull(),
  updatedAt: timestamp("autoUpdatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AutonomousDeploy = typeof autonomousDeploys.$inferSelect;
export type InsertAutonomousDeploy = typeof autonomousDeploys.$inferInsert;

// ═══════════════════════════════════════════════
// Autonomous Friday: Batch Operations
// ═══════════════════════════════════════════════
export const autonomousBatches = mysqlTable("autonomous_batches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // Config
  name: varchar("batchName", { length: 255 }),
  targets: json("batchTargets").notNull(),                // Array of { domain, redirectUrl }
  mode: mysqlEnum("batchMode", ["attack", "fixated", "emergent"]).default("emergent").notNull(),
  seoKeywords: json("batchKeywords"),
  maxIterationsPerTarget: int("maxIterationsPerTarget").default(15).notNull(),
  // Progress
  totalTargets: int("totalTargets").default(0).notNull(),
  completedTargets: int("completedTargets").default(0).notNull(),
  successTargets: int("successTargets").default(0).notNull(),
  failedTargets: int("failedTargets").default(0).notNull(),
  currentTarget: varchar("currentTarget", { length: 255 }),
  currentDeployId: int("currentDeployId"),
  // Status
  status: mysqlEnum("batchStatus", ["queued", "running", "completed", "stopped", "failed"]).default("queued").notNull(),
  // Timing
  duration: int("batchDuration"),
  startedAt: timestamp("batchStartedAt"),
  completedAt: timestamp("batchCompletedAt"),
  createdAt: timestamp("batchCreatedAt").defaultNow().notNull(),
  updatedAt: timestamp("batchUpdatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AutonomousBatch = typeof autonomousBatches.$inferSelect;
export type InsertAutonomousBatch = typeof autonomousBatches.$inferInsert;

// ═══════════════════════════════════════════════
// Pipeline Events — Persistent event log for background jobs
// ═══════════════════════════════════════════════
export const pipelineEvents = mysqlTable("pipeline_events", {
  id: int("id").autoincrement().primaryKey(),
  deployId: int("deployId").notNull(),             // FK → autonomous_deploys.id
  phase: varchar("phase", { length: 64 }).notNull(),
  step: varchar("step", { length: 64 }).notNull(),
  detail: text("detail").notNull(),
  progress: int("progress").default(0).notNull(),   // 0-100
  data: json("data"),                                // Optional structured data
  createdAt: timestamp("eventCreatedAt").defaultNow().notNull(),
});

export type PipelineEventRow = typeof pipelineEvents.$inferSelect;
export type InsertPipelineEvent = typeof pipelineEvents.$inferInsert;

// ═══════════════════════════════════════════════
// AI Attack History — Training data for AI Commander
// เก็บทุก decision + result เพื่อให้ AI เรียนรู้ว่า method ไหนสำเร็จกับ target ประเภทไหน
// ═══════════════════════════════════════════════
export const aiAttackHistory = mysqlTable("ai_attack_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // Target info
  targetDomain: varchar("targetDomain", { length: 255 }).notNull(),
  targetIp: varchar("targetIp", { length: 64 }),
  serverType: varchar("serverType", { length: 128 }),       // Apache, Nginx, IIS, LiteSpeed, Caddy, Tomcat
  serverVersion: varchar("serverVersion", { length: 64 }),
  cms: varchar("cms", { length: 64 }),                       // WordPress, Joomla, Drupal, Magento, custom
  cmsVersion: varchar("cmsVersion", { length: 32 }),
  language: varchar("language", { length: 32 }),             // PHP, ASP.NET, JSP, Python, Node.js, Ruby, Go, static
  os: varchar("os", { length: 64 }),                         // Linux, Windows, FreeBSD
  waf: varchar("waf", { length: 64 }),                       // Cloudflare, ModSecurity, Sucuri, Wordfence
  wafStrength: varchar("wafStrength", { length: 16 }),       // none, weak, moderate, strong, enterprise
  hostingProvider: varchar("hostingProvider", { length: 128 }),
  controlPanel: varchar("controlPanel", { length: 64 }),     // cPanel, Plesk, DirectAdmin, CyberPanel
  sslEnabled: boolean("sslEnabled"),
  // Attack info
  redirectUrl: varchar("redirectUrl", { length: 512 }),
  method: varchar("method", { length: 128 }).notNull(),      // direct_upload_put, multipart_form, webdav, etc.
  filename: varchar("filename", { length: 255 }),
  uploadPath: varchar("uploadPath", { length: 512 }),
  contentType: varchar("contentType", { length: 128 }),
  httpMethod: varchar("httpMethod", { length: 16 }),         // PUT, POST, PATCH, MOVE, COPY
  bypassTechnique: varchar("bypassTechnique", { length: 255 }),
  payloadType: varchar("payloadType", { length: 64 }),       // php_redirect, html_meta, js_redirect, htaccess, web_config, jsp, aspx
  // Result
  success: boolean("success").default(false).notNull(),
  statusCode: int("statusCode"),
  errorMessage: text("errorMessage"),
  fileVerified: boolean("fileVerified").default(false),
  redirectVerified: boolean("redirectVerified").default(false),
  uploadedUrl: varchar("uploadedUrl", { length: 512 }),
  durationMs: int("durationMs"),
  // AI reasoning
  aiReasoning: text("aiReasoning"),
  aiConfidence: int("aiConfidence"),                          // 0-100
  iteration: int("iteration"),                                // which iteration in the loop
  // Pre-analysis data (from Phase 0)
  preAnalysisData: json("preAnalysisData"),                   // Full AI Target Analysis result
  // Metadata
  pipelineType: varchar("pipelineType", { length: 32 }),     // seo_spam, autonomous, manual
  sessionId: varchar("sessionId", { length: 64 }),           // group decisions from same attack session
  createdAt: timestamp("historyCreatedAt").defaultNow().notNull(),
});

export type AiAttackHistoryRow = typeof aiAttackHistory.$inferSelect;
export type InsertAiAttackHistory = typeof aiAttackHistory.$inferInsert;

// ═══════════════════════════════════════════════
// SEO Agentic AI: Task Queue
// Every action the AI agent takes is a task — keyword research, backlink build, content create, WP post, PBN post, etc.
// ═══════════════════════════════════════════════
export const seoAgentTasks = mysqlTable("seo_agent_tasks", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  // Task definition
  taskType: mysqlEnum("seoTaskType", [
    "domain_analysis",        // Initial domain scan + metrics
    "keyword_research",       // Find target keywords + volume + difficulty
    "keyword_gap_analysis",   // Compare vs competitors
    "onpage_audit",           // Title, meta, schema, internal links
    "content_plan",           // Plan articles/pages to create
    "content_create",         // AI writes SEO content
    "content_publish_wp",     // Publish content to WordPress
    "backlink_plan",          // Plan backlink strategy (tier1/tier2)
    "backlink_build_pbn",     // Build backlinks from PBN network
    "backlink_build_web2",    // Build web 2.0 backlinks
    "backlink_build_guest",   // Guest post outreach
    "backlink_build_social",  // Social signals
    "backlink_tier2",         // Build tier 2 links pointing to tier 1
    "index_request",          // Request Google indexing
    "rank_check",             // Check keyword rankings
    "competitor_spy",         // Analyze competitor strategies
    "wp_optimize",            // Optimize WordPress settings (SEO plugin, speed, schema)
    "wp_fix_issues",          // Fix on-page issues found in audit
    "schema_markup",          // Add/update structured data
    "internal_linking",       // Optimize internal link structure
    "strategy_review",        // AI reviews and adjusts strategy
    "risk_assessment",        // Check for penalty risks
    "report_generate",        // Generate progress report
    "wp_error_scan",          // Scan for WP errors (plugin conflicts, PHP errors, broken pages)
    "wp_error_fix",           // Auto-fix WP errors when user grants permission
  ]).notNull(),
  title: varchar("seoTaskTitle", { length: 500 }).notNull(),
  description: text("seoTaskDescription"),
  // Execution
  status: mysqlEnum("seoTaskStatus", ["queued", "running", "completed", "failed", "skipped"]).default("queued").notNull(),
  priority: int("seoTaskPriority").default(5).notNull(),        // 1=highest, 10=lowest
  // Dependencies — wait for these tasks to complete first
  dependsOn: json("dependsOn"),                                  // Array of task IDs
  // Result
  result: json("seoTaskResult"),                                 // Task-specific result data
  errorMessage: text("seoTaskError"),
  // AI reasoning
  aiReasoning: text("seoTaskAiReasoning"),                       // Why AI chose this task
  aiConfidence: int("seoTaskAiConfidence"),                       // 0-100
  // Timing
  scheduledFor: timestamp("scheduledFor"),                        // When to execute (null = ASAP)
  startedAt: timestamp("seoTaskStartedAt"),
  completedAt: timestamp("seoTaskCompletedAt"),
  durationMs: int("seoTaskDurationMs"),
  createdAt: timestamp("seoTaskCreatedAt").defaultNow().notNull(),
  updatedAt: timestamp("seoTaskUpdatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SEOAgentTask = typeof seoAgentTasks.$inferSelect;
export type InsertSEOAgentTask = typeof seoAgentTasks.$inferInsert;

// ═══════════════════════════════════════════════
// SEO Agentic AI: Content Library
// AI-generated content stored here before publishing to WordPress
// ═══════════════════════════════════════════════
export const seoContent = mysqlTable("seo_content", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("contentProjectId").notNull(),
  userId: int("contentUserId").notNull(),
  // Content
  title: varchar("contentTitle", { length: 500 }).notNull(),
  slug: varchar("contentSlug", { length: 500 }),
  content: text("contentBody").notNull(),                        // Full HTML content
  excerpt: text("contentExcerpt"),
  // SEO metadata
  targetKeyword: varchar("contentTargetKeyword", { length: 255 }),
  secondaryKeywords: json("contentSecondaryKeywords"),           // string[]
  metaTitle: varchar("contentMetaTitle", { length: 255 }),
  metaDescription: text("contentMetaDescription"),
  // Quality metrics
  wordCount: int("contentWordCount").default(0).notNull(),
  seoScore: int("contentSeoScore"),                              // 0-100
  readabilityScore: int("contentReadabilityScore"),              // 0-100
  // Publishing
  publishStatus: mysqlEnum("contentPublishStatus", ["draft", "ready", "published", "failed"]).default("draft").notNull(),
  wpPostId: int("wpPostId"),                                     // WordPress post ID after publishing
  wpUrl: text("wpUrl"),                                          // Published URL
  publishedAt: timestamp("contentPublishedAt"),
  // AI
  aiModel: varchar("contentAiModel", { length: 64 }),
  aiPrompt: text("contentAiPrompt"),                             // Prompt used to generate
  createdAt: timestamp("contentCreatedAt").defaultNow().notNull(),
  updatedAt: timestamp("contentUpdatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SEOContent = typeof seoContent.$inferSelect;
export type InsertSEOContent = typeof seoContent.$inferInsert;

// ═══════════════════════════════════════════════
// Scheduled Attack Scans — Auto Vulnerability Scanning
// Periodic scanning with Telegram alerts for new findings
// ═══════════════════════════════════════════════
export const scheduledScans = mysqlTable("scheduled_scans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("scanUserId").notNull(),
  // Target
  domain: varchar("scanDomain", { length: 255 }).notNull(),
  // Schedule
  frequency: mysqlEnum("scanFrequency", ["daily", "weekly", "biweekly", "monthly"]).default("weekly").notNull(),
  scheduleDays: json("scheduleDays"),                          // Array of day numbers (0=Sun, 1=Mon, ..., 6=Sat) for weekly
  scheduleHour: int("scheduleHour").default(3).notNull(),      // Hour of day to run (0-23, default 3 AM)
  // Attack config
  attackTypes: json("scanAttackTypes"),                        // Array of attack vector names to include, null = all
  enableComprehensive: boolean("enableComprehensive").default(true).notNull(),
  enableIndirect: boolean("enableIndirect").default(true).notNull(),
  enableShellless: boolean("enableShellless").default(true).notNull(),
  enableDns: boolean("enableDns").default(false).notNull(),
  // Notification
  telegramAlert: boolean("telegramAlert").default(true).notNull(),
  alertMinSeverity: mysqlEnum("alertMinSeverity", ["critical", "high", "medium", "low", "info"]).default("high").notNull(),
  // Status
  enabled: boolean("scanEnabled").default(true).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  lastRunStatus: mysqlEnum("lastRunStatus", ["success", "partial", "failed", "running"]),
  totalRuns: int("totalRuns").default(0).notNull(),
  // Auto-Remediation
  autoRemediationEnabled: boolean("autoRemediationEnabled").default(false).notNull(),
  autoRemediationCategories: json("autoRemediationCategories"),  // Array of FixCategory strings
  autoRemediationDryRun: boolean("autoRemediationDryRun").default(true).notNull(), // Dry run by default for safety
  lastRemediationAt: timestamp("lastRemediationAt"),
  totalRemediations: int("totalRemediations").default(0).notNull(),
  totalFixesApplied: int("totalFixesApplied").default(0).notNull(),
  // Metadata
  createdAt: timestamp("scanCreatedAt").defaultNow().notNull(),
  updatedAt: timestamp("scanUpdatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ScheduledScan = typeof scheduledScans.$inferSelect;
export type InsertScheduledScan = typeof scheduledScans.$inferInsert;

export const scanResults = mysqlTable("scan_results", {
  id: int("id").autoincrement().primaryKey(),
  scanId: int("scanId").notNull(),                             // FK to scheduled_scans
  userId: int("resultUserId").notNull(),
  domain: varchar("resultDomain", { length: 255 }).notNull(),
  // Results summary
  totalTests: int("totalTests").default(0).notNull(),
  totalFindings: int("totalFindings").default(0).notNull(),
  criticalCount: int("criticalCount").default(0).notNull(),
  highCount: int("highCount").default(0).notNull(),
  mediumCount: int("mediumCount").default(0).notNull(),
  lowCount: int("lowCount").default(0).notNull(),
  infoCount: int("infoCount").default(0).notNull(),
  exploitableCount: int("exploitableCount").default(0).notNull(),
  // Detailed findings
  findings: json("findings"),                                  // AttackVectorResult[]
  // Comparison with previous scan
  newFindings: int("newFindings").default(0).notNull(),        // Count of NEW vulns since last scan
  resolvedFindings: int("resolvedFindings").default(0).notNull(), // Count of RESOLVED vulns since last scan
  newFindingsDetail: json("newFindingsDetail"),                // AttackVectorResult[] — only new ones
  resolvedFindingsDetail: json("resolvedFindingsDetail"),      // AttackVectorResult[] — resolved ones
  // Execution
  durationMs: int("scanDurationMs"),
  status: mysqlEnum("resultStatus", ["completed", "partial", "failed"]).default("completed").notNull(),
  errorMessage: text("scanErrorMessage"),
  // Notification
  telegramSent: boolean("telegramSent").default(false),
  // Metadata
  createdAt: timestamp("resultCreatedAt").defaultNow().notNull(),
});

export type ScanResult = typeof scanResults.$inferSelect;
export type InsertScanResult = typeof scanResults.$inferInsert;


// ═══════════════════════════════════════════════
// Remediation History — Track applied fixes with revert capability
// ═══════════════════════════════════════════════
export const remediationHistory = mysqlTable("remediation_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  scanId: int("scanId"),                                         // linked scheduled_scan
  scanResultId: int("scanResultId"),                             // linked scan_result
  domain: varchar("remDomain", { length: 255 }).notNull(),
  // Fix details
  vector: varchar("remVector", { length: 128 }).notNull(),       // e.g. "Clickjacking"
  category: varchar("remCategory", { length: 64 }).notNull(),    // e.g. "clickjacking"
  severity: varchar("remSeverity", { length: 16 }).notNull(),    // critical/high/medium/low
  finding: text("remFinding"),                                   // Original vulnerability detail
  fixStrategy: varchar("fixStrategy", { length: 64 }).notNull(), // e.g. "wp_htaccess_header"
  action: varchar("fixAction", { length: 128 }).notNull(),       // e.g. "set_xfo_via_settings"
  detail: text("fixDetail"),                                     // What was done
  // Snapshot for revert
  revertible: boolean("revertible").default(false).notNull(),
  revertAction: text("revertAction"),                            // Instructions for revert
  beforeState: json("beforeState"),                              // State snapshot before fix
  afterState: json("afterState"),                                // State snapshot after fix
  // Status tracking
  status: mysqlEnum("remStatus", ["applied", "reverted", "revert_failed", "expired"]).default("applied").notNull(),
  revertedAt: timestamp("revertedAt"),
  revertDetail: text("revertDetail"),                            // What happened during revert
  // Metadata
  appliedAt: timestamp("appliedAt").defaultNow().notNull(),
  updatedAt: timestamp("remUpdatedAt").defaultNow().onUpdateNow().notNull(),
});
export type RemediationHistoryRow = typeof remediationHistory.$inferSelect;
export type InsertRemediationHistory = typeof remediationHistory.$inferInsert;

// ═══════════════════════════════════════════════
//  ATTACK LOGS — Real-time pipeline event logging
// ═══════════════════════════════════════════════
export const attackLogs = mysqlTable("attack_logs", {
  id: int("id").autoincrement().primaryKey(),
  deployId: int("deployId"),                                       // linked deploy_history record
  userId: int("userId").notNull(),
  domain: varchar("logDomain", { length: 255 }).notNull(),
  // Event details
  phase: varchar("logPhase", { length: 64 }).notNull(),            // ai_analysis, prescreen, vuln_scan, shell_gen, upload, verify, etc.
  step: varchar("logStep", { length: 128 }).notNull(),             // sub-step within phase
  detail: text("logDetail").notNull(),                             // human-readable log message
  severity: mysqlEnum("logSeverity", ["info", "success", "warning", "error", "critical"]).default("info").notNull(),
  progress: int("logProgress").default(0).notNull(),               // 0-100 progress within pipeline
  // Context data
  data: json("logData"),                                           // arbitrary JSON context (response codes, URLs, etc.)
  method: varchar("logMethod", { length: 64 }),                    // attack method used (oneClickDeploy, waf_bypass, etc.)
  httpStatus: int("httpStatus"),                                   // HTTP response status if applicable
  responseTime: int("responseTime"),                               // response time in ms
  // Timing
  timestamp: timestamp("logTimestamp").defaultNow().notNull(),
  createdAt: timestamp("logCreatedAt").defaultNow().notNull(),
});
export type AttackLogRow = typeof attackLogs.$inferSelect;
export type InsertAttackLog = typeof attackLogs.$inferInsert;

// ═══════════════════════════════════════════════
//  AI ORCHESTRATOR — Master Brain State & Decision Log
// ═══════════════════════════════════════════════
export const aiOrchestratorState = mysqlTable("ai_orchestrator_state", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("orchStatus", ["running", "paused", "stopped", "error"]).default("stopped").notNull(),
  currentCycle: int("currentCycle").default(0).notNull(),
  totalCycles: int("totalCycles").default(0).notNull(),
  lastCycleAt: timestamp("lastCycleAt"),
  nextCycleAt: timestamp("nextCycleAt"),
  cycleIntervalMinutes: int("cycleIntervalMinutes").default(30).notNull(),
  seoEnabled: boolean("seoEnabled").default(true).notNull(),
  attackEnabled: boolean("attackEnabled").default(false).notNull(),
  pbnEnabled: boolean("pbnEnabled").default(true).notNull(),
  discoveryEnabled: boolean("discoveryEnabled").default(false).notNull(),
  rankTrackingEnabled: boolean("rankTrackingEnabled").default(true).notNull(),
  autobidEnabled: boolean("autobidEnabled").default(false).notNull(),
  aggressiveness: mysqlEnum("orchAggressiveness", ["conservative", "balanced", "aggressive", "maximum"]).default("balanced").notNull(),
  maxConcurrentTasks: int("maxConcurrentTasks").default(3).notNull(),
  maxDailyActions: int("maxDailyActions").default(100).notNull(),
  todayActions: int("todayActions").default(0).notNull(),
  totalTasksCompleted: int("totalTasksCompleted").default(0).notNull(),
  totalTasksFailed: int("totalTasksFailed").default(0).notNull(),
  totalDecisions: int("totalDecisions").default(0).notNull(),
  successRate: decimal("orchSuccessRate", { precision: 5, scale: 2 }).default("0"),
  aiWorldState: json("aiWorldState"),
  aiPriorities: json("aiPriorities"),
  aiLearnings: json("aiLearnings"),
  createdAt: timestamp("orchCreatedAt").defaultNow().notNull(),
  updatedAt: timestamp("orchUpdatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AiOrchestratorStateRow = typeof aiOrchestratorState.$inferSelect;

export const aiTaskQueue = mysqlTable("ai_task_queue", {
  id: int("id").autoincrement().primaryKey(),
  taskType: varchar("taskType", { length: 64 }).notNull(),
  subsystem: varchar("taskSubsystem", { length: 32 }).notNull(),
  title: varchar("taskTitle", { length: 255 }).notNull(),
  description: text("taskDescription"),
  targetDomain: varchar("taskTargetDomain", { length: 255 }),
  projectId: int("taskProjectId"),
  priority: mysqlEnum("taskPriority", ["critical", "high", "medium", "low"]).default("medium").notNull(),
  status: mysqlEnum("taskStatus", ["queued", "running", "completed", "failed", "cancelled", "skipped"]).default("queued").notNull(),
  aiReasoning: text("taskAiReasoning"),
  startedAt: timestamp("taskStartedAt"),
  completedAt: timestamp("taskCompletedAt"),
  result: json("taskResult"),
  error: text("taskError"),
  retryCount: int("taskRetryCount").default(0).notNull(),
  maxRetries: int("taskMaxRetries").default(3).notNull(),
  dependsOnTaskId: int("dependsOnTaskId"),
  scheduledFor: timestamp("scheduledFor"),
  createdAt: timestamp("taskCreatedAt").defaultNow().notNull(),
  updatedAt: timestamp("taskUpdatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AiTaskQueueRow = typeof aiTaskQueue.$inferSelect;
export type InsertAiTaskQueue = typeof aiTaskQueue.$inferInsert;

export const aiDecisions = mysqlTable("ai_decisions", {
  id: int("id").autoincrement().primaryKey(),
  cycle: int("decisionCycle").notNull(),
  phase: varchar("decisionPhase", { length: 32 }).notNull(),
  subsystem: varchar("decisionSubsystem", { length: 32 }).notNull(),
  decision: varchar("decision", { length: 255 }).notNull(),
  reasoning: text("decisionReasoning").notNull(),
  confidence: int("decisionConfidence").default(0).notNull(),
  inputData: json("decisionInputData"),
  outputData: json("decisionOutputData"),
  tasksCreated: int("tasksCreated").default(0).notNull(),
  impactLevel: varchar("impactLevel", { length: 16 }).default("medium").notNull(),
  createdAt: timestamp("decisionCreatedAt").defaultNow().notNull(),
});
export type AiDecisionRow = typeof aiDecisions.$inferSelect;
export type InsertAiDecision = typeof aiDecisions.$inferInsert;

export const aiMetrics = mysqlTable("ai_metrics", {
  id: int("id").autoincrement().primaryKey(),
  metricDate: timestamp("metricDate").notNull(),
  metricType: varchar("metricType", { length: 16 }).default("daily").notNull(),
  cyclesRun: int("cyclesRun").default(0).notNull(),
  tasksQueued: int("tasksQueued").default(0).notNull(),
  tasksCompleted: int("metricsTasksCompleted").default(0).notNull(),
  tasksFailed: int("metricsTasksFailed").default(0).notNull(),
  decisionsCount: int("decisionsCount").default(0).notNull(),
  seoActions: int("seoActions").default(0).notNull(),
  attackActions: int("attackActions").default(0).notNull(),
  pbnActions: int("pbnActions").default(0).notNull(),
  discoveryActions: int("discoveryActions").default(0).notNull(),
  rankActions: int("rankActions").default(0).notNull(),
  domainsProcessed: int("domainsProcessed").default(0).notNull(),
  backlinksBuilt: int("backlinksBuilt").default(0).notNull(),
  contentCreated: int("contentCreated").default(0).notNull(),
  ranksImproved: int("ranksImproved").default(0).notNull(),
  attacksSucceeded: int("attacksSucceeded").default(0).notNull(),
  targetsDiscovered: int("targetsDiscovered").default(0).notNull(),
  createdAt: timestamp("metricsCreatedAt").defaultNow().notNull(),
});
export type AiMetricRow = typeof aiMetrics.$inferSelect;
export type InsertAiMetric = typeof aiMetrics.$inferInsert;


// ═══════════════════════════════════════════════
// CVE Auto-Update Database
// ═══════════════════════════════════════════════
export const cveDatabase = mysqlTable("cve_database", {
  id: int("id").autoincrement().primaryKey(),
  cveId: varchar("cveId", { length: 32 }),
  source: varchar("source", { length: 32 }).notNull(), // "wordfence" | "nvd" | "manual"
  cms: varchar("cms", { length: 32 }).notNull(), // "wordpress" | "joomla" | "drupal" | "magento" | etc.
  softwareType: varchar("softwareType", { length: 32 }).notNull(), // "plugin" | "theme" | "core" | "module"
  softwareSlug: varchar("softwareSlug", { length: 128 }).notNull(),
  softwareName: varchar("softwareName", { length: 255 }),
  title: text("title").notNull(),
  description: text("description"),
  vulnType: varchar("vulnType", { length: 64 }), // "file_upload" | "rce" | "sqli" | etc.
  severity: varchar("severity", { length: 16 }), // "critical" | "high" | "medium" | "low"
  cvssScore: decimal("cvssScore", { precision: 3, scale: 1 }),
  affectedFrom: varchar("affectedFrom", { length: 32 }),
  affectedTo: varchar("affectedTo", { length: 32 }),
  patched: boolean("patched").default(false),
  patchedVersion: varchar("patchedVersion", { length: 32 }),
  exploitAvailable: boolean("exploitAvailable").default(false),
  exploitEndpoint: text("exploitEndpoint"),
  exploitMethod: varchar("exploitMethod", { length: 8 }),
  reference: text("reference"),
  publishedAt: timestamp("publishedAt"),
  updatedAt: timestamp("cveUpdatedAt").defaultNow().onUpdateNow().notNull(),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
});
export type CveRow = typeof cveDatabase.$inferSelect;
export type InsertCve = typeof cveDatabase.$inferInsert;

export const cveFetchLog = mysqlTable("cve_fetch_log", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 32 }).notNull(),
  fetchType: varchar("fetchType", { length: 32 }).notNull(), // "full" | "incremental"
  totalFetched: int("totalFetched").default(0).notNull(),
  newAdded: int("newAdded").default(0).notNull(),
  updated: int("updated").default(0).notNull(),
  errors: int("errors").default(0).notNull(),
  durationMs: int("durationMs").default(0).notNull(),
  details: json("details"),
  createdAt: timestamp("fetchLogCreatedAt").defaultNow().notNull(),
});
export type CveFetchLogRow = typeof cveFetchLog.$inferSelect;
export type InsertCveFetchLog = typeof cveFetchLog.$inferInsert;

// ═══════════════════════════════════════════════
// Exploit History (Success Rate Tracking)
// ═══════════════════════════════════════════════
export const exploitHistory = mysqlTable("exploit_history", {
  id: int("id").autoincrement().primaryKey(),
  // Target info
  targetDomain: varchar("targetDomain", { length: 512 }).notNull(),
  targetUrl: varchar("targetUrl", { length: 1024 }).notNull(),
  // Exploit info
  cveId: varchar("cveId", { length: 32 }),
  exploitType: varchar("exploitType", { length: 64 }).notNull(), // file_upload, rce, sqli, auth_bypass, lfi, xss, deserialization
  exploitSource: varchar("exploitSource", { length: 32 }).notNull(), // ai_generated, template, waf_evasion, manual
  cms: varchar("cms", { length: 32 }), // wordpress, joomla, drupal, magento, etc.
  component: varchar("component", { length: 128 }), // plugin/theme/module name
  // Result
  success: boolean("success").default(false).notNull(),
  uploadedUrl: varchar("uploadedUrl", { length: 1024 }),
  redirectVerified: boolean("redirectVerified").default(false).notNull(),
  httpStatus: int("httpStatus"),
  errorMessage: text("errorMessage"),
  // WAF info
  wafDetected: varchar("wafDetected", { length: 64 }),
  wafBypassed: boolean("wafBypassed").default(false).notNull(),
  evasionTechnique: varchar("evasionTechnique", { length: 128 }),
  // Payload info
  payloadHash: varchar("payloadHash", { length: 64 }), // SHA-256 of payload for dedup
  payloadSize: int("payloadSize"),
  // Timing
  durationMs: int("durationMs"),
  // Pipeline context
  pipelineRunId: varchar("pipelineRunId", { length: 64 }),
  attackPhase: varchar("attackPhase", { length: 32 }), // phase_2.6, phase_2.7, phase_4.5a, etc.
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ExploitHistoryRecord = typeof exploitHistory.$inferSelect;
export type InsertExploitHistory = typeof exploitHistory.$inferInsert;

// ═══════════════════════════════════════════════
// WAF Detection Log
// ═══════════════════════════════════════════════
export const wafDetections = mysqlTable("waf_detections", {
  id: int("id").autoincrement().primaryKey(),
  targetDomain: varchar("targetDomain", { length: 512 }).notNull(),
  targetUrl: varchar("targetUrl", { length: 1024 }).notNull(),
  // WAF info
  wafName: varchar("wafName", { length: 64 }),
  wafVendor: varchar("wafVendor", { length: 64 }),
  confidence: varchar("confidence", { length: 16 }), // high, medium, low
  strength: varchar("strength", { length: 16 }), // strong, moderate, weak
  // Block behavior
  blocksXss: boolean("blocksXss").default(false).notNull(),
  blocksSqli: boolean("blocksSqli").default(false).notNull(),
  blocksFileUpload: boolean("blocksFileUpload").default(false).notNull(),
  blocksPathTraversal: boolean("blocksPathTraversal").default(false).notNull(),
  blocksCommandInjection: boolean("blocksCommandInjection").default(false).notNull(),
  blocksRateLimit: boolean("blocksRateLimit").default(false).notNull(),
  // Detection methods used
  detectionMethods: json("detectionMethods").$type<string[]>(),
  evasionRecommendations: json("evasionRecommendations").$type<string[]>(),
  // Raw data
  rawHeaders: json("rawHeaders").$type<Record<string, string>>(),
  rawFingerprints: json("rawFingerprints").$type<string[]>(),
  // Pipeline context
  pipelineRunId: varchar("pipelineRunId", { length: 64 }),
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WafDetectionRecord = typeof wafDetections.$inferSelect;
export type InsertWafDetection = typeof wafDetections.$inferInsert;


// ═══════════════════════════════════════════════════════
// Redirect URL Pool — Multiple redirect destinations with rotation
// ═══════════════════════════════════════════════════════
export const redirectUrlPool = mysqlTable("redirect_url_pool", {
  id: int("id").primaryKey().autoincrement(),
  url: varchar("url", { length: 512 }).notNull(),
  label: varchar("label", { length: 128 }),
  weight: int("weight").default(1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  successCount: int("successCount").default(0).notNull(),
  failCount: int("failCount").default(0).notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type RedirectUrl = typeof redirectUrlPool.$inferSelect;
export type InsertRedirectUrl = typeof redirectUrlPool.$inferInsert;

// ═══════════════════════════════════════════════════════
// Agentic Attack Sessions — Autonomous AI attack runs
// ═══════════════════════════════════════════════════════
export const agenticSessions = mysqlTable("agentic_sessions", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  status: varchar("status", { length: 32 }).default("running").notNull(),
  mode: varchar("mode", { length: 32 }).default("full_auto").notNull(),
  redirectUrls: json("redirectUrls"),
  targetCms: json("targetCms"),
  maxTargetsPerRun: int("maxTargetsPerRun").default(50).notNull(),
  maxConcurrent: int("maxConcurrent").default(3).notNull(),
  seoKeywords: json("seoKeywords"),
  customDorks: json("customDorks"),
  targetsDiscovered: int("targetsDiscovered").default(0).notNull(),
  targetsAttacked: int("targetsAttacked").default(0).notNull(),
  targetsSucceeded: int("targetsSucceeded").default(0).notNull(),
  targetsFailed: int("targetsFailed").default(0).notNull(),
  totalRedirectsPlaced: int("totalRedirectsPlaced").default(0).notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  lastActivityAt: timestamp("lastActivityAt"),
  completedAt: timestamp("completedAt"),
  currentPhase: varchar("currentPhase", { length: 128 }).default("initializing"),
  currentTarget: varchar("currentTarget", { length: 512 }),
  eventsLog: json("eventsLog"),
  errors: json("errors"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AgenticSession = typeof agenticSessions.$inferSelect;
export type InsertAgenticSession = typeof agenticSessions.$inferInsert;


// ═══════════════════════════════════════════════════════
// Adaptive Learning: Strategy Outcome Logs
// Records EVERY attack attempt with full context for AI learning
// ═══════════════════════════════════════════════════════
export const strategyOutcomeLogs = mysqlTable("strategy_outcome_logs", {
  id: int("id").primaryKey().autoincrement(),
  // Target fingerprint
  targetDomain: varchar("targetDomain", { length: 255 }).notNull(),
  cms: varchar("solCms", { length: 64 }),
  cmsVersion: varchar("solCmsVersion", { length: 32 }),
  serverType: varchar("solServerType", { length: 128 }),
  phpVersion: varchar("solPhpVersion", { length: 32 }),
  wafDetected: varchar("solWafDetected", { length: 64 }),
  wafStrength: varchar("solWafStrength", { length: 16 }),
  vulnScore: int("solVulnScore"),
  // Attack details
  method: varchar("solMethod", { length: 128 }).notNull(),
  exploitType: varchar("solExploitType", { length: 128 }),
  payloadType: varchar("solPayloadType", { length: 64 }),
  wafBypassUsed: json("solWafBypassUsed").$type<string[]>(),
  payloadModifications: json("solPayloadMods").$type<string[]>(),
  attackPath: varchar("solAttackPath", { length: 512 }),
  // Attempt context
  attemptNumber: int("solAttemptNumber").default(1).notNull(),
  isRetry: boolean("solIsRetry").default(false).notNull(),
  previousMethodsTried: json("solPreviousMethods").$type<string[]>(),
  // Result
  success: boolean("solSuccess").default(false).notNull(),
  httpStatus: int("solHttpStatus"),
  errorCategory: varchar("solErrorCategory", { length: 64 }),
  errorMessage: text("solErrorMessage"),
  filesPlaced: int("solFilesPlaced").default(0).notNull(),
  redirectVerified: boolean("solRedirectVerified").default(false).notNull(),
  durationMs: int("solDurationMs"),
  // AI analysis
  aiFailureCategory: varchar("solAiFailureCategory", { length: 64 }),
  aiReasoning: text("solAiReasoning"),
  aiConfidence: int("solAiConfidence"),
  aiEstimatedSuccess: int("solAiEstimatedSuccess"),
  // Session context
  sessionId: int("solSessionId"),
  agenticSessionId: int("solAgenticSessionId"),
  // Metadata
  createdAt: timestamp("solCreatedAt").defaultNow().notNull(),
});
export type StrategyOutcomeLog = typeof strategyOutcomeLogs.$inferSelect;
export type InsertStrategyOutcomeLog = typeof strategyOutcomeLogs.$inferInsert;

// ═══════════════════════════════════════════════════════
// Adaptive Learning: Learned Patterns
// Aggregated insights — AI-synthesized knowledge from historical outcomes
// Updated periodically by the learning engine
// ═══════════════════════════════════════════════════════
export const learnedPatterns = mysqlTable("learned_patterns", {
  id: int("id").primaryKey().autoincrement(),
  // Pattern key (what this pattern applies to)
  patternType: varchar("lpPatternType", { length: 64 }).notNull(),
  // "cms_method" | "waf_bypass" | "server_exploit" | "general"
  patternKey: varchar("lpPatternKey", { length: 255 }).notNull(),
  // e.g. "wordpress:cve_exploit", "cloudflare:chunked_encoding", "apache:file_upload_spray"
  // Aggregated stats
  totalAttempts: int("lpTotalAttempts").default(0).notNull(),
  totalSuccesses: int("lpTotalSuccesses").default(0).notNull(),
  successRate: decimal("lpSuccessRate", { precision: 5, scale: 2 }).default("0").notNull(),
  avgDurationMs: int("lpAvgDurationMs").default(0).notNull(),
  lastSuccessAt: timestamp("lpLastSuccessAt"),
  lastFailureAt: timestamp("lpLastFailureAt"),
  // AI-synthesized insight
  aiInsight: text("lpAiInsight"),
  // What the AI learned about this pattern
  aiRecommendation: text("lpAiRecommendation"),
  // What the AI recommends for this pattern
  confidenceScore: int("lpConfidenceScore").default(0).notNull(),
  // 0-100 how confident AI is in this pattern
  // Context data
  sampleSuccessContexts: json("lpSampleSuccessContexts").$type<Record<string, unknown>[]>(),
  sampleFailureContexts: json("lpSampleFailureContexts").$type<Record<string, unknown>[]>(),
  // Best performing configurations
  bestPayloadMods: json("lpBestPayloadMods").$type<string[]>(),
  bestWafBypasses: json("lpBestWafBypasses").$type<string[]>(),
  bestAttackPaths: json("lpBestAttackPaths").$type<string[]>(),
  // Metadata
  updatedAt: timestamp("lpUpdatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("lpCreatedAt").defaultNow().notNull(),
});
export type LearnedPattern = typeof learnedPatterns.$inferSelect;
export type InsertLearnedPattern = typeof learnedPatterns.$inferInsert;

// ═══════════════════════════════════════════════════════
// Adaptive Learning: CMS Attack Profiles
// Learned attack profiles per CMS type — best methods, common WAFs, success rates
// ═══════════════════════════════════════════════════════
export const cmsAttackProfiles = mysqlTable("cms_attack_profiles", {
  id: int("id").primaryKey().autoincrement(),
  cms: varchar("capCms", { length: 64 }).notNull(),
  cmsVersion: varchar("capCmsVersion", { length: 32 }),
  // Method rankings (ordered by success rate)
  methodRankings: json("capMethodRankings").$type<Array<{
    method: string;
    successRate: number;
    attempts: number;
    avgDuration: number;
  }>>(),
  // Common defenses encountered
  commonWafs: json("capCommonWafs").$type<Array<{
    waf: string;
    frequency: number;
    bestBypass: string | null;
    bypassSuccessRate: number;
  }>>(),
  // Overall stats
  totalAttacks: int("capTotalAttacks").default(0).notNull(),
  overallSuccessRate: decimal("capOverallSuccessRate", { precision: 5, scale: 2 }).default("0").notNull(),
  bestMethod: varchar("capBestMethod", { length: 128 }),
  bestMethodSuccessRate: decimal("capBestMethodRate", { precision: 5, scale: 2 }),
  worstMethod: varchar("capWorstMethod", { length: 128 }),
  // AI-generated attack playbook for this CMS
  aiPlaybook: text("capAiPlaybook"),
  aiPlaybookConfidence: int("capAiPlaybookConfidence"),
  // Metadata
  updatedAt: timestamp("capUpdatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("capCreatedAt").defaultNow().notNull(),
});
export type CmsAttackProfile = typeof cmsAttackProfiles.$inferSelect;
export type InsertCmsAttackProfile = typeof cmsAttackProfiles.$inferInsert;

// ═══════════════════════════════════════════════
// Attack Blacklist — Domains that failed and should not be re-attacked
// ═══════════════════════════════════════════════
export const attackBlacklist = mysqlTable("attack_blacklist", {
  id: int("id").autoincrement().primaryKey(),
  domain: varchar("domain", { length: 512 }).notNull(),
  reason: text("reason").notNull(),                          // Why it was blacklisted
  failCount: int("failCount").default(1).notNull(),          // How many times it failed
  lastFailedAt: timestamp("lastFailedAt").defaultNow().notNull(),
  firstFailedAt: timestamp("firstFailedAt").defaultNow().notNull(),
  errors: json("errors").$type<string[]>(),                  // Last errors encountered
  cooldownUntil: timestamp("cooldownUntil"),                 // When it can be retried (null = permanent)
  isPermaBanned: boolean("isPermaBanned").default(false).notNull(), // Never retry
  totalAttempts: int("totalAttempts").default(0).notNull(),
  totalDurationMs: bigint("totalDurationMs", { mode: "number" }).default(0).notNull(),
  cms: varchar("cms", { length: 64 }),
  serverType: varchar("serverType", { length: 128 }),
  waf: varchar("waf", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});


// ═══════════════════════════════════════════════
// SerpAPI Keyword Target Discovery — Lottery keyword-based target finding
// ═══════════════════════════════════════════════
export const serpKeywords = mysqlTable("serp_keywords", {
  id: int("id").autoincrement().primaryKey(),
  keyword: varchar("keyword", { length: 512 }).notNull(),
  category: varchar("category", { length: 128 }).default("lottery").notNull(),
  language: varchar("language", { length: 16 }).default("th").notNull(),
  country: varchar("country", { length: 16 }).default("th").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  lastSearchedAt: timestamp("lastSearchedAt"),
  totalSearches: int("totalSearches").default(0).notNull(),
  totalTargetsFound: int("totalTargetsFound").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SerpKeyword = typeof serpKeywords.$inferSelect;
export type InsertSerpKeyword = typeof serpKeywords.$inferInsert;

export const serpDiscoveredTargets = mysqlTable("serp_discovered_targets", {
  id: int("id").autoincrement().primaryKey(),
  domain: varchar("domain", { length: 512 }).notNull(),
  url: text("url").notNull(),
  title: text("title"),
  snippet: text("snippet"),
  serpPosition: int("serpPosition"),                          // Position in SERP results
  keyword: varchar("keyword", { length: 512 }).notNull(),    // Which keyword found this
  keywordId: int("keywordId"),                                // FK to serp_keywords
  // Target analysis
  cms: varchar("cms", { length: 64 }),
  serverType: varchar("serverType", { length: 128 }),
  waf: varchar("waf", { length: 128 }),
  vulnScore: int("vulnScore"),
  // Attack status
  status: mysqlEnum("sdtStatus", [
    "discovered", "queued", "scanning", "attacking", "success", "failed", "blacklisted", "skipped"
  ]).default("discovered").notNull(),
  attackSessionId: int("attackSessionId"),                    // FK to agentic_sessions
  attackedAt: timestamp("attackedAt"),
  attackResult: text("attackResult"),
  deployedUrls: json("deployedUrls").$type<string[]>(),
  // Metadata
  discoveredAt: timestamp("discoveredAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SerpDiscoveredTarget = typeof serpDiscoveredTargets.$inferSelect;
export type InsertSerpDiscoveredTarget = typeof serpDiscoveredTargets.$inferInsert;

export const serpSearchRuns = mysqlTable("serp_search_runs", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("ssrStatus", ["running", "completed", "error", "cancelled"]).default("running").notNull(),
  keywordsSearched: int("keywordsSearched").default(0).notNull(),
  totalKeywords: int("totalKeywords").default(0).notNull(),
  rawResultsFound: int("rawResultsFound").default(0).notNull(),
  uniqueDomainsFound: int("uniqueDomainsFound").default(0).notNull(),
  newTargetsAdded: int("newTargetsAdded").default(0).notNull(),
  duplicatesSkipped: int("duplicatesSkipped").default(0).notNull(),
  blacklistedSkipped: int("blacklistedSkipped").default(0).notNull(),
  errors: json("errors").$type<string[]>(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  triggeredBy: varchar("triggeredBy", { length: 64 }).default("manual").notNull(), // manual, scheduler, daemon
});
export type SerpSearchRun = typeof serpSearchRuns.$inferSelect;
export type InsertSerpSearchRun = typeof serpSearchRuns.$inferInsert;

// ═══════════════════════════════════════════════════════
// Hacked Site Detections — Track already-compromised sites
// ═══════════════════════════════════════════════════════
export const hackedSiteDetections = mysqlTable("hacked_site_detections", {
  id: int("id").autoincrement().primaryKey(),
  domain: varchar("domain", { length: 512 }).notNull(),
  url: text("url").notNull(),
  // Detection results
  isHacked: boolean("isHacked").default(false).notNull(),
  competitorUrl: text("competitorUrl"),
  detectionMethods: json("detectionMethods").$type<Array<{
    type: string;
    location: string;
    competitorUrl: string;
    confidence: string;
    details: string;
    rawSnippet?: string;
  }>>(),
  targetPlatform: varchar("targetPlatform", { length: 64 }),
  wpVersion: varchar("wpVersion", { length: 32 }),
  plugins: json("plugins").$type<string[]>(),
  // Takeover status
  takeoverStatus: mysqlEnum("takeoverStatus", [
    "not_attempted", "in_progress", "success", "failed", "partial"
  ]).default("not_attempted").notNull(),
  takeoverMethod: varchar("takeoverMethod", { length: 128 }),
  takeoverResult: text("takeoverResult"),
  takeoverAt: timestamp("takeoverAt"),
  // Verification
  verificationStatus: mysqlEnum("verificationStatus", [
    "not_verified", "pending", "verified_success", "verified_reverted", "verified_partial", "verification_failed"
  ]).default("not_verified").notNull(),
  verificationStage: mysqlEnum("verificationStage", [
    "none", "immediate", "short_term", "medium_term", "long_term"
  ]).default("none").notNull(),
  verifiedAt: timestamp("verifiedAt"),
  verificationAttempts: int("verificationAttempts").default(0).notNull(),
  verificationHistory: json("verificationHistory").$type<Array<{
    stage: string;
    timestamp: string;
    status: string;
    ourRedirectFound: boolean;
    competitorRedirectFound: boolean;
    currentRedirectTarget: string | null;
    details: string;
  }>>(),
  nextVerificationAt: timestamp("nextVerificationAt"),
  autoRetryCount: int("autoRetryCount").default(0).notNull(),
  ourRedirectUrl: text("ourRedirectUrl"),
  // Priority for attack queue
  priority: int("priority").default(0).notNull(), // Higher = more priority
  // Source: how was this site found?
  source: mysqlEnum("detectionSource", [
    "manual_scan", "batch_scan", "agentic_discovery", "attack_pipeline"
  ]).default("manual_scan").notNull(),
  // Metadata
  scannedAt: timestamp("scannedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  userId: varchar("userId", { length: 128 }),
});
export type HackedSiteDetection = typeof hackedSiteDetections.$inferSelect;
export type InsertHackedSiteDetection = typeof hackedSiteDetections.$inferInsert;


// ═══════════════════════════════════════════════════════
// Keyword Performance Tracking — correlate attacks with rank changes
// ═══════════════════════════════════════════════════════
export const keywordPerformance = mysqlTable("keyword_performance", {
  id: int("id").autoincrement().primaryKey(),
  keyword: varchar("keyword", { length: 500 }).notNull(),
  targetDomain: varchar("targetDomain", { length: 512 }).notNull(),
  parasiteDomain: varchar("parasiteDomain", { length: 512 }),
  agenticSessionId: int("agenticSessionId"),
  attackMethod: varchar("attackMethod", { length: 64 }),
  attackedAt: timestamp("attackedAt"),
  rankBefore: int("rankBefore"),
  rankAfter1h: int("rankAfter1h"),
  rankAfter24h: int("rankAfter24h"),
  rankAfter7d: int("rankAfter7d"),
  rankAfter30d: int("rankAfter30d"),
  currentRank: int("currentRank"),
  bestRank: int("bestRank"),
  rankImprovement: int("rankImprovement"),
  isOnPage1: boolean("isOnPage1").default(false).notNull(),
  isInTop3: boolean("isInTop3").default(false).notNull(),
  estimatedTraffic: int("estimatedTraffic").default(0).notNull(),
  estimatedValue: decimal("estimatedValue", { precision: 10, scale: 2 }),
  performanceScore: int("performanceScore").default(0).notNull(),
  status: mysqlEnum("perfStatus", [
    "pending", "tracking", "peaked", "stable", "lost", "completed"
  ]).default("pending").notNull(),
  nextCheckAt: timestamp("nextCheckAt"),
  lastCheckedAt: timestamp("lastCheckedAt"),
  totalChecks: int("totalChecks").default(0).notNull(),
  category: varchar("perfCategory", { length: 64 }),
  searchVolume: int("perfSearchVolume"),
  keywordDifficulty: int("perfKeywordDifficulty"),
  cpc: decimal("perfCpc", { precision: 8, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type KeywordPerformance = typeof keywordPerformance.$inferSelect;
export type InsertKeywordPerformance = typeof keywordPerformance.$inferInsert;


// ═══════════════════════════════════════════════════════
// Tracked Content — DB-backed freshness tracking for SEO content
// Persists across server restarts (replaces in-memory Map)
// ═══════════════════════════════════════════════════════
export const trackedContent = mysqlTable("tracked_content", {
  id: int("id").autoincrement().primaryKey(),
  contentKey: varchar("contentKey", { length: 128 }).notNull().unique(), // unique key for dedup (hash of url)
  url: text("url").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  keyword: varchar("keyword", { length: 500 }).notNull(),
  platform: mysqlEnum("tcPlatform", ["telegraph", "web2.0", "target", "other"]).default("other").notNull(),
  originalContent: text("originalContent"),
  currentContent: text("currentContent"),
  telegraphToken: varchar("telegraphToken", { length: 255 }),
  telegraphPath: varchar("telegraphPath", { length: 255 }),
  domain: varchar("tcDomain", { length: 512 }).notNull(),
  deployedAt: timestamp("tcDeployedAt").defaultNow().notNull(),
  lastRefreshedAt: timestamp("tcLastRefreshedAt").defaultNow().notNull(),
  refreshCount: int("tcRefreshCount").default(0).notNull(),
  currentRank: int("tcCurrentRank"),
  stalenessScore: int("tcStalenessScore").default(0).notNull(),
  priority: int("tcPriority").default(5).notNull(),
  status: mysqlEnum("tcStatus", ["fresh", "aging", "stale", "refreshing", "error"]).default("fresh").notNull(),
  // Source tracking
  sourceEngine: varchar("tcSourceEngine", { length: 64 }), // "multi-platform", "external-backlink", "parasite-blitz", "sprint"
  projectId: int("tcProjectId"),
  createdAt: timestamp("tcCreatedAt").defaultNow().notNull(),
  updatedAt: timestamp("tcUpdatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TrackedContentRow = typeof trackedContent.$inferSelect;
export type InsertTrackedContent = typeof trackedContent.$inferInsert;
