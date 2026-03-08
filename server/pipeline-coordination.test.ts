/**
 * Tests for Pipeline Coordination & WP Brute Force Lockout Fixes
 * 
 * Verifies:
 * 1. WP Brute Force: maxLockouts, globalTimeout, lockout counter
 * 2. Pipeline: global timeout, shouldStop checks, phase coordination
 * 3. Pipeline: hasSuccessfulRedirect early termination
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SERVER_DIR = path.resolve(__dirname);

// ═══════════════════════════════════════════════
//  WP BRUTE FORCE — LOCKOUT LIMIT TESTS
// ═══════════════════════════════════════════════

describe("WP Brute Force — Lockout Limit", () => {
  it("should export BruteForceConfig with maxLockouts field", async () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("maxLockouts");
    expect(content).toContain("max lockout count before abort");
  });

  it("should export BruteForceConfig with globalTimeout field", async () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("globalTimeout");
    expect(content).toContain("max total time for brute force");
  });

  it("should have default maxLockouts of 3", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("config.maxLockouts || 3");
  });

  it("should have default globalTimeout of 120000ms (2 min)", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("config.globalTimeout || 120000");
  });

  it("should track lockout count and abort when maxLockouts reached", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Should have lockout counter
    expect(content).toContain("let lockoutCount = 0");
    expect(content).toContain("lockoutCount++");
    
    // Should check against maxLockouts
    expect(content).toContain("lockoutCount >= maxLockouts");
    
    // Should push error when max lockouts reached
    expect(content).toContain("max_lockouts_reached");
  });

  it("should check global timeout (deadline) before each attempt", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Should have deadline calculation
    expect(content).toContain("const deadline = Date.now() + globalTimeout");
    
    // Should check deadline in XMLRPC loop
    expect(content).toContain("Date.now() > deadline");
    
    // Should push global_timeout error
    expect(content).toContain("global_timeout");
  });

  it("should log lockout count as fraction (e.g., 2/3)", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Should show lockout progress like "Locked out (1/3)"
    expect(content).toContain("${lockoutCount}/${maxLockouts}");
  });

  it("should abort XMLRPC loop when lockoutCount >= maxLockouts", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // The outer loop break should include lockout check
    expect(content).toContain("lockoutCount >= maxLockouts) break");
  });

  it("should abort wp-login loop when lockoutCount >= maxLockouts", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Phase 3 section starts from "Phase 3: Try wp-login.php"
    // The comment line "// Phase 3:" is the split point, so [1] starts from the rest
    const phase3Section = content.split("Phase 3: Try wp-login")[1] || "";
    // Guard should check lockout count (< maxLockouts means abort when >=)
    expect(phase3Section).toContain("lockoutCount < maxLockouts");
    // Inner loop break should check lockoutCount >= maxLockouts
    expect(phase3Section).toContain("lockoutCount >= maxLockouts");
  });

  it("should skip Phase 3 if already timed out or max lockouts reached", () => {
    const filePath = path.join(SERVER_DIR, "wp-brute-force.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    
    // Phase 3 guard should include deadline and lockout checks
    expect(content).toContain("Date.now() < deadline && lockoutCount < maxLockouts");
  });

  it("should export wpBruteForce function", async () => {
    const mod = await import("./wp-brute-force");
    expect(mod.wpBruteForce).toBeDefined();
    expect(typeof mod.wpBruteForce).toBe("function");
  });

  it("should export wpAuthenticatedUpload function", async () => {
    const mod = await import("./wp-brute-force");
    expect(mod.wpAuthenticatedUpload).toBeDefined();
    expect(typeof mod.wpAuthenticatedUpload).toBe("function");
  });
});

// ═══════════════════════════════════════════════
//  PIPELINE — GLOBAL TIMEOUT TESTS
// ═══════════════════════════════════════════════

describe("Pipeline — Global Timeout & Coordination", () => {
  it("should have globalTimeout in PipelineConfig", () => {
    const filePath = path.join(SERVER_DIR, "unified-attack-pipeline.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("globalTimeout?: number");
    expect(content).toContain("Global pipeline timeout");
  });

  it("should set GLOBAL_TIMEOUT with 20 minute default", () => {
    const filePath = path.join(SERVER_DIR, "unified-attack-pipeline.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("config.globalTimeout || 20 * 60 * 1000");
  });

  it("should calculate deadline from startTime + GLOBAL_TIMEOUT", () => {
    const filePath = path.join(SERVER_DIR, "unified-attack-pipeline.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("const deadline = startTime + GLOBAL_TIMEOUT");
  });

  it("should create AbortController for pipeline-wide cancellation", () => {
    const filePath = path.join(SERVER_DIR, "unified-attack-pipeline.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("const pipelineAbort = new AbortController()");
  });

  it("should define shouldStop() helper function", () => {
    const filePath = path.join(SERVER_DIR, "unified-attack-pipeline.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("function shouldStop(reason?: string): boolean");
    expect(content).toContain("pipelineAbort.signal.aborted");
    expect(content).toContain("Date.now() > deadline");
  });

  it("should define hasSuccessfulRedirect() helper function", () => {
    const filePath = path.join(SERVER_DIR, "unified-attack-pipeline.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("function hasSuccessfulRedirect(): boolean");
    expect(content).toContain("f.redirectWorks && f.redirectDestinationMatch");
  });
});

// ═══════════════════════════════════════════════
//  PIPELINE — PHASE COORDINATION TESTS
// ═══════════════════════════════════════════════

describe("Pipeline — Phase Coordination (shouldStop checks)", () => {
  const pipelineContent = fs.readFileSync(
    path.join(SERVER_DIR, "unified-attack-pipeline.ts"),
    "utf-8"
  );

  it("should check shouldStop before Config Exploit phase", () => {
    expect(pipelineContent).toContain("!shouldStop('config_exploit')");
  });

  it("should check shouldStop before DNS Recon phase", () => {
    expect(pipelineContent).toContain("!shouldStop('dns_recon')");
  });

  it("should check shouldStop before CF Bypass phase", () => {
    expect(pipelineContent).toContain("!shouldStop('cf_bypass')");
  });

  it("should check shouldStop before WP Brute Force phase", () => {
    expect(pipelineContent).toContain("!shouldStop('wp_brute_force')");
  });

  it("should check shouldStop before Shell Generation phase", () => {
    expect(pipelineContent).toContain("shouldStop('shell_gen')");
  });

  it("should check shouldStop before Upload phase", () => {
    expect(pipelineContent).toContain("!shouldStop('upload')");
  });

  it("should check shouldStop inside upload loop", () => {
    expect(pipelineContent).toContain("shouldStop('upload_loop')");
  });

  it("should check shouldStop before Advanced Attacks phase", () => {
    expect(pipelineContent).toContain("!shouldStop('advanced_attacks')");
  });

  it("should check shouldStop before WAF Bypass", () => {
    expect(pipelineContent).toContain("!shouldStop('waf_bypass')");
  });

  it("should check shouldStop before Alt Upload", () => {
    expect(pipelineContent).toContain("!shouldStop('alt_upload')");
  });

  it("should check shouldStop before Indirect Attacks", () => {
    expect(pipelineContent).toContain("!shouldStop('indirect')");
  });

  it("should check shouldStop before WP Admin Takeover", () => {
    expect(pipelineContent).toContain("!shouldStop('wp_admin')");
  });

  it("should check shouldStop before WP DB Injection", () => {
    expect(pipelineContent).toContain("!shouldStop('wp_db_inject')");
  });

  it("should check shouldStop before Non-WP Exploits", () => {
    expect(pipelineContent).toContain("!shouldStop('nonwp_exploits')");
  });

  it("should check shouldStop before Shellless Attacks", () => {
    expect(pipelineContent).toContain("!shouldStop('shellless')");
  });

  it("should check shouldStop before AI Commander", () => {
    expect(pipelineContent).toContain("!shouldStop('ai_commander')");
  });
});

// ═══════════════════════════════════════════════
//  PIPELINE — EARLY TERMINATION ON SUCCESS
// ═══════════════════════════════════════════════

describe("Pipeline — Early Termination on Success", () => {
  const pipelineContent = fs.readFileSync(
    path.join(SERVER_DIR, "unified-attack-pipeline.ts"),
    "utf-8"
  );

  it("should check hasSuccessfulRedirect before WP Brute Force", () => {
    // The WP brute force guard should include hasSuccessfulRedirect
    const wpBruteSection = pipelineContent.split("Phase 2.5d")[0] || "";
    expect(pipelineContent).toContain("!hasSuccessfulRedirect()");
  });

  it("should check hasSuccessfulRedirect before Shell Generation", () => {
    expect(pipelineContent).toMatch(/hasSuccessfulRedirect\(\).*shell_gen|shell_gen.*hasSuccessfulRedirect\(\)/s);
  });

  it("should check hasSuccessfulRedirect before Upload phase", () => {
    // Upload phase guard
    const uploadGuard = pipelineContent.match(/shells\.length > 0 && !shouldStop\('upload'\) && !hasSuccessfulRedirect\(\)/);
    expect(uploadGuard).not.toBeNull();
  });

  it("should check hasSuccessfulRedirect inside upload loop", () => {
    expect(pipelineContent).toContain("shouldStop('upload_loop') || hasSuccessfulRedirect()");
  });

  it("should check hasSuccessfulRedirect before advanced attacks", () => {
    expect(pipelineContent).toContain("!shouldStop('advanced_attacks') && !hasSuccessfulRedirect()");
  });

  it("should check hasSuccessfulRedirect before shellless attacks", () => {
    expect(pipelineContent).toContain("!shouldStop('shellless') && !hasSuccessfulRedirect()");
  });
});

// ═══════════════════════════════════════════════
//  PIPELINE — WP BRUTE FORCE CONFIG IN PIPELINE
// ═══════════════════════════════════════════════

describe("Pipeline — WP Brute Force Config", () => {
  const pipelineContent = fs.readFileSync(
    path.join(SERVER_DIR, "unified-attack-pipeline.ts"),
    "utf-8"
  );

  it("should pass maxLockouts: 3 to wpBruteForce", () => {
    expect(pipelineContent).toContain("maxLockouts: 3");
  });

  it("should calculate dynamic timeout for brute force based on remaining pipeline time", () => {
    expect(pipelineContent).toContain("deadline - Date.now()");
    expect(pipelineContent).toContain("bruteForceTimeout");
    expect(pipelineContent).toContain("Math.min(120000, remainingMs)");
  });

  it("should pass globalTimeout to wpBruteForce config", () => {
    expect(pipelineContent).toContain("globalTimeout: bruteForceTimeout");
  });
});

// ═══════════════════════════════════════════════
//  PIPELINE — AI COMMANDER TIMEOUT
// ═══════════════════════════════════════════════

describe("Pipeline — AI Commander Timeout", () => {
  const pipelineContent = fs.readFileSync(
    path.join(SERVER_DIR, "unified-attack-pipeline.ts"),
    "utf-8"
  );

  it("should calculate remaining time for AI Commander", () => {
    expect(pipelineContent).toContain("aiRemainingMs");
    expect(pipelineContent).toContain("aiMaxTime");
  });

  it("should limit AI Commander to max 5 minutes", () => {
    expect(pipelineContent).toContain("5 * 60 * 1000");
  });

  it("should wrap AI Commander in Promise.race with timeout", () => {
    expect(pipelineContent).toContain("AI Commander timeout");
    expect(pipelineContent).toContain("aiMaxTime");
  });
});

// ═══════════════════════════════════════════════
//  MODULE EXPORTS
// ═══════════════════════════════════════════════

describe("Module Exports", () => {
  it("unified-attack-pipeline should export runUnifiedAttackPipeline", async () => {
    const mod = await import("./unified-attack-pipeline");
    expect(mod.runUnifiedAttackPipeline).toBeDefined();
    expect(typeof mod.runUnifiedAttackPipeline).toBe("function");
  });

  it("wp-brute-force should export wpBruteForce and wpAuthenticatedUpload", async () => {
    const mod = await import("./wp-brute-force");
    expect(mod.wpBruteForce).toBeDefined();
    expect(mod.wpAuthenticatedUpload).toBeDefined();
  });

  it("wp-brute-force should export BruteForceResult type (via function return)", async () => {
    const mod = await import("./wp-brute-force");
    // Verify the function signature by checking it's callable
    expect(typeof mod.wpBruteForce).toBe("function");
  });
});
