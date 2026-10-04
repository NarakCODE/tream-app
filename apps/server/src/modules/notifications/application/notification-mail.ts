export type NotificationMailMessage = {
  to: string;
  subject: string;
  text: string;
  messageId: string;
};
export abstract class NotificationMailSender {
  abstract send(message: NotificationMailMessage): Promise<void>;
}
