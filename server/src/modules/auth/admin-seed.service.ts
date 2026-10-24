import type { AdminSeedConfig } from '../../config/env';
import { SEEDED_ADMIN_USERNAME } from './admin-seed.bo';
import { emailIndexOf, toAdminSeedBo, toSealedEmail } from './auth.mapper';
import type { DataCipherPort } from './data-cipher.port';
import type { PasswordHasherPort } from './password-hasher.port';
import { usernameLookupPrefix } from './username.bo';
import type { UsersDao } from './users.dao';

export type AdminSeedDeps = Readonly<{
  users: Pick<UsersDao, 'findByEmailIndex' | 'usernamesStartingWith' | 'insert'>;
  hasher: PasswordHasherPort;
  cipher: DataCipherPort;
  newId: () => string;
}>;

/** Creates the admin from ADMIN_EMAIL/ADMIN_PASSWORD at boot, once; never rewrites an account.
 *  The lookup is by the blind index: the e-mail is never compared in clear.
 *
 *  Example: `await new AdminSeedService({ users, hasher, cipher, newId }).seed(env.adminSeed) // 'created'` */
export class AdminSeedService {
  constructor(private readonly deps: AdminSeedDeps) {}

  async seed(config: AdminSeedConfig | null): Promise<'created' | 'skipped'> {
    if (!config) return 'skipped';
    const { users, cipher } = this.deps;
    const existing = await users.findByEmailIndex(emailIndexOf(cipher, config.email));
    const taken = existing
      ? new Set<string>()
      : await users.usernamesStartingWith(usernameLookupPrefix(SEEDED_ADMIN_USERNAME));
    const decision = toAdminSeedBo(existing, taken).decide(config);
    if (decision.kind === 'skip') return 'skipped';
    const { email, ...account } = decision.user;
    const id = this.deps.newId();
    const passwordHash = await this.deps.hasher.hash(config.password);
    await users.insert({ id, ...account, ...toSealedEmail(cipher, id, email), passwordHash });
    return 'created';
  }
}
