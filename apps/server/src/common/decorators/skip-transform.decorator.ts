import { SetMetadata } from '@nestjs/common';

export const SKIP_RESPONSE_TRANSFORM = 'skipResponseTransform';
export const SkipResponseTransform = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_RESPONSE_TRANSFORM, true);
