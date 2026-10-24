import type { RecoveryCodesDao } from '../../src/modules/auth/recovery-codes.dao';
import type { TotpPort } from '../../src/modules/auth/totp.port';
import type { TwoFactorChallengesDao } from '../../src/modules/auth/two-factor-challenges.dao';
import type {
  NewTwoFactorChallengePo,
  TwoFactorChallengePo,
} from '../../src/modules/auth/two-factor-challenges.po';
import type { TwoFactorDao } from '../../src/modules/auth/two-factor.dao';
import type { RecoveryCodePo, UserTwoFactorPo } from '../../src/modules/auth/two-factor.po';

const FAKE_CREATED_AT = new Date('2026-10-01T12:00:00Z');
const STEP_MS = 30_000;

/** A TOTP whose codes the spec decides: `stepsByCode.set('111111', step)` makes that code match
 *  that step; any other code matches none. `secretsAsked` keeps the (opened) secret of each check. */
export class TotpFake implements TotpPort {
  readonly stepsByCode = new Map<string, number>();
  readonly secretsAsked: string[] = [];
  private drawn = 0;

  generateSecret(): string {
    this.drawn += 1;
    return `SECRET${this.drawn}`;
  }

  uri(secret: string, account: string): string {
    return `otpauth://totp/Lorkarium:${account}?secret=${secret}&issuer=Lorkarium`;
  }

  currentStep(at: Date): number {
    return Math.floor(at.getTime() / STEP_MS);
  }

  stepOf(secret: string, code: string): number | null {
    this.secretsAsked.push(secret);
    return this.stepsByCode.get(code) ?? null;
  }
}

/** In-memory user_two_factor table keyed by user id. */
export class TwoFactorDaoFake implements Pick<
  TwoFactorDao,
  'findOf' | 'savePending' | 'enable' | 'recordStep' | 'delete'
> {
  readonly rows = new Map<string, UserTwoFactorPo>();

  async findOf(userId: string): Promise<UserTwoFactorPo | undefined> {
    return this.rows.get(userId);
  }

  async savePending(userId: string, secretCipher: string): Promise<void> {
    const pending = { secretCipher, enabledAt: null, lastStep: null };
    this.rows.set(userId, { userId, createdAt: FAKE_CREATED_AT, ...pending });
  }

  async enable(userId: string, enabledAt: Date, lastStep: number): Promise<void> {
    const row = this.rows.get(userId);
    if (row) this.rows.set(userId, { ...row, enabledAt, lastStep });
  }

  async recordStep(userId: string, step: number): Promise<boolean> {
    const row = this.rows.get(userId);
    if (!row || (row.lastStep !== null && row.lastStep >= step)) return false;
    this.rows.set(userId, { ...row, lastStep: step });
    return true;
  }

  async delete(userId: string): Promise<void> {
    this.rows.delete(userId);
  }
}

/** In-memory recovery_codes table. */
export class RecoveryCodesDaoFake implements Pick<
  RecoveryCodesDao,
  'findOf' | 'use' | 'replace' | 'countUnused'
> {
  rows: RecoveryCodePo[] = [];

  async findOf(userId: string, codeIndex: string): Promise<RecoveryCodePo | undefined> {
    return this.rows.find((row) => row.userId === userId && row.codeIndex === codeIndex);
  }

  async use(userId: string, codeIndex: string, usedAt: Date): Promise<boolean> {
    const row = await this.findOf(userId, codeIndex);
    if (!row || row.usedAt !== null) return false;
    row.usedAt = usedAt;
    return true;
  }

  async replace(userId: string, codeIndexes: readonly string[]): Promise<void> {
    const kept = this.rows.filter((row) => row.userId !== userId);
    const fresh = codeIndexes.map((codeIndex, position) => ({
      id: `code-${position + 1}`,
      userId,
      codeIndex,
      usedAt: null,
      createdAt: FAKE_CREATED_AT,
    }));
    this.rows = [...kept, ...fresh];
  }

  async countUnused(userId: string): Promise<number> {
    return this.rows.filter((row) => row.userId === userId && row.usedAt === null).length;
  }
}

/** In-memory two_factor_challenges table keyed by the token hash. */
export class TwoFactorChallengesDaoFake implements Pick<
  TwoFactorChallengesDao,
  'insert' | 'findById' | 'recordFailure' | 'delete' | 'deleteAllOf'
> {
  readonly rows = new Map<string, TwoFactorChallengePo>();

  async insert(challenge: NewTwoFactorChallengePo): Promise<void> {
    this.rows.set(challenge.id, { failures: 0, createdAt: FAKE_CREATED_AT, ...challenge });
  }

  async findById(challengeId: string): Promise<TwoFactorChallengePo | undefined> {
    return this.rows.get(challengeId);
  }

  async recordFailure(challengeId: string): Promise<number> {
    const row = this.rows.get(challengeId);
    if (!row) return 0;
    this.rows.set(challengeId, { ...row, failures: row.failures + 1 });
    return row.failures + 1;
  }

  async delete(challengeId: string): Promise<void> {
    this.rows.delete(challengeId);
  }

  async deleteAllOf(userId: string): Promise<void> {
    for (const row of [...this.rows.values()]) {
      if (row.userId === userId) this.rows.delete(row.id);
    }
  }
}
