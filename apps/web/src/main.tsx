import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import { FlakyTestDetailPage } from './pages/flaky-test-detail-page.js';
import { FlakyTestsPage } from './pages/flaky-tests-page.js';
import { InsightsPage } from './pages/insights-page.js';
import { QuarantinePage } from './pages/quarantine-page.js';
import { RootLayout } from './pages/root-layout.js';
import { RunsPage } from './pages/runs-page.js';
import { WorkspaceHomePage } from './pages/workspace-home-page.js';
import { WorkspaceNewPage } from './pages/workspace-new-page.js';
import './index.css';

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { path: 'workspaces/new', element: <WorkspaceNewPage /> },
      { path: 'workspaces/:workspaceId', element: <WorkspaceHomePage /> },
      { path: 'workspaces/:workspaceId/flaky-tests', element: <FlakyTestsPage /> },
      { path: 'workspaces/:workspaceId/flaky-tests/:scoreId', element: <FlakyTestDetailPage /> },
      { path: 'workspaces/:workspaceId/runs', element: <RunsPage /> },
      { path: 'workspaces/:workspaceId/insights', element: <InsightsPage /> },
      { path: 'workspaces/:workspaceId/quarantine', element: <QuarantinePage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
