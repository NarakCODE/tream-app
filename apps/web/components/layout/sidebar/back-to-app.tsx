'use client';

import { useActiveWorkspace } from '@/features/auth/hooks';

import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export function BackToApp() {
   const active = useActiveWorkspace();
   const slug = active.data?.workspace.slug;
   return (
      <div className="w-full flex items-center justify-between gap-2">
         <Button className="w-fit" size="xs" variant="outline" asChild>
            <Link href={slug ? `/${slug}/my-issues` : '/workspaces'}>
               <ChevronLeft className="size-4" />
               Back to app
            </Link>
         </Button>
         <ThemeToggle />
      </div>
   );
}
