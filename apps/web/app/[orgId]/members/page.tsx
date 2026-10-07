import { notFound, redirect } from 'next/navigation';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { ApiError } from '@repo/api-client';
import { getQueryClient } from '@repo/query';
import Members from '@/components/common/members/members';
import Header from '@/components/layout/headers/members/header';
import MainLayout from '@/components/layout/main-layout';
import { activeWorkspaceQueryOptions, currentUserQueryOptions } from '@/features/auth/queries';
import { verificationDestination } from '@/features/auth/redirect';
import { workspaceMembersQueryOptions } from '@/features/workspaces/queries';
import { resolveWorkspaceForRoute } from '@/features/workspaces/resolver';
import { WorkspaceRouteBoundary } from '@/features/workspaces/workspace-route-boundary';
import { createServerApiClient } from '@/lib/server-api';

export default async function MembersPage({ params }: { params: Promise<{ orgId: string }> }) {
   const { orgId } = await params;
   const api = await createServerApiClient();
   const queryClient = getQueryClient();

   try {
      const user = await queryClient.fetchQuery(currentUserQueryOptions(api));
      if (!user.emailVerified) redirect(verificationDestination(`/${orgId}/members`));

      const active = await queryClient.fetchQuery(activeWorkspaceQueryOptions(api)).catch(() => null);
      const workspace = await resolveWorkspaceForRoute(api, queryClient, orgId);
      if (!workspace) notFound();

      if (active?.workspaceId === workspace.id) {
         await queryClient.prefetchInfiniteQuery(
            workspaceMembersQueryOptions(api, workspace.id, 50)
         );
      }

      return (
         <HydrationBoundary state={dehydrate(queryClient)}>
            <WorkspaceRouteBoundary workspaceId={workspace.id} userId={user.id}>
               <MainLayout header={<Header />}>
                  <Members workspaceId={workspace.id} />
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
