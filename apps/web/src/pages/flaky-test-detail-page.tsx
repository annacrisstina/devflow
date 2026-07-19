import { Link, useParams } from 'react-router-dom';

import { useFlakyTestDetail } from '../api/hooks.js';
import { displayName, evidenceText, verdictBadge } from './flaky-tests-page.js';
import { HypothesisPanel } from './hypothesis-panel.js';

function statusColor(status: string): string {
  if (status === 'passed') return 'text-emerald-500';
  if (status === 'skipped') return 'text-slate-500';
  return 'text-red-500';
}

export function FlakyTestDetailPage() {
  const { workspaceId, scoreId } = useParams() as { workspaceId: string; scoreId: string };
  const detail = useFlakyTestDetail(workspaceId, scoreId);

  if (detail.isPending) return <main className="p-8 text-slate-400">Loading…</main>;
  if (detail.isError) return <main className="p-8 text-red-500">{detail.error.message}</main>;

  const test = detail.data;
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <Link
        className="text-sm text-slate-400 hover:text-white"
        to={`/workspaces/${workspaceId}/flaky-tests`}
      >
        ← Flakiest tests
      </Link>
      <div>
        <h2 className="text-xl font-semibold">{displayName(test)}</h2>
        <p className="mt-1 text-sm text-slate-400">{test.repository}</p>
      </div>
      <div className="flex gap-6 rounded border border-slate-800 bg-slate-900 px-4 py-3 text-sm">
        <span>
          Verdict:{' '}
          <span className={`rounded border px-2 py-0.5 text-xs ${verdictBadge(test.verdict)}`}>
            {test.verdict}
          </span>
        </span>
        <span className="tabular-nums">Effective score: {test.effectiveScore.toFixed(3)}</span>
        <span className="tabular-nums">Stored: {test.storedScore.toFixed(3)}</span>
        <span className="text-slate-400">{evidenceText(test)}</span>
      </div>

      <HypothesisPanel workspaceId={workspaceId} scoreId={scoreId} />

      <section>
        <h3 className="text-lg font-medium">Outcome history</h3>
        {test.history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No recorded outcomes.</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-800">
                <th className="py-2 pr-4 font-medium">Run</th>
                <th className="py-2 pr-4 font-medium">Attempt</th>
                <th className="py-2 pr-4 font-medium">Branch</th>
                <th className="py-2 pr-4 font-medium">Commit</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Failure</th>
              </tr>
            </thead>
            <tbody>
              {test.history.map((entry, index) => (
                <tr key={index} className="border-b border-slate-900">
                  <td className="py-2 pr-4 tabular-nums">{entry.githubRunId}</td>
                  <td className="py-2 pr-4 tabular-nums">{entry.runAttempt}</td>
                  <td className="py-2 pr-4 text-slate-400">{entry.headBranch ?? '—'}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-slate-400">
                    {entry.headSha.slice(0, 7)}
                  </td>
                  <td className={`py-2 pr-4 ${statusColor(entry.status)}`}>{entry.status}</td>
                  <td className="max-w-xs truncate py-2 text-slate-500">
                    {entry.failureMessage ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
