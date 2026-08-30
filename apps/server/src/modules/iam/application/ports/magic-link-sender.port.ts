export const MAGIC_LINK_SENDER = Symbol('MAGIC_LINK_SENDER');

export interface SendMagicLinkInput {
  email: string;
  fullName: string;
  token: string;
  expiresAt: Date;
}

export interface MagicLinkSender {
  send(input: SendMagicLinkInput): Promise<void>;
}
