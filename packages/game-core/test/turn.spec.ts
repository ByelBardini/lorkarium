import { describe, expect, it } from 'vitest';
import { advanceTurn, nextAfterRemoval, retreatTurn, tickAtTurnEnd } from '../src/turn';

const ORDER = ['kael', 'lyra', 'goblin'];

describe('advanceTurn', () => {
  it('goes to the next combatant and says whose turn ended', () => {
    expect(advanceTurn(ORDER, { round: 1, currentId: 'kael' })).toEqual({
      round: 1,
      currentId: 'lyra',
      endedTurnOf: 'kael',
    });
  });

  it('after the last one it goes back to the first, one round later', () => {
    expect(advanceTurn(ORDER, { round: 1, currentId: 'goblin' })).toEqual({
      round: 2,
      currentId: 'kael',
      endedTurnOf: 'goblin',
    });
  });

  it('with nobody on turn yet the first one starts, and no turn ended', () => {
    expect(advanceTurn(ORDER, { round: 1, currentId: null })).toEqual({
      round: 1,
      currentId: 'kael',
      endedTurnOf: null,
    });
  });

  it('the turn follows the combatant: a new order mid-round continues after whoever is on turn', () => {
    const reordered = ['goblin', 'kael', 'lyra'];
    expect(advanceTurn(reordered, { round: 1, currentId: 'kael' }).currentId).toBe('lyra');
  });

  it('with nobody in combat there is no turn', () => {
    expect(advanceTurn([], { round: 1, currentId: null })).toEqual({
      round: 1,
      currentId: null,
      endedTurnOf: null,
    });
  });
});

describe('retreatTurn', () => {
  it('goes back to the previous combatant', () => {
    expect(retreatTurn(ORDER, { round: 2, currentId: 'lyra' })).toEqual({
      round: 2,
      currentId: 'kael',
    });
  });

  it('from the first of a round it goes to the last of the round before', () => {
    expect(retreatTurn(ORDER, { round: 2, currentId: 'kael' })).toEqual({
      round: 1,
      currentId: 'goblin',
    });
  });

  it('the first of round 1 stays where it is', () => {
    expect(retreatTurn(ORDER, { round: 1, currentId: 'kael' })).toEqual({
      round: 1,
      currentId: 'kael',
    });
  });
});

describe('nextAfterRemoval', () => {
  it('removing whoever is on turn passes the turn to the next one', () => {
    expect(nextAfterRemoval(ORDER, 'lyra', { round: 2, currentId: 'lyra' })).toEqual({
      round: 2,
      currentId: 'goblin',
    });
  });

  it('removing the last one while on turn starts the next round', () => {
    expect(nextAfterRemoval(ORDER, 'goblin', { round: 2, currentId: 'goblin' })).toEqual({
      round: 3,
      currentId: 'kael',
    });
  });

  it('removing someone else keeps the turn', () => {
    expect(nextAfterRemoval(ORDER, 'kael', { round: 2, currentId: 'lyra' })).toEqual({
      round: 2,
      currentId: 'lyra',
    });
  });

  it('removing the only combatant leaves nobody on turn', () => {
    expect(nextAfterRemoval(['kael'], 'kael', { round: 1, currentId: 'kael' })).toEqual({
      round: 1,
      currentId: null,
    });
  });
});

describe('tickAtTurnEnd', () => {
  it('counts each condition down and lets the ones at their last round expire', () => {
    const conditions = [
      { id: 'envenenado', remainingRounds: 2 },
      { id: 'atordoado', remainingRounds: 1 },
      { id: 'abencoado', remainingRounds: null },
    ];
    expect(tickAtTurnEnd(conditions)).toEqual({
      kept: [
        { id: 'envenenado', remainingRounds: 1 },
        { id: 'abencoado', remainingRounds: null },
      ],
      expired: [{ id: 'atordoado', remainingRounds: 1 }],
    });
  });

  it('nothing to tick gives nothing', () => {
    expect(tickAtTurnEnd([])).toEqual({ kept: [], expired: [] });
  });
});
