import { z } from "zod";
import { issueStatusCategorySchema, workPrioritySchema } from "./enums";
import { userSchema } from "./user";
import {
  cursorPaginationMetaSchema,
  paginatedEnvelopeSchema,
} from "./envelope";

export const issueLifecycleSchema = z.enum(["active", "archived", "deleted"]);
export type IssueLifecycle = z.infer<typeof issueLifecycleSchema>;

export const issueItemSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  teamId: z.string(),
  number: z.number().int(),
  identifier: z.string(),
  revision: z.number().int().min(1),
  archivedAt: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  createdById: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  statusId: z.string(),
  priority: workPrioritySchema,
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  cycleId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  estimate: z.number().nullable().optional(),
  sortOrder: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().optional(),
});
export type IssueItem = z.infer<typeof issueItemSchema>;

export const issueListQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  lifecycle: issueLifecycleSchema.optional(),
  teamId: z.string().optional(),
  statusId: z.string().optional(),
  priority: workPrioritySchema.optional(),
  projectId: z.string().optional(),
  cycleId: z.string().optional(),
  assigneeId: z.string().optional(),
  createdById: z.string().optional(),
  parentId: z.string().optional(),
});
export type IssueListQuery = z.infer<typeof issueListQuerySchema>;

export const issueListResponseSchema = paginatedEnvelopeSchema(
  issueItemSchema,
).extend({
  meta: cursorPaginationMetaSchema,
});
export type IssueListResponse = z.infer<typeof issueListResponseSchema>;

export const issueStatusSchema = z.object({
  id: z.string(),
  teamId: z.string().optional(),
  name: z.string(),
  category: issueStatusCategorySchema,
  color: z.string().optional(),
  position: z.number().optional(),
});
export type IssueStatus = z.infer<typeof issueStatusSchema>;

export const issueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  number: z.number().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: workPrioritySchema.default("NO_PRIORITY"),
  status: issueStatusSchema.or(z.string()),
  statusId: z.string().optional(),
  teamId: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  assignee: userSchema.nullable().optional(),
  projectId: z.string().nullable().optional(),
  cycleId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Issue = z.infer<typeof issueSchema>;

// Backend detail reads return database status references, not an expanded status.
export const issueDetailSchema = issueSchema.omit({ status: true }).extend({
  workspaceId: z.string(),
  statusId: z.string(),
  revision: z.number().int().min(1),
});

export const createIssueSchema = z.object({
  title: z.string().min(1).max(255),
  teamId: z.string(),
  description: z.string().optional(),
  priority: workPrioritySchema.optional(),
  statusId: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  cycleId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export const updateIssueSchema = createIssueSchema.partial();
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;

export const issueRelationTypeSchema = z.enum([
  "BLOCKS",
  "RELATED",
  "DUPLICATES",
]);
export type IssueRelationType = z.infer<typeof issueRelationTypeSchema>;

export const issueRelationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  sourceIssueId: z.string(),
  targetIssueId: z.string(),
  type: issueRelationTypeSchema,
  createdById: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
export type IssueRelation = z.infer<typeof issueRelationSchema>;

export const issueRelationListSchema = z.array(issueRelationSchema);
export type IssueRelationList = z.infer<typeof issueRelationListSchema>;

export const addIssueRelationResponseSchema = z.object({
  issue: issueItemSchema,
  relation: issueRelationSchema,
});
export type AddIssueRelationResponse = z.infer<
  typeof addIssueRelationResponseSchema
>;

export type RemoveIssueRelationResponse = {
  issue: IssueItem;
  relationId?: string;
};
export const removeIssueRelationResponseSchema: z.ZodType<
  RemoveIssueRelationResponse,
  z.ZodTypeDef,
  unknown
> = z.preprocess(
  (val) => {
    if (val && typeof val === "object" && !("issue" in val)) {
      return { issue: val, relationId: undefined };
    }
    return val;
  },
  z.object({
    issue: issueItemSchema,
    relationId: z.string().optional(),
  }),
);

export const lookupIssueResponseSchema = issueItemSchema.extend({
  resolvedIdentifier: z.string().optional(),
});
export type LookupIssueResponse = z.infer<typeof lookupIssueResponseSchema>;

export const transferIssueSchema = z.object({
  expectedRevision: z.number().int().min(1),
  teamId: z.string(),
  statusId: z.string().optional(),
  projectId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  cycleId: z.string().nullable().optional(),
});
export type TransferIssueInput = z.infer<typeof transferIssueSchema>;

export const relationInputSchema = z.object({
  expectedRevision: z.number().int().min(1),
  targetIssueId: z.string(),
  type: issueRelationTypeSchema,
});
export type RelationInput = z.infer<typeof relationInputSchema>;

export const revisionInputSchema = z.object({
  expectedRevision: z.number().int().min(1),
});
export type RevisionInput = z.infer<typeof revisionInputSchema>;
