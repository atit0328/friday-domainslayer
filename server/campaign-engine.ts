/**
 * 16-Phase SEO Campaign Engine
 * แต่ละเฟสทำงานจริง — ไม่ใช่แค่ LLM ตอบ
 * ใช้ WordPress REST API + SEO Engine + PBN Bridge + SERP Tracker
 */

import { invokeLLM } from "./_core/llm";
import { createWPClient, type WordPressAPI, type WPUpdateResult } from "./wp-api";
import * as seoEngine from "./seo-engine";
import * as serpTracker from "./serp-tracker";
import { scrapeWebsite, extractKeywordsFromContent, type ScrapedContent } from "./web-scraper";
import * as db from "./db";
import { notifyOwner } from "./_core/notification";

// ═══ Phase Definitions ═══
export const CAMPAIGN_PHASES = [
  { id: 0, name: "Technical Audit", icon: "Settings", thaiName: "ตรวจสอบเทคนิค", description: "Scan site for crawl errors, broken links, robots.txt, sitemap, SSL, and page speed", requiresWP: false },
  { id: 1, name: "Keyword Research", icon: "Search", thaiName: "วิจัย Keywords", description: "AI researches target keywords, search volume, difficulty, and competitor gaps", requiresWP: false },
  { id: 2, name: "On-Page Optimization", icon: "FileText", thaiName: "ปรับแต่ง On-Page", description: "Fix title tags, meta descriptions, headings, and keyword placement via WP API", requiresWP: true },
  { id: 3, name: "Content Strategy", icon: "Sparkles", thaiName: "วางแผน Content", description: "AI generates content calendar and topic clusters based on keyword research", requiresWP: false },
  { id: 4, name: "Link Building Plan", icon: "Link2", thaiName: "วางแผน Backlinks", description: "Create backlink strategy with PBN targets, guest post opportunities, and outreach plan", requiresWP: false },
  { id: 5, name: "Local SEO Setup", icon: "Globe", thaiName: "ตั้งค่า Local SEO", description: "Add local business schema, NAP consistency check, and geo-targeted content", requiresWP: true },
  { id: 6, name: "Schema Markup", icon: "FileText", thaiName: "เพิ่ม Schema Markup", description: "Inject JSON-LD structured data (Article, FAQ, HowTo, Product) into WP pages", requiresWP: true },
  { id: 7, name: "Core Web Vitals", icon: "Activity", thaiName: "ปรับปรุง Web Vitals", description: "Analyze LCP, FID, CLS and provide optimization recommendations", requiresWP: false },
  { id: 8, name: "Content Creation", icon: "Sparkles", thaiName: "สร้าง Content", description: "AI generates and publishes SEO-optimized blog posts and landing pages", requiresWP: true },
  { id: 9, name: "Internal Linking", icon: "Link2", thaiName: "เพิ่ม Internal Links", description: "Build internal link structure between related posts and pages via WP API", requiresWP: true },
  { id: 10, name: "Off-Page SEO", icon: "TrendingUp", thaiName: "สร้าง Backlinks", description: "Execute backlink building via PBN bridge and track new referring domains", requiresWP: false },
  { id: 11, name: "Social Signals", icon: "Globe", thaiName: "เพิ่ม Social Signals", description: "Generate social media content suggestions and Open Graph tag optimization", requiresWP: true },
  { id: 12, name: "Monitoring Setup", icon: "BarChart3", thaiName: "ตั้งค่า Monitoring", description: "Configure rank tracking, set up alerts, and establish baseline metrics", requiresWP: false },
  { id: 13, name: "Competitor Analysis", icon: "Target", thaiName: "วิเคราะห์คู่แข่ง", description: "Deep analysis of top competitors' strategies, backlinks, and content gaps", requiresWP: false },
  { id: 14, name: "Performance Review", icon: "BarChart3", thaiName: "ตรวจสอบผลลัพธ์", description: "Re-check all rankings, metrics, and compare before/after campaign data", requiresWP: false },
  { id: 15, name: "Final Report", icon: "FileText", thaiName: "สรุปรายงาน", description: "Generate comprehensive campaign report with ROI analysis and next steps", requiresWP: false },
] as const;

export interface PhaseResult {
  phase: number;
  phaseName: string;
  thaiName: string;
  status: "completed" | "failed" | "skipped";
  actions: WPUpdateResult[];
  aiAnalysis: string;
  detail: string;
  wpChanges: number;
  duration: number; // ms
}

// Helper to build a PhaseResult with duration=0 (will be overwritten by runPhase)
function pr(data: Omit<PhaseResult, "duration">): PhaseResult {
  return { ...data, duration: 0 };
}

// ═══ Helper: Get WP Client from project ═══
function getWPClient(project: any): WordPressAPI | null {
  if (!project.wpUsername || !project.wpAppPassword) return null;
  return createWPClient({
    siteUrl: `https://${project.domain}`,
    username: project.wpUsername,
    appPassword: project.wpAppPassword,
  });
}

// ═══ Helper: Safe LLM JSON parse ═══
async function llmJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt + "\n\nIMPORTANT: Return ONLY valid JSON. No markdown code blocks, no extra text." },
      { role: "user", content: userPrompt },
    ],
  });
  const content = response.choices[0]?.message?.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  
  // Try direct parse first
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fallback to robust parser
    const { parseLLMJson } = await import("./llm-json");
    return parseLLMJson<T>(cleaned);
  }
}

// ═══ Main: Run a single phase ═══
export async function runPhase(projectId: number, phaseIndex: number): Promise<PhaseResult> {
  const project = await db.getSeoProjectById(projectId);
  if (!project) throw new Error("Project not found");

  const phase = CAMPAIGN_PHASES[phaseIndex];
  if (!phase) throw new Error(`Invalid phase index: ${phaseIndex}`);

  const start = Date.now();
  const wp = getWPClient(project);

  // Log action start
  const action = await db.addSeoAction(projectId, {
    actionType: "campaign_phase",
    title: `[Campaign] เฟส ${phaseIndex + 1}/16: ${phase.thaiName}`,
    status: "running",
    executedAt: new Date(),
  });

  try {
    let result: PhaseResult;

    switch (phaseIndex) {
      case 0: result = await phase0_TechnicalAudit(project, wp); break;
      case 1: result = await phase1_KeywordResearch(project, wp); break;
      case 2: result = await phase2_OnPageOptimization(project, wp); break;
      case 3: result = await phase3_ContentStrategy(project, wp); break;
      case 4: result = await phase4_LinkBuildingPlan(project, wp); break;
      case 5: result = await phase5_LocalSEO(project, wp); break;
      case 6: result = await phase6_SchemaMarkup(project, wp); break;
      case 7: result = await phase7_CoreWebVitals(project, wp); break;
      case 8: result = await phase8_ContentCreation(project, wp); break;
      case 9: result = await phase9_InternalLinking(project, wp); break;
      case 10: result = await phase10_OffPageSEO(project, wp); break;
      case 11: result = await phase11_SocialSignals(project, wp); break;
      case 12: result = await phase12_MonitoringSetup(project, wp); break;
      case 13: result = await phase13_CompetitorAnalysis(project, wp); break;
      case 14: result = await phase14_PerformanceReview(project, wp); break;
      case 15: result = await phase15_FinalReport(project, wp); break;
      default: throw new Error(`Unknown phase: ${phaseIndex}`);
    }

    result.duration = Date.now() - start;

    // Update action log
    await db.updateSeoAction(action.id, {
      status: result.status === "completed" ? "completed" : "failed",
      completedAt: new Date(),
      result: { actions: result.actions, aiAnalysis: result.aiAnalysis, wpChanges: result.wpChanges } as any,
      impact: result.wpChanges > 0 ? "positive" : "neutral",
      description: result.detail,
    });

    // Update project phase
    const newPhase = phaseIndex + 1;
    const progress = Math.round((newPhase / 16) * 100);
    await db.updateSeoProject(projectId, {
      campaignPhase: newPhase,
      campaignProgress: progress,
      campaignStatus: newPhase >= 16 ? "completed" : "running",
      campaignLastPhaseResult: result as any,
      totalWpChanges: (project.totalWpChanges || 0) + result.wpChanges,
      lastActionAt: new Date(),
      ...(newPhase >= 16 ? { campaignCompletedAt: new Date() } : {}),
    });

    return result;
  } catch (err: any) {
    await db.updateSeoAction(action.id, {
      status: "failed",
      errorMessage: err.message,
      completedAt: new Date(),
    });

    await db.updateSeoProject(projectId, {
      campaignStatus: "failed",
      campaignLastPhaseResult: { error: err.message } as any,
    });

    return {
      phase: phaseIndex,
      phaseName: phase.name,
      thaiName: phase.thaiName,
      status: "failed",
      actions: [],
      aiAnalysis: err.message,
      detail: `เฟส ${phase.thaiName} ล้มเหลว: ${err.message}`,
      wpChanges: 0,
      duration: Date.now() - start,
    };
  }
}

// ═══ Phase 0: Technical Audit ═══
async function phase0_TechnicalAudit(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];
  let wpChanges = 0;

  // 1. Scrape the website
  const scraped = await scrapeWebsite(project.domain).catch(() => null);

  // 2. If WP connected, audit all content
  let wpAudit: any = null;
  if (wp) {
    try {
      wpAudit = await wp.auditAllContent();
      actions.push({ success: true, action: "content_audit", detail: `ตรวจสอบ ${wpAudit.totalPosts} โพสต์, ${wpAudit.totalPages} หน้า — พบ ${wpAudit.issues.length} ปัญหา` });
    } catch (err: any) {
      actions.push({ success: false, action: "content_audit", detail: err.message, error: err.message });
    }
  }

  // 3. AI analysis of technical issues
  const aiAnalysis = await llmJSON<{ issues: string[]; fixes: string[]; score: number; summary: string }>(
    "คุณคือ SEO Technical Auditor ตอบเป็นภาษาไทย สั้นๆ Return JSON only.",
    `ตรวจสอบเทคนิค SEO สำหรับ ${project.domain}:
${scraped ? `Title: ${scraped.title}\nMeta: ${scraped.metaDescription}\nH1: ${scraped.headings.h1.join(", ")}\nLinks: internal=${scraped.links.internal}, external=${scraped.links.external}` : "ไม่สามารถ scrape ได้"}
${wpAudit ? `WP: ${wpAudit.totalPosts} posts, ${wpAudit.totalPages} pages, ${wpAudit.issues.length} issues\nIssues: ${wpAudit.issues.slice(0, 5).join("; ")}` : "ไม่ได้เชื่อมต่อ WordPress"}

Return JSON: { "issues": ["string"], "fixes": ["string"], "score": number(0-100), "summary": "string สรุปสั้นๆ ภาษาไทย" }`,
  );

  // 4. Auto-fix: Update site settings if WP connected
  if (wp && scraped) {
    // Fix missing meta description on site settings
    if (!scraped.metaDescription || scraped.metaDescription.length < 50) {
      const fixResult = await wp.updateSiteBranding(undefined, `${project.niche || project.domain} — คุณภาพที่คุณไว้วางใจ`);
      if (fixResult.success) wpChanges++;
      actions.push(fixResult);
    }
  }

  return pr({
    phase: 0, phaseName: "Technical Audit", thaiName: "ตรวจสอบเทคนิค",
    status: "completed", actions, aiAnalysis: aiAnalysis.summary,
    detail: `ตรวจสอบเทคนิค: คะแนน ${aiAnalysis.score}/100, พบ ${aiAnalysis.issues.length} ปัญหา${wpChanges > 0 ? `, แก้ไข ${wpChanges} รายการ` : ""}`,
    wpChanges,
  });
}

// ═══ Phase 1: Keyword Research ═══
async function phase1_KeywordResearch(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];

  // Use existing seoEngine for real keyword research
  const existingKw = (project.targetKeywords as string[]) || [];
  const research = await seoEngine.researchKeywords(project.domain, project.niche || "general", existingKw);

  // Save keywords to rank tracking
  for (const kw of research.primaryKeywords.slice(0, 15)) {
    await db.addRankEntry(project.id, {
      keyword: kw.keyword,
      searchVolume: kw.searchVolume,
      keywordDifficulty: kw.difficulty,
      cpc: String(kw.cpc),
      trend: "new",
    });
  }

  // Update project keywords
  const allKw = [
    ...existingKw,
    ...research.primaryKeywords.map(k => k.keyword),
  ].filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i);

  await db.updateSeoProject(project.id, { targetKeywords: allKw as any });

  actions.push({
    success: true, action: "keyword_research",
    detail: `วิจัย ${research.primaryKeywords.length} primary + ${research.longTailKeywords.length} long-tail keywords`,
  });

  return pr({
    phase: 1, phaseName: "Keyword Research", thaiName: "วิจัย Keywords",
    status: "completed", actions, aiAnalysis: research.aiInsights,
    detail: `วิจัย ${research.primaryKeywords.length} primary keywords, ${research.longTailKeywords.length} long-tail — บันทึกลง rank tracking แล้ว`,
    wpChanges: 0,
  });
}

// ═══ Phase 2: On-Page Optimization ═══
async function phase2_OnPageOptimization(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];
  let wpChanges = 0;
  const targetKeywords = (project.targetKeywords as string[]) || [];
  const topKeyword = targetKeywords[0] || project.niche || project.domain;

  if (!wp) {
    // No WP connection — just provide AI recommendations
    const analysis = await llmJSON<{ recommendations: string[]; summary: string }>(
      "คุณคือ On-Page SEO Expert ตอบเป็นภาษาไทย Return JSON only.",
      `วิเคราะห์ On-Page SEO สำหรับ ${project.domain} (keyword: ${topKeyword})
Return JSON: { "recommendations": ["string"], "summary": "string สั้นๆ" }`,
    );
    return pr({
      phase: 2, phaseName: "On-Page Optimization", thaiName: "ปรับแต่ง On-Page",
      status: "completed", actions, aiAnalysis: analysis.summary,
      detail: `วิเคราะห์ On-Page: ${analysis.recommendations.length} คำแนะนำ (ไม่ได้เชื่อมต่อ WP — ไม่สามารถแก้ไขอัตโนมัติ)`,
      wpChanges: 0,
    });
  }

  // WP connected — actually fix things
  try {
    // 1. Get all posts and pages
    const posts = await wp.getPosts({ per_page: 50, status: "publish" });
    const pages = await wp.getPages({ per_page: 50, status: "publish" });

    // 2. AI decides what to fix for each post/page
    const contentList = [
      ...posts.map(p => ({ id: p.id, type: "post" as const, title: p.title.rendered, slug: p.slug, excerpt: p.excerpt?.rendered || "" })),
      ...pages.map(p => ({ id: p.id, type: "page" as const, title: p.title.rendered, slug: p.slug, excerpt: p.excerpt?.rendered || "" })),
    ];

    const fixes = await llmJSON<{ fixes: { id: number; type: "post" | "page"; newTitle?: string; newDescription?: string; newSlug?: string; focusKeyword?: string }[] }>(
      `คุณคือ On-Page SEO Optimizer สำหรับ ${project.domain} ใน niche "${project.niche || "general"}"
Target keywords: ${targetKeywords.slice(0, 10).join(", ")}
ตอบเป็น JSON only. แก้ไขเฉพาะที่จำเป็น ไม่ต้องแก้ทุกอัน`,
      `วิเคราะห์ content เหล่านี้และแนะนำการแก้ไข On-Page SEO:
${contentList.slice(0, 20).map(c => `- [${c.type}#${c.id}] "${c.title}" slug:${c.slug} excerpt:${c.excerpt.replace(/<[^>]*>/g, "").slice(0, 80)}`).join("\n")}

Return JSON: { "fixes": [{ "id": number, "type": "post"|"page", "newTitle": "string|null", "newDescription": "string|null (150-160 chars)", "newSlug": "string|null", "focusKeyword": "string|null" }] }`,
    );

    // 3. Apply fixes via WP API
    for (const fix of fixes.fixes.slice(0, 10)) {
      // Update SEO meta
      if (fix.newTitle || fix.newDescription || fix.focusKeyword) {
        const metaResult = await wp.updateSEOMeta(fix.id, fix.type, {
          title: fix.newTitle || undefined,
          description: fix.newDescription || undefined,
          focusKeyword: fix.focusKeyword || undefined,
        });
        if (metaResult.success) wpChanges++;
        actions.push(metaResult);
      }

      // Optimize slug
      if (fix.newSlug) {
        const slugResult = await wp.optimizeSlug(fix.id, fix.type, fix.newSlug);
        if (slugResult.success) wpChanges++;
        actions.push(slugResult);
      }
    }
  } catch (err: any) {
    actions.push({ success: false, action: "onpage_optimization", detail: err.message, error: err.message });
  }

  return pr({
    phase: 2, phaseName: "On-Page Optimization", thaiName: "ปรับแต่ง On-Page",
    status: "completed", actions,
    aiAnalysis: `ปรับแต่ง On-Page SEO: แก้ไข ${wpChanges} รายการผ่าน WordPress API`,
    detail: `ปรับแต่ง On-Page: แก้ไข title/meta/slug ${wpChanges} รายการ`,
    wpChanges,
  });
}

// ═══ Phase 3: Content Strategy ═══
async function phase3_ContentStrategy(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];
  const targetKeywords = (project.targetKeywords as string[]) || [];

  // AI creates content calendar
  const strategy = await llmJSON<{
    contentCalendar: { week: number; title: string; keyword: string; type: string; wordCount: number }[];
    contentGaps: string[];
    summary: string;
  }>(
    "คุณคือ Content Strategist ตอบเป็นภาษาไทย Return JSON only.",
    `สร้าง Content Strategy สำหรับ ${project.domain} (niche: ${project.niche || "general"})
Keywords: ${targetKeywords.slice(0, 15).join(", ")}

Return JSON: {
  "contentCalendar": [{ "week": number, "title": "string", "keyword": "string", "type": "article|guide|review|listicle", "wordCount": number }],
  "contentGaps": ["string"],
  "summary": "string สั้นๆ ภาษาไทย"
}
สร้าง 8-12 content items สำหรับ 3 เดือน`,
  );

  // Save strategy to project
  await db.updateSeoProject(project.id, {
    aiNextActions: strategy.contentCalendar.slice(0, 5).map(c => c.title) as any,
  });

  actions.push({
    success: true, action: "content_strategy",
    detail: `วางแผน ${strategy.contentCalendar.length} content items, พบ ${strategy.contentGaps.length} content gaps`,
  });

  return pr({
    phase: 3, phaseName: "Content Strategy", thaiName: "วางแผน Content",
    status: "completed", actions, aiAnalysis: strategy.summary,
    detail: `วางแผน Content: ${strategy.contentCalendar.length} บทความ, ${strategy.contentGaps.length} gaps`,
    wpChanges: 0,
  });
}

// ═══ Phase 4: Link Building Plan ═══
async function phase4_LinkBuildingPlan(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];

  // Use existing seoEngine strategy generation
  const analysis: seoEngine.DomainAnalysis = {
    domain: project.domain,
    currentState: {
      estimatedDA: project.currentDA || 0, estimatedDR: project.currentDR || 0,
      estimatedSpamScore: project.currentSpamScore || 0, estimatedBacklinks: project.currentBacklinks || 0,
      estimatedReferringDomains: project.currentReferringDomains || 0,
      estimatedTrustFlow: project.currentTrustFlow || 0, estimatedCitationFlow: project.currentCitationFlow || 0,
      estimatedOrganicTraffic: project.currentOrganicTraffic || 0, estimatedOrganicKeywords: project.currentOrganicKeywords || 0,
      domainAge: "unknown", tld: project.domain.split(".").slice(1).join("."), isIndexed: true,
    },
    contentAudit: { hasContent: true, contentQuality: "moderate", estimatedPages: 10, topicRelevance: 70 },
    backlinkProfile: { quality: "mixed", dofollowRatio: 70, anchorTextDistribution: [], riskFactors: [] },
    competitorInsights: { nicheCompetition: "medium", topCompetitors: [], avgCompetitorDA: 30 },
    overallHealth: project.aiHealthScore || 50,
    riskLevel: (project.aiRiskLevel as any) || "medium",
    aiSummary: project.aiLastAnalysis || "",
  };

  const strategy = await seoEngine.generateStrategy(
    project.domain, analysis, project.strategy, project.aggressiveness, project.niche || undefined,
  );

  await db.updateSeoProject(project.id, {
    aiStrategy: strategy.aiRecommendation,
    aiNextActions: strategy.phases.slice(0, 3).map(p => p.name) as any,
  });

  actions.push({
    success: true, action: "link_building_plan",
    detail: `วางแผน: Tier1 ${strategy.backlinkPlan.tier1.reduce((s, t) => s + t.count, 0)} links, Tier2 ${strategy.backlinkPlan.tier2.reduce((s, t) => s + t.count, 0)} links, เป้า ${strategy.backlinkPlan.monthlyTarget}/เดือน`,
  });

  return pr({
    phase: 4, phaseName: "Link Building Plan", thaiName: "วางแผน Backlinks",
    status: "completed", actions, aiAnalysis: strategy.aiRecommendation,
    detail: `วางแผน Backlinks: ${strategy.phases.length} เฟส, เป้าหมาย ${strategy.backlinkPlan.monthlyTarget} links/เดือน`,
    wpChanges: 0,
  });
}

// ═══ Phase 5: Local SEO Setup ═══
async function phase5_LocalSEO(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];
  let wpChanges = 0;

  // AI generates Local SEO structured data
  const localData = await llmJSON<{
    localBusiness: object;
    geoTargeting: string[];
    summary: string;
  }>(
    "คุณคือ Local SEO Expert ตอบเป็นภาษาไทย Return JSON only.",
    `สร้าง Local SEO setup สำหรับ ${project.domain} (niche: ${project.niche || "general"})
Return JSON: {
  "localBusiness": { "@context": "https://schema.org", "@type": "LocalBusiness", "name": "string", "description": "string", "url": "string" },
  "geoTargeting": ["string — ภูมิภาคเป้าหมาย"],
  "summary": "string สั้นๆ ภาษาไทย"
}`,
  );

  // If WP connected, inject LocalBusiness schema to homepage
  if (wp) {
    try {
      const pages = await wp.getPages({ per_page: 10, status: "publish" });
      const homepage = pages.find(p => p.slug === "home" || p.slug === "" || p.parent === 0) || pages[0];
      if (homepage) {
        const result = await wp.injectSchemaMarkup(homepage.id, "page", localData.localBusiness);
        if (result.success) wpChanges++;
        actions.push(result);
      }
    } catch (err: any) {
      actions.push({ success: false, action: "local_seo", detail: err.message, error: err.message });
    }
  }

  actions.push({
    success: true, action: "local_seo_plan",
    detail: `ตั้งค่า Local SEO: ${localData.geoTargeting.length} ภูมิภาคเป้าหมาย`,
  });

  return pr({
    phase: 5, phaseName: "Local SEO Setup", thaiName: "ตั้งค่า Local SEO",
    status: "completed", actions, aiAnalysis: localData.summary,
    detail: `Local SEO: ${localData.geoTargeting.length} ภูมิภาค${wpChanges > 0 ? `, inject schema ${wpChanges} หน้า` : ""}`,
    wpChanges,
  });
}

// ═══ Phase 6: Schema Markup ═══
async function phase6_SchemaMarkup(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];
  let wpChanges = 0;

  // AI generates appropriate schema types
  const schemas = await llmJSON<{
    schemas: { type: string; targetPage: string; jsonLd: object }[];
    summary: string;
  }>(
    "คุณคือ Schema Markup Expert ตอบเป็นภาษาไทย Return JSON only.",
    `สร้าง Schema Markup สำหรับ ${project.domain} (niche: ${project.niche || "general"})
สร้าง 3-5 schema types ที่เหมาะสม (Organization, WebSite, Article, FAQ, BreadcrumbList, Product, etc.)

Return JSON: {
  "schemas": [{ "type": "string", "targetPage": "homepage|posts|pages", "jsonLd": { "@context": "https://schema.org", ... } }],
  "summary": "string สั้นๆ ภาษาไทย"
}`,
  );

  // If WP connected, inject schemas
  if (wp) {
    try {
      const pages = await wp.getPages({ per_page: 10, status: "publish" });
      const posts = await wp.getPosts({ per_page: 5, status: "publish" });

      for (const schema of schemas.schemas.slice(0, 5)) {
        let target: { id: number; type: "post" | "page" } | null = null;

        if (schema.targetPage === "homepage") {
          const hp = pages.find(p => p.slug === "home" || p.slug === "" || p.parent === 0) || pages[0];
          if (hp) target = { id: hp.id, type: "page" };
        } else if (schema.targetPage === "posts" && posts.length > 0) {
          target = { id: posts[0].id, type: "post" };
        } else if (pages.length > 0) {
          target = { id: pages[0].id, type: "page" };
        }

        if (target) {
          const result = await wp.injectSchemaMarkup(target.id, target.type, schema.jsonLd);
          if (result.success) wpChanges++;
          actions.push(result);
        }
      }
    } catch (err: any) {
      actions.push({ success: false, action: "schema_markup", detail: err.message, error: err.message });
    }
  }

  return pr({
    phase: 6, phaseName: "Schema Markup", thaiName: "เพิ่ม Schema Markup",
    status: "completed", actions, aiAnalysis: schemas.summary,
    detail: `Schema Markup: สร้าง ${schemas.schemas.length} schemas${wpChanges > 0 ? `, inject ${wpChanges} หน้า` : ""}`,
    wpChanges,
  });
}

// ═══ Phase 7: Core Web Vitals ═══
async function phase7_CoreWebVitals(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];
  let wpChanges = 0;

  // Analyze page speed via scraping
  const scraped = await scrapeWebsite(project.domain).catch(() => null);

  const analysis = await llmJSON<{
    lcp: string; fid: string; cls: string;
    optimizations: { action: string; impact: string; priority: string }[];
    summary: string;
  }>(
    "คุณคือ Core Web Vitals Expert ตอบเป็นภาษาไทย Return JSON only.",
    `วิเคราะห์ Core Web Vitals สำหรับ ${project.domain}
${scraped ? `Page size: ~${Math.round(scraped.textContent.length / 1024)}KB text, ${scraped.images.total} images, ${scraped.links.internal + scraped.links.external} links` : "ไม่สามารถ scrape ได้"}

Return JSON: {
  "lcp": "string (estimated)", "fid": "string (estimated)", "cls": "string (estimated)",
  "optimizations": [{ "action": "string", "impact": "high|medium|low", "priority": "string" }],
  "summary": "string สั้นๆ ภาษาไทย"
}`,
  );

  // If WP connected, fix image alt texts
  if (wp) {
    try {
      const media = await wp.getMedia({ per_page: 20 });
      const missingAlt = media.filter(m => !m.alt_text || m.alt_text.trim() === "");

      if (missingAlt.length > 0) {
        // AI generates alt texts
        const altTexts = await llmJSON<{ alts: { id: number; altText: string }[] }>(
          "สร้าง alt text สำหรับรูปภาพ ตอบเป็น JSON only.",
          `สร้าง alt text SEO-friendly สำหรับรูปภาพเหล่านี้ (domain: ${project.domain}, niche: ${project.niche || "general"}):
${missingAlt.slice(0, 10).map(m => `- ID:${m.id} URL:${m.source_url.split("/").pop()} Title:${m.title.rendered}`).join("\n")}

Return JSON: { "alts": [{ "id": number, "altText": "string" }] }`,
        );

        const results = await wp.fixImageAltTexts(altTexts.alts.map(a => ({ mediaId: a.id, altText: a.altText })));
        wpChanges += results.filter(r => r.success).length;
        actions.push(...results);
      }
    } catch (err: any) {
      actions.push({ success: false, action: "fix_alt_texts", detail: err.message, error: err.message });
    }
  }

  return pr({
    phase: 7, phaseName: "Core Web Vitals", thaiName: "ปรับปรุง Web Vitals",
    status: "completed", actions, aiAnalysis: analysis.summary,
    detail: `Web Vitals: ${analysis.optimizations.length} คำแนะนำ${wpChanges > 0 ? `, แก้ไข alt text ${wpChanges} รูป` : ""}`,
    wpChanges,
  });
}

// ═══ Phase 8: Content Creation ═══
async function phase8_ContentCreation(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];
  let wpChanges = 0;
  const targetKeywords = (project.targetKeywords as string[]) || [];
  const topKeyword = targetKeywords[0] || project.niche || project.domain;

  // Generate SEO content using existing engine
  const content = await seoEngine.generateSEOContent(topKeyword, project.domain, project.niche || "general", 1500);

  await db.updateSeoProject(project.id, {
    totalContentCreated: (project.totalContentCreated || 0) + 1,
    lastActionAt: new Date(),
  });

  // If WP connected, publish as draft
  if (wp) {
    try {
      const post = await wp.createPost({
        title: content.title,
        content: content.content,
        excerpt: content.metaDescription,
        status: "draft", // Draft first, user can review and publish
      });

      // Set SEO meta
      await wp.updateSEOMeta(post.id, "post", {
        title: content.title,
        description: content.metaDescription,
        focusKeyword: topKeyword,
      });

      wpChanges += 2; // post + meta
      actions.push({
        success: true, action: "create_post",
        detail: `สร้างโพสต์ "${content.title}" (draft) — keyword: "${topKeyword}"`,
      });
    } catch (err: any) {
      actions.push({ success: false, action: "create_post", detail: err.message, error: err.message });
    }
  }

  actions.push({
    success: true, action: "generate_content",
    detail: `สร้างบทความ "${content.title}" — ${content.content.length} ตัวอักษร`,
  });

  return pr({
    phase: 8, phaseName: "Content Creation", thaiName: "สร้าง Content",
    status: "completed", actions,
    aiAnalysis: `สร้างบทความ SEO: "${content.title}" targeting "${topKeyword}"${wp ? " — publish เป็น draft บน WordPress แล้ว" : ""}`,
    detail: `สร้าง Content: "${content.title}"${wpChanges > 0 ? ` + publish draft บน WP` : ""}`,
    wpChanges,
  });
}

// ═══ Phase 9: Internal Linking ═══
async function phase9_InternalLinking(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];
  let wpChanges = 0;

  if (!wp) {
    const analysis = await llmJSON<{ recommendations: string[]; summary: string }>(
      "คุณคือ Internal Linking Expert ตอบเป็นภาษาไทย Return JSON only.",
      `วิเคราะห์ Internal Linking สำหรับ ${project.domain}
Return JSON: { "recommendations": ["string"], "summary": "string สั้นๆ" }`,
    );
    return pr({
      phase: 9, phaseName: "Internal Linking", thaiName: "เพิ่ม Internal Links",
      status: "completed", actions, aiAnalysis: analysis.summary,
      detail: `Internal Linking: ${analysis.recommendations.length} คำแนะนำ (ไม่ได้เชื่อมต่อ WP)`,
      wpChanges: 0,
    });
  }

  // WP connected — analyze and add internal links
  try {
    const posts = await wp.getPosts({ per_page: 30, status: "publish" });
    const pages = await wp.getPages({ per_page: 20, status: "publish" });

    // Build a map of available internal URLs
    const allContent = [
      ...posts.map(p => ({ id: p.id, type: "post" as const, title: p.title.rendered, link: p.link, slug: p.slug })),
      ...pages.map(p => ({ id: p.id, type: "page" as const, title: p.title.rendered, link: p.link, slug: p.slug })),
    ];

    // AI decides which internal links to add
    const linkPlan = await llmJSON<{
      links: { sourceId: number; sourceType: "post" | "page"; anchorText: string; targetUrl: string }[];
      summary: string;
    }>(
      "คุณคือ Internal Linking Expert ตอบเป็น JSON only.",
      `วิเคราะห์และสร้าง internal links สำหรับ ${project.domain}
Content available:
${allContent.slice(0, 20).map(c => `- [${c.type}#${c.id}] "${c.title}" → ${c.link}`).join("\n")}

สร้าง internal links ที่เชื่อมโยง content ที่เกี่ยวข้อง (max 10 links)
Return JSON: {
  "links": [{ "sourceId": number, "sourceType": "post"|"page", "anchorText": "string", "targetUrl": "string" }],
  "summary": "string สั้นๆ ภาษาไทย"
}`,
    );

    // Apply internal links
    for (const link of linkPlan.links.slice(0, 10)) {
      const result = await wp.addInternalLinks(link.sourceId, link.sourceType, [
        { anchorText: link.anchorText, targetUrl: link.targetUrl },
      ]);
      if (result.success && !result.detail.includes("ข้ามการเพิ่ม")) wpChanges++;
      actions.push(result);
    }
  } catch (err: any) {
    actions.push({ success: false, action: "internal_linking", detail: err.message, error: err.message });
  }

  return pr({
    phase: 9, phaseName: "Internal Linking", thaiName: "เพิ่ม Internal Links",
    status: "completed", actions,
    aiAnalysis: `เพิ่ม ${wpChanges} internal links ผ่าน WordPress API`,
    detail: `Internal Linking: เพิ่ม ${wpChanges} links`,
    wpChanges,
  });
}

// ═══ Phase 10: Off-Page SEO (PBN Backlinks) ═══
async function phase10_OffPageSEO(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];

  // Use existing PBN bridge for real backlink building
  try {
    const { executePBNBuild } = await import("./pbn-bridge");
    const linkCount = Math.min(Math.max(project.aggressiveness, 3), 10);
    const buildResult = await executePBNBuild(project.userId, project.id, linkCount);

    actions.push({
      success: buildResult.totalBuilt > 0,
      action: "pbn_backlinks",
      detail: `สร้าง ${buildResult.totalBuilt}/${buildResult.totalPlanned} backlinks จาก PBN`,
    });

    return pr({
      phase: 10, phaseName: "Off-Page SEO", thaiName: "สร้าง Backlinks",
      status: "completed",
      actions,
      aiAnalysis: buildResult.totalBuilt > 0
        ? `สร้าง ${buildResult.totalBuilt} backlinks จาก PBN network สำเร็จ`
        : `ไม่มี PBN sites ที่พร้อมใช้งาน — เพิ่ม PBN ใน PBN Manager ก่อน`,
      detail: `Off-Page: ${buildResult.totalBuilt} backlinks จาก PBN`,
      wpChanges: 0,
    });
  } catch (err: any) {
    actions.push({ success: false, action: "pbn_backlinks", detail: err.message, error: err.message });
    return pr({
      phase: 10, phaseName: "Off-Page SEO", thaiName: "สร้าง Backlinks",
      status: "completed", actions, aiAnalysis: `PBN build error: ${err.message}`,
      detail: `Off-Page: ไม่สามารถสร้าง backlinks — ${err.message}`,
      wpChanges: 0,
    });
  }
}

// ═══ Phase 11: Social Signals ═══
async function phase11_SocialSignals(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];
  let wpChanges = 0;

  // Add Open Graph and Twitter Card meta to posts/pages
  if (wp) {
    try {
      const posts = await wp.getPosts({ per_page: 10, status: "publish" });

      for (const post of posts.slice(0, 5)) {
        const result = await wp.updateSEOMeta(post.id, "post", {
          ogTitle: post.title.rendered,
          ogDescription: post.excerpt?.rendered?.replace(/<[^>]*>/g, "").slice(0, 160) || post.title.rendered,
        });
        if (result.success) wpChanges++;
        actions.push(result);
      }
    } catch (err: any) {
      actions.push({ success: false, action: "social_signals", detail: err.message, error: err.message });
    }
  }

  const analysis = await llmJSON<{ platforms: string[]; strategy: string; summary: string }>(
    "คุณคือ Social Media SEO Expert ตอบเป็นภาษาไทย Return JSON only.",
    `สร้าง Social Signals strategy สำหรับ ${project.domain} (niche: ${project.niche || "general"})
Return JSON: { "platforms": ["string"], "strategy": "string", "summary": "string สั้นๆ" }`,
  );

  return pr({
    phase: 11, phaseName: "Social Signals", thaiName: "เพิ่ม Social Signals",
    status: "completed", actions, aiAnalysis: analysis.summary,
    detail: `Social Signals: ${analysis.platforms.length} platforms${wpChanges > 0 ? `, อัพเดท OG meta ${wpChanges} โพสต์` : ""}`,
    wpChanges,
  });
}

// ═══ Phase 12: Monitoring Setup ═══
async function phase12_MonitoringSetup(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];

  // Set up rank tracking for all keywords
  const rankings = await db.getLatestRankings(project.id);
  const targetKeywords = (project.targetKeywords as string[]) || [];

  // Add any missing keywords to tracking
  const trackedKw = new Set(rankings.map(r => r.keyword.toLowerCase()));
  let added = 0;
  for (const kw of targetKeywords.slice(0, 30)) {
    if (!trackedKw.has(kw.toLowerCase())) {
      await db.addRankEntry(project.id, { keyword: kw, trend: "new" });
      added++;
    }
  }

  // Enable auto-run if not already
  if (!project.autoRunEnabled) {
    await db.updateSeoProject(project.id, {
      autoRunEnabled: true,
      autoRunDay: 1, // Monday
      autoRunHour: 3, // 3 AM UTC
    });
  }

  actions.push({
    success: true, action: "monitoring_setup",
    detail: `ตั้งค่า monitoring: ${rankings.length + added} keywords tracked, auto-run ${project.autoRunEnabled ? "เปิดอยู่แล้ว" : "เปิดใหม่"}`,
  });

  return pr({
    phase: 12, phaseName: "Monitoring Setup", thaiName: "ตั้งค่า Monitoring",
    status: "completed", actions,
    aiAnalysis: `ตั้งค่า rank tracking ${rankings.length + added} keywords + weekly auto-run`,
    detail: `Monitoring: ${rankings.length + added} keywords, auto-run ทุกวันจันทร์ 3:00 UTC`,
    wpChanges: 0,
  });
}

// ═══ Phase 13: Competitor Analysis ═══
async function phase13_CompetitorAnalysis(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];
  const targetKeywords = (project.targetKeywords as string[]) || [];

  // Use SERP tracker to analyze competitors
  const topKeyword = targetKeywords[0] || project.niche || project.domain;
  let competitorData: any = null;

  try {
    competitorData = await serpTracker.compareCompetitorRanks(
      project.domain,
      [],  // competitors - will be discovered
      [topKeyword],
    );
  } catch {}

  const analysis = await llmJSON<{
    competitors: { domain: string; strengths: string[]; weaknesses: string[] }[];
    opportunities: string[];
    summary: string;
  }>(
    "คุณคือ Competitor Analysis Expert ตอบเป็นภาษาไทย Return JSON only.",
    `วิเคราะห์คู่แข่งสำหรับ ${project.domain} (niche: ${project.niche || "general"})
Keywords: ${targetKeywords.slice(0, 10).join(", ")}
${competitorData ? `SERP data: ${JSON.stringify(competitorData).slice(0, 500)}` : ""}

Return JSON: {
  "competitors": [{ "domain": "string", "strengths": ["string"], "weaknesses": ["string"] }],
  "opportunities": ["string"],
  "summary": "string สั้นๆ ภาษาไทย"
}`,
  );

  actions.push({
    success: true, action: "competitor_analysis",
    detail: `วิเคราะห์ ${analysis.competitors.length} คู่แข่ง, พบ ${analysis.opportunities.length} โอกาส`,
  });

  return pr({
    phase: 13, phaseName: "Competitor Analysis", thaiName: "วิเคราะห์คู่แข่ง",
    status: "completed", actions, aiAnalysis: analysis.summary,
    detail: `คู่แข่ง: ${analysis.competitors.length} domains, ${analysis.opportunities.length} โอกาส`,
    wpChanges: 0,
  });
}

// ═══ Phase 14: Performance Review ═══
async function phase14_PerformanceReview(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];

  // Bulk rank check
  const rankings = await db.getLatestRankings(project.id);
  let rankResult: any = null;

  if (rankings.length > 0) {
    try {
      const keywords = rankings.map(r => ({
        keyword: r.keyword,
        previousPosition: r.position,
        searchVolume: r.searchVolume || undefined,
      }));

      rankResult = await serpTracker.bulkRankCheck(
        project.id, project.domain, keywords, "US", "desktop",
      );

      await db.updateSeoProject(project.id, {
        overallTrend: rankResult.improved > rankResult.declined ? "improving" as any :
          rankResult.declined > rankResult.improved ? "declining" as any : "stable" as any,
      });
    } catch {}
  }

  // Re-analyze domain
  const analysis = await seoEngine.analyzeDomain(project.domain, project.niche || undefined);

  // Update project metrics
  await db.updateSeoProject(project.id, {
    currentDA: analysis.currentState.estimatedDA,
    currentDR: analysis.currentState.estimatedDR,
    aiHealthScore: analysis.overallHealth,
    aiRiskLevel: analysis.riskLevel as any,
    aiLastAnalysis: analysis.aiSummary,
    lastAnalyzedAt: new Date(),
  });

  actions.push({
    success: true, action: "performance_review",
    detail: `Health: ${analysis.overallHealth}/100, DA: ${analysis.currentState.estimatedDA}${rankResult ? `, Rankings: ${rankResult.totalKeywords} keywords, Top 10: ${rankResult.top10}` : ""}`,
  });

  return pr({
    phase: 14, phaseName: "Performance Review", thaiName: "ตรวจสอบผลลัพธ์",
    status: "completed", actions, aiAnalysis: analysis.aiSummary,
    detail: `ผลลัพธ์: Health ${analysis.overallHealth}/100${rankResult ? `, ${rankResult.improved} keywords ดีขึ้น` : ""}`,
    wpChanges: 0,
  });
}

// ═══ Phase 15: Final Report ═══
async function phase15_FinalReport(project: any, wp: WordPressAPI | null): Promise<PhaseResult> {
  const actions: WPUpdateResult[] = [];

  // Gather all action logs for this project
  const allActions = await db.getProjectActions(project.id, 100);
  const campaignActions = allActions.filter((a: any) => a.title?.includes("[Campaign]"));

  const report = await llmJSON<{
    executiveSummary: string;
    phaseSummary: { phase: string; status: string; impact: string }[];
    metrics: { before: Record<string, number>; after: Record<string, number> };
    recommendations: string[];
    nextSteps: string[];
    overallGrade: string;
  }>(
    "คุณคือ SEO Report Writer ตอบเป็นภาษาไทย Return JSON only.",
    `สร้างรายงานสรุป SEO Campaign สำหรับ ${project.domain}
Niche: ${project.niche || "general"}
Campaign actions: ${campaignActions.length} total
Current metrics: DA=${project.currentDA || 0}, DR=${project.currentDR || 0}, Health=${project.aiHealthScore || 0}
WP Changes made: ${project.totalWpChanges || 0}
Backlinks built: ${project.totalBacklinksBuilt || 0}
Content created: ${project.totalContentCreated || 0}

Return JSON: {
  "executiveSummary": "string ภาษาไทย 3-5 ประโยค",
  "phaseSummary": [{ "phase": "string", "status": "completed|failed|skipped", "impact": "string สั้นๆ" }],
  "metrics": { "before": { "da": number, "dr": number, "health": number }, "after": { "da": number, "dr": number, "health": number } },
  "recommendations": ["string"],
  "nextSteps": ["string"],
  "overallGrade": "A|B|C|D|F"
}`,
  );

  actions.push({
    success: true, action: "final_report",
    detail: `รายงานสรุป: Grade ${report.overallGrade}, ${report.recommendations.length} คำแนะนำ, ${report.nextSteps.length} next steps`,
  });

  return pr({
    phase: 15, phaseName: "Final Report", thaiName: "สรุปรายงาน",
    status: "completed", actions, aiAnalysis: report.executiveSummary,
    detail: `สรุป: Grade ${report.overallGrade} — ${report.executiveSummary.slice(0, 100)}...`,
    wpChanges: 0,
  });
}

// ═══ Run All Remaining Phases ═══
export async function runAllPhases(projectId: number): Promise<{
  results: PhaseResult[];
  summary: { completed: number; failed: number; skipped: number; totalWpChanges: number };
}> {
  const project = await db.getSeoProjectById(projectId);
  if (!project) throw new Error("Project not found");

  const startPhase = project.campaignPhase || 0;
  const results: PhaseResult[] = [];
  let totalWpChanges = 0;

  await db.updateSeoProject(projectId, {
    campaignEnabled: true,
    campaignStatus: "running",
    campaignStartedAt: project.campaignStartedAt || new Date(),
  });

  try {
    for (let i = startPhase; i < 16; i++) {
      try {
        const result = await runPhase(projectId, i);
        results.push(result);
        totalWpChanges += result.wpChanges;

        // If phase failed, continue to next phase (don't stop)
        if (result.status === "failed") {
          console.warn(`[Campaign] Phase ${i} failed for project ${projectId}: ${result.detail}`);
        }
      } catch (phaseErr: any) {
        // Catch any unhandled error from runPhase and continue
        console.error(`[Campaign] Phase ${i} crashed for project ${projectId}:`, phaseErr.message);
        results.push({
          phase: i,
          phaseName: CAMPAIGN_PHASES[i]?.name || `Phase ${i}`,
          thaiName: CAMPAIGN_PHASES[i]?.thaiName || `เฟส ${i}`,
          status: "failed",
          actions: [],
          aiAnalysis: `Phase crashed: ${phaseErr.message}`,
          detail: `เฟสล้มเหลว (crash): ${phaseErr.message}`,
          wpChanges: 0,
          duration: 0,
        });
        // Update project phase so it doesn't get stuck on the same phase
        const newPhase = i + 1;
        const progress = Math.round((newPhase / 16) * 100);
        await db.updateSeoProject(projectId, {
          campaignPhase: newPhase,
          campaignProgress: progress,
          campaignLastPhaseResult: { error: phaseErr.message, crashed: true } as any,
        }).catch(() => {}); // Don't let DB error stop the loop
      }
    }
  } catch (loopErr: any) {
    // If the entire loop crashes, mark campaign as failed
    console.error(`[Campaign] runAllPhases loop crashed for project ${projectId}:`, loopErr.message);
    await db.updateSeoProject(projectId, {
      campaignStatus: "failed",
      campaignLastPhaseResult: { error: loopErr.message, crashed: true, recoverable: true } as any,
    }).catch(() => {});
    throw loopErr;
  }

  const completed = results.filter(r => r.status === "completed").length;
  const failed = results.filter(r => r.status === "failed").length;
  const skipped = results.filter(r => r.status === "skipped").length;

  // Mark campaign as completed (or failed if all phases failed)
  await db.updateSeoProject(projectId, {
    campaignStatus: failed === results.length ? "failed" : "completed",
    campaignPhase: 16,
    campaignProgress: 100,
    campaignCompletedAt: new Date(),
  }).catch(() => {});

  // Send notification to owner
  try {
    const domain = project.domain;
    if (failed === 0) {
      await notifyOwner({
        title: `SEO Campaign Completed: ${domain}`,
        content: `Campaign for ${domain} completed successfully!\n\n` +
          `Phases: ${completed} completed, ${skipped} skipped\n` +
          `WordPress changes: ${totalWpChanges}\n` +
          `Duration: ${results.reduce((sum, r) => sum + r.duration, 0)}ms`,
      });
    } else {
      await notifyOwner({
        title: `SEO Campaign Issues: ${domain}`,
        content: `Campaign for ${domain} finished with issues.\n\n` +
          `Phases: ${completed} completed, ${failed} failed, ${skipped} skipped\n` +
          `WordPress changes: ${totalWpChanges}\n` +
          `Failed phases: ${results.filter(r => r.status === "failed").map(r => r.phaseName).join(", ")}`,
      });
    }
  } catch (notifErr: any) {
    console.error("[Campaign] Failed to send notification:", notifErr.message);
  }

  return {
    results,
    summary: { completed, failed, skipped, totalWpChanges },
  };
}

// ═══ Stale Campaign Recovery ═══
// Detect campaigns stuck in "running" for > 2 hours and resume them
export async function recoverStaleCampaigns(): Promise<{
  recovered: number;
  details: { projectId: number; domain: string; fromPhase: number; action: string }[];
}> {
  const allDb = await db.getDb();
  if (!allDb) return { recovered: 0, details: [] };

  const { seoProjects } = await import("../drizzle/schema");
  const { eq, and, lt } = await import("drizzle-orm");

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const staleProjects = await allDb.select()
    .from(seoProjects)
    .where(
      and(
        eq(seoProjects.campaignStatus, "running"),
        lt(seoProjects.updatedAt, twoHoursAgo)
      )
    );

  const details: { projectId: number; domain: string; fromPhase: number; action: string }[] = [];

  for (const project of staleProjects) {
    const currentPhase = project.campaignPhase || 0;

    if (currentPhase >= 16) {
      // Campaign is actually done, just status wasn't updated
      await db.updateSeoProject(project.id, {
        campaignStatus: "completed",
        campaignProgress: 100,
        campaignCompletedAt: new Date(),
      });
      details.push({ projectId: project.id, domain: project.domain, fromPhase: currentPhase, action: "marked_completed" });
    } else {
      // Resume from where it left off
      console.log(`[Campaign Recovery] Resuming ${project.domain} from phase ${currentPhase}`);
      details.push({ projectId: project.id, domain: project.domain, fromPhase: currentPhase, action: "resumed" });

      // Fire-and-forget resume
      (async () => {
        try {
          await runAllPhases(project.id);
          console.log(`[Campaign Recovery] ${project.domain} completed after resume`);
        } catch (err: any) {
          console.error(`[Campaign Recovery] ${project.domain} failed after resume:`, err.message);
          await db.updateSeoProject(project.id, {
            campaignStatus: "failed",
            campaignLastPhaseResult: { error: err.message, recoveryFailed: true } as any,
          }).catch(() => {});
        }
      })();
    }
  }

  if (details.length > 0) {
    console.log(`[Campaign Recovery] Recovered ${details.length} stale campaigns`);
  }

  return { recovered: details.length, details };
}
