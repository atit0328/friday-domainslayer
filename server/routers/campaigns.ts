import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";

const SEO_PHASES = [
  "Technical Audit", "Keyword Research", "On-Page Optimization",
  "Content Strategy", "Link Building Plan", "Local SEO Setup",
  "Schema Markup", "Core Web Vitals", "Content Creation",
  "Internal Linking", "Off-Page SEO", "Social Signals",
  "Monitoring Setup", "Competitor Analysis", "Performance Review",
  "Final Report"
];

export const campaignsRouter = router({
  // List campaigns
  list: protectedProcedure
    .query(async ({ ctx }) => {
      return db.getUserCampaigns(ctx.user.id);
    }),

  // Get campaign by ID
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.getCampaignById(input.id);
    }),

  // Create campaign
  create: protectedProcedure
    .input(z.object({
      domain: z.string().min(1),
      niche: z.string().min(1),
      keywords: z.string().optional(),
      brandName: z.string().optional(),
      targetGeo: z.string().default("global"),
      language: z.string().default("en"),
      aggressiveness: z.number().min(1).max(10).default(7),
      aiStrategy: z.string().default("multi"),
      targetPosition: z.number().default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await db.createCampaign(ctx.user.id, {
        domain: input.domain,
        niche: input.niche,
        keywords: input.keywords,
        brandName: input.brandName,
        targetGeo: input.targetGeo,
        language: input.language,
        aggressiveness: input.aggressiveness,
        aiStrategy: input.aiStrategy,
        targetPosition: input.targetPosition,
        totalPhases: SEO_PHASES.length,
        status: "PENDING",
      });

      return db.getCampaignById(campaign.id);
    }),

  // Run next phase of campaign
  runPhase: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const campaign = await db.getCampaignById(input.id);
      if (!campaign) throw new Error("Campaign not found");
      if (campaign.currentPhase >= campaign.totalPhases) throw new Error("Campaign already completed");

      const phaseIndex = campaign.currentPhase;
      const phaseName = SEO_PHASES[phaseIndex] || `Phase ${phaseIndex + 1}`;

      await db.updateCampaign(input.id, { status: "RUNNING" });
      await db.addCampaignLog(input.id, phaseIndex, phaseName, "started");

      try {
        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `คุณคือ Friday AI SEO Campaign Manager ปี 2026 กำลังรันแคมเปญ SEO อัตโนมัติ
ตอบเป็นภาษาไทย ให้ actionable insights สำหรับแต่ละเฟส`
            },
            {
              role: "user",
              content: `แคมเปญ SEO สำหรับ:
Domain: ${campaign.domain}
Niche: ${campaign.niche}
Keywords: ${campaign.keywords || "N/A"}
Target: Position ${campaign.targetPosition} ใน ${campaign.targetGeo}

กำลังรันเฟส ${phaseIndex + 1}/${campaign.totalPhases}: ${phaseName}

ให้ผลลัพธ์เฟสนี้แบบละเอียด พร้อม action items ที่ทำได้จริง`
            },
          ],
        });

        const content = result.choices[0]?.message?.content;
        const responseText = typeof content === "string" ? content : "Phase completed";

        await db.addCampaignLog(input.id, phaseIndex, phaseName, "completed", { result: responseText });
        await db.updateCampaign(input.id, {
          currentPhase: phaseIndex + 1,
          progress: Math.round(((phaseIndex + 1) / campaign.totalPhases) * 100),
          status: phaseIndex + 1 >= campaign.totalPhases ? "COMPLETED" : "RUNNING",
        });

        return { phase: phaseName, result: responseText, progress: Math.round(((phaseIndex + 1) / campaign.totalPhases) * 100) };
      } catch (error: any) {
        await db.addCampaignLog(input.id, phaseIndex, phaseName, "failed", { error: error.message });
        await db.updateCampaign(input.id, { status: "FAILED" });
        throw error;
      }
    }),

  // Pause/Resume campaign
  toggleStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      action: z.enum(["pause", "resume"]),
    }))
    .mutation(async ({ input }) => {
      const newStatus = input.action === "pause" ? "PAUSED" : "RUNNING";
      await db.updateCampaign(input.id, { status: newStatus as any });
      return { success: true };
    }),

  // Delete campaign
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteCampaign(input.id);
      return { success: true };
    }),

  // Get campaign logs
  logs: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input }) => {
      return db.getCampaignLogs(input.campaignId);
    }),
});
