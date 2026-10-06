import { ApiError } from '@repo/api-client';

export type TeamActionContext =
   | 'create-team'
   | 'update-team'
   | 'retire-team'
   | 'add-member'
   | 'update-member'
   | 'remove-member'
   | 'update-settings'
   | 'create-status'
   | 'reorder-statuses'
   | 'update-status'
   | 'set-default-status'
   | 'retire-status';

export function mapTeamError(error: unknown, action: TeamActionContext): string {
   if (error instanceof ApiError) {
      if (error.status === 400) {
         switch (action) {
            case 'create-team':
               return (
                  error.message ||
                  'Invalid team input. Key must be 2–10 uppercase letters or numbers, starting with a letter.'
               );
            case 'update-settings':
               return (
                  error.message ||
                  'Invalid cycle settings. Ensure cooldown days are strictly less than cycle duration.'
               );
            case 'reorder-statuses':
               return (
                  error.message ||
                  'Invalid status reorder list. All active team statuses must be included exactly once.'
               );
            default:
               return error.message || 'Validation failed. Please verify your input.';
         }
      }

      if (error.status === 404) {
         switch (action) {
            case 'add-member':
            case 'update-member':
            case 'remove-member':
               return error.message || 'Team member or workspace membership was not found.';
            case 'create-status':
            case 'update-status':
            case 'set-default-status':
            case 'retire-status':
               return error.message || 'Workflow status or team was not found.';
            default:
               return (
                  error.message || 'The requested team was not found or is no longer accessible.'
               );
         }
      }

      if (error.status === 409) {
         switch (action) {
            case 'create-team':
               return error.message || 'This team key is already taken in this workspace.';
            case 'retire-team':
               return (
                  error.message ||
                  'Team cannot be retired while it has active issues, projects, or unfinished cycles.'
               );
            case 'add-member':
               return error.message || 'This user is already an active member of the team.';
            case 'update-member':
            case 'remove-member':
               return (
                  error.message || 'Cannot demote or remove the sole administrator of the team.'
               );
            case 'update-status':
               return (
                  error.message ||
                  'Status category cannot be changed while issues are currently assigned to it.'
               );
            case 'set-default-status':
               return (
                  error.message ||
                  'The default status must belong to either the BACKLOG or UNSTARTED category.'
               );
            case 'retire-status':
               return (
                  error.message ||
                  'A replacement status is required because this status is currently in use or is default.'
               );
            default:
               return error.message || 'The action conflicted with the current state of the team.';
         }
      }

      return error.message || `Request failed with status ${error.status}`;
   }

   if (error instanceof Error) {
      return error.message;
   }

   return 'An unexpected error occurred. Please try again.';
}
