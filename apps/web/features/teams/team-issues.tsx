'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { teamDetailQueryOptions, teamIssuesQueryOptions } from './queries';

export function TeamIssues({ workspaceId, teamId }: { workspaceId: string; teamId: string }) {
   const team = useQuery(teamDetailQueryOptions(api, workspaceId, teamId));
   const query = useInfiniteQuery(teamIssuesQueryOptions(api, workspaceId, teamId));
   const issues = query.data?.pages.flatMap((page) => page.data) ?? [];
   return (
      <>
         <header className="flex h-14 items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <h1 className="text-sm font-medium">{team.data?.name ?? 'Team'} issues</h1>
         </header>
         <main className="p-6">
            {query.isPending || team.isPending ? (
               <p role="status">Loading team issues…</p>
            ) : query.isError || team.isError ? (
               <div role="alert" className="space-y-3">
                  <p>Unable to load this team. Check your connection and workspace access.</p>
                  <Button
                     variant="outline"
                     onClick={() => {
                        void team.refetch();
                        void query.refetch();
                     }}
                  >
                     Try again
                  </Button>
               </div>
            ) : issues.length === 0 ? (
               <div className="mx-auto max-w-md py-16 text-center">
                  <h2 className="text-lg font-medium">Your team is ready</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                     There are no issues in {team.data?.name} yet. Issues created for this team will
                     appear here.
                  </p>
               </div>
            ) : (
               <ul className="divide-y rounded-md border">
                  {issues.map((issue) => (
                     <li key={issue.id} className="flex items-center gap-4 px-4 py-3">
                        <span className="shrink-0 text-xs text-muted-foreground">
                           {issue.identifier}
                        </span>
                        <span className="text-sm">{issue.title}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                           {(issue.priority ?? 'NO_PRIORITY').replaceAll('_', ' ').toLowerCase()}
                        </span>
                     </li>
                  ))}
               </ul>
            )}
            {query.hasNextPage && (
               <Button
                  className="mt-4"
                  variant="outline"
                  disabled={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
               >
                  {query.isFetchingNextPage ? 'Loading…' : 'Load more issues'}
               </Button>
            )}
         </main>
      </>
   );
}
