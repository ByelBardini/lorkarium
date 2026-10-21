import type { CombatantDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  canRunEntry,
  combatCandidatesOf,
  entryLabelOf,
  entryOfToken,
  entryTokensOf,
  soloEntriesOf,
  turnTokenIdsOf,
} from '@/lib/combat-entries';
import {
  KAEL_COMBATANT,
  KAEL_ID,
  kael,
  lyra,
  soloCombatant,
  vharnBoard,
  vharnCombat,
} from '../support/table-session-fixtures';

const GOBLIN = lyra({ id: 'goblin-1', name: 'Goblin' });
const GOBLIN_2 = lyra({ id: 'goblin-2', name: 'Goblin' });
const INIMIGOS: CombatantDto = {
  ...soloCombatant('c-inimigos', 'goblin-1', 15, 1),
  tokenIds: ['goblin-2', 'goblin-1'],
};
const UNNAMED_PAIR: CombatantDto = { ...INIMIGOS, name: null };
const COVIL: CombatantDto = { ...soloCombatant('c-covil', 'x', 5, 2), name: 'Covil', tokenIds: [] };

describe('soloEntriesOf', () => {
  it('each token gets an unnamed entry of its own, in the order given', () => {
    expect(soloEntriesOf(['kael', 'goblin'])).toEqual([
      { name: null, tokenIds: ['kael'], initiative: null },
      { name: null, tokenIds: ['goblin'], initiative: null },
    ]);
  });

  it('no token makes no entry', () => {
    expect(soloEntriesOf([])).toEqual([]);
  });
});

describe('entryLabelOf', () => {
  it('an entry the master named reads its name', () => {
    expect(entryLabelOf({ ...INIMIGOS, name: 'Inimigos' }, [GOBLIN, GOBLIN_2])).toBe('Inimigos');
  });

  it('an unnamed entry of Kael reads Kael', () => {
    expect(entryLabelOf(soloCombatant(KAEL_COMBATANT, KAEL_ID, 18, 0), [kael()])).toBe('Kael');
  });

  it('an unnamed entry of two goblins reads "Goblin e mais 1"', () => {
    expect(entryLabelOf(UNNAMED_PAIR, [GOBLIN, GOBLIN_2])).toBe('Goblin e mais 1');
  });

  it('an unnamed entry whose tokens this viewer does not see reads "Fora de vista"', () => {
    expect(entryLabelOf(UNNAMED_PAIR, [kael()])).toBe('Fora de vista');
  });

  it('the Covil, without tokens, reads Covil', () => {
    expect(entryLabelOf(COVIL, [])).toBe('Covil');
  });
});

describe('entryTokensOf', () => {
  it('lists the seen tokens of the entry sorted by name, leaving out the unseen', () => {
    const wolf = lyra({ id: 'goblin-2', name: 'Arauto' });

    expect(entryTokensOf(UNNAMED_PAIR, [kael(), GOBLIN, wolf]).map(({ name }) => name)).toEqual([
      'Arauto',
      'Goblin',
    ]);
  });
});

describe('canRunEntry', () => {
  const mine = (id: string) => lyra({ id, canControl: true });
  const theirs = (id: string) => lyra({ id, canControl: false });

  it('the master runs any entry', () => {
    expect(canRunEntry(UNNAMED_PAIR, [theirs('goblin-1')], true)).toBe(true);
  });

  it('a player who controls every token of the entry runs it', () => {
    expect(canRunEntry(UNNAMED_PAIR, [mine('goblin-1'), mine('goblin-2')], false)).toBe(true);
  });

  it('a player missing control of one token does not run it', () => {
    expect(canRunEntry(UNNAMED_PAIR, [mine('goblin-1'), theirs('goblin-2')], false)).toBe(false);
  });

  it('a player never runs an entry without tokens', () => {
    expect(canRunEntry(COVIL, [], false)).toBe(false);
  });
});

describe('turnTokenIdsOf', () => {
  it('the tokens of the entry on turn', () => {
    const board = vharnBoard({
      combat: vharnCombat({ currentCombatantId: 'c-inimigos', combatants: [INIMIGOS] }),
    });

    expect(turnTokenIdsOf(board)).toEqual(['goblin-2', 'goblin-1']);
  });

  it('nobody on turn, or no combat, is no token', () => {
    expect(
      turnTokenIdsOf(vharnBoard({ combat: vharnCombat({ currentCombatantId: null }) })),
    ).toEqual([]);
    expect(turnTokenIdsOf(vharnBoard())).toEqual([]);
  });
});

describe('entryOfToken', () => {
  it('the entry that holds the token, or null', () => {
    const combat = vharnCombat({ combatants: [INIMIGOS, COVIL] });

    expect(entryOfToken(combat, 'goblin-1')?.id).toBe('c-inimigos');
    expect(entryOfToken(combat, KAEL_ID)).toBeNull();
  });
});

describe('combatCandidatesOf', () => {
  it('only the tokens layer enters a combat: the chest of Objetos and the rug of Fundo stay out', () => {
    const chest = lyra({ id: 'bau', name: 'Baú', layer: 'objects' });
    const rug = lyra({ id: 'tapete', name: 'Tapete', layer: 'background' });

    expect(combatCandidatesOf([kael(), chest, GOBLIN, rug]).map(({ id }) => id)).toEqual([
      KAEL_ID,
      'goblin-1',
    ]);
  });
});
