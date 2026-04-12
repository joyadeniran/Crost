// lib/cost-table.ts
// Static pricing table for LLM cost estimation.
// MVP: internal lookup only — no LiteLLM cost API calls.
// Prices in USD per 1,000,000 tokens.
// Server-side only — never import from a client component.

interface ModelPricing {
  prompt: number      // USD per 1M prompt tokens
  completion: number  // USD per 1M completion tokens
}

export const COST_TABLE: Record<string, ModelPricing> = {
  // Groq
  'groq/llama-3.3-70b-versatile': { prompt: 0.59,  completion: 0.79  },
  // Gemini
  'gemini/gemini-2.5-flash':       { prompt: 0.075, completion: 0.30  },
  // Anthropic
  'anthropic/claude-sonnet-4.6':   { prompt: 3.00,  completion: 15.00 },
  'anthropic/claude-opus-4.6':     { prompt: 15.00, completion: 75.00 },
}

// Conservative fallback for unknown models
const DEFAULT_PRICING: ModelPricing = { prompt: 1.00, completion: 3.00 }

/**
 * Estimate cost in USD for an LLM call.
 * Returns a small float, e.g. 0.00000300 for 1,000 tokens at $3/M.
 */
export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = COST_TABLE[model] ?? DEFAULT_PRICING
  const cost =
    (promptTokens    / 1_000_000) * pricing.prompt +
    (completionTokens / 1_000_000) * pricing.completion
  return parseFloat(cost.toFixed(8))
}
