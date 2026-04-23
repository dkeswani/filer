import type { LLMProvider, LLMRequest, LLMResponse, LLMCost } from './types.js';
import { estimateCost } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider }   from './openai.js';
import { OllamaProvider }   from './ollama.js';
import { KimiProvider }     from './kimi.js';
import type { FilerConfig }  from '../schema/mod.js';

// ── Task routing table ────────────────────────────────────────────────────────
// Maps task types to which model tier to use

export type LLMTask =
  | 'extract.full'       // full module extraction — deep model
  | 'extract.update'     // incremental update — indexing model
  | 'extract.prefilter'  // pre-filter pass — indexing model (cheap)
  | 'learn.classify'     // classify PR review comment signal — indexing model
  | 'learn.propose'      // propose new node from review pattern — deep model
  | 'query.answer'       // answer a natural language query — deep model
  | 'verify.check'       // staleness check — indexing model
  | 'conflict.detect'   // node conflict detection — indexing model (lightweight classification)
  | 'agent.reason';      // ReAct agent reasoning — deep model

// ── Gateway ───────────────────────────────────────────────────────────────────

export class LLMGateway {
  private provider:  LLMProvider;
  private config:    FilerConfig;
  private totalCost: number = 0;
  private calls:     number = 0;

  constructor(config: FilerConfig) {
    this.config   = config;
    this.provider = createProvider(config);
  }

  // ── Main completion method with retry ────────────────────────────────────

  async complete(
    task:     LLMTask,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    opts:     { system?: string; max_tokens?: number; temperature?: number } = {}
  ): Promise<LLMResponse> {
    const model  = this.modelForTask(task);
    const req: LLMRequest = {
      messages,
      system:      opts.system,
      model,
      max_tokens:  opts.max_tokens  ?? 4096,
      temperature: opts.temperature ?? 0.1,
    };

    const response = await this.withRetry(req);
    const cost     = estimateCost(response);
    this.totalCost += cost.estimated_usd;
    this.calls++;
    return response;
  }

  // ── JSON completion — parses and retries on invalid JSON ──────────────────

  async completeJSON<T>(
    task:     LLMTask,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    opts:     { system?: string; max_tokens?: number } = {}
  ): Promise<T> {
    const response = await this.complete(task, messages, {
      ...opts,
      temperature: 0.0,  // deterministic for JSON output
    });

    return parseJSON<T>(response.content);
  }

  // ── Cost estimation (no API call) ─────────────────────────────────────────

  estimateCost(task: LLMTask, inputTokens: number): number {
    const model = this.modelForTask(task);
    // Rough estimate: output ~20% of input for extraction tasks
    const outputTokens = Math.round(inputTokens * 0.2);
    const { estimateTokenCost } = require('./types.js') as typeof import('./types.js');
    return estimateTokenCost(inputTokens, outputTokens, model);
  }

  // ── Session stats ─────────────────────────────────────────────────────────

  sessionStats(): { calls: number; estimated_usd: number } {
    return { calls: this.calls, estimated_usd: Math.round(this.totalCost * 10000) / 10000 };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private modelForTask(task: LLMTask): string {
    const { llm } = this.config;
    const deepTasks: LLMTask[] = ['extract.full', 'learn.propose', 'query.answer', 'agent.reason'];
    return deepTasks.includes(task) ? llm.deep_model : llm.indexing_model;
  }

  private async withRetry(req: LLMRequest, maxRetries = 3): Promise<LLMResponse> {
    let lastErr: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.provider.complete(req);
      } catch (err) {
        lastErr = err as Error;
        const isRateLimit = lastErr.message.includes('rate_limit') ||
                            lastErr.message.includes('429') ||
                            lastErr.message.includes('overloaded');

        if (!isRateLimit || attempt === maxRetries) break;

        // Exponential backoff: 2s, 4s, 8s
        const delay = Math.pow(2, attempt) * 1000;
        process.stderr.write(`  LLM rate limited. Retrying in ${delay / 1000}s...\n`);
        await sleep(delay);
      }
    }

    throw lastErr ?? new Error('LLM request failed');
  }
}

// ── Provider factory ──────────────────────────────────────────────────────────

export function createProvider(config: FilerConfig): LLMProvider {
  switch (config.llm.provider) {
    case 'anthropic':
      return new AnthropicProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'ollama':
      return new OllamaProvider(config.llm.base_url);
    case 'kimi':
      return new KimiProvider();
    default:
      throw new Error(`Unknown LLM provider: ${config.llm.provider}`);
  }
}

// ── JSON parser with cleanup ──────────────────────────────────────────────────

export function parseJSON<T>(raw: string): T {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/\s*```$/m, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to find a JSON array or object in the response
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) return JSON.parse(arrayMatch[0]) as T;

    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) return JSON.parse(objMatch[0]) as T;

    throw new Error(`Failed to parse LLM JSON response.\nRaw: ${raw.slice(0, 500)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
