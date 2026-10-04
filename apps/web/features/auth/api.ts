import { api, AUTH_COOKIE_NAME, deleteClientCookie, setClientCookie } from '@/lib/api';
import {
   activeWorkspaceResponseSchema,
   apiEnvelopeSchema,
   authMessageSchema,
   authResponseSchema,
   authSessionSchema,
   authUserSchema,
   type ActiveWorkspaceResponse,
   type AuthResponse,
   type AuthSession,
   type AuthUser,
   type EmailInput,
   type LoginInput,
   type ProfileInput,
   type ResetPasswordInput,
   type SignupInput,
   type TokenInput,
} from '@repo/schemas';
import { z } from 'zod';

const sessionListSchema = z.array(authSessionSchema);

function saveAccessToken(result: AuthResponse) {
   setClientCookie(AUTH_COOKIE_NAME, result.accessToken, result.expiresIn);
}

async function readMessage(path: string, input?: object, signal?: AbortSignal) {
   const envelope = await api.post(path, apiEnvelopeSchema(authMessageSchema), input ?? {}, {
      signal,
   });
   return envelope.data;
}

export const authApi = {
   async login(input: LoginInput, signal?: AbortSignal): Promise<AuthResponse> {
      const envelope = await api.post(
         '/api/v1/auth/login',
         apiEnvelopeSchema(authResponseSchema),
         input,
         { signal }
      );
      saveAccessToken(envelope.data);
      return envelope.data;
   },

   async signup(input: SignupInput, signal?: AbortSignal) {
      return readMessage('/api/v1/auth/signup', input, signal);
   },

   async refresh(signal?: AbortSignal): Promise<AuthResponse> {
      const envelope = await api.post(
         '/api/v1/auth/refresh',
         apiEnvelopeSchema(authResponseSchema),
         {},
         { signal }
      );
      saveAccessToken(envelope.data);
      return envelope.data;
   },

   async logout(signal?: AbortSignal): Promise<void> {
      try {
         await readMessage('/api/v1/auth/logout', {}, signal);
      } catch {
         // Clear the local session even when the API cannot be reached.
      } finally {
         deleteClientCookie(AUTH_COOKIE_NAME);
      }
   },

   async logoutAll(signal?: AbortSignal): Promise<void> {
      try {
         await readMessage('/api/v1/auth/logout-all', {}, signal);
      } catch {
         // Keep local sign-out behavior available if the API is unavailable.
      } finally {
         deleteClientCookie(AUTH_COOKIE_NAME);
      }
   },

   async getSessions(signal?: AbortSignal): Promise<AuthSession[]> {
      const envelope = await api.get(
         '/api/v1/auth/sessions',
         apiEnvelopeSchema(sessionListSchema),
         { signal }
      );
      return envelope.data;
   },

   async revokeSession(id: string, signal?: AbortSignal) {
      const envelope = await api.delete(
         `/api/v1/auth/sessions/${encodeURIComponent(id)}`,
         apiEnvelopeSchema(authMessageSchema),
         { signal }
      );
      return envelope.data;
   },

   requestPasswordRecovery(input: EmailInput, signal?: AbortSignal) {
      return readMessage('/api/v1/auth/password-recovery', input, signal);
   },

   resetPassword(input: ResetPasswordInput, signal?: AbortSignal) {
      return readMessage('/api/v1/auth/password-reset', input, signal);
   },

   requestEmailVerification(input: EmailInput, signal?: AbortSignal) {
      return readMessage('/api/v1/auth/email-verification/request', input, signal);
   },

   confirmEmailVerification(input: TokenInput, signal?: AbortSignal) {
      return readMessage('/api/v1/auth/email-verification/confirm', input, signal);
   },

   requestMagicLink(input: EmailInput, signal?: AbortSignal) {
      return readMessage('/api/v1/auth/magic-link/request', input, signal);
   },

   async consumeMagicLink(input: TokenInput, signal?: AbortSignal): Promise<AuthResponse> {
      const envelope = await api.post(
         '/api/v1/auth/magic-link/consume',
         apiEnvelopeSchema(authResponseSchema),
         input,
         { signal }
      );
      saveAccessToken(envelope.data);
      return envelope.data;
   },

   async getCurrentUser(signal?: AbortSignal): Promise<AuthUser> {
      const envelope = await api.get('/api/v1/me', apiEnvelopeSchema(authUserSchema), { signal });
      return envelope.data;
   },

   async updateProfile(input: ProfileInput, signal?: AbortSignal) {
      const envelope = await api.patch('/api/v1/me', apiEnvelopeSchema(authUserSchema), input, {
         signal,
      });
      return envelope.data;
   },

   async getActiveWorkspace(signal?: AbortSignal): Promise<ActiveWorkspaceResponse> {
      const envelope = await api.get(
         '/api/v1/workspaces/active',
         apiEnvelopeSchema(activeWorkspaceResponseSchema),
         { signal }
      );
      return envelope.data;
   },
};
