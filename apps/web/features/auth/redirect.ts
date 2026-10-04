export function safeAuthRedirect(value: string | null | undefined): string {
   if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
   try {
      const target = new URL(value, 'http://localhost');
      if (target.origin !== 'http://localhost') return '/';
      if (
         [
            '/login',
            '/signup',
            '/password-recovery',
            '/email-verification',
            '/magic-link/request',
         ].includes(target.pathname) ||
         target.pathname.startsWith('/auth/')
      )
         return '/';
      return `${target.pathname}${target.search}${target.hash}`;
   } catch {
      return '/';
   }
}

export function verificationDestination(destination: string = '/', email?: string) {
   const params = new URLSearchParams({ redirect: safeAuthRedirect(destination) });
   if (email) params.set('email', email.trim().toLowerCase());
   return `/email-verification?${params.toString()}`;
}

export function postAuthDestination(user: { emailVerified: boolean }, destination: string) {
   return user.emailVerified ? safeAuthRedirect(destination) : verificationDestination(destination);
}
