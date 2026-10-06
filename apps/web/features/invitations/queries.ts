import type { ApiClient } from '@repo/api-client';
import { infiniteQueryOptions } from '@tanstack/react-query';
import { workspacesApi } from '@/features/workspaces/api';
import { workspaceKeys } from '@/features/workspaces/queries';

export const invitationKeys = {
   all: ['invitations'] as const,
   workspace: (workspaceId: string) => workspaceKeys.invitationLists(workspaceId),
};

export const invitationListQueryOptions = (api: ApiClient, workspaceId: string, limit = 50) =>
   infiniteQueryOptions({
      queryKey: workspaceKeys.invitations(workspaceId, limit),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ signal, pageParam }) =>
         workspacesApi.invitations(api, workspaceId, { signal, limit, cursor: pageParam }),
      getNextPageParam: (page) =>
         page.meta.hasNext ? (page.meta.nextCursor ?? undefined) : undefined,
      enabled: Boolean(workspaceId),
      staleTime: 30_000,
      retry: false,
   });
