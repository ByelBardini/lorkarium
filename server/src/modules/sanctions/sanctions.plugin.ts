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
import { AccountSanctionsDao } from './account-sanctions.dao';
import { sanctionsRoutes } from './sanctions.routes';
import {
  SanctionsService,
  type AccountDeletion,
  type SanctionTransactionRunner,
} from './sanctions.service';

export type SanctionsModuleOptions = Readonly<{
  db: Database;
  /** The user-admin module's service: a ban goes through its deletion. */
  deletion: AccountDeletion;
  sessionEnded: SessionEndedPort;
  notices: Pick<SecurityNoticesService, 'send'>;
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
export function createSanctionsModule(
  options: SanctionsModuleOptions,
): Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }> {
  const transaction: SanctionTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({
        accounts: new UserAdminDao(tx),
        sanctions: new AccountSanctionsDao(tx),
        sessions: new AuthSessionsDao(tx),
        passwordResets: new PasswordResetsDao(tx),
      }),
    );
  const { db, ...rest } = options;
  const service = new SanctionsService({
    ...rest,
    accounts: new UserAdminDao(db),
    sanctions: new AccountSanctionsDao(db),
    transaction,
  });
  return { plugin: sanctionsRoutes(service) };
}
