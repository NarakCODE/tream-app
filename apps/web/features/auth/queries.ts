import { queryOptions } from '@tanstack/react-query';
import type { ApiClient } from '@repo/api-client';
import { apiEnvelopeSchema, authUserSchema, authSessionSchema } from '@repo/schemas';
import { workspacesApi } from '@/features/workspaces/api';
import { z } from 'zod';

export const authKeys = {
   all: ['auth'] as const,
   currentUser: () => [...authKeys.all, 'me'] as const,
   activeWorkspace: () => [...authKeys.all, 'active-workspace'] as const,
   sessions: () => [...authKeys.all, 'sessions'] as const,
};

export const currentUserQueryOptions = (api: ApiClient) =>
   queryOptions({
      queryKey: authKeys.currentUser(),
      queryFn: async ({ signal }) =>
         (
            await api.get('/api/v1/me', apiEnvelopeSchema(authUserSchema), {
               signal,
               cache: 'no-store',
            })
         ).data,
      staleTime: 5 * 60 * 1000,
      retry: false,
   });

export const activeWorkspaceQueryOptions = (api: ApiClient) =>
   queryOptions({
      queryKey: authKeys.activeWorkspace(),
      queryFn: ({ signal }) => workspacesApi.active(api, signal),
      staleTime: 5 * 60 * 1000,
      retry: false,
   });

export const authSessionsQueryOptions = (api: ApiClient) =>
   queryOptions({
      queryKey: authKeys.sessions(),
      queryFn: async ({ signal }) =>
         (
            await api.get('/api/v1/auth/sessions', apiEnvelopeSchema(z.array(authSessionSchema)), {
               signal,
               cache: 'no-store',
            })
         ).data,
      staleTime: 60 * 1000,
      retry: false,
   });
