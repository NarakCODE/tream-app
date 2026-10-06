/**
 * Utilities for dynamic domain & URL parsing and parent resource extraction.
 *
 * Supports:
 * - Subdomain / custom host tenant resolution (e.g. acme.localhost:3000 -> "acme")
 * - Path-based parent ID extraction (/orgId/team/:teamId/project/:projectId/...)
 * - UUID validation for direct resource IDs
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RESERVED_SUBDOMAINS = new Set([
   'www',
   'app',
   'api',
   'admin',
   'docs',
   'mail',
   'status',
   'cdn',
   'assets',
]);

const RESERVED_ROOT_PATHS = new Set([
   'login',
   'signup',
   'workspaces',
   'onboarding',
   'auth',
   'magic-link',
   'email-verification',
   'password-recovery',
   'accept-invitation',
   'api',
   '_next',
   'favicon.ico',
]);

export interface RouteParentIds {
   orgId?: string;
   teamId?: string;
   projectId?: string;
   initiativeId?: string;
   viewId?: string;
   cycleId?: string;
   issueId?: string;
}

/** Returns true if the string matches UUID v4 / standard UUID format. */
export function isUuid(value: string | null | undefined): value is string {
   return Boolean(value && UUID_REGEX.test(value));
}

/**
 * Extracts a workspace subdomain slug from the request Host header if present.
 * For example:
 *   - "acme.localhost:3000" -> "acme"
 *   - "tenant.tream.app" -> "tenant"
 *   - "localhost:3000" -> null
 *   - "www.tream.app" -> null
 */
export function parseDomainFromHost(host?: string | null): string | null {
   if (!host) return null;
   // Strip port if present
   const hostname = host.split(':')[0]?.toLowerCase() ?? '';
   if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
      return null;
   }

   const parts = hostname.split('.');
   if (parts.length >= 2) {
      const subdomain = parts[0];
      if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
         return subdomain;
      }
   }
   return null;
}

/**
 * Extracts route parent IDs from a pathname string.
 * e.g. "/acme/team/eng-team/issue/ENG-123" -> { orgId: "acme", teamId: "eng-team", issueId: "ENG-123" }
 */
export function extractParentIdsFromPath(pathname: string): RouteParentIds {
   const result: RouteParentIds = {};
   if (!pathname) return result;

   const cleanPath = pathname.split('?')[0]?.split('#')[0] ?? '';
   const segments = cleanPath.split('/').filter(Boolean);

   if (segments.length > 0) {
      const first = segments[0];
      if (first && !RESERVED_ROOT_PATHS.has(first)) {
         result.orgId = decodeURIComponent(first);
      }
   }

   for (let i = 0; i < segments.length - 1; i++) {
      const current = segments[i]?.toLowerCase();
      const next = segments[i + 1];
      if (!next) continue;

      const decoded = decodeURIComponent(next);
      if (current === 'team' || current === 'teams') {
         result.teamId = decoded;
      } else if (current === 'project' || current === 'projects') {
         result.projectId = decoded;
      } else if (current === 'initiative' || current === 'initiatives') {
         result.initiativeId = decoded;
      } else if (current === 'view' || current === 'views') {
         result.viewId = decoded;
      } else if (current === 'cycle' || current === 'cycles') {
         result.cycleId = decoded;
      } else if (current === 'issue' || current === 'issues') {
         result.issueId = decoded;
      }
   }

   return result;
}

/**
 * Builds a path under the given org slug / domain.
 */
export function buildWorkspacePath(orgId: string, subpath: string): string {
   const base = `/${encodeURIComponent(orgId)}`;
   const clean = subpath.startsWith('/') ? subpath : `/${subpath}`;
   return `${base}${clean}`;
}
