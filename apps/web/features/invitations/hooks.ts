'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateInvitationInput } from '@repo/schemas';
import { api } from '@/lib/api';
import { authKeys } from '@/features/auth/queries';
import { bootstrapKeys } from '@/features/bootstrap/queries';
import { workspaceKeys } from '@/features/workspaces/queries';
import { invitationApi } from './api';
import { invitationKeys, invitationListQueryOptions } from './queries';

export function useInvitationList(workspaceId: string, limit = 50) {
   return useInfiniteQuery(invitationListQueryOptions(api, workspaceId, limit));
}

export function useCreateInvitation(workspaceId: string) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({
         email,
         role = 'MEMBER',
         key,
      }: Omit<CreateInvitationInput, 'role'> & {
         role?: CreateInvitationInput['role'];
         key: string;
      }) => invitationApi.create(workspaceId, { email, role }, key),
      onSuccess: () =>
         queryClient.invalidateQueries({ queryKey: invitationKeys.workspace(workspaceId) }),
   });
}

export function useRevokeInvitation(workspaceId: string) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ invitationId, key }: { invitationId: string; key: string }) =>
         invitationApi.revoke(workspaceId, invitationId, key),
      onSuccess: () =>
         queryClient.invalidateQueries({ queryKey: invitationKeys.workspace(workspaceId) }),
   });
}

export function useAcceptInvitation() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ token, key }: { token: string; key: string }) =>
         invitationApi.accept(token, key),
      onSuccess: async (membership) => {
         await Promise.all([
            queryClient.invalidateQueries({ queryKey: workspaceKeys.all }),
            queryClient.invalidateQueries({ queryKey: authKeys.activeWorkspace() }),
            queryClient.invalidateQueries({ queryKey: bootstrapKeys.all }),
            queryClient.invalidateQueries({
               queryKey: invitationKeys.workspace(membership.workspaceId),
            }),
         ]);
      },
   });
}
