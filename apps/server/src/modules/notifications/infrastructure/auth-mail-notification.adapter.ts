import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_MAIL_SENDER,
  type AuthMailSender,
} from '../../iam/authentication/application/auth-mail';
import {
  NotificationMailSender,
  type NotificationMailMessage,
} from '../application/notification-mail';
@Injectable()
export class AuthMailNotificationAdapter extends NotificationMailSender {
  constructor(
    @Inject(AUTH_MAIL_SENDER) private readonly sender: AuthMailSender,
  ) {
    super();
  }
  send(message: NotificationMailMessage) {
    return this.sender.send(message);
  }
}
