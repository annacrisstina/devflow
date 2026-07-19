import type { FastifyReply } from 'fastify';

/**
 * The one error shape of the public API (ADR-0014): a machine-readable code
 * and a human-readable message. Codes are stable API surface; messages are
 * not.
 */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
): FastifyReply {
  const body: ApiErrorBody = { error: { code, message } };
  return reply.status(status).send(body);
}
