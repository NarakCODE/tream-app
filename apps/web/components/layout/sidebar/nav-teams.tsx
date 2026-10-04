'use client';

import { SidebarNavLink } from './sidebar-nav-link';
import { Users } from 'lucide-react';
import { useActiveWorkspace } from '@/features/auth/hooks';
import { useTeamList } from '@/features/teams/hooks';
import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';

export function NavTeams() {
   const active = useActiveWorkspace();
   const workspace = active.data?.workspace;
   const teams = useTeamList(workspace?.id ?? '');
   return (
      <SidebarGroup>
         <SidebarGroupLabel>Your teams</SidebarGroupLabel>
         <SidebarMenu>
            {teams.isPending && workspace && (
               <li className="px-2 text-xs text-muted-foreground" role="status">
                  Loading teams…
               </li>
            )}
            {teams.isError && (
               <li className="px-2 text-xs">
                  <button onClick={() => void teams.refetch()}>Unable to load teams. Retry</button>
               </li>
            )}
            {teams.data?.pages
               .flatMap((page) => page.data)
               .map((team) => (
                  <SidebarMenuItem key={team.id}>
                     <SidebarNavLink
                        href={`/${workspace?.slug}/team/${team.id}/all`}
                        matchHrefs={[
                           `/${workspace?.slug}/team/${team.id}`,
                           `/${workspace?.slug}/settings/teams/${team.id}`,
                        ]}
                     >
                        <Users />
                        <span>{team.name}</span>
                     </SidebarNavLink>
                  </SidebarMenuItem>
               ))}
            {teams.hasNextPage && (
               <SidebarMenuItem>
                  <SidebarMenuButton
                     disabled={teams.isFetchingNextPage}
                     onClick={() => void teams.fetchNextPage()}
                  >
                     Load more teams
                  </SidebarMenuButton>
               </SidebarMenuItem>
            )}
         </SidebarMenu>
      </SidebarGroup>
   );
}
