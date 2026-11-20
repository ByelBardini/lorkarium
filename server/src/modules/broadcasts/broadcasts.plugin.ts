import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { MailerPort } from '../account-security/mailer.port';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { TwoFactorCheckService } from '../auth/two-factor-check.service';
import { UsersDao } from '../auth/users.dao';
import type { SchedulerPort } from '../sessions/scheduler.port';
import { BroadcastSenderService, type BroadcastSenderLog } from './broadcast-sender.service';
import { BroadcastAudienceDao } from './broadcast-audience.dao';
import { broadcastsRoutes } from './broadcasts.routes';
import { BroadcastsService, type BroadcastConfirmationRunner } from './broadcasts.service';
import { MailBroadcastDeliveriesDao } from './mail-broadcast-deliveries.dao';
import { MailBroadcastsDao } from './mail-broadcasts.dao';
import type { SendPacePort } from './send-pace.port';

export type BroadcastsModuleOptions = Readonly<{
  db: Database;
  cipher: DataCipherPort;
  mailer: MailerPort;
  clock: ClockPort;
  twoFactor: Pick<TwoFactorCheckService, 'isEnabled'>;
  appPublicUrl: string;
  /** `MAIL_REPLY_TO`, or null. */
  replyTo: string | null;
  scheduler: SchedulerPort;
  pace: SendPacePort;
  log: BroadcastSenderLog;
}>;

export type BroadcastsModule = Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
  service: BroadcastsService;
  /** Started on the app's `onReady`, closed on its `onClose` (`wireBroadcasts`). */
  sender: BroadcastSenderService;
}>;

/** Wires the backoffice notices: DAOs, service, the HTTP edge and the sender of the queue.
 *  Needs `app.authGuards`.
 *
 *  Example: `await app.register(createBroadcastsModule(options).plugin, { prefix: '/api' })` */
export function createBroadcastsModule(options: BroadcastsModuleOptions): BroadcastsModule {
  const { db, cipher, mailer, clock, twoFactor, appPublicUrl, replyTo } = options;
  const confirmation: BroadcastConfirmationRunner = (work) =>
    runInTransaction(db, (tx) =>
      work({ broadcasts: new MailBroadcastsDao(tx), audience: new BroadcastAudienceDao(tx) }),
    );
  const service = new BroadcastsService({
    broadcasts: new MailBroadcastsDao(db),
    audience: new BroadcastAudienceDao(db),
    confirmation,
    accounts: new UsersDao(db),
    ...{ twoFactor, cipher, mailer, clock, appPublicUrl, replyTo },
  });
  const sender = new BroadcastSenderService({
    deliveries: new MailBroadcastDeliveriesDao(db),
    ...{ cipher, mailer, clock, appPublicUrl, replyTo },
    ...{ scheduler: options.scheduler, pace: options.pace, log: options.log },
  });
  return { plugin: broadcastsRoutes(service), service, sender };
}
