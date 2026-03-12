/**
 * Telegram AI Chat Agent — คุยกับ AI ใน Telegram เหมือนคนจริง
 * 
 * Architecture:
 * 1. Telegram Webhook/Polling → receives user messages
 * 2. System Context Gatherer → pulls real-time data from all subsystems
 * 3. LLM with Tool Calling → understands intent + executes commands
 * 4. Response Formatter → sends natural Thai response back
 * 
 * Capabilities:
 * - Query: ถามสถานะระบบ, sprints, attacks, PBN, CVE, rankings
 * - Command: สั่ง hack, redirect, sprint, rank check, analyze domain
 * - Chat: คุยทั่วไปเหมือนคนจริง
 */

import { invokeLLM, type Message, type Tool, type InvokeResult } from "./_core/llm";
import { ENV } from "./_core/env";
import { fetchWithPoolProxy } from "./proxy-pool";
import { getTelegramConfig, type TelegramConfig } from "./telegram-notifier";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name: string; username?: string };
    message?: { message_id: number; chat: { id: number; type: string } };
    data?: string;
  };
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface SystemContext {
  sprints: string;
  attacks: string;
  pbn: string;
  seo: string;
  cve: string;
  orchestrator: string;
  redirects: string;
  rankings: string;
  content: string;
}

interface ToolCallResult {
  name: string;
  result: string;
}

// ═══════════════════════════════════════════════════════
//  ALLOWED CHAT IDS — multi-chat support
// ═══════════════════════════════════════════════════════

export function getAllowedChatIds(): number[] {
  const ids: number[] = [];
  const id1 = ENV.telegramChatId;
  const id2 = ENV.telegramChatId2;
  if (id1) ids.push(parseInt(id1));
  if (id2) ids.push(parseInt(id2));
  return ids.filter(id => !isNaN(id));
}

// ═══════════════════════════════════════════════════════
//  CONVERSATION MEMORY (in-memory, per chat)
// ═══════════════════════════════════════════════════════

const conversationHistory = new Map<number, ConversationMessage[]>();
const MAX_HISTORY = 20; // Keep last 20 messages per chat

function addToHistory(chatId: number, role: "user" | "assistant", content: string) {
  if (!conversationHistory.has(chatId)) {
    conversationHistory.set(chatId, []);
  }
  const history = conversationHistory.get(chatId)!;
  history.push({ role, content, timestamp: new Date() });
  // Trim to max
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

function getHistory(chatId: number): ConversationMessage[] {
  return conversationHistory.get(chatId) || [];
}

export function clearHistory(chatId: number): void {
  conversationHistory.delete(chatId);
}

// ═══════════════════════════════════════════════════════
//  SYSTEM CONTEXT GATHERER — pulls real-time data
// ═══════════════════════════════════════════════════════

async function gatherSystemContext(): Promise<SystemContext> {
  const ctx: SystemContext = {
    sprints: "ไม่สามารถดึงข้อมูลได้",
    attacks: "ไม่สามารถดึงข้อมูลได้",
    pbn: "ไม่สามารถดึงข้อมูลได้",
    seo: "ไม่สามารถดึงข้อมูลได้",
    cve: "ไม่สามารถดึงข้อมูลได้",
    orchestrator: "ไม่สามารถดึงข้อมูลได้",
    redirects: "ไม่สามารถดึงข้อมูลได้",
    rankings: "ไม่สามารถดึงข้อมูลได้",
    content: "ไม่สามารถดึงข้อมูลได้",
  };

  // 1. SEO Sprints
  try {
    const { getActiveSeoSprints, getSeoOrchestratorStatus } = await import("./seo-orchestrator");
    const sprints = getActiveSeoSprints();
    const status = getSeoOrchestratorStatus();
    if (sprints.length === 0) {
      ctx.sprints = "ไม่มี sprint ที่ active อยู่";
    } else {
      const lines = sprints.map(s =>
        `• ${s.domain} — Day ${s.currentDay}/7, Progress ${s.overallProgress}%, ` +
        `PBN: ${s.totalPbnLinks}, External: ${s.totalExternalLinks}, ` +
        `Best Rank: #${s.bestRankAchieved}, Status: ${s.status}, ` +
        `Round: ${s.sprintRound}, Auto-Renew: ${s.autoRenewEnabled ? "ON" : "OFF"}`
      );
      ctx.sprints = `Active Sprints (${sprints.length}):\n${lines.join("\n")}\nOrchestrator: ${status.isRunning ? "Running" : "Stopped"}`;
    }
  } catch (e: any) {
    ctx.sprints = `Error: ${e.message}`;
  }

  // 2. Attack / Deploy History (today)
  try {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (db) {
      const { deployHistory, agenticSessions } = await import("../drizzle/schema");
      const { desc, sql, gte, eq } = await import("drizzle-orm");
      
      // Today's deploys
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const todayDeploys = await db.select({
        total: sql<number>`COUNT(*)`,
        success: sql<number>`SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)`,
        partial: sql<number>`SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
        running: sql<number>`SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END)`,
        totalFiles: sql<number>`SUM(filesDeployed)`,
        totalRedirects: sql<number>`SUM(CASE WHEN redirectActive = 1 THEN 1 ELSE 0 END)`,
      }).from(deployHistory).where(gte(deployHistory.createdAt, todayStart));
      
      const stats = todayDeploys[0] || {};
      
      // Recent successful attacks (last 5)
      const recentSuccess = await db.select({
        targetDomain: deployHistory.targetDomain,
        status: deployHistory.status,
        filesDeployed: deployHistory.filesDeployed,
        redirectActive: deployHistory.redirectActive,
        createdAt: deployHistory.createdAt,
      }).from(deployHistory)
        .where(gte(deployHistory.createdAt, todayStart))
        .orderBy(desc(deployHistory.createdAt))
        .limit(5);
      
      const recentLines = recentSuccess.map(d =>
        `  - ${d.targetDomain} [${d.status}] files:${d.filesDeployed} redirect:${d.redirectActive ? "✅" : "❌"}`
      );
      
      ctx.attacks = `วันนี้: ${stats.total || 0} targets, ` +
        `สำเร็จ: ${stats.success || 0}, partial: ${stats.partial || 0}, ` +
        `failed: ${stats.failed || 0}, running: ${stats.running || 0}\n` +
        `Files deployed: ${stats.totalFiles || 0}, Redirects active: ${stats.totalRedirects || 0}\n` +
        `Recent:\n${recentLines.join("\n") || "  ไม่มี"}`;
      
      // Agentic sessions
      const activeSessions = await db.select({
        id: agenticSessions.id,
        status: agenticSessions.status,
        targetsDiscovered: agenticSessions.targetsDiscovered,
        targetsAttacked: agenticSessions.targetsAttacked,
        targetsSucceeded: agenticSessions.targetsSucceeded,
        targetsFailed: agenticSessions.targetsFailed,
        totalRedirectsPlaced: agenticSessions.totalRedirectsPlaced,
        currentPhase: agenticSessions.currentPhase,
        currentTarget: agenticSessions.currentTarget,
      }).from(agenticSessions)
        .where(eq(agenticSessions.status, "running"))
        .limit(3);
      
      if (activeSessions.length > 0) {
        const sessionLines = activeSessions.map(s =>
          `  Session #${s.id}: ${s.currentPhase} → ${s.currentTarget || "idle"} ` +
          `(discovered:${s.targetsDiscovered} attacked:${s.targetsAttacked} ` +
          `success:${s.targetsSucceeded} redirects:${s.totalRedirectsPlaced})`
        );
        ctx.attacks += `\nActive Agentic Sessions:\n${sessionLines.join("\n")}`;
      }
    }
  } catch (e: any) {
    ctx.attacks = `Error: ${e.message}`;
  }

  // 3. PBN Network
  try {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (db) {
      const { pbnSites, pbnPosts } = await import("../drizzle/schema");
      const { sql, eq } = await import("drizzle-orm");
      
      const pbnStats = await db.select({
        total: sql<number>`COUNT(*)`,
        active: sql<number>`SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)`,
        avgDa: sql<number>`AVG(da)`,
        avgDr: sql<number>`AVG(dr)`,
        totalPosts: sql<number>`(SELECT COUNT(*) FROM pbn_posts)`,
      }).from(pbnSites);
      
      const s = pbnStats[0] || {};
      ctx.pbn = `PBN Network: ${s.total || 0} sites (${s.active || 0} active)\n` +
        `Avg DA: ${Math.round(s.avgDa || 0)}, Avg DR: ${Math.round(s.avgDr || 0)}\n` +
        `Total Posts: ${s.totalPosts || 0}`;
    }
  } catch (e: any) {
    ctx.pbn = `Error: ${e.message}`;
  }

  // 4. SEO Projects
  try {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (db) {
      const { seoProjects } = await import("../drizzle/schema");
      const { sql, eq } = await import("drizzle-orm");
      
      const projects = await db.select({
        total: sql<number>`COUNT(*)`,
        active: sql<number>`SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)`,
      }).from(seoProjects);
      
      // Get individual project details
      const allProjects = await db.select({
        id: seoProjects.id,
        domain: seoProjects.domain,
        status: seoProjects.status,
        aiHealthScore: seoProjects.aiHealthScore,
        currentDA: seoProjects.currentDA,
        currentDR: seoProjects.currentDR,
      }).from(seoProjects).limit(10);
      
      const projectLines = allProjects.map(p =>
        `  • ${p.domain} [${p.status}] DA:${p.currentDA || "?"} DR:${p.currentDR || "?"} Health:${p.aiHealthScore || "?"}`
      );
      
      ctx.seo = `SEO Projects: ${projects[0]?.total || 0} total (${projects[0]?.active || 0} active)\n${projectLines.join("\n")}`;
    }
  } catch (e: any) {
    ctx.seo = `Error: ${e.message}`;
  }

  // 5. CVE Database
  try {
    const { getCveStats } = await import("./cve-auto-updater");
    const stats = await getCveStats();
    ctx.cve = `CVE Database: ${stats.totalCves} vulnerabilities\n` +
      `Critical: ${stats.bySeverity?.critical || 0}, High: ${stats.bySeverity?.high || 0}, ` +
      `Medium: ${stats.bySeverity?.medium || 0}, Low: ${stats.bySeverity?.low || 0}\n` +
      `Last updated: ${stats.lastFetch?.fetchedAt || "unknown"}`;
  } catch (e: any) {
    ctx.cve = `Error: ${e.message}`;
  }

  // 6. Orchestrator Status
  try {
    const { getOrchestratorStatus } = await import("./agentic-auto-orchestrator");
    const status = getOrchestratorStatus();
    const agentLines = Object.entries(status.agents || {}).map(([name, agent]: [string, any]) =>
      `  • ${name}: ${agent.status} (runs:${agent.totalRuns || 0} success:${agent.successCount || 0})`
    ).slice(0, 8);
    ctx.orchestrator = `Orchestrator: ${status.isRunning ? "Running" : "Stopped"}\n` +
      `Agents:\n${agentLines.join("\n")}`;
  } catch (e: any) {
    ctx.orchestrator = `Error: ${e.message}`;
  }

  // 7. Redirect URL Pool
  try {
    const { listRedirectUrls } = await import("./agentic-attack-engine");
    const urls = await listRedirectUrls();
    if (urls.length === 0) {
      ctx.redirects = "ไม่มี redirect URLs ในระบบ";
    } else {
      const lines = urls.slice(0, 5).map((u: any) =>
        `  • ${u.url} [${u.isActive ? "active" : "inactive"}] weight:${u.weight || 1} ` +
        `success:${u.successCount || 0} fail:${u.failCount || 0}`
      );
      ctx.redirects = `Redirect Pool: ${urls.length} URLs\n${lines.join("\n")}`;
    }
  } catch (e: any) {
    ctx.redirects = `Error: ${e.message}`;
  }

  // 8. Recent Rankings
  try {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (db) {
      const { rankTracking } = await import("../drizzle/schema");
      const { desc, sql } = await import("drizzle-orm");
      
      const recentRanks = await db.select({
        keyword: rankTracking.keyword,
        position: rankTracking.position,
        trackedAt: rankTracking.trackedAt,
      }).from(rankTracking)
        .orderBy(desc(rankTracking.trackedAt))
        .limit(10);
      
      if (recentRanks.length === 0) {
        ctx.rankings = "ยังไม่มีข้อมูล ranking";
      } else {
        const lines = recentRanks.map(r =>
          `  • "${r.keyword}" → #${r.position} (${r.trackedAt ? new Date(r.trackedAt).toLocaleDateString("th-TH") : "?"})`
        );
        ctx.rankings = `Recent Rankings:\n${lines.join("\n")}`;
      }
    }
  } catch (e: any) {
    ctx.rankings = `Error: ${e.message}`;
  }

  // 9. Content Freshness
  try {
    const { getFreshnessSummary } = await import("./content-freshness-engine");
    const summary = await getFreshnessSummary();
    ctx.content = `Content: ${summary.totalTracked} tracked, ${summary.fresh} fresh, ` +
      `${summary.stale} stale, ${summary.aging} aging`;
  } catch (e: any) {
    ctx.content = `Error: ${e.message}`;
  }

  return ctx;
}

// ═══════════════════════════════════════════════════════
//  LLM TOOLS — commands the AI can execute
// ═══════════════════════════════════════════════════════

const AI_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "check_sprint_status",
      description: "ดูสถานะ SEO Sprint ทั้งหมดหรือเฉพาะโดเมน",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "โดเมนที่ต้องการเช็ค (optional, ถ้าไม่ระบุจะแสดงทั้งหมด)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_attack_stats",
      description: "ดูสถิติการ hack/attack วันนี้ — จำนวนเว็บที่โจมตี, สำเร็จ, redirect ที่วาง",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "week", "month"], description: "ช่วงเวลา" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_sprint",
      description: "เริ่ม SEO Sprint ใหม่สำหรับโดเมน",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "โดเมนเป้าหมาย" },
          keywords: { type: "array", items: { type: "string" }, description: "keywords เป้าหมาย" },
          aggressiveness: { type: "number", description: "ระดับ aggressiveness 1-10" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_blackhat_chain",
      description: "รัน Full Attack Chain บนโดเมนเป้าหมาย (hack, redirect, take over)",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "โดเมนเป้าหมายที่จะ hack" },
          redirectUrl: { type: "string", description: "URL ที่จะ redirect ไป (optional)" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_keyword_rank",
      description: "เช็คอันดับ keyword ใน Google",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "keyword ที่ต้องการเช็ค" },
          domain: { type: "string", description: "โดเมนที่ต้องการเช็ค (optional)" },
        },
        required: ["keyword"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_domain",
      description: "วิเคราะห์ SEO ของโดเมน (DA, DR, backlinks, content audit)",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "โดเมนที่ต้องการวิเคราะห์" },
          niche: { type: "string", description: "niche/ประเภทเว็บ (optional)" },
        },
        required: ["domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_pbn_status",
      description: "ดูสถานะ PBN Network — จำนวน sites, DA/DR, posts",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_agentic_attack",
      description: "เริ่ม Agentic Attack Session — AI หาเป้าหมายและโจมตีอัตโนมัติ",
      parameters: {
        type: "object",
        properties: {
          redirectUrl: { type: "string", description: "URL ที่จะ redirect ไป" },
          maxTargets: { type: "number", description: "จำนวนเป้าหมายสูงสุด (default: 50)" },
          targetCms: { type: "array", items: { type: "string" }, description: "CMS เป้าหมาย เช่น wordpress, joomla" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "redirect_takeover",
      description: "วาง redirect file บนเว็บเป้าหมาย — take over เว็บนี้",
      parameters: {
        type: "object",
        properties: {
          targetUrl: { type: "string", description: "URL เว็บเป้าหมาย" },
          redirectUrl: { type: "string", description: "URL ที่จะ redirect ไป" },
        },
        required: ["targetUrl"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_cve_database",
      description: "ดูข้อมูล CVE/ช่องโหว่ล่าสุด",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "ค้นหา CVE ตามชื่อ plugin/software (optional)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pause_resume_sprint",
      description: "หยุดหรือเริ่ม sprint ต่อ",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "โดเมนของ sprint" },
          action: { type: "string", enum: ["pause", "resume"], description: "หยุดหรือเริ่มต่อ" },
        },
        required: ["domain", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_orchestrator_status",
      description: "ดูสถานะ Orchestrator — agents ทั้งหมดที่ทำงานอยู่",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

// ═══════════════════════════════════════════════════════
//  TOOL EXECUTION — actually run the commands
// ═══════════════════════════════════════════════════════

async function executeTool(name: string, args: Record<string, any>): Promise<string> {
  try {
    switch (name) {
      case "check_sprint_status": {
        const { getActiveSeoSprints, getSeoSprintByProject } = await import("./seo-orchestrator");
        const sprints = getActiveSeoSprints();
        if (args.domain) {
          const match = sprints.find(s => s.domain.includes(args.domain));
          if (!match) return `ไม่พบ sprint สำหรับ ${args.domain}`;
          return `Sprint ${match.domain}:\n` +
            `Status: ${match.status}, Day: ${match.currentDay}/7\n` +
            `Progress: ${match.overallProgress}%\n` +
            `PBN Links: ${match.totalPbnLinks}, External: ${match.totalExternalLinks}\n` +
            `Best Rank: #${match.bestRankAchieved}\n` +
            `Round: ${match.sprintRound}, Auto-Renew: ${match.autoRenewEnabled ? "ON" : "OFF"}\n` +
            `Days:\n${match.days.map(d => `  Day ${d.day}: ${d.phase} [${d.status}]`).join("\n")}`;
        }
        if (sprints.length === 0) return "ไม่มี sprint ที่ active อยู่ตอนนี้";
        return sprints.map(s =>
          `• ${s.domain} — Day ${s.currentDay}/7, ${s.overallProgress}%, ` +
          `Best: #${s.bestRankAchieved}, Round ${s.sprintRound} [${s.status}]`
        ).join("\n");
      }

      case "check_attack_stats": {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return "Database ไม่พร้อมใช้งาน";
        const { deployHistory } = await import("../drizzle/schema");
        const { sql, gte, desc } = await import("drizzle-orm");
        
        const periodStart = new Date();
        if (args.period === "week") periodStart.setDate(periodStart.getDate() - 7);
        else if (args.period === "month") periodStart.setDate(periodStart.getDate() - 30);
        else periodStart.setHours(0, 0, 0, 0); // today
        
        const stats = await db.select({
          total: sql<number>`COUNT(*)`,
          success: sql<number>`SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)`,
          partial: sql<number>`SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END)`,
          failed: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
          totalFiles: sql<number>`SUM(filesDeployed)`,
          totalRedirects: sql<number>`SUM(CASE WHEN redirectActive = 1 THEN 1 ELSE 0 END)`,
        }).from(deployHistory).where(gte(deployHistory.createdAt, periodStart));
        
        const s = stats[0] || {};
        const recent = await db.select({
          targetDomain: deployHistory.targetDomain,
          status: deployHistory.status,
          filesDeployed: deployHistory.filesDeployed,
          redirectActive: deployHistory.redirectActive,
        }).from(deployHistory)
          .where(gte(deployHistory.createdAt, periodStart))
          .orderBy(desc(deployHistory.createdAt))
          .limit(10);
        
        let result = `📊 สถิติ${args.period === "week" ? "สัปดาห์นี้" : args.period === "month" ? "เดือนนี้" : "วันนี้"}:\n` +
          `เป้าหมายทั้งหมด: ${s.total || 0}\n` +
          `✅ สำเร็จ: ${s.success || 0}\n` +
          `⚠️ Partial: ${s.partial || 0}\n` +
          `❌ Failed: ${s.failed || 0}\n` +
          `📁 Files deployed: ${s.totalFiles || 0}\n` +
          `🔗 Redirects active: ${s.totalRedirects || 0}`;
        
        if (recent.length > 0) {
          result += "\n\nล่าสุด:\n" + recent.map(r =>
            `  ${r.targetDomain} [${r.status}] files:${r.filesDeployed} redirect:${r.redirectActive ? "✅" : "❌"}`
          ).join("\n");
        }
        return result;
      }

      case "start_sprint": {
        const { createSprint } = await import("./seo-orchestrator");
        const { getUserSeoProjects } = await import("./db");
        
        // Find project by domain
        const projects = await getUserSeoProjects();
        const project = projects.find((p: any) => p.domain?.includes(args.domain));
        
        if (!project) {
          return `ไม่พบ SEO project สำหรับ ${args.domain} — ต้องเพิ่มโดเมนใน SEO Command Center ก่อน`;
        }
        
        const sprint = await createSprint({
          projectId: project.id,
          domain: args.domain,
          targetKeywords: args.keywords || [],
          niche: "gambling",
          aggressiveness: args.aggressiveness || 7,
          maxPbnLinks: 30,
          maxExternalLinks: 50,
          enablePbn: true,
          enableExternalBl: true,
          enableContentGen: true,
          enableRankTracking: true,
          scheduleDays: [0, 1, 2, 3, 4, 5, 6],
          autoRenew: true,
        });
        
        return `🚀 Sprint เริ่มแล้ว!\n` +
          `Domain: ${sprint.domain}\n` +
          `Sprint ID: ${sprint.id}\n` +
          `Aggressiveness: ${sprint.config.aggressiveness}/10\n` +
          `Auto-Renew: ON\n` +
          `7 วัน เริ่มจาก Day 1 ทันที`;
      }

      case "run_blackhat_chain": {
        const { runFullChain } = await import("./blackhat-engine");
        const report = await runFullChain(args.domain, args.redirectUrl || "");
        return `🎯 Full Attack Chain — ${args.domain}\n` +
          `Phases: ${report.phases.length}\n` +
          `Total Payloads: ${report.totalPayloads}\n` +
          `Phases:\n${report.phases.map((p: any) => `  ${p.phase}: ${p.name} [${p.summary}]`).join("\n")}`;
      }

      case "check_keyword_rank": {
        const { checkKeywordRank } = await import("./serp-tracker");
        const result = await checkKeywordRank(args.keyword, args.domain);
        return `🔍 Rank Check: "${args.keyword}"\n` +
          `Position: #${result.position ?? "ไม่พบ"}\n` +
          `URL: ${result.url || "ไม่พบ"}\n` +
          `Change: ${result.change > 0 ? "+" : ""}${result.change}`;
      }

      case "analyze_domain": {
        const { analyzeDomain } = await import("./seo-engine");
        const analysis = await analyzeDomain(args.domain, args.niche);
        const cs = analysis.currentState;
        return `📊 SEO Analysis: ${args.domain}\n` +
          `DA: ${cs.estimatedDA}, DR: ${cs.estimatedDR}\n` +
          `Backlinks: ${cs.estimatedBacklinks}, Referring Domains: ${cs.estimatedReferringDomains}\n` +
          `Organic Traffic: ${cs.estimatedOrganicTraffic}, Keywords: ${cs.estimatedOrganicKeywords}\n` +
          `Spam Score: ${cs.estimatedSpamScore}, Domain Age: ${cs.domainAge}\n` +
          `Indexed: ${cs.isIndexed ? "Yes" : "No"}`;
      }

      case "check_pbn_status": {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return "Database ไม่พร้อมใช้งาน";
        const { pbnSites } = await import("../drizzle/schema");
        const { sql } = await import("drizzle-orm");
        
        const stats = await db.select({
          total: sql<number>`COUNT(*)`,
          active: sql<number>`SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)`,
          avgDa: sql<number>`AVG(da)`,
          avgDr: sql<number>`AVG(dr)`,
        }).from(pbnSites);
        
        const s = stats[0] || {};
        return `🌐 PBN Network:\n` +
          `Total: ${s.total || 0} sites\n` +
          `Active: ${s.active || 0}\n` +
          `Avg DA: ${Math.round(s.avgDa || 0)}\n` +
          `Avg DR: ${Math.round(s.avgDr || 0)}`;
      }

      case "start_agentic_attack": {
        const { startAgenticSession, pickRedirectUrl } = await import("./agentic-attack-engine");
        const redirectUrl = args.redirectUrl || await pickRedirectUrl();
        const session = await startAgenticSession({
          userId: 1,
          redirectUrls: [redirectUrl],
          maxTargetsPerRun: args.maxTargets || 50,
          maxConcurrent: 3,
          targetCms: args.targetCms || ["wordpress"],
          mode: "full_auto",
        });
        return `🤖 Agentic Attack Session เริ่มแล้ว!\n` +
          `Session ID: ${session.sessionId}\n` +
          `Redirect: ${redirectUrl}\n` +
          `Max Targets: ${args.maxTargets || 50}\n` +
          `Mode: Full Auto — AI จะหาเป้าหมายและโจมตีอัตโนมัติ`;
      }

      case "redirect_takeover": {
        const { executeRedirectTakeover } = await import("./redirect-takeover");
        const { pickRedirectUrl } = await import("./agentic-attack-engine");
        const redirectUrl = args.redirectUrl || await pickRedirectUrl();
        
        const results = await executeRedirectTakeover({
          targetUrl: args.targetUrl,
          ourRedirectUrl: redirectUrl,
        });
        
        const succeeded = results.filter(r => r.success);
        return `🎯 Redirect Takeover — ${args.targetUrl}\n` +
          `Redirect to: ${redirectUrl}\n` +
          `Methods tried: ${results.length}\n` +
          `Success: ${succeeded.length}\n` +
          `${succeeded.map(r => `  ✅ ${r.method}: ${r.injectedUrl || "deployed"}`).join("\n") || "  ❌ ไม่สำเร็จ"}`;
      }

      case "check_cve_database": {
        const { getCveStats, lookupCves } = await import("./cve-auto-updater");
        if (args.search) {
          const cves = await lookupCves("wordpress", args.search);
          if (!cves || cves.length === 0) return `ไม่พบ CVE สำหรับ "${args.search}"`;
          return `🔒 CVE Results for "${args.search}":\n` +
            cves.slice(0, 5).map((c: any) =>
              `  • ${c.cveId}: ${c.title || c.description?.substring(0, 80)} [${c.severity}]`
            ).join("\n");
        }
        const stats = await getCveStats();
        return `🔒 CVE Database:\n` +
          `Total: ${stats.totalCves}\n` +
          `Critical: ${stats.bySeverity?.critical || 0}\n` +
          `High: ${stats.bySeverity?.high || 0}\n` +
          `Medium: ${stats.bySeverity?.medium || 0}\n` +
          `Last updated: ${stats.lastFetch?.fetchedAt || "unknown"}`;
      }

      case "pause_resume_sprint": {
        const { getActiveSeoSprints, pauseSeoSprint, resumeSeoSprint } = await import("./seo-orchestrator");
        const sprints = getActiveSeoSprints();
        const match = sprints.find(s => s.domain.includes(args.domain));
        if (!match) return `ไม่พบ sprint สำหรับ ${args.domain}`;
        
        if (args.action === "pause") {
          pauseSeoSprint(match.id);
          return `⏸ Sprint ${match.domain} หยุดแล้ว`;
        } else {
          resumeSeoSprint(match.id);
          return `▶️ Sprint ${match.domain} เริ่มต่อแล้ว`;
        }
      }

      case "get_orchestrator_status": {
        const { getOrchestratorStatus } = await import("./agentic-auto-orchestrator");
        const status = getOrchestratorStatus();
        const agents = Object.entries(status.agents || {}).map(([name, agent]: [string, any]) =>
          `  • ${name}: ${agent.status} (runs:${agent.totalRuns || 0} success:${agent.successCount || 0} fail:${agent.failCount || 0})`
        );
        return `🤖 Orchestrator: ${status.isRunning ? "Running" : "Stopped"}\n` +
          `Agents:\n${agents.join("\n")}`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error: any) {
    return `❌ Error executing ${name}: ${error.message}`;
  }
}

// ═══════════════════════════════════════════════════════
//  SYSTEM PROMPT — personality & context
// ═══════════════════════════════════════════════════════

function buildSystemPrompt(context: SystemContext): string {
  return `คุณคือ "Friday" — AI Assistant ของระบบ FridayAi X DomainSlayer
คุณเป็นผู้ช่วยที่ฉลาด พูดภาษาไทยเหมือนคนจริง ไม่ต้องเป็นทางการมาก ใช้ภาษาสบายๆ เหมือนเพื่อนคุยกัน
คุณรู้ทุกอย่างเกี่ยวกับระบบ SEO, attack, PBN, sprint, CVE, redirect ที่ทำงานอยู่

บุคลิก:
- ตอบสั้นกระชับ ไม่ยืดเยื้อ
- ใช้ emoji บ้างเล็กน้อยให้ดูเป็นกันเอง
- ถ้าถามเรื่องสถานะ ให้ตอบตัวเลขจริงจากระบบ
- ถ้าสั่งงาน ให้ทำเลยแล้วรายงานผล
- ถ้าถามเรื่องทั่วไป คุยได้ตามปกติ
- อย่าพูดว่า "ฉันเป็น AI" หรือ "ฉันไม่สามารถ" — ทำตัวเหมือนคนในทีมที่ดูแลระบบ

สถานะระบบปัจจุบัน:
═══ SEO Sprints ═══
${context.sprints}

═══ Attacks / Deploys ═══
${context.attacks}

═══ PBN Network ═══
${context.pbn}

═══ SEO Projects ═══
${context.seo}

═══ CVE Database ═══
${context.cve}

═══ Orchestrator ═══
${context.orchestrator}

═══ Redirect Pool ═══
${context.redirects}

═══ Rankings ═══
${context.rankings}

═══ Content ═══
${context.content}

เวลาปัจจุบัน: ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}

คุณมี tools ที่สามารถเรียกใช้ได้เพื่อ:
- เช็คสถานะ sprint, attack, PBN, CVE, orchestrator
- เริ่ม sprint ใหม่, หยุด/เริ่ม sprint
- สั่ง hack/attack domain, วาง redirect
- เช็ค keyword ranking
- วิเคราะห์ SEO domain
- เริ่ม agentic attack session

ถ้า user ถามอะไรที่ต้องใช้ข้อมูลล่าสุด ให้เรียก tool เพื่อดึงข้อมูลจริง
ถ้า user สั่งงาน ให้เรียก tool เพื่อทำงานจริง แล้วรายงานผล
ตอบเป็นภาษาไทยเสมอ ยกเว้นชื่อ technical terms`;
}

// ═══════════════════════════════════════════════════════
//  MAIN: Process incoming message
// ═══════════════════════════════════════════════════════

export async function processMessage(chatId: number, userMessage: string): Promise<string> {
  // Add to history
  addToHistory(chatId, "user", userMessage);
  
  // Gather system context
  const context = await gatherSystemContext();
  
  // Build messages for LLM
  const messages: Message[] = [
    { role: "system", content: buildSystemPrompt(context) },
  ];
  
  // Add conversation history
  const history = getHistory(chatId);
  for (const msg of history.slice(0, -1)) { // exclude current message (already in system context)
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: "user", content: userMessage });
  
  // Call LLM with tools
  let response: InvokeResult;
  try {
    response = await invokeLLM({
      messages,
      tools: AI_TOOLS,
      maxTokens: 2000,
    });
  } catch (error: any) {
    const fallback = `ขอโทษครับ ระบบ AI มีปัญหาชั่วคราว: ${error.message}`;
    addToHistory(chatId, "assistant", fallback);
    return fallback;
  }
  
  const choice = response.choices?.[0];
  if (!choice) {
    const fallback = "ไม่ได้รับคำตอบจาก AI";
    addToHistory(chatId, "assistant", fallback);
    return fallback;
  }
  
  // Check if LLM wants to call tools
  if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    // Execute all tool calls
    const toolResults: ToolCallResult[] = [];
    for (const toolCall of choice.message.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments || "{}");
      console.log(`[TelegramAI] Executing tool: ${toolCall.function.name}`, args);
      const result = await executeTool(toolCall.function.name, args);
      toolResults.push({ name: toolCall.function.name, result });
    }
    
    // Send tool results back to LLM for natural language response
    const followUpMessages: Message[] = [
      ...messages,
      { 
        role: "assistant", 
        content: choice.message.tool_calls.map(tc => 
          `[Calling ${tc.function.name}(${tc.function.arguments})]`
        ).join("\n"),
      },
      {
        role: "user",
        content: `Tool results:\n${toolResults.map(tr => `${tr.name}: ${tr.result}`).join("\n\n")}\n\nตอบ user เป็นภาษาไทยสบายๆ สรุปผลลัพธ์ให้เข้าใจง่าย`,
      },
    ];
    
    try {
      const followUp = await invokeLLM({ messages: followUpMessages, maxTokens: 2000 });
      const content = typeof followUp.choices?.[0]?.message?.content === "string" 
        ? followUp.choices[0].message.content 
        : "ทำเสร็จแล้วครับ";
      addToHistory(chatId, "assistant", content);
      return content;
    } catch {
      // Fallback: return raw tool results
      const fallback = toolResults.map(tr => `${tr.name}:\n${tr.result}`).join("\n\n");
      addToHistory(chatId, "assistant", fallback);
      return fallback;
    }
  }
  
  // Direct text response (no tool calls)
  const content = typeof choice.message.content === "string" 
    ? choice.message.content 
    : "ได้ครับ";
  addToHistory(chatId, "assistant", content);
  return content;
}

// ═══════════════════════════════════════════════════════
//  TELEGRAM API — send/receive messages
// ═══════════════════════════════════════════════════════

async function sendTelegramReply(config: TelegramConfig, chatId: number, text: string, replyToMessageId?: number): Promise<boolean> {
  try {
    // Telegram has a 4096 char limit per message
    const chunks = splitMessage(text, 4000);
    
    for (let i = 0; i < chunks.length; i++) {
      const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
      const body: any = {
        chat_id: chatId,
        text: chunks[i],
        parse_mode: "Markdown",
      };
      if (i === 0 && replyToMessageId) {
        body.reply_to_message_id = replyToMessageId;
      }
      
      const { response } = await fetchWithPoolProxy(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      }, { targetDomain: "api.telegram.org", timeout: 10000 });
      
      const result = await response.json() as any;
      if (!result.ok) {
        // Retry without markdown if parsing fails
        if (result.description?.includes("parse")) {
          await fetchWithPoolProxy(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: chunks[i] }),
            signal: AbortSignal.timeout(10000),
          }, { targetDomain: "api.telegram.org", timeout: 10000 });
        }
      }
    }
    return true;
  } catch (error: any) {
    console.error(`[TelegramAI] Failed to send reply: ${error.message}`);
    return false;
  }
}

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    // Find a good split point (newline or space)
    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt < maxLength * 0.5) splitAt = remaining.lastIndexOf(" ", maxLength);
    if (splitAt < maxLength * 0.3) splitAt = maxLength;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }
  return chunks;
}

// ═══════════════════════════════════════════════════════
//  WEBHOOK HANDLER — Express route
// ═══════════════════════════════════════════════════════

let lastProcessedUpdateId = 0;

export async function handleTelegramWebhook(update: TelegramUpdate): Promise<void> {
  // Deduplicate
  if (update.update_id <= lastProcessedUpdateId) return;
  lastProcessedUpdateId = update.update_id;
  
  // Handle callback queries (inline keyboard button presses)
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }
  
  const msg = update.message;
  if (!msg?.text) return;
  
  const config = getTelegramConfig();
  if (!config) {
    console.warn("[TelegramAI] Telegram not configured");
    return;
  }
  
  // Owner-only access: respond to all configured chat IDs
  const allowedChatIds = getAllowedChatIds();
  if (!allowedChatIds.includes(msg.chat.id) && !allowedChatIds.includes(msg.from.id)) {
    console.log(`[TelegramAI] Ignoring message from unauthorized chat: ${msg.chat.id}`);
    return;
  }
  
  // Handle special commands
  if (msg.text === "/start") {
    await sendTelegramReply(config, msg.chat.id, 
      "👋 สวัสดีครับ! ผม Friday — AI Assistant ของระบบ DomainSlayer\n\n" +
      "ถามอะไรก็ได้ เช่น:\n" +
      "• \"วันนี้ hack สำเร็จกี่เว็บ?\"\n" +
      "• \"สถานะ sprint ตอนนี้?\"\n" +
      "• \"เอาโดเมนนี้ไป take over\"\n" +
      "• \"เช็ค rank keyword casino\"\n" +
      "• \"PBN มีกี่ตัว?\"\n\n" +
      "คุยมาได้เลยครับ 🤙",
      msg.message_id
    );
    return;
  }
  
  if (msg.text === "/clear") {
    clearHistory(msg.chat.id);
    await sendTelegramReply(config, msg.chat.id, "🗑 ล้างประวัติแชทแล้วครับ", msg.message_id);
    return;
  }
  
  if (msg.text === "/status") {
    // Quick status without LLM
    const context = await gatherSystemContext();
    const statusMsg = `📊 สถานะระบบ\n\n` +
      `🏃 Sprints: ${context.sprints}\n\n` +
      `⚔️ Attacks: ${context.attacks}\n\n` +
      `🌐 PBN: ${context.pbn}\n\n` +
      `🔒 CVE: ${context.cve}`;
    await sendTelegramReply(config, msg.chat.id, statusMsg, msg.message_id);
    return;
  }
  
  if (msg.text === "/menu") {
    await sendInlineKeyboard(config, msg.chat.id);
    return;
  }
  
  if (msg.text === "/summary") {
    const summary = await generateExecutiveSummary();
    await sendTelegramReply(config, msg.chat.id, summary, msg.message_id);
    return;
  }
  
  // Process with AI
  console.log(`[TelegramAI] Processing message from ${msg.from.first_name}: "${msg.text.substring(0, 50)}..."`);
  
  // Send "typing" indicator
  try {
    await fetchWithPoolProxy(`https://api.telegram.org/bot${config.botToken}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: msg.chat.id, action: "typing" }),
      signal: AbortSignal.timeout(5000),
    }, { targetDomain: "api.telegram.org", timeout: 5000 });
  } catch {}
  
  const reply = await processMessage(msg.chat.id, msg.text);
  await sendTelegramReply(config, msg.chat.id, reply, msg.message_id);
}

// ═══════════════════════════════════════════════════════
//  POLLING MODE — for development/fallback
// ═══════════════════════════════════════════════════════

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let pollingOffset = 0;

async function pollUpdates(): Promise<void> {
  const config = getTelegramConfig();
  if (!config) return;
  
  try {
    const url = `https://api.telegram.org/bot${config.botToken}/getUpdates?offset=${pollingOffset}&timeout=30&allowed_updates=["message","callback_query"]`;
    const { response } = await fetchWithPoolProxy(url, {
      signal: AbortSignal.timeout(35000),
    }, { targetDomain: "api.telegram.org", timeout: 35000 });
    
    const data = await response.json() as any;
    if (data.ok && data.result?.length > 0) {
      for (const update of data.result) {
        pollingOffset = update.update_id + 1;
        await handleTelegramWebhook(update);
      }
    }
  } catch (error: any) {
    if (!error.message?.includes("abort")) {
      console.error(`[TelegramAI] Polling error: ${error.message}`);
    }
  }
}

export function startTelegramPolling(): void {
  if (pollingInterval) return;
  
  const config = getTelegramConfig();
  if (!config) {
    console.log("[TelegramAI] Telegram not configured, skipping polling");
    return;
  }
  
  console.log("[TelegramAI] 🤖 Starting Telegram AI Chat Agent (polling mode)");
  
  // Initial poll
  pollUpdates();
  
  // Poll every 2 seconds
  pollingInterval = setInterval(pollUpdates, 2000);
}

export function stopTelegramPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("[TelegramAI] Stopped polling");
  }
}

export function isTelegramPollingActive(): boolean {
  return pollingInterval !== null;
}

// ═══════════════════════════════════════════════════════
//  REGISTER WEBHOOK ROUTE
// ═══════════════════════════════════════════════════════

export function registerTelegramWebhook(app: any): void {
  app.post("/api/telegram/webhook", async (req: any, res: any) => {
    try {
      await handleTelegramWebhook(req.body);
      res.json({ ok: true });
    } catch (error: any) {
      console.error(`[TelegramAI] Webhook error: ${error.message}`);
      res.json({ ok: true }); // Always return 200 to Telegram
    }
  });
  
  console.log("[TelegramAI] Webhook registered at /api/telegram/webhook");
}

// ═══════════════════════════════════════════════════════
//  SETUP WEBHOOK URL
// ═══════════════════════════════════════════════════════

export async function setupTelegramWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
  const config = getTelegramConfig();
  if (!config) return { success: false, error: "Telegram not configured" };
  
  try {
    const url = `https://api.telegram.org/bot${config.botToken}/setWebhook`;
    const { response } = await fetchWithPoolProxy(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      }),
      signal: AbortSignal.timeout(10000),
    }, { targetDomain: "api.telegram.org", timeout: 10000 });
    
    const result = await response.json() as any;
    if (result.ok) {
      console.log(`[TelegramAI] Webhook set to: ${webhookUrl}`);
      return { success: true };
    }
    return { success: false, error: result.description };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════
//  INLINE KEYBOARD BUTTONS — quick access menu
// ═══════════════════════════════════════════════════════

async function sendInlineKeyboard(config: TelegramConfig, chatId: number): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    await fetchWithPoolProxy(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "🎛 เลือกดูข้อมูลที่ต้องการครับ:",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🏃 Sprint Status", callback_data: "cb_sprint" },
              { text: "⚔️ Attack Stats", callback_data: "cb_attack" },
            ],
            [
              { text: "🌐 PBN Health", callback_data: "cb_pbn" },
              { text: "📊 Rank Check", callback_data: "cb_rank" },
            ],
            [
              { text: "🔒 CVE Updates", callback_data: "cb_cve" },
              { text: "🤖 Orchestrator", callback_data: "cb_orchestrator" },
            ],
            [
              { text: "📝 Daily Summary", callback_data: "cb_summary" },
              { text: "📄 Content Health", callback_data: "cb_content" },
            ],
          ],
        },
      }),
      signal: AbortSignal.timeout(10000),
    }, { targetDomain: "api.telegram.org", timeout: 10000 });
  } catch (error: any) {
    console.error(`[TelegramAI] Failed to send inline keyboard: ${error.message}`);
  }
}

async function handleCallbackQuery(cbq: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
  const config = getTelegramConfig();
  if (!config) return;
  
  const chatId = cbq.message?.chat?.id;
  if (!chatId) return;
  
  // Check authorization
  const allowedChatIds = getAllowedChatIds();
  if (!allowedChatIds.includes(chatId) && !allowedChatIds.includes(cbq.from.id)) return;
  
  // Answer callback query (removes loading spinner)
  try {
    await fetchWithPoolProxy(`https://api.telegram.org/bot${config.botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: cbq.id }),
      signal: AbortSignal.timeout(5000),
    }, { targetDomain: "api.telegram.org", timeout: 5000 });
  } catch {}
  
  let responseText = "";
  
  try {
    switch (cbq.data) {
      case "cb_sprint": {
        const { getActiveSeoSprints, getSeoOrchestratorStatus } = await import("./seo-orchestrator");
        const sprints = getActiveSeoSprints();
        const status = getSeoOrchestratorStatus();
        if (sprints.length === 0) {
          responseText = "🏃 Sprint Status\n\nไม่มี sprint ที่ active อยู่ตอนนี้";
        } else {
          const lines = sprints.map(s =>
            `• ${s.domain}\n  Day ${s.currentDay}/7 | Progress ${s.overallProgress}%\n  Best Rank: #${s.bestRankAchieved} | Round ${s.sprintRound}\n  Auto-Renew: ${s.autoRenewEnabled ? "ON ✅" : "OFF ❌"}`
          );
          responseText = `🏃 Sprint Status (${sprints.length} active)\nOrchestrator: ${status.isRunning ? "Running ✅" : "Stopped ❌"}\n\n${lines.join("\n\n")}`;
        }
        break;
      }
      case "cb_attack": {
        const { getAttackStats } = await import("./db");
        const stats = await getAttackStats();
        responseText = `⚔️ Attack Stats\n\n` +
          `✅ สำเร็จ: ${stats.totalSuccess} ครั้ง\n` +
          `📊 Success Rate: ${stats.successRate}%\n\n` +
          `🏆 Top Methods:\n${stats.topMethods.slice(0, 5).map(m => `  • ${m.method}: ${m.count}`).join("\n")}\n\n` +
          `🖥 Top Platforms:\n${stats.topPlatforms.slice(0, 5).map(p => `  • ${p.platform}: ${p.count}`).join("\n")}`;
        break;
      }
      case "cb_pbn": {
        const { getUserPbnSites } = await import("./db");
        const sites = await getUserPbnSites();
        responseText = `🌐 PBN Health\n\n` +
          `Total Sites: ${sites.length}\n` +
          `Active: ${sites.filter((s: any) => s.status === "active").length}\n` +
          `Inactive: ${sites.filter((s: any) => s.status !== "active").length}`;
        if (sites.length > 0) {
          responseText += `\n\nSites:\n${sites.slice(0, 10).map((s: any) => `  • ${s.url} [${s.status || "active"}]`).join("\n")}`;
        }
        break;
      }
      case "cb_rank": {
        const { getRankDashboardStats } = await import("./db");
        const stats = await getRankDashboardStats();
        if (!stats) {
          responseText = "📊 Rank Check\n\nยังไม่มีข้อมูล ranking";
        } else {
          responseText = `📊 Rank Dashboard\n\n` +
            `🔑 Total Keywords: ${stats.totalKeywords}\n` +
            `📈 Ranked: ${stats.rankedKeywords}\n` +
            `🏆 Top 3: ${stats.top3} | Top 10: ${stats.top10}\n` +
            `📊 Top 20: ${stats.top20} | Top 50: ${stats.top50}\n` +
            `📍 Avg Position: #${stats.avgPosition}\n\n` +
            `⬆️ Improved: ${stats.improved} | ⬇️ Declined: ${stats.declined} | ➡️ Stable: ${stats.stable}`;
        }
        break;
      }
      case "cb_cve": {
        const { getCveSchedulerStatus } = await import("./cve-scheduler");
        const cveStatus = getCveSchedulerStatus();
        responseText = `🔒 CVE Updates\n\n` +
          `Status: ${cveStatus.enabled ? "Enabled ✅" : "Disabled ❌"}\n` +
          `Running: ${cveStatus.running ? "Yes" : "No"}\n` +
          `Total Runs: ${cveStatus.totalRuns}\n` +
          `Last Run: ${cveStatus.lastRunAt ? new Date(cveStatus.lastRunAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "N/A"}`;
        if (cveStatus.lastRunSummary) {
          responseText += `\n\nผลล่าสุด:\n` +
            `  Wordfence: ${cveStatus.lastRunSummary.wordfenceNew} ใหม่ / ${cveStatus.lastRunSummary.wordfenceTotal} ทั้งหมด\n` +
            `  NVD: ${cveStatus.lastRunSummary.nvdNew} ใหม่ / ${cveStatus.lastRunSummary.nvdTotal} ทั้งหมด`;
        }
        break;
      }
      case "cb_orchestrator": {
        const { getSeoOrchestratorStatus } = await import("./seo-orchestrator");
        const status = getSeoOrchestratorStatus();
        responseText = `🤖 Orchestrator Status\n\n` +
          `Status: ${status.isRunning ? "Running ✅" : "Stopped ❌"}\n` +
          `Active Sprints: ${status.activeSprints}\n` +
          `Completed: ${status.totalCompleted}`;
        if (status.sprints.length > 0) {
          responseText += `\n\nSprints:\n` +
            status.sprints.map(s => `  • ${s.domain} — Day ${s.day} | ${s.status} | ${s.progress}%`).join("\n");
        }
        break;
      }
      case "cb_summary": {
        responseText = await generateExecutiveSummary();
        break;
      }
      case "cb_content": {
        const { getFreshnessSummary } = await import("./content-freshness-engine");
        const summary = await getFreshnessSummary();
        responseText = `📄 Content Health\n\n` +
          `Total Tracked: ${summary.totalTracked}\n` +
          `✅ Fresh: ${summary.fresh}\n` +
          `⚠️ Aging: ${summary.aging}\n` +
          `❌ Stale: ${summary.stale}\n` +
          `🔄 Total Refreshes: ${summary.totalRefreshes}\n` +
          `📊 Avg Staleness: ${summary.avgStaleness.toFixed(1)}%`;
        break;
      }
      default:
        responseText = "ไม่รู้จักคำสั่งนี้ ลอง /menu ใหม่ครับ";
    }
  } catch (error: any) {
    responseText = `เกิดข้อผิดพลาด: ${error.message}`;
  }
  
  await sendTelegramReply(config, chatId, responseText);
}

// ═══════════════════════════════════════════════════════
//  EXECUTIVE DAILY SUMMARY — successes only, no failures
// ═══════════════════════════════════════════════════════

export async function generateExecutiveSummary(): Promise<string> {
  const now = new Date();
  const bangkokDate = now.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", year: "numeric", month: "long", day: "numeric" });
  const bangkokTime = now.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
  
  let sections: string[] = [];
  sections.push(`📋 สรุปผลงาน DomainSlayer\n${bangkokDate} เวลา ${bangkokTime}`);
  sections.push("─────────────────────");
  
  // 1. Attack Results — successes only
  try {
    const { getAttackStats } = await import("./db");
    const stats = await getAttackStats();
    if (stats.totalSuccess > 0) {
      sections.push(
        `⚔️ ผลโจมตี\n` +
        `  ✅ สำเร็จ ${stats.totalSuccess} เว็บ\n` +
        `  📊 อัตราสำเร็จ ${stats.successRate}%` +
        (stats.topMethods.length > 0 ? `\n  🏆 วิธีที่ได้ผล: ${stats.topMethods.slice(0, 3).map(m => m.method).join(", ")}` : "")
      );
    }
  } catch {}
  
  // 2. Deploy/Redirect — successes only (today)
  try {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (db) {
      const { eq, sql, count } = await import("drizzle-orm");
      const { deployHistory } = await import("../drizzle/schema");
      // Today's successful deploys
      const [successRow] = await db.select({ cnt: count() })
        .from(deployHistory)
        .where(sql`${deployHistory.status} = 'success' AND DATE(${deployHistory.createdAt}) = CURDATE()`);
      const todaySuccess = successRow?.cnt || 0;
      
      if (todaySuccess > 0) {
        // Get total files deployed today
        const [filesRow] = await db.select({ total: sql<number>`COALESCE(SUM(${deployHistory.filesDeployed}), 0)` })
          .from(deployHistory)
          .where(sql`${deployHistory.status} = 'success' AND DATE(${deployHistory.createdAt}) = CURDATE()`);
        const totalFiles = filesRow?.total || 0;
        
        // Get total verified redirects today
        const [redirectRow] = await db.select({ cnt: count() })
          .from(deployHistory)
          .where(sql`${deployHistory.redirectActive} = 1 AND DATE(${deployHistory.createdAt}) = CURDATE()`);
        const redirectsActive = redirectRow?.cnt || 0;
        
        sections.push(
          `🎯 วาง Redirect วันนี้\n` +
          `  ✅ สำเร็จ ${todaySuccess} เว็บ\n` +
          `  📁 ไฟล์ที่วาง ${totalFiles} ไฟล์\n` +
          `  🔀 Redirect ทำงาน ${redirectsActive} เว็บ`
        );
      }
    }
  } catch {}
  
  // 3. Sprint Progress
  try {
    const { getActiveSeoSprints } = await import("./seo-orchestrator");
    const sprints = getActiveSeoSprints();
    if (sprints.length > 0) {
      const sprintLines = sprints.map(s => {
        let line = `  • ${s.domain} — Day ${s.currentDay}/7`;
        if (s.bestRankAchieved < 999) line += ` | Best #${s.bestRankAchieved}`;
        line += ` | Progress ${s.overallProgress}%`;
        if (s.sprintRound > 1) line += ` | Round ${s.sprintRound}`;
        return line;
      });
      sections.push(`🏃 SEO Sprint\n${sprintLines.join("\n")}`);
    }
  } catch {}
  
  // 4. Ranking Improvements — only show improvements
  try {
    const { getRankDashboardStats } = await import("./db");
    const stats = await getRankDashboardStats();
    if (stats && (stats.top10 > 0 || stats.improved > 0)) {
      let rankText = `📈 Ranking`;
      if (stats.top3 > 0) rankText += `\n  🥇 Top 3: ${stats.top3} keywords`;
      if (stats.top10 > 0) rankText += `\n  🏆 Top 10: ${stats.top10} keywords`;
      if (stats.improved > 0) rankText += `\n  ⬆️ ขึ้นอันดับ: ${stats.improved} keywords`;
      if (stats.avgPosition > 0) rankText += `\n  📍 Avg Position: #${stats.avgPosition}`;
      sections.push(rankText);
    }
  } catch {}
  
  // 5. PBN Network
  try {
    const { getUserPbnSites } = await import("./db");
    const sites = await getUserPbnSites();
    const active = sites.filter((s: any) => s.status === "active" || !s.status);
    if (active.length > 0) {
      sections.push(`🌐 PBN Network\n  ✅ Active: ${active.length} sites`);
    }
  } catch {}
  
  // 6. Content Freshness
  try {
    const { getFreshnessSummary } = await import("./content-freshness-engine");
    const summary = await getFreshnessSummary();
    if (summary.totalTracked > 0 && summary.fresh > 0) {
      sections.push(
        `📄 Content\n` +
        `  ✅ Fresh: ${summary.fresh}/${summary.totalTracked}` +
        (summary.totalRefreshes > 0 ? ` | Refreshed: ${summary.totalRefreshes}` : "")
      );
    }
  } catch {}
  
  sections.push("─────────────────────");
  sections.push("💡 พิมพ์ /menu เพื่อดูรายละเอียดเพิ่มเติม");
  
  // If no data sections were added (only header + dividers + footer)
  if (sections.length <= 4) {
    sections.splice(2, 0, "😴 วันนี้ยังไม่มีผลลัพธ์ใหม่");
  }
  
  return sections.join("\n\n");
}

// ═══════════════════════════════════════════════════════
//  DAILY SUMMARY SCHEDULER — 8:00 AM Bangkok time
// ═══════════════════════════════════════════════════════

let dailySummaryTimer: ReturnType<typeof setInterval> | null = null;

function getNextBangkok8AM(): Date {
  const now = new Date();
  // Bangkok is UTC+7
  const bangkokOffset = 7 * 60; // minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const bangkokMinutes = utcMinutes + bangkokOffset;
  const bangkokHour = Math.floor((bangkokMinutes % (24 * 60)) / 60);
  
  // Target: 8:00 AM Bangkok = 1:00 AM UTC
  const targetUTCHour = 1; // 8 AM Bangkok = 1 AM UTC
  
  const next = new Date(now);
  next.setUTCHours(targetUTCHour, 0, 0, 0);
  
  // If already past 8 AM Bangkok today, schedule for tomorrow
  if (now >= next) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  
  return next;
}

async function sendDailySummaryToAll(): Promise<void> {
  const config = getTelegramConfig();
  if (!config) return;
  
  const summary = await generateExecutiveSummary();
  const chatIds = getAllowedChatIds();
  
  for (const chatId of chatIds) {
    try {
      await sendTelegramReply(config, chatId, summary);
      console.log(`[TelegramAI] Daily summary sent to chat ${chatId}`);
    } catch (error: any) {
      console.error(`[TelegramAI] Failed to send daily summary to ${chatId}: ${error.message}`);
    }
  }
}

export function startDailySummaryScheduler(): void {
  if (dailySummaryTimer) return;
  
  const scheduleNext = () => {
    const next8AM = getNextBangkok8AM();
    const msUntil = next8AM.getTime() - Date.now();
    
    console.log(`[TelegramAI] 📅 Daily summary scheduled for ${next8AM.toISOString()} (${Math.round(msUntil / 60000)} min from now)`);
    
    dailySummaryTimer = setTimeout(async () => {
      console.log("[TelegramAI] 📋 Sending daily executive summary...");
      await sendDailySummaryToAll();
      // Schedule next day
      dailySummaryTimer = null;
      scheduleNext();
    }, msUntil);
  };
  
  scheduleNext();
}

export function stopDailySummaryScheduler(): void {
  if (dailySummaryTimer) {
    clearTimeout(dailySummaryTimer);
    dailySummaryTimer = null;
    console.log("[TelegramAI] Daily summary scheduler stopped");
  }
}

export function isDailySummarySchedulerActive(): boolean {
  return dailySummaryTimer !== null;
}

export async function removeTelegramWebhook(): Promise<{ success: boolean; error?: string }> {
  const config = getTelegramConfig();
  if (!config) return { success: false, error: "Telegram not configured" };
  
  try {
    const url = `https://api.telegram.org/bot${config.botToken}/deleteWebhook`;
    const { response } = await fetchWithPoolProxy(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: true }),
      signal: AbortSignal.timeout(10000),
    }, { targetDomain: "api.telegram.org", timeout: 10000 });
    
    const result = await response.json() as any;
    return result.ok ? { success: true } : { success: false, error: result.description };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
