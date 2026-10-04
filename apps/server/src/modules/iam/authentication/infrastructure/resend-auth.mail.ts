import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { ApplicationConfiguration } from '../../../../config/configuration.interface';
import type { AuthMailSender } from '../application/auth-mail';

@Injectable()
export class ResendMailSender implements AuthMailSender {
  constructor(
    private readonly config: ConfigService<ApplicationConfiguration, true>,
  ) {}

  async send(message: Parameters<AuthMailSender['send']>[0]): Promise<void> {
    const resend = this.config.getOrThrow('mail.resend', { infer: true });
    if (!resend.apiKey || !resend.from)
      throw new Error('Resend sender is not configured.');

    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resend.apiKey}`,
          'Content-Type': 'application/json',
          ...(message.messageId
            ? {
                'Idempotency-Key': `auth-mail/${createHash('sha256').update(message.messageId).digest('hex')}`,
              }
            : {}),
        },
        body: JSON.stringify({
          from: resend.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // Provider errors may include credentials, recipient addresses or token URLs.
      throw new Error('Resend delivery request failed.');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Resend delivery rejected (HTTP ${response.status}).`);
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new Error('Resend returned an invalid delivery response.');
    }
    if (
      !result ||
      typeof result !== 'object' ||
      !('id' in result) ||
      typeof result.id !== 'string' ||
      result.id.trim() === ''
    )
      throw new Error('Resend returned an invalid delivery response.');
  }
}
