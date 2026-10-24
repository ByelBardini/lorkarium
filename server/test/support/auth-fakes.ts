import type { AuthSessionsDao } from '../../src/modules/auth/auth-sessions.dao';
import type { AuthSessionPo, NewAuthSessionPo } from '../../src/modules/auth/auth-sessions.po';
import type { ClockPort } from '../../src/modules/auth/clock.port';
import type { PasswordHasherPort } from '../../src/modules/auth/password-hasher.port';
import type { SessionEndedPort } from '../../src/modules/auth/session-ended.port';
import type { SessionTokenPort } from '../../src/modules/auth/session-token.port';
import type { CipherPurpose, DataCipherPort } from '../../src/modules/auth/data-cipher.port';
import type { PlainEmailRow, UsersDao } from '../../src/modules/auth/users.dao';
import type { NewUserPo, SealedEmail, UserPo } from '../../src/modules/auth/users.po';

const FAKE_CREATED_AT = new Date('2026-10-01T12:00:00Z');

type UsersDaoSlice = Pick<
  UsersDao,
  | 'findByEmailIndex'
  | 'findById'
  | 'findByUsername'
  | 'usernamesStartingWith'
  | 'insert'
  | 'listPlainEmails'
  | 'sealEmail'
  | 'updatePassword'
  | 'updateEmail'
  | 'touchLastSeen'
>;

/** In-memory users table; `inserted` keeps every insert in order, `lookedUp` every e-mail index
 *  asked (never an e-mail in clear), `plain` the accounts still unsealed (the backfill's input). */
export class UsersDaoFake implements UsersDaoSlice {
  readonly inserted: NewUserPo[] = [];
  readonly lookedUp: string[] = [];
  readonly sealed: Array<{ userId: string } & SealedEmail> = [];

  constructor(
    readonly rows: UserPo[] = [],
    public plain: PlainEmailRow[] = [],
  ) {}

  async findByEmailIndex(emailIndex: string): Promise<UserPo | undefined> {
    this.lookedUp.push(emailIndex);
    return this.rows.find((row) => row.emailIndex === emailIndex);
  }

  async findById(userId: string): Promise<UserPo | undefined> {
    return this.rows.find((row) => row.id === userId);
  }

  async findByUsername(username: string): Promise<UserPo | undefined> {
    return this.rows.find((row) => row.username === username);
  }

  async usernamesStartingWith(prefix: string): Promise<ReadonlySet<string>> {
    const names = this.rows.map((row) => row.username);
    return new Set(names.filter((name) => name.startsWith(prefix)));
  }

  async insert(user: NewUserPo): Promise<UserPo> {
    this.inserted.push(user);
    const row: UserPo = {
      id: `user-${this.rows.length + 1}`,
      role: 'user',
      color: null,
      bio: null,
      avatarId: null,
      passwordChangedAt: null,
      suspendedAt: null,
      lastSeenAt: null,
      createdAt: FAKE_CREATED_AT,
      ...user,
    };
    this.rows.push(row);
    return row;
  }

  async listPlainEmails(): Promise<readonly PlainEmailRow[]> {
    return this.plain;
  }

  async sealEmail(userId: string, sealed: SealedEmail): Promise<void> {
    this.sealed.push({ userId, ...sealed });
    this.plain = this.plain.filter((row) => row.id !== userId);
  }

  async updatePassword(userId: string, passwordHash: string, changedAt: Date): Promise<void> {
    this.patch(userId, { passwordHash, passwordChangedAt: changedAt });
  }

  /** Throws the unique violation the real index raises (`cause.code` 23505) on a taken index. */
  async updateEmail(userId: string, sealed: SealedEmail): Promise<void> {
    const owner = this.rows.find((row) => row.emailIndex === sealed.emailIndex);
    if (owner && owner.id !== userId) {
      throw new Error('duplicate key value violates unique constraint', {
        cause: { code: '23505' },
      });
    }
    this.patch(userId, sealed);
  }

  async touchLastSeen(userId: string, lastSeenAt: Date): Promise<void> {
    this.patch(userId, { lastSeenAt });
  }

  private patch(userId: string, changes: Partial<UserPo>): void {
    const at = this.rows.findIndex((row) => row.id === userId);
    const row = this.rows[at];
    if (row) this.rows[at] = { ...row, ...changes };
  }
}

/** Readable "cipher": `seal` = `sealed:<purpose>:<context>:<text>`, `index` = `idx:<purpose>:<value>`;
 *  `open` reverses `seal` and throws on another purpose or context, like the real one. */
export class DataCipherFake implements DataCipherPort {
  seal(purpose: CipherPurpose, plaintext: string, context: string): string {
    return `sealed:${purpose}:${context}:${plaintext}`;
  }

  open(purpose: CipherPurpose, sealed: string, context: string): string {
    const prefix = `sealed:${purpose}:${context}:`;
    if (!sealed.startsWith(prefix)) {
      throw new Error(`cannot open a ${purpose} value with context ${context}: ${sealed}`);
    }
    return sealed.slice(prefix.length);
  }

  index(purpose: CipherPurpose, value: string): string {
    return `idx:${purpose}:${value}`;
  }
}

/** In-memory auth_sessions table keyed by the token hash; `touched` keeps every last-seen write. */
export class AuthSessionsDaoFake implements Pick<
  AuthSessionsDao,
  | 'insert'
  | 'findById'
  | 'updateExpiry'
  | 'delete'
  | 'touch'
  | 'listOf'
  | 'findOfUser'
  | 'deleteOthersOf'
  | 'deleteAllOf'
> {
  readonly rows = new Map<string, AuthSessionPo>();
  readonly touched: Array<{ sessionId: string; lastSeenAt: Date }> = [];
  private inserted = 0;

  constructor(initial: AuthSessionPo[] = []) {
    for (const row of initial) this.rows.set(row.id, row);
  }

  async insert(session: NewAuthSessionPo): Promise<void> {
    this.inserted += 1;
    const publicId = `00000000-0000-4000-8000-${String(this.inserted).padStart(12, '0')}`;
    const defaults = { publicId, userAgent: null, lastSeenAt: FAKE_CREATED_AT };
    this.rows.set(session.id, { createdAt: FAKE_CREATED_AT, ...defaults, ...session });
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

  async touch(sessionId: string, lastSeenAt: Date): Promise<void> {
    this.touched.push({ sessionId, lastSeenAt });
    const row = this.rows.get(sessionId);
    if (row) this.rows.set(sessionId, { ...row, lastSeenAt });
  }

  async listOf(userId: string, now: Date): Promise<AuthSessionPo[]> {
    const live = [...this.rows.values()].filter(
      (row) => row.userId === userId && row.expiresAt > now,
    );
    return live.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  }

  async findOfUser(userId: string, publicId: string): Promise<AuthSessionPo | undefined> {
    return [...this.rows.values()].find(
      (row) => row.userId === userId && row.publicId === publicId,
    );
  }

  async deleteOthersOf(userId: string, keptSessionId: string): Promise<string[]> {
    const others = [...this.rows.values()].filter(
      (row) => row.userId === userId && row.id !== keptSessionId,
    );
    for (const row of others) this.rows.delete(row.id);
    return others.map((row) => row.id);
  }

  async deleteAllOf(userId: string): Promise<string[]> {
    const own = [...this.rows.values()].filter((row) => row.userId === userId);
    for (const row of own) this.rows.delete(row.id);
    return own.map((row) => row.id);
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

/** Keeps every session announced as ended; `whenEnded` lets a spec look at the world right then. */
export class SessionEndedFake implements SessionEndedPort {
  readonly ended: string[] = [];
  whenEnded: (sessionId: string) => void = () => undefined;

  sessionEnded(sessionId: string): void {
    this.ended.push(sessionId);
    this.whenEnded(sessionId);
  }
}

/** A clock that stays where the test puts it. */
export class ClockFake implements ClockPort {
  constructor(public current: Date) {}

  now(): Date {
    return this.current;
  }
}
