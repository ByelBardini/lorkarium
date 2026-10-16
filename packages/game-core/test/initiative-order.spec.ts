import { describe, expect, it } from 'vitest';
import { moveWithinTie, orderCombatants } from '../src/initiative-order';

const at = (id: string, value: number | null, tieOrder: number) => ({
  id,
  initiative: value,
  tieOrder,
});

describe('orderCombatants', () => {
  it('orders from the highest to the lowest, with no initiative at the end', () => {
    const order = orderCombatants([
      at('goblin', -2, 0),
      at('kael', 18, 1),
      at('ogro', null, 2),
      at('lyra', 14, 3),
      at('bia', 16, 4),
    ]);
    expect(order.map(({ id }) => id)).toEqual(['kael', 'bia', 'lyra', 'goblin', 'ogro']);
  });

  it('a tie keeps the order of entry (tieOrder)', () => {
    const order = orderCombatants([at('lyra', 18, 2), at('kael', 18, 1)]);
    expect(order.map(({ id }) => id)).toEqual(['kael', 'lyra']);
  });
});

describe('moveWithinTie', () => {
  const tied = [at('kael', 18, 0), at('lyra', 18, 1), at('goblin', 12, 2)];

  it('up swaps with the neighbour above that has the same initiative', () => {
    const order = orderCombatants(moveWithinTie(tied, 'lyra', 'up'));
    expect(order.map(({ id }) => id)).toEqual(['lyra', 'kael', 'goblin']);
  });

  it('against a neighbour of another initiative nothing changes', () => {
    expect(moveWithinTie(tied, 'lyra', 'down')).toEqual(tied);
    expect(moveWithinTie(tied, 'kael', 'up')).toEqual(tied);
  });

  it('an unknown combatant changes nothing', () => {
    expect(moveWithinTie(tied, 'nobody', 'up')).toEqual(tied);
  });
});
