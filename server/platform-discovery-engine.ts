/**
 * Auto Platform Discovery & Registration Engine
 * ═══════════════════════════════════════════════════════════════
 * 
 * Fully Agentic AI system that:
 * 1. DISCOVERS new Web 2.0/blog/forum/paste/wiki/social platforms autonomously
 * 2. AUTO-REGISTERS accounts on discovered platforms
 * 3. AUTO-POSTS content with backlinks
 * 4. LEARNS which platforms index fastest, give best DA, and highest success rate
 * 5. Continuously expands the platform database without human intervention
 * 
 * The AI doesn't wait for us to add platforms — it finds them itself.
 * ═══════════════════════════════════════════════════════════════
 */

import { invokeLLM } from "./_core/llm";
import { fetchWithPoolProxy } from "./proxy-pool";
import { generateDistributionContent, type DistributionTarget, type PlatformPostResult } from "./multi-platform-distributor";
import { sendTelegramNotification } from "./telegram-notifier";
import crypto from "crypto";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export type PlatformType = "paste" | "blog" | "forum" | "wiki" | "social" | "web2" | "directory" | "comment" | "profile" | "document" | "bookmark" | "qa" | "microblog";
export type PostMethod = "api" | "form_submit" | "rest_api" | "graphql" | "scrape_post";
export type AuthMethod = "none" | "api_key" | "email_register" | "oauth" | "cookie_session";

export interface DiscoveredPlatform {
  id: string;
  name: string;
  url: string;
  type: PlatformType;
  estimatedDA: number;
  linkType: "dofollow" | "nofollow" | "ugc" | "sponsored" | "mixed";
  postMethod: PostMethod;
  authMethod: AuthMethod;
  /** Whether content allows HTML/markdown with links */
  supportsLinks: boolean;
  /** Whether the platform is currently accessible */
  isAlive: boolean;
  /** API endpoint or form action URL */
  postEndpoint?: string;
  /** Content format: html, markdown, plaintext */
  contentFormat: "html" | "markdown" | "plaintext";
  /** Max content length (chars) */
  maxContentLength: number;
  /** Whether we have successfully posted before */
  verified: boolean;
  /** Success rate from past attempts (0-100) */
  successRate: number;
  /** Average time to Google index (hours) */
  avgIndexTime?: number;
  /** Number of successful posts */
  totalPosts: number;
  /** Number of indexed posts */
  indexedPosts: number;
  /** Last successful post timestamp */
  lastPostedAt?: number;
  /** Last health check timestamp */
  lastCheckedAt?: number;
  /** Registration credentials if auto-registered */
  credentials?: {
    email?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    token?: string;
  };
  /** Custom headers needed for posting */
  customHeaders?: Record<string, string>;
  /** Notes from AI about this platform */
  aiNotes?: string;
  /** Priority score (calculated from DA, success rate, index time) */
  priorityScore: number;
  /** When this platform was discovered */
  discoveredAt: number;
  /** Source of discovery */
  discoverySource: "seed" | "ai_discovery" | "competitor_analysis" | "manual";
}

export interface PlatformDiscoveryResult {
  discovered: DiscoveredPlatform[];
  totalScanned: number;
  newPlatforms: number;
  alreadyKnown: number;
  errors: string[];
}

export interface PlatformPostAttempt {
  platformId: string;
  platformName: string;
  success: boolean;
  publishedUrl?: string;
  error?: string;
  responseCode?: number;
  duration: number;
  timestamp: number;
}

export interface AutoPostSession {
  id: string;
  target: DistributionTarget;
  startedAt: number;
  completedAt?: number;
  attempts: PlatformPostAttempt[];
  totalPlatforms: number;
  successCount: number;
  failCount: number;
  newPlatformsUsed: number;
}

// ═══════════════════════════════════════════════
//  MASTER PLATFORM DATABASE (50+ seed platforms)
// ═══════════════════════════════════════════════

const SEED_PLATFORMS: Omit<DiscoveredPlatform, "id" | "verified" | "successRate" | "totalPosts" | "indexedPosts" | "priorityScore" | "discoveredAt">[] = [
  // ─── PASTE SITES (No Auth, Instant Post) ───
  {
    name: "Telegraph", url: "https://telegra.ph", type: "paste",
    estimatedDA: 82, linkType: "dofollow", postMethod: "api",
    authMethod: "none", supportsLinks: true, isAlive: true,
    postEndpoint: "https://api.telegra.ph/createPage",
    contentFormat: "html", maxContentLength: 65536,
    discoverySource: "seed", aiNotes: "High DA, instant indexing, dofollow links in content",
  },
  {
    name: "JustPaste.it", url: "https://justpaste.it", type: "paste",
    estimatedDA: 72, linkType: "dofollow", postMethod: "api",
    authMethod: "none", supportsLinks: true, isAlive: true,
    postEndpoint: "https://justpaste.it/api/v1/paste",
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Good DA, supports HTML with links",
  },
  {
    name: "Rentry.co", url: "https://rentry.co", type: "paste",
    estimatedDA: 60, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "none", supportsLinks: true, isAlive: true,
    postEndpoint: "https://rentry.co/api/new",
    contentFormat: "markdown", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Markdown support, dofollow, no auth needed",
  },
  {
    name: "Write.as", url: "https://write.as", type: "blog",
    estimatedDA: 65, linkType: "dofollow", postMethod: "api",
    authMethod: "none", supportsLinks: true, isAlive: true,
    postEndpoint: "https://write.as/api/posts",
    contentFormat: "markdown", maxContentLength: 50000,
    discoverySource: "seed", aiNotes: "Anonymous blogging, dofollow links",
  },
  {
    name: "Paste.ee", url: "https://paste.ee", type: "paste",
    estimatedDA: 55, linkType: "dofollow", postMethod: "api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://api.paste.ee/v1/pastes",
    contentFormat: "plaintext", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "API key available for free, dofollow",
  },
  {
    name: "Pastebin.com", url: "https://pastebin.com", type: "paste",
    estimatedDA: 90, linkType: "nofollow", postMethod: "api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://pastebin.com/api/api_post.php",
    contentFormat: "plaintext", maxContentLength: 512000,
    discoverySource: "seed", aiNotes: "Very high DA, nofollow but massive authority signal",
  },
  {
    name: "Dpaste.org", url: "https://dpaste.org", type: "paste",
    estimatedDA: 52, linkType: "nofollow", postMethod: "api",
    authMethod: "none", supportsLinks: true, isAlive: true,
    postEndpoint: "https://dpaste.org/api/",
    contentFormat: "plaintext", maxContentLength: 250000,
    discoverySource: "seed", aiNotes: "No auth, instant post, moderate DA",
  },
  // ─── BLOG PLATFORMS (Auth Required, High DA) ───
  {
    name: "Medium", url: "https://medium.com", type: "blog",
    estimatedDA: 96, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://api.medium.com/v1/users/{authorId}/posts",
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Highest DA blog platform, requires Integration Token",
  },
  {
    name: "Blogger/Blogspot", url: "https://www.blogger.com", type: "blog",
    estimatedDA: 99, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "oauth", supportsLinks: true, isAlive: true,
    postEndpoint: "https://www.googleapis.com/blogger/v3/blogs/{blogId}/posts",
    contentFormat: "html", maxContentLength: 500000,
    discoverySource: "seed", aiNotes: "DA 99, Google-owned, dofollow links in posts",
  },
  {
    name: "WordPress.com", url: "https://wordpress.com", type: "blog",
    estimatedDA: 99, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "oauth", supportsLinks: true, isAlive: true,
    postEndpoint: "https://public-api.wordpress.com/rest/v1.1/sites/{siteId}/posts/new",
    contentFormat: "html", maxContentLength: 500000,
    discoverySource: "seed", aiNotes: "DA 99, requires OAuth, dofollow in content",
  },
  {
    name: "Tumblr", url: "https://www.tumblr.com", type: "microblog",
    estimatedDA: 98, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "oauth", supportsLinks: true, isAlive: true,
    postEndpoint: "https://api.tumblr.com/v2/blog/{blog}/posts",
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Very high DA, supports HTML posts with links",
  },
  {
    name: "LiveJournal", url: "https://www.livejournal.com", type: "blog",
    estimatedDA: 93, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "cookie_session", supportsLinks: true, isAlive: true,
    postEndpoint: "https://www.livejournal.com/interface/xmlrpc",
    contentFormat: "html", maxContentLength: 65536,
    discoverySource: "seed", aiNotes: "Old but high DA, XML-RPC API available",
  },
  // ─── DOCUMENT/SLIDE SHARING (High DA, Auth Required) ───
  {
    name: "Scribd", url: "https://www.scribd.com", type: "document",
    estimatedDA: 94, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 500000,
    discoverySource: "seed", aiNotes: "Very high DA, document sharing with embedded links",
  },
  {
    name: "SlideShare", url: "https://www.slideshare.net", type: "document",
    estimatedDA: 95, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "LinkedIn-owned, very high DA, profile links dofollow",
  },
  {
    name: "Issuu", url: "https://issuu.com", type: "document",
    estimatedDA: 94, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://api.issuu.com/v2/drafts",
    contentFormat: "html", maxContentLength: 500000,
    discoverySource: "seed", aiNotes: "Digital publishing, very high DA",
  },
  // ─── SOCIAL BOOKMARKING (Medium-High DA) ───
  {
    name: "Mix.com", url: "https://mix.com", type: "bookmark",
    estimatedDA: 90, linkType: "nofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "StumbleUpon successor, high DA bookmark site",
  },
  {
    name: "Diigo", url: "https://www.diigo.com", type: "bookmark",
    estimatedDA: 88, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://secure.diigo.com/api/v2/bookmarks",
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "Social bookmarking, dofollow profile links",
  },
  {
    name: "Folkd", url: "https://www.folkd.com", type: "bookmark",
    estimatedDA: 60, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 2000,
    discoverySource: "seed", aiNotes: "Social bookmarking, dofollow links",
  },
  // ─── WIKI PLATFORMS ───
  {
    name: "Fandom/Wikia", url: "https://www.fandom.com", type: "wiki",
    estimatedDA: 96, linkType: "nofollow", postMethod: "rest_api",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Very high DA wiki, can create fan wikis with links",
  },
  {
    name: "Miraheze", url: "https://miraheze.org", type: "wiki",
    estimatedDA: 65, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Free wiki hosting, dofollow external links",
  },
  // ─── Q&A PLATFORMS ───
  {
    name: "Quora", url: "https://www.quora.com", type: "qa",
    estimatedDA: 93, linkType: "nofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 50000,
    discoverySource: "seed", aiNotes: "Very high DA, nofollow but massive traffic potential",
  },
  // ─── FORUM PLATFORMS ───
  {
    name: "Reddit", url: "https://www.reddit.com", type: "forum",
    estimatedDA: 99, linkType: "nofollow", postMethod: "rest_api",
    authMethod: "oauth", supportsLinks: true, isAlive: true,
    postEndpoint: "https://oauth.reddit.com/api/submit",
    contentFormat: "markdown", maxContentLength: 40000,
    discoverySource: "seed", aiNotes: "DA 99, nofollow but huge authority signal + traffic",
  },
  // ─── PROFILE/BIO LINK PLATFORMS ───
  {
    name: "About.me", url: "https://about.me", type: "profile",
    estimatedDA: 93, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "Profile page with dofollow website link",
  },
  {
    name: "Gravatar", url: "https://gravatar.com", type: "profile",
    estimatedDA: 96, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 2000,
    discoverySource: "seed", aiNotes: "WordPress.com owned, dofollow profile links",
  },
  {
    name: "Linktree", url: "https://linktr.ee", type: "profile",
    estimatedDA: 92, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 1000,
    discoverySource: "seed", aiNotes: "Bio link page, dofollow links to your sites",
  },
  // ─── CODE/DEV PLATFORMS ───
  {
    name: "GitHub Gist", url: "https://gist.github.com", type: "paste",
    estimatedDA: 98, linkType: "nofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://api.github.com/gists",
    contentFormat: "markdown", maxContentLength: 1000000,
    discoverySource: "seed", aiNotes: "DA 98, nofollow but massive authority, API easy",
  },
  {
    name: "GitLab Snippets", url: "https://gitlab.com", type: "paste",
    estimatedDA: 92, linkType: "nofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://gitlab.com/api/v4/snippets",
    contentFormat: "markdown", maxContentLength: 1000000,
    discoverySource: "seed", aiNotes: "High DA, API-based snippet creation",
  },
  {
    name: "Bitbucket Snippets", url: "https://bitbucket.org", type: "paste",
    estimatedDA: 93, linkType: "nofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://api.bitbucket.org/2.0/snippets",
    contentFormat: "markdown", maxContentLength: 500000,
    discoverySource: "seed", aiNotes: "Atlassian-owned, high DA snippets",
  },
  // ─── ADDITIONAL PASTE SITES ───
  {
    name: "Hastebin", url: "https://hastebin.com", type: "paste",
    estimatedDA: 48, linkType: "nofollow", postMethod: "api",
    authMethod: "none", supportsLinks: true, isAlive: true,
    postEndpoint: "https://hastebin.com/documents",
    contentFormat: "plaintext", maxContentLength: 400000,
    discoverySource: "seed", aiNotes: "Simple API, no auth, instant post",
  },
  {
    name: "Paste.mozilla.org", url: "https://paste.mozilla.org", type: "paste",
    estimatedDA: 78, linkType: "nofollow", postMethod: "form_submit",
    authMethod: "none", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 250000,
    discoverySource: "seed", aiNotes: "Mozilla-hosted, decent DA",
  },
  {
    name: "ControlC", url: "https://controlc.com", type: "paste",
    estimatedDA: 50, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "none", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 500000,
    discoverySource: "seed", aiNotes: "No auth, dofollow, easy form submit",
  },
  {
    name: "Pastelink.net", url: "https://pastelink.net", type: "paste",
    estimatedDA: 45, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "none", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "HTML paste with dofollow links, no auth",
  },
  {
    name: "Paste2.org", url: "https://paste2.org", type: "paste",
    estimatedDA: 42, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "none", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Simple paste, dofollow",
  },
  // ─── ARTICLE/CONTENT PLATFORMS ───
  {
    name: "HubPages", url: "https://hubpages.com", type: "blog",
    estimatedDA: 90, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Article platform, dofollow after approval, very high DA",
  },
  {
    name: "Vocal.media", url: "https://vocal.media", type: "blog",
    estimatedDA: 82, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 50000,
    discoverySource: "seed", aiNotes: "Content platform, dofollow links in articles",
  },
  {
    name: "Substack", url: "https://substack.com", type: "blog",
    estimatedDA: 93, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Newsletter platform, very high DA, dofollow",
  },
  {
    name: "Notion.site", url: "https://notion.site", type: "document",
    estimatedDA: 91, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://api.notion.com/v1/pages",
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Public Notion pages, very high DA, API available",
  },
  {
    name: "Tistory", url: "https://www.tistory.com", type: "blog",
    estimatedDA: 85, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "oauth", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Korean blog platform, high DA, dofollow",
  },
  // ─── COMMUNITY/FORUM PLATFORMS ───
  {
    name: "Dev.to", url: "https://dev.to", type: "blog",
    estimatedDA: 90, linkType: "nofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://dev.to/api/articles",
    contentFormat: "markdown", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Dev community, high DA, API key from settings",
  },
  {
    name: "Hashnode", url: "https://hashnode.com", type: "blog",
    estimatedDA: 85, linkType: "dofollow", postMethod: "graphql",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://gql.hashnode.com",
    contentFormat: "markdown", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Dev blog platform, dofollow, GraphQL API",
  },
  // ─── ADDITIONAL WEB 2.0 ───
  {
    name: "Wix.com", url: "https://www.wix.com", type: "web2",
    estimatedDA: 94, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 500000,
    discoverySource: "seed", aiNotes: "Free website builder, very high DA",
  },
  {
    name: "Weebly", url: "https://www.weebly.com", type: "web2",
    estimatedDA: 93, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 500000,
    discoverySource: "seed", aiNotes: "Free website builder, dofollow links",
  },
  {
    name: "Sites.google.com", url: "https://sites.google.com", type: "web2",
    estimatedDA: 99, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "oauth", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 500000,
    discoverySource: "seed", aiNotes: "Google-owned, DA 99, free site builder",
  },
  {
    name: "Strikingly", url: "https://www.strikingly.com", type: "web2",
    estimatedDA: 88, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Free one-page website builder",
  },
  // ─── IMAGE/MEDIA PLATFORMS ───
  {
    name: "Flickr", url: "https://www.flickr.com", type: "social",
    estimatedDA: 95, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "oauth", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "Photo sharing, dofollow profile/description links",
  },
  {
    name: "500px", url: "https://500px.com", type: "social",
    estimatedDA: 90, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "Photo community, dofollow profile links",
  },
  // ─── PODCAST/AUDIO PLATFORMS ───
  {
    name: "Anchor.fm (Spotify)", url: "https://anchor.fm", type: "social",
    estimatedDA: 91, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 10000,
    discoverySource: "seed", aiNotes: "Podcast platform, dofollow show notes links",
  },
  // ─── BUSINESS LISTING ───
  {
    name: "Crunchbase", url: "https://www.crunchbase.com", type: "profile",
    estimatedDA: 91, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "Business profile, dofollow website link",
  },
  {
    name: "AngelList", url: "https://angel.co", type: "profile",
    estimatedDA: 92, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "Startup profile, dofollow links",
  },
  // ─── EXPANDED PLATFORMS (Batch 2) ───
  // ─── HIGH DA PASTE/SNIPPET SITES ───
  {
    name: "0bin.net", url: "https://0bin.net", type: "paste",
    estimatedDA: 48, linkType: "dofollow", postMethod: "api",
    authMethod: "none", supportsLinks: true, isAlive: true,
    postEndpoint: "https://0bin.net/paste/create",
    contentFormat: "plaintext", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Encrypted paste, no auth, zero-knowledge",
  },
  {
    name: "PrivateBin", url: "https://privatebin.net", type: "paste",
    estimatedDA: 52, linkType: "dofollow", postMethod: "api",
    authMethod: "none", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Open-source paste, many public instances",
  },
  {
    name: "Ideone", url: "https://ideone.com", type: "paste",
    estimatedDA: 72, linkType: "nofollow", postMethod: "api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://ideone.com/api/1/service",
    contentFormat: "plaintext", maxContentLength: 65536,
    discoverySource: "seed", aiNotes: "Code execution + paste, SOAP API, decent DA",
  },
  {
    name: "CodePen", url: "https://codepen.io", type: "paste",
    estimatedDA: 91, linkType: "nofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Very high DA, code playground with description links",
  },
  {
    name: "JSFiddle", url: "https://jsfiddle.net", type: "paste",
    estimatedDA: 88, linkType: "nofollow", postMethod: "api",
    authMethod: "none", supportsLinks: true, isAlive: true,
    postEndpoint: "https://jsfiddle.net/api/post/library/pure.html",
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "High DA code playground, no auth for anonymous fiddles",
  },
  {
    name: "Replit", url: "https://replit.com", type: "paste",
    estimatedDA: 85, linkType: "nofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    contentFormat: "markdown", maxContentLength: 500000,
    discoverySource: "seed", aiNotes: "Cloud IDE, high DA, README files with links",
  },
  {
    name: "Glitch", url: "https://glitch.com", type: "paste",
    estimatedDA: 82, linkType: "nofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "markdown", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Web app platform, project descriptions with links",
  },
  // ─── ADDITIONAL BLOG/ARTICLE PLATFORMS ───
  {
    name: "Ghost.io", url: "https://ghost.io", type: "blog",
    estimatedDA: 83, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://{site}.ghost.io/ghost/api/v3/content/posts/",
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Modern blogging, dofollow, Content API available",
  },
  {
    name: "Penzu", url: "https://penzu.com", type: "blog",
    estimatedDA: 72, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 50000,
    discoverySource: "seed", aiNotes: "Online journal, public entries with dofollow links",
  },
  {
    name: "Edublogs", url: "https://edublogs.org", type: "blog",
    estimatedDA: 86, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    postEndpoint: "https://{site}.edublogs.org/wp-json/wp/v2/posts",
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Education blog platform, WordPress-based, high DA",
  },
  {
    name: "Over-blog", url: "https://www.over-blog.com", type: "blog",
    estimatedDA: 80, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "European blog platform, dofollow links",
  },
  {
    name: "Tealfeed", url: "https://tealfeed.com", type: "blog",
    estimatedDA: 59, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 50000,
    discoverySource: "seed", aiNotes: "Content aggregator, dofollow article links",
  },
  {
    name: "HackerNoon", url: "https://hackernoon.com", type: "blog",
    estimatedDA: 91, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "markdown", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Tech blog, very high DA, dofollow after editorial review",
  },
  {
    name: "Steemit", url: "https://steemit.com", type: "blog",
    estimatedDA: 88, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "markdown", maxContentLength: 65536,
    discoverySource: "seed", aiNotes: "Blockchain blog, dofollow, high DA, markdown",
  },
  {
    name: "Hive.blog", url: "https://hive.blog", type: "blog",
    estimatedDA: 75, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "markdown", maxContentLength: 65536,
    discoverySource: "seed", aiNotes: "Steemit fork, blockchain blog, dofollow",
  },
  {
    name: "Wattpad", url: "https://www.wattpad.com", type: "blog",
    estimatedDA: 91, linkType: "nofollow", postMethod: "rest_api",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Story platform, very high DA, profile links",
  },
  // ─── ADDITIONAL SOCIAL BOOKMARKING ───
  {
    name: "Instapaper", url: "https://www.instapaper.com", type: "bookmark",
    estimatedDA: 90, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://www.instapaper.com/api/1/bookmarks/add",
    contentFormat: "plaintext", maxContentLength: 2000,
    discoverySource: "seed", aiNotes: "Read-later service, dofollow public folders",
  },
  {
    name: "Pocket (GetPocket)", url: "https://getpocket.com", type: "bookmark",
    estimatedDA: 92, linkType: "nofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://getpocket.com/v3/add",
    contentFormat: "plaintext", maxContentLength: 2000,
    discoverySource: "seed", aiNotes: "Mozilla-owned, very high DA, public recommendations",
  },
  {
    name: "Flipboard", url: "https://flipboard.com", type: "bookmark",
    estimatedDA: 91, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "Magazine-style content curation, dofollow",
  },
  {
    name: "Scoop.it", url: "https://www.scoop.it", type: "bookmark",
    estimatedDA: 89, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 10000,
    discoverySource: "seed", aiNotes: "Content curation, dofollow, API available",
  },
  {
    name: "List.ly", url: "https://list.ly", type: "bookmark",
    estimatedDA: 78, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 10000,
    discoverySource: "seed", aiNotes: "List curation, dofollow embedded links",
  },
  {
    name: "Paper.li", url: "https://paper.li", type: "bookmark",
    estimatedDA: 85, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "Auto-curated newspaper, dofollow source links",
  },
  // ─── ADDITIONAL PROFILE/BIO PLATFORMS ───
  {
    name: "Muckrack", url: "https://muckrack.com", type: "profile",
    estimatedDA: 92, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "Journalist profile, dofollow website links",
  },
  {
    name: "Behance", url: "https://www.behance.net", type: "profile",
    estimatedDA: 93, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 50000,
    discoverySource: "seed", aiNotes: "Adobe-owned portfolio, dofollow project links",
  },
  {
    name: "Dribbble", url: "https://dribbble.com", type: "profile",
    estimatedDA: 92, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 10000,
    discoverySource: "seed", aiNotes: "Design portfolio, dofollow profile links",
  },
  {
    name: "DeviantArt", url: "https://www.deviantart.com", type: "social",
    estimatedDA: 91, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "oauth", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 65536,
    discoverySource: "seed", aiNotes: "Art community, dofollow journal/description links",
  },
  // ─── ADDITIONAL WEB 2.0 BUILDERS ───
  {
    name: "Jimdo", url: "https://www.jimdo.com", type: "web2",
    estimatedDA: 89, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "German website builder, high DA, free tier",
  },
  {
    name: "Site123", url: "https://www.site123.com", type: "web2",
    estimatedDA: 82, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Easy website builder, dofollow, free subdomain",
  },
  {
    name: "Webnode", url: "https://www.webnode.com", type: "web2",
    estimatedDA: 81, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Multilingual website builder, dofollow",
  },
  {
    name: "Yola", url: "https://www.yola.com", type: "web2",
    estimatedDA: 87, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Free website builder, high DA",
  },
  {
    name: "Bravenet", url: "https://www.bravenet.com", type: "web2",
    estimatedDA: 78, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Old-school web hosting, dofollow",
  },
  {
    name: "Doodlekit", url: "https://www.doodlekit.com", type: "web2",
    estimatedDA: 68, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Simple website builder, dofollow",
  },
  {
    name: "PortfolioBox", url: "https://www.portfoliobox.net", type: "web2",
    estimatedDA: 72, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Portfolio builder, dofollow external links",
  },
  {
    name: "Zoho Sites", url: "https://www.zoho.com/sites/", type: "web2",
    estimatedDA: 86, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Zoho ecosystem, high DA, free tier",
  },
  // ─── ADDITIONAL Q&A / FORUM PLATFORMS ───
  {
    name: "Stack Overflow", url: "https://stackoverflow.com", type: "qa",
    estimatedDA: 97, linkType: "nofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "markdown", maxContentLength: 30000,
    discoverySource: "seed", aiNotes: "Highest DA Q&A, nofollow but massive authority signal",
  },
  {
    name: "Answers.com", url: "https://www.answers.com", type: "qa",
    estimatedDA: 88, linkType: "nofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 10000,
    discoverySource: "seed", aiNotes: "Q&A platform, high DA, answer with links",
  },
  // ─── ADDITIONAL DOCUMENT SHARING ───
  {
    name: "Calameo", url: "https://www.calameo.com", type: "document",
    estimatedDA: 88, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 500000,
    discoverySource: "seed", aiNotes: "Digital publishing, dofollow description links",
  },
  {
    name: "Edocr", url: "https://www.edocr.com", type: "document",
    estimatedDA: 65, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Document sharing, dofollow links in description",
  },
  {
    name: "Slideshare (Scribd)", url: "https://www.slideshare.net", type: "document",
    estimatedDA: 95, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Presentation sharing, very high DA",
  },
  // ─── ADDITIONAL SOCIAL/COMMUNITY ───
  {
    name: "Pinterest", url: "https://www.pinterest.com", type: "social",
    estimatedDA: 94, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "oauth", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "Very high DA, dofollow pin source links",
  },
  {
    name: "Evernote", url: "https://www.evernote.com", type: "document",
    estimatedDA: 92, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "oauth", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Public shared notes, very high DA",
  },
  {
    name: "Google Docs (Public)", url: "https://docs.google.com", type: "document",
    estimatedDA: 96, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "oauth", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 500000,
    discoverySource: "seed", aiNotes: "DA 96, public shared docs with links",
  },
  {
    name: "Dropbox Paper", url: "https://paper.dropbox.com", type: "document",
    estimatedDA: 94, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "oauth", supportsLinks: true, isAlive: true,
    contentFormat: "markdown", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Dropbox-owned, very high DA, public papers",
  },
  {
    name: "Smore", url: "https://www.smore.com", type: "web2",
    estimatedDA: 76, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 50000,
    discoverySource: "seed", aiNotes: "Newsletter/flyer creator, dofollow links",
  },
  {
    name: "Typepad", url: "https://www.typepad.com", type: "blog",
    estimatedDA: 88, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Classic blog platform, high DA, Atom API",
  },
  {
    name: "Hatena Blog", url: "https://hatenablog.com", type: "blog",
    estimatedDA: 89, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    contentFormat: "markdown", maxContentLength: 100000,
    discoverySource: "seed", aiNotes: "Japanese blog platform, high DA, Atom API",
  },
  {
    name: "Archive.org", url: "https://archive.org", type: "document",
    estimatedDA: 98, linkType: "dofollow", postMethod: "rest_api",
    authMethod: "api_key", supportsLinks: true, isAlive: true,
    postEndpoint: "https://s3.us.archive.org",
    contentFormat: "html", maxContentLength: 1000000,
    discoverySource: "seed", aiNotes: "DA 98, Internet Archive, dofollow metadata links",
  },
  {
    name: "Tripod (Lycos)", url: "https://www.tripod.lycos.com", type: "web2",
    estimatedDA: 91, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Classic web hosting, very high DA, free pages",
  },
  {
    name: "Pen.io", url: "https://pen.io", type: "blog",
    estimatedDA: 68, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "none", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 50000,
    discoverySource: "seed", aiNotes: "Anonymous blog posts, no registration, dofollow",
  },
  {
    name: "Joomla.com", url: "https://www.joomla.com", type: "web2",
    estimatedDA: 78, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Free Joomla hosting, dofollow content links",
  },
  {
    name: "Webs.com", url: "https://www.webs.com", type: "web2",
    estimatedDA: 82, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "html", maxContentLength: 200000,
    discoverySource: "seed", aiNotes: "Free website builder, dofollow, decent DA",
  },
  // ─── ADDITIONAL DIRECTORY/LISTING SITES ───
  {
    name: "Yelp", url: "https://www.yelp.com", type: "directory",
    estimatedDA: 94, linkType: "nofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "Business listing, very high DA, website link in profile",
  },
  {
    name: "Foursquare", url: "https://foursquare.com", type: "directory",
    estimatedDA: 90, linkType: "nofollow", postMethod: "rest_api",
    authMethod: "oauth", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 2000,
    discoverySource: "seed", aiNotes: "Location-based, high DA, business website links",
  },
  {
    name: "Hotfrog", url: "https://www.hotfrog.com", type: "directory",
    estimatedDA: 65, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "Business directory, dofollow website links",
  },
  {
    name: "Spoke.com", url: "https://www.spoke.com", type: "directory",
    estimatedDA: 62, linkType: "dofollow", postMethod: "form_submit",
    authMethod: "email_register", supportsLinks: true, isAlive: true,
    contentFormat: "plaintext", maxContentLength: 5000,
    discoverySource: "seed", aiNotes: "Business directory, dofollow company links",
  },
];

// ═══════════════════════════════════════════════
//  IN-MEMORY PLATFORM DATABASE
// ═══════════════════════════════════════════════

const platformDatabase: Map<string, DiscoveredPlatform> = new Map();
const postHistory: PlatformPostAttempt[] = [];
const discoveryLog: Array<{ timestamp: number; source: string; found: number; new: number }> = [];

function initializeSeedPlatforms(): void {
  if (platformDatabase.size > 0) return;
  for (const seed of SEED_PLATFORMS) {
    const id = crypto.randomUUID();
    platformDatabase.set(id, {
      ...seed,
      id,
      verified: seed.authMethod === "none",
      successRate: seed.authMethod === "none" ? 70 : 0,
      totalPosts: 0,
      indexedPosts: 0,
      priorityScore: calculatePriorityScore(seed.estimatedDA, 0, seed.authMethod === "none" ? 70 : 0, undefined),
      discoveredAt: Date.now(),
    });
  }
  console.log(`[PlatformDiscovery] Initialized ${platformDatabase.size} seed platforms`);
}

function calculatePriorityScore(da: number, indexedPosts: number, successRate: number, avgIndexTime?: number): number {
  let score = 0;
  // DA contributes 40% (normalized to 0-40)
  score += (da / 100) * 40;
  // Success rate contributes 30% (normalized to 0-30)
  score += (successRate / 100) * 30;
  // Index speed contributes 20% (faster = higher score)
  if (avgIndexTime !== undefined && avgIndexTime > 0) {
    const indexScore = Math.max(0, 20 - (avgIndexTime / 24) * 5); // 0-20, faster = higher
    score += indexScore;
  } else {
    score += 10; // unknown = neutral
  }
  // Proven track record contributes 10%
  const provenScore = Math.min(10, indexedPosts * 0.5);
  score += provenScore;
  return Math.round(score * 10) / 10;
}

// ═══════════════════════════════════════════════
//  AI PLATFORM DISCOVERY ENGINE
// ═══════════════════════════════════════════════

/**
 * AI autonomously discovers new platforms for backlink building.
 * Uses LLM to find platforms based on:
 * - Web 2.0 sites that allow free content posting
 * - Paste sites with no auth
 * - Forums/communities that allow links
 * - Wiki platforms
 * - Document sharing sites
 * - Social bookmarking sites
 */
export async function discoverNewPlatforms(
  focusType?: PlatformType,
  niche: string = "gambling",
): Promise<PlatformDiscoveryResult> {
  initializeSeedPlatforms();

  const existingNames = Array.from(platformDatabase.values()).map(p => p.name.toLowerCase());
  const existingUrls = Array.from(platformDatabase.values()).map(p => p.url.toLowerCase());

  const typeFilter = focusType ? `Focus specifically on "${focusType}" type platforms.` : "Search across ALL platform types.";

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert SEO link builder who knows EVERY free platform on the internet where you can post content with backlinks. You specialize in finding obscure, lesser-known platforms that most people don't know about.

Your job is to discover NEW platforms that are NOT in our existing database. Focus on platforms that:
1. Allow posting content with embedded links (dofollow preferred)
2. Have decent Domain Authority (DA 30+)
3. Don't require payment
4. Are still active and accessible in 2026
5. Can be automated (API, form submission, or simple posting)

Platform types to search: paste, blog, forum, wiki, social, web2, directory, comment, profile, document, bookmark, qa, microblog

${typeFilter}

IMPORTANT: These platforms are ALREADY in our database, DO NOT suggest them:
${existingNames.join(", ")}`,
      },
      {
        role: "user",
        content: `Find 10-15 NEW platforms for building backlinks in the ${niche} niche. For each platform, provide:
1. Name
2. URL
3. Type (paste/blog/forum/wiki/social/web2/directory/comment/profile/document/bookmark/qa/microblog)
4. Estimated DA (be realistic)
5. Link type (dofollow/nofollow/ugc)
6. Auth method (none/api_key/email_register/oauth)
7. Content format (html/markdown/plaintext)
8. Post method (api/form_submit/rest_api)
9. Max content length (chars)
10. Why this platform is good for backlinks

Return as JSON array. Be specific and accurate — only suggest platforms that ACTUALLY exist and work.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "discovered_platforms",
        strict: true,
        schema: {
          type: "object",
          properties: {
            platforms: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  url: { type: "string" },
                  type: { type: "string" },
                  estimatedDA: { type: "number" },
                  linkType: { type: "string" },
                  authMethod: { type: "string" },
                  contentFormat: { type: "string" },
                  postMethod: { type: "string" },
                  maxContentLength: { type: "number" },
                  reason: { type: "string" },
                },
                required: ["name", "url", "type", "estimatedDA", "linkType", "authMethod", "contentFormat", "postMethod", "maxContentLength", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["platforms"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    return { discovered: [], totalScanned: 0, newPlatforms: 0, alreadyKnown: 0, errors: ["LLM returned empty response"] };
  }

  let parsed: { platforms: any[] };
  try {
    parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  } catch {
    return { discovered: [], totalScanned: 0, newPlatforms: 0, alreadyKnown: 0, errors: ["Failed to parse LLM response"] };
  }

  const discovered: DiscoveredPlatform[] = [];
  let alreadyKnown = 0;
  const errors: string[] = [];

  for (const p of parsed.platforms) {
    // Check if already known
    if (existingNames.includes(p.name.toLowerCase()) || existingUrls.some(u => p.url.toLowerCase().includes(u.replace("https://", "").replace("http://", "")))) {
      alreadyKnown++;
      continue;
    }

    const validTypes: PlatformType[] = ["paste", "blog", "forum", "wiki", "social", "web2", "directory", "comment", "profile", "document", "bookmark", "qa", "microblog"];
    const type = validTypes.includes(p.type as PlatformType) ? (p.type as PlatformType) : "web2";

    const validLinkTypes = ["dofollow", "nofollow", "ugc", "sponsored", "mixed"] as const;
    const linkType = validLinkTypes.includes(p.linkType) ? p.linkType as typeof validLinkTypes[number] : "nofollow";

    const validAuthMethods: AuthMethod[] = ["none", "api_key", "email_register", "oauth", "cookie_session"];
    const authMethod = validAuthMethods.includes(p.authMethod as AuthMethod) ? (p.authMethod as AuthMethod) : "email_register";

    const validFormats = ["html", "markdown", "plaintext"] as const;
    const contentFormat = validFormats.includes(p.contentFormat) ? p.contentFormat as typeof validFormats[number] : "plaintext";

    const validPostMethods: PostMethod[] = ["api", "form_submit", "rest_api", "graphql", "scrape_post"];
    const postMethod = validPostMethods.includes(p.postMethod as PostMethod) ? (p.postMethod as PostMethod) : "form_submit";

    const id = crypto.randomUUID();
    const platform: DiscoveredPlatform = {
      id,
      name: p.name,
      url: p.url,
      type,
      estimatedDA: Math.min(100, Math.max(1, p.estimatedDA || 30)),
      linkType,
      postMethod,
      authMethod,
      supportsLinks: true,
      isAlive: true,
      contentFormat,
      maxContentLength: p.maxContentLength || 50000,
      verified: false,
      successRate: 0,
      totalPosts: 0,
      indexedPosts: 0,
      priorityScore: calculatePriorityScore(p.estimatedDA || 30, 0, 0, undefined),
      discoveredAt: Date.now(),
      discoverySource: "ai_discovery",
      aiNotes: p.reason,
    };

    platformDatabase.set(id, platform);
    discovered.push(platform);
  }

  discoveryLog.push({
    timestamp: Date.now(),
    source: focusType || "all",
    found: parsed.platforms.length,
    new: discovered.length,
  });

  console.log(`[PlatformDiscovery] Discovered ${discovered.length} new platforms (${alreadyKnown} already known)`);

  return {
    discovered,
    totalScanned: parsed.platforms.length,
    newPlatforms: discovered.length,
    alreadyKnown,
    errors,
  };
}

// ═══════════════════════════════════════════════
//  COMPETITOR BACKLINK ANALYSIS (find where competitors post)
// ═══════════════════════════════════════════════

/**
 * Analyze competitor's backlink profile to discover platforms they use
 */
export async function discoverFromCompetitor(competitorDomain: string): Promise<PlatformDiscoveryResult> {
  initializeSeedPlatforms();

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert SEO analyst. Given a competitor domain, identify the Web 2.0 platforms, paste sites, blogs, forums, and other platforms where they likely have backlinks. Focus on platforms that can be used for our own backlink building.`,
      },
      {
        role: "user",
        content: `Analyze the backlink profile of ${competitorDomain} and identify platforms where they likely have backlinks. For each platform found, provide the same structured data as a platform discovery. Focus on platforms we can also use for our own backlink building.

Return as JSON with a "platforms" array, each having: name, url, type, estimatedDA, linkType, authMethod, contentFormat, postMethod, maxContentLength, reason.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "competitor_platforms",
        strict: true,
        schema: {
          type: "object",
          properties: {
            platforms: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  url: { type: "string" },
                  type: { type: "string" },
                  estimatedDA: { type: "number" },
                  linkType: { type: "string" },
                  authMethod: { type: "string" },
                  contentFormat: { type: "string" },
                  postMethod: { type: "string" },
                  maxContentLength: { type: "number" },
                  reason: { type: "string" },
                },
                required: ["name", "url", "type", "estimatedDA", "linkType", "authMethod", "contentFormat", "postMethod", "maxContentLength", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["platforms"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    return { discovered: [], totalScanned: 0, newPlatforms: 0, alreadyKnown: 0, errors: ["LLM returned empty"] };
  }

  let parsed: { platforms: any[] };
  try {
    parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  } catch {
    return { discovered: [], totalScanned: 0, newPlatforms: 0, alreadyKnown: 0, errors: ["Parse error"] };
  }

  const existingNames = Array.from(platformDatabase.values()).map(p => p.name.toLowerCase());
  const discovered: DiscoveredPlatform[] = [];
  let alreadyKnown = 0;

  for (const p of parsed.platforms) {
    if (existingNames.includes(p.name.toLowerCase())) {
      alreadyKnown++;
      continue;
    }
    const id = crypto.randomUUID();
    const platform: DiscoveredPlatform = {
      id, name: p.name, url: p.url,
      type: (p.type as PlatformType) || "web2",
      estimatedDA: p.estimatedDA || 30,
      linkType: p.linkType || "nofollow",
      postMethod: (p.postMethod as PostMethod) || "form_submit",
      authMethod: (p.authMethod as AuthMethod) || "email_register",
      supportsLinks: true, isAlive: true,
      contentFormat: p.contentFormat || "plaintext",
      maxContentLength: p.maxContentLength || 50000,
      verified: false, successRate: 0, totalPosts: 0, indexedPosts: 0,
      priorityScore: calculatePriorityScore(p.estimatedDA || 30, 0, 0, undefined),
      discoveredAt: Date.now(), discoverySource: "competitor_analysis",
      aiNotes: `Found from competitor ${competitorDomain}: ${p.reason}`,
    };
    platformDatabase.set(id, platform);
    discovered.push(platform);
  }

  discoveryLog.push({ timestamp: Date.now(), source: `competitor:${competitorDomain}`, found: parsed.platforms.length, new: discovered.length });

  return { discovered, totalScanned: parsed.platforms.length, newPlatforms: discovered.length, alreadyKnown, errors: [] };
}

// ═══════════════════════════════════════════════
//  AUTO-POST TO DISCOVERED PLATFORMS
// ═══════════════════════════════════════════════

/**
 * Auto-post content to the best available platforms
 * Prioritizes by: DA, success rate, index speed
 */
export async function autoPostToDiscoveredPlatforms(
  target: DistributionTarget,
  maxPlatforms: number = 10,
  minDA: number = 30,
): Promise<AutoPostSession> {
  initializeSeedPlatforms();

  const sessionId = crypto.randomUUID();
  const session: AutoPostSession = {
    id: sessionId,
    target,
    startedAt: Date.now(),
    attempts: [],
    totalPlatforms: 0,
    successCount: 0,
    failCount: 0,
    newPlatformsUsed: 0,
  };

  // Get platforms sorted by priority score, filter by minDA and no-auth (for auto-posting)
  const availablePlatforms = Array.from(platformDatabase.values())
    .filter(p => p.isAlive && p.estimatedDA >= minDA && p.authMethod === "none" && p.supportsLinks)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, maxPlatforms);

  session.totalPlatforms = availablePlatforms.length;

  for (const platform of availablePlatforms) {
    const startTime = Date.now();
    const attempt: PlatformPostAttempt = {
      platformId: platform.id,
      platformName: platform.name,
      success: false,
      duration: 0,
      timestamp: Date.now(),
    };

    try {
      const result = await postToPlatform(platform, target);
      attempt.success = result.success;
      attempt.publishedUrl = result.publishedUrl;
      attempt.error = result.error;
      attempt.responseCode = result.success ? 200 : 500;

      if (result.success) {
        session.successCount++;
        platform.totalPosts++;
        platform.lastPostedAt = Date.now();
        // Update success rate
        const totalAttempts = postHistory.filter(h => h.platformId === platform.id).length + 1;
        const successAttempts = postHistory.filter(h => h.platformId === platform.id && h.success).length + 1;
        platform.successRate = Math.round((successAttempts / totalAttempts) * 100);
      } else {
        session.failCount++;
      }

      // Recalculate priority score
      platform.priorityScore = calculatePriorityScore(platform.estimatedDA, platform.indexedPosts, platform.successRate, platform.avgIndexTime);
    } catch (err: any) {
      attempt.error = err.message;
      session.failCount++;
    }

    attempt.duration = Date.now() - startTime;
    session.attempts.push(attempt);
    postHistory.push(attempt);
  }

  session.completedAt = Date.now();

  // Notify via Telegram
  const successUrls = session.attempts.filter(a => a.success && a.publishedUrl).map(a => `• ${a.platformName}: ${a.publishedUrl}`);
  if (successUrls.length > 0) {
    await sendTelegramNotification({
      type: "success",
      targetUrl: target.targetUrl,
      details: `🌐 Platform Discovery Auto-Post\nTarget: ${target.targetDomain}\nKeyword: "${target.keyword}"\n✅ Success: ${session.successCount}/${session.totalPlatforms}\n\nPublished URLs:\n${successUrls.join("\n")}`,
      deployedUrls: session.attempts.filter(a => a.success && a.publishedUrl).map(a => a.publishedUrl!),
      keywords: [target.keyword],
    }).catch(() => {});
  }

  return session;
}

/**
 * Post content to a specific discovered platform
 */
async function postToPlatform(platform: DiscoveredPlatform, target: DistributionTarget): Promise<PlatformPostResult> {
  const validPlatformTypes = ["web2", "paste", "social", "directory", "comment", "forum", "wiki"] as const;
  const mappedType = validPlatformTypes.includes(platform.type as any) ? (platform.type as typeof validPlatformTypes[number]) : "web2";
  const base: PlatformPostResult = {
    platform: platform.name,
    platformType: mappedType,
    success: false,
    da: platform.estimatedDA,
    linkType: platform.linkType === "dofollow" ? "dofollow" : "nofollow",
    indexed: false,
  };

  // Generate content appropriate for the platform
  const content = await generateDistributionContent(
    platform.name,
    target,
    platform.contentFormat,
    Math.min(platform.maxContentLength, 2000),
  );

  // Route to appropriate posting method based on platform
  const lowerName = platform.name.toLowerCase();

  if (lowerName.includes("telegraph")) {
    return await postViaTelegraphAPI(platform, target, content);
  } else if (lowerName.includes("rentry")) {
    return await postViaRentryAPI(platform, target, content);
  } else if (lowerName.includes("write.as")) {
    return await postViaWriteAsAPI(platform, target, content);
  } else if (lowerName.includes("hastebin") || lowerName.includes("haste")) {
    return await postViaHastebinAPI(platform, target, content);
  } else if (lowerName.includes("dpaste")) {
    return await postViaDpasteAPI(platform, target, content);
  } else if (lowerName.includes("controlc")) {
    return await postViaControlC(platform, target, content);
  } else if (lowerName.includes("pastelink")) {
    return await postViaPastelink(platform, target, content);
  } else if (platform.postEndpoint && platform.authMethod === "none") {
    return await postViaGenericAPI(platform, target, content);
  }

  base.error = `No posting handler for ${platform.name} — needs implementation or auth`;
  return base;
}

// ═══════════════════════════════════════════════
//  PLATFORM-SPECIFIC POSTING IMPLEMENTATIONS
// ═══════════════════════════════════════════════

async function postViaTelegraphAPI(platform: DiscoveredPlatform, target: DistributionTarget, content: any): Promise<PlatformPostResult> {
  const base: PlatformPostResult = { platform: platform.name, platformType: "paste", success: false, da: platform.estimatedDA, linkType: "dofollow", indexed: false };
  try {
    const htmlContent = `<p>${content.content}</p><p>อ่านเพิ่มเติม: <a href="${target.targetUrl}">${target.anchorText}</a></p>`;
    const nodeContent = [{ tag: "p", children: [htmlContent] }];

    const params = new URLSearchParams({
      access_token: "auto",
      title: content.title,
      author_name: "SEO Expert",
      content: JSON.stringify(nodeContent),
      return_content: "false",
    });

    const { response } = await fetchWithPoolProxy("https://api.telegra.ph/createPage", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }, { timeout: 15000, fallbackDirect: true });

    const data = await response.json() as any;
    if (data.ok && data.result?.url) {
      base.success = true;
      base.publishedUrl = data.result.url;
    } else {
      base.error = data.error || "Telegraph API error";
    }
  } catch (err: any) {
    base.error = err.message;
  }
  return base;
}

async function postViaRentryAPI(platform: DiscoveredPlatform, target: DistributionTarget, content: any): Promise<PlatformPostResult> {
  const base: PlatformPostResult = { platform: platform.name, platformType: "paste", success: false, da: platform.estimatedDA, linkType: "dofollow", indexed: false };
  try {
    const slug = `${target.keyword.replace(/\s+/g, "-").toLowerCase()}-${crypto.randomBytes(3).toString("hex")}`;
    const mdContent = `# ${content.title}\n\n${content.content}\n\n[${target.anchorText}](${target.targetUrl})`;

    const { response } = await fetchWithPoolProxy("https://rentry.co/api/new", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Referer": "https://rentry.co" },
      body: new URLSearchParams({ edit_code: crypto.randomBytes(4).toString("hex"), text: mdContent }).toString(),
    }, { timeout: 15000, fallbackDirect: true });

    const data = await response.json() as any;
    if (data.status === "200" && data.url) {
      base.success = true;
      base.publishedUrl = data.url;
    } else {
      base.error = data.content || "Rentry API error";
    }
  } catch (err: any) {
    base.error = err.message;
  }
  return base;
}

async function postViaWriteAsAPI(platform: DiscoveredPlatform, target: DistributionTarget, content: any): Promise<PlatformPostResult> {
  const base: PlatformPostResult = { platform: platform.name, platformType: "web2", success: false, da: platform.estimatedDA, linkType: "dofollow", indexed: false };
  try {
    const mdContent = `# ${content.title}\n\n${content.content}\n\n[${target.anchorText}](${target.targetUrl})`;

    const { response } = await fetchWithPoolProxy("https://write.as/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: mdContent, title: content.title }),
    }, { timeout: 15000, fallbackDirect: true });

    const data = await response.json() as any;
    if (data.data?.id) {
      base.success = true;
      base.publishedUrl = `https://write.as/${data.data.id}`;
    } else {
      base.error = data.error_msg || "Write.as API error";
    }
  } catch (err: any) {
    base.error = err.message;
  }
  return base;
}

async function postViaHastebinAPI(platform: DiscoveredPlatform, target: DistributionTarget, content: any): Promise<PlatformPostResult> {
  const base: PlatformPostResult = { platform: platform.name, platformType: "paste", success: false, da: platform.estimatedDA, linkType: "nofollow", indexed: false };
  try {
    const textContent = `${content.title}\n\n${content.content}\n\nVisit: ${target.targetUrl}`;

    const { response } = await fetchWithPoolProxy(platform.postEndpoint || "https://hastebin.com/documents", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: textContent,
    }, { timeout: 15000, fallbackDirect: true });

    const data = await response.json() as any;
    if (data.key) {
      base.success = true;
      base.publishedUrl = `https://hastebin.com/${data.key}`;
    } else {
      base.error = "Hastebin API error";
    }
  } catch (err: any) {
    base.error = err.message;
  }
  return base;
}

async function postViaDpasteAPI(platform: DiscoveredPlatform, target: DistributionTarget, content: any): Promise<PlatformPostResult> {
  const base: PlatformPostResult = { platform: platform.name, platformType: "paste", success: false, da: platform.estimatedDA, linkType: "nofollow", indexed: false };
  try {
    const textContent = `${content.title}\n\n${content.content}\n\nSource: ${target.targetUrl}`;

    const { response } = await fetchWithPoolProxy("https://dpaste.org/api/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ content: textContent, format: "url", expires: "2592000" }).toString(),
    }, { timeout: 15000, fallbackDirect: true });

    const url = await response.text();
    if (url && url.startsWith("http")) {
      base.success = true;
      base.publishedUrl = url.trim();
    } else {
      base.error = "Dpaste API error";
    }
  } catch (err: any) {
    base.error = err.message;
  }
  return base;
}

async function postViaControlC(platform: DiscoveredPlatform, target: DistributionTarget, content: any): Promise<PlatformPostResult> {
  const base: PlatformPostResult = { platform: platform.name, platformType: "paste", success: false, da: platform.estimatedDA, linkType: "dofollow", indexed: false };
  try {
    const textContent = `${content.title}\n\n${content.content}\n\n${target.anchorText}: ${target.targetUrl}`;

    const { response } = await fetchWithPoolProxy("https://controlc.com/index.php?act=submit", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Referer": "https://controlc.com" },
      body: new URLSearchParams({
        subdomain: "",
        antispam: "1",
        paste_title: content.title,
        input_text: textContent,
        paste_password: "",
        code: "0",
        paste_expire: "N",
      }).toString(),
    }, { timeout: 15000, fallbackDirect: true });

    // ControlC redirects to the paste URL
    if (response.ok || response.status === 302) {
      const redirectUrl = response.headers.get("location");
      if (redirectUrl) {
        base.success = true;
        base.publishedUrl = redirectUrl;
      } else {
        // Try to extract from response body
        const body = await response.text();
        const match = body.match(/controlc\.com\/([a-z0-9]+)/i);
        if (match) {
          base.success = true;
          base.publishedUrl = `https://controlc.com/${match[1]}`;
        } else {
          base.error = "Could not extract paste URL";
        }
      }
    } else {
      base.error = `HTTP ${response.status}`;
    }
  } catch (err: any) {
    base.error = err.message;
  }
  return base;
}

async function postViaPastelink(platform: DiscoveredPlatform, target: DistributionTarget, content: any): Promise<PlatformPostResult> {
  const base: PlatformPostResult = { platform: platform.name, platformType: "paste", success: false, da: platform.estimatedDA, linkType: "dofollow", indexed: false };
  try {
    const htmlContent = `<h1>${content.title}</h1><p>${content.content}</p><p><a href="${target.targetUrl}">${target.anchorText}</a></p>`;

    const { response } = await fetchWithPoolProxy("https://pastelink.net/api/paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: htmlContent, title: content.title }),
    }, { timeout: 15000, fallbackDirect: true });

    if (response.ok) {
      const data = await response.json() as any;
      if (data.url || data.id) {
        base.success = true;
        base.publishedUrl = data.url || `https://pastelink.net/${data.id}`;
      }
    } else {
      base.error = `HTTP ${response.status}`;
    }
  } catch (err: any) {
    base.error = err.message;
  }
  return base;
}

async function postViaGenericAPI(platform: DiscoveredPlatform, target: DistributionTarget, content: any): Promise<PlatformPostResult> {
  const base: PlatformPostResult = { platform: platform.name, platformType: platform.type as any, success: false, da: platform.estimatedDA, linkType: platform.linkType === "dofollow" ? "dofollow" : "nofollow", indexed: false };
  try {
    const textContent = `${content.title}\n\n${content.content}\n\n${target.anchorText}: ${target.targetUrl}`;

    const { response } = await fetchWithPoolProxy(platform.postEndpoint!, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...(platform.customHeaders || {}) },
      body: new URLSearchParams({ content: textContent, title: content.title }).toString(),
    }, { timeout: 15000, fallbackDirect: true });

    if (response.ok) {
      const data = await response.text();
      try {
        const json = JSON.parse(data);
        if (json.url || json.id || json.key) {
          base.success = true;
          base.publishedUrl = json.url || `${platform.url}/${json.id || json.key}`;
        }
      } catch {
        if (data.startsWith("http")) {
          base.success = true;
          base.publishedUrl = data.trim();
        }
      }
    }
    if (!base.success) {
      base.error = `Generic post failed for ${platform.name}`;
    }
  } catch (err: any) {
    base.error = err.message;
  }
  return base;
}

// ═══════════════════════════════════════════════
//  PLATFORM HEALTH CHECK
// ═══════════════════════════════════════════════

/**
 * Check if a platform is still alive and accessible
 */
export async function checkPlatformHealth(platformId: string): Promise<{ alive: boolean; responseTime: number; error?: string }> {
  const platform = platformDatabase.get(platformId);
  if (!platform) return { alive: false, responseTime: 0, error: "Platform not found" };

  const start = Date.now();
  try {
    const { response } = await fetchWithPoolProxy(platform.url, {
      method: "HEAD",
    }, { timeout: 10000, fallbackDirect: true });

    const responseTime = Date.now() - start;
    const alive = response.ok || response.status === 301 || response.status === 302;
    platform.isAlive = alive;
    platform.lastCheckedAt = Date.now();
    return { alive, responseTime };
  } catch (err: any) {
    platform.isAlive = false;
    platform.lastCheckedAt = Date.now();
    return { alive: false, responseTime: Date.now() - start, error: err.message };
  }
}

/**
 * Batch health check all platforms
 */
export async function batchHealthCheck(): Promise<{ total: number; alive: number; dead: number; results: Array<{ name: string; alive: boolean; responseTime: number }> }> {
  initializeSeedPlatforms();
  const platforms = Array.from(platformDatabase.values());
  const results: Array<{ name: string; alive: boolean; responseTime: number }> = [];
  let alive = 0;
  let dead = 0;

  // Check in batches of 5 to avoid overwhelming
  for (let i = 0; i < platforms.length; i += 5) {
    const batch = platforms.slice(i, i + 5);
    const checks = await Promise.allSettled(
      batch.map(async p => {
        const result = await checkPlatformHealth(p.id);
        return { name: p.name, ...result };
      }),
    );

    for (const check of checks) {
      if (check.status === "fulfilled") {
        results.push(check.value);
        if (check.value.alive) alive++;
        else dead++;
      }
    }
  }

  return { total: platforms.length, alive, dead, results };
}

// ═══════════════════════════════════════════════
//  PLATFORM LEARNING SYSTEM
// ═══════════════════════════════════════════════

/**
 * Record that a post was indexed by Google
 */
export function recordIndexed(platformId: string): void {
  const platform = platformDatabase.get(platformId);
  if (!platform) return;
  platform.indexedPosts++;
  // Estimate index time based on when last posted
  if (platform.lastPostedAt) {
    const hoursToIndex = (Date.now() - platform.lastPostedAt) / (1000 * 60 * 60);
    if (platform.avgIndexTime) {
      platform.avgIndexTime = (platform.avgIndexTime + hoursToIndex) / 2;
    } else {
      platform.avgIndexTime = hoursToIndex;
    }
  }
  platform.priorityScore = calculatePriorityScore(platform.estimatedDA, platform.indexedPosts, platform.successRate, platform.avgIndexTime);
}

/**
 * Get platform performance leaderboard
 */
export function getPlatformLeaderboard(): DiscoveredPlatform[] {
  initializeSeedPlatforms();
  return Array.from(platformDatabase.values())
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

/**
 * Get platforms by type
 */
export function getPlatformsByType(type: PlatformType): DiscoveredPlatform[] {
  initializeSeedPlatforms();
  return Array.from(platformDatabase.values())
    .filter(p => p.type === type)
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

/**
 * Get platform stats summary
 */
export function getPlatformStats(): {
  total: number;
  byType: Record<string, number>;
  byAuth: Record<string, number>;
  byLinkType: Record<string, number>;
  avgDA: number;
  totalPosts: number;
  totalIndexed: number;
  topPerformers: Array<{ name: string; da: number; successRate: number; priorityScore: number }>;
  recentDiscoveries: Array<{ name: string; type: string; da: number; discoveredAt: number; source: string }>;
} {
  initializeSeedPlatforms();
  const platforms = Array.from(platformDatabase.values());

  const byType: Record<string, number> = {};
  const byAuth: Record<string, number> = {};
  const byLinkType: Record<string, number> = {};
  let totalDA = 0;
  let totalPosts = 0;
  let totalIndexed = 0;

  for (const p of platforms) {
    byType[p.type] = (byType[p.type] || 0) + 1;
    byAuth[p.authMethod] = (byAuth[p.authMethod] || 0) + 1;
    byLinkType[p.linkType] = (byLinkType[p.linkType] || 0) + 1;
    totalDA += p.estimatedDA;
    totalPosts += p.totalPosts;
    totalIndexed += p.indexedPosts;
  }

  const topPerformers = platforms
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 10)
    .map(p => ({ name: p.name, da: p.estimatedDA, successRate: p.successRate, priorityScore: p.priorityScore }));

  const recentDiscoveries = platforms
    .filter(p => p.discoverySource !== "seed")
    .sort((a, b) => b.discoveredAt - a.discoveredAt)
    .slice(0, 10)
    .map(p => ({ name: p.name, type: p.type, da: p.estimatedDA, discoveredAt: p.discoveredAt, source: p.discoverySource }));

  return {
    total: platforms.length,
    byType,
    byAuth,
    byLinkType,
    avgDA: Math.round(totalDA / (platforms.length || 1)),
    totalPosts,
    totalIndexed,
    topPerformers,
    recentDiscoveries,
  };
}

/**
 * Get all platforms (for listing)
 */
export function getAllPlatforms(): DiscoveredPlatform[] {
  initializeSeedPlatforms();
  return Array.from(platformDatabase.values());
}

/**
 * Get a single platform by ID
 */
export function getPlatformById(id: string): DiscoveredPlatform | undefined {
  return platformDatabase.get(id);
}

/**
 * Get post history
 */
export function getPostHistory(limit: number = 50): PlatformPostAttempt[] {
  return postHistory.slice(-limit);
}

/**
 * Get discovery log
 */
export function getDiscoveryLog(): typeof discoveryLog {
  return discoveryLog;
}

/**
 * Add a platform manually
 */
export function addPlatformManually(data: Partial<DiscoveredPlatform> & { name: string; url: string }): DiscoveredPlatform {
  initializeSeedPlatforms();
  const id = crypto.randomUUID();
  const platform: DiscoveredPlatform = {
    id,
    name: data.name,
    url: data.url,
    type: data.type || "web2",
    estimatedDA: data.estimatedDA || 30,
    linkType: data.linkType || "nofollow",
    postMethod: data.postMethod || "form_submit",
    authMethod: data.authMethod || "email_register",
    supportsLinks: data.supportsLinks ?? true,
    isAlive: true,
    contentFormat: data.contentFormat || "plaintext",
    maxContentLength: data.maxContentLength || 50000,
    verified: false,
    successRate: 0,
    totalPosts: 0,
    indexedPosts: 0,
    priorityScore: calculatePriorityScore(data.estimatedDA || 30, 0, 0, undefined),
    discoveredAt: Date.now(),
    discoverySource: "manual",
    aiNotes: data.aiNotes,
  };
  platformDatabase.set(id, platform);
  return platform;
}
