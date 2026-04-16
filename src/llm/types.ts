// Provider-agnostic LLM interface.
// All enrichment workers call this — never a provider SDK directly.

export interface LLMMessage {
  role:    'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMRequest {
  messages:    LLMMessage[];
  system?:     string;
  model:       string;
  max_tokens:  number;
  temperature: number;
}

export interface LLMResponse {
  content:      string;
  input_tokens: number;
  output_tokens: number;
  model:        string;
}

export interface LLMProvider {
  complete(req: LLMRequest): Promise<LLMResponse>;
  name: string;
}

// ── Cost tracking ─────────────────────────────────────────────────────────────

export interface LLMCost {
  input_tokens:  number;
  output_tokens: number;
  model:         string;
  estimated_usd: number;
}

// Approximate pricing per 1M tokens (update as needed)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6':          { input: 3.00,  output: 15.00  },
  'claude-haiku-4-5-20251001':  { input: 0.80,  output: 4.00   },
  'claude-haiku-4-5':           { input: 0.80,  output: 4.00   },
  'gpt-4o':                     { input: 2.50,  output: 10.00  },
  'gpt-4o-mini':                { input: 0.15,  output: 0.60   },
  'llama3.3':                   { input: 0.00,  output: 0.00   },  // local
};

export function estimateCost(res: LLMResponse): LLMCost {
  const pricing = PRICING[res.model] ?? { input: 3.00, output: 15.00 };
  const usd = (res.input_tokens  / 1_000_000 * pricing.input)
            + (res.output_tokens / 1_000_000 * pricing.output);
  return {
    input_tokens:  res.input_tokens,
    output_tokens: res.output_tokens,
    model:         res.model,
    estimated_usd: Math.round(usd * 10000) / 10000,
  };
}

export function estimateTokenCost(
  input_tokens: number,
  output_tokens: number,
  model: string
): number {
  const pricing = PRICING[model] ?? { input: 3.00, output: 15.00 };
  return (input_tokens  / 1_000_000 * pricing.input)
       + (output_tokens / 1_000_000 * pricing.output);
}
