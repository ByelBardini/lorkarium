import type { BarInputDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { TokenAppearanceService } from '../../../src/modules/tokens/token-appearance.service';
import { TokensService } from '../../../src/modules/tokens/tokens.service';
import { SceneWallsService } from '../../../src/modules/walls/scene-walls.service';
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
import { DragGroupsFake, TableTokenRightsFake } from '../../support/tokens-fakes';
import { FIRE_AURA } from '../../support/tokens-factories';

const TORRE = { sceneId: VHARN_TORRE_ID };
const LOCK_TORRE = `lockInCampaign:${VHARN_TORRE_ID}`;
const PV = `${LYRA_CHARACTER_ID}-pv`;
const VIGOR: BarInputDto = {
  label: 'Vigor',
  current: 9,
  max: 9,
  temp: 0,
  color: 'moss',
  visibility: 'everyone',
  display: 'number',
};

describe('writes on a token linked to a character', () => {
  let table: CharacterTableFake;
  let tokens: TokensService;
  let appearance: TokenAppearanceService;

  beforeEach(() => {
    table = new CharacterTableFake();
    table.tokens.rows.push(linkedLyraRow(), kaelRow());
    const { members, publisher, characterPublisher, clock } = table;
    const transaction = table.transaction.run;
    const dragGroups = new DragGroupsFake(table.scenes, table.tokens);
    const limits = { barLimit: 99_999, tokenLimit: 500, tokenRights: new TableTokenRightsFake() };
    const sceneWalls = new SceneWallsService();
    const outlets = { publisher, characterPublisher, clock };
    tokens = new TokensService({
      members,
      transaction,
      dragGroups,
      sceneWalls,
      ...outlets,
      ...limits,
    });
    appearance = new TokenAppearanceService({ members, transaction, ...outlets });
  });

  const lyra = () => table.characters.rows[0];
  const torreVersion = () => table.scenes.rows.find(({ id }) => id === VHARN_TORRE_ID)?.version;
  const charactersVersion = () => table.characters.versions[VHARN_ID];

  describe('token:adjustBar', () => {
    it('Bia taking 7 PV from Lyra on the Torre writes the character PV and bumps the characters alone', async () => {
      const change = { op: 'add', amount: -7 } as const;

      const version = await tokens.adjustBar(BIA_ID, VHARN_ID, {
        ...TORRE,
        tokenId: ESTRADA_LYRA_ID,
        barId: PV,
        change,
      });

      expect(version).toBe(6);
      expect(table.journal).toEqual([
        LOCK_TORRE,
        'lock characters',
        LOCK_TORRE,
        'set bar',
        'bump characters',
        'commit',
        'publish',
      ]);
      expect(lyra()?.bars[0]?.current).toBe(25);
      expect(torreVersion()).toBe(7);
      expect(table.publisher.tokenChanges).toEqual([]);
      const [published] = table.characterPublisher.changes;
      expect(published).toMatchObject({ campaignId: VHARN_ID, version: 6 });
      expect(published?.characters.map(({ privileged }) => privileged.bars[0]?.current)).toEqual([
        25,
      ]);
    });

    it('Caio on the bar of the linked Lyra is FORBIDDEN: the control is the character', async () => {
      const adjusting = tokens.adjustBar(CAIO_ID, VHARN_ID, {
        ...TORRE,
        tokenId: ESTRADA_LYRA_ID,
        barId: PV,
        change: { op: 'add', amount: -7 },
      });

      await expect(adjusting).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(lyra()?.bars[0]?.current).toBe(32);
      expect(charactersVersion()).toBe(5);
      expect(table.characterPublisher.changes).toEqual([]);
    });

    it('a bar of the unlinked Kael stays on the grid: the characters are never locked', async () => {
      await tokens.adjustBar(CAIO_ID, VHARN_ID, {
        ...TORRE,
        tokenId: KAEL_ID,
        barId: `${KAEL_ID}-pv`,
        change: { op: 'add', amount: -3 },
      });

      expect(table.journal).toEqual([LOCK_TORRE, 'save', 'bump', 'commit', 'publish']);
      expect(table.tokens.rowOf(KAEL_ID).bars[0]?.current).toBe(7);
      expect(table.characterPublisher.changes).toEqual([]);
    });
  });

  describe('token:update', () => {
    it('name, initials, side, bars and controllers go to the character; sight and size stay on the token', async () => {
      await tokens.update(ANA_ID, VHARN_ID, {
        ...TORRE,
        tokenId: ESTRADA_LYRA_ID,
        name: 'Lyra Vento',
        initials: 'LV',
        side: 'neutral',
        width: 2,
        height: 2,
        controllerIds: [CAIO_ID],
        bars: [VIGOR],
        sight: { bright: 6, dim: 2 },
      });

      expect(lyra()?.character).toMatchObject({ name: 'Lyra Vento', initials: 'LV', width: 1 });
      expect(lyra()?.bars.map(({ label }) => label)).toEqual(['Vigor']);
      expect(lyra()?.controllerIds).toEqual([CAIO_ID]);
      const own = table.tokens.rowOf(ESTRADA_LYRA_ID);
      expect(own.token).toMatchObject({ width: 2, height: 2, sightBright: '6.00', name: 'Lyra' });
      expect(own.bars).toEqual([]);
      expect(table.characterPublisher.changes.map(({ version }) => version)).toEqual([6]);
      expect(table.publisher.tokenChanges.map(({ sceneId }) => sceneId)).toEqual([VHARN_TORRE_ID]);
      expect(table.journal.filter((entry) => entry.startsWith('bump'))).toEqual([
        'bump characters',
        'bump',
      ]);
    });

    it('the grid event carries Lyra composed: the character name over her own sight', async () => {
      await tokens.update(ANA_ID, VHARN_ID, {
        ...{ ...TORRE, tokenId: ESTRADA_LYRA_ID, name: 'Lyra Vento', initials: 'LV' },
        ...{ side: 'ally', width: 1, height: 1, controllerIds: [BIA_ID], bars: [VIGOR] },
        sight: { bright: 6, dim: 2 },
      });

      const [change] = table.publisher.tokenChanges;
      expect(change?.privileged.token).toMatchObject({
        name: 'Lyra Vento',
        characterId: LYRA_CHARACTER_ID,
        sight: { bright: 6, dim: 2 },
      });
    });
  });

  describe('token:restyleMany', () => {
    it('the defeat mark goes to the character and the flip stays on the token: one event each', async () => {
      await appearance.restyleMany(BIA_ID, VHARN_ID, {
        ...TORRE,
        tokenIds: [ESTRADA_LYRA_ID],
        style: { defeated: true, flipX: true },
      });

      expect(lyra()?.character.defeated).toBe(true);
      expect(table.tokens.rowOf(ESTRADA_LYRA_ID).token).toMatchObject({
        defeated: false,
        flipX: true,
      });
      const [change] = table.characterPublisher.changes;
      expect(change?.version).toBe(6);
      expect(change?.characters.map(({ privileged }) => privileged.defeated)).toEqual([true]);
      expect(table.publisher.tokensRestylings).toEqual([
        expect.objectContaining({
          sceneId: VHARN_TORRE_ID,
          tokenIds: [ESTRADA_LYRA_ID],
          style: { flipX: true },
        }),
      ]);
    });

    it('putting out the light of the linked Lyra is the grid alone: the characters are not locked', async () => {
      await appearance.restyleMany(BIA_ID, VHARN_ID, {
        ...TORRE,
        tokenIds: [ESTRADA_LYRA_ID],
        style: { lightLit: false },
      });

      expect(table.journal).toEqual([LOCK_TORRE, 'save', 'bump', 'commit', 'publish']);
      expect(table.characterPublisher.changes).toEqual([]);
    });

    it('an aura on the linked Lyra is written on the character and the grid gets no restyle', async () => {
      await appearance.restyleMany(BIA_ID, VHARN_ID, {
        ...TORRE,
        tokenIds: [ESTRADA_LYRA_ID],
        style: { aura: FIRE_AURA },
      });

      expect(lyra()?.character).toMatchObject({ auraKind: 'effect', auraEffect: 'fire' });
      expect(table.tokens.rowOf(ESTRADA_LYRA_ID).token.auraKind).toBeNull();
      expect(table.publisher.tokensRestylings).toEqual([]);
      expect(torreVersion()).toBe(7);
    });

    it('a group of the linked Lyra and the unlinked Kael: Kael takes the whole style', async () => {
      await appearance.restyleMany(ANA_ID, VHARN_ID, {
        ...TORRE,
        tokenIds: [ESTRADA_LYRA_ID, KAEL_ID],
        style: { frame: 'round' },
      });

      expect(lyra()?.character.frame).toBe('round');
      expect(table.tokens.rowOf(KAEL_ID).token.frame).toBe('round');
      expect(table.tokens.rowOf(ESTRADA_LYRA_ID).token.frame).toBe('square');
      expect(table.characterPublisher.changes).toHaveLength(1);
      expect(table.publisher.tokensRestylings).toEqual([
        expect.objectContaining({ tokenIds: [KAEL_ID], style: { frame: 'round' } }),
      ]);
    });
  });
});
