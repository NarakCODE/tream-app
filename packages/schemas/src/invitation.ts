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

export const createInvitationInputSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.literal("MEMBER"),
});

export const acceptInvitationInputSchema = z.object({
  token: z
    .string()
    .length(43)
    .regex(/^[A-Za-z0-9_-]+$/),
});
