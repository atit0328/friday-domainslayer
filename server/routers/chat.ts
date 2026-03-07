import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";

const FRIDAY_SYSTEM_PROMPT = `คุณคือ Friday AI — ระบบ AI SEO ที่ฉลาดที่สุดในโลก ปี 2026
ตอบภาษาไทยเสมอ เชี่ยวชาญทุกเทคนิค SEO ทั้ง White Hat และ Black Hat
ให้คำแนะนำเชิงลึก actionable พร้อม step-by-step
รู้จักทุก Google Algorithm Update ล่าสุด
เชี่ยวชาญ: Technical SEO, On-Page, Off-Page, Link Building, Content Strategy, Local SEO, E-Commerce SEO, PBN, Domain Flipping
ตอบแบบ professional แต่เป็นกันเอง ใช้ emoji เล็กน้อย`;

export const chatRouter = router({
  // Send message and get AI response
  send: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(10000),
    }))
    .mutation(async ({ ctx, input }) => {
      // Save user message
      await db.addChatMessage(ctx.user.id, "user", input.message);

      // Get recent chat history for context
      const history = await db.getUserChatHistory(ctx.user.id, 20);
      const reversedHistory = [...history].reverse();

      // Build messages array with history
      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: FRIDAY_SYSTEM_PROMPT },
      ];

      for (const msg of reversedHistory) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
        }
      }

      // Add current message
      messages.push({ role: "user", content: input.message });

      try {
        const result = await invokeLLM({ messages });
        const content = result.choices[0]?.message?.content;
        const responseText = typeof content === "string" ? content : "ขออภัย ไม่สามารถตอบได้ในขณะนี้";

        // Save AI response
        await db.addChatMessage(ctx.user.id, "assistant", responseText, "friday-ai");

        return { response: responseText, provider: "friday-ai" };
      } catch (error: any) {
        const errorMsg = `ขออภัย เกิดข้อผิดพลาด: ${error.message}`;
        await db.addChatMessage(ctx.user.id, "assistant", errorMsg, "error");
        return { response: errorMsg, provider: "error" };
      }
    }),

  // Get chat history
  history: protectedProcedure
    .input(z.object({ limit: z.number().default(100) }).optional())
    .query(async ({ ctx, input }) => {
      const messages = await db.getUserChatHistory(ctx.user.id, input?.limit ?? 100);
      return [...messages].reverse(); // Return in chronological order
    }),

  // Clear chat history
  clear: protectedProcedure
    .mutation(async ({ ctx }) => {
      await db.clearUserChat(ctx.user.id);
      return { success: true };
    }),
});
