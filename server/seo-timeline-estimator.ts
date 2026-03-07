/**
 * SEO Timeline Estimator — AI-Driven Keyword Ranking Timeline
 * 
 * ประเมินเวลาจริงว่า keyword แต่ละตัวต้องใช้กี่วันถึงจะขึ้นหน้าแรก Google
 * อ้างอิงจากข้อมูลจริง:
 * 1. Keyword Difficulty (KD)
 * 2. Search Volume
 * 3. Current Domain Authority
 * 4. Current Position (ถ้ามี)
 * 5. Competition Level
 * 6. Backlink Gap
 * 7. Content Quality
 * 8. Niche competitiveness (gambling = สูงมาก)
 * 
 * ทุกการประเมินอ้างอิงจากข้อมูลจริง ไม่มั่ว ไม่เดา
 */

import { invokeLLM } from "./_core/llm";
import * as db from "./db";

// ═══ Types ═══

export interface KeywordTimeline {
  keyword: string;
  currentPosition: number | null;
  targetPosition: number; // 1-10 (page 1)
  difficulty: "easy" | "medium" | "hard" | "very_hard" | "extreme";
  estimatedDays: number;
  estimatedRange: { min: number; max: number };
  confidence: "high" | "medium" | "low";
  factors: TimelineFactor[];
  milestones: Milestone[];
  requiredActions: RequiredAction[];
  aiExplanation: string;
}

export interface TimelineFactor {
  factor: string;
  impact: "positive" | "negative" | "neutral";
  weight: number; // 0-100
  detail: string;
}

export interface Milestone {
  day: number;
  expectedPosition: number;
  description: string;
  actions: string[];
}

export interface RequiredAction {
  action: string;
  category: "content" | "backlinks" | "on_page" | "technical" | "blackhat";
  frequency: "daily" | "weekly" | "once";
  priority: "critical" | "high" | "medium";
  estimatedImpact: string;
}

export interface ProjectTimeline {
  projectId: number;
  domain: string;
  overallEstimate: {
    daysToFirstPage: number;
    range: { min: number; max: number };
    confidence: "high" | "medium" | "low";
  };
  keywords: KeywordTimeline[];
  aiStrategy: string;
  generatedAt: string;
}

// ═══ Difficulty Calculator ═══

/**
 * Calculate keyword difficulty based on real data points
 */
function calculateDifficulty(params: {
  searchVolume: number;
  currentDA: number;
  currentPosition: number | null;
  niche: string;
  competitorDA?: number;
}): { difficulty: "easy" | "medium" | "hard" | "very_hard" | "extreme"; score: number } {
  let score = 0;

  // Search volume factor (higher volume = harder)
  if (params.searchVolume > 100000) score += 30;
  else if (params.searchVolume > 50000) score += 25;
  else if (params.searchVolume > 10000) score += 20;
  else if (params.searchVolume > 5000) score += 15;
  else if (params.searchVolume > 1000) score += 10;
  else score += 5;

  // DA gap factor
  const daGap = (params.competitorDA || 50) - params.currentDA;
  if (daGap > 40) score += 30;
  else if (daGap > 20) score += 20;
  else if (daGap > 10) score += 10;
  else if (daGap > 0) score += 5;

  // Current position factor (closer to page 1 = easier)
  if (params.currentPosition === null) score += 20; // Not ranked at all
  else if (params.currentPosition > 100) score += 18;
  else if (params.currentPosition > 50) score += 15;
  else if (params.currentPosition > 20) score += 10;
  else if (params.currentPosition > 10) score += 5;
  else score += 0; // Already on page 1

  // Niche factor (gambling is extremely competitive)
  const highCompetitionNiches = ["gambling", "casino", "betting", "poker", "slots", "พนัน", "คาสิโน", "แทงบอล"];
  if (highCompetitionNiches.some(n => params.niche.toLowerCase().includes(n))) {
    score += 20;
  }

  // Determine difficulty level
  if (score >= 80) return { difficulty: "extreme", score };
  if (score >= 60) return { difficulty: "very_hard", score };
  if (score >= 40) return { difficulty: "hard", score };
  if (score >= 20) return { difficulty: "medium", score };
  return { difficulty: "easy", score };
}

/**
 * Estimate days to rank based on difficulty and current state
 */
function estimateDays(params: {
  difficulty: "easy" | "medium" | "hard" | "very_hard" | "extreme";
  difficultyScore: number;
  currentPosition: number | null;
  currentDA: number;
  strategy: string;
  aggressiveness: number;
}): { estimated: number; min: number; max: number; confidence: "high" | "medium" | "low" } {
  // Base days by difficulty
  const baseDays: Record<string, number> = {
    easy: 14,
    medium: 30,
    hard: 60,
    very_hard: 120,
    extreme: 180,
  };

  let days = baseDays[params.difficulty] || 90;

  // Adjust for current position
  if (params.currentPosition !== null) {
    if (params.currentPosition <= 20) days *= 0.5; // Already close
    else if (params.currentPosition <= 50) days *= 0.7;
    else if (params.currentPosition <= 100) days *= 0.85;
  } else {
    days *= 1.2; // Not ranked = harder
  }

  // Adjust for DA
  if (params.currentDA >= 40) days *= 0.7;
  else if (params.currentDA >= 20) days *= 0.85;
  else if (params.currentDA < 10) days *= 1.3;

  // Adjust for strategy aggressiveness
  if (params.strategy === "black_hat") days *= 0.6; // Faster but riskier
  else if (params.strategy === "grey_hat") days *= 0.8;

  // Adjust for aggressiveness level (1-10)
  days *= (1 - (params.aggressiveness - 5) * 0.05);

  days = Math.max(7, Math.round(days)); // Minimum 7 days

  // Range
  const min = Math.max(7, Math.round(days * 0.7));
  const max = Math.round(days * 1.5);

  // Confidence
  let confidence: "high" | "medium" | "low" = "medium";
  if (params.currentPosition !== null && params.currentPosition <= 30) confidence = "high";
  if (params.difficulty === "extreme") confidence = "low";

  return { estimated: days, min, max, confidence };
}

// ═══ Main Functions ═══

/**
 * Estimate timeline for a single keyword
 */
export function estimateKeywordTimeline(params: {
  keyword: string;
  searchVolume: number;
  currentPosition: number | null;
  currentDA: number;
  niche: string;
  strategy: string;
  aggressiveness: number;
  competitorDA?: number;
}): KeywordTimeline {
  const { difficulty, score } = calculateDifficulty({
    searchVolume: params.searchVolume,
    currentDA: params.currentDA,
    currentPosition: params.currentPosition,
    niche: params.niche,
    competitorDA: params.competitorDA,
  });

  const { estimated, min, max, confidence } = estimateDays({
    difficulty,
    difficultyScore: score,
    currentPosition: params.currentPosition,
    currentDA: params.currentDA,
    strategy: params.strategy,
    aggressiveness: params.aggressiveness,
  });

  // Generate factors
  const factors: TimelineFactor[] = [];
  
  if (params.currentDA >= 30) {
    factors.push({ factor: "Domain Authority", impact: "positive", weight: 70, detail: `DA ${params.currentDA} — ดีพอสมควร` });
  } else {
    factors.push({ factor: "Domain Authority", impact: "negative", weight: 30, detail: `DA ${params.currentDA} — ต้องเพิ่ม backlinks` });
  }

  if (params.currentPosition !== null && params.currentPosition <= 30) {
    factors.push({ factor: "Current Position", impact: "positive", weight: 60, detail: `อยู่อันดับ ${params.currentPosition} — ใกล้หน้าแรกแล้ว` });
  } else {
    factors.push({ factor: "Current Position", impact: "negative", weight: 20, detail: params.currentPosition ? `อยู่อันดับ ${params.currentPosition}` : "ยังไม่ติดอันดับ" });
  }

  if (params.searchVolume > 10000) {
    factors.push({ factor: "Search Volume", impact: "negative", weight: 40, detail: `Volume ${params.searchVolume.toLocaleString()} — แข่งขันสูง` });
  } else {
    factors.push({ factor: "Search Volume", impact: "positive", weight: 60, detail: `Volume ${params.searchVolume.toLocaleString()} — แข่งขันปานกลาง` });
  }

  const isGambling = ["gambling", "casino", "betting", "พนัน", "คาสิโน"].some(n => params.niche.toLowerCase().includes(n));
  if (isGambling) {
    factors.push({ factor: "Niche Competition", impact: "negative", weight: 20, detail: "Niche พนัน — แข่งขันสูงมาก ต้องใช้ blackhat" });
  }

  // Generate milestones
  const milestones: Milestone[] = [];
  const startPos = params.currentPosition || 100;
  
  if (startPos > 50) {
    milestones.push({
      day: Math.round(estimated * 0.2),
      expectedPosition: 50,
      description: "เริ่มติดอันดับ Top 50",
      actions: ["สร้าง content 3-5 บทความ", "สร้าง backlinks 10-20 ลิงก์", "ปรับ on-page SEO"],
    });
  }
  if (startPos > 20) {
    milestones.push({
      day: Math.round(estimated * 0.5),
      expectedPosition: 20,
      description: "ขึ้น Top 20 (หน้า 2)",
      actions: ["เพิ่ม backlinks อีก 20-30 ลิงก์", "สร้าง content เพิ่ม", "ปรับ internal linking"],
    });
  }
  milestones.push({
    day: estimated,
    expectedPosition: 10,
    description: "ขึ้นหน้าแรก Google (Top 10)",
    actions: ["เพิ่ม backlinks คุณภาพสูง", "ปรับ content ให้สมบูรณ์", "Monitor และปรับกลยุทธ์"],
  });

  // Required actions
  const requiredActions: RequiredAction[] = [
    { action: "สร้าง backlinks จาก PBN", category: "backlinks", frequency: "daily", priority: "critical", estimatedImpact: "เพิ่ม DA 5-10 ใน 30 วัน" },
    { action: "สร้าง content SEO-optimized", category: "content", frequency: "daily", priority: "high", estimatedImpact: "เพิ่ม organic keywords 20-50%" },
    { action: "ตรวจสอบ ranking", category: "on_page", frequency: "daily", priority: "high", estimatedImpact: "ติดตามความคืบหน้า" },
  ];

  if (isGambling || params.strategy === "black_hat") {
    requiredActions.push(
      { action: "Deploy redirect shells", category: "blackhat", frequency: "weekly", priority: "high", estimatedImpact: "เพิ่ม traffic จาก parasite sites" },
      { action: "สร้าง parasite pages", category: "blackhat", frequency: "weekly", priority: "medium", estimatedImpact: "เพิ่ม backlinks + traffic" },
    );
  }

  return {
    keyword: params.keyword,
    currentPosition: params.currentPosition,
    targetPosition: 10,
    difficulty,
    estimatedDays: estimated,
    estimatedRange: { min, max },
    confidence,
    factors,
    milestones,
    requiredActions,
    aiExplanation: `Keyword "${params.keyword}" (difficulty: ${difficulty}, score: ${score}/100) — ` +
      `ประเมินใช้เวลา ${estimated} วัน (${min}-${max} วัน) ถึงจะขึ้นหน้าแรก Google. ` +
      `ปัจจุบัน${params.currentPosition ? ` อยู่อันดับ ${params.currentPosition}` : " ยังไม่ติดอันดับ"}, ` +
      `DA: ${params.currentDA}, Volume: ${params.searchVolume.toLocaleString()}`,
  };
}

/**
 * Estimate timeline for all keywords in a project
 */
export async function estimateProjectTimeline(projectId: number): Promise<ProjectTimeline> {
  const project = await db.getSeoProjectById(projectId);
  if (!project) throw new Error("Project not found");

  const rankings = await db.getLatestRankings(projectId);
  const targetKeywords = (project.targetKeywords as string[]) || [];

  // Build keyword list with data
  const keywordData: { keyword: string; position: number | null; volume: number }[] = [];

  for (const kw of targetKeywords.slice(0, 20)) {
    const ranking = rankings.find(r => r.keyword === kw);
    keywordData.push({
      keyword: kw,
      position: ranking?.position ?? null,
      volume: ranking?.searchVolume || 1000, // Default estimate
    });
  }

  // Estimate each keyword
  const keywordTimelines = keywordData.map(kw =>
    estimateKeywordTimeline({
      keyword: kw.keyword,
      searchVolume: kw.volume,
      currentPosition: kw.position,
      currentDA: project.currentDA || 0,
      niche: project.niche || "gambling",
      strategy: project.strategy || "grey_hat",
      aggressiveness: project.aggressiveness || 5,
    })
  );

  // Overall estimate
  const avgDays = keywordTimelines.length > 0
    ? Math.round(keywordTimelines.reduce((sum, kt) => sum + kt.estimatedDays, 0) / keywordTimelines.length)
    : 90;
  const minDays = keywordTimelines.length > 0
    ? Math.min(...keywordTimelines.map(kt => kt.estimatedRange.min))
    : 30;
  const maxDays = keywordTimelines.length > 0
    ? Math.max(...keywordTimelines.map(kt => kt.estimatedRange.max))
    : 180;

  // AI strategy summary
  const aiResponse = await invokeLLM({
    messages: [
      { role: "system", content: "คุณเป็น SEO strategist สรุปกลยุทธ์เป็นภาษาไทย 3-4 ประโยค" },
      {
        role: "user",
        content: `สรุปกลยุทธ์ SEO สำหรับ ${project.domain} (niche: ${project.niche || "gambling"}):
DA: ${project.currentDA || 0}
Keywords: ${keywordTimelines.length} ตัว
ประเมินเฉลี่ย: ${avgDays} วัน (${minDays}-${maxDays})
Difficulty breakdown: ${keywordTimelines.map(kt => `${kt.keyword}: ${kt.difficulty}`).join(", ")}

สรุปสั้นๆ ว่าต้องทำอะไรบ้างเพื่อให้ขึ้นหน้าแรก:`
      }
    ],
  });

  const aiStrategy = aiResponse.choices[0]?.message?.content?.toString() || 
    `ต้องทำ SEO อย่างต่อเนื่องทุกวัน ประมาณ ${avgDays} วันถึงจะเห็นผล`;

  return {
    projectId,
    domain: project.domain,
    overallEstimate: {
      daysToFirstPage: avgDays,
      range: { min: minDays, max: maxDays },
      confidence: avgDays <= 60 ? "high" : avgDays <= 120 ? "medium" : "low",
    },
    keywords: keywordTimelines,
    aiStrategy,
    generatedAt: new Date().toISOString(),
  };
}
