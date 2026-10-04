import type { ApiClient } from '@repo/api-client';
import {
   apiEnvelopeSchema,
   createTeamSchema,
   cursorPaginationMetaSchema,
   issueSchema,
   paginatedEnvelopeSchema,
   teamSchema,
   type CreateTeamInput,
} from '@repo/schemas';
import { z } from 'zod';

export const teamCreationInputSchema = createTeamSchema.extend({
   name: z.string().trim().min(1).max(100),
   key: z
      .string()
      .regex(
         /^[A-Z][A-Z0-9]{1,9}$/,
         'Use 2–10 uppercase letters or numbers, starting with a letter'
      ),
});
export const teamListResponseSchema = paginatedEnvelopeSchema(teamSchema).extend({
   meta: cursorPaginationMetaSchema,
});
// List endpoints return database rows with a status reference rather than an expanded status.
export const teamIssueSchema = issueSchema.omit({ status: true }).extend({ statusId: z.string() });
export const teamIssuesResponseSchema = paginatedEnvelopeSchema(teamIssueSchema).extend({
   meta: cursorPaginationMetaSchema,
});
const teamPath = (workspaceId: string) =>
   `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/teams`;

export const teamsApi = {
   list(api: ApiClient, workspaceId: string, cursor?: string, signal?: AbortSignal) {
      return api.get(teamPath(workspaceId), teamListResponseSchema, {
         signal,
         params: { limit: 50, cursor },
      });
   },
   async create(api: ApiClient, workspaceId: string, input: CreateTeamInput, key: string) {
      return (
         await api.post(
            teamPath(workspaceId),
            apiEnvelopeSchema(teamSchema),
            teamCreationInputSchema.parse(input),
            { headers: { 'Idempotency-Key': key } }
         )
      ).data;
   },
   get(api: ApiClient, workspaceId: string, teamId: string, signal?: AbortSignal) {
      return api
         .get(
            `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}`,
            apiEnvelopeSchema(teamSchema),
            { signal }
         )
         .then((result) => result.data);
   },
   issues(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      cursor?: string,
      signal?: AbortSignal
   ) {
      return api.get(
         `${teamPath(workspaceId)}/${encodeURIComponent(teamId)}/issues`,
         teamIssuesResponseSchema,
         { signal, params: { limit: 50, cursor } }
      );
   },
};
