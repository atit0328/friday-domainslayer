/**
 * Gambling Keyword Intelligence Engine
 * 
 * AI-powered keyword discovery specifically for Thai gambling niche:
 *   1. Seed Database — 200+ core Thai gambling keywords across all categories
 *   2. AI Expansion — LLM generates long-tail, seasonal, trending, brand keywords
 *   3. Keyword Scoring — Estimate search volume, competition, CPC, conversion potential
 *   4. Keyword Clustering — Group by intent (transactional, informational, navigational)
 *   5. Priority Ranking — Which keywords to target first for maximum ROI
 *   6. Auto-Refresh — Periodically discover new trending keywords via SERP analysis
 *   7. Competitor Analysis — Find what keywords competitors are ranking for
 * 
 * Integrates with:
 *   - keyword-target-discovery.ts (seeds keywords into serp_keywords table)
 *   - serp-api.ts (SERP data for keyword analysis)
 *   - master-orchestrator.ts (autonomous scheduling)
 */
import { getDb } from "./db";
import { serpKeywords } from "../drizzle/schema";
import { eq, sql, and, like, desc, inArray } from "drizzle-orm";
import { invokeLLMWithFallback } from "./llm-fallback";
import { searchGoogle, type SerpData } from "./serp-api";

// ═══════════════════════════════════════════════════════
//  GAMBLING KEYWORD SEED DATABASE (200+ keywords)
// ═══════════════════════════════════════════════════════

export const GAMBLING_KEYWORD_SEEDS: Record<string, string[]> = {
  // ─── คาสิโนออนไลน์ (Online Casino) ───
  casino: [
    "คาสิโนออนไลน์", "คาสิโน", "casino online", "คาสิโนสด", "คาสิโนออนไลน์เว็บตรง",
    "คาสิโนออนไลน์ได้เงินจริง", "เว็บคาสิโน", "คาสิโนออนไลน์อันดับ1", "คาสิโนออนไลน์2024",
    "คาสิโนออนไลน์เว็บตรงไม่ผ่านเอเย่นต์", "เว็บคาสิโนออนไลน์อันดับ1", "คาสิโนเว็บตรง",
    "sa casino", "sexy casino", "dream gaming", "wm casino", "ae casino",
    "เว็บคาสิโนที่ดีที่สุด", "คาสิโนออนไลน์ฟรีเครดิต", "คาสิโนสดออนไลน์",
  ],

  // ─── สล็อตออนไลน์ (Online Slots) ───
  slots: [
    "สล็อต", "สล็อตออนไลน์", "slot online", "สล็อตเว็บตรง", "สล็อตแตกง่าย",
    "สล็อตเว็บตรงไม่ผ่านเอเย่นต์", "สล็อตpg", "สล็อตxo", "สล็อต joker",
    "สล็อตแตกง่ายได้เงินจริง", "สล็อตฟรีเครดิต", "สล็อตทดลองเล่น", "สล็อตเว็บตรง100",
    "pg slot", "pgslot", "joker slot", "slotxo", "superslot", "jili slot",
    "สล็อต777", "สล็อต888", "สล็อตเว็บตรงแตกหนัก", "สล็อตออนไลน์มือถือ",
    "สล็อตแตกง่ายล่าสุด", "สล็อตเว็บใหญ่", "สล็อตค่ายใหญ่", "ทดลองเล่นสล็อต",
    "สล็อตเว็บตรงไม่มีขั้นต่ำ", "สล็อตวอเลท", "สล็อตฝากถอนไม่มีขั้นต่ำ",
    "สล็อตpgเว็บตรง", "สล็อตแตกง่ายวันนี้", "เว็บสล็อตใหม่ล่าสุด",
  ],

  // ─── แทงบอลออนไลน์ (Online Betting) ───
  betting: [
    "แทงบอล", "แทงบอลออนไลน์", "เว็บแทงบอล", "พนันบอล", "เว็บบอล",
    "แทงบอลเว็บตรง", "เว็บแทงบอลที่ดีที่สุด", "แทงบอลออนไลน์เว็บตรง",
    "ราคาบอล", "ราคาบอลไหล", "ราคาบอลวันนี้", "ผลบอลสด", "บอลสด",
    "วิเคราะห์บอล", "วิเคราะห์บอลวันนี้", "ทีเด็ดบอล", "ทีเด็ดบอลวันนี้",
    "บอลเต็ง", "บอลชุด", "บอลสเต็ป", "แทงบอลขั้นต่ำ10บาท",
    "เว็บบอลที่ดีที่สุด", "เว็บบอลเว็บตรง", "แทงบอลสด", "แทงบอลฟรี",
    "sbobet", "ufabet", "ufabet แทงบอล", "sbobet แทงบอล",
  ],

  // ─── บาคาร่า (Baccarat) ───
  baccarat: [
    "บาคาร่า", "บาคาร่าออนไลน์", "baccarat", "บาคาร่าเว็บตรง", "บาคาร่าสด",
    "บาคาร่าออนไลน์เว็บตรง", "เว็บบาคาร่า", "บาคาร่าฟรีเครดิต",
    "สูตรบาคาร่า", "สูตรบาคาร่าฟรี", "สูตรบาคาร่าai", "สูตรบาคาร่า2024",
    "บาคาร่าออนไลน์ได้เงินจริง", "บาคาร่าขั้นต่ำ10บาท", "บาคาร่าทดลองเล่น",
    "sa baccarat", "sexy baccarat", "บาคาร่า sa", "บาคาร่า888",
  ],

  // ─── เว็บพนันออนไลน์ (Online Gambling Sites) ───
  gambling_sites: [
    "เว็บพนัน", "เว็บพนันออนไลน์", "เว็บพนันเว็บตรง", "พนันออนไลน์",
    "เว็บพนันที่ดีที่สุด", "เว็บพนันออนไลน์เว็บตรง", "เว็บพนันออนไลน์อันดับ1",
    "เว็บพนันฟรีเครดิต", "เว็บพนันไม่ผ่านเอเย่นต์", "เว็บพนันออนไลน์ได้เงินจริง",
    "เว็บพนันถูกกฎหมาย", "เว็บพนันต่างประเทศ", "เว็บพนันออนไลน์ฟรีเครดิต",
  ],

  // ─── UFABET & Major Brands ───
  brands: [
    "ufabet", "ufabet เข้าสู่ระบบ", "ufabet168", "ufabet เว็บตรง", "ufabet สมัคร",
    "ufabet888", "ufabet ทางเข้า", "ufabet มือถือ", "ufabet เว็บแม่",
    "sbobet", "sbobet เข้าสู่ระบบ", "sbobet ทางเข้า", "sbobet มือถือ",
    "betflik", "betflik68", "betflik เว็บตรง", "betflix", "betflik สมัคร",
    "fun88", "fun88 ทางเข้า", "w88", "w88 ทางเข้า",
    "lsm99", "lsm99 ทางเข้า", "gclub", "gclub ทางเข้า",
    "sagame", "sagame66", "sagame1688", "sa gaming",
    "joker123", "joker gaming", "joker สล็อต",
    "ambbet", "ambbet เว็บตรง", "amb สล็อต",
  ],

  // ─── ฟรีเครดิต & โปรโมชั่น (Free Credit & Promotions) ───
  promotions: [
    "ฟรีเครดิต", "ฟรีเครดิต50", "ฟรีเครดิต100", "ฟรีเครดิตไม่ต้องฝาก",
    "ฟรีเครดิตไม่ต้องฝากไม่ต้องแชร์", "ฟรีเครดิตกดรับเอง", "ฟรีเครดิตล่าสุด",
    "โปรสล็อต", "โปรสมาชิกใหม่", "โบนัส100", "โปรฝาก10รับ100",
    "โปรฝาก1รับ50", "โปรฝาก20รับ100", "โปรฝาก50รับ100",
    "สมัครรับเครดิตฟรี", "เครดิตฟรี50ไม่ต้องฝากไม่ต้องแชร์",
    "ฟรีเครดิต2024", "ฟรีเครดิตทดลองเล่น",
  ],

  // ─── รูเล็ต & เกมโต๊ะ (Roulette & Table Games) ───
  table_games: [
    "รูเล็ต", "รูเล็ตออนไลน์", "roulette", "ไฮโล", "ไฮโลออนไลน์",
    "เสือมังกร", "เสือมังกรออนไลน์", "ป๊อกเด้ง", "ป๊อกเด้งออนไลน์",
    "ไพ่เสือมังกร", "แบล็คแจ็ค", "blackjack", "poker", "โป๊กเกอร์",
    "เกมไพ่", "เกมไพ่ออนไลน์", "ไพ่ออนไลน์",
  ],

  // ─── มวย & กีฬาอื่น (Boxing & Other Sports) ───
  sports: [
    "แทงมวย", "แทงมวยออนไลน์", "มวยออนไลน์", "พนันมวย",
    "แทงบาส", "แทงบาสออนไลน์", "แทงเทนนิส", "แทงอีสปอร์ต",
    "esport betting", "แทงอีสปอร์ตออนไลน์", "แทงหวยออนไลน์",
  ],

  // ─── ฝาก-ถอน (Deposit & Withdrawal) ───
  transactions: [
    "ฝากถอนไม่มีขั้นต่ำ", "ฝากถอนออโต้", "ฝาก10รับ100", "ฝาก1รับ50",
    "ฝากถอนวอเลท", "ฝากถอนtruewallet", "ฝากผ่านวอเลท", "ถอนเงินไม่มีขั้นต่ำ",
    "ฝากขั้นต่ำ1บาท", "เว็บตรงฝากถอนไม่มีขั้นต่ำ", "ฝากถอนไม่มีขั้นต่ำวอเลท",
    "ฝากถอนออโต้ไม่มีขั้นต่ำ", "สล็อตฝากถอนtrue wallet ไม่มีขั้นต่ำ",
  ],

  // ─── เว็บตรง (Direct Sites) ───
  direct_sites: [
    "เว็บตรง", "เว็บตรงไม่ผ่านเอเย่นต์", "เว็บตรง100", "เว็บตรงจากต่างประเทศ",
    "เว็บตรงสล็อต", "เว็บตรงบาคาร่า", "เว็บตรงคาสิโน", "เว็บตรงแทงบอล",
    "เว็บตรงไม่มีขั้นต่ำ", "เว็บตรงอันดับ1", "เว็บตรงมาแรง",
  ],
};

// Flatten all seeds for easy access
export function getAllGamblingKeywords(): string[] {
  return Object.values(GAMBLING_KEYWORD_SEEDS).flat();
}

export function getGamblingKeywordsByCategory(category: string): string[] {
  return GAMBLING_KEYWORD_SEEDS[category] || [];
}

export function getGamblingCategories(): string[] {
  return Object.keys(GAMBLING_KEYWORD_SEEDS);
}

// ═══════════════════════════════════════════════════════
//  KEYWORD SCORING
// ═══════════════════════════════════════════════════════

export interface KeywordScore {
  keyword: string;
  category: string;
  searchVolumeEstimate: "very_high" | "high" | "medium" | "low";
  competitionLevel: "extreme" | "high" | "medium" | "low";
  conversionPotential: "very_high" | "high" | "medium" | "low";
  cpcEstimate: "very_high" | "high" | "medium" | "low";
  priorityScore: number; // 0-100
  intent: "transactional" | "informational" | "navigational" | "commercial";
  reasoning: string;
}

export interface KeywordExpansionResult {
  newKeywords: Array<{
    keyword: string;
    category: string;
    intent: string;
    reasoning: string;
  }>;
  trendingKeywords: string[];
  competitorKeywords: string[];
}

// ─── AI Keyword Scoring ───
export async function scoreKeywords(keywords: string[]): Promise<KeywordScore[]> {
  if (keywords.length === 0) return [];
  
  // Process in batches of 30
  const batchSize = 30;
  const allScores: KeywordScore[] = [];
  
  for (let i = 0; i < keywords.length; i += batchSize) {
    const batch = keywords.slice(i, i + batchSize);
    
    try {
      const response = await invokeLLMWithFallback({
        messages: [
          {
            role: "system",
            content: `คุณเป็นผู้เชี่ยวชาญ SEO สำหรับอุตสาหกรรมพนันออนไลน์ในประเทศไทย
คุณมีความรู้ลึกเกี่ยวกับ search volume, competition, CPC ของ keywords กลุ่มพนัน
วิเคราะห์ keywords ต่อไปนี้และให้คะแนนตามเกณฑ์ที่กำหนด`
          },
          {
            role: "user",
            content: `วิเคราะห์ keywords เหล่านี้สำหรับ SEO พนันออนไลน์ไทย:
${batch.map((k, idx) => `${idx + 1}. ${k}`).join("\n")}

ให้คะแนนแต่ละ keyword:
- searchVolumeEstimate: very_high (100k+), high (10k-100k), medium (1k-10k), low (<1k)
- competitionLevel: extreme, high, medium, low
- conversionPotential: very_high (ลงทะเบียน/ฝากเงิน), high (สนใจสมัคร), medium (เปรียบเทียบ), low (แค่อ่าน)
- cpcEstimate: very_high ($5+), high ($2-5), medium ($0.5-2), low (<$0.5)
- intent: transactional (พร้อมสมัคร/ฝาก), commercial (เปรียบเทียบเว็บ), informational (หาข้อมูล), navigational (หาเว็บเฉพาะ)
- priorityScore: 0-100 (ยิ่งสูงยิ่งควรทำก่อน — คำนวณจาก volume × conversion × (1/competition))
- reasoning: เหตุผลสั้นๆ

ตอบเป็น JSON array`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "keyword_scores",
            strict: true,
            schema: {
              type: "object",
              properties: {
                scores: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      keyword: { type: "string" },
                      category: { type: "string" },
                      searchVolumeEstimate: { type: "string", enum: ["very_high", "high", "medium", "low"] },
                      competitionLevel: { type: "string", enum: ["extreme", "high", "medium", "low"] },
                      conversionPotential: { type: "string", enum: ["very_high", "high", "medium", "low"] },
                      cpcEstimate: { type: "string", enum: ["very_high", "high", "medium", "low"] },
                      priorityScore: { type: "number" },
                      intent: { type: "string", enum: ["transactional", "informational", "navigational", "commercial"] },
                      reasoning: { type: "string" },
                    },
                    required: ["keyword", "category", "searchVolumeEstimate", "competitionLevel", "conversionPotential", "cpcEstimate", "priorityScore", "intent", "reasoning"],
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
      // Fallback: assign default scores
      for (const kw of batch) {
        allScores.push({
          keyword: kw,
          category: detectCategory(kw),
          searchVolumeEstimate: "medium",
          competitionLevel: "high",
          conversionPotential: "medium",
          cpcEstimate: "medium",
          priorityScore: 50,
          intent: "transactional",
          reasoning: "Default score (LLM unavailable)",
        });
      }
    }
  }
  
  return allScores;
}

// ─── AI Keyword Expansion ───
export async function expandKeywords(existingKeywords: string[], maxNew: number = 50): Promise<KeywordExpansionResult> {
  try {
    const sampleKeywords = existingKeywords.slice(0, 50).join(", ");
    
    const response = await invokeLLMWithFallback({
      messages: [
        {
          role: "system",
          content: `คุณเป็นผู้เชี่ยวชาญ SEO สำหรับพนันออนไลน์ไทย
งานของคุณคือค้นหา keywords ใหม่ที่ยังไม่มีในระบบ
เน้น keywords ที่:
1. Long-tail keywords ที่มี competition ต่ำแต่ conversion สูง
2. Keywords ตามฤดูกาล (เช่น ช่วงฟุตบอลโลก, ยูโร, พรีเมียร์ลีก)
3. Keywords ใหม่ที่กำลัง trending
4. Keywords ของคู่แข่ง (ชื่อเว็บพนันต่างๆ)
5. Keywords ที่มี commercial intent สูง (พร้อมสมัคร/ฝากเงิน)`
        },
        {
          role: "user",
          content: `Keywords ที่มีอยู่แล้ว: ${sampleKeywords}

สร้าง keywords ใหม่ ${maxNew} คำ ที่ยังไม่มีในระบบ
แบ่งเป็น:
1. newKeywords: keywords ใหม่พร้อม category และ intent
2. trendingKeywords: keywords ที่กำลัง trending ตอนนี้
3. competitorKeywords: ชื่อเว็บพนันคู่แข่ง + variations`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "keyword_expansion",
          strict: true,
          schema: {
            type: "object",
            properties: {
              newKeywords: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    keyword: { type: "string" },
                    category: { type: "string" },
                    intent: { type: "string" },
                    reasoning: { type: "string" },
                  },
                  required: ["keyword", "category", "intent", "reasoning"],
                  additionalProperties: false,
                },
              },
              trendingKeywords: { type: "array", items: { type: "string" } },
              competitorKeywords: { type: "array", items: { type: "string" } },
            },
            required: ["newKeywords", "trendingKeywords", "competitorKeywords"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      return JSON.parse(content);
    }
  } catch (e) {
    console.error("[GamblingKeywordIntel] Expansion failed:", e);
  }
  
  return { newKeywords: [], trendingKeywords: [], competitorKeywords: [] };
}

// ─── SERP-based Keyword Discovery ───
export async function discoverKeywordsFromSerp(seedKeyword: string): Promise<string[]> {
  try {
    const results = await searchGoogle(seedKeyword, { gl: "th", hl: "th", num: 100 });
    if (!results?.results) return [];
    
    const discoveredKeywords: Set<string> = new Set();
    
    // Extract keywords from titles and snippets
    for (const result of results.results) {
      if (result.title) {
        // Extract Thai gambling-related terms from titles
        const thaiTerms = extractGamblingTerms(result.title);
        thaiTerms.forEach(t => discoveredKeywords.add(t));
      }
      if (result.snippet) {
        const snippetTerms = extractGamblingTerms(result.snippet);
        snippetTerms.forEach(t => discoveredKeywords.add(t));
      }
    }
    
    // Extract from "related searches"
    if (results.relatedSearches) {
      for (const rs of results.relatedSearches) {
        if (isGamblingRelated(rs)) {
          discoveredKeywords.add(rs);
        }
      }
    }
    
    return Array.from(discoveredKeywords);
  } catch (e) {
    console.error("[GamblingKeywordIntel] SERP discovery failed:", e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════
//  DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════

export async function seedGamblingKeywords(): Promise<{ added: number; existing: number; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const allKeywords = getAllGamblingKeywords();
  let added = 0;
  let existing = 0;
  
  for (const keyword of allKeywords) {
    const category = detectCategory(keyword);
    try {
      // Check if already exists
      const [exists] = await db.select({ id: serpKeywords.id })
        .from(serpKeywords)
        .where(eq(serpKeywords.keyword, keyword))
        .limit(1);
      
      if (exists) {
        existing++;
        continue;
      }
      
      await db.insert(serpKeywords).values({
        keyword,
        category: `gambling_${category}`,
        language: "th",
        country: "th",
        isActive: true,
      });
      added++;
    } catch (e) {
      // Duplicate key or other error — skip
      existing++;
    }
  }
  
  return { added, existing, total: allKeywords.length };
}

export async function addExpandedKeywords(keywords: Array<{ keyword: string; category: string }>): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  let added = 0;
  for (const kw of keywords) {
    try {
      const [exists] = await db.select({ id: serpKeywords.id })
        .from(serpKeywords)
        .where(eq(serpKeywords.keyword, kw.keyword))
        .limit(1);
      
      if (!exists) {
        await db.insert(serpKeywords).values({
          keyword: kw.keyword,
          category: `gambling_${kw.category}`,
          language: "th",
          country: "th",
          isActive: true,
        });
        added++;
      }
    } catch (e) {
      // Skip duplicates
    }
  }
  
  return added;
}

export async function getGamblingKeywordStats(): Promise<{
  totalKeywords: number;
  byCategory: Record<string, number>;
  activeKeywords: number;
  searchedKeywords: number;
  targetsFound: number;
}> {
  const db = await getDb();
  if (!db) return { totalKeywords: 0, byCategory: {}, activeKeywords: 0, searchedKeywords: 0, targetsFound: 0 };
  
  const allGambling = await db.select({
    category: serpKeywords.category,
    isActive: serpKeywords.isActive,
    lastSearchedAt: serpKeywords.lastSearchedAt,
    totalTargetsFound: serpKeywords.totalTargetsFound,
  })
    .from(serpKeywords)
    .where(like(serpKeywords.category, "gambling_%"));
  
  const byCategory: Record<string, number> = {};
  let activeCount = 0;
  let searchedCount = 0;
  let totalTargets = 0;
  
  for (const kw of allGambling) {
    const cat = kw.category?.replace("gambling_", "") || "unknown";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    if (kw.isActive) activeCount++;
    if (kw.lastSearchedAt) searchedCount++;
    totalTargets += kw.totalTargetsFound || 0;
  }
  
  return {
    totalKeywords: allGambling.length,
    byCategory,
    activeKeywords: activeCount,
    searchedKeywords: searchedCount,
    targetsFound: totalTargets,
  };
}

// ═══════════════════════════════════════════════════════
//  FULL INTELLIGENCE CYCLE
// ═══════════════════════════════════════════════════════

export interface IntelligenceCycleResult {
  seeded: { added: number; existing: number };
  expanded: { newKeywords: number; trending: number; competitor: number };
  scored: number;
  serpDiscovered: number;
  totalGamblingKeywords: number;
  duration: number;
}

export async function runFullIntelligenceCycle(): Promise<IntelligenceCycleResult> {
  const startTime = Date.now();
  
  // Step 1: Seed gambling keywords
  const seeded = await seedGamblingKeywords();
  
  // Step 2: Get existing keywords for expansion
  const db = await getDb();
  let existingKeywords: string[] = [];
  if (db) {
    const rows = await db.select({ keyword: serpKeywords.keyword })
      .from(serpKeywords)
      .where(like(serpKeywords.category, "gambling_%"))
      .limit(200);
    existingKeywords = rows.map(r => r.keyword);
  }
  
  // Step 3: AI-expand keywords
  const expansion = await expandKeywords(existingKeywords, 30);
  let expandedCount = 0;
  if (expansion.newKeywords.length > 0) {
    expandedCount = await addExpandedKeywords(
      expansion.newKeywords.map(k => ({ keyword: k.keyword, category: k.category }))
    );
  }
  // Also add trending and competitor keywords
  const trendingAdded = await addExpandedKeywords(
    expansion.trendingKeywords.map(k => ({ keyword: k, category: "trending" }))
  );
  const competitorAdded = await addExpandedKeywords(
    expansion.competitorKeywords.map(k => ({ keyword: k, category: "competitor" }))
  );
  
  // Step 4: SERP-based discovery for top priority keywords
  let serpDiscovered = 0;
  const topSeeds = ["สล็อตเว็บตรง", "คาสิโนออนไลน์", "แทงบอลออนไลน์", "บาคาร่าเว็บตรง", "ufabet"];
  for (const seed of topSeeds.slice(0, 3)) {
    try {
      const newKws = await discoverKeywordsFromSerp(seed);
      const added = await addExpandedKeywords(
        newKws.map(k => ({ keyword: k, category: "serp_discovered" }))
      );
      serpDiscovered += added;
    } catch (e) {
      // Skip on error
    }
  }
  
  // Step 5: Score a sample of keywords
  const unscoredSample = existingKeywords.slice(0, 30);
  let scoredCount = 0;
  if (unscoredSample.length > 0) {
    const scores = await scoreKeywords(unscoredSample);
    scoredCount = scores.length;
  }
  
  // Get final stats
  const stats = await getGamblingKeywordStats();
  
  return {
    seeded,
    expanded: {
      newKeywords: expandedCount,
      trending: trendingAdded,
      competitor: competitorAdded,
    },
    scored: scoredCount,
    serpDiscovered,
    totalGamblingKeywords: stats.totalKeywords,
    duration: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function detectCategory(keyword: string): string {
  const kw = keyword.toLowerCase();
  for (const [cat, keywords] of Object.entries(GAMBLING_KEYWORD_SEEDS)) {
    if (keywords.some(k => k.toLowerCase() === kw)) return cat;
  }
  // Heuristic detection
  if (/สล็อต|slot|pg.*slot|joker.*slot|slotxo/i.test(kw)) return "slots";
  if (/คาสิโน|casino/i.test(kw)) return "casino";
  if (/บาคาร่า|baccarat/i.test(kw)) return "baccarat";
  if (/แทงบอล|บอล|sbobet|ราคาบอล|วิเคราะห์บอล/i.test(kw)) return "betting";
  if (/ufabet|betflik|fun88|w88|lsm99|gclub|sagame|ambbet/i.test(kw)) return "brands";
  if (/ฟรีเครดิต|โปร|โบนัส|เครดิตฟรี/i.test(kw)) return "promotions";
  if (/เว็บพนัน|พนันออนไลน์/i.test(kw)) return "gambling_sites";
  if (/ฝาก|ถอน|วอเลท|wallet/i.test(kw)) return "transactions";
  if (/เว็บตรง/i.test(kw)) return "direct_sites";
  if (/รูเล็ต|ไฮโล|เสือมังกร|ป๊อกเด้ง|แบล็คแจ็ค|poker/i.test(kw)) return "table_games";
  if (/มวย|บาส|เทนนิส|esport/i.test(kw)) return "sports";
  return "other";
}

function extractGamblingTerms(text: string): string[] {
  const terms: string[] = [];
  const patterns = [
    /(?:สล็อต|คาสิโน|บาคาร่า|แทงบอล|เว็บพนัน|ufabet|sbobet|pg\s*slot|joker|betflik)[^\s,.]*/gi,
    /(?:ฟรีเครดิต|เว็บตรง|ฝากถอน)[^\s,.]*/gi,
  ];
  
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      terms.push(...matches.map(m => m.trim()).filter(m => m.length > 3));
    }
  }
  
  return terms;
}

function isGamblingRelated(text: string): boolean {
  const gamblingTerms = [
    "สล็อต", "คาสิโน", "บาคาร่า", "แทงบอล", "เว็บพนัน", "พนัน",
    "ufabet", "sbobet", "betflik", "slot", "casino", "baccarat",
    "ฟรีเครดิต", "เว็บตรง", "ฝากถอน", "แทงหวย", "ไฮโล", "รูเล็ต",
    "pg slot", "joker", "sagame", "gclub", "betting",
  ];
  const lower = text.toLowerCase();
  return gamblingTerms.some(term => lower.includes(term.toLowerCase()));
}
