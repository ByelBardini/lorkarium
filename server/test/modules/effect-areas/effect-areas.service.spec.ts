import { beforeEach, describe, expect, it } from 'vitest';
import { EffectAreasService } from '../../../src/modules/effect-areas/effect-areas.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import {
  BIA_CONE_ID,
  BIA_CONE_SHAPE,
  biaConePo,
  newCircle,
} from '../../support/effect-areas-factories';
import {
  EffectAreasDaoFake,
  EffectAreaTransactionRunnerFake,
} from '../../support/effect-areas-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { TORRE_ID, torrePo } from '../../support/library-factories';

const NOW = new Date('2026-10-18T21:00:00Z');
const QUELM_SCENE_ID = 'quelm-scene';
const QUELM_AREA_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const ORPHAN_ID = 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f';
const GROWN_CONE = { ...BIA_CONE_SHAPE, reach: 4 };

describe('EffectAreasService', () => {
  let scenes: ScenesDaoFake;
  let areas: EffectAreasDaoFake;
  let publisher: BoardPublisherFake;
  let service: EffectAreasService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(
      new CampaignsDaoFake(),
      { [ANA_ID]: 'Ana', [BIA_ID]: 'Bia', [CAIO_ID]: 'Caio' },
      [
        campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
        campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
        campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
        campaignMemberPo({ campaignId: QUELM_ID, userId: CAIO_ID, role: 'master' }),
      ],
    );
    scenes = new ScenesDaoFake([
      scenePo({ version: 4 }),
      torrePo(),
      scenePo({ id: QUELM_SCENE_ID, campaignId: QUELM_ID }),
    ]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    scenes.activeOf.set(QUELM_ID, QUELM_SCENE_ID);
    areas = new EffectAreasDaoFake(scenes.journal, [
      biaConePo(),
      biaConePo({ id: ORPHAN_ID, authorId: null, areaOrder: 2 }),
      biaConePo({ id: QUELM_AREA_ID, sceneId: QUELM_SCENE_ID, authorId: CAIO_ID }),
    ]);
    publisher = new BoardPublisherFake(scenes.journal);
    const transaction = new EffectAreaTransactionRunnerFake(scenes, areas);
    service = new EffectAreasService({
      members,
      transaction: transaction.run,
      publisher,
      clock: new ClockFake(NOW),
      limit: 100,
    });
  });

  describe('createMany', () => {
    it('Bia creating an area locks, saves and bumps, then publishes after the commit', async () => {
      const created = await service.createMany(BIA_ID, VHARN_ID, { effectAreas: [newCircle()] });

      expect(created).toEqual({ version: 5, createdIds: ['effect-area-4'] });
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
    });

    it('effectArea:createdMany carries the saved area with Bia as its author', async () => {
      await service.createMany(BIA_ID, VHARN_ID, { effectAreas: [newCircle()] });

      expect(publisher.effectAreasCreates).toEqual([
        {
          campaignId: VHARN_ID,
          sceneId: VHARN_SCENE_ID,
          version: 5,
          at: NOW.toISOString(),
          effectAreas: [
            {
              id: 'effect-area-4',
              authorId: BIA_ID,
              kind: 'circle',
              x: 4,
              y: 4,
              reach: 2,
              color: 'violet',
            },
          ],
        },
      ]);
    });

    it('the 101st area of the scene is refused with EFFECT_AREA_LIMIT and nothing is saved', async () => {
      areas.fill(98, VHARN_SCENE_ID);

      await expect(
        service.createMany(BIA_ID, VHARN_ID, { effectAreas: [newCircle()] }),
      ).rejects.toMatchObject({ code: 'EFFECT_AREA_LIMIT' });
      expect(scenes.journal).toEqual(['lock']);
    });

    it('an origin past the scene is refused with OUT_OF_SCENE and nothing is published', async () => {
      await expect(
        service.createMany(BIA_ID, VHARN_ID, { effectAreas: [newCircle(), newCircle({ x: 99 })] }),
      ).rejects.toMatchObject({ code: 'OUT_OF_SCENE' });
      expect(publisher.effectAreasCreates).toEqual([]);
      expect(areas.rows).toHaveLength(3);
    });
  });

  describe('reshapeMany', () => {
    it('Bia stretching her cone saves it and publishes the shape to the hundredth', async () => {
      const version = await service.reshapeMany(BIA_ID, VHARN_ID, {
        reshapes: [{ effectAreaId: BIA_CONE_ID, shape: GROWN_CONE }],
      });

      expect(version).toBe(5);
      expect(areas.rows[0]).toMatchObject({ reach: '4.00', authorId: BIA_ID });
      expect(publisher.effectAreasReshapes).toEqual([
        {
          campaignId: VHARN_ID,
          sceneId: VHARN_SCENE_ID,
          version: 5,
          at: NOW.toISOString(),
          reshapes: [{ effectAreaId: BIA_CONE_ID, shape: GROWN_CONE }],
        },
      ]);
    });

    it('Caio stretching the area of Bia is refused with FORBIDDEN; nothing saved nor published', async () => {
      await expect(
        service.reshapeMany(CAIO_ID, VHARN_ID, {
          reshapes: [{ effectAreaId: BIA_CONE_ID, shape: GROWN_CONE }],
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining(`reshape effect area ${BIA_CONE_ID}`),
      });
      expect(scenes.journal).toEqual(['lock']);
      expect(publisher.effectAreasReshapes).toEqual([]);
    });

    it('a group with an id of another table is refused with EFFECT_AREA_NOT_FOUND citing it, none saved', async () => {
      await expect(
        service.reshapeMany(ANA_ID, VHARN_ID, {
          reshapes: [
            { effectAreaId: BIA_CONE_ID, shape: GROWN_CONE },
            { effectAreaId: QUELM_AREA_ID, shape: GROWN_CONE },
          ],
        }),
      ).rejects.toMatchObject({
        code: 'EFFECT_AREA_NOT_FOUND',
        message: expect.stringContaining(QUELM_AREA_ID),
      });
      expect(areas.rows[0]?.reach).toBe('3.00');
    });

    it('an undo whose expected shape is stale is refused with STALE_UNDO', async () => {
      await expect(
        service.reshapeMany(BIA_ID, VHARN_ID, {
          reshapes: [{ effectAreaId: BIA_CONE_ID, shape: BIA_CONE_SHAPE, expect: GROWN_CONE }],
        }),
      ).rejects.toMatchObject({ code: 'STALE_UNDO' });
      expect(publisher.effectAreasReshapes).toEqual([]);
    });
  });

  describe('deleteMany', () => {
    it('the master deletes the area of an author whose account is gone', async () => {
      await service.deleteMany(ANA_ID, VHARN_ID, { effectAreaIds: [ORPHAN_ID] });

      expect(areas.rows.map(({ id }) => id)).toEqual([BIA_CONE_ID, QUELM_AREA_ID]);
      expect(publisher.effectAreasDeletes).toEqual([
        {
          campaignId: VHARN_ID,
          sceneId: VHARN_SCENE_ID,
          version: 5,
          at: NOW.toISOString(),
          effectAreaIds: [ORPHAN_ID],
        },
      ]);
    });

    it('a player deleting an area with no author is refused with FORBIDDEN', async () => {
      await expect(
        service.deleteMany(BIA_ID, VHARN_ID, { effectAreaIds: [ORPHAN_ID] }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('an undo of a creation whose area was stretched since is refused with STALE_UNDO', async () => {
      await expect(
        service.deleteMany(BIA_ID, VHARN_ID, {
          effectAreaIds: [BIA_CONE_ID],
          expect: [{ effectAreaId: BIA_CONE_ID, shape: GROWN_CONE }],
        }),
      ).rejects.toMatchObject({ code: 'STALE_UNDO' });
      expect(areas.rows).toHaveLength(3);
    });
  });

  describe('on a grid that is not the group one', () => {
    it('Bia placing an area in the public Torre locks the Torre and effectArea:createdMany carries it', async () => {
      scenes.setVisibility(TORRE_ID, 'public');

      const command = { sceneId: TORRE_ID, effectAreas: [newCircle()] };
      const created = await service.createMany(BIA_ID, VHARN_ID, command);

      expect(created.version).toBe(8);
      expect(scenes.journal[0]).toBe(`lockInCampaign:${TORRE_ID}`);
      expect(publisher.effectAreasCreates[0]).toMatchObject({ sceneId: TORRE_ID, version: 8 });
    });

    it('Bia placing an area in the private Torre is SCENE_NOT_FOUND before anything is saved', async () => {
      const command = { sceneId: TORRE_ID, effectAreas: [newCircle()] };

      await expect(service.createMany(BIA_ID, VHARN_ID, command)).rejects.toMatchObject({
        code: 'SCENE_NOT_FOUND',
      });
      expect(scenes.journal).toEqual([`lockInCampaign:${TORRE_ID}`]);
      expect(publisher.published).toBe(0);
    });
  });
});
