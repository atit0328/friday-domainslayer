/**
 * PBN Services — Health Check, Auto-Post, Expire Alerts, AI Metrics, Hot PBN Scorer
 */
import { fetchWithPoolProxy } from "./proxy-pool";
import { invokeLLM } from "./_core/llm";
import { sendTelegramNotification } from "./telegram-notifier";
import * as db from "./db";
import * as pbnBridge from "./pbn-bridge";
import { fetchDomainMetrics } from "./domain-metrics";

// Helper: wrap fetch with proxy pool
async function pbnFetch(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<Response> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout: 15000 });
  return response;
}


// ═══ 1. Bulk Health Check ═══
export interface HealthCheckResult {
  siteId: number;
  domain: string;
  online: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
  checkedAt: string;
}

export async function checkSiteHealth(site: { id: number; url: string; name: string }): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    const res = await pbnFetch(site.url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "FridayAI-PBN-Monitor/1.0" },
    });
    clearTimeout(timeout);
    const responseTimeMs = Date.now() - start;
    return {
      siteId: site.id,
      domain: site.name,
      online: res.status >= 200 && res.status < 500,
      statusCode: res.status,
      responseTimeMs,
      error: null,
      checkedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      siteId: site.id,
      domain: site.name,
      online: false,
      statusCode: null,
      responseTimeMs: Date.now() - start,
      error: err.message || "Connection failed",
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function bulkHealthCheck(userId: number): Promise<{
  total: number;
  online: number;
  offline: number;
  results: HealthCheckResult[];
}> {
  const sites = await db.getUserPbnSites(userId);
  if (!sites.length) return { total: 0, online: 0, offline: 0, results: [] };

  // Check in batches of 10 to avoid overwhelming
  const results: HealthCheckResult[] = [];
  const batchSize = 10;

  for (let i = 0; i < sites.length; i += batchSize) {
    const batch = sites.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(s => checkSiteHealth({ id: s.id, url: s.url, name: s.name }))
    );
    results.push(...batchResults);

    // Update each site status in DB
    for (const r of batchResults) {
      await db.updatePbnSite(r.siteId, {
        status: r.online ? "active" : "down",
        lastCheckedAt: new Date(),
      } as any);
    }
  }

  const online = results.filter(r => r.online).length;
  return {
    total: results.length,
    online,
    offline: results.length - online,
    results,
  };
}

// ═══ 2. Auto-Post Scheduler ═══
export interface AutoPostConfig {
  targetUrl: string;
  anchorText: string;
  keyword: string;
  niche: string;
  siteIds?: number[]; // specific sites, or empty for AI-selected
  count: number; // how many posts to create
  contentType?: string; // article, review, news, tutorial, listicle
  writingTone?: string; // professional, casual, academic, persuasive, storytelling
}

export interface AutoPostResult {
  totalPlanned: number;
  totalPosted: number;
  totalFailed: number;
  posts: {
    siteId: number;
    siteName: string;
    title: string;
    status: "published" | "failed" | "pending";
    wpPostUrl?: string;
    error?: string;
  }[];
}

export async function runAutoPost(userId: number, config: AutoPostConfig): Promise<AutoPostResult> {
  const allSites = await db.getUserPbnSites(userId);
  const activeSites = allSites.filter((s: any) => s.status === "active" && !s.isBanned);

  // Select sites: either specified or AI-selected top sites
  let selectedSites: any[];
  if (config.siteIds && config.siteIds.length > 0) {
    selectedSites = activeSites.filter((s: any) => config.siteIds!.includes(s.id));
  } else {
    // Sort by DA desc, pick top N
    selectedSites = [...activeSites]
      .sort((a: any, b: any) => (b.da || 0) - (a.da || 0))
      .slice(0, config.count);
  }

  const posts: AutoPostResult["posts"] = [];

  for (const site of selectedSites) {
    try {
      // Generate content with content type and writing tone
      const { title, content, excerpt } = await pbnBridge.generatePBNContent(
        config.targetUrl, config.anchorText, config.keyword, config.niche, site.name,
        config.contentType || "article", config.writingTone || "professional",
      );

      // Save post record
      await db.addPbnPost({
        siteId: site.id,
        title,
        content,
        targetUrl: config.targetUrl,
        anchorText: config.anchorText,
        keyword: config.keyword,
        status: "pending",
      });

      // Post to WordPress
      const wpResult = await pbnBridge.postToWordPress(
        site.url, site.username, site.appPassword, title, content, excerpt,
      );

      if (wpResult.success) {
        await db.updatePbnSite(site.id, {
          lastPost: new Date(),
          postCount: (site.postCount || 0) + 1,
        });
        posts.push({
          siteId: site.id,
          siteName: site.name,
          title,
          status: "published",
          wpPostUrl: wpResult.wpPostUrl,
        });
      } else {
        posts.push({
          siteId: site.id,
          siteName: site.name,
          title,
          status: "failed",
          error: wpResult.error,
        });
      }
    } catch (err: any) {
      posts.push({
        siteId: site.id,
        siteName: site.name,
        title: "Error generating content",
        status: "failed",
        error: err.message,
      });
    }
  }

  return {
    totalPlanned: selectedSites.length,
    totalPosted: posts.filter(p => p.status === "published").length,
    totalFailed: posts.filter(p => p.status === "failed").length,
    posts,
  };
}

// ═══ 3. Expire Alert System ═══
export interface ExpireAlert {
  siteId: number;
  domain: string;
  expireDate: string;
  daysLeft: number;
  urgency: "critical" | "warning" | "notice";
  registrar?: string;
}

export async function checkExpireAlerts(userId: number): Promise<{
  alerts: ExpireAlert[];
  critical: number;
  warning: number;
  notice: number;
}> {
  const sites = await db.getUserPbnSites(userId);
  const alerts: ExpireAlert[] = [];
  const now = new Date();

  for (const site of sites as any[]) {
    if (!site.expireDate) continue;
    try {
      const expire = new Date(site.expireDate);
      const diff = expire.getTime() - now.getTime();
      const daysLeft = Math.ceil(diff / (24 * 60 * 60 * 1000));

      if (daysLeft <= 30) {
        let urgency: ExpireAlert["urgency"] = "notice";
        if (daysLeft <= 0) urgency = "critical";
        else if (daysLeft <= 7) urgency = "critical";
        else if (daysLeft <= 14) urgency = "warning";

        alerts.push({
          siteId: site.id,
          domain: site.name,
          expireDate: site.expireDate,
          daysLeft: Math.max(0, daysLeft),
          urgency,
          registrar: site.domainRegistrar,
        });
      }
    } catch {}
  }

  // Sort by urgency (critical first) then daysLeft
  alerts.sort((a, b) => {
    const urgencyOrder = { critical: 0, warning: 1, notice: 2 };
    if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    }
    return a.daysLeft - b.daysLeft;
  });

  return {
    alerts,
    critical: alerts.filter(a => a.urgency === "critical").length,
    warning: alerts.filter(a => a.urgency === "warning").length,
    notice: alerts.filter(a => a.urgency === "notice").length,
  };
}

export async function sendExpireNotifications(userId: number): Promise<{ sent: number }> {
  const { alerts, critical, warning } = await checkExpireAlerts(userId);
  if (alerts.length === 0) return { sent: 0 };

  const criticalList = alerts.filter(a => a.urgency === "critical")
    .map(a => `🔴 ${a.domain} — ${a.daysLeft === 0 ? "EXPIRED!" : `${a.daysLeft} days left`} (${a.registrar || "Unknown registrar"})`)
    .join("\n");

  const warningList = alerts.filter(a => a.urgency === "warning")
    .map(a => `🟡 ${a.domain} — ${a.daysLeft} days left (${a.registrar || "Unknown registrar"})`)
    .join("\n");

  const noticeList = alerts.filter(a => a.urgency === "notice")
    .map(a => `🟢 ${a.domain} — ${a.daysLeft} days left`)
    .join("\n");

  let content = `PBN Domain Expiry Alert\n\n`;
  if (criticalList) content += `⚠️ CRITICAL (${critical}):\n${criticalList}\n\n`;
  if (warningList) content += `⏰ WARNING (${warning}):\n${warningList}\n\n`;
  if (noticeList) content += `📋 NOTICE:\n${noticeList}\n`;

  await sendTelegramNotification({
    type: critical > 0 ? "failure" : "partial",
    targetUrl: "PBN Network",
    details: `🔔 PBN Expire Alert: ${critical} critical, ${warning} warning\n${content}`,
    errors: criticalList ? [`${critical} domains expiring soon`] : [],
  });

  return { sent: alerts.length };
}

// ═══ 4. AI Auto-Update Metrics ═══
export interface MetricsUpdateResult {
  siteId: number;
  domain: string;
  oldMetrics: { da: number | null; dr: number | null; pa: number | null; spamScore: number | null };
  newMetrics: { da: number; dr: number; pa: number; spamScore: number; backlinks: number; referringDomains: number };
  changes: { da: number; dr: number; pa: number; spamScore: number };
  updatedAt: string;
}

export async function aiUpdateMetrics(userId: number, siteIds?: number[]): Promise<{
  total: number;
  updated: number;
  results: MetricsUpdateResult[];
}> {
  const allSites = await db.getUserPbnSites(userId);
  const sites = siteIds
    ? allSites.filter((s: any) => siteIds.includes(s.id))
    : allSites;

  if (!sites.length) return { total: 0, updated: 0, results: [] };

  // Process each site using REAL API data (Moz + Ahrefs + SimilarWeb)
  const results: MetricsUpdateResult[] = [];

  for (const site of sites as any[]) {
    const domain = site.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    
    try {
      console.log(`[PBN Metrics] Fetching real API data for ${domain}...`);
      const metrics = await fetchDomainMetrics(domain);

      const oldMetrics = {
        da: site.da,
        dr: site.dr,
        pa: site.pa,
        spamScore: site.spamScore,
      };

      const newMetrics = {
        da: metrics.da,
        dr: metrics.dr,
        pa: metrics.pa,
        spamScore: metrics.ss,
        backlinks: metrics.bl,
        referringDomains: metrics.rf,
      };

      // Update in DB with real API values
      await db.updatePbnSite(site.id, {
        da: metrics.da,
        dr: metrics.dr,
        pa: metrics.pa,
        spamScore: metrics.ss,
        lastCheckedAt: new Date(),
      } as any);

      console.log(`[PBN Metrics] ${domain}: DA=${metrics.da} (${metrics.dataSources.moz ? 'Moz' : 'est'}) DR=${metrics.dr} SS=${metrics.ss} BL=${metrics.bl}`);

      results.push({
        siteId: site.id,
        domain: site.name,
        oldMetrics,
        newMetrics,
        changes: {
          da: metrics.da - (site.da || 0),
          dr: metrics.dr - (site.dr || 0),
          pa: metrics.pa - (site.pa || 0),
          spamScore: metrics.ss - (site.spamScore || 0),
        },
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn(`[PBN Metrics] Failed for ${domain}:`, err.message);
      results.push({
        siteId: site.id,
        domain: site.name,
        oldMetrics: { da: site.da, dr: site.dr, pa: site.pa, spamScore: site.spamScore },
        newMetrics: { da: site.da || 0, dr: site.dr || 0, pa: site.pa || 0, spamScore: site.spamScore || 0, backlinks: 0, referringDomains: 0 },
        changes: { da: 0, dr: 0, pa: 0, spamScore: 0 },
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return {
    total: sites.length,
    updated: results.filter(r => r.changes.da !== 0 || r.changes.dr !== 0).length,
    results,
  };
}

// ═══ 5. Hot PBN Scorer (Star Rating) ═══
export interface HotPBNScore {
  siteId: number;
  domain: string;
  url: string;
  stars: number; // 1-5
  score: number; // 0-100
  reasons: string[];
  metrics: {
    da: number;
    dr: number;
    pa: number;
    spamScore: number;
    age: string | null;
    postCount: number;
    isOnline: boolean;
  };
  badges: string[]; // e.g., "High DA", "Low Spam", "Fresh Content", "Aged Domain"
}

export function calculateHotScore(site: any): HotPBNScore {
  let score = 0;
  const reasons: string[] = [];
  const badges: string[] = [];

  // DA Score (0-25 points)
  const da = site.da || 0;
  if (da >= 40) { score += 25; reasons.push(`Excellent DA (${da})`); badges.push("🏆 High DA"); }
  else if (da >= 25) { score += 18; reasons.push(`Good DA (${da})`); badges.push("💪 Good DA"); }
  else if (da >= 15) { score += 12; reasons.push(`Moderate DA (${da})`); }
  else if (da >= 5) { score += 5; reasons.push(`Low DA (${da})`); }

  // DR Score (0-20 points)
  const dr = site.dr || 0;
  if (dr >= 40) { score += 20; reasons.push(`Excellent DR (${dr})`); badges.push("⭐ High DR"); }
  else if (dr >= 25) { score += 14; reasons.push(`Good DR (${dr})`); }
  else if (dr >= 10) { score += 8; reasons.push(`Moderate DR (${dr})`); }

  // Spam Score (0-20 points, lower is better)
  const ss = site.spamScore ?? 10;
  if (ss <= 3) { score += 20; reasons.push(`Ultra-clean spam score (${ss}%)`); badges.push("🛡️ Ultra Clean"); }
  else if (ss <= 8) { score += 16; reasons.push(`Clean spam score (${ss}%)`); badges.push("✅ Clean"); }
  else if (ss <= 15) { score += 10; reasons.push(`Acceptable spam score (${ss}%)`); }
  else if (ss <= 25) { score += 4; reasons.push(`Elevated spam score (${ss}%)`); }
  else { reasons.push(`High spam score (${ss}%) — risky`); badges.push("⚠️ High Spam"); }

  // Domain Age (0-15 points)
  const age = site.domainAge;
  if (age) {
    const ageNum = parseInt(age);
    if (ageNum >= 10) { score += 15; reasons.push(`Aged domain (${age})`); badges.push("🏛️ Aged Domain"); }
    else if (ageNum >= 5) { score += 10; reasons.push(`Mature domain (${age})`); }
    else if (ageNum >= 2) { score += 5; reasons.push(`Young domain (${age})`); }
  }

  // Activity (0-10 points)
  const postCount = site.postCount || 0;
  if (postCount >= 20) { score += 10; reasons.push(`Active content (${postCount} posts)`); badges.push("📝 Active"); }
  else if (postCount >= 5) { score += 6; reasons.push(`Some content (${postCount} posts)`); }
  else if (postCount >= 1) { score += 3; reasons.push(`Minimal content (${postCount} posts)`); }

  // Online Status (0-10 points)
  const isOnline = site.status === "active";
  if (isOnline) { score += 10; reasons.push("Site is online and responsive"); }
  else { reasons.push("Site may be offline"); badges.push("🔴 Offline"); }

  // Calculate stars (1-5)
  let stars = 1;
  if (score >= 80) stars = 5;
  else if (score >= 60) stars = 4;
  else if (score >= 40) stars = 3;
  else if (score >= 20) stars = 2;

  return {
    siteId: site.id,
    domain: site.name,
    url: site.url,
    stars,
    score,
    reasons,
    metrics: {
      da,
      dr,
      pa: site.pa || 0,
      spamScore: ss,
      age: site.domainAge,
      postCount,
      isOnline,
    },
    badges,
  };
}

export async function getHotPBNRanking(userId: number): Promise<{
  hotSites: HotPBNScore[];
  totalSites: number;
  avg5Star: number;
  avg4Star: number;
  avgScore: number;
}> {
  const sites = await db.getUserPbnSites(userId);
  const scored = (sites as any[]).map(s => calculateHotScore(s));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const avg5 = scored.filter(s => s.stars === 5).length;
  const avg4 = scored.filter(s => s.stars >= 4).length;
  const avgScore = scored.length > 0
    ? Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length)
    : 0;

  return {
    hotSites: scored,
    totalSites: scored.length,
    avg5Star: avg5,
    avg4Star: avg4,
    avgScore,
  };
}
