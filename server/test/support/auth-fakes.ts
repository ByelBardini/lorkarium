import type { AuthSessionsDao } from '../../src/modules/auth/auth-sessions.dao';
import type { AuthSessionPo, NewAuthSessionPo } from '../../src/modules/auth/auth-sessions.po';
import type { ClockPort } from '../../src/modules/auth/clock.port';
import type { PasswordHasherPort } from '../../src/modules/auth/password-hasher.port';
import type { SessionTokenPort } from '../../src/modules/auth/session-token.port';
import type { UsersDao } from '../../src/modules/auth/users.dao';
import type { NewUserPo, UserPo } from '../../src/modules/auth/users.po';

const FAKE_CREATED_AT = new Date('2026-10-01T12:00:00Z');

/** In-memory users table; `inserted` keeps every insert in order, `lookedUp` every e-mail asked. */
export class UsersDaoFake implements Pick<UsersDao, 'findByEmail' | 'findById' | 'insert'> {
  readonly inserted: NewUserPo[] = [];
  readonly lookedUp: string[] = [];

  constructor(readonly rows: UserPo[] = []) {}

  async findByEmail(email: string): Promise<UserPo | undefined> {
    this.lookedUp.push(email);
    return this.rows.find((row) => row.email === email);
  }

  async findById(userId: string): Promise<UserPo | undefined> {
    return this.rows.find((row) => row.id === userId);
  }

  async insert(user: NewUserPo): Promise<UserPo> {
    this.inserted.push(user);
    const row: UserPo = {
      id: `user-${this.rows.length + 1}`,
      role: 'user',
      createdAt: FAKE_CREATED_AT,
      ...user,
    };
    this.rows.push(row);
    return row;
  }
}

/** In-memory auth_sessions table keyed by the token hash. */
export class AuthSessionsDaoFake implements Pick<
  AuthSessionsDao,
  'insert' | 'findById' | 'updateExpiry' | 'delete'
> {
  readonly rows = new Map<string, AuthSessionPo>();

  constructor(initial: AuthSessionPo[] = []) {
    for (const row of initial) this.rows.set(row.id, row);
  }

  async insert(session: NewAuthSessionPo): Promise<void> {
    this.rows.set(session.id, { createdAt: FAKE_CREATED_AT, ...session });
  }

  async findById(sessionId: string): Promise<AuthSessionPo | undefined> {
    return this.rows.get(sessionId);
  }

  async updateExpiry(sessionId: string, expiresAt: Date): Promise<void> {
    const row = this.rows.get(sessionId);
    if (row) this.rows.set(sessionId, { ...row, expiresAt });
  }

  async delete(sessionId: string): Promise<void> {
    this.rows.delete(sessionId);
  }
}

/** Reversible "hash" (`hashed:<password>`) that records every verification it was asked for. */
export class PasswordHasherFake implements PasswordHasherPort {
  readonly verifications: Array<{ hashed: string; password: string }> = [];

  async hash(password: string): Promise<string> {
    return `hashed:${password}`;
  }

  async verify(hashed: string, password: string): Promise<boolean> {
    this.verifications.push({ hashed, password });
    return hashed === `hashed:${password}`;
  }
}

/** Predictable tokens (`token-1`, `token-2`, …) and hashes (`sha:<token>`). */
export class SessionTokenFake implements SessionTokenPort {
  private issued = 0;

  generate(): string {
    this.issued += 1;
    return `token-${this.issued}`;
  }

  hash(token: string): string {
    return `sha:${token}`;
  }
}

/** A clock that stays where the test puts it. */
export class ClockFake implements ClockPort {
  constructor(public current: Date) {}

  now(): Date {
    return this.current;
  }
}
