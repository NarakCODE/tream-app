import { Test } from '@nestjs/testing';
import { GMAIL_INTEGRATION_CONFIG } from '../integrations.config';
import { GoogleGmailMailAdapter } from './google-gmail-mail.adapter';

describe('GoogleGmailMailAdapter', () => {
  let adapter: GoogleGmailMailAdapter;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GoogleGmailMailAdapter,
        {
          provide: GMAIL_INTEGRATION_CONFIG,
          useValue: {
            clientId: 'client',
            clientSecret: 'secret',
            redirectUri: 'https://app.example.test/callback',
            encryptionSecret: 'long-enough-encryption-secret-for-testing',
            apiBaseUrl: 'https://gmail.example.test',
          },
        },
      ],
    }).compile();
    adapter = module.get(GoogleGmailMailAdapter);
  });

  afterEach(() => jest.restoreAllMocks());

  it('translates Gmail messages to the normalized ACL model', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'msg_1',
          threadId: 'thread_1',
          historyId: 'provider-only-field',
          labelIds: ['INBOX'],
          snippet: 'Hello there',
          internalDate: '1788084000000',
          payload: {
            mimeType: 'multipart/alternative',
            headers: [
              { name: 'From', value: 'Ada <ada@example.com>' },
              { name: 'To', value: 'Team <team@example.com>' },
              { name: 'Subject', value: 'Hello' },
              { name: 'Date', value: 'Sun, 30 Aug 2026 10:00:00 +0000' },
            ],
            parts: [
              {
                mimeType: 'text/plain',
                body: { data: Buffer.from('Plain body').toString('base64url') },
              },
              {
                mimeType: 'text/html',
                body: {
                  data: Buffer.from('<p>Body</p>').toString('base64url'),
                },
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const email = await adapter.getMessage('access-token', 'msg_1');

    expect(email).toEqual(
      expect.objectContaining({
        id: 'msg_1',
        threadId: 'thread_1',
        from: { name: 'Ada', address: 'ada@example.com' },
        to: [{ name: 'Team', address: 'team@example.com' }],
        subject: 'Hello',
        textBody: 'Plain body',
        htmlBody: '<p>Body</p>',
      }),
    );
    expect(email).not.toHaveProperty('historyId');
  });

  it('surfaces provider failures without returning mock data', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('unauthorized', { status: 401 }));

    await expect(adapter.getMessage('expired', 'msg_1')).rejects.toMatchObject({
      status: 401,
    });
  });
});
