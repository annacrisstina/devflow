import type { ApiError } from '@devflow/contract/api';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Same-origin fetch wrapper for /api/v1 (ADR-0014): session cookie rides
 * automatically; non-2xx responses become typed errors carrying the API's
 * stable error code.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      // Only claim a JSON body when one exists: Fastify (correctly) rejects
      // an empty body under a JSON content-type with 400.
      ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let code = 'unknown';
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as ApiError;
      code = body.error.code;
      message = body.error.message;
    } catch {
      // Non-JSON error body (proxy, crash page): keep the generic message.
    }
    throw new ApiRequestError(response.status, code, message);
  }
  return (await response.json()) as T;
}
