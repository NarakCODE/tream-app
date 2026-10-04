import type { Metadata } from 'next';
import { emailInputSchema } from '@repo/schemas';
import { AuthPageShell } from '@/features/auth/components/auth-page-shell';
import { RequestLinkForm } from '@/features/auth/components/request-link-form';
import { EmailVerificationStep } from '@/features/auth/components/email-verification-step';
import { safeAuthRedirect } from '@/features/auth/redirect';

export const metadata: Metadata = { title: 'Verify Email | Circle' };

export default async function EmailVerificationPage({
   searchParams,
}: {
   searchParams: Promise<{ redirect?: string; email?: string }>;
}) {
   const params = await searchParams;
   const destination = safeAuthRedirect(params.redirect);
   const email = emailInputSchema.safeParse({ email: params.email });
   return (
      <AuthPageShell>
         {email.success ? (
            <EmailVerificationStep destination={destination} email={email.data.email} />
         ) : (
            <RequestLinkForm action="email-verification" />
         )}
      </AuthPageShell>
   );
}
