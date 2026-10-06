'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { QueryClientContext, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Membership, Workspace } from '@repo/schemas';
import { api } from '@/lib/api';
import { useActiveWorkspace } from '@/features/auth/hooks';
import { authKeys } from '@/features/auth/queries';
import { extractParentIdsFromPath, isUuid, type RouteParentIds } from './domain-url';
import { workspaceBySlugQueryOptions } from './resolver';

export interface WorkspaceContextValue {
   /** The resolved Workspace entity. */
   workspace: Workspace | null;
   /** The workspace UUID required by global backend API endpoints. */
   workspaceId: string;
   /** The org slug or ID present in the dynamic domain URL. */
   orgId: string;
   /** Membership details of current user in this workspace. */
   membership?: Membership;
   /** Extracted parent resource IDs matching the current dynamic route. */
   parentIds: RouteParentIds & { workspaceId: string };
   /** True when the workspace is resolved and actively selected on the backend. */
   isReady: boolean;
   /** Loading state for workspace resolution. */
   isLoading: boolean;
   /** Error state during workspace resolution. */
   error: Error | null;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export interface WorkspaceProviderProps {
   workspace?: Workspace | null;
   workspaceId?: string;
   orgId?: string;
   children: React.ReactNode;
}

export function WorkspaceProvider({
   workspace: initialWorkspace,
   workspaceId: initialWorkspaceId,
   orgId: initialOrgId,
   children,
}: WorkspaceProviderProps) {
   const params = useParams<{
      orgId?: string;
      teamId?: string;
      projectId?: string;
      initiativeId?: string;
      viewId?: string;
      cycleId?: string;
      issueId?: string;
   }>();
   const pathname = usePathname() || '';
   const active = useActiveWorkspace();

   const pathParentIds = useMemo(() => extractParentIdsFromPath(pathname), [pathname]);

   const effectiveOrgId =
      initialOrgId ||
      params?.orgId ||
      pathParentIds.orgId ||
      active.data?.workspace.slug ||
      '';

   const isSlugLookup =
      !initialWorkspace &&
      Boolean(effectiveOrgId) &&
      active.data?.workspace.slug !== effectiveOrgId &&
      active.data?.workspace.id !== effectiveOrgId &&
      !isUuid(effectiveOrgId);

   const slugQuery = useQuery({
      ...workspaceBySlugQueryOptions(api, effectiveOrgId),
      enabled: isSlugLookup,
   });

   const resolvedWorkspace: Workspace | null = useMemo(() => {
      if (initialWorkspace) return initialWorkspace;
      if (
         active.data?.workspace.slug === effectiveOrgId ||
         active.data?.workspace.id === effectiveOrgId
      ) {
         return active.data.workspace;
      }
      if (slugQuery.data) return slugQuery.data;
      return null;
   }, [initialWorkspace, active.data, effectiveOrgId, slugQuery.data]);

   const effectiveWorkspaceId =
      initialWorkspaceId ||
      resolvedWorkspace?.id ||
      (isUuid(effectiveOrgId) ? effectiveOrgId : '') ||
      (active.data?.workspace.slug === effectiveOrgId ? active.data.workspaceId : '') ||
      '';

   const parentIds = useMemo(() => {
      return {
         workspaceId: effectiveWorkspaceId,
         orgId: effectiveOrgId,
         teamId: params?.teamId || pathParentIds.teamId,
         projectId: params?.projectId || pathParentIds.projectId,
         initiativeId: params?.initiativeId || pathParentIds.initiativeId,
         viewId: params?.viewId || pathParentIds.viewId,
         cycleId: params?.cycleId || pathParentIds.cycleId,
         issueId: params?.issueId || pathParentIds.issueId,
      };
   }, [effectiveWorkspaceId, effectiveOrgId, params, pathParentIds]);

   const membership =
      active.data?.workspaceId === effectiveWorkspaceId ? active.data.membership : undefined;

   const isReady = Boolean(
      effectiveWorkspaceId && active.data?.workspaceId === effectiveWorkspaceId
   );
   const isLoading =
      (!resolvedWorkspace && active.isLoading) || (isSlugLookup && slugQuery.isLoading);
   const error =
      active.error instanceof Error
         ? active.error
         : slugQuery.error instanceof Error
           ? slugQuery.error
           : null;

   const contextValue: WorkspaceContextValue = useMemo(
      () => ({
         workspace: resolvedWorkspace,
         workspaceId: effectiveWorkspaceId,
         orgId: effectiveOrgId,
         membership,
         parentIds,
         isReady,
         isLoading,
         error,
      }),
      [
         resolvedWorkspace,
         effectiveWorkspaceId,
         effectiveOrgId,
         membership,
         parentIds,
         isReady,
         isLoading,
         error,
      ]
   );

   return <WorkspaceContext.Provider value={contextValue}>{children}</WorkspaceContext.Provider>;
}

/**
 * Access the full Workspace Context. Returns null if rendered outside WorkspaceProvider.
 */
export function useWorkspaceContext(): WorkspaceContextValue | null {
   return useContext(WorkspaceContext);
}

/**
 * Resolves the parent `workspaceId` UUID for matching global API endpoints.
 *
 * Checks in order:
 * 1. Explicit `explicitWorkspaceId` argument if provided.
 * 2. Active `WorkspaceContext` from `WorkspaceProvider`.
 * 3. Route `params.orgId` if formatted as UUID.
 * 4. Currently selected active workspace from query cache.
 */
export function useWorkspaceId(explicitWorkspaceId?: string): string {
   const context = useContext(WorkspaceContext);
   const client = useContext(QueryClientContext);
   const params = useParams<{ orgId?: string }>();

   if (explicitWorkspaceId) return explicitWorkspaceId;
   if (context?.workspaceId) return context.workspaceId;

   const active = client?.getQueryData<{ workspaceId?: string; workspace?: { id?: string; slug?: string } }>(
      authKeys.activeWorkspace()
   );
   if (active?.workspaceId) return active.workspaceId;

   if (params?.orgId && isUuid(params.orgId)) return params.orgId;

   return '';
}

/**
 * Returns current workspace entity and status driven by dynamic domain URL.
 */
export function useCurrentWorkspace() {
   const context = useContext(WorkspaceContext);
   const active = useActiveWorkspace();
   const fallbackId = useWorkspaceId();

   return {
      workspace: context?.workspace ?? active.data?.workspace ?? null,
      workspaceId: context?.workspaceId || fallbackId,
      orgId: context?.orgId || active.data?.workspace.slug || '',
      membership: context?.membership ?? active.data?.membership,
      isReady: context?.isReady ?? (Boolean(fallbackId) && active.data?.workspaceId === fallbackId),
      isLoading: context?.isLoading ?? active.isLoading,
      error: context?.error ?? (active.error instanceof Error ? active.error : null),
   };
}

/**
 * Extracts route-driven parent IDs (workspaceId, teamId, projectId, etc.) from the URL.
 */
export function useParentIds(): RouteParentIds & { workspaceId: string } {
   const context = useContext(WorkspaceContext);
   const params = useParams<{
      orgId?: string;
      teamId?: string;
      projectId?: string;
      initiativeId?: string;
      viewId?: string;
      cycleId?: string;
      issueId?: string;
   }>();
   const pathname = usePathname() || '';
   const pathParentIds = useMemo(() => extractParentIdsFromPath(pathname), [pathname]);
   const fallbackWorkspaceId = useWorkspaceId();

   if (context?.parentIds) return context.parentIds;

   return {
      workspaceId: fallbackWorkspaceId,
      orgId: params?.orgId || pathParentIds.orgId,
      teamId: params?.teamId || pathParentIds.teamId,
      projectId: params?.projectId || pathParentIds.projectId,
      initiativeId: params?.initiativeId || pathParentIds.initiativeId,
      viewId: params?.viewId || pathParentIds.viewId,
      cycleId: params?.cycleId || pathParentIds.cycleId,
      issueId: params?.issueId || pathParentIds.issueId,
   };
}

/**
 * Hook providing dynamic domain URL information and path generation helpers.
 */
export function useDomainUrl() {
   const { orgId, workspaceId } = useCurrentWorkspace();
   const parentIds = useParentIds();
   const pathname = usePathname() || '';

   const buildPath = useMemo(
      () => (subpath: string) => {
         const cleanOrg = orgId || 'lndev-ui';
         const cleanPath = subpath.startsWith('/') ? subpath : `/${subpath}`;
         return `/${encodeURIComponent(cleanOrg)}${cleanPath}`;
      },
      [orgId]
   );

   return {
      orgId,
      workspaceId,
      parentIds,
      pathname,
      buildPath,
   };
}
