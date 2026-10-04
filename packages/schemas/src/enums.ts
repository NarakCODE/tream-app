import { z } from "zod";

export const workPrioritySchema = z.enum([
  "NO_PRIORITY",
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);
export type WorkPriority = z.infer<typeof workPrioritySchema>;

export const issueStatusCategorySchema = z.enum([
  "BACKLOG",
  "UNSTARTED",
  "STARTED",
  "COMPLETED",
  "CANCELED",
  "DUPLICATE",
]);
export type IssueStatusCategory = z.infer<typeof issueStatusCategorySchema>;

export const projectStatusSchema = z.enum([
  "PLANNED",
  "STARTED",
  "PAUSED",
  "COMPLETED",
  "CANCELED",
]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const membershipRoleSchema = z.enum([
  "OWNER",
  "ADMIN",
  "MEMBER",
  "GUEST",
]);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const teamVisibilitySchema = z.enum(["WORKSPACE", "PRIVATE"]);
export type TeamVisibility = z.infer<typeof teamVisibilitySchema>;

export const cycleStatusSchema = z.enum(["UPCOMING", "ACTIVE", "COMPLETED"]);
export type CycleStatus = z.infer<typeof cycleStatusSchema>;
