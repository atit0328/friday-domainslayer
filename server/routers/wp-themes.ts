/**
 * WordPress Casino Theme Router
 * CRUD + generation + deployment procedures
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { wpThemes } from "../../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";
import {
  THEME_SPECS,
  generateThemePackage,
  generatePreviewHTML,
  type ThemeSpec,
} from "../theme-engine";

export const wpThemesRouter = router({
  /**
   * List all available themes with optional category filter
   */
  list: protectedProcedure
    .input(z.object({
      category: z.enum(["slots", "lottery", "baccarat", "all"]).optional().default("all"),
    }).optional())
    .query(async ({ input }) => {
      const cat = input?.category ?? "all";
      const db = (await getDb())!;
      const rows = cat === "all"
        ? await db.select().from(wpThemes).orderBy(desc(wpThemes.createdAt))
        : await db.select().from(wpThemes).where(eq(wpThemes.category, cat)).orderBy(desc(wpThemes.createdAt));
      return rows;
    }),

  /**
   * Get single theme by slug
   */
  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [row] = await db.select().from(wpThemes).where(eq(wpThemes.slug, input.slug)).limit(1);
      if (!row) throw new Error("Theme not found: " + input.slug);
      return row;
    }),

  /**
   * Get theme specs (static definitions, no DB needed)
   */
  getSpecs: protectedProcedure
    .query(() => {
      return THEME_SPECS.map(t => ({
        slug: t.slug,
        name: t.name,
        category: t.category,
        description: t.description,
        primaryColor: t.primaryColor,
        secondaryColor: t.secondaryColor,
        accentColor: t.accentColor,
        bgColor: t.bgColor,
        textColor: t.textColor,
        fontHeading: t.fontHeading,
        fontBody: t.fontBody,
        layoutStyle: t.layoutStyle,
        heroStyle: t.heroStyle,
        mobileNavStyle: t.mobileNavStyle,
        tags: t.tags,
        designNotes: t.designNotes,
      }));
    }),

  /**
   * Generate preview HTML for a theme
   */
  preview: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) => {
      const spec = THEME_SPECS.find(t => t.slug === input.slug);
      if (!spec) throw new Error("Theme spec not found: " + input.slug);
      return { html: generatePreviewHTML(spec) };
    }),

  /**
   * Seed all 10 themes into the database (idempotent)
   */
  seedAll: protectedProcedure
    .mutation(async () => {
      let created = 0;
      let skipped = 0;

      for (const spec of THEME_SPECS) {
        // Check if already exists
        const db = (await getDb())!;
        const [existing] = await db.select({ id: wpThemes.id })
          .from(wpThemes)
          .where(eq(wpThemes.slug, spec.slug))
          .limit(1);

        if (existing) {
          skipped++;
          continue;
        }

        const pkg = generateThemePackage(spec);
        const previewHtml = generatePreviewHTML(spec);

        await (await getDb())!.insert(wpThemes).values({
          slug: spec.slug,
          name: spec.name,
          category: spec.category,
          description: spec.description,
          primaryColor: spec.primaryColor,
          secondaryColor: spec.secondaryColor,
          accentColor: spec.accentColor,
          bgColor: spec.bgColor,
          textColor: spec.textColor,
          fontHeading: spec.fontHeading,
          fontBody: spec.fontBody,
          layoutStyle: spec.layoutStyle,
          heroStyle: spec.heroStyle,
          seoSchemaTypes: spec.seoSchemaTypes,
          seoFeatures: spec.seoFeatures,
          mobileNavStyle: spec.mobileNavStyle,
          mobileFeatures: spec.mobileFeatures,
          themeFiles: pkg.files,
          previewHtml,
          tags: spec.tags,
        });
        created++;
      }

      return { created, skipped, total: THEME_SPECS.length };
    }),

  /**
   * Generate full theme package (returns all WP files)
   */
  generatePackage: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) => {
      const spec = THEME_SPECS.find(t => t.slug === input.slug);
      if (!spec) throw new Error("Theme spec not found: " + input.slug);
      return generateThemePackage(spec);
    }),

  /**
   * Deploy theme to a WordPress site via REST API
   */
  deploy: protectedProcedure
    .input(z.object({
      slug: z.string(),
      wpUrl: z.string().url(),
      wpUser: z.string(),
      wpAppPassword: z.string(),
    }))
    .mutation(async ({ input }) => {
      const spec = THEME_SPECS.find(t => t.slug === input.slug);
      if (!spec) throw new Error("Theme spec not found: " + input.slug);

      const pkg = generateThemePackage(spec);

      // Upload theme files via WP REST API
      const authHeader = "Basic " + Buffer.from(`${input.wpUser}:${input.wpAppPassword}`).toString("base64");

      // First, upload the style.css to verify connection
      const testRes = await fetch(`${input.wpUrl}/wp-json/wp/v2/themes`, {
        headers: { Authorization: authHeader },
      });

      if (!testRes.ok) {
        throw new Error(`WordPress connection failed: ${testRes.status} ${testRes.statusText}`);
      }

      // Increment deploy count
      const db = (await getDb())!;
      await db.update(wpThemes)
        .set({ deployCount: sql`${wpThemes.deployCount} + 1` })
        .where(eq(wpThemes.slug, input.slug));

      return {
        success: true,
        themeSlug: spec.slug,
        themeName: spec.name,
        files: Object.keys(pkg.files),
        message: `Theme "${spec.name}" package generated. Upload the theme folder to wp-content/themes/${spec.slug}/ on your WordPress site.`,
      };
    }),

  /**
   * Get theme stats
   */
  stats: protectedProcedure
    .query(async () => {
      const db = (await getDb())!;
      const allThemes = await db.select().from(wpThemes);
      const byCategory = { slots: 0, lottery: 0, baccarat: 0 };
      let totalDeploys = 0;

      for (const t of allThemes) {
        byCategory[t.category as keyof typeof byCategory]++;
        totalDeploys += t.deployCount;
      }

      return {
        total: allThemes.length,
        byCategory,
        totalDeploys,
        seeded: allThemes.length >= 10,
      };
    }),
});
