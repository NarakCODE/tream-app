import { createApiClient } from '@repo/api-client';
import { apiEnvelopeSchema, authResponseSchema } from '@repo/schemas';

export const isServer = typeof window === 'undefined';

const localApiUrl = 'http://localhost:3002';
const baseUrl = process.env.NEXT_PUBLIC_API_URL || localApiUrl;

export { AUTH_COOKIE_NAME } from './auth-cookie';
import { AUTH_COOKIE_NAME } from './auth-cookie';

export function getClientCookie(name: string): string | null {
   if (typeof document === 'undefined') return null;
   const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
   const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`));
   return match ? decodeURIComponent(match[1]) : null;
}

export function setClientCookie(name: string, value: string, maxAgeSeconds: number): void {
   if (typeof document === 'undefined') return;
   const secure = window.location.protocol === 'https:' ? '; Secure' : '';
   document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

export function deleteClientCookie(name: string): void {
   if (typeof document === 'undefined') return;
   const secure = window.location.protocol === 'https:' ? '; Secure' : '';
   document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

/** Reads the current JWT session id for labeling the session list UI only. */
export function getCurrentSessionId(): string | null {
   const token = getClientCookie(AUTH_COOKIE_NAME);
   const payload = token?.split('.')[1];
   if (!payload) return null;
   try {
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
      const claims: unknown = JSON.parse(decoded);
      return typeof claims === 'object' &&
         claims !== null &&
         'sid' in claims &&
         typeof claims.sid === 'string'
         ? claims.sid
         : null;
   } catch {
      return null;
   }
}

async function getHeaders(): Promise<HeadersInit> {
   const headers: Record<string, string> = {};

   const token = getClientCookie(AUTH_COOKIE_NAME);
   if (token) headers.Authorization = `Bearer ${token}`;

   return headers;
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
   if (refreshInFlight) return refreshInFlight;

   refreshInFlight = (async () => {
      try {
         const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: {
               'Accept': 'application/json',
               'Content-Type': 'application/json',
            },
            body: '{}',
            credentials: 'include',
            signal: AbortSignal.timeout(10_000),
         });
         if (!response.ok) {
            deleteClientCookie(AUTH_COOKIE_NAME);
            return null;
         }

         const envelope = apiEnvelopeSchema(authResponseSchema).parse(await response.json());
         setClientCookie(AUTH_COOKIE_NAME, envelope.data.accessToken, envelope.data.expiresIn);
         return envelope.data.accessToken;
      } catch {
         deleteClientCookie(AUTH_COOKIE_NAME);
         return null;
      } finally {
         refreshInFlight = null;
      }
   })();

   return refreshInFlight;
}

function isPublicAuthRequest(input: RequestInfo | URL): boolean {
   const value = typeof input === 'string' || input instanceof URL ? input : input.url;
   const pathname = new URL(value, baseUrl).pathname;
   return [
      '/api/v1/auth/signup',
      '/api/v1/auth/login',
      '/api/v1/auth/refresh',
      '/api/v1/auth/password-recovery',
      '/api/v1/auth/password-reset',
      '/api/v1/auth/email-verification/request',
      '/api/v1/auth/email-verification/confirm',
      '/api/v1/auth/magic-link/request',
      '/api/v1/auth/magic-link/consume',
   ].includes(pathname);
}

async function fetchWithAuthRefresh(
   input: RequestInfo | URL,
   init?: RequestInit
): Promise<Response> {
   const response = await fetch(input, init);
   if (response.status !== 401 || isServer || isPublicAuthRequest(input)) {
      return response;
   }

   const token = await refreshAccessToken();
   if (!token) return response;

   const headers = new Headers(init?.headers);
   headers.set('Authorization', `Bearer ${token}`);
   return fetch(input, { ...init, headers });
}

export const api = createApiClient({
   baseUrl,
   getHeaders,
   credentials: isServer ? undefined : 'include',
   fetchFn: fetchWithAuthRefresh,
});

export default api;
