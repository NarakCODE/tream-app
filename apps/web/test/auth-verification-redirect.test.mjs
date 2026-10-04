import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postAuthDestination, verificationDestination } from '../features/auth/redirect.ts';

test('unverified login and signup go to standalone verification before their original destination', () => {
   const signup = postAuthDestination({ emailVerified: false }, '/onboarding');
   assert.equal(signup, '/email-verification?redirect=%2Fonboarding');
   assert.equal(
      postAuthDestination({ emailVerified: false }, '/'),
      '/email-verification?redirect=%2F'
   );
});

test('verified users continue directly without another verification step', () => {
   assert.equal(
      postAuthDestination({ emailVerified: true }, '/workspace/my-issues'),
      '/workspace/my-issues'
   );
});

test('verification preserves invitation destinations while refusing external and looping redirects', () => {
   const target = '/accept-invitation?token=test-token';
   const result = new URL(verificationDestination(target), 'http://localhost');
   assert.equal(result.searchParams.get('redirect'), target);
   assert.equal(postAuthDestination({ emailVerified: true }, 'https://example.com'), '/');
   assert.equal(verificationDestination('/email-verification'), '/email-verification?redirect=%2F');
});

test('pending verification carries the submitted email and safe return path without a session', () => {
   const result = new URL(
      verificationDestination('/onboarding', 'USER@example.com'),
      'http://localhost'
   );
   assert.equal(result.searchParams.get('email'), 'user@example.com');
   assert.equal(result.searchParams.get('redirect'), '/onboarding');
});
