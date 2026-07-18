# @devflow/worker

Background processing: consumes `ingest` jobs, turns raw `workflow_run` events into normalized rows, downloads artifacts from GitHub, parses JUnit XML, persists test results, recomputes flakiness scores and writes advisory check runs back to the PR.

## Responsibility

- The only process that calls the GitHub REST API (App JWT → installation tokens; the App private key lives in this process's environment and nowhere else).
- Pipeline per job: load raw event → normalize repository/run → list artifacts → download + unzip → parse JUnit → replace-per-run persist → recompute flake scores for affected test identities (ADR-0010) → annotate the run's sha with a `neutral` check run when failing tests carry non-healthy verdicts (ADR-0011).
- Failure policy (ADR-0007): transient errors throw → BullMQ retries (5 attempts, exponential backoff); `PermanentJobError` marks the run `failed` and completes the job — except in annotation, where it is absorbed with a warning (results and scores are already durable).
- Detection tuning: `DEVFLOW_FLAKE_*` environment knobs (see `.env.example`); defaults under-flag on purpose.

## Boundaries

- Consumes `@devflow/queue` (contract) and `@devflow/db` (schema/client); owns its queries.
- Never serves HTTP; never imports from other apps.
- Everything it derives must be rebuildable from `webhook_events` + GitHub (ADR-0005/0008).

## Running locally

```sh
docker compose up -d
pnpm --filter @devflow/db db:migrate
# .env additionally needs:
#   DEVFLOW_GITHUB_APP_ID=...
#   DEVFLOW_GITHUB_APP_PRIVATE_KEY_BASE64=$(base64 -w0 app-key.pem)
pnpm --filter @devflow/worker dev
```

## Dead letters

Jobs that exhausted their 5 attempts sit in BullMQ's failed set:

```ts
const failed = await queue.getJobs(['failed']); // inspect
await failed[0]?.retry(); // requeue after fixing the cause
```

Total Redis loss is recoverable: jobs reference `webhook_events`, so re-enqueueing from Postgres (or redelivering from GitHub's webhook UI) rebuilds the schedule — data never lives in the queue.
