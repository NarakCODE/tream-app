import { SidebarProvider } from '@/components/ui/sidebar';
import { SidebarSkeleton } from '@/components/layout/sidebar/sidebar-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
   return (
      <SidebarProvider>
         <SidebarSkeleton />
         <div className="h-svh overflow-hidden lg:p-2 w-full">
            <div className="lg:border lg:rounded-md overflow-hidden flex flex-col items-center justify-start bg-container h-full w-full">
               {/* Top Navigation Bar Skeleton */}
               <div className="w-full border-b border-border/40 px-4 py-3 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                     <Skeleton className="size-5 rounded" />
                     <Skeleton className="h-4 w-32 rounded" />
                  </div>
                  <div className="flex items-center gap-2">
                     <Skeleton className="h-8 w-20 rounded-md" />
                     <Skeleton className="size-8 rounded-md" />
                  </div>
               </div>

               {/* Subheader / Tabs Filter Skeleton */}
               <div className="w-full border-b border-border/30 px-4 py-2 flex items-center gap-2 shrink-0">
                  <Skeleton className="h-6 w-16 rounded-md" />
                  <Skeleton className="h-6 w-16 rounded-md" />
                  <Skeleton className="h-6 w-16 rounded-md" />
                  <div className="ml-auto flex items-center gap-2">
                     <Skeleton className="h-6 w-24 rounded-md" />
                  </div>
               </div>

               {/* Main Issues / Table Content Skeleton */}
               <div className="flex-1 w-full p-4 sm:p-6 space-y-3 overflow-auto">
                  <div className="flex items-center justify-between pb-2">
                     <Skeleton className="h-6 w-36 rounded" />
                     <Skeleton className="h-7 w-24 rounded-md" />
                  </div>
                  <div className="space-y-2">
                     {Array.from({ length: 8 }).map((_, i) => (
                        <div
                           key={i}
                           className="flex h-11 items-center gap-3 rounded-lg border border-border/40 bg-muted/10 px-4"
                        >
                           <Skeleton className="size-4 shrink-0 rounded" />
                           <Skeleton className="h-3.5 w-16 shrink-0 rounded" />
                           <Skeleton
                              className="h-3.5 rounded"
                              style={{ width: `${Math.floor(30 + ((i * 13) % 40))}%` }}
                           />
                           <div className="ml-auto flex items-center gap-3">
                              <Skeleton className="h-5 w-16 rounded-full" />
                              <Skeleton className="size-5 rounded-full" />
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
         </div>
      </SidebarProvider>
   );
}
