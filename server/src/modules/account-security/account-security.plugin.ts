import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { AuthSessionsDao } from '../auth/auth-sessions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import { RecoveryCodesDao } from '../auth/recovery-codes.dao';
import type { SessionEndedPort } from '../auth/session-ended.port';
import type { SessionTokenPort } from '../auth/session-token.port';
import type { TotpPort } from '../auth/totp.port';
import type { TwoFactorCheckService } from '../auth/two-factor-check.service';
import { TwoFactorDao } from '../auth/two-factor.dao';
import { UsersDao } from '../auth/users.dao';
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

type SharedParts = Readonly<{
  users: UsersDao;
  currentPassword: CurrentPasswordService;
  twoFactor: TwoFactorDao;
  recoveryCodes: RecoveryCodesDao;
  emailChanges: EmailChangeRequestsDao;
  notices: SecurityNoticesService;
}>;

/** Wires the account's security routes (password, sessions, e-mail, 2FA) over the auth tables.
 *
 *  Example: `await app.register(createAccountSecurityModule(options).plugin, { prefix: '/api' })` */
export function createAccountSecurityModule(
  options: AccountSecurityModuleOptions,
): Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }> {
  const parts = sharedParts(options);
  const sessions = new AuthSessionsDao(options.db);
  const { clock, sessionEnded } = options;
  const routes = accountSecurityRoutes({
    security: new AccountSecurityService({ ...options, ...parts, sessions }),
    sessions: new AccountSessionsService({ sessions, sessionEnded, clock }),
    emailChange: createEmailChange(options, parts),
  });
  const twoFactor = createAccountTwoFactor(options, parts);
  // One context: the 2FA routes share the limiter and the error handler set by `routes`.
  const plugin = async (app: FastifyInstance): Promise<void> => {
    await routes(app);
    registerTwoFactorRoutes(app, twoFactor);
  };
  return { plugin };
}

function sharedParts(options: AccountSecurityModuleOptions): SharedParts {
  const users = new UsersDao(options.db);
  return {
    users,
    currentPassword: new CurrentPasswordService(users, options.hasher),
    twoFactor: new TwoFactorDao(options.db),
    recoveryCodes: new RecoveryCodesDao(options.db),
    emailChanges: new EmailChangeRequestsDao(options.db),
    notices: new SecurityNoticesService(options.mailer, options.reportMailFailure),
  };
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
  });
}
