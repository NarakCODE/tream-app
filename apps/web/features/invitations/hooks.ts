'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authKeys } from '@/features/auth/queries';
import { workspaceKeys } from '@/features/workspaces/queries';
import { invitationApi } from './api';
import { invitationKeys } from './queries';

export function useCreateInvitation(workspaceId: string) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ email, key }: { email: string; key: string }) =>
         invitationApi.create(workspaceId, email, key),
      onSuccess: () =>
         Promise.all([
            queryClient.invalidateQueries({ queryKey: invitationKeys.workspace(workspaceId) }),
            queryClient.invalidateQueries({ queryKey: workspaceKeys.all }),
         ]),
   });
}

export function useAcceptInvitation() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ token, key }: { token: string; key: string }) =>
         invitationApi.accept(token, key),
      onSuccess: async () => {
         await Promise.all([
            queryClient.invalidateQueries({ queryKey: workspaceKeys.all }),
            queryClient.invalidateQueries({ queryKey: authKeys.activeWorkspace() }),
         ]);
      },
   });
}
