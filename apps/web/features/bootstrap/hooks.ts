'use client';

import { useEffect } from 'react';
import { authKeys } from '@/features/auth/queries';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiEnvelopeSchema, bootstrapResponseSchema } from '@repo/schemas';
import { api } from '@/lib/api';
import { bootstrapQueryOptions, seedBootstrap } from './queries';

export function useBootstrap() {
   const client = useQueryClient();
   const query = useQuery(bootstrapQueryOptions(api));
   useEffect(() => {
      if (!query.data) return;
      client.setQueryData(authKeys.currentUser(), query.data.user);
      client.setQueryData(authKeys.activeWorkspace(), query.data.activeWorkspace);
   }, [client, query.data]);
   return query;
}

export function useCompleteOnboarding(workspaceId: string) {
   const client = useQueryClient();
   return useMutation({
      mutationFn: async (key: string) =>
         (
            await api.post(
               `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/onboarding/complete`,
               apiEnvelopeSchema(bootstrapResponseSchema),
               {},
               { headers: { 'Idempotency-Key': key } }
            )
         ).data,
      onSuccess: (data) => seedBootstrap(client, data),
   });
}
