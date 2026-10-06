import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { IssueItem, IssueListResponse, IssueRelation } from '@repo/schemas';
import { issueKeys, type IssueListFilters } from './queries';

export function prependIssueToQueryCache(
   client: QueryClient,
   workspaceId: string,
   newIssue: IssueItem
) {
   client.setQueriesData<InfiniteData<IssueListResponse>>(
      { queryKey: issueKeys.lists(workspaceId) },
      (current) => {
         if (!current || current.pages.length === 0) return current;

         const firstPage = current.pages[0];
         if (!firstPage) return current;

         // Check if issue is already present to prevent duplicate prepends
         if (firstPage.data.some((item) => item.id === newIssue.id)) return current;

         const updatedPages = [
            {
               ...firstPage,
               data: [newIssue, ...firstPage.data],
               meta: {
                  ...firstPage.meta,
                  total: firstPage.meta.total + 1,
               },
            },
            ...current.pages.slice(1),
         ];

         return {
            ...current,
            pages: updatedPages,
         };
      }
   );

   client.setQueryData(issueKeys.detail(workspaceId, newIssue.id), newIssue);
   if (newIssue.identifier) {
      client.setQueryData(issueKeys.lookup(workspaceId, newIssue.identifier), newIssue);
   }
}

export function patchIssueInQueryCache(
   client: QueryClient,
   workspaceId: string,
   updated: IssueItem
) {
   client.setQueriesData<InfiniteData<IssueListResponse>>(
      { queryKey: issueKeys.lists(workspaceId) },
      (current) => {
         if (!current) return current;

         return {
            ...current,
            pages: current.pages.map((page) => ({
               ...page,
               data: page.data.map((item) =>
                  item.id === updated.id ? { ...item, ...updated } : item
               ),
            })),
         };
      }
   );

   // Also update individual issue detail cache if present
   client.setQueryData<IssueItem>(issueKeys.detail(workspaceId, updated.id), (current) =>
      current ? { ...current, ...updated } : updated
   );

   if (updated.identifier) {
      client.setQueryData(issueKeys.lookup(workspaceId, updated.identifier), (current: unknown) =>
         current ? { ...(current as object), ...updated } : updated
      );
   }
}

export function removeIssueFromQueryCache(
   client: QueryClient,
   workspaceId: string,
   issueId: string
) {
   client.setQueriesData<InfiniteData<IssueListResponse>>(
      { queryKey: issueKeys.lists(workspaceId) },
      (current) => {
         if (!current) return current;

         let removedCount = 0;
         const newPages = current.pages.map((page) => {
            const initialLength = page.data.length;
            const filtered = page.data.filter((item) => item.id !== issueId);
            if (filtered.length < initialLength) {
               removedCount += initialLength - filtered.length;
            }
            return {
               ...page,
               data: filtered,
               meta: {
                  ...page.meta,
                  total: Math.max(0, page.meta.total - removedCount),
               },
            };
         });

         return {
            ...current,
            pages: newPages,
         };
      }
   );

   client.removeQueries({ queryKey: issueKeys.detail(workspaceId, issueId) });
}

export function patchIssueRelationsInQueryCache(
   client: QueryClient,
   workspaceId: string,
   issueId: string,
   updater: (current: IssueRelation[]) => IssueRelation[]
) {
   client.setQueryData<IssueRelation[]>(issueKeys.relations(workspaceId, issueId), (current = []) =>
      updater(current)
   );
}

export function invalidateIssueLists(client: QueryClient, workspaceId: string) {
   return client.invalidateQueries({
      queryKey: issueKeys.lists(workspaceId),
   });
}
