import type { AuthUserDto } from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import { AdminSeedBo } from './admin-seed.bo';
import { AuthSessionBo } from './auth-session.bo';
import type { AuthSessionPo } from './auth-sessions.po';
import type { DataCipherPort } from './data-cipher.port';
import { TwoFactorChallengeBo } from './two-factor-challenge.bo';
import type { TwoFactorChallengePo } from './two-factor-challenges.po';
import { TwoFactorBo } from './two-factor.bo';
import type { UserTwoFactorPo } from './two-factor.po';
import { UserAccessBo } from './user-access.bo';
import type { SealedEmail, UserPo } from './users.po';

/** PO → DTO: what the client sees of the signed-in account (never the password hash); the e-mail
 *  is opened with the id as context, and the color is the effective one (chosen or drawn).
 *
 *  Example: `toAuthUserDto(row, cipher) // { id, username, name, email, role, color, avatarId }` */
export function toAuthUserDto(row: UserPo, cipher: DataCipherPort): AuthUserDto {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: cipher.open('user-email', row.emailCipher, row.id),
    role: row.role,
    color: memberColorOf(row.id, row.color),
    avatarId: row.avatarId,
  };
}

/** The columns that keep an e-mail at rest: sealed with the account id as context, plus the blind
 *  index the login looks it up by.
 *
 *  Example: `await usersDao.insert({ id, ...toSealedEmail(cipher, id, 'bia@x.com'), … })` */
export function toSealedEmail(cipher: DataCipherPort, userId: string, email: string): SealedEmail {
  return {
    emailCipher: cipher.seal('user-email', email, userId),
    emailIndex: emailIndexOf(cipher, email),
  };
}

/** The blind index of an e-mail (already normalized by the DTO or the env).
 *
 *  Example: `await usersDao.findByEmailIndex(emailIndexOf(cipher, dto.email))` */
export function emailIndexOf(cipher: DataCipherPort, email: string): string {
  return cipher.index('email-index', email);
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

/** PO (or its absence) and the @ already taken → BO for the boot seed.
 *
 *  Example: `toAdminSeedBo(await usersDao.findByEmailIndex(index), taken).decide(seed)` */
export function toAdminSeedBo(row: UserPo | undefined, taken: ReadonlySet<string>): AdminSeedBo {
  return new AdminSeedBo(row, taken);
}

/** A second factor as typed: a 6-digit app code, or a recovery code (`xxxxx-xxxxx`). */
export type SecondFactor = Readonly<{ kind: 'totp' | 'recovery'; code: string }>;

const TOTP_CODE = /^\d{6}$/;

/** A code already validated by `totpCodeDto` or `recoveryCodeDto` → which of the two it is.
 *
 *  Example: `toSecondFactor('123456') // { kind: 'totp', code: '123456' }` */
export function toSecondFactor(code: string): SecondFactor {
  return { kind: TOTP_CODE.test(code) ? 'totp' : 'recovery', code };
}

/** PO (or its absence) → BO for the second-factor rules; no row = 2FA off.
 *
 *  Example: `toTwoFactorBo(userId, await twoFactorDao.findOf(userId)).requireEnabled()` */
export function toTwoFactorBo(userId: string, row: UserTwoFactorPo | undefined): TwoFactorBo {
  return new TwoFactorBo({
    userId,
    enabled: (row?.enabledAt ?? null) !== null,
    lastStep: row?.lastStep ?? null,
  });
}

/** PO → BO for the deadline of the second step of a login.
 *
 *  Example: `toTwoFactorChallengeBo(row).isExpiredAt(now)` */
export function toTwoFactorChallengeBo(row: TwoFactorChallengePo): TwoFactorChallengeBo {
  return new TwoFactorChallengeBo({ expiresAt: row.expiresAt, failures: row.failures });
}

/** The blind index a recovery code is kept and looked up by (already normalized by the DTO).
 *
 *  Example: `await recoveryCodesDao.findOf(userId, recoveryCodeIndexOf(cipher, 'k7m2p-9qrst'))` */
export function recoveryCodeIndexOf(cipher: DataCipherPort, code: string): string {
  return cipher.index('recovery-code', code);
}
