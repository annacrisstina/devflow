import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useCreateWorkspace } from '../api/hooks.js';

export function WorkspaceNewPage() {
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const create = useCreateWorkspace();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-semibold">Create your workspace</h1>
      <p className="max-w-md text-center text-sm text-slate-400">
        A workspace owns GitHub App installations and everything DevFlow learns from them. Name it
        after yourself or your team.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(name, {
            onSuccess: (workspace) => navigate(`/workspaces/${workspace.id}`),
          });
        }}
      >
        <input
          className="w-64 rounded border border-slate-700 bg-slate-900 px-3 py-2"
          placeholder="Workspace name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          required
        />
        <button
          className="rounded bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 disabled:opacity-50"
          disabled={create.isPending || name.trim() === ''}
          type="submit"
        >
          Create
        </button>
      </form>
      {create.isError ? <p className="text-sm text-red-500">{create.error.message}</p> : null}
    </main>
  );
}
