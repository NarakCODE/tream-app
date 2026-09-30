export const AUTH_MAIL_SENDER = Symbol('AUTH_MAIL_SENDER');
export interface AuthMailSender {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}
