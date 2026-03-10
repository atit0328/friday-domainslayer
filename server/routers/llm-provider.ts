/**
 * tRPC Router: LLM Provider Management
 * View provider status, health, and trigger fallback resets
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getLLMProviderStatus, resetProviderHealth, getActiveProvider } from "../llm-fallback";

export const llmProviderRouter = router({
  /** Get all LLM provider statuses */
  status: protectedProcedure.query(async () => {
    const providers = getLLMProviderStatus();
    const activeProvider = getActiveProvider();
    return {
      providers,
      activeProvider,
    };
  }),

  /** Reset health for a specific provider or all */
  resetHealth: protectedProcedure
    .input(z.object({
      provider: z.enum(["builtin", "openai", "anthropic"]).optional(),
    }))
    .mutation(async ({ input }) => {
      resetProviderHealth(input.provider);
      return { success: true, message: `Health reset for ${input.provider || "all providers"}` };
    }),

  /** Test a specific provider with a simple prompt */
  testProvider: protectedProcedure
    .input(z.object({
      provider: z.enum(["builtin", "openai", "anthropic"]),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLMWithFallback } = await import("../llm-fallback");
      
      try {
        // Force test specific provider by temporarily adjusting health
        const start = Date.now();
        const result = await invokeLLMWithFallback({
          messages: [
            { role: "user", content: "Say 'OK' in one word." },
          ],
        });
        const duration = Date.now() - start;
        
        const content = typeof result.choices[0]?.message?.content === "string" 
          ? result.choices[0].message.content 
          : "OK";
        
        return {
          success: true,
          provider: (result as any)._provider || input.provider,
          response: content.slice(0, 100),
          duration,
          model: result.model,
        };
      } catch (err: any) {
        return {
          success: false,
          provider: input.provider,
          response: err.message?.slice(0, 200) || "Unknown error",
          duration: 0,
          model: null,
        };
      }
    }),
});
