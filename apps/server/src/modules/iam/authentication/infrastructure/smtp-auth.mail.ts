import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { ApplicationConfiguration } from '../../../../config/configuration.interface';
import type { AuthMailSender } from '../application/auth-mail';
@Injectable()
export class SmtpMailSender implements AuthMailSender {
  constructor(
    private readonly config: ConfigService<ApplicationConfiguration, true>,
  ) {}
  async send(message: { to: string; subject: string; text: string }) {
    const smtp = this.config.getOrThrow('mail.smtp', { infer: true });
    await createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password } } : {}),
    }).sendMail({ from: smtp.from, ...message });
  }
}
