'use client';

import { useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
   apiEnvelopeSchema,
   workspaceSchema,
   workspaceSelectionResponseSchema,
   createWorkspaceInputSchema,
   updateWorkspaceInputSchema,
   type UpdateWorkspaceInput,
} from '@repo/schemas';
import { api } from '@/lib/api';
import { authKeys } from '@/features/auth/queries';
import { workspaceKeys, workspaceListQueryOptions } from './queries';
import type { z } from 'zod';

export function useWorkspaceList() {
   return useInfiniteQuery(workspaceListQueryOptions(api));
}

export function useCreateWorkspace() {
   return useMutation({
      mutationFn: ({
         input,
         key,
      }: {
         input: z.infer<typeof createWorkspaceInputSchema>;
         key: string;
      }) =>
         api.post(
            '/api/v1/workspaces',
            apiEnvelopeSchema(workspaceSchema),
            createWorkspaceInputSchema.parse(input),
            {
               headers: { 'Idempotency-Key': key },
            }
         ),
   });
}

export function useSelectWorkspace() {
   return useMutation({
      mutationFn: ({ id, key }: { id: string; key: string }) =>
         api.post(
            `/api/v1/workspaces/${encodeURIComponent(id)}/select`,
            apiEnvelopeSchema(workspaceSelectionResponseSchema),
            undefined,
            {
               headers: { 'Idempotency-Key': key },
            }
         ),
   });
}

export function useUpdateWorkspace() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ id, input, key }: { id: string; input: UpdateWorkspaceInput; key: string }) =>
         api.patch(
            `/api/v1/workspaces/${encodeURIComponent(id)}`,
            apiEnvelopeSchema(workspaceSchema),
            updateWorkspaceInputSchema.parse(input),
            {
               headers: { 'Idempotency-Key': key },
            }
         ),
      onSuccess: () => {
         void queryClient.invalidateQueries({ queryKey: authKeys.activeWorkspace() });
         void queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      },
   });
}

export function useLeaveWorkspace() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ id, key }: { id: string; key: string }) =>
         api.post(
            `/api/v1/workspaces/${encodeURIComponent(id)}/leave`,
            apiEnvelopeSchema(workspaceSchema),
            undefined,
            {
               headers: { 'Idempotency-Key': key },
            }
         ),
      onSuccess: () => {
         void queryClient.invalidateQueries({ queryKey: authKeys.activeWorkspace() });
         void queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      },
   });
}
