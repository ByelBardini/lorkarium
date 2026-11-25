import type { CustomEmojiRefDto, UserPlan } from '@lorkarium/contracts';
import type { UsersDao } from '../../src/modules/auth/users.dao';
import type { UserPlanPo } from '../../src/modules/auth/users.po';
import {
  customEmojiRefsIn,
  type ActiveEmoji,
} from '../../src/modules/custom-emojis/custom-emoji.bo';
import { CustomEmojiNameTakenError } from '../../src/modules/custom-emojis/custom-emoji.error';
import type {
  CustomEmojiPo,
  NewCustomEmojiPo,
} from '../../src/modules/custom-emojis/custom-emoji.po';
import type { CustomEmojiRefsPort } from '../../src/modules/custom-emojis/custom-emoji-refs.port';
import { EMOJI_NAME_RULES } from '../../src/modules/custom-emojis/custom-emoji-refs.service';
import type {
  CustomEmojisDao,
  CustomEmojiWithOwnerPo,
} from '../../src/modules/custom-emojis/custom-emojis.dao';
import type {
  AvatarOutcome,
  AvatarProcessorPort,
  AvatarRefusal,
  ImageShape,
} from '../../src/modules/profiles/avatar-processor.port';

/** The active emojis of each account, kept in memory, and the texts it was asked about. */
export class CustomEmojiRefsFake implements CustomEmojiRefsPort {
  readonly asked: Array<Readonly<{ userId: string; text: string }>> = [];
  private readonly active = new Map<string, readonly ActiveEmoji[]>();

  give(userId: string, emojis: readonly ActiveEmoji[]): this {
    this.active.set(userId, emojis);
    return this;
  }

  async refsIn(userId: string, text: string): Promise<CustomEmojiRefDto[]> {
    this.asked.push({ userId, text });
    return customEmojiRefsIn(text, this.active.get(userId) ?? [], EMOJI_NAME_RULES);
  }
}

/** A plan account as the DAOs read it: a user on `plan`, no paid plan, not the Dono. */
export function planAccount(plan: UserPlan, role: 'user' | 'admin' = 'user'): UserPlanPo {
  return { role, plan, activePaidPlan: null, lorkariumOwner: false };
}

/** The `custom_emojis` table and the plan of each account, in memory. Writes are keyed by the
 *  owner, as the real DAO's; a repeated name of the same owner throws `CUSTOM_EMOJI_NAME_TAKEN`. */
export class CustomEmojisDaoFake
  implements
    Pick<
      CustomEmojisDao,
      'listOf' | 'findOwnerPlan' | 'findWithOwner' | 'insert' | 'rename' | 'remove'
    >,
    Pick<UsersDao, 'lockForPlan'>
{
  readonly rows: CustomEmojiPo[] = [];
  readonly plans = new Map<string, UserPlanPo>();
  /** How many times `listOf` read the table. */
  listed = 0;
  /** A failure the next `insert` throws (the database down after the picture went up). */
  failNextInsert: Error | null = null;
  private clock = 0;

  owner(userId: string, account: UserPlanPo): this {
    this.plans.set(userId, account);
    return this;
  }

  seed(ownerId: string, id: string, name: string, animated = false): this {
    this.rows.push({ id, ownerId, name, animated, createdAt: this.nextInstant() });
    return this;
  }

  async listOf(ownerId: string): Promise<CustomEmojiPo[]> {
    this.listed += 1;
    return this.rows.filter((row) => row.ownerId === ownerId);
  }

  async findOwnerPlan(ownerId: string): Promise<UserPlanPo | undefined> {
    return this.plans.get(ownerId);
  }

  async lockForPlan(userId: string): Promise<UserPlanPo | undefined> {
    return this.plans.get(userId);
  }

  async findWithOwner(emojiId: string): Promise<CustomEmojiWithOwnerPo | undefined> {
    const emoji = this.rows.find((row) => row.id === emojiId);
    const owner = emoji === undefined ? undefined : this.plans.get(emoji.ownerId);
    return emoji === undefined || owner === undefined ? undefined : { emoji, owner };
  }

  async insert(row: NewCustomEmojiPo): Promise<CustomEmojiPo> {
    if (this.failNextInsert) throw this.takeFailure();
    this.requireFreeName(row.ownerId, row.name);
    const inserted = { ...row, createdAt: this.nextInstant() };
    this.rows.push(inserted);
    return inserted;
  }

  async rename(ownerId: string, emojiId: string, name: string): Promise<CustomEmojiPo | undefined> {
    const at = this.indexOf(ownerId, emojiId);
    const row = this.rows[at];
    if (row === undefined) return undefined;
    this.requireFreeName(ownerId, name, emojiId);
    const renamed = { ...row, name };
    this.rows[at] = renamed;
    return renamed;
  }

  async remove(ownerId: string, emojiId: string): Promise<CustomEmojiPo | undefined> {
    const at = this.indexOf(ownerId, emojiId);
    const [removed] = at < 0 ? [] : this.rows.splice(at, 1);
    return removed;
  }

  private indexOf(ownerId: string, emojiId: string): number {
    return this.rows.findIndex((row) => row.ownerId === ownerId && row.id === emojiId);
  }

  private requireFreeName(ownerId: string, name: string, exceptId?: string): void {
    const taken = this.rows.some(
      (row) => row.ownerId === ownerId && row.name === name && row.id !== exceptId,
    );
    if (taken) throw new CustomEmojiNameTakenError(name);
  }

  private takeFailure(): Error {
    const failure = this.failNextInsert ?? new Error('no failure set');
    this.failNextInsert = null;
    return failure;
  }

  private nextInstant(): Date {
    this.clock += 1;
    return new Date(Date.UTC(2026, 10, 24, 12, this.clock));
  }
}

/** Answers a still picture always, and a moving one only when asked and the input has frames. */
export class EmojiPictureProcessorFake implements AvatarProcessorPort {
  /** Frames of the input: above 1 it is a GIF. */
  sourceFrames = 1;
  refusal: AvatarRefusal | null = null;
  readonly shapes: ImageShape[] = [];

  async normalize(_bytes: Uint8Array, shape: ImageShape): Promise<AvatarOutcome> {
    this.shapes.push(shape);
    if (this.refusal) return { ok: false, refusal: this.refusal };
    const frames = shape.animated ? this.sourceFrames : 1;
    return { ok: true, avatar: { bytes: Uint8Array.from([frames]), frames } };
  }
}

/** Remembers which accounts were forgotten. */
export class EmojiRefsForgetFake {
  readonly forgotten: string[] = [];

  forget(userId: string): void {
    this.forgotten.push(userId);
  }
}
