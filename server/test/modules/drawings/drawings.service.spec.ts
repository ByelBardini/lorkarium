import { beforeEach, describe, expect, it } from 'vitest';
import { DrawingsService } from '../../../src/modules/drawings/drawings.service';
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
import { DrawingsDaoFake, DrawingTransactionRunnerFake } from '../../support/drawings-fakes';
import {
  caioPathPo,
  newCircle,
  PATH_ID,
  SQUARE_ID,
  squarePo,
} from '../../support/drawings-factories';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { TORRE_ID, torrePo } from '../../support/library-factories';

const NOW = new Date('2026-10-16T21:00:00Z');
const QUELM_SCENE_ID = 'quelm-scene';
const QUELM_DRAWING_ID = 'e3f4a5b6-c7d8-4e9f-8a1b-2c3d4e5f6a7b';

describe('DrawingsService', () => {
  let scenes: ScenesDaoFake;
  let drawings: DrawingsDaoFake;
  let publisher: BoardPublisherFake;
  let service: DrawingsService;

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
    drawings = new DrawingsDaoFake(scenes.journal, [
      squarePo(),
      caioPathPo(),
      squarePo({ id: QUELM_DRAWING_ID, sceneId: QUELM_SCENE_ID, authorId: CAIO_ID }),
    ]);
    publisher = new BoardPublisherFake(scenes.journal);
    const transaction = new DrawingTransactionRunnerFake(scenes, drawings);
    service = new DrawingsService({
      members,
      transaction: transaction.run,
      publisher,
      clock: new ClockFake(NOW),
      limit: 500,
    });
  });

  describe('createMany', () => {
    it('Bia drawing locks, saves and bumps, then publishes after the commit', async () => {
      const created = await service.createMany(BIA_ID, VHARN_ID, { drawings: [newCircle()] });

      expect(created).toEqual({ version: 5, createdIds: ['drawing-4'] });
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
    });

    it('drawing:createdMany carries the saved drawing with Bia as its author', async () => {
      await service.createMany(BIA_ID, VHARN_ID, { drawings: [newCircle()] });

      expect(publisher.drawingsCreates).toEqual([
        {
          campaignId: VHARN_ID,
          sceneId: VHARN_SCENE_ID,
          version: 5,
          at: NOW.toISOString(),
          drawings: [expect.objectContaining({ kind: 'ellipse', x: 4, y: 4, authorId: BIA_ID })],
        },
      ]);
    });

    it('the master draws too, as the author of her drawing', async () => {
      await service.createMany(ANA_ID, VHARN_ID, { drawings: [newCircle()] });

      expect(drawings.rows.at(-1)).toMatchObject({ kind: 'ellipse', authorId: ANA_ID });
    });

    it('a freehand line of width 0 fits and is saved', async () => {
      const line = {
        kind: 'freehand',
        x: 3,
        y: 3,
        width: 0,
        height: 2,
        points: [
          [0, 0],
          [0, 2],
        ],
        stroke: 'ink',
        strokeWidth: 'thin',
      } as const;

      await service.createMany(BIA_ID, VHARN_ID, {
        drawings: [
          {
            ...line,
            points: [
              [0, 0],
              [0, 2],
            ],
          },
        ],
      });

      expect(drawings.rows.at(-1)).toMatchObject({ kind: 'freehand', width: '0.00' });
    });

    it('the 500th drawing of the scene is accepted', async () => {
      drawings.fill(497, VHARN_SCENE_ID);

      await expect(
        service.createMany(BIA_ID, VHARN_ID, { drawings: [newCircle()] }),
      ).resolves.toMatchObject({ version: 5 });
    });

    it('a box outside the scene is refused with OUT_OF_SCENE and nothing is saved nor published', async () => {
      const outside = newCircle({ x: 19 });

      await expect(
        service.createMany(BIA_ID, VHARN_ID, { drawings: [outside] }),
      ).rejects.toMatchObject({ code: 'OUT_OF_SCENE' });
      expect(scenes.journal).toEqual(['lock']);
    });

    it('the 501st drawing is refused with DRAWING_LIMIT and nothing is saved', async () => {
      drawings.fill(498, VHARN_SCENE_ID);

      await expect(
        service.createMany(BIA_ID, VHARN_ID, { drawings: [newCircle()] }),
      ).rejects.toMatchObject({ code: 'DRAWING_LIMIT', message: expect.stringContaining('500') });
      expect(scenes.journal).toEqual(['lock']);
    });

    it('someone outside the table is refused with CAMPAIGN_NOT_FOUND', async () => {
      await expect(
        service.createMany(BIA_ID, QUELM_ID, { drawings: [newCircle()] }),
      ).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
    });
  });

  describe('moveMany', () => {
    it('Bia moves her own square and the whole table hears where it is now', async () => {
      const version = await service.moveMany(BIA_ID, VHARN_ID, {
        moves: [{ drawingId: SQUARE_ID, x: 6, y: 1 }],
      });

      expect(version).toBe(5);
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
      expect(publisher.drawingsMoves[0]?.moves).toEqual([{ drawingId: SQUARE_ID, x: 6, y: 1 }]);
      expect(drawings.rows[0]).toMatchObject({ x: '6.00', y: '1.00' });
    });

    it('a move whose precondition matches the saved position goes through (undo)', async () => {
      await service.moveMany(BIA_ID, VHARN_ID, {
        moves: [{ drawingId: SQUARE_ID, x: 0, y: 0, expect: { x: 2.5, y: 3 } }],
      });

      expect(drawings.rows[0]).toMatchObject({ x: '0.00', y: '0.00' });
    });

    it('Bia moving the drawing of Caio is refused with FORBIDDEN citing the drawing, nothing saved', async () => {
      await expect(
        service.moveMany(BIA_ID, VHARN_ID, { moves: [{ drawingId: PATH_ID, x: 0, y: 0 }] }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', message: expect.stringContaining(PATH_ID) });
      expect(scenes.journal).toEqual(['lock']);
    });

    it('a drawing of another table is refused with DRAWING_NOT_FOUND citing its id', async () => {
      await expect(
        service.moveMany(ANA_ID, VHARN_ID, {
          moves: [{ drawingId: QUELM_DRAWING_ID, x: 0, y: 0 }],
        }),
      ).rejects.toMatchObject({
        code: 'DRAWING_NOT_FOUND',
        message: expect.stringContaining(QUELM_DRAWING_ID),
      });
      expect(publisher.published).toBe(0);
    });

    it('an undo after someone else moved the drawing is refused with STALE_UNDO, nothing moved', async () => {
      await expect(
        service.moveMany(BIA_ID, VHARN_ID, {
          moves: [{ drawingId: SQUARE_ID, x: 0, y: 0, expect: { x: 9, y: 9 } }],
        }),
      ).rejects.toMatchObject({
        code: 'STALE_UNDO',
        message: expect.stringMatching(/is at \(2.5, 3\); the undo expected \(9, 9\)/),
      });
      expect(drawings.rows[0]).toMatchObject({ x: '2.50', y: '3.00' });
      expect(scenes.journal).toEqual(['lock']);
    });

    it('a move that puts the drawing past the edge is refused with OUT_OF_SCENE', async () => {
      await expect(
        service.moveMany(BIA_ID, VHARN_ID, { moves: [{ drawingId: SQUARE_ID, x: 19, y: 0 }] }),
      ).rejects.toMatchObject({ code: 'OUT_OF_SCENE' });
    });
  });

  describe('deleteMany', () => {
    it('the master deletes the drawings of Bia and Caio in one version and one event', async () => {
      const version = await service.deleteMany(ANA_ID, VHARN_ID, {
        drawingIds: [SQUARE_ID, PATH_ID],
      });

      expect(version).toBe(5);
      expect(publisher.drawingsDeletes).toEqual([
        {
          campaignId: VHARN_ID,
          sceneId: VHARN_SCENE_ID,
          version: 5,
          at: NOW.toISOString(),
          drawingIds: [SQUARE_ID, PATH_ID],
        },
      ]);
      expect(drawings.rows.map(({ id }) => id)).toEqual([QUELM_DRAWING_ID]);
    });

    it('Caio deleting the square of Bia is refused with FORBIDDEN and both stay', async () => {
      await expect(
        service.deleteMany(CAIO_ID, VHARN_ID, { drawingIds: [PATH_ID, SQUARE_ID] }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', message: expect.stringContaining(SQUARE_ID) });
      expect(drawings.rows).toHaveLength(3);
    });

    it('an undo of a draw whose drawing was moved since is refused with STALE_UNDO', async () => {
      await expect(
        service.deleteMany(BIA_ID, VHARN_ID, {
          drawingIds: [SQUARE_ID],
          expect: [{ drawingId: SQUARE_ID, x: 0, y: 0 }],
        }),
      ).rejects.toMatchObject({ code: 'STALE_UNDO' });
      expect(drawings.rows).toHaveLength(3);
    });
  });

  describe('on a grid that is not the group one', () => {
    it('Bia drawing in the public Torre locks the Torre and drawing:createdMany carries it', async () => {
      scenes.setVisibility(TORRE_ID, 'public');

      const command = { sceneId: TORRE_ID, drawings: [newCircle()] };
      const created = await service.createMany(BIA_ID, VHARN_ID, command);

      expect(created.version).toBe(8);
      expect(scenes.journal).toEqual([
        `lockInCampaign:${TORRE_ID}`,
        'save',
        'bump',
        'commit',
        'publish',
      ]);
      expect(publisher.drawingsCreates[0]).toMatchObject({ sceneId: TORRE_ID, version: 8 });
    });

    it('Bia drawing in the private Torre is SCENE_NOT_FOUND before anything is saved', async () => {
      const command = { sceneId: TORRE_ID, drawings: [newCircle()] };

      await expect(service.createMany(BIA_ID, VHARN_ID, command)).rejects.toMatchObject({
        code: 'SCENE_NOT_FOUND',
      });
      expect(scenes.journal).toEqual([`lockInCampaign:${TORRE_ID}`]);
      expect(publisher.published).toBe(0);
    });

    it('a drawing of the group grid addressed to the Torre is DRAWING_NOT_FOUND', async () => {
      const command = { sceneId: TORRE_ID, drawingIds: [SQUARE_ID] };

      await expect(service.deleteMany(ANA_ID, VHARN_ID, command)).rejects.toMatchObject({
        code: 'DRAWING_NOT_FOUND',
      });
    });

    it('without sceneId drawing:movedMany carries the group grid', async () => {
      await service.moveMany(BIA_ID, VHARN_ID, { moves: [{ drawingId: SQUARE_ID, x: 2, y: 2 }] });

      expect(publisher.drawingsMoves[0]).toMatchObject({ sceneId: VHARN_SCENE_ID, version: 5 });
    });
  });
});
