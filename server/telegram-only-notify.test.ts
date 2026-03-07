/**
 * Tests: Telegram-only notifications + XMLRPC brute force credentials
 */
import { describe, it, expect, vi } from "vitest";

// ─── Test 1: unified-attack-pipeline uses Telegram only (no email) ───
describe("Notification: Telegram only (no email)", () => {
  it("unified-attack-pipeline should NOT import notifyOwner", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/unified-attack-pipeline.ts", "utf-8");
    
    // Should NOT have notifyOwner import
    expect(content).not.toContain('import { notifyOwner }');
    expect(content).not.toContain('from "./_core/notification"');
    
    // Should have Telegram notification
    expect(content).toContain("sendTelegramNotification");
    expect(content).toContain("Telegram Notification (primary");
  });

  it("unified-attack-pipeline should NOT have email notification code", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/unified-attack-pipeline.ts", "utf-8");
    
    // Should NOT have email-related code
    expect(content).not.toContain("Email Notification (primary)");
    expect(content).not.toContain("emailSubject");
    expect(content).not.toContain("emailBody");
    expect(content).not.toContain("Send via notifyOwner (email)");
    expect(content).not.toContain('phase: "email"');
  });

  it("unified-attack-pipeline should set emailSent = false", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/unified-attack-pipeline.ts", "utf-8");
    
    // Should explicitly set emailSent = false
    expect(content).toContain("result.emailSent = false");
  });

  it("job-runner should NOT import notifyOwner", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/job-runner.ts", "utf-8");
    
    // Should NOT have notifyOwner import
    expect(content).not.toContain('import { notifyOwner }');
    expect(content).not.toContain('from "./_core/notification"');
    
    // Should have Telegram notification
    expect(content).toContain("sendTelegramNotification");
  });

  it("campaign-engine should NOT import notifyOwner", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/campaign-engine.ts", "utf-8");
    
    expect(content).not.toContain('import { notifyOwner }');
    expect(content).toContain("sendTelegramNotification");
  });

  it("pbn-services should NOT import notifyOwner", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/pbn-services.ts", "utf-8");
    
    expect(content).not.toContain('import { notifyOwner }');
    expect(content).toContain("sendTelegramNotification");
  });
});

// ─── Test 2: XMLRPC brute force credentials ───
describe("XMLRPC brute force credentials", () => {
  it("should have expanded credential list (not just admin:admin)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/alt-upload-methods.ts", "utf-8");
    
    // Should have multiple credentials
    expect(content).toContain("admin123");
    expect(content).toContain("password");
    expect(content).toContain("123456");
    
    // Should have username discovery
    expect(content).toMatch(/author=1|wp\/v2\/users/);
  });
});

// ─── Test 3: Telegram notification type accuracy ───
describe("Telegram notification type accuracy", () => {
  it("unified-attack-pipeline should use 'success' only for real uploads", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/unified-attack-pipeline.ts", "utf-8");
    
    // Should check fullSuccess/partialSuccess/fileDeployed for notification type
    expect(content).toContain("fullSuccess");
    expect(content).toContain("notificationType");
    
    // Telegram type should differentiate based on destination match
    expect(content).toMatch(/fullSuccess.*"success"/);
  });

  it("job-runner should differentiate real vs shellless in Telegram", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/job-runner.ts", "utf-8");
    
    // Should have hasVerified, hasShelllessRedirect checks
    expect(content).toContain("hasVerified");
    expect(content).toContain("hasShelllessRedirect");
  });
});

// ─── Test 4: Upload fallback paths ───
describe("Upload fallback paths", () => {
  it("unified-attack-pipeline should have expanded fallback paths", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("server/unified-attack-pipeline.ts", "utf-8");
    
    // Should have common CMS upload paths
    expect(content).toContain("/wp-content/uploads/");
    expect(content).toContain("/wp-includes/");
    expect(content).toContain("/images/");
    expect(content).toContain("/assets/");
  });
});
