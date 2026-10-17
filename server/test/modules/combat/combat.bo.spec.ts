import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { CombatBo, type CombatState } from '../../../src/modules/combat/combat.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';

const KAEL = {
  id: 'c-kael',
  tokenId: 't-kael',
  initiative: 18,
  tieOrder: 0,
  controllerIds: [BIA_ID],
};
const LYRA = {
  id: 'c-lyra',
  tokenId: 't-lyra',
  initiative: 14,
  tieOrder: 1,
  controllerIds: [CAIO_ID],
};
const GOBLIN = {
  id: 'c-goblin',
  tokenId: 't-goblin',
  initiative: -2,
  tieOrder: 2,
  controllerIds: [],
};
const SCENE_TOKENS = ['t-kael', 't-lyra', 't-goblin', 't-ogro'];

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
  it('the master starts with the scene tokens, once each', () => {
    expect(as(ANA_ID, null).start(['t-kael', 't-lyra', 't-kael'], SCENE_TOKENS)).toEqual([
      't-kael',
      't-lyra',
    ]);
  });

  it('starting with a combat already running is COMBAT_ALREADY_ACTIVE', () => {
    expect(() => as(ANA_ID).start(['t-kael'], SCENE_TOKENS)).toThrow(
      expect.objectContaining({ code: 'COMBAT_ALREADY_ACTIVE' }),
    );
  });

  it('a token outside the scene is TOKEN_NOT_FOUND', () => {
    expect(() => as(ANA_ID, null).start(['t-elsewhere'], SCENE_TOKENS)).toThrow(
      expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }),
    );
  });

  it.each([
    ['start', (bo: CombatBo) => bo.start(['t-kael'], SCENE_TOKENS)],
    ['end', (bo: CombatBo) => bo.end()],
    ['previousTurn', (bo: CombatBo) => bo.previousTurn('c-kael')],
    ['removeCombatant', (bo: CombatBo) => bo.removeCombatant('c-goblin')],
  ])('a player calling %s is FORBIDDEN', (_, call) => {
    expect(() => call(as(BIA_ID, _ === 'start' ? null : combat()))).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
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

  it('removing the combatant on turn passes the turn to the next', () => {
    expect(as(ANA_ID).removeCombatant('c-kael')).toEqual({ round: 1, currentId: 'c-lyra' });
  });

  it('moveInTie swaps the tie order with an equal neighbour only', () => {
    const tied = combat({ combatants: [KAEL, { ...LYRA, initiative: 18 }, GOBLIN] });
    expect(as(ANA_ID, tied).moveInTie('c-lyra', 'up')).toEqual([
      { combatantId: 'c-kael', tieOrder: 1 },
      { combatantId: 'c-lyra', tieOrder: 0 },
    ]);
    expect(as(ANA_ID).moveInTie('c-lyra', 'up')).toEqual([]);
  });

  it('turnWithoutTokens moves the turn when the token on turn is deleted, and is null otherwise', () => {
    expect(as(ANA_ID).turnWithoutTokens(['t-kael'])).toEqual({ round: 1, currentId: 'c-lyra' });
    expect(as(ANA_ID).turnWithoutTokens(['t-ogro'])).toBeNull();
  });

  it('deleting the one on turn with the next passes the turn past both', () => {
    expect(as(ANA_ID).turnWithoutTokens(['t-lyra', 't-kael'])).toEqual({
      round: 1,
      currentId: 'c-goblin',
    });
  });

  it('deleting the one on turn and everyone after it opens the next round on the first left', () => {
    const lyraOnTurn = combat({ currentCombatantId: 'c-lyra' });

    expect(as(ANA_ID, lyraOnTurn).turnWithoutTokens(['t-goblin', 't-lyra'])).toEqual({
      round: 2,
      currentId: 'c-kael',
    });
  });

  it('deleting every combatant leaves nobody on turn', () => {
    expect(as(ANA_ID).turnWithoutTokens(['t-kael', 't-lyra', 't-goblin'])).toEqual({
      round: 1,
      currentId: null,
    });
  });

  it('deleting someone who is not on turn keeps the turn where it is', () => {
    expect(as(ANA_ID).turnWithoutTokens(['t-goblin'])).toEqual({ round: 1, currentId: 'c-kael' });
  });
});
