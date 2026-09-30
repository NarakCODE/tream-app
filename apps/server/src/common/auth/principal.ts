/** Global authenticated identity; workspace roles are loaded separately. */
export interface AuthenticatedPrincipal {
  id: string;
  email: string;
  sessionId: string;
}
