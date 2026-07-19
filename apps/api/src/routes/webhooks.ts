import { webhookEvents } from '@devflow/db/schema/webhook-events';
import { enqueueProcessInstallationEvent, enqueueProcessWorkflowRun } from '@devflow/queue/ingest';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { verifyWebhookSignature } from '../webhooks/verify-signature.js';

export type WebhookRoutesOptions = {
  webhookSecret: string;
};

// GitHub caps webhook payloads at 25 MB; anything larger is not GitHub.
const GITHUB_MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Ingestion endpoint. The whole job is: authenticate the raw bytes, persist
 * them append-only, ACK fast. Anything expensive belongs to workers (M2).
 *
 * Delivery contract: GitHub is at-least-once and out-of-order; the delivery
 * GUID is the idempotency key. A duplicate GUID is a success (200), not an
 * error — the sender must not retry it.
 */
export const webhookRoutes: FastifyPluginAsync<WebhookRoutesOptions> = async (app, opts) => {
  // Raw bytes, not parsed JSON: the HMAC covers the body exactly as sent, and
  // nothing may interpret the payload before it is authenticated. Encapsulated
  // in this plugin, so the rest of the app keeps Fastify's default JSON parser.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.post('/webhooks/github', { bodyLimit: GITHUB_MAX_PAYLOAD_BYTES }, async (request, reply) => {
    const deliveryId = request.headers['x-github-delivery'];
    const eventType = request.headers['x-github-event'];
    const signature = request.headers['x-hub-signature-256'];

    if (
      typeof deliveryId !== 'string' ||
      deliveryId === '' ||
      typeof eventType !== 'string' ||
      eventType === ''
    ) {
      return reply.status(400).send({ error: 'missing required GitHub webhook headers' });
    }

    // GitHub's delivery GUID is the correlation key that follows this event
    // through queue and workers in later milestones.
    const log = request.log.child({ deliveryId, eventType });

    // Guaranteed by the scoped content-type parser above.
    const rawBody = request.body as Buffer;

    if (
      typeof signature !== 'string' ||
      !verifyWebhookSignature(rawBody, opts.webhookSecret, signature)
    ) {
      log.warn('webhook delivery rejected: invalid signature');
      // Generic body: an attacker learns nothing about why verification failed.
      return reply.status(401).send({ error: 'invalid signature' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      log.warn('webhook delivery rejected: body is not valid JSON');
      return reply.status(400).send({ error: 'invalid JSON payload' });
    }

    const inserted = await app.db
      .insert(webhookEvents)
      .values({
        deliveryId,
        eventType,
        action: payloadAction(payload),
        installationId: payloadInstallationId(payload),
        payload,
      })
      .onConflictDoNothing({ target: webhookEvents.deliveryId })
      .returning({ id: webhookEvents.id });

    // Enqueue on the duplicate path too: jobId dedup collapses it while the
    // job is queued, and a redelivery becomes the repair mechanism for a job
    // lost after the raw event was persisted (e.g. Redis down at ACK time).
    const eventId =
      inserted[0]?.id ??
      (
        await app.db
          .select({ id: webhookEvents.id })
          .from(webhookEvents)
          .where(eq(webhookEvents.deliveryId, deliveryId))
      )[0]?.id;

    if (
      eventId !== undefined &&
      eventType === 'workflow_run' &&
      payloadAction(payload) === 'completed'
    ) {
      await enqueueProcessWorkflowRun(app.ingestQueue, {
        webhookEventId: eventId.toString(),
        deliveryId,
      });
      log.info({ eventId: eventId.toString() }, 'processing job enqueued');
    }

    // Installation lifecycle (M4, ADR-0012): every action is enqueued — the
    // worker decides what each one means for the installations table.
    if (eventId !== undefined && eventType === 'installation') {
      await enqueueProcessInstallationEvent(app.ingestQueue, {
        webhookEventId: eventId.toString(),
        deliveryId,
      });
      log.info({ eventId: eventId.toString() }, 'installation job enqueued');
    }

    if (inserted.length === 0) {
      log.info('duplicate webhook delivery absorbed');
      return reply.status(200).send({ status: 'duplicate' });
    }

    log.info({ eventId: inserted[0]?.id.toString() }, 'webhook delivery persisted');
    return reply.status(202).send({ status: 'accepted' });
  });
};

// Filter-column extraction only — `payload` stays the source of truth. Shapes
// are treated as untrusted even after authentication: a field that isn't what
// we expect becomes NULL, never an error.
function payloadAction(payload: unknown): string | null {
  if (payload === null || typeof payload !== 'object') return null;
  const action = (payload as Record<string, unknown>).action;
  return typeof action === 'string' ? action : null;
}

function payloadInstallationId(payload: unknown): bigint | null {
  if (payload === null || typeof payload !== 'object') return null;
  const installation = (payload as Record<string, unknown>).installation;
  if (installation === null || typeof installation !== 'object') return null;
  const id = (installation as Record<string, unknown>).id;
  return typeof id === 'number' && Number.isSafeInteger(id) ? BigInt(id) : null;
}
