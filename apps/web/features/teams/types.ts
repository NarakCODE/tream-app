import { z } from 'zod';
import {
   cursorPaginationMetaSchema,
   paginatedEnvelopeSchema,
   issueItemSchema,
   issueListResponseSchema,
   type IssueItem,
   type IssueListResponse,
} from '@repo/schemas';

// Enums
export const teamVisibilitySchema = z.enum(['WORKSPACE', 'PRIVATE']);
export type TeamVisibility = z.infer<typeof teamVisibilitySchema>;

export const teamMemberRoleSchema = z.enum(['ADMIN', 'MEMBER']);
export type TeamMemberRole = z.infer<typeof teamMemberRoleSchema>;

export const teamStatusCategorySchema = z.enum([
   'BACKLOG',
   'UNSTARTED',
   'STARTED',
   'COMPLETED',
   'CANCELED',
   'DUPLICATE',
]);
export type TeamStatusCategory = z.infer<typeof teamStatusCategorySchema>;

// Request Body Schemas & DTOs
export const createTeamInputSchema = z.object({
   name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name must be at most 100 characters'),
   key: z
      .string()
      .trim()
      .regex(
         /^[A-Z][A-Z0-9]{1,9}$/,
         'Key must be 2–10 uppercase alphanumeric characters starting with a letter'
      ),
   description: z.string().max(2000, 'Description must be at most 2000 characters').optional().nullable(),
   visibility: teamVisibilitySchema.optional().default('WORKSPACE'),
});
export type CreateTeamInput = z.infer<typeof createTeamInputSchema>;

export const updateTeamInputSchema = z.object({
   name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name must be at most 100 characters')
      .optional(),
   description: z.string().max(2000, 'Description must be at most 2000 characters').optional().nullable(),
   visibility: teamVisibilitySchema.optional(),
});
export type UpdateTeamInput = z.infer<typeof updateTeamInputSchema>;

export const addTeamMemberInputSchema = z.object({
   membershipId: z.string().min(1, 'Invalid membership ID'),
   role: teamMemberRoleSchema.optional().default('MEMBER'),
});
export type AddTeamMemberInput = z.infer<typeof addTeamMemberInputSchema>;

export const updateTeamMemberInputSchema = z.object({
   role: teamMemberRoleSchema,
});
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberInputSchema>;

export const updateTeamSettingsInputSchema = z
   .object({
      timezone: z
         .string()
         .min(1, 'Timezone is required')
         .refine(
            (tz) => {
               try {
                  new Intl.DateTimeFormat('en', { timeZone: tz });
                  return true;
               } catch {
                  return false;
               }
            },
            { message: 'Invalid IANA timezone identifier' }
         )
         .optional(),
      cyclesEnabled: z.boolean().optional(),
      cycleDurationWeeks: z.number().int().min(1, 'Min 1 week').max(8, 'Max 8 weeks').optional(),
      cycleStartDay: z.number().int().min(0, 'Day must be 0–6').max(6, 'Day must be 0–6').optional(),
      cycleCooldownDays: z.number().int().min(0, 'Min 0 days').max(14, 'Max 14 days').optional(),
      upcomingCyclesCount: z.number().int().min(1, 'Min 1 cycle').max(10, 'Max 10 cycles').optional(),
   })
   .refine(
      (data) => {
         if (data.cycleDurationWeeks !== undefined && data.cycleCooldownDays !== undefined) {
            return data.cycleCooldownDays < data.cycleDurationWeeks * 7;
         }
         return true;
      },
      {
         message: 'Cooldown days must be strictly less than cycle duration in days',
         path: ['cycleCooldownDays'],
      }
   );
export type UpdateTeamSettingsInput = z.infer<typeof updateTeamSettingsInputSchema>;

export const createTeamStatusInputSchema = z.object({
   name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name must be at most 100 characters'),
   category: teamStatusCategorySchema,
   position: z.number().int().min(0, 'Position must be 0 or greater').optional(),
});
export type CreateTeamStatusInput = z.infer<typeof createTeamStatusInputSchema>;

export const reorderTeamStatusesInputSchema = z.object({
   statusIds: z.array(z.string().min(1)).min(1, 'Provide at least one status ID'),
});
export type ReorderTeamStatusesInput = z.infer<typeof reorderTeamStatusesInputSchema>;

export const updateTeamStatusInputSchema = z.object({
   name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name must be at most 100 characters')
      .optional(),
   category: teamStatusCategorySchema.optional(),
});
export type UpdateTeamStatusInput = z.infer<typeof updateTeamStatusInputSchema>;

export const retireTeamStatusInputSchema = z.object({
   replacementStatusId: z.string().min(1).optional(),
});
export type RetireTeamStatusInput = z.infer<typeof retireTeamStatusInputSchema>;

// Entity Schemas
export const teamSchema = z.object({
   id: z.string(),
   workspaceId: z.string().optional(),
   name: z.string(),
   key: z.string(),
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

export const teamMemberSchema = z.object({
   id: z.string(),
   workspaceId: z.string().optional(),
   teamId: z.string().optional(),
   membershipId: z.string(),
   role: teamMemberRoleSchema,
   createdAt: z.string().optional(),
   updatedAt: z.string().optional(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamSettingsSchema = z.object({
   timezone: z.string(),
   cyclesEnabled: z.boolean(),
   cycleDurationWeeks: z.number(),
   cycleStartDay: z.number(),
   cycleCooldownDays: z.number(),
   upcomingCyclesCount: z.number(),
});
export type TeamSettings = z.infer<typeof teamSettingsSchema>;

export const teamStatusSchema = z.object({
   id: z.string(),
   teamId: z.string(),
   name: z.string(),
   category: teamStatusCategorySchema,
   position: z.number(),
   isDefault: z.boolean(),
   retiredAt: z.string().nullable().optional(),
   createdAt: z.string().optional(),
   updatedAt: z.string().optional(),
});
export type TeamStatus = z.infer<typeof teamStatusSchema>;

export const retireTeamResponseSchema = z.object({
   id: z.string(),
   retiredAt: z.string().nullable().optional(),
   updatedAt: z.string().optional(),
});
export type RetireTeamResponse = z.infer<typeof retireTeamResponseSchema>;

export const removeTeamMemberResponseSchema = z.object({
   membershipId: z.string(),
   removed: z.literal(true),
});
export type RemoveTeamMemberResponse = z.infer<typeof removeTeamMemberResponseSchema>;

export const retireTeamStatusResponseSchema = z.object({
   id: z.string(),
   isDefault: z.boolean().optional(),
   retiredAt: z.string().nullable().optional(),
   updatedAt: z.string().optional(),
});
export type RetireTeamStatusResponse = z.infer<typeof retireTeamStatusResponseSchema>;

export const teamListResponseSchema = paginatedEnvelopeSchema(teamSchema).extend({
   meta: cursorPaginationMetaSchema,
});
export type TeamListResponse = z.infer<typeof teamListResponseSchema>;

export const teamIssueSchema = issueItemSchema;
export type TeamIssue = IssueItem;

export const teamIssuesResponseSchema = issueListResponseSchema;
export type TeamIssuesResponse = IssueListResponse;
