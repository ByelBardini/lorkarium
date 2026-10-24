import type { AuthSessionPo, NewAuthSessionPo } from '../../src/modules/auth/auth-sessions.po';
import type { NewUserPo, SealedEmail, UserPo } from '../../src/modules/auth/users.po';

export const ANA_ID = '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01';

/** The overrides of a user row, with the e-mail in clear for convenience: the factory seals it the
 *  way `DataCipherFake` does (`sealed:user-email:<id>:<email>`, `idx:email-index:<email>`). */
export type UserOverrides<T> = Partial<T> & { email?: string };

/** The two at-rest columns of `email` as `DataCipherFake` writes them, bound to `context`.
 *
 *  Example: `fakeSealedEmail('bia@mesa.com', BIA_ID).emailIndex // 'idx:email-index:bia@mesa.com'` */
export function fakeSealedEmail(email: string, context: string): SealedEmail {
  return {
    emailCipher: `sealed:user-email:${context}:${email}`,
    emailIndex: `idx:email-index:${email}`,
  };
}

/** A user row as it would be inserted (no role or createdAt: the database fills them); the @ is the
 *  local part of the e-mail, and the cipher is the fake one (no real key opens it).
 *
 *  Example: `await usersDao.insert(newUserPo({ email: 'bia@mesa.com' }))` */
export function newUserPo(overrides: UserOverrides<NewUserPo> = {}): NewUserPo {
  const { email = 'ana@mesa.com', ...rest } = overrides;
  return {
    name: 'Ana',
    username: usernameOfFake(email),
    ...fakeSealedEmail(email, 'unbound'),
    passwordHash: '$argon2id$fake',
    ...rest,
  };
}

/** A persisted user row, its e-mail sealed by the fake with the row id as context.
 *
 *  Example: `userPo({ role: 'admin' })` */
export function userPo(overrides: UserOverrides<UserPo> = {}): UserPo {
  const { email = 'ana@mesa.com', ...rest } = overrides;
  const id = rest.id ?? ANA_ID;
  return {
    id,
    name: 'Ana',
    username: usernameOfFake(email),
    ...fakeSealedEmail(email, id),
    passwordHash: '$argon2id$fake',
    role: 'user',
    color: null,
    bio: null,
    avatarId: null,
    passwordChangedAt: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...rest,
  };
}

function usernameOfFake(email: string): string {
  return (email.split('@')[0] ?? 'ana').toLowerCase().replace(/[^a-z0-9._]/g, '');
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
    publicId: '5b1d7c2e-8f4a-4e6b-9c3d-2a1f0e9d8c7b',
    userAgent: null,
    lastSeenAt: new Date('2026-10-01T12:00:00Z'),
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}
