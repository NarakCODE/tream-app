'use client';

import {
   Box,
   Compass,
   ContactRound,
   Layers,
   LayoutList,
   LucideIcon,
   MoreHorizontal,
   UserRound,
} from 'lucide-react';

import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
   isSidebarItemVisible,
   resolveOrder,
   SidebarItemKey,
   useSidebarPrefsStore,
} from '@/store/sidebar-prefs-store';
import { SidebarNavLink } from './sidebar-nav-link';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { isSidebarPathActive } from './sidebar-active';
import { useEffect, useState } from 'react';
import { CustomizeSidebarDialog } from './customize-sidebar-dialog';

interface WorkspaceNavItem {
   key: SidebarItemKey;
   name: string;
   icon: LucideIcon;
   /** Path under /{orgId}. */
   url: string;
   detailUrl?: string;
}

const WORKSPACE_NAV: WorkspaceNavItem[] = [
   {
      key: 'initiatives',
      name: 'Initiatives',
      icon: Compass,
      url: '/initiatives',
      detailUrl: '/initiative',
   },
   { key: 'projects', name: 'Projects', icon: Box, url: '/projects', detailUrl: '/project' },
   { key: 'views', name: 'Views', icon: Layers, url: '/views', detailUrl: '/view' },
   { key: 'teams', name: 'Teams', icon: ContactRound, url: '/teams' },
   { key: 'members', name: 'Members', icon: UserRound, url: '/members', detailUrl: '/profiles' },
];

export function NavWorkspace() {
   const { orgId } = useParams<{ orgId: string }>();
   const pathname = usePathname();
   const isItemActive = (item: WorkspaceNavItem) =>
      isSidebarPathActive(pathname, `/${orgId}${item.url}`) ||
      Boolean(item.detailUrl && isSidebarPathActive(pathname, `/${orgId}${item.detailUrl}`));
   const { visibility, order } = useSidebarPrefsStore();
   const [customizeOpen, setCustomizeOpen] = useState(false);
   const [mounted, setMounted] = useState(false);
   useEffect(() => setMounted(true), []);

   const orderedNav = mounted
      ? resolveOrder(
           order.workspace,
           WORKSPACE_NAV.map((item) => item.key)
        )
           .map((key) => WORKSPACE_NAV.find((item) => item.key === key))
           .filter((item): item is WorkspaceNavItem => Boolean(item))
      : WORKSPACE_NAV;

   const items = orderedNav.filter((item) =>
      mounted ? isSidebarItemVisible(visibility[item.key], 0) : true
   );
   const hidden = mounted
      ? orderedNav.filter((item) => !isSidebarItemVisible(visibility[item.key], 0))
      : [];

   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarGroupLabel>Workspace</SidebarGroupLabel>
         <SidebarMenu>
            {items.map((item) => (
               <SidebarMenuItem key={item.key}>
                  <SidebarNavLink
                     href={`/${orgId}${item.url}`}
                     matchHrefs={[
                        `/${orgId}${item.url}`,
                        ...(item.detailUrl ? [`/${orgId}${item.detailUrl}`] : []),
                     ]}
                  >
                     <item.icon />
                     <span>{item.name}</span>
                  </SidebarNavLink>
               </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <SidebarMenuButton asChild isActive={hidden.some(isItemActive)}>
                        <span>
                           <MoreHorizontal />
                           <span>More</span>
                        </span>
                     </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48 rounded-lg" side="bottom" align="start">
                     {hidden.map((item) => (
                        <DropdownMenuItem
                           key={item.key}
                           asChild
                           className={
                              isItemActive(item) ? 'bg-accent text-accent-foreground' : undefined
                           }
                        >
                           <Link
                              href={`/${orgId}${item.url}`}
                              aria-current={isItemActive(item) ? 'page' : undefined}
                           >
                              <item.icon className="text-muted-foreground" />
                              <span>{item.name}</span>
                           </Link>
                        </DropdownMenuItem>
                     ))}
                     {hidden.length > 0 && <DropdownMenuSeparator />}
                     <DropdownMenuItem onClick={() => setCustomizeOpen(true)}>
                        <LayoutList className="text-muted-foreground" />
                        <span>Customize sidebar</span>
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            </SidebarMenuItem>
         </SidebarMenu>
         <CustomizeSidebarDialog open={customizeOpen} onOpenChange={setCustomizeOpen} />
      </SidebarGroup>
   );
}
