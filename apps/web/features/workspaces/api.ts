import type { ApiClient } from '@repo/api-client';
import {
   acceptInvitationInputSchema,
   activeWorkspaceResponseSchema,
   apiEnvelopeSchema,
   createInvitationInputSchema,
   createWorkspaceInputSchema,
   cursorPaginationMetaSchema,
   invitationSchema,
   membershipSchema,
   paginatedEnvelopeSchema,
   updateMembershipInputSchema,
   updateWorkspaceInputSchema,
   updateWorkspacePreferencesInputSchema,
   workspaceDeleteResponseSchema,
   workspacePageQuerySchema,
   workspacePreferencesSchema,
   workspaceSchema,
   workspaceSelectionResponseSchema,
   type CreateInvitationInput,
   type CreateWorkspaceInput,
   type UpdateMembershipInput,
   type UpdateWorkspaceInput,
   type UpdateWorkspacePreferencesInput,
   type Workspace,
   type WorkspacePreferences,
} from '@repo/schemas';
import type { z } from 'zod';

export const workspaceListResponseSchema = paginatedEnvelopeSchema(workspaceSchema).extend({
   meta: cursorPaginationMetaSchema,
});

export const workspaceMemberListResponseSchema = paginatedEnvelopeSchema(membershipSchema).extend({
   meta: cursorPaginationMetaSchema,
});

export const workspaceInvitationListResponseSchema = paginatedEnvelopeSchema(
   invitationSchema
).extend({
   meta: cursorPaginationMetaSchema,
});

export type WorkspaceListResponse = z.infer<typeof workspaceListResponseSchema>;
export type WorkspaceMemberListResponse = z.infer<typeof workspaceMemberListResponseSchema>;
export type WorkspaceInvitationListResponse = z.infer<typeof workspaceInvitationListResponseSchema>;

export interface WorkspacePageOptions {
   cursor?: string;
   limit?: number;
   signal?: AbortSignal;
   cache?: RequestCache;
}

function commandHeaders(key: string): HeadersInit {
   return { 'Idempotency-Key': key };
}

const workspacePath = (workspaceId: string) =>
   `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;

export const workspacesApi = {
   list(api: ApiClient, options: WorkspacePageOptions = {}) {
      const params = workspacePageQuerySchema.parse(options);
      return api.get('/api/v1/workspaces', workspaceListResponseSchema, {
         signal: options.signal,
         cache: options.cache,
         params,
      });
   },

   async active(api: ApiClient, signal?: AbortSignal) {
      const response = await api.get(
         '/api/v1/workspaces/active',
         apiEnvelopeSchema(activeWorkspaceResponseSchema),
         {
            signal,
            cache: 'no-store',
         }
      );
      return response.data;
   },

   async get(api: ApiClient, workspaceId: string, signal?: AbortSignal): Promise<Workspace> {
      const response = await api.get(
         workspacePath(workspaceId),
         apiEnvelopeSchema(workspaceSchema),
         { signal }
      );
      return response.data;
   },

   async create(api: ApiClient, input: CreateWorkspaceInput, key: string): Promise<Workspace> {
      const response = await api.post(
         '/api/v1/workspaces',
         apiEnvelopeSchema(workspaceSchema),
         createWorkspaceInputSchema.parse(input),
         { headers: commandHeaders(key) }
      );
      return response.data;
   },

   async update(
      api: ApiClient,
      workspaceId: string,
      input: UpdateWorkspaceInput,
      key: string
   ): Promise<Workspace> {
      const response = await api.patch(
         workspacePath(workspaceId),
         apiEnvelopeSchema(workspaceSchema),
         updateWorkspaceInputSchema.parse(input),
         { headers: commandHeaders(key) }
      );
      return response.data;
   },

   async remove(api: ApiClient, workspaceId: string, key: string) {
      const response = await api.delete(
         workspacePath(workspaceId),
         apiEnvelopeSchema(workspaceDeleteResponseSchema),
         { headers: commandHeaders(key) }
      );
      return response.data;
   },

   async select(api: ApiClient, workspaceId: string, key: string) {
      const response = await api.post(
         `${workspacePath(workspaceId)}/select`,
         apiEnvelopeSchema(workspaceSelectionResponseSchema),
         undefined,
         { headers: commandHeaders(key) }
      );
      return response.data;
   },

   async leave(api: ApiClient, workspaceId: string, key: string) {
      const response = await api.post(
         `${workspacePath(workspaceId)}/leave`,
         apiEnvelopeSchema(membershipSchema),
         undefined,
         { headers: commandHeaders(key) }
      );
      return response.data;
   },

   members(api: ApiClient, workspaceId: string, options: WorkspacePageOptions = {}) {
      const params = workspacePageQuerySchema.parse(options);
      return api.get(`${workspacePath(workspaceId)}/members`, workspaceMemberListResponseSchema, {
         signal: options.signal,
         cache: options.cache,
         params,
      });
   },

   async updateMember(
      api: ApiClient,
      workspaceId: string,
      membershipId: string,
      input: UpdateMembershipInput,
      key: string
   ) {
      const response = await api.patch(
         `${workspacePath(workspaceId)}/members/${encodeURIComponent(membershipId)}`,
         apiEnvelopeSchema(membershipSchema),
         updateMembershipInputSchema.parse(input),
         { headers: commandHeaders(key) }
      );
      return response.data;
   },

   async removeMember(api: ApiClient, workspaceId: string, membershipId: string, key: string) {
      const response = await api.delete(
         `${workspacePath(workspaceId)}/members/${encodeURIComponent(membershipId)}`,
         apiEnvelopeSchema(membershipSchema),
         { headers: commandHeaders(key) }
      );
      return response.data;
   },

   invitations(api: ApiClient, workspaceId: string, options: WorkspacePageOptions = {}) {
      const params = workspacePageQuerySchema.parse(options);
      return api.get(
         `${workspacePath(workspaceId)}/invitations`,
         workspaceInvitationListResponseSchema,
         {
            signal: options.signal,
            cache: options.cache,
            params,
         }
      );
   },

   async invite(api: ApiClient, workspaceId: string, input: CreateInvitationInput, key: string) {
      const response = await api.post(
         `${workspacePath(workspaceId)}/invitations`,
         apiEnvelopeSchema(invitationSchema),
         createInvitationInputSchema.parse(input),
         { headers: commandHeaders(key) }
      );
      return response.data;
   },

   async acceptInvitation(api: ApiClient, token: string, key: string) {
      const response = await api.post(
         '/api/v1/workspaces/invitations/accept',
         apiEnvelopeSchema(membershipSchema),
         acceptInvitationInputSchema.parse({ token }),
         { headers: commandHeaders(key) }
      );
      return response.data;
   },

   async revokeInvitation(api: ApiClient, workspaceId: string, invitationId: string, key: string) {
      const response = await api.delete(
         `${workspacePath(workspaceId)}/invitations/${encodeURIComponent(invitationId)}`,
         apiEnvelopeSchema(invitationSchema),
         { headers: commandHeaders(key) }
      );
      return response.data;
   },

   async preferences(
      api: ApiClient,
      workspaceId: string,
      signal?: AbortSignal
   ): Promise<WorkspacePreferences> {
      const response = await api.get(
         `${workspacePath(workspaceId)}/preferences`,
         apiEnvelopeSchema(workspacePreferencesSchema),
         { signal }
      );
      return response.data;
   },

   async updatePreferences(
      api: ApiClient,
      workspaceId: string,
      input: UpdateWorkspacePreferencesInput,
      key: string
   ): Promise<WorkspacePreferences> {
      const response = await api.patch(
         `${workspacePath(workspaceId)}/preferences`,
         apiEnvelopeSchema(workspacePreferencesSchema),
         updateWorkspacePreferencesInputSchema.parse(input),
         { headers: commandHeaders(key) }
      );
      return response.data;
   },
};
