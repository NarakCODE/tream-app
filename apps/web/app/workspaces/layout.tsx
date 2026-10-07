import { BackButton } from '@/components/common/back-button';
import { ServerBootstrap } from '@/features/bootstrap/server-bootstrap';

export default function WorkspacesLayout({ children }: { children: React.ReactNode }) {
   return (
      <ServerBootstrap>
         <div className="mx-auto flex w-full max-w-full flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
         <div>
           <BackButton />
           {children}
         </div>
         </div>
      </ServerBootstrap>
   );
}
