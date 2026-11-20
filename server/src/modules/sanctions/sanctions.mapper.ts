import type {
  AccountSanctionDto,
  IssueSanctionRequestDto,
  SanctionAppealDto,
  SanctionKind,
} from '@lorkarium/contracts';
import type { MailMessage } from '../account-security/mailer.port';
import { banDeletionDueOf } from './account-sanction.bo';
import type { AccountSanctionRow } from './account-sanctions.dao';
import type { NewAccountSanctionPo } from './account-sanctions.po';
import {
  accountBannedMail,
  ageRemovalMail,
  accountSuspendedForMail,
  contentRemovedMail,
  sanctionWarningMail,
  type SanctionMailInput,
} from './sanction-mail.mapper';

/** PO (with the @ of who applied and who decided) → the history item of the backoffice.
 *
 *  Example: `toAccountSanctionDto(row).issuedBy // 'fernanda'` */
export function toAccountSanctionDto(row: AccountSanctionRow): AccountSanctionDto {
  return {
    id: row.id,
    kind: row.kind,
    rule: row.rule,
    statement: row.statement,
    until: row.until?.toISOString() ?? null,
    deletionDueAt: row.deletionDueAt?.toISOString() ?? null,
    reportId: row.reportId,
    issuedBy: row.issuedByUsername,
    issuedAt: row.issuedAt.toISOString(),
    appeal: appealOf(row),
  };
}

function appealOf(row: AccountSanctionRow): SanctionAppealDto | null {
  if (row.appealReceivedAt === null) return null;
  return {
    receivedAt: row.appealReceivedAt.toISOString(),
    outcome: row.appealOutcome,
    note: row.appealNote,
    decidedBy: row.decidedByUsername,
    decidedAt: row.appealDecidedAt?.toISOString() ?? null,
  };
}

const MAIL_OF: Readonly<Record<SanctionKind, (input: SanctionMailInput) => MailMessage>> = {
  warning: sanctionWarningMail,
  content_removal: contentRemovedMail,
  suspension: accountSuspendedForMail,
  ban: accountBannedMail,
};

/** The e-mail that tells the person about a measure of `kind`; a ban for the minimum age has its
 *  own (no ban of the e-mail, refund in full).
 *
 *  Example: `sanctionMailOf('suspension', input).subject // 'Sua conta no Lorkarium foi suspensa'` */
export function sanctionMailOf(kind: SanctionKind, input: SanctionMailInput): MailMessage {
  if (kind === 'ban' && input.rule === 'minimum_age') return ageRemovalMail(input);
  return MAIL_OF[kind](input);
}

/** What a measure stores: a ban gets its deletion date (the appeal window) and whether the
 *  deletion takes the shared tables; the other kinds neither.
 *
 *  Example: `toNewAccountSanctionPo({ userId, request, until: null, issuedBy, now }).deletionDueAt // null on a warning` */
export function toNewAccountSanctionPo(
  input: Readonly<{
    userId: string;
    request: IssueSanctionRequestDto;
    until: Date | null;
    issuedBy: string;
    now: Date;
  }>,
): NewAccountSanctionPo {
  const { userId, request, until, issuedBy, now } = input;
  const ban = request.kind === 'ban';
  return {
    ...{ userId, kind: request.kind, rule: request.rule, statement: request.statement, until },
    reportId: request.reportId ?? null,
    ...{ issuedBy, issuedAt: now },
    deletionDueAt: ban ? banDeletionDueOf(now) : null,
    deleteSharedCampaigns: ban && (request.includeSharedCampaigns ?? false),
  };
}
