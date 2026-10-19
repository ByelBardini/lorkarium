import { describe, expect, it } from 'vitest';
import { applyBoardEvent } from '@/stores/board-reducer';
import { PATH_ID, path, SQUARE_ID, square, vharnEventBase } from '../support/drawing-fixtures';
import { ANA_CIRCLE_ID, BIA_CONE_ID, anaCircle, biaCone } from '../support/effect-area-fixtures';
import {
  CELL_DOOR_ID,
  NORTH_WALL_ID,
  cellDoor,
  grateBox,
  northWall,
} from '../support/wall-fixtures';
import {
  KAEL_COMBATANT,
  KAEL_ID,
  LYRA_COMBATANT,
  LYRA_ID,
  kael,
  lyra,
  sceneUpdated,
  soloCombatant,
  VHARN_SCENE,
  vharnBoard,
  vharnCombat,
} from '../support/table-session-fixtures';

describe('applyBoardEvent, effect areas', () => {
  it('the snapshot carries the areas of the scene', () => {
    expect(vharnBoard({ effectAreas: [biaCone()] }).effectAreas).toEqual([biaCone()]);
  });

  it('effectArea:createdMany appends the new areas after the ones already there', () => {
    const board = vharnBoard({ effectAreas: [biaCone()] });

    const next = applyBoardEvent(board, {
      type: 'effectAreasCreated',
      payload: { ...vharnEventBase(5), effectAreas: [anaCircle()] },
    });

    expect(next.effectAreas.map(({ id }) => id)).toEqual([BIA_CONE_ID, ANA_CIRCLE_ID]);
    expect(next.version).toBe(5);
  });

  it('effectArea:reshapedMany swaps the whole shape of each area, keeping its id and author', () => {
    const board = vharnBoard({ effectAreas: [biaCone(), anaCircle()] });
    const line = { kind: 'line', x: 2.5, y: 2.5, reach: 4, facing: 30, color: 'gold' } as const;

    const next = applyBoardEvent(board, {
      type: 'effectAreasReshaped',
      payload: { ...vharnEventBase(5), reshapes: [{ effectAreaId: BIA_CONE_ID, shape: line }] },
    });

    expect(next.effectAreas).toEqual([
      { ...line, id: BIA_CONE_ID, authorId: biaCone().authorId },
      anaCircle(),
    ]);
  });

  it('effectArea:deletedMany takes the listed areas off and keeps the rest', () => {
    const board = vharnBoard({ effectAreas: [biaCone(), anaCircle()] });

    const next = applyBoardEvent(board, {
      type: 'effectAreasDeleted',
      payload: { ...vharnEventBase(5), effectAreaIds: [BIA_CONE_ID] },
    });

    expect(next.effectAreas).toEqual([anaCircle()]);
  });
});

describe('applyBoardEvent, drawings', () => {
  it('drawing:createdMany appends the new drawings after the ones already there', () => {
    const board = vharnBoard({ drawings: [square()] });

    const next = applyBoardEvent(board, {
      type: 'drawingsCreated',
      payload: { ...vharnEventBase(5), drawings: [path()] },
    });

    expect(next.drawings.map(({ id }) => id)).toEqual([SQUARE_ID, PATH_ID]);
    expect(next.version).toBe(5);
  });

  it('drawing:movedMany changes only the corner of each moved drawing', () => {
    const board = vharnBoard({ drawings: [square(), path()] });

    const next = applyBoardEvent(board, {
      type: 'drawingsMoved',
      payload: { ...vharnEventBase(5), moves: [{ drawingId: PATH_ID, x: 7.5, y: 2 }] },
    });

    expect(next.drawings).toEqual([square(), path({ x: 7.5, y: 2 })]);
  });

  it('drawing:deletedMany takes the listed drawings off and keeps the rest', () => {
    const board = vharnBoard({ drawings: [square(), path()] });

    const next = applyBoardEvent(board, {
      type: 'drawingsDeleted',
      payload: { ...vharnEventBase(5), drawingIds: [SQUARE_ID] },
    });

    expect(next.drawings).toEqual([path()]);
  });
});

describe('applyBoardEvent, facing and look', () => {
  it('token:facedMany changes only the facing of the listed tokens', () => {
    const board = vharnBoard({ tokens: [lyra(), kael()] });

    const next = applyBoardEvent(board, {
      type: 'tokensFaced',
      payload: { ...vharnEventBase(5), faces: [{ tokenId: LYRA_ID, facing: 135 }] },
    });

    expect(next.tokens.map(({ id, facing }) => [id, facing])).toEqual([
      [LYRA_ID, 135],
      [KAEL_ID, 0],
    ]);
    expect(next.version).toBe(5);
  });

  it('token:resizedMany gives the listed tokens their new box and leaves the rest', () => {
    const board = vharnBoard({ tokens: [lyra(), kael()] });

    const next = applyBoardEvent(board, {
      type: 'tokensResized',
      payload: {
        ...vharnEventBase(5),
        resizes: [{ tokenId: LYRA_ID, col: 2.5, row: 4, width: 1.5, height: 0.5 }],
      },
    });

    expect(
      next.tokens.map(({ id, col, row, width, height }) => [id, col, row, width, height]),
    ).toEqual([
      [LYRA_ID, 2.5, 4, 1.5, 0.5],
      [KAEL_ID, 5, 4, 1, 1],
    ]);
  });

  it('token:restyledMany with a flip changes only the flip', () => {
    const board = vharnBoard({ tokens: [lyra({ frame: 'round' })] });

    const next = applyBoardEvent(board, {
      type: 'tokensRestyled',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID], style: { flipX: true } },
    });

    expect(next.tokens[0]).toMatchObject({ flipX: true, flipY: false, frame: 'round' });
  });

  it('token:restyledMany with a null image takes the image away', () => {
    const board = vharnBoard({ tokens: [lyra({ imageAssetId: KAEL_ID })] });

    const next = applyBoardEvent(board, {
      type: 'tokensRestyled',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID], style: { imageAssetId: null } },
    });

    expect(next.tokens[0]?.imageAssetId).toBeNull();
  });

  it('scene:updated with a background brings it into the scene', () => {
    const background = { assetId: KAEL_ID, width: 1400, height: 700 };
    const next = applyBoardEvent(vharnBoard(), {
      type: 'sceneUpdated',
      payload: sceneUpdated({ scene: { ...VHARN_SCENE, background } }),
    });

    expect(next.scene.background).toEqual(background);
  });
});

describe('applyBoardEvent, token batches', () => {
  it('token:createdMany appends every pasted token', () => {
    const board = vharnBoard({ tokens: [lyra()] });

    const next = applyBoardEvent(board, {
      type: 'tokensCreated',
      payload: { ...vharnEventBase(5), tokens: [kael()], combat: null },
    });

    expect(next.tokens.map(({ id }) => id)).toEqual([LYRA_ID, KAEL_ID]);
  });

  it('token:createdMany brings the combat with the copies in the entry of their original', () => {
    const board = vharnBoard({ tokens: [lyra()], combat: vharnCombat() });
    const withCopy = vharnCombat({
      combatants: [
        { ...soloCombatant(LYRA_COMBATANT, LYRA_ID, 14, 1), tokenIds: [LYRA_ID, KAEL_ID] },
      ],
    });

    const next = applyBoardEvent(board, {
      type: 'tokensCreated',
      payload: { ...vharnEventBase(5), tokens: [kael()], combat: withCopy },
    });

    expect(next.combat).toEqual(withCopy);
  });

  it('token:createdMany with combat null leaves the board without combat', () => {
    const board = vharnBoard({ tokens: [lyra()], combat: vharnCombat() });

    const next = applyBoardEvent(board, {
      type: 'tokensCreated',
      payload: { ...vharnEventBase(5), tokens: [kael()], combat: null },
    });

    expect(next.combat).toBeNull();
  });

  it('combat:updated keeps the name and the tokens of a grouped entry', () => {
    const inimigos = {
      ...soloCombatant(KAEL_COMBATANT, 'goblin-token', 15, 0),
      name: 'Inimigos',
      tokenIds: ['goblin-token', 'lobo-token'],
    };
    const combat = vharnCombat({ combatants: [inimigos] });

    const next = applyBoardEvent(vharnBoard({ combat: vharnCombat() }), {
      type: 'combatUpdated',
      payload: { ...vharnEventBase(5), combat },
    });

    expect(next.combat?.combatants).toEqual([inimigos]);
  });

  it('token:deletedMany takes the tokens off and brings the combat as it is after they left', () => {
    const board = vharnBoard({ tokens: [lyra(), kael()], combat: vharnCombat() });
    const after = vharnCombat({ currentCombatantId: null, combatants: [] });

    const next = applyBoardEvent(board, {
      type: 'tokensDeleted',
      payload: { ...vharnEventBase(5), tokenIds: [LYRA_ID, KAEL_ID], combat: after },
    });

    expect(next.tokens).toEqual([]);
    expect(next.combat).toEqual(after);
  });
});

describe('applyBoardEvent, walls', () => {
  it('wall:createdMany appends the new walls after the ones already there', () => {
    const board = vharnBoard({ walls: [northWall()] });

    const next = applyBoardEvent(board, {
      type: 'wallsCreated',
      payload: { ...vharnEventBase(5), walls: [cellDoor()] },
    });

    expect(next.walls.map(({ id }) => id)).toEqual([NORTH_WALL_ID, CELL_DOOR_ID]);
    expect(next.version).toBe(5);
  });

  it('wall:movedMany changes only x and y of each listed wall', () => {
    const board = vharnBoard({ walls: [northWall(), cellDoor()] });

    const next = applyBoardEvent(board, {
      type: 'wallsMoved',
      payload: { ...vharnEventBase(5), moves: [{ wallId: NORTH_WALL_ID, x: 3, y: 4 }] },
    });

    expect(next.walls).toEqual([northWall({ x: 3, y: 4 }), cellDoor()]);
  });

  it('wall:deletedMany takes the listed walls off and keeps the rest', () => {
    const board = vharnBoard({ walls: [northWall(), cellDoor(), grateBox()] });

    const next = applyBoardEvent(board, {
      type: 'wallsDeleted',
      payload: { ...vharnEventBase(5), wallIds: [NORTH_WALL_ID, CELL_DOOR_ID] },
    });

    expect(next.walls).toEqual([grateBox()]);
  });

  it('wall:kindsChanged changes the kind and the door state of each listed wall', () => {
    const board = vharnBoard({ walls: [northWall(), cellDoor()] });

    const next = applyBoardEvent(board, {
      type: 'wallKindsChanged',
      payload: {
        ...vharnEventBase(5),
        changes: [
          { wallId: NORTH_WALL_ID, kind: 'door', doorState: 'closed' },
          { wallId: CELL_DOOR_ID, kind: 'grate', doorState: null },
        ],
      },
    });

    expect(next.walls).toEqual([
      northWall({ kind: 'door', doorState: 'closed' }),
      cellDoor({ kind: 'grate', doorState: null }),
    ]);
  });

  it('wall:areaErased takes the walls touched out and puts what is left at the end', () => {
    const board = vharnBoard({ walls: [northWall(), grateBox()] });
    const rest = northWall({ id: CELL_DOOR_ID, width: 1 });

    const next = applyBoardEvent(board, {
      type: 'wallAreaErased',
      payload: { ...vharnEventBase(5), wallIds: [northWall().id], walls: [rest] },
    });

    expect(next.walls).toEqual([grateBox(), rest]);
  });

  it('wall:segmentErased takes the wall out and puts what is left at the end', () => {
    const board = vharnBoard({ walls: [grateBox(), northWall()] });
    const rest = northWall({ id: CELL_DOOR_ID, x: 9 });

    const next = applyBoardEvent(board, {
      type: 'wallSegmentErased',
      payload: { ...vharnEventBase(5), wallId: grateBox().id, walls: [rest] },
    });

    expect(next.walls).toEqual([northWall(), rest]);
  });

  it('wall:doorChanged changes only the state of that door', () => {
    const board = vharnBoard({ walls: [northWall(), cellDoor()] });

    const next = applyBoardEvent(board, {
      type: 'doorChanged',
      payload: { ...vharnEventBase(5), wallId: CELL_DOOR_ID, doorState: 'open' },
    });

    expect(next.walls).toEqual([northWall(), cellDoor({ doorState: 'open' })]);
  });
});
