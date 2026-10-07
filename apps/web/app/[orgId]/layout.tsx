import { notFound, redirect } from 'next/navigation';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@repo/query';
import { ApiError } from '@repo/api-client';
import { createServerApiClient } from '@/lib/server-api';
import { bootstrapQueryOptions, seedBootstrap } from '@/features/bootstrap/queries';
import { verificationDestination } from '@/features/auth/redirect';
import { AppBootstrap } from '@/features/bootstrap/app-bootstrap';
import { WorkspaceProvider } from '@/features/workspaces/context';
import { resolveWorkspaceForRoute } from '@/features/workspaces/resolver';
import { WorkspaceRouteBoundary } from '@/features/workspaces/workspace-route-boundary';

export default async function WorkspaceLayout({
   children,
   params,
}: {
   children: React.ReactNode;
   params: Promise<{ orgId: string }>;
}) {
   const { orgId } = await params;
   const controller = new AbortController();
   const timeout = setTimeout(() => controller.abort(), 10_000);
   const api = await createServerApiClient(controller.signal);
   const queryClient = getQueryClient();

   let user;
   let workspace;
   try {
      const bootstrap = await queryClient.fetchQuery(bootstrapQueryOptions(api));
      seedBootstrap(queryClient, bootstrap);
      user = bootstrap.user;
      if (!user.emailVerified) {
         redirect(verificationDestination(`/${encodeURIComponent(orgId)}`));
      }

      workspace = await resolveWorkspaceForRoute(api, queryClient, orgId);
      if (!workspace) {
         notFound();
      }
      // Only gate the selected workspace; a valid direct route may target another membership.
      if (
         bootstrap.activeWorkspace?.workspaceId === workspace.id &&
         bootstrap.onboarding.nextStep !== 'DONE'
      )
         redirect('/onboarding');
   } catch (error) {
      if (error instanceof ApiError && error.status === 401) redirect('/login');
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) notFound();
      throw error;
   } finally {
      clearTimeout(timeout);
   }

   return (
      <HydrationBoundary state={dehydrate(queryClient)}>
         <AppBootstrap remainingMs={1} requireOnboardingWorkspaceId={workspace.id}>
            <WorkspaceProvider workspace={workspace} workspaceId={workspace.id} orgId={orgId}>
               <WorkspaceRouteBoundary workspaceId={workspace.id} userId={user.id}>
                  {children}
               </WorkspaceRouteBoundary>
            </WorkspaceProvider>
         </AppBootstrap>
      </HydrationBoundary>
   );
}
