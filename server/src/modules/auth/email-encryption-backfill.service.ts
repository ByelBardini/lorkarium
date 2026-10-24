import { toSealedEmail } from './auth.mapper';
import type { DataCipherPort } from './data-cipher.port';
import type { UsersDao } from './users.dao';

export type EmailEncryptionBackfillResult = Readonly<{ updated: number }>;

/** Seals the e-mail of every account that still keeps it in clear (cipher + blind index, clear
 *  column emptied); a second run finds nothing. Run by `pnpm db:encrypt-emails` with the database
 *  at migration 0038, before 0039 drops the clear column.
 *
 *  Example: `await new EmailEncryptionBackfillService(usersDao, cipher).run() // { updated: 2 }` */
export class EmailEncryptionBackfillService {
  constructor(
    private readonly users: Pick<UsersDao, 'listPlainEmails' | 'sealEmail'>,
    private readonly cipher: DataCipherPort,
  ) {}

  async run(): Promise<EmailEncryptionBackfillResult> {
    const plain = await this.users.listPlainEmails();
    for (const { id, email } of plain) {
      await this.users.sealEmail(id, toSealedEmail(this.cipher, id, email.trim().toLowerCase()));
    }
    return { updated: plain.length };
  }
}
