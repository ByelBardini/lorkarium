import {
  CUSTOM_EMOJI_NAME_PATTERN,
  CUSTOM_EMOJIS_PER_MESSAGE_MAX,
  type CustomEmojiRefDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import { effectiveLimitsOf } from '../plans/plan-limits.bo';
import {
  activeEmojiIdsOf,
  customEmojiNamesIn,
  customEmojiRefsIn,
  type ActiveEmoji,
  type EmojiNameRules,
} from './custom-emoji.bo';
import type { CustomEmojisDao } from './custom-emojis.dao';

/** How long the active emojis of an account are kept: a plan change shows within a minute. */
export const CUSTOM_EMOJI_CACHE_MS = 60_000;

/** The rules of a name in a message, from the contract.
 *
 *  Example: `customEmojiNamesIn(text, EMOJI_NAME_RULES)` */
export const EMOJI_NAME_RULES: EmojiNameRules = {
  pattern: CUSTOM_EMOJI_NAME_PATTERN,
  perMessage: CUSTOM_EMOJIS_PER_MESSAGE_MAX,
};

// Past this many accounts, a load sweeps the stale entries out.
const SWEEP_ABOVE = 1_000;

type CachedEmojis = Readonly<{ loadedAt: number; active: readonly ActiveEmoji[] }>;

export type CustomEmojiRefsDeps = Readonly<{
  emojis: Pick<CustomEmojisDao, 'listOf' | 'findOwnerPlan'>;
  clock: ClockPort;
}>;

/** What a message needs: the sender's active emojis its text names. The chat path keeps at most
 *  one query (`docs/context/chat.md`), so the active emojis of an account are kept in memory for
 *  a minute and forgotten at once when the account changes them.
 *
 *  Example: `await refs.refsIn(userId, 'oi :festa:') // [{ name: 'festa', emojiId }]` */
export class CustomEmojiRefsService {
  private readonly cache = new Map<string, CachedEmojis>();

  constructor(private readonly deps: CustomEmojiRefsDeps) {}

  /** A text without any `:name:` never reads the database.
   *
   *  Example: `await refs.refsIn(userId, 'sem código') // []` */
  async refsIn(userId: string, text: string): Promise<CustomEmojiRefDto[]> {
    if (customEmojiNamesIn(text, EMOJI_NAME_RULES).length === 0) return [];
    return customEmojiRefsIn(text, await this.activeOf(userId), EMOJI_NAME_RULES);
  }

  /** Drops what is kept of the account, after it creates, renames or removes an emoji.
   *
   *  Example: `refs.forget(userId)` */
  forget(userId: string): void {
    this.cache.delete(userId);
  }

  private async activeOf(userId: string): Promise<readonly ActiveEmoji[]> {
    const now = this.deps.clock.now().getTime();
    const kept = this.cache.get(userId);
    if (kept !== undefined && now - kept.loadedAt < CUSTOM_EMOJI_CACHE_MS) return kept.active;
    const active = await this.loadActive(userId);
    this.sweep(now);
    this.cache.set(userId, { loadedAt: now, active });
    return active;
  }

  private async loadActive(userId: string): Promise<readonly ActiveEmoji[]> {
    const owner = await this.deps.emojis.findOwnerPlan(userId);
    if (owner === undefined) return [];
    const rows = await this.deps.emojis.listOf(userId);
    const ids = activeEmojiIdsOf(rows, effectiveLimitsOf(owner).maxCustomEmojis);
    return rows.filter((row) => ids.has(row.id)).map(({ id, name }) => ({ id, name }));
  }

  private sweep(now: number): void {
    if (this.cache.size < SWEEP_ABOVE) return;
    for (const [userId, kept] of this.cache) {
      if (now - kept.loadedAt >= CUSTOM_EMOJI_CACHE_MS) this.cache.delete(userId);
    }
  }
}
