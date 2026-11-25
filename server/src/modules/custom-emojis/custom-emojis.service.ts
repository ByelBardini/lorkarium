import {
  CUSTOM_EMOJI_MAX_BYTES,
  CUSTOM_EMOJI_SIDE,
  type CustomEmojiListDto,
} from '@lorkarium/contracts';
import type { AssetStoragePort, StoredObject } from '../assets/asset-storage.port';
import type { UserPlanPo } from '../auth/users.po';
import type { UsersDao } from '../auth/users.dao';
import { PlanLimitsBo, effectiveLimitsOf } from '../plans/plan-limits.bo';
import type { AvatarProcessorPort, NormalizedAvatar } from '../profiles/avatar-processor.port';
import type { CustomEmojiRefsService } from './custom-emoji-refs.service';
import {
  CustomEmojiNotFoundError,
  CustomEmojiTooLargeError,
  UnsupportedCustomEmojiError,
} from './custom-emoji.error';
import type { CustomEmojiPo } from './custom-emoji.po';
import type { CustomEmojisDao } from './custom-emojis.dao';
import {
  CUSTOM_EMOJI_CONTENT_TYPE,
  customEmojiKeyOf,
  customEmojiKeysOf,
  servedCustomEmojiKeyOf,
  stillCustomEmojiKeyOf,
  toCustomEmojiList,
} from './custom-emojis.mapper';

export type CustomEmojisTransactionRunner = <T>(
  work: (
    emojis: Pick<CustomEmojisDao, 'listOf' | 'insert'>,
    users: Pick<UsersDao, 'lockForPlan'>,
  ) => Promise<T>,
) => Promise<T>;

export type CustomEmojisServiceDeps = Readonly<{
  emojis: Pick<CustomEmojisDao, 'listOf' | 'findOwnerPlan' | 'findWithOwner' | 'rename' | 'remove'>;
  transaction: CustomEmojisTransactionRunner;
  storage: Pick<AssetStoragePort, 'put' | 'open' | 'remove'>;
  processor: AvatarProcessorPort;
  refs: Pick<CustomEmojiRefsService, 'forget'>;
  newId: () => string;
}>;

type Picture = Readonly<{ still: Uint8Array; moving: Uint8Array | null }>;

/** The emojis of one account: listing, creating (picture first, row last), renaming, removing and
 *  serving the picture. Every answer is the whole list, oldest first.
 *
 *  Example: `await service.create(userId, 'festa', bytes)` */
export class CustomEmojisService {
  constructor(private readonly deps: CustomEmojisServiceDeps) {}

  /** Example: `await service.list(userId) // { emojis: [], limit: 10 }` */
  async list(userId: string): Promise<CustomEmojiListDto> {
    const limits = effectiveLimitsOf(await this.ownerOf(userId));
    return toCustomEmojiList(await this.deps.emojis.listOf(userId), limits);
  }

  /** Refuses before decoding when the plan has no room; counts again under the account's lock, so
   *  two sends together never pass the ceiling. A GIF moves only on a plan with animation.
   *
   *  Example: `await service.create(userId, 'festa', gifBytes)` */
  async create(userId: string, name: string, bytes: Uint8Array): Promise<CustomEmojiListDto> {
    if (bytes.byteLength > CUSTOM_EMOJI_MAX_BYTES) {
      throw new CustomEmojiTooLargeError(CUSTOM_EMOJI_MAX_BYTES, bytes.byteLength);
    }
    const limits = effectiveLimitsOf(await this.ownerOf(userId));
    const stored = (await this.deps.emojis.listOf(userId)).length;
    PlanLimitsBo.requireRoom('customEmojis', stored, 1, limits);
    const picture = await this.pictureOf(bytes, limits.animatedCustomEmojis);
    const emojiId = this.deps.newId();
    await this.putPicture(emojiId, picture);
    const row = { id: emojiId, ownerId: userId, name, animated: picture.moving !== null };
    await this.insertCounted(row, userId).catch(async (error: unknown) => {
      await this.removePicture(row);
      throw error;
    });
    this.deps.refs.forget(userId);
    return this.list(userId);
  }

  /** Example: `await service.rename(userId, emojiId, 'festa2')` */
  async rename(userId: string, emojiId: string, name: string): Promise<CustomEmojiListDto> {
    const renamed = await this.deps.emojis.rename(userId, emojiId, name);
    if (!renamed) throw new CustomEmojiNotFoundError(emojiId);
    this.deps.refs.forget(userId);
    return this.list(userId);
  }

  /** The row goes first, then its picture: a message still on screen loses the image, never
   *  points at another one.
   *
   *  Example: `await service.remove(userId, emojiId)` */
  async remove(userId: string, emojiId: string): Promise<CustomEmojiListDto> {
    const removed = await this.deps.emojis.remove(userId, emojiId);
    if (!removed) throw new CustomEmojiNotFoundError(emojiId);
    this.deps.refs.forget(userId);
    await this.removePicture(removed);
    return this.list(userId);
  }

  /** The picture as the owner's plan shows it now (the first frame without animation).
   *
   *  Example: `const stored = await service.open(emojiId)` */
  async open(emojiId: string): Promise<StoredObject> {
    const found = await this.deps.emojis.findWithOwner(emojiId);
    if (!found) throw new CustomEmojiNotFoundError(emojiId);
    const key = servedCustomEmojiKeyOf(found.emoji, effectiveLimitsOf(found.owner));
    const stored = await this.deps.storage.open(key);
    if (!stored) throw new CustomEmojiNotFoundError(emojiId);
    return stored;
  }

  private async insertCounted(
    row: Omit<CustomEmojiPo, 'createdAt'>,
    userId: string,
  ): Promise<void> {
    await this.deps.transaction(async (emojis, users) => {
      const account = await users.lockForPlan(userId);
      if (!account) throw new Error(`account ${userId} passed the auth guard but has no users row`);
      const stored = (await emojis.listOf(userId)).length;
      PlanLimitsBo.requireRoom('customEmojis', stored, 1, effectiveLimitsOf(account));
      await emojis.insert(row);
    });
  }

  private async pictureOf(bytes: Uint8Array, animationAllowed: boolean): Promise<Picture> {
    const still = await this.normalized(bytes, false);
    if (!animationAllowed) return { still: still.bytes, moving: null };
    const moving = await this.normalized(bytes, true);
    return { still: still.bytes, moving: moving.frames > 1 ? moving.bytes : null };
  }

  private async normalized(bytes: Uint8Array, animated: boolean): Promise<NormalizedAvatar> {
    const shape = { width: CUSTOM_EMOJI_SIDE, height: CUSTOM_EMOJI_SIDE, animated };
    const outcome = await this.deps.processor.normalize(bytes, shape);
    if (!outcome.ok) throw new UnsupportedCustomEmojiError(outcome.refusal.detail);
    return outcome.avatar;
  }

  private async putPicture(emojiId: string, picture: Picture): Promise<void> {
    const { storage } = this.deps;
    const first = picture.moving ?? picture.still;
    await storage.put(customEmojiKeyOf(emojiId), first, CUSTOM_EMOJI_CONTENT_TYPE);
    if (picture.moving === null) return;
    await storage.put(stillCustomEmojiKeyOf(emojiId), picture.still, CUSTOM_EMOJI_CONTENT_TYPE);
  }

  private async removePicture(emoji: Pick<CustomEmojiPo, 'id' | 'animated'>): Promise<void> {
    for (const key of customEmojiKeysOf(emoji)) await this.deps.storage.remove(key);
  }

  private async ownerOf(userId: string): Promise<UserPlanPo> {
    const owner = await this.deps.emojis.findOwnerPlan(userId);
    if (!owner) throw new Error(`account ${userId} passed the auth guard but has no users row`);
    return owner;
  }
}
