import type { FlakyTestSummary, QuarantineRecord } from '@devflow/contract/api';
import { users } from '@devflow/db/schema/auth';
import { testFlakeScores } from '@devflow/db/schema/flake-scores';
import { quarantineRecords } from '@devflow/db/schema/quarantine';
import { repositories } from '@devflow/db/schema/runs';
import { installations } from '@devflow/db/schema/tenancy';
import { and, desc, eq, inArray, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { FastifyPluginAsync } from 'fastify';

import { requireSession, requireWorkspaceMember } from '../../auth/guards.js';
import { effectiveScoreSql, type FlakeReadConfig } from '../../flake/effective-score.js';
import { sendError } from '../../http/errors.js';

export type QuarantineRoutesOptions = {
  flake: FlakeReadConfig;
};

/**
 * The quarantine workflow (ADR-0016). Proposals are a QUERY — tests whose
 * effective verdict is `flaky` with no active/dismissed record — so nothing
 * automated ever writes quarantine state. The only writers are the humans
 * behind these endpoints (D14 made structural).
 */
export const quarantineRoutes: FastifyPluginAsync<QuarantineRoutesOptions> = async (app, opts) => {
  const liftedByUsers = alias(users, 'lifted_by_users');

  app.get(
    '/api/v1/workspaces/:workspaceId/quarantine/proposals',
    { preHandler: [requireSession, requireWorkspaceMember] },
    async (request) => {
      const workspaceId = request.workspaceId!;
      const effective = effectiveScoreSql(
        opts.flake,
        new Date(),
        testFlakeScores.score,
        testFlakeScores.computedAt,
      );

      // A dismissed record suppresses re-proposal (visible under ?status=
      // dismissed and reversible by approving from there); an active one
      // means it's already quarantined; lifted identities may return.
      const suppressed = app.db
        .select({ one: sql`1` })
        .from(quarantineRecords)
        .where(
          and(
            eq(quarantineRecords.repositoryId, testFlakeScores.repositoryId),
            eq(quarantineRecords.suiteName, testFlakeScores.suiteName),
            eq(quarantineRecords.className, testFlakeScores.className),
            eq(quarantineRecords.testName, testFlakeScores.testName),
            inArray(quarantineRecords.status, ['active', 'dismissed']),
          ),
        );

      const rows = await app.db
        .select({
          id: testFlakeScores.id,
          repositoryId: repositories.id,
          owner: repositories.owner,
          name: repositories.name,
          suiteName: testFlakeScores.suiteName,
          className: testFlakeScores.className,
          testName: testFlakeScores.testName,
          score: testFlakeScores.score,
          effective: effective.as('effective_score'),
          divergenceEvidence: testFlakeScores.divergenceEvidence,
          transitionEvidence: testFlakeScores.transitionEvidence,
          lastFailureAt: testFlakeScores.lastFailureAt,
          computedAt: testFlakeScores.computedAt,
        })
        .from(testFlakeScores)
        .innerJoin(repositories, eq(testFlakeScores.repositoryId, repositories.id))
        .innerJoin(
          installations,
          eq(repositories.installationId, installations.githubInstallationId),
        )
        .where(
          and(
            eq(installations.workspaceId, workspaceId),
            sql`${effective} >= ${opts.flake.flakyThreshold}`,
            notExists(suppressed),
          ),
        )
        .orderBy(desc(sql`effective_score`));

      const items: FlakyTestSummary[] = rows.map((row) => ({
        id: row.id.toString(),
        repositoryId: row.repositoryId.toString(),
        repository: `${row.owner}/${row.name}`,
        suiteName: row.suiteName,
        className: row.className,
        testName: row.testName,
        storedScore: row.score,
        effectiveScore: Number(row.effective),
        verdict: 'flaky',
        divergenceEvidence: row.divergenceEvidence,
        transitionEvidence: row.transitionEvidence,
        lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
        computedAt: row.computedAt.toISOString(),
      }));
      return { items };
    },
  );

  app.get(
    '/api/v1/workspaces/:workspaceId/quarantine',
    {
      preHandler: [requireSession, requireWorkspaceMember],
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['active', 'dismissed', 'lifted'], default: 'active' },
          },
        },
      },
    },
    async (request) => {
      const workspaceId = request.workspaceId!;
      const { status } = request.query as { status: 'active' | 'dismissed' | 'lifted' };

      const rows = await app.db
        .select({
          record: quarantineRecords,
          owner: repositories.owner,
          name: repositories.name,
          createdByName: users.name,
          liftedByName: liftedByUsers.name,
        })
        .from(quarantineRecords)
        .innerJoin(repositories, eq(quarantineRecords.repositoryId, repositories.id))
        .innerJoin(
          installations,
          eq(repositories.installationId, installations.githubInstallationId),
        )
        .leftJoin(users, eq(quarantineRecords.createdBy, users.id))
        .leftJoin(liftedByUsers, eq(quarantineRecords.liftedBy, liftedByUsers.id))
        .where(
          and(eq(installations.workspaceId, workspaceId), eq(quarantineRecords.status, status)),
        )
        .orderBy(desc(quarantineRecords.createdAt));

      const items: QuarantineRecord[] = rows.map((row) => ({
        id: row.record.id.toString(),
        repositoryId: row.record.repositoryId.toString(),
        repository: `${row.owner}/${row.name}`,
        suiteName: row.record.suiteName,
        className: row.record.className,
        testName: row.record.testName,
        status: row.record.status as QuarantineRecord['status'],
        reason: row.record.reason,
        createdAt: row.record.createdAt.toISOString(),
        createdBy: row.createdByName,
        liftedAt: row.record.liftedAt?.toISOString() ?? null,
        liftedBy: row.liftedByName,
      }));
      return { items };
    },
  );

  app.post(
    '/api/v1/workspaces/:workspaceId/quarantine',
    {
      preHandler: [requireSession, requireWorkspaceMember],
      schema: {
        body: {
          type: 'object',
          required: ['scoreId', 'action'],
          additionalProperties: false,
          properties: {
            scoreId: { type: 'string', minLength: 1 },
            action: { type: 'string', enum: ['approve', 'dismiss'] },
            reason: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const workspaceId = request.workspaceId!;
      const user = request.sessionUser!;
      const body = request.body as {
        scoreId: string;
        action: 'approve' | 'dismiss';
        reason?: string;
      };

      let scoreId: bigint;
      try {
        scoreId = BigInt(body.scoreId);
      } catch {
        return sendError(reply, 404, 'not_found', 'Flaky test not found.');
      }

      // The score is the proposal's identity source; it must be visible from
      // this workspace or the proposal does not exist here.
      const scoreRows = await app.db
        .select({
          repositoryId: testFlakeScores.repositoryId,
          suiteName: testFlakeScores.suiteName,
          className: testFlakeScores.className,
          testName: testFlakeScores.testName,
        })
        .from(testFlakeScores)
        .innerJoin(repositories, eq(testFlakeScores.repositoryId, repositories.id))
        .innerJoin(
          installations,
          eq(repositories.installationId, installations.githubInstallationId),
        )
        .where(and(eq(testFlakeScores.id, scoreId), eq(installations.workspaceId, workspaceId)))
        .limit(1);
      const score = scoreRows[0];
      if (score === undefined) {
        return sendError(reply, 404, 'not_found', 'Flaky test not found.');
      }

      const existing = await app.db
        .select({ status: quarantineRecords.status })
        .from(quarantineRecords)
        .where(
          and(
            eq(quarantineRecords.repositoryId, score.repositoryId),
            eq(quarantineRecords.suiteName, score.suiteName),
            eq(quarantineRecords.className, score.className),
            eq(quarantineRecords.testName, score.testName),
            inArray(quarantineRecords.status, ['active', 'dismissed']),
          ),
        );
      const hasActive = existing.some((row) => row.status === 'active');
      if (hasActive) {
        return sendError(reply, 409, 'already_quarantined', 'This test is already quarantined.');
      }
      if (body.action === 'dismiss' && existing.length > 0) {
        return sendError(reply, 409, 'already_dismissed', 'This proposal was already dismissed.');
      }

      const inserted = await app.db
        .insert(quarantineRecords)
        .values({
          repositoryId: score.repositoryId,
          suiteName: score.suiteName,
          className: score.className,
          testName: score.testName,
          status: body.action === 'approve' ? 'active' : 'dismissed',
          reason: body.reason ?? null,
          createdBy: user.id,
        })
        .returning();

      return reply.status(201).send({ id: inserted[0]!.id.toString() });
    },
  );

  app.post(
    '/api/v1/workspaces/:workspaceId/quarantine/:recordId/lift',
    { preHandler: [requireSession, requireWorkspaceMember] },
    async (request, reply) => {
      const workspaceId = request.workspaceId!;
      const user = request.sessionUser!;
      const params = request.params as { recordId: string };
      let recordId: bigint;
      try {
        recordId = BigInt(params.recordId);
      } catch {
        return sendError(reply, 404, 'not_found', 'Quarantine record not found.');
      }

      const rows = await app.db
        .select({ id: quarantineRecords.id, status: quarantineRecords.status })
        .from(quarantineRecords)
        .innerJoin(repositories, eq(quarantineRecords.repositoryId, repositories.id))
        .innerJoin(
          installations,
          eq(repositories.installationId, installations.githubInstallationId),
        )
        .where(and(eq(quarantineRecords.id, recordId), eq(installations.workspaceId, workspaceId)))
        .limit(1);
      const record = rows[0];
      if (record === undefined) {
        return sendError(reply, 404, 'not_found', 'Quarantine record not found.');
      }
      if (record.status !== 'active') {
        return sendError(reply, 409, 'not_active', 'Only active quarantines can be lifted.');
      }

      await app.db
        .update(quarantineRecords)
        .set({ status: 'lifted', liftedBy: user.id, liftedAt: new Date() })
        .where(eq(quarantineRecords.id, recordId));
      return { id: recordId.toString(), status: 'lifted' };
    },
  );
};
