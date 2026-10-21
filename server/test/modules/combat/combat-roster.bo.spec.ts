import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import type { CombatantState, CombatState } from '../../../src/modules/combat/combat.bo';
import { CombatRosterBo } from '../../../src/modules/combat/combat-roster.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';

function entry(id: string, tokenIds: string[], initiative: number, tieOrder: number) {
  const tokens = tokenIds.map((tokenId) => ({ tokenId, controllerIds: [CAIO_ID] }));
  return { id, tokens, initiative, tieOrder } satisfies CombatantState;
}

const KAEL = entry('c-kael', ['t-kael'], 18, 0);
const INIMIGOS = entry('c-inimigos', ['t-goblin', 't-lobo'], 15, 1);
const GIGANTE = entry('c-gigante', ['t-gigante'], 10, 2);
const COVIL = entry('c-covil', [], 5, 3);
const SCENE_TOKENS = ['t-kael', 't-goblin', 't-lobo', 't-gigante', 't-urso'];

function combat(overrides: Partial<CombatState> = {}): CombatState {
  return {
    id: 'combat',
    round: 1,
    currentCombatantId: 'c-kael',
    combatants: [KAEL, INIMIGOS, GIGANTE, COVIL],
    ...overrides,
  };
}

function as(userId: string, state: CombatState | null = combat()): CombatRosterBo {
  const role = userId === ANA_ID ? 'master' : 'player';
  return new CombatRosterBo(new CampaignAccessBo({ campaignId: VHARN_ID, userId, role }), state);
}

const NO_CHANGE = { create: [], link: [], unlink: [], remove: [], turn: null };

describe('CombatRosterBo.start', () => {
  it('the master starts with the entries as sent, each with the initiative typed', () => {
    const entries = [
      { name: 'Inimigos', tokenIds: ['t-goblin', 't-lobo'], initiative: 15 },
      { name: 'Covil', tokenIds: [], initiative: 20 },
      { name: null, tokenIds: ['t-kael'], initiative: null },
    ];

    expect(as(ANA_ID, null).start(entries, SCENE_TOKENS)).toEqual(entries);
  });

  it('an initiative of 2.5 is refused, citing it', () => {
    const start = () =>
      as(ANA_ID, null).start([{ name: null, tokenIds: ['t-kael'], initiative: 2.5 }], SCENE_TOKENS);

    expect(start).toThrow(/Initiative 2\.5 is invalid/);
  });

  it('a token outside the scene is TOKEN_NOT_FOUND, citing it', () => {
    const start = () =>
      as(ANA_ID, null).start(
        [{ name: null, tokenIds: ['t-elsewhere'], initiative: null }],
        SCENE_TOKENS,
      );

    expect(start).toThrow(expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }));
    expect(start).toThrow(/t-elsewhere/);
  });

  it('starting with a combat already running is COMBAT_ALREADY_ACTIVE', () => {
    expect(() =>
      as(ANA_ID).start([{ name: null, tokenIds: ['t-urso'], initiative: null }], SCENE_TOKENS),
    ).toThrow(expect.objectContaining({ code: 'COMBAT_ALREADY_ACTIVE' }));
  });

  it('a player starting is FORBIDDEN', () => {
    expect(() =>
      as(BIA_ID, null).start([{ name: 'Covil', tokenIds: [], initiative: null }], SCENE_TOKENS),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });
});

describe('CombatRosterBo.addCombatants', () => {
  it('Kael, already in the combat, leaves the new entry, and the entry left empty is not created', () => {
    const added = as(ANA_ID).addCombatants(
      [
        { name: null, tokenIds: ['t-kael'], initiative: 9 },
        { name: 'Feras', tokenIds: ['t-kael', 't-urso'], initiative: 12 },
      ],
      SCENE_TOKENS,
    );

    expect(added).toEqual([{ name: 'Feras', tokenIds: ['t-urso'], initiative: 12 }]);
  });

  it('an entry born without tokens is created', () => {
    const covil = { name: 'Covil', tokenIds: [], initiative: 20 };

    expect(as(ANA_ID).addCombatants([covil], SCENE_TOKENS)).toEqual([covil]);
  });

  it('a player adding is FORBIDDEN', () => {
    expect(() =>
      as(CAIO_ID).addCombatants(
        [{ name: null, tokenIds: ['t-urso'], initiative: null }],
        SCENE_TOKENS,
      ),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });
});

describe('CombatRosterBo.regroup into an entry', () => {
  it('the Goblin of Inimigos goes to the entry of the Gigante, and Inimigos stays with the Lobo', () => {
    const change = as(ANA_ID).regroup(
      ['t-goblin'],
      { kind: 'entry', combatantId: 'c-gigante' },
      SCENE_TOKENS,
    );

    expect(change).toEqual({
      ...NO_CHANGE,
      link: [{ combatantId: 'c-gigante', tokenIds: ['t-goblin'] }],
    });
  });

  it('a token out of the combat is linked too', () => {
    const change = as(ANA_ID).regroup(
      ['t-urso'],
      { kind: 'entry', combatantId: 'c-inimigos' },
      SCENE_TOKENS,
    );

    expect(change.link).toEqual([{ combatantId: 'c-inimigos', tokenIds: ['t-urso'] }]);
  });

  it('the Lobo, alone in its entry, moving into Inimigos takes its entry out', () => {
    const split = combat({
      combatants: [
        KAEL,
        entry('c-inimigos', ['t-goblin'], 15, 1),
        entry('c-lobo', ['t-lobo'], 12, 2),
      ],
    });

    const change = as(ANA_ID, split).regroup(
      ['t-lobo'],
      { kind: 'entry', combatantId: 'c-inimigos' },
      SCENE_TOKENS,
    );

    expect(change).toMatchObject({ remove: ['c-lobo'], turn: null });
  });

  it('when the emptied entry was on turn, the turn passes to the next', () => {
    const loboOnTurn = combat({
      currentCombatantId: 'c-lobo',
      combatants: [
        KAEL,
        entry('c-lobo', ['t-lobo'], 16, 1),
        entry('c-inimigos', ['t-goblin'], 15, 2),
      ],
    });

    const change = as(ANA_ID, loboOnTurn).regroup(
      ['t-lobo'],
      { kind: 'entry', combatantId: 'c-inimigos' },
      SCENE_TOKENS,
    );

    expect(change.turn).toEqual({ round: 1, currentId: 'c-inimigos' });
  });

  it('an entry that is not in this combat is COMBATANT_NOT_FOUND, citing it', () => {
    const regroup = () =>
      as(ANA_ID).regroup(['t-goblin'], { kind: 'entry', combatantId: 'c-quelm' }, SCENE_TOKENS);

    expect(regroup).toThrow(expect.objectContaining({ code: 'COMBATANT_NOT_FOUND' }));
    expect(regroup).toThrow(/c-quelm/);
  });
});

describe('CombatRosterBo.regroup each into its own', () => {
  it('the Gigante in a group gets an unnamed entry of its own, and the turn stays', () => {
    const grouped = combat({
      combatants: [KAEL, entry('c-inimigos', ['t-goblin', 't-gigante'], 15, 1)],
    });

    const change = as(ANA_ID, grouped).regroup(['t-gigante'], { kind: 'own' }, SCENE_TOKENS);

    expect(change).toEqual({
      ...NO_CHANGE,
      create: [{ name: null, tokenIds: ['t-gigante'], initiative: null }],
      unlink: ['t-gigante'],
    });
  });

  it('the Gigante already alone changes nothing', () => {
    expect(as(ANA_ID).regroup(['t-gigante'], { kind: 'own' }, SCENE_TOKENS)).toEqual(NO_CHANGE);
  });

  it('splitting both tokens of a group leaves the last one in the old entry', () => {
    const change = as(ANA_ID).regroup(['t-goblin', 't-lobo'], { kind: 'own' }, SCENE_TOKENS);

    expect(change).toMatchObject({
      create: [{ name: null, tokenIds: ['t-goblin'], initiative: null }],
      unlink: ['t-goblin'],
      remove: [],
    });
  });

  it('a token out of the combat enters in an entry of its own', () => {
    expect(as(ANA_ID).regroup(['t-urso'], { kind: 'own' }, SCENE_TOKENS)).toEqual({
      ...NO_CHANGE,
      create: [{ name: null, tokenIds: ['t-urso'], initiative: null }],
    });
  });
});

describe('CombatRosterBo.regroup out', () => {
  it('the last token of the entry on turn going out takes the entry out and passes the turn', () => {
    const change = as(ANA_ID).regroup(['t-kael'], { kind: 'out' }, SCENE_TOKENS);

    expect(change).toEqual({
      ...NO_CHANGE,
      unlink: ['t-kael'],
      remove: ['c-kael'],
      turn: { round: 1, currentId: 'c-inimigos' },
    });
  });

  it('a token out of the combat is ignored, and the Covil is not touched', () => {
    expect(as(ANA_ID).regroup(['t-urso'], { kind: 'out' }, SCENE_TOKENS)).toEqual(NO_CHANGE);
  });
});

describe('CombatRosterBo.regroup refusals', () => {
  it('a token outside the scene is TOKEN_NOT_FOUND', () => {
    expect(() => as(ANA_ID).regroup(['t-quelm'], { kind: 'out' }, SCENE_TOKENS)).toThrow(
      expect.objectContaining({ code: 'TOKEN_NOT_FOUND' }),
    );
  });

  it('a player regrouping is FORBIDDEN, even with control of the tokens', () => {
    expect(() => as(CAIO_ID).regroup(['t-goblin'], { kind: 'own' }, SCENE_TOKENS)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});

describe('CombatRosterBo.rename', () => {
  it('the master renames an entry', () => {
    expect(as(ANA_ID).rename('c-inimigos', 'Goblins')).toBe('Goblins');
  });

  it('a player renaming is FORBIDDEN', () => {
    expect(() => as(CAIO_ID).rename('c-inimigos', 'Goblins')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('an entry that does not exist is COMBATANT_NOT_FOUND', () => {
    expect(() => as(ANA_ID).rename('c-nada', 'Goblins')).toThrow(
      expect.objectContaining({ code: 'COMBATANT_NOT_FOUND' }),
    );
  });
});

describe('CombatRosterBo.removeCombatant', () => {
  it('removing the entry on turn passes the turn to the next', () => {
    expect(as(ANA_ID).removeCombatant('c-kael')).toEqual({ round: 1, currentId: 'c-inimigos' });
  });

  it('a player removing is FORBIDDEN', () => {
    expect(() => as(BIA_ID).removeCombatant('c-covil')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});

describe('CombatRosterBo.leavingTokens', () => {
  it('deleting both goblins of Inimigos, on turn, takes the entry out and passes the turn once', () => {
    const enemiesOnTurn = combat({ currentCombatantId: 'c-inimigos' });

    expect(as(ANA_ID, enemiesOnTurn).leavingTokens(['t-goblin', 't-lobo'])).toEqual({
      ...NO_CHANGE,
      remove: ['c-inimigos'],
      turn: { round: 1, currentId: 'c-gigante' },
    });
  });

  it('deleting one of two tokens takes nothing out', () => {
    expect(as(ANA_ID).leavingTokens(['t-goblin'])).toEqual(NO_CHANGE);
  });

  it('the Covil, without tokens, stays when every token leaves', () => {
    const change = as(ANA_ID).leavingTokens(['t-kael', 't-goblin', 't-lobo', 't-gigante']);

    expect(change).toEqual({
      ...NO_CHANGE,
      remove: ['c-kael', 'c-inimigos', 'c-gigante'],
      turn: { round: 1, currentId: 'c-covil' },
    });
  });

  it('deleting the entry on turn and every one after it opens the next round on the first left', () => {
    const giganteOnTurn = combat({
      currentCombatantId: 'c-gigante',
      combatants: [KAEL, INIMIGOS, GIGANTE],
    });

    expect(as(ANA_ID, giganteOnTurn).leavingTokens(['t-gigante'])?.turn).toEqual({
      round: 2,
      currentId: 'c-kael',
    });
  });

  it('with no combat there is nothing to change', () => {
    expect(as(ANA_ID, null).leavingTokens(['t-kael'])).toBeNull();
  });
});

describe('CombatRosterBo.pastedLinks', () => {
  it('copies pasted with the entry of their original join it, one link per entry', () => {
    const links = as(ANA_ID).pastedLinks([
      { tokenId: 't-goblin-2', combatantId: 'c-inimigos' },
      { tokenId: 't-goblin-3', combatantId: 'c-inimigos' },
      { tokenId: 't-kael-2', combatantId: 'c-kael' },
    ]);

    expect(links).toEqual([
      { combatantId: 'c-inimigos', tokenIds: ['t-goblin-2', 't-goblin-3'] },
      { combatantId: 'c-kael', tokenIds: ['t-kael-2'] },
    ]);
  });

  it('a copy whose entry is not in this combat, or that has none, stays out', () => {
    const links = as(ANA_ID).pastedLinks([
      { tokenId: 't-goblin-2', combatantId: 'c-quelm' },
      { tokenId: 't-bau', combatantId: undefined },
    ]);

    expect(links).toEqual([]);
  });

  it('with no combat every copy stays out', () => {
    expect(
      as(ANA_ID, null).pastedLinks([{ tokenId: 't-goblin-2', combatantId: 'c-inimigos' }]),
    ).toEqual([]);
  });
});
