import type { ApiClient } from '@repo/api-client';
import {
   cursorPaginationMetaSchema,
   paginatedEnvelopeSchema,
   workspaceSchema,
} from '@repo/schemas';
import { infiniteQueryOptions } from '@tanstack/react-query';

export const workspaceKeys = {
   all: ['workspaces'] as const,
   list: () => [...workspaceKeys.all, 'list'] as const,
};

export const workspaceListResponseSchema = paginatedEnvelopeSchema(workspaceSchema).extend({
   meta: cursorPaginationMetaSchema,
});

export const workspaceListQueryOptions = (api: ApiClient) =>
   infiniteQueryOptions({
      queryKey: workspaceKeys.list(),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ signal, pageParam }) =>
         api.get('/api/v1/workspaces', workspaceListResponseSchema, {
            signal,
            params: { limit: 25, cursor: pageParam },
         }),
      getNextPageParam: (page) =>
         page.meta.hasNext ? (page.meta.nextCursor ?? undefined) : undefined,
      staleTime: 5 * 60 * 1000,
      retry: false,
   });
