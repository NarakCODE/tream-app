import { queryOptions, type QueryClient } from '@tanstack/react-query';
import type { ApiClient } from '@repo/api-client';
import { apiEnvelopeSchema, bootstrapResponseSchema, type BootstrapResponse } from '@repo/schemas';
import { authKeys } from '@/features/auth/queries';

export const bootstrapKeys = {
   all: ['bootstrap'] as const,
   status: () => [...bootstrapKeys.all, 'status'] as const,
};

export function seedBootstrap(client: QueryClient, data: BootstrapResponse) {
   client.setQueryData(bootstrapKeys.status(), data);
   client.setQueryData(authKeys.currentUser(), data.user);
   client.setQueryData(authKeys.activeWorkspace(), data.activeWorkspace);
}

export const bootstrapQueryOptions = (api: ApiClient) =>
   queryOptions({
      queryKey: bootstrapKeys.status(),
      queryFn: async ({ signal }) =>
         (
            await api.get('/api/v1/bootstrap', apiEnvelopeSchema(bootstrapResponseSchema), {
               signal,
               cache: 'no-store',
            })
         ).data,
      staleTime: 30_000,
      retry: false,
   });
