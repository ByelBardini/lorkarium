import type { AccountSanctionDto, SanctionAppealDto, SanctionKind } from '@lorkarium/contracts';
import type { MailMessage } from '../account-security/mailer.port';
import type { AccountSanctionRow } from './account-sanctions.dao';
import {
  accountBannedMail,
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

/** The e-mail that tells the person about a measure of `kind`.
 *
 *  Example: `sanctionMailOf('suspension', input).subject // 'Sua conta no Lorkarium foi suspensa'` */
export function sanctionMailOf(kind: SanctionKind, input: SanctionMailInput): MailMessage {
  return MAIL_OF[kind](input);
}
