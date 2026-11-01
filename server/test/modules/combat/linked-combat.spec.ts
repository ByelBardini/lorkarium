import { beforeEach, describe, expect, it } from 'vitest';
import { CombatService } from '../../../src/modules/combat/combat.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  CharacterTableFake,
  ESTRADA_LYRA_ID,
  KAEL_ID,
  VHARN_TORRE_ID,
  kaelRow,
  linkedLyraRow,
} from '../../support/character-fakes';
import { LYRA_CHARACTER_ID } from '../../support/characters-factories';
import { CombatTransactionRunnerFake, soloEntries } from '../../support/combat-fakes';

const TORRE = { sceneId: VHARN_TORRE_ID };
const LOCK_TORRE = `lockInCampaign:${VHARN_TORRE_ID}`;
const COMBAT_ID = `combat-${VHARN_TORRE_ID}`;
const ON_LYRA = { characterId: LYRA_CHARACTER_ID };

describe('the end of the turn of a token linked to a character', () => {
  let table: CharacterTableFake;
  let service: CombatService;

  beforeEach(() => {
    table = new CharacterTableFake();
    table.tokens.rows.push(linkedLyraRow(), kaelRow());
    const { scenes, tokens, combat, conditions, characters, members, publisher, clock } = table;
    const runner = new CombatTransactionRunnerFake({
      scenes,
      tokens,
      combat,
      conditions,
      characters,
    });
    const { characterPublisher } = table;
    const deps = { members, transaction: runner.run, publisher, characterPublisher, clock };
    service = new CombatService(deps);
  });

  // Round 2 of the Torre's combat: Envenenado (1 round) on Lyra's character and Caído (3 rounds)
  // on Kael, both applied in round 1.
  async function inRound2(
    entries: Parameters<CharacterTableFake['combat']['start']>[1],
    currentTokenId: string,
  ) {
    await table.combat.start(VHARN_TORRE_ID, entries);
    await table.combat.setTurn(COMBAT_ID, 2, `c-${currentTokenId}`);
    const poisonId = table.conditions.define(VHARN_ID, 'Envenenado', 'harm');
    const caidoId = table.conditions.define(VHARN_ID, 'Caído', 'harm');
    const duration = (remainingRounds: number) => ({ remainingRounds, appliedRound: 1 });
    await table.conditions.apply(ON_LYRA, poisonId, duration(1));
    await table.conditions.apply({ tokenId: KAEL_ID }, caidoId, duration(3));
    table.journal.splice(0);
  }

  it('the Envenenado of the character ends with Lyra turn: character:changed, the grid turn without it', async () => {
    await inRound2(soloEntries(ESTRADA_LYRA_ID, KAEL_ID), ESTRADA_LYRA_ID);

    await service.nextTurn(BIA_ID, VHARN_ID, { ...TORRE, fromCombatantId: `c-${ESTRADA_LYRA_ID}` });

    expect(table.journal.slice(0, 3)).toEqual([LOCK_TORRE, 'lock characters', LOCK_TORRE]);
    expect(table.journal.filter((entry) => entry.startsWith('bump'))).toEqual([
      'bump characters',
      'bump',
    ]);
    expect(table.conditions.active.map(({ tokenId }) => tokenId)).toEqual([KAEL_ID]);
    expect(table.characterPublisher.changes).toEqual([
      expect.objectContaining({ version: 6, characters: [expect.anything()] }),
    ]);
    const [lyra] = table.characterPublisher.changes[0]?.characters ?? [];
    expect(lyra).toMatchObject({ characterId: LYRA_CHARACTER_ID, privileged: { conditions: [] } });
    expect(table.publisher.conditionsChanges).toEqual([]);
    expect(table.publisher.combatEvents).toEqual([
      expect.objectContaining({
        name: 'combat:turnChanged',
        event: expect.objectContaining({ sceneId: VHARN_TORRE_ID, conditionChanges: [] }),
      }),
    ]);
  });

  it('a timed condition of the character counts down one round and goes out with it', async () => {
    await inRound2(soloEntries(ESTRADA_LYRA_ID, KAEL_ID), ESTRADA_LYRA_ID);
    const longer = table.conditions.define(VHARN_ID, 'Cego', 'harm');
    await table.conditions.apply(ON_LYRA, longer, { remainingRounds: 3, appliedRound: 1 });

    await service.nextTurn(BIA_ID, VHARN_ID, { ...TORRE, fromCombatantId: `c-${ESTRADA_LYRA_ID}` });

    const [lyra] = table.characterPublisher.changes[0]?.characters ?? [];
    expect(lyra?.others.conditions).toEqual([
      expect.objectContaining({ name: 'Cego', remainingRounds: 2 }),
    ]);
  });

  it('an entry with the linked Lyra and the unlinked Kael: each change goes in its own event', async () => {
    await inRound2(
      [{ name: 'Dupla', tokenIds: [ESTRADA_LYRA_ID, KAEL_ID], initiative: null }],
      ESTRADA_LYRA_ID,
    );

    await service.nextTurn(ANA_ID, VHARN_ID, { ...TORRE, fromCombatantId: `c-${ESTRADA_LYRA_ID}` });

    const [change] = table.characterPublisher.changes;
    expect(change?.characters.map(({ characterId }) => characterId)).toEqual([LYRA_CHARACTER_ID]);
    const [turn] = table.publisher.combatEvents;
    const conditionChanges = turn?.name === 'combat:turnChanged' ? turn.event.conditionChanges : [];
    expect(conditionChanges).toEqual([
      { tokenId: KAEL_ID, conditions: [expect.objectContaining({ remainingRounds: 2 })] },
    ]);
  });

  it('the turn of the unlinked Kael never locks the characters', async () => {
    await inRound2(soloEntries(KAEL_ID, ESTRADA_LYRA_ID), KAEL_ID);

    await service.nextTurn(ANA_ID, VHARN_ID, { ...TORRE, fromCombatantId: `c-${KAEL_ID}` });

    expect(table.journal).not.toContain('lock characters');
    expect(table.characterPublisher.changes).toEqual([]);
  });

  it('Caio, who does not control Lyra, cannot end her turn: FORBIDDEN, nothing counts down', async () => {
    await inRound2(soloEntries(ESTRADA_LYRA_ID, KAEL_ID), ESTRADA_LYRA_ID);

    const turn = service.nextTurn(CAIO_ID, VHARN_ID, {
      ...TORRE,
      fromCombatantId: `c-${ESTRADA_LYRA_ID}`,
    });

    await expect(turn).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(table.journal).not.toContain('commit');
    expect(table.conditions.active).toHaveLength(2);
    expect(table.characterPublisher.changes).toEqual([]);
  });

  it('previousTurn gives no expired condition back and leaves the characters alone', async () => {
    await inRound2(soloEntries(ESTRADA_LYRA_ID, KAEL_ID), ESTRADA_LYRA_ID);
    await service.nextTurn(ANA_ID, VHARN_ID, { ...TORRE, fromCombatantId: `c-${ESTRADA_LYRA_ID}` });
    table.journal.splice(0);

    await service.previousTurn(ANA_ID, VHARN_ID, { ...TORRE, fromCombatantId: `c-${KAEL_ID}` });

    expect(table.journal).not.toContain('lock characters');
    expect(table.conditions.active.map(({ tokenId }) => tokenId)).toEqual([KAEL_ID]);
  });
});
