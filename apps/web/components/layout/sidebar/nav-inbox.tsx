'use client';

import { useActiveWorkspace } from '@/features/auth/hooks';

import {
   SidebarGroup,
   SidebarMenu,
   SidebarMenuBadge,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { forYouReviews } from '@/mock-data/reviews';
import { inboxItems } from '@/mock-data/side-bar-nav';
import { useNotificationsStore } from '@/store/notifications-store';
import {
   isSidebarItemVisible,
   resolveOrder,
   SidebarItemKey,
   useSidebarPrefsStore,
} from '@/store/sidebar-prefs-store';
import { SidebarNavLink } from './sidebar-nav-link';
import { useEffect, useState } from 'react';

const ITEM_KEYS: Record<string, SidebarItemKey> = {
   'Inbox': 'inbox',
   'Reviews': 'reviews',
   'My issues': 'my-issues',
};

export function NavInbox() {
   const active = useActiveWorkspace();
   const slug = active.data?.workspace.slug;
   const { visibility, badgeStyle, order } = useSidebarPrefsStore();
   const { getUnreadCount } = useNotificationsStore();
   const [mounted, setMounted] = useState(false);
   useEffect(() => setMounted(true), []);

   const unread = mounted ? getUnreadCount() : 0;

   const orderedItems = mounted
      ? resolveOrder(order.personal, inboxItems.map((item) => ITEM_KEYS[item.name]).filter(Boolean))
           .map((key) => inboxItems.find((item) => ITEM_KEYS[item.name] === key))
           .filter((item): item is (typeof inboxItems)[number] => Boolean(item))
      : inboxItems;

   const items = orderedItems.filter((item) => {
      if (!mounted) return true;
      const key = ITEM_KEYS[item.name];
      if (!key) return true;
      const badge = key === 'inbox' ? unread : key === 'reviews' ? forYouReviews.length : 0;
      return isSidebarItemVisible(visibility[key], badge);
   });

   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarMenu>
            {items.map((item) => (
               <SidebarMenuItem key={item.name}>
                  <SidebarNavLink
                     href={slug ? item.url.replace('/lndev-ui/', `/${slug}/`) : '/workspaces'}
                     matchHrefs={
                        slug
                           ? [
                                item.url.replace('/lndev-ui/', `/${slug}/`),
                                ...(item.name === 'Reviews' ? [`/${slug}/review`] : []),
                             ]
                           : ['/workspaces']
                     }
                  >
                     <item.icon />
                     <span>{item.name}</span>
                  </SidebarNavLink>
                  {mounted && item.name === 'Inbox' && unread > 0 && (
                     <SidebarMenuBadge className="text-muted-foreground">
                        {badgeStyle === 'count' ? (
                           unread > 99 ? (
                              '99+'
                           ) : (
                              unread
                           )
                        ) : (
                           <span className="size-1.5 rounded-full bg-muted-foreground inline-block" />
                        )}
                     </SidebarMenuBadge>
                  )}
               </SidebarMenuItem>
            ))}
         </SidebarMenu>
      </SidebarGroup>
   );
}
