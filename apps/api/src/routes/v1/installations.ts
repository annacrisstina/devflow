import { installations } from '@devflow/db/schema/tenancy';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { requireSession, requireWorkspaceMember } from '../../auth/guards.js';
import type { ApiConfig } from '../../config.js';
import { createInstallState, verifyInstallState } from '../../github/install-state.js';

export type InstallationRoutesOptions = {
  config: ApiConfig;
};

/**
 * Installation ↔ workspace claiming (ADR-0012). The dashboard asks for a
 * signed install link; GitHub passes the `state` through the App install
 * flow to the Setup URL callback, which binds the installation. Claiming
 * happens ONLY here — there is no unauthenticated path to attach an
 * installation to a workspace.
 */
export const installationRoutes: FastifyPluginAsync<InstallationRoutesOptions> = async (
  app,
  opts,
) => {
  app.post(
    '/api/v1/workspaces/:workspaceId/installations/link',
    { preHandler: [requireSession, requireWorkspaceMember] },
    async (request) => {
      const state = createInstallState(
        opts.config.authSecret,
        request.workspaceId!,
        request.sessionUser!.id,
      );
      return {
        installUrl: `https://github.com/apps/${opts.config.githubAppSlug}/installations/new?state=${state}`,
      };
    },
  );

  /**
   * GitHub's post-install redirect (Setup URL). Browser-facing: outcomes are
   * 302s back into the SPA, not JSON. The claim's authorization is the signed
   * state AND the live session it must match — a forwarded link cannot claim
   * into someone else's flow.
   */
  app.get('/api/github/setup', { preHandler: [requireSession] }, async (request, reply) => {
    const query = request.query as { installation_id?: string; state?: string };

    const state =
      query.state === undefined ? null : verifyInstallState(opts.config.authSecret, query.state);
    if (state === null || state.userId !== request.sessionUser!.id) {
      return reply.redirect('/?install_error=invalid_state');
    }

    let githubInstallationId: bigint;
    try {
      githubInstallationId = BigInt(query.installation_id ?? '');
    } catch {
      return reply.redirect('/?install_error=missing_installation');
    }
    const workspaceId = BigInt(state.workspaceId);

    // Convergent claim: unclaimed row → bind; already ours → no-op success;
    // claimed elsewhere → refuse (an installation has exactly one tenant).
    const existing = await app.db
      .select({ id: installations.id, workspaceId: installations.workspaceId })
      .from(installations)
      .where(eq(installations.githubInstallationId, githubInstallationId))
      .limit(1);
    const row = existing[0];

    if (row === undefined) {
      // Fresh install whose `installation.created` webhook hasn't landed yet
      // (or was missed): the claim itself creates the row; the webhook's
      // upsert will fill account fields when it arrives.
      await app.db
        .insert(installations)
        .values({ githubInstallationId, workspaceId })
        .onConflictDoNothing({ target: installations.githubInstallationId });
    } else if (row.workspaceId === null) {
      await app.db
        .update(installations)
        .set({ workspaceId, updatedAt: new Date() })
        .where(eq(installations.id, row.id));
    } else if (row.workspaceId !== workspaceId) {
      request.log.warn(
        { githubInstallationId: githubInstallationId.toString() },
        'installation claim refused: already owned by another workspace',
      );
      return reply.redirect('/?install_error=already_claimed');
    }

    return reply.redirect(`/workspaces/${workspaceId}?connected=1`);
  });
};
