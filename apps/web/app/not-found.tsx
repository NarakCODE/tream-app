import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
   return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
         <div className="space-y-4 max-w-md">
            <div className="flex size-12 mx-auto items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground shadow-sm">
               C
            </div>
            <div className="space-y-2">
               <h1 className="text-3xl font-bold tracking-tight text-foreground">404</h1>
               <h2 className="text-lg font-semibold text-foreground">Page not found</h2>
               <p className="text-sm text-muted-foreground">
                  The page or resource you requested could not be found.
               </p>
            </div>
            <div className="pt-2">
               <Button asChild>
                  <Link href="/">Return home</Link>
               </Button>
            </div>
         </div>
      </main>
   );
}
