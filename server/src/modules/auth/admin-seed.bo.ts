import type { AdminSeedConfig } from '../../config/env';
import { uniqueUsername } from './username.bo';
import type { UserPo } from './users.po';

// The seeded admin is @admin whatever its e-mail (`admin2`… if a person already took it), and its
// nickname is born equal to the @, like every account.
export const SEEDED_ADMIN_USERNAME = 'admin';

export type SeededAdmin = Readonly<{
  username: string;
  name: string;
  email: string;
  role: 'admin';
}>;

export type AdminSeedDecision =
  Readonly<{ kind: 'skip' }> | Readonly<{ kind: 'create'; user: SeededAdmin }>;

/** Whether the boot creates the configured admin; an existing account is never touched.
 *
 *  Example: `new AdminSeedBo(await usersDao.findByEmailIndex(index), taken).decide(seed)` */
export class AdminSeedBo {
  constructor(
    private readonly existing: UserPo | undefined,
    private readonly takenUsernames: ReadonlySet<string>,
  ) {}

  decide(config: AdminSeedConfig | null): AdminSeedDecision {
    if (config === null || this.existing !== undefined) return { kind: 'skip' };
    const username = uniqueUsername(SEEDED_ADMIN_USERNAME, this.takenUsernames);
    return {
      kind: 'create',
      user: { username, name: username, email: config.email, role: 'admin' },
    };
  }
}
