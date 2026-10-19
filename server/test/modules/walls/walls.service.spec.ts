import { beforeEach, describe, expect, it } from 'vitest';
import { WallsService } from '../../../src/modules/walls/walls.service';
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
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { LightsDaoFake } from '../../support/lights-fakes';
import { corridorTorchPo } from '../../support/lights-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import { bramRow, lyraPo, lyraRow } from '../../support/tokens-factories';
import { WallsDaoFake, WallTransactionRunnerFake } from '../../support/walls-fakes';
import {
  CELL_DOOR_ID,
  NORTH_WALL_ID,
  cellDoorPo,
  newGrate,
  northWallPo,
} from '../../support/walls-factories';

const NOW = new Date('2026-10-18T21:00:00Z');
const QUELM_SCENE_ID = 'quelm-scene';
const QUELM_WALL_ID = 'a3b4c5d6-e7f8-4a9b-8c0d-1e2f3a4b5c6d';

describe('WallsService', () => {
  let scenes: ScenesDaoFake;
  let walls: WallsDaoFake;
  let tokens: TokensDaoFake;
  let lights: LightsDaoFake;
  let publisher: BoardPublisherFake;
  let service: WallsService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(
      new CampaignsDaoFake(),
      { [ANA_ID]: 'Ana', [BIA_ID]: 'Bia', [CAIO_ID]: 'Caio' },
      [
        campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
        campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
        campaignMemberPo({ campaignId: QUELM_ID, userId: CAIO_ID, role: 'master' }),
      ],
    );
    scenes = new ScenesDaoFake([
      scenePo({ version: 4 }),
      scenePo({ id: QUELM_SCENE_ID, campaignId: QUELM_ID }),
    ]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    scenes.activeOf.set(QUELM_ID, QUELM_SCENE_ID);
    walls = new WallsDaoFake(scenes.journal, [
      northWallPo(),
      cellDoorPo(),
      northWallPo({ id: QUELM_WALL_ID, sceneId: QUELM_SCENE_ID }),
    ]);
    publisher = new BoardPublisherFake(scenes.journal);
    // Lyra (Bia's) stands at (3, 4) and sees 6 cells; the cell door is at x = 7, 3.5 away.
    tokens = new TokensDaoFake(scenes.journal, [
      lyraRow({ token: lyraPo({ sightBright: '6.00', sightDim: '0.00' }) }),
    ]);
    lights = new LightsDaoFake(scenes.journal, []);
    service = new WallsService({
      members,
      transaction: new WallTransactionRunnerFake(scenes, walls, tokens, lights).run,
      publisher,
      clock: new ClockFake(NOW),
      limits: { walls: 500, segments: 4000 },
    });
  });

  describe('createMany', () => {
    it('Ana creating locks, saves and bumps, then publishes after the commit', async () => {
      const created = await service.createMany(ANA_ID, VHARN_ID, { walls: [newGrate()] });

      expect(created).toEqual({ version: 5, createdIds: ['wall-4'] });
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
    });

    it('wall:createdMany carries the saved grate to the table', async () => {
      await service.createMany(ANA_ID, VHARN_ID, { walls: [newGrate()] });

      expect(publisher.wallsCreates).toEqual([
        {
          campaignId: VHARN_ID,
          version: 5,
          at: NOW.toISOString(),
          walls: [
            {
              id: 'wall-4',
              kind: 'grate',
              shape: 'rectangle',
              x: 4,
              y: 4,
              width: 2,
              height: 2,
              doorState: null,
            },
          ],
        },
      ]);
    });

    it('Bia creating is refused with FORBIDDEN, and nothing is saved nor published', async () => {
      await expect(service.createMany(BIA_ID, VHARN_ID, { walls: [newGrate()] })).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
      expect(scenes.journal).toEqual([]);
    });

    it('the 501st wall is refused with WALL_LIMIT', async () => {
      walls.fill(498, VHARN_SCENE_ID);

      await expect(service.createMany(ANA_ID, VHARN_ID, { walls: [newGrate()] })).rejects.toThrow(
        expect.objectContaining({ code: 'WALL_LIMIT' }),
      );
      expect(scenes.journal).toEqual(['lock']);
    });

    it('a wall past the scene is refused with OUT_OF_SCENE and nothing is saved', async () => {
      await expect(
        service.createMany(ANA_ID, VHARN_ID, { walls: [newGrate({ x: 19 })] }),
      ).rejects.toThrow(expect.objectContaining({ code: 'OUT_OF_SCENE' }));
      expect(publisher.wallsCreates).toEqual([]);
    });
  });

  describe('moveMany', () => {
    it('Ana moving the north wall saves it and publishes the move to the hundredth', async () => {
      const version = await service.moveMany(ANA_ID, VHARN_ID, {
        moves: [{ wallId: NORTH_WALL_ID, x: 3.333, y: 4 }],
      });

      expect(version).toBe(5);
      expect(walls.rows[0]).toMatchObject({ x: '3.33', y: '4.00' });
      expect(publisher.wallsMoves[0]?.moves).toEqual([{ wallId: NORTH_WALL_ID, x: 3.33, y: 4 }]);
    });

    it('a group with a wall of Quelm is refused with WALL_NOT_FOUND citing it, and none moves', async () => {
      const moves = [
        { wallId: NORTH_WALL_ID, x: 3, y: 3 },
        { wallId: QUELM_WALL_ID, x: 3, y: 3 },
      ];

      await expect(service.moveMany(ANA_ID, VHARN_ID, { moves })).rejects.toThrow(
        expect.objectContaining({
          code: 'WALL_NOT_FOUND',
          message: expect.stringContaining(QUELM_WALL_ID),
        }),
      );
      expect(walls.rows[0]).toMatchObject({ x: '2.00' });
      expect(publisher.wallsMoves).toEqual([]);
    });

    it('an undo whose wall moved since is refused with STALE_UNDO', async () => {
      const moves = [{ wallId: NORTH_WALL_ID, x: 1, y: 1, expect: { x: 9, y: 9 } }];

      await expect(service.moveMany(ANA_ID, VHARN_ID, { moves })).rejects.toThrow(
        expect.objectContaining({ code: 'STALE_UNDO' }),
      );
    });
  });

  describe('deleteMany', () => {
    it('Ana deleting the door removes it and publishes the ids', async () => {
      await service.deleteMany(ANA_ID, VHARN_ID, { wallIds: [CELL_DOOR_ID] });

      expect(walls.rows.map(({ id }) => id)).not.toContain(CELL_DOOR_ID);
      expect(publisher.wallsDeletes[0]?.wallIds).toEqual([CELL_DOOR_ID]);
    });

    it('Bia deleting is refused with FORBIDDEN', async () => {
      await expect(
        service.deleteMany(BIA_ID, VHARN_ID, { wallIds: [CELL_DOOR_ID] }),
      ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
      expect(walls.rows).toHaveLength(3);
    });
  });

  describe('setKindMany', () => {
    it('the north wall turned into a door is published closed', async () => {
      await service.setKindMany(ANA_ID, VHARN_ID, { wallIds: [NORTH_WALL_ID], kind: 'door' });

      expect(walls.rows[0]).toMatchObject({ kind: 'door', doorState: 'closed' });
      expect(publisher.wallKindChanges[0]?.changes).toEqual([
        { wallId: NORTH_WALL_ID, kind: 'door', doorState: 'closed' },
      ]);
    });

    it('a rectangle turned into a door is refused with INVALID_DOOR, and nothing changes', async () => {
      walls.rows[0] = northWallPo({ shape: 'rectangle', height: '2.00', points: null });

      await expect(
        service.setKindMany(ANA_ID, VHARN_ID, { wallIds: [NORTH_WALL_ID], kind: 'door' }),
      ).rejects.toThrow(expect.objectContaining({ code: 'INVALID_DOOR' }));
      expect(walls.rows[0]).toMatchObject({ kind: 'wall' });
    });

    it('an undo whose kind changed since is refused with STALE_UNDO', async () => {
      const command = {
        wallIds: [NORTH_WALL_ID],
        kind: 'wall' as const,
        expect: [{ wallId: NORTH_WALL_ID, kind: 'grate' as const }],
      };

      await expect(service.setKindMany(ANA_ID, VHARN_ID, command)).rejects.toThrow(
        expect.objectContaining({ code: 'STALE_UNDO' }),
      );
    });
  });

  describe('setDoor', () => {
    beforeEach(() => {
      scenes.rows[0]!.visionMode = 'dark';
    });

    it('Bia opening the door beside Lyra saves it in one version and publishes wall:doorChanged', async () => {
      const version = await service.setDoor(BIA_ID, VHARN_ID, {
        wallId: CELL_DOOR_ID,
        state: 'open',
      });

      expect(version).toBe(5);
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
      expect(walls.rows[1]?.doorState).toBe('open');
      expect(publisher.doorChanges).toEqual([
        {
          campaignId: VHARN_ID,
          version: 5,
          at: NOW.toISOString(),
          wallId: CELL_DOOR_ID,
          doorState: 'open',
        },
      ]);
    });

    it('a door behind another wall is FORBIDDEN for Bia, and nothing is saved', async () => {
      walls.rows.push(
        northWallPo({
          id: 'b4c5d6e7-f8a9-4b0c-9d1e-2f3a4b5c6d7e',
          x: '6.00',
          y: '0.00',
          width: '0.00',
          height: '12.00',
          points: [
            [0, 0],
            [0, 12],
          ],
        }),
      );

      await expect(
        service.setDoor(BIA_ID, VHARN_ID, { wallId: CELL_DOOR_ID, state: 'open' }),
      ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
      expect(walls.rows[1]?.doorState).toBe('closed');
      expect(publisher.doorChanges).toEqual([]);
    });

    it('with the scene vision off, Bia opens a door no token of hers sees', async () => {
      scenes.rows[0]!.visionMode = 'off';
      tokens.rows.splice(0, tokens.rows.length);

      await service.setDoor(BIA_ID, VHARN_ID, { wallId: CELL_DOOR_ID, state: 'open' });

      expect(walls.rows[1]?.doorState).toBe('open');
    });

    describe('a Lyra without darkvision in the dark', () => {
      // The torch stands 1 cell past the cell door (x = 7, y from 5 to 6).
      const torchByTheDoor = { x: '8.00', y: '5.50', bright: '2.00', dim: '0.00' };

      beforeEach(() => {
        tokens.rows[0] = lyraRow();
      });

      it('opens the door a lit torch beside it shows her', async () => {
        lights.rows.push(corridorTorchPo(torchByTheDoor));

        await service.setDoor(BIA_ID, VHARN_ID, { wallId: CELL_DOOR_ID, state: 'open' });

        expect(walls.rows[1]?.doorState).toBe('open');
      });

      it('is FORBIDDEN when that torch is out, and nothing is saved', async () => {
        lights.rows.push(corridorTorchPo({ ...torchByTheDoor, lit: false }));

        await expect(
          service.setDoor(BIA_ID, VHARN_ID, { wallId: CELL_DOOR_ID, state: 'open' }),
        ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
        expect(walls.rows[1]?.doorState).toBe('closed');
      });

      it('opens the door the lantern of Bram (a token of Caio) lights', async () => {
        const lantern = { lightBright: '2.00', lightDim: '0.00', lightLit: true };
        tokens.rows.push(bramRow({ token: { ...bramRow().token, ...lantern } }));

        await service.setDoor(BIA_ID, VHARN_ID, { wallId: CELL_DOOR_ID, state: 'open' });

        expect(walls.rows[1]?.doorState).toBe('open');
      });
    });

    it('Ana locks and unlocks the door', async () => {
      await service.setDoor(ANA_ID, VHARN_ID, { wallId: CELL_DOOR_ID, state: 'locked' });
      expect(walls.rows[1]?.doorState).toBe('locked');

      await service.setDoor(ANA_ID, VHARN_ID, { wallId: CELL_DOOR_ID, state: 'closed' });
      expect(walls.rows[1]?.doorState).toBe('closed');
    });

    it('a door of Quelm is WALL_NOT_FOUND', async () => {
      await expect(
        service.setDoor(ANA_ID, VHARN_ID, { wallId: QUELM_WALL_ID, state: 'open' }),
      ).rejects.toThrow(expect.objectContaining({ code: 'WALL_NOT_FOUND' }));
    });
  });
});

describe('WallsService.eraseSegment', () => {
  const BOX_ID = 'c5d6e7f8-a9b0-4c1d-8e2f-3a4b5c6d7e8f';
  let scenes: ScenesDaoFake;
  let walls: WallsDaoFake;
  let publisher: BoardPublisherFake;
  let service: WallsService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([scenePo({ version: 4 })]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    walls = new WallsDaoFake(scenes.journal, [
      northWallPo({ id: BOX_ID, kind: 'grate', shape: 'rectangle', height: '3.00', points: null }),
    ]);
    publisher = new BoardPublisherFake(scenes.journal);
    service = new WallsService({
      members,
      transaction: new WallTransactionRunnerFake(scenes, walls).run,
      publisher,
      clock: new ClockFake(NOW),
      limits: { walls: 500, segments: 4000 },
    });
  });

  it('Ana erasing the top side of a box swaps it for the rest in one version, published to the table', async () => {
    const erased = await service.eraseSegment(ANA_ID, VHARN_ID, {
      wallId: BOX_ID,
      segmentIndex: 0,
    });

    expect(erased).toEqual({ version: 5, createdIds: ['wall-1'] });
    expect(scenes.journal).toEqual(['lock', 'save', 'save', 'bump', 'commit', 'publish']);
    expect(walls.rows.map(({ shape, kind }) => [shape, kind])).toEqual([['freehand', 'grate']]);
    expect(publisher.wallSegmentErasures).toEqual([
      expect.objectContaining({
        version: 5,
        wallId: BOX_ID,
        walls: [expect.objectContaining({ id: 'wall-1', kind: 'grate', shape: 'freehand' })],
      }),
    ]);
  });

  it('Bia erasing is FORBIDDEN and nothing is saved', async () => {
    await expect(
      service.eraseSegment(BIA_ID, VHARN_ID, { wallId: BOX_ID, segmentIndex: 0 }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(scenes.journal).toEqual([]);
  });

  it('an erase whose wall moved since is STALE_UNDO and the box stays', async () => {
    const command = { wallId: BOX_ID, segmentIndex: 0, expect: { x: 9, y: 9 } };

    await expect(service.eraseSegment(ANA_ID, VHARN_ID, command)).rejects.toThrow(
      expect.objectContaining({ code: 'STALE_UNDO' }),
    );
    expect(walls.rows[0]?.id).toBe(BOX_ID);
  });
});

describe('WallsService.eraseArea', () => {
  const FAR_ID = 'd6e7f8a9-b0c1-4d2e-8f3a-4b5c6d7e8f90';
  let scenes: ScenesDaoFake;
  let walls: WallsDaoFake;
  let publisher: BoardPublisherFake;
  let service: WallsService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([scenePo({ version: 4 })]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    walls = new WallsDaoFake(scenes.journal, [
      northWallPo(),
      northWallPo({ id: FAR_ID, y: '8.00' }),
    ]);
    publisher = new BoardPublisherFake(scenes.journal);
    service = new WallsService({
      members,
      transaction: new WallTransactionRunnerFake(scenes, walls).run,
      publisher,
      clock: new ClockFake(NOW),
      limits: { walls: 500, segments: 4000 },
    });
  });

  it('Ana erasing the middle of the north wall swaps it for its two ends in one version', async () => {
    const erased = await service.eraseArea(ANA_ID, VHARN_ID, {
      box: { x: 3, y: 1, width: 2, height: 2 },
    });

    expect(erased).toEqual({ version: 5, createdIds: ['wall-2', 'wall-3'] });
    expect(scenes.journal).toEqual(['lock', 'save', 'save', 'bump', 'commit', 'publish']);
    expect(walls.rows.map(({ id }) => id)).toEqual([FAR_ID, 'wall-2', 'wall-3']);
    expect(publisher.wallAreaErasures).toEqual([
      expect.objectContaining({
        version: 5,
        wallIds: [NORTH_WALL_ID],
        walls: [
          expect.objectContaining({ id: 'wall-2', x: 2, width: 1 }),
          expect.objectContaining({ id: 'wall-3', x: 5, width: 1 }),
        ],
      }),
    ]);
  });

  it('Bia erasing an area is FORBIDDEN and nothing is saved', async () => {
    await expect(
      service.eraseArea(BIA_ID, VHARN_ID, { box: { x: 3, y: 1, width: 2, height: 2 } }),
    ).rejects.toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(scenes.journal).toEqual([]);
  });
});
