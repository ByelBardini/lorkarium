import { beforeEach, describe, expect, it } from 'vitest';
import { CombatService } from '../../../src/modules/combat/combat.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  CharacterTableFake,
  ESTRADA_LYRA_ID,
  KAEL_ID,
  LYRA_ANCHOR_ID,
  VHARN_CAST_ID,
  VHARN_TORRE_ID,
  kaelRow,
  linkedLyraRow,
} from '../../support/character-fakes';
import { CombatTransactionRunnerFake, soloEntries } from '../../support/combat-fakes';

const TORRE = { sceneId: VHARN_TORRE_ID };
const LOCK_TORRE = `lockInCampaign:${VHARN_TORRE_ID}`;
const COMBAT_ID = `combat-${VHARN_TORRE_ID}`;

describe('the end of the turn of a token linked to a character', () => {
  let table: CharacterTableFake;
  let service: CombatService;

  beforeEach(() => {
    table = new CharacterTableFake();
    table.withLyraAnchor();
    table.tokens.rows.push(linkedLyraRow(), kaelRow());
    const { scenes, tokens, combat, conditions, members, publisher, clock } = table;
    const runner = new CombatTransactionRunnerFake({ scenes, tokens, combat, conditions });
    service = new CombatService({ members, transaction: runner.run, publisher, clock });
  });

  async function inRound2(
    entries: Parameters<CharacterTableFake['combat']['start']>[1],
    currentTokenId: string,
  ) {
    await table.combat.start(VHARN_TORRE_ID, entries);
    await table.combat.setTurn(COMBAT_ID, 2, `c-${currentTokenId}`);
    const poisonId = table.conditions.define(VHARN_ID, 'Envenenado', 'harm');
    const caidoId = table.conditions.define(VHARN_ID, 'Caído', 'harm');
    await table.conditions.apply(LYRA_ANCHOR_ID, poisonId, { remainingRounds: 1, appliedRound: 1 });
    await table.conditions.apply(KAEL_ID, caidoId, { remainingRounds: 3, appliedRound: 1 });
    table.journal.splice(0);
  }

  it('the Envenenado of the anchor ends with Lyra turn: condition:changedMany to the cast, the grid turn without it', async () => {
    await inRound2(soloEntries(ESTRADA_LYRA_ID, KAEL_ID), ESTRADA_LYRA_ID);

    await service.nextTurn(BIA_ID, VHARN_ID, { ...TORRE, fromCombatantId: `c-${ESTRADA_LYRA_ID}` });

    expect(table.journal.slice(0, 3)).toEqual([LOCK_TORRE, 'lock cast', LOCK_TORRE]);
    expect(table.journal.filter((entry) => entry.startsWith('bump'))).toEqual([
      'bump cast',
      'bump',
    ]);
    expect(table.conditions.active.map(({ tokenId }) => tokenId)).toEqual([KAEL_ID]);
    expect(table.publisher.conditionsChanges).toEqual([
      expect.objectContaining({
        sceneId: VHARN_CAST_ID,
        version: 3,
        changes: [{ tokenId: LYRA_ANCHOR_ID, conditions: [] }],
      }),
    ]);
    const [turn] = table.publisher.combatEvents;
    expect(turn).toMatchObject({
      name: 'combat:turnChanged',
      event: { sceneId: VHARN_TORRE_ID, conditionChanges: [] },
    });
  });

  it('an entry with the linked Lyra and the unlinked Kael: each change goes in its own event', async () => {
    await inRound2(
      [{ name: 'Dupla', tokenIds: [ESTRADA_LYRA_ID, KAEL_ID], initiative: null }],
      ESTRADA_LYRA_ID,
    );

    await service.nextTurn(ANA_ID, VHARN_ID, { ...TORRE, fromCombatantId: `c-${ESTRADA_LYRA_ID}` });

    const [change] = table.publisher.conditionsChanges;
    expect(change?.changes.map(({ tokenId }) => tokenId)).toEqual([LYRA_ANCHOR_ID]);
    const [turn] = table.publisher.combatEvents;
    const conditionChanges = turn?.name === 'combat:turnChanged' ? turn.event.conditionChanges : [];
    expect(conditionChanges).toEqual([
      { tokenId: KAEL_ID, conditions: [expect.objectContaining({ remainingRounds: 2 })] },
    ]);
  });

  it('the turn of the unlinked Kael never locks the cast', async () => {
    await inRound2(soloEntries(KAEL_ID, ESTRADA_LYRA_ID), KAEL_ID);

    await service.nextTurn(ANA_ID, VHARN_ID, { ...TORRE, fromCombatantId: `c-${KAEL_ID}` });

    expect(table.journal).not.toContain('lock cast');
    expect(table.publisher.conditionsChanges).toEqual([]);
  });

  it('previousTurn gives no expired condition back and leaves the cast alone', async () => {
    await inRound2(soloEntries(ESTRADA_LYRA_ID, KAEL_ID), ESTRADA_LYRA_ID);
    await service.nextTurn(ANA_ID, VHARN_ID, { ...TORRE, fromCombatantId: `c-${ESTRADA_LYRA_ID}` });
    table.journal.splice(0);

    await service.previousTurn(ANA_ID, VHARN_ID, { ...TORRE, fromCombatantId: `c-${KAEL_ID}` });

    expect(table.journal).not.toContain('lock cast');
    expect(table.conditions.active.map(({ tokenId }) => tokenId)).toEqual([KAEL_ID]);
  });
});
