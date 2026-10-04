import { z } from "zod";
import { issueStatusCategorySchema, workPrioritySchema } from "./enums";
import { userSchema } from "./user";

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
