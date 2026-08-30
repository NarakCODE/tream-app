import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { ApplicationConfiguration } from '../../../config/configuration.interface';
import { AppErrorCode } from '../../../common/enums/app-error-code.enum';
import { AppException } from '../../../common/exceptions/app.exception';
import type {
  MagicLinkSender,
  SendMagicLinkInput,
} from '../application/ports/magic-link-sender.port';

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character] ?? character,
  );

@Injectable()
export class SmtpMagicLinkSender implements MagicLinkSender {
  private readonly transport: Transporter;
  private readonly from: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService<ApplicationConfiguration, true>) {
    const smtp = config.getOrThrow('mail.smtp', { infer: true });
    this.from = smtp.from;
    this.baseUrl = config.getOrThrow('auth.magicLink.baseUrl', {
      infer: true,
    });
    this.transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      ...(smtp.user === undefined || smtp.password === undefined
        ? {}
        : { auth: { user: smtp.user, pass: smtp.password } }),
    });
  }

  async send(input: SendMagicLinkInput): Promise<void> {
    const url = new URL('/auth/magic-link/verify', this.baseUrl);
    url.searchParams.set('token', input.token);
    const expiration = input.expiresAt.toISOString();

    try {
      await this.transport.sendMail({
        from: this.from,
        to: input.email,
        subject: 'Sign in to Tream',
        text: `Use this link to sign in: ${url.toString()}\n\nThis link expires at ${expiration}.`,
        html: `<p>Hello ${escapeHtml(input.fullName)},</p><p><a href="${escapeHtml(url.toString())}">Sign in to Tream</a></p><p>This link expires at ${expiration}.</p>`,
      });
    } catch {
      throw new AppException(
        AppErrorCode.ServiceUnavailable,
        'The magic link could not be delivered. Please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
