import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { IamModule } from '../iam/iam.module';
import { EVENT_DISPATCH_QUEUE } from './application/ports/event-dispatch-queue.port';
import { EVENT_STORE } from './application/ports/event-store.port';
import { EventingService } from './application/eventing.service';
import { DatabaseEventDispatchQueue } from './infrastructure/database-event-dispatch.queue';
import { EventAccessGuard } from './infrastructure/event-access.guard';
import { DrizzleEventStore } from './infrastructure/drizzle-event-store';
import { EventsController } from './presentation/events.controller';
import { WorkspaceEventsController } from './presentation/workspace-events.controller';

@Module({
  imports: [DatabaseModule, IamModule],
  controllers: [WorkspaceEventsController, EventsController],
  providers: [
    EventingService,
    EventAccessGuard,
    DrizzleEventStore,
    DatabaseEventDispatchQueue,
    { provide: EVENT_STORE, useExisting: DrizzleEventStore },
    {
      provide: EVENT_DISPATCH_QUEUE,
      useExisting: DatabaseEventDispatchQueue,
    },
  ],
  exports: [EventingService, EVENT_STORE, EVENT_DISPATCH_QUEUE],
})
export class EventingModule {}
