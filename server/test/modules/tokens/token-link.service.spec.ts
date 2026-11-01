import { beforeEach, describe, expect, it } from 'vitest';
import { TokenLinkService } from '../../../src/modules/tokens/token-link.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  CharacterTableFake,
  KAEL_ID,
  LYRA_ANCHOR_ID,
  QUELM_TOKEN_ID,
  VHARN_CAST_ID,
  VHARN_SCENE_ID,
  VHARN_TORRE_ID,
  kaelRow,
  linkedLyraRow,
} from '../../support/character-fakes';
import { LYRA_CHARACTER_ID } from '../../support/characters-factories';
import { LYRA_ID } from '../../support/tokens-factories';

describe('TokenLinkService', () => {
  let table: CharacterTableFake;
  let service: TokenLinkService;

  beforeEach(() => {
    table = new CharacterTableFake();
    const { members, publisher, clock } = table;
    service = new TokenLinkService({
      members,
      transaction: table.transaction.run,
      publisher,
      clock,
    });
  });

  describe('the first link of a card', () => {
    it('locks the cast before the grid, creates the anchor, hands over the state and bumps both', async () => {
      table.poison();

      const version = await service.link(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, memberId: BIA_ID });

      expect(version).toBe(5);
      expect(table.journal).toEqual([
        'lock cast',
        'lock',
        'save',
        'move bars',
        'move conditions',
        'move controllers',
        'link',
        'bump cast',
        'save',
        'bump cast',
        'bump',
        'commit',
        'publish',
        'publish',
        'publish',
      ]);
    });

    it('the anchor stands in the cast with Lyra identity, bars, controllers and Envenenado; the card points at it', async () => {
      table.poison();

      await service.link(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, memberId: BIA_ID });

      const anchor = table.tokens.rows.find(({ token }) => token.sceneId === VHARN_CAST_ID);
      expect(anchor?.token).toMatchObject({ name: 'Lyra', initials: 'LY', anchorTokenId: null });
      expect(anchor?.bars.map(({ label }) => label)).toEqual(['PV', 'Inspiração']);
      expect(anchor?.controllerIds).toEqual([BIA_ID]);
      expect(table.conditions.active.map(({ tokenId }) => tokenId)).toEqual([anchor?.token.id]);
      expect(table.tokens.rowOf(LYRA_ID).token).toMatchObject({
        anchorTokenId: anchor?.token.id,
        characterId: LYRA_CHARACTER_ID,
      });
      expect(table.memberCards.rows[0]).toMatchObject({
        userId: BIA_ID,
        anchorTokenId: anchor?.token.id,
      });
    });

    it('publishes token:created of the anchor and member:cardChanged to the cast, token:updated to the grid', async () => {
      await service.link(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, memberId: BIA_ID });

      const [created, updated] = table.publisher.tokenChanges;
      expect(created).toMatchObject({ name: 'token:created', sceneId: VHARN_CAST_ID });
      expect(created?.privileged).toMatchObject({ version: 3, sceneId: VHARN_CAST_ID });
      expect(table.publisher.memberCardChanges).toEqual([
        expect.objectContaining({ sceneId: VHARN_CAST_ID, version: 4 }),
      ]);
      expect(updated).toMatchObject({ name: 'token:updated', sceneId: VHARN_SCENE_ID });
      expect(updated?.privileged.token).toMatchObject({
        id: LYRA_ID,
        anchorTokenId: created?.privileged.token.id,
        controllerIds: [BIA_ID],
      });
      expect(updated?.others.token.bars.map(({ label }) => label)).toEqual(['Inspiração']);
    });
  });

  describe('a card that already has an anchor', () => {
    beforeEach(() => {
      table.withLyraAnchor();
      table.tokens.rows.push(kaelRow());
    });

    it('Kael on the Torre adopts the anchor: his own PV goes, the grid alone gets a version', async () => {
      await service.link(ANA_ID, VHARN_ID, {
        sceneId: VHARN_TORRE_ID,
        tokenId: KAEL_ID,
        memberId: BIA_ID,
      });

      expect(table.journal).toEqual([
        'lock cast',
        `lockInCampaign:${VHARN_TORRE_ID}`,
        'drop state',
        'link',
        'bump',
        'commit',
        'publish',
      ]);
      const [updated] = table.publisher.tokenChanges;
      expect(updated?.privileged.token).toMatchObject({
        id: KAEL_ID,
        name: 'Lyra',
        anchorTokenId: LYRA_ANCHOR_ID,
        characterId: LYRA_CHARACTER_ID,
        controllerIds: [BIA_ID],
      });
      expect(updated?.privileged.token.bars.map(({ current }) => current)).toEqual([32, 1]);
    });

    it('a second token of the character in the same grid is CHARACTER_ALREADY_PLACED, nothing written', async () => {
      table.tokens.rows.push(linkedLyraRow());

      const linking = service.link(ANA_ID, VHARN_ID, {
        sceneId: VHARN_TORRE_ID,
        tokenId: KAEL_ID,
        memberId: BIA_ID,
      });

      await expect(linking).rejects.toMatchObject({ code: 'CHARACTER_ALREADY_PLACED' });
      expect(table.journal).toEqual(['lock cast', `lockInCampaign:${VHARN_TORRE_ID}`]);
    });
  });

  it('a token that already is a character is CHARACTER_ALREADY_PLACED', async () => {
    table.withLyraAnchor();
    table.tokens.rows.push(linkedLyraRow());

    const linking = service.link(ANA_ID, VHARN_ID, {
      sceneId: VHARN_TORRE_ID,
      tokenId: linkedLyraRow().token.id,
      memberId: CAIO_ID,
    });

    await expect(linking).rejects.toMatchObject({ code: 'CHARACTER_ALREADY_PLACED' });
  });

  it('Bia, a player, linking is FORBIDDEN before any lock', async () => {
    const linking = service.link(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, memberId: BIA_ID });

    await expect(linking).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(table.journal).toEqual([]);
  });

  it('the card of the master (not a player) is MEMBER_NOT_FOUND, and so is a stranger', async () => {
    const master = service.link(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, memberId: ANA_ID });
    await expect(master).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });
    const stranger = service.link(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, memberId: 'nobody' });
    await expect(stranger).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });
    expect(table.journal).toEqual([]);
  });

  it('a token of Quelm is TOKEN_NOT_FOUND', async () => {
    const linking = service.link(ANA_ID, VHARN_ID, { tokenId: QUELM_TOKEN_ID, memberId: BIA_ID });

    await expect(linking).rejects.toMatchObject({ code: 'TOKEN_NOT_FOUND' });
  });

  describe('unlink', () => {
    beforeEach(() => {
      table.withLyraAnchor();
      table.tokens.rows.push(linkedLyraRow());
    });

    it('the token keeps a copy of what it wore: the character bars and control, the anchor conditions', async () => {
      table.poison(LYRA_ANCHOR_ID);
      const [lyra] = table.characters.rows;
      if (!lyra) throw new Error('the table has no Lyra');
      const wounded = lyra.bars.map((bar, index) => (index === 0 ? { ...bar, current: 20 } : bar));
      table.characters.rows[0] = { ...lyra, bars: wounded };
      const tokenId = linkedLyraRow().token.id;

      await service.unlink(ANA_ID, VHARN_ID, { sceneId: VHARN_TORRE_ID, tokenId });

      expect(table.journal).toEqual([
        'lock cast',
        `lockInCampaign:${VHARN_TORRE_ID}`,
        'copy state',
        'unlink',
        'save',
        'bump',
        'commit',
        'publish',
      ]);
      const unlinked = table.tokens.rowOf(tokenId);
      expect(unlinked.token).toMatchObject({
        anchorTokenId: null,
        characterId: null,
        name: 'Lyra',
      });
      expect(unlinked.bars.map(({ current }) => current)).toEqual([20, 1]);
      expect(unlinked.controllerIds).toEqual([BIA_ID]);
      const tokenIds = table.conditions.active.map((condition) => condition.tokenId);
      expect(tokenIds).toEqual([LYRA_ANCHOR_ID, tokenId]);
      expect(table.tokens.rowOf(LYRA_ANCHOR_ID).bars).toHaveLength(2);
    });

    it('an unlinked token is TOKEN_NOT_LINKED', async () => {
      const unlinking = service.unlink(ANA_ID, VHARN_ID, { tokenId: LYRA_ID });

      await expect(unlinking).rejects.toMatchObject({ code: 'TOKEN_NOT_LINKED' });
    });
  });
});
