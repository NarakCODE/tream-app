import { z } from "zod";

export const responseMetaSchema = z.object({
  requestId: z.string().optional(),
  timestamp: z.string().optional(),
});
export type ResponseMeta = z.infer<typeof responseMetaSchema>;

export const cursorPaginationMetaSchema = responseMetaSchema.extend({
  cursor: z.string().nullable().optional(),
  nextCursor: z.string().nullable().optional(),
  hasNext: z.boolean(),
  limit: z.number(),
  total: z.number(),
});
export type CursorPaginationMeta = z.infer<typeof cursorPaginationMetaSchema>;

export function apiEnvelopeSchema<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    data: schema,
    meta: responseMetaSchema.passthrough().optional(),
  });
}

export function paginatedEnvelopeSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    meta: cursorPaginationMetaSchema.passthrough().optional(),
  });
}
