import { ApiRequestError } from '../api/client.js';
import { useGenerateHypothesis, useHypothesis, useMe } from '../api/hooks.js';

/**
 * The one LLM surface in the product (ADR-0019): human-triggered, cached,
 * provenance-stamped, and always framed as advisory. Renders nothing when
 * the deployment has no API key configured.
 */
export function HypothesisPanel({
  workspaceId,
  scoreId,
}: {
  workspaceId: string;
  scoreId: string;
}) {
  const me = useMe();
  const enabled = me.data?.features.aiHypotheses ?? false;
  const hypothesis = useHypothesis(workspaceId, scoreId, enabled);
  const generate = useGenerateHypothesis(workspaceId, scoreId);

  if (!enabled) return null;

  const cached =
    hypothesis.data ??
    (generate.data !== undefined
      ? { hypothesis: generate.data.hypothesis, cached: true }
      : undefined);
  const noneYet =
    hypothesis.isError &&
    hypothesis.error instanceof ApiRequestError &&
    hypothesis.error.status === 404;

  return (
    <section className="space-y-3 rounded border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Root-cause hypothesis</h3>
        <button
          className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
          disabled={generate.isPending}
          onClick={() => generate.mutate({ force: cached !== undefined })}
        >
          {generate.isPending ? 'Generating…' : cached !== undefined ? 'Regenerate' : 'Generate'}
        </button>
      </div>

      {cached !== undefined ? (
        <>
          <p className="text-sm whitespace-pre-wrap">{cached.hypothesis.content}</p>
          <p className="text-xs text-slate-500">
            AI-generated hypothesis — verify before acting. {cached.hypothesis.model} · prompt{' '}
            {cached.hypothesis.promptVersion} · requested by{' '}
            {cached.hypothesis.createdBy ?? 'unknown'} on{' '}
            {new Date(cached.hypothesis.createdAt).toLocaleString()}
          </p>
        </>
      ) : noneYet ? (
        <p className="text-sm text-slate-400">
          No hypothesis yet. Generation sends this test's detection evidence and recent failure
          messages to the configured LLM — it runs only when you ask.
        </p>
      ) : hypothesis.isPending ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : hypothesis.isError ? (
        <p className="text-sm text-red-500">{hypothesis.error.message}</p>
      ) : null}

      {generate.isError ? <p className="text-sm text-red-500">{generate.error.message}</p> : null}
    </section>
  );
}
