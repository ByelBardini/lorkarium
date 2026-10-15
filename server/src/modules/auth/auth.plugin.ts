import type { FastifyInstance } from 'fastify';
import type { Env } from '../../config/env';
import type { Database } from '../../database/database';
import { AdminSeedService } from './admin-seed.service';
import { AuthSessionsDao } from './auth-sessions.dao';
import { authRoutes, createAuthGuards, type AuthGuards } from './auth.routes';
import { AuthService } from './auth.service';
import type { ClockPort } from './clock.port';
import type { PasswordHasherPort } from './password-hasher.port';
import type { SessionTokenPort } from './session-token.port';
import { UsersDao } from './users.dao';

export type AuthModuleOptions = Readonly<{
  db: Database;
  env: Pick<Env, 'nodeEnv' | 'adminSeed'>;
  hasher: PasswordHasherPort;
  tokens: SessionTokenPort;
  clock: ClockPort;
}>;

export type AuthModule = Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
  guards: AuthGuards;
}>;

/** Wires the auth module: seeds the admin, builds DAOs and service, and returns the HTTP
 *  edge plus the guards other modules put on their routes.
 *
 *  Example: `const auth = await createAuthModule(options); await app.register(auth.plugin, { prefix: '/api' })` */
export async function createAuthModule(options: AuthModuleOptions): Promise<AuthModule> {
  const users = new UsersDao(options.db);
  await new AdminSeedService(users, options.hasher).seed(options.env.adminSeed);
  const service = new AuthService({
    users,
    sessions: new AuthSessionsDao(options.db),
    hasher: options.hasher,
    tokens: options.tokens,
    clock: options.clock,
    decoyHash: await options.hasher.hash(options.tokens.generate()),
  });
  const cookiePolicy = { secure: options.env.nodeEnv === 'production' };
  return {
    plugin: authRoutes(service, cookiePolicy),
    guards: createAuthGuards(service, cookiePolicy),
  };
}
