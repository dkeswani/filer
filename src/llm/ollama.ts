import type { LLMProvider, LLMRequest, LLMResponse } from './types.js';

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const messages = req.messages.map(m => ({
      role:    m.role,
      content: m.content,
    }));

    if (req.system && !messages.find(m => m.role === 'system')) {
      messages.unshift({ role: 'system', content: req.system });
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:    req.model,
        messages,
        stream:   false,
        options:  { temperature: req.temperature, num_predict: req.max_tokens },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama API error ${res.status}: ${err}`);
    }

    const data = await res.json() as {
      message:              { content: string };
      prompt_eval_count?:   number;
      eval_count?:          number;
    };

    return {
      content:       data.message.content,
      input_tokens:  data.prompt_eval_count  ?? 0,
      output_tokens: data.eval_count         ?? 0,
      model:         req.model,
    };
  }
}
