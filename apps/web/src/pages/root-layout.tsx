import { Navigate, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';

import { ApiRequestError } from '../api/client.js';
import { useMe } from '../api/hooks.js';

function LoginScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 text-slate-100">
      <h1 className="text-4xl font-bold tracking-tight">DevFlow</h1>
      <p className="max-w-md text-center text-slate-400">
        CI reliability for GitHub Actions: detect flaky tests, annotate pull requests, quarantine
        the noise.
      </p>
      {/* Auth.js hosted sign-in page (ADR-0013) — deliberately unbranded in MVP. */}
      <a
        className="rounded-md bg-emerald-600 px-6 py-2 font-medium text-white hover:bg-emerald-500"
        href="/api/auth/signin"
      >
        Sign in with GitHub
      </a>
    </main>
  );
}

export function RootLayout() {
  const me = useMe();
  const { workspaceId } = useParams();
  const location = useLocation();

  if (me.isPending) {
    return <main className="p-8 text-slate-400">Loading…</main>;
  }
  if (me.isError) {
    if (me.error instanceof ApiRequestError && me.error.status === 401) {
      return <LoginScreen />;
    }
    return <main className="p-8 text-red-600">Failed to load: {me.error.message}</main>;
  }

  const workspaces = me.data.workspaces;
  if (location.pathname === '/workspaces/new') {
    // The create screen renders without workspace chrome.
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Outlet />
      </div>
    );
  }
  if (workspaceId === undefined) {
    return workspaces.length === 0 ? (
      <Navigate to="/workspaces/new" replace />
    ) : (
      <Navigate to={`/workspaces/${workspaces[0]!.id}`} replace />
    );
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:text-white'}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center gap-6 border-b border-slate-800 px-6 py-3">
        <span className="text-lg font-bold">DevFlow</span>
        <select
          className="rounded bg-slate-900 px-2 py-1 text-sm"
          value={workspaceId}
          onChange={(event) => {
            window.location.href = `/workspaces/${event.target.value}`;
          }}
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <nav className="flex gap-1">
          <NavLink end to={`/workspaces/${workspaceId}`} className={linkClass}>
            Overview
          </NavLink>
          <NavLink to={`/workspaces/${workspaceId}/flaky-tests`} className={linkClass}>
            Flaky tests
          </NavLink>
          <NavLink to={`/workspaces/${workspaceId}/runs`} className={linkClass}>
            Runs
          </NavLink>
          <NavLink to={`/workspaces/${workspaceId}/quarantine`} className={linkClass}>
            Quarantine
          </NavLink>
          {me.data.features.aiSearch ? (
            <NavLink to={`/workspaces/${workspaceId}/insights`} className={linkClass}>
              Insights
            </NavLink>
          ) : null}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-slate-400">
          <span>{me.data.user.name ?? me.data.user.email ?? 'Signed in'}</span>
          <a className="hover:text-white" href="/api/auth/signout">
            Sign out
          </a>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
