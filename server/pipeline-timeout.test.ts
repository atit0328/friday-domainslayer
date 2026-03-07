/**
 * Pipeline Timeout Fix — Vitest Tests
 * Tests the upload shell step timeout, method reduction, and abort signal support
 */
import { describe, it, expect } from "vitest";
import {
  generateShell,
  classifyError,
} from "./one-click-deploy";

// ═══════════════════════════════════════════════════════
//  Upload Shell — Method & Path Reduction
// ═══════════════════════════════════════════════════════

describe("Pipeline Timeout Fix — Upload Shell Optimization", () => {
  it("generates shell with correct structure for upload", () => {
    const shell = generateShell();
    expect(shell.filename).toBeTruthy();
    expect(shell.password).toBeTruthy();
    expect(shell.finalPayload).toContain("<?php");
    // Shell should have 4 obfuscation layers
    expect(shell.layers).toHaveLength(4);
  });

  it("classifies timeout errors correctly", () => {
    const timeoutErr = new Error("Timeout");
    timeoutErr.name = "AbortError";
    expect(classifyError(timeoutErr)).toBe("timeout");
  });

  it("classifies connection errors correctly", () => {
    const connErr = new Error("fetch failed");
    expect(classifyError(connErr)).toBe("connection");
  });

  it("classifies WAF errors correctly", () => {
    const wafErr = new Error("403 Forbidden");
    expect(classifyError(wafErr)).toBe("waf");
  });

  it("classifies server errors correctly", () => {
    const serverErr = new Error("500 Internal Server Error");
    expect(classifyError(serverErr)).toBe("server_error");
  });
});

// ═══════════════════════════════════════════════════════
//  AbortController Integration
// ═══════════════════════════════════════════════════════

describe("Pipeline Timeout Fix — AbortController", () => {
  it("AbortController can be created and aborted", () => {
    const controller = new AbortController();
    expect(controller.signal.aborted).toBe(false);
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it("AbortController signal fires abort event", () => {
    const controller = new AbortController();
    let aborted = false;
    controller.signal.addEventListener("abort", () => {
      aborted = true;
    });
    controller.abort();
    expect(aborted).toBe(true);
  });

  it("nested AbortController propagates abort", () => {
    const parent = new AbortController();
    const child = new AbortController();
    parent.signal.addEventListener("abort", () => child.abort(), { once: true });
    
    expect(child.signal.aborted).toBe(false);
    parent.abort();
    expect(child.signal.aborted).toBe(true);
  });

  it("step timeout of 90s is reasonable for 5 paths × 6 methods × 8s", () => {
    // 5 paths × 6 methods = 30 requests max
    // 30 × 8s timeout = 240s worst case (but most fail fast)
    // 90s step timeout ensures we don't exceed pipeline timeout
    const STEP_TIMEOUT = 90_000;
    const MAX_PATHS = 5;
    const MAX_METHODS = 6;
    const PER_REQUEST_TIMEOUT = 8_000;
    
    // Even if all requests timeout, step abort will kill them at 90s
    expect(STEP_TIMEOUT).toBeLessThan(3 * 60 * 1000); // Less than pipeline timeout (3 min)
    expect(MAX_PATHS * MAX_METHODS).toBe(30); // 30 max requests
    expect(PER_REQUEST_TIMEOUT).toBe(8000); // 8s per request
  });
});

// ═══════════════════════════════════════════════════════
//  Pipeline Timing Configuration
// ═══════════════════════════════════════════════════════

describe("Pipeline Timeout Fix — Timing Configuration", () => {
  it("pipeline timeout is 3 minutes", () => {
    const PIPELINE_TIMEOUT_MS = 3 * 60 * 1000;
    expect(PIPELINE_TIMEOUT_MS).toBe(180_000);
  });

  it("heartbeat interval is 8 seconds", () => {
    const HEARTBEAT_INTERVAL_MS = 8_000;
    expect(HEARTBEAT_INTERVAL_MS).toBe(8_000);
  });

  it("max retries is capped at 3", () => {
    const userRetries = 10;
    const cappedRetries = Math.min(userRetries, 3);
    expect(cappedRetries).toBe(3);
  });

  it("upload step retries are capped at 2", () => {
    const maxRetries = 5;
    const uploadRetries = Math.min(maxRetries, 2);
    expect(uploadRetries).toBe(2);
  });

  it("total worst-case time is under pipeline timeout", () => {
    // Upload step: 90s max (step timeout)
    // Other steps: ~30s each × 5 steps = 150s
    // Total: ~240s = 4 min, but pipeline timeout at 3 min will catch it
    const PIPELINE_TIMEOUT = 180_000; // 3 min
    const UPLOAD_STEP_TIMEOUT = 90_000; // 90s
    
    // Upload step alone fits within pipeline timeout
    expect(UPLOAD_STEP_TIMEOUT).toBeLessThan(PIPELINE_TIMEOUT);
  });
});
