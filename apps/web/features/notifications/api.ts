import type { ApiClient } from '@repo/api-client';
import {
   apiEnvelopeSchema,
   paginatedEnvelopeSchema,
   cursorPaginationMetaSchema,
   notificationSchema,
   notificationPreferencesSchema,
   notificationDeliverySchema,
   notificationActorSchema,
   notificationUnreadCountSchema,
   notificationRetryResultSchema,
   notificationReadInputSchema,
   notificationArchiveInputSchema,
   notificationSnoozeInputSchema,
   notificationPreferencesInputSchema,
   notificationRetryInputSchema,
   notificationListQuerySchema,
   issueDetailSchema,
   projectDetailSchema,
   initiativeSchema,
   documentSchema,
   type NotificationListQuery,
   type NotificationCursorPage,
   type NotificationReadInput,
   type NotificationArchiveInput,
   type NotificationSnoozeInput,
   type NotificationPreferencesInput,
   type NotificationRetryInput,
   type Notification,
} from '@repo/schemas';
import { z } from 'zod';

const path = (w: string) => `/api/v1/workspaces/${encodeURIComponent(w)}/notifications`;
const itemPath = (w: string, id: string) => `${path(w)}/${encodeURIComponent(id)}`;
const listEnvelope = paginatedEnvelopeSchema(notificationSchema).extend({
   meta: cursorPaginationMetaSchema,
});
const command = (key: string) => ({ headers: { 'Idempotency-Key': key } });

export type NotificationTarget = {
   type: 'issue' | 'project' | 'initiative' | 'document';
   id: string;
   title: string;
   identifier?: string;
   description?: string | null;
};
export function targetOf(notification: Notification) {
   if (notification.issueId) return { type: 'issue' as const, id: notification.issueId };
   if (notification.projectId) return { type: 'project' as const, id: notification.projectId };
   if (notification.initiativeId)
      return { type: 'initiative' as const, id: notification.initiativeId };
   if (notification.documentId) return { type: 'document' as const, id: notification.documentId };
   return null;
}

export const notificationsApi = {
   async list(
      api: ApiClient,
      w: string,
      filters: NotificationListQuery,
      signal?: AbortSignal
   ): Promise<NotificationCursorPage> {
      const result = await api.get(path(w), listEnvelope, {
         signal,
         params: notificationListQuerySchema.parse(filters),
      });
      return {
         paginationType: 'cursor',
         items: result.data,
         total: result.meta.total,
         limit: result.meta.limit,
         cursor: result.meta.cursor ?? null,
         hasNext: result.meta.hasNext,
         nextCursor: result.meta.nextCursor ?? null,
      };
   },
   async get(api: ApiClient, w: string, id: string, signal?: AbortSignal) {
      return (await api.get(itemPath(w, id), apiEnvelopeSchema(notificationSchema), { signal }))
         .data;
   },
   async unreadCount(api: ApiClient, w: string, signal?: AbortSignal) {
      return (
         await api.get(
            `${path(w)}/unread-count`,
            apiEnvelopeSchema(notificationUnreadCountSchema),
            { signal }
         )
      ).data;
   },
   async preferences(api: ApiClient, w: string, signal?: AbortSignal) {
      return (
         await api.get(`${path(w)}/preferences`, apiEnvelopeSchema(notificationPreferencesSchema), {
            signal,
         })
      ).data;
   },
   async read(api: ApiClient, w: string, id: string, input: NotificationReadInput, key: string) {
      return (
         await api.patch(
            `${itemPath(w, id)}/read`,
            apiEnvelopeSchema(notificationSchema),
            notificationReadInputSchema.parse(input),
            command(key)
         )
      ).data;
   },
   async archive(
      api: ApiClient,
      w: string,
      id: string,
      input: NotificationArchiveInput,
      key: string
   ) {
      return (
         await api.patch(
            `${itemPath(w, id)}/archive`,
            apiEnvelopeSchema(notificationSchema),
            notificationArchiveInputSchema.parse(input),
            command(key)
         )
      ).data;
   },
   async snooze(
      api: ApiClient,
      w: string,
      id: string,
      input: NotificationSnoozeInput,
      key: string
   ) {
      return (
         await api.patch(
            `${itemPath(w, id)}/snooze`,
            apiEnvelopeSchema(notificationSchema),
            notificationSnoozeInputSchema.parse(input),
            command(key)
         )
      ).data;
   },
   async updatePreferences(
      api: ApiClient,
      w: string,
      input: NotificationPreferencesInput,
      key: string
   ) {
      return (
         await api.patch(
            `${path(w)}/preferences`,
            apiEnvelopeSchema(notificationPreferencesSchema),
            notificationPreferencesInputSchema.parse(input),
            command(key)
         )
      ).data;
   },
   async actor(api: ApiClient, w: string, id: string, signal?: AbortSignal) {
      return (
         await api.get(`${itemPath(w, id)}/actor`, apiEnvelopeSchema(notificationActorSchema), {
            signal,
         })
      ).data;
   },
   async deliveries(api: ApiClient, w: string, id: string, signal?: AbortSignal) {
      return (
         await api.get(
            `${itemPath(w, id)}/deliveries`,
            apiEnvelopeSchema(z.array(notificationDeliverySchema)),
            { signal }
         )
      ).data;
   },
   async retryDelivery(
      api: ApiClient,
      w: string,
      id: string,
      input: NotificationRetryInput,
      key: string
   ) {
      return (
         await api.post(
            `${itemPath(w, id)}/deliveries/retry`,
            apiEnvelopeSchema(notificationRetryResultSchema),
            notificationRetryInputSchema.parse(input),
            command(key)
         )
      ).data;
   },
   async target(
      api: ApiClient,
      w: string,
      target: NonNullable<ReturnType<typeof targetOf>>,
      signal?: AbortSignal
   ): Promise<NotificationTarget> {
      const resourcePath = `/api/v1/workspaces/${encodeURIComponent(w)}/${target.type === 'issue' ? 'issues' : target.type === 'project' ? 'projects' : target.type === 'initiative' ? 'initiatives' : 'documents'}/${encodeURIComponent(target.id)}`;
      if (target.type === 'issue') {
         const entity = (
            await api.get(resourcePath, apiEnvelopeSchema(issueDetailSchema), { signal })
         ).data;
         return {
            ...target,
            title: entity.title,
            identifier: entity.identifier,
            description: entity.description,
         };
      }
      if (target.type === 'project') {
         const entity = (
            await api.get(resourcePath, apiEnvelopeSchema(projectDetailSchema), { signal })
         ).data;
         return { ...target, title: entity.name, description: entity.description };
      }
      if (target.type === 'initiative') {
         const entity = (
            await api.get(resourcePath, apiEnvelopeSchema(initiativeSchema), { signal })
         ).data;
         return { ...target, title: entity.name, description: entity.description };
      }
      const entity = (await api.get(resourcePath, apiEnvelopeSchema(documentSchema), { signal }))
         .data;
      return { ...target, title: entity.title, description: entity.body };
   },
};
