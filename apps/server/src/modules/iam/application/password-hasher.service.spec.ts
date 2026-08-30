import { PasswordHasher } from './password-hasher.service';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('verifies the password used to create a scrypt hash', async () => {
    const hash = await hasher.hash('a secure passphrase');

    await expect(hasher.verify('a secure passphrase', hash)).resolves.toBe(
      true,
    );
    await expect(hasher.verify('the wrong passphrase', hash)).resolves.toBe(
      false,
    );
  });

  it('rejects malformed or unsupported hashes', async () => {
    await expect(hasher.verify('password', 'not-a-hash')).resolves.toBe(false);
  });
});
