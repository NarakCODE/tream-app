export const GMAIL_INTEGRATION_CONFIG = Symbol('GMAIL_INTEGRATION_CONFIG');

export interface GmailIntegrationConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionSecret: string;
  scopes?: string[];
  oauthBaseUrl?: string;
  apiBaseUrl?: string;
}

export const DEFAULT_GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
] as const;
