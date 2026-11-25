import { describe, expect, it } from 'vitest';
import {
  CUSTOM_EMOJI_CACHE_MS,
  CustomEmojiRefsService,
} from '../../../src/modules/custom-emojis/custom-emoji-refs.service';
import { ClockFake } from '../../support/auth-fakes';
import { CustomEmojisDaoFake, planAccount } from '../../support/custom-emojis-fakes';

const BIA = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const NOW = new Date('2026-11-24T12:00:00Z');

function harness() {
  const emojis = new CustomEmojisDaoFake().owner(BIA, planAccount('apoiador'));
  const clock = new ClockFake(NOW);
  return { refs: new CustomEmojiRefsService({ emojis, clock }), emojis, clock };
}

describe('CustomEmojiRefsService', () => {
  it('gives the active emojis the text names', async () => {
    const { refs, emojis } = harness();
    emojis.seed(BIA, 'e1', 'festa');

    expect(await refs.refsIn(BIA, 'oi :festa: :bolo:')).toEqual([{ name: 'festa', emojiId: 'e1' }]);
  });

  it('leaves out the emojis past the plan’s ceiling', async () => {
    const { refs, emojis } = harness();
    for (let at = 0; at < 11; at += 1) emojis.seed(BIA, `e${at}`, `nome${at}`);

    expect(await refs.refsIn(BIA, ':nome9: :nome10:')).toEqual([{ name: 'nome9', emojiId: 'e9' }]);
  });

  it('a text without codes never reads the table', async () => {
    const { refs, emojis } = harness();

    expect(await refs.refsIn(BIA, 'sem código aqui')).toEqual([]);
    expect(emojis.listed).toBe(0);
  });

  it('reads the table once a minute, and again right after the account is forgotten', async () => {
    const { refs, emojis, clock } = harness();
    emojis.seed(BIA, 'e1', 'festa');

    await refs.refsIn(BIA, ':festa:');
    await refs.refsIn(BIA, ':festa:');
    expect(emojis.listed).toBe(1);

    emojis.seed(BIA, 'e2', 'bolo');
    refs.forget(BIA);
    expect(await refs.refsIn(BIA, ':bolo:')).toEqual([{ name: 'bolo', emojiId: 'e2' }]);
    expect(emojis.listed).toBe(2);

    clock.current = new Date(NOW.getTime() + CUSTOM_EMOJI_CACHE_MS - 1);
    await refs.refsIn(BIA, ':festa:');
    expect(emojis.listed).toBe(2);
  });

  it('a minute later it reads again: a plan change shows', async () => {
    const { refs, emojis, clock } = harness();
    emojis.owner(BIA, planAccount('free')).seed(BIA, 'e1', 'festa');

    expect(await refs.refsIn(BIA, ':festa:')).toEqual([]);
    emojis.owner(BIA, planAccount('apoiador'));
    clock.current = new Date(NOW.getTime() + CUSTOM_EMOJI_CACHE_MS);

    expect(await refs.refsIn(BIA, ':festa:')).toEqual([{ name: 'festa', emojiId: 'e1' }]);
  });
});
