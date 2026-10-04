import { z } from "zod";
import { userSchema } from "./user";

export const commentSchema = z.object({
  id: z.string(),
  issueId: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  authorId: z.string(),
  author: userSchema.optional(),
  body: z.string().min(1),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Comment = z.infer<typeof commentSchema>;

export const createCommentSchema = z.object({
  issueId: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  body: z.string().min(1).max(50000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
