'use client';

import * as React from 'react';
import {
   Sidebar,
   SidebarContent,
   SidebarFooter,
   SidebarGroup,
   SidebarGroupContent,
   SidebarGroupLabel,
   SidebarHeader,
   SidebarMenu,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface SidebarSkeletonProps extends Omit<
   React.ComponentProps<typeof Sidebar>,
   'variant'
> {
   variant?: 'app' | 'settings';
   sidebarVariant?: React.ComponentProps<typeof Sidebar>['variant'];
}

/**
 * Top header skeleton representing OrgSwitcher + ThemeToggle + CreateNewIssue
 */
export function SidebarHeaderSkeleton({ variant = 'app' }: { variant?: 'app' | 'settings' }) {
   if (variant === 'settings') {
      return (
         <SidebarHeader>
            <div className="flex h-8 items-center gap-2 px-1 pt-2">
               <Skeleton className="size-4 rounded" />
               <Skeleton className="h-4 w-24 rounded" />
            </div>
         </SidebarHeader>
      );
   }

   return (
      <SidebarHeader>
         <div className="flex w-full items-center gap-1 pt-2">
            {/* Workspace selector trigger placeholder */}
            <div className="flex h-8 flex-1 items-center gap-2 rounded-md p-1">
               <Skeleton className="size-6 shrink-0 rounded bg-orange-500/20" />
               <Skeleton className="h-4 w-24 rounded" />
               <Skeleton className="ml-auto size-3.5 shrink-0 rounded" />
            </div>

            {/* Theme toggle placeholder */}
            <Skeleton className="size-8 shrink-0 rounded-md" />

            {/* Create issue button placeholder */}
            <Skeleton className="size-8 shrink-0 rounded-md" />
         </div>
      </SidebarHeader>
   );
}

/**
 * Navigation group skeleton with icon and variable-width text bars
 */
export function SidebarNavGroupSkeleton({
   label,
   count = 3,
   widths = ['w-16', 'w-24', 'w-20', 'w-28'],
   showBadges = false,
}: {
   label?: string;
   count?: number;
   widths?: string[];
   showBadges?: boolean;
}) {
   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         {label && (
            <SidebarGroupLabel className="flex items-center justify-between">
               <Skeleton className="h-3 w-16 rounded" />
            </SidebarGroupLabel>
         )}
         <SidebarGroupContent>
            <SidebarMenu>
               {Array.from({ length: count }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                     <div className="flex h-8 items-center gap-2 rounded-md px-2">
                        <Skeleton className="size-4 shrink-0 rounded" />
                        <Skeleton className={cn('h-3.5 rounded', widths[i % widths.length])} />
                        {showBadges && i === 0 && (
                           <Skeleton className="ml-auto size-4 shrink-0 rounded-full" />
                        )}
                     </div>
                  </SidebarMenuItem>
               ))}
            </SidebarMenu>
         </SidebarGroupContent>
      </SidebarGroup>
   );
}

/**
 * Teams list skeleton with collapsible team headers and nested items
 */
export function SidebarTeamsSkeleton({ count = 2 }: { count?: number }) {
   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarGroupLabel className="flex items-center justify-between">
            <Skeleton className="h-3 w-12 rounded" />
            <Skeleton className="size-4 rounded" />
         </SidebarGroupLabel>
         <SidebarGroupContent>
            <SidebarMenu className="space-y-3 pt-1">
               {Array.from({ length: count }).map((_, teamIdx) => (
                  <div key={teamIdx} className="space-y-1">
                     {/* Team Header */}
                     <div className="flex h-8 items-center gap-2 rounded-md px-2">
                        <Skeleton
                           className={cn(
                              'size-4 shrink-0 rounded',
                              teamIdx === 0 ? 'bg-emerald-500/20' : 'bg-blue-500/20'
                           )}
                        />
                        <Skeleton
                           className={cn('h-3.5 rounded', teamIdx === 0 ? 'w-24' : 'w-20')}
                        />
                        <Skeleton className="ml-auto size-3 shrink-0 rounded" />
                     </div>

                     {/* Nested team items */}
                     <div className="ml-4 space-y-1 border-l border-border/40 pl-2">
                        <div className="flex h-7 items-center gap-2 rounded-md px-2">
                           <Skeleton className="size-3.5 shrink-0 rounded" />
                           <Skeleton className="h-3 w-14 rounded" />
                        </div>
                        <div className="flex h-7 items-center gap-2 rounded-md px-2">
                           <Skeleton className="size-3.5 shrink-0 rounded" />
                           <Skeleton className="h-3 w-12 rounded" />
                        </div>
                        {teamIdx === 0 && (
                           <div className="flex h-7 items-center gap-2 rounded-md px-2">
                              <Skeleton className="size-3.5 shrink-0 rounded" />
                              <Skeleton className="h-3 w-16 rounded" />
                           </div>
                        )}
                     </div>
                  </div>
               ))}
            </SidebarMenu>
         </SidebarGroupContent>
      </SidebarGroup>
   );
}

/**
 * Footer skeleton for help and repository links
 */
export function SidebarFooterSkeleton() {
   return (
      <SidebarFooter>
         <div className="w-full flex flex-col gap-2 pt-1">
            <Skeleton className="mx-auto h-2.5 w-28 rounded" />
            <div className="flex w-full items-center justify-between pt-1">
               <Skeleton className="h-8 w-8 rounded-md" />
               <Skeleton className="h-8 w-8 rounded-md" />
            </div>
         </div>
      </SidebarFooter>
   );
}

/**
 * Comprehensive SidebarSkeleton layout matching AppSidebar
 */
export function SidebarSkeleton({
   variant = 'app',
   sidebarVariant,
   className,
   ...props
}: SidebarSkeletonProps) {
   return (
      <Sidebar
         collapsible="offcanvas"
         variant={sidebarVariant}
         className={cn(className)}
         {...props}
      >
         <SidebarHeaderSkeleton variant={variant} />

         <SidebarContent>
            {variant === 'settings' ? (
               <>
                  <SidebarNavGroupSkeleton
                     label="WORKSPACE"
                     count={5}
                     widths={['w-24', 'w-20', 'w-28', 'w-24', 'w-18']}
                  />
                  <SidebarNavGroupSkeleton
                     label="TEAMS"
                     count={3}
                     widths={['w-28', 'w-24', 'w-20']}
                  />
               </>
            ) : (
               <>
                  {/* Personal / Inbox Group */}
                  <SidebarNavGroupSkeleton count={3} widths={['w-16', 'w-20', 'w-18']} showBadges />

                  {/* Workspace Group */}
                  <SidebarNavGroupSkeleton
                     label="WORKSPACE"
                     count={4}
                     widths={['w-24', 'w-20', 'w-16', 'w-18']}
                  />

                  {/* Teams Group */}
                  <SidebarTeamsSkeleton count={2} />
               </>
            )}
         </SidebarContent>

         <SidebarFooterSkeleton />
      </Sidebar>
   );
}
