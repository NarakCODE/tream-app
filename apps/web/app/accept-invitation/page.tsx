import { Suspense } from 'react';
import { AuthPageShell } from '@/features/auth/components/auth-page-shell';
import { AcceptInvitation } from '@/features/invitations/accept-invitation';

export default function AcceptInvitationPage() {
   return (
      <AuthPageShell>
         <Suspense fallback={<p role="status">Loading invitation…</p>}>
            <AcceptInvitation />
         </Suspense>
      </AuthPageShell>
   );
}
