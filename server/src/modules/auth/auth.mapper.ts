import type { AuthUserDto } from '@lorkarium/contracts';
import { AdminSeedBo } from './admin-seed.bo';
import { AuthSessionBo } from './auth-session.bo';
import type { AuthSessionPo } from './auth-sessions.po';
import { UserAccessBo } from './user-access.bo';
import type { UserPo } from './users.po';

/** PO → DTO: what the client sees of the signed-in account (never the password hash).
 *
 *  Example: `toAuthUserDto(row) // { id, name, email, role }` */
export function toAuthUserDto(row: UserPo): AuthUserDto {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

/** PO → BO for the session deadline rules.
 *
 *  Example: `toAuthSessionBo(row).isExpiredAt(now)` */
export function toAuthSessionBo(row: AuthSessionPo): AuthSessionBo {
  return new AuthSessionBo({ expiresAt: row.expiresAt, persistent: row.persistent });
}

/** PO → BO for the role check.
 *
 *  Example: `toUserAccessBo(row).requireRole('admin')` */
export function toUserAccessBo(row: UserPo): UserAccessBo {
  return new UserAccessBo({ id: row.id, role: row.role });
}

/** PO (or its absence) → BO for the boot seed.
 *
 *  Example: `toAdminSeedBo(await usersDao.findByEmail(email)).decide(seed)` */
export function toAdminSeedBo(row: UserPo | undefined): AdminSeedBo {
  return new AdminSeedBo(row);
}
