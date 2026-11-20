import type {
  AccountSanctionsResponseDto,
  IssueSanctionRequestDto,
  RecordAppealRequestDto,
  SanctionResponseDto,
} from '@lorkarium/contracts';
import type { PasswordResetsDao } from '../account-links/password-resets.dao';
import { accessRestoredMail } from '../account-security/admin-mail.mapper';
import { recipientOf } from '../account-security/security-mail.mapper';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import type { AuthSessionsDao } from '../auth/auth-sessions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { SessionEndedPort } from '../auth/session-ended.port';
import type { UserPo } from '../auth/users.po';
import type { AccountListingRow, UserAdminDao } from '../user-admin/user-admin.dao';
import { OwnsSharedCampaignsError, UserNotFoundError } from '../user-admin/user-admin.error';
import { toAdminUserDto } from '../user-admin/user-admin.mapper';
import type { AdminActor, UserAdminService } from '../user-admin/user-admin.service';
import { appealChangeOf, liftsSuspension, requireSanctionable } from './account-sanction.bo';
import type { AccountSanctionsDao } from './account-sanctions.dao';
import { sanctionMailOf, toAccountSanctionDto } from './sanctions.mapper';
import { SanctionNotFoundError, SanctionReportNotFoundError } from './sanctions.error';

/** The DAOs a measure's transaction hands out, bound to the open `tx`. */
export type SanctionWriteDaos = Readonly<{
  accounts: Pick<UserAdminDao, 'findAccount' | 'setSuspendedAt'>;
  sanctions: Pick<
    AccountSanctionsDao,
    'insert' | 'lockById' | 'latestSuspensionIdOf' | 'recordAppeal' | 'reportIsAbout'
  >;
  sessions: Pick<AuthSessionsDao, 'deleteAllOf'>;
  passwordResets: Pick<PasswordResetsDao, 'deleteOfUser'>;
}>;

export type SanctionTransactionRunner = <T>(
  work: (daos: SanctionWriteDaos) => Promise<T>,
) => Promise<T>;

/** The deletion of the backoffice, which a ban goes through (and which keeps the e-mail's index). */
export type AccountDeletion = Pick<UserAdminService, 'deletionCheck' | 'delete'>;

export type SanctionsDeps = Readonly<{
  accounts: Pick<UserAdminDao, 'findAccount'>;
  sanctions: Pick<AccountSanctionsDao, 'findById' | 'listOf' | 'reportIsAbout'>;
  transaction: SanctionTransactionRunner;
  deletion: AccountDeletion;
  sessionEnded: SessionEndedPort;
  notices: Pick<SecurityNoticesService, 'send'>;
  cipher: DataCipherPort;
  clock: ClockPort;
  appPublicUrl: string;
  /** The landing: the e-mail links the rule to its heading of `/uso/`. */
  sitePublicUrl: string;
  /** `MAIL_REPLY_TO`: the appeal is an answer to the e-mail; null = the site's Contato. */
  replyTo: string | null;
}>;

type MeasureOutcome = Readonly<{ target: AccountListingRow; sanctionId: string; ended: string[] }>;

/** The measures against an account (use policy §13–§14): each one is persisted with its rule and
 *  reasons before the person is told by e-mail; a suspension signs the account out, a ban goes
 *  through the backoffice's deletion. Who applied it never reaches the person.
 *
 *  Example: `await sanctions.issue(admin, caioId, { kind: 'warning', rule: 'spam', statement })` */
export class SanctionsService {
  constructor(private readonly deps: SanctionsDeps) {}

  /** The measure and the account as it is now; `null` for a ban (the account is gone). */
  async issue(
    actor: AdminActor,
    userId: string,
    request: IssueSanctionRequestDto,
  ): Promise<SanctionResponseDto | null> {
    const now = this.deps.clock.now();
    if (request.kind === 'ban') return this.ban(actor, userId, request, now);
    const until = request.until ? new Date(request.until) : null;
    const outcome = await this.deps.transaction((daos) =>
      this.record(daos, { actor, userId, request, until, now }),
    );
    for (const sessionId of outcome.ended) this.deps.sessionEnded.sessionEnded(sessionId);
    await this.tell(outcome.target, request, until);
    return this.responseOf(outcome.sanctionId, outcome.target);
  }

  async history(userId: string): Promise<AccountSanctionsResponseDto> {
    await requireAccount(this.deps.accounts, userId);
    const rows = await this.deps.sanctions.listOf(userId);
    return { sanctions: rows.map(toAccountSanctionDto) };
  }

  /** The appeal arrived, or its decision; a reverted suspension that still holds ends here, with
   *  the "access is back" e-mail after the commit. */
  async recordAppeal(
    actor: AdminActor,
    sanctionId: string,
    request: RecordAppealRequestDto,
  ): Promise<SanctionResponseDto> {
    const now = this.deps.clock.now();
    const outcome = await this.deps.transaction(async (daos) => {
      const sanction = await daos.sanctions.lockById(sanctionId);
      if (!sanction) throw new SanctionNotFoundError(sanctionId);
      await daos.sanctions.recordAppeal(
        sanctionId,
        appealChangeOf(sanction, request, actor.id, now),
      );
      const target = await requireAccount(daos.accounts, sanction.userId);
      const latest = await daos.sanctions.latestSuspensionIdOf(sanction.userId);
      if (!liftsSuspension(sanction, request.outcome, latest, target, now))
        return { target, lifted: false };
      await daos.accounts.setSuspendedAt(sanction.userId, null);
      return { target: { ...target, suspendedAt: null, suspendedUntil: null }, lifted: true };
    });
    if (outcome.lifted) await this.tellRestored(outcome.target);
    return this.responseOf(sanctionId, outcome.target);
  }

  private async record(
    daos: SanctionWriteDaos,
    input: Readonly<{
      actor: AdminActor;
      userId: string;
      request: IssueSanctionRequestDto;
      until: Date | null;
      now: Date;
    }>,
  ): Promise<MeasureOutcome> {
    const { actor, userId, request, until, now } = input;
    const target = await requireAccount(daos.accounts, userId);
    requireSanctionable(actor.id, target, { kind: request.kind, until }, now);
    await requireReportAbout(daos.sanctions, request.reportId, userId);
    const sanction = await daos.sanctions.insert({
      userId,
      kind: request.kind,
      rule: request.rule,
      statement: request.statement,
      until,
      reportId: request.reportId ?? null,
      issuedBy: actor.id,
      issuedAt: now,
    });
    if (request.kind !== 'suspension') return { target, sanctionId: sanction.id, ended: [] };
    await daos.accounts.setSuspendedAt(userId, now, until);
    const ended = await daos.sessions.deleteAllOf(userId);
    await daos.passwordResets.deleteOfUser(userId);
    const suspended = { ...target, suspendedAt: now, suspendedUntil: until };
    return { target: suspended, sanctionId: sanction.id, ended };
  }

  // The e-mail goes before the DELETE: afterwards there is no address left to open. A deletion
  // that turns blocked in between leaves a sent e-mail and the account: the admin sees the 409.
  private async ban(
    actor: AdminActor,
    userId: string,
    request: IssueSanctionRequestDto,
    now: Date,
  ): Promise<null> {
    const target = await requireAccount(this.deps.accounts, userId);
    requireSanctionable(actor.id, target, { kind: 'ban', until: null }, now);
    await requireReportAbout(this.deps.sanctions, request.reportId, userId);
    const { blockingCampaigns } = await this.deps.deletion.deletionCheck(actor, userId);
    if (blockingCampaigns.length > 0) throw new OwnsSharedCampaignsError(userId, blockingCampaigns);
    await this.tell(target, request, null);
    await this.deps.deletion.delete(actor, userId, { bannedAt: now });
    return null;
  }

  private async tell(
    target: UserPo,
    request: IssueSanctionRequestDto,
    until: Date | null,
  ): Promise<void> {
    const { appPublicUrl, sitePublicUrl, replyTo, cipher } = this.deps;
    const mail = sanctionMailOf(request.kind, {
      person: recipientOf(target, cipher),
      rule: request.rule,
      statement: request.statement,
      until,
      publicUrl: appPublicUrl,
      siteUrl: sitePublicUrl,
      replyTo,
    });
    await this.deps.notices.send(mail);
  }

  private async tellRestored(target: UserPo): Promise<void> {
    const person = recipientOf(target, this.deps.cipher);
    await this.deps.notices.send(accessRestoredMail({ person, publicUrl: this.deps.appPublicUrl }));
  }

  private async responseOf(
    sanctionId: string,
    target: AccountListingRow,
  ): Promise<SanctionResponseDto> {
    const row = await this.deps.sanctions.findById(sanctionId);
    if (!row) throw new SanctionNotFoundError(sanctionId);
    return { sanction: toAccountSanctionDto(row), user: toAdminUserDto(target, this.deps.cipher) };
  }
}

async function requireAccount(
  accounts: Pick<UserAdminDao, 'findAccount'>,
  userId: string,
): Promise<AccountListingRow> {
  const found = await accounts.findAccount(userId);
  if (!found) throw new UserNotFoundError(userId);
  return found;
}

async function requireReportAbout(
  sanctions: Pick<AccountSanctionsDao, 'reportIsAbout'>,
  reportId: string | undefined,
  userId: string,
): Promise<void> {
  if (reportId === undefined || (await sanctions.reportIsAbout(reportId, userId))) return;
  throw new SanctionReportNotFoundError(reportId, userId);
}
