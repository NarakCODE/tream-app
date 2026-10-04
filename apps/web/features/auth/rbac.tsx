'use client';

import * as React from 'react';
import { useActiveWorkspace } from './hooks';
import { hasPermission, type MembershipRole, type WorkspacePermission } from '@repo/schemas';

export interface CanProps {
   do: WorkspacePermission;
   children: React.ReactNode;
   fallback?: React.ReactNode;
}

export interface RequireRoleProps {
   roles: MembershipRole[];
   children: React.ReactNode;
   fallback?: React.ReactNode;
}

/**
 * Returns the current workspace role of the logged in user, or null if unauthenticated.
 */
export function useCurrentRole(): MembershipRole | null {
   const { data } = useActiveWorkspace();
   return (data?.membership?.role as MembershipRole) ?? null;
}

/**
 * React hook checking whether the active user possesses a specific workspace permission.
 */
export function useHasPermission(permission: WorkspacePermission): boolean {
   const role = useCurrentRole();
   return hasPermission(role, permission);
}

/**
 * Declarative component for permission-gated rendering.
 *
 * Example:
 * <Can do="team.manage" fallback={<div>Access denied</div>}>
 *   <TeamSettingsButton />
 * </Can>
 */
export function Can({ do: permission, children, fallback = null }: CanProps) {
   const allowed = useHasPermission(permission);
   if (!allowed) {
      return <>{fallback}</>;
   }
   return <>{children}</>;
}

/**
 * Declarative component for role-gated rendering.
 *
 * Example:
 * <RequireRole roles={['OWNER', 'ADMIN']}>
 *   <DeleteWorkspaceButton />
 * </RequireRole>
 */
export function RequireRole({ roles, children, fallback = null }: RequireRoleProps) {
   const currentRole = useCurrentRole();
   const allowed = currentRole ? roles.includes(currentRole) : false;

   if (!allowed) {
      return <>{fallback}</>;
   }
   return <>{children}</>;
}
