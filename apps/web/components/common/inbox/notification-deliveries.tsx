'use client';
import { useState } from 'react';
import { ApiError } from '@repo/api-client';
import { ChevronDown, Mail } from 'lucide-react';
import {
   useNotificationDeliveries,
   useRetryNotificationDelivery,
} from '@/features/notifications/hooks';
import { Button } from '@/components/ui/button';
import {
   AlertDialog,
   AlertDialogContent,
   AlertDialogHeader,
   AlertDialogTitle,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogCancel,
   AlertDialogAction,
} from '@/components/ui/alert-dialog';

export function NotificationDeliveries({
   workspaceId,
   userId,
   notificationId,
   emailEnabled,
}: {
   workspaceId: string;
   userId: string;
   notificationId: string;
   emailEnabled: boolean;
}) {
   const [open, setOpen] = useState(false);
   const [confirm, setConfirm] = useState(false);
   const query = useNotificationDeliveries(workspaceId, userId, notificationId, open);
   const retry = useRetryNotificationDelivery(workspaceId, userId, notificationId);
   if (
      (query.isSuccess && query.data.length === 0) ||
      (query.error instanceof ApiError && query.error.status === 404)
   )
      return null;
   return (
      <section className="mt-8 border-t pt-4">
         <Button
            variant="ghost"
            size="xs"
            aria-expanded={open}
            aria-controls="notification-email-deliveries"
            onClick={() => setOpen(!open)}
         >
            <Mail className="size-3.5" />
            Email delivery
            <ChevronDown className="size-3.5" />
         </Button>
         {open && (
            <div
               id="notification-email-deliveries"
               className="mt-3 space-y-3 text-xs text-muted-foreground"
            >
               {query.isPending ? (
                  <p role="status">Loading email delivery…</p>
               ) : query.isError ? (
                  <div role="alert">
                     Unable to load delivery status.{' '}
                     <Button variant="ghost" size="xs" onClick={() => void query.refetch()}>
                        Try again
                     </Button>
                  </div>
               ) : (
                  query.data?.map((job) => (
                     <div key={job.id} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                           <span className="font-medium">
                              {job.status.toLowerCase().replaceAll('_', ' ')} · {job.attemptCount}{' '}
                              attempt{job.attemptCount === 1 ? '' : 's'}
                           </span>
                           {['FAILED', 'DEAD', 'UNKNOWN'].includes(job.status) && (
                              <Button
                                 variant="outline"
                                 size="xs"
                                 disabled={!emailEnabled || retry.isPending}
                                 onClick={() =>
                                    job.status === 'UNKNOWN'
                                       ? setConfirm(true)
                                       : retry.mutate({ acknowledgePossibleDuplicate: false })
                                 }
                              >
                                 {retry.isPending ? 'Retrying…' : 'Retry email'}
                              </Button>
                           )}
                        </div>
                        {job.sentAt && (
                           <p className="mt-1">Sent {new Date(job.sentAt).toLocaleString()}</p>
                        )}
                        {job.lastErrorCode && (
                           <p className="mt-1">Delivery error: {job.lastErrorCode}</p>
                        )}
                     </div>
                  ))
               )}
               {!emailEnabled && (
                  <p>Turn on email notifications in preferences to retry a delivery.</p>
               )}
            </div>
         )}
         <AlertDialog open={confirm} onOpenChange={setConfirm}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Retry an uncertain delivery?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This email may already have been delivered. Retrying may send a duplicate
                     email.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     disabled={!emailEnabled || retry.isPending}
                     onClick={() => retry.mutate({ acknowledgePossibleDuplicate: true })}
                  >
                     Retry and accept possible duplicate
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </section>
   );
}
