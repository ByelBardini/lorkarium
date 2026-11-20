import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { SignUpConfig } from '../../config/sign-up-env';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { AccountRecoveryService } from '../account-security/account-recovery.service';
import { EmailChangeRequestsDao } from '../account-security/email-change-requests.dao';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import { AuthSessionsDao } from '../auth/auth-sessions.dao';
import type { AuthService } from '../auth/auth.service';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import type { SessionEndedPort } from '../auth/session-ended.port';
import type { SessionTokenPort } from '../auth/session-token.port';
import { TwoFactorChallengesDao } from '../auth/two-factor-challenges.dao';
import { UsersDao } from '../auth/users.dao';
import { BannedEmailIndexesDao } from '../sanctions/banned-email-indexes.dao';
import { accountLinksRoutes } from './account-links.routes';
import type { HumanCheckPort } from './human-check.port';
import { InvitationsDao } from './invitations.dao';
import { InvitationsService, type AcceptanceTransactionRunner } from './invitations.service';
import { PasswordResetsDao } from './password-resets.dao';
import { PasswordLinksService } from './password-links.service';
import { PasswordResetsService, type ResetTransactionRunner } from './password-resets.service';
import { registerSignUpRoutes } from './sign-up.routes';
import { SignUpService } from './sign-up.service';

export type AccountLinksModuleOptions = Readonly<{
  db: Database;
  sessions: Pick<AuthService, 'startSession'>;
  tokens: SessionTokenPort;
  hasher: PasswordHasherPort;
  cipher: DataCipherPort;
  clock: ClockPort;
  sessionEnded: SessionEndedPort;
  notices: Pick<SecurityNoticesService, 'send'>;
  recovery: Pick<AccountRecoveryService, 'issue'>;
  appPublicUrl: string;
  /** `env.signUp`: the switch and the Turnstile site key the client renders. */
  signUp: SignUpConfig;
  humanCheck: HumanCheckPort;
}>;

export type AccountLinksModule = Readonly<{
  plugin: (app: FastifyInstance) => Promise<void>;
  /** For the backoffice list: every pending invitation. */
  invitations: InvitationsService;
}>;

/** Wires the invitation and new-password links. Needs `app.authGuards`.
 *
 *  Example: `const links = createAccountLinksModule(options); await app.register(links.plugin, { prefix: '/api' })` */
export function createAccountLinksModule(options: AccountLinksModuleOptions): AccountLinksModule {
  const invitations = createInvitations(options);
  const passwordResets = createPasswordResets(options);
  const signUp = createSignUp(options);
  const signUpSettings = {
    registrationOpen: options.signUp.registrationOpen,
    humanCheckSiteKey: options.signUp.humanCheck?.siteKey ?? null,
  };
  const registerMore = (app: FastifyInstance): void =>
    registerSignUpRoutes(app, signUp, signUpSettings);
  const routes = accountLinksRoutes({ invitations, passwordResets, registerMore });
  return { plugin: routes, invitations };
}

function createSignUp(options: AccountLinksModuleOptions): SignUpService {
  const resets = new PasswordResetsDao(options.db);
  const { tokens: linkTokens, clock, appPublicUrl } = options;
  return new SignUpService({
    registrationOpen: options.signUp.registrationOpen,
    humanCheck: options.humanCheck,
    invitations: new InvitationsDao(options.db),
    users: new UsersDao(options.db),
    bannedEmails: new BannedEmailIndexesDao(options.db),
    resets,
    passwordLinks: new PasswordLinksService({ resets, linkTokens, clock, appPublicUrl }),
    linkTokens,
    cipher: options.cipher,
    clock,
    notices: options.notices,
    newId: randomUUID,
    appPublicUrl,
  });
}

function createInvitations(options: AccountLinksModuleOptions): InvitationsService {
  const transaction: AcceptanceTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({ invitations: new InvitationsDao(tx), users: new UsersDao(tx) }),
    );
  return new InvitationsService({
    invitations: new InvitationsDao(options.db),
    users: new UsersDao(options.db),
    bannedEmails: new BannedEmailIndexesDao(options.db),
    transaction,
    sessions: options.sessions,
    linkTokens: options.tokens,
    hasher: options.hasher,
    cipher: options.cipher,
    clock: options.clock,
    notices: options.notices,
    newId: randomUUID,
    appPublicUrl: options.appPublicUrl,
  });
}

function createPasswordResets(options: AccountLinksModuleOptions): PasswordResetsService {
  const transaction: ResetTransactionRunner = (work) =>
    runInTransaction(options.db, (tx) =>
      work({
        resets: new PasswordResetsDao(tx),
        users: new UsersDao(tx),
        sessions: new AuthSessionsDao(tx),
        emailChanges: new EmailChangeRequestsDao(tx),
        challenges: new TwoFactorChallengesDao(tx),
      }),
    );
  return new PasswordResetsService({
    resets: new PasswordResetsDao(options.db),
    users: new UsersDao(options.db),
    transaction,
    linkTokens: options.tokens,
    hasher: options.hasher,
    cipher: options.cipher,
    clock: options.clock,
    sessionEnded: options.sessionEnded,
    notices: options.notices,
    recovery: options.recovery,
    appPublicUrl: options.appPublicUrl,
  });
}
