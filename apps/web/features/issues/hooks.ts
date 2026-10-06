'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useWorkspaceId, useParentIds } from '@/features/workspaces/context';
import {
   issuesApi,
   type CreateIssuePayload,
   type CreateTeamIssuePayload,
   type RelationPayload,
   type TransferIssuePayload,
   type UpdateIssuePayload,
} from './api';
import {
   invalidateIssueLists,
   patchIssueInQueryCache,
   patchIssueRelationsInQueryCache,
   prependIssueToQueryCache,
   removeIssueFromQueryCache,
} from './cache';
import {
   issueDetailQueryOptions,
   issueListQueryOptions,
   issueLookupQueryOptions,
   issueRelationsQueryOptions,
   type IssueListFilters,
} from './queries';

export function useIssueList(
   workspaceIdOrFilters?: string | IssueListFilters,
   maybeFilters?: IssueListFilters
) {
   const domainWorkspaceId = useWorkspaceId();
   const workspaceId =
      typeof workspaceIdOrFilters === 'string' ? workspaceIdOrFilters : domainWorkspaceId;
   const filters =
      typeof workspaceIdOrFilters === 'object' && workspaceIdOrFilters !== null
         ? workspaceIdOrFilters
         : maybeFilters ?? {};

   return useInfiniteQuery(issueListQueryOptions(api, workspaceId, filters));
}

export function useIssueDetail(explicitWorkspaceId?: string, explicitIssueId?: string) {
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;
   const issueId = explicitIssueId || parentIds.issueId || '';

   return useQuery(issueDetailQueryOptions(api, workspaceId, issueId));
}

export function useIssueLookup(explicitWorkspaceId?: string, identifier?: string) {
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;

   return useQuery(issueLookupQueryOptions(api, workspaceId, identifier || ''));
}

export function useIssueRelations(explicitWorkspaceId?: string, explicitIssueId?: string) {
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;
   const issueId = explicitIssueId || parentIds.issueId || '';

   return useQuery(issueRelationsQueryOptions(api, workspaceId, issueId));
}

export function useCreateIssue(explicitWorkspaceId?: string) {
   const client = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;

   return useMutation({
      mutationFn: (payload: CreateIssuePayload) => issuesApi.create(api, workspaceId, payload),
      onSuccess: (newIssue) => {
         prependIssueToQueryCache(client, workspaceId, newIssue);
         toast.success(`Created ${newIssue.identifier}`);
      },
      onError: (err) => {
         toast.error(err instanceof Error ? err.message : 'Failed to create issue');
      },
      onSettled: () => {
         void invalidateIssueLists(client, workspaceId);
      },
   });
}

export function useCreateTeamIssue(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const client = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;
   const teamId = explicitTeamId || parentIds.teamId || '';

   return useMutation({
      mutationFn: (payload: CreateTeamIssuePayload) =>
         issuesApi.createTeamIssue(api, workspaceId, teamId, payload),
      onSuccess: (newIssue) => {
         prependIssueToQueryCache(client, workspaceId, newIssue);
         toast.success(`Created ${newIssue.identifier}`);
      },
      onError: (err) => {
         toast.error(err instanceof Error ? err.message : 'Failed to create issue');
      },
      onSettled: () => {
         void invalidateIssueLists(client, workspaceId);
      },
   });
}

export function useUpdateIssue(explicitWorkspaceId?: string) {
   const client = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;

   return useMutation({
      mutationFn: ({ issueId, payload }: { issueId: string; payload: UpdateIssuePayload }) =>
         issuesApi.update(api, workspaceId, issueId, payload),
      onSuccess: (updated) => {
         patchIssueInQueryCache(client, workspaceId, updated);
      },
      onError: (err) => {
         toast.error(err instanceof Error ? err.message : 'Failed to update issue');
      },
      onSettled: () => {
         void invalidateIssueLists(client, workspaceId);
      },
   });
}

export function useArchiveIssue(explicitWorkspaceId?: string) {
   const client = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;

   return useMutation({
      mutationFn: ({ issueId, expectedRevision }: { issueId: string; expectedRevision: number }) =>
         issuesApi.archive(api, workspaceId, issueId, expectedRevision),
      onSuccess: (archived) => {
         patchIssueInQueryCache(client, workspaceId, archived);
         toast.success(`Archived ${archived.identifier}`);
      },
      onError: (err) => {
         toast.error(err instanceof Error ? err.message : 'Failed to archive issue');
      },
      onSettled: () => {
         void invalidateIssueLists(client, workspaceId);
      },
   });
}

export function useRestoreIssue(explicitWorkspaceId?: string) {
   const client = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;

   return useMutation({
      mutationFn: ({ issueId, expectedRevision }: { issueId: string; expectedRevision: number }) =>
         issuesApi.restore(api, workspaceId, issueId, expectedRevision),
      onSuccess: (restored) => {
         patchIssueInQueryCache(client, workspaceId, restored);
         toast.success(`Restored ${restored.identifier}`);
      },
      onError: (err) => {
         toast.error(err instanceof Error ? err.message : 'Failed to restore issue');
      },
      onSettled: () => {
         void invalidateIssueLists(client, workspaceId);
      },
   });
}

export function useDeleteIssue(explicitWorkspaceId?: string) {
   const client = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;

   return useMutation({
      mutationFn: ({ issueId, expectedRevision }: { issueId: string; expectedRevision: number }) =>
         issuesApi.delete(api, workspaceId, issueId, expectedRevision),
      onSuccess: (deleted) => {
         removeIssueFromQueryCache(client, workspaceId, deleted.id);
         toast.success(`Deleted ${deleted.identifier}`);
      },
      onError: (err) => {
         toast.error(err instanceof Error ? err.message : 'Failed to delete issue');
      },
      onSettled: () => {
         void invalidateIssueLists(client, workspaceId);
      },
   });
}

export function useTransferIssue(explicitWorkspaceId?: string) {
   const client = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;

   return useMutation({
      mutationFn: ({ issueId, payload }: { issueId: string; payload: TransferIssuePayload }) =>
         issuesApi.transfer(api, workspaceId, issueId, payload),
      onSuccess: (transferred) => {
         patchIssueInQueryCache(client, workspaceId, transferred);
         toast.success(`Transferred issue to ${transferred.identifier}`);
      },
      onError: (err) => {
         toast.error(err instanceof Error ? err.message : 'Failed to transfer issue');
      },
      onSettled: () => {
         void invalidateIssueLists(client, workspaceId);
      },
   });
}

export function useAddIssueRelation(explicitWorkspaceId?: string) {
   const client = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;

   return useMutation({
      mutationFn: ({ issueId, payload }: { issueId: string; payload: RelationPayload }) =>
         issuesApi.addRelation(api, workspaceId, issueId, payload),
      onSuccess: ({ issue, relation }) => {
         patchIssueInQueryCache(client, workspaceId, issue);
         patchIssueRelationsInQueryCache(client, workspaceId, issue.id, (current) => [
            ...current,
            relation,
         ]);
         toast.success('Added relation');
      },
      onError: (err) => {
         toast.error(err instanceof Error ? err.message : 'Failed to add relation');
      },
   });
}

export function useRemoveIssueRelation(explicitWorkspaceId?: string) {
   const client = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;

   return useMutation({
      mutationFn: ({
         issueId,
         relationId,
         expectedRevision,
      }: {
         issueId: string;
         relationId: string;
         expectedRevision: number;
      }) => issuesApi.removeRelation(api, workspaceId, issueId, relationId, expectedRevision),
      onSuccess: ({ issue, relationId }, variables) => {
         patchIssueInQueryCache(client, workspaceId, issue);
         const targetRelationId = relationId || variables.relationId;
         patchIssueRelationsInQueryCache(client, workspaceId, issue.id, (current) =>
            current.filter((r) => r.id !== targetRelationId)
         );
         toast.success('Removed relation');
      },
      onError: (err) => {
         toast.error(err instanceof Error ? err.message : 'Failed to remove relation');
      },
   });
}
