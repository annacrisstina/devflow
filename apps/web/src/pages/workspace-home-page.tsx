import { useParams, useSearchParams } from 'react-router-dom';

import { useInstallLink, useRepositories, useWorkspace } from '../api/hooks.js';

export function WorkspaceHomePage() {
  const { workspaceId } = useParams() as { workspaceId: string };
  const [searchParams] = useSearchParams();
  const workspace = useWorkspace(workspaceId);
  const repositories = useRepositories(workspaceId);
  const installLink = useInstallLink(workspaceId);

  if (workspace.isPending) return <main className="p-8 text-slate-400">Loading…</main>;
  if (workspace.isError) return <main className="p-8 text-red-500">{workspace.error.message}</main>;

  const installations = workspace.data.installations;

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      {searchParams.get('connected') === '1' ? (
        <p className="rounded border border-emerald-700 bg-emerald-950 px-4 py-2 text-sm text-emerald-300">
          GitHub installation connected. Runs will appear as workflows complete.
        </p>
      ) : null}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">GitHub installations</h2>
          <button
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            disabled={installLink.isPending}
            onClick={() =>
              installLink.mutate(undefined, {
                onSuccess: ({ installUrl }) => {
                  window.location.href = installUrl;
                },
              })
            }
          >
            Connect GitHub
          </button>
        </div>
        {installations.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            No installation connected yet — connect the DevFlow GitHub App to start ingesting CI
            runs.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {installations.map((installation) => (
              <li
                key={installation.id}
                className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-4 py-2 text-sm"
              >
                <span>
                  {installation.accountLogin ?? `installation ${installation.githubInstallationId}`}
                  {installation.accountType !== null ? ` (${installation.accountType})` : ''}
                </span>
                {installation.uninstalledAt !== null ? (
                  <span className="text-amber-500">uninstalled</span>
                ) : (
                  <span className="text-emerald-500">active</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold">Repositories</h2>
        {repositories.isPending ? (
          <p className="mt-4 text-sm text-slate-400">Loading…</p>
        ) : repositories.isError ? (
          <p className="mt-4 text-sm text-red-500">{repositories.error.message}</p>
        ) : repositories.data.items.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            Nothing ingested yet. Repositories appear after their first workflow run reaches
            DevFlow.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {repositories.data.items.map((repository) => (
              <li
                key={repository.id}
                className="flex items-center justify-between rounded border border-slate-800 bg-slate-900 px-4 py-2 text-sm"
              >
                <span>
                  {repository.owner}/{repository.name}
                </span>
                <span className="text-slate-500">
                  {repository.private ? 'private' : 'public'}
                  {repository.defaultBranch !== null ? ` · ${repository.defaultBranch}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
