import { recipientOf } from '../account-security/security-mail.mapper';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { UserPo } from '../auth/users.po';
import type { AccountSanctionsDao } from './account-sanctions.dao';
import type { AccountSanctionPo } from './account-sanctions.po';
import { sanctionMailOf } from './sanctions.mapper';

export type SanctionNoticeDeps = Readonly<{
  notices: Pick<SecurityNoticesService, 'deliver'>;
  sanctions: Pick<AccountSanctionsDao, 'markNotified'>;
  cipher: DataCipherPort;
  clock: ClockPort;
  appPublicUrl: string;
  /** The landing: the e-mail links the rule to its heading of `/uso/`. */
  sitePublicUrl: string;
  /** `MAIL_REPLY_TO`: the appeal is an answer to the e-mail; null = the site's Contato. */
  replyTo: string | null;
}>;

/** What the e-mail of a measure is made of. */
export type NotifiedSanction = Pick<
  AccountSanctionPo,
  'id' | 'kind' | 'rule' | 'statement' | 'until' | 'deletionDueAt'
>;

/** Tells the person about a measure (use policy §13: every measure is told by e-mail) and records
 *  when the e-mail left; one that fails stays unrecorded for the hourly sweep to send again.
 *
 *  Example: `await notice.notify(sanction, caio) // true once the e-mail left` */
export class SanctionNoticeService {
  constructor(private readonly deps: SanctionNoticeDeps) {}

  async notify(sanction: NotifiedSanction, target: UserPo): Promise<boolean> {
    const { cipher, appPublicUrl, sitePublicUrl, replyTo } = this.deps;
    const { rule, statement, until, deletionDueAt } = sanction;
    const mail = sanctionMailOf(sanction.kind, {
      ...{ person: recipientOf(target, cipher), rule, statement, until, deletionDueAt },
      ...{ publicUrl: appPublicUrl, siteUrl: sitePublicUrl, replyTo },
    });
    if (!(await this.deps.notices.deliver(mail))) return false;
    await this.deps.sanctions.markNotified(sanction.id, this.deps.clock.now());
    return true;
  }
}
