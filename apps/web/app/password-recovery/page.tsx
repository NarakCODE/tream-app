import type { Metadata } from 'next';
import { AuthPageShell } from '@/features/auth/components/auth-page-shell';
import { RequestLinkForm } from '@/features/auth/components/request-link-form';

export const metadata: Metadata = { title: 'Password Recovery | Circle' };

export default function PasswordRecoveryPage() {
   return (
      <AuthPageShell>
         <RequestLinkForm action="password-recovery" />
      </AuthPageShell>
   );
}
