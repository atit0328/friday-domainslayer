import { eq, desc, asc, and, or, sql, like, inArray, gte, lte, isNotNull, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  domainScans, orders, autobidRules, watchlist, watchlistAlerts,
  marketplaceSearches,
  chatMessages, campaigns, campaignLogs,
  pbnSites, pbnPosts, algoIntel, moduleExecutions,
  seoProjects, backlinkLog, rankTracking, seoActions, seoSnapshots,
  userMethodPriority,
  aiAttackHistory, InsertAiAttackHistory,
  seoAgentTasks, InsertSEOAgentTask,
  seoContent, InsertSEOContent,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ═══ User helpers ═══
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; /* only for INSERT, don't override existing role */ }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createLocalUser(data: { email: string; name: string; passwordHash: string; phone?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const result = await db.insert(users).values({
    openId,
    email: data.email,
    name: data.name,
    passwordHash: data.passwordHash,
    phone: data.phone || null,
    loginMethod: "local",
    role: "user",
    lastSignedIn: new Date(),
  });
  return { id: Number(result[0].insertId), openId };
}

// ═══ Domain Scans ═══
export async function createScan(userId: number, domain: string, useCase: string) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(domainScans).values({ userId, domain, useCase, status: "pending" });
  return { id: Number(result[0].insertId), domain, useCase, status: "pending" };
}

export async function updateScan(id: number, data: Partial<typeof domainScans.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(domainScans).set(data).where(eq(domainScans.id, id));
}

export async function getScanById(id: number) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(domainScans).where(eq(domainScans.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getUserScans(_userId?: number, limit = 50) {
  const db = await getDb(); if (!db) return [];
  // Shared: all admins see all scans
  return db.select().from(domainScans).orderBy(desc(domainScans.createdAt)).limit(limit);
}

// ═══ Orders ═══
export async function createOrder(userId: number, data: { domain: string; provider: string; action: string; amount: string }) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(orders).values({
    userId, domain: data.domain, provider: data.provider,
    action: data.action as any, amount: data.amount, status: "pending",
  });
  return { id: Number(result[0].insertId) };
}

export async function getUserOrders(_userId?: number, status?: string, limit = 50) {
  const db = await getDb(); if (!db) return [];
  // Shared: all admins see all orders
  const conditions: any[] = [];
  if (status) conditions.push(eq(orders.status, status as any));
  return db.select().from(orders).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(orders.createdAt)).limit(limit);
}

export async function updateOrder(id: number, data: Partial<typeof orders.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(orders).set(data).where(eq(orders.id, id));
}

// ═══ Auto-Bid Rules ═══
export async function createAutobidRule(userId: number, data: Partial<typeof autobidRules.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(autobidRules).values({ userId, ...data } as any);
  return { id: Number(result[0].insertId) };
}

export async function getUserAutobidRules(_userId?: number) {
  const db = await getDb(); if (!db) return [];
  // Shared: all admins see all autobid rules
  return db.select().from(autobidRules).orderBy(desc(autobidRules.createdAt));
}

export async function getAutobidRuleById(id: number) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(autobidRules).where(eq(autobidRules.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateAutobidRule(id: number, data: Partial<typeof autobidRules.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(autobidRules).set(data).where(eq(autobidRules.id, id));
}

export async function deleteAutobidRule(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(autobidRules).where(eq(autobidRules.id, id));
}

// ═══ Watchlist ═══
export async function addWatchlistItem(userId: number, data: Partial<typeof watchlist.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(watchlist).values({ userId, ...data } as any);
  return { id: Number(result[0].insertId) };
}

export async function getUserWatchlist(_userId?: number, status?: string) {
  const db = await getDb(); if (!db) return [];
  // Shared: all admins see all watchlist items
  const conditions: any[] = [];
  if (status) conditions.push(eq(watchlist.status, status as any));
  return db.select().from(watchlist).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(watchlist.createdAt));
}

export async function updateWatchlistItem(id: number, data: Partial<typeof watchlist.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(watchlist).set(data).where(eq(watchlist.id, id));
}

export async function deleteWatchlistItem(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(watchlist).where(eq(watchlist.id, id));
}

export async function getWatchlistAlerts(_userId?: number, limit = 50) {
  const db = await getDb(); if (!db) return [];
  // Shared: all admins see all alerts
  return db.select().from(watchlistAlerts)
    .innerJoin(watchlist, eq(watchlistAlerts.watchlistId, watchlist.id))
    .orderBy(desc(watchlistAlerts.createdAt))
    .limit(limit);
}

// ═══ Chat Messages ═══
export async function addChatMessage(userId: number, role: string, content: string, provider?: string) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.insert(chatMessages).values({ userId, role, content, provider });
}

export async function getUserChatHistory(_userId?: number, limit = 100) {
  const db = await getDb(); if (!db) return [];
  // Shared: all admins see all chat history
  return db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt)).limit(limit);
}

export async function clearUserChat(_userId?: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  // Shared: clear all chat messages
  await db.delete(chatMessages);
}

// ═══ Campaigns ═══
export async function createCampaign(userId: number, data: Partial<typeof campaigns.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(campaigns).values({ userId, ...data } as any);
  return { id: Number(result[0].insertId) };
}

export async function getUserCampaigns(_userId?: number) {
  const db = await getDb(); if (!db) return [];
  // Shared: all admins see all campaigns
  return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
}

export async function getCampaignById(id: number) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateCampaign(id: number, data: Partial<typeof campaigns.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(campaigns).set(data).where(eq(campaigns.id, id));
}

export async function deleteCampaign(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(campaigns).where(eq(campaigns.id, id));
}

export async function addCampaignLog(campaignId: number, phase: number, phaseName: string, status: string, data?: unknown) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.insert(campaignLogs).values({ campaignId, phase, phaseName, status, data: data as any });
}

export async function getCampaignLogs(campaignId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(campaignLogs).where(eq(campaignLogs.campaignId, campaignId)).orderBy(desc(campaignLogs.createdAt));
}

// ═══ PBN Sites ═══
export async function addPbnSite(userId: number, data: { name: string; url: string; username: string; appPassword: string }) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(pbnSites).values({ userId, ...data });
  return { id: Number(result[0].insertId) };
}

export async function getUserPbnSites(_userId?: number) {
  const db = await getDb(); if (!db) return [];
  // All admins see all PBN sites (shared across team)
  return db.select().from(pbnSites).orderBy(desc(pbnSites.createdAt));
}

export async function updatePbnSite(id: number, data: Partial<typeof pbnSites.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(pbnSites).set(data).where(eq(pbnSites.id, id));
}

export async function deletePbnSite(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(pbnSites).where(eq(pbnSites.id, id));
}

export async function addPbnPost(data: typeof pbnPosts.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(pbnPosts).values(data);
  return { id: Number(result[0].insertId) };
}

export async function getSitePosts(siteId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(pbnPosts).where(eq(pbnPosts.siteId, siteId)).orderBy(desc(pbnPosts.createdAt));
}

// ═══ Algorithm Intel ═══
export async function addAlgoIntel(userId: number | null, signals: unknown, analysis?: string) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(algoIntel).values({ userId, signals: signals as any, analysis });
  return { id: Number(result[0].insertId) };
}

export async function getLatestAlgoIntel(limit = 10) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(algoIntel).orderBy(desc(algoIntel.createdAt)).limit(limit);
}

// ═══ Module Executions ═══
export async function createModuleExecution(userId: number, data: Partial<typeof moduleExecutions.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(moduleExecutions).values({ userId, ...data } as any);
  return { id: Number(result[0].insertId) };
}

export async function updateModuleExecution(id: number, data: Partial<typeof moduleExecutions.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(moduleExecutions).set(data).where(eq(moduleExecutions.id, id));
}

export async function getUserModuleExecutions(_userId?: number, limit = 50) {
  const db = await getDb(); if (!db) return [];
  // Shared: all admins see all module executions
  return db.select().from(moduleExecutions).orderBy(desc(moduleExecutions.createdAt)).limit(limit);
}

// ═══ Dashboard Stats ═══
export async function getDashboardStats(_userId?: number) {
  const db = await getDb();
  if (!db) return { scans: 0, orders: 0, watchlistCount: 0, campaigns: 0, chatMessages: 0, pbnSites: 0 };
  // Shared: count all data globally
  const [scanCount] = await db.select({ count: sql<number>`count(*)` }).from(domainScans);
  const [orderCount] = await db.select({ count: sql<number>`count(*)` }).from(orders);
  const [watchCount] = await db.select({ count: sql<number>`count(*)` }).from(watchlist);
  const [campCount] = await db.select({ count: sql<number>`count(*)` }).from(campaigns);
  const [chatCount] = await db.select({ count: sql<number>`count(*)` }).from(chatMessages);
  const [pbnCount] = await db.select({ count: sql<number>`count(*)` }).from(pbnSites);
  return {
    scans: Number(scanCount.count),
    orders: Number(orderCount.count),
    watchlistCount: Number(watchCount.count),
    campaigns: Number(campCount.count),
    chatMessages: Number(chatCount.count),
    pbnSites: Number(pbnCount.count),
  };
}

// ═══ Marketplace Search (save results) ═══
export async function saveMarketplaceSearch(userId: number, data: Partial<typeof marketplaceSearches.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(marketplaceSearches).values({ userId, ...data } as any);
  return { id: Number(result[0].insertId) };
}

// ═══ Bid History ═══
import { bidHistory } from "../drizzle/schema";

export async function createBidHistoryEntry(userId: number, data: Partial<typeof bidHistory.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(bidHistory).values({ userId, ...data } as any);
  return { id: Number(result[0].insertId) };
}

export async function getBidHistoryForRule(ruleId: number, limit = 100) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(bidHistory).where(eq(bidHistory.ruleId, ruleId)).orderBy(desc(bidHistory.createdAt)).limit(limit);
}

export async function getUserBidHistory(_userId?: number, limit = 100) {
  const db = await getDb(); if (!db) return [];
  // Shared: all admins see all bid history
  return db.select().from(bidHistory).orderBy(desc(bidHistory.createdAt)).limit(limit);
}

export async function updateBidHistory(id: number, data: Partial<typeof bidHistory.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(bidHistory).set(data).where(eq(bidHistory.id, id));
}

export async function getActiveAutobidRules() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(autobidRules).where(eq(autobidRules.status, "active"));
}

// ═══ SEO Projects ═══
export async function createSeoProject(userId: number, data: Partial<typeof seoProjects.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(seoProjects).values({ userId, ...data } as any);
  return { id: Number(result[0].insertId) };
}

export async function getUserSeoProjects(_userId?: number) {
  const db = await getDb(); if (!db) return [];
  // Shared: all admins see all SEO projects
  return db.select().from(seoProjects).orderBy(desc(seoProjects.updatedAt));
}

export async function getSeoProjectById(id: number) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(seoProjects).where(eq(seoProjects.id, id)).limit(1);
  return rows[0] || null;
}

export async function updateSeoProject(id: number, data: Partial<typeof seoProjects.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(seoProjects).set(data).where(eq(seoProjects.id, id));
}

export async function deleteSeoProject(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(seoProjects).where(eq(seoProjects.id, id));
}

// Get all projects with auto-run enabled that are due to run
// Used by seo-scheduler.ts for weekly auto-run
export async function getScheduledProjects() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(seoProjects)
    .where(eq(seoProjects.autoRunEnabled, true))
    .orderBy(seoProjects.nextAutoRunAt);
}

// ═══ Backlink Log ═══
export async function addBacklink(projectId: number, data: Partial<typeof backlinkLog.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(backlinkLog).values({ projectId, ...data } as any);
  return { id: Number(result[0].insertId) };
}

export async function getProjectBacklinks(projectId: number, limit = 200) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(backlinkLog).where(eq(backlinkLog.projectId, projectId)).orderBy(desc(backlinkLog.createdAt)).limit(limit);
}

export async function updateBacklink(id: number, data: Partial<typeof backlinkLog.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(backlinkLog).set(data).where(eq(backlinkLog.id, id));
}

export async function deleteBacklink(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(backlinkLog).where(eq(backlinkLog.id, id));
}

export async function getBacklinkStats(projectId: number) {
  const db = await getDb();
  if (!db) return { total: 0, active: 0, lost: 0, dofollow: 0, nofollow: 0, pbn: 0, guestPost: 0, web2: 0, avgDA: 0 };
  const [total] = await db.select({ count: sql<number>`count(*)` }).from(backlinkLog).where(eq(backlinkLog.projectId, projectId));
  const [active] = await db.select({ count: sql<number>`count(*)` }).from(backlinkLog).where(and(eq(backlinkLog.projectId, projectId), eq(backlinkLog.status, "active")));
  const [lost] = await db.select({ count: sql<number>`count(*)` }).from(backlinkLog).where(and(eq(backlinkLog.projectId, projectId), eq(backlinkLog.status, "lost")));
  const [dofollow] = await db.select({ count: sql<number>`count(*)` }).from(backlinkLog).where(and(eq(backlinkLog.projectId, projectId), eq(backlinkLog.linkType, "dofollow")));
  const [nofollow] = await db.select({ count: sql<number>`count(*)` }).from(backlinkLog).where(and(eq(backlinkLog.projectId, projectId), eq(backlinkLog.linkType, "nofollow")));
  const [pbn] = await db.select({ count: sql<number>`count(*)` }).from(backlinkLog).where(and(eq(backlinkLog.projectId, projectId), eq(backlinkLog.sourceType, "pbn")));
  const [guestPost] = await db.select({ count: sql<number>`count(*)` }).from(backlinkLog).where(and(eq(backlinkLog.projectId, projectId), eq(backlinkLog.sourceType, "guest_post")));
  const [web2] = await db.select({ count: sql<number>`count(*)` }).from(backlinkLog).where(and(eq(backlinkLog.projectId, projectId), eq(backlinkLog.sourceType, "web2")));
  const [avgDA] = await db.select({ avg: sql<number>`COALESCE(AVG(sourceDA), 0)` }).from(backlinkLog).where(and(eq(backlinkLog.projectId, projectId), eq(backlinkLog.status, "active")));
  return {
    total: Number(total.count), active: Number(active.count), lost: Number(lost.count),
    dofollow: Number(dofollow.count), nofollow: Number(nofollow.count),
    pbn: Number(pbn.count), guestPost: Number(guestPost.count), web2: Number(web2.count),
    avgDA: Math.round(Number(avgDA.avg)),
  };
}

// ═══ Rank Tracking ═══
export async function addRankEntry(projectId: number, data: Partial<typeof rankTracking.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(rankTracking).values({ projectId, ...data } as any);
  return { id: Number(result[0].insertId) };
}

export async function getProjectRankings(projectId: number, limit = 500) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(rankTracking).where(eq(rankTracking.projectId, projectId)).orderBy(desc(rankTracking.trackedAt)).limit(limit);
}

export async function getKeywordRankHistory(projectId: number, keyword: string, limit = 90) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(rankTracking)
    .where(and(eq(rankTracking.projectId, projectId), eq(rankTracking.keyword, keyword)))
    .orderBy(desc(rankTracking.trackedAt)).limit(limit);
}

export async function getLatestRankings(projectId: number) {
  const db = await getDb(); if (!db) return [];
  // Get latest rank for each keyword
  return db.select().from(rankTracking)
    .where(eq(rankTracking.projectId, projectId))
    .orderBy(desc(rankTracking.trackedAt)).limit(100);
}

// ═══ Rank Tracking Dashboard (cross-project) ═══

/** Get all rank entries across all projects, with optional filters */
export async function getAllRankEntries(opts: {
  keyword?: string;
  projectId?: number;
  limit?: number;
  offset?: number;
} = {}) {
  const db = await getDb(); if (!db) return { items: [], total: 0 };
  const conditions = [];
  if (opts.projectId) conditions.push(eq(rankTracking.projectId, opts.projectId));
  if (opts.keyword) conditions.push(like(rankTracking.keyword, `%${opts.keyword}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [items, countResult] = await Promise.all([
    db.select().from(rankTracking).where(where).orderBy(desc(rankTracking.trackedAt)).limit(opts.limit || 200).offset(opts.offset || 0),
    db.select({ count: sql<number>`count(*)` }).from(rankTracking).where(where),
  ]);
  return { items, total: Number(countResult[0]?.count || 0) };
}

/** Get unique tracked keywords with their latest position across all projects */
export async function getUniqueTrackedKeywords() {
  const db = await getDb(); if (!db) return [];
  // Get the latest entry per keyword+projectId combo
  const rows = await db.select({
    keyword: rankTracking.keyword,
    projectId: rankTracking.projectId,
    position: rankTracking.position,
    previousPosition: rankTracking.previousPosition,
    positionChange: rankTracking.positionChange,
    searchEngine: rankTracking.searchEngine,
    country: rankTracking.country,
    device: rankTracking.device,
    searchVolume: rankTracking.searchVolume,
    keywordDifficulty: rankTracking.keywordDifficulty,
    cpc: rankTracking.cpc,
    serpUrl: rankTracking.serpUrl,
    trend: rankTracking.trend,
    trackedAt: rankTracking.trackedAt,
    bestPosition: rankTracking.bestPosition,
  }).from(rankTracking).orderBy(desc(rankTracking.trackedAt)).limit(2000);

  // Deduplicate: keep latest per keyword+projectId
  const seen = new Map<string, typeof rows[0]>();
  for (const row of rows) {
    const key = `${row.projectId}:${row.keyword}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  return Array.from(seen.values());
}

/** Get rank history for a keyword across all projects (for time-series chart) */
export async function getKeywordRankTimeSeries(keyword: string, projectId?: number, days = 90) {
  const db = await getDb(); if (!db) return [];
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const conditions = [
    eq(rankTracking.keyword, keyword),
    gte(rankTracking.trackedAt, cutoff),
  ];
  if (projectId) conditions.push(eq(rankTracking.projectId, projectId));
  return db.select({
    position: rankTracking.position,
    trackedAt: rankTracking.trackedAt,
    projectId: rankTracking.projectId,
    searchEngine: rankTracking.searchEngine,
    country: rankTracking.country,
  }).from(rankTracking)
    .where(and(...conditions))
    .orderBy(asc(rankTracking.trackedAt))
    .limit(500);
}

/** Get dashboard summary stats across all projects */
export async function getRankDashboardStats() {
  const db = await getDb(); if (!db) return null;
  // Get all unique latest keywords
  const allRows = await db.select({
    keyword: rankTracking.keyword,
    projectId: rankTracking.projectId,
    position: rankTracking.position,
    previousPosition: rankTracking.previousPosition,
    trend: rankTracking.trend,
    trackedAt: rankTracking.trackedAt,
  }).from(rankTracking).orderBy(desc(rankTracking.trackedAt)).limit(5000);

  // Deduplicate to latest per keyword+project
  const seen = new Map<string, typeof allRows[0]>();
  for (const row of allRows) {
    const key = `${row.projectId}:${row.keyword}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  const latest = Array.from(seen.values());

  const ranked = latest.filter(r => r.position !== null && r.position > 0);
  const avgPos = ranked.length > 0
    ? Math.round(ranked.reduce((s, r) => s + (r.position || 0), 0) / ranked.length)
    : 0;

  return {
    totalKeywords: latest.length,
    rankedKeywords: ranked.length,
    notRanked: latest.length - ranked.length,
    avgPosition: avgPos,
    top3: ranked.filter(r => r.position! <= 3).length,
    top10: ranked.filter(r => r.position! <= 10).length,
    top20: ranked.filter(r => r.position! <= 20).length,
    top50: ranked.filter(r => r.position! <= 50).length,
    improved: latest.filter(r => r.trend === "rising").length,
    declined: latest.filter(r => r.trend === "falling").length,
    stable: latest.filter(r => r.trend === "stable").length,
    newKeywords: latest.filter(r => r.trend === "new").length,
  };
}

/** Delete a rank tracking entry */
export async function deleteRankEntry(id: number) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(rankTracking).where(eq(rankTracking.id, id));
}

/** Delete all rank entries for a keyword in a project */
export async function deleteKeywordFromProject(projectId: number, keyword: string) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.delete(rankTracking).where(
    and(eq(rankTracking.projectId, projectId), eq(rankTracking.keyword, keyword))
  );
}

// ═══ SEO Actions ═══
export async function addSeoAction(projectId: number, data: Partial<typeof seoActions.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(seoActions).values({ projectId, ...data } as any);
  return { id: Number(result[0].insertId) };
}

export async function getProjectActions(projectId: number, limit = 100) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(seoActions).where(eq(seoActions.projectId, projectId)).orderBy(desc(seoActions.createdAt)).limit(limit);
}

export async function updateSeoAction(id: number, data: Partial<typeof seoActions.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  await db.update(seoActions).set(data).where(eq(seoActions.id, id));
}

// ═══ SEO Snapshots ═══
export async function addSeoSnapshot(projectId: number, data: Partial<typeof seoSnapshots.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("DB not available");
  const result = await db.insert(seoSnapshots).values({ projectId, ...data } as any);
  return { id: Number(result[0].insertId) };
}

export async function getProjectSnapshots(projectId: number, limit = 90) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(seoSnapshots).where(eq(seoSnapshots.projectId, projectId)).orderBy(desc(seoSnapshots.snapshotDate)).limit(limit);
}


// ═══ Method Priority helpers ═══

export interface MethodPriorityConfig {
  id: string;
  enabled: boolean;
}

export async function getUserMethodPriority(userId: number): Promise<{ enabledMethods: string[]; fullConfig: MethodPriorityConfig[] } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(userMethodPriority).where(eq(userMethodPriority.userId, userId)).limit(1);
  if (rows.length === 0) return null;
  return {
    enabledMethods: rows[0].enabledMethods as string[],
    fullConfig: (rows[0].fullConfig as MethodPriorityConfig[]) || [],
  };
}

export async function saveUserMethodPriority(
  userId: number,
  enabledMethods: string[],
  fullConfig: MethodPriorityConfig[],
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if user already has a record
  const existing = await db.select({ id: userMethodPriority.id })
    .from(userMethodPriority)
    .where(eq(userMethodPriority.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    // Update existing record
    await db.update(userMethodPriority)
      .set({ enabledMethods, fullConfig })
      .where(eq(userMethodPriority.userId, userId));
  } else {
    // Insert new record
    await db.insert(userMethodPriority).values({
      userId,
      enabledMethods,
      fullConfig,
    });
  }
}

// ═══ AI Attack History helpers ═══

export async function saveAttackDecision(data: InsertAiAttackHistory): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(aiAttackHistory).values(data);
  } catch (error) {
    console.warn("[AI Attack History] Failed to save:", error);
  }
}

export async function getSuccessfulMethods(opts: {
  serverType?: string | null;
  cms?: string | null;
  language?: string | null;
  waf?: string | null;
  limit?: number;
}): Promise<Array<{
  method: string;
  bypassTechnique: string | null;
  payloadType: string | null;
  filename: string | null;
  uploadPath: string | null;
  contentType: string | null;
  httpMethod: string | null;
  serverType: string | null;
  cms: string | null;
  language: string | null;
  waf: string | null;
  successCount: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  try {
    const { sql, and, eq, count, desc } = await import("drizzle-orm");
    const conditions = [eq(aiAttackHistory.success, true)];
    if (opts.serverType) conditions.push(eq(aiAttackHistory.serverType, opts.serverType));
    if (opts.cms) conditions.push(eq(aiAttackHistory.cms, opts.cms));
    if (opts.language) conditions.push(eq(aiAttackHistory.language, opts.language));
    if (opts.waf) conditions.push(eq(aiAttackHistory.waf, opts.waf));

    const rows = await db
      .select({
        method: aiAttackHistory.method,
        bypassTechnique: aiAttackHistory.bypassTechnique,
        payloadType: aiAttackHistory.payloadType,
        filename: aiAttackHistory.filename,
        uploadPath: aiAttackHistory.uploadPath,
        contentType: aiAttackHistory.contentType,
        httpMethod: aiAttackHistory.httpMethod,
        serverType: aiAttackHistory.serverType,
        cms: aiAttackHistory.cms,
        language: aiAttackHistory.language,
        waf: aiAttackHistory.waf,
        successCount: count(aiAttackHistory.id),
      })
      .from(aiAttackHistory)
      .where(and(...conditions))
      .groupBy(
        aiAttackHistory.method,
        aiAttackHistory.bypassTechnique,
        aiAttackHistory.payloadType,
        aiAttackHistory.filename,
        aiAttackHistory.uploadPath,
        aiAttackHistory.contentType,
        aiAttackHistory.httpMethod,
        aiAttackHistory.serverType,
        aiAttackHistory.cms,
        aiAttackHistory.language,
        aiAttackHistory.waf,
      )
      .orderBy(desc(count(aiAttackHistory.id)))
      .limit(opts.limit || 20);

    return rows;
  } catch (error) {
    console.warn("[AI Attack History] Failed to query:", error);
    return [];
  }
}

export async function getAttackStats(): Promise<{
  totalAttempts: number;
  totalSuccess: number;
  successRate: number;
  topMethods: Array<{ method: string; count: number }>;
  topPlatforms: Array<{ platform: string; count: number }>;
}> {
  const db = await getDb();
  if (!db) return { totalAttempts: 0, totalSuccess: 0, successRate: 0, topMethods: [], topPlatforms: [] };
  try {
    const { count, eq, desc, sql } = await import("drizzle-orm");
    const [totalRow] = await db.select({ cnt: count() }).from(aiAttackHistory);
    const [successRow] = await db.select({ cnt: count() }).from(aiAttackHistory).where(eq(aiAttackHistory.success, true));
    const total = totalRow?.cnt || 0;
    const success = successRow?.cnt || 0;

    const topMethods = await db
      .select({ method: aiAttackHistory.method, cnt: count() })
      .from(aiAttackHistory)
      .where(eq(aiAttackHistory.success, true))
      .groupBy(aiAttackHistory.method)
      .orderBy(desc(count()))
      .limit(10);

    const topPlatforms = await db
      .select({ platform: aiAttackHistory.serverType, cnt: count() })
      .from(aiAttackHistory)
      .where(eq(aiAttackHistory.success, true))
      .groupBy(aiAttackHistory.serverType)
      .orderBy(desc(count()))
      .limit(10);

    return {
      totalAttempts: total,
      totalSuccess: success,
      successRate: total > 0 ? Math.round((success / total) * 100) : 0,
      topMethods: topMethods.map(r => ({ method: r.method, count: r.cnt })),
      topPlatforms: topPlatforms.map(r => ({ platform: r.platform || "unknown", count: r.cnt })),
    };
  } catch (error) {
    console.warn("[AI Attack History] Failed to get stats:", error);
    return { totalAttempts: 0, totalSuccess: 0, successRate: 0, topMethods: [], topPlatforms: [] };
  }
}


// ═══ SEO Agent Tasks ═══

export async function createAgentTask(
  projectId: number,
  userId: number,
  data: {
    taskType: InsertSEOAgentTask["taskType"];
    title: string;
    description?: string;
    priority?: number;
    dependsOn?: string[];
    scheduledFor?: Date;
    aiReasoning?: string;
    aiConfidence?: number;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(seoAgentTasks).values({
    projectId,
    userId,
    taskType: data.taskType,
    title: data.title,
    description: data.description || null,
    priority: data.priority || 5,
    dependsOn: data.dependsOn || [],
    scheduledFor: data.scheduledFor || null,
    aiReasoning: data.aiReasoning || null,
    aiConfidence: data.aiConfidence || null,
  }).$returningId();
  return result;
}

export async function getAgentTaskById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(seoAgentTasks).where(eq(seoAgentTasks.id, id)).limit(1);
  return rows[0] || null;
}

export async function updateAgentTask(id: number, data: Partial<typeof seoAgentTasks.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(seoAgentTasks).set(data).where(eq(seoAgentTasks.id, id));
}

export async function getPendingAgentTasks(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(seoAgentTasks)
    .where(
      and(
        eq(seoAgentTasks.projectId, projectId),
        eq(seoAgentTasks.status, "queued"),
        or(
          isNull(seoAgentTasks.scheduledFor),
          lte(seoAgentTasks.scheduledFor, new Date()),
        ),
      ),
    )
    .orderBy(asc(seoAgentTasks.priority), asc(seoAgentTasks.scheduledFor));
}

export async function getUpcomingAgentTasks(projectId: number, limit: number = 5) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(seoAgentTasks)
    .where(
      and(
        eq(seoAgentTasks.projectId, projectId),
        eq(seoAgentTasks.status, "queued"),
      ),
    )
    .orderBy(asc(seoAgentTasks.scheduledFor), asc(seoAgentTasks.priority))
    .limit(limit);
}

export async function getProjectAgentTasks(projectId: number, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(seoAgentTasks)
    .where(eq(seoAgentTasks.projectId, projectId))
    .orderBy(desc(seoAgentTasks.createdAt))
    .limit(limit);
}

export async function checkTaskDependencies(projectId: number, dependsOnTypes: string[]): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  for (const taskType of dependsOnTypes) {
    const completed = await db.select().from(seoAgentTasks)
      .where(
        and(
          eq(seoAgentTasks.projectId, projectId),
          eq(seoAgentTasks.taskType, taskType as any),
          eq(seoAgentTasks.status, "completed"),
        ),
      )
      .limit(1);
    if (completed.length === 0) return false;
  }
  return true;
}

export async function getAllActiveSeoProjects() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(seoProjects)
    .where(
      or(
        eq(seoProjects.status, "active"),
        eq(seoProjects.status, "analyzing"),
      ),
    )
    .orderBy(desc(seoProjects.updatedAt));
}

// ═══ SEO Content ═══

export async function createSeoContent(
  projectId: number,
  userId: number,
  data: {
    title: string;
    content: string;
    excerpt?: string;
    targetKeyword?: string;
    secondaryKeywords?: string[];
    metaTitle?: string;
    metaDescription?: string;
    wordCount?: number;
    seoScore?: number;
    readabilityScore?: number;
    aiModel?: string;
    aiPrompt?: string;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(seoContent).values({
    projectId,
    userId,
    title: data.title,
    content: data.content,
    excerpt: data.excerpt || null,
    targetKeyword: data.targetKeyword || null,
    secondaryKeywords: data.secondaryKeywords || [],
    metaTitle: data.metaTitle || null,
    metaDescription: data.metaDescription || null,
    wordCount: data.wordCount || 0,
    seoScore: data.seoScore || null,
    readabilityScore: data.readabilityScore || null,
    aiModel: data.aiModel || null,
    aiPrompt: data.aiPrompt || null,
  }).$returningId();
  return result;
}

export async function getUnpublishedContent(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(seoContent)
    .where(
      and(
        eq(seoContent.projectId, projectId),
        or(
          eq(seoContent.publishStatus, "draft"),
          eq(seoContent.publishStatus, "ready"),
        ),
      ),
    )
    .orderBy(asc(seoContent.createdAt))
    .limit(10);
}

export async function updateSeoContent(id: number, data: Partial<typeof seoContent.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(seoContent).set(data).where(eq(seoContent.id, id));
}

export async function getProjectContent(projectId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(seoContent)
    .where(eq(seoContent.projectId, projectId))
    .orderBy(desc(seoContent.createdAt))
    .limit(limit);
}

// ═══ User-scoped SEO Projects ═══

export async function getUserScopesSeoProjects(userId: number, isAdmin: boolean) {
  const db = await getDb();
  if (!db) return [];
  if (isAdmin) {
    // Admin sees all projects
    return db.select().from(seoProjects).orderBy(desc(seoProjects.updatedAt));
  }
  // Regular user sees only their own projects
  return db.select().from(seoProjects)
    .where(eq(seoProjects.userId, userId))
    .orderBy(desc(seoProjects.updatedAt));
}
