'use client';

import { useMemo } from 'react';
import type { Notification } from '@repo/schemas';
import { ApiError } from '@repo/api-client';
import { Bell, Calendar, Compass, FileText, Target, UserPlus } from 'lucide-react';
import { useNotificationActor, useNotificationTarget } from '@/features/notifications/hooks';
import type { NotificationTarget } from '@/features/notifications/api';
import { Avatar, AvatarFallback, AvatarImage, AvatarBadge } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPieIcon } from '@/mock-data/status';
import { getRandomAvatarUrl } from '@/lib/avatar';
import { cn } from '@/lib/utils';

export const kindLabels: Record<Notification['kind'], string> = {
   ASSIGNMENT: 'Assignment',
   MENTION: 'Mention',
   SUBSCRIPTION: 'Subscription update',
   PLANNING_UPDATE: 'Planning update',
};

function formatCompactRelativeTime(dateString: string): string {
   const now = Date.now();
   const time = new Date(dateString).getTime();
   const diffMs = Math.max(0, now - time);
   const diffSec = Math.floor(diffMs / 1000);
   const diffMin = Math.floor(diffSec / 60);
   const diffHours = Math.floor(diffMin / 60);
   const diffDays = Math.floor(diffHours / 24);
   const diffWeeks = Math.floor(diffDays / 7);

   if (diffSec < 60) return 'now';
   if (diffMin < 60) return `${diffMin}m`;
   if (diffHours < 24) return `${diffHours}h`;
   if (diffDays < 7) return `${diffDays}d`;
   if (diffWeeks < 5) return `${diffWeeks}w`;
   if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`;
   return `${Math.floor(diffDays / 365)}y`;
}

function KindMiniBadge({ kind }: { kind: Notification['kind'] }) {
   return (
      <div
         className="absolute -bottom-1 -right-1 z-10 flex size-4 items-center justify-center rounded-full bg-background ring-2 ring-background text-muted-foreground shadow-xs"
         aria-hidden="true"
      >
         {kind === 'MENTION' && (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
               <path d="M6.27246 4.61328C6.34825 4.59068 6.4363 4.6001 6.5127 4.63477C6.58913 4.66988 6.64925 4.72787 6.68164 4.7998C6.71377 4.8718 6.716 4.95477 6.69141 5.03516C6.66653 5.1151 6.61688 5.18691 6.5498 5.22852C6.49137 5.26498 6.43537 5.30181 6.38086 5.33984C5.63535 5.83563 5.24006 6.55883 5.17773 7.29395C5.29094 7.27427 5.40754 7.26274 5.52637 7.2627C6.64457 7.2627 7.55148 8.16897 7.55176 9.28711C7.55176 10.4055 6.64474 11.3125 5.52637 11.3125C4.40834 11.3121 3.50195 10.4052 3.50195 9.28711V8.4873L3.50098 8.48828C3.499 8.39852 3.49934 8.30601 3.50293 8.2168C3.51156 6.5902 4.7032 5.09714 6.05078 4.6875C6.12397 4.66097 6.19724 4.6368 6.27246 4.61328ZM11.2725 4.61328C11.3482 4.59068 11.4363 4.6001 11.5127 4.63477C11.5891 4.66988 11.6492 4.72787 11.6816 4.7998C11.7138 4.8718 11.716 4.95477 11.6914 5.03516C11.6665 5.1151 11.6169 5.18691 11.5498 5.22852C11.4914 5.26498 11.4354 5.30181 11.3809 5.33984C10.6353 5.83563 10.2401 6.55883 10.1777 7.29395C10.2909 7.27427 10.4075 7.26274 10.5264 7.2627C11.6446 7.2627 12.5515 8.16897 12.5518 9.28711C12.5518 10.4055 11.6447 11.3125 10.5264 11.3125C9.40834 11.3121 8.50195 10.4052 8.50195 9.28711V8.4873L8.50098 8.48828C8.499 8.39852 8.49934 8.30601 8.50293 8.2168C8.51156 6.5902 9.7032 5.09714 11.0508 4.6875C11.124 4.66097 11.1972 4.6368 11.2725 4.61328Z" />
            </svg>
         )}
         {kind === 'ASSIGNMENT' && <UserPlus className="size-2.5" />}
         {kind === 'SUBSCRIPTION' && <Bell className="size-2.5" />}
         {kind === 'PLANNING_UPDATE' && <Calendar className="size-2.5" />}
      </div>
   );
}

function TargetStatusIcon({ target }: { target?: NotificationTarget }) {
   if (!target || target.type === 'issue') {
      return (
         <div className="shrink-0 flex items-center justify-center" aria-hidden="true">
            <StatusPieIcon color="#26b5ce" fraction={0.5} />
         </div>
      );
   }
   if (target.type === 'project') {
      return (
         <div
            className="shrink-0 flex items-center justify-center text-muted-foreground"
            aria-hidden="true"
         >
            <Target className="size-3.5" />
         </div>
      );
   }
   if (target.type === 'initiative') {
      return (
         <div
            className="shrink-0 flex items-center justify-center text-muted-foreground"
            aria-hidden="true"
         >
            <Compass className="size-3.5" />
         </div>
      );
   }
   return (
      <div
         className="shrink-0 flex items-center justify-center text-muted-foreground"
         aria-hidden="true"
      >
         <FileText className="size-3.5" />
      </div>
   );
}

export default function IssueLine({
   notification,
   workspaceId,
   userId,
   isSelected,
   onClick,
}: {
   notification: Notification;
   workspaceId: string;
   userId: string;
   isSelected: boolean;
   onClick: () => void;
}) {
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

   const fullDate = new Date(notification.createdAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
   });

   const actionVerb = (() => {
      if (actor.isPending) return '';
      const desc = target.data?.description?.trim();
      switch (notification.kind) {
         case 'MENTION':
            return desc ? ` commented: ${desc}` : ' commented: mentioned you in a discussion';
         case 'ASSIGNMENT':
            return desc ? ` assigned you: ${desc}` : ' assigned you to this issue';
         case 'SUBSCRIPTION':
            return desc ? ` updated: ${desc}` : ' updated this issue';
         case 'PLANNING_UPDATE':
            return desc ? ` posted update: ${desc}` : ' posted a project update';
         default:
            return ` · ${kindLabels[notification.kind]}`;
      }
   })();

   const summarySnippet = `${name}${actionVerb}`;

   return (
      <li className="list-none border-b border-border/40 last:border-b-0">
         <button
            type="button"
            onClick={onClick}
            aria-pressed={isSelected}
            className={cn(
               'group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-[background-color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]',
               isSelected
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/40 text-foreground'
            )}
         >
            {/* Left: Avatar + Badges */}
            <div className="relative shrink-0">
               <Avatar className="size-8">
                  <AvatarImage src={avatarUrl} alt="" />
                  <AvatarFallback className="text-xs font-medium">
                     {name
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')}
                  </AvatarFallback>
                  {!notification.readAt && (
                     <AvatarBadge
                        aria-label="Unread"
                        className="bottom-auto -top-0.5 -right-0.5 size-2 bg-blue-500 ring-2 ring-background"
                     />
                  )}
               </Avatar>
               <KindMiniBadge kind={notification.kind} />
            </div>

            {/* Right: Two rows matching Linear layout */}
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
               {/* Top Row: Title + Status Icon */}
               <div
                  title={target.data?.title ?? 'Notification details unavailable'}
                  className="flex items-center justify-between gap-2 min-w-0 w-full"
               >
                  <span className="sr-only">{notification.readAt ? 'Read' : 'Unread'}</span>
                  {target.isPending ? (
                     <Skeleton className="h-4 w-40" />
                  ) : (
                     <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {target.data?.identifier && (
                           <span className="font-mono text-xs text-muted-foreground font-normal shrink-0">
                              {target.data.identifier}
                           </span>
                        )}
                        <span
                           className={cn(
                              'truncate text-sm leading-snug',
                              !notification.readAt
                                 ? 'font-medium text-foreground'
                                 : 'font-normal text-muted-foreground'
                           )}
                        >
                           {target.data?.title ?? 'Notification details unavailable'}
                        </span>
                     </div>
                  )}
                  <TargetStatusIcon target={target.data} />
               </div>

               {/* Bottom Row: Comment / Subtitle Excerpt + Timestamp */}
               <div className="flex items-center justify-between gap-2 min-w-0 w-full text-xs text-muted-foreground">
                  <div className="truncate min-w-0 flex-1" title={summarySnippet}>
                     <span className="font-medium text-foreground/80">
                        {actor.isPending ? 'Loading actor…' : name}
                     </span>
                     <span>{actionVerb}</span>
                  </div>
                  <time
                     className="shrink-0 text-right text-xs text-muted-foreground min-w-[20px]"
                     dateTime={notification.createdAt}
                     title={fullDate}
                  >
                     {formatCompactRelativeTime(notification.createdAt)}
                  </time>
               </div>
            </div>
         </button>
      </li>
   );
}
