import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { readEnv } from '../../src/config/env';
import type { Database } from '../../src/database/database';
import { AesGcmDataCipher } from '../../src/infrastructure/data-cipher/aes-gcm-data-cipher';
import { Argon2PasswordHasher } from '../../src/infrastructure/password-hasher/argon2-password-hasher';
import { toSealedEmail } from '../../src/modules/auth/auth.mapper';
import { UsersDao } from '../../src/modules/auth/users.dao';
import type { UserPo } from '../../src/modules/auth/users.po';

export type SignedInUser = Readonly<{ id: string; token: string }>;

export type TestAccount = Readonly<{ name: string; email: string; password: string }>;

/** The cipher the app under test uses (the key of the integration env), for rows the real login
 *  and `/me` must open.
 *
 *  Example: `testDataCipher().index('email-index', 'ana@mesa.com')` */
export function testDataCipher(): AesGcmDataCipher {
  return new AesGcmDataCipher(readEnv(process.env).dataEncryptionKey);
}

/** Inserts an account sealed with the real cipher, so the HTTP login finds it; the @ is the local
 *  part of the e-mail.
 *
 *  Example: `await insertTestAccount(db, { name: 'Ana', email: 'ana@mesa.com', password: 'x' })` */
export async function insertTestAccount(db: Database, account: TestAccount): Promise<UserPo> {
  const id = randomUUID();
  const passwordHash = await new Argon2PasswordHasher().hash(account.password);
  return new UsersDao(db).insert({
    id,
    name: account.name,
    username: account.email.split('@')[0] ?? account.name.toLowerCase(),
    ...toSealedEmail(testDataCipher(), id, account.email),
    passwordHash,
  });
}

/** Inserts `<name>@mesa.com` and logs in through the real HTTP edge; returns the session cookie.
 *
 *  Example: `const ana = await signUpAndLogin(app, connection.db, 'Ana') // { id, token }` */
export async function signUpAndLogin(
  app: FastifyInstance,
  db: Database,
  name: string,
): Promise<SignedInUser> {
  const email = `${name.toLowerCase()}@mesa.com`;
  const user = await insertTestAccount(db, { name, email, password: 'senha-de-teste' });
  return { id: user.id, token: await logIn(app, email, 'senha-de-teste') };
}

/** Logs an existing account in through the real HTTP edge; returns the session cookie value.
 *
 *  Example: `const token = await logIn(app, 'caio@lorkarium.dev', DEV_PLAYER_PASSWORD)` */
export async function logIn(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  const cookie = response.cookies.find((candidate) => candidate.name === 'lk_session');
  if (!cookie) throw new Error(`login of ${email} answered ${response.statusCode}`);
  return cookie.value;
}
