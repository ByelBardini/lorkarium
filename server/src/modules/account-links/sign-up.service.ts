import type { SignUpRequestDto } from '@lorkarium/contracts';
import { isUniqueViolation } from '../../lib/postgres-error';
import { accountExistsMail } from '../account-security/admin-mail.mapper';
import type { MailMessage } from '../account-security/mailer.port';
import { recipientOf } from '../account-security/security-mail.mapper';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import { emailIndexOf, toUserAccessBo } from '../auth/auth.mapper';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { SessionTokenPort } from '../auth/session-token.port';
import type { UsersDao } from '../auth/users.dao';
import type { UserPo } from '../auth/users.po';
import { banLapseCutOf } from '../sanctions/account-sanction.bo';
import type { BannedEmailIndexesDao } from '../sanctions/banned-email-indexes.dao';
import { invitationTtlOf, linkExpiry, PASSWORD_RESET_TTL_MS } from './account-link.bo';
import { HumanCheckFailedError, RegistrationClosedError } from './account-links.error';
import { invitationLinkOf, invitationMailOf } from './account-links.mapper';
import type { HumanCheckPort } from './human-check.port';
import type { InvitationsDao } from './invitations.dao';
import type { InvitationPo } from './invitations.po';
import type { PasswordLinksService } from './password-links.service';
import type { PasswordResetsDao } from './password-resets.dao';
import { SignUpBo, type SignUpDecision } from './sign-up.bo';

export type SignUpDeps = Readonly<{
  /** `REGISTRATION_OPEN`: closed, every request is refused before anything is looked up. */
  registrationOpen: boolean;
  humanCheck: HumanCheckPort;
  invitations: Pick<InvitationsDao, 'insert' | 'findByEmailIndex' | 'renew'>;
  users: Pick<UsersDao, 'findByEmailIndex'>;
  bannedEmails: Pick<BannedEmailIndexesDao, 'isBannedSince'>;
  resets: Pick<PasswordResetsDao, 'findOfUser'>;
  passwordLinks: Pick<PasswordLinksService, 'issue'>;
  linkTokens: SessionTokenPort;
  cipher: DataCipherPort;
  clock: ClockPort;
  notices: Pick<SecurityNoticesService, 'send'>;
  newId: () => string;
  appPublicUrl: string;
}>;

type Lookup = Readonly<{
  email: string;
  emailIndex: string;
  account: UserPo | undefined;
  pending: InvitationPo | undefined;
}>;

const INVITATION_EMAIL_CONSTRAINT = 'invitations_email_index_unique';
const HOUR_MS = 60 * 60 * 1000;

/** A token the anti-bot widget gave this IP, checked before anything is looked up.
 *
 *  Example: `await requireHuman(humanCheck, input.humanCheckToken, request.ip)` */
export async function requireHuman(
  humanCheck: HumanCheckPort,
  token: string,
  remoteIp: string,
): Promise<void> {
  if (!(await humanCheck.verify(token, remoteIp))) throw new HumanCheckFailedError(remoteIp);
}

/** The public sign-up: an invitation the person asks for (24 h, role user). The caller answers
 *  the same for every address; the e-mail leaves after the reply, so neither the text nor the time
 *  tells whether an account exists.
 *
 *  Example: `await signUp.request({ email, humanCheckToken }, request.ip)` */
export class SignUpService {
  constructor(private readonly deps: SignUpDeps) {}

  async request(input: SignUpRequestDto, remoteIp: string): Promise<void> {
    if (!this.deps.registrationOpen) throw new RegistrationClosedError();
    await requireHuman(this.deps.humanCheck, input.humanCheckToken, remoteIp);
    const lookup = await this.lookUp(input.email);
    const mail = await this.act(await this.decide(lookup), lookup);
    // Not awaited on purpose (the SMTP delay would tell); `notices` reports a failure itself.
    if (mail) void this.deps.notices.send(mail);
  }

  private async lookUp(email: string): Promise<Lookup> {
    const emailIndex = emailIndexOf(this.deps.cipher, email);
    const account = await this.deps.users.findByEmailIndex(emailIndex);
    const pending = await this.deps.invitations.findByEmailIndex(emailIndex);
    return { email, emailIndex, account, pending };
  }

  private async decide({ emailIndex, account, pending }: Lookup): Promise<SignUpDecision> {
    const now = this.deps.clock.now();
    const banned = await this.deps.bannedEmails.isBannedSince(emailIndex, banLapseCutOf(now));
    const facts = { account: account ? await this.accountFacts(account, now) : null };
    return new SignUpBo({ ...facts, banned, pending: pending ?? null, now }).decide();
  }

  private async accountFacts(
    account: UserPo,
    now: Date,
  ): Promise<Readonly<{ active: boolean; resetIssuedAt: Date | null }>> {
    const reset = await this.deps.resets.findOfUser(account.id);
    const active = !toUserAccessBo(account).isSuspendedAt(now);
    return { active, resetIssuedAt: reset?.createdAt ?? null };
  }

  private async act(decision: SignUpDecision, lookup: Lookup): Promise<MailMessage | null> {
    if (decision === 'send-link') return this.sendLink(lookup);
    if (decision === 'renew-link' && lookup.pending)
      return this.renewLink(lookup.pending, lookup.email);
    if (decision === 'tell-account-exists' && lookup.account)
      return this.tellExists(lookup.account);
    return null;
  }

  private async sendLink({ email, emailIndex }: Lookup): Promise<MailMessage | null> {
    const token = this.deps.linkTokens.generate();
    const id = this.deps.newId();
    const emailCipher = this.deps.cipher.seal('invitation-email', email, id);
    const tokenHash = this.deps.linkTokens.hash(token);
    try {
      const row = { id, tokenHash, emailCipher, emailIndex, role: 'user' as const };
      await this.deps.invitations.insert({
        ...row,
        origin: 'self',
        invitedBy: null,
        ...this.terms(invitationTtlOf('self')),
      });
    } catch (error) {
      // Another request for the address inserted first: it already sent the link.
      if (isUniqueViolation(error, INVITATION_EMAIL_CONSTRAINT)) return null;
      throw error;
    }
    return this.linkMail('self', email, token);
  }

  // The role and the origin stay: an admin's pending invitation is renewed as itself.
  private async renewLink(pending: InvitationPo, email: string): Promise<MailMessage | null> {
    const token = this.deps.linkTokens.generate();
    const terms = this.terms(invitationTtlOf(pending.origin));
    const renewal = { tokenHash: this.deps.linkTokens.hash(token), ...terms };
    if (!(await this.deps.invitations.renew(pending.id, renewal))) return null;
    return this.linkMail(pending.origin, email, token);
  }

  private async tellExists(account: UserPo): Promise<MailMessage> {
    const { link } = await this.deps.passwordLinks.issue(account.id);
    const person = recipientOf(account, this.deps.cipher);
    const validFor = { hours: PASSWORD_RESET_TTL_MS / HOUR_MS };
    return accountExistsMail({ person, link, validFor, publicUrl: this.deps.appPublicUrl });
  }

  private linkMail(origin: InvitationPo['origin'], to: string, token: string): MailMessage {
    const publicUrl = this.deps.appPublicUrl;
    const link = invitationLinkOf(publicUrl, origin, token);
    return invitationMailOf(origin, { to, link, publicUrl });
  }

  private terms(ttlMs: number): Readonly<{ sentAt: Date; expiresAt: Date }> {
    const now = this.deps.clock.now();
    return { sentAt: now, expiresAt: linkExpiry(now, ttlMs) };
  }
}
