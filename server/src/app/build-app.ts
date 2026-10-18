import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Env } from '../config/env';
import type { Database } from '../database/database';
import { S3AssetStorage } from '../infrastructure/asset-storage/s3-asset-storage';
import { GuardedImageFetcher } from '../infrastructure/image-fetcher/guarded-image-fetcher';
import { SharpImageProcessor } from '../infrastructure/image-processor/sharp-image-processor';
import { createAssetsModule } from '../modules/assets/assets.plugin';
import { CryptoCampaignCode } from '../infrastructure/campaign-code/crypto-campaign-code';
import { SystemClock } from '../infrastructure/clock/system-clock';
import { Argon2PasswordHasher } from '../infrastructure/password-hasher/argon2-password-hasher';
import { CryptoSessionToken } from '../infrastructure/session-token/crypto-session-token';
import { createAuthModule } from '../modules/auth/auth.plugin';
import { SESSION_COOKIE, type AuthGuards } from '../modules/auth/auth.routes';
import { createCampaignsModule } from '../modules/campaigns/campaigns.plugin';
import { InMemoryPresenceRegistry } from '../infrastructure/presence-registry/in-memory-presence-registry';
import { TimerScheduler } from '../infrastructure/scheduler/timer-scheduler';
import { SocketIoSessionPublisher } from '../infrastructure/session-publisher/socket-io-session-publisher';
import { SocketIoBoardPublisher } from '../infrastructure/board-publisher/socket-io-board-publisher';
import { createBoardModule } from '../modules/board/board.plugin';
import { createDrawingsModule } from '../modules/drawings/drawings.plugin';
import { createEffectAreasModule } from '../modules/effect-areas/effect-areas.plugin';
import { createWallsModule } from '../modules/walls/walls.plugin';
import { createScenesModule } from '../modules/scenes/scenes.plugin';
import { createTokensModule } from '../modules/tokens/tokens.plugin';
import { createConditionsModule } from '../modules/conditions/conditions.plugin';
import { createCombatModule } from '../modules/combat/combat.plugin';
import { healthPlugin } from '../modules/health/health.plugin';
import {
  createSessionsModule,
  type SessionsModuleOptions,
} from '../modules/sessions/sessions.plugin';
import { attachRealtime } from '../realtime/realtime-server';

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
  await app.register(campaigns.plugin, { prefix: API_PREFIX });
  await app.register(healthPlugin, { prefix: API_PREFIX, db: deps.db });
  const storage = wireAssetStorage(app, new S3AssetStorage(deps.env.storage));
  const processor = new SharpImageProcessor();
  const fetcher = new GuardedImageFetcher();
  const assets = createAssetsModule({ db: deps.db, storage, processor, fetcher });
  await app.register(assets.plugin, { prefix: API_PREFIX });
  wireRealtime(app, auth.guards, { campaigns: campaigns.service, clock, db: deps.db });
  return app;
}

type RealtimeModules = Pick<SessionsModuleOptions, 'campaigns' | 'clock'> & { db: Database };

function wireRealtime(app: FastifyInstance, guards: AuthGuards, modules: RealtimeModules): void {
  const authenticate = guards.authenticateToken;
  const realtime = attachRealtime(app, { authenticate, sessionCookie: SESSION_COOKIE });
  const scheduler = new TimerScheduler();
  app.addHook('onClose', async () => scheduler.cancelAll());
  const { db, ...sessionModules } = modules;
  const sessions = createSessionsModule({
    ...sessionModules,
    registry: new InMemoryPresenceRegistry(),
    scheduler,
    publisher: new SocketIoSessionPublisher(realtime.io),
    realtime,
    log: app.log,
  });
  realtime.onConnection(sessions.gateway);
  const { clock } = modules;
  const publisher = new SocketIoBoardPublisher(realtime.io);
  const scenes = createScenesModule({ db, publisher, clock }).service;
  const tokensModule = createTokensModule({ db, publisher, clock });
  const { service: tokens, batch: tokenBatch, appearance: tokenAppearance } = tokensModule;
  const conditions = createConditionsModule({ db, publisher, clock }).service;
  const combat = createCombatModule({ db, publisher, clock }).service;
  const drawings = createDrawingsModule({ db, publisher, clock }).service;
  const effectAreas = createEffectAreasModule({ db, publisher, clock }).service;
  const walls = createWallsModule({ db, publisher, clock }).service;
  const board = createBoardModule({
    db,
    scenes,
    tokens,
    tokenBatch,
    tokenAppearance,
    conditions,
    combat,
    drawings,
    effectAreas,
    walls,
    clock,
    realtime,
    log: app.log,
  });
  realtime.onConnection(board.gateway);
}

// The bucket is ensured once per boot (dev, CI and integration alike), before the first request.
function wireAssetStorage(app: FastifyInstance, storage: S3AssetStorage): S3AssetStorage {
  app.addHook('onReady', async () => storage.ensureBucket());
  app.addHook('onClose', async () => storage.destroy());
  return storage;
}

function loggerOptions(env: Env): FastifyServerOptions['logger'] {
  return {
    level: env.nodeEnv === 'test' ? 'silent' : 'info',
    redact: { paths: REDACTED_LOG_PATHS, censor: '[redacted]' },
  };
}
