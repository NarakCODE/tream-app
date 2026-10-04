import { ConfigService } from '@nestjs/config';
import type { ApplicationConfiguration } from '../../../../config/configuration.interface';
import type { AuthMailSender } from '../application/auth-mail';
import { ResendMailSender } from './resend-auth.mail';
import { SmtpMailSender } from './smtp-auth.mail';

export function createAuthMailSender(
  config: ConfigService<ApplicationConfiguration, true>,
): AuthMailSender {
  return config.getOrThrow('mail.provider', { infer: true }) === 'resend'
    ? new ResendMailSender(config)
    : new SmtpMailSender(config);
}
