import 'server-only';

import { cookies } from 'next/headers';
import { createApiClient } from '@repo/api-client';
import { AUTH_COOKIE_NAME } from './auth-cookie';

export async function createServerApiClient(deadline?: AbortSignal) {
   const cookieStore = await cookies();
   const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
   return createApiClient({
      baseUrl:
         process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002',
      getHeaders: () => ({
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
         Cookie: cookieStore.toString(),
      }),
      fetchFn: (input, init) =>
         fetch(input, {
            ...init,
            cache: 'no-store',
            signal: deadline
               ? AbortSignal.any([deadline, ...(init?.signal ? [init.signal] : [])])
               : init?.signal,
         }),
   });
}
