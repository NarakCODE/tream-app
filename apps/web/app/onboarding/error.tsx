'use client';

import { Button } from '@/components/ui/button';

export default function OnboardingError({ reset }: { reset: () => void }) {
   return (
      <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 p-6">
         <h1 className="text-xl font-semibold">We couldn’t load your setup</h1>
         <p role="alert" className="text-sm text-muted-foreground">
            Check your connection and try again. Your saved workspace and team will still be here.
         </p>
         <Button onClick={reset}>Retry</Button>
      </main>
   );
}
