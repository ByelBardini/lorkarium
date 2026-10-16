import { describe, expect, it } from 'vitest';
import type { CombatRow } from '../../../src/modules/combat/combat.dao';
import { toCombatDto, toCombatState } from '../../../src/modules/combat/combat.mapper';

const STARTED = new Date('2026-10-15T12:00:00Z');

const ROW: CombatRow = {
  combat: {
    id: 'combat',
    sceneId: 'scene',
    round: 2,
    currentCombatantId: 'c-lyra',
    startedAt: STARTED,
  },
  combatants: [
    { id: 'c-goblin', combatId: 'combat', tokenId: 't-goblin', initiative: -2, tieOrder: 0 },
    { id: 'c-ogro', combatId: 'combat', tokenId: 't-ogro', initiative: null, tieOrder: 1 },
    { id: 'c-kael', combatId: 'combat', tokenId: 't-kael', initiative: 18, tieOrder: 2 },
    { id: 'c-lyra', combatId: 'combat', tokenId: 't-lyra', initiative: 14, tieOrder: 3 },
  ],
};

describe('combat mapper', () => {
  it('the combat DTO lists the combatants in turn order', () => {
    const dto = toCombatDto(ROW);
    expect(dto.combatants.map(({ id }) => id)).toEqual(['c-kael', 'c-lyra', 'c-goblin', 'c-ogro']);
    expect(dto).toMatchObject({ id: 'combat', round: 2, currentCombatantId: 'c-lyra' });
    expect(dto.combatants[0]).toEqual({
      id: 'c-kael',
      tokenId: 't-kael',
      initiative: 18,
      tieOrder: 2,
    });
  });

  it('the state carries who controls each token', () => {
    const state = toCombatState(ROW, (tokenId) => (tokenId === 't-kael' ? ['bia'] : []));
    expect(state.combatants.find(({ id }) => id === 'c-kael')?.controllerIds).toEqual(['bia']);
    expect(state.currentCombatantId).toBe('c-lyra');
  });
});
