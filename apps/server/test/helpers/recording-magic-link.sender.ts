import type {
  MagicLinkSender,
  SendMagicLinkInput,
} from '../../src/modules/iam/application/ports/magic-link-sender.port';

export class RecordingMagicLinkSender implements MagicLinkSender {
  readonly messages: SendMagicLinkInput[] = [];

  reset(): void {
    this.messages.length = 0;
  }

  send(input: SendMagicLinkInput): Promise<void> {
    this.messages.push(input);
    return Promise.resolve();
  }
}
