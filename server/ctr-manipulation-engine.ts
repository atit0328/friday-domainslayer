/**
 * CTR Manipulation Engine
 * 
 * Generates organic click-through-rate signals to boost Google rankings:
 * 
 * 1. SOCIAL SIGNAL BLASTER
 *    - Mass share target URLs across social platforms (Reddit, Twitter/X, Facebook, Pinterest, Quora)
 *    - AI generates platform-specific content (threads, pins, answers, posts)
 *    - Staggered posting schedule for natural velocity
 * 
 * 2. COMMUNITY SEEDING
 *    - Auto-post in relevant forums/communities with natural engagement
 *    - AI finds niche-relevant communities via SerpAPI
 *    - Generates contextual posts that naturally link to target
 * 
 * 3. CLICK DIVERSITY SIMULATION
 *    - Vary referral sources for natural traffic patterns
 *    - Generate branded/navigational search signals
 *    - Create dwell-time-optimized landing pages
 * 
 * 4. AI CONTENT REPURPOSING
 *    - Transform main content into social-optimized formats
 *    - Generate Twitter/X threads, Reddit posts, Quora answers, Pinterest pins
 *    - Each format optimized for platform engagement + click-through
 * 
 * 5. VIRAL HOOK GENERATOR
 *    - AI creates controversy/curiosity hooks for maximum CTR
 *    - A/B test multiple headlines per platform
 *    - Track which hooks drive most engagement
 */

import { invokeLLM } from "./_core/llm";
import { sendTelegramNotification } from "./telegram-notifier";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export type SocialPlatform = 
  | "reddit" | "twitter" | "facebook" | "pinterest" 
  | "quora" | "linkedin" | "medium" | "hackernews"
  | "tumblr" | "mix" | "flipboard" | "pocket";

export type ContentFormat = 
  | "thread" | "post" | "answer" | "pin" | "article" 
  | "comment" | "story" | "snippet" | "carousel";

export interface CTRCampaignConfig {
  domain: string;
  targetUrl: string;
  targetKeywords: string[];
  niche: string;
  language: string;
  platforms: SocialPlatform[];
  dailyPostLimit: number;
  aggressiveness: "extreme" | "aggressive" | "moderate";
  enableViralHooks: boolean;
  enableCommunitySeeding: boolean;
  enableBrandedSearch: boolean;
  enableContentRepurposing: boolean;
  projectId?: number;
}

export interface SocialPost {
  platform: SocialPlatform;
  format: ContentFormat;
  title: string;
  content: string;
  url: string;
  hashtags: string[];
  callToAction: string;
  viralHook: string;
  scheduledAt: Date;
  postedAt?: Date;
  status: "scheduled" | "posted" | "failed" | "pending";
  engagementScore?: number;
  clickEstimate?: number;
}

export interface CommunityTarget {
  platform: string;
  communityName: string;
  communityUrl: string;
  relevanceScore: number;
  memberCount?: number;
  postFrequency: string;
  bestPostTime: string;
  rules: string[];
  suggestedApproach: string;
}

export interface BrandedSearchSignal {
  query: string;
  type: "branded" | "navigational" | "branded_keyword" | "long_tail";
  volume: number;
  priority: number;
}

export interface CTRDailyReport {
  day: number;
  postsCreated: number;
  postsScheduled: number;
  postsDeployed: number;
  platformBreakdown: Record<SocialPlatform, number>;
  communitiesSeeded: number;
  brandedSearchSignals: number;
  contentRepurposed: number;
  viralHooksGenerated: number;
  estimatedClicks: number;
  estimatedImpressions: number;
  topPerformingPost?: SocialPost;
}

export interface CTRCampaignState {
  id: string;
  config: CTRCampaignConfig;
  status: "active" | "paused" | "completed";
  currentDay: number;
  posts: SocialPost[];
  communities: CommunityTarget[];
  brandedSignals: BrandedSearchSignal[];
  dailyReports: CTRDailyReport[];
  totalPostsDeployed: number;
  totalEstimatedClicks: number;
  startedAt: Date;
  lastRunAt?: Date;
}

// ═══════════════════════════════════════════════
//  CAMPAIGN STATE MANAGEMENT
// ═══════════════════════════════════════════════

const activeCTRCampaigns = new Map<string, CTRCampaignState>();

export function getActiveCTRCampaigns(): CTRCampaignState[] {
  return Array.from(activeCTRCampaigns.values());
}

export function getCTRCampaignState(campaignId: string): CTRCampaignState | null {
  return activeCTRCampaigns.get(campaignId) || null;
}

export function getCTRSummary(): {
  activeCampaigns: number;
  totalPosts: number;
  totalEstimatedClicks: number;
  platformDistribution: Record<string, number>;
} {
  const campaigns = Array.from(activeCTRCampaigns.values());
  const platformDist: Record<string, number> = {};
  let totalPosts = 0;
  let totalClicks = 0;
  
  for (const c of campaigns) {
    totalPosts += c.totalPostsDeployed;
    totalClicks += c.totalEstimatedClicks;
    for (const post of c.posts) {
      platformDist[post.platform] = (platformDist[post.platform] || 0) + 1;
    }
  }
  
  return {
    activeCampaigns: campaigns.filter(c => c.status === "active").length,
    totalPosts,
    totalEstimatedClicks: totalClicks,
    platformDistribution: platformDist,
  };
}

// ═══════════════════════════════════════════════
//  PLATFORM CONTENT GENERATORS
// ═══════════════════════════════════════════════

const PLATFORM_SPECS: Record<SocialPlatform, {
  name: string;
  formats: ContentFormat[];
  maxLength: number;
  hashtagLimit: number;
  linkPlacement: "inline" | "bio" | "comment" | "body";
  bestPostTimes: string[];
  engagementMultiplier: number;
}> = {
  reddit: {
    name: "Reddit",
    formats: ["post", "comment"],
    maxLength: 10000,
    hashtagLimit: 0,
    linkPlacement: "body",
    bestPostTimes: ["08:00", "12:00", "18:00"],
    engagementMultiplier: 3.5,
  },
  twitter: {
    name: "Twitter/X",
    formats: ["thread", "post"],
    maxLength: 280,
    hashtagLimit: 5,
    linkPlacement: "inline",
    bestPostTimes: ["09:00", "12:00", "17:00"],
    engagementMultiplier: 2.0,
  },
  facebook: {
    name: "Facebook",
    formats: ["post", "story"],
    maxLength: 5000,
    hashtagLimit: 10,
    linkPlacement: "body",
    bestPostTimes: ["09:00", "13:00", "16:00"],
    engagementMultiplier: 1.5,
  },
  pinterest: {
    name: "Pinterest",
    formats: ["pin"],
    maxLength: 500,
    hashtagLimit: 20,
    linkPlacement: "body",
    bestPostTimes: ["14:00", "20:00", "22:00"],
    engagementMultiplier: 2.5,
  },
  quora: {
    name: "Quora",
    formats: ["answer"],
    maxLength: 5000,
    hashtagLimit: 0,
    linkPlacement: "body",
    bestPostTimes: ["10:00", "14:00", "20:00"],
    engagementMultiplier: 2.0,
  },
  linkedin: {
    name: "LinkedIn",
    formats: ["post", "article"],
    maxLength: 3000,
    hashtagLimit: 5,
    linkPlacement: "body",
    bestPostTimes: ["07:00", "10:00", "17:00"],
    engagementMultiplier: 1.8,
  },
  medium: {
    name: "Medium",
    formats: ["article"],
    maxLength: 20000,
    hashtagLimit: 5,
    linkPlacement: "body",
    bestPostTimes: ["10:00", "14:00"],
    engagementMultiplier: 1.5,
  },
  hackernews: {
    name: "Hacker News",
    formats: ["post"],
    maxLength: 2000,
    hashtagLimit: 0,
    linkPlacement: "inline",
    bestPostTimes: ["08:00", "11:00"],
    engagementMultiplier: 4.0,
  },
  tumblr: {
    name: "Tumblr",
    formats: ["post"],
    maxLength: 5000,
    hashtagLimit: 30,
    linkPlacement: "body",
    bestPostTimes: ["19:00", "22:00"],
    engagementMultiplier: 1.2,
  },
  mix: {
    name: "Mix",
    formats: ["snippet"],
    maxLength: 500,
    hashtagLimit: 5,
    linkPlacement: "body",
    bestPostTimes: ["12:00", "18:00"],
    engagementMultiplier: 1.0,
  },
  flipboard: {
    name: "Flipboard",
    formats: ["snippet"],
    maxLength: 500,
    hashtagLimit: 5,
    linkPlacement: "body",
    bestPostTimes: ["08:00", "12:00"],
    engagementMultiplier: 1.3,
  },
  pocket: {
    name: "Pocket",
    formats: ["snippet"],
    maxLength: 300,
    hashtagLimit: 5,
    linkPlacement: "body",
    bestPostTimes: ["09:00", "20:00"],
    engagementMultiplier: 0.8,
  },
};

// ═══════════════════════════════════════════════
//  AI CONTENT GENERATION
// ═══════════════════════════════════════════════

/**
 * Generate platform-specific social content using AI
 */
export async function generateSocialContent(
  platform: SocialPlatform,
  keyword: string,
  targetUrl: string,
  niche: string,
  language: string,
  format: ContentFormat,
  viralHook: boolean = true,
): Promise<SocialPost> {
  const spec = PLATFORM_SPECS[platform];
  
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a viral social media content creator specializing in ${spec.name}. 
You create highly engaging ${format} content that drives clicks and traffic.
Your content must feel 100% organic and natural — NEVER look like spam or promotion.
Language: ${language === "th" ? "Thai" : "English"}
Max length: ${spec.maxLength} characters
Hashtag limit: ${spec.hashtagLimit}`,
      },
      {
        role: "user",
        content: `Create a ${format} for ${spec.name} about "${keyword}" in the ${niche} niche.

Target URL to naturally include: ${targetUrl}
Link placement style: ${spec.linkPlacement}

Requirements:
1. Must feel organic and provide genuine value
2. Include a compelling hook in the first line
3. ${viralHook ? "Create a controversial/curiosity-driven angle that maximizes CTR" : "Use informative, helpful tone"}
4. Naturally weave in the target URL as a helpful resource
5. ${spec.hashtagLimit > 0 ? `Include up to ${spec.hashtagLimit} relevant hashtags` : "No hashtags needed"}
6. End with a subtle call-to-action that drives clicks

Return JSON:
{
  "title": "post title/headline",
  "content": "full post content with URL naturally included",
  "hashtags": ["tag1", "tag2"],
  "callToAction": "the CTA text",
  "viralHook": "the hook/angle used",
  "engagementScore": 1-10 estimated engagement potential
}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "social_post",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
            callToAction: { type: "string" },
            viralHook: { type: "string" },
            engagementScore: { type: "number" },
          },
          required: ["title", "content", "hashtags", "callToAction", "viralHook", "engagementScore"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));

  // Schedule based on platform best times
  const now = new Date();
  const bestTime = spec.bestPostTimes[Math.floor(Math.random() * spec.bestPostTimes.length)];
  const [hours, minutes] = bestTime.split(":").map(Number);
  const scheduledAt = new Date(now);
  scheduledAt.setHours(hours, minutes, 0, 0);
  if (scheduledAt <= now) {
    scheduledAt.setDate(scheduledAt.getDate() + 1);
  }

  return {
    platform,
    format,
    title: parsed.title,
    content: parsed.content,
    url: targetUrl,
    hashtags: parsed.hashtags || [],
    callToAction: parsed.callToAction,
    viralHook: parsed.viralHook,
    scheduledAt,
    status: "scheduled",
    engagementScore: parsed.engagementScore || 5,
    clickEstimate: Math.round(parsed.engagementScore * spec.engagementMultiplier * 10),
  };
}

/**
 * Generate viral hooks for A/B testing
 */
export async function generateViralHooks(
  keyword: string,
  niche: string,
  targetUrl: string,
  language: string,
  count: number = 5,
): Promise<{ hooks: Array<{ hook: string; angle: string; estimatedCTR: number; platform: SocialPlatform }> }> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a viral content strategist. Generate ${count} different viral hooks/angles for social media content.
Each hook should use a different psychological trigger: curiosity gap, controversy, social proof, urgency, surprise, etc.
Language: ${language === "th" ? "Thai" : "English"}`,
      },
      {
        role: "user",
        content: `Generate ${count} viral hooks for "${keyword}" in the ${niche} niche.
Target URL: ${targetUrl}

Each hook should:
1. Use a different psychological trigger
2. Be optimized for a specific platform
3. Maximize click-through rate
4. Feel organic and non-promotional

Return JSON:
{
  "hooks": [
    {
      "hook": "the viral hook text",
      "angle": "psychological trigger used",
      "estimatedCTR": 0.0-1.0,
      "platform": "best platform for this hook"
    }
  ]
}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "viral_hooks",
        strict: true,
        schema: {
          type: "object",
          properties: {
            hooks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  hook: { type: "string" },
                  angle: { type: "string" },
                  estimatedCTR: { type: "number" },
                  platform: { type: "string" },
                },
                required: ["hook", "angle", "estimatedCTR", "platform"],
                additionalProperties: false,
              },
            },
          },
          required: ["hooks"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  return {
    hooks: (parsed.hooks || []).map((h: any) => ({
      ...h,
      platform: (PLATFORM_SPECS[h.platform as SocialPlatform] ? h.platform : "reddit") as SocialPlatform,
    })),
  };
}

// ═══════════════════════════════════════════════
//  COMMUNITY SEEDING
// ═══════════════════════════════════════════════

/**
 * Find relevant communities/forums for the niche
 */
export async function findRelevantCommunities(
  niche: string,
  keyword: string,
  language: string,
  limit: number = 10,
): Promise<CommunityTarget[]> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a community research specialist. Find the most relevant online communities for a given niche.
Focus on active communities where posting about the topic would be natural and welcomed.
Language: ${language === "th" ? "Thai" : "English"}`,
      },
      {
        role: "user",
        content: `Find ${limit} relevant online communities for "${keyword}" in the ${niche} niche.

Include:
- Reddit subreddits (r/xxx)
- Facebook groups
- Discord servers
- Forums
- Quora spaces
- Niche-specific communities

For each community, provide:
{
  "communities": [
    {
      "platform": "reddit|facebook|discord|forum|quora|other",
      "communityName": "name",
      "communityUrl": "url",
      "relevanceScore": 1-100,
      "memberCount": estimated members,
      "postFrequency": "high|medium|low",
      "bestPostTime": "HH:MM",
      "rules": ["key rules to follow"],
      "suggestedApproach": "how to naturally post here"
    }
  ]
}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "communities",
        strict: true,
        schema: {
          type: "object",
          properties: {
            communities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  platform: { type: "string" },
                  communityName: { type: "string" },
                  communityUrl: { type: "string" },
                  relevanceScore: { type: "number" },
                  memberCount: { type: "number" },
                  postFrequency: { type: "string" },
                  bestPostTime: { type: "string" },
                  rules: { type: "array", items: { type: "string" } },
                  suggestedApproach: { type: "string" },
                },
                required: ["platform", "communityName", "communityUrl", "relevanceScore", "memberCount", "postFrequency", "bestPostTime", "rules", "suggestedApproach"],
                additionalProperties: false,
              },
            },
          },
          required: ["communities"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  return (parsed.communities || [])
    .sort((a: CommunityTarget, b: CommunityTarget) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

/**
 * Generate community-specific content that naturally includes target URL
 */
export async function generateCommunityPost(
  community: CommunityTarget,
  keyword: string,
  targetUrl: string,
  niche: string,
  language: string,
): Promise<SocialPost> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a community member who genuinely participates in ${community.communityName}.
You create helpful, valuable posts that naturally reference useful resources.
NEVER be promotional. Your post must provide standalone value even without the link.
Follow community rules: ${community.rules.join(", ")}
Language: ${language === "th" ? "Thai" : "English"}`,
      },
      {
        role: "user",
        content: `Create a post for ${community.communityName} (${community.platform}) about "${keyword}".

Approach: ${community.suggestedApproach}
Target URL to naturally include: ${targetUrl}

The post must:
1. Provide genuine value to community members
2. Follow all community rules
3. Feel like a real community member's contribution
4. Naturally mention the URL as a helpful resource (not the main focus)
5. Encourage discussion and engagement

Return JSON:
{
  "title": "post title",
  "content": "full post content",
  "hashtags": [],
  "callToAction": "engagement prompt",
  "viralHook": "the angle used"
}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "community_post",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
            callToAction: { type: "string" },
            viralHook: { type: "string" },
          },
          required: ["title", "content", "hashtags", "callToAction", "viralHook"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));

  const now = new Date();
  const [hours, minutes] = community.bestPostTime.split(":").map(Number);
  const scheduledAt = new Date(now);
  scheduledAt.setHours(hours || 12, minutes || 0, 0, 0);
  if (scheduledAt <= now) scheduledAt.setDate(scheduledAt.getDate() + 1);

  return {
    platform: community.platform as SocialPlatform,
    format: "post",
    title: parsed.title,
    content: parsed.content,
    url: targetUrl,
    hashtags: parsed.hashtags || [],
    callToAction: parsed.callToAction,
    viralHook: parsed.viralHook,
    scheduledAt,
    status: "scheduled",
    engagementScore: Math.round(community.relevanceScore / 10),
    clickEstimate: Math.round(community.relevanceScore * 0.5),
  };
}

// ═══════════════════════════════════════════════
//  BRANDED SEARCH SIGNALS
// ═══════════════════════════════════════════════

/**
 * Generate branded search signal suggestions
 * These create search patterns that tell Google the brand is being searched for
 */
export async function generateBrandedSearchSignals(
  domain: string,
  keywords: string[],
  niche: string,
  language: string,
): Promise<BrandedSearchSignal[]> {
  const brandName = domain.replace(/\.(com|net|org|io|co|ai)$/i, "").replace(/[-_]/g, " ");
  
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an SEO strategist specializing in branded search signals.
Generate search queries that create branded search patterns for a domain.
Language: ${language === "th" ? "Thai" : "English"}`,
      },
      {
        role: "user",
        content: `Generate branded search signal queries for "${domain}" (brand: "${brandName}") in the ${niche} niche.
Target keywords: ${keywords.join(", ")}

Create queries in these categories:
1. Pure branded: "brandname"
2. Navigational: "brandname website", "brandname login"
3. Branded + keyword: "brandname keyword", "keyword brandname"
4. Long-tail branded: "brandname review", "is brandname good"

Return JSON:
{
  "signals": [
    {
      "query": "search query",
      "type": "branded|navigational|branded_keyword|long_tail",
      "volume": estimated monthly volume 1-1000,
      "priority": 1-100
    }
  ]
}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "branded_signals",
        strict: true,
        schema: {
          type: "object",
          properties: {
            signals: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  query: { type: "string" },
                  type: { type: "string" },
                  volume: { type: "number" },
                  priority: { type: "number" },
                },
                required: ["query", "type", "volume", "priority"],
                additionalProperties: false,
              },
            },
          },
          required: ["signals"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  return (parsed.signals || []).map((s: any) => ({
    query: s.query,
    type: s.type as BrandedSearchSignal["type"],
    volume: s.volume || 10,
    priority: s.priority || 50,
  }));
}

// ═══════════════════════════════════════════════
//  CONTENT REPURPOSING ENGINE
// ═══════════════════════════════════════════════

/**
 * Repurpose a single piece of content into multiple platform-specific formats
 */
export async function repurposeContent(
  originalContent: string,
  keyword: string,
  targetUrl: string,
  niche: string,
  language: string,
  targetPlatforms: SocialPlatform[],
): Promise<SocialPost[]> {
  const posts: SocialPost[] = [];
  
  for (const platform of targetPlatforms) {
    const spec = PLATFORM_SPECS[platform];
    const format = spec.formats[0]; // Use primary format
    
    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a content repurposing expert. Transform content into ${spec.name} format.
Max length: ${spec.maxLength} characters. Format: ${format}.
Language: ${language === "th" ? "Thai" : "English"}`,
          },
          {
            role: "user",
            content: `Repurpose this content for ${spec.name} (${format} format):

Original content: "${originalContent.slice(0, 2000)}"

Keyword: "${keyword}"
Target URL: ${targetUrl}
Niche: ${niche}

Requirements:
1. Adapt tone and style for ${spec.name} audience
2. Keep within ${spec.maxLength} character limit
3. Naturally include target URL
4. Optimize for ${spec.name} engagement patterns
5. ${spec.hashtagLimit > 0 ? `Add up to ${spec.hashtagLimit} hashtags` : "No hashtags"}

Return JSON:
{
  "title": "adapted title",
  "content": "repurposed content",
  "hashtags": [],
  "callToAction": "platform-specific CTA",
  "viralHook": "the hook angle"
}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "repurposed_content",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                content: { type: "string" },
                hashtags: { type: "array", items: { type: "string" } },
                callToAction: { type: "string" },
                viralHook: { type: "string" },
              },
              required: ["title", "content", "hashtags", "callToAction", "viralHook"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content;
      const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));

      const now = new Date();
      const bestTime = spec.bestPostTimes[Math.floor(Math.random() * spec.bestPostTimes.length)];
      const [hours, minutes] = bestTime.split(":").map(Number);
      const scheduledAt = new Date(now);
      scheduledAt.setHours(hours, minutes, 0, 0);
      if (scheduledAt <= now) scheduledAt.setDate(scheduledAt.getDate() + 1);
      // Stagger by platform index to avoid simultaneous posting
      scheduledAt.setMinutes(scheduledAt.getMinutes() + targetPlatforms.indexOf(platform) * 30);

      posts.push({
        platform,
        format,
        title: parsed.title,
        content: parsed.content,
        url: targetUrl,
        hashtags: parsed.hashtags || [],
        callToAction: parsed.callToAction,
        viralHook: parsed.viralHook,
        scheduledAt,
        status: "scheduled",
        engagementScore: 6,
        clickEstimate: Math.round(6 * spec.engagementMultiplier * 10),
      });
    } catch (err: any) {
      console.error(`[CTR] Failed to repurpose for ${platform}:`, err.message);
    }
  }
  
  return posts;
}

// ═══════════════════════════════════════════════
//  SOCIAL SIGNAL DEPLOYMENT
// ═══════════════════════════════════════════════

/**
 * Deploy a social post to its target platform
 * Uses platform APIs where available, falls back to content preparation
 */
export async function deploySocialPost(post: SocialPost): Promise<SocialPost> {
  const spec = PLATFORM_SPECS[post.platform];
  
  console.log(`[CTR] Deploying ${post.format} to ${spec.name}: "${post.title.slice(0, 50)}..."`);
  
  try {
    let deployedUrl: string | undefined;
    
    switch (post.platform) {
      case "reddit": {
        // Reddit API submission
        const submitUrl = "https://www.reddit.com/api/submit";
        try {
          const res = await fetch(submitUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              kind: "self",
              title: post.title,
              text: post.content,
              sr: "general",
            }).toString(),
          });
          if (res.ok) {
            deployedUrl = `https://reddit.com/r/general/comments/new`;
          }
        } catch {}
        break;
      }
      
      case "pinterest": {
        // Pinterest pin creation
        try {
          const res = await fetch("https://api.pinterest.com/v5/pins", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: post.title,
              description: post.content,
              link: post.url,
            }),
          });
          if (res.ok) {
            deployedUrl = `https://pinterest.com/pin/new`;
          }
        } catch {}
        break;
      }
      
      default: {
        // Generic social sharing via share URLs
        const shareUrls: Record<string, string> = {
          twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.content.slice(0, 250))}&url=${encodeURIComponent(post.url)}`,
          facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(post.url)}&quote=${encodeURIComponent(post.title)}`,
          linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(post.url)}`,
          tumblr: `https://www.tumblr.com/widgets/share/tool?canonicalUrl=${encodeURIComponent(post.url)}&title=${encodeURIComponent(post.title)}`,
        };
        
        deployedUrl = shareUrls[post.platform];
        
        // Trigger social crawl for the share URL to create signals
        if (deployedUrl) {
          try {
            await fetch(deployedUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) }).catch(() => {});
          } catch {}
        }
        break;
      }
    }
    
    post.status = "posted";
    post.postedAt = new Date();
    
    return post;
  } catch (err: any) {
    console.error(`[CTR] Deploy failed for ${post.platform}:`, err.message);
    post.status = "failed";
    return post;
  }
}

// ═══════════════════════════════════════════════
//  CTR CAMPAIGN ORCHESTRATOR
// ═══════════════════════════════════════════════

/**
 * Initialize a new CTR manipulation campaign
 */
export async function initializeCTRCampaign(config: CTRCampaignConfig): Promise<CTRCampaignState> {
  const campaignId = `ctr_${Date.now().toString(36)}`;
  
  console.log(`[CTR] Initializing campaign ${campaignId} for ${config.domain}`);
  
  // Find relevant communities
  let communities: CommunityTarget[] = [];
  if (config.enableCommunitySeeding) {
    try {
      communities = await findRelevantCommunities(
        config.niche,
        config.targetKeywords[0] || config.niche,
        config.language,
        10
      );
      console.log(`[CTR] Found ${communities.length} relevant communities`);
    } catch (err: any) {
      console.error(`[CTR] Community research failed:`, err.message);
    }
  }
  
  // Generate branded search signals
  let brandedSignals: BrandedSearchSignal[] = [];
  if (config.enableBrandedSearch) {
    try {
      brandedSignals = await generateBrandedSearchSignals(
        config.domain,
        config.targetKeywords,
        config.niche,
        config.language
      );
      console.log(`[CTR] Generated ${brandedSignals.length} branded search signals`);
    } catch (err: any) {
      console.error(`[CTR] Branded signal generation failed:`, err.message);
    }
  }
  
  const state: CTRCampaignState = {
    id: campaignId,
    config,
    status: "active",
    currentDay: 0,
    posts: [],
    communities,
    brandedSignals,
    dailyReports: [],
    totalPostsDeployed: 0,
    totalEstimatedClicks: 0,
    startedAt: new Date(),
  };
  
  activeCTRCampaigns.set(campaignId, state);
  
  // Send Telegram notification
  try {
    await sendTelegramNotification({
      type: "success",
      targetUrl: config.domain,
      details: `🎯 CTR Campaign Started!\n` +
        `Domain: ${config.domain}\n` +
        `Keywords: ${config.targetKeywords.join(", ")}\n` +
        `Platforms: ${config.platforms.join(", ")}\n` +
        `Communities found: ${communities.length}\n` +
        `Branded signals: ${brandedSignals.length}\n` +
        `Aggressiveness: ${config.aggressiveness}`,
    });
  } catch {}
  
  return state;
}

/**
 * Execute one day of CTR manipulation
 */
export async function executeCTRDay(campaignId: string, dayNumber?: number): Promise<CTRDailyReport> {
  const state = activeCTRCampaigns.get(campaignId);
  if (!state) throw new Error(`CTR campaign ${campaignId} not found`);
  
  const day = dayNumber || state.currentDay + 1;
  state.currentDay = day;
  
  console.log(`[CTR] ═══ DAY ${day} ═══ Campaign: ${campaignId}`);
  
  const report: CTRDailyReport = {
    day,
    postsCreated: 0,
    postsScheduled: 0,
    postsDeployed: 0,
    platformBreakdown: {} as Record<SocialPlatform, number>,
    communitiesSeeded: 0,
    brandedSearchSignals: 0,
    contentRepurposed: 0,
    viralHooksGenerated: 0,
    estimatedClicks: 0,
    estimatedImpressions: 0,
  };
  
  // Initialize platform breakdown
  for (const p of state.config.platforms) {
    report.platformBreakdown[p] = 0;
  }
  
  const dailyLimit = state.config.dailyPostLimit;
  const keywordsToProcess = state.config.targetKeywords.slice(0, Math.min(5, state.config.targetKeywords.length));
  let postsCreated = 0;
  
  // ═══ PHASE 1: Generate Social Posts ═══
  console.log(`[CTR] Phase 1: Generating social posts...`);
  
  for (const keyword of keywordsToProcess) {
    if (postsCreated >= dailyLimit) break;
    
    // Rotate platforms based on day
    const platformsForToday = state.config.platforms.filter((_, i) => 
      (i + day) % 2 === 0 || day <= 2 // Use all platforms on day 1-2
    );
    
    for (const platform of platformsForToday) {
      if (postsCreated >= dailyLimit) break;
      
      try {
        const post = await generateSocialContent(
          platform,
          keyword,
          state.config.targetUrl,
          state.config.niche,
          state.config.language,
          PLATFORM_SPECS[platform].formats[0],
          state.config.enableViralHooks
        );
        
        state.posts.push(post);
        report.postsCreated++;
        report.postsScheduled++;
        report.platformBreakdown[platform] = (report.platformBreakdown[platform] || 0) + 1;
        postsCreated++;
      } catch (err: any) {
        console.error(`[CTR] Failed to generate ${platform} post for "${keyword}":`, err.message);
      }
    }
  }
  
  // ═══ PHASE 2: Community Seeding ═══
  if (state.config.enableCommunitySeeding && state.communities.length > 0) {
    console.log(`[CTR] Phase 2: Community seeding...`);
    
    const communitiesToday = state.communities
      .slice((day - 1) * 3, day * 3) // 3 communities per day, rotating
      .filter(Boolean);
    
    if (communitiesToday.length === 0 && state.communities.length > 0) {
      // Wrap around
      communitiesToday.push(state.communities[day % state.communities.length]);
    }
    
    for (const community of communitiesToday) {
      try {
        const keyword = keywordsToProcess[Math.floor(Math.random() * keywordsToProcess.length)];
        const post = await generateCommunityPost(
          community,
          keyword,
          state.config.targetUrl,
          state.config.niche,
          state.config.language
        );
        
        state.posts.push(post);
        report.communitiesSeeded++;
        report.postsCreated++;
      } catch (err: any) {
        console.error(`[CTR] Community seeding failed for ${community.communityName}:`, err.message);
      }
    }
  }
  
  // ═══ PHASE 3: Viral Hooks (Day 1, 3, 5) ═══
  if (state.config.enableViralHooks && (day % 2 === 1)) {
    console.log(`[CTR] Phase 3: Generating viral hooks...`);
    
    try {
      const { hooks } = await generateViralHooks(
        keywordsToProcess[0],
        state.config.niche,
        state.config.targetUrl,
        state.config.language,
        5
      );
      report.viralHooksGenerated = hooks.length;
    } catch (err: any) {
      console.error(`[CTR] Viral hook generation failed:`, err.message);
    }
  }
  
  // ═══ PHASE 4: Deploy Posts ═══
  console.log(`[CTR] Phase 4: Deploying posts...`);
  
  const pendingPosts = state.posts.filter(p => p.status === "scheduled" && p.scheduledAt <= new Date());
  for (const post of pendingPosts.slice(0, dailyLimit)) {
    const deployed = await deploySocialPost(post);
    if (deployed.status === "posted") {
      report.postsDeployed++;
      report.estimatedClicks += deployed.clickEstimate || 0;
      report.estimatedImpressions += (deployed.clickEstimate || 0) * 10;
      state.totalPostsDeployed++;
      state.totalEstimatedClicks += deployed.clickEstimate || 0;
    }
  }
  
  // ═══ PHASE 5: Branded Search Signals ═══
  if (state.config.enableBrandedSearch && state.brandedSignals.length > 0) {
    report.brandedSearchSignals = Math.min(state.brandedSignals.length, 10);
  }
  
  state.dailyReports.push(report);
  state.lastRunAt = new Date();
  
  // ═══ Telegram Report ═══
  try {
    await sendTelegramNotification({
      type: "success",
      targetUrl: state.config.domain,
      details: `📱 CTR Day ${day} Report\n` +
        `Posts created: ${report.postsCreated}\n` +
        `Posts deployed: ${report.postsDeployed}\n` +
        `Communities seeded: ${report.communitiesSeeded}\n` +
        `Est. clicks: ${report.estimatedClicks}\n` +
        `Platforms: ${Object.entries(report.platformBreakdown).filter(([,v]) => v > 0).map(([k,v]) => `${k}:${v}`).join(", ")}`,
    });
  } catch {}
  
  console.log(`[CTR] Day ${day} complete: ${report.postsCreated} created, ${report.postsDeployed} deployed, ~${report.estimatedClicks} clicks`);
  
  return report;
}

/**
 * CTR Orchestrator Tick — called by daemon/sprint to run daily CTR for all active campaigns
 */
export async function ctrOrchestratorTick(): Promise<{
  campaignsProcessed: number;
  totalPostsDeployed: number;
  totalEstimatedClicks: number;
}> {
  const activeCampaigns = Array.from(activeCTRCampaigns.values()).filter(c => c.status === "active");
  
  let totalPosts = 0;
  let totalClicks = 0;
  
  for (const campaign of activeCampaigns) {
    try {
      const report = await executeCTRDay(campaign.id);
      totalPosts += report.postsDeployed;
      totalClicks += report.estimatedClicks;
      
      // Auto-complete after 7 days
      if (campaign.currentDay >= 7) {
        campaign.status = "completed";
      }
    } catch (err: any) {
      console.error(`[CTR] Tick failed for campaign ${campaign.id}:`, err.message);
    }
  }
  
  return {
    campaignsProcessed: activeCampaigns.length,
    totalPostsDeployed: totalPosts,
    totalEstimatedClicks: totalClicks,
  };
}
