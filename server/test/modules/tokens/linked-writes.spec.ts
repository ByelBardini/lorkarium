import type { BarInputDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConditionsService } from '../../../src/modules/conditions/conditions.service';
import { TokenAppearanceService } from '../../../src/modules/tokens/token-appearance.service';
import { TokensService } from '../../../src/modules/tokens/tokens.service';
import { SceneWallsService } from '../../../src/modules/walls/scene-walls.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
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
import { ConditionTransactionRunnerFake } from '../../support/conditions-fakes';
import { DragGroupsFake, TableTokenRightsFake } from '../../support/tokens-fakes';
import { FIRE_AURA } from '../../support/tokens-factories';

const TORRE = { sceneId: VHARN_TORRE_ID };
const OTHER_ESTRADA_LYRA_ID = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';
const LOCK_TORRE = `lockInCampaign:${VHARN_TORRE_ID}`;
const PV_ANCHOR = `${LYRA_ANCHOR_ID}-pv`;
const VIGOR: BarInputDto = {
  label: 'Vigor',
  current: 9,
  max: 9,
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
    table.withLyraAnchor();
    table.tokens.rows.push(linkedLyraRow(), kaelRow());
    const { members, publisher, clock } = table;
    const transaction = table.transaction.run;
    const dragGroups = new DragGroupsFake(table.scenes, table.tokens);
    const limits = { barLimit: 99_999, tokenLimit: 500, tokenRights: new TableTokenRightsFake() };
    const sceneWalls = new SceneWallsService();
    tokens = new TokensService({
      members,
      transaction,
      dragGroups,
      sceneWalls,
      publisher,
      clock,
      ...limits,
    });
    appearance = new TokenAppearanceService({ members, transaction, publisher, clock });
  });

  const anchor = () => table.tokens.rowOf(LYRA_ANCHOR_ID);
  const torreVersion = () => table.scenes.rows.find(({ id }) => id === VHARN_TORRE_ID)?.version;

  describe('token:adjustBar', () => {
    it('Bia taking 7 PV from Lyra on the Torre writes the anchor PV and bumps the cast alone', async () => {
      const change = { op: 'add', amount: -7 } as const;

      const version = await tokens.adjustBar(BIA_ID, VHARN_ID, {
        ...TORRE,
        tokenId: ESTRADA_LYRA_ID,
        barId: PV_ANCHOR,
        change,
      });

      expect(version).toBe(3);
      expect(table.journal).toEqual([
        LOCK_TORRE,
        'lock cast',
        LOCK_TORRE,
        'save',
        'bump cast',
        'commit',
        'publish',
      ]);
      expect(anchor().bars[0]?.current).toBe(25);
      expect(torreVersion()).toBe(7);
      const [published] = table.publisher.tokenChanges;
      expect(published).toMatchObject({ sceneId: VHARN_CAST_ID, controllerIds: [BIA_ID] });
      expect(published?.privileged).toMatchObject({ version: 3, token: { id: LYRA_ANCHOR_ID } });
    });

    it('Caio on the bar of the linked Lyra is FORBIDDEN: the control is the anchor', async () => {
      const adjusting = tokens.adjustBar(CAIO_ID, VHARN_ID, {
        ...TORRE,
        tokenId: ESTRADA_LYRA_ID,
        barId: PV_ANCHOR,
        change: { op: 'add', amount: -7 },
      });

      await expect(adjusting).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(anchor().bars[0]?.current).toBe(32);
    });
  });

  describe('adjustHolderBar (the bar of a sheet)', () => {
    it('Bia taking 7 PV from the anchor itself locks only the cast and publishes it there', async () => {
      const change = { op: 'add', amount: -7 } as const;

      const version = await tokens.adjustHolderBar(BIA_ID, VHARN_ID, {
        ...{ tokenId: LYRA_ANCHOR_ID, sceneId: null, barId: PV_ANCHOR, change },
      });

      expect(version).toBe(3);
      expect(table.journal).toEqual(['lock cast', 'save', 'bump cast', 'commit', 'publish']);
      expect(anchor().bars[0]?.current).toBe(25);
      const [published] = table.publisher.tokenChanges;
      expect(published).toMatchObject({ sceneId: VHARN_CAST_ID });
      expect(published?.privileged).toMatchObject({ version: 3, token: { id: LYRA_ANCHOR_ID } });
    });

    it('the bar is free above its max but cut at the value limit by the game-core rule', async () => {
      await tokens.adjustHolderBar(BIA_ID, VHARN_ID, {
        ...{ tokenId: LYRA_ANCHOR_ID, sceneId: null, barId: PV_ANCHOR },
        change: { op: 'add', amount: 150_000 },
      });

      expect(anchor().bars[0]?.current).toBe(99_999);
    });

    it('Caio on the anchor bar is FORBIDDEN and nothing is published', async () => {
      const adjusting = tokens.adjustHolderBar(CAIO_ID, VHARN_ID, {
        ...{ tokenId: LYRA_ANCHOR_ID, sceneId: null, barId: PV_ANCHOR },
        change: { op: 'add', amount: -7 },
      });

      await expect(adjusting).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(table.publisher.tokenChanges).toEqual([]);
    });

    it('a bar of another token is BAR_NOT_FOUND', async () => {
      const adjusting = tokens.adjustHolderBar(BIA_ID, VHARN_ID, {
        ...{ tokenId: LYRA_ANCHOR_ID, sceneId: null, barId: `${KAEL_ID}-pv` },
        change: { op: 'add', amount: -7 },
      });

      await expect(adjusting).rejects.toMatchObject({ code: 'BAR_NOT_FOUND' });
    });

    it('a holder on a grid goes the way of token:adjustBar on that grid', async () => {
      await tokens.adjustHolderBar(BIA_ID, VHARN_ID, {
        ...{ tokenId: ESTRADA_LYRA_ID, sceneId: VHARN_TORRE_ID, barId: PV_ANCHOR },
        change: { op: 'add', amount: -7 },
      });

      expect(table.journal[0]).toBe(LOCK_TORRE);
      expect(anchor().bars[0]?.current).toBe(25);
    });
  });

  describe('token:update', () => {
    it('name, initials, side, bars and controllers go to the anchor; sight and size stay on the token', async () => {
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

      expect(anchor().token).toMatchObject({ name: 'Lyra Vento', initials: 'LV', width: 1 });
      expect(anchor().bars.map(({ label }) => label)).toEqual(['Vigor']);
      expect(anchor().controllerIds).toEqual([CAIO_ID]);
      const own = table.tokens.rowOf(ESTRADA_LYRA_ID);
      expect(own.token).toMatchObject({ width: 2, height: 2, sightBright: '6.00', name: 'Lyra' });
      expect(own.bars).toEqual([]);
      expect(table.publisher.tokenChanges.map(({ sceneId }) => sceneId)).toEqual([
        VHARN_CAST_ID,
        VHARN_TORRE_ID,
      ]);
      expect(table.journal.filter((entry) => entry.startsWith('bump'))).toEqual([
        'bump cast',
        'bump',
      ]);
    });
  });

  describe('token:restyleMany', () => {
    it('the defeat mark goes to the anchor and the flip stays on the token: one event each', async () => {
      await appearance.restyleMany(BIA_ID, VHARN_ID, {
        ...TORRE,
        tokenIds: [ESTRADA_LYRA_ID],
        style: { defeated: true, flipX: true },
      });

      expect(anchor().token).toMatchObject({ defeated: true, flipX: false });
      expect(table.tokens.rowOf(ESTRADA_LYRA_ID).token).toMatchObject({
        defeated: false,
        flipX: true,
      });
      expect(table.publisher.tokensRestylings).toEqual([
        expect.objectContaining({
          sceneId: VHARN_CAST_ID,
          tokenIds: [LYRA_ANCHOR_ID],
          style: { defeated: true },
        }),
        expect.objectContaining({
          sceneId: VHARN_TORRE_ID,
          tokenIds: [ESTRADA_LYRA_ID],
          style: { flipX: true },
        }),
      ]);
    });

    it('putting out the light of the linked Lyra is the grid alone: the cast is not locked', async () => {
      await appearance.restyleMany(BIA_ID, VHARN_ID, {
        ...TORRE,
        tokenIds: [ESTRADA_LYRA_ID],
        style: { lightLit: false },
      });

      expect(table.journal).toEqual([LOCK_TORRE, 'save', 'bump', 'commit', 'publish']);
      expect(anchor().token.lightLit).toBe(true);
    });

    it('an aura on the linked Lyra is written on the anchor and published to the cast alone', async () => {
      await appearance.restyleMany(BIA_ID, VHARN_ID, {
        ...TORRE,
        tokenIds: [ESTRADA_LYRA_ID],
        style: { aura: FIRE_AURA },
      });

      expect(anchor().token).toMatchObject({ auraKind: 'effect', auraEffect: 'fire' });
      expect(table.tokens.rowOf(ESTRADA_LYRA_ID).token.auraKind).toBeNull();
      expect(table.publisher.tokensRestylings).toEqual([
        expect.objectContaining({
          sceneId: VHARN_CAST_ID,
          tokenIds: [LYRA_ANCHOR_ID],
          style: { aura: FIRE_AURA },
        }),
      ]);
    });

    it('a group of the linked Lyra and the unlinked Kael: Kael takes the whole style', async () => {
      await appearance.restyleMany(ANA_ID, VHARN_ID, {
        ...TORRE,
        tokenIds: [ESTRADA_LYRA_ID, KAEL_ID],
        style: { frame: 'round' },
      });

      expect(anchor().token.frame).toBe('round');
      expect(table.tokens.rowOf(KAEL_ID).token.frame).toBe('round');
      expect(table.tokens.rowOf(ESTRADA_LYRA_ID).token.frame).toBe('square');
    });
  });

  describe('conditions', () => {
    let conditions: ConditionsService;
    let envenenado: string;

    beforeEach(() => {
      const { members, publisher, clock } = table;
      const runner = new ConditionTransactionRunnerFake(
        table.scenes,
        table.tokens,
        table.conditions,
        table.combat,
      );
      conditions = new ConditionsService({ members, transaction: runner.run, publisher, clock });
      envenenado = table.conditions.define(VHARN_ID, 'Envenenado', 'harm');
    });

    it('Envenenado on the linked Lyra lands on the anchor, as an event of the cast', async () => {
      await conditions.apply(BIA_ID, VHARN_ID, {
        ...TORRE,
        tokenId: ESTRADA_LYRA_ID,
        conditionId: envenenado,
        rounds: 2,
      });

      expect(table.conditions.active.map(({ tokenId }) => tokenId)).toEqual([LYRA_ANCHOR_ID]);
      expect(table.publisher.conditionEvents).toEqual([
        expect.objectContaining({ sceneId: VHARN_CAST_ID, version: 3, tokenId: LYRA_ANCHOR_ID }),
      ]);
      expect(torreVersion()).toBe(7);
    });

    it('a group of the linked Lyra and Kael: the anchor in an event of the cast, Kael in one of the grid', async () => {
      await conditions.applyMany(ANA_ID, VHARN_ID, {
        ...TORRE,
        tokenIds: [ESTRADA_LYRA_ID, KAEL_ID],
        conditionId: envenenado,
        rounds: 0,
      });

      const applies = table.publisher.conditionsApplies;
      expect(applies.map(({ sceneId }) => sceneId)).toEqual([VHARN_CAST_ID, VHARN_TORRE_ID]);
      expect(applies[0]?.applied.map(({ tokenId }) => tokenId)).toEqual([LYRA_ANCHOR_ID]);
      expect(applies[1]?.applied.map(({ tokenId }) => tokenId)).toEqual([KAEL_ID]);
      expect(table.journal.filter((entry) => entry.startsWith('bump'))).toEqual([
        'bump cast',
        'bump',
      ]);
    });

    it('two tokens linked to the same anchor in one group add 1 stack to it, not 2', async () => {
      const sangrando = table.conditions.define(
        VHARN_ID,
        'Sangrando',
        'harm',
        'droplet',
        null,
        '',
        5,
      );
      table.tokens.rows.push(linkedLyraRow({ id: OTHER_ESTRADA_LYRA_ID, col: 9 }));
      const tokenIds = [ESTRADA_LYRA_ID, OTHER_ESTRADA_LYRA_ID];
      const command = { ...TORRE, tokenIds, conditionId: sangrando, rounds: 0 };

      await conditions.applyMany(ANA_ID, VHARN_ID, command);
      await conditions.applyMany(ANA_ID, VHARN_ID, command);

      expect(table.conditions.active.map(({ tokenId, stacks }) => [tokenId, stacks])).toEqual([
        [LYRA_ANCHOR_ID, 2],
      ]);
    });

    it('setting 3 stacks on the linked Lyra writes the anchor condition, as an event of the cast', async () => {
      const sangrando = table.conditions.define(
        VHARN_ID,
        'Sangrando',
        'harm',
        'droplet',
        null,
        '',
        5,
      );
      const onLyra = { ...TORRE, tokenId: ESTRADA_LYRA_ID };
      await conditions.apply(BIA_ID, VHARN_ID, { ...onLyra, conditionId: sangrando, rounds: 0 });
      const activeConditionId = table.conditions.active[0]?.id ?? '';

      await conditions.setStacks(BIA_ID, VHARN_ID, { ...onLyra, activeConditionId, stacks: 3 });

      expect(table.conditions.active[0]).toMatchObject({ tokenId: LYRA_ANCHOR_ID, stacks: 3 });
      expect(table.publisher.conditionEvents.at(-1)).toMatchObject({
        sceneId: VHARN_CAST_ID,
        tokenId: LYRA_ANCHOR_ID,
      });
    });

    it('removing and counting rounds of the linked Lyra work on the anchor condition', async () => {
      const activeId = table.poison(LYRA_ANCHOR_ID);
      const command = { ...TORRE, tokenId: ESTRADA_LYRA_ID, activeConditionId: activeId };

      await conditions.setRounds(BIA_ID, VHARN_ID, { ...command, rounds: 5 });
      expect(table.conditions.active[0]).toMatchObject({ remainingRounds: 5 });
      await conditions.remove(BIA_ID, VHARN_ID, command);

      expect(table.conditions.active).toEqual([]);
      expect(table.publisher.conditionEvents.map(({ sceneId }) => sceneId)).toEqual([
        VHARN_CAST_ID,
        VHARN_CAST_ID,
      ]);
    });
  });
});
