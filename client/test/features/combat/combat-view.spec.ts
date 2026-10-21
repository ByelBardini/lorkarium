import { describe, expect, it } from 'vitest';
import { entryDefeated, roundsLeftText } from '@/features/combat/combat-view';
import { lyra } from '../../support/table-session-fixtures';

describe('entryDefeated', () => {
  it('an entry whose tokens are all defeated is defeated', () => {
    expect(entryDefeated([lyra({ defeated: true }), lyra({ id: 'b', defeated: true })])).toBe(true);
  });

  it('one living token keeps the entry alive', () => {
    expect(entryDefeated([lyra({ defeated: true }), lyra({ id: 'b' })])).toBe(false);
  });

  it('an entry with no token (the Covil) is never defeated', () => {
    expect(entryDefeated([])).toBe(false);
  });
});

describe('roundsLeftText', () => {
  it.each([
    [2, '2 rodadas'],
    [1, '1 rodada'],
    [null, 'sem limite'],
  ])('%s left reads "%s"', (rounds, text) => {
    expect(roundsLeftText(rounds)).toBe(text);
  });
});
