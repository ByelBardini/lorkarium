import { describe, expect, it } from 'vitest';
import { turnOrder } from '../../../src/modules/combat/turn-order.bo';

describe('turnOrder', () => {
  it('puts the highest initiative first', () => {
    const order = turnOrder([{ name: 'goblin', initiative: 3 }, { name: 'hero', initiative: 17 }]);
    expect(order.map((combatant) => combatant.name)).toEqual(['hero', 'goblin']);
  });

  it('empty list stays empty', () => {
    expect(turnOrder([])).toEqual([]);
  });

  it.each([5, 12, 20])('a single combatant with initiative %s is the whole order', (initiative) => {
    expect(turnOrder([{ name: 'solo', initiative }])).toEqual([{ name: 'solo', initiative }]);
  });
});
