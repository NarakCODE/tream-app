import { notFound, redirect } from 'next/navigation';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { ApiError } from '@repo/api-client';
import { getQueryClient } from '@repo/query';
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';
import Members from '@/components/common/members/members';
import { InviteMembersDialog } from '@/components/common/members/invite-members-dialog';
import { activeWorkspaceQueryOptions, currentUserQueryOptions } from '@/features/auth/queries';
import { verificationDestination } from '@/features/auth/redirect';
import { workspaceMembersQueryOptions } from '@/features/workspaces/queries';
import { resolveWorkspaceForRoute } from '@/features/workspaces/resolver';
import { WorkspaceRouteBoundary } from '@/features/workspaces/workspace-route-boundary';
import { createServerApiClient } from '@/lib/server-api';

export default async function MembersSettingsPage({
   params,
}: {
   params: Promise<{ orgId: string }>;
}) {
   const { orgId } = await params;
   const api = await createServerApiClient();
   const queryClient = getQueryClient();

   try {
      const user = await queryClient.fetchQuery(currentUserQueryOptions(api));
      if (!user.emailVerified) redirect(verificationDestination(`/${orgId}/settings/members`));

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
               <MainLayout header={<Header />} headersNumber={1}>
                  <div className="w-full overflow-y-auto h-full">
                     <div className="max-w-4xl mx-auto px-6 py-10 pb-20">
                        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                           <div>
                              <h1 className="text-2xl font-medium">Members</h1>
                              <p className="text-sm text-muted-foreground mt-1">
                                 Manage members and invitations in your workspace.
                              </p>
                           </div>
                           <InviteMembersDialog workspaceId={workspace.id} />
                        </div>
                        <div className="rounded-lg border bg-container overflow-hidden">
                           <Members workspaceId={workspace.id} />
                        </div>
                     </div>
                  </div>
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
