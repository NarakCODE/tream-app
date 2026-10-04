'use client';

import { SidebarNavLink } from './sidebar-nav-link';

import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { accountItems } from '@/mock-data/side-bar-nav';

export function NavAccount() {
   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarGroupLabel>Account</SidebarGroupLabel>
         <SidebarMenu>
            {accountItems.map((item) => (
               <SidebarMenuItem key={item.name}>
                  <SidebarNavLink href={item.url}>
                     <item.icon className="size-4" />
                     <span>{item.name}</span>
                  </SidebarNavLink>
               </SidebarMenuItem>
            ))}
         </SidebarMenu>
      </SidebarGroup>
   );
}
