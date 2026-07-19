import type {
  FailureCluster,
  FlakyTestDetail,
  FlakyTestSummary,
  Hypothesis,
  MeResponse,
  Paginated,
  QuarantineRecord,
  QuarantineStatus,
  RepositorySummary,
  RunSummary,
  SearchResult,
  WorkspaceDetail,
  WorkspaceSummary,
} from '@devflow/contract/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch, ApiRequestError } from './client.js';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/api/v1/me'),
    retry: (failureCount, error) =>
      // 401 means "not signed in", not "try again".
      !(error instanceof ApiRequestError && error.status === 401) && failureCount < 2,
    staleTime: 60_000,
  });
}

export function useWorkspace(workspaceId: string) {
  return useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => apiFetch<WorkspaceDetail>(`/api/v1/workspaces/${workspaceId}`),
  });
}

export function useRepositories(workspaceId: string) {
  return useQuery({
    queryKey: ['repositories', workspaceId],
    queryFn: () =>
      apiFetch<{ items: RepositorySummary[] }>(`/api/v1/workspaces/${workspaceId}/repositories`),
  });
}

export function useFlakyTests(workspaceId: string, verdict?: string) {
  const params = new URLSearchParams({ limit: '50' });
  if (verdict !== undefined && verdict !== '') params.set('verdict', verdict);
  return useQuery({
    queryKey: ['flaky-tests', workspaceId, verdict ?? 'all'],
    queryFn: () =>
      apiFetch<Paginated<FlakyTestSummary>>(
        `/api/v1/workspaces/${workspaceId}/flaky-tests?${params}`,
      ),
  });
}

export function useFlakyTestDetail(workspaceId: string, scoreId: string) {
  return useQuery({
    queryKey: ['flaky-test', workspaceId, scoreId],
    queryFn: () =>
      apiFetch<FlakyTestDetail>(`/api/v1/workspaces/${workspaceId}/flaky-tests/${scoreId}`),
  });
}

export function useRuns(workspaceId: string) {
  return useQuery({
    queryKey: ['runs', workspaceId],
    queryFn: () => apiFetch<Paginated<RunSummary>>(`/api/v1/workspaces/${workspaceId}/runs`),
  });
}

export function useQuarantineProposals(workspaceId: string) {
  return useQuery({
    queryKey: ['quarantine', workspaceId, 'proposals'],
    queryFn: () =>
      apiFetch<{ items: FlakyTestSummary[] }>(
        `/api/v1/workspaces/${workspaceId}/quarantine/proposals`,
      ),
  });
}

export function useQuarantineRecords(workspaceId: string, status: QuarantineStatus) {
  return useQuery({
    queryKey: ['quarantine', workspaceId, status],
    queryFn: () =>
      apiFetch<{ items: QuarantineRecord[] }>(
        `/api/v1/workspaces/${workspaceId}/quarantine?status=${status}`,
      ),
  });
}

export function useSearch(workspaceId: string, query: string) {
  return useQuery({
    queryKey: ['search', workspaceId, query],
    queryFn: () =>
      apiFetch<{ items: SearchResult[] }>(
        `/api/v1/workspaces/${workspaceId}/search?q=${encodeURIComponent(query)}&limit=20`,
      ),
    enabled: query.trim().length >= 2,
  });
}

export function useFailureClusters(workspaceId: string, repositoryId: string, days: number) {
  return useQuery({
    queryKey: ['failure-clusters', workspaceId, repositoryId, days],
    queryFn: () =>
      apiFetch<{ clusters: FailureCluster[] }>(
        `/api/v1/workspaces/${workspaceId}/repositories/${repositoryId}/failure-clusters?days=${days}`,
      ),
    enabled: repositoryId !== '',
  });
}

export function useHypothesis(workspaceId: string, scoreId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['hypothesis', workspaceId, scoreId],
    queryFn: () =>
      apiFetch<{ hypothesis: Hypothesis; cached: boolean }>(
        `/api/v1/workspaces/${workspaceId}/flaky-tests/${scoreId}/hypothesis`,
      ),
    enabled,
    retry: (failureCount, error) =>
      // 404 means "none generated yet", not "try again".
      !(error instanceof ApiRequestError && error.status === 404) && failureCount < 2,
  });
}

export function useGenerateHypothesis(workspaceId: string, scoreId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { force: boolean }) =>
      apiFetch<{ hypothesis: Hypothesis; cached: boolean }>(
        `/api/v1/workspaces/${workspaceId}/flaky-tests/${scoreId}/hypothesis`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    onSuccess: (data) =>
      queryClient.setQueryData(['hypothesis', workspaceId, scoreId], {
        hypothesis: data.hypothesis,
        cached: true,
      }),
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<WorkspaceSummary>('/api/v1/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useInstallLink(workspaceId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ installUrl: string }>(`/api/v1/workspaces/${workspaceId}/installations/link`, {
        method: 'POST',
      }),
  });
}

export function useQuarantineDecision(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { scoreId: string; action: 'approve' | 'dismiss'; reason?: string }) =>
      apiFetch<{ id: string }>(`/api/v1/workspaces/${workspaceId}/quarantine`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quarantine', workspaceId] }),
  });
}

export function useLiftQuarantine(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) =>
      apiFetch<{ id: string }>(`/api/v1/workspaces/${workspaceId}/quarantine/${recordId}/lift`, {
        method: 'POST',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quarantine', workspaceId] }),
  });
}
