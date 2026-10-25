import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Env } from '../config/env';
import { S3AccessLogArchive } from '../infrastructure/access-log-archive/s3-access-log-archive';
import { TimerScheduler } from '../infrastructure/scheduler/timer-scheduler';
import type { AccessLogArchivePort } from '../modules/access-log/access-log-archive.port';
import {
  createAccessLogModule,
  type AccessLogModule,
} from '../modules/access-log/access-log.plugin';
import type { AuthGuards } from '../modules/auth/auth.routes';
import type { ClockPort } from '../modules/auth/clock.port';

export type AccessLogWiring = Readonly<{
  env: Env;
  clock: ClockPort;
  /** A spec's fake; without it, the S3 archive of `env.accessLog`, or no access log at all. */
  archive?: AccessLogArchivePort | undefined;
}>;

type ChosenArchive = Readonly<{ archive: AccessLogArchivePort; release: () => void }>;

/** The access log on the root `onResponse`, started on `onReady` (a refused boot marker fails the
 *  boot) and closed with the app, last batch written; `null` when off (dev and tests without
 *  `ACCESS_LOG_S3_BUCKET`). The caller hands `gateway` to the realtime server.
 *
 *  Example: `const accessLog = wireAccessLog(app, { env, clock })` */
export function wireAccessLog(
  app: FastifyInstance,
  wiring: AccessLogWiring,
): AccessLogModule | null {
  const chosen = archiveOf(wiring);
  if (!chosen) return null;
  const accessLog = createAccessLogModule({
    archive: chosen.archive,
    clock: wiring.clock,
    scheduler: new TimerScheduler(),
    bootId: randomUUID().slice(0, 8),
    log: app.log,
    trustProxyHops: wiring.env.trustProxyHops,
    accountOf: (request) => accountOf(app.authGuards, request),
  });
  app.addHook('onResponse', accessLog.onResponse);
  app.addHook('onReady', async () => accessLog.service.start());
  // One hook, in this order: the client is destroyed only after the last batch is written.
  app.addHook('onClose', async () => {
    await accessLog.service.close();
    chosen.release();
  });
  return accessLog;
}

function archiveOf(wiring: AccessLogWiring): ChosenArchive | null {
  if (wiring.archive) return { archive: wiring.archive, release: () => undefined };
  if (!wiring.env.accessLog) return null;
  const s3 = new S3AccessLogArchive(wiring.env.accessLog);
  return { archive: s3, release: () => s3.destroy() };
}

// `userOf` throws when no guard ran on the request: the login, `/auth/me`, the health check, the SPA.
function accountOf(guards: AuthGuards, request: FastifyRequest): string | null {
  try {
    return guards.userOf(request).id;
  } catch {
    return null;
  }
}
