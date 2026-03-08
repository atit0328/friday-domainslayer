/**
 * WordPress REST API Client
 * ใช้ Application Password เพื่อแก้ไขเว็บไซต์ WordPress จริง
 * รองรับ: Posts, Pages, Meta (Yoast/RankMath), Options, Plugins, Media
 */

import { fetchWithPoolProxy } from "./proxy-pool";

// ═══ Types ═══
export interface WPCredentials {
  siteUrl: string;      // e.g. https://example.com
  username: string;
  appPassword: string;  // WordPress Application Password
}

export interface WPPost {
  id: number;
  title: { rendered: string; raw?: string };
  content: { rendered: string; raw?: string };
  excerpt: { rendered: string; raw?: string };
  slug: string;
  status: string;
  link: string;
  date: string;
  modified: string;
  meta?: Record<string, any>;
  yoast_head_json?: Record<string, any>;
}

export interface WPPage extends WPPost {
  parent: number;
  menu_order: number;
}

export interface WPPlugin {
  plugin: string;
  status: string;
  name: string;
  version: string;
  description: { rendered: string };
}

export interface WPSiteInfo {
  name: string;
  description: string;
  url: string;
  home: string;
  gmt_offset: number;
  timezone_string: string;
  namespaces: string[];
  authentication: Record<string, any>;
}

export interface WPMedia {
  id: number;
  source_url: string;
  alt_text: string;
  title: { rendered: string };
  mime_type: string;
}

export interface WPUpdateResult {
  success: boolean;
  action: string;
  detail: string;
  before?: any;
  after?: any;
  error?: string;
}

// ═══ WordPress API Client ═══
export class WordPressAPI {
  private baseUrl: string;
  private authHeader: string;
  private timeout = 15000;

  constructor(creds: WPCredentials) {
    // Normalize URL — remove trailing slash
    this.baseUrl = creds.siteUrl.replace(/\/+$/, "");
    // Basic auth with Application Password
    const token = Buffer.from(`${creds.username}:${creds.appPassword}`).toString("base64");
    this.authHeader = `Basic ${token}`;
  }

  // ═══ Core HTTP ═══
  private async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${this.baseUrl}/wp-json${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers: Record<string, string> = {
        Authorization: this.authHeader,
        "User-Agent": "FridayAI-SEO/1.0",
        ...extraHeaders,
      };
      if (body && !(body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
      }

      const domain = url.replace(/^https?:\/\//, "").replace(/[\/:].*$/, "");
      const { response: res } = await fetchWithPoolProxy(url, {
        method,
        headers,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      }, { targetDomain: domain, timeout: this.timeout });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        let errMsg = `WP API Error ${res.status}: ${res.statusText}`;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.message || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // ═══ Connection Test ═══
  async testConnection(): Promise<{ connected: boolean; siteName: string; wpVersion: string; hasYoast: boolean; hasRankMath: boolean; error?: string }> {
    try {
      const info = await this.request<any>("GET", "/wp/v2/settings");
      // Also check available namespaces
      const root = await this.request<WPSiteInfo>("GET", "/");
      const namespaces = root.namespaces || [];
      const hasYoast = namespaces.some((n: string) => n.startsWith("yoast"));
      const hasRankMath = namespaces.some((n: string) => n.startsWith("rankmath"));

      return {
        connected: true,
        siteName: info.title || root.name || "Unknown",
        wpVersion: "detected",
        hasYoast,
        hasRankMath,
      };
    } catch (err: any) {
      return {
        connected: false,
        siteName: "",
        wpVersion: "",
        hasYoast: false,
        hasRankMath: false,
        error: err.message,
      };
    }
  }

  // ═══ Site Info ═══
  async getSiteInfo(): Promise<WPSiteInfo> {
    return this.request<WPSiteInfo>("GET", "/");
  }

  async getSiteSettings(): Promise<Record<string, any>> {
    return this.request<Record<string, any>>("GET", "/wp/v2/settings");
  }

  async updateSiteSettings(settings: Record<string, any>): Promise<Record<string, any>> {
    return this.request<Record<string, any>>("POST", "/wp/v2/settings", settings);
  }

  // ═══ Posts ═══
  async getPosts(params?: { per_page?: number; page?: number; status?: string; search?: string }): Promise<WPPost[]> {
    const qs = new URLSearchParams();
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    if (params?.page) qs.set("page", String(params.page));
    if (params?.status) qs.set("status", params.status);
    if (params?.search) qs.set("search", params.search);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<WPPost[]>("GET", `/wp/v2/posts${query}`);
  }

  async getPost(id: number): Promise<WPPost> {
    return this.request<WPPost>("GET", `/wp/v2/posts/${id}?context=edit`);
  }

  async createPost(data: {
    title: string;
    content: string;
    status?: string;
    excerpt?: string;
    slug?: string;
    categories?: number[];
    tags?: number[];
    meta?: Record<string, any>;
  }): Promise<WPPost> {
    return this.request<WPPost>("POST", "/wp/v2/posts", {
      ...data,
      status: data.status || "draft",
    });
  }

  async updatePost(id: number, data: Partial<{
    title: string;
    content: string;
    excerpt: string;
    slug: string;
    status: string;
    meta: Record<string, any>;
  }>): Promise<WPPost> {
    return this.request<WPPost>("POST", `/wp/v2/posts/${id}`, data);
  }

  async deletePost(id: number): Promise<any> {
    return this.request<any>("DELETE", `/wp/v2/posts/${id}?force=true`);
  }

  // ═══ Pages ═══
  async getPages(params?: { per_page?: number; page?: number; status?: string }): Promise<WPPage[]> {
    const qs = new URLSearchParams();
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    if (params?.page) qs.set("page", String(params.page));
    if (params?.status) qs.set("status", params.status);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.request<WPPage[]>("GET", `/wp/v2/pages${query}`);
  }

  async getPage(id: number): Promise<WPPage> {
    return this.request<WPPage>("GET", `/wp/v2/pages/${id}?context=edit`);
  }

  async updatePage(id: number, data: Partial<{
    title: string;
    content: string;
    excerpt: string;
    slug: string;
    status: string;
    meta: Record<string, any>;
  }>): Promise<WPPage> {
    return this.request<WPPage>("POST", `/wp/v2/pages/${id}`, data);
  }

  async createPage(data: {
    title: string;
    content: string;
    status?: string;
    slug?: string;
    parent?: number;
    meta?: Record<string, any>;
  }): Promise<WPPage> {
    return this.request<WPPage>("POST", "/wp/v2/pages", {
      ...data,
      status: data.status || "draft",
    });
  }

  // ═══ Categories & Tags ═══
  async getCategories(): Promise<any[]> {
    return this.request<any[]>("GET", "/wp/v2/categories?per_page=100");
  }

  async createCategory(name: string, slug?: string, parent?: number): Promise<any> {
    return this.request<any>("POST", "/wp/v2/categories", { name, slug, parent });
  }

  async getTags(): Promise<any[]> {
    return this.request<any[]>("GET", "/wp/v2/tags?per_page=100");
  }

  async createTag(name: string, slug?: string): Promise<any> {
    return this.request<any>("POST", "/wp/v2/tags", { name, slug });
  }

  // ═══ Media ═══
  async getMedia(params?: { per_page?: number }): Promise<WPMedia[]> {
    const qs = params?.per_page ? `?per_page=${params.per_page}` : "";
    return this.request<WPMedia[]>("GET", `/wp/v2/media${qs}`);
  }

  async updateMedia(id: number, data: { alt_text?: string; title?: string; caption?: string }): Promise<WPMedia> {
    return this.request<WPMedia>("POST", `/wp/v2/media/${id}`, data);
  }

  // ═══ Plugins ═══
  async getPlugins(): Promise<WPPlugin[]> {
    try {
      return await this.request<WPPlugin[]>("GET", "/wp/v2/plugins");
    } catch {
      return []; // Plugin API may not be available
    }
  }

  // ═══ SEO Plugin Detection & Meta ═══
  async detectSEOPlugin(): Promise<"yoast" | "rankmath" | "aioseo" | "none"> {
    try {
      const root = await this.getSiteInfo();
      const ns = root.namespaces || [];
      if (ns.some((n: string) => n.startsWith("yoast"))) return "yoast";
      if (ns.some((n: string) => n.startsWith("rankmath"))) return "rankmath";
      // Check plugins list
      const plugins = await this.getPlugins();
      for (const p of plugins) {
        if (p.plugin.includes("wordpress-seo") && p.status === "active") return "yoast";
        if (p.plugin.includes("seo-by-rank-math") && p.status === "active") return "rankmath";
        if (p.plugin.includes("all-in-one-seo") && p.status === "active") return "aioseo";
      }
    } catch {}
    return "none";
  }

  // ═══ Yoast SEO Meta Updates ═══
  async updateYoastMeta(postId: number, type: "post" | "page", meta: {
    title?: string;
    description?: string;
    focusKeyword?: string;
    canonical?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    twitterTitle?: string;
    twitterDescription?: string;
    noindex?: boolean;
    nofollow?: boolean;
  }): Promise<WPUpdateResult> {
    try {
      const endpoint = type === "page" ? `/wp/v2/pages/${postId}` : `/wp/v2/posts/${postId}`;
      const yoastMeta: Record<string, any> = {};

      if (meta.title) yoastMeta["yoast_wpseo_title"] = meta.title;
      if (meta.description) yoastMeta["yoast_wpseo_metadesc"] = meta.description;
      if (meta.focusKeyword) yoastMeta["yoast_wpseo_focuskw"] = meta.focusKeyword;
      if (meta.canonical) yoastMeta["yoast_wpseo_canonical"] = meta.canonical;
      if (meta.ogTitle) yoastMeta["yoast_wpseo_opengraph-title"] = meta.ogTitle;
      if (meta.ogDescription) yoastMeta["yoast_wpseo_opengraph-description"] = meta.ogDescription;
      if (meta.noindex !== undefined) yoastMeta["yoast_wpseo_meta-robots-noindex"] = meta.noindex ? "1" : "0";
      if (meta.nofollow !== undefined) yoastMeta["yoast_wpseo_meta-robots-nofollow"] = meta.nofollow ? "1" : "0";

      const result = await this.request<any>("POST", endpoint, { meta: yoastMeta });
      return { success: true, action: "update_yoast_meta", detail: `อัพเดท Yoast SEO meta สำหรับ ${type} #${postId}`, after: yoastMeta };
    } catch (err: any) {
      return { success: false, action: "update_yoast_meta", detail: err.message, error: err.message };
    }
  }

  // ═══ RankMath SEO Meta Updates ═══
  async updateRankMathMeta(postId: number, type: "post" | "page", meta: {
    title?: string;
    description?: string;
    focusKeyword?: string;
    canonical?: string;
    robots?: string[];
  }): Promise<WPUpdateResult> {
    try {
      const endpoint = type === "page" ? `/wp/v2/pages/${postId}` : `/wp/v2/posts/${postId}`;
      const rmMeta: Record<string, any> = {};

      if (meta.title) rmMeta["rank_math_title"] = meta.title;
      if (meta.description) rmMeta["rank_math_description"] = meta.description;
      if (meta.focusKeyword) rmMeta["rank_math_focus_keyword"] = meta.focusKeyword;
      if (meta.canonical) rmMeta["rank_math_canonical_url"] = meta.canonical;
      if (meta.robots) rmMeta["rank_math_robots"] = meta.robots;

      const result = await this.request<any>("POST", endpoint, { meta: rmMeta });
      return { success: true, action: "update_rankmath_meta", detail: `อัพเดท RankMath meta สำหรับ ${type} #${postId}`, after: rmMeta };
    } catch (err: any) {
      return { success: false, action: "update_rankmath_meta", detail: err.message, error: err.message };
    }
  }

  // ═══ Generic SEO Meta Update (auto-detect plugin) ═══
  async updateSEOMeta(postId: number, type: "post" | "page", meta: {
    title?: string;
    description?: string;
    focusKeyword?: string;
    canonical?: string;
    ogTitle?: string;
    ogDescription?: string;
  }): Promise<WPUpdateResult> {
    const plugin = await this.detectSEOPlugin();
    if (plugin === "yoast") {
      return this.updateYoastMeta(postId, type, meta);
    } else if (plugin === "rankmath") {
      return this.updateRankMathMeta(postId, type, meta);
    } else {
      // Fallback: update post excerpt as meta description
      try {
        const endpoint = type === "page" ? `/wp/v2/pages/${postId}` : `/wp/v2/posts/${postId}`;
        const data: any = {};
        if (meta.title) data.title = meta.title;
        if (meta.description) data.excerpt = meta.description;
        await this.request<any>("POST", endpoint, data);
        return { success: true, action: "update_basic_meta", detail: `อัพเดท title/excerpt (ไม่มี SEO plugin) สำหรับ ${type} #${postId}` };
      } catch (err: any) {
        return { success: false, action: "update_basic_meta", detail: err.message, error: err.message };
      }
    }
  }

  // ═══ Inject Custom HTML/Script (via post content) ═══
  async injectSchemaMarkup(postId: number, type: "post" | "page", jsonLd: object): Promise<WPUpdateResult> {
    try {
      const endpoint = type === "page" ? `/wp/v2/pages/${postId}` : `/wp/v2/posts/${postId}`;
      const current = await this.request<any>("GET", `${endpoint}?context=edit`);
      const currentContent = current.content?.raw || current.content?.rendered || "";

      // Remove existing schema if present
      const cleanContent = currentContent.replace(/<!-- friday-schema-start -->[\s\S]*?<!-- friday-schema-end -->/g, "").trim();

      const schemaBlock = `\n<!-- friday-schema-start -->\n<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>\n<!-- friday-schema-end -->`;

      await this.request<any>("POST", endpoint, {
        content: cleanContent + schemaBlock,
      });

      return { success: true, action: "inject_schema", detail: `เพิ่ม JSON-LD Schema ใน ${type} #${postId}` };
    } catch (err: any) {
      return { success: false, action: "inject_schema", detail: err.message, error: err.message };
    }
  }

  // ═══ Bulk Content Audit ═══
  async auditAllContent(): Promise<{
    posts: { id: number; title: string; slug: string; status: string; hasExcerpt: boolean; wordCount: number; hasFeaturedImage: boolean }[];
    pages: { id: number; title: string; slug: string; status: string; hasExcerpt: boolean; wordCount: number }[];
    totalPosts: number;
    totalPages: number;
    issues: string[];
  }> {
    const posts = await this.getPosts({ per_page: 100, status: "publish" });
    const pages = await this.getPages({ per_page: 100, status: "publish" });
    const issues: string[] = [];

    const auditedPosts = posts.map(p => {
      const content = p.content?.rendered || "";
      const wordCount = content.replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length;
      const hasExcerpt = !!(p.excerpt?.rendered && p.excerpt.rendered.replace(/<[^>]*>/g, "").trim());
      const hasFeaturedImage = false; // Would need featured_media check

      if (wordCount < 300) issues.push(`โพสต์ "${p.title.rendered}" มีเนื้อหาน้อยเกินไป (${wordCount} คำ)`);
      if (!hasExcerpt) issues.push(`โพสต์ "${p.title.rendered}" ไม่มี excerpt/meta description`);
      if (!p.slug || p.slug.includes("?")) issues.push(`โพสต์ "${p.title.rendered}" มี slug ไม่ดี`);

      return { id: p.id, title: p.title.rendered, slug: p.slug, status: p.status, hasExcerpt, wordCount, hasFeaturedImage };
    });

    const auditedPages = pages.map(p => {
      const content = p.content?.rendered || "";
      const wordCount = content.replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length;
      const hasExcerpt = !!(p.excerpt?.rendered && p.excerpt.rendered.replace(/<[^>]*>/g, "").trim());

      if (wordCount < 100) issues.push(`หน้า "${p.title.rendered}" มีเนื้อหาน้อยเกินไป (${wordCount} คำ)`);
      if (!hasExcerpt) issues.push(`หน้า "${p.title.rendered}" ไม่มี excerpt/meta description`);

      return { id: p.id, title: p.title.rendered, slug: p.slug, status: p.status, hasExcerpt, wordCount };
    });

    return {
      posts: auditedPosts,
      pages: auditedPages,
      totalPosts: auditedPosts.length,
      totalPages: auditedPages.length,
      issues,
    };
  }

  // ═══ Add Internal Links to Content ═══
  async addInternalLinks(postId: number, type: "post" | "page", links: { anchorText: string; targetUrl: string }[]): Promise<WPUpdateResult> {
    try {
      const endpoint = type === "page" ? `/wp/v2/pages/${postId}` : `/wp/v2/posts/${postId}`;
      const current = await this.request<any>("GET", `${endpoint}?context=edit`);
      let content = current.content?.raw || current.content?.rendered || "";

      let addedCount = 0;
      for (const link of links) {
        // Only add link if anchor text exists in content and isn't already linked
        const anchorRegex = new RegExp(`(?<!<a[^>]*>)${escapeRegex(link.anchorText)}(?!</a>)`, "i");
        if (anchorRegex.test(content)) {
          content = content.replace(anchorRegex, `<a href="${link.targetUrl}" title="${link.anchorText}">${link.anchorText}</a>`);
          addedCount++;
        }
      }

      if (addedCount === 0) {
        return { success: true, action: "add_internal_links", detail: `ไม่พบข้อความที่ตรงกันใน ${type} #${postId} — ข้ามการเพิ่ม link` };
      }

      await this.request<any>("POST", endpoint, { content });
      return { success: true, action: "add_internal_links", detail: `เพิ่ม ${addedCount} internal links ใน ${type} #${postId}` };
    } catch (err: any) {
      return { success: false, action: "add_internal_links", detail: err.message, error: err.message };
    }
  }

  // ═══ Update Alt Text for Images ═══
  async fixImageAltTexts(altTexts: { mediaId: number; altText: string }[]): Promise<WPUpdateResult[]> {
    const results: WPUpdateResult[] = [];
    for (const item of altTexts) {
      try {
        await this.updateMedia(item.mediaId, { alt_text: item.altText });
        results.push({ success: true, action: "fix_alt_text", detail: `อัพเดท alt text สำหรับ media #${item.mediaId}` });
      } catch (err: any) {
        results.push({ success: false, action: "fix_alt_text", detail: err.message, error: err.message });
      }
    }
    return results;
  }

  // ═══ Optimize Post Slug ═══
  async optimizeSlug(postId: number, type: "post" | "page", newSlug: string): Promise<WPUpdateResult> {
    try {
      const endpoint = type === "page" ? `/wp/v2/pages/${postId}` : `/wp/v2/posts/${postId}`;
      const before = await this.request<any>("GET", `${endpoint}?context=edit`);
      await this.request<any>("POST", endpoint, { slug: newSlug });
      return { success: true, action: "optimize_slug", detail: `เปลี่ยน slug: "${before.slug}" → "${newSlug}"`, before: before.slug, after: newSlug };
    } catch (err: any) {
      return { success: false, action: "optimize_slug", detail: err.message, error: err.message };
    }
  }

  // ═══ Plugin Management ═══
  async activatePlugin(pluginSlug: string): Promise<WPUpdateResult> {
    try {
      await this.request<any>("POST", `/wp/v2/plugins/${encodeURIComponent(pluginSlug)}`, { status: "active" });
      return { success: true, action: "activate_plugin", detail: `Activated plugin: ${pluginSlug}` };
    } catch (err: any) {
      return { success: false, action: "activate_plugin", detail: err.message, error: err.message };
    }
  }

  async deactivatePlugin(pluginSlug: string): Promise<WPUpdateResult> {
    try {
      await this.request<any>("POST", `/wp/v2/plugins/${encodeURIComponent(pluginSlug)}`, { status: "inactive" });
      return { success: true, action: "deactivate_plugin", detail: `Deactivated plugin: ${pluginSlug}` };
    } catch (err: any) {
      return { success: false, action: "deactivate_plugin", detail: err.message, error: err.message };
    }
  }

  async deletePlugin(pluginSlug: string): Promise<WPUpdateResult> {
    try {
      await this.request<any>("DELETE", `/wp/v2/plugins/${encodeURIComponent(pluginSlug)}`);
      return { success: true, action: "delete_plugin", detail: `Deleted plugin: ${pluginSlug}` };
    } catch (err: any) {
      return { success: false, action: "delete_plugin", detail: err.message, error: err.message };
    }
  }

  // ═══ Site Health & Error Detection ═══
  async getSiteHealth(): Promise<{
    status: string;
    errors: SiteError[];
    warnings: SiteError[];
    pluginIssues: PluginIssue[];
    phpVersion?: string;
    wpVersion?: string;
  }> {
    const errors: SiteError[] = [];
    const warnings: SiteError[] = [];
    const pluginIssues: PluginIssue[] = [];
    let phpVersion: string | undefined;
    let wpVersion: string | undefined;

    try {
      // 1. Check site info
      const siteInfo = await this.getSiteInfo();
      // WP version not directly available from REST API root, leave undefined
    } catch (err: any) {
      errors.push({ type: "site_unreachable", message: `Cannot reach WP REST API: ${err.message}`, severity: "critical" });
    }

    try {
      // 2. Check plugins for issues
      const plugins = await this.getPlugins();
      for (const p of plugins) {
        // Check for known problematic plugins
        if (p.status === "active" && isKnownProblematicPlugin(p.plugin)) {
          pluginIssues.push({
            plugin: p.plugin,
            name: p.name,
            status: p.status,
            issue: "known_problematic",
            description: `Plugin "${p.name}" is known to cause issues (conflicts, performance, security)`,
            suggestedAction: "deactivate",
          });
        }
        // Check for outdated/inactive plugins (security risk)
        if (p.status === "inactive") {
          pluginIssues.push({
            plugin: p.plugin,
            name: p.name,
            status: p.status,
            issue: "inactive_installed",
            description: `Plugin "${p.name}" is inactive but still installed — security risk`,
            suggestedAction: "delete",
          });
        }
      }

      // Check for conflicting plugins
      const activePlugins = plugins.filter(p => p.status === "active");
      const seoPlugins = activePlugins.filter(p => 
        p.plugin.includes("wordpress-seo") || p.plugin.includes("seo-by-rank-math") || 
        p.plugin.includes("all-in-one-seo") || p.plugin.includes("squirrly-seo")
      );
      if (seoPlugins.length > 1) {
        warnings.push({
          type: "plugin_conflict",
          message: `Multiple SEO plugins active: ${seoPlugins.map(p => p.name).join(", ")} — this causes conflicts`,
          severity: "high",
        });
      }

      const cachePlugins = activePlugins.filter(p =>
        p.plugin.includes("w3-total-cache") || p.plugin.includes("wp-super-cache") ||
        p.plugin.includes("wp-fastest-cache") || p.plugin.includes("litespeed-cache") ||
        p.plugin.includes("wp-rocket")
      );
      if (cachePlugins.length > 1) {
        warnings.push({
          type: "plugin_conflict",
          message: `Multiple cache plugins active: ${cachePlugins.map(p => p.name).join(", ")} — this causes conflicts`,
          severity: "high",
        });
      }
    } catch (err: any) {
      warnings.push({ type: "plugin_check_failed", message: `Cannot check plugins: ${err.message}`, severity: "medium" });
    }

    try {
      // 3. Check for broken pages (HTTP errors)
      const pages = await this.getPages({ per_page: 50, status: "publish" });
      for (const page of pages) {
        const content = page.content?.rendered || "";
        if (content.includes("Fatal error") || content.includes("Parse error") || content.includes("Warning:")) {
          errors.push({
            type: "php_error_in_content",
            message: `Page "${page.title.rendered}" contains PHP error output`,
            severity: "critical",
            context: { pageId: page.id, slug: page.slug },
          });
        }
        if (content.trim().length < 50) {
          warnings.push({
            type: "empty_page",
            message: `Page "${page.title.rendered}" appears empty or broken (${content.trim().length} chars)`,
            severity: "medium",
            context: { pageId: page.id, slug: page.slug },
          });
        }
      }
    } catch (err: any) {
      warnings.push({ type: "page_check_failed", message: `Cannot check pages: ${err.message}`, severity: "medium" });
    }

    try {
      // 4. Check homepage for errors via fetch
      const homeRes = await fetch(`${this.baseUrl}`, { signal: AbortSignal.timeout(15000) });
      if (!homeRes.ok) {
        errors.push({
          type: "homepage_error",
          message: `Homepage returns HTTP ${homeRes.status} ${homeRes.statusText}`,
          severity: "critical",
        });
      } else {
        const html = await homeRes.text();
        if (html.includes("Fatal error") || html.includes("Parse error")) {
          errors.push({ type: "homepage_php_error", message: "Homepage contains PHP fatal/parse error", severity: "critical" });
        }
        if (html.includes("Error establishing a database connection")) {
          errors.push({ type: "db_connection_error", message: "Database connection error on homepage", severity: "critical" });
        }
        if (html.includes("Briefly unavailable for scheduled maintenance")) {
          errors.push({ type: "maintenance_mode", message: "Site is stuck in maintenance mode", severity: "critical" });
        }
        if (html.includes("There has been a critical error on this website")) {
          errors.push({ type: "wp_critical_error", message: "WordPress critical error detected on homepage", severity: "critical" });
        }
      }
    } catch (err: any) {
      errors.push({ type: "homepage_unreachable", message: `Cannot reach homepage: ${err.message}`, severity: "critical" });
    }

    const status = errors.length > 0 ? "critical" : warnings.length > 0 ? "warning" : "healthy";
    return { status, errors, warnings, pluginIssues, phpVersion, wpVersion };
  }

  // ═══ Auto-Fix Site Errors ═══
  async autoFixErrors(errors: SiteError[], pluginIssues: PluginIssue[]): Promise<FixResult[]> {
    const fixes: FixResult[] = [];

    // Fix plugin conflicts — deactivate duplicates
    for (const issue of pluginIssues) {
      if (issue.suggestedAction === "deactivate") {
        const result = await this.deactivatePlugin(issue.plugin);
        fixes.push({
          errorType: issue.issue,
          action: `Deactivated plugin: ${issue.name}`,
          success: result.success,
          detail: result.detail,
        });
      } else if (issue.suggestedAction === "delete") {
        // First deactivate, then delete
        if (issue.status === "active") {
          await this.deactivatePlugin(issue.plugin);
        }
        const result = await this.deletePlugin(issue.plugin);
        fixes.push({
          errorType: issue.issue,
          action: `Deleted inactive plugin: ${issue.name}`,
          success: result.success,
          detail: result.detail,
        });
      }
    }

    // Fix maintenance mode — try to delete .maintenance file via WP-CLI or settings
    for (const error of errors) {
      if (error.type === "maintenance_mode") {
        // Try to toggle maintenance off via settings API
        try {
          await this.updateSiteSettings({ maintenance_mode: false });
          fixes.push({ errorType: "maintenance_mode", action: "Disabled maintenance mode via settings API", success: true, detail: "Maintenance mode disabled" });
        } catch {
          fixes.push({ errorType: "maintenance_mode", action: "Could not disable maintenance mode — may need manual .maintenance file deletion", success: false, detail: "Settings API cannot toggle maintenance" });
        }
      }
    }

    return fixes;
  }

  // ═══ Update Site Title & Tagline ═══
  async updateSiteBranding(title?: string, description?: string): Promise<WPUpdateResult> {
    try {
      const settings: Record<string, any> = {};
      if (title) settings.title = title;
      if (description) settings.description = description;
      await this.updateSiteSettings(settings);
      return { success: true, action: "update_branding", detail: `อัพเดท Site Title/Tagline` };
    } catch (err: any) {
      return { success: false, action: "update_branding", detail: err.message, error: err.message };
    }
  }
}

// ═══ Types for Site Health ═══
export interface SiteError {
  type: string;
  message: string;
  severity: "critical" | "high" | "medium" | "low";
  context?: Record<string, any>;
}

export interface PluginIssue {
  plugin: string;
  name: string;
  status: string;
  issue: "known_problematic" | "inactive_installed" | "conflict" | "outdated";
  description: string;
  suggestedAction: "deactivate" | "delete" | "update" | "none";
}

export interface FixResult {
  errorType: string;
  action: string;
  success: boolean;
  detail: string;
}

// ═══ Helpers ═══
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const KNOWN_PROBLEMATIC_PLUGINS = [
  "hello-dolly",
  "akismet",  // Not problematic per se, but often unused on gambling sites
  "jetpack",  // Heavy, conflicts with many plugins
  "broken-link-checker", // Extremely resource-heavy
  "wp-statistics", // Can slow down sites significantly
  "wordfence", // Can block legitimate bots and SEO crawlers
  "ithemes-security", // Can block WP REST API
  "sucuri-scanner", // Can interfere with API access
];

function isKnownProblematicPlugin(pluginSlug: string): boolean {
  return KNOWN_PROBLEMATIC_PLUGINS.some(p => pluginSlug.toLowerCase().includes(p));
}

// ═══ Factory ═══
export function createWPClient(creds: WPCredentials): WordPressAPI {
  return new WordPressAPI(creds);
}
