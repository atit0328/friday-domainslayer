/**
 * Authenticated Web 2.0 Platform Distributors
 * 
 * Posts SEO content to high-DA platforms that REQUIRE authentication:
 *   - Medium (DA 96) — Integration Token → POST /v1/users/{authorId}/posts
 *   - Blogger/Blogspot (DA 99) — Google OAuth → Blogger API v3
 *   - WordPress.com (DA 99) — OAuth2 → WP.com REST API v1.1
 * 
 * These platforms have MUCH higher DA than anonymous paste sites,
 * making them critical for effective link building.
 * 
 * Each platform function:
 *   1. Checks if credentials are configured
 *   2. Generates unique AI content for the platform
 *   3. Posts via the platform's API
 *   4. Returns PlatformPostResult compatible with multi-platform-distributor
 */

import { ENV } from "./_core/env";
import { generateDistributionContent, type DistributionTarget, type PlatformPostResult } from "./multi-platform-distributor";
import { fetchWithPoolProxy } from "./proxy-pool";

// ═══════════════════════════════════════════════
//  HELPER
// ═══════════════════════════════════════════════

async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    const { response } = await fetchWithPoolProxy(url, init, { timeout: 25000, fallbackDirect: true });
    return response;
  } catch {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

// ═══════════════════════════════════════════════
//  MEDIUM — DA 96, dofollow (in-content links)
// ═══════════════════════════════════════════════
// API: POST https://api.medium.com/v1/users/{authorId}/posts
// Auth: Bearer token (Integration Token from Settings → Security)
// Docs: https://github.com/Medium/medium-api-docs

export function isMediumConfigured(): boolean {
  return !!(ENV.mediumApiToken && ENV.mediumAuthorId);
}

export async function postToMedium(target: DistributionTarget): Promise<PlatformPostResult> {
  const base: PlatformPostResult = {
    platform: "Medium", platformType: "web2", success: false, da: 96, linkType: "dofollow", indexed: false,
  };

  if (!isMediumConfigured()) {
    base.error = "Medium API token or author ID not configured";
    return base;
  }

  try {
    const content = await generateDistributionContent("Medium", target, "html", 800);

    // Medium API accepts HTML content with embedded links
    const htmlBody = `
      <h1>${content.title}</h1>
      ${content.content}
      <p>อ่านเพิ่มเติม: <a href="${target.targetUrl}">${target.anchorText}</a></p>
    `.trim();

    const res = await authFetch(`https://api.medium.com/v1/users/${ENV.mediumAuthorId}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ENV.mediumApiToken}`,
        "Accept": "application/json",
      },
      body: JSON.stringify({
        title: content.title,
        contentFormat: "html",
        content: htmlBody,
        tags: generateTags(target.keyword, target.niche),
        publishStatus: "public",
        notifyFollowers: false,
      }),
    });

    if (res.ok || res.status === 201) {
      const data = await res.json() as any;
      const postData = data.data || data;
      if (postData.url) {
        base.success = true;
        base.publishedUrl = postData.url;
      } else if (postData.id) {
        base.success = true;
        base.publishedUrl = `https://medium.com/p/${postData.id}`;
      } else {
        base.error = "No post URL returned";
      }
    } else {
      const text = await res.text().catch(() => "");
      base.error = `HTTP ${res.status}: ${text.slice(0, 200)}`;
    }
    return base;
  } catch (err: any) {
    base.error = err.message;
    return base;
  }
}

// ═══════════════════════════════════════════════
//  BLOGGER / BLOGSPOT — DA 99, dofollow
// ═══════════════════════════════════════════════
// API: POST https://www.googleapis.com/blogger/v3/blogs/{blogId}/posts
// Auth: OAuth2 access token (refreshed from refresh_token)
// Docs: https://developers.google.com/blogger/docs/3.0/reference/posts/insert

export function isBloggerConfigured(): boolean {
  return !!(ENV.bloggerRefreshToken && ENV.bloggerClientId && ENV.bloggerClientSecret && ENV.bloggerBlogId);
}

let bloggerAccessToken: string | null = null;
let bloggerTokenExpiry = 0;

async function refreshBloggerToken(): Promise<string> {
  if (bloggerAccessToken && Date.now() < bloggerTokenExpiry) {
    return bloggerAccessToken;
  }

  const res = await authFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ENV.bloggerClientId,
      client_secret: ENV.bloggerClientSecret,
      refresh_token: ENV.bloggerRefreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Blogger token refresh failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
  }

  const data = await res.json() as any;
  bloggerAccessToken = data.access_token;
  bloggerTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000 - 60000; // 1 min buffer
  return bloggerAccessToken!;
}

export async function postToBlogger(target: DistributionTarget): Promise<PlatformPostResult> {
  const base: PlatformPostResult = {
    platform: "Blogger", platformType: "web2", success: false, da: 99, linkType: "dofollow", indexed: false,
  };

  if (!isBloggerConfigured()) {
    base.error = "Blogger API credentials not configured";
    return base;
  }

  try {
    const accessToken = await refreshBloggerToken();
    const content = await generateDistributionContent("Blogger", target, "html", 700);

    const htmlBody = `
      ${content.content}
      <p>อ่านเพิ่มเติมที่ <a href="${target.targetUrl}" target="_blank">${target.anchorText}</a></p>
    `.trim();

    const res = await authFetch(
      `https://www.googleapis.com/blogger/v3/blogs/${ENV.bloggerBlogId}/posts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          kind: "blogger#post",
          blog: { id: ENV.bloggerBlogId },
          title: content.title,
          content: htmlBody,
          labels: generateTags(target.keyword, target.niche),
        }),
      },
    );

    if (res.ok || res.status === 201) {
      const data = await res.json() as any;
      if (data.url) {
        base.success = true;
        base.publishedUrl = data.url;
      } else if (data.id) {
        base.success = true;
        base.publishedUrl = `https://www.blogger.com/blog/post/edit/${ENV.bloggerBlogId}/${data.id}`;
      } else {
        base.error = "No post URL returned";
      }
    } else {
      const text = await res.text().catch(() => "");
      base.error = `HTTP ${res.status}: ${text.slice(0, 200)}`;
    }
    return base;
  } catch (err: any) {
    base.error = err.message;
    return base;
  }
}

// ═══════════════════════════════════════════════
//  WORDPRESS.COM — DA 99, dofollow
// ═══════════════════════════════════════════════
// API: POST https://public-api.wordpress.com/rest/v1.1/sites/{siteId}/posts/new
// Auth: Bearer token (OAuth2 access token)
// Docs: https://developer.wordpress.com/docs/api/1.1/post/sites/%24site/posts/new/

export function isWpComConfigured(): boolean {
  return !!(ENV.wpComAccessToken && ENV.wpComSiteId);
}

export async function postToWordPressCom(target: DistributionTarget): Promise<PlatformPostResult> {
  const base: PlatformPostResult = {
    platform: "WordPress.com", platformType: "web2", success: false, da: 99, linkType: "dofollow", indexed: false,
  };

  if (!isWpComConfigured()) {
    base.error = "WordPress.com access token or site ID not configured";
    return base;
  }

  try {
    const content = await generateDistributionContent("WordPress.com", target, "html", 800);

    const htmlBody = `
      ${content.content}
      <p>แหล่งข้อมูลเพิ่มเติม: <a href="${target.targetUrl}" target="_blank" rel="dofollow">${target.anchorText}</a></p>
    `.trim();

    const res = await authFetch(
      `https://public-api.wordpress.com/rest/v1.1/sites/${ENV.wpComSiteId}/posts/new`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ENV.wpComAccessToken}`,
        },
        body: JSON.stringify({
          title: content.title,
          content: htmlBody,
          status: "publish",
          tags: generateTags(target.keyword, target.niche).join(","),
          categories: target.niche,
          format: "standard",
        }),
      },
    );

    if (res.ok || res.status === 201) {
      const data = await res.json() as any;
      if (data.URL) {
        base.success = true;
        base.publishedUrl = data.URL;
      } else if (data.short_URL) {
        base.success = true;
        base.publishedUrl = data.short_URL;
      } else if (data.ID) {
        base.success = true;
        base.publishedUrl = `https://${ENV.wpComSiteId}/?p=${data.ID}`;
      } else {
        base.error = "No post URL returned";
      }
    } else {
      const text = await res.text().catch(() => "");
      base.error = `HTTP ${res.status}: ${text.slice(0, 200)}`;
    }
    return base;
  } catch (err: any) {
    base.error = err.message;
    return base;
  }
}

// ═══════════════════════════════════════════════
//  ADDITIONAL NO-AUTH PLATFORMS
// ═══════════════════════════════════════════════

/**
 * Post to Pastebin.com — DA 88, nofollow but massive authority
 * Uses guest posting (no API key needed for public pastes)
 */
export async function postToPastebin(target: DistributionTarget): Promise<PlatformPostResult> {
  const base: PlatformPostResult = {
    platform: "Pastebin.com", platformType: "paste", success: false, da: 88, linkType: "nofollow", indexed: false,
  };

  try {
    const content = await generateDistributionContent("Pastebin", target, "plaintext", 400);

    const body = new URLSearchParams({
      api_dev_key: "0ec2eb25b6166c0c27a394ae118ad829", // Public dev key
      api_option: "paste",
      api_paste_code: `${content.title}\n\n${content.content}\n\nMore info: ${target.targetUrl}`,
      api_paste_name: content.title,
      api_paste_format: "text",
      api_paste_private: "0", // Public
      api_paste_expire_date: "N", // Never expire
    });

    const res = await authFetch("https://pastebin.com/api/api_post.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (res.ok) {
      const text = await res.text();
      if (text.startsWith("https://pastebin.com/")) {
        base.success = true;
        base.publishedUrl = text.trim();
      } else if (text.includes("Bad API request")) {
        base.error = `Pastebin API error: ${text.slice(0, 100)}`;
      } else {
        base.error = `Unexpected response: ${text.slice(0, 100)}`;
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
 * Post to dpaste.org — DA 55, dofollow
 */
export async function postToDpaste(target: DistributionTarget): Promise<PlatformPostResult> {
  const base: PlatformPostResult = {
    platform: "dpaste.org", platformType: "paste", success: false, da: 55, linkType: "dofollow", indexed: false,
  };

  try {
    const content = await generateDistributionContent("dpaste", target, "plaintext", 400);

    const body = new URLSearchParams({
      content: `${content.title}\n\n${content.content}\n\nMore info: ${target.targetUrl}`,
      title: content.title,
      syntax: "text",
      expiry_days: "365",
    });

    const res = await authFetch("https://dpaste.org/api/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (res.ok || res.status === 201) {
      const text = await res.text();
      const urlMatch = text.match(/https?:\/\/dpaste\.org\/[a-zA-Z0-9]+/);
      if (urlMatch) {
        base.success = true;
        base.publishedUrl = urlMatch[0];
      } else if (text.startsWith("http")) {
        base.success = true;
        base.publishedUrl = text.trim();
      } else {
        base.error = "No paste URL returned";
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
 * Post to 0bin / PrivateBin style services — DA 50+
 */
export async function postToPrivateBin(target: DistributionTarget): Promise<PlatformPostResult> {
  const base: PlatformPostResult = {
    platform: "PrivateBin", platformType: "paste", success: false, da: 50, linkType: "dofollow", indexed: false,
  };

  try {
    const content = await generateDistributionContent("PrivateBin", target, "plaintext", 300);
    const pasteContent = `${content.title}\n\n${content.content}\n\nMore info: ${target.targetUrl}`;

    // Try multiple PrivateBin instances
    const instances = [
      "https://paste.centos.org",
      "https://paste.opensuse.org",
    ];

    for (const instance of instances) {
      try {
        const res = await authFetch(`${instance}/`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            data: pasteContent,
            expire: "never",
            formatter: "plaintext",
          }).toString(),
        });

        if (res.ok || res.status === 201) {
          // Try to get redirect URL
          const location = res.headers.get("location");
          if (location) {
            base.success = true;
            base.publishedUrl = location.startsWith("http") ? location : `${instance}${location}`;
            return base;
          }
          const data = await res.json().catch(() => null) as any;
          if (data?.url || data?.id) {
            base.success = true;
            base.publishedUrl = data.url || `${instance}/?${data.id}`;
            return base;
          }
        }
      } catch {
        // Try next instance
      }
    }

    base.error = "All PrivateBin instances failed";
    return base;
  } catch (err: any) {
    base.error = err.message;
    return base;
  }
}

// ═══════════════════════════════════════════════
//  TAG GENERATOR
// ═══════════════════════════════════════════════

function generateTags(keyword: string, niche: string): string[] {
  const tags: string[] = [];

  // Add keyword-based tags
  const words = keyword.split(/\s+/).filter(w => w.length > 2);
  tags.push(...words.slice(0, 3));

  // Add niche-based tags
  const nicheTags: Record<string, string[]> = {
    gambling: ["casino", "gambling", "betting", "slots", "poker"],
    lottery: ["lottery", "lotto", "หวย", "เลขเด็ด"],
    forex: ["forex", "trading", "investment", "crypto"],
    adult: ["entertainment", "lifestyle"],
    seo_services: ["seo", "marketing", "digital", "backlinks"],
    ecommerce: ["shopping", "deals", "products", "reviews"],
  };

  const nicheSpecific = nicheTags[niche] || nicheTags["seo_services"]!;
  tags.push(...nicheSpecific.slice(0, 3));

  // Deduplicate and limit
  return Array.from(new Set(tags)).slice(0, 5);
}

// ═══════════════════════════════════════════════
//  PLATFORM STATUS CHECK
// ═══════════════════════════════════════════════

export interface AuthPlatformStatus {
  platform: string;
  configured: boolean;
  da: number;
  linkType: "dofollow" | "nofollow";
}

export function getAuthPlatformStatuses(): AuthPlatformStatus[] {
  return [
    { platform: "Medium", configured: isMediumConfigured(), da: 96, linkType: "dofollow" },
    { platform: "Blogger", configured: isBloggerConfigured(), da: 99, linkType: "dofollow" },
    { platform: "WordPress.com", configured: isWpComConfigured(), da: 99, linkType: "dofollow" },
    { platform: "Pastebin.com", configured: true, da: 88, linkType: "nofollow" },
    { platform: "dpaste.org", configured: true, da: 55, linkType: "dofollow" },
    { platform: "PrivateBin", configured: true, da: 50, linkType: "dofollow" },
  ];
}

/**
 * Get all authenticated platform post functions that are currently configured
 */
export function getConfiguredAuthPlatforms(): Array<{
  name: string;
  fn: (target: DistributionTarget) => Promise<PlatformPostResult>;
  da: number;
}> {
  const platforms: Array<{
    name: string;
    fn: (target: DistributionTarget) => Promise<PlatformPostResult>;
    da: number;
  }> = [];

  // Always-available platforms (no auth needed)
  platforms.push({ name: "Pastebin.com", fn: postToPastebin, da: 88 });
  platforms.push({ name: "dpaste.org", fn: postToDpaste, da: 55 });
  platforms.push({ name: "PrivateBin", fn: postToPrivateBin, da: 50 });

  // Auth-required platforms (only if configured)
  if (isMediumConfigured()) {
    platforms.push({ name: "Medium", fn: postToMedium, da: 96 });
  }
  if (isBloggerConfigured()) {
    platforms.push({ name: "Blogger", fn: postToBlogger, da: 99 });
  }
  if (isWpComConfigured()) {
    platforms.push({ name: "WordPress.com", fn: postToWordPressCom, da: 99 });
  }

  // Sort by DA descending (highest authority first)
  return platforms.sort((a, b) => b.da - a.da);
}
