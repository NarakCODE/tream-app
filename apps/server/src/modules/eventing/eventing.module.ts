import { EventConsumerRegistry } from './application/event-consumer-registry';
import { OutboxHost } from './application/outbox-host.service';
import { OutboxMonitor } from './application/outbox-monitor.service';
import { OutboxController } from './presentation/outbox.controller';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { EventWriter } from './application/event-writer.service';
import { EventContractRegistry } from './infrastructure/event-contract-registry';
import { OutboxWorker } from './application/outbox-worker.service';
@Module({
  imports: [DatabaseModule],
  controllers: [OutboxController],
  providers: [
    EventWriter,
    EventContractRegistry,
    OutboxWorker,
    EventConsumerRegistry,
    OutboxHost,
    OutboxMonitor,
  ],
  exports: [
    EventWriter,
    OutboxWorker,
    EventConsumerRegistry,
    OutboxHost,
    OutboxMonitor,
  ],
})
export class EventingModule {}
