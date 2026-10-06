import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseDomainFromHost } from '@/lib/domain-url';

const AUTH_COOKIE_NAME = 'tream_access';

const PUBLIC_PATHS = new Set([
   '/login',
   '/signup',
   '/password-recovery',
   '/email-verification',
   '/magic-link/request',
   '/auth/password-reset',
   '/auth/verify-email',
   '/auth/magic-link',
]);

export function middleware(request: NextRequest) {
   const { pathname, search } = request.nextUrl;
   const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
   const isAuthenticated = Boolean(token && token.trim().length > 0);

   const isPublicAuthPath = PUBLIC_PATHS.has(pathname);

   // Defense-in-depth: never intercept internal Next.js paths or static assets
   if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
      return NextResponse.next();
   }

   // If user is NOT authenticated and attempts to access protected routes, redirect to login
   if (!isAuthenticated && !isPublicAuthPath) {
      const loginUrl = new URL('/login', request.url);
      const target = `${pathname}${search}`;
      if (target !== '/') {
         loginUrl.searchParams.set('redirect', target);
      }
      return NextResponse.redirect(loginUrl);
   }

   // Dynamic domain URL support: check host for subdomain tenant slug
   const hostname = request.headers.get('host') || request.nextUrl.hostname;
   const domainSlug = parseDomainFromHost(hostname);
   const requestHeaders = new Headers(request.headers);

   if (domainSlug) {
      requestHeaders.set('x-workspace-slug', domainSlug);
      // Rewrite subdomain request to /{domainSlug}{pathname} if not already path-scoped
      if (
         !pathname.startsWith(`/${domainSlug}`) &&
         !isPublicAuthPath &&
         pathname !== '/workspaces' &&
         pathname !== '/onboarding'
      ) {
         const url = request.nextUrl.clone();
         url.pathname = `/${domainSlug}${pathname === '/' ? '/my-issues' : pathname}`;
         return NextResponse.rewrite(url, {
            request: {
               headers: requestHeaders,
            },
         });
      }
   }

   return NextResponse.next({
      request: {
         headers: requestHeaders,
      },
   });
}

export const config = {
   matcher: [
      /*
       * Match all request paths except for:
       * - api routes
       * - _next/static (static files)
       * - _next/image (image optimization files)
       * - static asset files (.png, .jpg, .svg, .css, etc.)
       * - favicon.ico
       */
      '/((?!api|_next/static|_next/image|favicon.ico|banner\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2|ico)$).*)',
   ],
};
