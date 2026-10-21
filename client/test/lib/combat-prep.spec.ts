import type { TokenDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  NO_PREP_CHOICES,
  blankSummaryOf,
  creatureKeyOf,
  groupInitiativeKey,
  prepPlanOf,
  prepSectionsOf,
  prepSummaryOf,
  prepTokenIdsOf,
  withChecked,
  withInitiative,
  withSplit,
  type PrepChoices,
  type PrepItem,
} from '@/lib/combat-prep';
import { kael, lyra, soloCombatant, vharnCombat } from '../support/table-session-fixtures';

const KAEL = kael({ id: 'kael' });
const LYRA = lyra({ id: 'lyra' });
const BANDIDOS = [1, 2, 3, 4, 5, 6].map((n) =>
  lyra({ id: `bandido-${n}`, name: `Bandido ${n}`, side: 'enemy', controllerIds: [] }),
);
const BANDIDO_IDS = BANDIDOS.map(({ id }) => id);
const GOBLIN_CHEFE = lyra({ id: 'chefe', name: 'Goblin Chefe', side: 'enemy' });
const TAVERNEIRO = lyra({ id: 'taverneiro', name: 'Taverneiro', side: 'neutral' });

function choices(overrides: Partial<PrepChoices>): PrepChoices {
  return { ...NO_PREP_CHOICES, ...overrides };
}

function labelOf(item: PrepItem): string {
  return item.kind === 'group' ? `${item.label} ×${item.tokens.length}` : item.token.name;
}

describe('creatureKeyOf', () => {
  it('"Bandido 1" and "Bandido 6" are the same creature, read as "Bandido"', () => {
    expect(creatureKeyOf('Bandido 1')).toEqual(creatureKeyOf('Bandido 6'));
    expect(creatureKeyOf('Bandido 6').label).toBe('Bandido');
  });

  it('"lobo" and "Lobo 2" are the same creature, without case', () => {
    expect(creatureKeyOf('lobo').key).toBe(creatureKeyOf('Lobo 2').key);
  });

  it('an accent does not make another creature', () => {
    expect(creatureKeyOf('Esqueleto Ancião').key).toBe(creatureKeyOf('esqueleto anciao 3').key);
  });

  it('"Goblin" and "Goblin Chefe" are different creatures', () => {
    expect(creatureKeyOf('Goblin').key).not.toBe(creatureKeyOf('Goblin Chefe').key);
  });

  it('"Bandido #3" reads "Bandido"', () => {
    expect(creatureKeyOf('Bandido #3').label).toBe('Bandido');
  });
});

describe('prepSectionsOf', () => {
  it('the allies go to "Grupo" and the enemies and neutrals to "Inimigos e outros"', () => {
    const sections = prepSectionsOf([TAVERNEIRO, KAEL, GOBLIN_CHEFE, LYRA], null);

    expect(sections.map(({ title, items }) => [title, items.map(labelOf)])).toEqual([
      ['Grupo', ['Kael', 'Lyra']],
      ['Inimigos e outros', ['Taverneiro', 'Goblin Chefe']],
    ]);
  });

  it('six bandits become one group where the first of them was', () => {
    const sections = prepSectionsOf([GOBLIN_CHEFE, ...BANDIDOS, TAVERNEIRO], null);

    expect(sections[0]?.items.map(labelOf)).toEqual(['Goblin Chefe', 'Bandido ×6', 'Taverneiro']);
  });

  it('allies with the same name are never grouped', () => {
    const twins = [lyra({ id: 'a', name: 'Guarda 1' }), lyra({ id: 'b', name: 'Guarda 2' })];

    expect(prepSectionsOf(twins, null)[0]?.items.map(labelOf)).toEqual(['Guarda 1', 'Guarda 2']);
  });

  it('a creature with one token is a plain line', () => {
    expect(prepSectionsOf([BANDIDOS[0] as TokenDto], null)[0]?.items[0]?.kind).toBe('token');
  });

  it('only the tokens layer enters', () => {
    const chest = lyra({ id: 'bau', name: 'Baú', layer: 'objects' });

    expect(prepSectionsOf([chest, KAEL], null).flatMap(({ items }) => items.map(labelOf))).toEqual([
      'Kael',
    ]);
  });

  it('when adding, only the tokens out of the combat enter', () => {
    const combat = vharnCombat({ combatants: [soloCombatant('c-kael', 'kael', 18, 0)] });

    const names = prepSectionsOf([KAEL, LYRA], combat).flatMap(({ items }) => items.map(labelOf));

    expect(names).toEqual(['Lyra']);
  });
});

describe('prepPlanOf', () => {
  const sections = prepSectionsOf([KAEL, ...BANDIDOS, LYRA], null);

  it('the bandits "Juntos" with 15 are one entry named Bandido with their six tokens', () => {
    const plan = prepPlanOf(
      sections,
      choices({ initiatives: { [groupInitiativeKey(creatureKeyOf('Bandido').key)]: '15' } }),
    );

    expect(plan.entries[2]).toEqual({ name: 'Bandido', tokenIds: BANDIDO_IDS, initiative: 15 });
  });

  it('the allies come first, before the others (the tie order)', () => {
    const plan = prepPlanOf(prepSectionsOf([...BANDIDOS, KAEL], null), NO_PREP_CHOICES);

    expect(plan.entries.map(({ name, tokenIds }) => name ?? tokenIds[0])).toEqual([
      'kael',
      'Bandido',
    ]);
  });

  it('"Cada um" gives each bandit an unnamed entry with its own initiative', () => {
    const key = creatureKeyOf('Bandido').key;
    const plan = prepPlanOf(
      sections,
      choices({ split: [key], initiatives: { 'bandido-1': '12', 'bandido-2': '−1' } }),
    );

    expect(plan.entries.slice(2, 5)).toEqual([
      { name: null, tokenIds: ['bandido-1'], initiative: 12 },
      { name: null, tokenIds: ['bandido-2'], initiative: -1 },
      { name: null, tokenIds: ['bandido-3'], initiative: null },
    ]);
    expect(plan.entries).toHaveLength(8);
  });

  it('a bandit left unchecked stays out of the group entry', () => {
    const plan = prepPlanOf(sections, choices({ unchecked: ['bandido-2'] }));

    expect(plan.entries[2]?.tokenIds).toEqual(BANDIDO_IDS.filter((id) => id !== 'bandido-2'));
  });

  it('a group with only one checked is a plain entry, with the group initiative', () => {
    const key = creatureKeyOf('Bandido').key;
    const plan = prepPlanOf(
      sections,
      choices({
        unchecked: BANDIDO_IDS.slice(1),
        initiatives: { [groupInitiativeKey(key)]: '9' },
      }),
    );

    expect(plan.entries[2]).toEqual({ name: null, tokenIds: ['bandido-1'], initiative: 9 });
  });

  it('Kael unchecked and the initiative typed for Lyra', () => {
    const plan = prepPlanOf(
      prepSectionsOf([KAEL, LYRA], null),
      choices({ unchecked: ['kael'], initiatives: { lyra: ' 18 ' } }),
    );

    expect(plan.entries).toEqual([{ name: null, tokenIds: ['lyra'], initiative: 18 }]);
  });

  it('an initiative left blank goes as null and names the line', () => {
    const plan = prepPlanOf(prepSectionsOf([KAEL, LYRA], null), NO_PREP_CHOICES);

    expect(plan.entries.map(({ initiative }) => initiative)).toEqual([null, null]);
    expect(plan.blankNames).toEqual(['Kael', 'Lyra']);
  });

  it('"abc" in Kael is invalid, naming Kael', () => {
    const plan = prepPlanOf(
      prepSectionsOf([KAEL, LYRA], null),
      choices({ initiatives: { kael: 'abc' } }),
    );

    expect(plan.invalidNames).toEqual(['Kael']);
  });

  it('an invalid text in an unchecked line blocks nothing', () => {
    const plan = prepPlanOf(
      prepSectionsOf([KAEL, LYRA], null),
      choices({ unchecked: ['kael'], initiatives: { kael: 'abc' } }),
    );

    expect(plan.invalidNames).toEqual([]);
  });
});

describe('prepSummaryOf and blankSummaryOf', () => {
  it.each([
    [[KAEL, LYRA, ...BANDIDOS], '3 na ordem'],
    [[KAEL], '1 na ordem'],
  ])('the entries are counted (%#)', (tokens, text) => {
    expect(prepSummaryOf(prepPlanOf(prepSectionsOf(tokens, null), NO_PREP_CHOICES))).toBe(text);
  });

  it('nobody checked is "Ninguém na ordem"', () => {
    const plan = prepPlanOf(prepSectionsOf([KAEL], null), choices({ unchecked: ['kael'] }));

    expect(prepSummaryOf(plan)).toBe('Ninguém na ordem');
  });

  it('Kael and Lyra blank read "Kael e Lyra começam sem iniciativa"', () => {
    const plan = prepPlanOf(prepSectionsOf([KAEL, LYRA], null), NO_PREP_CHOICES);

    expect(blankSummaryOf(plan)).toBe('Kael e Lyra começam sem iniciativa');
  });

  it('only Kael blank reads "Kael começa sem iniciativa"', () => {
    const plan = prepPlanOf(
      prepSectionsOf([KAEL, LYRA], null),
      choices({ initiatives: { lyra: '3' } }),
    );

    expect(blankSummaryOf(plan)).toBe('Kael começa sem iniciativa');
  });

  it('nobody blank has no warning', () => {
    const plan = prepPlanOf(prepSectionsOf([KAEL], null), choices({ initiatives: { kael: '3' } }));

    expect(blankSummaryOf(plan)).toBeNull();
  });
});

describe('the choice helpers', () => {
  it('unchecking Kael and checking him again leaves nobody out', () => {
    const out = withChecked(NO_PREP_CHOICES, ['kael'], false);

    expect(out.unchecked).toEqual(['kael']);
    expect(withChecked(out, ['kael'], true).unchecked).toEqual([]);
  });

  it('unchecking a token twice keeps it once', () => {
    const twice = withChecked(withChecked(NO_PREP_CHOICES, ['kael'], false), ['kael'], false);

    expect(twice.unchecked).toEqual(['kael']);
  });

  it('"Cada um" then "Juntos" puts the group back together', () => {
    const split = withSplit(NO_PREP_CHOICES, 'bandido', true);

    expect(split.split).toEqual(['bandido']);
    expect(withSplit(split, 'bandido', false).split).toEqual([]);
  });

  it('typing an initiative keeps the others', () => {
    const typed = withInitiative(withInitiative(NO_PREP_CHOICES, 'kael', '18'), 'lyra', '3');

    expect(typed.initiatives).toEqual({ kael: '18', lyra: '3' });
  });

  it('every token of the sections, the members of a group included', () => {
    const sections = prepSectionsOf([KAEL, ...BANDIDOS.slice(0, 2)], null);

    expect(prepTokenIdsOf(sections)).toEqual(['kael', 'bandido-1', 'bandido-2']);
  });
});
