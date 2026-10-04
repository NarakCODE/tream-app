import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@repo/query';
import { redirect } from 'next/navigation';
import { ApiError } from '@repo/api-client';
import { activeWorkspaceQueryOptions } from '@/features/auth/queries';
import {
   teamDetailQueryOptions,
   teamIssuesQueryOptions,
   teamListQueryOptions,
} from '@/features/teams/queries';
import { TeamIssues } from '@/features/teams/team-issues';
import { createServerApiClient } from '@/lib/server-api';
import Link from 'next/link';
import { NavTeams } from '@/components/layout/sidebar/nav-teams';
import { Sidebar, SidebarContent, SidebarHeader, SidebarProvider } from '@/components/ui/sidebar';

export default async function AllIssuesPage({
   params,
}: {
   params: Promise<{ orgId: string; teamId: string }>;
}) {
   const { orgId, teamId } = await params;
   const api = await createServerApiClient(AbortSignal.timeout(10_000));
   const queryClient = getQueryClient();
   let active;
   try {
      active = await queryClient.fetchQuery(activeWorkspaceQueryOptions(api));
   } catch (error) {
      if (error instanceof ApiError && error.status === 401) redirect('/login');
      throw error;
   }
   if (!active) redirect('/workspaces');
   if (active.workspace.slug !== orgId) redirect(`/${active.workspace.slug}/my-issues`);
   await Promise.all([
      queryClient.prefetchQuery(teamDetailQueryOptions(api, active.workspaceId, teamId)),
      queryClient.prefetchInfiniteQuery(teamIssuesQueryOptions(api, active.workspaceId, teamId)),
      queryClient.prefetchInfiniteQuery(teamListQueryOptions(api, active.workspaceId)),
   ]);
   return (
      <HydrationBoundary state={dehydrate(queryClient)}>
         <SidebarProvider>
            <Sidebar collapsible="offcanvas">
               <SidebarHeader>
                  <Link href="/workspaces" className="px-2 py-3 text-sm font-medium">
                     {active.workspace.name}
                  </Link>
               </SidebarHeader>
               <SidebarContent>
                  <NavTeams />
               </SidebarContent>
            </Sidebar>
            <div className="h-svh w-full overflow-auto bg-container lg:rounded-md lg:border">
               <TeamIssues workspaceId={active.workspaceId} teamId={teamId} />
            </div>
         </SidebarProvider>
      </HydrationBoundary>
   );
}
