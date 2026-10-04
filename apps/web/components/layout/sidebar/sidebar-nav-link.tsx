'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { isSidebarPathActive } from './sidebar-active';

export function SidebarNavLink({
   href,
   matchHrefs = [href],
   exact = false,
   children,
}: {
   href: string;
   matchHrefs?: string[];
   exact?: boolean;
   children: ReactNode;
}) {
   const pathname = usePathname();
   const active = matchHrefs.some((target) => isSidebarPathActive(pathname, target, exact));
   return (
      <SidebarMenuButton asChild isActive={active}>
         <Link href={href} aria-current={active ? 'page' : undefined}>
            {children}
         </Link>
      </SidebarMenuButton>
   );
}
