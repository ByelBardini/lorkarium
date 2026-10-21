import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { copiedOf, pastePlacement, type CopiedSelection } from '@/lib/paste-placement';
import { path, square } from '../support/drawing-fixtures';
import { biaCone } from '../support/effect-area-fixtures';
import {
  activeCondition,
  kael,
  LYRA_COMBATANT,
  LYRA_ID,
  lyra,
  vharnCombat,
} from '../support/table-session-fixtures';

const SCENE = { widthCells: 20, heightCells: 12 };

describe('copiedOf', () => {
  it('a token copied in the middle of the combat keeps the entry of its original', () => {
    const copied = copiedOf([lyra()], [], [], vharnCombat());

    expect(copied.tokens[0]?.combatantId).toBe(LYRA_COMBATANT);
  });

  it('a token out of the combat, or with no combat, is copied with no entry', () => {
    const outside = copiedOf([lyra({ id: 'urso' })], [], [], vharnCombat());
    const noCombat = copiedOf([lyra()], [], [], null);

    expect(outside.tokens[0]).not.toHaveProperty('combatantId');
    expect(noCombat.tokens[0]).not.toHaveProperty('combatantId');
  });

  it('the drawings and areas copied with a fighting token stay as they are', () => {
    const copied = copiedOf([lyra({ id: LYRA_ID })], [square()], [biaCone()], vharnCombat());

    expect(copied.drawings).toEqual(copiedOf([], [square()]).drawings);
    expect(copied.effectAreas).toEqual(copiedOf([], [], [biaCone()]).effectAreas);
  });

  it('a copied token keeps its image, frame, flips and facing', () => {
    const look = {
      imageAssetId: '4a3b2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d',
      frame: 'round',
      flipX: true,
      flipY: true,
      facing: 135,
    } as const;

    expect(copiedOf([lyra(look)], []).tokens[0]).toMatchObject(look);
  });

  it('a copied token keeps name, side, width, height, bars, controllers and layer, and no conditions', () => {
    const copied = copiedOf([lyra({ conditions: [activeCondition()], layer: 'objects' })], []);

    expect(copied.tokens).toEqual([
      {
        name: 'Lyra',
        initials: 'LY',
        side: 'ally',
        width: 1,
        height: 1,
        col: 3,
        row: 4,
        layer: 'objects',
        controllerIds: lyra().controllerIds,
        imageAssetId: null,
        frame: 'square',
        flipX: false,
        flipY: false,
        facing: 0,
        sightAngle: 360,
        sight: null,
        light: null,
        bars: [
          { label: 'PV', current: 32, max: 45, color: 'ember', visibility: 'controllers' },
          { label: 'Inspiração', current: 1, max: 1, color: 'gold', visibility: 'everyone' },
        ],
      },
    ]);
  });

  it('a copied token keeps how far it sees', () => {
    const sight = { bright: 12, dim: 4 };

    expect(copiedOf([lyra({ sight })], []).tokens[0]?.sight).toEqual(sight);
  });

  it('a copied Lyra with a moon light keeps the color', () => {
    const light = { bright: 4, dim: 4, color: 'moon' as const, angle: 360 };

    const [copy] = copiedOf([lyra({ light })], []).tokens;

    expect(copy?.light).toEqual({ bright: 4, dim: 4, color: 'moon', angle: 360 });
  });

  it('a copied token keeps the light it gives off (and the copy is born lit)', () => {
    const light = { bright: 4, dim: 4, color: null, angle: 360 };

    const [copy] = copiedOf([lyra({ light, lightLit: false })], []).tokens;

    expect(copy?.light).toEqual(light);
    expect(copy).not.toHaveProperty('lightLit');
  });

  it('a copied drawing keeps its shape and style, without its id or author', () => {
    const copied = copiedOf([], [square()]);

    expect(copied.drawings).toEqual([
      {
        kind: 'rectangle',
        x: 2.5,
        y: 3,
        width: 2,
        height: 2,
        fill: 'ember',
        stroke: 'gold',
        strokeWidth: 'medium',
      },
    ]);
  });
});

describe('pastePlacement', () => {
  const group: CopiedSelection = copiedOf(
    [lyra({ width: 2, height: 2, col: 4, row: 4 }), kael()],
    [],
  );

  it('the center of the group lands on the cell under the cursor, and the tokens keep their distance', () => {
    const placed = pastePlacement(group, cell(10, 6), SCENE);

    expect(placed?.tokens.map(({ col, row }) => [col, row])).toEqual([
      [9, 5],
      [10, 5],
    ]);
  });

  it('drawings move by the same cells as the tokens', () => {
    const mixed = copiedOf([lyra({ col: 4, row: 4 })], [path()]);

    const placed = pastePlacement(mixed, cell(10, 6), SCENE);

    expect(placed?.tokens[0]).toMatchObject({ col: 11, row: 7 });
    expect(placed?.drawings[0]).toMatchObject({ x: 8, y: 4 });
  });

  it('with the cursor off the board the copy lands one cell right and down of the original', () => {
    const placed = pastePlacement(group, null, SCENE);

    expect(placed?.tokens.map(({ col, row }) => [col, row])).toEqual([
      [5, 5],
      [6, 5],
    ]);
  });

  it('a paste that would leave the scene is pushed back inside by the edge', () => {
    const wide = copiedOf([lyra({ col: 8, row: 4 })], [square()]);

    const placed = pastePlacement(wide, cell(19, 11), SCENE);

    expect(placed?.tokens[0]).toMatchObject({ col: 19, row: 11 });
    expect(placed?.drawings[0]).toMatchObject({ x: 13.5, y: 10 });
  });

  it('a group bigger than the scene cannot be pasted', () => {
    const wide = copiedOf([], [square({ x: 0, width: 20 }), square({ x: 3, width: 2 })]);

    expect(pastePlacement(wide, cell(1, 1), { widthCells: 10, heightCells: 10 })).toBeNull();
  });
});

describe('copiedOf and pastePlacement, areas of effect', () => {
  const SCENE = { widthCells: 20, heightCells: 12 };
  const sideCone = biaCone({ kind: 'orthogonal_cone', x: 5, y: 5.5, reach: 3, facing: 0 });

  it('a copied area keeps its shape and color, without its id or author', () => {
    expect(copiedOf([], [], [biaCone()]).effectAreas).toEqual([
      { kind: 'diagonal_cone', x: 6, y: 6, reach: 3, facing: 45, color: 'ember' },
    ]);
  });

  it('an area moves with the group by the same whole cells, a cone keeping the middle of its side', () => {
    const copied = copiedOf([lyra({ col: 3, row: 4 })], [], [sideCone]);
    const placed = pastePlacement(copied, cell(8, 6), SCENE);
    expect(placed?.tokens[0]).toMatchObject({ col: 7, row: 6 });
    expect(placed?.effectAreas[0]).toMatchObject({ x: 9, y: 7.5, facing: 0 });
  });

  it('the origin of an area counts when the group is pushed back inside by the edge', () => {
    const atEdge = biaCone({ kind: 'circle', x: 19, y: 6, reach: 4 });
    const placed = pastePlacement(copiedOf([], [], [atEdge]), cell(30, 6), SCENE);
    expect(placed?.effectAreas[0]).toMatchObject({ x: 20 });
  });

  it('a group whose areas spread wider than the scene cannot be pasted', () => {
    const far = [
      biaCone({ kind: 'circle', x: 0, y: 2, reach: 1 }),
      biaCone({ kind: 'circle', x: 20, y: 2, reach: 1 }),
    ];
    const narrow = { widthCells: 10, heightCells: 12 };
    expect(pastePlacement(copiedOf([], [], far), cell(5, 5), narrow)).toBeNull();
  });
});

describe('copiedOf, the openings', () => {
  it('a copy of Lyra keeps her field of view and the beam of her lantern', () => {
    const light = { bright: 4, dim: 0, color: null, angle: 60 };
    const [copy] = copiedOf([lyra({ sightAngle: 90, light })], []).tokens;

    expect([copy?.sightAngle, copy?.light?.angle]).toEqual([90, 60]);
  });
});
