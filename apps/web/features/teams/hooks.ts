'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateTeamInput } from '@repo/schemas';
import { api } from '@/lib/api';
import { teamsApi } from './api';
import { teamKeys, teamListQueryOptions } from './queries';

export function useTeamList(workspaceId: string) {
   return useInfiniteQuery(teamListQueryOptions(api, workspaceId));
}
export function useCreateTeam(workspaceId: string) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ input, key }: { input: CreateTeamInput; key: string }) =>
         teamsApi.create(api, workspaceId, input, key),
      onSuccess: () => {
         void queryClient.invalidateQueries({ queryKey: teamKeys.workspace(workspaceId) });
      },
   });
}
