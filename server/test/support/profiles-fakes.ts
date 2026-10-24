import type {
  AvatarOutcome,
  AvatarProcessorPort,
  AvatarRefusal,
} from '../../src/modules/profiles/avatar-processor.port';
import type { ProfileChangedPort } from '../../src/modules/profiles/profile-changed.port';
import type {
  ProfileChanges,
  ProfileRow,
  ProfilesDao,
} from '../../src/modules/profiles/profiles.dao';
import { ANA_ID } from './auth-factories';

/** A profile row as `ProfilesDao` reads it: Ana, automatic color, no bio, no photo.
 *
 *  Example: `profileRow({ color: 'rose' })` */
export function profileRow(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: ANA_ID,
    username: 'ana',
    name: 'Ana',
    color: null,
    bio: null,
    avatarId: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

/** In-memory profile columns of `users`; writes `update:<fields>` and `swap:<avatarId>` to the
 *  shared journal and keeps each change asked for in `updates`. */
export class ProfilesDaoFake implements Pick<
  ProfilesDao,
  'findById' | 'update' | 'swapAvatar' | 'isCurrentAvatar'
> {
  readonly updates: ProfileChanges[] = [];

  constructor(
    readonly rows: ProfileRow[] = [profileRow()],
    private readonly journal: string[] = [],
  ) {}

  async findById(userId: string): Promise<ProfileRow | undefined> {
    return this.rows.find((row) => row.id === userId);
  }

  async update(userId: string, changes: ProfileChanges): Promise<ProfileRow | undefined> {
    this.journal.push(`update:${Object.keys(changes).join(',')}`);
    this.updates.push(changes);
    return this.replace(userId, changes);
  }

  async swapAvatar(
    userId: string,
    avatarId: string | null,
  ): Promise<Readonly<{ previousAvatarId: string | null }> | undefined> {
    this.journal.push(`swap:${avatarId ?? 'none'}`);
    const previous = await this.findById(userId);
    if (!previous) return undefined;
    this.replace(userId, { avatarId });
    return { previousAvatarId: previous.avatarId };
  }

  async isCurrentAvatar(avatarId: string): Promise<boolean> {
    return this.rows.some((row) => row.avatarId === avatarId);
  }

  private replace(userId: string, changes: Partial<ProfileRow>): ProfileRow | undefined {
    const index = this.rows.findIndex((row) => row.id === userId);
    const current = this.rows[index];
    if (!current) return undefined;
    const next = { ...current, ...changes };
    this.rows[index] = next;
    return next;
  }
}

/** Answers every photo with `result` (or `refusal` when set); writes 'normalize' to the journal. */
export class AvatarProcessorFake implements AvatarProcessorPort {
  refusal: AvatarRefusal | null = null;
  readonly result = { bytes: Uint8Array.from([7, 7, 7]), frames: 1 };

  constructor(private readonly journal: string[] = []) {}

  async normalize(): Promise<AvatarOutcome> {
    this.journal.push('normalize');
    if (this.refusal) return { ok: false, refusal: this.refusal };
    return { ok: true, avatar: this.result };
  }
}

/** Keeps each user told about and writes `profileChanged:<userId>` to the journal. */
export class ProfileChangedFake implements ProfileChangedPort {
  readonly told: string[] = [];

  constructor(private readonly journal: string[] = []) {}

  async profileChanged(userId: string): Promise<void> {
    this.journal.push(`profileChanged:${userId}`);
    this.told.push(userId);
  }
}
