'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
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

export function useTeamList(workspaceId: string) {
   return useInfiniteQuery(teamListQueryOptions(api, workspaceId));
}

export function useTeamDetail(workspaceId: string, teamId: string) {
   return useQuery(teamDetailQueryOptions(api, workspaceId, teamId));
}

export function useTeamMembers(workspaceId: string, teamId: string) {
   return useQuery(teamMembersQueryOptions(api, workspaceId, teamId));
}

export function useTeamSettings(workspaceId: string, teamId: string) {
   return useQuery(teamSettingsQueryOptions(api, workspaceId, teamId));
}

export function useTeamStatuses(workspaceId: string, teamId: string) {
   return useQuery(teamStatusesQueryOptions(api, workspaceId, teamId));
}

export function useTeamIssues(workspaceId: string, teamId: string) {
   return useInfiniteQuery(teamIssuesQueryOptions(api, workspaceId, teamId));
}

// ==========================================
// 2. Mutation Hooks (POST / PATCH / DELETE)
// ==========================================

export function useCreateTeam(workspaceId: string) {
   const queryClient = useQueryClient();
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

export function useUpdateTeam(workspaceId: string) {
   const queryClient = useQueryClient();
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

export function useRetireTeam(workspaceId: string) {
   const queryClient = useQueryClient();
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

export function useAddTeamMember(workspaceId: string, teamId: string) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({
         membershipId,
         role = 'MEMBER',
         key,
      }: {
         membershipId: string;
         role?: TeamMemberRole;
         key?: string;
      }) => teamsApi.addMember(api, workspaceId, teamId, { membershipId, role }, key),
      onSuccess: (newMember) => {
         patchTeamMembersInQueryCache(queryClient, workspaceId, teamId, (cur) => [
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

export function useUpdateTeamMember(workspaceId: string, teamId: string) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({
         membershipId,
         role,
         key,
      }: {
         membershipId: string;
         role: UpdateTeamMemberInput['role'];
         key?: string;
      }) => teamsApi.updateMember(api, workspaceId, teamId, membershipId, { role }, key),
      onSuccess: (updated) => {
         patchTeamMembersInQueryCache(queryClient, workspaceId, teamId, (cur) =>
            cur.map((m) => (m.membershipId === updated.membershipId ? updated : m))
         );
         toast.success('Updated team member role');
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'update-member'));
      },
   });
}

export function useRemoveTeamMember(workspaceId: string, teamId: string) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ membershipId, key }: { membershipId: string; key?: string }) =>
         teamsApi.removeMember(api, workspaceId, teamId, membershipId, key),
      onSuccess: (_, { membershipId }) => {
         patchTeamMembersInQueryCache(queryClient, workspaceId, teamId, (cur) =>
            cur.filter((m) => m.membershipId !== membershipId)
         );
         toast.success('Removed member from team');
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'remove-member'));
      },
   });
}

export function useTeamSettingsHook(workspaceId: string, teamId: string) {
   return useTeamSettings(workspaceId, teamId);
}

export function useUpdateTeamSettings(workspaceId: string, teamId: string) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: (
         variables:
            | UpdateTeamSettingsInput
            | { input: UpdateTeamSettingsInput; key?: string }
      ) => {
         const { input, key } =
            'input' in variables
               ? variables
               : { input: variables, key: undefined };
         return teamsApi.updateSettings(api, workspaceId, teamId, input, key);
      },
      onSuccess: (updated) => {
         patchTeamSettingsInQueryCache(queryClient, workspaceId, teamId, updated);
         patchTeamInQueryCache(queryClient, workspaceId, updated);
         toast.success('Updated team settings');
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'update-settings'));
      },
   });
}

export function useCreateTeamStatus(workspaceId: string, teamId: string) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: (
         variables:
            | CreateTeamStatusInput
            | { input: CreateTeamStatusInput; key?: string }
      ) => {
         const { input, key } =
            'input' in variables
               ? variables
               : { input: variables, key: undefined };
         return teamsApi.createStatus(api, workspaceId, teamId, input, key);
      },
      onSuccess: (newStatus) => {
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

export function useReorderTeamStatuses(workspaceId: string, teamId: string) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: (
         variables:
            | ReorderTeamStatusesInput
            | { input: ReorderTeamStatusesInput; key?: string }
      ) => {
         const { input, key } =
            'input' in variables
               ? variables
               : { input: variables, key: undefined };
         return teamsApi.reorderStatuses(api, workspaceId, teamId, input, key);
      },
      onSuccess: (reordered) => {
         patchTeamStatusesInQueryCache(queryClient, workspaceId, teamId, () => reordered);
         toast.success('Statuses reordered successfully');
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'reorder-statuses'));
      },
   });
}

export function useUpdateTeamStatus(workspaceId: string, teamId: string) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({
         statusId,
         input,
         key,
      }: {
         statusId: string;
         input: UpdateTeamStatusInput;
         key?: string;
      }) => teamsApi.updateStatus(api, workspaceId, teamId, statusId, input, key),
      onSuccess: (updated) => {
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

export function useSetDefaultTeamStatus(workspaceId: string, teamId: string) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ statusId, key }: { statusId: string; key?: string }) =>
         teamsApi.setDefaultStatus(api, workspaceId, teamId, statusId, key),
      onSuccess: (updated) => {
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

export function useRetireTeamStatus(workspaceId: string, teamId: string) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({
         statusId,
         replacementStatusId,
         key,
      }: {
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
      onSuccess: (_, { statusId }) => {
         patchTeamStatusesInQueryCache(queryClient, workspaceId, teamId, (cur) =>
            cur.filter((s) => s.id !== statusId)
         );
         void queryClient.invalidateQueries({ queryKey: teamKeys.issues(workspaceId, teamId) });
         toast.success('Status retired successfully');
      },
      onError: (err) => {
         toast.error(mapTeamError(err, 'retire-status'));
      },
   });
}
