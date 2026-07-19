import { describe, expect, it } from 'vitest';

import { createAnthropicProvider, LlmUpstreamError } from '../src/llm.js';

type Captured = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown, captured: Captured[]): typeof fetch {
  return (async (url: unknown, init: unknown) => {
    captured.push({ url: String(url), init: init as RequestInit });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('anthropic provider', () => {
  it('POSTs the Messages API shape and joins text blocks', async () => {
    const captured: Captured[] = [];
    const provider = createAnthropicProvider({
      apiKey: 'key-1',
      model: 'claude-haiku-4-5',
      baseUrl: 'http://stub.local/',
      fetchImpl: fakeFetch(
        200,
        {
          model: 'claude-haiku-4-5-20251001',
          content: [
            { type: 'text', text: 'Hypothesis 1: ' },
            { type: 'tool_use', id: 'ignored' },
            { type: 'text', text: 'the gateway times out.' },
          ],
        },
        captured,
      ),
    });

    const result = await provider.complete({ system: 'sys', prompt: 'evidence', maxTokens: 800 });
    expect(result).toEqual({
      text: 'Hypothesis 1: the gateway times out.',
      model: 'claude-haiku-4-5-20251001',
    });

    expect(captured[0]!.url).toBe('http://stub.local/v1/messages');
    const headers = captured[0]!.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('key-1');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(captured[0]!.init.body as string);
    expect(body).toMatchObject({
      model: 'claude-haiku-4-5',
      max_tokens: 800,
      system: 'sys',
      messages: [{ role: 'user', content: 'evidence' }],
    });
  });

  it('throws a typed upstream error on non-2xx', async () => {
    const provider = createAnthropicProvider({
      apiKey: 'k',
      model: 'm',
      baseUrl: 'http://stub.local',
      fetchImpl: fakeFetch(429, { error: 'rate limited' }, []),
    });
    await expect(provider.complete({ system: 's', prompt: 'p', maxTokens: 10 })).rejects.toThrow(
      LlmUpstreamError,
    );
  });

  it('treats an empty content array as an upstream error', async () => {
    const provider = createAnthropicProvider({
      apiKey: 'k',
      model: 'm',
      baseUrl: 'http://stub.local',
      fetchImpl: fakeFetch(200, { model: 'm', content: [] }, []),
    });
    await expect(provider.complete({ system: 's', prompt: 'p', maxTokens: 10 })).rejects.toThrow(
      /no text content/,
    );
  });
});
