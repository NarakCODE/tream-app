'use client';

import {
   useInfiniteQuery,
   useMutation,
   useQuery,
   useQueryClient,
   type QueryClient,
} from '@tanstack/react-query';
import type {
   CreateWorkspaceInput,
   UpdateMembershipInput,
   UpdateWorkspaceInput,
   UpdateWorkspacePreferencesInput,
} from '@repo/schemas';
import { api } from '@/lib/api';
import { authKeys } from '@/features/auth/queries';
import { workspacesApi } from './api';
import {
   workspaceDetailQueryOptions,
   workspaceListQueryOptions,
   workspaceMembersQueryOptions,
   workspacePreferencesQueryOptions,
   workspaceKeys,
} from './queries';
import { useWorkspaceId } from './context';

export function useWorkspaceList(limit = 50) {
   return useInfiniteQuery(workspaceListQueryOptions(api, limit));
}

export function useWorkspaceDetail(explicitWorkspaceId?: string) {
   const workspaceId = useWorkspaceId(explicitWorkspaceId);
   return useQuery(workspaceDetailQueryOptions(api, workspaceId));
}

export function useWorkspaceMembers(explicitWorkspaceId?: string, limit = 50) {
   const workspaceId = useWorkspaceId(explicitWorkspaceId);
   return useInfiniteQuery(workspaceMembersQueryOptions(api, workspaceId, limit));
}

export function useWorkspacePreferences(explicitWorkspaceId?: string) {
   const workspaceId = useWorkspaceId(explicitWorkspaceId);
   return useQuery(workspacePreferencesQueryOptions(api, workspaceId));
}

function invalidateWorkspaceState(queryClient: QueryClient, workspaceId?: string) {
   return Promise.all([
      queryClient.invalidateQueries({
         queryKey: workspaceId ? workspaceKeys.scope(workspaceId) : workspaceKeys.all,
      }),
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() }),
      queryClient.invalidateQueries({ queryKey: authKeys.activeWorkspace() }),
   ]);
}

export function useCreateWorkspace() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ input, key }: { input: CreateWorkspaceInput; key: string }) =>
         workspacesApi.create(api, input, key),
      onSuccess: async () => {
         await Promise.all([
            queryClient.invalidateQueries({ queryKey: workspaceKeys.list() }),
            queryClient.invalidateQueries({ queryKey: authKeys.activeWorkspace() }),
         ]);
      },
   });
}

export function useSelectWorkspace() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ id, key }: { id: string; key: string }) => workspacesApi.select(api, id, key),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.activeWorkspace() }),
   });
}

export function useUpdateWorkspace() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ id, input, key }: { id: string; input: UpdateWorkspaceInput; key: string }) =>
         workspacesApi.update(api, id, input, key),
      onSuccess: async (updated) => {
         queryClient.setQueryData(workspaceKeys.detail(updated.id), updated);
         await invalidateWorkspaceState(queryClient, updated.id);
      },
   });
}

export function useDeleteWorkspace() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ id, key }: { id: string; key: string }) => workspacesApi.remove(api, id, key),
      onSuccess: async (_, { id }) => {
         queryClient.removeQueries({ queryKey: workspaceKeys.detail(id), exact: true });
         await invalidateWorkspaceState(queryClient, id);
      },
   });
}

export function useLeaveWorkspace() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ id, key }: { id: string; key: string }) => workspacesApi.leave(api, id, key),
      onSuccess: async (_, { id }) => invalidateWorkspaceState(queryClient, id),
   });
}

export function useUpdateWorkspaceMember(explicitWorkspaceId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   return useMutation({
      mutationFn: ({
         membershipId,
         input,
         key,
         workspaceId = domainWorkspaceId,
      }: {
         membershipId: string;
         input: UpdateMembershipInput;
         key: string;
         workspaceId?: string;
      }) => workspacesApi.updateMember(api, workspaceId, membershipId, input, key),
      onSuccess: async (_, variables) => {
         const targetId = variables.workspaceId || domainWorkspaceId;
         await Promise.all([
            queryClient.invalidateQueries({ queryKey: workspaceKeys.memberLists(targetId) }),
            queryClient.invalidateQueries({ queryKey: authKeys.activeWorkspace() }),
         ]);
      },
   });
}

export function useRemoveWorkspaceMember(explicitWorkspaceId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   return useMutation({
      mutationFn: ({
         membershipId,
         key,
         workspaceId = domainWorkspaceId,
      }: {
         membershipId: string;
         key: string;
         workspaceId?: string;
      }) => workspacesApi.removeMember(api, workspaceId, membershipId, key),
      onSuccess: async (_, variables) => {
         const targetId = variables.workspaceId || domainWorkspaceId;
         await Promise.all([
            queryClient.invalidateQueries({ queryKey: workspaceKeys.memberLists(targetId) }),
            queryClient.invalidateQueries({ queryKey: authKeys.activeWorkspace() }),
         ]);
      },
   });
}

export function useUpdateWorkspacePreferences(explicitWorkspaceId?: string) {
   const queryClient = useQueryClient();
   const domainWorkspaceId = useWorkspaceId(explicitWorkspaceId);
   return useMutation({
      mutationFn: ({
         input,
         key,
         workspaceId = domainWorkspaceId,
      }: {
         input: UpdateWorkspacePreferencesInput;
         key: string;
         workspaceId?: string;
      }) => workspacesApi.updatePreferences(api, workspaceId, input, key),
      onSuccess: (preferences, variables) => {
         const targetId = variables.workspaceId || domainWorkspaceId;
         queryClient.setQueryData(workspaceKeys.preferences(targetId), preferences);
      },
   });
}
