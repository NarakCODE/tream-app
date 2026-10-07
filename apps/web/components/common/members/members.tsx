'use client';

import { useMemo } from 'react';
import { AlertCircle, ArrowDown, Users } from 'lucide-react';
import type { Membership } from '@repo/schemas';
import { useWorkspaceMembers } from '@/features/workspaces/hooks';
import { useMembersFilterStore } from '@/store/members-filter-store';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import MemberLine from './member-line';

export interface MembersProps {
   workspaceId?: string;
}

export default function Members({ workspaceId }: MembersProps) {
   const { filters, sort, clearFilters } = useMembersFilterStore();
   const membersQuery = useWorkspaceMembers(workspaceId);

   const allMembers = useMemo(() => {
      return membersQuery.data?.pages.flatMap((page) => page.data) ?? [];
   }, [membersQuery.data]);

   const displayed = useMemo(() => {
      let list = allMembers.slice();

      // filter by role (called Status in UI)
      if (filters.role.length > 0) {
         const selectedRoles = new Set(filters.role.map((r) => r.toUpperCase()));
         list = list.filter((m) => {
            const role = m.role.toUpperCase();
            if (selectedRoles.has(role)) return true;
            if (selectedRoles.has('ADMIN') && role === 'OWNER') return true;
            return false;
         });
      }

      // sorting
      const compare = (a: Membership, b: Membership) => {
         const aName = a.user?.name || a.user?.email || '';
         const bName = b.user?.name || b.user?.email || '';
         switch (sort) {
            case 'name-asc':
               return aName.localeCompare(bName);
            case 'name-desc':
               return bName.localeCompare(aName);
            case 'joined-asc':
               return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            case 'joined-desc':
               return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            default:
               return 0;
         }
      };

      return list.sort(compare);
   }, [allMembers, filters.role, sort]);

   return (
      <div className="w-full">
         <div className="bg-container px-6 py-1.5 text-sm flex items-center text-muted-foreground border-b sticky top-0 z-10">
            <div className="flex-1 min-w-0 flex items-center gap-1">
               Name
               <ArrowDown className="size-3" />
            </div>
            <div className="w-[110px] shrink-0">Status</div>
            <div className="hidden lg:block w-[100px] shrink-0">Joined</div>
            <div className="hidden md:block w-[170px] shrink-0">Teams</div>
            <div className="hidden sm:block w-[90px] shrink-0">Last seen</div>
            <div className="w-8 shrink-0" aria-hidden="true" />
         </div>

         {membersQuery.isPending ? (
            <div className="p-4 space-y-3" role="status" aria-label="Loading workspace members">
               {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2">
                     <Skeleton className="size-8 rounded-full shrink-0" />
                     <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-28" />
                     </div>
                     <Skeleton className="h-6 w-16 rounded-md" />
                     <Skeleton className="h-4 w-16 hidden lg:block" />
                     <Skeleton className="size-6 rounded-md shrink-0 ml-auto" />
                  </div>
               ))}
            </div>
         ) : membersQuery.isError ? (
            <div role="alert" className="p-8 text-center text-sm">
               <AlertCircle className="size-8 text-destructive mx-auto mb-2 opacity-80" />
               <p className="font-medium text-foreground">Unable to load workspace members.</p>
               <p className="mt-1 text-xs text-muted-foreground">
                  {membersQuery.error instanceof Error
                     ? membersQuery.error.message
                     : 'An unexpected error occurred while fetching members.'}
               </p>
               <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => void membersQuery.refetch()}
               >
                  Try again
               </Button>
            </div>
         ) : allMembers.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
               <Users className="size-8 mx-auto mb-2 text-muted-foreground/40" />
               <p className="font-medium text-foreground">No members found</p>
               <p className="mt-1 text-xs">Invite team members to collaborate in this workspace.</p>
            </div>
         ) : displayed.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
               <p>No members match the selected filters.</p>
               <Button variant="ghost" size="sm" className="mt-2" onClick={() => clearFilters()}>
                  Clear filters
               </Button>
            </div>
         ) : (
            <>
               <div className="w-full">
                  {displayed.map((membership) => (
                     <MemberLine
                        key={membership.id}
                        membership={membership}
                        workspaceId={workspaceId}
                     />
                  ))}
               </div>

               {membersQuery.hasNextPage && (
                  <div className="p-4 text-center border-t">
                     <Button
                        variant="outline"
                        size="sm"
                        disabled={membersQuery.isFetchingNextPage}
                        onClick={() => void membersQuery.fetchNextPage()}
                     >
                        {membersQuery.isFetchingNextPage ? 'Loading…' : 'Load more members'}
                     </Button>
                  </div>
               )}
            </>
         )}
      </div>
   );
}
