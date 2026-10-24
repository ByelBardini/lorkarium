import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Env } from '../../config/env';
import type { Database } from '../../database/database';
import { AdminSeedService } from './admin-seed.service';
import { AuthSessionsDao } from './auth-sessions.dao';
import { authRoutes, createAuthGuards, type AuthGuards } from './auth.routes';
import { AuthService } from './auth.service';
import type { ClockPort } from './clock.port';
import type { DataCipherPort } from './data-cipher.port';
import { EmailEncryptionBackfillService } from './email-encryption-backfill.service';
import type { PasswordHasherPort } from './password-hasher.port';
import { RecoveryCodesDao } from './recovery-codes.dao';
import type { SessionEndedPort } from './session-ended.port';
import type { SessionTokenPort } from './session-token.port';
import type { TotpPort } from './totp.port';
import { TwoFactorChallengesDao } from './two-factor-challenges.dao';
import { TwoFactorCheckService } from './two-factor-check.service';
import { TwoFactorDao } from './two-factor.dao';
import { TwoFactorLoginService } from './two-factor-login.service';
import { UsersDao } from './users.dao';

export type AuthModuleOptions = Readonly<{
  db: Database;
  env: Pick<Env, 'nodeEnv' | 'adminSeed'>;
  hasher: PasswordHasherPort;
  tokens: SessionTokenPort;
  clock: ClockPort;
  sessionEnded: SessionEndedPort;
  cipher: DataCipherPort;
  totp: TotpPort;
}>;

export type AuthModule = Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
  guards: AuthGuards;
  /** The one check of a second factor, also used by the account's 2FA routes. */
  twoFactorCheck: TwoFactorCheckService;
}>;

/** Wires the auth module: seals any e-mail still in clear, seeds the admin, builds DAOs and
 *  services, and returns the HTTP edge plus the guards other modules put on their routes.
 *
 *  Example: `const auth = await createAuthModule(options); await app.register(auth.plugin, { prefix: '/api' })` */
export async function createAuthModule(options: AuthModuleOptions): Promise<AuthModule> {
  const users = new UsersDao(options.db);
  await prepareAccounts(users, options);
  const twoFactorCheck = createTwoFactorCheck(options);
  const challenges = new TwoFactorChallengesDao(options.db);
  const auth = await createAuthService(options, { users, twoFactorCheck, challenges });
  const { tokens, clock } = options;
  const loginDeps = { challenges, users, check: twoFactorCheck, sessions: auth, tokens, clock };
  const twoFactorLogin = new TwoFactorLoginService(loginDeps);
  const cookiePolicy = { secure: options.env.nodeEnv === 'production' };
  return {
    plugin: authRoutes({ auth, twoFactorLogin }, cookiePolicy),
    guards: createAuthGuards(auth, cookiePolicy),
    twoFactorCheck,
  };
}

type AuthServiceParts = Readonly<{
  users: UsersDao;
  twoFactorCheck: TwoFactorCheckService;
  challenges: TwoFactorChallengesDao;
}>;

async function createAuthService(
  options: AuthModuleOptions,
  parts: AuthServiceParts,
): Promise<AuthService> {
  return new AuthService({
    users: parts.users,
    sessions: new AuthSessionsDao(options.db),
    hasher: options.hasher,
    tokens: options.tokens,
    clock: options.clock,
    cipher: options.cipher,
    decoyHash: await options.hasher.hash(options.tokens.generate()),
    sessionEnded: options.sessionEnded,
    twoFactor: parts.twoFactorCheck,
    challenges: parts.challenges,
  });
}

function createTwoFactorCheck(options: AuthModuleOptions): TwoFactorCheckService {
  return new TwoFactorCheckService({
    twoFactor: new TwoFactorDao(options.db),
    recoveryCodes: new RecoveryCodesDao(options.db),
    totp: options.totp,
    cipher: options.cipher,
    clock: options.clock,
  });
}

async function prepareAccounts(users: UsersDao, options: AuthModuleOptions): Promise<void> {
  const { cipher, hasher } = options;
  // Before the seed: it looks the admin up by the blind index. A no-op past migration 0039; it only
  // finishes a `pnpm db:encrypt-emails` that stopped between 0038 and the backfill.
  await new EmailEncryptionBackfillService(users, cipher).run();
  const seed = new AdminSeedService({ users, hasher, cipher, newId: randomUUID });
  await seed.seed(options.env.adminSeed);
}
