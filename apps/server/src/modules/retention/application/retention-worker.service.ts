import { Injectable } from '@nestjs/common';
import { FileCleanupWorker } from '../../files/application/file-cleanup.worker';
/** Storage cleanup owns its durable leases and schedule. This adapter reuses
 * that path; it does not create a second queue or purge immutable facts. */
@Injectable()
export class RetentionWorker {
  constructor(private readonly files: FileCleanupWorker) {}
  async run() {
    return { filesPurged: await this.files.run() };
  }
}
