import { accessRestoredMail } from '../account-security/admin-mail.mapper';
import { recipientOf } from '../account-security/security-mail.mapper';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { UserPo } from '../auth/users.po';

export type SuspensionEndedNoticeDeps = Readonly<{
  notices: Pick<SecurityNoticesService, 'send'>;
  cipher: DataCipherPort;
  appPublicUrl: string;
}>;

/** The "your access is back" e-mail of a suspension that reached its end (best-effort: the
 *  notices log a failure instead of throwing). Implements the housekeeping's `SuspensionEndedPort`.
 *
 *  Example: `await new SuspensionEndedNoticeService(deps).suspensionEnded(row)` */
export class SuspensionEndedNoticeService {
  constructor(private readonly deps: SuspensionEndedNoticeDeps) {}

  async suspensionEnded(account: UserPo): Promise<void> {
    const person = recipientOf(account, this.deps.cipher);
    await this.deps.notices.send(accessRestoredMail({ person, publicUrl: this.deps.appPublicUrl }));
  }
}
