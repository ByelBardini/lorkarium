import type {
  AvatarOutcome,
  AvatarProcessorPort,
  AvatarRefusal,
  ImageShape,
} from '../../src/modules/profiles/avatar-processor.port';
import type { ProfileChangedPort } from '../../src/modules/profiles/profile-changed.port';
import type {
  ProfileChanges,
  ProfileRow,
  ProfilesDao,
} from '../../src/modules/profiles/profiles.dao';
import { ANA_ID } from './auth-factories';

/** A profile row as `ProfilesDao` reads it: Ana, automatic color, no bio, no photo, no dice
 *  texture and the automatic dice number color.
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
    diceTextureId: null,
    diceNumberColor: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

/** In-memory profile columns of `users`; writes `update:<fields>`, `swap:<avatarId>` and
 *  `swapDice:<diceTextureId>` to the shared journal and keeps each change asked for in `updates`. */
export class ProfilesDaoFake implements Pick<
  ProfilesDao,
  | 'findById'
  | 'update'
  | 'swapAvatar'
  | 'isCurrentAvatar'
  | 'swapDiceTexture'
  | 'isCurrentDiceTexture'
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
  ): Promise<Readonly<{ previousId: string | null }> | undefined> {
    this.journal.push(`swap:${avatarId ?? 'none'}`);
    const previous = await this.findById(userId);
    if (!previous) return undefined;
    this.replace(userId, { avatarId });
    return { previousId: previous.avatarId };
  }

  async isCurrentAvatar(avatarId: string): Promise<boolean> {
    return this.rows.some((row) => row.avatarId === avatarId);
  }

  async swapDiceTexture(
    userId: string,
    diceTextureId: string | null,
  ): Promise<Readonly<{ previousId: string | null }> | undefined> {
    this.journal.push(`swapDice:${diceTextureId ?? 'none'}`);
    const previous = await this.findById(userId);
    if (!previous) return undefined;
    this.replace(userId, { diceTextureId });
    return { previousId: previous.diceTextureId };
  }

  async isCurrentDiceTexture(diceTextureId: string): Promise<boolean> {
    return this.rows.some((row) => row.diceTextureId === diceTextureId);
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

/** Answers every image with `result` (or `refusal` when set); keeps the shape each one was asked
 *  for in `shapes` and writes 'normalize' to the journal. */
export class AvatarProcessorFake implements AvatarProcessorPort {
  refusal: AvatarRefusal | null = null;
  readonly result = { bytes: Uint8Array.from([7, 7, 7]), frames: 1 };
  readonly shapes: ImageShape[] = [];

  constructor(private readonly journal: string[] = []) {}

  async normalize(_bytes: Uint8Array, shape: ImageShape): Promise<AvatarOutcome> {
    this.journal.push('normalize');
    this.shapes.push(shape);
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
