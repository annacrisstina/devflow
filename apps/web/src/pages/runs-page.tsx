import { useParams } from 'react-router-dom';

import { useRuns } from '../api/hooks.js';
import { useLiveEvents } from '../live/use-live-events.js';

function conclusionColor(conclusion: string | null): string {
  if (conclusion === 'success') return 'text-emerald-500';
  if (conclusion === 'failure') return 'text-red-500';
  return 'text-slate-400';
}

export function RunsPage() {
  const { workspaceId } = useParams() as { workspaceId: string };
  const runs = useRuns(workspaceId);
  // Live updates: events invalidate the query; REST stays the source of truth.
  useLiveEvents(workspaceId);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold">Recent runs</h2>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          live
        </span>
      </div>

      {runs.isPending ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : runs.isError ? (
        <p className="text-sm text-red-500">{runs.error.message}</p>
      ) : runs.data.items.length === 0 ? (
        <p className="text-sm text-slate-400">
          No runs yet — they appear here as GitHub Actions workflows complete.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr className="border-b border-slate-800">
              <th className="py-2 pr-4 font-medium">Repository</th>
              <th className="py-2 pr-4 font-medium">Workflow</th>
              <th className="py-2 pr-4 font-medium">Branch</th>
              <th className="py-2 pr-4 font-medium">Attempt</th>
              <th className="py-2 pr-4 font-medium">Conclusion</th>
              <th className="py-2 pr-4 font-medium">Tests</th>
              <th className="py-2 font-medium">Processing</th>
            </tr>
          </thead>
          <tbody>
            {runs.data.items.map((run) => (
              <tr key={run.id} className="border-b border-slate-900">
                <td className="py-2 pr-4">{run.repository}</td>
                <td className="py-2 pr-4 text-slate-400">{run.name ?? '—'}</td>
                <td className="py-2 pr-4 text-slate-400">{run.headBranch ?? '—'}</td>
                <td className="py-2 pr-4 tabular-nums">{run.runAttempt}</td>
                <td className={`py-2 pr-4 ${conclusionColor(run.conclusion)}`}>
                  {run.conclusion ?? '—'}
                </td>
                <td className="py-2 pr-4 tabular-nums">
                  {run.totalTests > 0 ? (
                    <>
                      {run.totalTests}
                      {run.failedTests > 0 ? (
                        <span className="text-red-500"> ({run.failedTests} failed)</span>
                      ) : null}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2 text-slate-400">{run.processingStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
