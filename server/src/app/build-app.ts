import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Env } from '../config/env';
import type { Database } from '../database/database';
import { CryptoCampaignCode } from '../infrastructure/campaign-code/crypto-campaign-code';
import { SystemClock } from '../infrastructure/clock/system-clock';
import { Argon2PasswordHasher } from '../infrastructure/password-hasher/argon2-password-hasher';
import { CryptoSessionToken } from '../infrastructure/session-token/crypto-session-token';
import { createAuthModule } from '../modules/auth/auth.plugin';
import type { AuthGuards } from '../modules/auth/auth.routes';
import { createCampaignsModule } from '../modules/campaigns/campaigns.plugin';
import { healthPlugin } from '../modules/health/health.plugin';

declare module 'fastify' {
  interface FastifyInstance {
    /** Decorated on the root, so every module plugin reaches it: `{ preHandler: app.authGuards.requireAuth }`. */
    authGuards: AuthGuards;
  }
}

export type AppDependencies = Readonly<{ env: Env; db: Database }>;

const API_PREFIX = '/api';

// Session tokens travel in these headers; a log line must never carry one.
const REDACTED_LOG_PATHS = ['req.headers.cookie', 'res.headers["set-cookie"]'];

/** The Fastify app with every module registered under `/api`; the caller listens and closes.
 *
 *  Example: `await (await buildApp({ env, db })).listen({ port: env.port })` */
export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions(deps.env) });
  await app.register(cookie);
  const hasher = new Argon2PasswordHasher();
  const clock = new SystemClock();
  const tokens = new CryptoSessionToken();
  const auth = await createAuthModule({ db: deps.db, env: deps.env, hasher, tokens, clock });
  app.decorate('authGuards', auth.guards);
  await app.register(auth.plugin, { prefix: API_PREFIX });
  const codes = new CryptoCampaignCode();
  const campaigns = createCampaignsModule({ db: deps.db, hasher, codes, clock });
  await app.register(campaigns, { prefix: API_PREFIX });
  await app.register(healthPlugin, { prefix: API_PREFIX, db: deps.db });
  return app;
}

function loggerOptions(env: Env): FastifyServerOptions['logger'] {
  return {
    level: env.nodeEnv === 'test' ? 'silent' : 'info',
    redact: { paths: REDACTED_LOG_PATHS, censor: '[redacted]' },
  };
}
