'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

export function BackButton() {
   const router = useRouter();

   return (
     <Button variant="outline" size="sm" onClick={() => router.back()}>
       <ChevronLeft className='size-4'/>
         <span>Back</span>
      </Button>
   );
}
