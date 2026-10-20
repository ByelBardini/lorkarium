import { beforeEach, describe, expect, it } from 'vitest';
import { LightsService } from '../../../src/modules/lights/lights.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, QUELM_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { LightsDaoFake, LightTransactionRunnerFake } from '../../support/lights-fakes';
import {
  BRAZIER_ID,
  CORRIDOR_TORCH_ID,
  corridorTorchPo,
  newTorch,
} from '../../support/lights-factories';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';

const NOW = new Date('2026-10-18T21:00:00Z');
const QUELM_SCENE_ID = 'quelm-scene';
const QUELM_TORCH_ID = 'e6f7a8b9-c0d1-4e2f-8a3b-4c5d6e7f8091';
const CANDLE_ID = 'f7a8b9c0-d1e2-4f3a-9b4c-5d6e7f809102';

describe('LightsService', () => {
  let scenes: ScenesDaoFake;
  let lights: LightsDaoFake;
  let publisher: BoardPublisherFake;
  let service: LightsService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(
      new CampaignsDaoFake(),
      { [ANA_ID]: 'Ana', [BIA_ID]: 'Bia' },
      [
        campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
        campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      ],
    );
    scenes = new ScenesDaoFake([
      scenePo({ version: 4 }),
      scenePo({ id: QUELM_SCENE_ID, campaignId: QUELM_ID }),
    ]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    lights = new LightsDaoFake(scenes.journal, [
      corridorTorchPo(),
      corridorTorchPo({ id: BRAZIER_ID, x: '10.00', lightOrder: 2 }),
      corridorTorchPo({ id: QUELM_TORCH_ID, sceneId: QUELM_SCENE_ID }),
    ]);
    publisher = new BoardPublisherFake(scenes.journal);
    service = new LightsService({
      members,
      transaction: new LightTransactionRunnerFake(scenes, lights).run,
      publisher,
      clock: new ClockFake(NOW),
      limit: 100,
    });
  });

  function lightOf(lightId: string) {
    return lights.rows.find(({ id }) => id === lightId);
  }

  describe('createMany', () => {
    it('Ana creating locks, saves and bumps, then publishes after the commit', async () => {
      const created = await service.createMany(ANA_ID, VHARN_ID, { lights: [newTorch()] });

      expect(created).toEqual({ version: 5, createdIds: ['light-4'] });
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
    });

    it('light:createdMany carries the saved torch, lit, to the table', async () => {
      await service.createMany(ANA_ID, VHARN_ID, { lights: [newTorch()] });

      expect(publisher.lightsCreates[0]).toEqual({
        campaignId: VHARN_ID,
        version: 5,
        at: NOW.toISOString(),
        lights: [{ id: 'light-4', x: 5.5, y: 3, bright: 4, dim: 4, lit: true, color: null }],
      });
    });

    it('Bia (player) creating is FORBIDDEN and nothing is saved', async () => {
      const create = service.createMany(BIA_ID, VHARN_ID, { lights: [newTorch()] });

      await expect(create).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(scenes.journal).toEqual([]);
    });

    it('a light past the edge of the scene is OUT_OF_SCENE and none is saved', async () => {
      const create = service.createMany(ANA_ID, VHARN_ID, {
        lights: [newTorch(), newTorch({ x: 20.5 })],
      });

      await expect(create).rejects.toMatchObject({ code: 'OUT_OF_SCENE' });
      expect(scenes.journal).toEqual(['lock']);
    });

    it('a 101st light on the scene is LIGHT_LIMIT', async () => {
      lights.fill(98, VHARN_SCENE_ID);

      const create = service.createMany(ANA_ID, VHARN_ID, { lights: [newTorch()] });

      await expect(create).rejects.toMatchObject({ code: 'LIGHT_LIMIT' });
    });
  });

  describe('moveMany', () => {
    it('a light of Quelm in the middle of three is LIGHT_NOT_FOUND and none moves', async () => {
      const moves = [CORRIDOR_TORCH_ID, QUELM_TORCH_ID, BRAZIER_ID].map((lightId) => ({
        lightId,
        x: 1,
        y: 1,
      }));

      const move = service.moveMany(ANA_ID, VHARN_ID, { moves });

      await expect(move).rejects.toMatchObject({
        code: 'LIGHT_NOT_FOUND',
        message: expect.stringContaining(QUELM_TORCH_ID),
      });
      expect(lightOf(CORRIDOR_TORCH_ID)?.x).toBe('5.00');
      expect(scenes.journal).toEqual(['lock']);
    });

    it('a move to (7.125, 1) saves and publishes it to the hundredth', async () => {
      await service.moveMany(ANA_ID, VHARN_ID, {
        moves: [{ lightId: CORRIDOR_TORCH_ID, x: 7.125, y: 1 }],
      });

      expect(lightOf(CORRIDOR_TORCH_ID)).toMatchObject({ x: '7.13', y: '1.00' });
      expect(publisher.lightsMoves[0]?.moves).toEqual([
        { lightId: CORRIDOR_TORCH_ID, x: 7.13, y: 1 },
      ]);
    });

    it('a move past the edge of the scene is OUT_OF_SCENE', async () => {
      const move = service.moveMany(ANA_ID, VHARN_ID, {
        moves: [{ lightId: CORRIDOR_TORCH_ID, x: 3, y: 12.5 }],
      });

      await expect(move).rejects.toMatchObject({ code: 'OUT_OF_SCENE' });
    });

    it('an undo expecting the torch where it no longer is is STALE_UNDO', async () => {
      const move = service.moveMany(ANA_ID, VHARN_ID, {
        moves: [{ lightId: CORRIDOR_TORCH_ID, x: 1, y: 1, expect: { x: 2, y: 2 } }],
      });

      await expect(move).rejects.toMatchObject({ code: 'STALE_UNDO' });
    });
  });

  describe('setRangeMany', () => {
    it('a new range saves only bright and dim and publishes light:rangesChanged', async () => {
      await service.setRangeMany(ANA_ID, VHARN_ID, {
        changes: [{ lightId: CORRIDOR_TORCH_ID, bright: 6, dim: 10 / 3 }],
      });

      expect(lightOf(CORRIDOR_TORCH_ID)).toMatchObject({ bright: '6.00', dim: '3.33', x: '5.00' });
      expect(publisher.lightRangeChanges[0]?.changes).toEqual([
        { lightId: CORRIDOR_TORCH_ID, bright: 6, dim: 3.33 },
      ]);
    });

    it('an undo expecting another range is STALE_UNDO', async () => {
      const change = service.setRangeMany(ANA_ID, VHARN_ID, {
        changes: [{ lightId: CORRIDOR_TORCH_ID, bright: 2, dim: 2, expect: { bright: 6, dim: 6 } }],
      });

      await expect(change).rejects.toMatchObject({ code: 'STALE_UNDO' });
    });
  });

  describe('setColorMany', () => {
    it('Ana coloring the torch locks, saves only the color, bumps and then publishes without expect', async () => {
      const version = await service.setColorMany(ANA_ID, VHARN_ID, {
        changes: [{ lightId: CORRIDOR_TORCH_ID, color: 'fire', expect: { color: null } }],
      });

      expect(version).toBe(5);
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
      expect(lightOf(CORRIDOR_TORCH_ID)).toMatchObject({ color: 'fire', x: '5.00', lit: true });
      expect(publisher.lightColorChanges).toEqual([
        {
          campaignId: VHARN_ID,
          version: 5,
          at: NOW.toISOString(),
          changes: [{ lightId: CORRIDOR_TORCH_ID, color: 'fire' }],
        },
      ]);
    });

    it('Bia (player) coloring is FORBIDDEN before the lock and nothing is saved', async () => {
      const change = service.setColorMany(BIA_ID, VHARN_ID, {
        changes: [{ lightId: CORRIDOR_TORCH_ID, color: 'fire' }],
      });

      await expect(change).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(scenes.journal).toEqual([]);
    });

    it('the second of three ids off the scene is LIGHT_NOT_FOUND and none is colored', async () => {
      const change = service.setColorMany(ANA_ID, VHARN_ID, {
        changes: [CORRIDOR_TORCH_ID, QUELM_TORCH_ID, BRAZIER_ID].map((lightId) => ({
          lightId,
          color: 'moon' as const,
        })),
      });

      await expect(change).rejects.toMatchObject({ code: 'LIGHT_NOT_FOUND' });
      expect([lightOf(CORRIDOR_TORCH_ID)?.color, lightOf(BRAZIER_ID)?.color]).toEqual([null, null]);
    });

    it('an undo expecting torch on a neutral light is STALE_UNDO, nothing saved nor published', async () => {
      const change = service.setColorMany(ANA_ID, VHARN_ID, {
        changes: [{ lightId: CORRIDOR_TORCH_ID, color: null, expect: { color: 'torch' } }],
      });

      await expect(change).rejects.toMatchObject({ code: 'STALE_UNDO' });
      expect(scenes.journal).not.toContain('save');
      expect(publisher.lightColorChanges).toEqual([]);
    });

    it('three lights colored at once publish one light:colorsChanged', async () => {
      lights.rows.push(corridorTorchPo({ id: CANDLE_ID, lightOrder: 3 }));

      await service.setColorMany(ANA_ID, VHARN_ID, {
        changes: [CORRIDOR_TORCH_ID, BRAZIER_ID, CANDLE_ID].map((lightId) => ({
          lightId,
          color: 'arcane' as const,
        })),
      });

      expect(publisher.lightColorChanges.map(({ changes }) => changes.length)).toEqual([3]);
    });
  });

  describe('setLitMany', () => {
    it('putting out two lights saves and publishes light:litChanged once', async () => {
      await service.setLitMany(ANA_ID, VHARN_ID, {
        lightIds: [CORRIDOR_TORCH_ID, BRAZIER_ID],
        lit: false,
      });

      expect([lightOf(CORRIDOR_TORCH_ID)?.lit, lightOf(BRAZIER_ID)?.lit]).toEqual([false, false]);
      expect(publisher.lightLitChanges).toEqual([
        {
          campaignId: VHARN_ID,
          version: 5,
          at: NOW.toISOString(),
          lightIds: [CORRIDOR_TORCH_ID, BRAZIER_ID],
          lit: false,
        },
      ]);
    });

    it('Bia (player) putting out a torch is FORBIDDEN', async () => {
      const putOut = service.setLitMany(BIA_ID, VHARN_ID, {
        lightIds: [CORRIDOR_TORCH_ID],
        lit: false,
      });

      await expect(putOut).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('deleteMany', () => {
    it('deleting the torch removes it and publishes light:deletedMany', async () => {
      await service.deleteMany(ANA_ID, VHARN_ID, { lightIds: [CORRIDOR_TORCH_ID] });

      expect(lightOf(CORRIDOR_TORCH_ID)).toBeUndefined();
      expect(publisher.lightsDeletes[0]?.lightIds).toEqual([CORRIDOR_TORCH_ID]);
    });

    it('an undo expecting the torch elsewhere is STALE_UNDO and nothing is deleted', async () => {
      const remove = service.deleteMany(ANA_ID, VHARN_ID, {
        lightIds: [CORRIDOR_TORCH_ID],
        expect: [{ lightId: CORRIDOR_TORCH_ID, x: 9, y: 9 }],
      });

      await expect(remove).rejects.toMatchObject({ code: 'STALE_UNDO' });
      expect(lightOf(CORRIDOR_TORCH_ID)?.id).toBe(CORRIDOR_TORCH_ID);
    });
  });
});
