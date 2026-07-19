import type { FlakyTestSummary } from '@devflow/contract/api';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useFlakyTests } from '../api/hooks.js';

export function verdictBadge(verdict: string): string {
  if (verdict === 'flaky') return 'bg-red-950 text-red-400 border-red-800';
  if (verdict === 'suspected') return 'bg-amber-950 text-amber-400 border-amber-800';
  return 'bg-slate-900 text-slate-400 border-slate-700';
}

export function evidenceText(test: FlakyTestSummary): string {
  const parts: string[] = [];
  if (test.divergenceEvidence > 0) {
    parts.push(
      `${test.divergenceEvidence} same-commit divergence${test.divergenceEvidence === 1 ? '' : 's'}`,
    );
  }
  if (test.transitionEvidence > 0) {
    parts.push(
      `${test.transitionEvidence} default-branch transition${test.transitionEvidence === 1 ? '' : 's'}`,
    );
  }
  return parts.length > 0 ? parts.join(', ') : '—';
}

export function displayName(test: FlakyTestSummary): string {
  return [test.suiteName, test.className, test.testName].filter((part) => part !== '').join(' › ');
}

export function FlakyTestsPage() {
  const { workspaceId } = useParams() as { workspaceId: string };
  const [verdict, setVerdict] = useState('');
  const flakyTests = useFlakyTests(workspaceId, verdict);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Flakiest tests</h2>
        <select
          className="rounded bg-slate-900 px-2 py-1 text-sm"
          value={verdict}
          onChange={(event) => setVerdict(event.target.value)}
        >
          <option value="">All verdicts</option>
          <option value="flaky">Flaky</option>
          <option value="suspected">Suspected</option>
          <option value="healthy">Healthy</option>
        </select>
      </div>

      {flakyTests.isPending ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : flakyTests.isError ? (
        <p className="text-sm text-red-500">{flakyTests.error.message}</p>
      ) : flakyTests.data.items.length === 0 ? (
        <p className="text-sm text-slate-400">
          No scored tests yet — scores appear once runs with JUnit artifacts are ingested.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr className="border-b border-slate-800">
              <th className="py-2 pr-4 font-medium">Test</th>
              <th className="py-2 pr-4 font-medium">Repository</th>
              <th className="py-2 pr-4 font-medium">Verdict</th>
              <th className="py-2 pr-4 font-medium">Score</th>
              <th className="py-2 font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {flakyTests.data.items.map((test) => (
              <tr key={test.id} className="border-b border-slate-900 hover:bg-slate-900/50">
                <td className="max-w-md truncate py-2 pr-4">
                  <Link
                    className="text-emerald-400 hover:underline"
                    to={`/workspaces/${workspaceId}/flaky-tests/${test.id}`}
                  >
                    {displayName(test)}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-slate-400">{test.repository}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`rounded border px-2 py-0.5 text-xs ${verdictBadge(test.verdict)}`}
                  >
                    {test.verdict}
                  </span>
                </td>
                <td className="py-2 pr-4 tabular-nums">{test.effectiveScore.toFixed(2)}</td>
                <td className="py-2 text-slate-400">{evidenceText(test)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
