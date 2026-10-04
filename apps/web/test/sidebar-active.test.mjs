import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
   isSidebarPathActive,
   normalizeSidebarPath,
} from '../components/layout/sidebar/sidebar-active.ts';

test('top-level routes and nested pages select their navigation section', () => {
   assert.equal(isSidebarPathActive('/acme/projects', '/acme/projects'), true);
   assert.equal(isSidebarPathActive('/acme/projects/42/settings', '/acme/projects'), true);
   assert.equal(isSidebarPathActive('/acme/projects-archive', '/acme/projects'), false);
   assert.equal(isSidebarPathActive('/other/projects', '/acme/projects'), false);
});

test('query strings, hashes and trailing slashes are normalized on both paths', () => {
   assert.equal(normalizeSidebarPath('/acme/projects/?view=list#heading'), '/acme/projects');
   assert.equal(
      isSidebarPathActive('/acme/projects/42/?tab=settings#heading', '/acme/projects/?view=list'),
      true
   );
});

test('home is exact-only and explicit exact matching excludes descendants', () => {
   assert.equal(isSidebarPathActive('/?tab=home', '/'), true);
   assert.equal(isSidebarPathActive('/acme/projects', '/'), false);
   assert.equal(
      isSidebarPathActive('/acme/settings/profile/edit', '/acme/settings/profile', true),
      false
   );
});

test('concrete dynamic IDs match only the intended team and its descendants', () => {
   assert.equal(isSidebarPathActive('/acme/team/team-42/cycle/active', '/acme/team/team-42'), true);
   assert.equal(isSidebarPathActive('/acme/team/team-420/all', '/acme/team/team-42'), false);
   assert.equal(
      isSidebarPathActive('/acme/settings/teams/team-42/members', '/acme/settings/teams/team-42'),
      true
   );
});

test('singular dynamic detail route families can match plural menu sections', () => {
   for (const family of ['project', 'review', 'initiative', 'view', 'profiles']) {
      assert.equal(
         isSidebarPathActive(`/acme/${family}/id-42/settings?tab=general`, `/acme/${family}`),
         true
      );
      assert.equal(isSidebarPathActive(`/acme/${family}-archive/id-42`, `/acme/${family}`), false);
   }
});

test('settings mode requires the workspace settings segment rather than a substring', () => {
   assert.equal(isSidebarPathActive('/acme/settings/profile', '/acme/settings'), true);
   assert.equal(isSidebarPathActive('/acme/settings-archive', '/acme/settings'), false);
   assert.equal(isSidebarPathActive('/acme/project/id/settings', '/acme/settings'), false);
});
