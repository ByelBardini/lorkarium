import type { FastifyInstance } from 'fastify';
import type { Database } from '../../src/database/database';
import { Argon2PasswordHasher } from '../../src/infrastructure/password-hasher/argon2-password-hasher';
import { UsersDao } from '../../src/modules/auth/users.dao';

export type SignedInUser = Readonly<{ id: string; token: string }>;

/** Inserts `<name>@mesa.com` and logs in through the real HTTP edge; returns the session cookie.
 *
 *  Example: `const ana = await signUpAndLogin(app, connection.db, 'Ana') // { id, token }` */
export async function signUpAndLogin(
  app: FastifyInstance,
  db: Database,
  name: string,
): Promise<SignedInUser> {
  const email = `${name.toLowerCase()}@mesa.com`;
  const passwordHash = await new Argon2PasswordHasher().hash('senha-de-teste');
  const user = await new UsersDao(db).insert({ name, email, passwordHash });
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
