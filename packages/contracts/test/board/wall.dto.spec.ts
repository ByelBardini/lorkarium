import { describe, expect, it } from 'vitest';
import {
  createWallsCommandDto,
  deleteWallsCommandDto,
  eraseWallAreaCommandDto,
  eraseWallSegmentCommandDto,
  wallAreaErasedDto,
  moveWallsCommandDto,
  setDoorCommandDto,
  setWallKindsCommandDto,
  wallDto,
  wallSegmentErasedDto,
  wallShapeDto,
} from '../../src/board/wall.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const NORTH_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const CELLAR_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const BIA_ID = '7f6e5d4c-3b2a-4f1e-8d9c-8b7a6f5e4d3c';
const BASE = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID };

const NORTH_LINE = {
  kind: 'wall',
  shape: 'line',
  x: 2,
  y: 2,
  width: 4,
  height: 0,
  points: [
    [0, 0],
    [4, 0],
  ],
} as const;

const GRATE_BOX = { kind: 'grate', shape: 'rectangle', x: 2, y: 2, width: 4, height: 3 } as const;

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

function pointsOf(count: number): [number, number][] {
  return Array.from({ length: count }, (_, index) => [(index % 10) / 10, 0]);
}

describe('wallShapeDto', () => {
  it.each(['wall', 'grate', 'curtain'] as const)('each shape is accepted as a %s', (kind) => {
    const shapes = [
      { ...NORTH_LINE, kind },
      { ...NORTH_LINE, kind, shape: 'freehand', width: 1, points: pointsOf(3) },
      { ...GRATE_BOX, kind },
      { ...GRATE_BOX, kind, shape: 'ellipse' },
    ];
    for (const shape of shapes) expect(wallShapeDto.safeParse(shape).success).toBe(true);
  });

  it('a straight door is accepted', () => {
    expect(wallShapeDto.safeParse({ ...NORTH_LINE, kind: 'door' }).success).toBe(true);
  });

  it('a line with 3 points is refused citing the count and the 2 expected', () => {
    const result = wallShapeDto.safeParse({
      ...NORTH_LINE,
      points: [
        [0, 0],
        [2, 0],
        [4, 0],
      ],
    });
    expect(messagesOf(result)).toContain('line has 3 points; expected 2');
  });

  it('a freehand wall of 501 points is refused citing 501 and 2 to 500', () => {
    const result = wallShapeDto.safeParse({
      ...NORTH_LINE,
      shape: 'freehand',
      width: 1,
      points: pointsOf(501),
    });
    expect(messagesOf(result)).toContain('freehand has 501 points; expected 2 to 500');
  });

  it('a point at (5, 0) outside the 4 × 0 box is refused citing the point and the box', () => {
    const result = wallShapeDto.safeParse({
      ...NORTH_LINE,
      points: [
        [0, 0],
        [5, 0],
      ],
    });
    expect(messagesOf(result)).toContain('point (5, 0) is outside the 4 × 0 box');
  });

  it('a rectangular door is refused because a door must be a line', () => {
    const result = wallShapeDto.safeParse({ ...GRATE_BOX, kind: 'door' });
    expect(messagesOf(result)).toContain('door must be a line; got rectangle');
  });

  it('an unknown kind "window" is refused', () => {
    expect(wallShapeDto.safeParse({ ...NORTH_LINE, kind: 'window' }).success).toBe(false);
  });

  it('a doorState sent with the shape is refused: the server decides it starts closed', () => {
    const result = wallShapeDto.safeParse({ ...NORTH_LINE, kind: 'door', doorState: 'open' });
    expect(result.success).toBe(false);
  });

  it('an authorId sent with the shape is refused (§7.3)', () => {
    expect(wallShapeDto.safeParse({ ...NORTH_LINE, authorId: BIA_ID }).success).toBe(false);
  });
});

describe('wallDto', () => {
  it('a confirmed door carries its state', () => {
    const door = { ...NORTH_LINE, kind: 'door', id: CELLAR_ID, doorState: 'locked' };
    expect(wallDto.parse(door).doorState).toBe('locked');
  });

  it('a confirmed door without a state is refused citing the null state', () => {
    const result = wallDto.safeParse({
      ...NORTH_LINE,
      kind: 'door',
      id: CELLAR_ID,
      doorState: null,
    });
    expect(messagesOf(result)).toContain(
      'door has doorState null; expected closed, open or locked',
    );
  });

  it('a confirmed plain wall with a door state is refused citing the state', () => {
    const result = wallDto.safeParse({ ...NORTH_LINE, id: NORTH_ID, doorState: 'open' });
    expect(messagesOf(result)).toContain('wall has doorState open; expected null');
  });
});

describe('wall commands', () => {
  it.each([
    ['0 walls', 0],
    ['65 walls', 65],
  ])('creating %s is refused', (_name, count) => {
    const walls = Array.from({ length: count }, () => NORTH_LINE);
    expect(createWallsCommandDto.safeParse({ ...BASE, walls }).success).toBe(false);
  });

  it('creating one wall is accepted', () => {
    expect(createWallsCommandDto.safeParse({ ...BASE, walls: [NORTH_LINE] }).success).toBe(true);
  });

  it('moving the same wall twice is refused citing the id', () => {
    const move = { wallId: NORTH_ID, x: 3, y: 2 };
    const result = moveWallsCommandDto.safeParse({ ...BASE, moves: [move, move] });
    expect(messagesOf(result)).toContain(
      `wall ${NORTH_ID} appears more than once; expected distinct wall ids`,
    );
  });

  it('deleting with an expect for a wall outside the list is refused citing the id', () => {
    const result = deleteWallsCommandDto.safeParse({
      ...BASE,
      wallIds: [NORTH_ID],
      expect: [{ wallId: CELLAR_ID, x: 2, y: 2 }],
    });
    expect(messagesOf(result)).toContain(
      `wall ${CELLAR_ID} is not being deleted; expected only ids in wallIds`,
    );
  });

  it('changing walls to the kind "window" is refused', () => {
    const result = setWallKindsCommandDto.safeParse({
      ...BASE,
      wallIds: [NORTH_ID],
      kind: 'window',
    });
    expect(result.success).toBe(false);
  });

  it('changing kinds with an expect for a wall outside the list is refused citing the id', () => {
    const result = setWallKindsCommandDto.safeParse({
      ...BASE,
      wallIds: [NORTH_ID],
      kind: 'grate',
      expect: [{ wallId: CELLAR_ID, kind: 'wall' }],
    });
    expect(messagesOf(result)).toContain(
      `wall ${CELLAR_ID} is not being changed; expected only ids in wallIds`,
    );
  });

  it('setting a door "ajar" is refused', () => {
    const result = setDoorCommandDto.safeParse({ ...BASE, wallId: CELLAR_ID, state: 'ajar' });
    expect(result.success).toBe(false);
  });

  it('setting a door with a forged userId is refused (§7.3)', () => {
    const result = setDoorCommandDto.safeParse({
      ...BASE,
      wallId: CELLAR_ID,
      state: 'open',
      userId: BIA_ID,
    });
    expect(result.success).toBe(false);
  });
});

describe('erasing one piece of a wall', () => {
  it('a piece index is a whole number from 0: -1 and 1.5 are refused', () => {
    for (const segmentIndex of [-1, 1.5]) {
      const result = eraseWallSegmentCommandDto.safeParse({
        ...BASE,
        wallId: NORTH_ID,
        segmentIndex,
      });
      expect(result.success).toBe(false);
    }
  });

  it('an erase with the corner the wall must still have (an undo-safe precondition) is accepted', () => {
    const command = { ...BASE, wallId: NORTH_ID, segmentIndex: 2, expect: { x: 2, y: 2 } };
    expect(eraseWallSegmentCommandDto.parse(command)).toEqual(command);
  });

  it('wall:segmentErased carries the wall taken out and the walls left', () => {
    const event = {
      campaignId: CAMPAIGN_ID,
      version: 4,
      at: '2026-10-18T12:00:00.000Z',
      wallId: NORTH_ID,
      walls: [{ ...NORTH_LINE, id: CELLAR_ID, doorState: null }],
    };
    expect(wallSegmentErasedDto.parse(event)).toEqual(event);
  });
});

describe('erasing an area of walls', () => {
  it('the eraser box has a width and a height: 0 and a negative one are refused, citing the field', () => {
    for (const box of [
      { x: 1, y: 1, width: 0, height: 2 },
      { x: 1, y: 1, width: 2, height: -1 },
    ]) {
      const result = eraseWallAreaCommandDto.safeParse({ ...BASE, box });
      expect(result.success).toBe(false);
    }
  });

  it('a box in fractional cells is accepted, and nothing else rides with it', () => {
    const command = { ...BASE, box: { x: 2.5, y: 1, width: 1.25, height: 3 } };
    expect(eraseWallAreaCommandDto.parse(command)).toEqual(command);
    expect(eraseWallAreaCommandDto.safeParse({ ...command, wallIds: [NORTH_ID] }).success).toBe(
      false,
    );
  });

  it('wall:areaErased carries the walls taken out and the walls left', () => {
    const event = {
      campaignId: CAMPAIGN_ID,
      version: 5,
      at: '2026-10-18T12:00:00.000Z',
      wallIds: [NORTH_ID],
      walls: [{ ...NORTH_LINE, id: CELLAR_ID, doorState: null }],
    };
    expect(wallAreaErasedDto.parse(event)).toEqual(event);
  });
});
