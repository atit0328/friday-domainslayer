/**
 * tRPC Router for Telegram AI Chat Agent management
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  processMessage,
  clearHistory,
  startTelegramPolling,
  stopTelegramPolling,
  isTelegramPollingActive,
  setupTelegramWebhook,
  removeTelegramWebhook,
} from "../telegram-ai-agent";

export const telegramAiRouter = router({
  /** Get current Telegram AI agent status */
  status: protectedProcedure.query(async () => {
    return {
      pollingActive: isTelegramPollingActive(),
      mode: isTelegramPollingActive() ? "polling" : "inactive",
    };
  }),

  /** Start Telegram polling mode */
  startPolling: protectedProcedure.mutation(async () => {
    startTelegramPolling();
    return { success: true, message: "Telegram AI polling started" };
  }),

  /** Stop Telegram polling */
  stopPolling: protectedProcedure.mutation(async () => {
    stopTelegramPolling();
    return { success: true, message: "Telegram AI polling stopped" };
  }),

  /** Set up webhook mode (for production) */
  setWebhook: protectedProcedure
    .input(z.object({ webhookUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      // Stop polling first
      stopTelegramPolling();
      return await setupTelegramWebhook(input.webhookUrl);
    }),

  /** Remove webhook */
  removeWebhook: protectedProcedure.mutation(async () => {
    return await removeTelegramWebhook();
  }),

  /** Test: send a message through the AI agent (for debugging) */
  testMessage: protectedProcedure
    .input(z.object({ message: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const reply = await processMessage(0, input.message); // chatId 0 for test
      return { reply };
    }),

  /** Clear conversation history for a chat */
  clearChat: protectedProcedure
    .input(z.object({ chatId: z.number().optional() }))
    .mutation(async ({ input }) => {
      clearHistory(input.chatId ?? 0);
      return { success: true };
    }),
});
