import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMRequest, LLMResponse } from './types.js';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const messages = req.messages.map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })).filter(m => m.role !== 'system' as any);

    const response = await this.client.messages.create({
      model:      req.model,
      max_tokens: req.max_tokens,
      system:     req.system ?? req.messages.find(m => m.role === 'system')?.content,
      messages,
      ...(req.temperature !== undefined ? {} : {}),  // Anthropic ignores temp on some models
    });

    const content = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

    return {
      content,
      input_tokens:  response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      model:         response.model,
    };
  }
}
