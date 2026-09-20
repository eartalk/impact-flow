import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

@Injectable()
export class PasswordHasher {
  async hash(password: string) {
    const salt = randomBytes(16);
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
  }

  async verify(password: string, encoded: string) {
    const [algorithm, saltValue, hashValue] = encoded.split('$');
    if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;
    const expected = Buffer.from(hashValue, 'base64');
    const actual = (await scrypt(
      password,
      Buffer.from(saltValue, 'base64'),
      expected.length,
    )) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
