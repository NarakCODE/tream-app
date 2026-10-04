import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { invitationAttempt } from './attempt.ts';
import { readInvitationDraft, saveInvitationDraft } from './draft.ts';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let values;

beforeEach(() => {
   values = new Map();
   Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
         getItem: (key) => values.get(key) ?? null,
         setItem: (key, value) => values.set(key, value),
      },
   });
});

after(() => {
   if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
   else delete globalThis.localStorage;
});

test('uncertain requests retain the same persisted UUID and isolate workspace, user and email', () => {
   const first = invitationAttempt('workspace-a:user-a:person@example.com');
   assert.match(first, /^[0-9a-f-]{36}$/);
   assert.equal(invitationAttempt('workspace-a:user-a:person@example.com'), first);
   assert.notEqual(invitationAttempt('workspace-b:user-a:person@example.com'), first);
   assert.notEqual(invitationAttempt('workspace-a:user-b:person@example.com'), first);
   assert.notEqual(invitationAttempt('workspace-a:user-a:other@example.com'), first);
});

test('corrupt persisted command identity fails instead of issuing a duplicate command', () => {
   const scope = 'workspace:user:person@example.com';
   values.set(`tream:invitation-command:${scope}`, 'broken');
   assert.throws(() => invitationAttempt(scope), /invalid/);
   assert.equal(values.get(`tream:invitation-command:${scope}`), 'broken');
});

test('storage write failure prevents a command identity from reaching the mutation', () => {
   localStorage.setItem = () => {
      throw new Error('Storage unavailable');
   };
   assert.throws(
      () => invitationAttempt('workspace:user:person@example.com'),
      /Storage unavailable/
   );
});

test('partial invitation draft survives reload and stays isolated by workspace and user', () => {
   saveInvitationDraft('workspace-a:user-a', {
      emails: 'retry@example.com',
      queued: ['queued@example.com'],
   });
   assert.deepEqual(readInvitationDraft('workspace-a:user-a'), {
      emails: 'retry@example.com',
      queued: ['queued@example.com'],
   });
   assert.deepEqual(readInvitationDraft('workspace-b:user-a'), { emails: '', queued: [] });
   assert.deepEqual(readInvitationDraft('workspace-a:user-b'), { emails: '', queued: [] });
});
