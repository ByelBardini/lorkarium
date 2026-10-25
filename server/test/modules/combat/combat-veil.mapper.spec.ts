import type { CombatDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  combatSeenBy,
  deletedSeenBy,
  deletedTokenSeenBy,
  turnChangedSeenBy,
} from '../../../src/modules/combat/combat-veil.mapper';
import { VHARN_ID } from '../../support/campaigns-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import { BRAM_ID, LOBO_ID, LYRA_ID } from '../../support/tokens-factories';

const GOBLIN_ID = '1d2c3b4a-5f6e-4d7c-8b9a-0f1e2d3c4b5a';
const ENTRY = {
  lobo: 'c0000000-0000-4000-8000-000000000001',
  enemies: 'c0000000-0000-4000-8000-000000000002',
  lair: 'c0000000-0000-4000-8000-000000000003',
  lyra: 'c0000000-0000-4000-8000-000000000004',
};
const BASE = {
  campaignId: VHARN_ID,
  sceneId: VHARN_SCENE_ID,
  version: 8,
  at: '2026-10-24T21:00:00.000Z',
};
const HIDDEN = new Set([LOBO_ID]);

function combatOn(currentCombatantId: string): CombatDto {
  const entry = (id: string, name: string | null, tokenIds: string[], tieOrder: number) => ({
    id,
    name,
    tokenIds,
    initiative: 10,
    tieOrder,
  });
  return {
    id: 'c0000000-0000-4000-8000-0000000000ff',
    round: 2,
    currentCombatantId,
    combatants: [
      entry(ENTRY.lobo, null, [LOBO_ID], 0),
      entry(ENTRY.enemies, 'Inimigos', [LOBO_ID, GOBLIN_ID], 1),
      entry(ENTRY.lair, 'Covil', [], 2),
      entry(ENTRY.lyra, null, [LYRA_ID], 3),
    ],
  };
}

describe('the combat as each audience sees it', () => {
  it('the entry of only the Lobo leaves, Inimigos keeps only the Goblin, the Covil (no token) stays', () => {
    const seen = combatSeenBy(combatOn(ENTRY.lyra), HIDDEN);

    expect(seen.combatants.map(({ id, tokenIds }) => [id, tokenIds])).toEqual([
      [ENTRY.enemies, [GOBLIN_ID]],
      [ENTRY.lair, []],
      [ENTRY.lyra, [LYRA_ID]],
    ]);
    expect(seen).toMatchObject({ round: 2, currentCombatantId: ENTRY.lyra });
  });

  it('the turn on the entry of the Lobo is nobody on the turn for who does not see it', () => {
    expect(combatSeenBy(combatOn(ENTRY.lobo), HIDDEN).currentCombatantId).toBeNull();
  });

  it('the turn on the mixed entry stays there (the Goblin is still in it)', () => {
    expect(combatSeenBy(combatOn(ENTRY.enemies), HIDDEN).currentCombatantId).toBe(ENTRY.enemies);
  });

  it('nothing invisible gives the same combat, and no combat stays null', () => {
    const combat = combatOn(ENTRY.lobo);

    expect(combatSeenBy(combat, new Set())).toBe(combat);
    expect(combatSeenBy(null, HIDDEN)).toBeNull();
  });

  it('combat:turnChanged loses the condition changes of the Lobo and keeps the others', () => {
    const changes = [
      { tokenId: LOBO_ID, conditions: [] },
      { tokenId: LYRA_ID, conditions: [] },
    ];
    const event = { ...BASE, combat: combatOn(ENTRY.lobo), conditionChanges: changes };

    const seen = turnChangedSeenBy(event, HIDDEN);

    expect(seen.conditionChanges).toEqual([{ tokenId: LYRA_ID, conditions: [] }]);
    expect(seen.combat.currentCombatantId).toBeNull();
  });

  it('token:deletedMany of the Lobo and the Bram keeps the Bram and cuts the combat', () => {
    const event = { ...BASE, tokenIds: [LOBO_ID, BRAM_ID], combat: combatOn(ENTRY.lobo) };

    const seen = deletedSeenBy(event, HIDDEN);

    expect(seen?.tokenIds).toEqual([BRAM_ID]);
    expect(seen?.combat?.currentCombatantId).toBeNull();
  });

  it('token:deletedMany of only the Lobo still tells the combat, and without a combat is null', () => {
    const event = { ...BASE, tokenIds: [LOBO_ID], combat: combatOn(ENTRY.lyra) };

    expect(deletedSeenBy(event, HIDDEN)).toMatchObject({
      tokenIds: [],
      combat: { currentCombatantId: ENTRY.lyra },
    });
    expect(deletedSeenBy({ ...event, combat: null }, HIDDEN)).toBeNull();
  });

  it('token:deleted of a visible token carries the combat cut; of the Lobo, nothing', () => {
    const event = { ...BASE, tokenId: BRAM_ID, combat: combatOn(ENTRY.lobo) };

    expect(deletedTokenSeenBy(event, HIDDEN)?.combat?.currentCombatantId).toBeNull();
    expect(deletedTokenSeenBy({ ...event, tokenId: LOBO_ID }, HIDDEN)).toBeNull();
  });
});
