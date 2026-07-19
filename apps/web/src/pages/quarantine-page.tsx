import { useState } from 'react';
import { useParams } from 'react-router-dom';

import {
  useLiftQuarantine,
  useQuarantineDecision,
  useQuarantineProposals,
  useQuarantineRecords,
} from '../api/hooks.js';
import { displayName, evidenceText } from './flaky-tests-page.js';

type Tab = 'proposed' | 'active' | 'dismissed';

function ProposalsTab({ workspaceId }: { workspaceId: string }) {
  const proposals = useQuarantineProposals(workspaceId);
  const decide = useQuarantineDecision(workspaceId);
  const [reason, setReason] = useState('');

  if (proposals.isPending) return <p className="text-sm text-slate-400">Loading…</p>;
  if (proposals.isError) return <p className="text-sm text-red-500">{proposals.error.message}</p>;
  if (proposals.data.items.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Nothing to propose — no test currently holds a flaky verdict without a quarantine decision.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        DevFlow proposes; you decide (ADR-0016). Approving labels future failures of the test as
        quarantined in PR checks.
      </p>
      <input
        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        placeholder="Optional reason recorded with your decision"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
      />
      <ul className="space-y-2">
        {proposals.data.items.map((proposal) => (
          <li
            key={proposal.id}
            className="flex items-center justify-between gap-4 rounded border border-slate-800 bg-slate-900 px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{displayName(proposal)}</p>
              <p className="text-xs text-slate-400">
                {proposal.repository} · score {proposal.effectiveScore.toFixed(2)} ·{' '}
                {evidenceText(proposal)}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
                disabled={decide.isPending}
                onClick={() =>
                  decide.mutate({
                    scoreId: proposal.id,
                    action: 'approve',
                    ...(reason.trim() !== '' ? { reason: reason.trim() } : {}),
                  })
                }
              >
                Quarantine
              </button>
              <button
                className="rounded border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                disabled={decide.isPending}
                onClick={() =>
                  decide.mutate({
                    scoreId: proposal.id,
                    action: 'dismiss',
                    ...(reason.trim() !== '' ? { reason: reason.trim() } : {}),
                  })
                }
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
      {decide.isError ? <p className="text-sm text-red-500">{decide.error.message}</p> : null}
    </div>
  );
}

function RecordsTab({
  workspaceId,
  status,
}: {
  workspaceId: string;
  status: 'active' | 'dismissed';
}) {
  const records = useQuarantineRecords(workspaceId, status);
  const lift = useLiftQuarantine(workspaceId);
  const decide = useQuarantineDecision(workspaceId);

  if (records.isPending) return <p className="text-sm text-slate-400">Loading…</p>;
  if (records.isError) return <p className="text-sm text-red-500">{records.error.message}</p>;
  if (records.data.items.length === 0) {
    return <p className="text-sm text-slate-400">No {status} quarantine records.</p>;
  }

  return (
    <ul className="space-y-2">
      {records.data.items.map((record) => (
        <li
          key={record.id}
          className="flex items-center justify-between gap-4 rounded border border-slate-800 bg-slate-900 px-4 py-3 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">
              {[record.suiteName, record.className, record.testName]
                .filter((part) => part !== '')
                .join(' › ')}
            </p>
            <p className="text-xs text-slate-400">
              {record.repository} · {status} by {record.createdBy ?? 'unknown'} on{' '}
              {new Date(record.createdAt).toLocaleDateString()}
              {record.reason !== null ? ` — "${record.reason}"` : ''}
            </p>
          </div>
          {status === 'active' ? (
            <button
              className="shrink-0 rounded border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              disabled={lift.isPending}
              onClick={() => lift.mutate(record.id)}
            >
              Lift
            </button>
          ) : record.scoreId !== null ? (
            <button
              className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
              disabled={decide.isPending}
              title="Approve quarantine despite the earlier dismissal"
              onClick={() => decide.mutate({ scoreId: record.scoreId!, action: 'approve' })}
            >
              Quarantine anyway
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function QuarantinePage() {
  const { workspaceId } = useParams() as { workspaceId: string };
  const [tab, setTab] = useState<Tab>('proposed');

  const tabClass = (candidate: Tab) =>
    `rounded px-3 py-1.5 text-sm font-medium ${tab === candidate ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center gap-2">
        <h2 className="mr-4 text-xl font-semibold">Quarantine</h2>
        <button className={tabClass('proposed')} onClick={() => setTab('proposed')}>
          Proposed
        </button>
        <button className={tabClass('active')} onClick={() => setTab('active')}>
          Active
        </button>
        <button className={tabClass('dismissed')} onClick={() => setTab('dismissed')}>
          Dismissed
        </button>
      </div>
      {tab === 'proposed' ? (
        <ProposalsTab workspaceId={workspaceId} />
      ) : (
        <RecordsTab workspaceId={workspaceId} status={tab} />
      )}
    </main>
  );
}
