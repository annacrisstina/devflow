import type { LiveEvent } from '@devflow/contract/events';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';

/**
 * Live-feed subscription (ADR-0015): every event is only a hint that server
 * state changed — the reaction is always "refetch via REST", never "apply
 * the event to local state". Losing the socket loses freshness, not truth.
 */
export function useLiveEvents(workspaceId: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = io({ transports: ['websocket'] });

    const invalidateRuns = (event: LiveEvent) => {
      if (event.workspaceId !== workspaceId) return;
      void queryClient.invalidateQueries({ queryKey: ['runs', workspaceId] });
    };
    const invalidateScores = (event: LiveEvent) => {
      if (event.workspaceId !== workspaceId) return;
      void queryClient.invalidateQueries({ queryKey: ['flaky-tests', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['quarantine', workspaceId] });
    };

    socket.on('run.ingested', invalidateRuns);
    socket.on('run.processed', invalidateRuns);
    socket.on('scores.updated', invalidateScores);

    return () => {
      socket.close();
    };
  }, [workspaceId, queryClient]);
}
