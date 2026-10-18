import { describe, expect, it } from 'vitest';
import {
  createEffectAreasCommandDto,
  deleteEffectAreasCommandDto,
  effectAreaDto,
  effectAreaShapeDto,
  reshapeEffectAreasCommandDto,
} from '../../src/board/effect-area.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const CONE_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const CIRCLE_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const BIA_ID = '7f6e5d4c-3b2a-4f1e-8d9c-8b7a6f5e4d3c';
const BASE = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID };

const CIRCLE = { kind: 'circle', x: 5, y: 5, reach: 3, color: 'ember' } as const;
const CONE = {
  kind: 'orthogonal_cone',
  x: 5,
  y: 5.5,
  reach: 3,
  facing: 0,
  color: 'gold',
} as const;

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('effectAreaShapeDto — the nine shapes', () => {
  it.each([
    ['square', { kind: 'square', x: 2, y: 3, width: 3, height: 2, color: 'ink' }],
    ['circle', CIRCLE],
    ['semicircle', { kind: 'semicircle', x: 5, y: 5, reach: 2, facing: 90, color: 'moss' }],
    ['orthogonal cone', CONE],
    ['diagonal cone', { kind: 'diagonal_cone', x: 5, y: 5, reach: 2, facing: 45, color: 'steel' }],
    ['line', { kind: 'line', x: 2.5, y: 2.5, reach: 3, facing: 30, color: 'ash' }],
    [
      'emanation',
      { kind: 'emanation', x: 5, y: 4, width: 1, height: 1, reach: 2, color: 'violet' },
    ],
    ['smooth circle', { kind: 'smooth_circle', x: 5.23, y: 4.87, reach: 2.27, color: 'bone' }],
    [
      'smooth semicircle',
      { kind: 'smooth_semicircle', x: 3.1, y: 2.2, reach: 0.5, facing: 33, color: 'gold' },
    ],
  ])('a valid %s is accepted as sent', (_kind, shape) => {
    expect(effectAreaShapeDto.parse(shape)).toEqual(shape);
  });
});

describe('effectAreaShapeDto — what is refused, citing the value', () => {
  it.each([
    [
      'a circle off the intersection',
      { ...CIRCLE, x: 2.5 },
      /circle origin \(2\.5, 5\).*grid intersection/,
    ],
    [
      'an orthogonal cone facing down from a cell side',
      { ...CONE, facing: 90 },
      /orthogonal_cone origin \(5, 5\.5\).*x on a half cell and y whole/,
    ],
    [
      'a diagonal cone facing straight down',
      { kind: 'diagonal_cone', x: 5, y: 5, reach: 2, facing: 90, color: 'ember' },
      /diagonal_cone facing 90.*45, 135, 225 or 315/,
    ],
    [
      'a line not from a cell center',
      { kind: 'line', x: 2, y: 2.5, reach: 2, facing: 0, color: 'ember' },
      /line origin \(2, 2\.5\).*cell center/,
    ],
    [
      'a grid reach of 101',
      { ...CIRCLE, reach: 101 },
      /circle reach 101.*whole cells from 1 to 100/,
    ],
    [
      'a grid reach of 2.5',
      { ...CIRCLE, reach: 2.5 },
      /circle reach 2\.5.*whole cells from 1 to 100/,
    ],
    [
      'a smooth reach of 0.2',
      { kind: 'smooth_circle', x: 2, y: 2, reach: 0.2, color: 'ember' },
      /smooth_circle reach 0\.2.*0\.5 to 100/,
    ],
    ['a facing of 360', { ...CONE, facing: 360 }, /facing 360/],
    [
      'a square of width 0',
      { kind: 'square', x: 2, y: 3, width: 0, height: 2, color: 'ink' },
      /square width 0.*whole cells from 1 to 100/,
    ],
    [
      'an emanation side of a quarter cell',
      { kind: 'emanation', x: 5, y: 4, width: 0.25, height: 1, reach: 2, color: 'ink' },
      /emanation width 0\.25.*multiple of 0\.5 from 0\.5 to 10/,
    ],
  ])('%s is refused', (_scenario, shape, message) => {
    const result = effectAreaShapeDto.safeParse(shape);
    expect(result.success).toBe(false);
    expect(messagesOf(result).join('\n')).toMatch(message);
  });

  it.each([
    ['a free hex', '#ff0000'],
    ['a color name outside the palette', 'red'],
  ])('%s as the color is refused', (_scenario, color) => {
    expect(effectAreaShapeDto.safeParse({ ...CIRCLE, color }).success).toBe(false);
  });

  it('a width on a circle is refused (strict per kind)', () => {
    expect(effectAreaShapeDto.safeParse({ ...CIRCLE, width: 2 }).success).toBe(false);
  });
});

describe('effectAreaDto', () => {
  it('a confirmed area carries its id and an author that may be gone', () => {
    const area = { ...CONE, id: CONE_ID, authorId: null };
    expect(effectAreaDto.parse(area)).toEqual(area);
  });

  it('a confirmed area breaks the same shape rule as one being sent', () => {
    const result = effectAreaDto.safeParse({ ...CIRCLE, x: 2.5, id: CIRCLE_ID, authorId: BIA_ID });
    expect(messagesOf(result).join()).toMatch(/grid intersection/);
  });
});

describe('createEffectAreasCommandDto', () => {
  it('one area is accepted', () => {
    expect(
      createEffectAreasCommandDto.parse({ ...BASE, effectAreas: [CIRCLE] }).effectAreas,
    ).toEqual([CIRCLE]);
  });

  it('a forged authorId is refused: the author comes from the connection (§7.3)', () => {
    const forged = { ...BASE, authorId: BIA_ID, effectAreas: [CIRCLE] };
    expect(createEffectAreasCommandDto.safeParse(forged).success).toBe(false);
  });

  it.each([
    ['no area', 0],
    ['65 areas', 65],
  ])('%s in one command is refused', (_scenario, count) => {
    const effectAreas = Array.from({ length: count }, () => CIRCLE);
    expect(createEffectAreasCommandDto.safeParse({ ...BASE, effectAreas }).success).toBe(false);
  });
});

describe('reshapeEffectAreasCommandDto', () => {
  it('the same area twice is refused citing its id', () => {
    const reshape = { effectAreaId: CONE_ID, shape: CONE };
    const result = reshapeEffectAreasCommandDto.safeParse({
      ...BASE,
      reshapes: [reshape, reshape],
    });
    expect(messagesOf(result).join()).toMatch(new RegExp(`effect area ${CONE_ID} appears more`));
  });

  it('an expect of another kind is valid: an undo may restore any shape', () => {
    const reshape = { effectAreaId: CONE_ID, shape: CONE, expect: CIRCLE };
    expect(reshapeEffectAreasCommandDto.parse({ ...BASE, reshapes: [reshape] }).reshapes).toEqual([
      reshape,
    ]);
  });
});

describe('deleteEffectAreasCommandDto', () => {
  it('an expect naming an area not being deleted is refused citing its id', () => {
    const result = deleteEffectAreasCommandDto.safeParse({
      ...BASE,
      effectAreaIds: [CONE_ID],
      expect: [{ effectAreaId: CIRCLE_ID, shape: CIRCLE }],
    });
    expect(messagesOf(result).join()).toMatch(
      new RegExp(`effect area ${CIRCLE_ID} is not being deleted`),
    );
  });

  it('an expect for the area being deleted is accepted', () => {
    const command = {
      ...BASE,
      effectAreaIds: [CONE_ID],
      expect: [{ effectAreaId: CONE_ID, shape: CONE }],
    };
    expect(deleteEffectAreasCommandDto.parse(command)).toEqual(command);
  });
});
