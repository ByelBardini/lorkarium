import type { CombatantDto, TokenBarDto, TokenDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  nextTurnLabelOf,
  standingTextOf,
  summedBarOf,
  trackerRowsOf,
  upNextTextOf,
} from '@/lib/combat-rows';
import {
  KAEL_COMBATANT,
  LYRA_COMBATANT,
  LYRA_ID,
  kael,
  lyra,
  soloCombatant,
  vharnBoard,
  vharnCombat,
} from '../support/table-session-fixtures';

const KAEL = kael({ id: 'kael-token' });

function pv(current: number, max: number, position = 0): TokenBarDto {
  const [first] = lyra().bars;
  if (!first) throw new Error('lyra() has no bars');
  return { ...first, id: `pv-${current}-${position}`, position, current, max };
}

function bandit(n: number, overrides: Partial<TokenDto> = {}): TokenDto {
  return lyra({
    id: `bandido-${n}`,
    name: `Bandido ${n}`,
    side: 'enemy',
    bars: [pv(10, 10)],
    ...overrides,
  });
}

const BANDIDO: CombatantDto = {
  id: 'c-bandido',
  name: 'Bandido',
  tokenIds: ['bandido-1', 'bandido-2'],
  initiative: 14,
  tieOrder: 2,
};
const COVIL: CombatantDto = {
  id: 'c-covil',
  name: 'Covil',
  tokenIds: [],
  initiative: 5,
  tieOrder: 3,
};
const ORDER = [
  soloCombatant(KAEL_COMBATANT, 'kael-token', 18, 0),
  BANDIDO,
  soloCombatant(LYRA_COMBATANT, LYRA_ID, 14, 1),
];

function combatOn(currentCombatantId: string | null, round = 2) {
  return vharnCombat({ round, currentCombatantId, combatants: ORDER });
}

describe('trackerRowsOf', () => {
  const tokens = [KAEL, lyra(), bandit(1), bandit(2)];
  const board = vharnBoard({ tokens, combat: vharnCombat({ combatants: [...ORDER, COVIL] }) });

  it('a solo entry, a group and an entry without tokens are labelled by the seen tokens', () => {
    const rows = trackerRowsOf(board, tokens, true);

    expect(rows.map(({ label, tokens: seen }) => [label, seen.length])).toEqual([
      ['Kael', 1],
      ['Bandido', 2],
      ['Lyra', 1],
      ['Covil', 0],
    ]);
  });

  it('a hidden token is never named: its entry reads "Fora de vista"', () => {
    const rows = trackerRowsOf(board, [KAEL], false);

    expect(rows[2]?.label).toBe('Fora de vista');
    expect(rows[2]?.tokens).toEqual([]);
  });

  it('the Bandido (14) is tied with the Lyra below and nobody above', () => {
    const rows = trackerRowsOf(board, tokens, true);

    expect(rows[1]).toMatchObject({ tiedAbove: false, tiedBelow: true });
    expect(rows[2]).toMatchObject({ tiedAbove: true, tiedBelow: false });
  });

  it('the other entries are offered to "Mover para", without this one', () => {
    expect(trackerRowsOf(board, tokens, true)[0]?.others.map(({ label }) => label)).toEqual([
      'Bandido',
      'Lyra',
      'Covil',
    ]);
  });
});

describe('standingTextOf', () => {
  it('one bandit of six defeated reads "5 de 6 de pé"', () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => bandit(n, { defeated: n === 4 }));

    expect(standingTextOf(six)).toBe('5 de 6 de pé');
  });
});

describe('summedBarOf', () => {
  it('sums the position-0 bars received', () => {
    const pair = [bandit(1, { bars: [pv(4, 10)] }), bandit(2, { bars: [pv(6, 12)] })];

    expect(summedBarOf(pair)).toEqual({ current: 10, max: 22 });
  });

  it('a token whose bar did not come (hidden) adds nothing, nor a bar in another position', () => {
    const hidden = bandit(2, { bars: [pv(3, 9, 1)] });

    expect(summedBarOf([bandit(1, { bars: [pv(4, 10)] }), hidden])).toEqual({
      current: 4,
      max: 10,
    });
  });

  it('no bar received at all is null', () => {
    expect(summedBarOf([bandit(1, { bars: [] })])).toBeNull();
  });
});

describe('upNextTextOf and nextTurnLabelOf', () => {
  const seen = [KAEL, lyra(), bandit(1), bandit(2)];

  it('on Kael, next is "A seguir: Bandido" and the button is "Próximo turno"', () => {
    const combat = combatOn(KAEL_COMBATANT);

    expect(upNextTextOf(combat, seen)).toBe('A seguir: Bandido');
    expect(nextTurnLabelOf(combat)).toBe('Próximo turno');
  });

  it('on the last of the order, next is "A seguir: Kael · rodada 3" and the button closes the round', () => {
    const combat = combatOn(LYRA_COMBATANT, 2);

    expect(upNextTextOf(combat, seen)).toBe('A seguir: Kael · rodada 3');
    expect(nextTurnLabelOf(combat)).toBe('Fechar rodada 2');
  });

  it('a next entry this viewer does not see reads "A seguir: Fora de vista"', () => {
    const unnamed = vharnCombat({
      currentCombatantId: KAEL_COMBATANT,
      combatants: [ORDER[0]!, ORDER[2]!],
    });

    expect(upNextTextOf(unnamed, [KAEL])).toBe('A seguir: Fora de vista');
  });

  it('with nobody on turn there is no "a seguir"', () => {
    expect(upNextTextOf(combatOn(null), seen)).toBeNull();
  });
});
