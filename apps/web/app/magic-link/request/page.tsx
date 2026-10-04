import type { Metadata } from 'next';
import { AuthPageShell } from '@/features/auth/components/auth-page-shell';
import { RequestLinkForm } from '@/features/auth/components/request-link-form';

export const metadata: Metadata = { title: 'Sign In With a Link | Circle' };

export default function MagicLinkRequestPage() {
   return (
      <AuthPageShell>
         <RequestLinkForm action="magic-link" />
      </AuthPageShell>
   );
}
