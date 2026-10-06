import type { ApiClient } from '@repo/api-client';
import {
   addIssueRelationResponseSchema,
   apiEnvelopeSchema,
   issueItemSchema,
   issueListResponseSchema,
   issueRelationListSchema,
   lookupIssueResponseSchema,
   removeIssueRelationResponseSchema,
   type AddIssueRelationResponse,
   type IssueItem,
   type IssueListQuery,
   type IssueListResponse,
   type IssueRelation,
   type IssueRelationType,
   type LookupIssueResponse,
   type RemoveIssueRelationResponse,
   type WorkPriority,
} from '@repo/schemas';

const issuesPath = (workspaceId: string) =>
   `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/issues`;

const singleIssuePath = (workspaceId: string, issueId: string) =>
   `${issuesPath(workspaceId)}/${encodeURIComponent(issueId)}`;

const teamIssuesPath = (workspaceId: string, teamId: string) =>
   `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/teams/${encodeURIComponent(teamId)}/issues`;

const issueEnvelopeSchema = apiEnvelopeSchema(issueItemSchema);
const lookupEnvelopeSchema = apiEnvelopeSchema(lookupIssueResponseSchema);
const relationsListEnvelopeSchema = apiEnvelopeSchema(issueRelationListSchema);
const addRelationEnvelopeSchema = apiEnvelopeSchema(addIssueRelationResponseSchema);
const removeRelationEnvelopeSchema = apiEnvelopeSchema(removeIssueRelationResponseSchema);

export interface CreateIssuePayload {
   teamId: string;
   title: string;
   description?: string | null;
   statusId?: string;
   priority?: WorkPriority;
   assigneeId?: string | null;
   projectId?: string | null;
   milestoneId?: string | null;
   cycleId?: string | null;
   parentId?: string | null;
   dueDate?: string | null;
   estimate?: number | null;
   sortOrder?: number;
}

export interface CreateTeamIssuePayload {
   title: string;
   description?: string | null;
   statusId?: string;
   priority?: WorkPriority;
   assigneeId?: string | null;
   projectId?: string | null;
   milestoneId?: string | null;
   cycleId?: string | null;
   parentId?: string | null;
   dueDate?: string | null;
   estimate?: number | null;
   sortOrder?: number;
}

export interface UpdateIssuePayload {
   expectedRevision: number;
   title?: string;
   description?: string | null;
   statusId?: string;
   priority?: WorkPriority;
   assigneeId?: string | null;
   projectId?: string | null;
   cycleId?: string | null;
   dueDate?: string | null;
   estimate?: number | null;
}

export interface TransferIssuePayload {
   expectedRevision: number;
   teamId: string;
   statusId?: string;
   projectId?: string | null;
   milestoneId?: string | null;
   cycleId?: string | null;
}

export interface RelationPayload {
   expectedRevision: number;
   targetIssueId: string;
   type: IssueRelationType;
}

export type CommandOptions = AbortSignal | { signal?: AbortSignal; idempotencyKey?: string };

function commandHeaders(key?: string): HeadersInit {
   return { 'Idempotency-Key': key ?? crypto.randomUUID() };
}

function resolveCommandOptions(
   options?: CommandOptions,
   explicitKey?: string
): { signal?: AbortSignal; headers: HeadersInit } {
   if (options instanceof AbortSignal) {
      return { signal: options, headers: commandHeaders(explicitKey) };
   }
   return {
      signal: options?.signal,
      headers: commandHeaders(options?.idempotencyKey ?? explicitKey),
   };
}

export const issuesApi = {
   list(
      api: ApiClient,
      workspaceId: string,
      query: IssueListQuery = {},
      signal?: AbortSignal
   ): Promise<IssueListResponse> {
      const { limit = 25, lifecycle, cursor, ...rest } = query;
      const params: Record<string, string | number> = {
         limit,
      };

      if (lifecycle) {
         params.lifecycle = lifecycle;
      }

      // Append cursor only when issueCursor is nonempty
      if (cursor && cursor.trim() !== '') {
         params.cursor = cursor.trim();
      }

      for (const [key, value] of Object.entries(rest)) {
         if (value !== undefined && value !== null && value !== '') {
            params[key] = value;
         }
      }

      return api.get(issuesPath(workspaceId), issueListResponseSchema, {
         signal,
         params,
      });
   },

   async create(
      api: ApiClient,
      workspaceId: string,
      payload: CreateIssuePayload,
      options?: CommandOptions,
      explicitKey?: string
   ): Promise<IssueItem> {
      const { signal, headers } = resolveCommandOptions(options, explicitKey);
      const response = await api.post(issuesPath(workspaceId), issueEnvelopeSchema, payload, {
         signal,
         headers,
      });
      return response.data;
   },

   async createTeamIssue(
      api: ApiClient,
      workspaceId: string,
      teamId: string,
      payload: CreateTeamIssuePayload,
      options?: CommandOptions,
      explicitKey?: string
   ): Promise<IssueItem> {
      const { signal, headers } = resolveCommandOptions(options, explicitKey);
      const response = await api.post(
         teamIssuesPath(workspaceId, teamId),
         issueEnvelopeSchema,
         payload,
         { signal, headers }
      );
      return response.data;
   },

   async get(
      api: ApiClient,
      workspaceId: string,
      issueId: string,
      signal?: AbortSignal
   ): Promise<IssueItem> {
      const response = await api.get(singleIssuePath(workspaceId, issueId), issueEnvelopeSchema, {
         signal,
      });
      return response.data;
   },

   async lookup(
      api: ApiClient,
      workspaceId: string,
      identifier: string,
      signal?: AbortSignal
   ): Promise<LookupIssueResponse> {
      const response = await api.get(
         `${issuesPath(workspaceId)}/identifier/${encodeURIComponent(identifier)}`,
         lookupEnvelopeSchema,
         { signal }
      );
      return response.data;
   },

   async update(
      api: ApiClient,
      workspaceId: string,
      issueId: string,
      payload: UpdateIssuePayload,
      options?: CommandOptions,
      explicitKey?: string
   ): Promise<IssueItem> {
      const { signal, headers } = resolveCommandOptions(options, explicitKey);
      const response = await api.patch(
         singleIssuePath(workspaceId, issueId),
         issueEnvelopeSchema,
         payload,
         { signal, headers }
      );
      return response.data;
   },

   async archive(
      api: ApiClient,
      workspaceId: string,
      issueId: string,
      expectedRevision: number,
      options?: CommandOptions,
      explicitKey?: string
   ): Promise<IssueItem> {
      const { signal, headers } = resolveCommandOptions(options, explicitKey);
      const response = await api.post(
         `${singleIssuePath(workspaceId, issueId)}/archive`,
         issueEnvelopeSchema,
         { expectedRevision },
         { signal, headers }
      );
      return response.data;
   },

   async restore(
      api: ApiClient,
      workspaceId: string,
      issueId: string,
      expectedRevision: number,
      options?: CommandOptions,
      explicitKey?: string
   ): Promise<IssueItem> {
      const { signal, headers } = resolveCommandOptions(options, explicitKey);
      const response = await api.post(
         `${singleIssuePath(workspaceId, issueId)}/restore`,
         issueEnvelopeSchema,
         { expectedRevision },
         { signal, headers }
      );
      return response.data;
   },

   async delete(
      api: ApiClient,
      workspaceId: string,
      issueId: string,
      expectedRevision: number,
      options?: CommandOptions,
      explicitKey?: string
   ): Promise<IssueItem> {
      const { signal, headers } = resolveCommandOptions(options, explicitKey);
      const response = await api.delete(
         singleIssuePath(workspaceId, issueId),
         issueEnvelopeSchema,
         { signal, headers, body: { expectedRevision } }
      );
      return response.data;
   },

   async transfer(
      api: ApiClient,
      workspaceId: string,
      issueId: string,
      payload: TransferIssuePayload,
      options?: CommandOptions,
      explicitKey?: string
   ): Promise<IssueItem> {
      const { signal, headers } = resolveCommandOptions(options, explicitKey);
      const response = await api.post(
         `${singleIssuePath(workspaceId, issueId)}/transfer`,
         issueEnvelopeSchema,
         payload,
         { signal, headers }
      );
      return response.data;
   },

   async relations(
      api: ApiClient,
      workspaceId: string,
      issueId: string,
      signal?: AbortSignal
   ): Promise<IssueRelation[]> {
      const response = await api.get(
         `${singleIssuePath(workspaceId, issueId)}/relations`,
         relationsListEnvelopeSchema,
         { signal }
      );
      return response.data;
   },

   async addRelation(
      api: ApiClient,
      workspaceId: string,
      issueId: string,
      payload: RelationPayload,
      options?: CommandOptions,
      explicitKey?: string
   ): Promise<AddIssueRelationResponse> {
      const { signal, headers } = resolveCommandOptions(options, explicitKey);
      const response = await api.post(
         `${singleIssuePath(workspaceId, issueId)}/relations`,
         addRelationEnvelopeSchema,
         payload,
         { signal, headers }
      );
      return response.data;
   },

   async removeRelation(
      api: ApiClient,
      workspaceId: string,
      issueId: string,
      relationId: string,
      expectedRevision: number,
      options?: CommandOptions,
      explicitKey?: string
   ): Promise<RemoveIssueRelationResponse> {
      const { signal, headers } = resolveCommandOptions(options, explicitKey);
      const response = await api.delete(
         `${singleIssuePath(workspaceId, issueId)}/relations/${encodeURIComponent(relationId)}`,
         removeRelationEnvelopeSchema,
         { signal, headers, body: { expectedRevision } }
      );
      return response.data as RemoveIssueRelationResponse;
   },
};
