'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import type { Notification } from '@repo/schemas';
import { ApiError } from '@repo/api-client';
import { useNotificationActor, useNotificationTarget } from '@/features/notifications/hooks';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getRandomAvatarUrl } from '@/lib/avatar';
import { NotificationActions } from './notification-actions';
import { NotificationDeliveries } from './notification-deliveries';
import { kindLabels } from './issue-line';
import { NotificationBox } from './icons/motification-box';

function EmptyPreview() {
   const containerRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const blockScroll = (e: Event) => {
         e.preventDefault();
         e.stopPropagation();
      };

      el.addEventListener('wheel', blockScroll, { passive: false });
      el.addEventListener('touchmove', blockScroll, { passive: false });

      return () => {
         el.removeEventListener('wheel', blockScroll);
         el.removeEventListener('touchmove', blockScroll);
      };
   }, []);

   return (
      <div
         ref={containerRef}
         data-slot="empty-preview"
         className="flex h-full flex-col items-center justify-center overflow-hidden overscroll-none touch-none select-none p-8 text-center"
      >
         <NotificationBox className="mb-4 size-16 text-muted-foreground/40" />
         <h3 className="text-sm font-medium">Select a notification</h3>
         <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            View its details and manage your inbox.
         </p>
      </div>
   );
}

export default function NotificationPreview({
   notification,
   workspaceId,
   userId,
   emailEnabled,
}: {
   notification?: Notification;
   workspaceId: string;
   userId: string;
   emailEnabled: boolean;
}) {
   if (!notification) return <EmptyPreview />;
   return (
      <SelectedPreview
         key={notification.id}
         notification={notification}
         workspaceId={workspaceId}
         userId={userId}
         emailEnabled={emailEnabled}
      />
   );
}
function SelectedPreview({
   notification,
   workspaceId,
   userId,
   emailEnabled,
}: {
   notification: Notification;
   workspaceId: string;
   userId: string;
   emailEnabled: boolean;
}) {
   const { orgId } = useParams<{ orgId?: string }>();
   const target = useNotificationTarget(workspaceId, userId, notification);
   const actor = useNotificationActor(workspaceId, userId, notification.id);
   const name =
      actor.data?.name ?? (notification.actorMembershipId ? 'Workspace member' : 'System');
   const avatarUrl = useMemo(
      () =>
         actor.data?.avatarUrl ||
         getRandomAvatarUrl(
            actor.data?.membershipId ?? notification.actorMembershipId ?? notification.id
         ),
      [actor.data?.avatarUrl, actor.data?.membershipId, notification.actorMembershipId, notification.id]
   );
   if (
      [target.error, actor.error].some((error) => error instanceof ApiError && error.status === 404)
   )
      return null;

   const targetUrl = (() => {
      if (!orgId || !target.data) return null;
      if (target.data.type === 'issue') {
         return `/${orgId}/issue/${target.data.identifier || target.data.id}`;
      }
      if (target.data.type === 'project') {
         return `/${orgId}/project/${target.data.id}/overview`;
      }
      if (target.data.type === 'initiative') {
         return `/${orgId}/initiative/${target.data.id}`;
      }
      if (target.data.type === 'document') {
         return `/${orgId}/documents`;
      }
      return null;
   })();

   return (
      <div className="flex h-full flex-col">
         <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            <div>
               {targetUrl && (
                  <Button variant="outline" size="xs" asChild>
                     <Link href={targetUrl} className="flex items-center gap-1.5 text-xs">
                         <span className="capitalize">Open {target.data?.type ?? 'item'}</span>
                         <ExternalLink className="size-3" />
                     </Link>
                  </Button>
               )}
            </div>
            <NotificationActions
               notification={notification}
               workspaceId={workspaceId}
               userId={userId}
            />
         </div>
         <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
            <div className="mx-auto max-w-2xl">
               <div className="flex items-center gap-3">
                  <Avatar className="size-8 shrink-0">
                     <AvatarImage src={avatarUrl} alt="" />
                     <AvatarFallback className="text-xs font-medium">
                        {name
                           .split(' ')
                           .map((n) => n[0])
                           .slice(0, 2)
                           .join('')}
                     </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                     <p className="text-xs text-muted-foreground truncate">
                        {kindLabels[notification.kind]} · {actor.isPending ? 'Loading actor…' : name}
                     </p>
                     <time
                        className="block text-xs text-muted-foreground"
                        dateTime={notification.createdAt}
                     >
                        {new Date(notification.createdAt).toLocaleString()}
                     </time>
                  </div>
               </div>
               {target.isPending ? (
                  <div
                     className="mt-6 space-y-4"
                     role="status"
                     aria-label="Loading notification details"
                  >
                     <Skeleton className="h-7 w-3/4" />
                     <Skeleton className="h-4 w-full" />
                     <Skeleton className="h-4 w-2/3" />
                  </div>
               ) : (
                  <>
                     {targetUrl ? (
                        <Link
                           href={targetUrl}
                           className="mt-6 group inline-flex items-center gap-2 hover:text-primary transition-colors"
                        >
                           <h2 className="break-words text-xl font-semibold group-hover:underline">
                              {target.data?.title ?? 'Notification details unavailable'}
                           </h2>
                           <ExternalLink className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                        </Link>
                     ) : (
                        <h2 className="mt-6 break-words text-xl font-semibold">
                           {target.data?.title ?? 'Notification details unavailable'}
                        </h2>
                     )}
                     {target.data?.identifier && (
                        targetUrl ? (
                           <Link
                              href={targetUrl}
                              className="mt-2 block font-mono text-sm text-muted-foreground hover:underline hover:text-foreground"
                           >
                              {target.data.identifier}
                           </Link>
                        ) : (
                           <p className="mt-2 text-sm text-muted-foreground font-mono">
                              {target.data.identifier}
                           </p>
                        )
                     )}
                     {target.isError ? (
                        <div className="mt-4 text-sm text-muted-foreground">
                           Unable to load current details.{' '}
                           <Button variant="ghost" size="xs" onClick={() => void target.refetch()}>
                              Try again
                           </Button>
                        </div>
                     ) : (
                        <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                           {target.data?.description || 'No description provided.'}
                        </p>
                     )}
                  </>
               )}
               {notification.archivedAt && (
                  <p className="mt-5 text-xs text-muted-foreground">Archived</p>
               )}
               {notification.snoozedUntil && (
                  <p className="mt-2 text-xs text-muted-foreground">
                     Snoozed until {new Date(notification.snoozedUntil).toLocaleString()}
                  </p>
               )}
               <NotificationDeliveries
                  workspaceId={workspaceId}
                  userId={userId}
                  notificationId={notification.id}
                  emailEnabled={emailEnabled}
               />
            </div>
         </div>
      </div>
   );
}
