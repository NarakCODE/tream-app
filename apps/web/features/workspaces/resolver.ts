import type { ApiClient } from '@repo/api-client';
import type { QueryClient } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import type { Workspace } from '@repo/schemas';
import { activeWorkspaceQueryOptions } from '@/features/auth/queries';
import { workspacesApi } from './api';
import { workspaceDetailQueryOptions, workspaceKeys } from './queries';
import { isUuid } from './domain-url';

export const workspaceBySlugKey = (slug: string) =>
   [...workspaceKeys.all, 'by-slug', slug] as const;

/**
 * Resolves a workspace from a route parameter (which may be a slug or UUID).
 *
 * Execution order:
 * 1. Checks the currently active workspace query cache.
 * 2. If the identifier is a UUID, attempts direct detail fetch.
 * 3. Otherwise, paginates through accessible workspaces to match by slug.
 *
 * Seeds queryClient caches on success so subsequent lookups are instant.
 */
export async function resolveWorkspaceForRoute(
   api: ApiClient,
   queryClient: QueryClient,
   orgIdOrSlug: string
): Promise<Workspace | null> {
   if (!orgIdOrSlug) return null;

   // 1. Check active workspace (fast path)
   try {
      const active = await queryClient.fetchQuery(activeWorkspaceQueryOptions(api));
      if (
         active &&
         (active.workspace.slug === orgIdOrSlug || active.workspace.id === orgIdOrSlug)
      ) {
         queryClient.setQueryData(workspaceKeys.detail(active.workspace.id), active.workspace);
         queryClient.setQueryData(workspaceBySlugKey(orgIdOrSlug), active.workspace);
         return active.workspace;
      }
   } catch {
      // Proceed to lookup if active workspace check failed
   }

   // 2. Direct UUID lookup if format matches
   if (isUuid(orgIdOrSlug)) {
      try {
         const direct = await queryClient.fetchQuery(
            workspaceDetailQueryOptions(api, orgIdOrSlug)
         );
         if (direct) {
            queryClient.setQueryData(workspaceKeys.detail(direct.id), direct);
            queryClient.setQueryData(workspaceBySlugKey(direct.slug), direct);
            return direct;
         }
      } catch {
         // Fall through to list search if direct UUID fetch fails
      }
   }

   // 3. Paginated search across user's accessible workspaces
   let cursor: string | undefined;
   const visited = new Set<string>();
   do {
      try {
         const page = await workspacesApi.list(api, { limit: 25, cursor, cache: 'no-store' });
         const found = page.data.find(
            (candidate) => candidate.slug === orgIdOrSlug || candidate.id === orgIdOrSlug
         );
         if (found) {
            queryClient.setQueryData(workspaceKeys.detail(found.id), found);
            queryClient.setQueryData(workspaceBySlugKey(found.slug), found);
            return found;
         }
         cursor = page.meta.hasNext ? (page.meta.nextCursor ?? undefined) : undefined;
         if (cursor && visited.has(cursor)) break;
         if (cursor) visited.add(cursor);
      } catch {
         break;
      }
   } while (cursor);

   return null;
}

/**
 * TanStack query options for looking up a workspace by its URL slug.
 */
export const workspaceBySlugQueryOptions = (api: ApiClient, slug: string) =>
   queryOptions({
      queryKey: workspaceBySlugKey(slug),
      queryFn: async () => {
         let cursor: string | undefined;
         const visited = new Set<string>();
         do {
            const page = await workspacesApi.list(api, { limit: 25, cursor });
            const found = page.data.find(
               (candidate) => candidate.slug === slug || candidate.id === slug
            );
            if (found) return found;
            cursor = page.meta.hasNext ? (page.meta.nextCursor ?? undefined) : undefined;
            if (cursor && visited.has(cursor)) break;
            if (cursor) visited.add(cursor);
         } while (cursor);
         return null;
      },
      enabled: Boolean(slug),
      staleTime: 60_000,
   });
