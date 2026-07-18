# @devflow/worker

Background processing: consumes `ingest` jobs, turns raw `workflow_run` events into normalized rows, downloads artifacts from GitHub, parses JUnit XML, persists test results.

## Responsibility

- The only process that calls the GitHub REST API (App JWT → installation tokens; the App private key lives in this process's environment and nowhere else).
- Pipeline per job: load raw event → normalize repository/run → list artifacts → download + unzip → parse JUnit → replace-per-run persist.
- Failure policy (ADR-0007): transient errors throw → BullMQ retries (5 attempts, exponential backoff); `PermanentJobError` marks the run `failed` and completes the job.

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
