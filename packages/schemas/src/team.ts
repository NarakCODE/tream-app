import { z } from "zod";
import { teamVisibilitySchema } from "./enums";

export const teamMemberRoleSchema = z.enum(["MEMBER", "ADMIN"]);
export type TeamMemberRole = z.infer<typeof teamMemberRoleSchema>;

export const teamMemberSchema = z.object({
  id: z.string(),
  membershipId: z.string(),
  role: teamMemberRoleSchema,
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const addTeamMemberSchema = z.object({
  membershipId: z.string(),
  role: teamMemberRoleSchema.default("MEMBER"),
});
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;

export const updateTeamMemberSchema = z.object({
  role: teamMemberRoleSchema,
});
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;

export const removeTeamMemberResponseSchema = z.object({
  membershipId: z.string(),
  removed: z.boolean(),
});
export type RemoveTeamMemberResponse = z.infer<
  typeof removeTeamMemberResponseSchema
>;

export const teamSettingsSchema = z.object({
  timezone: z.string(),
  cyclesEnabled: z.boolean(),
  cycleDurationWeeks: z.number().int().min(1).max(8),
  cycleStartDay: z.number().int().min(0).max(6),
  cycleCooldownDays: z.number().int().min(0).max(14),
  upcomingCyclesCount: z.number().int().min(1).max(10),
});
export type TeamSettings = z.infer<typeof teamSettingsSchema>;

export const updateTeamSettingsSchema = teamSettingsSchema.partial();
export type UpdateTeamSettingsInput = z.infer<typeof updateTeamSettingsSchema>;

export const teamStatusCategorySchema = z.enum([
  "BACKLOG",
  "UNSTARTED",
  "STARTED",
  "COMPLETED",
  "CANCELED",
  "DUPLICATE",
]);
export type TeamStatusCategory = z.infer<typeof teamStatusCategorySchema>;

export const teamStatusSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  name: z.string().min(1).max(100),
  category: teamStatusCategorySchema,
  position: z.number().int(),
  isDefault: z.boolean(),
  retiredAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type TeamStatus = z.infer<typeof teamStatusSchema>;

export const createTeamStatusSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: teamStatusCategorySchema,
  position: z.number().int().min(0).max(1000).optional(),
});
export type CreateTeamStatusInput = z.infer<typeof createTeamStatusSchema>;

export const updateTeamStatusSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  category: teamStatusCategorySchema.optional(),
});
export type UpdateTeamStatusInput = z.infer<typeof updateTeamStatusSchema>;

export const reorderTeamStatusesSchema = z.object({
  statusIds: z.array(z.string()),
});
export type ReorderTeamStatusesInput = z.infer<
  typeof reorderTeamStatusesSchema
>;

export const retireTeamStatusSchema = z.object({
  replacementStatusId: z.string().optional(),
});
export type RetireTeamStatusInput = z.infer<typeof retireTeamStatusSchema>;

export const teamSchema = z.object({
  id: z.string(),
  workspaceId: z.string().optional(),
  name: z.string().min(1),
  key: z.string().min(1).max(10),
  description: z.string().nullable().optional(),
  visibility: teamVisibilitySchema,
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  nextIssueNumber: z.number().optional(),
  timezone: z.string().optional(),
  cyclesEnabled: z.boolean().optional(),
  cycleDurationWeeks: z.number().optional(),
  cycleStartDay: z.number().optional(),
  cycleCooldownDays: z.number().optional(),
  upcomingCyclesCount: z.number().optional(),
  retiredAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Team = z.infer<typeof teamSchema>;

export const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  key: z
    .string()
    .regex(
      /^[A-Z][A-Z0-9]{0,9}$/,
      "Key must be uppercase alphanumeric (1-10 chars)",
    ),
  description: z.string().max(2000).optional(),
  visibility: teamVisibilitySchema.optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = createTeamSchema.partial();
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
