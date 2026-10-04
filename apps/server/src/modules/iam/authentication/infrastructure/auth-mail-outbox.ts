import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, lte, or, sql } from 'drizzle-orm';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { DatabaseService } from '../../../../database/database.service';
import type { DatabaseTransaction } from '../../../../database/transaction';
import { authMailDeliveries } from '../../../../database/schema/auth.schema';
import type { ApplicationConfiguration } from '../../../../config/configuration.interface';
import {
  AUTH_MAIL_SENDER,
  type AuthMailSender,
} from '../application/auth-mail';
export type MailMessage = { to: string; subject: string; text: string };
@Injectable()
export class AuthMailOutbox implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private active?: Promise<number>;
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<ApplicationConfiguration, true>,
    @Inject(AUTH_MAIL_SENDER) private readonly sender: AuthMailSender,
  ) {}
  onModuleInit() {
    if (
      this.config.getOrThrow('app.backgroundWorkersEnabled', { infer: true })
    ) {
      this.timer = setInterval(() => {
        if (this.running) return;
        this.active = this.dispatchReady();
        void this.active.catch(() => {
          /* Durable row is retried; no secret-bearing provider error logged. */
        });
      }, 1000);
      this.timer.unref();
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    try {
      await this.active;
    } catch {
      /* Durable lease recovers after restart. */
    }
  }
  private key() {
    return Buffer.from(
      this.config.getOrThrow('auth.mailEncryptionKey', { infer: true }),
      'hex',
    );
  }
  private encrypt(message: MailMessage) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(message), 'utf8'),
      cipher.final(),
    ]);
    return [
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      encrypted.toString('hex'),
    ].join(':');
  }
  private decrypt(encrypted: string): MailMessage {
    const [iv, tag, body] = encrypted.split(':');
    if (!iv || !tag || !body) throw new Error('Invalid encrypted mail');
    const cipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(iv, 'hex'),
    );
    cipher.setAuthTag(Buffer.from(tag, 'hex'));
    const parsed: unknown = JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(body, 'hex')),
        cipher.final(),
      ]).toString('utf8'),
    );
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('to' in parsed) ||
      typeof parsed.to !== 'string' ||
      !('subject' in parsed) ||
      typeof parsed.subject !== 'string' ||
      !('text' in parsed) ||
      typeof parsed.text !== 'string'
    )
      throw new Error('Invalid mail message');
    return { to: parsed.to, subject: parsed.subject, text: parsed.text };
  }
  async enqueue(tx: DatabaseTransaction, message: MailMessage): Promise<void> {
    await tx
      .insert(authMailDeliveries)
      .values({ id: randomUUID(), encryptedMessage: this.encrypt(message) });
  }
  async dispatchReady(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const claimed = await this.database.db.transaction(async (tx) => {
        await tx
          .update(authMailDeliveries)
          .set({ state: 'FAILED', leaseUntil: null })
          .where(
            and(
              eq(authMailDeliveries.state, 'CLAIMED'),
              lte(authMailDeliveries.leaseUntil, new Date()),
              sql`${authMailDeliveries.attempts} >= 8`,
            ),
          );
        const rows = await tx
          .select()
          .from(authMailDeliveries)
          .where(
            and(
              lte(authMailDeliveries.availableAt, new Date()),
              or(
                eq(authMailDeliveries.state, 'PENDING'),
                and(
                  eq(authMailDeliveries.state, 'CLAIMED'),
                  lte(authMailDeliveries.leaseUntil, new Date()),
                ),
              ),
            ),
          )
          .limit(10)
          .for('update', { skipLocked: true });
        const result = [] as Array<typeof authMailDeliveries.$inferSelect>;
        for (const row of rows) {
          const [updated] = await tx
            .update(authMailDeliveries)
            .set({
              state: 'CLAIMED',
              claimId: randomUUID(),
              leaseUntil: new Date(Date.now() + 60000),
              attempts: sql`${authMailDeliveries.attempts}+1`,
            })
            .where(eq(authMailDeliveries.id, row.id))
            .returning();
          if (updated) result.push(updated);
        }
        return result;
      });
      const outcomes = await Promise.all(
        claimed.map(async (row) => {
          try {
            if (!row.encryptedMessage) throw new Error('Missing mail');
            await this.sender.send({
              ...this.decrypt(row.encryptedMessage),
              messageId: `<${row.id}@auth.tream>`,
            });
            await this.database.db
              .update(authMailDeliveries)
              .set({
                state: 'SENT',
                sentAt: new Date(),
                leaseUntil: null,
                encryptedMessage: null,
              })
              .where(
                and(
                  eq(authMailDeliveries.id, row.id),
                  eq(authMailDeliveries.claimId, row.claimId!),
                ),
              );
            return 1;
          } catch {
            await this.database.db
              .update(authMailDeliveries)
              .set({
                state: row.attempts >= 8 ? 'FAILED' : 'PENDING',
                leaseUntil: null,
                availableAt: new Date(
                  Date.now() + Math.min(3600000, 1000 * 2 ** row.attempts),
                ),
              })
              .where(
                and(
                  eq(authMailDeliveries.id, row.id),
                  eq(authMailDeliveries.claimId, row.claimId!),
                ),
              );
            return 0;
          }
        }),
      );
      return outcomes.reduce<number>((sum, count) => sum + count, 0);
    } finally {
      this.running = false;
    }
  }
}
