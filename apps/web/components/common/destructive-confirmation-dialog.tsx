'use client';

import { useState } from 'react';
import type { MouseEvent, ReactElement, ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export type DestructiveConfirmationDialogProps = {
  trigger: ReactElement;
  title?: ReactNode;
  description?: ReactNode;
  notice?: ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onConfirmError?: (error: unknown) => void;
};

export function DestructiveConfirmationDialog({
  trigger,
  title = 'Are you sure?',
  description = 'This action cannot be undone.',
  notice,
  confirmLabel = 'Confirm',
  pendingLabel = 'Working…',
  cancelLabel = 'Cancel',
  onConfirm,
  onConfirmError,
}: DestructiveConfirmationDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const handleConfirm = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (isPending) return;

    try {
      const result = onConfirm();
      if (result) {
        setIsPending(true);
        await result;
      }
      setOpen(false);
    } catch (error) {
      onConfirmError?.(error);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) setOpen(nextOpen);
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent aria-busy={isPending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {notice}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={isPending}
            onClick={handleConfirm}
          >
            {isPending ? (
              <>
                <Spinner />
                {pendingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
