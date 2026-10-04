import { z } from "zod";
import { membershipSchema } from "./membership";
import { workspaceSchema } from "./workspace";

const emailSchema = z
  .string()
  .email("Please enter a valid email address")
  .max(254);
const passwordSchema = z.string().min(12).max(256);
const tokenSchema = z
  .string()
  .min(32)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);

export const authUserSchema = z.object({
  id: z.string(),
  email: emailSchema,
  fullName: z.string().min(1).max(120),
  avatarUrl: z.string().nullable(),
  emailVerified: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const emailInputSchema = z.object({ email: emailSchema });
export type EmailInput = z.infer<typeof emailInputSchema>;

export const loginInputSchema = emailInputSchema.extend({
  password: z.string().min(1).max(256),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const signupInputSchema = emailInputSchema.extend({
  password: passwordSchema,
  fullName: z.string().min(1).max(120),
});
export type SignupInput = z.infer<typeof signupInputSchema>;

export const tokenInputSchema = z.object({ token: tokenSchema });
export type TokenInput = z.infer<typeof tokenInputSchema>;

export const resetPasswordInputSchema = tokenInputSchema.extend({
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export const profileInputSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Full name cannot be empty")
    .max(120, "Full name cannot exceed 120 characters"),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const authResponseSchema = z.object({
  user: authUserSchema,
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string().optional(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const authMessageSchema = z.object({ message: z.string() });
export type AuthMessage = z.infer<typeof authMessageSchema>;

export const authSessionSchema = z.object({
  id: z.string(),
  expiresAt: z.string().datetime({ offset: true }),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

export const activeWorkspaceResponseSchema = z
  .object({
    workspaceId: z.string(),
    workspace: workspaceSchema,
    membership: membershipSchema,
  })
  .nullable();
export type ActiveWorkspaceResponse = z.infer<
  typeof activeWorkspaceResponseSchema
>;
