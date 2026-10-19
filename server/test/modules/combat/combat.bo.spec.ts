import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { CombatBo, type CombatState } from '../../../src/modules/combat/combat.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';

const KAEL = {
  id: 'c-kael',
  tokens: [{ tokenId: 't-kael', controllerIds: [BIA_ID] }],
  initiative: 18,
  tieOrder: 0,
};
const LYRA = {
  id: 'c-lyra',
  tokens: [{ tokenId: 't-lyra', controllerIds: [CAIO_ID] }],
  initiative: 14,
  tieOrder: 1,
};
const GOBLIN = {
  id: 'c-goblin',
  tokens: [{ tokenId: 't-goblin', controllerIds: [] }],
  initiative: -2,
  tieOrder: 2,
};
const INIMIGOS = {
  id: 'c-inimigos',
  tokens: [
    { tokenId: 't-goblin', controllerIds: [CAIO_ID] },
    { tokenId: 't-lobo', controllerIds: [CAIO_ID] },
  ],
  initiative: 15,
  tieOrder: 3,
};
const FERAS = {
  id: 'c-feras',
  tokens: [
    { tokenId: 't-goblin', controllerIds: [CAIO_ID] },
    { tokenId: 't-lobo', controllerIds: [] },
  ],
  initiative: 15,
  tieOrder: 3,
};
const COVIL = { id: 'c-covil', tokens: [], initiative: 20, tieOrder: 4 };

function combat(overrides: Partial<CombatState> = {}): CombatState {
  return {
    id: 'combat',
    round: 1,
    currentCombatantId: 'c-kael',
    combatants: [KAEL, LYRA, GOBLIN],
    ...overrides,
  };
}

function as(userId: string, state: CombatState | null = combat()): CombatBo {
  const role = userId === ANA_ID ? 'master' : 'player';
  return new CombatBo(new CampaignAccessBo({ campaignId: VHARN_ID, userId, role }), state);
}

describe('CombatBo', () => {
  it.each([
    ['end', (bo: CombatBo) => bo.end()],
    ['previousTurn', (bo: CombatBo) => bo.previousTurn('c-kael')],
  ])('a player calling %s is FORBIDDEN', (_, call) => {
    expect(() => call(as(BIA_ID))).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('any command with no combat is COMBAT_NOT_ACTIVE', () => {
    expect(() => as(ANA_ID, null).nextTurn('c-kael')).toThrow(
      expect.objectContaining({ code: 'COMBAT_NOT_ACTIVE' }),
    );
  });

  it('Bia sets the initiative of her Kael; Caio cannot set it', () => {
    expect(as(BIA_ID).setInitiative('c-kael', 20)).toBe(20);
    expect(() => as(CAIO_ID).setInitiative('c-kael', 20)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('Bia passes the turn when it is Kael’s', () => {
    expect(as(BIA_ID).nextTurn('c-kael')).toEqual({
      round: 1,
      currentId: 'c-lyra',
      endedTurnOf: 'c-kael',
    });
  });

  it('Bia passing the turn when it is not hers is FORBIDDEN', () => {
    expect(() => as(BIA_ID, combat({ currentCombatantId: 'c-lyra' })).nextTurn('c-lyra')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('the master advances any turn, and after the last comes round 2', () => {
    expect(
      as(ANA_ID, combat({ currentCombatantId: 'c-goblin' })).nextTurn('c-goblin'),
    ).toMatchObject({
      round: 2,
      currentId: 'c-kael',
    });
  });

  it('a turn asked from someone who is no longer on turn is TURN_ALREADY_CHANGED', () => {
    expect(() => as(ANA_ID).nextTurn('c-lyra')).toThrow(
      expect.objectContaining({ code: 'TURN_ALREADY_CHANGED' }),
    );
  });

  it('moveInTie swaps the tie order with an equal neighbour only', () => {
    const tied = combat({ combatants: [KAEL, { ...LYRA, initiative: 18 }, GOBLIN] });
    expect(as(ANA_ID, tied).moveInTie('c-lyra', 'up')).toEqual([
      { combatantId: 'c-kael', tieOrder: 1 },
      { combatantId: 'c-lyra', tieOrder: 0 },
    ]);
    expect(as(ANA_ID).moveInTie('c-lyra', 'up')).toEqual([]);
  });

  it('Caio, who controls the Goblin and the Lobo, sets the initiative of Inimigos and passes its turn', () => {
    const state = combat({ currentCombatantId: 'c-inimigos', combatants: [INIMIGOS, KAEL] });

    expect(as(CAIO_ID, state).setInitiative('c-inimigos', 12)).toBe(12);
    expect(as(CAIO_ID, state).nextTurn('c-inimigos')).toMatchObject({ currentId: 'c-kael' });
  });

  it('the master runs an entry whose tokens nobody controls', () => {
    const state = combat({ currentCombatantId: 'c-feras', combatants: [FERAS, KAEL] });

    expect(as(ANA_ID, state).nextTurn('c-feras')).toMatchObject({ currentId: 'c-kael' });
  });

  it('Caio, who controls only the Goblin, setting the initiative of the group is FORBIDDEN, citing the Lobo', () => {
    const state = combat({ combatants: [KAEL, FERAS] });
    const set = () => as(CAIO_ID, state).setInitiative('c-feras', 12);

    expect(set).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(set).toThrow(/set the initiative of token t-lobo/);
    expect(set).toThrow(new RegExp(CAIO_ID));
  });

  it('a player passing the turn of an entry without tokens is FORBIDDEN', () => {
    const state = combat({ currentCombatantId: 'c-covil', combatants: [COVIL, KAEL] });

    expect(() => as(CAIO_ID, state).nextTurn('c-covil')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});
