/**
 * Attack Result Summary — สรุปผลโจมตีสวยๆ ส่งกลับ Telegram หลังจบ pipeline
 * 
 * Features:
 * - Success/fail count + method breakdown
 * - Redirect links ที่สำเร็จ
 * - Timing breakdown (total + per method)
 * - Visual progress bar
 * - Inline keyboard สำหรับ actions ต่อ
 */

// ─── Types ───

export interface MethodOutcome {
  name: string;
  icon: string;
  success: boolean;
  durationMs: number;
  detail?: string;
  redirectUrl?: string;  // URL ที่ redirect สำเร็จ
}

export interface AttackSummaryData {
  domain: string;
  targetUrl: string;
  overallSuccess: boolean;
  successMethod?: string;
  successUrl?: string;        // URL ที่ redirect สำเร็จ (file ที่วาง)
  redirectDestination?: string; // ปลายทาง redirect (เว็บเรา)
  totalDurationMs: number;
  methodOutcomes: MethodOutcome[];
  failedMethods: string[];
  // Extra intel
  serverInfo?: string;
  cms?: string;
  waf?: string;
  breachCredsFound?: number;
  shodanPortsOpen?: number;
  // AI recommendation context
  aiRecommendedMethods?: string[];
  mode: "full_chain" | "single" | "top3" | "retry" | "hijack" | "cloaking" | "deploy_advanced";
}

// ─── Helpers ───

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function progressBar(success: number, total: number, width: number = 10): string {
  if (total === 0) return "░".repeat(width);
  const filled = Math.round((success / total) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function getSuccessRate(outcomes: MethodOutcome[]): number {
  if (outcomes.length === 0) return 0;
  return Math.round((outcomes.filter(o => o.success).length / outcomes.length) * 100);
}

function getModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    full_chain: "Full Chain (20 วิธี)",
    single: "Single Method",
    top3: "Top 3 AI Recommended",
    retry: "AI Retry",
    hijack: "Hijack Redirect",
    cloaking: "PHP Cloaking",
    deploy_advanced: "Deploy Advanced",
  };
  return labels[mode] || mode;
}

// ─── Summary Builder ───

export function buildAttackSummary(data: AttackSummaryData): {
  text: string;
  keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
} {
  const {
    domain,
    overallSuccess,
    successMethod,
    successUrl,
    redirectDestination,
    totalDurationMs,
    methodOutcomes,
    failedMethods,
    serverInfo,
    cms,
    waf,
    breachCredsFound,
    shodanPortsOpen,
    mode,
  } = data;

  const succeeded = methodOutcomes.filter(o => o.success);
  const failed = methodOutcomes.filter(o => !o.success);
  const successRate = getSuccessRate(methodOutcomes);

  const lines: string[] = [];

  // ─── Header ───
  if (overallSuccess) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🏆 โจมตีสำเร็จ!`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  } else {
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📊 สรุปผลการโจมตี`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  }

  // ─── Target Info ───
  lines.push(``);
  lines.push(`🎯 เป้าหมาย: ${domain}`);
  lines.push(`⚔️ โหมด: ${getModeLabel(mode)}`);
  lines.push(`⏱ เวลาทั้งหมด: ${formatDuration(totalDurationMs)}`);

  // ─── Server Intel ───
  const intelParts: string[] = [];
  if (cms) intelParts.push(`CMS: ${cms}`);
  if (serverInfo) intelParts.push(`Server: ${serverInfo}`);
  if (waf) intelParts.push(`WAF: ${waf}`);
  if (intelParts.length > 0) {
    lines.push(`🖥 ${intelParts.join(" | ")}`);
  }
  if (breachCredsFound && breachCredsFound > 0) {
    lines.push(`🔑 Breach Creds: ${breachCredsFound} ชุด`);
  }
  if (shodanPortsOpen && shodanPortsOpen > 0) {
    lines.push(`🔍 Shodan Ports: ${shodanPortsOpen} open`);
  }

  // ─── Score Bar ───
  lines.push(``);
  lines.push(`📊 ผลลัพธ์: ${progressBar(succeeded.length, methodOutcomes.length)} ${successRate}%`);
  lines.push(`   ✅ สำเร็จ: ${succeeded.length}  ❌ ล้มเหลว: ${failed.length}  📦 ทั้งหมด: ${methodOutcomes.length}`);

  // ─── Success Details ───
  if (overallSuccess && successMethod) {
    lines.push(``);
    lines.push(`🏅 วิธีที่สำเร็จ: ${successMethod}`);
    if (successUrl) {
      lines.push(`📎 File: ${successUrl}`);
    }
    if (redirectDestination) {
      lines.push(`🔗 Redirect → ${redirectDestination}`);
    }
  }

  // ─── Method Breakdown ───
  if (methodOutcomes.length > 0) {
    lines.push(``);
    lines.push(`📋 รายละเอียดแต่ละวิธี:`);
    
    // Show succeeded first, then failed
    const sortedOutcomes = [...succeeded, ...failed];
    const maxShow = 15; // Limit to prevent message too long
    
    for (let i = 0; i < Math.min(sortedOutcomes.length, maxShow); i++) {
      const o = sortedOutcomes[i];
      const status = o.success ? "✅" : "❌";
      const duration = formatDuration(o.durationMs);
      const detail = o.detail ? ` — ${o.detail.substring(0, 50)}` : "";
      lines.push(`  ${status} ${o.icon} ${o.name} (${duration})${detail}`);
    }
    
    if (sortedOutcomes.length > maxShow) {
      lines.push(`  ... +${sortedOutcomes.length - maxShow} วิธีเพิ่มเติม`);
    }
  }

  // ─── Redirect Links ───
  const redirectLinks = methodOutcomes.filter(o => o.success && o.redirectUrl);
  if (redirectLinks.length > 0) {
    lines.push(``);
    lines.push(`🔗 Redirect Links ที่สำเร็จ:`);
    for (const link of redirectLinks.slice(0, 5)) {
      lines.push(`  → ${link.redirectUrl}`);
    }
    if (redirectLinks.length > 5) {
      lines.push(`  ... +${redirectLinks.length - 5} links เพิ่มเติม`);
    }
  }

  // ─── Next Steps ───
  lines.push(``);
  if (overallSuccess) {
    lines.push(`💡 ขั้นตอนถัดไป:`);
    lines.push(`  • ตรวจสอบ redirect ทำงานจริง`);
    lines.push(`  • ส่ง domain ถัดไปเพื่อโจมตีต่อ`);
    lines.push(`  • พิมพ์ "สถิติ" เพื่อดู dashboard`);
  } else {
    lines.push(`💡 แนะนำ:`);
    lines.push(`  • ลองวิธีอื่น (กดปุ่มด้านล่าง)`);
    lines.push(`  • ส่ง domain อื่นที่อ่อนแอกว่า`);
    lines.push(`  • พิมพ์ /scan ${domain} เพื่อวิเคราะห์ใหม่`);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  // ─── Inline Keyboard ───
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

  if (overallSuccess) {
    // Success: verify + attack more
    keyboard.push([
      { text: "🔍 ตรวจสอบ Redirect", callback_data: `verify_redirect:${domain}` },
      { text: "📊 Dashboard", callback_data: "cb_summary" },
    ]);
    keyboard.push([
      { text: "⚔️ โจมตี Domain ถัดไป", callback_data: "quick_scan" },
    ]);
  } else {
    // Failed: retry options
    keyboard.push([
      { text: "🔄 Retry (AI เลือกวิธีใหม่)", callback_data: `atk_confirm:${domain}:retry_attack` },
      { text: "⚡ Full Chain", callback_data: `atk_confirm:${domain}:full_chain` },
    ]);
    keyboard.push([
      { text: "🔓 Hijack Redirect", callback_data: `atk_confirm:${domain}:hijack` },
      { text: "💉 PHP Cloaking", callback_data: `atk_confirm:${domain}:cloaking` },
    ]);
    keyboard.push([
      { text: "📊 Dashboard", callback_data: "cb_summary" },
      { text: "❌ ยกเลิก", callback_data: `atk_cancel:${domain}` },
    ]);
  }

  return {
    text: lines.join("\n"),
    keyboard: { inline_keyboard: keyboard },
  };
}

// ─── Summary for run_top3 (multiple sequential attacks) ───

export interface Top3SummaryData {
  domain: string;
  targetUrl: string;
  methods: Array<{
    methodId: string;
    methodName: string;
    success: boolean;
    durationMs: number;
    successUrl?: string;
    error?: string;
  }>;
  totalDurationMs: number;
  redirectDestination?: string;
}

export function buildTop3Summary(data: Top3SummaryData): {
  text: string;
  keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
} {
  const { domain, methods, totalDurationMs, redirectDestination } = data;
  const succeeded = methods.filter(m => m.success);
  const failed = methods.filter(m => !m.success);
  const overallSuccess = succeeded.length > 0;

  const lines: string[] = [];

  // ─── Header ───
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  if (overallSuccess) {
    lines.push(`🏆 Top 3 Attack สำเร็จ!`);
  } else {
    lines.push(`📊 สรุปผล Top 3 Attack`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  lines.push(``);
  lines.push(`🎯 เป้าหมาย: ${domain}`);
  lines.push(`⏱ เวลาทั้งหมด: ${formatDuration(totalDurationMs)}`);
  lines.push(`📊 ผลลัพธ์: ${progressBar(succeeded.length, methods.length, 6)} ✅${succeeded.length} ❌${failed.length}`);

  // ─── Method Results ───
  lines.push(``);
  for (let i = 0; i < methods.length; i++) {
    const m = methods[i];
    const status = m.success ? "✅" : "❌";
    const duration = formatDuration(m.durationMs);
    lines.push(`  ${i + 1}. ${status} ${m.methodName} (${duration})`);
    if (m.success && m.successUrl) {
      lines.push(`     📎 ${m.successUrl}`);
    }
    if (!m.success && m.error) {
      lines.push(`     💬 ${m.error.substring(0, 60)}`);
    }
  }

  if (overallSuccess && redirectDestination) {
    lines.push(``);
    lines.push(`🔗 Redirect → ${redirectDestination}`);
  }

  // ─── Next Steps ───
  lines.push(``);
  if (overallSuccess) {
    lines.push(`💡 Redirect วางสำเร็จ ${succeeded.length}/${methods.length} วิธี`);
  } else {
    lines.push(`💡 ทั้ง ${methods.length} วิธีล้มเหลว — ลอง Full Chain หรือวิธีอื่น`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  // ─── Keyboard ───
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  if (overallSuccess) {
    keyboard.push([
      { text: "🔍 ตรวจสอบ Redirect", callback_data: `verify_redirect:${domain}` },
      { text: "📊 Dashboard", callback_data: "cb_summary" },
    ]);
  } else {
    keyboard.push([
      { text: "⚡ Full Chain (20 วิธี)", callback_data: `atk_confirm:${domain}:full_chain` },
      { text: "🔄 AI Retry", callback_data: `atk_confirm:${domain}:retry_attack` },
    ]);
    keyboard.push([
      { text: "📊 Dashboard", callback_data: "cb_summary" },
    ]);
  }

  return {
    text: lines.join("\n"),
    keyboard: { inline_keyboard: keyboard },
  };
}
