import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";

const MODULE_PROMPTS: Record<string, string> = {
  keyword_research: "วิเคราะห์ Keyword Research สำหรับ domain/niche ที่ระบุ ให้ keyword suggestions พร้อม search volume estimate, difficulty, และ opportunity score",
  content_optimizer: "วิเคราะห์และแนะนำการ optimize content สำหรับ SEO ให้ title tags, meta descriptions, heading structure, keyword density recommendations",
  backlink_analyzer: "วิเคราะห์ backlink profile ของ domain ให้ข้อมูล estimated backlinks, referring domains, anchor text distribution, toxic links",
  competitor_spy: "วิเคราะห์คู่แข่งใน niche ที่ระบุ ให้ข้อมูล top competitors, their strategies, gaps, และ opportunities",
  technical_audit: "ทำ Technical SEO Audit สำหรับ domain ให้ checklist ของ issues พร้อม priority และ fix recommendations",
  rank_tracker: "ประเมิน ranking potential สำหรับ keywords ที่ระบุ ให้ estimated positions, difficulty, และ timeline to rank",
  schema_generator: "สร้าง Schema Markup (JSON-LD) สำหรับ domain/niche ที่ระบุ ให้ code พร้อมใช้",
  meta_writer: "เขียน Meta Title และ Meta Description ที่ optimize สำหรับ SEO ให้หลาย variations",
  content_brief: "สร้าง Content Brief สำหรับ keyword/topic ที่ระบุ ให้ outline, word count target, key points to cover",
  link_building: "แนะนำ Link Building Strategy สำหรับ domain/niche ให้ actionable tactics พร้อม priority",
  local_seo: "วิเคราะห์และแนะนำ Local SEO Strategy ให้ Google Business Profile optimization, local citations, reviews strategy",
  ecommerce_seo: "วิเคราะห์และแนะนำ E-Commerce SEO Strategy ให้ product page optimization, category structure, internal linking",
};

export const modulesRouter = router({
  // Execute a module
  execute: protectedProcedure
    .input(z.object({
      moduleName: z.string().min(1),
      domain: z.string().optional(),
      niche: z.string().optional(),
      keywords: z.string().optional(),
      customPrompt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const exec = await db.createModuleExecution(ctx.user.id, {
        moduleName: input.moduleName,
        domain: input.domain,
        niche: input.niche,
        keywords: input.keywords,
        status: "running",
      });

      const modulePrompt = MODULE_PROMPTS[input.moduleName] || "วิเคราะห์ SEO ตามที่ระบุ";

      try {
        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `คุณคือ Friday AI SEO Module: ${input.moduleName}
ตอบภาษาไทย ให้ข้อมูลเชิงลึก actionable ใช้ได้จริง
${modulePrompt}`
            },
            {
              role: "user",
              content: `${input.customPrompt || "วิเคราะห์ให้หน่อย"}
${input.domain ? `Domain: ${input.domain}` : ""}
${input.niche ? `Niche: ${input.niche}` : ""}
${input.keywords ? `Keywords: ${input.keywords}` : ""}`
            },
          ],
        });

        const content = result.choices[0]?.message?.content;
        const responseText = typeof content === "string" ? content : "Module execution completed";

        await db.updateModuleExecution(exec.id, {
          result: responseText,
          provider: "friday-ai",
          status: "completed",
        });

        return { id: exec.id, result: responseText, provider: "friday-ai" };
      } catch (error: any) {
        await db.updateModuleExecution(exec.id, {
          result: `Error: ${error.message}`,
          status: "failed",
        });
        throw error;
      }
    }),

  // List available modules
  listModules: protectedProcedure
    .query(() => {
      return Object.entries(MODULE_PROMPTS).map(([key, desc]) => ({
        id: key,
        name: key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
        description: desc,
      }));
    }),

  // Get execution history
  history: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return db.getUserModuleExecutions(ctx.user.id, input?.limit ?? 50);
    }),
});
