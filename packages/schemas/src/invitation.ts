import { z } from "zod";
import { membershipRoleSchema } from "./enums";

export const invitationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  email: z.string().email(),
  role: membershipRoleSchema,
  invitedBy: z.string(),
  acceptedBy: z.string().nullable(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Invitation = z.infer<typeof invitationSchema>;

export const createInvitationInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: membershipRoleSchema,
});
export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;

export const acceptInvitationInputSchema = z.object({
  token: z
    .string()
    .length(43)
    .regex(/^[A-Za-z0-9_-]+$/),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>;
