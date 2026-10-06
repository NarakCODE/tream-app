import { describe, expect, it } from 'vitest';
import { ApiError } from '@repo/api-client';
import { mapTeamError } from './errors';

describe('mapTeamError', () => {
   describe('400 Bad Request mapping', () => {
      it('maps 400 create-team error with fallback', () => {
         const err = new ApiError({
            status: 400,
            code: 'HTTP_400',
            message: '',
         });
         expect(mapTeamError(err, 'create-team')).toContain('Invalid team input');
      });

      it('maps 400 update-settings error with custom message', () => {
         const err = new ApiError({
            status: 400,
            code: 'HTTP_400',
            message: 'Cooldown days must be less than duration',
         });
         expect(mapTeamError(err, 'update-settings')).toBe(
            'Cooldown days must be less than duration'
         );
      });

      it('maps 400 reorder-statuses error', () => {
         const err = new ApiError({
            status: 400,
            code: 'HTTP_400',
            message: '',
         });
         expect(mapTeamError(err, 'reorder-statuses')).toContain(
            'All active team statuses must be included'
         );
      });
   });

   describe('404 Not Found mapping', () => {
      it('maps 404 member error', () => {
         const err = new ApiError({
            status: 404,
            code: 'HTTP_404',
            message: '',
         });
         expect(mapTeamError(err, 'update-member')).toContain(
            'Team member or workspace membership was not found'
         );
      });

      it('maps 404 status error', () => {
         const err = new ApiError({
            status: 404,
            code: 'HTTP_404',
            message: '',
         });
         expect(mapTeamError(err, 'update-status')).toContain(
            'Workflow status or team was not found'
         );
      });

      it('maps 404 team error', () => {
         const err = new ApiError({
            status: 404,
            code: 'HTTP_404',
            message: '',
         });
         expect(mapTeamError(err, 'update-team')).toContain('The requested team was not found');
      });
   });

   describe('409 Conflict mapping', () => {
      it('maps 409 team key taken', () => {
         const err = new ApiError({
            status: 409,
            code: 'HTTP_409',
            message: '',
         });
         expect(mapTeamError(err, 'create-team')).toBe(
            'This team key is already taken in this workspace.'
         );
      });

      it('maps 409 retire-team active dependencies', () => {
         const err = new ApiError({
            status: 409,
            code: 'HTTP_409',
            message: '',
         });
         expect(mapTeamError(err, 'retire-team')).toBe(
            'Team cannot be retired while it has active issues, projects, or unfinished cycles.'
         );
      });

      it('maps 409 sole administrator protection', () => {
         const err = new ApiError({
            status: 409,
            code: 'HTTP_409',
            message: '',
         });
         expect(mapTeamError(err, 'remove-member')).toBe(
            'Cannot demote or remove the sole administrator of the team.'
         );
      });

      it('maps 409 status category in use', () => {
         const err = new ApiError({
            status: 409,
            code: 'HTTP_409',
            message: '',
         });
         expect(mapTeamError(err, 'update-status')).toBe(
            'Status category cannot be changed while issues are currently assigned to it.'
         );
      });

      it('maps 409 set-default-status category restrictions', () => {
         const err = new ApiError({
            status: 409,
            code: 'HTTP_409',
            message: '',
         });
         expect(mapTeamError(err, 'set-default-status')).toBe(
            'The default status must belong to either the BACKLOG or UNSTARTED category.'
         );
      });

      it('maps 409 retire-status replacement required', () => {
         const err = new ApiError({
            status: 409,
            code: 'HTTP_409',
            message: '',
         });
         expect(mapTeamError(err, 'retire-status')).toBe(
            'A replacement status is required because this status is currently in use or is default.'
         );
      });
   });

   it('handles general Error and non-Error objects', () => {
      expect(mapTeamError(new Error('Network offline'), 'create-team')).toBe('Network offline');
      expect(mapTeamError('unexpected string', 'create-team')).toBe(
         'An unexpected error occurred. Please try again.'
      );
   });
});
