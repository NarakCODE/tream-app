import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testUrl = new URL(
  'postgresql://postgres:postgres@localhost:5432/tream_test',
);
const result = spawnSync(
  process.execPath,
  [
    resolve(serverRoot, 'node_modules/jest/bin/jest.js'),
    '--config',
    './test/jest-integration.json',
    '--runInBand',
  ],
  {
    cwd: serverRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? testUrl.toString(),
      NODE_ENV: 'test',
      BACKGROUND_WORKERS_ENABLED: 'false',
    },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
