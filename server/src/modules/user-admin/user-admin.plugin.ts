import type { AdminInvitationDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import { InvitationsDao } from '../account-links/invitations.dao';
import { PasswordResetsDao } from '../account-links/password-resets.dao';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import { StorageDeletionsDao } from '../assets/storage-deletions.dao';
import { FeedbackAttachmentsDao } from '../feedback/feedback-attachments.dao';
import { AuthSessionsDao } from '../auth/auth-sessions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { SessionEndedPort } from '../auth/session-ended.port';
import type { MailerPort } from '../account-security/mailer.port';
import type { ProfileChangedPort } from '../profiles/profile-changed.port';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { MailSamplesService } from './mail-samples.service';
import type { OwnerLimitsPort } from './owner-limits.port';
import type { RevokedSeatsPort } from './revoked-seats.port';
import { UserAdminDao } from './user-admin.dao';
import { AccountSanctionsDao } from '../sanctions/account-sanctions.dao';
import { BannedEmailIndexesDao } from '../sanctions/banned-email-indexes.dao';
import type { CampaignChangedPort } from '../campaigns/campaign-changed.port';
import { userAdminRoutes } from './user-admin.routes';
import { UserAdminService, type UserAdminTransactionRunner } from './user-admin.service';

export type UserAdminModuleOptions = Readonly<{
  db: Database;
  /** The pending invitations, listed by the account-links module. */
  invitations: Readonly<{ listPending(): Promise<AdminInvitationDto[]> }>;
  sessionEnded: SessionEndedPort;
  memberships: Readonly<{ forgetUser(userId: string): void; forgetCampaign(id: string): void }>;
  /** The live session: a shared table deleted with its owner sends its members away. */
  tables: Pick<CampaignChangedPort, 'campaignDeleted'>;
  /** The campaigns module's `JuggernautService`: tells the tables what the demotion revoked. */
  juggernauts: RevokedSeatsPort;
  /** The live session service: a changed plan or role reaches the tables' rosters. */
  profiles: ProfileChangedPort;
  /** The campaigns module's settings service: a changed plan reaches the owner's tables. */
  ownedTables: OwnerLimitsPort;
  notices: Pick<SecurityNoticesService, 'send'>;
  cipher: DataCipherPort;
  clock: ClockPort;
  appPublicUrl: string;
  /** The app's mailer, for the mail test (a failure is shown, not swallowed). */
  mailer: MailerPort;
  /** The landing, for the mail test's rule links. */
  sitePublicUrl: string;
}>;

export type UserAdminModule = Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
  /** For the sanctions module: a ban goes through this deletion. */
  service: UserAdminService;
}>;

/** Wires the backoffice over the accounts (`/admin/users`). Needs `app.authGuards`.
 *
 *  Example: `await app.register(createUserAdminModule(options).plugin, { prefix: '/api' })` */
export function createUserAdminModule(options: UserAdminModuleOptions): UserAdminModule {
  const transaction: UserAdminTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({
        accounts: new UserAdminDao(tx),
        sessions: new AuthSessionsDao(tx),
        passwordResets: new PasswordResetsDao(tx),
        invitations: new InvitationsDao(tx),
        adminSeats: new CampaignMembersDao(tx),
        deletions: new StorageDeletionsDao(tx),
        bannedEmails: new BannedEmailIndexesDao(tx),
        feedbackShots: new FeedbackAttachmentsDao(tx),
        scheduledBans: new AccountSanctionsDao(tx),
      }),
    );
  const { db, mailer, sitePublicUrl, ...rest } = options;
  const service = new UserAdminService({ ...rest, accounts: new UserAdminDao(db), transaction });
  const mailTest = new MailSamplesService({
    mailer,
    appPublicUrl: options.appPublicUrl,
    sitePublicUrl,
    clock: options.clock,
  });
  return { plugin: userAdminRoutes(service, mailTest), service };
}
