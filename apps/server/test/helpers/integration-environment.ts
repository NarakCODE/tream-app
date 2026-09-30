import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/** Integration suites must opt into a disposable database, never a developer DB. */
export function integrationEnvironment(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error(
      'TEST_DATABASE_URL is required for PostgreSQL integration tests.',
    );
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !/test/i.test(url.pathname)
  ) {
    throw new Error(
      'TEST_DATABASE_URL must identify a PostgreSQL database whose name contains test.',
    );
  }
  process.env.DATABASE_URL = value;
  process.env.NODE_ENV = 'test';
  process.env.SWAGGER_ENABLED = 'false';
  process.env.BACKGROUND_WORKERS_ENABLED = 'false';
  process.env.AUTH_MAIL_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.CORS_ORIGIN = 'http://localhost:3000,http://localhost:3001';
  return value;
}

/** Every suite gets its own database; no shared fixtures are deleted or truncated. */
export async function prepareIntegrationDatabase() {
  const base = integrationEnvironment();
  const admin = new Pool({ connectionString: base });
  const name = `tream_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(base);
  url.pathname = `/${name}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const connection = new Pool({ connectionString: url.toString() });
  const cleanup = async () => {
    await connection.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  };
  try {
    await migrate(drizzle(connection), {
      migrationsFolder: resolve(__dirname, '../../src/database/migrations'),
    });
    process.env.DATABASE_URL = url.toString();
    return { url: url.toString(), connection, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
