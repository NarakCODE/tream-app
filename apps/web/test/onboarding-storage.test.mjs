import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { z } from 'zod';
import { onboardingAttempt, readOnboardingDraft } from '../features/onboarding/storage.ts';

const saved = new Map();
beforeEach(() => {
   saved.clear();
   Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
         getItem: (key) => saved.get(key) ?? null,
         setItem: (key, value) => saved.set(key, value),
      },
   });
});

test('an uncertain create response can be retried after reload with the same command identity', () => {
   const input = { name: 'Engineering', key: 'ENG' };
   const first = onboardingAttempt('team:user1:workspace1', input);
   // Re-read from storage with a new object, as a remounted form does.
   assert.equal(onboardingAttempt('team:user1:workspace1', { ...input }), first);
   assert.match(first, /^[a-f0-9-]{36}$/);
   assert.deepEqual(
      readOnboardingDraft('team:user1:workspace1', z.object({ name: z.string(), key: z.string() })),
      input
   );
});

test('changed payloads and other users or workspaces get distinct identities', () => {
   const input = { name: 'Engineering', key: 'ENG' };
   const first = onboardingAttempt('team:user1:workspace1', input);
   assert.notEqual(onboardingAttempt('team:user1:workspace2', input), first);
   assert.notEqual(onboardingAttempt('team:user2:workspace1', input), first);
   assert.notEqual(onboardingAttempt('team:user1:workspace1', { ...input, key: 'DEV' }), first);
});

test('corrupt saved state blocks retries instead of issuing a duplicate create command', () => {
   saved.set('tream:onboarding:attempt:workspace:user1', '{broken');
   assert.equal(readOnboardingDraft('workspace:user1', z.object({ name: z.string() })), null);
   assert.throws(
      () => onboardingAttempt('workspace:user1', { name: 'Acme' }),
      /Saved setup request is invalid/
   );
   assert.equal(saved.get('tream:onboarding:attempt:workspace:user1'), '{broken');
});

test('storage failure stops a create attempt before it can be sent unsafely', () => {
   Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
         getItem: () => null,
         setItem: () => {
            throw new Error('Storage unavailable');
         },
      },
   });
   assert.throws(
      () => onboardingAttempt('team:user1:workspace1', { key: 'ENG' }),
      /Storage unavailable/
   );
});
