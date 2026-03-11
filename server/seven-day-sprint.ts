/**
 * 7-Day Sprint Orchestrator
 * 
 * Master coordinator that runs a 7-day aggressive SEO campaign:
 * 
 * Day 1: LAUNCH
 *   - Find low-competition keywords (AI Keyword Sniper)
 *   - Create keyword clusters
 *   - Deploy initial parasite content (10-20 articles)
 *   - Build Google Entity Stack
 *   - Start aggressive link building (Tier 1: 15 links)
 *   - Rapid index everything
 *   - Telegram notification: "Sprint started"
 * 
 * Day 2: PEAK VELOCITY
 *   - Deploy more parasite content (20-30 articles)
 *   - Peak link building (Tier 1: 20, Tier 2: 40, Tier 3: 60)
 *   - Check initial indexing status
 *   - Rapid index new content
 * 
 * Day 3: SUSTAINED PUSH
 *   - Continue parasite deployment (15-20 articles)
 *   - Sustained link building
 *   - First rank check
 *   - Adjust strategy based on results
 * 
 * Day 4-5: OPTIMIZATION
 *   - Check rankings, adjust velocity
 *   - Focus on keywords showing movement
 *   - Reduce velocity to natural levels
 *   - Build Tier 2 links to boost Tier 1
 * 
 * Day 6-7: CONSOLIDATION
 *   - Final rank checks
 *   - Maintenance link building
 *   - Report results
 *   - Telegram: "Sprint complete — results"
 */

import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import {
  findLowCompetitionKeywords,
  clusterKeywords,
  generateVelocityPlan,
  calculatePlanTotals,
  adjustVelocityPlan,
  getDayPlan,
  selectAnchorText,
  type KeywordOpportunity,
  type KeywordCluster,
  type LinkVelocityPlan,
  type SniperCampaign,
} from "./keyword-sniper-engine";
import {
  rapidIndexUrl,
  rapidIndexBulk,
  type IndexingRequest,
} from "./rapid-indexing-engine";
import {
  executeParasiteBlitz,
  deployTelegraphBlitz,
  createEntityStack,
  type BlitzCampaign,
  type ParasiteDeployment,
} from "./parasite-seo-blitz";
import {
  runExternalBuildSession,
  type BacklinkBuildRequest,
  type BacklinkBuildResult,
} from "./external-backlink-builder";
import * as serpTracker from "./serp-tracker";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface SprintConfig {
  domain: string;
  targetUrl: string;
  niche: string;
  seedKeywords: string[];
  language: string;
  aggressiveness: "extreme" | "aggressive" | "moderate";
  maxKeywords: number;
  telegraphPerKeyword: number;
  enableEntityStack: boolean;
  enableBacklinks: boolean;
  enableParasite: boolean;
  enableRankTracking: boolean;
  telegramNotify: boolean;
}

export interface SprintState {
  id: string;
  config: SprintConfig;
  status: "initializing" | "day1" | "day2" | "day3" | "day4" | "day5" | "day6" | "day7" | "completed" | "paused" | "failed";
  currentDay: number;
  startedAt: Date;
  keywords: KeywordOpportunity[];
  clusters: KeywordCluster[];
  velocityPlan: LinkVelocityPlan[];
  parasiteDeployments: ParasiteDeployment[];
  entityStackUrls: string[];
  backlinksBuilt: { tier1: number; tier2: number; tier3: number };
  rankSnapshots: RankSnapshot[];
  dailyReports: DailyReport[];
  totalContentDeployed: number;
  totalLinksBuilt: number;
  bestRankAchieved: { keyword: string; position: number } | null;
  firstPageKeywords: string[];
}

export interface RankSnapshot {
  day: number;
  keyword: string;
  position: number | null;
  previousPosition: number | null;
  change: number;
  checkedAt: Date;
}

export interface DailyReport {
  day: number;
  contentDeployed: number;
  linksBuilt: { tier1: number; tier2: number; tier3: number };
  pagesIndexed: number;
  rankChanges: { keyword: string; from: number | null; to: number | null; change: number }[];
  adjustments: string[];
  completedAt: Date;
}

// ═══════════════════════════════════════════════
//  SPRINT STATE MANAGEMENT
// ═══════════════════════════════════════════════

const activeSprintStates = new Map<string, SprintState>();

export function getActiveSprints(): SprintState[] {
  return Array.from(activeSprintStates.values());
}

export function getSprintState(sprintId: string): SprintState | null {
  return activeSprintStates.get(sprintId) || null;
}

// ═══════════════════════════════════════════════
//  SPRINT INITIALIZATION
// ═══════════════════════════════════════════════

/**
 * Initialize a new 7-day sprint campaign
 */
export async function initializeSprint(config: SprintConfig): Promise<SprintState> {
  const sprintId = `sprint_${Date.now().toString(36)}`;
  
  console.log(`[7DaySprint] Initializing sprint ${sprintId} for ${config.domain}`);
  console.log(`[7DaySprint] Niche: ${config.niche}, Seeds: ${config.seedKeywords.join(", ")}`);
  
  // Step 1: Find low-competition keywords
  const keywords = await findLowCompetitionKeywords(
    config.domain,
    config.niche,
    config.seedKeywords,
    config.language,
    config.maxKeywords
  );
  
  // Step 2: Cluster keywords
  const clusters = await clusterKeywords(keywords);
  
  // Step 3: Generate velocity plan
  const primaryKw = keywords[0] || { keyword: config.seedKeywords[0], difficulty: 30 };
  const velocityPlan = generateVelocityPlan(
    primaryKw.keyword,
    primaryKw.difficulty,
    config.aggressiveness
  );
  
  const state: SprintState = {
    id: sprintId,
    config,
    status: "initializing",
    currentDay: 0,
    startedAt: new Date(),
    keywords,
    clusters,
    velocityPlan,
    parasiteDeployments: [],
    entityStackUrls: [],
    backlinksBuilt: { tier1: 0, tier2: 0, tier3: 0 },
    rankSnapshots: [],
    dailyReports: [],
    totalContentDeployed: 0,
    totalLinksBuilt: 0,
    bestRankAchieved: null,
    firstPageKeywords: [],
  };
  
  activeSprintStates.set(sprintId, state);
  
  const totals = calculatePlanTotals(velocityPlan);
  console.log(`[7DaySprint] Sprint initialized:
  - Keywords: ${keywords.length}
  - Clusters: ${clusters.length}
  - Total links planned: ${totals.grandTotal}
  - Peak day: Day ${totals.peakDay} (${totals.peakLinks} links)`);
  
  // Send Telegram notification
  if (config.telegramNotify) {
    await sendSprintTelegram(
      `🚀 7-Day Sprint Started`,
      `Domain: ${config.domain}
Keywords: ${keywords.length} (${keywords.slice(0, 5).map(k => k.keyword).join(", ")}${keywords.length > 5 ? "..." : ""})
Clusters: ${clusters.length}
Total links planned: ${totals.grandTotal}
Aggressiveness: ${config.aggressiveness}
Sprint ID: ${sprintId}`
    );
  }
  
  return state;
}

// ═══════════════════════════════════════════════
//  DAILY EXECUTION
// ═══════════════════════════════════════════════

/**
 * Execute a specific day of the sprint
 */
export async function executeSprintDay(sprintId: string, dayNumber?: number): Promise<DailyReport> {
  const state = activeSprintStates.get(sprintId);
  if (!state) throw new Error(`Sprint ${sprintId} not found`);
  
  const day = dayNumber || state.currentDay + 1;
  if (day < 1 || day > 7) throw new Error(`Invalid day: ${day}`);
  
  state.currentDay = day;
  state.status = `day${day}` as any;
  
  console.log(`[7DaySprint] ═══ DAY ${day}/7 ═══ Sprint: ${sprintId}`);
  
  const dayPlan = getDayPlan({ velocityPlan: state.velocityPlan } as SniperCampaign, day);
  if (!dayPlan) throw new Error(`No plan for day ${day}`);
  
  const report: DailyReport = {
    day,
    contentDeployed: 0,
    linksBuilt: { tier1: 0, tier2: 0, tier3: 0 },
    pagesIndexed: 0,
    rankChanges: [],
    adjustments: [],
    completedAt: new Date(),
  };
  
  const activeKeywords = state.keywords.slice(0, state.config.maxKeywords);
  
  // ═══ PHASE 1: Content Deployment ═══
  if (state.config.enableParasite && (day <= 3)) {
    console.log(`[7DaySprint] Phase 1: Parasite content deployment...`);
    
    const articlesPerKeyword = day === 1 ? 5 : day === 2 ? 8 : 5;
    
    for (const kw of activeKeywords.slice(0, day === 2 ? activeKeywords.length : 5)) {
      try {
        const deployments = await deployTelegraphBlitz(
          kw.keyword,
          state.config.targetUrl,
          state.config.domain,
          articlesPerKeyword,
          state.config.language
        );
        state.parasiteDeployments.push(...deployments);
        report.contentDeployed += deployments.length;
        state.totalContentDeployed += deployments.length;
      } catch (err: any) {
        console.error(`[7DaySprint] Parasite deploy failed for "${kw.keyword}":`, err.message);
      }
    }
  }
  
  // ═══ PHASE 2: Entity Stacking (Day 1 only) ═══
  if (state.config.enableEntityStack && day === 1) {
    console.log(`[7DaySprint] Phase 2: Google Entity Stacking...`);
    try {
      const entityStack = await createEntityStack(
        state.config.domain,
        state.config.domain,
        activeKeywords.map(k => k.keyword),
        state.config.targetUrl,
        state.config.language
      );
      state.entityStackUrls = entityStack.map(e => e.url);
      report.contentDeployed += entityStack.length;
    } catch (err: any) {
      console.error(`[7DaySprint] Entity stacking failed:`, err.message);
    }
  }
  
  // ═══ PHASE 3: Link Building ═══
  if (state.config.enableBacklinks) {
    console.log(`[7DaySprint] Phase 3: Link building (T1: ${dayPlan.tier1Links}, T2: ${dayPlan.tier2Links}, T3: ${dayPlan.tier3Links})...`);
    
    // Build Tier 1 links
    const tier1Built = await buildTierLinks(
      state.config.targetUrl,
      state.config.domain,
      activeKeywords.map(k => k.keyword),
      dayPlan.tier1Links,
      dayPlan.tier1Types,
      dayPlan.anchorDistribution,
      1
    );
    report.linksBuilt.tier1 = tier1Built;
    state.backlinksBuilt.tier1 += tier1Built;
    
    // Build Tier 2 links (pointing to parasite pages and entity stack)
    const tier1Urls = state.parasiteDeployments
      .filter(p => p.status === "deployed")
      .map(p => p.url)
      .slice(-20);
    
    if (tier1Urls.length > 0) {
      const tier2Built = await buildTierLinks(
        tier1Urls[Math.floor(Math.random() * tier1Urls.length)],
        "telegra.ph",
        activeKeywords.map(k => k.keyword),
        dayPlan.tier2Links,
        dayPlan.tier2Types,
        dayPlan.anchorDistribution,
        2
      );
      report.linksBuilt.tier2 = tier2Built;
      state.backlinksBuilt.tier2 += tier2Built;
    }
    
    state.totalLinksBuilt += report.linksBuilt.tier1 + report.linksBuilt.tier2 + report.linksBuilt.tier3;
  }
  
  // ═══ PHASE 4: Rapid Indexing ═══
  console.log(`[7DaySprint] Phase 4: Rapid indexing...`);
  const urlsToIndex: IndexingRequest[] = [];
  
  // Index new parasite pages
  const newDeployments = state.parasiteDeployments.slice(-report.contentDeployed);
  for (const dep of newDeployments) {
    urlsToIndex.push({
      url: dep.url,
      domain: "telegra.ph",
      keywords: [dep.keyword],
      priority: day <= 2 ? "critical" : "high",
    });
  }
  
  // Index target URL
  urlsToIndex.push({
    url: state.config.targetUrl,
    domain: state.config.domain,
    keywords: activeKeywords.map(k => k.keyword),
    priority: "critical",
  });
  
  if (urlsToIndex.length > 0) {
    try {
      const indexReport = await rapidIndexBulk(urlsToIndex.slice(0, 50));
      report.pagesIndexed = indexReport.successCount;
    } catch (err: any) {
      console.error(`[7DaySprint] Indexing failed:`, err.message);
    }
  }
  
  // ═══ PHASE 4.5: CTR Manipulation (Day 2+) ═══
  if (day >= 2) {
    console.log(`[7DaySprint] Phase 4.5: CTR Manipulation...`);
    try {
      const { executeCTRDay, initializeCTRCampaign, getCTRCampaignState } = await import("./ctr-manipulation-engine");
      const ctrCampaignId = `ctr_sprint_${sprintId}`;
      let ctrState = getCTRCampaignState(ctrCampaignId);
      if (!ctrState) {
        ctrState = await initializeCTRCampaign({
          domain: state.config.domain,
          targetUrl: state.config.targetUrl,
          targetKeywords: activeKeywords.map(k => k.keyword),
          niche: state.config.niche,
          language: state.config.language,
          platforms: ["reddit", "twitter", "pinterest", "quora", "linkedin"],
          dailyPostLimit: state.config.aggressiveness === "extreme" ? 15 : state.config.aggressiveness === "aggressive" ? 10 : 5,
          aggressiveness: state.config.aggressiveness,
          enableViralHooks: true,
          enableCommunitySeeding: true,
          enableBrandedSearch: true,
          enableContentRepurposing: true,
        });
      }
      const ctrReport = await executeCTRDay(ctrState.id, day - 1);
      console.log(`[7DaySprint] CTR: ${ctrReport.postsDeployed} posts deployed, ~${ctrReport.estimatedClicks} clicks`);
    } catch (err: any) {
      console.error(`[7DaySprint] CTR manipulation failed:`, err.message);
    }
  }

  // ═══ PHASE 5: Rank Tracking (Day 3+) ═══
  if (state.config.enableRankTracking && day >= 3) {
    console.log(`[7DaySprint] Phase 5: Rank tracking...`);
    
    for (const kw of activeKeywords.slice(0, 10)) {
      try {
        const rankResult = await serpTracker.checkKeywordRank(
          state.config.domain,
          kw.keyword,
          state.config.language === "th" ? "TH" : "US"
        );
        
        const prevSnapshot = state.rankSnapshots
          .filter(s => s.keyword === kw.keyword)
          .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())[0];
        
        const snapshot: RankSnapshot = {
          day,
          keyword: kw.keyword,
          position: rankResult.position,
          previousPosition: prevSnapshot?.position || null,
          change: prevSnapshot?.position && rankResult.position
            ? prevSnapshot.position - rankResult.position // positive = improved
            : 0,
          checkedAt: new Date(),
        };
        
        state.rankSnapshots.push(snapshot);
        report.rankChanges.push({
          keyword: kw.keyword,
          from: prevSnapshot?.position || null,
          to: rankResult.position,
          change: snapshot.change,
        });
        
        // Track best rank
        if (rankResult.position !== null) {
          if (!state.bestRankAchieved || rankResult.position < state.bestRankAchieved.position) {
            state.bestRankAchieved = { keyword: kw.keyword, position: rankResult.position };
          }
          
          // Track first page keywords
          if (rankResult.position <= 10 && !state.firstPageKeywords.includes(kw.keyword)) {
            state.firstPageKeywords.push(kw.keyword);
          }
        }
      } catch (err: any) {
        console.error(`[7DaySprint] Rank check failed for "${kw.keyword}":`, err.message);
      }
    }
    
    // ═══ PHASE 6: Adaptive Adjustment (Day 4+) ═══
    if (day >= 4) {
      console.log(`[7DaySprint] Phase 6: Adaptive velocity adjustment...`);
      
      const avgChange = report.rankChanges.length > 0
        ? report.rankChanges.reduce((sum, r) => sum + r.change, 0) / report.rankChanges.length
        : 0;
      
      const bestPosition = report.rankChanges
        .filter(r => r.to !== null)
        .sort((a, b) => (a.to || 100) - (b.to || 100))[0];
      
      const { adjustment, reason } = await adjustVelocityPlan(
        state.velocityPlan,
        day,
        avgChange,
        bestPosition?.to || null,
        activeKeywords[0]?.keyword || "",
        state.config.domain
      );
      
      report.adjustments.push(`${adjustment}: ${reason}`);
    }
  }
  
  report.completedAt = new Date();
  state.dailyReports.push(report);
  
  // ═══ Telegram Report ═══
  if (state.config.telegramNotify) {
    const hasFirstPage = state.firstPageKeywords.length > 0;
    const rankSummary = report.rankChanges
      .filter(r => r.to !== null)
      .map(r => `  ${r.keyword}: #${r.to}${r.change > 0 ? ` (↑${r.change})` : r.change < 0 ? ` (↓${Math.abs(r.change)})` : ""}`)
      .join("\n");
    
    await sendSprintTelegram(
      hasFirstPage ? `🏆 Day ${day}/7 — FIRST PAGE ACHIEVED!` : `📊 Day ${day}/7 Sprint Report`,
      `Domain: ${state.config.domain}
Content deployed: ${report.contentDeployed}
Links built: T1=${report.linksBuilt.tier1}, T2=${report.linksBuilt.tier2}
Pages indexed: ${report.pagesIndexed}
${rankSummary ? `\nRankings:\n${rankSummary}` : ""}
${state.firstPageKeywords.length > 0 ? `\n🏆 First page keywords: ${state.firstPageKeywords.join(", ")}` : ""}
${report.adjustments.length > 0 ? `\nAdjustments: ${report.adjustments.join("; ")}` : ""}
Total links: ${state.totalLinksBuilt} | Total content: ${state.totalContentDeployed}`
    );
  }
  
  // Check if sprint is complete
  if (day === 7) {
    state.status = "completed";
    await generateFinalReport(state);
  }
  
  console.log(`[7DaySprint] Day ${day} complete:
  - Content: ${report.contentDeployed}
  - Links: T1=${report.linksBuilt.tier1}, T2=${report.linksBuilt.tier2}
  - Indexed: ${report.pagesIndexed}
  - Rank changes: ${report.rankChanges.length}
  - First page keywords: ${state.firstPageKeywords.length}`);
  
  return report;
}

// ═══════════════════════════════════════════════
//  AUTO-RUN: Execute all 7 days sequentially
// ═══════════════════════════════════════════════

/**
 * Run the full 7-day sprint (called by orchestrator daily)
 */
export async function runNextSprintDay(sprintId: string): Promise<DailyReport | null> {
  const state = activeSprintStates.get(sprintId);
  if (!state) return null;
  if (state.status === "completed" || state.status === "failed") return null;
  
  const nextDay = state.currentDay + 1;
  if (nextDay > 7) {
    state.status = "completed";
    return null;
  }
  
  try {
    return await executeSprintDay(sprintId, nextDay);
  } catch (err: any) {
    console.error(`[7DaySprint] Day ${nextDay} execution failed:`, err.message);
    state.status = "failed";
    return null;
  }
}

/**
 * Quick start: Initialize and run Day 1 immediately
 */
export async function quickStartSprint(config: SprintConfig): Promise<{ state: SprintState; day1Report: DailyReport }> {
  const state = await initializeSprint(config);
  const day1Report = await executeSprintDay(state.id, 1);
  return { state, day1Report };
}

// ═══════════════════════════════════════════════
//  ORCHESTRATOR INTEGRATION
// ═══════════════════════════════════════════════

/**
 * Called by the main orchestrator to advance all active sprints
 */
export async function orchestratorTick(): Promise<{
  sprintsProcessed: number;
  reportsGenerated: DailyReport[];
}> {
  const reports: DailyReport[] = [];
  let processed = 0;
  
  for (const [sprintId, state] of Array.from(activeSprintStates.entries())) {
    if (state.status === "completed" || state.status === "failed" || state.status === "paused") {
      continue;
    }
    
    // Check if enough time has passed since last day (at least 20 hours)
    const lastReport = state.dailyReports[state.dailyReports.length - 1];
    if (lastReport) {
      const hoursSinceLastDay = (Date.now() - lastReport.completedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastDay < 20) {
        console.log(`[7DaySprint] Sprint ${sprintId}: Only ${hoursSinceLastDay.toFixed(1)}h since last day, skipping`);
        continue;
      }
    }
    
    const report = await runNextSprintDay(sprintId);
    if (report) {
      reports.push(report);
    }
    processed++;
  }
  
  return { sprintsProcessed: processed, reportsGenerated: reports };
}

// ═══════════════════════════════════════════════
//  FINAL REPORT
// ═══════════════════════════════════════════════

async function generateFinalReport(state: SprintState): Promise<void> {
  console.log(`[7DaySprint] Generating final report for sprint ${state.id}...`);
  
  const totalDays = state.dailyReports.length;
  const totalContent = state.totalContentDeployed;
  const totalLinks = state.totalLinksBuilt;
  const firstPageCount = state.firstPageKeywords.length;
  
  // Get final rankings
  const finalRanks = state.rankSnapshots
    .filter(s => s.day === state.currentDay)
    .sort((a, b) => (a.position || 100) - (b.position || 100));
  
  const rankSummary = finalRanks
    .map(r => `  ${r.keyword}: #${r.position || "N/A"}${r.change > 0 ? ` (↑${r.change})` : ""}`)
    .join("\n");
  
  if (state.config.telegramNotify) {
    await sendSprintTelegram(
      firstPageCount > 0 ? `🏆 Sprint Complete — ${firstPageCount} Keywords on Page 1!` : `📊 Sprint Complete — 7 Days`,
      `Domain: ${state.config.domain}
Sprint ID: ${state.id}

📈 Results:
- Days executed: ${totalDays}
- Content deployed: ${totalContent}
- Links built: ${totalLinks} (T1: ${state.backlinksBuilt.tier1}, T2: ${state.backlinksBuilt.tier2}, T3: ${state.backlinksBuilt.tier3})
- Entity stack: ${state.entityStackUrls.length} items
- Parasite pages: ${state.parasiteDeployments.length}

🎯 Rankings:
${rankSummary || "  No rank data available"}

${firstPageCount > 0 ? `🏆 First Page Keywords (${firstPageCount}): ${state.firstPageKeywords.join(", ")}` : "⚠️ No keywords reached page 1 yet — consider extending sprint"}
${state.bestRankAchieved ? `\n🥇 Best rank: "${state.bestRankAchieved.keyword}" at #${state.bestRankAchieved.position}` : ""}`
    );
  }
}

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

async function buildTierLinks(
  targetUrl: string,
  domain: string,
  keywords: string[],
  count: number,
  types: string[],
  anchorDist: { exact: number; partial: number; branded: number; generic: number; naked: number },
  tier: number
): Promise<number> {
  let built = 0;
  const primaryKeyword = keywords[0] || domain;
  
  // Use external backlink builder for each link
  for (let i = 0; i < count; i++) {
    const keyword = keywords[i % keywords.length] || primaryKeyword;
    const anchor = selectAnchorText(keyword, domain, anchorDist);
    const linkType = types[i % types.length];
    
    try {
      // Map link types to external backlink builder types
      const blType = mapLinkType(linkType);
      
      const session = await runExternalBuildSession(
        0, // projectId
        targetUrl,
        domain,
        [keyword],
        keyword,
        tier === 1 ? 8 : 5, // aggressiveness
        1, // maxLinks
      );
      
      if (session.results.some((r: BacklinkBuildResult) => r.success)) {
        built++;
      }
    } catch {
      // Continue on failure
    }
    
    // Rate limiting
    if (i > 0 && i % 5 === 0) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  console.log(`[7DaySprint] Tier ${tier} links: ${built}/${count} built`);
  return built;
}

function mapLinkType(type: string): "web2" | "social" | "comment" | "directory" | "forum" | "tier2" {
  const mapping: Record<string, "web2" | "social" | "comment" | "directory" | "forum" | "tier2"> = {
    web2: "web2",
    telegraph: "web2",
    pbn: "web2",
    guest_post: "web2",
    article_directory: "directory",
    social_bookmark: "social",
    blog_comment: "comment",
    forum_profile: "forum",
    directory: "directory",
    auto_generated: "tier2",
    wiki_link: "tier2",
    profile_link: "forum",
    rss_feed: "tier2",
  };
  return mapping[type] || "web2";
}

async function sendSprintTelegram(title: string, message: string): Promise<void> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;
    
    const text = `${title}\n\n${message}`;
    
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_notification: false,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err: any) {
    console.error(`[7DaySprint] Telegram notification failed:`, err.message);
  }
}

// ═══════════════════════════════════════════════
//  EXPORTS for orchestrator
// ═══════════════════════════════════════════════

export function getSprintSummary(): {
  activeSprints: number;
  completedSprints: number;
  totalFirstPageKeywords: number;
  bestRank: { keyword: string; position: number } | null;
} {
  const sprints = Array.from(activeSprintStates.values());
  const active = sprints.filter(s => s.status !== "completed" && s.status !== "failed");
  const completed = sprints.filter(s => s.status === "completed");
  
  let bestRank: { keyword: string; position: number } | null = null;
  let totalFirstPage = 0;
  
  for (const sprint of sprints) {
    totalFirstPage += sprint.firstPageKeywords.length;
    if (sprint.bestRankAchieved) {
      if (!bestRank || sprint.bestRankAchieved.position < bestRank.position) {
        bestRank = sprint.bestRankAchieved;
      }
    }
  }
  
  return {
    activeSprints: active.length,
    completedSprints: completed.length,
    totalFirstPageKeywords: totalFirstPage,
    bestRank,
  };
}
