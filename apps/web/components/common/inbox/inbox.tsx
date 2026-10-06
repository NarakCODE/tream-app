'use client';
import { useState } from 'react';
import type { NotificationStatus } from '@repo/schemas';
import { ApiError } from '@repo/api-client';
import { ChevronLeft } from 'lucide-react';
import {
   useNotificationList,
   useNotificationDetail,
   useNotificationPreferences,
   useUpdateNotificationPreferences,
   useUnreadCount,
} from '@/features/notifications/hooks';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useIsMobile } from '@/hooks/use-mobile';
import IssueLine from './issue-line';
import NotificationPreview from './issue-preview';
import { NotificationPreferences } from './notification-preferences';
import { cn } from '@/lib/utils';

const tabs = ['inbox', 'archived', 'snoozed', 'all'] as const;
const empty: Record<NotificationStatus, string> = {
   inbox: 'You’re all caught up.',
   archived: 'No archived notifications.',
   snoozed: 'No snoozed notifications.',
   all: 'No notifications yet.',
};
export default function Inbox({ workspaceId, userId }: { workspaceId: string; userId: string }) {
   const [status, setStatus] = useState<NotificationStatus>('inbox');
   const [unreadOnly, setUnreadOnly] = useState(false);
   const [selectedId, setSelectedId] = useState<string | null>(null);
   const isMobile = useIsMobile();
   const list = useNotificationList(workspaceId, userId, {
      status,
      unread: unreadOnly ? 'true' : undefined,
      limit: 25,
   });
   const preferences = useNotificationPreferences(workspaceId, userId);
   const updatePreferences = useUpdateNotificationPreferences(workspaceId, userId);
   const count = useUnreadCount(workspaceId, userId);
   const items = list.data?.pages.flatMap((page) => page.items) ?? [];
   const disabled = preferences.data?.inAppEnabled === false;
   const detail = useNotificationDetail(workspaceId, userId, selectedId ?? '');
   const visibleSelection = disabled ? undefined : items.find((item) => item.id === selectedId);
   const detailGone = detail.error instanceof ApiError && detail.error.status === 404;
   const selected = visibleSelection && !detailGone ? (detail.data ?? visibleSelection) : undefined;
   const preview = (
      <NotificationPreview
         notification={selected}
         workspaceId={workspaceId}
         userId={userId}
         emailEnabled={preferences.data?.emailEnabled === true}
      />
   );
   const panel = (
      <Tabs
         value={status}
         onValueChange={(value) => {
            setStatus(value as NotificationStatus);
            setSelectedId(null);
         }}
         className="flex h-full min-h-0 flex-col gap-0"
      >
         <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
               <SidebarTrigger className="lg:hidden" />
               <h1 className="text-sm font-semibold">Inbox</h1>
               {!disabled && count.data && count.data.unreadCount > 0 && (
                  <span
                     className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                     aria-label={`${count.data.unreadCount} unread notifications`}
                  >
                     {count.data.unreadCount}
                  </span>
               )}
            </div>
            <NotificationPreferences
               workspaceId={workspaceId}
               userId={userId}
               unreadOnly={unreadOnly}
               onUnreadOnlyChange={(checked) => {
                  setUnreadOnly(checked);
                  setSelectedId(null);
               }}
            />
         </div>
         <div className="shrink-0 border-b px-3 py-3">
            <TabsList className="w-full" aria-label="Notification status">
               {tabs.map((tab) => (
                  <TabsTrigger key={tab} value={tab} className="flex-1 capitalize">
                     {tab}
                  </TabsTrigger>
               ))}
            </TabsList>
         </div>
         <TabsContent
            value={status}
            className="min-h-0 overflow-y-auto"
            aria-busy={list.isFetching}
         >
            {preferences.isPending || (preferences.isSuccess && !disabled && list.isPending) ? (
               <div className="space-y-5 p-4" role="status" aria-label="Loading notifications">
                  {Array.from({ length: 5 }, (_, i) => (
                     <div key={i} className="flex gap-3">
                        <Skeleton className="size-8 rounded-full" />
                        <div className="flex-1 space-y-2">
                           <Skeleton className="h-4 w-3/4" />
                           <Skeleton className="h-3 w-1/2" />
                        </div>
                     </div>
                  ))}
               </div>
            ) : preferences.isError ? (
               <div role="alert" className="p-8 text-center text-sm">
                  <p>Unable to load notification preferences.</p>
                  <Button
                     variant="outline"
                     size="sm"
                     className="mt-3"
                     onClick={() => void preferences.refetch()}
                  >
                     Try again
                  </Button>
               </div>
            ) : disabled ? (
               <div className="p-8 text-center">
                  <h2 className="text-sm font-medium">In-app notifications are off</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                     Turn them on to see your workspace updates.
                  </p>
                  <Button
                     size="sm"
                     className="mt-4"
                     disabled={updatePreferences.isPending}
                     onClick={() =>
                        updatePreferences.mutate({
                           preferences: preferences.data!,
                           patch: { inAppEnabled: true },
                        })
                     }
                  >
                     {updatePreferences.isPending ? 'Turning on…' : 'Turn on in-app notifications'}
                  </Button>
               </div>
            ) : list.isError && !list.data ? (
               <div role="alert" className="p-8 text-center text-sm">
                  <p>Unable to load notifications.</p>
                  <Button
                     variant="outline"
                     size="sm"
                     className="mt-3"
                     onClick={() => void list.refetch()}
                  >
                     Try again
                  </Button>
               </div>
            ) : items.length === 0 ? (
               <div className="p-8 text-center text-sm text-muted-foreground">
                  {unreadOnly ? 'No unread notifications in this tab.' : empty[status]}
               </div>
            ) : (
               <>
                  <ul aria-label={`${status} notifications`}>
                     {items.map((notification) => (
                        <IssueLine
                           key={notification.id}
                           notification={notification}
                           workspaceId={workspaceId}
                           userId={userId}
                           isSelected={selected?.id === notification.id}
                           onClick={() => setSelectedId(notification.id)}
                        />
                     ))}
                  </ul>
                  {list.isError && (
                     <div role="alert" className="p-4 text-center text-xs">
                        Unable to refresh notifications.{' '}
                        <Button variant="ghost" size="xs" onClick={() => void list.refetch()}>
                           Try again
                        </Button>
                     </div>
                  )}
                  {list.hasNextPage && (
                     <div className="p-4 text-center">
                        <Button
                           variant="outline"
                           size="sm"
                           disabled={list.isFetchingNextPage}
                           onClick={() => void list.fetchNextPage()}
                        >
                           {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
                        </Button>
                     </div>
                  )}
               </>
            )}
         </TabsContent>
      </Tabs>
   );
   if (isMobile)
      return selected ? (
         <div className="flex h-full flex-col">
            <Button
               variant="ghost"
               className="h-12 shrink-0 justify-start rounded-none border-b"
               onClick={() => setSelectedId(null)}
            >
               <ChevronLeft className="size-4" />
               Back to inbox
            </Button>
            <div className="min-h-0 flex-1">{preview}</div>
         </div>
      ) : (
         panel
      );
   return (
      <ResizablePanelGroup
         direction="horizontal"
         autoSaveId="notification-inbox-panels"
         className="h-full w-full"
      >
         <ResizablePanel defaultSize={40} minSize={30} className="flex min-w-0 flex-col">
            {panel}
         </ResizablePanel>
         <ResizableHandle withHandle />
         <ResizablePanel
            defaultSize={60}
            minSize={30}
            className={cn('flex min-w-0 flex-col', !selected && 'overflow-hidden overscroll-none')}
         >
            {preview}
         </ResizablePanel>
      </ResizablePanelGroup>
   );
}
