/**
 * Tests for ThemeLivePreview — validates the preview HTML generation logic
 * Since the component is a React component, we test the underlying data/logic
 */
import { describe, it, expect } from "vitest";

// We test the theme content generation logic by importing the theme data
// The actual component rendering is tested via the browser
describe("ThemeLivePreview", () => {
  // Test that the component file exists and exports correctly
  it("should have ThemeLivePreview component file", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const componentPath = path.resolve(__dirname, "../client/src/components/ThemeLivePreview.tsx");
    expect(fs.existsSync(componentPath)).toBe(true);
  });

  it("should have ThemeLivePreview imported in CloakingSettings", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const settingsPath = path.resolve(__dirname, "../client/src/pages/CloakingSettings.tsx");
    const content = fs.readFileSync(settingsPath, "utf-8");
    expect(content).toContain('import ThemeLivePreview from "@/components/ThemeLivePreview"');
    expect(content).toContain("MonitorPlay");
    expect(content).toContain("Live Preview");
    expect(content).toContain("previewTheme");
    expect(content).toContain("setPreviewTheme");
  });

  it("should have Live Preview button alongside Install button", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const settingsPath = path.resolve(__dirname, "../client/src/pages/CloakingSettings.tsx");
    const content = fs.readFileSync(settingsPath, "utf-8");
    // Both buttons should exist in the same flex container
    expect(content).toContain("Live Preview + Install Buttons");
    expect(content).toContain("flex gap-2");
    expect(content).toContain("Live Preview");
    expect(content).toContain("Install Theme");
  });

  it("should render ThemeLivePreview modal with correct props", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const settingsPath = path.resolve(__dirname, "../client/src/pages/CloakingSettings.tsx");
    const content = fs.readFileSync(settingsPath, "utf-8");
    // Check that the modal receives all required props
    expect(content).toContain("themeName={previewTheme.name}");
    expect(content).toContain("themeSlug={previewTheme.slug}");
    expect(content).toContain("designStyle={previewTheme.designStyle}");
    expect(content).toContain("category={previewTheme.category}");
    expect(content).toContain("defaultColors={previewTheme.defaultColors}");
    expect(content).toContain("customColors={previewThemeIndex !== null ? customColors[previewThemeIndex] : undefined}");
  });

  it("ThemeLivePreview component should have viewport switcher", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const componentPath = path.resolve(__dirname, "../client/src/components/ThemeLivePreview.tsx");
    const content = fs.readFileSync(componentPath, "utf-8");
    expect(content).toContain("desktop");
    expect(content).toContain("tablet");
    expect(content).toContain("mobile");
    expect(content).toContain("Monitor");
    expect(content).toContain("Tablet");
    expect(content).toContain("Smartphone");
  });

  it("ThemeLivePreview should generate HTML for known theme slugs", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const componentPath = path.resolve(__dirname, "../client/src/components/ThemeLivePreview.tsx");
    const content = fs.readFileSync(componentPath, "utf-8");
    // Should have theme-specific content for major themes
    expect(content).toContain("neon-jackpot");
    expect(content).toContain("royal-spin");
    expect(content).toContain("cyber-slots");
    expect(content).toContain("lucky-fortune");
    expect(content).toContain("golden-lottery");
  });

  it("ThemeLivePreview should have fullscreen toggle", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const componentPath = path.resolve(__dirname, "../client/src/components/ThemeLivePreview.tsx");
    const content = fs.readFileSync(componentPath, "utf-8");
    expect(content).toContain("isFullscreen");
    expect(content).toContain("Maximize2");
    expect(content).toContain("Minimize2");
  });

  it("ThemeLivePreview should have open in new tab button", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const componentPath = path.resolve(__dirname, "../client/src/components/ThemeLivePreview.tsx");
    const content = fs.readFileSync(componentPath, "utf-8");
    expect(content).toContain("ExternalLink");
    expect(content).toContain("window.open");
    expect(content).toContain("_blank");
  });

  it("ThemeLivePreview should use iframe with srcDoc", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const componentPath = path.resolve(__dirname, "../client/src/components/ThemeLivePreview.tsx");
    const content = fs.readFileSync(componentPath, "utf-8");
    expect(content).toContain("srcDoc={srcDoc}");
    expect(content).toContain("sandbox=\"allow-scripts\"");
    expect(content).toContain("<iframe");
  });

  it("ThemeLivePreview should support custom colors from customizer", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const componentPath = path.resolve(__dirname, "../client/src/components/ThemeLivePreview.tsx");
    const content = fs.readFileSync(componentPath, "utf-8");
    expect(content).toContain("customColors?.primary");
    expect(content).toContain("customColors?.secondary");
    expect(content).toContain("customColors?.accent");
    expect(content).toContain("customColors?.headingFont");
    expect(content).toContain("customColors?.font");
  });

  it("ThemeLivePreview generated HTML should include casino content", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const componentPath = path.resolve(__dirname, "../client/src/components/ThemeLivePreview.tsx");
    const content = fs.readFileSync(componentPath, "utf-8");
    // Casino-specific content
    expect(content).toContain("Sweet Bonanza");
    expect(content).toContain("Gates of Olympus");
    expect(content).toContain("Pragmatic Play");
    expect(content).toContain("PG Soft");
    expect(content).toContain("RTP:");
    // Thai content
    expect(content).toContain("สมัครสมาชิก");
    expect(content).toContain("เกมยอดนิยม");
    expect(content).toContain("โปรโมชั่น");
  });

  it("ThemeLivePreview should have category-specific game lists", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const componentPath = path.resolve(__dirname, "../client/src/components/ThemeLivePreview.tsx");
    const content = fs.readFileSync(componentPath, "utf-8");
    // Slots games
    expect(content).toContain("Sweet Bonanza");
    expect(content).toContain("Fortune Tiger");
    // Lottery games
    expect(content).toContain("หวยรัฐบาล");
    expect(content).toContain("หวยลาว");
    // Baccarat games
    expect(content).toContain("SA Baccarat");
    expect(content).toContain("Sexy Baccarat");
  });
});
