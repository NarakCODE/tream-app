import { ConfigService } from '@nestjs/config';
import { appConfig } from '../../../../config/app.config';
import type { DatabaseService } from '../../../../database/database.service';
import type { DatabaseTransaction } from '../../../../database/transaction';
import type { AuthMailSender } from '../application/auth-mail';
import { AuthMailOutbox } from './auth-mail-outbox';

describe('Auth mail outbox retry identity', () => {
  it('keeps the delivery identity after sending succeeds but recording success fails', async () => {
    const row = { id: '', encryptedMessage: '', attempts: 1, claimId: 'claim' };
    const tx = {
      insert: () => ({
        values: (value: { id: string; encryptedMessage: string }) => {
          Object.assign(row, value);
        },
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => ({ for: () => Promise.resolve([row]) }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({ returning: () => Promise.resolve([row]) }),
        }),
      }),
    };
    const record = jest
      .fn()
      .mockRejectedValueOnce(new Error('Database unavailable'))
      .mockResolvedValue(undefined);
    const database = {
      db: {
        transaction: (callback: (transaction: typeof tx) => unknown) =>
          callback(tx),
        update: () => ({ set: () => ({ where: record }) }),
      },
    } as unknown as DatabaseService;
    const sender = {
      send: jest.fn().mockResolvedValue(undefined),
    } satisfies AuthMailSender;
    const outbox = new AuthMailOutbox(
      database,
      new ConfigService(appConfig()),
      sender,
    );
    const message = {
      to: 'user@example.test',
      subject: 'Verify email',
      text: 'Verification link',
    };
    await outbox.enqueue(tx as unknown as DatabaseTransaction, message);

    expect(await outbox.dispatchReady()).toBe(0);
    expect(await outbox.dispatchReady()).toBe(1);
    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(sender.send.mock.calls[0]).toEqual(sender.send.mock.calls[1]);
    expect(sender.send).toHaveBeenCalledWith({
      ...message,
      messageId: `<${row.id}@auth.tream>`,
    });
  });
});
