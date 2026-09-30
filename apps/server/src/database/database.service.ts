import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { ApplicationConfiguration } from '../config/configuration.interface';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly db: NodePgDatabase<typeof schema>;
  private readonly pool: Pool;

  constructor(config: ConfigService<ApplicationConfiguration, true>) {
    this.pool = new Pool({
      connectionString: config.getOrThrow('database.url', { infer: true }),
      max: config.getOrThrow('database.maxPool', { infer: true }),
      connectionTimeoutMillis: config.getOrThrow(
        'database.connectionTimeoutMs',
        { infer: true },
      ),
      statement_timeout: config.getOrThrow('database.queryTimeoutMs', {
        infer: true,
      }),
    });
    this.db = drizzle({ client: this.pool, schema });
  }

  async checkReadiness(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
