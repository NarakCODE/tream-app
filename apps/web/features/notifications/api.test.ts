import { createApiClient } from '@repo/api-client';
import { describe, expect, it, vi } from 'vitest';
import { notificationsApi } from './api';

function transport(data: unknown, meta: unknown = {}) {
   const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data, meta }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' },
      })
   );
   return { fetchFn, api: createApiClient({ baseUrl: 'http://localhost:3002', fetchFn }) };
}
describe('notification API transport contracts', () => {
   it('validates and normalizes cursor envelopes with documented filters', async () => {
      const { api, fetchFn } = transport([], {
         total: 0,
         limit: 25,
         cursor: null,
         hasNext: false,
         nextCursor: null,
      });
      const result = await notificationsApi.list(api, 'workspace', {
         status: 'archived',
         unread: 'true',
         limit: 25,
         cursor: 'cursor-token',
      });
      expect(result).toEqual({
         paginationType: 'cursor',
         items: [],
         total: 0,
         limit: 25,
         cursor: null,
         hasNext: false,
         nextCursor: null,
      });
      const url = new URL(String(fetchFn.mock.calls[0][0]));
      expect(url.pathname).toBe('/api/v1/workspaces/workspace/notifications');
      expect(Object.fromEntries(url.searchParams)).toEqual({
         status: 'archived',
         unread: 'true',
         limit: '25',
         cursor: 'cursor-token',
      });
   });
   it('rejects malformed metadata rather than accepting an unchecked server payload', async () => {
      const { api } = transport({ unreadCount: 'five' });
      await expect(notificationsApi.unreadCount(api, 'workspace')).rejects.toThrow();
   });
   it('parses missing-row preferences and sends command headers without an invented delivery revision', async () => {
      const preferences = {
         workspaceId: 'workspace',
         recipientMembershipId: 'member',
         inAppEnabled: true,
         emailEnabled: false,
         revision: 0,
      };
      const prefs = transport(preferences);
      expect(await notificationsApi.preferences(prefs.api, 'workspace')).toEqual(preferences);
      const { api, fetchFn } = transport({ id: 'job', status: 'PENDING' });
      const key = '00000000-0000-4000-8000-000000000001';
      await notificationsApi.retryDelivery(
         api,
         'workspace',
         'notification',
         { acknowledgePossibleDuplicate: true },
         key
      );
      const options = fetchFn.mock.calls[0][1]!;
      expect(options.method).toBe('POST');
      expect(new Headers(options.headers).get('Idempotency-Key')).toBe(key);
      expect(JSON.parse(String(options.body))).toEqual({ acknowledgePossibleDuplicate: true });
   });
});
