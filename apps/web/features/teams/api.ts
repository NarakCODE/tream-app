import type { ApiClient } from '@repo/api-client';
import { apiEnvelopeSchema } from '@repo/schemas';
import { z } from 'zod';
import {
   addTeamMemberInputSchema,
   createTeamInputSchema,
   createTeamStatusInputSchema,
   reorderTeamStatusesInputSchema,
   retireTeamResponseSchema,
   retireTeamStatusInputSchema,
   retireTeamStatusResponseSchema,
   removeTeamMemberResponseSchema,
   teamListResponseSchema,
   teamMemberSchema,
   teamSchema,
   teamSettingsSchema,
   teamStatusSchema,
   teamIssuesResponseSchema,
   updateTeamInputSchema,
   updateTeamMemberInputSchema,
   updateTeamSettingsInputSchema,
   updateTeamStatusInputSchema,
   type AddTeamMemberInput,
   type CreateTeamInput,
   type CreateTeamStatusInput,
   type ReorderTeamStatusesInput,
   type RetireTeamResponse,
   type RetireTeamStatusInput,
   type RetireTeamStatusResponse,
   type RemoveTeamMemberResponse,
   type Team,
   type TeamIssuesResponse,
   type TeamListResponse,
   type TeamMember,
   type TeamSettings,
   type TeamStatus,
   type UpdateTeamInput,
   type UpdateTeamMemberInput,
   type UpdateTeamSettingsInput,
   type UpdateTeamStatusInput,
} from './types';

export * from './types';
export const teamCreationInputSchema = createTeamInputSchema;

const teamPath = (workspaceId: string) =>
   `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/teams`;

// Centralized Idempotency-Key and Command Dispatcher
function commandHeaders(key?: string): HeadersInit {
   return { 'Idempotency-Key': key ?? crypto.randomUUID() };
}

async function postCommand<T>(
   api: ApiClient,
   path: string,
   schema: z.ZodType<T>,
   body?: unknown,
   key?: string,
   signal?: AbortSignal
): Promise<T> {
   return api.post(path, schema, body, {
      signal,
      headers: commandHeaders(key),
   });
}

async function patchCommand<T>(
   api: ApiClient,
   path: string,
   schema: z.ZodType<T>,
   body?: unknown,
   key?: string,
   signal?: AbortSignal
): Promise<T> {
   return api.patch(path, schema, body, {
      signal,
      headers: commandHeaders(key),
   });
}

async function deleteCommand<T>(
   api: ApiClient,
   path: string,
   schema: z.ZodType<T>,
   key?: string,
   signal?: AbortSignal,
   body?: unknown
): Promise<T> {
   return api.delete(path, schema, {
      signal,
      headers: commandHeaders(key),
      body,
   });
}

export const teamsApi = {
   // 1. List Workspace Teams (GET)
   list(
      api: ApiClient,
      workspaceId: string,
      cursor?: string,
      signal?: AbortSignal,
      limit = 50
   ): Promise<TeamListResponse> {
      return api.get(teamPath(workspaceId), teamListResponseSchema, {
         signal,
         params: { limit, cursor },
      });
   },

   // 2. Create Team (POST)
   async create(
      api: ApiClient,
      workspaceId: string,
      input: CreateTeamInput,
      key?: string,
      signal?: AbortSignal
   ): Promise<Team> {
      const parsed = createTeamInputSchema.parse(input);
      const res = await postCommand(
         api,
         teamPath(workspaceId),
         apiEnvelopeSchema(teamSchema),
         parsed,
         key,
         signal
      );
      return res.data;
   },

   // 3. Get Team (GET)
   async get(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      signal?: AbortSignal
   ): Promise<Team> {
      const res = await api.get(
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}`,
         apiEnvelopeSchema(teamSchema),
         { signal }
      );
      return res.data;
   },

   // 4. Update Team (PATCH)
   async update(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      input: UpdateTeamInput,
      key?: string,
      signal?: AbortSignal
   ): Promise<Team> {
      const parsed = updateTeamInputSchema.parse(input);
      const res = await patchCommand(
         api,
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}`,
         apiEnvelopeSchema(teamSchema),
         parsed,
         key,
         signal
      );
      return res.data;
   },

   // 5. Retire Team (DELETE)
   async retire(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      key?: string,
      signal?: AbortSignal
   ): Promise<RetireTeamResponse> {
      const res = await deleteCommand(
         api,
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}`,
         apiEnvelopeSchema(retireTeamResponseSchema),
         key,
         signal
      );
      return res.data;
   },

   // 6. List Team Members (GET)
   async members(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      signal?: AbortSignal
   ): Promise<TeamMember[]> {
      const res = await api.get(
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/members`,
         apiEnvelopeSchema(z.array(teamMemberSchema)),
         { signal }
      );
      return res.data;
   },

   // 7. Add Team Member (POST)
   async addMember(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      input: AddTeamMemberInput,
      key?: string,
      signal?: AbortSignal
   ): Promise<TeamMember> {
      const parsed = addTeamMemberInputSchema.parse(input);
      const res = await postCommand(
         api,
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/members`,
         apiEnvelopeSchema(teamMemberSchema),
         parsed,
         key,
         signal
      );
      return res.data;
   },

   // 8. Update Team Member Role (PATCH)
   async updateMember(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      membershipId: string,
      input: UpdateTeamMemberInput,
      key?: string,
      signal?: AbortSignal
   ): Promise<TeamMember> {
      const parsed = updateTeamMemberInputSchema.parse(input);
      const res = await patchCommand(
         api,
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/members/${encodeURIComponent(membershipId)}`,
         apiEnvelopeSchema(teamMemberSchema),
         parsed,
         key,
         signal
      );
      return res.data;
   },

   // 9. Remove Team Member (DELETE)
   async removeMember(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      membershipId: string,
      key?: string,
      signal?: AbortSignal
   ): Promise<RemoveTeamMemberResponse> {
      const res = await deleteCommand(
         api,
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/members/${encodeURIComponent(membershipId)}`,
         apiEnvelopeSchema(removeTeamMemberResponseSchema),
         key,
         signal
      );
      return res.data;
   },

   // 10. Get Team Settings (GET)
   async settings(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      signal?: AbortSignal
   ): Promise<TeamSettings> {
      const res = await api.get(
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/settings`,
         apiEnvelopeSchema(teamSettingsSchema),
         { signal }
      );
      return res.data;
   },

   // 11. Update Team Settings (PATCH)
   async updateSettings(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      input: UpdateTeamSettingsInput,
      key?: string,
      signal?: AbortSignal
   ): Promise<Team> {
      const parsed = updateTeamSettingsInputSchema.parse(input);
      const res = await patchCommand(
         api,
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/settings`,
         apiEnvelopeSchema(teamSchema),
         parsed,
         key,
         signal
      );
      return res.data;
   },

   // 12. List Workflow Statuses (GET)
   async statuses(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      signal?: AbortSignal
   ): Promise<TeamStatus[]> {
      const res = await api.get(
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/statuses`,
         apiEnvelopeSchema(z.array(teamStatusSchema)),
         { signal }
      );
      return res.data;
   },

   // 13. Create Workflow Status (POST)
   async createStatus(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      input: CreateTeamStatusInput,
      key?: string,
      signal?: AbortSignal
   ): Promise<TeamStatus> {
      const parsed = createTeamStatusInputSchema.parse(input);
      const res = await postCommand(
         api,
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/statuses`,
         apiEnvelopeSchema(teamStatusSchema),
         parsed,
         key,
         signal
      );
      return res.data;
   },

   // 14. Reorder Workflow Statuses (POST)
   async reorderStatuses(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      input: ReorderTeamStatusesInput,
      key?: string,
      signal?: AbortSignal
   ): Promise<TeamStatus[]> {
      const parsed = reorderTeamStatusesInputSchema.parse(input);
      const res = await postCommand(
         api,
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/statuses/reorder`,
         apiEnvelopeSchema(z.array(teamStatusSchema)),
         parsed,
         key,
         signal
      );
      return res.data;
   },

   // 15. Update Workflow Status (PATCH)
   async updateStatus(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      statusId: string,
      input: UpdateTeamStatusInput,
      key?: string,
      signal?: AbortSignal
   ): Promise<TeamStatus> {
      const parsed = updateTeamStatusInputSchema.parse(input);
      const res = await patchCommand(
         api,
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/statuses/${encodeURIComponent(statusId)}`,
         apiEnvelopeSchema(teamStatusSchema),
         parsed,
         key,
         signal
      );
      return res.data;
   },

   // 16. Set Default Workflow Status (POST)
   async setDefaultStatus(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      statusId: string,
      key?: string,
      signal?: AbortSignal
   ): Promise<TeamStatus> {
      const res = await postCommand(
         api,
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/statuses/${encodeURIComponent(statusId)}/default`,
         apiEnvelopeSchema(teamStatusSchema),
         {},
         key,
         signal
      );
      return res.data;
   },

   // 17. Retire Workflow Status (DELETE)
   async retireStatus(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      statusId: string,
      input?: RetireTeamStatusInput,
      key?: string,
      signal?: AbortSignal
   ): Promise<RetireTeamStatusResponse> {
      const parsed = input ? retireTeamStatusInputSchema.parse(input) : undefined;
      const res = await deleteCommand(
         api,
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/statuses/${encodeURIComponent(statusId)}`,
         apiEnvelopeSchema(retireTeamStatusResponseSchema),
         key,
         signal,
         parsed
      );
      return res.data;
   },

   // 18. Team Issues (GET)
   issues(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      cursor?: string,
      signal?: AbortSignal,
      limit = 50
   ): Promise<TeamIssuesResponse> {
      return api.get(
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/issues`,
         teamIssuesResponseSchema,
         { signal, params: { limit, cursor } }
      );
   },
};
