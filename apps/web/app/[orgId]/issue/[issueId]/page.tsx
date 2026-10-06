import { notFound, redirect } from 'next/navigation';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { ApiError } from '@repo/api-client';
import { getQueryClient } from '@repo/query';
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/issue/header';
import IssueDetails from '@/components/common/issues/details/issue-details';
import { currentUserQueryOptions } from '@/features/auth/queries';
import { verificationDestination } from '@/features/auth/redirect';
import {
   issueDetailQueryOptions,
   issueLookupQueryOptions,
   issueRelationsQueryOptions,
} from '@/features/issues/queries';
import { resolveWorkspaceForRoute } from '@/features/workspaces/resolver';
import { WorkspaceRouteBoundary } from '@/features/workspaces/workspace-route-boundary';
import { createServerApiClient } from '@/lib/server-api';

export default async function IssueDetailPage({
   params,
}: {
   params: Promise<{ orgId: string; issueId: string }>;
}) {
   const { orgId, issueId } = await params;
   const api = await createServerApiClient();
   const queryClient = getQueryClient();

   try {
      const user = await queryClient.fetchQuery(currentUserQueryOptions(api));
      if (!user.emailVerified) redirect(verificationDestination(`/${orgId}/issue/${issueId}`));

      const workspace = await resolveWorkspaceForRoute(api, queryClient, orgId);
      if (!workspace) notFound();

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
         issueId
      );

      let resolvedIssueId = isUuid ? issueId : '';
      if (isUuid) {
         try {
            const issue = await queryClient.fetchQuery(
               issueDetailQueryOptions(api, workspace.id, issueId)
            );
            resolvedIssueId = issue.id;
         } catch {
            // Fall back to client handling
         }
      } else {
         try {
            const issue = await queryClient.fetchQuery(
               issueLookupQueryOptions(api, workspace.id, issueId)
            );
            resolvedIssueId = issue.id;
         } catch {
            // Fall back to client handling
         }
      }

      if (resolvedIssueId) {
         try {
            await queryClient.prefetchQuery(
               issueRelationsQueryOptions(api, workspace.id, resolvedIssueId)
            );
         } catch {
            // Fall back to client handling
         }
      }

      return (
         <HydrationBoundary state={dehydrate(queryClient)}>
            <WorkspaceRouteBoundary workspaceId={workspace.id} userId={user.id}>
               <MainLayout header={<Header />} headersNumber={1}>
                  <IssueDetails workspaceId={workspace.id} initialIssueId={issueId} />
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
