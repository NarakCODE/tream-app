'use client';

import { SidebarNavLink } from './sidebar-nav-link';

import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { featuresItems } from '@/mock-data/side-bar-nav';

export function NavFeatures() {
   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarGroupLabel>Features</SidebarGroupLabel>
         <SidebarMenu>
            {featuresItems.map((item) => (
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
