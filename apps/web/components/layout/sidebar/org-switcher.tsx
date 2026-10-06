'use client';

import { Check, ChevronsUpDown } from 'lucide-react';

import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuGroup,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuPortal,
   DropdownMenuSeparator,
   DropdownMenuShortcut,
   DropdownMenuSub,
   DropdownMenuSubContent,
   DropdownMenuSubTrigger,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { CreateNewIssue } from './create-new-issue';
import { ThemeToggle } from '../theme-toggle';
import Link from 'next/link';
import { useLogoutMutation, useCurrentUser } from '@/features/auth/hooks';
import { useCurrentWorkspace } from '@/features/workspaces/context';
import { InviteMembersDialog } from '@/components/common/members/invite-members-dialog';
import { useWorkspaceList } from '@/features/workspaces';

export function OrgSwitcher() {
   const logout = useLogoutMutation();
   const { workspace } = useCurrentWorkspace();
   const {
      data: workspaceData,
      isLoading,
      isError,
      refetch,
      hasNextPage,
      fetchNextPage,
      isFetchingNextPage,
   } = useWorkspaceList();
   const workspaces = workspaceData?.pages.flatMap((page) => page.data) ?? [];
   const user = useCurrentUser();
   const initials =
      workspace?.name
         .split(/\s+/)
         .map((part) => part[0])
         .join('')
         .slice(0, 2)
         .toUpperCase() || 'C';

   return (
      <SidebarMenu>
         <SidebarMenuItem>
            <DropdownMenu>
               <div className="w-full flex gap-1 items-center pt-2">
                  <DropdownMenuTrigger asChild>
                     <SidebarMenuButton
                        size="lg"
                        className="h-8 p-1 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                     >
                        <div className="flex aspect-square size-6 items-center justify-center rounded bg-orange-500 text-sidebar-primary-foreground">
                           {initials}
                        </div>
                        <div className="grid flex-1 text-left text-sm leading-tight">
                           <span className="truncate font-semibold">
                              {workspace?.name ?? 'Workspace'}
                           </span>
                        </div>
                        <ChevronsUpDown className="ml-auto" />
                     </SidebarMenuButton>
                  </DropdownMenuTrigger>

                  <ThemeToggle />

                  <CreateNewIssue />
               </div>
               <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-60 rounded-lg"
                  side="bottom"
                  align="end"
                  sideOffset={4}
               >
                  <DropdownMenuGroup>
                     <DropdownMenuItem asChild>
                        <Link href={workspace ? `/${workspace.slug}/settings` : '/workspaces'}>
                           Settings
                           <DropdownMenuShortcut>G then S</DropdownMenuShortcut>
                        </Link>
                     </DropdownMenuItem>
                     <InviteMembersDialog
                        trigger={
                           <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              Invite and manage members
                           </DropdownMenuItem>
                        }
                     />
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                     <DropdownMenuItem>Download desktop app</DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                     <DropdownMenuSubTrigger>Workspace</DropdownMenuSubTrigger>
                     <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                           <DropdownMenuLabel>{user.data?.email}</DropdownMenuLabel>
                           <DropdownMenuSeparator />
                           {isLoading && workspaces.length === 0 && (
                              <DropdownMenuItem disabled>Loading workspaces…</DropdownMenuItem>
                           )}
                           {isError && workspaces.length === 0 && (
                              <>
                                 <DropdownMenuItem disabled>
                                    Unable to load workspaces
                                 </DropdownMenuItem>
                                 <DropdownMenuItem
                                    onSelect={(event) => {
                                       event.preventDefault();
                                       void refetch();
                                    }}
                                 >
                                    Try again
                                 </DropdownMenuItem>
                              </>
                           )}
                           {!isLoading && !isError && workspaces.length === 0 && (
                              <DropdownMenuItem disabled>No workspaces yet</DropdownMenuItem>
                           )}
                           {workspaces.map((item) => {
                              const isCurrentWorkspace = item.id === workspace?.id;

                              return (
                                 <DropdownMenuItem key={item.id} asChild>
                                    <Link
                                       href={`/${encodeURIComponent(item.slug)}`}
                                       aria-current={isCurrentWorkspace ? 'true' : undefined}
                                    >
                                       <div className="flex aspect-square size-6 shrink-0 items-center justify-center rounded bg-orange-500 text-sidebar-primary-foreground">
                                          {item.name
                                             .split(/\s+/)
                                             .map((part) => part[0])
                                             .join('')
                                             .slice(0, 2)
                                             .toUpperCase()}
                                       </div>
                                       <span className="min-w-0 truncate">{item.name}</span>
                                       {isCurrentWorkspace && (
                                          <Check
                                             aria-hidden="true"
                                             className="ml-auto size-4 text-muted-foreground"
                                          />
                                       )}
                                    </Link>
                                 </DropdownMenuItem>
                              );
                           })}
                           {hasNextPage && (
                              <DropdownMenuItem
                                 disabled={isFetchingNextPage}
                                 onSelect={(event) => {
                                    event.preventDefault();
                                    void fetchNextPage();
                                 }}
                              >
                                 {isFetchingNextPage ? 'Loading more…' : 'Load more workspaces'}
                              </DropdownMenuItem>
                           )}
                           <DropdownMenuSeparator />
                           <DropdownMenuItem asChild>
                              <Link href="/workspaces">Create workspace</Link>
                           </DropdownMenuItem>
                        </DropdownMenuSubContent>
                     </DropdownMenuPortal>
                  </DropdownMenuSub>
                  <DropdownMenuItem disabled={logout.isPending} onSelect={() => logout.mutate()}>
                     Log out
                     <DropdownMenuShortcut>⌥⇧Q</DropdownMenuShortcut>
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
         </SidebarMenuItem>
      </SidebarMenu>
   );
}
