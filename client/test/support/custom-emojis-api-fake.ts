import type { CustomEmojiDto } from '@lorkarium/contracts';
import type {
  CustomEmojisApi,
  CustomEmojisFailure,
  CustomEmojisResult,
} from '@/services/custom-emojis-api';

const CREATED_AT = '2026-11-24T12:00:00.000Z';

/** A `CustomEmojisApi` that keeps the list like the server would (oldest first, one name per
 *  account, the newest past `limit` inactive); `refuseNext` makes the next command fail. */
export class CustomEmojisApiFake implements CustomEmojisApi {
  readonly calls: string[] = [];
  /** The pictures sent, in order. */
  readonly pictures: Blob[] = [];
  limit: number | null = 10;
  refuseNext: CustomEmojisFailure | null = null;
  private emojis: CustomEmojiDto[] = [];
  private serial = 0;

  /** Starts the account with these emojis (active by the ceiling). */
  with(...names: string[]): this {
    for (const name of names) this.add(name, false);
    return this;
  }

  async list(): Promise<CustomEmojisResult> {
    this.calls.push('list');
    return this.answer();
  }

  async create(name: string, picture: Blob): Promise<CustomEmojisResult> {
    this.calls.push(`create ${name}`);
    this.pictures.push(picture);
    const refused = this.refusal(name);
    if (refused) return { ok: false, failure: refused };
    this.add(name, false);
    return this.answer();
  }

  async rename(emojiId: string, name: string): Promise<CustomEmojisResult> {
    this.calls.push(`rename ${emojiId} ${name}`);
    const refused = this.refusal(name, emojiId);
    if (refused) return { ok: false, failure: refused };
    this.emojis = this.emojis.map((emoji) => (emoji.id === emojiId ? { ...emoji, name } : emoji));
    return this.answer();
  }

  async remove(emojiId: string): Promise<CustomEmojisResult> {
    this.calls.push(`remove ${emojiId}`);
    this.emojis = this.emojis.filter((emoji) => emoji.id !== emojiId);
    return this.answer();
  }

  private add(name: string, animated: boolean): void {
    this.serial += 1;
    const id = `0b6f8a7e-7d43-4a5e-9a1c-${String(this.serial).padStart(12, '0')}`;
    this.emojis.push({ id, name, animated, active: true, createdAt: CREATED_AT });
  }

  private refusal(name: string, exceptId?: string): CustomEmojisFailure | null {
    const queued = this.refuseNext;
    this.refuseNext = null;
    if (queued) return queued;
    const taken = this.emojis.some((emoji) => emoji.name === name && emoji.id !== exceptId);
    return taken ? { kind: 'name_taken' } : null;
  }

  private answer(): CustomEmojisResult {
    const limit = this.limit;
    const emojis = this.emojis.map((emoji, at) => ({
      ...emoji,
      active: limit === null || at < limit,
    }));
    return { ok: true, value: { emojis, limit } };
  }
}
