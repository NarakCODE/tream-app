'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Bell, ArrowRight, ExternalLink, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveWorkspace, useCurrentUser } from '@/features/auth/hooks';
import {
   useUnreadCount,
   useNotificationList,
   useNotificationPreferences,
   useUpdateNotificationPreferences,
} from '@/features/notifications/hooks';
import { cn } from '@/lib/utils';

export default function Notifications() {
   const [open, setOpen] = useState(false);
   const [showSettings, setShowSettings] = useState(false);
   const { orgId } = useParams<{ orgId?: string }>();
   const active = useActiveWorkspace();
   const user = useCurrentUser();
   const workspaceId = active.data?.workspaceId ?? '';
   const userId = user.data?.id ?? '';
   const effectiveSlug = orgId || active.data?.workspace.slug || '';

   const unreadQuery = useUnreadCount(workspaceId, userId);
   const preferences = useNotificationPreferences(workspaceId, userId);
   const updatePreferences = useUpdateNotificationPreferences(workspaceId, userId);
   const listQuery = useNotificationList(workspaceId, userId, {
      status: 'inbox',
      limit: 5,
   });

   const unreadCount = unreadQuery.data?.unreadCount ?? 0;
   const items = listQuery.data?.pages.flatMap((page) => page.items) ?? [];
   const disabled = preferences.data?.inAppEnabled === false;
   const inboxUrl = effectiveSlug ? `/${effectiveSlug}/inbox` : '/workspaces';

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button
               variant="ghost"
               size="icon"
               className="relative h-8 w-8"
               aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
            >
               <Bell className="h-4 w-4" />
               {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                     <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                  </span>
               )}
            </Button>
         </PopoverTrigger>
         <PopoverContent className="w-80 p-0" align="end">
            <div className="flex items-center justify-between border-b px-4 py-3">
               <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Notifications</h3>
                  {unreadCount > 0 && (
                     <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                        {unreadCount} unread
                     </span>
                  )}
               </div>
               <div className="flex items-center gap-1">
                  <Button
                     variant="ghost"
                     size="icon"
                     className={cn('size-7', showSettings && 'bg-accent')}
                     aria-label="Notification channels"
                     onClick={() => setShowSettings(!showSettings)}
                  >
                     <Settings2 className="size-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="xs" asChild>
                     <Link
                        href={inboxUrl}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                     >
                        <span>Inbox</span>
                        <ArrowRight className="size-3" />
                     </Link>
                  </Button>
               </div>
            </div>

            {showSettings ? (
               <div className="space-y-3 p-4">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                     Channels
                  </h4>
                  {preferences.isPending ? (
                     <p className="text-xs text-muted-foreground">Loading preferences…</p>
                  ) : preferences.data ? (
                     <div className="space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                           <Label htmlFor="hdr-in-app" className="cursor-pointer text-xs">
                              In-app notifications
                           </Label>
                           <Switch
                              id="hdr-in-app"
                              checked={preferences.data.inAppEnabled}
                              disabled={updatePreferences.isPending}
                              onCheckedChange={(inAppEnabled) =>
                                 updatePreferences.mutate({
                                    preferences: preferences.data!,
                                    patch: { inAppEnabled },
                                 })
                              }
                           />
                        </div>
                        <div className="flex items-center justify-between">
                           <Label htmlFor="hdr-email" className="cursor-pointer text-xs">
                              Email notifications
                           </Label>
                           <Switch
                              id="hdr-email"
                              checked={preferences.data.emailEnabled}
                              disabled={updatePreferences.isPending}
                              onCheckedChange={(emailEnabled) =>
                                 updatePreferences.mutate({
                                    preferences: preferences.data!,
                                    patch: { emailEnabled },
                                 })
                              }
                           />
                        </div>
                     </div>
                  ) : (
                     <p className="text-xs text-muted-foreground">Unable to load preferences.</p>
                  )}
                  <Separator />
                  <Button
                     variant="outline"
                     size="xs"
                     className="w-full text-xs"
                     onClick={() => setShowSettings(false)}
                  >
                     Back to notifications
                  </Button>
               </div>
            ) : disabled ? (
               <div className="p-6 text-center text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">In-app notifications are paused</p>
                  <p className="mt-1">Turn them on in preferences to receive updates.</p>
                  <Button
                     size="xs"
                     variant="outline"
                     className="mt-3"
                     disabled={updatePreferences.isPending}
                     onClick={() =>
                        preferences.data &&
                        updatePreferences.mutate({
                           preferences: preferences.data,
                           patch: { inAppEnabled: true },
                        })
                     }
                  >
                     {updatePreferences.isPending ? 'Enabling…' : 'Enable notifications'}
                  </Button>
               </div>
            ) : listQuery.isPending ? (
               <div className="space-y-3 p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                     <div key={i} className="flex gap-2.5">
                        <Skeleton className="size-7 rounded-full shrink-0" />
                        <div className="flex-1 space-y-1.5">
                           <Skeleton className="h-3.5 w-3/4" />
                           <Skeleton className="h-3 w-1/2" />
                        </div>
                     </div>
                  ))}
               </div>
            ) : items.length === 0 ? (
               <div className="py-8 px-4 text-center text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">All caught up</p>
                  <p className="mt-1">No unread notifications in your inbox.</p>
               </div>
            ) : (
               <ul className="divide-y divide-border/40 max-h-72 overflow-y-auto">
                  {items.map((item) => (
                     <li key={item.id}>
                        <Link
                           href={inboxUrl}
                           onClick={() => setOpen(false)}
                           className="flex items-start gap-2.5 px-4 py-2.5 text-left text-xs transition-colors hover:bg-accent/40"
                        >
                           <span
                              className={cn(
                                 'mt-1 size-2 rounded-full shrink-0',
                                 !item.readAt ? 'bg-blue-500' : 'bg-transparent'
                              )}
                              aria-hidden="true"
                           />
                           <div className="flex-1 min-w-0">
                              <p className={cn('truncate', !item.readAt ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                                 {item.kind.toLowerCase().replaceAll('_', ' ')} update
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                 {new Date(item.createdAt).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                 })}
                              </p>
                           </div>
                           <ExternalLink className="size-3 text-muted-foreground shrink-0 mt-0.5" />
                        </Link>
                     </li>
                  ))}
               </ul>
            )}

            <div className="border-t p-2">
               <Button variant="ghost" size="xs" className="w-full justify-center text-xs" asChild>
                  <Link href={inboxUrl} onClick={() => setOpen(false)}>
                     Go to full inbox
                  </Link>
               </Button>
            </div>
         </PopoverContent>
      </Popover>
   );
}
