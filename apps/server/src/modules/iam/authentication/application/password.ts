import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const currentOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const derive = (
  password: string,
  salt: string,
  legacy = false,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      legacy ? { N: 16384, r: 8, p: 1 } : currentOptions,
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
/** OWASP scrypt profile N=2^15, r=8, p=3; format stores the chosen work factor. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt);
  return `scrypt:32768:8:3:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const parts = encoded.split(':');
  const legacy = parts.length === 3;
  const [algorithm, salt, hex] = legacy
    ? parts
    : [parts[0], parts[4], parts[5]];
  if (
    !legacy &&
    (parts.length !== 6 ||
      parts[1] !== '32768' ||
      parts[2] !== '8' ||
      parts[3] !== '3')
  )
    return false;
  if (
    algorithm !== 'scrypt' ||
    !salt ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !hex ||
    !/^[a-f0-9]{128}$/.test(hex)
  )
    return false;
  const hash = await derive(password, salt, legacy);
  return timingSafeEqual(hash, Buffer.from(hex, 'hex'));
}
