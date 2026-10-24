import { AccountSuspendedError, ForbiddenRoleError } from './auth.error';
import type { UserPo } from './users.po';

export type UserRole = UserPo['role'];

// admin ⊇ user: an admin also plays, so it passes every route a user passes.
const ROLE_RANK: Readonly<Record<UserRole, number>> = { user: 0, admin: 1 };

/** What a signed-in account may reach, by its global role.
 *
 *  Example: `new UserAccessBo(row).requireRole('admin') // throws FORBIDDEN_ROLE for a user` */
export class UserAccessBo {
  constructor(private readonly user: Pick<UserPo, 'id' | 'role' | 'suspendedAt'>) {}

  requireRole(required: UserRole): void {
    if (ROLE_RANK[this.user.role] >= ROLE_RANK[required]) return;
    throw new ForbiddenRoleError(this.user.id, this.user.role, required);
  }

  /** A suspended account gets no session (login, second step, or one already open). */
  requireActive(): void {
    if (this.user.suspendedAt === null) return;
    throw new AccountSuspendedError(this.user.id, this.user.suspendedAt);
  }
}
