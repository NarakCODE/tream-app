'use client';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useWorkspaceMembers } from '@/features/workspaces/hooks';
import { Plus } from 'lucide-react';

import { InviteMembersDialog } from '@/components/common/members/invite-members-dialog';

export default function HeaderNav() {
   const membersQuery = useWorkspaceMembers();
   const totalCount =
      membersQuery.data?.pages[0]?.meta?.total ??
      membersQuery.data?.pages.flatMap((p) => p.data).length;

   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2">
            <SidebarTrigger className="" />
            <div className="flex items-center gap-1">
               <span className="text-sm font-medium">Members</span>
               {typeof totalCount === 'number' && (
                  <span className="text-xs bg-accent rounded-md px-1.5 py-1">{totalCount}</span>
               )}
            </div>
         </div>
         <div className="flex items-center gap-2">
            <InviteMembersDialog
               trigger={
                  <Button className="relative gap-1.5" size="xs" variant="secondary">
                     <Plus className="size-4" />
                     Invite
                  </Button>
               }
            />
         </div>
      </div>
   );
}
