import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { isEmail } from 'class-validator';

function setValue(source, key, value) {
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, 'gm');
  return pattern.test(source)
    ? source.replace(pattern, `${key}=${value}`)
    : `${source.trimEnd()}\n${key}=${value}\n`;
}

export function configureResendEnvironment(source) {
  const values = parseEnv(source);
  const missing = ['RESEND_API_KEY', 'RESEND_FROM'].filter(
    (key) => !values[key]?.trim(),
  );
  let contents = source;
  for (const key of ['RESEND_API_KEY', 'RESEND_FROM']) {
    if (!(key in values)) contents = setValue(contents, key, '');
  }
  if (missing.length) {
    if (!values.MAIL_PROVIDER)
      contents = setValue(contents, 'MAIL_PROVIDER', 'smtp');
    return { contents, ready: false, missing };
  }
  if (!/^re_\S+$/.test(values.RESEND_API_KEY.trim()))
    throw new Error('RESEND_API_KEY must be a Resend API key.');
  const sender = values.RESEND_FROM.trim();
  const mailbox = sender.match(/^[^<>\r\n]+<([^<>\r\n]+)>$/)?.[1] ?? sender;
  if (/[\r\n<>]/.test(mailbox) || !isEmail(mailbox.trim()))
    throw new Error(
      'RESEND_FROM must be an email address on your verified Resend domain.',
    );
  if (
    values.NODE_ENV === 'production' &&
    /@(?:[^@]+\.)?resend\.dev$/i.test(mailbox.trim())
  )
    throw new Error('Production requires your own verified sender domain.');
  contents = setValue(contents, 'MAIL_PROVIDER', 'resend');
  contents = setValue(contents, 'BACKGROUND_WORKERS_ENABLED', 'true');
  return { contents, ready: true, missing: [] };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../.env');
  if (!existsSync(envPath)) {
    console.error(
      'Create apps/server/.env from .env.example before setting up Resend.',
    );
    process.exitCode = 1;
  } else {
    try {
      const source = readFileSync(envPath, 'utf8');
      const result = configureResendEnvironment(source);
      if (result.contents !== source)
        writeFileSync(envPath, result.contents, { mode: 0o600 });
      chmodSync(envPath, 0o600);
      if (result.ready) {
        console.log(
          'Resend selected and mail workers enabled. Restart the API to apply the configuration.',
        );
      } else {
        console.log(
          `Resend is not activated. Set ${result.missing.join(' and ')} privately in apps/server/.env, then rerun this command.`,
        );
      }
    } catch {
      console.error(
        'Resend setup failed. Check the API key, verified sender and .env file permissions. Credentials were not printed.',
      );
      process.exitCode = 1;
    }
  }
}
