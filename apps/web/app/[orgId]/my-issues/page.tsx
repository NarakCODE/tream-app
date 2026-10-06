import { notFound, redirect } from 'next/navigation';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { ApiError } from '@repo/api-client';
import { getQueryClient } from '@repo/query';
import type { IssueLifecycle, WorkPriority } from '@repo/schemas';
import MainLayout from '@/components/layout/main-layout';
import { activeWorkspaceQueryOptions, currentUserQueryOptions } from '@/features/auth/queries';
import { verificationDestination } from '@/features/auth/redirect';
import { MyIssuesList } from '@/features/issues/my-issues-list';
import { issueListQueryOptions } from '@/features/issues/queries';
import {
   ISSUE_LIFECYCLES,
   MY_ISSUES_TABS,
   type MyIssuesTab,
   WORK_PRIORITIES,
} from '@/features/issues/constants';
import { resolveWorkspaceForRoute } from '@/features/workspaces/resolver';
import { WorkspaceRouteBoundary } from '@/features/workspaces/workspace-route-boundary';
import { createServerApiClient } from '@/lib/server-api';

export default async function MyIssuesPage({
   params,
   searchParams,
}: {
   params: Promise<{ orgId: string }>;
   searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
   const { orgId } = await params;
   const sp = await searchParams;
   const api = await createServerApiClient();
   const queryClient = getQueryClient();

   // Parse server-side search params for prefetching the exact server state
   const rawTab = typeof sp.tab === 'string' ? sp.tab : undefined;
   const tab: MyIssuesTab =
      rawTab && (MY_ISSUES_TABS as readonly string[]).includes(rawTab)
         ? (rawTab as MyIssuesTab)
         : 'all';

   const rawLifecycle = typeof sp.lifecycle === 'string' ? sp.lifecycle : undefined;
   const lifecycle: IssueLifecycle | undefined =
      rawLifecycle && (ISSUE_LIFECYCLES as readonly string[]).includes(rawLifecycle)
         ? (rawLifecycle as IssueLifecycle)
         : undefined;

   const rawPriority = typeof sp.priority === 'string' ? sp.priority : undefined;
   const priority: WorkPriority | undefined =
      rawPriority && (WORK_PRIORITIES as readonly string[]).includes(rawPriority)
         ? (rawPriority as WorkPriority)
         : undefined;

   try {
      const user = await queryClient.fetchQuery(currentUserQueryOptions(api));
      if (!user.emailVerified) redirect(verificationDestination(`/${orgId}/my-issues`));

      const active = await queryClient.fetchQuery(activeWorkspaceQueryOptions(api)).catch(() => null);
      const workspace = await resolveWorkspaceForRoute(api, queryClient, orgId);
      if (!workspace) notFound();

      const memberId = active?.membership.id;

      const initialFilters = {
         limit: 50,
         ...(lifecycle ? { lifecycle } : {}),
         ...(priority ? { priority } : {}),
         ...(tab === 'assigned' && memberId ? { assigneeId: memberId } : {}),
         ...(tab === 'created' && memberId ? { createdById: memberId } : {}),
      };

      if (active?.workspaceId === workspace.id) {
         await queryClient.prefetchInfiniteQuery(
            issueListQueryOptions(api, workspace.id, initialFilters)
         );
      }

      return (
         <HydrationBoundary state={dehydrate(queryClient)}>
            <WorkspaceRouteBoundary workspaceId={workspace.id} userId={user.id}>
               <MainLayout className="overflow-hidden">
                  <MyIssuesList
                     workspaceId={workspace.id}
                     currentMemberId={memberId}
                     initialTab={tab}
                     initialFilters={initialFilters}
                  />
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
