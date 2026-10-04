'use client';

import * as React from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Branches } from '@lucasmarkes/hairline/react';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export interface AuthPageShellProps {
   children: ReactNode;
}

export function AuthPageShell({ children }: AuthPageShellProps) {
   return (
      <main className="relative min-h-screen w-full bg-background flex flex-col lg:grid lg:grid-cols-2">
         {/* Desktop Left Showcase Panel */}
         <section className="hidden lg:flex flex-col border-r border-border bg-muted/20 p-10 xl:p-14 relative overflow-hidden select-none">
            {/* Ambient background glow */}
            <div className="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-primary/5 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 size-96 rounded-full bg-primary/5 blur-3xl" />

            {/* Top brand header */}
            <div className="relative z-10 flex items-center justify-between">
               <Link
                  href="/"
                  className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
               >
                  <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg shadow-sm">
                     C
                  </div>
                  <span className="text-xl font-bold tracking-tight">Circle</span>
               </Link>
            </div>

            {/* Center: Interactive Hairline Branches Canvas (frameless) */}
            <div className="relative z-10 flex flex-col items-center justify-center my-auto py-6">
               <div
                  className="w-full max-w-lg aspect-[5/4] cursor-crosshair select-none"
                  style={{ '--hairline-plate': 'var(--background)' } as React.CSSProperties}
               >
                  <Branches
                     intensity={0.7}
                     theme="auto"
                     className="w-full h-full"
                     aria-label="Interactive commit graph and branches figure"
                  />
               </div>
            </div>
         </section>

         {/* Right Form Panel (and full mobile layout) */}
         <section className="relative flex flex-1 flex-col items-center justify-center min-h-screen p-4 sm:p-8 lg:p-12">
            {/* Top right utility bar (Theme toggle) */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
               <ThemeToggle />
            </div>

            {/* Mobile Header with brand & compact Branches illustration */}
            <div className="lg:hidden flex flex-col items-center gap-3 mb-6 w-full max-w-sm sm:max-w-md">
               <Link href="/" className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg shadow-sm">
                     C
                  </div>
                  <span className="text-xl font-semibold tracking-tight">Circle</span>
               </Link>

               {/* Mobile compact Branches figure (frameless) */}
               <div
                  className="w-full max-w-[260px] aspect-[5/4] mx-auto cursor-crosshair"
                  style={{ '--hairline-plate': 'var(--background)' } as React.CSSProperties}
               >
                  <Branches
                     intensity={0.5}
                     theme="auto"
                     className="w-full h-full"
                     aria-label="Interactive branches figure"
                  />
               </div>
            </div>

            {/* Frameless Auth Form Container */}
            <div className="w-full max-w-sm sm:max-w-md relative z-10">{children}</div>
         </section>
      </main>
   );
}
