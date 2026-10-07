'use client';

import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AUTH_COOKIE_NAME, deleteClientCookie, getCurrentSessionId } from '@/lib/api';
import { authApi } from './api';
import { bootstrapKeys } from '@/features/bootstrap/queries';
import { api } from '@/lib/api';
import {
   authKeys,
   currentUserQueryOptions,
   activeWorkspaceQueryOptions,
   authSessionsQueryOptions,
} from './queries';
import type {
   EmailInput,
   LoginInput,
   ProfileInput,
   ResetPasswordInput,
   SignupInput,
   TokenInput,
} from '@repo/schemas';

export function useCurrentUser() {
   return useQuery(currentUserQueryOptions(api));
}

export function useSuspenseCurrentUser() {
   return useSuspenseQuery(currentUserQueryOptions(api));
}

export function useActiveWorkspace() {
   return useQuery(activeWorkspaceQueryOptions(api));
}

export function useSuspenseActiveWorkspace() {
   return useSuspenseQuery(activeWorkspaceQueryOptions(api));
}

export function useLoginMutation() {
   const queryClient = useQueryClient();
   const router = useRouter();

   return useMutation({
      mutationFn: (input: LoginInput) => authApi.login(input),
      onSuccess: async (data) => {
         // Seed the current user in query cache immediately
         queryClient.clear();
         queryClient.setQueryData(authKeys.currentUser(), data.user);
         await queryClient.invalidateQueries({ queryKey: authKeys.all });
         router.refresh();
      },
   });
}

export function useSignupMutation() {
   return useMutation({
      mutationFn: (input: SignupInput) => authApi.signup(input),
   });
}

export function useLogoutMutation() {
   const queryClient = useQueryClient();
   const router = useRouter();

   return useMutation({
      mutationFn: () => authApi.logout(),
      onSuccess: async () => {
         queryClient.clear();
         router.push('/login');
         router.refresh();
      },
   });
}

export function useLogoutAllMutation() {
   const queryClient = useQueryClient();
   const router = useRouter();

   return useMutation({
      mutationFn: () => authApi.logoutAll(),
      onSuccess: async () => {
         queryClient.clear();
         router.push('/login');
         router.refresh();
      },
   });
}

export function useAuthSessions() {
   return useQuery(authSessionsQueryOptions(api));
}

export function useRevokeSessionMutation() {
   const queryClient = useQueryClient();
   const router = useRouter();

   return useMutation({
      mutationFn: (id: string) => authApi.revokeSession(id),
      onSuccess: async (_result, id) => {
         if (getCurrentSessionId() === id) {
            deleteClientCookie(AUTH_COOKIE_NAME);
            queryClient.clear();
            router.push('/login');
            router.refresh();
            return;
         }
         await queryClient.invalidateQueries({ queryKey: authKeys.all });
      },
   });
}

export function useRequestPasswordRecoveryMutation() {
   return useMutation({
      mutationFn: (input: EmailInput) => authApi.requestPasswordRecovery(input),
   });
}

export function useResetPasswordMutation() {
   const router = useRouter();

   return useMutation({
      mutationFn: (input: ResetPasswordInput) => authApi.resetPassword(input),
      onSuccess: () => router.push('/login'),
   });
}

export function useRequestEmailVerificationMutation() {
   return useMutation({
      mutationFn: (input: EmailInput) => authApi.requestEmailVerification(input),
   });
}

export function useConfirmEmailVerificationMutation() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: (input: TokenInput) => authApi.confirmEmailVerification(input),
      onSuccess: () =>
         Promise.all([
            queryClient.invalidateQueries({ queryKey: authKeys.currentUser() }),
            queryClient.invalidateQueries({ queryKey: bootstrapKeys.all }),
         ]),
   });
}

export function useRequestMagicLinkMutation() {
   return useMutation({
      mutationFn: (input: EmailInput) => authApi.requestMagicLink(input),
   });
}

export function useConsumeMagicLinkMutation() {
   const queryClient = useQueryClient();
   const router = useRouter();

   return useMutation({
      mutationFn: (input: TokenInput) => authApi.consumeMagicLink(input),
      onSuccess: async (data) => {
         queryClient.clear();
         queryClient.setQueryData(authKeys.currentUser(), data.user);
         await queryClient.invalidateQueries({ queryKey: authKeys.all });
         router.push('/');
         router.refresh();
      },
   });
}

export function useUpdateProfileMutation() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: (input: ProfileInput) => authApi.updateProfile(input),
      onSuccess: async (user) => {
         queryClient.setQueryData(authKeys.currentUser(), user);
         await Promise.all([
            queryClient.invalidateQueries({ queryKey: authKeys.currentUser() }),
            queryClient.invalidateQueries({ queryKey: bootstrapKeys.all }),
         ]);
      },
   });
}
