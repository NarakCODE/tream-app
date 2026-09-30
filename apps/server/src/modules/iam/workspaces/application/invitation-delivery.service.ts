import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DatabaseTransaction } from '../../../../database/transaction';
import type { Invitation } from './ports/workspace.repository';
import { AuthMailOutbox } from '../../authentication/infrastructure/auth-mail-outbox';
@Injectable()
export class InvitationDeliveryService {
  constructor(
    private readonly outbox: AuthMailOutbox,
    private readonly config: ConfigService,
  ) {}
  async enqueue(
    tx: DatabaseTransaction,
    invitation: Invitation,
    token: string,
  ): Promise<void> {
    const base =
      this.config.get<string>('CLIENT_URL') ?? 'http://localhost:3000';
    const link = new URL('/accept-invitation', base);
    link.searchParams.set('token', token);
    await this.outbox.enqueue(tx, {
      to: invitation.email,
      subject: 'Workspace invitation',
      text: `You have been invited to a workspace. Accept this invitation before ${invitation.expiresAt.toISOString()}: ${link.toString()}`,
    });
  }
}
