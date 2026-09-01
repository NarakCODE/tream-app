import { SetMetadata } from '@nestjs/common';

export const EVENT_ACCESS_MODE_KEY = 'event_access_mode';
export type EventAccessMode = 'read' | 'reprocess';

export const EventAccessMode = (mode: EventAccessMode): MethodDecorator =>
  SetMetadata(EVENT_ACCESS_MODE_KEY, mode);
