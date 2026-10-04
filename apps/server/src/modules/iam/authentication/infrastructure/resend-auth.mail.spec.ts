import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { appConfig } from '../../../../config/app.config';
import type { ApplicationConfiguration } from '../../../../config/configuration.interface';
import { createAuthMailSender } from './auth-mail.provider';
import { ResendMailSender } from './resend-auth.mail';
import { SmtpMailSender } from './smtp-auth.mail';

describe('Resend mail delivery', () => {
  let sender: ResendMailSender;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let configuration: ApplicationConfiguration;
  const message = {
    to: 'user@example.test',
    subject: 'Verify your email',
    text: 'Use your single-use verification link.',
    messageId: '<outbox-row-1@auth.tream>',
  };

  beforeEach(() => {
    configuration = appConfig();
    configuration.mail.provider = 'resend';
    configuration.mail.resend = {
      apiKey: 're_test_only',
      from: 'Tream <verify@example.test>',
    };
    sender = new ResendMailSender(new ConfigService(configuration));
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('sends the original recipient and verification message through the Resend API', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'accepted-email' }), { status: 200 }),
    );
    await sender.send(message);

    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer re_test_only',
        'Content-Type': 'application/json',
        'Idempotency-Key': `auth-mail/${createHash('sha256').update(message.messageId).digest('hex')}`,
      },
      body: JSON.stringify({
        from: 'Tream <verify@example.test>',
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it('reuses the outbox identity on an uncertain-response retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Connection lost'));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'accepted-email' }), { status: 200 }),
    );
    await expect(sender.send(message)).rejects.toThrow(
      'Resend delivery request failed',
    );
    await sender.send(message);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      fetchMock.mock.calls[1]?.[1]?.headers,
    );
  });

  it.each([401, 403, 429, 500])(
    'rejects HTTP %s for the outbox to retry without leaking provider content',
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response('private-provider-content', { status }),
      );
      await expect(sender.send(message)).rejects.toThrow(
        `Resend delivery rejected (HTTP ${status}).`,
      );
    },
  );

  it.each(['not-json', '{}', '{"id":""}'])(
    'does not mark mail sent for an invalid successful response %s',
    async (body) => {
      fetchMock.mockResolvedValue(new Response(body, { status: 200 }));
      await expect(sender.send(message)).rejects.toThrow(
        'Resend returned an invalid delivery response.',
      );
    },
  );

  it('does not fall back to local SMTP when Resend credentials are missing', async () => {
    delete configuration.mail.resend.apiKey;
    await expect(sender.send(message)).rejects.toThrow(
      'Resend sender is not configured.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('selects the configured sender behind the existing injection token', () => {
    expect(
      createAuthMailSender(new ConfigService(configuration)),
    ).toBeInstanceOf(ResendMailSender);
    configuration.mail.provider = 'smtp';
    expect(
      createAuthMailSender(new ConfigService(configuration)),
    ).toBeInstanceOf(SmtpMailSender);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
