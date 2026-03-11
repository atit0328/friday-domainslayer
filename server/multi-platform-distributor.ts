/**
 * Multi-Platform Content Distribution Engine
 * 
 * Posts SEO content to MANY platforms simultaneously — not just Telegraph.
 * Focuses on platforms that require NO authentication (public APIs / open posting).
 * 
 * Tier 1 (High DA, No Auth):
 *   - Telegraph (telegra.ph) — DA 82, dofollow, instant
 *   - Rentry.co — DA 60+, dofollow, instant, markdown
 *   - Write.as — DA 65+, dofollow, anonymous posting
 *   - Telegra.ph mirrors — multiple Telegraph accounts for diversity
 *   - GitHub Gist (public) — DA 98, nofollow but massive authority
 *   - Paste.ee — DA 55, dofollow, instant
 *   - TextBin.net — DA 45, dofollow
 *   - JustPaste.it — DA 72, dofollow, instant
 *   - Pastebin.com — DA 90, nofollow but high authority
 * 
 * Tier 2 (Medium DA, Form Submission):
 *   - WordPress.com comment spam on open blogs
 *   - Blog comments via WP REST API
 *   - Article directories (form submission)
 *   - Profile links on forums
 * 
 * Tier 3 (Link Pyramid — boost Tier 1 URLs):
 *   - Ping services for rapid indexing
 *   - Social signal triggers
 *   - RSS feed submission
 *   - IndexNow API submission
 * 
 * After posting, ALL URLs are sent through Rapid Indexing Engine.
 */

import { invokeLLM } from "./_core/llm";
import { fetchWithPoolProxy } from "./proxy-pool";
import { rapidIndexUrl, type IndexingRequest } from "./rapid-indexing-engine";
import { sendTelegramNotification } from "./telegram-notifier";
import * as db from "./db";
import crypto from "crypto";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface DistributionTarget {
  targetUrl: string;
  targetDomain: string;
  keyword: string;
  niche: string;
  anchorText: string;
  projectId?: number;
}

export interface PlatformPostResult {
  platform: string;
  platformType: "web2" | "paste" | "social" | "directory" | "comment" | "forum" | "wiki";
  success: boolean;
  publishedUrl?: string;
  error?: string;
  da: number;
  linkType: "dofollow" | "nofollow";
  indexed: boolean;
  indexResults?: any[];
}

export interface DistributionSession {
  id: string;
  target: DistributionTarget;
  startedAt: number;
  completedAt?: number;
  results: PlatformPostResult[];
  totalPlatforms: number;
  successCount: number;
  failCount: number;
  indexedCount: number;
  tier1Success: number;
  tier2Success: number;
  tier3Pings: number;
}

// ═══════════════════════════════════════════════
//  PLATFORM REGISTRY
// ═══════════════════════════════════════════════

interface PlatformConfig {
  name: string;
  domain: string;
  da: number;
  linkType: "dofollow" | "nofollow";
  tier: 1 | 2 | 3;
  type: PlatformPostResult["platformType"];
  requiresAuth: boolean;
  enabled: boolean;
}

const PLATFORMS: PlatformConfig[] = [
  // Tier 1 — No Auth, High DA
  { name: "Telegraph", domain: "telegra.ph", da: 82, linkType: "dofollow", tier: 1, type: "web2", requiresAuth: false, enabled: true },
  { name: "JustPaste.it", domain: "justpaste.it", da: 72, linkType: "dofollow", tier: 1, type: "paste", requiresAuth: false, enabled: true },
  { name: "Rentry.co", domain: "rentry.co", da: 62, linkType: "dofollow", tier: 1, type: "paste", requiresAuth: false, enabled: true },
  { name: "Write.as", domain: "write.as", da: 65, linkType: "dofollow", tier: 1, type: "web2", requiresAuth: false, enabled: true },
  { name: "Telegraph Mirror 2", domain: "telegra.ph", da: 82, linkType: "dofollow", tier: 1, type: "web2", requiresAuth: false, enabled: true },
  { name: "Telegraph Mirror 3", domain: "telegra.ph", da: 82, linkType: "dofollow", tier: 1, type: "web2", requiresAuth: false, enabled: true },
  { name: "Paste.ee", domain: "paste.ee", da: 55, linkType: "dofollow", tier: 1, type: "paste", requiresAuth: false, enabled: true },
  { name: "TextBin.net", domain: "textbin.net", da: 45, linkType: "dofollow", tier: 1, type: "paste", requiresAuth: false, enabled: true },
  // Tier 2 — Form Submission / API with search
  { name: "Blog Comments", domain: "various", da: 40, linkType: "nofollow", tier: 2, type: "comment", requiresAuth: false, enabled: true },
  { name: "WordPress Comments", domain: "various", da: 50, linkType: "nofollow", tier: 2, type: "comment", requiresAuth: false, enabled: true },
];

// ═══════════════════════════════════════════════
//  PROXY-WRAPPED FETCH
// ═══════════════════════════════════════════════

async function distFetch(url: string, init: RequestInit = {}, targetDomain?: string): Promise<Response> {
  const domain = targetDomain || url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
  try {
    const { response } = await fetchWithPoolProxy(url, init, { targetDomain: domain, timeout: 20000 });
    return response;
  } catch {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

// ═══════════════════════════════════════════════
//  AI CONTENT GENERATION — UNIQUE PER PLATFORM
// ═══════════════════════════════════════════════

/**
 * Generate unique, platform-specific content with embedded backlink
 * Each platform gets a DIFFERENT version to avoid duplicate content penalty
 */
export async function generateDistributionContent(
  platform: string,
  target: DistributionTarget,
  format: "html" | "markdown" | "plaintext",
  wordCount: number = 500,
): Promise<{ title: string; content: string; excerpt: string; tags: string[] }> {
  const formatGuide = {
    html: "HTML with <p>, <h2>, <h3>, <a> tags. Embed backlink as <a href> tag.",
    markdown: "Markdown format with ## headings, [link](url) syntax. Embed backlink as markdown link.",
    plaintext: "Plain text with line breaks. Include URL directly in text.",
  };

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert SEO content writer creating UNIQUE content for "${platform}".
Rules:
1. Content MUST be unique — different angle/perspective from other platforms
2. Write naturally, NOT like AI-generated content
3. ${wordCount} words minimum
4. Naturally embed the backlink — NOT in first or last paragraph
5. For gambling/casino niche: use indirect language ("entertainment", "gaming", "online leisure")
6. Format: ${formatGuide[format]}
7. Include 2-3 internal headings for structure
8. Write in Thai language if keyword is Thai, otherwise English
9. Add a compelling meta description as excerpt
Return ONLY valid JSON.`,
        },
        {
          role: "user",
          content: `Create content for ${platform}:
Target URL: ${target.targetUrl}
Anchor Text: ${target.anchorText}
Keyword: ${target.keyword}
Niche: ${target.niche}
Return JSON:
{
  "title": "engaging title",
  "content": "full ${format} content with backlink embedded",
  "excerpt": "2-3 sentence summary",
  "tags": ["5-8 relevant tags"]
}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.toString() || "{}";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    // Fallback content
    const link = format === "html"
      ? `<a href="${target.targetUrl}">${target.anchorText}</a>`
      : format === "markdown"
        ? `[${target.anchorText}](${target.targetUrl})`
        : target.targetUrl;

    return {
      title: `คู่มือ ${target.keyword} — แนะนำสำหรับผู้เริ่มต้น`,
      content: format === "html"
        ? `<h2>แนะนำ ${target.keyword}</h2><p>บทความนี้จะพาคุณทำความรู้จักกับ ${target.keyword} อย่างละเอียด ครอบคลุมทุกแง่มุมที่คุณต้องรู้</p><h3>ทำไมต้องสนใจ ${target.keyword}</h3><p>ในยุคดิจิทัล ${target.keyword} กลายเป็นสิ่งที่หลายคนให้ความสนใจ ด้วยเหตุผลหลายประการ ทั้งความสะดวก ความปลอดภัย และโอกาสที่หลากหลาย</p><p>สำหรับข้อมูลเพิ่มเติมและรีวิวจากผู้เชี่ยวชาญ สามารถเยี่ยมชม ${link} ซึ่งรวบรวมข้อมูลที่เป็นประโยชน์ไว้อย่างครบถ้วน</p><h3>สรุป</h3><p>หวังว่าบทความนี้จะช่วยให้คุณเข้าใจ ${target.keyword} มากขึ้น อย่าลืมศึกษาข้อมูลให้รอบด้านก่อนตัดสินใจ</p>`
        : format === "markdown"
          ? `## แนะนำ ${target.keyword}\n\nบทความนี้จะพาคุณทำความรู้จักกับ ${target.keyword} อย่างละเอียด\n\n### ทำไมต้องสนใจ ${target.keyword}\n\nในยุคดิจิทัล ${target.keyword} กลายเป็นสิ่งที่หลายคนให้ความสนใจ\n\nสำหรับข้อมูลเพิ่มเติม สามารถเยี่ยมชม ${link}\n\n### สรุป\n\nหวังว่าบทความนี้จะช่วยให้คุณเข้าใจ ${target.keyword} มากขึ้น`
          : `แนะนำ ${target.keyword}\n\nบทความนี้จะพาคุณทำความรู้จักกับ ${target.keyword}\n\nสำหรับข้อมูลเพิ่มเติม: ${target.targetUrl}\n\nหวังว่าจะเป็นประโยชน์`,
      excerpt: `คู่มือ ${target.keyword} สำหรับผู้เริ่มต้น พร้อมรีวิวและแนะนำจากผู้เชี่ยวชาญ`,
      tags: [target.keyword, target.niche, "guide", "review", "tips"],
    };
  }
}

// ═══════════════════════════════════════════════
//  TELEGRAPH NODE CONVERTER
// ═══════════════════════════════════════════════

function htmlToTelegraphNodes(html: string, targetUrl: string, anchorText: string): any[] {
  const nodes: any[] = [];
  const paragraphs = html
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "|||H|||$1|||/H|||")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "|||A:$1|||$2|||/A|||")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .split(/\n\n|\n|<br\s*\/?>/)
    .filter(p => p.trim().length > 0);

  for (const para of paragraphs) {
    if (para.includes("|||H|||")) {
      const text = para.replace(/\|\|\|H\|\|\|/g, "").replace(/\|\|\|\/H\|\|\|/g, "").trim();
      if (text) nodes.push({ tag: "h3", children: [text] });
    } else if (para.includes("|||A:")) {
      const children: any[] = [];
      const parts = para.split(/\|\|\|A:[^|]*\|\|\||\|\|\|\/A\|\|\|/);
      const linkMatches = Array.from(para.matchAll(/\|\|\|A:([^|]*)\|\|\|([^|]*)\|\|\|\/A\|\|\|/g));
      let linkIdx = 0;
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].trim()) children.push(parts[i]);
        if (linkIdx < linkMatches.length && i < parts.length - 1) {
          const href = linkMatches[linkIdx][1] || targetUrl;
          const linkText = linkMatches[linkIdx][2] || anchorText;
          children.push({ tag: "a", attrs: { href }, children: [linkText] });
          linkIdx++;
        }
      }
      if (children.length > 0) nodes.push({ tag: "p", children });
    } else {
      nodes.push({ tag: "p", children: [para.trim()] });
    }
  }

  // Ensure at least one link
  if (!JSON.stringify(nodes).includes(targetUrl)) {
    nodes.push({
      tag: "p",
      children: ["สำหรับข้อมูลเพิ่มเติม ", { tag: "a", attrs: { href: targetUrl }, children: [anchorText] }, "."],
    });
  }

  return nodes.length > 0 ? nodes : [{ tag: "p", children: [`${anchorText}: ${targetUrl}`] }];
}

// ═══════════════════════════════════════════════
//  PLATFORM POSTERS — NO AUTH REQUIRED
// ═══════════════════════════════════════════════

/**
 * Post to Telegraph (telegra.ph) — Public API, no auth
 */
async function postToTelegraph(target: DistributionTarget, variant: number = 0): Promise<PlatformPostResult> {
  const base: PlatformPostResult = {
    platform: variant > 0 ? `Telegraph Mirror ${variant + 1}` : "Telegraph",
    platformType: "web2", success: false, da: 82, linkType: "dofollow", indexed: false,
  };

  try {
    const suffix = crypto.randomBytes(3).toString("hex");
    const accountRes = await distFetch("https://api.telegra.ph/createAccount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        short_name: `${target.niche.replace(/\s+/g, "").slice(0, 8)}${suffix}`,
        author_name: `${target.keyword.split(" ")[0]} Expert`,
        author_url: target.targetUrl,
      }),
    }, "telegra.ph");

    const accountData = await accountRes.json() as any;
    if (!accountData.ok || !accountData.result?.access_token) {
      base.error = "Failed to create Telegraph account";
      return base;
    }

    const content = await generateDistributionContent(
      variant > 0 ? `Telegraph (variation ${variant + 1})` : "Telegraph",
      target, "html", 400 + variant * 100,
    );

    const nodes = htmlToTelegraphNodes(content.content, target.targetUrl, target.anchorText);

    const pageRes = await distFetch("https://api.telegra.ph/createPage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accountData.result.access_token,
        title: content.title,
        author_name: `${target.keyword.split(" ")[0]} Expert`,
        author_url: target.targetUrl,
        content: nodes,
        return_content: false,
      }),
    }, "telegra.ph");

    const pageData = await pageRes.json() as any;
    if (!pageData.ok || !pageData.result?.url) {
      base.error = "Failed to create Telegraph page";
      return base;
    }

    base.success = true;
    base.publishedUrl = pageData.result.url;
    return base;
  } catch (err: any) {
    base.error = err.message;
    return base;
  }
}

/**
 * Post to JustPaste.it — Public API, no auth required
 */
async function postToJustPasteIt(target: DistributionTarget): Promise<PlatformPostResult> {
  const base: PlatformPostResult = {
    platform: "JustPaste.it", platformType: "paste", success: false, da: 72, linkType: "dofollow", indexed: false,
  };

  try {
    const content = await generateDistributionContent("JustPaste.it", target, "html", 500);

    const res = await distFetch("https://justpaste.it/api/v1/paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: content.title,
        body: content.content,
        visibility: "public",
        format: "html",
      }),
    }, "justpaste.it");

    if (res.ok) {
      const data = await res.json() as any;
      const url = data.url || data.link || `https://justpaste.it/${data.id || data.slug || ""}`;
      base.success = true;
      base.publishedUrl = url;
    } else {
      // Fallback: try form submission
      const formRes = await distFetch("https://justpaste.it/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          title: content.title,
          body: content.content,
          visibility: "public",
        }).toString(),
      }, "justpaste.it");

      if (formRes.ok || formRes.status === 302 || formRes.status === 301) {
        const location = formRes.headers.get("location");
        if (location) {
          base.success = true;
          base.publishedUrl = location.startsWith("http") ? location : `https://justpaste.it${location}`;
        }
      }

      if (!base.success) {
        base.error = `HTTP ${res.status}`;
      }
    }
    return base;
  } catch (err: any) {
    base.error = err.message;
    return base;
  }
}

/**
 * Post to Rentry.co — Markdown paste, no auth
 */
async function postToRentry(target: DistributionTarget): Promise<PlatformPostResult> {
  const base: PlatformPostResult = {
    platform: "Rentry.co", platformType: "paste", success: false, da: 62, linkType: "dofollow", indexed: false,
  };

  try {
    const content = await generateDistributionContent("Rentry.co", target, "markdown", 500);
    const slug = `${target.keyword.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9\u0E00-\u0E7F-]/g, "").slice(0, 20)}-${crypto.randomBytes(3).toString("hex")}`;

    // Rentry uses a CSRF token + form submission
    // First get the CSRF token
    const pageRes = await distFetch("https://rentry.co/", {}, "rentry.co");
    const pageHtml = await pageRes.text();
    const csrfMatch = pageHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/);
    const csrfToken = csrfMatch?.[1] || "";

    const cookies = pageRes.headers.get("set-cookie") || "";
    const csrfCookie = cookies.match(/csrftoken=([^;]+)/)?.[1] || "";

    const formBody = new URLSearchParams({
      csrfmiddlewaretoken: csrfToken,
      url: slug,
      edit_code: crypto.randomBytes(6).toString("hex"),
      text: `# ${content.title}\n\n${content.content}`,
    });

    const postRes = await distFetch("https://rentry.co/api/new", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": `csrftoken=${csrfCookie}`,
        "Referer": "https://rentry.co/",
      },
      body: formBody.toString(),
    }, "rentry.co");

    if (postRes.ok) {
      const data = await postRes.json() as any;
      if (data.status === "200" || data.url) {
        base.success = true;
        base.publishedUrl = data.url || `https://rentry.co/${slug}`;
      } else {
        base.error = data.content || "Rentry API error";
      }
    } else {
      base.error = `HTTP ${postRes.status}`;
    }
    return base;
  } catch (err: any) {
    base.error = err.message;
    return base;
  }
}

/**
 * Post to Write.as — Anonymous publishing, no auth required
 */
async function postToWriteAs(target: DistributionTarget): Promise<PlatformPostResult> {
  const base: PlatformPostResult = {
    platform: "Write.as", platformType: "web2", success: false, da: 65, linkType: "dofollow", indexed: false,
  };

  try {
    const content = await generateDistributionContent("Write.as", target, "markdown", 500);

    const res = await distFetch("https://write.as/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: `# ${content.title}\n\n${content.content}`,
        title: content.title,
      }),
    }, "write.as");

    if (res.ok || res.status === 201) {
      const data = await res.json() as any;
      const postData = data.data || data;
      if (postData.id) {
        base.success = true;
        base.publishedUrl = `https://write.as/${postData.id}`;
      } else {
        base.error = "No post ID returned";
      }
    } else {
      base.error = `HTTP ${res.status}`;
    }
    return base;
  } catch (err: any) {
    base.error = err.message;
    return base;
  }
}

/**
 * Post to Paste.ee — Paste service, no auth
 */
async function postToPasteEe(target: DistributionTarget): Promise<PlatformPostResult> {
  const base: PlatformPostResult = {
    platform: "Paste.ee", platformType: "paste", success: false, da: 55, linkType: "dofollow", indexed: false,
  };

  try {
    const content = await generateDistributionContent("Paste.ee", target, "plaintext", 400);

    const res = await distFetch("https://api.paste.ee/v1/pastes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: content.title,
        sections: [{
          name: content.title,
          syntax: "text",
          contents: `${content.title}\n\n${content.content}\n\nMore info: ${target.targetUrl}`,
        }],
      }),
    }, "paste.ee");

    if (res.ok || res.status === 201) {
      const data = await res.json() as any;
      if (data.success && data.link) {
        base.success = true;
        base.publishedUrl = data.link;
      } else if (data.id) {
        base.success = true;
        base.publishedUrl = `https://paste.ee/p/${data.id}`;
      } else {
        base.error = "No paste link returned";
      }
    } else {
      base.error = `HTTP ${res.status}`;
    }
    return base;
  } catch (err: any) {
    base.error = err.message;
    return base;
  }
}

/**
 * Post to TextBin.net — Simple paste, no auth
 */
async function postToTextBin(target: DistributionTarget): Promise<PlatformPostResult> {
  const base: PlatformPostResult = {
    platform: "TextBin.net", platformType: "paste", success: false, da: 45, linkType: "dofollow", indexed: false,
  };

  try {
    const content = await generateDistributionContent("TextBin.net", target, "plaintext", 300);

    const res = await distFetch("https://textbin.net/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        title: content.title,
        content: `${content.content}\n\nVisit: ${target.targetUrl}`,
        language: "text",
        expiration: "0", // Never expire
        visibility: "0", // Public
      }).toString(),
    }, "textbin.net");

    if (res.ok || res.status === 302 || res.status === 301) {
      const location = res.headers.get("location");
      if (location) {
        base.success = true;
        base.publishedUrl = location.startsWith("http") ? location : `https://textbin.net${location}`;
      } else {
        // Try to extract URL from response body
        const body = await res.text();
        const urlMatch = body.match(/https?:\/\/textbin\.net\/[a-zA-Z0-9]+/);
        if (urlMatch) {
          base.success = true;
          base.publishedUrl = urlMatch[0];
        } else {
          base.error = "Could not extract paste URL";
        }
      }
    } else {
      base.error = `HTTP ${res.status}`;
    }
    return base;
  } catch (err: any) {
    base.error = err.message;
    return base;
  }
}

/**
 * Post blog comments on WordPress sites found via SerpAPI
 */
async function postBlogComments(
  target: DistributionTarget,
  maxComments: number = 3,
): Promise<PlatformPostResult[]> {
  const results: PlatformPostResult[] = [];
  const serpApiKey = process.env.SERPAPI_KEY_DEV || process.env.SERPAPI_KEY_FREE;

  if (!serpApiKey) {
    results.push({
      platform: "Blog Comments", platformType: "comment", success: false,
      da: 40, linkType: "nofollow", indexed: false, error: "SerpAPI key not configured",
    });
    return results;
  }

  try {
    // Find WordPress blogs in the niche
    const searchQuery = `${target.keyword} blog inurl:wp-json`;
    const serpRes = await distFetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(searchQuery)}&api_key=${serpApiKey}&num=15&gl=th&hl=th`,
      {}, "serpapi.com",
    );
    const serpData = await serpRes.json() as any;
    const blogs = (serpData.organic_results || [])
      .filter((r: any) => r.link && !r.link.includes(target.targetDomain))
      .slice(0, maxComments * 2);

    let posted = 0;
    for (const blog of blogs) {
      if (posted >= maxComments) break;

      try {
        const blogUrl = blog.link.replace(/\/$/, "");
        const blogDomain = new URL(blogUrl).hostname;
        const commentApiUrl = `${new URL(blogUrl).origin}/wp-json/wp/v2/comments`;

        const commentContent = await generateDistributionContent(
          `Blog: ${blogDomain}`, target, "plaintext", 80,
        );

        const commentRes = await distFetch(commentApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            post: extractWpPostId(blogUrl),
            author_name: `${target.keyword.split(" ")[0]} Expert`,
            author_email: `user${Date.now() % 10000}@gmail.com`,
            author_url: target.targetUrl,
            content: commentContent.content.replace(/<[^>]*>/g, "").slice(0, 500),
          }),
        }, blogDomain);

        if (commentRes.status < 400) {
          const data = await commentRes.json() as any;
          results.push({
            platform: `Comment: ${blogDomain}`,
            platformType: "comment",
            success: true,
            publishedUrl: data.link || `${blogUrl}#comment-${data.id || "new"}`,
            da: 40,
            linkType: "nofollow",
            indexed: false,
          });
          posted++;
        }
      } catch {
        // Skip failed blogs
      }

      // Delay between comments
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
    }

    if (results.length === 0) {
      results.push({
        platform: "Blog Comments", platformType: "comment", success: false,
        da: 40, linkType: "nofollow", indexed: false, error: "No open comment APIs found",
      });
    }
  } catch (err: any) {
    results.push({
      platform: "Blog Comments", platformType: "comment", success: false,
      da: 40, linkType: "nofollow", indexed: false, error: err.message,
    });
  }

  return results;
}

function extractWpPostId(url: string): number | undefined {
  const pMatch = url.match(/[?&]p=(\d+)/);
  if (pMatch) return parseInt(pMatch[1]);
  const archiveMatch = url.match(/\/archives\/(\d+)/);
  if (archiveMatch) return parseInt(archiveMatch[1]);
  return undefined;
}

// ═══════════════════════════════════════════════
//  RAPID INDEXING — Force Google to crawl all URLs
// ═══════════════════════════════════════════════

async function indexPublishedUrl(url: string, domain: string, keyword: string): Promise<any[]> {
  try {
    const results = await rapidIndexUrl({
      url,
      domain,
      keywords: [keyword],
      contentType: "web2",
      priority: "high",
    });
    return results;
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════
//  MAIN DISTRIBUTION ENGINE
// ═══════════════════════════════════════════════

/**
 * Distribute content to ALL available platforms
 * This is the main function that orchestrates multi-platform posting
 */
export async function distributeToAllPlatforms(
  target: DistributionTarget,
  options: {
    maxTier1?: number;
    maxComments?: number;
    enableIndexing?: boolean;
    enableTelegram?: boolean;
  } = {},
): Promise<DistributionSession> {
  const {
    maxTier1 = 8,
    maxComments = 3,
    enableIndexing = true,
    enableTelegram = true,
  } = options;

  const session: DistributionSession = {
    id: crypto.randomBytes(8).toString("hex"),
    target,
    startedAt: Date.now(),
    results: [],
    totalPlatforms: 0,
    successCount: 0,
    failCount: 0,
    indexedCount: 0,
    tier1Success: 0,
    tier2Success: 0,
    tier3Pings: 0,
  };

  console.log(`[MultiPlatform] Starting distribution for ${target.targetDomain} — keyword: "${target.keyword}"`);

  // ─── TIER 1: No-Auth Platforms ───
  const tier1Tasks: Array<() => Promise<PlatformPostResult>> = [
    () => postToTelegraph(target, 0),
    () => postToJustPasteIt(target),
    () => postToRentry(target),
    () => postToWriteAs(target),
    () => postToTelegraph(target, 1),  // Mirror 2
    () => postToTelegraph(target, 2),  // Mirror 3
    () => postToPasteEe(target),
    () => postToTextBin(target),
  ];

  // Execute Tier 1 sequentially with delays
  for (let i = 0; i < Math.min(tier1Tasks.length, maxTier1); i++) {
    try {
      const result = await tier1Tasks[i]();
      session.results.push(result);
      session.totalPlatforms++;

      if (result.success) {
        session.tier1Success++;
        console.log(`[MultiPlatform] ✅ ${result.platform}: ${result.publishedUrl}`);

        // Index immediately after successful post
        if (enableIndexing && result.publishedUrl) {
          try {
            const indexResults = await indexPublishedUrl(
              result.publishedUrl,
              result.publishedUrl.replace(/^https?:\/\//, "").split("/")[0],
              target.keyword,
            );
            result.indexed = indexResults.some(r => r.success);
            result.indexResults = indexResults;
            if (result.indexed) session.indexedCount++;
          } catch {
            // Indexing is best-effort
          }
        }

        // Log backlink to DB if projectId exists
        if (target.projectId && result.publishedUrl) {
          try {
            await db.addBacklink(target.projectId, {
              sourceUrl: result.publishedUrl,
              sourceDomain: result.publishedUrl.replace(/^https?:\/\//, "").split("/")[0],
              sourceDA: result.da,
              targetUrl: target.targetUrl,
              anchorText: target.anchorText,
              linkType: result.linkType,
              sourceType: "web2",
              status: "active",
              qualityScore: Math.min(result.da, 85),
              aiNotes: `Multi-platform distribution: ${result.platform}`,
            });
          } catch {
            // DB logging is best-effort
          }
        }
      } else {
        console.log(`[MultiPlatform] ❌ ${result.platform}: ${result.error}`);
      }
    } catch (err: any) {
      console.log(`[MultiPlatform] ❌ Tier 1 task ${i} failed: ${err.message}`);
    }

    // Random delay between platforms (3-7 seconds)
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000));
  }

  // ─── TIER 2: Blog Comments ───
  try {
    const commentResults = await postBlogComments(target, maxComments);
    for (const result of commentResults) {
      session.results.push(result);
      session.totalPlatforms++;
      if (result.success) {
        session.tier2Success++;

        // Index comment URLs too
        if (enableIndexing && result.publishedUrl) {
          try {
            const indexResults = await indexPublishedUrl(
              result.publishedUrl,
              result.publishedUrl.replace(/^https?:\/\//, "").split("/")[0],
              target.keyword,
            );
            result.indexed = indexResults.some(r => r.success);
            if (result.indexed) session.indexedCount++;
          } catch { /* best-effort */ }
        }
      }
    }
  } catch (err: any) {
    console.log(`[MultiPlatform] ❌ Blog comments failed: ${err.message}`);
  }

  // ─── TIER 3: Ping all successful URLs for rapid indexing ───
  const successfulUrls = session.results
    .filter(r => r.success && r.publishedUrl)
    .map(r => r.publishedUrl!);

  if (enableIndexing && successfulUrls.length > 0) {
    try {
      // Ping Google, Bing, etc. for all URLs
      for (const url of successfulUrls) {
        try {
          // Google Ping
          await distFetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(url)}`, {}, "google.com");
          // Bing Ping
          await distFetch(`https://www.bing.com/ping?sitemap=${encodeURIComponent(url)}`, {}, "bing.com");
          session.tier3Pings++;
        } catch { /* best-effort */ }
      }
    } catch { /* best-effort */ }
  }

  // ─── Finalize ───
  session.completedAt = Date.now();
  session.successCount = session.results.filter(r => r.success).length;
  session.failCount = session.results.filter(r => !r.success).length;

  const duration = Math.round((session.completedAt - session.startedAt) / 1000);

  console.log(
    `[MultiPlatform] Session complete: ${session.successCount}/${session.totalPlatforms} platforms ` +
    `(T1:${session.tier1Success}, T2:${session.tier2Success}, indexed:${session.indexedCount}, pings:${session.tier3Pings}) ` +
    `in ${duration}s`,
  );

  // ─── Telegram Notification ───
  if (enableTelegram && session.successCount > 0) {
    try {
      const successUrls = session.results
        .filter(r => r.success && r.publishedUrl)
        .map(r => `• ${r.platform}: ${r.publishedUrl}`)
        .join("\n");

      await sendTelegramNotification({
        type: "success",
        targetUrl: target.targetUrl,
        details: [
          `📡 Multi-Platform Distribution Complete`,
          `Domain: ${target.targetDomain}`,
          `Keyword: "${target.keyword}"`,
          ``,
          `✅ Success: ${session.successCount}/${session.totalPlatforms}`,
          `📊 Tier 1: ${session.tier1Success} | Tier 2: ${session.tier2Success}`,
          `🔍 Indexed: ${session.indexedCount} | Pings: ${session.tier3Pings}`,
          `⏱ Duration: ${duration}s`,
          ``,
          `Published URLs:`,
          successUrls,
        ].join("\n"),
      });
    } catch { /* Telegram is best-effort */ }
  }

  return session;
}

// ═══════════════════════════════════════════════
//  SESSION HISTORY
// ═══════════════════════════════════════════════

const distributionHistory: DistributionSession[] = [];

export function recordSession(session: DistributionSession): void {
  distributionHistory.push(session);
  if (distributionHistory.length > 50) distributionHistory.splice(0, distributionHistory.length - 50);
}

export function getDistributionHistory(): DistributionSession[] {
  return [...distributionHistory].reverse();
}

export function getDistributionStats(): {
  totalSessions: number;
  totalPosts: number;
  totalSuccess: number;
  totalIndexed: number;
  averageSuccessRate: number;
  platformBreakdown: Record<string, { attempts: number; success: number }>;
  lastSessionAt: number | null;
} {
  const platformBreakdown: Record<string, { attempts: number; success: number }> = {};

  let totalPosts = 0;
  let totalSuccess = 0;
  let totalIndexed = 0;

  for (const session of distributionHistory) {
    for (const result of session.results) {
      totalPosts++;
      if (result.success) totalSuccess++;
      if (result.indexed) totalIndexed++;

      if (!platformBreakdown[result.platform]) {
        platformBreakdown[result.platform] = { attempts: 0, success: 0 };
      }
      platformBreakdown[result.platform].attempts++;
      if (result.success) platformBreakdown[result.platform].success++;
    }
  }

  return {
    totalSessions: distributionHistory.length,
    totalPosts,
    totalSuccess,
    totalIndexed,
    averageSuccessRate: totalPosts > 0 ? Math.round((totalSuccess / totalPosts) * 100) : 0,
    platformBreakdown,
    lastSessionAt: distributionHistory.length > 0
      ? distributionHistory[distributionHistory.length - 1].startedAt
      : null,
  };
}

// ═══════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════

export {
  PLATFORMS,
  postToTelegraph,
  postToJustPasteIt,
  postToRentry,
  postToWriteAs,
  postToPasteEe,
  postToTextBin,
  postBlogComments,
  indexPublishedUrl,
};
