/**
 * Parasite SEO Blitz + Google Entity Stacking
 * 
 * Leverages high-DA platforms for rapid rankings:
 * 1. Parasite SEO: Mass-deploy optimized content on high-DA platforms
 *    - Telegraph (telegra.ph) — instant, no auth, DA 90+
 *    - Medium — DA 95
 *    - LinkedIn Articles — DA 98
 *    - Quora Answers — DA 93
 *    - Reddit Posts — DA 99
 *    - HubPages — DA 90
 *    - Blogger — DA 87
 *    - WordPress.com — DA 93
 *    - Tumblr — DA 89
 * 
 * 2. Google Entity Stacking: Create interconnected Google properties
 *    - Google Sites pages
 *    - Google Docs (public)
 *    - Google Sheets (public)
 *    - Google Maps listings
 *    - Google Drive folders
 *    - YouTube descriptions
 *    All linking to target domain to create "entity authority"
 * 
 * 3. Content Velocity: AI generates 10-50 unique articles per day
 */

import { invokeLLM } from "./_core/llm";
import { rapidIndexUrl, type IndexingRequest } from "./rapid-indexing-engine";
import { selectAnchorText } from "./keyword-sniper-engine";
import { trackContent } from "./content-freshness-engine";
import { scoreContent, generateOptimizedContentPrompt, type ContentScore } from "./google-algorithm-intelligence";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface ParasiteDeployment {
  platform: string;
  url: string;
  title: string;
  keyword: string;
  anchorText: string;
  targetUrl: string;
  status: "deployed" | "failed" | "indexed" | "ranking";
  deployedAt: Date;
  indexedAt?: Date;
  rankPosition?: number;
}

export interface EntityStackItem {
  platform: string;
  url: string;
  title: string;
  linksTo: string[];
  status: "created" | "failed" | "indexed";
  createdAt: Date;
}

export interface BlitzCampaign {
  domain: string;
  keywords: string[];
  parasiteDeployments: ParasiteDeployment[];
  entityStack: EntityStackItem[];
  contentGenerated: number;
  totalDeployed: number;
  totalIndexed: number;
  startedAt: Date;
}

interface GeneratedContent {
  title: string;
  content: string;
  metaDescription: string;
  tags: string[];
  /** Algorithm Intelligence content score (0-100) */
  algorithmScore?: ContentScore;
}

// ═══════════════════════════════════════════════
//  PARASITE PLATFORMS CONFIG
// ═══════════════════════════════════════════════

const PARASITE_PLATFORMS = [
  { name: "Telegraph", domain: "telegra.ph", da: 90, noAuth: true, maxPerDay: 50, indexSpeed: "fast" },
  { name: "Medium", domain: "medium.com", da: 95, noAuth: false, maxPerDay: 5, indexSpeed: "fast" },
  { name: "LinkedIn", domain: "linkedin.com", da: 98, noAuth: false, maxPerDay: 3, indexSpeed: "medium" },
  { name: "Quora", domain: "quora.com", da: 93, noAuth: false, maxPerDay: 10, indexSpeed: "fast" },
  { name: "Reddit", domain: "reddit.com", da: 99, noAuth: false, maxPerDay: 5, indexSpeed: "fast" },
  { name: "Blogger", domain: "blogspot.com", da: 87, noAuth: false, maxPerDay: 10, indexSpeed: "medium" },
  { name: "WordPress.com", domain: "wordpress.com", da: 93, noAuth: false, maxPerDay: 5, indexSpeed: "medium" },
  { name: "Tumblr", domain: "tumblr.com", da: 89, noAuth: false, maxPerDay: 10, indexSpeed: "medium" },
  { name: "HubPages", domain: "hubpages.com", da: 90, noAuth: false, maxPerDay: 3, indexSpeed: "slow" },
];

// ═══════════════════════════════════════════════
//  AI CONTENT GENERATION
// ═══════════════════════════════════════════════

/**
 * Generate unique, SEO-optimized content for parasite deployment
 */
export async function generateParasiteContent(
  keyword: string,
  targetUrl: string,
  platform: string,
  language: string = "th",
  contentIndex: number = 0
): Promise<GeneratedContent> {
  const langName = language === "th" ? "Thai" : "English";
  const angles = [
    "comprehensive guide", "expert review", "case study", "comparison",
    "step-by-step tutorial", "industry analysis", "tips and tricks",
    "beginner's guide", "advanced strategies", "latest trends",
    "common mistakes", "best practices", "FAQ compilation",
    "success stories", "data-driven analysis"
  ];
  const angle = angles[contentIndex % angles.length];
  
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: `You are an expert SEO content writer. Write in ${langName}. Create unique, high-quality content optimized for the keyword. The content should be informative, engaging, and naturally include the target keyword 3-5 times. Include a natural link to the target URL.` },
        { role: "user", content: `Write a ${angle} article for the platform "${platform}" about "${keyword}".

Requirements:
- Title: Catchy, keyword-optimized (include "${keyword}" naturally)
- Content: 800-1500 words, well-structured with headers
- Include the link ${targetUrl} naturally 1-2 times
- Meta description: 150-160 characters
- Tags: 5-8 relevant tags
- Language: ${langName}
- Angle: ${angle}
- Make it unique — this is article #${contentIndex + 1} in a series

Return JSON with: title, content (HTML), metaDescription, tags (array)` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "parasite_content",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
              metaDescription: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["title", "content", "metaDescription", "tags"],
            additionalProperties: false,
          },
        },
      },
    });
    
    const raw = response.choices?.[0]?.message?.content;
    if (!raw) throw new Error("No content generated");
    const parsed = JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
    
    // ═══ Algorithm Intelligence: Score content before deployment ═══
    const algoScore = scoreContent({
      title: parsed.title,
      content: parsed.content,
      keyword,
      metaDescription: parsed.metaDescription,
      hasSchema: false,
      hasImages: false,
      hasTOC: parsed.content.toLowerCase().includes('table of contents') || parsed.content.includes('<ul') && parsed.content.includes('#'),
      publishDate: new Date(),
    });
    
    console.log(`[ParasiteBlitz] Algorithm Score: ${algoScore.overall}/100 for "${keyword}" (${platform})`);
    
    // If score is below 50, attempt to regenerate with algorithm-optimized prompt
    if (algoScore.overall < 50) {
      console.log(`[ParasiteBlitz] Score too low (${algoScore.overall}), regenerating with algorithm-optimized prompt...`);
      console.log(`[ParasiteBlitz] Issues: ${algoScore.recommendations.slice(0, 3).join(', ')}`);
      
      const optimizedPrompt = generateOptimizedContentPrompt({
        keyword,
        niche: "online gambling",
        language: language === "th" ? "Thai" : "English",
        targetWordCount: 1800,
        includeSchema: false,
      });
      
      try {
        const retryResponse = await invokeLLM({
          messages: [
            { role: "system", content: `You are an expert SEO content writer. ${optimizedPrompt}` },
            { role: "user", content: `Write a ${angle} article for the platform "${platform}" about "${keyword}". Return JSON with: title, content (HTML), metaDescription, tags (array)` },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "parasite_content_optimized",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  content: { type: "string" },
                  metaDescription: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                },
                required: ["title", "content", "metaDescription", "tags"],
                additionalProperties: false,
              },
            },
          },
        });
        const retryRaw = retryResponse.choices?.[0]?.message?.content;
        if (retryRaw) {
          const retryParsed = JSON.parse(typeof retryRaw === "string" ? retryRaw : JSON.stringify(retryRaw));
          const retryScore = scoreContent({
            title: retryParsed.title,
            content: retryParsed.content,
            keyword,
            metaDescription: retryParsed.metaDescription,
          });
          console.log(`[ParasiteBlitz] Retry Algorithm Score: ${retryScore.overall}/100`);
          if (retryScore.overall > algoScore.overall) {
            return { ...retryParsed, algorithmScore: retryScore } as GeneratedContent;
          }
        }
      } catch (retryErr: any) {
        console.error(`[ParasiteBlitz] Retry failed, using original:`, retryErr.message);
      }
    }
    
    return { ...parsed, algorithmScore: algoScore } as GeneratedContent;
  } catch (err: any) {
    console.error(`[ParasiteBlitz] Content generation failed:`, err.message);
    // Fallback content
    return {
      title: `${keyword} - Complete Guide ${new Date().getFullYear()}`,
      content: `<p>Comprehensive guide about ${keyword}. Visit <a href="${targetUrl}">${keyword}</a> for more information.</p>`,
      metaDescription: `Learn everything about ${keyword}. Expert guide with tips, strategies, and resources.`,
      tags: [keyword, keyword.split(" ")[0], "guide", "tips", "2026"],
    };
  }
}

// ═══════════════════════════════════════════════
//  TELEGRAPH MASS DEPLOYMENT
// ═══════════════════════════════════════════════

/**
 * Deploy multiple articles to Telegraph (no auth required, instant)
 * Telegraph is the primary parasite platform due to:
 * - No authentication needed
 * - Instant publishing
 * - DA 90+
 * - Fast Google indexing (usually within hours)
 * - No content moderation
 */
export async function deployTelegraphBlitz(
  keyword: string,
  targetUrl: string,
  domain: string,
  count: number = 10,
  language: string = "th"
): Promise<ParasiteDeployment[]> {
  const deployments: ParasiteDeployment[] = [];
  
  console.log(`[ParasiteBlitz] Deploying ${count} Telegraph articles for "${keyword}"...`);
  
  for (let i = 0; i < count; i++) {
    try {
      // Generate unique content
      const content = await generateParasiteContent(keyword, targetUrl, "Telegraph", language, i);
      
      // Create Telegraph account
      const accountRes = await fetch("https://api.telegra.ph/createAccount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          short_name: `seo_${Date.now().toString(36)}_${i}`,
          author_name: domain.replace(/\.(com|net|org|io|ai)$/, ""),
          author_url: targetUrl,
        }),
        signal: AbortSignal.timeout(10000),
      });
      
      const accountData = await accountRes.json() as any;
      if (!accountData.ok) continue;
      
      const token = accountData.result.access_token;
      
      // Convert HTML to Telegraph nodes
      const nodes = htmlToTelegraphNodes(content.content, targetUrl, keyword);
      
      // Create page
      const pageRes = await fetch("https://api.telegra.ph/createPage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: token,
          title: content.title,
          author_name: domain.replace(/\.(com|net|org|io|ai)$/, ""),
          author_url: targetUrl,
          content: nodes,
          return_content: false,
        }),
        signal: AbortSignal.timeout(10000),
      });
      
      const pageData = await pageRes.json() as any;
      
      if (pageData.ok) {
        const deployment: ParasiteDeployment = {
          platform: "Telegraph",
          url: pageData.result.url,
          title: content.title,
          keyword,
          anchorText: keyword,
          targetUrl,
          status: "deployed",
          deployedAt: new Date(),
        };
        deployments.push(deployment);
        
        // Rapid index the Telegraph page
        await rapidIndexUrl({
          url: pageData.result.url,
          domain: "telegra.ph",
          keywords: [keyword],
          priority: "high",
        }).catch(() => {});

        // Track for freshness monitoring (DB-backed, with token for editPage)
        await trackContent({
          url: pageData.result.url,
          title: content.title,
          keyword,
          platform: "telegraph",
          originalContent: content.content,
          domain,
          telegraphToken: token,
          telegraphPath: pageData.result.path,
          sourceEngine: "parasite-blitz",
        }).catch(() => {});
        
        console.log(`[ParasiteBlitz] Telegraph #${i + 1}: ${pageData.result.url}`);
      }
      
      // Small delay between posts
      await new Promise(r => setTimeout(r, 1500));
    } catch (err: any) {
      console.error(`[ParasiteBlitz] Telegraph #${i + 1} failed:`, err.message);
    }
  }
  
  console.log(`[ParasiteBlitz] Telegraph blitz complete: ${deployments.length}/${count} deployed`);
  return deployments;
}

// ═══════════════════════════════════════════════
//  GOOGLE ENTITY STACKING
// ═══════════════════════════════════════════════

/**
 * Create a Google Entity Stack — interconnected Google properties
 * that all link to the target domain, creating "entity authority"
 * 
 * This works because Google trusts its own properties and the
 * interconnected links create a strong entity signal
 */
export async function createEntityStack(
  domain: string,
  brandName: string,
  keywords: string[],
  targetUrl: string,
  language: string = "th"
): Promise<EntityStackItem[]> {
  const stack: EntityStackItem[] = [];
  const primaryKeyword = keywords[0] || domain;
  
  console.log(`[EntityStack] Creating Google Entity Stack for ${domain}...`);
  
  // 1. Create Google Sites page (via Telegraph as proxy for entity signal)
  // Since we can't directly create Google Sites programmatically,
  // we create content on platforms that Google treats as entities
  
  // Entity 1: About page on Telegraph
  try {
    const aboutContent = await generateEntityContent(
      "about", brandName, domain, primaryKeyword, targetUrl, language
    );
    const result = await deployToTelegraph(aboutContent.title, aboutContent.content, domain, targetUrl);
    if (result) {
      stack.push({
        platform: "Telegraph (Entity: About)",
        url: result,
        title: aboutContent.title,
        linksTo: [targetUrl],
        status: "created",
        createdAt: new Date(),
      });
    }
  } catch {}
  
  // Entity 2: Services/Products page
  try {
    const servicesContent = await generateEntityContent(
      "services", brandName, domain, primaryKeyword, targetUrl, language
    );
    const result = await deployToTelegraph(servicesContent.title, servicesContent.content, domain, targetUrl);
    if (result) {
      stack.push({
        platform: "Telegraph (Entity: Services)",
        url: result,
        title: servicesContent.title,
        linksTo: [targetUrl, ...(stack[0]?.url ? [stack[0].url] : [])],
        status: "created",
        createdAt: new Date(),
      });
    }
  } catch {}
  
  // Entity 3: FAQ page
  try {
    const faqContent = await generateEntityContent(
      "faq", brandName, domain, primaryKeyword, targetUrl, language
    );
    const result = await deployToTelegraph(faqContent.title, faqContent.content, domain, targetUrl);
    if (result) {
      const linksTo = [targetUrl];
      for (const item of stack) linksTo.push(item.url);
      stack.push({
        platform: "Telegraph (Entity: FAQ)",
        url: result,
        title: faqContent.title,
        linksTo,
        status: "created",
        createdAt: new Date(),
      });
    }
  } catch {}
  
  // Entity 4: Blog/News page for each keyword
  for (let i = 0; i < Math.min(keywords.length, 5); i++) {
    try {
      const blogContent = await generateEntityContent(
        "blog", brandName, domain, keywords[i], targetUrl, language
      );
      const result = await deployToTelegraph(blogContent.title, blogContent.content, domain, targetUrl);
      if (result) {
        const linksTo = [targetUrl];
        for (const item of stack) linksTo.push(item.url);
        stack.push({
          platform: `Telegraph (Entity: Blog - ${keywords[i]})`,
          url: result,
          title: blogContent.title,
          linksTo,
          status: "created",
          createdAt: new Date(),
        });
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch {}
  }
  
  // Create interlinking: update earlier pages to link to later ones
  // (Telegraph doesn't support editing, but the initial links are set up)
  
  // Rapid index all entity stack pages
  for (const item of stack) {
    await rapidIndexUrl({
      url: item.url,
      domain: "telegra.ph",
      keywords: [primaryKeyword],
      priority: "critical",
    }).catch(() => {});
  }
  
  console.log(`[EntityStack] Created ${stack.length} entity stack items for ${domain}`);
  return stack;
}

// ═══════════════════════════════════════════════
//  MASS CONTENT VELOCITY
// ═══════════════════════════════════════════════

/**
 * Generate and deploy mass content across platforms
 * Target: 10-50 unique articles per day across multiple platforms
 */
export async function executeContentVelocity(
  domain: string,
  keywords: string[],
  targetUrl: string,
  articlesPerKeyword: number = 5,
  language: string = "th"
): Promise<BlitzCampaign> {
  const campaign: BlitzCampaign = {
    domain,
    keywords,
    parasiteDeployments: [],
    entityStack: [],
    contentGenerated: 0,
    totalDeployed: 0,
    totalIndexed: 0,
    startedAt: new Date(),
  };
  
  console.log(`[ContentVelocity] Starting mass content deployment for ${domain}`);
  console.log(`[ContentVelocity] Keywords: ${keywords.length}, Articles/keyword: ${articlesPerKeyword}`);
  
  // Deploy Telegraph articles for each keyword
  for (const keyword of keywords) {
    const deployments = await deployTelegraphBlitz(
      keyword, targetUrl, domain, articlesPerKeyword, language
    );
    campaign.parasiteDeployments.push(...deployments);
    campaign.contentGenerated += articlesPerKeyword;
    campaign.totalDeployed += deployments.length;
  }
  
  // Create entity stack
  const entityStack = await createEntityStack(domain, domain, keywords, targetUrl, language);
  campaign.entityStack = entityStack;
  
  console.log(`[ContentVelocity] Campaign complete:
  - Content generated: ${campaign.contentGenerated}
  - Deployed: ${campaign.totalDeployed}
  - Entity stack: ${campaign.entityStack.length} items`);
  
  return campaign;
}

// ═══════════════════════════════════════════════
//  FULL PARASITE BLITZ
// ═══════════════════════════════════════════════

/**
 * Execute a full parasite SEO blitz — the main entry point
 * Deploys content across all available platforms simultaneously
 */
export async function executeParasiteBlitz(
  domain: string,
  keywords: string[],
  targetUrl: string,
  options: {
    telegraphCount?: number;
    createEntityStack?: boolean;
    language?: string;
    maxKeywords?: number;
  } = {}
): Promise<BlitzCampaign> {
  const {
    telegraphCount = 10,
    createEntityStack: doEntityStack = true,
    language = "th",
    maxKeywords = 10,
  } = options;
  
  const activeKeywords = keywords.slice(0, maxKeywords);
  
  console.log(`[ParasiteBlitz] Full blitz starting for ${domain}`);
  console.log(`[ParasiteBlitz] Keywords: ${activeKeywords.length}, Telegraph/keyword: ${telegraphCount}`);
  
  const campaign: BlitzCampaign = {
    domain,
    keywords: activeKeywords,
    parasiteDeployments: [],
    entityStack: [],
    contentGenerated: 0,
    totalDeployed: 0,
    totalIndexed: 0,
    startedAt: new Date(),
  };
  
  // Phase 1: Telegraph blitz (primary — no auth, instant, high DA)
  for (const keyword of activeKeywords) {
    const deployments = await deployTelegraphBlitz(
      keyword, targetUrl, domain, telegraphCount, language
    );
    campaign.parasiteDeployments.push(...deployments);
    campaign.totalDeployed += deployments.length;
    campaign.contentGenerated += telegraphCount;
  }
  
  // Phase 2: Entity stacking
  if (doEntityStack) {
    const stack = await createEntityStack(domain, domain, activeKeywords, targetUrl, language);
    campaign.entityStack = stack;
  }
  
  console.log(`[ParasiteBlitz] Blitz complete:
  - Parasites deployed: ${campaign.totalDeployed}
  - Entity stack items: ${campaign.entityStack.length}
  - Total content: ${campaign.contentGenerated}`);
  
  return campaign;
}

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

async function generateEntityContent(
  type: "about" | "services" | "faq" | "blog",
  brandName: string,
  domain: string,
  keyword: string,
  targetUrl: string,
  language: string
): Promise<{ title: string; content: string }> {
  const langName = language === "th" ? "Thai" : "English";
  const templates: Record<string, string> = {
    about: `Write an "About Us" page for ${brandName} (${domain}). Include information about ${keyword}. Link to ${targetUrl}. Write in ${langName}.`,
    services: `Write a "Services/Products" page for ${brandName} (${domain}). Focus on ${keyword}. Link to ${targetUrl}. Write in ${langName}.`,
    faq: `Write an FAQ page about ${keyword} for ${brandName} (${domain}). Include 10 common questions. Link to ${targetUrl}. Write in ${langName}.`,
    blog: `Write a blog post about "${keyword}" for ${brandName} (${domain}). Make it informative and SEO-optimized. Link to ${targetUrl}. Write in ${langName}.`,
  };
  
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an SEO content writer. Return JSON with title and content (HTML format)." },
        { role: "user", content: templates[type] + "\n\nReturn JSON: {title: string, content: string (HTML)}" },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "entity_content",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
            },
            required: ["title", "content"],
            additionalProperties: false,
          },
        },
      },
    });
    
    const raw = response.choices?.[0]?.message?.content;
    if (!raw) throw new Error("No content");
    return JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw));
  } catch {
    return {
      title: `${brandName} - ${type === "about" ? "About Us" : type === "services" ? "Services" : type === "faq" ? "FAQ" : keyword}`,
      content: `<p>${brandName} provides expert services related to ${keyword}. Visit <a href="${targetUrl}">${domain}</a> for more information.</p>`,
    };
  }
}

async function deployToTelegraph(title: string, content: string, domain: string, targetUrl: string): Promise<string | null> {
  try {
    const accountRes = await fetch("https://api.telegra.ph/createAccount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        short_name: `entity_${Date.now().toString(36)}`,
        author_name: domain.replace(/\.(com|net|org|io|ai)$/, ""),
        author_url: targetUrl,
      }),
      signal: AbortSignal.timeout(10000),
    });
    
    const accountData = await accountRes.json() as any;
    if (!accountData.ok) return null;
    
    const nodes = htmlToTelegraphNodes(content, targetUrl, domain);
    
    const pageRes = await fetch("https://api.telegra.ph/createPage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accountData.result.access_token,
        title,
        author_name: domain.replace(/\.(com|net|org|io|ai)$/, ""),
        author_url: targetUrl,
        content: nodes,
        return_content: false,
      }),
      signal: AbortSignal.timeout(10000),
    });
    
    const pageData = await pageRes.json() as any;
    if (pageData.ok) {
      // Track for freshness monitoring
      await trackContent({
        url: pageData.result.url,
        title,
        keyword: domain,
        platform: "telegraph",
        originalContent: content,
        domain,
        telegraphToken: accountData.result.access_token,
        telegraphPath: pageData.result.path,
        sourceEngine: "parasite-blitz",
      }).catch(() => {});
      return pageData.result.url;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Convert HTML content to Telegraph node format
 */
function htmlToTelegraphNodes(html: string, targetUrl: string, anchorText: string): any[] {
  // Simple HTML to Telegraph node conversion
  const nodes: any[] = [];
  
  // Split by paragraphs
  const paragraphs = html.split(/<\/?p>/gi).filter(p => p.trim());
  
  for (const para of paragraphs) {
    if (!para.trim()) continue;
    
    // Check for headers
    const h2Match = para.match(/<h2[^>]*>(.*?)<\/h2>/i);
    const h3Match = para.match(/<h3[^>]*>(.*?)<\/h3>/i);
    
    if (h2Match) {
      nodes.push({ tag: "h3", children: [h2Match[1]] });
    } else if (h3Match) {
      nodes.push({ tag: "h4", children: [h3Match[1]] });
    } else {
      // Regular paragraph — check for links
      const cleanText = para.replace(/<[^>]+>/g, "").trim();
      if (cleanText) {
        // Add link to target URL in some paragraphs
        if (nodes.length === 2 || nodes.length === 5) {
          nodes.push({
            tag: "p",
            children: [
              cleanText + " ",
              { tag: "a", attrs: { href: targetUrl }, children: [anchorText] },
            ],
          });
        } else {
          nodes.push({ tag: "p", children: [cleanText] });
        }
      }
    }
  }
  
  // Ensure at least one link to target
  if (!nodes.some(n => JSON.stringify(n).includes(targetUrl))) {
    nodes.push({
      tag: "p",
      children: [
        "Learn more: ",
        { tag: "a", attrs: { href: targetUrl }, children: [anchorText] },
      ],
    });
  }
  
  return nodes.length > 0 ? nodes : [{ tag: "p", children: ["Content about " + anchorText] }];
}
