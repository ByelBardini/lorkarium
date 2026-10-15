import type { AdminSeedConfig } from '../../config/env';
import type { UserPo } from './users.po';

export const SEEDED_ADMIN_NAME = 'Admin';

export type AdminSeedDecision =
  | Readonly<{ kind: 'skip' }>
  | Readonly<{ kind: 'create'; user: Readonly<{ name: string; email: string; role: 'admin' }> }>;

/** Whether the boot creates the configured admin; an existing account is never touched.
 *
 *  Example: `new AdminSeedBo(await usersDao.findByEmail(seed.email)).decide(seed)` */
export class AdminSeedBo {
  constructor(private readonly existing: UserPo | undefined) {}

  decide(config: AdminSeedConfig | null): AdminSeedDecision {
    if (config === null || this.existing !== undefined) return { kind: 'skip' };
    return {
      kind: 'create',
      user: { name: SEEDED_ADMIN_NAME, email: config.email, role: 'admin' },
    };
  }
}
