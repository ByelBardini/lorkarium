import type { AuthSessionPo, NewAuthSessionPo } from '../../src/modules/auth/auth-sessions.po';
import type { NewUserPo, UserPo } from '../../src/modules/auth/users.po';

export const ANA_ID = '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01';

/** A user row as it would be inserted (no id, role or createdAt: the database fills them).
 *
 *  Example: `await usersDao.insert(newUserPo({ email: 'bia@mesa.com' }))` */
export function newUserPo(overrides: Partial<NewUserPo> = {}): NewUserPo {
  return { name: 'Ana', email: 'ana@mesa.com', passwordHash: '$argon2id$fake', ...overrides };
}

/** A persisted user row.
 *
 *  Example: `userPo({ role: 'admin' })` */
export function userPo(overrides: Partial<UserPo> = {}): UserPo {
  return {
    id: ANA_ID,
    name: 'Ana',
    email: 'ana@mesa.com',
    passwordHash: '$argon2id$fake',
    role: 'user',
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

/** A session row as it would be inserted.
 *
 *  Example: `await sessionsDao.insert(newAuthSessionPo({ userId: user.id }))` */
export function newAuthSessionPo(overrides: Partial<NewAuthSessionPo> = {}): NewAuthSessionPo {
  return {
    id: 'a'.repeat(64),
    userId: ANA_ID,
    expiresAt: new Date('2026-10-31T12:00:00Z'),
    persistent: true,
    ...overrides,
  };
}

/** A persisted session row.
 *
 *  Example: `authSessionPo({ persistent: false })` */
export function authSessionPo(overrides: Partial<AuthSessionPo> = {}): AuthSessionPo {
  return {
    id: 'a'.repeat(64),
    userId: ANA_ID,
    expiresAt: new Date('2026-10-31T12:00:00Z'),
    persistent: true,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}
