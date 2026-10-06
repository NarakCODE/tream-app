import type { ApiClient } from '@repo/api-client';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import type { IssueListQuery } from '@repo/schemas';
import { issuesApi } from './api';

export type IssueListFilters = Omit<IssueListQuery, 'cursor'>;

export const issueKeys = {
   all: ['issues'] as const,
   workspace: (workspaceId: string) => [...issueKeys.all, workspaceId] as const,
   lists: (workspaceId: string) => [...issueKeys.workspace(workspaceId), 'list'] as const,
   list: (workspaceId: string, filters: IssueListFilters = {}) =>
      [...issueKeys.lists(workspaceId), filters] as const,
   detail: (workspaceId: string, issueId: string) =>
      [...issueKeys.workspace(workspaceId), 'detail', issueId] as const,
   lookup: (workspaceId: string, identifier: string) =>
      [...issueKeys.workspace(workspaceId), 'lookup', identifier] as const,
   relations: (workspaceId: string, issueId: string) =>
      [...issueKeys.workspace(workspaceId), 'relations', issueId] as const,
};

export const issueListQueryOptions = (
   api: ApiClient,
   workspaceId: string,
   filters: IssueListFilters = {}
) =>
   infiniteQueryOptions({
      queryKey: issueKeys.list(workspaceId, filters),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ signal, pageParam }) =>
         issuesApi.list(api, workspaceId, { ...filters, cursor: pageParam }, signal),
      getNextPageParam: (page) =>
         page?.meta?.hasNext ? (page.meta.nextCursor ?? undefined) : undefined,
      enabled: Boolean(workspaceId),
      staleTime: 30_000,
      retry: false,
   });

export const issueDetailQueryOptions = (api: ApiClient, workspaceId: string, issueId: string) =>
   queryOptions({
      queryKey: issueKeys.detail(workspaceId, issueId),
      queryFn: ({ signal }) => issuesApi.get(api, workspaceId, issueId, signal),
      enabled: Boolean(workspaceId && issueId),
      staleTime: 30_000,
      retry: false,
   });

export const issueLookupQueryOptions = (api: ApiClient, workspaceId: string, identifier: string) =>
   queryOptions({
      queryKey: issueKeys.lookup(workspaceId, identifier),
      queryFn: ({ signal }) => issuesApi.lookup(api, workspaceId, identifier, signal),
      enabled: Boolean(workspaceId && identifier),
      staleTime: 30_000,
      retry: false,
   });

export const issueRelationsQueryOptions = (api: ApiClient, workspaceId: string, issueId: string) =>
   queryOptions({
      queryKey: issueKeys.relations(workspaceId, issueId),
      queryFn: ({ signal }) => issuesApi.relations(api, workspaceId, issueId, signal),
      enabled: Boolean(workspaceId && issueId),
      staleTime: 30_000,
      retry: false,
   });
