import type { LLMProvider, LLMRequest, LLMResponse } from './types.js';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? '';
    if (!this.apiKey) throw new Error('OPENAI_API_KEY not set');
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const messages = req.messages.map(m => ({
      role:    m.role,
      content: m.content,
    }));

    // Inject system message if provided separately
    if (req.system && !messages.find(m => m.role === 'system')) {
      messages.unshift({ role: 'system', content: req.system });
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model:       req.model,
        messages,
        max_tokens:  req.max_tokens,
        temperature: req.temperature,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
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
