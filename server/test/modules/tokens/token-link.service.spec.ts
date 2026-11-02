import { beforeEach, describe, expect, it } from 'vitest';
import type { ActiveConditionRow } from '../../../src/modules/conditions/conditions.dao';
import { TokenLinkService } from '../../../src/modules/tokens/token-link.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  CharacterTableFake,
  ESTRADA_LYRA_ID,
  KAEL_ID,
  QUELM_TOKEN_ID,
  VHARN_TORRE_ID,
  kaelRow,
  linkedLyraRow,
  lyraCharacterRow,
} from '../../support/character-fakes';
import { LYRA_CHARACTER_ID, characterPo } from '../../support/characters-factories';
import { LYRA_ID } from '../../support/tokens-factories';

const QUELM_CHARACTER_ID = '6e5d4c3b-2a19-4f8e-9d7c-6b5a4f3e2d1c';
const ON_TORRE = { sceneId: VHARN_TORRE_ID };

describe('TokenLinkService', () => {
  let table: CharacterTableFake;
  let service: TokenLinkService;

  beforeEach(() => {
    table = new CharacterTableFake();
    table.tokens.rows.push(kaelRow());
    const { members, publisher, clock } = table;
    service = new TokenLinkService({
      members,
      transaction: table.transaction.run,
      publisher,
      clock,
    });
  });

  describe('link to a character', () => {
    it('locks the characters before the grid and bumps the grid alone (the character does not change)', async () => {
      const version = await service.link(ANA_ID, VHARN_ID, {
        ...{ ...ON_TORRE, tokenId: KAEL_ID, characterId: LYRA_CHARACTER_ID },
      });

      expect(version).toBe(8);
      expect(table.journal).toEqual([
        'lock characters',
        `lockInCampaign:${VHARN_TORRE_ID}`,
        'adopt',
        'bump',
        'commit',
        'publish',
      ]);
      expect(table.characterPublisher.changes).toEqual([]);
    });

    it('Kael adopts Lyra: her identity, bars and control; his own PV, control and Envenenado go', async () => {
      table.poison(KAEL_ID);

      await service.link(ANA_ID, VHARN_ID, {
        ...{ ...ON_TORRE, tokenId: KAEL_ID, characterId: LYRA_CHARACTER_ID },
      });

      const stored = table.tokens.rowOf(KAEL_ID);
      expect(stored.token).toMatchObject({ characterId: LYRA_CHARACTER_ID });
      expect(stored.bars).toEqual([]);
      expect(stored.controllerIds).toEqual([]);
      expect(table.conditions.active).toEqual([]);
      const [updated] = table.publisher.tokenChanges;
      expect(updated).toMatchObject({ name: 'token:updated', sceneId: VHARN_TORRE_ID });
      expect(updated?.privileged).toMatchObject({ version: 8 });
      expect(updated?.privileged.token).toMatchObject({
        ...{ id: KAEL_ID, name: 'Lyra', characterId: LYRA_CHARACTER_ID },
        ...{ controllerIds: [BIA_ID], conditions: [] },
      });
      expect(updated?.privileged.token.bars.map(({ current }) => current)).toEqual([32, 1]);
      expect(updated?.others.token.bars.map(({ label }) => label)).toEqual(['Inspiração']);
    });

    it('a second token of the character in the same grid is CHARACTER_ALREADY_PLACED, nothing written', async () => {
      table.tokens.rows.push(linkedLyraRow());

      const linking = service.link(ANA_ID, VHARN_ID, {
        ...{ ...ON_TORRE, tokenId: KAEL_ID, characterId: LYRA_CHARACTER_ID },
      });

      await expect(linking).rejects.toMatchObject({
        code: 'CHARACTER_ALREADY_PLACED',
        placedTokenId: ESTRADA_LYRA_ID,
      });
      expect(table.journal).toEqual(['lock characters', `lockInCampaign:${VHARN_TORRE_ID}`]);
    });

    it('a token that already wears a character is CHARACTER_ALREADY_PLACED, even for another one', async () => {
      table.tokens.rows.push(linkedLyraRow());
      const other = {
        ...lyraCharacterRow(),
        character: characterPo({ id: KAEL_ID, userId: CAIO_ID }),
      };
      table.characters.rows.push(other);

      const linking = service.link(ANA_ID, VHARN_ID, {
        ...{ ...ON_TORRE, tokenId: ESTRADA_LYRA_ID, characterId: KAEL_ID },
      });

      await expect(linking).rejects.toMatchObject({ code: 'CHARACTER_ALREADY_PLACED' });
      expect(table.tokens.rowOf(ESTRADA_LYRA_ID).token.characterId).toBe(LYRA_CHARACTER_ID);
    });

    it('a character of Quelm is CHARACTER_NOT_FOUND, nothing written', async () => {
      const quelm = characterPo({ id: QUELM_CHARACTER_ID, campaignId: QUELM_ID, userId: CAIO_ID });
      table.characters.rows.push({ ...lyraCharacterRow(), character: quelm });

      const linking = service.link(ANA_ID, VHARN_ID, {
        ...{ ...ON_TORRE, tokenId: KAEL_ID, characterId: QUELM_CHARACTER_ID },
      });

      await expect(linking).rejects.toMatchObject({ code: 'CHARACTER_NOT_FOUND' });
      expect(table.tokens.rowOf(KAEL_ID).token.characterId).toBeNull();
      expect(table.journal).not.toContain('adopt');
    });

    it('Bia, a player, linking is FORBIDDEN before any lock', async () => {
      const linking = service.link(BIA_ID, VHARN_ID, {
        ...{ tokenId: LYRA_ID, characterId: LYRA_CHARACTER_ID },
      });

      await expect(linking).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(table.journal).toEqual([]);
    });

    it('a token of Quelm is TOKEN_NOT_FOUND', async () => {
      const linking = service.link(ANA_ID, VHARN_ID, {
        ...{ tokenId: QUELM_TOKEN_ID, characterId: LYRA_CHARACTER_ID },
      });

      await expect(linking).rejects.toMatchObject({ code: 'TOKEN_NOT_FOUND' });
    });
  });

  describe('unlink', () => {
    beforeEach(() => {
      table.tokens.rows.push(linkedLyraRow());
    });

    it('the token keeps a copy of what it wore: identity, bars (new ids), control and conditions', async () => {
      const [lyra] = table.characters.rows;
      if (!lyra) throw new Error('the table has no Lyra');
      const wounded = lyra.bars.map((bar, index) => (index === 0 ? { ...bar, current: 20 } : bar));
      table.characters.rows[0] = { ...lyra, bars: wounded };
      table.conditions.active.push(heldPoison(table));

      const version = await service.unlink(ANA_ID, VHARN_ID, {
        ...{ ...ON_TORRE, tokenId: ESTRADA_LYRA_ID },
      });

      expect(version).toBe(8);
      const unlinked = table.tokens.rowOf(ESTRADA_LYRA_ID);
      expect(unlinked.token).toMatchObject({
        characterId: null,
        name: 'Lyra',
      });
      expect(unlinked.bars.map(({ current }) => current)).toEqual([20, 1]);
      expect(unlinked.bars.map(({ id }) => id)).not.toContain(wounded[0]?.id);
      expect(unlinked.controllerIds).toEqual([BIA_ID]);
      const holders = table.conditions.active.map(
        ({ tokenId, characterId }) => tokenId ?? characterId,
      );
      expect(holders).toEqual([LYRA_CHARACTER_ID, ESTRADA_LYRA_ID]);
      expect(table.characters.rows[0]?.bars).toHaveLength(2);
    });

    it('bumps the grid alone and publishes token:updated of the loose token', async () => {
      await service.unlink(ANA_ID, VHARN_ID, { ...ON_TORRE, tokenId: ESTRADA_LYRA_ID });

      expect(table.journal).toEqual([
        'lock characters',
        `lockInCampaign:${VHARN_TORRE_ID}`,
        'release',
        'bump',
        'commit',
        'publish',
      ]);
      const [updated] = table.publisher.tokenChanges;
      expect(updated?.privileged.token).toMatchObject({ id: ESTRADA_LYRA_ID, characterId: null });
    });

    it('an unlinked token is TOKEN_NOT_LINKED, nothing written', async () => {
      const unlinking = service.unlink(ANA_ID, VHARN_ID, { tokenId: LYRA_ID });

      await expect(unlinking).rejects.toMatchObject({ code: 'TOKEN_NOT_LINKED' });
      expect(table.journal).not.toContain('release');
    });

    it('Caio, a player, unlinking is FORBIDDEN before any lock', async () => {
      const unlinking = service.unlink(CAIO_ID, VHARN_ID, {
        ...ON_TORRE,
        tokenId: ESTRADA_LYRA_ID,
      });

      await expect(unlinking).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(table.journal).toEqual([]);
    });
  });
});

// Envenenado held by Lyra the character, not by a token.
function heldPoison(table: CharacterTableFake): ActiveConditionRow {
  table.poison(LYRA_CHARACTER_ID);
  const [poison] = table.conditions.active.splice(0);
  if (!poison) throw new Error('the poison was not applied');
  return { ...poison, tokenId: null, characterId: LYRA_CHARACTER_ID };
}
