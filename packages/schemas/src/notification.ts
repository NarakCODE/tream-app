import { z } from "zod";

const timestamp = z.string().datetime({ offset: true });
export const notificationStatusSchema = z.enum([
  "inbox",
  "archived",
  "snoozed",
  "all",
]);
export const notificationKindSchema = z.enum([
  "ASSIGNMENT",
  "MENTION",
  "SUBSCRIPTION",
  "PLANNING_UPDATE",
]);
export const notificationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  recipientMembershipId: z.string(),
  actorMembershipId: z.string().nullable(),
  eventId: z.string(),
  kind: notificationKindSchema,
  issueId: z.string().nullable(),
  projectId: z.string().nullable(),
  initiativeId: z.string().nullable(),
  documentId: z.string().nullable(),
  revision: z.number().int().min(1),
  readAt: timestamp.nullable(),
  archivedAt: timestamp.nullable(),
  snoozedUntil: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const notificationListQuerySchema = z.object({
  status: notificationStatusSchema.default("inbox"),
  unread: z.enum(["true", "false"]).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().max(1024).optional(),
});
export const notificationCursorPageSchema = z.object({
  paginationType: z.literal("cursor"),
  items: z.array(notificationSchema),
  total: z.number().int().min(0),
  limit: z.number().int(),
  cursor: z.string().nullable(),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});
export const notificationPreferencesSchema = z.object({
  id: z.string().optional(),
  workspaceId: z.string(),
  recipientMembershipId: z.string(),
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  revision: z.number().int().min(0),
  createdAt: timestamp.optional(),
  updatedAt: timestamp.optional(),
});
const revision = z.object({ expectedRevision: z.number().int().min(1) });
export const notificationReadInputSchema = revision.extend({
  read: z.boolean(),
});
export const notificationArchiveInputSchema = revision.extend({
  archived: z.boolean(),
});
export const notificationSnoozeInputSchema = revision
  .extend({ snoozedUntil: timestamp.nullable() })
  .superRefine((input, ctx) => {
    if (input.snoozedUntil === null) return;
    const value = Date.parse(input.snoozedUntil);
    if (value <= Date.now() || value > Date.now() + 90 * 86400000)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["snoozedUntil"],
        message: "Choose a future time within 90 days.",
      });
  });
export const notificationPreferencesInputSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    inAppEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.inAppEnabled !== undefined || input.emailEnabled !== undefined,
    "Supply at least one notification channel.",
  );
export const notificationDeliveryStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "SENDING",
  "FAILED",
  "SUCCEEDED",
  "UNKNOWN",
  "SUPPRESSED",
  "DEAD",
]);
export const notificationDeliverySchema = z.object({
  id: z.string(),
  status: notificationDeliveryStatusSchema,
  attemptCount: z.number().int().min(0),
  lastErrorCode: z.string().nullable(),
  sentAt: timestamp.nullable(),
});
export const notificationRetryInputSchema = z.object({
  acknowledgePossibleDuplicate: z.boolean(),
});
export const notificationRetryResultSchema = z.object({
  id: z.string(),
  status: z.literal("PENDING"),
});
export const notificationActorSchema = z
  .object({
    membershipId: z.string(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
  })
  .nullable();
export const notificationUnreadCountSchema = z.object({
  unreadCount: z.number().int().min(0),
});
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type NotificationCursorPage = z.infer<
  typeof notificationCursorPageSchema
>;
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;
export type NotificationPreferencesInput = z.infer<
  typeof notificationPreferencesInputSchema
>;
export type NotificationReadInput = z.infer<typeof notificationReadInputSchema>;
export type NotificationArchiveInput = z.infer<
  typeof notificationArchiveInputSchema
>;
export type NotificationSnoozeInput = z.infer<
  typeof notificationSnoozeInputSchema
>;
export type NotificationDelivery = z.infer<typeof notificationDeliverySchema>;
export type NotificationActor = z.infer<typeof notificationActorSchema>;
export type NotificationRetryInput = z.infer<
  typeof notificationRetryInputSchema
>;
