import { describe, expect, it } from 'vitest';
import {
  addCombatantsCommandDto,
  combatantDto,
  combatEntriesDto,
  combatEntryInputDto,
  combatTurnChangedDto,
  moveInTieCommandDto,
  nextTurnCommandDto,
  regroupTokensCommandDto,
  renameCombatantCommandDto,
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
const [KAEL, GOBLIN, OGRO] = IDS as [string, string, string];

function tokenIdNumber(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function idsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => tokenIdNumber(index + 1));
}

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('combat commands', () => {
  it('combat:start with a group, a lone token and an entry without tokens is accepted', () => {
    const entries = [
      { name: 'Inimigos', tokenIds: [GOBLIN, OGRO] },
      { name: null, tokenIds: [KAEL] },
      { name: 'Covil', tokenIds: [] },
    ];

    expect(startCombatCommandDto.parse({ ...BASE, entries }).entries).toEqual(
      entries.map((entry) => ({ ...entry, initiative: null })),
    );
  });

  it('combat:start with no entry is refused', () => {
    expect(startCombatCommandDto.safeParse({ ...BASE, entries: [] }).success).toBe(false);
  });

  it('combat:start with the old tokenIds is refused', () => {
    expect(startCombatCommandDto.safeParse({ ...BASE, tokenIds: IDS }).success).toBe(false);
  });

  it('combat:addCombatants with a token in two entries is refused', () => {
    const entries = [
      { name: null, tokenIds: [KAEL] },
      { name: 'Aliados', tokenIds: [KAEL] },
    ];

    expect(addCombatantsCommandDto.safeParse({ ...BASE, entries }).success).toBe(false);
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
        combatants: [{ id: KAEL, name: null, tokenIds: [OGRO], initiative: 18, tieOrder: 0 }],
      },
      conditionChanges: [{ tokenId: OGRO, conditions: [] }],
    };
    expect(combatTurnChangedDto.parse(event)).toEqual(event);
  });
});

describe('combatEntryInputDto', () => {
  it('a named entry with two tokens is accepted', () => {
    const entry = { name: 'Inimigos', tokenIds: [GOBLIN, OGRO], initiative: null };

    expect(combatEntryInputDto.parse(entry)).toEqual(entry);
  });

  it('an unnamed entry with one token is accepted', () => {
    const entry = { name: null, tokenIds: [KAEL], initiative: null };

    expect(combatEntryInputDto.parse(entry)).toEqual(entry);
  });

  it('an entry without tokens keeps its trimmed name', () => {
    expect(combatEntryInputDto.parse({ name: '  Covil  ', tokenIds: [] }).name).toBe('Covil');
  });

  it('an entry without tokens and without a name is refused, asking for a name', () => {
    const result = combatEntryInputDto.safeParse({ name: null, tokenIds: [] });

    expect(messagesOf(result).join()).toContain('without tokens needs a name');
  });

  it.each(['x'.repeat(41), '   '])('the name %j is refused', (name) => {
    expect(combatEntryInputDto.safeParse({ name, tokenIds: [KAEL] }).success).toBe(false);
  });

  it('the same token twice in one entry is refused, citing it', () => {
    const result = combatEntryInputDto.safeParse({ name: null, tokenIds: [GOBLIN, GOBLIN] });

    expect(messagesOf(result).join()).toContain(GOBLIN);
  });

  it('65 tokens in one entry are refused', () => {
    expect(combatEntryInputDto.safeParse({ name: 'Horda', tokenIds: idsOf(65) }).success).toBe(
      false,
    );
  });
});

describe('combatEntryInputDto initiative', () => {
  it('an entry with initiative 18 keeps it', () => {
    expect(
      combatEntryInputDto.parse({ name: null, tokenIds: [KAEL], initiative: 18 }).initiative,
    ).toBe(18);
  });

  it('an entry without tokens takes an initiative too', () => {
    const entry = { name: 'Covil', tokenIds: [], initiative: 20 };

    expect(combatEntryInputDto.parse(entry)).toEqual(entry);
  });

  it('an entry without initiative comes out with initiative null', () => {
    expect(combatEntryInputDto.parse({ name: null, tokenIds: [KAEL] }).initiative).toBeNull();
  });

  it.each([-999, 999])('the initiative %i is accepted', (initiative) => {
    expect(combatEntryInputDto.parse({ name: null, tokenIds: [KAEL], initiative }).initiative).toBe(
      initiative,
    );
  });

  it.each([1000, 2.5])('the initiative %s is refused, citing the field', (initiative) => {
    const result = combatEntryInputDto.safeParse({ name: null, tokenIds: [KAEL], initiative });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('initiative');
  });

  it('combat:addCombatants carries each entry initiative', () => {
    const entries = [{ name: null, tokenIds: [GOBLIN], initiative: 15 }];

    expect(addCombatantsCommandDto.parse({ ...BASE, entries }).entries).toEqual(entries);
  });
});

describe('combatEntriesDto', () => {
  it('a token in two entries is refused, citing it', () => {
    const result = combatEntriesDto.safeParse([
      { name: 'Inimigos', tokenIds: [GOBLIN, OGRO] },
      { name: null, tokenIds: [GOBLIN] },
    ]);

    expect(messagesOf(result).join()).toContain(
      `token ${GOBLIN} is in more than one entry; expected each token in one entry`,
    );
  });

  it.each([0, 65])('a list of %i entries is refused', (count) => {
    const entries = idsOf(count).map((tokenId) => ({ name: null, tokenIds: [tokenId] }));

    expect(combatEntriesDto.safeParse(entries).success).toBe(false);
  });
});

describe('regroupTokensCommandDto', () => {
  it.each([{ kind: 'entry', combatantId: OGRO }, { kind: 'own' }, { kind: 'out' }])(
    'the target %j is accepted',
    (target) => {
      const parsed = regroupTokensCommandDto.parse({ ...BASE, tokenIds: [GOBLIN], target });

      expect(parsed.target).toEqual(target);
    },
  );

  it.each([{ kind: 'entry' }, { kind: 'group' }])('the target %j is refused', (target) => {
    expect(regroupTokensCommandDto.safeParse({ ...BASE, tokenIds: [GOBLIN], target }).success).toBe(
      false,
    );
  });

  it.each([0, 65])('%i tokens are refused', (count) => {
    const command = { ...BASE, tokenIds: idsOf(count), target: { kind: 'own' } };

    expect(regroupTokensCommandDto.safeParse(command).success).toBe(false);
  });
});

describe('renameCombatantCommandDto', () => {
  it('an empty name is refused', () => {
    const command = { ...BASE, combatantId: KAEL, name: '' };

    expect(renameCombatantCommandDto.safeParse(command).success).toBe(false);
  });
});

describe('combatantDto', () => {
  it('an entry without tokens and without the old tokenId passes', () => {
    const entry = { id: KAEL, name: null, tokenIds: [], initiative: null, tieOrder: 0 };

    expect(combatantDto.parse(entry)).toEqual(entry);
  });

  it('an entry still carrying the old tokenId is refused', () => {
    const entry = {
      id: KAEL,
      name: null,
      tokenIds: [OGRO],
      tokenId: OGRO,
      initiative: 3,
      tieOrder: 0,
    };

    expect(combatantDto.safeParse(entry).success).toBe(false);
  });
});
