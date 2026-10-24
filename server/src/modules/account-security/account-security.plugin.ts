import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import { AuthSessionsDao } from '../auth/auth-sessions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import { RecoveryCodesDao } from '../auth/recovery-codes.dao';
import type { SessionEndedPort } from '../auth/session-ended.port';
import type { SessionTokenPort } from '../auth/session-token.port';
import type { TotpPort } from '../auth/totp.port';
import type { TwoFactorCheckService } from '../auth/two-factor-check.service';
import { TwoFactorChallengesDao } from '../auth/two-factor-challenges.dao';
import { TwoFactorDao } from '../auth/two-factor.dao';
import { UsersDao } from '../auth/users.dao';
import { AccountRecoveryTokensDao } from './account-recovery-tokens.dao';
import { registerAccountRecoveryRoutes } from './account-recovery.routes';
import { AccountRecoveryService, type RecoveryTransactionRunner } from './account-recovery.service';
import { accountSecurityRoutes } from './account-security.routes';
import { AccountSecurityService } from './account-security.service';
import { AccountSessionsService } from './account-sessions.service';
import { AccountTwoFactorService } from './account-two-factor.service';
import { CurrentPasswordService } from './current-password.service';
import { EmailChangeRequestsDao } from './email-change-requests.dao';
import { EmailChangeService } from './email-change.service';
import type { MailerPort } from './mailer.port';
import type { QrCodePort } from './qr-code.port';
import type { RecoveryCodePort } from './recovery-code.port';
import { SecurityNoticesService, type MailFailureReport } from './security-notices.service';
import { registerTwoFactorRoutes } from './two-factor.routes';

export type AccountSecurityModuleOptions = Readonly<{
  db: Database;
  appPublicUrl: string;
  hasher: PasswordHasherPort;
  tokens: SessionTokenPort;
  clock: ClockPort;
  cipher: DataCipherPort;
  sessionEnded: SessionEndedPort;
  mailer: MailerPort;
  reportMailFailure: MailFailureReport;
  totp: TotpPort;
  qr: QrCodePort;
  codes: RecoveryCodePort;
  /** The auth module's check of a second factor (the login uses the same one). */
  twoFactorCheck: TwoFactorCheckService;
}>;

export type AccountSecurityModule = Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
  /** Best-effort notices by e-mail, for the backoffice's mails too. */
  notices: SecurityNoticesService;
  /** The "Não fui eu" links, for any notice of a password change. */
  recovery: AccountRecoveryService;
}>;

type SharedParts = Readonly<{
  users: UsersDao;
  currentPassword: CurrentPasswordService;
  twoFactor: TwoFactorDao;
  recoveryCodes: RecoveryCodesDao;
  emailChanges: EmailChangeRequestsDao;
  notices: SecurityNoticesService;
  recovery: AccountRecoveryService;
}>;

/** Wires the account's security routes (password, sessions, e-mail, 2FA) over the auth tables.
 *
 *  Example: `await app.register(createAccountSecurityModule(options).plugin, { prefix: '/api' })` */
export function createAccountSecurityModule(
  options: AccountSecurityModuleOptions,
): AccountSecurityModule {
  const parts = sharedParts(options);
  const sessions = new AuthSessionsDao(options.db);
  const { clock, sessionEnded } = options;
  const routes = accountSecurityRoutes({
    security: new AccountSecurityService({ ...options, ...parts, sessions }),
    sessions: new AccountSessionsService({ sessions, sessionEnded, clock }),
    emailChange: createEmailChange(options, parts),
  });
  const twoFactor = createAccountTwoFactor(options, parts);
  // One context: the 2FA and recovery routes share the limiter and the error handler of `routes`.
  const plugin = async (app: FastifyInstance): Promise<void> => {
    await routes(app);
    registerTwoFactorRoutes(app, twoFactor);
    registerAccountRecoveryRoutes(app, parts.recovery);
  };
  return { plugin, notices: parts.notices, recovery: parts.recovery };
}

function sharedParts(options: AccountSecurityModuleOptions): SharedParts {
  const users = new UsersDao(options.db);
  const emailChanges = new EmailChangeRequestsDao(options.db);
  return {
    users,
    currentPassword: new CurrentPasswordService(users, options.hasher),
    twoFactor: new TwoFactorDao(options.db),
    recoveryCodes: new RecoveryCodesDao(options.db),
    emailChanges,
    notices: new SecurityNoticesService(options.mailer, options.reportMailFailure),
    recovery: createAccountRecovery(options, emailChanges),
  };
}

function createAccountRecovery(
  options: AccountSecurityModuleOptions,
  emailChanges: EmailChangeRequestsDao,
): AccountRecoveryService {
  const transaction: RecoveryTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({
        tokens: new AccountRecoveryTokensDao(tx),
        users: new UsersDao(tx),
        emailChanges: new EmailChangeRequestsDao(tx),
        sessions: new AuthSessionsDao(tx),
        challenges: new TwoFactorChallengesDao(tx),
      }),
    );
  return new AccountRecoveryService({
    tokens: new AccountRecoveryTokensDao(options.db),
    emailChanges,
    transaction,
    linkTokens: options.tokens,
    hasher: options.hasher,
    cipher: options.cipher,
    clock: options.clock,
    sessionEnded: options.sessionEnded,
    appPublicUrl: options.appPublicUrl,
  });
}

function createEmailChange(
  options: AccountSecurityModuleOptions,
  parts: SharedParts,
): EmailChangeService {
  return new EmailChangeService({
    users: parts.users,
    currentPassword: parts.currentPassword,
    requests: parts.emailChanges,
    notices: parts.notices,
    tokens: options.tokens,
    cipher: options.cipher,
    clock: options.clock,
    mailer: options.mailer,
    appPublicUrl: options.appPublicUrl,
    recovery: parts.recovery,
  });
}

function createAccountTwoFactor(
  options: AccountSecurityModuleOptions,
  parts: SharedParts,
): AccountTwoFactorService {
  return new AccountTwoFactorService({
    users: parts.users,
    currentPassword: parts.currentPassword,
    twoFactor: parts.twoFactor,
    recoveryCodes: parts.recoveryCodes,
    notices: parts.notices,
    check: options.twoFactorCheck,
    totp: options.totp,
    qr: options.qr,
    codes: options.codes,
    cipher: options.cipher,
    clock: options.clock,
    appPublicUrl: options.appPublicUrl,
  });
}
