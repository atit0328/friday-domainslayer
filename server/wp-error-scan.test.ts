import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Tests for:
 * 1. wp_error_scan & wp_error_fix task types in seo-agent.ts
 * 2. getSiteHealth & autoFixErrors methods in wp-api.ts
 * 3. wp_error_scan & wp_error_fix in schema enum
 * 4. PBN sites data import (198 sites in database)
 */

const agentSrc = readFileSync(resolve(__dirname, "seo-agent.ts"), "utf-8");
const wpApiSrc = readFileSync(resolve(__dirname, "wp-api.ts"), "utf-8");
const schemaSrc = readFileSync(resolve(__dirname, "../drizzle/schema.ts"), "utf-8");

// ═══ 1. wp_error_scan task type in seo-agent.ts ═══
describe("wp_error_scan task type", () => {
  it("has case for wp_error_scan in executeAgentTask", () => {
    expect(agentSrc).toContain('case "wp_error_scan"');
  });

  it("creates WP client for scanning", () => {
    // Find the wp_error_scan section
    const scanIdx = agentSrc.indexOf('case "wp_error_scan"');
    const fixIdx = agentSrc.indexOf('case "wp_error_fix"');
    const section = agentSrc.slice(scanIdx, fixIdx);
    expect(section).toContain("createWPClient");
    expect(section).toContain("getSiteHealth");
  });

  it("checks for WordPress credentials before scanning", () => {
    const scanIdx = agentSrc.indexOf('case "wp_error_scan"');
    const fixIdx = agentSrc.indexOf('case "wp_error_fix"');
    const section = agentSrc.slice(scanIdx, fixIdx);
    expect(section).toContain("wpUsername");
    expect(section).toContain("wpAppPassword");
  });

  it("returns health status with error/warning/plugin counts", () => {
    const scanIdx = agentSrc.indexOf('case "wp_error_scan"');
    const fixIdx = agentSrc.indexOf('case "wp_error_fix"');
    const section = agentSrc.slice(scanIdx, fixIdx);
    expect(section).toContain("errorsCount");
    expect(section).toContain("warningsCount");
    expect(section).toContain("pluginIssuesCount");
  });

  it("creates auto-fix task when errors found and allowWpEdit enabled", () => {
    const scanIdx = agentSrc.indexOf('case "wp_error_scan"');
    const fixIdx = agentSrc.indexOf('case "wp_error_fix"');
    const section = agentSrc.slice(scanIdx, fixIdx);
    expect(section).toContain("allowWpEdit");
    expect(section).toContain("db.createAgentTask");
    expect(section).toContain('"wp_error_fix"');
  });

  it("passes correct arguments to createAgentTask (projectId, userId, data)", () => {
    const scanIdx = agentSrc.indexOf('case "wp_error_scan"');
    const fixIdx = agentSrc.indexOf('case "wp_error_fix"');
    const section = agentSrc.slice(scanIdx, fixIdx);
    expect(section).toContain("db.createAgentTask(project.id, project.userId,");
  });
});

// ═══ 2. wp_error_fix task type in seo-agent.ts ═══
describe("wp_error_fix task type", () => {
  it("has case for wp_error_fix in executeAgentTask", () => {
    expect(agentSrc).toContain('case "wp_error_fix"');
  });

  it("checks allowWpEdit permission before fixing", () => {
    const fixIdx = agentSrc.indexOf('case "wp_error_fix"');
    const defaultIdx = agentSrc.indexOf("default:", fixIdx);
    const section = agentSrc.slice(fixIdx, defaultIdx);
    expect(section).toContain("allowWpEdit");
    expect(section).toContain("User has not granted permission to edit website");
  });

  it("scans current health before attempting fixes", () => {
    const fixIdx = agentSrc.indexOf('case "wp_error_fix"');
    const defaultIdx = agentSrc.indexOf("default:", fixIdx);
    const section = agentSrc.slice(fixIdx, defaultIdx);
    expect(section).toContain("getSiteHealth");
  });

  it("calls autoFixErrors with errors and plugin issues", () => {
    const fixIdx = agentSrc.indexOf('case "wp_error_fix"');
    const defaultIdx = agentSrc.indexOf("default:", fixIdx);
    const section = agentSrc.slice(fixIdx, defaultIdx);
    expect(section).toContain("autoFixErrors");
  });

  it("uses LLM for unfixed errors analysis", () => {
    const fixIdx = agentSrc.indexOf('case "wp_error_fix"');
    const defaultIdx = agentSrc.indexOf("default:", fixIdx);
    const section = agentSrc.slice(fixIdx, defaultIdx);
    expect(section).toContain("invokeLLM");
    expect(section).toContain("WordPress expert");
  });

  it("returns fix results with counts and AI recommendations", () => {
    const fixIdx = agentSrc.indexOf('case "wp_error_fix"');
    const defaultIdx = agentSrc.indexOf("default:", fixIdx);
    const section = agentSrc.slice(fixIdx, defaultIdx);
    expect(section).toContain("fixesApplied");
    expect(section).toContain("fixesFailed");
    expect(section).toContain("aiRecommendations");
    expect(section).toContain("remainingErrors");
  });

  it("sends telegram notification after successful fixes", () => {
    const fixIdx = agentSrc.indexOf('case "wp_error_fix"');
    const defaultIdx = agentSrc.indexOf("default:", fixIdx);
    const section = agentSrc.slice(fixIdx, defaultIdx);
    expect(section).toContain("sendTelegramNotification");
    expect(section).toContain("WP Error Fix");
  });

  it("uses correct TelegramNotification format (type, details)", () => {
    const fixIdx = agentSrc.indexOf('case "wp_error_fix"');
    const defaultIdx = agentSrc.indexOf("default:", fixIdx);
    const section = agentSrc.slice(fixIdx, defaultIdx);
    expect(section).toContain('type: "info"');
    expect(section).toContain("details:");
  });
});

// ═══ 3. getSiteHealth method in wp-api.ts ═══
describe("WP API — getSiteHealth", () => {
  it("has getSiteHealth method", () => {
    expect(wpApiSrc).toContain("async getSiteHealth()");
  });

  it("checks site accessibility", () => {
    expect(wpApiSrc).toContain("site_unreachable");
    expect(wpApiSrc).toContain("homepage_unreachable");
  });

  it("checks for PHP errors", () => {
    expect(wpApiSrc).toContain("Fatal error");
    expect(wpApiSrc).toContain("Parse error");
    expect(wpApiSrc).toContain("php_error_in_content");
  });

  it("checks for WordPress maintenance mode", () => {
    expect(wpApiSrc).toContain("maintenance");
  });

  it("checks for plugin conflicts", () => {
    expect(wpApiSrc).toContain("plugin");
  });

  it("returns structured health report", () => {
    // getSiteHealth returns an object with errors, warnings, pluginIssues arrays
    expect(wpApiSrc).toContain("const errors: SiteError[]");
    expect(wpApiSrc).toContain("const warnings: SiteError[]");
    expect(wpApiSrc).toContain("const pluginIssues: PluginIssue[]");
  });
});

// ═══ 4. autoFixErrors method in wp-api.ts ═══
describe("WP API — autoFixErrors", () => {
  it("has autoFixErrors method", () => {
    expect(wpApiSrc).toContain("async autoFixErrors(");
  });

  it("handles plugin deactivation for problematic plugins", () => {
    expect(wpApiSrc).toContain("deactivate");
  });

  it("handles maintenance mode clearing", () => {
    expect(wpApiSrc).toContain("maintenance");
  });

  it("returns array of fix results with success/failure", () => {
    expect(wpApiSrc).toContain("success:");
    expect(wpApiSrc).toContain("action:");
  });
});

// ═══ 5. Schema — wp_error_scan & wp_error_fix in enum ═══
describe("Schema — wp_error_scan & wp_error_fix task types", () => {
  it("has wp_error_scan in seoTaskType enum", () => {
    expect(schemaSrc).toContain('"wp_error_scan"');
  });

  it("has wp_error_fix in seoTaskType enum", () => {
    expect(schemaSrc).toContain('"wp_error_fix"');
  });

  it("wp_error_scan and wp_error_fix are in the seo_agent_tasks table enum", () => {
    // Find the seoTaskType enum definition
    const enumStart = schemaSrc.indexOf("seoTaskType");
    const enumEnd = schemaSrc.indexOf("])", enumStart);
    const enumSection = schemaSrc.slice(enumStart, enumEnd);
    expect(enumSection).toContain("wp_error_scan");
    expect(enumSection).toContain("wp_error_fix");
  });
});

// ═══ 6. PBN Sites Schema ═══
describe("PBN Sites Schema", () => {
  it("has pbn_sites table", () => {
    expect(schemaSrc).toContain("pbn_sites");
  });

  it("has hosting and registrar fields", () => {
    expect(schemaSrc).toContain("hostingProvider");
    expect(schemaSrc).toContain("hostingName");
    expect(schemaSrc).toContain("domainRegistrar");
    expect(schemaSrc).toContain("registrarEmail");
    expect(schemaSrc).toContain("registrarPass");
  });

  it("has cpanel fields", () => {
    expect(schemaSrc).toContain("cpanelUrl");
    expect(schemaSrc).toContain("cpanelUser");
    expect(schemaSrc).toContain("cpanelPass");
  });

  it("has wpAutomationKey field", () => {
    expect(schemaSrc).toContain("wpAutomationKey");
  });

  it("has isBlog and parentSiteId for blog subdomains", () => {
    expect(schemaSrc).toContain("isBlog");
    expect(schemaSrc).toContain("parentSiteId");
  });

  it("has banned field for tracking banned status", () => {
    expect(schemaSrc).toContain("banned");
  });

  it("has domain metrics fields (da, dr, pa, spamScore)", () => {
    expect(schemaSrc).toContain('"da"');
    expect(schemaSrc).toContain('"dr"');
    expect(schemaSrc).toContain('"pa"');
    expect(schemaSrc).toContain("spamScore");
  });
});
