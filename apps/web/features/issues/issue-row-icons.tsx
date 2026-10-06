import React from 'react';
import { format } from 'date-fns';
import { Archive, Layers, Trash2 } from 'lucide-react';
import type { IssueLifecycle, WorkPriority } from '@repo/schemas';
import { cn } from '@/lib/utils';

export const LIFECYCLE_TABS: { key: IssueLifecycle | 'all'; label: string; icon: typeof Layers }[] = [
   { key: 'all', label: 'All', icon: Layers },
   { key: 'active', label: 'Active', icon: Layers },
   { key: 'archived', label: 'Archived', icon: Archive },
   { key: 'deleted', label: 'Deleted', icon: Trash2 },
];

export const PRIORITY_OPTIONS: { key: WorkPriority | 'ALL'; label: string }[] = [
   { key: 'ALL', label: 'All priorities' },
   { key: 'URGENT', label: 'Urgent' },
   { key: 'HIGH', label: 'High' },
   { key: 'MEDIUM', label: 'Medium' },
   { key: 'LOW', label: 'Low' },
   { key: 'NO_PRIORITY', label: 'No priority' },
];

export function PriorityBadgeIcon({
   priority,
   className,
}: {
   priority?: WorkPriority | null;
   className?: string;
}) {
   switch (priority) {
      case 'URGENT':
         return (
            <svg
               width="16"
               height="16"
               viewBox="0 0 16 16"
               fill="currentColor"
               className={cn('size-4 text-red-500 shrink-0', className)}
               aria-label="Urgent priority"
               role="img"
               focusable="false"
            >
               <path d="M3 1C1.91067 1 1 1.91067 1 3V13C1 14.0893 1.91067 15 3 15H13C14.0893 15 15 14.0893 15 13V3C15 1.91067 14.0893 1 13 1H3ZM7 4L9 4L8.75391 8.99836H7.25L7 4ZM9 11C9 11.5523 8.55228 12 8 12C7.44772 12 7 11.5523 7 11C7 10.4477 7.44772 10 8 10C8.55228 10 9 10.4477 9 11Z" />
            </svg>
         );
      case 'HIGH':
         return (
            <svg
               width="16"
               height="16"
               viewBox="0 0 16 16"
               fill="currentColor"
               className={cn('size-4 text-orange-500 shrink-0', className)}
               aria-label="High priority"
               role="img"
               focusable="false"
            >
               <rect x="1.5" y="8" width="3" height="6" rx="1" />
               <rect x="6.5" y="5" width="3" height="9" rx="1" />
               <rect x="11.5" y="2" width="3" height="12" rx="1" />
            </svg>
         );
      case 'MEDIUM':
         return (
            <svg
               width="16"
               height="16"
               viewBox="0 0 16 16"
               fill="currentColor"
               className={cn('size-4 text-amber-500 shrink-0', className)}
               aria-label="Medium priority"
               role="img"
               focusable="false"
            >
               <rect x="1.5" y="8" width="3" height="6" rx="1" />
               <rect x="6.5" y="5" width="3" height="9" rx="1" />
               <rect x="11.5" y="2" width="3" height="12" rx="1" fillOpacity="0.4" />
            </svg>
         );
      case 'LOW':
         return (
            <svg
               width="16"
               height="16"
               viewBox="0 0 16 16"
               fill="currentColor"
               className={cn('size-4 text-blue-500 shrink-0', className)}
               aria-label="Low priority"
               role="img"
               focusable="false"
            >
               <rect x="1.5" y="8" width="3" height="6" rx="1" />
               <rect x="6.5" y="5" width="3" height="9" rx="1" fillOpacity="0.4" />
               <rect x="11.5" y="2" width="3" height="12" rx="1" fillOpacity="0.4" />
            </svg>
         );
      case 'NO_PRIORITY':
      default:
         return (
            <svg
               width="16"
               height="16"
               viewBox="0 0 16 16"
               fill="currentColor"
               className={cn('size-4 text-muted-foreground/60 shrink-0', className)}
               aria-label="No priority"
               role="img"
               focusable="false"
            >
               <rect x="1.5" y="7.25" width="3" height="1.5" rx="0.5" opacity="0.9" />
               <rect x="6.5" y="7.25" width="3" height="1.5" rx="0.5" opacity="0.9" />
               <rect x="11.5" y="7.25" width="3" height="1.5" rx="0.5" opacity="0.9" />
            </svg>
         );
   }
}

export function formatDateSafe(dateStr?: string | null): string | null {
   if (!dateStr) return null;
   try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      return format(d, 'MMM d');
   } catch {
      return null;
   }
}
