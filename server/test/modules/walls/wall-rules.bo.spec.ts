import { wall, type Wall } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { WallRulesBo } from '../../../src/modules/walls/wall-rules.bo';

const SCENE = { widthCells: 20, heightCells: 12 };
const rules = new WallRulesBo({ scene: SCENE, limits: { walls: 500, segments: 4000 } });

function line(x: number, overrides: Partial<Wall> = {}): Wall {
  return wall({
    kind: 'wall',
    shape: 'line',
    x,
    y: 2,
    width: 4,
    height: 0,
    points: [
      [0, 0],
      [4, 0],
    ],
    doorState: null,
    ...overrides,
  });
}

function lines(count: number): Wall[] {
  return Array.from({ length: count }, () => line(2));
}

const CIRCLE = wall({
  kind: 'wall',
  shape: 'ellipse',
  x: 1,
  y: 1,
  width: 2,
  height: 2,
  points: null,
  doorState: null,
});

describe('WallRulesBo.place', () => {
  it('a wall touching the far edge fits and is returned', () => {
    expect(rules.place(line(16))).toEqual(line(16));
  });

  it('a wall at (18, 2) of 4×0 past the 20×12 scene is refused with OUT_OF_SCENE citing both', () => {
    expect(() => rules.place(line(18))).toThrow(
      expect.objectContaining({
        code: 'OUT_OF_SCENE',
        message: expect.stringMatching(/\(18, 2\) of 4×0.*20×12/),
      }),
    );
  });
});

describe('WallRulesBo.admit', () => {
  it('the 500th wall is admitted', () => {
    expect(() => rules.admit(lines(499), lines(1))).not.toThrow();
  });

  it('a 501st wall is refused with WALL_LIMIT citing 501 and 500', () => {
    expect(() => rules.admit(lines(500), lines(1))).toThrow(
      expect.objectContaining({
        code: 'WALL_LIMIT',
        message: expect.stringMatching(/501 walls.*at most 500/),
      }),
    );
  });

  it('3990 segments plus a circle (32) is refused with WALL_LIMIT citing 4022 and 4000', () => {
    const tight = new WallRulesBo({ scene: SCENE, limits: { walls: 5000, segments: 4000 } });
    expect(() => tight.admit(lines(3990), [CIRCLE])).toThrow(
      expect.objectContaining({
        code: 'WALL_LIMIT',
        message: expect.stringMatching(/4022 wall segments.*at most 4000/),
      }),
    );
  });
});

describe('WallRulesBo.requireAt', () => {
  it('without an expect a move always passes', () => {
    expect(() => rules.requireAt('north', undefined, { x: 2, y: 2 })).not.toThrow();
  });

  it('an expect equal to the hundredth passes', () => {
    expect(() => rules.requireAt('north', { x: 2.001, y: 2 }, { x: 2, y: 2 })).not.toThrow();
  });

  it('an expect elsewhere is refused with STALE_UNDO citing the wall, the expected and the actual', () => {
    expect(() => rules.requireAt('north', { x: 3, y: 2 }, { x: 2, y: 2 })).toThrow(
      expect.objectContaining({
        code: 'STALE_UNDO',
        message: 'wall north is at (2, 2); the undo expected (3, 2)',
      }),
    );
  });
});

describe('WallRulesBo.requireKind', () => {
  it('an expected kind that changed is refused with STALE_UNDO citing both kinds', () => {
    expect(() => rules.requireKind('north', 'grate', 'wall')).toThrow(
      expect.objectContaining({
        code: 'STALE_UNDO',
        message: 'wall north is at wall; the undo expected grate',
      }),
    );
  });

  it('without an expected kind it passes', () => {
    expect(() => rules.requireKind('north', undefined, 'wall')).not.toThrow();
  });
});

describe('WallRulesBo.kindChange', () => {
  it('a straight wall turned into a door starts closed', () => {
    expect(rules.kindChange('north', line(2), 'door')).toEqual({
      kind: 'door',
      doorState: 'closed',
    });
  });

  it('a locked door kept as a door stays locked', () => {
    const door = line(2, { kind: 'door', doorState: 'locked' });
    expect(rules.kindChange('north', door, 'door')).toEqual({ kind: 'door', doorState: 'locked' });
  });

  it('a door turned into a grate drops its state', () => {
    const door = line(2, { kind: 'door', doorState: 'open' });
    expect(rules.kindChange('north', door, 'grate')).toEqual({ kind: 'grate', doorState: null });
  });

  it('a circle turned into a door is refused with INVALID_DOOR citing the wall and its shape', () => {
    expect(() => rules.kindChange('round', CIRCLE, 'door')).toThrow(
      expect.objectContaining({
        code: 'INVALID_DOOR',
        message: 'wall round is a ellipse; a door must be a line',
      }),
    );
  });
});

describe('WallRulesBo.restAfterErase', () => {
  const BOX = wall({
    kind: 'grate',
    shape: 'rectangle',
    x: 2,
    y: 2,
    width: 4,
    height: 3,
    points: null,
    doorState: null,
  });

  it('the top side of a grate box out leaves one freehand grate of the three other sides', () => {
    const rest = rules.restAfterErase('box', BOX, 0);

    expect(rest).toHaveLength(1);
    expect(rest[0]).toMatchObject({ kind: 'grate', shape: 'freehand', x: 2, y: 2 });
  });

  it('a piece past the four sides is WALL_SEGMENT_NOT_FOUND citing the wall, the index and the count', () => {
    expect(() => rules.restAfterErase('box', BOX, 4)).toThrow(
      expect.objectContaining({
        code: 'WALL_SEGMENT_NOT_FOUND',
        message: 'wall box has no segment 4; expected 0 to 3',
      }),
    );
  });
});

describe('WallRulesBo.eraseArea', () => {
  const LINE = wall({
    kind: 'wall',
    shape: 'line',
    x: 0,
    y: 0,
    width: 10,
    height: 0,
    points: [
      [0, 0],
      [10, 0],
    ],
    doorState: null,
  });
  const FAR = wall({ ...LINE, y: 8 });

  it('the box over the middle of one line takes it out and leaves its two ends; the far one stays', () => {
    const erased = rules.eraseArea(
      [
        { id: 'line', wall: LINE },
        { id: 'far', wall: FAR },
      ],
      { x: 3, y: -1, width: 2, height: 2 },
    );

    expect(erased.wallIds).toEqual(['line']);
    expect(erased.rest.map(({ x, width }) => [x, width])).toEqual([
      [0, 3],
      [5, 5],
    ]);
  });

  it('a box over no wall takes nothing', () => {
    expect(
      rules.eraseArea([{ id: 'line', wall: LINE }], { x: 0, y: 3, width: 1, height: 1 }),
    ).toEqual({ wallIds: [], rest: [] });
  });
});
