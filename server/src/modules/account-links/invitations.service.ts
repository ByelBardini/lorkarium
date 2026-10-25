import type {
  AcceptInvitationRequestDto,
  AdminInvitationDto,
  CreateInvitationRequestDto,
  InvitationInspectResponseDto,
  InvitationLinkResponseDto,
} from '@lorkarium/contracts';
import { isUniqueViolation } from '../../lib/postgres-error';
import { invitationMail } from '../account-security/admin-mail.mapper';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import { emailIndexOf, toSealedEmail } from '../auth/auth.mapper';
import type { AuthService, IssuedSession } from '../auth/auth.service';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import type { SessionTokenPort } from '../auth/session-token.port';
import { usernameFromEmail, usernameLookupPrefix, usernameStemOf } from '../auth/username.bo';
import type { UsersDao } from '../auth/users.dao';
import type { UserPo } from '../auth/users.po';
import { INVITATION_TTL_MS, linkExpiry } from './account-link.bo';
import {
  AccountLinkInvalidError,
  AlreadyInvitedError,
  EmailTakenError,
  InvitationNotFoundError,
  UsernameTakenError,
} from './account-links.error';
import {
  invitationEmailOf,
  linkOf,
  termsAcceptanceAt,
  toAccountLinkBo,
  toAdminInvitationDto,
} from './account-links.mapper';
import type { InvitationsDao } from './invitations.dao';
import type { InvitationPo } from './invitations.po';

/** The DAOs the acceptance transaction hands out, bound to the open `tx`. */
export type AcceptanceDaos = Readonly<{
  invitations: Pick<InvitationsDao, 'delete'>;
  users: Pick<UsersDao, 'insert'>;
}>;

export type AcceptanceTransactionRunner = <T>(
  work: (daos: AcceptanceDaos) => Promise<T>,
) => Promise<T>;

export type InvitationsDeps = Readonly<{
  invitations: Pick<
    InvitationsDao,
    | 'insert'
    | 'listPending'
    | 'findListing'
    | 'findByTokenHash'
    | 'findByEmailIndex'
    | 'renew'
    | 'delete'
  >;
  users: Pick<UsersDao, 'findByEmailIndex' | 'usernamesStartingWith'>;
  transaction: AcceptanceTransactionRunner;
  sessions: Pick<AuthService, 'startSession'>;
  linkTokens: SessionTokenPort;
  hasher: PasswordHasherPort;
  cipher: DataCipherPort;
  clock: ClockPort;
  notices: Pick<SecurityNoticesService, 'send'>;
  newId: () => string;
  appPublicUrl: string;
}>;

export type Inviter = Readonly<{ id: string; name: string }>;

const USERNAME_CONSTRAINT = 'users_username_unique';
const INVITATION_EMAIL_CONSTRAINT = 'invitations_email_index_unique';

/** Invitations from the backoffice: a 7-day one-time link by e-mail (and to copy); whoever opens
 *  it picks the @ and the password, and the account is born signed in.
 *
 *  Example: `const { invitation, link } = await invitations.invite(admin, { email, role: 'user' })` */
export class InvitationsService {
  constructor(private readonly deps: InvitationsDeps) {}

  async listPending(): Promise<AdminInvitationDto[]> {
    const rows = await this.deps.invitations.listPending();
    return rows.map((row) => toAdminInvitationDto(row, this.deps.cipher));
  }

  async invite(
    inviter: Inviter,
    input: CreateInvitationRequestDto,
  ): Promise<InvitationLinkResponseDto> {
    // The role the invited account will have, picked by the admin of the session.
    const invitedRole = input.role;
    const emailIndex = emailIndexOf(this.deps.cipher, input.email);
    if (await this.deps.users.findByEmailIndex(emailIndex)) throw new EmailTakenError(input.email);
    await this.requireNotInvited(input.email, emailIndex);
    const token = this.deps.linkTokens.generate();
    const id = this.deps.newId();
    await this.insertOnce(input.email, emailIndex, () =>
      this.deps.invitations.insert({
        id,
        tokenHash: this.deps.linkTokens.hash(token),
        emailCipher: this.deps.cipher.seal('invitation-email', input.email, id),
        emailIndex,
        role: invitedRole,
        invitedBy: inviter.id,
        ...this.terms(),
      }),
    );
    return this.mailed(id, token);
  }

  /** A new token and 7 more days: the old link dies. */
  async resend(invitationId: string): Promise<InvitationLinkResponseDto> {
    const token = this.deps.linkTokens.generate();
    const renewal = { tokenHash: this.deps.linkTokens.hash(token), ...this.terms() };
    const renewed = await this.deps.invitations.renew(invitationId, renewal);
    if (!renewed) throw new InvitationNotFoundError(invitationId);
    return this.mailed(invitationId, token);
  }

  /** Idempotent: an invitation already gone stays gone. */
  async cancel(invitationId: string): Promise<void> {
    await this.deps.invitations.delete(invitationId);
  }

  async inspect(token: string): Promise<InvitationInspectResponseDto> {
    const row = await this.liveInvitationOf(token);
    const email = invitationEmailOf(row, this.deps.cipher);
    const prefix = usernameLookupPrefix(usernameStemOf(email));
    const taken = await this.deps.users.usernamesStartingWith(prefix);
    return { email, suggestedUsername: usernameFromEmail(email, taken) };
  }

  /** The account is born from the invitation (the nickname equal to the @) and signed in. */
  async accept(input: AcceptInvitationRequestDto, userAgent?: string): Promise<IssuedSession> {
    const row = await this.liveInvitationOf(input.token);
    const passwordHash = await this.deps.hasher.hash(input.password);
    const user = await this.deps.transaction((daos) =>
      this.createAccount(daos, row, input, passwordHash),
    );
    return this.deps.sessions.startSession(user, input.persistent, userAgent);
  }

  private async createAccount(
    daos: AcceptanceDaos,
    row: InvitationPo,
    input: AcceptInvitationRequestDto,
    passwordHash: string,
  ): Promise<UserPo> {
    // The delete is the claim: a second acceptance at the same time finds nothing to delete.
    if (!(await daos.invitations.delete(row.id)))
      throw new AccountLinkInvalidError('a used invitation');
    const email = invitationEmailOf(row, this.deps.cipher);
    const id = this.deps.newId();
    const sealed = toSealedEmail(this.deps.cipher, id, email);
    const account = {
      id,
      name: input.username,
      username: input.username,
      ...sealed,
      passwordHash,
      role: row.role,
      ...termsAcceptanceAt(this.deps.clock.now()),
    };
    try {
      return await daos.users.insert(account);
    } catch (error) {
      if (isUniqueViolation(error, USERNAME_CONSTRAINT))
        throw new UsernameTakenError(input.username);
      if (isUniqueViolation(error)) throw new EmailTakenError(email);
      throw error;
    }
  }

  private async requireNotInvited(email: string, emailIndex: string): Promise<void> {
    const pending = await this.deps.invitations.findByEmailIndex(emailIndex);
    if (pending) throw new AlreadyInvitedError(email, pending.id);
  }

  // Two admins inviting the same address at once: the unique index answers the second.
  private async insertOnce(
    email: string,
    emailIndex: string,
    insert: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await insert();
    } catch (error) {
      if (!isUniqueViolation(error, INVITATION_EMAIL_CONSTRAINT)) throw error;
      await this.requireNotInvited(email, emailIndex);
      throw error;
    }
  }

  private terms(): Readonly<{ sentAt: Date; expiresAt: Date }> {
    const now = this.deps.clock.now();
    return { sentAt: now, expiresAt: linkExpiry(now, INVITATION_TTL_MS) };
  }

  private async mailed(invitationId: string, token: string): Promise<InvitationLinkResponseDto> {
    const listing = await this.deps.invitations.findListing(invitationId);
    if (!listing) throw new InvitationNotFoundError(invitationId);
    const invitation = toAdminInvitationDto(listing, this.deps.cipher);
    const link = linkOf(this.deps.appPublicUrl, '/invite', token);
    const publicUrl = this.deps.appPublicUrl;
    const validFor = { days: INVITATION_TTL_MS / DAY_MS };
    await this.deps.notices.send(
      invitationMail({
        to: invitation.email,
        link,
        validFor,
        publicUrl,
      }),
    );
    return { invitation, link };
  }

  private async liveInvitationOf(token: string): Promise<InvitationPo> {
    const row = await this.deps.invitations.findByTokenHash(this.deps.linkTokens.hash(token));
    if (!row) throw new AccountLinkInvalidError('an unknown invitation token');
    toAccountLinkBo(row).requireUsableAt(this.deps.clock.now());
    return row;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
