import type { ApiClient } from '@repo/api-client';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { teamsApi } from './api';

export const teamKeys = {
   all: ['teams'] as const,
   workspace: (workspaceId: string) => [...teamKeys.all, workspaceId] as const,
   list: (workspaceId: string) => [...teamKeys.workspace(workspaceId), 'list'] as const,
   detail: (workspaceId: string, teamId: string) =>
      [...teamKeys.workspace(workspaceId), teamId] as const,
   members: (workspaceId: string, teamId: string) =>
      [...teamKeys.detail(workspaceId, teamId), 'members'] as const,
   settings: (workspaceId: string, teamId: string) =>
      [...teamKeys.detail(workspaceId, teamId), 'settings'] as const,
   statuses: (workspaceId: string, teamId: string) =>
      [...teamKeys.detail(workspaceId, teamId), 'statuses'] as const,
   issues: (workspaceId: string, teamId: string) =>
      [...teamKeys.detail(workspaceId, teamId), 'issues'] as const,
};

export const teamListQueryOptions = (api: ApiClient, workspaceId: string) =>
   infiniteQueryOptions({
      queryKey: teamKeys.list(workspaceId),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ signal, pageParam }) => teamsApi.list(api, workspaceId, pageParam, signal),
      getNextPageParam: (page) =>
         page.meta.hasNext ? (page.meta.nextCursor ?? undefined) : undefined,
      enabled: Boolean(workspaceId),
      staleTime: 60_000,
      retry: false,
   });

export const teamDetailQueryOptions = (api: ApiClient, workspaceId: string, teamId: string) =>
   queryOptions({
      queryKey: teamKeys.detail(workspaceId, teamId),
      queryFn: ({ signal }) => teamsApi.get(api, workspaceId, teamId, signal),
      enabled: Boolean(workspaceId && teamId),
      staleTime: 60_000,
      retry: false,
   });

export const teamMembersQueryOptions = (api: ApiClient, workspaceId: string, teamId: string) =>
   queryOptions({
      queryKey: teamKeys.members(workspaceId, teamId),
      queryFn: ({ signal }) => teamsApi.members(api, workspaceId, teamId, signal),
      enabled: Boolean(workspaceId && teamId),
      staleTime: 60_000,
      retry: false,
   });

export const teamSettingsQueryOptions = (api: ApiClient, workspaceId: string, teamId: string) =>
   queryOptions({
      queryKey: teamKeys.settings(workspaceId, teamId),
      queryFn: ({ signal }) => teamsApi.settings(api, workspaceId, teamId, signal),
      enabled: Boolean(workspaceId && teamId),
      staleTime: 60_000,
      retry: false,
   });

export const teamStatusesQueryOptions = (api: ApiClient, workspaceId: string, teamId: string) =>
   queryOptions({
      queryKey: teamKeys.statuses(workspaceId, teamId),
      queryFn: ({ signal }) => teamsApi.statuses(api, workspaceId, teamId, signal),
      enabled: Boolean(workspaceId && teamId),
      staleTime: 60_000,
      retry: false,
   });

export const teamIssuesQueryOptions = (api: ApiClient, workspaceId: string, teamId: string) =>
   infiniteQueryOptions({
      queryKey: teamKeys.issues(workspaceId, teamId),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ signal, pageParam }) =>
         teamsApi.issues(api, workspaceId, teamId, pageParam, signal),
      getNextPageParam: (page) =>
         page.meta.hasNext ? (page.meta.nextCursor ?? undefined) : undefined,
      enabled: Boolean(workspaceId && teamId),
      staleTime: 60_000,
      retry: false,
   });
