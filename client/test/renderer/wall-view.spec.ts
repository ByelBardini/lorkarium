import { describe, expect, it } from 'vitest';
import {
  dashesOf,
  doorIconsOf,
  topWallAt,
  wallTargetAt,
  erasedStrokesOf,
  wallViewsOf,
  type WallViewInput,
} from '@/renderer/wall-view';
import {
  CELL_DOOR_ID,
  NORTH_WALL_ID,
  cellDoor,
  grateBox,
  northWall,
} from '../support/wall-fixtures';

function input(overrides: Partial<WallViewInput> = {}): WallViewInput {
  return {
    walls: [northWall(), cellDoor()],
    viewer: { isMaster: true },
    tool: 'select',
    selectedWallIds: [],
    seenDoorIds: null,
    ...overrides,
  };
}

describe('wallViewsOf', () => {
  it('a player gets no wall lines at all', () => {
    expect(wallViewsOf(input({ viewer: { isMaster: false } }))).toEqual([]);
  });

  it('the master gets one view per wall, the line (2, 2)–(6, 2) at (128, 128)–(384, 128) in world px', () => {
    const [north] = wallViewsOf(input());

    expect(north).toMatchObject({
      id: NORTH_WALL_ID,
      kind: 'wall',
      segments: [{ from: { x: 128, y: 128 }, to: { x: 384, y: 128 } }],
    });
  });

  it('the lines are full with the walls tool and faint with any other', () => {
    expect(wallViewsOf(input({ tool: 'walls' }))[0]?.emphasis).toBe('full');
    expect(wallViewsOf(input({ tool: 'select' }))[0]?.emphasis).toBe('faint');
  });

  it('a selected wall is marked selected, the others not', () => {
    const views = wallViewsOf(input({ selectedWallIds: [CELL_DOOR_ID] }));

    expect(views.map(({ selected }) => selected)).toEqual([false, true]);
  });

  it('a rectangle gives its four sides', () => {
    expect(wallViewsOf(input({ walls: [grateBox()] }))[0]?.segments).toHaveLength(4);
  });
});

describe('doorIconsOf', () => {
  it('the master gets an icon in the middle of each door, with its state', () => {
    expect(doorIconsOf(input())).toEqual([
      { wallId: CELL_DOOR_ID, x: 448, y: 352, state: 'closed' },
    ]);
  });

  it('a player only gets the icons of the doors their tokens see', () => {
    const player = { viewer: { isMaster: false }, seenDoorIds: new Set<string>() };
    expect(doorIconsOf(input(player))).toEqual([]);
    expect(doorIconsOf(input({ ...player, seenDoorIds: new Set([CELL_DOOR_ID]) }))).toHaveLength(1);
  });

  it('with sight off (no set of seen doors), a player gets every door', () => {
    expect(doorIconsOf(input({ viewer: { isMaster: false }, seenDoorIds: null }))).toHaveLength(1);
  });
});

describe('topWallAt', () => {
  it('a press 0.1 cell from the line takes the wall; one 0.3 away takes nothing', () => {
    const views = wallViewsOf(input({ tool: 'walls' }));

    expect(topWallAt(views, { x: 4 * 64, y: 2.1 * 64 })?.id).toBe(NORTH_WALL_ID);
    expect(topWallAt(views, { x: 4 * 64, y: 2.3 * 64 })).toBeNull();
  });
});

describe('dashesOf', () => {
  const STROKE = { from: { x: 0, y: 0 }, to: { x: 20, y: 0 } };

  it('a solid line is the stroke itself', () => {
    expect(dashesOf(STROKE, null)).toEqual([STROKE]);
  });

  it('a 20 px stroke dashed [6, 4] is two 6 px pieces', () => {
    expect(dashesOf(STROKE, [6, 4])).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 6, y: 0 } },
      { from: { x: 10, y: 0 }, to: { x: 16, y: 0 } },
    ]);
  });
});

describe('wallTargetAt', () => {
  const box = (overrides = {}) =>
    wallViewsOf(input({ walls: [grateBox()], tool: 'walls', ...overrides }));

  it('a press on the right side of the grate box names the box and its side 1', () => {
    expect(wallTargetAt(box(), { x: 10 * 64, y: 4 * 64 })).toEqual({
      wallId: grateBox().id,
      segmentIndex: 1,
    });
  });

  it('a press away from every line names nothing', () => {
    expect(wallTargetAt(box(), { x: 9 * 64, y: 4 * 64 })).toBeNull();
  });
});

describe('erasedStrokesOf', () => {
  const box = () => wallViewsOf(input({ walls: [grateBox()], tool: 'walls' }));
  const target = { wallId: grateBox().id, segmentIndex: 1 };

  it('erasing the wall lights up its four sides; erasing a piece, only the right side', () => {
    expect(erasedStrokesOf(box(), target, 'eraseWall')).toHaveLength(4);
    expect(erasedStrokesOf(box(), target, 'eraseSegment')).toEqual([
      { from: { x: 10 * 64, y: 3 * 64 }, to: { x: 10 * 64, y: 5 * 64 } },
    ]);
  });

  it('no target, or a mode that does not erase, lights up nothing', () => {
    expect(erasedStrokesOf(box(), null, 'eraseWall')).toEqual([]);
    expect(erasedStrokesOf(box(), target, 'eraseArea')).toEqual([]);
  });
});
