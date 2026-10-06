import { describe, expect, it } from 'vitest';
import {
   buildWorkspacePath,
   extractParentIdsFromPath,
   isUuid,
   parseDomainFromHost,
} from './domain-url';

describe('domain-url utilities', () => {
   describe('isUuid', () => {
      it('returns true for valid UUIDs', () => {
         expect(isUuid('ced841dd-2327-4c44-94e4-cfc8126285f2')).toBe(true);
         expect(isUuid('CED841DD-2327-4C44-94E4-CFC8126285F2')).toBe(true);
         expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
      });

      it('returns false for slugs and invalid values', () => {
         expect(isUuid('lndev-ui')).toBe(false);
         expect(isUuid('acme-team')).toBe(false);
         expect(isUuid('')).toBe(false);
         expect(isUuid(null)).toBe(false);
         expect(isUuid(undefined)).toBe(false);
         expect(isUuid('ced841dd-2327-4c44-94e4-cfc8126285f')).toBe(false);
      });
   });

   describe('parseDomainFromHost', () => {
      it('extracts subdomain tenant slug from host header', () => {
         expect(parseDomainFromHost('acme.localhost:3000')).toBe('acme');
         expect(parseDomainFromHost('team-1.tream.app')).toBe('team-1');
         expect(parseDomainFromHost('linear.example.com:8080')).toBe('linear');
      });

      it('returns null for bare localhost or ip addresses', () => {
         expect(parseDomainFromHost('localhost:3000')).toBeNull();
         expect(parseDomainFromHost('127.0.0.1:3000')).toBeNull();
         expect(parseDomainFromHost(null)).toBeNull();
         expect(parseDomainFromHost('')).toBeNull();
      });

      it('returns null for reserved subdomains', () => {
         expect(parseDomainFromHost('www.tream.app')).toBeNull();
         expect(parseDomainFromHost('app.tream.app')).toBeNull();
         expect(parseDomainFromHost('api.tream.app')).toBeNull();
         expect(parseDomainFromHost('admin.tream.app')).toBeNull();
         expect(parseDomainFromHost('docs.tream.app')).toBeNull();
      });
   });

   describe('extractParentIdsFromPath', () => {
      it('extracts orgId from root workspace route', () => {
         expect(extractParentIdsFromPath('/acme-corp/my-issues')).toEqual({
            orgId: 'acme-corp',
         });
      });

      it('extracts teamId from team route', () => {
         expect(extractParentIdsFromPath('/acme/team/eng-uuid/all')).toEqual({
            orgId: 'acme',
            teamId: 'eng-uuid',
         });
      });

      it('extracts projectId from project route', () => {
         expect(extractParentIdsFromPath('/acme/project/proj-123/issues')).toEqual({
            orgId: 'acme',
            projectId: 'proj-123',
         });
      });

      it('extracts issueId from issue route', () => {
         expect(extractParentIdsFromPath('/acme/issue/LNUI-42')).toEqual({
            orgId: 'acme',
            issueId: 'LNUI-42',
         });
      });

      it('extracts combined parent IDs from nested route', () => {
         expect(extractParentIdsFromPath('/acme/team/eng-uuid/cycle/cycle-99')).toEqual({
            orgId: 'acme',
            teamId: 'eng-uuid',
            cycleId: 'cycle-99',
         });
      });

      it('ignores reserved root paths', () => {
         expect(extractParentIdsFromPath('/login')).toEqual({});
         expect(extractParentIdsFromPath('/workspaces')).toEqual({});
         expect(extractParentIdsFromPath('/onboarding')).toEqual({});
      });
   });

   describe('buildWorkspacePath', () => {
      it('prepends org slug to subpath cleanly', () => {
         expect(buildWorkspacePath('acme', '/my-issues')).toBe('/acme/my-issues');
         expect(buildWorkspacePath('acme', 'settings')).toBe('/acme/settings');
         expect(buildWorkspacePath('spaced name', '/team/1')).toBe('/spaced%20name/team/1');
      });
   });
});
