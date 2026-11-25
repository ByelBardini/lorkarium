import type { CustomEmojiListDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import type { CustomEmojisApi, CustomEmojisResult } from '@/services/custom-emojis-api';
import { activeCustomEmojisOf, createCustomEmojisStore } from '@/stores/custom-emojis-store';

function emoji(name: string, active = true) {
  return {
    id: `id-${name}`,
    name,
    animated: false,
    active,
    createdAt: '2026-11-24T12:00:00.000Z',
  };
}

const ok = (list: CustomEmojiListDto): CustomEmojisResult => ({ ok: true, value: list });

/** Answers each call with what was queued for it; keeps the calls. */
class CustomEmojisApiFake implements CustomEmojisApi {
  readonly calls: string[] = [];
  next: CustomEmojisResult = ok({ emojis: [], limit: 10 });

  async list(): Promise<CustomEmojisResult> {
    this.calls.push('list');
    return this.next;
  }

  async create(name: string): Promise<CustomEmojisResult> {
    this.calls.push(`create ${name}`);
    return this.next;
  }

  async rename(emojiId: string, name: string): Promise<CustomEmojisResult> {
    this.calls.push(`rename ${emojiId} ${name}`);
    return this.next;
  }

  async remove(emojiId: string): Promise<CustomEmojisResult> {
    this.calls.push(`remove ${emojiId}`);
    return this.next;
  }
}

describe('createCustomEmojisStore', () => {
  it('load keeps the list the server answered', async () => {
    const api = new CustomEmojisApiFake();
    api.next = ok({ emojis: [emoji('festa')], limit: 10 });
    const store = createCustomEmojisStore(api);

    await store.getState().load();

    expect(store.getState().list?.emojis.map((each) => each.name)).toEqual(['festa']);
  });

  it('a command answers true and replaces the list; a refusal keeps it and says why', async () => {
    const api = new CustomEmojisApiFake();
    const store = createCustomEmojisStore(api);
    api.next = ok({ emojis: [emoji('festa')], limit: 10 });

    expect(await store.getState().create('festa', new Blob(['x']))).toBe(true);
    api.next = { ok: false, failure: { kind: 'name_taken' } };
    expect(await store.getState().create('festa', new Blob(['x']))).toBe(false);

    expect(store.getState().list?.emojis).toHaveLength(1);
    expect(store.getState().problem).toEqual({ kind: 'name_taken' });
  });

  it('a success after a refusal clears the problem', async () => {
    const api = new CustomEmojisApiFake();
    const store = createCustomEmojisStore(api);
    api.next = { ok: false, failure: { kind: 'too_large' } };
    await store.getState().create('festa', new Blob(['x']));

    api.next = ok({ emojis: [], limit: 10 });
    await store.getState().remove('id-festa');

    expect(store.getState().problem).toBeNull();
  });
});

describe('activeCustomEmojisOf', () => {
  it('keeps only the active ones, none before the first answer', () => {
    const list = { emojis: [emoji('festa'), emoji('velho', false)], limit: 1 };
    expect(activeCustomEmojisOf(list).map((each) => each.name)).toEqual(['festa']);
    expect(activeCustomEmojisOf(null)).toEqual([]);
  });
});
