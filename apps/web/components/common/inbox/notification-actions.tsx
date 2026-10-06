'use client';

import type { Notification } from '@repo/schemas';
import { Archive, ArchiveRestore, Clock, Mail, MailOpen } from 'lucide-react';
import { useChangeNotification, useNotificationPending } from '@/features/notifications/hooks';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function NotificationActions({
   workspaceId,
   userId,
   notification,
}: {
   workspaceId: string;
   userId: string;
   notification: Notification;
}) {
   const mutation = useChangeNotification(workspaceId, userId);
   const pending = useNotificationPending(workspaceId, userId, notification.id);
   const change = (value: Parameters<typeof mutation.mutate>[0]['change']) =>
      mutation.mutate({ notification, change: value });
   const snooze = (days: number) => {
      const date = new Date();
      if (days === 0) {
         const endOfToday = new Date(date);
         endOfToday.setHours(23, 59, 59, 999);
         date.setTime(Math.min(date.getTime() + 3 * 60 * 60 * 1000, endOfToday.getTime()));
      } else {
         date.setDate(date.getDate() + days);
         date.setHours(9, 0, 0, 0);
      }
      change({ type: 'snooze', snoozedUntil: date.toISOString() });
   };
   return (
      <div className="flex flex-wrap items-center gap-1" aria-busy={pending}>
         <Button
            variant="ghost"
            size="xs"
            disabled={pending}
            onClick={() => change({ type: 'read', read: !notification.readAt })}
         >
            {notification.readAt ? (
               <Mail className="size-3.5" />
            ) : (
               <MailOpen className="size-3.5" />
            )}
            {notification.readAt ? 'Mark unread' : 'Mark read'}
         </Button>
         <Button
            variant="ghost"
            size="xs"
            disabled={pending}
            onClick={() => change({ type: 'archive', archived: !notification.archivedAt })}
         >
            {notification.archivedAt ? (
               <ArchiveRestore className="size-3.5" />
            ) : (
               <Archive className="size-3.5" />
            )}
            {notification.archivedAt ? 'Unarchive' : 'Archive'}
         </Button>
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button variant="ghost" size="xs" disabled={pending}>
                  <Clock className="size-3.5" />
                  Snooze
               </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
               <DropdownMenuItem onSelect={() => snooze(0)}>Later today</DropdownMenuItem>
               <DropdownMenuItem onSelect={() => snooze(1)}>Tomorrow at 9 AM</DropdownMenuItem>
               <DropdownMenuItem onSelect={() => snooze(7)}>Next week at 9 AM</DropdownMenuItem>
               {notification.snoozedUntil && (
                  <DropdownMenuItem onSelect={() => change({ type: 'snooze', snoozedUntil: null })}>
                     Unsnooze
                  </DropdownMenuItem>
               )}
            </DropdownMenuContent>
         </DropdownMenu>
         {pending && (
            <span className="text-xs text-muted-foreground" role="status">
               Saving…
            </span>
         )}
      </div>
   );
}
