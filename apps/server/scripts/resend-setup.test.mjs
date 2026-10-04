import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEnv } from 'node:util';
import { configureResendEnvironment } from './resend-setup.mjs';

test('missing credentials are staged without disabling current local delivery', () => {
  const result = configureResendEnvironment(
    'SMTP_HOST=localhost\nBACKGROUND_WORKERS_ENABLED=true\n',
  );
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, ['RESEND_API_KEY', 'RESEND_FROM']);
  assert.equal(parseEnv(result.contents).MAIL_PROVIDER, 'smtp');
  assert.equal(parseEnv(result.contents).BACKGROUND_WORKERS_ENABLED, 'true');
});

test('valid credentials activate Resend without changing existing credentials or encryption keys', () => {
  const source =
    'RESEND_API_KEY=re_fixture\nRESEND_FROM="Tream <verify@example.test>"\nMAIL_PROVIDER=smtp\nBACKGROUND_WORKERS_ENABLED=false\nAUTH_MAIL_ENCRYPTION_KEY=keep-existing-key\nDATABASE_URL=keep-existing-url\n';
  const result = configureResendEnvironment(source);
  assert.equal(result.ready, true);
  const values = parseEnv(result.contents);
  assert.equal(values.MAIL_PROVIDER, 'resend');
  assert.equal(values.BACKGROUND_WORKERS_ENABLED, 'true');
  assert.equal(values.RESEND_API_KEY, 're_fixture');
  assert.equal(values.AUTH_MAIL_ENCRYPTION_KEY, 'keep-existing-key');
  assert.equal(values.DATABASE_URL, 'keep-existing-url');
  assert.equal(
    configureResendEnvironment(result.contents).contents,
    result.contents,
  );
});

test('invalid API keys and sender addresses cannot activate Resend', () => {
  assert.throws(
    () =>
      configureResendEnvironment(
        'RESEND_API_KEY=invalid\nRESEND_FROM=verify@example.test\n',
      ),
    /RESEND_API_KEY/,
  );
  assert.throws(
    () =>
      configureResendEnvironment(
        'RESEND_API_KEY=re_fixture\nRESEND_FROM=invalid\n',
      ),
    /RESEND_FROM/,
  );
});
