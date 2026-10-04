const { resolve } = require('node:path');
const { existsSync } = require('node:fs');
const { loadEnvFile } = require('node:process');
const serverRoot = resolve(__dirname, '..');
process.chdir(serverRoot);
if (existsSync(resolve(serverRoot, '.env')))
  loadEnvFile(resolve(serverRoot, '.env'));
require('reflect-metadata');
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' },
});
const { seedDemo } = require('../src/database/demo-seed/runner.ts');
seedDemo({ reset: process.argv.includes('--reset') })
  .then(async (result) => {
    console.table(result.counts);
    console.log('Northstar demo ready. Workspace: /northstar-demo');
    console.log('Login: demo@yourapp.com / Demo@1234');
    if (process.argv.includes('--verify')) {
      process.env.BACKGROUND_WORKERS_ENABLED = 'false';
      const { createApplication } = require('../src/application.factory.ts');
      const { verifyDemo } = require('../src/database/demo-seed/verify.ts');
      const app = await createApplication();
      app.useLogger(false);
      require('nestjs-pino').PinoLogger.root.level = 'silent';
      try {
        const checks = await verifyDemo(app, result);
        console.table(checks);
        console.log(`Verified ${checks.length} authenticated endpoint checks.`);
      } finally {
        await app.close();
      }
    }
  })
  .catch((error) => {
    console.error(
      'Demo seed failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    process.exitCode = 1;
  });
