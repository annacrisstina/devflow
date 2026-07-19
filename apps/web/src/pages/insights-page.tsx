import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { useFailureClusters, useMe, useRepositories, useSearch } from '../api/hooks.js';

function SearchSection({ workspaceId }: { workspaceId: string }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const search = useSearch(workspaceId, query);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Search failure history</h2>
      <p className="text-sm text-slate-400">
        Semantic search over every failure message DevFlow has seen in this workspace — local
        embeddings, nothing leaves your deployment (ADR-0018).
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(input);
        }}
      >
        <input
          className="w-full max-w-xl rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          placeholder='e.g. "timeout waiting for gateway" or "connection refused"'
          value={input}
          onChange={(event) => setInput(event.target.value)}
          minLength={2}
          maxLength={500}
        />
        <button
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
          type="submit"
        >
          Search
        </button>
      </form>

      {query === '' ? null : search.isPending ? (
        <p className="text-sm text-slate-400">Searching…</p>
      ) : search.isError ? (
        <p className="text-sm text-red-500">{search.error.message}</p>
      ) : search.data.items.length === 0 ? (
        <p className="text-sm text-slate-400">No similar failures recorded.</p>
      ) : (
        <ul className="space-y-2">
          {search.data.items.map((result, index) => (
            <li key={index} className="rounded border border-slate-800 bg-slate-900 px-4 py-3">
              <div className="flex items-baseline justify-between gap-4">
                <p className="min-w-0 truncate font-mono text-sm">{result.snippet}</p>
                <span className="shrink-0 text-xs tabular-nums text-slate-400">
                  {(result.similarity * 100).toFixed(0)}% match
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {result.repository} · seen {result.occurrences}×
                {result.affectedTests.length > 0 ? ` · ${result.affectedTests.join(', ')}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClustersSection({ workspaceId }: { workspaceId: string }) {
  const repositories = useRepositories(workspaceId);
  const [repositoryId, setRepositoryId] = useState('');
  const [days, setDays] = useState(14);
  const effectiveRepo =
    repositoryId !== '' ? repositoryId : (repositories.data?.items[0]?.id ?? '');
  const clusters = useFailureClusters(workspaceId, effectiveRepo, days);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">Failure clusters</h2>
        <select
          className="rounded bg-slate-900 px-2 py-1 text-sm"
          value={effectiveRepo}
          onChange={(event) => setRepositoryId(event.target.value)}
        >
          {(repositories.data?.items ?? []).map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.owner}/{repo.name}
            </option>
          ))}
        </select>
        <select
          className="rounded bg-slate-900 px-2 py-1 text-sm"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          <option value={7}>last 7 days</option>
          <option value={14}>last 14 days</option>
          <option value={30}>last 30 days</option>
        </select>
      </div>
      <p className="text-sm text-slate-400">
        Similar failure messages grouped by embedding distance — “these failures share one cause”.
        Deterministic geometry, no model calls (ADR-0018).
      </p>

      {effectiveRepo === '' ? (
        <p className="text-sm text-slate-400">No repositories yet.</p>
      ) : clusters.isPending ? (
        <p className="text-sm text-slate-400">Clustering…</p>
      ) : clusters.isError ? (
        <p className="text-sm text-red-500">{clusters.error.message}</p>
      ) : clusters.data.clusters.length === 0 ? (
        <p className="text-sm text-slate-400">No failures recorded in this window.</p>
      ) : (
        <ul className="space-y-2">
          {clusters.data.clusters.map((cluster, index) => (
            <li key={index} className="rounded border border-slate-800 bg-slate-900 px-4 py-3">
              <p className="font-mono text-sm">{cluster.representativeSnippet}</p>
              <p className="mt-1 text-xs text-slate-400">
                {cluster.occurrences} failure{cluster.occurrences === 1 ? '' : 's'} across{' '}
                {cluster.distinctFailures} distinct message
                {cluster.distinctFailures === 1 ? '' : 's'}
                {cluster.affectedTests.length > 0 ? ` · ${cluster.affectedTests.join(', ')}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function InsightsPage() {
  const { workspaceId } = useParams() as { workspaceId: string };
  const me = useMe();

  if (me.data !== undefined && !me.data.features.aiSearch) {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <p className="text-sm text-slate-400">
          Insights are disabled on this deployment (embeddings are off). The rest of DevFlow is
          unaffected — that is the point (ADR-0017).
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-10 p-8">
      <SearchSection workspaceId={workspaceId} />
      <ClustersSection workspaceId={workspaceId} />
    </main>
  );
}
