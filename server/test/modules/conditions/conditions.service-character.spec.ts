import { beforeEach, describe, expect, it } from 'vitest';
import { ConditionsService } from '../../../src/modules/conditions/conditions.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  CharacterTableFake,
  ESTRADA_LYRA_ID,
  KAEL_ID,
  VHARN_TORRE_ID,
  kaelRow,
  linkedLyraRow,
} from '../../support/character-fakes';
import { LYRA_CHARACTER_ID, characterPo } from '../../support/characters-factories';
import { soloEntries } from '../../support/combat-fakes';
import { ConditionTransactionRunnerFake } from '../../support/conditions-fakes';

const TORRE = { sceneId: VHARN_TORRE_ID };
const LOCK_TORRE = `lockInCampaign:${VHARN_TORRE_ID}`;
const ON_LYRA = { characterId: LYRA_CHARACTER_ID };
const OTHER_LYRA_ID = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';
const QUELM_CHARACTER_ID = '3e4f5a6b-7c8d-4e9f-8a0b-1c2d3e4f5a6b';
const FOREVER = { remainingRounds: null, appliedRound: null };

describe('conditions on a token linked to a character', () => {
  let table: CharacterTableFake;
  let service: ConditionsService;
  let envenenado: string;

  beforeEach(() => {
    table = new CharacterTableFake();
    table.tokens.rows.push(linkedLyraRow(), kaelRow());
    const { scenes, tokens, conditions, combat, characters } = table;
    const runner = new ConditionTransactionRunnerFake(
      scenes,
      tokens,
      conditions,
      combat,
      undefined,
      characters,
    );
    const { members, publisher, characterPublisher, clock } = table;
    const deps = { members, transaction: runner.run, publisher, characterPublisher, clock };
    service = new ConditionsService(deps);
    envenenado = table.conditions.define(VHARN_ID, 'Envenenado', 'harm');
  });

  function torreVersion(): number | undefined {
    return table.scenes.rows.find(({ id }) => id === VHARN_TORRE_ID)?.version;
  }

  function lyraConditionsPublished(index = 0): unknown {
    const [lyra] = table.characterPublisher.changes[index]?.characters ?? [];
    return lyra?.privileged.conditions;
  }

  function sangrando(): string {
    return table.conditions.define(VHARN_ID, 'Sangrando', 'harm', 'droplet', null, '', 5);
  }

  describe('apply', () => {
    it('Envenenado on the linked Lyra lands on her character: character:changed in the characters version, the grid untouched', async () => {
      const onLyra = { ...TORRE, tokenId: ESTRADA_LYRA_ID, conditionId: envenenado, rounds: 2 };

      const version = await service.apply(BIA_ID, VHARN_ID, onLyra);

      expect(version).toBe(6);
      expect(table.conditions.active).toEqual([
        expect.objectContaining({ tokenId: null, characterId: LYRA_CHARACTER_ID }),
      ]);
      expect(table.journal).toEqual([
        LOCK_TORRE,
        'lock characters',
        LOCK_TORRE,
        'save',
        'bump characters',
        'commit',
        'publish',
      ]);
      expect(table.characterPublisher.changes).toEqual([
        expect.objectContaining({ version: 6, characters: [expect.anything()] }),
      ]);
      expect(lyraConditionsPublished()).toEqual([
        expect.objectContaining({ name: 'Envenenado', remainingRounds: 2 }),
      ]);
      expect(table.publisher.conditionEvents).toEqual([]);
      expect(torreVersion()).toBe(7);
    });

    it('stamps the round of the combat of the grid the command names', async () => {
      await table.combat.start(VHARN_TORRE_ID, soloEntries(KAEL_ID, ESTRADA_LYRA_ID));
      await table.combat.setTurn(`combat-${VHARN_TORRE_ID}`, 3, `c-${KAEL_ID}`);

      await service.apply(BIA_ID, VHARN_ID, {
        ...TORRE,
        tokenId: ESTRADA_LYRA_ID,
        conditionId: envenenado,
        rounds: 1,
      });

      expect(table.conditions.active[0]).toMatchObject({ characterId: LYRA_CHARACTER_ID });
      expect(table.conditions.active[0]?.appliedRound).toBe(3);
    });

    it('a token wearing a character of another table is CHARACTER_NOT_FOUND and nothing goes out', async () => {
      const quelms = characterPo({ id: QUELM_CHARACTER_ID, campaignId: QUELM_ID });
      table.characters.rows.push({
        character: quelms,
        bars: [],
        controllerIds: [],
        holderRole: null,
      });
      table.tokens.rows.push(linkedLyraRow({ id: OTHER_LYRA_ID, characterId: QUELM_CHARACTER_ID }));
      const command = { ...TORRE, tokenId: OTHER_LYRA_ID, conditionId: envenenado, rounds: 0 };

      await expect(service.apply(ANA_ID, VHARN_ID, command)).rejects.toMatchObject({
        code: 'CHARACTER_NOT_FOUND',
      });
      expect(table.journal).not.toContain('commit');
      expect(table.characterPublisher.changes).toEqual([]);
    });
  });

  describe('applyMany', () => {
    it('Lyra (linked) and Kael (unlinked): one character:changed and one condition:appliedMany of the grid, each in its version', async () => {
      const version = await service.applyMany(ANA_ID, VHARN_ID, {
        ...TORRE,
        tokenIds: [ESTRADA_LYRA_ID, KAEL_ID],
        conditionId: envenenado,
        rounds: 0,
      });

      expect(version).toBe(8);
      expect(table.journal.filter((entry) => entry.startsWith('bump'))).toEqual([
        'bump characters',
        'bump',
      ]);
      expect(table.characterPublisher.changes.map(({ version: v }) => v)).toEqual([6]);
      expect(lyraConditionsPublished()).toEqual([expect.objectContaining({ name: 'Envenenado' })]);
      const applies = table.publisher.conditionsApplies;
      expect(applies.map(({ sceneId, version: v }) => [sceneId, v])).toEqual([[VHARN_TORRE_ID, 8]]);
      expect(applies[0]?.applied.map(({ tokenId }) => tokenId)).toEqual([KAEL_ID]);
    });

    it('only unlinked tokens never lock the characters', async () => {
      await service.applyMany(ANA_ID, VHARN_ID, {
        ...TORRE,
        tokenIds: [KAEL_ID],
        conditionId: envenenado,
        rounds: 0,
      });

      expect(table.journal).not.toContain('lock characters');
      expect(table.characterPublisher.changes).toEqual([]);
    });

    it('two tokens wearing the same character in one group add 1 stack to it, not 2', async () => {
      const bleed = sangrando();
      table.tokens.rows.push(linkedLyraRow({ id: OTHER_LYRA_ID, col: 9 }));
      const tokenIds = [ESTRADA_LYRA_ID, OTHER_LYRA_ID];
      const command = { ...TORRE, tokenIds, conditionId: bleed, rounds: 0 };

      await service.applyMany(ANA_ID, VHARN_ID, command);
      await service.applyMany(ANA_ID, VHARN_ID, command);

      const held = table.conditions.active.map(({ characterId, stacks }) => [characterId, stacks]);
      expect(held).toEqual([[LYRA_CHARACTER_ID, 2]]);
      expect(table.characterPublisher.changes[0]?.characters).toHaveLength(1);
    });
  });

  describe('setRounds, setStacks and remove', () => {
    async function lyraPoisoned(): Promise<string> {
      const applied = await table.conditions.apply(ON_LYRA, envenenado, {
        remainingRounds: 2,
        appliedRound: 1,
      });
      table.journal.splice(0);
      return applied.id;
    }

    it('setRounds on the linked Lyra changes the rounds of her character only, the applied round stays', async () => {
      const activeConditionId = await lyraPoisoned();
      const command = { ...TORRE, tokenId: ESTRADA_LYRA_ID, activeConditionId, rounds: 5 };

      const version = await service.setRounds(BIA_ID, VHARN_ID, command);

      expect(version).toBe(6);
      expect(table.conditions.active[0]).toMatchObject({ remainingRounds: 5, appliedRound: 1 });
      expect(lyraConditionsPublished()).toEqual([
        expect.objectContaining({ id: activeConditionId, remainingRounds: 5 }),
      ]);
      expect(table.publisher.conditionEvents).toEqual([]);
      expect(torreVersion()).toBe(7);
    });

    it('setStacks on the linked Lyra writes the stacks of her character condition', async () => {
      const applied = await table.conditions.apply(ON_LYRA, sangrando(), FOREVER);
      const command = { ...TORRE, tokenId: ESTRADA_LYRA_ID, activeConditionId: applied.id };

      await service.setStacks(BIA_ID, VHARN_ID, { ...command, stacks: 3 });

      expect(table.conditions.active[0]).toMatchObject({
        characterId: LYRA_CHARACTER_ID,
        stacks: 3,
      });
      expect(lyraConditionsPublished()).toEqual([expect.objectContaining({ stacks: 3 })]);
    });

    it('remove on the linked Lyra takes it off her character: character:changed without it, no grid event', async () => {
      const activeConditionId = await lyraPoisoned();

      const version = await service.remove(BIA_ID, VHARN_ID, {
        ...TORRE,
        tokenId: ESTRADA_LYRA_ID,
        activeConditionId,
      });

      expect(version).toBe(6);
      expect(table.conditions.active).toEqual([]);
      expect(lyraConditionsPublished()).toEqual([]);
      expect(table.publisher.conditionEvents).toEqual([]);
    });

    it('a condition of Kael named through Lyra is not hers: CONDITION_NOT_FOUND, nothing changes', async () => {
      const kaels = await table.conditions.apply({ tokenId: KAEL_ID }, envenenado, FOREVER);
      const command = { ...TORRE, tokenId: ESTRADA_LYRA_ID, activeConditionId: kaels.id };

      await expect(service.remove(BIA_ID, VHARN_ID, command)).rejects.toMatchObject({
        code: 'CONDITION_NOT_FOUND',
      });
      expect(table.conditions.active).toHaveLength(1);
      expect(table.characterPublisher.changes).toEqual([]);
    });
  });
});
