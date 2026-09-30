import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(serverRoot, '.env');
const example = readFileSync(resolve(serverRoot, '.env.example'), 'utf8');

if (!existsSync(envPath)) {
  const local = example
    .replace(
      /^JWT_ACCESS_SECRET=.*$/m,
      `JWT_ACCESS_SECRET=${randomBytes(32).toString('hex')}`,
    )
    .replace(
      /^AUTH_MAIL_ENCRYPTION_KEY=.*$/m,
      `AUTH_MAIL_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`,
    )
    .replace(
      /^BACKGROUND_WORKERS_ENABLED=.*$/m,
      'BACKGROUND_WORKERS_ENABLED=true',
    );
  writeFileSync(envPath, local, { mode: 0o600 });
  console.log(
    'Created apps/server/.env with local credentials and mail delivery enabled.',
  );
} else {
  // Never rotate existing encryption keys or overwrite configured credentials.
  // A missing key retains the app's development fallback so queued mail remains
  // decryptable; new installations above receive a unique random key.
  const current = readFileSync(envPath, 'utf8');
  const defined = new Set(
    current
      .split('\n')
      .map(
        (line) => line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/)?.[1],
      )
      .filter(Boolean),
  );
  const missing = example
    .split('\n')
    .filter((line) => {
      const key = line.match(/^([A-Z_][A-Z0-9_]*)=/)?.[1];
      return key && !defined.has(key);
    })
    .map((line) =>
      line.startsWith('BACKGROUND_WORKERS_ENABLED=')
        ? 'BACKGROUND_WORKERS_ENABLED=true'
        : line,
    );
  if (missing.length)
    writeFileSync(
      envPath,
      `${current.trimEnd()}\n\n# Local development settings added by local:setup\n${missing.join('\n')}\n`,
    );
  console.log(
    'Preserved existing .env values and added missing development settings.',
  );
}

loadEnvFile(envPath);
const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
if (
  !['development', 'test'].includes(process.env.NODE_ENV ?? 'development') ||
  !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname) ||
  (databaseUrl.port && databaseUrl.port !== '5432') ||
  databaseUrl.pathname !== '/tream'
) {
  throw new Error(
    'local:setup only migrates the local Compose database on port 5432 named tream. Review your .env; remote/production databases are never migrated by this command.',
  );
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: serverRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '120']);
// Entrypoint scripts only run on a fresh volume, so also provision the test DB
// explicitly without replacing an existing database or deleting any data.
run('docker', [
  'compose',
  'exec',
  '-T',
  'postgres',
  'psql',
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-v',
  'ON_ERROR_STOP=1',
  '-f',
  '/docker-entrypoint-initdb.d/01-test-database.sql',
]);
run(process.execPath, [
  resolve(serverRoot, 'node_modules/drizzle-kit/bin.cjs'),
  'migrate',
]);
console.log(
  '\nLocal services are ready. Start the API with pnpm --filter server dev.',
);
console.log('API: http://localhost:3002 | Swagger: http://localhost:3002/docs');
console.log('Mailbox: http://localhost:8025 | SMTP: localhost:1025');
if (process.env.BACKGROUND_WORKERS_ENABLED !== 'true') {
  console.log(
    'BACKGROUND_WORKERS_ENABLED is disabled in your existing environment; enable it and restart the API to deliver queued mail.',
  );
}
