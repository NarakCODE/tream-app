import MainLayout from '@/components/layout/main-layout';
import Inbox from '@/components/common/inbox/inbox';
import { ApiError } from '@repo/api-client';
import { getQueryClient } from '@repo/query';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { notFound, redirect } from 'next/navigation';
import { activeWorkspaceQueryOptions, currentUserQueryOptions } from '@/features/auth/queries';
import { verificationDestination } from '@/features/auth/redirect';
import {
   notificationListQueryOptions,
   notificationPreferencesQueryOptions,
   unreadCountQueryOptions,
} from '@/features/notifications/queries';
import { resolveWorkspaceForRoute } from '@/features/workspaces/resolver';
import { WorkspaceRouteBoundary } from '@/features/workspaces/workspace-route-boundary';
import { createServerApiClient } from '@/lib/server-api';

export default async function InboxPage({ params }: { params: Promise<{ orgId: string }> }) {
   const { orgId } = await params;
   const api = await createServerApiClient();
   const queryClient = getQueryClient();
   try {
      const user = await queryClient.fetchQuery(currentUserQueryOptions(api));
      if (!user.emailVerified) redirect(verificationDestination(`/${orgId}/inbox`));
      const active = await queryClient.fetchQuery(activeWorkspaceQueryOptions(api)).catch(() => null);
      const workspace = await resolveWorkspaceForRoute(api, queryClient, orgId);
      if (!workspace) notFound();
      // Selection is a command and only happens after the client boundary mounts.
      if (active?.workspaceId === workspace.id) {
         await Promise.all([
            queryClient.prefetchInfiniteQuery(
               notificationListQueryOptions(api, workspace.id, user.id, {
                  status: 'inbox',
                  limit: 25,
               })
            ),
            queryClient.prefetchQuery(
               notificationPreferencesQueryOptions(api, workspace.id, user.id)
            ),
            queryClient.prefetchQuery(unreadCountQueryOptions(api, workspace.id, user.id)),
         ]);
      }
      return (
         <HydrationBoundary state={dehydrate(queryClient)}>
            <WorkspaceRouteBoundary workspaceId={workspace.id} userId={user.id}>
               <MainLayout className="overflow-hidden">
                  <Inbox workspaceId={workspace.id} userId={user.id} />
               </MainLayout>
            </WorkspaceRouteBoundary>
         </HydrationBoundary>
      );
   } catch (error) {
      if (error instanceof ApiError && error.status === 401) redirect('/login');
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) notFound();
      throw error;
   }
}
