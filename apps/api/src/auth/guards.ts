import { workspaceMembers } from '@devflow/db/schema/tenancy';
import { and, eq } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { sendError } from '../http/errors.js';
import { resolveSessionUser, type SessionUser } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireSession; absent means the request is unauthenticated. */
    sessionUser?: SessionUser;
    /** Set by requireWorkspaceMember after membership is proven. */
    workspaceId?: bigint;
  }
}

/**
 * Tenant-isolation chokepoint #1 (ADR-0012): every /api/v1 route runs these
 * preHandlers. Chokepoint #2 is data access taking workspaceId as a required
 * argument. The guard that this isn't "developer discipline alone" is the
 * cross-tenant denial integration test per endpoint.
 */
export async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await resolveSessionUser(request.server.db, request.headers.cookie);
  if (user === null) {
    await sendError(reply, 401, 'unauthenticated', 'Sign in to use the API.');
    return;
  }
  request.sessionUser = user;
}

/**
 * Resolves `:workspaceId` and proves membership. Non-members get 404, not
 * 403 — workspace ids must not be an existence oracle.
 */
export async function requireWorkspaceMember(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // requireSession runs first in the preHandler chain.
  const user = request.sessionUser;
  if (user === undefined) {
    await sendError(reply, 401, 'unauthenticated', 'Sign in to use the API.');
    return;
  }

  const params = request.params as { workspaceId?: string };
  let workspaceId: bigint;
  try {
    workspaceId = BigInt(params.workspaceId ?? '');
  } catch {
    await sendError(reply, 404, 'not_found', 'Workspace not found.');
    return;
  }

  const membership = await request.server.db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)))
    .limit(1);

  if (membership.length === 0) {
    await sendError(reply, 404, 'not_found', 'Workspace not found.');
    return;
  }
  request.workspaceId = workspaceId;
}
