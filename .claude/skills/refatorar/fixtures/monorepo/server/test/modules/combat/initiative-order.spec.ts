import { describe, expect, it } from 'vitest';
import { rankCombatants } from '../../../src/modules/combat/initiative-order';

describe('rankCombatants', () => {
  it('counts every combatant in the list', () => {
    expect(rankCombatants([3, 1])).toBe(2);
  });
});
