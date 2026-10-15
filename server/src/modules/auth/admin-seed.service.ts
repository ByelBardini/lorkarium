import type { AdminSeedConfig } from '../../config/env';
import { toAdminSeedBo } from './auth.mapper';
import type { PasswordHasherPort } from './password-hasher.port';
import type { UsersDao } from './users.dao';

/** Creates the admin from ADMIN_EMAIL/ADMIN_PASSWORD at boot, once; never rewrites an account.
 *
 *  Example: `await new AdminSeedService(usersDao, hasher).seed(env.adminSeed) // 'created'` */
export class AdminSeedService {
  constructor(
    private readonly users: Pick<UsersDao, 'findByEmail' | 'insert'>,
    private readonly hasher: PasswordHasherPort,
  ) {}

  async seed(config: AdminSeedConfig | null): Promise<'created' | 'skipped'> {
    const existing = config ? await this.users.findByEmail(config.email) : undefined;
    const decision = toAdminSeedBo(existing).decide(config);
    if (decision.kind === 'skip' || !config) return 'skipped';
    const passwordHash = await this.hasher.hash(config.password);
    await this.users.insert({ ...decision.user, passwordHash });
    return 'created';
  }
}
