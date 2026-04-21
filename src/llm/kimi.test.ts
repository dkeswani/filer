import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KimiProvider } from './kimi.js';

const mockResponse = (body: object) =>
  Promise.resolve({
    ok:   true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(''),
  } as Response);

const successBody = {
  choices: [{ message: { content: 'result code' } }],
  usage:   { prompt_tokens: 100, completion_tokens: 50 },
  model:   'kimi-k2.6',
};

describe('KimiProvider', () => {
  let origKey: string | undefined;

  beforeEach(() => {
    origKey = process.env.MOONSHOT_API_KEY;
    process.env.MOONSHOT_API_KEY = 'sk-test-key';
  });

  afterEach(() => {
    if (origKey === undefined) {
      delete process.env.MOONSHOT_API_KEY;
    } else {
      process.env.MOONSHOT_API_KEY = origKey;
    }
    vi.restoreAllMocks();
  });

  it('throws if MOONSHOT_API_KEY is not set', () => {
    delete process.env.MOONSHOT_API_KEY;
    expect(() => new KimiProvider()).toThrow('MOONSHOT_API_KEY');
  });

  it('uses Moonshot base URL in requests', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(successBody) as any);
    const provider = new KimiProvider();
    await provider.complete({ messages: [{ role: 'user', content: 'hi' }], model: 'kimi-k2.6', max_tokens: 100, temperature: 0.6 });
    expect(spy.mock.calls[0][0]).toContain('api.moonshot.ai');
  });

  it('injects system message as first message when provided', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(successBody) as any);
    const provider = new KimiProvider();
    await provider.complete({
      messages: [{ role: 'user', content: 'hi' }],
      system:   'You are a helpful assistant.',
      model:    'kimi-k2.6',
      max_tokens: 100,
      temperature: 0.6,
    });
    const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('You are a helpful assistant.');
  });

  it('uses temperature 0.6 when req.temperature is undefined', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(successBody) as any);
    const provider = new KimiProvider();
    // Cast omits temperature to trigger the ?? default
    const req = { messages: [{ role: 'user' as const, content: 'hi' }], model: 'kimi-k2.6', max_tokens: 100 } as any;
    await provider.complete(req);
    const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
    expect(body.temperature).toBe(0.6);
  });

  it('respects explicit temperature when non-zero', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(successBody) as any);
    const provider = new KimiProvider();
    await provider.complete({ messages: [{ role: 'user', content: 'hi' }], model: 'kimi-k2.6', max_tokens: 100, temperature: 1.0 });
    const body = JSON.parse(spy.mock.calls[0][1]!.body as string);
    expect(body.temperature).toBe(1.0);
  });

  it('maps response fields to LLMResponse correctly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse(successBody) as any);
    const provider = new KimiProvider();
    const res = await provider.complete({ messages: [{ role: 'user', content: 'hi' }], model: 'kimi-k2.6', max_tokens: 100, temperature: 0.6 });
    expect(res.content).toBe('result code');
    expect(res.input_tokens).toBe(100);
    expect(res.output_tokens).toBe(50);
    expect(res.model).toBe('kimi-k2.6');
  });

  it('throws on non-OK API response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false, status: 401, text: () => Promise.resolve('Unauthorized'),
    } as any);
    const provider = new KimiProvider();
    await expect(
      provider.complete({ messages: [{ role: 'user', content: 'hi' }], model: 'kimi-k2.6', max_tokens: 100, temperature: 0.6 })
    ).rejects.toThrow('Kimi API error 401');
  });
});
