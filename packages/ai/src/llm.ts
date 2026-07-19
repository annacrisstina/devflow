/**
 * The LLM provider seam (ADR-0019). One interface, one implementation:
 * Anthropic's Messages API over plain fetch — the same in-house-client
 * pattern as the GitHub client (ADR-0009): injectable fetch and base URL so
 * tests and the e2e run against a stub, no SDK weight.
 *
 * BYO key by contract: constructing a provider requires a key; a deployment
 * without one simply has no provider (the feature is off, ADR-0017).
 */
export type LlmRequest = {
  system: string;
  prompt: string;
  maxTokens: number;
};

export type LlmResponse = {
  text: string;
  /** The model that actually answered — provenance, stored with the output. */
  model: string;
};

export type LlmProvider = {
  complete: (request: LlmRequest) => Promise<LlmResponse>;
};

export type AnthropicProviderOptions = {
  apiKey: string;
  model: string;
  /** Overridable for tests/stubs; default is the real API. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

const ANTHROPIC_VERSION = '2023-06-01';

export class LlmUpstreamError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createAnthropicProvider(options: AnthropicProviderOptions): LlmProvider {
  const baseUrl = (options.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async complete(request: LlmRequest): Promise<LlmResponse> {
      const response = await fetchImpl(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': options.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: request.maxTokens,
          // Low temperature: hypotheses should be reproducible-ish summaries
          // of the given evidence, not creative writing.
          temperature: 0.2,
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
        }),
      });
      if (!response.ok) {
        // The body may contain provider detail but is not trusted or parsed
        // into the error surface — status is what callers act on.
        throw new LlmUpstreamError(response.status, `LLM API answered ${response.status}`);
      }
      const body = (await response.json()) as {
        model?: string;
        content?: Array<{ type: string; text?: string }>;
      };
      const text = (body.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('');
      if (text === '') {
        throw new LlmUpstreamError(502, 'LLM API returned no text content');
      }
      return { text, model: body.model ?? options.model };
    },
  };
}
