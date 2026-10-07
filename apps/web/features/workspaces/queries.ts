import type { ApiClient } from '@repo/api-client';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { workspacesApi, type WorkspacePageOptions } from './api';

export {
   workspaceInvitationListResponseSchema,
   workspaceListResponseSchema,
   workspaceMemberListResponseSchema,
   type WorkspacePageOptions,
} from './api';

export const workspaceKeys = {
   all: ['workspaces'] as const,
   scope: (workspaceId: string) => [...workspaceKeys.all, workspaceId] as const,
   list: () => [...workspaceKeys.all, 'list'] as const,
   detail: (workspaceId: string) => [...workspaceKeys.scope(workspaceId), 'detail'] as const,
   memberLists: (workspaceId: string) => [...workspaceKeys.scope(workspaceId), 'members'] as const,
   members: (workspaceId: string, limit = 50) =>
      [...workspaceKeys.memberLists(workspaceId), { limit }] as const,
   invitationLists: (workspaceId: string) =>
      [...workspaceKeys.scope(workspaceId), 'invitations'] as const,
   invitations: (workspaceId: string, limit = 50) =>
      [...workspaceKeys.invitationLists(workspaceId), { limit }] as const,
   preferences: (workspaceId: string) =>
      [...workspaceKeys.scope(workspaceId), 'preferences'] as const,
};

export const workspaceListQueryOptions = (api: ApiClient, limit = 50) =>
   infiniteQueryOptions({
      queryKey: [...workspaceKeys.list(), { limit }] as const,
      initialPageParam: undefined as string | undefined,
      queryFn: ({ signal, pageParam }) =>
         workspacesApi.list(api, { signal, limit, cursor: pageParam }),
      getNextPageParam: (page) =>
         page?.meta?.hasNext ? (page.meta.nextCursor ?? undefined) : undefined,
      staleTime: 5 * 60 * 1000,
      retry: false,
   });

export const workspaceDetailQueryOptions = (api: ApiClient, workspaceId: string) =>
   queryOptions({
      queryKey: workspaceKeys.detail(workspaceId),
      queryFn: ({ signal }) => workspacesApi.get(api, workspaceId, signal),
      enabled: Boolean(workspaceId),
      staleTime: 30_000,
      retry: false,
   });

export const workspaceMembersQueryOptions = (api: ApiClient, workspaceId: string, limit = 50) =>
   infiniteQueryOptions({
      queryKey: workspaceKeys.members(workspaceId, limit),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ signal, pageParam }) =>
         workspacesApi.members(api, workspaceId, { signal, limit, cursor: pageParam }),
      getNextPageParam: (page) =>
         page?.meta?.hasNext ? (page.meta.nextCursor ?? undefined) : undefined,
      enabled: Boolean(workspaceId),
      staleTime: 30_000,
      retry: false,
   });

export const workspaceMemberListQueryOptions = (
   api: ApiClient,
   workspaceId: string,
   options: WorkspacePageOptions = {}
) =>
   queryOptions({
      queryKey: [...workspaceKeys.memberLists(workspaceId), options] as const,
      queryFn: ({ signal }) => workspacesApi.members(api, workspaceId, { ...options, signal }),
      enabled: Boolean(workspaceId),
      staleTime: 30_000,
      retry: false,
   });

export const workspacePreferencesQueryOptions = (api: ApiClient, workspaceId: string) =>
   queryOptions({
      queryKey: workspaceKeys.preferences(workspaceId),
      queryFn: ({ signal }) => workspacesApi.preferences(api, workspaceId, signal),
      enabled: Boolean(workspaceId),
      staleTime: 60_000,
      retry: false,
   });
