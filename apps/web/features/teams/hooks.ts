'use client';

import { useMemo } from 'react';
import {
   useInfiniteQuery,
   useMutation,
   useQueries,
   useQuery,
   useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useWorkspaceId, useParentIds } from '@/features/workspaces/context';
import type { TeamStatus } from './types';
import {
   teamsApi,
   type CreateTeamInput,
   type CreateTeamStatusInput,
   type ReorderTeamStatusesInput,
   type RetireTeamStatusInput,
   type TeamMemberRole,
   type UpdateTeamInput,
   type UpdateTeamMemberInput,
   type UpdateTeamSettingsInput,
   type UpdateTeamStatusInput,
} from './api';
import {
   invalidateTeamLists,
   patchTeamInQueryCache,
   patchTeamMembersInQueryCache,
   patchTeamSettingsInQueryCache,
   patchTeamStatusesInQueryCache,
   prependTeamToQueryCache,
   removeTeamFromQueryCache,
} from './cache';
import { mapTeamError } from './errors';
import {
   teamDetailQueryOptions,
   teamIssuesQueryOptions,
   teamKeys,
   teamListQueryOptions,
   teamMembersQueryOptions,
   teamSettingsQueryOptions,
   teamStatusesQueryOptions,
} from './queries';

// ==========================================
// 1. Query Hooks (GET)
// ==========================================

export function useTeamList(explicitWorkspaceId?: string) {
   const workspaceId = useWorkspaceId(explicitWorkspaceId);
   return useInfiniteQuery(teamListQueryOptions(api, workspaceId));
}

export function useTeamDetail(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const workspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const teamId = explicitTeamId || parentIds.teamId || '';
   return useQuery(teamDetailQueryOptions(api, workspaceId, teamId));
}

export function useTeamMembers(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const workspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const teamId = explicitTeamId || parentIds.teamId || '';
   return useQuery(teamMembersQueryOptions(api, workspaceId, teamId));
}

export function useTeamSettings(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const workspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const teamId = explicitTeamId || parentIds.teamId || '';
   return useQuery(teamSettingsQueryOptions(api, workspaceId, teamId));
}

export function useTeamStatuses(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const workspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const teamId = explicitTeamId || parentIds.teamId || '';
   return useQuery(teamStatusesQueryOptions(api, workspaceId, teamId));
}

export function useTeamStatusesMap(explicitWorkspaceId?: string, teamIds: string[] = []) {
   const workspaceId = useWorkspaceId(explicitWorkspaceId);
   const sortedKey = useMemo(
      () => Array.from(new Set(teamIds.filter(Boolean))).sort().join(','),
      [teamIds]
   );
   const uniqueIds = useMemo(() => (sortedKey ? sortedKey.split(',') : []), [sortedKey]);

   const results = useQueries({
      queries: uniqueIds.map((teamId) => ({
         ...teamStatusesQueryOptions(api, workspaceId, teamId),
         enabled: Boolean(workspaceId && teamId),
      })),
   });

   const dataFingerprint = useMemo(() => {
      return results
         .map((r) =>
            Array.isArray(r.data)
               ? r.data.map((s) => `${s.id}:${s.name}:${s.category}`).join('|')
               : ''
         )
         .join(';');
   }, [results]);

   return useMemo(() => {
      const map = new Map<string, TeamStatus>();
      for (const res of results) {
         if (Array.isArray(res.data)) {
            for (const status of res.data) {
               map.set(status.id, status);
            }
         }
      }
      return map;
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [dataFingerprint]);
}

export function useTeamIssues(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const workspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const teamId = explicitTeamId || parentIds.teamId || '';
   return useInfiniteQuery(teamIssuesQueryOptions(api, workspaceId, teamId));
}

// ==========================================
// 2. Mutation Hooks (POST / PATCH / DELETE)
// ==========================================

export function useCreateTeam(explicitWorkspaceId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;

   return useMutation({
      mutationFn: ({ input, key }: { input: CreateTeamInput; key?: string }) =>
         teamsApi.create(api, workspaceId, input, key),
      onSuccess: (newTeam) => {
         prependTeamToQueryCache(queryClient, workspaceId, newTeam);
         toast.success(`Created team ${newTeam.key ?? newTeam.name}`);
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'create-team'));
      },
      onSettled: () => {
         void invalidateTeamLists(queryClient, workspaceId);
      },
   });
}

export function useUpdateTeam(explicitWorkspaceId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;

   return useMutation({
      mutationFn: ({
         teamId,
         input,
         key,
      }: {
         teamId: string;
         input: UpdateTeamInput;
         key?: string;
      }) => teamsApi.update(api, workspaceId, teamId, input, key),
      onSuccess: (updated) => {
         patchTeamInQueryCache(queryClient, workspaceId, updated);
         toast.success(`Updated team ${updated.name}`);
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'update-team'));
      },
      onSettled: () => {
         void invalidateTeamLists(queryClient, workspaceId);
      },
   });
}

export function useRetireTeam(explicitWorkspaceId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;

   return useMutation({
      mutationFn: ({ teamId, key }: { teamId: string; key?: string }) =>
         teamsApi.retire(api, workspaceId, teamId, key),
      onSuccess: (_, { teamId }) => {
         removeTeamFromQueryCache(queryClient, workspaceId, teamId);
         toast.success('Team retired successfully');
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'retire-team'));
      },
      onSettled: () => {
         void invalidateTeamLists(queryClient, workspaceId);
      },
   });
}

export function useAddTeamMember(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;
   const defaultTeamId = explicitTeamId || parentIds.teamId || '';

   return useMutation({
      mutationFn: ({
         teamId = defaultTeamId,
         membershipId,
         role = 'MEMBER',
         key,
      }: {
         teamId?: string;
         membershipId: string;
         role?: TeamMemberRole;
         key?: string;
      }) => teamsApi.addMember(api, workspaceId, teamId, { membershipId, role }, key),
      onSuccess: (newMember, variables) => {
         const targetTeamId = variables.teamId || defaultTeamId;
         patchTeamMembersInQueryCache(queryClient, workspaceId, targetTeamId, (cur) => [
            ...cur.filter((m) => m.membershipId !== newMember.membershipId),
            newMember,
         ]);
         toast.success('Added member to team');
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'add-member'));
      },
   });
}

export function useUpdateTeamMember(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;
   const defaultTeamId = explicitTeamId || parentIds.teamId || '';

   return useMutation({
      mutationFn: ({
         teamId = defaultTeamId,
         membershipId,
         role,
         key,
      }: {
         teamId?: string;
         membershipId: string;
         role: UpdateTeamMemberInput['role'];
         key?: string;
      }) => teamsApi.updateMember(api, workspaceId, teamId, membershipId, { role }, key),
      onSuccess: (updated, variables) => {
         const targetTeamId = variables.teamId || defaultTeamId;
         patchTeamMembersInQueryCache(queryClient, workspaceId, targetTeamId, (cur) =>
            cur.map((m) => (m.membershipId === updated.membershipId ? updated : m))
         );
         toast.success('Updated team member role');
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'update-member'));
      },
   });
}

export function useRemoveTeamMember(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;
   const defaultTeamId = explicitTeamId || parentIds.teamId || '';

   return useMutation({
      mutationFn: ({
         teamId = defaultTeamId,
         membershipId,
         key,
      }: {
         teamId?: string;
         membershipId: string;
         key?: string;
      }) => teamsApi.removeMember(api, workspaceId, teamId, membershipId, key),
      onSuccess: (_, variables) => {
         const targetTeamId = variables.teamId || defaultTeamId;
         patchTeamMembersInQueryCache(queryClient, workspaceId, targetTeamId, (cur) =>
            cur.filter((m) => m.membershipId !== variables.membershipId)
         );
         toast.success('Removed member from team');
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'remove-member'));
      },
   });
}

export function useTeamSettingsHook(workspaceId?: string, teamId?: string) {
   return useTeamSettings(workspaceId, teamId);
}

export function useUpdateTeamSettings(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;
   const defaultTeamId = explicitTeamId || parentIds.teamId || '';

   return useMutation({
      mutationFn: (
         variables:
            | (UpdateTeamSettingsInput & { teamId?: string })
            | { input: UpdateTeamSettingsInput; teamId?: string; key?: string }
      ) => {
         const teamId = ('teamId' in variables && variables.teamId) || defaultTeamId;
         const { input, key } =
            'input' in variables ? variables : { input: variables, key: undefined };
         return teamsApi.updateSettings(api, workspaceId, teamId, input, key);
      },
      onSuccess: (updated, variables) => {
         const teamId = ('teamId' in variables && variables.teamId) || defaultTeamId;
         patchTeamSettingsInQueryCache(queryClient, workspaceId, teamId, updated);
         patchTeamInQueryCache(queryClient, workspaceId, updated);
         toast.success('Updated team settings');
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'update-settings'));
      },
   });
}

export function useCreateTeamStatus(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;
   const defaultTeamId = explicitTeamId || parentIds.teamId || '';

   return useMutation({
      mutationFn: (
         variables:
            | (CreateTeamStatusInput & { teamId?: string })
            | { input: CreateTeamStatusInput; teamId?: string; key?: string }
      ) => {
         const teamId = ('teamId' in variables && variables.teamId) || defaultTeamId;
         const { input, key } =
            'input' in variables ? variables : { input: variables, key: undefined };
         return teamsApi.createStatus(api, workspaceId, teamId, input, key);
      },
      onSuccess: (newStatus, variables) => {
         const teamId = ('teamId' in variables && variables.teamId) || defaultTeamId;
         patchTeamStatusesInQueryCache(queryClient, workspaceId, teamId, (cur) => [
            ...cur,
            newStatus,
         ]);
         toast.success(`Created status "${newStatus.name}"`);
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'create-status'));
      },
   });
}

export function useReorderTeamStatuses(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;
   const defaultTeamId = explicitTeamId || parentIds.teamId || '';

   return useMutation({
      mutationFn: (
         variables:
            | (ReorderTeamStatusesInput & { teamId?: string })
            | { input: ReorderTeamStatusesInput; teamId?: string; key?: string }
      ) => {
         const teamId = ('teamId' in variables && variables.teamId) || defaultTeamId;
         const { input, key } =
            'input' in variables ? variables : { input: variables, key: undefined };
         return teamsApi.reorderStatuses(api, workspaceId, teamId, input, key);
      },
      onSuccess: (reordered, variables) => {
         const teamId = ('teamId' in variables && variables.teamId) || defaultTeamId;
         patchTeamStatusesInQueryCache(queryClient, workspaceId, teamId, () => reordered);
         toast.success('Statuses reordered successfully');
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'reorder-statuses'));
      },
   });
}

export function useUpdateTeamStatus(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;
   const defaultTeamId = explicitTeamId || parentIds.teamId || '';

   return useMutation({
      mutationFn: ({
         teamId = defaultTeamId,
         statusId,
         input,
         key,
      }: {
         teamId?: string;
         statusId: string;
         input: UpdateTeamStatusInput;
         key?: string;
      }) => teamsApi.updateStatus(api, workspaceId, teamId, statusId, input, key),
      onSuccess: (updated, variables) => {
         const teamId = variables.teamId || defaultTeamId;
         patchTeamStatusesInQueryCache(queryClient, workspaceId, teamId, (cur) =>
            cur.map((s) => (s.id === updated.id ? updated : s))
         );
         toast.success(`Updated status "${updated.name}"`);
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'update-status'));
      },
   });
}

export function useSetDefaultTeamStatus(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;
   const defaultTeamId = explicitTeamId || parentIds.teamId || '';

   return useMutation({
      mutationFn: ({
         teamId = defaultTeamId,
         statusId,
         key,
      }: {
         teamId?: string;
         statusId: string;
         key?: string;
      }) => teamsApi.setDefaultStatus(api, workspaceId, teamId, statusId, key),
      onSuccess: (updated, variables) => {
         const teamId = variables.teamId || defaultTeamId;
         patchTeamStatusesInQueryCache(queryClient, workspaceId, teamId, (cur) =>
            cur.map((s) =>
               s.id === updated.id ? { ...s, isDefault: true } : { ...s, isDefault: false }
            )
         );
         toast.success(`Set "${updated.name}" as default status`);
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'set-default-status'));
      },
   });
}

export function useRetireTeamStatus(explicitWorkspaceId?: string, explicitTeamId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   const parentIds = useParentIds();
   const workspaceId = explicitWorkspaceId || domainWorkspaceId;
   const defaultTeamId = explicitTeamId || parentIds.teamId || '';

   return useMutation({
      mutationFn: ({
         teamId = defaultTeamId,
         statusId,
         replacementStatusId,
         key,
      }: {
         teamId?: string;
         statusId: string;
         replacementStatusId?: RetireTeamStatusInput['replacementStatusId'];
         key?: string;
      }) =>
         teamsApi.retireStatus(
            api,
            workspaceId,
            teamId,
            statusId,
            replacementStatusId ? { replacementStatusId } : undefined,
            key
         ),
      onSuccess: (_, variables) => {
         const teamId = variables.teamId || defaultTeamId;
         patchTeamStatusesInQueryCache(queryClient, workspaceId, teamId, (cur) =>
            cur.filter((s) => s.id !== variables.statusId)
         );
         void queryClient.invalidateQueries({ queryKey: teamKeys.issues(workspaceId, teamId) });
         toast.success('Status retired successfully');
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'retire-status'));
      },
   });
}
