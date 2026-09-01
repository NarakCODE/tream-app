import { SetMetadata } from '@nestjs/common';

export const SKIP_IDEMPOTENCY = 'skipIdempotency';

/**
 * Exempts a mutating authenticated endpoint from the global idempotency
 * requirement. Public routes are exempt automatically.
 */
export const SkipIdempotency = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_IDEMPOTENCY, true);
