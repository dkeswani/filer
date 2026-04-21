import type { LLMProvider, LLMRequest, LLMResponse } from './types.js';

const KIMI_BASE_URL = 'https://api.moonshot.ai/v1';

export class KimiProvider implements LLMProvider {
  readonly name = 'kimi';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.MOONSHOT_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error(
        'MOONSHOT_API_KEY not set.\n' +
        '  Get a key at: platform.moonshot.ai\n' +
        '  Then: export MOONSHOT_API_KEY=sk-...'
      );
    }
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const messages = req.messages.map(m => ({ role: m.role, content: m.content }));

    if (req.system && !messages.find(m => m.role === 'system')) {
      messages.unshift({ role: 'system', content: req.system });
    }

    const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model:       req.model,
        messages,
        max_tokens:  req.max_tokens,
        temperature: req.temperature ?? 0.6,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Kimi API error ${res.status}: ${err}`);
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
      usage:   { prompt_tokens: number; completion_tokens: number };
      model:   string;
    };

    return {
      content:       data.choices[0]?.message?.content ?? '',
      input_tokens:  data.usage.prompt_tokens,
      output_tokens: data.usage.completion_tokens,
      model:         data.model,
    };
  }
}
