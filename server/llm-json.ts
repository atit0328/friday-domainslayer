/**
 * Robust LLM JSON Parser
 * 
 * LLM responses often contain invalid JSON due to:
 * 1. Unescaped quotes inside string values (especially in long content)
 * 2. Markdown code blocks wrapping the JSON
 * 3. Trailing commas
 * 4. Control characters in strings
 * 
 * This utility handles all these cases gracefully.
 */

import { invokeLLM } from "./_core/llm";

/**
 * Clean and parse JSON from LLM output
 * Handles markdown code blocks, trailing commas, and control characters
 */
export function parseLLMJson<T>(raw: string): T {
  // Step 1: Remove markdown code blocks
  let text = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Step 2: Try direct parse first (fastest path)
  try {
    return JSON.parse(text) as T;
  } catch {
    // Continue to repair
  }

  // Step 3: Extract JSON object/array from surrounding text
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    text = jsonMatch[1];
  }

  // Step 4: Fix common LLM JSON issues
  // Remove trailing commas before } or ]
  text = text.replace(/,\s*([\]}])/g, "$1");

  // Step 5: Try parse again
  try {
    return JSON.parse(text) as T;
  } catch {
    // Continue to more aggressive repair
  }

  // Step 6: For content with long strings that have unescaped newlines/quotes
  // Try to fix by escaping problematic characters inside string values
  try {
    // Replace literal newlines and control chars with escaped versions
    const fixed = text
      .replace(/\r\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      // Remove control characters except those already escaped
      .replace(/[\x00-\x1f]/g, (ch) => {
        if (ch === '\n') return '\\n';
        if (ch === '\r') return '\\r';
        if (ch === '\t') return '\\t';
        return '';
      });
    return JSON.parse(fixed) as T;
  } catch {
    // Continue
  }

  // Step 7: Last resort — try to extract key fields manually for known structures
  // This handles the case where content field has unescaped quotes
  try {
    // Find the last valid JSON by progressively trimming
    for (let i = text.length - 1; i > text.length / 2; i--) {
      const candidate = text.substring(0, i) + (text[i - 1] === "}" || text[i - 1] === "]" ? "" : "}");
      try {
        return JSON.parse(candidate) as T;
      } catch {
        continue;
      }
    }
  } catch {
    // Give up on progressive trimming
  }

  throw new Error(`Failed to parse LLM JSON response. First 500 chars: ${text.substring(0, 500)}`);
}

/**
 * Call LLM and parse response as JSON with robust error handling
 * If first attempt fails, retries with explicit JSON instruction
 */
export async function llmJsonCall<T>(
  systemPrompt: string,
  userPrompt: string,
  fallback?: T,
): Promise<T> {
  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);

  try {
    return parseLLMJson<T>(text);
  } catch (firstError: any) {
    // Retry with explicit JSON-only instruction
    try {
      const retryResponse = await invokeLLM({
        messages: [
          { role: "system", content: "You MUST respond with valid JSON only. No markdown, no explanation, no code blocks. Just pure JSON." },
          { role: "user", content: `The previous response was not valid JSON. Please fix and return ONLY valid JSON:\n\n${text.substring(0, 3000)}` },
        ],
      });
      const retryContent = retryResponse.choices[0]?.message?.content;
      const retryText = typeof retryContent === "string" ? retryContent : JSON.stringify(retryContent);
      return parseLLMJson<T>(retryText);
    } catch {
      if (fallback !== undefined) return fallback;
      throw new Error(`LLM JSON parse failed after retry: ${firstError.message}`);
    }
  }
}

/**
 * Specialized: Generate SEO content with structured output
 * Uses response_format to force valid JSON from the LLM
 */
export async function llmStructuredContent(
  keyword: string,
  domain: string,
  niche: string,
  wordCount: number = 1500,
): Promise<{ title: string; content: string; metaDescription: string; targetKeyword: string }> {
  // Use response_format for structured output — guarantees valid JSON
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert SEO content writer. Create high-quality, keyword-optimized content. 
Include proper heading structure (H2, H3), natural keyword placement (1-2% density), and LSI keywords.
Write in an authoritative, expert tone. Content should be in HTML format (not markdown).`,
      },
      {
        role: "user",
        content: `Write an SEO article for "${domain}" targeting "${keyword}" in "${niche}" niche. ~${wordCount} words.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "seo_content",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "SEO-optimized title with keyword" },
            content: { type: "string", description: "Full article in HTML format with h2/h3 headings" },
            metaDescription: { type: "string", description: "Meta description 150-160 chars" },
            targetKeyword: { type: "string", description: "The target keyword" },
          },
          required: ["title", "content", "metaDescription", "targetKeyword"],
          additionalProperties: false,
        },
      },
    },
  });

  const text = response.choices[0]?.message?.content;
  const parsed = typeof text === "string" ? JSON.parse(text) : text;
  return parsed;
}
