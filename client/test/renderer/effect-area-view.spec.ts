import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import {
  effectAreaViewsOf,
  topEffectAreaAt,
  type EffectAreaViewInput,
} from '@/renderer/effect-area-view';
import { ANA_CIRCLE_ID, BIA_CONE_ID, anaCircle, biaCone } from '../support/effect-area-fixtures';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  VHARN_SCENE,
} from '../support/table-session-fixtures';

const CELL = CELL_WORLD_SIZE;

function viewsOf(overrides: Partial<EffectAreaViewInput> = {}) {
  return effectAreaViewsOf({
    effectAreas: [biaCone(), anaCircle()],
    viewer: { userId: BIA_AT_TABLE.userId, isMaster: false },
    activeLayer: 'tokens',
    selectedEffectAreaIds: [],
    effectAreaPreview: {},
    readOnly: false,
    scene: VHARN_SCENE,
    ...overrides,
  });
}

// World px of the center of a cell.
function centerOf(col: number, row: number) {
  return { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL };
}

describe('effectAreaViewsOf', () => {
  it('the areas come out in creation order with their painted cells, color and size', () => {
    const [cone, circle] = viewsOf();
    expect([cone?.id, circle?.id]).toEqual([BIA_CONE_ID, ANA_CIRCLE_ID]);
    expect(cone).toMatchObject({ color: 'ember', label: 'Cone 3 casas · 4,5 m' });
    expect(cone?.cells).toHaveLength(8);
    expect(circle?.label).toBe('Raio 2 casas · 3 m');
  });

  it('the author picks her own area and not the master’s', () => {
    expect(viewsOf().map(({ pickable }) => pickable)).toEqual([true, false]);
  });

  it('the master picks every area, an author-less one included', () => {
    const orphan = biaCone({ authorId: null });
    const views = viewsOf({
      effectAreas: [orphan, anaCircle()],
      viewer: { userId: ANA_AT_TABLE.userId, isMaster: true },
    });
    expect(views.map(({ pickable }) => pickable)).toEqual([true, true]);
  });

  it.each([
    ['another player', { viewer: { userId: CAIO_AT_TABLE.userId, isMaster: false } }],
    ['the objects layer active', { activeLayer: 'objects' as const }],
    ['reconnecting', { readOnly: true }],
  ])('with %s, Bia’s cone is not pickable', (_case, overrides) => {
    expect(viewsOf(overrides)[0]?.pickable).toBe(false);
  });

  it('a preview of this viewer takes the place of the confirmed shape', () => {
    const grown = {
      kind: 'diagonal_cone',
      x: 6,
      y: 6,
      reach: 4,
      facing: 45,
      color: 'ember',
    } as const;
    const [cone] = viewsOf({ effectAreaPreview: { [BIA_CONE_ID]: grown } });
    expect(cone).toMatchObject({ area: grown, label: 'Cone 4 casas · 6 m' });
  });

  it('a selected area is marked selected', () => {
    expect(viewsOf({ selectedEffectAreaIds: [BIA_CONE_ID] })[0]?.selected).toBe(true);
  });
});

describe('topEffectAreaAt', () => {
  it('a point on a painted cell finds the area', () => {
    expect(topEffectAreaAt(viewsOf(), centerOf(6, 6))?.id).toBe(BIA_CONE_ID);
  });

  it('a point on a neighbor cell that is not painted finds nothing', () => {
    expect(topEffectAreaAt(viewsOf(), centerOf(4, 6))).toBeNull();
  });

  it('a smooth circle is found inside its outline and not outside it', () => {
    const smooth = anaCircle({ kind: 'smooth_circle', x: 5.5, y: 5.5, reach: 1.5 });
    const views = viewsOf({
      effectAreas: [smooth],
      viewer: { userId: ANA_AT_TABLE.userId, isMaster: true },
    });
    expect(topEffectAreaAt(views, { x: 6.9 * CELL, y: 5.5 * CELL })?.id).toBe(ANA_CIRCLE_ID);
    expect(topEffectAreaAt(views, { x: 7.1 * CELL, y: 5.5 * CELL })).toBeNull();
  });

  it('of two overlapping areas, the one created last is on top', () => {
    const under = anaCircle({ x: 7, y: 7, reach: 2 });
    const views = viewsOf({
      effectAreas: [under, biaCone()],
      viewer: { userId: ANA_AT_TABLE.userId, isMaster: true },
    });
    expect(topEffectAreaAt(views, centerOf(6, 6))?.id).toBe(BIA_CONE_ID);
  });
});
