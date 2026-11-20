import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import { PasswordResetsDao } from '../account-links/password-resets.dao';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import { AuthSessionsDao } from '../auth/auth-sessions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { SessionEndedPort } from '../auth/session-ended.port';
import { UserAdminDao } from '../user-admin/user-admin.dao';
import type { UserAdminService } from '../user-admin/user-admin.service';
import { AccountSanctionsDao } from './account-sanctions.dao';
import { SanctionFollowUpService, type SanctionFollowUpLog } from './sanction-follow-up.service';
import { SanctionNoticeService } from './sanction-notice.service';
import { sanctionsRoutes } from './sanctions.routes';
import { SanctionsService, type SanctionTransactionRunner } from './sanctions.service';

export type SanctionsModuleOptions = Readonly<{
  db: Database;
  /** The user-admin module's service: a ban checks its deletion now and runs it when due. */
  deletion: Pick<UserAdminService, 'deletionCheck' | 'executeDeletion'>;
  sessionEnded: SessionEndedPort;
  notices: Pick<SecurityNoticesService, 'send' | 'deliver'>;
  /** Where a due ban that could not delete is reported (`app.log`). */
  log: SanctionFollowUpLog;
  cipher: DataCipherPort;
  clock: ClockPort;
  appPublicUrl: string;
  sitePublicUrl: string;
  /** `MAIL_REPLY_TO` (`env.mailReplyTo`). */
  replyTo: string | null;
}>;

/** Wires the measures (`/admin/users/:userId/sanctions`, `/admin/sanctions/:sanctionId/appeal`).
 *  Needs `app.authGuards`.
 *
 *  Example: `await app.register(createSanctionsModule(options).plugin, { prefix: '/api' })` */
export function createSanctionsModule(options: SanctionsModuleOptions): Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
  /** For the hourly housekeeping: missed e-mails again, then the bans that are due. */
  followUp: SanctionFollowUpService;
}> {
  const transaction: SanctionTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({
        accounts: new UserAdminDao(tx),
        sanctions: new AccountSanctionsDao(tx),
        sessions: new AuthSessionsDao(tx),
        passwordResets: new PasswordResetsDao(tx),
      }),
    );
  const { db, deletion, sessionEnded, notices, cipher, clock, appPublicUrl } = options;
  const accounts = new UserAdminDao(db);
  const sanctions = new AccountSanctionsDao(db);
  const mailing = { cipher, clock, appPublicUrl, sitePublicUrl: options.sitePublicUrl };
  const notice = new SanctionNoticeService({
    ...{ notices, sanctions, replyTo: options.replyTo },
    ...mailing,
  });
  const service = new SanctionsService({
    ...{ accounts, sanctions, transaction, deletion, sessionEnded, notice, notices },
    ...{ cipher, clock, appPublicUrl },
  });
  const log = options.log;
  const followUp = new SanctionFollowUpService({
    sanctions,
    accounts,
    notice,
    deletion,
    clock,
    log,
  });
  return { plugin: sanctionsRoutes(service), followUp };
}
