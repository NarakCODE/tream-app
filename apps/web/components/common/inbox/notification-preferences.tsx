'use client';
import { Settings2 } from 'lucide-react';
import {
   useNotificationPreferences,
   useUpdateNotificationPreferences,
} from '@/features/notifications/hooks';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface NotificationPreferencesProps {
   workspaceId: string;
   userId: string;
   unreadOnly?: boolean;
   onUnreadOnlyChange?: (checked: boolean) => void;
}

export function NotificationPreferences({
   workspaceId,
   userId,
   unreadOnly,
   onUnreadOnlyChange,
}: NotificationPreferencesProps) {
   const query = useNotificationPreferences(workspaceId, userId);
   const mutation = useUpdateNotificationPreferences(workspaceId, userId);
   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button variant="ghost" size="xs" aria-label="Notification preferences">
               <Settings2 className="size-4" />
            </Button>
         </PopoverTrigger>
         <PopoverContent align="end" className="space-y-4">
            <h3 className="text-sm font-medium">Notification preferences</h3>
            {onUnreadOnlyChange !== undefined && (
               <>
                  <div className="flex items-center justify-between gap-4">
                     <Label htmlFor="notifications-unread-filter">Unread only</Label>
                     <Switch
                        id="notifications-unread-filter"
                        checked={unreadOnly ?? false}
                        onCheckedChange={onUnreadOnlyChange}
                     />
                  </div>
                  <Separator />
               </>
            )}
            {query.isPending ? (
               <p className="text-sm text-muted-foreground" role="status">
                  Loading preferences…
               </p>
            ) : query.isError ? (
               <div role="alert">
                  <p className="text-sm">Unable to load preferences.</p>
                  <Button variant="ghost" size="xs" onClick={() => void query.refetch()}>
                     Try again
                  </Button>
               </div>
            ) : (
               query.data && (
                  <>
                     <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="notifications-in-app">In-app notifications</Label>
                        <Switch
                           id="notifications-in-app"
                           checked={query.data.inAppEnabled}
                           disabled={mutation.isPending}
                           onCheckedChange={(inAppEnabled) =>
                              mutation.mutate({ preferences: query.data!, patch: { inAppEnabled } })
                           }
                        />
                     </div>
                     <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="notifications-email">Email notifications</Label>
                        <Switch
                           id="notifications-email"
                           checked={query.data.emailEnabled}
                           disabled={mutation.isPending}
                           onCheckedChange={(emailEnabled) =>
                              mutation.mutate({ preferences: query.data!, patch: { emailEnabled } })
                           }
                        />
                     </div>
                     <p className="text-xs text-muted-foreground">
                        Turning off email suppresses pending delivery attempts.
                     </p>
                  </>
               )
            )}
            {mutation.isPending && (
               <p role="status" className="text-xs text-muted-foreground">
                  Saving preferences…
               </p>
            )}
         </PopoverContent>
      </Popover>
   );
}
