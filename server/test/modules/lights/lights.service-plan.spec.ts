import { beforeEach, describe, expect, it } from 'vitest';
import { LightsService } from '../../../src/modules/lights/lights.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { LightsDaoFake, LightTransactionRunnerFake } from '../../support/lights-fakes';
import { corridorTorchPo, newTorch } from '../../support/lights-factories';
import { planAccount } from '../../support/plan-account-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';

const NOW = new Date('2026-11-18T21:00:00Z');
const OTHER_SCENE_ID = 'cripta-scene';

function lightId(index: number): string {
  return `light-${index + 1}`;
}

/** `count` torches on the scene, in creation order: the 1st is light-1 (rank 0). */
function torchesOn(sceneId: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    corridorTorchPo({ id: lightId(index), sceneId, lightOrder: index + 1 }),
  );
}

describe('LightsService past the plan of the table (free: 10 lights, 3 grids)', () => {
  let scenes: ScenesDaoFake;
  let lights: LightsDaoFake;
  let publisher: BoardPublisherFake;
  let service: LightsService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
    ]);
    scenes = new ScenesDaoFake([
      scenePo({ version: 4 }),
      scenePo({ id: OTHER_SCENE_ID, campaignId: VHARN_ID, name: 'Cripta' }),
    ]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    scenes.owners.set(VHARN_ID, planAccount({ plan: 'free' }));
    lights = new LightsDaoFake(scenes.journal, [
      ...torchesOn(VHARN_SCENE_ID, 11),
      corridorTorchPo({ id: 'crypt-candle', sceneId: OTHER_SCENE_ID, lightOrder: 50 }),
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

  const move = (id: string) => ({ moves: [{ lightId: id, x: 7, y: 2 }] });

  it('moving the 11th light is PLAN_LIMIT lights read only, nothing saved nor published', async () => {
    await expect(service.moveMany(ANA_ID, VHARN_ID, move(lightId(10)))).rejects.toMatchObject({
      code: 'PLAN_LIMIT',
      resource: 'lights',
      reason: 'readOnly',
      stored: 11,
    });
    expect(scenes.journal).toEqual(['lock']);
    expect(publisher.lightsMoves).toEqual([]);
  });

  it('moving the 10th light passes', async () => {
    await service.moveMany(ANA_ID, VHARN_ID, move(lightId(9)));

    expect(lights.rows.find(({ id }) => id === lightId(9))).toMatchObject({ x: '7.00' });
  });

  const locked = lightId(10);
  it.each<[string, (lightsService: LightsService) => Promise<number>]>([
    [
      'range',
      (l) =>
        l.setRangeMany(ANA_ID, VHARN_ID, { changes: [{ lightId: locked, bright: 2, dim: 2 }] }),
    ],
    [
      'color',
      (l) => l.setColorMany(ANA_ID, VHARN_ID, { changes: [{ lightId: locked, color: 'fire' }] }),
    ],
    [
      'cone',
      (l) =>
        l.setConeMany(ANA_ID, VHARN_ID, { changes: [{ lightId: locked, facing: 90, angle: 60 }] }),
    ],
  ])('a new %s on the 11th light is read only too', async (_setting, change) => {
    await expect(change(service)).rejects.toMatchObject({ resource: 'lights', reason: 'readOnly' });
  });

  it('putting out and deleting the 11th light pass (they only lower the count)', async () => {
    await service.setLitMany(ANA_ID, VHARN_ID, { lightIds: [lightId(10)], lit: false });
    await service.deleteMany(ANA_ID, VHARN_ID, { lightIds: [lightId(0)] });

    expect(lights.rows.find(({ id }) => id === lightId(10))?.lit).toBe(false);
    expect(lights.rows.some(({ id }) => id === lightId(0))).toBe(false);
  });

  it('after deleting the 1st light the old 11th, now the 10th, moves', async () => {
    await service.deleteMany(ANA_ID, VHARN_ID, { lightIds: [lightId(0)] });

    await expect(service.moveMany(ANA_ID, VHARN_ID, move(lightId(10)))).resolves.toBe(6);
  });

  it('the lights of the group grid do not count on the Cripta: its only light moves', async () => {
    const command = { sceneId: OTHER_SCENE_ID, ...move('crypt-candle') };

    await expect(service.moveMany(ANA_ID, VHARN_ID, command)).resolves.toBeTypeOf('number');
  });

  it('on a grid past the plan (rank 3) any light change and a new light are PLAN_LIMIT scenes', async () => {
    lights.sceneRanks.set(OTHER_SCENE_ID, 3);
    const onCrypt = { sceneId: OTHER_SCENE_ID };

    const moved = service.moveMany(ANA_ID, VHARN_ID, { ...onCrypt, ...move('crypt-candle') });
    const created = service.createMany(ANA_ID, VHARN_ID, { ...onCrypt, lights: [newTorch()] });

    await expect(moved).rejects.toMatchObject({ resource: 'scenes', reason: 'readOnly' });
    await expect(created).rejects.toMatchObject({ resource: 'scenes', reason: 'readOnly' });
  });

  it('on that grid putting the light out and deleting it pass', async () => {
    lights.sceneRanks.set(OTHER_SCENE_ID, 3);
    const onCrypt = { sceneId: OTHER_SCENE_ID, lightIds: ['crypt-candle'] };

    await service.setLitMany(ANA_ID, VHARN_ID, { ...onCrypt, lit: false });
    await service.deleteMany(ANA_ID, VHARN_ID, onCrypt);

    expect(lights.rows.some(({ id }) => id === 'crypt-candle')).toBe(false);
  });
});
