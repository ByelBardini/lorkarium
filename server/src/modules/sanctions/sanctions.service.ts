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
import {
  appealChangeOf,
  liftsSuspension,
  requireSanctionable,
  suspends,
} from './account-sanction.bo';
import type { AccountSanctionsDao } from './account-sanctions.dao';
import type { AccountSanctionPo } from './account-sanctions.po';
import type { SanctionNoticeService } from './sanction-notice.service';
import { toAccountSanctionDto, toNewAccountSanctionPo } from './sanctions.mapper';
import { SanctionNotFoundError, SanctionReportNotFoundError } from './sanctions.error';

/** The DAOs a measure's transaction hands out, bound to the open `tx`. */
export type SanctionWriteDaos = Readonly<{
  accounts: Pick<UserAdminDao, 'findAccount' | 'setSuspendedAt'>;
  sanctions: Pick<
    AccountSanctionsDao,
    | 'insert'
    | 'lockById'
    | 'latestSuspendingIdOf'
    | 'recordAppeal'
    | 'reportIsAbout'
    | 'cancelDeletion'
  >;
  sessions: Pick<AuthSessionsDao, 'deleteAllOf'>;
  passwordResets: Pick<PasswordResetsDao, 'deleteOfUser'>;
}>;

export type SanctionTransactionRunner = <T>(
  work: (daos: SanctionWriteDaos) => Promise<T>,
) => Promise<T>;

/** What the backoffice's deletion would take: a ban refuses up front a deletion its shared tables
 *  would block later (the deletion itself runs in the hourly sweep). */
export type AccountDeletion = Pick<UserAdminService, 'deletionCheck'>;

export type SanctionsDeps = Readonly<{
  accounts: Pick<UserAdminDao, 'findAccount'>;
  sanctions: Pick<AccountSanctionsDao, 'findById' | 'listOf' | 'reportIsAbout'>;
  transaction: SanctionTransactionRunner;
  deletion: AccountDeletion;
  sessionEnded: SessionEndedPort;
  /** The measure's e-mail, recorded once it left (the hourly sweep retries the rest). */
  notice: Pick<SanctionNoticeService, 'notify'>;
  /** The best-effort "access is back" of a reverted measure. */
  notices: Pick<SecurityNoticesService, 'send'>;
  cipher: DataCipherPort;
  clock: ClockPort;
  appPublicUrl: string;
}>;

type MeasureInput = Readonly<{
  actor: AdminActor;
  userId: string;
  request: IssueSanctionRequestDto;
  until: Date | null;
  now: Date;
}>;

type MeasureOutcome = Readonly<{
  target: AccountListingRow;
  sanction: AccountSanctionPo;
  ended: string[];
}>;

type AppealInput = Readonly<{
  actor: AdminActor;
  sanctionId: string;
  request: RecordAppealRequestDto;
  now: Date;
}>;

/** The measures against an account (use policy §13–§14): each one is persisted with its rule and
 *  reasons before the person is told by e-mail. A suspension signs the account out; a ban too, and
 *  its deletion waits for the appeal window (the hourly sweep runs it). Who applied it never
 *  reaches the person.
 *
 *  Example: `await sanctions.issue(admin, caioId, { kind: 'warning', rule: 'spam', statement })` */
export class SanctionsService {
  constructor(private readonly deps: SanctionsDeps) {}

  /** The measure and the account as it is now (suspended after a suspension or a ban). */
  async issue(
    actor: AdminActor,
    userId: string,
    request: IssueSanctionRequestDto,
  ): Promise<SanctionResponseDto> {
    const now = this.deps.clock.now();
    const until = request.until ? new Date(request.until) : null;
    const input = { actor, userId, request, until, now };
    if (request.kind === 'ban') await this.requireDeletable(input);
    const outcome = await this.deps.transaction((daos) => this.record(daos, input));
    for (const sessionId of outcome.ended) this.deps.sessionEnded.sessionEnded(sessionId);
    await this.deps.notice.notify(outcome.sanction, outcome.target);
    return this.responseOf(outcome.sanction.id, outcome.target);
  }

  async history(userId: string): Promise<AccountSanctionsResponseDto> {
    await requireAccount(this.deps.accounts, userId);
    const rows = await this.deps.sanctions.listOf(userId);
    return { sanctions: rows.map(toAccountSanctionDto) };
  }

  /** The appeal arrived, or its decision. A reverted ban deletes nothing anymore; a reverted
   *  suspension or ban that still holds ends here, with "access is back" after the commit. */
  async recordAppeal(
    actor: AdminActor,
    sanctionId: string,
    request: RecordAppealRequestDto,
  ): Promise<SanctionResponseDto> {
    const now = this.deps.clock.now();
    const input = { actor, sanctionId, request, now };
    const outcome = await this.deps.transaction((daos) => this.decide(daos, input));
    if (outcome.lifted) await this.tellRestored(outcome.target);
    return this.responseOf(sanctionId, outcome.target);
  }

  private async decide(
    daos: SanctionWriteDaos,
    { actor, sanctionId, request, now }: AppealInput,
  ): Promise<Readonly<{ target: AccountListingRow; lifted: boolean }>> {
    const sanction = await daos.sanctions.lockById(sanctionId);
    if (!sanction) throw new SanctionNotFoundError(sanctionId);
    await daos.sanctions.recordAppeal(sanctionId, appealChangeOf(sanction, request, actor.id, now));
    if (request.outcome === 'reverted' && sanction.kind === 'ban')
      await daos.sanctions.cancelDeletion(sanctionId);
    const target = await requireAccount(daos.accounts, sanction.userId);
    const latest = await daos.sanctions.latestSuspendingIdOf(sanction.userId);
    if (!liftsSuspension(sanction, request.outcome, latest, target, now))
      return { target, lifted: false };
    await daos.accounts.setSuspendedAt(sanction.userId, null);
    return { target: { ...target, suspendedAt: null, suspendedUntil: null }, lifted: true };
  }

  private async record(daos: SanctionWriteDaos, input: MeasureInput): Promise<MeasureOutcome> {
    const { actor, userId, request, until, now } = input;
    const target = await requireAccount(daos.accounts, userId);
    requireSanctionable(actor.id, target, { kind: request.kind, until }, now);
    await requireReportAbout(daos.sanctions, request.reportId, userId);
    const row = toNewAccountSanctionPo({ userId, request, until, issuedBy: actor.id, now });
    const sanction = await daos.sanctions.insert(row);
    if (!suspends(request.kind)) return { target, sanction, ended: [] };
    await daos.accounts.setSuspendedAt(userId, now, until);
    const ended = await daos.sessions.deleteAllOf(userId);
    await daos.passwordResets.deleteOfUser(userId);
    return { target: { ...target, suspendedAt: now, suspendedUntil: until }, sanction, ended };
  }

  // The deletion runs later, with nobody to see a refusal: tables with other members that would
  // block it refuse the ban now, unless the admin chose to take them along. The rule's own
  // refusals (oneself, an admin) come before the check.
  private async requireDeletable({ actor, userId, request, now }: MeasureInput): Promise<void> {
    const target = await requireAccount(this.deps.accounts, userId);
    requireSanctionable(actor.id, target, { kind: 'ban', until: null }, now);
    if (request.includeSharedCampaigns) return;
    const { blockingCampaigns } = await this.deps.deletion.deletionCheck(actor, userId);
    if (blockingCampaigns.length > 0) throw new OwnsSharedCampaignsError(userId, blockingCampaigns);
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
