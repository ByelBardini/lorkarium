import cookie from '@fastify/cookie';
import { AVATAR_MAX_BYTES } from '@lorkarium/contracts';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Env } from '../config/env';
import type { Database } from '../database/database';
import { S3AssetStorage } from '../infrastructure/asset-storage/s3-asset-storage';
import { GuardedImageFetcher } from '../infrastructure/image-fetcher/guarded-image-fetcher';
import { SharpImageProcessor } from '../infrastructure/image-processor/sharp-image-processor';
import { createAssetsModule } from '../modules/assets/assets.plugin';
import { SharpAvatarProcessor } from '../infrastructure/avatar-processor/sharp-avatar-processor';
import { createProfilesModule } from '../modules/profiles/profiles.plugin';
import type { ProfileChangedPort } from '../modules/profiles/profile-changed.port';
import { CryptoCampaignCode } from '../infrastructure/campaign-code/crypto-campaign-code';
import { AesGcmDataCipher } from '../infrastructure/data-cipher/aes-gcm-data-cipher';
import { SystemClock } from '../infrastructure/clock/system-clock';
import { SocketIoSessionEnded } from '../infrastructure/session-ended/socket-io-session-ended';
import { Argon2PasswordHasher } from '../infrastructure/password-hasher/argon2-password-hasher';
import { CryptoSessionToken } from '../infrastructure/session-token/crypto-session-token';
import { OtpauthTotp } from '../infrastructure/totp/otpauth-totp';
import type { MailerPort } from '../modules/account-security/mailer.port';
import { createAuthModule } from '../modules/auth/auth.plugin';
import type { ClockPort } from '../modules/auth/clock.port';
import { SESSION_COOKIE, type AuthGuards } from '../modules/auth/auth.routes';
import type { MembershipReader } from '../modules/campaigns/cached-memberships';
import { createCampaignsModule } from '../modules/campaigns/campaigns.plugin';
import { InMemoryPresenceRegistry } from '../infrastructure/presence-registry/in-memory-presence-registry';
import type { CampaignChangedPort } from '../modules/campaigns/campaign-changed.port';
import type { MemberRoleChangedPort } from '../modules/campaigns/member-role-changed.port';
import { TimerScheduler } from '../infrastructure/scheduler/timer-scheduler';
import { SocketIoSessionPublisher } from '../infrastructure/session-publisher/socket-io-session-publisher';
import { SocketIoBoardPublisher } from '../infrastructure/board-publisher/socket-io-board-publisher';
import { SocketIoLibraryPublisher } from '../infrastructure/library-publisher/socket-io-library-publisher';
import { SocketIoSceneAudience } from '../infrastructure/scene-audience/socket-io-scene-audience';
import { SocketIoGridAudience } from '../infrastructure/grid-audience/socket-io-grid-audience';
import { SocketIoPingPublisher } from '../infrastructure/ping-publisher/socket-io-ping-publisher';
import { CommandRateLimitedError } from '../modules/board/board.error';
import { createBoardModule } from '../modules/board/board.plugin';
import { createDrawingsModule } from '../modules/drawings/drawings.plugin';
import { createEffectAreasModule } from '../modules/effect-areas/effect-areas.plugin';
import { createLightsModule } from '../modules/lights/lights.plugin';
import { SceneWallsService } from '../modules/walls/scene-walls.service';
import { createWallsModule } from '../modules/walls/walls.plugin';
import { createScenesModule } from '../modules/scenes/scenes.plugin';
import { createLibraryModule } from '../modules/library/library.plugin';
import { createSavedRollsModule } from '../modules/saved-rolls/saved-rolls.plugin';
import { createTokensModule } from '../modules/tokens/tokens.plugin';
import { createMemberCardsModule } from '../modules/member-cards/member-cards.plugin';
import { createPingsModule } from '../modules/pings/pings.plugin';
import { createConditionsModule } from '../modules/conditions/conditions.plugin';
import { createCombatModule } from '../modules/combat/combat.plugin';
import { healthPlugin } from '../modules/health/health.plugin';
import { legalPlugin } from '../modules/legal/legal.plugin';
import { PresenceReaderService } from '../modules/sessions/presence-reader.service';
import {
  createSessionsModule,
  type SessionsModuleOptions,
} from '../modules/sessions/sessions.plugin';
import { CampaignCommandQueue } from '../realtime/campaign-command-queue';
import { CommandRateGuard } from '../realtime/command-rate-guard';
import { attachRealtime } from '../realtime/realtime-server';
import type { AccessLogArchivePort } from '../modules/access-log/access-log-archive.port';
import type { AccessLogModule } from '../modules/access-log/access-log.plugin';
import { wireAccessLog } from './wire-access-log';
import { mailerOf, wireAccountSecurity } from './wire-account-security';
import { serveClient } from './serve-client';
import { trustProxyOf } from './trust-proxy';
import { wireBackoffice } from './wire-backoffice';
import { wireDice } from './wire-dice';

declare module 'fastify' {
  interface FastifyInstance {
    /** Decorated on the root, so every module plugin reaches it: `{ preHandler: app.authGuards.requireAuth }`. */
    authGuards: AuthGuards;
  }
}

/** `clock` defaults to the system clock, `mailer` to the one of `env.mailer` and
 *  `accessLogArchive` to the bucket of `env.accessLog`; integration specs pass fakes to cross a
 *  deadline or read what was sent or recorded. */
export type AppDependencies = Readonly<{
  env: Env;
  db: Database;
  clock?: ClockPort;
  mailer?: MailerPort;
  accessLogArchive?: AccessLogArchivePort;
}>;

const API_PREFIX = '/api';

// Session tokens travel in these headers; a log line must never carry one.
const REDACTED_LOG_PATHS = ['req.headers.cookie', 'res.headers["set-cookie"]'];

/** The Fastify app with every module registered under `/api`; the caller listens and closes.
 *
 *  Example: `await (await buildApp({ env, db })).listen({ port: env.port })` */
export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const trustProxy = trustProxyOf(deps.env.trustProxyHops);
  const app = Fastify({ logger: loggerOptions(deps.env), trustProxy });
  await app.register(cookie);
  const hasher = new Argon2PasswordHasher();
  const clock = deps.clock ?? new SystemClock();
  const tokens = new CryptoSessionToken();
  const sessionEnded = new SocketIoSessionEnded();
  const cipher = new AesGcmDataCipher(deps.env.dataEncryptionKey);
  const totp = new OtpauthTotp();
  const authOptions = { db: deps.db, env: deps.env, hasher, tokens, clock, sessionEnded, cipher };
  const auth = await createAuthModule({ ...authOptions, totp });
  app.decorate('authGuards', auth.guards);
  await app.register(auth.plugin, { prefix: API_PREFIX });
  const { env } = deps;
  const mailer = deps.mailer ?? mailerOf(app, env.mailer);
  const accountSecurity = { ...authOptions, totp, twoFactorCheck: auth.twoFactorCheck, mailer };
  const { appPublicUrl } = env;
  const security = await wireAccountSecurity(app, { ...accountSecurity, appPublicUrl }, API_PREFIX);
  const codes = new CryptoCampaignCode();
  // One registry for both: the live session writes it, the campaign detail reads who is online.
  const registry = new InMemoryPresenceRegistry();
  const presence = new PresenceReaderService(registry);
  const campaigns = createCampaignsModule({ db: deps.db, hasher, codes, clock, presence });
  await app.register(healthPlugin, { prefix: API_PREFIX, db: deps.db });
  await app.register(legalPlugin, { prefix: API_PREFIX, sitePublicUrl: env.sitePublicUrl });
  const storage = wireAssetStorage(app, new S3AssetStorage(deps.env.storage));
  // After the asset bucket is ensured: dev and CI keep the access log in that same bucket.
  const accessLog = wireAccessLog(app, { env, clock, archive: deps.accessLogArchive });
  const processor = new SharpImageProcessor();
  const fetcher = new GuardedImageFetcher();
  const assets = createAssetsModule({ db: deps.db, storage, processor, fetcher });
  await app.register(assets.plugin, { prefix: API_PREFIX });
  const { memberships } = campaigns;
  const realtimeModules = {
    campaigns: campaigns.service,
    clock,
    db: deps.db,
    sessionEnded,
    memberships,
    registry,
    accessLog,
  };
  const outlets = wireRealtime(app, auth.guards, realtimeModules);
  // Registered once the live session exists: each saved campaign change reaches its room.
  const { campaignChanged, memberRoleChanged } = outlets;
  await app.register(campaigns.pluginWith(campaignChanged, memberRoleChanged), {
    prefix: API_PREFIX,
  });
  const { audience, libraryPublisher: publisher, boardPublisher: grids } = outlets;
  const library = createLibraryModule({ db: deps.db, publisher, audience, grids, clock });
  await app.register(library.plugin, { prefix: API_PREFIX });
  await app.register(createSavedRollsModule({ db: deps.db }).plugin, { prefix: API_PREFIX });
  const { profileChanged } = outlets;
  const avatars = new SharpAvatarProcessor();
  // Capped at the photo's limit: a larger link is cut while it downloads, not after.
  const avatarFetcher = new GuardedImageFetcher({ maxBytes: AVATAR_MAX_BYTES });
  const profilesOptions = {
    db: deps.db,
    storage,
    processor: avatars,
    profileChanged,
    fetcher: avatarFetcher,
  };
  const profiles = createProfilesModule(profilesOptions);
  await app.register(profiles.plugin, { prefix: API_PREFIX });
  const { notices, recovery } = security;
  const links = { ...authOptions, sessions: auth.sessions, notices, recovery, appPublicUrl };
  await wireBackoffice(app, { ...links, memberships, storage, mailer }, API_PREFIX);
  // After every /api route: its not-found handler answers the SPA for the rest.
  if (env.clientDistDir) await serveClient(app, env.clientDistDir);
  return app;
}

type RealtimeModules = Pick<SessionsModuleOptions, 'campaigns' | 'clock' | 'registry'> & {
  db: Database;
  sessionEnded: SocketIoSessionEnded;
  memberships: MembershipReader;
  accessLog: AccessLogModule | null;
};

// What the HTTP modules that announce changes or move sockets use, over the same Socket.IO server.
type RealtimeOutlets = Readonly<{
  audience: SocketIoSceneAudience;
  libraryPublisher: SocketIoLibraryPublisher;
  boardPublisher: SocketIoBoardPublisher;
  /** The live session service: a saved profile reaches every live table of the person. */
  profileChanged: ProfileChangedPort;
  /** The same service: a saved or deleted campaign reaches its live table. */
  campaignChanged: CampaignChangedPort;
  /** The same service: a member's saved role reaches the live table and moves their rooms. */
  memberRoleChanged: MemberRoleChangedPort;
}>;

function wireRealtime(
  app: FastifyInstance,
  guards: AuthGuards,
  modules: RealtimeModules,
): RealtimeOutlets {
  const { db, sessionEnded, memberships: members, accessLog, ...sessionModules } = modules;
  const { clock } = modules;
  const authenticate = guards.authenticateConnection;
  const realtime = attachRealtime(app, { authenticate, sessionCookie: SESSION_COOKIE, clock });
  sessionEnded.attach(realtime);
  // First listener: the connection is recorded before any gateway can drop it.
  if (accessLog) realtime.onConnection(accessLog.gateway);
  const rate = new CommandRateGuard(clock, (socketId, retryAfterSeconds) => {
    return new CommandRateLimitedError(socketId, retryAfterSeconds);
  });
  const scheduler = new TimerScheduler();
  app.addHook('onClose', async () => scheduler.cancelAll());
  const publisher = new SocketIoBoardPublisher(realtime.io);
  const shared = { db, publisher, clock, members };
  const outlets = {
    audience: new SocketIoSceneAudience(realtime.io),
    libraryPublisher: new SocketIoLibraryPublisher(realtime.io),
    boardPublisher: publisher,
  };
  const { audience, libraryPublisher } = outlets;
  const scenesModule = createScenesModule({ ...shared, audience, libraryPublisher });
  const { service: scenes, watch: sceneWatch, activation: sceneActivation } = scenesModule;
  const sessions = createSessionsModule({
    ...sessionModules,
    groupGrid: sceneWatch,
    scheduler,
    publisher: new SocketIoSessionPublisher(realtime.io),
    realtime,
    rate,
    log: app.log,
  });
  realtime.onConnection(sessions.gateway);
  const { service: profileChanged, service: campaignChanged } = sessions;
  const { service: memberRoleChanged } = sessions;
  const sceneWalls = new SceneWallsService();
  const tokensModule = createTokensModule({ ...shared, sceneWalls });
  const { service: tokens, batch: tokenBatch, appearance: tokenAppearance } = tokensModule;
  const { mainToken, link: tokenLink, visibility: tokenVisibility } = tokensModule;
  const { service: conditions, catalog: conditionCatalog } = createConditionsModule(shared);
  const combat = createCombatModule(shared).service;
  const drawings = createDrawingsModule(shared).service;
  const effectAreas = createEffectAreasModule(shared).service;
  const walls = createWallsModule({ ...shared, sceneWalls }).service;
  const lights = createLightsModule(shared).service;
  const memberCards = createMemberCardsModule(shared).service;
  const pings = createPingsModule({
    members,
    audience: new SocketIoGridAudience(realtime.io),
    publisher: new SocketIoPingPublisher(realtime.io),
    clock,
  }).service;
  const board = createBoardModule({
    db,
    members,
    scenes,
    sceneWatch,
    sceneActivation,
    tokens,
    tokenBatch,
    tokenAppearance,
    mainToken,
    tokenVisibility,
    tokenLink,
    memberCards,
    pings,
    conditions,
    conditionCatalog,
    combat,
    drawings,
    effectAreas,
    walls,
    lights,
    clock,
    realtime,
    rate,
    queue: new CampaignCommandQueue(),
    log: app.log,
  });
  realtime.onConnection(board.gateway);
  wireDice(realtime, { db, members, clock, log: app.log });
  return { ...outlets, profileChanged, campaignChanged, memberRoleChanged };
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
