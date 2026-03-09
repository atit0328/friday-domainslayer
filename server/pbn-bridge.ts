/**
 * PBN-SEO Bridge
 * 
 * Connects PBN Manager with SEO Automation:
 * - AI selects best PBN sites for target domain based on niche relevance, DA, and footprint diversity
 * - Generates natural anchor text distribution (branded, exact, partial, generic, naked URL)
 * - Creates SEO-optimized content with embedded backlinks
 * - Posts to WordPress PBN sites via REST API
 * - Tracks backlink status (pending → built → indexed → active/lost)
 */

import { fetchWithPoolProxy } from "./proxy-pool";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";

// Helper: wrap fetch with proxy pool
async function pbnBridgeFetch(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<Response> {
  const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  try {
    const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout: 15000 });
    return response;
  } catch (e) {
    // Fallback to direct fetch if proxy fails
    return fetch(url, init);
  }
}


// ═══ Types ═══

export interface PBNSiteScore {
  siteId: number;
  name: string;
  url: string;
  da: number;
  pa: number;
  score: number; // 0-100 suitability score
  reasons: string[];
  postCount: number;
  lastPost: Date | null;
}

export interface AnchorTextPlan {
  anchors: {
    text: string;
    type: "branded" | "exact_match" | "partial_match" | "generic" | "naked_url" | "lsi";
    percentage: number;
  }[];
  aiReasoning: string;
}

export interface PBNPostPlan {
  siteId: number;
  siteName: string;
  siteUrl: string;
  targetUrl: string;
  anchorText: string;
  anchorType: string;
  keyword: string;
  niche: string;
  scheduledFor?: Date;
}

export interface PBNBuildResult {
  totalPlanned: number;
  totalBuilt: number;
  totalFailed: number;
  posts: {
    siteId: number;
    siteName: string;
    postId: number;
    title: string;
    status: "published" | "pending" | "failed";
    backlinkId?: number;
    error?: string;
  }[];
  aiSummary: string;
}

// ═══ Core Functions ═══

/**
 * Score and rank PBN sites for a given SEO project
 * AI considers: DA relevance, niche match, posting frequency, footprint diversity
 */
export async function scorePBNSites(
  userId: number,
  projectDomain: string,
  projectNiche: string | null,
  strategy: string,
): Promise<PBNSiteScore[]> {
  const sites = await db.getUserPbnSites(userId);
  if (sites.length === 0) return [];

  const siteData = sites.map(s => ({
    id: s.id,
    name: s.name,
    url: s.url,
    da: s.da || 0,
    pa: s.pa || 0,
    status: s.status,
    postCount: s.postCount,
    lastPost: s.lastPost,
  }));

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a PBN network strategist. You evaluate PBN sites for their suitability 
to build backlinks to a target domain. Consider:
- DA/PA relevance (higher is better, but too high looks suspicious for a PBN)
- Posting frequency (sites with too many recent posts look spammy)
- Niche relevance (infer from site name/URL)
- Footprint diversity (vary the types of sites used)
- Status (only active sites)
Return ONLY valid JSON.`
      },
      {
        role: "user",
        content: `Score these PBN sites for building backlinks to "${projectDomain}":
Niche: ${projectNiche || "general"}
Strategy: ${strategy}

PBN Sites:
${siteData.map(s => `- ID:${s.id} "${s.name}" URL:${s.url} DA:${s.da} PA:${s.pa} Status:${s.status} Posts:${s.postCount} LastPost:${s.lastPost || "never"}`).join("\n")}

Score each site 0-100 for suitability. Only include active sites.
Return JSON array:
[{"siteId": number, "score": number, "reasons": ["string"]}]`
      }
    ],
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  
  let scores: { siteId: number; score: number; reasons: string[] }[];
  try {
    scores = JSON.parse(cleaned);
  } catch {
    // Fallback: score all active sites equally
    scores = siteData
      .filter(s => s.status === "active")
      .map(s => ({ siteId: s.id, score: 50, reasons: ["Default scoring"] }));
  }

  return scores
    .map(sc => {
      const site = siteData.find(s => s.id === sc.siteId);
      if (!site) return null;
      return {
        siteId: site.id,
        name: site.name,
        url: site.url,
        da: site.da,
        pa: site.pa,
        score: sc.score,
        reasons: sc.reasons,
        postCount: site.postCount,
        lastPost: site.lastPost,
      };
    })
    .filter((s): s is PBNSiteScore => s !== null)
    .sort((a, b) => b.score - a.score);
}

/**
 * Generate natural anchor text distribution plan
 * Follows safe ratios to avoid Google penalty
 */
export async function generateAnchorPlan(
  targetDomain: string,
  targetKeywords: string[],
  niche: string,
  linkCount: number,
  strategy: string,
): Promise<AnchorTextPlan> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a link building expert specializing in anchor text optimization.
You create natural-looking anchor text distributions that avoid Google penalties.
Safe ratios for ${strategy} strategy:
- Branded anchors: 30-40% (domain name, brand variations)
- Exact match: 5-15% (target keyword exactly)
- Partial match: 15-25% (keyword + other words)
- Generic: 10-20% ("click here", "learn more", "this website")
- Naked URL: 5-15% (just the URL)
- LSI/Related: 10-20% (semantically related terms)
Return ONLY valid JSON.`
      },
      {
        role: "user",
        content: `Create anchor text distribution for ${linkCount} backlinks to "${targetDomain}":
Target keywords: ${targetKeywords.join(", ")}
Niche: ${niche}
Strategy: ${strategy}

Return JSON:
{
  "anchors": [{"text": "string", "type": "branded"|"exact_match"|"partial_match"|"generic"|"naked_url"|"lsi", "percentage": number}],
  "aiReasoning": "string"
}`
      }
    ],
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  
  try {
    return JSON.parse(cleaned) as AnchorTextPlan;
  } catch {
    // Fallback safe distribution
    const brand = targetDomain.replace(/\..+$/, "");
    return {
      anchors: [
        { text: brand, type: "branded", percentage: 35 },
        { text: targetKeywords[0] || brand, type: "exact_match", percentage: 10 },
        { text: `best ${targetKeywords[0] || niche}`, type: "partial_match", percentage: 20 },
        { text: "click here", type: "generic", percentage: 15 },
        { text: `https://${targetDomain}`, type: "naked_url", percentage: 10 },
        { text: `${niche} guide`, type: "lsi", percentage: 10 },
      ],
      aiReasoning: "Fallback distribution using safe ratios",
    };
  }
}

/**
 * Generate PBN post content with natural backlink placement
 */
export async function generatePBNContent(
  targetUrl: string,
  anchorText: string,
  keyword: string,
  niche: string,
  siteUrl: string,
  contentType: string = "article",
  writingTone: string = "professional",
): Promise<{ title: string; content: string; excerpt: string }> {
  // Content type instructions
  const contentTypeGuide: Record<string, string> = {
    article: "Write a standard blog article with informative content, proper heading structure, and natural flow.",
    review: "Write a product/service review with pros/cons, ratings, personal experience, and a recommendation. Include comparison points.",
    news: "Write a news-style article with a compelling headline, inverted pyramid structure (most important info first), quotes, and timely angle.",
    tutorial: "Write a step-by-step tutorial/how-to guide with numbered steps, code examples or screenshots descriptions, prerequisites, and a clear outcome.",
    listicle: "Write a list-style article (e.g., 'Top 10...', '7 Best...') with numbered items, brief descriptions for each, and a summary.",
  };

  // Writing tone instructions
  const toneGuide: Record<string, string> = {
    professional: "Use a professional, authoritative tone. Formal language, industry terminology, data-driven statements.",
    casual: "Use a casual, conversational tone. Write like you're talking to a friend. Use contractions, informal language, and relatable examples.",
    academic: "Use an academic, research-oriented tone. Cite sources, use formal language, include statistics and evidence-based arguments.",
    persuasive: "Use a persuasive, sales-oriented tone. Focus on benefits, use emotional triggers, include calls-to-action, and create urgency.",
    storytelling: "Use a storytelling tone. Start with a hook, include personal anecdotes, build narrative tension, and weave the information into a compelling story.",
  };

  const typeInstruction = contentTypeGuide[contentType] || contentTypeGuide.article;
  const toneInstruction = toneGuide[writingTone] || toneGuide.professional;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a PBN content writer. You create content that:
1. Look natural and human-written (NOT AI-generated looking)
2. Are topically relevant to the niche
3. Naturally incorporate the backlink with the given anchor text
4. Are 600-1000 words long
5. Have proper heading structure
6. Include the backlink in the middle of the content (not first or last paragraph)
7. Read as genuine blog posts, not link placement vehicles

CONTENT TYPE: ${contentType.toUpperCase()}
${typeInstruction}

WRITING TONE: ${writingTone.toUpperCase()}
${toneInstruction}

Write in HTML format suitable for WordPress.
Return ONLY valid JSON.`
      },
      {
        role: "user",
        content: `Write a PBN ${contentType} in ${writingTone} tone:
Target URL: ${targetUrl}
Anchor Text: ${anchorText}
Keyword: ${keyword}
Niche: ${niche}
PBN Site: ${siteUrl}

Return JSON:
{
  "title": "string (engaging, click-worthy title related to niche, matching ${contentType} format)",
  "content": "string (full HTML ${contentType} with the backlink naturally embedded, written in ${writingTone} tone)",
  "excerpt": "string (2-3 sentence excerpt)"
}`
      }
    ],
  });

  const content = response.choices[0].message.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  
  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      title: `Guide to ${keyword} in ${niche}`,
      content: `<p>This is a comprehensive guide about ${keyword}.</p><p>For more information, visit <a href="${targetUrl}">${anchorText}</a>.</p>`,
      excerpt: `A comprehensive guide about ${keyword} in the ${niche} industry.`,
    };
  }
}

/**
 * Post content to a WordPress PBN site via REST API
 */
export async function postToWordPress(
  siteUrl: string,
  username: string,
  appPassword: string,
  title: string,
  content: string,
  excerpt?: string,
): Promise<{ success: boolean; wpPostId?: number; wpPostUrl?: string; error?: string }> {
  try {
    // Normalize URL
    const baseUrl = siteUrl.replace(/\/+$/, "");
    const apiUrl = `${baseUrl}/wp-json/wp/v2/posts`;
    
    // Base64 encode credentials for WordPress Application Password auth
    const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");
    
    const response = await pbnBridgeFetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${credentials}`,
      },
      body: JSON.stringify({
        title,
        content,
        excerpt: excerpt || "",
        status: "publish",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `WordPress API error ${response.status}: ${errorText.slice(0, 200)}` };
    }

    const data = await response.json() as { id: number; link: string };
    return {
      success: true,
      wpPostId: data.id,
      wpPostUrl: data.link,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Execute full PBN backlink building campaign for a SEO project
 * This is the main orchestrator function
 */
export async function executePBNBuild(
  userId: number,
  projectId: number,
  linkCount: number = 5,
): Promise<PBNBuildResult> {
  // 1. Get project info
  const project = await db.getSeoProjectById(projectId);
  if (!project) throw new Error("Project not found");

  // 2. Score and select best PBN sites
  const scoredSites = await scorePBNSites(
    userId, project.domain, project.niche, project.strategy,
  );
  
  if (scoredSites.length === 0) {
    return {
      totalPlanned: linkCount,
      totalBuilt: 0,
      totalFailed: 0,
      posts: [],
      aiSummary: "No PBN sites available. Please add PBN sites in the PBN Manager first.",
    };
  }

  // 3. Generate anchor text plan
  const targetKeywords = (project.targetKeywords as string[]) || [project.domain];
  const anchorPlan = await generateAnchorPlan(
    project.domain, targetKeywords, project.niche || "general", linkCount, project.strategy,
  );

  // 4. Create post plans — distribute across sites
  const plans: PBNPostPlan[] = [];
  const targetUrl = `https://${project.domain}`;
  let anchorIdx = 0;

  for (let i = 0; i < linkCount && i < scoredSites.length; i++) {
    const site = scoredSites[i % scoredSites.length];
    const anchor = anchorPlan.anchors[anchorIdx % anchorPlan.anchors.length];
    anchorIdx++;

    plans.push({
      siteId: site.siteId,
      siteName: site.name,
      siteUrl: site.url,
      targetUrl,
      anchorText: anchor.text,
      anchorType: anchor.type,
      keyword: targetKeywords[0] || project.domain,
      niche: project.niche || "general",
    });
  }

  // 5. Execute each post
  const results: PBNBuildResult["posts"] = [];
  let totalBuilt = 0;
  let totalFailed = 0;

  for (const plan of plans) {
    try {
      // Generate content
      const { title, content, excerpt } = await generatePBNContent(
        plan.targetUrl, plan.anchorText, plan.keyword, plan.niche, plan.siteUrl,
      );

      // Save post record
      const post = await db.addPbnPost({
        siteId: plan.siteId,
        title,
        content,
        targetUrl: plan.targetUrl,
        anchorText: plan.anchorText,
        keyword: plan.keyword,
        status: "pending",
      });

      // Get site credentials
      const sites = await db.getUserPbnSites(userId);
      const site = sites.find(s => s.id === plan.siteId);

      if (site) {
        // Check if site has valid credentials
        if (!site.username || !site.appPassword) {
          results.push({
            siteId: plan.siteId,
            siteName: plan.siteName,
            postId: post.id,
            title,
            status: "failed",
            error: `Missing WordPress credentials for ${plan.siteName}. Please set username and application password in PBN Manager.`,
          });
          totalFailed++;
          continue;
        }

        // Try to post to WordPress
        const wpResult = await postToWordPress(
          site.url, site.username, site.appPassword, title, content, excerpt,
        );

        if (wpResult.success) {
          // Update PBN post with WP data
          // Note: we'd need an updatePbnPost helper, for now just track in backlink_log
          
          // Add to backlink_log for the SEO project
          const bl = await db.addBacklink(projectId, {
            sourceUrl: wpResult.wpPostUrl || `${site.url}/?p=${wpResult.wpPostId}`,
            sourceDomain: new URL(site.url).hostname,
            targetUrl: plan.targetUrl,
            anchorText: plan.anchorText,
            linkType: "dofollow",
            sourceType: "pbn",
            sourceDA: site.da || undefined,
            status: "active",
          } as any);

          // Update project stats
          await db.updateSeoProject(projectId, {
            totalBacklinksBuilt: (project.totalBacklinksBuilt || 0) + totalBuilt + 1,
            currentBacklinks: (project.currentBacklinks || 0) + 1,
            lastActionAt: new Date(),
          });

          // Update PBN site stats
          await db.updatePbnSite(site.id, {
            lastPost: new Date(),
            postCount: (site.postCount || 0) + 1,
          });

          results.push({
            siteId: plan.siteId,
            siteName: plan.siteName,
            postId: post.id,
            title,
            status: "published",
            backlinkId: bl.id,
          });
          totalBuilt++;
        } else {
          results.push({
            siteId: plan.siteId,
            siteName: plan.siteName,
            postId: post.id,
            title,
            status: "failed",
            error: wpResult.error,
          });
          totalFailed++;
        }
      } else {
        results.push({
          siteId: plan.siteId,
          siteName: plan.siteName,
          postId: post.id,
          title,
          status: "pending",
          error: "Site credentials not found",
        });
        totalFailed++;
      }
    } catch (err: any) {
      results.push({
        siteId: plan.siteId,
        siteName: plan.siteName,
        postId: 0,
        title: "Failed to generate",
        status: "failed",
        error: err.message,
      });
      totalFailed++;
    }
  }

  // 6. Log the action
  await db.addSeoAction(projectId, {
    actionType: "pbn_post",
    title: `PBN Build: ${totalBuilt}/${plans.length} links built`,
    description: `Executed PBN backlink campaign. ${totalBuilt} published, ${totalFailed} failed. Anchor distribution: ${(anchorPlan?.anchors || []).map(a => `${a.type || "unknown"}:${a.percentage ?? 0}%`).join(", ") || "N/A"}`,
    status: totalBuilt > 0 ? "completed" : "failed",
    executedAt: new Date(),
    completedAt: new Date(),
    result: { results, anchorPlan } as any,
    impact: totalBuilt > 0 ? "positive" : "neutral",
  });

  return {
    totalPlanned: plans.length,
    totalBuilt,
    totalFailed,
    posts: results,
    aiSummary: `PBN campaign executed: ${totalBuilt}/${plans.length} backlinks successfully built across ${new Set(results.filter(r => r.status === "published").map(r => r.siteId)).size} PBN sites. Anchor text distribution follows ${project.strategy} strategy with natural ratios. ${totalFailed > 0 ? `${totalFailed} posts failed — check site credentials and WordPress API access.` : "All posts published successfully."}`,
  };
}
