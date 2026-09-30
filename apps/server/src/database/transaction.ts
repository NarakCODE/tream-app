import type { DatabaseService } from './database.service';

/** Transaction-scoped database handle; never reuse it after the callback ends. */
export type DatabaseTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];
