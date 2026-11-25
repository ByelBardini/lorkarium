import { describe, expect, it } from 'vitest';
import {
  customEmojiFailureText,
  customEmojiNameProblem,
  customEmojiQuotaText,
  typedCustomEmojiName,
} from '@/lib/custom-emoji-text';

describe('customEmojiNameProblem', () => {
  it('accepts lower-case letters, digits and _, from 2 to 32', () => {
    expect(customEmojiNameProblem('festa_2')).toBeNull();
  });

  it('refuses one letter, 33, a space or an accent with the rule', () => {
    for (const name of ['a', 'x'.repeat(33), 'com espaco', 'ação']) {
      expect(customEmojiNameProblem(name)).toMatch(/2 a 32/u);
    }
  });

  it('refuses a name of the catalog', () => {
    expect(customEmojiNameProblem('doge')).toBe('Esse nome já é de um emoji do catálogo.');
  });
});

describe('typedCustomEmojiName', () => {
  it('lowers, drops the colons and turns spaces and dashes into _', () => {
    expect(typedCustomEmojiName(':Bora Já-Foi:')).toBe('bora_já_foi');
  });
});

describe('customEmojiQuotaText', () => {
  it('reads the count against the ceiling, or the count alone without one', () => {
    expect(customEmojiQuotaText(7, 10)).toBe('7 de 10');
    expect(customEmojiQuotaText(7, null)).toBe('7');
  });
});

describe('customEmojiFailureText', () => {
  it('names the plan when there is no room', () => {
    const room = { resource: 'customEmojis', plan: 'apoiador', reason: 'room' } as const;
    expect(customEmojiFailureText({ kind: 'plan_limit', planLimit: { ...room, limit: 10 } })).toBe(
      'Seu plano permite até 10 emojis personalizados. Apague um ou mude de plano.',
    );
    expect(
      customEmojiFailureText({
        kind: 'plan_limit',
        planLimit: { ...room, limit: 0, plan: 'free' },
      }),
    ).toBe('Emojis personalizados estão disponíveis a partir do plano Apoiador.');
  });

  it('says the name is taken, and the wait of a rate limit', () => {
    expect(customEmojiFailureText({ kind: 'name_taken' })).toBe(
      'Você já tem um emoji com esse nome.',
    );
    expect(customEmojiFailureText({ kind: 'rate_limited', retryAfterSeconds: 30 })).toMatch(
      /30 s/u,
    );
  });
});
