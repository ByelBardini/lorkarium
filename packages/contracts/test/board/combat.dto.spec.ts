import { describe, expect, it } from 'vitest';
import {
  combatTurnChangedDto,
  moveInTieCommandDto,
  nextTurnCommandDto,
  setInitiativeCommandDto,
  startCombatCommandDto,
} from '../../src/board/combat.dto';

const BASE = {
  actionId: '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a',
  campaignId: '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a',
};
const IDS = [
  '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
  '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b',
  '7f6e5d4c-3b2a-4f1e-8d9c-0b1a2c3d4e5f',
];
const [KAEL, , OGRO] = IDS;

describe('combat commands', () => {
  it('combat:start with three tokens is accepted', () => {
    expect(startCombatCommandDto.parse({ ...BASE, tokenIds: IDS }).tokenIds).toHaveLength(3);
  });

  it('combat:start with no token is refused', () => {
    expect(startCombatCommandDto.safeParse({ ...BASE, tokenIds: [] }).success).toBe(false);
  });

  it.each([-2, null])('setInitiative with %s is accepted', (initiative) => {
    const parsed = setInitiativeCommandDto.parse({ ...BASE, combatantId: KAEL, initiative });
    expect(parsed.initiative).toBe(initiative);
  });

  it('an initiative of 1000 is refused', () => {
    expect(
      setInitiativeCommandDto.safeParse({ ...BASE, combatantId: KAEL, initiative: 1000 }).success,
    ).toBe(false);
  });

  it('moveInTie only goes up or down', () => {
    const move = { ...BASE, combatantId: KAEL };
    expect(moveInTieCommandDto.safeParse({ ...move, direction: 'up' }).success).toBe(true);
    expect(moveInTieCommandDto.safeParse({ ...move, direction: 'left' }).success).toBe(false);
  });

  it('nextTurn without fromCombatantId is refused', () => {
    expect(nextTurnCommandDto.safeParse(BASE).success).toBe(false);
  });
});

describe('combatTurnChangedDto', () => {
  it('carries the combat and the conditions changed at the end of the turn', () => {
    const event = {
      campaignId: BASE.campaignId,
      version: 9,
      at: '2026-10-15T12:00:00.000Z',
      combat: {
        id: IDS[1],
        round: 2,
        currentCombatantId: KAEL,
        combatants: [{ id: KAEL, tokenId: OGRO, initiative: 18, tieOrder: 0 }],
      },
      conditionChanges: [{ tokenId: OGRO, conditions: [] }],
    };
    expect(combatTurnChangedDto.parse(event)).toEqual(event);
  });
});
