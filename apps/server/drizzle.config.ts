import { defineConfig } from 'drizzle-kit';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

// Match Nest's local configuration while keeping shell/CI overrides authoritative.
const envFile = resolve(__dirname, '.env');
if (existsSync(envFile)) loadEnvFile(envFile);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: './src/database/migrations',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/tream',
  },
});
