import { SetMetadata } from '@nestjs/common';
export const TRANSACTIONAL_COMMAND = 'transactional-command';
export const TransactionalCommand = () =>
  SetMetadata(TRANSACTIONAL_COMMAND, true);
