/**
 * LLM Fallback Provider System
 * 
 * Priority order:
 * 1. Built-in Manus LLM (claude-opus-4-5-20251101, primary — free)
 * 2. OpenAI API (GPT-4o fallback)
 * 3. Anthropic API (Claude Opus 4, last resort)
 * 
 * Auto-detects quota exhaustion (412/429) and switches to next provider.
 * Tracks provider health and avoids repeatedly hitting exhausted providers.
 */

import { ENV } from "./_core/env";
import type { InvokeParams, InvokeResult, Message, Tool, ToolChoice, ResponseFormat } from "./_core/llm";

// ─── Provider Types ───

type ProviderName = "builtin" | "openai" | "anthropic";

interface ProviderConfig {
  name: ProviderName;
  label: string;
  isAvailable: () => boolean;
  invoke: (params: InvokeParams) => Promise<InvokeResult>;
}

interface ProviderHealth {
  lastError: string | null;
  lastErrorTime: number | null;
  consecutiveFailures: number;
  isQuotaExhausted: boolean;
  quotaExhaustedAt: number | null;
  totalCalls: number;
  totalFailures: number;
}

// ─── Provider Health Tracking ───

const providerHealth: Record<ProviderName, ProviderHealth> = {
  builtin: { lastError: null, lastErrorTime: null, consecutiveFailures: 0, isQuotaExhausted: false, quotaExhaustedAt: null, totalCalls: 0, totalFailures: 0 },
  openai: { lastError: null, lastErrorTime: null, consecutiveFailures: 0, isQuotaExhausted: false, quotaExhaustedAt: null, totalCalls: 0, totalFailures: 0 },
  anthropic: { lastError: null, lastErrorTime: null, consecutiveFailures: 0, isQuotaExhausted: false, quotaExhaustedAt: null, totalCalls: 0, totalFailures: 0 },
};

// Quota exhaustion cooldown: retry after 1 hour
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000;

function isQuotaError(error: string): boolean {
  const quotaPatterns = [
    "usage exhausted",
    "quota exceeded",
    "rate limit",
    "429",
    "412 Precondition Failed",
    "insufficient_quota",
    "billing_hard_limit_reached",
    "overloaded",
    "credit balance is too low",
    "credit balance",
    "purchase credits",
    "400 Bad Request",
  ];
  const lower = error.toLowerCase();
  return quotaPatterns.some(p => lower.includes(p.toLowerCase()));
}

function markProviderError(name: ProviderName, error: string) {
  const h = providerHealth[name];
  h.lastError = error;
  h.lastErrorTime = Date.now();
  h.consecutiveFailures++;
  h.totalFailures++;
  
  if (isQuotaError(error)) {
    h.isQuotaExhausted = true;
    h.quotaExhaustedAt = Date.now();
    console.log(`[LLM-Fallback] ⚠️ ${name} quota exhausted, will retry after cooldown`);
  }
}

function markProviderSuccess(name: ProviderName) {
  const h = providerHealth[name];
  h.consecutiveFailures = 0;
  h.lastError = null;
  h.isQuotaExhausted = false;
  h.quotaExhaustedAt = null;
}

function isProviderHealthy(name: ProviderName): boolean {
  const h = providerHealth[name];
  
  // If quota exhausted, check if cooldown has passed
  if (h.isQuotaExhausted && h.quotaExhaustedAt) {
    if (Date.now() - h.quotaExhaustedAt < QUOTA_COOLDOWN_MS) {
      return false; // Still in cooldown
    }
    // Cooldown passed, allow retry
    h.isQuotaExhausted = false;
  }
  
  // If too many consecutive failures (non-quota), back off
  if (h.consecutiveFailures >= 5) {
    // Allow retry after 5 minutes
    if (h.lastErrorTime && Date.now() - h.lastErrorTime < 5 * 60 * 1000) {
      return false;
    }
    h.consecutiveFailures = 0; // Reset for retry
  }
  
  return true;
}

// ─── Normalize Messages for Different Providers ───

function normalizeContentPart(part: any): any {
  if (typeof part === "string") return { type: "text", text: part };
  return part;
}

function normalizeMessage(msg: Message): any {
  const content = Array.isArray(msg.content)
    ? msg.content.map(normalizeContentPart)
    : (typeof msg.content === "string" ? msg.content : [normalizeContentPart(msg.content)]);
  
  // Collapse single text content
  if (Array.isArray(content) && content.length === 1 && content[0].type === "text") {
    return { role: msg.role, content: content[0].text, ...(msg.name ? { name: msg.name } : {}), ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}) };
  }
  
  return { role: msg.role, content, ...(msg.name ? { name: msg.name } : {}), ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}) };
}

// ─── Built-in Provider ───

async function invokeBuiltin(params: InvokeParams): Promise<InvokeResult> {
  const apiUrl = ENV.forgeApiUrl?.trim()
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";

  // Use faster model for chat (maxTokens <= 2000 = Telegram chat)
  const isChatMode = (params.maxTokens || params.max_tokens || 32768) <= 2000;
  const model = isChatMode ? "claude-sonnet-4-20250514" : "claude-opus-4-5-20251101";
  
  const payload: Record<string, unknown> = {
    model,
    messages: params.messages.map(normalizeMessage),
    max_tokens: isChatMode ? 2000 : 32768,
    // Only use thinking for heavy tasks, not chat
    ...(isChatMode ? {} : { thinking: { budget_tokens: 10240 } }),
  };

  if (params.tools?.length) payload.tools = params.tools;
  
  const tc = params.toolChoice || params.tool_choice;
  if (tc) {
    if (tc === "required" && params.tools?.length === 1) {
      payload.tool_choice = { type: "function", function: { name: params.tools[0].function.name } };
    } else if (tc !== "required") {
      payload.tool_choice = tc;
    }
  }

  const rf = params.responseFormat || params.response_format;
  if (rf) payload.response_format = rf;

  // Add timeout: 30s for chat, 120s for heavy tasks
  const timeoutMs = isChatMode ? 30_000 : 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  return (await response.json()) as InvokeResult;
}

// ─── OpenAI Provider ───

async function invokeOpenAI(params: InvokeParams): Promise<InvokeResult> {
  const payload: Record<string, unknown> = {
    model: "gpt-4o",
    messages: params.messages.map(normalizeMessage),
    max_tokens: 16384,
  };

  if (params.tools?.length) payload.tools = params.tools;
  
  const tc = params.toolChoice || params.tool_choice;
  if (tc) {
    if (tc === "required" && params.tools?.length === 1) {
      payload.tool_choice = { type: "function", function: { name: params.tools[0].function.name } };
    } else if (tc !== "required") {
      payload.tool_choice = tc;
    }
  }

  const rf = params.responseFormat || params.response_format;
  if (rf) payload.response_format = rf;

  // Add 30s timeout for OpenAI
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.openaiApiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  return (await response.json()) as InvokeResult;
}

// ─── Anthropic Provider ───

function convertToAnthropicMessages(messages: Message[]): { system: string; messages: any[] } {
  let systemPrompt = "";
  const anthropicMessages: any[] = [];

  for (const msg of messages) {
    const normalized = normalizeMessage(msg);
    
    if (normalized.role === "system") {
      systemPrompt += (systemPrompt ? "\n\n" : "") + (typeof normalized.content === "string" ? normalized.content : JSON.stringify(normalized.content));
      continue;
    }

    // Anthropic uses "user" and "assistant" roles
    if (normalized.role === "user" || normalized.role === "assistant") {
      anthropicMessages.push({
        role: normalized.role,
        content: normalized.content,
      });
    } else if (normalized.role === "tool") {
      // Convert tool responses to user messages for Anthropic
      anthropicMessages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: normalized.tool_call_id || "unknown", content: typeof normalized.content === "string" ? normalized.content : JSON.stringify(normalized.content) }],
      });
    }
  }

  return { system: systemPrompt, messages: anthropicMessages };
}

async function invokeAnthropic(params: InvokeParams): Promise<InvokeResult> {
  const { system, messages } = convertToAnthropicMessages(params.messages);

  const payload: Record<string, unknown> = {
    model: "claude-opus-4-6",
    max_tokens: 16384,
    messages,
  };

  if (system) payload.system = system;

  if (params.tools?.length) {
    payload.tools = params.tools.map(t => ({
      name: t.function.name,
      description: t.function.description || "",
      input_schema: t.function.parameters || { type: "object", properties: {} },
    }));
  }

  // Add 30s timeout for Anthropic
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ENV.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const anthropicResult = await response.json();

  // Convert Anthropic response to OpenAI-compatible format
  const textContent = anthropicResult.content
    ?.filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("") || "";

  const toolCalls = anthropicResult.content
    ?.filter((c: any) => c.type === "tool_use")
    .map((c: any) => ({
      id: c.id,
      type: "function" as const,
      function: {
        name: c.name,
        arguments: JSON.stringify(c.input),
      },
    }));

  return {
    id: anthropicResult.id || `anthropic-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: anthropicResult.model || "claude-opus-4-6",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: textContent,
        ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: anthropicResult.stop_reason === "end_turn" ? "stop" : (anthropicResult.stop_reason || "stop"),
    }],
    usage: anthropicResult.usage ? {
      prompt_tokens: anthropicResult.usage.input_tokens || 0,
      completion_tokens: anthropicResult.usage.output_tokens || 0,
      total_tokens: (anthropicResult.usage.input_tokens || 0) + (anthropicResult.usage.output_tokens || 0),
    } : undefined,
  };
}

// ─── Provider Registry ───

const providers: ProviderConfig[] = [
  {
    name: "builtin",
    label: "Built-in Manus LLM",
    isAvailable: () => !!ENV.forgeApiKey,
    invoke: invokeBuiltin,
  },
  {
    name: "openai",
    label: "OpenAI (GPT-4o)",
    isAvailable: () => !!ENV.openaiApiKey,
    invoke: invokeOpenAI,
  },
  {
    name: "anthropic",
    label: "Anthropic (Claude Opus 4)",
    isAvailable: () => !!ENV.anthropicApiKey,
    invoke: invokeAnthropic,
  },
];

// ─── Main Fallback Invoker ───

export async function invokeLLMWithFallback(params: InvokeParams): Promise<InvokeResult & { _provider?: ProviderName }> {
  const errors: string[] = [];

  for (const provider of providers) {
    // Skip if no API key configured
    if (!provider.isAvailable()) continue;

    // Skip if provider is unhealthy (quota exhausted or too many failures)
    if (!isProviderHealthy(provider.name)) {
      console.log(`[LLM-Fallback] Skipping ${provider.name} (unhealthy)`);
      continue;
    }

    try {
      providerHealth[provider.name].totalCalls++;
      console.log(`[LLM-Fallback] Trying ${provider.label}...`);
      
      const result = await provider.invoke(params);
      markProviderSuccess(provider.name);
      
      console.log(`[LLM-Fallback] ✅ ${provider.label} succeeded`);
      return { ...result, _provider: provider.name };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      markProviderError(provider.name, errorMsg);
      errors.push(`${provider.label}: ${errorMsg}`);
      console.log(`[LLM-Fallback] ❌ ${provider.label} failed: ${errorMsg.slice(0, 200)}`);
      
      // If it's NOT a quota error, don't try fallback (it might be a bad request)
      if (!isQuotaError(errorMsg) && !errorMsg.includes("500") && !errorMsg.includes("503")) {
        throw err; // Re-throw non-quota errors immediately
      }
      
      // Continue to next provider for quota/server errors
      continue;
    }
  }

  // All providers failed
  throw new Error(`All LLM providers failed:\n${errors.join("\n")}`);
}

// ─── Status & Management ───

export function getLLMProviderStatus(): Array<{
  name: ProviderName;
  label: string;
  isConfigured: boolean;
  isHealthy: boolean;
  health: ProviderHealth;
}> {
  return providers.map(p => ({
    name: p.name,
    label: p.label,
    isConfigured: p.isAvailable(),
    isHealthy: p.isAvailable() && isProviderHealthy(p.name),
    health: { ...providerHealth[p.name] },
  }));
}

export function resetProviderHealth(name?: ProviderName) {
  const targets = name ? [name] : (Object.keys(providerHealth) as ProviderName[]);
  for (const t of targets) {
    providerHealth[t] = {
      lastError: null,
      lastErrorTime: null,
      consecutiveFailures: 0,
      isQuotaExhausted: false,
      quotaExhaustedAt: null,
      totalCalls: providerHealth[t].totalCalls,
      totalFailures: providerHealth[t].totalFailures,
    };
  }
}

export function getActiveProvider(): ProviderName | null {
  for (const p of providers) {
    if (p.isAvailable() && isProviderHealthy(p.name)) return p.name;
  }
  return null;
}
