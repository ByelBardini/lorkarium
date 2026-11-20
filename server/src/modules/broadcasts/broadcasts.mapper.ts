import {
  mailBroadcastSegmentDto,
  type MailBroadcastContentDto,
  type MailBroadcastDto,
} from '@lorkarium/contracts';
import type { BroadcastLetter } from './broadcast-mail.mapper';
import { MailBroadcastBo } from './mail-broadcast.bo';
import type { MailBroadcastLetterPo, MailBroadcastRow } from './mail-broadcasts.dao';
import type { MailBroadcastPo } from './mail-broadcasts.po';

/** Example: `toMailBroadcastDto(row).total // null while a draft` */
export function toMailBroadcastDto(row: MailBroadcastRow): MailBroadcastDto {
  return {
    id: row.id,
    segment: mailBroadcastSegmentDto.parse(row.segment),
    subject: row.subject,
    title: row.title,
    paragraphs: [...row.paragraphs],
    button: row.button ?? null,
    createdAt: row.createdAt.toISOString(),
    testedAt: row.testedAt?.toISOString() ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    total: row.total,
    sent: row.sent,
    failed: row.failed,
    skipped: row.skipped,
  };
}

/** Example: `toMailBroadcastBo(row).requireDraft()` */
export function toMailBroadcastBo(row: MailBroadcastPo): MailBroadcastBo {
  return new MailBroadcastBo({ id: row.id, testedAt: row.testedAt, confirmedAt: row.confirmedAt });
}

/** The columns of a draft from what the admin wrote; no button is a null column.
 *
 *  Example: `letterPoOf(dto).button // null` */
export function letterPoOf(content: MailBroadcastContentDto): MailBroadcastLetterPo {
  const { segment, subject, title, paragraphs, button } = content;
  return { segment, subject, title, paragraphs, button: button ?? null };
}

/** What each e-mail says, from the stored notice or from the text being previewed.
 *
 *  Example: `broadcastMail({ person, letter: letterOf(row), publicUrl, replyTo })` */
export function letterOf(
  source: Pick<MailBroadcastLetterPo, 'subject' | 'title' | 'paragraphs' | 'button'>,
): BroadcastLetter {
  const { subject, title, paragraphs, button } = source;
  return { subject, title, paragraphs, button: button ?? null };
}
