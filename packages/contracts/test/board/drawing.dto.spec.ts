import { describe, expect, it } from 'vitest';
import {
  createDrawingsCommandDto,
  deleteDrawingsCommandDto,
  DRAWING_POINTS_MAX,
  drawingDto,
  moveDrawingsCommandDto,
} from '../../src/board/drawing.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const CIRCLE_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const PATH_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const BIA_ID = '7f6e5d4c-3b2a-4f1e-8d9c-8b7a6f5e4d3c';
const BASE = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID };

const SQUARE = {
  kind: 'rectangle',
  x: 2,
  y: 3,
  width: 2,
  height: 2,
  stroke: 'gold',
  fill: 'ember',
  strokeWidth: 'medium',
  layer: 'tokens',
} as const;

const PATH = {
  kind: 'freehand',
  x: 1,
  y: 1,
  width: 2,
  height: 1,
  points: [
    [0, 0],
    [1, 1],
    [2, 0.5],
  ],
  stroke: 'moss',
  strokeWidth: 'thin',
  layer: 'tokens',
} as const;

function pointsOf(count: number): [number, number][] {
  return Array.from({ length: count }, (_, index) => [(index % 10) / 10, 0]);
}

function freehandWith(points: [number, number][]) {
  return { ...PATH, width: 1, height: 0, points };
}

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

function createWith(...drawings: object[]) {
  return createDrawingsCommandDto.safeParse({ ...BASE, drawings });
}

describe('createDrawingsCommandDto', () => {
  it('a filled square is accepted with its shape and style', () => {
    const parsed = createDrawingsCommandDto.parse({ ...BASE, drawings: [SQUARE] });

    expect(parsed.drawings).toEqual([SQUARE]);
  });

  it('a shape with no fill sent comes out with fill null', () => {
    const parsed = createDrawingsCommandDto.parse({
      ...BASE,
      drawings: [{ ...SQUARE, kind: 'ellipse', fill: undefined }],
    });

    expect(parsed.drawings[0]).toMatchObject({ kind: 'ellipse', fill: null });
  });

  it('a freehand path of three points with no fill is accepted', () => {
    expect(createWith(PATH).success).toBe(true);
  });

  it.each([2, DRAWING_POINTS_MAX])('a freehand path of %s points is accepted', (count) => {
    expect(createWith(freehandWith(pointsOf(count))).success).toBe(true);
  });

  it.each([1, DRAWING_POINTS_MAX + 1])(
    'a freehand path of %s points is refused citing the count',
    (count) => {
      const result = createWith(freehandWith(pointsOf(count)));

      expect(messagesOf(result).join()).toMatch(new RegExp(`${count} points.*2 to 2000`));
    },
  );

  it('a freehand path with a fill is refused: only fixed shapes are filled', () => {
    expect(createWith({ ...PATH, fill: 'ember' }).success).toBe(false);
  });

  it('a freehand point outside its own box is refused citing the point', () => {
    const result = createWith({
      ...PATH,
      points: [
        [0, 0],
        [3, 0.5],
      ],
    });

    expect(messagesOf(result).join()).toMatch(/point 3,0.5.*inside the 2×1 box/);
  });

  it('a free hex color is refused: only the palette goes', () => {
    expect(createWith({ ...SQUARE, stroke: '#ff0000' }).success).toBe(false);
  });

  it('a rectangle of width 0 is refused', () => {
    expect(createWith({ ...SQUARE, width: 0 }).success).toBe(false);
  });

  it('64 drawings in one command are accepted, 65 refused', () => {
    expect(createWith(...Array<object>(64).fill(SQUARE)).success).toBe(true);
    expect(createWith(...Array<object>(65).fill(SQUARE)).success).toBe(false);
  });

  it('an author sent with the drawing is refused: the author comes from the connection', () => {
    expect(createWith({ ...SQUARE, authorId: BIA_ID }).success).toBe(false);
  });
});

describe('moveDrawingsCommandDto', () => {
  it('a move with the expected position (undo) and one without are both accepted', () => {
    const command = {
      ...BASE,
      moves: [
        { drawingId: CIRCLE_ID, x: 4.5, y: 2, expect: { x: 2, y: 3 } },
        { drawingId: PATH_ID, x: 0, y: 0 },
      ],
    };

    expect(moveDrawingsCommandDto.parse(command)).toEqual(command);
  });

  it('the same drawing twice is refused citing its id', () => {
    const result = moveDrawingsCommandDto.safeParse({
      ...BASE,
      moves: [
        { drawingId: CIRCLE_ID, x: 1, y: 1 },
        { drawingId: CIRCLE_ID, x: 2, y: 2 },
      ],
    });

    expect(messagesOf(result).join()).toContain(`drawing ${CIRCLE_ID} appears more than once`);
  });

  it('a negative position is refused', () => {
    const result = moveDrawingsCommandDto.safeParse({
      ...BASE,
      moves: [{ drawingId: CIRCLE_ID, x: -1, y: 0 }],
    });

    expect(result.success).toBe(false);
  });
});

describe('deleteDrawingsCommandDto', () => {
  it('two distinct drawings are accepted', () => {
    const command = { ...BASE, drawingIds: [CIRCLE_ID, PATH_ID] };

    expect(deleteDrawingsCommandDto.parse(command)).toEqual(command);
  });

  it('an expected position of a drawing not being deleted is refused citing its id', () => {
    const result = deleteDrawingsCommandDto.safeParse({
      ...BASE,
      drawingIds: [CIRCLE_ID],
      expect: [{ drawingId: PATH_ID, x: 1, y: 1 }],
    });

    expect(messagesOf(result).join()).toContain(`drawing ${PATH_ID} is not being deleted`);
  });
});

describe('drawingDto', () => {
  it('a confirmed drawing with no author left (deleted account) is accepted', () => {
    const drawing = { ...SQUARE, id: CIRCLE_ID, authorId: null };

    expect(drawingDto.parse(drawing)).toEqual(drawing);
  });
});
