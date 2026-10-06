'use client';

import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';

import { cn } from '@/lib/utils';

function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
   return (
      <AvatarPrimitive.Root
         data-slot="avatar"
         className={cn('relative flex size-8 shrink-0 rounded-full', className)}
         {...props}
      />
   );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
   return (
      <AvatarPrimitive.Image
         data-slot="avatar-image"
         className={cn('aspect-square size-full rounded-full object-cover', className)}
         {...props}
      />
   );
}

function AvatarFallback({
   className,
   ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
   return (
      <AvatarPrimitive.Fallback
         data-slot="avatar-fallback"
         className={cn(
            'bg-muted flex size-full items-center justify-center rounded-full',
            className
         )}
         {...props}
      />
   );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<'span'>) {
   return (
      <span
         data-slot="avatar-badge"
         className={cn(
            'absolute bottom-0 right-0 z-10 size-2.5 rounded-full bg-primary ring-2 ring-background',
            className
         )}
         {...props}
      />
   );
}

export { Avatar, AvatarImage, AvatarFallback, AvatarBadge };
