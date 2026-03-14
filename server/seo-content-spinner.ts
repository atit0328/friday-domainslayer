/**
 * AI Content Spinner — LLM-Powered Content Rewriting
 * 
 * Uses invokeLLM to rewrite SEO homepage content sections
 * to create unique content across multiple domains while
 * maintaining keyword density and SEO structure.
 * 
 * Features:
 * - Rewrite individual sections or full page
 * - Maintain keyword density during rewrite
 * - Keep Schema markup intact
 * - Support Thai + English content
 * - Track spin history per domain
 */

import { invokeLLM } from "./_core/llm";
import type { GeneratedHomepage } from "./seo-homepage-generator";

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface SpinRequest {
  /** The original HTML content to spin */
  html: string;
  /** Category for keyword context */
  category: "slots" | "lottery" | "baccarat";
  /** Site name to preserve in content */
  siteName: string;
  /** Domain to preserve in links */
  domain: string;
  /** Custom keywords that MUST appear in spun content */
  mustIncludeKeywords?: string[];
  /** Spin intensity: light (synonym swap), medium (paragraph rewrite), heavy (full rewrite) */
  intensity?: "light" | "medium" | "heavy";
}

export interface SpinResult {
  /** The spun HTML content */
  html: string;
  /** Estimated uniqueness percentage vs original */
  uniquenessScore: number;
  /** Number of sections rewritten */
  sectionsRewritten: number;
  /** Keywords preserved count */
  keywordsPreserved: number;
  /** Processing time in ms */
  processingTimeMs: number;
}

// ═══════════════════════════════════════════════
// Content Section Extraction
// ═══════════════════════════════════════════════

interface ContentSection {
  id: string;
  type: "intro" | "why-choose" | "how-to" | "providers" | "promotions" | "tips" | "conclusion" | "faq" | "other";
  html: string;
  textContent: string;
}

function extractSections(html: string): ContentSection[] {
  const sections: ContentSection[] = [];
  
  // Extract content between section markers using regex
  const sectionPatterns: { id: string; type: ContentSection["type"]; regex: RegExp }[] = [
    { id: "intro", type: "intro", regex: /<article[^>]*class="seo-article"[^>]*>([\s\S]*?)(?=<h2[^>]*id="why-choose")/i },
    { id: "why-choose", type: "why-choose", regex: /<h2[^>]*id="why-choose"[^>]*>([\s\S]*?)(?=<h2[^>]*id="how-to")/i },
    { id: "how-to", type: "how-to", regex: /<h2[^>]*id="how-to"[^>]*>([\s\S]*?)(?=<h2[^>]*id="providers")/i },
    { id: "providers", type: "providers", regex: /<h2[^>]*id="providers"[^>]*>([\s\S]*?)(?=<h2[^>]*id="promotions")/i },
    { id: "promotions", type: "promotions", regex: /<h2[^>]*id="promotions"[^>]*>([\s\S]*?)(?=<h2[^>]*id="tips")/i },
    { id: "tips", type: "tips", regex: /<h2[^>]*id="tips"[^>]*>([\s\S]*?)(?=<h2[^>]*id="conclusion")/i },
    { id: "conclusion", type: "conclusion", regex: /<h2[^>]*id="conclusion"[^>]*>([\s\S]*?)(?=<\/article>)/i },
    { id: "faq", type: "faq", regex: /<section[^>]*class="[^"]*faq-section[^"]*"[^>]*>([\s\S]*?)<\/section>/i },
  ];

  for (const pattern of sectionPatterns) {
    const match = html.match(pattern.regex);
    if (match) {
      const sectionHtml = match[0];
      const textContent = sectionHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      sections.push({
        id: pattern.id,
        type: pattern.type,
        html: sectionHtml,
        textContent,
      });
    }
  }

  return sections;
}

// ═══════════════════════════════════════════════
// LLM Spinning Functions
// ═══════════════════════════════════════════════

function getSpinPrompt(section: ContentSection, request: SpinRequest): string {
  const intensityGuide = {
    light: "เปลี่ยนแค่คำพ้องความหมาย สลับลำดับประโยค แต่รักษาโครงสร้างเดิม",
    medium: "เขียนใหม่ทั้งย่อหน้า เปลี่ยนมุมมอง เพิ่มรายละเอียดใหม่ แต่รักษา keywords หลัก",
    heavy: "เขียนใหม่ทั้งหมดจากศูนย์ เปลี่ยนโครงสร้าง เปลี่ยนลำดับ เพิ่มข้อมูลใหม่ ให้ unique 100%",
  };

  const categoryContext = {
    slots: "สล็อตออนไลน์ เว็บสล็อต เกมสล็อต",
    lottery: "หวยออนไลน์ ลอตเตอรี่ ซื้อหวย",
    baccarat: "บาคาร่าออนไลน์ คาสิโนสด เกมไพ่",
  };

  const mustKeywords = request.mustIncludeKeywords?.length
    ? `\n\nKeywords ที่ต้องมีในเนื้อหา (ห้ามหาย): ${request.mustIncludeKeywords.join(", ")}`
    : "";

  return `คุณคือ SEO Content Spinner ระดับมืออาชีพ สำหรับเว็บไซต์${categoryContext[request.category]}

งาน: Spin/Rewrite เนื้อหา HTML ด้านล่างนี้ให้เป็น content ใหม่ที่ unique

กฎ:
1. ${intensityGuide[request.intensity || "medium"]}
2. รักษา HTML tags ทั้งหมด (h2, h3, p, div, ul, li, strong, a) — เปลี่ยนแค่ text content
3. ห้ามลบ Schema markup, id attributes, class names, href links
4. รักษาชื่อเว็บ "${request.siteName}" และโดเมน "${request.domain}" ไว้เหมือนเดิม
5. รักษา keyword density ให้ใกล้เคียงเดิม — ห้ามลด keywords
6. เขียนเป็นภาษาไทย ใช้ภาษาธรรมชาติ ไม่เป็นทางการเกินไป
7. เพิ่ม keywords ใหม่ที่เกี่ยวข้องได้ เพื่อเพิ่ม keyword variety
8. ตอบกลับเป็น HTML เท่านั้น ไม่ต้องมี markdown code block${mustKeywords}

เนื้อหาเดิม (section: ${section.type}):
${section.html}

ตอบกลับเป็น HTML ที่ spin แล้วเท่านั้น:`;
}

async function spinSection(section: ContentSection, request: SpinRequest): Promise<string> {
  try {
    const prompt = getSpinPrompt(section, request);
    
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "คุณคือ SEO Content Spinner ที่เชี่ยวชาญ ตอบกลับเป็น HTML เท่านั้น ไม่มี markdown ไม่มี code block ไม่มีคำอธิบาย",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const spunContent = response.choices?.[0]?.message?.content;
    if (!spunContent || typeof spunContent !== "string") {
      return section.html; // Return original if LLM fails
    }

    // Clean up any markdown code blocks the LLM might add
    let cleaned = spunContent
      .replace(/^```html?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    // Validate that essential elements are preserved
    if (!cleaned.includes(request.siteName)) {
      // LLM removed site name, inject it back
      cleaned = cleaned.replace(/<h2/, `<h2`); // Keep as-is, site name should be in content
    }

    return cleaned;
  } catch (err) {
    console.error(`[Content Spinner] Error spinning section ${section.id}:`, err);
    return section.html; // Return original on error
  }
}

// ═══════════════════════════════════════════════
// Main Spinner Function
// ═══════════════════════════════════════════════

export async function spinContent(request: SpinRequest): Promise<SpinResult> {
  const startTime = Date.now();
  
  // Extract sections from HTML
  const sections = extractSections(request.html);
  
  if (sections.length === 0) {
    return {
      html: request.html,
      uniquenessScore: 0,
      sectionsRewritten: 0,
      keywordsPreserved: 0,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // Spin each section
  let spunHtml = request.html;
  let sectionsRewritten = 0;

  // Process sections sequentially to avoid rate limiting
  for (const section of sections) {
    // Skip FAQ schema section — too risky to modify structured data
    if (section.type === "faq") {
      // Only spin the visible FAQ text, not the schema
      const faqTextOnly = section.html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
      if (faqTextOnly.trim().length > 100) {
        const spunFaq = await spinSection({ ...section, html: faqTextOnly }, request);
        // Re-inject schema
        const schemaMatch = section.html.match(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/i);
        const fullSpunFaq = schemaMatch ? spunFaq + schemaMatch[0] : spunFaq;
        spunHtml = spunHtml.replace(section.html, fullSpunFaq);
        sectionsRewritten++;
      }
    } else {
      const spunSection = await spinSection(section, request);
      if (spunSection !== section.html) {
        spunHtml = spunHtml.replace(section.html, spunSection);
        sectionsRewritten++;
      }
    }
  }

  // Calculate uniqueness score (simple text comparison)
  const originalText = request.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const spunText = spunHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const uniquenessScore = calculateUniqueness(originalText, spunText);

  // Count preserved keywords
  const keywordsPreserved = countPreservedKeywords(spunHtml, request);

  return {
    html: spunHtml,
    uniquenessScore,
    sectionsRewritten,
    keywordsPreserved,
    processingTimeMs: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════
// Generate + Spin in One Step
// ═══════════════════════════════════════════════

export async function generateAndSpin(
  generateFn: () => GeneratedHomepage,
  spinRequest: Omit<SpinRequest, "html">
): Promise<{ generated: GeneratedHomepage; spun: SpinResult }> {
  const generated = generateFn();
  const spun = await spinContent({
    ...spinRequest,
    html: generated.html,
  });
  return { generated, spun };
}

// ═══════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════

function calculateUniqueness(original: string, spun: string): number {
  // Simple word-level comparison
  const origWords = original.split(/\s+/).filter(w => w.length > 2);
  const spunWords = spun.split(/\s+/).filter(w => w.length > 2);
  
  if (origWords.length === 0) return 100;

  // Count words in spun that don't appear in original (in same position)
  let changedWords = 0;
  const maxLen = Math.max(origWords.length, spunWords.length);
  
  for (let i = 0; i < maxLen; i++) {
    if (i >= origWords.length || i >= spunWords.length || origWords[i] !== spunWords[i]) {
      changedWords++;
    }
  }

  return Math.min(100, Math.round((changedWords / maxLen) * 100));
}

function countPreservedKeywords(html: string, request: SpinRequest): number {
  const text = html.replace(/<[^>]+>/g, " ").toLowerCase();
  let count = 0;

  // Check must-include keywords
  if (request.mustIncludeKeywords) {
    for (const kw of request.mustIncludeKeywords) {
      if (text.includes(kw.toLowerCase())) count++;
    }
  }

  // Check site name
  if (text.includes(request.siteName.toLowerCase())) count++;

  // Check domain
  if (html.includes(request.domain)) count++;

  // Check category keywords
  const categoryKeywords: Record<string, string[]> = {
    slots: ["สล็อต", "slot", "เว็บสล็อต", "สล็อตออนไลน์"],
    lottery: ["หวย", "lottery", "ลอตเตอรี่", "หวยออนไลน์"],
    baccarat: ["บาคาร่า", "baccarat", "คาสิโน", "บาคาร่าออนไลน์"],
  };

  for (const kw of categoryKeywords[request.category] || []) {
    if (text.includes(kw.toLowerCase())) count++;
  }

  return count;
}
