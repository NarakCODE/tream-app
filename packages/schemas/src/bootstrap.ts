import { z } from "zod";
import { activeWorkspaceResponseSchema, authUserSchema } from "./auth";

export const onboardingNextStepSchema = z.enum([
  "VERIFY_EMAIL",
  "CREATE_WORKSPACE",
  "SELECT_WORKSPACE",
  "CREATE_TEAM",
  "WAIT_FOR_TEAM",
  "INVITE_TEAMMATES",
  "DONE",
]);
export type OnboardingNextStep = z.infer<typeof onboardingNextStepSchema>;

export const onboardingStatusSchema = z.object({
  setupReady: z.boolean(),
  completed: z.boolean(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  nextStep: onboardingNextStepSchema,
});
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const bootstrapResponseSchema = z.object({
  user: authUserSchema,
  activeWorkspace: activeWorkspaceResponseSchema,
  onboarding: onboardingStatusSchema,
});
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
