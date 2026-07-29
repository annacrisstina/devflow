# v0.1.x observation log

> Part of the [Stage 1 plan](stage1-plan.md). **Append-only** — the [development-log](../development-log.md) discipline applied to validation: entries are never edited or reordered after the fact; corrections are new entries referencing the old. The phase rule this log enforces: **a code change requires an observation-log entry** (roadmap, v0.1.x). Doc fixes are logged too — the guide is itself under test.
>
> One entry per observation, expected or not. "It worked as predicted" is an observation; silence is not evidence (NEVER-8).

## Entry format

```markdown
## YYYY-MM-DD — <short title> (<H-id from predictions.md, or "unregistered">)

- **Task:** T<n> — what was executed, exactly (command, click path, delivery GUID).
- **Expected:** the pre-registered prediction, or the guide/ADR claim being exercised.
- **Observed:** what actually happened, with raw evidence inline or referenced —
  query output, log excerpt, URL, screenshot filename. Delivery GUIDs and
  run IDs included wherever they exist, for correlation.
- **Disposition:** `confirms` | `doc-fix` | `code-fix` | `open` — for fixes,
  the commit hash once it exists (a later entry may supply it).
```

Rules:

- An unpredicted observation is registered here first as `unregistered`, then (if it names a durable assumption) appended to [predictions.md](predictions.md) as a new row before any fix lands.
- A `code-fix` entry precedes its commit; the commit message references nothing, the log carries the trace.
- Secrets, tokens and private-key material never appear in evidence — GUIDs, IDs and status codes are enough.

---

_(No entries yet. The first entries land with T3 — App configuration.)_
