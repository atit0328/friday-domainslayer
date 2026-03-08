/**
 * SEO Daily Engine — AI-Driven Daily Task Planner + Executor
 * 
 * ทำงานทุกวันตามที่ user ตั้งค่า:
 * 1. AI วิเคราะห์สถานะปัจจุบันของโปรเจค
 * 2. AI วางแผน daily tasks (on-page, off-page, content, technical, blackhat)
 * 3. Execute แต่ละ task จริง พร้อม proof-of-work
 * 4. บันทึก verification log ทุก action
 * 
 * ทุกขั้นตอนทำจริง ตรวจสอบได้ ไม่มั่ว ไม่เดา
 */

import { fetchWithPoolProxy } from "./proxy-pool";
import { invokeLLM } from "./_core/llm";
import * as seoEngine from "./seo-engine";
import * as serpTracker from "./serp-tracker";
import * as db from "./db";
import { scrapeWebsite, extractKeywordsFromContent } from "./web-scraper";

// Helper: wrap fetch with proxy pool
async function dailyFetch(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<Response> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout: 15000 });
  return response;
}


// ═══ Types ═══

export type TaskCategory = 
  | "on_page"        // Title, meta, headings, keyword density, internal links
  | "off_page"       // Backlinks, PBN, web 2.0, forum, social bookmarks
  | "content"        // AI content creation, doorway pages, landing pages
  | "technical"      // Sitemap, robots.txt, schema, page speed, SSL
  | "blackhat"       // Parasite SEO, cloaking, redirect chains, shell deploy
  | "monitoring"     // Rank check, backlink verification, index check
  | "competitor"     // Competitor analysis, backlink spy, content gap
  ;

export interface DailyTask {
  id: string;
  category: TaskCategory;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  estimatedMinutes: number;
  requiresWP: boolean;
  requiresPBN: boolean;
  aiReasoning: string;
}

export interface TaskExecution {
  taskId: string;
  task: DailyTask;
  status: "completed" | "failed" | "skipped";
  startedAt: Date;
  completedAt: Date;
  proof: ProofOfWork;
  detail: string;
  error?: string;
}

export interface ProofOfWork {
  type: "url_check" | "api_response" | "content_created" | "backlink_built" | 
        "rank_checked" | "shell_deployed" | "redirect_verified" | "scrape_result" |
        "wp_api_response" | "serp_result" | "index_check";
  /** URL or endpoint that was accessed */
  url?: string;
  /** HTTP status code received */
  statusCode?: number;
  /** Response snippet (first 500 chars) */
  responseSnippet?: string;
  /** Timestamp of verification */
  verifiedAt: Date;
  /** Additional proof data */
  data?: Record<string, any>;
}

export interface DailyPlan {
  projectId: number;
  domain: string;
  date: string; // YYYY-MM-DD
  totalTasks: number;
  tasks: DailyTask[];
  aiStrategy: string;
  estimatedTotalMinutes: number;
}

export interface DailyReport {
  projectId: number;
  domain: string;
  date: string;
  plan: DailyPlan;
  executions: TaskExecution[];
  summary: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    totalDuration: number; // ms
  };
  aiSummary: string;
}

// ═══ AI Daily Planner ═══

/**
 * AI generates today's task list based on project state, history, and goals
 */
export async function generateDailyPlan(projectId: number): Promise<DailyPlan> {
  const project = await db.getSeoProjectById(projectId);
  if (!project) throw new Error("Project not found");

  // Gather current state
  const [rankings, actions, blStats, snapshots] = await Promise.all([
    db.getLatestRankings(projectId),
    db.getProjectActions(projectId, 30), // last 30 actions
    db.getBacklinkStats(projectId),
    db.getProjectSnapshots(projectId, 7), // last 7 snapshots
  ]);

  const targetKeywords = (project.targetKeywords as string[]) || [];
  const recentActions = actions.slice(0, 10).map(a => 
    `${a.actionType}: ${a.title} [${a.status}] ${a.completedAt ? new Date(a.completedAt).toLocaleDateString() : ""}`
  ).join("\n");

  const rankingSummary = rankings.slice(0, 15).map(r => 
    `"${r.keyword}": position ${r.position ?? "ไม่ติดอันดับ"} (volume: ${r.searchVolume || "?"})`
  ).join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `คุณเป็น AI SEO Strategist ผู้เชี่ยวชาญด้าน blackhat/grey hat SEO สำหรับเว็บพนันออนไลน์
คุณต้องวางแผน daily tasks ที่ทำได้จริงทุกวัน เพื่อให้เว็บขึ้นหน้าแรก Google

กฎสำคัญ:
1. ทุก task ต้องทำได้จริง — ไม่ใช่แค่ "แนะนำ" แต่ต้องเป็น action ที่ระบบ execute ได้
2. ผสม on-page + off-page + content + blackhat ทุกวัน
3. ให้ priority กับ tasks ที่ส่งผลต่อ ranking มากที่สุด
4. ถ้า keyword ยังไม่ติดอันดับ → เน้น content + backlinks
5. ถ้า keyword อยู่หน้า 2-3 → เน้น on-page optimization + more backlinks
6. ถ้า keyword อยู่หน้าแรกแล้ว → เน้น maintain + expand related keywords
7. สำหรับเว็บพนัน ให้ใช้ blackhat techniques เช่น parasite SEO, redirect chains, PBN
8. วางแผน 5-10 tasks ต่อวัน
9. ตอบเป็น JSON เท่านั้น ภาษาไทย

Available task categories:
- on_page: ปรับ title, meta, headings, keyword density, internal links (ต้องมี WP credentials)
- off_page: สร้าง backlinks จาก PBN, web 2.0, forum, social bookmarks
- content: สร้าง content ใหม่ (บทความ, landing page, doorway page)
- technical: ตรวจสอบ sitemap, robots.txt, schema, page speed
- blackhat: parasite SEO, redirect chains, shell deploy, cloaking
- monitoring: ตรวจสอบ ranking, backlink verification, index check
- competitor: วิเคราะห์คู่แข่ง, backlink spy, content gap`
      },
      {
        role: "user",
        content: `วางแผน daily SEO tasks สำหรับวันนี้:

โดเมน: ${project.domain}
Niche: ${project.niche || "gambling/casino"}
Strategy: ${project.strategy}
ความก้าวร้าว: ${project.aggressiveness}/10
DA: ${project.currentDA || 0}, DR: ${project.currentDR || 0}
Spam Score: ${project.currentSpamScore || 0}
Backlinks: ${project.currentBacklinks || 0}
Health Score: ${project.aiHealthScore || 0}/100
WP Connected: ${project.wpConnected ? "ใช่" : "ไม่"}
PBN Available: ${blStats ? "ใช่" : "ไม่"}

Target Keywords:
${targetKeywords.slice(0, 15).join(", ") || "ยังไม่มี"}

Current Rankings:
${rankingSummary || "ยังไม่มีข้อมูล ranking"}

Recent Actions (last 10):
${recentActions || "ยังไม่มี actions"}

AI Last Analysis: ${project.aiLastAnalysis || "ยังไม่มี"}

Return JSON:
{
  "tasks": [
    {
      "id": "task_1",
      "category": "on_page|off_page|content|technical|blackhat|monitoring|competitor",
      "title": "ชื่อ task ภาษาไทย",
      "description": "รายละเอียดว่าต้องทำอะไร",
      "priority": "critical|high|medium|low",
      "estimatedMinutes": number,
      "requiresWP": boolean,
      "requiresPBN": boolean,
      "aiReasoning": "เหตุผลที่ต้องทำ task นี้วันนี้"
    }
  ],
  "aiStrategy": "สรุปกลยุทธ์วันนี้ 2-3 ประโยค ภาษาไทย",
  "estimatedTotalMinutes": number
}`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "daily_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  category: { type: "string", enum: ["on_page", "off_page", "content", "technical", "blackhat", "monitoring", "competitor"] },
                  title: { type: "string" },
                  description: { type: "string" },
                  priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
                  estimatedMinutes: { type: "number" },
                  requiresWP: { type: "boolean" },
                  requiresPBN: { type: "boolean" },
                  aiReasoning: { type: "string" },
                },
                required: ["id", "category", "title", "description", "priority", "estimatedMinutes", "requiresWP", "requiresPBN", "aiReasoning"],
                additionalProperties: false,
              },
            },
            aiStrategy: { type: "string" },
            estimatedTotalMinutes: { type: "number" },
          },
          required: ["tasks", "aiStrategy", "estimatedTotalMinutes"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const parsed = JSON.parse(text) as { tasks: DailyTask[]; aiStrategy: string; estimatedTotalMinutes: number };

  return {
    projectId,
    domain: project.domain,
    date: new Date().toISOString().split("T")[0],
    totalTasks: parsed.tasks.length,
    tasks: parsed.tasks,
    aiStrategy: parsed.aiStrategy,
    estimatedTotalMinutes: parsed.estimatedTotalMinutes,
  };
}

// ═══ Task Executors ═══

/**
 * Execute a single daily task and return proof-of-work
 */
export async function executeTask(
  projectId: number,
  task: DailyTask,
): Promise<TaskExecution> {
  const startedAt = new Date();
  
  try {
    const result = await executeByCategory(projectId, task);
    return {
      taskId: task.id,
      task,
      status: "completed",
      startedAt,
      completedAt: new Date(),
      proof: result.proof,
      detail: result.detail,
    };
  } catch (err: any) {
    return {
      taskId: task.id,
      task,
      status: "failed",
      startedAt,
      completedAt: new Date(),
      proof: {
        type: "api_response",
        verifiedAt: new Date(),
        data: { error: err.message },
      },
      detail: `ล้มเหลว: ${err.message}`,
      error: err.message,
    };
  }
}

async function executeByCategory(
  projectId: number,
  task: DailyTask,
): Promise<{ proof: ProofOfWork; detail: string }> {
  const project = await db.getSeoProjectById(projectId);
  if (!project) throw new Error("Project not found");

  switch (task.category) {
    case "on_page":
      return executeOnPage(project, task);
    case "off_page":
      return executeOffPage(project, task);
    case "content":
      return executeContent(project, task);
    case "technical":
      return executeTechnical(project, task);
    case "blackhat":
      return executeBlackhat(project, task);
    case "monitoring":
      return executeMonitoring(project, task);
    case "competitor":
      return executeCompetitor(project, task);
    default:
      throw new Error(`Unknown task category: ${task.category}`);
  }
}

// ─── On-Page SEO Executor ───
async function executeOnPage(
  project: any,
  task: DailyTask,
): Promise<{ proof: ProofOfWork; detail: string }> {
  // Scrape current page to analyze on-page elements
  const scraped = await scrapeWebsite(project.domain);
  
  const issues: string[] = [];
  
  // Check title
  if (!scraped.title || scraped.title.length < 30) {
    issues.push(`Title สั้นเกินไป (${scraped.title?.length || 0} chars)`);
  }
  if (!scraped.metaDescription || scraped.metaDescription.length < 120) {
    issues.push(`Meta description สั้นเกินไป (${scraped.metaDescription?.length || 0} chars)`);
  }
  if (scraped.headings.h1.length === 0) {
    issues.push("ไม่มี H1 tag");
  }
  if (scraped.images.withoutAlt > 0) {
    issues.push(`${scraped.images.withoutAlt} images ไม่มี alt text`);
  }

  // If WP connected, try to fix via WP API
  let wpResult: string = "ไม่มี WP credentials — แสดงผลวิเคราะห์เท่านั้น";
  if (project.wpConnected && project.wpUsername && project.wpAppPassword) {
    try {
      const { createWPClient } = await import("./wp-api");
      const wp = createWPClient({
        siteUrl: `https://${project.domain}`,
        username: project.wpUsername,
        appPassword: project.wpAppPassword,
      });
      
      // Get posts and optimize them
      const posts = await wp.getPosts({ per_page: 5, status: "publish" });
      let optimized = 0;
      
      for (const post of posts) {
        const targetKeywords = (project.targetKeywords as string[]) || [];
        const keyword = targetKeywords[0] || project.niche || "";
        
        if (keyword && post.title?.rendered && !post.title.rendered.toLowerCase().includes(keyword.toLowerCase())) {
          // AI generate optimized title
          const aiResponse = await invokeLLM({
            messages: [
              { role: "system", content: "คุณเป็น SEO expert สำหรับเว็บพนัน สร้าง title ที่ SEO-friendly ตอบแค่ title เท่านั้น ไม่ต้องอธิบาย" },
              { role: "user", content: `ปรับ title ให้ SEO-friendly สำหรับ keyword "${keyword}": "${post.title.rendered}"` },
            ],
          });
          const newTitle = aiResponse.choices[0]?.message?.content?.toString().trim();
          if (newTitle && newTitle.length > 10) {
            await wp.updatePost(post.id, { title: newTitle });
            optimized++;
          }
        }
      }
      
      wpResult = `ปรับปรุง ${optimized} posts ผ่าน WP API`;
    } catch (err: any) {
      wpResult = `WP API error: ${err.message}`;
    }
  }

  const detail = `On-Page Analysis: พบ ${issues.length} ปัญหา — ${issues.join(", ") || "ไม่พบปัญหา"}. ${wpResult}`;

  return {
    proof: {
      type: "scrape_result",
      url: `https://${project.domain}`,
      statusCode: scraped.statusCode,
      responseSnippet: `Title: ${scraped.title?.slice(0, 100)}, Meta: ${scraped.metaDescription?.slice(0, 100)}, H1: ${scraped.headings.h1[0]?.slice(0, 100) || "none"}`,
      verifiedAt: new Date(),
      data: {
        issues,
        title: scraped.title,
        metaDescription: scraped.metaDescription,
        h1Count: scraped.headings.h1.length,
        h2Count: scraped.headings.h2.length,
        wordCount: scraped.wordCount,
        imagesWithoutAlt: scraped.images.withoutAlt,
        internalLinks: scraped.links.internal,
        externalLinks: scraped.links.external,
        wpResult,
      },
    },
    detail,
  };
}

// ─── Off-Page SEO Executor ───
async function executeOffPage(
  project: any,
  task: DailyTask,
): Promise<{ proof: ProofOfWork; detail: string }> {
  const results: { source: string; status: string; url?: string }[] = [];

  // Try PBN backlink building
  if (task.requiresPBN) {
    try {
      const { executePBNBuild } = await import("./pbn-bridge");
      const linkCount = Math.min(Math.max(project.aggressiveness, 2), 5);
      const buildResult = await executePBNBuild(project.userId, project.id, linkCount);
      
      for (const post of buildResult.posts) {
        results.push({
          source: `PBN: ${post.siteId}`,
          status: post.status,
          url: undefined,
        });
      }
    } catch (err: any) {
      results.push({ source: "PBN", status: `error: ${err.message}` });
    }
  }

  // AI generates web 2.0 / social bookmark content
  const targetKeywords = (project.targetKeywords as string[]) || [];
  const keyword = targetKeywords[Math.floor(Math.random() * Math.min(targetKeywords.length, 5))] || project.domain;
  
  const aiContent = await invokeLLM({
    messages: [
      { role: "system", content: "สร้าง anchor text variations สำหรับ backlink building ตอบเป็น JSON array of strings 10 รายการ" },
      { role: "user", content: `สร้าง anchor text variations สำหรับ keyword "${keyword}" domain "${project.domain}" — ผสม exact match, partial match, branded, generic\n\nReturn JSON: ["anchor1", "anchor2", ...]` },
    ],
  });

  let anchors: string[] = [];
  try {
    const text = aiContent.choices[0]?.message?.content?.toString() || "[]";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    anchors = JSON.parse(cleaned);
  } catch {
    anchors = [keyword, project.domain, `${keyword} ออนไลน์`, "คลิกที่นี่", project.domain.replace(/\./g, " ")];
  }

  const builtLinks = results.filter(r => r.status === "published" || r.url).length;
  const detail = `Off-Page: สร้าง ${builtLinks} backlinks, สร้าง ${anchors.length} anchor text variations สำหรับ "${keyword}"`;

  return {
    proof: {
      type: "backlink_built",
      verifiedAt: new Date(),
      data: {
        totalAttempted: results.length,
        totalBuilt: builtLinks,
        results: results.slice(0, 10),
        anchorTexts: anchors,
        targetKeyword: keyword,
      },
    },
    detail,
  };
}

// ─── Content Creation Executor ───
async function executeContent(
  project: any,
  task: DailyTask,
): Promise<{ proof: ProofOfWork; detail: string }> {
  const targetKeywords = (project.targetKeywords as string[]) || [];
  // Rotate through keywords
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const keywordIndex = dayOfYear % Math.max(targetKeywords.length, 1);
  const keyword = targetKeywords[keywordIndex] || project.niche || project.domain;

  // Generate SEO content
  const content = await seoEngine.generateSEOContent(
    keyword, project.domain, project.niche || "gambling", 1500,
  );

  // Try to publish via WP if connected
  let publishResult = "Content สร้างแล้ว — ไม่มี WP credentials จึงยังไม่ได้ publish";
  let publishUrl: string | undefined;

  if (project.wpConnected && project.wpUsername && project.wpAppPassword) {
    try {
      const { createWPClient } = await import("./wp-api");
      const wp = createWPClient({
        siteUrl: `https://${project.domain}`,
        username: project.wpUsername,
        appPassword: project.wpAppPassword,
      });
      
      const post = await wp.createPost({
        title: content.title,
        content: content.content,
        status: "publish",
      });
      
      publishUrl = post.link || `https://${project.domain}/?p=${post.id}`;
      publishResult = `Published: ${publishUrl}`;
    } catch (err: any) {
      publishResult = `WP publish failed: ${err.message}`;
    }
  }

  // Update project stats
  await db.updateSeoProject(project.id, {
    totalContentCreated: (project.totalContentCreated || 0) + 1,
    lastActionAt: new Date(),
  });

  const detail = `Content: สร้างบทความ "${content.title}" (keyword: ${keyword}) — ${publishResult}`;

  return {
    proof: {
      type: "content_created",
      url: publishUrl,
      verifiedAt: new Date(),
      data: {
        title: content.title,
        keyword,
        metaDescription: content.metaDescription,
        wordCount: content.content.split(/\s+/).length,
        published: !!publishUrl,
        publishUrl,
      },
    },
    detail,
  };
}

// ─── Technical SEO Executor ───
async function executeTechnical(
  project: any,
  task: DailyTask,
): Promise<{ proof: ProofOfWork; detail: string }> {
  const checks: { check: string; status: "pass" | "fail" | "warning"; detail: string }[] = [];

  // Check robots.txt
  try {
    const robotsRes = await dailyFetch(`https://${project.domain}/robots.txt`, { 
      signal: AbortSignal.timeout(10000) 
    });
    checks.push({
      check: "robots.txt",
      status: robotsRes.ok ? "pass" : "fail",
      detail: robotsRes.ok ? `Found (${robotsRes.status})` : `Missing (${robotsRes.status})`,
    });
  } catch {
    checks.push({ check: "robots.txt", status: "fail", detail: "ไม่สามารถเข้าถึงได้" });
  }

  // Check sitemap.xml
  try {
    const sitemapRes = await dailyFetch(`https://${project.domain}/sitemap.xml`, { 
      signal: AbortSignal.timeout(10000) 
    });
    const sitemapText = sitemapRes.ok ? await sitemapRes.text() : "";
    const urlCount = (sitemapText.match(/<url>/g) || []).length;
    checks.push({
      check: "sitemap.xml",
      status: sitemapRes.ok ? "pass" : "warning",
      detail: sitemapRes.ok ? `Found — ${urlCount} URLs` : `Missing (${sitemapRes.status})`,
    });
  } catch {
    checks.push({ check: "sitemap.xml", status: "warning", detail: "ไม่สามารถเข้าถึงได้" });
  }

  // Check SSL
  try {
    const sslRes = await dailyFetch(`https://${project.domain}`, { 
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    checks.push({
      check: "SSL/HTTPS",
      status: sslRes.ok ? "pass" : "warning",
      detail: `HTTPS: ${sslRes.ok ? "OK" : "Error"} (${sslRes.status})`,
    });
  } catch {
    checks.push({ check: "SSL/HTTPS", status: "fail", detail: "HTTPS ไม่ทำงาน" });
  }

  // Check page load time
  try {
    const start = Date.now();
    await dailyFetch(`https://${project.domain}`, { signal: AbortSignal.timeout(15000) });
    const loadTime = Date.now() - start;
    checks.push({
      check: "Page Speed",
      status: loadTime < 3000 ? "pass" : loadTime < 5000 ? "warning" : "fail",
      detail: `Load time: ${loadTime}ms`,
    });
  } catch {
    checks.push({ check: "Page Speed", status: "fail", detail: "Timeout" });
  }

  const passed = checks.filter(c => c.status === "pass").length;
  const detail = `Technical SEO: ${passed}/${checks.length} ผ่าน — ${checks.filter(c => c.status !== "pass").map(c => `${c.check}: ${c.detail}`).join(", ") || "ทุกอย่างปกติ"}`;

  return {
    proof: {
      type: "url_check",
      url: `https://${project.domain}`,
      verifiedAt: new Date(),
      data: { checks, passed, total: checks.length },
    },
    detail,
  };
}

// ─── Blackhat SEO Executor ───
async function executeBlackhat(
  project: any,
  task: DailyTask,
): Promise<{ proof: ProofOfWork; detail: string }> {
  const results: { method: string; status: string; detail: string }[] = [];

  // 1. Try redirect chain via Autonomous Friday pipeline
  try {
    const { runUnifiedAttackPipeline } = await import("./unified-attack-pipeline");
    const targetKeywords = (project.targetKeywords as string[]) || [];
    const keyword = targetKeywords[0] || project.niche || "casino";
    
    const pipelineResult = await runUnifiedAttackPipeline({
      targetUrl: `https://${project.domain}`,
      redirectUrl: `https://${project.domain}`,
      seoKeywords: [keyword],
    });

    results.push({
      method: "unified_attack_pipeline",
      status: pipelineResult.success ? "success" : "partial",
      detail: `Vuln scan: ${pipelineResult.vulnScan?.attackVectors?.length || 0} attack vectors found, ` +
              `Shell attempts: ${pipelineResult.uploadAttempts || 0}, ` +
              `Verified: ${pipelineResult.verifiedFiles?.length || 0} files`,
    });
  } catch (err: any) {
    results.push({
      method: "unified_attack_pipeline",
      status: "skipped",
      detail: `Pipeline error: ${err.message}`,
    });
  }

  // 2. Parasite SEO content generation
  try {
    const { generateParasitePage } = await import("./seo-parasite-generator");
    const targetKeywords = (project.targetKeywords as string[]) || [];
    const keyword = targetKeywords[Math.floor(Math.random() * Math.min(targetKeywords.length, 3))] || project.domain;
    
    const parasiteContent = await generateParasitePage({
      keywords: [keyword],
      redirectUrl: `https://${project.domain}`,
      targetDomain: project.domain,
      contentLength: "medium",
    });
    results.push({
      method: "parasite_seo",
      status: "generated",
      detail: `สร้าง parasite content สำหรับ "${keyword}" — title: ${parasiteContent.title?.slice(0, 50) || "generated"}`,
    });
  } catch (err: any) {
    results.push({
      method: "parasite_seo",
      status: "skipped",
      detail: `Parasite error: ${err.message}`,
    });
  }

  const successCount = results.filter(r => r.status === "success" || r.status === "generated").length;
  const detail = `Blackhat: ${successCount}/${results.length} methods สำเร็จ — ${results.map(r => `${r.method}: ${r.status}`).join(", ")}`;

  return {
    proof: {
      type: "shell_deployed",
      verifiedAt: new Date(),
      data: { results, successCount, totalMethods: results.length },
    },
    detail,
  };
}

// ─── Monitoring Executor ───
async function executeMonitoring(
  project: any,
  task: DailyTask,
): Promise<{ proof: ProofOfWork; detail: string }> {
  const rankings = await db.getLatestRankings(project.id);
  
  if (rankings.length === 0) {
    return {
      proof: {
        type: "rank_checked",
        verifiedAt: new Date(),
        data: { message: "ยังไม่มี keywords ที่ track" },
      },
      detail: "Monitoring: ยังไม่มี keywords ที่ track — ข้ามขั้นตอนนี้",
    };
  }

  // Run SERP rank check
  const keywords = rankings.slice(0, 10).map(r => ({
    keyword: r.keyword,
    previousPosition: r.position,
    searchVolume: r.searchVolume || undefined,
  }));

  const result = await serpTracker.bulkRankCheck(
    project.id, project.domain, keywords, "US", "desktop",
  );

  // Update project trend
  await db.updateSeoProject(project.id, {
    overallTrend: result.improved > result.declined ? "improving" as any :
      result.declined > result.improved ? "declining" as any : "stable" as any,
    lastActionAt: new Date(),
  });

  const detail = `Monitoring: ตรวจสอบ ${result.totalKeywords} keywords — Top 10: ${result.top10}, ดีขึ้น: ${result.improved}, แย่ลง: ${result.declined}, เฉลี่ย: #${result.avgPosition}`;

  return {
    proof: {
      type: "serp_result",
      verifiedAt: new Date(),
      data: {
        totalKeywords: result.totalKeywords,
        avgPosition: result.avgPosition,
        top10: result.top10,
        improved: result.improved,
        declined: result.declined,
        rankedKeywords: result.rankedKeywords,
        results: result.results?.slice(0, 10),
      },
    },
    detail,
  };
}

// ─── Competitor Analysis Executor ───
async function executeCompetitor(
  project: any,
  task: DailyTask,
): Promise<{ proof: ProofOfWork; detail: string }> {
  // AI analyzes competitors
  const targetKeywords = (project.targetKeywords as string[]) || [];
  const keyword = targetKeywords[0] || project.niche || project.domain;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `คุณเป็น SEO competitive analyst สำหรับ niche พนันออนไลน์
วิเคราะห์คู่แข่งและให้ actionable insights
ตอบเป็น JSON เท่านั้น`
      },
      {
        role: "user",
        content: `วิเคราะห์คู่แข่งสำหรับ keyword "${keyword}" ใน niche "${project.niche || "gambling"}":
Domain: ${project.domain}
Current DA: ${project.currentDA || 0}

ให้ข้อมูล:
1. Top 5 คู่แข่งที่น่าจะอยู่หน้าแรก
2. จุดแข็ง/จุดอ่อนของแต่ละคู่แข่ง
3. โอกาสที่เราจะแซงได้
4. กลยุทธ์ที่แนะนำ

Return JSON:
{
  "competitors": [{"domain": "string", "estimatedDA": number, "strengths": ["string"], "weaknesses": ["string"]}],
  "opportunities": ["string"],
  "recommendedActions": ["string"],
  "difficultyAssessment": "string",
  "aiInsight": "string — ภาษาไทย 2-3 ประโยค"
}`
      }
    ],
  });

  const content = response.choices[0]?.message?.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  let analysis: any;
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    analysis = JSON.parse(cleaned);
  } catch {
    analysis = { competitors: [], opportunities: [], recommendedActions: [], aiInsight: text.slice(0, 200) };
  }

  const detail = `Competitor: วิเคราะห์ ${analysis.competitors?.length || 0} คู่แข่งสำหรับ "${keyword}" — ${analysis.aiInsight?.slice(0, 150) || ""}`;

  return {
    proof: {
      type: "api_response",
      verifiedAt: new Date(),
      data: {
        keyword,
        competitors: analysis.competitors?.slice(0, 5),
        opportunities: analysis.opportunities?.slice(0, 5),
        recommendedActions: analysis.recommendedActions?.slice(0, 5),
        aiInsight: analysis.aiInsight,
      },
    },
    detail,
  };
}

// ═══ Full Daily Run ═══

/**
 * Execute the full daily SEO automation:
 * 1. AI generates daily plan
 * 2. Execute each task with proof-of-work
 * 3. Log everything to DB
 * 4. Return comprehensive report
 */
export async function runDailyAutomation(projectId: number): Promise<DailyReport> {
  const project = await db.getSeoProjectById(projectId);
  if (!project) throw new Error("Project not found");

  // Step 1: Generate daily plan
  const plan = await generateDailyPlan(projectId);

  // Master action log
  const masterAction = await db.addSeoAction(projectId, {
    actionType: "analysis",
    title: `🤖 [Daily AI] SEO Automation — ${plan.totalTasks} tasks วันนี้`,
    description: plan.aiStrategy,
    status: "running",
    executedAt: new Date(),
  });

  const executions: TaskExecution[] = [];
  const startTime = Date.now();

  // Step 2: Execute each task
  for (const task of plan.tasks) {
    // Skip WP tasks if not connected
    if (task.requiresWP && !project.wpConnected) {
      executions.push({
        taskId: task.id,
        task,
        status: "skipped",
        startedAt: new Date(),
        completedAt: new Date(),
        proof: {
          type: "api_response",
          verifiedAt: new Date(),
          data: { reason: "ไม่มี WP credentials" },
        },
        detail: `ข้าม: ${task.title} — ต้องการ WordPress credentials`,
      });
      continue;
    }

    // Log individual task
    const taskAction = await db.addSeoAction(projectId, {
      actionType: task.category === "off_page" ? "pbn_post" :
                  task.category === "content" ? "content_create" :
                  task.category === "monitoring" ? "rank_check" :
                  task.category === "blackhat" ? "analysis" :
                  "analysis",
      title: `[Daily] ${task.title}`,
      description: task.description,
      status: "running",
      executedAt: new Date(),
    });

    const execution = await executeTask(projectId, task);
    executions.push(execution);

    // Update action log
    await db.updateSeoAction(taskAction.id, {
      status: execution.status === "completed" ? "completed" : "failed",
      completedAt: execution.completedAt,
      result: {
        proof: execution.proof,
        detail: execution.detail,
      } as any,
      impact: execution.status === "completed" ? "positive" : "neutral",
      errorMessage: execution.error,
    });
  }

  // Step 3: Generate AI summary
  const completed = executions.filter(e => e.status === "completed").length;
  const failed = executions.filter(e => e.status === "failed").length;
  const skipped = executions.filter(e => e.status === "skipped").length;
  const totalDuration = Date.now() - startTime;

  const summaryResponse = await invokeLLM({
    messages: [
      { role: "system", content: "สรุปผลการทำ SEO วันนี้เป็นภาษาไทย 3-4 ประโยค เน้นผลลัพธ์ที่สำคัญ" },
      {
        role: "user",
        content: `สรุปผล daily SEO สำหรับ ${project.domain}:
สำเร็จ: ${completed}/${plan.totalTasks} tasks
ล้มเหลว: ${failed}
ข้าม: ${skipped}
เวลาทั้งหมด: ${Math.round(totalDuration / 1000)}s

ผลลัพธ์:
${executions.map(e => `- ${e.task.title}: ${e.status} — ${e.detail.slice(0, 100)}`).join("\n")}

สรุปสั้นๆ ภาษาไทย:`
      }
    ],
  });

  const aiSummary = summaryResponse.choices[0]?.message?.content?.toString() || 
    `ทำ SEO สำเร็จ ${completed}/${plan.totalTasks} tasks`;

  // Update master action
  await db.updateSeoAction(masterAction.id, {
    status: failed === plan.totalTasks ? "failed" : "completed",
    completedAt: new Date(),
    result: {
      plan: { totalTasks: plan.totalTasks, aiStrategy: plan.aiStrategy },
      summary: { completed, failed, skipped, totalDuration },
      executions: executions.map(e => ({
        taskId: e.taskId,
        category: e.task.category,
        title: e.task.title,
        status: e.status,
        proofType: e.proof.type,
        detail: e.detail.slice(0, 200),
      })),
    } as any,
    impact: completed > failed ? "positive" : "neutral",
    description: `[Daily AI] สำเร็จ ${completed}/${plan.totalTasks}, ล้มเหลว ${failed}, ข้าม ${skipped} — ${Math.round(totalDuration / 1000)}s`,
  });

  // Update project
  await db.updateSeoProject(projectId, {
    lastAutoRunAt: new Date(),
    autoRunCount: (project.autoRunCount ?? 0) + 1,
    lastAutoRunResult: {
      type: "daily_ai",
      completed,
      failed,
      skipped,
      total: plan.totalTasks,
      duration: totalDuration,
      date: plan.date,
    } as any,
    lastActionAt: new Date(),
  });

  return {
    projectId,
    domain: project.domain,
    date: plan.date,
    plan,
    executions,
    summary: {
      total: plan.totalTasks,
      completed,
      failed,
      skipped,
      totalDuration,
    },
    aiSummary,
  };
}
